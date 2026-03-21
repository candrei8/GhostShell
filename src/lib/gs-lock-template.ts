// Embedded bs-lock scripts for swarm file lock management.
// These are written to each swarm's bin/ directory at launch time.

export const BS_LOCK_CJS = `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const SCRIPT_DIR = __dirname;
const BS_ROOT = path.dirname(SCRIPT_DIR);
const LOCK_FILE = path.join(SCRIPT_DIR, 'file-locks.json');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const current = argv[i];
    if (!current.startsWith('--')) continue;
    const key = current.slice(2);
    const value = argv[i + 1];
    if (value && !value.startsWith('--')) {
      args[key] = value;
      i += 1;
    } else {
      args[key] = 'true';
    }
  }
  return args;
}

function atomicWriteSync(filePath, data) {
  var tmp = filePath + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, data, 'utf8');
  for (var attempt = 0; attempt < 3; attempt++) {
    try {
      fs.renameSync(tmp, filePath);
      return;
    } catch (err) {
      if (attempt < 2 && err.code === 'EPERM') {
        var delay = [50, 100, 200][attempt];
        var start = Date.now();
        while (Date.now() - start < delay) {}
      } else {
        try { fs.unlinkSync(tmp); } catch (e) {}
        throw err;
      }
    }
  }
}

function readLockFile() {
  if (!fs.existsSync(LOCK_FILE)) return { locks: {}, lockHistory: [] };
  try {
    var raw = fs.readFileSync(LOCK_FILE, 'utf8');
    var parsed = JSON.parse(raw);
    return {
      locks: parsed.locks || {},
      lockHistory: Array.isArray(parsed.lockHistory) ? parsed.lockHistory : []
    };
  } catch (err) {
    return { locks: {}, lockHistory: [] };
  }
}

function writeLockFile(registry) {
  atomicWriteSync(LOCK_FILE, JSON.stringify(registry, null, 2) + '\\n');
}

function padRight(str, len) {
  while (str.length < len) str += ' ';
  return str;
}

function formatDate(ts) {
  var d = new Date(ts);
  var yyyy = d.getFullYear();
  var mm = String(d.getMonth() + 1).padStart(2, '0');
  var dd = String(d.getDate()).padStart(2, '0');
  var hh = String(d.getHours()).padStart(2, '0');
  var mi = String(d.getMinutes()).padStart(2, '0');
  return yyyy + '-' + mm + '-' + dd + ' ' + hh + ':' + mi;
}

function acquireCommand(argv) {
  var args = parseArgs(argv);
  var taskId = args.task || '';
  var filesRaw = args.files || '';
  var agentName = args.agent || process.env.SWARM_AGENT_NAME || 'unknown';

  if (!taskId || !filesRaw) {
    console.error('Usage: bs-lock acquire --task <taskId> --files f1,f2 [--agent <agentName>]');
    process.exit(1);
  }

  var files = filesRaw.split(',').map(function(f) { return f.trim(); }).filter(Boolean);
  if (files.length === 0) {
    console.error('No files specified');
    process.exit(1);
  }

  var registry = readLockFile();
  var conflicts = [];

  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    var existing = registry.locks[file];
    if (existing && existing.taskId !== taskId) {
      conflicts.push({ file: file, agentName: existing.agentName, taskId: existing.taskId });
    }
  }

  if (conflicts.length > 0) {
    for (var c = 0; c < conflicts.length; c++) {
      console.error('CONFLICT: ' + conflicts[c].file + ' locked by ' + conflicts[c].agentName + ' (task ' + conflicts[c].taskId + ')');
    }
    process.exit(1);
  }

  var now = Date.now();
  for (var j = 0; j < files.length; j++) {
    registry.locks[files[j]] = {
      taskId: taskId,
      agentName: agentName,
      acquiredAt: now,
      exclusive: true
    };
  }

  writeLockFile(registry);
  console.log('Acquired locks on ' + files.length + ' files for task ' + taskId);
}

function releaseCommand(argv) {
  var args = parseArgs(argv);
  var taskId = args.task || '';

  if (!taskId) {
    console.error('Usage: bs-lock release --task <taskId>');
    process.exit(1);
  }

  var registry = readLockFile();
  var released = [];
  var now = Date.now();

  var lockKeys = Object.keys(registry.locks);
  for (var i = 0; i < lockKeys.length; i++) {
    var file = lockKeys[i];
    var lock = registry.locks[file];
    if (lock.taskId === taskId) {
      released.push({ file: file, lock: lock });
      delete registry.locks[file];
    }
  }

  if (released.length > 0) {
    var grouped = {};
    for (var r = 0; r < released.length; r++) {
      var entry = released[r];
      var key = entry.lock.agentName + '|' + entry.lock.acquiredAt;
      if (!grouped[key]) {
        grouped[key] = {
          taskId: taskId,
          agentName: entry.lock.agentName,
          files: [],
          acquiredAt: entry.lock.acquiredAt,
          releasedAt: now
        };
      }
      grouped[key].files.push(entry.file);
    }

    var groupKeys = Object.keys(grouped);
    for (var g = 0; g < groupKeys.length; g++) {
      registry.lockHistory.push(grouped[groupKeys[g]]);
    }

    while (registry.lockHistory.length > 100) {
      registry.lockHistory.shift();
    }
  }

  writeLockFile(registry);
  console.log('Released ' + released.length + ' locks for task ' + taskId);
}

function checkCommand(argv) {
  var filePath = '';
  for (var i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) {
      filePath = argv[i];
      break;
    }
  }

  if (!filePath) {
    console.error('Usage: bs-lock check <filePath>');
    process.exit(1);
  }

  var registry = readLockFile();
  var lock = registry.locks[filePath];

  if (lock) {
    console.log('LOCKED: ' + filePath + ' -> ' + lock.agentName + ' (task ' + lock.taskId + ', since ' + formatDate(lock.acquiredAt) + ')');
  } else {
    console.log('AVAILABLE: ' + filePath);
  }
}

function printLockTable(locks) {
  var keys = Object.keys(locks);
  if (keys.length === 0) {
    console.log('No active locks');
    return;
  }

  var colFile = 4, colTask = 4, colAgent = 5;
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].length > colFile) colFile = keys[i].length;
    if (locks[keys[i]].taskId.length > colTask) colTask = locks[keys[i]].taskId.length;
    if (locks[keys[i]].agentName.length > colAgent) colAgent = locks[keys[i]].agentName.length;
  }
  colFile += 2;
  colTask += 2;
  colAgent += 2;

  console.log(padRight('FILE', colFile) + padRight('TASK', colTask) + padRight('AGENT', colAgent) + 'SINCE');
  for (var j = 0; j < keys.length; j++) {
    var file = keys[j];
    var lock = locks[file];
    console.log(padRight(file, colFile) + padRight(lock.taskId, colTask) + padRight(lock.agentName, colAgent) + formatDate(lock.acquiredAt));
  }
}

function listCommand() {
  var registry = readLockFile();
  printLockTable(registry.locks);
  console.log('JSON: ' + JSON.stringify(registry.locks));
}

function mineCommand() {
  var agentName = process.env.SWARM_AGENT_NAME || '';
  if (!agentName) {
    console.error('SWARM_AGENT_NAME not set');
    process.exit(1);
  }

  var registry = readLockFile();
  var myLocks = {};
  var keys = Object.keys(registry.locks);
  for (var i = 0; i < keys.length; i++) {
    if (registry.locks[keys[i]].agentName === agentName) {
      myLocks[keys[i]] = registry.locks[keys[i]];
    }
  }

  printLockTable(myLocks);
  console.log('JSON: ' + JSON.stringify(myLocks));
}

var command = process.argv[2] || '';
var argv = process.argv.slice(3);

switch (command) {
  case 'acquire':
    acquireCommand(argv);
    break;
  case 'release':
    releaseCommand(argv);
    break;
  case 'check':
    checkCommand(argv);
    break;
  case 'list':
    listCommand();
    break;
  case 'mine':
    mineCommand();
    break;
  default:
    console.error("bs-lock: unknown command '" + command + "'");
    console.error('Commands: acquire, release, check, list, mine');
    process.exit(1);
}
`

export const BS_LOCK_SH = `#!/bin/sh
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
node "$SCRIPT_DIR/bs-lock.cjs" "$@"
`

export const BS_LOCK_CMD = `@echo off
node "%~dp0bs-lock.cjs" %*
`
