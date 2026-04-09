import { useState, useCallback, useEffect, useRef, useMemo, memo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Rocket, ChevronRight, ChevronDown,
  MessageSquare, FolderOpen, Upload, Trash2,
  Plus, Power, Settings, AlertTriangle,
  Check, Clock, HardDrive, RefreshCw, Loader2,
  Sparkles, RotateCcw, User2, Info, Zap,
} from 'lucide-react'
import { useSwarmStore } from '../../stores/swarmStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import {
  SWARM_CLI_PROVIDERS,
  SWARM_ROLES,
  ROSTER_PRESETS,
  SWARM_WIZARD_STEPS,
  SWARM_WIZARD_STEP_DEFS,
  RAM_PER_AGENT_MB,
  type SwarmWizardStep,
  type SwarmCliProvider,
  type SwarmAgentRole,
  type SwarmRosterAgent,
  getRoleDef,
} from '../../lib/swarm-types'
import { SKILL_CATEGORIES, getSkillsByCategory } from '../../lib/swarm-skills'
import type { AutonomyLevel } from '../../lib/swarm-types'
import type { MissionAnalysis } from '../../lib/mission-planner'
import { SwarmAutonomyConfig } from './SwarmAutonomyConfig'
import { SwarmSimulationView } from './SwarmSimulationView'
import { getPersonasForRole, getPersonaById } from '../../lib/swarm-personas'
import {
  getRecommendedProvider,
  getSmartProviderDefaults,
  getProviderRoleTooltip,
} from '../../lib/swarm-provider-intelligence'
import { resolveDroppedFilePathFromBridge } from '../../lib/fileDrop'

const FUNCTIONAL_PROVIDERS = SWARM_CLI_PROVIDERS.filter((p) => p.coreProvider)
const ACCENT = '#38bdf8' // Sky-400

// ─── PREMIUM FLAT PANEL ──────────────────────────────────────────

function PremiumPanel({ children, onClick, isActive, className = "" }: { children: React.ReactNode, onClick: () => void, isActive: boolean, className?: string }) {
  return (
    <div className={`w-full ${className}`}>
      <button
        onClick={onClick}
        className="relative w-full h-full cursor-pointer group rounded-xl outline-none"
      >
        <div 
          className={`absolute inset-0 rounded-xl transition-colors duration-300 ${isActive ? 'bg-[#38bdf8]/10 border border-[#38bdf8]' : 'bg-white/[0.01] border border-white/5 group-hover:bg-white/[0.03] group-hover:border-white/10'}`} 
        />
        <div className="relative w-full h-full flex flex-col justify-center items-center p-4">
          {children}
        </div>
      </button>
    </div>
  )
}

// ─── HELPERS ──────────────────────────────────────────────────────

function generateSwarmName(mission: string): string {
  const words = mission.trim().split(/\s+/).slice(0, 4).join(' ')
  const hash = Date.now().toString(36).slice(-4)
  const raw = `${words} ${hash}`
  return raw.slice(0, 40)
}

/**
 * Recommend a tier based on mission analysis. Falls back to 'squad' if
 * analysis is unavailable or inconclusive.
 */
/** RAM warning thresholds per preset tier */
const TIER_RAM_WARNINGS: Record<string, { label: string; color: string } | null> = {
  duo: null,
  squad: null,
  team: null,
  platoon: { label: '32GB+', color: '#f59e0b' },   // amber
  battalion: { label: '64GB+', color: '#ef4444' },   // red
  legion: { label: '128GB+', color: '#ef4444' },     // red
}

function recommendTier(analysis: MissionAnalysis | null): { tierId: string; reason: string } {
  if (!analysis || !analysis.tasks || analysis.tasks.length === 0) {
    return { tierId: 'squad', reason: 'Configuracion por defecto — sin analisis disponible' }
  }

  const taskCount = analysis.tasks.length
  const highComplexity = analysis.tasks.filter(t => t.complexity === 'high').length
  const manyFiles = analysis.affectedModules?.length > 5

  // Simple bug fix detection
  const isBugFix = analysis.tasks.every(t =>
    t.title.toLowerCase().includes('fix') || t.title.toLowerCase().includes('bug')
  ) && taskCount <= 2

  if (isBugFix) return { tierId: 'duo', reason: 'Correccion de bugs sencilla — equipo minimo' }
  if (taskCount <= 3) return { tierId: 'duo', reason: `${taskCount} tareas — equipo minimo suficiente` }
  if (taskCount <= 6) {
    if (highComplexity >= 3 || manyFiles) return { tierId: 'team', reason: `${taskCount} tareas + alta complejidad — equipo reforzado` }
    return { tierId: 'squad', reason: `${taskCount} tareas — tamano optimo de equipo` }
  }
  if (taskCount <= 10) {
    if (highComplexity >= 5 || manyFiles) return { tierId: 'platoon', reason: `${taskCount} tareas complejas — peloton necesario` }
    return { tierId: 'team', reason: `${taskCount} tareas — equipo completo` }
  }
  if (taskCount <= 15) {
    return { tierId: 'platoon', reason: `${taskCount} tareas — peloton con coordinadores divididos` }
  }
  if (taskCount <= 20) {
    return { tierId: 'battalion', reason: `${taskCount} tareas — batallon, dominio particionado` }
  }
  if (taskCount <= 30) {
    return { tierId: 'battalion', reason: `${taskCount} tareas — batallon a gran escala` }
  }
  return { tierId: 'legion', reason: `${taskCount}+ tareas — legion, escala maxima` }
}

// ─── TOPOLOGY PREVIEW ──────────────────────────────────────────

const TOPO_NODE_W = 80
const TOPO_NODE_H = 36
const TOPO_TIER_GAP = 90
const TOPO_NODE_GAP = 16
const TOPO_PAD_X = 40
const TOPO_PAD_Y = 30

const ROLE_ABBREV: Record<SwarmAgentRole, string> = {
  coordinator: 'COORD',
  builder: 'BUILD',
  scout: 'SCOUT',
  reviewer: 'REVW',
  analyst: 'ANALY',
  custom: 'CUST',
}

interface TopoNode {
  id: string
  role: SwarmAgentRole
  index: number
  x: number
  y: number
  color: string
  coordGroup?: number
}

