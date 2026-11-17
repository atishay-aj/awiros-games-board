const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../site/js/scoring.js');

let id = 0;
const sc = (handle, day, game, value) => ({ id: ++id, handle, day, game, value, label: String(value), puzzle: null, detail: {} });

test('days: shift across months, Monday of the week, month start', () => {
  assert.equal(S.shift('2026-11-30', 1), '2026-12-01');
  assert.equal(S.shift('2026-03-01', -1), '2026-02-28');
  assert.equal(S.mondayOf('2026-11-14'), '2026-11-09'); // Saturday
  assert.equal(S.mondayOf('2026-11-16'), '2026-11-16'); // Monday
  assert.equal(S.monthStart('2026-11-14'), '2026-11-01');
});

test('rankGame: higher wins for points games, lower for guess games, ties share', () => {
  const k = S.rankGame([sc('a', 'd', 'krillion', 200), sc('b', 'd', 'krillion', 300), sc('c', 'd', 'krillion', 200)], 'krillion');
  assert.deepEqual(k.map((r) => [r.score.handle, r.place, r.points, r.crown]), [['b', 1, 3, true], ['a', 2, 2, false], ['c', 2, 2, false]]);
  const w = S.rankGame([sc('a', 'd', 'wordle', 4), sc('b', 'd', 'wordle', 3), sc('c', 'd', 'wordle', 3), sc('e', 'd', 'wordle', 7)], 'wordle');
  assert.deepEqual(w.map((r) => [r.score.handle, r.place, r.points]), [['b', 1, 3], ['c', 1, 3], ['a', 3, 1], ['e', 4, 0]]);
  assert.ok(w[0].crown && w[1].crown, 'tied winners both get a crown');
});

test('a lone entry earns no points and no crown', () => {
  const r = S.rankGame([sc('a', 'd', 'globle', 2)], 'globle');
  assert.deepEqual([r[0].place, r[0].points, r[0].crown], [1, 0, false]);
});

test('totals over a range, sorted by points then crowns', () => {
  const scores = [
    sc('a', '2026-11-10', 'krillion', 300), sc('b', '2026-11-10', 'krillion', 200),
    sc('a', '2026-11-11', 'wordle', 5), sc('b', '2026-11-11', 'wordle', 2),
    sc('b', '2026-11-12', 'maptap', 900), sc('c', '2026-11-12', 'maptap', 100),
    sc('a', '2026-11-01', 'krillion', 999), sc('c', '2026-11-01', 'krillion', 1),
  ];
  const t = S.totals(scores, '2026-11-09', '2026-11-15');
  assert.deepEqual(t.map((r) => [r.handle, r.points, r.crowns, r.dayCount]), [['b', 8, 2, 3], ['a', 5, 1, 2], ['c', 2, 0, 1]]);
  assert.deepEqual(S.placeRows([{ points: 5 }, { points: 5 }, { points: 2 }]).map((x) => x.place), [1, 1, 3]);
});

test('streaks: today not posted yet keeps the run alive; best run', () => {
  const scores = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-12', '2026-11-13'].map((d) => sc('a', d, 'wordle', 3));
  assert.deepEqual(S.streak(scores, 'a', '2026-11-14'), { current: 2, best: 3 });
  assert.deepEqual(S.streak(scores, 'a', '2026-11-15'), { current: 0, best: 3 });
});

test('head to head counts only days both played the same game', () => {
  const scores = [
    sc('a', 'd1', 'wordle', 3), sc('b', 'd1', 'wordle', 4),
    sc('a', 'd2', 'wordle', 5), sc('b', 'd2', 'wordle', 5),
    sc('a', 'd3', 'krillion', 100), sc('b', 'd3', 'krillion', 300),
    sc('a', 'd4', 'globle', 2),
  ];
  const h = S.headToHead(scores, 'a', 'b');
  assert.deepEqual(h.total, { a: 1, b: 1, tie: 1 });
  assert.deepEqual(h.games.map((g) => g.game), ['krillion', 'wordle']);
});

