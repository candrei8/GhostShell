// Embedded bs-task scripts for swarm task management.
// These are written to each swarm's bin/ directory at launch time.

export const BS_TASK_CJS = `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCRIPT_DIR = __dirname;
const BS_ROOT = path.dirname(SCRIPT_DIR);
const TASK_FILE = path.join(SCRIPT_DIR, 'task-graph.json');
const LOCK_FILE = path.join(SCRIPT_DIR, 'file-locks.json');
const INBOX_DIR = path.join(BS_ROOT, 'inbox');
const AGENTS_FILE = path.join(BS_ROOT, 'agents.json');

// --- Shared utility functions ---

function genId() {
  return Date.now().toString() + '-' + crypto.randomBytes(4).toString('hex');
}

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
  const tmp = filePath + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, data, 'utf8');
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      fs.renameSync(tmp, filePath);
      return;
    } catch (err) {
      if (attempt < 2 && err.code === 'EPERM') {
        // Windows file lock retry
        var delay = [50, 100, 200][attempt];
        var start = Date.now();
        while (Date.now() - start < delay) { /* busy wait */ }
      } else {
        try { fs.unlinkSync(tmp); } catch (e) {}
        throw err;
      }
    }
  }
}

function readTaskGraph() {
  if (!fs.existsSync(TASK_FILE)) return { tasks: {}, dependencies: [] };
  try {
    var raw = fs.readFileSync(TASK_FILE, 'utf8');
    var parsed = JSON.parse(raw);
    return {
      tasks: parsed.tasks || {},
      dependencies: Array.isArray(parsed.dependencies) ? parsed.dependencies : []
    };
  } catch (e) {
    return { tasks: {}, dependencies: [] };
  }
}

function writeTaskGraph(graph) {
  var data = JSON.stringify(graph, null, 2) + '\\n';
  atomicWriteSync(TASK_FILE, data);
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
  } catch (e) {
    return { locks: {}, lockHistory: [] };
  }
}

function writeLockFile(registry) {
  var data = JSON.stringify(registry, null, 2) + '\\n';
  atomicWriteSync(LOCK_FILE, data);
}

function detectCycles(tasks) {
  var errors = [];
  var visited = {};
  var inStack = {};

  function dfs(taskId, chain) {
    if (inStack[taskId]) {
      errors.push('Circular dependency detected: ' + chain.concat(taskId).join(' -> '));
      return;
    }
    if (visited[taskId]) return;
    visited[taskId] = true;
    inStack[taskId] = true;
    var task = tasks[taskId];
    if (task && Array.isArray(task.dependsOn)) {
      for (var i = 0; i < task.dependsOn.length; i++) {
        dfs(task.dependsOn[i], chain.concat(taskId));
      }
    }
    inStack[taskId] = false;
  }

  var taskIds = Object.keys(tasks);
  for (var i = 0; i < taskIds.length; i++) {
    dfs(taskIds[i], []);
  }
  return errors;
}

function checkDuplicateFiles(tasks) {
  var errors = [];
  var fileMap = {};
  var taskIds = Object.keys(tasks);
  for (var i = 0; i < taskIds.length; i++) {
    var taskId = taskIds[i];
    var task = tasks[taskId];
    if (!Array.isArray(task.ownedFiles)) continue;
    for (var j = 0; j < task.ownedFiles.length; j++) {
      var f = task.ownedFiles[j];
      if (fileMap[f] && fileMap[f] !== taskId) {
        errors.push('File "' + f + '" is owned by both task ' + fileMap[f] + ' and task ' + taskId);
      } else {
        fileMap[f] = taskId;
      }
    }
  }
  return errors;
}

function readAgents() {
  if (!fs.existsSync(AGENTS_FILE)) return [];
  try {
    var raw = fs.readFileSync(AGENTS_FILE, 'utf8');
    var parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function sendBsMail(to, type, body, meta) {
  var NUDGE_DIR = path.join(BS_ROOT, 'nudges');
  var msgId = genId();
  var timestamp = Math.floor(Date.now() / 1000).toString();
  var from = process.env.SWARM_AGENT_NAME || 'unknown';

  var targetInbox = path.join(INBOX_DIR, to);
  fs.mkdirSync(targetInbox, { recursive: true });
  fs.mkdirSync(NUDGE_DIR, { recursive: true });

  var payload = {
    id: msgId,
    from: from,
    to: to,
    body: body,
    type: type,
    timestamp: timestamp
  };
  if (meta !== undefined && meta !== null) {
    payload.meta = meta;
  }

  fs.writeFileSync(path.join(targetInbox, msgId + '.json'), JSON.stringify(payload) + '\\n', 'utf8');
  fs.writeFileSync(path.join(NUDGE_DIR, to + '.txt'), 'Message from ' + from + '\\n', 'utf8');
}

function releaseLocks(taskId) {
  var registry = readLockFile();
  var locks = registry.locks || {};
  var history = registry.lockHistory || [];
  var lockKeys = Object.keys(locks);
  for (var i = 0; i < lockKeys.length; i++) {
    var key = lockKeys[i];
    if (locks[key] && locks[key].taskId === taskId) {
      history.push({
        file: key,
        taskId: taskId,
        owner: locks[key].owner || '',
        releasedAt: Date.now()
      });
      delete locks[key];
    }
  }
  // Cap lockHistory at 100 entries
  if (history.length > 100) {
    history = history.slice(history.length - 100);
  }
  registry.locks = locks;
  registry.lockHistory = history;
  writeLockFile(registry);
}

function padRight(str, len) {
  str = String(str);
  while (str.length < len) str += ' ';
  return str;
}

function printTaskTable(taskList) {
  console.log(padRight('ID', 9) + padRight('STATUS', 10) + padRight('OWNER', 14) + 'TITLE');
  for (var i = 0; i < taskList.length; i++) {
    var t = taskList[i];
    console.log(
      padRight(t.id, 9) +
      padRight(t.status, 10) +
      padRight(t.owner || '', 14) +
      (t.title || '')
    );
  }
  console.log('JSON: ' + JSON.stringify(taskList));
}

// --- Commands ---

function createCommand(argv) {
  var args = parseArgs(argv);
  var id = args.id || '';
  var title = args.title || '';

  if (!id || !title) {
    console.error('Usage: bs-task create --id <id> --title <title> [--owner <agent>] [--files f1,f2] [--depends t1,t2] [--description "..."] [--criteria "c1;c2;c3"]');
    process.exit(1);
  }

  var graph = readTaskGraph();

  if (graph.tasks[id]) {
    console.error('Task with id "' + id + '" already exists');
    process.exit(1);
  }

  var files = args.files ? args.files.split(',').map(function(s) { return s.trim(); }).filter(Boolean) : [];
  var depends = args.depends ? args.depends.split(',').map(function(s) { return s.trim(); }).filter(Boolean) : [];
  var criteria = args.criteria ? args.criteria.split(';').map(function(s) { return s.trim(); }).filter(Boolean) : [];

  var task = {
    id: id,
    title: title,
    owner: args.owner || '',
    ownedFiles: files,
    dependsOn: depends,
    status: 'open',
    description: args.description || '',
    acceptanceCriteria: criteria,
    reviewer: '',
    verdict: '',
    createdAt: Date.now(),
    completedAt: null
  };

  graph.tasks[id] = task;

  // Add dependencies
  for (var i = 0; i < depends.length; i++) {
    graph.dependencies.push({ from: id, to: depends[i] });
  }

  // Validate cycles
  var cycleErrors = detectCycles(graph.tasks);
  if (cycleErrors.length > 0) {
    for (var i = 0; i < cycleErrors.length; i++) {
      console.error(cycleErrors[i]);
    }
    process.exit(1);
  }

  // Validate duplicate files
  var dupErrors = checkDuplicateFiles(graph.tasks);
  if (dupErrors.length > 0) {
    for (var i = 0; i < dupErrors.length; i++) {
      console.error(dupErrors[i]);
    }
    process.exit(1);
  }

  writeTaskGraph(graph);
  console.log('Created task ' + id + ': ' + title);
}

function updateCommand(argv) {
  // First positional arg is taskId
  var taskId = '';
  var rest = [];
  for (var i = 0; i < argv.length; i++) {
    if (!taskId && !argv[i].startsWith('--')) {
      taskId = argv[i];
    } else {
      rest.push(argv[i]);
    }
  }

  if (!taskId) {
    console.error('Usage: bs-task update <taskId> --status <status> [--owner <agent>] [--reviewer <agent>] [--verdict approved|changes_requested|approved_with_notes]');
    process.exit(1);
  }

  var args = parseArgs(rest);
  var graph = readTaskGraph();

  if (!graph.tasks[taskId]) {
    console.error('Task "' + taskId + '" not found');
    process.exit(1);
  }

  var task = graph.tasks[taskId];
  var validStatuses = ['open', 'assigned', 'planning', 'building', 'review', 'done'];
  var validVerdicts = ['approved', 'changes_requested', 'approved_with_notes'];

  if (args.status) {
    if (validStatuses.indexOf(args.status) === -1) {
      console.error('Invalid status: ' + args.status + '. Valid: ' + validStatuses.join(', '));
      process.exit(1);
    }
    task.status = args.status;
  }

  if (args.owner) {
    task.owner = args.owner;
  }

  if (args.reviewer) {
    task.reviewer = args.reviewer;
  }

  if (args.verdict) {
    if (validVerdicts.indexOf(args.verdict) === -1) {
      console.error('Invalid verdict: ' + args.verdict + '. Valid: ' + validVerdicts.join(', '));
      process.exit(1);
    }
    task.verdict = args.verdict;
  }

  var newStatus = args.status || '';

  // Auto-action on status -> review
  if (newStatus === 'review') {
    var agents = readAgents();
    var coord = null;
    for (var i = 0; i < agents.length; i++) {
      if (agents[i] && agents[i].role === 'coordinator') {
        coord = agents[i];
        break;
      }
    }
    if (coord) {
      sendBsMail(
        coord.label,
        'review_request',
        'Task ' + taskId + ' ready for review. Owner: ' + task.owner + '. Files: ' + (task.ownedFiles || []).join(', '),
        JSON.stringify({ taskId: taskId, owner: task.owner, files: task.ownedFiles })
      );
    }
  }

  // Auto-action on status -> done
  if (newStatus === 'done') {
    task.completedAt = Date.now();
    releaseLocks(taskId);
  }

  graph.tasks[taskId] = task;
  writeTaskGraph(graph);
  console.log('Updated task ' + taskId + ': status=' + task.status);
}

function listCommand(argv) {
  var args = parseArgs(argv);
  var graph = readTaskGraph();
  var taskIds = Object.keys(graph.tasks);
  var filtered = [];

  for (var i = 0; i < taskIds.length; i++) {
    var t = graph.tasks[taskIds[i]];
    if (args.status && t.status !== args.status) continue;
    if (args.owner && t.owner !== args.owner) continue;
    filtered.push(t);
  }

  if (filtered.length === 0) {
    console.log('No tasks found');
    return;
  }

  printTaskTable(filtered);
}

function mineCommand() {
  var agentName = process.env.SWARM_AGENT_NAME || '';
  if (!agentName) {
    console.error('SWARM_AGENT_NAME not set');
    process.exit(1);
  }

  var graph = readTaskGraph();
  var taskIds = Object.keys(graph.tasks);
  var mine = [];

  for (var i = 0; i < taskIds.length; i++) {
    var t = graph.tasks[taskIds[i]];
    if (t.owner === agentName) {
      mine.push(t);
    }
  }

  if (mine.length === 0) {
    console.log('No tasks found');
    return;
  }

  printTaskTable(mine);
}

function readyCommand() {
  var graph = readTaskGraph();
  var taskIds = Object.keys(graph.tasks);
  var readyTasks = [];

  for (var i = 0; i < taskIds.length; i++) {
    var t = graph.tasks[taskIds[i]];
    if (t.status !== 'open') continue;

    var allDepsDone = true;
    if (Array.isArray(t.dependsOn)) {
      for (var j = 0; j < t.dependsOn.length; j++) {
        var dep = graph.tasks[t.dependsOn[j]];
        if (!dep || dep.status !== 'done') {
          allDepsDone = false;
          break;
        }
      }
    }

    if (allDepsDone) {
      readyTasks.push(t);
    }
  }

  if (readyTasks.length === 0) {
    console.log('No tasks found');
    return;
  }

  printTaskTable(readyTasks);
}

function getCommand(argv) {
  // First positional arg is taskId
  var taskId = '';
  for (var i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) {
      taskId = argv[i];
      break;
    }
  }

  if (!taskId) {
    console.error('Usage: bs-task get <taskId>');
    process.exit(1);
  }

  var graph = readTaskGraph();
  if (!graph.tasks[taskId]) {
    console.error('Task "' + taskId + '" not found');
    process.exit(1);
  }

  console.log(JSON.stringify(graph.tasks[taskId], null, 2));
}

function batchCreateCommand() {
  var input = '';
  try {
    input = fs.readFileSync('/dev/stdin', 'utf8');
  } catch (e) {
    // On Windows, /dev/stdin may not work; try fd 0
    try {
      input = fs.readFileSync(0, 'utf8');
    } catch (e2) {
      console.error('Failed to read stdin');
      process.exit(1);
    }
  }

  var taskArray;
  try {
    taskArray = JSON.parse(input);
  } catch (e) {
    console.error('Invalid JSON on stdin');
    process.exit(1);
  }

  if (!Array.isArray(taskArray)) {
    console.error('Expected a JSON array of task objects');
    process.exit(1);
  }

  var graph = readTaskGraph();

  for (var i = 0; i < taskArray.length; i++) {
    var item = taskArray[i];
    if (!item.id || !item.title) {
      console.error('Task at index ' + i + ' is missing required id or title');
      process.exit(1);
    }
    if (graph.tasks[item.id]) {
      console.error('Task with id "' + item.id + '" already exists');
      process.exit(1);
    }

    var files = Array.isArray(item.ownedFiles) ? item.ownedFiles : (item.files ? String(item.files).split(',').map(function(s) { return s.trim(); }).filter(Boolean) : []);
    var depends = Array.isArray(item.dependsOn) ? item.dependsOn : (item.depends ? String(item.depends).split(',').map(function(s) { return s.trim(); }).filter(Boolean) : []);
    var criteria = Array.isArray(item.acceptanceCriteria) ? item.acceptanceCriteria : [];

    var task = {
      id: item.id,
      title: item.title,
      owner: item.owner || '',
      ownedFiles: files,
      dependsOn: depends,
      status: item.status || 'open',
      description: item.description || '',
      acceptanceCriteria: criteria,
      reviewer: item.reviewer || '',
      verdict: item.verdict || '',
      createdAt: Date.now(),
      completedAt: null
    };

    graph.tasks[item.id] = task;

    for (var j = 0; j < depends.length; j++) {
      graph.dependencies.push({ from: item.id, to: depends[j] });
    }
  }

  // Validate cycles
  var cycleErrors = detectCycles(graph.tasks);
  if (cycleErrors.length > 0) {
    for (var i = 0; i < cycleErrors.length; i++) {
      console.error(cycleErrors[i]);
    }
    process.exit(1);
  }

  // Validate duplicate files
  var dupErrors = checkDuplicateFiles(graph.tasks);
  if (dupErrors.length > 0) {
    for (var i = 0; i < dupErrors.length; i++) {
      console.error(dupErrors[i]);
    }
    process.exit(1);
  }

  writeTaskGraph(graph);
  console.log('Created ' + taskArray.length + ' tasks');
}

// --- Main ---

var command = process.argv[2] || '';
var argv = process.argv.slice(3);

switch (command) {
  case 'create': createCommand(argv); break;
  case 'update': updateCommand(argv); break;
  case 'list': listCommand(argv); break;
  case 'mine': mineCommand(); break;
  case 'ready': readyCommand(); break;
  case 'get': getCommand(argv); break;
  case 'batch-create': batchCreateCommand(); break;
  default:
    console.error("bs-task: unknown command '" + command + "'");
    console.error('Commands: create, update, list, mine, ready, get, batch-create');
    process.exit(1);
}
`

export const BS_TASK_SH = `#!/bin/sh
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
node "$SCRIPT_DIR/bs-task.cjs" "$@"
`

export const BS_TASK_CMD = `@echo off
node "%~dp0bs-task.cjs" %*
`
