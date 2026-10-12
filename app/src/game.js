/* SpecQuest game mode: world map, level list, question engine, finish/fail screens, review level.
   Rules: spec §7 Game Rules 1-5, 8, 9. Uses SL.GAME from game-content.js. */
(function () {
  const SL = window.SL;
  const h = SL.h;
  const G = SL.GAME;
  if (!G) return;

  const CORRECT_XP = 10; // Game Rule 4
  const COMBO_XP = 5;
  const STAR_XP = 20;
  const BOSS_XP = 100; // Game Rule 5
  const LEVEL_SIZE = 6;
  const BOSS_SIZE = 8;
  const HEARTS = 3; // Game Rule 2

  // ---------- module CSS ----------
  (function injectStyles() {
    if (document.getElementById('game-css')) return;
    const css = `
.g-head { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:14px; }
.g-head h1 { margin:0; }
.g-sub { color: var(--muted); margin: 0 0 16px; }
.world-card { display:block; padding:18px; }
.world-card .w-top { display:flex; align-items:center; gap:10px; }
.world-card .w-num { font-size:.82rem; color:var(--muted); font-weight:700; }
.world-card h2 { margin:0; font-size:1.15rem; }
.world-card .w-topics { color:var(--muted); font-size:.9rem; margin:8px 0 10px; }
.world-card .w-foot { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:8px; flex-wrap:wrap; }
.world-card .lock { position:absolute; top:12px; inset-inline-end:14px; font-size:1.2rem; }
.lvl-list { display:grid; gap:10px; max-width:720px; }
.lvl-item { display:flex; align-items:center; gap:12px; width:100%; text-align:start; font:inherit; color:inherit; background:var(--surface);
  border:2px solid var(--border); border-radius:14px; padding:12px 14px; cursor:pointer; }
.lvl-item:hover:not(:disabled) { border-color:var(--primary); }
.lvl-item:disabled { cursor:not-allowed; opacity:.55; }
.lvl-item .lvl-num { flex:none; width:40px; height:40px; border-radius:50%; background:var(--primary-soft); color:var(--primary);
  display:flex; align-items:center; justify-content:center; font-weight:800; font-size:1.05rem; }
.lvl-item.done .lvl-num { background:var(--good-soft); color:var(--good); }
.lvl-item.boss { border-style:dashed; border-color:var(--gold); }
.lvl-item.boss .lvl-num { background:var(--warn-soft); color:var(--warn); font-size:1.3rem; }
.lvl-item .lvl-body { flex:1; min-width:0; }
.lvl-item .lvl-name { font-weight:700; }
.lvl-item .lvl-meta { color:var(--muted); font-size:.85rem; }
.q-card .q-meta { display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin-bottom:4px; }
.q-card .hearts .lost { opacity:.35; filter:grayscale(1); }
.q-ask { font-weight:700; margin:4px 0 12px; }
.opt-mark { margin-inline-start:auto; font-weight:800; flex:none; }
.option.faded { opacity:.35; }
.card-row { margin:10px 0 14px; }
.card-row .card-label { font-weight:700; margin-bottom:6px; }
.card-row.active .card-label::before { content:'▸ '; color:var(--primary); }
.card-opts { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:6px; }
@media (max-width:560px) { .card-opts { grid-template-columns:repeat(2, minmax(0,1fr)); } }
.card-opts .option { justify-content:center; text-align:center; padding:10px 6px; font-size:.95rem; }
.ent-pair { display:flex; align-items:center; justify-content:center; gap:10px; flex-wrap:wrap; font-weight:800; font-size:1.1rem; margin:6px 0 4px; }
.ent-pair .ent { background:var(--primary-soft); color:var(--primary); padding:4px 12px; border-radius:10px; }
.order-list li .txt { flex:1; min-width:0; }
.order-list li .mv { display:flex; gap:4px; flex:none; }
.order-list li .mv .btn { min-height:34px; padding:2px 10px; }
.order-list li.correct { border-color:var(--good); background:var(--good-soft); }
.order-list li.wrong { border-color:var(--bad); background:var(--bad-soft); }
.q-actions { display:flex; gap:8px; justify-content:flex-end; margin-top:14px; flex-wrap:wrap; }
.explain .work { margin-top:8px; }
.explain .answer-line { margin-top:6px; font-weight:600; }
.fin-hero { text-align:center; }
.fin-hero .emoji { font-size:3rem; }
.miss-list { list-style:none; padding:0; margin:0; display:grid; gap:10px; }
.miss-list li { border:1px solid var(--border); border-radius:12px; padding:12px; background:var(--surface); }
.sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
.kbd-hint { color:var(--muted); font-size:.82rem; text-align:center; margin-top:10px; }
@media (max-width:640px) { .kbd-hint { display:none; } }
`;
    document.head.appendChild(h('style', { id: 'game-css' }, css));
  })();

  // ---------- helpers ----------
  /** Text with `backticks` -> nodes with LTR <code> for technical names */
  function rich(text) {
    const parts = String(text == null ? '' : text).split('`');
    return parts.map((p, i) => (i % 2 ? SL.code(p) : p));
  }
  const best = (id) => (SL.state.levels[id] && SL.state.levels[id].bestStars) || 0;
  const worldIndex = (wid) => G.worlds.findIndex((w) => w.id === wid);
  function findLevel(id) {
    for (let wi = 0; wi < G.worlds.length; wi++) {
      const w = G.worlds[wi];
      const li = w.levels.findIndex((l) => l.id === id);
      if (li >= 0) return { world: w, wi, level: w.levels[li], li, boss: false };
      if (w.boss.id === id) return { world: w, wi, level: w.boss, li: w.levels.length, boss: true };
    }
    return null;
  }
  const allLevelIds = (w) => w.levels.map((l) => l.id).concat(w.boss.id);

  // Game Rule 1: world 0 open; next opens when every regular level in the previous world has >=2 stars and its boss was won.
  function worldCleared(w) {
    return w.levels.every((l) => best(l.id) >= 2) && best(w.boss.id) >= 1;
  }
  function worldOpen(wi) {
    return wi === 0 || worldCleared(G.worlds[wi - 1]);
  }
  // Within a world, levels open in order (previous level finished); the boss opens when all regular levels are finished.
  function levelOpen(wi, li) {
    if (!worldOpen(wi)) return false;
    const w = G.worlds[wi];
    if (li === 0) return true;
    if (li >= w.levels.length) return w.levels.every((l) => best(l.id) >= 1);
    return best(w.levels[li - 1].id) >= 1;
  }
  function worldStars(w) {
    const ids = allLevelIds(w);
    return { got: ids.reduce((s, id) => s + best(id), 0), total: ids.length * 3 };
  }

  function starsEl(n, big) {
    return h(
      'span',
      { class: big ? 'big-stars' : 'stars', role: 'img', 'aria-label': n + ' מתוך 3 כוכבים' },
      '★'.repeat(n),
      h('span', { class: 'off' }, '★'.repeat(3 - n))
    );
  }
  function heartsEl(n, total) {
    if (total == null) return h('span', { class: 'hearts', 'aria-label': 'חזרה בלי לבבות' }, '♾️');
    const kids = [];
    for (let i = 0; i < total; i++) kids.push(h('span', { class: i < n ? '' : 'lost', 'aria-hidden': 'true' }, i < n ? '❤️' : '🖤'));
    return h('span', { class: 'hearts', role: 'img', 'aria-label': n + ' לבבות נשארו' }, kids);
  }
  function progressEl(done, total) {
    const pct = total ? Math.round((done / total) * 100) : 0;
    return h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(done), 'aria-label': 'התקדמות' }, h('div', { style: { width: pct + '%' } }));
  }
  function backLink(path, label) {
    return h('a', { href: '#' + path, class: 'btn ghost small' }, '→ ' + label);
  }

  // Exposed for the progress screen.
  SL.gameStats = function () {
    let starsEarned = 0, starsTotal = 0, levelsDone = 0, levelsTotal = 0;
    G.worlds.forEach((w) =>
      allLevelIds(w).forEach((id) => {
        const b = best(id);
        starsEarned += b;
        starsTotal += 3;
        levelsTotal += 1;
        if (b >= 1) levelsDone += 1;
      })
    );
    return { starsEarned, starsTotal, levelsDone, levelsTotal };
  };
  SL.gameWorldStars = (wid) => {
    const w = G.worlds[worldIndex(wid)];
    return w ? worldStars(w) : null;
  };

  // Game Rule 9 (game part): first open level not yet completed; then the first level that still blocks the next world.
  SL.nextGameStep = function () {
    const mk = (wi, li, sub) => {
      const w = G.worlds[wi];
      const l = li < w.levels.length ? w.levels[li] : w.boss;
      const isBoss = li >= w.levels.length;
      return {
        label: w.emoji + ' ' + (isBoss ? '👑 ' + l.name : l.name),
        sub: sub || 'עולם ' + w.num + ': ' + w.name + (isBoss ? ' · מבחן בוס' : ' · שלב ' + (li + 1)),
        path: '/game/level/' + l.id,
      };
    };
    for (let wi = 0; wi < G.worlds.length; wi++) {
      if (!worldOpen(wi)) break;
      const w = G.worlds[wi];
      for (let li = 0; li <= w.levels.length; li++) {
        const id = li < w.levels.length ? w.levels[li].id : w.boss.id;
        if (levelOpen(wi, li) && best(id) === 0) return mk(wi, li);
      }
    }
    for (let wi = 0; wi < G.worlds.length; wi++) {
      if (!worldOpen(wi)) break;
      const w = G.worlds[wi];
      for (let li = 0; li < w.levels.length; li++)
        if (best(w.levels[li].id) < 2) return mk(wi, li, 'צריך 2 כוכבים כדי לפתוח את העולם הבא');
    }
    return null;
  };

  // ---------- screens: world map ----------
  SL.route('/game', (el) => {
    const stats = SL.gameStats();
    const reviewN = SL.reviewIds().filter((id) => G.questions.some((q) => q.id === id)).length;
    el.appendChild(
      h('div', { class: 'g-head' }, h('h1', null, '🎮 מפת העולמות'), h('span', { class: 'spacer' }), h('span', { class: 'tag primary' }, '⭐ ' + stats.starsEarned + ' / ' + stats.starsTotal))
    );
    el.appendChild(h('p', { class: 'g-sub' }, 'כל שלב הוא 6 שאלות קצרות ו-3 לבבות. אספו לפחות 2 כוכבים בכל שלב ונצחו את הבוס כדי לפתוח את העולם הבא.'));

    const next = SL.nextGameStep();
    const top = h('div', { class: 'row', style: { marginBottom: '14px' } });
    if (next) top.appendChild(h('button', { class: 'btn primary', onclick: () => SL.go(next.path) }, '▶ המשך לשחק: ' + next.label));
    if (reviewN) top.appendChild(h('button', { class: 'btn', onclick: () => SL.go('/game/review') }, '🔁 חזרה על טעויות (' + reviewN + ')'));
    if (top.childNodes.length) el.appendChild(top);

    const grid = h('div', { class: 'grid' });
    G.worlds.forEach((w, wi) => {
      const open = worldOpen(wi);
      const st = worldStars(w);
      const done = allLevelIds(w).filter((id) => best(id) >= 1).length;
      const total = w.levels.length + 1;
      const prev = G.worlds[wi - 1];
      grid.appendChild(
        h(
          'button',
          {
            class: 'card world-card' + (open ? ' pop' : ''),
            disabled: !open,
            'aria-label': 'עולם ' + w.num + ': ' + w.name + (open ? '' : ' (נעול)') + ', ' + st.got + ' מתוך ' + st.total + ' כוכבים',
            onclick: () => SL.go('/game/world/' + w.id),
          },
          !open ? h('span', { class: 'lock', 'aria-hidden': 'true' }, '🔒') : null,
          h('div', { class: 'w-top' }, h('span', { class: 'emoji', 'aria-hidden': 'true' }, w.emoji), h('div', null, h('div', { class: 'w-num' }, 'עולם ' + w.num + (worldCleared(w) ? ' · ✅ הושלם' : '')), h('h2', null, w.name))),
          h('div', { class: 'w-topics' }, w.topics),
          progressEl(done, total),
          h(
            'div',
            { class: 'w-foot' },
            h('span', { class: 'stars', 'aria-hidden': 'true' }, '★ ', h('span', { style: { color: 'var(--text)' } }, st.got + '/' + st.total)),
            h('span', { class: 'small muted' }, open ? done + '/' + total + ' שלבים' : 'נפתח אחרי עולם ' + prev.num + ': 2★ בכל שלב + ניצחון על הבוס')
          )
        )
      );
    });
    el.appendChild(grid);
  });

  // ---------- screens: level list ----------
  SL.route('/game/world/:id', (el, p) => {
    const wi = worldIndex(p.id);
    if (wi < 0) return SL.go('/game');
    const w = G.worlds[wi];
    if (!worldOpen(wi)) {
      SL.toast('🔒 העולם הזה עוד נעול');
      return SL.go('/game');
    }
    const st = worldStars(w);
    el.appendChild(h('div', { class: 'g-head' }, backLink('/game', 'מפה'), h('h1', null, w.emoji + ' עולם ' + w.num + ': ' + w.name)));
    el.appendChild(h('p', { class: 'g-sub' }, w.topics + ' · ', h('span', { class: 'stars' }, '★'), ' ' + st.got + '/' + st.total));
    const list = h('div', { class: 'lvl-list' });
    const entries = w.levels.map((l, li) => ({ l, li, boss: false })).concat([{ l: w.boss, li: w.levels.length, boss: true }]);
    entries.forEach(({ l, li, boss }) => {
      const open = levelOpen(wi, li);
      const b = best(l.id);
      const rec = SL.state.levels[l.id];
      const meta = boss
        ? open
          ? '8 שאלות מכל השלבים, בלי רמזים · ניצחון = ' + BOSS_XP + ' XP'
          : '🔒 נפתח כשכל השלבים בעולם הושלמו'
        : open
          ? (rec && rec.attempts ? rec.attempts + ' ניסיונות' : 'עוד לא שוחק') + (b === 1 ? ' · צריך 2★ לפתיחת העולם הבא' : '')
          : '🔒 נפתח אחרי השלב הקודם';
      list.appendChild(
        h(
          'button',
          {
            class: 'lvl-item' + (b ? ' done' : '') + (boss ? ' boss' : ''),
            disabled: !open,
            onclick: () => SL.go('/game/level/' + l.id),
          },
          h('span', { class: 'lvl-num', 'aria-hidden': 'true' }, boss ? '👑' : !open ? '🔒' : String(li + 1)),
          h('span', { class: 'lvl-body' }, h('div', { class: 'lvl-name' }, boss ? l.name : 'שלב ' + (li + 1) + ': ' + l.name), h('div', { class: 'lvl-meta' }, meta)),
          starsEl(b)
        )
      );
    });
    el.appendChild(list);
  });

  // ---------- play ----------
  SL.route('/game/level/:id', (el, p) => {
    const f = findLevel(p.id);
    if (!f) return SL.go('/game');
    if (!levelOpen(f.wi, f.li)) {
      SL.toast('🔒 השלב הזה עוד נעול');
      return SL.go(worldOpen(f.wi) ? '/game/world/' + f.world.id : '/game');
    }
    let pool;
    if (f.boss) {
      // Boss: 8 questions spread across all levels of the world (round-robin over shuffled per-level pools).
      const per = f.world.levels.map((l) => SL.shuffle(G.questions.filter((q) => q.level === l.id)));
      pool = [];
      for (let i = 0; pool.length < BOSS_SIZE && per.some((x) => x.length); i++) {
        const src = per[i % per.length];
        if (src.length) pool.push(src.shift());
      }
      pool = SL.shuffle(pool);
    } else {
      pool = SL.shuffle(G.questions.filter((q) => q.level === f.level.id)).slice(0, LEVEL_SIZE);
    }
    play(el, {
      id: f.level.id,
      title: f.boss ? '👑 ' + f.level.name : f.world.emoji + ' ' + f.level.name,
      questions: pool,
      boss: f.boss,
      review: false,
      found: f,
    });
  });

  SL.route('/game/review', (el) => {
    const ids = SL.reviewIds();
    const qs = SL.shuffle(G.questions.filter((q) => ids.includes(q.id))).slice(0, LEVEL_SIZE);
    if (!qs.length) {
      el.appendChild(
        h(
          'div',
          { class: 'card q-card fin-hero pop' },
          h('div', { class: 'emoji', 'aria-hidden': 'true' }, '🧹'),
          h('h1', null, 'אין מה לחזור עליו'),
          h('p', { class: 'muted' }, 'שאלה שעניתם עליה בטעות נכנסת לכאן, ויוצאת אחרי שתי תשובות נכונות ברצף. כרגע הרשימה ריקה. יפה!'),
          h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '12px' } }, h('button', { class: 'btn primary', onclick: () => SL.go('/game') }, 'למפת העולמות'))
        )
      );
      return;
    }
    play(el, { id: 'review', title: '🔁 חזרה על טעויות', questions: qs, boss: false, review: true });
  });

  function play(el, cfg) {
    const s = {
      i: 0,
      hearts: cfg.review ? Infinity : HEARTS,
      combo: 0,
      xp: 0,
      correctCount: 0,
      mistakes: [],
      skills: new Set(),
      hintUsed: false,
      answered: false,
      handler: null,
      continueBtn: null,
      over: false,
    };
    const wrap = h('div', { class: 'q-card' });
    el.appendChild(wrap);

    function onKey(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('.modal-back')) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (e.key === 'Enter') {
        // Let a focused button handle Enter natively (avoids double actions).
        if (t && (t.tagName === 'BUTTON' || t.tagName === 'A')) return;
        if (s.answered && s.continueBtn) {
          e.preventDefault();
          s.continueBtn.click();
        } else if (!s.answered && s.handler && s.handler.submit) {
          e.preventDefault();
          s.handler.submit();
        }
        return;
      }
      if (/^[1-9]$/.test(e.key) && !s.answered && s.handler && s.handler.key) {
        e.preventDefault();
        s.handler.key(Number(e.key) - 1);
      }
    }
    document.addEventListener('keydown', onKey);
    SL.cleanup = () => document.removeEventListener('keydown', onKey);

    function header() {
      const total = cfg.questions.length;
      const head = h(
        'div',
        { class: 'q-head' },
        h('a', { href: cfg.review ? '#/game' : '#/game/world/' + cfg.found.world.id, class: 'btn ghost small', 'aria-label': 'יציאה מהשלב' }, '✕'),
        progressEl(s.i, total),
        heartsEl(cfg.review ? 0 : s.hearts, cfg.review ? null : HEARTS)
      );
      const meta = h(
        'div',
        { class: 'q-meta' },
        h('span', { class: 'tag primary' }, cfg.title),
        h('span', { class: 'tag' }, 'שאלה ' + (s.i + 1) + ' מתוך ' + total),
        h('span', { class: 'tag' }, '⚡ ' + s.xp + ' XP'),
        s.combo >= 2 ? h('span', { class: 'combo pop', 'aria-label': 'רצף ' + s.combo + ' תשובות נכונות' }, '🔥 ×' + s.combo + (s.combo >= 2 ? ' · הבאה +' + COMBO_XP : '')) : null
      );
      return [head, meta];
    }

    function renderQuestion() {
      wrap.innerHTML = '';
      s.answered = false;
      s.continueBtn = null;
      const q = cfg.questions[s.i];
      const card = h('div', { class: 'card pop' });
      header().forEach((n) => wrap.appendChild(n));
      wrap.appendChild(card);
      const typeLabel = { choice: 'בחירה', truefalse: 'נכון או לא', cardinality: 'קרדינליות', fieldtype: 'סוג שדה', measurable: 'מדיד או עמום', trap: 'איתור המלכודת', devasks: 'המפתח שואל', order: 'סידור' }[q.type];
      card.appendChild(h('div', { class: 'row' }, h('span', { class: 'tag' }, typeLabel), h('span', { class: 'tag' }, SL.skillName(q.skill))));
      const body = h('div');
      card.appendChild(body);
      const feedback = h('div', { 'aria-live': 'polite' });
      card.appendChild(feedback);
      const renderer = RENDER[q.type] || RENDER.choice;
      s.handler = renderer(q, body, (correct, extra) => onAnswer(q, correct, extra, card, feedback), cfg);
      wrap.appendChild(h('div', { class: 'kbd-hint' }, 'מקלדת: 1–4 לבחירה · Enter להמשך'));
      const h1 = h('h1', { class: 'sr-only' }, cfg.title + ', שאלה ' + (s.i + 1));
      wrap.prepend(h1);
      const first = body.querySelector('button:not(:disabled)');
      if (first && s.i > 0) first.focus({ preventScroll: true });
    }

    function onAnswer(q, correct, extra, card, feedback) {
      if (s.answered) return;
      s.answered = true;
      let gained = 0;
      if (correct) {
        s.combo += 1;
        s.correctCount += 1;
        gained = CORRECT_XP + (s.combo >= 3 ? COMBO_XP : 0); // Game Rule 4
        s.xp += gained;
        SL.addXP(gained); // saved immediately: kept even if the level fails (Game Rule 2)
        if (q.skill === 'keys' && SL.bumpCounter('keysCorrect') >= 10) SL.awardBadge('keymaster');
        if (q.type === 'trap' && q.world === 'w1') {
          const pr = SL.state.progress;
          pr.trapsSolved = pr.trapsSolved || [];
          if (!pr.trapsSolved.includes(q.id)) pr.trapsSolved.push(q.id);
          const all = G.questions.filter((x) => x.type === 'trap' && x.world === 'w1').map((x) => x.id);
          if (all.every((id) => pr.trapsSolved.includes(id))) SL.awardBadge('traphunter');
          SL.save();
        }
      } else {
        s.combo = 0;
        if (!cfg.review) s.hearts -= 1;
        s.mistakes.push(q);
        card.classList.remove('pop');
        void card.offsetWidth;
        card.classList.add('shake');
      }
      SL.recordSkill(q.skill, correct ? 100 : 0);
      SL.recordReview(q.id, correct);
      s.skills.add(q.skill);

      // refresh header (hearts / xp / combo)
      const oldHead = wrap.querySelector('.q-head');
      const oldMeta = wrap.querySelector('.q-meta');
      const [nh, nm] = header();
      oldHead.replaceWith(nh);
      oldMeta.replaceWith(nm);

      const isLast = s.i >= cfg.questions.length - 1;
      const outOfHearts = s.hearts <= 0;
      const label = outOfHearts ? 'לסיכום' : isLast ? 'לסיום השלב 🏁' : 'המשך';
      const btn = h('button', { class: 'btn primary', onclick: next }, label);
      s.continueBtn = btn;
      const cheer = correct
        ? SL.shuffle(['מעולה!', 'בול!', 'יפה מאוד!', 'נכון!', 'בדיוק ככה!'])[0]
        : SL.shuffle(['לא הפעם', 'כמעט', 'טעות שכדאי לזכור'])[0];
      const ex = h(
        'div',
        { class: 'explain pop ' + (correct ? 'good' : 'bad'), role: 'status' },
        h('h3', null, (correct ? '✅ ' : '❌ ') + cheer + (gained ? ' +' + gained + ' XP' : '') + (correct && s.combo >= 3 ? ' 🔥' : '')),
        !correct ? h('div', { class: 'answer-line' }, 'התשובה הנכונה: ', answerText(q)) : null,
        h('p', null, rich(q.explain)),
        h('p', { class: 'work' }, h('b', null, '💼 בעבודה: '), rich(q.work)),
        !correct && !cfg.review ? h('p', { class: 'small muted' }, 'השאלה נכנסה לרשימת החזרה.') : null,
        h('div', { class: 'q-actions' }, btn)
      );
      feedback.appendChild(ex);
      btn.focus({ preventScroll: true });
      ex.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    function next() {
      if (s.over) return;
      if (s.hearts <= 0) return fail();
      s.i += 1;
      if (s.i >= cfg.questions.length) return finish();
      renderQuestion();
      window.scrollTo(0, 0);
    }

    function recordAttempt(stars) {
      const prev = SL.state.levels[cfg.id] || { bestStars: 0, attempts: 0, completedAt: null };
      const improved = stars > prev.bestStars;
      SL.state.levels[cfg.id] = {
        bestStars: Math.max(prev.bestStars || 0, stars), // Game Rule 3: keep the best
        attempts: (prev.attempts || 0) + 1,
        completedAt: stars > 0 ? prev.completedAt || Date.now() : prev.completedAt || null,
      };
      SL.save();
      return { improved, prevBest: prev.bestStars || 0 };
    }

    function skillsBox() {
      const items = [...s.skills].map((id) => h('li', null, SL.skillName(id) + ': ', h('b', null, String(SL.skillScore(id) == null ? '—' : SL.skillScore(id)))));
      return items.length ? h('div', { class: 'notice', style: { marginTop: '12px' } }, h('b', null, '📊 מיומנויות שתרגלתם'), h('ul', { style: { margin: '6px 0 0', paddingInlineStart: '20px' } }, items)) : null;
    }

    function finish() {
      s.over = true;
      wrap.innerHTML = '';
      SL.markActivity(5);
      if (cfg.review) {
        const left = SL.reviewIds().length;
        wrap.appendChild(
          h(
            'div',
            { class: 'card fin-hero pop' },
            h('div', { class: 'emoji', 'aria-hidden': 'true' }, '🔁'),
            h('h1', null, 'החזרה הושלמה'),
            h('p', null, s.correctCount + ' מתוך ' + cfg.questions.length + ' נכונות · ', h('b', null, '+' + s.xp + ' XP')),
            h('p', { class: 'muted' }, left ? 'נשארו ' + left + ' שאלות ברשימת החזרה. שאלה יוצאת אחרי שתי תשובות נכונות ברצף.' : 'רשימת החזרה ריקה. כל הכבוד!'),
            skillsBox(),
            h(
              'div',
              { class: 'row', style: { justifyContent: 'center', marginTop: '14px' } },
              left ? h('button', { class: 'btn primary', onclick: () => SL.go('/game/review') }, '🔁 עוד סבב') : null,
              h('button', { class: 'btn', onclick: () => SL.go('/game') }, '🗺️ מפה')
            )
          )
        );
        focusFirst();
        return;
      }
      const stars = Math.max(0, Math.min(3, s.hearts)); // Game Rule 3
      const wasCleared = worldCleared(cfg.found.world);
      const rec = recordAttempt(stars);
      const finishXP = stars * STAR_XP + (cfg.boss ? BOSS_XP : 0);
      SL.addXP(finishXP);
      s.xp += finishXP;
      const badges = [];
      if (s.mistakes.length === 0 && SL.awardBadge('sniper')) badges.push('sniper');
      if (cfg.boss && SL.awardBadge('boss')) badges.push('boss');
      const f = cfg.found;
      const nextStep = nextAfter(f);
      const msg = stars === 3 ? 'מושלם! בלי אף טעות 🎯' : stars === 2 ? 'עבודה טובה! עוד צעד לשלמות' : 'עברתם! עם 2 כוכבים פותחים את העולם הבא';
      const worldJustCleared = !wasCleared && worldCleared(f.world) && f.wi + 1 < G.worlds.length;
      wrap.appendChild(
        h(
          'div',
          { class: 'card fin-hero pop' },
          h('div', { class: 'emoji', 'aria-hidden': 'true' }, cfg.boss ? '👑' : '🏁'),
          h('h1', null, cfg.boss ? 'ניצחתם את הבוס!' : 'השלב הושלם!'),
          starsEl(stars, true),
          h('p', null, msg),
          h(
            'div',
            { class: 'kpis', style: { margin: '12px 0' } },
            h('div', { class: 'kpi' }, h('b', null, '+' + s.xp), 'XP בשלב'),
            h('div', { class: 'kpi' }, h('b', null, s.correctCount + '/' + cfg.questions.length), 'תשובות נכונות'),
            h('div', { class: 'kpi' }, h('b', null, String(Math.max(rec.prevBest, stars)) + '★'), rec.improved && rec.prevBest ? 'שיא חדש!' : 'השיא בשלב')
          ),
          h('p', { class: 'small muted' }, 'פירוט: ' + (s.xp - finishXP) + ' XP מתשובות, ' + stars * STAR_XP + ' XP על ' + stars + ' כוכבים' + (cfg.boss ? ', ' + BOSS_XP + ' XP על ניצחון בבוס' : '')),
          badges.length
            ? h('div', { class: 'notice good' }, badges.map((id) => { const b = SL.BADGES.find((x) => x.id === id); return h('div', null, b.icon + ' תג חדש: ' + b.name); }))
            : null,
          worldJustCleared ? h('div', { class: 'notice good', style: { marginTop: '8px' } }, '🔓 נפתח עולם חדש: ' + G.worlds[f.wi + 1].emoji + ' ' + G.worlds[f.wi + 1].name) : null,
          skillsBox(),
          h(
            'div',
            { class: 'row', style: { justifyContent: 'center', marginTop: '14px' } },
            h('button', { class: 'btn', onclick: () => SL.go('/game/level/' + cfg.id) }, '🔄 שוב'),
            nextStep ? h('button', { class: 'btn primary', onclick: () => SL.go(nextStep) }, 'השלב הבא ←') : null,
            h('button', { class: 'btn', onclick: () => SL.go('/game/world/' + f.world.id) }, '🗺️ מפה')
          )
        )
      );
      focusFirst();
    }

    function fail() {
      s.over = true;
      wrap.innerHTML = '';
      recordAttempt(0);
      SL.markActivity(5);
      const back = cfg.review ? '/game' : '/game/world/' + cfg.found.world.id;
      wrap.appendChild(
        h(
          'div',
          { class: 'card pop' },
          h('div', { class: 'fin-hero' }, h('div', { class: 'emoji', 'aria-hidden': 'true' }, '💔'), h('h1', null, 'נגמרו הלבבות'), h('p', null, 'לא נורא, ככה לומדים. ה-XP שצברתם נשמר: ', h('b', null, '+' + s.xp + ' XP'))),
          h('h2', null, 'מה כדאי לזכור'),
          h(
            'ul',
            { class: 'miss-list' },
            s.mistakes.map((q) =>
              h(
                'li',
                null,
                h('div', { style: { fontWeight: 700 } }, rich(questionTitle(q))),
                h('div', { class: 'answer-line good', style: { margin: '6px 0' } }, '✔ ', answerText(q)),
                h('div', null, rich(q.explain)),
                h('div', { class: 'small muted', style: { marginTop: '4px' } }, '💼 ', rich(q.work))
              )
            )
          ),
          h(
            'div',
            { class: 'row', style: { justifyContent: 'center', marginTop: '14px' } },
            h('button', { class: 'btn primary', onclick: () => SL.go(cfg.review ? '/game/review' : '/game/level/' + cfg.id) }, '🔄 נסה שוב'),
            h('button', { class: 'btn', onclick: () => SL.go(back) }, '🗺️ מפה')
          )
        )
      );
      focusFirst();
    }

    function focusFirst() {
      const b = wrap.querySelector('.btn.primary') || wrap.querySelector('button');
      const t = wrap.querySelector('h1');
      if (t) {
        t.setAttribute('tabindex', '-1');
        t.focus({ preventScroll: true });
      }
      s.continueBtn = b;
      s.answered = true;
      window.scrollTo(0, 0);
    }

    renderQuestion();
  }

  function nextAfter(f) {
    const w = f.world;
    if (!f.boss) {
      const li = f.li + 1;
      if (levelOpen(f.wi, li)) return '/game/level/' + (li < w.levels.length ? w.levels[li].id : w.boss.id);
      return null;
    }
    if (f.wi + 1 < G.worlds.length && worldOpen(f.wi + 1)) return '/game/level/' + G.worlds[f.wi + 1].levels[0].id;
    return null;
  }

  function questionTitle(q) {
    if (q.type === 'devasks') return 'המפתח שואל: ' + q.ask;
    if (q.type === 'measurable') return 'מדיד או עמום: "' + q.snippet + '"';
    if (q.type === 'cardinality') return q.a + ' ↔ ' + q.b + ': ' + q.q;
    if (q.type === 'trap') return q.q + ' "' + q.snippet.replace(/\n/g, ' · ') + '"';
    return q.q;
  }
  function answerText(q) {
    switch (q.type) {
      case 'truefalse':
        return q.answer ? 'נכון' : 'לא נכון';
      case 'devasks':
        return q.answer ? 'התשובה כתובה בקטע' : 'לא כתוב בקטע. זה פער באפיון';
      case 'measurable':
        return q.measurable ? 'הדרישה מדידה כפי שהיא' : h('span', null, 'עמומה. ניסוח טוב יותר: ', rich(q.options[q.answer]));
      case 'cardinality':
        return 'כמה ' + q.b + ' לכל ' + q.a + ': ' + G.CARD[q.answer[0]] + ' · כמה ' + q.a + ' לכל ' + q.b + ': ' + G.CARD[q.answer[1]];
      case 'order':
        return q.items.map((t, i) => i + 1 + '. ' + t).join('  ');
      default:
        return h('span', null, rich(q.options[q.answer]));
    }
  }

  // ---------- question renderers ----------
  // Each returns {key(n), submit()} and calls done(correct) once.
  function optionButton(n, content, onclick) {
    return h('button', { class: 'option', onclick }, h('span', { class: 'key', 'aria-hidden': 'true' }, String(n)), h('span', null, content));
  }
  function mark(btn, ok) {
    btn.classList.add(ok ? 'correct' : 'wrong');
    btn.appendChild(h('span', { class: 'opt-mark', 'aria-label': ok ? 'נכון' : 'שגוי' }, ok ? '✓' : '✗'));
  }

  /** Generic single-choice list. opts: [{content, correct}] in display order. */
  function choiceList(container, opts, done, allowHint) {
    let locked = false;
    const btns = [];
    const box = h('div', { class: 'options', role: 'group' });
    opts.forEach((o, i) => {
      const b = optionButton(i + 1, o.content, () => pick(i));
      btns.push(b);
      box.appendChild(b);
    });
    function pick(i) {
      if (locked || btns[i].disabled) return;
      locked = true;
      btns.forEach((b) => (b.disabled = true));
      btns[i].classList.add('selected');
      opts.forEach((o, j) => {
        if (o.correct) mark(btns[j], true);
        else if (j === i) mark(btns[j], false);
      });
      done(!!opts[i].correct);
    }
    container.appendChild(box);
    if (allowHint) {
      const hint = h(
        'button',
        {
          class: 'btn ghost small',
          title: 'מוריד שתי תשובות שגויות. פעם אחת בשלב',
          onclick: () => {
            if (locked) return;
            allowHint.use();
            hint.disabled = true;
            SL.shuffle(opts.map((o, j) => j).filter((j) => !opts[j].correct))
              .slice(0, 2)
              .forEach((j) => {
                btns[j].disabled = true;
                btns[j].classList.add('faded');
                btns[j].setAttribute('aria-label', 'הוסרה ברמז');
              });
          },
        },
        '💡 רמז 50:50'
      );
      container.appendChild(h('div', { class: 'row end', style: { marginTop: '8px' } }, hint));
    }
    return { key: (n) => n < btns.length && pick(n), submit: null };
  }

  function hintFor(cfg) {
    // One 50:50 hint per regular level; none in boss (Game Rule 5) or review.
    if (cfg.boss || cfg.review || cfg._hintUsed) return null;
    return { use: () => (cfg._hintUsed = true) };
  }

  function shuffledOptions(q) {
    return SL.shuffle(q.options.map((t, i) => ({ content: rich(t), correct: i === q.answer })));
  }

  const RENDER = {
    choice(q, body, done, cfg) {
      body.appendChild(h('p', { class: 'q-text' }, rich(q.q)));
      if (q.snippet) body.appendChild(h('div', { class: 'q-snippet' }, rich(q.snippet)));
      return choiceList(body, shuffledOptions(q), done, hintFor(cfg));
    },
    fieldtype(q, body, done, cfg) {
      body.appendChild(h('p', { class: 'q-ask' }, '🧾 איזה סוג שדה מתאים לנתון?'));
      body.appendChild(h('div', { class: 'q-snippet' }, rich(q.q)));
      return choiceList(body, shuffledOptions(q), done, hintFor(cfg));
    },
    trap(q, body, done, cfg) {
      body.appendChild(h('p', { class: 'q-text' }, '🐞 ', rich(q.q || 'מה הבעיה בקטע?')));
      body.appendChild(h('div', { class: 'q-snippet' }, rich(q.snippet)));
      return choiceList(body, shuffledOptions(q), done, hintFor(cfg));
    },
    truefalse(q, body, done) {
      body.appendChild(h('p', { class: 'q-ask' }, 'נכון או לא נכון?'));
      body.appendChild(h('p', { class: 'q-text' }, rich(q.q)));
      return choiceList(body, [{ content: '👍 נכון', correct: q.answer === true }, { content: '👎 לא נכון', correct: q.answer === false }], done, null);
    },
    devasks(q, body, done) {
      body.appendChild(h('p', { class: 'q-ask' }, '📄 קטע מהאפיון:'));
      body.appendChild(h('div', { class: 'q-snippet' }, rich(q.snippet)));
      body.appendChild(h('p', { class: 'q-text' }, '🧑‍💻 המפתח שואל: "', rich(q.ask), '"'));
      body.appendChild(h('p', { class: 'small muted' }, 'האם התשובה כתובה בקטע?'));
      return choiceList(body, [{ content: '✅ כן, התשובה כתובה בקטע', correct: q.answer === true }, { content: '❓ לא כתוב. זה פער באפיון', correct: q.answer === false }], done, null);
    },
    measurable(q, body, done) {
      body.appendChild(h('p', { class: 'q-ask' }, '📏 הדרישה:'));
      body.appendChild(h('div', { class: 'q-snippet' }, rich(q.snippet)));
      body.appendChild(h('p', { class: 'q-text' }, 'האם אפשר למדוד ולבדוק אותה כפי שהיא?'));
      const step = h('div');
      body.appendChild(step);
      let cur = choiceList(
        step,
        [{ content: '📏 מדידה: יש ערך ויחידה, אפשר לבדוק', correct: q.measurable }, { content: '🌫️ עמומה: צריך לנסח מחדש', correct: !q.measurable }],
        (ok) => {
          if (!ok || q.measurable) return done(ok);
          // step 2: choose a better phrasing
          const s2 = h('div', { class: 'pop', style: { marginTop: '14px' } });
          s2.appendChild(h('p', { class: 'q-text' }, '👌 נכון, היא עמומה. איזה ניסוח מדיד?'));
          body.appendChild(s2);
          cur = choiceList(s2, shuffledOptions(q), done, null);
          const first = s2.querySelector('button');
          if (first) first.focus({ preventScroll: true });
        },
        null
      );
      return { key: (n) => cur.key(n), submit: null };
    },
    cardinality(q, body, done) {
      body.appendChild(h('p', { class: 'q-ask' }, '🔗 בחרו קרדינליות לכל צד של הקשר'));
      body.appendChild(h('div', { class: 'ent-pair', dir: 'rtl' }, h('span', { class: 'ent' }, q.a), h('span', { 'aria-hidden': 'true' }, '↔'), h('span', { class: 'ent' }, q.b)));
      body.appendChild(h('div', { class: 'q-snippet' }, rich(q.q)));
      const picks = [null, null];
      let active = 0;
      let locked = false;
      const rows = [];
      const labels = ['כמה ' + q.b + ' לכל ' + q.a + '?', 'כמה ' + q.a + ' לכל ' + q.b + '?'];
      const checkBtn = h('button', { class: 'btn primary', disabled: true, onclick: () => submit() }, 'בדיקה');
      labels.forEach((lab, r) => {
        const btns = G.CARD.map((c, i) =>
          h('button', { class: 'option', 'aria-pressed': 'false', onclick: () => choose(r, i) }, h('span', { class: 'key', 'aria-hidden': 'true' }, String(i + 1)), h('span', null, c))
        );
        const row = h('div', { class: 'card-row', role: 'group', 'aria-label': lab }, h('div', { class: 'card-label' }, lab), h('div', { class: 'card-opts' }, btns));
        rows.push({ row, btns });
        body.appendChild(row);
      });
      body.appendChild(h('div', { class: 'q-actions' }, checkBtn));
      function paint() {
        rows.forEach((R, r) => {
          R.row.classList.toggle('active', r === active && !locked);
          R.btns.forEach((b, i) => {
            const on = picks[r] === i;
            b.classList.toggle('selected', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
          });
        });
        checkBtn.disabled = locked || picks[0] == null || picks[1] == null;
      }
      function choose(r, i) {
        if (locked) return;
        picks[r] = i;
        active = r === 0 && picks[1] == null ? 1 : r;
        paint();
      }
      function submit() {
        if (locked || picks[0] == null || picks[1] == null) return;
        locked = true;
        rows.forEach((R, r) => {
          R.btns.forEach((b, i) => {
            b.disabled = true;
            if (i === q.answer[r]) mark(b, true);
            else if (i === picks[r]) mark(b, false);
          });
        });
        checkBtn.disabled = true;
        paint();
        done(picks[0] === q.answer[0] && picks[1] === q.answer[1]);
      }
      paint();
      return {
        key: (n) => {
          if (n > 3) return;
          const r = picks[0] == null ? 0 : picks[1] == null ? 1 : active;
          choose(r, n);
        },
        submit,
      };
    },
    order(q, body, done) {
      body.appendChild(h('p', { class: 'q-text' }, '🔢 ', rich(q.q)));
      body.appendChild(h('p', { class: 'small muted' }, 'הזיזו עם החצים, ואז לחצו "בדיקה".'));
      let cur = SL.shuffle(q.items.map((t, i) => i));
      let guard = 0;
      while (cur.every((v, i) => v === i) && guard++ < 10) cur = SL.shuffle(cur);
      let locked = false;
      const list = h('ol', { class: 'order-list', 'aria-label': 'רשימה לסידור' });
      const checkBtn = h('button', { class: 'btn primary', onclick: () => submit() }, 'בדיקה');
      body.appendChild(list);
      body.appendChild(h('div', { class: 'q-actions' }, checkBtn));
      function draw(focus) {
        list.innerHTML = '';
        cur.forEach((itemIdx, pos) => {
          const txt = q.items[itemIdx];
          const up = h('button', { class: 'btn small', 'aria-label': 'הזזה למעלה: ' + txt, disabled: locked || pos === 0, onclick: () => move(pos, -1, 'up') }, '▲');
          const down = h('button', { class: 'btn small', 'aria-label': 'הזזה למטה: ' + txt, disabled: locked || pos === cur.length - 1, onclick: () => move(pos, 1, 'down') }, '▼');
          const li = h('li', { class: locked ? (itemIdx === pos ? 'correct' : 'wrong') : '' }, h('span', { class: 'num' }, String(pos + 1)), h('span', { class: 'txt' }, rich(txt)), locked ? h('span', { class: 'opt-mark' }, itemIdx === pos ? '✓' : '✗') : h('span', { class: 'mv' }, up, down));
          list.appendChild(li);
          if (focus && focus.pos === pos) {
            const target = focus.dir === 'up' ? (up.disabled ? down : up) : down.disabled ? up : down;
            setTimeout(() => target.focus({ preventScroll: true }), 0);
          }
        });
      }
      function move(pos, d, dir) {
        if (locked) return;
        const np = pos + d;
        if (np < 0 || np >= cur.length) return;
        [cur[pos], cur[np]] = [cur[np], cur[pos]];
        draw({ pos: np, dir });
      }
      function submit() {
        if (locked) return;
        locked = true;
        checkBtn.disabled = true;
        draw();
        done(cur.every((v, i) => v === i));
      }
      draw();
      return { key: null, submit };
    },
  };
})();
