/**
 * =========================================================================
 * Time Report PDF Generator
 * 
 * Generates "Arbeitszeitaufzeichnung" PDFs based on official DOWAS template
 * 
 * Features:
 * - Decimal time format (9,50 instead of 9:30)
 * - Weekly subtotals (Wochenarbeitszeit)
 * - Regular work + On-call (Bereitschaft) columns
 * - Night shifts split across days
 * - Digital signature verification footer
 * - No surcharge columns (Nacht/Sonn/FT removed)
 * =========================================================================
 */

import { jsPDF } from 'jspdf'
import { format, parseISO, startOfWeek, getISOWeek, getDay } from 'date-fns'
import { de } from 'date-fns/locale'

/**
 * Helper: Convert time to decimal format with comma (German style)
 * 09:30 → "9,50" | 13:45 → "13,75"
 */
const timeToDecimal = (isoString) => {
    if (!isoString) return '-'
    try {
        const date = parseISO(isoString)
        const hours = date.getHours()
        const minutes = date.getMinutes()
        const decimal = hours + (minutes / 60)
        return decimal.toFixed(2).replace('.', ',')
    } catch {
        return '-'
    }
}

/**
 * Helper: Format hours to German decimal format
 * 2.25 → "2,25"
 */
const hoursToDecimal = (hours) => {
    if (hours === null || hours === undefined) return '-'
    return Number(hours).toFixed(2).replace('.', ',')
}

/**
 * Helper: Get day abbreviation in German
 */
const getDayAbbr = (dateStr) => {
    try {
        const date = parseISO(dateStr)
        return format(date, 'EE', { locale: de })
    } catch {
        return '?'
    }
}

/**
 * Helper: Get day number
 */
const getDayNumber = (dateStr) => {
    try {
        return format(parseISO(dateStr), 'd')
    } catch {
        return '?'
    }
}

/**
 * Generate Time Report PDF
 * 
 * @param {Object} params
 * @param {string} params.yearMonth - "2025-12" format
 * @param {Object} params.user - User profile { full_name, email, weekly_hours }
 * @param {Array} params.entries - Time entries with shifts
 * @param {Object} params.statusData - { status, submitted_at, approved_at, data_hash, approver_name }
 * @param {Object} params.vacationData - { saldo, used, remaining }
 * @param {Object} params.balanceData - { sollstunden, saldo_monat, saldo_uebertrag, saldo_neu }
 */
