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

  // Add shared places on a numeric field (points by default): [{ row, place }]
  function placeRows(rows, key) {
    key = key || 'points';
    var place = 0;
    return rows.map(function (r, i) {
      if (i === 0 || r[key] !== rows[i - 1][key]) place = i + 1;
      return { row: r, place: place };
    });
  }

  // ---- overall ranking: the daily score ----
  // Each game a player finished among n players scores 100 × (n − place + 1) / n
  // (1st is always 100; last of 5 gets 20). A game counts once two people posted it.
  // The daily score is the average of the best GAMES_COUNTED games, and you need at
  // least that many counted games to be ranked for the day.
  var GAMES_COUNTED = 4;
  function gameScore(place, n) { return 100 * (n - place + 1) / n; }
  function round1(x) { return Math.round(x * 10) / 10; }

  // Every player who posted that day: { handle, score, qualified, counted, played, firsts, games: [{ game, score }], best, needs }
  function dailyScores(scores, day) {
    var idx = indexScores(scores.filter(function (s) { return s.day === day; }));
    var by = {};
    function row(h) { return by[h] || (by[h] = { handle: h, played: 0, counted: 0, firsts: 0, games: [] }); }
    Object.keys(idx).forEach(function (key) {
      var game = key.split('|')[1];
      var ranked = rankGame(idx[key], game);
      ranked.forEach(function (r) {
        var t = row(r.score.handle);
        t.played++;
        if (ranked.length < 2) return;
        t.counted++;
        if (r.place === 1) t.firsts++;
        t.games.push({ game: game, score: gameScore(r.place, ranked.length) });
      });
    });
    var rows = Object.keys(by).map(function (h) {
      var t = by[h];
      t.games.sort(function (a, b) { return b.score - a.score; });
      t.best = t.games.slice(0, GAMES_COUNTED);
      t.qualified = t.counted >= GAMES_COUNTED;
      t.needs = Math.max(0, GAMES_COUNTED - t.counted);
      t.score = t.qualified ? round1(t.best.reduce(function (a, g) { return a + g.score; }, 0) / GAMES_COUNTED) : null;
      return t;
    });
    return rows.sort(function (a, b) {
      if (a.qualified !== b.qualified) return a.qualified ? -1 : 1;
      return (b.score || 0) - (a.score || 0) || b.counted - a.counted || b.firsts - a.firsts || b.played - a.played || (a.handle < b.handle ? -1 : 1);
    });
  }

  // Shared places among qualified rows (equal score, games counted and firsts share a place).
  function placeDaily(rows) {
    var q = rows.filter(function (r) { return r.qualified; });
    var place = 0;
    return q.map(function (r, i) {
      var p = q[i - 1];
      if (i === 0 || r.score !== p.score || r.counted !== p.counted || r.firsts !== p.firsts) place = i + 1;
      return { row: r, place: place };
    });
  }

  // A week or month: average of your best `bestDays` ranked days, needing `minDays` of them.
  var PERIOD_RULES = { week: { bestDays: 5, minDays: 3 }, month: { bestDays: 20, minDays: 8 }, all: { bestDays: Infinity, minDays: 5 } };
  // Days in a period so far (from/to inclusive), or Infinity for all time.
  function daysIn(period) {
    if (!period.from || !period.to) return Infinity;
    return Math.round((parseDay(period.to) - parseDay(period.from)) / 864e5) + 1;
  }
  // Early in a week or month nobody can have the full minimum yet, so it grows with the days so far.
  function minDaysFor(period) {
    var rule = PERIOD_RULES[period.kind] || PERIOD_RULES.all;
    return Math.min(rule.minDays, daysIn(period));
  }
  function periodScores(scores, period) {
    var rule = { bestDays: (PERIOD_RULES[period.kind] || PERIOD_RULES.all).bestDays, minDays: minDaysFor(period) };
    var days = {};
    scores.forEach(function (s) { if (inRange(s.day, period.from, period.to)) days[s.day] = true; });
    var by = {};
    Object.keys(days).forEach(function (day) {
      var daily = dailyScores(scores, day);
      daily.forEach(function (d) {
        var t = by[d.handle] || (by[d.handle] = { handle: d.handle, dayScores: [], played: 0, wins: 0 });
        t.played++;
        if (d.qualified) t.dayScores.push(d.score);
      });
      placeDaily(daily).forEach(function (x) { if (x.place === 1) by[x.row.handle].wins++; });
    });
    var rows = Object.keys(by).map(function (h) {
      var t = by[h];
      t.dayScores.sort(function (a, b) { return b - a; });
      t.rankedDays = t.dayScores.length;
      t.qualified = t.rankedDays >= rule.minDays;
      t.needs = Math.max(0, rule.minDays - t.rankedDays);
      var used = t.dayScores.slice(0, rule.bestDays);
      t.score = t.qualified ? round1(used.reduce(function (a, b) { return a + b; }, 0) / used.length) : null;
      return t;
    });
    return rows.sort(function (a, b) {
      if (a.qualified !== b.qualified) return a.qualified ? -1 : 1;
      return (b.score || 0) - (a.score || 0) || b.rankedDays - a.rankedDays || b.wins - a.wins || (a.handle < b.handle ? -1 : 1);
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
    var overall = periodScores(scores, period);
    if ((a = top(overall, function (r) { return r.qualified ? r.score : null; }, true))) out.push({ icon: '🏆', title: 'Champion', who: a.who, note: 'daily score ' + a.value });
    if ((a = top(overall, function (r) { return r.wins || null; }, true))) out.push({ icon: '🥇', title: 'Day winner', who: a.who, note: a.value + (a.value === 1 ? ' day' : ' days') + ' on top' });
    if ((a = top(rows, function (r) { return r.crowns || null; }, true))) out.push({ icon: '👑', title: 'Crown collector', who: a.who, note: a.value + (a.value === 1 ? ' crown' : ' crowns') });
    if ((a = top(rows, function (r) { return r.posts; }, true))) out.push({ icon: '🎮', title: 'Completionist', who: a.who, note: a.value + ' scores posted' });
    var streaks = rows.map(function (r) { return { handle: r.handle, n: streak(scores, r.handle, today).current }; });
    if ((a = top(streaks, function (x) { return x.n >= 2 ? x.n : null; }, true))) out.push({ icon: '🔥', title: 'On fire', who: a.who, note: a.value + '-day streak' });
    if (period.prevFrom) {
      // Average of all ranked days, this period against the one before (2+ ranked days in each).
      var avg = function (r) { return r.dayScores.length >= 2 ? r.dayScores.reduce(function (x, y) { return x + y; }, 0) / r.dayScores.length : null; };
      var before = {};
      periodScores(scores, { kind: period.kind, from: period.prevFrom, to: period.prevTo }).forEach(function (r) { before[r.handle] = avg(r); });
      var gains = overall.map(function (r) {
        var now = avg(r), then = before[r.handle];
        if (now == null || then == null) return { handle: r.handle, g: null };
        var g = round1(now - then);
        return { handle: r.handle, g: g > 0 ? g : null };
      });
      if ((a = top(gains, function (x) { return x.g; }, true))) out.push({ icon: '📈', title: 'Most improved', who: a.who, note: '+' + a.value + ' daily score' });
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
    GAMES_COUNTED: GAMES_COUNTED, PERIOD_RULES: PERIOD_RULES, gameScore: gameScore,
    dailyScores: dailyScores, placeDaily: placeDaily, periodScores: periodScores, minDaysFor: minDaysFor,
    streak: streak, gameStats: gameStats, headToHead: headToHead, awards: awards, period: period
  };
});
