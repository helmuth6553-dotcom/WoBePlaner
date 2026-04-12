import { Calendar, List, User, Plane, Shield } from 'lucide-react'
import Badge from './Badge'

// NavItem component for cleaner code
function NavItem({ id, icon: Icon, label, isActive, onClick, badge }) {
    return (
        <button
            onClick={() => onClick(id)}
            className={`flex flex-col items-center p-2 relative ${isActive ? 'text-black' : 'text-gray-400'}`}
        >
            <div className="relative">
                <Icon size={24} />
                <Badge count={badge?.count} dot={badge?.dot} floating />
            </div>
            <span className="text-[10px] font-medium mt-1">{label}</span>
        </button>
    )
}

export default function BottomNav({ activeTab, onTabChange, isAdmin, isViewer, badges = {} }) {
    // badges = { roster: { dot: true }, admin: { count: 3 }, ... }

    return (
        <div className="absolute bottom-0 left-0 right-0 bg-[#F5F4F0]/80 backdrop-blur-xl border-t border-gray-200/50 p-2 flex justify-around items-center z-50 pb-safe">
            <NavItem
                id="roster"
                icon={Calendar}
                label="Dienstplan"
                isActive={activeTab === 'roster'}
                onClick={onTabChange}
                badge={badges.roster}
            />
            {!isViewer && (
            <NavItem
                id="times"
                icon={List}
                label="Zeiten"
                isActive={activeTab === 'times'}
                onClick={onTabChange}
                badge={badges.times}
            />
            )}
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
