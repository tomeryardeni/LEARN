/* SpecLab core: state, game rules, skills, router, UI helpers, AI client.
   Everything lives on the global `SL` object so the app can ship as one HTML file. */
(function () {
  const SL = (window.SL = {});
  const STORAGE_KEY = 'speclab.v1';
  const DAY = 24 * 60 * 60 * 1000;

  // ---------- Skills (SpecLab spec §5.3) ----------
  SL.SKILLS = [
    { id: 'requirements', name: 'ניסוח דרישות', layer: 0 },
    { id: 'entities', name: 'זיהוי ישויות', layer: 1 },
    { id: 'relationships', name: 'קשרים וקרדינליות', layer: 1 },
    { id: 'keys', name: 'מפתחות', layer: 1 },
    { id: 'fieldTypes', name: 'סוגי שדות', layer: 1 },
    { id: 'mapping', name: 'מיפוי שדות', layer: 1 },
    { id: 'sql', name: 'SQL', layer: 1 },
    { id: 'interfaces', name: 'אפיון ממשק', layer: 2 },
    { id: 'failure', name: 'טיפול בכשל', layer: 2 },
    { id: 'architecture', name: 'ארכיטקטורה', layer: 3 },
    { id: 'nfr', name: 'דרישות לא פונקציונליות', layer: 4 },
  ];
  SL.skillName = (id) => (SL.SKILLS.find((s) => s.id === id) || { name: id }).name;

  SL.BADGES = [
    { id: 'sniper', icon: '🎯', name: 'צלף', desc: 'שלב שלם בלי טעות' },
    { id: 'week', icon: '🔥', name: 'שבוע רצוף', desc: 'רצף של 7 ימים' },
    { id: 'keymaster', icon: '🔑', name: 'שומר המפתחות', desc: '10 תשובות נכונות במיומנות "מפתחות"' },
    { id: 'architect', icon: '🧩', name: 'ארכיטקט נתונים', desc: 'ציון 85 ומעלה בתרגיל ERD' },
    { id: 'traphunter', icon: '🐞', name: 'צייד מלכודות', desc: 'כל שאלות "איתור המלכודת" בעולם 1 נענו נכון' },
    { id: 'devhappy', icon: '🧑‍💻', name: 'המפתח מרוצה', desc: 'סימולציית מפתח עם פחות מ-3 שאלות לכל 1,000 מילים' },
    { id: 'boss', icon: '👑', name: 'מנצח הבוס', desc: 'ניצחון במבחן בוס' },
  ];

  // ---------- State ----------
  function freshState() {
    return {
      version: 1,
      profile: null, // {name, dailyGoalMinutes, createdAt}
      progress: { xp: 0, streak: 0, lastActiveDate: null, badges: [], counters: {}, activity: {} },
      levels: {}, // levelId -> {bestStars, attempts, completedAt}
      review: {}, // questionId -> {correctStreak, addedAt}
      skills: {}, // skillId -> {score, updatedAt, count}
      labs: {}, // exerciseId -> {attempts, best, solutionViewed, submissions:[]}
      devsim: [], // runs
      gaps: [], // {category, source, at}
      checklist: [], // {id,text,skillId,status,source,createdAt,closedAt,category}
      settings: { apiKey: '', aiEnabled: true, theme: 'auto' },
    };
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return freshState();
      const s = JSON.parse(raw);
      const base = freshState();
      return Object.assign(base, s, {
        progress: Object.assign(base.progress, s.progress),
        settings: Object.assign(base.settings, s.settings),
      });
    } catch (e) {
      return freshState();
    }
  }
  SL.state = load();
  SL.save = function () {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(SL.state));
    } catch (e) {
      /* storage unavailable (private mode) - app keeps working in memory */
    }
  };
  SL.resetAll = function () {
    SL.state = freshState();
    SL.save();
  };
  SL.exportProgress = function () {
    const copy = JSON.parse(JSON.stringify(SL.state));
    copy.settings.apiKey = ''; // Game Rule 12
    return JSON.stringify(copy, null, 2);
  };
  SL.importProgress = function (json) {
    const s = JSON.parse(json);
    if (!s || s.version !== 1 || !s.progress) throw new Error('קובץ התקדמות לא תקין');
    const key = SL.state.settings.apiKey;
    SL.state = Object.assign(freshState(), s);
    SL.state.settings.apiKey = key;
    SL.save();
  };

  // ---------- Dates ----------
  SL.today = function (d) {
    const x = d ? new Date(d) : new Date();
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  };
  function dayDiff(a, b) {
    return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / DAY);
  }

  // ---------- Game rules ----------
  // Game Rule 6
  SL.LEVEL_TITLES = [
    [1, 'מתלמד'],
    [3, 'מאפיין צעיר'],
    [5, 'מאפיין'],
    [7, 'מאפיין בכיר'],
    [9, 'ארכיטקט'],
  ];
  SL.levelInfo = function (xp) {
    const level = 1 + Math.floor(Math.sqrt(xp / 50));
    let title = SL.LEVEL_TITLES[0][1];
    for (const [min, t] of SL.LEVEL_TITLES) if (level >= min) title = t;
    const prevXP = 50 * (level - 1) * (level - 1);
    const nextXP = 50 * level * level;
    return { level, title, prevXP, nextXP, pct: Math.round(((xp - prevXP) / (nextXP - prevXP)) * 100) };
  };

  SL.addXP = function (n, reason) {
    if (!n) return;
    const before = SL.levelInfo(SL.state.progress.xp).level;
    SL.state.progress.xp += n;
    const after = SL.levelInfo(SL.state.progress.xp);
    SL.save();
    if (after.level > before) SL.toast('🎉 עלית לרמה ' + after.level + ': ' + after.title, 'good');
    else if (reason) SL.toast('+' + n + ' XP · ' + reason);
    SL.emit('change');
  };

  // Game Rule 7 - call when a level or exercise is completed
  SL.markActivity = function (minutes) {
    const p = SL.state.progress;
    const t = SL.today();
    if (p.lastActiveDate !== t) {
      if (p.lastActiveDate && dayDiff(p.lastActiveDate, t) === 1) p.streak += 1;
      else p.streak = 1;
      p.lastActiveDate = t;
    }
    p.activity[t] = (p.activity[t] || 0) + (minutes || 2);
    if (p.streak >= 7) SL.awardBadge('week');
    SL.save();
    SL.emit('change');
  };
  SL.currentStreak = function () {
    const p = SL.state.progress;
    if (!p.lastActiveDate) return 0;
    return dayDiff(p.lastActiveDate, SL.today()) <= 1 ? p.streak : 0;
  };

  SL.awardBadge = function (id) {
    const b = SL.state.progress.badges;
    if (b.includes(id)) return false;
    b.push(id);
    SL.save();
    const badge = SL.BADGES.find((x) => x.id === id);
    if (badge) SL.toast(badge.icon + ' תג חדש: ' + badge.name, 'good');
    return true;
  };
  SL.bumpCounter = function (key, by) {
    const c = SL.state.progress.counters;
    c[key] = (c[key] || 0) + (by == null ? 1 : by);
    SL.save();
    return c[key];
  };

  // Game Rule 10 - moving average, result 0..100
  SL.recordSkill = function (skillId, result) {
    if (!skillId) return;
    const cur = SL.state.skills[skillId];
    const r = Math.max(0, Math.min(100, Math.round(result)));
    if (!cur) SL.state.skills[skillId] = { score: r, updatedAt: Date.now(), count: 1 };
    else {
      cur.score = Math.round(0.7 * cur.score + 0.3 * r);
      cur.updatedAt = Date.now();
      cur.count = (cur.count || 0) + 1;
    }
    SL.save();
  };
  SL.skillScore = (id) => (SL.state.skills[id] ? SL.state.skills[id].score : null);

  // Game Rule 8
  SL.recordReview = function (questionId, correct) {
    const r = SL.state.review;
    if (!correct) r[questionId] = { correctStreak: 0, addedAt: Date.now() };
    else if (r[questionId]) {
      r[questionId].correctStreak += 1;
      if (r[questionId].correctStreak >= 2) delete r[questionId];
    }
    SL.save();
  };
  SL.reviewIds = () => Object.keys(SL.state.review);

  // ---------- Labs (Game Rule 11, SpecLab BR 8) ----------
  SL.labState = function (exerciseId) {
    return SL.state.labs[exerciseId] || { attempts: 0, best: null, solutionViewed: false, submissions: [] };
  };
  /** Record a graded lab submission. Returns the stored lab state. */
  SL.labSubmit = function (exerciseId, { score, skillId, feedback, skills }) {
    const s = SL.labState(exerciseId);
    s.attempts += 1;
    const firstBest = s.best;
    s.best = s.best == null ? score : Math.max(s.best, score);
    s.submissions.push({ attempt: s.attempts, score, at: Date.now(), feedback: (feedback || []).slice(0, 50) });
    if (s.submissions.length > 10) s.submissions.shift();
    SL.state.labs[exerciseId] = s;
    // skills: either a single skill or a map skillId -> score
    if (skills) Object.keys(skills).forEach((k) => SL.recordSkill(k, skills[k]));
    else if (skillId) SL.recordSkill(skillId, score);
    SL.save();
    const gained = s.solutionViewed ? 0 : Math.max(0, Math.round(score - (firstBest || 0)));
    if (gained > 0) SL.addXP(gained, 'תרגיל במעבדה');
    SL.markActivity(10);
    return s;
  };
  /** BR 8: solution free after 2 submissions; earlier requires confirmation and marks the exercise. */
  SL.labViewSolution = async function (exerciseId) {
    const s = SL.labState(exerciseId);
    if (s.attempts < 2 && !s.solutionViewed) {
      const ok = await SL.confirm('הפתרון נפתח חופשי אחרי שתי הגשות. צפייה עכשיו תסמן את התרגיל "נצפה פתרון" והוא לא יזכה ב-XP. להמשיך?');
      if (!ok) return false;
      s.solutionViewed = true;
      SL.state.labs[exerciseId] = s;
      SL.save();
    }
    return true;
  };

  // ---------- Gaps & checklist (SpecLab BR 16) ----------
  /** Record one submission's gap categories for a given source (e.g. 'devsim', 'interface').
      A category seen in 2 separate submissions within 30 days is added to the checklist.
      An open auto item closes after 3 consecutive submissions (same source) without it. */
  SL.recordGaps = function (source, categories, labelFn) {
    const now = Date.now();
    const st = SL.state;
    const subId = now + Math.random();
    (categories || []).forEach((c) => st.gaps.push({ category: c, source, at: now, sub: subId }));
    st.gaps = st.gaps.filter((g) => now - g.at < 90 * DAY);
    (categories || []).forEach((c) => {
      const subs = new Set(st.gaps.filter((g) => g.category === c && now - g.at <= 30 * DAY).map((g) => g.sub));
      const exists = st.checklist.find((i) => i.category === c && i.status === 'open');
      if (subs.size >= 2 && !exists) {
        st.checklist.push({
          id: 'c' + now + Math.floor(Math.random() * 1000),
          text: labelFn ? labelFn(c) : c,
          category: c,
          skillId: null,
          status: 'open',
          source: 'auto',
          clean: 0,
          createdAt: now,
        });
        SL.toast('📝 נוסף פריט לצ\'קליסט: ' + (labelFn ? labelFn(c) : c));
      }
    });
    st.checklist.forEach((i) => {
      if (i.source !== 'auto' || i.status !== 'open' || !i.category) return;
      if ((categories || []).includes(i.category)) i.clean = 0;
      else if (st.gaps.some((g) => g.category === i.category && g.source === source)) {
        i.clean = (i.clean || 0) + 1;
        if (i.clean >= 3) {
          i.status = 'closed';
          i.closedAt = now;
        }
      }
    });
    SL.save();
  };
  SL.addChecklistItem = function (text, skillId) {
    SL.state.checklist.push({ id: 'm' + Date.now(), text, skillId: skillId || null, status: 'open', source: 'manual', createdAt: Date.now() });
    SL.save();
  };

  // ---------- Events ----------
  const listeners = {};
  SL.on = (ev, fn) => (listeners[ev] = listeners[ev] || []).push(fn);
  SL.emit = (ev, data) => (listeners[ev] || []).forEach((fn) => fn(data));

  // ---------- DOM helpers ----------
  /** h('div', {class:'x', onclick: fn}, child, 'text', [children]) */
  SL.h = function (tag, attrs) {
    const el = document.createElement(tag);
    if (attrs)
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'value') el.value = v;
        else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = !!v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    for (let i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  };
  function append(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach((x) => append(el, x));
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
  SL.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  SL.shuffle = function (arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  /** Technical (LTR) inline span inside Hebrew text */
  SL.code = (t) => SL.h('code', { dir: 'ltr' }, t);

  SL.toast = function (msg, kind) {
    let box = document.getElementById('toasts');
    if (!box) {
      box = SL.h('div', { id: 'toasts', 'aria-live': 'polite' });
      document.body.appendChild(box);
    }
    const t = SL.h('div', { class: 'toast ' + (kind || '') }, msg);
    box.appendChild(t);
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3000);
  };

  /** Modal dialog. content: Node. buttons: [{label, value, primary}] -> Promise(value) */
  SL.modal = function (title, content, buttons) {
    return new Promise((resolve) => {
      const prev = document.activeElement;
      const close = (v) => {
        back.remove();
        document.removeEventListener('keydown', onKey);
        if (prev && prev.focus) prev.focus();
        resolve(v);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') close(undefined);
      };
      const btns = (buttons || [{ label: 'סגור', value: true, primary: true }]).map((b) =>
        SL.h('button', { class: 'btn ' + (b.primary ? 'primary' : 'ghost'), onclick: () => close(b.value) }, b.label)
      );
      const dlg = SL.h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, SL.h('h2', null, title), SL.h('div', { class: 'modal-body' }, content), SL.h('div', { class: 'row end' }, btns));
      const back = SL.h('div', { class: 'modal-back', onclick: (e) => e.target === back && close(undefined) }, dlg);
      document.body.appendChild(back);
      document.addEventListener('keydown', onKey);
      (btns[btns.length - 1] || dlg).focus();
    });
  };
  SL.confirm = (msg) =>
    SL.modal('אישור', SL.h('p', null, msg), [
      { label: 'ביטול', value: false },
      { label: 'אישור', value: true, primary: true },
    ]).then((v) => !!v);

  SL.copyText = function (text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(() => SL.toast('הועתק'));
    const ta = SL.h('textarea', { style: { position: 'fixed', opacity: 0 } });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      SL.toast('הועתק');
    } catch (e) {}
    ta.remove();
    return Promise.resolve();
  };
  SL.download = function (filename, text, type) {
    const a = SL.h('a', { href: URL.createObjectURL(new Blob([text], { type: type || 'text/plain;charset=utf-8' })), download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
  };

  // ---------- Router ----------
  const routes = [];
  /** SL.route('/game/level/:id', (el, params) => {...}) */
  SL.route = function (pattern, render) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
    routes.push({ re, keys, render });
  };
  SL.go = (path) => {
    if (location.hash === '#' + path) SL.render();
    else location.hash = path;
  };
  SL.cleanup = null; // set by a screen to run when leaving it
  SL.render = function () {
    if (typeof SL.cleanup === 'function') {
      try {
        SL.cleanup();
      } catch (e) {}
    }
    SL.cleanup = null;
    const path = (location.hash || '#/').slice(1) || '/';
    const main = document.getElementById('main');
    main.innerHTML = '';
    main.className = '';
    if (!SL.state.profile && path !== '/welcome') return SL.go('/welcome');
    for (const r of routes) {
      const m = path.match(r.re);
      if (m) {
        const params = {};
        r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
        r.render(main, params);
        document.querySelectorAll('.nav a').forEach((a) => {
          const m = a.getAttribute('data-match');
          a.classList.toggle('active', m === '/' ? path === '/' : path.startsWith(m));
        });
        window.scrollTo(0, 0);
        const h = main.querySelector('h1');
        if (h) {
          h.setAttribute('tabindex', '-1');
          h.focus({ preventScroll: true });
        }
        return;
      }
    }
    SL.go('/');
  };

  // ---------- Labs registry (filled by lab modules) ----------
  SL.labs = [];
  /** SL.registerLab({id, icon, title, desc, route, skills:[...] , count: () => 'x/y'}) */
  SL.registerLab = (lab) => SL.labs.push(lab);

  // ---------- AI client (Interface 1) ----------
  // Single HTML file with no bundler, so we call the Messages API with fetch directly.
  SL.ai = {
    model: 'claude-opus-5-5',
    enabled: () => !!(SL.state.settings.apiKey && SL.state.settings.aiEnabled),
    /** Returns parsed JSON matching `schema`. Throws Error with a Hebrew message on failure. */
    async call({ system, prompt, schema, maxTokens, effort }) {
      const key = SL.state.settings.apiKey;
      if (!key) throw new Error('לא הוגדר מפתח API');
      const body = {
        model: SL.ai.model,
        max_tokens: maxTokens || 8000,
        output_config: { effort: effort || 'low' },
        fallbacks: 'default',
        messages: [{ role: 'user', content: prompt }],
      };
      if (system) body.system = system;
      if (schema) body.output_config.format = { type: 'json_schema', schema };
      let res;
      try {
        res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'server-side-fallback-2026-07-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify(body),
        });
      } catch (e) {
        throw new Error('אין חיבור לשרת הבינה המלאכותית');
      }
      if (!res.ok) {
        let msg = 'שגיאה ' + res.status;
        try {
          const j = await res.json();
          if (j.error && j.error.message) msg += ': ' + j.error.message;
        } catch (e) {}
        if (res.status === 401) msg = 'מפתח ה-API לא תקין (401)';
        if (res.status === 429) msg = 'חריגה ממגבלת קריאות, נסו שוב בעוד דקה (429)';
        throw new Error(msg);
      }
      const data = await res.json();
      if (data.stop_reason === 'refusal') throw new Error('הבינה המלאכותית סירבה לבקשה');
      const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
      if (!schema) return text;
      try {
        return JSON.parse(text);
      } catch (e) {
        throw new Error('תשובת הבינה המלאכותית לא הייתה JSON תקין');
      }
    },
  };

  // ---------- "What's next" (Game Rule 9) - game module sets SL.nextGameStep ----------
  SL.whatsNext = function () {
    if (SL.reviewIds().length >= 6) return { label: 'שלב חזרה על טעויות', sub: SL.reviewIds().length + ' שאלות מחכות', path: '/game/review' };
    if (SL.nextGameStep) {
      const n = SL.nextGameStep();
      if (n) return n;
    }
    let low = null;
    SL.labs.forEach((lab) =>
      (lab.skills || []).forEach((sk) => {
        const sc = SL.skillScore(sk);
        const v = sc == null ? -1 : sc;
        if (!low || v < low.v) low = { v, lab, sk };
      })
    );
    if (low) return { label: low.lab.icon + ' ' + low.lab.title, sub: 'המיומנות החלשה ביותר: ' + SL.skillName(low.sk), path: low.lab.route };
    return { label: 'מפת העולמות', sub: '', path: '/game' };
  };
})();
