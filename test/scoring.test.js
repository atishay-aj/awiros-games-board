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

test('awards: champion, crowns, streak and ties listed together', () => {
  const scores = [
    sc('a', '2026-11-12', 'krillion', 300), sc('b', '2026-11-12', 'krillion', 100),
    sc('a', '2026-11-13', 'krillion', 100), sc('b', '2026-11-13', 'krillion', 300),
    sc('a', '2026-11-14', 'wordle', 3), sc('b', '2026-11-14', 'wordle', 3),
  ];
  const aw = S.awards(scores, S.period('week', '2026-11-14'), '2026-11-14');
  const champ = aw.find((x) => x.title === 'Champion');
  assert.deepEqual(champ.who.sort(), ['a', 'b']);
  assert.equal(aw.find((x) => x.title === 'On fire').note, '3-day streak');
});

test('periods: week starts Monday and compares with last week', () => {
  assert.deepEqual(S.period('week', '2026-11-14'), { kind: 'week', from: '2026-11-09', to: '2026-11-14', prevFrom: '2026-11-02', prevTo: '2026-11-08', title: 'This week' });
  const m = S.period('month', '2026-11-14');
  assert.deepEqual([m.from, m.prevFrom, m.prevTo], ['2026-11-01', '2026-10-01', '2026-10-31']);
});
