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
    <div className="absolute top-1 right-2 z-30 flex items-center gap-1 bg-ghost-surface border border-ghost-border rounded-xl shadow-qubria-lg px-2 py-1">
      <Search className="w-3 h-3 text-ghost-text-dim shrink-0" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search..."
        className="w-48 bg-transparent text-xs text-ghost-text outline-none placeholder:text-ghost-text-dim/40"
      />
      <button
        onClick={() => handleSearch('prev')}
        className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-800 text-ghost-text-dim"
        title="Previous (Shift+Enter)"
      >
        <ChevronUp className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => handleSearch('next')}
        className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-800 text-ghost-text-dim"
        title="Next (Enter)"
      >
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={onClose}
        className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-800 text-ghost-text-dim"
        title="Close (Esc)"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
