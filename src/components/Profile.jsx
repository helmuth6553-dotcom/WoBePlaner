import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../AuthContext'
import { Settings, BarChart3, Trophy, Palmtree, Thermometer } from 'lucide-react'
import ProfileSettings from './ProfileSettings'
import ProfileStats from './ProfileStats'
import SoliPunktePanel from './SoliPunktePanel'
import ProfileVacation from './ProfileVacation'
import ProfileSickLeave from './ProfileSickLeave'

const SECTIONS = [
    { id: 'settings', label: 'Profil', icon: Settings },
    { id: 'stats', label: 'Statistik', icon: BarChart3, employeeOnly: true },
    { id: 'soli', label: 'Soli-Punkte', icon: Trophy, employeeOnly: true },
    { id: 'vacation', label: 'Urlaub', icon: Palmtree, employeeOnly: true },
    { id: 'sick', label: 'Krankenstand', icon: Thermometer, employeeOnly: true },
]

export default function Profile() {
    const { user, isAdmin } = useAuth()
    const [profile, setProfile] = useState(null)
    const [activeSection, setActiveSection] = useState('settings')

    useEffect(() => {
        if (user) fetchProfile()
    }, [user])

    const fetchProfile = async () => {
        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        if (data) setProfile(data)
    }

    const visibleSections = SECTIONS.filter(s => !s.employeeOnly || !isAdmin)

    if (!profile) {
        return (
            <div className="p-6 max-w-2xl mx-auto">
                <div className="animate-pulse space-y-4">
                    <div className="h-8 bg-gray-200 rounded w-40"></div>
                    <div className="h-64 bg-gray-100 rounded-2xl"></div>
                </div>
            </div>
        )
    }

    return (
        <div className="p-6 max-w-2xl mx-auto pb-24">
            <h1 className="text-2xl font-bold mb-4">Mein Profil</h1>

            {/* Section Tabs */}
            <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 overflow-x-auto">
                {visibleSections.map(section => {
                    const Icon = section.icon
                    const isActive = activeSection === section.id
                    return (
                        <button
                            key={section.id}
                            onClick={() => setActiveSection(section.id)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all flex-1 justify-center ${
                                isActive
                                    ? 'bg-white text-gray-900 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            <Icon size={16} />
                            <span className="hidden sm:inline">{section.label}</span>
                        </button>
                    )
                })}
            </div>

            {/* Section Content */}
            {activeSection === 'settings' && (
                <ProfileSettings
                    user={user}
                    profile={profile}
                    onProfileUpdate={fetchProfile}
                />
            )}

            {activeSection === 'stats' && !isAdmin && (
                <ProfileStats />
            )}

            {activeSection === 'soli' && !isAdmin && (
                <SoliPunktePanel />
            )}

            {activeSection === 'vacation' && !isAdmin && (
                <ProfileVacation />
            )}

            {activeSection === 'sick' && !isAdmin && (
                <ProfileSickLeave />
            )}
        </div>
    )
}
