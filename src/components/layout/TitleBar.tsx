import { useState, useEffect, useCallback } from 'react'
import { Minus, Square, X, Terminal, GitBranch, Search, FolderOpen, Copy as CopyIcon } from 'lucide-react'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { GitStatus } from '../../lib/types'

interface TitleBarProps {
  onToggleCommandPalette: () => void
}

export function TitleBar({ onToggleCommandPalette }: TitleBarProps) {
  const currentPath = useWorkspaceStore((s) => s.currentPath)
  const [isMaximized, setIsMaximized] = useState(false)
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null)
  const [appVersion, setAppVersion] = useState('')

  // Fetch app version
  useEffect(() => {
    window.ghostshell.getVersion().then(setAppVersion).catch(() => {})
  }, [])

  // Check maximized state
  useEffect(() => {
    let mounted = true
    const check = async () => {
      try {
        const maximized = await window.ghostshell.windowIsMaximized()
        if (mounted) setIsMaximized(maximized)
      } catch {}
    }
    check()
    // Re-check on resize events
    const onResize = () => check()
    window.addEventListener('resize', onResize)
    return () => { mounted = false; window.removeEventListener('resize', onResize) }
  }, [])

  // Fetch git status for current path
  useEffect(() => {
    let mounted = true
    const fetchGit = async () => {
      try {
        const status = await window.ghostshell.gitStatus(currentPath)
        if (mounted) setGitStatus(status)
      } catch {
        if (mounted) setGitStatus(null)
      }
    }
    fetchGit()
    // Refresh git status every 10 seconds
    const interval = setInterval(fetchGit, 10000)
    return () => { mounted = false; clearInterval(interval) }
  }, [currentPath])

  const handleMaximize = useCallback(async () => {
    window.ghostshell.windowMaximize()
    // Small delay to let the window state change
    setTimeout(async () => {
      try {
        const maximized = await window.ghostshell.windowIsMaximized()
        setIsMaximized(maximized)
      } catch {}
    }, 100)
  }, [])

  // Extract project name from path
  const projectName = currentPath.split(/[/\\]/).filter(Boolean).pop() || 'GhostShell'

  const gitDirtyCount = gitStatus ? gitStatus.total : 0
  const hasChanges = gitDirtyCount > 0

  return (
    <div className="titlebar-drag h-8 flex items-center bg-ghost-sidebar border-b border-ghost-border px-2 select-none gap-1">
      {/* Logo + Project name */}
      <div className="flex items-center gap-1.5 shrink-0">
        <Terminal className="w-3.5 h-3.5 text-ghost-accent" />
        <span className="text-xs font-semibold text-ghost-text">{projectName}</span>
        {appVersion && <span className="text-[10px] text-ghost-text-dim/50">v{appVersion}</span>}
      </div>

      {/* Git info */}
      {gitStatus?.isRepo && (
        <div className="titlebar-no-drag flex items-center gap-1 ml-2 shrink-0">
          <div
            className={`flex items-center gap-1 h-5 px-1.5 rounded text-[11px] transition-colors ${
              hasChanges
                ? 'bg-ghost-warning/10 text-ghost-warning'
                : 'bg-ghost-success/10 text-ghost-success'
            }`}
          >
            <GitBranch className="w-3 h-3" />
            <span className="max-w-[120px] truncate">{gitStatus.branch}</span>
            {hasChanges && (
              <span className="text-[10px] opacity-75">
                {gitStatus.modified > 0 && `~${gitStatus.modified}`}
                {gitStatus.added > 0 && ` +${gitStatus.added}`}
                {gitStatus.deleted > 0 && ` -${gitStatus.deleted}`}
              </span>
            )}
            {gitStatus.ahead > 0 && (
              <span className="text-[10px] opacity-75">&uarr;{gitStatus.ahead}</span>
            )}
          </div>
        </div>
      )}

      {/* Workspace path (truncated, click to copy) */}
      <div className="titlebar-no-drag flex items-center gap-1 ml-1.5 min-w-0 flex-1">
        <button
          onClick={() => navigator.clipboard.writeText(currentPath).catch(() => {})}
          className="flex items-center gap-1 text-[11px] text-ghost-text-dim hover:text-ghost-text transition-colors truncate max-w-[300px] group"
          title={`${currentPath} (click to copy)`}
        >
          <FolderOpen className="w-3 h-3 shrink-0 opacity-50 group-hover:opacity-100" />
          <span className="truncate">{currentPath}</span>
        </button>
      </div>

      {/* Command palette + Window controls */}
      <div className="titlebar-no-drag flex items-center gap-0.5 shrink-0">
        {/* Command palette */}
        <button
          onClick={onToggleCommandPalette}
          className="h-6 px-2 flex items-center gap-1.5 rounded text-ghost-text-dim hover:bg-white/10 hover:text-ghost-text transition-colors"
          title="Command Palette (Ctrl+Shift+P)"
        >
          <Search className="w-3 h-3" />
          <span className="text-[11px]">Ctrl+Shift+P</span>
        </button>

        <div className="w-px h-4 bg-ghost-border mx-1" />

        {/* Window controls */}
        <button
          onClick={() => window.ghostshell.windowMinimize()}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
          title="Minimize"
        >
          <Minus className="w-3 h-3 text-ghost-text-dim" />
        </button>
        <button
          onClick={handleMaximize}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
          title={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? (
            // Restore icon - two overlapping squares
            <CopyIcon className="w-3 h-3 text-ghost-text-dim" />
          ) : (
            <Square className="w-2.5 h-2.5 text-ghost-text-dim" />
          )}
        </button>
        <button
          onClick={() => window.ghostshell.windowClose()}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-500/80 transition-colors"
          title="Close"
        >
          <X className="w-3 h-3 text-ghost-text-dim" />
        </button>
      </div>
    </div>
  )
}
