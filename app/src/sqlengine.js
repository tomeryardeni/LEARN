/* SQL engine: sql.js (SQLite in WebAssembly) running inside a Web Worker so a runaway
   query can be stopped after 5 seconds (SpecLab BR 11). The build inlines the sql.js
   source and wasm binary into window.__SQLJS_SRC / window.__SQLJS_WASM_B64. */
(function () {
  const TIMEOUT_MS = 5000;
  const MAX_ROWS = 1000;
  let worker = null;
  let workerUrl = null;
  let loadedSeed = null;
  let seq = 0;
  const pending = new Map();

  function wasmBytes() {
    const bin = atob(window.__SQLJS_WASM_B64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function workerSource() {
    return (
      window.__SQLJS_SRC +
      '\n;(function(){var SQLp=null,db=null;' +
      'self.onmessage=function(e){var m=e.data;' +
      'if(m.type==="init"){SQLp=initSqlJs({wasmBinary:m.wasm});SQLp.then(function(SQL){db=new SQL.Database();db.exec(m.seed);db.exec("PRAGMA query_only=1");self.postMessage({id:m.id,ok:true})})["catch"](function(err){self.postMessage({id:m.id,ok:false,error:String(err&&err.message||err)})});return}' +
      'if(m.type==="exec"){try{var t0=Date.now();var stmt=db.prepare(m.sql);var cols=stmt.getColumnNames();var rows=[];var total=0;while(stmt.step()){total++;if(rows.length<' + MAX_ROWS + ')rows.push(stmt.get())}stmt.free();self.postMessage({id:m.id,ok:true,columns:cols,rows:rows,total:total,ms:Date.now()-t0})}catch(err){self.postMessage({id:m.id,ok:false,error:String(err&&err.message||err)})}}' +
      '}})();'
    );
  }

  function post(msg) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      msg.id = id;
      pending.set(id, { resolve, reject });
      worker.postMessage(msg);
    });
  }

  function kill() {
    if (worker) worker.terminate();
    worker = null;
    loadedSeed = null;
    pending.forEach((p) => p.reject(new Error('stopped')));
    pending.clear();
  }

  async function ensure(seed) {
    if (worker && loadedSeed === seed) return;
    kill();
    if (!workerUrl) workerUrl = URL.createObjectURL(new Blob([workerSource()], { type: 'text/javascript' }));
    worker = new Worker(workerUrl);
    worker.onmessage = (e) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      e.data.ok ? p.resolve(e.data) : p.reject(new Error(e.data.error));
    };
    await post({ type: 'init', seed, wasm: wasmBytes() });
    loadedSeed = seed;
  }

  /** Only a single read-only statement is allowed (SpecLab BR 11). Returns an error message or null. */
  function guard(sql) {
    const stripped = sql
      .replace(/--[^\n]*/g, ' ')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/'(?:[^']|'')*'/g, "''")
      .trim()
      .replace(/;\s*$/, '');
    if (!stripped) return 'השאילתה ריקה';
    if (stripped.includes(';')) return 'אפשר להריץ שאילתה אחת בכל פעם';
    if (!/^(select|with)\b/i.test(stripped)) return 'בארגז החול מותרות רק שאילתות שליפה (SELECT). פקודות שמשנות נתונים או מבנה נחסמות';
    if (/\b(insert|update|delete|drop|alter|create|replace|attach|detach|pragma|vacuum|reindex)\b/i.test(stripped))
      return 'השאילתה כוללת פקודה שמשנה נתונים או מבנה, והיא נחסמה';
    return null;
  }

  SL.sql = {
    MAX_ROWS,
    TIMEOUT_MS,
    guard,
    /** Run a read-only query against a database built from `seed`.
        Resolves {columns, rows, total, ms} or rejects with Error(hebrew message). */
    async run(seed, sql) {
      const blocked = guard(sql);
      if (blocked) throw new Error(blocked);
      await ensure(seed);
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error('השאילתה רצה יותר מ-5 שניות ונעצרה'));
          kill();
        }, TIMEOUT_MS);
      });
      try {
        return await Promise.race([post({ type: 'exec', sql }), timeout]);
      } finally {
        clearTimeout(timer);
      }
    },
    /** BR 12: same values, same column & row count; order only if `ordered`. */
    sameResult(a, b, ordered) {
      if (!a || !b) return false;
      if (a.columns.length !== b.columns.length || a.total !== b.total) return false;
      const norm = (v) => (v == null ? '∅' : typeof v === 'number' ? String(Math.round(v * 1e6) / 1e6) : String(v));
      const key = (r) => r.map(norm).join('\u0001');
      const ka = a.rows.map(key);
      const kb = b.rows.map(key);
      if (!ordered) {
        ka.sort();
        kb.sort();
      }
      return ka.every((k, i) => k === kb[i]);
    },
  };
})();
