import { useState, useMemo } from 'react'
import { MoreHorizontal, Folder, X, RotateCw, Send, ShieldOff, FileText, ChevronDown, ChevronUp, Clock } from 'lucide-react'
import { Agent } from '../../lib/types'
import { AgentAvatar } from './AgentAvatar'
import { AgentContextMenu } from './AgentContextMenu'
import { ActivityIcon } from './ActivityIcon'
import { ContextGauge } from './ContextGauge'
import { SubAgentTree } from './SubAgentTree'
import { useAgentStore } from '../../stores/agentStore'
import { useTerminalStore } from '../../stores/terminalStore'
import { useActivityStore } from '../../stores/activityStore'
import { useAgent } from '../../hooks/useAgent'
import { resolveProvider, getProviderColor } from '../../lib/providers'

interface AgentCardProps {
  agent: Agent
}

function getModelShort(model?: string): string {
  if (!model) return ''
  // Claude models
  if (model.includes('opus')) return 'Opus'
  if (model.includes('sonnet')) return 'Sonnet'
  if (model.includes('haiku')) return 'Haiku'
  // Gemini 3 CLI model shortcuts
  if (model === 'pro') return '3 Pro'
  if (model === 'flash') return '3 Flash'
  if (model === 'flash-lite') return 'Flash Lite'
  // Gemini full model IDs (fallback)
  if (model.startsWith('gemini-')) return model.replace('gemini-', '')
  return model
}

function getFolderName(path?: string): string {
  if (!path) return ''
  const parts = path.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || parts[parts.length - 2] || ''
}

function formatElapsed(startTime: number): string {
  const elapsed = Date.now() - startTime
  if (elapsed < 60000) return `${Math.round(elapsed / 1000)}s`
  if (elapsed < 3600000) return `${Math.floor(elapsed / 60000)}m`
  const hrs = Math.floor(elapsed / 3600000)
  const mins = Math.floor((elapsed % 3600000) / 60000)
  return `${hrs}h${mins}m`
}

const statusConfig: Record<Agent['status'], { label: string; dotClass: string; textClass: string; borderClass: string }> = {
  working: {
    label: 'Working',
    dotClass: 'bg-ghost-success',
    textClass: 'text-ghost-success',
    borderClass: 'border-ghost-success/20',
  },
  idle: {
    label: 'Idle',
    dotClass: 'bg-ghost-accent/60',
    textClass: 'text-ghost-text-dim/60',
    borderClass: 'border-ghost-border',
  },
  error: {
    label: 'Error',
    dotClass: 'bg-ghost-error',
    textClass: 'text-ghost-error',
    borderClass: 'border-ghost-error/20',
  },
  offline: {
    label: 'Offline',
    dotClass: 'bg-gray-600',
    textClass: 'text-gray-500',
    borderClass: 'border-gray-600/20',
  },
}

