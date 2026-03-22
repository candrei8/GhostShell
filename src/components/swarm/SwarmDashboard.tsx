// SwarmDashboard — Command Center orchestrator
// Composes CommandBar + AgentRail + MainViewport + RightPanel + SystemLog

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { Activity, Target, Clock, GitBranch } from 'lucide-react'
import { useSwarmStore } from '../../stores/swarmStore'
import { useTerminalStore } from '../../stores/terminalStore'
import type { SwarmAgentRole, SwarmRosterAgent, Swarm } from '../../lib/swarm-types'
import { getRoleDef } from '../../lib/swarm-types'

import { SwarmCommandBar, type CommandCenterViewMode } from './SwarmCommandBar'
import { SwarmAgentRail } from './SwarmAgentRail'
import { SwarmInteractiveGraph, type SelectedEdge } from './SwarmInteractiveGraph'
import { SwarmLiveTimeline } from './SwarmLiveTimeline'
import { SwarmTaskKanban } from './SwarmTaskKanban'
import { SwarmRightPanel } from './SwarmRightPanel'
import { SwarmSystemLog } from './SwarmSystemLog'
import { SwarmSplitPane } from './SwarmSplitPane'

// ─── Prediction Tracker ─────────────────────────────────────

function PredictionTracker({ swarm }: { swarm: Swarm }) {
  const tick = useSwarmStore((s) => s.tick)
  const conflicts = useSwarmStore((s) => s.conflicts)

  const sim = swarm.simulation
  if (!sim) return null

  const elapsed = swarm.startedAt ? (Date.now() - swarm.startedAt) / 60000 : 0
  const actualMin = Math.round(elapsed * 10) / 10
  const predictedMin = Math.round(sim.predictedDuration)
  const accuracy = predictedMin > 0
    ? Math.max(0, Math.round(100 - (Math.abs(predictedMin - actualMin) / predictedMin) * 100))
    : 0

  const predConflicts = sim.conflicts.length
  const actualConflicts = conflicts.length

  return (
    <div className="flex items-center gap-6 px-4 py-1.5 border-b border-white/5 bg-white/[0.01] shrink-0">
      <div className="flex items-center gap-1.5">
        <Target className="w-3 h-3 text-sky-400/60" />
        <span className="font-mono text-[9px] uppercase tracking-wider text-white/40">Prediccion</span>
      </div>
      <div className="flex items-center gap-1">
        <Clock className="w-3 h-3 text-white/30" />
        <span className="font-mono text-[10px] text-white/50">
          PRED <span className="text-white/70">{predictedMin}m</span>
        </span>
      </div>
      <div className="flex items-center gap-1">
        <span className="font-mono text-[10px] text-white/50">
          ACTUAL <span className="text-white/70">{actualMin}m</span>
        </span>
      </div>
      <div className="flex items-center gap-1">
        <span className={`font-mono text-[10px] font-bold ${accuracy >= 70 ? 'text-emerald-400' : accuracy >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
          {accuracy}%
        </span>
      </div>
      <div className="w-px h-3 bg-white/10" />
      <div className="flex items-center gap-1">
        <GitBranch className="w-3 h-3 text-white/30" />
        <span className="font-mono text-[10px] text-white/50">
          Conflictos: <span className="text-white/70">{predConflicts}</span> pred / <span className="text-white/70">{actualConflicts}</span> real
        </span>
      </div>
    </div>
  )
}

// ─── Main Export ────────────────────────────────────────────

export function SwarmDashboard() {
  const activeSwarm = useSwarmStore((s) =>
    s.activeSwarmId ? s.swarms.find((sw) => sw.id === s.activeSwarmId) : undefined
  )
  const pauseSwarm = useSwarmStore((s) => s.pauseSwarm)
  const resumeSwarm = useSwarmStore((s) => s.resumeSwarm)
  const completeSwarm = useSwarmStore((s) => s.completeSwarm)
  const incrementTick = useSwarmStore((s) => s.incrementTick)
  const setSwarmViewMode = useSwarmStore((s) => s.setSwarmViewMode)

  // Local dashboard state
  const [viewMode, setViewMode] = useState<CommandCenterViewMode>('split')
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<SelectedEdge | null>(null)
  const [systemLogCollapsed, setSystemLogCollapsed] = useState(false)

  // Coordinated selection: agent and edge are mutually exclusive
  const handleSelectAgent = useCallback((id: string | null) => {
    setSelectedAgentId(id)
    if (id) setSelectedEdge(null)
  }, [])

  const handleSelectEdge = useCallback((edge: SelectedEdge | null) => {
    setSelectedEdge(edge)
    if (edge) setSelectedAgentId(null)
  }, [])

  // Tick timer (1s interval for timer re-renders)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    const isActive = activeSwarm && (activeSwarm.status === 'running' || activeSwarm.status === 'launching')
    if (isActive) tickRef.current = setInterval(incrementTick, 1000)
    return () => { if (tickRef.current) clearInterval(tickRef.current) }
  }, [activeSwarm?.status, incrementTick])

  // Roster map
  const rosterMap = useMemo(() => {
    if (!activeSwarm) return new Map<string, SwarmRosterAgent>()
    return new Map(activeSwarm.config.roster.map((r) => [r.id, r]))
  }, [activeSwarm])

  // Sorted display agents
  const displayAgents = useMemo(() => {
    if (!activeSwarm) return []
    const roleOrder: SwarmAgentRole[] = ['coordinator', 'scout', 'builder', 'reviewer', 'analyst', 'custom']
    return [...activeSwarm.agents]
      .sort((a, b) => {
        const rA = rosterMap.get(a.rosterId)
        const rB = rosterMap.get(b.rosterId)
        const wA = rA ? roleOrder.indexOf(rA.role) : 99
        const wB = rB ? roleOrder.indexOf(rB.role) : 99
        return wA - wB
      })
      .map((agent) => ({ agent, rosterAgent: rosterMap.get(agent.rosterId)! }))
      .filter((d) => d.rosterAgent)
  }, [activeSwarm, rosterMap])

  // Handle agent selection from label (used by Timeline)
  const handleSelectByLabel = useCallback((label: string) => {
    const found = displayAgents.find(({ rosterAgent }, idx) => {
      const roleDef = getRoleDef(rosterAgent.role)
      const agentLabel = rosterAgent.customName || `${roleDef.label} ${idx + 1}`
      return agentLabel === label
    })
    if (found) handleSelectAgent(found.agent.rosterId)
  }, [displayAgents, handleSelectAgent])

  // Handlers
  const handleJumpToTerminal = useCallback((terminalId: string) => {
    setSwarmViewMode('terminals')
    useTerminalStore.getState().setActiveSession(terminalId)
  }, [setSwarmViewMode])

  const handleBack = useCallback(() => {
    setSwarmViewMode('terminals')
  }, [setSwarmViewMode])

  // ─── Early return ───────────────────────────────────────

  if (!activeSwarm) return null

  // ─── Render ─────────────────────────────────────────────

  return (
    <div
      className="flex flex-col h-full w-full overflow-hidden"
      style={{ background: '#050505', color: 'white' }}
    >
      {/* Command Bar — 44px */}
      <SwarmCommandBar
        swarm={activeSwarm}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onBack={handleBack}
        onPause={() => pauseSwarm(activeSwarm.id)}
        onResume={() => resumeSwarm(activeSwarm.id)}
        onStop={() => completeSwarm(activeSwarm.id)}
      />

      {/* Prediction Tracker — only visible when simulation data exists */}
      {activeSwarm.simulation && (
        <PredictionTracker swarm={activeSwarm} />
      )}

      {/* Main body — fills remaining height */}
      <div className="flex flex-1 min-h-0">
        {/* Agent Rail — 48px left */}
        <SwarmAgentRail
          agents={displayAgents}
          selectedAgentId={selectedAgentId}
          onSelectAgent={handleSelectAgent}
        />

        {/* Center: Viewport + System Log */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Main Viewport */}
          <div className="flex-1 min-h-0 relative">
            {viewMode === 'graph' && (
              <SwarmInteractiveGraph
                agents={displayAgents}
                messages={activeSwarm.messages}
                selectedAgentId={selectedAgentId}
                selectedEdge={selectedEdge}
                onSelectAgent={handleSelectAgent}
                onSelectEdge={handleSelectEdge}
                onDoubleClickAgent={handleJumpToTerminal}
              />
            )}

            {viewMode === 'split' && (
              <SwarmSplitPane
                initialRatio={0.55}
                top={
                  <SwarmInteractiveGraph
                    agents={displayAgents}
                    messages={activeSwarm.messages}
                    selectedAgentId={selectedAgentId}
                    selectedEdge={selectedEdge}
                    onSelectAgent={handleSelectAgent}
                    onSelectEdge={handleSelectEdge}
                    onDoubleClickAgent={handleJumpToTerminal}
                  />
                }
                bottom={
                  <SwarmLiveTimeline
                    messages={activeSwarm.messages}
                    roster={activeSwarm.config.roster}
                    onSelectAgent={handleSelectByLabel}
                  />
                }
              />
            )}

            {viewMode === 'control' && (
              <SwarmSplitPane
                initialRatio={0.55}
                top={
                  <SwarmLiveTimeline
                    messages={activeSwarm.messages}
                    roster={activeSwarm.config.roster}
                    onSelectAgent={handleSelectByLabel}
                  />
                }
                bottom={
                  <SwarmTaskKanban
                    tasks={activeSwarm.tasks}
                    roster={activeSwarm.config.roster}
                  />
                }
              />
            )}

            {/* Empty state overlay */}
            {activeSwarm.agents.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <Activity className="w-5 h-5" style={{ color: 'rgba(255,255,255,0.1)' }} />
                <p className="text-[10px] text-white/20 font-mono uppercase tracking-widest">
                  Agents warming up...
                </p>
              </div>
            )}
          </div>

          {/* System Log — bottom */}
          <SwarmSystemLog
            swarmId={activeSwarm.id}
            collapsed={systemLogCollapsed}
            onToggleCollapse={() => setSystemLogCollapsed(!systemLogCollapsed)}
          />
        </div>

        {/* Right Panel — 260px */}
        <SwarmRightPanel
          swarm={activeSwarm}
          agents={displayAgents}
          selectedAgentId={selectedAgentId}
          selectedEdge={selectedEdge}
          onSelectAgent={handleSelectAgent}
          onClearEdge={() => setSelectedEdge(null)}
          onJumpToTerminal={handleJumpToTerminal}
        />
      </div>
    </div>
  )
}
