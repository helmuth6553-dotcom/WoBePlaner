import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { X, Edit2, Check } from 'lucide-react'

export default function EmployeeManager({ isOpen, onClose, onUpdate }) {
    const [profiles, setProfiles] = useState([])
    const [editingId, setEditingId] = useState(null)
    const [editForm, setEditForm] = useState({})

    useEffect(() => {
        const fetchProfiles = async () => {
            const { data } = await supabase.from('profiles').select('*').or('is_active.eq.true,is_active.is.null').order('full_name')
            setProfiles(data || [])
        }
        if (isOpen) fetchProfiles()
    }, [isOpen])

    // Refetch function for use after saves
    const refetchProfiles = async () => {
        const { data } = await supabase.from('profiles').select('*').or('is_active.eq.true,is_active.is.null').order('full_name')
        setProfiles(data || [])
    }

    const startEdit = (profile) => {
        setEditingId(profile.id)
        setEditForm({
            weekly_hours: profile.weekly_hours || 40,
            vacation_days_per_year: profile.vacation_days_per_year || 25
        })
    }

    const saveEdit = async () => {
        if (!confirm('Änderungen speichern? Dies wirkt sich auf alle Berechnungen aus.')) return

        const { error } = await supabase.from('profiles').update({
            weekly_hours: parseFloat(editForm.weekly_hours),
            vacation_days_per_year: parseInt(editForm.vacation_days_per_year)
        }).eq('id', editingId)

        if (error) alert(error.message)
        else {
            setEditingId(null)
            refetchProfiles()
            if (onUpdate) onUpdate()
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                    <h2 className="text-xl font-bold flex items-center gap-2">Mitarbeiter Verwaltung</h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors"><X size={20} /></button>
                </div>
                <div className="overflow-y-auto p-4">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="text-xs font-bold text-gray-500 uppercase border-b bg-gray-50/50">
                                <th className="p-3">Name</th>
                                <th className="p-3">Wochenstunden (Soll)</th>
                                <th className="p-3">Urlaubsanspruch</th>
                                <th className="p-3 text-right">Aktion</th>
                            </tr>
                        </thead>
                        <tbody>
                            {profiles.map(p => (
                                <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                                    <td className="p-3 font-medium text-sm">{p.full_name || p.email}</td>
                                    <td className="p-3">
                                        {editingId === p.id ? (
                                            <div className="flex items-center gap-1">
                                                <input
                                                    type="number"
                                                    value={editForm.weekly_hours}
                                                    onChange={e => setEditForm({ ...editForm, weekly_hours: e.target.value })}
                                                    className="border rounded p-1 w-20 text-sm focus:ring-2 focus:ring-black outline-none"
                                                />
                                                <span className="text-xs text-gray-500">h</span>
                                            </div>
                                        ) : (
                                            <span className="text-sm">{p.weekly_hours || 40} h</span>
                                        )}
                                    </td>
                                    <td className="p-3">
                                        {editingId === p.id ? (
                                            <div className="flex items-center gap-1">
                                                <input
                                                    type="number"
                                                    value={editForm.vacation_days_per_year}
                                                    onChange={e => setEditForm({ ...editForm, vacation_days_per_year: e.target.value })}
                                                    className="border rounded p-1 w-20 text-sm focus:ring-2 focus:ring-black outline-none"
                                                />
                                                <span className="text-xs text-gray-500">Tage</span>
                                            </div>
                                        ) : (
                                            <span className="text-sm">{p.vacation_days_per_year || 25} Tage</span>
                                        )}
                                    </td>
                                    <td className="p-3 text-right">
                                        {editingId === p.id ? (
                                            <button onClick={saveEdit} className="p-2 bg-black text-white rounded-lg hover:bg-gray-800 shadow-sm transition-all"><Check size={16} /></button>
                                        ) : (
                                            <button onClick={() => startEdit(p)} className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-all"><Edit2 size={16} /></button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
