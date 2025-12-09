import { Calendar, List, User, Plane, Shield } from 'lucide-react'

export default function Sidebar({ activeTab, onTabChange, isAdmin }) {
    const navItems = [
        { id: 'roster', icon: Calendar, label: 'Dienstplan' },
        { id: 'times', icon: List, label: 'Zeiten' },
        { id: 'absences', icon: Plane, label: 'Urlaub' },
        ...(isAdmin ? [{ id: 'admin', icon: Shield, label: 'Admin' }] : []),
        { id: 'profile', icon: User, label: 'Profil' }
    ]

    return (
        <div className="hidden md:flex flex-col w-64 h-full bg-white border-r border-gray-200 p-5 shadow-sm">
            {/* Logo */}
            <div className="mb-8 px-2">
                <img src="/logo2.png" alt="Logo" className="w-full h-auto object-contain drop-shadow-sm" />
            </div>

            {/* Navigation */}
            <nav className="flex-1 space-y-2">
                {navItems.map(item => (
                    <button
                        key={item.id}
                        onClick={() => onTabChange(item.id)}
                        className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-200 ${activeTab === item.id
                                ? 'bg-[#00c2cb] text-white shadow-md font-bold'
                                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                            }`}
                    >
                        <item.icon size={20} />
                        <span className="font-medium text-sm">{item.label}</span>
                    </button>
                ))}
            </nav>

            {/* Version */}
            <div className="text-xs text-gray-400 px-4 mt-auto">
                v0.1.0 • Desktop
            </div>
        </div>
    )
}
