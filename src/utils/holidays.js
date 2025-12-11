import { addDays, isSameDay } from 'date-fns'

export const getHolidays = (year) => {
    const holidays = [
        { date: new Date(year, 0, 1), name: 'Neujahr' },
        { date: new Date(year, 0, 6), name: 'Heilige Drei Könige' },
        { date: new Date(year, 4, 1), name: 'Staatsfeiertag' },
        { date: new Date(year, 7, 15), name: 'Mariä Himmelfahrt' },
        { date: new Date(year, 9, 26), name: 'Nationalfeiertag' },
        { date: new Date(year, 10, 1), name: 'Allerheiligen' },
        { date: new Date(year, 11, 8), name: 'Mariä Empfängnis' },
        { date: new Date(year, 11, 25), name: 'Christtag' },
        { date: new Date(year, 11, 26), name: 'Stefanitag' },
    ]

    // Bewegliche Feiertage (Ostern berechnen)
    const a = year % 19
    const b = Math.floor(year / 100)
    const c = year % 100
    const d = Math.floor(b / 4)
    const e = b % 4
    const f = Math.floor((b + 8) / 25)
    const g = Math.floor((b - f + 1) / 3)
    const h = (19 * a + b - d - g + 15) % 30
    const i = Math.floor(c / 4)
    const k = c % 4
    const l = (32 + 2 * e + 2 * i - h - k) % 7
    const m = Math.floor((a + 11 * h + 22 * l) / 451)

    const month = Math.floor((h + l - 7 * m + 114) / 31) - 1 // 0-indexed
    const day = ((h + l - 7 * m + 114) % 31) + 1

    const easterSunday = new Date(year, month, day)

    holidays.push({ date: addDays(easterSunday, 1), name: 'Ostermontag' })
    holidays.push({ date: addDays(easterSunday, 39), name: 'Christi Himmelfahrt' })
    holidays.push({ date: addDays(easterSunday, 50), name: 'Pfingstmontag' })
    holidays.push({ date: addDays(easterSunday, 60), name: 'Fronleichnam' })

    return holidays.sort((a, b) => a.date - b.date)
}

export const isHoliday = (date, holidays) => {
    return holidays.find(h => isSameDay(h.date, date))
}
