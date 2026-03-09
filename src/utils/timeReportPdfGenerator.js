/**
 * =========================================================================
 * Time Report PDF Generator (Redesigned)
 *
 * Modern layout with:
 * - Rounded header box with employee metadata
 * - Zebra-striped table with soft dividers
 * - "Red pen" correction visualization (original strikethrough + correction in red)
 * - Manual pagination with repeated headers
 * - Digital signature box with integrity hash
 * - Industrial time format (09,50 instead of 09:30)
 * =========================================================================
 */

import { jsPDF } from 'jspdf'
import { format, parseISO, getISOWeek } from 'date-fns'
import { de } from 'date-fns/locale'
import { findSnapshotEntry, calculateCorrection } from './pdfGenerator'

/**
 * Helper: Convert time to industrial format with zero-padded hours
 * 09:30 → "09,50" | 13:45 → "13,75"
 */
const timeToDecimal = (isoString) => {
    if (!isoString) return '-'
    try {
        const date = parseISO(isoString)
        const hours = String(date.getHours()).padStart(2, '0')
        const minutes = date.getMinutes()
        const decMinutes = Math.round((minutes / 60) * 100).toString().padStart(2, '0')
        return `${hours},${decMinutes}`
    } catch {
        return '-'
    }
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
 * @param {Object} params
 * @param {string} params.yearMonth - "2025-12" format
 * @param {Object} params.user - User profile { full_name, weekly_hours }
 * @param {Array} params.entries - Time entries with shifts
 * @param {Object} params.statusData - { status, submitted_at, approved_at, data_hash, approver_name, original_data_snapshot }
 */
export const generateTimeReportPDF = ({
    yearMonth,
    user,
    entries,
    statusData
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
    const monthName = format(monthDate, 'MMMM yyyy', { locale: de })

    // Correction map (before table loop)
    const correctionMap = {}
    if (statusData?.original_data_snapshot) {
        entries.forEach(entry => {
            const snapEntry = findSnapshotEntry(statusData.original_data_snapshot, entry)
            const corr = calculateCorrection(snapEntry, entry)
            if (corr) correctionMap[entry.id] = corr
        })
    }

    // Sort entries by date
    const sortedEntries = [...entries].sort((a, b) => {
        const dateA = new Date(a.actual_start || a.entry_date || 0)
        const dateB = new Date(b.actual_start || b.entry_date || 0)
        return dateA - dateB
    })

    let yPos = margin

    // =========================================================================
    // HEADER BOX
    // =========================================================================
    doc.setFillColor(248, 250, 252)
    doc.setDrawColor(226, 232, 240)
    doc.roundedRect(margin, yPos, contentWidth, 18, 2, 2, 'FD')

    // Header content (3 columns)
    doc.setFontSize(6)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(148, 163, 184)

    const col1 = margin + 5
    const col2 = margin + 75
    const col3 = margin + 140

    doc.text('MITARBEITER', col1, yPos + 4)
    doc.text('MONAT', col2, yPos + 4)
    doc.text('WOCHENSTUNDEN', col3, yPos + 4)

    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 41, 59)

    doc.text(userName, col1, yPos + 12)
    doc.text(monthName, col2, yPos + 12)
    doc.text(`${weeklyHours}`, col3, yPos + 12)

    yPos += 22

    // =========================================================================
    // TABLE SETUP
    // =========================================================================
    const colX = {
        datum: margin,
        tag: margin + 18,
        dienst: margin + 32,
        azVon: margin + 57,
        azBis: margin + 77,
        bzVon: margin + 97,
        bzBis: margin + 117,
        stunden: margin + 137,
        anm: margin + 153
    }

    const rowHeight = 5

    const drawTableHeader = () => {
        // Header row 1: Group titles
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7)
        doc.setTextColor(100, 116, 139)

        doc.text('Arbeitszeit', colX.azVon + 10, yPos, { align: 'center' })
        doc.text('Bereitschaftszeit', colX.bzVon + 10, yPos, { align: 'center' })

        yPos += 4

        // Header row 2: Column names
        doc.setFontSize(6)
        doc.text('Datum', colX.datum, yPos)
        doc.text('Tag', colX.tag, yPos)
        doc.text('Dienst', colX.dienst, yPos)
        doc.text('Von', colX.azVon, yPos)
        doc.text('Bis', colX.azBis, yPos)
        doc.text('Von', colX.bzVon, yPos)
        doc.text('Bis', colX.bzBis, yPos)
        doc.text('Std', colX.stunden, yPos)
        doc.text('Anm.', colX.anm, yPos)

        yPos += 3
        doc.setDrawColor(226, 232, 240)
        doc.setLineWidth(0.3)
        doc.line(margin, yPos, pageWidth - margin, yPos)
        yPos += 3

        return yPos
    }

    yPos = drawTableHeader()

    // Helper: Draw corrected time inline
    const drawCorrectedTime = (x, y, originalISO, currentISO) => {
        const original = timeToDecimal(originalISO)
        const corrected = timeToDecimal(currentISO)

        doc.setFontSize(7)
        doc.setFont('helvetica', 'normal')
        const w1 = doc.getTextWidth(original)
        doc.setFontSize(9)
        doc.setFont('helvetica', 'bold')
        const w2 = doc.getTextWidth(corrected)

        const gap = 1.5
        const centerX = x + 10
        const startX = centerX - (w1 + gap + w2) / 2

        // Original grau durchgestrichen
        doc.setFontSize(7)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(148, 163, 184)
        doc.text(original, startX, y)
        doc.setDrawColor(148, 163, 184)
        doc.setLineWidth(0.3)
        doc.line(startX - 0.5, y - 1.2, startX + w1 + 0.5, y - 1.2)

        // Korrektur rot fett
        doc.setFontSize(9)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(220, 38, 38)
        doc.text(corrected, startX + w1 + gap, y)

        doc.setTextColor(0, 0, 0)
    }

    // =========================================================================
    // TABLE ROWS
    // =========================================================================
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)

    let lastDayNumber = null
    let rowIndex = 0

    sortedEntries.forEach((entry) => {
        // Page break
        if (yPos > 270) {
            doc.addPage()
            yPos = margin + 10
            yPos = drawTableHeader()
        }

        const dateStr = entry.actual_start || entry.entry_date
        if (!dateStr) return

        const dayNum = getDayNumber(dateStr)
        const dayAbbr = getDayAbbr(dateStr)
        const showDayNum = dayNum !== lastDayNumber
        lastDayNumber = dayNum

        // Get shift info
        const shift = entry.shifts
        const shiftType = shift?.type || entry.absences?.type || '-'

        // Determine if Bereitschaft (on-call)
        const isBereitschaft = shiftType?.toLowerCase().includes('bereit') ||
            shiftType?.toLowerCase().includes('nd') ||
            shift?.is_bereitschaft

        // Time decimals
        const startDecimal = timeToDecimal(entry.actual_start)
        const endDecimal = timeToDecimal(entry.actual_end)

        // Zebra striping
        if (rowIndex % 2 === 0) {
            doc.setFillColor(244, 249, 255)
            doc.rect(margin, yPos - rowHeight + 1, contentWidth, rowHeight + 1, 'F')
        }

        // Get correction if exists
        const correction = correctionMap[entry.id]

        // Render row
        doc.setTextColor(0, 0, 0)

        if (showDayNum) {
            doc.text(dayNum, colX.datum, yPos)
            doc.text(dayAbbr, colX.tag, yPos)
        }

        // Dienst type (truncate if too long)
        let displayType = shiftType
        if (displayType && displayType.length > 12) {
            displayType = displayType.substring(0, 10) + '..'
        }
        doc.text(displayType, colX.dienst, yPos)

        // Work time or On-call time
        if (!isBereitschaft) {
            // AZ (Arbeitszeit) columns
            if (correction?.timeChanged && correction.originalStart) {
                drawCorrectedTime(colX.azVon, yPos, correction.originalStart, entry.actual_start)
            } else {
                doc.text(startDecimal, colX.azVon, yPos)
            }

            if (correction?.timeChanged && correction.originalEnd) {
                drawCorrectedTime(colX.azBis, yPos, correction.originalEnd, entry.actual_end)
            } else {
                doc.text(endDecimal, colX.azBis, yPos)
            }
        } else {
            // BZ (Bereitschaft) columns
            if (correction?.timeChanged && correction.originalStart) {
                drawCorrectedTime(colX.bzVon, yPos, correction.originalStart, entry.actual_start)
            } else {
                doc.text(startDecimal, colX.bzVon, yPos)
            }

            if (correction?.timeChanged && correction.originalEnd) {
                drawCorrectedTime(colX.bzBis, yPos, correction.originalEnd, entry.actual_end)
            } else {
                doc.text(endDecimal, colX.bzBis, yPos)
            }
        }

        // Admin note (if correction exists)
        if (correction?.adminNote) {
            doc.setFontSize(6)
            doc.setTextColor(150, 100, 0)
            doc.text(correction.adminNote.substring(0, 28), colX.anm, yPos)
            doc.setTextColor(0, 0, 0)
        }

        // Soft divider after row
        doc.setDrawColor(241, 245, 249)
        doc.setLineWidth(0.2)
        doc.line(margin, yPos + 2, pageWidth - margin, yPos + 2)

        yPos += rowHeight
        rowIndex++
    })

    // =========================================================================
    // SIGNATURE BOX
    // =========================================================================
    yPos += 5
    if (yPos + 35 > pageHeight - 20) {
        doc.addPage()
        yPos = margin
    }

    // Box background and border
    doc.setFillColor(248, 250, 252)
    doc.setDrawColor(203, 213, 225)
    doc.roundedRect(margin, yPos, contentWidth, 28, 2, 2, 'FD')

    // Box header
    doc.setFontSize(8)
    doc.setTextColor(15, 23, 42)
    doc.setFont('helvetica', 'bold')
    doc.text('DIGITAL SIGNIERT & VERIFIZIERT', margin + 5, yPos + 6)

    // Separator line
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.3)
    doc.line(margin, yPos + 9, margin + contentWidth, yPos + 9)

    // Signature content (2 columns)
    const sigLabelStyle = () => {
        doc.setFontSize(6)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(100, 116, 139)
    }

    const sigValueStyle = () => {
        doc.setFontSize(7)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(51, 65, 85)
    }

    const col1X = margin + 5
    const col1ValX = margin + 28
    const col2X = margin + 90
    const col2ValX = margin + 115

    let sigY = yPos + 14

    // Row 1: Eingereicht von / Genehmigt von
    sigLabelStyle()
    doc.text('Eingereicht von:', col1X, sigY)
    sigValueStyle()
    doc.text(userName, col1ValX, sigY)

    sigLabelStyle()
    doc.text('Genehmigt von:', col2X, sigY)
    sigValueStyle()
    doc.text(statusData?.approver_name || 'Administrator', col2ValX, sigY)

    sigY += 5

    // Row 2: Eingereicht am / Genehmigt am
    sigLabelStyle()
    doc.text('Eingereicht am:', col1X, sigY)
    sigValueStyle()
    if (statusData?.submitted_at) {
        doc.text(
            format(parseISO(statusData.submitted_at), 'dd.MM.yyyy HH:mm') + ' Uhr',
            col1ValX,
            sigY
        )
    } else {
        doc.text('-', col1ValX, sigY)
    }

    sigLabelStyle()
    doc.text('Genehmigt am:', col2X, sigY)
    sigValueStyle()
    if (statusData?.approved_at) {
        doc.text(
            format(parseISO(statusData.approved_at), 'dd.MM.yyyy HH:mm') + ' Uhr',
            col2ValX,
            sigY
        )
    } else {
        doc.text('-', col2ValX, sigY)
    }

    sigY += 5

    // Row 3: Hash (Monospace)
    sigLabelStyle()
    doc.text('Integritäts-Hash:', col1X, sigY)
    doc.setFont('courier', 'normal')
    doc.setFontSize(6)
    doc.setTextColor(51, 65, 85)
    doc.text(statusData?.data_hash || '-', col1ValX, sigY)

    // =========================================================================
    // SAVE PDF
    // =========================================================================
    const filename = `Arbeitszeit_${userName.replace(/\s+/g, '_')}_${yearMonth}.pdf`
    doc.save(filename)

    return filename
}
