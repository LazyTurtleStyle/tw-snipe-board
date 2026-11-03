# Snipe Board

Snellijstscript voor Tribal Wars (getest op nl116). Per edeltrein op je eigen dorpen toont het:

- **het gat** voor elke edel: hoeveel ms er zit tussen het bevel ervoor en de edel, en welk bevel dat is;
- **de moeilijkheid**: makkelijk, gemiddeld, moeilijk of vrij (grenzen instelbaar);
- **de dekking**: `SNIPE OK (-n ms)` als er al een eigen support voor de edel landt, anders `SNIPE THIS`
  (met een waarschuwing als je support voor een anti-snipe landt).

## Knoppen

| Knop | Wat |
| --- | --- |
| ✔ | dekking verversen (haalt je supportbevelen op; gebeurt ook automatisch bij openen, uit te zetten) |
| ▲ / ▼ | board in- of uitklappen |
| ✎ | gedekte edels hernoemen naar `Edel SNIPE OK [n ms]` |
| ⚙ | instellingen |
| **Selecteer …** | vinkt de edels aan die bij je instelling passen; de knop noemt de keuze, bv. "Selecteer makkelijk + gemiddeld (SNIPE THIS)" |
| **Naar Snipe Calculator** | zet de aangevinkte edels (met hun eigen aankomsttijd) in Toxic Donut's Snipe Calculator |
| Alle / SNIPE THIS / SNIPE OK | filter |

Het script verstuurt en annuleert nooit iets. Hernoemen gebeurt alleen als je op ✎ klikt.

## Laden

```
javascript: $.getScript('https://cdn.jsdelivr.net/gh/LazyTurtleStyle/tw-snipe-board@v1.7/snipe_board.js');
```

Gebruik een versienummer (`@v1.7`): `@main` kan bij jsDelivr tot 12 uur een oude versie blijven geven.
Op de aanvallenpagina staat het board boven de tabel. Elders zet het script een edel-knop in de questlijst links;
die opent het board in een venster. Met automatisch laden opent het board elders niet vanzelf.

## Edels herkennen

Een bevel telt als edel als het label begint met `Edel` of `Noble`, of als het edel-icoon erbij staat.
Labels met `C-SNIPE` of `RECAP` worden overgeslagen. Een support telt als dekking als het doel in de
eerste cel staat: het standaardlabel ("Ondersteuning voor ... (x|y)") of een label met coordinaten.

## Testen

```
pip install playwright && python -m playwright install chromium
python tests/test_board.py
```
