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
  CircleDot,
  Circle,
  FileText,
  Copy,
  Crown,
} from 'lucide-react'
import { useActivityStore } from '../../stores/activityStore'
import { useAgentStore } from '../../stores/agentStore'
import { SubAgent, SubAgentType, TaskItem, FileTouch, ContextMetrics } from '../../lib/types'
import { domainConfig } from '../../lib/domain-detector'

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

function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`
  return String(n)
}

function formatCost(n: number): string {
  if (n === 0) return '$0'
  if (n < 0.01) return '<$0.01'
  return `$${n.toFixed(2)}`
}

function truncatePath(path: string, maxLen = 30): string {
  if (path.length <= maxLen) return path
  const parts = path.replace(/\\/g, '/').split('/')
  const file = parts.pop() || ''
  if (file.length >= maxLen) return '...' + file.slice(-(maxLen - 3))
  const remaining = maxLen - file.length - 4 // ".../"
  if (remaining <= 0) return '.../' + file
  const dir = parts.join('/')
  return '...' + dir.slice(-remaining) + '/' + file
}

// ─── Task Column ──────────────────────────────────────────────

function TaskStatusIcon({ status }: { status: TaskItem['status'] }) {
  if (status === 'completed') return <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
  if (status === 'in_progress') return <Loader2 className="w-3 h-3 text-cyan-400 animate-spin shrink-0" />
  return <Circle className="w-3 h-3 text-ghost-text-dim/40 shrink-0" />
}

function TaskListItem({ task }: { task: TaskItem }) {
  return (
    <div
      className={`flex items-start gap-1.5 px-2 py-1 rounded-md transition-colors ${
        task.status === 'in_progress' ? 'bg-cyan-500/8' : ''
      }`}
    >
      <TaskStatusIcon status={task.status} />
      <div className="flex-1 min-w-0">
        <p
          className={`text-[11px] leading-tight truncate ${
            task.status === 'completed'
              ? 'text-ghost-text-dim/50 line-through'
              : task.status === 'in_progress'
                ? 'text-ghost-text'
                : 'text-ghost-text-dim'
          }`}
        >
          {task.subject}
        </p>
        {task.status === 'in_progress' && task.activeForm && (
          <p className="text-[10px] text-cyan-400/70 truncate mt-0.5">{task.activeForm}</p>
        )}
      </div>
    </div>
  )
}

function TasksColumn({ tasks }: { tasks: TaskItem[] }) {
  const grouped = useMemo(() => {
    const inProgress = tasks.filter((t) => t.status === 'in_progress')
    const pending = tasks.filter((t) => t.status === 'pending')
    const completed = tasks.filter((t) => t.status === 'completed')
    return { inProgress, pending, completed }
  }, [tasks])

  if (tasks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-ghost-text-dim/30 text-xs px-3">
        <div className="text-center">
          <CircleDot className="w-5 h-5 mx-auto mb-1.5 opacity-40" />
          <p>No tasks yet</p>
          <p className="text-[10px] mt-0.5 opacity-60">Tasks appear as the agent creates them</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
      {grouped.inProgress.map((t) => (
        <TaskListItem key={t.id} task={t} />
      ))}
      {grouped.pending.map((t) => (
        <TaskListItem key={t.id} task={t} />
      ))}
      {grouped.completed.length > 0 && (
        <>
          {(grouped.inProgress.length > 0 || grouped.pending.length > 0) && (
            <div className="border-t border-ghost-border/20 my-1" />
          )}
          {grouped.completed.map((t) => (
            <TaskListItem key={t.id} task={t} />
          ))}
        </>
      )}
    </div>
  )
}

// ─── Sub-Agents Column ────────────────────────────────────────

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
  expanded,
  onClick,
}: {
  agent: SubAgent
  expanded: boolean
  onClick: () => void
}) {
  const config = typeConfig[agent.type] || typeConfig.unknown
  const Icon = config.icon
  const StatusIcon = statusIcons[agent.status] || Loader2
  const isActive = agent.status === 'running' || agent.status === 'spawning'

  return (
    <div>
      <button
        onClick={onClick}
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-all ${
          isActive ? 'bg-white/5' : 'hover:bg-white/3'
        } ${expanded ? 'bg-ghost-accent/8 border border-ghost-accent/15' : 'border border-transparent'}`}
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
            agent.status === 'completed'
              ? 'text-green-500'
              : agent.status === 'error'
                ? 'text-red-500'
                : isActive
                  ? `${config.color} animate-spin`
                  : 'text-ghost-text-dim/40'
          }`}
        />
      </button>
      {expanded && (
        <div className="px-2 py-1.5 ml-5 border-l border-ghost-border/20">
          <p className="text-[11px] text-ghost-text-dim leading-snug">{agent.description}</p>
          <div className="flex items-center gap-2 mt-1">
            {agent.model && (
              <span className="text-[10px] px-1.5 py-px rounded bg-white/5 text-ghost-text-dim/60">
                {agent.model}
              </span>
            )}
            <span
              className={`text-[10px] ${
                agent.status === 'running'
                  ? 'text-green-400'
                  : agent.status === 'completed'
                    ? 'text-ghost-text-dim'
                    : agent.status === 'error'
                      ? 'text-red-400'
                      : 'text-yellow-400'
              }`}
            >
              {agent.status}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function SubAgentsColumn({ subAgents }: { subAgents: SubAgent[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const sorted = useMemo(
    () => [...subAgents].sort((a, b) => b.startTime - a.startTime),
    [subAgents],
  )

  if (sorted.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-ghost-text-dim/30 text-xs px-3">
        <div className="text-center">
          <Cpu className="w-5 h-5 mx-auto mb-1.5 opacity-40" />
          <p>No sub-agents yet</p>
          <p className="text-[10px] mt-0.5 opacity-60">Sub-agents spawn as the agent works</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
      {sorted.map((sa) => (
        <SubAgentListItem
          key={sa.id}
          agent={sa}
          expanded={expandedId === sa.id}
          onClick={() => setExpandedId(expandedId === sa.id ? null : sa.id)}
        />
      ))}
    </div>
  )
}

// ─── Files & Context Column ───────────────────────────────────

const opConfig = {
  write: { color: 'bg-green-500', label: 'write' },
  edit: { color: 'bg-yellow-500', label: 'edit' },
  read: { color: 'bg-blue-500', label: 'read' },
} as const

function FileTouchItem({ touch }: { touch: FileTouch }) {
  const [copied, setCopied] = useState(false)
  const op = opConfig[touch.operation]

  const handleCopy = () => {
    navigator.clipboard.writeText(touch.path).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  return (
    <button
      onClick={handleCopy}
      className="w-full flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-white/5 text-left group transition-colors"
      title={touch.path}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${op.color} shrink-0`} />
      <span className="text-[11px] text-ghost-text truncate flex-1 font-mono">
        {truncatePath(touch.path)}
      </span>
      <span className="text-[10px] text-ghost-text-dim/40">{op.label}</span>
      <Copy
        className={`w-2.5 h-2.5 shrink-0 transition-opacity ${
          copied ? 'text-green-400 opacity-100' : 'text-ghost-text-dim/30 opacity-0 group-hover:opacity-100'
        }`}
      />
    </button>
  )
}

