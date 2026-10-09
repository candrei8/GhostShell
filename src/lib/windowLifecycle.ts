/**
 * Window lifecycle for terminals: "is the window on screen right now?".
 *
 * Minimized, Chromium stops producing frames and may drop WebGL contexts, so
 * every terminal must (a) not resize its PTY to whatever transient size the
 * window reports and (b) refit, repaint and re-attach WebGL once it is back.
 *
 * Two signals feed this: the main process (`window:state`, reliable for
 * minimize/restore even with backgroundThrottling off) and the Page Visibility
 * API (covers anything else that hides the page).
 */

type ResumeListener = () => void

let minimized = false
let initialized = false
const resumeListeners = new Set<ResumeListener>()

function isDocumentHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}

/** True while the window is minimized/hidden: terminals must not resize. */
export function isWindowSuspended(): boolean {
  return minimized || isDocumentHidden()
}

function notifyResume() {
  if (isWindowSuspended()) return
  // Wait one frame so the restored window has its real size before anyone measures.
  requestAnimationFrame(() => {
    if (isWindowSuspended()) return
    for (const listener of [...resumeListeners]) {
      try {
        listener()
      } catch (err) {
        console.warn('[windowLifecycle] resume listener failed:', err)
      }
    }
  })
}

function init() {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  window.ghostshell?.onWindowState?.((state) => {
    const wasSuspended = isWindowSuspended()
    minimized = state === 'minimized'
    if (wasSuspended && !isWindowSuspended()) notifyResume()
  })

  document.addEventListener('visibilitychange', () => {
    if (!isDocumentHidden()) notifyResume()
  })
}

/** Subscribe to "window is visible again". Returns an unsubscribe function. */
export function onWindowResume(listener: ResumeListener): () => void {
  init()
  resumeListeners.add(listener)
  return () => {
    resumeListeners.delete(listener)
  }
}
