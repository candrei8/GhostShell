import { useMemo } from 'react'
import {
  Cpu,
  Search,
  Map,
  Terminal,
  Wrench,
  CheckCircle2,
  XCircle,
  Loader2,
  Sparkles,
} from 'lucide-react'
import { SubAgent, SubAgentType } from '../../lib/types'

interface SubAgentTreeProps {
  subAgents: SubAgent[]
  compact?: boolean
}

const typeConfig: Record<SubAgentType, {
  icon: React.ElementType
  label: string
  color: string
  bgColor: string
}> = {
  Explore: {
    icon: Search,
    label: 'Explore',
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-400/10',
  },
  Plan: {
    icon: Map,
    label: 'Plan',
    color: 'text-purple-400',
    bgColor: 'bg-purple-400/10',
  },
  Bash: {
    icon: Terminal,
    label: 'Bash',
    color: 'text-orange-400',
    bgColor: 'bg-orange-400/10',
  },
  'general-purpose': {
    icon: Wrench,
    label: 'General',
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10',
  },
  unknown: {
    icon: Cpu,
    label: 'Agent',
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-400/10',
  },
}

const statusIcons: Record<string, React.ElementType> = {
  spawning: Sparkles,
  running: Loader2,
  completed: CheckCircle2,
  error: XCircle,
}

function formatDuration(startTime: number, endTime?: number): string {
  const elapsed = (endTime || Date.now()) - startTime
  if (elapsed < 1000) return '<1s'
  if (elapsed < 60000) return `${Math.round(elapsed / 1000)}s`
  const mins = Math.floor(elapsed / 60000)
  const secs = Math.round((elapsed % 60000) / 1000)
  return `${mins}m${secs}s`
}

function SubAgentNode({ agent, isLast }: { agent: SubAgent; isLast: boolean }) {
  const config = typeConfig[agent.type] || typeConfig.unknown
  const Icon = config.icon
  const StatusIcon = statusIcons[agent.status] || Loader2
  const isActive = agent.status === 'running' || agent.status === 'spawning'

  return (
    <div className="flex items-start gap-0 relative">
      {/* Tree connector */}
      <div className="flex flex-col items-center w-4 shrink-0 pt-1.5">
        <div className={`w-px h-2 ${isLast ? 'bg-ghost-border/50' : 'bg-ghost-border/50'}`} />
        <div className="w-2 h-px bg-ghost-border/50" style={{ marginLeft: '0.25rem' }} />
        {!isLast && <div className="w-px flex-1 bg-ghost-border/30" />}
      </div>

      {/* Agent card */}
      <div
        className={`flex-1 flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all ${
          isActive
            ? `${config.bgColor} border border-white/5`
            : 'hover:bg-white/3'
        }`}
      >
        <Icon className={`w-3 h-3 ${config.color} shrink-0`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className={`text-[10px] font-semibold ${isActive ? config.color : 'text-ghost-text-dim'}`}>
              {config.label}
            </span>
            {agent.model && (
              <span className="text-[10px] px-1 py-px rounded-full bg-white/5 text-ghost-text-dim/60">
                {agent.model}
              </span>
            )}
          </div>
          <p className="text-[10px] text-ghost-text-dim/70 truncate leading-tight">
            {agent.description}
          </p>
        </div>

        {/* Status + duration */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] text-ghost-text-dim/50 font-mono tabular-nums">
            {formatDuration(agent.startTime, agent.endTime)}
          </span>
          <StatusIcon
            className={`w-3 h-3 shrink-0 ${
              agent.status === 'completed' ? 'text-green-500' :
              agent.status === 'error' ? 'text-red-500' :
              isActive ? `${config.color} animate-spin` :
              'text-ghost-text-dim/40'
            }`}
          />
        </div>
      </div>
    </div>
  )
}

export function SubAgentTree({ subAgents, compact = false }: SubAgentTreeProps) {
  const sorted = useMemo(() =>
    [...subAgents].sort((a, b) => b.startTime - a.startTime),
    [subAgents],
  )

  const activeCount = sorted.filter((s) => s.status === 'running' || s.status === 'spawning').length
  const displayAgents = compact ? sorted.slice(0, 5) : sorted

  if (displayAgents.length === 0) return null

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 mb-1">
        <Cpu className="w-3 h-3 text-indigo-400" />
        <span className="text-[10px] text-ghost-text-dim uppercase tracking-wider font-semibold">
          Sub-agents
        </span>
        {activeCount > 0 && (
          <span className="text-[10px] px-2 py-px rounded-full bg-indigo-400/15 text-indigo-400 font-medium">
            {activeCount} active
          </span>
        )}
        <span className="text-[10px] text-ghost-text-dim/40">
          ({sorted.length} total)
        </span>
      </div>
      <div className="flex flex-col ml-1">
        {displayAgents.map((agent, i) => (
          <SubAgentNode
            key={agent.id}
            agent={agent}
            isLast={i === displayAgents.length - 1}
          />
        ))}
      </div>
      {compact && sorted.length > 5 && (
        <span className="text-[10px] text-ghost-text-dim/40 ml-5 mt-0.5">
          +{sorted.length - 5} more
        </span>
      )}
    </div>
  )
}
