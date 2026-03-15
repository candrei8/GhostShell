// Swarm Role Guidance — per-layout behavioral matrices and structured handoff protocols.
// Consumed by swarm-prompts.ts to inject layout-specific behavior into each role's prompt.

// ─── Types ──────────────────────────────────────────────────

/** Swarm tier maps agent count to organizational complexity */
export type SwarmTier = 'duo' | 'squad' | 'team' | 'platoon'

export interface RoleCounts {
  coordinators: number
  builders: number
  scouts: number
  reviewers: number
  total: number
}

// ─── Tier Detection ─────────────────────────────────────────

export function getSwarmTier(agentCount: number): SwarmTier {
  if (agentCount <= 3) return 'duo'
  if (agentCount <= 5) return 'squad'
  if (agentCount <= 10) return 'team'
  return 'platoon'
}

// ─── Coordinator Layout Guidance ────────────────────────────

export function coordinatorLayoutGuidance(tier: SwarmTier, counts: RoleCounts): string {
  const base = `
LAYOUT ADAPTATION — ${tier.toUpperCase()} (${counts.total} agents)
`

  switch (tier) {
    case 'duo':
      return `${base}
TASK STRATEGY:
- Create 2-3 coarse tasks (5-15 min each)
- Minimal decomposition — the single Builder handles broad scope
- Assign all tasks sequentially or in small parallel batches

SCOUT USAGE:
- Scout performs quick focused recon (3-5 min), then stands by
- After recon, Scout may assist Builder with research questions

REVIEW PROCESS:${counts.reviewers > 0
  ? '- Route completed tasks to the Reviewer for standard review'
  : `- Self-review Builder output: read changed files, verify acceptance criteria
- No separate Reviewer — you are the quality gate`}

BUILDER MANAGEMENT:
- Direct management — single Builder, single communication channel
- Grant Builder higher autonomy (broader scope per task)
- Builder may self-validate before submitting for review`

    case 'squad':
      return `${base}
TASK STRATEGY:
- Create 4-6 standard tasks (5-15 min each)
- Balance parallelism: 2 Builders can work 2 independent tasks simultaneously
- Use dependencies to sequence tasks that touch shared interfaces

SCOUT USAGE:
- Request full codebase reconnaissance before task decomposition
- Scout delivers findings to knowledge/FINDINGS.md, then stands by for Builder questions

REVIEW PROCESS:
- Route all completed tasks to the Reviewer
- Reviewer handles tasks sequentially — prioritize blocking tasks first

BUILDER MANAGEMENT:
- Round-robin assignment — alternate between Builders to balance load
- Each Builder is task-scoped: clear boundaries, specific files
- Standard handoff protocol (see HANDOFF PROTOCOLS below)`

    case 'team':
      return `${base}
TASK STRATEGY:
- Create 8-12 fine-grained tasks (10-20 min each)
- Group tasks by domain: frontend vs backend vs infrastructure
- Maximize parallelism — 4 Builders means 4 concurrent work streams

SCOUT USAGE:
- 2 Scouts: assign domain territories
  * Scout A: frontend, UI components, styles, client-side logic
  * Scout B: backend, API, database, server-side logic
- Each Scout writes to their own file: FINDINGS-scout-N.md (knowledge/ directory)
- A consolidated FINDINGS.md index links to each Scout's section file
- Builders consult the Scout assigned to their domain

REVIEW PROCESS:
- Single Reviewer handles all reviews
- Priority queue: blocking tasks first, then by dependency depth
- If Reviewer becomes bottleneck, consider approving low-risk tasks yourself

BUILDER MANAGEMENT:
- Builder 1 is LEAD BUILDER — coordinates with other Builders on shared interfaces
- Group Builders by domain where possible (e.g., Builder 1-2 = frontend, Builder 3-4 = backend)
- Lead Builder can answer peer questions about patterns — reduces Scout dependency`

    case 'platoon':
      return `${base}
TASK STRATEGY:
- Create 15-20 very fine tasks (10-15 min each)
- Maximize parallelism — 5 Builders means 5 concurrent work streams
- Use dependency chains to sequence foundation → implementation → integration

SCOUT USAGE:
- 3 Scouts: deep specialization by domain
  * Scout A: frontend, components, styles, UI patterns
  * Scout B: backend, API routes, services, data models
  * Scout C: testing, infrastructure, CI/CD, configuration
- Each Scout writes to their own file: FINDINGS-scout-N.md (knowledge/ directory)
- A consolidated FINDINGS.md index links to each Scout's section file
- Builders consult domain-specific Scout

MULTI-COORDINATOR PROTOCOL:
- Split domain ownership with the other Coordinator
  * Coordinator 1: frontend tasks + UI Builders
  * Coordinator 2: backend tasks + infra Builders
- Sync every 3 minutes via gs-mail (type=status):
  * Share: task progress, blockers, completed tasks, resource needs
  * Resolve: cross-domain dependencies, shared file conflicts
  * Format: "COORD-SYNC: [domain] — [N] tasks active, [M] done, blockers: [list or none]"
- NEVER assign tasks in the other Coordinator's domain without sync
- If a task spans both domains → one Coordinator owns it, other reviews

REVIEW PROCESS:
- 2 Reviewers: assign by domain (matching Coordinator split)
  * Reviewer A: frontend code reviews
  * Reviewer B: backend code reviews
- Cross-domain tasks: assign to the Reviewer with more expertise in the primary domain

BUILDER MANAGEMENT:
- Builder 1 is LEAD BUILDER — point of contact for cross-Builder coordination
- Assign Builders to domains: Builder 1-2 = frontend, Builder 3-5 = backend (or as needed)
- Strictly scoped tasks — each Builder owns a narrow file set
- Lead Builder reviews peer integration before marking task for formal review`
  }
}

