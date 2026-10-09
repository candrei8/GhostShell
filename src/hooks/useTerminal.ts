import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { useSettingsStore } from '../stores/settingsStore'
import { Provider, TerminalTheme } from '../lib/types'
import { CliVisualProfile, getCliAppearancePreset, type SearchDecorations } from '../lib/terminalPresets'
import { isWindowSuspended, onWindowResume } from '../lib/windowLifecycle'

// Above this many buffer lines a column change triggers an expensive reflow (in
// xterm and in ConPTY), so cols are debounced while rows still apply per frame.
// Same strategy and thresholds as VS Code's TerminalResizeDebouncer.
const REFLOW_DEBOUNCE_LINES = 200
const COLS_DEBOUNCE_MS = 100
// WebGL contexts are dropped by Chromium when the window is minimized or the
// GPU resets. Re-attach on resume, but give up after a few losses.
const MAX_WEBGL_RESTORES = 3

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
  readOnly = false,
) {
  const [terminal, setTerminal] = useState<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const webglAddonRef = useRef<WebglAddon | null>(null)
  // false only when WebGL can't be created at all; context *loss* is retried.
  const webglSupportedRef = useRef(true)
  const webglLossCountRef = useRef(0)
  const webglLostRef = useRef(false)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const searchDecorationsRef = useRef<SearchDecorations>({
    matchOverviewRuler: '#94a3b880',
    activeMatchColorOverviewRuler: '#e2e8f0',
    matchBackground: '#94a3b830',
    activeMatchBackground: '#94a3b860',
  })
  const appearanceProvider = provider === 'codex' ? undefined : provider
  const mounted = useRef(false)
  const rafRef = useRef<number | null>(null)
  const colsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * Cols/rows the container can hold right now, or null when it must not be
   * resized: window minimized, container collapsed, renderer not measured yet.
   * Hidden panes (visibility:hidden) still measure — they keep the size they
   * will have when shown, so showing them never resizes the PTY.
   */
  const measure = useCallback((): { cols: number; rows: number } | null => {
    const addon = fitAddonRef.current
    const term = termRef.current
    if (!addon || !term?.element) return null
    if (isWindowSuspended()) return null
    const host = term.element.parentElement
    if (!host || host.clientWidth < 10 || host.clientHeight < 10) return null
    const dims = addon.proposeDimensions()
    if (!dims || !Number.isFinite(dims.cols) || !Number.isFinite(dims.rows)) return null
    if (dims.cols < 2 || dims.rows < 1) return null
    return dims
  }, [])

  /**
   * Resize xterm; its onResize (wired in usePty) resizes the PTY in the same
   * tick, so the TUI never repaints against a size xterm doesn't have.
   */
  const applyDims = useCallback((cols: number, rows: number) => {
    const term = termRef.current
    if (!term || (term.cols === cols && term.rows === rows)) return

    const buf = term.buffer.active
    const wasAtBottom = buf.viewportY >= buf.baseY - 1
    const savedViewportY = buf.viewportY

    try {
      // Same as FitAddon.fit(): drop the old frame so no stale glyphs survive.
      ;(term as unknown as { _core?: { _renderService?: { clear?: () => void } } })._core?._renderService?.clear?.()
      term.resize(cols, rows)
    } catch {
      return
    }

    if (wasAtBottom) {
      term.scrollToBottom()
    } else if (term.buffer.active.viewportY !== savedViewportY) {
      // Keep the user where they were reading instead of yanking them.
      term.scrollToLine(Math.min(savedViewportY, term.buffer.active.baseY))
    }
  }, [])

  const clearColsTimer = useCallback(() => {
    if (colsTimerRef.current) {
      clearTimeout(colsTimerRef.current)
      colsTimerRef.current = null
    }
  }, [])

  /** Fit immediately (both axes). */
  const fitNow = useCallback(() => {
    clearColsTimer()
    const dims = measure()
    if (dims) applyDims(dims.cols, dims.rows)
  }, [applyDims, clearColsTimer, measure])

  /**
   * Fit on the next frame, coalescing every resize signal in between. Small
   * buffers resize fully each frame so the terminal tracks a window drag live;
   * large ones apply rows per frame and debounce the costly column reflow.
   */
  const scheduleFit = useCallback(() => {
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const term = termRef.current
      const dims = measure()
      if (!term || !dims) return

      if (term.buffer.normal.length < REFLOW_DEBOUNCE_LINES) {
        clearColsTimer()
        applyDims(dims.cols, dims.rows)
        return
      }

      if (dims.rows !== term.rows) applyDims(term.cols, dims.rows)
      if (dims.cols !== term.cols) {
        clearColsTimer()
        colsTimerRef.current = setTimeout(() => {
          colsTimerRef.current = null
          fitNow()
        }, COLS_DEBOUNCE_MS)
      }
    })
  }, [applyDims, clearColsTimer, fitNow, measure])

  const fit = useCallback(() => {
    fitNow()
  }, [fitNow])

  const detachWebgl = useCallback(() => {
    if (!webglAddonRef.current) return
    try { webglAddonRef.current.dispose() } catch {}
    webglAddonRef.current = null
  }, [])

  const attachWebgl = useCallback((term: Terminal) => {
    if (webglAddonRef.current || !webglSupportedRef.current) return
    if (webglLossCountRef.current > MAX_WEBGL_RESTORES) return

    try {
      const webglAddon = new WebglAddon()
      webglAddon.onContextLoss(() => {
        // Chromium drops WebGL contexts of minimized windows and on GPU resets.
        // Fall back to the DOM renderer for now and re-attach on resume
        // instead of staying on the (much slower) DOM renderer forever.
        console.warn('[useTerminal] WebGL context lost, using the DOM renderer until the window resumes')
        if (webglAddonRef.current === webglAddon) {
          webglAddonRef.current = null
        }
        webglLossCountRef.current += 1
        webglLostRef.current = true
        try { webglAddon.dispose() } catch {}
        try { term.refresh(0, term.rows - 1) } catch {}
        scheduleFit()
      })
      term.loadAddon(webglAddon)
      webglAddonRef.current = webglAddon
      webglLostRef.current = false
      // The WebGL renderer measures cells differently from the DOM renderer
      // (e.g. 8px vs 8.43px), so the cols fitted a moment ago are now wrong.
      scheduleFit()
    } catch {
      webglSupportedRef.current = false
      console.warn('WebGL addon failed to load, using the default renderer')
    }
  }, [scheduleFit])

  // Create terminal instance
  useEffect(() => {
    const container = containerElement
    if (!container || mounted.current) return

    mounted.current = true

    const settings = useSettingsStore.getState()
    const theme = settings.getTheme()
    const appearance = resolveAppearanceSafe(
      theme.terminalColors,
      appearanceProvider,
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
      // Opaque canvas: with transparency the WebGL renderer blends instead of
      // overwriting on repaints, which can smear stale glyphs. The pane behind
      // the terminal is the same solid theme background anyway.
      allowTransparency: false,
      scrollback: 10000,
      // NEVER convert EOL for a PTY-backed terminal. ConPTY already emits
      // proper \r\n; forcing bare \n (index-down, keep column) to \r\n yanks
      // the cursor to column 0 mid-repaint, which is exactly how TUI apps like
      // Claude Code end up with duplicated fragments at line starts.
      convertEol: false,
      fontWeight: '400',
      fontWeightBold: '700',
      letterSpacing: appearance.letterSpacing,
      lineHeight: appearance.lineHeight,
      drawBoldTextInBrightColors: true,
      minimumContrastRatio: 1,
      rightClickSelectsWord: true,
      scrollOnUserInput: true,
      disableStdin: false,
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

    termRef.current = term

    // First fit once the container has been laid out, and again when web
    // fonts finish loading (cell metrics change once the real font arrives).
    const firstFitRaf = requestAnimationFrame(() => fitNow())
    void document.fonts?.ready.then(() => {
      if (termRef.current === term) scheduleFit()
    })

    // Every size change of the host — window drag, sidebar spring, grid
    // relayout, maximize — lands here and is coalesced to one fit per frame.
    const resizeObserver = new ResizeObserver(() => scheduleFit())
    resizeObserver.observe(container)

    setTerminal(term)

    return () => {
      mounted.current = false
      cancelAnimationFrame(firstFitRaf)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      clearColsTimer()
      resizeObserver.disconnect()
      detachWebgl()
      termRef.current = null  // null ref BEFORE dispose so concurrent subscribers bail out
      term.dispose()
      setTerminal(null)
      fitAddonRef.current = null
    }
  }, [containerElement, clearColsTimer, detachWebgl, fitNow, scheduleFit])

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

  // Back from minimized: resizes were frozen while away, so apply the real
  // size once, re-attach WebGL if Chromium dropped the context, and repaint.
  useEffect(() => {
    if (!terminal) return
    return onWindowResume(() => {
      const term = termRef.current
      if (!term) return
      fitNow()
      if (webglLostRef.current) attachWebgl(term)
      try { term.refresh(0, term.rows - 1) } catch {}
    })
  }, [attachWebgl, fitNow, terminal])

  // Becoming the active pane: hidden panes keep their final size, so this is
  // normally a no-op fit; it mainly moves keyboard focus into the terminal.
  useEffect(() => {
    if (!isActive || !terminal) return

    const raf = requestAnimationFrame(() => {
      scheduleFit()
      if (readOnly) return

      // Focus terminal only when the pane doesn't already contain an editable control.
      const pane = containerElement?.closest('[data-terminal-pane]') || null
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
      const activeInsidePane = !!(pane && active && pane.contains(active))
      const activeIsEditable = !!active && (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active.isContentEditable
      )

      if (!active || active === document.body || (activeInsidePane && !activeIsEditable)) {
        try { terminal.focus() } catch {}
      }
    })

    return () => cancelAnimationFrame(raf)
  }, [containerElement, isActive, readOnly, terminal, scheduleFit])

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
          appearanceProvider,
          state.cliVisualProfile,
          state.cursorStyle,
          state.cursorBlink,
        )
        searchDecorationsRef.current = appearance.searchDecorations
        term.options.theme = appearance.theme
        term.options.cursorBlink = appearance.cursorBlink
        term.options.cursorStyle = appearance.cursorStyle
        term.options.letterSpacing = appearance.letterSpacing
        term.options.lineHeight = appearance.lineHeight
        scheduleFit()
        try { term.refresh(0, term.rows - 1) } catch {}
      }

      try {
        if (state.terminalFontSize !== prevState.terminalFontSize) {
          term.options.fontSize = state.terminalFontSize
          scheduleFit()
        }
        if (state.fontFamily !== prevState.fontFamily) {
          term.options.fontFamily = state.fontFamily
          scheduleFit()
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
      appearanceProvider,
      initialState.cliVisualProfile,
      initialState.cursorStyle,
      initialState.cursorBlink,
    )
    searchDecorationsRef.current = initialAppearance.searchDecorations
    terminal.options.theme = initialAppearance.theme
    terminal.options.cursorBlink = initialAppearance.cursorBlink
    terminal.options.cursorStyle = initialAppearance.cursorStyle
    terminal.options.letterSpacing = initialAppearance.letterSpacing
    terminal.options.lineHeight = initialAppearance.lineHeight
    scheduleFit()
    try { terminal.refresh(0, terminal.rows - 1) } catch {}

    return unsub
  }, [terminal, scheduleFit, appearanceProvider, provider])

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
