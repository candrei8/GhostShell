import { Terminal as TerminalIcon } from 'lucide-react'
import { Provider } from '../../lib/types'
import { getProviderColor } from '../../lib/providers'

/**
 * Glyph colours for the pane header. Claude uses its own warm orange here (the
 * CLI's mascot colour) so a wall of Claude panes reads at a glance; the other
 * providers reuse their app-wide colour.
 */
export function getProviderGlyphColor(provider: Provider): string {
  if (provider === 'claude') return '#d97757'
  return getProviderColor(provider)
}

interface ProviderGlyphProps {
  provider?: Provider
  size?: number
}

/** Small per-provider mark shown before the pane name. Solid fills only. */
export function ProviderGlyph({ provider, size = 13 }: ProviderGlyphProps) {
  if (!provider) {
    return <TerminalIcon className="shrink-0 text-white/35" style={{ width: size - 1, height: size - 1 }} aria-hidden />
  }

  const color = getProviderGlyphColor(provider)

  if (provider === 'claude') {
    // Pixel critter: body, arms, four legs, two eyes.
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 12 12"
        shapeRendering="crispEdges"
        className="shrink-0"
        aria-hidden
      >
        <rect x="2" y="2" width="8" height="6" fill={color} />
        <rect x="0" y="4" width="2" height="2" fill={color} />
        <rect x="10" y="4" width="2" height="2" fill={color} />
        <rect x="2.5" y="8" width="1" height="2" fill={color} />
        <rect x="4.5" y="8" width="1" height="2" fill={color} />
        <rect x="6.5" y="8" width="1" height="2" fill={color} />
        <rect x="8.5" y="8" width="1" height="2" fill={color} />
        <rect x="4" y="4" width="1" height="1.5" fill="#1a1a1a" />
        <rect x="7" y="4" width="1" height="1.5" fill="#1a1a1a" />
      </svg>
    )
  }

  if (provider === 'gemini') {
    // Four-point spark.
    return (
      <svg width={size} height={size} viewBox="0 0 12 12" className="shrink-0" aria-hidden>
        <path d="M6 0.5 C6.6 3.6 8.4 5.4 11.5 6 C8.4 6.6 6.6 8.4 6 11.5 C5.4 8.4 3.6 6.6 0.5 6 C3.6 5.4 5.4 3.6 6 0.5 Z" fill={color} />
      </svg>
    )
  }

  // Codex: hexagon with a prompt caret.
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" className="shrink-0" aria-hidden>
      <path d="M6 0.6 L10.8 3.3 V8.7 L6 11.4 L1.2 8.7 V3.3 Z" fill={color} />
      <path d="M4.2 4.4 L5.9 6 L4.2 7.6" stroke="#0b0b0b" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.6 7.7 H8" stroke="#0b0b0b" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}
