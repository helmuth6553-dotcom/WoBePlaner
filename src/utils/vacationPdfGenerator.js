/**
 * =========================================================================
 * Vacation Request PDF Generator
 *
 * Generates "Urlaubsansuchen / Meldung" PDFs
 * Corporate Identity matching the Arbeitszeitaufzeichnung design
 *
 * Features:
 * - Modern CI design with slate tones
 * - Digital signature verification with hash
 * - Admin approval display
 * - Holiday-aware return date calculation
 * =========================================================================
 */

import { jsPDF } from 'jspdf'
import { format, isSameDay } from 'date-fns'
import { getHolidays } from './holidays'

/**
 * Count workdays (Mon-Fri, excluding Austrian holidays) in a date range, inclusive.
 */
const countWorkdays = (start, end) => {
    const holidays = [
        ...getHolidays(start.getFullYear()),
        ...getHolidays(end.getFullYear()),
    ]
    let count = 0
    let current = new Date(start)
    while (current <= end) {
        const day = current.getDay()
        if (day !== 0 && day !== 6 && !holidays.some(h => isSameDay(h.date, current))) {
            count++
        }
        current.setDate(current.getDate() + 1)
    }
    return count
}

/**
 * Calculate the first working day after a given date
 * Skips weekends and Austrian holidays
 */
export const getFirstWorkingDayAfter = (date) => {
    const holidays = getHolidays(date.getFullYear())
    const nextYearHolidays = getHolidays(date.getFullYear() + 1)
    const allHolidays = [...holidays, ...nextYearHolidays]

    let returnDate = new Date(date)
    returnDate.setDate(returnDate.getDate() + 1)

    while (
        returnDate.getDay() === 0 ||
        returnDate.getDay() === 6 ||
        allHolidays.some(h => isSameDay(h.date, returnDate))
    ) {
        returnDate.setDate(returnDate.getDate() + 1)
    }

    return returnDate
}

/**
 * Generate Vacation Request PDF
 *
 * @param {Object} params
 * @param {Object} params.request - The absence request from database
 * @param {string} params.employeeName - Full name of employee
 * @param {string} params.facilityName - Name of facility/department
 * @param {Object} params.vacationAccount - { entitlement, remaining }
 * @param {Object} params.signature - Signature data { signed_at, hash }
 * @param {Object} params.approval - { approverName, approvedAt }
 */
