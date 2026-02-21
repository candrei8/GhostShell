import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Zap, WifiOff, FileText, Cpu, Layers } from 'lucide-react'
import { useAgentStore } from '../../stores/agentStore'
import { useActivityStore } from '../../stores/activityStore'
import { AgentCard } from './AgentCard'
import { AgentCreator } from './AgentCreator'
import { FileConflictBanner } from './FileConflictBanner'

type FilterMode = 'all' | 'working' | 'idle'

export function AgentList() {
  const agents = useAgentStore((s) => s.agents)
  const [showCreator, setShowCreator] = useState(false)
  const [filter, setFilter] = useState<FilterMode>('all')

  // Derived counts from activityStore — use stable selectors that return primitives
  const totalSubAgents = useActivityStore((s) => {
    let count = 0
    for (const activity of Object.values(s.activities)) {
      count += activity.subAgents.filter((sa) => sa.status === 'running' || sa.status === 'spawning').length
    }
    return count
  })

  const totalFilesTouched = useActivityStore((s) => {
    const paths = new Set<string>()
    for (const activity of Object.values(s.activities)) {
      for (const touch of activity.filesTouched) {
        paths.add(touch.path)
      }
    }
    return paths.size
  })

  // Show ALL agents now (not just template-based ones)
  const visibleAgents = useMemo(() => {
    let filtered = agents
    if (filter === 'working') filtered = agents.filter((a) => a.status === 'working')
    else if (filter === 'idle') filtered = agents.filter((a) => a.status === 'idle' || a.status === 'offline')
    return filtered
  }, [agents, filter])

  const workingCount = agents.filter((a) => a.status === 'working').length
  const offlineCount = agents.filter((a) => a.status === 'offline' || a.status === 'error').length

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-3 pt-4 pb-3 mb-3 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-ghost-accent" />
            <span className="text-xs font-bold text-ghost-text uppercase tracking-widest">Agents</span>
          </div>
          <motion.button
            onClick={() => setShowCreator(true)}
            className="w-7 h-7 flex items-center justify-center rounded-md bg-ghost-accent/10 hover:bg-ghost-accent/20 text-ghost-accent transition-colors"
            title="New Agent"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <Plus className="w-4 h-4" />
          </motion.button>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-2 flex-wrap">
          {agents.length > 0 && (
            <span className="text-[11px] px-2 py-0.5 rounded bg-ghost-accent/10 text-ghost-accent font-semibold">
              {agents.length} agents
            </span>
          )}
          {workingCount > 0 && (
            <button
              onClick={() => setFilter(filter === 'working' ? 'all' : 'working')}
              className={`text-[11px] px-2 py-0.5 rounded font-medium flex items-center gap-1 transition-colors ${
                filter === 'working'
                  ? 'bg-ghost-success/20 text-ghost-success ring-1 ring-ghost-success/30'
                  : 'bg-ghost-success/10 text-ghost-success hover:bg-ghost-success/15'
              }`}
            >
              <Zap className="w-3 h-3" />
              {workingCount} active
            </button>
          )}
          {offlineCount > 0 && (
            <button
              onClick={() => setFilter(filter === 'idle' ? 'all' : 'idle')}
              className={`text-[11px] px-2 py-0.5 rounded font-medium flex items-center gap-1 transition-colors ${
                filter === 'idle'
                  ? 'bg-gray-500/20 text-gray-400 ring-1 ring-gray-500/30'
                  : 'bg-gray-600/10 text-gray-500 hover:bg-gray-600/15'
              }`}
            >
              <WifiOff className="w-3 h-3" />
              {offlineCount}
            </button>
          )}
          {totalSubAgents > 0 && (
            <span className="text-[11px] px-2 py-0.5 rounded bg-indigo-400/10 text-indigo-400 font-medium flex items-center gap-1">
              <Cpu className="w-3 h-3" />
              {totalSubAgents} sub
            </span>
          )}
          {totalFilesTouched > 0 && (
            <span className="text-[11px] px-2 py-0.5 rounded bg-cyan-400/10 text-cyan-400 flex items-center gap-1">
              <FileText className="w-3 h-3" />
              {totalFilesTouched}
            </span>
          )}
        </div>
      </div>

      {/* File conflict banner */}
      <FileConflictBanner />

      {/* Agent list */}
      <div className="flex-1 overflow-y-auto px-2 pb-4 sidebar-scroll">
        <AnimatePresence mode="popLayout">
          {visibleAgents.length === 0 ? (
            agents.length === 0 ? (
              <motion.button
                key="empty-state"
                onClick={() => setShowCreator(true)}
                className="mx-2 flex flex-col items-center gap-2 py-8 rounded-lg border border-dashed border-ghost-border/50 hover:border-ghost-accent/30 hover:bg-ghost-accent/[0.02] transition-all cursor-pointer"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
              >
                <div className="w-10 h-10 rounded-lg bg-ghost-accent/10 flex items-center justify-center">
                  <Layers className="w-5 h-5 text-ghost-accent/60" />
                </div>
                <span className="text-[11px] text-ghost-text-dim">
                  Launch your first agent
                </span>
                <span className="text-[11px] text-ghost-text-dim/40">
                  Create a specialist or quick-launch from home
                </span>
              </motion.button>
            ) : (
              <motion.div
                key="no-match"
                className="mx-2 text-center py-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <span className="text-[11px] text-ghost-text-dim/40">
                  No agents match filter
                </span>
              </motion.div>
            )
          ) : (
            <div className="flex flex-col gap-1">
              {visibleAgents.map((agent, index) => (
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
        </AnimatePresence>
      </div>

      {showCreator && <AgentCreator onClose={() => setShowCreator(false)} />}
    </div>
  )
}
