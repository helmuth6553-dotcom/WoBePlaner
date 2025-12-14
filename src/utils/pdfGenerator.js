import { jsPDF } from 'jspdf'
import { format, parseISO, differenceInMinutes } from 'date-fns'
import { de } from 'date-fns/locale'
import { getShiftSegments } from './timeCalculations'

// Helper: Find matching snapshot entry for comparison
const findSnapshotEntry = (snapshot, entry) => {
    if (!snapshot || !Array.isArray(snapshot)) return null
    return snapshot.find(s =>
        s.id === entry.id ||
        (s.shift_id && s.shift_id === entry.shift_id) ||
        (s.absence_id && s.absence_id === entry.absence_id && s.entry_date === entry.entry_date)
    )
}

// Helper: Calculate correction diff between snapshot and current entry
const calculateCorrection = (snapEntry, entry) => {
    if (!snapEntry) return null
    const startChanged = snapEntry.actual_start !== entry.actual_start
    const endChanged = snapEntry.actual_end !== entry.actual_end
    const hoursChanged = Number(snapEntry.calculated_hours) !== Number(entry.calculated_hours)
    const intChanged = JSON.stringify(snapEntry.interruptions || []) !== JSON.stringify(entry.interruptions || [])

    if (!startChanged && !endChanged && !hoursChanged && !intChanged) return null

    return {
        entryId: entry.id,
        date: entry.actual_start || entry.entry_date,
        originalHours: Number(snapEntry.calculated_hours || 0),
        currentHours: Number(entry.calculated_hours || 0),
        hoursDiff: Number(entry.calculated_hours || 0) - Number(snapEntry.calculated_hours || 0),
        originalStart: snapEntry.actual_start,
        originalEnd: snapEntry.actual_end,
        currentStart: entry.actual_start,
        currentEnd: entry.actual_end,
        originalInterruptions: (snapEntry.interruptions || []).length,
        currentInterruptions: (entry.interruptions || []).length,
        adminNote: entry.admin_note,
        timeChanged: startChanged || endChanged,
        interruptionsChanged: intChanged
    }
}

// Helper: Render a correction comparison box
const renderCorrectionBox = (doc, correction, y, margin, pageWidth, safeFormatTime) => {
    const boxPadding = 3
    const lineHeight = 5
    const boxWidth = pageWidth - (margin * 2) - 20
    const boxX = margin + 20
    let boxY = y

    // Background box
    doc.setFillColor(255, 250, 240)  // Light orange background
    doc.setDrawColor(220, 180, 100)  // Orange border
    doc.roundedRect(boxX, boxY, boxWidth, 22, 2, 2, 'FD')

    boxY += boxPadding + 3
    doc.setFontSize(7)

    // Row 1: Original (Eingereicht)
    doc.setTextColor(100, 100, 100)
    const origStart = correction.originalStart ? safeFormatTime(correction.originalStart) : '--:--'
    const origEnd = correction.originalEnd ? safeFormatTime(correction.originalEnd) : '--:--'
    const origPausen = correction.originalInterruptions === 1 ? '1 Pause' : `${correction.originalInterruptions} Pausen`
    doc.text(`Eingereicht: ${origStart}-${origEnd}, ${origPausen} = ${correction.originalHours.toFixed(2)}h`, boxX + boxPadding, boxY)

    // Row 2: Current (Genehmigt)
    boxY += lineHeight
    doc.setTextColor(0, 100, 0)
    const currStart = correction.currentStart ? safeFormatTime(correction.currentStart) : '--:--'
    const currEnd = correction.currentEnd ? safeFormatTime(correction.currentEnd) : '--:--'
    const currPausen = correction.currentInterruptions === 1 ? '1 Pause' : `${correction.currentInterruptions} Pausen`
    doc.text(`Genehmigt:   ${currStart}-${currEnd}, ${currPausen} = ${correction.currentHours.toFixed(2)}h`, boxX + boxPadding, boxY)

    // Row 3: Diff + Note
    boxY += lineHeight
    const diffSign = correction.hoursDiff >= 0 ? '+' : ''
    doc.setTextColor(180, 100, 0)
    let diffText = `Differenz: ${diffSign}${correction.hoursDiff.toFixed(2)}h`
    if (correction.adminNote) diffText += ` | Grund: ${correction.adminNote}`
    doc.text(diffText, boxX + boxPadding, boxY)

    doc.setTextColor(0, 0, 0)
    return 28  // Total height of box
}

