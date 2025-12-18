import { Calendar, List, User, Plane, Shield } from 'lucide-react'

// Badge component for notification dots
function Badge({ count, dot = false }) {
    if (!count && !dot) return null

    if (dot) {
        return (
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
        )
    }

    return (
        <span className="absolute -top-1 -right-2 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
            {count > 99 ? '99+' : count}
        </span>
    )
}

// NavItem component for cleaner code
function NavItem({ id, icon: Icon, label, isActive, onClick, badge }) {
    return (
        <button
            onClick={() => onClick(id)}
            className={`flex flex-col items-center p-2 relative ${isActive ? 'text-black' : 'text-gray-400'}`}
        >
            <div className="relative">
                <Icon size={24} />
                <Badge count={badge?.count} dot={badge?.dot} />
            </div>
            <span className="text-[10px] font-medium mt-1">{label}</span>
        </button>
    )
}

export default function BottomNav({ activeTab, onTabChange, isAdmin, badges = {} }) {
    // badges = { roster: { dot: true }, admin: { count: 3 }, ... }

    return (
        <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-2 flex justify-around items-center z-50 pb-safe">
            <NavItem
                id="roster"
                icon={Calendar}
                label="Dienstplan"
                isActive={activeTab === 'roster'}
                onClick={onTabChange}
                badge={badges.roster}
            />
            <NavItem
                id="times"
                icon={List}
                label="Zeiten"
                isActive={activeTab === 'times'}
                onClick={onTabChange}
                badge={badges.times}
            />
            <NavItem
                id="absences"
                icon={Plane}
                label="Urlaub"
                isActive={activeTab === 'absences'}
                onClick={onTabChange}
                badge={badges.absences}
            />
            {isAdmin && (
                <NavItem
                    id="admin"
                    icon={Shield}
                    label="Admin"
                    isActive={activeTab === 'admin'}
                    onClick={onTabChange}
                    badge={badges.admin}
                />
            )}
            <NavItem
                id="profile"
                icon={User}
                label="Profil"
                isActive={activeTab === 'profile'}
                onClick={onTabChange}
                badge={badges.profile}
            />
        </div>
    )
}
