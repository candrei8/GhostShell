import { useEffect, useRef, useState } from 'react'
import { Terminal as TerminalIcon, Plus, X, LayoutGrid, AppWindow, PanelTopClose, Settings, Network } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useTerminalStore, type TerminalWorkspace } from '../../stores/terminalStore'
import { useAgentStore } from '../../stores/agentStore'
import { ContextMenu } from '../common/ContextMenu'

interface TerminalTabsProps {
    workspaces: TerminalWorkspace[];
    activeWorkspaceId: string | null;
    onNewTab: () => void;
    onSelectWorkspace: (ws: TerminalWorkspace) => void;
    onCloseWorkspace: (ws: TerminalWorkspace) => void;
}

function getTabBackground(color: string | undefined, isActive: boolean) {
    if (!color || !color.startsWith('#')) {
        return isActive ? '#38bdf8' : 'rgba(255, 255, 255, 0.03)'
    }
    if (isActive) return color;
    const r = parseInt(color.slice(1, 3), 16)
    const g = parseInt(color.slice(3, 5), 16)
    const b = parseInt(color.slice(5, 7), 16)
    if (isNaN(r) || isNaN(g) || isNaN(b)) {
        return 'rgba(255, 255, 255, 0.03)';
    }
    return `rgba(${r}, ${g}, ${b}, 0.12)`
}

const Logo = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L3 7V17L12 22L21 17V7L12 2Z" fill="#1A1B26" />
        <path d="M13 3L5 13H12L11 21L19 11H12L13 3Z" fill="#38bdf8" />
    </svg>
)

const TAB_COLORS = [
    { label: 'Rojo', value: '#ef4444' },
    { label: 'Naranja', value: '#f97316' },
    { label: 'Amarillo', value: '#eab308' },
    { label: 'Verde', value: '#22c55e' },
    { label: 'Azul', value: '#3b82f6' },
    { label: 'Morado', value: '#a855f7' },
    { label: 'Rosa', value: '#ec4899' },
]

const AUTO_COLORS = TAB_COLORS.map(c => c.value);

function getAutoColor(id: string) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AUTO_COLORS[Math.abs(hash) % AUTO_COLORS.length];
}

