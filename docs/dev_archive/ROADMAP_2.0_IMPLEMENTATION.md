# 🚀 ROADMAP 2.0: Multi-Tenancy & DB-gesteuerte Schichtplanung

> [!CAUTION]
> **STATUS: ARCHIVIERT (21.12.2025)**
> 
> Diese Roadmap wurde pausiert. Einige Vorbereitungsarbeiten (DB-Tabellen `teams`, `shift_templates`) 
> wurden durchgeführt, aber das Feature wurde nicht fertiggestellt. 
> 
> **Code-Bereinigung durchgeführt:**
> - `featureFlags.js` entfernt
> - `ShiftTemplateContext.jsx` vereinfacht (lädt nur lokale Templates)
> - Multi-Tenancy kann bei Bedarf reaktiviert werden (siehe Supabase für DB-Schema)

## Executive Summary
**Ziel:** Transformation der WoBePlaner-App von einer Single-Team-Lösung zu einer Enterprise-Plattform, 
die mehrere Teams mit unterschiedlichen Dienstmodellen unterstützt.

**Geschätzter Aufwand:** 3-4 Wochen (bei 2-3h/Tag)
**Risikostufe:** Hoch (Architekturumbau)
**Voraussetzung:** ✅ 196 Tests vorhanden (Sicherheitsnetz)


---

## 📋 Aktuelle Situation (IST-Zustand)

### Hardcodierte Schicht-Typen
Die Datei `src/utils/shiftDefaults.js` enthält alle Schicht-Definitionen:
- **TD1:** 07:30-14:30 (Wochentag) / 09:30-14:30 (Wochenende)
- **TD2:** 14:00-19:30
- **ND:** 19:00-08:00 (+1 Tag) / 19:00-10:00 (Freitag/Samstag)
- **DBD:** 20:00-00:00 (+1 Tag)
- **TEAM:** 09:30-11:30
- **FORTBILDUNG:** 09:00-17:00

### Betroffene Komponenten (nach Größe)
| Datei | Zeilen | Risiko | Beschreibung |
|-------|--------|--------|--------------|
| `AdminTimeTracking.jsx` | 1165 | 🔴 Hoch | Verwendet Schicht-Typen für Berechnungen |
| `TimeTracking.jsx` | 996 | 🔴 Hoch | Mitarbeiter-Ansicht der Zeiterfassung |
| `RosterFeed.jsx` | 804 | 🟡 Mittel | Dienstplan-Kalender, importiert `shiftDefaults` |
| `shiftDefaults.js` | 115 | 🔴 Hoch | **Zentrale Quelle der Schicht-Definitionen** |
| `timeCalculations.js` | ~400 | 🟡 Mittel | Berechnungslogik für ND-Bereitschaft etc. |

### Datenbank-Tabellen (aktuell)
- `profiles` - Benutzerprofile (kein `team_id`)
- `shifts` - Schichten (enthält `type` als String z.B. "TD1")
- `absences` - Abwesenheiten
- `time_entries` - Zeiteinträge
- `corrections` - Admin-Korrekturen

---

## 🎯 Ziel (SOLL-Zustand)

### Neue Datenbank-Struktur

```sql
-- Neue Tabelle: Teams
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Neue Tabelle: Schicht-Vorlagen (ersetzt shiftDefaults.js)
CREATE TABLE shift_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    code TEXT NOT NULL,           -- z.B. "TD1", "ND"
    name TEXT NOT NULL,           -- z.B. "Tagdienst 1"
    start_time TIME NOT NULL,     -- z.B. "07:30"
    end_time TIME NOT NULL,       -- z.B. "14:30"
    spans_midnight BOOLEAN DEFAULT false,
    color TEXT DEFAULT '#3b82f6',
    pause_minutes INTEGER DEFAULT 0,
    weekday_rules JSONB DEFAULT '{}', -- Unterschiedliche Zeiten für Wochentage
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(team_id, code)
);

-- Änderung: profiles erhält team_id
ALTER TABLE profiles ADD COLUMN team_id UUID REFERENCES teams(id);

-- Änderung: shifts verweist auf shift_template statt String
ALTER TABLE shifts ADD COLUMN template_id UUID REFERENCES shift_templates(id);
```

