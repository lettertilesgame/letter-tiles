# Letter Tiles

Ein Schreibtrainer-Prototyp im Browser: fallende Buchstaben-/Wort-Kacheln, die man wegtippen muss, bevor sie den unteren Rand erreichen. Reines Vanilla JS auf einem `<canvas>` – kein Framework, kein Build-Schritt.

## Modi

- **Lernpfad** – Duolingo-artiger Aufbau aus 8 Lektionen mit insgesamt 33 Leveln. Jedes Level schaltet das nächste frei, wenn du Dauer, Mindest-Anschläge und Genauigkeit erreichst. Bei Nichtbestehen gibt es ein Feedback-Overlay, das zeigt, an welchem Kriterium es lag.
- **Freier Modus** – endloses Spiel mit langsam steigender Schwierigkeit.

Die Eingabe ist auf A–Z beschränkt.

## Starten

Kein Build nötig. Entweder `index.html` direkt im Browser öffnen, oder lokal einen kleinen Server starten (empfohlen, damit `levels.json` per `fetch` geladen wird):

```bash
python3 -m http.server 8743
# dann http://localhost:8743 öffnen
```

Ohne Server greift automatisch eine eingebaute Level-Fallback-Liste (`FALLBACK_LESSONS` in `game_touchtyping.js`), die `levels.json` spiegelt.

## Dateien

- `index.html` – Markup, Styles und UI (Menü, Lernpfad, Overlays).
- `game_touchtyping.js` – Spiel-Engine, Modi, Level-Laden, Fortschritt (localStorage).
- `levels.json` – Lektionen und Level (Buchstaben, Ziele, Schwierigkeit).
