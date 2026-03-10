import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  Blocks as BlocksIcon,
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  Copy,
  Play,
  Search,
  TerminalSquare,
  Trash2,
  X,
} from 'lucide-react'
import { useCommandBlockStore, type CommandBlock } from '../../stores/commandBlockStore'
import { useTerminalStore } from '../../stores/terminalStore'
import { formatClockTime, formatDuration, smartTruncatePath } from '../../lib/formatUtils'

type BlockFilter = 'all' | 'active' | 'running' | 'bookmarked' | 'errors'

interface BlockRecord {
  block: CommandBlock
  sessionTitle: string
  sessionId: string
  isActiveSession: boolean
  isLive: boolean
}

const FILTERS: { id: BlockFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Current' },
  { id: 'running', label: 'Running' },
  { id: 'bookmarked', label: 'Pinned' },
  { id: 'errors', label: 'Errors' },
]

function getBlockRuntime(block: CommandBlock): string {
  if (typeof block.durationMs === 'number') {
    return formatDuration(0, block.durationMs)
  }
  return formatDuration(block.startedAt)
}

function getStatusTone(status: CommandBlock['status'], isLive: boolean): string {
  if (isLive || status === 'running') return 'border-cyan-400/25 bg-cyan-400/8 text-cyan-300/80'
  if (status === 'success') return 'border-emerald-400/25 bg-emerald-400/8 text-emerald-300/80'
  if (status === 'error') return 'border-rose-400/25 bg-rose-400/8 text-rose-300/80'
  return 'border-amber-400/25 bg-amber-400/8 text-amber-300/80'
}

function getStatusLabel(status: CommandBlock['status'], isLive: boolean): string {
  if (isLive || status === 'running') return 'live'
  if (status === 'success') return 'ok'
  if (status === 'error') return 'err'
  return 'stop'
}

function getBlockPreview(block: CommandBlock): string {
  const source = block.output.trim() || block.rawOutput.trim()
  if (!source) return 'No output captured yet.'
  return source.length > 180 ? `${source.slice(0, 177)}...` : source
}

