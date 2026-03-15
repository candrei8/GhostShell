import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion'
import {
  X, Rocket, ChevronRight, ChevronLeft, ChevronDown,
  Users, MessageSquare, FolderOpen, BookOpen, Type,
  Check, FolderSearch, Upload, Trash2,
  Terminal, Cpu, Network, Activity, HardDrive
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
import { RoleIcon, CliIcon } from './swarm-icons'

const FUNCTIONAL_PROVIDERS = SWARM_CLI_PROVIDERS.filter((p) => p.coreProvider)
const ACCENT = '#38bdf8' // Sky-400

const STEP_ICONS: Record<string, React.FC<{ className?: string }>> = {
  Users, MessageSquare, FolderOpen, BookOpen, Type,
}

// ─── Preset Role Breakdown (who does what per layout) ─────

interface PresetRoleInfo {
  role: SwarmAgentRole
  count: number
  duty: string
}

const PRESET_ROLE_BREAKDOWN: Record<string, { summary: string; roles: PresetRoleInfo[] }> = {
  duo: {
    summary: 'Minimal viable swarm — Coordinator drives, Builder implements, Scout reconnoiters.',
    roles: [
      { role: 'coordinator', count: 1, duty: 'Decomposes tasks, self-reviews, manages single builder directly' },
      { role: 'builder', count: 1, duty: 'Full-stack implementation with broad scope and high autonomy' },
      { role: 'scout', count: 1, duty: 'Quick codebase recon, then available as Builder support' },
    ],
  },
  squad: {
    summary: 'Sweet spot — full review loop, 2 builders work in parallel.',
    roles: [
      { role: 'coordinator', count: 1, duty: 'Standard decomposition, routes reviews, resolves conflicts' },
      { role: 'builder', count: 2, duty: 'Task-scoped implementation, per-task branches' },
      { role: 'scout', count: 1, duty: 'Full codebase recon, standby for questions' },
      { role: 'reviewer', count: 1, duty: 'Sequential code review queue, catches bugs' },
    ],
  },
  team: {
    summary: 'High parallelism — domain-split scouts, 4 builders, dedicated reviewer.',
    roles: [
      { role: 'coordinator', count: 1, duty: 'Fine-grained task decomposition (8-12 tasks), domain grouping' },
      { role: 'builder', count: 4, duty: 'Domain-scoped work, Builder 1 leads, per-domain branches' },
      { role: 'scout', count: 2, duty: 'Split recon: Scout 1 = frontend/UI, Scout 2 = backend/infra' },
      { role: 'reviewer', count: 1, duty: 'Priority review queue, blocking tasks first' },
    ],
  },
  platoon: {
    summary: 'Full scale — 2 coordinators split domains, deep specialization.',
    roles: [
      { role: 'coordinator', count: 2, duty: 'Domain ownership split, inter-coordinator sync protocol' },
      { role: 'builder', count: 5, duty: 'Layer-scoped, strictly scoped tasks, lead builder per domain' },
      { role: 'scout', count: 3, duty: 'Deep-dive: frontend / backend / testing+infra specialization' },
      { role: 'reviewer', count: 2, duty: 'Domain-split reviews, round-robin within domain' },
    ],
  },
}

// ─── 3D Hardware Frame Wrapper (Pure Glass UI) ────────────────

function HardwareFrame({ children, className = "", containerClassName = "", depth = 10, hover = false }: { children: React.ReactNode, className?: string, containerClassName?: string, depth?: number, hover?: boolean }) {
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const mouseXSpring = useSpring(x, { stiffness: 400, damping: 30 })
  const mouseYSpring = useSpring(y, { stiffness: 400, damping: 30 })
  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], [`${depth}deg`, `-${depth}deg`])
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], [`-${depth}deg`, `${depth}deg`])

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!hover) return
    const rect = e.currentTarget.getBoundingClientRect()
    x.set((e.clientX - rect.left) / rect.width - 0.5)
    y.set((e.clientY - rect.top) / rect.height - 0.5)
  }
  
  const handleMouseLeave = () => { 
    if (!hover) return
    x.set(0)
    y.set(0)
  }

  return (
    <motion.div style={{ perspective: 1500 }} className={containerClassName}>
      <motion.div
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        className={`relative w-full h-full ${className}`}
      >
        {children}
      </motion.div>
    </motion.div>
  )
}

// ─── Live Topology SVG Preview ──────────────────────────────────

const TOPO_W = 360
const TOPO_H = 200
const TOPO_NODE_R = 16
const TOPO_COORD_Y = 45
const TOPO_WORKER_Y = 145
const TOPO_CX = TOPO_W / 2

