// Swarm Role Guidance — per-layout behavioral matrices and structured handoff protocols.
// Consumed by swarm-prompts.ts to inject layout-specific behavior into each role's prompt.

// ─── Types ──────────────────────────────────────────────────

/** Swarm tier maps agent count to organizational complexity */
export type SwarmTier = 'duo' | 'squad' | 'team' | 'platoon' | 'battalion' | 'legion'

export interface RoleCounts {
  coordinators: number
  builders: number
  scouts: number
  reviewers: number
  analysts: number
  total: number
}

// ─── Tier Detection ─────────────────────────────────────────

export function getSwarmTier(agentCount: number): SwarmTier {
  if (agentCount <= 3) return 'duo'
  if (agentCount <= 5) return 'squad'
  if (agentCount <= 10) return 'team'
  if (agentCount <= 15) return 'platoon'
  if (agentCount <= 25) return 'battalion'
  return 'legion'
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

    case 'battalion':
      return `${base}
TASK STRATEGY:
- Create 20-30 fine tasks (10-15 min each)
- 2 Coordinators: split into two domains (e.g. frontend + backend)
- Each Coordinator owns ~10-15 tasks
- Use dependency chains within domains, sync points between domains

MULTI-COORDINATOR PROTOCOL:
- Domain split: Coordinator 1 = frontend/UI, Coordinator 2 = backend/infra
- Sync every 3 minutes via gs-mail
- Cross-domain tasks: owned by primary domain's Coordinator
- Merge strategy: each domain merges independently, integration test at end

SCOUT USAGE:
- 3-5 Scouts: deep specialization by domain and sub-domain
  * Scout A: frontend components, styles, UI patterns
  * Scout B: backend API, services, data models
  * Scout C: infrastructure, CI/CD, configuration
  * Scout D+: additional specializations as needed (auth, state management, etc.)
- Each Scout writes to their own file: FINDINGS-scout-N.md (knowledge/ directory)
- A consolidated FINDINGS.md index links to each Scout's section file

REVIEW PROCESS:
- 3 Reviewers: domain-split matching coordinator domains
  * Reviewer A: frontend domain
  * Reviewer B: backend domain
  * Reviewer C: cross-domain and infrastructure
- Route reviews to domain-appropriate Reviewer

BUILDER MANAGEMENT:
- ~6 builders per coordinator (within MAX_BUILDERS_PER_COORDINATOR=7)
- Lead Builder per domain coordinates peers
- Strict file ownership — zero overlap between domains`

    case 'legion':
      return `${base}
TASK STRATEGY:
- Create 30-45 fine tasks (10-15 min each)
- 3 Coordinators: triple domain split
- Coordinator 1: frontend/UI, Coordinator 2: backend/API, Coordinator 3: infra/testing
- Each Coordinator owns ~10-15 tasks

MULTI-COORDINATOR PROTOCOL:
- 3-way domain split with clear boundaries
- Sync every 2 minutes via gs-mail (higher cadence due to scale)
- Cross-domain dependencies require agreement from both domain Coordinators
- One Coordinator designated as "Lead Coordinator" for final integration

SCOUT USAGE:
- 5+ Scouts: exhaustive specialization
  * Scout A: frontend components, styles, client-side logic
  * Scout B: state management, hooks, client data layer
  * Scout C: backend API, routes, controllers
  * Scout D: data models, services, business logic
  * Scout E: infrastructure, testing, CI/CD, deployment
  * Scout F+: additional sub-domain experts as needed
- Each Scout writes to their own file: FINDINGS-scout-N.md (knowledge/ directory)
- A consolidated FINDINGS.md index links to each Scout's section file

REVIEW PROCESS:
- 4 Reviewers: dedicated reviewer per domain
  * Reviewer A: frontend/UI code
  * Reviewer B: state management and data layer
  * Reviewer C: backend API and services
  * Reviewer D: infrastructure and testing
- Cross-domain tasks: route to reviewer with primary domain expertise

BUILDER MANAGEMENT:
- ~6 builders per coordinator
- Lead Builder per domain coordinates peers
- Strict file ownership — zero overlap`
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

    case 'battalion':
      return `
LAYOUT ADAPTATION — BATTALION (${roleTotal} builders)
${leadSection}
YOUR SCOPE:
- Layer-scoped: strictly narrow file ownership within your Coordinator's domain
- Each task is highly focused (10-15 min of work)
- You operate under one of 2 Coordinators — follow YOUR Coordinator's direction only
- ~6 builders per coordinator — coordinate with your domain peers

WORK STYLE:
- Strictly scoped — do NOT deviate from assigned files
- Check dependency status before starting (deps must be status=done)
- Coordinate with Lead Builder in your domain on interface contracts
- Submit early, submit often — keep the review pipeline flowing
- If between tasks, check inbox and gs-task ready for new assignments
- Cross-domain changes require Coordinator approval — never modify files outside your domain`

    case 'legion':
      return `
LAYOUT ADAPTATION — LEGION (${roleTotal} builders)
${leadSection}
YOUR SCOPE:
- Layer-scoped: strictly narrow file ownership within your Coordinator's domain
- Each task is highly focused (10-15 min of work)
- You operate under one of 3 Coordinators — follow YOUR Coordinator's direction only
- ~6 builders per coordinator — coordinate with your domain peers

WORK STYLE:
- Strictly scoped — do NOT deviate from assigned files
- Check dependency status before starting (deps must be status=done)
- Coordinate with Lead Builder in your domain on interface contracts
- Submit early, submit often — keep the review pipeline flowing
- If between tasks, check inbox and gs-task ready for new assignments
- Cross-domain changes require Coordinator approval — never modify files outside your domain
- At this scale, strict discipline is critical — deviations cause cascading merge conflicts`
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
      : tier === 'legion'
        ? 'DEPTH: Exhaustive — detailed file mapping, pattern analysis, dependency graphs, risk assessment for your sub-domain'
        : tier === 'battalion'
          ? 'DEPTH: Deep specialization — thorough analysis of your sub-domain, detailed file mapping and risk zones'
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
- ${tier === 'duo' ? 'Quick recon: 3-5 minutes, then stand by' : tier === 'battalion' || tier === 'legion' ? 'Deep recon: 8-12 minutes — thoroughness critical at this scale, then stand by' : 'Full recon: 5-10 minutes, then stand by'}
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
    : reviewerTotal === 2
      ? roleIndex === 0
        ? 'DOMAIN: Frontend — UI components, styles, client-side code'
        : 'DOMAIN: Backend — API, services, server-side code, infrastructure'
      : reviewerTotal === 3
        ? roleIndex === 0
          ? 'DOMAIN: Frontend — UI components, styles, client-side code'
          : roleIndex === 1
            ? 'DOMAIN: Backend — API, services, server-side code'
            : 'DOMAIN: Cross-domain & Infrastructure — shared code, config, CI/CD'
        : roleIndex === 0
          ? 'DOMAIN: Frontend/UI — components, styles, client-side code'
          : roleIndex === 1
            ? 'DOMAIN: State & Data Layer — hooks, stores, client data flow'
            : roleIndex === 2
              ? 'DOMAIN: Backend API & Services — routes, controllers, business logic'
              : 'DOMAIN: Infrastructure & Testing — config, CI/CD, test suites'

  const queueStrategy = reviewerTotal === 1
    ? `QUEUE STRATEGY:
- Sequential review — process tasks in order received
- Priority: blocking tasks first (tasks that others depend on)
- If queue grows > 3 tasks, notify Coordinator to adjust velocity`
    : reviewerTotal <= 2
      ? `QUEUE STRATEGY:
- Domain-split review — you handle ${roleIndex === 0 ? 'frontend' : 'backend'} tasks
- Round-robin within your domain if multiple tasks arrive simultaneously
- If the other Reviewer is overloaded, Coordinator may route cross-domain tasks to you
- Approximate workload: ~50% of all reviews each`
      : `QUEUE STRATEGY:
- Domain-split review — you handle tasks in your assigned domain only
- Round-robin within your domain if multiple tasks arrive simultaneously
- If a peer Reviewer is overloaded, Coordinator may route tasks to you
- Approximate workload: ~${Math.round(100 / reviewerTotal)}% of all reviews each
- Cross-domain tasks: route to the reviewer whose domain is primary`

  const scaleNotes = tier === 'battalion'
    ? `
BATTALION SCALE NOTES:
- 3 Reviewers across 2 Coordinator domains — you may serve as cross-domain bridge
- Higher task volume: expect 7-10 reviews per session
- Prioritize blocking tasks that gate other Builders
- Coordinate with peer Reviewers via gs-mail to avoid duplicate reviews`
    : tier === 'legion'
      ? `
LEGION SCALE NOTES:
- 4 Reviewers across 3 Coordinator domains — each Reviewer owns a dedicated domain
- Highest task volume: expect 8-12 reviews per session
- Speed is critical — keep reviews to 3-4 minutes, focus on correctness over style
- Coordinate with peer Reviewers via gs-mail to avoid duplicate reviews
- Flag systemic issues to your domain's Coordinator rather than fixing per-task`
      : ''

  return `
LAYOUT ADAPTATION — ${tier.toUpperCase()} (${reviewerTotal} reviewer${reviewerTotal > 1 ? 's' : ''})

ASSIGNMENT: ${domainAssignment}

${queueStrategy}

REVIEW SPEED vs DEPTH:
- ${tier === 'duo' || tier === 'squad' ? 'Standard depth — thorough 7-point inspection for each task' : 'Balanced depth — focus on correctness and scope compliance, lighter on style'}
- ${reviewerTotal > 1 ? 'Coordinate with peer Reviewer to avoid reviewing the same task' : 'You are the sole quality gate — be thorough but fast'}
- Use \`git diff main -- [owned files]\` to review actual changes vs the base branch
- Target: complete each review in 3-5 minutes${scaleNotes}`
}

