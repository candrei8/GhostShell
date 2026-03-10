import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { X, Terminal as TerminalIcon } from 'lucide-react'
import { useTerminal } from '../../hooks/useTerminal'
import { usePty } from '../../hooks/usePty'
import { useTerminalStore } from '../../stores/terminalStore'
import { TerminalSearch } from './TerminalSearch'
import { MultiLineInput } from './MultiLineInput'
import { useAgentStore } from '../../stores/agentStore'
import { useActivityStore } from '../../stores/activityStore'
import { useCompanionStore } from '../../stores/companionStore'
import { useCommandBlockStore } from '../../stores/commandBlockStore'
import { ActivityIcon } from '../agents/ActivityIcon'
import { TerminalSession } from '../../lib/types'
import { resolveProvider, getProviderColor } from '../../lib/providers'
import { ContextGauge } from '../agents/ContextGauge'
import { TerminalContextPanel } from './TerminalContextPanel'
import { hasContextMetrics } from '../../lib/contextMetrics'
import { SHORTCUT_EVENTS } from '../../lib/shortcutEvents'

interface TerminalPaneProps {
  session: TerminalSession
  isActive?: boolean
  onClose?: () => void
  onClick?: () => void
  showPaneLabel?: boolean
  searchOpen?: boolean
  onSearchClose?: () => void
  outputViewMode?: 'terminal' | 'companion'
}