function TopologyTreePreview({ composition, total }: { composition: Record<SwarmAgentRole, number>, total: number }) {
  const layout = useMemo(() => {
    const coordCount = composition.coordinator || 0
    const scoutCount = composition.scout || 0
    const analystCount = composition.analyst || 0
    const builderCount = composition.builder || 0
    const reviewerCount = composition.reviewer || 0

    const tiers: { roles: SwarmAgentRole[]; nodes: TopoNode[] }[] = [
      { roles: ['coordinator'], nodes: [] },
      { roles: ['scout', 'analyst'], nodes: [] },
      { roles: ['builder'], nodes: [] },
      { roles: ['reviewer'], nodes: [] },
    ]

    const tierCounts = [
      coordCount,
      scoutCount + analystCount,
      builderCount,
      reviewerCount,
    ]

    const maxNodesInRow = Math.max(...tierCounts, 1)
    const viewW = Math.max(maxNodesInRow * (TOPO_NODE_W + TOPO_NODE_GAP) - TOPO_NODE_GAP + TOPO_PAD_X * 2, 320)
    const activeTierCount = tierCounts.filter(c => c > 0).length
    const viewH = Math.max(activeTierCount * TOPO_TIER_GAP + TOPO_PAD_Y * 2, 200)

    const cx = viewW / 2
    let currentTierY = TOPO_PAD_Y + TOPO_NODE_H / 2

    const placeRow = (role: SwarmAgentRole, count: number, tierNodes: TopoNode[], coordGroup?: number) => {
      const totalW = count * TOPO_NODE_W + (count - 1) * TOPO_NODE_GAP
      const startX = cx - totalW / 2 + TOPO_NODE_W / 2
      const def = getRoleDef(role)
      for (let i = 0; i < count; i++) {
        tierNodes.push({
          id: `${role}-${i}`,
          role,
          index: i,
          x: startX + i * (TOPO_NODE_W + TOPO_NODE_GAP),
          y: currentTierY,
          color: def.color,
          coordGroup: coordGroup !== undefined ? coordGroup : undefined,
        })
      }
    }

    const assignToGroups = (count: number): number[] => {
      if (coordCount <= 1) return Array(count).fill(0)
      const groups: number[] = []
      for (let i = 0; i < count; i++) {
        groups.push(i % coordCount)
      }
      return groups
    }

    if (coordCount > 0) {
      placeRow('coordinator', coordCount, tiers[0].nodes)
      currentTierY += TOPO_TIER_GAP
    }

    const tier1Roles: { role: SwarmAgentRole; count: number }[] = []
    if (scoutCount > 0) tier1Roles.push({ role: 'scout', count: scoutCount })
    if (analystCount > 0) tier1Roles.push({ role: 'analyst', count: analystCount })
    if (tier1Roles.length > 0) {
      const totalTier1 = tier1Roles.reduce((s, r) => s + r.count, 0)
      const totalW = totalTier1 * TOPO_NODE_W + (totalTier1 - 1) * TOPO_NODE_GAP
      const startX = cx - totalW / 2 + TOPO_NODE_W / 2
      let nodeIdx = 0
      for (const { role, count } of tier1Roles) {
        const groups = assignToGroups(count)
        const def = getRoleDef(role)
        for (let i = 0; i < count; i++) {
          tiers[1].nodes.push({
            id: `${role}-${i}`,
            role,
            index: i,
            x: startX + nodeIdx * (TOPO_NODE_W + TOPO_NODE_GAP),
            y: currentTierY,
            color: def.color,
            coordGroup: groups[i],
          })
          nodeIdx++
        }
      }
      currentTierY += TOPO_TIER_GAP
    }

    if (builderCount > 0) {
      const groups = assignToGroups(builderCount)
      const totalW = builderCount * TOPO_NODE_W + (builderCount - 1) * TOPO_NODE_GAP
      const startX = cx - totalW / 2 + TOPO_NODE_W / 2
      const def = getRoleDef('builder')
      for (let i = 0; i < builderCount; i++) {
        tiers[2].nodes.push({
          id: `builder-${i}`,
          role: 'builder',
          index: i,
          x: startX + i * (TOPO_NODE_W + TOPO_NODE_GAP),
          y: currentTierY,
          color: def.color,
          coordGroup: groups[i],
        })
      }
      currentTierY += TOPO_TIER_GAP
    }

    if (reviewerCount > 0) {
      const groups = assignToGroups(reviewerCount)
      const totalW = reviewerCount * TOPO_NODE_W + (reviewerCount - 1) * TOPO_NODE_GAP
      const startX = cx - totalW / 2 + TOPO_NODE_W / 2
      const def = getRoleDef('reviewer')
      for (let i = 0; i < reviewerCount; i++) {
        tiers[3].nodes.push({
          id: `reviewer-${i}`,
          role: 'reviewer',
          index: i,
          x: startX + i * (TOPO_NODE_W + TOPO_NODE_GAP),
          y: currentTierY,
          color: def.color,
          coordGroup: groups[i],
        })
      }
      currentTierY += TOPO_TIER_GAP
    }

    type EdgeDef = { id: string; x1: number; y1: number; x2: number; y2: number; color: string }
    const allEdges: EdgeDef[] = []
    const populatedTierIndices = tiers.map((t, i) => ({ idx: i, nodes: t.nodes })).filter(t => t.nodes.length > 0)

    for (let p = 0; p < populatedTierIndices.length - 1; p++) {
      const parentTier = populatedTierIndices[p].nodes
      const childTier = populatedTierIndices[p + 1].nodes

      for (const child of childTier) {
        const sameGroup = parentTier.filter(n => n.coordGroup === child.coordGroup)
        const candidates = sameGroup.length > 0 ? sameGroup : parentTier
        const parent = candidates.reduce((best, n) =>
          Math.abs(n.x - child.x) < Math.abs(best.x - child.x) ? n : best
        )
        allEdges.push({
          id: `edge-${parent.id}-${child.id}`,
          x1: parent.x,
          y1: parent.y + TOPO_NODE_H / 2,
          x2: child.x,
          y2: child.y - TOPO_NODE_H / 2,
          color: child.color,
        })
      }
    }

    return { tiers, edges: allEdges, viewW, viewH }
  }, [composition])

  if (total === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center relative">
        <svg viewBox="0 0 320 280" className="w-full h-full opacity-[0.08]" style={{ fontFamily: 'monospace' }}>
          <rect x={120} y={20} width={TOPO_NODE_W} height={TOPO_NODE_H} rx={6} fill="none" stroke="#f59e0b" strokeWidth={1} strokeDasharray="4 4" />
          <text x={160} y={43} textAnchor="middle" fill="#f59e0b" fontSize={8} letterSpacing="0.1em">COORD</text>
          <rect x={60} y={100} width={TOPO_NODE_W} height={TOPO_NODE_H} rx={6} fill="none" stroke="#10b981" strokeWidth={1} strokeDasharray="4 4" />
          <text x={100} y={123} textAnchor="middle" fill="#10b981" fontSize={8} letterSpacing="0.1em">SCOUT</text>
          <rect x={180} y={100} width={TOPO_NODE_W} height={TOPO_NODE_H} rx={6} fill="none" stroke="#ec4899" strokeWidth={1} strokeDasharray="4 4" />
          <text x={220} y={123} textAnchor="middle" fill="#ec4899" fontSize={8} letterSpacing="0.1em">ANALY</text>
          <rect x={30} y={180} width={TOPO_NODE_W} height={TOPO_NODE_H} rx={6} fill="none" stroke="#3b82f6" strokeWidth={1} strokeDasharray="4 4" />
          <text x={70} y={203} textAnchor="middle" fill="#3b82f6" fontSize={8} letterSpacing="0.1em">BUILD</text>
          <rect x={150} y={180} width={TOPO_NODE_W} height={TOPO_NODE_H} rx={6} fill="none" stroke="#3b82f6" strokeWidth={1} strokeDasharray="4 4" />
          <text x={190} y={203} textAnchor="middle" fill="#3b82f6" fontSize={8} letterSpacing="0.1em">BUILD</text>
          <rect x={120} y={240} width={TOPO_NODE_W} height={TOPO_NODE_H} rx={6} fill="none" stroke="#8b5cf6" strokeWidth={1} strokeDasharray="4 4" />
          <text x={160} y={263} textAnchor="middle" fill="#8b5cf6" fontSize={8} letterSpacing="0.1em">REVW</text>
          <line x1={160} y1={56} x2={100} y2={100} stroke="white" strokeWidth={0.5} strokeDasharray="3 3" />
          <line x1={160} y1={56} x2={220} y2={100} stroke="white" strokeWidth={0.5} strokeDasharray="3 3" />
          <line x1={100} y1={136} x2={70} y2={180} stroke="white" strokeWidth={0.5} strokeDasharray="3 3" />
          <line x1={100} y1={136} x2={190} y2={180} stroke="white" strokeWidth={0.5} strokeDasharray="3 3" />
          <line x1={70} y1={216} x2={160} y2={240} stroke="white" strokeWidth={0.5} strokeDasharray="3 3" />
          <line x1={190} y1={216} x2={160} y2={240} stroke="white" strokeWidth={0.5} strokeDasharray="3 3" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/15">[ Esperando Arquitectura ]</span>
        </div>
      </div>
    )
  }

  const { tiers, edges, viewW, viewH } = layout

  return (
    <svg viewBox={`0 0 ${viewW} ${viewH}`} className="w-full h-full" style={{ fontFamily: 'monospace' }}>
      <AnimatePresence>
        {edges.map((e) => {
          const midY = (e.y1 + e.y2) / 2
          return (
            <motion.path
              key={e.id}
              initial={{ opacity: 0, pathLength: 0 }}
              animate={{ opacity: 0.2, pathLength: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              d={`M ${e.x1} ${e.y1} Q ${e.x1} ${midY}, ${(e.x1 + e.x2) / 2} ${midY} Q ${e.x2} ${midY}, ${e.x2} ${e.y2}`}
              fill="none"
              stroke={e.color}
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          )
        })}

        {tiers.map((tier, tierIdx) =>
          tier.nodes.map((node) => {
            const halfW = TOPO_NODE_W / 2
            const halfH = TOPO_NODE_H / 2
            const rx = node.x - halfW
            const ry = node.y - halfH
            const abbrev = ROLE_ABBREV[node.role]
            return (
              <motion.g
                key={node.id}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.3, delay: tierIdx * 0.08 }}
              >
                <rect
                  x={rx}
                  y={ry}
                  width={TOPO_NODE_W}
                  height={TOPO_NODE_H}
                  rx={6}
                  fill="#0a0a0a"
                  stroke={node.color}
                  strokeWidth={0.5}
                  opacity={0.8}
                />
                <rect
                  x={rx}
                  y={ry + 4}
                  width={3}
                  height={TOPO_NODE_H - 8}
                  rx={1.5}
                  fill={node.color}
                />
                <text
                  x={rx + 14}
                  y={node.y + 1}
                  dominantBaseline="middle"
                  fill={node.color}
                  fontSize={8}
                  fontWeight="bold"
                  letterSpacing="0.1em"
                >
                  {abbrev}
                </text>
                <text
                  x={rx + TOPO_NODE_W - 10}
                  y={node.y + 1}
                  dominantBaseline="middle"
                  textAnchor="end"
                  fill="rgba(255,255,255,0.5)"
                  fontSize={8}
                  fontWeight="bold"
                >
                  {node.index + 1}
                </text>
              </motion.g>
            )
          })
        )}
      </AnimatePresence>
    </svg>
  )
}

