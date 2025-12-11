import React from 'react'

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props)
        this.state = { hasError: false, error: null, errorInfo: null }
    }

    // eslint-disable-next-line no-unused-vars
    static getDerivedStateFromError(error) {
        // React requires this parameter even though we don't use it
        return { hasError: true }
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ error, errorInfo })
        console.error("Uncaught error:", error, errorInfo)
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-4 bg-red-50 text-red-900 min-h-screen flex flex-col items-center justify-center">
                    <h1 className="text-xl font-bold mb-4">Ein Fehler ist aufgetreten</h1>
                    <pre className="bg-white p-4 rounded shadow text-xs overflow-auto max-w-full">
                        {this.state.error && this.state.error.toString()}
                        <br />
                        {this.state.errorInfo && this.state.errorInfo.componentStack}
                    </pre>
                    <button
                        onClick={() => window.location.reload()}
                        className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg"
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