function TopologyTreePreview({ composition, total }: { composition: Record<SwarmAgentRole, number>, total: number }) {
  const { coordNodes, workerNodes } = useMemo(() => {
    const coords: { id: string; role: SwarmAgentRole; x: number; y: number }[] = []
    const workers: { id: string; role: SwarmAgentRole; x: number; y: number }[] = []

    const coordCount = composition.coordinator || 0
    const coordSpacing = Math.min(70, TOPO_W / (coordCount + 1))
    const coordStartX = TOPO_CX - ((coordCount - 1) * coordSpacing) / 2
    for (let i = 0; i < coordCount; i++) {
      coords.push({ id: `c-${i}`, role: 'coordinator', x: coordStartX + i * coordSpacing, y: TOPO_COORD_Y })
    }

    // Workers: scouts → builders → reviewers (sorted)
    const roleOrder: SwarmAgentRole[] = ['scout', 'builder', 'reviewer', 'custom']
    const workerList: { id: string; role: SwarmAgentRole }[] = []
    for (const role of roleOrder) {
      for (let i = 0; i < (composition[role] || 0); i++) {
        workerList.push({ id: `${role[0]}-${i}`, role })
      }
    }

    const wCount = workerList.length
    const wSpacing = Math.min(55, (TOPO_W - 40) / Math.max(wCount, 1))
    const wStartX = TOPO_CX - ((wCount - 1) * wSpacing) / 2
    for (let i = 0; i < wCount; i++) {
      workers.push({ ...workerList[i], x: wStartX + i * wSpacing, y: TOPO_WORKER_Y })
    }

    return { coordNodes: coords, workerNodes: workers }
  }, [composition])

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center bg-white/[0.015] border border-white/[0.04] rounded-lg w-full h-full relative overflow-hidden">
        <Network className="w-8 h-8 text-white/[0.06] mb-2" />
        <span className="text-[10px] text-white/15 font-mono uppercase tracking-widest">Select a preset</span>
      </div>
    )
  }

  return (
    <div className="bg-white/[0.015] border border-white/[0.04] rounded-lg w-full h-full relative overflow-hidden">
      <svg viewBox={`0 0 ${TOPO_W} ${TOPO_H}`} className="w-full h-full">
        <defs>
          <style>{`
            @keyframes topo-dash { to { stroke-dashoffset: -12; } }
            .topo-edge { animation: topo-dash 1.5s linear infinite; }
          `}</style>
        </defs>

        {/* Tier labels */}
        <text x={8} y={TOPO_COORD_Y + 3} fontSize={7} fill="rgba(255,255,255,0.08)" fontWeight={700} fontFamily="ui-monospace, monospace">COORD</text>
        <text x={8} y={TOPO_WORKER_Y + 3} fontSize={7} fill="rgba(255,255,255,0.08)" fontWeight={700} fontFamily="ui-monospace, monospace">WORKERS</text>

        {/* Separator */}
        <line x1={0} y1={(TOPO_COORD_Y + TOPO_WORKER_Y) / 2} x2={TOPO_W} y2={(TOPO_COORD_Y + TOPO_WORKER_Y) / 2} stroke="rgba(255,255,255,0.03)" strokeWidth={0.5} />

        {/* Edges: coord → worker */}
        {coordNodes.map((c) =>
          workerNodes.map((w, wi) => (
            <line
              key={`e-${c.id}-${w.id}`}
              x1={c.x} y1={c.y + TOPO_NODE_R}
              x2={w.x} y2={w.y - TOPO_NODE_R}
              stroke={getRoleDef(w.role).color}
              strokeWidth={0.8}
              strokeOpacity={0.15}
              strokeDasharray="3 3"
              className="topo-edge"
            />
          ))
        )}

        {/* Coordinator nodes */}
        {coordNodes.map((n, i) => {
          const def = getRoleDef(n.role)
          return (
            <g key={n.id}>
              {/* Pulse */}
              <circle cx={n.x} cy={n.y} r={TOPO_NODE_R + 4} fill="none" stroke={def.color} strokeWidth={0.8} opacity={0.15}>
                <animate attributeName="r" from={TOPO_NODE_R + 2} to={TOPO_NODE_R + 14} dur="2.5s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.2" to="0" dur="2.5s" repeatCount="indefinite" />
              </circle>
              {/* Node */}
              <circle cx={n.x} cy={n.y} r={TOPO_NODE_R} fill="#0a0f1a" stroke={def.color} strokeWidth={1.8} strokeOpacity={0.7} />
              <foreignObject x={n.x - 6} y={n.y - 6} width={12} height={12}>
                <div style={{ color: def.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Terminal className="w-3 h-3" />
                </div>
              </foreignObject>
              <text x={n.x} y={n.y + TOPO_NODE_R + 10} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize={7} fontWeight={700} fontFamily="ui-monospace, monospace">
                COORD {coordNodes.length > 1 ? i + 1 : ''}
              </text>
            </g>
          )
        })}

        {/* Worker nodes */}
        {workerNodes.map((n) => {
          const def = getRoleDef(n.role)
          return (
            <g key={n.id}>
              <circle cx={n.x} cy={n.y} r={TOPO_NODE_R - 2} fill="#0a0f1a" stroke={def.color} strokeWidth={1.2} strokeOpacity={0.5} />
              <foreignObject x={n.x - 5} y={n.y - 5} width={10} height={10}>
                <div style={{ color: def.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <RoleIcon iconName={def.icon} className="w-2.5 h-2.5" color={def.color} />
                </div>
              </foreignObject>
              <text x={n.x} y={n.y + TOPO_NODE_R + 6} textAnchor="middle" fill={def.color} fillOpacity={0.4} fontSize={6} fontWeight={600} fontFamily="ui-monospace, monospace">
                {def.label.slice(0, 3).toUpperCase()}
              </text>
            </g>
          )
        })}

        {/* Total badge */}
        <rect x={TOPO_W - 42} y={4} width={36} height={16} rx={4} fill="rgba(56,189,248,0.1)" stroke="rgba(56,189,248,0.2)" strokeWidth={0.5} />
        <text x={TOPO_W - 24} y={15} textAnchor="middle" fill="#38bdf8" fontSize={8} fontWeight={800} fontFamily="ui-monospace, monospace">
          {total}
        </text>
      </svg>
    </div>
  )
}

// ─── Compact Data Table Row (Roster) ───────────────────────────

function RosterTableRow({
  agent,
  index,
  onUpdate,
  onRemove,
}: {
  agent: SwarmRosterAgent
  index: number
  onUpdate: (id: string, updates: Partial<SwarmRosterAgent>) => void
  onRemove: (id: string) => void
}) {
  const roleDef = getRoleDef(agent.role)

  return (
    <div className="group flex items-center gap-3 px-3 py-1.5 border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors relative">
      {/* Role color accent bar */}
      <div className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r opacity-0 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: roleDef.color }} />

      <div className="w-6 flex items-center justify-center shrink-0">
        <RoleIcon iconName={roleDef.icon} className="w-3 h-3 opacity-30 group-hover:opacity-70 transition-opacity" color={roleDef.color} />
      </div>

      {/* Name Input */}
      <div className="flex-1 min-w-0">
        <input
          type="text"
          value={agent.customName || ''}
          onChange={(e) => onUpdate(agent.id, { customName: e.target.value || undefined })}
          placeholder={`${roleDef.label}_${index + 1}`}
          className="w-full bg-transparent text-[11px] font-mono text-white placeholder:text-white/20 focus:outline-none focus:text-[#38bdf8] transition-colors py-1"
        />
      </div>

      {/* Role Select */}
      <div className="w-[120px] shrink-0">
        <select
          value={agent.role}
          onChange={(e) => onUpdate(agent.id, { role: e.target.value as SwarmAgentRole })}
          className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-[10px] font-mono text-white/80 uppercase tracking-widest focus:outline-none focus:border-[#38bdf8] appearance-none cursor-pointer"
        >
          {SWARM_ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </div>

      {/* Engine Select */}
      <div className="w-[100px] shrink-0">
        <select
          value={agent.cliProvider}
          onChange={(e) => onUpdate(agent.id, { cliProvider: e.target.value as SwarmCliProvider })}
          className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-[10px] font-mono text-white/80 uppercase tracking-widest focus:outline-none focus:border-[#38bdf8] appearance-none cursor-pointer"
        >
          {FUNCTIONAL_PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>

      {/* Auto Approve Toggle */}
      <button
        onClick={() => onUpdate(agent.id, { autoApprove: !agent.autoApprove })}
        className={`w-14 shrink-0 flex items-center justify-center border rounded py-1 transition-colors ${
          agent.autoApprove ? 'bg-[#38bdf8]/10 border-[#38bdf8]/50 text-[#38bdf8]' : 'bg-transparent border-white/10 text-white/20 hover:text-white/50'
        }`}
        title="Bypass Authorization"
      >
        <span className="text-[9px] font-bold font-mono tracking-widest">AUTO</span>
      </button>

      {/* Kill Switch */}
      <button
        onClick={() => onRemove(agent.id)}
        className="w-8 shrink-0 flex items-center justify-center text-white/10 hover:text-red-400 transition-colors py-1"
        title="Terminate Process"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

// ─── Step Content Components ─────────────────────────────────

function StepRoster({
  selectedProvider,
  setSelectedProvider,
}: {
  selectedProvider: SwarmCliProvider
  setSelectedProvider: (p: SwarmCliProvider) => void
}) {
  const roster = useSwarmStore((s) => s.wizard.roster)
  const setRosterFromPreset = useSwarmStore((s) => s.setRosterFromPreset)
  const addRosterAgent = useSwarmStore((s) => s.addRosterAgent)
  const removeRosterAgent = useSwarmStore((s) => s.removeRosterAgent)
  const updateRosterAgent = useSwarmStore((s) => s.updateRosterAgent)

  const [activePreset, setActivePreset] = useState<string | null>(null)

  const currentComposition = useMemo(() => {
    const comp: Record<string, number> = { coordinator: 0, builder: 0, scout: 0, reviewer: 0, custom: 0 }
    roster.forEach(a => { comp[a.role] = (comp[a.role] || 0) + 1 })
    return comp as Record<SwarmAgentRole, number>
  }, [roster])

  // When global engine changes, update all existing roster agents
  const handleProviderChange = useCallback((provider: SwarmCliProvider) => {
    setSelectedProvider(provider)
    for (const agent of roster) {
      updateRosterAgent(agent.id, { cliProvider: provider })
    }
  }, [roster, setSelectedProvider, updateRosterAgent])

  const handlePreset = useCallback((presetId: string) => {
    const preset = ROSTER_PRESETS.find((p) => p.id === presetId)
    if (preset) {
      setActivePreset(presetId)
      setRosterFromPreset(preset.composition, selectedProvider)
      // Prevent auto-scroll jump when roster rows appear
      requestAnimationFrame(() => {
        const el = document.getElementById('wizard-step-content')
        if (el) el.scrollTop = 0
      })
    }
  }, [selectedProvider, setRosterFromPreset])

  return (
    <div className="flex flex-col gap-5">

      {/* Top Split: Controls & Topology Preview */}
      <div className="flex gap-5 shrink-0 h-[250px]">
        {/* Left: Global Controls */}
        <div className="flex-1 flex flex-col gap-5">
           {/* Global Engine Selector */}
           <div className="flex flex-col gap-2.5">
             <span className="text-[10px] text-white/50 font-mono uppercase tracking-widest">Intelligence Engine</span>
             <div className="flex gap-2">
               {FUNCTIONAL_PROVIDERS.slice(0, 3).map(p => {
                 const isSelected = selectedProvider === p.id
                 return (
                   <button
                     key={p.id}
                     onClick={() => handleProviderChange(p.id)}
                     className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg transition-all ${
                       isSelected
                         ? 'bg-white/[0.06] border-2 border-[#38bdf8]/40'
                         : 'bg-black/30 border border-white/[0.06] hover:border-white/15'
                     }`}
                   >
                     <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color, opacity: isSelected ? 1 : 0.3 }} />
                     <span className={`text-[10px] font-bold font-mono tracking-widest uppercase ${isSelected ? 'text-white' : 'text-white/35'}`}>
                       {p.label}
                     </span>
                   </button>
                 )
               })}
             </div>
           </div>

           {/* Topology Presets */}
           <div className="flex flex-col gap-2.5">
             <span className="text-[10px] text-white/50 font-mono uppercase tracking-widest">Architecture Presets</span>
             <div className="grid grid-cols-4 gap-2">
               {ROSTER_PRESETS.slice(0, 4).map(p => {
                 const isActive = activePreset === p.id
                 // Build composition dots
                 const dots: { color: string; count: number }[] = []
                 for (const role of SWARM_ROLES) {
                   const c = (p.composition as Record<string, number>)[role.id] || 0
                   if (c > 0) dots.push({ color: role.color, count: c })
                 }
                 return (
                   <button
                     key={p.id}
                     onClick={() => handlePreset(p.id)}
                     className={`flex flex-col items-center gap-1.5 py-2.5 px-2 rounded-lg transition-all ${
                       isActive
                         ? 'bg-[#38bdf8]/10 border border-[#38bdf8]/30'
                         : 'bg-black/30 border border-white/[0.06] hover:border-white/15'
                     }`}
                   >
                     <span className={`text-[11px] font-black font-mono tracking-widest ${isActive ? 'text-[#38bdf8]' : 'text-white/40'}`}>
                       {p.label}
                     </span>
                     {/* Composition dots */}
                     <div className="flex items-center gap-0.5">
                       {dots.map((d, di) =>
                         Array.from({ length: d.count }).map((_, ci) => (
                           <div key={`${di}-${ci}`} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: d.color, opacity: isActive ? 0.9 : 0.35 }} />
                         ))
                       )}
                     </div>
                     <span className={`text-[9px] font-mono ${isActive ? 'text-white/50' : 'text-white/20'}`}>{p.total} agents</span>
                   </button>
                 )
               })}
             </div>
           </div>
        </div>

        {/* Right: Live Topology Preview */}
        <div className="w-[380px] shrink-0 flex flex-col">
           <span className="text-[10px] text-white/25 font-mono uppercase tracking-widest mb-2 pl-1">Live Topology</span>
           <TopologyTreePreview composition={currentComposition} total={roster.length} />
        </div>
      </div>

      {/* Role Breakdown Panel (shows when a preset is selected) */}
      {activePreset && PRESET_ROLE_BREAKDOWN[activePreset] && (
        <div className="flex flex-col gap-2 border border-white/[0.06] bg-white/[0.015] rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <Network className="w-3.5 h-3.5 text-[#38bdf8]/60" />
            <span className="text-[10px] text-white/50 font-mono uppercase tracking-widest">Delegation Structure</span>
          </div>
          <p className="text-[11px] text-white/40 font-mono leading-relaxed mb-2">
            {PRESET_ROLE_BREAKDOWN[activePreset].summary}
          </p>
          <div className="flex flex-col gap-1.5">
            {PRESET_ROLE_BREAKDOWN[activePreset].roles.map((info) => {
              const roleDef = getRoleDef(info.role)
              return (
                <div key={info.role} className="flex items-start gap-2.5 px-3 py-2 rounded bg-black/30 border border-white/[0.04]">
                  <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: roleDef.color }} />
                    <span className="text-[10px] font-bold text-white/60 font-mono uppercase tracking-widest w-[90px]">
                      {info.count > 1 ? `${info.count}x ` : ''}{roleDef.label}
                    </span>
                  </div>
                  <span className="text-[10px] text-white/35 font-mono leading-relaxed">{info.duty}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Bottom: Roster Data Table */}
      <div className="flex flex-col border border-white/10 bg-black/40 rounded-lg overflow-hidden">
         {/* Table Header */}
         <div className="flex items-center gap-3 px-3 py-2 bg-white/[0.02] border-b border-white/[0.06] shrink-0">
            <div className="w-6" />
            <div className="flex-1 text-[9px] text-white/40 font-mono uppercase tracking-widest">Designation</div>
            <div className="w-[120px] text-[9px] text-white/40 font-mono uppercase tracking-widest">Role</div>
            <div className="w-[100px] text-[9px] text-white/40 font-mono uppercase tracking-widest">Engine</div>
            <div className="w-14 text-[9px] text-white/40 font-mono uppercase tracking-widest text-center">Auto</div>
            <div className="w-8" />
         </div>

         {/* Table Body */}
         <div className="max-h-[280px] overflow-y-auto custom-scrollbar">
           {roster.length === 0 ? (
             <div className="w-full h-full flex flex-col items-center justify-center gap-3 py-8">
               <div className="flex gap-1.5">
                 {SWARM_ROLES.slice(0, 4).map(r => (
                   <div key={r.id} className="w-5 h-5 rounded border border-white/[0.06] flex items-center justify-center opacity-20">
                     <RoleIcon iconName={r.icon} className="w-2.5 h-2.5" color={r.color} />
                   </div>
                 ))}
               </div>
               <span className="text-[10px] text-white/15 font-mono uppercase tracking-widest">
                 Select a preset above to populate
               </span>
             </div>
           ) : (
             roster.map((agent, i) => (
               <RosterTableRow
                 key={agent.id}
                 agent={agent}
                 index={i}
                 onUpdate={updateRosterAgent}
                 onRemove={removeRosterAgent}
               />
             ))
           )}
         </div>

         {/* Table Footer Actions */}
         <div className="p-2 border-t border-white/[0.04] bg-black/30 shrink-0">
           <button
             onClick={() => addRosterAgent('builder', selectedProvider)}
             className="w-full py-2.5 rounded-md border border-dashed border-white/[0.08] text-[10px] font-bold font-mono text-white/30 uppercase tracking-widest hover:border-[#38bdf8]/40 hover:text-[#38bdf8] hover:bg-[#38bdf8]/5 transition-all flex items-center justify-center gap-2 group"
           >
             <span className="text-[14px] leading-none group-hover:scale-110 transition-transform">+</span>
             Add Agent
           </button>
         </div>
      </div>
    </div>
  )
}

function StepMission() {
  const mission = useSwarmStore((s) => s.wizard.mission)
  const setMission = useSwarmStore((s) => s.setMission)

  return (
    <div className="flex flex-col min-h-full max-w-4xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-8 border-b border-white/5 pb-4">
        <MessageSquare className="w-5 h-5 text-[#38bdf8]" />
        <h3 className="text-[18px] font-bold text-white tracking-widest uppercase font-mono">MISSION DIRECTIVE</h3>
      </div>
      
      <div className="flex-1 relative flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] text-white/40 font-mono uppercase tracking-widest">Input Parameters</span>
          <span className="text-[10px] text-[#38bdf8]/50 font-mono">[{mission.length} BYTES]</span>
        </div>
        <textarea
          value={mission}
          onChange={(e) => setMission(e.target.value)}
          placeholder="> Provide explicit operational instructions for the swarm instance...&#10;> Define scope, target files, and expected behavior constraints."
          autoFocus
          className="flex-1 w-full p-6 bg-black/40 border border-white/10 rounded-lg text-[14px] text-white/90 font-mono placeholder:text-white/20 focus:outline-none focus:border-[#38bdf8]/50 transition-colors resize-none leading-relaxed"
        />
      </div>
    </div>
  )
}

function StepDirectory() {
  const directory = useSwarmStore((s) => s.wizard.directory)
  const setDirectory = useSwarmStore((s) => s.setDirectory)

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

  return (
    <div className="flex flex-col min-h-full max-w-4xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-8 border-b border-white/5 pb-4">
        <FolderOpen className="w-5 h-5 text-[#38bdf8]" />
        <h3 className="text-[18px] font-bold text-white tracking-widest uppercase font-mono">WORKSPACE ROOT</h3>
      </div>
      
      <div className="w-full flex flex-col gap-3 mt-10">
        <span className="text-[10px] text-white/40 font-mono uppercase tracking-widest">Target Path</span>
        <div className="flex border border-white/10 rounded-lg overflow-hidden bg-black/40 focus-within:border-[#38bdf8]/50 transition-colors h-14">
          <input
            type="text"
            value={directory}
            onChange={(e) => setDirectory(e.target.value)}
            placeholder="/path/to/project"
            autoFocus
            className="flex-1 min-w-0 px-5 bg-transparent text-[13px] text-white font-mono placeholder:text-white/20 focus:outline-none"
          />
          <button
            onClick={handleBrowse}
            className="shrink-0 px-6 flex items-center justify-center text-[11px] font-bold font-mono tracking-widest uppercase text-white/60 bg-white/[0.02] border-l border-white/10 hover:text-[#38bdf8] hover:bg-white/[0.05] transition-colors"
          >
            BROWSE
          </button>
        </div>
      </div>
    </div>
  )
}

function StepContext() {
  const contextFiles = useSwarmStore((s) => s.wizard.contextFiles)
  const enabledSkills = useSwarmStore((s) => s.wizard.enabledSkills)
  const addContextFile = useSwarmStore((s) => s.addContextFile)
  const removeContextFile = useSwarmStore((s) => s.removeContextFile)
  const toggleSkill = useSwarmStore((s) => s.toggleSkill)

  const skillsByCategory = useMemo(() => getSkillsByCategory(), [])
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    workflow: true, quality: true, ops: true, analysis: true,
  })

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const files = e.dataTransfer.files
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      addContextFile({
        id: `ctx-${Date.now()}-${i}`,
        name: file.name,
        path: (file as unknown as { path?: string }).path || file.name,
        size: file.size,
      })
    }
  }, [addContextFile])

  const handleDragOver = useCallback((e: React.DragEvent) => e.preventDefault(), [])
  const toggleCategory = useCallback((catId: string) => setExpandedCategories(p => ({ ...p, [catId]: !p[catId] })), [])

  return (
    <div className="flex flex-col max-w-5xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-8 border-b border-white/5 pb-4 shrink-0">
        <HardDrive className="w-5 h-5 text-[#38bdf8]" />
        <h3 className="text-[18px] font-bold text-white tracking-widest uppercase font-mono">CONTEXT & SKILLS</h3>
      </div>

      <div className="flex gap-10">
        {/* Left: Memory Banks */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          <span className="text-[10px] text-white/40 font-mono uppercase tracking-widest">Memory Banks ({contextFiles.length})</span>

          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="w-full py-10 border border-dashed border-white/20 rounded-lg flex flex-col items-center justify-center gap-3 bg-white/[0.01] hover:bg-white/[0.03] transition-colors cursor-pointer shrink-0"
          >
            <Upload className="w-6 h-6 text-white/30" />
            <span className="text-[11px] text-white/40 font-mono uppercase tracking-widest text-center">
              Drop files to mount
            </span>
          </div>

          <div className="max-h-[200px] overflow-y-auto border border-white/10 rounded-lg bg-black/40 p-2 custom-scrollbar mt-2">
             {contextFiles.length === 0 ? (
               <div className="w-full h-full flex items-center justify-center text-[11px] text-white/20 font-mono uppercase tracking-widest">No files mounted</div>
             ) : (
               <div className="flex flex-col gap-1.5">
                 {contextFiles.map((file) => (
                   <div key={file.id} className="flex items-center justify-between px-4 py-2.5 rounded bg-white/[0.02] border border-white/5 group hover:border-white/10 transition-colors">
                     <span className="text-[11px] text-white/70 font-mono truncate mr-3">{file.name}</span>
                     <div className="flex items-center gap-4 shrink-0">
                       <span className="text-[10px] text-white/30 font-mono">{file.size < 1024 ? `${file.size}B` : `${(file.size / 1024).toFixed(1)}KB`}</span>
                       <button onClick={() => removeContextFile(file.id)} className="text-white/20 hover:text-red-400"><X className="w-4 h-4" /></button>
                     </div>
                   </div>
                 ))}
               </div>
             )}
          </div>
        </div>

        {/* Right: Operational Modules */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          <span className="text-[10px] text-white/40 font-mono uppercase tracking-widest">Operational Modules</span>
          <div className="max-h-[360px] overflow-y-auto border border-white/10 rounded-lg bg-black/40 custom-scrollbar p-2">
            {SKILL_CATEGORIES.map((cat) => {
              const skills = skillsByCategory[cat.id] || []
              if (skills.length === 0) return null
              const isExpanded = expandedCategories[cat.id]

              return (
                <div key={cat.id} className="mb-2 last:mb-0">
                  <button
                    onClick={() => toggleCategory(cat.id)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-white/[0.02] rounded border border-white/5 hover:border-white/10 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: cat.color }} />
                      <span className="text-[11px] font-bold text-white/70 uppercase tracking-widest font-mono">{cat.label}</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-white/30 transition-transform ${isExpanded ? 'rotate-180 text-[#38bdf8]' : ''}`} />
                  </button>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="flex flex-col gap-1 mt-1 pl-3 border-l border-white/10 ml-4 mb-2">
                          {skills.map((skill) => {
                            const isEnabled = enabledSkills.includes(skill.id)
                            return (
                              <div key={skill.id} className="flex items-center justify-between px-3 py-2 hover:bg-white/[0.02] rounded">
                                <span className={`text-[11px] font-mono tracking-widest ${isEnabled ? 'text-[#38bdf8]' : 'text-white/40'}`}>{skill.name}</span>
                                <button
                                  onClick={() => toggleSkill(skill.id)}
                                  className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors focus:outline-none ${isEnabled ? 'bg-[#38bdf8]' : 'bg-white/10'}`}
                                >
                                  <span className={`inline-block h-3 w-3 transform rounded-full bg-black transition ${isEnabled ? 'translate-x-[12px]' : 'translate-x-0'}`} />
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function StepName() {
  const swarmName = useSwarmStore((s) => s.wizard.swarmName)
  const setSwarmName = useSwarmStore((s) => s.setSwarmName)

  return (
    <div className="flex flex-col min-h-full justify-center pb-20 max-w-4xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-8 justify-center border-b border-white/5 pb-4">
        <Type className="w-5 h-5 text-[#38bdf8]" />
        <h3 className="text-[18px] font-bold text-white tracking-widest uppercase font-mono">ASSIGN DESIGNATION</h3>
      </div>
      
      <div className="w-full max-w-xl mx-auto flex flex-col gap-3 mt-10">
        <span className="text-[10px] text-white/40 font-mono uppercase tracking-widest text-center">Swarm ID</span>
        <input
          type="text"
          value={swarmName}
          onChange={(e) => setSwarmName(e.target.value)}
          placeholder="> OMEGA_REFACTOR_01"
          maxLength={60}
          autoFocus
          className="w-full h-16 px-6 text-center rounded-lg bg-black/40 border border-white/10 text-[18px] text-[#38bdf8] font-mono placeholder:text-white/10 focus:outline-none focus:border-[#38bdf8]/50 transition-colors"
        />
      </div>
    </div>
  )
}

// ─── Main SwarmWizard Component (Split-Pane Architecture) ─────

interface SwarmWizardProps {
  onClose: () => void
  onLaunch: (swarmId: string) => void
}

export function SwarmWizard({ onClose, onLaunch }: SwarmWizardProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [selectedProvider, setSelectedProvider] = useState<SwarmCliProvider>('claude')

  const currentStep = useSwarmStore((s) => s.wizard.currentStep)
  const roster = useSwarmStore((s) => s.wizard.roster)
  const setWizardStep = useSwarmStore((s) => s.setWizardStep)
  const nextStep = useSwarmStore((s) => s.nextStep)
  const prevStep = useSwarmStore((s) => s.prevStep)
  const launchSwarm = useSwarmStore((s) => s.launchSwarm)

  const currentIdx = SWARM_WIZARD_STEPS.indexOf(currentStep)
  const isLastStep = currentIdx === SWARM_WIZARD_STEPS.length - 1

  const canGoNext = useSwarmStore((s) => {
    const w = s.wizard
    switch (w.currentStep) {
      case 'roster': return w.roster.length > 0
      case 'mission': return w.mission.trim().length > 0
      case 'directory': return w.directory.trim().length > 0
      case 'context': return true
      case 'name': return w.swarmName.trim().length > 0
      default: return false
    }
  })

  const [direction, setDirection] = useState(0)

  const handleNext = useCallback(() => {
    if (!canGoNext) return
    if (isLastStep) {
      const swarm = launchSwarm()
      onLaunch(swarm.id)
    } else {
      setDirection(1)
      nextStep()
    }
  }, [canGoNext, isLastStep, launchSwarm, onLaunch, nextStep])

  // Stable refs so the keyboard handler never re-registers
  const canGoNextRef = useRef(canGoNext)
  const handleNextRef = useRef(handleNext)
  const onCloseRef = useRef(onClose)
  canGoNextRef.current = canGoNext
  handleNextRef.current = handleNext
  onCloseRef.current = onClose

  // Register keyboard handler once (stable — never steals focus)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
      if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
        e.preventDefault()
        if (canGoNextRef.current) handleNextRef.current()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Focus panel on mount only
  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  // Slide Animation (Only for main content area)
  const slideVariants = {
    enter: (dir: number) => ({ y: dir > 0 ? 30 : -30, opacity: 0 }),
    center: { y: 0, opacity: 1 },
    exit: (dir: number) => ({ y: dir > 0 ? -30 : 30, opacity: 0 }),
  }

  // Calculate telemetry
  const totalRam = useMemo(() => ((roster.length * RAM_PER_AGENT_MB) / 1024).toFixed(1), [roster])
  const providerLabel = useMemo(() => SWARM_CLI_PROVIDERS.find(p => p.id === selectedProvider)?.label || 'Unknown', [selectedProvider])

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Centered Modal Container */}
      <HardwareFrame hover={false} depth={0} className="w-[1100px] h-[750px] flex rounded-xl overflow-hidden border border-white/10 bg-[#0a0f16]/95 backdrop-blur-3xl shadow-[0_40px_100px_-20px_rgba(0,0,0,1)]">
        
        {/* --- LEFT SIDEBAR (25% - Navigation & Telemetry) --- */}
        <div className="w-[280px] shrink-0 bg-black/40 border-r border-white/5 flex flex-col">
            {/* Brand Header */}
            <div className="p-6 pb-4 flex items-center gap-3 shrink-0 border-b border-white/5">
               <div className="w-8 h-8 rounded bg-[#38bdf8] flex items-center justify-center text-black">
                 <Activity className="w-5 h-5" />
               </div>
               <div className="flex flex-col">
                 <span className="text-[12px] font-black text-white uppercase tracking-widest font-mono">GHOSTSHELL</span>
                 <span className="text-[8px] text-[#38bdf8] font-bold uppercase tracking-[0.3em] font-mono">ORCHESTRATOR</span>
               </div>
            </div>

            {/* Stepper Vertical Navigation */}
            <div className="flex-1 flex flex-col gap-1.5 p-5 overflow-y-auto">
               <span className="text-[9px] text-white/30 font-mono uppercase tracking-[0.25em] mb-3 px-2">Deployment Sequence</span>
               {SWARM_WIZARD_STEP_DEFS.map((step, idx) => {
                 const isActive = step.id === currentStep
                 const isCompleted = idx < currentIdx
                 const Icon = STEP_ICONS[step.icon]
                 
                 return (
                   <button
                     key={step.id}
                     onClick={() => {
                       if (idx <= currentIdx) {
                         setDirection(idx > currentIdx ? 1 : -1)
                         setWizardStep(step.id)
                       }
                     }}
                     disabled={idx > currentIdx}
                     className={`flex items-center gap-3 px-3 py-3 rounded-lg text-[10px] font-bold font-mono tracking-widest uppercase transition-all text-left ${
                       isActive
                         ? 'bg-[#38bdf8]/10 text-[#38bdf8] border border-[#38bdf8]/30'
                         : isCompleted
                           ? 'text-white/60 hover:bg-white/5 hover:text-white border border-transparent cursor-pointer'
                           : 'text-white/20 border border-transparent opacity-50 cursor-not-allowed'
                     }`}
                   >
                     <div className="w-4 flex justify-center">
                       {isCompleted && !isActive ? <Check className="w-3.5 h-3.5 text-[#38bdf8]" /> : Icon && <Icon className="w-3.5 h-3.5" />}
                     </div>
                     {step.label}
                   </button>
                 )
               })}
            </div>

            {/* Live Telemetry Panel */}
            <div className="p-6 border-t border-white/5 bg-black/60 shrink-0">
               <span className="text-[9px] text-white/30 font-mono uppercase tracking-[0.25em] mb-4 block">Live Telemetry</span>
               <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="text-white/50 uppercase tracking-widest">Processes</span>
                    <span className="text-white font-bold">{roster.length} Active</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="text-white/50 uppercase tracking-widest">Base Engine</span>
                    <span className="text-[#38bdf8] font-bold">{providerLabel}</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="text-white/50 uppercase tracking-widest">Est. VRAM</span>
                    <span className="text-[#f59e0b] font-bold">~{totalRam} GB</span>
                  </div>
               </div>
            </div>
          </div>

          {/* --- RIGHT PANEL (75% - Active Workspace) --- */}
          <div className="flex-1 flex flex-col relative outline-none bg-transparent" tabIndex={-1} ref={panelRef}>
            {/* Header Actions (Close) */}
            <div className="absolute top-6 right-6 z-50">
              <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-white/30 hover:text-white hover:bg-white/10 rounded transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Active Step Content */}
            <div className="flex-1 min-h-0 overflow-y-auto p-12 custom-scrollbar" id="wizard-step-content">
              <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                  key={currentStep}
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="min-h-full"
                >
                  {currentStep === 'roster' && <StepRoster selectedProvider={selectedProvider} setSelectedProvider={setSelectedProvider} />}
                  {currentStep === 'mission' && <StepMission />}
                  {currentStep === 'directory' && <StepDirectory />}
                  {currentStep === 'context' && <StepContext />}
                  {currentStep === 'name' && <StepName />}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Bottom Action Bar */}
            <div className="px-12 py-6 border-t border-white/5 bg-black/20 flex items-center justify-between shrink-0">
               <button
                 onClick={() => { if (currentIdx === 0) onClose(); else { setDirection(-1); prevStep() } }}
                 className="text-[10px] font-bold font-mono text-white/40 uppercase tracking-[0.2em] hover:text-white transition-colors flex items-center gap-2"
               >
                 {currentIdx === 0 ? '[ ABORT ]' : '< REGRESS'}
               </button>

               <button
                 onClick={handleNext}
                 disabled={!canGoNext}
                 className={`px-8 py-3.5 rounded text-[11px] font-black uppercase tracking-[0.2em] font-mono transition-all duration-300 disabled:opacity-20 flex items-center gap-3 ${
                   isLastStep
                     ? 'bg-[#38bdf8] text-black hover:bg-white'
                     : 'bg-white/10 text-white hover:bg-[#38bdf8] hover:text-black border border-white/10 hover:border-transparent'
                 }`}
               >
                 {isLastStep ? 'EXECUTE_DEPLOYMENT' : 'PROCEED'}
                 {isLastStep ? <Rocket className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
               </button>
            </div>
          </div>

        </HardwareFrame>
    </motion.div>,
    document.body
  )
}
