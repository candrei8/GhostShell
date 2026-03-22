import {
  Terminal,
  Code2,
  Radar,
  ShieldCheck,
  Hexagon,
  LineChart,
  BrainCircuit,
  Binary,
  Aperture,
  Braces,
  TerminalSquare,
  Cpu,
  Rocket,
  // Persona icons
  Building2,
  Zap,
  Lock,
  Gauge,
  Paintbrush,
  Microscope,
  ScanLine,
  ShieldAlert,
  GraduationCap,
  Shield,
  Workflow,
  BarChart3,
} from 'lucide-react'

// ─── Shared icon maps (single source of truth) ──────────────

export const ROLE_ICONS: Record<string, React.FC<{ className?: string }>> = {
  Terminal,
  Code2,
  Radar,
  ShieldCheck,
  LineChart,
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

/** Icons used by coding personas — keyed by lucide icon name */
export const PERSONA_ICONS: Record<string, React.FC<{ className?: string }>> = {
  // Builder personas
  Building2,
  Zap,
  ShieldCheck,
  Lock,
  Gauge,
  Paintbrush,
  // Scout personas
  Microscope,
  ScanLine,
  // Reviewer personas
  ShieldAlert,
  GraduationCap,
  // Coordinator personas
  Shield,
  Workflow,
  // Analyst personas
  BarChart3,
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

export function PersonaIcon({ iconName, className, color }: { iconName: string; className?: string; color?: string }) {
  const Icon = PERSONA_ICONS[iconName] || ROLE_ICONS[iconName]
  if (!Icon) return null
  return color
    ? <span style={{ color, display: 'inline-flex' }}><Icon className={className} /></span>
    : <Icon className={className} />
}
