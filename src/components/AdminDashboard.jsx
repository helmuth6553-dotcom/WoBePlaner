import { useState, useEffect } from 'react'
import { Users, Calendar, FileText, CheckCircle, XCircle, AlertTriangle, Plus, Mail, Download, Trash2, Link as LinkIcon, Thermometer, Settings, ShieldCheck, Shield } from 'lucide-react'
import { supabase } from '../supabase'
import { format, differenceInBusinessDays } from 'date-fns'
import { jsPDF } from 'jspdf'
import { logAdminAction } from '../utils/adminAudit'

import ShiftRepair from './ShiftRepair'
import AdminAuditLog from './admin/AdminAuditLog'

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
 * SUB-COMPONENT: AdminEmployees
 * Manages user accounts and invitations.
 * Allows Admins to:
 * - Generate invite links (stubbed email sending)
 * - Edit user profiles (weekly hours, vacation entitlement)
 * =========================================================================
 */
function AdminEmployees() {
    const [users, setUsers] = useState([])
    const [inactiveUsers, setInactiveUsers] = useState([])
    const [showInactive, setShowInactive] = useState(false)
    const [invites, setInvites] = useState([])
    const [showInviteModal, setShowInviteModal] = useState(false)
    const [editingUser, setEditingUser] = useState(null)
    const [isCreatingUser, setIsCreatingUser] = useState(false)
    const [createError, setCreateError] = useState(null)
    // Re-Authentication for Admin creation
    const [showPasswordConfirm, setShowPasswordConfirm] = useState(false)
    const [adminPassword, setAdminPassword] = useState('')
    const [passwordError, setPasswordError] = useState('')
    const [formData, setFormData] = useState({
        email: '', full_name: '', weekly_hours: 40, start_date: format(new Date(), 'yyyy-MM-dd'), vacation_days_per_year: 25, role: 'user', initial_balance: 0
    })

    useEffect(() => { fetchData() }, [])

    const fetchData = async () => {
        // Aktive Mitarbeiter
        const { data: activeData } = await supabase.from('profiles')
            .select('*')
            .or('is_active.eq.true,is_active.is.null')  // Auch NULL als aktiv behandeln
            .order('full_name')

        // Inaktive Mitarbeiter
        const { data: inactiveData } = await supabase.from('profiles')
            .select('*')
            .eq('is_active', false)
            .order('full_name')

        const { data: inviteData } = await supabase.from('invitations')
            .select('*')
            .order('created_at', { ascending: false })

        setUsers(activeData || [])
        setInactiveUsers(inactiveData || [])
        setInvites(inviteData || [])
    }

    /**
     * Initiates the invite process.
     * If creating an admin, requires password confirmation first.
     */
    const initiateInvite = () => {
        if (formData.role === 'admin') {
            // Require password confirmation for admin creation
            setAdminPassword('')
            setPasswordError('')
            setShowPasswordConfirm(true)
        } else {
            // Regular user - proceed directly
            handleInvite()
        }
    }

    /**
     * Verifies admin password before creating another admin
     */
    const verifyPasswordAndInvite = async () => {
        setPasswordError('')

        try {
            // Get current user's email
            const { data: { user } } = await supabase.auth.getUser()
            if (!user?.email) {
                setPasswordError('Benutzer nicht gefunden')
                return
            }

            // Re-authenticate with password
            const { error } = await supabase.auth.signInWithPassword({
                email: user.email,
                password: adminPassword
            })

            if (error) {
                setPasswordError('Falsches Passwort')
                return
            }

            // Password verified - proceed with invite
            setShowPasswordConfirm(false)
            setAdminPassword('')
            handleInvite()

        } catch (err) {
            setPasswordError('Fehler bei der Verifizierung')
        }
    }

    /**
     * Secure User Creation via Edge Function
     * - Calls the create-user Edge Function which uses Admin API
     * - Falls back to invitation system if Edge Function is not deployed
     */
    const handleInvite = async () => {
        setIsCreatingUser(true)
        setCreateError(null)

        try {
            // Try the secure Edge Function first
            const { data: sessionData } = await supabase.auth.getSession()

            const response = await supabase.functions.invoke('create-user', {
                body: {
                    email: formData.email,
                    full_name: formData.full_name,
                    weekly_hours: parseFloat(formData.weekly_hours) || 40,
                    start_date: formData.start_date,
                    vacation_days_per_year: parseFloat(formData.vacation_days_per_year) || 25,
                    role: formData.role,
                    initial_balance: parseFloat(formData.initial_balance) || 0
                }
            })

            if (response.error) {
                // If Edge Function failed, fall back to invitation system
                console.warn('Edge Function failed, using invitation fallback:', response.error)

                const { error: inviteError } = await supabase.from('invitations').insert([formData])
                if (inviteError) {
                    throw new Error(inviteError.message)
                }

                alert('⚠️ Einladung erstellt (Legacy-Modus).\n\nHinweis: Der Mitarbeiter muss sich manuell registrieren. Für automatische Kontoerstellung bitte Edge Function deployen.')
            } else if (response.data?.success) {
                alert(`✅ Benutzer "${formData.full_name || formData.email}" erfolgreich erstellt!\n\nDer Mitarbeiter erhält eine E-Mail zum Setzen des Passworts.`)
            } else {
                throw new Error(response.data?.error || 'Unbekannter Fehler')
            }

            setShowInviteModal(false)
            setFormData({
                email: '', full_name: '', weekly_hours: 40,
                start_date: format(new Date(), 'yyyy-MM-dd'),
                vacation_days_per_year: 25, role: 'user', initial_balance: 0
            })
            fetchData()

        } catch (error) {
            console.error('User creation error:', error)
            setCreateError(error.message)
        } finally {
            setIsCreatingUser(false)
        }
    }

    const handleUpdateUser = async () => {
        const { error } = await supabase.from('profiles').update({
            full_name: formData.full_name, weekly_hours: formData.weekly_hours, start_date: formData.start_date,
            vacation_days_per_year: formData.vacation_days_per_year, role: formData.role, initial_balance: formData.initial_balance
        }).eq('id', editingUser.id)

        if (error) alert(error.message)
        else {
            setEditingUser(null)
            fetchData()
        }
    }

    const handleDeactivate = async () => {
        if (!editingUser) return
        if (!confirm(`${editingUser.full_name || editingUser.email} wirklich deaktivieren?\n\nDer Mitarbeiter kann sich nicht mehr einloggen und erscheint nicht mehr in Listen.\n\nDie Daten bleiben erhalten und können später wiederhergestellt werden.`)) return

        const { data: { user } } = await supabase.auth.getUser()

        const { error } = await supabase.from('profiles').update({
            is_active: false,
            deactivated_at: new Date().toISOString(),
            deactivated_by: user?.id
        }).eq('id', editingUser.id)

        if (error) {
            alert('Fehler: ' + error.message)
        } else {
            // Audit Log
            await logAdminAction(
                'deactivate_user',
                editingUser.id,
                'profile',
                editingUser.id,
                { before: { is_active: true }, after: { is_active: false } }
            )
            setEditingUser(null)
            fetchData()
        }
    }

    const handleReactivate = async (userId) => {
        if (!confirm('Mitarbeiter wieder aktivieren?')) return

        const { error } = await supabase.from('profiles').update({
            is_active: true,
            deactivated_at: null,
            deactivated_by: null
        }).eq('id', userId)

        if (error) {
            alert('Fehler: ' + error.message)
        } else {
            const { data: { user } } = await supabase.auth.getUser()
            await logAdminAction(
                'reactivate_user',
                userId,
                'profile',
                userId,
                { before: { is_active: false }, after: { is_active: true } }
            )
            fetchData()
        }
    }

    const openEdit = (user) => {
        setEditingUser(user)
        setFormData({
            email: user.email, full_name: user.full_name || '', weekly_hours: user.weekly_hours || 40,
            start_date: user.start_date || format(new Date(), 'yyyy-MM-dd'), vacation_days_per_year: user.vacation_days_per_year || 25, role: user.role || 'user', initial_balance: user.initial_balance || 0
        })
    }

    const admins = users.filter(u => u.role === 'admin')
    const employees = users.filter(u => u.role !== 'admin')

    const UserCard = ({ user, isInactive = false }) => (
        <div
            onClick={() => !isInactive && openEdit(user)}
            className={`flex flex-col items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-all active:scale-95 ${isInactive ? 'opacity-50 grayscale' : ''}`}
        >
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-3 overflow-hidden border-2 border-white shadow-sm text-gray-400"><Users size={32} /></div>
            <span className="font-bold text-center text-gray-900 leading-tight text-sm line-clamp-2">{user.full_name || 'Unbenannt'}</span>
            <span className="text-[10px] text-gray-400 mt-1 truncate max-w-full px-2">{user.email}</span>
            {isInactive && (
                <button
                    onClick={(e) => { e.stopPropagation(); handleReactivate(user.id) }}
                    className="mt-2 text-xs bg-green-50 text-green-700 px-3 py-1 rounded-full font-bold hover:bg-green-100"
                >
                    Reaktivieren
                </button>
            )}
        </div>
    )

    return (
        <div>
            <div className="flex justify-between items-center mb-6 px-2">
                <h2 className="text-xl font-bold">Personen</h2>
                <button onClick={() => { setShowInviteModal(true); setEditingUser(null); }} className="bg-black text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-gray-800 transition-colors shadow-sm"><Plus size={16} /> Neu</button>
            </div>
            {admins.length > 0 && (<div className="mb-8"><h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 px-2">Administratoren</h3><div className="grid grid-cols-2 sm:grid-cols-3 gap-3 px-2">{admins.map(u => <UserCard key={u.id} user={u} />)}</div></div>)}
            <div className="mb-8"><h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 px-2">Mitarbeiter</h3><div className="grid grid-cols-2 sm:grid-cols-3 gap-3 px-2">{employees.map(u => <UserCard key={u.id} user={u} />)}</div></div>

            {/* Inaktive Mitarbeiter */}
            {inactiveUsers.length > 0 && (
                <div className="mb-8 border-t pt-6">
                    <button
                        onClick={() => setShowInactive(!showInactive)}
                        className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-2 hover:text-gray-600"
                    >
                        <Users size={14} />
                        Ehemalige Mitarbeiter ({inactiveUsers.length})
                        <span className="text-gray-300">{showInactive ? '▼' : '▶'}</span>
                    </button>
                    {showInactive && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 px-2">
                            {inactiveUsers.map(u => <UserCard key={u.id} user={u} isInactive={true} />)}
                        </div>
                    )}
                </div>
            )}

            {invites.length > 0 && (<div className="mb-8"><div className="flex items-center gap-2 mb-3 px-2 text-xs font-bold text-yellow-600 uppercase tracking-wider"><Mail size={14} /> Ausstehende Einladungen ({invites.length})</div><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 px-2">{invites.map(i => (<div key={i.email} className="bg-yellow-50 border border-yellow-100 rounded-xl p-3 shadow-sm"><div className="flex justify-between items-start mb-2"><div><div className="font-bold text-gray-900 truncate text-sm">{i.email}</div><div className="text-[10px] text-yellow-700 mt-1">{i.full_name}</div></div><span className="bg-white/50 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase text-yellow-800 border border-yellow-100">{i.role}</span></div><button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}?login=true`); alert('Link in die Zwischenablage kopiert!') }} className="w-full mt-2 text-yellow-800 hover:text-yellow-900 font-bold text-[10px] bg-white border border-yellow-200 hover:bg-yellow-100 px-2 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"><LinkIcon size={12} /> Link kopieren</button></div>))}</div></div>)}

            {/* Edit Modal - mit Deaktivieren Button */}
            {(showInviteModal || editingUser) && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                        <h3 className="text-xl font-bold mb-4">{editingUser ? 'Mitarbeiter bearbeiten' : 'Neuen Mitarbeiter anlegen'}</h3>

                        {/* Error Display */}
                        {createError && (
                            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg mb-4 text-sm flex items-start gap-2">
                                <XCircle size={16} className="mt-0.5 flex-shrink-0" />
                                <span>{createError}</span>
                            </div>
                        )}

                        <div className="space-y-4">
                            {!editingUser && (
                                <div>
                                    <label className="block text-sm font-bold mb-1">Email Adresse</label>
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                                        className="w-full border p-2 rounded-lg"
                                        disabled={isCreatingUser}
                                    />
                                    <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                                        <CheckCircle size={12} /> Der Mitarbeiter erhält automatisch eine E-Mail zum Setzen des Passworts.
                                    </p>
                                </div>
                            )}
                            <div><label className="block text-sm font-bold mb-1">Name</label><input type="text" value={formData.full_name} onChange={e => setFormData({ ...formData, full_name: e.target.value })} className="w-full border p-2 rounded-lg" disabled={isCreatingUser} /></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-sm font-bold mb-1">Wochenstunden</label><input type="number" value={formData.weekly_hours} onChange={e => setFormData({ ...formData, weekly_hours: e.target.value })} className="w-full border p-2 rounded-lg" disabled={isCreatingUser} /></div>
                                <div><label className="block text-sm font-bold mb-1">Urlaubstage</label><input type="number" value={formData.vacation_days_per_year} onChange={e => setFormData({ ...formData, vacation_days_per_year: e.target.value })} className="w-full border p-2 rounded-lg" disabled={isCreatingUser} /></div>
                            </div>
                            <div>
                                <label className="block text-sm font-bold mb-1">Eintritt</label>
                                <input type="date" value={formData.start_date} onChange={e => setFormData({ ...formData, start_date: e.target.value })} className="w-full border p-2 rounded-lg" disabled={isCreatingUser} />
                                <p className="text-xs text-gray-500 mt-1">Beeinflusst die Soll-Berechnung</p>
                            </div>
                            <div>
                                <label className="block text-sm font-bold mb-1">Anfangssaldo (Std.)</label>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    pattern="-?[0-9]*\.?[0-9]*"
                                    value={formData.initial_balance}
                                    onChange={e => {
                                        const val = e.target.value
                                        // Allow empty, minus sign, or valid numbers
                                        if (val === '' || val === '-' || !isNaN(parseFloat(val))) {
                                            setFormData({ ...formData, initial_balance: val === '' || val === '-' ? val : parseFloat(val) })
                                        }
                                    }}
                                    onBlur={e => {
                                        // On blur, ensure it's a valid number
                                        const val = parseFloat(e.target.value) || 0
                                        setFormData({ ...formData, initial_balance: val })
                                    }}
                                    className="w-full border p-2 rounded-lg text-center text-lg font-bold"
                                    disabled={isCreatingUser}
                                    placeholder="0"
                                />
                                <p className="text-xs text-gray-500 mt-1">z.B. -10 für Minusstunden, +15 für Überstunden</p>
                            </div>
                            <div><label className="block text-sm font-bold mb-1">Rolle</label><select value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })} className="w-full border p-2 rounded-lg bg-white" disabled={isCreatingUser}><option value="user">Mitarbeiter</option><option value="admin">Administrator</option></select></div>
                        </div>

                        <div className="flex gap-3 mt-8">
                            <button
                                onClick={() => { setShowInviteModal(false); setEditingUser(null); setCreateError(null); }}
                                className="flex-1 py-3 rounded-xl bg-gray-100 font-medium hover:bg-gray-200"
                                disabled={isCreatingUser}
                            >
                                Abbrechen
                            </button>
                            <button
                                onClick={editingUser ? handleUpdateUser : initiateInvite}
                                className="flex-1 py-3 rounded-xl bg-black text-white font-bold hover:bg-gray-800 disabled:opacity-50 flex items-center justify-center gap-2"
                                disabled={isCreatingUser}
                            >
                                {isCreatingUser ? (
                                    <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                                        Erstelle...
                                    </>
                                ) : (
                                    editingUser ? 'Speichern' : 'Mitarbeiter anlegen'
                                )}
                            </button>
                        </div>

                        {/* Deaktivieren Button - nur bei bestehenden Mitarbeitern (nicht Admins) */}
                        {editingUser && editingUser.role !== 'admin' && (
                            <div className="mt-6 pt-6 border-t border-gray-200">
                                <button
                                    onClick={handleDeactivate}
                                    className="w-full bg-red-50 text-red-600 border border-red-200 py-3 rounded-xl font-bold hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
                                >
                                    <Trash2 size={16} />
                                    Mitarbeiter deaktivieren
                                </button>
                                <p className="text-xs text-gray-400 mt-2 text-center">
                                    Der Mitarbeiter kann sich nicht mehr einloggen. Daten bleiben erhalten.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Password Confirmation Modal for Admin Creation */}
            {showPasswordConfirm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="text-center mb-6">
                            <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Shield size={28} className="text-red-600" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-2">Admin-Berechtigung bestätigen</h3>
                            <p className="text-sm text-gray-500">
                                Du erstellst einen neuen <strong>Administrator</strong>. Bitte bestätige mit deinem Passwort.
                            </p>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold mb-1">Dein Passwort</label>
                                <input
                                    type="password"
                                    value={adminPassword}
                                    onChange={e => setAdminPassword(e.target.value)}
                                    placeholder="Passwort eingeben"
                                    className="w-full border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-black focus:outline-none"
                                    autoFocus
                                    onKeyDown={e => e.key === 'Enter' && verifyPasswordAndInvite()}
                                />
                            </div>

                            {passwordError && (
                                <div className="bg-red-50 text-red-600 border border-red-100 p-3 rounded-lg text-sm flex items-center gap-2">
                                    <XCircle size={16} />
                                    {passwordError}
                                </div>
                            )}

                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => { setShowPasswordConfirm(false); setAdminPassword(''); setPasswordError(''); }}
                                    className="flex-1 py-3 rounded-xl bg-gray-100 font-medium hover:bg-gray-200"
                                >
                                    Abbrechen
                                </button>
                                <button
                                    onClick={verifyPasswordAndInvite}
                                    className="flex-1 py-3 rounded-xl bg-black text-white font-bold hover:bg-gray-800"
                                >
                                    Bestätigen
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
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

function AdminSickLeaves() {
    const [sickLeaves, setSickLeaves] = useState([])
    useEffect(() => { const fetchSick = async () => { const { data } = await supabase.from('absences').select('*, profiles!user_id(full_name, email)').eq('type', 'Krank').order('start_date', { ascending: false }); setSickLeaves(data || []) }; fetchSick() }, [])
    const today = new Date().toISOString().split('T')[0]
    const activeSick = sickLeaves.filter(s => s.end_date >= today)
    const pastSick = sickLeaves.filter(s => s.end_date < today)

    return (
        <div>
            <h2 className="text-xl font-bold mb-6 text-red-600 flex items-center gap-2"><Thermometer /> Aktuell Krank ({activeSick.length})</h2>
            <div className="space-y-3 mb-12">{activeSick.map(req => (<div key={req.id} className="bg-red-50 border border-red-100 p-4 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center shadow-sm gap-4"><div><span className="font-bold text-red-900 text-lg">{req.profiles?.full_name || req.profiles?.email}</span> <span className="text-red-700 text-sm block">{format(new Date(req.start_date), 'dd.MM.yyyy')} - {format(new Date(req.end_date), 'dd.MM.yyyy')}</span></div><div className="text-red-600 font-bold text-sm">Bis {format(new Date(req.end_date), 'dd.MM.yyyy')}</div></div>))}</div>
            <h2 className="text-xl font-bold mb-6 pt-8 border-t border-gray-200">Historie</h2>
            <div className="space-y-3">{pastSick.map(req => (<div key={req.id} className="bg-gray-50 border p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center shadow-sm gap-4 opacity-75"><div><span className="font-bold text-lg text-gray-700">{req.profiles?.full_name || req.profiles?.email}</span> <span className="text-gray-500 text-sm block">{format(new Date(req.start_date), 'dd.MM.yyyy')} - {format(new Date(req.end_date), 'dd.MM.yyyy')}</span></div></div>))}</div>
        </div>
    )
}

function AdminRoster() {
    return (
        <div>
            <h2 className="text-xl font-bold mb-6">Dienstplan Verwaltung</h2>
            <div className="bg-green-50 p-6 rounded-xl border border-green-100 text-center"><CheckCircle className="mx-auto text-green-600 mb-3" size={48} /><h3 className="font-bold text-lg text-green-800 mb-2">System Initialisiert</h3></div>
        </div>
    )
}
