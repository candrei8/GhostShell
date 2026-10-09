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

describe('terminalStore pane names', () => {
  beforeEach(() => {
    resetStore()
  })

  it('names placeholder-titled sessions with unique human names', () => {
    const { addSession } = useTerminalStore.getState()
    addSession({ id: 'a', title: 'Terminal', cwd: '.' })
    addSession({ id: 'b', title: 'New Session', cwd: '.' })
    addSession({ id: 'c', title: 'Claude 2', cwd: '.' })

    const titles = useTerminalStore.getState().sessions.map((s) => s.title)
    expect(titles).toEqual(['Emma', 'James', 'Olivia'])
  })

  it('keeps meaningful titles as given', () => {
    useTerminalStore.getState().addSession({ id: 'a', title: 'Backend API', cwd: '.' })
    expect(useTerminalStore.getState().sessions[0].title).toBe('Backend API')
  })

  it('gives a duplicated pane its own name instead of copying the original', () => {
    const { addSession, duplicateSession } = useTerminalStore.getState()
    addSession({ id: 'a', title: 'Terminal', cwd: '.' })
    const newId = duplicateSession('a')!

    const state = useTerminalStore.getState()
    const titles = state.sessions.map((s) => s.title)
    expect(new Set(titles).size).toBe(titles.length)
    expect(state.sessions.find((s) => s.id === newId)?.title).toBe('James')
  })

  it('never lets a programmatic placeholder title overwrite a name', () => {
    const { addSession, updateSession } = useTerminalStore.getState()
    addSession({ id: 'a', title: 'New Session', cwd: '.' })
    updateSession('a', { title: 'Terminal', showQuickLaunch: false })

    const session = useTerminalStore.getState().sessions[0]
    expect(session.title).toBe('Emma')
    expect(session.showQuickLaunch).toBe(false)
  })

  it('lets the user rename a pane to anything', () => {
    const { addSession, renameSession } = useTerminalStore.getState()
    addSession({ id: 'a', title: 'Terminal', cwd: '.' })
    renameSession('a', 'Terminal')
    expect(useTerminalStore.getState().sessions[0].title).toBe('Terminal')
  })
})

describe('terminalStore agent setup screen', () => {
  beforeEach(() => {
    resetStore()
  })

  it('keeps the placeholder title until the setup screen launches something', () => {
    const { addSession, updateSession } = useTerminalStore.getState()
    addSession({ id: 'ql', title: 'New Session', cwd: '.', showQuickLaunch: true })
    expect(useTerminalStore.getState().sessions[0].title).toBe('New Session')

    // Launching a plain terminal from it: placeholder in, real name out.
    updateSession('ql', { title: 'Terminal', showQuickLaunch: false })
    expect(useTerminalStore.getState().sessions[0].title).toBe('Emma')
  })

  it('takes the launched agent name when the setup screen launches an agent', () => {
    const { addSession, updateSession } = useTerminalStore.getState()
    addSession({ id: 'ql', title: 'New Session', cwd: '.', showQuickLaunch: true })
    updateSession('ql', { title: 'James', showQuickLaunch: false })
    expect(useTerminalStore.getState().sessions[0].title).toBe('James')
  })
})
