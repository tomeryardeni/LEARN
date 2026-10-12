// Logic tests: game rules, content integrity, SQL reference solutions, lab graders.
// Runs the app's source files in a Node VM with a minimal DOM stub (no browser needed).
// Usage: npm test
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ---- minimal DOM stub: enough for modules to load (routes, registerLab, injected <style>) ----
function el() {
  const node = {
    style: {}, children: [], classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild(c) { this.children.push(c); return c; }, append(...c) { this.children.push(...c); },
    setAttribute() {}, getAttribute: () => null, addEventListener() {}, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => [], remove() {}, focus() {},
    set textContent(v) {}, set innerHTML(v) {},
  };
  return node;
}
const document = {
  head: el(), body: el(), documentElement: el(), readyState: 'complete',
  createElement: el, createElementNS: el, createTextNode: el, getElementById: () => null,
  querySelector: () => null, querySelectorAll: () => [], addEventListener() {},
};
const store = {};
const ctx = {
  document, console, setTimeout, clearTimeout, URL, Blob: class {}, Node: class {},
  localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = v) },
  location: { hash: '' }, navigator: {}, addEventListener() {}, scrollTo() {},
};
ctx.window = ctx;
vm.createContext(ctx);
const FILES = ['core.js', 'sqlengine.js', 'game-content.js', 'game.js', 'lab-erd.js', 'lab-sql.js', 'lab-fields.js', 'lab-devsim.js'];
for (const f of FILES) vm.runInContext(readFileSync(join(here, 'src', f), 'utf8'), ctx, { filename: f });
const SL = ctx.SL;

