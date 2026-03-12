import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Rocket, FolderSearch, Minus, Plus, ChevronRight, ChevronLeft } from 'lucide-react'
import { useSwarmStore } from '../../stores/swarmStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { SWARM_CLI_PROVIDERS, type SwarmAgentRole, type SwarmCliProvider } from '../../lib/swarm-types'

// Only the 3 functional providers (have coreProvider)
const FUNCTIONAL_PROVIDERS = SWARM_CLI_PROVIDERS.filter((p) => p.coreProvider)

// ─── Auto-roster from count ─────────────────────────────────

function buildRoles(count: number): SwarmAgentRole[] {
  if (count <= 0) return []
  if (count === 1) return ['builder']
  if (count === 2) return ['coordinator', 'builder']
  if (count === 3) return ['coordinator', 'builder', 'scout']
  if (count <= 5) {
    const roles: SwarmAgentRole[] = ['coordinator', 'scout', 'reviewer']
    for (let i = 0; i < count - 3; i++) roles.splice(1, 0, 'builder')
    return roles
  }
  const coordinators = count >= 15 ? 2 : 1
  const remaining = count - coordinators
  const scouts = Math.max(1, Math.round(remaining * 0.15))
  const reviewers = Math.max(1, Math.round(remaining * 0.12))
  const builders = remaining - scouts - reviewers
  const roles: SwarmAgentRole[] = []
  for (let i = 0; i < coordinators; i++) roles.push('coordinator')
  for (let i = 0; i < builders; i++) roles.push('builder')
  for (let i = 0; i < scouts; i++) roles.push('scout')
  for (let i = 0; i < reviewers; i++) roles.push('reviewer')
  return roles
}

// ─── Types ──────────────────────────────────────────────────

type WizardStep = 'setup' | 'agents'

// ─── SwarmWizard ─────────────────────────────────────────────

interface SwarmWizardProps {
  onClose: () => void
  onLaunch: (swarmId: string) => void
}

