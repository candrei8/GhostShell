import { type ReactNode, useMemo } from 'react'
import { ExternalLink } from 'lucide-react'

type MarkdownPreviewProps = {
  content: string
  totalLines: number
}

type MarkdownBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'blockquote'; lines: string[] }
  | { type: 'list'; ordered: boolean; items: Array<{ text: string; checked?: boolean }> }
  | { type: 'code'; language?: string; lines: string[] }
  | { type: 'rule' }

const HEADING_CLASSNAMES = [
  '',
  'text-xl font-semibold tracking-tight text-white',
  'text-lg font-semibold text-cyan-50',
  'text-base font-semibold text-violet-50',
  'text-sm font-semibold uppercase tracking-[0.16em] text-amber-100',
  'text-sm font-medium text-ghost-text',
  'text-xs font-medium uppercase tracking-[0.14em] text-ghost-text-dim',
]

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|\[[^\]]+\]\([^)]+\))/g
  const parts = text.split(pattern)

  return parts.filter(Boolean).map((part, index) => {
    const key = `${keyPrefix}-${index}`

    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={key} className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.92em] text-cyan-100">
          {part.slice(1, -1)}
        </code>
      )
    }

    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
      return <strong key={key} className="font-semibold text-white">{part.slice(2, -2)}</strong>
    }

    if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
      return <em key={key} className="italic text-white/90">{part.slice(1, -1)}</em>
    }

    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (linkMatch) {
      const [, label, href] = linkMatch
      const safeHref = /^(https?:\/\/|mailto:)/i.test(href) ? href : null
      if (!safeHref) {
        return <span key={key} className="text-cyan-100">{label}</span>
      }

      return (
        <a
          key={key}
          href={safeHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-cyan-100 underline decoration-cyan-200/40 underline-offset-4 transition-colors hover:text-white"
        >
          <span>{label}</span>
          <ExternalLink className="h-3 w-3" />
        </a>
      )
    }

    return <span key={key}>{part}</span>
  })
}

