import { useTerminalStore } from '../../stores/terminalStore'
import { useActivityStore } from '../../stores/activityStore'
import { useAgentStore } from '../../stores/agentStore'
import { Network, PlayCircle, Loader2 } from 'lucide-react'
import { getProviderColor } from '../../lib/providers'
import { motion, AnimatePresence } from 'framer-motion'

interface DisplaySubAgent {
  id: string
  type: string
  description: string
  status: 'spawning' | 'running'
}

export function GlobalSwarmPanel() {
  const sessions = useTerminalStore((s) => s.sessions)
  const activities = useActivityStore((s) => s.activities)
  const getAgent = useAgentStore((s) => s.getAgent)

  const activeSessionRows = sessions
    .map((session) => {
      const activityId = session.agentId || session.id
      const agent = session.agentId ? getAgent(session.agentId) : undefined
      const provider = agent?.provider || session.detectedProvider
      const providerColor = provider ? getProviderColor(provider) : '#64748b'
      const agentActivity = activities[activityId]
      const activeSubAgents = (agentActivity?.subAgents || []).filter(
        (sub) => sub.status === 'running' || sub.status === 'spawning',
      )

      const visibleSubAgents: DisplaySubAgent[] = activeSubAgents.map((sub) => ({
        id: sub.id,
        type: sub.type,
        description: sub.description,
        status: sub.status === 'spawning' ? 'spawning' : 'running',
      }))

      const isAgentWorking =
        agent?.status === 'working' ||
        (!!agentActivity?.currentActivity && agentActivity.currentActivity !== 'idle')

      if (visibleSubAgents.length === 0 && isAgentWorking) {
        visibleSubAgents.push({
          id: `main-worker-${session.id}`,
          type: 'CLI',
          description: agentActivity?.currentDetail || 'Main CLI worker is active',
          status: 'running',
        })
      }

      if (visibleSubAgents.length === 0) return null

      return {
        session,
        sessionTitle: agent?.name || session.title,
        providerColor,
        visibleSubAgents,
      }
    })
    .filter((row): row is NonNullable<typeof row> => !!row)

  const totalSubAgents = activeSessionRows.reduce((sum, row) => sum + row.visibleSubAgents.length, 0)

  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04] shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-300/80">
            <Network className="w-3.5 h-3.5" />
          </div>
          <div>
            <h2 className="text-[13px] font-semibold text-white/85">Swarm</h2>
            <p className="text-[10px] text-white/30">Active sub-agents across sessions</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-white/35">
            {activeSessionRows.length} sessions
          </span>
          <span className="rounded-md bg-cyan-400/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-300/80">
            {totalSubAgents} active
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto sidebar-scroll p-3 space-y-3">
        {activeSessionRows.map(({ session, sessionTitle, providerColor, visibleSubAgents }) => (
          <div key={session.id} className="rounded-xl border border-white/[0.05] bg-white/[0.015] overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.03]">
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: providerColor }} />
              <span className="text-[12px] font-medium text-white/70">{sessionTitle}</span>
              <span className="ml-auto rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-white/30">
                {visibleSubAgents.length}
              </span>
            </div>

            <div className="p-2 space-y-1.5">
              <AnimatePresence>
                {visibleSubAgents.map((sub) => (
                  <motion.div
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    key={sub.id}
                    className="relative flex items-start gap-2.5 rounded-lg p-2 hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="absolute top-0 left-0 w-0.5 h-full rounded-full" style={{ backgroundColor: providerColor, opacity: 0.5 }} />

                    <div className="mt-0.5 shrink-0 ml-1.5">
                      {sub.status === 'spawning' ? (
                        <Loader2 className="w-3.5 h-3.5 text-white/30 animate-spin" />
                      ) : (
                        <PlayCircle className="w-3.5 h-3.5 text-white/40" />
                      )}
                    </div>

                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono font-semibold text-white/60 uppercase tracking-wider">{sub.type}</span>
                        <span className="rounded-md bg-white/[0.04] px-1 py-px text-[9px] text-white/30 uppercase tracking-wider">
                          {sub.status}
                        </span>
                      </div>
                      <span className="text-[10px] text-white/35 leading-snug mt-0.5">
                        {sub.description}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        ))}

        {activeSessionRows.length === 0 && (
          <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.06] text-center">
            <Network className="w-5 h-5 text-white/10 mb-2" />
            <p className="text-[12px] font-medium text-white/30">No active sub-agents</p>
            <p className="text-[10px] text-white/15 mt-0.5">The swarm is idle</p>
          </div>
        )}
      </div>
    </div>
  )
}
