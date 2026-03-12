import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl'
import { useSettingsStore } from '../stores/settingsStore'
import { Provider, TerminalTheme } from '../lib/types'
import { CliVisualProfile, getCliAppearancePreset, type SearchDecorations } from '../lib/terminalPresets'

interface ViewportState {
  initialized: boolean
  viewportY: number
  stickToBottom: boolean
}

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
  containerRef: React.RefObject<HTMLDivElement | null>,
  isActive?: boolean,
  provider?: Provider,
) {
  const [terminal, setTerminal] = useState<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const webglAddonRef = useRef<WebglAddon | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const mountedRef = useRef(false)
  const webglAvailableRef = useRef(true)
  const fitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fitRafRef = useRef<number | null>(null)
  const activationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activationRafRef = useRef<number | null>(null)
  const wasActiveRef = useRef(false)
  const lastAppliedProviderRef = useRef<Provider | undefined>(provider)
  const searchDecorationsRef = useRef<SearchDecorations>({
    matchOverviewRuler: '#94a3b880',
    activeMatchColorOverviewRuler: '#e2e8f0',
    matchBackground: '#94a3b830',
    activeMatchBackground: '#94a3b860',
  })
  const viewportStateRef = useRef<ViewportState>({
    initialized: false,
    viewportY: 0,
    stickToBottom: true,
  })

  const isElementVisible = useCallback((el: HTMLElement): boolean => {
    try {
      const style = window.getComputedStyle(el)
      return style.visibility !== 'hidden' && style.display !== 'none'
    } catch {
      return true
    }
  }, [])

  const syncViewportState = useCallback((term: Terminal) => {
    const buf = term.buffer.active
    viewportStateRef.current = {
      initialized: true,
      viewportY: buf.viewportY,
      stickToBottom: buf.viewportY >= buf.baseY - 1,
    }
  }, [])

  const restoreViewportState = useCallback((term: Terminal) => {
    const saved = viewportStateRef.current
    if (!saved.initialized) {
      syncViewportState(term)
      return
    }

    if (saved.stickToBottom) {
      term.scrollToBottom()
    } else {
      const maxScroll = term.buffer.active.baseY
      term.scrollToLine(Math.min(saved.viewportY, maxScroll))
    }

    syncViewportState(term)
  }, [syncViewportState])

  const applyAppearance = useCallback((
    term: Terminal,
    appearance: ReturnType<typeof resolveAppearanceSafe>,
    preserveGeometry = false,
  ) => {
    searchDecorationsRef.current = appearance.searchDecorations
    term.options.theme = appearance.theme
    term.options.cursorBlink = appearance.cursorBlink
    term.options.cursorStyle = appearance.cursorStyle

    if (!preserveGeometry) {
      term.options.letterSpacing = appearance.letterSpacing
      term.options.lineHeight = appearance.lineHeight
    }
  }, [])

  const focusTerminalIfAppropriate = useCallback((term: Terminal) => {
    const active = document.activeElement as HTMLElement | null
    if (!active || active === document.body || active.closest('[data-terminal-pane]')) {
      try { term.focus() } catch {}
    }
  }, [])

  const safeFit = useCallback((force = false) => {
    const term = termRef.current
    const fitAddon = fitAddonRef.current
    const container = containerRef.current
    if (!term || !fitAddon || !container) return false

    const visibleTarget = term.element || container
    if (container.clientWidth < 10 || container.clientHeight < 10) return false
    if (!force && !isElementVisible(visibleTarget)) return false

    try {
      fitAddon.fit()
    } catch {
      return false
    }

    restoreViewportState(term)
    return true
  }, [containerRef, isElementVisible, restoreViewportState])

  const debouncedFit = useCallback(() => {
    if (fitRafRef.current) cancelAnimationFrame(fitRafRef.current)
    if (fitTimerRef.current) clearTimeout(fitTimerRef.current)

    fitTimerRef.current = setTimeout(() => {
      fitRafRef.current = requestAnimationFrame(() => {
        fitRafRef.current = null
        safeFit()
      })
      fitTimerRef.current = null
    }, 120)
  }, [safeFit])

  const attachWebgl = useCallback((term: Terminal) => {
    if (webglAddonRef.current || !webglAvailableRef.current) return

    try {
      const addon = new WebglAddon()
      addon.onContextLoss(() => {
        console.warn('[useTerminal] WebGL context lost, falling back to the default renderer')
        if (webglAddonRef.current === addon) {
          webglAddonRef.current = null
        }
        webglAvailableRef.current = false
        try { addon.dispose() } catch {}
        try { term.refresh(0, term.rows - 1) } catch {}
      })
      term.loadAddon(addon)
      webglAddonRef.current = addon
    } catch {
      webglAvailableRef.current = false
      console.warn('[useTerminal] WebGL addon failed to load, using the default renderer')
    }
  }, [])

  const detachWebgl = useCallback(() => {
    if (!webglAddonRef.current) return
    try { webglAddonRef.current.dispose() } catch {}
    webglAddonRef.current = null
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container || mountedRef.current) return

    mountedRef.current = true

    const settings = useSettingsStore.getState()
    const theme = settings.getTheme()
    const appearance = resolveAppearanceSafe(
      theme.terminalColors,
      provider,
      settings.cliVisualProfile,
      settings.cursorStyle,
      settings.cursorBlink,
    )

    const term = new Terminal({
      fontSize: settings.terminalFontSize,
      fontFamily: settings.fontFamily,
      cursorBlink: appearance.cursorBlink,
      cursorStyle: appearance.cursorStyle,
      theme: appearance.theme,
      allowTransparency: true,
      scrollback: 10000,
      convertEol: true,
      fontWeight: '400',
      fontWeightBold: '700',
      letterSpacing: appearance.letterSpacing,
      lineHeight: appearance.lineHeight,
      drawBoldTextInBrightColors: true,
      minimumContrastRatio: 1,
      rightClickSelectsWord: true,
      scrollOnUserInput: true,
    })

    applyAppearance(term, appearance)

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    fitAddonRef.current = fitAddon

    term.open(container)

    const searchAddon = new SearchAddon()
    term.loadAddon(searchAddon)
    searchAddonRef.current = searchAddon

    const webLinksAddon = new WebLinksAddon((event, uri) => {
      if (event.ctrlKey || event.metaKey) {
        window.open(uri, '_blank', 'noopener,noreferrer')
      }
    })
    term.loadAddon(webLinksAddon)
    attachWebgl(term)

    const scrollDisposable = term.onScroll(() => {
      syncViewportState(term)
    })

    const resizeObserver = new ResizeObserver(() => {
      debouncedFit()
    })
    resizeObserver.observe(container)

    const handleGlobalRefit = () => debouncedFit()
    window.addEventListener('ghostshell:refit', handleGlobalRefit)

    termRef.current = term
    syncViewportState(term)
    setTerminal(term)

    requestAnimationFrame(() => {
      safeFit(true)
      activationTimerRef.current = setTimeout(() => {
        activationTimerRef.current = null
        if (!mountedRef.current || termRef.current !== term) return
        safeFit(true)
        try { term.refresh(0, term.rows - 1) } catch {}
        if (isActive) {
          focusTerminalIfAppropriate(term)
        }
      }, 60)
    })

    return () => {
      mountedRef.current = false
      if (fitTimerRef.current) clearTimeout(fitTimerRef.current)
      if (fitRafRef.current) cancelAnimationFrame(fitRafRef.current)
      if (activationTimerRef.current) clearTimeout(activationTimerRef.current)
      if (activationRafRef.current) cancelAnimationFrame(activationRafRef.current)
      resizeObserver.disconnect()
      scrollDisposable.dispose()
      window.removeEventListener('ghostshell:refit', handleGlobalRefit)
      detachWebgl()
      termRef.current = null
      fitAddonRef.current = null
      searchAddonRef.current = null
      term.dispose()
      setTerminal(null)
    }
  }, [
    applyAppearance,
    attachWebgl,
    containerRef,
    debouncedFit,
    detachWebgl,
    focusTerminalIfAppropriate,
    isActive,
    provider,
    safeFit,
    syncViewportState,
  ])

  useEffect(() => {
    const becameActive = !!isActive && !wasActiveRef.current
    wasActiveRef.current = !!isActive
    if (!becameActive || !terminal) return

    if (activationTimerRef.current) clearTimeout(activationTimerRef.current)
    if (activationRafRef.current) cancelAnimationFrame(activationRafRef.current)

    const runActivationPass = (focusTerminal: boolean) => {
      activationRafRef.current = requestAnimationFrame(() => {
        activationRafRef.current = null
        safeFit(true)
        try { terminal.refresh(0, terminal.rows - 1) } catch {}
        if (focusTerminal) {
          focusTerminalIfAppropriate(terminal)
        }
      })
    }

    runActivationPass(true)
    activationTimerRef.current = setTimeout(() => {
      activationTimerRef.current = null
      runActivationPass(false)
    }, 120)

    return () => {
      if (activationTimerRef.current) clearTimeout(activationTimerRef.current)
      if (activationRafRef.current) cancelAnimationFrame(activationRafRef.current)
    }
  }, [focusTerminalIfAppropriate, isActive, safeFit, terminal])

  useEffect(() => {
    if (!terminal) return

    const unsubscribe = useSettingsStore.subscribe((state, prevState) => {
      const term = termRef.current
      if (!term) return

      const applyThemeAppearance = () => {
        const resolvedTheme = state.getTheme()
        const appearance = resolveAppearanceSafe(
          resolvedTheme.terminalColors,
          provider,
          state.cliVisualProfile,
          state.cursorStyle,
          state.cursorBlink,
        )
        applyAppearance(term, appearance)
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
          applyThemeAppearance()
        }
      } catch (err) {
        console.warn('[useTerminal] settings sync error:', err)
      }
    })

    const initialState = useSettingsStore.getState()
    const initialAppearance = resolveAppearanceSafe(
      initialState.getTheme().terminalColors,
      provider,
      initialState.cliVisualProfile,
      initialState.cursorStyle,
      initialState.cursorBlink,
    )
    const providerChanged = lastAppliedProviderRef.current !== provider
    lastAppliedProviderRef.current = provider
    applyAppearance(terminal, initialAppearance, providerChanged)
    if (!providerChanged) {
      debouncedFit()
    }
    try { terminal.refresh(0, terminal.rows - 1) } catch {}

    return unsubscribe
  }, [applyAppearance, debouncedFit, provider, terminal])

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

  const fit = useCallback(() => {
    safeFit()
  }, [safeFit])

  return { terminal, fit, searchNext, searchPrev, clearSearch }
}