export function SwarmWizard({ onClose, onLaunch }: SwarmWizardProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState<WizardStep>('setup')

  // Step 1: setup
  const [mission, setMission] = useState('')
  const [directory, setDirectory] = useState(() => {
    try { return useWorkspaceStore.getState().currentPath || '' }
    catch { return '' }
  })
  const [agentCount, setAgentCount] = useState(5)
  const [name, setName] = useState('')

  // Step 2: per-provider counts (only functional providers)
  const [providerCounts, setProviderCounts] = useState<Record<string, number>>({
    claude: 5, codex: 0, gemini: 0,
  })

  // Store actions
  const setStoreMission = useSwarmStore((s) => s.setMission)
  const setStoreDirectory = useSwarmStore((s) => s.setDirectory)
  const setSwarmName = useSwarmStore((s) => s.setSwarmName)
  const clearRoster = useSwarmStore((s) => s.clearRoster)
  const addRosterAgent = useSwarmStore((s) => s.addRosterAgent)
  const launchSwarm = useSwarmStore((s) => s.launchSwarm)

  // Escape: step 2 → step 1, step 1 → close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (step === 'agents') setStep('setup')
        else onClose()
      }
    }
    document.addEventListener('keydown', handler)
    panelRef.current?.focus()
    return () => document.removeEventListener('keydown', handler)
  }, [onClose, step])

  // Sync provider counts when agent count changes
  useEffect(() => {
    setProviderCounts(prev => {
      const total = Object.values(prev).reduce((a, b) => a + b, 0)
      if (total === agentCount) return prev
      if (agentCount > total) {
        const main = Object.keys(prev).find(k => prev[k] > 0) || 'claude'
        return { ...prev, [main]: (prev[main] || 0) + (agentCount - total) }
      }
      let excess = total - agentCount
      const next = { ...prev }
      for (const key of ['gemini', 'codex', 'claude']) {
        const remove = Math.min(excess, next[key] || 0)
        next[key] = (next[key] || 0) - remove
        excess -= remove
        if (excess <= 0) break
      }
      return next
    })
  }, [agentCount])

  const handleBrowse = useCallback(async () => {
    try {
      const api = window.ghostshell
      if (api?.selectDirectory) {
        const selected = await api.selectDirectory()
        if (selected) setDirectory(selected)
      }
    } catch { /* cancelled */ }
  }, [])

  const providerTotal = Object.values(providerCounts).reduce((a, b) => a + b, 0)
  const remaining = agentCount - providerTotal
  const canProceed = mission.trim().length > 0 && directory.trim().length > 0
  const canLaunch = canProceed && providerTotal === agentCount

  const handleProviderAdd = useCallback((id: string) => {
    setProviderCounts(prev => {
      const total = Object.values(prev).reduce((a, b) => a + b, 0)
      if (total >= agentCount) return prev
      return { ...prev, [id]: (prev[id] || 0) + 1 }
    })
  }, [agentCount])

  const handleProviderRemove = useCallback((id: string) => {
    setProviderCounts(prev => {
      if ((prev[id] || 0) <= 0) return prev
      return { ...prev, [id]: prev[id] - 1 }
    })
  }, [])

  const handleLaunch = useCallback(() => {
    if (!canLaunch) return
    setStoreMission(mission)
    setStoreDirectory(directory)
    setSwarmName(name || `Swarm ${Date.now().toString(36).slice(-4)}`)

    const roles = buildRoles(agentCount)
    const providerQueue: SwarmCliProvider[] = []
    for (const p of FUNCTIONAL_PROVIDERS) {
      for (let i = 0; i < (providerCounts[p.id] || 0); i++) {
        providerQueue.push(p.id)
      }
    }

    clearRoster()
    for (let i = 0; i < roles.length; i++) {
      addRosterAgent(roles[i], providerQueue[i] || 'claude')
    }

    const swarm = launchSwarm()
    onLaunch(swarm.id)
  }, [canLaunch, mission, directory, name, agentCount, providerCounts, setStoreMission, setStoreDirectory, setSwarmName, clearRoster, addRosterAgent, launchSwarm, onLaunch])

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
    >
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-black/90"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />

      {/* Panel — ghost theme, always centered, fits window */}
      <motion.div
        ref={panelRef}
        tabIndex={-1}
        className="ghost-floating-panel relative flex w-[min(520px,95vw)] max-h-[90vh] flex-col rounded-2xl outline-none"
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.15 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            {step === 'agents' && (
              <button
                onClick={() => setStep('setup')}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/10 bg-black/25 hover:bg-white/10 text-ghost-text-dim hover:text-ghost-text transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <Rocket className="w-5 h-5 text-ghost-accent-2" />
            <h2 className="text-sm font-semibold text-ghost-text uppercase tracking-[0.12em]">
              {step === 'setup' ? 'New Swarm' : 'Configure Agents'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/10 bg-black/25 hover:bg-white/10 text-ghost-text-dim hover:text-ghost-text transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {step === 'setup' ? (
              <motion.div
                key="setup"
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.12 }}
                className="flex flex-col gap-5 px-5 py-5"
              >
                {/* Mission */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-ghost-text-dim uppercase tracking-wider">
                    Mission
                  </label>
                  <textarea
                    value={mission}
                    onChange={(e) => setMission(e.target.value)}
                    placeholder="What should this swarm build or fix?"
                    rows={4}
                    autoFocus
                    className="w-full px-4 py-3 rounded-xl bg-ghost-surface border border-ghost-border text-sm text-ghost-text placeholder:text-ghost-text-dim/40 focus:outline-none focus:border-ghost-accent-3 transition-colors resize-none leading-relaxed"
                  />
                </div>

                {/* Directory */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-ghost-text-dim uppercase tracking-wider">
                    Directory
                  </label>
                  <div className="flex rounded-xl bg-ghost-surface border border-ghost-border overflow-hidden focus-within:border-ghost-accent-3 transition-colors">
                    <input
                      type="text"
                      value={directory}
                      onChange={(e) => setDirectory(e.target.value)}
                      placeholder="/path/to/project"
                      className="flex-1 h-11 px-4 bg-transparent text-sm text-ghost-text font-mono placeholder:text-ghost-text-dim/40 focus:outline-none"
                    />
                    <button
                      onClick={handleBrowse}
                      className="h-11 px-4 flex items-center gap-2 text-xs font-semibold text-ghost-text-dim hover:text-ghost-text border-l border-ghost-border hover:bg-white/5 transition-colors"
                    >
                      <FolderSearch className="w-4 h-4" />
                      Browse
                    </button>
                  </div>
                </div>

                {/* Agent Count */}
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-ghost-text-dim uppercase tracking-wider">
                    Agents
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setAgentCount(c => Math.max(1, c - 1))}
                      disabled={agentCount <= 1}
                      className="w-8 h-8 rounded-lg bg-ghost-surface border border-ghost-border flex items-center justify-center text-ghost-text-dim hover:text-ghost-text hover:border-ghost-accent-3 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-lg font-bold text-ghost-text tabular-nums w-8 text-center">
                      {agentCount}
                    </span>
                    <button
                      onClick={() => setAgentCount(c => Math.min(50, c + 1))}
                      disabled={agentCount >= 50}
                      className="w-8 h-8 rounded-lg bg-ghost-surface border border-ghost-border flex items-center justify-center text-ghost-text-dim hover:text-ghost-text hover:border-ghost-accent-3 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Name */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-ghost-text-dim uppercase tracking-wider">
                    Name <span className="text-ghost-text-dim/40 font-normal normal-case tracking-normal">optional</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Auth Rewrite, Sprint 42..."
                    maxLength={60}
                    className="w-full h-11 px-4 rounded-xl bg-ghost-surface border border-ghost-border text-sm text-ghost-text placeholder:text-ghost-text-dim/40 focus:outline-none focus:border-ghost-accent-3 transition-colors"
                  />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="agents"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.12 }}
                className="flex flex-col gap-4 px-5 py-5"
              >
                <p className="text-xs text-ghost-text-dim">
                  Distribute <span className="font-semibold text-ghost-text">{agentCount}</span> agent{agentCount !== 1 ? 's' : ''} across providers.
                </p>

                {/* 3 provider rows — same style as step 1 inputs */}
                <div className="flex flex-col gap-2">
                  {FUNCTIONAL_PROVIDERS.map(provider => {
                    const count = providerCounts[provider.id] || 0
                    return (
                      <div
                        key={provider.id}
                        className="flex items-center gap-4 h-12 px-4 rounded-xl bg-ghost-surface border border-ghost-border"
                      >
                        {/* Provider identity */}
                        <div className="flex items-center flex-1 min-w-0">
                          <span className="text-sm font-medium text-ghost-text">{provider.label}</span>
                        </div>

                        {/* Counter */}
                        <div className="flex items-center gap-2.5">
                          <button
                            onClick={() => handleProviderRemove(provider.id)}
                            disabled={count <= 0}
                            className="w-7 h-7 rounded-md bg-ghost-bg border border-ghost-border flex items-center justify-center text-ghost-text-dim hover:text-ghost-text hover:border-ghost-accent-3 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-sm font-bold text-ghost-text tabular-nums w-6 text-center">
                            {count}
                          </span>
                          <button
                            onClick={() => handleProviderAdd(provider.id)}
                            disabled={remaining <= 0}
                            className="w-7 h-7 rounded-md bg-ghost-bg border border-ghost-border flex items-center justify-center text-ghost-text-dim hover:text-ghost-text hover:border-ghost-accent-3 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Status */}
                {remaining > 0 ? (
                  <p className="text-xs text-ghost-text-dim/60">
                    {remaining} agent{remaining !== 1 ? 's' : ''} remaining to assign
                  </p>
                ) : (
                  <p className="text-xs text-ghost-text-dim/60">
                    All {agentCount} agents assigned
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-white/10 shrink-0">
          {step === 'setup' ? (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-lg text-sm font-medium text-ghost-text-dim hover:text-ghost-text transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setStep('agents')}
                disabled={!canProceed}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-ghost-accent/15 border border-ghost-accent/25 text-sm font-semibold text-ghost-text hover:bg-ghost-accent/25 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Configure Agents
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setStep('setup')}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-ghost-text-dim hover:text-ghost-text transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
              <button
                onClick={handleLaunch}
                disabled={!canLaunch}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-ghost-accent/15 border border-ghost-accent/25 text-sm font-semibold text-ghost-text hover:bg-ghost-accent/25 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Rocket className="w-4 h-4" />
                Launch
              </button>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
