import { useEffect, useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from 'framer-motion'
import { Terminal as TerminalIcon, Network, ChevronRight, Cpu } from 'lucide-react'
import { type SessionType } from '../../lib/types'

interface SessionTypeSelectorProps {
  onSelect: (type: SessionType) => void
  onClose: () => void
}

// Tarjeta 3D interactiva construida con colores sólidos y Glass UI (sin brillos/degradados)
function SelectorCard({
  title,
  description,
  icon: Icon,
  shortcut,
  isActive,
  onClick,
  onHoverStart,
  onHoverEnd,
  delay
}: {
  title: string
  description: string
  icon: any
  shortcut: string
  isActive: boolean
  onClick: () => void
  onHoverStart: () => void
  onHoverEnd: () => void
  delay: number
}) {
  const x = useMotionValue(0)
  const y = useMotionValue(0)

  // Resortes para suavizar el seguimiento del ratón
  const mouseXSpring = useSpring(x, { stiffness: 150, damping: 15 })
  const mouseYSpring = useSpring(y, { stiffness: 150, damping: 15 })

  // Mapear la posición a rotación 3D (limitado a 15 grados)
  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["15deg", "-15deg"])
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-15deg", "15deg"])

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
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
    onHoverEnd()
  }

  return (
    <motion.div
      style={{ perspective: 1500 }}
      initial={{ opacity: 0, y: 100, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8, y: -50 }}
      transition={{ duration: 0.7, delay, type: "spring", bounce: 0.3 }}
    >
      <motion.button
        onClick={onClick}
        onMouseMove={handleMouseMove}
        onMouseEnter={onHoverStart}
        onMouseLeave={handleMouseLeave}
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        className="relative flex flex-col items-center w-[360px] h-[480px] rounded-3xl outline-none group text-left cursor-pointer"
      >
        {/* Capa de fondo - Cristal translúcido sólido (Profundidad: -20px) */}
        <div
          className="absolute inset-0 rounded-3xl transition-colors duration-500"
          style={{
            background: isActive ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.02)',
            border: isActive ? '2px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
            transform: "translateZ(-20px)",
            boxShadow: isActive ? '0 40px 80px -20px rgba(0,0,0,0.8)' : '0 20px 40px -20px rgba(0,0,0,0.5)'
          }}
        />

        {/* Borde de acento interno flotante (Profundidad: 30px) */}
        <div
          className="absolute inset-4 rounded-2xl border-2 pointer-events-none transition-all duration-500"
          style={{
            borderColor: isActive ? '#38bdf8' : 'transparent',
            transform: "translateZ(30px)",
            opacity: isActive ? 1 : 0
          }}
        />

        {/* Contenido interactivo (Profundidad máxima: 60px) */}
        <div
          className="relative w-full h-full p-10 flex flex-col items-center justify-between pointer-events-none"
          style={{ transform: "translateZ(60px)" }}
        >
          {/* Cabecera */}
          <div className="flex flex-col items-center mt-6">
            <div
              className="w-24 h-24 rounded-2xl flex items-center justify-center transition-all duration-500"
              style={{
                background: isActive ? '#38bdf8' : 'rgba(255, 255, 255, 0.05)',
                border: isActive ? 'none' : '1px solid rgba(255, 255, 255, 0.1)'
              }}
            >
              <Icon
                size={48}
                className="transition-colors duration-500"
                style={{ color: isActive ? '#000000' : 'rgba(255, 255, 255, 0.4)' }}
                strokeWidth={1.5}
              />
            </div>
            <h3
              className="text-3xl font-bold mt-8 tracking-tight transition-colors duration-500"
              style={{ color: isActive ? '#38bdf8' : '#ffffff' }}
            >
              {title}
            </h3>
          </div>

          {/* Descripción */}
          <p
            className="text-center text-[15px] leading-relaxed transition-colors duration-500"
            style={{ color: isActive ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.4)' }}
          >
            {description}
          </p>

          {/* Pie de acción */}
          <div className="flex w-full items-center justify-between px-2 mb-2">
            <div className="flex items-center gap-2">
              <span
                className="text-xs uppercase tracking-widest font-bold transition-colors duration-500"
                style={{ color: isActive ? '#38bdf8' : 'rgba(255, 255, 255, 0.2)' }}
              >
                Launch
              </span>
              <ChevronRight
                size={18}
                className="transition-all duration-500"
                style={{
                  color: isActive ? '#38bdf8' : 'transparent',
                  transform: isActive ? 'translateX(0)' : 'translateX(-15px)',
                  opacity: isActive ? 1 : 0
                }}
              />
            </div>
            <kbd
              className="px-3 py-1.5 rounded-lg font-mono text-sm border-2 transition-colors duration-500"
              style={{
                background: isActive ? 'rgba(56, 189, 248, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                borderColor: isActive ? '#38bdf8' : 'rgba(255, 255, 255, 0.1)',
                color: isActive ? '#38bdf8' : 'rgba(255, 255, 255, 0.4)'
              }}
            >
              {shortcut}
            </kbd>
          </div>
        </div>
      </motion.button>
    </motion.div>
  )
}

