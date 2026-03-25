# Prompt: Lastenheft-Generierung — WoBePlaner

> **Verwendung:** Diesen Prompt vollständig in Claude Code einfügen (`claude` im Projektverzeichnis starten).  
> **Wichtig:** Claude Code muss Zugriff auf das gesamte Dateisystem des Projekts haben.

---

Analysiere die gesamte Codebasis dieses Projekts vollständig — ignoriere alle bestehenden `.md` Dokumentationsdateien (README.md, ARCHITECTURE.md, CLAUDE.md, DATABASE_SCHEMA.md etc.), sie sind unvollständig und bilden nicht die gesamte Realität des Codes ab. Lies jeden relevanten File in `src/`, `supabase/`, `migrations/`, `scripts/` und `tests/` direkt und eigenständig.

**Hintergrund & Ziel:** Diese App wurde mit React/Vite/Supabase entwickelt. Der zuständige IT-Techniker der Organisation beherrscht PHP und klassisches JavaScript (jQuery), aber kein React. Er muss die App aus Sicherheits- und Wartbarkeitsgründen vollständig verstehen, reviewen und langfristig betreuen können. Ein Rewrite in einen für ihn lesbaren Stack (PHP + jQuery + PostgreSQL) ist geplant. Dieses Lastenheft ist die **alleinige Grundlage** für diesen Rewrite — der Entwickler des Rewrites hat keinen Zugriff auf den React-Originalcode. Das Dokument muss daher lückenlos und präzise sein.

Erstelle ein vollständiges Lastenheft als `docs/LASTENHEFT.md` mit folgendem Inhalt:

---

## 1. Systemübersicht

- Was macht die App, für wen, in welchem organisatorischen Kontext
- Alle Benutzerrollen und ihre Unterschiede
- Unterstützte Geräte und Bildschirmgrößen (Mobile-First, Breakpoints)
- Deployment-Umgebung (Cloudflare Pages, Supabase EU)
- Abhängigkeiten zu externen Diensten

## 2. Funktionale Anforderungen

Alle Features vollständig und präzise beschrieben — keine Annahmen, keine Abkürzungen. Für jedes Feature: Was es tut, wer es nutzen kann, welche Eingaben es erwartet, welche Ausgaben es produziert, welche Regeln gelten. Orientiere dich ausschließlich am tatsächlichen Code, nicht an der Dokumentation.

## 3. Geschäftslogik im Detail

Alle Berechnungsalgorithmen vollständig dokumentiert — mit Formeln, Pseudocode oder Schritt-für-Schritt-Beschreibung. Mindestens abzudecken:

- **Stundenberechnung** — Wie werden Netto-Arbeitsstunden berechnet (inkl. Pausen, Rundungsregeln)
- **Bereitschaftszeiten** — Wie werden Bereitschaftsfenster erkannt und berechnet
- **Unterbrechungen** — Wie werden unterbrochene Zeiten aufgefüllt und zusammengeführt
- **DST-Handling** — Wie wird die Sommer-/Winterzeitumstellung behandelt
- **Soll-Ist-Saldo** — Wie wird der Überstunden-/Unterstundensaldo berechnet, rekursiver Vortrag ab Eintrittsdatum
- **Urlaubskontingent** — Berechnung, Abzug, Sonderregeln
- **Österreichische Feiertage** — Welche Feiertage, wie berechnet, Einfluss auf Stundenberechnung
- **Soli-Punkte (Fairness-Index)** — Formel, 6-Monats-Fenster, Gewichtung, Anonymisierung
- **Greedy-Algorithmus (Coverage-Zuweisung)** — Wie wird der optimale Einspringer ermittelt
- **SHA-256 Monatsintegritätsprüfung** — Worüber wird der Hash gebildet, wann wird er geprüft, Versionierung
- **Konfliktregeln (Diensttypen)** — Welche Dienstkombinationen sind nicht erlaubt und warum

## 4. Datenmodell

Alle Tabellen vollständig dokumentiert:

