// SwarmCommandBar — 44px dense professional header
// Merges DashboardTopBar + KPIBar into a single bar

import { useMemo } from 'react'
import {
  ArrowLeft, Play, Pause, Square, Users, ListTodo,
  MessageSquare, FileText,
} from 'lucide-react'
import { useSwarmStore } from '../../stores/swarmStore'
import type { Swarm } from '../../lib/swarm-types'
import { SWARM_PIPELINE_STAGES } from '../../lib/swarm-types'
import { deriveStage } from './SwarmPipeline'

export type CommandCenterViewMode = 'graph' | 'split' | 'control' | 'timeline' | 'deep' | 'know' | 'cost' | 'conflicts'

interface SwarmCommandBarProps {
  swarm: Swarm
  viewMode: CommandCenterViewMode
  onViewModeChange: (m: CommandCenterViewMode) => void
  onBack: () => void
  onPause: () => void
  onResume: () => void
  onStop: () => void
}

const STAGE_LABELS: Record<string, string> = {
  map: 'MAP', plan: 'PLAN', launch: 'LAUNCH',
  monitor: 'MONITOR', report: 'REPORT', archive: 'ARCHIVE',
}

const VIEW_MODES: { id: CommandCenterViewMode; label: string; completedOnly?: boolean }[] = [
  { id: 'graph', label: 'GRAPH' },
  { id: 'split', label: 'SPLIT' },
  { id: 'control', label: 'CTRL' },
  { id: 'timeline', label: 'TIME' },
  { id: 'cost', label: 'COST' },
  { id: 'conflicts', label: 'CONF' },
  { id: 'know', label: 'KG' },
  { id: 'deep', label: 'DEEP', completedOnly: true },
]

export function SwarmCommandBar({
  swarm, viewMode, onViewModeChange, onBack, onPause, onResume, onStop,
}: SwarmCommandBarProps) {
  useSwarmStore((s) => s.tick)

  const elapsed = swarm.startedAt ? Math.floor((Date.now() - swarm.startedAt) / 1000) : 0
  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60

  const isRunning = swarm.status === 'running' || swarm.status === 'launching'
  const isPaused = swarm.status === 'paused'

  const currentStage = deriveStage(swarm)
  const stageIdx = SWARM_PIPELINE_STAGES.indexOf(currentStage) + 1
  const stageTotal = SWARM_PIPELINE_STAGES.length

  // Inline metrics
  const metrics = useMemo(() => {
    const agents = swarm.agents.length
    const tasks = swarm.tasks.length
    const messages = swarm.messages.length
    const files = swarm.agents.reduce((acc, a) => acc + a.filesOwned.length, 0)
    return { agents, tasks, messages, files }
  }, [swarm.agents, swarm.tasks, swarm.messages])

  return (
    <div
      className="flex items-center justify-between px-3 shrink-0 select-none"
      style={{
        height: 44,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(255,255,255,0.01)',
      }}
    >
      {/* LEFT: Back + Name + Status + Timer */}
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          onClick={onBack}
          className="flex items-center justify-center w-6 h-6 shrink-0 hover:bg-white/[0.05] transition-colors"
          style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3, background: 'transparent', color: 'rgba(255,255,255,0.4)' }}
          title="Back to terminals"
        >
          <ArrowLeft className="w-3 h-3" />
        </button>

        <span className="text-[12px] font-black text-white uppercase tracking-widest truncate max-w-[180px]">
          {swarm.config.name}
        </span>

        <div className="flex items-center gap-1.5 shrink-0" style={{ fontFamily: 'monospace', fontSize: 10 }}>
          <span
            className="shrink-0"
            style={{
              width: 5, height: 5, borderRadius: '50%',
              background: isRunning ? '#34d399' : isPaused ? '#fbbf24' : 'rgba(255,255,255,0.25)',
              display: 'inline-block',
              ...(isRunning ? { animation: 'pulse 2s infinite' } : {}),
            }}
          />
          <span style={{ color: isRunning ? '#34d399' : isPaused ? '#fbbf24' : 'rgba(255,255,255,0.4)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {swarm.status}
          </span>
        </div>

        {/* Timer */}
        <span className="text-[10px] text-white/20 shrink-0" style={{ fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }}>
          {mins}:{String(secs).padStart(2, '0')}
        </span>

        {/* Pipeline stage */}
        <span className="text-[9px] text-white/30 shrink-0" style={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.1em' }}>
          {stageIdx}/{stageTotal} {STAGE_LABELS[currentStage] || currentStage.toUpperCase()}
        </span>
      </div>

      {/* CENTER: View Mode Toggle */}
      <div className="flex" style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
        {VIEW_MODES
          .filter((vm) => !vm.completedOnly || swarm.status === 'completed')
          .map((vm, i) => (
          <button
            key={vm.id}
            onClick={() => onViewModeChange(vm.id)}
            style={{
              padding: '3px 14px',
              fontSize: 9,
              letterSpacing: '0.12em',
              fontWeight: 700,
              fontFamily: 'monospace',
              textTransform: 'uppercase' as const,
              background: viewMode === vm.id ? (vm.id === 'deep' ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.1)') : 'transparent',
              color: viewMode === vm.id ? (vm.id === 'deep' ? '#c084fc' : 'white') : 'rgba(255,255,255,0.3)',
              border: 'none',
              borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {vm.label}
          </button>
        ))}
      </div>

      {/* RIGHT: Inline Metrics + Controls */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Metrics strip */}
        <div className="flex items-center gap-3" style={{ fontFamily: 'monospace', fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
          <MetricPill icon={Users} value={metrics.agents} />
          <MetricPill icon={ListTodo} value={metrics.tasks} />
          <MetricPill icon={MessageSquare} value={metrics.messages} />
          <MetricPill icon={FileText} value={metrics.files} />
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.06)' }} />

        {/* Control buttons */}
        {isRunning && (
          <button
            onClick={onPause}
            className="flex items-center gap-1 px-2.5 py-1 hover:bg-white/[0.05] transition-colors"
            style={{ borderRadius: 3, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: 9, fontFamily: 'monospace', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer' }}
          >
            <Pause className="w-2.5 h-2.5" />
          </button>
        )}
        {isPaused && (
          <button
            onClick={onResume}
            className="flex items-center gap-1 px-2.5 py-1 hover:bg-emerald-500/20 transition-colors"
            style={{ borderRadius: 3, border: '1px solid rgba(52,211,153,0.25)', background: 'rgba(52,211,153,0.08)', color: '#34d399', fontSize: 9, fontFamily: 'monospace', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer' }}
          >
            <Play className="w-2.5 h-2.5" />
          </button>
        )}

        <button
          onClick={onStop}
          className="flex items-center gap-1 px-2.5 py-1 hover:bg-rose-500/20 transition-colors"
          style={{ borderRadius: 3, border: '1px solid rgba(239,68,68,0.15)', background: 'rgba(239,68,68,0.05)', color: '#ef4444', fontSize: 9, fontFamily: 'monospace', fontWeight: 700, cursor: 'pointer' }}
        >
          <Square className="w-2.5 h-2.5" />
        </button>
      </div>
    </div>
  )
}

// ─── Metric Pill ─────────────────────────────────────────────

function MetricPill({ icon: Icon, value }: { icon: typeof Users; value: number }) {
  return (
    <div className="flex items-center gap-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
      <Icon className="w-3 h-3" style={{ opacity: 0.5 }} />
      <span style={{ fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>{value}</span>
    </div>
  )
}