function parseMarkdown(content: string): MarkdownBlock[] {
  const lines = content.split('\n')
  const blocks: MarkdownBlock[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed) {
      index += 1
      continue
    }

    const fenceMatch = line.match(/^```(\w+)?\s*$/)
    if (fenceMatch) {
      const codeLines: string[] = []
      const language = fenceMatch[1]
      index += 1

      while (index < lines.length && !lines[index].match(/^```/)) {
        codeLines.push(lines[index])
        index += 1
      }

      if (index < lines.length) {
        index += 1
      }

      blocks.push({ type: 'code', language, lines: codeLines })
      continue
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2],
      })
      index += 1
      continue
    }

    if (/^([-*_])(?:\s*\1){2,}\s*$/.test(trimmed)) {
      blocks.push({ type: 'rule' })
      index += 1
      continue
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines: string[] = []
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ''))
        index += 1
      }
      blocks.push({ type: 'blockquote', lines: quoteLines })
      continue
    }

    const checklistMatch = trimmed.match(/^[-*+]\s+\[([ xX])\]\s+(.*)$/)
    const orderedMatch = trimmed.match(/^\d+\.\s+(.*)$/)
    const unorderedMatch = trimmed.match(/^[-*+]\s+(.*)$/)
    if (checklistMatch || orderedMatch || unorderedMatch) {
      const ordered = Boolean(orderedMatch)
      const items: Array<{ text: string; checked?: boolean }> = []

      while (index < lines.length) {
        const current = lines[index].trim()
        const checklist = current.match(/^[-*+]\s+\[([ xX])\]\s+(.*)$/)
        const orderedItem = current.match(/^\d+\.\s+(.*)$/)
        const unorderedItem = current.match(/^[-*+]\s+(.*)$/)

        if (ordered && orderedItem) {
          items.push({ text: orderedItem[1] })
          index += 1
          continue
        }

        if (!ordered && checklist) {
          items.push({ text: checklist[2], checked: checklist[1].toLowerCase() === 'x' })
          index += 1
          continue
        }

        if (!ordered && unorderedItem) {
          items.push({ text: unorderedItem[1] })
          index += 1
          continue
        }

        break
      }

      blocks.push({ type: 'list', ordered, items })
      continue
    }

    const paragraphLines: string[] = []
    while (index < lines.length) {
      const current = lines[index]
      const currentTrimmed = current.trim()
      if (!currentTrimmed) break
      if (
        currentTrimmed.match(/^(#{1,6})\s+/) ||
        currentTrimmed.match(/^>\s?/) ||
        currentTrimmed.match(/^[-*+]\s+/) ||
        currentTrimmed.match(/^\d+\.\s+/) ||
        currentTrimmed.match(/^```/) ||
        currentTrimmed.match(/^([-*_])(?:\s*\1){2,}\s*$/)
      ) {
        break
      }

      paragraphLines.push(currentTrimmed)
      index += 1
    }

    blocks.push({ type: 'paragraph', text: paragraphLines.join(' ') })
  }

  return blocks
}

export function MarkdownPreview({ content, totalLines }: MarkdownPreviewProps) {
  const blocks = useMemo(() => parseMarkdown(content), [content])
  const visibleLines = content.split('\n').length

  return (
    <div className="px-4 py-4 text-sm text-ghost-text/88">
      <div className="space-y-4">
        {blocks.map((block, index) => {
          if (block.type === 'heading') {
            return (
              <div key={index} className={HEADING_CLASSNAMES[block.level]}>
                {renderInlineMarkdown(block.text, `heading-${index}`)}
              </div>
            )
          }

          if (block.type === 'paragraph') {
            return (
              <p key={index} className="leading-7 text-ghost-text/84">
                {renderInlineMarkdown(block.text, `paragraph-${index}`)}
              </p>
            )
          }

          if (block.type === 'blockquote') {
            return (
              <blockquote
                key={index}
                className="rounded-2xl border border-violet-300/14 bg-violet-300/[0.05] px-4 py-3 text-sm italic text-violet-50/90"
              >
                {block.lines.map((line, lineIndex) => (
                  <p key={lineIndex}>{renderInlineMarkdown(line, `quote-${index}-${lineIndex}`)}</p>
                ))}
              </blockquote>
            )
          }

          if (block.type === 'list') {
            const ListTag = block.ordered ? 'ol' : 'ul'
            return (
              <ListTag
                key={index}
                className={`space-y-2 pl-5 ${block.ordered ? 'list-decimal' : 'list-disc'}`}
              >
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex} className="leading-6 text-ghost-text/84">
                    {typeof item.checked === 'boolean' ? (
                      <span className="inline-flex items-center gap-2">
                        <span
                          className={`inline-flex h-4 w-4 items-center justify-center rounded border text-[10px] ${
                            item.checked
                              ? 'border-cyan-300/30 bg-cyan-300/12 text-cyan-100'
                              : 'border-white/12 text-ghost-text-dim'
                          }`}
                        >
                          {item.checked ? 'x' : ''}
                        </span>
                        <span>{renderInlineMarkdown(item.text, `item-${index}-${itemIndex}`)}</span>
                      </span>
                    ) : (
                      renderInlineMarkdown(item.text, `item-${index}-${itemIndex}`)
                    )}
                  </li>
                ))}
              </ListTag>
            )
          }

          if (block.type === 'code') {
            return (
              <div key={index} className="overflow-hidden rounded-2xl border border-white/8 bg-black/28">
                <div className="ghost-toolbar-surface flex items-center justify-between px-3 py-2">
                  <span className="text-[10px] uppercase tracking-[0.16em] text-ghost-text-dim/55">
                    Code
                  </span>
                  <span className="ghost-soft-pill rounded-full px-2 py-0.5 text-[10px] text-cyan-100">
                    {block.language || 'plain'}
                  </span>
                </div>
                <pre className="overflow-x-auto px-3 py-3 font-mono text-[11px] leading-6 text-cyan-50/88">
                  {block.lines.join('\n')}
                </pre>
              </div>
            )
          }

          return <hr key={index} className="border-white/8" />
        })}
      </div>

      {totalLines > visibleLines && (
        <div className="mt-4 border-t border-white/8 pt-3 text-[11px] text-ghost-text-dim/45">
          Showing the first {visibleLines} of {totalLines} lines.
        </div>
      )}
    </div>
  )
}
