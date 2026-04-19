import { LayoutDashboard, Terminal } from 'lucide-react'
import { useSwarmStore } from '../../stores/swarmStore'

export function SwarmViewToggle() {
  const mode = useSwarmStore((s) => s.swarmViewMode)
  const setMode = useSwarmStore((s) => s.setSwarmViewMode)
  const activeSwarmId = useSwarmStore((s) => s.activeSwarmId)

  // Single guard: any active swarm shows the toggle. Status filtering used to
  // live here too, which silently hid the only escape hatch back to the
  // dashboard when the swarm hit a transitional state.
  if (!activeSwarmId) return null

  return (
    <div
      className="fixed right-3 z-[60] flex items-center gap-0.5 bg-black/85 backdrop-blur-md border border-sky-400/20 rounded-lg p-0.5 shadow-lg"
      style={{ top: 6 }}
    >
      <button
        onClick={() => setMode('dashboard')}
        title="Switch to dashboard view (send messages, see graphs)"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
          mode === 'dashboard'
            ? 'bg-sky-400/20 text-sky-400'
            : 'text-white/55 hover:text-white/85 hover:bg-white/[0.06]'
        }`}
      >
        <LayoutDashboard className="w-3.5 h-3.5" />
        Dashboard
      </button>
      <button
        onClick={() => setMode('terminals')}
        title="Switch to terminals view (see raw agent output)"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
          mode === 'terminals'
            ? 'bg-sky-400/20 text-sky-400'
            : 'text-white/55 hover:text-white/85 hover:bg-white/[0.06]'
        }`}
      >
        <Terminal className="w-3.5 h-3.5" />
        Terminals
      </button>
    </div>
  )
}
