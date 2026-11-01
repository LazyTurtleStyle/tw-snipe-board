# Snipe Board

Snellijstscript voor Tribal Wars (getest op nl116). Per edeltrein op je eigen dorpen toont het:

- **het gat** voor elke edel: hoeveel ms er zit tussen het bevel ervoor en de edel, en welk bevel dat is;
- **de moeilijkheid**: makkelijk, gemiddeld, moeilijk of vrij (grenzen instelbaar);
- **het mikpunt**: waar je snipe moet landen, met de marge in ms;
- **de dekking**: of er al een eigen support voor de edel landt, of dat hij voor een anti-snipe landt.

Met **Naar Snipe Calculator** gaan de aangevinkte edels met hun mikpunt naar
[Toxic Donut's Snipe Calculator](https://forum.tribalwars.nl/index.php?forums/goedgekeurde-scripts.415/).

Het script leest alleen pagina's. Het verstuurt, annuleert of hernoemt niets.

## Gebruik

1. Zet in de snellijst:
   ```
   javascript:$.getScript('https://cdn.jsdelivr.net/gh/<owner>/<repo>@main/snipe_board.js');
   ```
2. Open **Overzichten > Aankomend > Aanval** en klik op het script. Het board staat boven de tabel.
3. **Dekking verversen** haalt je eigen supportbevelen op (een verzoek per klik).
4. **Selecteer open** vinkt de edels aan die nog niet gedekt zijn en geen moeilijk gat hebben;
   **Naar Snipe Calculator** opent de calculator met die doelen.

Links in de questlijst van het spel staat een knop met het edel-icoon. Op de aanvallenpagina scrolt die naar het
board; op elk ander scherm opent hij het board in een venster.

**Automatisch laden (scriptbibliotheek):** het board opent dan vanzelf alleen op de aanvallenpagina. Op andere
schermen zet het script alleen de knop neer; klik op de knop of op het script in de snellijst om het te openen.

## Edels herkennen

Een bevel telt als edel als het label begint met `Edel` of `Noble`, of als het edel-icoon erbij staat.
Labels met `C-SNIPE` of `RECAP` worden overgeslagen. Een support telt als dekking als het doel in de
eerste cel staat: het standaardlabel ("Ondersteuning voor ... (x|y)") of een label met coordinaten.

## Instellingen

| Instelling | Standaard |
| --- | --- |
| Makkelijk vanaf | 40 ms gat |
| Moeilijk onder | 15 ms gat |
| Mikpunt | midden van het gat (of een vast aantal ms voor de edel) |

Instellingen en de laatst opgehaalde dekking staan per wereld in `localStorage`.

## Testen

```
pip install playwright && python -m playwright install chromium
python tests/test_board.py
```

De test draait het script in headless Chromium tegen nagebouwde spelpagina's en een nep-calculator.
