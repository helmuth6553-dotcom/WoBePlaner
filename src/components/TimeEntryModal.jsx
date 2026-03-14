/**
 * TimeEntryModal.jsx - Modal for editing time entries
 * 
 * Extracted from TimeTracking.jsx for reuse in V2.
 * Handles shift time entry editing with interruption support.
 */

import { useState, useEffect, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { XCircle } from 'lucide-react'
import { calculateWorkHours } from '../utils/timeCalculations'
import { constructIso, constructEndIso, constructInterruptionIso, isValidInterruptionTime } from '../utils/timeTrackingHelpers'

/**
 * @param {Object} props
 * @param {Object} props.item - The shift/absence item being edited
 * @param {Object} props.entry - Existing time entry (if any)
 * @param {Object} props.userProfile - User profile with weekly_hours
 * @param {Function} props.onSave - Callback with { actualStart, actualEnd, interruptions, calculatedHours }
 * @param {Function} props.onClose - Callback to close the modal
 */
export default function TimeEntryModal({ item, entry, userProfile, onSave, onClose }) {
    const isAbsence = item?.itemType === 'absence'
    const isApproved = entry?.status === 'approved'

    // Form state
    const [formData, setFormData] = useState({
        actualStart: '',
        actualEnd: '',
        interruptions: [],
        newIntStart: '',
        newIntEnd: '',
        newIntNote: ''
    })

    // Initialize form data when item changes
    useEffect(() => {
        if (!item) return

        if (entry) {
            // Existing entry - use saved values
            setFormData({
                actualStart: format(parseISO(entry.actual_start), 'HH:mm'),
                actualEnd: format(parseISO(entry.actual_end), 'HH:mm'),
                interruptions: (entry.interruptions || []).map(int => ({
                    start: typeof int.start === 'string' && int.start.includes('T')
                        ? format(parseISO(int.start), 'HH:mm')
                        : int.start,
                    end: typeof int.end === 'string' && int.end.includes('T')
                        ? format(parseISO(int.end), 'HH:mm')
                        : int.end,
                    note: int.note || ''
                })),
                newIntStart: '',
                newIntEnd: ''
            })
        } else if (item.itemType === 'shift') {
            // New entry for shift - use planned times
            setFormData({
                actualStart: format(parseISO(item.start_time), 'HH:mm'),
                actualEnd: format(parseISO(item.end_time), 'HH:mm'),
                interruptions: [],
                newIntStart: '',
                newIntEnd: ''
            })
        } else {
            // Absence - calculate default times
            const weeklyHours = Number(userProfile?.weekly_hours) || 40
            const dailyHours = weeklyHours / 5
            const endHour = 8 + Math.floor(dailyHours)
            const endMinute = Math.round((dailyHours % 1) * 60)

            setFormData({
                actualStart: '08:00',
                actualEnd: `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`,
                interruptions: [],
                newIntStart: '',
                newIntEnd: ''
            })
        }
    }, [item, entry, userProfile])

    // Calculate hours live
    const calculatedHours = useMemo(() => {
        if (!item || !formData.actualStart || !formData.actualEnd) return 0

        const baseIso = item.itemType === 'shift'
            ? item.start_time
            : item.sortDate?.toISOString()

        const startIso = constructIso(baseIso, formData.actualStart)
        const endIso = constructEndIso(baseIso, formData.actualStart, formData.actualEnd)

        if (!startIso || !endIso) return 0

        // Process interruptions
        const processedInterruptions = formData.interruptions.map(int => ({
            start: constructInterruptionIso(baseIso, int.start),
            end: constructInterruptionIso(baseIso, int.end)
        })).filter(int => int.start && int.end)

        // Check for team shift collision
        if (item.isTeam && item.isColliding) {
            return 0
        }

        const type = item.type || 'T'
        return calculateWorkHours(startIso, endIso, type, processedInterruptions)
    }, [formData, item])

    // Handle save
    const handleSave = () => {
        const baseIso = item.itemType === 'shift'
            ? item.start_time
            : item.sortDate?.toISOString()

        const actualStart = constructIso(baseIso, formData.actualStart)
        const actualEnd = constructEndIso(baseIso, formData.actualStart, formData.actualEnd)

        const interruptions = formData.interruptions.map(int => ({
            start: constructInterruptionIso(baseIso, int.start),
            end: constructInterruptionIso(baseIso, int.end),
            note: int.note || ''
        }))

        onSave({
            actualStart,
            actualEnd,
            interruptions,
            calculatedHours
        })
    }

    // Add interruption
    const addInterruption = () => {
        if (formData.newIntStart && formData.newIntEnd) {
            setFormData({
                ...formData,
                interruptions: [
                    ...formData.interruptions,
                    { start: formData.newIntStart, end: formData.newIntEnd, note: formData.newIntNote }
                ],
                newIntStart: '',
                newIntEnd: '',
                newIntNote: ''
            })
        }
    }

    // Remove interruption
    const removeInterruption = (idx) => {
        const newInts = [...formData.interruptions]
        newInts.splice(idx, 1)
        setFormData({ ...formData, interruptions: newInts })
    }

    // Check if this is a night shift (shows interruption UI)
    const isNightShift = item?.type && (
        item.type.toUpperCase() === 'ND' ||
        item.type.toLowerCase().includes('nacht')
    )

    if (!item) return null

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-[1.5rem] p-6 w-full max-w-lg shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-white/20 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
                <h3 className="text-xl font-bold mb-4">
                    {isApproved ? 'Details' : 'Zeit erfassen'}
                </h3>

                <div className="space-y-4 mb-6">
                    {/* Time inputs */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Start</label>
                            <input
                                type="time"
                                value={formData.actualStart}
                                onChange={e => setFormData({ ...formData, actualStart: e.target.value })}
                                readOnly={isApproved}
                                className={`w-full border-2 p-3 rounded-xl text-lg font-bold text-center transition-all outline-none ${isApproved ? 'bg-gray-100 border-gray-200 text-gray-500' : 'bg-gray-50 border-gray-200 focus:border-black focus:ring-1 focus:ring-black hover:border-gray-300'}`}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Ende</label>
                            <input
                                type="time"
                                value={formData.actualEnd}
                                onChange={e => setFormData({ ...formData, actualEnd: e.target.value })}
                                readOnly={isApproved}
                                className={`w-full border-2 p-3 rounded-xl text-lg font-bold text-center transition-all outline-none ${isApproved ? 'bg-gray-100 border-gray-200 text-gray-500' : 'bg-gray-50 border-gray-200 focus:border-black focus:ring-1 focus:ring-black hover:border-gray-300'}`}
                            />
                        </div>
                    </div>

                    {/* Interruptions (only for night shifts) */}
                    {isNightShift && (
                        <div className="bg-gray-50 border rounded-xl p-3 space-y-2">
                            <label className="block text-xs font-bold text-gray-500 uppercase">
                                Unterbrechung Bereitschaftszeit
                            </label>

                            {/* Existing interruptions */}
                            {formData.interruptions.map((int, idx) => (
                                <div key={idx} className="bg-white p-2 rounded text-sm border shadow-sm space-y-1">
                                    <div className="flex justify-between items-center">
                                        <span className="font-mono font-medium">
                                            {typeof int.start === 'string' && int.start.includes('T') ? format(parseISO(int.start), 'HH:mm') : int.start} - {typeof int.end === 'string' && int.end.includes('T') ? format(parseISO(int.end), 'HH:mm') : int.end}
                                        </span>
                                        {!isApproved && (
                                            <button
                                                onClick={() => removeInterruption(idx)}
                                                className="text-red-500 bg-red-50 p-1 rounded hover:bg-red-100 transition-colors"
                                            >
                                                <XCircle size={16} />
                                            </button>
                                        )}
                                    </div>
                                    {isApproved ? (
                                        int.note && <div className="text-xs text-gray-500">Grund: {int.note}</div>
                                    ) : (
                                        <input
                                            type="text"
                                            value={int.note || ''}
                                            onChange={e => {
                                                const updated = [...formData.interruptions]
                                                updated[idx] = { ...updated[idx], note: e.target.value }
                                                setFormData({ ...formData, interruptions: updated })
                                            }}
                                            placeholder="Grund der Unterbrechung"
                                            className="w-full border p-1.5 rounded text-xs"
                                        />
                                    )}
                                </div>
                            ))}

                            {/* Add new interruption */}
                            {!isApproved && (
                                <div className="space-y-2 mt-3">
                                    <div className="flex gap-2 items-end">
                                        <div className="flex-1">
                                            <label className="text-xs font-bold text-gray-500 block mb-1">Start</label>
                                            <input
                                                type="time"
                                                value={formData.newIntStart}
                                                onChange={e => setFormData({ ...formData, newIntStart: e.target.value })}
                                                className="w-full border p-2 rounded-lg text-sm text-center"
                                            />
                                        </div>
                                        <span className="text-gray-300 pb-2">-</span>
                                        <div className="flex-1">
                                            <label className="text-xs font-bold text-gray-500 block mb-1">Ende</label>
                                            <input
                                                type="time"
                                                value={formData.newIntEnd}
                                                onChange={e => setFormData({ ...formData, newIntEnd: e.target.value })}
                                                className="w-full border p-2 rounded-lg text-sm text-center"
                                            />
                                        </div>
                                    </div>
                                    <input
                                        type="text"
                                        value={formData.newIntNote}
                                        onChange={e => setFormData({ ...formData, newIntNote: e.target.value })}
                                        placeholder="Grund der Unterbrechung"
                                        className="w-full border p-2 rounded-lg text-sm"
                                    />
                                    <button
                                        onClick={addInterruption}
                                        disabled={!isValidInterruptionTime(formData.newIntStart, formData.newIntEnd)}
                                        className={`w-full text-white px-4 py-2.5 rounded-lg font-bold transition-all ${isValidInterruptionTime(formData.newIntStart, formData.newIntEnd) ? 'bg-black hover:bg-gray-800' : 'bg-gray-300 cursor-not-allowed opacity-50'}`}
                                    >
                                        Unterbrechung hinzufügen
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Hours display */}
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 shadow-sm mt-4">
                        <div className="flex justify-between items-center text-blue-900 font-bold">
                            <span className="text-sm uppercase tracking-wider">Berechnet</span>
                            <span className="text-2xl">{Number(calculatedHours).toFixed(2)}h</span>
                        </div>
                        {!isAbsence && item?.type && (
                            <div className="flex justify-between items-center text-xs text-blue-600/80 font-medium border-t border-blue-200/50 pt-2 mt-2">
                                <span>Geplant laut Dienstplan</span>
                                <span>{calculateWorkHours(item.start_time, item.end_time, item.type).toFixed(2)}h</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Buttons */}
                <div className="flex gap-3 mt-6">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold transition-colors"
                    >
                        Abbrechen
                    </button>
                    {!isApproved && (
                        <button
                            onClick={handleSave}
                            className="flex-1 py-3 bg-black hover:bg-gray-900 text-white shadow-lg shadow-black/20 rounded-xl font-bold transition-all"
                        >
                            Speichern
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
