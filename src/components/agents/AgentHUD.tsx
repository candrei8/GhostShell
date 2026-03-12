import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Search, Terminal, Zap, X } from 'lucide-react'
import { useTerminalStore } from '../../stores/terminalStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'

interface AgentHUDProps {
  onClose: () => void
}

export function AgentHUD({ onClose }: AgentHUDProps) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const addSession = useTerminalStore((s) => s.addSession)
  const currentPath = useWorkspaceStore((s) => s.currentPath)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  const handleLaunchTerminal = () => {
    addSession({
      id: `term-${Date.now()}`,
      title: 'Terminal',
      cwd: currentPath,
    })
    onClose()
  }

  return (
    <div className="absolute inset-0 z-[100] flex items-start justify-center pt-[15%] bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
        className="w-full max-w-xl overflow-hidden rounded-xl border border-white/[0.08] bg-[#0a0f1a]/95 shadow-[0_24px_64px_rgba(0,0,0,0.5)] backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Bar */}
        <div className="flex items-center px-4 py-3 border-b border-white/[0.05]">
          <Search className="w-4 h-4 text-white/25 shrink-0 mr-3" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Summon agent or launch tool..."
            className="flex-1 bg-transparent border-none outline-none text-[14px] text-white/85 placeholder:text-white/30"
          />
          <kbd className="hidden sm:inline-block rounded-md border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-white/30 font-mono ml-3">ESC</kbd>
        </div>

        {/* Actions */}
        <div className="p-1.5">
          <p className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-white/25">Quick Actions</p>

          <button
            onClick={handleLaunchTerminal}
            className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04] group"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.04] text-white/35 transition-colors group-hover:bg-white/[0.07] group-hover:text-white/60">
              <Terminal className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="text-[13px] font-medium text-white/75 group-hover:text-white/90">Plain Terminal</span>
              <p className="text-[11px] text-white/30">Launch a standard shell</p>
            </div>
          </button>

          <button
            className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04] group"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400/80 transition-colors group-hover:bg-indigo-500/15">
              <Zap className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="text-[13px] font-medium text-white/75 group-hover:text-white/90">Quick Agent</span>
              <p className="text-[11px] text-white/30">Instantly spawn default AI assistant</p>
            </div>
          </button>
        </div>
      </motion.div>
    </div>
  )
}
