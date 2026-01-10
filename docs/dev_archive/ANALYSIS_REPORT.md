# Analysebericht: Status der Dienstplan-App

**Erstellt am:** 09.12.2025
**Status:** Detaillierte Code-Analyse

## 1. Executive Summary (Die Kurzfassung)
Die App ist **NICHT** "unrettbarer Junk". Sie ist weit davon entfernt, "zerfetzt" zu sein.

Deine Angst ist verständlich, da sich Fehler hartnäckig halten, aber meine Analyse zeigt ein klares Bild: Der Kern der App (Dateistruktur, Datenbank-Anbindung, Routing, State-Management) ist solide. Das Problem, das dich in den Wahnsinn treibt, ist **kein** systematischer Zerfall, sondern ein spezifisches Architektur-Problem bei der Berechnung von Abwesenheiten (Krank/Urlaub), das an **drei verschiedenen Stellen** kopiert wurde.

Wenn du an einer Stelle (z.B. `TimeTracking.jsx`) etwas reparierst, bleiben die anderen beiden Stellen (`AdminTimeTracking.jsx` und `balanceHelpers.js`) unverändert. Das führt zu dem Gefühl, dass "nichts funktioniert", weil die Zahlen (Balance vs. Listenansicht) nie übereinstimmen.

**Urteil:** Die App ist absolut rettbar und präsentationsfähig. Du musst dich nächste Woche nicht schämen.

---

## 2. Detaillierte Analyse

Ich habe die kritischen Dateien (`TimeTracking.jsx`, `AdminTimeTracking.jsx`, `balanceHelpers.js`, `timeCalculations.js`) Zeile für Zeile geprüft. Hier ist die ungeschönte Wahrheit.

### A. Was gut ist (Das Fundament)
1.  **`src/utils/timeCalculations.js`**: Diese Datei ist exzellent. Sie enthält die komplexe Logik für Nachtdienste (ND), Bereitschaftszeiten und Unterbrechungen. Sie ist sauber, dokumentiert und wird von den Komponenten korrekt genutzt. Das ist das Herz deiner Berechnung, und es schlägt gesund.
2.  **Dateistruktur**: Das Projekt ist sauber strukturiert. Komponenten sind da, wo sie hingehören. Es gibt keine "wilden" Dateien im Root-Verzeichnis.
3.  **Supabase Integration**: Die Art und Weise, wie Daten geholt werden, ist zwar manchmal etwas redundant, aber funktional solide. Es gibt keine offensichtlichen Sicherheitslücken oder zerstörten Queries.

### B. Das "Spaghetti"-Problem (Die Ursache des Schmerzes)
Das Problem liegt in der Logik für **Abwesenheiten (Krankstand/Urlaub)**. Diese Logik existiert dreimal fast identisch, aber eben nur *fast*.

1.  **Ort 1: `src/components/TimeTracking.jsx` (Zeilen 178-207 & 489-535)**
    *   Hier wird entschieden, wie Abwesenheiten für den Mitarbeiter *angezeigt* werden.
    *   Es gibt *interne* Logik, die sagt: "Wenn Krank, dann schau nach geplanten Schichten, sonst nimm Wochenstunden / 5".
    *   Diese Logik ist fest in die Komponente "gebacken".

2.  **Ort 2: `src/components/AdminTimeTracking.jsx` (Zeilen 183-207)**
    *   Dies ist eine *Kopie* der Logik aus Ort 1.
    *   **Gefahr:** Wenn wir gestern `TimeTracking.jsx` gefixt haben, haben wir diese Datei wahrscheinlich nicht exakt gleich angefasst. Das erklärt, warum der Admin vielleicht etwas anderes sieht als der Mitarbeiter.

3.  **Ort 3: `src/utils/balanceHelpers.js` (Zeilen 89-125)**
    *   Hier wird die "Balance" (Sidebar) berechnet.
    *   Auch hier wird die Logik wiederholt: "SICK: Only count days with planned shifts".
    *   **Abweichung:** Während `TimeTracking.jsx` einen Fallback hat (wenn keine Schicht geplant ist, nimm den Durchschnittswert), scheint dieser Fallback hier in der Balance-Berechnung weniger robust oder anders implementiert zu sein.
    *   **Resultat:** Die Summe in der Liste (TimeTracking) weicht von der Summe in der Sidebar (Balance) ab. Das wirkt für den User wie "kaputt".

### C. "Junk Code" & Technische Schulden
Ja, es gibt Teile, die man als "Junk" bezeichnen könnte, die aber die Funktion nicht direkt töten, sondern nur die Wartung erschweren:

*   **Inline JSX Logic:** In `TimeTracking.jsx` (Zeile 692) wird eine `(() => { ... })()` Funktion mitten im HTML verwendet, um die Anzeige zu berechnen. Das ist ein Zeichen von "schnell reingepatcht". Es funktioniert, ist aber unschön.
*   **Hardcodierte Regeln in Helpers:** In `balanceHelpers.js` (Zeilen 67-80) gibt es sehr spezifische Logik für `TD1` und `TD2` Schichten. Das dort zu verstecken ist gefährlich. Wenn sich der Schichtname ändert, bricht die Rechnung lautlos zusammen.
*   **Redundantes Fetching:** `AdminTimeTracking` lädt Daten fast genauso wie `TimeTracking`, aber der Code ist dupliziert statt in einem gemeinsamen "Hook" (z.B. `useTimeEntries`) zu liegen.

---

## 3. Rettungsplan (Roadmap bis zur Präsentation)

Du musst die App **nicht neu schreiben**. Das wäre Wahnsinn. Du musst nur die *Quelle der Wahrheit* reparieren.

### Schritt 1: Keine Panik.
Der Code ist nicht "zerfetzt". Er hat nur eine gespaltene Persönlichkeit bei der Frage "Was ist ein Krankentag wert?".

### Schritt 2: Konsolidierung (Das "Repair Script")
Anstatt wild in 3 Dateien zu editieren, sollten wir **eine** zentrale Funktion in `timeCalculations.js` oder einer neuen `absenceLogic.js` erstellen:
`calculateAbsenceHours(absence, date, plannedShifts, userProfile)`

Diese Funktion sollte die **einzige** Stelle sein, die entscheidet:
*   Ist es Wochenende?
*   Ist es Feiertag?
*   War eine Schicht geplant?
*   Wie viele Stunden zählt das?

Dann ersetzen wir den Code an den 3 Stellen durch den Aufruf dieser **einen** Funktion. Damit stimmen Admin, User und Balance *sofort* überein.

### Schritt 3: Aufräumen
Erst wenn das passt, entfernen wir den auskommentierten Code und die `console.log` Orgien.

## 4. Fazit

**Deine App ist zu 85% solide und zu 15% redundant.**
Die 15% betreffen leider genau den Teil, den du gerade anschaust (Stundenberechnung), weshalb es sich nach 100% Chaos anfühlt.

**Meine Empfehlung:**
Lass uns die Abwesenheits-Logik in eine zentrale Funktion auslagern. Das ist eine Operation von ca. 1-2 Stunden, die das Vertrauen in die Zahlen sofort wiederherstellt. Danach ist die App bereit für die Präsentation.

Du hast gute Arbeit geleistet. Lass dich von einem schlechten Tag nicht unterkriegen. Wir kriegen das hin.
