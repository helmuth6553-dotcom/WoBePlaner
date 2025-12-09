import { jsPDF } from 'jspdf'
import { format, parseISO, differenceInMinutes, addDays } from 'date-fns'
import { de } from 'date-fns/locale'

export const generateTimeReportPDF = (yearMonthStr, user, entries, statusData) => {
    try {
        // 1. Force Sort Chronologically
        const sortedEntries = [...entries].sort((a, b) => {
            const dateA = new Date(a.shifts?.start_time || a.actual_start || 0)
            const dateB = new Date(b.shifts?.start_time || b.actual_start || 0)
            return dateA - dateB
        })

        const doc = new jsPDF()
        const userName = user ? (user.full_name || user.email) : 'Unbekannt'
        const monthStr = format(new Date(yearMonthStr), 'MMMM yyyy', { locale: de })

        // Colors
        const primaryColor = [0, 0, 0]
        const accentColor = [60, 60, 60]
        const lightGray = [245, 245, 245]
        const lineColor = [220, 220, 220]
        const correctionColor = [200, 0, 0]

        const margin = 15
        const pageWidth = doc.internal.pageSize.width
        const contentWidth = pageWidth - (margin * 2)

        // Header
        doc.setTextColor(...primaryColor)
        doc.setFont("helvetica", "bold")
        doc.setFontSize(22)
        doc.text("Arbeitszeitnachweis", margin, 25)

        // Status Badge
        if (statusData && statusData.status === 'genehmigt') {
            doc.setFillColor(220, 255, 220)
            doc.setDrawColor(0, 150, 0)
            doc.roundedRect(pageWidth - margin - 40, 10, 40, 10, 2, 2, 'FD')
            doc.setFontSize(8)
            doc.setTextColor(0, 100, 0)
            doc.text("GENEHMIGT", pageWidth - margin - 35, 16)
        } else if (statusData && statusData.status === 'eingereicht') {
            doc.setFillColor(220, 230, 255)
            doc.setDrawColor(0, 0, 200)
            doc.roundedRect(pageWidth - margin - 40, 10, 40, 10, 2, 2, 'FD')
            doc.setFontSize(8)
            doc.setTextColor(0, 0, 150)
            doc.text("EINGEREICHT", pageWidth - margin - 35, 16)
        }

        doc.setFontSize(10)
        doc.setFont("helvetica", "normal")
        doc.setTextColor(...accentColor)
        doc.text(`Zeitraum: ${monthStr}`, margin, 32)
        doc.text(`Mitarbeiter: ${userName}`, margin, 37)
        doc.text(`Erstellt am: ${format(new Date(), 'dd.MM.yyyy HH:mm')}`, margin, 42)

        // Signatures Section
        let sigY = 50
        if (statusData) {
            doc.setFontSize(8)
            doc.setTextColor(100, 100, 100)

            if (statusData.submitted_at) {
                doc.text(`Digital Signiert (MA): ${format(parseISO(statusData.submitted_at), 'dd.MM.yyyy HH:mm')}`, margin, sigY)
            }
            if (statusData.approved_at) {
                const date = format(parseISO(statusData.approved_at), 'dd.MM.yyyy HH:mm')
                doc.text(`Geprüft & Genehmigt (Admin): ${date}`, margin + 80, sigY)
            }
            sigY += 5

            // Hash Proof
            if (statusData.data_hash) {
                doc.setFont("courier", "normal")
                doc.setFontSize(6)
                doc.setTextColor(150, 150, 150)
                doc.text(`Digitaler Fingerabdruck (Hash): ${statusData.data_hash}`, margin, sigY + 5)
                doc.setFont("helvetica", "normal")
            }
            sigY += 10
        }

        // Summary Box
        const totalHours = sortedEntries.reduce((sum, e) => sum + (e.calculated_hours || 0), 0)

        doc.setFillColor(...lightGray)
        doc.roundedRect(pageWidth - margin - 60, 25, 60, 20, 3, 3, 'F')
        doc.setFontSize(9)
        doc.setTextColor(...accentColor)
        doc.text("Gesamtstunden", pageWidth - margin - 50, 32)
        doc.setFontSize(14)
        doc.setFont("helvetica", "bold")
        doc.setTextColor(...primaryColor)
        doc.text(`${totalHours.toFixed(2)}h`, pageWidth - margin - 50, 39)

        // Table Header
        let y = sigY + 5
        const cols = [
            { name: "Datum", width: 25 },
            { name: "Schicht", width: 15 },
            { name: "Zeitraum (Ist)", width: 35 },
            { name: "Details", width: 45 },
            { name: "Stunden", width: 20, align: 'right' },
            { name: "Notiz", width: 40 }
        ]

        doc.setFillColor(...lightGray)
        doc.rect(margin, y - 6, contentWidth, 8, 'F')
        doc.setFont("helvetica", "bold")
        doc.setFontSize(9)
        doc.setTextColor(...primaryColor)

        let x = margin
        cols.forEach(col => {
            if (col.align === 'right') doc.text(col.name, x + col.width - 2, y - 1, { align: 'right' })
            else doc.text(col.name, x + 2, y - 1)
            x += col.width
        })
        y += 4

        // Table Rows
        doc.setFont("helvetica", "normal")
        sortedEntries.forEach((entry, index) => {
            if (y > doc.internal.pageSize.height - 20) { doc.addPage(); y = 20 }

            const shift = entry.shifts
            if (!shift) return

            const dateStr = format(parseISO(shift.start_time), 'dd.MM.')
            const dayStr = format(parseISO(shift.start_time), 'EE', { locale: de })
            const timeStr = `${safeFormatTime(entry.actual_start)} - ${safeFormatTime(entry.actual_end)}`

            // Check correction
            const origStart = safeFormatTime(shift.start_time)
            const origEnd = safeFormatTime(shift.end_time)
            const actStart = safeFormatTime(entry.actual_start)
            const actEnd = safeFormatTime(entry.actual_end)
            const isChanged = (origStart !== actStart || origEnd !== actEnd)

            x = margin
            if (index % 2 === 1) { doc.setFillColor(250, 250, 250); doc.rect(margin, y - 5, contentWidth, 10, 'F') }

            doc.setTextColor(...primaryColor)
            doc.text(`${dayStr}, ${dateStr}`, x + 2, y)
            x += cols[0].width

            doc.text(shift.type || '?', x + 2, y)
            x += cols[1].width

            if (isChanged) doc.setFont("helvetica", "bold")
            doc.text(timeStr, x + 2, y)
            doc.setFont("helvetica", "normal")
            x += cols[2].width

            // Breakdown (Interrupts count)
            doc.setFontSize(8)
            doc.setTextColor(...accentColor)
            const intCount = entry.interruptions?.length || 0
            doc.text(`${intCount > 0 ? intCount + ' Unterbr.' : '-'}`, x + 2, y)
            doc.setFontSize(9)
            doc.setTextColor(...primaryColor)
            x += cols[3].width

            // Hours
            doc.setFont("helvetica", "bold")
            doc.text(`${entry.calculated_hours}`, x + cols[4].width - 2, y, { align: 'right' })
            doc.setFont("helvetica", "normal")
            x += cols[4].width

            // Note
            if (isChanged) {
                doc.setTextColor(...correctionColor)
                doc.setFontSize(7)
                doc.text(`Plan: ${origStart}-${origEnd}`, x + 2, y)
                doc.setTextColor(...primaryColor)
                doc.setFontSize(9)
            } else if (entry.admin_note) {
                doc.setFontSize(7)
                doc.setTextColor(...accentColor)
                doc.text(entry.admin_note.substring(0, 20), x + 2, y)
                doc.setFontSize(9)
                doc.setTextColor(...primaryColor)
            }

            y += 8
            doc.setDrawColor(...lineColor)
            doc.line(margin, y - 3, pageWidth - margin, y - 3)
        })

        doc.save(`Arbeitszeit_${userName}_${format(new Date(yearMonthStr), 'yyyy_MM')}.pdf`)
    } catch (e) {
        console.error(e)
        alert('PDF Fehler: ' + e.message)
    }
}

// Helper
const safeFormatTime = (iso) => { try { return format(parseISO(iso), 'HH:mm') } catch { return '--:--' } }