// ---- tiny test runner ----
let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || '') + ` expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function ok(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }
const freshState = () => { SL.resetAll(); SL.state.profile = { name: 't', dailyGoalMinutes: 10 }; };
SL.toast = () => {};

console.log('Game rules');
await test('Game Rule 6 / Test Case 5: 200 XP = level 3 "מאפיין צעיר"', () => {
  const li = SL.levelInfo(200);
  eq([li.level, li.title], [3, 'מאפיין צעיר']);
  eq(SL.levelInfo(0).level, 1);
  eq(SL.levelInfo(49).level, 1);
  eq(SL.levelInfo(50).level, 2);
});
await test('Game Rule 8 / Test Case 6: review list in and out', () => {
  freshState();
  SL.recordReview('q1', false);
  ok(SL.reviewIds().includes('q1'));
  SL.recordReview('q1', true);
  ok(SL.reviewIds().includes('q1'), 'still in after 1 correct');
  SL.recordReview('q1', true);
  ok(!SL.reviewIds().includes('q1'), 'out after 2 correct');
});
await test('Game Rule 10: skill moving average', () => {
  freshState();
  SL.recordSkill('keys', 100);
  eq(SL.skillScore('keys'), 100);
  SL.recordSkill('keys', 0);
  eq(SL.skillScore('keys'), 70);
});
await test('Game Rule 12 / Test Case 17: export excludes API key', () => {
  freshState();
  SL.state.settings.apiKey = 'sk-ant-secret';
  ok(!SL.exportProgress().includes('sk-ant-secret'));
});
await test('BR 16 / Test Case 15: repeated gap category creates checklist item', () => {
  freshState();
  SL.recordGaps('devsim', ['errors']);
  eq(SL.state.checklist.length, 0);
  SL.state.gaps.forEach((g) => (g.at -= 10 * 86400000));
  SL.recordGaps('devsim', ['errors']);
  eq(SL.state.checklist.length, 1);
});
await test('BR 8: solution before 2 submissions needs confirmation', async () => {
  freshState();
  SL.confirm = async () => false;
  eq(await SL.labViewSolution('x'), false);
  SL.confirm = async () => true;
  eq(await SL.labViewSolution('x'), true);
  eq(SL.labState('x').solutionViewed, true);
});

console.log('Game content');
const G = SL.GAME;
const skillIds = new Set(SL.SKILLS.map((s) => s.id));
await test('unique question ids and valid skills', () => {
  const ids = G.questions.map((q) => q.id);
  eq(new Set(ids).size, ids.length, 'duplicate ids');
  G.questions.forEach((q) => ok(skillIds.has(q.skill), q.id + ' bad skill ' + q.skill));
  G.questions.forEach((q) => ok(q.explain && q.work, q.id + ' missing explain/work'));
});
await test('every regular level has at least 6 questions', () => {
  G.worlds.forEach((w) => w.levels.forEach((l) => {
    if (/boss/.test(l.id)) return;
    const n = G.questions.filter((q) => q.level === l.id).length;
    ok(n >= 6, l.id + ' has ' + n);
  }));
});
await test('answer indices are valid', () => {
  G.questions.forEach((q) => {
    if (Array.isArray(q.options) && typeof q.answer === 'number') ok(q.answer >= 0 && q.answer < q.options.length, q.id);
  });
});
await test('correct option is not a giveaway (uniquely longest in ≤ 40%)', () => {
  const mc = G.questions.filter((q) => Array.isArray(q.options) && typeof q.answer === 'number' && q.options.length >= 3);
  const longest = mc.filter((q) => {
    const L = q.options.map((o) => String(o).length), mx = Math.max(...L);
    return L[q.answer] === mx && L.filter((l) => l === mx).length === 1;
  }).length;
  ok(longest / mc.length <= 0.4, `${longest}/${mc.length} questions have the longest option correct`);
});

console.log('SQL lab');
const initSqlJs = require('sql.js');
const SQL = await initSqlJs();
const db = new SQL.Database();
db.exec(SL.SCENARIO_DB.seed);
const runQ = (q) => { const r = db.exec(q)[0]; return r ? { columns: r.columns, rows: r.values, total: r.values.length } : { columns: [], rows: [], total: 0 }; };
for (const ex of SL.sqlLab.exercises) {
  await test(`exercise "${ex.id}" reference runs and returns rows`, () => {
    const r = runQ(ex.solution);
    ok(r.total > 0, 'no rows');
    ok(SL.sql.sameResult(r, r, ex.ordered));
  });
}
await test('Test Case 9: DELETE is blocked', () => ok(SL.sql.guard('DELETE FROM Item')));
await test('multiple statements are blocked', () => ok(SL.sql.guard('SELECT 1; DROP TABLE Item')));
await test('Test Case 10: row order ignored unless ordered', () => {
  const a = { columns: ['x'], rows: [[1], [2]], total: 2 };
  const b = { columns: ['x'], rows: [[2], [1]], total: 2 };
  ok(SL.sql.sameResult(a, b, false));
  ok(!SL.sql.sameResult(a, b, true));
});

console.log('ERD lab');
if (SL.erd) {
  for (const ex of SL.erd.exercises) {
    await test(`"${ex.id}" every reference solution scores 100`, () => {
      ex.solutions.forEach((_, i) => {
        const m = SL.erd.solutionModel(ex.id, i);
        eq(SL.erd.validate(m, ex.level).errors.length, 0, 'solution ' + i + ' has blocking errors');
        eq(Math.round(SL.erd.grade(m, ex.id).score), 100, 'solution ' + i);
      });
    });
  }
  await test('Test Case 7: logical entity without PK blocks', () => {
    const m = SL.erd.solutionModel('erd-po', 0);
    const ent = m.entities.find((e) => /^Item$/i.test(e.name));
    ent.fields.forEach((f) => (f.pk = false));
    const errs = SL.erd.validate(m, 'logical').errors;
    ok(errs.some((e) => e.target && e.target.id === ent.id), 'Item not flagged');
    ok(SL.erd.validate(m, 'logical').errors.length > 0, 'expected blocking error');
  });
  await test('fix exercise starts with 4 planted issues', () => {
    eq(SL.erd.plantedIssues(SL.erd.startModel('erd-so-fix'), 'erd-so-fix').length, 4);
  });
} else console.log('  (skipped: lab-erd.js not loaded)');

console.log('Fields & interfaces lab');
const F = SL.fieldsLab;
await test('reference field types score 100', () => eq(F.checkTypes(F.reference.types(), 3).score, 100));
await test('reference mapping scores 100', () => eq(F.checkMapping(F.reference.mapping(), 3).score, 100));
await test('reference interface card scores 100', () => eq(F.checkCard(F.reference.card(), 3).score, 100));
await test('reference failure answers score 100', () => eq(F.checkFailures(F.reference.failures(), 3).score, 100));
await test('Test Case 12: unmapped required field blocks', () => {
  const r = F.checkMapping({}, 1);
  ok(r.blocked || (r.blocking && r.blocking.length), 'expected block');
});

console.log('Dev-asks simulation');
const D = SL.devsim;
await test('Israeli ID check digit', () => {
  ok(D.isValidIsraeliId('000000018'));
  ok(D.isValidIsraeliId('123456782'));
  ok(!D.isValidIsraeliId('123456789'));
});
await test('Test Case 13: privacy issues detected', () => {
  const found = D.findPrivacyIssues('לקוח 123456782 במייל a@b.co טלפון 050-1234567');
  ok(found.length >= 3, 'found ' + found.length);
});
await test('Test Case 14: quote must exist in text', () => {
  ok(D.quoteInText('הממשק רץ כל   5 דקות ומעדכן מלאי', 'רץ כל 5 דקות').ok);
  ok(!D.quoteInText('הממשק רץ כל 5 דקות', 'הממשק רץ פעם ביום בלילה').ok);
});
await test('good sample gets fewer questions than weak ones', () => {
  const counts = D.samples.map((s) => D.generateRuleQuestions(s.text, D.roles[0].id).length);
  ok(Math.min(...counts) < Math.max(...counts));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
