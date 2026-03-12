import { useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  GitCommit,
  Layers,
  Users,
  FlaskConical,
  GitPullRequest,
  FileText,
  Shield,
  Repeat,
  Accessibility,
  CircleCheck,
  Database,
  Gauge,
  Sparkles,
} from 'lucide-react'
import { useSwarmStore } from '../../stores/swarmStore'
import { SWARM_SKILLS, SKILL_CATEGORIES, type SwarmSkill } from '../../lib/swarm-skills'

// ─── Icon Resolver ───────────────────────────────────────────

const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  GitCommit,
  Layers,
  Users,
  FlaskConical,
  GitPullRequest,
  FileText,
  Shield,
  Repeat,
  Accessibility,
  CircleCheck,
  Database,
  Gauge,
  Sparkles,
}

function SkillIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name]
  if (!Icon) return null
  return <Icon className={className} />
}

// ─── Skill Row ───────────────────────────────────────────────

function SkillRow({ skill, enabled, onToggle }: { skill: SwarmSkill; enabled: boolean; onToggle: () => void }) {
  return (
    <div className="ghost-section-card rounded-xl flex items-center gap-3 px-4 py-3 group hover:bg-white/[0.02] transition-colors">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/[0.04] shrink-0">
        <SkillIcon name={skill.icon} className="w-4 h-4 text-ghost-text-dim" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ghost-text">{skill.name}</p>
        <p className="text-xs text-ghost-text-dim/60 truncate">{skill.description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={onToggle}
        className={`w-10 h-[22px] rounded-full transition-colors flex items-center px-0.5 shrink-0 ${
          enabled ? 'bg-ghost-accent' : 'bg-ghost-border'
        }`}
      >
        <div
          className={`w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-transform ${
            enabled ? 'translate-x-[18px]' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}

// ─── Category Section ────────────────────────────────────────

function CategorySection({
  label,
  color,
  skills,
  enabledSkills,
  onToggle,
}: {
  label: string
  color: string
  skills: SwarmSkill[]
  enabledSkills: string[]
  onToggle: (id: string) => void
}) {
  if (skills.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <h3
        className="text-xs font-bold uppercase tracking-[0.2em] px-1"
        style={{ color }}
      >
        {label}
      </h3>
      <div className="grid grid-cols-1 gap-2">
        {skills.map((skill) => (
          <SkillRow
            key={skill.id}
            skill={skill}
            enabled={enabledSkills.includes(skill.id)}
            onToggle={() => onToggle(skill.id)}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Main Panel ──────────────────────────────────────────────

export function SwarmSkillsPanel() {
  const enabledSkills = useSwarmStore((s) => s.wizard.enabledSkills)
  const toggleSkill = useSwarmStore((s) => s.toggleSkill)

  const grouped = useMemo(() => {
    const map: Record<string, SwarmSkill[]> = {}
    for (const cat of SKILL_CATEGORIES) {
      map[cat.id] = []
    }
    for (const skill of SWARM_SKILLS) {
      map[skill.category]?.push(skill)
    }
    return map
  }, [])

  return (
    <motion.div
      className="flex flex-col gap-5"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-1">
        <div className="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center">
          <Sparkles className="w-[18px] h-[18px] text-ghost-text" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-ghost-text uppercase tracking-[0.15em]">Swarm Skills</h2>
          <p className="text-xs text-ghost-text-dim/70">Configure behaviors agents follow during the swarm run.</p>
        </div>
      </div>

      {/* Category Sections */}
      {SKILL_CATEGORIES.map((cat) => (
        <CategorySection
          key={cat.id}
          label={cat.label}
          color={cat.color}
          skills={grouped[cat.id] || []}
          enabledSkills={enabledSkills}
          onToggle={toggleSkill}
        />
      ))}
    </motion.div>
  )
}
