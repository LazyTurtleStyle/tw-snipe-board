/*
 * Snipe Board v1.4 - per edeltrein: het gat voor elke edel, de moeilijkheid,
 * het mikpunt en de dekking door je eigen supports.
 *
 * Gebruik: in de snellijst zetten (of in de scriptbibliotheek, zodat het op
 * elke pagina laadt). Op de inkomende-aanvallenpagina staat het board boven
 * de tabel; op elk ander scherm opent de knop links in beeld het board in een
 * venster en haalt het daarvoor de aanvallenpagina op. "Dekking verversen"
 * haalt met een verzoek je eigen supportbevelen op. Het script verstuurt,
 * annuleert of hernoemt niets.
 */
(function () {
    'use strict';

    var DEFAULTS = {
        easyMs: 40,           // gat >= dit: makkelijk
        hardMs: 15,           // gat < dit: moeilijk (daartussen gemiddeld)
        aimMode: 'mid',       // 'mid' = midden van het gat, 'before' = aimBeforeMs voor de edel
        aimBeforeMs: 10,
        loneGapMs: 40,        // edel zonder iets ervoor: mik binnen deze ms voor de edel
        trainWindowMs: 1500,  // alleen bevelen binnen deze tijd voor een edel tellen als "ervoor"
        staleMin: 15,         // dekking ouder dan dit valt op
        nobleLabels: ['edel', 'noble', 'snob'],
        ignoreLabels: ['c-snipe', 'c snipe', 'c- snipe', 'recap']
    };
    var TD_CALC = 'https://media.innogamescdn.com/com_DS_NL/scripts/Toxic-Donuts-Snipe-Calculator._206313.js';

    var VERSION = '1.4';
    var BOARD_ID = 'snipe-board';
    var FAB_ID = 'snipe-board-fab';
    var DIALOG_ID = 'snipe_board_dialog';
    var STORE_KEY = 'snipeboard_' + game_data.world + '_supports';
    var SETTINGS_KEY = 'snipeboard_' + game_data.world + '_settings';
    var PENDING_KEY = 'snipeboard_' + game_data.world + '_pending_import';
    var SETTINGS = loadSettings();

    function loadSettings() {
        var s = $.extend({}, DEFAULTS);
        try { $.extend(s, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}); } catch (e) { /* defaults */ }
        return s;
    }

    function saveSettings() {
        var keep = {easyMs: SETTINGS.easyMs, hardMs: SETTINGS.hardMs,
            aimMode: SETTINGS.aimMode, aimBeforeMs: SETTINGS.aimBeforeMs};
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(keep)); } catch (e) { /* private mode */ }
    }

    // ---------------------------------------------------------------- page

    function onIncomingsPage() {
        return game_data.screen === 'overview_villages' && $('#incomings_table').length > 0;
    }

    function incomingsUrl() {
        return '/game.php?village=' + game_data.village.id +
            '&screen=overview_villages&mode=incomings&subtype=attacks&page=-1';
    }

    function supportUrl() {
        return '/game.php?village=' + game_data.village.id +
            '&screen=overview_villages&mode=commands&type=support&page=-1';
    }

    // ---------------------------------------------------------------- time
    // All times are wall-clock server time, encoded with Date.UTC so the
    // player's own time zone never enters the comparisons.

    function serverDate() {
        var p = ($('#serverDate').text() || '').trim().split('/');
        return {d: +p[0], m: +p[1], y: +p[2]};
    }

    function serverNowMs() {
        var d = serverDate();
        var t = ($('#serverTime').text() || '0:0:0').trim().split(':');
        return Date.UTC(d.y, d.m - 1, d.d, +t[0], +t[1], +t[2]);
    }

    var RE_ARRIVAL = /(vandaag|today|morgen|tomorrow|op|on)\s*(?:(\d{1,2})\.(\d{1,2})\.?(\d{2,4})?)?\s*(?:om|at)\s*(\d{1,2}):(\d{2}):(\d{2})(?::\s*(\d{1,3}))?/i;

    function parseArrival(text) {
        var m = RE_ARRIVAL.exec((text || '').replace(/\s+/g, ' '));
        if (!m) return null;
        var sd = serverDate();
        var y = sd.y, mo = sd.m, d = sd.d;
        var word = m[1].toLowerCase();
        if (word === 'morgen' || word === 'tomorrow') {
            var t = new Date(Date.UTC(y, mo - 1, d + 1));
            y = t.getUTCFullYear(); mo = t.getUTCMonth() + 1; d = t.getUTCDate();
        } else if ((word === 'op' || word === 'on') && m[2]) {
            d = +m[2]; mo = +m[3];
            if (m[4]) y = +m[4] < 100 ? 2000 + +m[4] : +m[4];
            else if (mo < sd.m) y += 1;  // "op 02.01." in december is next year
        }
        var ms = m[8] ? +m[8] : 0;
        return Date.UTC(y, mo - 1, d, +m[5], +m[6], +m[7], ms);
    }

    function pad(n) { return (n < 10 ? '0' : '') + n; }

    function fmtTime(ms) {
        var t = new Date(ms);
        return pad(t.getUTCHours()) + ':' + pad(t.getUTCMinutes()) + ':' + pad(t.getUTCSeconds());
    }

    function fmtMs(ms) {
        return '.' + ('00' + (((ms % 1000) + 1000) % 1000)).slice(-3);
    }

    // Server wall-clock time as the Snipe Calculator imports it: 2026-10-31T22:26:03.570
    function fmtIso(ms) {
        var t = new Date(ms);
        return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate()) + 'T' +
            fmtTime(ms) + fmtMs(ms);
    }

    // ---------------------------------------------------------------- parsing

    var RE_COORD = /(\d{1,3})\|(\d{1,3})/;

    function hasAny(text, words) {
        var t = text.toLowerCase();
        for (var i = 0; i < words.length; i++) if (t.indexOf(words[i]) !== -1) return true;
        return false;
    }

    function startsWithAny(text, words) {
        var t = text.toLowerCase().trim();
        for (var i = 0; i < words.length; i++) if (t.indexOf(words[i]) === 0) return true;
        return false;
    }

    // A fetched page wrapped, because its tables are top-level nodes that .find skips.
    function wrap(html) { return $('<div>').html(html); }

    function readIncomings($root) {
        var out = [];
        $root.find('#incomings_table tr.nowrap').each(function () {
            var cells = $(this).children('td');
            if (cells.length < 6) return;
            var label = $.trim(cells.eq(0).find('.quickedit-label').text());
            var snobIcon = cells.eq(0).find('img[src*="/snob"]').length > 0;
            var targetLink = cells.eq(1).find('a').first();
            var targetText = $.trim(targetLink.text());
            var tid = (/village=(\d+)/.exec(targetLink.attr('href') || '') || [])[1];
            var tc = RE_COORD.exec(targetText);
            var arr = parseArrival(cells.eq(5).text());
            if (!tid || !tc || arr === null) return;
            out.push({
                id: cells.eq(0).find('.quickedit').data('id'),
                label: label,
                noble: startsWithAny(label, SETTINGS.nobleLabels) || snobIcon,
                ignored: hasAny(label, SETTINGS.ignoreLabels),
                own: $.trim(cells.eq(3).text()) === game_data.player.name,
                target: tid,
                targetName: targetText.replace(/\s*\(\d{1,3}\|\d{1,3}\).*$/, ''),
                x: +tc[1], y: +tc[2],
                arrival: arr
            });
        });
        return out;
    }

    function readSupports($root) {
        var out = [];
        $root.find('#commands_table tr').each(function () {
            var cells = $(this).children('td');
            if (cells.length < 3) return;
            if ($(this).find('img[src*="return_"]').length) return;  // troops on the way back
            var c = RE_COORD.exec(cells.eq(0).text());
            var arr = parseArrival(cells.eq(2).text());
            if (!c || arr === null) return;
            out.push({x: +c[1], y: +c[2], arrival: arr});
        });
        return out;
    }

    function loadSupports() {
        try { return JSON.parse(localStorage.getItem(STORE_KEY)) || null; }
        catch (e) { return null; }
    }

    function saveSupports(list) {
        var data = {at: serverNowMs(), list: list};
        try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) { /* private mode */ }
        return data;
    }

    // ---------------------------------------------------------------- analysis

    function analyse(commands, supports, now) {
        var byTarget = {};
        commands.forEach(function (c) {
            (byTarget[c.target] = byTarget[c.target] || []).push(c);
        });
        var trains = [];
        Object.keys(byTarget).forEach(function (tid) {
            var list = byTarget[tid].sort(function (a, b) { return a.arrival - b.arrival; });
            var rows = [];
            var lastNoble = null;
            list.forEach(function (c, i) {
                if (!c.noble) return;
                var after = lastNoble;
                lastNoble = c.arrival;
                if (c.ignored || c.arrival <= now) return;
                var prev = (i > 0 && c.arrival - list[i - 1].arrival <= SETTINGS.trainWindowMs) ? list[i - 1] : null;
                var gap = prev ? c.arrival - prev.arrival : null;
                var a = aim(c, prev);
                rows.push({cmd: c, prev: prev, gap: gap, aim: a.aim, keep: a.keep,
                    cover: coverage(c, prev, after, supports)});
            });
            if (!rows.length) return;
            trains.push({target: tid, name: list[0].targetName, x: list[0].x, y: list[0].y,
                first: rows[0].cmd.arrival, rows: rows});
        });
        return trains.sort(function (a, b) { return a.first - b.first; });
    }

    // A support counts for this noble when it lands after the previous noble
    // (that one's own support covers that one) and before this noble; landing
    // before the command right in front of the noble means an anti-snipe
    // reaches it first.
    function coverage(noble, prev, prevNoble, supports) {
        if (!supports) return {state: 'unknown'};
        var lo = Math.max(noble.arrival - SETTINGS.trainWindowMs, prevNoble || 0);
        var best = null, early = null;
        supports.list.forEach(function (s) {
            if (s.x !== noble.x || s.y !== noble.y) return;
            if (s.arrival >= noble.arrival || s.arrival <= lo) return;
            if (prev && s.arrival <= prev.arrival) { early = s; return; }
            if (!best || s.arrival > best.arrival) best = s;
        });
        if (best) return {state: 'covered', delta: best.arrival - noble.arrival};
        if (early) return {state: 'early', delta: early.arrival - noble.arrival};
        return {state: 'open'};
    }

    // Where to land: the middle of the gap, or a fixed ms before the noble
    // (never before the command in front of it). keep = ms either side that
    // still lands inside the gap.
    function aim(noble, prev) {
        var lo = prev ? prev.arrival + 1 : noble.arrival - SETTINGS.loneGapMs;
        var hi = noble.arrival - 1;
        if (hi < lo) return {aim: null, keep: 0};
        if (SETTINGS.aimMode === 'before') {
            var t = Math.max(lo, noble.arrival - SETTINGS.aimBeforeMs);
            return {aim: t, keep: Math.min(t - lo, hi - t)};
        }
        return {aim: Math.floor((lo + hi) / 2), keep: Math.floor((hi - lo) / 2)};
    }

    function level(gap) {
        if (gap === null) return {key: 'free', pick: true, text: 'Vrij', tip: 'Niets in de 1,5 s ervoor'};
        if (gap >= SETTINGS.easyMs) return {key: 'easy', pick: true, text: 'Makkelijk', tip: 'Gat van ' + SETTINGS.easyMs + ' ms of meer'};
        if (gap >= SETTINGS.hardMs) return {key: 'mid', pick: true, text: 'Gemiddeld', tip: 'Gat tussen ' + SETTINGS.hardMs + ' en ' + SETTINGS.easyMs + ' ms'};
        return {key: 'hard', pick: false, text: 'Moeilijk', tip: 'Gat kleiner dan ' + SETTINGS.hardMs + ' ms'};
    }

    function prevName(prev) {
        if (!prev) return '';
        var l = prev.label.replace(/[<>]+/g, ' ').replace(/\s+/g, ' ').trim();
        var word = l.split(' ')[0] || 'aanval';
        return (prev.own ? 'eigen ' : '') + word.toLowerCase() + ' ' + fmtMs(prev.arrival);
    }

    // ---------------------------------------------------------------- render

    var CSS =
        '#snipe-board{margin:0 0 10px;border:1px solid #804000;background:#fff5da}' +
        '#snipe-board .sb-head{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:5px 8px;' +
            'background:linear-gradient(#e3c485,#c1a264);border-bottom:1px solid #804000}' +
        '#snipe-board .sb-title{font-weight:bold;font-size:13px;margin-right:6px}' +
        '#snipe-board .sb-meta{margin-left:auto;font-size:11px}' +
        '#snipe-board .sb-stale{color:#a8322a;font-weight:bold}' +
        '#snipe-board .sb-settings{display:none;padding:6px 8px;background:#f4e4bc;border-bottom:1px solid #c1a264}' +
        '#snipe-board .sb-settings label{margin-right:14px;white-space:nowrap}' +
        '#snipe-board .sb-settings input[type=number]{width:46px}' +
        '#snipe-board table.vis{width:100%;margin:0}' +
        '#snipe-board table.vis td{white-space:nowrap;vertical-align:middle}' +
        '#snipe-board tr.sb-first td{border-top:2px solid #804000}' +
        '#snipe-board tr td:first-child{border-left:4px solid transparent}' +
        '#snipe-board tr.sb-l-easy td:first-child{border-left-color:#3a8a2c}' +
        '#snipe-board tr.sb-l-mid td:first-child{border-left-color:#c98700}' +
        '#snipe-board tr.sb-l-hard td:first-child{border-left-color:#a8322a}' +
        '#snipe-board tr.sb-l-free td:first-child{border-left-color:#3e6fa3}' +
        '#snipe-board .sb-chip{display:inline-block;min-width:78px;padding:1px 8px;border-radius:10px;' +
            'font-size:11px;font-weight:bold;color:#fff;text-align:center;text-shadow:0 1px 0 rgba(0,0,0,.35);' +
            'box-shadow:inset 0 -1px 0 rgba(0,0,0,.25),0 1px 1px rgba(0,0,0,.15)}' +
        '#snipe-board .sb-easy{background:linear-gradient(#5fb24e,#3a8a2c)}' +
        '#snipe-board .sb-mid{background:linear-gradient(#eeaa22,#c98700)}' +
        '#snipe-board .sb-hard{background:linear-gradient(#d65448,#a8322a)}' +
        '#snipe-board .sb-free{background:linear-gradient(#6a9bd0,#3e6fa3)}' +
        '#snipe-board .sb-ok{color:#2e7d1f;font-weight:bold}' +
        '#snipe-board .sb-bad{color:#a8322a;font-weight:bold}' +
        '#snipe-board .sb-quiet{color:#7a6a4a}' +
        '#snipe-board .sb-ms{font-family:monospace;font-size:12px}' +
        '#' + FAB_ID + '{background-size:24px !important;background-position:center !important;' +
            'background-repeat:no-repeat !important;cursor:pointer}';

    // Versioned, so an older copy that already ran on this page (its style
    // pinned the button to the screen edge) cannot leave its look behind.
    function ensureCss() {
        var id = 'snipe-board-css-' + VERSION.replace('.', '-');
        $('style[id^="snipe-board-css"]').not('#' + id).remove();
        if (!$('#' + id).length) $('<style id="' + id + '">').text(CSS).appendTo('head');
    }

    function settingsHtml() {
        var s = SETTINGS;
        return '<div class="sb-settings">' +
            '<label>Makkelijk vanaf <input type="number" class="sb-set" data-key="easyMs" value="' + s.easyMs + '"> ms gat</label>' +
            '<label>Moeilijk onder <input type="number" class="sb-set" data-key="hardMs" value="' + s.hardMs + '"> ms gat</label>' +
            '<label>Mikpunt <select class="sb-set" data-key="aimMode">' +
            '<option value="mid"' + (s.aimMode === 'mid' ? ' selected' : '') + '>midden van het gat</option>' +
            '<option value="before"' + (s.aimMode === 'before' ? ' selected' : '') + '>vast aantal ms voor de edel</option>' +
            '</select></label>' +
            '<label>ms voor de edel <input type="number" class="sb-set" data-key="aimBeforeMs" value="' + s.aimBeforeMs + '"></label>' +
            '<a href="#" class="btn sb-reset">Standaard</a></div>';
    }

    function coverHtml(c) {
        if (c.state === 'covered') return '<span class="sb-ok">✔ gedekt (' + c.delta + ' ms)</span>';
        if (c.state === 'early') return '<span class="sb-bad">⚠ landt vóór anti-snipe (' + c.delta + ' ms)</span>';
        if (c.state === 'unknown') return '<span class="sb-quiet">nog niet opgehaald</span>';
        return '<span class="sb-quiet">open</span>';
    }

    function boardHtml(trains, supports, inDialog) {
        var nobles = 0, covered = 0;
        trains.forEach(function (t) {
            t.rows.forEach(function (r) { nobles++; if (r.cover.state === 'covered') covered++; });
        });
        var age = supports ? Math.round((serverNowMs() - supports.at) / 60000) : null;
        var coverMeta = !supports ? '<span class="sb-stale">dekking nog niet opgehaald</span>' :
            age >= SETTINGS.staleMin ? '<span class="sb-stale">dekking ' + age + ' min oud, ververs</span>' :
            'dekking van ' + (age < 1 ? 'zojuist' : age + ' min geleden');
        var html = '<div id="' + BOARD_ID + '"' + (inDialog ? ' style="width:' + Math.min(980, $(window).width() - 80) + 'px"' : '') + '>' +
            '<div class="sb-head"><span class="sb-title">Snipe Board <span class="sb-quiet" style="font-weight:normal;font-size:10px">v' + VERSION + '</span></span>' +
            '<a href="#" class="btn sb-refresh">Dekking verversen</a>' +
            '<a href="#" class="btn sb-pick">Selecteer open</a>' +
            '<a href="#" class="btn sb-calc">Naar Snipe Calculator</a>' +
            '<a href="#" class="btn sb-gear">Instellingen</a>' +
            (inDialog ? '' : '<a href="#" class="btn sb-toggle">Inklappen</a>') +
            '<span class="sb-meta">' + nobles + ' edels in ' + trains.length + ' dorpen, ' + covered +
            ' gedekt · ' + coverMeta + '</span></div>' + settingsHtml() + '<div class="sb-body">';
        if (!trains.length) {
            html += '<div style="padding:8px">Geen edels in de lucht.</div>';
        } else {
            html += '<table class="vis"><tr><th style="width:18px"><input type="checkbox" class="sb-all" title="Alles"></th>' +
                '<th>Dorp</th><th>Edel landt</th><th>Gat ervoor</th><th>Moeilijkheid</th><th>Mikpunt</th><th>Dekking</th></tr>';
            trains.forEach(function (t) {
                var lastSecond = null;
                t.rows.forEach(function (r, i) {
                    var lv = level(r.gap);
                    var gapText = r.gap === null ? '<span class="sb-quiet">niets in de 1,5 s ervoor</span>' :
                        '<b>' + r.gap + ' ms</b> <span class="sb-quiet">na ' + escapeHtml(prevName(r.prev)) + '</span>';
                    var second = Math.floor(r.cmd.arrival / 1000);
                    var when = (second !== lastSecond ? fmtTime(r.cmd.arrival) : '') + fmtMs(r.cmd.arrival);
                    lastSecond = second;
                    var aimText = r.aim === null ? '<span class="sb-quiet">geen ruimte</span>' :
                        '<span class="sb-ms">' + fmtMs(r.aim) + '</span> <span class="sb-quiet">±' + r.keep + ' ms</span>';
                    var box = r.aim === null ? '' :
                        '<input type="checkbox" class="sb-sel" data-x="' + t.x + '" data-y="' + t.y + '" data-aim="' + r.aim +
                        '" data-id="' + (r.cmd.id || '') + '" data-pick="' + (lv.pick ? 1 : 0) + '" data-state="' + r.cover.state + '">';
                    html += '<tr class="sb-l-' + lv.key + (i === 0 ? ' sb-first' : '') + '">' +
                        '<td>' + box + '</td>' +
                        '<td>' + (i === 0 ? '<b>' + escapeHtml(t.name) + '</b> <span class="sb-quiet">(' + t.x + '|' + t.y + ')</span>' : '') + '</td>' +
                        '<td class="sb-ms">' + when + '</td>' +
                        '<td>' + gapText + '</td>' +
                        '<td><span class="sb-chip sb-' + lv.key + '" title="' + lv.tip + '">' + lv.text + '</span></td>' +
                        '<td>' + aimText + '</td>' +
                        '<td>' + coverHtml(r.cover) + '</td></tr>';
                });
            });
            html += '</table>';
        }
        return html + '</div></div>';
    }

    function bind(board, inDialog) {
        board.find('.sb-toggle').on('click', function (e) {
            e.preventDefault();
            var body = board.find('.sb-body').toggle();
            $(this).text(body.is(':visible') ? 'Inklappen' : 'Uitklappen');
        });
        board.find('.sb-gear').on('click', function (e) {
            e.preventDefault();
            board.find('.sb-settings').toggle();
        });
        board.find('.sb-set').on('change', function () {
            var key = $(this).data('key');
            SETTINGS[key] = key === 'aimMode' ? $(this).val() : Math.max(0, parseInt($(this).val(), 10) || 0);
            saveSettings();
            run(inDialog, true);
        });
        board.find('.sb-reset').on('click', function (e) {
            e.preventDefault();
            try { localStorage.removeItem(SETTINGS_KEY); } catch (err) { /* nothing stored */ }
            SETTINGS = loadSettings();
            run(inDialog, true);
        });
        board.find('.sb-all').on('change', function () {
            board.find('.sb-sel').prop('checked', this.checked);
        });
        board.find('.sb-pick').on('click', function (e) {
            e.preventDefault();
            board.find('.sb-sel').each(function () {
                var d = $(this).data();
                $(this).prop('checked', d.state !== 'covered' && d.pick === 1);
            });
        });
        board.find('.sb-calc').on('click', function (e) {
            e.preventDefault();
            var lines = board.find('.sb-sel:checked').get().map(function (el) {
                var d = $(el).data();
                return d.x + '|' + d.y + ',' + fmtIso(+d.aim) + (d.id ? ',' + d.id : '');
            });
            if (!lines.length) return UI.ErrorMessage('Vink eerst de edels aan die je wilt snipen.');
            sendToCalculator(lines.join('\n'));
        });
        board.find('.sb-refresh').on('click', function (e) {
            e.preventDefault();
            $(this).addClass('btn-disabled').text('Bezig...');
            $.get(supportUrl()).done(function (page) {
                saveSupports(readSupports(wrap(page)));
                run(inDialog, true);
            }).fail(function () {
                UI.ErrorMessage('Supportbevelen konden niet worden opgehaald.');
                run(inDialog, true);
            });
        });
    }

    function show(trains, supports, inDialog) {
        ensureCss();
        var settingsOpen = $('#' + BOARD_ID + ' .sb-settings').is(':visible');
        $('#' + BOARD_ID).remove();
        var html = boardHtml(trains, supports, inDialog);
        if (inDialog) {
            Dialog.show(DIALOG_ID, html);
        } else {
            var anchor = $('#incomings_table').closest('form');
            (anchor.length ? anchor : $('#incomings_table')).before(html);
        }
        var board = $('#' + BOARD_ID);
        if (settingsOpen) board.find('.sb-settings').show();
        bind(board, inDialog);
    }

    // ---------------------------------------------------------------- snipe calculator
    // Toxic Donut's Snipe Calculator imports "x|y,YYYY-MM-DDTHH:MM:SS.mmm,commandId"
    // lines. It only opens on the incomings page, so from anywhere else the
    // lines are parked and the incomings page is opened; the board picks them
    // up there when it runs. The lines also go to the clipboard, so a paste
    // into its Import dialog always works.

    function sendToCalculator(text) {
        copyText(text);
        if (!onIncomingsPage()) {
            try { sessionStorage.setItem(PENDING_KEY, text); } catch (e) { /* clipboard still has it */ }
            UI.InfoMessage('Naar de aanvallenpagina voor de Snipe Calculator...', 2000);
            location.href = incomingsUrl();
            return;
        }
        openCalculator(text);
    }

    function openCalculator(text) {
        var fallback = function () {
            UI.InfoMessage('De regels staan op je klembord: open in de Snipe Calculator "Import targets" en plak ze.', 6000);
        };
        var go = function () {
            waitFor('#openSnipeInterface', function (btn) {
                // The interface needs a ticked row to open on; any of its own checkboxes will do.
                var first = $('.snipeSelectedSnipes').first();
                if (first.length && !first.prop('checked')) first.prop('checked', true).trigger('change');
                btn.trigger('click');
                waitFor('.importButton', function (imp) {
                    imp.first().trigger('click');
                    waitFor('.importArea', function (area) {
                        area.val(text).trigger('input');
                        $('.importTargets').first().trigger('click');
                    }, fallback);
                }, fallback);
            }, fallback);
        };
        if ($('#openSnipeInterface').length) go();
        else $.getScript(TD_CALC).done(go).fail(fallback);
    }

    function waitFor(selector, done, fail) {
        var tries = 0;
        var timer = setInterval(function () {
            var el = $(selector + ':visible');
            if (el.length) { clearInterval(timer); done(el); }
            else if (++tries > 40) { clearInterval(timer); fail(); }
        }, 150);
    }

    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).catch(function () { /* the dialog still gets it */ });
            return;
        }
        var ta = $('<textarea>').val(text).css({position: 'fixed', left: '-1000px'}).appendTo('body');
        ta[0].select();
        try { document.execCommand('copy'); } catch (e) { /* the dialog still gets it */ }
        ta.remove();
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c];
        });
    }

    // ---------------------------------------------------------------- main

    var cachedIncomings = null;

    // inDialog: show in a window (any screen) instead of above the table.
    // reuse: keep the incomings already read (settings change, refresh).
    function run(inDialog, reuse) {
        var supports = loadSupports();
        if (!inDialog) {
            show(analyse(readIncomings($(document)), supports, serverNowMs()), supports, false);
            return;
        }
        if (reuse && cachedIncomings) {
            show(analyse(cachedIncomings, supports, serverNowMs()), supports, true);
            return;
        }
        $.get(incomingsUrl()).done(function (page) {
            cachedIncomings = readIncomings(wrap(page));
            show(analyse(cachedIncomings, supports, serverNowMs()), supports, true);
        }).fail(function () {
            UI.ErrorMessage('De aanvallenpagina kon niet worden opgehaald.');
        });
    }

    // The button sits in the game's own quest column on the left, like Toxic
    // Donut's: appended to #questlog, which is created when the page has none.
    function addFab() {
        ensureCss();
        var old = $('#' + FAB_ID);
        if (old.length && old.data('version') === VERSION) return;
        old.remove();  // a button from an older version of the script
        var log = $('#questlog, #questlog_new').first();
        if (!log.length) {
            var host = $('.maincell').first();
            (host.length ? host : $('body')).prepend('<div style="position:fixed;"><div id="questlog" class="questlog"></div></div>');
            log = $('#questlog');
        }
        var icon = (window.image_base || '') + 'unit/unit_snob.png';
        $('<div id="' + FAB_ID + '" class="quest opened" title="Snipe Board v' + VERSION + '">')
            .data('version', VERSION)
            .css('background-image', 'url(' + icon + ')')
            .append('<div class="quest_progress" style="width:0;"></div>')
            .appendTo(log)
            .on('click', function () {
                if (onIncomingsPage()) {
                    if (!$('#' + BOARD_ID).length) run(false);
                    $('html, body').animate({scrollTop: $('#' + BOARD_ID).offset().top - 60}, 200);
                } else {
                    run(true);
                }
            });
    }

    // Loaded automatically (script library) the board only opens by itself on
    // the incomings page; elsewhere it just adds the button. A second run on
    // the same page is a click on the quickbar entry: then it opens.
    var clicked = window.__snipeBoardLoaded === VERSION;
    window.__snipeBoardLoaded = VERSION;
    addFab();
    if (onIncomingsPage()) {
        run(false);
        var pending = null;
        try { pending = sessionStorage.getItem(PENDING_KEY); sessionStorage.removeItem(PENDING_KEY); } catch (e) { /* none */ }
        if (pending) openCalculator(pending);
    } else if (clicked) {
        run(true);
    }
})();
