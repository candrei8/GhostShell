// GhostSwarm Layout Model — centralized layout-aware computation helpers.
//
// Provides:
//   - Tier computation from roster size
//   - Role-local indexing (replaces global index math)
//   - Role counts (replaces ad-hoc filtering in prompts/orchestrator)
//   - Role specialization contracts per tier
//   - Layout preset metadata with behavioral defaults
//   - Domain templates for multi-coordinator splits

import type {
  SwarmAgentRole,
  SwarmRosterAgent,
  SwarmLayoutPresetId,
  SwarmTier,
  SwarmRoleCounts,
  SwarmRolePosition,
  SwarmRoleBehaviorHints,
  SwarmRoleContract,
  SwarmDomain,
  SwarmLayoutPreset,
} from './swarm-types'
import { ROSTER_PRESETS, RAM_PER_AGENT_MB } from './swarm-types'

// ─── Tier Computation ───────────────────────────────────────

/**
 * Derive the swarm tier from total agent count.
 * Thresholds match ROSTER_PRESETS: duo≤3, squad≤5, team≤8, platoon≤15, battalion≤25, legion>25.
 */
export function computeSwarmTier(rosterSize: number): SwarmTier {
  if (rosterSize <= 3) return 'duo'
  if (rosterSize <= 5) return 'squad'
  if (rosterSize <= 8) return 'team'
  if (rosterSize <= 15) return 'platoon'
  if (rosterSize <= 25) return 'battalion'
  return 'legion'
}

/**
 * Resolve the layout preset ID from a roster, checking ROSTER_PRESETS first.
 * Falls back to tier-based inference for custom compositions.
 */
export function resolvePresetId(roster: SwarmRosterAgent[]): SwarmLayoutPresetId {
  const composition = computeRoleCounts(roster)
  for (const preset of ROSTER_PRESETS) {
    if (
      preset.composition.coordinator === composition.coordinators &&
      preset.composition.builder === composition.builders &&
      preset.composition.scout === composition.scouts &&
      preset.composition.reviewer === composition.reviewers &&
      (preset.composition.analyst ?? 0) === composition.analysts
    ) {
      return preset.id as SwarmLayoutPresetId
    }
  }
  return 'custom'
}

// ─── Role Counts ────────────────────────────────────────────

/**
 * Compute role counts from a roster. Single source of truth — replaces
 * scattered `roster.filter(a => a.role === 'builder').length` calls.
 */
export function computeRoleCounts(roster: SwarmRosterAgent[]): SwarmRoleCounts
export function computeRoleCounts(roster: { role: SwarmAgentRole }[]): SwarmRoleCounts
export function computeRoleCounts(roster: { role: SwarmAgentRole }[]): SwarmRoleCounts {
  const counts: SwarmRoleCounts = {
    coordinators: 0,
    builders: 0,
    scouts: 0,
    reviewers: 0,
    analysts: 0,
    custom: 0,
    total: roster.length,
  }
  for (const agent of roster) {
    switch (agent.role) {
      case 'coordinator': counts.coordinators++; break
      case 'builder':     counts.builders++;     break
      case 'scout':       counts.scouts++;       break
      case 'reviewer':    counts.reviewers++;    break
      case 'analyst':     counts.analysts++;     break
      case 'custom':      counts.custom++;       break
    }
  }
  return counts
}

// ─── Role Position ──────────────────────────────────────────

/**
 * Compute an agent's position within the swarm — role-local index,
 * lead status, tier, and counts. This is the canonical way to build
 * role context for prompt generation.
 *
 * @param roster Full roster array (order matters — index 0 of each role is lead)
 * @param agentIndex Global index of this agent in the roster
 */
export function computeRolePosition(
  roster: SwarmRosterAgent[],
  agentIndex: number,
): SwarmRolePosition {
  const agent = roster[agentIndex]
  if (!agent) {
    throw new Error(`Agent index ${agentIndex} out of bounds (roster size: ${roster.length})`)
  }

  const counts = computeRoleCounts(roster)
  const tier = computeSwarmTier(roster.length)
  const presetId = resolvePresetId(roster)

  // Compute role-local index: count how many agents of the same role
  // appear before this agent in the roster
  let roleIndex = 0
  for (let i = 0; i < agentIndex; i++) {
    if (roster[i].role === agent.role) roleIndex++
  }

  // Total agents with this role
  const roleTotal = roster.filter((a) => a.role === agent.role).length

  return {
    layoutPreset: presetId,
    swarmTier: tier,
    roleIndex,
    roleTotal,
    isLead: roleIndex === 0,
    swarmSize: roster.length,
    counts,
  }
}

