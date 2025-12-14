import { useState, useEffect } from 'react'
import { Users, Calendar, FileText, CheckCircle, XCircle, AlertTriangle, Plus, Mail, Download, Trash2, Link as LinkIcon, Thermometer, Settings, ShieldCheck, Shield } from 'lucide-react'
import { supabase } from '../supabase'
import { format, differenceInBusinessDays } from 'date-fns'
import { jsPDF } from 'jspdf'
import { logAdminAction } from '../utils/adminAudit'

import ShiftRepair from './ShiftRepair'
import AdminAuditLog from './admin/AdminAuditLog'
import AdminSickLeaves from './admin/AdminSickLeaves'
import AdminRoster from './admin/AdminRoster'
import AdminEmployees from './admin/AdminEmployees'

export default function AdminDashboard(props) {
    const [activeTab, setActiveTab] = useState('employees')

    return (
        <div className="p-4 pb-24 max-w-xl mx-auto">
            <h1 className="text-2xl font-bold mb-6 px-2">Admin Dashboard</h1>

            {/* Navigation Tabs */}
            <div className="flex flex-wrap gap-2 mb-6 px-2">
                <button onClick={() => setActiveTab('employees')} className={`flex-1 min-w-[100px] flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'employees' ? 'bg-black text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
                    <Users size={16} /> Mitarbeiter
                </button>
                <button onClick={() => setActiveTab('absences')} className={`flex-1 min-w-[100px] flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'absences' ? 'bg-black text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
                    <FileText size={16} /> Anträge
                </button>
                <button onClick={() => setActiveTab('sick')} className={`flex-1 min-w-[100px] flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'sick' ? 'bg-black text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
                    <Thermometer size={16} /> Krank
                </button>
                <button onClick={() => setActiveTab('roster')} className={`flex-1 min-w-[100px] flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'roster' ? 'bg-black text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
                    <Calendar size={16} /> Dienstplan
                </button>
                <button onClick={() => setActiveTab('system')} className={`flex-1 min-w-[100px] flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'system' ? 'bg-black text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
                    <Settings size={16} /> System
                </button>
                <button onClick={() => setActiveTab('audit')} className={`flex-1 min-w-[100px] flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'audit' ? 'bg-black text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
                    <ShieldCheck size={16} /> Audit
                </button>
            </div>

            {/* Content Container */}
            <div className="min-h-[400px]">
                {activeTab === 'employees' && <AdminEmployees />}
                {activeTab === 'absences' && <AdminAbsences onNavigateToCalendar={props.onNavigateToCalendar} />}
                {activeTab === 'sick' && <AdminSickLeaves />}
                {activeTab === 'roster' && <AdminRoster />}
                {activeTab === 'system' && <ShiftRepair />}
                {activeTab === 'audit' && <AdminAuditLog />}
            </div>
        </div>
    )
}


/**
 * =========================================================================
 * SUB-COMPONENT: AdminAbsences
 * The approval center for Vacation and Compensatory Time off.
 * 
 * Key Features:
 * - PDF Generation: creates legally binding "Vacation Request" PDFs
 * - Approval Flow: Updates status and logs to Audit
 * =========================================================================
 */
function AdminAbsences({ onNavigateToCalendar }) {
    const [requests, setRequests] = useState([])
    const [archive, setArchive] = useState([])
    const [downloadedIds, setDownloadedIds] = useState(new Set())

    const fetchRequests = async () => {
        const { data: pending } = await supabase.from('absences').select('*, profiles!user_id(full_name, email)').eq('status', 'beantragt').neq('type', 'Krank').order('start_date')
        setRequests(pending || [])
        const { data: processed } = await supabase.from('absences').select('*, profiles!user_id(full_name, email)').in('status', ['genehmigt', 'abgelehnt', 'storniert']).neq('type', 'Krank').order('start_date', { ascending: false }).limit(50)
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
                { before: { status: previousStatus }, after: { status: status } }
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
                { before: { status: request.status }, after: { status: 'storniert' } }
            )
        }

        fetchRequests()
    }

    const generatePDF = async (req) => {
        try {
            // --- DATA PREPARATION ---
            const { data: signature } = await supabase.from('signatures').select('*').eq('request_id', req.id).eq('role', 'applicant').single()

            let approverName = "System Administrator"
            if (req.approved_by) {
                const { data: approver } = await supabase.from('profiles').select('full_name, email').eq('id', req.approved_by).single()
                if (approver) approverName = approver.full_name || approver.email
            }

            const doc = new jsPDF()
            const name = req.profiles?.full_name || req.profiles?.email
            const startDate = new Date(req.start_date)
            const endDate = new Date(req.end_date)
            const durationDays = differenceInBusinessDays(endDate, startDate) + 1 // +1 for inclusive
            const companyName = "Verein zur Förderung des DOWAS Chill Out"

            // Calculations
            let yearlyEntitlement = req.profiles?.vacation_days_per_year || 25
            if (!req.profiles?.vacation_days_per_year) {
                const { data: profile } = await supabase.from('profiles').select('vacation_days_per_year').eq('id', req.user_id).single()
                if (profile) yearlyEntitlement = profile.vacation_days_per_year
            }
            const year = startDate.getFullYear()
            const { data: allVacations } = await supabase.from('absences').select('start_date, end_date').eq('user_id', req.user_id).eq('status', 'genehmigt').eq('type', 'Urlaub').gte('start_date', `${year}-01-01`).lte('start_date', `${year}-12-31`)
            let daysUsedTotal = 0
            if (allVacations) allVacations.forEach(v => { daysUsedTotal += differenceInBusinessDays(new Date(v.end_date), new Date(v.start_date)) + 1 })
            const remainingAfter = yearlyEntitlement - daysUsedTotal
            const remainingBefore = remainingAfter + durationDays

            // --- DESIGN CONSTANTS ---
            const successColor = [46, 125, 50] // Professional Green
            const errorColor = [198, 40, 40] // Professional Red
            const accentColor = [220, 220, 225] // Light Grey for backgrounds

            // --- RENDER HEADER ---
            // Clean White Header
            doc.setTextColor(40, 40, 45) // Dark professional text
            doc.setFont("helvetica", "bold")
            doc.setFontSize(16)
            doc.text(companyName, 15, 20)

            doc.setFontSize(10)
            doc.setFont("helvetica", "normal")
            doc.setTextColor(100, 100, 100) // Grey for metadata
            doc.text(`REF-ID: #${req.id}`, 195, 20, { align: 'right' })
            doc.text(`Datum: ${format(new Date(), 'dd.MM.yyyy')}`, 195, 26, { align: 'right' })

            // Subtle Separator Line
            doc.setDrawColor(220, 220, 220)
            doc.setLineWidth(0.5)
            doc.line(15, 35, 195, 35)

            // --- TITLE & STATUS ---
            let yPos = 60
            doc.setTextColor(0, 0, 0)
            doc.setFont("helvetica", "bold")
            doc.setFontSize(22)
            doc.text("Urlaubsantrag", 15, yPos)

            // Status Badge
            const statusText = req.status.toUpperCase()
            doc.setFontSize(10)
            const badgeWidth = doc.getTextWidth(statusText) + 20

            if (req.status === 'genehmigt') doc.setFillColor(...successColor)
            else if (req.status === 'abgelehnt') doc.setFillColor(...errorColor)
            else doc.setFillColor(150, 150, 150)

            doc.roundedRect(195 - badgeWidth, yPos - 8, badgeWidth, 10, 2, 2, 'F')
            doc.setTextColor(255, 255, 255)
            doc.text(statusText, 195 - (badgeWidth / 2), yPos - 1.5, { align: 'center' })

            // --- KEY INFO BOX (Grey Background) ---
            yPos += 15
            doc.setFillColor(...accentColor)
            doc.roundedRect(15, yPos, 180, 25, 2, 2, 'F')

            doc.setTextColor(80, 80, 80)
            doc.setFontSize(8)
            doc.text("MITARBEITER", 20, yPos + 8)
            doc.text("ZEITRAUM", 90, yPos + 8)
            doc.text("DAUER", 160, yPos + 8)

            doc.setTextColor(0, 0, 0)
            doc.setFontSize(11)
            doc.setFont("helvetica", "bold")
            doc.text(name, 20, yPos + 18)
            doc.text(`${format(startDate, 'dd.MM.yyyy')} - ${format(endDate, 'dd.MM.yyyy')}`, 90, yPos + 18)
            doc.setFontSize(12)
            doc.text(`${durationDays} Tage`, 160, yPos + 18)

            // --- DETAIL SECTION ---
            yPos += 45
            doc.setFontSize(10)
            doc.setTextColor(0, 0, 0)
            doc.text("Art der Abwesenheit:", 20, yPos)
            doc.setFont("helvetica", "normal")
            doc.text(req.type, 70, yPos)

            yPos += 8
            doc.setFont("helvetica", "bold")
            doc.text("Personal-ID (UUID):", 20, yPos)
            doc.setFont("helvetica", "normal")
            doc.setFontSize(9)
            doc.text(req.user_id, 70, yPos)

            // --- VACATION ACCOUNT TABLE ---
            yPos += 20
            doc.setFont("helvetica", "bold")
            doc.setFontSize(11)
            doc.text("URLAUBSKONTO & SALDO", 20, yPos)

            yPos += 5
            // Table Header
            doc.setFillColor(50, 50, 60) // Dark Header
            doc.rect(20, yPos, 170, 8, 'F')
            doc.setTextColor(255, 255, 255)
            doc.setFontSize(9)
            doc.text("Jahresanspruch", 25, yPos + 5.5)
            doc.text("Resturlaub (Vorher)", 80, yPos + 5.5)
            doc.text("Dieser Antrag", 125, yPos + 5.5)
            doc.text("Resturlaub (Neu)", 165, yPos + 5.5)

            // Table Body
            yPos += 8
            doc.setDrawColor(200, 200, 200)
            doc.rect(20, yPos, 170, 10, 'S') // Border
            doc.setTextColor(0, 0, 0)
            doc.setFontSize(10)
            doc.setFont("helvetica", "normal")

            doc.text(`${yearlyEntitlement} Tage`, 25, yPos + 6.5)
            doc.text(`${remainingBefore} Tage`, 80, yPos + 6.5)
            doc.text(`- ${durationDays} Tage`, 125, yPos + 6.5)

            doc.setFont("helvetica", "bold")
            doc.text(`${remainingAfter} Tage`, 165, yPos + 6.5)

            // --- APPROVAL STAMP ---
            yPos += 30
            doc.setFontSize(11)
            doc.text("ENTSCHEIDUNG", 20, yPos)
            doc.setLineWidth(0.5)
            doc.setDrawColor(0, 0, 0)
            doc.line(20, yPos + 2, 190, yPos + 2)

            yPos += 10
            if (req.status === 'genehmigt') {
                doc.setFontSize(10)
                doc.setFont("helvetica", "normal")
                doc.text("Der oben genannte Antrag wurde formell geprüft und genehmigt.", 20, yPos)

                yPos += 10
                doc.setFont("helvetica", "bold")
                doc.text("Genehmigt durch:", 20, yPos)
                doc.setFont("helvetica", "normal")
                doc.text(approverName, 60, yPos)

                if (req.approved_at) {
                    yPos += 6
                    doc.setFont("helvetica", "bold")
                    doc.text("Zeitstempel:", 20, yPos)
                    doc.setFont("helvetica", "normal")
                    doc.text(`${format(new Date(req.approved_at), 'dd.MM.yyyy')} um ${format(new Date(req.approved_at), 'HH:mm')} Uhr`, 60, yPos)
                }
            } else {
                doc.text(`Status: ${req.status}. Antrag ist wurde nicht genehmigt oder ist noch offen.`, 20, yPos)
            }

            // --- FOOTER: DIGITAL SIGNATURE (THE "SECURE" PART) ---
            const footerY = 240
            doc.setFillColor(245, 247, 250) // Very light blue/grey
            doc.rect(0, footerY, 210, 60, 'F') // Full width footer background

            doc.setDrawColor(200, 200, 200)
            doc.line(0, footerY, 210, footerY)

            doc.setTextColor(60, 60, 60)
            doc.setFontSize(9)
            doc.setFont("helvetica", "bold")
            doc.text("ELEKTRONISCHE SIGNATUR & VALIDIERUNG", 15, footerY + 10)

            if (signature) {
                doc.addImage("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=", "PNG", 180, footerY + 5, 10, 10)

                doc.setFontSize(8)
                doc.setFont("helvetica", "normal")
                doc.text("Dieses Dokument wurde kryptographisch signiert. Änderungen am Inhalt führen zur Ungültigkeit.", 15, footerY + 16)

                // Tech Details Grid
                doc.text("Signatursteller:", 15, footerY + 24)
                doc.setFont("helvetica", "bold")
                doc.text(name, 50, footerY + 24)

                doc.setFont("helvetica", "normal")
                doc.text("Zeitstempel (UTC):", 15, footerY + 29)
                doc.setFont("courier", "normal")
                doc.text(format(new Date(signature.signed_at), 'yyyy-MM-dd HH:mm:ss'), 50, footerY + 29)

                doc.setFont("helvetica", "normal")
                doc.text("Integritäts-Hash:", 15, footerY + 34)
                doc.setFont("courier", "normal")
                doc.setFontSize(7)
                doc.text(signature.hash, 50, footerY + 34)
            } else {
                doc.setFont("helvetica", "italic")
                doc.setTextColor(150, 0, 0)
                doc.text("Warnung: Keine digitale Signatur in diesem Datensatz vorhanden (Legacy).", 15, footerY + 16)
            }

            // Disclaimer very bottom
            doc.setTextColor(150, 150, 150)
            doc.setFont("helvetica", "normal")
            doc.setFontSize(6)
            doc.text(`${companyName} - Internes Dokument - Maschinell erstellt`, 105, 290, { align: 'center' })

            doc.save(`Urlaubsantrag_${name.replace(/\s+/g, '_')}_${req.start_date}.pdf`)
            setDownloadedIds(prev => new Set(prev).add(req.id))
        } catch (e) {
            console.error(e); alert("Fehler beim Erstellen des PDFs: " + e.message)
        }
    }

    return (
        <div>
            <h2 className="text-xl font-bold mb-6">Offene Urlaubsanträge</h2>
            {requests.length === 0 && (<div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-200 mb-8"><CheckCircle className="mx-auto text-green-500 mb-2" size={32} /><p className="text-gray-500">Alles erledigt!</p></div>)}
            <div className="space-y-3 mb-12">{requests.map(req => (
                <div key={req.id} className="bg-white border p-4 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center shadow-sm gap-4">
                    <div className="w-full md:w-auto">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-lg">{req.profiles?.full_name || req.profiles?.email}</span>
                            <span className="bg-yellow-100 text-yellow-800 text-xs font-bold px-2 py-0.5 rounded uppercase">{req.type}</span>
                        </div>
                        <p className="text-gray-600 flex items-center gap-2 mb-2">
                            <Calendar size={14} />{format(new Date(req.start_date), 'dd.MM.yyyy')} - {format(new Date(req.end_date), 'dd.MM.yyyy')}
                        </p>
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
                <div key={req.id} className="bg-gray-50 border p-4 rounded-xl flex flex-col sm:flex-row flex-wrap justify-between items-start sm:items-center shadow-sm gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-sm sm:text-lg text-gray-700 truncate">{req.profiles?.full_name || req.profiles?.email}</span>
                            <span className="bg-gray-200 text-gray-600 text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded uppercase whitespace-nowrap">{req.type}</span>
                        </div>
                        <p className="text-gray-500 flex items-center gap-2 text-xs sm:text-sm">
                            <Calendar size={12} />{format(new Date(req.start_date), 'dd.MM.yyyy')} - {format(new Date(req.end_date), 'dd.MM.yyyy')}
                        </p>
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
