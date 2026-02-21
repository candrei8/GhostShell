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
import { ClaudeActivity } from '../../lib/types'

const activityMap: Record<ClaudeActivity, {
  icon: React.ElementType
  label: string
  color: string
  bgColor: string
}> = {
  idle: {
    icon: Circle,
    label: 'Idle',
    color: 'text-ghost-text-dim/50',
    bgColor: 'bg-ghost-text-dim/10',
  },
  thinking: {
    icon: Brain,
    label: 'Thinking',
    color: 'text-purple-400',
    bgColor: 'bg-purple-400/10',
  },
  reading: {
    icon: FileText,
    label: 'Reading',
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-400/10',
  },
  writing: {
    icon: FilePlus,
    label: 'Writing',
    color: 'text-green-400',
    bgColor: 'bg-green-400/10',
  },
  editing: {
    icon: FileEdit,
    label: 'Editing',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-400/10',
  },
  running_bash: {
    icon: Terminal,
    label: 'Running',
    color: 'text-orange-400',
    bgColor: 'bg-orange-400/10',
  },
  searching: {
    icon: Search,
    label: 'Searching',
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10',
  },
  planning: {
    icon: Map,
    label: 'Planning',
    color: 'text-ghost-accent',
    bgColor: 'bg-ghost-accent/10',
  },
  permission: {
    icon: ShieldAlert,
    label: 'Permission',
    color: 'text-red-400',
    bgColor: 'bg-red-400/10',
  },
  sub_agent: {
    icon: Cpu,
    label: 'Sub-agent',
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-400/10',
  },
  task_create: {
    icon: ListTodo,
    label: 'Creating task',
    color: 'text-teal-400',
    bgColor: 'bg-teal-400/10',
  },
  task_update: {
    icon: ListChecks,
    label: 'Updating task',
    color: 'text-teal-400',
    bgColor: 'bg-teal-400/10',
  },
  web_search: {
    icon: Globe,
    label: 'Web Search',
    color: 'text-sky-400',
    bgColor: 'bg-sky-400/10',
  },
  web_fetch: {
    icon: Link,
    label: 'Fetching',
    color: 'text-sky-400',
    bgColor: 'bg-sky-400/10',
  },
}

interface ActivityIconProps {
  activity: ClaudeActivity
  detail?: string
  size?: 'xs' | 'sm' | 'md'
  showLabel?: boolean
  showGlow?: boolean
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

export function ActivityIcon({ activity, detail, size = 'sm', showLabel = true }: ActivityIconProps) {
  const config = activityMap[activity]
  const Icon = config.icon
  const iconSize = size === 'xs' ? 'w-3 h-3' : size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'
  const textSize = 'text-[11px]'

  if (activity === 'idle') return null

  const truncatedDetail = detail ? smartTruncate(detail, 30) : undefined

  return (
    <span
      className={`inline-flex items-center gap-1 ${config.bgColor} ${config.color} px-2 py-0.5 rounded ${textSize} transition-all`}
      title={detail || config.label}
    >
      <Icon className={`${iconSize} shrink-0`} />
      {showLabel && (
        <span className="truncate max-w-[140px] font-medium">
          {config.label}
          {truncatedDetail && (
            <span className="opacity-60 ml-0.5 font-normal">{truncatedDetail}</span>
          )}
        </span>
      )}
    </span>
  )
}

export function getActivityConfig(activity: ClaudeActivity) {
  return activityMap[activity]
}
