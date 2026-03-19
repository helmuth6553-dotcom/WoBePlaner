import { useState, useEffect } from 'react'
import { Lock, Unlock, Eye, EyeOff, Settings } from 'lucide-react'

/**
 * MonthSettingsModal - Admin modal for roster month settings
 * Controls visibility and edit permissions for monthly roster
 */
export default function MonthSettingsModal({ isOpen, onClose, year, month, isOpenStatus, isVisibleStatus, onUpdate }) {
    const [localOpen, setLocalOpen] = useState(isOpenStatus)
    const [localVisible, setLocalVisible] = useState(isVisibleStatus)

    useEffect(() => {
        setLocalOpen(isOpenStatus)
        setLocalVisible(isVisibleStatus)
    }, [isOpenStatus, isVisibleStatus])

    if (!isOpen) return null

    const handleSave = () => {
        onUpdate(localOpen, localVisible)
        onClose()
    }

    return (
        <div className="fixed inset-0 bg-black/50 z-[150] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-[1.5rem] p-6 w-full max-w-sm shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-white/20 animate-in fade-in zoom-in duration-200">
                <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <Settings className="text-gray-400" /> Einstellungen für {month}/{year}
                </h3>

                <div className="space-y-6">
                    {/* Toggle Open/Closed - Whole row clickable */}
                    <div
                        className="flex justify-between items-center p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors select-none"
                        onClick={() => setLocalOpen(!localOpen)}
                    >
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg transition-colors ${localOpen ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                {localOpen ? <Unlock size={20} /> : <Lock size={20} />}
                            </div>
                            <div>
                                <div className="font-bold text-sm">Eintragung {localOpen ? 'Erlaubt' : 'Gesperrt'}</div>
                                <div className="text-xs text-gray-500 mt-0.5 max-w-[180px]">
                                    {localOpen ? 'Mitarbeiter können sich eintragen.' : 'Keine Änderungen durch Mitarbeiter.'}
                                </div>
                            </div>
                        </div>
                        <div className={`w-12 h-7 rounded-full p-1 transition-colors ${localOpen ? 'bg-green-500' : 'bg-gray-300'}`}>
                            <div className={`w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${localOpen ? 'translate-x-5' : 'translate-x-0'}`} />
                        </div>
                    </div>

                    {/* Toggle Visible/Hidden - Whole row clickable */}
                    <div
                        className="flex justify-between items-center p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors select-none"
                        onClick={() => setLocalVisible(!localVisible)}
                    >
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg transition-colors ${localVisible ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-500'}`}>
                                {localVisible ? <Eye size={20} /> : <EyeOff size={20} />}
                            </div>
                            <div>
                                <div className="font-bold text-sm">Dienstplan {localVisible ? 'Sichtbar' : 'Versteckt'}</div>
                                <div className="text-xs text-gray-500 mt-0.5 max-w-[180px]">
                                    {localVisible ? 'Mitarbeiter sehen Dienste.' : 'Plan ist nur für Admins sichtbar.'}
                                </div>
                            </div>
                        </div>
                        <div className={`w-12 h-7 rounded-full p-1 transition-colors ${localVisible ? 'bg-blue-500' : 'bg-gray-300'}`}>
                            <div className={`w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${localVisible ? 'translate-x-5' : 'translate-x-0'}`} />
                        </div>
                    </div>
                </div>

                <div className="flex gap-2 pt-6">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                    >
                        Abbrechen
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex-1 py-3 bg-teal-500 text-white rounded-xl font-bold hover:bg-teal-600 transition-colors shadow-lg"
                    >
                        Speichern
                    </button>
                </div>
            </div>
        </div>
    )
}
