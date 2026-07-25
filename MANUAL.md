# 404 Busdriver — Handbuch

Browserbasierter MIDI-Controller für den Roland SP-404 MkII: steuert die fünf
Effekt-Busse, spielt Samples chromatisch oder in Skalen, triggert Pads,
schaltet Patterns und moduliert Parameter mit LFOs — alles über Web MIDI,
ohne Installation. Dieses Handbuch ist auch in der App verfügbar
(Setup > Handbuch).

## Voraussetzungen und Verbindung

- **Gerät:** SP-404 MkII per USB-C direkt am Rechner bzw. iPad/iPhone.
- **Browser:** Am Mac/PC Chrome oder Edge. Auf iPhone/iPad kann kein Browser
  Web MIDI — dort die App **MIDIWeb Browser** (App Store) installieren und die
  Busdriver-Adresse darin öffnen.
- **MIDI-Modus am Gerät** ([SHIFT]+[PAD 12] > SYSTEM > MIDI): Die FX-Steuerung
  funktioniert in Mode **A und B**. Für die Pattern-Umschaltung (PTN) braucht
  es Mode **B** und „PC Rx" = ON. Für das Pad-Board muss das Geräte-Setting
  „Pad MIDI Channels" zum PAD-CH-Button in der App passen (Standard 1/2).
- **Verbinden:** Setup (oben rechts) > „Mit SP-404 verbinden". Die App merkt
  sich die Ports und verbindet danach automatisch; taucht der SP-404 neu auf,
  übernimmt er automatisch Ein- und Ausgang.
- **Veralteter Stand?** Das Setup zeigt eine Build-Kennung. Wenn Features
  fehlen (besonders auf iOS): URL mit angehängtem `?v=99` neu laden — das
  umgeht den Browser-Cache.

## Aufbau

**Statusleiste:** Verbindungspunkt (tippen öffnet Setup), TX-Blinker (zeigt
gesendetes MIDI), BPM-Anzeige (erscheint bei eingehender MIDI Clock),
Übersicht/Fokus-Umschalter, XY, **ALL OFF** (schaltet alle Busse aus und merkt
sich den Zustand — zweiter Tipp stellt ihn wieder her), Snap, Setup.

**Tab-Leiste:** BUS 1–4 und IN (Fokus-View des Busses), PLAY (Spielflächen),
PTN (Patterns, Autopilot, Looper). Die LEDs in den Bus-Tabs zeigen jederzeit,
welche Effekte an sind.

## Fokus-View: ein Bus, sechs Fader

- **Fader:** Relativer Drag — der erste Touch springt nie, erst die Bewegung
  ändert den Wert. **Feinjustage:** während des Drags den Finger seitlich
  herausziehen (ab 60 px: 4-fach feiner, ab 120 px: 10-fach).
  **Doppeltipp** setzt den musikalischen Default. Tipp auf das Wertefenster
  öffnet einen ±1-Stepper. Am Desktop: Mausrad ±1, mit Shift ±10.
- **Parameter:** Die Fader tragen die echten Parameternamen des gewählten
  Effekts (aus dem Roland-Referenzhandbuch), Schalter erscheinen als Pads,
  kleine Auswahllisten als Stufen-Buttons, Notenwert-Parameter rasten.
- **EFX-Pad:** Tipp schaltet den Bus-Effekt an/aus. **Halten** (ab 0,35 s)
  wirkt momentary: an, solange der Finger liegt — für Stutter-Einwürfe.
- **‹ / ›** steppen durch die Favoriten (ersatzweise Zuletzt/alle).
- **RND** würfelt die kontinuierlichen Parameter (LEVEL/SEND/GAIN bleiben
  verschont). Direkt danach wird der Button zu **UNDO** (6 Sekunden).

## Übersicht

Alle fünf Busse nebeneinander. Auf iPad/Desktop sind die Streifen direkt
spielbar (schmale Fader); reicht die Breite nicht, wischt man horizontal
(auf Kartenkopf oder Effektnamen ansetzen). Auf dem iPhone hochkant erscheinen
Karten — Tipp führt zur Fokus-View. Bus-Tab-Tipp wechselt in der breiten
Übersicht nur den aktiven Bus, wirft Dich aber nicht aus der Ansicht.

## Effekte wählen

Tipp auf den Effektnamen öffnet den Picker: „Zuletzt", „Favoriten" (Stern per
**Halten** auf einen Eintrag), dann Kategorien mit Sprungleiste rechts.
Wichtig: **Die drei Bus-Typen haben unterschiedliche Effekt-Sets**
(Roland-Vorgabe) — z. B. liegen Sync Delay, Isolator und Resonator nur auf
BUS 3/4, die Stimm-Effekte nur auf INPUT.

