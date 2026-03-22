// SwarmReACTReportView — live report generation progress view.
// Shows section-by-section rendering as the ReACT reporter generates each section.
// Status badges per section, streaming text display, and completion state.

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText,
  CheckCircle2,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Wrench,
  Copy,
} from 'lucide-react'
import type { ReACTReport, ReACTReportSection, ReACTReportStatus } from '../../lib/swarm-react-reporter'

// ─── Props ──────────────────────────────────────────────────

interface SwarmReACTReportViewProps {
  report: Partial<ReACTReport> | null
  isGenerating: boolean
}

// ─── Status Badge ───────────────────────────────────────────

const STATUS_META: Record<ReACTReportStatus, { label: string; color: string; bg: string }> = {
  planning: { label: 'Planning', color: 'text-amber-400', bg: 'bg-amber-400/10' },
  generating: { label: 'Generating', color: 'text-sky-400', bg: 'bg-sky-400/10' },
  complete: { label: 'Complete', color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
  error: { label: 'Error', color: 'text-rose-400', bg: 'bg-rose-400/10' },
}

function ReportStatusBadge({ status }: { status: ReACTReportStatus }) {
  const meta = STATUS_META[status] || STATUS_META.planning
  return (
    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider ${meta.color} ${meta.bg}`}>
      {(status === 'planning' || status === 'generating') && (
        <Loader2 className="w-2.5 h-2.5 animate-spin" />
      )}
      {status === 'complete' && <CheckCircle2 className="w-2.5 h-2.5" />}
      {status === 'error' && <AlertCircle className="w-2.5 h-2.5" />}
      {meta.label}
    </span>
  )
}

// ─── Component ──────────────────────────────────────────────

export function SwarmReACTReportView({ report, isGenerating }: SwarmReACTReportViewProps) {
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set())
  const [copied, setCopied] = useState(false)

  // Auto-expand sections as they arrive
  useEffect(() => {
    if (report?.sections) {
      const newExpanded = new Set<number>()
      // Expand the latest section and the first section
      if (report.sections.length > 0) newExpanded.add(0)
      if (report.sections.length > 1) newExpanded.add(report.sections.length - 1)
      setExpandedSections(newExpanded)
    }
  }, [report?.sections?.length])

  const toggleSection = useCallback((index: number) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }, [])

  const handleCopy = useCallback(async () => {
    if (!report?.sections) return
    const text = report.sections.map(s => s.content).join('\n\n---\n\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard may not be available
    }
  }, [report?.sections])

  if (!report && !isGenerating) return null

  const status = (report?.status || 'planning') as ReACTReportStatus
  const sections = report?.sections || []
  const totalExpectedSections = 5 // We always generate 5 sections

  return (
    <motion.div
      className="rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm overflow-hidden"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.01]">
        <BookOpen className="w-3.5 h-3.5 text-sky-400" />
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-sky-400">
          ReACT Report
        </h3>
        <div className="ml-auto flex items-center gap-2">
          {sections.length > 0 && (
            <span className="text-[9px] text-ghost-text-dim/40 font-mono">
              {sections.length}/{totalExpectedSections} sections
            </span>
          )}
          <ReportStatusBadge status={status} />
        </div>
      </div>

      {/* Progress Bar */}
      {(status === 'planning' || status === 'generating') && (
        <div className="h-0.5 bg-white/[0.03]">
          <motion.div
            className="h-full bg-sky-400/40"
            initial={{ width: '0%' }}
            animate={{
              width: `${(sections.length / totalExpectedSections) * 100}%`,
            }}
            transition={{ duration: 0.3 }}
          />
        </div>
      )}

      {/* Sections */}
      <div className="p-3 space-y-2">
        {sections.length === 0 && isGenerating && (
          <div className="flex items-center gap-2 py-4 justify-center">
            <Loader2 className="w-3.5 h-3.5 text-sky-400/40 animate-spin" />
            <span className="text-[10px] text-ghost-text-dim/40">
              Analyzing swarm output...
            </span>
          </div>
        )}

        <AnimatePresence mode="popLayout">
          {sections.map((section, idx) => (
            <motion.div
              key={idx}
              layout
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, delay: 0.05 }}
              className="rounded-lg border border-white/[0.05] bg-white/[0.01] overflow-hidden"
            >
              {/* Section Header */}
              <button
                onClick={() => toggleSection(idx)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.02] transition-colors"
              >
                <SectionIcon index={idx} />
                <span className="text-[11px] font-semibold text-ghost-text-dim flex-1 text-left">
                  {section.title}
                </span>

                {/* Tools used */}
                {section.toolsUsed.length > 0 && (
                  <span className="flex items-center gap-0.5 text-[8px] text-ghost-text-dim/30 font-mono">
                    <Wrench className="w-2.5 h-2.5" />
                    {section.toolsUsed.length}
                  </span>
                )}

                <CheckCircle2 className="w-3 h-3 text-emerald-400/50 shrink-0" />

                {expandedSections.has(idx) ? (
                  <ChevronUp className="w-3 h-3 text-ghost-text-dim/30 shrink-0" />
                ) : (
                  <ChevronDown className="w-3 h-3 text-ghost-text-dim/30 shrink-0" />
                )}
              </button>

              {/* Section Content */}
              <AnimatePresence>
                {expandedSections.has(idx) && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pb-3 pt-1 border-t border-white/[0.04]">
                      <div className="prose-ghost max-h-80 overflow-y-auto">
                        <MarkdownContent content={section.content} />
                      </div>
                      {section.toolsUsed.length > 0 && (
                        <div className="flex items-center gap-1 mt-2 pt-2 border-t border-white/[0.03]">
                          <Wrench className="w-2.5 h-2.5 text-ghost-text-dim/20" />
                          <span className="text-[8px] text-ghost-text-dim/25 font-mono">
                            {section.toolsUsed.join(', ')}
                          </span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Generating indicator for next section */}
        {status === 'generating' && sections.length < totalExpectedSections && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/[0.04] border-dashed"
          >
            <Loader2 className="w-3 h-3 text-sky-400/30 animate-spin" />
            <span className="text-[10px] text-ghost-text-dim/30">
              Generating next section...
            </span>
          </motion.div>
        )}

        {/* Actions */}
        {status === 'complete' && sections.length > 0 && (
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleCopy}
              className="h-6 px-2.5 rounded-md border border-white/10 bg-white/[0.02] text-[9px] font-semibold uppercase tracking-[0.1em] text-ghost-text-dim hover:text-sky-400 hover:border-sky-400/25 hover:bg-sky-400/5 transition-colors flex items-center gap-1"
            >
              <Copy className="w-2.5 h-2.5" />
              {copied ? 'Copied' : 'Copy Report'}
            </button>
            <span className="text-[9px] text-ghost-text-dim/30 ml-auto">
              {report?.completedAt
                ? `Generated in ${formatMs((report.completedAt || 0) - (report.startedAt || 0))}`
                : ''}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ─── Sub-components ─────────────────────────────────────────

/** Section icon based on index (maps to our 5 expected sections). */
function SectionIcon({ index }: { index: number }) {
  const icons = [
    <FileText className="w-3 h-3 text-sky-400/60" />,      // Executive Summary
    <FileText className="w-3 h-3 text-emerald-400/60" />,   // Changes Made
    <FileText className="w-3 h-3 text-purple-400/60" />,    // Architecture
    <FileText className="w-3 h-3 text-amber-400/60" />,     // Quality
    <FileText className="w-3 h-3 text-rose-400/60" />,      // Recommendations
  ]
  return icons[index] || <FileText className="w-3 h-3 text-ghost-text-dim/40" />
}

/** Simple markdown-to-JSX renderer for report content. */
function MarkdownContent({ content }: { content: string }) {
  // Split into lines and render with basic markdown support
  const lines = content.split('\n')

  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        const trimmed = line.trimStart()

        // Skip empty lines but add spacing
        if (trimmed.length === 0) return <div key={i} className="h-1" />

        // H2 heading
        if (trimmed.startsWith('## ')) {
          return (
            <h4 key={i} className="text-[11px] font-semibold text-ghost-text pt-1">
              {trimmed.slice(3)}
            </h4>
          )
        }

        // H3 heading
        if (trimmed.startsWith('### ')) {
          return (
            <h5 key={i} className="text-[10px] font-semibold text-ghost-text-dim/80 pt-0.5">
              {trimmed.slice(4)}
            </h5>
          )
        }

        // Table header/separator
        if (trimmed.startsWith('|---') || trimmed.match(/^\|[\s-]+\|/)) {
          return null // Skip table separators
        }

        // Table row
        if (trimmed.startsWith('| ')) {
          const cells = trimmed.split('|').filter(c => c.trim().length > 0)
          return (
            <div key={i} className="flex gap-2 text-[10px] text-ghost-text-dim/60 font-mono">
              {cells.map((cell, ci) => (
                <span key={ci} className="truncate" style={{ minWidth: 0, flex: ci === 0 ? 2 : 1 }}>
                  {renderInline(cell.trim())}
                </span>
              ))}
            </div>
          )
        }

        // Bullet point
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div key={i} className="flex items-start gap-1.5 text-[10px] text-ghost-text-dim/60">
              <span className="text-sky-400/40 mt-0.5 shrink-0">-</span>
              <span className="leading-relaxed">{renderInline(trimmed.slice(2))}</span>
            </div>
          )
        }

        // Bold line (starts with **)
        if (trimmed.startsWith('**') && trimmed.includes(':**')) {
          const colonIdx = trimmed.indexOf(':**')
          const label = trimmed.slice(2, colonIdx)
          const value = trimmed.slice(colonIdx + 3).replace(/\*\*$/, '')
          return (
            <div key={i} className="text-[10px] text-ghost-text-dim/60">
              <span className="font-semibold text-ghost-text-dim/80">{label}:</span>{' '}
              {renderInline(value)}
            </div>
          )
        }

        // Italic line (starts with _)
        if (trimmed.startsWith('_') && trimmed.endsWith('_')) {
          return (
            <p key={i} className="text-[9px] text-ghost-text-dim/35 italic">
              {trimmed.slice(1, -1)}
            </p>
          )
        }

        // HR
        if (trimmed === '---') {
          return <hr key={i} className="border-white/[0.04] my-1" />
        }

        // Regular paragraph
        return (
          <p key={i} className="text-[10px] text-ghost-text-dim/60 leading-relaxed">
            {renderInline(trimmed)}
          </p>
        )
      })}
    </div>
  )
}

/** Render inline markdown (bold, code, italic). */
function renderInline(text: string): React.ReactNode {
  // Simple inline rendering: **bold**, `code`, _italic_
  const parts: React.ReactNode[] = []
  let remaining = text
  let key = 0

  while (remaining.length > 0) {
    // Bold
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/)
    // Code
    const codeMatch = remaining.match(/`(.+?)`/)

    // Find the earliest match
    const boldIdx = boldMatch?.index ?? Infinity
    const codeIdx = codeMatch?.index ?? Infinity

    if (boldIdx === Infinity && codeIdx === Infinity) {
      parts.push(remaining)
      break
    }

    if (boldIdx <= codeIdx && boldMatch) {
      if (boldIdx > 0) parts.push(remaining.slice(0, boldIdx))
      parts.push(
        <span key={key++} className="font-semibold text-ghost-text-dim/80">
          {boldMatch[1]}
        </span>,
      )
      remaining = remaining.slice(boldIdx + boldMatch[0].length)
    } else if (codeMatch) {
      if (codeIdx > 0) parts.push(remaining.slice(0, codeIdx))
      parts.push(
        <code key={key++} className="px-1 py-0.5 rounded bg-white/[0.04] text-sky-400/60 text-[9px] font-mono">
          {codeMatch[1]}
        </code>,
      )
      remaining = remaining.slice(codeIdx + codeMatch[0].length)
    }
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>
}

// ─── Helpers ────────────────────────────────────────────────

function formatMs(ms: number): string {
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  return `${mins}m ${secs % 60}s`
}