test('gameStats: average, best label, crowns won out of contested days', () => {
  const scores = [sc('a', 'd1', 'wordle', 3), sc('b', 'd1', 'wordle', 4), sc('a', 'd2', 'wordle', 5), sc('b', 'd2', 'wordle', 2), sc('a', 'd3', 'wordle', 4)];
  const g = S.gameStats(scores, 'a', 'wordle');
  assert.deepEqual([g.played, g.average, g.best, g.contested, g.wins], [3, 4, '3', 2, 1]);
  assert.equal(S.gameStats(scores, 'zz', 'wordle'), null);
});

const ORDER7 = ['krillion', 'perceptle', 'chainle', 'worldle', 'wordle', 'maptap', 'globle'];
const LOW = ['worldle', 'wordle', 'globle'];
// One player's day in a 5-player field: places[i] is their place in ORDER7[i] (null = skipped).
// Four fillers take the other places, so the field is always exactly 5.
function fieldOfFive(handle, day, places) {
  const out = [];
  places.forEach((place, gi) => {
    if (place == null) return;
    const game = ORDER7[gi];
    const valueAt = (p) => (LOW.includes(game) ? p : 60 - p * 10); // place 1 = best value
    out.push(sc(handle, day, game, valueAt(place)));
    [1, 2, 3, 4, 5].filter((p) => p !== place).forEach((p, k) => out.push(sc(handle + '-f' + k, day, game, valueAt(p))));
  });
  return out;
}
test('game score: 1st is always 100, last of 5 gets 20, ties share', () => {
  assert.equal(S.gameScore(1, 5), 100);
  assert.equal(S.gameScore(5, 5), 20);
  assert.equal(S.gameScore(2, 2), 50);
});

test('daily score: average of best 4 counted games; fewer than 4 is not ranked', () => {
  const score = (h, places) => S.dailyScores(fieldOfFive(h, 'd', places), 'd').find((r) => r.handle === h);
  assert.equal(score('neha', [1, 2, 2, 3, 4, 4, 5]).score, 80);          // 100 80 80 60, drops 40 40 20
  assert.equal(score('atishay', [1, 2, 3, 3, 5, null, null]).score, 75); // 100 80 60 60, drops 20
  assert.equal(score('rahul', [1, 1, 3, 5, null, null, null]).score, 70); // 100 100 60 20
  const priya = score('priya', [1, 1, 1, null, null, null, null]);
  assert.deepEqual([priya.qualified, priya.needs, priya.score], [false, 1, null]);
});

test('daily scores are whole numbers', () => {
  // 3 players, 4 games: b finishes 2,2,1,1 -> 66.7 66.7 100 100 = 83.3, shown and ranked as 83
  const games = ['krillion', 'perceptle', 'chainle', 'maptap'];
  const places = { a: [1, 1, 2, 3], b: [2, 2, 1, 1], c: [3, 3, 3, 2] };
  const scores = games.flatMap((g, i) => Object.entries(places).map(([h, p]) => sc(h, 'd', g, 10 - p[i])));
  assert.deepEqual(S.dailyScores(scores, 'd').map((r) => [r.handle, r.score]), [['b', 83], ['a', 75], ['c', 42]]);
});

test('daily ranking: ranked players first, by score', () => {
  const games = ['krillion', 'perceptle', 'chainle', 'maptap'];
  const scores = games.flatMap((g) => [sc('a', 'd', g, 30), sc('b', 'd', g, 20), sc('c', 'd', g, 10)]);
  scores.push(sc('z', 'd', 'krillion', 99)); // only one game: not ranked, though it won that game
  assert.deepEqual(S.dailyScores(scores, 'd').map((r) => r.handle), ['a', 'b', 'c', 'z']);
});

test('daily score: a game only one person posted does not count', () => {
  const scores = [
    ...['krillion', 'perceptle', 'chainle'].flatMap((g) => [sc('a', 'd', g, 9), sc('b', 'd', g, 1)]),
    sc('a', 'd', 'maptap', 900), // alone in MapTap
  ];
  const a = S.dailyScores(scores, 'd').find((r) => r.handle === 'a');
  assert.deepEqual([a.played, a.counted, a.qualified, a.needs], [4, 3, false, 1]);
});

