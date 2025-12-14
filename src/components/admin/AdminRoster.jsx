import { CheckCircle } from 'lucide-react'

/**
 * =========================================================================
 * AdminRoster
 * Placeholder component for roster management.
 * Currently shows initialization status only.
 * =========================================================================
 */
export default function AdminRoster() {
    return (
        <div>
            <h2 className="text-xl font-bold mb-6">Dienstplan Verwaltung</h2>
            <div className="bg-green-50 p-6 rounded-xl border border-green-100 text-center">
                <CheckCircle className="mx-auto text-green-600 mb-3" size={48} />
                <h3 className="font-bold text-lg text-green-800 mb-2">System Initialisiert</h3>
            </div>
        </div>
    )
}
