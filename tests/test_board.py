"""Runs the Snipe Board against a mock nl116 incomings page in headless Chromium.

    pip install playwright && python -m playwright install chromium
    python tests/test_board.py

The mock pages copy the game's own markup (31-10-2026): the incomings table,
the support commands table and the "vandaag/morgen/op dd.mm. om" arrival text
with the grey-small millisecond span. Toxic Donut's Snipe Calculator is
replaced by tests/fake_td.js, which records what gets imported.
"""
import asyncio
import os
import sys

from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
JS = open(os.path.join(HERE, '..', 'snipe_board.js')).read()
JQ = open(os.path.join(HERE, 'jquery.min.js')).read()
FAKE_TD = open(os.path.join(HERE, 'fake_td.js')).read()


def ms(t, m):
    return '%s:<span class="grey small">%03d</span>' % (t, m)


def row(cid, label, icon, tid, tname, x, y, player, arrival):
    return ('<tr class="nowrap row_a"><td><span class="quickedit" data-id="%d"><span class="quickedit-content">'
            '<a href="#"><span class="icon-container"><span><img src="https://x/graphic/unit/tiny/%s.webp"></span></span>'
            '<span class="quickedit-label"> %s </span></a></span></span></td>'
            '<td><a href="/game.php?village=%d&screen=overview">%s (%d|%d) C45</a></td><td><a href="#">Herkomst</a></td>'
            '<td><a href="#">%s</a></td><td>5.0</td><td>%s</td><td><span class="timer">1:00:00</span></td></tr>'
            % (cid, icon, label, tid, tname, x, y, player, arrival))


E_ = 'Vijand'
ROWS = [
    row(1, 'Bijl', 'axe', 1, 'Dorp A', 549, 403, E_, 'vandaag om ' + ms('22:26:03', 440)),
    row(2, 'Edel >>>> SNIPE THIS <<<<', 'snob', 1, 'Dorp A', 549, 403, E_, 'vandaag om ' + ms('22:26:03', 510)),
    row(3, 'Bijl', 'axe', 1, 'Dorp A', 549, 403, E_, 'vandaag om ' + ms('22:26:03', 531)),
    row(4, 'Edel', 'snob', 1, 'Dorp A', 549, 403, E_, 'vandaag om ' + ms('22:26:03', 610)),
    row(5, 'ZC', 'heavy', 1, 'Dorp A', 549, 403, E_, 'vandaag om ' + ms('22:26:03', 699)),
    row(6, 'Edel', 'snob', 1, 'Dorp A', 549, 403, E_, 'vandaag om ' + ms('22:26:03', 710)),
    row(7, 'Edel - C-SNIPE', 'snob', 1, 'Dorp A', 549, 403, E_, 'vandaag om ' + ms('22:26:03', 810)),
    row(8, 'Edel', 'snob', 2, 'Dorp B', 551, 396, E_, 'vandaag om ' + ms('22:52:26', 687)),
    row(9, 'Edel', 'snob', 2, 'Dorp B', 551, 396, E_, 'vandaag om ' + ms('23:10:28', 684)),
    row(10, 'Ram', 'ram', 3, 'Dorp C', 546, 403, E_, 'morgen om ' + ms('00:40:01', 327)),
    row(11, 'Edel', 'snob', 3, 'Dorp C', 546, 403, E_, 'morgen om ' + ms('00:40:01', 387)),
    row(12, 'Zwaard', 'sword', 3, 'Dorp C', 546, 403, E_, 'morgen om ' + ms('00:40:01', 466)),
    row(13, 'Edel', 'snob', 3, 'Dorp C', 546, 403, E_, 'morgen om ' + ms('00:40:01', 487)),
    row(14, 'Edel', 'snob', 4, 'Dorp D', 549, 410, E_, 'op 02.11. om ' + ms('13:58:12', 917)),
]
PAGE = ('<html><head><meta charset="utf-8"></head><body>'
        '<span id="serverTime">21:50:00</span> <span id="serverDate">31/10/2026</span>'
        '<form><table id="incomings_table" class="vis overview_table"><tr><th>Bevel</th><th>Doel</th><th>Herkomst</th>'
        '<th>Speler</th><th>Afstand</th><th>Aankomst</th><th>Komt aan in</th></tr>%s</table></form></body></html>'
        % ''.join(ROWS))
