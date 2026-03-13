// Swarm Skills — configurable behaviors that agents follow during a swarm run.
// Modeled after the "Swarm Skills" panel in the reference screenshots.

export type SwarmSkillCategory = 'workflow' | 'quality' | 'ops' | 'analysis'

export interface SwarmSkill {
  id: string
  name: string
  description: string
  category: SwarmSkillCategory
  icon: string
  /** Whether this skill is enabled by default */
  defaultEnabled: boolean
}

export interface SwarmSkillCategoryDef {
  id: SwarmSkillCategory
  label: string
  color: string
}

export const SKILL_CATEGORIES: SwarmSkillCategoryDef[] = [
  { id: 'workflow', label: 'WORKFLOW', color: '#3b82f6' },
  { id: 'quality', label: 'QUALITY', color: '#f59e0b' },
  { id: 'ops', label: 'OPS', color: '#10b981' },
  { id: 'analysis', label: 'ANALYSIS', color: '#8b5cf6' },
]

export const SWARM_SKILLS: SwarmSkill[] = [
  // ── Workflow ──
  {
    id: 'incremental-commits',
    name: 'Incremental Commits',
    description: 'Commit small, atomic changes frequently',
    category: 'workflow',
    icon: 'GitCommit',
    defaultEnabled: true,
  },
  {
    id: 'refactor-only',
    name: 'Refactor Only',
    description: 'Restructure without changing behavior',
    category: 'workflow',
    icon: 'Layers',
    defaultEnabled: false,
  },
  {
    id: 'monorepo-aware',
    name: 'Monorepo Aware',
    description: 'Respect package boundaries and shared dependencies',
    category: 'workflow',
    icon: 'Users',
    defaultEnabled: false,
  },

  // ── Quality ──
  {
    id: 'test-driven',
    name: 'Test-Driven',
    description: 'Write tests first, then implement to pass them',
    category: 'quality',
    icon: 'FlaskConical',
    defaultEnabled: false,
  },
  {
    id: 'code-review',
    name: 'Code Review',
    description: 'Review all changes before committing',
    category: 'quality',
    icon: 'GitPullRequest',
    defaultEnabled: true,
  },
  {
    id: 'documentation',
    name: 'Documentation',
    description: 'Document all public APIs and complex logic',
    category: 'quality',
    icon: 'FileText',
    defaultEnabled: false,
  },
  {
    id: 'security-audit',
    name: 'Security Audit',
    description: 'Check for vulnerabilities as you build',
    category: 'quality',
    icon: 'Shield',
    defaultEnabled: false,
  },
  {
    id: 'dry-principle',
    name: 'DRY Principle',
    description: 'Eliminate code duplication aggressively',
    category: 'quality',
    icon: 'Repeat',
    defaultEnabled: false,
  },
  {
    id: 'accessibility',
    name: 'Accessibility',
    description: 'Ensure UI meets WCAG accessibility standards',
    category: 'quality',
    icon: 'Accessibility',
    defaultEnabled: false,
  },

  // ── Ops ──
  {
    id: 'keep-ci-green',
    name: 'Keep CI Green',
    description: 'Ensure all checks pass before moving on',
    category: 'ops',
    icon: 'CircleCheck',
    defaultEnabled: true,
  },
  {
    id: 'migration-safe',
    name: 'Migration Safe',
    description: 'Ensure DB changes are reversible and backward-compatible',
    category: 'ops',
    icon: 'Database',
    defaultEnabled: false,
  },

  // ── Analysis ──
  {
    id: 'performance',
    name: 'Performance',
    description: 'Optimize for speed and efficiency',
    category: 'analysis',
    icon: 'Gauge',
    defaultEnabled: false,
  },
]

/** Get the default set of enabled skill IDs */
export function getDefaultSkillIds(): string[] {
  return SWARM_SKILLS.filter((s) => s.defaultEnabled).map((s) => s.id)
}

/** Group skills by category */
export function getSkillsByCategory(): Record<SwarmSkillCategory, SwarmSkill[]> {
  const grouped: Record<SwarmSkillCategory, SwarmSkill[]> = {
    workflow: [],
    quality: [],
    ops: [],
    analysis: [],
  }
  for (const skill of SWARM_SKILLS) {
    grouped[skill.category].push(skill)
  }
  return grouped
}

/** Get a single skill by ID */
export function getSkill(id: string): SwarmSkill | undefined {
  return SWARM_SKILLS.find((s) => s.id === id)
}
