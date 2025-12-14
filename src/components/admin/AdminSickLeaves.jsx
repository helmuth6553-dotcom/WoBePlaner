import { useState, useEffect } from 'react'
import { Thermometer } from 'lucide-react'
import { format } from 'date-fns'
import { supabase } from '../../supabase'

/**
 * =========================================================================
 * AdminSickLeaves
 * Displays current and historical sick leave records.
 * =========================================================================
 */
export default function AdminSickLeaves() {
    const [sickLeaves, setSickLeaves] = useState([])

    useEffect(() => {
        const fetchSick = async () => {
            const { data } = await supabase
                .from('absences')
                .select('*, profiles!user_id(full_name, email)')
                .eq('type', 'Krank')
                .order('start_date', { ascending: false })
            setSickLeaves(data || [])
        }
        fetchSick()
    }, [])

    const today = new Date().toISOString().split('T')[0]
    const activeSick = sickLeaves.filter(s => s.end_date >= today)
    const pastSick = sickLeaves.filter(s => s.end_date < today)

    return (
        <div>
            <h2 className="text-xl font-bold mb-6 text-red-600 flex items-center gap-2">
                <Thermometer /> Aktuell Krank ({activeSick.length})
            </h2>

            <div className="space-y-3 mb-12">
                {activeSick.map(req => (
                    <div key={req.id} className="bg-red-50 border border-red-100 p-4 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center shadow-sm gap-4">
                        <div>
                            <span className="font-bold text-red-900 text-lg">
                                {req.profiles?.full_name || req.profiles?.email}
                            </span>
                            <span className="text-red-700 text-sm block">
                                {format(new Date(req.start_date), 'dd.MM.yyyy')} - {format(new Date(req.end_date), 'dd.MM.yyyy')}
                            </span>
                        </div>
                        <div className="text-red-600 font-bold text-sm">
                            Bis {format(new Date(req.end_date), 'dd.MM.yyyy')}
                        </div>
                    </div>
                ))}
            </div>

            <h2 className="text-xl font-bold mb-6 pt-8 border-t border-gray-200">Historie</h2>

            <div className="space-y-3">
                {pastSick.map(req => (
                    <div key={req.id} className="bg-gray-50 border p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center shadow-sm gap-4 opacity-75">
                        <div>
                            <span className="font-bold text-lg text-gray-700">
                                {req.profiles?.full_name || req.profiles?.email}
                            </span>
                            <span className="text-gray-500 text-sm block">
                                {format(new Date(req.start_date), 'dd.MM.yyyy')} - {format(new Date(req.end_date), 'dd.MM.yyyy')}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
