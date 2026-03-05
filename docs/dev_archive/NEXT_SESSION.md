# 📅 Nächste Session (06.03.2026)

## 📌 Status Quo (Stand 06.03.2026)
Wir haben heute das neue **Fairness-Index Coverage System** für Krankheitsvertretungen implementiert und deployt.
Es beinhaltet ein blindes Abstimmungssystem (🟢/🟡/🔴) ohne Klarnamen, basierend auf dem Flex-Saldo und Minusstunden der mitarbeitenden Personen. Jeder im Dienst kann die Abstimmung schließen ("Bist du im Dienst?" Dialog), wobei das System automatisch den passendsten Kandidaten einsetzt. 

Zuletzt haben wir noch einen Fehler ("Race Condition") beim Anlegen der Abstimmungen in der Supabase Edge Function gefixt, wodurch das UI anfangs nicht auftauchte.

## 🎯 Fokus für die nächste Session

1. **User Testing des Coverage Systems:** 
   - Das System (und der Bugfix der Race Condition) konnte heute auf Cloudflare nicht mehr vollumfänglich vom User durchgespielt werden.
   - **Aufgabe:** Krankmeldung in der App einstellen und prüfen, ob
     1. Das Rote Alert Banner oben erscheint.
     2. Die Push Benachrichtigung (Edge Function) ankommt.
     3. Die anonyme Abstimmung (CoverageVotingPanel) 🟢/🟡/🔴 fehlerfrei funktioniert.
     4. Der Dienstabschluss ("Bist du im Dienst?" -> Nachfolge bestimmen) den Dienst erfolgreich zuweist.

2. **Feinschliff & Edge Cases:** 
   - Feedback aus dem direkten Test einarbeiten (z.B. Texte im UI, Layout-Anpassungen, Lesbarkeit des Fairness-Index Breakdowns).

3. *(Optional) Neue Features nach Wunsch des Users (z.B. Beobachter-Rolle oder PDF-Optimierungen).*

## 💡 Kontext für die KI (Morgen)
- Der Code für das Coverage System liegt primär in `DayCard.jsx`, `CoverageVotingPanel.jsx`, `RosterFeed.jsx` und den Utils (`fairnessIndex.js`, `coverageEligibility.js`).
- Die Datenbank-Tabellen lauten: `coverage_requests` & `coverage_votes`.
- Supabase Edge Function: `notify-sickness`. (Inklusive 2-Sekunden Sleep Workaround für die Race Condition mit dem RPC Call).
- Alle Änderungen sind im `PROJECT_CONTEXT_WIKI.md` und auf GitHub dokumentiert.
