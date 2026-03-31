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
import { format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { findSnapshotEntry, calculateCorrection } from './pdfGenerator'
import { getShiftSegments } from './timeCalculations'

/**
 * Helper: Convert time to industrial format with zero-padded hours
 * 09:30 → "09,50" | 13:45 → "13,75"
 * Robust: handles ISO strings, HH:MM, HH.MM, HHMM, already-formatted 09,50
 */
const timeToDecimal = (timeStr, isEndTime = false) => {
    if (!timeStr) return ''
    const cleaned = String(timeStr).trim()

    // Already formatted as HH,MM
    if (cleaned.includes(',')) {
        const parts = cleaned.split(',')
        const result = `${parts[0].padStart(2, '0')},${parts[1]}`
        if (isEndTime && result === '00,00') return '24,00'
        return result
    }

    // ISO string or timestamp
    if (cleaned.includes('T') || (cleaned.includes('-') && cleaned.includes(':'))) {
        try {
            const date = parseISO(cleaned)
            const hours = date.getHours()
            const minutes = date.getMinutes()
            if (isEndTime && hours === 0 && minutes === 0) return '24,00'
            const decMinutes = Math.round((minutes / 60) * 100).toString().padStart(2, '0')
            return `${String(hours).padStart(2, '0')},${decMinutes}`
        } catch { /* fall through */ }
    }

    // HH:MM or HH.MM or HHMM format
    const matches = cleaned.match(/(\d{1,2})[:.]?(\d{2})/)
    if (matches) {
        if (isEndTime && parseInt(matches[1], 10) === 0 && parseInt(matches[2], 10) === 0) return '24,00'
        const decMinutes = Math.round((parseInt(matches[2], 10) / 60) * 100).toString().padStart(2, '0')
        return `${matches[1].padStart(2, '0')},${decMinutes}`
    }

    return cleaned
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
 * Helper: Pair consecutive WORK and STANDBY segments into rows
 * Strategy: When we see a WORK segment, hold it. When we see STANDBY, pair them.
 * If another WORK comes before STANDBY is flushed, save the pair and start fresh.
 */
const buildLines = (segments) => {
    const lines = []
    let current = { work: null, standby: null, note: '' }

    segments.forEach(seg => {
        if (seg.type === 'WORK') {
            // If we already have a WORK, we must have incomplete pair — flush it first
            if (current.work !== null) {
                lines.push(current)
                current = { work: null, standby: null, note: '' }
            }
            current.work = seg
            current.note = seg.note || ''
        } else {
            // STANDBY
            if (current.standby !== null) {
                // Already have a STANDBY — flush pair first
                lines.push(current)
                current = { work: null, standby: null, note: '' }
            }
            current.standby = seg
        }
    })

    // Flush remaining
    if (current.work !== null || current.standby !== null) {
        lines.push(current)
    }

    return lines
}

/** Build a single PDF row for a night-shift segment line, with optional correction comparison */
const buildSegmentRow = (line, lineIdx, origLines, shiftType, isFlex, correction, dayStr, isSickEntry = false) => {
    const intNote = line.note || ''
    let intCorrection = null

    if (origLines && line.work) {
        const origWorkLine = origLines[lineIdx]
        if (origWorkLine?.work) {
            const origAzVon = timeToDecimal(origWorkLine.work.start.toISOString())
            const origAzBis = timeToDecimal(origWorkLine.work.end.toISOString(), true)
            const curAzVon = timeToDecimal(line.work.start.toISOString())
            const curAzBis = timeToDecimal(line.work.end.toISOString(), true)
            if (origAzVon !== curAzVon || origAzBis !== curAzBis) {
                intCorrection = {
                    originalStart: origWorkLine.work.start.toISOString(),
                    originalEnd: origWorkLine.work.end.toISOString(),
                    currentStart: line.work.start.toISOString(),
                    currentEnd: line.work.end.toISOString()
                }
            }
        } else {
            intCorrection = { isNew: true }
        }
    }

    const isFirst = lineIdx === 0
    const anm = isFirst
        ? [isSickEntry ? 'KRANK' : '', isFlex ? 'FLEX' : '', correction?.adminNote?.substring(0, 24) || ''].filter(Boolean).join(' ')
        : ''

    return {
        datum:      isFirst ? getDayNumber(dayStr) : '',
        tag:        isFirst ? getDayAbbr(dayStr) : '',
        diensttyp:  isFirst ? shiftType : '',
        azVon:      line.work    ? timeToDecimal(line.work.start.toISOString()) : '',
        azBis:      line.work    ? timeToDecimal(line.work.end.toISOString(), true) : '',
        bzVon:      line.standby ? timeToDecimal(line.standby.start.toISOString()) : '',
        bzBis:      line.standby ? timeToDecimal(line.standby.end.toISOString(), true) : '',
        correction: isFirst ? correction : null,
        anm,
        intNote,
        intCorrection,
    }
}

/**
 * Pre-process entries into PDF row objects
 * For ND shifts: expands into multiple rows (one per segment pair)
 * For regular shifts: single row
 *
 * Returns array of row objects with: { datum, tag, diensttyp, azVon, azBis, bzVon, bzBis, correction, anm }
 */
const buildPdfRows = (entries, correctionMap) => {
    const rows = []

    entries.forEach(entry => {
        const shift = entry.shifts
        const shiftType = shift?.type || entry.absences?.type || ''
        const isFlex = entry.is_flex === true
        const isNight = shiftType?.toUpperCase() === 'ND' ||
                        shiftType?.toLowerCase().includes('nacht') ||
                        shift?.is_bereitschaft

        const dayStr = entry.actual_start || entry.entry_date
        const correction = correctionMap[entry.id]

        if (isNight && entry.actual_start && entry.actual_end) {
            // Night shift: expand into segment-pair rows
            const segments = getShiftSegments(
                entry.actual_start, entry.actual_end,
                shiftType, entry.interruptions || []
            )
            const lines = buildLines(segments)

            // Build original segment lines for comparison if interruptions were corrected
            let origLines = null
            if (correction?.interruptionsChanged && Array.isArray(correction.originalInterruptions)) {
                const origSegments = getShiftSegments(
                    correction.originalStart || entry.actual_start,
                    correction.originalEnd || entry.actual_end,
                    shiftType, correction.originalInterruptions
                )
                origLines = buildLines(origSegments)
            }

            const isSickND = entry.absences?.type === 'Krank' || entry.absences?.type === 'Krankenstand'
            lines.forEach((line, lineIdx) => {
                rows.push(buildSegmentRow(line, lineIdx, origLines, shiftType, isFlex, correction, dayStr, isSickND))
            })
        } else {
            // Regular entry (TD1, TD2, TEAM, Krank, Urlaub, etc.)
            const isSickEntry = entry.absences?.type === 'Krank' || entry.absences?.type === 'Krankenstand'
            rows.push({
                datum:     getDayNumber(dayStr),
                tag:       getDayAbbr(dayStr),
                diensttyp: shiftType,
                azVon:     timeToDecimal(entry.actual_start),
                azBis:     timeToDecimal(entry.actual_end, true),
                bzVon:     '',
                bzBis:     '',
                correction: correction || null,
                anm:       [isSickEntry ? 'KRANK' : '', isFlex ? 'FLEX' : '', correction?.adminNote?.substring(0, 24) || ''].filter(Boolean).join(' '),
            })
        }
    })

    return rows
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
    // MAIN TITLE
    // =========================================================================
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 41, 59)
    doc.text('Arbeitszeitaufzeichnung Chill Out', margin, yPos + 6)
    yPos += 14

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
        anm: margin + 137
    }

    const rowHeight = 7

    // Column center points for alignment
    const colCenter = {
        datum: (colX.datum + colX.tag) / 2,
        tag: (colX.tag + colX.dienst) / 2,
        dienst: (colX.dienst + colX.azVon) / 2,
    }

    const drawTableHeader = () => {
        // Header row 1: Group titles
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.setTextColor(100, 116, 139)

        doc.text('Arbeitszeit', colX.azVon + 10, yPos, { align: 'center' })
        doc.text('Bereitschaftszeit', colX.bzVon + 10, yPos, { align: 'center' })

        yPos += 4

        // Header row 2: Column names
        doc.setFontSize(8)
        doc.text('Datum', colCenter.datum, yPos, { align: 'center' })
        doc.text('Tag', colCenter.tag, yPos, { align: 'center' })
        doc.text('Dienst', colCenter.dienst, yPos, { align: 'center' })
        doc.text('Von', colX.azVon, yPos)
        doc.text('Bis', colX.azBis, yPos)
        doc.text('Von', colX.bzVon, yPos)
        doc.text('Bis', colX.bzBis, yPos)
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
    const drawCorrectedTime = (x, y, originalISO, currentISO, isEndTime = false) => {
        const original = timeToDecimal(originalISO, isEndTime)
        const corrected = timeToDecimal(currentISO, isEndTime)

        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        const w1 = doc.getTextWidth(original)
        doc.setFontSize(11)
        doc.setFont('helvetica', 'bold')
        const w2 = doc.getTextWidth(corrected)

        const gap = 1.5
        const centerX = x + 10
        const startX = centerX - (w1 + gap + w2) / 2

        // Original grau durchgestrichen
        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(148, 163, 184)
        doc.text(original, startX, y)
        doc.setDrawColor(148, 163, 184)
        doc.setLineWidth(0.3)
        doc.line(startX - 0.5, y - 1.2, startX + w1 + 0.5, y - 1.2)

        // Korrektur rot fett
        doc.setFontSize(11)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(220, 38, 38)
        doc.text(corrected, startX + w1 + gap, y)

        // Reset to default row style
        doc.setTextColor(0, 0, 0)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
    }

    // =========================================================================
    // TABLE ROWS
    // =========================================================================
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)

    // Pre-process: expand ND entries into multiple row objects
    const pdfRows = buildPdfRows(sortedEntries, correctionMap)

    pdfRows.forEach((row, rowIndex) => {
        // Page break
        if (yPos > 270) {
            doc.addPage()
            yPos = margin + 10
            yPos = drawTableHeader()
        }

        // Zebra striping — full row height
        if (rowIndex % 2 === 0) {
            doc.setFillColor(244, 249, 255)
            doc.rect(margin, yPos, contentWidth, rowHeight, 'F')
        }

        // Vertically centered text position within the row
        const textY = yPos + rowHeight * 0.65

        doc.setTextColor(0, 0, 0)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)

        // Datum, Tag, Dienst (empty for continuation rows of ND) — centered
        doc.text(row.datum, colCenter.datum, textY, { align: 'center' })
        doc.text(row.tag, colCenter.tag, textY, { align: 'center' })
        const DIENST_LABELS = {
            MITARBEITERGESPRAECH: 'MA-Gespr.',
            FORTBILDUNG: 'Fortbild.',
            EINSCHULUNG: 'Einschul.',
            TEAMSITZUNG: 'Teamsitz.',
            SUPERVISION: 'Supervis.',
        }
        let displayType = DIENST_LABELS[row.diensttyp?.toUpperCase()] || row.diensttyp
        if (displayType && displayType.length > 12) {
            displayType = displayType.substring(0, 10) + '..'
        }
        doc.text(displayType, colCenter.dienst, textY, { align: 'center' })

        // Granular field-level correction comparison
        const startChanged = row.correction?.originalStart && row.correction.originalStart !== row.correction.currentStart
        const endChanged = row.correction?.originalEnd && row.correction.originalEnd !== row.correction.currentEnd

        // AZ Von (Arbeitszeit) — check entry-level correction OR interruption-level correction
        if (startChanged && row.azVon) {
            drawCorrectedTime(colX.azVon, textY, row.correction.originalStart, row.correction.currentStart)
        } else if (row.intCorrection && !row.intCorrection.isNew && row.azVon) {
            drawCorrectedTime(colX.azVon, textY, row.intCorrection.originalStart, row.intCorrection.currentStart)
        } else {
            doc.text(row.azVon, colX.azVon, textY)
        }

        // AZ Bis (Arbeitszeit) — check entry-level correction OR interruption-level correction
        if (endChanged && row.azBis) {
            drawCorrectedTime(colX.azBis, textY, row.correction.originalEnd, row.correction.currentEnd, true)
        } else if (row.intCorrection && !row.intCorrection.isNew && row.azBis) {
            drawCorrectedTime(colX.azBis, textY, row.intCorrection.originalEnd, row.intCorrection.currentEnd, true)
        } else {
            doc.text(row.azBis, colX.azBis, textY)
        }

        // BZ Von/Bis (Bereitschaft) — no corrections on BZ
        doc.text(row.bzVon, colX.bzVon, textY)
        doc.text(row.bzBis, colX.bzBis, textY)

        // Admin note (only on first row of entry) or interruption note
        if (row.anm) {
            doc.setFontSize(8)
            doc.setTextColor(150, 100, 0)
            doc.text(row.anm, colX.anm, textY)
            doc.setTextColor(0, 0, 0)
            doc.setFontSize(9)
        } else if (row.intNote) {
            doc.setFontSize(7)
            doc.setTextColor(80, 80, 80)
            doc.text(row.intNote.substring(0, 24), colX.anm, textY)
            doc.setTextColor(0, 0, 0)
            doc.setFontSize(9)
        }

        // Soft divider at bottom of row
        doc.setDrawColor(241, 245, 249)
        doc.setLineWidth(0.2)
        doc.line(margin, yPos + rowHeight, pageWidth - margin, yPos + rowHeight)

        yPos += rowHeight
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