// ─── Builder Layout Guidance ────────────────────────────────

export function builderLayoutGuidance(tier: SwarmTier, roleIndex: number, roleTotal: number): string {
  const isLead = roleIndex === 0 && roleTotal > 2

  const leadSection = isLead
    ? `
LEAD BUILDER RESPONSIBILITIES:
- You are the Lead Builder — other Builders may ask you about shared patterns
- Coordinate with peer Builders on interface contracts (types, exports)
- If a peer Builder's work affects your files, sync via gs-mail before proceeding
- Review peer integration informally before tasks go to formal review
- Escalate cross-Builder conflicts to Coordinator immediately
`
    : ''

  switch (tier) {
    case 'duo':
      return `
LAYOUT ADAPTATION — DUO (solo builder)

YOUR SCOPE:
- You are the only Builder — broad scope, high autonomy
- Tasks may span multiple layers (types, logic, UI, tests)
- Self-validate thoroughly before submitting (no peer Builder to catch issues)

WORK STYLE:
- Move fast — small swarm means less coordination overhead
- You may explore the codebase more freely than in larger swarms
- Commit frequently (small atomic changes)
- If blocked, escalate immediately — there's no one else to pick up your task`

    case 'squad':
      return `
LAYOUT ADAPTATION — SQUAD (${roleTotal} builders)

YOUR SCOPE:
- Task-scoped: focus strictly on your assigned files
- Moderate autonomy — follow patterns identified by Scout
- Parallel work with ${roleTotal - 1} other Builder(s) — respect file boundaries

WORK STYLE:
- Standard workflow: receive → explore → implement → validate → submit
- Do NOT touch files outside your ownedFiles array
- If your work requires changes to another Builder's files, escalate to Coordinator
${leadSection}`

    case 'team':
      return `
LAYOUT ADAPTATION — TEAM (${roleTotal} builders)
${leadSection}
YOUR SCOPE:
- Domain-scoped: you'll be assigned tasks within a specific domain
- Follow Lead Builder's guidance on shared interfaces
- Coordinate with domain peers if your changes affect shared exports

WORK STYLE:
- Fine-grained tasks: each task is focused and specific
- Read knowledge/FINDINGS.md (index) + your domain's FINDINGS-scout-N.md before exploring on your own
- If you need a type/interface that doesn't exist yet, check if another Builder is creating it
  → If yes, wait for their task to complete (check dependency status)
  → If no, escalate to Coordinator to create a foundation task`

    case 'platoon':
      return `
LAYOUT ADAPTATION — PLATOON (${roleTotal} builders)
${leadSection}
YOUR SCOPE:
- Layer-scoped: strictly narrow file ownership
- Each task is highly focused (10-15 min of work)
- Multiple tasks may be assigned sequentially as you complete them

WORK STYLE:
- Strictly scoped — do NOT deviate from assigned files
- Check dependency status before starting (deps must be status=done)
- Coordinate with Lead Builder on interface contracts
- Submit early, submit often — keep the review pipeline flowing
- If between tasks, check inbox and gs-task ready for new assignments`
  }
}

