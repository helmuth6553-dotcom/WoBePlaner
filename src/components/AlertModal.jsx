import { Info, AlertCircle, CheckCircle } from 'lucide-react'

export default function AlertModal({ isOpen, onClose, title, message, type = 'info' }) {
    if (!isOpen) return null

    const styles = {
        info: { bg: 'bg-blue-100', text: 'text-blue-600', icon: Info },
        error: { bg: 'bg-red-100', text: 'text-red-600', icon: AlertCircle },
        success: { bg: 'bg-green-100', text: 'text-green-600', icon: CheckCircle }
    }

    const Style = styles[type] || styles.info
    const Icon = Style.icon

    return (
        <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-white/20 scale-100 animate-in zoom-in-95 duration-200 text-center">
                <div data-testid="alert-icon" data-type={type} className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-4 ${Style.bg} ${Style.text}`}>
                    <Icon size={24} />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-gray-500 mb-6">{message}</p>
                <button
                    onClick={onClose}
                    className="w-full py-3 bg-gray-700 text-white rounded-xl font-bold hover:bg-gray-800 transition-transform active:scale-95"
                >
                    OK
                </button>
            </div>
        </div>
    )
}
