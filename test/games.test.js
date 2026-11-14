// Share-text readers, checked against real pastes from the group and against
// the share templates in each game's own code.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readShares, cleanText } = require('../site/js/games.js');

const one = (text) => {
  const r = readShares(text);
  assert.equal(r.length, 1, 'expected exactly one result from:\n' + text);
  return r[0];
};

test('Krillion: score line, catch row, chat text after it', () => {
  const r = one('Krillion #122 🦐\n440\n\n🦑🦑🐟🏮🦑🦑🏮\n\nCrazy hogya ye tohhhh');
  assert.deepEqual([r.game, r.value, r.label, r.puzzle, r.detail.grid], ['krillion', 440, '440', 122, '🦑🦑🐟🏮🦑🦑🏮']);
  assert.equal(one('Krillion #99 🦐\n1,140').value, 1140);
  assert.equal(one('Krillion #99 🦐\n140').detail.grid, undefined);
});

test('Perceptle: grade, average and the five rounds, including S and Friday emoji', () => {
  const r = one('Perceptle #120 - A (91)\n🔢 95  🎯 85  📐 95  🥁 85  ✂️ 96\nhttps://perceptle.com');
  assert.deepEqual([r.value, r.label, r.puzzle], [91, 'A (91)', 120]);
  assert.deepEqual(r.detail.rounds.map((x) => x.key + x.value), ['🔢95', '🎯85', '📐95', '🥁85', '✂️96']);
  assert.equal(one('Perceptle #121 🃏 - S (97)\n🔢 99  🎯 95  📐 98  🥁 96  ✂️ 97').label, 'S (97)');
  assert.equal(one('Perceptle #98 – F (31)\n🔢 99  🎯 0  📐 1  🥁 27  ✂️ 26').value, 31);
});

test('Chainle: points, "Beat N%" line, squares; Unlimited is ignored', () => {
  const r = one("Chainle #87 · 4,158 🔗\nBeat 98% of players\n🟨🟨🟩🟧🟨\nhttps://chainle.io\n\n✨🕺🏻 We're so back");
  assert.deepEqual([r.value, r.label, r.puzzle, r.detail.grid, r.detail.extra], [4158, '4,158', 87, '🟨🟨🟩🟧🟨', 'Beat 98% of players']);
  assert.equal(one('Chainle #88 · 980 🔗\n🟥🟧🟥🟨🟥\nhttps://chainle.io').detail.extra, undefined);
  assert.equal(readShares('Chainle Unlimited · 3,100 🔗\n🟩🟩🟨🟩🟧').length, 0);
});

test('Worldle: streak line before the grid, misses count as 7', () => {
  const win = one('#Worldle #1757 (13.11.2026) 5/6 (100%)\n🔥 Current Win Streak: 1 days\n🟩🟩🟩🟨⬜↘️\n🟩🟩🟩🟩⬜⬇️\n🟩🟩🟩🟩⬜⬇️\n🟩🟩🟩🟩🟨➡️\n🟩🟩🟩🟩🟩🎉\n\nhttps://worldle.teuteuf.fr/share');
  assert.deepEqual([win.value, win.label, win.puzzle], [5, '5/6', 1757]);
  assert.equal(win.detail.grid.split('\n').length, 5);
  const miss = one('#Worldle #1758 (14.11.2026) X/6 (98%)\n🔥 Current Win Streak: 0 days\n🟩🟩🟩🟨⬜↖️\n🟩🟩🟩🟩🟨⬅️\n🟩🟩🟩🟩🟨➡️\n🟩🟩🟩🟩🟨↖️\n🟩🟩🟩🟩🟨↘️\n🟩🟩🟩🟩🟨⬇️\n\nhttps://worldle.teuteuf.fr/share');
  assert.deepEqual([miss.value, miss.label, miss.detail.extra], [7, 'X/6', 'Closest 98%']);
  assert.equal(miss.detail.grid.split('\n').length, 6);
  assert.equal(one('#Worldle #1759 (15.11.2026) 😛/6 (90%) 🛟\n🟩🟩🟨⬛⬛↖️').value, 7);
});

