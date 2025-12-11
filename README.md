# Dienstplan-App

Eine moderne Webanwendung zur Verwaltung von Dienstplänen, Urlaubsanträgen und Zeiterfassung für soziale Einrichtungen.

## Funktionen

*   **Dienstplan-Management**: Interaktive Erstellung und Verwaltung von Schichtplänen.
*   **Zeiterfassung**: Detaillierte Erfassung von Arbeitszeiten inkl. Überstundenberechnung.
*   **Urlaubsverwaltung**: Digitales Antragswesen für Urlaub und Abwesenheiten.
*   **Mitarbeiter-Portal**: Übersicht über eigene Schichten, Stundenkonten und Anträge.
*   **Admin-Dashboard**: Zentrale Verwaltung von Mitarbeitern, Rollen und System-Einstellungen.
*   **PDF-Export**: Generierung von Monatsberichten und Stundennachweisen.

## Technologie-Stack

*   **Frontend**: React, Vite
*   **Styling**: Tailwind CSS
*   **Backend / Datenbank**: Supabase (PostgreSQL, Auth, Realtime)
*   **Hosting**: Cloudflare Pages / Netlify (Empfohlen)

## Installation & Setup

Voraussetzungen: Node.js (v18+)

1.  **Repository klonen**
    ```bash
    git clone <repository-url>
    cd dienstplan-app
    ```

2.  **Abhängigkeiten installieren**
    ```bash
    npm install
    ```

3.  **Umgebungsvariablen konfigurieren**
    Erstelle eine `.env` Datei im Hauptverzeichnis basierend auf `.env.example`:
    ```
    VITE_SUPABASE_URL=your_project_url
    VITE_SUPABASE_ANON_KEY=your_anon_key
    ```

4.  **Entwicklungsserver starten**
    ```bash
    npm run dev
    ```

## Build für Production

```bash
npm run build
```
Die Dateien liegen anschließend im `dist` Ordner bereit für das Deployment.

## Sicherheit

Diese Anwendung nutzt Supabase Row Level Security (RLS) policies, um sicherzustellen, dass Nutzer nur auf Daten zugreifen können, für die sie berechtigt sind.
