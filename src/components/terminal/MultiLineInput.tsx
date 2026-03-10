import { useRef, useEffect, useCallback, useState } from 'react'
import { CornerDownLeft, X, Type } from 'lucide-react'

interface MultiLineInputProps {
  onSubmit: (text: string) => void
  onClose: () => void
}

export function MultiLineInput({ onSubmit, onClose }: MultiLineInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [value, setValue] = useState('')

  useEffect(() => {
    // Focus + select all on open
    const timer = setTimeout(() => {
      textareaRef.current?.focus()
    }, 30)
    return () => clearTimeout(timer)
  }, [])

  const handleSubmit = useCallback(() => {
    const text = value
    if (!text.trim()) return
    onSubmit(text)
    onClose()
  }, [value, onSubmit, onClose])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Ctrl+Enter or Cmd+Enter: submit
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        handleSubmit()
        return
      }
      // Escape: close
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      // Enter without modifiers: insert newline (default textarea behavior, no need to intercept)
    },
    [handleSubmit, onClose],
  )

  const lineCount = value.split('\n').length

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 flex flex-col border-t border-white/[0.1] bg-[var(--ghost-surface)]/95 backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5">
        <div className="flex items-center gap-2 text-[11px] text-white/50">
          <Type className="h-3 w-3" />
          <span>Multi-line input</span>
          <span className="text-white/25">&middot;</span>
          <span className="text-white/30">{lineCount} {lineCount === 1 ? 'line' : 'lines'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-white/40">
            Ctrl+Enter to send
          </span>
          <button
            onClick={onClose}
            className="flex h-5 w-5 items-center justify-center rounded-md text-white/30 transition-colors hover:bg-white/[0.08] hover:text-white/60"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Text area */}
      <div className="relative px-3 pb-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={4}
          placeholder="Type multi-line text here... Enter for new lines, Ctrl+Enter to send"
          className="w-full resize-y rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 font-mono text-[13px] leading-relaxed text-white/90 placeholder:text-white/25 focus:border-white/[0.15] focus:outline-none focus:ring-1 focus:ring-white/[0.06]"
          style={{ minHeight: 80, maxHeight: 300 }}
        />
        <button
          onClick={handleSubmit}
          disabled={!value.trim()}
          className="absolute bottom-4 right-5 flex h-7 items-center gap-1.5 rounded-lg bg-[var(--ghost-accent)] px-3 text-[11px] font-semibold text-white shadow-sm transition-all hover:brightness-110 disabled:opacity-30 disabled:hover:brightness-100"
        >
          <CornerDownLeft className="h-3 w-3" />
          Send
        </button>
      </div>
    </div>
  )
}
