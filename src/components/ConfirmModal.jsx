import { AlertTriangle } from 'lucide-react'

export default function ConfirmModal({ isOpen, onClose, onConfirm, title, message, confirmText = "Bestätigen", cancelText = "Abbrechen", isDestructive = false }) {
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-white/20 scale-100 animate-in zoom-in-95 duration-200">
                <div className="flex items-center gap-3 mb-4">
                    <div className={`p-3 rounded-full ${isDestructive ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-900'}`}>
                        <AlertTriangle size={24} />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900">{title}</h3>
                </div>

                <p className="text-gray-500 mb-6">{message}</p>

                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={() => { onConfirm(); onClose(); }}
                        data-destructive={isDestructive || undefined}
                        className={`flex-1 py-3 text-white rounded-xl font-bold shadow-lg transition-transform active:scale-95 ${isDestructive ? 'bg-red-600 hover:bg-red-700 shadow-red-200' : 'bg-green-600 hover:bg-green-700 shadow-green-200'}`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    )
}
