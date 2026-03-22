// SwarmCommandCenter — Operator Command Center (God's Eye View)
// Glass UI panel for mid-run operator interventions: broadcast, redirect, amend, inject context

import { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Radio,
  Send,
  ChevronDown,
  ChevronRight,
  FileEdit,
  MessageSquare,
  AlertTriangle,
  Crosshair,
  Syringe,
  ListChecks,
  CheckCircle2,
  Loader2,
  Users,
  User,
  X,
} from 'lucide-react'
import { useSwarmStore } from '../../stores/swarmStore'
import type { SwarmAgentRole, SwarmMessage, SwarmTaskItem } from '../../lib/swarm-types'
import { getRoleDef, SWARM_ROLES } from '../../lib/swarm-types'
import {
  operatorBroadcast,
  operatorMessageAgent,
  operatorAmendMission,
  operatorRedirectAgent,
  operatorInjectContext,
  operatorUpdateTask,
  getAgentLabels,
  getAgentLabel,
} from '../../lib/swarm-operator'

// ─── Types ──────────────────────────────────────────────────────

type MessageType = SwarmMessage['type']
type RecipientMode = 'all' | 'agent' | 'role'

interface ActionFeedback {
  type: 'success' | 'error'
  message: string
  timestamp: number
}

// ─── Section Header ─────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  isOpen,
  onToggle,
}: {
  icon: React.FC<{ className?: string }>
  title: string
  isOpen: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-2 py-2 px-1 text-left group"
    >
      {isOpen ? (
        <ChevronDown className="w-3 h-3 text-ghost-text-dim/40" />
      ) : (
        <ChevronRight className="w-3 h-3 text-ghost-text-dim/40" />
      )}
      <Icon className="w-3.5 h-3.5 text-sky-400/70" />
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ghost-text-dim/60 group-hover:text-ghost-text-dim transition-colors">
        {title}
      </span>
    </button>
  )
}

// ─── Feedback Toast ─────────────────────────────────────────────

