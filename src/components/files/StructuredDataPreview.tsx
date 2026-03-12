import { useMemo, useState } from 'react'
import { AlertTriangle, Braces, ChevronDown, ChevronRight } from 'lucide-react'
import { isJsonFile } from '../../lib/fileUtils'

type StructuredDataPreviewProps = {
  content: string
  fileName: string
  totalLines: number
}

type JsonValue =
  | null
  | string
  | number
  | boolean
  | JsonValue[]
  | { [key: string]: JsonValue }

function formatJsonValue(value: JsonValue): { label: string; className: string } {
  if (value === null) {
    return { label: 'null', className: 'text-violet-200' }
  }

  if (typeof value === 'string') {
    return { label: `"${value}"`, className: 'text-emerald-200' }
  }

  if (typeof value === 'number') {
    return { label: String(value), className: 'text-amber-200' }
  }

  if (typeof value === 'boolean') {
    return { label: value ? 'true' : 'false', className: 'text-cyan-200' }
  }

  if (Array.isArray(value)) {
    return { label: `[${value.length}]`, className: 'text-ghost-text-dim/55' }
  }

  return { label: `{${Object.keys(value).length}}`, className: 'text-ghost-text-dim/55' }
}

function JsonNode({
  label,
  value,
  depth = 0,
}: {
  label?: string
  value: JsonValue
  depth?: number
}) {
  const isBranch = typeof value === 'object' && value !== null
  const [collapsed, setCollapsed] = useState(depth > 1)
  const indent = depth * 18

  if (!isBranch) {
    const formatted = formatJsonValue(value)
    return (
      <div className="flex items-start gap-2 px-3 py-1.5 text-[11px] leading-6" style={{ paddingLeft: 12 + indent }}>
        {label && (
          <span className="shrink-0 text-sky-100/90">
            {label}
            <span className="text-ghost-text-dim/45">:</span>
          </span>
        )}
        <span className={formatted.className}>{formatted.label}</span>
      </div>
    )
  }

  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index), item] as const)
    : Object.entries(value)
  const summary = formatJsonValue(value)

  return (
    <div>
      <button
        onClick={() => setCollapsed((current) => !current)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] leading-6 transition-colors hover:bg-white/[0.04]"
        style={{ paddingLeft: 12 + indent }}
      >
        <span className="ghost-soft-pill flex h-5 w-5 items-center justify-center rounded-md text-ghost-text-dim">
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </span>
        {label && (
          <span className="shrink-0 text-sky-100/90">
            {label}
            <span className="text-ghost-text-dim/45">:</span>
          </span>
        )}
        <span className={summary.className}>{Array.isArray(value) ? 'Array' : 'Object'}</span>
        <span className="ghost-soft-pill rounded-full px-2 py-0.5 text-[10px] text-ghost-text-dim">
          {summary.label}
        </span>
      </button>

      {!collapsed && (
        <div className="border-l border-white/6">
          {entries.map(([entryLabel, entryValue]) => (
            <JsonNode
              key={`${label || 'root'}-${entryLabel}`}
              label={entryLabel}
              value={entryValue}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function renderYamlLine(line: string, index: number) {
  const indent = line.match(/^\s*/)?.[0].length || 0
  const level = Math.floor(indent / 2)
  const trimmed = line.trim()

  if (!trimmed) {
    return <div key={index} className="h-2" />
  }

  if (trimmed.startsWith('#')) {
    return (
      <div
        key={index}
        className="px-3 py-1 font-mono text-[11px] italic text-ghost-text-dim/60"
        style={{ paddingLeft: 12 + level * 18 }}
      >
        {trimmed}
      </div>
    )
  }

  const docMarker = trimmed === '---' || trimmed === '...'
  if (docMarker) {
    return (
      <div
        key={index}
        className="px-3 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-violet-100/85"
        style={{ paddingLeft: 12 + level * 18 }}
      >
        {trimmed}
      </div>
    )
  }

  const listMatch = line.match(/^(\s*-\s+)(.*)$/)
  const keyValueMatch = line.match(/^(\s*)([^:#]+):(.*)$/)

  return (
    <div
      key={index}
      className="flex items-start gap-2 border-b border-white/[0.02] px-3 py-1.5 font-mono text-[11px] leading-6"
      style={{ paddingLeft: 12 + level * 18 }}
    >
      <span className="w-5 shrink-0 text-right tabular-nums text-ghost-text-dim/20">{index + 1}</span>
      <div className="flex min-w-0 flex-1 flex-wrap gap-x-2">
        {listMatch ? (
          <>
            <span className="text-cyan-200">-</span>
            <span className="min-w-0 break-all text-ghost-text/86">{listMatch[2].trim()}</span>
          </>
        ) : keyValueMatch ? (
          <>
            <span className="text-sky-100/90">{keyValueMatch[2].trim()}</span>
            <span className="text-ghost-text-dim/35">:</span>
            <span className="min-w-0 break-all text-emerald-200/90">{keyValueMatch[3].trim() || '(section)'}</span>
          </>
        ) : (
          <span className="min-w-0 break-all text-ghost-text/86">{trimmed}</span>
        )}
      </div>
    </div>
  )
}

export function StructuredDataPreview({ content, fileName, totalLines }: StructuredDataPreviewProps) {
  const isJson = isJsonFile(fileName)
  const visibleLines = content.split('\n').length
  const parsedJson = useMemo(() => {
    if (!isJson) return null
    try {
      return JSON.parse(content) as JsonValue
    } catch {
      return null
    }
  }, [content, isJson])

  if (isJson && parsedJson === null) {
    return (
      <div className="px-4 py-4">
        <div className="rounded-2xl border border-amber-300/18 bg-amber-300/[0.06] px-4 py-3 text-sm text-amber-50/88">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Structured JSON preview unavailable.</p>
              <p className="mt-1 text-xs text-amber-50/70">
                The preview is probably truncated. Switch to source mode if you need the raw lines.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="ghost-soft-pill inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-cyan-100">
          <Braces className="h-3 w-3" />
          {isJson ? 'JSON tree' : 'YAML structure'}
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/8 bg-black/22">
        <div className="ghost-toolbar-surface flex items-center justify-between px-3 py-2">
          <span className="text-[10px] uppercase tracking-[0.16em] text-ghost-text-dim/55">
            Structured preview
          </span>
          <span className="ghost-soft-pill rounded-full px-2 py-0.5 text-[10px] text-ghost-text-dim">
            {totalLines} lines
          </span>
        </div>

        <div className="py-2">
          {isJson && parsedJson !== null ? (
            <JsonNode value={parsedJson} />
          ) : (
            <div className="space-y-0.5">
              {content.split('\n').map((line, index) => renderYamlLine(line, index))}
            </div>
          )}
        </div>
      </div>

      {totalLines > visibleLines && (
        <div className="mt-4 text-[11px] text-ghost-text-dim/45">
          Showing the first {visibleLines} of {totalLines} lines.
        </div>
      )}
    </div>
  )
}