// ─── Role Specialization Contracts ──────────────────────────

/**
 * Role behavior contracts — the canonical source for how each role
 * should adapt its behavior across swarm tiers. Consumed by the
 * prompt system to generate layout-aware instructions.
 *
 * Based on the dynamic role adaptation matrix from Scout 9 analysis.
 */
export const SWARM_ROLE_CONTRACTS: Record<SwarmAgentRole, SwarmRoleContract> = {
  coordinator: {
    role: 'coordinator',
    tiers: {
      duo: {
        taskGranularity: 'coarse',
        autonomy: 'high',
        scope: 'full-stack',
        hasLeadConcept: false,
        notes: [
          'Create 2-3 broad tasks, each 5-15 min',
          'Self-review or skip review step (no reviewer in DUO)',
          'Direct agent management — no delegation layers',
          'Scout recon is optional, brief focused scan',
        ],
      },
      squad: {
        taskGranularity: 'standard',
        autonomy: 'standard',
        scope: 'task-scoped',
        hasLeadConcept: false,
        notes: [
          'Create 4-6 tasks, each 5-15 min',
          'Route completed work to reviewer',
          'Request full recon from scout before decomposition',
          'Standard workflow — the baseline behavior',
        ],
      },
      team: {
        taskGranularity: 'fine',
        autonomy: 'guided',
        scope: 'domain-scoped',
        hasLeadConcept: false,
        notes: [
          'Create 8-12 tasks, each 10-20 min',
          'Assign scouts to specific domains (frontend/backend)',
          'Group builders by domain for locality',
          'Explicit territory assignment to avoid overlap',
        ],
      },
      platoon: {
        taskGranularity: 'very-fine',
        autonomy: 'guided',
        scope: 'domain-scoped',
        hasLeadConcept: true,
        notes: [
          'Create 15-20 tasks, each 10-15 min, maximize parallelism',
          'Split domain ownership with peer coordinator',
          'Use inter-coordinator sync protocol for shared boundaries',
          'Delegate to lead builders for sub-task management',
          'Assign reviewers to specific domains',
        ],
      },
      battalion: {
        taskGranularity: 'very-fine',
        autonomy: 'strict',
        scope: 'domain-scoped',
        hasLeadConcept: true,
        notes: [
          'Create 20-30 tasks, each 10-15 min, domain-split across 2 coordinators',
          'Each coordinator owns a domain and manages 6 builders',
          'Strict inter-coordinator sync for shared boundaries',
          'Use lead builders as sub-coordinators within each domain',
          'Assign reviewers and scouts per domain',
        ],
      },
      legion: {
        taskGranularity: 'very-fine',
        autonomy: 'strict',
        scope: 'domain-scoped',
        hasLeadConcept: true,
        notes: [
          'Create 30-40 tasks, each 10-15 min, triple-domain split across 3 coordinators',
          'Each coordinator owns a domain and manages 6 builders',
          'Primary coordinator (index 0) manages cross-domain dependencies',
          'Use lead builders as sub-coordinators within each domain',
          'Assign dedicated scouts and reviewers per domain',
        ],
      },
    },
  },

  builder: {
    role: 'builder',
    tiers: {
      duo: {
        taskGranularity: 'coarse',
        autonomy: 'high',
        scope: 'full-stack',
        hasLeadConcept: false,
        notes: [
          'Solo builder — broader scope, more autonomy',
          'Self-validate before marking tasks done',
          'May skip formal review if no reviewer in swarm',
          'Single working branch',
        ],
      },
      squad: {
        taskGranularity: 'standard',
        autonomy: 'standard',
        scope: 'task-scoped',
        hasLeadConcept: false,
        notes: [
          'Standard builder behavior — task-scoped work',
          'Create per-task branches',
          'Wait for reviewer feedback before merging',
          'Coordinate with peer builder on shared boundaries',
        ],
      },
      team: {
        taskGranularity: 'fine',
        autonomy: 'guided',
        scope: 'domain-scoped',
        hasLeadConcept: true,
        notes: [
          'Builder 1 is lead — coordinates other builders in domain',
          'Domain-scoped branches',
          'Check in with lead builder on architectural decisions',
          'Strictly respect file ownership boundaries',
        ],
      },
      platoon: {
        taskGranularity: 'very-fine',
        autonomy: 'strict',
        scope: 'layer-scoped',
        hasLeadConcept: true,
        notes: [
          'Builder 1 is lead — manages sub-group coordination',
          'Layer-scoped work (e.g. only types, only UI, only backend)',
          'Per-task branches, strictly scoped',
          'Report blockers immediately — many parallel dependencies',
        ],
      },
      battalion: {
        taskGranularity: 'very-fine',
        autonomy: 'strict',
        scope: 'layer-scoped',
        hasLeadConcept: true,
        notes: [
          'Builder 1 in each domain is lead — sub-coordinates 5 peer builders',
          'Strictly layer-scoped within assigned domain',
          'Per-task branches, no cross-domain file edits',
          'Report blockers to domain coordinator immediately',
        ],
      },
      legion: {
        taskGranularity: 'very-fine',
        autonomy: 'strict',
        scope: 'layer-scoped',
        hasLeadConcept: true,
        notes: [
          'Builder 1 in each domain is lead — sub-coordinates 5 peer builders',
          'Strictly layer-scoped within assigned domain',
          'Per-task branches, absolutely no cross-domain file edits',
          'Report blockers to domain coordinator immediately',
          'Expect high parallelism — minimize blocking dependencies',
        ],
      },
    },
  },

  scout: {
    role: 'scout',
    tiers: {
      duo: {
        taskGranularity: 'coarse',
        autonomy: 'high',
        scope: 'full-stack',
        hasLeadConcept: false,
        notes: [
          'Quick focused recon — broad overview only',
          'Transition to builder support after initial scan',
          'Answer builder questions from cached knowledge',
          'Single FINDINGS.md section covering full codebase',
        ],
      },
      squad: {
        taskGranularity: 'standard',
        autonomy: 'standard',
        scope: 'full-stack',
        hasLeadConcept: false,
        notes: [
          'Full codebase recon before builder work starts',
          'Standby for targeted questions after initial report',
          'Comprehensive FINDINGS.md with patterns, risks, and recommendations',
          'Support builder with architecture questions',
        ],
      },
      team: {
        taskGranularity: 'fine',
        autonomy: 'standard',
        scope: 'domain-scoped',
        hasLeadConcept: true,
        notes: [
          'Split coverage by domain (Scout 1=frontend+UI, Scout 2=backend+infra)',
          'Moderate depth — focus on assigned domain',
          'Separate FINDINGS.md sections per domain',
          'Domain-specific builder support',
        ],
      },
      platoon: {
        taskGranularity: 'very-fine',
        autonomy: 'guided',
        scope: 'domain-scoped',
        hasLeadConcept: true,
        notes: [
          'Deep specialization — one domain per scout',
          'Scout 1=frontend, Scout 2=backend, Scout 3=testing+infra (by convention)',
          'Deep per-domain FINDINGS.md sections',
          'Coordinate with domain coordinator for target priorities',
        ],
      },
      battalion: {
        taskGranularity: 'very-fine',
        autonomy: 'guided',
        scope: 'domain-scoped',
        hasLeadConcept: true,
        notes: [
          'Deep specialization — one domain per scout',
          'Assigned to specific coordinator domain',
          'Continuous monitoring of assigned domain for changes',
          'Proactive risk reporting to domain coordinator',
        ],
      },
      legion: {
        taskGranularity: 'very-fine',
        autonomy: 'guided',
        scope: 'domain-scoped',
        hasLeadConcept: true,
        notes: [
          'Deep specialization — one or two scouts per domain',
          'Scout 1 is lead scout — coordinates cross-domain intelligence',
          'Continuous monitoring and proactive risk reporting',
          'Coordinate with all three domain coordinators',
        ],
      },
    },
  },

  reviewer: {
    role: 'reviewer',
    tiers: {
      duo: {
        taskGranularity: 'coarse',
        autonomy: 'high',
        scope: 'full-stack',
        hasLeadConcept: false,
        notes: [
          'No reviewer in DUO — this tier does not apply',
          'If present as custom, do lightweight self-review assist',
        ],
      },
      squad: {
        taskGranularity: 'standard',
        autonomy: 'standard',
        scope: 'full-stack',
        hasLeadConcept: false,
        notes: [
          'Single reviewer — sequential review queue',
          'Prioritize blocking tasks first',
          'Full 7-point review checklist',
          'All reviews go through this reviewer',
        ],
      },
      team: {
        taskGranularity: 'fine',
        autonomy: 'standard',
        scope: 'full-stack',
        hasLeadConcept: false,
        notes: [
          'Single reviewer — review queue management',
          'Priority ordering: blocking tasks > critical path > other',
          'May request scout assist for domain context',
          'Track review metrics (time-to-review, issues found)',
        ],
      },
      platoon: {
        taskGranularity: 'very-fine',
        autonomy: 'guided',
        scope: 'domain-scoped',
        hasLeadConcept: true,
        notes: [
          'Multiple reviewers — domain split or round-robin',
          'Reviewer 1 is lead — manages review queue distribution',
          'Each reviews their assigned domain',
          'Approximately 50% workload each',
        ],
      },
      battalion: {
        taskGranularity: 'very-fine',
        autonomy: 'guided',
        scope: 'domain-scoped',
        hasLeadConcept: true,
        notes: [
          'Domain-split reviews — each reviewer owns a domain',
          'Reviewer 1 is lead — manages cross-domain review dependencies',
          'Prioritize blocking tasks within assigned domain',
          'Escalate cross-domain issues to lead reviewer',
        ],
      },
      legion: {
        taskGranularity: 'very-fine',
        autonomy: 'guided',
        scope: 'domain-scoped',
        hasLeadConcept: true,
        notes: [
          'Domain-split reviews — at least one reviewer per domain',
          'Reviewer 1 is lead — manages cross-domain review dependencies',
          'Extra reviewers handle overflow queue from busiest domains',
          'Prioritize blocking tasks, escalate cross-domain issues',
        ],
      },
    },
  },

  analyst: {
    role: 'analyst',
    tiers: {
      duo: {
        taskGranularity: 'coarse',
        autonomy: 'high',
        scope: 'full-stack',
        hasLeadConcept: false,
        notes: [
          'Lightweight monitoring — one report every 5 minutes',
          'Focus on task creation delays and builder idle time',
          'Small swarm — limited coordination overhead to detect',
        ],
      },
      squad: {
        taskGranularity: 'standard',
        autonomy: 'standard',
        scope: 'full-stack',
        hasLeadConcept: false,
        notes: [
          'Standard monitoring — one report every 5 minutes',
          'Track review backlog and builder utilization',
          'Alert coordinator on bottlenecks only',
        ],
      },
      team: {
        taskGranularity: 'standard',
        autonomy: 'standard',
        scope: 'full-stack',
        hasLeadConcept: false,
        notes: [
          'Domain-aware monitoring — track per-domain velocity',
          'Report every 3-5 minutes',
          'Flag domain velocity imbalances',
        ],
      },
      platoon: {
        taskGranularity: 'fine',
        autonomy: 'guided',
        scope: 'full-stack',
        hasLeadConcept: false,
        notes: [
          'Multi-coordinator sync tracking',
          'Report every 3 minutes',
          'Monitor cross-domain dependencies and coordinator sync gaps',
        ],
      },
      battalion: {
        taskGranularity: 'fine',
        autonomy: 'guided',
        scope: 'full-stack',
        hasLeadConcept: false,
        notes: [
          'Full-scale monitoring across 2 coordinator domains',
          'Report every 2-3 minutes',
          'Track builder utilization and reviewer queue balance',
          'Flag cross-domain dependency stalls',
        ],
      },
      legion: {
        taskGranularity: 'very-fine',
        autonomy: 'guided',
        scope: 'full-stack',
        hasLeadConcept: false,
        notes: [
          'Maximum-scale monitoring across 3 coordinator domains',
          'Report every 2-3 minutes',
          'Track per-coordinator domain velocity and builder utilization',
          'Priority: prevent cascading stalls in large swarms',
        ],
      },
    },
  },

  custom: {
    role: 'custom',
    tiers: {
      duo: {
        taskGranularity: 'standard',
        autonomy: 'standard',
        scope: 'task-scoped',
        hasLeadConcept: false,
        notes: ['Custom role — awaits coordinator instructions'],
      },
      squad: {
        taskGranularity: 'standard',
        autonomy: 'standard',
        scope: 'task-scoped',
        hasLeadConcept: false,
        notes: ['Custom role — awaits coordinator instructions'],
      },
      team: {
        taskGranularity: 'standard',
        autonomy: 'standard',
        scope: 'task-scoped',
        hasLeadConcept: false,
        notes: ['Custom role — awaits coordinator instructions'],
      },
      platoon: {
        taskGranularity: 'standard',
        autonomy: 'standard',
        scope: 'task-scoped',
        hasLeadConcept: false,
        notes: ['Custom role — awaits coordinator instructions'],
      },
      battalion: {
        taskGranularity: 'standard',
        autonomy: 'standard',
        scope: 'task-scoped',
        hasLeadConcept: false,
        notes: ['Custom role — awaits coordinator instructions'],
      },
      legion: {
        taskGranularity: 'standard',
        autonomy: 'standard',
        scope: 'task-scoped',
        hasLeadConcept: false,
        notes: ['Custom role — awaits coordinator instructions'],
      },
    },
  },
}

