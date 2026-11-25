// Last-resort error boundary around the whole app. A render crash used to
// leave a BLANK window behind the wallpaper — indistinguishable from "the
// image broke the UI". Now the user sees what failed and can reload.
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface in the console too — dev tools / logs pick it up.
    console.error('render crash:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex min-h-screen items-center justify-center bg-rascal-bg p-6 text-rascal-text">
        <div className="w-full max-w-md rounded-2xl border border-rascal-line bg-rascal-panel p-6 text-center shadow-panel">
          <h1 className="text-base font-bold">Rascals hit an error</h1>
          <p className="mt-2 text-sm text-rascal-dim">
            The interface failed to draw. Reload — your account is stored on
            this device and is untouched.
          </p>
          <pre className="mt-3 max-h-32 overflow-auto rounded-lg bg-black/40 p-2 text-left text-[11px] text-rascal-amber">
            {this.state.error.message || String(this.state.error)}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 w-full rounded-xl bg-rascal-accent px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rascal-accent/30 transition-all duration-150 ease-smooth hover:brightness-110"
          >
            Reload Rascals
          </button>
        </div>
      </div>
    )
  }
}