function FeedbackToast({ feedback }: { feedback: ActionFeedback }) {
  const isSuccess = feedback.type === 'success'
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-medium ${
        isSuccess
          ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20'
          : 'bg-rose-400/10 text-rose-400 border border-rose-400/20'
      }`}
    >
      {isSuccess ? (
        <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
      ) : (
        <AlertTriangle className="w-3 h-3 flex-shrink-0" />
      )}
      {feedback.message}
    </motion.div>
  )
}

// ─── Message Composer Section ───────────────────────────────────

function MessageComposerSection({ swarmId }: { swarmId: string }) {
  const [message, setMessage] = useState('')
  const [recipientMode, setRecipientMode] = useState<RecipientMode>('all')
  const [selectedAgent, setSelectedAgent] = useState('')
  const [selectedRole, setSelectedRole] = useState<SwarmAgentRole>('builder')
  const [messageType, setMessageType] = useState<MessageType>('message')
  const [sending, setSending] = useState(false)
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null)

  const agents = useSwarmStore(s => s.swarms.find(sw => sw.id === swarmId)?.agents)
  const agentLabels = useMemo(() => getAgentLabels(swarmId), [swarmId, agents])

  const roleOptions = useMemo(() => {
    return SWARM_ROLES
      .filter(r => getAgentLabels(swarmId, r.id).length > 0)
      .map(r => r.id)
  }, [swarmId, agents])

  const showFeedback = useCallback((type: 'success' | 'error', msg: string) => {
    setFeedback({ type, message: msg, timestamp: Date.now() })
    setTimeout(() => setFeedback(null), 3000)
  }, [])

  const handleSend = useCallback(async () => {
    if (!message.trim() || sending) return
    setSending(true)

    try {
      if (recipientMode === 'all') {
        await operatorBroadcast(swarmId, message, undefined, messageType)
        showFeedback('success', `Broadcast sent to ${agentLabels.length} agents`)
      } else if (recipientMode === 'role') {
        const roleLabels = getAgentLabels(swarmId, selectedRole)
        await operatorBroadcast(swarmId, message, roleLabels, messageType)
        showFeedback('success', `Sent to ${roleLabels.length} ${getRoleDef(selectedRole).label}(s)`)
      } else if (recipientMode === 'agent' && selectedAgent) {
        await operatorMessageAgent(swarmId, selectedAgent, message, messageType)
        showFeedback('success', `Sent to ${selectedAgent}`)
      } else {
        showFeedback('error', 'Select a recipient')
        setSending(false)
        return
      }
      setMessage('')
    } catch (err) {
      showFeedback('error', `Failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setSending(false)
    }
  }, [swarmId, message, recipientMode, selectedAgent, selectedRole, messageType, sending, agentLabels.length, showFeedback])

  return (
    <div className="flex flex-col gap-2.5">
      {/* Recipient selector */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] text-ghost-text-dim/40 uppercase tracking-widest mr-1">To:</span>
        {(['all', 'role', 'agent'] as RecipientMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setRecipientMode(mode)}
            className={`h-6 px-2 rounded text-[10px] font-semibold uppercase tracking-wider border transition-colors ${
              recipientMode === mode
                ? 'bg-sky-400/15 text-sky-400 border-sky-400/25'
                : 'bg-white/[0.02] text-ghost-text-dim/40 border-white/[0.06] hover:text-ghost-text-dim/60'
            }`}
          >
            {mode === 'all' && <Users className="w-2.5 h-2.5 inline mr-1" />}
            {mode === 'agent' && <User className="w-2.5 h-2.5 inline mr-1" />}
            {mode}
          </button>
        ))}

        {recipientMode === 'agent' && (
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="h-6 px-2 rounded bg-white/[0.04] border border-white/[0.08] text-[10px] text-ghost-text-dim focus:outline-none focus:border-sky-400/30"
          >
            <option value="">Select agent...</option>
            {agentLabels.map((label) => (
              <option key={label} value={label}>{label}</option>
            ))}
          </select>
        )}

        {recipientMode === 'role' && (
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value as SwarmAgentRole)}
            className="h-6 px-2 rounded bg-white/[0.04] border border-white/[0.08] text-[10px] text-ghost-text-dim focus:outline-none focus:border-sky-400/30"
          >
            {roleOptions.map((role) => (
              <option key={role} value={role}>{getRoleDef(role).label}s</option>
            ))}
          </select>
        )}
      </div>

      {/* Message type selector */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-ghost-text-dim/40 uppercase tracking-widest mr-1">Type:</span>
        {(['message', 'assignment', 'escalation'] as MessageType[]).map((t) => (
          <button
            key={t}
            onClick={() => setMessageType(t)}
            className={`h-5 px-1.5 rounded text-[9px] font-semibold uppercase tracking-wider border transition-colors ${
              messageType === t
                ? 'bg-sky-400/10 text-sky-400 border-sky-400/20'
                : 'bg-white/[0.02] text-ghost-text-dim/30 border-white/[0.04] hover:text-ghost-text-dim/50'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Message body */}
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Type your message to the swarm..."
        rows={3}
        className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-ghost-text placeholder:text-ghost-text-dim/20 resize-none focus:outline-none focus:border-sky-400/25 transition-colors"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            handleSend()
          }
        }}
      />

      {/* Send row */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSend}
          disabled={!message.trim() || sending}
          className="h-7 px-3 rounded-lg bg-sky-400 text-[11px] font-semibold uppercase tracking-wider text-black disabled:opacity-30 disabled:cursor-not-allowed hover:bg-sky-300 transition-colors flex items-center gap-1.5"
        >
          {sending ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Send className="w-3 h-3" />
          )}
          Send
        </button>
        <span className="text-[9px] text-ghost-text-dim/25">Ctrl+Enter</span>

        <AnimatePresence>
          {feedback && <FeedbackToast feedback={feedback} />}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─── Mission Amendment Section ──────────────────────────────────

function MissionAmendmentSection({ swarmId }: { swarmId: string }) {
  const mission = useSwarmStore((s) => {
    const sw = s.swarms.find((sw) => sw.id === swarmId)
    return sw?.config.mission || ''
  })
  const [amendment, setAmendment] = useState('')
  const [editing, setEditing] = useState(false)
  const [sending, setSending] = useState(false)
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null)

  const showFeedback = useCallback((type: 'success' | 'error', msg: string) => {
    setFeedback({ type, message: msg, timestamp: Date.now() })
    setTimeout(() => setFeedback(null), 3000)
  }, [])

  const handleAmend = useCallback(async () => {
    if (!amendment.trim() || sending) return
    setSending(true)

    try {
      await operatorAmendMission(swarmId, amendment)
      showFeedback('success', 'Mission amended and broadcast to all agents')
      setAmendment('')
      setEditing(false)
    } catch (err) {
      showFeedback('error', `Failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setSending(false)
    }
  }, [swarmId, amendment, sending, showFeedback])

  return (
    <div className="flex flex-col gap-2">
      {/* Current mission (read-only) */}
      <div className="px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
        <span className="text-[9px] text-ghost-text-dim/30 uppercase tracking-widest block mb-1">Current Mission</span>
        <p className="text-[11px] text-ghost-text-dim/70 leading-relaxed">
          {mission || 'No mission defined'}
        </p>
      </div>

      {!editing ? (
        <button
          onClick={() => setEditing(true)}
          className="h-7 px-3 rounded-lg border border-white/[0.08] bg-white/[0.02] text-[11px] font-semibold uppercase tracking-wider text-ghost-text-dim/50 hover:text-ghost-text-dim hover:border-amber-400/25 transition-colors flex items-center gap-1.5 self-start"
        >
          <FileEdit className="w-3 h-3" />
          Amend Mission
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <textarea
            value={amendment}
            onChange={(e) => setAmendment(e.target.value)}
            placeholder="Enter mission amendment..."
            rows={3}
            autoFocus
            className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-amber-400/15 text-xs text-ghost-text placeholder:text-ghost-text-dim/20 resize-none focus:outline-none focus:border-amber-400/30 transition-colors"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleAmend}
              disabled={!amendment.trim() || sending}
              className="h-7 px-3 rounded-lg bg-amber-400 text-[11px] font-semibold uppercase tracking-wider text-black disabled:opacity-30 disabled:cursor-not-allowed hover:bg-amber-300 transition-colors flex items-center gap-1.5"
            >
              {sending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Radio className="w-3 h-3" />
              )}
              Broadcast Amendment
            </button>
            <button
              onClick={() => { setEditing(false); setAmendment('') }}
              className="h-7 px-2 rounded-lg border border-white/[0.06] bg-white/[0.02] text-[10px] text-ghost-text-dim/40 hover:text-ghost-text-dim transition-colors"
            >
              Cancel
            </button>
            <AnimatePresence>
              {feedback && <FeedbackToast feedback={feedback} />}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Quick Actions Section (per-agent) ──────────────────────────

function QuickActionsSection({ swarmId }: { swarmId: string }) {
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null)
  const [expandedAction, setExpandedAction] = useState<'context' | 'redirect' | null>(null)
  const [contextText, setContextText] = useState('')
  const [redirectTitle, setRedirectTitle] = useState('')
  const [redirectDesc, setRedirectDesc] = useState('')
  const [sending, setSending] = useState(false)
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null)

  const quickAgents = useSwarmStore(s => s.swarms.find(sw => sw.id === swarmId)?.agents)
  const agentLabels = useMemo(() => getAgentLabels(swarmId), [swarmId, quickAgents])

  const showFeedback = useCallback((type: 'success' | 'error', msg: string) => {
    setFeedback({ type, message: msg, timestamp: Date.now() })
    setTimeout(() => setFeedback(null), 3000)
  }, [])

  const handleInjectContext = useCallback(async () => {
    if (!expandedAgent || !contextText.trim() || sending) return
    setSending(true)

    try {
      await operatorInjectContext(swarmId, expandedAgent, contextText)
      showFeedback('success', `Context injected into ${expandedAgent}`)
      setContextText('')
      setExpandedAction(null)
    } catch (err) {
      showFeedback('error', `Failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setSending(false)
    }
  }, [swarmId, expandedAgent, contextText, sending, showFeedback])

  const handleRedirect = useCallback(async () => {
    if (!expandedAgent || !redirectTitle.trim() || !redirectDesc.trim() || sending) return
    setSending(true)

    try {
      await operatorRedirectAgent(swarmId, expandedAgent, redirectTitle, redirectDesc)
      showFeedback('success', `${expandedAgent} redirected to "${redirectTitle}"`)
      setRedirectTitle('')
      setRedirectDesc('')
      setExpandedAction(null)
    } catch (err) {
      showFeedback('error', `Failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setSending(false)
    }
  }, [swarmId, expandedAgent, redirectTitle, redirectDesc, sending, showFeedback])

  const toggleAgent = useCallback((label: string) => {
    if (expandedAgent === label) {
      setExpandedAgent(null)
      setExpandedAction(null)
    } else {
      setExpandedAgent(label)
      setExpandedAction(null)
    }
    setContextText('')
    setRedirectTitle('')
    setRedirectDesc('')
  }, [expandedAgent])

  // Find role color for an agent label
  const swarm = useSwarmStore((s) => s.swarms.find(sw => sw.id === swarmId))
  const agentRoleColors = useMemo(() => {
    const map: Record<string, string> = {}
    if (!swarm) return map
    for (const r of swarm.config.roster) {
      const label = getAgentLabel(swarmId, r.id)
      if (label) {
        map[label] = getRoleDef(r.role).color
      }
    }
    return map
  }, [swarm, swarmId])

  return (
    <div className="flex flex-col gap-1.5">
      {agentLabels.map((label) => {
        const isExpanded = expandedAgent === label
        const dotColor = agentRoleColors[label] || '#6b7280'

        return (
          <div key={label}>
            <button
              onClick={() => toggleAgent(label)}
              className={`w-full flex items-center gap-2 h-7 px-2 rounded-lg border transition-colors text-left ${
                isExpanded
                  ? 'bg-white/[0.04] border-white/[0.08]'
                  : 'bg-white/[0.01] border-white/[0.04] hover:bg-white/[0.03]'
              }`}
            >
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: dotColor }} />
              <span className="text-[11px] font-medium text-ghost-text-dim/70 flex-1 truncate">{label}</span>
              {isExpanded ? (
                <ChevronDown className="w-3 h-3 text-ghost-text-dim/30" />
              ) : (
                <ChevronRight className="w-3 h-3 text-ghost-text-dim/30" />
              )}
            </button>

            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden"
                >
                  <div className="pl-5 pt-1.5 pb-1 flex flex-col gap-1.5">
                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setExpandedAction(expandedAction === 'context' ? null : 'context')}
                        className={`h-6 px-2 rounded text-[10px] font-semibold uppercase tracking-wider border transition-colors flex items-center gap-1 ${
                          expandedAction === 'context'
                            ? 'bg-violet-400/15 text-violet-400 border-violet-400/25'
                            : 'bg-white/[0.02] text-ghost-text-dim/40 border-white/[0.05] hover:text-ghost-text-dim/60'
                        }`}
                      >
                        <Syringe className="w-2.5 h-2.5" />
                        Inject Context
                      </button>
                      <button
                        onClick={() => setExpandedAction(expandedAction === 'redirect' ? null : 'redirect')}
                        className={`h-6 px-2 rounded text-[10px] font-semibold uppercase tracking-wider border transition-colors flex items-center gap-1 ${
                          expandedAction === 'redirect'
                            ? 'bg-orange-400/15 text-orange-400 border-orange-400/25'
                            : 'bg-white/[0.02] text-ghost-text-dim/40 border-white/[0.05] hover:text-ghost-text-dim/60'
                        }`}
                      >
                        <Crosshair className="w-2.5 h-2.5" />
                        Redirect
                      </button>
                    </div>

                    {/* Inject Context Form */}
                    <AnimatePresence>
                      {expandedAction === 'context' && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.12 }}
                          className="overflow-hidden"
                        >
                          <div className="flex flex-col gap-1.5 pt-1">
                            <textarea
                              value={contextText}
                              onChange={(e) => setContextText(e.target.value)}
                              placeholder="Enter context to inject (will be saved as a .md file)..."
                              rows={3}
                              autoFocus
                              className="w-full px-2.5 py-1.5 rounded bg-white/[0.03] border border-violet-400/15 text-[11px] text-ghost-text placeholder:text-ghost-text-dim/20 resize-none focus:outline-none focus:border-violet-400/30 transition-colors"
                            />
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={handleInjectContext}
                                disabled={!contextText.trim() || sending}
                                className="h-6 px-2.5 rounded bg-violet-400 text-[10px] font-semibold uppercase tracking-wider text-black disabled:opacity-30 disabled:cursor-not-allowed hover:bg-violet-300 transition-colors flex items-center gap-1"
                              >
                                {sending ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Syringe className="w-2.5 h-2.5" />}
                                Inject
                              </button>
                              <button
                                onClick={() => { setExpandedAction(null); setContextText('') }}
                                className="h-6 px-1.5 rounded border border-white/[0.06] bg-white/[0.02] text-[10px] text-ghost-text-dim/40 hover:text-ghost-text-dim transition-colors"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Redirect Form */}
                    <AnimatePresence>
                      {expandedAction === 'redirect' && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.12 }}
                          className="overflow-hidden"
                        >
                          <div className="flex flex-col gap-1.5 pt-1">
                            <input
                              type="text"
                              value={redirectTitle}
                              onChange={(e) => setRedirectTitle(e.target.value)}
                              placeholder="New task title..."
                              autoFocus
                              className="w-full h-7 px-2.5 rounded bg-white/[0.03] border border-orange-400/15 text-[11px] text-ghost-text placeholder:text-ghost-text-dim/20 focus:outline-none focus:border-orange-400/30 transition-colors"
                            />
                            <textarea
                              value={redirectDesc}
                              onChange={(e) => setRedirectDesc(e.target.value)}
                              placeholder="Task description..."
                              rows={2}
                              className="w-full px-2.5 py-1.5 rounded bg-white/[0.03] border border-orange-400/15 text-[11px] text-ghost-text placeholder:text-ghost-text-dim/20 resize-none focus:outline-none focus:border-orange-400/30 transition-colors"
                            />
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={handleRedirect}
                                disabled={!redirectTitle.trim() || !redirectDesc.trim() || sending}
                                className="h-6 px-2.5 rounded bg-orange-400 text-[10px] font-semibold uppercase tracking-wider text-black disabled:opacity-30 disabled:cursor-not-allowed hover:bg-orange-300 transition-colors flex items-center gap-1"
                              >
                                {sending ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Crosshair className="w-2.5 h-2.5" />}
                                Redirect
                              </button>
                              <button
                                onClick={() => { setExpandedAction(null); setRedirectTitle(''); setRedirectDesc('') }}
                                className="h-6 px-1.5 rounded border border-white/[0.06] bg-white/[0.02] text-[10px] text-ghost-text-dim/40 hover:text-ghost-text-dim transition-colors"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}

      <AnimatePresence>
        {feedback && (
          <div className="mt-1">
            <FeedbackToast feedback={feedback} />
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Task Override Section ───────────────────────────────────────

interface TaskOverrideEntry {
  id: string
  newStatus: string
  newOwner: string
  dirty: boolean
}

function TaskOverrideSection({ swarmId }: { swarmId: string }) {
  const tasks = useSwarmStore((s) => {
    const sw = s.swarms.find(sw => sw.id === swarmId)
    return sw?.tasks || []
  })
  const taskAgents = useSwarmStore(s => s.swarms.find(sw => sw.id === swarmId)?.agents)
  const agentLabels = useMemo(() => getAgentLabels(swarmId), [swarmId, taskAgents])
  const [overrides, setOverrides] = useState<Record<string, TaskOverrideEntry>>({})
  const [sending, setSending] = useState(false)
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null)

  const showFeedback = useCallback((type: 'success' | 'error', msg: string) => {
    setFeedback({ type, message: msg, timestamp: Date.now() })
    setTimeout(() => setFeedback(null), 3000)
  }, [])

  const getOverride = useCallback((task: SwarmTaskItem): TaskOverrideEntry => {
    return overrides[task.id] || {
      id: task.id,
      newStatus: task.status,
      newOwner: task.owner,
      dirty: false,
    }
  }, [overrides])

  const setTaskOverride = useCallback((taskId: string, field: 'newStatus' | 'newOwner', value: string) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return

    setOverrides(prev => {
      const current = prev[taskId] || {
        id: taskId,
        newStatus: task.status,
        newOwner: task.owner,
        dirty: false,
      }
      const updated = { ...current, [field]: value }
      updated.dirty = updated.newStatus !== task.status || updated.newOwner !== task.owner
      return { ...prev, [taskId]: updated }
    })
  }, [tasks])

  const dirtyCount = useMemo(() => {
    return Object.values(overrides).filter(o => o.dirty).length
  }, [overrides])

  const handleApply = useCallback(async () => {
    if (dirtyCount === 0 || sending) return
    setSending(true)

    const dirtyOverrides = Object.values(overrides).filter(o => o.dirty)
    let successCount = 0
    const errors: string[] = []

    for (const override of dirtyOverrides) {
      const task = tasks.find(t => t.id === override.id)
      if (!task) continue

      const updates: { status?: string; owner?: string } = {}
      if (override.newStatus !== task.status) updates.status = override.newStatus
      if (override.newOwner !== task.owner) updates.owner = override.newOwner

      try {
        await operatorUpdateTask(swarmId, override.id, updates)
        successCount++
      } catch (err) {
        errors.push(`${task.title || task.id}: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }

    if (successCount > 0) {
      showFeedback('success', `${successCount} task(s) updated`)
    }
    if (errors.length > 0) {
      showFeedback('error', errors.join('; '))
    }

    // Clear dirty state for successful updates
    setOverrides({})
    setSending(false)
  }, [overrides, dirtyCount, tasks, swarmId, sending, showFeedback])

  const TASK_STATUSES: SwarmTaskItem['status'][] = ['open', 'assigned', 'planning', 'building', 'review', 'done']

  if (tasks.length === 0) {
    return (
      <div className="text-[11px] text-ghost-text-dim/30 py-2">
        No tasks in the task graph yet.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Task list */}
      <div className="flex flex-col gap-1">
        {tasks.map((task) => {
          const override = getOverride(task)
          const isDirty = override.dirty

          return (
            <div
              key={task.id}
              className={`flex items-center gap-2 px-2 py-1.5 rounded border transition-colors ${
                isDirty
                  ? 'bg-sky-400/[0.04] border-sky-400/15'
                  : 'bg-white/[0.01] border-white/[0.04]'
              }`}
            >
              {/* Task title */}
              <span className="text-[11px] text-ghost-text-dim/60 flex-1 truncate min-w-0" title={task.title}>
                {task.title || task.id}
              </span>

              {/* Status dropdown */}
              <select
                value={override.newStatus}
                onChange={(e) => setTaskOverride(task.id, 'newStatus', e.target.value)}
                className="h-5 px-1 rounded bg-white/[0.03] border border-white/[0.06] text-[9px] text-ghost-text-dim/60 focus:outline-none focus:border-sky-400/25 flex-shrink-0"
              >
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>

              {/* Owner dropdown */}
              <select
                value={override.newOwner}
                onChange={(e) => setTaskOverride(task.id, 'newOwner', e.target.value)}
                className="h-5 px-1 rounded bg-white/[0.03] border border-white/[0.06] text-[9px] text-ghost-text-dim/60 focus:outline-none focus:border-sky-400/25 flex-shrink-0 max-w-[100px]"
              >
                <option value="">Unassigned</option>
                {agentLabels.map((label) => (
                  <option key={label} value={label}>{label}</option>
                ))}
              </select>

              {isDirty && (
                <div className="w-1.5 h-1.5 rounded-full bg-sky-400 flex-shrink-0" />
              )}
            </div>
          )
        })}
      </div>

      {/* Apply button */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleApply}
          disabled={dirtyCount === 0 || sending}
          className="h-7 px-3 rounded-lg bg-sky-400 text-[11px] font-semibold uppercase tracking-wider text-black disabled:opacity-30 disabled:cursor-not-allowed hover:bg-sky-300 transition-colors flex items-center gap-1.5"
        >
          {sending ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <CheckCircle2 className="w-3 h-3" />
          )}
          Apply {dirtyCount > 0 ? `(${dirtyCount})` : ''}
        </button>

        {dirtyCount > 0 && (
          <button
            onClick={() => setOverrides({})}
            className="h-7 px-2 rounded-lg border border-white/[0.06] bg-white/[0.02] text-[10px] text-ghost-text-dim/40 hover:text-ghost-text-dim transition-colors"
          >
            Reset
          </button>
        )}

        <AnimatePresence>
          {feedback && <FeedbackToast feedback={feedback} />}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────

interface SwarmCommandCenterProps {
  swarmId: string
}

export function SwarmCommandCenter({ swarmId }: SwarmCommandCenterProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [openSections, setOpenSections] = useState({
    message: true,
    mission: false,
    quickActions: false,
    taskOverride: false,
  })

  const toggleSection = useCallback((section: keyof typeof openSections) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }))
  }, [])

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] backdrop-blur-md overflow-hidden">
      {/* Header — click to expand/collapse */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 group"
      >
        {isOpen ? (
          <ChevronDown className="w-3.5 h-3.5 text-sky-400/60" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-sky-400/60" />
        )}
        <Radio className="w-4 h-4 text-sky-400" />
        <span className="text-xs font-semibold uppercase tracking-[0.15em] text-ghost-text-dim/60 group-hover:text-ghost-text-dim transition-colors">
          Command Center
        </span>
        <span className="text-[9px] text-ghost-text-dim/25 ml-auto">
          operator controls
        </span>
      </button>

      {/* Expandable body */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 flex flex-col gap-1 border-t border-white/[0.04]">
              {/* Section 1: Message Composer */}
              <div>
                <SectionHeader
                  icon={MessageSquare}
                  title="Message Composer"
                  isOpen={openSections.message}
                  onToggle={() => toggleSection('message')}
                />
                <AnimatePresence>
                  {openSections.message && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="overflow-hidden"
                    >
                      <div className="pb-2">
                        <MessageComposerSection swarmId={swarmId} />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Section 2: Mission Amendment */}
              <div className="border-t border-white/[0.03]">
                <SectionHeader
                  icon={FileEdit}
                  title="Mission Amendment"
                  isOpen={openSections.mission}
                  onToggle={() => toggleSection('mission')}
                />
                <AnimatePresence>
                  {openSections.mission && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="overflow-hidden"
                    >
                      <div className="pb-2">
                        <MissionAmendmentSection swarmId={swarmId} />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Section 3: Quick Actions (per-agent) */}
              <div className="border-t border-white/[0.03]">
                <SectionHeader
                  icon={Crosshair}
                  title="Quick Actions"
                  isOpen={openSections.quickActions}
                  onToggle={() => toggleSection('quickActions')}
                />
                <AnimatePresence>
                  {openSections.quickActions && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="overflow-hidden"
                    >
                      <div className="pb-2">
                        <QuickActionsSection swarmId={swarmId} />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Section 4: Task Override */}
              <div className="border-t border-white/[0.03]">
                <SectionHeader
                  icon={ListChecks}
                  title="Task Override"
                  isOpen={openSections.taskOverride}
                  onToggle={() => toggleSection('taskOverride')}
                />
                <AnimatePresence>
                  {openSections.taskOverride && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="overflow-hidden"
                    >
                      <div className="pb-2">
                        <TaskOverrideSection swarmId={swarmId} />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
