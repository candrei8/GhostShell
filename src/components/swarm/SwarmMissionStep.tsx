import { useCallback } from 'react'
import { MessageSquare, Zap } from 'lucide-react'
import { useSwarmStore } from '../../stores/swarmStore'

export function SwarmMissionStep() {
  const mission = useSwarmStore((s) => s.wizard.mission)
  const setMission = useSwarmStore((s) => s.setMission)

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setMission(e.target.value)
    },
    [setMission],
  )

  return (
    <div className="flex flex-col items-center gap-6 px-6 py-8">
      {/* Icon */}
      <div className="w-16 h-16 rounded-2xl bg-white/[0.06] flex items-center justify-center">
        <MessageSquare className="w-7 h-7 text-ghost-text" />
      </div>

      {/* Title */}
      <div className="text-center">
        <h2 className="text-xl font-bold text-ghost-text">Swarm mission</h2>
        <p className="mt-2 text-sm text-ghost-text-dim/80 max-w-md">
          Describe what you want this swarm to build or fix. This is shared with all agents as their mission brief.
        </p>
      </div>

      {/* Textarea */}
      <div className="w-full max-w-2xl">
        <textarea
          value={mission}
          onChange={handleChange}
          placeholder="What should this swarm accomplish? Agents will read this as their mission brief."
          rows={6}
          className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl text-sm text-ghost-text placeholder:text-ghost-text-dim/40 focus:outline-none focus:border-white/20 transition-colors resize-none leading-relaxed"
          autoFocus
        />
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-ghost-text-dim/50">
            {mission.length > 0 ? `${mission.length} characters` : 'Required to proceed'}
          </p>
        </div>
      </div>

      {/* Info pill */}
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/10">
        <Zap className="w-3.5 h-3.5 text-ghost-text-dim shrink-0" />
        <span className="text-xs text-ghost-text-dim">
          Shared with all agents so they can coordinate and stay aligned.
        </span>
      </div>
    </div>
  )
}