export function TerminalPane({
  session,
  isActive,
  onClose,
  onClick,
  showPaneLabel = true,
  searchOpen: externalSearchOpen,
  onSearchClose,
  outputViewMode,
}: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const agent = useAgentStore((s) =>
    session.agentId ? s.agents.find((a) => a.id === session.agentId) : undefined,
  )
  const activityId = session.agentId || session.id
  const activity = useActivityStore((s) => s.activities[activityId])
  const companionSession = useCompanionStore((s) => s.sessions[session.id])
  const blocksForSession = useCommandBlockStore((s) => s.blocksBySession[session.id])
  const companionEntries = companionSession?.entries ?? []
  const commandBlocks = blocksForSession ?? []

  const sessionProvider = session.detectedProvider
  const provider = agent ? resolveProvider(agent) : sessionProvider
  const { terminal, searchNext, searchPrev, clearSearch } = useTerminal(containerRef, isActive, provider)
  const [localSearchOpen, setLocalSearchOpen] = useState(false)
  const [labelHovered, setLabelHovered] = useState(false)
  const [contextOpen, setContextOpen] = useState(outputViewMode === 'companion')
  const [multiLineOpen, setMultiLineOpen] = useState(false)

  const searchOpen = externalSearchOpen !== undefined ? externalSearchOpen : localSearchOpen
  const providerColor = provider ? getProviderColor(provider) : '#e4e4e7'
  const activityName = activity?.currentActivity || null
  const activityDetail = activity?.currentDetail || null
  const activityStartedAt = activity?.lastActivityTime || null
  const hasContextData = useMemo(
    () =>
      !!provider ||
      hasContextMetrics(activity?.contextMetrics) ||
      companionEntries.length > 0 ||
      commandBlocks.length > 0,
    [provider, activity?.contextMetrics, companionEntries.length, commandBlocks.length],
  )

  // Title and Description editing state
  const updateSession = useTerminalStore((s) => s.updateSession)

  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleInput, setTitleInput] = useState(session.title)
  const titleInputRef = useRef<HTMLInputElement>(null)

  const [isEditingDesc, setIsEditingDesc] = useState(false)
  const [descInput, setDescInput] = useState(session.description || '')
  const descInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isEditingTitle) {
      setTitleInput(session.title)
    }
  }, [session.title, isEditingTitle])

  useEffect(() => {
    if (!isEditingDesc) {
      setDescInput(session.description || '')
    }
  }, [session.description, isEditingDesc])

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [isEditingTitle])

  useEffect(() => {
    if (isEditingDesc && descInputRef.current) {
      descInputRef.current.focus()
      descInputRef.current.select()
    }
  }, [isEditingDesc])

  const handleTitleSubmit = () => {
    if (titleInput.trim() && titleInput !== session.title) {
      updateSession(session.id, { title: titleInput.trim() })
    } else {
      setTitleInput(session.title)
    }
    setIsEditingTitle(false)
  }

  const handleDescSubmit = () => {
    if (descInput !== session.description) {
      updateSession(session.id, { description: descInput.trim() || undefined })
    }
    setIsEditingDesc(false)
  }

  usePty({
    sessionId: session.id,
    terminal,
    cwd: session.cwd,
    shell: session.shell,
    agentId: session.agentId,
    autoLaunch: !!session.agentId && !session.skipAutoLaunch,
  })

  const handleToggleSearch = useCallback(() => {
    if (externalSearchOpen !== undefined) return
    setLocalSearchOpen((prev) => !prev)
  }, [externalSearchOpen])

  const handleSearchClose = useCallback(() => {
    if (onSearchClose) {
      onSearchClose()
    } else {
      setLocalSearchOpen(false)
    }
  }, [onSearchClose])

  useEffect(() => {
    if (!isActive) return

    const handleRenameRequest = () => {
      setTitleInput(session.title)
      setIsEditingTitle(true)
    }

    window.addEventListener(SHORTCUT_EVENTS.renameTab, handleRenameRequest as EventListener)
    return () =>
      window.removeEventListener(SHORTCUT_EVENTS.renameTab, handleRenameRequest as EventListener)
  }, [isActive, session.title])

  useEffect(() => {
    if (!isActive) return

    const handleSearchRequest = () => {
      handleToggleSearch()
    }

    window.addEventListener(
      SHORTCUT_EVENTS.toggleTerminalSearch,
      handleSearchRequest as EventListener,
    )

    return () =>
      window.removeEventListener(
        SHORTCUT_EVENTS.toggleTerminalSearch,
        handleSearchRequest as EventListener,
      )
  }, [handleToggleSearch, isActive])

  // Shift+Enter: open multi-line input overlay
  useEffect(() => {
    if (!isActive) return
    const handleMultiLine = () => setMultiLineOpen(true)
    window.addEventListener(SHORTCUT_EVENTS.openMultiLineInput, handleMultiLine as EventListener)
    return () =>
      window.removeEventListener(SHORTCUT_EVENTS.openMultiLineInput, handleMultiLine as EventListener)
  }, [isActive])

  const handleMultiLineSubmit = useCallback(
    (text: string) => {
      if (!session.id) return
      // Send each line followed by Enter (\r), like the user typed it
      const lines = text.split('\n')
      for (let i = 0; i < lines.length; i++) {
        if (lines[i]) {
          window.ghostshell.ptyWrite(session.id, lines[i])
        }
        // Send Enter after each line except the last (the last Enter submits the command)
        if (i < lines.length - 1) {
          window.ghostshell.ptyWrite(session.id, '\r')
        }
      }
      // Final Enter to execute
      window.ghostshell.ptyWrite(session.id, '\r')
      // Re-focus terminal
      setTimeout(() => terminal?.focus(), 50)
    },
    [session.id, terminal],
  )

  const paneStyle = useMemo(() => {
    const tint = agent ? providerColor : 'rgba(255,255,255,0.15)'
    return {
      borderColor: isActive ? `color-mix(in srgb, ${tint} 35%, rgba(255,255,255,0.08))` : 'rgba(255,255,255,0.05)',
      boxShadow: isActive
        ? `0 0 0 1px color-mix(in srgb, ${tint} 15%, transparent), 0 8px 32px rgba(0,0,0,0.25)`
        : '0 4px 16px rgba(0,0,0,0.15)',
      background: 'rgba(5, 9, 18, 0.7)',
    }
  }, [agent, isActive, providerColor])

  return (
    <div
      data-terminal-pane
      className="relative m-1 flex h-full flex-col overflow-hidden rounded-xl border transition-all duration-200"
      style={paneStyle}
      onClick={onClick}
      onMouseEnter={() => setLabelHovered(true)}
      onMouseLeave={() => setLabelHovered(false)}
    >

      {/* Pane Header */}
      {showPaneLabel && (
        <div
          className="pane-header shrink-0 flex items-center justify-between px-3 py-1.5"
          style={{
            borderBottom: `1px solid ${isActive ? `color-mix(in srgb, ${providerColor} 15%, rgba(255,255,255,0.04))` : 'rgba(255,255,255,0.04)'}`,
          }}
        >

          {/* Left: Identity */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {/* Agent dot or terminal icon */}
            <div className="shrink-0">
              {agent ? (
                <div className="relative">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{
                      backgroundColor: providerColor,
                      boxShadow: isActive ? `0 0 8px ${providerColor}50` : undefined,
                    }}
                  />
                  {agent.status === 'working' && (
                    <div
                      className="absolute inset-0 animate-ping rounded-full opacity-40"
                      style={{ backgroundColor: providerColor }}
                    />
                  )}
                </div>
              ) : (
                <TerminalIcon className="h-3 w-3 text-white/25" />
              )}
            </div>

            <div className="flex items-center gap-2 min-w-0 flex-1">
              {/* Title */}
              {isEditingTitle ? (
                <input
                  ref={titleInputRef}
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  onBlur={handleTitleSubmit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleTitleSubmit()
                    if (e.key === 'Escape') {
                      setTitleInput(session.title)
                      setIsEditingTitle(false)
                    }
                  }}
                  className="max-w-[180px] rounded-md border border-white/[0.1] bg-black/30 px-1.5 py-0.5 text-[12px] font-medium text-white/85 outline-none focus:border-white/[0.2]"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    setIsEditingTitle(true)
                  }}
                  className={`cursor-text truncate text-[12px] font-medium transition-colors ${isActive ? 'text-white/80' : 'text-white/45'}`}
                  title="Double-click to rename"
                >
                  {session.title}
                </span>
              )}

              {/* Activity indicator */}
              {!isEditingTitle && agent && activityName && activityName !== 'idle' && (
                <div className="shrink-0 scale-85 origin-left">
                  <ActivityIcon
                    activity={activityName}
                    detail={activityDetail || undefined}
                    size="xs"
                    startedAt={activityStartedAt || undefined}
                    showElapsed={activityName === 'thinking'}
                    showLabel={false}
                  />
                </div>
              )}

              {/* Inline description */}
              {!isEditingTitle && !isEditingDesc && (
                <span className="hidden lg:inline truncate text-[10px] text-white/20">
                  {session.description && (
                    <>
                      <span className="mx-1">&bull;</span>
                      <span
                        onClick={(e) => {
                          e.stopPropagation()
                          setIsEditingDesc(true)
                        }}
                        className="cursor-text hover:text-white/40 transition-colors"
                      >
                        {session.description}
                      </span>
                    </>
                  )}
                  {session.cwd && (
                    <>
                      <span className="mx-1">&bull;</span>
                      {session.cwd.split(/[/\\]/).pop()}
                    </>
                  )}
                </span>
              )}

              {isEditingDesc && (
                <input
                  ref={descInputRef}
                  value={descInput}
                  onChange={(e) => setDescInput(e.target.value)}
                  onBlur={handleDescSubmit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleDescSubmit()
                    if (e.key === 'Escape') {
                      setDescInput(session.description || '')
                      setIsEditingDesc(false)
                    }
                  }}
                  className="max-w-[220px] rounded-md border border-white/[0.08] bg-black/30 px-1.5 py-0.5 text-[10px] text-white/60 outline-none focus:border-white/[0.15]"
                  placeholder="Set task focus..."
                  onClick={(e) => e.stopPropagation()}
                />
              )}
            </div>
          </div>

          {/* Right: Context gauge + close */}
          <div className="flex items-center gap-2 shrink-0 pl-2">
            {provider && hasContextData && (
              <ContextGauge
                provider={provider}
                metrics={activity?.contextMetrics}
                active={contextOpen}
                onClick={() => setContextOpen((prev) => !prev)}
              />
            )}

            {onClose && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onClose()
                }}
                className={`flex h-5 w-5 items-center justify-center rounded-md text-white/20 transition-all hover:bg-rose-500/15 hover:text-rose-300 ${labelHovered ? 'opacity-100' : 'opacity-0'
                  }`}
                title="Close"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

        </div>
      )}

      {/* Terminal Canvas */}
      <div className="flex min-h-0 flex-1 bg-transparent">
        <div className="relative min-w-0 flex-1">
          <div ref={containerRef} className="absolute inset-x-0 bottom-0 top-0 px-3.5 py-2" />

          {searchOpen && (
            <div className="absolute top-2 right-4 z-20">
              <TerminalSearch
                isOpen={searchOpen}
                onClose={handleSearchClose}
                onSearchNext={searchNext}
                onSearchPrev={searchPrev}
                onClear={clearSearch}
              />
            </div>
          )}

          {multiLineOpen && (
            <MultiLineInput
              onSubmit={handleMultiLineSubmit}
              onClose={() => {
                setMultiLineOpen(false)
                setTimeout(() => terminal?.focus(), 50)
              }}
            />
          )}
        </div>

        {contextOpen && (
          <div className="min-h-0">
            <TerminalContextPanel
              session={session}
              provider={provider}
              activity={activity}
              entries={companionEntries}
              blocks={commandBlocks}
              onClose={() => setContextOpen(false)}
            />
          </div>
        )}
      </div>

    </div>
  )
}
