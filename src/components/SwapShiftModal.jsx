import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { User, Check, AlertTriangle, ArrowRight, Users } from 'lucide-react'

export default function SwapShiftModal({ isOpen, onClose, shift, onSwap, currentUser }) {
    if (!isOpen || !shift) return null

    const [colleagues, setColleagues] = useState([])
    const [selectedUserId, setSelectedUserId] = useState('')
    const [step, setStep] = useState(1) // 1: Select, 2: Confirm

    useEffect(() => {
        const fetchColleagues = async () => {
            const { data } = await supabase
                .from('profiles')
                .select('id, full_name, display_name, email')
                .neq('id', currentUser.id) // Exclude self
                .neq('role', 'admin') // Exclude Admins
                .order('full_name')
            setColleagues(data || [])
        }
        fetchColleagues()
    }, [currentUser])

    const handleNext = () => {
        if (selectedUserId) setStep(2)
    }

    const handleConfirm = () => {
        onSwap(shift.id, selectedUserId)
        setStep(1)
        setSelectedUserId('')
        onClose()
    }

    const selectedColleague = colleagues.find(c => c.id === selectedUserId)

    return (
        <div className="fixed inset-0 bg-black/50 z-[150] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <Users className="text-blue-600" /> Dienst tauschen
                </h3>

                {step === 1 && (
                    <>
                        <p className="text-sm text-gray-500 mb-4">
                            Du bist für diesen Dienst eingetragen. Wähle einen Kollegen, der den Dienst übernimmt.
                        </p>

                        <div className="mb-6">
                            <label className="block text-sm font-bold mb-2 text-gray-700">Kollege auswählen</label>
                            <select
                                value={selectedUserId}
                                onChange={e => setSelectedUserId(e.target.value)}
                                className="w-full p-3 border border-gray-300 rounded-xl bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
                            >
                                <option value="">-- Bitte wählen --</option>
                                {colleagues.map(c => (
                                    <option key={c.id} value={c.id}>
                                        {c.display_name || c.full_name || c.email}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex gap-3">
                            <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-gray-100 font-medium hover:bg-gray-200">
                                Abbrechen
                            </button>
                            <button
                                onClick={handleNext}
                                disabled={!selectedUserId}
                                className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold disabled:opacity-50 hover:bg-blue-700 flex items-center justify-center gap-2"
                            >
                                Weiter <ArrowRight size={18} />
                            </button>
                        </div>
                    </>
                )}

                {step === 2 && (
                    <>
                        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="text-yellow-600 shrink-0 mt-0.5" size={20} />
                                <div>
                                    <h4 className="font-bold text-yellow-800 text-sm">Bestätigung erforderlich</h4>
                                    <p className="text-xs text-yellow-700 mt-1">
                                        Hast du diesen Tausch mit <b>{selectedColleague?.display_name || selectedColleague?.full_name || selectedColleague?.email}</b> besprochen und hat er/sie zugestimmt?
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button onClick={() => setStep(1)} className="flex-1 py-3 rounded-xl bg-gray-100 font-medium hover:bg-gray-200">
                                Zurück
                            </button>
                            <button
                                onClick={handleConfirm}
                                className="flex-1 py-3 rounded-xl bg-black text-white font-bold hover:bg-gray-800 flex items-center justify-center gap-2"
                            >
                                <Check size={18} /> Ja, Tausch bestätigen
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
