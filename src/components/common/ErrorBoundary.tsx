import { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[GhostShell] React error caught:', error, info.componentStack)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen flex items-center justify-center bg-ghost-bg">
          <div className="text-center space-y-4 max-w-md px-6">
            <div className="text-4xl">&#x1f4a5;</div>
            <h2 className="text-sm font-bold text-ghost-text">Something crashed</h2>
            <p className="text-xs text-ghost-text-dim">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
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
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
