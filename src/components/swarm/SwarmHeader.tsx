import React, { useState } from 'react'
import { Pause, Play, Square, Clock } from 'lucide-react'
import { Swarm, SwarmStatus } from '../../lib/swarm-types'
import { useSwarmStore } from '../../stores/swarmStore'
import { resumeSwarmRuntime } from '../../lib/swarm-orchestrator'

interface SwarmHeaderProps {
  swarm: Swarm
  now: number
}

const STATUS_COLORS: Record<SwarmStatus, { bg: string; text: string }> = {
  configuring: { bg: 'bg-gray-500/20', text: 'text-gray-400' },
  launching: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  running: { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  paused: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  completed: { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  error: { bg: 'bg-rose-500/20', text: 'text-rose-400' },
}

function formatElapsed(startedAt: number | undefined, now: number): string {
  if (!startedAt) return '0m 0s'
  const totalSeconds = Math.max(0, Math.floor((now - startedAt) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m ${seconds}s`
}

export default function SwarmHeader({ swarm, now }: SwarmHeaderProps) {
  const statusColor = STATUS_COLORS[swarm.status] ?? STATUS_COLORS.configuring
  const isRunning = swarm.status === 'running'
  const isPaused = swarm.status === 'paused'
  const isLaunching = swarm.status === 'launching'

  const [stopArmed, setStopArmed] = useState(false)

  const handleStop = () => {
    if (!stopArmed) {
      setStopArmed(true)
      setTimeout(() => setStopArmed(false), 3000)
      return
    }
    setStopArmed(false)
    // Guard: only complete if swarm is still active
    const current = useSwarmStore.getState().getSwarm(swarm.id)
    if (current && current.status !== 'completed') {
      useSwarmStore.getState().completeSwarm(swarm.id)
    }
  }

  return (
    <div className="flex items-center justify-between px-3 py-3 border-b border-white/10">
      {/* Left: Name + Status badge */}
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-[13px] font-semibold uppercase tracking-[0.15em] text-ghost-text truncate">
          {swarm.config.name}
        </span>
        <span
          className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase flex items-center gap-1.5 ${statusColor.bg} ${statusColor.text}`}
        >
          {isRunning && (
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
            </span>
          )}
          {swarm.status}
        </span>
      </div>

      {/* Right: Timer + Controls */}
      <div className="flex items-center gap-2">
        {/* Elapsed timer */}
        <div className="flex items-center gap-1.5 text-ghost-text-dim text-[11px] mr-1">
          <Clock size={12} />
          <span className="tabular-nums font-mono">{formatElapsed(swarm.startedAt, now)}</span>
        </div>

        {/* Pause (when running or launching) */}
        {(isRunning || isLaunching) && (
          <button
            onClick={() => useSwarmStore.getState().pauseSwarm(swarm.id)}
            title="Pause swarm"
            aria-label="Pause swarm"
            className="h-7 px-2.5 rounded-lg border border-white/10 bg-white/[0.02] text-[10px] font-semibold uppercase text-ghost-text-dim hover:text-ghost-text hover:bg-white/[0.05] transition-colors flex items-center gap-1.5"
          >
            <Pause size={12} />
            Pause
          </button>
        )}

        {/* Resume (when paused) */}
        {isPaused && (
          <button
            onClick={() => {
              useSwarmStore.getState().resumeSwarm(swarm.id)
              resumeSwarmRuntime(swarm.id)
            }}
            title="Resume swarm"
            aria-label="Resume swarm"
            className="h-7 px-2.5 rounded-lg border border-white/10 bg-white/[0.02] text-[10px] font-semibold uppercase text-ghost-text-dim hover:text-ghost-text hover:bg-white/[0.05] transition-colors flex items-center gap-1.5"
          >
            <Play size={12} />
            Resume
          </button>
        )}

        {/* Stop (when running, launching, or paused) — requires double-click */}
        {(isRunning || isPaused || isLaunching) && (
          <button
            onClick={handleStop}
            title={stopArmed ? 'Click again to confirm stop' : 'Stop swarm'}
            aria-label={stopArmed ? 'Confirm stop swarm' : 'Stop swarm'}
            className={`h-7 px-2.5 rounded-lg border text-[10px] font-semibold uppercase transition-colors flex items-center gap-1.5 ${
              stopArmed
                ? 'border-rose-400/40 bg-rose-500/20 text-rose-300'
                : 'border-white/10 bg-white/[0.02] text-rose-400/80 hover:text-rose-400 hover:bg-rose-500/10'
            }`}
          >
            <Square size={12} />
            {stopArmed ? 'Confirm' : 'Stop'}
          </button>
        )}
      </div>
    </div>
  )
}