/**
 * Get the behavior hints for a specific role at a specific tier.
 * Convenience accessor for SWARM_ROLE_CONTRACTS.
 */
export function getRoleBehavior(
  role: SwarmAgentRole,
  tier: SwarmTier,
): SwarmRoleBehaviorHints {
  return SWARM_ROLE_CONTRACTS[role].tiers[tier]
}

/**
 * Get the full role contract for a role.
 */
export function getRoleContract(role: SwarmAgentRole): SwarmRoleContract {
  return SWARM_ROLE_CONTRACTS[role]
}

// ─── Domain Templates ───────────────────────────────────────

/** Default domain templates for multi-coordinator swarms */
const DOMAIN_FRONTEND: SwarmDomain = {
  id: 'frontend',
  label: 'Frontend & UI',
  filePatterns: ['src/components/**', 'src/hooks/**', 'src/stores/**', '**/*.css', '**/*.tsx'],
  directoryPrefixes: ['src/components/', 'src/hooks/', 'src/stores/'],
}

const DOMAIN_BACKEND: SwarmDomain = {
  id: 'backend',
  label: 'Backend & Infrastructure',
  filePatterns: ['electron/**', 'src/lib/**', '**/*.cjs', 'scripts/**'],
  directoryPrefixes: ['electron/', 'src/lib/', 'scripts/'],
}

