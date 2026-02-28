import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Crown, Plus, Zap } from 'lucide-react'
import { useAgentStore } from '../../stores/agentStore'
import { useTerminalStore } from '../../stores/terminalStore'
import { OrchestratorSection } from './OrchestratorSection'
import { AgentCreator } from './AgentCreator'
import { AgentAvatar } from './AgentAvatar'
import { FileConflictBanner } from './FileConflictBanner'

export function MissionControlFeed() {
  const agents = useAgentStore((s) => s.agents)
  const setActiveAgent = useAgentStore((s) => s.setActiveAgent)
  const setActiveSession = useTerminalStore((s) => s.setActiveSession)
  const [showCreator, setShowCreator] = useState(false)
  const [idleExpanded, setIdleExpanded] = useState(false)

  const workingAgents = useMemo(() => agents.filter((a) => a.status === 'working'), [agents])
  const idleAgents = useMemo(() => agents.filter((a) => a.status !== 'working'), [agents])

  const handleIdleDotClick = (agent: typeof agents[0]) => {
    setActiveAgent(agent.id)
    if (agent.terminalId) setActiveSession(agent.terminalId)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-6 pb-4 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crown className="w-4 h-4 text-ghost-accent" />
            <span className="text-xs font-bold text-ghost-text uppercase tracking-widest">
              Mission Control
            </span>
            {workingAgents.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-950/50 text-ghost-success font-semibold flex items-center gap-1">
                <Zap className="w-3 h-3" />
                {workingAgents.length}
              </span>
            )}
          </div>
          <motion.button
            onClick={() => setShowCreator(true)}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-indigo-950/50 hover:bg-ghost-accent/20 text-ghost-accent transition-colors"
            title="New Agent"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <Plus className="w-4 h-4" />
          </motion.button>
        </div>
      </div>

      {/* File conflict banner */}
      <FileConflictBanner />

      {/* Feed */}
      <div className="flex-1 overflow-y-auto pb-4 sidebar-scroll">
        <AnimatePresence mode="popLayout">
          {agents.length === 0 ? (
            /* Empty state CTA */
            <motion.button
              key="empty-state"
              onClick={() => setShowCreator(true)}
              className="mx-4 flex flex-col items-center gap-2 py-10 rounded-2xl border border-dashed border-ghost-border/50 hover:border-ghost-accent/30 hover:bg-ghost-accent/[0.02] transition-all cursor-pointer"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
              <div className="w-14 h-14 rounded-xl bg-indigo-950/50 flex items-center justify-center">
                <Crown className="w-6 h-6 text-ghost-accent/60" />
              </div>
              <span className="text-xs text-ghost-text-dim">
                Launch your first agent
              </span>
              <span className="text-xs text-ghost-text-dim/40">
                Create a specialist or quick-launch
              </span>
            </motion.button>
          ) : (
            <div className="flex flex-col">
              {/* Working agents — OrchestratorSections */}
              {workingAgents.map((agent, index) => (
                <motion.div
                  key={agent.id}
                  layout
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{
                    duration: 0.2,
                    delay: index * 0.04,
                    layout: { type: 'spring', stiffness: 300, damping: 28 },
                  }}
                >
                  <OrchestratorSection agent={agent} />
                </motion.div>
              ))}

              {/* Idle agents — compact dots row */}
              {idleAgents.length > 0 && (
                <motion.div
                  key="idle-section"
                  layout
                  className="px-3 mt-2"
                  transition={{ layout: { type: 'spring', stiffness: 300, damping: 28 } }}
                >
                  {!idleExpanded ? (
                    <div className="flex items-center gap-1.5 py-2 rounded-lg hover:bg-slate-800/30 transition-colors px-2">
                      <div className="flex items-center -space-x-1.5">
                        {idleAgents.slice(0, 6).map((agent) => (
                          <button
                            key={agent.id}
                            onClick={() => handleIdleDotClick(agent)}
                            className="relative hover:z-10 hover:scale-110 transition-transform"
                            title={agent.name}
                          >
                            <AgentAvatar avatar={agent.avatar} size="sm" />
                          </button>
                        ))}
                        {idleAgents.length > 6 && (
                          <div className="w-8 h-8 rounded-full bg-ghost-border flex items-center justify-center text-[11px] text-ghost-text-dim font-medium">
                            +{idleAgents.length - 6}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => setIdleExpanded(true)}
                        className="text-xs text-ghost-text-dim hover:text-ghost-text transition-colors ml-1"
                      >
                        {idleAgents.length} idle
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => setIdleExpanded(false)}
                        className="text-xs text-ghost-text-dim hover:text-ghost-text transition-colors px-2 py-1 text-left"
                      >
                        {idleAgents.length} idle &mdash; collapse
                      </button>
                      {idleAgents.map((agent) => (
                        <button
                          key={agent.id}
                          onClick={() => handleIdleDotClick(agent)}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-800/40 transition-colors text-left"
                        >
                          <AgentAvatar avatar={agent.avatar} size="sm" />
                          <span className="text-xs text-ghost-text-dim truncate">{agent.name}</span>
                          <span className="text-[10px] text-ghost-text-dim/30 ml-auto">
                            {agent.status}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </div>
          )}
        </AnimatePresence>
      </div>

      {showCreator && <AgentCreator onClose={() => setShowCreator(false)} />}
    </div>
  )
}
