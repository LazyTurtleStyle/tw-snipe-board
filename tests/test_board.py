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
            '<a href="#"><span class="icon-container"><span><img src="https://x/graphic/%s.webp"></span></span>'
            '<span class="quickedit-label"> %s </span></a></span></span></td>'
            '<td><a href="/game.php?village=%d&screen=overview">%s (%d|%d) C45</a></td><td><a href="#">Herkomst</a></td>'
            '<td><a href="#">%s</a></td><td>5.0</td><td>%s</td><td><span class="timer">1:00:00</span></td>'
            '<td><a href="#"><img src="https://x/graphic/command/support.webp"></a></td></tr>'
            % (cid, icon, label, tid, tname, x, y, player, arrival))


E_ = 'Vijand'
ROWS = [
    row(1, 'Bijl', 'unit/tiny/axe', 1, 'Dorp A', 549, 403, E_, 'vandaag om ' + ms('22:26:03', 440)),
    row(2, 'Edel >>>> SNIPE THIS <<<<', 'unit/tiny/snob', 1, 'Dorp A', 549, 403, E_, 'vandaag om ' + ms('22:26:03', 510)),
    row(3, 'Bijl', 'unit/tiny/axe', 1, 'Dorp A', 549, 403, E_, 'vandaag om ' + ms('22:26:03', 531)),
    row(4, 'Edel', 'unit/tiny/snob', 1, 'Dorp A', 549, 403, E_, 'vandaag om ' + ms('22:26:03', 610)),
    row(5, 'ZC', 'unit/tiny/heavy', 1, 'Dorp A', 549, 403, E_, 'vandaag om ' + ms('22:26:03', 699)),
    row(6, 'Edel', 'unit/tiny/snob', 1, 'Dorp A', 549, 403, E_, 'vandaag om ' + ms('22:26:03', 710)),
    row(7, 'Edel - C-SNIPE', 'unit/tiny/snob', 1, 'Dorp A', 549, 403, E_, 'vandaag om ' + ms('22:26:03', 810)),
    row(8, 'Edel', 'unit/tiny/snob', 2, 'Dorp B', 551, 396, E_, 'vandaag om ' + ms('22:52:26', 687)),
    row(9, 'Edel', 'unit/tiny/snob', 2, 'Dorp B', 551, 396, E_, 'vandaag om ' + ms('23:10:28', 684)),
    row(10, 'Ram', 'unit/tiny/ram', 3, 'Dorp C', 546, 403, E_, 'morgen om ' + ms('00:40:01', 327)),
    row(11, 'Edel', 'unit/tiny/snob', 3, 'Dorp C', 546, 403, E_, 'morgen om ' + ms('00:40:01', 387)),
    row(12, 'Zwaard', 'unit/tiny/sword', 3, 'Dorp C', 546, 403, E_, 'morgen om ' + ms('00:40:01', 466)),
    row(13, 'Edel', 'unit/tiny/snob', 3, 'Dorp C', 546, 403, E_, 'morgen om ' + ms('00:40:01', 487)),
    # the "Alle" tab: our own support in the same table, 30 ms before noble 4
    row(15, '549|403 [40 ms]', 'command/support', 1, 'Dorp A', 549, 403, 'Ik', 'vandaag om ' + ms('22:26:03', 580)),
    row(14, 'Edel', 'unit/tiny/snob', 4, 'Dorp D', 549, 410, E_, 'op 02.11. om ' + ms('13:58:12', 917)),
]
PAGE = ('<html><head><meta charset="utf-8"></head><body>'
        '<span id="serverTime">21:50:00</span> <span id="serverDate">31/10/2026</span>'
        '<form><table id="incomings_table" class="vis overview_table"><tr><th>Bevel</th><th>Doel</th><th>Herkomst</th>'
        '<th>Speler</th><th>Afstand</th><th>Aankomst</th><th>Komt aan in</th></tr>%s</table></form></body></html>'
        % ''.join(ROWS))
SUP_URLS = []
SUP = ('<html><body><table id="commands_table"><tr><th>Bevel</th><th>Herkomst</th><th>Aankomst</th><th>sp</th></tr>'
       '<tr class="nowrap"><td><span class="quickedit-label">549|403 [40 ms]</span></td><td>x</td><td>vandaag om ' + ms('22:26:03', 570) + '</td><td>1</td></tr>'
       '<tr class="nowrap"><td><span class="quickedit-label">551|396 [0 ms]</span></td><td>x</td><td>vandaag om ' + ms('22:52:26', 687) + '</td><td>1</td></tr>'
       '<tr class="nowrap"><td><span class="quickedit-label">Ondersteuning voor Dorp C (546|403) C45</span></td><td>x</td><td>morgen om ' + ms('00:40:01', 455) + '</td><td>1</td></tr>'
       '<tr class="nowrap"><td><img src="x/command/return_support.webp">Terugkeer (549|403)</td><td>x</td><td>vandaag om ' + ms('22:26:03', 600) + '</td><td>1</td></tr>'
       '</table></body></html>')
