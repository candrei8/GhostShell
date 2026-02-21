import { useState, useMemo, useEffect } from 'react'
import {
  X,
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
import { useActivityStore } from '../../stores/activityStore'
import { useAgentStore } from '../../stores/agentStore'
import { SubAgent, SubAgentType } from '../../lib/types'
import { domainConfig } from '../../lib/domain-detector'
import { SubAgentOutputLog } from './SubAgentOutputLog'

interface SubAgentMonitorProps {
  height: number
  onClose: () => void
}

const typeConfig: Record<SubAgentType, { icon: React.ElementType; label: string; color: string }> = {
  Explore: { icon: Search, label: 'Explore', color: 'text-cyan-400' },
  Plan: { icon: Map, label: 'Plan', color: 'text-purple-400' },
  Bash: { icon: Terminal, label: 'Bash', color: 'text-orange-400' },
  'general-purpose': { icon: Wrench, label: 'General', color: 'text-blue-400' },
  unknown: { icon: Cpu, label: 'Agent', color: 'text-indigo-400' },
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

function DomainBadge({ domain }: { domain?: string }) {
  if (!domain) return null
  const cfg = domainConfig[domain as keyof typeof domainConfig] || domainConfig.general
  return (
    <span className={`text-[10px] px-1.5 py-px rounded ${cfg.bgColor} ${cfg.color} font-medium`}>
      {cfg.label}
    </span>
  )
}

function SubAgentListItem({
  agent,
  selected,
  onClick,
}: {
  agent: SubAgent
  selected: boolean
  onClick: () => void
}) {
  const config = typeConfig[agent.type] || typeConfig.unknown
  const Icon = config.icon
  const StatusIcon = statusIcons[agent.status] || Loader2
  const isActive = agent.status === 'running' || agent.status === 'spawning'

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-all ${
        selected
          ? 'bg-ghost-accent/10 border border-ghost-accent/20'
          : 'hover:bg-white/5 border border-transparent'
      }`}
    >
      <Icon className={`w-3.5 h-3.5 ${config.color} shrink-0`} />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-ghost-text truncate leading-tight">{agent.description}</p>
        <div className="flex items-center gap-1 mt-0.5">
          <DomainBadge domain={agent.domain} />
          <span className="text-[10px] text-ghost-text-dim/50 font-mono tabular-nums">
            {formatDuration(agent.startTime, agent.endTime)}
          </span>
        </div>
      </div>
      <StatusIcon
        className={`w-3 h-3 shrink-0 ${
          agent.status === 'completed' ? 'text-green-500' :
          agent.status === 'error' ? 'text-red-500' :
          isActive ? `${config.color} animate-spin` :
          'text-ghost-text-dim/40'
        }`}
      />
    </button>
  )
}

export function SubAgentMonitor({ height, onClose }: SubAgentMonitorProps) {
  const activities = useActivityStore((s) => s.activities)
  const agents = useAgentStore((s) => s.agents)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [selectedSubAgentId, setSelectedSubAgentId] = useState<string | null>(null)

  // Gather all sub-agents across all agents
  const agentsWithSubAgents = useMemo(() => {
    return agents
      .map((a) => {
        const activity = activities[a.id]
        return {
          agent: a,
          subAgents: activity?.subAgents || [],
        }
      })
      .filter((a) => a.subAgents.length > 0)
  }, [agents, activities])

  // Auto-select first agent that has sub-agents
  useEffect(() => {
    if (!selectedAgentId && agentsWithSubAgents.length > 0) {
      setSelectedAgentId(agentsWithSubAgents[0].agent.id)
    }
  }, [agentsWithSubAgents, selectedAgentId])

  // Current agent's sub-agents
  const currentSubAgents = useMemo(() => {
    if (!selectedAgentId) return []
    const activity = activities[selectedAgentId]
    return [...(activity?.subAgents || [])].sort((a, b) => b.startTime - a.startTime)
  }, [selectedAgentId, activities])

  // Auto-select newest running sub-agent
  useEffect(() => {
    const running = currentSubAgents.find((s) => s.status === 'running' || s.status === 'spawning')
    if (running) {
      setSelectedSubAgentId(running.id)
    } else if (currentSubAgents.length > 0 && !currentSubAgents.find((s) => s.id === selectedSubAgentId)) {
      setSelectedSubAgentId(currentSubAgents[0].id)
    }
  }, [currentSubAgents, selectedSubAgentId])

  const selectedSubAgent = currentSubAgents.find((s) => s.id === selectedSubAgentId)
  const selectedConfig = selectedSubAgent ? (typeConfig[selectedSubAgent.type] || typeConfig.unknown) : null

  return (
    <div
      className="flex flex-col bg-ghost-surface border-t border-ghost-border overflow-hidden shrink-0"
      style={{ height }}
    >
      {/* Header */}
      <div className="h-8 flex items-center px-3 gap-2 bg-ghost-sidebar/50 border-b border-ghost-border/50 shrink-0">
        <Cpu className="w-3.5 h-3.5 text-indigo-400" />
        <span className="text-xs font-semibold text-ghost-text">Sub-Agent Monitor</span>

        {/* Agent tabs */}
        <div className="flex items-center gap-1 ml-3 flex-1 overflow-x-auto">
          {agentsWithSubAgents.map(({ agent, subAgents }) => {
            const activeCount = subAgents.filter((s) => s.status === 'running' || s.status === 'spawning').length
            return (
              <button
                key={agent.id}
                onClick={() => setSelectedAgentId(agent.id)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors shrink-0 ${
                  selectedAgentId === agent.id
                    ? 'bg-ghost-accent/15 text-ghost-accent'
                    : 'text-ghost-text-dim hover:bg-white/5 hover:text-ghost-text'
                }`}
              >
                <span className="truncate max-w-[100px]">{agent.name}</span>
                <span className={`text-[10px] px-1 py-px rounded ${
                  activeCount > 0 ? 'bg-green-500/15 text-green-400' : 'bg-white/5 text-ghost-text-dim/50'
                }`}>
                  {subAgents.length}
                </span>
              </button>
            )
          })}
        </div>

        <button
          onClick={onClose}
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 text-ghost-text-dim hover:text-ghost-text transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sub-agent list */}
        <div className="w-56 border-r border-ghost-border/50 overflow-y-auto p-1.5 shrink-0">
          {currentSubAgents.length === 0 ? (
            <div className="flex items-center justify-center h-full text-ghost-text-dim/40 text-xs">
              No sub-agents yet
            </div>
          ) : (
            currentSubAgents.map((sa) => (
              <SubAgentListItem
                key={sa.id}
                agent={sa}
                selected={selectedSubAgentId === sa.id}
                onClick={() => setSelectedSubAgentId(sa.id)}
              />
            ))
          )}
        </div>

        {/* Detail pane */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedSubAgent && selectedConfig ? (
            <>
              {/* Detail header */}
              <div className="flex items-center gap-2 px-3 py-1.5 border-b border-ghost-border/30 shrink-0">
                <selectedConfig.icon className={`w-4 h-4 ${selectedConfig.color}`} />
                <span className={`text-xs font-semibold ${selectedConfig.color}`}>
                  {selectedConfig.label}
                </span>
                <DomainBadge domain={selectedSubAgent.domain} />
                {selectedSubAgent.model && (
                  <span className="text-[10px] px-1.5 py-px rounded bg-white/5 text-ghost-text-dim/60">
                    {selectedSubAgent.model}
                  </span>
                )}
                <span className={`text-[10px] ml-auto ${
                  selectedSubAgent.status === 'running' ? 'text-green-400' :
                  selectedSubAgent.status === 'completed' ? 'text-ghost-text-dim' :
                  selectedSubAgent.status === 'error' ? 'text-red-400' :
                  'text-yellow-400'
                }`}>
                  {selectedSubAgent.status}
                </span>
                <span className="text-[10px] text-ghost-text-dim/50 font-mono tabular-nums">
                  {formatDuration(selectedSubAgent.startTime, selectedSubAgent.endTime)}
                </span>
              </div>
              {/* Description */}
              <div className="px-3 py-1 border-b border-ghost-border/20 shrink-0">
                <p className="text-[11px] text-ghost-text-dim leading-snug">{selectedSubAgent.description}</p>
              </div>
              {/* Output log */}
              <SubAgentOutputLog lines={selectedSubAgent.outputLines || []} />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-ghost-text-dim/30 text-xs">
              Select a sub-agent to view its output
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
