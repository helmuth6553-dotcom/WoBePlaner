# Deployment Guide - Dienstplan App

Diese Anleitung beschreibt die Schritte zum Deployment der Dienstplan-App.

---

## Voraussetzungen

- Node.js 18+ 
- npm oder yarn
- Supabase Projekt (bereits konfiguriert)
- Cloudflare Pages Account (optional, für Produktion)

---

## Lokale Entwicklung

### 1. Repository klonen

```bash
git clone <repository-url>
cd dienstplan-app
```

### 2. Dependencies installieren

```bash
npm install
```

### 3. Umgebungsvariablen konfigurieren

Kopiere `.env.example` nach `.env.local`:

```bash
cp .env.example .env.local
```

Bearbeite `.env.local` mit deinen Supabase-Credentials:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

> **Hinweis:** Die Fallback-Werte in `src/supabase.js` funktionieren für Entwicklung, 
> aber für Produktion sollten immer Umgebungsvariablen verwendet werden.

### 4. Entwicklungsserver starten

```bash
npm run dev
```

Die App läuft dann unter `http://localhost:5173`

---

## Produktion Build

### 1. Build erstellen

```bash
npm run build
```

Der Build wird im `dist/` Ordner erstellt.

### 2. Build lokal testen

```bash
npm run preview
```

---

## Deployment auf Cloudflare Pages

### Option A: Direct Upload

1. Build lokal erstellen: `npm run build`
2. Cloudflare Dashboard öffnen → Pages
3. "Upload assets" wählen
4. `dist/` Ordner hochladen

### Option B: Git Integration

1. Repository mit Cloudflare Pages verbinden
2. Build-Einstellungen:
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: `/` (oder Unterordner falls monorepo)
3. Umgebungsvariablen in Cloudflare setzen:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

---

## Umgebungsvariablen

| Variable | Beschreibung | Erforderlich |
|----------|--------------|--------------|
| `VITE_SUPABASE_URL` | Supabase Projekt-URL | Ja (Produktion) |
| `VITE_SUPABASE_ANON_KEY` | Supabase Anonymous Key | Ja (Produktion) |

> **Sicherheitshinweis:** Der `anon` Key ist für öffentliche Nutzung gedacht
> und wird durch RLS Policies geschützt. Er darf im Frontend verwendet werden.

---

## Supabase Konfiguration

### Vor dem ersten Deployment prüfen:

- [ ] RLS (Row Level Security) ist für alle Tabellen aktiviert
- [ ] Policies sind wie in `docs/RLS_POLICIES.md` dokumentiert konfiguriert
- [ ] Auth-Einstellungen sind korrekt (Email/Password enabled)
- [ ] Realtime ist für `shifts`, `shift_interests`, `absences` aktiviert

### Wichtige RPC-Funktionen

Die App verwendet folgende Supabase RPC-Funktionen:

| Funktion | Beschreibung |
|----------|--------------|
| `perform_shift_swap` | Schichttausch zwischen Mitarbeitern |
| `create_signed_absence` | Signierter Urlaubsantrag |
| `mark_absences_as_urgent` | Markiert Schichten als dringend bei Krankmeldung |

---

## Fehlerbehebung

### App zeigt "Forbidden" oder Auth-Fehler

- Prüfe, ob RLS Policies korrekt konfiguriert sind
- Prüfe, ob der `anon` Key korrekt ist

### Realtime Updates funktionieren nicht

- Prüfe, ob Realtime für die betroffenen Tabellen aktiviert ist
- Prüfe Browser-Konsole auf WebSocket-Fehler

### Build schlägt fehl

```bash
# Dependencies neu installieren
rm -rf node_modules
npm install

# Cache leeren und neu bauen
npm run build -- --force
```

---

## Sicherheits-Checkliste für Produktion

- [ ] Umgebungsvariablen in Cloudflare/Hosting gesetzt (nicht hardcoded)
- [ ] RLS Policies aktiviert und getestet
- [ ] Kein Service Role Key im Frontend-Code
- [ ] HTTPS aktiviert (Cloudflare macht das automatisch)
- [ ] Supabase Auth-Settings: Passwort-Mindestlänge konfiguriert

---

*Zuletzt aktualisiert: 2025-12-11*
