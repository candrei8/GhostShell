import { create } from 'zustand'
import { stripAnsi } from '../lib/claude-output-parser'

export type CommandBlockStatus = 'running' | 'success' | 'error' | 'interrupted'

export interface CommandBlock {
  id: string
  sessionId: string
  command: string
  cwd: string
  startedAt: number
  finishedAt?: number
  durationMs?: number
  status: CommandBlockStatus
  output: string
  rawOutput: string
  lineCount: number
  bookmarked: boolean
  errorHints: number
}

interface CommandBlockState {
  blocksBySession: Record<string, CommandBlock[]>
  activeBlockBySession: Record<string, string | null>
  startBlock: (sessionId: string, command: string, cwd?: string) => string | null
  appendOutput: (sessionId: string, rawChunk: string) => void
  finishActiveBlock: (sessionId: string, status?: Exclude<CommandBlockStatus, 'running'>) => CommandBlock | null
  markActiveBlockError: (sessionId: string) => void
  toggleBookmark: (sessionId: string, blockId: string) => void
  removeBlock: (sessionId: string, blockId: string) => void
  clearSession: (sessionId: string) => void
  clearAll: () => void
}

const MAX_BLOCKS_PER_SESSION = 300
const MAX_OUTPUT_CHARS = 24000
const ERROR_HINT_PATTERNS = [
  /\berror\b/i,
  /\bfailed\b/i,
  /\bexception\b/i,
  /\btraceback\b/i,
  /\bcommand not found\b/i,
  /\bis not recognized\b/i,
  /\bno se reconoce\b/i,
  /\bpermission denied\b/i,
]

function normalizeChunk(raw: string): string {
  return stripAnsi(raw)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
}

function countLines(text: string): number {
  if (!text) return 0
  return text.split('\n').filter((line) => line.length > 0).length
}

function shouldHintError(text: string): boolean {
  return ERROR_HINT_PATTERNS.some((pattern) => pattern.test(text))
}

