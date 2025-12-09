import { Calendar, List, User, Plane, Shield } from 'lucide-react'

export default function BottomNav({ activeTab, onTabChange, isAdmin }) {
    return (
        <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-2 flex justify-around items-center z-50 pb-safe">
            <button onClick={() => onTabChange('roster')} className={`flex flex-col items-center p-2 ${activeTab === 'roster' ? 'text-black' : 'text-gray-400'}`}>
                <Calendar size={24} />
                <span className="text-[10px] font-medium mt-1">Dienstplan</span>
            </button>
            <button onClick={() => onTabChange('times')} className={`flex flex-col items-center p-2 ${activeTab === 'times' ? 'text-black' : 'text-gray-400'}`}>
                <List size={24} />
                <span className="text-[10px] font-medium mt-1">Zeiten</span>
            </button>
            <button onClick={() => onTabChange('absences')} className={`flex flex-col items-center p-2 ${activeTab === 'absences' ? 'text-black' : 'text-gray-400'}`}>
                <Plane size={24} />
                <span className="text-[10px] font-medium mt-1">Urlaub</span>
            </button>
            {isAdmin && (
                <button onClick={() => onTabChange('admin')} className={`flex flex-col items-center p-2 ${activeTab === 'admin' ? 'text-black' : 'text-gray-400'}`}>
                    <Shield size={24} />
                    <span className="text-[10px] font-medium mt-1">Admin</span>
                </button>
            )}
            <button onClick={() => onTabChange('profile')} className={`flex flex-col items-center p-2 ${activeTab === 'profile' ? 'text-black' : 'text-gray-400'}`}>
                <User size={24} />
                <span className="text-[10px] font-medium mt-1">Profil</span>
            </button>
        </div>
    )
}
