/* App shell: welcome, home, labs hub, progress, settings, top bar, boot. */
(function () {
  const h = SL.h;

  function stars(n, total) {
    const out = h('span', { class: 'stars', 'aria-label': n + ' מתוך ' + total + ' כוכבים' });
    for (let i = 0; i < total; i++) out.appendChild(h('span', { class: i < n ? '' : 'off' }, '★'));
    return out;
  }
  SL.starsEl = SL.starsEl || stars;

  // ---------- Top bar ----------
  function renderStats() {
    const box = document.getElementById('stats');
    if (!box) return;
    box.innerHTML = '';
    if (!SL.state.profile) return;
    const p = SL.state.progress;
    const li = SL.levelInfo(p.xp);
    box.append(
      h('span', { class: 'stat', title: 'רצף ימים' }, '🔥 ', SL.currentStreak(), h('span', { class: 'stat-label' }, ' ימים')),
      h('span', { class: 'stat', title: 'נקודות ניסיון' }, '⭐ ', p.xp, h('span', { class: 'stat-label' }, ' XP')),
      h('span', { class: 'stat', title: li.title }, '🏅 ', h('span', { class: 'stat-label' }, 'רמה '), li.level)
    );
  }
  SL.on('change', renderStats);

  // ---------- Welcome (screen 1) ----------
  SL.route('/welcome', (el) => {
    if (SL.state.profile) return SL.go('/');
    el.className = 'narrow';
    let goal = 10;
    const name = h('input', { type: 'text', id: 'nm', maxlength: 40, autocomplete: 'nickname', placeholder: 'למשל: תומר' });
    const goals = h(
      'div',
      { class: 'row', role: 'radiogroup', 'aria-label': 'יעד יומי' },
      [5, 10, 20].map((m) =>
        h(
          'button',
          {
            class: 'btn' + (m === goal ? ' primary' : ''),
            role: 'radio',
            'aria-checked': String(m === goal),
            onclick: (e) => {
              goal = m;
              goals.querySelectorAll('button').forEach((b) => {
                const on = b === e.currentTarget;
                b.className = 'btn' + (on ? ' primary' : '');
                b.setAttribute('aria-checked', String(on));
              });
            },
          },
          m + ' דקות'
        )
      )
    );
    const start = () => {
      const n = name.value.trim() || 'מאפיין/ת';
      SL.state.profile = { name: n, dailyGoalMinutes: goal, createdAt: Date.now() };
      SL.save();
      renderStats();
      SL.go('/');
    };
    name.addEventListener('keydown', (e) => e.key === 'Enter' && start());
    el.append(
      h(
        'div',
        { class: 'card stack' },
        h('div', { style: { fontSize: '3rem' } }, '🧩'),
        h('h1', null, 'ברוכים הבאים ל-SpecQuest'),
        h('p', null, 'כאן לומדים לכתוב אפיון טכני שמפתח יכול לבנות ממנו בלי לחזור עם שאלות. יש שני מצבים:'),
        h('ul', null, h('li', null, h('b', null, '🎮 משחק: '), 'סבבים קצרים של שאלות, עם נקודות, לבבות ורצף ימים.'), h('li', null, h('b', null, '🔬 מעבדות: '), 'תרגול מקצועי: ERD, ‏SQL, שדות וממשקים, וסימולציית "המפתח שואל".')),
        h('div', { class: 'field' }, h('label', { for: 'nm' }, 'איך לקרוא לך?'), name),
        h('div', { class: 'field' }, h('label', null, 'כמה זמן ביום?'), goals),
        h('div', { class: 'row end' }, h('button', { class: 'btn primary big', onclick: start }, 'יאללה, מתחילים'))
      )
    );
    setTimeout(() => name.focus(), 50);
  });

  // ---------- Home (screen 2) ----------
  SL.route('/', (el) => {
    const p = SL.state.progress;
    const li = SL.levelInfo(p.xp);
    const today = p.activity[SL.today()] || 0;
    const goal = SL.state.profile.dailyGoalMinutes;
    const next = SL.whatsNext();
    const gs = SL.gameStats ? SL.gameStats() : null;
    const openItems = SL.state.checklist.filter((i) => i.status === 'open').length;

    el.append(
      h('h1', null, 'שלום ' + SL.state.profile.name + ' 👋'),
      h(
        'div',
        { class: 'card' },
        h(
          'div',
          { class: 'level-ring' },
          h('div', { class: 'level-badge', 'aria-hidden': 'true' }, li.level),
          h(
            'div',
            { style: { flex: 1 } },
            h('div', null, h('b', null, 'רמה ' + li.level + ' · ' + li.title)),
            h('div', { class: 'progress', role: 'progressbar', 'aria-valuenow': li.pct, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'התקדמות לרמה הבאה' }, h('div', { style: { width: li.pct + '%' } })),
            h('div', { class: 'muted small' }, p.xp + ' / ' + li.nextXP + ' XP לרמה הבאה')
          )
        ),
        h(
          'div',
          { class: 'kpis', style: { marginTop: '14px' } },
          h('div', { class: 'kpi' }, h('b', null, '🔥 ' + SL.currentStreak()), 'ימים ברצף'),
          h('div', { class: 'kpi' }, h('b', null, Math.min(today, goal) + '/' + goal), 'דקות היום', h('div', { class: 'progress good' }, h('div', { style: { width: Math.min(100, Math.round((today / goal) * 100)) + '%' } }))),
          gs ? h('div', { class: 'kpi' }, h('b', null, '★ ' + gs.starsEarned + '/' + gs.starsTotal), 'כוכבים במשחק') : null,
          h('div', { class: 'kpi' }, h('b', null, '📝 ' + openItems), 'פריטים פתוחים בצ\'קליסט')
        )
      ),
      h(
        'button',
        { class: 'card next-card', style: { width: '100%', font: 'inherit', color: 'inherit', cursor: 'pointer', marginTop: '12px', textAlign: 'start' }, onclick: () => SL.go(next.path) },
        h('div', { style: { fontSize: '2rem' } }, '👉'),
        h('div', { style: { flex: 1 } }, h('div', { class: 'muted small' }, 'מה הלאה?'), h('b', null, next.label), next.sub ? h('div', { class: 'muted small' }, next.sub) : null),
        h('span', { class: 'btn primary' }, 'קדימה')
      ),
      h(
        'div',
        { class: 'hero', style: { marginTop: '12px' } },
        h(
          'button',
          { class: 'card mode-card', onclick: () => SL.go('/game') },
          h('div', { class: 'icon' }, '🎮'),
          h('h2', null, 'מצב משחק'),
          h('p', { class: 'muted' }, '5 עולמות, שלבים של 6 שאלות, 3 לבבות ומבחן בוס. מתאים ל-5 דקות, גם בנייד.')
        ),
        h(
          'button',
          { class: 'card mode-card', onclick: () => SL.go('/labs') },
          h('div', { class: 'icon' }, '🔬'),
          h('h2', null, 'מצב מקצועי'),
          h('p', { class: 'muted' }, 'מעבדת ERD, ארגז חול SQL, שדות וממשקים, וסימולציית "המפתח שואל". מומלץ במחשב.')
        )
      )
    );
  });

  // ---------- Labs hub (screen 6) ----------
  SL.route('/labs', (el) => {
    el.append(
      h('h1', null, '🔬 מעבדות'),
      h('p', { class: 'muted' }, 'תרגול כמו בעבודה. כל הגשה מקבלת ציון ומשוב, ומעדכנת את מפת המיומנויות.'),
      SL.ai.enabled()
        ? h('div', { class: 'notice good small' }, '🤖 משוב בינה מלאכותית פעיל')
        : h('div', { class: 'notice small' }, 'המעבדות עובדות עם בדיקות כללים. ', h('a', { href: '#/settings' }, 'הגדרת מפתח API'), ' מוסיפה משוב בינה מלאכותית.'),
      h(
        'div',
        { class: 'labs-grid', style: { marginTop: '12px' } },
        SL.labs.map((lab) =>
          h(
            'button',
            { class: 'card lab-card', onclick: () => SL.go(lab.route) },
            h('div', { class: 'row between' }, h('span', { class: 'icon' }, lab.icon), lab.count ? h('span', { class: 'tag primary' }, lab.count()) : null),
            h('h2', null, lab.title),
            h('p', { class: 'muted' }, lab.desc),
            h('div', { class: 'row' }, (lab.skills || []).map((s) => h('span', { class: 'tag' }, SL.skillName(s))))
          )
        )
      )
    );
    if (!SL.labs.length) el.append(h('p', null, 'אין מעבדות זמינות.'));
  });

  // ---------- Progress (screen 11) ----------
  function trendSvg(runs) {
    const w = 320, hgt = 90, pad = 10;
    const vals = runs.map((r) => r.per1000);
    const max = Math.max(1, ...vals);
    const pts = vals.map((v, i) => [pad + (i * (w - 2 * pad)) / Math.max(1, vals.length - 1), hgt - pad - (v / max) * (hgt - 2 * pad)]);
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + hgt);
    svg.setAttribute('width', '100%');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'מגמה: ' + vals.map((v) => v.toFixed(1)).join(', '));
    svg.style.direction = 'ltr';
    const line = document.createElementNS(ns, 'polyline');
    line.setAttribute('points', pts.map((p) => p.join(',')).join(' '));
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', 'var(--primary)');
    line.setAttribute('stroke-width', '3');
    svg.appendChild(line);
    pts.forEach((p) => {
      const c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', p[0]);
      c.setAttribute('cy', p[1]);
      c.setAttribute('r', 4);
      c.setAttribute('fill', 'var(--primary)');
      svg.appendChild(c);
    });
    return svg;
  }

  SL.route('/progress', (el) => {
    const st = SL.state;
    const gs = SL.gameStats ? SL.gameStats() : null;
    const skills = h(
      'div',
      null,
      SL.SKILLS.map((s) => {
        const sc = SL.skillScore(s.id);
        return h(
          'div',
          { class: 'skill-bar' },
          h('span', null, s.name, h('span', { class: 'muted small' }, ' · שכבה ' + s.layer)),
          h('div', { class: 'progress' + (sc >= 80 ? ' good' : ''), role: 'progressbar', 'aria-label': s.name, 'aria-valuenow': sc == null ? 0 : sc, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('div', { style: { width: (sc || 0) + '%' } })),
          h('b', { class: 'small' }, sc == null ? '—' : sc)
        );
      })
    );

    const labsDone = Object.keys(st.labs).filter((k) => st.labs[k].attempts > 0);
    const roles = {};
    st.devsim.forEach((r) => (roles[r.role] = roles[r.role] || []).push(r));

    const listBox = h('div');
    function renderChecklist() {
      listBox.innerHTML = '';
      const items = st.checklist.slice().sort((a, b) => (a.status === b.status ? b.createdAt - a.createdAt : a.status === 'open' ? -1 : 1));
      if (!items.length) listBox.append(h('p', { class: 'muted' }, 'הצ\'קליסט ריק. פערים שחוזרים פעמיים בתוך 30 יום בסימולציית המפתח או בכרטיס ממשק נכנסים לכאן אוטומטית.'));
      listBox.append(
        h(
          'ul',
          { class: 'fb-list' },
          items.map((i) =>
            h(
              'li',
              { class: i.status === 'open' ? 'warn' : 'good' },
              h(
                'div',
                { class: 'row' },
                h('input', {
                  type: 'checkbox',
                  checked: i.status === 'closed',
                  'aria-label': 'סגור פריט: ' + i.text,
                  onchange: (e) => {
                    i.status = e.target.checked ? 'closed' : 'open';
                    i.closedAt = e.target.checked ? Date.now() : null;
                    SL.save();
                    renderChecklist();
                  },
                }),
                h('span', { style: { flex: 1, textDecoration: i.status === 'closed' ? 'line-through' : 'none' } }, i.text),
                h('span', { class: 'tag' }, i.source === 'auto' ? 'אוטומטי' : 'ידני'),
                h(
                  'button',
                  {
                    class: 'btn ghost small',
                    'aria-label': 'מחק',
                    onclick: () => {
                      st.checklist = st.checklist.filter((x) => x !== i);
                      SL.save();
                      renderChecklist();
                    },
                  },
                  '✕'
                )
              )
            )
          )
        )
      );
    }
    renderChecklist();
    const newItem = h('input', { type: 'text', placeholder: 'פריט חדש, למשל: לכל ממשק להגדיר מפתח התאמה', style: { flex: 1 }, 'aria-label': 'פריט חדש' });
    const addItem = () => {
      if (!newItem.value.trim()) return;
      SL.addChecklistItem(newItem.value.trim());
      newItem.value = '';
      renderChecklist();
    };
    newItem.addEventListener('keydown', (e) => e.key === 'Enter' && addItem());

    el.append(
      h('h1', null, '📈 התקדמות'),
      h(
        'div',
        { class: 'grid two' },
        h('div', { class: 'card' }, h('h2', { style: { marginTop: 0 } }, 'מפת מיומנויות'), skills, h('p', { class: 'muted small' }, 'ציון 0 עד 100, ממוצע נע של כל התשובות והתרגילים (Game Rule 10).')),
        h(
          'div',
          { class: 'stack' },
          h(
            'div',
            { class: 'card' },
            h('h2', { style: { marginTop: 0 } }, 'סיכום'),
            h(
              'div',
              { class: 'kpis' },
              h('div', { class: 'kpi' }, h('b', null, st.progress.xp), 'XP'),
              gs ? h('div', { class: 'kpi' }, h('b', null, gs.levelsDone + '/' + gs.levelsTotal), 'שלבים במשחק') : null,
              h('div', { class: 'kpi' }, h('b', null, labsDone.length), 'תרגילי מעבדה'),
              h('div', { class: 'kpi' }, h('b', null, st.devsim.length), 'סימולציות מפתח')
            )
          ),
          h(
            'div',
            { class: 'card' },
            h('h2', { style: { marginTop: 0 } }, 'תגים'),
            h(
              'div',
              { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))' } },
              SL.BADGES.map((b) => {
                const has = st.progress.badges.includes(b.id);
                return h('div', { class: 'kpi', style: { opacity: has ? 1 : 0.45 }, title: b.desc }, h('b', { style: { fontSize: '1rem' } }, b.icon + ' ' + b.name), h('span', { class: 'small muted' }, has ? 'הושג' : b.desc));
              })
            )
          )
        )
      ),
      h(
        'div',
        { class: 'card', style: { marginTop: '12px' } },
        h('h2', { style: { marginTop: 0 } }, 'מגמת שאלות המפתח'),
        Object.keys(roles).length
          ? Object.keys(roles).map((role) =>
              h(
                'div',
                { style: { marginBottom: '10px' } },
                h('b', null, role),
                roles[role].length >= 3
                  ? trendSvg(roles[role].slice(-10))
                  : h('p', { class: 'muted small' }, 'המגמה מוצגת מ-3 סימולציות באותו תפקיד (עוד ' + (3 - roles[role].length) + ').')
              )
            )
          : h('p', { class: 'muted' }, 'עוד לא הורצה סימולציית מפתח. ', h('a', { href: '#/lab/devsim' }, 'להרצה ראשונה'))
      ),
      h(
        'div',
        { class: 'card', style: { marginTop: '12px' } },
        h('div', { class: 'row between' }, h('h2', { style: { margin: 0 } }, '📝 צ\'קליסט אישי'), h('button', { class: 'btn small', onclick: () => SL.download('speclab-checklist.txt', st.checklist.map((i) => (i.status === 'open' ? '[ ] ' : '[x] ') + i.text).join('\n')) }, 'ייצוא')),
        h('p', { class: 'muted small' }, 'עברו על הפריטים הפתוחים לפני כל הגשת אפיון.'),
        listBox,
        h('div', { class: 'row', style: { marginTop: '10px' } }, newItem, h('button', { class: 'btn', onclick: addItem }, 'הוספה'))
      )
    );
  });

  // ---------- Settings (screen 12) ----------
  SL.route('/settings', (el) => {
    el.className = 'narrow';
    const s = SL.state.settings;
    const key = h('input', { type: 'password', id: 'apikey', value: s.apiKey, placeholder: 'sk-ant-...', autocomplete: 'off', style: { width: '100%' }, dir: 'ltr' });
    const status = h('div', { class: 'small', 'aria-live': 'polite' });
    const enabled = h('input', { type: 'checkbox', id: 'aien', checked: s.aiEnabled });
    const theme = h(
      'select',
      { id: 'theme' },
      [['auto', 'לפי המערכת'], ['light', 'בהיר'], ['dark', 'כהה']].map(([v, t]) => h('option', { value: v, selected: s.theme === v }, t))
    );
    const saveKey = () => {
      s.apiKey = key.value.trim();
      s.aiEnabled = enabled.checked;
      SL.save();
      SL.toast('נשמר');
    };
    const test = async () => {
      saveKey();
      status.innerHTML = '';
      status.append(h('span', { class: 'spinner' }), ' בודק...');
      try {
        const r = await SL.ai.call({ prompt: 'Reply with {"ok": true}', schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false }, maxTokens: 2000 });
        status.innerHTML = '';
        status.append(h('span', { class: 'good' }, r && r.ok ? '✓ החיבור תקין' : '✓ התקבלה תשובה'));
      } catch (e) {
        status.innerHTML = '';
        status.append(h('span', { class: 'bad' }, '✕ ' + e.message));
      }
    };
    const fileIn = h('input', {
      type: 'file',
      accept: 'application/json,.json',
      class: 'hidden',
      onchange: (e) => {
        const f = e.target.files[0];
        if (!f) return;
        f.text().then((t) => {
          try {
            SL.importProgress(t);
            SL.toast('ההתקדמות יובאה', 'good');
            SL.emit('change');
            SL.go('/');
          } catch (err) {
            SL.toast(err.message);
          }
        });
      },
    });

    el.append(
      h('h1', null, '⚙️ הגדרות'),
      h(
        'div',
        { class: 'card stack' },
        h('h2', { style: { marginTop: 0 } }, '🤖 משוב בינה מלאכותית (אופציונלי)'),
        h('p', { class: 'muted small' }, 'בלי מפתח, כל המעבדות עובדות עם בדיקות כללים. עם מפתח Anthropic API מתווספים: שאלות מפתח חכמות, משוב על כרטיס ממשק והתאמת שמות ישויות. החיוב לפי השימוש, בחשבון שלך.'),
        h('div', { class: 'field' }, h('label', { for: 'apikey' }, 'מפתח Anthropic API'), key, h('span', { class: 'hint' }, 'נשמר רק בדפדפן הזה ונשלח רק ל-api.anthropic.com. לא נכלל בייצוא ההתקדמות. כל מי שמשתמש במחשב הזה יכול לגשת אליו.')),
        h('label', { class: 'row', for: 'aien' }, enabled, 'להשתמש בבינה מלאכותית כשיש מפתח'),
        h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: saveKey }, 'שמירה'), h('button', { class: 'btn', onclick: test }, 'בדיקת חיבור'), h('button', { class: 'btn ghost', onclick: () => { key.value = ''; saveKey(); } }, 'מחיקת מפתח')),
        status
      ),
      h(
        'div',
        { class: 'card stack' },
        h('h2', { style: { marginTop: 0 } }, 'תצוגה'),
        h('div', { class: 'field' }, h('label', { for: 'theme' }, 'ערכת צבעים'), theme),
        h('div', { class: 'field' }, h('label', null, 'יעד יומי'), h('select', { onchange: (e) => { SL.state.profile.dailyGoalMinutes = +e.target.value; SL.save(); } }, [5, 10, 20, 30].map((m) => h('option', { value: m, selected: SL.state.profile.dailyGoalMinutes === m }, m + ' דקות'))))
      ),
      h(
        'div',
        { class: 'card stack' },
        h('h2', { style: { marginTop: 0 } }, 'נתונים'),
        h('p', { class: 'muted small' }, 'ההתקדמות נשמרת בדפדפן בלבד. כדאי לייצא גיבוי מדי פעם, או כדי לעבור למחשב אחר.'),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn', onclick: () => SL.download('speclab-progress-' + SL.today() + '.json', SL.exportProgress(), 'application/json') }, '⬇️ ייצוא התקדמות'),
          h('button', { class: 'btn', onclick: () => fileIn.click() }, '⬆️ ייבוא התקדמות'),
          fileIn,
          h(
            'button',
            {
              class: 'btn danger',
              onclick: async () => {
                if (await SL.confirm('למחוק את כל ההתקדמות, ההגשות והצ\'קליסט? אי אפשר לבטל.')) {
                  SL.resetAll();
                  applyTheme();
                  renderStats();
                  SL.go('/welcome');
                }
              },
            },
            'איפוס הכל'
          )
        )
      )
    );
    theme.addEventListener('change', () => {
      s.theme = theme.value;
      SL.save();
      applyTheme();
    });
  });

  function applyTheme() {
    const t = SL.state.settings.theme;
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }

  // ---------- Boot ----------
  function boot() {
    applyTheme();
    renderStats();
    window.addEventListener('hashchange', SL.render);
    SL.render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