// ─── Scout Layout Guidance ──────────────────────────────────

export function scoutLayoutGuidance(tier: SwarmTier, roleIndex: number, scoutTotal: number): string {
  // Domain assignment for multi-scout layouts
  const domainAssignment = scoutTotal === 1
    ? 'Full codebase — broad overview of all areas'
    : scoutTotal === 2
      ? roleIndex === 0
        ? 'DOMAIN: Frontend — UI components, styles, client-side logic, hooks, stores'
        : 'DOMAIN: Backend — API routes, services, data models, server-side logic, infrastructure'
      : roleIndex === 0
        ? 'DOMAIN: Frontend — UI components, styles, client-side logic, hooks, stores'
        : roleIndex === 1
          ? 'DOMAIN: Backend — API routes, services, data models, server-side logic'
          : 'DOMAIN: Testing & Infrastructure — test suites, CI/CD, build config, deployment'

  const depthGuidance = scoutTotal === 1
    ? 'DEPTH: Broad overview — cover all major areas, moderate depth'
    : scoutTotal === 2
      ? 'DEPTH: Moderate — thorough coverage of your domain, key patterns and risks'
      : 'DEPTH: Deep — exhaustive analysis of your domain, detailed file mapping'

  const findingsFormat = scoutTotal === 1
    ? `Write a single comprehensive FINDINGS.md covering all areas.`
    : `Write your findings to your DEDICATED section file — FINDINGS-scout-N.md (where N is your agent number).
   This file was pre-created for you in the knowledge/ directory.
   Do NOT write to FINDINGS.md directly — that is a consolidated index that links to each Scout's file.

   Your section file heading:
   ## Scout ${roleIndex + 1} — ${roleIndex === 0 ? 'Frontend' : roleIndex === 1 ? 'Backend' : 'Testing & Infrastructure'}`

  return `
LAYOUT ADAPTATION — ${tier.toUpperCase()} (${scoutTotal} scout${scoutTotal > 1 ? 's' : ''})

ASSIGNMENT: ${domainAssignment}
${depthGuidance}

FINDINGS DELIVERY:
${findingsFormat}

TIMING:
- ${tier === 'duo' ? 'Quick recon: 3-5 minutes, then stand by' : 'Full recon: 5-10 minutes, then stand by'}
- The entire swarm is waiting on your intel — speed matters
- Actionable > exhaustive: flag risks and patterns, skip trivial details

BUILDER SUPPORT:
- After delivering findings, monitor inbox for Builder questions
- Answer with specific file paths and line numbers
- ${scoutTotal > 1 ? 'Only answer questions in YOUR domain — redirect others to the appropriate Scout' : 'Answer all Builder questions across the codebase'}`
}

// ─── Reviewer Layout Guidance ───────────────────────────────

