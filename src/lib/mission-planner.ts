import type { Provider } from './types'
import { useSettingsStore } from '../stores/settingsStore'

export interface MissionTask {
  id: string
  title: string
  description: string
  estimatedMinutes: number
  complexity: 'low' | 'medium' | 'high'
  suggestedRole: 'coordinator' | 'builder' | 'scout' | 'reviewer'
  likelyFiles: string[]
  dependencies: string[]
}

export interface MissionAnalysis {
  tasks: MissionTask[]
  suggestedComposition: Record<string, number>
  riskAssessment: string[]
  estimatedDuration: string
  affectedModules: string[]
  source?: 'cli' | 'fallback'
}

export type MissionPlannerStatus = 'idle' | 'analyzing' | 'done' | 'error' | 'skipped'

const ANALYSIS_TIMEOUT_MS = 300_000
const GHOSTSWARM_DIR = '.ghostswarm'
const PROMPT_FILENAME = 'mission-prompt.md'

function buildAnalysisPrompt(mission: string, directory: string, codebaseContext?: string): string {
  const missionTrunc = mission.slice(0, 2000)
  const contextBlock = codebaseContext
    ? `\nCodebase:\n${codebaseContext.slice(0, 1500)}\n`
    : ''

  return `Analyze this coding mission. Output ONLY a fenced JSON block, nothing else.

Mission: ${missionTrunc}
Directory: ${directory}
${contextBlock}
Respond with EXACTLY this JSON structure:

\`\`\`json
{
  "tasks": [
    {
      "id": "task-1",
      "title": "short task title",
      "description": "what needs to be done",
      "estimatedMinutes": 10,
      "complexity": "low|medium|high",
      "suggestedRole": "coordinator|builder|scout|reviewer",
      "likelyFiles": ["src/file.ts"],
      "dependencies": []
    }
  ],
  "suggestedComposition": { "coordinator": 1, "builder": 2, "scout": 1, "reviewer": 1 },
  "riskAssessment": ["risk 1", "risk 2"],
  "estimatedDuration": "30-45 minutes",
  "affectedModules": ["src/lib", "src/components"]
}
\`\`\`

IMPORTANT: Output ONLY the fenced JSON block above. No explanation, no preamble, no follow-up.`
}

function extractJsonFromOutput(output: string): MissionAnalysis | null {
  const fencedMatch = output.match(/```json\s*([\s\S]*?)```/)
  if (fencedMatch) {
    try {
      const parsed = JSON.parse(fencedMatch[1].trim())
      if (validateAnalysis(parsed)) return parsed as MissionAnalysis
    } catch {
      // try the next strategy
    }
  }

  const braceStart = output.indexOf('{"tasks"')
  if (braceStart !== -1) {
    let depth = 0
    for (let i = braceStart; i < output.length; i++) {
      if (output[i] === '{') depth++
      if (output[i] === '}') {
        depth--
        if (depth === 0) {
          try {
            const parsed = JSON.parse(output.slice(braceStart, i + 1))
            if (validateAnalysis(parsed)) return parsed as MissionAnalysis
          } catch {
            // try the next strategy
          }
          break
        }
      }
    }
  }

  const firstBrace = output.indexOf('{')
  if (firstBrace !== -1) {
    let depth = 0
    for (let i = firstBrace; i < output.length; i++) {
      if (output[i] === '{') depth++
      if (output[i] === '}') {
        depth--
        if (depth === 0) {
          try {
            const parsed = JSON.parse(output.slice(firstBrace, i + 1))
            if (validateAnalysis(parsed)) return parsed as MissionAnalysis
          } catch {
            // no valid JSON found
          }
          break
        }
      }
    }
  }

  return null
}

function validateAnalysis(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false
  const analysis = obj as Record<string, unknown>
  if (!Array.isArray(analysis.tasks) || analysis.tasks.length === 0) return false
  const firstTask = analysis.tasks[0] as Record<string, unknown>
  return typeof firstTask.id === 'string' && typeof firstTask.title === 'string'
}