export function CommandBlocksPanel() {
  const sessions = useTerminalStore((s) => s.sessions)
  const activeSessionId = useTerminalStore((s) => s.activeSessionId)
  const setActiveSession = useTerminalStore((s) => s.setActiveSession)

  const blocksBySession = useCommandBlockStore((s) => s.blocksBySession)
  const activeBlockBySession = useCommandBlockStore((s) => s.activeBlockBySession)
  const toggleBookmark = useCommandBlockStore((s) => s.toggleBookmark)
  const removeBlock = useCommandBlockStore((s) => s.removeBlock)
  const clearSession = useCommandBlockStore((s) => s.clearSession)
  const clearAll = useCommandBlockStore((s) => s.clearAll)

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<BlockFilter>('all')
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)

  const sessionTitleById = useMemo(
    () => new Map(sessions.map((session) => [session.id, session.title])),
    [sessions],
  )

  const allBlocks = useMemo<BlockRecord[]>(() => {
    return Object.entries(blocksBySession)
      .flatMap(([sessionId, blocks]) =>
        blocks.map((block) => ({
          block,
          sessionId,
          sessionTitle: sessionTitleById.get(sessionId) || 'Terminal',
          isActiveSession: sessionId === activeSessionId,
          isLive: activeBlockBySession[sessionId] === block.id,
        })),
      )
      .sort((a, b) => b.block.startedAt - a.block.startedAt)
  }, [activeBlockBySession, activeSessionId, blocksBySession, sessionTitleById])

  const summary = useMemo(() => {
    const total = allBlocks.length
    const running = allBlocks.filter((item) => item.isLive || item.block.status === 'running').length
    const bookmarked = allBlocks.filter((item) => item.block.bookmarked).length
    const errors = allBlocks.filter((item) => item.block.status === 'error').length
    return { total, running, bookmarked, errors }
  }, [allBlocks])

  const filteredBlocks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return allBlocks.filter((item) => {
      if (filter === 'active' && !item.isActiveSession) return false
      if (filter === 'running' && !(item.isLive || item.block.status === 'running')) return false
      if (filter === 'bookmarked' && !item.block.bookmarked) return false
      if (filter === 'errors' && item.block.status !== 'error') return false
      if (!normalizedQuery) return true
      return (
        item.block.command.toLowerCase().includes(normalizedQuery) ||
        item.sessionTitle.toLowerCase().includes(normalizedQuery) ||
        item.block.cwd.toLowerCase().includes(normalizedQuery) ||
        item.block.output.toLowerCase().includes(normalizedQuery)
      )
    })
  }, [allBlocks, filter, query])

  const selected = useMemo(() => {
    if (!selectedBlockId) return filteredBlocks[0] || null
    return filteredBlocks.find((item) => item.block.id === selectedBlockId) || filteredBlocks[0] || null
  }, [filteredBlocks, selectedBlockId])

  useEffect(() => {
    const nextSelected = filteredBlocks[0]?.block.id || null
    if (!selected) {
      setSelectedBlockId(nextSelected)
      return
    }
    if (selected.block.id !== selectedBlockId) {
      setSelectedBlockId(selected.block.id)
    }
  }, [filteredBlocks, selected, selectedBlockId])

  const handleReplay = (item: BlockRecord) => {
    const targetSessionId = activeSessionId || item.sessionId
    if (!targetSessionId) return
    setActiveSession(targetSessionId)
    window.ghostshell.ptyWrite(targetSessionId, item.block.command + '\r')
  }

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      // Clipboard access can fail
    }
  }

  return (
    <div className="flex h-full flex-col bg-transparent">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.04] px-4 py-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-400/10 text-rose-300/80">
            <BlocksIcon className="h-3.5 w-3.5" />
          </div>
          <div>
            <h2 className="text-[13px] font-semibold text-white/85">Blocks</h2>
            <p className="text-[10px] text-white/30">Command timeline</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {activeSessionId && (
            <button
              onClick={() => clearSession(activeSessionId)}
              className="rounded-md px-2 py-1 text-[10px] font-medium text-white/25 transition-colors hover:bg-white/[0.04] hover:text-white/50"
              title="Clear current"
            >
              Clear
            </button>
          )}
          <button
            onClick={clearAll}
            className="rounded-md px-2 py-1 text-[10px] font-medium text-white/25 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
            title="Clear all"
          >
            Clear all
          </button>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="border-b border-white/[0.03] px-3 py-2.5 shrink-0">
        <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-1.5 focus-within:border-white/[0.12] transition-colors">
          <Search className="h-3 w-3 shrink-0 text-white/20" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search commands..."
            className="flex-1 bg-transparent text-[12px] text-white/80 placeholder:text-white/25 outline-none"
          />
        </div>

        <div className="mt-2 flex flex-wrap gap-0.5">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              onClick={() => setFilter(item.id)}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-all ${
                filter === item.id
                  ? 'bg-white/[0.07] text-white/75'
                  : 'text-white/25 hover:bg-white/[0.03] hover:text-white/45'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="mt-2 flex items-center gap-2 text-[10px] text-white/20">
          <span>{summary.total} blocks</span>
          {summary.running > 0 && <span className="text-cyan-300/60">{summary.running} running</span>}
          {summary.errors > 0 && <span className="text-rose-300/60">{summary.errors} errors</span>}
          {summary.bookmarked > 0 && <span>{summary.bookmarked} pinned</span>}
        </div>
      </div>

      {/* Block List */}
      <div className="min-h-0 flex-1 overflow-y-auto sidebar-scroll p-2">
        {filteredBlocks.length === 0 ? (
          <div className="flex min-h-[140px] flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.06] text-center">
            <BlocksIcon className="mb-2 h-5 w-5 text-white/10" />
            <p className="text-[12px] font-medium text-white/30">No command blocks</p>
            <p className="mt-0.5 text-[10px] text-white/15">Run commands to see them here</p>
          </div>
        ) : (
          <div className="space-y-1">
            {filteredBlocks.map((item) => {
              const isSelected = selected?.block.id === item.block.id
              return (
                <button
                  key={item.block.id}
                  onClick={() => setSelectedBlockId(item.block.id)}
                  className={`w-full rounded-xl border px-3 py-2 text-left transition-all ${
                    isSelected
                      ? 'border-white/[0.1] bg-white/[0.03]'
                      : 'border-white/[0.04] bg-white/[0.01] hover:border-white/[0.08] hover:bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate font-mono text-[11px] text-white/65">{item.block.command}</p>
                        {item.block.bookmarked && <BookmarkCheck className="h-3 w-3 shrink-0 text-cyan-300/50" />}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-white/20">
                        <span className="rounded-md bg-white/[0.04] px-1 py-px">{item.sessionTitle}</span>
                        <span>{getBlockRuntime(item.block)}</span>
                        <span>{item.block.lineCount}L</span>
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider ${getStatusTone(item.block.status, item.isLive)}`}>
                      {getStatusLabel(item.block.status, item.isLive)}
                    </span>
                  </div>
                  {isSelected && (
                    <p className="mt-1.5 whitespace-pre-wrap break-words text-[10px] leading-relaxed text-white/25">
                      {getBlockPreview(item.block)}
                    </p>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Detail Footer */}
      <AnimatePresence initial={false}>
        {selected && (
          <motion.div
            key={selected.block.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="shrink-0 border-t border-white/[0.04] p-2"
          >
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <TerminalSquare className="h-3 w-3 text-white/30" />
                    <p className="truncate font-mono text-[11px] text-white/65">{selected.block.command}</p>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-white/20">
                    <span>{selected.sessionTitle}</span>
                    <span>{formatClockTime(selected.block.startedAt)}</span>
                    <span>{getBlockRuntime(selected.block)}</span>
                    {selected.block.cwd && <span>{smartTruncatePath(selected.block.cwd, 24)}</span>}
                  </div>
                </div>
                <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider ${getStatusTone(selected.block.status, selected.isLive)}`}>
                  {getStatusLabel(selected.block.status, selected.isLive)}
                </span>
              </div>

              {/* Actions */}
              <div className="mt-2.5 flex flex-wrap gap-1">
                <button
                  onClick={() => handleReplay(selected)}
                  className="inline-flex items-center gap-1 rounded-md border border-cyan-400/20 bg-cyan-400/8 px-2 py-1 text-[10px] font-medium text-cyan-300/80 transition-colors hover:bg-cyan-400/14"
                >
                  <Play className="h-2.5 w-2.5" /> Run
                </button>
                <button
                  onClick={() => setActiveSession(selected.sessionId)}
                  className="inline-flex items-center gap-1 rounded-md bg-white/[0.03] px-2 py-1 text-[10px] font-medium text-white/35 transition-colors hover:bg-white/[0.06] hover:text-white/55"
                >
                  <TerminalSquare className="h-2.5 w-2.5" /> Focus
                </button>
                <button
                  onClick={() => handleCopy(selected.block.command)}
                  className="inline-flex items-center gap-1 rounded-md bg-white/[0.03] px-2 py-1 text-[10px] font-medium text-white/35 transition-colors hover:bg-white/[0.06] hover:text-white/55"
                >
                  <Copy className="h-2.5 w-2.5" /> Copy
                </button>
                <button
                  onClick={() => toggleBookmark(selected.sessionId, selected.block.id)}
                  className="inline-flex items-center gap-1 rounded-md bg-white/[0.03] px-2 py-1 text-[10px] font-medium text-white/35 transition-colors hover:bg-white/[0.06] hover:text-white/55"
                >
                  {selected.block.bookmarked ? <BookmarkCheck className="h-2.5 w-2.5" /> : <Bookmark className="h-2.5 w-2.5" />}
                  {selected.block.bookmarked ? 'Unpin' : 'Pin'}
                </button>
                <button
                  onClick={() => removeBlock(selected.sessionId, selected.block.id)}
                  className="inline-flex items-center gap-1 rounded-md bg-rose-500/8 px-2 py-1 text-[10px] font-medium text-rose-300/60 transition-colors hover:bg-rose-500/14 hover:text-rose-300/80"
                >
                  <Trash2 className="h-2.5 w-2.5" /> Del
                </button>
              </div>

              {/* Output preview */}
              <div className="mt-2.5 overflow-hidden rounded-lg border border-white/[0.05] bg-black/25">
                <div className="flex items-center justify-between border-b border-white/[0.04] px-2.5 py-1.5">
                  <p className="text-[10px] text-white/25">Output</p>
                  <button
                    onClick={() => handleCopy(selected.block.output || selected.block.rawOutput)}
                    className="inline-flex items-center gap-1 text-[10px] text-white/20 transition-colors hover:text-white/45"
                  >
                    <Copy className="h-2.5 w-2.5" /> Copy
                  </button>
                </div>
                <div className="max-h-40 overflow-auto sidebar-scroll px-2.5 py-2">
                  {selected.block.output || selected.block.rawOutput ? (
                    <pre className="whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-white/35">
                      {selected.block.output || selected.block.rawOutput}
                    </pre>
                  ) : (
                    <div className="flex items-center gap-1.5 text-[10px] text-white/20">
                      {selected.block.status === 'error' ? (
                        <AlertTriangle className="h-3 w-3 text-rose-300/50" />
                      ) : selected.block.status === 'success' ? (
                        <CheckCircle2 className="h-3 w-3 text-emerald-300/50" />
                      ) : (
                        <X className="h-3 w-3 text-amber-300/50" />
                      )}
                      <span>No output captured.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