test('daily places: equal score, games and firsts share a place', () => {
  const rows = [
    { handle: 'a', qualified: true, score: 80, counted: 5, firsts: 2 },
    { handle: 'b', qualified: true, score: 80, counted: 5, firsts: 2 },
    { handle: 'c', qualified: true, score: 70, counted: 4, firsts: 1 },
    { handle: 'd', qualified: false, score: null, counted: 2, firsts: 0 },
  ];
  assert.deepEqual(S.placeDaily(rows).map((x) => x.row.handle + x.place), ['a1', 'b1', 'c3']);
});

test('week score: best 5 ranked days, needs 3 ranked days', () => {
  // Two players, 4 games each, every day; "a" wins every game on days 1-6, loses on day 7.
  const scores = [];
  ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'].forEach((day, i) => {
    ['krillion', 'perceptle', 'chainle', 'maptap'].forEach((g) => {
      scores.push(sc('a', day, g, i < 6 ? 10 : 1));
      scores.push(sc('b', day, g, i < 6 ? 1 : 10));
    });
  });
  scores.push(...['krillion', 'perceptle', 'chainle', 'maptap'].flatMap((g) => [sc('c', '2026-11-09', g, 5), sc('c', '2026-11-10', g, 5)]));
  const w = S.periodScores(scores, S.period('week', '2026-11-15'));
  const get = (h) => w.find((r) => r.handle === h);
  assert.deepEqual([get('a').score, get('a').rankedDays, get('a').wins], [100, 7, 6], 'best 5 of 7 days are all 100');
  assert.equal(get('b').qualified, true);
  assert.deepEqual([get('c').qualified, get('c').needs], [false, 1]);
  assert.equal(w[0].handle, 'a');
});

test('the weekly minimum grows with the days so far: 1 on Monday, 3 from Wednesday', () => {
  assert.equal(S.minDaysFor(S.period('week', '2026-11-16')), 1); // Monday
  assert.equal(S.minDaysFor(S.period('week', '2026-11-17')), 2); // Tuesday
  assert.equal(S.minDaysFor(S.period('week', '2026-11-19')), 3); // Thursday
  assert.equal(S.minDaysFor(S.period('month', '2026-11-03')), 3);
  assert.equal(S.minDaysFor(S.period('month', '2026-11-20')), 8);
  assert.equal(S.minDaysFor(S.period('all', '2026-11-20')), 5);
});

test('awards: champion by week score, crowns, streak', () => {
  const scores = [];
  ['2026-11-12', '2026-11-13', '2026-11-14'].forEach((day) => {
    ['krillion', 'perceptle', 'chainle', 'maptap'].forEach((g) => { scores.push(sc('a', day, g, 10)); scores.push(sc('b', day, g, 5)); });
  });
  const aw = S.awards(scores, S.period('week', '2026-11-14'), '2026-11-14');
  const champ = aw.find((x) => x.title === 'Champion');
  assert.deepEqual([champ.who, champ.note], [['a'], 'daily score 100']);
  assert.deepEqual(aw.find((x) => x.title === 'Day winner').who, ['a']);
  assert.equal(aw.find((x) => x.title === 'On fire').note, '3-day streak');
  assert.deepEqual(aw.find((x) => x.title === 'On fire').who.sort(), ['a', 'b']);
});

test('periods: week starts Monday and compares with last week', () => {
  assert.deepEqual(S.period('week', '2026-11-14'), { kind: 'week', from: '2026-11-09', to: '2026-11-14', prevFrom: '2026-11-02', prevTo: '2026-11-08', title: 'This week' });
  const m = S.period('month', '2026-11-14');
  assert.deepEqual([m.from, m.prevFrom, m.prevTo], ['2026-11-01', '2026-10-01', '2026-10-31']);
});
