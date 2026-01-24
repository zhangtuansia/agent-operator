import React, { Component, type ReactNode } from 'react'
import { ErrorFallback } from './ErrorFallback'

export type ErrorBoundaryLevel = 'app' | 'section' | 'component'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Custom fallback UI (optional) */
  fallback?: ReactNode
  /** Error callback for logging/monitoring */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
  /** Error level determines the fallback UI styling */
  level: ErrorBoundaryLevel
  /** Custom recovery action */
  onReset?: () => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * Error Boundary component that catches JavaScript errors in child components
 * and displays a fallback UI instead of crashing the entire app.
 *
 * Usage:
 * - app level: Wraps the entire application, shows full error page
 * - section level: Wraps major sections (ChatDisplay, SessionList), shows error card
 * - component level: Wraps individual components, shows inline error
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log error for debugging
    console.error(`[ErrorBoundary:${this.props.level}] Error caught:`, error)
    console.error('Component stack:', errorInfo.componentStack)

    // Call optional error callback
    this.props.onError?.(error, errorInfo)
  }

  resetError = (): void => {
    this.setState({ hasError: false, error: null })
    this.props.onReset?.()
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Use default ErrorFallback component
      return (
        <ErrorFallback
          error={this.state.error!}
          resetError={this.resetError}
          level={this.props.level}
        />
      )
    }

    return this.props.children
  }
}

/**
 * HOC to wrap a component with an ErrorBoundary
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  level: ErrorBoundaryLevel,
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
): React.FC<P> {
  const WithErrorBoundary: React.FC<P> = (props) => (
    <ErrorBoundary level={level} onError={onError}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  )

  WithErrorBoundary.displayName = `withErrorBoundary(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`

  return WithErrorBoundary
}
