# 🔒 Supabase Backup Anleitung (vor Roadmap 2.0)

## Wann dieses Backup erstellen?
**BEVOR** du irgendwelche Datenbank-Änderungen für Multi-Tenancy durchführst!

---

## Schritt 1: In Supabase einloggen
1. Gehe zu https://supabase.com/dashboard
2. Wähle dein WoBePlaner Projekt

## Schritt 2: SQL Editor öffnen
1. Klicke auf "SQL Editor" im linken Menü
2. Klicke auf "New Query"

## Schritt 3: Backup-Tabellen erstellen
Kopiere dieses SQL und führe es aus:

```sql
-- ============================================
-- BACKUP VOR MULTI-TENANCY MIGRATION
-- Datum: 2025-12-17
-- ============================================

-- 1. Profiles Backup
CREATE TABLE IF NOT EXISTS _backup_profiles_20251217 AS 
SELECT * FROM profiles;

-- 2. Shifts Backup  
CREATE TABLE IF NOT EXISTS _backup_shifts_20251217 AS 
SELECT * FROM shifts;

-- 3. Absences Backup
CREATE TABLE IF NOT EXISTS _backup_absences_20251217 AS 
SELECT * FROM absences;

-- 4. Time Entries Backup
CREATE TABLE IF NOT EXISTS _backup_time_entries_20251217 AS 
SELECT * FROM time_entries;

-- 5. Corrections Backup
CREATE TABLE IF NOT EXISTS _backup_corrections_20251217 AS 
SELECT * FROM corrections;

-- 6. Monthly Reports Backup
CREATE TABLE IF NOT EXISTS _backup_monthly_reports_20251217 AS 
SELECT * FROM monthly_reports;

-- Bestätigung
SELECT 
    'Backup erstellt!' as status,
    (SELECT COUNT(*) FROM _backup_profiles_20251217) as profiles_count,
    (SELECT COUNT(*) FROM _backup_shifts_20251217) as shifts_count,
    (SELECT COUNT(*) FROM _backup_absences_20251217) as absences_count;
```

## Schritt 4: Verifizieren
Nach Ausführung solltest du eine Tabelle sehen mit:
- `status`: "Backup erstellt!"
- `profiles_count`: Anzahl der gesicherten Profile
- `shifts_count`: Anzahl der gesicherten Schichten
- etc.

---

## 🚨 Notfall-Rollback

Falls etwas schiefgeht und du zur ursprünglichen Datenstruktur zurück musst:

```sql
-- ============================================
-- ROLLBACK ZU BACKUP
-- NUR IM NOTFALL AUSFÜHREN!
-- ============================================

-- 1. Aktuelle (kaputte) Tabellen umbenennen
ALTER TABLE profiles RENAME TO profiles_broken;
ALTER TABLE shifts RENAME TO shifts_broken;
-- etc.

-- 2. Backup-Tabellen als Haupttabellen nutzen
ALTER TABLE _backup_profiles_20251217 RENAME TO profiles;
ALTER TABLE _backup_shifts_20251217 RENAME TO shifts;
-- etc.

-- 3. RLS Policies neu erstellen (falls nötig)
-- Die Policies müssen ggf. manuell wiederhergestellt werden
```

---

## ✅ Checkliste vor Migration

- [ ] SQL oben ausgeführt und "Backup erstellt!" gesehen
- [ ] In Supabase Table Editor geprüft, dass `_backup_*` Tabellen existieren
- [ ] Git Tag `v1.0.0-stable` existiert
- [ ] Feature Flag `VITE_FEATURE_MULTI_TENANCY=false` in `.env`

---

## 💡 Tipp: Supabase Project Backup

Zusätzlich zu den SQL-Backups kannst du in Supabase auch:
1. Settings → Database → Backups
2. "Create backup" klicken (wenn verfügbar in deinem Plan)

Dies erstellt einen vollständigen Datenbank-Snapshot.
