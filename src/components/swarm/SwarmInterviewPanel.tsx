// SwarmInterviewPanel — Operator interview panel for querying agents mid-task
// Glass UI panel: compose question, select targets, view answers as they arrive

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageCircle,
  Send,
  ChevronDown,
  ChevronRight,
  Users,
  User,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  History,
} from 'lucide-react'
import { useSwarmStore } from '../../stores/swarmStore'
import { getRoleDef } from '../../lib/swarm-types'
import type { SwarmInterview, SwarmInterviewStatus } from '../../lib/swarm-types'
import { interviewAgent, batchInterview } from '../../lib/swarm-interview-manager'
import { getAgentLabels, getAgentLabel } from '../../lib/swarm-operator'

// ─── Types ──────────────────────────────────────────────────────

type TargetMode = 'all' | 'single'

interface InterviewGroup {
  question: string
  interviews: SwarmInterview[]
  createdAt: number
}

// ─── Status helpers ─────────────────────────────────────────────

function statusIcon(status: SwarmInterviewStatus) {
  switch (status) {
    case 'pending':
    case 'sent':
      return <Loader2 className="w-3 h-3 animate-spin text-sky-400/60" />
    case 'answered':
      return <CheckCircle2 className="w-3 h-3 text-emerald-400" />
    case 'timeout':
      return <AlertTriangle className="w-3 h-3 text-amber-400" />
  }
}

function statusLabel(status: SwarmInterviewStatus): string {
  switch (status) {
    case 'pending': return 'Pending'
    case 'sent': return 'Waiting...'
    case 'answered': return 'Answered'
    case 'timeout': return 'Timed out'
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function elapsedSince(ts: number): string {
  const elapsed = Math.floor((Date.now() - ts) / 1000)
  if (elapsed < 60) return `${elapsed}s ago`
  const mins = Math.floor(elapsed / 60)
  return `${mins}m ago`
}

// ─── Answer Card ────────────────────────────────────────────────

function AnswerCard({ interview, swarmId }: { interview: SwarmInterview; swarmId: string }) {
  const swarm = useSwarmStore(s => s.swarms.find(sw => sw.id === swarmId))

  // Resolve role color for the agent
  const roleColor = useMemo(() => {
    if (!swarm) return '#6b7280'
    for (const r of swarm.config.roster) {
      const label = getAgentLabel(swarmId, r.id)
      if (label === interview.targetAgent) {
        return getRoleDef(r.role).color
      }
    }
    return '#6b7280'
  }, [swarm, swarmId, interview.targetAgent])

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5"
    >
      {/* Header: agent name + role dot + status */}
      <div className="flex items-center gap-2 mb-1.5">
        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: roleColor }}
        />
        <span className="text-[11px] font-semibold text-ghost-text/80 flex-1 truncate">
          {interview.targetAgent}
        </span>
        <div className="flex items-center gap-1">
          {statusIcon(interview.status)}
          <span className="text-[9px] text-ghost-text-dim/40 font-medium">
            {statusLabel(interview.status)}
          </span>
        </div>
      </div>

      {/* Answer body */}
      {interview.status === 'answered' && interview.answer ? (
        <div className="text-[11px] text-ghost-text-dim/70 leading-relaxed whitespace-pre-wrap break-words">
          {interview.answer}
        </div>
      ) : interview.status === 'timeout' ? (
        <div className="text-[11px] text-amber-400/60 italic">
          Agent did not respond within the timeout window.
        </div>
      ) : (
        <div className="flex items-center gap-1.5 py-1">
          <Loader2 className="w-3 h-3 animate-spin text-sky-400/40" />
          <span className="text-[10px] text-ghost-text-dim/30">
            Waiting for response...
          </span>
        </div>
      )}

      {/* Timestamp */}
      {interview.answeredAt && (
        <div className="flex items-center gap-1 mt-1.5">
          <Clock className="w-2.5 h-2.5 text-ghost-text-dim/20" />
          <span className="text-[9px] text-ghost-text-dim/25">
            {formatTime(interview.answeredAt)} ({elapsedSince(interview.answeredAt)})
          </span>
        </div>
      )}
    </motion.div>
  )
}