// ─── ROSTER ROW ──────────────────────────────────────────────────

const RosterTableRow = memo(function RosterTableRow({
  agent, index, onUpdate, onRemove
}: {
  agent: SwarmRosterAgent, index: number
  onUpdate: (id: string, updates: Partial<SwarmRosterAgent>) => void
  onRemove: (id: string) => void
}) {
  const roleDef = getRoleDef(agent.role)
  const personas = useMemo(() => getPersonasForRole(agent.role), [agent.role])
  const currentPersona = useMemo(
    () => agent.personaId ? getPersonaById(agent.personaId) : undefined,
    [agent.personaId],
  )
  const providerRec = useMemo(() => getRecommendedProvider(agent.role), [agent.role])
  const isNotRecommended = agent.cliProvider !== providerRec.recommended
  const tooltip = useMemo(
    () => getProviderRoleTooltip(agent.cliProvider, agent.role),
    [agent.cliProvider, agent.role],
  )

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="flex items-center gap-6 px-5 py-3 bg-white/[0.01] border border-white/5 hover:bg-white/[0.02] hover:border-white/10 transition-colors rounded-xl group mb-2"
    >
      {/* Role color indicator — thin premium bar */}
      <div
        className="w-[2px] h-6 opacity-60 group-hover:opacity-100 transition-opacity shrink-0"
        style={{ backgroundColor: roleDef.color }}
      />

      {/* Custom name input */}
      <div className="flex-1 min-w-[120px]">
        <input
          type="text"
          value={agent.customName || ''}
          onChange={(e) => onUpdate(agent.id, { customName: e.target.value || undefined })}
          placeholder={`${roleDef.label}_${index + 1}`}
          className="w-full bg-transparent text-[10px] font-mono text-white/60 placeholder:text-white/20 focus:text-white focus:outline-none uppercase tracking-[0.1em]"
        />
      </div>

      {/* Role selector */}
      <div className="w-[120px] shrink-0">
        <select
          value={agent.role}
          onChange={(e) => onUpdate(agent.id, { role: e.target.value as SwarmAgentRole })}
          className="w-full bg-transparent border-none text-[10px] font-bold font-mono uppercase tracking-[0.15em] focus:outline-none appearance-none cursor-pointer"
          style={{ color: roleDef.color }}
        >
          {SWARM_ROLES.map(r => <option key={r.id} value={r.id} className="bg-[#050505] text-white">{r.label}</option>)}
        </select>
      </div>

      {/* Persona selector */}
      <div className="w-[140px] shrink-0">
        <select
          value={agent.personaId || ''}
          onChange={(e) => onUpdate(agent.id, { personaId: e.target.value || undefined })}
          className="w-full bg-transparent border-none text-[10px] font-mono uppercase tracking-[0.15em] focus:outline-none appearance-none cursor-pointer transition-colors"
          style={{ color: currentPersona?.color || 'rgba(255,255,255,0.4)' }}
          title={currentPersona ? `${currentPersona.name}: ${currentPersona.workingStyle}` : 'Sin persona'}
        >
          <option value="" className="bg-[#050505] text-white/40">DEFAULT AGENT</option>
          {personas.map(p => (
            <option key={p.id} value={p.id} className="bg-[#050505] text-white">{p.name}</option>
          ))}
        </select>
      </div>

      {/* Provider selector + recommendation indicator */}
      <div className="flex items-center gap-2 w-[100px] shrink-0">
        <select
          value={agent.cliProvider}
          onChange={(e) => onUpdate(agent.id, { cliProvider: e.target.value as SwarmCliProvider })}
          className="flex-1 bg-transparent border-none text-[10px] font-mono text-white/50 uppercase tracking-[0.15em] focus:outline-none appearance-none cursor-pointer hover:text-white transition-colors"
        >
          {FUNCTIONAL_PROVIDERS.map(p => <option key={p.id} value={p.id} className="bg-[#050505] text-white">{p.label}</option>)}
        </select>
        {isNotRecommended && (
          <span title={`${providerRec.recommended.charAt(0).toUpperCase() + providerRec.recommended.slice(1)} recomendado`} className="cursor-help shrink-0">
            <Info className="w-3 h-3 text-amber-500/60" />
          </span>
        )}
      </div>

      {/* Auto-approve toggle */}
      <button
        onClick={() => onUpdate(agent.id, { autoApprove: !agent.autoApprove })}
        title={agent.autoApprove ? 'Auto-approve activo' : 'Aprobacion manual'}
        className={`w-14 shrink-0 flex items-center justify-center border rounded py-1.5 transition-colors ${
          agent.autoApprove ? 'bg-[#38bdf8]/10 border-[#38bdf8]/30 text-[#38bdf8]' : 'bg-transparent border-white/5 text-white/20 hover:border-white/20 hover:text-white/50'
        }`}
      >
        <span className="text-[9px] font-bold font-mono tracking-[0.1em] uppercase">AUTO</span>
      </button>

      {/* Remove button */}
      <button
        onClick={() => onRemove(agent.id)}
        className="w-6 shrink-0 flex items-center justify-end text-white/10 hover:text-red-400 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  )
})

// ─── STEP 1: MISSION ─────────────────────────────────────────────