// ─── Analyst Layout Guidance ─────────────────────────────────

export function analystLayoutGuidance(
  tier: SwarmTier,
  roleIndex: number,
  roleTotal: number,
  isLead: boolean,
  counts: RoleCounts,
): string {
  switch (tier) {
    case 'duo':
    case 'squad':
      return `
LAYOUT ADAPTATION — ${tier.toUpperCase()} (${counts.total} agents, simple monitoring)

MONITORING SCOPE:
- Small swarm — lightweight monitoring only
- One progress report every 5 minutes
- Focus on: task creation delays, builder idle time, review backlog

REPORT CADENCE:
- Write a JSON report to reports/analyst/ every 5 minutes
- Keep reports brief — small swarms have limited coordination overhead
- Alert coordinator only for critical issues (stuck >10min, no tasks after 90s)

BOTTLENECK DETECTION:
- Builder idle with ready tasks? -> Alert coordinator
- Single reviewer backlog > 3 tasks? -> Flag as bottleneck
- No task creation after 90 seconds of launch? -> Alert coordinator
- Builder on same task > 10 minutes? -> Check if stuck`

    case 'team':
      return `
LAYOUT ADAPTATION — TEAM (${counts.total} agents, domain-aware monitoring)

MONITORING SCOPE:
- Track per-domain velocity (frontend vs backend if split)
- Monitor ${counts.builders} builders across task assignments
- Watch ${counts.reviewers} reviewer(s) queue depth

REPORT CADENCE:
- Write a JSON report to reports/analyst/ every 3-5 minutes
- Include domain-level velocity tracking
- Flag domain imbalances (one domain finishing faster than another)

BOTTLENECK DETECTION:
- Builder idle with ready tasks? -> Alert coordinator with specific task IDs
- Review backlog > 3 tasks? -> Suggest coordinator approve low-risk tasks directly
- Builder on same task > 10 minutes? -> Check heartbeat status
- File lock conflicts? -> Alert coordinator immediately
- Domain velocity skew > 40%? -> Suggest rebalancing builders
- No task creation after 90 seconds of launch? -> Alert coordinator`

    case 'platoon':
      return `
LAYOUT ADAPTATION — PLATOON (${counts.total} agents, multi-coordinator sync tracking)

MONITORING SCOPE:
- Track ${counts.coordinators} coordinators' domain progress independently
- Monitor cross-domain dependencies and sync timing
- Watch for coordinator sync gaps (>5 minutes without COORD-SYNC message)
- Track ${counts.builders} builders across ${counts.coordinators} domains

REPORT CADENCE:
- Write a JSON report to reports/analyst/ every 3 minutes
- Include per-coordinator domain velocity
- Track cross-domain dependency resolution time

BOTTLENECK DETECTION:
- Coordinator sync gap > 5 minutes? -> Alert both coordinators
- Cross-domain dependency stuck? -> Escalate to both coordinators
- Builder idle with ready tasks? -> Alert responsible coordinator
- Review backlog > 3 per reviewer? -> Flag capacity issue
- Builder on same task > 10 minutes? -> Check heartbeat and alert coordinator
- File lock conflicts? -> Alert both coordinators
- No task creation after 90 seconds? -> Alert coordinator`

    case 'battalion':
    case 'legion':
      return `
LAYOUT ADAPTATION — ${tier.toUpperCase()} (${counts.total} agents, full-scale monitoring)

MONITORING SCOPE:
- Track ${counts.coordinators} coordinators' domain progress
- Monitor cross-domain dependencies and sync cadence
- Watch coordinator sync gaps (>3 minutes without COORD-SYNC)
- Track ${counts.builders} builders across ${counts.coordinators} domains
- Monitor ${counts.reviewers} reviewers' queue balance

REPORT CADENCE:
- Write a JSON report to reports/analyst/ every 2-3 minutes (higher cadence at scale)
- Include per-coordinator domain velocity and builder utilization
- Track cross-domain dependency resolution time
- Include system resource observations if available

BOTTLENECK DETECTION:
- Coordinator sync gap > 3 minutes? -> Alert all coordinators
- Cross-domain dependency stuck > 5 minutes? -> Escalate to all coordinators
- Builder idle with ready tasks? -> Alert responsible coordinator with task IDs
- Review backlog > 3 per reviewer? -> Flag capacity issue, suggest redistribution
- Builder on same task > 10 minutes? -> Check heartbeat, alert coordinator
- File lock conflicts? -> Alert all coordinators
- Domain velocity skew > 30%? -> Suggest builder rebalancing
- Multiple builders blocked on same dependency? -> Priority escalation
- No task creation after 90 seconds? -> Alert coordinators`
  }
}

