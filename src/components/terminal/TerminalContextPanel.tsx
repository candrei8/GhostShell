import { useMemo } from 'react'
import { Bot, FolderTree, TerminalSquare, User, Wrench, X } from 'lucide-react'
import { FileTouch, Provider, TerminalSession } from '../../lib/types'
import { useActivityStore } from '../../stores/activityStore'
import { useCompanionStore, type CompanionEntry } from '../../stores/companionStore'
import { useCommandBlockStore, type CommandBlock } from '../../stores/commandBlockStore'
import { formatClockTime, formatCost, formatDuration, formatTokens, smartTruncatePath } from '../../lib/formatUtils'
import { getContextUsagePercentage, hasContextMetrics } from '../../lib/contextMetrics'
import { getProviderColor, getProviderLabel } from '../../lib/providers'

interface TerminalContextPanelProps {
  session: TerminalSession
  provider?: Provider
  onClose: () => void
}

function getEntryIcon(kind: CompanionEntry['kind']) {
  if (kind === 'user') return <User className="w-3.5 h-3.5" />
  if (kind === 'assistant') return <Bot className="w-3.5 h-3.5" />
  if (kind === 'event') return <Wrench className="w-3.5 h-3.5" />
  return <TerminalSquare className="w-3.5 h-3.5" />
}

function getEntryShell(kind: CompanionEntry['kind']): string {
  if (kind === 'user') return 'bg-sky-500/10 text-sky-200 border-sky-400/20'
  if (kind === 'assistant') return 'bg-white/5 text-ghost-text border-white/10'
  if (kind === 'event') return 'bg-amber-500/10 text-amber-100 border-amber-400/20'
  return 'bg-ghost-accent/10 text-ghost-text border-ghost-accent/20'
}

function getBlockStatusTone(status: CommandBlock['status']): string {
  if (status === 'error') return 'text-red-300 border-red-400/20 bg-red-500/10'
  if (status === 'interrupted') return 'text-amber-200 border-amber-400/20 bg-amber-500/10'
  if (status === 'success') return 'text-emerald-200 border-emerald-400/20 bg-emerald-500/10'
  return 'text-ghost-text-dim border-white/10 bg-white/5'
}

