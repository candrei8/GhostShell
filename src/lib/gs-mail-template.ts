// Embedded gs-mail scripts for swarm orchestration.
// These are written to each swarm's bin/ directory at launch time.
// v2: sequence numbers, delivery receipts (acks), dead-letter queue, batch-aware check

export const GS_MAIL_CJS = `#!/usr/bin/env node
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var SCRIPT_DIR = __dirname;
var GS_ROOT = path.dirname(SCRIPT_DIR);
var INBOX_DIR = path.join(GS_ROOT, 'inbox');
var NUDGE_DIR = path.join(GS_ROOT, 'nudges');
var ACKS_DIR = path.join(GS_ROOT, 'acks');
var DLQ_DIR = path.join(INBOX_DIR, 'dead-letter');
var SEQ_FILE = path.join(SCRIPT_DIR, 'mail-seq.json');
var AGENTS_FILE = path.join(GS_ROOT, 'agents.json');

function genId() {
  return Date.now().toString() + '-' + crypto.randomBytes(4).toString('hex');
}

function parseArgs(argv) {
  var args = {};
  for (var i = 0; i < argv.length; i++) {
    var current = argv[i];
    if (!current.startsWith('--')) continue;
    var key = current.slice(2);
    var value = argv[i + 1];
    if (value && !value.startsWith('--')) {
      args[key] = value;
      i += 1;
    } else {
      args[key] = 'true';
    }
  }
  return args;
}

function readAgents() {
  if (!fs.existsSync(AGENTS_FILE)) return [];
  try {
    var raw = fs.readFileSync(AGENTS_FILE, 'utf8');
    var parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : (parsed && parsed.agents || []);
  } catch (e) {
    return [];
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value) + '\\n', 'utf8');
}

// ─── Sequence Number Management ────────────────────────────

function readSeqFile() {
  if (!fs.existsSync(SEQ_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(SEQ_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

function nextSeq(target) {
  var seqs = readSeqFile();
  var current = seqs[target] || 0;
  seqs[target] = current + 1;
  fs.writeFileSync(SEQ_FILE, JSON.stringify(seqs) + '\\n', 'utf8');
  return current + 1;
}

// ─── Send Command ──────────────────────────────────────────

function sendCommand(argv) {
  var args = parseArgs(argv);
  var to = args.to || '';
  var body = args.body || '';
  var msgType = args.type || 'message';
  var metaRaw = args.meta || '';

  if (!to || !body) {
    console.error('Usage: gs-mail send --to <agent|@all|@operator> [--type ...] --body "message" [--meta JSON]');
    process.exit(1);
  }

  var validTypes = ['message', 'status', 'escalation', 'worker_done', 'assignment', 'review_request', 'review_complete', 'review_feedback', 'heartbeat', 'interview', 'interview_response'];
  if (!validTypes.includes(msgType)) {
    console.error('Invalid message type: ' + msgType + '. Valid: ' + validTypes.join(', '));
    process.exit(1);
  }

  var meta = undefined;
  if (metaRaw) {
    try { meta = JSON.parse(metaRaw); } catch (e) { console.error('Invalid --meta JSON: ' + metaRaw); process.exit(1); }
  }

  var msgId = genId();
  var timestamp = Math.floor(Date.now() / 1000).toString();
  var from = process.env.SWARM_AGENT_NAME || 'unknown';
  var payloadTo = to === '@all' ? '@all' : to;

  var sendTo = function(target) {
    // Sanitize target to prevent path traversal
    var safeTarget = path.basename(target).replace(/[\\\\/:*?"<>|.]/g, '_');
    if (!safeTarget || safeTarget === '.' || safeTarget === '..') {
      console.error('Invalid target: ' + target);
      process.exit(1);
    }
    var targetInbox = path.join(INBOX_DIR, safeTarget);
    fs.mkdirSync(targetInbox, { recursive: true });
    fs.mkdirSync(NUDGE_DIR, { recursive: true });

    var seq = nextSeq(safeTarget);

    var payload = {
      id: msgId,
      seq: seq,
      from: from,
      to: payloadTo,
      body: body,
      type: msgType,
      timestamp: timestamp,
    };
    if (meta) payload.meta = meta;

    writeJson(path.join(targetInbox, msgId + '.json'), payload);

    fs.writeFileSync(path.join(NUDGE_DIR, safeTarget + '.txt'), 'Message from ' + from + '\\n', 'utf8');
  };

  if (to === '@all') {
    var agents = readAgents();
    for (var i = 0; i < agents.length; i++) {
      var agent = agents[i];
      if (agent && typeof agent.label === 'string' && agent.label.length > 0) {
        sendTo(agent.label);
      }
    }
  } else {
    sendTo(to);
  }

  console.log('Sent to ' + to);
}

// ─── Check Command (with batch delivery + acks) ──────────

function checkCommand(argv) {
  var inject = argv.includes('--inject');
  var agentName = process.env.SWARM_AGENT_NAME || '';

  if (!agentName) {
    console.error('SWARM_AGENT_NAME not set');
    process.exit(1);
  }

  var agentInbox = path.join(INBOX_DIR, agentName);
  if (!fs.existsSync(agentInbox) || !fs.statSync(agentInbox).isDirectory()) {
    if (!inject) console.log('No inbox found for ' + agentName);
    process.exit(0);
  }

  var messageFiles = fs.readdirSync(agentInbox)
    .filter(function(fileName) { return fileName.endsWith('.json'); });

  // Load messages and sort by sequence number for correct ordering
  var messages = [];
  for (var i = 0; i < messageFiles.length; i++) {
    var fullPath = path.join(agentInbox, messageFiles[i]);
    try {
      var raw = fs.readFileSync(fullPath, 'utf8');
      var parsed = JSON.parse(raw);
      messages.push({ fileName: messageFiles[i], path: fullPath, data: parsed });
    } catch (e) {
      if (inject) {
        try { fs.rmSync(fullPath, { force: true }); } catch (e2) {}
      }
    }
  }

  // Sort by sequence number (ascending), fallback to timestamp
  messages.sort(function(a, b) {
    var seqA = typeof a.data.seq === 'number' ? a.data.seq : 0;
    var seqB = typeof b.data.seq === 'number' ? b.data.seq : 0;
    if (seqA !== seqB) return seqA - seqB;
    return (a.data.timestamp || '0').localeCompare(b.data.timestamp || '0');
  });

  if (inject) {
    console.log('\\n--- GhostSwarm Inbox (' + messages.length + ' message' + (messages.length !== 1 ? 's' : '') + ') ---');
  }

  if (messages.length === 0 && !inject) {
    console.log('No messages');
    process.exit(0);
  }

  // Batch: collect all ack IDs for a single ack write
  var ackIds = [];

  for (var j = 0; j < messages.length; j++) {
    var msg = messages[j];
    var from = typeof msg.data.from === 'string' ? msg.data.from : 'unknown';
    var body = typeof msg.data.body === 'string' ? msg.data.body : '';
    var type = typeof msg.data.type === 'string' ? msg.data.type : 'message';
    var timestamp = typeof msg.data.timestamp === 'string' ? msg.data.timestamp : '';
    var seq = typeof msg.data.seq === 'number' ? msg.data.seq : '?';

    if (inject) {
      console.log('[#' + seq + '] From: ' + from + ' | Type: ' + type + ' | Time: ' + timestamp);
      console.log(body);
      console.log('');
      try { fs.rmSync(msg.path, { force: true }); } catch (e) {}
      ackIds.push(msg.data.id || msg.fileName.replace('.json', ''));
    } else {
      console.log('[#' + seq + '] From: ' + from + ' | Type: ' + type);
      console.log(body);
      console.log('');
    }
  }

  // Write delivery receipts (acks) as a single batch file
  if (inject && ackIds.length > 0) {
    try {
      fs.mkdirSync(ACKS_DIR, { recursive: true });
      var ackPayload = {
        agent: agentName,
        messageIds: ackIds,
        count: ackIds.length,
        ackedAt: Date.now(),
      };
      var ackFile = path.join(ACKS_DIR, agentName + '-' + Date.now() + '.json');
      fs.writeFileSync(ackFile, JSON.stringify(ackPayload) + '\\n', 'utf8');
    } catch (e) {
      // Non-critical: ack write failure doesn't block message delivery
    }
  }

  if (inject) {
    console.log('--- End Inbox (' + ackIds.length + ' delivered) ---');
  }
}

// ─── Dead-Letter Queue Commands ───────────────────────────

function dlqCommand(argv) {
  var sub = argv[0] || 'list';

  if (sub === 'list') {
    if (!fs.existsSync(DLQ_DIR)) {
      console.log('Dead-letter queue is empty');
      return;
    }
    var agents = fs.readdirSync(DLQ_DIR).filter(function(d) {
      return fs.statSync(path.join(DLQ_DIR, d)).isDirectory();
    });
    var total = 0;
    for (var i = 0; i < agents.length; i++) {
      var agentDlq = path.join(DLQ_DIR, agents[i]);
      var files = fs.readdirSync(agentDlq).filter(function(f) { return f.endsWith('.json'); });
      if (files.length > 0) {
        console.log(agents[i] + ': ' + files.length + ' dead letter(s)');
        total += files.length;
      }
    }
    if (total === 0) console.log('Dead-letter queue is empty');
    else console.log('Total: ' + total + ' dead letter(s)');
  } else if (sub === 'retry') {
    // Move all dead-letter messages back to inbox for retry
    if (!fs.existsSync(DLQ_DIR)) {
      console.log('Nothing to retry');
      return;
    }
    var retried = 0;
    var dlqAgents = fs.readdirSync(DLQ_DIR).filter(function(d) {
      return fs.statSync(path.join(DLQ_DIR, d)).isDirectory();
    });
    for (var k = 0; k < dlqAgents.length; k++) {
      var srcDir = path.join(DLQ_DIR, dlqAgents[k]);
      var destDir = path.join(INBOX_DIR, dlqAgents[k]);
      fs.mkdirSync(destDir, { recursive: true });
      var dlqFiles = fs.readdirSync(srcDir).filter(function(f) { return f.endsWith('.json'); });
      for (var m = 0; m < dlqFiles.length; m++) {
        try {
          fs.renameSync(path.join(srcDir, dlqFiles[m]), path.join(destDir, dlqFiles[m]));
          retried++;
        } catch (e) {
          console.error('Failed to retry: ' + dlqFiles[m]);
        }
      }
    }
    console.log('Retried ' + retried + ' message(s)');
  } else if (sub === 'purge') {
    if (!fs.existsSync(DLQ_DIR)) {
      console.log('Nothing to purge');
      return;
    }
    fs.rmSync(DLQ_DIR, { recursive: true, force: true });
    console.log('Dead-letter queue purged');
  } else {
    console.error('Usage: gs-mail dead-letter [list|retry|purge]');
    process.exit(1);
  }
}

// ─── Status Command ───────────────────────────────────────

function statusCommand() {
  // Show delivery stats: pending messages, acks, dead-letter counts
  var stats = { pending: {}, acks: 0, deadLetters: 0, totalDelivered: 0 };

  // Count pending messages per agent
  if (fs.existsSync(INBOX_DIR)) {
    var inboxDirs = fs.readdirSync(INBOX_DIR).filter(function(d) {
      var fullP = path.join(INBOX_DIR, d);
      return fs.statSync(fullP).isDirectory() && d !== 'dead-letter';
    });
    for (var i = 0; i < inboxDirs.length; i++) {
      var agentDir = path.join(INBOX_DIR, inboxDirs[i]);
      var pending = fs.readdirSync(agentDir).filter(function(f) { return f.endsWith('.json'); }).length;
      if (pending > 0) stats.pending[inboxDirs[i]] = pending;
    }
  }

  // Count acks (delivery receipts)
  if (fs.existsSync(ACKS_DIR)) {
    var ackFiles = fs.readdirSync(ACKS_DIR).filter(function(f) { return f.endsWith('.json'); });
    for (var j = 0; j < ackFiles.length; j++) {
      try {
        var ackData = JSON.parse(fs.readFileSync(path.join(ACKS_DIR, ackFiles[j]), 'utf8'));
        stats.totalDelivered += ackData.count || 0;
      } catch (e) {}
    }
    stats.acks = ackFiles.length;
  }

  // Count dead letters
  if (fs.existsSync(DLQ_DIR)) {
    var dlqAgents = fs.readdirSync(DLQ_DIR).filter(function(d) {
      return fs.statSync(path.join(DLQ_DIR, d)).isDirectory();
    });
    for (var k = 0; k < dlqAgents.length; k++) {
      stats.deadLetters += fs.readdirSync(path.join(DLQ_DIR, dlqAgents[k])).filter(function(f) { return f.endsWith('.json'); }).length;
    }
  }

  // Sequence numbers
  var seqs = readSeqFile();

  console.log('=== gs-mail status ===');
  var pendingKeys = Object.keys(stats.pending);
  if (pendingKeys.length > 0) {
    console.log('Pending messages:');
    for (var p = 0; p < pendingKeys.length; p++) {
      console.log('  ' + pendingKeys[p] + ': ' + stats.pending[pendingKeys[p]]);
    }
  } else {
    console.log('Pending messages: 0');
  }
  console.log('Total delivered (acked): ' + stats.totalDelivered);
  console.log('Ack batches: ' + stats.acks);
  console.log('Dead letters: ' + stats.deadLetters);
  var seqKeys = Object.keys(seqs);
  if (seqKeys.length > 0) {
    console.log('Sequence counters:');
    for (var s = 0; s < seqKeys.length; s++) {
      console.log('  ' + seqKeys[s] + ': ' + seqs[seqKeys[s]]);
    }
  }
  console.log('JSON: ' + JSON.stringify(stats));
}

// ─── Agents Command ───────────────────────────────────────

function agentsCommand() {
  if (!fs.existsSync(AGENTS_FILE)) {
    console.error('No agents registered');
    process.exit(1);
  }
  process.stdout.write(fs.readFileSync(AGENTS_FILE, 'utf8'));
}

// ─── Main ─────────────────────────────────────────────────

var command = process.argv[2] || '';
var argv = process.argv.slice(3);

switch (command) {
  case 'send':
    sendCommand(argv);
    break;
  case 'check':
    checkCommand(argv);
    break;
  case 'agents':
    agentsCommand();
    break;
  case 'dead-letter':
    dlqCommand(argv);
    break;
  case 'status':
    statusCommand();
    break;
  default:
    console.error("gs-mail: unknown command '" + command + "'");
    console.error('Commands: send, check, agents, dead-letter, status');
    process.exit(1);
}
`

export const GS_MAIL_SH = `#!/bin/sh
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
node "$SCRIPT_DIR/gs-mail.cjs" "$@"
`

export const GS_MAIL_CMD = `@echo off
node "%~dp0gs-mail.cjs" %*
`