**Direct FX (BUS 1/2):** Die fünf DFX-Slots sind am Gerät frei belegbar. Sag
der App im Setup („Direct FX Belegung"), was dort liegt — dann zeigen die
Fader die echten Parameternamen (z. B. „DFX3 · Sync Delay") und merken sich
Werte pro Effekt. Die Belegung wandert über den Geräte-Sync mit.

Die App merkt sich Parameterwerte **pro Effekt**: Beim Wechsel werden Effekt
und alle sechs Werte ans Gerät gesendet — App und Gerät bleiben synchron.
Parameter mit SYNC-Schalter wechseln ihre Anzeige zwischen Millisekunden und
Notenwerten.

## Snapshots (Snap-Panel)

Acht Slots für den kompletten Zustand aller fünf Busse (Effekt, Werte,
an/aus). **Tippen lädt** (leerer Slot: speichert), **Halten speichert** und
macht den Namen direkt im Slot editierbar, ✕ löscht. Oben zeigt das Panel,
was gerade gespeichert würde; jeder Slot listet seinen Inhalt
(z. B. „1● Tape Echo · 3○ Lo-fi": ● an, ○ aus).

**Export/Import:** JSON zum Kopieren/Einfügen — für Backups oder zum
Weitergeben an andere. **Geräte-Sync:** Snapshots, Favoriten und
DFX-Belegung wandern automatisch zwischen Deinen Geräten (Status im Panel);
gemergt wird pro Eintrag nach Zeitstempel, iPhone und iPad dürfen parallel
arbeiten.

## XY-Pad und LFOs

**XY:** Beide Achsen frei belegbar (Bus + Regler). Absolutes Kaoss-Verhalten:
Position = Wert. **MOMENTARY** lässt beide Werte beim Loslassen zum
Ausgangszustand zurückfedern — risikofreie Filter-Throws.

**LFO-Zeile:** Vier Modulator-Slots (Chips 1–4; oranger Punkt = läuft).
Pro Slot: Ziel, Wellenform (SIN/TRI/SQR/SAW/**RND** = Drift zwischen
Zufallswerten), Rate in Notenwerten (4/1 bis 1/16), Depth. Die Zeitquelle
zeigt der letzte Button: **CLK** (MIDI Clock liegt an) oder **TAP** —
mehrfach im Beat tippen setzt das Tempo und verankert die Phase.
Regeln: Greifst Du den Ziel-Fader, pausiert der LFO und übernimmt Deine
Position als neue Mitte. Ausschalten parkt den Wert sauber auf der Mitte.
Slot 4 ist als langsamer Drift vorkonfiguriert.

## PLAY: Keys, Scale, Pads

- **KEYS:** Klaviatur. Ziel „SAMPLE CH16" spielt das aktuelle Sample
  chromatisch (C2–C4, am iPhone mit Oktav-Paging). Ziel „VOCODER CH11"
  spielt Tonhöhen für den INPUT-Vocoder — rechts erscheint der
  **Pitch-Bend-Streifen** (federt zur Mitte zurück).
- **SCALE:** 4×4-Grid nur mit Tönen der gewählten Tonart. Grundton (C…B) und
  Skala (Dur, Moll, Pentatoniken, Dorisch, Mixolydisch, Blues) oben
  durchschalten. **ISO** = Reihen im Quart-Versatz (Move/Push-Layout,
  Akkorde als Griffbilder), **LIN** = fortlaufend. Grundtöne sind markiert.
  Hinweis: Der 404 hat im Chromatic-Modus eine eigene Scale/Key-Einstellung —
  beim Spielen aus der App dort am besten chromatisch lassen.
- **PADS:** Das Pad-Board, Anordnung wie am Gerät (Pad 1 oben links). Bänke
  A–J; der **★**-Tab ist ein freies Layout: Halten belegt jedes Feld mit
  beliebiger Bank+Pad-Kombination. „PAD-CH" muss dem Geräte-Setting
  „Pad MIDI Channels" entsprechen (Standard 1/2).

## PTN: Patterns, Autopilot, Looper

- **Grid:** Bank (A–J) wählen, Pattern (1–16) tippen — die App sendet den
  Program Change. Braucht Mode B und „PC Rx" ON; das Gerät bestätigt nicht,
  markiert ist der zuletzt gesendete.
- **Autopilot:** Wandert markov-artig durch die Patterns — quantisiert alle
  2/4/8 Takte (Tempo aus Clock oder Tap), wahlweise nur in der gewählten
  Bank oder über alle.
- **Looper:** Fernbedienung für den Looper-Modus des Geräts (REC, OVERDUB,
  DEL, UNDO/REDO, STOP ALL, Tempo-Reset, BPM-Regler). Das Gerät muss dafür
  selbst im Looper-Modus sein.

## Tempo und Ableton Link

Die BPM-Anzeige liest MIDI Clock von **jedem** angeschlossenen Port — auch
von AUM, Ableton oder einer Link-to-MIDI-Bridge. Die Link-Route: Die
Link-Quelle sendet Clock an den SP-404 (der folgt als Sync-Slave:
UTILITY > SYSTEM > MIDI, „MIDI Sync") und an den Rechner — Gerät, App und
Link-Session laufen dann synchron. LFOs und Autopilot nutzen die Clock
automatisch; ohne Clock gilt das Tap-Tempo.

## Tastatur (Desktop)

1–5 = Bus wählen · Leertaste = EFX an/aus · O = Übersicht · X = XY-Pad ·
Esc = Overlays schließen · Mausrad auf Fadern = ±1 (Shift ±10).

## Tipps und bekannte Grenzen

- **Kein SysEx:** Die App kann den Gerätezustand nicht auslesen.
  Effektwechsel am Gerät bleiben für sie unsichtbar (das Gerät sendet dabei
  nichts) — Effekte deshalb aus der App wechseln. Encoder-Drehungen am Gerät
  kommen dagegen an und bewegen die Fader live.
- **BUS 3/4 reagieren nicht?** Meist steht die BUS-FX-Einstellung des Geräts
  auf „Bypass" — dann laufen CCs ins Leere. Abhilfe: das EFX-Pad des Busses
  in der App einmal aus- und wieder einschalten (re-armiert den Bus); bei
  Effektwechseln macht die App das automatisch. Falls es dann immer noch
  hakt: Läuft das Signal DRY an den Bussen vorbei, oder greift bei vielen
  gleichzeitigen Effekten das DSP-Limit?
- **Beim Laden sendet die App nie** — der gespeicherte Zustand wird nur
  angezeigt. Abgleich: Setup > „Zustand ans Gerät senden" oder einfach die
  erste Geste pro Regler.
- **Demo-Modus:** Ohne Web MIDI (z. B. iOS-Safari) lässt sich die Oberfläche
  ansehen, gesendet wird nichts.