function StepMission() {
  const mission = useSwarmStore((s) => s.wizard.mission)
  const setMission = useSwarmStore((s) => s.setMission)
  const directory = useSwarmStore((s) => s.wizard.directory)
  const setDirectory = useSwarmStore((s) => s.setDirectory)
  const contextFiles = useSwarmStore((s) => s.wizard.contextFiles)
  const addContextFile = useSwarmStore((s) => s.addContextFile)
  const removeContextFile = useSwarmStore((s) => s.removeContextFile)

  // Auto-fill directory from workspace
  useEffect(() => {
    if (!directory) {
      const currentPath = useWorkspaceStore.getState().currentPath
      if (currentPath) setDirectory(currentPath)
    }
  }, [])

  const handleBrowse = useCallback(async () => {
    try {
      const api = window.ghostshell
      if (api?.selectDirectory) {
        const selected = await api.selectDirectory()
        if (selected) setDirectory(selected)
      }
    } catch { /* cancelled */ }
  }, [setDirectory])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const files = e.dataTransfer.files
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      addContextFile({
        id: `ctx-${Date.now()}-${i}`,
        name: file.name,
        path: resolveDroppedFilePathFromBridge(file) ?? file.name,
        size: file.size,
      })
    }
  }, [addContextFile])

  const handleDragOver = useCallback((e: React.DragEvent) => e.preventDefault(), [])

  return (
    <div className="flex flex-col lg:flex-row gap-8 w-full max-w-[1400px] mx-auto h-full min-h-0">
      {/* LEFT: Mission + Directory (60%) */}
      <div className="flex-[3] flex flex-col gap-6 min-h-0">
        <div className="flex flex-col gap-2 shrink-0">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#38bdf8]">FASE 01</span>
          <h2 className="text-3xl font-black tracking-[0.15em] uppercase text-white">Mision y Contexto</h2>
          <p className="font-mono text-[10px] text-white/40 uppercase tracking-[0.2em] mt-1">Describa el objetivo y el sistema determinara la configuracion optima</p>
        </div>

        {/* Mission textarea */}
        <div className="flex-1 relative min-h-[200px]">
          <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-[#38bdf8]" />
          <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-[#38bdf8]" />
          <textarea
            value={mission}
            onChange={(e) => setMission(e.target.value)}
            className="w-full h-full bg-white/[0.01] border border-white/5 p-6 outline-none resize-none font-mono text-sm leading-relaxed text-white/90 placeholder:text-white/20 focus:bg-white/[0.02] focus:border-white/10 transition-colors rounded-none"
            placeholder="> Describa el objetivo del enjambre...&#10;> Archivos a modificar, restricciones y resultados esperados."
            autoFocus
          />
        </div>

        {/* Directory selector */}
        <div className="flex items-center gap-4 bg-white/[0.01] border border-white/5 p-4 focus-within:border-white/20 transition-colors shrink-0">
          <div className="w-0.5 h-8 bg-[#38bdf8] shrink-0" />
          <FolderOpen className="w-5 h-5 text-[#38bdf8] shrink-0" />
          <input
            type="text"
            value={directory}
            onChange={(e) => setDirectory(e.target.value)}
            className="flex-1 bg-transparent outline-none font-mono text-sm text-white placeholder:text-white/20"
            placeholder="/ruta/al/proyecto"
          />
          <button
            onClick={handleBrowse}
            className="px-5 py-2 bg-white/[0.03] hover:bg-[#38bdf8] text-white/80 hover:text-black transition-colors font-bold font-mono text-[10px] uppercase tracking-[0.2em] shrink-0"
          >
            Examinar
          </button>
        </div>
      </div>

      {/* RIGHT: Context Files (40%) */}
      <div className="flex-[2] flex flex-col gap-4 min-h-0">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40 shrink-0">
          Archivos de Contexto ({contextFiles.length})
        </span>

        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="w-full py-10 border border-white/10 border-dashed bg-white/[0.01] hover:bg-white/[0.03] transition-colors flex flex-col items-center justify-center cursor-pointer shrink-0 group"
        >
          <Upload className="w-6 h-6 text-white/20 group-hover:text-[#38bdf8] transition-colors mb-3" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40 group-hover:text-white transition-colors">Arrastrar archivos aqui</span>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-1.5">
          <AnimatePresence>
            {contextFiles.map(f => (
              <motion.div
                key={f.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center justify-between p-3 bg-white/[0.01] border border-white/5 hover:border-white/10 transition-colors"
              >
                <span className="font-mono text-[11px] text-white/80 truncate">{f.name}</span>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[10px] text-white/30">{f.size < 1024 ? `${f.size}B` : `${(f.size / 1024).toFixed(1)}KB`}</span>
                  <button onClick={() => removeContextFile(f.id)} className="text-white/20 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

// ─── STEP 2: CONFIGURE ───────────────────────────────────────────
//
// Fixes applied in this rewrite (roast items #1-29):
//
// #1  analysisTriggered reset: ref tracks the mission+directory combo, not just a boolean.
//     Re-entering step 2 after changing the mission in step 1 re-triggers analysis.
// #2  hasUserModifiedRoster ref: auto-apply only fires when user hasn't manually touched roster.
// #3  Race condition guard: tier buttons set hasUserModifiedRoster, blocking late auto-apply.
// #4  SQUAD fallback: only fires when analysis is idle/error AND user hasn't touched roster.
// #5  analysisTriggered stores the mission hash, so back-forward with same data is idempotent.
// #6  Consolidated store selectors: single useSwarmStore call for wizard state + actions.
// #7  activeTier derived from composition: matchPresetTier() computes it, no stale state.
// #8  Provider change: uses new updateAllRosterProviders (single store call, not O(n)).
// #9  currentComposition accounts for all role types via dynamic reduce.
// #10 Progress bar: indeterminate pulsing bar instead of fake percentage.
// #11 Error state: stores + displays the actual error reason.
// #12 Tier buttons: highlight derived from actual roster, not last-clicked.
// #13 Tier switch is synchronous and fast — no loading indicator needed.
// #14 Re-analizar button: shows different labels for done/idle/error states.
// #15 "Borrar Analisis" button allows clearing analysis and going fully manual.
// #16 Skills and Autonomy sections are open by default so users don't miss them.
// #17 triggerAnalysis reads mission/directory from store.getState() to avoid stale closures.
// #18 applyPresetToRoster inlined into handleTierSwitch (no standalone fn calling getState).
// #19 Error boundary: try/catch around analysis result display with fallback.
// #20 RosterTableRow is memo'd at module level and receives only props.
// #21 Analysis results display wrapped in useMemo.
// #22 Scroll indicator: bottom fade overlay on left panel.
// #23 Topology preview gets more height (280px) for large swarms.
// #24 Recommended tier shows a distinct "IA RECOMENDADO" badge.
// #25 Role colors in roster rows: 4px color bar, role selector colored.
// #26 Persona selector in each roster row.
// #27 Auto-approve indicator shown as toggle with tooltip.
// #28 Cost estimate placeholder (RAM + agent count).
// #29 Analysis results preview shown (tasks, risks, duration).

/** Derive which preset tier matches the current roster composition, or null for custom. */
function matchPresetTier(roster: SwarmRosterAgent[]): string | null {
  if (roster.length === 0) return null
  const comp: Record<string, number> = {}
  for (const a of roster) {
    comp[a.role] = (comp[a.role] || 0) + 1
  }
  for (const preset of ROSTER_PRESETS) {
    let match = true
    for (const role of SWARM_ROLES) {
      if ((preset.composition[role.id] || 0) !== (comp[role.id] || 0)) {
        match = false
        break
      }
    }
    if (match) return preset.id
  }
  return null
}

function StepConfigure({ selectedProvider, setSelectedProvider }: { selectedProvider: SwarmCliProvider, setSelectedProvider: (p: SwarmCliProvider) => void }) {
  // ── Consolidated store reads ─────────────────────────────────
  // Single selector for the full wizard slice to minimize selector count.
  // Individual action selectors are stable (Zustand guarantees referential identity).
  const wizard = useSwarmStore((s) => s.wizard)
  const {
    mission, directory, roster, missionAnalysis, plannerStatus,
    enabledSkills, autonomyOverrides,
  } = wizard

  const setMissionAnalysis = useSwarmStore((s) => s.setMissionAnalysis)
  const setPlannerStatus = useSwarmStore((s) => s.setPlannerStatus)
  const setRosterFromPreset = useSwarmStore((s) => s.setRosterFromPreset)
  const addRosterAgent = useSwarmStore((s) => s.addRosterAgent)
  const removeRosterAgent = useSwarmStore((s) => s.removeRosterAgent)
  const updateRosterAgent = useSwarmStore((s) => s.updateRosterAgent)
  const updateAllRosterProviders = useSwarmStore((s) => s.updateAllRosterProviders)
  const toggleSkill = useSwarmStore((s) => s.toggleSkill)
  const setWizardAutonomyOverrides = useSwarmStore((s) => s.setWizardAutonomyOverrides)

  // ── Local state ──────────────────────────────────────────────
  const [showSkills, setShowSkills] = useState(true)     // #16: open by default
  const [showAutonomy, setShowAutonomy] = useState(true)  // #16: open by default
  const [analysisError, setAnalysisError] = useState<string | null>(null)

  // #1, #5: Track what we analyzed so back-forward with same inputs is idempotent
  const analysisKey = useRef<string | null>(null)
  // #2: Track if user manually modified the roster (tier switch, add, remove, etc.)
  const hasUserModifiedRoster = useRef(false)

  const skillsByCategory = useMemo(() => getSkillsByCategory(), [])

  // ── Derived state (memoized) ─────────────────────────────────
  // #9: Dynamic reduce covers all roles including analyst, custom
  const currentComposition = useMemo(() => {
    const comp: Record<string, number> = {}
    for (const r of SWARM_ROLES) comp[r.id] = 0
    for (const a of roster) comp[a.role] = (comp[a.role] || 0) + 1
    return comp as Record<SwarmAgentRole, number>
  }, [roster])

  const tierRec = useMemo(() => recommendTier(missionAnalysis), [missionAnalysis])

  // #7, #12: Derive active tier from actual roster, not from last-clicked state
  const derivedTier = useMemo(() => matchPresetTier(roster), [roster])

  const totalRam = useMemo(() => ((roster.length * RAM_PER_AGENT_MB) / 1024).toFixed(1), [roster.length])

  // Count of auto-approved agents
  const autoApproveCount = useMemo(() => roster.filter(a => a.autoApprove).length, [roster])

  // ── Analysis trigger ─────────────────────────────────────────
  // #1: Trigger once per unique mission+directory combo
  useEffect(() => {
    const key = `${mission.trim()}::${directory.trim()}::${selectedProvider}`
    if (analysisKey.current === key) return
    if (plannerStatus === 'analyzing') return
    if (!mission.trim() || !directory.trim()) return

    analysisKey.current = key
    triggerAnalysis()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mission, directory, selectedProvider])

  // #2, #3: Auto-apply recommended tier ONLY when user hasn't manually modified roster
  useEffect(() => {
    if (plannerStatus !== 'done' || !missionAnalysis) return
    if (hasUserModifiedRoster.current) return  // User owns the roster now

    const rec = recommendTier(missionAnalysis)
    try {
      if (missionAnalysis.suggestedComposition && Object.keys(missionAnalysis.suggestedComposition).length > 0) {
        const comp = { coordinator: 1, builder: 2, scout: 1, reviewer: 1, analyst: 0, custom: 0, ...missionAnalysis.suggestedComposition }
        setRosterFromPreset(comp as Record<SwarmAgentRole, number>, selectedProvider)
      } else {
        const preset = ROSTER_PRESETS.find(p => p.id === rec.tierId)
        if (preset) setRosterFromPreset(preset.composition, selectedProvider)
      }
    } catch {
      // #19: If analysis data is malformed, fall back to squad
      const squad = ROSTER_PRESETS.find(p => p.id === 'squad')
      if (squad) setRosterFromPreset(squad.composition, selectedProvider)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plannerStatus, missionAnalysis])

  // #4: If entering step 2 with empty roster and no analysis pending, default to SQUAD
  useEffect(() => {
    if (roster.length === 0 && plannerStatus !== 'analyzing' && !hasUserModifiedRoster.current) {
      const timer = setTimeout(() => {
        const current = useSwarmStore.getState().wizard
        if (current.roster.length === 0) {
          const squad = ROSTER_PRESETS.find(p => p.id === 'squad')
          if (squad) setRosterFromPreset(squad.composition, selectedProvider)
        }
      }, 300)
      return () => clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // #17: Read mission/directory from store.getState() to avoid stale closures
  const triggerAnalysis = useCallback(async () => {
    const state = useSwarmStore.getState().wizard
    const m = state.mission.trim()
    const d = state.directory.trim()
    if (!m || !d) return

    setPlannerStatus('analyzing')
    setMissionAnalysis(null)
    setAnalysisError(null)

    try {
      const { analyzeMission } = await import('../../lib/mission-planner')
      const providerMap: Record<string, 'claude' | 'gemini' | 'codex'> = {
        claude: 'claude', gemini: 'gemini', codex: 'codex',
      }
      const { analysis, error } = await analyzeMission(
        m, d, undefined,
        providerMap[selectedProvider] || 'claude',
        (status) => setPlannerStatus(status),
      )
      if (analysis) {
        setMissionAnalysis(analysis)
        setPlannerStatus('done')
      } else {
        setAnalysisError(error || 'El CLI no devolvio resultados. Verifique que el CLI esta instalado y configurado.')
        setPlannerStatus('error')
      }
    } catch (err) {
      // #11: Capture actual error message
      const msg = err instanceof Error ? err.message : String(err)
      setAnalysisError(msg || 'Error desconocido durante el analisis.')
      setPlannerStatus('error')
    }
  }, [selectedProvider, setPlannerStatus, setMissionAnalysis])

  // #3: Tier switch marks user modification
  const handleTierSwitch = useCallback((presetId: string) => {
    hasUserModifiedRoster.current = true  // #2: Block auto-apply
    const preset = ROSTER_PRESETS.find(p => p.id === presetId)
    if (preset) setRosterFromPreset(preset.composition, selectedProvider)
  }, [selectedProvider, setRosterFromPreset])

  // #8: Batch provider change in a single store call
  const handleProviderChange = useCallback((provider: SwarmCliProvider) => {
    setSelectedProvider(provider)
    updateAllRosterProviders(provider)
  }, [setSelectedProvider, updateAllRosterProviders])

  // Wrapper that marks user modification on add/remove
  const handleAddAgent = useCallback((role: SwarmAgentRole) => {
    hasUserModifiedRoster.current = true
    addRosterAgent(role, selectedProvider)
  }, [selectedProvider, addRosterAgent])

  const handleRemoveAgent = useCallback((id: string) => {
    hasUserModifiedRoster.current = true
    removeRosterAgent(id)
  }, [removeRosterAgent])

  // Smart Assign: auto-assign the best provider per role using the intelligence matrix
  const handleSmartAssign = useCallback(() => {
    hasUserModifiedRoster.current = true
    const smartDefaults = getSmartProviderDefaults()
    const currentRoster = useSwarmStore.getState().wizard.roster
    for (const agent of currentRoster) {
      const bestProvider = smartDefaults[agent.role]
      if (bestProvider && bestProvider !== agent.cliProvider) {
        updateRosterAgent(agent.id, { cliProvider: bestProvider })
      }
    }
  }, [updateRosterAgent])

  // #15: Clear analysis and go fully manual
  const handleClearAnalysis = useCallback(() => {
    setMissionAnalysis(null)
    setPlannerStatus('idle')
    setAnalysisError(null)
    analysisKey.current = null
  }, [setMissionAnalysis, setPlannerStatus])

  // #14: Dynamic button label for analysis state
  const analysisButtonLabel = useMemo(() => {
    if (plannerStatus === 'analyzing') return 'Analizando...'
    if (plannerStatus === 'done') return 'Re-analizar'
    if (plannerStatus === 'error') return 'Reintentar'
    return 'Analizar'
  }, [plannerStatus])

  // ── Memoized sub-sections ────────────────────────────────────
  // #21: Analysis results display doesn't re-render on roster changes
  const analysisResultsSection = useMemo(() => {
    if (plannerStatus !== 'done' || !missionAnalysis) return null

    try {
      return (
        <div className="flex flex-col gap-3">
          {/* Recommended tier badge — #24: distinct "IA RECOMENDADO" badge */}
          <div className="flex items-center gap-3 bg-[#38bdf8]/5 border border-[#38bdf8]/20 rounded-lg p-3">
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#38bdf8] text-black font-black font-mono text-[10px] tracking-[0.15em] uppercase rounded">
              <Sparkles className="w-3 h-3" />
              {tierRec.tierId.toUpperCase()}
            </div>
            <span className="font-mono text-[11px] text-white/60 flex-1">{tierRec.reason}</span>
            {/* Show if current matches recommendation */}
            {derivedTier === tierRec.tierId && (
              <span className="font-mono text-[9px] text-emerald-400 uppercase tracking-widest">Aplicado</span>
            )}
          </div>

          {/* Task breakdown */}
          {missionAnalysis.tasks.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/30">
                Tareas Detectadas ({missionAnalysis.tasks.length})
              </span>
              <div className="max-h-[140px] overflow-y-auto custom-scrollbar">
                {missionAnalysis.tasks.map((task, i) => (
                  <div key={task.id} className="flex items-center gap-3 py-1.5 border-b border-white/[0.03] last:border-0">
                    <span className="font-mono text-[9px] text-white/30 w-5 shrink-0">{i + 1}.</span>
                    <span className="font-mono text-[11px] text-white/70 flex-1 truncate">{task.title}</span>
                    <span className={`font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                      task.complexity === 'high' ? 'text-red-400 border-red-400/30' :
                      task.complexity === 'medium' ? 'text-amber-400 border-amber-400/30' :
                      'text-emerald-400 border-emerald-400/30'
                    }`}>{task.complexity}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Risk assessment */}
          {missionAnalysis.riskAssessment.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/30">Riesgos</span>
              {missionAnalysis.riskAssessment.slice(0, 3).map((risk, i) => (
                <div key={i} className="flex items-start gap-2">
                  <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                  <span className="font-mono text-[10px] text-white/50">{risk}</span>
                </div>
              ))}
            </div>
          )}

          {/* Estimated duration + affected modules */}
          <div className="flex items-center gap-4 text-white/40">
            {missionAnalysis.estimatedDuration && (
              <div className="flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                <span className="font-mono text-[10px]">{missionAnalysis.estimatedDuration}</span>
              </div>
            )}
            {missionAnalysis.affectedModules.length > 0 && (
              <span className="font-mono text-[10px]">{missionAnalysis.affectedModules.length} modulos</span>
            )}
          </div>

          {/* #15: Clear analysis button */}
          <button
            onClick={handleClearAnalysis}
            className="flex items-center gap-1.5 text-white/25 hover:text-white/50 transition-colors self-start"
          >
            <RotateCcw className="w-3 h-3" />
            <span className="font-mono text-[9px] uppercase tracking-widest">Borrar Analisis</span>
          </button>
        </div>
      )
    } catch {
      // #19: Error boundary — if analysis data is malformed
      return (
        <div className="flex items-center gap-3 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          <span className="font-mono text-[11px] text-white/50">
            Datos de analisis corruptos. Use configuracion manual.
          </span>
        </div>
      )
    }
  }, [plannerStatus, missionAnalysis, tierRec, derivedTier, handleClearAnalysis])

  return (
    <div className="flex flex-col lg:flex-row gap-6 w-full max-w-[1500px] mx-auto h-full min-h-0">

      {/* LEFT PANEL (40%) — Analysis + Controls */}
      {/* #22: relative + bottom fade overlay for scroll indicator */}
      <div className="flex-[2] flex flex-col min-h-0 relative">
        <div className="flex-1 flex flex-col gap-5 min-h-0 overflow-y-auto custom-scrollbar pr-2 pb-6">

          {/* Provider toggle */}
          <div className="flex flex-col gap-2 shrink-0">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/30">Motor Base</span>
            <div className="grid grid-cols-3 gap-2 h-12">
              {FUNCTIONAL_PROVIDERS.slice(0, 3).map(p => (
                <PremiumPanel
                  key={p.id}
                  onClick={() => handleProviderChange(p.id)}
                  isActive={selectedProvider === p.id}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color, opacity: selectedProvider === p.id ? 1 : 0.3 }} />
                    <span className="font-mono text-[10px] uppercase tracking-[0.15em] font-bold">{p.label}</span>
                  </div>
                </PremiumPanel>
              ))}
            </div>
          </div>

          {/* Analysis Results */}
          <div className="flex flex-col gap-3 shrink-0 bg-white/[0.01] border border-white/5 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#38bdf8]">Analisis de Mision</span>
              <button
                onClick={triggerAnalysis}
                disabled={plannerStatus === 'analyzing'}
                className="flex items-center gap-1.5 text-white/40 hover:text-[#38bdf8] transition-colors disabled:opacity-30"
              >
                {plannerStatus === 'analyzing' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                <span className="font-mono text-[9px] uppercase tracking-widest">
                  {analysisButtonLabel}
                </span>
              </button>
            </div>

            {/* Analysis States */}
            {/* #10: Indeterminate pulsing bar instead of fake percentage */}
            {plannerStatus === 'analyzing' && (
              <div className="flex flex-col gap-3 py-4">
                <div className="flex items-center gap-3">
                  <Loader2 className="w-4 h-4 text-[#38bdf8] animate-spin" />
                  <span className="font-mono text-xs text-white/60">
                    Analizando mision con {FUNCTIONAL_PROVIDERS.find(p => p.id === selectedProvider)?.label || 'CLI'}...
                  </span>
                </div>
                <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full w-[30%] bg-[#38bdf8] rounded-full"
                    animate={{ x: ['0%', '233%', '0%'] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  />
                </div>
                <span className="font-mono text-[10px] text-white/30">Esto suele tardar menos de 90 segundos</span>
              </div>
            )}

            {/* #11: Error state with actual reason */}
            {plannerStatus === 'error' && (
              <div className="flex flex-col gap-2 py-3">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="font-mono text-[11px] text-white/50">Analisis fallido. Configuracion manual activa.</span>
                </div>
                {analysisError && (
                  <div className="bg-red-500/5 border border-red-500/10 rounded-lg px-3 py-2">
                    <span className="font-mono text-[10px] text-red-400/70 break-words">{analysisError}</span>
                  </div>
                )}
                <button
                  onClick={triggerAnalysis}
                  className="flex items-center gap-1.5 text-[#38bdf8]/60 hover:text-[#38bdf8] transition-colors self-start mt-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span className="font-mono text-[9px] uppercase tracking-widest">Reintentar</span>
                </button>
              </div>
            )}

            {plannerStatus === 'idle' && !missionAnalysis && (
              <div className="flex items-center gap-3 py-3">
                <Settings className="w-4 h-4 text-white/20 shrink-0" />
                <span className="font-mono text-[11px] text-white/30">Pulse Analizar o configure manualmente.</span>
              </div>
            )}

            {/* #21: Memoized analysis results */}
            {analysisResultsSection}
          </div>

          {/* Tier Quick-Switch — shows ALL presets with RAM warnings */}
          <div className="flex flex-col gap-2 shrink-0">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/30">Tamano del Equipo</span>
            <div className="grid grid-cols-3 gap-2">
              {ROSTER_PRESETS.map(p => {
                const isActive = derivedTier === p.id
                // #24: Show if this tier is the AI recommendation
                const isRecommended = plannerStatus === 'done' && missionAnalysis && tierRec.tierId === p.id
                const ramWarn = TIER_RAM_WARNINGS[p.id] || null
                return (
                  <PremiumPanel
                    key={p.id}
                    onClick={() => handleTierSwitch(p.id)}
                    isActive={isActive}
                    className="h-[60px]"
                  >
                    <div className="w-full h-full flex flex-col items-center justify-center">
                      <span className={`font-black font-mono text-[10px] tracking-[0.15em] uppercase ${isActive ? 'text-[#38bdf8]' : 'text-white/60'}`}>{p.label}</span>
                      <span className="font-mono text-[9px] text-white/30 mt-0.5">{p.total} Agentes</span>
                      {/* RAM warning badge */}
                      {ramWarn && (
                        <span
                          className="font-mono text-[8px] font-bold mt-1 px-1.5 py-0.5 rounded uppercase tracking-wider"
                          style={{ color: ramWarn.color }}
                        >
                          {ramWarn.label}
                        </span>
                      )}
                      {/* #24: Recommended badge */}
                      {isRecommended && (
                        <span className="absolute -top-2 -right-2 flex items-center gap-0.5 bg-[#38bdf8] text-black px-1.5 py-0.5 rounded text-[8px] font-black font-mono tracking-wider uppercase shadow-lg z-10">
                          <Sparkles className="w-2 h-2" />
                          IA
                        </span>
                      )}
                    </div>
                  </PremiumPanel>
                )
              })}
            </div>
          </div>

          {/* Skills (collapsible) — #16: open by default */}
          <div className="shrink-0">
            <button
              onClick={() => setShowSkills(!showSkills)}
              className="flex items-center gap-2 w-full py-2 text-white/40 hover:text-white/70 transition-colors"
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showSkills ? '' : '-rotate-90'}`} />
              <span className="font-mono text-[10px] uppercase tracking-[0.2em]">Habilidades ({enabledSkills.length} activas)</span>
            </button>
            <AnimatePresence>
              {showSkills && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="pt-2 pb-1">
                    {SKILL_CATEGORIES.map((cat) => {
                      const skills = skillsByCategory[cat.id] || []
                      if (skills.length === 0) return null
                      return (
                        <div key={cat.id} className="mb-4">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-1.5 h-1.5 rounded-sm" style={{ backgroundColor: cat.color }} />
                            <span className="font-bold text-[9px] text-white/40 tracking-[0.15em] uppercase font-mono">{cat.label}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {skills.map((skill) => {
                              const isEnabled = enabledSkills.includes(skill.id)
                              return (
                                <button
                                  key={skill.id}
                                  onClick={() => toggleSkill(skill.id)}
                                  className={`flex items-center justify-between px-4 py-2.5 rounded-lg border transition-all text-left ${isEnabled ? 'bg-[#38bdf8]/10 border-[#38bdf8]/50' : 'bg-white/[0.01] border-white/5 hover:bg-white/[0.03] hover:border-white/10'}`}
                                >
                                  <span className={`font-mono text-[9px] uppercase tracking-[0.1em] ${isEnabled ? 'text-[#38bdf8]' : 'text-white/50'}`}>{skill.name}</span>
                                  <div className={`w-3 h-3 border flex items-center justify-center transition-colors ${isEnabled ? 'border-[#38bdf8] bg-[#38bdf8]' : 'border-white/20 bg-transparent'}`}>
                                    {isEnabled && <Check className="w-2.5 h-2.5 text-black stroke-[3px]" />}
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Autonomy (collapsible) — #16: open by default */}
          <div className="shrink-0">
            <button
              onClick={() => setShowAutonomy(!showAutonomy)}
              className="flex items-center gap-2 w-full py-2 text-white/40 hover:text-white/70 transition-colors"
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAutonomy ? '' : '-rotate-90'}`} />
              <span className="font-mono text-[10px] uppercase tracking-[0.2em]">Autonomia</span>
            </button>
            <AnimatePresence>
              {showAutonomy && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="pt-2">
                    <SwarmAutonomyConfig
                      overrides={autonomyOverrides}
                      onChange={setWizardAutonomyOverrides}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* #28: Resource estimates */}
          <div className="flex items-center gap-6 py-2 shrink-0">
            <div className="flex items-center gap-2">
              <HardDrive className="w-3.5 h-3.5 text-white/30" />
              <span className="font-mono text-[10px] text-white/30 uppercase tracking-wider">RAM {totalRam} GB</span>
            </div>
            <div className="flex items-center gap-2">
              <User2 className="w-3.5 h-3.5 text-white/30" />
              <span className="font-mono text-[10px] text-white/30 uppercase tracking-wider">
                {autoApproveCount}/{roster.length} Auto
              </span>
            </div>
          </div>
        </div>

        {/* #22: Scroll indicator — solid translucent bar at bottom */}
        <div className="absolute bottom-0 left-0 right-2 h-[3px] bg-white/[0.04] pointer-events-none rounded-full" />
      </div>

      {/* RIGHT PANEL (60%) — Roster + Topology */}
      <div className="flex-[3] flex flex-col gap-4 min-h-0">

        {/* Roster */}
        <div className="flex-1 flex flex-col bg-white/[0.01] border border-white/5 rounded-xl min-h-[300px]">
          <div className="p-4 px-5 border-b border-white/5 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/30">
                Procesos Asignados ({roster.length})
              </span>
              {/* Show derived tier or "custom" */}
              {derivedTier ? (
                <span className="font-mono text-[9px] uppercase tracking-widest text-[#38bdf8]/50 bg-[#38bdf8]/5 px-2 py-0.5 rounded">
                  {derivedTier}
                </span>
              ) : roster.length > 0 ? (
                <span className="font-mono text-[9px] uppercase tracking-widest text-white/20 bg-white/[0.02] px-2 py-0.5 rounded">
                  Custom
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              {/* Smart Assign — auto-assign best provider per role */}
              {roster.length > 0 && (
                <button
                  onClick={handleSmartAssign}
                  title="Asignar automaticamente el mejor motor por rol"
                  className="flex items-center gap-1.5 text-amber-500/60 hover:text-amber-400 font-bold font-mono text-[9px] tracking-[0.15em] uppercase transition-colors"
                >
                  <Zap className="w-3 h-3" /> Auto-Motor
                </button>
              )}
              <button
                onClick={() => handleAddAgent('builder')}
                className="text-[#38bdf8] font-bold font-mono text-[10px] tracking-[0.2em] uppercase hover:text-white transition-colors flex items-center gap-2"
              >
                <Plus className="w-3 h-3" /> Montar
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 custom-scrollbar relative">
            <AnimatePresence>
              {roster.map((agent, i) => (
                <RosterTableRow
                  key={agent.id}
                  agent={agent}
                  index={i}
                  onUpdate={updateRosterAgent}
                  onRemove={handleRemoveAgent}
                />
              ))}
            </AnimatePresence>
            {roster.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <span className="font-mono text-[10px] text-white/20 uppercase tracking-[0.2em]">Sin agentes configurados</span>
              </div>
            )}
          </div>
        </div>

        {/* #23: Topology Preview — 280px for better visibility with large swarms */}
        <div className="h-[280px] shrink-0 flex flex-col bg-white/[0.01] border border-white/5 rounded-xl relative overflow-hidden">
          <div className="absolute top-3 left-4 z-10">
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/20">Topologia</span>
          </div>
          <div className="flex-1 w-full h-full p-4 flex items-center justify-center">
            <TopologyTreePreview composition={currentComposition} total={roster.length} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── STEP 3: LAUNCH ──────────────────────────────────────────────

function StepLaunch({ selectedProvider }: { selectedProvider: SwarmCliProvider }) {
  const mission = useSwarmStore((s) => s.wizard.mission)
  const directory = useSwarmStore((s) => s.wizard.directory)
  const roster = useSwarmStore((s) => s.wizard.roster)
  const contextFiles = useSwarmStore((s) => s.wizard.contextFiles)
  const swarmName = useSwarmStore((s) => s.wizard.swarmName)
  const setSwarmName = useSwarmStore((s) => s.setSwarmName)
  const missionAnalysis = useSwarmStore((s) => s.wizard.missionAnalysis)

  // Auto-generate name if empty
  useEffect(() => {
    if (!swarmName.trim()) {
      setSwarmName(generateSwarmName(mission))
    }
  }, [])

  const currentComposition = useMemo(() => {
    const comp: Record<string, number> = { coordinator: 0, builder: 0, scout: 0, reviewer: 0, analyst: 0, custom: 0 }
    roster.forEach(a => { comp[a.role] = (comp[a.role] || 0) + 1 })
    return comp as Record<SwarmAgentRole, number>
  }, [roster])

  const totalRam = ((roster.length * RAM_PER_AGENT_MB) / 1024).toFixed(1)
  const providerLabel = FUNCTIONAL_PROVIDERS.find(p => p.id === selectedProvider)?.label || 'Claude'

  // Role summary: "2 Builders, 1 Scout, 1 Reviewer"
  const roleSummary = useMemo(() => {
    const parts: string[] = []
    for (const role of SWARM_ROLES) {
      const count = currentComposition[role.id] || 0
      if (count > 0) parts.push(`${count} ${role.label}${count > 1 ? 's' : ''}`)
    }
    return parts.join(', ')
  }, [currentComposition])

  return (
    <div className="h-full flex flex-col items-center justify-center max-w-3xl mx-auto w-full gap-8">
      <div className="flex flex-col gap-2 text-center items-center">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#38bdf8]">FASE 04</span>
        <h2 className="text-4xl font-black tracking-[0.15em] uppercase text-white">Despliegue Final</h2>
      </div>

      {/* Editable name */}
      <div className="relative w-full max-w-xl">
        <div className="absolute -left-8 top-1/2 w-6 border-t border-white/10" />
        <div className="absolute -right-8 top-1/2 w-6 border-t border-white/10" />
        <input
          type="text"
          value={swarmName}
          onChange={(e) => setSwarmName(e.target.value)}
          className="w-full bg-transparent text-center outline-none font-black text-4xl font-mono text-[#38bdf8] placeholder:text-[#38bdf8]/20 uppercase tracking-[0.1em]"
          placeholder="OMEGA_01"
          maxLength={60}
          autoFocus
        />
        <span className="block text-center font-mono text-[9px] text-white/20 uppercase tracking-[0.2em] mt-2">Nombre editable</span>
      </div>

      {/* Summary card */}
      <div className="w-full bg-white/[0.01] border border-white/5 rounded-xl p-6 flex flex-col gap-4">
        {/* Mission */}
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/30">Mision</span>
          <span className="font-mono text-xs text-white/70 line-clamp-3">{mission}</span>
        </div>

        <div className="h-px bg-white/5" />

        {/* Grid stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/30">Directorio</span>
            <span className="font-mono text-[11px] text-white/60 truncate">{directory}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/30">Motor</span>
            <span className="font-mono text-[11px] text-[#38bdf8]">{providerLabel}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/30">RAM Est.</span>
            <span className="font-mono text-[11px] text-white/60">{totalRam} GB</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/30">Contexto</span>
            <span className="font-mono text-[11px] text-white/60">{contextFiles.length} archivos</span>
          </div>
        </div>

        <div className="h-px bg-white/5" />

        {/* Roster summary */}
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/30">Equipo ({roster.length} agentes)</span>
          <div className="flex flex-wrap gap-2">
            {SWARM_ROLES.filter(r => (currentComposition[r.id] || 0) > 0).map(r => (
              <div key={r.id} className="flex items-center gap-1.5 px-2.5 py-1 bg-white/[0.02] border border-white/5 rounded">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: r.color }} />
                <span className="font-mono text-[10px] text-white/60">{currentComposition[r.id]}x {r.label}</span>
              </div>
            ))}
          </div>
        </div>

        {missionAnalysis?.estimatedDuration && (
          <>
            <div className="h-px bg-white/5" />
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-white/30" />
              <span className="font-mono text-[10px] text-white/40">Duracion estimada: {missionAnalysis.estimatedDuration}</span>
            </div>
          </>
        )}
      </div>

      {/* Compact topology */}
      <div className="w-full h-[180px] bg-white/[0.01] border border-white/5 rounded-xl relative overflow-hidden">
        <div className="absolute top-3 left-4 z-10">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/15">Topologia</span>
        </div>
        <div className="w-full h-full p-4 flex items-center justify-center">
          <TopologyTreePreview composition={currentComposition} total={roster.length} />
        </div>
      </div>
    </div>
  )
}

// ─── MAIN WIZARD COMPONENT ───────────────────────────────────────

interface SwarmWizardProps {
  onClose: () => void
  onLaunch: (swarmId: string) => void
}

export function SwarmWizard({ onClose, onLaunch }: SwarmWizardProps) {
  const [selectedProvider, setSelectedProvider] = useState<SwarmCliProvider>('claude')

  const currentStep = useSwarmStore((s) => s.wizard.currentStep)
  const roster = useSwarmStore((s) => s.wizard.roster)
  const setWizardStep = useSwarmStore((s) => s.setWizardStep)
  const nextStep = useSwarmStore((s) => s.nextStep)
  const prevStep = useSwarmStore((s) => s.prevStep)
  const launchSwarm = useSwarmStore((s) => s.launchSwarm)
  const swarmName = useSwarmStore((s) => s.wizard.swarmName)
  const mission = useSwarmStore((s) => s.wizard.mission)
  const setSwarmName = useSwarmStore((s) => s.setSwarmName)

  const currentIdx = SWARM_WIZARD_STEPS.indexOf(currentStep)
  const isLastStep = currentIdx === SWARM_WIZARD_STEPS.length - 1

  const canGoNext = useSwarmStore((s) => {
    const w = s.wizard
    switch (w.currentStep) {
      case 'mission': return w.mission.trim().length > 0 && w.directory.trim().length > 0
      case 'configure': return w.roster.length > 0
      case 'simulate': return true // simulation is optional
      case 'launch': return true
      default: return false
    }
  })

  const [direction, setDirection] = useState(0)

  const handleNext = useCallback(() => {
    if (!canGoNext) return
    if (isLastStep) {
      // Auto-generate name if still empty at deploy
      if (!swarmName.trim()) {
        setSwarmName(generateSwarmName(mission))
      }
      const swarm = launchSwarm()
      onLaunch(swarm.id)
    } else {
      setDirection(1)
      nextStep()
    }
  }, [canGoNext, isLastStep, launchSwarm, onLaunch, nextStep, swarmName, mission, setSwarmName])

  // Keyboard navigation
  const canGoNextRef = useRef(canGoNext)
  const handleNextRef = useRef(handleNext)
  const onCloseRef = useRef(onClose)
  canGoNextRef.current = canGoNext
  handleNextRef.current = handleNext
  onCloseRef.current = onClose

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
      if (e.key === 'Enter' && (e.target instanceof HTMLInputElement || e.target === document.body)) {
        e.preventDefault()
        if (canGoNextRef.current) handleNextRef.current()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? 50 : -50, opacity: 0, filter: 'blur(10px)' }),
    center: { x: 0, opacity: 1, filter: 'blur(0px)' },
    exit: (dir: number) => ({ x: dir > 0 ? -50 : 50, opacity: 0, filter: 'blur(10px)' }),
  }

  const totalRam = useMemo(() => ((roster.length * RAM_PER_AGENT_MB) / 1024).toFixed(1), [roster])
  const providerLabel = useMemo(() => SWARM_CLI_PROVIDERS.find(p => p.id === selectedProvider)?.label || 'Unknown', [selectedProvider])

  // Step-specific next button labels
  const nextLabel =
    currentStep === 'mission' ? 'Analizar' :
    currentStep === 'configure' ? 'Simular' :
    currentStep === 'simulate' ? 'Proceder' :
    isLastStep ? 'Desplegar Enjambre' : 'Proceder'

  return createPortal(
    <motion.div
      initial={{ opacity: 0, scale: 1.05, filter: 'blur(20px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 0.95, filter: 'blur(20px)' }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-[99999] bg-[#030508]/95 backdrop-blur-3xl flex flex-col font-sans overflow-hidden"
    >
      {/* HEADER */}
      <header className="flex items-center justify-between px-10 lg:px-16 py-6 shrink-0">
        <div className="flex items-center gap-5">
          <div className="w-10 h-10 bg-[#38bdf8] flex items-center justify-center text-black font-black">
            <Power className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-white text-base font-black tracking-[0.3em] uppercase">GhostShell</span>
            <span className="text-[#38bdf8] text-[9px] font-mono tracking-widest uppercase mt-0.5">Orquestador // Despliegue</span>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-8 lg:gap-12">
          {SWARM_WIZARD_STEP_DEFS.map((step, idx) => {
            const isActive = currentStep === step.id
            const isCompleted = idx < currentIdx
            return (
              <button
                key={step.id}
                onClick={() => {
                  if (isCompleted) {
                    setDirection(idx < currentIdx ? -1 : 1)
                    setWizardStep(step.id)
                  }
                }}
                disabled={!isCompleted && !isActive}
                className={`flex items-center gap-2.5 transition-opacity duration-500 ${
                  isActive ? 'opacity-100' : isCompleted ? 'opacity-50 cursor-pointer hover:opacity-70' : 'opacity-20 cursor-default'
                }`}
              >
                <span className={`font-mono text-[10px] ${isActive ? 'text-[#38bdf8]' : isCompleted ? 'text-emerald-400' : 'text-white'}`}>
                  {isCompleted ? <Check className="w-3.5 h-3.5 inline" /> : `0${idx + 1}`}
                </span>
                <span className="font-black tracking-[0.15em] uppercase text-xs text-white">{step.label}</span>
              </button>
            )
          })}
        </div>

        <button onClick={onClose} className="w-10 h-10 flex items-center justify-center text-white/30 hover:text-white transition-colors">
          <X className="w-7 h-7" />
        </button>
      </header>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentStep}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="absolute inset-0 p-4 lg:p-8 overflow-y-auto custom-scrollbar flex flex-col"
          >
            <div className="flex-1 flex flex-col min-h-0 w-full h-full">
              {currentStep === 'mission' && <StepMission />}
              {currentStep === 'configure' && <StepConfigure selectedProvider={selectedProvider} setSelectedProvider={setSelectedProvider} />}
              {currentStep === 'simulate' && (
                <SwarmSimulationView
                  onApprove={() => { setDirection(1); nextStep() }}
                  onAdjust={() => { setDirection(-1); prevStep() }}
                  onSkip={() => { setDirection(1); nextStep() }}
                />
              )}
              {currentStep === 'launch' && <StepLaunch selectedProvider={selectedProvider} />}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* FOOTER */}
      <footer className="flex items-center justify-between px-10 lg:px-16 py-6 border-t border-white/5 shrink-0 bg-black/20">
        <div className="flex gap-12 font-mono text-[10px] uppercase tracking-widest text-white/50">
          <div className="flex flex-col gap-1.5">
            <span className="text-white/30">Procesos</span>
            <span className="text-white text-sm font-bold">{roster.length}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-white/30">Motor</span>
            <span className="text-[#38bdf8] text-sm font-bold">{providerLabel}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-white/30">RAM Est.</span>
            <span className="text-white text-sm font-bold">{totalRam} GB</span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <button
            onClick={() => { if (currentIdx === 0) onClose(); else { setDirection(-1); prevStep() } }}
            className="text-white/40 font-mono text-[10px] tracking-[0.2em] uppercase hover:text-white transition-colors"
          >
            {currentIdx === 0 ? '[ Abortar ]' : '< Regresar'}
          </button>

          <button
            onClick={handleNext}
            disabled={!canGoNext}
            className={`px-10 py-3.5 font-black tracking-[0.2em] uppercase text-xs transition-colors duration-300 flex items-center gap-3 ${
              isLastStep
                ? 'bg-[#38bdf8] text-black hover:bg-white'
                : 'bg-white text-black hover:bg-[#38bdf8] disabled:opacity-20 disabled:hover:bg-white'
            }`}
          >
            {nextLabel}
            {isLastStep ? <Rocket className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </footer>
    </motion.div>,
    document.body
  )
}
