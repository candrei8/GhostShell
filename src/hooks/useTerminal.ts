import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { useSettingsStore } from '../stores/settingsStore'
import { Provider, TerminalTheme } from '../lib/types'
import { CliVisualProfile, getCliAppearancePreset, type SearchDecorations } from '../lib/terminalPresets'

function resolveAppearanceSafe(
  theme: TerminalTheme,
  provider: Provider | undefined,
  visualProfile: CliVisualProfile,
  cursorStyle: 'block' | 'underline' | 'bar',
  cursorBlink: boolean,
) {
  try {
    return getCliAppearancePreset(theme, provider, visualProfile, cursorStyle, cursorBlink)
  } catch (err) {
    console.warn('[useTerminal] Failed to resolve appearance preset, using safe fallback:', err)
    return getCliAppearancePreset(theme, undefined, 'executive', 'bar', true)
  }
}

export function useTerminal(
  containerElement: HTMLDivElement | null,
  isActive?: boolean,
  provider?: Provider,
) {
  const [terminal, setTerminal] = useState<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const webglAddonRef = useRef<WebglAddon | null>(null)
  const webglAvailableRef = useRef(true)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const searchDecorationsRef = useRef<SearchDecorations>({
    matchOverviewRuler: '#94a3b880',
    activeMatchColorOverviewRuler: '#e2e8f0',
    matchBackground: '#94a3b830',
    activeMatchBackground: '#94a3b860',
  })
  const mounted = useRef(false)
  const fitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rafRef = useRef<number | null>(null)

  // Check if the terminal element is actually visible in the DOM
  // visibility:hidden preserves layout dimensions but rendering is pointless
  const isElementVisible = useCallback((el: HTMLElement): boolean => {
    try {
      return window.getComputedStyle(el).visibility !== 'hidden'
    } catch {
      return true // assume visible if check fails
    }
  }, [])

  // Scroll-safe fit: preserves scroll position so resize/animations don't yank the viewport
  const safeFit = useCallback((force = false) => {
    const addon = fitAddonRef.current
    const term = termRef.current
    if (!addon || !term) return

    const el = term.element
    if (!el) return

    // Skip fit if container is too small (mid-collapse animation)
    if (el.clientWidth < 10 || el.clientHeight < 10) return

    // Skip fit if terminal is hidden (display:none) — unless forced (e.g., initial mount)
    if (!force && el.offsetParent === null) return

    const buf = term.buffer.active
    const wasAtBottom = buf.viewportY >= buf.baseY - 1
    const savedViewportY = buf.viewportY

    try { addon.fit() } catch {}

    if (wasAtBottom) {
      term.scrollToBottom()
    } else if (buf.viewportY !== savedViewportY) {
      // Restore scroll if user was reading history (not following output)
      const maxScroll = term.buffer.active.baseY
      term.scrollToLine(Math.min(savedViewportY, maxScroll))
    }
  }, [isElementVisible])

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

  const detachWebgl = useCallback(() => {
    if (!webglAddonRef.current) return
    try { webglAddonRef.current.dispose() } catch {}
    webglAddonRef.current = null
  }, [])

  const attachWebgl = useCallback((term: Terminal) => {
    if (webglAddonRef.current || !webglAvailableRef.current) return

    try {
      const webglAddon = new WebglAddon()
      webglAddon.onContextLoss(() => {
        console.warn('WebGL context lost, falling back to the default renderer')
        if (webglAddonRef.current === webglAddon) {
          webglAddonRef.current = null
        }
        webglAvailableRef.current = false
        try { webglAddon.dispose() } catch {}
        try { term.refresh(0, term.rows - 1) } catch {}
      })
      term.loadAddon(webglAddon)
      webglAddonRef.current = webglAddon
    } catch {
      webglAvailableRef.current = false
      console.warn('WebGL addon failed to load, using the default renderer')
    }
  }, [])

  // Create terminal instance
  useEffect(() => {
    const container = containerElement
    if (!container || mounted.current) return

    mounted.current = true

    const settings = useSettingsStore.getState()
    const theme = settings.getTheme()
    const appearance = resolveAppearanceSafe(
      theme.terminalColors,
      provider,
      settings.cliVisualProfile,
      settings.cursorStyle,
      settings.cursorBlink,
    )
    searchDecorationsRef.current = appearance.searchDecorations

    const term = new Terminal({
      fontSize: settings.terminalFontSize,
      fontFamily: settings.fontFamily,
      cursorBlink: appearance.cursorBlink,
      cursorStyle: appearance.cursorStyle,
      theme: appearance.theme,
      allowTransparency: true,
      scrollback: 10000,
      convertEol: provider !== 'gemini',
      fontWeight: '400',
      fontWeightBold: '700',
      letterSpacing: appearance.letterSpacing,
      lineHeight: appearance.lineHeight,
      drawBoldTextInBrightColors: true,
      minimumContrastRatio: 1,
      rightClickSelectsWord: true,
      scrollOnUserInput: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    fitAddonRef.current = fitAddon

    term.open(container)

    // Load Search addon
    const searchAddon = new SearchAddon()
    term.loadAddon(searchAddon)
    searchAddonRef.current = searchAddon

    // Load Web Links addon (Ctrl+Click opens URLs in browser)
    const webLinksAddon = new WebLinksAddon((event, uri) => {
      if (event.ctrlKey || event.metaKey) {
        window.open(uri, '_blank', 'noopener,noreferrer')
      }
    })
    term.loadAddon(webLinksAddon)

    // Delay fit to ensure container has dimensions (force=true to allow initial hidden mount)
    requestAnimationFrame(() => {
      try { fitAddon.fit() } catch {}
      setTimeout(() => {
        if (mounted.current) {
          try { fitAddon.fit() } catch {}
        }
      }, 30)
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
      detachWebgl()
      termRef.current = null  // null ref BEFORE dispose so concurrent subscribers bail out
      term.dispose()
      setTerminal(null)
      fitAddonRef.current = null
    }
  }, [containerElement, debouncedFit, detachWebgl])

  // Attach WebGL as soon as terminal is created
  useEffect(() => {
    const term = termRef.current
    if (!term) return

    let cancelled = false
    const timer = setTimeout(() => {
      if (cancelled || termRef.current !== term) return
      attachWebgl(term)
    }, 50)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [attachWebgl, terminal])

  // Refit + focus + refresh when tab becomes active
  // visibility:hidden → visible doesn't trigger ResizeObserver, so we force refit here.
  // Three stagger timings cover: immediate paint (rAF), CSS transition mid (200ms), final settle (400ms).
  // Also refreshes terminal content to fix WebGL blank-canvas after being hidden.
  useEffect(() => {
    if (!isActive || !terminal) return

    const timers: ReturnType<typeof setTimeout>[] = []
    const rafs: number[] = []

    // Immediate fit via rAF
    rafs.push(requestAnimationFrame(() => {
      safeFit(true)
    }))

    // 200ms — covers most CSS transitions mid-point
    timers.push(setTimeout(() => {
      rafs.push(requestAnimationFrame(() => {
        safeFit(true)
      }))
    }, 200))

    // 400ms — final settle: refit + force full content re-render + focus
    timers.push(setTimeout(() => {
      rafs.push(requestAnimationFrame(() => {
        safeFit(true)
        // Force re-render all lines (fixes WebGL blank canvas after visibility change)
        try { terminal.refresh(0, terminal.rows - 1) } catch {}
        // Focus terminal so keyboard input works immediately after tab switch
        // Only steal focus if no input element is focused (respect search bar, rename input, etc.)
        const active = document.activeElement
        if (!active || active === document.body || active.closest('[data-terminal-pane]')) {
          try { terminal.focus() } catch {}
        }
      }))
    }, 400))

    return () => {
      rafs.forEach((r) => cancelAnimationFrame(r))
      timers.forEach((t) => clearTimeout(t))
    }
  }, [isActive, terminal, safeFit])

  // Live-sync settings changes to the terminal
  useEffect(() => {
    if (!terminal) return

    const unsub = useSettingsStore.subscribe((state, prevState) => {
      // Use ref (not closure) so guard and write are atomic — avoids race with dispose
      const term = termRef.current
      if (!term) return

      const applyAppearance = () => {
        const resolvedTheme = state.getTheme()
        const appearance = resolveAppearanceSafe(
          resolvedTheme.terminalColors,
          provider,
          state.cliVisualProfile,
          state.cursorStyle,
          state.cursorBlink,
        )
        searchDecorationsRef.current = appearance.searchDecorations
        term.options.theme = appearance.theme
        term.options.cursorBlink = appearance.cursorBlink
        term.options.cursorStyle = appearance.cursorStyle
        term.options.convertEol = provider !== 'gemini'
        term.options.letterSpacing = appearance.letterSpacing
        term.options.lineHeight = appearance.lineHeight
        debouncedFit()
        try { term.refresh(0, term.rows - 1) } catch {}
      }

      try {
        if (state.terminalFontSize !== prevState.terminalFontSize) {
          term.options.fontSize = state.terminalFontSize
          debouncedFit()
        }
        if (state.fontFamily !== prevState.fontFamily) {
          term.options.fontFamily = state.fontFamily
          debouncedFit()
        }
        if (
          state.cursorBlink !== prevState.cursorBlink ||
          state.cursorStyle !== prevState.cursorStyle ||
          state.cliVisualProfile !== prevState.cliVisualProfile ||
          state.themeId !== prevState.themeId
        ) {
          applyAppearance()
        }
      } catch (err) {
        console.warn('[useTerminal] settings sync error:', err)
      }
    })

    // Ensure profile is reapplied when provider changes without requiring a settings mutation.
    const initialState = useSettingsStore.getState()
    const initialAppearance = resolveAppearanceSafe(
      initialState.getTheme().terminalColors,
      provider,
      initialState.cliVisualProfile,
      initialState.cursorStyle,
      initialState.cursorBlink,
    )
    searchDecorationsRef.current = initialAppearance.searchDecorations
    terminal.options.theme = initialAppearance.theme
    terminal.options.cursorBlink = initialAppearance.cursorBlink
    terminal.options.cursorStyle = initialAppearance.cursorStyle
    terminal.options.convertEol = provider !== 'gemini'
    terminal.options.letterSpacing = initialAppearance.letterSpacing
    terminal.options.lineHeight = initialAppearance.lineHeight
    debouncedFit()
    try { terminal.refresh(0, terminal.rows - 1) } catch {}

    return unsub
  }, [terminal, debouncedFit, provider])

  const searchNext = useCallback((query: string) => {
    const decorations = searchDecorationsRef.current
    return searchAddonRef.current?.findNext(query, {
      regex: false,
      caseSensitive: false,
      decorations,
    }) ?? false
  }, [])

  const searchPrev = useCallback((query: string) => {
    const decorations = searchDecorationsRef.current
    return searchAddonRef.current?.findPrevious(query, {
      regex: false,
      caseSensitive: false,
      decorations,
    }) ?? false
  }, [])

  const clearSearch = useCallback(() => {
    searchAddonRef.current?.clearDecorations()
  }, [])

  return { terminal, fit, searchNext, searchPrev, clearSearch }
}