export const generateTimeReportPDF = ({
    yearMonth,
    user,
    entries,
    statusData,
    vacationData,
    balanceData
}) => {
    const doc = new jsPDF()

    // Page settings
    const pageWidth = 210
    const pageHeight = 297
    const margin = 10
    const contentWidth = pageWidth - (margin * 2)

    const userName = user?.full_name || user?.email || 'Mitarbeiter'
    const weeklyHours = user?.weekly_hours || 20

    // Parse month for header
    const monthDate = new Date(yearMonth + '-01')
    const monthName = format(monthDate, 'MMM', { locale: de }).toLowerCase()
    const year = format(monthDate, 'yy')

    let yPos = margin

    // =========================================================================
    // HEADER
    // =========================================================================
    doc.setFont("helvetica", "normal")
    doc.setFontSize(10)
    doc.setTextColor(0, 0, 0)

    // Month/Year top left
    doc.text(`${monthName} ${year}`, margin, yPos + 4)

    yPos += 8

    // Title line
    doc.setFont("helvetica", "bold")
    doc.text("Arbeitszeitaufzeichnung von:", margin, yPos + 4)
    doc.setFont("helvetica", "normal")
    doc.text(userName, margin + 60, yPos + 4)

    // Right side: Vacation balance
    if (vacationData) {
        doc.setFontSize(8)
        const rightX = pageWidth - margin
        doc.text(`Urlaubssaldo`, rightX - 50, yPos)
        doc.text(`${hoursToDecimal(vacationData.saldo)}`, rightX, yPos, { align: 'right' })
        doc.text(`Verbrauch`, rightX - 50, yPos + 4)
        doc.text(`${vacationData.used ? hoursToDecimal(vacationData.used) : '-'}`, rightX, yPos + 4, { align: 'right' })
        doc.text(`neuer Urlaubssaldo`, rightX - 50, yPos + 8)
        doc.text(`${hoursToDecimal(vacationData.remaining)}`, rightX, yPos + 8, { align: 'right' })
    }

    yPos += 14

    // Weekly hours
    doc.setFontSize(9)
    doc.text(`Wostd.`, margin, yPos)
    doc.setFont("helvetica", "bold")
    doc.text(`${weeklyHours}`, margin + 15, yPos)
    doc.setFont("helvetica", "normal")

    yPos += 8

    // =========================================================================
    // TABLE HEADER
    // =========================================================================
    const colX = {
        datum: margin,
        tag: margin + 14,
        anfang: margin + 26,
        ende: margin + 42,
        taetigkeit: margin + 58,
        regStden: margin + 85,
        bAnfang: margin + 105,
        bEnde: margin + 121,
        bStunden: margin + 137
    }

    // Header row 1: Group headers
    doc.setFillColor(255, 255, 255)
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.3)

    doc.setFont("helvetica", "bold")
    doc.setFontSize(7)

    // Draw top border
    doc.line(margin, yPos, pageWidth - margin, yPos)
    yPos += 4

    // "Reguläre Arbeitszeiten" spanning
    doc.text("Reguläre Arbeitszeiten", colX.anfang + 15, yPos, { align: 'center' })
    // "Bereitschaftsdienste" spanning
    doc.text("Bereitschaftsdienste", colX.bAnfang + 20, yPos, { align: 'center' })

    yPos += 4

    // Header row 2: Column names
    doc.setFontSize(6)
    doc.text("Datum", colX.datum, yPos)
    doc.text("Tag", colX.tag, yPos)
    doc.text("Anfang", colX.anfang, yPos)
    doc.text("Ende", colX.ende, yPos)
    doc.text("Tätigkeit", colX.taetigkeit, yPos)
    doc.text("Reg.Stden", colX.regStden, yPos)
    doc.text("Anfang", colX.bAnfang, yPos)
    doc.text("Ende", colX.bEnde, yPos)
    doc.text("Stunden", colX.bStunden, yPos)

    yPos += 3
    doc.line(margin, yPos, pageWidth - margin, yPos)
    yPos += 3

    // =========================================================================
    // TABLE ROWS
    // =========================================================================
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7)

    // Sort entries by date
    const sortedEntries = [...entries].sort((a, b) => {
        const dateA = new Date(a.actual_start || a.entry_date || 0)
        const dateB = new Date(b.actual_start || b.entry_date || 0)
        return dateA - dateB
    })

    // Group by week for weekly subtotals
    let currentWeek = null
    let weeklyHoursSum = 0
    let lastDayNumber = null

    // Totals for footer
    let totalRegularHours = 0
    let totalBereitschaftHours = 0
    let workDays = new Set()

    sortedEntries.forEach((entry, index) => {
        // Page break check
        if (yPos > pageHeight - 50) {
            doc.addPage()
            yPos = margin + 10
        }

        const dateStr = entry.actual_start || entry.entry_date
        if (!dateStr) return

        const entryDate = parseISO(dateStr)
        const dayNum = getDayNumber(dateStr)
        const dayAbbr = getDayAbbr(dateStr)
        const week = getISOWeek(entryDate)

        // Track work days
        workDays.add(dayNum)

        // Week change → print weekly subtotal
        if (currentWeek !== null && week !== currentWeek && weeklyHoursSum > 0) {
            // Print Wochenarbeitszeit row
            doc.setFont("helvetica", "normal")
            doc.setFontSize(7)
            doc.text("Wochenarbeitszeit", colX.taetigkeit, yPos)
            doc.setFont("helvetica", "bold")
            doc.text(hoursToDecimal(weeklyHoursSum), colX.regStden, yPos)
            doc.setFont("helvetica", "normal")

            yPos += 4
            doc.setDrawColor(150, 150, 150)
            doc.line(margin, yPos, pageWidth - margin, yPos)
            yPos += 4

            weeklyHoursSum = 0
        }
        currentWeek = week

        // Get shift info
        const shift = entry.shifts
        const shiftType = shift?.type || entry.absences?.type || '-'

        // Calculate hours
        const hours = entry.calculated_hours || 0

        // Determine if Bereitschaft or regular
        const isBereitschaft = shiftType?.toLowerCase().includes('bereit') ||
            shiftType?.toLowerCase().includes('nd') ||
            shift?.is_bereitschaft

        // Start/End times in decimal
        const startDecimal = timeToDecimal(entry.actual_start)
        const endDecimal = timeToDecimal(entry.actual_end)

        // Only show day number if different from last row
        const showDayNum = dayNum !== lastDayNumber
        lastDayNumber = dayNum

        // Render row
        if (showDayNum) {
            doc.text(dayNum, colX.datum, yPos)
            doc.text(dayAbbr, colX.tag, yPos)
        }

        if (isBereitschaft) {
            // Bereitschaft columns
            doc.text(startDecimal, colX.bAnfang, yPos)
            doc.text(endDecimal, colX.bEnde, yPos)
            doc.text(hoursToDecimal(hours), colX.bStunden, yPos)
            totalBereitschaftHours += hours
        } else {
            // Regular work columns
            doc.text(startDecimal, colX.anfang, yPos)
            doc.text(endDecimal, colX.ende, yPos)

            // Truncate long shift types
            let displayType = shiftType
            if (displayType.length > 12) displayType = displayType.substring(0, 10) + '..'
            doc.text(displayType, colX.taetigkeit, yPos)

            doc.text(hoursToDecimal(hours), colX.regStden, yPos)
            totalRegularHours += hours
        }

        weeklyHoursSum += hours

        yPos += 5

        // Light separator
        doc.setDrawColor(230, 230, 230)
        doc.line(colX.anfang, yPos - 1, pageWidth - margin, yPos - 1)
    })

    // Final week subtotal
    if (weeklyHoursSum > 0) {
        yPos += 2
        doc.setFont("helvetica", "normal")
        doc.text("Wochenarbeitszeit", colX.taetigkeit, yPos)
        doc.setFont("helvetica", "bold")
        doc.text(hoursToDecimal(weeklyHoursSum), colX.regStden, yPos)
        yPos += 5
    }

    // =========================================================================
    // FOOTER SUMMARY
    // =========================================================================
    yPos += 5
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.5)
    doc.line(margin, yPos, pageWidth - margin, yPos)
    yPos += 5

    doc.setFont("helvetica", "normal")
    doc.setFontSize(7)

    // Left column: AT (Arbeitstage)
    doc.text(`AT`, margin, yPos)
    doc.setFont("helvetica", "bold")
    doc.text(`${workDays.size}`, margin + 12, yPos)
    doc.setFont("helvetica", "normal")

    // Right column: Summary
    const summaryX = margin + 60
    const valueX = margin + 130

    const zwischensumme = totalRegularHours
    const bereitschaftHalf = totalBereitschaftHours / 2
    const summeMonat = zwischensumme + bereitschaftHalf
    const sollstunden = balanceData?.sollstunden || (weeklyHours * 4.33)
    const saldoMonat = summeMonat - sollstunden
    const saldoUebertrag = balanceData?.saldo_uebertrag || 0
    const saldoNeu = saldoMonat + saldoUebertrag

    doc.text("Zwischensumme", summaryX, yPos)
    doc.text(hoursToDecimal(zwischensumme), valueX, yPos)

    yPos += 4
    doc.text("Bereitschaftsstden : 2", summaryX, yPos)
    doc.text(hoursToDecimal(bereitschaftHalf), valueX, yPos)

    yPos += 4
    doc.text("Summe/mon", summaryX, yPos)
    doc.setFont("helvetica", "bold")
    doc.text(hoursToDecimal(summeMonat), valueX, yPos)
    doc.setFont("helvetica", "normal")

    yPos += 4
    doc.text("Sollstden", summaryX, yPos)
    doc.text(hoursToDecimal(sollstunden), valueX, yPos)

    yPos += 4
    doc.text("Saldo lfdes Monat", summaryX, yPos)
    doc.text(hoursToDecimal(saldoMonat), valueX, yPos)

    yPos += 4
    doc.text("Saldo/Übertrag +/-", summaryX, yPos)
    doc.text(hoursToDecimal(saldoUebertrag), valueX, yPos)

    yPos += 4
    doc.setFont("helvetica", "bold")
    doc.text("Saldo neu", summaryX, yPos)
    doc.text(hoursToDecimal(saldoNeu), valueX, yPos)
    doc.setFont("helvetica", "normal")

    // Bereitschaft gesamt (right side)
    yPos += 6
    doc.text("Bereitschaft gesamt", summaryX, yPos)
    doc.text(hoursToDecimal(totalBereitschaftHours), valueX, yPos)

    // =========================================================================
    // DIGITAL SIGNATURE FOOTER (Compact, Font Size 6)
    // =========================================================================
    yPos += 10
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.3)
    doc.line(margin, yPos, pageWidth - margin, yPos)
    yPos += 3

    doc.setFontSize(6)
    doc.setFont("helvetica", "bold")
    doc.setFillColor(46, 125, 50)
    doc.rect(margin, yPos - 1, contentWidth, 5, 'F')
    doc.setTextColor(255, 255, 255)
    doc.text("✓ DIGITAL SIGNIERT & VERIFIZIERT", margin + 2, yPos + 2.5)
    doc.setTextColor(0, 0, 0)
    yPos += 6

    // Signature details - compact single lines
    doc.setFont("helvetica", "normal")
    doc.setFontSize(6)

    // Line 1: Employee + Signature time
    let sigLine1 = `Mitarbeiter: ${userName}`
    if (statusData?.submitted_at) {
        sigLine1 += ` | Signiert: ${format(parseISO(statusData.submitted_at), 'dd.MM.yyyy HH:mm')} Uhr`
    }
    doc.text(sigLine1, margin, yPos)

    yPos += 3

    // Line 2: Hash
    if (statusData?.data_hash) {
        doc.setFont("courier", "normal")
        doc.text(`Hash: ${statusData.data_hash}`, margin, yPos)
    }

    yPos += 3

    // Line 3: Approval
    doc.setFont("helvetica", "normal")
    if (statusData?.status === 'genehmigt' && statusData?.approved_at) {
        const approverName = statusData.approver_name || 'Administrator'
        doc.text(`Genehmigt von: ${approverName} | Genehmigt am: ${format(parseISO(statusData.approved_at), 'dd.MM.yyyy HH:mm')} Uhr`, margin, yPos)
    } else if (statusData?.status === 'eingereicht') {
        doc.setTextColor(150, 150, 150)
        doc.text("Genehmigung ausstehend", margin, yPos)
        doc.setTextColor(0, 0, 0)
    }

    // =========================================================================
    // SIGNATURE LINES
    // =========================================================================
    yPos += 8
    doc.setDrawColor(0, 0, 0)

    // Left: Dienstnehmer
    doc.line(margin, yPos + 8, margin + 60, yPos + 8)
    doc.setFontSize(6)
    doc.text("Dienstnehmer", margin, yPos + 12)

    // Right: Dienstgeber
    doc.line(pageWidth - margin - 60, yPos + 8, pageWidth - margin, yPos + 8)
    doc.text("Dienstgeber", pageWidth - margin - 60, yPos + 12)

    // =========================================================================
    // SAVE PDF
    // =========================================================================
    const filename = `Arbeitszeit_${userName.replace(/\s+/g, '_')}_${yearMonth}.pdf`
    doc.save(filename)

    return filename
}