export function SessionTypeSelector({ onSelect, onClose }: SessionTypeSelectorProps) {
  const [hovered, setHovered] = useState<SessionType | null>(null)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === '1') onSelect('ghostcode')
      if (e.key === '2') onSelect('ghostswarm')
    },
    [onClose, onSelect],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden">
        {/* Fondo inmersivo teñido de azul, sin cajas oscuras en el centro */}
        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          style={{
            backgroundColor: 'rgba(56, 189, 248, 0.08)',
            backdropFilter: 'blur(35px)'
          }}
          onClick={onClose}
        />

        {/* Textos flotantes decorativos (Estilo Premium OS) */}
        <motion.div
          className="absolute top-16 left-0 w-full flex flex-col items-center pointer-events-none"
          initial={{ opacity: 0, y: -40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <div className="flex items-center gap-3 mb-2">
            <Cpu size={24} color="#38bdf8" />
            <span className="text-xl font-bold tracking-widest text-[#38bdf8] uppercase">
              GhostShell OS
            </span>
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight">
            Environment Initialization
          </h1>
        </motion.div>

        {/* Contenedor de las tarjetas 3D */}
        <div className="relative z-10 flex gap-16 items-center justify-center w-full px-8">
          <SelectorCard
            title="GhostCode"
            description="Entorno individual potenciado por IA. Ejecución de comandos en tiempo real y flujo de trabajo enfocado."
            icon={TerminalIcon}
            shortcut="1"
            isActive={hovered === 'ghostcode'}
            onClick={() => onSelect('ghostcode')}
            onHoverStart={() => setHovered('ghostcode')}
            onHoverEnd={() => setHovered(null)}
            delay={0.1}
          />

          {/* Divisor Visual */}
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{ delay: 0.3, type: 'spring', bounce: 0.5 }}
            className="flex flex-col items-center justify-center pointer-events-none"
          >
            <div className="h-28 w-px bg-white/20 mb-6" />
            <div className="w-14 h-14 rounded-full border-2 border-[#38bdf8]/30 flex items-center justify-center text-[#38bdf8] font-bold bg-[#38bdf8]/10 backdrop-blur-md shadow-lg">
              OR
            </div>
            <div className="h-28 w-px bg-white/20 mt-6" />
          </motion.div>

          <SelectorCard
            title="GhostSwarm"
            description="Orquestación multagente masiva. Coordina enjambres IA autónomos para arquitecturas y tareas complejas."
            icon={Network}
            shortcut="2"
            isActive={hovered === 'ghostswarm'}
            onClick={() => onSelect('ghostswarm')}
            onHoverStart={() => setHovered('ghostswarm')}
            onHoverEnd={() => setHovered(null)}
            delay={0.2}
          />
        </div>

        {/* Controles de pie de página */}
        <motion.div
          className="absolute bottom-12 left-0 w-full flex justify-center gap-16 text-[13px] text-white/40 font-medium pointer-events-none"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <div className="flex items-center gap-3">
            <kbd className="px-2.5 py-1 rounded bg-white/[0.03] border border-white/10 font-mono text-white/60">ESC</kbd>
            <span>Abort sequence</span>
          </div>
          <div className="flex items-center gap-3">
            <kbd className="px-2.5 py-1 rounded bg-white/[0.03] border border-white/10 font-mono text-white/60">SHIFT + CLICK</kbd>
            <span>Raw Terminal</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body,
  )
}
