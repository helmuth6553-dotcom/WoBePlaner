-- WARNUNG: Dieses Skript löscht ALLE benutzerbezogenen Transaktionsdaten!
-- Es setzt das System auf einen "frischen" Zustand zurück, ohne die Dienstplan-Struktur zu zerstören.

BEGIN;

-- 1. Monatsberichte und Signaturen löschen
DELETE FROM monthly_reports;

-- 2. Alle Zeiteinträge (gestempelte Zeiten) löschen
DELETE FROM time_entries;

-- 3. Alle Abwesenheiten (Urlaub, Krank, Anträge) löschen
DELETE FROM absences;

-- 4. Admin Audit Logs bereinigen (damit die Historie zum Neustart passt)
-- (Falls die Tabelle admin_actions heißt, nimm diese Zeile)
DELETE FROM admin_actions;

-- 5. Alle Interessenbekundungen / Bewerbungen auf Dienste löschen
DELETE FROM shift_interests;

-- 6. Alle Zuteilungen von Diensten aufheben (Dienste werden wieder "offen")
UPDATE shifts SET assigned_to = NULL;

-- 7. Spezielle Schichten (Team, Fortbildung) komplett entfernen
-- (Normale Dienste wie TD1, ND etc. bleiben erhalten!)
DELETE FROM shifts WHERE type IN ('TEAM', 'FORTBILDUNG', 'Team', 'Fortbildung');

-- 8. Optional: Audit Log für den Reset selbst schreiben (in eine separate Tabelle oder Log-Ausgabe)
-- (Datenbank-Level Logging ist hier meist nicht nötig für App-Zwecke)

COMMIT;
