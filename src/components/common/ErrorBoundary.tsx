import { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  componentStack: string
  resetting: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, componentStack: '', resetting: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, componentStack: '', resetting: false }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack || '' })
    console.error('[GhostShell] React error caught:', error, info.componentStack)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, componentStack: '', resetting: false })
  }

  handleResetAppState = async () => {
    this.setState({ resetting: true })

    const storageKeys = [
      'ghostshell-settings',
      'ghostshell-models',
      'ghostshell-workspaces',
      'ghostshell-history',
      'ghostshell-shortcuts',
      'ghostshell-tab-snapshot',
    ]
    const localKeys = [
      'ghostshell-agents',
      'ghostshell-threads',
      'ghostshell-settings',
      'ghostshell-history',
      'ghostshell-workspaces',
      'ghostshell-shortcuts',
      'ghostshell-models',
    ]

    try {
      const api = window.ghostshell
      if (api?.storageRemove) {
        await Promise.allSettled(storageKeys.map((key) => api.storageRemove(key)))
      }
    } catch (error) {
      console.error('[GhostShell] Failed clearing persisted Electron storage:', error)
    }

    try {
      for (const key of localKeys) {
        localStorage.removeItem(key)
        sessionStorage.removeItem(key)
      }
    } catch (error) {
      console.error('[GhostShell] Failed clearing browser storage:', error)
    }

    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      const errorMessage = this.state.error?.message || 'An unexpected error occurred'
      const stackPreview = [this.state.error?.stack, this.state.componentStack]
        .filter(Boolean)
        .join('\n')
        .trim()

      return (
        <div className="h-screen w-screen flex items-center justify-center bg-ghost-bg">
          <div className="text-center space-y-4 max-w-xl px-6">
            <div className="text-4xl">&#x1f4a5;</div>
            <h2 className="text-sm font-bold text-ghost-text">Something crashed</h2>
            <p className="text-xs text-ghost-text-dim">
              {errorMessage}
            </p>
            {stackPreview && (
              <pre className="max-h-52 overflow-auto rounded-lg border border-ghost-border bg-ghost-surface px-3 py-2 text-left text-[11px] leading-relaxed text-ghost-text-dim whitespace-pre-wrap">
                {stackPreview}
              </pre>
            )}
            <div className="flex gap-2 justify-center">
              <button
                onClick={this.handleRetry}
                className="h-8 px-4 rounded-lg bg-ghost-accent text-white text-xs font-medium hover:bg-ghost-accent/80 transition-colors"
              >
                Retry
              </button>
              <button
                onClick={() => window.location.reload()}
                className="h-8 px-4 rounded-lg bg-ghost-surface text-ghost-text text-xs border border-ghost-border hover:bg-slate-800/50 transition-colors"
              >
                Reload App
              </button>
              <button
                onClick={() => void this.handleResetAppState()}
                disabled={this.state.resetting}
                className="h-8 px-4 rounded-lg bg-ghost-surface text-ghost-text text-xs border border-ghost-border hover:bg-slate-800/50 transition-colors disabled:opacity-50"
              >
                {this.state.resetting ? 'Resetting...' : 'Reset App State'}
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