// ─── Handoff Protocols (Structured Templates) ──────────────
//
// Each handoff type has:
// 1. REQUIRED FIELDS — must be present in every handoff message
// 2. TEMPLATE — structured body format with field placeholders
// 3. AUTO-POPULATE — fields that can be read from task-graph.json
// 4. VALIDATION — agents should verify all required fields before sending

/**
 * Defines how Scouts deliver findings to Builders.
 * Machine-followable: numbered steps with exact commands.
 */
export function scoutToBuilderHandoff(
  swarmRoot: string,
  coordinator: string = '<Coordinator>',
): string {
  return `
HANDOFF PROTOCOL: Scout -> Builder (Findings Delivery)

  REQUIRED FIELDS (scout completion report):
  - findingsFile: path to the findings file written
  - criticalFiles: count of critical files identified
  - riskZones: count of risk zones flagged
  - domain: the domain covered (or "full codebase")
  - status: "complete" | "partial"

  TEMPLATE (use this exact structure for the handoff message):
    node ${swarmRoot}/bin/gs-mail.cjs send --to "${coordinator}" --type worker_done --body "SCOUT HANDOFF
    findingsFile: [path to FINDINGS file]
    criticalFiles: [N]
    riskZones: [M]
    domain: [frontend|backend|infrastructure|full codebase]
    status: complete
    summary: [1-2 sentence overview of key findings]
    Standing by for Builder questions."

  AUTO-POPULATE: No task-graph fields needed — Scout handoffs are knowledge-based.

  VALIDATION: Before sending, verify:
  - FINDINGS file exists and is non-empty
  - All sections populated: Tech Stack, Code Patterns, Critical Files, Risks
  - File paths and line numbers are accurate (spot-check 2-3)

  SCOUT SIDE (after completing reconnaissance):
  1. Write findings to your section file:
     - Single scout:  ${swarmRoot}/knowledge/FINDINGS.md (write directly)
     - Multi-scout:   ${swarmRoot}/knowledge/FINDINGS-scout-N.md (your pre-created section file)
     - Use structured format: Tech Stack, Code Patterns, Critical Files, Risks, Testing
     - Include file paths, line numbers, and concrete examples
     - Do NOT overwrite FINDINGS.md in multi-scout swarms — it is a consolidated index
  2. Send structured completion report using the TEMPLATE above
  3. Enter standby: the system injects inbox checks when messages arrive. You may also check manually.

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
export function builderToReviewerHandoff(
  swarmRoot: string,
  coordinator: string = '<Coordinator>',
): string {
  return `
HANDOFF PROTOCOL: Builder -> Reviewer (Review Submission)

  REQUIRED FIELDS (builder completion report):
  - taskId: the task identifier (e.g., t1)
  - files: comma-separated list of modified files
  - summary: what was implemented (1-2 sentences)
  - tests: pass | fail | not_run
  - acceptanceCriteria: met | partial (list unmet)
  - blockers: none | [description]

  TEMPLATE (use this exact structure for the handoff message):
    node ${swarmRoot}/bin/gs-mail.cjs send --to "${coordinator}" --type worker_done --body "BUILDER HANDOFF
    taskId: [id]
    files: [file1, file2, ...]
    summary: [what was implemented]
    tests: [pass|fail|not_run]
    acceptanceCriteria: met
    blockers: none" --meta '{"taskId":"[id]","files":["file1","file2"]}'

  AUTO-POPULATE from task-graph: Before sending, run:
    node ${swarmRoot}/bin/gs-task.cjs get <taskId>
  This returns the task's ownedFiles, acceptanceCriteria, and dependsOn.
  Use these to populate the files and acceptanceCriteria fields.

  VALIDATION: Before sending, verify ALL required fields are present:
  - taskId matches your assigned task
  - files lists every file you modified (and only owned files)
  - tests field reflects actual test run results
  - acceptanceCriteria checked against task definition
  - If any field is missing, the handoff is INCOMPLETE — do not send

  BUILDER SIDE (when implementation is complete):
  1. Self-validate: re-read all changed files, verify acceptance criteria
  2. Run available checks (tests, lint, build) — all must pass
  3. Commit your work:
     git add [owned files]
     git commit -m "swarm: <taskId> — <brief description>"
  4. Update task status (auto-notifies Coordinator):
     node ${swarmRoot}/bin/gs-task.cjs update <taskId> --status review
  5. Send structured completion report using the TEMPLATE above
  6. Wait for review feedback — check inbox every 30s

  COORDINATOR SIDE (routes review):
  1. Assign Reviewer:
     node ${swarmRoot}/bin/gs-task.cjs update <taskId> --reviewer "<Reviewer>"
  2. Send review request with task metadata:
     node ${swarmRoot}/bin/gs-mail.cjs send --to "<Reviewer>" --type review_request --body "REVIEW REQUEST
     taskId: [id]
     title: [task title]
     files: [file1, file2]
     builder: [Builder name]
     acceptanceCriteria: [criteria from task-graph]
     branch: [builder's branch name]" --meta '{"taskId":"[id]","files":["file1"],"builder":"[name]"}'`
}

/**
 * Defines how Reviewers send feedback and re-reviews work.
 * Machine-followable: numbered steps with exact commands.
 */
export function reviewerToBuilderHandoff(
  swarmRoot: string,
  coordinator: string = '<Coordinator>',
): string {
  return `
HANDOFF PROTOCOL: Reviewer -> Builder (Review Feedback)

  REQUIRED FIELDS (review verdict):
  - taskId: the task identifier
  - verdict: approved | changes_requested | approved_with_notes
  - issueCount: number of issues found (0 if approved)
  - issues: list of issues in file:line format (if changes_requested)
  - summary: 1-sentence review summary

  TEMPLATE — APPROVED:
    node ${swarmRoot}/bin/gs-mail.cjs send --to "${coordinator}" --type review_complete --body "REVIEW VERDICT
    taskId: [id]
    verdict: approved
    issueCount: 0
    summary: [1-sentence approval note]" --meta '{"taskId":"[id]","verdict":"approved"}'

  TEMPLATE — CHANGES_REQUESTED:
    node ${swarmRoot}/bin/gs-mail.cjs send --to "<Builder>" --type review_feedback --body "REVIEW VERDICT
    taskId: [id]
    verdict: changes_requested
    issueCount: [N]
    issues:
    HIGH: [file]:[line] — [issue and fix]
    MEDIUM: [file]:[line] — [issue and suggestion]
    LOW: [file]:[line] — [optional improvement]
    summary: [1-sentence summary of what needs fixing]" --meta '{"taskId":"[id]","verdict":"changes_requested","issueCount":[N]}'

  AUTO-POPULATE from task-graph: Before reviewing, run:
    node ${swarmRoot}/bin/gs-task.cjs get <taskId>
  This returns the task's ownedFiles, acceptanceCriteria, and description.
  Use acceptanceCriteria as your checklist for the review.

  VALIDATION: Before sending verdict:
  - taskId matches the task under review
  - verdict is one of: approved, changes_requested, approved_with_notes
  - If changes_requested: at least 1 issue listed with file:line format
  - If approved: issueCount must be 0
  - summary is factual and actionable

  REVIEWER SIDE (after completing review):
  IF APPROVED:
    1. Record verdict:
       node ${swarmRoot}/bin/gs-task.cjs update <taskId> --verdict approved
    2. Send structured verdict to Coordinator using APPROVED TEMPLATE
    3. Coordinator marks task done:
       node ${swarmRoot}/bin/gs-task.cjs update <taskId> --status done

  IF CHANGES_REQUESTED:
    1. Record verdict:
       node ${swarmRoot}/bin/gs-task.cjs update <taskId> --verdict changes_requested
    2. Send structured feedback to Builder using CHANGES_REQUESTED TEMPLATE
    3. Notify Coordinator:
       node ${swarmRoot}/bin/gs-mail.cjs send --to "${coordinator}" --type review_feedback --body "Task <taskId>: CHANGES_REQUESTED. [N] issues." --meta '{"taskId":"[id]","verdict":"changes_requested"}'

  BUILDER SIDE (after receiving feedback):
    1. Read feedback — address every HIGH and MEDIUM issue
    2. Fix issues in owned files
    3. Re-run checks (tests, lint, build)
    4. Re-submit using BUILDER HANDOFF template:
       node ${swarmRoot}/bin/gs-task.cjs update <taskId> --status review
       node ${swarmRoot}/bin/gs-mail.cjs send --to "<Reviewer>" --type message --body "RESUBMISSION
       taskId: [id]
       fixedIssues: [N] of [total]
       summary: [what was fixed]"

  REVIEWER SIDE (re-review):
    1. Focus only on previously flagged issues + quick scan for new regressions
    2. If all fixed → APPROVED
    3. If issues remain → CHANGES_REQUESTED again (be specific)`
}

/**
 * Defines multi-coordinator sync protocol for PLATOON+ tiers (platoon, battalion, legion).
 * Only injected when coordinatorCount >= 2.
 */
export function coordinatorSyncProtocol(): string {
  return `
MULTI-COORDINATOR SYNC PROTOCOL

  REQUIRED FIELDS (sync message):
  - domain: the coordinator's domain name
  - activeTasks: count of in-progress tasks
  - doneTasks: count of completed tasks
  - blockers: list of blocked tasks or "none"
  - idleBuilders: list of idle builder names or "none"

  TEMPLATE (use this exact structure for sync messages):
    node <swarmRoot>/bin/gs-mail.cjs send --to "<Other Coordinator>" --type status --body "COORD-SYNC
    domain: [frontend|backend|infrastructure]
    activeTasks: [N]
    doneTasks: [M]
    blockers: [task IDs or none]
    idleBuilders: [builder names or none]
    crossDomainDeps: [pending cross-domain task IDs or none]"

  COMPLETION TEMPLATE:
    node <swarmRoot>/bin/gs-mail.cjs send --to "<Other Coordinator>" --type status --body "COORD-FINAL
    domain: [domain name]
    totalDone: [N]
    pendingCrossDomain: [task IDs or none]
    status: complete"

  AUTO-POPULATE: Run these commands to gather sync data:
    node <swarmRoot>/bin/gs-task.cjs list --status building    (active tasks)
    node <swarmRoot>/bin/gs-task.cjs list --status done         (completed tasks)
    node <swarmRoot>/bin/gs-task.cjs ready                     (unassigned ready tasks)

  VALIDATION: Before sending sync:
  - All numeric fields are actual counts (not estimates)
  - Blocker list references real task IDs
  - Idle builder names match actual roster

  DOMAIN OWNERSHIP:
  - At swarm startup, agree on domain split via gs-mail:
    * Coordinator 1: frontend domain (UI, components, styles, client logic)
    * Coordinator 2: backend domain (API, services, data, infrastructure)
  - Each Coordinator exclusively manages tasks in their domain
  - Cross-domain tasks: owned by the Coordinator whose domain is primary

  SYNC CADENCE:
  - Exchange status every 3 minutes using the TEMPLATE above
  - MUST sync before: creating cross-domain dependencies, reassigning builders, or resolving shared file conflicts

  CONFLICT RESOLUTION:
  - Shared file needed by both domains → create a foundation task owned by one Coordinator
  - Builder idle in one domain, overloaded in other → sync before reassigning
  - Disagreement on approach → escalate to @operator

  COMPLETION:
  - Both Coordinators must confirm their domain is complete using COMPLETION TEMPLATE
  - Only after all Coordinators confirm → send mission-complete to @operator`
}
