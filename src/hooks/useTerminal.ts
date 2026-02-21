import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { SearchAddon } from '@xterm/addon-search'
import { useSettingsStore } from '../stores/settingsStore'

export function useTerminal(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [terminal, setTerminal] = useState<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const webglAddonRef = useRef<WebglAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const mounted = useRef(false)
  const fitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rafRef = useRef<number | null>(null)

  // Scroll-safe fit: preserves scroll position so resize/animations don't yank the viewport
  const safeFit = useCallback(() => {
    const addon = fitAddonRef.current
    const term = termRef.current
    if (!addon || !term) return

    // Skip fit if container is too small (mid-collapse animation)
    const el = term.element
    if (el && (el.clientWidth < 10 || el.clientHeight < 10)) return

    const buf = term.buffer.active
    const wasAtBottom = buf.viewportY === buf.baseY
    const savedViewportY = buf.viewportY

    try { addon.fit() } catch {}

    // Restore scroll if user was reading history (not following output)
    if (!wasAtBottom && buf.viewportY !== savedViewportY) {
      const maxScroll = term.buffer.active.baseY
      term.scrollToLine(Math.min(savedViewportY, maxScroll))
    }
  }, [])

  const fit = useCallback(() => {
    safeFit()
  }, [safeFit])

  // Debounced fit: collapses rapid resize events (e.g. sidebar animation) into a single fit
  const debouncedFit = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (fitTimeoutRef.current) clearTimeout(fitTimeoutRef.current)
    // Single fit after layout settles — 300ms covers sidebar animation (250ms) + flex reflow
    fitTimeoutRef.current = setTimeout(() => {
      rafRef.current = requestAnimationFrame(() => {
        safeFit()
        rafRef.current = null
      })
      fitTimeoutRef.current = null
    }, 300)
  }, [safeFit])

  // Create terminal instance
  useEffect(() => {
    const container = containerRef.current
    if (!container || mounted.current) return

    mounted.current = true

    const settings = useSettingsStore.getState()
    const theme = settings.getTheme()

    const term = new Terminal({
      fontSize: settings.terminalFontSize,
      fontFamily: settings.fontFamily,
      cursorBlink: settings.cursorBlink,
      cursorStyle: settings.cursorStyle,
      theme: theme.terminalColors,
      allowTransparency: true,
      scrollback: 10000,
      convertEol: true,
      fontWeight: '400',
      fontWeightBold: '700',
      letterSpacing: 0,
      lineHeight: 1.15,
      drawBoldTextInBrightColors: true,
      minimumContrastRatio: 1,
      rightClickSelectsWord: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    fitAddonRef.current = fitAddon

    term.open(container)

    // Load WebGL addon for crisp, GPU-accelerated rendering
    try {
      const webglAddon = new WebglAddon()
      webglAddon.onContextLoss(() => {
        webglAddon.dispose()
        webglAddonRef.current = null
      })
      term.loadAddon(webglAddon)
      webglAddonRef.current = webglAddon
    } catch {
      console.warn('WebGL addon failed to load, using DOM renderer')
    }

    // Load Search addon
    const searchAddon = new SearchAddon()
    term.loadAddon(searchAddon)
    searchAddonRef.current = searchAddon

    // Delay fit to ensure container has dimensions
    requestAnimationFrame(() => {
      try { fitAddon.fit() } catch {}
    })

    // ResizeObserver with debounced fit
    const resizeObserver = new ResizeObserver(() => {
      debouncedFit()
    })
    resizeObserver.observe(container)

    // Listen for global refit event (fired when layout changes)
    const handleGlobalRefit = () => debouncedFit()
    window.addEventListener('ghostshell:refit', handleGlobalRefit)

    termRef.current = term
    setTerminal(term)

    return () => {
      mounted.current = false
      if (fitTimeoutRef.current) clearTimeout(fitTimeoutRef.current)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      resizeObserver.disconnect()
      window.removeEventListener('ghostshell:refit', handleGlobalRefit)
      if (webglAddonRef.current) {
        try { webglAddonRef.current.dispose() } catch {}
        webglAddonRef.current = null
      }
      term.dispose()
      termRef.current = null
      setTerminal(null)
      fitAddonRef.current = null
    }
  }, [containerRef, debouncedFit])

  // Live-sync settings changes to the terminal
  useEffect(() => {
    if (!terminal) return

    const unsub = useSettingsStore.subscribe((state, prevState) => {
      if (state.terminalFontSize !== prevState.terminalFontSize) {
        terminal.options.fontSize = state.terminalFontSize
        fit()
      }
      if (state.fontFamily !== prevState.fontFamily) {
        terminal.options.fontFamily = state.fontFamily
        fit()
      }
      if (state.cursorBlink !== prevState.cursorBlink) {
        terminal.options.cursorBlink = state.cursorBlink
      }
      if (state.cursorStyle !== prevState.cursorStyle) {
        terminal.options.cursorStyle = state.cursorStyle
      }
      if (state.themeId !== prevState.themeId) {
        const theme = state.getTheme()
        terminal.options.theme = theme.terminalColors
      }
    })

    return unsub
  }, [terminal, fit])

  const searchNext = useCallback((query: string) => {
    return searchAddonRef.current?.findNext(query, { regex: false, caseSensitive: false, decorations: { matchOverviewRuler: '#a855f780', activeMatchColorOverviewRuler: '#a855f7', matchBackground: '#a855f730', activeMatchBackground: '#a855f760' } }) ?? false
  }, [])

  const searchPrev = useCallback((query: string) => {
    return searchAddonRef.current?.findPrevious(query, { regex: false, caseSensitive: false, decorations: { matchOverviewRuler: '#a855f780', activeMatchColorOverviewRuler: '#a855f7', matchBackground: '#a855f730', activeMatchBackground: '#a855f760' } }) ?? false
  }, [])

  const clearSearch = useCallback(() => {
    searchAddonRef.current?.clearDecorations()
  }, [])

  return { terminal, fit, searchNext, searchPrev, clearSearch }
}
