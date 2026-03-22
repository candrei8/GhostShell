// Swarm Autonomy Gates — configurable per-action-type autonomy rules
// Controls how much freedom agents have for specific action categories.
// This is a notification-only system: we cannot actually block CLI actions,
// but we surface approval requests to the operator in the dashboard.

import type { AutonomyLevel, AutonomyRule, ApprovalRequest } from './swarm-types'
import { useSwarmStore } from '../stores/swarmStore'

// ─── Severity ordering (strictest last) ─────────────────────

const SEVERITY_ORDER: Record<AutonomyLevel, number> = {
  full_auto: 0,
  supervised: 1,
  review_required: 2,
  approval_gates: 3,
}

// ─── Default Autonomy Rules ─────────────────────────────────

export const DEFAULT_AUTONOMY_RULES: AutonomyRule[] = [
  {
    id: 'file-delete',
    name: 'File Deletion',
    description: 'Deleting files from the project',
    level: 'approval_gates',
    patterns: ['delete', 'rm ', 'remove file', 'unlink'],
    icon: 'Trash2',
    color: '#ef4444',
  },
  {
    id: 'config-change',
    name: 'Config Changes',
    description: 'Modifying configuration files (package.json, tsconfig, etc.)',
    level: 'review_required',
    patterns: ['package\\.json', 'tsconfig', '\\.env', 'config\\.', 'docker'],
    icon: 'Settings',
    color: '#f59e0b',
  },
  {
    id: 'dependency-change',
    name: 'Dependency Changes',
    description: 'Adding, removing, or updating npm/pip packages',
    level: 'approval_gates',
    patterns: ['npm install', 'npm uninstall', 'pip install', 'yarn add', 'pnpm add'],
    icon: 'Package',
    color: '#f59e0b',
  },
  {
    id: 'db-migration',
    name: 'Database Migrations',
    description: 'Database schema changes or migrations',
    level: 'approval_gates',
    patterns: ['migration', 'ALTER TABLE', 'DROP TABLE', 'CREATE TABLE', 'schema'],
    icon: 'Database',
    color: '#ef4444',
  },
  {
    id: 'git-operations',
    name: 'Git Operations',
    description: 'Git commits, branch operations, merges',
    level: 'review_required',
    patterns: ['git commit', 'git push', 'git merge', 'git rebase', 'git reset'],
    icon: 'GitBranch',
    color: '#8b5cf6',
  },
  {
    id: 'code-changes',
    name: 'Code Changes',
    description: 'Regular source code modifications',
    level: 'full_auto',
    patterns: [],  // default catch-all for code changes
    icon: 'Code2',
    color: '#3b82f6',
  },
]

// ─── Core Logic ─────────────────────────────────────────────

/**
 * Check if an action requires approval based on autonomy rules.
 * Returns the strictest matching rule, or null if no specific rule matches
 * (falls through to 'code-changes' default).
 */
export function checkAutonomy(
  action: string,
  detail: string,
  rules: AutonomyRule[],
): { requires: AutonomyLevel; rule: AutonomyRule } | null {
  const combined = `${action} ${detail}`.toLowerCase()

  let strictestMatch: { requires: AutonomyLevel; rule: AutonomyRule } | null = null
  let highestSeverity = -1

  for (const rule of rules) {
    // Skip rules with no patterns (catch-all like 'code-changes')
    if (rule.patterns.length === 0) continue

    // Check if any pattern matches
    const matches = rule.patterns.some((pattern) => {
      try {
        return new RegExp(pattern, 'i').test(combined)
      } catch {
        // Invalid regex — try plain substring match
        return combined.includes(pattern.toLowerCase())
      }
    })

    if (matches) {
      const severity = SEVERITY_ORDER[rule.level]
      if (severity > highestSeverity) {
        highestSeverity = severity
        strictestMatch = { requires: rule.level, rule }
      }
    }
  }

  return strictestMatch
}

/**
 * Get the default rules with any user overrides applied.
 * Overrides are a map of rule ID -> new autonomy level.
 */
export function getActiveRules(overrides?: Record<string, AutonomyLevel>): AutonomyRule[] {
  if (!overrides) return [...DEFAULT_AUTONOMY_RULES]

  return DEFAULT_AUTONOMY_RULES.map((rule) => {
    const override = overrides[rule.id]
    if (override) {
      return { ...rule, level: override }
    }
    return { ...rule }
  })
}

/**
 * Create an approval request for an action that requires operator approval.
 */
export function createApprovalRequest(
  swarmId: string,
  agentLabel: string,
  rule: AutonomyRule,
  action: string,
  detail: string,
): ApprovalRequest {
  const id = `approval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const request: ApprovalRequest = {
    id,
    swarmId,
    agentLabel,
    rule,
    action,
    detail,
    status: 'pending',
    requestedAt: Date.now(),
  }

  // Add to store
  useSwarmStore.getState().addApprovalRequest(request)

  return request
}

/**
 * Check an activity event against autonomy rules and create approval requests as needed.
 * Called from the activity emitter when new events are detected.
 */
export function checkActivityForApproval(
  swarmId: string,
  agentLabel: string,
  action: string,
  detail: string,
): ApprovalRequest | null {
  const state = useSwarmStore.getState()
  const swarm = state.getSwarm(swarmId)
  if (!swarm) return null

  // Get active rules — apply any overrides from swarm config
  const rules = getActiveRules(swarm.config.autonomyOverrides)

  const result = checkAutonomy(action, detail, rules)
  if (!result) return null

  // Only create approvals for 'approval_gates' level
  // 'review_required' is informational, 'full_auto' is allowed, 'supervised' is for manual control
  if (result.requires === 'approval_gates' || result.requires === 'supervised') {
    // Check if a similar request already exists and is pending (avoid duplicates)
    const existing = state.approvalQueue.find(
      (req) =>
        req.swarmId === swarmId &&
        req.agentLabel === agentLabel &&
        req.rule.id === result.rule.id &&
        req.status === 'pending' &&
        req.detail === detail,
    )
    if (existing) return existing

    return createApprovalRequest(swarmId, agentLabel, result.rule, action, detail)
  }

  return null
}

// ─── Autonomy Level Metadata ────────────────────────────────

export const AUTONOMY_LEVEL_META: Record<AutonomyLevel, {
  label: string
  shortLabel: string
  description: string
  color: string
}> = {
  full_auto: {
    label: 'Full Auto',
    shortLabel: 'Auto',
    description: 'Agent can perform this action freely',
    color: '#10b981',
  },
  review_required: {
    label: 'Review Required',
    shortLabel: 'Review',
    description: 'Action logged and flagged for operator review',
    color: '#f59e0b',
  },
  approval_gates: {
    label: 'Approval Gates',
    shortLabel: 'Gates',
    description: 'Operator is alerted and asked to approve or deny',
    color: '#ef4444',
  },
  supervised: {
    label: 'Supervised',
    shortLabel: 'Watch',
    description: 'All actions of this type require operator oversight',
    color: '#8b5cf6',
  },
}
