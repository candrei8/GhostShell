// SwarmToolResultDisplay — Structured display components per tool type
// Renders tool call results in a rich, formatted way inspired by MiroFish's
// per-tool display components (InsightForge, PanoramaSearch, etc.)

import { FileText, Terminal, Search, Code, Users, Edit3, FolderOpen } from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────

interface ToolDisplayProps {
  toolName: string
  detail: string
  expanded?: boolean
}

// Tool metadata for badges and colors
const TOOL_META: Record<string, { icon: typeof FileText; color: string; label: string; bg: string }> = {
  Read:      { icon: FileText, color: '#38bdf8', label: 'READ',   bg: 'rgba(56,189,248,0.08)' },
  Write:     { icon: Edit3,    color: '#f59e0b', label: 'WRITE',  bg: 'rgba(245,158,11,0.08)' },
  Edit:      { icon: Edit3,    color: '#fb923c', label: 'EDIT',   bg: 'rgba(251,146,60,0.08)' },
  Bash:      { icon: Terminal,  color: '#34d399', label: 'BASH',   bg: 'rgba(52,211,153,0.08)' },
  ShellTool: { icon: Terminal,  color: '#34d399', label: 'SHELL',  bg: 'rgba(52,211,153,0.08)' },
  Grep:      { icon: Search,   color: '#8b5cf6', label: 'GREP',   bg: 'rgba(139,92,246,0.08)' },
  GrepTool:  { icon: Search,   color: '#8b5cf6', label: 'GREP',   bg: 'rgba(139,92,246,0.08)' },
  Glob:      { icon: FolderOpen, color: '#a78bfa', label: 'GLOB', bg: 'rgba(167,139,250,0.08)' },
  GlobTool:  { icon: FolderOpen, color: '#a78bfa', label: 'GLOB', bg: 'rgba(167,139,250,0.08)' },
  Agent:     { icon: Users,    color: '#ec4899', label: 'AGENT',  bg: 'rgba(236,72,153,0.08)' },
  WebSearch: { icon: Search,   color: '#06b6d4', label: 'WEB',    bg: 'rgba(6,182,212,0.08)' },
  WebFetch:  { icon: Search,   color: '#06b6d4', label: 'FETCH',  bg: 'rgba(6,182,212,0.08)' },
}

const DEFAULT_TOOL: typeof TOOL_META[string] = { icon: Code, color: '#64748b', label: 'TOOL', bg: 'rgba(100,116,139,0.08)' }

// ─── Main Component ─────────────────────────────────────────

export function SwarmToolResultDisplay({ toolName, detail, expanded = false }: ToolDisplayProps) {
  const meta = TOOL_META[toolName] || DEFAULT_TOOL
  const Icon = meta.icon

  // Parse detail based on tool type
  const parsed = parseToolDetail(toolName, detail)

  return (
    <div
      className="rounded overflow-hidden"
      style={{ background: meta.bg, borderLeft: `2px solid ${meta.color}` }}
    >
      {/* Tool badge header */}
      <div className="flex items-center gap-1.5 px-2 py-1">
        <Icon className="w-3 h-3 shrink-0" style={{ color: meta.color }} />
        <span
          className="text-[7px] font-mono font-bold uppercase px-1 py-px rounded"
          style={{ background: `${meta.color}20`, color: meta.color, letterSpacing: '0.06em' }}
        >
          {meta.label}
        </span>
        {parsed.target && (
          <span className="text-[8px] font-mono text-white/30 truncate flex-1 min-w-0">
            {parsed.target}
          </span>
        )}
      </div>

      {/* Content area */}
      {expanded && parsed.content && (
        <div
          className="px-2 py-1.5"
          style={{ borderTop: `1px solid ${meta.color}15` }}
        >
          {parsed.type === 'file' && <FileContent content={parsed.content} color={meta.color} />}
          {parsed.type === 'diff' && <DiffContent content={parsed.content} />}
          {parsed.type === 'terminal' && <TerminalContent content={parsed.content} />}
          {parsed.type === 'search' && <SearchContent content={parsed.content} color={meta.color} />}
          {parsed.type === 'agent' && <AgentContent content={parsed.content} />}
          {parsed.type === 'text' && <TextContent content={parsed.content} />}
        </div>
      )}
    </div>
  )
}

// ─── Tool Badge Only (inline, for compact views) ───────────

export function ToolBadge({ toolName }: { toolName: string }) {
  const meta = TOOL_META[toolName] || DEFAULT_TOOL
  const Icon = meta.icon
  return (
    <span
      className="inline-flex items-center gap-1 text-[7px] font-mono font-bold uppercase px-1.5 py-px rounded shrink-0"
      style={{ background: `${meta.color}15`, color: meta.color, letterSpacing: '0.05em' }}
    >
      <Icon className="w-2.5 h-2.5" />
      {meta.label}
    </span>
  )
}