function sanitizeAnalysis(raw: MissionAnalysis): MissionAnalysis {
  const validComplexity = new Set(['low', 'medium', 'high'])
  const validRoles = new Set(['coordinator', 'builder', 'scout', 'reviewer'])

  return {
    tasks: raw.tasks.map((task, index) => ({
      id: typeof task.id === 'string' ? task.id : `task-${index + 1}`,
      title: typeof task.title === 'string' ? task.title : `Task ${index + 1}`,
      description: typeof task.description === 'string' ? task.description : '',
      estimatedMinutes: typeof task.estimatedMinutes === 'number' ? task.estimatedMinutes : 15,
      complexity: validComplexity.has(task.complexity) ? task.complexity : 'medium',
      suggestedRole: validRoles.has(task.suggestedRole)
        ? task.suggestedRole as MissionTask['suggestedRole']
        : 'builder',
      likelyFiles: Array.isArray(task.likelyFiles)
        ? task.likelyFiles.filter((file): file is string => typeof file === 'string')
        : [],
      dependencies: Array.isArray(task.dependencies)
        ? task.dependencies.filter((dep): dep is string => typeof dep === 'string')
        : [],
    })),
    suggestedComposition:
      typeof raw.suggestedComposition === 'object' && raw.suggestedComposition
        ? raw.suggestedComposition
        : { coordinator: 1, builder: 2, scout: 1, reviewer: 1 },
    riskAssessment: Array.isArray(raw.riskAssessment)
      ? raw.riskAssessment.filter((risk): risk is string => typeof risk === 'string')
      : [],
    estimatedDuration: typeof raw.estimatedDuration === 'string' ? raw.estimatedDuration : 'Unknown',
    affectedModules: Array.isArray(raw.affectedModules)
      ? raw.affectedModules.filter((modulePath): modulePath is string => typeof modulePath === 'string')
      : [],
    source: raw.source === 'fallback' ? 'fallback' : 'cli',
  }
}

function isWindows(): boolean {
  return navigator.userAgent.includes('Windows') || navigator.platform === 'Win32'
}

function stripAnsi(str: string): string {
  return str
    .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1B\][^\x07]*\x07/g, '')
    .replace(/\x1B[()][A-Z0-9]/g, '')
    .replace(/\r/g, '')
}

function getConfiguredCliCommand(provider: Provider): string {
  const settings = useSettingsStore.getState()
  if (provider === 'gemini') return settings.geminiCliPath.trim() || 'gemini'
  if (provider === 'codex') return settings.codexCliPath.trim() || 'codex'
  return settings.claudeCliPath.trim() || 'claude'
}

function quotePowerShellLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function quoteShellLiteral(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

function buildPromptCommand(promptAbsPath: string, cliCommand: string): string {
  if (isWindows()) {
    const npmGlobalBin = '$env:APPDATA + "\\npm"'
    return `if (-not ($env:PATH -like "*npm*")) { $env:PATH = ${npmGlobalBin} + ";" + $env:PATH }; $p = Get-Content -Raw ${quotePowerShellLiteral(promptAbsPath)}; & ${quotePowerShellLiteral(cliCommand)} -p "$p"`
  }

  return `${quoteShellLiteral(cliCommand)} -p "$(cat ${quoteShellLiteral(promptAbsPath)})"`
}

function normalizeMissionText(mission: string): string {
  return mission
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function inferMissionKind(mission: string): 'analysis' | 'bugfix' | 'refactor' | 'testing' | 'docs' | 'feature' {
  const text = normalizeMissionText(mission)
  if (/(bug|fix|error|falla|fallo|arregl|romp|no funciona|broken|issue|problema)/.test(text)) return 'bugfix'
  if (/(refactor|reorgan|cleanup|clean up|restruct|simplif|modular)/.test(text)) return 'refactor'
  if (/(test|prueba|coverage|regression|qa|valida)/.test(text)) return 'testing'
  if (/(doc|document|readme|guia|guide|manual)/.test(text)) return 'docs'
  if (/(analiz|analysis|plan|arquitect|swarm|coordina|rol|layout|mission)/.test(text)) return 'analysis'
  return 'feature'
}

function uniqueStrings(items: string[], limit = 6): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of items) {
    const trimmed = item.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
    if (result.length >= limit) break
  }
  return result
}

