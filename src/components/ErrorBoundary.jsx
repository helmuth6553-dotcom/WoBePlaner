import React from 'react'
import { captureError, addBreadcrumb } from '../lib/sentry.js'

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props)
        this.state = { hasError: false, error: null, errorInfo: null, eventId: null }
    }

    // eslint-disable-next-line no-unused-vars
    static getDerivedStateFromError(error) {
        // React requires this parameter even though we don't use it
        return { hasError: true }
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ error, errorInfo })

        // Add breadcrumb for context
        addBreadcrumb('error-boundary', 'React Error Boundary caught an error', {
            errorName: error?.name,
            errorMessage: error?.message,
        })

        // Send to Sentry with component stack
        captureError(error, {
            tags: {
                source: 'error-boundary',
                component: errorInfo?.componentStack?.split('\n')[1]?.trim() || 'unknown',
            },
            extra: {
                componentStack: errorInfo?.componentStack,
            },
            level: 'fatal',
        })

        // Also log to console for development
        console.error("Uncaught error:", error, errorInfo)
    }

    handleReload = () => {
        addBreadcrumb('user-action', 'User clicked reload after error')
        window.location.reload()
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-4 bg-red-50 text-red-900 min-h-screen flex flex-col items-center justify-center">
                    <h1 className="text-xl font-bold mb-4">Ein Fehler ist aufgetreten</h1>
                    <p className="text-sm text-red-700 mb-4">
                        Der Fehler wurde automatisch gemeldet und wird untersucht.
                    </p>
                    <pre className="bg-white p-4 rounded shadow text-xs overflow-auto max-w-full max-h-48">
                        {this.state.error && this.state.error.toString()}
                        <br />
                        {this.state.errorInfo && this.state.errorInfo.componentStack}
                    </pre>
                    <button
                        onClick={this.handleReload}
                        className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                    >
                        Neu laden
                    </button>
                </div>
            )
        }

        return this.props.children
    }
}

export default ErrorBoundary