// ─── Get tool color ─────────────────────────────────────────

export function getToolColor(toolName: string): string {
  return (TOOL_META[toolName] || DEFAULT_TOOL).color
}

// ─── Detail Parser ──────────────────────────────────────────

interface ParsedDetail {
  type: 'file' | 'diff' | 'terminal' | 'search' | 'agent' | 'text'
  target?: string
  content?: string
}

function parseToolDetail(toolName: string, detail: string): ParsedDetail {
  switch (toolName) {
    case 'Read':
      return { type: 'file', target: extractPath(detail), content: detail }
    case 'Write':
      return { type: 'diff', target: extractPath(detail), content: detail }
    case 'Edit':
      return { type: 'diff', target: extractPath(detail), content: detail }
    case 'Bash':
    case 'ShellTool':
    case 'shell':
      return { type: 'terminal', target: extractCommand(detail), content: detail }
    case 'Grep':
    case 'GrepTool':
    case 'Glob':
    case 'GlobTool':
      return { type: 'search', target: extractPattern(detail), content: detail }
    case 'Agent':
      return { type: 'agent', target: extractAgentDesc(detail), content: detail }
    default:
      return { type: 'text', target: toolName, content: detail }
  }
}

function extractPath(detail: string): string {
  // Try to extract file path from detail
  const match = detail.match(/([A-Z]:\\[^\s]+|\/[^\s]+\.\w+)/)
  return match ? match[1].split('/').pop() || match[1].split('\\').pop() || detail : detail.slice(0, 40)
}

function extractCommand(detail: string): string {
  return detail.slice(0, 50)
}

function extractPattern(detail: string): string {
  const colonIdx = detail.indexOf(':')
  return colonIdx > 0 ? detail.slice(colonIdx + 1).trim().slice(0, 30) : detail.slice(0, 30)
}

function extractAgentDesc(detail: string): string {
  return detail.slice(0, 40)
}

// ─── Specialized Content Renderers ──────────────────────────

function FileContent({ content, color }: { content: string; color: string }) {
  const lines = content.split('\n').slice(0, 8)
  return (
    <div className="font-mono text-[8px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.35)' }}>
      {lines.map((line, i) => (
        <div key={i} className="flex">
          <span className="w-5 shrink-0 text-right mr-2" style={{ color: 'rgba(255,255,255,0.15)' }}>{i + 1}</span>
          <span className="truncate">{line}</span>
        </div>
      ))}
      {content.split('\n').length > 8 && (
        <span style={{ color: 'rgba(255,255,255,0.15)' }}>... +{content.split('\n').length - 8} lines</span>
      )}
    </div>
  )
}

function DiffContent({ content }: { content: string }) {
  const lines = content.split('\n').slice(0, 10)
  return (
    <div className="font-mono text-[8px] leading-relaxed">
      {lines.map((line, i) => {
        const isAdd = line.startsWith('+') || line.startsWith('>')
        const isDel = line.startsWith('-') || line.startsWith('<')
        return (
          <div key={i} style={{
            color: isAdd ? '#34d399' : isDel ? '#ef4444' : 'rgba(255,255,255,0.3)',
            background: isAdd ? 'rgba(52,211,153,0.05)' : isDel ? 'rgba(239,68,68,0.05)' : 'transparent',
          }}>
            {line}
          </div>
        )
      })}
    </div>
  )
}

function TerminalContent({ content }: { content: string }) {
  return (
    <div
      className="font-mono text-[8px] leading-relaxed px-1.5 py-1 rounded"
      style={{ background: 'rgba(0,0,0,0.3)', color: 'rgba(52,211,153,0.7)', maxHeight: 80, overflow: 'auto' }}
    >
      {content.split('\n').slice(0, 10).map((line, i) => (
        <div key={i}>{line || '\u00A0'}</div>
      ))}
    </div>
  )
}

function SearchContent({ content, color }: { content: string; color: string }) {
  const lines = content.split('\n').slice(0, 6)
  return (
    <div className="font-mono text-[8px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.3)' }}>
      {lines.map((line, i) => (
        <div key={i} className="truncate">{line}</div>
      ))}
    </div>
  )
}

function AgentContent({ content }: { content: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Users className="w-3 h-3" style={{ color: '#ec4899' }} />
      <span className="text-[8px] font-mono" style={{ color: 'rgba(236,72,153,0.6)' }}>{content}</span>
    </div>
  )
}

function TextContent({ content }: { content: string }) {
  return (
    <div className="text-[8px] font-mono" style={{ color: 'rgba(255,255,255,0.3)', wordBreak: 'break-word' }}>
      {content.length > 300 ? content.slice(0, 300) + '...' : content}
    </div>
  )
}
