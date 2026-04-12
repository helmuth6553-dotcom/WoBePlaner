import { useState } from 'react'
import { Users, FileText, Thermometer, ShieldCheck, BarChart3, Palmtree, CalendarDays } from 'lucide-react'

import AdminOverview from './admin/AdminOverview'
import AdminAuditLog from './admin/AdminAuditLog'
import AdminSickLeaves from './admin/AdminSickLeaves'
import AdminEmployees from './admin/AdminEmployees'
import AdminAbsences from './admin/AdminAbsences'
import AdminVacationStats from './admin/AdminVacationStats'
import AdminRosterPlanner from './admin/AdminRosterPlanner'
import Badge from './Badge'
import { useAuth } from '../AuthContext'
import { useAdminBadgeCounts } from '../utils/useAdminBadgeCounts'

export default function AdminDashboard(props) {
    const { user, isAdmin } = useAuth()
    const [activeTab, setActiveTab] = useState(() => {
        const saved = sessionStorage.getItem('adminDashTab')
        return saved === 'calendar' ? 'overview' : (saved || 'overview')
    })

    const { antraege, krank, markKrankSeen } = useAdminBadgeCounts(user?.id, isAdmin)

    const handleTabChange = (tab) => {
        sessionStorage.setItem('adminDashTab', tab)
        setActiveTab(tab)
        if (tab === 'sick') markKrankSeen()
    }

    const tabs = [
        { id: 'planner', icon: CalendarDays, label: 'Dienstplan' },
        { id: 'audit', icon: ShieldCheck, label: 'Audit' },
        { id: 'employees', icon: Users, label: 'Mitarbeiter' },
        { id: 'absences', icon: FileText, label: 'Anträge', badgeCount: antraege },
        { id: 'sick', icon: Thermometer, label: 'Krank', badgeCount: krank },
        { id: 'vacation', icon: Palmtree, label: 'Urlaub' },
        { id: 'overview', icon: BarChart3, label: 'Übersicht' },
    ]

    return (
        <div className="p-4 pb-24 max-w-xl md:max-w-3xl lg:max-w-5xl mx-auto">
            <h1 className="text-2xl font-bold mb-6 px-2">Admin Dashboard</h1>

            {/* Navigation Tabs */}
            <div className="flex flex-wrap gap-2 mb-6 px-2">
                {tabs.map(({ id, icon: Icon, label, badgeCount }) => (
                    <button
                        key={id}
                        onClick={() => handleTabChange(id)}
                        className={`flex-1 min-w-[100px] flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === id ? 'bg-teal-500 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
                    >
                        <Icon size={16} /> {label}
                        <Badge count={badgeCount} />
                    </button>
                ))}
            </div>

            {/* Content Container */}
            <div className="min-h-[400px]">
                {activeTab === 'overview' && <AdminOverview />}
                {activeTab === 'employees' && <AdminEmployees />}
                {activeTab === 'absences' && <AdminAbsences onNavigateToCalendar={props.onNavigateToCalendar} />}
                {activeTab === 'sick' && <AdminSickLeaves />}
                {activeTab === 'vacation' && <AdminVacationStats />}
                {activeTab === 'planner' && <AdminRosterPlanner />}
                {activeTab === 'audit' && <AdminAuditLog />}
            </div>
        </div>
    )
}
