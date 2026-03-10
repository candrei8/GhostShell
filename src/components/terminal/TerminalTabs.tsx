import { useEffect, useRef, useState } from 'react'
import { Terminal as TerminalIcon, Plus, X, LayoutGrid, AppWindow, PanelTopClose } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useTerminalStore, type TerminalWorkspace } from '../../stores/terminalStore'
import { useAgentStore } from '../../stores/agentStore'

interface TerminalTabsProps {
    workspaces: TerminalWorkspace[];
    activeWorkspaceId: string | null;
    onNewTab: () => void;
    onSelectWorkspace: (ws: TerminalWorkspace) => void;
    onCloseWorkspace: (ws: TerminalWorkspace) => void;
}

export function TerminalTabs({ workspaces, activeWorkspaceId, onNewTab, onSelectWorkspace, onCloseWorkspace }: TerminalTabsProps) {
    const viewMode = useTerminalStore((s) => s.viewMode)
    const setViewMode = useTerminalStore((s) => s.setViewMode)
    const setTabsCollapsed = useTerminalStore((s) => s.setTabsCollapsed)
    const agents = useAgentStore((s) => s.agents)
    const [actionHint, setActionHint] = useState<string | null>(null)
    const lastControlActionAtRef = useRef(0)
    const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const CONTROL_DEBOUNCE_MS = 150
    const HINT_DURATION_MS = 900

    if (workspaces.length === 0) return null

    const runControlAction = (action: () => void, hint: string) => {
        const now = Date.now()
        if (now - lastControlActionAtRef.current < CONTROL_DEBOUNCE_MS) return
        lastControlActionAtRef.current = now
        action()
        setActionHint(hint)
        if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
        hintTimerRef.current = setTimeout(() => setActionHint(null), HINT_DURATION_MS)
    }

    const switchToTabs = () => {
        runControlAction(() => {
            setTabsCollapsed(false)
            setViewMode('tabs')
        }, 'Tabs')
    }

    const switchToGrid = () => {
        runControlAction(() => {
            setTabsCollapsed(false)
            setViewMode('grid')
        }, 'Grid')
    }

    const collapseTabs = () => {
        runControlAction(() => setTabsCollapsed(true), 'Hidden')
    }

    useEffect(() => {
        return () => {
            if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
        }
    }, [])

    return (
        <div className="tabs-bar relative z-20 flex h-10 shrink-0 items-center gap-1.5 px-2">

            {/* Tabs List */}
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto no-scrollbar">
                {workspaces.map((ws) => {
                    const isActive = ws.id === activeWorkspaceId
                    const agent = ws.agentId ? agents.find((a) => a.id === ws.agentId) : null
                    const agentColor = agent?.color

                    return (
                        <div
                            key={ws.id}
                            onClick={() => onSelectWorkspace(ws)}
                            className={`session-tab group relative flex h-7 min-w-[100px] max-w-[200px] shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 transition-all duration-150 ${
                                isActive
                                    ? 'bg-white/[0.07] text-white/90'
                                    : 'text-white/35 hover:bg-white/[0.03] hover:text-white/60'
                            }`}
                        >
                            {/* Active indicator line */}
                            {isActive && (
                                <motion.div
                                    layoutId="tab-active-line"
                                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                                    className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full"
                                    style={{ backgroundColor: agentColor || 'rgba(255,255,255,0.3)' }}
                                />
                            )}

                            {/* Icon */}
                            <div className="flex shrink-0 items-center justify-center">
                                {agent ? (
                                    <div
                                        className="h-2 w-2 rounded-full"
                                        style={{ backgroundColor: agentColor, boxShadow: isActive ? `0 0 6px ${agentColor}60` : undefined }}
                                    />
                                ) : (
                                    <TerminalIcon className="h-3 w-3 opacity-50" />
                                )}
                            </div>

                            <span className="flex-1 truncate text-[11px] font-medium leading-none">{ws.title}</span>

                            {ws.sessionIds.length > 1 && (
                                <span className={`rounded-full px-1 text-[9px] font-medium ${
                                    isActive ? 'bg-white/10 text-white/60' : 'bg-white/[0.04] text-white/25'
                                }`}>
                                    {ws.sessionIds.length}
                                </span>
                            )}

                            <button
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onCloseWorkspace(ws)
                                }}
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-white/30 transition-all hover:bg-rose-500/15 hover:text-rose-300 ${
                                    isActive ? 'opacity-60' : 'opacity-0 group-hover:opacity-60'
                                }`}
                                title="Close"
                            >
                                <X className="w-2.5 h-2.5" />
                            </button>
                        </div>
                    )
                })}

                {/* New Tab */}
                <button
                    onClick={onNewTab}
                    className="ml-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/20 transition-all hover:bg-white/[0.05] hover:text-white/50"
                    title="New Workspace"
                >
                    <Plus className="h-3 w-3" />
                </button>
            </div>

            {/* View Mode Toggle */}
            <div className="relative flex shrink-0 items-center gap-0.5 rounded-lg border border-white/[0.05] bg-white/[0.02] p-0.5">
                <button
                    onClick={switchToTabs}
                    disabled={viewMode === 'tabs'}
                    aria-pressed={viewMode === 'tabs'}
                    className={`relative flex h-6 w-6 items-center justify-center rounded-md transition-all disabled:cursor-default ${
                        viewMode === 'tabs'
                            ? 'text-white/80'
                            : 'text-white/25 hover:text-white/50'
                    }`}
                    title="Tabs View"
                >
                    {viewMode === 'tabs' && (
                        <motion.span
                            layoutId="terminal-view-pill"
                            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                            className="absolute inset-0 rounded-md bg-white/[0.08] border border-white/[0.06]"
                        />
                    )}
                    <AppWindow className="relative z-10 h-3 w-3" />
                </button>
                <button
                    onClick={switchToGrid}
                    disabled={viewMode === 'grid'}
                    aria-pressed={viewMode === 'grid'}
                    className={`relative flex h-6 w-6 items-center justify-center rounded-md transition-all disabled:cursor-default ${
                        viewMode === 'grid'
                            ? 'text-white/80'
                            : 'text-white/25 hover:text-white/50'
                    }`}
                    title="Grid View"
                >
                    {viewMode === 'grid' && (
                        <motion.span
                            layoutId="terminal-view-pill"
                            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                            className="absolute inset-0 rounded-md bg-white/[0.08] border border-white/[0.06]"
                        />
                    )}
                    <LayoutGrid className="relative z-10 h-3 w-3" />
                </button>
                <div className="mx-0.5 h-3.5 w-px bg-white/[0.06]" />
                <button
                    onClick={collapseTabs}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-white/20 transition-all hover:bg-white/[0.05] hover:text-white/40"
                    title="Collapse Tabs"
                >
                    <PanelTopClose className="h-3 w-3" />
                </button>

                <AnimatePresence initial={false}>
                    {actionHint && (
                        <motion.span
                            key={actionHint}
                            initial={{ opacity: 0, y: 4, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -4, scale: 0.96 }}
                            transition={{ duration: 0.14 }}
                            className="pointer-events-none absolute -bottom-5 right-0 whitespace-nowrap rounded-md border border-white/[0.06] bg-[#050812]/95 px-1.5 py-0.5 text-[10px] text-white/40"
                        >
                            {actionHint}
                        </motion.span>
                    )}
                </AnimatePresence>
            </div>

        </div>
    )
}
