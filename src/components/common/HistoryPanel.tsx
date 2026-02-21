import { useState, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Clock, Search, Trash2, Send, X } from 'lucide-react'
import { useHistoryStore, HistoryEntry } from '../../stores/historyStore'
import { useTerminalStore } from '../../stores/terminalStore'

export function HistoryPanel() {
  const entries = useHistoryStore((s) => s.entries)
  const clearHistory = useHistoryStore((s) => s.clearHistory)
  const removeEntry = useHistoryStore((s) => s.removeEntry)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    const list = q ? entries.filter((e) => e.command.toLowerCase().includes(q)) : entries
    return [...list].reverse()
  }, [entries, query])

  const handleResend = (entry: HistoryEntry) => {
    const { activeSessionId } = useTerminalStore.getState()
    if (!activeSessionId) return
    try {
      window.ghostshell.ptyWrite(activeSessionId, entry.command + '\r')
    } catch {
      // ignore
    }
  }

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between p-3 pb-1">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-ghost-accent" />
          <span className="text-xs font-semibold text-ghost-text-dim uppercase tracking-wider">
            History
          </span>
          <span className="text-xs text-ghost-text-dim/50">{entries.length}</span>
        </div>
        {entries.length > 0 && (
          <motion.button
            onClick={clearHistory}
            className="w-6 h-6 flex items-center justify-center rounded text-ghost-text-dim hover:text-ghost-error hover:bg-ghost-error/10"
            title="Clear history"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </motion.button>
        )}
      </div>

      {/* Search */}
      <div className="px-3 pb-2 pt-2">
        <div className="flex items-center gap-1.5 bg-ghost-surface border border-ghost-border rounded-lg px-2 py-1">
          <Search className="w-3 h-3 text-ghost-text-dim shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search commands..."
            className="flex-1 bg-transparent text-xs text-ghost-text outline-none placeholder:text-ghost-text-dim/40"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-ghost-text-dim hover:text-ghost-text">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Entries */}
      <div className="flex-1 overflow-y-auto px-3 space-y-0.5 sidebar-scroll">
        {filtered.length === 0 ? (
          <p className="text-xs text-ghost-text-dim/50 text-center mt-4">
            {entries.length === 0 ? 'No commands yet' : 'No matches'}
          </p>
        ) : (
          <AnimatePresence initial={false}>
            {filtered.map((entry, index) => (
              <motion.div
                key={entry.id}
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8, transition: { duration: 0.12 } }}
                transition={{
                  duration: 0.18,
                  delay: Math.min(index * 0.02, 0.2),
                  layout: { type: 'spring', stiffness: 300, damping: 28 },
                }}
                className="group flex items-start gap-1.5 px-2 py-1.5 rounded hover:bg-white/5 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-ghost-text font-mono truncate" title={entry.command}>
                    {entry.command}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-ghost-text-dim/40">{formatTime(entry.timestamp)}</span>
                    {entry.agentName && (
                      <span className="text-xs text-ghost-accent/50">{entry.agentName}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={() => handleResend(entry)}
                    className="w-6 h-6 flex items-center justify-center rounded hover:bg-ghost-accent/20 text-ghost-accent"
                    title="Re-send to active terminal"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => removeEntry(entry.id)}
                    className="w-6 h-6 flex items-center justify-center rounded hover:bg-ghost-error/20 text-ghost-text-dim hover:text-ghost-error"
                    title="Remove"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