const DOMAIN_TESTING: SwarmDomain = {
  id: 'testing',
  label: 'Testing & Infrastructure',
  filePatterns: ['**/*.test.*', '**/*.spec.*', '.github/**', '*.config.*'],
  directoryPrefixes: ['tests/', '.github/', '__tests__/'],
}

/**
 * Get domain templates appropriate for a given swarm tier.
 * Only PLATOON+ gets multi-domain support (2+ coordinators).
 */
export function getDomainTemplates(tier: SwarmTier): SwarmDomain[] {
  switch (tier) {
    case 'duo':
    case 'squad':
    case 'team':
      return [] // No domain splitting for single-coordinator swarms
    case 'platoon':
    case 'battalion':
      return [DOMAIN_FRONTEND, DOMAIN_BACKEND]
    case 'legion':
      return [DOMAIN_FRONTEND, DOMAIN_BACKEND, DOMAIN_TESTING]
    default:
      return []
  }
}

/**
 * Get all available domain templates including testing.
 * Useful when the user wants to customize domain assignments.
 */
export function getAllDomainTemplates(): SwarmDomain[] {
  return [DOMAIN_FRONTEND, DOMAIN_BACKEND, DOMAIN_TESTING]
}

// ─── Layout Presets (extended metadata) ─────────────────────

