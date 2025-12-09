import { X } from 'lucide-react'
import { useEffect, useState } from 'react'

export default function ActionSheet({ isOpen, onClose, title, children }) {
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        if (isOpen) {
            setVisible(true)
            document.body.style.overflow = 'hidden'
        } else {
            const timer = setTimeout(() => setVisible(false), 300)
            document.body.style.overflow = ''
            return () => clearTimeout(timer)
        }
    }, [isOpen])

    if (!visible && !isOpen) return null

    return (
        <div className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center">
            {/* Backdrop */}
            <div
                className={`fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
                onClick={onClose}
            ></div>

            {/* Sheet */}
            <div
                className={`bg-white w-full max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl transform transition-transform duration-300 ease-out max-h-[90vh] overflow-y-auto ${isOpen ? 'translate-y-0 sm:scale-100' : 'translate-y-full sm:translate-y-0 sm:scale-95'}`}
            >
                <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex justify-between items-center z-10">
                    <h3 className="font-bold text-lg text-gray-900">{title}</h3>
                    <button onClick={onClose} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors">
                        <X size={20} className="text-gray-600" />
                    </button>
                </div>
                <div className="p-4 safe-pb">
                    {children}
                </div>
            </div>
        </div>
    )
}
