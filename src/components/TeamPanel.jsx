import { Users, TrendingUp, TrendingDown, Minus, RefreshCw } from 'lucide-react'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'

/**
 * TeamPanel - Admin-only Right Panel for Desktop
 * Shows all employee balances for the currently selected month
 * Now receives data from parent (RosterFeed) for synchronization
 */
export default function TeamPanel({ balances = [], currentDate, onRefresh, loading = false }) {
    if (loading) {
        return (
            <div className="hidden lg:flex flex-col w-96 h-full bg-gray-50 border-l border-gray-200 p-4">
                <div className="animate-pulse space-y-3">
                    {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-20 bg-gray-200 rounded-lg"></div>)}
                </div>
            </div>
        )
    }

    return (
        <div className="hidden lg:flex flex-col w-96 h-full bg-gray-50 border-l border-gray-200">
            {/* Header */}
            <div className="p-4 bg-white border-b border-gray-200">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Users size={22} className="text-gray-600" />
                        <h2 className="font-bold text-lg text-gray-800">Team Übersicht</h2>
                    </div>
                    {onRefresh && (
                        <button
                            onClick={onRefresh}
                            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                            title="Aktualisieren"
                        >
                            <RefreshCw size={18} className="text-gray-500" />
                        </button>
                    )}
                </div>
                <div className="flex justify-between items-center mt-1">
                    <p className="text-sm text-gray-400">{balances.length} Mitarbeiter</p>
                    {currentDate && (
                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
                            {format(currentDate, 'MMMM yyyy', { locale: de })}
                        </span>
                    )}
                </div>
            </div>

            {/* Scrollable List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {balances.map(user => {
                    const isPositive = user.total > 0
                    const isNegative = user.total < 0

                    return (
                        <div key={user.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                            <div className="flex justify-between items-center mb-3">
                                <span className="font-semibold text-gray-800 truncate text-base" title={user.name}>
                                    {user.name}
                                </span>
                                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold ${isPositive ? 'bg-emerald-100 text-emerald-700' :
                                    isNegative ? 'bg-red-100 text-red-700' :
                                        'bg-gray-100 text-gray-600'
                                    }`}>
                                    {isPositive && <TrendingUp size={18} />}
                                    {isNegative && <TrendingDown size={18} />}
                                    {!isPositive && !isNegative && <Minus size={18} />}
                                    <span className="text-lg">{user.total > 0 ? '+' : ''}{user.total}h</span>
                                </div>
                            </div>

                            <div className="flex justify-between bg-gray-50 rounded-lg p-3">
                                <div className="text-center flex-1">
                                    <div className="text-gray-400 text-xs mb-1">Soll</div>
                                    <div className="font-bold text-gray-700 text-lg">{user.target}h</div>
                                </div>
                                <div className="text-center flex-1 border-x border-gray-200">
                                    <div className="text-blue-400 text-xs mb-1">Ist</div>
                                    <div className="font-bold text-blue-600 text-lg">{user.actual}h</div>
                                </div>
                                <div className="text-center flex-1">
                                    <div className={`text-xs mb-1 ${user.carryover >= 0 ? 'text-gray-400' : 'text-red-400'}`}>Übertrag</div>
                                    <div className={`font-bold text-lg ${user.carryover >= 0 ? 'text-gray-700' : 'text-red-600'}`}>
                                        {user.carryover > 0 ? '+' : ''}{user.carryover}h
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Footer */}
            <div className="p-3 bg-white border-t border-gray-200 text-center">
                <div className="text-xs text-gray-400 uppercase tracking-wider">
                    Synchronisiert mit Dienstplan
                </div>
            </div>
        </div>
    )
}
