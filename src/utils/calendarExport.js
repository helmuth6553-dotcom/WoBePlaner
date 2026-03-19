/**
 * Calendar Export Utility
 * 
 * Generates iCal (.ics) files for personal shifts.
 * Compatible with: Google Calendar, Apple Calendar, Outlook, etc.
 */

/**
 * Shift type display names for calendar events
 */
const SHIFT_TYPE_NAMES = {
    'TD1': 'Tagdienst 1',
    'TD2': 'Tagdienst 2',
    'ND': 'Nachtdienst',
    'DBD': 'Doppelbesetzter Dienst',
    'TEAM': 'Teamsitzung',
    'FORTBILDUNG': 'Fortbildung',
    'EINSCHULUNG': 'Einschulungstermin',
    'MITARBEITERGESPRAECH': 'Mitarbeitergespräch',
    'SONSTIGES': 'Sonstiges',
    'SUPERVISION': 'Supervision',
    'AST': 'Anlaufstelle',
}

/**
 * Format a Date to iCal format (UTC)
 * Format: YYYYMMDDTHHMMSSZ
 */
const formatToICalDate = (date) => {
    const d = new Date(date)
    return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/**
 * Escape special characters for iCal text
 */
const escapeICalText = (text) => {
    if (!text) return ''
    return text
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\n/g, '\\n')
}

/**
 * Generate a unique UID for each event
 */
const generateUID = (shift) => {
    return `${shift.id}@wobeplaner.app`
}

/**
 * Convert a single shift to an iCal VEVENT
 */
const shiftToVEvent = (shift, userName = '') => {
    const title = shift.title || SHIFT_TYPE_NAMES[shift.type] || shift.type
    const description = `Dienst: ${title}${userName ? `\\nMitarbeiter: ${userName}` : ''}`

    const lines = [
        'BEGIN:VEVENT',
        `UID:${generateUID(shift)}`,
        `DTSTAMP:${formatToICalDate(new Date())}`,
        `DTSTART:${formatToICalDate(shift.start_time)}`,
        `DTEND:${formatToICalDate(shift.end_time)}`,
        `SUMMARY:${escapeICalText(title)}`,
        `DESCRIPTION:${escapeICalText(description)}`,
        'STATUS:CONFIRMED',
        'TRANSP:OPAQUE', // Show as busy
    ]

    // Add reminder 1 hour before
    lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        'DESCRIPTION:Dienst in 1 Stunde',
        'TRIGGER:-PT1H',
        'END:VALARM'
    )

    lines.push('END:VEVENT')

    return lines.join('\r\n')
}

/**
 * Generate a complete iCal file from shifts
 * 
 * @param {Array} shifts - Array of shift objects with start_time, end_time, type, title
 * @param {string} userName - Display name of the user (optional)
 * @returns {string} - Complete iCal file content
 */
export const generateICalFromShifts = (shifts, userName = '') => {
    const header = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//WoBePlaner//Dienstplan Export//DE',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'X-WR-CALNAME:WoBePlaner Dienste',
        'X-WR-TIMEZONE:Europe/Vienna',
    ].join('\r\n')

    const events = shifts
        .filter(s => s.start_time && s.end_time)
        .map(s => shiftToVEvent(s, userName))
        .join('\r\n')

    const footer = 'END:VCALENDAR'

    return `${header}\r\n${events}\r\n${footer}`
}

/**
 * Download iCal file
 * 
 * @param {Array} shifts - Array of shift objects
 * @param {string} fileName - Name for the downloaded file (without extension)
 * @param {string} userName - Display name of the user (optional)
 */
export const downloadICalFile = (shifts, fileName = 'meine-dienste', userName = '') => {
    const icalContent = generateICalFromShifts(shifts, userName)

    const blob = new Blob([icalContent], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = `${fileName}.ics`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    URL.revokeObjectURL(url)
}

/**
 * Generate Google Calendar URL for quick add
 * Note: Only works for single events, not batch
 */
export const generateGoogleCalendarUrl = (shift) => {
    const title = encodeURIComponent(shift.title || SHIFT_TYPE_NAMES[shift.type] || shift.type)
    const startDate = formatToICalDate(shift.start_time).replace('Z', '')
    const endDate = formatToICalDate(shift.end_time).replace('Z', '')

    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startDate}/${endDate}`
}
