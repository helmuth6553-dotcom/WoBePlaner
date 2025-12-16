/**
 * Toast Notification Component
 * 
 * Simple toast notification for displaying user-friendly error messages
 * and success notifications.
 */

import { useState, useEffect, createContext, useContext, useCallback } from 'react'
import { X, AlertCircle, CheckCircle, AlertTriangle, Info } from 'lucide-react'

// Context for toast notifications
const ToastContext = createContext(null)

// Toast types with their styling
const ToastStyles = {
    error: {
        bg: 'bg-red-50 border-red-200',
        icon: AlertCircle,
        iconColor: 'text-red-500',
        titleColor: 'text-red-800',
        messageColor: 'text-red-600'
    },
    success: {
        bg: 'bg-green-50 border-green-200',
        icon: CheckCircle,
        iconColor: 'text-green-500',
        titleColor: 'text-green-800',
        messageColor: 'text-green-600'
    },
    warning: {
        bg: 'bg-yellow-50 border-yellow-200',
        icon: AlertTriangle,
        iconColor: 'text-yellow-500',
        titleColor: 'text-yellow-800',
        messageColor: 'text-yellow-600'
    },
    info: {
        bg: 'bg-blue-50 border-blue-200',
        icon: Info,
        iconColor: 'text-blue-500',
        titleColor: 'text-blue-800',
        messageColor: 'text-blue-600'
    }
}

// Single Toast component
function Toast({ id, type = 'info', title, message, duration = 5000, onDismiss }) {
    const style = ToastStyles[type] || ToastStyles.info
    const Icon = style.icon

    useEffect(() => {
        if (duration > 0) {
            const timer = setTimeout(() => onDismiss(id), duration)
            return () => clearTimeout(timer)
        }
    }, [id, duration, onDismiss])

    return (
        <div
            className={`${style.bg} border rounded-xl p-4 shadow-lg flex items-start gap-3 animate-in slide-in-from-right duration-300 max-w-sm`}
            role="alert"
        >
            <Icon className={`${style.iconColor} flex-shrink-0 mt-0.5`} size={20} />
            <div className="flex-1 min-w-0">
                <h4 className={`font-bold ${style.titleColor} text-sm`}>{title}</h4>
                {message && (
                    <p className={`${style.messageColor} text-sm mt-1`}>{message}</p>
                )}
            </div>
            <button
                onClick={() => onDismiss(id)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Schließen"
            >
                <X size={18} />
            </button>
        </div>
    )
}

// Toast Container - renders at the top-right of the screen
function ToastContainer({ toasts, onDismiss }) {
    if (toasts.length === 0) return null

    return (
        <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2">
            {toasts.map(toast => (
                <Toast
                    key={toast.id}
                    {...toast}
                    onDismiss={onDismiss}
                />
            ))}
        </div>
    )
}

// Toast Provider - wraps the app
export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([])

    const addToast = useCallback((toast) => {
        const id = Date.now() + Math.random()
        setToasts(prev => [...prev, { id, ...toast }])
        return id
    }, [])

    const dismissToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id))
    }, [])

    const showError = useCallback((title, message) => {
        return addToast({ type: 'error', title, message })
    }, [addToast])

    const showSuccess = useCallback((title, message) => {
        return addToast({ type: 'success', title, message })
    }, [addToast])

    const showWarning = useCallback((title, message) => {
        return addToast({ type: 'warning', title, message })
    }, [addToast])

    const showInfo = useCallback((title, message) => {
        return addToast({ type: 'info', title, message })
    }, [addToast])

    // Clear all toasts
    const clearAll = useCallback(() => {
        setToasts([])
    }, [])

    const value = {
        toasts,
        addToast,
        dismissToast,
        showError,
        showSuccess,
        showWarning,
        showInfo,
        clearAll
    }

    return (
        <ToastContext.Provider value={value}>
            {children}
            <ToastContainer toasts={toasts} onDismiss={dismissToast} />
        </ToastContext.Provider>
    )
}

// Hook to use toast notifications
export function useToast() {
    const context = useContext(ToastContext)
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider')
    }
    return context
}

// Utility function to show error from errorHandler
export function showErrorToast(toast, friendlyError) {
    if (!toast || !friendlyError) return
    toast.showError(friendlyError.title, friendlyError.message)
}

export default ToastProvider
