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
import { formatDuration, smartTruncatePath } from '../../lib/formatUtils'

interface SubAgentNodeProps {
  subAgent: SubAgent
  now: number
}

const typeConfig: Record<SubAgentType, {
  icon: React.ElementType
  label: string
  color: string
  bgColor: string
}> = {
  Explore: { icon: Search, label: 'Explore', color: 'text-cyan-400', bgColor: 'bg-cyan-400/8' },
  Plan: { icon: Map, label: 'Plan', color: 'text-purple-400', bgColor: 'bg-purple-400/8' },
  Bash: { icon: Terminal, label: 'Bash', color: 'text-orange-400', bgColor: 'bg-orange-400/8' },
  'general-purpose': { icon: Wrench, label: 'General', color: 'text-blue-400', bgColor: 'bg-blue-400/8' },
  unknown: { icon: Cpu, label: 'Agent', color: 'text-indigo-400', bgColor: 'bg-indigo-400/8' },
}

const statusIcons: Record<string, React.ElementType> = {
  spawning: Sparkles,
  running: Loader2,
  completed: CheckCircle2,
  error: XCircle,
}

function formatToolUse(text: string): string {
  // Try to extract tool name and argument: "Read(src/foo.ts)" / "Glob(**/*.tsx)"
  const match = text.match(/^(\w+)\((.+)\)$/)
  if (match) {
    return `${match[1]}(${smartTruncatePath(match[2], 30)})`
  }
  // Otherwise truncate raw text
  return text.length > 50 ? text.slice(0, 49) + '\u2026' : text
}

export function SubAgentNode({ subAgent, now }: SubAgentNodeProps) {
  const config = typeConfig[subAgent.type] || typeConfig.unknown
  const Icon = config.icon
  const StatusIcon = statusIcons[subAgent.status] || Loader2
  const isActive = subAgent.status === 'running' || subAgent.status === 'spawning'
  const isCompleted = subAgent.status === 'completed'

  const outputLines = subAgent.outputLines || []
  const lastOutput = outputLines.length > 0 ? outputLines[outputLines.length - 1] : null
  const moreCount = outputLines.length > 1 ? outputLines.length - 1 : 0

  return (
    <div
      className={`rounded-lg px-2.5 py-1.5 transition-all ${
        isActive
          ? `${config.bgColor} border border-white/5`
          : isCompleted
          ? 'opacity-50'
          : ''
      }`}
    >
      {/* Main row */}
      <div className="flex items-center gap-2 min-w-0">
        <Icon className={`w-3.5 h-3.5 shrink-0 ${config.color}`} />
        <span className={`text-[11px] font-semibold shrink-0 ${isActive ? config.color : 'text-ghost-text-dim'}`}>
          {config.label}
        </span>
        <span className="text-[11px] text-ghost-text-dim/70 truncate flex-1 min-w-0">
          {subAgent.description}
        </span>
        <span className="text-[10px] font-mono tabular-nums text-ghost-text-dim shrink-0">
          {formatDuration(subAgent.startTime, subAgent.endTime || now)}
        </span>
        <StatusIcon
          className={`w-3 h-3 shrink-0 ${
            subAgent.status === 'completed' ? 'text-green-500' :
            subAgent.status === 'error' ? 'text-red-500' :
            isActive ? `${config.color} animate-spin` :
            'text-ghost-text-dim/40'
          }`}
        />
      </div>

      {/* Last tool use line */}
      {lastOutput && (
        <div className="flex items-center gap-1 mt-1 ml-5">
          <span className="text-[10px] text-ghost-text-dim/40 select-none">{'\u2514\u2500'}</span>
          <span className="text-[10px] text-ghost-text-dim/60 font-mono truncate">
            {formatToolUse(lastOutput.text)}
          </span>
          {moreCount > 0 && (
            <span className="text-[10px] text-ghost-text-dim/30 shrink-0">
              +{moreCount} more
            </span>
          )}
        </div>
      )}
    </div>
  )
}