function finalizeBlock(
  block: CommandBlock,
  explicitStatus?: Exclude<CommandBlockStatus, 'running'>,
): CommandBlock {
  if (block.status !== 'running') return block
  const finishedAt = Date.now()
  
  // Clean up rawOutput for the block UI: remove echoed command and trailing prompt
  let cleanRaw = block.rawOutput
  const cmdLine = block.command.trim()
  
  // Strip echoed command from start
  if (cleanRaw.startsWith(cmdLine)) {
    cleanRaw = cleanRaw.slice(cmdLine.length).replace(/^\r?\n/, '')
  } else {
    // Sometimes it has ANSI or spaces around it
    const stripEchoRegex = new RegExp(`^.*?${cmdLine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*?\r?\n`, 'i')
    cleanRaw = cleanRaw.replace(stripEchoRegex, '')
  }

  // Strip trailing prompt (approximate)
  const promptRegex = /(?:\r?\n)(?:.*?)(?:>|\$|#)\s*$/
  cleanRaw = cleanRaw.replace(promptRegex, '')

  return {
    ...block,
    rawOutput: cleanRaw,
    finishedAt,
    durationMs: Math.max(0, finishedAt - block.startedAt),
    status: explicitStatus ?? (block.errorHints > 0 ? 'error' : 'success'),
  }
}

export const useCommandBlockStore = create<CommandBlockState>()((set) => ({
  blocksBySession: {},
  activeBlockBySession: {},

  startBlock: (sessionId, command, cwd = '') => {
    const trimmed = command.trim()
    if (!trimmed) return null

    let createdId: string | null = null
    set((state) => {
      const previousBlocks = state.blocksBySession[sessionId] || []
      const activeId = state.activeBlockBySession[sessionId]
      const finalizedPrevious = activeId
        ? previousBlocks.map((block) => (block.id === activeId ? finalizeBlock(block) : block))
        : previousBlocks

      const nextBlock: CommandBlock = {
        id: `blk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        sessionId,
        command: trimmed,
        cwd,
        startedAt: Date.now(),
        status: 'running',
        output: '',
        rawOutput: '',
        lineCount: 0,
        bookmarked: false,
        errorHints: 0,
      }
      createdId = nextBlock.id

      return {
        blocksBySession: {
          ...state.blocksBySession,
          [sessionId]: [...finalizedPrevious, nextBlock].slice(-MAX_BLOCKS_PER_SESSION),
        },
        activeBlockBySession: {
          ...state.activeBlockBySession,
          [sessionId]: nextBlock.id,
        },
      }
    })
    return createdId
  },

  appendOutput: (sessionId, rawChunk) => {
    const normalized = normalizeChunk(rawChunk)
    if (!normalized) return

    set((state) => {
      const activeId = state.activeBlockBySession[sessionId]
      if (!activeId) return state

      const blocks = state.blocksBySession[sessionId]
      if (!blocks || blocks.length === 0) return state

      let changed = false
      const hasErrorHint = shouldHintError(normalized)

      const nextBlocks = blocks.map((block) => {
        if (block.id !== activeId) return block
        changed = true
        const merged = (block.output + normalized).slice(-MAX_OUTPUT_CHARS)
        const mergedRaw = (block.rawOutput + rawChunk).slice(-MAX_OUTPUT_CHARS * 1.5) // Allow more for ANSI
        return {
          ...block,
          output: merged,
          rawOutput: mergedRaw,
          lineCount: countLines(merged),
          errorHints: block.errorHints + (hasErrorHint ? 1 : 0),
        }
      })

      if (!changed) return state
      return {
        blocksBySession: {
          ...state.blocksBySession,
          [sessionId]: nextBlocks,
        },
      }
    })
  },

  finishActiveBlock: (sessionId, status) => {
    let finalized: CommandBlock | null = null
    set((state) => {
      const activeId = state.activeBlockBySession[sessionId]
      if (!activeId) return state

      const blocks = state.blocksBySession[sessionId]
      if (!blocks || blocks.length === 0) return state

      let changed = false
      const nextBlocks = blocks.map((block) => {
        if (block.id !== activeId) return block
        changed = true
        const next = finalizeBlock(block, status)
        finalized = next
        return next
      })

      if (!changed) return state
      return {
        blocksBySession: {
          ...state.blocksBySession,
          [sessionId]: nextBlocks,
        },
        activeBlockBySession: {
          ...state.activeBlockBySession,
          [sessionId]: null,
        },
      }
    })
    return finalized
  },

  markActiveBlockError: (sessionId) => {
    set((state) => {
      const activeId = state.activeBlockBySession[sessionId]
      if (!activeId) return state
      const blocks = state.blocksBySession[sessionId]
      if (!blocks || blocks.length === 0) return state

      let changed = false
      const nextBlocks = blocks.map((block) => {
        if (block.id !== activeId) return block
        changed = true
        return {
          ...block,
          errorHints: Math.max(1, block.errorHints + 1),
        }
      })

      if (!changed) return state
      return {
        blocksBySession: {
          ...state.blocksBySession,
          [sessionId]: nextBlocks,
        },
      }
    })
  },

  toggleBookmark: (sessionId, blockId) => {
    set((state) => {
      const blocks = state.blocksBySession[sessionId]
      if (!blocks || blocks.length === 0) return state

      let changed = false
      const nextBlocks = blocks.map((block) => {
        if (block.id !== blockId) return block
        changed = true
        return { ...block, bookmarked: !block.bookmarked }
      })
      if (!changed) return state

      return {
        blocksBySession: {
          ...state.blocksBySession,
          [sessionId]: nextBlocks,
        },
      }
    })
  },

  removeBlock: (sessionId, blockId) => {
    set((state) => {
      const blocks = state.blocksBySession[sessionId]
      if (!blocks) return state
      const filtered = blocks.filter((block) => block.id !== blockId)
      return {
        blocksBySession: {
          ...state.blocksBySession,
          [sessionId]: filtered,
        },
      }
    })
  },

  clearSession: (sessionId) => {
    set((state) => ({
      blocksBySession: {
        ...state.blocksBySession,
        [sessionId]: [],
      },
      activeBlockBySession: {
        ...state.activeBlockBySession,
        [sessionId]: null,
      },
    }))
  },

  clearAll: () => set({ blocksBySession: {}, activeBlockBySession: {} }),
}))
