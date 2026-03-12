import {
  Crown,
  Hammer,
  Search,
  Eye,
  Wrench,
  Ghost,
  Bot,
  Sparkles,
  Code,
  MousePointer,
  Cpu,
  Zap,
} from 'lucide-react'

// ─── Shared icon maps (single source of truth) ──────────────

export const ROLE_ICONS: Record<string, React.FC<{ className?: string }>> = {
  Crown,
  Hammer,
  Search,
  Eye,
  Wrench,
}

export const CLI_ICONS: Record<string, React.FC<{ className?: string }>> = {
  Ghost,
  Bot,
  Sparkles,
  Code,
  MousePointer,
  Cpu,
  Zap,
}

// ─── Helper components ──────────────────────────────────────
// Lucide icons only accept `className`, not `style`.
// Use a wrapper div to apply inline color.

export function RoleIcon({ iconName, className, color }: { iconName: string; className?: string; color?: string }) {
  const Icon = ROLE_ICONS[iconName]
  if (!Icon) return null
  return color
    ? <span style={{ color, display: 'inline-flex' }}><Icon className={className} /></span>
    : <Icon className={className} />
}

export function CliIcon({ iconName, className, color }: { iconName: string; className?: string; color?: string }) {
  const Icon = CLI_ICONS[iconName]
  if (!Icon) return null
  return color
    ? <span style={{ color, display: 'inline-flex' }}><Icon className={className} /></span>
    : <Icon className={className} />
}