function inferAffectedModules(mission: string, codebaseContext?: string): string[] {
  const text = normalizeMissionText(`${mission}\n${codebaseContext || ''}`)
  const modules: string[] = []

  if (/(swarm|agent|coordinator|builder|reviewer|scout|layout)/.test(text)) {
    modules.push('src/components/swarm', 'src/lib/swarm-orchestrator.ts', 'src/stores/swarmStore.ts')
  }
  if (/(ui|ux|wizard|pantalla|vista|interfaz|frontend)/.test(text)) {
    modules.push('src/components', 'src/components/swarm/SwarmWizard.tsx')
  }
  if (/(terminal|pty|shell|cli|claude|gemini|codex)/.test(text)) {
    modules.push('src/lib/mission-planner.ts', 'src/hooks/usePty.ts', 'electron/pty-manager.ts')
  }
  if (/(config|setting|ajuste|configuracion)/.test(text)) {
    modules.push('src/components/settings', 'src/stores/settingsStore.ts')
  }
  if (/(test|prueba|coverage|regression|qa)/.test(text)) {
    modules.push('src/lib/__tests__')
  }

  const pathMatches = (codebaseContext || '').match(/\b(?:src|electron|scripts|tests?|docs)(?:[\\/][\w.-]+)+/g) || []
  modules.push(...pathMatches.map((match) => match.replace(/\\/g, '/')))

  if (modules.length === 0) {
    modules.push('src/components', 'src/lib', 'src/stores')
  }

  return uniqueStrings(modules, 6)
}

function estimateDuration(tasks: MissionTask[]): string {
  const totalMinutes = tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0)
  const low = Math.max(15, Math.round(totalMinutes * 0.85))
  const high = Math.max(low + 10, Math.round(totalMinutes * 1.2))
  return `${low}-${high} minutes`
}

function estimateComposition(
  tasks: MissionTask[],
  kind: ReturnType<typeof inferMissionKind>,
): Record<string, number> {
  const counts = tasks.reduce<Record<string, number>>((acc, task) => {
    acc[task.suggestedRole] = (acc[task.suggestedRole] || 0) + 1
    return acc
  }, {})

  const builderBase =
    kind === 'feature' || kind === 'refactor'
      ? 2
      : 1

  return {
    coordinator: Math.max(1, counts.coordinator || (kind === 'analysis' ? 1 : 0)),
    builder: Math.max(builderBase, counts.builder || 0),
    scout: Math.max(kind === 'analysis' || kind === 'bugfix' ? 1 : 0, counts.scout || 0),
    reviewer: Math.max(1, counts.reviewer || 0),
  }
}

