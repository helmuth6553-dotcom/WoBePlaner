# Push Notifications Einrichtung

Diese Anleitung führt dich Schritt für Schritt durch das Deployment der Supabase Edge Function und die Einrichtung des Datenbank-Webhooks.

## 1. Voraussetzungen

Stelle sicher, dass du die Supabase CLI installiert und dich eingeloggt hast. Öffne dein Terminal im Projektordner.

```bash
npx supabase login
```

## 2. VAPID Secret setzen (WICHTIG!)

Die Edge Function benötigt den **privaten Schlüssel**, den wir vorhin generiert haben, um Nachrichten signieren zu dürfen. Diesen dürfen wir nicht im Code speichern, sondern müssen ihn als "Secret" in Supabase hinterlegen.

Führe diesen Befehl aus (ersetze `<DEINE_PROJEKT_ID>` mit deiner Supabase Project ID - diese findest du in der URL deines Dashboards: `https://supabase.com/dashboard/project/<PROJECT_ID>`):

```bash
npx supabase secrets set VAPID_PRIVATE_KEY=FvE-vxPiZi9AUD43pPd4ocTMuOFOR98xUmosRt87d-c --project-ref <DEINE_PROJEKT_ID>
```

*(Der Key oben ist der, den wir vorhin generiert haben)*.

## 3. Edge Function deployen

Lade nun den Code für die Benachrichtigungs-Logik hoch.

```bash
npx supabase functions deploy notify-sickness --project-ref <DEINE_PROJEKT_ID> --no-verify-jwt
```

Nach erfolgreichem Upload zeigt dir das Terminal eine URL an, z.B.:
`https://<project-ref>.supabase.co/functions/v1/notify-sickness`
**Kopiere diese URL!**

## 4. Webhook in Supabase einrichten

Damit die Funktion automatisch aufgerufen wird, wenn jemand krank ist, müssen wir einen "Database Webhook" erstellen.

1.  Gehe in dein **Supabase Dashboard**.
2.  Klicke im linken Menü auf **Database Icon** 🗄️ -> **Webhooks**.
3.  Klicke auf den grünen Button **"Create a new webhook"**.

### Formular ausfüllen:

**Schritt 1: General**
*   **Name:** `notify-sickness`
*   **Table:** Wähle `absences` (schema: `public`).
*   **Events:** Hake nur `INSERT` an.

**Schritt 2: Configuration**
*   **Type:** Wähle `Make a HTTP Request` (manchmal auch "Webhook").
*   **Method:** `POST`.
*   **URL:** Füge hier die URL aus Schritt 3 ein.
*   **Timeout:** Standard lassen (1000ms oder ähnlich).
*   **HTTP Auth:** Klicke auf "Add new header".
    *   Name: `Authorization`
    *   Value: `Bearer <DEIN_SERVICE_ROLE_KEY>`
    *(Den Service Role Key findest du unter Project Settings -> API -> `service_role` secret)*.
    *Dies ist wichtig, damit die Function weiß, dass der Aufruf berechtigt ist.*

Klicke auf **"Confirm"** oder **"Create"**.

## 5. Testen

1.  Öffne die App (als ein User, der NICHT Max Mustermann ist, z.B. Christopher).
2.  Gehe ins Profil und aktiviere "Benachrichtigungen".
3.  Logge dich aus oder öffne einen anderen Browser.
4.  Logge dich als Admin oder ein anderer User ein.
5.  Erstelle eine Abwesenheit vom Typ "Krank".
6.  Christopher sollte nun (sofern der Browser offen ist oder der Service Worker läuft) eine Benachrichtigung erhalten!