- Tabellenname, Zweck
- Alle Spalten mit Name, Datentyp, Nullable, Default, Beschreibung
- Primär- und Fremdschlüsselbeziehungen
- Indizes
- Alle RLS-Policies im Klartext: Tabellenname, Policy-Name, Rolle, Bedingung (SELECT/INSERT/UPDATE/DELETE)
- Alle Datenbank-Trigger
- Alle gespeicherten Prozeduren (RPCs) mit Parametern und Rückgabewerten

## 5. Programmablaufpläne (PAP) nach DIN 66001

Für jeden Hauptablauf ein vollständiger PAP als Mermaid Flowchart-Diagramm. Jeder PAP muss enthalten:

- Start- und Endpunkt (`([...])`)
- Prozessschritte (`[...]`)
- Entscheidungsrauten mit **allen** Verzweigungen (`{...}`)
- Datenbankoperationen (`[(...)`)
- Fehlerpfade und Sonderfälle — keine vereinfachten Happy-Path-Diagramme
- Alle Verzweigungen die im Code existieren müssen abgebildet sein

Abzudecken:

- Login & Ersteinrichtung (Einladung → Passwort → Rollenweiche)
- Dienstplan erstellen, bearbeiten, löschen (Admin) und ansehen (Mitarbeiter)
- Zeiterfassung inkl. DST, Bereitschaft, Unterbrechungen, Monatssperrung
- Urlaubsantrag (Stellen → Prüfung → Genehmigung/Ablehnung)
- Krankmeldung & Einspring-Voting inkl. Benachrichtigungen und Soli-Punkte-Berechnung
- Monatsbericht inkl. SHA-256 Integritätsprüfung, Einreichung, Genehmigung, Entsperrung
- Mitarbeiterverwaltung (Anlegen, Bearbeiten, Deaktivieren)

## 6. Schnittstellenbeschreibung

- Alle Supabase RPCs: Name, Parameter (Typ, Pflicht/Optional), Rückgabewert, Zweck
- Alle Edge Functions: Trigger, Eingabe, Ausgabe, externe Aufrufe
- Alle Realtime-Channels: Tabelle, Event-Typ, wer abonniert, wofür
- PWA Service Worker: Caching-Strategie, Offline-Verhalten

## 7. Sicherheitskonzept

- Auth-Mechanismus vollständig beschrieben (JWT, Token-Lebensdauer, Refresh)
- Rollenmodell (wie wird die Rolle gesetzt, wie wird sie geprüft)
- Alle RLS-Policies nochmals zusammengefasst aus Sicherheitsperspektive
- Welche Daten sind für welche Rolle sichtbar — vollständige Matrix
- Audit-Log: Was wird geloggt, wer kann es lesen, kann es verändert werden
- Einladungsprozess: Wie werden neue Nutzer angelegt, was verhindert unbefugten Zugang
- Welche Daten laufen durch den Browser (Client-Side) vs. bleiben serverseitig

## 8. Nicht-funktionale Anforderungen

- Mobile-First: Mindestbreite, Breakpoints, Touch-Interaktionen
- PWA: Offline-Fähigkeit, welche Funktionen offline verfügbar
- Performance: Lazy Loading, Realtime-Subscriptions
- Barrierefreiheit: was ist implementiert
- Österreich-spezifisch: Feiertage, Arbeitsrecht, Zeitzone (Europe/Vienna)
- DSGVO: welche Daten, Löschkonzept, Datenhaltung EU

## 9. Bekannte Bugs & Tech Debt

Lies den Code und dokumentiere alle bekannten Probleme — nicht aus der Dokumentation, sondern aus dem Code selbst (Kommentare, TODO, fehlerhafte Logik, inkonsistente Implementierungen). Für jeden Bug: Datei, Zeile, Beschreibung, Auswirkung, Schwere (kritisch / mittel / niedrig).

---

**Abschluss-Anweisung:**

Schreibe das Dokument so, dass ein erfahrener PHP/jQuery-Entwickler ohne React-Kenntnisse und ohne Zugriff auf den React-Originalcode die App vollständig und korrekt neu implementieren kann. Sei präzise bei Algorithmen. Keine Annahmen. Keine Abkürzungen. Nur was der Code tatsächlich tut — nicht was die Dokumentation behauptet.