function buildFallbackTasks(
  mission: string,
  affectedModules: string[],
  kind: ReturnType<typeof inferMissionKind>,
): MissionTask[] {
  const primaryFiles = affectedModules.slice(0, 3)
  const testingFiles = affectedModules.some((item) => item.includes('__tests__'))
    ? affectedModules.filter((item) => item.includes('__tests__')).slice(0, 2)
    : ['src/lib/__tests__']

  if (kind === 'bugfix') {
    return [
      {
        id: 'task-1',
        title: 'Reproduce and isolate the failure',
        description: `Capture the current broken path for: ${mission}`,
        estimatedMinutes: 15,
        complexity: 'medium',
        suggestedRole: 'scout',
        likelyFiles: primaryFiles,
        dependencies: [],
      },
      {
        id: 'task-2',
        title: 'Implement the focused fix',
        description: 'Apply the smallest change that resolves the failure without widening scope.',
        estimatedMinutes: 30,
        complexity: 'high',
        suggestedRole: 'builder',
        likelyFiles: primaryFiles,
        dependencies: ['task-1'],
      },
      {
        id: 'task-3',
        title: 'Add regression coverage',
        description: 'Protect the failure mode with tests or deterministic validation steps.',
        estimatedMinutes: 20,
        complexity: 'medium',
        suggestedRole: 'builder',
        likelyFiles: testingFiles,
        dependencies: ['task-2'],
      },
      {
        id: 'task-4',
        title: 'Review risk and edge cases',
        description: 'Verify the fix does not break adjacent flows or agent coordination.',
        estimatedMinutes: 15,
        complexity: 'medium',
        suggestedRole: 'reviewer',
        likelyFiles: uniqueStrings([...primaryFiles, ...testingFiles], 4),
        dependencies: ['task-3'],
      },
    ]
  }

  if (kind === 'refactor') {
    return [
      {
        id: 'task-1',
        title: 'Map the current flow and coupling',
        description: `Identify the hotspots and ownership boundaries involved in: ${mission}`,
        estimatedMinutes: 20,
        complexity: 'medium',
        suggestedRole: 'scout',
        likelyFiles: primaryFiles,
        dependencies: [],
      },
      {
        id: 'task-2',
        title: 'Define target boundaries and responsibilities',
        description: 'Decide which modules keep orchestration, execution, and review responsibilities.',
        estimatedMinutes: 20,
        complexity: 'high',
        suggestedRole: 'coordinator',
        likelyFiles: primaryFiles,
        dependencies: ['task-1'],
      },
      {
        id: 'task-3',
        title: 'Refactor the main implementation slice',
        description: 'Move logic into clearer boundaries without changing user-facing behavior.',
        estimatedMinutes: 35,
        complexity: 'high',
        suggestedRole: 'builder',
        likelyFiles: primaryFiles,
        dependencies: ['task-2'],
      },
      {
        id: 'task-4',
        title: 'Validate integration and regressions',
        description: 'Check that the new structure still satisfies existing flows and tests.',
        estimatedMinutes: 20,
        complexity: 'medium',
        suggestedRole: 'reviewer',
        likelyFiles: uniqueStrings([...primaryFiles, ...testingFiles], 4),
        dependencies: ['task-3'],
      },
    ]
  }

  if (kind === 'testing') {
    return [
      {
        id: 'task-1',
        title: 'Identify critical scenarios to validate',
        description: `Translate the mission into deterministic success and failure cases: ${mission}`,
        estimatedMinutes: 15,
        complexity: 'medium',
        suggestedRole: 'scout',
        likelyFiles: primaryFiles,
        dependencies: [],
      },
      {
        id: 'task-2',
        title: 'Add or update automated coverage',
        description: 'Implement the missing regression or integration tests.',
        estimatedMinutes: 30,
        complexity: 'medium',
        suggestedRole: 'builder',
        likelyFiles: testingFiles,
        dependencies: ['task-1'],
      },
      {
        id: 'task-3',
        title: 'Review signal quality and flaky paths',
        description: 'Check that the new validation actually catches regressions and remains stable.',
        estimatedMinutes: 15,
        complexity: 'medium',
        suggestedRole: 'reviewer',
        likelyFiles: uniqueStrings([...testingFiles, ...primaryFiles], 4),
        dependencies: ['task-2'],
      },
    ]
  }

  if (kind === 'docs') {
    return [
      {
        id: 'task-1',
        title: 'Collect the current implementation facts',
        description: `Gather the workflow details that must be documented for: ${mission}`,
        estimatedMinutes: 15,
        complexity: 'low',
        suggestedRole: 'scout',
        likelyFiles: primaryFiles,
        dependencies: [],
      },
      {
        id: 'task-2',
        title: 'Draft the updated operating guide',
        description: 'Write the clarified steps, roles, and expected outcomes.',
        estimatedMinutes: 20,
        complexity: 'medium',
        suggestedRole: 'builder',
        likelyFiles: uniqueStrings(['docs', ...primaryFiles], 3),
        dependencies: ['task-1'],
      },
      {
        id: 'task-3',
        title: 'Review completeness and ambiguity',
        description: 'Ensure the guide removes ambiguity for operators and agents.',
        estimatedMinutes: 10,
        complexity: 'low',
        suggestedRole: 'reviewer',
        likelyFiles: uniqueStrings(['docs', ...primaryFiles], 3),
        dependencies: ['task-2'],
      },
    ]
  }

  if (kind === 'analysis') {
    return [
      {
        id: 'task-1',
        title: 'Inspect the current mission-to-execution flow',
        description: `Map how the current system handles: ${mission}`,
        estimatedMinutes: 20,
        complexity: 'medium',
        suggestedRole: 'scout',
        likelyFiles: primaryFiles,
        dependencies: [],
      },
      {
        id: 'task-2',
        title: 'Define roles, boundaries, and handoff rules',
        description: 'Clarify who decides, who builds, who reviews, and how agents communicate without overlap.',
        estimatedMinutes: 25,
        complexity: 'high',
        suggestedRole: 'coordinator',
        likelyFiles: primaryFiles,
        dependencies: ['task-1'],
      },
      {
        id: 'task-3',
        title: 'Implement the configuration and orchestration adjustments',
        description: 'Apply the minimal code changes needed to make the new flow executable.',
        estimatedMinutes: 35,
        complexity: 'high',
        suggestedRole: 'builder',
        likelyFiles: primaryFiles,
        dependencies: ['task-2'],
      },
      {
        id: 'task-4',
        title: 'Validate behavior and coordination risks',
        description: 'Check for race conditions, duplicated responsibility, and missing review gates.',
        estimatedMinutes: 20,
        complexity: 'medium',
        suggestedRole: 'reviewer',
        likelyFiles: uniqueStrings([...primaryFiles, ...testingFiles], 4),
        dependencies: ['task-3'],
      },
    ]
  }

  return [
    {
      id: 'task-1',
      title: 'Define the implementation slice',
      description: `Break down the requested outcome into the smallest deliverable slice for: ${mission}`,
      estimatedMinutes: 15,
      complexity: 'medium',
      suggestedRole: 'coordinator',
      likelyFiles: primaryFiles,
      dependencies: [],
    },
    {
      id: 'task-2',
      title: 'Implement the core changes',
      description: 'Build the main functional path and preserve existing conventions.',
      estimatedMinutes: 35,
      complexity: 'high',
      suggestedRole: 'builder',
      likelyFiles: primaryFiles,
      dependencies: ['task-1'],
    },
    {
      id: 'task-3',
      title: 'Validate integration and finishing quality',
      description: 'Review the flow, confirm edge cases, and add missing validation.',
      estimatedMinutes: 20,
      complexity: 'medium',
      suggestedRole: 'reviewer',
      likelyFiles: uniqueStrings([...primaryFiles, ...testingFiles], 4),
      dependencies: ['task-2'],
    },
  ]
}

