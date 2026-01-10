# Schichtzeiten & Stundenberechnung (WoBe-Team)

> **Letzte Aktualisierung:** 22.12.2024  
> **Quelle:** `src/utils/shiftDefaults.js` + `src/utils/timeCalculations.js`

---

## Tagdienste (100% Arbeitszeit)

| Dienst | Werktag | Stunden | WE/Feiertag | Stunden |
|--------|---------|---------|-------------|---------|
| **TD1** | 07:30 - 14:30 | 7.0h | 09:30 - 14:30 | 5.0h |
| **TD2** | 14:00 - 19:30 | 5.5h | 14:00 - 19:30 | 5.5h |
| **TEAM** | 09:30 - 11:30 | 2.0h | - | - |
| **FORTBILDUNG** | 09:00 - 17:00 | 8.0h | - | - |
| **DBD** | 20:00 - 00:00(+1) | 4.0h | 20:00 - 00:00(+1) | 4.0h |

---

## Nachtdienst (ND) - Mit Bereitschaftszeit

### Bereitschaftsregel
- **Zeitraum:** 00:30 - 06:00 (5.5h)
- **Faktor:** 50% (passive Zeit)
- **Unterbrechungen:** Werden mindestens 30 Minuten gutgeschrieben

### Stundentabelle

| Variante | Zeiten | Aktiv | Bereitschaft×0.5 | **TOTAL** |
|----------|--------|-------|------------------|-----------|
| ND Mo-Do, So | 19:00 - 08:00 (+1) | 7.5h | 2.75h | **10.25h** |
| ND Fr→Sa | 19:00 - 10:00 (+1) | 9.5h | 2.75h | **12.25h** |
| ND Sa→So | 19:00 - 10:00 (+1) | 9.5h | 2.75h | **12.25h** |

### Aktive Zeitblöcke im ND (ohne Unterbrechung)

| Block | Zeitraum | Dauer | Faktor |
|-------|----------|-------|--------|
| Abend | 19:00 - 00:30 | 5.5h | 100% |
| Bereitschaft | 00:30 - 06:00 | 5.5h | 50% |
| Morgen (Werktag) | 06:00 - 08:00 | 2.0h | 100% |
| Morgen (WE) | 06:00 - 10:00 | 4.0h | 100% |

---

## Unterbrechungen während Bereitschaft

> ⚠️ **WICHTIGE REGEL:** Jede "angekratzte" halbe Stunde wird als **volle halbe Stunde** geschrieben!

### Rundungsregel

```
Formel: Math.ceil(Dauer / 30) × 30 Minuten
```

| Echte Dauer | Berechnung | Gutgeschrieben |
|-------------|------------|----------------|
| 10 min | ⌈10/30⌉ × 30 | **30 min** |
| 25 min | ⌈25/30⌉ × 30 | **30 min** |
| 31 min | ⌈31/30⌉ × 30 | **60 min** |
| 45 min | ⌈45/30⌉ × 30 | **60 min** |
| 61 min | ⌈61/30⌉ × 30 | **90 min** |

### Auswirkung auf ND-Stunden

Unterbrechungen "konvertieren" Bereitschaftszeit (50%) zu Aktivzeit (100%)

| Unterbrechung | Gutgeschrieben | Effekt | Total |
|---------------|----------------|--------|-------|
| Keine | - | - | 10.25h |
| 01:00-01:10 (10min) | 30min | +0.25h | 10.50h |
| 01:00-01:30 (30min) | 30min | +0.25h | 10.50h |
| 01:00-01:45 (45min) | **60min** | +0.50h | 10.75h |
| 01:00-02:00 (60min) | 60min | +0.50h | 10.75h |

---

## Beispielrechnung: ND mit Unterbrechung

**Szenario:** Mittwoch ND, Unterbrechung 01:00-01:30

```
19:00 - 00:30 (Aktiv):      5.5h × 100% = 5.50h
00:30 - 01:00 (Bereit):     0.5h × 50%  = 0.25h
01:00 - 01:30 (Unterbrech): 0.5h × 100% = 0.50h
01:30 - 06:00 (Bereit):     4.5h × 50%  = 2.25h
06:00 - 08:00 (Aktiv):      2.0h × 100% = 2.00h
─────────────────────────────────────────────
TOTAL:                                   10.50h
```

---

## Abwesenheiten

| Typ | Regel | Stunden |
|-----|-------|---------|
| **Urlaub** | Werktag Mo-Fr | Wochenstunden ÷ 5 (z.B. 8h bei 40h/Woche) |
| **Urlaub** | WE/Feiertag | 0h |
| **Krankenstand** | Mit geplantem Dienst | Stunden des geplanten Dienstes |
| **Krankenstand** | Ohne geplanten Dienst | 0h |
