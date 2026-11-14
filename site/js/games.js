/*
 * Game catalog and share-text readers.
 *
 * Each game copies a block of text when you tap Share. `readShares(text)` scans
 * any pasted text line by line, recognises the first line of each game's block,
 * and reads the lines that follow it. It returns one result per game:
 *
 *   { game, value, label, puzzle, detail }
 *     value   number used for ranking (see `better` on the game)
 *     label   what the board shows, e.g. "4/6" or "4,158"
 *     puzzle  the game's puzzle number, or null
 *     detail  { grid?: string, rounds?: [{ key, value }], date?: string, extra?: string }
 *
 * Works in the browser (window.Games) and in Node (require).
 */
(function (root, make) {
  var api = make();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Games = api;
})(this, function () {
  'use strict';

  var MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  var PICTO = /\p{Extended_Pictographic}/u;
  var LETTER = /\p{L}/u;

  function int(s) { return parseInt(String(s).replace(/[^\d]/g, ''), 10); }
  function nonEmpty(lines, from, max) {
    var out = [];
    for (var i = from; i < lines.length && out.length < max; i++) if (lines[i].trim()) out.push(lines[i].trim());
    return out;
  }
  // Emoji-only line (no letters or digits), e.g. a Krillion catch row.
  function isEmojiRow(s) { return PICTO.test(s) && !LETTER.test(s) && !/\d/.test(s); }

  // ---- one reader per game: (lines, i, headMatch) -> result or null ----

  function readKrillion(lines, i, m) {
    var next = nonEmpty(lines, i + 1, 3);
    var scoreLine = next.find(function (s) { return /^\d[\d,]*$/.test(s); });
    if (!scoreLine) return null;
    var after = next.slice(next.indexOf(scoreLine) + 1);
    var row = after.find(isEmojiRow);
    var value = int(scoreLine);
    return { value: value, label: value.toLocaleString('en-US'), puzzle: int(m[1]), detail: row ? { grid: row } : {} };
  }

  function readPerceptle(lines, i, m) {
    var avg = int(m[3]);
    var rounds = [];
    var next = nonEmpty(lines, i + 1, 1)[0] || '';
    var re = /(\p{Extended_Pictographic}️?)\s*(\d{1,3})/gu, r;
    while ((r = re.exec(next))) rounds.push({ key: r[1], value: int(r[2]) });
    return { value: avg, label: m[2] + ' (' + avg + ')', puzzle: int(m[1]), detail: rounds.length ? { rounds: rounds } : {} };
  }

  function readChainle(lines, i, m) {
    var value = int(m[2]);
    var detail = {};
    nonEmpty(lines, i + 1, 3).forEach(function (s) {
      var beat = s.match(/^Beat\s+(\d{1,3})%/i);
      if (beat) detail.extra = 'Beat ' + beat[1] + '% of players';
      else if (/^[🟩🟨🟧🟥]+$/u.test(s) && !detail.grid) detail.grid = s;
    });
    return { value: value, label: value.toLocaleString('en-US'), puzzle: m[1] ? int(m[1]) : null, detail: detail };
  }

  function readWorldle(lines, i, m) {
    var missed = m[3] === 'X' || m[3] === '😛';
    var rows = [];
    for (var k = i + 1; k < lines.length && k <= i + 10; k++) {
      var s = lines[k].trim();
      if (/^[🟩🟨⬛⬜]/u.test(s)) rows.push(s);
      else if (rows.length && (!s || /^https?:/.test(s))) break; // grid finished
    }
    var detail = { extra: 'Closest ' + m[4] + '%' };
    if (rows.length) detail.grid = rows.join('\n');
    return { value: missed ? 7 : int(m[3]), label: (missed ? 'X' : m[3]) + '/6', puzzle: int(m[1]), detail: detail };
  }

  function readWordle(lines, i, m) {
    var missed = m[2] === 'X';
    var rows = [];
    for (var k = i + 1; k < lines.length && k <= i + 8; k++) {
      var s = lines[k].trim();
      if (/^[⬛⬜🟨🟩🟧🟦]{5}$/u.test(s)) rows.push(s);
      else if (rows.length) break;
    }
    var detail = rows.length ? { grid: rows.join('\n') } : {};
    if (m[3]) detail.extra = 'Hard mode';
    return { value: missed ? 7 : int(m[2]), label: m[2] + '/6' + (m[3] || ''), puzzle: int(m[1]), detail: detail };
  }

  function readMaptap(lines, i, m) {
    if (MONTHS.indexOf(m[1].toLowerCase()) < 0) return null;
    var next = nonEmpty(lines, i + 1, 3);
    var finalLine = next.find(function (s) { return /^Final score:\s*\d+/i.test(s); });
    if (!finalLine) return null;
    var value = int(finalLine.match(/\d+/)[0]);
    var roundLine = next[0] !== finalLine ? next[0] : '';
    var rounds = (roundLine.match(/\d+/g) || []).slice(0, 10).map(function (n, idx) { return { key: String(idx + 1), value: int(n) }; });
    var detail = { date: m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() + ' ' + int(m[2]) };
    if (rounds.length) detail.rounds = rounds;
    if (/Antipode!/i.test(finalLine)) detail.extra = 'Antipode';
    return { value: value, label: value.toLocaleString('en-US'), puzzle: null, detail: detail };
  }

  function readGloble(lines, i, m) {
    var next = nonEmpty(lines, i + 1, 3);
    var line = next.find(function (s) { return /=\s*\d+\s*$/.test(s); });
    if (!line) return null;
    var parts = line.split('=');
    var value = int(parts[parts.length - 1]);
    var squares = parts.slice(0, -1).join('=').trim();
    var detail = { date: m[1].replace(/\s+/g, ' ').trim() };
    if (squares && squares !== '--') detail.grid = squares;
    return { value: value, label: String(value), puzzle: null, detail: detail };
  }

  // ---- catalog ----
  // better: 'high' means a bigger value wins, 'low' means fewer guesses win.
  var LIST = [
    { id: 'krillion', name: 'Krillion', icon: '🦐', url: 'https://krillion.io', better: 'high', unit: 'pts',
      head: /^Krillion\s+#(\d+)/i, read: readKrillion },
    { id: 'perceptle', name: 'Perceptle', icon: '👁️', url: 'https://perceptle.com', better: 'high', unit: 'pts',
      head: /^Perceptle\s+#(\d+)\b.*?\b([SABCDF][+-]?)\s*\((\d{1,3})\)/i, read: readPerceptle },
    { id: 'chainle', name: 'Chainle', icon: '🔗', url: 'https://chainle.io', better: 'high', unit: 'pts',
      head: /^Chainle(?:\s+#(\d+))?\s*[·•|\-–—]\s*([\d][\d,.]*)/i, read: readChainle },
    { id: 'worldle', name: 'Worldle', icon: '🗺️', url: 'https://worldle.teuteuf.fr', better: 'low', unit: 'guesses',
      head: /^#Worldle\s+#(\d+)\s*(?:\(([^)]*)\))?\s*([1-6X]|😛)\/6\s*\((\d{1,3})%\)/u, read: readWorldle },
    { id: 'wordle', name: 'Wordle', icon: '🟩', url: 'https://www.nytimes.com/games/wordle/index.html', better: 'low', unit: 'guesses',
      head: /^Wordle\s+(\d[\d,.]*)\s+([1-6X])\/6(\*?)/i, read: readWordle },
    { id: 'maptap', name: 'MapTap', icon: '📍', url: 'https://www.maptap.gg', better: 'high', unit: 'pts',
      head: /^(?:https?:\/\/)?(?:www\.)?(?:maptap\.gg|maptap)\s+([A-Za-z]+)\s+(\d{1,2})\b/i, read: readMaptap },
    { id: 'globle', name: 'Globle', icon: '🌍', url: 'https://globle-game.com', better: 'low', unit: 'guesses',
      head: /^🌎\s*([A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})\s*🌍/u, read: readGloble },
  ];
  var BY_ID = {};
  LIST.forEach(function (g) { BY_ID[g.id] = g; });
  var ORDER = LIST.map(function (g) { return g.id; });

  // Normalise line endings and spaces, and drop WhatsApp "who said it" prefixes so a
  // copied chat message works too: "[14/11/26, 4:44 PM] Name: " (iOS) and
  // "14/11/26, 4:44 pm - Name: " (Android).
  function cleanText(text) {
    return String(text == null ? '' : text)
      .replace(/\r\n?/g, '\n')
      .replace(/[   ]/g, ' ')
      .split('\n')
      .map(function (line) {
        return line
          .replace(/^\s*\[\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?,?\s+[^\]]{3,20}\]\s*[^:]{1,60}:\s*/, '')
          .replace(/^\s*\d{1,2}[./-]\d{1,2}[./-]\d{2,4},?\s+\d{1,2}:\d{2}(?:\s*[ap]\.?m\.?)?\s+-\s+[^:]{1,60}:\s*/i, '');
      })
      .join('\n');
  }

  function readShares(text) {
    var lines = cleanText(text).split('\n');
    var found = {};
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      for (var g = 0; g < LIST.length; g++) {
        var game = LIST[g];
        if (found[game.id]) continue;
        var m = line.match(game.head);
        if (!m) continue;
        var r = game.read(lines, i, m);
        if (!r) continue;
        r.game = game.id;
        found[game.id] = true;
        out.push(r);
        break;
      }
    }
    return out.sort(function (a, b) { return ORDER.indexOf(a.game) - ORDER.indexOf(b.game); });
  }

  // Negative when value a beats value b in this game, 0 when tied.
  function compare(gameId, a, b) { return BY_ID[gameId].better === 'low' ? a - b : b - a; }

  return { LIST: LIST, BY_ID: BY_ID, ORDER: ORDER, MONTHS: MONTHS, cleanText: cleanText, readShares: readShares, compare: compare };
});