/**
 * Extended layout presets — augments the base ROSTER_PRESETS with
 * behavioral defaults, strategies, and domain templates.
 * Single source of truth for "what does each preset mean?"
 */
export const SWARM_LAYOUT_PRESETS: SwarmLayoutPreset[] = [
  {
    id: 'duo',
    tier: 'duo',
    label: 'DUO',
    total: 3,
    composition: { coordinator: 1, builder: 1, scout: 1, reviewer: 0, analyst: 0, custom: 0 },
    ramPerAgent: RAM_PER_AGENT_MB,
    description: 'Minimum viable swarm — fast, low overhead',
    taskSizingHint: 'Size tasks for ~5-15 min of focused agent work',
    multiCoordinator: false,
    domainTemplates: [],
    scoutStrategy: 'full-codebase',
    reviewStrategy: 'self-review',
  },
  {
    id: 'squad',
    tier: 'squad',
    label: 'SQUAD',
    total: 5,
    composition: { coordinator: 1, builder: 2, scout: 1, reviewer: 1, analyst: 0, custom: 0 },
    ramPerAgent: RAM_PER_AGENT_MB,
    description: 'Sweet spot — Anthropic recommended team size',
    taskSizingHint: 'Size tasks for ~5-15 min of focused agent work',
    multiCoordinator: false,
    domainTemplates: [],
    scoutStrategy: 'full-codebase',
    reviewStrategy: 'sequential',
  },
  {
    id: 'team',
    tier: 'team',
    label: 'TEAM',
    total: 8,
    composition: { coordinator: 1, builder: 4, scout: 2, reviewer: 1, analyst: 0, custom: 0 },
    ramPerAgent: RAM_PER_AGENT_MB,
    description: 'Max for most machines — Cursor\'s cap',
    taskSizingHint: 'Size tasks for ~10-20 min of focused agent work — favor more granular decomposition to keep all builders busy',
    multiCoordinator: false,
    domainTemplates: [],
    scoutStrategy: 'domain-split',
    reviewStrategy: 'sequential',
  },
  {
    id: 'platoon',
    tier: 'platoon',
    label: 'PLATOON',
    total: 12,
    composition: { coordinator: 2, builder: 5, scout: 3, reviewer: 2, analyst: 0, custom: 0 },
    ramPerAgent: RAM_PER_AGENT_MB,
    description: 'Power users — requires 32GB+ RAM, split coordinators',
    taskSizingHint: 'Size tasks for ~10-15 min each — with this many agents, maximize parallelism by creating many small, independent tasks',
    multiCoordinator: true,
    domainTemplates: [DOMAIN_FRONTEND, DOMAIN_BACKEND],
    scoutStrategy: 'deep-specialization',
    reviewStrategy: 'domain-split',
  },
  {
    id: 'battalion',
    tier: 'battalion',
    label: 'BATTALION',
    total: 20,
    composition: { coordinator: 2, builder: 12, scout: 3, reviewer: 3, analyst: 0, custom: 0 },
    ramPerAgent: RAM_PER_AGENT_MB,
    description: 'Large-scale — 2 coordinators, domain-split, 64GB+ RAM recommended',
    taskSizingHint: 'Size tasks for ~10-15 min each — create 20-30 small independent tasks to keep all 12 builders busy',
    multiCoordinator: true,
    domainTemplates: [DOMAIN_FRONTEND, DOMAIN_BACKEND],
    scoutStrategy: 'deep-specialization',
    reviewStrategy: 'domain-split',
  },
  {
    id: 'legion',
    tier: 'legion',
    label: 'LEGION',
    total: 30,
    composition: { coordinator: 3, builder: 18, scout: 5, reviewer: 4, analyst: 0, custom: 0 },
    ramPerAgent: RAM_PER_AGENT_MB,
    description: 'Maximum scale — 3 coordinators, triple-domain split, 128GB+ RAM',
    taskSizingHint: 'Size tasks for ~10-15 min each — create 30-40 small independent tasks across 3 domains',
    multiCoordinator: true,
    domainTemplates: [DOMAIN_FRONTEND, DOMAIN_BACKEND, DOMAIN_TESTING],
    scoutStrategy: 'deep-specialization',
    reviewStrategy: 'domain-split',
  },
]

