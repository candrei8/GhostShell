// SwarmDebrief — post-session deep interaction panel (B12)
// Three modes: Individual Chat, Survey/Retro, Lessons Learned.
// Extends S1 (Live Agent Interviews) for post-swarm analysis.
// Glass UI, no gradients, no glows.

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageSquare,
  Users,
  User,
  Send,
  Loader2,
  BookOpen,
  ClipboardList,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronRight,
  FileText,
  Lightbulb,
  MessageCircle,
  Copy,
  Radar,
  LineChart,
  Zap,
} from 'lucide-react'
import { useSwarmStore } from '../../stores/swarmStore'
import { getRoleDef } from '../../lib/swarm-types'
import type {
  SwarmInterview,
  SwarmInterviewStatus,
  Swarm,
  SwarmTaskItem,
  SwarmMessage,
  DebriefResult,
} from '../../lib/swarm-types'
import { interviewAgent, batchInterview } from '../../lib/swarm-interview-manager'
import { getAgentLabels, getAgentLabel } from '../../lib/swarm-operator'
import { useAgentStore } from '../../stores/agentStore'

// ─── Types ──────────────────────────────────────────────────

type DebriefMode = 'individual' | 'survey' | 'lessons' | 'auto'

interface LessonItem {
  category: 'recommendation' | 'issue' | 'bottleneck' | 'conflict'
  source: string
  content: string
  severity?: 'info' | 'warning' | 'critical'
}

// ─── Pre-built retro questions ──────────────────────────────

const RETRO_QUESTIONS = [
  'What was the most challenging part of your assigned tasks?',
  'What would you do differently with more time?',
  'Were there any blockers or spec ambiguities?',
  'What patterns or tech debt did you notice?',
  'Which files or modules were hardest to work with?',
  'Did you encounter any conflicts with other agents?',
]

// ─── Helpers ────────────────────────────────────────────────

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

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

function isAgentAlive(swarm: Swarm, agentLabel: string): boolean {
  // Check if the agent's PTY session is still active
  for (const rosterAgent of swarm.config.roster) {
    const label = getAgentLabel(swarm.id, rosterAgent.id)
    if (label !== agentLabel) continue
    const agentState = swarm.agents.find((a) => a.rosterId === rosterAgent.id)
    if (!agentState?.agentId) return false
    const agent = useAgentStore.getState().getAgent(agentState.agentId)
    return agent?.status === 'working' || agent?.status === 'idle'
  }
  return false
}

function getRoleColorForAgent(swarm: Swarm, agentLabel: string): string {
  for (const r of swarm.config.roster) {
    const label = getAgentLabel(swarm.id, r.id)
    if (label === agentLabel) return getRoleDef(r.role).color
  }
  return '#6b7280'
}

function getAgentTaskHistory(swarm: Swarm, agentLabel: string): SwarmTaskItem[] {
  return swarm.tasks.filter((t) => {
    // Match by owner (roster ID -> label)
    for (const r of swarm.config.roster) {
      const label = getAgentLabel(swarm.id, r.id)
      if (label === agentLabel && t.owner === r.id) return true
    }
    return false
  })
}

function getAgentMessages(swarm: Swarm, agentLabel: string): SwarmMessage[] {
  return swarm.messages.filter(
    (m) => m.from === agentLabel || m.to === agentLabel,
  )
}

// ─── Individual Chat Panel ──────────────────────────────────