export const generateTimeReportPDF = (yearMonthStr, user, entries, statusData) => {
    try {
        // 1. Force Sort Chronologically
        const sortedEntries = [...entries].sort((a, b) => {
            // Fix sorting: use entry_date if actual_start is missing (for Absence virtual entries)
            const dateA = new Date(a.shifts?.start_time || a.actual_start || a.entry_date || 0)
            const dateB = new Date(b.shifts?.start_time || b.actual_start || b.entry_date || 0)
            return dateA - dateB
        })

        // Correction tracking for transparency
        const snapshot = statusData?.original_data_snapshot || []
        const corrections = []

        const doc = new jsPDF()
        const userName = user ? (user.full_name || user.email) : 'Unbekannt'
        const monthStr = format(new Date(yearMonthStr), 'MMMM yyyy', { locale: de })

        // Colors
        const primaryColor = [0, 0, 0]
        const accentColor = [60, 60, 60]
        const lightGray = [245, 245, 245]
        const correctionColor = [200, 0, 0]

        const margin = 10
        const pageWidth = doc.internal.pageSize.width
        const contentWidth = pageWidth - (margin * 2)

        // Header
        doc.setTextColor(...primaryColor)
        doc.setFont("helvetica", "bold")
        doc.setFontSize(18)
        doc.text("Arbeitszeitnachweis", margin, 20)

        // Status Badge
        if (statusData && statusData.status === 'genehmigt') {
            doc.setFillColor(220, 255, 220)
            doc.setDrawColor(0, 150, 0)
            doc.roundedRect(pageWidth - margin - 35, 10, 35, 8, 2, 2, 'FD')
            doc.setFontSize(8)
            doc.setTextColor(0, 100, 0)
            doc.text("GENEHMIGT", pageWidth - margin - 32, 15)
        }

        doc.setFontSize(9)
        doc.setFont("helvetica", "normal")
        doc.setTextColor(...accentColor)
        doc.text(`Zeitraum: ${monthStr} | Mitarbeiter: ${userName}`, margin, 26)

        // Signatures Section (Compact)
        let sigY = 32
        if (statusData) {
            doc.setFontSize(7)
            doc.setTextColor(100, 100, 100)
            let sigText = ""
            if (statusData.submitted_at) sigText += `Signiert (MA): ${format(parseISO(statusData.submitted_at), 'dd.MM. HH:mm')} `
            if (statusData.approved_at) sigText += `| Genehmigt (Admin): ${format(parseISO(statusData.approved_at), 'dd.MM. HH:mm')}`
            if (statusData.data_hash) sigText += ` | Hash: ${statusData.data_hash.substring(0, 15)}...`

            doc.text(sigText, margin, sigY)
            sigY += 5
        } else {
            sigY += 2
        }

        // Summary Box
        const totalHours = sortedEntries.reduce((sum, e) => sum + (e.calculated_hours || 0), 0)
        doc.setFont("helvetica", "bold")
        doc.setTextColor(...primaryColor)
        doc.setFontSize(10)
        doc.text(`Gesamt: ${totalHours.toFixed(2)}h`, pageWidth - margin - 30, 26, { align: 'right' })

        // Table Header
        let y = sigY + 5

        // Row height for consistent vertical spacing
        const rowHeight = 8  // Increased for better text separation
        // Note: Column layout is hardcoded below for precise control

        // Header Background
        doc.setFillColor(...lightGray)
        doc.rect(margin, y - 4, contentWidth, 10, 'F')

        doc.setFont("helvetica", "bold")
        doc.setFontSize(8)
        doc.setTextColor(...primaryColor)

        let x = margin

        // Render Header
        // Group Headers
        doc.text("Datum", x, y)
        x += 18
        doc.text("Tag", x, y)
        x += 8

        // Work
        doc.text("Arbeitszeit", x + 15, y - 2, { align: 'center' })
        doc.setFontSize(6)
        doc.text("Von", x + 2, y + 3)
        doc.text("Bis", x + 15 + 2, y + 3)
        x += 30

        // Readiness
        doc.setFontSize(8)
        doc.text("Bereitschaft", x + 15, y - 2, { align: 'center' })
        doc.setFontSize(6)
        doc.text("Von", x + 2, y + 3)
        doc.text("Bis", x + 15 + 2, y + 3)
        x += 30

        doc.setFontSize(8)
        doc.text("Dienst", x, y)
        x += 22
        doc.text("Stunden", x, y)
        x += 16
        doc.text("Anm.", x, y)

        y += 6

        // Rows
        doc.setFont("helvetica", "normal")
        doc.setFontSize(9)

        let lastDateStr = ''

        sortedEntries.forEach((entry) => {
            if (y > doc.internal.pageSize.height - 15) { doc.addPage(); y = 20 }

            // Correction detection: compare with snapshot
            const snapEntry = findSnapshotEntry(snapshot, entry)
            const correction = calculateCorrection(snapEntry, entry)
            if (correction) corrections.push(correction)

            const shift = entry.shifts
            // Handle Absences differently? No, treating as entries for uniformity mostly, but absences might not split nicely.
            // Check absence
            if (entry.absence_id) {
                // Render Absence Row Simple


                const dateRaw = entry.actual_start || entry.entry_date
                const dateStr = format(parseISO(dateRaw), 'dd.MM.yy')
                const dayStr = format(parseISO(dateRaw), 'EE', { locale: de })

                doc.setTextColor(...primaryColor)
                if (dateStr !== lastDateStr) {
                    doc.text(dateStr, margin, y)
                    doc.text(dayStr, margin + 18, y)
                    lastDateStr = dateStr
                }

                const type = entry.absences?.type || 'Abwesend'
                // Dienst at margin + 26 + 30 + 30 = margin + 86
                doc.text(type, margin + 86, y)
                // Stunden at margin + 86 + 22 = margin + 108
                doc.setFont("helvetica", "bold")
                doc.text(`${Number(entry.calculated_hours).toFixed(2)}h`, margin + 108, y)
                doc.setFont("helvetica", "normal")

                // Inline correction display for absences
                if (correction) {
                    y += rowHeight + 2
                    const boxHeight = renderCorrectionBox(doc, correction, y, margin, pageWidth, safeFormatTime)
                    y += boxHeight
                    doc.setFontSize(9)
                }

                // Draw separator line well below row
                y += 4  // Extra padding before line
                doc.setDrawColor(220, 220, 220)
                doc.line(margin, y, pageWidth - margin, y)
                y += 5  // Extra padding after line before next row
                return
            }

            if (!shift) return

            // Logic for Splits (Shift Segments)
            // 1. Get Segments
            const segments = getShiftSegments(
                entry.actual_start,
                entry.actual_end,
                shift.type,
                entry.interruptions
            )

            // 2. Convert Segments to Lines (Work + Standby pairing)
            // Line = { work: Segment|null, standby: Segment|null }
            const lines = []
            let currentLine = { work: null, standby: null }

            segments.forEach(seg => {
                if (seg.type === 'WORK') {
                    // Always flush if work exists (can't have 2 works on one line)
                    if (currentLine.work || currentLine.standby) {
                        lines.push(currentLine)
                        currentLine = { work: null, standby: null }
                    }
                    currentLine.work = seg
                } else if (seg.type === 'STANDBY') {
                    // Can append if work exists and ends <= start (chronological, guaranteed by sort)
                    // And standby slot is empty
                    if (currentLine.standby) {
                        lines.push(currentLine)
                        currentLine = { work: null, standby: null }
                    }
                    currentLine.standby = seg
                }
            })
            if (currentLine.work || currentLine.standby) lines.push(currentLine)

            // 3. Render Lines
            const dateRaw = entry.actual_start
            const dateStr = format(parseISO(dateRaw), 'dd.MM.yy')
            const dayStr = format(parseISO(dateRaw), 'EE', { locale: de })

            // Correction detection with minute tolerance (avoid false positives from ISO string formatting)
            let isCorrection = false
            if (entry.shifts.start_time && entry.actual_start && entry.shifts.end_time && entry.actual_end) {
                const startDiff = Math.abs(differenceInMinutes(parseISO(entry.shifts.start_time), parseISO(entry.actual_start)))
                const endDiff = Math.abs(differenceInMinutes(parseISO(entry.shifts.end_time), parseISO(entry.actual_end)))
                isCorrection = startDiff > 1 || endDiff > 1
            }

            lines.forEach((line, lineIdx) => {
                if (y > doc.internal.pageSize.height - 10) { doc.addPage(); y = 20 }

                // Zebra (per entry block? Or per line? Excel uses white usually)
                // Let's do simple zebra per Entry (all lines same bg)
                /* if (index % 2 === 1) { 
                    doc.setFillColor(252, 252, 252); 
                    doc.rect(margin, y - 4, contentWidth, 6, 'F') 
                } */

                doc.setTextColor(...primaryColor)

                // Date/Day (Only first line)
                if (lineIdx === 0) {
                    // Check if same date as previous ENTRY (to group visual blocks by date like Excel)
                    if (dateStr !== lastDateStr) {
                        doc.setFont("helvetica", "normal") // or bold
                        doc.text(dateStr, margin, y)
                        doc.text(dayStr, margin + 18, y)
                        lastDateStr = dateStr
                    }

                    // Shift Type (Only first line) - truncate if too long
                    // Dienst column at margin + 86
                    let shiftType = shift.type || '?'
                    if (shiftType.length > 8) shiftType = shiftType.substring(0, 7) + '..'
                    doc.text(shiftType, margin + 86, y)

                    // Total Hours (Only first line) at margin + 108
                    doc.setFont("helvetica", "bold")
                    doc.text(`${entry.calculated_hours.toFixed(2)}h`, margin + 108, y)
                    doc.setFont("helvetica", "normal")

                    // Admin Note column at margin + 124
                    if (isCorrection) {
                        doc.setFontSize(7)
                        doc.setTextColor(...correctionColor)
                        // Show admin_note if available, otherwise just "Korr."
                        let noteText = 'Korr.'
                        if (entry.admin_note) {
                            // Admin made a correction with note
                            noteText = 'Admin: ' + entry.admin_note.substring(0, 25)
                        }
                        doc.text(noteText, margin + 124, y)
                        doc.setFontSize(9)
                        doc.setTextColor(...primaryColor)
                    } else if (entry.admin_note) {
                        // Admin note without time correction (e.g. interruption edit)
                        doc.setFontSize(7)
                        doc.setTextColor(150, 100, 0) // Orange for admin notes
                        doc.text('Admin: ' + entry.admin_note.substring(0, 25), margin + 124, y)
                        doc.setFontSize(9)
                        doc.setTextColor(...primaryColor)
                    }
                }

                // Work Columns
                if (line.work) {
                    const s = safeFormatTime(line.work.start.toISOString())
                    const e = safeFormatTime(line.work.end.toISOString())

                    // Align under subcols
                    // Work is at margin + 18 + 8 = +26. Width 30.
                    const baseX = margin + 26
                    doc.text(s, baseX + 2, y)
                    doc.text(e, baseX + 17, y)
                }

                // Standby Columns
                if (line.standby) {
                    const s = safeFormatTime(line.standby.start.toISOString())
                    const e = safeFormatTime(line.standby.end.toISOString())

                    const baseX = margin + 26 + 30
                    doc.text(s, baseX + 2, y)
                    doc.text(e, baseX + 17, y)
                }

                y += rowHeight
            })

            // Inline correction display for shifts
            if (correction) {
                y += 2
                const boxHeight = renderCorrectionBox(doc, correction, y, margin, pageWidth, safeFormatTime)
                y += boxHeight
                doc.setFontSize(9)
            }

            // Spacer/Line between entries - draw line well AFTER the row content
            y += 4  // Extra padding before separator line
            doc.setDrawColor(220, 220, 220)
            doc.line(margin, y, pageWidth - margin, y)
            y += 5  // Extra padding after line before next entry
        })

        // Footer: Admin Correction Transparency Note
        const footerY = doc.internal.pageSize.height - 18
        doc.setFontSize(6)
        doc.setTextColor(120, 120, 120)

        // Correction summary
        if (corrections.length > 0) {
            const totalDiff = corrections.reduce((sum, c) => sum + c.hoursDiff, 0)
            const corrDates = corrections.map(c => {
                try { return format(parseISO(c.date), 'dd.MM.') } catch { return '?' }
            }).join(', ')
            const diffSign = totalDiff >= 0 ? '+' : ''
            doc.setTextColor(180, 100, 0)
            doc.text(`Administrativ korrigiert: ${corrections.length} Eintrag/Einträge (${corrDates}) | Stunden-Diff: ${diffSign}${totalDiff.toFixed(2)}h`, margin, footerY)
            doc.setTextColor(120, 120, 120)
            doc.text('Original-Daten einsehbar unter: Zeiterfassung > Original-Daten anzeigen', margin, footerY + 4)
        } else {
            doc.text('Keine administrativen Korrekturen.', margin, footerY)
        }

        if (statusData?.data_hash) {
            doc.text(`Digitale Signatur: ${statusData.data_hash}`, margin, footerY + 8)
        }
        doc.setTextColor(...primaryColor)

        doc.save(`Arbeitszeit_${userName}_${format(new Date(yearMonthStr), 'yyyy_MM')}.pdf`)
    } catch (e) {
        console.error(e)
        alert('PDF Fehler: ' + e.message)
    }
}

// Helper
const safeFormatTime = (iso) => { try { return format(parseISO(iso), 'HH:mm') } catch { return '--:--' } }
