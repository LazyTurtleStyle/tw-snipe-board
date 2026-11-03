/*
 * Snipe Board v1.5 - per edeltrein: het gat voor elke edel, de moeilijkheid
 * en of er al een eigen support voor landt (SNIPE OK) of nog niet (SNIPE THIS).
 *
 * Gebruik: in de snellijst zetten (eventueel met automatisch laden). Op de
 * inkomende-aanvallenpagina staat het board boven de tabel; op elk ander scherm
 * opent de edel-knop in de questlijst het board in een venster. Het script
 * leest pagina's; alleen op jouw klik hernoemt het gedekte edels naar
 * "Edel SNIPE OK [n ms]". Versturen of annuleren doet het nooit.
 */
(function () {
    'use strict';

    var VERSION = '1.9';
    var LEVELS = {easy: 'Makkelijk', mid: 'Gemiddeld', hard: 'Moeilijk', free: 'Vrij'};
    var STATES = {open: 'SNIPE THIS', covered: 'SNIPE OK'};
    var DEFAULTS = {
        easyMs: 40,           // gat >= dit: makkelijk
        hardMs: 15,           // gat < dit: moeilijk (daartussen gemiddeld)
        pickLevels: ['easy', 'mid', 'free'],   // wat "Selecteer" aanvinkt
        pickStates: ['open'],
        filter: 'all',        // all | open | covered
        autoRefresh: true,    // dekking ophalen bij het openen van het board
        zeroMsOk: false,      // support op dezelfde ms als de edel telt als SNIPE OK (een gok: 50/50)
        staleMin: 15,         // oudere dekking kleurt rood
        trainWindowMs: 1500,  // alleen bevelen binnen deze tijd voor een edel tellen als "ervoor"
        nobleLabels: ['edel', 'noble', 'snob'],
        ignoreLabels: ['c-snipe', 'c snipe', 'c- snipe', 'recap']
    };
    var SAVED = ['easyMs', 'hardMs', 'pickLevels', 'pickStates', 'filter', 'autoRefresh', 'zeroMsOk'];
    var TD_CALC = 'https://media.innogamescdn.com/com_DS_NL/scripts/Toxic-Donuts-Snipe-Calculator._206313.js';

    var BOARD_ID = 'snipe-board';
    var FAB_ID = 'snipe-board-fab';
    var DIALOG_ID = 'snipe_board_dialog';
    var STORE_KEY = 'snipeboard_' + game_data.world + '_supports';
    var SETTINGS_KEY = 'snipeboard_' + game_data.world + '_settings';
    var PENDING_KEY = 'snipeboard_' + game_data.world + '_pending_import';
    var SETTINGS = loadSettings();

    function loadSettings() {
        var s = $.extend(true, {}, DEFAULTS);
        try {
            var saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
            SAVED.forEach(function (k) { if (saved[k] !== undefined) s[k] = saved[k]; });
        } catch (e) { /* defaults */ }
        return s;
    }

    function saveSettings() {
        var keep = {};
        SAVED.forEach(function (k) { keep[k] = SETTINGS[k]; });
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

    // The commands overview lists only what left from villages in the
    // current group, and snipes mostly leave from def villages. So it is read
    // for all villages (group=0) and the player's own group is put back after.
    function supportUrl(group) {
        return '/game.php?village=' + game_data.village.id +
            '&screen=overview_villages&mode=commands&type=support&page=-1&group=' + group;
    }

    function currentGroup() {
        var g = game_data && game_data.group_id;
        return g === undefined || g === null || g === '' ? '0' : String(g);
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

    function isSupportRow($row, own) {
        if ($row.find('img[src*="command/support"], [data-command-type="support"]').length) return true;
        // our own command without an attack icon: support from one of our villages
        return own && !$row.find('img[src*="command/attack"]').length;
    }

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
            // The "Alle" tab lists incoming support in the same table. A
            // support is coverage, never a command in front of a noble.
            var own = $.trim(cells.eq(3).text()) === game_data.player.name;
            if (isSupportRow($(this), own)) return;
            out.push({
                id: cells.eq(0).find('.quickedit').data('id'),
                label: label,
                noble: startsWithAny(label, SETTINGS.nobleLabels) || snobIcon,
                ignored: hasAny(label, SETTINGS.ignoreLabels),
                own: own,
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
                rows.push({cmd: c, prev: prev, gap: prev ? c.arrival - prev.arrival : null,
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
            // On the noble's own millisecond it is a coin flip which goes first.
            if (s.arrival > noble.arrival || s.arrival <= lo) return;
            if (s.arrival === noble.arrival && !SETTINGS.zeroMsOk) return;
            if (prev && s.arrival <= prev.arrival) { early = s; return; }
            if (!best || s.arrival > best.arrival) best = s;
        });
        if (best) return {state: 'covered', delta: best.arrival - noble.arrival};
        if (early) return {state: 'early', delta: early.arrival - noble.arrival};
        return {state: 'open'};
    }

    // "early" (a support in front of the anti-snipe) still needs a snipe: open.
    function stateKey(cover) { return cover.state === 'covered' ? 'covered' : 'open'; }

    function level(gap) {
        if (gap === null) return {key: 'free', tip: 'Niets in de 1,5 s ervoor'};
        if (gap >= SETTINGS.easyMs) return {key: 'easy', tip: 'Gat van ' + SETTINGS.easyMs + ' ms of meer'};
        if (gap >= SETTINGS.hardMs) return {key: 'mid', tip: 'Gat tussen ' + SETTINGS.hardMs + ' en ' + SETTINGS.easyMs + ' ms'};
        return {key: 'hard', tip: 'Gat kleiner dan ' + SETTINGS.hardMs + ' ms'};
    }

    function prevName(prev) {
        if (!prev) return '';
        var l = prev.label.replace(/[<>]+/g, ' ').replace(/\s+/g, ' ').trim();
        var word = l.split(' ')[0] || 'aanval';
        return (prev.own ? 'eigen ' : '') + word.toLowerCase() + ' ' + fmtMs(prev.arrival);
    }

    function pickLabel() {
        var lv = ['easy', 'mid', 'hard', 'free'].filter(function (k) { return SETTINGS.pickLevels.indexOf(k) !== -1; });
        var names = lv.length === 4 ? 'alles' : lv.map(function (k) { return LEVELS[k].toLowerCase(); }).join(' + ');
        var st = SETTINGS.pickStates;
        var suffix = st.length === 1 ? ' (' + STATES[st[0]] + ')' : '';
        return 'Selecteer ' + (names || 'niets') + suffix;
    }

    // ---------------------------------------------------------------- render

    var CSS =
        '#snipe-board{margin:0 0 10px;border:1px solid #804000;background:#fff5da}' +
        '#snipe-board .sb-head{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:5px 8px;' +
            'background:linear-gradient(#e3c485,#c1a264);border-bottom:1px solid #804000}' +
        '#snipe-board .sb-title{font-weight:bold;font-size:13px;margin-right:4px}' +
        '#snipe-board .sb-icons{display:inline-flex;margin-right:6px}' +
        '#snipe-board .sb-icons .btn{padding:2px 7px;min-width:0;margin:0;border-radius:0;font-size:12px;line-height:16px}' +
        '#snipe-board .sb-icons .btn:first-child{border-radius:4px 0 0 4px}' +
        '#snipe-board .sb-icons .btn:last-child{border-radius:0 4px 4px 0}' +
        '#snipe-board .sb-icons .sb-refresh{color:#5fd34a}' +
        '#snipe-board .sb-filter{display:inline-flex;margin-left:6px}' +
        '#snipe-board .sb-filter a{padding:1px 7px;border:1px solid #804000;margin-left:-1px;background:#f4e4bc;' +
            'color:#5a3a10;font-size:11px;text-decoration:none}' +
        '#snipe-board .sb-filter a.sb-on{background:#804000;color:#fff}' +
        '#snipe-board .sb-filter a:first-child{border-radius:4px 0 0 4px}' +
        '#snipe-board .sb-filter a:last-child{border-radius:0 4px 4px 0}' +
        '#snipe-board .sb-meta{margin-left:auto;font-size:11px}' +
        '#snipe-board .sb-stale{color:#a8322a;font-weight:bold}' +
        '#snipe-board .sb-settings{display:none;padding:8px 10px;background:#f4e4bc;border-bottom:1px solid #c1a264}' +
        '#snipe-board .sb-settings .sb-row{display:flex;align-items:center;gap:8px;margin:4px 0}' +
        '#snipe-board .sb-settings .sb-row > span:first-child{width:170px;font-weight:bold}' +
        '#snipe-board .sb-settings label{white-space:nowrap;margin-right:10px}' +
        '#snipe-board .sb-settings input[type=number]{width:50px}' +
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
        '#snipe-board .sb-this{color:#8a5a00;font-weight:bold}' +
        '#snipe-board .sb-bad{color:#a8322a;font-weight:bold}' +
        '#snipe-board .sb-quiet{color:#7a6a4a}' +
        '#snipe-board .sb-ms{font-family:monospace;font-size:12px}' +
        '#' + FAB_ID + '{background-size:22px 22px !important;background-position:center !important;' +
            'background-repeat:no-repeat !important;cursor:pointer}';

    // Versioned, so an older copy that already ran on this page (its style
    // pinned the button to the screen edge) cannot leave its look behind.
    function ensureCss() {
        var id = 'snipe-board-css-' + VERSION.replace('.', '-');
        $('style[id^="snipe-board-css"]').not('#' + id).remove();
        if (!$('#' + id).length) $('<style id="' + id + '">').text(CSS).appendTo('head');
    }

    function checks(group, all, chosen) {
        return Object.keys(all).map(function (k) {
            return '<label><input type="checkbox" class="sb-chk" data-group="' + group + '" value="' + k + '"' +
                (chosen.indexOf(k) !== -1 ? ' checked' : '') + '> ' + all[k] + '</label>';
        }).join('');
    }

    function settingsHtml() {
        var s = SETTINGS;
        return '<div class="sb-settings">' +
            '<div class="sb-row"><span>Makkelijk vanaf</span><input type="number" class="sb-set" data-key="easyMs" value="' + s.easyMs + '"> ms gat</div>' +
            '<div class="sb-row"><span>Moeilijk onder</span><input type="number" class="sb-set" data-key="hardMs" value="' + s.hardMs + '"> ms gat</div>' +
            '<div class="sb-row"><span>Selecteer-knop: moeilijkheid</span>' + checks('pickLevels', LEVELS, s.pickLevels) + '</div>' +
            '<div class="sb-row"><span>Selecteer-knop: status</span>' + checks('pickStates', STATES, s.pickStates) + '</div>' +
            '<div class="sb-row"><span>Dekking</span><label><input type="checkbox" class="sb-auto"' + (s.autoRefresh ? ' checked' : '') +
                '> automatisch verversen bij openen</label></div>' +
            '<div class="sb-row"><span></span><label><input type="checkbox" class="sb-zero"' + (s.zeroMsOk ? ' checked' : '') +
                '> 0 ms telt als SNIPE OK (gok: 50/50)</label></div>' +
            '<div class="sb-row"><span></span><a href="#" class="btn sb-reset">Standaard</a></div></div>';
    }

    function coverHtml(c) {
        if (c.state === 'covered') return '<span class="sb-ok">✔ SNIPE OK (' + (c.delta === 0 ? '0 ms · gok' : c.delta + ' ms') + ')</span>';
        if (c.state === 'early') return '<span class="sb-bad">⚠ SNIPE THIS · support vóór anti-snipe (' + c.delta + ' ms)</span>';
        if (c.state === 'unknown') return '<span class="sb-quiet">?</span>';
        return '<span class="sb-this">SNIPE THIS</span>';
    }

    function dialogWidth() {
        return Math.max(600, Math.min(1000, $(window).width() - 120));
    }

    function boardHtml(trains, supports, inDialog, collapsed) {
        var nobles = 0, covered = 0;
        trains.forEach(function (t) {
            t.rows.forEach(function (r) { nobles++; if (r.cover.state === 'covered') covered++; });
        });
        var age = supports ? Math.round((serverNowMs() - supports.at) / 60000) : null;
        var refreshed = !supports ? '<span class="sb-stale">nog niet ververst</span>' :
            '<span' + (age >= SETTINGS.staleMin ? ' class="sb-stale"' : '') + '>' +
            fmtTime(supports.at).slice(0, 5) + ' laatste refresh</span>';
        var f = SETTINGS.filter;
        var html = '<div id="' + BOARD_ID + '"' + (inDialog ? ' style="width:' + dialogWidth() + 'px"' : '') + '>' +
            '<div class="sb-head"><span class="sb-title">Snipe Board <span class="sb-quiet" style="font-weight:normal;font-size:10px">v' + VERSION + '</span></span>' +
            '<span class="sb-icons">' +
                '<a href="#" class="btn sb-refresh" title="Dekking verversen">✔</a>' +
                (inDialog ? '' : '<a href="#" class="btn sb-toggle" title="In- of uitklappen">' + (collapsed ? '▼' : '▲') + '</a>') +
                '<a href="#" class="btn sb-rename" title="Gedekte edels hernoemen naar Edel SNIPE OK [n ms]">✎</a>' +
                '<a href="#" class="btn sb-gear" title="Instellingen">⚙</a>' +
            '</span>' +
            '<a href="#" class="btn sb-pick">' + pickLabel() + '</a>' +
            '<a href="#" class="btn sb-calc">Naar Snipe Calculator</a>' +
            '<span class="sb-filter" title="Toon">' +
                '<a href="#" data-filter="all"' + (f === 'all' ? ' class="sb-on"' : '') + '>Alle</a>' +
                '<a href="#" data-filter="open"' + (f === 'open' ? ' class="sb-on"' : '') + '>SNIPE THIS</a>' +
                '<a href="#" data-filter="covered"' + (f === 'covered' ? ' class="sb-on"' : '') + '>SNIPE OK</a>' +
            '</span>' +
            '<span class="sb-meta">' + nobles + ' edels · ' + covered + ' OK · ' + refreshed + '</span></div>' +
            settingsHtml() + '<div class="sb-body"' + (collapsed ? ' style="display:none"' : '') + '>';
        var shown = 0;
        var body = '';
        trains.forEach(function (t) {
            var lastSecond = null, first = true;
            t.rows.forEach(function (r) {
                var st = stateKey(r.cover);
                if (f !== 'all' && r.cover.state !== 'unknown' && st !== f) return;
                shown++;
                var lv = level(r.gap);
                var gapText = r.gap === null ? '<span class="sb-quiet">niets in de 1,5 s ervoor</span>' :
                    '<b>' + r.gap + ' ms</b> <span class="sb-quiet">na ' + escapeHtml(prevName(r.prev)) + '</span>';
                var second = Math.floor(r.cmd.arrival / 1000);
                var when = (second !== lastSecond ? fmtTime(r.cmd.arrival) : '') + fmtMs(r.cmd.arrival);
                lastSecond = second;
                var box = '<input type="checkbox" class="sb-sel" data-x="' + t.x + '" data-y="' + t.y +
                    '" data-arr="' + r.cmd.arrival + '" data-id="' + (r.cmd.id || '') + '" data-level="' + lv.key +
                    '" data-state="' + st + '" data-delta="' + (r.cover.delta || '') + '" data-label="' + escapeHtml(r.cmd.label) + '">';
                body += '<tr class="sb-l-' + lv.key + (first ? ' sb-first' : '') + '">' +
                    '<td>' + box + '</td>' +
                    '<td>' + (first ? '<b>' + escapeHtml(t.name) + '</b> <span class="sb-quiet">(' + t.x + '|' + t.y + ')</span>' : '') + '</td>' +
                    '<td class="sb-ms">' + when + '</td>' +
                    '<td>' + gapText + '</td>' +
                    '<td><span class="sb-chip sb-' + lv.key + '" title="' + lv.tip + '">' + LEVELS[lv.key] + '</span></td>' +
                    '<td>' + coverHtml(r.cover) + '</td></tr>';
                first = false;
            });
        });
        if (!shown) {
            html += '<div style="padding:8px">' + (nobles ? 'Niets in dit filter.' : 'Geen edels in de lucht.') + '</div>';
        } else {
            html += '<table class="vis"><tr><th style="width:18px"><input type="checkbox" class="sb-all" title="Alles"></th>' +
                '<th>Dorp</th><th>Edel landt</th><th>Gat ervoor</th><th>Moeilijkheid</th><th>Dekking</th></tr>' + body + '</table>';
        }
        return html + '</div></div>';
    }

    function bind(board, inDialog) {
        board.find('.sb-toggle').on('click', function (e) {
            e.preventDefault();
            var body = board.find('.sb-body').toggle();
            $(this).text(body.is(':visible') ? '▲' : '▼');
        });
        board.find('.sb-gear').on('click', function (e) {
            e.preventDefault();
            board.find('.sb-settings').toggle();
        });
        board.find('.sb-set').on('change', function () {
            SETTINGS[$(this).data('key')] = Math.max(0, parseInt($(this).val(), 10) || 0);
            saveSettings();
            run(inDialog, true);
        });
        board.find('.sb-chk').on('change', function () {
            var group = $(this).data('group');
            SETTINGS[group] = board.find('.sb-chk[data-group="' + group + '"]:checked').get().map(function (el) { return el.value; });
            saveSettings();
            run(inDialog, true);
        });
        board.find('.sb-auto').on('change', function () {
            SETTINGS.autoRefresh = this.checked;
            saveSettings();
        });
        board.find('.sb-zero').on('change', function () {
            SETTINGS.zeroMsOk = this.checked;
            saveSettings();
            run(inDialog, true);
        });
        board.find('.sb-reset').on('click', function (e) {
            e.preventDefault();
            try { localStorage.removeItem(SETTINGS_KEY); } catch (err) { /* nothing stored */ }
            SETTINGS = loadSettings();
            run(inDialog, true);
        });
        board.find('.sb-filter a').on('click', function (e) {
            e.preventDefault();
            SETTINGS.filter = $(this).data('filter');
            saveSettings();
            run(inDialog, true);
        });
        board.find('.sb-all').on('change', function () {
            board.find('.sb-sel').prop('checked', this.checked);
        });
        board.find('.sb-pick').on('click', function (e) {
            e.preventDefault();
            board.find('.sb-sel').each(function () {
                var d = $(this).data();
                $(this).prop('checked', SETTINGS.pickLevels.indexOf(d.level) !== -1 &&
                    SETTINGS.pickStates.indexOf(d.state) !== -1);
            });
        });
        board.find('.sb-calc').on('click', function (e) {
            e.preventDefault();
            var lines = board.find('.sb-sel:checked').get().map(function (el) {
                var d = $(el).data();
                return d.x + '|' + d.y + ',' + fmtIso(+d.arr) + (d.id ? ',' + d.id : '');
            });
            if (!lines.length) return UI.ErrorMessage('Vink eerst de edels aan die je wilt snipen.');
            sendToCalculator(lines.join('\n'));
        });
        board.find('.sb-rename').on('click', function (e) {
            e.preventDefault();
            renameCovered(board, inDialog);
        });
        board.find('.sb-refresh').on('click', function (e) {
            e.preventDefault();
            refreshSupports(function () { run(inDialog, true); });
        });
    }

    function show(trains, supports, inDialog) {
        ensureCss();
        var old = $('#' + BOARD_ID);
        var settingsOpen = old.find('.sb-settings').is(':visible');
        var collapsed = old.length ? !old.find('.sb-body').is(':visible') : false;
        old.remove();
        var html = boardHtml(trains, supports, inDialog, collapsed && !inDialog);
        if (inDialog) {
            Dialog.show(DIALOG_ID, html);
            // The game's popup has its own max width and scrolls sideways
            // past it; widen the box to the board instead.
            $('#popup_box_' + DIALOG_ID).css({width: dialogWidth() + 40 + 'px', 'max-width': 'none'})
                .find('.popup_box_content').css({'overflow-x': 'visible', 'max-width': 'none'});
        } else {
            var anchor = $('#incomings_table').closest('form');
            (anchor.length ? anchor : $('#incomings_table')).before(html);
        }
        var board = $('#' + BOARD_ID);
        if (settingsOpen) board.find('.sb-settings').show();
        bind(board, inDialog);
    }

    function refreshSupports(done) {
        $('#' + BOARD_ID + ' .sb-refresh').text('…');
        var group = currentGroup();
        $.get(supportUrl('0')).done(function (page) {
            saveSupports(readSupports(wrap(page)));
        }).fail(function () {
            UI.ErrorMessage('Supportbevelen konden niet worden opgehaald.');
        }).always(function () {
            if (group === '0') return done();
            $.get(supportUrl(group)).always(done);
        });
    }

    // ---------------------------------------------------------------- rename
    // Covered nobles get "Edel SNIPE OK [n ms]" through the game's own rename
    // request (the pencil next to an incoming), one per noble, 250 ms apart.
    // The label keeps "Edel" at the front, so the board still reads it as a noble.

    function renameCovered(board, inDialog) {
        var todo = board.find('.sb-sel').get().map(function (el) { return $(el).data(); }).filter(function (d) {
            return d.state === 'covered' && d.id && !/snipe\s*ok/i.test(d.label || '');
        });
        if (!todo.length) return UI.InfoMessage('Geen gedekte edels om te hernoemen.');
        var done = 0, failed = 0;
        (function next(i) {
            if (i >= todo.length) {
                UI.SuccessMessage(done + ' edel(s) hernoemd' + (failed ? ', ' + failed + ' mislukt' : '') + '.');
                cachedIncomings = null;
                run(inDialog, !inDialog);
                return;
            }
            var d = todo[i];
            var label = 'Edel SNIPE OK [' + Math.abs(+d.delta) + ' ms]';
            TribalWars.post('info_command', {ajaxaction: 'edit_other_comment', id: d.id}, {text: label},
                function () {
                    done++;
                    // The table on this page shows the new label straight away.
                    $('.quickedit[data-id="' + d.id + '"] .quickedit-label').text(' ' + label + ' ');
                    setTimeout(function () { next(i + 1); }, 250);
                },
                function () { failed++; setTimeout(function () { next(i + 1); }, 250); });
        })(0);
    }

    // ---------------------------------------------------------------- snipe calculator
    // Toxic Donut's Snipe Calculator imports "x|y,YYYY-MM-DDTHH:MM:SS.mmm,commandId"
    // lines; the time is the noble's own arrival. It only opens on the incomings
    // page, so from anywhere else the lines are parked and the incomings page is
    // opened; the board picks them up there when it runs. The lines also go to
    // the clipboard, so a paste into its Import dialog always works.

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
        var draw = function (incomings) {
            var supports = loadSupports();
            show(analyse(incomings, supports, serverNowMs()), supports, inDialog);
        };
        var withIncomings = function (cb) {
            if (!inDialog) return cb(readIncomings($(document)));
            if (reuse && cachedIncomings) return cb(cachedIncomings);
            $.get(incomingsUrl()).done(function (page) {
                cachedIncomings = readIncomings(wrap(page));
                cb(cachedIncomings);
            }).fail(function () {
                UI.ErrorMessage('De aanvallenpagina kon niet worden opgehaald.');
            });
        };
        withIncomings(function (incomings) {
            draw(incomings);
            // A fresh board fetches its coverage once (setting); reruns from a
            // click on the board itself do not.
            if (!reuse && SETTINGS.autoRefresh) refreshSupports(function () { draw(incomings); });
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
        // The 60px unit portrait scaled down stays sharp; the 18px icon blurs.
        var icon = (window.image_base || '') + 'unit_big/snob.png';
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

    // Loaded automatically the board only opens by itself on the incomings
    // page; elsewhere it just adds the button. A second run on the same page
    // is a click on the quickbar entry: then it opens.
    var clicked = window.__snipeBoardLoaded === VERSION;
    window.__snipeBoardLoaded = VERSION;
    addFab();
    if (onIncomingsPage()) {
        if (!clicked || !$('#' + BOARD_ID).length) run(false);
        var pending = null;
        try { pending = sessionStorage.getItem(PENDING_KEY); sessionStorage.removeItem(PENDING_KEY); } catch (e) { /* none */ }
        if (pending) openCalculator(pending);
    } else if (clicked) {
        run(true);
    }
})();
