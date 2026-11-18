/* Awiros Games: the page. Depends on Games, Scoring, UI and supabase-js. */
(function () {
  'use strict';
  var h = UI.h, $ = UI.byId, G = Games, S = Scoring;

  var CONFIG = window.AWG_CONFIG || {};
  var API = String(CONFIG.api || '').replace(/\/+$/, '');
  var auth = window.supabase && CONFIG.supabaseUrl && CONFIG.supabaseAnonKey
    ? window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey).auth : null;
  var SITE = location.origin + location.pathname;
  var FIRST_LOAD_DAYS = 62; // enough for this month and last month's comparison

  function today() { return S.dayOf(new Date()); }

  var state = {
    me: null, email: '', profiles: [], byHandle: {}, scores: [], idx: {},
    since: null, everything: false, busy: null,
    view: 'today', day: today(), game: G.ORDER[0], player: 'me', period: 'week',
    openDay: null, confirmRemove: null, versus: null, parsed: [], shownDays: 14
  };

  // ---------------------------------------------------------------- API
  function token() {
    if (!auth) return Promise.resolve('');
    return auth.getSession().then(function (r) { return r.data.session ? r.data.session.access_token : ''; });
  }
  function call(route, body, query) {
    var url = API + '/' + route + (query ? '?' + new URLSearchParams(query) : '');
    return token().then(function (t) {
      var headers = { 'Content-Type': 'application/json' };
      if (t) headers.Authorization = 'Bearer ' + t;
      return fetch(url, { method: body ? 'POST' : 'GET', headers: headers, body: body ? JSON.stringify(body) : undefined });
    }).then(function (res) {
      return res.text().then(function (txt) {
        var data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) { /* not JSON */ }
        if (!res.ok) { var err = new Error((data && data.error) || 'The board did not answer (' + res.status + ').'); err.status = res.status; throw err; }
        return data;
      });
    });
  }

  // ---------------------------------------------------------------- data
  function setData(data, since) {
    state.profiles = data.profiles || [];
    state.byHandle = {};
    state.profiles.forEach(function (p) { state.byHandle[p.handle] = p; });
    state.scores = (data.scores || []).filter(function (s) { return s.handle; });
    state.idx = S.indexScores(state.scores);
    state.since = since; state.everything = !since;
  }
  function load(opts) {
    if (!state.me) return Promise.resolve();
    if (state.busy) return state.busy;
    var since = opts && opts.all || state.everything ? '' : (state.since || S.shift(today(), -FIRST_LOAD_DAYS));
    state.busy = call('board', null, since ? { since: since } : null).then(function (data) {
      setData(data, since || null); hideNotice(); render();
    }).catch(function (e) {
      if (e.status === 401 || e.status === 403) return checkAccess();
      showNotice('Could not load the board. ' + e.message);
    }).then(function () { state.busy = null; });
    return state.busy;
  }
  function needEverything() { if (!state.everything && !state.busy) load({ all: true }); }
  function nameOf(handle) { var p = state.byHandle[handle]; return p ? p.name : handle; }
  function isMe(handle) { return !!state.me && state.me.handle === handle; }
  function rank(day, game) { return S.rankGame(state.idx[day + '|' + game], game); }
  function scoresOn(day) { return state.scores.filter(function (s) { return s.day === day; }); }

  // ---------------------------------------------------------------- notices
  function showNotice(text) {
    var n = UI.clear($('notice'));
    n.appendChild(h('span', text));
    n.appendChild(h('button.btn.btn-sm', { type: 'button', onclick: function () { checkAccess(); } }, 'Try again'));
    n.hidden = false;
  }
  function hideNotice() { $('notice').hidden = true; }

  // ---------------------------------------------------------------- sign-in door
  function lock(mode, info) {
    document.body.classList.add('locked');
    $('door').hidden = false;
    $('googleSignIn').hidden = mode !== 'signin';
    $('joinForm').hidden = mode !== 'join';
    $('doorAccount').hidden = mode === 'signin';
    $('doorTitle').textContent = mode === 'signin' ? 'Sign in to the board' : 'Join the board';
    $('doorText').textContent = mode === 'signin'
      ? 'The scores are only visible to players who joined.'
      : 'Enter the invite code from the WhatsApp group. You only need to do this once.';
    $('doorEmail').textContent = state.email || 'your Google account';
    if (mode === 'join' && !$('joinName').value && info && info.suggestedName) $('joinName').value = info.suggestedName;
  }
  function unlock() { document.body.classList.remove('locked'); $('door').hidden = true; }

  function checkAccess() {
    if (!auth || !API) { showNotice('Sign-in is not set up: config.js needs api, supabaseUrl and supabaseAnonKey.'); return Promise.resolve(); }
    return auth.getSession().then(function (r) {
      var session = r.data.session;
      if (!session) { state.me = null; lock('signin'); return; }
      state.email = session.user.email || '';
      return call('me').then(function (info) {
        if (!info.profile) { state.me = null; lock('join', info); return; }
        state.me = info.profile;
        unlock(); render();
        return load().then(offerInstall);
      });
    }).catch(function (e) { showNotice('Could not reach the board. ' + e.message); });
  }

  $('googleSignIn').addEventListener('click', function () {
    $('googleSignIn').disabled = true;
    auth.signInWithOAuth({ provider: 'google', options: { redirectTo: SITE } }).then(function (r) {
      if (r.error) throw r.error;
    }).catch(function (e) { $('googleSignIn').disabled = false; showNotice('Google sign-in did not start: ' + e.message); });
  });
  $('joinForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    $('joinGo').disabled = true; $('joinMsg').textContent = 'Joining…';
    call('join', { name: $('joinName').value, code: $('joinCode').value }).then(function (profile) {
      state.me = profile; $('joinCode').value = ''; $('joinMsg').textContent = '';
      unlock(); UI.toast('Welcome to the board, ' + profile.name + '!');
      return load();
    }).catch(function (e) { $('joinMsg').textContent = e.message; }).then(function () { $('joinGo').disabled = false; });
  });
  function signOut() {
    auth.signOut().finally(function () {
      state.me = null; state.scores = []; state.profiles = []; state.idx = {}; state.since = null; state.everything = false;
      $('joinName').value = ''; location.hash = 'today'; checkAccess();
    });
  }
  $('doorSwitch').addEventListener('click', signOut);
  $('signOut').addEventListener('click', signOut);

  // ---------------------------------------------------------------- routing
  // #today · #games · #<game> · #standings · #me · #p/<handle>
  function route() {
    var hash = decodeURIComponent(location.hash.slice(1));
    var signingIn = /access_token=|error_description=/.test(hash);
    if (signingIn) hash = UI.storeGet('page') || 'today'; // back from Google: show the last page
    if (hash === 'standings') show('standings');
    else if (hash === 'games') show('game');
    else if (G.BY_ID[hash]) { state.game = hash; show('game'); }
    else if (hash === 'me') { state.player = 'me'; show('player'); }
    else if (hash.indexOf('p/') === 0) { state.player = hash.slice(2); show('player'); }
    else show('today');
    if (hash && !signingIn && !/^p\//.test(hash)) UI.storeSet('page', hash);
  }
  function go(hash) { if (location.hash === '#' + hash) route(); else location.hash = hash; }
  function openPlayer(handle) { go(isMe(handle) ? 'me' : 'p/' + handle); }
  var PAGES = { today: 'pageToday', game: 'pageGame', standings: 'pageStandings', player: 'pagePlayer' };
  function show(view) {
    var changed = state.view !== view;
    state.view = view;
    Object.keys(PAGES).forEach(function (k) { $(PAGES[k]).hidden = k !== view; });
    var tab = view === 'game' ? 'games' : view === 'player' ? (state.player === 'me' ? 'me' : '') : view;
    Array.prototype.forEach.call($('tabbar').children, function (a) {
      if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    $('tabbar').querySelector('[data-tab="games"]').setAttribute('href', '#' + state.game);
    if (changed) window.scrollTo(0, 0);
    render();
  }
  window.addEventListener('hashchange', route);
  $('meChip').addEventListener('click', function () { go('me'); });

  function render() {
    renderMeChip();
    if (!state.me) return;
    if (state.view === 'today') renderToday();
    else if (state.view === 'game') renderGame();
    else if (state.view === 'standings') renderStandings();
    else renderPlayer();
  }
  function renderMeChip() {
    var chip = UI.clear($('meChip'));
    chip.hidden = !state.me;
    if (state.me) { chip.appendChild(UI.avatar(state.me.handle, state.me.name, 26)); chip.appendChild(h('span', state.me.name)); }
  }

  // Avatar + name, opening the profile.
  function who(handle, size) {
    return h('button.who', { type: 'button', onclick: function (e) { e.stopPropagation(); openPlayer(handle); } },
      UI.avatar(handle, nameOf(handle), size || 24), h('span', nameOf(handle)));
  }

  // ---------------------------------------------------------------- shared pieces
  // Scores out of 100, shown as whole numbers.
  function fmt(score) { return score == null ? '–' : String(Math.round(score)); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  // Top three of an already-placed list: [{ row: { handle, score }, place }]
  function podium(placed, emptyText) {
    if (!placed.length) return h('p.muted.small', emptyText);
    var top = placed.slice(0, 3);
    var order = top.length > 1 ? [top[1], top[0], top[2]] : [top[0]];
    var cls = ['first', 'second', 'third'];
    return h('div.podium', order.filter(Boolean).map(function (x) {
      var p = Math.min(x.place, 3);
      return h('button.step.' + cls[p - 1] + (isMe(x.row.handle) ? '.mine' : ''), {
        type: 'button', onclick: function () { openPlayer(x.row.handle); },
        'aria-label': UI.nth(x.place) + ', ' + nameOf(x.row.handle) + ', score ' + fmt(x.row.score)
      },
        h('span.medal', ['🥇', '🥈', '🥉'][p - 1]),
        UI.avatar(x.row.handle, nameOf(x.row.handle), p === 1 ? 54 : 42),
        h('span.s-name', nameOf(x.row.handle)),
        h('span.s-pts.num', fmt(x.row.score)),
        h('span.s-block', String(x.place)));
    }));
  }

  // Side-by-side detail for one game on one day.
  function compareBlock(game, ranked) {
    var withRounds = ranked.filter(function (r) { return r.score.detail && r.score.detail.rounds; });
    var withGrid = ranked.filter(function (r) { return r.score.detail && r.score.detail.grid; });
    if (withRounds.length) {
      var keys = [];
      withRounds.forEach(function (r) { r.score.detail.rounds.forEach(function (x) { if (keys.indexOf(x.key) < 0) keys.push(x.key); }); });
      var best = {};
      keys.forEach(function (k) {
        var vals = withRounds.map(function (r) { var x = r.score.detail.rounds.find(function (y) { return y.key === k; }); return x ? x.value : null; }).filter(function (v) { return v != null; });
        best[k] = vals.length > 1 ? Math.max.apply(null, vals) : null;
      });
      return h('div.compare', h('div.cap', 'Round by round'), h('div.scroll-x', h('table.round-table',
        h('thead', h('tr', h('th', ''), keys.map(function (k) { return h('th', /^\d+$/.test(k) ? 'R' + k : k); }))),
        h('tbody', withRounds.map(function (r) {
          return h('tr', h('td', nameOf(r.score.handle)), keys.map(function (k) {
            var x = r.score.detail.rounds.find(function (y) { return y.key === k; });
            return h('td' + (x && x.value === best[k] ? '.top' : ''), x ? String(x.value) : '–');
          }));
        })))));
    }
    if (!withGrid.length) return null;
    if (game === 'wordle') {
      return h('div.compare', h('div.cap', 'Guesses'), h('div.mini-grids', withGrid.map(function (r) {
        var tiles = h('div.tiles');
        r.score.detail.grid.split('\n').forEach(function (row) {
          Array.from(row).forEach(function (ch) {
            tiles.appendChild(h('i' + (ch === '🟩' || ch === '🟧' ? '.hit' : ch === '🟨' || ch === '🟦' ? '.near' : '')));
          });
        });
        return h('div.mini-grid', tiles, h('span', nameOf(r.score.handle) + ' · ' + r.score.label));
      })));
    }
    var caption = { krillion: 'Catches', chainle: 'Rounds', worldle: 'Guesses', globle: 'Guesses' }[game] || 'Shared';
    return h('div.compare', h('div.cap', caption), h('div.pic-rows', withGrid.map(function (r) {
      return [h('span.n', nameOf(r.score.handle)), h('span.p', r.score.detail.grid)];
    })));
  }

  function gameCard(game, day) {
    var ranked = rank(day, game);
    var g = G.BY_ID[game];
    var puzzle = ranked[0].score.puzzle ? '#' + ranked[0].score.puzzle + ' · ' : '';
    var list = h('ol.rank-list');
    ranked.forEach(function (r) {
      var s = r.score, mine = isMe(s.handle);
      var removeBtn = mine ? h('button.icon-btn', { type: 'button', 'aria-label': 'Remove my ' + g.name + ' score',
        onclick: function () { state.confirmRemove = state.confirmRemove === s.id ? null : s.id; renderToday(); } }, '✕') : h('span');
      var li = h('li' + (mine ? '.mine' : ''),
        h('span.place' + (r.crown ? '.gold' : ''), r.crown ? '👑' : String(r.place)),
        h('span.who-cell', who(s.handle, 24), s.detail && s.detail.extra ? h('span.extra-note', s.detail.extra) : null),
        h('span.val.num', s.label),
        removeBtn);
      if (mine && state.confirmRemove === s.id) {
        li.appendChild(h('div.confirm', h('span', 'Remove this score?'),
          h('button.btn.btn-danger.btn-sm', { type: 'button', onclick: function () {
            call('scores/remove', { id: s.id }).then(function () { state.confirmRemove = null; UI.toast('Removed'); return load(); })
              .catch(function (e) { UI.toast(e.message); });
          } }, 'Remove'),
          h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: function () { state.confirmRemove = null; renderToday(); } }, 'Keep')));
      }
      list.appendChild(li);
    });
    return h('section.panel.game-card',
      h('header', h('h3', h('span', g.icon), h('a', { href: g.url, target: '_blank', rel: 'noopener', title: 'Play ' + g.name }, g.name)),
        h('span.muted.small', puzzle + ranked.length + ' posted')),
      list, compareBlock(game, ranked));
  }

  // ---------------------------------------------------------------- today
  function renderToday() {
    var now = today(), day = state.day;
    $('dayTitle').textContent = UI.longDay(day);
    $('dayHint').textContent = day === now ? 'Today' : day === S.shift(now, -1) ? 'Yesterday' : '';
    $('dayNext').disabled = day >= now;
    $('postDay').max = now;
    renderChecklist();
    renderDayPodium();
    var box = UI.clear($('dayGames')), count = 0, missing = [];
    G.ORDER.forEach(function (game) {
      if (!state.idx[day + '|' + game]) { missing.push(game); return; }
      count += state.idx[day + '|' + game].length;
      box.appendChild(gameCard(game, day));
    });
    if (missing.length && missing.length < G.ORDER.length) {
      box.appendChild(h('section.panel.not-yet', h('span', 'No scores yet for'), missing.map(function (id) {
        var g = G.BY_ID[id]; return h('a', { href: g.url, target: '_blank', rel: 'noopener' }, g.icon + ' ' + g.name);
      })));
    }
    $('dayFoot').textContent = count ? count + (count === 1 ? ' score' : ' scores') + ' on this day' : 'Nobody has posted for this day yet. Be the first!';
  }

  function renderChecklist() {
    var box = UI.clear($('checklist'));
    box.hidden = false;
    var done = 0;
    var grid = h('div.check-grid', G.LIST.map(function (g) {
      var ranked = rank(state.day, g.id);
      var mine = ranked.find(function (r) { return isMe(r.score.handle); });
      if (mine) {
        done++;
        var sub = ranked.length < 2 ? 'waiting for others' : mine.crown ? '👑 1st of ' + ranked.length : UI.nth(mine.place) + ' of ' + ranked.length;
        return h('div.check-tile.' + (mine.crown ? 'top' : 'done'), h('span.t-game', g.icon + ' ' + g.name), h('span.t-main.num', mine.score.label), h('span.t-sub', sub));
      }
      return h('a.check-tile.todo', { href: g.url, target: '_blank', rel: 'noopener', 'aria-label': 'Play ' + g.name },
        h('span.t-game', g.icon + ' ' + g.name), h('span.t-main', 'Play ↗'), h('span.t-sub', ranked.length ? ranked.length + ' played' : ''));
    }));
    var total = G.LIST.length;
    box.appendChild(h('div.check-head', h('h2', state.day === today() ? 'Your day' : 'Your ' + UI.shortDay(state.day)),
      h('span.muted.small', done === total ? 'All ' + total + ' done 🎉' : done + ' of ' + total + ' played')));
    box.appendChild(h('div.progress', h('i', { style: { width: (done / total * 100) + '%' } })));
    box.appendChild(h('p.score-line', myDayStatus()));
    box.appendChild(grid);
  }

  // One line about your daily score: ranked, or what is still missing.
  function myDayStatus() {
    var daily = S.dailyScores(state.scores, state.day);
    var me = daily.find(function (r) { return isMe(r.handle); });
    var need = S.GAMES_COUNTED;
    if (!me) return 'Play any ' + need + ' games to get a daily score.';
    if (me.qualified) {
      var place = S.placeDaily(daily).find(function (x) { return isMe(x.row.handle); });
      return h('span', 'Daily score ', h('b.num', fmt(me.score)), ' · ' + UI.nth(place.place) + ' of ' + S.placeDaily(daily).length +
        (me.counted > need ? ' · best ' + need + ' of ' + me.counted + ' games' : ''));
    }
    var waiting = me.played - me.counted;
    var more = Math.max(0, need - me.played);
    if (more > 0) return 'Play ' + plural(more, 'more game', 'more games') + ' to get a daily score' + (waiting ? ' (and ' + plural(waiting, 'game is', 'games are') + ' waiting for a second player).' : '.');
    return 'Waiting for a second player in ' + plural(waiting, 'game', 'games') + ' before your daily score counts.';
  }

  function renderDayPodium() {
    var box = UI.clear($('dayPodium'));
    if (!scoresOn(state.day).length) return;
    var daily = S.dailyScores(state.scores, state.day);
    var placed = S.placeDaily(daily);
    var list = h('ol.rank-list.overall');
    placed.forEach(function (x) {
      var r = x.row;
      list.appendChild(h('li' + (isMe(r.handle) ? '.mine' : ''),
        h('span.place' + (x.place === 1 ? '.gold' : ''), String(x.place)),
        h('span.who-cell', who(r.handle, 24), h('span.extra-note', r.counted > S.GAMES_COUNTED ? 'best ' + S.GAMES_COUNTED + ' of ' + r.counted + ' games' : r.counted + ' games')),
        h('span.val.num', fmt(r.score)), h('span')));
    });
    daily.filter(function (r) { return !r.qualified; }).forEach(function (r) {
      var more = Math.max(0, S.GAMES_COUNTED - r.played);
      list.appendChild(h('li.unranked' + (isMe(r.handle) ? '.mine' : ''), h('span.place', '–'),
        h('span.who-cell', who(r.handle, 24), h('span.extra-note', more ? 'needs ' + plural(more, 'more game', 'more games') : 'waiting for others')),
        h('span.val.muted', '–'), h('span')));
    });
    box.appendChild(h('section.panel',
      h('div.panel-head', h('h2', state.day === today() ? 'Today’s ranking' : 'Day ranking'), UI.shareButton('Share', function () { return dayText(state.day); })),
      podium(placed, 'Nobody has a daily score yet: it needs ' + S.GAMES_COUNTED + ' games that someone else also played.'),
      daily.length ? list : null));
  }

  $('dayBack').addEventListener('click', function () {
    state.day = S.shift(state.day, -1);
    if (!state.everything && state.since && state.day < state.since) needEverything();
    renderToday();
  });
  $('dayNext').addEventListener('click', function () { if (state.day < today()) { state.day = S.shift(state.day, 1); renderToday(); } });
  $('postDay').addEventListener('input', showParsed);

  // ---- posting ----
  // Each score is filed under the day its puzzle number (or printed date) belongs to,
  // whatever day the board is showing. The date box is only for a score that has neither.
  function relDay(day) {
    var now = today();
    return day === now ? 'today' : day === S.shift(now, -1) ? 'yesterday' : UI.longDay(day);
  }
  function showParsed() {
    var text = $('pasteBox').value, now = today();
    var box = UI.clear($('pasteSeen'));
    var undated = false;
    state.parsed = [];
    G.readShares(text).forEach(function (r) {
      var g = G.BY_ID[r.game];
      var day = G.dayFor(r, now);
      if (!day) { undated = true; day = $('postDay').value || now; }
      var name = g.icon + ' ' + g.name + (r.puzzle ? ' #' + r.puzzle : '') + ' ' + r.label;
      if (day > G.addDays(now, 1)) { box.appendChild(h('span.chip.bad', name + ': that puzzle is not out yet, so it was skipped')); return; }
      var saved = state.scores.find(function (s) { return isMe(s.handle) && s.game === r.game && s.day === day; });
      r.day = day;
      state.parsed.push(r);
      var note = saved && saved.value === r.value ? ' · already on the board' : saved ? ' · replaces your ' + saved.label : '';
      box.appendChild(h('span.chip' + (day === now ? '' : '.warn'), name + ' → ' + relDay(day) + note));
    });
    if (text.trim() && !state.parsed.length && !box.children.length) box.appendChild(h('span.chip.bad', 'No game score found in this text'));
    $('postDayWrap').hidden = !undated;
    $('postSave').disabled = !state.parsed.length;
    $('pasteClear').hidden = !text.trim();
  }
  $('pasteBox').addEventListener('input', showParsed);
  $('pasteClear').addEventListener('click', function () { $('pasteBox').value = ''; showParsed(); });
  $('fromClipboard').addEventListener('click', function () {
    var box = $('pasteBox');
    if (!navigator.clipboard || !navigator.clipboard.readText) { box.focus(); UI.toast('Long-press the box and tap Paste'); return; }
    navigator.clipboard.readText().then(function (text) {
      if (!text.trim()) { UI.toast('Your clipboard is empty. Tap Share in the game first.'); return; }
      box.value = box.value.trim() ? box.value.replace(/\s+$/, '') + '\n' + text : text;
      showParsed();
      if (!state.parsed.length) UI.toast('No game score in the clipboard');
    }).catch(function () { box.focus(); UI.toast('Allow clipboard access, or long-press the box and tap Paste'); });
  });
  $('postSave').addEventListener('click', function () {
    if (!state.parsed.length) return;
    var entries = state.parsed.map(function (r) { return { day: r.day, game: r.game, value: r.value, label: r.label, puzzle: r.puzzle, detail: r.detail }; });
    var days = entries.map(function (e) { return e.day; }).filter(function (d, i, a) { return a.indexOf(d) === i; });
    var btn = $('postSave'); btn.disabled = true; btn.textContent = 'Saving…';
    call('scores', { day: days[0], entries: entries, pasted: G.cleanText($('pasteBox').value).slice(0, 4000) }).then(function () {
      $('pasteBox').value = ''; $('postDay').value = '';
      state.day = days.length === 1 ? days[0] : today();
      return load().then(function () {
        days.forEach(function (d, i) {
          var games = entries.filter(function (e) { return e.day === d; }).map(function (e) { return e.game; });
          if (i === 0) celebrate(d, games);
        });
        if (days.length > 1 || days[0] !== today()) UI.toast('Saved for ' + days.map(relDay).join(' and ') + ' ✓', 3600);
      });
    }).catch(function (e) { UI.toast('Not saved: ' + e.message, 5000); })
      .then(function () { btn.textContent = 'Save'; showParsed(); });
  });

  function celebrate(day, games) {
    var leading = games.filter(function (g) { return rank(day, g).some(function (r) { return r.crown && isMe(r.score.handle); }); });
    var placed = S.placeDaily(S.dailyScores(state.scores, day));
    var firsts = placed.filter(function (x) { return x.place === 1; });
    var topOfDay = placed.length > 1 && firsts.length === 1 && isMe(firsts[0].row.handle);
    if (topOfDay) { UI.confetti(); UI.toast('🏆 You are leading the day with ' + fmt(firsts[0].row.score) + '!', 3600); }
    else if (leading.length) { UI.confetti(); UI.toast('👑 You lead ' + leading.map(function (g) { return G.BY_ID[g].name; }).join(' & ') + '!', 3600); }
    else UI.toast('Saved ✓');
  }

  // ---------------------------------------------------------------- one game
  function renderGame() {
    var game = state.game, g = G.BY_ID[game];
    var tabs = UI.clear($('gameTabs'));
    G.LIST.forEach(function (x) {
      var b = h('button', { type: 'button', role: 'tab', 'aria-selected': x.id === game ? 'true' : 'false', onclick: function () { state.shownDays = 14; state.openDay = null; go(x.id); } }, h('span', x.icon), h('span', x.name));
      tabs.appendChild(b);
      if (x.id === game) requestAnimationFrame(function () { b.scrollIntoView({ inline: 'center', block: 'nearest' }); });
    });
    $('gameName').textContent = g.icon + ' ' + g.name;
    $('gameRule').textContent = g.better === 'low' ? 'Fewer guesses win' : 'Higher score wins';

    var mine = state.scores.filter(function (s) { return s.game === game; });
    var handles = Object.keys(mine.reduce(function (o, s) { o[s.handle] = 1; return o; }, {}));
    var cards = handles.map(function (hd) { return { handle: hd, st: S.gameStats(state.scores, hd, game) }; })
      .sort(function (a, b) { return b.st.wins - a.st.wins || G.compare(game, a.st.average, b.st.average); });
    var leaders = UI.clear($('gameLeaders'));
    cards.forEach(function (c) {
      var avg = g.better === 'low' ? c.st.average.toFixed(2) : Math.round(c.st.average).toLocaleString('en-US');
      leaders.appendChild(h('button.leader-card' + (isMe(c.handle) ? '.mine' : ''), { type: 'button', onclick: function () { openPlayer(c.handle); } },
        h('span', who(c.handle, 22)), h('span.big.num', '👑 ' + c.st.wins), h('span.sub', 'avg ' + avg + ' · best ' + c.st.best + ' · ' + c.st.played + ' played')));
    });
    if (!cards.length) leaders.appendChild(h('p.muted', 'No ' + g.name + ' scores yet. Post one on the Today tab.'));

    var days = Object.keys(mine.reduce(function (o, s) { o[s.day] = 1; return o; }, {})).sort().reverse();
    var list = UI.clear($('gameDays'));
    days.slice(0, state.shownDays).forEach(function (day) {
      var ranked = rank(day, game), open = state.openDay === day;
      var line = h('span.line', ranked.slice(0, 4).map(function (r) {
        return h('span' + (r.crown ? '.gold' : ''), (r.crown ? '👑 ' : '') + nameOf(r.score.handle) + ' ' + r.score.label);
      }), ranked.length > 4 ? h('span.muted', '+' + (ranked.length - 4)) : null);
      var row = h('section.panel.day-row' + (open ? '.open' : ''),
        h('button', { type: 'button', 'aria-expanded': open ? 'true' : 'false', onclick: function () { state.openDay = open ? null : day; renderGame(); } },
          h('span.d', h('b', UI.shortDay(day)), h('span', UI.weekday(day))), line, h('span.chev', '›')));
      if (open) {
        var card = gameCard(game, day);
        Array.prototype.slice.call(card.children, 1).forEach(function (c) { row.appendChild(c); });
      }
      list.appendChild(row);
    });
    var more = days.length > state.shownDays || !state.everything;
    $('gameMore').hidden = !more || !days.length;
  }
  $('gameMore').addEventListener('click', function () { state.shownDays += 21; needEverything(); renderGame(); });

  // ---------------------------------------------------------------- standings
  function renderStandings() {
    var p = S.period(state.period, today());
    var oldest = p.prevFrom || p.from;
    if (p.kind === 'all' || (oldest && state.since && oldest < state.since)) needEverything();
    Array.prototype.forEach.call($('standPeriod').children, function (b) { b.setAttribute('aria-selected', b.dataset.period === state.period ? 'true' : 'false'); });
    $('standTitle').textContent = p.title;
    var rows = S.periodScores(state.scores, p);
    var rule = { bestDays: S.PERIOD_RULES[p.kind].bestDays, minDays: rows.minDays };
    var placed = periodPlaces(rows);
    var crowns = {};
    S.totals(state.scores, p.from, p.to).forEach(function (t) { crowns[t.handle] = t; });

    var top = UI.clear($('standPodium'));
    var panel = h('section.panel', h('div.panel-head',
      h('h2', p.kind === 'week' ? 'Champion of the week' : p.kind === 'month' ? 'Champion of the month' : 'Hall of fame'),
      rows.length ? UI.shareButton('Share', function () { return periodText(p); }) : null));
    panel.appendChild(podium(placed, rows.length ? 'Nobody has ' + plural(rule.minDays, 'ranked day', 'ranked days') + ' yet in this period.' : 'Nothing posted yet in this period.'));
    if (p.kind === 'week') {
      var champs = periodPlaces(S.periodScores(state.scores, { kind: 'week', from: p.prevFrom, to: p.prevTo })).filter(function (x) { return x.place === 1; });
      if (champs.length) panel.appendChild(h('p.muted.small', { style: { marginTop: '12px' } }, 'Last week: ' + champs.map(function (x) { return nameOf(x.row.handle); }).join(' & ') + ' won with ' + fmt(champs[0].row.score)));
    }
    top.appendChild(panel);

    var table = UI.clear($('standTable'));
    table.appendChild(h('thead', h('tr', h('th', ''), h('th.l', 'Player'), h('th', { title: 'Average of the best ' + (isFinite(rule.bestDays) ? rule.bestDays + ' ' : '') + 'daily scores' }, 'Score'),
      h('th', { title: 'Days with a daily score' }, 'Days'), h('th', { title: 'Days finished 1st overall' }, '🥇'), h('th', { title: 'Game crowns' }, '👑'),
      G.LIST.map(function (g, i) { return h('th' + (i === 0 ? '.div' : ''), { title: g.name + ' crowns' }, g.icon); }))));
    var body = h('tbody');
    if (!rows.length) body.appendChild(h('tr', h('td.l.muted', { colSpan: 6 + G.LIST.length }, 'Nothing posted in this period.')));
    var placeOf = {}; placed.forEach(function (x) { placeOf[x.row.handle] = x.place; });
    rows.forEach(function (r) {
      var c = crowns[r.handle] || { crowns: 0, crownsByGame: {} };
      var cell = h('td.l', who(r.handle, 24));
      if (!r.qualified) cell.appendChild(h('div.extra-note', 'needs ' + plural(r.needs, 'more ranked day', 'more ranked days')));
      body.appendChild(h('tr' + (isMe(r.handle) ? '.mine' : '') + (r.qualified ? '' : '.unranked'),
        h('td.pl', r.qualified ? String(placeOf[r.handle]) : '–'), cell, h('td.pts', fmt(r.score)),
        h('td', String(r.rankedDays)), h('td' + (r.wins ? '' : '.zero'), r.wins ? String(r.wins) : '·'),
        h('td' + (c.crowns ? '' : '.zero'), c.crowns ? String(c.crowns) : '·'),
        G.LIST.map(function (g, i) { var n = c.crownsByGame[g.id] || 0; return h('td' + (n ? '' : '.zero') + (i === 0 ? '.div' : ''), n ? String(n) : '·'); })));
    });
    table.appendChild(body);

    var aw = S.awards(state.scores, p, today());
    var awardsBox = UI.clear($('standAwards'));
    if (aw.length) awardsBox.appendChild(h('section.panel', h('h2', p.kind === 'all' ? 'All-time awards' : p.title + '’s awards'),
      h('div.awards', aw.map(function (a) {
        return h('button.award', { type: 'button', disabled: a.who.length !== 1, onclick: function () { openPlayer(a.who[0]); } },
          h('span.ic', a.icon), h('span.t', a.title), h('span.w', namesList(a.who)), h('span.n', a.note));
      }))));
  }
  $('standPeriod').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    state.period = b.dataset.period; UI.storeSet('period', state.period); renderStandings();
  });
  // Qualified period rows with shared places on equal scores.
  function periodPlaces(rows) { return S.placeRows(rows.filter(function (r) { return r.qualified; }), 'score'); }
  function namesList(handles) {
    var n = handles.map(nameOf);
    return n.length > 2 ? n.slice(0, 2).join(', ') + ' +' + (n.length - 2) : n.join(' & ');
  }

  // ---------------------------------------------------------------- player
  function trendLine(values, better) {
    var W = 112, H = 34, pad = 4;
    var line = UI.svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'trend', 'aria-hidden': 'true' });
    if (values.length < 2) return line;
    var lo = Math.min.apply(null, values), hi = Math.max.apply(null, values), span = hi - lo || 1;
    var pts = values.map(function (v, i) {
      var t = (v - lo) / span; if (better === 'low') t = 1 - t; // up always means better
      return [pad + i * (W - 2 * pad) / (values.length - 1), H - pad - t * (H - 2 * pad)];
    });
    line.appendChild(UI.svg('polyline', { points: pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') }));
    var end = pts[pts.length - 1];
    line.appendChild(UI.svg('circle', { cx: end[0], cy: end[1], r: 3 }));
    return line;
  }

  function versusTable(a, b) {
    var v = S.headToHead(state.scores, a, b);
    var t = v.total, n = t.a + t.b + t.tie;
    if (!n) return h('p.muted.small', 'No days yet where you both played the same game.');
    var bar = h('div.versus-bar', [[t.a, UI.colorOf(a)], [t.tie, 'var(--line)'], [t.b, UI.colorOf(b)]].map(function (x) {
      return h('i', { style: { width: (x[0] / n * 100) + '%', background: x[1] } });
    }));
    function row(label, x) {
      return h('tr', h('td', label), h('td.w' + (x.a > x.b ? '.ahead' : ''), String(x.a)), h('td', String(x.tie)), h('td.w' + (x.b > x.a ? '.ahead' : ''), String(x.b)));
    }
    return h('div', bar, h('table.versus',
      h('thead', h('tr', h('th', ''), h('th', nameOf(a)), h('th', 'Tie'), h('th', nameOf(b)))),
      h('tbody', v.games.map(function (g) { return row(G.BY_ID[g.game].icon + ' ' + G.BY_ID[g.game].name, g); }), row('Overall', t))));
  }

  function renderPlayer() {
    var handle = state.player === 'me' ? state.me.handle : state.player;
    var mine = isMe(handle);
    var body = UI.clear($('playerBody'));
    $('account').hidden = !mine;
    if (mine) {
      $('accountEmail').textContent = 'Signed in with Google as ' + (state.email || 'your account') + '.';
      if (document.activeElement !== $('renameInput')) $('renameInput').value = state.me.name;
    }
    needEverything();
    var person = state.byHandle[handle];
    if (!person) { body.appendChild(h('section.panel', h('p.muted', state.busy ? 'Loading…' : 'This player is not on the board.'))); return; }

    var now = today();
    var crownsAll = (S.totals(state.scores, null, null).find(function (r) { return r.handle === handle; }) || { crowns: 0 }).crowns;
    var allTime = S.periodScores(state.scores, S.period('all', now)).find(function (r) { return r.handle === handle; }) || { dayScores: [], wins: 0, played: 0 };
    var avgDaily = allTime.dayScores.length ? allTime.dayScores.reduce(function (a, b) { return a + b; }, 0) / allTime.dayScores.length : null;
    var wk = S.period('week', now);
    var weekRows = S.periodScores(state.scores, wk);
    var weekPlace = periodPlaces(weekRows).find(function (x) { return x.row.handle === handle; });
    var weekRow = weekRows.find(function (r) { return r.handle === handle; });
    var run = S.streak(state.scores, handle, now);
    var since = person.joinedAt ? UI.shortDay(S.dayOf(new Date(person.joinedAt))) : '';
    body.appendChild(h('section.panel',
      h('div.hero', UI.avatar(handle, person.name, 60), h('div', h('h2', person.name, mine ? h('span.tag', 'You') : null), since ? h('p.muted.small', 'On the board since ' + since) : null)),
      h('div.stats', [
        weekPlace ? [UI.nth(weekPlace.place), 'This week · ' + fmt(weekPlace.row.score)]
          : ['–', weekRow ? 'This week · needs ' + plural(weekRow.needs, 'more day', 'more days') : 'This week'],
        [fmt(avgDaily), 'Avg daily score'],
        [String(allTime.wins), 'Days won'],
        [run.current + (run.current >= 2 ? ' 🔥' : ''), 'Day streak'],
        [String(crownsAll), 'Game crowns'],
        [String(allTime.played), 'Days played']
      ].map(function (s) { return h('div.stat', h('b.num', s[0]), h('span', s[1])); }))));

    var per = h('ul.per-game');
    G.LIST.forEach(function (g) {
      var st = S.gameStats(state.scores, handle, g.id); if (!st) return;
      var avg = g.better === 'low' ? st.average.toFixed(2) : Math.round(st.average).toLocaleString('en-US');
      per.appendChild(h('li', { onclick: function () { go(g.id); } },
        h('span.g', g.icon + ' ' + g.name),
        h('span.s', 'avg ' + avg + ' · best ' + st.best + ' · ' + st.played + ' played' + (st.contested ? ' · won ' + st.wins + ' of ' + st.contested : '')),
        trendLine(st.recent, g.better)));
    });
    body.appendChild(h('section.panel', h('h3', 'By game'), per.children.length ? per : h('p.muted.small', mine ? 'Post your first score on the Today tab.' : 'No scores yet.')));

    var others = state.profiles.filter(function (p) { return p.handle !== handle; });
    if (!others.length) return;
    var box = h('section.panel', h('h3', 'Head to head'));
    if (mine) {
      if (!state.versus || !state.byHandle[state.versus] || state.versus === handle) state.versus = others[0].handle;
      var pick = h('select', { 'aria-label': 'Compare with', onchange: function (e) { state.versus = e.target.value; renderPlayer(); } },
        others.map(function (o) { return h('option', { value: o.handle, selected: o.handle === state.versus }, o.name); }));
      box.appendChild(h('div.versus-pick', h('span.muted.small', 'Compare with'), pick));
      box.appendChild(versusTable(handle, state.versus));
    } else {
      box.appendChild(h('p.muted.small', 'Days you both played the same game.'));
      box.appendChild(versusTable(state.me.handle, handle));
    }
    body.appendChild(box);
  }
  $('renameForm').addEventListener('submit', function (e) {
    e.preventDefault();
    call('profile', { name: $('renameInput').value }).then(function (p) {
      state.me = p; UI.toast('Name saved ✓'); return load();
    }).catch(function (err) { UI.toast(err.message); });
  });

  // ---------------------------------------------------------------- WhatsApp texts
  // placed: [{ row: { handle, score }, place }]
  function medalLine(placed) {
    return placed.slice(0, 3).map(function (x) {
      return ['🥇', '🥈', '🥉'][Math.min(x.place, 3) - 1] + ' ' + nameOf(x.row.handle) + ' ' + fmt(x.row.score);
    }).join(' · ');
  }
  function dayText(day) {
    var out = ['🎮 *Awiros Games* · ' + UI.longDay(day)];
    var placed = S.placeDaily(S.dailyScores(state.scores, day));
    if (placed.length) out.push(medalLine(placed));
    placed.slice(3, 10).forEach(function (x) { out.push(x.place + '. ' + nameOf(x.row.handle) + ' ' + fmt(x.row.score)); });
    out.push('');
    G.LIST.forEach(function (g) {
      var r = rank(day, g.id); if (!r.length) return;
      out.push(g.icon + ' ' + g.name + ': ' + r.map(function (x) { return nameOf(x.score.handle) + ' ' + x.score.label + (x.crown ? ' 👑' : ''); }).join(', '));
    });
    out.push('', '📊 ' + SITE);
    return out.join('\n');
  }
  function periodText(p) {
    var placed = periodPlaces(S.periodScores(state.scores, p));
    var out = ['📅 *Awiros Games* · ' + p.title + (p.from ? ' (' + UI.shortDay(p.from) + ' – ' + UI.shortDay(p.to) + ')' : '')];
    if (placed.length) out.push(medalLine(placed));
    placed.slice(3, 10).forEach(function (x) { out.push(x.place + '. ' + nameOf(x.row.handle) + ' ' + fmt(x.row.score)); });
    var aw = S.awards(state.scores, p, today());
    if (aw.length) { out.push('', '🏅 *Awards*'); aw.forEach(function (a) { out.push(a.icon + ' ' + a.title + ': ' + namesList(a.who) + ' (' + a.note + ')'); }); }
    out.push('', '📊 ' + SITE);
    return out.join('\n');
  }

  // ---------------------------------------------------------------- install tip
  var installPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installPrompt = e; offerInstall(); });
  function offerInstall() {
    var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
    if (standalone || UI.storeGet('installHidden') || !state.me) return;
    if (installPrompt) { $('installText').textContent = 'Install the board as an app for one-tap access.'; $('installGo').hidden = false; $('install').hidden = false; }
    else if (/iphone|ipad|ipod/i.test(navigator.userAgent)) { $('installText').textContent = 'Add it to your Home Screen: tap Share ⬆︎ in Safari, then “Add to Home Screen”.'; $('installGo').hidden = true; $('install').hidden = false; }
  }
  $('installGo').addEventListener('click', function () {
    if (!installPrompt) return;
    installPrompt.prompt();
    installPrompt.userChoice.finally(function () { installPrompt = null; $('install').hidden = true; UI.storeSet('installHidden', true); });
  });
  $('installHide').addEventListener('click', function () { $('install').hidden = true; UI.storeSet('installHidden', true); });

  // ---------------------------------------------------------------- start
  function typing() { var a = document.activeElement; return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName); }
  var savedPeriod = UI.storeGet('period');
  if (savedPeriod === 'week' || savedPeriod === 'month' || savedPeriod === 'all') state.period = savedPeriod;
  if (!location.hash) { var last = UI.storeGet('page'); if (typeof last === 'string') history.replaceState(null, '', '#' + last); }
  route();
  checkAccess();
  if (auth) auth.onAuthStateChange(function (event) {
    if (event === 'SIGNED_IN' && /access_token=/.test(location.hash)) history.replaceState(null, '', '#' + (UI.storeGet('page') || 'today'));
    if (event === 'SIGNED_OUT') { state.me = null; lock('signin'); }
  });
  setInterval(function () { if (document.visibilityState === 'visible' && !typing()) load(); }, 60000);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible' || typing()) return;
    if (state.day < today() && state.view === 'today' && !$('pasteBox').value) state.day = today(); // a new day began
    load();
  });
})();