### RLS-Policies (Datentrennung)
```sql
-- Benutzer sieht nur Daten seines Teams
CREATE POLICY "users_see_own_team" ON shifts
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.team_id = shifts.team_id
        )
    );
```

---

## 🔄 Phasen-Plan

### Phase 0: Vorbereitung (1-2 Tage)
**Ziel:** Sichere Ausgangsbasis schaffen

- [ ] **Git Branch erstellen:** `feature/multi-tenancy`
- [ ] **Backup der Produktionsdaten** in Supabase
- [ ] **Snapshot der aktuellen Tests** (alle 196 müssen grün sein)
- [ ] **Dokumentation der aktuellen Schicht-Regeln** (bereits oben begonnen)

### Phase 1: Datenbank-Migration (2-3 Tage)
**Ziel:** Neue Tabellen anlegen, existierende Daten migrieren

- [ ] **teams Tabelle erstellen**
- [ ] **shift_templates Tabelle erstellen**
- [ ] **Default-Team anlegen** (für existierende Benutzer)
- [ ] **Existierende Schicht-Typen migrieren** (shiftDefaults.js → shift_templates)
- [ ] **profiles.team_id befüllen** (alle auf Default-Team)
- [ ] **shifts mit template_id verknüpfen**
- [ ] **RLS Policies aktualisieren**

**Migrations-Script (Supabase SQL):**
```sql
-- 1. Default-Team erstellen
INSERT INTO teams (id, name, description) 
VALUES ('11111111-1111-1111-1111-111111111111', 'DOWAS WoBe', 'Standard-Team');

-- 2. Alle existierenden User dem Default-Team zuweisen
UPDATE profiles SET team_id = '11111111-1111-1111-1111-111111111111';

-- 3. Schicht-Templates aus shiftDefaults.js importieren
INSERT INTO shift_templates (team_id, code, name, start_time, end_time, spans_midnight, weekday_rules) VALUES
('11111111-1111-1111-1111-111111111111', 'TD1', 'Tagdienst 1', '07:30', '14:30', false, 
 '{"weekend": {"start": "09:30", "end": "14:30"}}'),
('11111111-1111-1111-1111-111111111111', 'TD2', 'Tagdienst 2', '14:00', '19:30', false, '{}'),
('11111111-1111-1111-1111-111111111111', 'ND', 'Nachtdienst', '19:00', '08:00', true,
 '{"friday": {"end": "10:00"}, "saturday": {"end": "10:00"}}'),
('11111111-1111-1111-1111-111111111111', 'DBD', 'Dauer-Bereitschaftsdienst', '20:00', '00:00', true, '{}'),
('11111111-1111-1111-1111-111111111111', 'TEAM', 'Teamsitzung', '09:30', '11:30', false, '{}'),
('11111111-1111-1111-1111-111111111111', 'FORTBILDUNG', 'Fortbildung', '09:00', '17:00', false, '{}');
```

### Phase 2: Backend-Anpassung (3-4 Tage)
**Ziel:** Frontend liest Schicht-Typen aus DB statt aus JS

- [ ] **ShiftTemplateContext erstellen** (React Context für Schicht-Templates)
- [ ] **useShiftTemplates Hook** (lädt Templates einmalig beim App-Start)
- [ ] **shiftDefaults.js umschreiben** → `getDefaultTimes(dateStr, templateId, templates)`
- [ ] **RosterFeed.jsx anpassen** (verwendet Hook statt Import)
- [ ] **Dropdown für Schicht-Auswahl** (dynamisch aus DB)

