import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, Bot, Eraser, Send, Sparkles, User } from 'lucide-react'
import { TerminalSession, Provider } from '../../lib/types'
import { useCompanionStore, CompanionEntry } from '../../stores/companionStore'
import { useHistoryStore } from '../../stores/historyStore'
import { getProviderColor, getProviderLabel } from '../../lib/providers'
import { getActivityConfig } from '../agents/ActivityIcon'

interface CompanionPanelProps {
  session: TerminalSession
  provider?: Provider
  agentName?: string
}

interface MarkdownBlock {
  type: 'text' | 'code' | 'diff'
  content: string
  language?: string
}

function parseMarkdownBlocks(text: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = []
  const lines = text.split('\n')
  let inFence = false
  let fenceLanguage = ''
  let fenceLines: string[] = []
  let textLines: string[] = []

  const flushText = () => {
    if (textLines.length === 0) return
    blocks.push({ type: 'text', content: textLines.join('\n') })
    textLines = []
  }

  const flushFence = () => {
    const content = fenceLines.join('\n')
    const diffLike =
      fenceLanguage.toLowerCase() === 'diff' ||
      /^(@@|\+\+\+|---|\+|-)/m.test(content)
    blocks.push({
      type: diffLike ? 'diff' : 'code',
      content,
      language: fenceLanguage || undefined,
    })
    fenceLines = []
    fenceLanguage = ''
  }

  for (const line of lines) {
    const fenceMatch = line.match(/^```([\w-]+)?\s*$/)
    if (fenceMatch) {
      if (inFence) {
        flushFence()
        inFence = false
      } else {
        flushText()
        inFence = true
        fenceLanguage = fenceMatch[1] || ''
      }
      continue
    }

    if (inFence) {
      fenceLines.push(line)
    } else {
      textLines.push(line)
    }
  }

  if (inFence) {
    flushFence()
  } else {
    flushText()
  }

  return blocks.length > 0 ? blocks : [{ type: 'text', content: text }]
}

function renderInlineCode(text: string) {
  const parts = text.split(/(`[^`]+`)/g)
  return parts.map((part, idx) => {
    const isCode = part.startsWith('`') && part.endsWith('`') && part.length >= 2
    if (!isCode) return <span key={`txt-${idx}`}>{part}</span>
    return (
      <code
        key={`code-${idx}`}
        className="px-1.5 py-0.5 rounded-md bg-slate-950/70 border border-slate-700/60 text-amber-200 font-mono text-[11px]"
      >
        {part.slice(1, -1)}
      </code>
    )
  })
}

function renderTextBlock(content: string, keyPrefix: string) {
  const lines = content.split('\n')
  return (
    <div className="space-y-1.5">
      {lines.map((line, lineIdx) => {
        const trimmed = line.trim()
        if (!trimmed) {
          return <div key={`${keyPrefix}-sp-${lineIdx}`} className="h-1.5" />
        }

        const h1 = trimmed.match(/^#\s+(.+)$/)
        if (h1) {
          return (
            <h3 key={`${keyPrefix}-h1-${lineIdx}`} className="text-[14px] font-semibold text-slate-100">
              {renderInlineCode(h1[1])}
            </h3>
          )
        }

        const h2 = trimmed.match(/^##\s+(.+)$/)
        if (h2) {
          return (
            <h4 key={`${keyPrefix}-h2-${lineIdx}`} className="text-[13px] font-semibold text-slate-200">
              {renderInlineCode(h2[1])}
            </h4>
          )
        }

        const bullet = trimmed.match(/^[-*]\s+(.+)$/)
        if (bullet) {
          return (
            <div key={`${keyPrefix}-b-${lineIdx}`} className="flex items-start gap-2 text-[12px] text-slate-200">
              <span className="mt-1 w-1.5 h-1.5 rounded-full bg-cyan-300/70 shrink-0" />
              <span className="leading-relaxed">{renderInlineCode(bullet[1])}</span>
            </div>
          )
        }

        const numbered = trimmed.match(/^(\d+)\.\s+(.+)$/)
        if (numbered) {
          return (
            <div key={`${keyPrefix}-n-${lineIdx}`} className="flex items-start gap-2 text-[12px] text-slate-200">
              <span className="min-w-[18px] text-right text-cyan-300/80 font-mono text-[11px] shrink-0">
                {numbered[1]}.
              </span>
              <span className="leading-relaxed">{renderInlineCode(numbered[2])}</span>
            </div>
          )
        }

        return (
          <p key={`${keyPrefix}-p-${lineIdx}`} className="text-[12px] leading-relaxed text-slate-200 whitespace-pre-wrap break-words">
            {renderInlineCode(trimmed)}
          </p>
        )
      })}
    </div>
  )
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function EventEntry({ entry }: { entry: CompanionEntry }) {
  if (entry.kind === 'system') {
    return (
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg border border-slate-700/70 bg-slate-900/70 text-slate-300">
          <Sparkles className="w-3 h-3 text-cyan-300" />
          <span>{entry.text}</span>
        </div>
      </div>
    )
  }

  const config = entry.activity ? getActivityConfig(entry.activity) : null
  const Icon = config?.icon || Sparkles
  const colorClass = config?.color || 'text-cyan-300'
  const bgClass = config?.bgColor || 'bg-slate-900/70'

  return (
    <div className="flex justify-center">
      <div className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg border border-slate-700/70 ${bgClass} ${colorClass}`}>
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="max-w-[420px] truncate" title={entry.text}>
          {entry.text}
        </span>
      </div>
    </div>
  )
}

function AssistantEntry({ entry, providerColor }: { entry: CompanionEntry; providerColor: string }) {
  const blocks = useMemo(() => parseMarkdownBlocks(entry.text), [entry.text])

  return (
    <div className="max-w-[95%] md:max-w-[88%] rounded-2xl border border-slate-700/70 bg-slate-900/75 shadow-lg">
      <div className="px-3 py-2 border-b border-slate-700/70 flex items-center gap-2">
        <div
          className="w-6 h-6 rounded-lg flex items-center justify-center text-white"
          style={{ backgroundColor: providerColor }}
        >
          <Bot className="w-3.5 h-3.5" />
        </div>
        <span className="text-[11px] font-semibold text-slate-200">Assistant</span>
      </div>

      <div className="px-3 py-2.5 space-y-2">
        {blocks.map((block, blockIdx) => {
          if (block.type === 'text') {
            return (
              <div key={`text-${blockIdx}`}>
                {renderTextBlock(block.content, `txt-${blockIdx}`)}
              </div>
            )
          }

          if (block.type === 'diff') {
            const lines = block.content.split('\n')
            return (
              <details key={`diff-${blockIdx}`} className="rounded-xl border border-slate-700/70 bg-slate-950/65">
                <summary className="cursor-pointer list-none px-3 py-2 text-[11px] text-slate-300 hover:text-slate-100">
                  Diff ({lines.length} lines)
                </summary>
                <div className="px-3 pb-3 overflow-x-auto">
                  <code className="block text-[11px] font-mono leading-relaxed">
                    {lines.map((line, lineIdx) => {
                      let lineClass = 'text-slate-200'
                      if (line.startsWith('+') && !line.startsWith('+++')) lineClass = 'text-green-300 bg-green-500/10'
                      else if (line.startsWith('-') && !line.startsWith('---')) lineClass = 'text-rose-300 bg-rose-500/10'
                      else if (line.startsWith('@@')) lineClass = 'text-cyan-300'
                      return (
                        <span key={`line-${lineIdx}`} className={`block px-1.5 rounded-sm ${lineClass}`}>
                          {line || ' '}
                        </span>
                      )
                    })}
                  </code>
                </div>
              </details>
            )
          }

          const lines = block.content.split('\n')
          return (
            <div key={`code-${blockIdx}`} className="rounded-xl border border-slate-700/70 bg-slate-950/65 overflow-hidden">
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-700/70">
                {block.language || 'code'}
              </div>
              <div className="px-3 py-2 overflow-x-auto">
                <code className="block text-[11px] font-mono leading-relaxed text-cyan-100">
                  {lines.map((line, idx) => (
                    <div key={`code-line-${idx}`} className="flex gap-3">
                      <span className="text-slate-500 select-none min-w-[20px] text-right">{idx + 1}</span>
                      <span>{line || ' '}</span>
                    </div>
                  ))}
                </code>
              </div>
            </div>
          )
        })}
      </div>

      <div className="px-3 pb-2 text-[10px] text-slate-500">{formatTime(entry.timestamp)}</div>
    </div>
  )
}

function UserEntry({ entry, providerColor }: { entry: CompanionEntry; providerColor: string }) {
  return (
    <div className="ml-auto max-w-[95%] md:max-w-[80%] rounded-2xl px-3 py-2 border shadow-md text-slate-100" style={{ borderColor: `${providerColor}60`, backgroundColor: `${providerColor}20` }}>
      <div className="flex items-center gap-1.5 mb-1">
        <User className="w-3.5 h-3.5" />
        <span className="text-[11px] font-semibold">You</span>
      </div>
      <div className="text-[12px] whitespace-pre-wrap break-words">{entry.text}</div>
      <div className="mt-1 text-[10px] text-slate-300/80 text-right">{formatTime(entry.timestamp)}</div>
    </div>
  )
}

export function CompanionPanel({ session, provider, agentName }: CompanionPanelProps) {
  const entries = useCompanionStore((s) => s.sessions[session.id]?.entries || [])
  const addUserMessage = useCompanionStore((s) => s.addUserMessage)
  const addSystemMessage = useCompanionStore((s) => s.addSystemMessage)
  const clearSession = useCompanionStore((s) => s.clearSession)
  const [value, setValue] = useState('')
  const [stickToBottom, setStickToBottom] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const providerLabel = provider ? getProviderLabel(provider) : 'Agent'
  const providerAccent = provider ? getProviderColor(provider) : '#0ea5e9'

  const stats = useMemo(() => {
    let user = 0
    let assistant = 0
    let events = 0
    for (const entry of entries) {
      if (entry.kind === 'user') user++
      else if (entry.kind === 'assistant') assistant++
      else events++
    }
    return { user, assistant, events }
  }, [entries])

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !stickToBottom) return
    el.scrollTop = el.scrollHeight
  }, [entries, stickToBottom])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    setStickToBottom(nearBottom)
  }, [])

  const sendMessage = useCallback(() => {
    const text = value.trim()
    if (!text) return

    addUserMessage(session.id, text)
    useHistoryStore.getState().addEntry(text, session.id, agentName)

    try {
      const payload = text.includes('\n')
        ? `\x1b[200~${text}\x1b[201~\r`
        : `${text}\r`
      window.ghostshell.ptyWrite(session.id, payload)
    } catch {
      addSystemMessage(session.id, 'Failed to send prompt to the active session.', provider)
    }

    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = '40px'
      textareaRef.current.focus()
    }
    setStickToBottom(true)
  }, [addSystemMessage, addUserMessage, agentName, provider, session.id, value])

  const handleInput = useCallback((next: string) => {
    setValue(next)
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 170)}px`
  }, [])

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <div className="h-11 px-3 flex items-center justify-between border-b border-slate-700/70 shrink-0 bg-slate-900/80">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-4 h-4" style={{ color: providerAccent }} />
          <span className="text-xs text-slate-100 font-semibold truncate">
            Companion View {agentName ? `- ${agentName}` : ''}
          </span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-md border text-slate-100 shrink-0"
            style={{ borderColor: `${providerAccent}80`, backgroundColor: `${providerAccent}22` }}
          >
            {providerLabel}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] text-slate-400 hidden md:inline">{stats.user}U</span>
          <span className="text-[10px] text-slate-400 hidden md:inline">{stats.assistant}A</span>
          <span className="text-[10px] text-slate-400 hidden md:inline">{stats.events}E</span>
          {!stickToBottom && (
            <button
              onClick={() => {
                const el = scrollRef.current
                if (el) el.scrollTop = el.scrollHeight
                setStickToBottom(true)
              }}
              className="w-6 h-6 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center"
              title="Jump to latest"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => clearSession(session.id)}
            className="w-6 h-6 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center"
            title="Clear transcript"
          >
            <Eraser className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2 sidebar-scroll"
      >
        {entries.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-slate-400">
            Waiting for agent output...
          </div>
        ) : (
          entries.map((entry) => {
            if (entry.kind === 'event' || entry.kind === 'system') {
              return <EventEntry key={entry.id} entry={entry} />
            }
            if (entry.kind === 'user') {
              return <UserEntry key={entry.id} entry={entry} providerColor={providerAccent} />
            }
            return <AssistantEntry key={entry.id} entry={entry} providerColor={providerAccent} />
          })
        )}
      </div>

      <div className="shrink-0 border-t border-slate-700/70 p-2.5 bg-slate-900/85">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => handleInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                e.stopPropagation()
                sendMessage()
              }
            }}
            placeholder="Escribe aquí (Enter envía, Shift+Enter nueva línea)"
            className="flex-1 min-h-[40px] max-h-40 resize-none rounded-xl border bg-slate-950/80 text-slate-100 text-xs px-3 py-2 outline-none"
            style={{ borderColor: `${providerAccent}55` }}
          />
          <button
            onClick={sendMessage}
            disabled={!value.trim()}
            className={`h-10 px-3 rounded-xl text-xs font-semibold transition-colors ${
              value.trim()
                ? 'text-white hover:brightness-110'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
            style={value.trim() ? { backgroundColor: providerAccent } : undefined}
          >
            <span className="inline-flex items-center gap-1">
              <Send className="w-3.5 h-3.5" />
              Send
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
