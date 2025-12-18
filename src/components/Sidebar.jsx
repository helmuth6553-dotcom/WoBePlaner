import { Calendar, List, User, Plane, Shield } from 'lucide-react'

// Badge component matching BottomNav
function Badge({ count, dot = false }) {
    if (!count && !dot) return null

    if (dot) {
        return (
            <span className="w-2 h-2 bg-red-500 rounded-full" />
        )
    }

    return (
        <span className="min-w-[20px] h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-1">
            {count > 99 ? '99+' : count}
        </span>
    )
}

export default function Sidebar({ activeTab, onTabChange, isAdmin, badges = {} }) {
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
                {navItems.map(item => {
                    const badge = badges[item.id]
                    return (
                        <button
                            key={item.id}
                            onClick={() => onTabChange(item.id)}
                            className={`w-full flex items-center justify-between gap-4 px-4 py-3 rounded-xl transition-all duration-200 ${activeTab === item.id
                                ? 'bg-[#00c2cb] text-white shadow-md font-bold'
                                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                                }`}
                        >
                            <div className="flex items-center gap-4">
                                <item.icon size={20} />
                                <span className="font-medium text-sm">{item.label}</span>
                            </div>
                            <Badge count={badge?.count} dot={badge?.dot} />
                        </button>
                    )
                })}
            </nav>

            {/* Version */}
            <div className="text-xs text-gray-400 px-4 mt-auto">
                v1.3.1 • Desktop
            </div>
        </div>
    )
}
