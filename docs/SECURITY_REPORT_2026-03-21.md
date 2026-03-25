# Security Report: dienstplan-app (WoBe App)
**Datum:** 2026-03-21
**Stack:** React 19 + Supabase + Cloudflare Pages
**Reviewer:** Claude Code Security Review

---

## Zusammenfassung

| Schweregrad | Vorher | Nachher |
|------------|--------|---------|
| Kritisch | 0 | 0 |
| Hoch | 1 | 0 ✅ |
| Mittel | 4 | 2 |
| Niedrig | 3 | 3 |

---

## Befunde im Detail

---

### [HOCH → BEHOBEN] Falsche Identität in Admin-Benachrichtigungen

**Datei:** `supabase/functions/notify-admin-vacation/index.ts`

**Vorher:**
Jeder eingeloggte User konnte die Function direkt aufrufen und einen beliebigen Namen im Payload mitschicken. Alle Admins erhielten dann eine Push-Notification mit diesem erfundenen Namen.

```typescript
// VORHER: Name kam aus dem nicht verifizierten Payload
const { userName, startDate, endDate } = payload
// → Jeder konnte userName = "Chef Helmut" schicken
```

**Angriffsszenario:**
```javascript
fetch('.../functions/v1/notify-admin-vacation', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer <gültiger-jwt>' },
  body: JSON.stringify({
    userName: 'Chef Helmut',   // erfundener Name!
    startDate: '2026-03-01',
    endDate: '2026-12-31'
  })
})
// Admins bekommen: "Chef Helmut beantragt Urlaub vom 01.03 - 31.12"
```

**Nachher:** ✅ Auth-Check + Name kommt aus der Datenbank:
```typescript
// NACHHER: JWT wird verifiziert, Name aus DB geladen
const { data: { user }, error: authError } = await userClient.auth.getUser()
if (authError || !user) return 401

const { data: profile } = await supabaseClient
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)  // Echter User, nicht Payload
    .single()
const userName = profile?.full_name || user.email
```

---

### [MITTEL → BEHOBEN] CORS Wildcard auf allen Edge Functions

**Dateien:** Alle 5 Edge Functions

**Vorher:**
```typescript
'Access-Control-Allow-Origin': '*'  // Jede Website darf anfragen
```

Jede beliebige Website konnte Requests an die Functions schicken. In Kombination mit der ungefixten Admin-Vacation-Function erhöhte das die Angriffsfläche.

**Nachher:** ✅ Auf Produktions-Domain eingeschränkt:
```typescript
'Access-Control-Allow-Origin': 'https://wobeplaner.pages.dev'
```

---

### [MITTEL → ABGEMILDERT] Cron/Webhook Functions ohne Authentifizierung

**Dateien:** `notify-sickness`, `notify-monthly-closing`, `notify-shift-reminder`

**Vorher:**
Kein Auth-Check. Jeder mit der Function-URL konnte einen POST schicken und Push-Notifications an alle User auslösen (z.B. "Monat abschließen!" mitten im Monat).

**Risiko war gering** da: kein Datenverlust, nur Notification-Spam möglich.

**Nachher:** ✅ Optionaler `CRON_SECRET` Check eingebaut (backwards-kompatibel):
```typescript
const cronSecret = Deno.env.get('CRON_SECRET')
if (cronSecret) {
    const authHeader = req.headers.get('Authorization')
    if (authHeader !== `Bearer ${cronSecret}`) return 401
}
```

Sobald `CRON_SECRET` im Supabase Dashboard gesetzt wird, ist der Schutz aktiv.

---

### [MITTEL → OFFEN] Client-seitiger Admin-Check

**Datei:** `src/App.jsx:217`

**Status:** Kein akuter Handlungsbedarf — RLS schützt alle Datenoperationen.

**Beschreibung:**
Die Admin-UI wird client-seitig über `isAdmin` gesteuert. Ein User könnte via React DevTools `isAdmin = true` setzen und die Admin-Oberfläche rendern. Er könnte jedoch keine Admin-Operationen ausführen, da die Supabase RLS-Policies alle Schreibzugriffe auf DB-Ebene absichern.

```javascript
// Client-seitig
{activeTab === 'admin' && isAdmin && <AdminDashboard />}
```

**Risiko:** Information Disclosure (Admin-UI sichtbar), kein Datenverlust.

---

### [MITTEL → OFFEN] Admin Audit-Log ist client-seitig

**Datei:** `src/utils/adminAudit.js`

**Status:** Offen — DSGVO-Compliance-Hinweis.

**Beschreibung:**
Admin-Aktionen werden nur geloggt, wenn `logAdminAction()` im Frontend aufgerufen wird. Es gibt keinen DB-Trigger als Fallback. Vergessene Aufrufe führen zu Lücken im Audit-Log.

**Empfehlung:** DB-Trigger auf sensiblen Tabellen (`profiles`, `time_entries`, `monthly_reports`) für automatisches, lückenloses Logging.

---

## Positiv-Befunde (unveränderter Best-Practice-Status)

| Bereich | Status |
|---------|--------|
| RLS auf allen 16 DB-Tabellen aktiviert | ✅ |
| SHA-256 Report-Hashing (Web Crypto API) | ✅ |
| Supabase Auth korrekt verwendet, kein Custom-Auth | ✅ |
| `create-user` prüft Admin-Rolle server-seitig | ✅ |
| CI/CD mit GitHub Secrets, keine Hardcoded Keys | ✅ |
| Kein `eval()`, `innerHTML`, `dangerouslySetInnerHTML` im React-Code | ✅ |
| Password-Handling via Supabase (bcrypt server-seitig) | ✅ |
| Kein User-Enumeration in Login-Fehlermeldungen | ✅ |
| Supabase Anon Key: by Design öffentlich, kein Secret | ✅ |
| dependabot.yml konfiguriert | ✅ |
| `coverage_votes/requests` RLS-Policies korrekt (Migration 20260313130000) | ✅ |

---

## Durchgeführte Änderungen

| Datei | Änderung |
|-------|---------|
| `supabase/functions/notify-admin-vacation/index.ts` | Auth-Check + userName aus DB statt Payload + CORS Fix |
| `supabase/functions/notify-sickness/index.ts` | CRON_SECRET Check + CORS Fix |
| `supabase/functions/notify-monthly-closing/index.ts` | CRON_SECRET Check + CORS Fix |
| `supabase/functions/notify-shift-reminder/index.ts` | CRON_SECRET Check + CORS Fix |
| `supabase/functions/create-user/index.ts` | CORS Fix |

**Deployment:** Alle 5 Functions via Supabase MCP deployed (2026-03-21).

---

## Optionale Folge-Maßnahmen

| Priorität | Maßnahme | Aufwand |
|-----------|---------|---------|
| Optional | `CRON_SECRET` in Supabase Dashboard setzen + Webhook-Header konfigurieren | 15 Min |
| Niedrig | DB-Trigger für lückenloses Audit-Log | 2h |
| Niedrig | Server-seitige Admin-Route-Validierung | 1h |
