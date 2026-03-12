import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, ChevronUp, ChevronDown, X } from 'lucide-react'

interface TerminalSearchProps {
  isOpen: boolean
  onClose: () => void
  onSearchNext: (query: string) => boolean
  onSearchPrev: (query: string) => boolean
  onClear: () => void
}

export function TerminalSearch({ isOpen, onClose, onSearchNext, onSearchPrev, onClear }: TerminalSearchProps) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
      inputRef.current?.select()
    } else {
      setQuery('')
      onClear()
    }
  }, [isOpen, onClear])

  const handleSearch = useCallback((direction: 'next' | 'prev') => {
    if (!query) return
    if (direction === 'next') onSearchNext(query)
    else onSearchPrev(query)
  }, [query, onSearchNext, onSearchPrev])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSearch(e.shiftKey ? 'prev' : 'next')
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }, [handleSearch, onClose])

  useEffect(() => {
    if (query) onSearchNext(query)
  }, [query])

  if (!isOpen) return null

  return (
    <div className="absolute top-1 right-2 z-30 flex items-center gap-0.5 rounded-lg border border-white/[0.08] bg-[#0a0f1a]/95 px-2 py-1 backdrop-blur-sm shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
      <Search className="w-3 h-3 text-white/25 shrink-0 mr-1" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search..."
        className="w-44 bg-transparent text-[12px] text-white/80 outline-none placeholder:text-white/25"
      />
      <button
        onClick={() => handleSearch('prev')}
        className="flex h-5 w-5 items-center justify-center rounded text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/60"
        title="Previous (Shift+Enter)"
      >
        <ChevronUp className="w-3 h-3" />
      </button>
      <button
        onClick={() => handleSearch('next')}
        className="flex h-5 w-5 items-center justify-center rounded text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/60"
        title="Next (Enter)"
      >
        <ChevronDown className="w-3 h-3" />
      </button>
      <button
        onClick={onClose}
        className="flex h-5 w-5 items-center justify-center rounded text-white/30 transition-colors hover:bg-rose-500/15 hover:text-rose-300"
        title="Close (Esc)"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}
