import { useMemo } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import {
  Eye,
  Wifi,
  WifiOff,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Terminal as TerminalIcon,
  Cpu,
  Fingerprint
} from 'lucide-react'
import type { SwarmAgentState, SwarmAgentStatus, SwarmRosterAgent } from '../../lib/swarm-types'
import { getRoleDef } from '../../lib/swarm-types'
import { RoleIcon } from './swarm-icons'

// ─── Status Config ───────────────────────────────────────────

interface StatusMeta {
  label: string
  color: string
  bgColor: string
  borderColor: string
  icon: React.FC<{ className?: string; style?: React.CSSProperties }>
  pulse?: boolean
}

const STATUS_MAP: Record<SwarmAgentStatus, StatusMeta> = {
  waiting: { label: 'Waiting', color: '#94a3b8', bgColor: 'rgba(148, 163, 184, 0.1)', borderColor: 'rgba(148, 163, 184, 0.2)', icon: Clock },
  idle: { label: 'Idle', color: '#64748b', bgColor: 'rgba(100, 116, 139, 0.1)', borderColor: 'rgba(100, 116, 139, 0.2)', icon: WifiOff },
  planning: { label: 'Planning', color: '#60a5fa', bgColor: 'rgba(96, 165, 250, 0.15)', borderColor: 'rgba(96, 165, 250, 0.3)', icon: Loader2, pulse: true },
  building: { label: 'Building', color: '#fbbf24', bgColor: 'rgba(251, 191, 36, 0.15)', borderColor: 'rgba(251, 191, 36, 0.3)', icon: Loader2, pulse: true },
  review: { label: 'Review', color: '#c084fc', bgColor: 'rgba(192, 132, 252, 0.15)', borderColor: 'rgba(192, 132, 252, 0.3)', icon: Eye },
  done: { label: 'Done', color: '#34d399', bgColor: 'rgba(52, 211, 153, 0.15)', borderColor: 'rgba(52, 211, 153, 0.3)', icon: CheckCircle2 },
  error: { label: 'Error', color: '#f87171', bgColor: 'rgba(248, 113, 113, 0.15)', borderColor: 'rgba(248, 113, 113, 0.3)', icon: AlertCircle },
}

// ─── Agent Card ──────────────────────────────────────────────

interface SwarmAgentCardProps {
  agent: SwarmAgentState
  rosterAgent: SwarmRosterAgent
  index: number
}