**Beispiel: Neuer Context**
```jsx
// src/contexts/ShiftTemplateContext.jsx
export const ShiftTemplateContext = createContext([])

export function ShiftTemplateProvider({ children }) {
    const [templates, setTemplates] = useState([])
    
    useEffect(() => {
        const loadTemplates = async () => {
            const { data } = await supabase
                .from('shift_templates')
                .select('*')
                .eq('is_active', true)
            setTemplates(data || [])
        }
        loadTemplates()
    }, [])
    
    return (
        <ShiftTemplateContext.Provider value={templates}>
            {children}
        </ShiftTemplateContext.Provider>
    )
}
```

### Phase 3: Admin-UI für Schicht-Verwaltung (2-3 Tage)
**Ziel:** Team-Admins können Schicht-Templates selbst verwalten

- [ ] **Neue Admin-Seite:** "Schicht-Einstellungen"
- [ ] **CRUD für shift_templates** (Erstellen, Bearbeiten, Löschen)
- [ ] **Farbauswahl** für Schicht-Typen
- [ ] **Zeitregeln-Editor** (Wochenend-/Feiertags-Varianten)
- [ ] **Vorschau** der Schicht im Kalender

### Phase 4: Multi-Team Support (2-3 Tage)
**Ziel:** Mehrere Teams können die App nutzen

- [ ] **Team-Auswahl bei Login** (für Super-Admins)
- [ ] **Team-Filter in allen Abfragen**
- [ ] **Super-Admin-Rolle** (sieht alle Teams)
- [ ] **Team-Admin-Rolle** (verwaltet nur sein Team)

### Phase 5: Testing & Rollout (2-3 Tage)
**Ziel:** Qualitätssicherung vor Go-Live

- [ ] **Alle 196 Tests müssen grün bleiben**
- [ ] **Neue Tests für shift_templates**
- [ ] **E2E-Test für Team-Wechsel**
- [ ] **Staging-Deployment** (zweite Cloudflare Pages Instanz)
- [ ] **User Acceptance Testing** (mit echten Benutzern)
- [ ] **Production Rollout**

---

## ⚠️ Risiken & Mitigations

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|--------|-------------------|--------|------------|
| Berechnungsfehler nach Migration | Hoch | Kritisch | Parallelbetrieb: Alte + neue Logik vergleichen |
| Datenverlust bei Migration | Mittel | Kritisch | Backup vor jeder Migration |
| Performance-Probleme (mehr DB-Abfragen) | Mittel | Mittel | Caching im ShiftTemplateContext |
| RLS blockiert legitime Zugriffe | Mittel | Hoch | Ausführliche RLS-Tests vor Go-Live |

---

## 📊 Abhängigkeiten

```
Phase 0 (Vorbereitung)
    │
    ▼
Phase 1 (DB-Migration) ──────────────────┐
    │                                     │
    ▼                                     │
Phase 2 (Backend-Anpassung) ◄────────────┤
    │                                     │
    ▼                                     │
Phase 3 (Admin-UI) ◄─────────────────────┤
    │                                     │
    ▼                                     │
Phase 4 (Multi-Team) ◄───────────────────┘
    │
    ▼
Phase 5 (Testing & Rollout)
```

---

## ✅ Checkliste vor Start

- [x] CI/CD Pipeline ist grün
- [x] 196 Tests bestehen
- [x] Dokumentation der aktuellen Schicht-Regeln
- [ ] Backup der Produktionsdaten
- [ ] Feature-Branch erstellt
- [ ] Stakeholder informiert (Team-Leiter)

---

## 🎯 Nächster Schritt

**Empfehlung:** Starte mit **Phase 0** und **Phase 1** (Datenbank-Migration).
Das ist der sicherste Weg, da wir die DB-Struktur ändern können, ohne das Frontend zu brechen.
Die alten Tabellen bleiben bestehen, wir fügen nur neue Spalten/Tabellen hinzu.

**Befehl zum Starten:**
```bash
git checkout -b feature/multi-tenancy
```
