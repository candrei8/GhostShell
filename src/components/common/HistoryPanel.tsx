import { useMemo, useRef, useState } from 'react'
import { Clock, Search, Trash2 } from 'lucide-react'
import { useHistoryStore } from '../../stores/historyStore'
import { useTerminalStore } from '../../stores/terminalStore'
import { formatDuration } from '../../lib/formatUtils'

export function HistoryPanel() {
  const history = useHistoryStore((s) => s.entries)
  const clearHistory = useHistoryStore((s) => s.clearHistory)
  const activeSessionId = useTerminalStore((s) => s.activeSessionId)

  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const filteredHistory = useMemo(
    () => history.filter((entry) => entry.command.toLowerCase().includes(query.toLowerCase())),
    [history, query],
  )

  const handleRunCommand = (cmd: string) => {
    if (activeSessionId) {
      window.ghostshell.ptyWrite(activeSessionId, cmd + '\r')
    }
  }

  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#38bdf8]/10 text-[#38bdf8]">
            <Clock className="h-3.5 w-3.5" />
          </div>
          <div>
            <h2 className="text-[13px] font-semibold text-white/85">History</h2>
            <p className="text-[10px] text-white/30">Recent commands</p>
          </div>
        </div>

        <button
          onClick={clearHistory}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-white/25 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
          title="Clear History"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2.5 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5 focus-within:border-[#38bdf8]/30 transition-colors">
          <Search className="w-3 h-3 text-white/20 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search history..."
            className="flex-1 bg-transparent border-none outline-none text-[12px] text-white/80 placeholder:text-white/25"
          />
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          <span className="rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-white/30">
            {history.length} total
          </span>
          {query && (
            <span className="rounded-md bg-[#38bdf8]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#38bdf8]/80">
              {filteredHistory.length} matched
            </span>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto sidebar-scroll p-2">
        {filteredHistory.length === 0 ? (
          <div className="flex h-28 flex-col items-center justify-center rounded-xl border border-dashed border-white/10 text-center">
            <Clock className="mb-1.5 h-4 w-4 text-white/10" />
            <p className="text-[11px] text-white/25">No history found</p>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {filteredHistory.map((entry, i) => (
              <button
                key={i}
                onClick={() => handleRunCommand(entry.command)}
                className="group flex items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/[0.03]"
              >
                <div className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-white/10 transition-colors group-hover:bg-[#38bdf8]/60" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-mono text-white/65 truncate group-hover:text-white/85">{entry.command}</p>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-white/20">
                    <span>{formatDuration(entry.timestamp)} ago</span>
                    {activeSessionId && (
                      <span className="rounded-md bg-[#38bdf8]/10 px-1 py-px text-[9px] text-[#38bdf8]/70 opacity-0 transition-opacity group-hover:opacity-100">
                        replay
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
