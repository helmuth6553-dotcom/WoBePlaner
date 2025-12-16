# 📊 Sentry.io Integration - WoBePlaner

## Übersicht

Die WoBePlaner-App verwendet **Sentry.io** für:
- 🐛 **Error Tracking**: Automatische Erfassung von JavaScript-Fehlern
- ⚡ **Performance Monitoring**: Überwachung von Ladezeiten und API-Calls
- 🔍 **Issue Tracking**: Gruppierung und Priorisierung von Fehlern

## 🔧 Setup-Anleitung

### 1. Sentry-Projekt erstellen

1. Gehe zu [sentry.io](https://sentry.io) und erstelle ein Konto
2. Wähle **"Create Project"**
3. Wähle **"React"** als Plattform
4. Notiere dir den **DSN** (Data Source Name)

### 2. Umgebungsvariable setzen

Füge den DSN zu deiner `.env.local` Datei hinzu:

```env
VITE_SENTRY_DSN=https://xxxxx@xxxxx.ingest.sentry.io/xxxxx
VITE_APP_VERSION=1.0.0
```

### 3. Für Cloudflare Pages Deployment

In Cloudflare Pages Dashboard:
1. Gehe zu **Settings > Environment Variables**
2. Füge hinzu:
   - `VITE_SENTRY_DSN` = dein DSN
   - `VITE_APP_VERSION` = aktuelle Version (z.B. `1.0.0`)

## 🔒 Datenschutz (DSGVO-Konformität)

Die Integration ist **datenschutzkonform** konfiguriert:

| Feature | Status | Beschreibung |
|---------|--------|--------------|
| **EU Data Residency** | ✅ Empfohlen | Aktiviere in Sentry-Einstellungen |
| **PII Scrubbing** | ✅ Aktiv | E-Mail-Adressen werden maskiert (`***@domain.com`) |
| **Session Replay** | ❌ Deaktiviert | Keine Video-Aufnahmen (Datenschutz) |
| **IP-Adressen** | ✅ Entfernt | Werden nicht gespeichert |
| **Cookies** | ✅ Entfernt | Auth-Tokens werden nie gesendet |

### Auftragsverarbeitungsvertrag (AVV)

Für DSGVO-Konformität sollte ein AVV mit Sentry abgeschlossen werden:
- [Sentry Data Processing Addendum](https://sentry.io/legal/dpa/)

## 📁 Dateistruktur

```
src/
├── lib/
│   └── sentry.js          # Sentry-Konfiguration & Utilities
├── main.jsx               # Sentry-Initialisierung (vor React)
├── AuthContext.jsx        # User-Context für Error-Zuordnung
├── utils/
│   └── monitoring.js      # Integration mit bestehendem Monitoring
└── components/
    └── ErrorBoundary.jsx  # React Error Boundary mit Sentry
```

## 🛠️ Verwendung in Komponenten

### Manueller Error-Report

```javascript
import { captureError, addBreadcrumb } from '../lib/sentry.js'

// Bei einem gefangenen Fehler:
try {
    await riskyOperation()
} catch (error) {
    captureError(error, {
        tags: { feature: 'pdf-export' },
        extra: { userId: user.id, month: '2024-12' },
    })
}
```

### Breadcrumbs für Kontext

```javascript
import { addBreadcrumb } from '../lib/sentry.js'

// Vor einer wichtigen Aktion:
addBreadcrumb('user-action', 'User clicked submit', {
    formData: { month: '2024-12' },
})
```

### Performance-Messung

```javascript
import { startPerfTimer, endPerfTimer } from '../utils/monitoring.js'

startPerfTimer('pdf-generation')
await generatePdf()
const duration = endPerfTimer('pdf-generation')
// Automatisch zu Sentry gesendet wenn > 1 Sekunde
```

## 📊 Sentry Dashboard

Nach dem Deployment siehst du im Sentry Dashboard:

1. **Issues**: Gruppierte Fehler mit Stack-Traces
2. **Performance**: Ladezeiten und langsame Operationen
3. **Releases**: Fehler pro Version (via `VITE_APP_VERSION`)
4. **Users Affected**: Wie viele User betroffen sind

## 🧪 Testen der Integration

### Lokaler Test

```bash
# 1. DSN in .env.local setzen
# 2. App starten
npm run dev

# 3. In der Browser-Konsole einen Fehler auslösen:
# Öffne DevTools und tippe:
throw new Error("Test error for Sentry")
```

### Production-Test

Nach Deployment auf Cloudflare Pages:
1. Öffne die App
2. Öffne Browser DevTools → Console
3. Führe aus: `window.testSentryError()`
4. Prüfe das Sentry Dashboard nach ~30 Sekunden

## ⚠️ Bekannte Einschränkungen

- **Offline-Modus**: Fehler im Offline-Modus werden nicht gesendet (PWA)
- **Sourcemaps**: Für lesbare Stack-Traces sollten Sourcemaps zu Sentry hochgeladen werden (TODO)
- **Rate Limits**: Free Tier hat 5.000 Events/Monat

## 📚 Weiterführende Docs

- [Sentry React Docs](https://docs.sentry.io/platforms/javascript/guides/react/)
- [Sentry Performance Monitoring](https://docs.sentry.io/product/performance/)
- [Sentry DSGVO](https://sentry.io/legal/dpa/)

---

*Dokumentation erstellt: 16.12.2025*
*Letzte Aktualisierung: 16.12.2025*
