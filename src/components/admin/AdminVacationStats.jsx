import { useState, useEffect } from 'react'
import { supabase } from '../../supabase'
import { Palmtree, Calendar, TrendingDown, Check } from 'lucide-react'
import { getYear, isWeekend } from 'date-fns'

export default function AdminVacationStats() {
    const [employees, setEmployees] = useState([])
    const [loading, setLoading] = useState(true)
    const [selectedYear, setSelectedYear] = useState(getYear(new Date()))

    useEffect(() => {
        fetchData()
    }, [selectedYear])

    const fetchData = async () => {
        setLoading(true)

        // Get all active employees (non-admin)
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name, display_name, email, vacation_days_per_year, start_date')
            .or('is_active.eq.true,is_active.is.null')
            .neq('role', 'admin')
            .order('full_name')

        if (!profiles) {
            setLoading(false)
            return
        }

        // Get all approved vacation absences for the selected year
        const yearStart = `${selectedYear}-01-01`
        const yearEnd = `${selectedYear}-12-31`

        const { data: absences } = await supabase
            .from('absences')
            .select('user_id, start_date, end_date, type, status')
            .eq('type', 'Urlaub')
            .eq('status', 'genehmigt')
            .gte('start_date', yearStart)
            .lte('start_date', yearEnd)

        // Calculate stats for each employee
        const employeeStats = profiles.map(profile => {
            const entitlement = profile.vacation_days_per_year || 25

            // Count used vacation days
            const userVacations = absences?.filter(a => a.user_id === profile.id) || []

            let usedDays = 0
            userVacations.forEach(v => {
                // Count business days between start and end date
                const start = new Date(v.start_date)
                const end = new Date(v.end_date)

                // Simple count: iterate each day and check if it's a weekday
                let current = new Date(start)
                while (current <= end) {
                    if (!isWeekend(current)) {
                        usedDays++
                    }
                    current.setDate(current.getDate() + 1)
                }
            })

            const remaining = entitlement - usedDays
            const usedPercent = Math.round((usedDays / entitlement) * 100)

            return {
                ...profile,
                entitlement,
                usedDays,
                remaining,
                usedPercent,
                vacations: userVacations
            }
        })

        setEmployees(employeeStats)
        setLoading(false)
    }

    const getDisplayName = (emp) => {
        return emp.display_name || emp.full_name?.split(' ')[0] || emp.email?.split('@')[0]
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-40">
                <div className="animate-spin w-8 h-8 border-4 border-gray-200 border-t-black rounded-full" />
            </div>
        )
    }

    // Summary stats
    const totalEntitlement = employees.reduce((sum, e) => sum + e.entitlement, 0)
    const totalUsed = employees.reduce((sum, e) => sum + e.usedDays, 0)
    const totalRemaining = employees.reduce((sum, e) => sum + e.remaining, 0)

    return (
        <div className="space-y-6">
            {/* Year Selector */}
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold flex items-center gap-2">
                    <Palmtree className="text-green-600" size={20} />
                    Urlaubsstatistik
                </h2>
                <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                    className="p-2 bg-white border border-gray-200 rounded-lg font-bold"
                >
                    {[selectedYear - 1, selectedYear, selectedYear + 1].map(y => (
                        <option key={y} value={y}>{y}</option>
                    ))}
                </select>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-3">
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                    <div className="text-2xl font-black text-blue-700">{totalEntitlement}</div>
                    <div className="text-xs text-blue-600 font-medium">Anspruch gesamt</div>
                </div>
                <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                    <div className="text-2xl font-black text-amber-700">{totalUsed}</div>
                    <div className="text-xs text-amber-600 font-medium">Genommen</div>
                </div>
                <div className="bg-green-50 p-4 rounded-xl border border-green-100">
                    <div className="text-2xl font-black text-green-700">{totalRemaining}</div>
                    <div className="text-xs text-green-600 font-medium">Offen</div>
                </div>
            </div>

            {/* Employee List */}
            <div className="space-y-3">
                {employees.map(emp => (
                    <div key={emp.id} className="bg-white border border-gray-100/80 rounded-[1.5rem] p-4 shadow-[0_2px_10px_rgb(0,0,0,0.04)] hover:shadow-[0_4px_20px_rgb(0,0,0,0.06)] transition-all">
                        <div className="flex justify-between items-start mb-3">
                            <div>
                                <div className="font-bold text-gray-900">{getDisplayName(emp)}</div>
                                <div className="text-xs text-gray-400">{emp.entitlement} Tage Anspruch</div>
                            </div>
                            <div className="text-right">
                                <div className={`text-lg font-black ${emp.remaining > 0 ? 'text-green-600' : emp.remaining < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                                    {emp.remaining > 0 ? `+${emp.remaining}` : emp.remaining}
                                </div>
                                <div className="text-xs text-gray-400">Tage offen</div>
                            </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                                className={`h-full transition-all ${emp.usedPercent > 100 ? 'bg-red-500' : emp.usedPercent > 75 ? 'bg-amber-400' : 'bg-green-500'}`}
                                style={{ width: `${Math.min(emp.usedPercent, 100)}%` }}
                            />
                        </div>
                        <div className="flex justify-between text-xs text-gray-400 mt-1">
                            <span>{emp.usedDays} genommen</span>
                            <span>{emp.usedPercent}%</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