export function reviewerLayoutGuidance(tier: SwarmTier, roleIndex: number, reviewerTotal: number): string {
  const domainAssignment = reviewerTotal === 1
    ? 'ALL DOMAINS — you review all completed tasks'
    : roleIndex === 0
      ? 'DOMAIN: Frontend — UI components, styles, client-side code'
      : 'DOMAIN: Backend — API, services, server-side code, infrastructure'

  const queueStrategy = reviewerTotal === 1
    ? `QUEUE STRATEGY:
- Sequential review — process tasks in order received
- Priority: blocking tasks first (tasks that others depend on)
- If queue grows > 3 tasks, notify Coordinator to adjust velocity`
    : `QUEUE STRATEGY:
- Domain-split review — you handle ${roleIndex === 0 ? 'frontend' : 'backend'} tasks
- Round-robin within your domain if multiple tasks arrive simultaneously
- If the other Reviewer is overloaded, Coordinator may route cross-domain tasks to you
- Approximate workload: ~50% of all reviews each`

  return `
LAYOUT ADAPTATION — ${tier.toUpperCase()} (${reviewerTotal} reviewer${reviewerTotal > 1 ? 's' : ''})

ASSIGNMENT: ${domainAssignment}

${queueStrategy}

REVIEW SPEED vs DEPTH:
- ${tier === 'duo' || tier === 'squad' ? 'Standard depth — thorough 7-point inspection for each task' : 'Balanced depth — focus on correctness and scope compliance, lighter on style'}
- ${reviewerTotal > 1 ? 'Coordinate with peer Reviewer to avoid reviewing the same task' : 'You are the sole quality gate — be thorough but fast'}
- Target: complete each review in 3-5 minutes`
}

// ─── Handoff Protocols ──────────────────────────────────────

/**
 * Defines how Scouts deliver findings to Builders.
 * Machine-followable: numbered steps with exact commands.
 */
export function scoutToBuilderHandoff(swarmRoot: string): string {
  return `
HANDOFF PROTOCOL: Scout -> Builder (Findings Delivery)

  SCOUT SIDE (after completing reconnaissance):
  1. Write findings to your section file:
     - Single scout:  ${swarmRoot}/knowledge/FINDINGS.md (write directly)
     - Multi-scout:   ${swarmRoot}/knowledge/FINDINGS-scout-N.md (your pre-created section file)
     - Use structured format: Tech Stack, Code Patterns, Critical Files, Risks, Testing
     - Include file paths, line numbers, and concrete examples
     - Do NOT overwrite FINDINGS.md in multi-scout swarms — it is a consolidated index
  2. Send summary to Coordinator:
     node ${swarmRoot}/bin/gs-mail.cjs send --to "<Coordinator>" --type message --body "Recon complete. FINDINGS updated with [N] critical files, [M] risk zones. Standing by for Builder questions."
  3. Enter standby: monitor inbox every 30s for Builder questions

  BUILDER SIDE (before starting implementation):
  1. Read ${swarmRoot}/knowledge/FINDINGS.md BEFORE exploring on your own
     - This is the consolidated index. In multi-scout swarms it links to per-scout section files.
  2. Also read each FINDINGS-scout-N.md file listed in the index for full codebase intelligence
  3. Note: patterns, naming conventions, risk zones relevant to your task
  4. If you need clarification, message the domain-appropriate Scout:
     node ${swarmRoot}/bin/gs-mail.cjs send --to "<Scout>" --type message --body "Question: [specific question about your task area]"
  5. Wait for Scout response before making assumptions`
}

/**
 * Defines how Builders submit work for review.
 * Machine-followable: numbered steps with exact commands.
 */
export function builderToReviewerHandoff(swarmRoot: string): string {
  return `
HANDOFF PROTOCOL: Builder -> Reviewer (Review Submission)

  BUILDER SIDE (when implementation is complete):
  1. Self-validate: re-read all changed files, verify acceptance criteria
  2. Run available checks (tests, lint, build) — all must pass
  3. Commit your work:
     git add [owned files]
     git commit -m "swarm: <taskId> — <brief description>"
  4. Update task status (auto-notifies Coordinator):
     node ${swarmRoot}/bin/gs-task.cjs update <taskId> --status review
  5. Send completion report to Coordinator:
     node ${swarmRoot}/bin/gs-mail.cjs send --to "<Coordinator>" --type worker_done --body "Task <taskId> complete. Files: [list]. Summary: [what was done]. Tests: [pass/not run]."
  6. Wait for review feedback — check inbox every 30s

  COORDINATOR SIDE (routes review):
  1. Assign Reviewer:
     node ${swarmRoot}/bin/gs-task.cjs update <taskId> --reviewer "<Reviewer>"
  2. Send review request:
     node ${swarmRoot}/bin/gs-mail.cjs send --to "<Reviewer>" --type review_request --body "Review task <taskId>: <title>. Files: [list]. Builder: <name>." --meta '{"taskId":"<id>","files":[],"builder":"<name>"}'`
}

