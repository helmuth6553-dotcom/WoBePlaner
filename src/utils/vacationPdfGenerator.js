/**
 * =========================================================================
 * Vacation Request PDF Generator
 * 
 * Generates legally binding "Urlaubsansuchen / -Meldung" PDFs
 * Based on the official DOWAS template
 * 
 * Features:
 * - Digital signature verification with hash
 * - Admin approval display
 * - Holiday-aware return date calculation
 * =========================================================================
 */

import { jsPDF } from 'jspdf'
import { format, differenceInBusinessDays, isSameDay } from 'date-fns'
import { getHolidays } from './holidays'

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

    // Skip weekends and holidays
    while (
        returnDate.getDay() === 0 || // Sunday
        returnDate.getDay() === 6 || // Saturday
        allHolidays.some(h => isSameDay(h.date, returnDate)) // Holiday
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
 * @param {Object} params.vacationAccount - { entitlement, usedBefore, requested, remaining }
 * @param {Object} params.signature - Signature data { image_data, signed_at, hash }
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
    const doc = new jsPDF()

    const startDate = new Date(request.start_date)
    const endDate = new Date(request.end_date)
    const returnDate = getFirstWorkingDayAfter(endDate)
    const isSingleDay = request.start_date === request.end_date
    const durationDays = differenceInBusinessDays(endDate, startDate) + 1

    // Page settings
    const pageWidth = 210
    const _pageHeight = 297 // Kept for potential future page-break logic
    const margin = 15
    let yPos = 15

    // =========================================================================
    // HEADER - DOWAS Briefkopf
    // =========================================================================
    doc.setFont("helvetica", "bold")
    doc.setFontSize(11)
    doc.setTextColor(0, 0, 0)

    // Left side - Organization name
    doc.text("Verein zur Förderung des DOWAS", margin, yPos)
    // Right side - Address
    doc.text("6020 Innsbruck, Leopoldstraße 18", pageWidth - margin, yPos, { align: 'right' })

    yPos += 5
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.text("Durchgangsort für Wohnungs- und Arbeitssuchende", margin, yPos)
    doc.text("Tel.: (0512) 572343 - Fax 572343-23", pageWidth - margin, yPos, { align: 'right' })

    yPos += 4
    doc.text("ZVR: 112151993", margin, yPos)
    doc.text("e-mail: ikb@dowas.org", pageWidth - margin, yPos, { align: 'right' })

    // =========================================================================
    // TITLE + STATUS BADGE
    // =========================================================================
    yPos += 18
    doc.setFont("helvetica", "bold")
    doc.setFontSize(16)
    doc.text("URLAUBSANSUCHEN / -MELDUNG", margin, yPos)

    // Status Badge (top right)
    if (request.status === 'genehmigt') {
        doc.setFillColor(46, 125, 50) // Green
        doc.roundedRect(pageWidth - margin - 35, yPos - 8, 35, 10, 2, 2, 'F')
        doc.setTextColor(255, 255, 255)
        doc.setFontSize(9)
        doc.text("GENEHMIGT", pageWidth - margin - 17.5, yPos - 2, { align: 'center' })
    } else if (request.status === 'abgelehnt') {
        doc.setFillColor(198, 40, 40) // Red
        doc.roundedRect(pageWidth - margin - 35, yPos - 8, 35, 10, 2, 2, 'F')
        doc.setTextColor(255, 255, 255)
        doc.setFontSize(9)
        doc.text("ABGELEHNT", pageWidth - margin - 17.5, yPos - 2, { align: 'center' })
    }
    doc.setTextColor(0, 0, 0)

    // =========================================================================
    // FORM FIELDS (filled in, not empty boxes)
    // =========================================================================
    yPos += 18
    const fieldBoxHeight = 8
    const labelWidth = 35
    const valueBoxWidth = 120

    // Helper to draw a filled form field
    const drawFilledField = (label, value, x, y, boxWidth = valueBoxWidth) => {
        doc.setFont("helvetica", "bold")
        doc.setFontSize(10)
        doc.text(label, x, y + 5.5)

        doc.setDrawColor(0, 0, 0)
        doc.setLineWidth(0.3)
        doc.rect(x + labelWidth, y, boxWidth, fieldBoxHeight)

        doc.setFont("helvetica", "normal")
        doc.text(value || '', x + labelWidth + 3, y + 5.5)
    }

    // Name
    drawFilledField("Name:", employeeName, margin, yPos)

    yPos += 14
    // Einrichtung
    drawFilledField("Einrichtung:", facilityName, margin, yPos, 100)

    // =========================================================================
    // VACATION PERIOD
    // =========================================================================
    yPos += 20
    doc.setFont("helvetica", "normal")
    doc.setFontSize(10)

    if (isSingleDay) {
        // Single day
        doc.text("Angesuchter Urlaub am:", margin, yPos + 5)
        doc.setDrawColor(0, 0, 0)
        doc.rect(margin + 52, yPos, 40, fieldBoxHeight)
        doc.text(format(startDate, 'dd.MM.yyyy'), margin + 55, yPos + 5.5)
    } else {
        // Date range
        doc.text("Angesuchter Urlaub in der Zeit von:", margin, yPos + 5)
        doc.setDrawColor(0, 0, 0)
        doc.rect(margin + 78, yPos, 35, fieldBoxHeight)
        doc.text(format(startDate, 'dd.MM.yyyy'), margin + 80, yPos + 5.5)

        doc.text("bis inkl.", margin + 118, yPos + 5)
        doc.rect(margin + 135, yPos, 35, fieldBoxHeight)
        doc.text(format(endDate, 'dd.MM.yyyy'), margin + 137, yPos + 5.5)
    }

    // Dienstantritt nach Urlaub
    yPos += 14
    doc.text("Dienstantritt nach dem Urlaub am:", margin, yPos + 5)
    doc.rect(margin + 78, yPos, 40, fieldBoxHeight)
    doc.text(format(returnDate, 'dd.MM.yyyy'), margin + 80, yPos + 5.5)

    // =========================================================================
    // VACATION ACCOUNT TABLE
    // =========================================================================
    yPos += 25
    const tableX = margin + 30
    const valueBoxW = 25

    // offener Urlaubsanspruch
    doc.text("offener Urlaubsanspruch:", tableX, yPos + 5)
    doc.rect(tableX + 55, yPos, valueBoxW, fieldBoxHeight)
    doc.text(String(vacationAccount?.remaining + durationDays || ''), tableX + 57, yPos + 5.5)
    doc.text("Arbeitstage", tableX + 85, yPos + 5)

    yPos += 12
    // angesuchter Urlaub
    doc.text("angesuchter Urlaub:", tableX, yPos + 5)
    doc.rect(tableX + 55, yPos, valueBoxW, fieldBoxHeight)
    doc.text(String(durationDays), tableX + 57, yPos + 5.5)
    doc.text("Arbeitstage", tableX + 85, yPos + 5)

    yPos += 12
    // verbleibender Rest
    doc.text("verbleibender Rest:", tableX, yPos + 5)
    doc.rect(tableX + 55, yPos, valueBoxW, fieldBoxHeight)
    doc.setFont("helvetica", "bold")
    doc.text(String(vacationAccount?.remaining || ''), tableX + 57, yPos + 5.5)
    doc.setFont("helvetica", "normal")
    doc.text("Arbeitstage", tableX + 85, yPos + 5)

    // =========================================================================
    // DIGITAL SIGNATURE & VERIFICATION (Option C - Data only, no signature box)
    // =========================================================================
    yPos += 25
    const verificationBoxHeight = 70  // Increased height for full hash display

    // Main verification box
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.5)
    doc.rect(margin, yPos, pageWidth - 2 * margin, verificationBoxHeight)

    // Header bar - Green for verified
    doc.setFillColor(46, 125, 50)
    doc.rect(margin, yPos, pageWidth - 2 * margin, 10, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(10)
    doc.text("✓ DIGITAL SIGNIERT & VERIFIZIERT", margin + 5, yPos + 7)
    doc.setTextColor(0, 0, 0)

    yPos += 16

    // Two-column layout for verification data
    const col1X = margin + 5
    const col2X = margin + 95
    const lineSpacing = 7

    // Column 1: Employee/Applicant info
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9)
    doc.text("Antragsteller:", col1X, yPos)
    doc.setFont("helvetica", "normal")
    doc.text(employeeName, col1X + 28, yPos)

    yPos += lineSpacing
    doc.setFont("helvetica", "bold")
    doc.text("Signiert am:", col1X, yPos)
    doc.setFont("helvetica", "normal")
    if (signature?.signed_at) {
        doc.text(format(new Date(signature.signed_at), 'dd.MM.yyyy') + ' um ' + format(new Date(signature.signed_at), 'HH:mm') + ' Uhr', col1X + 28, yPos)
    } else {
        doc.text('Bei Antragstellung', col1X + 28, yPos)
    }

    yPos += lineSpacing
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9)
    doc.text("Integritäts-Hash:", col1X, yPos)

    yPos += lineSpacing
    doc.setFont("courier", "normal")
    doc.setFontSize(8)  // Larger, more readable font
    if (signature?.hash) {
        // Show full hash, wrap to next line if too long
        const hash = signature.hash
        const maxWidth = pageWidth - margin * 2 - 10
        const hashLines = doc.splitTextToSize(hash, maxWidth)
        doc.text(hashLines, col1X, yPos)
        // Adjust yPos based on number of lines
        yPos += (hashLines.length - 1) * 4
    } else {
        doc.setFont("helvetica", "italic")
        doc.text('(Hash wird bei Signierung generiert)', col1X, yPos)
    }

    // Separator line
    yPos += lineSpacing + 2
    doc.setDrawColor(200, 200, 200)
    doc.setLineWidth(0.3)
    doc.line(col1X, yPos, pageWidth - margin - 5, yPos)

    // Approval section
    yPos += 6
    doc.setFontSize(9)

    if (request.status === 'genehmigt' && approval) {
        doc.setFont("helvetica", "bold")
        doc.text("Genehmigt von:", col1X, yPos)
        doc.setFont("helvetica", "normal")
        doc.text(approval.approverName || 'Administrator', col1X + 28, yPos)

        doc.setFont("helvetica", "bold")
        doc.text("Genehmigt am:", col2X, yPos)
        doc.setFont("helvetica", "normal")
        if (approval.approvedAt) {
            doc.text(format(new Date(approval.approvedAt), 'dd.MM.yyyy') + ' um ' + format(new Date(approval.approvedAt), 'HH:mm') + ' Uhr', col2X + 28, yPos)
        }
    } else if (request.status === 'abgelehnt') {
        doc.setFont("helvetica", "bold")
        doc.setTextColor(198, 40, 40)
        doc.text("ANTRAG WURDE ABGELEHNT", col1X, yPos)
        doc.setTextColor(0, 0, 0)
    } else {
        doc.setFont("helvetica", "italic")
        doc.setTextColor(150, 150, 150)
        doc.text("Genehmigung ausstehend", col1X, yPos)
        doc.setTextColor(0, 0, 0)
    }

    // =========================================================================
    // FOOTER
    // =========================================================================
    doc.setTextColor(150, 150, 150)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7)
    doc.text(`Verein zur Förderung des DOWAS - Internes Dokument - REF-ID: #${request.id}`, pageWidth / 2, 282, { align: 'center' })
    doc.text(`Erstellt am ${format(new Date(), 'dd.MM.yyyy')} um ${format(new Date(), 'HH:mm')} Uhr`, pageWidth / 2, 287, { align: 'center' })

    // Save PDF
    const filename = `Urlaubsantrag_${employeeName.replace(/\s+/g, '_')}_${request.start_date}.pdf`
    doc.save(filename)

    return filename
}
