import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Zap, Layers } from 'lucide-react'
import { useAgentStore } from '../../stores/agentStore'
import { useTerminalStore } from '../../stores/terminalStore'
import { AgentCard } from './AgentCard'
import { AgentCreator } from './AgentCreator'
import { AgentAvatar } from './AgentAvatar'
import { FileConflictBanner } from './FileConflictBanner'

export function AgentList() {
  const agents = useAgentStore((s) => s.agents)
  const setActiveAgent = useAgentStore((s) => s.setActiveAgent)
  const setActiveSession = useTerminalStore((s) => s.setActiveSession)
  const [showCreator, setShowCreator] = useState(false)
  const [idleExpanded, setIdleExpanded] = useState(false)

  const workingAgents = useMemo(() => agents.filter((a) => a.status === 'working'), [agents])
  const idleAgents = useMemo(() => agents.filter((a) => a.status !== 'working'), [agents])

  const handleIdleDotClick = (agent: typeof agents[0]) => {
    setActiveAgent(agent.id)
    if (agent.terminalId) {
      setActiveSession(agent.terminalId)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-6 pb-5 mb-3 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-ghost-accent" />
            <span className="text-sm font-bold text-ghost-text uppercase tracking-widest">Agents</span>
            {workingAgents.length > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-emerald-950/50 text-ghost-success font-semibold flex items-center gap-1">
                <Zap className="w-3.5 h-3.5" />
                {workingAgents.length} active
              </span>
            )}
          </div>
          <motion.button
            onClick={() => setShowCreator(true)}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-indigo-950/50 hover:bg-ghost-accent/20 text-ghost-accent transition-colors"
            title="New Agent"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <Plus className="w-5 h-5" />
          </motion.button>
        </div>
      </div>

      {/* File conflict banner */}
      <FileConflictBanner />

      {/* Agent list */}
      <div className="flex-1 overflow-y-auto px-2 pb-4 sidebar-scroll">
        <AnimatePresence mode="popLayout">
          {agents.length === 0 ? (
            <motion.button
              key="empty-state"
              onClick={() => setShowCreator(true)}
              className="mx-2 flex flex-col items-center gap-2 py-10 rounded-2xl border border-dashed border-ghost-border/50 hover:border-ghost-accent/30 hover:bg-ghost-accent/[0.02] transition-all cursor-pointer"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
              <div className="w-14 h-14 rounded-xl bg-indigo-950/50 flex items-center justify-center">
                <Layers className="w-6 h-6 text-ghost-accent/60" />
              </div>
              <span className="text-xs text-ghost-text-dim">
                Launch your first agent
              </span>
              <span className="text-xs text-ghost-text-dim/40">
                Create a specialist or quick-launch from home
              </span>
            </motion.button>
          ) : (
            <div className="flex flex-col gap-2.5">
              {/* Working agents — full cards */}
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
                  <AgentCard agent={agent} />
                </motion.div>
              ))}

              {/* Idle agents — compact row or expanded cards */}
              {idleAgents.length > 0 && (
                <motion.div
                  key="idle-section"
                  layout
                  transition={{ layout: { type: 'spring', stiffness: 300, damping: 28 } }}
                >
                  {!idleExpanded ? (
                    /* Compact: avatar dots + "N idle" label */
                    <div className="flex items-center gap-1.5 px-2 py-2 rounded-lg hover:bg-slate-800/30 transition-colors">
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
                    /* Expanded: full cards */
                    <div className="flex flex-col gap-2.5">
                      <button
                        onClick={() => setIdleExpanded(false)}
                        className="text-xs text-ghost-text-dim hover:text-ghost-text transition-colors px-2 py-1 text-left"
                      >
                        {idleAgents.length} idle &mdash; collapse
                      </button>
                      {idleAgents.map((agent, index) => (
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
                          <AgentCard agent={agent} />
                        </motion.div>
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
