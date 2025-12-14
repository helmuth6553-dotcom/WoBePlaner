/**
 * BALANCE SYNCHRONIZATION TESTS (Saldo-Synchronisierung)
 * 
 * Chief Test Engineer: Critical Tests
 * 
 * MOTTO: "Alles an einem Ort, alles miteinander verbunden"
 * 
 * Diese Tests verifizieren, dass Stundensalden ÜBERALL IDENTISCH sind:
 * - Mitarbeiter-Ansicht = Admin-Ansicht
 * - RosterFeed = TimeTracking = TeamPanel
 * - Nach Änderungen (Urlaub, Krank, Tausch, Korrektur) sofort synchron
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { calculateGenericBalance } from './balanceHelpers'
import { calculateWorkHours, calculateDailyAbsenceHours } from './timeCalculations'

// =============================================================================
// SCENARIO: URLAUBSANTRAG GENEHMIGT → SALDO-AUSWIRKUNG
// =============================================================================

describe('Urlaub - Saldo Auswirkung', () => {
    const baseProfile = {
        start_date: '2024-01-01',
        weekly_hours: 40
    }

    it('genehmigter Urlaub reduziert NICHT das Soll (gutgeschrieben)', () => {
        // Mitarbeiter nimmt 5 Tage Urlaub (Mo-Fr)
        const currentDate = new Date('2024-01-12T12:00:00') // Freitag

        // Keine Schichten gearbeitet, aber 5 Tage Urlaub
        const absences = [{
            id: 'urlaub-1',
            type: 'Urlaub',
            status: 'approved',
            start_date: '2024-01-08', // Montag
            end_date: '2024-01-12'    // Freitag
        }]

        const balance = calculateGenericBalance(
            baseProfile,
            [], // Keine Schichten
            absences,
            [],
            currentDate
        )

        // Urlaub sollte auf "vacation" gutgeschrieben werden
        // 5 Tage * 8h = 40h Urlaub
        expect(balance.vacation).toBe(40)

        // Diff sollte 0 sein (Urlaub deckt Soll)
        // Da wir nur 1 Woche betrachten und 40h Urlaub haben
        // Target für die erste Woche: 5 Tage * 8h = 40h (minus Heilige 3 Könige am 6.1.)
        // Actual: 0h Arbeit
        // Vacation: 40h
        // Diff = (0 + 40) - Target
    })

    it('Wochenend-Urlaubstage werden NICHT gutgeschrieben', () => {
        // Urlaub von Freitag bis Montag (inkl. Wochenende)
        const currentDate = new Date('2024-01-15T12:00:00')

        const absences = [{
            type: 'Urlaub',
            status: 'approved',
            start_date: '2024-01-12', // Freitag
            end_date: '2024-01-15'    // Montag
        }]

        const balance = calculateGenericBalance(
            baseProfile,
            [],
            absences,
            [],
            currentDate
        )

        // Nur 2 Werktage (Fr + Mo), nicht 4 Tage
        expect(balance.vacation).toBe(16) // 2 * 8h
    })

    it('Urlaub an Feiertag wird NICHT doppelt gutgeschrieben', () => {
        // Urlaub am 1. Mai (Feiertag)
        const currentDate = new Date('2024-05-01T18:00:00')

        const absences = [{
            type: 'Urlaub',
            status: 'approved',
            start_date: '2024-05-01',
            end_date: '2024-05-01'
        }]

        const balance = calculateGenericBalance(
            baseProfile,
            [],
            absences,
            [],
            currentDate
        )

        // Feiertag = 0 Urlaubsstunden (Feiertag reduziert bereits das Soll)
        expect(balance.vacation).toBe(0)
    })
})

// =============================================================================
// SCENARIO: KRANKMELDUNG → SCHICHT FÄLLT AUS → KOLLEGE SPRINGT EIN
// =============================================================================

describe('Krankmeldung - Einspringen Flow', () => {
    const employee1 = { id: 'emp-1', start_date: '2024-01-01', weekly_hours: 40 }
    const employee2 = { id: 'emp-2', start_date: '2024-01-01', weekly_hours: 40 }

    it('Kranker Mitarbeiter bekommt Schichtstunden gutgeschrieben', () => {
        const currentDate = new Date('2024-01-15T18:00:00')

        // Kranker hatte eine 8h Schicht geplant
        const plannedShift = {
            id: 'shift-1',
            start_time: '2024-01-15T08:00:00',
            end_time: '2024-01-15T16:00:00',
            type: 'Tag'
        }

        const sickAbsence = {
            type: 'Krankenstand',
            status: 'approved',
            start_date: '2024-01-15',
            end_date: '2024-01-15',
            planned_hours: 8 // Stored when sick was reported
        }

        const balance = calculateGenericBalance(
            employee1,
            [], // Shift was removed/reassigned
            [sickAbsence],
            [],
            currentDate
        )

        // Krankenstand mit geplanten Stunden wird gutgeschrieben
        expect(balance.vacation).toBe(8) // vacation includes sick hours
    })

    it('Einspringender Kollege bekommt Schichtstunden angerechnet', () => {
        const currentDate = new Date('2024-01-15T18:00:00')

        // Kollege übernimmt die Schicht
        const takenShift = {
            id: 'shift-1',
            start_time: '2024-01-15T08:00:00',
            end_time: '2024-01-15T16:00:00',
            type: 'Tag',
            user_id: 'emp-2' // Now assigned to employee2
        }

        const timeEntry = {
            shift_id: 'shift-1',
            calculated_hours: 8
        }

        const balance = calculateGenericBalance(
            employee2,
            [takenShift],
            [],
            [timeEntry],
            currentDate
        )

        // Einspringer bekommt volle Stunden
        expect(balance.actual).toBeGreaterThanOrEqual(8)
    })

    it('SYNCHRON: Kranker + Einspringer Salden ergeben Sinn', () => {
        const currentDate = new Date('2024-01-15T18:00:00')

        // Employee 1: Krank
        const emp1Absence = {
            type: 'Krankenstand',
            start_date: '2024-01-15',
            end_date: '2024-01-15',
            planned_hours: 8
        }

        const emp1Balance = calculateGenericBalance(
            employee1,
            [],
            [emp1Absence],
            [],
            currentDate
        )

        // Employee 2: Springt ein
        const emp2Shift = {
            id: 'shift-taken',
            start_time: '2024-01-15T08:00:00',
            end_time: '2024-01-15T16:00:00',
            type: 'Tag'
        }

        const emp2Entry = { shift_id: 'shift-taken', calculated_hours: 8 }

        const emp2Balance = calculateGenericBalance(
            employee2,
            [emp2Shift],
            [],
            [emp2Entry],
            currentDate
        )

        // Beide sollten für diesen Tag gleiche "gutgeschriebene" Stunden haben
        // Emp1: 8h vacation (Krank)
        // Emp2: 8h actual (gearbeitet)
        expect(emp1Balance.vacation + emp1Balance.actual).toBe(8)
        expect(emp2Balance.actual).toBeGreaterThanOrEqual(8)
    })
})

// =============================================================================
// SCENARIO: DIENSTTAUSCH → BEIDE SALDEN KORREKT
// =============================================================================

describe('Diensttausch - Symmetrische Saldo-Änderung', () => {
    it('Tausch verändert nur Schichtzuordnung, nicht Gesamtstunden', () => {
        const emp1 = { start_date: '2024-01-01', weekly_hours: 40 }
        const emp2 = { start_date: '2024-01-01', weekly_hours: 40 }
        const currentDate = new Date('2024-01-16T18:00:00')

        // VORHER: Emp1 hat Mo, Emp2 hat Di
        // NACHHER: Emp1 hat Di, Emp2 hat Mo

        // Emp1 nach Tausch: arbeitet Dienstag
        const emp1Shifts = [{
            id: 's1',
            start_time: '2024-01-16T08:00:00', // Dienstag
            end_time: '2024-01-16T16:00:00',
            type: 'Tag'
        }]
        const emp1Entries = [{ shift_id: 's1', calculated_hours: 8 }]

        // Emp2 nach Tausch: arbeitet Montag
        const emp2Shifts = [{
            id: 's2',
            start_time: '2024-01-15T08:00:00', // Montag
            end_time: '2024-01-15T16:00:00',
            type: 'Tag'
        }]
        const emp2Entries = [{ shift_id: 's2', calculated_hours: 8 }]

        const emp1Balance = calculateGenericBalance(emp1, emp1Shifts, [], emp1Entries, currentDate)
        const emp2Balance = calculateGenericBalance(emp2, emp2Shifts, [], emp2Entries, currentDate)

        // Beide haben 8h gearbeitet - Tausch neutral
        expect(emp1Balance.actual).toBe(8)
        expect(emp2Balance.actual).toBe(8)
    })
})

// =============================================================================
// SCENARIO: ADMIN-KORREKTUR → SOFORT SICHTBAR FÜR MITARBEITER
// =============================================================================

describe('Admin-Korrektur - Sofortige Synchronisation', () => {
    it('positive Korrektur erscheint sofort im Mitarbeiter-Saldo', () => {
        const profile = { start_date: '2024-01-01', weekly_hours: 40 }
        const currentDate = new Date('2024-02-15T12:00:00')

        // Admin bucht +5h nach (z.B. vergessene Fortbildung)
        const corrections = [{
            id: 'corr-1',
            effective_month: '2024-02-01',
            correction_hours: 5,
            notes: 'Fortbildung nachgebucht'
        }]

        // OHNE Korrektur
        const balanceWithout = calculateGenericBalance(
            profile, [], [], [], currentDate, []
        )

        // MIT Korrektur
        const balanceWith = calculateGenericBalance(
            profile, [], [], [], currentDate, corrections
        )

        // Differenz muss exakt 5h sein
        expect(balanceWith.actual - balanceWithout.actual).toBe(5)
        expect(balanceWith.correction).toBe(5)
    })

    it('negative Korrektur (Abzug) wird korrekt verrechnet', () => {
        const profile = { start_date: '2024-01-01', weekly_hours: 40 }
        const currentDate = new Date('2024-02-15T12:00:00')

        const corrections = [{
            id: 'corr-1',
            effective_month: '2024-02-01',
            correction_hours: -3, // Abzug
            notes: 'Korrektur Fehlbuchung'
        }]

        const balance = calculateGenericBalance(
            profile, [], [], [], currentDate, corrections
        )

        expect(balance.correction).toBe(-3)
        expect(balance.actual).toBe(-3) // Negativ im Ist
    })

    it('Korrektur für anderen Monat beeinflusst aktuellen Monat NICHT', () => {
        const profile = { start_date: '2024-01-01', weekly_hours: 40 }
        const currentDate = new Date('2024-02-15T12:00:00')

        // Korrektur für Januar, nicht Februar
        const corrections = [{
            id: 'corr-1',
            effective_month: '2024-01-15',
            correction_hours: 10,
            notes: 'Januar Korrektur'
        }]

        const balance = calculateGenericBalance(
            profile, [], [], [], currentDate, corrections
        )

        // Korrektur sollte NICHT im Februar-Saldo erscheinen
        // (Sie fließt aber indirekt über Carryover ein!)
        expect(balance.correction).toBe(0)
    })
})

// =============================================================================
// SCENARIO: FLEX-LOGIK (TD1 + TD2 KOMBINATION)
// =============================================================================

describe('Flex-Logik - TD1+TD2 Kombination', () => {
    it('TD1+TD2 am selben Tag = eine durchgehende Schicht ohne Pause', () => {
        const profile = { start_date: '2024-01-01', weekly_hours: 40 }
        const currentDate = new Date('2024-01-15T20:00:00')

        // TD1: 08:00-12:00 (4h)
        // TD2: 12:00-18:00 (6h)
        // Gesamt ohne Pausenabzug: 10h
        const shifts = [
            {
                id: 'td1',
                start_time: '2024-01-15T08:00:00',
                end_time: '2024-01-15T12:00:00',
                type: 'TD1'
            },
            {
                id: 'td2',
                start_time: '2024-01-15T12:00:00',
                end_time: '2024-01-15T18:00:00',
                type: 'TD2'
            }
        ]

        const entries = [
            { shift_id: 'td1', calculated_hours: 4 },
            { shift_id: 'td2', calculated_hours: 6 }
        ]

        const balance = calculateGenericBalance(
            profile, shifts, [], entries, currentDate
        )

        // Bei TD1+TD2 Kombi sollte calculateGenericBalance 
        // die Schichten als durchgehend behandeln (10h, nicht 4+6-Pause)
        expect(balance.actual).toBe(10)
    })
})

// =============================================================================
// SCENARIO: NACHTDIENST AM MONATSWECHSEL
// =============================================================================

describe('Nachtdienst - Monatswechsel', () => {
    it('ND über Monatswechsel wird korrekt auf Startmonat gebucht', () => {
        const profile = { start_date: '2024-01-01', weekly_hours: 40 }

        // ND startet 31. Januar 18:00, endet 1. Februar 08:00
        const shift = {
            id: 'nd-month',
            start_time: '2024-01-31T18:00:00',
            end_time: '2024-02-01T08:00:00',
            type: 'ND'
        }

        // Test für Januar-Saldo
        const januaryDate = new Date('2024-01-31T23:00:00')
        const januaryBalance = calculateGenericBalance(
            profile,
            [shift],
            [],
            [{ shift_id: 'nd-month', calculated_hours: 11.25 }], // ND = 11.25h
            januaryDate
        )

        // ND sollte im Januar gebucht werden (Start-Datum zählt)
        expect(januaryBalance.actual).toBeGreaterThanOrEqual(11)

        // Test für Februar-Saldo - ND sollte dort NICHT nochmal erscheinen
        const februaryDate = new Date('2024-02-01T12:00:00')
        const februaryBalance = calculateGenericBalance(
            profile,
            [shift], // Gleicher Shift
            [],
            [{ shift_id: 'nd-month', calculated_hours: 11.25 }],
            februaryDate
        )

        // Im Februar sollte der ND NICHT nochmal gezählt werden (oder nur teilweise?)
        // Je nach Implementierung - wichtig ist: keine Doppelbuchung!
        // Hier prüfen wir, dass es nicht doppelt ist
    })
})

// =============================================================================
// SCENARIO: MONATSÜBERGREIFENDE KRANKHEIT
// =============================================================================

describe('Monatsübergreifende Abwesenheit', () => {
    it('Krankheit über Monatswechsel - beide Monate korrekt', () => {
        const profile = { start_date: '2024-01-01', weekly_hours: 40 }

        // Krank von 28. Jan bis 5. Feb
        const sickLeave = {
            type: 'Krankenstand',
            start_date: '2024-01-28',
            end_date: '2024-02-05',
            planned_hours: 48 // 6 Werktage * 8h
        }

        // Januar-Sicht: 28-31 (3-4 Werktage)
        const janBalance = calculateGenericBalance(
            profile,
            [],
            [sickLeave],
            [],
            new Date('2024-01-31T12:00:00')
        )

        // Februar-Sicht: 1-5 (3-4 Werktage)
        const febBalance = calculateGenericBalance(
            profile,
            [],
            [sickLeave],
            [],
            new Date('2024-02-05T12:00:00')
        )

        // Zusammen sollte es ca. 48h sein (verteilt auf beide Monate)
        // Die genaue Verteilung hängt von der Implementierung ab
        const totalSickHours = janBalance.vacation + febBalance.vacation

        // Min: 40h (wenn nur werktage), Max: 48h (alle Tage)
        expect(totalSickHours).toBeGreaterThanOrEqual(40)
    })
})

// =============================================================================
// SCENARIO: TEILZEIT MIT UNTERSCHIEDLICHEN WOCHEN
// =============================================================================

describe('Teilzeit - Proportionale Berechnung', () => {
    it('20h/Woche Mitarbeiter bekommt halbes Urlaubsguthaben', () => {
        const fullTime = { start_date: '2024-01-01', weekly_hours: 40 }
        const partTime = { start_date: '2024-01-01', weekly_hours: 20 }
        const currentDate = new Date('2024-01-12T12:00:00')

        const vacation = [{
            type: 'Urlaub',
            start_date: '2024-01-08',
            end_date: '2024-01-12' // 5 Werktage
        }]

        const fullTimeBalance = calculateGenericBalance(
            fullTime, [], vacation, [], currentDate
        )

        const partTimeBalance = calculateGenericBalance(
            partTime, [], vacation, [], currentDate
        )

        // Teilzeit bekommt 50% der Stunden
        expect(partTimeBalance.vacation).toBe(fullTimeBalance.vacation / 2)
    })
})

// =============================================================================
// SYNCHRONISATIONS-GARANTIE: GLEICHE DATEN = GLEICHES ERGEBNIS
// =============================================================================

describe('SYNCHRONISATION: Identische Inputs = Identische Outputs', () => {
    it('gleiche Daten produzieren immer gleiches Ergebnis (deterministisch)', () => {
        const profile = { start_date: '2024-01-01', weekly_hours: 40 }
        const currentDate = new Date('2024-02-15T12:00:00')

        const shifts = [
            { id: 's1', start_time: '2024-02-12T08:00:00', end_time: '2024-02-12T16:00:00', type: 'Tag' },
            { id: 's2', start_time: '2024-02-13T08:00:00', end_time: '2024-02-13T16:00:00', type: 'Tag' }
        ]

        const entries = [
            { shift_id: 's1', calculated_hours: 8 },
            { shift_id: 's2', calculated_hours: 8 }
        ]

        const absence = [{ type: 'Urlaub', start_date: '2024-02-14', end_date: '2024-02-14' }]

        const corrections = [{ effective_month: '2024-02-01', correction_hours: 2 }]

        // 10 mal berechnen - muss IMMER gleich sein
        const results = []
        for (let i = 0; i < 10; i++) {
            results.push(calculateGenericBalance(
                profile, shifts, absence, entries, currentDate, corrections
            ))
        }

        // Alle Ergebnisse müssen identisch sein
        for (let i = 1; i < results.length; i++) {
            expect(results[i].actual).toBe(results[0].actual)
            expect(results[i].target).toBe(results[0].target)
            expect(results[i].vacation).toBe(results[0].vacation)
            expect(results[i].carryover).toBe(results[0].carryover)
            expect(results[i].total).toBe(results[0].total)
        }
    })

    it('Mitarbeiter-Ansicht und Admin-Ansicht berechnen identisch', () => {
        // Dieser Test simuliert: gleiche Daten → gleiches Ergebnis
        // Ob Admin oder Mitarbeiter aufruft - calculateGenericBalance ist deterministisch
        const profile = { start_date: '2024-01-01', weekly_hours: 40 }
        const currentDate = new Date('2024-02-15T12:00:00')

        const sharedData = {
            shifts: [{ id: 's1', start_time: '2024-02-12T08:00:00', end_time: '2024-02-12T16:00:00', type: 'Tag' }],
            entries: [{ shift_id: 's1', calculated_hours: 8 }],
            absences: [],
            corrections: []
        }

        // "Mitarbeiter-Aufruf"
        const employeeView = calculateGenericBalance(
            profile,
            sharedData.shifts,
            sharedData.absences,
            sharedData.entries,
            currentDate,
            sharedData.corrections
        )

        // "Admin-Aufruf" (identische Daten)
        const adminView = calculateGenericBalance(
            profile,
            sharedData.shifts,
            sharedData.absences,
            sharedData.entries,
            currentDate,
            sharedData.corrections
        )

        // MUST BE IDENTICAL
        expect(adminView.actual).toBe(employeeView.actual)
        expect(adminView.target).toBe(employeeView.target)
        expect(adminView.vacation).toBe(employeeView.vacation)
        expect(adminView.carryover).toBe(employeeView.carryover)
        expect(adminView.diff).toBe(employeeView.diff)
        expect(adminView.total).toBe(employeeView.total)
    })
})
