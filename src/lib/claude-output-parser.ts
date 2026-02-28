import { ClaudeActivity, Provider, SubAgentType } from './types'

// Strip ANSI escape sequences
const ANSI_STRIP = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?\x07|\x1b\(B/g

// Tool call patterns from Claude Code CLI output
const TOOL_READ = /\bRead\s*\(\s*file_path:\s*"([^"]+)"/
const TOOL_WRITE = /\bWrite\s*\(\s*file_path:\s*"([^"]+)"/
const TOOL_EDIT = /\bEdit\s*\(\s*file_path:\s*"([^"]+)"/
const TOOL_MULTI_EDIT = /\bMultiEdit\s*\(\s*file_path:\s*"([^"]+)"/
const TOOL_BASH = /\bBash\s*\(\s*command:\s*"([^"]+)"/
const TOOL_GLOB = /\bGlob\s*\(\s*pattern:\s*"([^"]+)"/
const TOOL_GREP = /\bGrep\s*\(\s*pattern:\s*"([^"]+)"/
const TOOL_WEB_SEARCH = /\bWebSearch\s*\(\s*query:\s*"([^"]+)"/
const TOOL_WEB_FETCH = /\bWebFetch\s*\(\s*url:\s*"([^"]+)"/

// Task/SubAgent patterns - Claude Code's Task tool
const TOOL_TASK = /\bTask\s*\(\s*(?:description:\s*"([^"]*)")?/
const TASK_SUBAGENT_TYPE = /subagent_type:\s*"([^"]+)"/
const TASK_DESCRIPTION = /description:\s*"([^"]+)"/
const TASK_PROMPT = /prompt:\s*"([^"]*(?:\\.[^"]*)*?)"/

// TaskCreate/TaskUpdate patterns
const TOOL_TASK_CREATE = /\bTaskCreate\s*\(\s*subject:\s*"([^"]+)"/
const TOOL_TASK_UPDATE = /\bTaskUpdate\s*\(\s*taskId:\s*"([^"]+)".*?status:\s*"([^"]+)"/

// Alternative: Claude Code uses simpler display format
const TOOL_READ_ALT = /(?:📖|Reading)\s+([^\s\n]+)/
const TOOL_WRITE_ALT = /(?:✏️|Writing)\s+([^\s\n]+)/
const TOOL_EDIT_ALT = /(?:✏️|Editing)\s+([^\s\n]+)/
const TOOL_BASH_ALT = /(?:🖥️|Running)\s+`?([^`\n]+)`?/
const TOOL_SEARCH_ALT = /(?:🔍|Searching)\s+(.+)/

// Activity detection
const SPINNER_CHARS = /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/
const PLANNING_PATTERN = /plan mode/i
const PERMISSION_PATTERN = /Allow|Deny|approve|permission/i

// Context/cost patterns from Claude Code statusline
const CONTEXT_PATTERN = /(\d+(?:\.\d+)?)[%]\s*context/i
const TOKENS_PATTERN = /(\d+(?:,\d+)*(?:\.\d+)?[kKmM]?)\s*tokens?/i
const COST_PATTERN = /\$(\d+(?:\.\d+)?)/
const TURN_PATTERN = /Turn\s+(\d+)/i

// Subagent completion patterns
const SUBAGENT_COMPLETE = /Task\s+(?:completed|done|finished)/i
const SUBAGENT_RESULT = /agent.*?returned|subagent.*?result/i

export interface ParseResult {
  activity: ClaudeActivity
  tool?: string
  detail?: string
  fileTouch?: { path: string; operation: 'read' | 'write' | 'edit' }
  subAgent?: {
    type: SubAgentType
    description: string
    model?: string
  }
  subAgentCompleted?: boolean
  taskAction?: {
    action: 'create' | 'update'
    subject?: string
    taskId?: string
    status?: string
    activeForm?: string
  }
  contextUpdate?: {
    tokenEstimate?: number
    costEstimate?: number
    turnCount?: number
  }
}

export function stripAnsi(text: string): string {
  return text.replace(ANSI_STRIP, '')
}

function parseTokenCount(raw: string): number {
  const cleaned = raw.replace(/,/g, '')
  if (cleaned.endsWith('k') || cleaned.endsWith('K')) {
    return parseFloat(cleaned.slice(0, -1)) * 1000
  }
  if (cleaned.endsWith('m') || cleaned.endsWith('M')) {
    return parseFloat(cleaned.slice(0, -1)) * 1000000
  }
  return parseFloat(cleaned)
}

export function parseClaudeOutput(stripped: string): ParseResult[] {
  const results: ParseResult[] = []

  let match: RegExpExecArray | null

  // Check for subagent/Task tool calls FIRST (highest priority)
  match = TOOL_TASK.exec(stripped)
  if (match) {
    const typeMatch = TASK_SUBAGENT_TYPE.exec(stripped)
    const descMatch = TASK_DESCRIPTION.exec(stripped)
    const subAgentType = (typeMatch?.[1] || 'unknown') as SubAgentType
    const description = descMatch?.[1] || match[1] || 'Running task'

    results.push({
      activity: 'sub_agent',
      tool: 'Task',
      detail: `${subAgentType}: ${description}`,
      subAgent: {
        type: subAgentType,
        description,
      },
    })
  }

  // TaskCreate
  match = TOOL_TASK_CREATE.exec(stripped)
  if (match) {
    results.push({
      activity: 'task_create',
      tool: 'TaskCreate',
      detail: match[1],
      taskAction: {
        action: 'create',
        subject: match[1],
      },
    })
  }

  // TaskUpdate
  match = TOOL_TASK_UPDATE.exec(stripped)
  if (match) {
    results.push({
      activity: 'task_update',
      tool: 'TaskUpdate',
      detail: `${match[1]}: ${match[2]}`,
      taskAction: {
        action: 'update',
        taskId: match[1],
        status: match[2],
      },
    })
  }

  // Check tool calls (formal format)
  match = TOOL_READ.exec(stripped)
  if (match) {
    results.push({
      activity: 'reading',
      tool: 'Read',
      detail: match[1],
      fileTouch: { path: match[1], operation: 'read' },
    })
  }

  match = TOOL_WRITE.exec(stripped)
  if (match) {
    results.push({
      activity: 'writing',
      tool: 'Write',
      detail: match[1],
      fileTouch: { path: match[1], operation: 'write' },
    })
  }

  match = TOOL_EDIT.exec(stripped)
  if (match) {
    results.push({
      activity: 'editing',
      tool: 'Edit',
      detail: match[1],
      fileTouch: { path: match[1], operation: 'edit' },
    })
  }

  match = TOOL_MULTI_EDIT.exec(stripped)
  if (match) {
    results.push({
      activity: 'editing',
      tool: 'MultiEdit',
      detail: match[1],
      fileTouch: { path: match[1], operation: 'edit' },
    })
  }

  match = TOOL_BASH.exec(stripped)
  if (match) {
    results.push({
      activity: 'running_bash',
      tool: 'Bash',
      detail: match[1],
    })
  }

  match = TOOL_GLOB.exec(stripped)
  if (match) {
    results.push({
      activity: 'searching',
      tool: 'Glob',
      detail: match[1],
    })
  }

  match = TOOL_GREP.exec(stripped)
  if (match) {
    results.push({
      activity: 'searching',
      tool: 'Grep',
      detail: match[1],
    })
  }

  match = TOOL_WEB_SEARCH.exec(stripped)
  if (match) {
    results.push({
      activity: 'web_search',
      tool: 'WebSearch',
      detail: match[1],
    })
  }

  match = TOOL_WEB_FETCH.exec(stripped)
  if (match) {
    results.push({
      activity: 'web_fetch',
      tool: 'WebFetch',
      detail: match[1],
    })
  }

  // Check alternative display formats
  if (results.length === 0) {
    match = TOOL_READ_ALT.exec(stripped)
    if (match) {
      results.push({
        activity: 'reading',
        tool: 'Read',
        detail: match[1],
        fileTouch: { path: match[1], operation: 'read' },
      })
    }

    match = TOOL_WRITE_ALT.exec(stripped)
    if (match) {
      results.push({
        activity: 'writing',
        tool: 'Write',
        detail: match[1],
        fileTouch: { path: match[1], operation: 'write' },
      })
    }

    match = TOOL_EDIT_ALT.exec(stripped)
    if (match) {
      results.push({
        activity: 'editing',
        tool: 'Edit',
        detail: match[1],
        fileTouch: { path: match[1], operation: 'edit' },
      })
    }

    match = TOOL_BASH_ALT.exec(stripped)
    if (match) {
      results.push({
        activity: 'running_bash',
        tool: 'Bash',
        detail: match[1],
      })
    }

    match = TOOL_SEARCH_ALT.exec(stripped)
    if (match) {
      results.push({
        activity: 'searching',
        tool: 'Search',
        detail: match[1],
      })
    }
  }

  // Sub-agent completion detection
  if (SUBAGENT_COMPLETE.test(stripped) || SUBAGENT_RESULT.test(stripped)) {
    results.push({
      activity: 'sub_agent',
      subAgentCompleted: true,
    })
  }

  // Context metrics extraction
  const contextMatch = CONTEXT_PATTERN.exec(stripped)
  const tokenMatch = TOKENS_PATTERN.exec(stripped)
  const costMatch = COST_PATTERN.exec(stripped)
  const turnMatch = TURN_PATTERN.exec(stripped)

  if (contextMatch || tokenMatch || costMatch || turnMatch) {
    const contextUpdate: ParseResult['contextUpdate'] = {}
    if (tokenMatch) {
      contextUpdate.tokenEstimate = parseTokenCount(tokenMatch[1])
    }
    if (costMatch) {
      contextUpdate.costEstimate = parseFloat(costMatch[1])
    }
    if (turnMatch) {
      contextUpdate.turnCount = parseInt(turnMatch[1], 10)
    }
    // If we have context %, estimate tokens
    if (contextMatch && !tokenMatch) {
      const pct = parseFloat(contextMatch[1])
      contextUpdate.tokenEstimate = Math.round((pct / 100) * 200000)
    }
    if (Object.keys(contextUpdate).length > 0) {
      results.push({
        activity: results[0]?.activity || 'thinking',
        contextUpdate,
      })
    }
  }

  // Check for high-level activity patterns (only if no specific tool detected)
  if (results.length === 0) {
    if (PERMISSION_PATTERN.test(stripped)) {
      results.push({ activity: 'permission' })
    } else if (PLANNING_PATTERN.test(stripped)) {
      results.push({ activity: 'planning' })
    } else if (SPINNER_CHARS.test(stripped)) {
      results.push({ activity: 'thinking' })
    }
  }

  return results
}

// --- Gemini CLI tool patterns ---
const GEMINI_TOOL_READ = /\bReadFileTool\s*\(\s*(?:file_?path|path):\s*"([^"]+)"/
const GEMINI_TOOL_WRITE = /\bWriteFileTool\s*\(\s*(?:file_?path|path):\s*"([^"]+)"/
const GEMINI_TOOL_EDIT = /\bEditTool\s*\(\s*(?:file_?path|path):\s*"([^"]+)"/
const GEMINI_TOOL_SHELL = /\bShellTool\s*\(\s*command:\s*"([^"]+)"/
const GEMINI_TOOL_GREP = /\bGrepTool\s*\(\s*pattern:\s*"([^"]+)"/
const GEMINI_TOOL_GLOB = /\bGlobTool\s*\(\s*pattern:\s*"([^"]+)"/
const GEMINI_TOOL_WEB = /\bWebSearchTool\s*\(\s*query:\s*"([^"]+)"/

// Gemini alternative display patterns
const GEMINI_READ_ALT = /(?:\u2726\s*)?(?:Reading|Read)\s+([^\s\n]+)/
const GEMINI_WRITE_ALT = /(?:\u2726\s*)?(?:Writing|Wrote)\s+([^\s\n]+)/
const GEMINI_EDIT_ALT = /(?:\u2726\s*)?(?:Editing|Edited)\s+([^\s\n]+)/
const GEMINI_SHELL_ALT = /(?:\u2726\s*)?(?:Running|Ran|Executing)\s+`?([^`\n]+)`?/
const GEMINI_SEARCH_ALT = /(?:\u2726\s*)?(?:Searching|Grepping)\s+(.+)/

// Gemini thinking patterns
const GEMINI_THINKING = /\u2726|Thinking/

export function parseGeminiOutput(stripped: string): ParseResult[] {
  const results: ParseResult[] = []
  let match: RegExpExecArray | null

  // Tool calls (formal format)
  match = GEMINI_TOOL_READ.exec(stripped)
  if (match) {
    results.push({
      activity: 'reading',
      tool: 'ReadFileTool',
      detail: match[1],
      fileTouch: { path: match[1], operation: 'read' },
    })
  }

  match = GEMINI_TOOL_WRITE.exec(stripped)
  if (match) {
    results.push({
      activity: 'writing',
      tool: 'WriteFileTool',
      detail: match[1],
      fileTouch: { path: match[1], operation: 'write' },
    })
  }

  match = GEMINI_TOOL_EDIT.exec(stripped)
  if (match) {
    results.push({
      activity: 'editing',
      tool: 'EditTool',
      detail: match[1],
      fileTouch: { path: match[1], operation: 'edit' },
    })
  }

  match = GEMINI_TOOL_SHELL.exec(stripped)
  if (match) {
    results.push({
      activity: 'running_bash',
      tool: 'ShellTool',
      detail: match[1],
    })
  }

  match = GEMINI_TOOL_GREP.exec(stripped)
  if (match) {
    results.push({
      activity: 'searching',
      tool: 'GrepTool',
      detail: match[1],
    })
  }

  match = GEMINI_TOOL_GLOB.exec(stripped)
  if (match) {
    results.push({
      activity: 'searching',
      tool: 'GlobTool',
      detail: match[1],
    })
  }

  match = GEMINI_TOOL_WEB.exec(stripped)
  if (match) {
    results.push({
      activity: 'web_search',
      tool: 'WebSearchTool',
      detail: match[1],
    })
  }

  // Alternative display formats
  if (results.length === 0) {
    match = GEMINI_READ_ALT.exec(stripped)
    if (match) {
      results.push({
        activity: 'reading',
        tool: 'ReadFileTool',
        detail: match[1],
        fileTouch: { path: match[1], operation: 'read' },
      })
    }

    match = GEMINI_WRITE_ALT.exec(stripped)
    if (match) {
      results.push({
        activity: 'writing',
        tool: 'WriteFileTool',
        detail: match[1],
        fileTouch: { path: match[1], operation: 'write' },
      })
    }

    match = GEMINI_EDIT_ALT.exec(stripped)
    if (match) {
      results.push({
        activity: 'editing',
        tool: 'EditTool',
        detail: match[1],
        fileTouch: { path: match[1], operation: 'edit' },
      })
    }

    match = GEMINI_SHELL_ALT.exec(stripped)
    if (match) {
      results.push({
        activity: 'running_bash',
        tool: 'ShellTool',
        detail: match[1],
      })
    }

    match = GEMINI_SEARCH_ALT.exec(stripped)
    if (match) {
      results.push({
        activity: 'searching',
        tool: 'GrepTool',
        detail: match[1],
      })
    }
  }

  // High-level activity patterns
  if (results.length === 0) {
    if (PERMISSION_PATTERN.test(stripped)) {
      results.push({ activity: 'permission' })
    } else if (GEMINI_THINKING.test(stripped) || SPINNER_CHARS.test(stripped)) {
      results.push({ activity: 'thinking' })
    }
  }

  return results
}

// --- Codex CLI output parsing ---
// Codex uses similar agentic patterns (tool calls, file ops, shell commands)
const CODEX_TOOL_READ = /\b(?:readFile|read_file|Read)\s*\(\s*(?:path|file|file_path):\s*"([^"]+)"/i
const CODEX_TOOL_WRITE = /\b(?:writeFile|write_file|Write)\s*\(\s*(?:path|file|file_path):\s*"([^"]+)"/i
const CODEX_TOOL_PATCH = /\b(?:patch|apply_patch|Edit|MultiEdit)\s*\(\s*(?:path|file|file_path):\s*"([^"]+)"/i
const CODEX_TOOL_SHELL = /\b(?:shell|shell_command|Bash)\s*\(\s*command:\s*"([^"]+)"/i
const CODEX_TOOL_SEARCH = /\b(?:glob|searchFiles|findFiles|Grep)\s*\(\s*(?:pattern|query):\s*"([^"]+)"/i
const CODEX_TOOL_WEB_SEARCH = /\b(?:webSearch|WebSearch)\s*\(\s*query:\s*"([^"]+)"/i
const CODEX_TOOL_WEB_FETCH = /\b(?:webFetch|WebFetch)\s*\(\s*url:\s*"([^"]+)"/i
const CODEX_TOOL_TASK_CREATE = /\bTaskCreate\s*\(\s*subject:\s*"([^"]+)"/i
const CODEX_TOOL_TASK_UPDATE = /\bTaskUpdate\s*\(\s*taskId:\s*"([^"]+)".*?status:\s*"([^"]+)"/i

// Codex alternative display patterns
const CODEX_READ_ALT = /(?:Reading|Read(?:ing)?(?: file)?):?\s+([^\s\n]+)/i
const CODEX_WRITE_ALT = /(?:Writing|Wrote|Creating|Created):?\s+([^\s\n]+)/i
const CODEX_EDIT_ALT = /(?:Editing|Patching|Updating|Updated|Applying patch to):?\s+([^\s\n]+)/i
const CODEX_SHELL_ALT = /(?:Running|Executing|Ran)(?: command)?:?\s+`?([^`\n]+)`?/i
const CODEX_SEARCH_ALT = /(?:Searching|Grepping|Scanning):?\s+(.+)/i
const CODEX_WEB_SEARCH_ALT = /(?:Web\s*search|Searching web):?\s+(.+)/i
const CODEX_WEB_FETCH_ALT = /(?:Fetching|Fetched)(?: URL)?:?\s+(\S+)/i
const CODEX_THINKING = /(?:Thinking|Analyzing|Reasoning|Reflecting)/i
const CODEX_PLAN_MODE = /plan mode/i

export function parseCodexOutput(stripped: string): ParseResult[] {
  const results: ParseResult[] = []
  let match: RegExpExecArray | null

  // Tool calls (formal format)
  match = CODEX_TOOL_READ.exec(stripped)
  if (match) {
    results.push({
      activity: 'reading',
      tool: 'readFile',
      detail: match[1],
      fileTouch: { path: match[1], operation: 'read' },
    })
  }

  match = CODEX_TOOL_WRITE.exec(stripped)
  if (match) {
    results.push({
      activity: 'writing',
      tool: 'writeFile',
      detail: match[1],
      fileTouch: { path: match[1], operation: 'write' },
    })
  }

  match = CODEX_TOOL_PATCH.exec(stripped)
  if (match) {
    results.push({
      activity: 'editing',
      tool: 'patch',
      detail: match[1],
      fileTouch: { path: match[1], operation: 'edit' },
    })
  }

  match = CODEX_TOOL_SHELL.exec(stripped)
  if (match) {
    results.push({
      activity: 'running_bash',
      tool: 'shell',
      detail: match[1],
    })
  }

  match = CODEX_TOOL_SEARCH.exec(stripped)
  if (match) {
    results.push({
      activity: 'searching',
      tool: 'search',
      detail: match[1],
    })
  }

  match = CODEX_TOOL_WEB_SEARCH.exec(stripped)
  if (match) {
    results.push({
      activity: 'web_search',
      tool: 'webSearch',
      detail: match[1],
    })
  }

  match = CODEX_TOOL_WEB_FETCH.exec(stripped)
  if (match) {
    results.push({
      activity: 'web_fetch',
      tool: 'webFetch',
      detail: match[1],
    })
  }

  match = CODEX_TOOL_TASK_CREATE.exec(stripped)
  if (match) {
    results.push({
      activity: 'task_create',
      tool: 'TaskCreate',
      detail: match[1],
      taskAction: {
        action: 'create',
        subject: match[1],
      },
    })
  }

  match = CODEX_TOOL_TASK_UPDATE.exec(stripped)
  if (match) {
    results.push({
      activity: 'task_update',
      tool: 'TaskUpdate',
      detail: `${match[1]}: ${match[2]}`,
      taskAction: {
        action: 'update',
        taskId: match[1],
        status: match[2],
      },
    })
  }

  // Alternative display formats
  if (results.length === 0) {
    match = CODEX_READ_ALT.exec(stripped)
    if (match) {
      results.push({
        activity: 'reading',
        tool: 'readFile',
        detail: match[1],
        fileTouch: { path: match[1], operation: 'read' },
      })
    }

    match = CODEX_WRITE_ALT.exec(stripped)
    if (match) {
      results.push({
        activity: 'writing',
        tool: 'writeFile',
        detail: match[1],
        fileTouch: { path: match[1], operation: 'write' },
      })
    }

    match = CODEX_EDIT_ALT.exec(stripped)
    if (match) {
      results.push({
        activity: 'editing',
        tool: 'patch',
        detail: match[1],
        fileTouch: { path: match[1], operation: 'edit' },
      })
    }

    match = CODEX_SHELL_ALT.exec(stripped)
    if (match) {
      results.push({
        activity: 'running_bash',
        tool: 'shell',
        detail: match[1],
      })
    }

    match = CODEX_SEARCH_ALT.exec(stripped)
    if (match) {
      results.push({
        activity: 'searching',
        tool: 'search',
        detail: match[1],
      })
    }

    match = CODEX_WEB_SEARCH_ALT.exec(stripped)
    if (match) {
      results.push({
        activity: 'web_search',
        tool: 'webSearch',
        detail: match[1],
      })
    }

    match = CODEX_WEB_FETCH_ALT.exec(stripped)
    if (match) {
      results.push({
        activity: 'web_fetch',
        tool: 'webFetch',
        detail: match[1],
      })
    }
  }

  // Context metrics extraction
  const contextMatch = CONTEXT_PATTERN.exec(stripped)
  const tokenMatch = TOKENS_PATTERN.exec(stripped)
  const costMatch = COST_PATTERN.exec(stripped)
  const turnMatch = TURN_PATTERN.exec(stripped)

  if (contextMatch || tokenMatch || costMatch || turnMatch) {
    const contextUpdate: ParseResult['contextUpdate'] = {}
    if (tokenMatch) {
      contextUpdate.tokenEstimate = parseTokenCount(tokenMatch[1])
    }
    if (costMatch) {
      contextUpdate.costEstimate = parseFloat(costMatch[1])
    }
    if (turnMatch) {
      contextUpdate.turnCount = parseInt(turnMatch[1], 10)
    }
    if (contextMatch && !tokenMatch) {
      const pct = parseFloat(contextMatch[1])
      contextUpdate.tokenEstimate = Math.round((pct / 100) * 200000)
    }
    if (Object.keys(contextUpdate).length > 0) {
      results.push({
        activity: results[0]?.activity || 'thinking',
        contextUpdate,
      })
    }
  }

  // High-level activity patterns
  if (results.length === 0) {
    if (PERMISSION_PATTERN.test(stripped)) {
      results.push({ activity: 'permission' })
    } else if (CODEX_PLAN_MODE.test(stripped)) {
      results.push({ activity: 'planning' })
    } else if (CODEX_THINKING.test(stripped) || SPINNER_CHARS.test(stripped)) {
      results.push({ activity: 'thinking' })
    }
  }

  return results
}

/** Unified parser: dispatches to Claude, Gemini, or Codex parser based on provider */
export function parseOutput(stripped: string, provider: Provider = 'claude'): ParseResult[] {
  if (provider === 'gemini') {
    return parseGeminiOutput(stripped)
  }
  if (provider === 'codex') {
    return parseCodexOutput(stripped)
  }
  return parseClaudeOutput(stripped)
}

/**
 * Batch parser: accumulates chunks and parses every batchMs.
 * Returns a cleanup function.
 */
export function createBatchParser(
  onResults: (results: ParseResult[]) => void,
  batchMs = 100,
  provider: Provider = 'claude',
) {
  let buffer = ''
  let timer: ReturnType<typeof setTimeout> | null = null
  const BUFFER_MAX = 2000

  function push(rawData: string) {
    buffer += rawData
    if (buffer.length > BUFFER_MAX) {
      buffer = buffer.slice(-BUFFER_MAX)
    }

    if (!timer) {
      timer = setTimeout(() => {
        timer = null
        const stripped = stripAnsi(buffer)
        const results = parseOutput(stripped, provider)
        if (results.length > 0) {
          onResults(results)
        }
        // Keep last 200 chars for context overlap
        buffer = buffer.length > 200 ? buffer.slice(-200) : buffer
      }, batchMs)
    }
  }

  function destroy() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    buffer = ''
  }

  return { push, destroy }
}
