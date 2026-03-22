// SwarmAutonomyConfig — configurable per-action autonomy rules panel (B11)
// Used in both the SwarmWizard (context step) and the SwarmDashboard.
// Glass UI, no gradients, no glows.

import { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ShieldAlert,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Trash2,
  Settings,
  Package,
  Database,
  GitBranch,
  Code2,
} from 'lucide-react'
import type { AutonomyLevel, AutonomyRule } from '../../lib/swarm-types'
import {
  DEFAULT_AUTONOMY_RULES,
  AUTONOMY_LEVEL_META,
  getActiveRules,
} from '../../lib/swarm-autonomy'

// ─── Icon mapping ───────────────────────────────────────────

const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  Trash2,
  Settings,
  Package,
  Database,
  GitBranch,
  Code2,
}

function RuleIcon({ iconName, className }: { iconName: string; className?: string }) {
  const Icon = ICON_MAP[iconName]
  if (!Icon) return <ShieldAlert className={className} />
  return <Icon className={className} />
}

// ─── Autonomy Level Button ──────────────────────────────────

const LEVELS: AutonomyLevel[] = ['full_auto', 'review_required', 'approval_gates', 'supervised']

function LevelButton({
  level,
  isActive,
  onClick,
}: {
  level: AutonomyLevel
  isActive: boolean
  onClick: () => void
}) {
  const meta = AUTONOMY_LEVEL_META[level]
  return (
    <button
      onClick={onClick}
      className={`h-7 px-3 rounded-md text-[9px] font-bold font-mono uppercase tracking-[0.1em] border transition-colors ${
        isActive
          ? 'border-current bg-current/10'
          : 'bg-transparent border-white/5 text-white/30 hover:text-white/60 hover:border-white/10'
      }`}
      style={isActive ? { color: meta.color, borderColor: meta.color + '40' } : undefined}
      title={meta.description}
    >
      {meta.shortLabel}
    </button>
  )
}

// ─── Rule Row ───────────────────────────────────────────────

function RuleRow({
  rule,
  onChangeLevel,
}: {
  rule: AutonomyRule
  onChangeLevel: (ruleId: string, level: AutonomyLevel) => void
}) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 rounded-xl bg-white/[0.01] border border-white/5 hover:border-white/10 transition-colors group">
      {/* Icon */}
      <div className="w-8 h-8 rounded-lg bg-white/[0.02] border border-white/[0.05] flex items-center justify-center shrink-0 group-hover:border-white/10 transition-colors">
        <RuleIcon
          iconName={rule.icon}
          className="w-4 h-4 text-white/50 group-hover:text-white transition-colors"
        />
      </div>
      
      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-bold font-mono tracking-widest uppercase text-white/80 truncate">
          {rule.name}
        </div>
        <div className="text-[9px] text-white/40 truncate mt-0.5">
          {rule.description}
        </div>
      </div>

      {/* Level buttons */}
      <div className="flex items-center gap-1.5 shrink-0">
        {LEVELS.map((level) => (
          <LevelButton
            key={level}
            level={level}
            isActive={rule.level === level}
            onClick={() => onChangeLevel(rule.id, level)}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────

interface SwarmAutonomyConfigProps {
  /** Current overrides (rule ID -> level). Undefined means defaults. */
  overrides?: Record<string, AutonomyLevel>
  /** Callback when overrides change */
  onChange: (overrides: Record<string, AutonomyLevel>) => void
  /** If true, renders as a collapsible panel (dashboard mode) */
  collapsible?: boolean
  /** Default expanded state for collapsible mode */
  defaultOpen?: boolean
}

export function SwarmAutonomyConfig({
  overrides,
  onChange,
  collapsible = false,
  defaultOpen = false,
}: SwarmAutonomyConfigProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  const activeRules = useMemo(
    () => getActiveRules(overrides),
    [overrides],
  )

  const handleChangeLevel = useCallback(
    (ruleId: string, level: AutonomyLevel) => {
      const defaultRule = DEFAULT_AUTONOMY_RULES.find((r) => r.id === ruleId)
      const next = { ...(overrides || {}) }

      if (defaultRule && defaultRule.level === level) {
        // Revert to default — remove the override
        delete next[ruleId]
      } else {
        next[ruleId] = level
      }

      onChange(next)
    },
    [overrides, onChange],
  )

  const handleReset = useCallback(() => {
    onChange({})
  }, [onChange])

  const hasOverrides = overrides && Object.keys(overrides).length > 0

  // Non-default rule count for badge
  const overrideCount = overrides ? Object.keys(overrides).length : 0

  const content = (
    <div className="flex flex-col gap-3">
      {/* Legend row */}
      <div className="flex items-center gap-3 px-2 mb-2">
        <span className="text-[9px] text-white/30 font-bold font-mono uppercase tracking-widest flex-1">
          NIVEL DE AUTONOMIA POR ACCION
        </span>
        <div className="flex items-center gap-3">
          {LEVELS.map((level) => {
            const meta = AUTONOMY_LEVEL_META[level]
            return (
              <div key={level} className="flex items-center gap-1.5">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: meta.color }}
                />
                <span className="text-[9px] font-bold font-mono text-white/50 uppercase tracking-widest">
                  {meta.shortLabel}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Rule list */}
      <div className="flex flex-col gap-2">
        {activeRules.map((rule) => (
          <RuleRow
            key={rule.id}
            rule={rule}
            onChangeLevel={handleChangeLevel}
          />
        ))}
      </div>

      {/* Reset button */}
      {hasOverrides && (
        <button
          onClick={handleReset}
          className="mt-2 flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-mono font-bold uppercase tracking-widest text-white/40 hover:text-white border border-white/5 hover:border-white/20 bg-white/[0.01] hover:bg-white/[0.03] transition-colors self-start"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Restablecer Valores
        </button>
      )}
    </div>
  )

  if (!collapsible) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <ShieldAlert className="w-5 h-5 text-[#38bdf8]" />
          <span className="text-[13px] font-black uppercase tracking-[0.2em] text-[#38bdf8]">
            Autonomy Gates
          </span>
        </div>
        {content}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.01] overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
      >
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-white/40" />
        ) : (
          <ChevronRight className="w-4 h-4 text-white/40" />
        )}
        <ShieldAlert className="w-4 h-4 text-[#38bdf8]" />
        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white/80">
          Autonomy Gates
        </span>
        {overrideCount > 0 && (
          <span className="ml-auto text-[9px] font-bold font-mono px-2 py-1 rounded bg-[#38bdf8]/10 text-[#38bdf8] uppercase tracking-widest border border-[#38bdf8]/20">
            {overrideCount} Custom
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5">
              {content}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
