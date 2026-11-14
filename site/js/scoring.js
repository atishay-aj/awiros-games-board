/*
 * Ranking and points, as pure functions over a list of scores:
 *   { id, handle, day: 'YYYY-MM-DD', game, value, label, puzzle, detail }
 *
 * Rules: within one game on one day, places are shared on equal values.
 * 1st / 2nd / 3rd earn 3 / 2 / 1 points and 1st earns a crown, but only once
 * at least two people have posted that game that day.
 *
 * Works in the browser (window.Scoring) and in Node (require).
 */
(function (root, make) {
  if (typeof module === 'object' && module.exports) module.exports = make(require('./games.js'));
  else root.Scoring = make(root.Games);
})(this, function (Games) {
  'use strict';

  // ---- calendar days as 'YYYY-MM-DD' strings in local time ----
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dayOf(date) { return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()); }
  function parseDay(day) { var p = day.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function shift(day, n) { var d = parseDay(day); d.setDate(d.getDate() + n); return dayOf(d); }
  function mondayOf(day) { return shift(day, -((parseDay(day).getDay() + 6) % 7)); }
  function monthStart(day) { return day.slice(0, 8) + '01'; }
  function inRange(day, from, to) { return (!from || day >= from) && (!to || day <= to); }

  function points(place) { return place <= 3 ? 4 - place : 0; }

  // Index scores by "day|game" once, so repeated lookups stay cheap.
  function indexScores(scores) {
    var idx = {};
    scores.forEach(function (s) { (idx[s.day + '|' + s.game] = idx[s.day + '|' + s.game] || []).push(s); });
    return idx;
  }

  // One game on one day, best first: [{ score, place, crown, points }]
  function rankGame(list, game) {
    var sorted = (list || []).slice().sort(function (a, b) { return Games.compare(game, a.value, b.value); });
    var contested = sorted.length > 1;
    var place = 0;
    return sorted.map(function (s, i) {
      if (i === 0 || Games.compare(game, s.value, sorted[i - 1].value) !== 0) place = i + 1;
      return { score: s, place: place, crown: contested && place === 1, points: contested ? points(place) : 0 };
    });
  }

  // Totals per player for a date range (from/to inclusive, null = open).
  function totals(scores, from, to) {
    var idx = indexScores(scores.filter(function (s) { return inRange(s.day, from, to); }));
    var by = {};
    function row(h) { return by[h] || (by[h] = { handle: h, points: 0, crowns: 0, posts: 0, days: {}, crownsByGame: {} }); }
    Object.keys(idx).forEach(function (key) {
      var game = key.split('|')[1];
      rankGame(idx[key], game).forEach(function (r) {
        var t = row(r.score.handle);
        t.points += r.points; t.posts++; t.days[r.score.day] = true;
        if (r.crown) { t.crowns++; t.crownsByGame[game] = (t.crownsByGame[game] || 0) + 1; }
      });
    });
    return Object.keys(by).map(function (h) { var t = by[h]; t.dayCount = Object.keys(t.days).length; return t; })
      .sort(function (a, b) { return b.points - a.points || b.crowns - a.crowns || b.dayCount - a.dayCount || (a.handle < b.handle ? -1 : 1); });
  }

  // Add shared places by points: [{ row, place }]
  function placeRows(rows) {
    var place = 0;
    return rows.map(function (r, i) {
      if (i === 0 || r.points !== rows[i - 1].points) place = i + 1;
      return { row: r, place: place };
    });
  }

  // Consecutive days with at least one post. The current run stays alive until
  // the end of today, so not having posted yet today does not break it.
  function streak(scores, handle, today) {
    var days = {};
    scores.forEach(function (s) { if (s.handle === handle) days[s.day] = true; });
    var current = 0, d = days[today] ? today : shift(today, -1);
    while (days[d]) { current++; d = shift(d, -1); }
    var best = 0, run = 0, prev = null;
    Object.keys(days).sort().forEach(function (x) { run = prev && shift(prev, 1) === x ? run + 1 : 1; best = Math.max(best, run); prev = x; });
    return { current: current, best: best };
  }

  // Per game stats for one player.
  function gameStats(scores, handle, game) {
    var mine = scores.filter(function (s) { return s.handle === handle && s.game === game; })
      .sort(function (a, b) { return a.day < b.day ? -1 : a.day > b.day ? 1 : 0; });
    if (!mine.length) return null;
    var idx = indexScores(scores.filter(function (s) { return s.game === game; }));
    var contested = 0, wins = 0;
    mine.forEach(function (s) {
      var r = rankGame(idx[s.day + '|' + game], game);
      if (r.length > 1) { contested++; if (r.some(function (x) { return x.crown && x.score.handle === handle; })) wins++; }
    });
    var values = mine.map(function (s) { return s.value; });
    var bestValue = Games.BY_ID[game].better === 'low' ? Math.min.apply(null, values) : Math.max.apply(null, values);
    return {
      played: mine.length,
      average: values.reduce(function (a, b) { return a + b; }, 0) / values.length,
      best: mine.find(function (s) { return s.value === bestValue; }).label,
      contested: contested, wins: wins,
      recent: values.slice(-20)
    };
  }

  // Days both players posted the same game: wins for a, wins for b, ties.
  function headToHead(scores, a, b) {
    var theirs = {};
    scores.forEach(function (s) { if (s.handle === b) theirs[s.day + '|' + s.game] = s.value; });
    var byGame = {}, total = { a: 0, b: 0, tie: 0 };
    scores.forEach(function (s) {
      if (s.handle !== a) return;
      var other = theirs[s.day + '|' + s.game];
      if (other == null) return;
      var g = byGame[s.game] || (byGame[s.game] = { game: s.game, a: 0, b: 0, tie: 0 });
      var c = Games.compare(s.game, s.value, other);
      var k = c < 0 ? 'a' : c > 0 ? 'b' : 'tie';
      g[k]++; total[k]++;
    });
    return { games: Games.ORDER.filter(function (id) { return byGame[id]; }).map(function (id) { return byGame[id]; }), total: total };
  }

  // Awards for a period. Each award lists every player tied for it.
  function awards(scores, period, today) {
    var rows = totals(scores, period.from, period.to);
    var out = [];
    if (!rows.length) return out;
    function top(list, valueOf, higherWins) {
      var best = null, who = [];
      list.forEach(function (x) {
        var v = valueOf(x);
        if (v == null) return;
        if (best === null || (higherWins ? v > best : v < best)) { best = v; who = [x.handle]; }
        else if (v === best) who.push(x.handle);
      });
      return best === null ? null : { who: who, value: best };
    }
    var a;
    if ((a = top(rows, function (r) { return r.points || null; }, true))) out.push({ icon: '🏆', title: 'Champion', who: a.who, note: a.value + ' points' });
    if ((a = top(rows, function (r) { return r.crowns || null; }, true))) out.push({ icon: '👑', title: 'Crown collector', who: a.who, note: a.value + (a.value === 1 ? ' crown' : ' crowns') });
    if ((a = top(rows, function (r) { return r.posts; }, true))) out.push({ icon: '🎮', title: 'Completionist', who: a.who, note: a.value + ' scores posted' });
    var streaks = rows.map(function (r) { return { handle: r.handle, n: streak(scores, r.handle, today).current }; });
    if ((a = top(streaks, function (x) { return x.n >= 2 ? x.n : null; }, true))) out.push({ icon: '🔥', title: 'On fire', who: a.who, note: a.value + '-day streak' });
    if (period.prevFrom) {
      var before = {};
      totals(scores, period.prevFrom, period.prevTo).forEach(function (r) { before[r.handle] = r; });
      var gains = rows.map(function (r) {
        var p = before[r.handle];
        if (!p || r.dayCount < 2 || p.dayCount < 2) return { handle: r.handle, g: null };
        var g = Math.round((r.points / r.dayCount - p.points / p.dayCount) * 10) / 10;
        return { handle: r.handle, g: g > 0 ? g : null };
      });
      if ((a = top(gains, function (x) { return x.g; }, true))) out.push({ icon: '📈', title: 'Most improved', who: a.who, note: '+' + a.value + ' points a day' });
    }
    var wordle = rows.map(function (r) {
      var v = scores.filter(function (s) { return s.handle === r.handle && s.game === 'wordle' && inRange(s.day, period.from, period.to); }).map(function (s) { return s.value; });
      return { handle: r.handle, avg: v.length >= 3 ? Math.round(v.reduce(function (x, y) { return x + y; }, 0) / v.length * 100) / 100 : null };
    });
    if ((a = top(wordle, function (x) { return x.avg; }, false))) out.push({ icon: '🎯', title: 'Wordle sharpshooter', who: a.who, note: a.value.toFixed(2) + ' guesses on average' });
    return out;
  }

  function period(kind, today) {
    if (kind === 'week') {
      var w = mondayOf(today);
      return { kind: kind, from: w, to: today, prevFrom: shift(w, -7), prevTo: shift(w, -1), title: 'This week' };
    }
    if (kind === 'month') {
      var m = monthStart(today);
      return { kind: kind, from: m, to: today, prevFrom: monthStart(shift(m, -1)), prevTo: shift(m, -1), title: 'This month' };
    }
    return { kind: 'all', from: null, to: null, title: 'All time' };
  }

  return {
    dayOf: dayOf, parseDay: parseDay, shift: shift, mondayOf: mondayOf, monthStart: monthStart,
    points: points, indexScores: indexScores, rankGame: rankGame, totals: totals, placeRows: placeRows,
    streak: streak, gameStats: gameStats, headToHead: headToHead, awards: awards, period: period
  };
});
