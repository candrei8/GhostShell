import {
  Brain,
  FileText,
  FilePlus,
  FileEdit,
  Terminal,
  Search,
  Map,
  ShieldAlert,
  Cpu,
  Circle,
  Globe,
  Link,
  ListTodo,
  ListChecks,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ClaudeActivity } from '../../lib/types'

const activityMap: Record<ClaudeActivity, {
  icon: React.ElementType
  label: string
  color: string
  bgColor: string
  borderColor: string
}> = {
  idle: {
    icon: Circle,
    label: 'Idle',
    color: 'text-ghost-text-dim',
    bgColor: 'bg-ghost-text-dim/15',
    borderColor: 'border-ghost-text-dim/35',
  },
  thinking: {
    icon: Brain,
    label: 'Thinking',
    color: 'text-violet-100',
    bgColor: 'bg-violet-500/25',
    borderColor: 'border-violet-300/45',
  },
  reading: {
    icon: FileText,
    label: 'Reading',
    color: 'text-cyan-100',
    bgColor: 'bg-cyan-500/22',
    borderColor: 'border-cyan-300/45',
  },
  writing: {
    icon: FilePlus,
    label: 'Writing',
    color: 'text-emerald-100',
    bgColor: 'bg-emerald-500/22',
    borderColor: 'border-emerald-300/45',
  },
  editing: {
    icon: FileEdit,
    label: 'Editing',
    color: 'text-amber-100',
    bgColor: 'bg-amber-500/22',
    borderColor: 'border-amber-300/45',
  },
  running_bash: {
    icon: Terminal,
    label: 'Running',
    color: 'text-orange-100',
    bgColor: 'bg-orange-500/22',
    borderColor: 'border-orange-300/45',
  },
  searching: {
    icon: Search,
    label: 'Searching',
    color: 'text-blue-100',
    bgColor: 'bg-blue-500/22',
    borderColor: 'border-blue-300/45',
  },
  planning: {
    icon: Map,
    label: 'Planning',
    color: 'text-indigo-100',
    bgColor: 'bg-indigo-500/22',
    borderColor: 'border-indigo-300/45',
  },
  permission: {
    icon: ShieldAlert,
    label: 'Permission',
    color: 'text-red-100',
    bgColor: 'bg-red-500/22',
    borderColor: 'border-red-300/45',
  },
  sub_agent: {
    icon: Cpu,
    label: 'Sub-agent',
    color: 'text-indigo-100',
    bgColor: 'bg-indigo-500/22',
    borderColor: 'border-indigo-300/45',
  },
  task_create: {
    icon: ListTodo,
    label: 'Creating task',
    color: 'text-teal-100',
    bgColor: 'bg-teal-500/22',
    borderColor: 'border-teal-300/45',
  },
  task_update: {
    icon: ListChecks,
    label: 'Updating task',
    color: 'text-teal-100',
    bgColor: 'bg-teal-500/22',
    borderColor: 'border-teal-300/45',
  },
  web_search: {
    icon: Globe,
    label: 'Web Search',
    color: 'text-sky-100',
    bgColor: 'bg-sky-500/22',
    borderColor: 'border-sky-300/45',
  },
  web_fetch: {
    icon: Link,
    label: 'Fetching',
    color: 'text-sky-100',
    bgColor: 'bg-sky-500/22',
    borderColor: 'border-sky-300/45',
  },
}

interface ActivityIconProps {
  activity: ClaudeActivity
  detail?: string
  size?: 'xs' | 'sm' | 'md'
  showLabel?: boolean
  showGlow?: boolean
  startedAt?: number
  showElapsed?: boolean
}

function smartTruncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  // For file paths, show the end (filename is most important)
  if (text.includes('/') || text.includes('\\')) {
    const parts = text.replace(/\\/g, '/').split('/')
    const fileName = parts[parts.length - 1]
    if (fileName.length <= maxLen) return fileName
    return fileName.slice(0, maxLen - 1) + '\u2026'
  }
  return text.slice(0, maxLen - 1) + '\u2026'
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return '<1s'
  if (ms < 60000) return `${Math.floor(ms / 1000)}s`
  if (ms < 3600000) {
    const mins = Math.floor(ms / 60000)
    const secs = Math.floor((ms % 60000) / 1000)
    return `${mins}m${secs.toString().padStart(2, '0')}s`
  }
  const hrs = Math.floor(ms / 3600000)
  const mins = Math.floor((ms % 3600000) / 60000)
  return `${hrs}h${mins.toString().padStart(2, '0')}m`
}

export function ActivityIcon({
  activity,
  detail,
  size = 'sm',
  showLabel = true,
  startedAt,
  showElapsed = false,
}: ActivityIconProps) {
  const config = activityMap[activity]
  const Icon = config.icon
  const iconSize = size === 'xs' ? 'w-3.5 h-3.5' : size === 'sm' ? 'w-3.5 h-3.5' : 'w-5 h-5'
  const textSize = 'text-xs'
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!startedAt || !showElapsed) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [startedAt, showElapsed])

  const elapsedLabel = useMemo(() => {
    if (!startedAt || !showElapsed) return null
    return formatElapsed(Math.max(0, now - startedAt))
  }, [now, startedAt, showElapsed])

  const truncatedDetail = detail ? smartTruncate(detail, 30) : undefined

  if (activity === 'idle') return null

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${config.bgColor} ${config.color} border ${config.borderColor} px-2.5 py-1 rounded-sm ${textSize} font-medium shadow-minimal transition-colors`}
      title={detail || config.label}
    >
      <Icon className={`${iconSize} shrink-0`} />
      {showLabel && (
        <span className="truncate max-w-[180px] font-medium">
          {config.label}
          {truncatedDetail && (
            <span className="opacity-90 ml-0.5 font-normal">{truncatedDetail}</span>
          )}
        </span>
      )}
      {elapsedLabel && (
        <span className="ml-0.5 px-1.5 py-px rounded bg-black/25 text-[10px] leading-tight font-mono tabular-nums text-white">
          {elapsedLabel}
        </span>
      )}
    </span>
  )
}

export function getActivityConfig(activity: ClaudeActivity) {
  return activityMap[activity]
}
