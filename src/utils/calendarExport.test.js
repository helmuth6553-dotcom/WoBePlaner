/**
 * Tests for Calendar Export Utility
 * Verifies iCal format compliance and Google Calendar URL generation.
 */
import { describe, it, expect } from 'vitest'
import { generateICalFromShifts, generateGoogleCalendarUrl } from './calendarExport'

const sampleShift = {
    id: 'shift-1',
    type: 'TD1',
    start_time: '2025-01-10T07:30:00Z',
    end_time: '2025-01-10T14:30:00Z',
}

describe('generateICalFromShifts', () => {
    it('generates valid iCal header', () => {
        const ical = generateICalFromShifts([sampleShift])
        expect(ical).toContain('BEGIN:VCALENDAR')
        expect(ical).toContain('VERSION:2.0')
        expect(ical).toContain('PRODID:-//WoBePlaner//Dienstplan Export//DE')
        expect(ical).toContain('END:VCALENDAR')
    })

    it('generates VEVENT for each shift', () => {
        const ical = generateICalFromShifts([sampleShift])
        expect(ical).toContain('BEGIN:VEVENT')
        expect(ical).toContain('END:VEVENT')
    })

    it('includes shift type as SUMMARY', () => {
        const ical = generateICalFromShifts([sampleShift])
        expect(ical).toContain('SUMMARY:Tagdienst 1')
    })

    it('includes DTSTART and DTEND', () => {
        const ical = generateICalFromShifts([sampleShift])
        expect(ical).toMatch(/DTSTART:\d{8}T\d{6}Z/)
        expect(ical).toMatch(/DTEND:\d{8}T\d{6}Z/)
    })

    it('includes UID with wobeplaner.app domain', () => {
        const ical = generateICalFromShifts([sampleShift])
        expect(ical).toContain('UID:shift-1@wobeplaner.app')
    })

    it('includes 1-hour reminder', () => {
        const ical = generateICalFromShifts([sampleShift])
        expect(ical).toContain('BEGIN:VALARM')
        expect(ical).toContain('TRIGGER:-PT1H')
        expect(ical).toContain('END:VALARM')
    })

    it('includes userName in description when provided', () => {
        const ical = generateICalFromShifts([sampleShift], 'Max Mustermann')
        expect(ical).toContain('Max Mustermann')
    })

    it('handles multiple shifts', () => {
        const shifts = [
            sampleShift,
            { ...sampleShift, id: 'shift-2', type: 'ND' },
        ]
        const ical = generateICalFromShifts(shifts)
        const eventCount = (ical.match(/BEGIN:VEVENT/g) || []).length
        expect(eventCount).toBe(2)
    })

    it('filters shifts without start_time or end_time', () => {
        const shifts = [
            sampleShift,
            { id: 'bad-1', type: 'TD1', start_time: null, end_time: null },
        ]
        const ical = generateICalFromShifts(shifts)
        const eventCount = (ical.match(/BEGIN:VEVENT/g) || []).length
        expect(eventCount).toBe(1)
    })

    it('returns valid iCal for empty shifts array', () => {
        const ical = generateICalFromShifts([])
        expect(ical).toContain('BEGIN:VCALENDAR')
        expect(ical).toContain('END:VCALENDAR')
        expect(ical).not.toContain('BEGIN:VEVENT')
    })

    it('uses custom title when provided on shift', () => {
        const shift = { ...sampleShift, title: 'Sonderdienst' }
        const ical = generateICalFromShifts([shift])
        expect(ical).toContain('SUMMARY:Sonderdienst')
    })

    it('uses CRLF line endings (iCal spec)', () => {
        const ical = generateICalFromShifts([sampleShift])
        expect(ical).toContain('\r\n')
    })

    it('sets timezone to Europe/Vienna', () => {
        const ical = generateICalFromShifts([sampleShift])
        expect(ical).toContain('X-WR-TIMEZONE:Europe/Vienna')
    })
})

describe('generateGoogleCalendarUrl', () => {
    it('returns a Google Calendar URL', () => {
        const url = generateGoogleCalendarUrl(sampleShift)
        expect(url).toContain('calendar.google.com/calendar/render')
    })

    it('includes action=TEMPLATE', () => {
        const url = generateGoogleCalendarUrl(sampleShift)
        expect(url).toContain('action=TEMPLATE')
    })

    it('includes shift type as title', () => {
        const url = generateGoogleCalendarUrl(sampleShift)
        expect(url).toContain('text=Tagdienst')
    })

    it('includes dates parameter', () => {
        const url = generateGoogleCalendarUrl(sampleShift)
        expect(url).toMatch(/dates=\d{8}T\d{6}\/\d{8}T\d{6}/)
    })

    it('uses custom title when provided', () => {
        const shift = { ...sampleShift, title: 'Meeting' }
        const url = generateGoogleCalendarUrl(shift)
        expect(url).toContain('text=Meeting')
    })
})
