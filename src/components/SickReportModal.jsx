import { useState } from 'react'
import { Thermometer } from 'lucide-react'

/**
 * SickReportModal - Modal for employees to report sick leave
 * Used in RosterFeed for quick sick day reporting
 */
export default function SickReportModal({ isOpen, onClose, onSubmit }) {
    const [start, setStart] = useState('')
    const [end, setEnd] = useState('')

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/50 z-[150] flex items-center justify-center p-4">
            <div className="bg-white rounded-[1.5rem] p-6 w-full max-w-sm shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-white/20 animate-in fade-in zoom-in duration-200">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-red-600">
                    <Thermometer /> Krankmeldung
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                    Wähle den Zeitraum deiner Krankheit. Deine Dienste werden automatisch freigegeben und als dringend markiert.
                </p>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Von</label>
                        <input
                            type="date"
                            value={start}
                            onChange={e => setStart(e.target.value)}
                            className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Bis (einschließlich)</label>
                        <input
                            type="date"
                            value={end}
                            onChange={e => setEnd(e.target.value)}
                            className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                        />
                    </div>
                    <div className="flex gap-2 pt-2">
                        <button
                            onClick={onClose}
                            className="flex-1 py-2 bg-gray-100 rounded-lg font-medium hover:bg-gray-200"
                        >
                            Abbrechen
                        </button>
                        <button
                            onClick={() => onSubmit(start, end)}
                            disabled={!start || !end}
                            className="flex-1 py-2 bg-red-600 text-white rounded-lg font-bold disabled:opacity-50 hover:bg-red-700 shadow-lg shadow-red-200"
                        >
                            Melden
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