export function AgentCard({ agent }: AgentCardProps) {
  const [showMenu, setShowMenu] = useState(false)
  const [promptInput, setPromptInput] = useState('')
  const [showPrompt, setShowPrompt] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const setActiveAgent = useAgentStore((s) => s.setActiveAgent)
  const setActiveSession = useTerminalStore((s) => s.setActiveSession)
  const activity = useActivityStore((s) => s.activities[agent.id])
  const { deleteAgent, restartAgent, sendToAgent } = useAgent()

  const isAlive = agent.status !== 'offline' && agent.status !== 'error' && !!agent.terminalId
  const canRestart = !isAlive
  const status = statusConfig[agent.status]
  const isWorking = agent.status === 'working'

  const handleClick = () => {
    setActiveAgent(agent.id)
    if (isAlive) {
      if (agent.terminalId) {
        setActiveSession(agent.terminalId)
      }
    } else {
      restartAgent(agent.id)
    }
  }

  const handleRestart = (e: React.MouseEvent) => {
    e.stopPropagation()
    restartAgent(agent.id)
  }

  const handleSendPrompt = (e: React.FormEvent) => {
    e.preventDefault()
    if (promptInput.trim()) {
      sendToAgent(agent.id, promptInput.trim() + '\r')
      setPromptInput('')
      setShowPrompt(false)
    }
  }

  const agentProvider = resolveProvider(agent)
  const modelShort = getModelShort(
    agentProvider === 'gemini' ? agent.geminiConfig?.model : agent.claudeConfig?.model
  )
  const folderName = getFolderName(agent.cwd)
  const isAutoApprove = agentProvider === 'gemini'
    ? agent.geminiConfig?.yolo
    : agent.claudeConfig?.dangerouslySkipPermissions
  const filesTouchedCount = activity?.filesTouched.length || 0
  const subAgentCount = activity?.subAgents.length || 0
  const activeSubAgents = useMemo(() =>
    activity?.subAgents.filter((s) => s.status === 'running' || s.status === 'spawning') || [],
    [activity?.subAgents],
  )

  return (
    <div className="relative">
      <div
        onClick={handleClick}
        className={`group flex flex-col rounded-2xl transition-all cursor-pointer border ${
          isWorking
            ? `${status.borderClass} bg-ghost-success/[0.04] shadow-sm shadow-emerald-500/5`
            : !isAlive
            ? `border-transparent opacity-50 hover:opacity-80 hover:bg-ghost-accent/5`
            : `border-ghost-border/50 hover:bg-slate-800/50`
        }`}
      >
        {/* Main row */}
        <div className="flex items-start gap-3 px-4 py-3">
          {/* Avatar with status ring */}
          <div className="relative mt-0.5">
            <div className={`rounded-full ${isWorking ? 'ring-1 ring-ghost-success/40 ring-offset-1 ring-offset-ghost-sidebar' : ''}`}>
              <AgentAvatar avatar={agent.avatar} size="sm" />
            </div>
            <div
              className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-ghost-sidebar ${status.dotClass}`}
            />
          </div>

          <div className="flex-1 min-w-0">
            {/* Name + badges row */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-ghost-text truncate">{agent.name}</span>
              {agentProvider === 'gemini' && (
                <span
                  className="text-[9px] px-1 py-px rounded-full font-semibold text-white/90 shrink-0"
                  style={{ backgroundColor: getProviderColor('gemini') }}
                  title="Gemini"
                >
                  G
                </span>
              )}
              {isAutoApprove && (
                <span title={agentProvider === 'gemini' ? '--yolo enabled' : 'Skip permissions enabled'}>
                  <ShieldOff className="w-3 h-3 text-orange-400/60 shrink-0" />
                </span>
              )}
            </div>

            {/* Model + folder + session time */}
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {modelShort && (
                <span
                  className="text-[11px] px-2 py-px rounded-full font-semibold"
                  style={{
                    backgroundColor: `${getProviderColor(agentProvider)}15`,
                    color: getProviderColor(agentProvider),
                  }}
                >
                  {modelShort}
                </span>
              )}
              {folderName && (
                <span className="text-[11px] text-ghost-text-dim flex items-center gap-1 truncate">
                  <Folder className="w-3 h-3 shrink-0" />
                  {folderName}
                </span>
              )}
              {activity?.sessionStartTime && isAlive && (
                <span className="text-[11px] text-ghost-text-dim/40 flex items-center gap-1 font-mono tabular-nums">
                  <Clock className="w-3 h-3 shrink-0" />
                  {formatElapsed(activity.sessionStartTime)}
                </span>
              )}
            </div>

            {/* Activity indicator */}
            {activity && activity.currentActivity !== 'idle' && (
              <div className="mt-1">
                <ActivityIcon
                  activity={activity.currentActivity}
                  detail={activity.currentDetail}
                  size="sm"
                  showGlow={false}
                />
              </div>
            )}

            {/* Quick stats bar */}
            {isAlive && (filesTouchedCount > 0 || subAgentCount > 0) && (
              <div className="flex items-center gap-2 mt-1">
                {filesTouchedCount > 0 && (
                  <span className="text-[11px] text-ghost-text-dim/40 flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    {filesTouchedCount}
                  </span>
                )}
                {activeSubAgents.length > 0 && (
                  <span className="text-[11px] text-indigo-400/60 flex items-center gap-1 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                    {activeSubAgents.length} sub-agent{activeSubAgents.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            {isAlive && (subAgentCount > 0 || (activity?.contextMetrics.turnCount || 0) > 0) && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setExpanded(!expanded)
                }}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-800 transition-colors"
                title="Toggle details"
              >
                {expanded ? <ChevronUp className="w-3.5 h-3.5 text-ghost-text-dim" /> : <ChevronDown className="w-3.5 h-3.5 text-ghost-text-dim" />}
              </button>
            )}
            {canRestart ? (
              <button
                onClick={handleRestart}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-ghost-accent/20 transition-colors"
                title="Restart Agent"
              >
                <RotateCw className="w-3.5 h-3.5 text-ghost-accent" />
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setShowPrompt(!showPrompt)
                }}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-800 transition-colors"
                title="Send command"
              >
                <Send className="w-3.5 h-3.5 text-ghost-text-dim" />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowMenu(!showMenu)
              }}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-800 transition-colors"
            >
              <MoreHorizontal className="w-3.5 h-3.5 text-ghost-text-dim" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                deleteAgent(agent.id)
              }}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/20 transition-colors"
              title="Delete Agent"
            >
              <X className="w-3.5 h-3.5 text-ghost-text-dim" />
            </button>
          </div>
        </div>

        {/* Expanded details panel */}
        {expanded && activity && (
          <div className="px-4 pb-4 pt-2 flex flex-col gap-2 border-t border-ghost-border/30 mt-0.5">
            {/* Context gauge */}
            {activity.contextMetrics.turnCount > 0 && (
              <ContextGauge metrics={activity.contextMetrics} />
            )}

            {/* Sub-agent tree */}
            {activity.subAgents.length > 0 && (
              <SubAgentTree subAgents={activity.subAgents} compact />
            )}
          </div>
        )}

        {/* Auto-show active sub-agents even when not expanded */}
        {!expanded && activeSubAgents.length > 0 && (
          <div className="px-3 pb-2">
            {activeSubAgents.slice(0, 2).map((sub) => {
              const typeLabel = sub.type === 'general-purpose' ? 'General' : sub.type
              return (
                <div key={sub.id} className="flex items-center gap-2 text-[11px] text-indigo-300/60 ml-7">
                  <span className="w-1 h-1 rounded-full bg-indigo-400 shrink-0" />
                  <span className="font-medium text-indigo-400/80">{typeLabel}</span>
                  <span className="truncate opacity-60">{sub.description}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Inline prompt input */}
      {showPrompt && isAlive && (
        <form onSubmit={handleSendPrompt} className="flex items-center gap-1 px-3 pb-2">
          <input
            type="text"
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            placeholder="Send to terminal..."
            className="flex-1 h-8 px-3 bg-ghost-bg border border-ghost-border rounded-xl text-xs text-ghost-text focus:outline-none focus:border-ghost-accent"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Escape') setShowPrompt(false) }}
          />
          <button
            type="submit"
            className="h-8 px-3 text-xs bg-indigo-950/50 text-ghost-accent rounded-xl hover:bg-ghost-accent/20 transition-colors"
          >
            Send
          </button>
        </form>
      )}

      {showMenu && <AgentContextMenu agent={agent} onClose={() => setShowMenu(false)} />}
    </div>
  )
}