function IndividualChat({ swarmId, swarm }: { swarmId: string; swarm: Swarm }) {
  const [selectedAgent, setSelectedAgent] = useState('')
  const [question, setQuestion] = useState('')
  const [sending, setSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Subscribe to tick for elapsed updates
  useSwarmStore((s) => s.tick)
  const interviews = useSwarmStore((s) => s.interviews)

  const agentLabels = useMemo(() => getAgentLabels(swarmId), [swarmId])

  const agentAlive = useMemo(
    () => (selectedAgent ? isAgentAlive(swarm, selectedAgent) : false),
    [swarm, selectedAgent],
  )

  // Interviews for the selected agent
  const agentInterviews = useMemo(
    () =>
      interviews
        .filter((iv) => iv.targetAgent === selectedAgent)
        .sort((a, b) => b.sentAt - a.sentAt),
    [interviews, selectedAgent],
  )

  // Agent's task history and message history
  const agentTasks = useMemo(
    () => (selectedAgent ? getAgentTaskHistory(swarm, selectedAgent) : []),
    [swarm, selectedAgent],
  )

  const agentMessages = useMemo(
    () => (selectedAgent ? getAgentMessages(swarm, selectedAgent) : []),
    [swarm, selectedAgent],
  )

  const roleColor = useMemo(
    () => (selectedAgent ? getRoleColorForAgent(swarm, selectedAgent) : '#6b7280'),
    [swarm, selectedAgent],
  )

  const handleSend = useCallback(async () => {
    if (!question.trim() || !selectedAgent || sending) return
    setSending(true)
    try {
      await interviewAgent(swarmId, selectedAgent, question.trim())
      setQuestion('')
    } catch (err) {
      console.error('[Debrief] Failed to send question:', err)
    } finally {
      setSending(false)
    }
  }, [swarmId, selectedAgent, question, sending])

  return (
    <div className="flex flex-col gap-3">
      {/* Agent selector */}
      <div className="flex items-center gap-2">
        <User className="w-3.5 h-3.5 text-sky-400/60" />
        <select
          value={selectedAgent}
          onChange={(e) => setSelectedAgent(e.target.value)}
          className="flex-1 h-7 px-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[11px] text-ghost-text-dim focus:outline-none focus:border-sky-400/30"
        >
          <option value="">Select agent...</option>
          {agentLabels.map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </select>
        {selectedAgent && (
          <span
            className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
              agentAlive
                ? 'bg-emerald-400/10 text-emerald-400'
                : 'bg-ghost-text-dim/10 text-ghost-text-dim/40'
            }`}
          >
            {agentAlive ? 'LIVE' : 'ENDED'}
          </span>
        )}
      </div>

      {selectedAgent && (
        <>
          {/* Agent context summary */}
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: roleColor }}
              />
              <span className="text-[11px] font-semibold text-ghost-text/80">
                {selectedAgent}
              </span>
              <span className="text-[9px] text-ghost-text-dim/30">
                {agentTasks.length} tasks, {agentMessages.length} messages
              </span>
            </div>

            {/* Task summary */}
            {agentTasks.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {agentTasks.slice(0, 6).map((task) => (
                  <span
                    key={task.id}
                    className={`text-[9px] px-1.5 py-0.5 rounded border ${
                      task.status === 'done'
                        ? 'border-emerald-400/15 text-emerald-400/60'
                        : task.status === 'building' || task.status === 'review'
                          ? 'border-sky-400/15 text-sky-400/60'
                          : 'border-white/[0.06] text-ghost-text-dim/30'
                    }`}
                  >
                    {task.title.length > 30 ? task.title.slice(0, 30) + '...' : task.title}
                  </span>
                ))}
                {agentTasks.length > 6 && (
                  <span className="text-[9px] text-ghost-text-dim/25">
                    +{agentTasks.length - 6} more
                  </span>
                )}
              </div>
            )}

            {/* Dead agent fallback */}
            {!agentAlive && (
              <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-amber-400/[0.05] border border-amber-400/10">
                <AlertTriangle className="w-3 h-3 text-amber-400/60 flex-shrink-0" />
                <span className="text-[10px] text-amber-400/60">
                  Agent session ended. Showing recorded activity. Live chat unavailable.
                </span>
              </div>
            )}
          </div>

          {/* Chat input (only if agent is alive) */}
          {agentAlive && (
            <div className="flex flex-col gap-2">
              <textarea
                ref={textareaRef}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask about their decisions, approach, or findings..."
                rows={2}
                className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-ghost-text placeholder:text-ghost-text-dim/20 resize-none focus:outline-none focus:border-sky-400/25 transition-colors"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSend()
                }}
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSend}
                  disabled={!question.trim() || sending}
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
            </div>
          )}

          {/* Interview history */}
          {agentInterviews.length > 0 && (
            <div className="flex flex-col gap-2 mt-1">
              <span className="text-[9px] text-ghost-text-dim/30 uppercase tracking-widest">
                Conversation
              </span>
              {agentInterviews.map((iv) => (
                <div
                  key={iv.id}
                  className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <MessageCircle className="w-3 h-3 text-sky-400/40" />
                    <span className="text-[10px] text-sky-400/60 flex-1">
                      {iv.question}
                    </span>
                    {statusIcon(iv.status)}
                  </div>
                  {iv.status === 'answered' && iv.answer && (
                    <div className="text-[11px] text-ghost-text-dim/70 leading-relaxed whitespace-pre-wrap mt-1.5 pl-4 border-l-2 border-white/[0.06]">
                      {iv.answer}
                    </div>
                  )}
                  {iv.status === 'timeout' && (
                    <div className="text-[10px] text-amber-400/50 italic mt-1">
                      No response received.
                    </div>
                  )}
                  <div className="flex items-center gap-1 mt-1">
                    <Clock className="w-2.5 h-2.5 text-ghost-text-dim/15" />
                    <span className="text-[9px] text-ghost-text-dim/20">
                      {formatTime(iv.sentAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Dead-agent message log fallback */}
          {!agentAlive && agentMessages.length > 0 && (
            <div className="flex flex-col gap-1.5 mt-1">
              <span className="text-[9px] text-ghost-text-dim/30 uppercase tracking-widest">
                Message History ({agentMessages.length})
              </span>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {agentMessages.slice(-20).map((msg) => (
                  <div
                    key={msg.id}
                    className="flex items-start gap-2 px-2 py-1.5 rounded bg-white/[0.02] text-[10px]"
                  >
                    <span className="text-ghost-text-dim/40 font-mono shrink-0">
                      {msg.from === selectedAgent ? '>' : '<'}
                    </span>
                    <span className="text-ghost-text-dim/60 flex-1 break-words">
                      {msg.body.length > 200 ? msg.body.slice(0, 200) + '...' : msg.body}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {!selectedAgent && (
        <div className="flex flex-col items-center gap-2 py-6">
          <User className="w-6 h-6 text-ghost-text-dim/15" />
          <p className="text-[10px] text-ghost-text-dim/25">
            Select an agent to start a debrief conversation.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Survey / Retro Panel ───────────────────────────────────

function SurveyPanel({ swarmId, swarm }: { swarmId: string; swarm: Swarm }) {
  const [customQuestion, setCustomQuestion] = useState('')
  const [sending, setSending] = useState(false)
  const [sentQuestions, setSentQuestions] = useState<string[]>([])

  useSwarmStore((s) => s.tick)
  const interviews = useSwarmStore((s) => s.interviews)
  const agentLabels = useMemo(() => getAgentLabels(swarmId), [swarmId])

  // Check if any agents are alive
  const anyAlive = useMemo(
    () => agentLabels.some((label) => isAgentAlive(swarm, label)),
    [swarm, agentLabels],
  )

  // Group by question for display
  const questionGroups = useMemo(() => {
    const groups = new Map<string, SwarmInterview[]>()
    for (const iv of interviews) {
      const existing = groups.get(iv.question) || []
      existing.push(iv)
      groups.set(iv.question, existing)
    }
    // Only show questions that were sent to multiple agents (batch)
    return Array.from(groups.entries())
      .filter(([_, ivs]) => ivs.length > 1)
      .sort((a, b) => {
        const aTime = Math.max(...a[1].map((iv) => iv.sentAt))
        const bTime = Math.max(...b[1].map((iv) => iv.sentAt))
        return bTime - aTime
      })
  }, [interviews])

  const handleSendQuestion = useCallback(
    async (question: string) => {
      if (!question.trim() || sending) return
      setSending(true)
      try {
        const liveAgents = agentLabels.filter((label) => isAgentAlive(swarm, label))
        if (liveAgents.length > 0) {
          await batchInterview(swarmId, question.trim(), liveAgents)
        }
        setSentQuestions((prev) => [...prev, question.trim()])
        setCustomQuestion('')
      } catch (err) {
        console.error('[Debrief] Survey send failed:', err)
      } finally {
        setSending(false)
      }
    },
    [swarmId, swarm, agentLabels, sending],
  )

  if (!anyAlive) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <AlertTriangle className="w-8 h-8 text-amber-400/20" />
        <p className="text-[11px] text-ghost-text-dim/40 text-center max-w-xs">
          All agent sessions have ended. Survey mode requires live agents.
          Switch to "Lessons" to review the retrospective data.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Pre-built questions */}
      <div className="flex flex-col gap-2">
        <span className="text-[9px] text-ghost-text-dim/30 uppercase tracking-widest">
          Retro Questions
        </span>
        {RETRO_QUESTIONS.map((q, i) => {
          const wasSent = sentQuestions.includes(q)
          return (
            <div
              key={i}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
            >
              <ClipboardList className="w-3 h-3 text-sky-400/40 flex-shrink-0" />
              <span className="text-[11px] text-ghost-text-dim/70 flex-1">
                {q}
              </span>
              <button
                onClick={() => handleSendQuestion(q)}
                disabled={sending || wasSent}
                className={`h-6 px-2.5 rounded text-[9px] font-semibold uppercase tracking-wider transition-colors flex items-center gap-1 ${
                  wasSent
                    ? 'bg-emerald-400/10 text-emerald-400/50 border border-emerald-400/15'
                    : 'bg-sky-400/10 text-sky-400 border border-sky-400/20 hover:bg-sky-400/15'
                } disabled:opacity-40`}
              >
                {wasSent ? (
                  <>
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    Sent
                  </>
                ) : sending ? (
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                ) : (
                  <>
                    <Send className="w-2.5 h-2.5" />
                    Send to All
                  </>
                )}
              </button>
            </div>
          )
        })}
      </div>

      {/* Custom question */}
      <div className="flex flex-col gap-2">
        <span className="text-[9px] text-ghost-text-dim/30 uppercase tracking-widest">
          Custom Question
        </span>
        <div className="flex gap-2">
          <input
            type="text"
            value={customQuestion}
            onChange={(e) => setCustomQuestion(e.target.value)}
            placeholder="Ask a custom retro question..."
            className="flex-1 h-8 px-3 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-ghost-text placeholder:text-ghost-text-dim/20 focus:outline-none focus:border-sky-400/25 transition-colors"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSendQuestion(customQuestion)
            }}
          />
          <button
            onClick={() => handleSendQuestion(customQuestion)}
            disabled={!customQuestion.trim() || sending}
            className="h-8 px-3 rounded-lg bg-sky-400 text-[11px] font-semibold uppercase tracking-wider text-black disabled:opacity-30 disabled:cursor-not-allowed hover:bg-sky-300 transition-colors flex items-center gap-1.5"
          >
            <Users className="w-3 h-3" />
            Send to All
          </button>
        </div>
      </div>

      {/* Response aggregate cards */}
      {questionGroups.length > 0 && (
        <div className="flex flex-col gap-2 mt-1">
          <span className="text-[9px] text-ghost-text-dim/30 uppercase tracking-widest">
            Responses
          </span>
          {questionGroups.map(([question, ivs], idx) => (
            <SurveyResponseCard
              key={`${question}-${idx}`}
              question={question}
              interviews={ivs}
              swarm={swarm}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SurveyResponseCard({
  question,
  interviews: ivs,
  swarm,
}: {
  question: string
  interviews: SwarmInterview[]
  swarm: Swarm
}) {
  const [expanded, setExpanded] = useState(true)
  const answeredCount = ivs.filter((iv) => iv.status === 'answered').length

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.02] transition-colors"
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3 text-ghost-text-dim/30" />
        ) : (
          <ChevronRight className="w-3 h-3 text-ghost-text-dim/30" />
        )}
        <span className="text-[11px] text-ghost-text/70 flex-1 truncate">{question}</span>
        <span
          className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
            answeredCount === ivs.length
              ? 'bg-emerald-400/10 text-emerald-400/70'
              : 'bg-sky-400/10 text-sky-400/60'
          }`}
        >
          {answeredCount}/{ivs.length}
        </span>
      </button>
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
              {ivs.map((iv) => {
                const roleColor = getRoleColorForAgent(swarm, iv.targetAgent)
                return (
                  <div
                    key={iv.id}
                    className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: roleColor }}
                      />
                      <span className="text-[11px] font-semibold text-ghost-text/80">
                        {iv.targetAgent}
                      </span>
                      {statusIcon(iv.status)}
                    </div>
                    {iv.status === 'answered' && iv.answer ? (
                      <div className="text-[11px] text-ghost-text-dim/70 leading-relaxed whitespace-pre-wrap">
                        {iv.answer}
                      </div>
                    ) : iv.status === 'timeout' ? (
                      <div className="text-[10px] text-amber-400/50 italic">No response.</div>
                    ) : (
                      <div className="flex items-center gap-1.5 py-1">
                        <Loader2 className="w-3 h-3 animate-spin text-sky-400/40" />
                        <span className="text-[10px] text-ghost-text-dim/30">Waiting...</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Lessons Learned Panel ──────────────────────────────────

function LessonsPanel({ swarmId, swarm }: { swarmId: string; swarm: Swarm }) {
  const [copied, setCopied] = useState(false)

  // Performance data
  const performanceProfiles = useSwarmStore((s) => s.performanceProfiles)
  const conflicts = useSwarmStore((s) => s.conflicts)
  const activityFeed = useSwarmStore((s) => s.activityFeed)

  const lessons = useMemo(() => {
    const items: LessonItem[] = []

    // 1. Extract from swarm messages — look for analyst reports and review feedback
    for (const msg of swarm.messages) {
      if (msg.type === 'review_feedback' || msg.type === 'review_complete') {
        if (msg.body && msg.body.length > 20) {
          items.push({
            category: 'issue',
            source: msg.from,
            content: msg.body.length > 300 ? msg.body.slice(0, 300) + '...' : msg.body,
            severity: 'info',
          })
        }
      }
    }

    // 2. Performance bottlenecks
    for (const [label, profile] of Object.entries(performanceProfiles)) {
      if (profile.tasksFailed > 0) {
        items.push({
          category: 'bottleneck',
          source: label,
          content: `${label} failed ${profile.tasksFailed} task${profile.tasksFailed > 1 ? 's' : ''}. Average task duration: ${Math.round(profile.avgTaskDurationMs / 1000)}s.`,
          severity: profile.tasksFailed > 2 ? 'critical' : 'warning',
        })
      }
      if (profile.avgTaskDurationMs > 300_000) {
        items.push({
          category: 'bottleneck',
          source: label,
          content: `${label} averaged ${Math.round(profile.avgTaskDurationMs / 60000)}min per task, suggesting possible complexity or context issues.`,
          severity: 'warning',
        })
      }
    }

    // 3. Conflicts detected
    const swarmConflicts = conflicts.filter(
      (c) => c.status === 'active' || c.status === 'resolved',
    )
    for (const conflict of swarmConflicts) {
      const agentNames = conflict.agents.map((a) => a.label).join(', ')
      items.push({
        category: 'conflict',
        source: agentNames,
        content: `File conflict on ${conflict.filePath}: ${conflict.severity} severity. Agents involved: ${agentNames}. ${
          conflict.status === 'resolved' ? 'Resolved.' : 'Still active.'
        }`,
        severity: conflict.severity === 'critical' ? 'critical' : 'warning',
      })
    }

    // 4. Task completion analysis
    const totalTasks = swarm.tasks.length
    const doneTasks = swarm.tasks.filter((t) => t.status === 'done').length
    const failedTasks = swarm.tasks.filter((t) => t.status === 'open' || t.status === 'assigned').length

    if (totalTasks > 0) {
      const completionRate = Math.round((doneTasks / totalTasks) * 100)
      if (completionRate < 80) {
        items.push({
          category: 'recommendation',
          source: 'System Analysis',
          content: `Task completion rate: ${completionRate}% (${doneTasks}/${totalTasks}). ${failedTasks} tasks remain incomplete. Consider reviewing task decomposition granularity.`,
          severity: completionRate < 50 ? 'critical' : 'warning',
        })
      } else {
        items.push({
          category: 'recommendation',
          source: 'System Analysis',
          content: `Task completion rate: ${completionRate}% (${doneTasks}/${totalTasks}). Mission execution was effective.`,
          severity: 'info',
        })
      }
    }

    // 5. Communication analysis
    const totalMessages = swarm.messages.length
    const escalations = swarm.messages.filter((m) => m.type === 'escalation').length
    if (escalations > 3) {
      items.push({
        category: 'recommendation',
        source: 'System Analysis',
        content: `${escalations} escalations out of ${totalMessages} messages. High escalation rate may indicate unclear specs or insufficient agent autonomy.`,
        severity: escalations > 8 ? 'critical' : 'warning',
      })
    }

    // 6. Swarm duration analysis
    if (swarm.startedAt && swarm.completedAt) {
      const durationMin = Math.round((swarm.completedAt - swarm.startedAt) / 60000)
      items.push({
        category: 'recommendation',
        source: 'System Analysis',
        content: `Swarm ran for ${durationMin} minute${durationMin !== 1 ? 's' : ''} with ${swarm.agents.length} agents.`,
        severity: 'info',
      })
    }

    return items
  }, [swarm, performanceProfiles, conflicts, activityFeed])

  const handleCopy = useCallback(async () => {
    const text = lessons
      .map(
        (l) =>
          `[${l.severity?.toUpperCase() || 'INFO'}] ${l.category}: ${l.content} (Source: ${l.source})`,
      )
      .join('\n\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard unavailable
    }
  }, [lessons])

  const categoryIcon = (cat: string) => {
    switch (cat) {
      case 'recommendation':
        return <Lightbulb className="w-3 h-3 text-sky-400/60" />
      case 'issue':
        return <AlertTriangle className="w-3 h-3 text-amber-400/60" />
      case 'bottleneck':
        return <Zap className="w-3 h-3 text-rose-400/60" />
      case 'conflict':
        return <FileText className="w-3 h-3 text-purple-400/60" />
      default:
        return <BookOpen className="w-3 h-3 text-ghost-text-dim/40" />
    }
  }

  const severityBorder = (severity?: string) => {
    switch (severity) {
      case 'critical':
        return 'border-rose-400/15'
      case 'warning':
        return 'border-amber-400/10'
      default:
        return 'border-white/[0.06]'
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <BookOpen className="w-3.5 h-3.5 text-sky-400/60" />
        <span className="text-[10px] font-semibold text-ghost-text-dim/50 uppercase tracking-wider flex-1">
          Retrospective Report
        </span>
        <button
          onClick={handleCopy}
          className="h-6 px-2 rounded border border-white/[0.06] bg-white/[0.02] text-[9px] text-ghost-text-dim/40 hover:text-ghost-text-dim/60 transition-colors flex items-center gap-1"
        >
          <Copy className="w-2.5 h-2.5" />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {/* Lessons list */}
      {lessons.length > 0 ? (
        <div className="flex flex-col gap-2">
          {lessons.map((lesson, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03, duration: 0.15 }}
              className={`rounded-lg border bg-white/[0.02] p-3 ${severityBorder(lesson.severity)}`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                {categoryIcon(lesson.category)}
                <span className="text-[10px] font-semibold text-ghost-text-dim/50 uppercase tracking-wider">
                  {lesson.category}
                </span>
                <span className="text-[9px] text-ghost-text-dim/30 ml-auto">
                  {lesson.source}
                </span>
              </div>
              <p className="text-[11px] text-ghost-text-dim/70 leading-relaxed">
                {lesson.content}
              </p>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 py-6">
          <BookOpen className="w-6 h-6 text-ghost-text-dim/15" />
          <p className="text-[10px] text-ghost-text-dim/25 text-center">
            No retrospective data available. Complete tasks and run agent reviews to generate lessons.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Mode Tab Button ────────────────────────────────────────

function ModeTab({
  label,
  icon: Icon,
  isActive,
  onClick,
}: {
  label: string
  icon: React.FC<{ className?: string }>
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`h-7 px-3 rounded-lg text-[10px] font-semibold uppercase tracking-wider border transition-colors flex items-center gap-1.5 ${
        isActive
          ? 'bg-sky-400/10 text-sky-400 border-sky-400/25'
          : 'bg-white/[0.02] text-ghost-text-dim/40 border-white/[0.06] hover:text-ghost-text-dim/60 hover:border-white/10'
      }`}
    >
      <Icon className="w-3 h-3" />
      {label}
    </button>
  )
}

// ─── Auto Debrief Results Panel ─────────────────────────────

function AutoDebriefPanel({ debriefResult, swarm }: { debriefResult: DebriefResult; swarm: Swarm }) {
  return (
    <div className="flex flex-col gap-4">
      {/* Accuracy Report */}
      {debriefResult.accuracy && (
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-sky-400/60">
            Precision de la Simulacion
          </span>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/[0.02] border border-white/5 rounded-lg p-3 flex flex-col gap-1">
              <span className="font-mono text-[8px] uppercase tracking-wider text-white/30">Duracion</span>
              <span className="font-mono text-sm text-white/80">
                {debriefResult.accuracy.predictedDuration}m pred / {debriefResult.accuracy.actualDuration}m real
              </span>
              <span className={`font-mono text-[10px] font-bold ${debriefResult.accuracy.durationAccuracy >= 70 ? 'text-emerald-400' : debriefResult.accuracy.durationAccuracy >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
                {debriefResult.accuracy.durationAccuracy}% precision
              </span>
            </div>
            <div className="bg-white/[0.02] border border-white/5 rounded-lg p-3 flex flex-col gap-1">
              <span className="font-mono text-[8px] uppercase tracking-wider text-white/30">Conflictos</span>
              <span className="font-mono text-sm text-white/80">
                {debriefResult.accuracy.predictedConflicts} pred / {debriefResult.accuracy.actualConflicts} real
              </span>
            </div>
            <div className="bg-white/[0.02] border border-white/5 rounded-lg p-3 flex flex-col gap-1">
              <span className="font-mono text-[8px] uppercase tracking-wider text-white/30">Completado</span>
              <span className="font-mono text-[10px] text-white/60">
                {new Date(debriefResult.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Interview Responses */}
      {debriefResult.interviews.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-sky-400/60">
            Entrevistas ({debriefResult.interviews.length} agentes)
          </span>
          <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto custom-scrollbar">
            {debriefResult.interviews.map((interview, i) => (
              <div key={i} className="bg-white/[0.02] border border-white/5 rounded-lg p-3">
                <span className="font-mono text-[10px] font-bold text-white/70">{interview.agentLabel}</span>
                {interview.answers.map((qa, j) => (
                  <div key={j} className="mt-2">
                    <span className="font-mono text-[9px] text-white/40 block">{qa.question}</span>
                    <span className="font-mono text-[10px] text-white/60 block mt-1">{qa.answer}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Learnings */}
      {debriefResult.learnings.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-sky-400/60">
            Aprendizajes
          </span>
          <div className="flex flex-col gap-1.5">
            {debriefResult.learnings.map((learning, i) => (
              <div key={i} className="flex items-start gap-2 py-1">
                <Lightbulb className="w-3 h-3 text-amber-400/60 shrink-0 mt-0.5" />
                <span className="font-mono text-[10px] text-white/60">{learning}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next Steps */}
      {debriefResult.nextSteps.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-sky-400/60">
            Proximos Pasos
          </span>
          <div className="flex flex-col gap-1.5">
            {debriefResult.nextSteps.map((step, i) => (
              <div key={i} className="flex items-start gap-2 py-1">
                <Zap className="w-3 h-3 text-sky-400/60 shrink-0 mt-0.5" />
                <span className="font-mono text-[10px] text-white/60">{step}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────

interface SwarmDebriefProps {
  swarmId: string
}

export function SwarmDebrief({ swarmId }: SwarmDebriefProps) {
  const debriefResult = useSwarmStore((s) => s.debriefResult)
  const [mode, setMode] = useState<DebriefMode>(debriefResult ? 'auto' : 'individual')
  const [isOpen, setIsOpen] = useState(true)

  const swarm = useSwarmStore((s) => s.swarms.find((sw) => sw.id === swarmId))

  if (!swarm) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm overflow-hidden"
    >
      {/* Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors border-b border-white/[0.04]"
      >
        {isOpen ? (
          <ChevronDown className="w-3.5 h-3.5 text-ghost-text-dim/30" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-ghost-text-dim/30" />
        )}
        <MessageSquare className="w-4 h-4 text-sky-400" />
        <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-sky-400">
          Post-Session Debrief
        </h3>
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
            <div className="p-4 flex flex-col gap-4">
              {/* Mode tabs */}
              <div className="flex items-center gap-2">
                {debriefResult && (
                  <ModeTab
                    label="Auto"
                    icon={LineChart}
                    isActive={mode === 'auto'}
                    onClick={() => setMode('auto')}
                  />
                )}
                <ModeTab
                  label="Individual"
                  icon={User}
                  isActive={mode === 'individual'}
                  onClick={() => setMode('individual')}
                />
                <ModeTab
                  label="Survey"
                  icon={ClipboardList}
                  isActive={mode === 'survey'}
                  onClick={() => setMode('survey')}
                />
                <ModeTab
                  label="Lessons"
                  icon={BookOpen}
                  isActive={mode === 'lessons'}
                  onClick={() => setMode('lessons')}
                />
              </div>

              {/* Mode content */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={mode}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                >
                  {mode === 'auto' && debriefResult && (
                    <AutoDebriefPanel debriefResult={debriefResult} swarm={swarm} />
                  )}
                  {mode === 'individual' && (
                    <IndividualChat swarmId={swarmId} swarm={swarm} />
                  )}
                  {mode === 'survey' && (
                    <SurveyPanel swarmId={swarmId} swarm={swarm} />
                  )}
                  {mode === 'lessons' && (
                    <LessonsPanel swarmId={swarmId} swarm={swarm} />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