export function TerminalTabs({ workspaces, activeWorkspaceId, onNewTab, onSelectWorkspace, onCloseWorkspace }: TerminalTabsProps) {
    const viewMode = useTerminalStore((s) => s.viewMode)
    const setViewMode = useTerminalStore((s) => s.setViewMode)
    const setTabsCollapsed = useTerminalStore((s) => s.setTabsCollapsed)
    const updateWorkspace = useTerminalStore((s) => s.updateWorkspace)
    const agents = useAgentStore((s) => s.agents)
    const [actionHint, setActionHint] = useState<string | null>(null)
    const lastControlActionAtRef = useRef(0)
    const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const [editingId, setEditingId] = useState<string | null>(null)
    const [editingTitle, setEditingTitle] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)

    const [contextMenu, setContextMenu] = useState<{ id: string, x: number, y: number } | null>(null)

    const CONTROL_DEBOUNCE_MS = 150
    const HINT_DURATION_MS = 900

    useEffect(() => {
        if (editingId && inputRef.current) {
            inputRef.current.focus()
            inputRef.current.select()
        }
    }, [editingId])

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

    const handleSaveTitle = (id: string) => {
        if (editingTitle.trim()) {
            updateWorkspace(id, { title: editingTitle.trim() })
        }
        setEditingId(null)
    }

    const getContextMenuItems = () => {
        if (!contextMenu) return []
        const id = contextMenu.id

        const items = TAB_COLORS.map(color => ({
            label: color.label,
            icon: <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color.value }} />,
            onClick: () => updateWorkspace(id, { color: color.value })
        }))

        items.push({
            label: 'Oscuro por Defecto',
            icon: <div className="w-3 h-3 rounded-full border border-white/20" />,
            onClick: () => {
                updateWorkspace(id, { color: 'default' })
            }
        })

        items.push({
            label: 'Renombrar',
            icon: <div className="w-3 h-3" />,
            onClick: () => {
                const ws = workspaces.find(w => w.id === id)
                if (ws) {
                    setEditingTitle(ws.title)
                    setEditingId(id)
                }
            }
        })

        return items
    }

    return (
        <div className="tabs-bar relative z-20 flex h-11 w-full shrink-0 items-center bg-[#0D0F15] overflow-hidden">
            {contextMenu && (
                <ContextMenu
                    items={getContextMenuItems()}
                    position={{ x: contextMenu.x, y: contextMenu.y }}
                    onClose={() => setContextMenu(null)}
                />
            )}
            {/* Left Icons */}
            <div className="flex h-full items-center gap-4 px-4 pr-6 shrink-0">
                <button
                    onClick={() => window.dispatchEvent(new CustomEvent('ghostshell:open-settings'))}
                    className="text-white/40 hover:text-white/80 transition-colors"
                    title="Ajustes"
                >
                    <Settings className="w-[18px] h-[18px]" />
                </button>
                <div className="flex items-center justify-center">
                    <Logo />
                </div>
            </div>

            {/* Tabs List */}
            <div className="flex h-full flex-1 items-center overflow-x-auto no-scrollbar">
                {workspaces.map((ws) => {
                    const isActive = ws.id === activeWorkspaceId
                    const agent = ws.agentId ? agents.find((a) => a.id === ws.agentId) : null

                    let tabColor = ws.color;
                    if (!tabColor) {
                        tabColor = agent?.color || getAutoColor(ws.id);
                    } else if (tabColor === 'default') {
                        tabColor = undefined;
                    }

                    const isSwarm = ws.title.toLowerCase().includes('swarm')
                    const TabIcon = isSwarm ? Network : TerminalIcon
                    const isEditing = editingId === ws.id

                    return (
                        <div
                            key={ws.id}
                            onClick={() => {
                                if (!isEditing) onSelectWorkspace(ws)
                            }}
                            onDoubleClick={() => {
                                setEditingTitle(ws.title)
                                setEditingId(ws.id)
                            }}
                            onContextMenu={(e) => {
                                e.preventDefault()
                                setContextMenu({ id: ws.id, x: e.clientX, y: e.clientY })
                            }}
                            className={`group flex h-full min-w-[140px] max-w-[240px] shrink-0 cursor-pointer items-center justify-between px-4 transition-colors duration-150 border-r border-white/5 ${isActive ? 'text-white shadow-lg' : 'text-white/90 hover:text-white'
                                }`}
                            style={{
                                backgroundColor: getTabBackground(tabColor, isActive)
                            }}
                        >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <TabIcon
                                    className="h-4 w-4 shrink-0"
                                    style={{ color: isActive ? 'white' : 'rgba(255, 255, 255, 0.85)' }}
                                />
                                {isEditing ? (
                                    <input
                                        ref={inputRef}
                                        value={editingTitle}
                                        onChange={(e) => setEditingTitle(e.target.value)}
                                        onBlur={() => handleSaveTitle(ws.id)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleSaveTitle(ws.id)
                                            if (e.key === 'Escape') setEditingId(null)
                                        }}
                                        className="w-full bg-black/40 px-1 py-0.5 rounded text-[13px] font-medium leading-none outline-none text-white selection:bg-white/30"
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                ) : (
                                    <span className="truncate text-[13px] font-medium leading-none">{ws.title}</span>
                                )}
                                {!isEditing && ws.sessionIds.length > 1 && (
                                    <span className={`flex items-center justify-center rounded-full px-1.5 h-4 text-[10px] font-bold ${isActive ? 'bg-black/20 text-white' : 'bg-black/30 text-white/90'
                                        }`}>
                                        {ws.sessionIds.length}
                                    </span>
                                )}
                            </div>

                            <button
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onCloseWorkspace(ws)
                                }}
                                className={`ml-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-all hover:bg-black/40 ${isActive ? 'text-white/80 hover:text-white' : 'opacity-0 group-hover:opacity-100 text-white/70 hover:text-white'
                                    }`}
                                title="Cerrar"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    )
                })}

                {/* New Tab */}
                <button
                    onClick={onNewTab}
                    className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center text-white/30 transition-all hover:text-white/70"
                    title="Nuevo Espacio de Trabajo"
                >
                    <Plus className="h-4 w-4" />
                </button>
            </div>

            {/* View Mode Toggle */}
            <div className="relative flex shrink-0 items-center gap-0.5 px-3">
                <button
                    onClick={switchToTabs}
                    disabled={viewMode === 'tabs'}
                    aria-pressed={viewMode === 'tabs'}
                    className={`relative flex h-7 w-7 items-center justify-center rounded-md transition-all disabled:cursor-default ${viewMode === 'tabs'
                        ? 'text-white/80'
                        : 'text-white/25 hover:text-white/50 hover:bg-white/5'
                        }`}
                    title="Vista de Pestañas"
                >
                    {viewMode === 'tabs' && (
                        <motion.span
                            layoutId="terminal-view-pill"
                            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                            className="absolute inset-0 rounded-md bg-white/[0.08]"
                        />
                    )}
                    <AppWindow className="relative z-10 h-4 w-4" />
                </button>
                <button
                    onClick={switchToGrid}
                    disabled={viewMode === 'grid'}
                    aria-pressed={viewMode === 'grid'}
                    className={`relative flex h-7 w-7 items-center justify-center rounded-md transition-all disabled:cursor-default ${viewMode === 'grid'
                        ? 'text-white/80'
                        : 'text-white/25 hover:text-white/50 hover:bg-white/5'
                        }`}
                    title="Vista de Cuadrícula"
                >
                    {viewMode === 'grid' && (
                        <motion.span
                            layoutId="terminal-view-pill"
                            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                            className="absolute inset-0 rounded-md bg-white/[0.08]"
                        />
                    )}
                    <LayoutGrid className="relative z-10 h-4 w-4" />
                </button>
                <div className="mx-1 h-4 w-px bg-white/[0.06]" />
                <button
                    onClick={collapseTabs}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-white/20 transition-all hover:bg-white/5 hover:text-white/40"
                    title="Ocultar Pestañas"
                >
                    <PanelTopClose className="h-4 w-4" />
                </button>

                <AnimatePresence initial={false}>
                    {actionHint && (
                        <motion.span
                            key={actionHint}
                            initial={{ opacity: 0, y: 4, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -4, scale: 0.96 }}
                            transition={{ duration: 0.14 }}
                            className="pointer-events-none absolute -bottom-6 right-3 whitespace-nowrap rounded-md border border-white/[0.06] bg-[#050812]/95 px-1.5 py-0.5 text-[10px] text-white/40"
                        >
                            {actionHint}
                        </motion.span>
                    )}
                </AnimatePresence>
            </div>

        </div>
    )
}