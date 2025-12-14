import { useState } from 'react'
import { Users, FileText, Thermometer, ShieldCheck, BarChart3 } from 'lucide-react'

import AdminOverview from './admin/AdminOverview'
import AdminAuditLog from './admin/AdminAuditLog'
import AdminSickLeaves from './admin/AdminSickLeaves'
import AdminEmployees from './admin/AdminEmployees'
import AdminAbsences from './admin/AdminAbsences'

export default function AdminDashboard(props) {
    const [activeTab, setActiveTab] = useState('overview')

    return (
        <div className="p-4 pb-24 max-w-xl mx-auto">
            <h1 className="text-2xl font-bold mb-6 px-2">Admin Dashboard</h1>

            {/* Navigation Tabs */}
            <div className="flex flex-wrap gap-2 mb-6 px-2">
                <button onClick={() => setActiveTab('audit')} className={`flex-1 min-w-[100px] flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'audit' ? 'bg-black text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
                    <ShieldCheck size={16} /> Audit
                </button>
                <button onClick={() => setActiveTab('employees')} className={`flex-1 min-w-[100px] flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'employees' ? 'bg-black text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
                    <Users size={16} /> Mitarbeiter
                </button>
                <button onClick={() => setActiveTab('absences')} className={`flex-1 min-w-[100px] flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'absences' ? 'bg-black text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
                    <FileText size={16} /> Anträge
                </button>
                <button onClick={() => setActiveTab('sick')} className={`flex-1 min-w-[100px] flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'sick' ? 'bg-black text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
                    <Thermometer size={16} /> Krank
                </button>
                <button onClick={() => setActiveTab('overview')} className={`flex-1 min-w-[100px] flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'overview' ? 'bg-black text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
                    <BarChart3 size={16} /> Übersicht
                </button>
            </div>

            {/* Content Container */}
            <div className="min-h-[400px]">
                {activeTab === 'overview' && <AdminOverview />}
                {activeTab === 'employees' && <AdminEmployees />}
                {activeTab === 'absences' && <AdminAbsences onNavigateToCalendar={props.onNavigateToCalendar} />}
                {activeTab === 'sick' && <AdminSickLeaves />}
                {activeTab === 'audit' && <AdminAuditLog />}
            </div>
        </div>
    )
}
