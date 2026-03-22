import { useAgentStore } from '../stores/agentStore'
import { useCommandBlockStore } from '../stores/commandBlockStore'
import { useCompanionStore } from '../stores/companionStore'
import { useHistoryStore } from '../stores/historyStore'
import { useTerminalStore } from '../stores/terminalStore'
import { resolveProvider } from './providers'
import { Provider } from './types'

function normalizePrompt(command: string): string | null {
  const normalized = command.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  return normalized.length > 0 ? normalized : null
}

function getPromptProvider(sessionId: string): Provider {
  const session = useTerminalStore.getState().getSession(sessionId)
  if (session?.agentId) {
    const agent = useAgentStore.getState().getAgent(session.agentId)
    if (agent) return resolveProvider(agent)
  }
  return session?.detectedProvider || 'claude'
}

function getNativeMultilineSequence(provider: Provider): string {
  if (provider === 'claude') return '\x1b\r'
  return '\n'
}

function writePrompt(sessionId: string, command: string, provider: Provider): void {
  const lines = command.split('\n')

  if (lines.length <= 1) {
    window.ghostshell.ptyWrite(sessionId, `${command}\r`)
    return
  }

  // Batch all lines into a single ptyWrite to guarantee ordering
  const multilineSequence = getNativeMultilineSequence(provider)
  const payload = lines.join(multilineSequence) + '\r'
  window.ghostshell.ptyWrite(sessionId, payload)
}

export function registerPromptSubmission(
  sessionId: string,
  command: string,
  fallbackCwd = '',
): string | null {
  const normalizedCommand = normalizePrompt(command)
  if (!normalizedCommand) return null

  const session = useTerminalStore.getState().getSession(sessionId)
  const sessionCwd = session?.cwd || fallbackCwd
  const agent = session?.agentId ? useAgentStore.getState().getAgent(session.agentId) : undefined

  useHistoryStore.getState().addEntry(normalizedCommand, sessionId, agent?.name)
  const blockId = useCommandBlockStore.getState().startBlock(sessionId, normalizedCommand, sessionCwd)
  useCompanionStore.getState().addUserMessage(sessionId, normalizedCommand)
  return blockId
}

export function submitPromptToSession(
  sessionId: string,
  command: string,
  fallbackCwd = '',
): boolean {
  const normalizedCommand = normalizePrompt(command)
  if (!normalizedCommand) return false

  registerPromptSubmission(sessionId, normalizedCommand, fallbackCwd)
  writePrompt(sessionId, normalizedCommand, getPromptProvider(sessionId))
  return true
}
