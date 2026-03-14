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

// ─── Live Topology Tree Preview ─────────────────────────────────

function TopologyTreePreview({ composition, total }: { composition: Record<SwarmAgentRole, number>, total: number }) {
  const nodes = useMemo(() => {
    const list: { id: string, role: SwarmAgentRole }[] = []
    for (let i = 0; i < (composition.coordinator || 0); i++) list.push({ id: `c-${i}`, role: 'coordinator' })
    for (let i = 0; i < (composition.builder || 0); i++) list.push({ id: `b-${i}`, role: 'builder' })
    for (let i = 0; i < (composition.scout || 0); i++) list.push({ id: `s-${i}`, role: 'scout' })
    for (let i = 0; i < (composition.reviewer || 0); i++) list.push({ id: `r-${i}`, role: 'reviewer' })
    return list
  }, [composition])

  const coordCount = composition.coordinator || 0
  const workers = nodes.filter(n => n.role !== 'coordinator')
  
  return (
    <div className="flex flex-col items-center justify-center p-4 bg-white/[0.02] border border-white/5 rounded-lg w-full h-full relative overflow-hidden">
       {total === 0 ? (
         <span className="text-[10px] text-white/20 font-mono uppercase tracking-widest">Awaiting architecture...</span>
       ) : (
         <div className="flex flex-col items-center relative w-full">
           
           {/* Top Layer: Coordinators */}
           {coordCount > 0 && (
             <div className="flex items-center gap-4 mb-6 relative z-10">
               {nodes.filter(n => n.role === 'coordinator').map(n => (
                 <div key={n.id} className="w-8 h-8 rounded border border-[#f59e0b] bg-black flex items-center justify-center relative">
                   <Terminal className="w-4 h-4 text-[#f59e0b]" />
                   <div className="absolute top-full left-1/2 w-px h-6 bg-white/20" />
                 </div>
               ))}
             </div>
           )}

           {/* Connection Hub (if coordinators exist) */}
           {coordCount > 0 && workers.length > 0 && (
             <div className="absolute top-8 left-4 right-4 h-px bg-white/20 z-0" />
           )}

           {/* Bottom Layer: Workers (grouped and truncated if too many) */}
           <div className="flex flex-wrap items-center justify-center gap-2 px-4 relative z-10 max-w-[90%]">
              {workers.slice(0, 16).map((n) => {
                const def = getRoleDef(n.role)
                return (
                  <div key={n.id} className="w-6 h-6 rounded border border-white/10 bg-black flex items-center justify-center relative">
                    {coordCount === 0 && <div className="absolute bottom-full left-1/2 w-px h-4 bg-white/10" />}
                    <RoleIcon iconName={def.icon} className="w-3 h-3" color={def.color} />
                  </div>
                )
              })}
              {workers.length > 16 && (
                <div className="w-6 h-6 rounded border border-white/10 bg-white/5 flex items-center justify-center">
                  <span className="text-[8px] font-mono text-white/40">+{workers.length - 16}</span>
                </div>
              )}
           </div>

         </div>
       )}
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
    <div className="group flex items-center gap-3 px-3 py-1.5 border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
      <div className="w-6 text-[10px] text-white/30 font-mono text-right shrink-0">{(index + 1).toString().padStart(2, '0')}</div>
      
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

  const handlePreset = useCallback((presetId: string) => {
    const preset = ROSTER_PRESETS.find((p) => p.id === presetId)
    if (preset) {
      setActivePreset(presetId)
      setRosterFromPreset(preset.composition, selectedProvider)
    }
  }, [selectedProvider, setRosterFromPreset])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      
      {/* Top Split: Controls & Topology Preview */}
      <div className="flex gap-6 shrink-0 mb-6 h-[220px]">
        {/* Left: Global Controls */}
        <div className="flex-1 flex flex-col gap-6">
           {/* Global Engine Segmented Control */}
           <div className="flex flex-col gap-2.5">
             <span className="text-[10px] text-white/50 font-mono uppercase tracking-widest">Base Intelligence Engine</span>
             <div className="flex p-1 bg-black/40 border border-white/10 rounded-lg">
               {FUNCTIONAL_PROVIDERS.slice(0, 4).map(p => (
                 <button
                   key={p.id}
                   onClick={() => setSelectedProvider(p.id)}
                   className={`flex-1 py-2 text-[10px] font-bold font-mono tracking-widest uppercase rounded transition-all ${
                     selectedProvider === p.id ? 'bg-white/[0.08] text-[#38bdf8] border border-white/10' : 'text-white/40 hover:text-white/80 border border-transparent'
                   }`}
                 >
                   {p.label}
                 </button>
               ))}
             </div>
           </div>

           {/* Topology Presets Segmented Control */}
           <div className="flex flex-col gap-2.5">
             <span className="text-[10px] text-white/50 font-mono uppercase tracking-widest">Architecture Presets</span>
             <div className="flex p-1 bg-black/40 border border-white/10 rounded-lg">
               {ROSTER_PRESETS.slice(0, 4).map(p => (
                 <button
                   key={p.id}
                   onClick={() => handlePreset(p.id)}
                   className={`flex-1 py-2 text-[10px] font-bold font-mono tracking-widest uppercase rounded transition-all flex items-center justify-center gap-2 ${
                     activePreset === p.id ? 'bg-white/[0.08] text-white border border-white/10' : 'text-white/30 hover:text-white/60 border border-transparent'
                   }`}
                 >
                   <span className="text-[#38bdf8]">{p.total}</span>
                   <span className="opacity-30">|</span>
                   <span>{p.label}</span>
                 </button>
               ))}
             </div>
           </div>
        </div>

        {/* Right: Live Topology Preview */}
        <div className="w-[400px] shrink-0 flex flex-col">
           <span className="text-[10px] text-white/30 font-mono uppercase tracking-widest mb-2.5 pl-1">Live Topology</span>
           <TopologyTreePreview composition={currentComposition} total={roster.length} />
        </div>
      </div>

      {/* Bottom: Roster Data Table */}
      <div className="flex-1 flex flex-col min-h-0 border border-white/10 bg-black/40 rounded-lg overflow-hidden">
         {/* Table Header */}
         <div className="flex items-center gap-3 px-3 py-2.5 bg-white/[0.02] border-b border-white/10 shrink-0">
            <div className="w-6 text-[9px] text-white/30 font-mono text-right">ID</div>
            <div className="flex-1 text-[9px] text-white/50 font-mono uppercase tracking-widest">Designation</div>
            <div className="w-[120px] text-[9px] text-white/50 font-mono uppercase tracking-widest">Role</div>
            <div className="w-[100px] text-[9px] text-white/50 font-mono uppercase tracking-widest">Engine</div>
            <div className="w-14 text-[9px] text-white/50 font-mono uppercase tracking-widest text-center">Exec</div>
            <div className="w-8"></div>
         </div>

         {/* Table Body */}
         <div className="flex-1 overflow-y-auto custom-scrollbar">
           {roster.length === 0 ? (
             <div className="w-full h-full flex items-center justify-center text-[11px] text-white/20 font-mono uppercase tracking-widest">
               No processes mounted. Select a preset or add manually.
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
         <div className="p-2 border-t border-white/5 bg-black/40 shrink-0">
           <button
             onClick={() => addRosterAgent('builder', selectedProvider)}
             className="w-full py-2 rounded border border-dashed border-white/10 text-[10px] font-bold font-mono text-white/40 uppercase tracking-widest hover:border-[#38bdf8]/50 hover:text-[#38bdf8] hover:bg-[#38bdf8]/5 transition-colors flex items-center justify-center gap-2"
           >
             <span className="text-sm leading-none">+</span> MOUNT NEW PROCESS
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
    <div className="flex flex-col h-full max-w-4xl mx-auto w-full">
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
    <div className="flex flex-col h-full max-w-4xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-8 border-b border-white/5 pb-4">
        <FolderOpen className="w-5 h-5 text-[#38bdf8]" />
        <h3 className="text-[18px] font-bold text-white tracking-widest uppercase font-mono">WORKSPACE ROOT</h3>
      </div>
      
      <div className="w-full max-w-2xl flex flex-col gap-3 mt-10">
        <span className="text-[10px] text-white/40 font-mono uppercase tracking-widest">Target Path</span>
        <div className="flex border border-white/10 rounded-lg overflow-hidden bg-black/40 focus-within:border-[#38bdf8]/50 transition-colors h-14">
          <input
            type="text"
            value={directory}
            onChange={(e) => setDirectory(e.target.value)}
            placeholder="/path/to/project"
            autoFocus
            className="flex-1 px-5 bg-transparent text-[13px] text-white font-mono placeholder:text-white/20 focus:outline-none"
          />
          <button
            onClick={handleBrowse}
            className="px-8 flex items-center justify-center text-[11px] font-bold font-mono tracking-widest uppercase text-white/60 bg-white/[0.02] border-l border-white/10 hover:text-[#38bdf8] hover:bg-white/[0.05] transition-colors"
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
    <div className="flex flex-col h-full max-w-5xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-8 border-b border-white/5 pb-4 shrink-0">
        <HardDrive className="w-5 h-5 text-[#38bdf8]" />
        <h3 className="text-[18px] font-bold text-white tracking-widest uppercase font-mono">CONTEXT & SKILLS</h3>
      </div>

      <div className="flex gap-10 flex-1 min-h-0">
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

          <div className="flex-1 overflow-y-auto border border-white/10 rounded-lg bg-black/40 p-2 custom-scrollbar mt-2">
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
          <div className="flex-1 overflow-y-auto border border-white/10 rounded-lg bg-black/40 custom-scrollbar p-2">
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
    <div className="flex flex-col h-full justify-center pb-20 max-w-4xl mx-auto w-full">
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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
        e.preventDefault()
        if (canGoNext) handleNext()
      }
    }
    document.addEventListener('keydown', handler)
    panelRef.current?.focus()
    return () => document.removeEventListener('keydown', handler)
  }, [onClose, canGoNext, handleNext])

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
            <div className="flex-1 overflow-y-auto p-12 custom-scrollbar">
              <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                  key={currentStep}
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="h-full"
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
