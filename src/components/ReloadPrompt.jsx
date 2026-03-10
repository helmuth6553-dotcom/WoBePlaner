import React from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

function ReloadPrompt() {
    const {
        offlineReady: [offlineReady, setOfflineReady],
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        onRegistered(r) {
            console.log('SW Registered: ', r)
        },
        onRegisterError(error) {
            console.log('SW registration error', error)
        },
    })

    const close = () => {
        setOfflineReady(false)
        setNeedRefresh(false)
    }

    // Only render if there's a new version
    if (!needRefresh) {
        return null
    }

    return (
        <div className="fixed bottom-24 left-4 right-4 z-[9999] md:left-auto md:right-8 md:bottom-8 md:w-96 animate-in fade-in slide-in-from-bottom-5 duration-300">
            <div className="p-4 bg-white border border-blue-100 shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-xl flex flex-col gap-3">
                <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center">
                        <span className="text-xl">✨</span>
                    </div>
                    <div>
                        <h3 className="font-semibold text-slate-800 pb-1">Neue Version verfügbar!</h3>
                        <p className="text-sm text-slate-600">
                            Die App wurde aktualisiert. Aktualisiere jetzt für die neusten Verbesserungen!
                        </p>
                    </div>
                </div>
                <div className="flex justify-end gap-2 mt-1">
                    <button
                        onClick={() => close()}
                        className="px-4 py-2 text-sm font-medium text-slate-500 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                        Später
                    </button>
                    <button
                        onClick={() => updateServiceWorker(true)}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm shadow-blue-200 transition-colors"
                    >
                        Jetzt aktualisieren
                    </button>
                </div>
            </div>
        </div>
    )
}

export default ReloadPrompt