export function TerminalContextPanel({
  session,
  provider,
  onClose,
}: TerminalContextPanelProps) {
  const activityId = session.agentId || session.id
  const activity = useActivityStore((s) => s.activities[activityId])
  const entries = useCompanionStore((s) => s.sessions[session.id]?.entries ?? [])
  const blocks = useCommandBlockStore((s) => s.blocksBySession[session.id] ?? [])
  const metrics = activity?.contextMetrics
  const usagePercentage = getContextUsagePercentage(metrics)
  const recentEntries = useMemo(() => entries.slice(-18).reverse(), [entries])
  const recentBlocks = useMemo(() => blocks.slice(-6).reverse(), [blocks])
  const recentFiles = useMemo(() => {
    if (!activity) return []
    const deduped = new Map<string, FileTouch>()
    for (const touch of [...activity.filesTouched].reverse()) {
      if (!deduped.has(touch.path)) {
        deduped.set(touch.path, touch)
      }
      if (deduped.size >= 6) break
    }
    return Array.from(deduped.values())
  }, [activity])

  const providerLabel = provider ? getProviderLabel(provider) : 'Shell'
  const providerColor = provider ? getProviderColor(provider) : '#71717a'
  const hasMetrics = hasContextMetrics(metrics)
  const hasAnyContext = hasMetrics || recentEntries.length > 0 || recentBlocks.length > 0 || recentFiles.length > 0

  return (
    <aside className="flex h-full w-[min(360px,42vw)] shrink-0 flex-col border-l border-white/8 bg-[linear-gradient(180deg,rgba(10,10,10,0.96),rgba(5,5,5,0.98))] backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex h-2 w-2 rounded-full"
              style={{ backgroundColor: providerColor }}
            />
            <span className="text-[10px] uppercase tracking-[0.24em] text-ghost-text-dim/70">
              Terminal Context
            </span>
          </div>
          <p className="mt-1 truncate text-sm font-semibold text-ghost-text">
            {session.title}
          </p>
        </div>

        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-ghost-text-dim transition-colors hover:bg-white/5 hover:text-ghost-text"
          aria-label="Close terminal context"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="border-b border-white/8 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-ghost-text-dim/60">
              Provider
            </p>
            <p className="mt-1 text-sm font-medium text-ghost-text">{providerLabel}</p>
          </div>
          {activity?.currentActivity && activity.currentActivity !== 'idle' && (
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-ghost-text-dim">
              {activity.currentActivity.replace(/_/g, ' ')}
            </span>
          )}
        </div>

        <div className="mt-4 rounded-2xl border border-white/8 bg-black/20 p-3">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-ghost-text-dim/70">
            <span>Context Usage</span>
            <span>
              {typeof usagePercentage === 'number' ? `${Math.round(usagePercentage)}%` : 'Live'}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${typeof usagePercentage === 'number' ? Math.max(4, usagePercentage) : 6}%`,
                backgroundColor:
                  typeof usagePercentage === 'number' && usagePercentage >= 90
                    ? '#ef4444'
                    : typeof usagePercentage === 'number' && usagePercentage >= 70
                      ? '#f59e0b'
                      : providerColor,
              }}
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl border border-white/8 bg-white/5 px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.16em] text-ghost-text-dim/60">Tokens</p>
              <p className="mt-1 font-mono text-ghost-text">
                {metrics?.tokenEstimate
                  ? metrics.maxTokens > 0
                    ? `${formatTokens(metrics.tokenEstimate)} / ${formatTokens(metrics.maxTokens)}`
                    : formatTokens(metrics.tokenEstimate)
                  : typeof metrics?.usagePercentage === 'number'
                    ? `${Math.round(metrics.usagePercentage)}% reported`
                  : 'No data'}
              </p>
            </div>
            <div className="rounded-xl border border-white/8 bg-white/5 px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.16em] text-ghost-text-dim/60">Turns</p>
              <p className="mt-1 font-mono text-ghost-text">{metrics?.turnCount || 0}</p>
            </div>
            <div className="rounded-xl border border-white/8 bg-white/5 px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.16em] text-ghost-text-dim/60">Cost</p>
              <p className="mt-1 font-mono text-ghost-text">{formatCost(metrics?.costEstimate || 0)}</p>
            </div>
            <div className="rounded-xl border border-white/8 bg-white/5 px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.16em] text-ghost-text-dim/60">Files</p>
              <p className="mt-1 font-mono text-ghost-text">{activity?.filesTouched.length || 0}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {!hasAnyContext && (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/3 px-4 py-5 text-sm text-ghost-text-dim">
            <p className="font-medium text-ghost-text">No context captured yet</p>
            <p className="mt-2 text-xs leading-relaxed text-ghost-text-dim/75">
              {provider
                ? `Waiting for ${providerLabel} to emit prompts, tool activity or context stats.`
                : 'Run claude, codex or gemini in this terminal and the panel will start filling automatically.'}
            </p>
          </div>
        )}

        {recentEntries.length > 0 && (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[10px] uppercase tracking-[0.22em] text-ghost-text-dim/60">
                Conversation
              </h3>
              <span className="text-[10px] text-ghost-text-dim/40">{recentEntries.length} items</span>
            </div>
            <div className="space-y-2">
              {recentEntries.map((entry) => (
                <div
                  key={entry.id}
                  className={`rounded-2xl border px-3 py-2.5 ${getEntryShell(entry.kind)}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em]">
                      {getEntryIcon(entry.kind)}
                      <span>{entry.kind}</span>
                    </div>
                    <span className="text-[10px] text-ghost-text-dim/65">
                      {formatClockTime(entry.timestamp)}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed">
                    {entry.text}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {recentBlocks.length > 0 && (
          <section className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[10px] uppercase tracking-[0.22em] text-ghost-text-dim/60">
                Commands
              </h3>
              <span className="text-[10px] text-ghost-text-dim/40">{recentBlocks.length} recent</span>
            </div>
            <div className="space-y-2">
              {recentBlocks.map((block) => (
                <div key={block.id} className="rounded-2xl border border-white/8 bg-white/4 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-mono text-xs text-ghost-text">{block.command}</p>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] ${getBlockStatusTone(block.status)}`}>
                      {block.status}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[10px] text-ghost-text-dim/65">
                    <span>{block.cwd ? smartTruncatePath(block.cwd, 32) : 'cwd unknown'}</span>
                    <span>·</span>
                    <span>
                      {block.durationMs !== undefined ? formatDuration(0, block.durationMs) : 'running'}
                    </span>
                    <span>·</span>
                    <span>{block.lineCount} lines</span>
                  </div>
                  {block.output && (
                    <p className="mt-2 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-ghost-text-dim">
                      {block.output.slice(0, 220)}
                      {block.output.length > 220 ? '...' : ''}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {recentFiles.length > 0 && (
          <section className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[10px] uppercase tracking-[0.22em] text-ghost-text-dim/60">
                Recent Files
              </h3>
            </div>
            <div className="space-y-2">
              {recentFiles.map((touch) => (
                <div key={`${touch.path}-${touch.timestamp}`} className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/4 px-3 py-2">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-2 text-ghost-text-dim">
                    <FolderTree className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-ghost-text">{smartTruncatePath(touch.path, 40)}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-ghost-text-dim/60">
                      {touch.operation} · {formatClockTime(touch.timestamp)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </aside>
  )
}
