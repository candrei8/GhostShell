import { LayoutDashboard, Terminal } from 'lucide-react'
import { useSwarmStore } from '../../stores/swarmStore'

export function SwarmViewToggle() {
  const mode = useSwarmStore((s) => s.swarmViewMode)
  const setMode = useSwarmStore((s) => s.setSwarmViewMode)
  const activeSwarmId = useSwarmStore((s) => s.activeSwarmId)

  if (!activeSwarmId) return null

  return (
    <div className="fixed top-12 right-4 z-50 flex items-center gap-0.5 bg-black/80 backdrop-blur-md border border-white/[0.08] rounded-lg p-0.5">
      <button
        onClick={() => setMode('dashboard')}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
          mode === 'dashboard'
            ? 'bg-sky-400/15 text-sky-400'
            : 'text-white/40 hover:text-white/60 hover:bg-white/[0.04]'
        }`}
      >
        <LayoutDashboard className="w-3.5 h-3.5" />
        Dashboard
      </button>
      <button
        onClick={() => setMode('terminals')}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
          mode === 'terminals'
            ? 'bg-sky-400/15 text-sky-400'
            : 'text-white/40 hover:text-white/60 hover:bg-white/[0.04]'
        }`}
      >
        <Terminal className="w-3.5 h-3.5" />
        Terminals
      </button>
    </div>
  )
}