test('Wordle: with or without the thousands comma, hard mode, misses', () => {
  const r = one('Wordle 1,974 4/6\n\n⬛🟨🟨⬛⬛\n⬛⬛⬛⬛⬛\n⬛⬛⬛🟨🟨\n🟩🟩🟩🟩🟩');
  assert.deepEqual([r.value, r.label, r.puzzle], [4, '4/6', 1974]);
  assert.equal(r.detail.grid.split('\n').length, 4);
  assert.equal(one('Wordle 1974 4/6\n\n🟨🟨⬛⬛⬛\n🟩🟩🟩🟩🟩').puzzle, 1974);
  const hard = one('Wordle 1,975 X/6*\n\n⬜⬜⬜⬜⬜\n🟨⬜⬜⬜⬜');
  assert.deepEqual([hard.value, hard.label, hard.detail.extra], [7, 'X/6*', 'Hard mode']);
});

test('MapTap: link, bare "MapTap" header, flag-first rounds, antipode', () => {
  const r = one('www.maptap.gg November 14\n62😟 66😐 0🪿 31😥 37😥\nFinal score: 332');
  assert.deepEqual([r.value, r.detail.date], [332, 'November 14']);
  assert.deepEqual(r.detail.rounds.map((x) => x.value), [62, 66, 0, 31, 37]);
  assert.equal(one('MapTap July 9\n80🎯 74😂 100🎯 68🤨 80🤗\nFinal score: 798').value, 798);
  assert.deepEqual(one('https://maptap.gg November 15\n🇮🇳91 🇫🇷88 🇧🇷70 🇯🇵95 🇨🇦60\nFinal score: 812 Antipode!\n🔥 4 day streak').detail.rounds.map((x) => x.value), [91, 88, 70, 95, 60]);
  assert.equal(readShares('maptap.gg Penguins 4\n1 2 3\nFinal score: 6').length, 0, 'not a month: a player map');
});

test('Globle: with and without the "Globle Stats" title line', () => {
  const r = one('🌎 Nov 14, 2026 🌍\n🔥 2 | Avg. Guesses: 7.13\n🟨🟥🟨🟨🟥🟥🟩 = 7\n\nhttps://globle-game.com\n#globle');
  assert.deepEqual([r.value, r.detail.grid, r.detail.date], [7, '🟨🟥🟨🟨🟥🟥🟩', 'Nov 14, 2026']);
  assert.equal(one('Globle Stats\n🌎 Nov 14, 2026 🌍\n🔥 1 | Avg. Guesses: 5\n🟥🟧🟧🟧🟩 = 5').value, 5);
  assert.equal(one('🌎 Nov 14, 2026 🌍\n🔥 12 | Avg. Guesses: 9.41\n🟩 = 1').value, 1);
});

test('all seven games from one paste, in board order, first of each game only', () => {
  const all = readShares([
    'Wordle 1,974 2/6', '', '⬛🟨⬛⬛⬛', '🟩🟩🟩🟩🟩',
    'Krillion #122 🦐', '305', '', '🦑🫧🐟🐟🐟🦑🏮',
    'Perceptle #120 - B (80)', '🔢 99  🎯 86  📐 93  🥁 26  ✂️ 98',
    'Chainle #87 · 2,646 🔗', 'Beat 29% of players', '🟨🟧🟥🟧🟨',
    '#Worldle #1758 (14.11.2026) 1/6 (100%)', '🔥 Current Win Streak: 1 days', '🟩🟩🟩🟩🟩🎉',
    'www.maptap.gg November 14', '93🏆 95🏅 94🏅 91👑 92🏆', 'Final score: 925',
    '🌎 Nov 14, 2026 🌍', '🔥 1 | Avg. Guesses: 6', '🟧🟩 = 2',
    'Wordle 1,974 5/6',
  ].join('\n'));
  assert.deepEqual(all.map((r) => r.game), ['krillion', 'perceptle', 'chainle', 'worldle', 'wordle', 'maptap', 'globle']);
  assert.equal(all.find((r) => r.game === 'wordle').value, 2);
});

test('WhatsApp chat copies: iOS and Android prefixes are removed', () => {
  assert.equal(cleanText('[14/11/26, 4:44 PM] Neha Rao: Wordle 1,974 3/6'), 'Wordle 1,974 3/6');
  assert.equal(cleanText('14/11/26, 4:44 pm - Neha Rao: Wordle 1,974 3/6'), 'Wordle 1,974 3/6');
  assert.equal(one('[14/11/26, 4:44 PM] Neha: Krillion #122 🦐\n[14/11/26, 4:44 PM] Neha: 275').value, 275);
});

test('text with no game in it gives nothing', () => {
  assert.deepEqual(readShares('good morning everyone'), []);
  assert.deepEqual(readShares(''), []);
});