/**
 * Get the extended layout preset by ID.
 * Returns undefined for 'custom' or unknown IDs.
 */
export function getLayoutPreset(id: SwarmLayoutPresetId): SwarmLayoutPreset | undefined {
  return SWARM_LAYOUT_PRESETS.find((p) => p.id === id)
}

/**
 * Get the layout preset that matches a roster composition.
 * Falls back to building a custom preset descriptor for non-standard rosters.
 */
export function getLayoutPresetForRoster(roster: SwarmRosterAgent[]): SwarmLayoutPreset {
  const presetId = resolvePresetId(roster)
  const existing = getLayoutPreset(presetId)
  if (existing) return existing

  // Build a synthetic preset for custom compositions
  const counts = computeRoleCounts(roster)
  const tier = computeSwarmTier(roster.length)
  const tierPreset = SWARM_LAYOUT_PRESETS.find((p) => p.tier === tier)

  return {
    id: 'custom',
    tier,
    label: 'CUSTOM',
    total: roster.length,
    composition: {
      coordinator: counts.coordinators,
      builder: counts.builders,
      scout: counts.scouts,
      reviewer: counts.reviewers,
      analyst: counts.analysts,
      custom: counts.custom,
    },
    ramPerAgent: RAM_PER_AGENT_MB,
    description: `Custom ${roster.length}-agent swarm`,
    taskSizingHint: tierPreset?.taskSizingHint ?? 'Size tasks for ~10-15 min of focused agent work',
    multiCoordinator: counts.coordinators > 1,
    domainTemplates: getDomainTemplates(tier),
    scoutStrategy: tierPreset?.scoutStrategy ?? 'full-codebase',
    reviewStrategy: tierPreset?.reviewStrategy ?? 'sequential',
  }
}

