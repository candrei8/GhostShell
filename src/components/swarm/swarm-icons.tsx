import {
  Terminal,
  Code2,
  Radar,
  ShieldCheck,
  Hexagon,
  BrainCircuit,
  Binary,
  Aperture,
  Braces,
  TerminalSquare,
  Cpu,
  Rocket,
} from 'lucide-react'

// ─── Shared icon maps (single source of truth) ──────────────

export const ROLE_ICONS: Record<string, React.FC<{ className?: string }>> = {
  Terminal,
  Code2,
  Radar,
  ShieldCheck,
  Hexagon,
}

export const CLI_ICONS: Record<string, React.FC<{ className?: string }>> = {
  BrainCircuit,
  Binary,
  Aperture,
  Braces,
  TerminalSquare,
  Cpu,
  Rocket,
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