OTHER = ('<html><body><span id="serverTime">21:50:00</span> <span id="serverDate">31/10/2026</span>'
         '<h2>Dorpsoverzicht</h2></body></html>')

EXPECT_IMPORT = [
    '549|403,2026-10-31T22:26:03.510,2',
    '551|396,2026-10-31T22:52:26.687,8',
    '551|396,2026-10-31T23:10:28.684,9',
    '546|403,2026-11-01T00:40:01.387,11',
    '546|403,2026-11-01T00:40:01.487,13',
    '549|410,2026-11-02T13:58:12.917,14',
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
                SUP_URLS.append(u)
                if 'group=0' not in u:  # the game filters on the group: none of ours left from it
                    return await route.fulfill(body='<table id="commands_table"></table>', content_type='text/html')
                return await route.fulfill(body=SUP, content_type='text/html')
            if state['other'] and 'mode=incomings' not in u:
                return await route.fulfill(body=OTHER, content_type='text/html')
            return await route.fulfill(body=PAGE, content_type='text/html')
        await page.route('**/*', handler)

        async def boot(screen):
            await page.add_script_tag(content=JQ)
            await page.evaluate("window.game_data={world:'nl116',screen:'%s',player:{name:'Ik'},village:{id:1},group_id:'17145'};" % screen)
            await page.add_script_tag(path=os.path.join(HERE, 'stub.js'))
            await page.add_script_tag(content=JS)

        await page.goto('https://nl116.tribalwars.nl/game.php?village=1&screen=overview_villages&mode=incomings')
        await boot('overview_villages')
        await page.wait_for_timeout(600)
        check('starts folded up on page load', not await page.is_visible('#snipe-board .sb-body') and await page.inner_text('#snipe-board .sb-toggle') == '\u25bc')
        check('no coverage fetch while folded', not SUP_URLS, SUP_URLS)
        await page.click('#snipe-board .sb-toggle')
        await page.wait_for_timeout(600)   # unfolding fetches the coverage
        check('unfolds on click', await page.is_visible('#snipe-board .sb-body'))
        text = await page.inner_text('#snipe-board')
        check('8 nobles, 1 OK, refreshed on open', '8 edels' in text and '1 OK' in text and 'laatste refresh' in text, text[:160])
        check('incoming support on the Alle tab is not a command', 'eigen' not in text and '.580' not in text, text[:400])
        check('village name links to the village', await page.locator('#snipe-board a[href*="village=1&screen=overview"]').count() == 1)
        check('C-SNIPE noble skipped', '.810' not in text)
        check('covered noble shows SNIPE OK', 'SNIPE OK (-40 ms)' in text)
        check('support before anti-snipe flagged', 'support vóór anti-snipe (-32 ms)' in text)
        check('open nobles show SNIPE THIS', text.count('SNIPE THIS') >= 5, text.count('SNIPE THIS'))
        check('full time when the second changes', '23:10:28.684' in text)
        check('no aim column any more', 'Mikpunt' not in text)
        check('pick button names its selection', 'Selecteer makkelijk + gemiddeld + vrij (SNIPE THIS)' in text)
        await page.click('#snipe-board .sb-pick')
        picked = await page.eval_on_selector_all('#snipe-board .sb-sel:checked', 'els => els.length')
        check('pick selects open easy/mid/free', picked == 6, picked)
        await page.click('#snipe-board .sb-calc')
        await page.wait_for_timeout(2500)
        imported = await page.evaluate('window.__imported')
        check('calculator gets the nobles own times', (imported or '').split('\n') == EXPECT_IMPORT, imported)
        # settings: vertical rows, ticking "Moeilijk" changes the button and the pick
        await page.evaluate("$('#popup_box_x').remove()")
        await page.click('#snipe-board .sb-gear')
        rows = await page.locator('#snipe-board .sb-settings .sb-row').count()
        check('settings one per row', rows == 7, rows)
        await page.check('#snipe-board .sb-chk[value=hard]')
        await page.wait_for_timeout(200)
        check('button follows the setting', 'Selecteer alles (SNIPE THIS)' in await page.inner_text('#snipe-board .sb-pick'))
        await page.click('#snipe-board .sb-pick')
        check('pick now includes the hard one', await page.eval_on_selector_all('#snipe-board .sb-sel:checked', 'els => els.length') == 7)
        await page.uncheck('#snipe-board .sb-chk[value=hard]')
        # 0 ms: off by default, the setting turns it into SNIPE OK
        check('0 ms is not OK by default', '0 ms · gok' not in await page.inner_text('#snipe-board'))
        await page.check('#snipe-board .sb-zero')
        await page.wait_for_timeout(200)
        check('0 ms counts when ticked', 'SNIPE OK (0 ms · gok)' in await page.inner_text('#snipe-board'))
        await page.uncheck('#snipe-board .sb-zero')
        await page.wait_for_timeout(200)
        # filter
        await page.click('#snipe-board .sb-filter a[data-filter=covered]')
        await page.wait_for_timeout(200)
        check('filter SNIPE OK shows only the covered one', await page.locator('#snipe-board .sb-sel').count() == 1)
        await page.click('#snipe-board .sb-filter a[data-filter=all]')
        await page.wait_for_timeout(200)
        # rename covered nobles
        await page.click('#snipe-board .sb-rename')
        await page.wait_for_timeout(600)
        check('rename covered noble', await page.evaluate('window.__renamed') == ['4=Edel SNIPE OK [40 ms]'], await page.evaluate('window.__renamed'))
        check('table label updated in place', 'Edel SNIPE OK [40 ms]' in await page.inner_text('#incomings_table'))
        if await page.is_visible('#snipe-board .sb-body'):
            await page.click('#snipe-board .sb-toggle')
        await page.add_script_tag(content=JS)   # quickbar click on the incomings page
        await page.wait_for_timeout(400)
        check('quickbar click unfolds it', await page.is_visible('#snipe-board .sb-body'))
        check('collapse is an arrow', await page.inner_text('#snipe-board .sb-toggle') in ('\u25b2', '\u25bc'))

        state['other'] = True
        await page.goto('https://nl116.tribalwars.nl/game.php?village=1&screen=overview')
        await boot('overview')
        await page.wait_for_timeout(800)
        check('supports read for all groups, own group put back',
              any('group=0' in u for u in SUP_URLS) and any('group=17145' in u for u in SUP_URLS), SUP_URLS)
        check('button in the quest column', await page.locator('#questlog #snipe-board-fab').count() == 1)
        check('auto-load does not open the board elsewhere', await page.locator('#snipe-board').count() == 0)
        await page.evaluate("$('#snipe-board-fab').trigger('click')")  # no game CSS here, so it has no size
        await page.wait_for_timeout(800)
        check('button opens the board, fetching incomings', await page.locator('#snipe-board tr').count() == 9)
        sw = await page.evaluate("(function(c){return [c.scrollWidth, c.clientWidth]})($('#popup_box_snipe_board_dialog .popup_box_content')[0])")
        check('window wide enough, no sideways scroll', sw[0] <= sw[1], sw)
        check('button uses the sharp 60px portrait', 'unit_big/snob.png' in await page.evaluate("$('#snipe-board-fab').css('background-image')"))
        await page.evaluate("$('#popup_box_snipe_board_dialog').remove()")
        await page.add_script_tag(content=JS)
        await page.wait_for_timeout(800)
        check('second run (quickbar click) opens it too', await page.locator('#snipe-board tr').count() == 9)
        check('still one button', await page.locator('#snipe-board-fab').count() == 1)
        # an older copy ran first on this page: its edge-pinned button and style must go
        await page.evaluate("$('#snipe-board-fab').remove(); window.__snipeBoardLoaded = true; $('<style id=\\'snipe-board-css\\'>#snipe-board-fab{position:fixed;left:0}</style>').appendTo('head'); $('<div id=\\'snipe-board-fab\\'>').appendTo('body');")
        await page.add_script_tag(content=JS)
        await page.wait_for_timeout(300)
        check('old button replaced by one in the quest column', await page.locator('#questlog #snipe-board-fab').count() == 1 and await page.locator('#snipe-board-fab').count() == 1)
        check('old style removed', await page.locator('#snipe-board-css').count() == 0)
        check('no page errors', not errors, errors)
        await browser.close()

    print('\n%d failure(s)' % len(failures))
    sys.exit(1 if failures else 0)


asyncio.run(main())
