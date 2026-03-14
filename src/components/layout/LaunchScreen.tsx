import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Terminal, Network, ChevronRight, Cpu, Layers } from 'lucide-react'

type LaunchMode = 'terminal' | 'swarm'

interface LaunchScreenProps {
  onSelect: (mode: LaunchMode) => void
}

export function LaunchScreen({ onSelect }: LaunchScreenProps) {
  const [hovered, setHovered] = useState<LaunchMode | null>(null)
  const [selected, setSelected] = useState<LaunchMode | null>(null)

  const handleSelect = (mode: LaunchMode) => {
    setSelected(mode)
    setTimeout(() => onSelect(mode), 400)
  }

  return (
    <AnimatePresence>
      {!selected ? (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          style={{ background: 'var(--ghost-bg)' }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
        >
          {/* Titlebar drag region */}
          <div className="absolute top-0 left-0 right-0 h-8 titlebar-drag" />

          {/* Logo & Title */}
          <motion.div
            className="flex flex-col items-center mb-14"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center border border-white/10"
                style={{ background: 'rgba(56, 189, 248, 0.1)' }}
              >
                <Cpu size={20} className="text-sky-400" />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">
                GhostShell
              </h1>
            </div>
            <p className="text-sm text-white/30">
              Choose your workspace
            </p>
          </motion.div>

          {/* Cards */}
          <div className="flex gap-5 px-6">
            {/* GhostTerminal Card */}
            <motion.button
              className="group relative w-[340px] text-left rounded-2xl border border-white/[0.08] overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50"
              style={{ background: 'rgba(255, 255, 255, 0.02)' }}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15, ease: 'easeOut' }}
              onMouseEnter={() => setHovered('terminal')}
              onMouseLeave={() => setHovered(null)}
              onClick={() => handleSelect('terminal')}
            >
              {/* Hover overlay */}
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                style={{ background: 'rgba(255, 255, 255, 0.02)' }}
              />

              {/* Active indicator line */}
              <div
                className="absolute top-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{ background: '#38bdf8' }}
              />

              <div className="relative p-7">
                {/* Icon */}
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 border border-white/[0.08] transition-colors duration-200"
                  style={{
                    background: hovered === 'terminal'
                      ? 'rgba(56, 189, 248, 0.08)'
                      : 'rgba(255, 255, 255, 0.03)',
                  }}
                >
                  <Terminal
                    size={22}
                    className="transition-colors duration-200"
                    style={{
                      color: hovered === 'terminal' ? '#38bdf8' : 'rgba(255, 255, 255, 0.5)',
                    }}
                  />
                </div>

                {/* Title */}
                <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                  GhostTerminal
                  <ChevronRight
                    size={16}
                    className="opacity-0 group-hover:opacity-60 -translate-x-1 group-hover:translate-x-0 transition-all duration-200"
                  />
                </h2>

                {/* Description */}
                <p className="text-sm text-white/35 leading-relaxed mb-6">
                  AI-powered terminal with intelligent agents. Launch Claude, Gemini, or Codex agents with full terminal access.
                </p>

                {/* Feature tags */}
                <div className="flex flex-wrap gap-2">
                  {['Agents', 'Terminal', 'Multi-provider', 'Templates'].map((tag) => (
                    <span
                      key={tag}
                      className="text-[11px] font-medium tracking-wide uppercase px-2.5 py-1 rounded-md border border-white/[0.06] text-white/25"
                      style={{ background: 'rgba(255, 255, 255, 0.02)' }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </motion.button>

            {/* GhostSwarm Card */}
            <motion.button
              className="group relative w-[340px] text-left rounded-2xl border border-white/[0.08] overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50"
              style={{ background: 'rgba(255, 255, 255, 0.02)' }}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.25, ease: 'easeOut' }}
              onMouseEnter={() => setHovered('swarm')}
              onMouseLeave={() => setHovered(null)}
              onClick={() => handleSelect('swarm')}
            >
              {/* Hover overlay */}
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                style={{ background: 'rgba(255, 255, 255, 0.02)' }}
              />

              {/* Active indicator line */}
              <div
                className="absolute top-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{ background: '#38bdf8' }}
              />

              <div className="relative p-7">
                {/* Icon */}
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 border border-white/[0.08] transition-colors duration-200"
                  style={{
                    background: hovered === 'swarm'
                      ? 'rgba(56, 189, 248, 0.08)'
                      : 'rgba(255, 255, 255, 0.03)',
                  }}
                >
                  <Network
                    size={22}
                    className="transition-colors duration-200"
                    style={{
                      color: hovered === 'swarm' ? '#38bdf8' : 'rgba(255, 255, 255, 0.5)',
                    }}
                  />
                </div>

                {/* Title */}
                <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                  GhostSwarm
                  <ChevronRight
                    size={16}
                    className="opacity-0 group-hover:opacity-60 -translate-x-1 group-hover:translate-x-0 transition-all duration-200"
                  />
                </h2>

                {/* Description */}
                <p className="text-sm text-white/35 leading-relaxed mb-6">
                  Multi-agent orchestration swarm. Coordinate teams of AI agents working together on complex tasks.
                </p>

                {/* Feature tags */}
                <div className="flex flex-wrap gap-2">
                  {['Swarm', 'Orchestration', 'Multi-agent', 'Topology'].map((tag) => (
                    <span
                      key={tag}
                      className="text-[11px] font-medium tracking-wide uppercase px-2.5 py-1 rounded-md border border-white/[0.06] text-white/25"
                      style={{ background: 'rgba(255, 255, 255, 0.02)' }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </motion.button>
          </div>

          {/* Keyboard hint */}
          <motion.div
            className="mt-10 flex items-center gap-4 text-white/20 text-xs"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            <span className="flex items-center gap-1.5">
              <Layers size={12} className="text-white/15" />
              Select a mode to begin
            </span>
          </motion.div>

          {/* Version */}
          <motion.span
            className="absolute bottom-5 text-[11px] text-white/15 tracking-wide"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.6 }}
          >
            v1.7.0
          </motion.span>
        </motion.div>
      ) : (
        /* Fade-out state */
        <motion.div
          className="fixed inset-0 z-50"
          style={{ background: 'var(--ghost-bg)' }}
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
        />
      )}
    </AnimatePresence>
  )
}