export const generateVacationRequestPDF = ({
    request,
    employeeName,
    facilityName = 'Chill Out',
    vacationAccount,
    signature,
    approval
}) => {
    const doc = new jsPDF('p', 'mm', 'a4')

    const startDate = new Date(request.start_date)
    const endDate = new Date(request.end_date)
    const returnDate = getFirstWorkingDayAfter(endDate)
    const durationDays = countWorkdays(startDate, endDate)

    const margin = 20
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const contentWidth = pageWidth - 2 * margin

    doc.setFont('helvetica')

    // =========================================================================
    // HEADER (ORG INFO)
    // =========================================================================
    let yPos = 20
    doc.setFontSize(12)
    doc.setFont(undefined, 'bold')
    doc.setTextColor(30, 41, 59) // slate-800
    doc.text('DOWAS Chill Out', margin, yPos)

    doc.setFontSize(12)
    doc.setFont(undefined, 'normal')
    doc.setTextColor(100, 116, 139) // slate-500
    yPos += 6
    doc.text('Heiliggeiststraße 8a, 6020 Innsbruck', margin, yPos)
    yPos += 5
    doc.text('Tel.: 0512 57 21 21 | E-Mail: chillout@dowas.org', margin, yPos)

    // Header separator
    yPos += 8
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.5)
    doc.line(margin, yPos, pageWidth - margin, yPos)

    // =========================================================================
    // TITLE
    // =========================================================================
    yPos += 20
    doc.setFontSize(18)
    doc.setFont(undefined, 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text('URLAUBSANSUCHEN', pageWidth / 2, yPos, { align: 'center' })

    // =========================================================================
    // STATUS BADGE (centered)
    // =========================================================================
    yPos += 12
    if (request.status === 'genehmigt') {
        doc.setFillColor(220, 252, 231) // green-100
        doc.setDrawColor(34, 197, 94)   // green-500
        const statusWidth = 44
        doc.roundedRect((pageWidth / 2) - (statusWidth / 2), yPos - 7, statusWidth, 11, 1.5, 1.5, 'FD')
        doc.setFontSize(11)
        doc.setFont(undefined, 'bold')
        doc.setTextColor(21, 128, 61) // green-700
        doc.text('GENEHMIGT', pageWidth / 2, yPos, { align: 'center' })
    } else if (request.status === 'abgelehnt') {
        doc.setFillColor(254, 226, 226) // red-100
        doc.setDrawColor(239, 68, 68)   // red-500
        const statusWidth = 44
        doc.roundedRect((pageWidth / 2) - (statusWidth / 2), yPos - 7, statusWidth, 11, 1.5, 1.5, 'FD')
        doc.setFontSize(11)
        doc.setFont(undefined, 'bold')
        doc.setTextColor(185, 28, 28) // red-700
        doc.text('ABGELEHNT', pageWidth / 2, yPos, { align: 'center' })
    } else {
        doc.setFillColor(254, 249, 195) // yellow-100
        doc.setDrawColor(234, 179, 8)   // yellow-500
        const statusWidth = 44
        doc.roundedRect((pageWidth / 2) - (statusWidth / 2), yPos - 7, statusWidth, 11, 1.5, 1.5, 'FD')
        doc.setFontSize(11)
        doc.setFont(undefined, 'bold')
        doc.setTextColor(161, 98, 7) // yellow-700
        doc.text('AUSSTEHEND', pageWidth / 2, yPos, { align: 'center' })
    }

    // =========================================================================
    // EMPLOYEE DETAILS
    // =========================================================================
    yPos += 28
    doc.setFontSize(12)
    doc.setTextColor(100, 116, 139)
    doc.setFont(undefined, 'normal')
    doc.text('Name:', margin, yPos)
    doc.text('Einrichtung:', margin, yPos + 10)

    doc.setTextColor(30, 41, 59)
    doc.setFont(undefined, 'bold')
    doc.text(employeeName, margin + 30, yPos)
    doc.text(facilityName, margin + 30, yPos + 10)

    // =========================================================================
    // DATES
    // =========================================================================
    yPos += 24
    doc.setFontSize(12)
    doc.setTextColor(100, 116, 139)
    doc.setFont(undefined, 'normal')
    doc.text('Angesuchter Urlaub in der Zeit von:', margin, yPos)

    doc.setTextColor(30, 41, 59)
    doc.setFont(undefined, 'bold')
    doc.text(format(startDate, 'dd.MM.yyyy'), margin + 72, yPos)

    doc.setTextColor(100, 116, 139)
    doc.setFont(undefined, 'normal')
    doc.text('bis inkl.', margin + 97, yPos)

    doc.setTextColor(30, 41, 59)
    doc.setFont(undefined, 'bold')
    doc.text(format(endDate, 'dd.MM.yyyy'), margin + 113, yPos)

    yPos += 10
    doc.setTextColor(100, 116, 139)
    doc.setFont(undefined, 'normal')
    doc.text('Dienstantritt nach dem Urlaub am:', margin, yPos)

    doc.setTextColor(30, 41, 59)
    doc.setFont(undefined, 'bold')
    doc.text(format(returnDate, 'dd.MM.yyyy'), margin + 65, yPos)

    // =========================================================================
    // CALCULATION BOX
    // =========================================================================
    yPos += 22
    doc.setFillColor(248, 250, 252)
    doc.setDrawColor(226, 232, 240)
    doc.roundedRect(margin, yPos, contentWidth, 40, 2, 2, 'FD')

    let calcY = yPos + 10
    const rightColX = margin + contentWidth - 35
    doc.setFontSize(12)

    // Balance before this vacation
    const remaining = vacationAccount?.remaining ?? 0
    const balanceOld = remaining + durationDays
    doc.setTextColor(100, 116, 139)
    doc.setFont(undefined, 'normal')
    doc.text('offener Urlaubsanspruch:', margin + 5, calcY)
    doc.setTextColor(30, 41, 59)
    doc.text(`${balanceOld} Arbeitstage`, rightColX, calcY, { align: 'right' })

    // Deduction
    calcY += 9
    doc.setTextColor(100, 116, 139)
    doc.text('angesuchter Urlaub:', margin + 5, calcY)
    doc.setTextColor(220, 38, 38) // red-600
    doc.text(`- ${durationDays} Arbeitstage`, rightColX, calcY, { align: 'right' })

    // Separator
    calcY += 5
    doc.setDrawColor(203, 213, 225)
    doc.setLineWidth(0.2)
    doc.line(margin + 5, calcY, rightColX, calcY)

    // Remaining
    calcY += 9
    doc.setTextColor(15, 23, 42)
    doc.setFont(undefined, 'bold')
    doc.text('verbleibender Rest:', margin + 5, calcY)
    doc.setTextColor(21, 128, 61) // green-700
    doc.text(`${remaining} Arbeitstage`, rightColX, calcY, { align: 'right' })

    // =========================================================================
    // SIGNATURE BOX (same style as Arbeitszeitaufzeichnung)
    // =========================================================================
    yPos = 210 // Fixed position near bottom
    if (yPos + 45 > pageHeight - 20) {
        doc.addPage()
        yPos = margin
    }

    doc.setFillColor(248, 250, 252)
    doc.setDrawColor(203, 213, 225)
    doc.roundedRect(margin, yPos, contentWidth, 38, 2, 2, 'FD')

    // Header
    doc.setFontSize(10)
    doc.setTextColor(15, 23, 42)
    doc.setFont(undefined, 'bold')
    doc.text('DIGITAL SIGNIERT & VERIFIZIERT', margin + 5, yPos + 7)

    // Separator
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.3)
    doc.line(margin, yPos + 11, margin + contentWidth, yPos + 11)

    // Helper styles
    const drawSigLabel = (txt, x, y) => {
        doc.setFontSize(8)
        doc.setFont(undefined, 'normal')
        doc.setTextColor(100, 116, 139)
        doc.text(txt, x, y)
    }
    const drawSigValue = (txt, x, y) => {
        doc.setFontSize(9)
        doc.setFont(undefined, 'bold')
        doc.setTextColor(51, 65, 85)
        doc.text(txt || '-', x, y)
    }

    const col1X = margin + 5
    const col1ValX = margin + 34
    const col2X = margin + 92
    const col2ValX = margin + 120

    let sigY = yPos + 16

    // Row 1: Eingereicht von / Genehmigt von
    drawSigLabel('Eingereicht von:', col1X, sigY)
    drawSigValue(employeeName, col1ValX, sigY)
    drawSigLabel('Genehmigt von:', col2X, sigY)
    drawSigValue(approval?.approverName || 'Administrator', col2ValX, sigY)

    sigY += 7

    // Row 2: Signiert am / Genehmigt am
    drawSigLabel('Signiert am:', col1X, sigY)
    if (signature?.signed_at) {
        drawSigValue(format(new Date(signature.signed_at), 'dd.MM.yyyy HH:mm') + ' Uhr', col1ValX, sigY)
    } else {
        drawSigValue('Bei Antragstellung', col1ValX, sigY)
    }
    drawSigLabel('Genehmigt am:', col2X, sigY)
    if (approval?.approvedAt) {
        drawSigValue(format(new Date(approval.approvedAt), 'dd.MM.yyyy HH:mm') + ' Uhr', col2ValX, sigY)
    } else {
        drawSigValue('-', col2ValX, sigY)
    }

    sigY += 7

    // Row 3: Hash
    drawSigLabel('Integritäts-Hash:', col1X, sigY)
    doc.setFontSize(8)
    doc.setFont('courier', 'normal')
    doc.setTextColor(71, 85, 105)
    doc.text(signature?.hash || request.data_hash || '-', col1ValX + 2, sigY)
    doc.setFont('helvetica', 'normal')

    // =========================================================================
    // FOOTER
    // =========================================================================
    const footerY = pageHeight - 15
    doc.setFontSize(9)
    doc.setTextColor(148, 163, 184)
    doc.text(`DOWAS Chill Out - Internes Dokument - REF-ID #${request.id || 'N/A'}`, margin, footerY)
    doc.text(
        `Erstellt am ${format(new Date(), 'dd.MM.yyyy')} um ${format(new Date(), 'HH:mm')} Uhr`,
        pageWidth - margin,
        footerY,
        { align: 'right' }
    )

    // =========================================================================
    // SAVE
    // =========================================================================
    const filename = `Urlaubsantrag_${employeeName.replace(/\s+/g, '_')}_${request.start_date}.pdf`
    doc.save(filename)

    return filename
}