// ─── Scout Coverage Assignment ──────────────────────────────

/**
 * Conventional domain assignments for scouts based on count.
 * Returns an array of domain labels ordered by scout index.
 *
 * 1 scout  → ['full-codebase']
 * 2 scouts → ['frontend+UI', 'backend+infra']
 * 3 scouts → ['frontend', 'backend', 'testing+infra']
 */
export function getScoutDomainLabels(scoutCount: number): string[] {
  if (scoutCount <= 0) return []
  if (scoutCount === 1) return ['full-codebase']
  if (scoutCount === 2) return ['frontend+UI', 'backend+infra']
  // 3+ scouts: first three get standard domains, extras get 'overflow'
  const labels = ['frontend', 'backend', 'testing+infra']
  for (let i = 3; i < scoutCount; i++) {
    labels.push(`overflow-${i - 2}`)
  }
  return labels
}

// ─── Reviewer Assignment ────────────────────────────────────

/**
 * Conventional review strategy for reviewers based on count and tier.
 */
export function getReviewerStrategy(
  reviewerCount: number,
  tier: SwarmTier,
): { strategy: 'none' | 'sequential' | 'round-robin' | 'domain-split'; notes: string } {
  if (reviewerCount === 0) {
    return { strategy: 'none', notes: 'No reviewer — builder self-validates or coordinator reviews' }
  }
  if (reviewerCount === 1) {
    return { strategy: 'sequential', notes: 'Single reviewer — sequential queue, blocking tasks first' }
  }
  if (tier === 'platoon' || tier === 'battalion' || tier === 'legion') {
    return { strategy: 'domain-split', notes: 'Domain-split reviews — each reviewer owns a domain' }
  }
  return { strategy: 'round-robin', notes: 'Round-robin reviews — alternate between reviewers' }
}

// ─── Agent Label Helpers ────────────────────────────────────

/**
 * Build a role-local label like "Builder 2" using role-local index
 * instead of the global roster index. This produces correct labels
 * like "Builder 1", "Builder 2" instead of "Builder 4", "Builder 5".
 */
export function buildRoleLocalLabel(
  role: SwarmAgentRole,
  roleIndex: number,
  customName?: string,
): string {
  if (customName) return customName
  const roleLabels: Record<SwarmAgentRole, string> = {
    coordinator: 'Coordinator',
    builder: 'Builder',
    scout: 'Scout',
    reviewer: 'Reviewer',
    analyst: 'Analyst',
    custom: 'Agent',
  }
  return `${roleLabels[role]} ${roleIndex + 1}`
}

/**
 * Build all agent labels for a roster using role-local indexing.
 * Returns an array parallel to the roster with correct labels.
 *
 * Example: [coord, builder, builder, scout] → ["Coordinator 1", "Builder 1", "Builder 2", "Scout 1"]
 */
export function buildRosterLabels(roster: SwarmRosterAgent[]): string[] {
  const roleCounters: Record<string, number> = {}
  return roster.map((agent) => {
    if (agent.customName) return agent.customName
    const count = (roleCounters[agent.role] ?? 0)
    roleCounters[agent.role] = count + 1
    return buildRoleLocalLabel(agent.role, count)
  })
}
