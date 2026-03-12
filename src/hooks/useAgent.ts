import { useCallback } from 'react'
import { useAgentStore } from '../stores/agentStore'
import { useTerminalStore } from '../stores/terminalStore'
import { useThreadStore } from '../stores/threadStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { AgentAvatarConfig, ClaudeConfig, GeminiConfig, CodexConfig, Provider } from '../lib/types'
import { buildClaudeCommand, buildLaunchCommand, resolveProvider } from '../lib/providers'

// Re-export for backward compat
export { buildClaudeCommand } from '../lib/providers'

export function useAgent() {
  const addAgent = useAgentStore((s) => s.addAgent)
  const removeAgent = useAgentStore((s) => s.removeAgent)
  const updateAgent = useAgentStore((s) => s.updateAgent)
  const setAgentStatus = useAgentStore((s) => s.setAgentStatus)
  const assignToThread = useAgentStore((s) => s.assignToThread)
  const addSession = useTerminalStore((s) => s.addSession)
  const removeSession = useTerminalStore((s) => s.removeSession)
  const addAgentToThread = useThreadStore((s) => s.addAgentToThread)
  const removeAgentFromThread = useThreadStore((s) => s.removeAgentFromThread)

  const createAgent = useCallback(
    (
      name: string,
      avatar?: AgentAvatarConfig,
      color?: string,
      claudeConfig?: ClaudeConfig,
      cwd?: string,
      templateId?: string,
      threadId?: string,
      launchClaude?: boolean,
      provider?: Provider,
      geminiConfig?: GeminiConfig,
      codexConfig?: CodexConfig,
    ) => {
      const agent = addAgent(name, avatar, color, claudeConfig, cwd, templateId, provider, geminiConfig, codexConfig)

      const sessionId = `term-${agent.id}`
      addSession({
        id: sessionId,
        agentId: agent.id,
        title: name,
        cwd: cwd || useWorkspaceStore.getState().currentPath || '.',
      })

      updateAgent(agent.id, { terminalId: sessionId })

      if (threadId) {
        assignToThread(agent.id, threadId)
        addAgentToThread(threadId, agent.id)
      }

      return { agent, sessionId, launchClaude: launchClaude ?? true }
    },
    [addAgent, addSession, updateAgent, assignToThread, addAgentToThread],
  )

  const deleteAgent = useCallback(
    (agentId: string) => {
      const agent = useAgentStore.getState().getAgent(agentId)
      if (agent) {
        // Kill PTY if still running
        if (agent.terminalId) {
          try { window.ghostshell.ptyKill(agent.terminalId) } catch {}
        }
        // Remove ALL sessions associated with this agent (terminalId may be undefined after process exit)
        const sessions = useTerminalStore.getState().sessions
        for (const s of sessions) {
          if (s.agentId === agentId) {
            removeSession(s.id)
          }
        }
        // Clean up thread reference
        if (agent.threadId) {
          removeAgentFromThread(agent.threadId, agentId)
        }
        removeAgent(agentId)
      }
    },
    [removeAgent, removeSession, removeAgentFromThread],
  )

  /** Close agent's terminal but keep the agent (set offline, allow restart) */
  const stopAgent = useCallback(
    (agentId: string) => {
      const agent = useAgentStore.getState().getAgent(agentId)
      if (!agent) return

      // Kill PTY if it exists
      if (agent.terminalId) {
        try { window.ghostshell.ptyKill(agent.terminalId) } catch {}
      }

      // Remove ALL sessions associated with this agent (terminalId may already be cleared)
      const sessions = useTerminalStore.getState().sessions
      for (const s of sessions) {
        if (s.agentId === agentId) {
          removeSession(s.id)
        }
      }

      // Always set offline + clear terminal reference
      updateAgent(agentId, { terminalId: undefined })
      setAgentStatus(agentId, 'offline')
    },
    [removeSession, updateAgent, setAgentStatus],
  )

  /** Restart an offline agent: create new terminal + relaunch with --continue/--resume if had conversation */
  const restartAgent = useCallback(
    (agentId: string) => {
      const agent = useAgentStore.getState().getAgent(agentId)
      if (!agent) return

      // Kill old PTY if somehow still exists
      if (agent.terminalId) {
        try { window.ghostshell.ptyKill(agent.terminalId) } catch {}
      }

      // Remove ALL old sessions for this agent (terminalId may be undefined after process exit)
      const oldSessions = useTerminalStore.getState().sessions
      for (const s of oldSessions) {
        if (s.agentId === agentId) {
          removeSession(s.id)
        }
      }

      const sessionId = `term-${agent.id}-${Date.now()}`
      const provider = resolveProvider(agent)
      const hasConfig = provider === 'gemini' ? !!agent.geminiConfig : provider === 'codex' ? !!agent.codexConfig : !!agent.claudeConfig
      addSession({
        id: sessionId,
        agentId: agent.id,
        title: agent.name,
        cwd: agent.cwd || useWorkspaceStore.getState().currentPath || '.',
        // Tell usePty not to auto-launch - we handle it below with proper flags
        skipAutoLaunch: hasConfig,
      })

      updateAgent(agentId, { terminalId: sessionId })
      setAgentStatus(agentId, 'idle')

      if (hasConfig) {
        // Both Claude (--continue) and Gemini (--resume latest) support session resume
        const shouldResume = !!agent.hasConversation
        const cmd = buildLaunchCommand(agent, shouldResume)

        // Delay to let PTY initialize
        setTimeout(() => {
          const currentAgent = useAgentStore.getState().getAgent(agentId)
          if (currentAgent?.terminalId !== sessionId) return

          try {
            window.ghostshell.ptyWrite(sessionId, cmd + '\r')
            useAgentStore.getState().setAgentStatus(agentId, 'working')
          } catch {
            // PTY not ready - user can send command manually
          }
        }, 1000)
      }
    },
    [addSession, removeSession, updateAgent, setAgentStatus],
  )

  /** Clone an agent with the same config */
  const cloneAgent = useCallback(
    (agentId: string) => {
      const agent = useAgentStore.getState().getAgent(agentId)
      if (!agent) return

      return createAgent(
        `${agent.name} (copy)`,
        agent.avatar,
        agent.color,
        agent.claudeConfig,
        agent.cwd,
        agent.templateId,
        agent.threadId,
        true,
        agent.provider,
        agent.geminiConfig,
        agent.codexConfig,
      )
    },
    [createAgent],
  )

  /** Send text to the agent's terminal PTY */
  const sendToAgent = useCallback(
    (agentId: string, text: string) => {
      const agent = useAgentStore.getState().getAgent(agentId)
      if (agent?.terminalId) {
        window.ghostshell.ptyWrite(agent.terminalId, text)
      }
    },
    [],
  )

  const moveAgentToThread = useCallback(
    (agentId: string, fromThreadId: string | undefined, toThreadId: string | undefined) => {
      if (fromThreadId) {
        removeAgentFromThread(fromThreadId, agentId)
      }
      if (toThreadId) {
        addAgentToThread(toThreadId, agentId)
      }
      assignToThread(agentId, toThreadId)
    },
    [assignToThread, addAgentToThread, removeAgentFromThread],
  )

  const createAgentGroup = useCallback(
    (
      agentConfigs: Array<{
        name: string
        avatar?: AgentAvatarConfig
        color?: string
        claudeConfig?: ClaudeConfig
        cwd?: string
        templateId?: string
        provider?: Provider
        geminiConfig?: GeminiConfig
        codexConfig?: CodexConfig
      }>,
      groupName: string,
    ) => {
      const sessionIds: string[] = []
      const createdAgents: ReturnType<typeof createAgent>[] = []

      for (const config of agentConfigs) {
        const result = createAgent(
          config.name,
          config.avatar,
          config.color,
          config.claudeConfig,
          config.cwd,
          config.templateId,
          undefined,
          true,
          config.provider,
          config.geminiConfig,
          config.codexConfig,
        )
        sessionIds.push(result.sessionId)
        createdAgents.push(result)
      }

      // Create the group in terminalStore
      if (sessionIds.length > 1) {
        const groupId = `group-${Date.now()}`
        useTerminalStore.getState().addGroup({
          id: groupId,
          name: groupName,
          sessionIds,
          createdAt: Date.now(),
        })
      }

      return createdAgents
    },
    [createAgent],
  )

  return {
    createAgent,
    createAgentGroup,
    deleteAgent,
    stopAgent,
    restartAgent,
    cloneAgent,
    sendToAgent,
    moveAgentToThread,
    buildClaudeCommand,
  }
}