function buildFallbackAnalysis(
  mission: string,
  directory: string,
  codebaseContext?: string,
): MissionAnalysis {
  const kind = inferMissionKind(mission)
  const affectedModules = inferAffectedModules(mission, codebaseContext)
  const tasks = buildFallbackTasks(mission, affectedModules, kind)
  const normalizedMission = normalizeMissionText(mission)

  return sanitizeAnalysis({
    tasks,
    suggestedComposition: estimateComposition(tasks, kind),
    riskAssessment: uniqueStrings([
      kind === 'bugfix'
        ? 'The visible failure may be a symptom of a deeper coordination or state issue.'
        : 'Cross-module changes can blur ownership unless responsibilities stay explicit.',
      /(swarm|agent|coordinator|builder|reviewer|scout)/.test(normalizedMission)
        ? 'Agent role overlap can create duplicated work, conflicting edits, or missing review handoffs.'
        : 'Changes may affect neighboring flows if boundaries are not verified end to end.',
      /(claude|cli|terminal|pty)/.test(normalizedMission)
        ? 'CLI invocation differences between environments can break automation even when the UI path looks correct.'
        : 'Missing regression coverage can allow the same issue to return later.',
      `Fallback analysis was generated locally for ${directory}.`,
    ], 4),
    estimatedDuration: estimateDuration(tasks),
    affectedModules,
    source: 'fallback',
  })
}

export interface AnalyzeResult {
  analysis: MissionAnalysis | null
  error?: string
}