// ─── Interview Group (batch display) ────────────────────────────

function InterviewGroupCard({
  group,
  swarmId,
  defaultExpanded,
}: {
  group: InterviewGroup
  swarmId: string
  defaultExpanded: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const answeredCount = group.interviews.filter(iv => iv.status === 'answered').length
  const totalCount = group.interviews.length
  const allDone = group.interviews.every(iv => iv.status === 'answered' || iv.status === 'timeout')

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] overflow-hidden">
      {/* Group header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.02] transition-colors"
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3 text-ghost-text-dim/30 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-ghost-text-dim/30 flex-shrink-0" />
        )}
        <MessageCircle className="w-3 h-3 text-sky-400/60 flex-shrink-0" />
        <span className="text-[11px] font-medium text-ghost-text/70 flex-1 truncate">
          {group.question}
        </span>
        <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
          allDone
            ? 'bg-emerald-400/10 text-emerald-400/70'
            : 'bg-sky-400/10 text-sky-400/60'
        }`}>
          {answeredCount}/{totalCount}
        </span>
        <span className="text-[9px] text-ghost-text-dim/25">
          {formatTime(group.createdAt)}
        </span>
      </button>

      {/* Expanded answers */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-2.5 flex flex-col gap-1.5">
              {group.interviews.map((iv) => (
                <AnswerCard key={iv.id} interview={iv} swarmId={swarmId} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Main Panel ─────────────────────────────────────────────────

export function SwarmInterviewPanel({ swarmId }: { swarmId: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [targetMode, setTargetMode] = useState<TargetMode>('all')
  const [selectedAgent, setSelectedAgent] = useState('')
  const [sending, setSending] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Subscribe to store tick so elapsed times refresh
  useSwarmStore(s => s.tick)

  // Get interviews from store
  const interviews = useSwarmStore(s => s.interviews)

  // Get agent labels for target selector
  const agents = useSwarmStore(s => s.swarms.find(sw => sw.id === swarmId)?.agents)
  const agentLabels = useMemo(() => getAgentLabels(swarmId), [swarmId, agents])

  // Group interviews by question text + creation time proximity (within 2s = same batch)
  const interviewGroups = useMemo(() => {
    const groups: InterviewGroup[] = []
    const sorted = [...interviews].sort((a, b) => b.sentAt - a.sentAt)

    for (const iv of sorted) {
      // Try to find an existing group with same question within 5s
      const matchGroup = groups.find(
        g => g.question === iv.question && Math.abs(g.createdAt - iv.sentAt) < 5000,
      )
      if (matchGroup) {
        matchGroup.interviews.push(iv)
      } else {
        groups.push({
          question: iv.question,
          interviews: [iv],
          createdAt: iv.sentAt,
        })
      }
    }

    return groups
  }, [interviews])

  // Split into recent (last 5) and history
  const recentGroups = useMemo(() => interviewGroups.slice(0, 5), [interviewGroups])
  const historyGroups = useMemo(() => interviewGroups.slice(5), [interviewGroups])

  // Count pending
  const pendingCount = interviews.filter(
    iv => iv.status === 'pending' || iv.status === 'sent',
  ).length

  const handleSend = useCallback(async () => {
    if (!question.trim() || sending) return
    setSending(true)

    try {
      if (targetMode === 'all') {
        await batchInterview(swarmId, question.trim())
      } else if (selectedAgent) {
        await interviewAgent(swarmId, selectedAgent, question.trim())
      }
      setQuestion('')
    } catch (err) {
      console.error('[InterviewPanel] Failed to send interview:', err)
    } finally {
      setSending(false)
    }
  }, [swarmId, question, targetMode, selectedAgent, sending])

  // Auto-focus textarea when panel opens
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [isOpen])

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-white/[0.02] transition-colors"
      >
        {isOpen ? (
          <ChevronDown className="w-3.5 h-3.5 text-ghost-text-dim/30" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-ghost-text-dim/30" />
        )}
        <MessageCircle className="w-3.5 h-3.5 text-sky-400/70" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ghost-text-dim/60">
          Agent Interviews
        </span>

        {/* Pending badge */}
        {pendingCount > 0 && (
          <span className="ml-auto flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-sky-400/10 text-sky-400/70">
            <Loader2 className="w-2.5 h-2.5 animate-spin" />
            {pendingCount} pending
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 flex flex-col gap-3">
              {/* Target selector */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-ghost-text-dim/40 uppercase tracking-widest mr-1">
                  Ask:
                </span>
                <button
                  onClick={() => setTargetMode('all')}
                  className={`h-6 px-2 rounded text-[10px] font-semibold uppercase tracking-wider border transition-colors flex items-center gap-1 ${
                    targetMode === 'all'
                      ? 'bg-sky-400/15 text-sky-400 border-sky-400/25'
                      : 'bg-white/[0.02] text-ghost-text-dim/40 border-white/[0.06] hover:text-ghost-text-dim/60'
                  }`}
                >
                  <Users className="w-2.5 h-2.5" />
                  All Agents
                </button>
                <button
                  onClick={() => setTargetMode('single')}
                  className={`h-6 px-2 rounded text-[10px] font-semibold uppercase tracking-wider border transition-colors flex items-center gap-1 ${
                    targetMode === 'single'
                      ? 'bg-sky-400/15 text-sky-400 border-sky-400/25'
                      : 'bg-white/[0.02] text-ghost-text-dim/40 border-white/[0.06] hover:text-ghost-text-dim/60'
                  }`}
                >
                  <User className="w-2.5 h-2.5" />
                  Single
                </button>

                {targetMode === 'single' && (
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
              </div>

              {/* Question textarea */}
              <textarea
                ref={textareaRef}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="What would you like to ask the agent(s)?"
                rows={2}
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
                  disabled={
                    !question.trim() ||
                    sending ||
                    (targetMode === 'single' && !selectedAgent)
                  }
                  className="h-7 px-3 rounded-lg bg-sky-400 text-[11px] font-semibold uppercase tracking-wider text-black disabled:opacity-30 disabled:cursor-not-allowed hover:bg-sky-300 transition-colors flex items-center gap-1.5"
                >
                  {sending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Send className="w-3 h-3" />
                  )}
                  Ask
                </button>
                <span className="text-[9px] text-ghost-text-dim/25">Ctrl+Enter</span>
              </div>

              {/* Recent interview results */}
              {recentGroups.length > 0 && (
                <div className="flex flex-col gap-2 mt-1">
                  <span className="text-[9px] text-ghost-text-dim/30 uppercase tracking-widest">
                    Results
                  </span>
                  {recentGroups.map((group, idx) => (
                    <InterviewGroupCard
                      key={`${group.createdAt}-${idx}`}
                      group={group}
                      swarmId={swarmId}
                      defaultExpanded={idx === 0}
                    />
                  ))}
                </div>
              )}

              {/* History toggle */}
              {historyGroups.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowHistory(!showHistory)}
                    className="flex items-center gap-1.5 text-[10px] text-ghost-text-dim/30 hover:text-ghost-text-dim/50 transition-colors"
                  >
                    <History className="w-3 h-3" />
                    <span className="uppercase tracking-widest font-medium">
                      History ({historyGroups.length})
                    </span>
                    {showHistory ? (
                      <ChevronDown className="w-2.5 h-2.5" />
                    ) : (
                      <ChevronRight className="w-2.5 h-2.5" />
                    )}
                  </button>

                  <AnimatePresence>
                    {showHistory && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="overflow-hidden mt-2 flex flex-col gap-2"
                      >
                        {historyGroups.map((group, idx) => (
                          <InterviewGroupCard
                            key={`hist-${group.createdAt}-${idx}`}
                            group={group}
                            swarmId={swarmId}
                            defaultExpanded={false}
                          />
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Empty state */}
              {interviews.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-4">
                  <MessageCircle className="w-6 h-6 text-ghost-text-dim/15" />
                  <p className="text-[10px] text-ghost-text-dim/25">
                    Ask your agents about their progress, blockers, or current approach.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
