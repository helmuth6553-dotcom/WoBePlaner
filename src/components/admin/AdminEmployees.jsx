import { useState, useEffect } from 'react'
import { Users, CheckCircle, XCircle, Plus, Mail, Trash2, Link as LinkIcon, Shield } from 'lucide-react'
import { format } from 'date-fns'
import { supabase } from '../../supabase'
import { logAdminAction, fetchBeforeState } from '../../utils/adminAudit'

/**
 * =========================================================================
 * AdminEmployees
 * Manages user accounts and invitations.
 * Allows Admins to:
 * - Generate invite links (stubbed email sending)
 * - Edit user profiles (weekly hours, vacation entitlement)
 * =========================================================================
 */
export default function AdminEmployees() {
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
        email: '',
        full_name: '',
        weekly_hours: 40,
        start_date: format(new Date(), 'yyyy-MM-dd'),
        vacation_days_per_year: 25,
        role: 'user',
        initial_balance: 0
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

        } catch {
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
            const { data: _sessionData } = await supabase.auth.getSession()

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

            // Audit Log: Mitarbeiter erstellt
            await logAdminAction(
                'employee_created',
                response.data?.user_id || null,
                'profile',
                response.data?.user_id || null,
                {
                    after: {
                        email: formData.email,
                        full_name: formData.full_name,
                        weekly_hours: parseFloat(formData.weekly_hours) || 40,
                        start_date: formData.start_date,
                        vacation_days_per_year: parseFloat(formData.vacation_days_per_year) || 25,
                        role: formData.role,
                        initial_balance: parseFloat(formData.initial_balance) || 0
                    }
                }
            )

            setShowInviteModal(false)
            setFormData({
                email: '',
                full_name: '',
                weekly_hours: 40,
                start_date: format(new Date(), 'yyyy-MM-dd'),
                vacation_days_per_year: 25,
                role: 'user',
                initial_balance: 0
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
        const before = await fetchBeforeState('profiles', editingUser.id,
            'full_name, weekly_hours, start_date, vacation_days_per_year, role, initial_balance')

        const updatePayload = {
            full_name: formData.full_name,
            weekly_hours: formData.weekly_hours,
            start_date: formData.start_date,
            vacation_days_per_year: formData.vacation_days_per_year,
            role: formData.role,
            initial_balance: formData.initial_balance
        }

        const { error } = await supabase.from('profiles').update(updatePayload).eq('id', editingUser.id)

        if (error) {
            alert(error.message)
        } else {
            await logAdminAction(
                'employee_updated',
                editingUser.id,
                'profile',
                editingUser.id,
                { before, after: updatePayload }
            )
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
            const { data: { user: _user } } = await supabase.auth.getUser()
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
            email: user.email,
            full_name: user.full_name || '',
            weekly_hours: user.weekly_hours || 40,
            start_date: user.start_date || format(new Date(), 'yyyy-MM-dd'),
            vacation_days_per_year: user.vacation_days_per_year || 25,
            role: user.role || 'user',
            initial_balance: user.initial_balance || 0
        })
    }

    const admins = users.filter(u => u.role === 'admin')
    const viewers = users.filter(u => u.role === 'viewer')
    const employees = users.filter(u => u.role !== 'admin' && u.role !== 'viewer')

    const UserCard = ({ user, isInactive = false }) => (
        <div
            onClick={() => !isInactive && openEdit(user)}
            className={`flex flex-col items-center bg-white p-4 rounded-[1.5rem] border border-gray-100/80 shadow-[0_2px_10px_rgb(0,0,0,0.04)] cursor-pointer hover:shadow-[0_4px_20px_rgb(0,0,0,0.06)] transition-all active:scale-95 ${isInactive ? 'opacity-50 grayscale' : ''}`}
        >
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-3 overflow-hidden border-2 border-white shadow-sm text-gray-400">
                <Users size={32} />
            </div>
            <span className="font-bold text-center text-gray-900 leading-tight text-sm line-clamp-2">
                {user.full_name || 'Unbenannt'}
            </span>
            <span className="text-[10px] text-gray-400 mt-1 truncate max-w-full px-2">
                {user.email}
            </span>
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
                <button
                    onClick={() => { setShowInviteModal(true); setEditingUser(null); }}
                    className="bg-teal-500 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-teal-600 transition-colors shadow-sm"
                >
                    <Plus size={16} /> Neu
                </button>
            </div>

            {/* Administratoren */}
            {admins.length > 0 && (
                <div className="mb-8">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 px-2">
                        Administratoren
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 px-2">
                        {admins.map(u => <UserCard key={u.id} user={u} />)}
                    </div>
                </div>
            )}

            {/* Mitarbeiter */}
            <div className="mb-8">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 px-2">
                    Mitarbeiter
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 px-2">
                    {employees.map(u => <UserCard key={u.id} user={u} />)}
                </div>
            </div>

            {/* Zuschauer */}
            {viewers.length > 0 && (
                <div className="mb-8">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 px-2">
                        Zuschauer
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 px-2">
                        {viewers.map(u => <UserCard key={u.id} user={u} />)}
                    </div>
                </div>
            )}

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

            {/* Ausstehende Einladungen */}
            {invites.length > 0 && (
                <div className="mb-8">
                    <div className="flex items-center gap-2 mb-3 px-2 text-xs font-bold text-yellow-600 uppercase tracking-wider">
                        <Mail size={14} /> Ausstehende Einladungen ({invites.length})
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 px-2">
                        {invites.map(i => (
                            <div key={i.email} className="bg-yellow-50/50 border border-yellow-100/80 rounded-[1.5rem] p-4 shadow-[0_2px_10px_rgb(0,0,0,0.04)]">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <div className="font-bold text-gray-900 truncate text-sm">{i.email}</div>
                                        <div className="text-[10px] text-yellow-700 mt-1">{i.full_name}</div>
                                    </div>
                                    <span className="bg-white/50 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase text-yellow-800 border border-yellow-100">
                                        {i.role}
                                    </span>
                                </div>
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(`${window.location.origin}?login=true`)
                                        alert('Link in die Zwischenablage kopiert!')
                                    }}
                                    className="w-full mt-2 text-yellow-800 hover:text-yellow-900 font-bold text-[10px] bg-white border border-yellow-200 hover:bg-yellow-100 px-2 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"
                                >
                                    <LinkIcon size={12} /> Link kopieren
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Edit Modal - mit Deaktivieren Button */}
            {(showInviteModal || editingUser) && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                        <h3 className="text-xl font-bold mb-4">
                            {editingUser ? 'Mitarbeiter bearbeiten' : 'Neuen Mitarbeiter anlegen'}
                        </h3>

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

                            <div>
                                <label className="block text-sm font-bold mb-1">Name</label>
                                <input
                                    type="text"
                                    value={formData.full_name}
                                    onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                                    className="w-full border p-2 rounded-lg"
                                    disabled={isCreatingUser}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold mb-1">Wochenstunden</label>
                                    <input
                                        type="number"
                                        value={formData.weekly_hours}
                                        onChange={e => setFormData({ ...formData, weekly_hours: e.target.value })}
                                        className="w-full border p-2 rounded-lg"
                                        disabled={isCreatingUser}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold mb-1">Urlaubstage</label>
                                    <input
                                        type="number"
                                        value={formData.vacation_days_per_year}
                                        onChange={e => setFormData({ ...formData, vacation_days_per_year: e.target.value })}
                                        className="w-full border p-2 rounded-lg"
                                        disabled={isCreatingUser}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold mb-1">Eintritt</label>
                                <input
                                    type="date"
                                    value={formData.start_date}
                                    onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                                    className="w-full border p-2 rounded-lg"
                                    disabled={isCreatingUser}
                                />
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

                            <div>
                                <label className="block text-sm font-bold mb-1">Rolle</label>
                                <select
                                    value={formData.role}
                                    onChange={e => setFormData({ ...formData, role: e.target.value })}
                                    className="w-full border p-2 rounded-lg bg-white"
                                    disabled={isCreatingUser}
                                >
                                    <option value="user">Mitarbeiter</option>
                                    <option value="admin">Administrator</option>
                                    <option value="viewer">Zuschauer</option>
                                </select>
                            </div>
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
                                className="flex-1 py-3 rounded-xl bg-teal-500 text-white font-bold hover:bg-teal-600 disabled:opacity-50 flex items-center justify-center gap-2"
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
                                    className="flex-1 py-3 rounded-xl bg-teal-500 text-white font-bold hover:bg-teal-600"
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
