import { useState } from 'react'
import { supabase } from '../supabase'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addDays, parseISO } from 'date-fns'
import { AlertTriangle, RefreshCw, CheckCircle } from 'lucide-react'

export default function ShiftRepair() {
    const [startMonth, setStartMonth] = useState('2025-11')
    const [endMonth, setEndMonth] = useState('2026-01')
    const [loading, setLoading] = useState(false)
    const [progress, setProgress] = useState('')

    // Standard Holidays for the requested period (Nov 25 - Jan 26) + General
    const holidays = [
        '2025-11-01', // Allerheiligen
        '2025-12-24', // Heiligabend
        '2025-12-25', // 1. Weihnachtstag
        '2025-12-26', // 2. Weihnachtstag
        '2025-12-31', // Silvester
        '2026-01-01', // Neujahr
        '2026-01-06', // Heilige Drei Könige
    ]

    const isHoliday = (date) => {
        const dateStr = format(date, 'yyyy-MM-dd')
        return holidays.includes(dateStr)
    }

    const isDayBeforeHoliday = (date) => {
        const nextDay = addDays(date, 1)
        return isHoliday(nextDay)
    }

    // Helper to create ISO string from local date and time [H, M]
    const createLocalIso = (baseDate, hours, minutes, addDaysCount = 0) => {
        const d = new Date(baseDate)
        if (addDaysCount > 0) d.setDate(d.getDate() + addDaysCount)
        d.setHours(hours, minutes, 0, 0)
        return d.toISOString()
    }

    const handleRegenerate = async () => {
        if (!confirm(`ACHTUNG: Alle Dienste vom ${startMonth} bis ${endMonth} werden GELÖSCHT und neu generiert.\n\nBereits eingeteilte Mitarbeiter und Zeiterfassungen in diesem Zeitraum gehen verloren!\n\nFortfahren?`)) {
            return
        }

        setLoading(true)
        setProgress('Starte...')

        try {
            const start = startOfMonth(parseISO(startMonth))
            const end = endOfMonth(parseISO(endMonth))
            const days = eachDayOfInterval({ start, end })

            // 1. Find and Delete existing shifts and dependencies
            setProgress('Suche alte Dienste...')
            const { data: shiftsToDelete, error: fetchError } = await supabase
                .from('shifts')
                .select('id')
                .gte('start_time', start.toISOString())
                .lte('start_time', end.toISOString())

            if (fetchError) throw fetchError

            if (shiftsToDelete && shiftsToDelete.length > 0) {
                const ids = shiftsToDelete.map(s => s.id)

                setProgress('Lösche Zuweisungen & Zeiten...')
                await supabase.from('shift_interests').delete().in('shift_id', ids)
                await supabase.from('time_entries').delete().in('shift_id', ids)
                try { await supabase.from('shift_logs').delete().in('shift_id', ids) } catch { /* ignore if table doesn't exist */ }

                setProgress('Lösche Dienste...')
                const { error: deleteError } = await supabase
                    .from('shifts')
                    .delete()
                    .in('id', ids)

                if (deleteError) throw deleteError
            }

            // 2. Generate new shifts using Exact Rules from User (April 2026 Pattern)
            // FIX: Use createLocalIso to ensure correct Timezone handling (Winter/Summer time)
            setProgress('Generiere neue Dienste...')
            const newShifts = []

            for (const day of days) {
                const dayName = format(day, 'EEEE') // Monday, Tuesday...
                const isHol = isHoliday(day)
                const isPreHol = isDayBeforeHoliday(day)

                // 1. DBD (Always 20:00 - 00:00 Next Day)
                newShifts.push({
                    type: 'DBD',
                    start_time: createLocalIso(day, 20, 0),
                    end_time: createLocalIso(day, 0, 0, 1) // Next Day 00:00
                })

                // 2. ND (Always start 19:00)
                // End: 10:00 if (Friday OR Saturday OR PreHol)
                // End: 08:00 otherwise
                let ndEndHour = 8
                if (dayName === 'Friday' || dayName === 'Saturday' || isPreHol) {
                    ndEndHour = 10
                }
                newShifts.push({
                    type: 'ND',
                    start_time: createLocalIso(day, 19, 0),
                    end_time: createLocalIso(day, ndEndHour, 0, 1) // Next Day
                })

                // 3. TD1
                // Tue, Wed: 07:30 - 14:30
                // Sat, Sun, Hol: 09:30 - 14:30
                if (isHol || dayName === 'Saturday' || dayName === 'Sunday') {
                    newShifts.push({
                        type: 'TD1',
                        start_time: createLocalIso(day, 9, 30),
                        end_time: createLocalIso(day, 14, 30)
                    })
                } else if (dayName === 'Tuesday' || dayName === 'Wednesday') {
                    newShifts.push({
                        type: 'TD1',
                        start_time: createLocalIso(day, 7, 30),
                        end_time: createLocalIso(day, 14, 30)
                    })
                }

                // 4. TD2
                // Wed, Fri, Sat, Sun, Hol: 14:00 - 19:30
                if (isHol || ['Wednesday', 'Friday', 'Saturday', 'Sunday'].includes(dayName)) {
                    newShifts.push({
                        type: 'TD2',
                        start_time: createLocalIso(day, 14, 0),
                        end_time: createLocalIso(day, 19, 30)
                    })
                }
            }

            // Batch Insert
            const { error: insertError } = await supabase
                .from('shifts')
                .insert(newShifts)

            if (insertError) throw insertError

            setProgress('Fertig!')
            alert('Dienste erfolgreich neu generiert (Muster April 2026, Zeitzone korrigiert).')

        } catch (e) {
            alert('Fehler: ' + e.message)
            setProgress('Fehler aufgetreten.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-200">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-orange-600">
                <AlertTriangle /> Dienstplan Reparatur
            </h2>
            <p className="text-gray-600 mb-6 text-sm">
                Dieses Tool generiert die Dienste basierend auf dem exakten Muster vom <strong>April 2026</strong>.
                <br />
                <strong>Warnung:</strong> Alle bestehenden Einteilungen in diesem Zeitraum werden gelöscht!
            </p>

            <div className="flex flex-col gap-4 mb-6">
                <div className="w-full">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Von</label>
                    <input
                        type="month"
                        value={startMonth}
                        onChange={e => setStartMonth(e.target.value)}
                        className="border p-2 rounded-lg w-full"
                    />
                </div>
                <div className="w-full">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Bis</label>
                    <input
                        type="month"
                        value={endMonth}
                        onChange={e => setEndMonth(e.target.value)}
                        className="border p-2 rounded-lg w-full"
                    />
                </div>
                <button
                    onClick={handleRegenerate}
                    disabled={loading}
                    className="w-full bg-orange-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-orange-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    {loading ? <RefreshCw className="animate-spin" /> : <RefreshCw />}
                    Neu Generieren
                </button>
            </div>

            {progress && (
                <div className="text-sm font-bold text-gray-500">
                    Status: {progress}
                </div>
            )}
        </div>
    )
}
