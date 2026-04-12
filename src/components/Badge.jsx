export default function Badge({ count, dot = false, floating = false }) {
    if (!count && !dot) return null

    if (floating) {
        if (dot) {
            return <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
        }
        return (
            <span className="absolute -top-1 -right-2 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
                {count > 99 ? '99+' : count}
            </span>
        )
    }

    if (dot) {
        return <span className="w-2 h-2 bg-red-500 rounded-full" />
    }

    return (
        <span className="min-w-[20px] h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-1">
            {count > 99 ? '99+' : count}
        </span>
    )
}
