import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { CalendarX, Zap, AlertCircle } from 'lucide-react'
import { calculateWorkHours } from '../utils/timeCalculations'

const SHIFT_TYPE_LABELS = {
    TD: 'Tagdienst',
    TD1: 'Tagdienst 1',
    TD2: 'Tagdienst 2',
    ND: 'Nachtdienst',
    DBD: 'Doppeldienst',
    TEAM: 'Teamsitzung',
    FORTBILDUNG: 'Fortbildung',
    EINSCHULUNG: 'Einschulung',
    MITARBEITERGESPRAECH: 'MA-Gespräch',
    SONSTIGES: 'Sonstiges',
    SUPERVISION: 'Supervision',
    AST: 'Anlaufstelle',
}

const SHIFT_TYPE_COLORS = {
    TD: 'bg-blue-100 text-blue-700',
    TD1: 'bg-blue-100 text-blue-700',
    TD2: 'bg-sky-100 text-sky-700',
    ND: 'bg-indigo-100 text-indigo-700',
    DBD: 'bg-violet-100 text-violet-700',
    TEAM: 'bg-purple-100 text-purple-700',
    FORTBILDUNG: 'bg-fuchsia-100 text-fuchsia-700',
    EINSCHULUNG: 'bg-pink-100 text-pink-700',
    MITARBEITERGESPRAECH: 'bg-emerald-100 text-emerald-700',
    SONSTIGES: 'bg-gray-100 text-gray-700',
    SUPERVISION: 'bg-violet-100 text-violet-800',
    AST: 'bg-teal-100 text-teal-700',
}

export default function MyShiftsView({ shifts, currentDate, userId }) {
    if (shifts.length === 0) {
        return (
            <div className="text-center py-20 bg-gray-50 rounded-3xl border border-dashed border-gray-200 mt-4">
                <CalendarX className="mx-auto text-gray-300 mb-4" size={48} />
                <h3 className="text-lg font-bold text-gray-500">Keine eigenen Dienste</h3>
                <p className="text-sm text-gray-400 max-w-xs mx-auto mt-2">
                    Für {format(currentDate, 'MMMM yyyy', { locale: de })} sind dir keine Dienste zugeteilt.
                </p>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-2 mt-2">
            {shifts.map(shift => {
                const start = new Date(shift.start_time)
                const end = new Date(shift.end_time)
                const typeLabel = SHIFT_TYPE_LABELS[shift.type] || shift.title || shift.type
                const typeColor = SHIFT_TYPE_COLORS[shift.type] || 'bg-gray-100 text-gray-700'
                const interest = shift.interests?.find(i => i.user_id === userId)
                const isFlex = interest?.is_flex === true
                const isUrgent = !!shift.urgent_since
                const hours = calculateWorkHours(shift.start_time, shift.end_time, shift.type)

                return (
                    <div
                        key={shift.id}
                        className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3"
                    >
                        {/* Datum */}
                        <div className="min-w-[72px]">
                            <div className="text-[11px] text-gray-400 font-medium uppercase tracking-wide leading-none mb-0.5">
                                {format(start, 'EEE', { locale: de })}
                            </div>
                            <div className="text-sm font-bold text-gray-800 leading-none">
                                {format(start, 'd. MMM', { locale: de })}
                            </div>
                        </div>

                        {/* Typ-Badge */}
                        <span className={`text-xs font-bold px-2 py-1 rounded-lg shrink-0 ${typeColor}`}>
                            {shift.type === 'SONSTIGES' && shift.title ? shift.title : (shift.type || '–')}
                        </span>

                        {/* Uhrzeit + Stunden */}
                        <div className="flex-1 text-sm text-gray-600 font-medium">
                            {format(start, 'HH:mm')} – {format(end, 'HH:mm')}
                            <span className="ml-2 text-[11px] text-gray-400 font-normal">{hours}h</span>
                        </div>

                        {/* Badges */}
                        <div className="flex gap-1.5 items-center shrink-0">
                            {isFlex && (
                                <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
                                    <Zap size={10} />
                                    Flex
                                </span>
                            )}
                            {isUrgent && (
                                <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
                                    <AlertCircle size={10} />
                                    Dringend
                                </span>
                            )}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