SUP = ('<html><body><table id="commands_table"><tr><th>Bevel</th><th>Herkomst</th><th>Aankomst</th><th>sp</th></tr>'
       '<tr class="nowrap"><td><span class="quickedit-label">549|403 [40 ms]</span></td><td>x</td><td>vandaag om ' + ms('22:26:03', 570) + '</td><td>1</td></tr>'
       '<tr class="nowrap"><td><span class="quickedit-label">Ondersteuning voor Dorp C (546|403) C45</span></td><td>x</td><td>morgen om ' + ms('00:40:01', 455) + '</td><td>1</td></tr>'
       '<tr class="nowrap"><td><img src="x/command/return_support.webp">Terugkeer (549|403)</td><td>x</td><td>vandaag om ' + ms('22:26:03', 600) + '</td><td>1</td></tr>'
       '</table></body></html>')
OTHER = ('<html><body><span id="serverTime">21:50:00</span> <span id="serverDate">31/10/2026</span>'
         '<h2>Dorpsoverzicht</h2></body></html>')

EXPECT_IMPORT = [
    '549|403,2026-10-31T22:26:03.475,2',
    '551|396,2026-10-31T22:52:26.666,8',
    '551|396,2026-10-31T23:10:28.663,9',
    '546|403,2026-11-01T00:40:01.357,11',
    '546|403,2026-11-01T00:40:01.476,13',
    '549|410,2026-11-02T13:58:12.896,14',
]


async def main():
    failures = []

    def check(name, ok, detail=''):
        print(('ok   ' if ok else 'FAIL ') + name + ('' if ok else ': ' + str(detail)))
        if not ok:
            failures.append(name)

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={'width': 1100, 'height': 900})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        state = {'other': False}

        async def handler(route):
            u = route.request.url
            if 'Snipe-Calculator' in u:
                return await route.fulfill(body=FAKE_TD, content_type='application/javascript')
            if 'type=support' in u:
                return await route.fulfill(body=SUP, content_type='text/html')
            if state['other'] and 'mode=incomings' not in u:
                return await route.fulfill(body=OTHER, content_type='text/html')
            return await route.fulfill(body=PAGE, content_type='text/html')
        await page.route('**/*', handler)

        async def boot(screen):
            await page.add_script_tag(content=JQ)
            await page.evaluate("window.game_data={world:'nl116',screen:'%s',player:{name:'Ik'},village:{id:1}};" % screen)
            await page.add_script_tag(path=os.path.join(HERE, 'stub.js'))
            await page.add_script_tag(content=JS)

        await page.goto('https://nl116.tribalwars.nl/game.php?village=1&screen=overview_villages&mode=incomings')
        await boot('overview_villages')
        await page.click('#snipe-board .sb-refresh')
        await page.wait_for_timeout(500)
        text = await page.inner_text('#snipe-board')
        check('8 nobles in 4 villages, 1 covered', '8 edels in 4 dorpen, 1 gedekt' in text, text[:120])
        check('C-SNIPE noble skipped', '.810' not in text)
        check('covered noble', 'gedekt (-40 ms)' in text)
        check('support before anti-snipe flagged', 'landt vóór anti-snipe (-32 ms)' in text)
        check('full time when the second changes', '23:10:28.684' in text)
        await page.click('#snipe-board .sb-pick')
        picked = await page.eval_on_selector_all('#snipe-board .sb-sel:checked', 'els => els.length')
        check('pick selects open easy/mid/free', picked == 6, picked)
        await page.click('#snipe-board .sb-calc')
        await page.wait_for_timeout(2500)
        imported = await page.evaluate('window.__imported')
        check('calculator import lines', (imported or '').split('\n') == EXPECT_IMPORT, imported)

        state['other'] = True
        await page.goto('https://nl116.tribalwars.nl/game.php?village=1&screen=overview')
        await boot('overview')
        await page.wait_for_timeout(800)
        check('side button on another screen', await page.locator('#snipe-board-fab').count() == 1)
        check('dialog board fetched incomings', await page.locator('#snipe-board tr').count() == 9)
        check('no page errors', not errors, errors)
        await browser.close()

    print('\n%d failure(s)' % len(failures))
    sys.exit(1 if failures else 0)


asyncio.run(main())
