# 🧪 LAUNCH TEST PLAN & QA HANDBUCH

> **Rolle:** Lead QA Tester
> **Version:** 1.0 (Ready for Launch)
> **Fokus:** Business Critical Logic, Security & Usability

## 🚦 Test-Matrix Übersicht

| Bereich | Priorität | Risiko | Test-Ziel |
|---------|-----------|--------|-----------|
| **1. Nachtdienst & Zeiten** | 🔥 Hoch | Kritisch | Korrekte Abrechnung (Geld!) |
| **2. PWA & Offline** | 🔸 Mittel | Mittel | Datenverlust verhindern |
| **3. Integrität (FES)** | 🔥 Hoch | Kritisch | Rechtssicherheit |
| **4. Monatsabschluss** | 🔥 Hoch | Kritisch | Revisionssicherheit |

---

## 📋 Konkrete Test-Cases

### 1. Nachtdienst Logik (Der "Geld-Test")

Härtetest für die 19:00 Uhr und 50% Bereitschafts-Regel.

| ID | Test-Szenario | Start-Zustand | Prüfschritt (Aktion) | Erwartetes Ergebnis | Risiko |
|----|---------------|---------------|----------------------|---------------------|--------|
| **ND-01** | **Standard ND** | User "Max" | Zeiteintrag: `19:00` - `08:00`. Keine Unterbrechung. | Saldo: **10.25h** (7.5h Arbeit + 2.75h Bereitschaft). | Kritisch |
| **ND-02** | **Mitternachts-Cross** | User "Max" | Zeiteintrag abends beginnen, Datum endet am Folgetag. | System erkennt automatisch "Nächster Tag" und verweigert "Endzeit < Startzeit" Fehler. | Hoch |
| **ND-03** | **Unterbrechung (Klein)** | ND eingetragen | Unterbrechung: `02:00` - `02:45` (45 Min). | Saldo: **10.25h** + **1.0h** (45min → 60min round up) = **11.25h**. | Kritisch |
| **ND-04** | **Unterbrechung (Mini)** | ND eingetragen | Unterbrechung: `03:00` - `03:05` (5 Min). | Saldo: +30 Min Gutschrift (Minimum). | Mittel |

### 2. PWA & Netzstabilität (Der "Tunnel-Test")

Verhalten bei Verbindungsabbruch.

| ID | Test-Szenario | Start-Zustand | Prüfschritt (Aktion) | Erwartetes Ergebnis | Risiko |
|----|---------------|---------------|----------------------|---------------------|--------|
| **NET-01** | **Offline Write** | Formular offen | 1. Flugmodus an.<br>2. "Krankmeldung" senden. | UI zeigt Fehler/Loading. Darf NICHT "Erfolg" melden. Daten dürfen nicht verloren gehen (Formular bleibt offen). | Mittel |
| **NET-02** | **Flaky Network** | Schwaches WLAN | Report absenden bei 1 Balken. | Retries funktionieren oder saubere Fehlermeldung. Kein "Doppel-Post" der Daten. | Mittel |

### 3. Daten-Integrität & Signaturen

Verifikation des "Digitalen Siegels".

| ID | Test-Szenario | Start-Zustand | Prüfschritt (Aktion) | Erwartetes Ergebnis | Risiko |
|----|---------------|---------------|----------------------|---------------------|--------|
| **SEC-01** | **Signatur-Validierung** | Antrag signiert | Öffne "Details" eines signierten Antrags im Admin-Panel. | UI zeigt grünes Schild/Haken: "Signatur gültig" (SHA-256 Check OK). | Hoch |
| **SEC-02** | **Tamper Detection** | DB-Zugriff | 1. Ändere Datum in DB (`absences`).<br>2. Re-Open im UI. | UI zeigt **ROTE WARNUNG**: "Integritätsfehler / Signatur ungültig". | Kritisch |

### 4. Monatsabschluss & Locking

Sicherstellen, dass "Zu ist Zu".

| ID | Test-Szenario | Start-Zustand | Prüfschritt (Aktion) | Erwartetes Ergebnis | Risiko |
|----|---------------|---------------|----------------------|---------------------|--------|
| **LOC-01** | **Write to Locked** | Monat "Geschlossen" | Versuche Zeiteintrag für diesen Monat zu erstellen/editieren. | UI Buttons deaktiviert / API liefert Error (RLS Policy). | Kritisch |
| **LOC-02** | **Admin Bypass** | Monat "Geschlossen" | Admin versucht Korrektur zu erstellen. | Admin darf schreiben (Begründung Pflicht). | Niedrig |
| **LOC-03** | **Re-Open** | Monat "Geschlossen" | Admin setzt Status auf "Offen". | User kann wieder editieren. | Mittel |

---

## 🛑 Abbruch-Kriterien (Go/No-Go)

Der Launch muss **sofort** verschoben werden, wenn:
1.  Ein **ND-Test (ND-01 bis ND-04)** eine falsche Stundenanzahl liefert. (Falsches Gehalt!)
2.  Ein User Daten eines anderen Users sehen kann via API (**RLS Failure**).
3.  Die App bei Offline-Status abstürzt / White Screen of Death (**PWA Stability**).

---

> **Tester-Hinweis:** Bitte jeden fehlgeschlagenen Test sofort mit Screenshot und Console-Log in Sentry oder GitHub Issues melden.