export function SwarmAgentCard({ agent, rosterAgent, index }: SwarmAgentCardProps) {
  const roleDef = useMemo(() => getRoleDef(rosterAgent.role), [rosterAgent.role])
  const statusMeta = STATUS_MAP[agent.status] || STATUS_MAP.idle
  const StatusIcon = statusMeta.icon

  const agentLabel = rosterAgent.customName || `${roleDef.label} ${index + 1}`

  // ─── Físicas 3D Parallax ───────────────────────────────────
  const x = useMotionValue(0)
  const y = useMotionValue(0)

  const mouseXSpring = useSpring(x, { stiffness: 150, damping: 15 })
  const mouseYSpring = useSpring(y, { stiffness: 150, damping: 15 })

  // Rango de rotación (5 grados max para que sea sutil en una tarjeta de lista)
  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["5deg", "-5deg"])
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-5deg", "5deg"])

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const width = rect.width
    const height = rect.height
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const xPct = mouseX / width - 0.5
    const yPct = mouseY / height - 0.5
    x.set(xPct)
    y.set(yPct)
  }

  const handleMouseLeave = () => {
    x.set(0)
    y.set(0)
  }

  const isWorking = agent.status === 'planning' || agent.status === 'building'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.4, type: "spring", bounce: 0.3 }}
      style={{ perspective: 1200 }}
      className="w-full mb-1"
    >
      <motion.div
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        className="relative flex flex-col w-full rounded-2xl group cursor-crosshair outline-none"
      >
        {/* Capa 1: Fondo Glass UI Sólido (-20px) */}
        <div
          className="absolute inset-0 rounded-2xl transition-all duration-500"
          style={{
            background: isWorking ? 'rgba(56, 189, 248, 0.04)' : 'rgba(255, 255, 255, 0.02)',
            border: `1px solid ${isWorking ? 'rgba(56, 189, 248, 0.3)' : 'rgba(255, 255, 255, 0.08)'}`,
            transform: "translateZ(-20px)",
            boxShadow: isWorking ? '0 10px 30px -10px rgba(56, 189, 248, 0.15)' : '0 10px 30px -10px rgba(0,0,0,0.5)'
          }}
        />

        {/* Capa 2: Borde interactivo interno al hacer hover (10px) */}
        <div
          className="absolute inset-2 rounded-xl border border-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
          style={{ transform: "translateZ(10px)" }}
        />

        {/* Capa 3: Contenido Principal Holográfico (30px) */}
        <div
          className="relative w-full p-4 flex flex-col gap-4 pointer-events-none"
          style={{ transform: "translateZ(30px)" }}
        >
          {/* Cabecera */}
          <div className="flex items-center gap-4">
            {/* Avatar 3D */}
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border transition-all duration-500"
              style={{
                backgroundColor: isWorking ? 'rgba(56, 189, 248, 0.15)' : `${roleDef.color}15`,
                borderColor: isWorking ? 'rgba(56, 189, 248, 0.5)' : `${roleDef.color}30`,
                boxShadow: isWorking ? '0 0 15px rgba(56, 189, 248, 0.2)' : 'none',
              }}
            >
              {isWorking ? (
                <Cpu className="w-6 h-6 text-[#38bdf8] animate-pulse" />
              ) : (
                <RoleIcon iconName={roleDef.icon} className="w-6 h-6" color={roleDef.color} />
              )}
            </div>

            {/* Identidad */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <h4 className="text-[15px] font-bold text-white truncate tracking-tight">
                  {agentLabel}
                </h4>
                <div
                  className="px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-widest"
                  style={{
                    backgroundColor: statusMeta.bgColor,
                    color: statusMeta.color,
                    borderColor: statusMeta.borderColor
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    {statusMeta.pulse && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
                    {statusMeta.label}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-white/40 font-mono tracking-wide">
                <Fingerprint className="w-3 h-3" />
                <span>{rosterAgent.role.toUpperCase()}</span>
                <span>•</span>
                <span>NODE_{index.toString().padStart(2, '0')}</span>
              </div>
            </div>

            {/* Icono de estado decorativo */}
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white/[0.02] border border-white/[0.05]">
              <StatusIcon
                className={`w-4 h-4 ${statusMeta.pulse ? 'animate-spin' : ''}`}
                style={{ color: statusMeta.color }}
              />
            </div>
          </div>

          {/* Área de Tarea (Fondo sólido interior) */}
          {agent.currentTask && (
            <div
              className="w-full rounded-lg p-3 border"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.2)',
                borderColor: isWorking ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.05)'
              }}
            >
              <div className="flex items-start gap-2">
                <TerminalIcon className="w-3.5 h-3.5 mt-0.5 text-white/30" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-white/80 leading-relaxed truncate">
                    {agent.currentTask}
                  </p>
                  {agent.progress && (
                    <p className="text-[11px] text-white/40 mt-1 font-mono">
                      {'>'} {agent.progress}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Footer de Estadísticas */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded flex items-center justify-center bg-white/[0.03] border border-white/[0.05]">
                  <span className="text-[10px] font-bold text-white/50">{agent.filesOwned.length}</span>
                </div>
                <span className="text-[10px] text-white/30 uppercase tracking-wider font-semibold">Files</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded flex items-center justify-center bg-white/[0.03] border border-white/[0.05]">
                  <span className="text-[10px] font-bold text-white/50">{agent.messagesCount}</span>
                </div>
                <span className="text-[10px] text-white/30 uppercase tracking-wider font-semibold">Msgs</span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-[10px] text-white/30 font-mono">
              {agent.agentId ? (
                <>
                  <Wifi className="w-3 h-3 text-emerald-400" />
                  <span className="text-emerald-400/80">LINKED</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3 text-white/20" />
                  <span>OFFLINE</span>
                </>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