export async function analyzeMission(
  mission: string,
  directory: string,
  codebaseContext?: string,
  provider?: Provider,
  onStatus?: (status: MissionPlannerStatus) => void,
): Promise<AnalyzeResult> {
  const ptyId = `mission-planner-${Date.now()}`
  const effectiveProvider: Provider = provider || 'claude'
  const configuredCliCommand = getConfiguredCliCommand(effectiveProvider)
  let cleanupData: (() => void) | undefined
  let cleanupExit: (() => void) | undefined
  let outputBuffer = ''
  let resolved = false
  const startTime = Date.now()

  onStatus?.('analyzing')

  const fallback = (errorDetail?: string): AnalyzeResult => ({
    analysis: buildFallbackAnalysis(mission, directory, codebaseContext),
    error: errorDetail,
  })

  const ghostswarmDir = `${directory}/${GHOSTSWARM_DIR}`.replace(/\\/g, '/')
  const promptFilePath = `${ghostswarmDir}/${PROMPT_FILENAME}`

  try {
    const dirResult = await window.ghostshell.fsCreateDir(ghostswarmDir)
    if (dirResult && typeof dirResult === 'object' && 'success' in dirResult && !dirResult.success) {
      console.warn('[MissionPlanner] Could not create .ghostswarm:', dirResult.error)
    }
  } catch {
    // Best effort only.
  }

  const prompt = buildAnalysisPrompt(mission, directory, codebaseContext)

  try {
    const fileResult = await window.ghostshell.fsCreateFile(promptFilePath, prompt)
    if (fileResult && typeof fileResult === 'object' && 'success' in fileResult && !fileResult.success) {
      onStatus?.('done')
      return fallback(`No se pudo escribir archivo de prompt: ${fileResult.error || 'Error desconocido'}`)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[MissionPlanner] No se pudo escribir el archivo de prompt:', msg)
    onStatus?.('done')
    return fallback(`No se pudo escribir archivo de prompt: ${msg}`)
  }

  try {
    const cliStatus = await window.ghostshell.cliGetVersion?.(configuredCliCommand)
    if (cliStatus && !cliStatus.installed) {
      onStatus?.('done')
      return fallback(`CLI no disponible para ${effectiveProvider}: ${configuredCliCommand}`)
    }
  } catch {
    // Let the PTY attempt continue.
  }

  return new Promise<AnalyzeResult>((resolve) => {
    const finish = (result: MissionAnalysis | null, status: MissionPlannerStatus, errorDetail?: string) => {
      if (resolved) return
      resolved = true
      try { cleanupData?.() } catch {}
      try { cleanupExit?.() } catch {}
      try { window.ghostshell.ptyKill(ptyId) } catch {}
      try { void window.ghostshell.fsDelete?.(promptFilePath) } catch {}

      if (errorDetail) {
        console.warn('[MissionPlanner]', errorDetail)
      }

      onStatus?.(status)
      resolve({ analysis: result, error: errorDetail })
    }

    const timeoutHandle = setTimeout(() => {
      const elapsed = Math.round((Date.now() - startTime) / 1000)
      const timeoutFallback = fallback(
        `Timeout tras ${elapsed}s esperando respuesta del CLI (limite: ${ANALYSIS_TIMEOUT_MS / 1000}s)`,
      )
      finish(timeoutFallback.analysis, 'done', timeoutFallback.error)
    }, ANALYSIS_TIMEOUT_MS)

    const finishWithCleanup = (result: MissionAnalysis | null, status: MissionPlannerStatus, errorDetail?: string) => {
      clearTimeout(timeoutHandle)
      finish(result, status, errorDetail)
    }

    const cliPromptCommand = buildPromptCommand(promptFilePath, configuredCliCommand)

    const npmGlobalBin = isWindows()
      ? `${(typeof process !== 'undefined' ? process.env?.APPDATA : '') || 'C:\\Users\\' + (typeof process !== 'undefined' ? process.env?.USERNAME : 'user') + '\\AppData\\Roaming'}\\npm`
      : ''
    const extraEnv: Record<string, string> = {}
    if (npmGlobalBin) {
      extraEnv.PATH = `${npmGlobalBin};${typeof process !== 'undefined' ? process.env?.PATH || '' : ''}`
    }

    void window.ghostshell.ptyCreate({
      id: ptyId,
      cwd: directory,
      cols: 200,
      rows: 50,
      provider: effectiveProvider,
      env: Object.keys(extraEnv).length > 0 ? extraEnv : undefined,
    }).then((createResult) => {
      if (!createResult.success) {
        const ptyFallback = fallback(`No se pudo crear el PTY: ${createResult.error}`)
        finishWithCleanup(ptyFallback.analysis, 'done', ptyFallback.error)
        return
      }

      cleanupData = window.ghostshell.ptyOnData(ptyId, (data: string) => {
        outputBuffer += data
        const analysis = extractJsonFromOutput(stripAnsi(outputBuffer))
        if (analysis) {
          finishWithCleanup(sanitizeAnalysis(analysis), 'done')
        }
      })

      cleanupExit = window.ghostshell.ptyOnExit(ptyId, (exitCode: number) => {
        if (resolved) return

        const stripped = stripAnsi(outputBuffer)
        const analysis = extractJsonFromOutput(stripped)
        if (analysis) {
          finishWithCleanup(sanitizeAnalysis(analysis), 'done')
          return
        }

        const snippet = stripped.trim().slice(0, 500)
        let errorMsg = `CLI salio con codigo ${exitCode}.`
        if (snippet.length === 0) {
          errorMsg += ` Sin salida. Comando enviado: ${cliPromptCommand}`
        } else {
          errorMsg += ` Salida: ${snippet}`
        }

        const exitFallback = fallback(errorMsg)
        finishWithCleanup(exitFallback.analysis, 'done', exitFallback.error)
      })

      window.ghostshell.ptyWrite(ptyId, cliPromptCommand + '\r')
    }).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err)
      const createFallback = fallback(`Error al crear PTY: ${msg}`)
      finishWithCleanup(createFallback.analysis, 'done', createFallback.error)
    })
  })
}