function CompactContextGauge({ metrics }: { metrics: ContextMetrics }) {
  const pct = useMemo(() => {
    if (metrics.maxTokens === 0) return 0
    return Math.min(100, Math.round((metrics.tokenEstimate / metrics.maxTokens) * 100))
  }, [metrics.tokenEstimate, metrics.maxTokens])

  const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-ghost-accent'

  return (
    <div className="px-2 py-1.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-ghost-text-dim uppercase tracking-wider font-medium">
          Context
        </span>
        <span className="text-[10px] text-ghost-text-dim font-mono tabular-nums">
          {formatTokens(metrics.tokenEstimate)} / {formatTokens(metrics.maxTokens)}
        </span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-[10px] text-ghost-text-dim font-mono tabular-nums">
          Turn {metrics.turnCount}
        </span>
        <span className="text-[10px] text-ghost-text-dim font-mono tabular-nums">
          {formatCost(metrics.costEstimate)}
        </span>
      </div>
    </div>
  )
}

function FilesContextColumn({
  filesTouched,
  contextMetrics,
}: {
  filesTouched: FileTouch[]
  contextMetrics: ContextMetrics
}) {
  const recentFiles = useMemo(() => {
    // Deduplicate: keep latest touch per path
    const map = new Map<string, FileTouch>()
    for (const t of filesTouched) {
      map.set(t.path, t)
    }
    return Array.from(map.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 15)
  }, [filesTouched])

  const hasContext = contextMetrics.tokenEstimate > 0

  return (
    <div className="flex flex-col h-full">
      {/* Files section */}
      <div className="flex-1 overflow-y-auto">
        {recentFiles.length === 0 ? (
          <div className="flex items-center justify-center h-full text-ghost-text-dim/30 text-xs px-3">
            <div className="text-center">
              <FileText className="w-5 h-5 mx-auto mb-1.5 opacity-40" />
              <p>No files touched</p>
              <p className="text-[10px] mt-0.5 opacity-60">File operations appear here</p>
            </div>
          </div>
        ) : (
          <div className="p-1 space-y-px">
            {recentFiles.map((t) => (
              <FileTouchItem key={`${t.path}-${t.timestamp}`} touch={t} />
            ))}
          </div>
        )}
      </div>

      {/* Context gauge - bottom */}
      {hasContext && (
        <div className="border-t border-ghost-border/30 shrink-0">
          <CompactContextGauge metrics={contextMetrics} />
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────

export function SubAgentMonitor({ height, onClose }: SubAgentMonitorProps) {
  const activities = useActivityStore((s) => s.activities)
  const agents = useAgentStore((s) => s.agents)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)

  // Agents that have any activity worth showing
  const agentsWithActivity = useMemo(() => {
    return agents
      .map((a) => {
        const activity = activities[a.id]
        return {
          agent: a,
          subAgents: activity?.subAgents || [],
          tasks: activity?.tasks || [],
          filesTouched: activity?.filesTouched || [],
          contextMetrics: activity?.contextMetrics,
        }
      })
      .filter(
        (a) => a.subAgents.length > 0 || a.tasks.length > 0 || a.filesTouched.length > 0,
      )
  }, [agents, activities])

  // Auto-select first agent with activity
  useEffect(() => {
    if (!selectedAgentId && agentsWithActivity.length > 0) {
      setSelectedAgentId(agentsWithActivity[0].agent.id)
    }
  }, [agentsWithActivity, selectedAgentId])

  // Current agent data
  const current = useMemo(() => {
    if (!selectedAgentId) return null
    const activity = activities[selectedAgentId]
    if (!activity) return null
    return {
      subAgents: activity.subAgents,
      tasks: activity.tasks,
      filesTouched: activity.filesTouched,
      contextMetrics: activity.contextMetrics,
    }
  }, [selectedAgentId, activities])

  // Summary stats for header
  const stats = useMemo(() => {
    if (!current) return null
    const activeTasks = current.tasks.filter((t) => t.status === 'in_progress').length
    const activeSubAgents = current.subAgents.filter(
      (s) => s.status === 'running' || s.status === 'spawning',
    ).length
    return {
      tasks: current.tasks.length,
      activeTasks,
      subAgents: current.subAgents.length,
      activeSubAgents,
      files: current.filesTouched.length,
    }
  }, [current])

  return (
    <div
      className="flex flex-col bg-ghost-surface border-t border-ghost-border overflow-hidden shrink-0"
      style={{ height }}
    >
      {/* Header */}
      <div className="h-8 flex items-center px-3 gap-2 bg-ghost-sidebar/50 border-b border-ghost-border/50 shrink-0">
        <Crown className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-xs font-semibold text-ghost-text">Orchestrator</span>

        {/* Agent tabs */}
        <div className="flex items-center gap-1 ml-2 overflow-x-auto">
          {agentsWithActivity.map(({ agent, subAgents }) => {
            const activeCount = subAgents.filter(
              (s) => s.status === 'running' || s.status === 'spawning',
            ).length
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
                {activeCount > 0 && (
                  <span className="text-[10px] px-1 py-px rounded bg-green-500/15 text-green-400">
                    {activeCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Stats summary */}
        {stats && (
          <div className="ml-auto flex items-center gap-2 text-[10px] text-ghost-text-dim/60 font-mono tabular-nums mr-2">
            {stats.tasks > 0 && (
              <span>
                {stats.tasks} task{stats.tasks !== 1 ? 's' : ''}
                {stats.activeTasks > 0 && (
                  <span className="text-cyan-400"> ({stats.activeTasks} active)</span>
                )}
              </span>
            )}
            {stats.subAgents > 0 && (
              <span>
                {stats.subAgents} sub-agent{stats.subAgents !== 1 ? 's' : ''}
              </span>
            )}
            {stats.files > 0 && (
              <span>
                {stats.files} file{stats.files !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}

        <button
          onClick={onClose}
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 text-ghost-text-dim hover:text-ghost-text transition-colors shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 3-column content */}
      {current ? (
        <div className="flex-1 flex overflow-hidden">
          {/* Column 1: Tasks (35%) */}
          <div className="flex flex-col border-r border-ghost-border/30" style={{ width: '35%' }}>
            <div className="px-2 py-1 border-b border-ghost-border/20 shrink-0">
              <span className="text-[10px] text-ghost-text-dim uppercase tracking-wider font-medium">
                Tasks
              </span>
            </div>
            <TasksColumn tasks={current.tasks} />
          </div>

          {/* Column 2: Sub-agents (40%) */}
          <div className="flex flex-col border-r border-ghost-border/30" style={{ width: '40%' }}>
            <div className="px-2 py-1 border-b border-ghost-border/20 shrink-0">
              <span className="text-[10px] text-ghost-text-dim uppercase tracking-wider font-medium">
                Sub-agents
              </span>
            </div>
            <SubAgentsColumn subAgents={current.subAgents} />
          </div>

          {/* Column 3: Files & Context (25%) */}
          <div className="flex flex-col" style={{ width: '25%' }}>
            <div className="px-2 py-1 border-b border-ghost-border/20 shrink-0">
              <span className="text-[10px] text-ghost-text-dim uppercase tracking-wider font-medium">
                Files & Context
              </span>
            </div>
            <FilesContextColumn
              filesTouched={current.filesTouched}
              contextMetrics={current.contextMetrics}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-ghost-text-dim/30 text-xs">
          <div className="text-center">
            <Crown className="w-6 h-6 mx-auto mb-2 opacity-30" />
            <p>No orchestrator activity</p>
            <p className="text-[10px] mt-1 opacity-60">
              Launch an agent to see tasks, sub-agents, and file operations
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
