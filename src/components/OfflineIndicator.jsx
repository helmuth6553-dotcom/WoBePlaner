import { useState, useEffect } from 'react'
import { WifiOff, Wifi } from 'lucide-react'

/**
 * OfflineIndicator Component
 * 
 * Displays a visual banner when the user is offline.
 * Shows a brief "back online" message when connection is restored.
 * 
 * Features:
 * - Monitors navigator.onLine status
 * - Listens for online/offline events
 * - Animated slide-in/out transitions
 * - German language messages
 */
export default function OfflineIndicator() {
    const [isOnline, setIsOnline] = useState(navigator.onLine)
    const [showReconnected, setShowReconnected] = useState(false)
    const [wasOffline, setWasOffline] = useState(false)

    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true)
            // Show "back online" message if we were previously offline
            if (wasOffline) {
                setShowReconnected(true)
                // Hide after 3 seconds
                setTimeout(() => setShowReconnected(false), 3000)
            }
            setWasOffline(false)
        }

        const handleOffline = () => {
            setIsOnline(false)
            setWasOffline(true)
        }

        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)

        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
        }
    }, [wasOffline])

    // Nothing to show if online and not showing reconnection message
    if (isOnline && !showReconnected) return null

    return (
        <div
            className={`
                fixed top-0 left-0 right-0 z-[100] 
                flex items-center justify-center gap-2 
                py-2 px-4 text-sm font-medium
                transform transition-all duration-300 ease-out
                ${isOnline
                    ? 'bg-green-500 text-white translate-y-0'
                    : 'bg-gray-800 text-white translate-y-0'
                }
            `}
            role="alert"
            aria-live="polite"
        >
            {isOnline ? (
                <>
                    <Wifi size={16} className="animate-pulse" />
                    <span>Verbindung wiederhergestellt</span>
                </>
            ) : (
                <>
                    <WifiOff size={16} />
                    <span>Du bist offline – Änderungen werden nicht gespeichert</span>
                </>
            )}
        </div>
    )
}

/**
 * useOnlineStatus Hook
 * 
 * Simple hook to get current online status.
 * Can be used in components that need to react to connectivity changes.
 * 
 * Usage:
 *   const isOnline = useOnlineStatus()
 *   if (!isOnline) { // disable submit button }
 */
export function useOnlineStatus() {
    const [isOnline, setIsOnline] = useState(navigator.onLine)

    useEffect(() => {
        const handleOnline = () => setIsOnline(true)
        const handleOffline = () => setIsOnline(false)

        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)

        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
        }
    }, [])

    return isOnline
}
