import { useState, useEffect, useMemo } from 'react'
import { MoreHorizontal, RotateCw, Send, ChevronDown, ChevronRight } from 'lucide-react'
import { Agent } from '../../lib/types'
import { useAgentStore } from '../../stores/agentStore'
import { useTerminalStore } from '../../stores/terminalStore'
import { useActivityStore } from '../../stores/activityStore'
import { useAgent } from '../../hooks/useAgent'
import { resolveProvider, getProviderColor } from '../../lib/providers'
import { getActivityConfig } from './ActivityIcon'
import { formatDuration, formatTokens, formatCost } from '../../lib/formatUtils'
import { getContextUsagePercentage, hasContextMetrics } from '../../lib/contextMetrics'
import { SubAgentNode } from './SubAgentNode'
import { TaskChecklist } from './TaskChecklist'
import { AgentContextMenu } from './AgentContextMenu'

interface OrchestratorSectionProps {
  agent: Agent
}

export function OrchestratorSection({ agent }: OrchestratorSectionProps) {
  const [now, setNow] = useState(() => Date.now())
  const [collapsed, setCollapsed] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showCompletedSubs, setShowCompletedSubs] = useState(false)
  const [promptInput, setPromptInput] = useState('')
  const [showPrompt, setShowPrompt] = useState(false)

  const setActiveAgent = useAgentStore((s) => s.setActiveAgent)
  const setActiveSession = useTerminalStore((s) => s.setActiveSession)
  const activity = useActivityStore((s) => s.activities[agent.id])
  const { restartAgent, submitPromptToAgent } = useAgent()

  const isAlive = agent.status !== 'offline' && agent.status !== 'error' && !!agent.terminalId
  const isWorking = agent.status === 'working'
  const agentProvider = resolveProvider(agent)
  const providerColor = getProviderColor(agentProvider)

  // 1-second tick for live durations
  useEffect(() => {
    if (!isWorking) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [isWorking])

  // Derived data
  const activeSubAgents = useMemo(
    () => (activity?.subAgents || []).filter((s) => s.status === 'running' || s.status === 'spawning'),
    [activity?.subAgents],
  )
  const completedSubAgents = useMemo(
    () => (activity?.subAgents || []).filter((s) => s.status === 'completed' || s.status === 'error'),
    [activity?.subAgents],
  )
  const sortedTasks = activity?.tasks || []
  const metrics = activity?.contextMetrics
  const filesTouchedCount = activity?.filesTouched.length || 0

  const handleClick = () => {
    setActiveAgent(agent.id)
    if (agent.terminalId) setActiveSession(agent.terminalId)
  }

  const handleSendPrompt = (e: React.FormEvent) => {
    e.preventDefault()
    if (promptInput.trim()) {
      submitPromptToAgent(agent.id, promptInput.trim())
      setPromptInput('')
      setShowPrompt(false)
    }
  }

  // Token bar percentage + color
  const tokenPct = Math.round(getContextUsagePercentage(metrics) || 0)
  const barColor = tokenPct >= 90 ? 'bg-red-500' : tokenPct >= 70 ? 'bg-yellow-500' : 'bg-ghost-accent'

  // Current activity config for pill
  const currentActivity = activity?.currentActivity
  const activityConfig = currentActivity && currentActivity !== 'idle'
    ? getActivityConfig(currentActivity)
    : null

  return (
    <div className="flex flex-col px-3 pt-2 pb-1">
      {/* 1. Agent Header — click name to switch terminal, chevron to collapse */}
      <div className="flex items-center gap-1.5 h-8 group">
        {/* Collapse toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); setCollapsed(!collapsed) }}
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-800 transition-colors shrink-0"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed
            ? <ChevronRight className="w-3 h-3 text-ghost-text-dim" />
            : <ChevronDown className="w-3 h-3 text-ghost-text-dim" />
          }
        </button>

        {/* Status dot */}
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            isWorking ? 'bg-ghost-success animate-pulse' : 'bg-ghost-text-dim/40'
          }`}
        />

        {/* Agent name — click to switch terminal */}
        <button
          onClick={handleClick}
          className="text-xs font-semibold text-ghost-text truncate flex-1 min-w-0 text-left hover:text-ghost-accent transition-colors"
        >
          {agent.name}
        </button>

        {/* Collapsed inline summary */}
        {collapsed && activityConfig && (
          <span
            className={`inline-flex items-center gap-0.5 ${activityConfig.bgColor} ${activityConfig.color} border ${activityConfig.borderColor} px-1.5 py-px rounded text-[9px] font-medium shrink-0`}
          >
            <activityConfig.icon className="w-2.5 h-2.5" />
            {activityConfig.label}
          </span>
        )}
        {collapsed && (activeSubAgents.length > 0 || sortedTasks.length > 0) && (
          <span className="text-[9px] text-ghost-text-dim/40 shrink-0">
            {activeSubAgents.length > 0 && `${activeSubAgents.length}sub`}
            {activeSubAgents.length > 0 && sortedTasks.length > 0 && ' '}
            {sortedTasks.length > 0 && `${sortedTasks.length}t`}
          </span>
        )}

        {/* Provider badge (non-Claude only) */}
        {agentProvider === 'gemini' && (
          <span
            className="text-[9px] px-1 py-px rounded font-bold text-white/90 shrink-0"
            style={{ backgroundColor: providerColor }}
          >
            G
          </span>
        )}
        {agentProvider === 'codex' && (
          <span
            className="text-[9px] px-1 py-px rounded font-bold text-white/90 shrink-0"
            style={{ backgroundColor: providerColor }}
          >
            O
          </span>
        )}

        {/* Session timer */}
        {activity?.sessionStartTime && (
          <span className="text-[10px] font-mono tabular-nums text-ghost-text-dim shrink-0">
            {formatDuration(activity.sessionStartTime, now)}
          </span>
        )}

        {/* Actions (hover) */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {isAlive ? (
            <button
              onClick={(e) => { e.stopPropagation(); setShowPrompt(!showPrompt) }}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-800 transition-colors"
              title="Send command"
            >
              <Send className="w-3 h-3 text-ghost-text-dim" />
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); restartAgent(agent.id) }}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-ghost-accent/20 transition-colors"
              title="Restart"
            >
              <RotateCw className="w-3 h-3 text-ghost-accent" />
            </button>
          )}
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu) }}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-800 transition-colors"
            >
              <MoreHorizontal className="w-3 h-3 text-ghost-text-dim" />
            </button>
            {showMenu && <AgentContextMenu agent={agent} onClose={() => setShowMenu(false)} />}
          </div>
        </div>
      </div>

      {/* Expanded body */}
      {!collapsed && (
        <>
          {/* 2. Context Stats Bar */}
          {metrics && hasContextMetrics(metrics) && (
            <div className="flex items-center gap-2 h-5 ml-6">
              {/* Mini token bar */}
              <div className="w-12 h-[3px] rounded-full bg-slate-800 overflow-hidden shrink-0" title={`${tokenPct}% context`}>
                <div
                  className={`h-full rounded-full ${barColor} transition-all duration-500`}
                  style={{ width: `${tokenPct}%` }}
                />
              </div>
              <span className="text-[10px] font-mono tabular-nums text-ghost-text-dim">
                {metrics.tokenEstimate > 0
                  ? metrics.maxTokens > 0
                    ? `${formatTokens(metrics.tokenEstimate)} / ${formatTokens(metrics.maxTokens)}`
                    : formatTokens(metrics.tokenEstimate)
                  : typeof metrics.usagePercentage === 'number'
                    ? `${Math.round(metrics.usagePercentage)}% ctx`
                    : 'No data'}
              </span>
              <span className="text-[10px] text-ghost-text-dim/30">|</span>
              <span className="text-[10px] font-mono tabular-nums text-ghost-text-dim">
                T{metrics.turnCount}
              </span>
              <span className="text-[10px] text-ghost-text-dim/30">|</span>
              <span className="text-[10px] font-mono tabular-nums text-ghost-text-dim">
                {formatCost(metrics.costEstimate)}
              </span>
              {filesTouchedCount > 0 && (
                <>
                  <span className="text-[10px] text-ghost-text-dim/30">|</span>
                  <span className="text-[10px] font-mono tabular-nums text-ghost-text-dim">
                    {filesTouchedCount} file{filesTouchedCount !== 1 ? 's' : ''}
                  </span>
                </>
              )}
            </div>
          )}

          {/* 3. Activity Pill */}
          {activityConfig && (
            <div className="ml-6 mt-1">
              <span
                className={`inline-flex items-center gap-1 ${activityConfig.bgColor} ${activityConfig.color} border ${activityConfig.borderColor} px-2 py-0.5 rounded-md text-[10px] font-medium`}
              >
                <activityConfig.icon className="w-3 h-3 shrink-0" />
                <span className="truncate max-w-[180px]">
                  {activityConfig.label}
                  {activity?.currentDetail && (
                    <span className="opacity-80 ml-0.5 font-normal">
                      {activity.currentDetail.length > 30
                        ? activity.currentDetail.slice(0, 29) + '\u2026'
                        : activity.currentDetail}
                    </span>
                  )}
                </span>
              </span>
            </div>
          )}

          {/* 4. Sub-agent Nodes */}
          {activeSubAgents.length > 0 && (
            <div className="flex flex-col gap-1 mt-1.5 ml-4 mc-tree-line">
              {activeSubAgents.map((sub) => (
                <SubAgentNode key={sub.id} subAgent={sub} now={now} />
              ))}
            </div>
          )}

          {/* Completed sub-agents collapsible */}
          {completedSubAgents.length > 0 && (
            <div className="ml-4 mt-1">
              <button
                onClick={(e) => { e.stopPropagation(); setShowCompletedSubs(!showCompletedSubs) }}
                className="flex items-center gap-1 text-[10px] text-ghost-text-dim/40 hover:text-ghost-text-dim/60 transition-colors"
              >
                <ChevronDown className={`w-3 h-3 transition-transform ${showCompletedSubs ? 'rotate-180' : ''}`} />
                {completedSubAgents.length} completed
              </button>
              {showCompletedSubs && (
                <div className="flex flex-col gap-0.5 mt-1 mc-tree-line">
                  {completedSubAgents.map((sub) => (
                    <SubAgentNode key={sub.id} subAgent={sub} now={now} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 5. Task Checklist */}
          {sortedTasks.length > 0 && (
            <div className="mt-1.5 ml-4">
              <TaskChecklist tasks={sortedTasks} now={now} />
            </div>
          )}

          {/* Inline prompt input */}
          {showPrompt && isAlive && (
            <form onSubmit={handleSendPrompt} className="flex items-center gap-1 mt-1.5">
              <input
                type="text"
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                placeholder="Send to terminal..."
                className="flex-1 h-7 px-2 bg-ghost-bg border border-ghost-border rounded-lg text-[11px] text-ghost-text focus:outline-none focus:border-ghost-accent"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Escape') setShowPrompt(false) }}
              />
              <button
                type="submit"
                className="h-7 px-2 text-[11px] bg-indigo-950/50 text-ghost-accent rounded-lg hover:bg-ghost-accent/20 transition-colors"
              >
                Send
              </button>
            </form>
          )}
        </>
      )}

      {/* 6. Separator */}
      <div className="separator-glow mx-1 mt-3" />
    </div>
  )
}
