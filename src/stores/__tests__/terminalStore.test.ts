import { beforeEach, describe, expect, it } from 'vitest'
import type { SessionGroup, TerminalSession } from '../../lib/types'
import { useTerminalStore } from '../terminalStore'

function makeSession(id: string, title = id): TerminalSession {
  return {
    id,
    title,
    cwd: `C:\\tmp\\${id}`,
    isActive: false,
  }
}

function resetStore() {
  useTerminalStore.setState({
    sessions: [],
    activeSessionId: null,
    activeWorkspaceId: null,
    activeGroupId: null,
    maximizedSessionId: null,
    syncInputsMode: 'off',
    viewMode: 'tabs',
    groups: [],
    tabsCollapsed: false,
  })
}

function seedStore(sessions: TerminalSession[], groups: SessionGroup[] = []) {
  useTerminalStore.setState({
    sessions,
    groups,
    activeSessionId: sessions[0]?.id || null,
    activeWorkspaceId: groups[0]?.id || sessions[0]?.id || null,
    activeGroupId: groups[0]?.id || null,
    maximizedSessionId: null,
    viewMode: 'tabs',
  })
}

describe('terminalStore.closeWorkspace', () => {
  beforeEach(() => {
    resetStore()
  })

  it('keeps the current workspace active when closing another tab', () => {
    seedStore([makeSession('tab-a'), makeSession('tab-b'), makeSession('tab-c')])
    useTerminalStore.setState({
      activeWorkspaceId: 'tab-a',
      activeSessionId: 'tab-a',
      activeGroupId: null,
    })

    useTerminalStore.getState().closeWorkspace('tab-b')

    const state = useTerminalStore.getState()
    expect(state.sessions.map((session) => session.id)).toEqual(['tab-a', 'tab-c'])
    expect(state.activeWorkspaceId).toBe('tab-a')
    expect(state.activeSessionId).toBe('tab-a')
  })

  it('moves focus to an adjacent workspace when closing the active tab', () => {
    seedStore([makeSession('tab-a'), makeSession('tab-b'), makeSession('tab-c')])
    useTerminalStore.setState({
      activeWorkspaceId: 'tab-b',
      activeSessionId: 'tab-b',
      activeGroupId: null,
    })

    useTerminalStore.getState().closeWorkspace('tab-b')

    const state = useTerminalStore.getState()
    expect(state.sessions.map((session) => session.id)).toEqual(['tab-a', 'tab-c'])
    expect(state.activeWorkspaceId).toBe('tab-c')
    expect(state.activeSessionId).toBe('tab-c')
  })

  it('removes grouped sessions together and clears the active group', () => {
    const grouped: SessionGroup = {
      id: 'group-1',
      name: 'Group 1',
      sessionIds: ['tab-b', 'tab-c'],
      createdAt: Date.now(),
    }

    seedStore([makeSession('tab-a'), makeSession('tab-b'), makeSession('tab-c')], [grouped])
    useTerminalStore.setState({
      activeWorkspaceId: 'group-1',
      activeSessionId: 'tab-b',
      activeGroupId: 'group-1',
    })

    useTerminalStore.getState().closeWorkspace('group-1')

    const state = useTerminalStore.getState()
    expect(state.sessions.map((session) => session.id)).toEqual(['tab-a'])
    expect(state.groups).toEqual([])
    expect(state.activeWorkspaceId).toBe('tab-a')
    expect(state.activeSessionId).toBe('tab-a')
    expect(state.activeGroupId).toBeNull()
  })
})
