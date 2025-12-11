# Supabase Row Level Security (RLS) Policies

Diese Dokumentation beschreibt die erwarteten RLS-Policies für die Dienstplan-App.

> **Wichtig:** RLS Policies werden im Supabase Dashboard konfiguriert, nicht im Code.
> Diese Datei dient als Referenz für das IT-Review.

---

## Tabellen-Übersicht

| Tabelle | RLS Aktiviert | Beschreibung |
|---------|---------------|--------------|
| `profiles` | ✓ | Benutzerprofile |
| `shifts` | ✓ | Schichten/Dienste |
| `shift_interests` | ✓ | Dienstinteressen |
| `shift_logs` | ✓ | Änderungsprotokoll |
| `absences` | ✓ | Abwesenheiten (Urlaub, Krank) |
| `time_entries` | ✓ | Zeiterfassungseinträge |
| `monthly_reports` | ✓ | Monatsberichte |
| `roster_months` | ✓ | Dienstplan-Monate |
| `admin_actions` | ✓ | Admin-Audit-Log |
| `invitations` | ✓ | Einladungen |

---

## Erwartete Policies pro Tabelle

### `profiles`

```sql
-- Benutzer können ihr eigenes Profil lesen
CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);

-- Benutzer können ihr eigenes Profil aktualisieren
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

-- Admins können alle Profile sehen
CREATE POLICY "Admins can view all profiles" ON profiles
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Admins können alle Profile bearbeiten
CREATE POLICY "Admins can update all profiles" ON profiles
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );
```

### `shifts`

```sql
-- Alle authentifizierten Benutzer können Schichten sehen
CREATE POLICY "Authenticated users can view shifts" ON shifts
    FOR SELECT USING (auth.role() = 'authenticated');

-- Nur Admins können Schichten erstellen/bearbeiten/löschen
CREATE POLICY "Admins can manage shifts" ON shifts
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );
```

### `shift_interests`

```sql
-- Benutzer können ihre eigenen Interessen sehen
CREATE POLICY "Users can view own interests" ON shift_interests
    FOR SELECT USING (user_id = auth.uid());

-- Benutzer können Interessen für sich erstellen
CREATE POLICY "Users can create own interests" ON shift_interests
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- Benutzer können eigene Interessen löschen
CREATE POLICY "Users can delete own interests" ON shift_interests
    FOR DELETE USING (user_id = auth.uid());

-- Admins können alle Interessen verwalten
CREATE POLICY "Admins can manage all interests" ON shift_interests
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );
```

### `absences`

```sql
-- Alle authentifizierten Benutzer können Abwesenheiten sehen
CREATE POLICY "Authenticated can view absences" ON absences
    FOR SELECT USING (auth.role() = 'authenticated');

-- Benutzer können eigene Abwesenheiten erstellen
CREATE POLICY "Users can create own absences" ON absences
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- Benutzer können eigene BEANTRAGTE Abwesenheiten löschen
CREATE POLICY "Users can delete own pending absences" ON absences
    FOR DELETE USING (user_id = auth.uid() AND status = 'beantragt');

-- Admins können alle Abwesenheiten verwalten
CREATE POLICY "Admins can manage all absences" ON absences
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );
```

### `time_entries`

```sql
-- Benutzer können ihre eigenen Zeiteinträge sehen
CREATE POLICY "Users can view own time entries" ON time_entries
    FOR SELECT USING (user_id = auth.uid());

-- Benutzer können eigene Zeiteinträge erstellen
CREATE POLICY "Users can create own time entries" ON time_entries
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- Benutzer können eigene Zeiteinträge bearbeiten
CREATE POLICY "Users can update own time entries" ON time_entries
    FOR UPDATE USING (user_id = auth.uid());

-- Admins können alle Zeiteinträge verwalten
CREATE POLICY "Admins can manage all time entries" ON time_entries
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );
```

### `monthly_reports`

```sql
-- Benutzer können ihre eigenen Berichte sehen
CREATE POLICY "Users can view own reports" ON monthly_reports
    FOR SELECT USING (user_id = auth.uid());

-- Benutzer können eigene Berichte erstellen
CREATE POLICY "Users can create own reports" ON monthly_reports
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- Admins können alle Berichte sehen und verwalten
CREATE POLICY "Admins can manage all reports" ON monthly_reports
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );
```

### `admin_actions`

```sql
-- Nur Admins können Audit-Logs erstellen
CREATE POLICY "Admins can insert audit logs" ON admin_actions
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Nur Admins können Audit-Logs sehen
CREATE POLICY "Admins can view audit logs" ON admin_actions
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );
```

---

## Verifizierungs-Checklist

Bitte im Supabase Dashboard prüfen:

- [ ] `profiles` - RLS aktiviert, Policies wie oben beschrieben
- [ ] `shifts` - RLS aktiviert, Policies wie oben beschrieben
- [ ] `shift_interests` - RLS aktiviert, Policies wie oben beschrieben
- [ ] `shift_logs` - RLS aktiviert
- [ ] `absences` - RLS aktiviert, Policies wie oben beschrieben
- [ ] `time_entries` - RLS aktiviert, Policies wie oben beschrieben
- [ ] `monthly_reports` - RLS aktiviert, Policies wie oben beschrieben
- [ ] `roster_months` - RLS aktiviert
- [ ] `admin_actions` - RLS aktiviert, nur Admin-Zugriff
- [ ] `invitations` - RLS aktiviert, nur Admin-Zugriff

---

## Wie man RLS Policies im Supabase Dashboard prüft

1. Öffne das Supabase Dashboard
2. Navigiere zu **Database** → **Tables**
3. Wähle eine Tabelle aus
4. Klicke auf **Policies** im rechten Panel
5. Überprüfe, ob die Policies wie oben beschrieben konfiguriert sind

Alternativ: **SQL Editor** → Führe aus:
```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public';
```

---

## Bekannte Abweichungen

Falls die tatsächlichen Policies abweichen, hier dokumentieren:

| Tabelle | Erwartete Policy | Tatsächliche Policy | Begründung |
|---------|-----------------|---------------------|------------|
| - | - | - | - |

---

*Zuletzt aktualisiert: 2025-12-11*
