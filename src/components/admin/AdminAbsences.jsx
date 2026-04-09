import { useState, useEffect } from 'react'
import { Calendar, CheckCircle, XCircle, Download, Trash2 } from 'lucide-react'
import { format, eachDayOfInterval, isWeekend } from 'date-fns'
import { getHolidays, isHoliday } from '../../utils/holidays'
import { supabase } from '../../supabase'
import { logAdminAction } from '../../utils/adminAudit'
import { generateVacationRequestPDF } from '../../utils/vacationPdfGenerator'

/**
 * =========================================================================
 * AdminAbsences
 * The approval center for Vacation and Compensatory Time off.
 * 
 * Key Features:
 * - PDF Generation: creates legally binding "Vacation Request" PDFs
 * - Approval Flow: Updates status and logs to Audit
 * =========================================================================
 */
export default function AdminAbsences({ onNavigateToCalendar }) {
    const [requests, setRequests] = useState([])
    const [archive, setArchive] = useState([])
    const [_downloadedIds, setDownloadedIds] = useState(new Set())

    const fetchRequests = async () => {
        const { data: pending } = await supabase.from('absences').select('*, profiles!user_id(full_name, email, vacation_days_per_year)').eq('status', 'beantragt').neq('type', 'Krank').order('start_date')
        setRequests(pending || [])
        const { data: processed } = await supabase.from('absences').select('*, profiles!user_id(full_name, email, vacation_days_per_year)').in('status', ['genehmigt', 'abgelehnt', 'storniert']).neq('type', 'Krank').order('start_date', { ascending: false }).limit(50)
        setArchive(processed || [])
    }

    useEffect(() => { fetchRequests() }, [])

    const handleAction = async (id, status) => {
        const { data: { user } } = await supabase.auth.getUser()

        // Find request specifically for logging context 
        const request = requests.find(r => r.id === id) || archive.find(r => r.id === id)
        const targetUserId = request?.user_id
        const previousStatus = request?.status

        const updates = { status }
        if (user) {
            updates.approved_by = user.id
            if (status === 'genehmigt') updates.approved_at = new Date().toISOString()
        }

        const { error } = await supabase.from('absences').update(updates).eq('id', id)

        // Audit Logging
        if (!error && user && targetUserId) {
            await logAdminAction(
                `absence_${status}`,
                targetUserId,
                'absence_request',
                id,
                {
                    before: { status: previousStatus },
                    after: { status: status },
                    context: {
                        type: request?.type,
                        start_date: request?.start_date,
                        end_date: request?.end_date,
                        employee_name: request?.profiles?.full_name
                    }
                }
            )
        }

        fetchRequests()
    }

    const handleCancel = async (id) => {
        if (!confirm('Wirklich stornieren?')) return

        const { data: { user } } = await supabase.auth.getUser()

        // Logging Context
        const request = requests.find(r => r.id === id) || archive.find(r => r.id === id)



        const { error } = await supabase.from('absences').update({ status: 'storniert' }).eq('id', id)

        if (error) console.error('Cancel Error:', error)

        // Audit Logging
        // Audit Logging
        if (!error && user && request) {
            await logAdminAction(
                'absence_storniert',
                request.user_id,
                'absence_request',
                id,
                {
                    before: { status: request.status },
                    after: { status: 'storniert' },
                    context: {
                        type: request.type,
                        start_date: request.start_date,
                        end_date: request.end_date,
                        employee_name: request.profiles?.full_name
                    }
                }
            )
        }

        fetchRequests()
    }

    const generatePDF = async (req) => {
        try {
            // Fetch signature
            const { data: signature } = await supabase
                .from('signatures')
                .select('*')
                .eq('request_id', req.id)
                .eq('role', 'applicant')
                .single()

            // Fetch approver name
            let approverName = "System Administrator"
            if (req.approved_by) {
                const { data: approver } = await supabase
                    .from('profiles')
                    .select('full_name, email')
                    .eq('id', req.approved_by)
                    .single()
                if (approver) approverName = approver.full_name || approver.email
            }

            // Fetch vacation account data
            let yearlyEntitlement = req.profiles?.vacation_days_per_year || 25
            if (!req.profiles?.vacation_days_per_year) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('vacation_days_per_year')
                    .eq('id', req.user_id)
                    .single()
                if (profile) yearlyEntitlement = profile.vacation_days_per_year || 25
            }

            const startDate = new Date(req.start_date)
            const _endDate = new Date(req.end_date)
            const year = startDate.getFullYear()

            // Calculate total used vacation days this year
            const { data: allVacations } = await supabase
                .from('absences')
                .select('start_date, end_date')
                .eq('user_id', req.user_id)
                .eq('status', 'genehmigt')
                .eq('type', 'Urlaub')
                .gte('start_date', `${year}-01-01`)
                .lte('start_date', `${year}-12-31`)

            let daysUsedTotal = 0
            if (allVacations) {
                const holidays = getHolidays(year)
                allVacations.forEach(v => {
                    daysUsedTotal += eachDayOfInterval({ start: new Date(v.start_date), end: new Date(v.end_date) })
                        .filter(d => !isWeekend(d) && !isHoliday(d, holidays))
                        .length
                })
            }
            const remaining = yearlyEntitlement - daysUsedTotal

            // Get facility name
            const { data: employeeProfile } = await supabase
                .from('profiles')
                .select('facility, department')
                .eq('id', req.user_id)
                .single()
            const facilityName = employeeProfile?.facility || employeeProfile?.department || 'Chill Out'

            // Generate PDF using utility
            generateVacationRequestPDF({
                request: req,
                employeeName: req.profiles?.full_name || req.profiles?.email || 'Mitarbeiter',
                facilityName,
                vacationAccount: {
                    entitlement: yearlyEntitlement,
                    remaining: remaining
                },
                signature: signature || null,
                approval: {
                    approverName,
                    approvedAt: req.approved_at
                }
            })

            setDownloadedIds(prev => new Set(prev).add(req.id))
        } catch (e) {
            console.error(e)
            alert("Fehler beim Erstellen des PDFs: " + e.message)
        }
    }

    return (
        <div>
            <h2 className="text-xl font-bold mb-6">Offene Urlaubsanträge</h2>
            {requests.length === 0 && (<div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-200 mb-8"><CheckCircle className="mx-auto text-green-500 mb-2" size={32} /><p className="text-gray-500">Alles erledigt!</p></div>)}
            <div className="space-y-3 mb-12">{requests.map(req => (
                <div key={req.id} className="bg-white p-4 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center shadow-[0_2px_10px_rgb(0,0,0,0.04)] hover:shadow-[0_4px_20px_rgb(0,0,0,0.06)] transition-all gap-4">
                    <div className="w-full md:w-auto">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-lg">{req.profiles?.full_name || req.profiles?.email}</span>
                            <span className="bg-yellow-100 text-yellow-800 text-xs font-bold px-2 py-0.5 rounded uppercase">{req.type}</span>
                        </div>
                        <p className="text-gray-600 flex items-center gap-2 mb-1">
                            <Calendar size={14} />{format(new Date(req.start_date), 'dd.MM.yyyy')} - {format(new Date(req.end_date), 'dd.MM.yyyy')}
                        </p>
                        {req.created_at && (
                            <p className="text-xs text-gray-400 mb-2">Eingereicht am {format(new Date(req.created_at), 'dd.MM.yyyy')}</p>
                        )}
                        {/* VIEW IN CALENDAR BUTTON */}
                        <button
                            onClick={() => onNavigateToCalendar && onNavigateToCalendar(req.start_date)}
                            className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
                        >
                            <Calendar size={12} /> Im Kalender ansehen
                        </button>
                    </div>
                    <div className="flex gap-2 w-full md:w-auto">
                        <button onClick={() => handleAction(req.id, 'genehmigt')} className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-green-700 flex items-center gap-2"><CheckCircle size={18} /> Genehmigen</button>
                        <button onClick={() => handleAction(req.id, 'abgelehnt')} className="bg-red-100 text-red-600 px-4 py-2 rounded-lg font-bold hover:bg-red-200 flex items-center gap-2"><XCircle size={18} /> Ablehnen</button>
                    </div>
                </div>
            ))}</div>

            <h2 className="text-xl font-bold mb-6 pt-8 border-t border-gray-200">Archiv</h2>
            <div className="space-y-3">{archive.map(req => (
                <div key={req.id} className="bg-gray-50 p-4 rounded-xl flex flex-col sm:flex-row flex-wrap justify-between items-start sm:items-center shadow-[0_2px_10px_rgb(0,0,0,0.04)] gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-sm sm:text-lg text-gray-700 truncate">{req.profiles?.full_name || req.profiles?.email}</span>
                            <span className="bg-gray-200 text-gray-600 text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded uppercase whitespace-nowrap">{req.type}</span>
                        </div>
                        <p className="text-gray-500 flex items-center gap-2 text-xs sm:text-sm">
                            <Calendar size={12} />{format(new Date(req.start_date), 'dd.MM.yyyy')} - {format(new Date(req.end_date), 'dd.MM.yyyy')}
                        </p>
                        {req.created_at && (
                            <p className="text-[10px] text-gray-400 mt-0.5">Eingereicht am {format(new Date(req.created_at), 'dd.MM.yyyy')}</p>
                        )}
                    </div>
                    <div className="flex gap-2 items-center w-full sm:w-auto justify-end mt-2 sm:mt-0">
                        <span className={`px-2 py-1 rounded text-[10px] sms:text-xs font-bold uppercase whitespace-nowrap ${req.status === 'genehmigt' ? 'bg-green-100 text-green-800' : req.status === 'storniert' ? 'bg-gray-200 text-gray-600 line-through' : 'bg-red-100 text-red-800'}`}>{req.status}</span>
                        {req.status !== 'storniert' && (
                            <button onClick={() => handleCancel(req.id)} className="p-1.5 sm:p-2 border rounded-lg bg-white text-red-600 hover:bg-red-50 flex-shrink-0" title="Stornieren">
                                <Trash2 size={16} />
                            </button>
                        )}
                        <button onClick={() => generatePDF(req)} className="p-1.5 sm:p-2 border rounded-lg bg-white text-gray-600 hover:bg-gray-100 flex-shrink-0">
                            <Download size={16} />
                        </button>
                    </div>
                </div>
            ))}</div>
        </div>
    )
}