/**
 * Defines how Reviewers send feedback and re-reviews work.
 * Machine-followable: numbered steps with exact commands.
 */
export function reviewerToBuilderHandoff(swarmRoot: string): string {
  return `
HANDOFF PROTOCOL: Reviewer -> Builder (Review Feedback)

  REVIEWER SIDE (after completing review):
  IF APPROVED:
    1. Record verdict:
       node ${swarmRoot}/bin/gs-task.cjs update <taskId> --verdict approved
    2. Notify Coordinator:
       node ${swarmRoot}/bin/gs-mail.cjs send --to "<Coordinator>" --type review_complete --body "Task <taskId> APPROVED." --meta '{"taskId":"<id>","verdict":"approved"}'
    3. Coordinator marks task done:
       node ${swarmRoot}/bin/gs-task.cjs update <taskId> --status done

  IF CHANGES_REQUESTED:
    1. Record verdict:
       node ${swarmRoot}/bin/gs-task.cjs update <taskId> --verdict changes_requested
    2. Send specific feedback to Builder (file:line format):
       node ${swarmRoot}/bin/gs-mail.cjs send --to "<Builder>" --type review_feedback --body "CHANGES REQUESTED for <taskId>:
       HIGH: file.ts:42 — [issue and how to fix]
       MEDIUM: file.ts:15 — [issue and suggestion]
       Fix and re-submit." --meta '{"taskId":"<id>","verdict":"changes_requested"}'
    3. Notify Coordinator:
       node ${swarmRoot}/bin/gs-mail.cjs send --to "<Coordinator>" --type review_feedback --body "Task <taskId>: CHANGES_REQUESTED. [N] issues." --meta '{"taskId":"<id>","verdict":"changes_requested"}'

  BUILDER SIDE (after receiving feedback):
    1. Read feedback — address every HIGH and MEDIUM issue
    2. Fix issues in owned files
    3. Re-run checks (tests, lint, build)
    4. Re-submit:
       node ${swarmRoot}/bin/gs-task.cjs update <taskId> --status review
       node ${swarmRoot}/bin/gs-mail.cjs send --to "<Reviewer>" --type message --body "Fixes applied for <taskId>. Ready for re-review."

  REVIEWER SIDE (re-review):
    1. Focus only on previously flagged issues + quick scan for new regressions
    2. If all fixed → APPROVED
    3. If issues remain → CHANGES_REQUESTED again (be specific)`
}

/**
 * Defines multi-coordinator sync protocol for PLATOON tier.
 * Only injected when coordinatorCount >= 2.
 */
export function coordinatorSyncProtocol(): string {
  return `
MULTI-COORDINATOR SYNC PROTOCOL

  DOMAIN OWNERSHIP:
  - At swarm startup, agree on domain split via gs-mail:
    * Coordinator 1: frontend domain (UI, components, styles, client logic)
    * Coordinator 2: backend domain (API, services, data, infrastructure)
  - Each Coordinator exclusively manages tasks in their domain
  - Cross-domain tasks: owned by the Coordinator whose domain is primary

  SYNC CADENCE:
  - Exchange status every 3 minutes via gs-mail (type=status):
    Format: "COORD-SYNC: [your-domain] — active: [N], done: [M], blocked: [list or none], idle builders: [list or none]"
  - MUST sync before: creating cross-domain dependencies, reassigning builders, or resolving shared file conflicts

  CONFLICT RESOLUTION:
  - Shared file needed by both domains → create a foundation task owned by one Coordinator
  - Builder idle in one domain, overloaded in other → sync before reassigning
  - Disagreement on approach → escalate to @operator

  COMPLETION:
  - Both Coordinators must confirm their domain is complete before sending mission-complete to @operator
  - Format: "COORD-FINAL: [domain] complete. [N] tasks done. Pending cross-domain: [list or none]"`
}
