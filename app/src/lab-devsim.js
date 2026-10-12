/* SpecQuest lab: "המפתח שואל" - developer questions simulation (SpecQuest spec §6.8,
   SpecLab BR 16, 17, 18, 23). Rule engine works offline; AI is optional. */
(function () {
  const h = SL.h;

  // ---------- Roles & categories ----------
  const ROLES = [
    { id: 'junior', name: 'מפתח מתחיל', icon: '🌱', focus: 'מה בדיוק לבנות: שדות, מסכים וסדר פעולות' },
    { id: 'senior', name: 'מפתח בכיר', icon: '🦉', focus: 'מקרי קצה, ביצועים ותלות בין רכיבים' },
    { id: 'qa', name: 'בודק QA', icon: '🔍', focus: 'האם כל דרישה ניתנת לבדיקה, ומה התוצאה הצפויה' },
    { id: 'security', name: 'איש אבטחת מידע', icon: '🛡️', focus: 'הרשאות, נתונים רגישים ושמירת פרטי גישה' },
  ];
  const roleOf = (id) => ROLES.find((r) => r.id === id) || ROLES[0];

  const CATS = [
    { id: 'data', short: 'סוג, אורך, חובה ומפתח לכל שדה', name: 'נתונים', tip: 'לכל שדה: סוג, אורך או דיוק, חובה או רשות, מפתח ייחודי, יחידות ופורמט תאריך.' },
    { id: 'interfaces', short: 'פורמט, טריגר, ערוץ ומיפוי לכל ממשק', name: 'ממשקים', tip: 'לכל ממשק: פורמט וקידוד, ערוץ (API, SFTP), טריגר ותדירות, מיפוי שדות, אישור קליטה וטיפול בכפילויות.' },
    { id: 'rules', short: 'נוסחאות, מעברי סטטוס, מקרי קצה ודוגמה', name: 'כללים עסקיים', tip: 'נוסחאות עם שמות שדות, מעברי סטטוס, בדיקות תקינות, מקרי קצה ודוגמה עם תוצאה צפויה.' },
    { id: 'errors', short: 'טיפול בכשל, ניסיון חוזר והתראה', name: 'שגיאות וחריגים', tip: 'לכל כשל: מה קורה (דחייה, ניסיון חוזר), מי מקבל התראה, ואיך מתקנים ושולחים מחדש.' },
    { id: 'permissions', short: 'מי רשאי לעשות מה ואיפה נשמרים פרטי גישה', name: 'הרשאות', tip: 'מי צופה, עורך ומאשר; הרשאה ברמת שורה; איפה נשמרים פרטי גישה; יומן ביקורת.' },
    { id: 'performance', short: 'נפח וזמני תגובה במספרים', name: 'ביצועים ונפח', tip: 'נפח רגיל ובשיא במספרים, זמן תגובה או חלון זמן, וגידול צפוי.' },
    { id: 'ambiguity', short: 'שאין מילים עמומות כמו "מהר" או "בהתאם לצורך"', name: 'ניסוח עמום', tip: 'החליפו מילים כמו "מהר", "וכו\'", "בהתאם לצורך" במספר, ברשימה סגורה או בכלל.' },
  ];
  const catName = (id) => (CATS.find((c) => c.id === id) || { name: id }).name;
  const checklistLabel = (id) => {
    const c = CATS.find((x) => x.id === id);
    return c ? 'לפני הגשת אפיון: לבדוק ' + c.short + ' (פער חוזר ב"המפתח שואל": ' + c.name + ')' : id;
  };

  // How much each role cares about each category (ordering and selection).
  const WEIGHTS = {
    junior: { data: 3, interfaces: 2, rules: 2.5, ambiguity: 2, errors: 1.5, permissions: 1, performance: 1 },
    senior: { performance: 3, errors: 3, interfaces: 2.5, rules: 2, data: 1.5, permissions: 1, ambiguity: 1 },
    qa: { rules: 3, ambiguity: 2.5, errors: 2, data: 2, performance: 1.5, permissions: 1, interfaces: 1.2 },
    security: { permissions: 3, data: 2, interfaces: 2, errors: 1.5, ambiguity: 0.5, rules: 0.5, performance: 0.5 },
  };
  const AMBIG_CAP = { junior: 3, senior: 2, qa: 4, security: 1 };
  const MAX_Q = 15;

  // ---------- Text helpers ----------
  const HE = '\\u0590-\\u05FF';
  function wordCount(text) {
    const t = String(text || '').trim();
    return t ? t.split(/\s+/).filter(Boolean).length : 0;
  }
  function sentences(text) {
    return String(text || '')
      .split(/\n+|(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 2);
  }
  const clip = (s, n) => (s.length > (n || 140) ? s.slice(0, (n || 140) - 1) + '…' : s);
  function normalize(s) {
    return String(s || '')
      .replace(/[״“”„]/g, '"')
      .replace(/[׳‘’`]/g, "'")
      .replace(/[‎‏‪-‮]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }
  /** BR 17: is the quoted text really in the spec? */
  function quoteInText(text, quote) {
    const q = normalize(quote).replace(/^["']+|["']+$/g, '').trim();
    if (q.length < 8) return { ok: false, reason: 'short', message: 'הציטוט קצר מדי. הדביקו לפחות 8 תווים מתוך האפיון.' };
    if (normalize(text).includes(q)) return { ok: true, reason: 'found', message: 'הציטוט נמצא באפיון.' };
    return { ok: false, reason: 'missing', message: 'הציטוט לא נמצא בטקסט האפיון. ייתכן שהתשובה נמצאת רק בראש שלכם, או שהציטוט נוסח מחדש. העתיקו את המשפט כפי שהוא מופיע.' };
  }

  // ---------- Privacy check (BR 23) ----------
  function isValidIsraeliId(str) {
    const s = String(str || '').trim();
    if (!/^\d{5,9}$/.test(s)) return false;
    const id = s.padStart(9, '0');
    if (/^0+$/.test(id)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      let d = Number(id[i]) * ((i % 2) + 1);
      if (d > 9) d -= 9;
      sum += d;
    }
    return sum % 10 === 0;
  }
  function findPrivacyIssues(text) {
    const t = String(text || '');
    const out = [];
    const taken = [];
    const overlaps = (a, b) => taken.some(([x, y]) => a < y && b > x);
    const add = (type, value, index) => {
      const end = index + value.length;
      if (overlaps(index, end)) return;
      taken.push([index, end]);
      out.push({
        type,
        label: { id: 'מספר שנראה כתעודת זהות', email: 'כתובת מייל', phone: 'מספר טלפון' }[type],
        value,
        index,
        before: t.slice(Math.max(0, index - 30), index),
        after: t.slice(end, end + 30),
      });
    };
    let m;
    const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
    while ((m = email.exec(t))) add('email', m[0], m.index);
    const phone = /(?<![\d+])(?:\+972[-\s]?|0)(?:5\d|7\d|[2-489])[-\s]?\d{3}[-\s]?\d{4}(?!\d)/g;
    while ((m = phone.exec(t))) add('phone', m[0], m.index);
    const ids = /(?<!\d)\d{8,9}(?!\d)/g;
    while ((m = ids.exec(t))) if (isValidIsraeliId(m[0])) add('id', m[0], m.index);
    return out.sort((a, b) => a.index - b.index);
  }
  function maskPrivacy(text, issues) {
    let t = text;
    issues
      .slice()
      .sort((a, b) => b.index - a.index)
      .forEach((i) => {
        const mask = i.type === 'email' ? 'user@example.com' : i.value.replace(/\d/g, 'X');
        t = t.slice(0, i.index) + mask + t.slice(i.index + i.value.length);
      });
    return t;
  }

  // ---------- Context extraction (concrete terms for the questions) ----------
  const INTERFACE_RE = /ממשק|\bAPI\b|קובץ|\bERP\b|\bWMS\b|\bCRM\b|ספק|מערכת חיצונית|סנכרון|integration|SFTP|webhook|ייבוא|import|נלקח(ות|ים)? ממערכת/i;
  const STOP_IDS = new Set(['API', 'CSV', 'JSON', 'XML', 'ERP', 'WMS', 'CRM', 'SFTP', 'HTTPS', 'HTTP', 'REST', 'UTF', 'SQL', 'ISO', 'UTC', 'SLA', 'PDF', 'URL', 'ID', 'PK', 'FK', 'TLS', 'OAuth', 'Excel', 'JavaScript']);
  function firstMatch(text, re, group) {
    const m = text.match(re);
    return m ? m[group || 0] : null;
  }
  function extractContext(text) {
    const t = String(text || '');
    const sents = sentences(t);
    const camel = (t.match(/\b[A-Z][a-z]+(?:[A-Z][a-z0-9]*)+\b/g) || []).filter((w) => !STOP_IDS.has(w));
    const snake = (t.match(/\b[a-z]+(?:_[a-z0-9]+)+\b/g) || []);
    const heEntity = firstMatch(t, new RegExp('(?:טבלת|ישות|רשומת)\\s+([' + HE + '"\']{3,})'), 1);
    const isReportT = /דוח|report|דשבורד/i.test(t);
    const entity = camel[0] || (heEntity ? 'טבלת "' + heEntity + '"' : null) || (isReportT ? 'שורת הדוח' : 'הרשומה');
    const fields = Array.from(new Set(camel.slice(1).concat(snake))).slice(0, 3);
    const system = firstMatch(t, /\b(ERP|WMS|CRM|SAP|Priority|BI)\b/) || (/ספק/.test(t) ? 'הספק' : 'המערכת החיצונית');
    let channel = 'הממשק';
    if (/קובץ|CSV/.test(t)) channel = 'הקובץ';
    else if (/\bAPI\b|webhook/i.test(t)) channel = 'קריאת ה-API';
    else if (/סנכרון/.test(t)) channel = 'הסנכרון';
    else if (/דוח|report/i.test(t)) channel = system !== 'המערכת החיצונית' && system !== 'הספק' ? 'שליפת הנתונים מה-' + system : 'טעינת הדוח';
    const amount = firstMatch(t, new RegExp('(?:^|[\\s"(])ה?((?:מחיר|סכום|כמות|יעד|אחוז)[' + HE + ']*)'), 1) || null;
    const dateTerm = firstMatch(t, new RegExp('תאריך(?:\\s+[' + HE + ']+)?')) || 'התאריך';
    const calcTerm = (() => {
      const s = sents.find((x) => /מחושב|חישוב|נוסחה|ביחס ל/.test(x));
      const m = s && s.match(new RegExp('([' + HE + '"\']+(?:\\s+[' + HE + '"\']+)?)\\s+(?:מחושב|יחושב)'));
      return m ? '"' + m[1] + '"' : amount ? '"' + amount + '"' : 'החישוב';
    })();
    const statuses = [];
    const stRe = /סטטוס\s+["“״]([^"”״]{2,20})["”״]/g;
    let sm;
    while ((sm = stRe.exec(t))) if (!statuses.includes(sm[1])) statuses.push(sm[1]);
    const volumeNoun = firstMatch(t, new RegExp('(הזמנות|שורות|רשומות|פריטים|מק"טים|מק״טים|עסקאות|קבצים|בקשות)')) || (/דוח/.test(t) ? 'רשומות מכירה' : 'רשומות');
    const sensitive = firstMatch(t, new RegExp('(שם|טלפון|מייל|כתובת|תעודת זהות|שכר|מחיר[' + HE + ']*|אנשי מכירות|לקוח[' + HE + ']*|עובד[' + HE + ']*|ספק[' + HE + ']*)'));
    const isReport = /דוח|report|דשבורד/i.test(t);
    const isInterface = INTERFACE_RE.test(t);
    const scopeTerm = /צוות/.test(t) ? 'הצוות' : /אזור/.test(t) ? 'האזור' : /סניף/.test(t) ? 'הסניף' : 'הנתונים';
    const edge = [];
    if (amount) edge.push(amount + ' אפס או שלילי');
    if (isInterface && /קובץ|CSV/.test(t)) edge.push('קובץ ריק');
    if (/מק"ט|מק״ט|פריט/.test(t)) edge.push('מק"ט שלא קיים אצלנו');
    if (isReport) edge.push('תקופה בלי נתונים');
    if (/יעד/.test(t)) edge.push('יעד שלא הוזן');
    if (!edge.length) edge.push('ערך חסר', 'ערך בגבול הטווח');
    return { sents, entity, inE: prep(entity, 'ב'), toE: prep(entity, 'ל'), fields, system, channel, amount, dateTerm, calcTerm, statuses, volumeNoun, sensitive, isReport, isInterface, scopeTerm, edge: edge.slice(0, 3) };
  }
  /** Hebrew preposition before a term: ב-PurchaseOrder, ברשומה, בשורת הדוח */
  function prep(term, p) {
    if (/^[A-Za-z]/.test(term)) return p + '-' + term;
    if (term[0] === 'ה' && p !== 'ש') return p + term.slice(1);
    return p + term;
  }
  function sentenceFor(ctx, re) {
    const s = ctx.sents.find((x) => re.test(x));
    return s ? clip(s, 120) : null;
  }

  // ---------- Rule bank ----------
  // when: question applies only if text matches; has: answer detected if text matches; roles: phrasing per role.
  const BANK = [
    // נתונים
    {
      id: 'd_fields', cat: 'data', prio: 3,
      has: /VARCHAR|NVARCHAR|CHAR\(|DECIMAL|NUMERIC|\bINT(EGER)?\b|BIGINT|\bDATE(TIME)?\b|BOOLEAN|\bBIT\b|סוג (ה)?(שדה|נתון)|טיפוס|אורך|\d+\s*(תווים|ספרות)/i,
      miss: 'לא נמצאו סוגי שדות או אורכים (למשל VARCHAR, DECIMAL, "אורך").',
      roles: {
        junior: (c) => `אילו שדות בדיוק יש ${c.inE}${c.fields.length ? ' (ראיתי ' + c.fields.join(', ') + ')' : ''}, ומה הסוג והאורך של כל אחד? בלי זה אני לא יודע איך להגדיר את הטבלה.`,
        senior: (c) => `מה סוגי הנתונים והדיוק של השדות ${c.inE}?${c.amount ? ` למשל "${c.amount}": כמה ספרות אחרי הנקודה?` : ''}`,
        qa: (c) => `מה הערכים התקינים לכל שדה ${c.inE} (סוג, אורך, טווח)? אני צריך את זה כדי לכתוב בדיקות של קלט לא תקין.`,
      },
    },
    {
      id: 'd_key', cat: 'data', prio: 2.5,
      has: /מפתח (ראשי|ייחודי|זר)|\bPK\b|\bFK\b|primary key|foreign key|ייחודי|unique|ייחודיות/i,
      miss: 'לא נמצא מפתח או שדה ייחודי (PK, "מזהה ייחודי").',
      roles: {
        junior: (c) => `מה המפתח של ${c.entity}? איזה שדה מזהה רשומה באופן ייחודי?`,
        senior: (c) => `מה מזהה את ${c.entity} באופן ייחודי, ואיך מזהים כפילות? מפתח טבעי מהמקור או מזהה פנימי?`,
        qa: (c) => `לפי מה אבדוק שאותה רשומה לא נשמרת פעמיים ${c.inE}? מה השדה הייחודי?`,
      },
    },
    {
      id: 'd_required', cat: 'data', prio: 2,
      has: /חובה|mandatory|required|NOT NULL|\bNULL\b|רשות|אופציונלי|optional|(שדה|ערך) ריק|ריקים/i,
      miss: 'לא צוין אילו שדות חובה ואילו רשות.',
      roles: {
        junior: (c) => `אילו שדות ${c.inE} הם חובה ואילו אפשר להשאיר ריקים? מה ברירת המחדל?`,
        qa: () => 'מה התוצאה הצפויה כששדה חובה מגיע ריק? ואילו שדות בכלל חובה?',
      },
    },
    {
      id: 'd_units', cat: 'data', prio: 1.5,
      when: /מחיר|סכום|כמות|price|amount|qty|quantity|מכירות|יעד/i,
      has: /מטבע|currency|₪|ש"ח|ש״ח|\bUSD\b|\bILS\b|עיגול|מעוגל|round|יחידת (ה)?מידה|יחידות|ספרות אחרי|DECIMAL\(\d+,\s*\d+\)/i,
      miss: 'יש סכומים או כמויות, אבל לא צוינו מטבע, יחידת מידה או עיגול.',
      roles: {
        junior: (c) => `באיזו יחידה ובאיזה מטבע נשמר "${c.amount || 'הסכום'}"? יש כלל עיגול?`,
        senior: (c) => `"${c.amount || 'הסכום'}": באיזה מטבע ויחידת מידה, ומה כלל העיגול? אי-התאמה ביחידות היא באג קלאסי בממשקים.`,
        qa: (c) => `מה התוצאה הצפויה כש"${c.amount || 'הסכום'}" כולל שברים? לאיזה דיוק לעגל כדי לדעת אם התוצאה נכונה?`,
      },
    },
    {
      id: 'd_dates', cat: 'data', prio: 1.5,
      when: /תאריך|date|תקופה|רבעון/i,
      has: /YYYY|DD\/MM|\bISO\b|פורמט תאריך|date format|אזור זמן|timezone|time zone|\bUTC\b|שעון ישראל/i,
      miss: 'יש תאריכים, אבל לא צוינו פורמט ואזור זמן.',
      roles: {
        junior: (c) => `באיזה פורמט מגיע "${c.dateTerm}"? DD/MM/YYYY, ISO או משהו אחר?`,
        senior: () => 'באיזה פורמט ובאיזה אזור זמן נשמרים התאריכים? מה קורה במעבר שעון ובחצות?',
        qa: () => 'איך מוגדרים גבולות התקופה - היום האחרון כלול או לא? אני צריך את זה לבדיקות גבול.',
      },
    },
    {
      id: 'd_sensitive', cat: 'data', prio: 3,
      when: /לקוח|עובד|איש מכירות|אנשי מכירות|טלפון|מייל|כתובת|תעודת זהות|שכר|אשראי|ספק|customer|employee|salary|מחיר/i,
      has: /רגיש|הצפנ|מוצפן|encrypt|מיסוך|masking|\bPII\b|פרטיות|privacy|אנונימ|GDPR|סיווג/i,
      miss: 'יש נתונים על אנשים או נתונים מסחריים, ואין התייחסות לרגישות או הצפנה.',
      roles: {
        security: (c) => `אילו נתונים כאן רגישים${c.sensitive ? ' (למשל "' + c.sensitive + '")' : ''}? האם הם מוצפנים בשמירה ובהעברה, ומי רואה אותם?`,
        senior: () => 'יש כאן נתונים רגישים שמחייבים הצפנה או מיסוך בסביבות הבדיקה?',
      },
    },
    {
      id: 'd_retention', cat: 'data', prio: 2,
      has: /שמירה למשך|נשמר(ים|ות|ת)? (למשך|ל-?\d)|retention|ארכוב|archive|נמחק(ים|ות)? אחרי|מחיקה אחרי|היסטוריה/i,
      miss: 'לא צוין כמה זמן נשמרים הנתונים ומתי הם נמחקים.',
      roles: {
        security: () => 'כמה זמן נשמרים הנתונים והקבצים, ומתי ואיך הם נמחקים?',
        senior: (c) => `כמה היסטוריה נשמרת? אחרי שנה של ${c.entity} הטבלה תגדל - יש ארכוב?`,
      },
    },
    // ממשקים
    {
      id: 'i_format', cat: 'interfaces', prio: 3, when: INTERFACE_RE,
      has: /קידוד|encoding|UTF|מפריד|delimiter|schema|סכמה|שורת כותרת|header|קובץ לדוגמה|הודעה לדוגמה/i,
      miss: 'לא צוינו קידוד, מפריד, שורת כותרת או קובץ לדוגמה.',
      roles: {
        junior: (c) => `מה המבנה המדויק של ${c.channel}: שמות העמודות, מפריד, שורת כותרת וקידוד (UTF-8 עם עברית)?`,
        senior: (c) => `מה הפורמט והקידוד של ${c.channel}? יש schema או קובץ לדוגמה שמגדיר אותו?`,
        qa: (c) => `יש דוגמה של ${c.channel} מ-${c.system}? אני צריך דוגמה תקינה ודוגמה שבורה לבדיקה.`,
      },
    },
    {
      id: 'i_trigger', cat: 'interfaces', prio: 3, when: INTERFACE_RE,
      has: /תדירות|כל \d+|כל (שעה|יום|דקה|חצי שעה|לילה|רבע שעה)|פעם ב|לילי|nightly|טריגר|trigger|real.?time|זמן אמת|מתוזמן|schedule|cron|אירוע|event|ב-?\d{1,2}:\d{2}|בשעה \d/i,
      miss: 'לא צוין מה מפעיל את הממשק ובאיזו תדירות.',
      roles: {
        junior: (c) => `מה מפעיל את ${c.channel}? מתי בדיוק הוא רץ - כל כמה זמן, או בעקבות אירוע?`,
        senior: (c) => `מה התזמון של ${c.channel}: batch מתוזמן או event? ומה קורה אם ריצה קודמת עוד לא הסתיימה?`,
        qa: (c) => `כמה זמן אחרי שנתון נוצר ב-${c.system} הוא אמור להופיע אצלנו? זו התוצאה הצפויה שאני בודק.`,
      },
    },
    {
      id: 'i_transport', cat: 'interfaces', prio: 2, when: INTERFACE_RE,
      has: /SFTP|\bFTP\b|\bREST\b|HTTPS?\b|endpoint|URL|נתיב|תיקיי?ה|folder|queue|\bתור\b|webhook|\bPOST\b|\bGET\b|SOAP|\bMQ\b/i,
      miss: 'לא צוין ערוץ החיבור (API, SFTP, תיקייה).',
      roles: {
        junior: (c) => `איך מתחברים ל-${c.system}: API, SFTP, תיקייה משותפת? מאיפה בדיוק אני קורא ולאן כותב?`,
        senior: (c) => `מה ערוץ החיבור ל-${c.system} (REST, SFTP, תור הודעות), ומי הצד שיוזם?`,
      },
    },
    {
      id: 'i_dup', cat: 'interfaces', prio: 2.5, when: INTERFACE_RE,
      has: /כפילות|כפילויות|כפול|כפולה|פעמיים|duplicate|idempot|כבר נקלט|כבר קיימת|קליטה חוזרת|נקלט(ת)? שוב/i,
      miss: 'לא צוין מה קורה כשאותם נתונים מגיעים פעמיים.',
      roles: {
        senior: (c) => `מה קורה אם ${c.channel} מגיע פעמיים, או נקלט חלקית ואז נשלח שוב? איך מבטיחים שלא נוצרות כפילויות (idempotency)?`,
        qa: (c) => `מה התוצאה הצפויה כשאותו ${c.channel === 'הקובץ' ? 'קובץ' : 'נתון'} נשלח פעמיים?`,
      },
    },
    {
      id: 'i_ack', cat: 'interfaces', prio: 1.5, when: /ממשק|\bAPI\b|קובץ|ספק|סנכרון|\bWMS\b|webhook/i,
      has: /אישור קליטה|acknowledg|\bACK\b|קוד (תשובה|סטטוס)|status code|מחזיר(ה)?|returns|response|\b200\b|\b4\d\d\b|קובץ תשובה/i,
      miss: 'לא צוין מה הצד השני מקבל בחזרה אחרי קליטה.',
      roles: {
        senior: (c) => `האם ${c.system} מקבל אישור על קליטה מוצלחת או כושלת? מה בדיוק חוזר אליו?`,
        junior: (c) => `מה אני מחזיר ל-${c.system} אחרי הקליטה? יש פורמט לתשובה?`,
      },
    },
    {
      id: 'i_mapping', cat: 'interfaces', prio: 2, when: INTERFACE_RE,
      has: /מיפוי|ממופה|ממופים|mapping|נשמר בשדה|שדה מקור|source field|טבלת המרה|→|->/i,
      miss: 'לא נמצא מיפוי בין שדות המקור לשדות היעד.',
      roles: {
        junior: (c) => `איך כל שדה מ-${c.system} ממופה לשדה אצלנו? יש טבלת מיפוי?`,
        qa: () => 'יש טבלת מיפוי, שדה מול שדה, שאפשר לבדוק מולה?',
      },
    },
    {
      id: 'i_deps', cat: 'interfaces', prio: 2,
      has: /תלות|תלוי|dependency|depends|רק אחרי|סדר (ה)?הרצה|מחכה ל|זמינות|לא זמין/i,
      miss: 'לא צוינו תלויות ברכיבים אחרים או מה קורה כשהם לא זמינים.',
      roles: {
        senior: (c) => `על אילו רכיבים ${c.channel} תלוי, ומה קורה כש-${c.system} לא זמין? יש סדר הרצה מחייב?`,
      },
    },
    // כללים עסקיים
    {
      id: 'r_flow', cat: 'rules', prio: 2,
      has: /שלב(ים)? \d|\d\.\s*[א-ת]|סדר (ה)?(פעולות|השלבים)|לאחר מכן|אחר כך|תחילה|step/i,
      miss: 'לא נמצא סדר פעולות מפורט (שלבים ממוספרים).',
      roles: {
        junior: (c) => `מה סדר הפעולות המדויק מרגע שהנתון מגיע ועד שהוא נשמר ${c.inE}? אפשר לכתוב אותו כשלבים ממוספרים?`,
      },
    },
    {
      id: 'r_calc', cat: 'rules', prio: 3,
      when: /חישוב|מחושב|מחשב|נוסחה|אחוז|ממוצע|calculate|total/i,
      has: /נוסחה|formula|=|חלקי|כפול|מחולק|\bSUM\b|\bAVG\b|סכום של|סכימה של/i,
      miss: 'יש חישוב, אבל לא נמצאה נוסחה מפורשת.',
      roles: {
        junior: (c) => `מה הנוסחה המדויקת של ${c.calcTerm}? אפשר לכתוב אותה עם שמות השדות?`,
        senior: (c) => `${c.calcTerm}: מה הנוסחה המדויקת, ומה קורה כשהמכנה הוא 0 או כשאין נתונים?`,
        qa: (c) => `תנו דוגמה מספרית ל${c.calcTerm.startsWith('"') ? '-' + c.calcTerm : c.calcTerm}: קלט ותוצאה צפויה. בלי זה אין לי מול מה לבדוק.`,
      },
    },
    {
      id: 'r_status', cat: 'rules', prio: 2.5,
      when: /סטטוס|status/i,
      has: /מעבר (בין|מ)|מעברים|עובר(ת|ים)? (ל|מ)סטטוס|transition|->|→|משתנה ל|מכונת מצבים|state machine/i,
      miss: 'יש סטטוסים, אבל לא הוגדרו המעברים ביניהם.',
      roles: {
        junior: (c) => `אילו סטטוסים יש ${c.toE}${c.statuses.length ? ' (' + c.statuses.join(', ') + ')' : ''}, ומה בדיוק מעביר בין סטטוס לסטטוס?`,
        qa: () => 'מה מעברי הסטטוס המותרים, ומה התוצאה הצפויה בניסיון מעבר לא חוקי?',
        senior: (c) => `אפשר לחזור אחורה בסטטוס או לבטל? מה קורה לרשומה שכבר עברה הלאה כשמגיע עליה עדכון?`,
      },
    },
    {
      id: 'r_status_back', cat: 'rules', prio: 1.5,
      when: /סטטוס|status/i,
      has: /ביטול|מבוטל|cancel|חזרה לסטטוס|עדכון של (הזמנה|רשומה) קיימת|שינוי אחרי/i,
      miss: 'לא צוין מה קורה בביטול או בעדכון של רשומה שכבר התקדמה.',
      roles: {
        senior: (c) => `מה קורה כשמגיע ביטול או עדכון ${c.toE}${c.statuses.length > 1 ? ' שכבר בסטטוס "' + c.statuses[c.statuses.length - 1] + '"' : ' שכבר טופל'}?`,
        qa: () => 'מה התוצאה הצפויה כשמבטלים רשומה אחרי שכבר אושרה?',
      },
    },
    {
      id: 'r_validation', cat: 'rules', prio: 2.5,
      has: /ולידציה|validation|בדיקת תקינות|בדיקות תקינות|נבדק(ת|ים|ות)? (ש|מול)|חייב(ת|ים)? להיות|must be|גדול(ה)? מ|קטן(ה)? מ|בין \d+ ל-?\d+|לא תקינ/i,
      miss: 'לא הוגדרו בדיקות תקינות לנתונים.',
      roles: {
        junior: (c) => `אילו בדיקות תקינות לעשות לפני השמירה?${c.amount ? ` למשל, "${c.amount}" חייב להיות חיובי?` : ''}`,
        qa: (c) => `מה נחשב קלט לא תקין, ומה התוצאה הצפויה כשהוא מגיע?${c.amount ? ` (למשל "${c.amount}" שלילי)` : ''}`,
        senior: () => 'איפה נעשות בדיקות התקינות - במקור, בקליטה או בבסיס הנתונים? מה קורה לרשומה שנכשלה בבדיקה?',
      },
    },
    {
      id: 'r_examples', cat: 'rules', prio: 2,
      has: /לדוגמה|דוגמה|דוגמא|למשל|example|e\.g\.|תוצאה צפויה|expected/i,
      miss: 'אין אף דוגמה עם ערכים ותוצאה צפויה.',
      roles: {
        qa: () => 'אפשר דוגמה עם ערכים ותוצאה צפויה לכל כלל מרכזי? בלי זה אני לא יכול לכתוב תסריט בדיקה.',
        junior: () => 'יש דוגמה אחת מקצה לקצה - מה נכנס, מה מחושב ומה יוצא?',
      },
    },
    {
      id: 'r_edge', cat: 'rules', prio: 2.5,
      has: /מקרה קצה|מקרי קצה|edge case|אם אין|כאשר אין|כשאין|שלילי|negative|אפס|לא קיים|לא נמצא|חסר(ה|ים)?\b|קובץ ריק/i,
      miss: 'לא נמצא טיפול במקרי קצה (ערך חסר, אפס, נתון שלא קיים).',
      roles: {
        senior: (c) => `מה קורה במקרי קצה: ${c.edge.join(', ')}?`,
        qa: (c) => `מה התוצאה הצפויה במקרי הקצה: ${c.edge.join(', ')}?`,
      },
    },
    {
      id: 'r_acceptance', cat: 'rules', prio: 2,
      has: /קריטריון|קריטריוני קבלה|acceptance|תנאי (ה)?הצלחה|definition of done|ייחשב (כ)?(הצלחה|תקין)|מדד הצלחה/i,
      miss: 'לא הוגדרו קריטריוני קבלה.',
      roles: {
        qa: () => 'מה קריטריוני הקבלה? איך נדע שהפיצ\'ר עובד ואפשר לסגור אותו?',
      },
    },
    // שגיאות וחריגים
    {
      id: 'e_general', cat: 'errors', prio: 3,
      has: /שגיא|כשל|נכשל|error|fail|exception|חריג/i,
      miss: 'המילים "שגיאה", "כשל" או "חריג" לא מופיעות באפיון.',
      roles: {
        junior: (c) => `מה אני עושה כשמשהו נכשל ב${c.channel.replace(/^ה/, '')}? מציג הודעה, עוצר או ממשיך?`,
        senior: (c) => `אילו כשלים צפויים ב${c.channel.replace(/^ה/, '')} ואיך מטפלים בכל אחד?`,
        qa: () => 'מה התוצאה הצפויה כשהתהליך נכשל באמצע? מה המשתמש רואה ומה נשאר בבסיס הנתונים?',
        security: () => 'מה נרשם בלוג כשיש שגיאה? צריך לוודא שהודעות שגיאה לא חושפות נתונים רגישים או פרטי חיבור.',
      },
    },
    {
      id: 'e_retry', cat: 'errors', prio: 2.5, when: INTERFACE_RE,
      has: /retry|ניסיון חוזר|ניסיונות|נסה שוב|ננסה שוב|מנסה שוב|ניסיון נוסף/i,
      miss: 'לא צוין ניסיון חוזר (retry) כשהצד השני לא זמין.',
      roles: {
        senior: (c) => `כש-${c.system} לא זמין, יש ניסיון חוזר (retry)? כמה פעמים ובאיזה מרווח?`,
        junior: (c) => `אם החיבור ל-${c.system} נופל, לנסות שוב? כמה פעמים?`,
      },
    },
    {
      id: 'e_alert', cat: 'errors', prio: 2,
      has: /התראה|התראות|alert|מתריע|notify|notification|נשלח(ת)? (מייל|הודעה)|ניטור|monitor/i,
      miss: 'לא צוין מי מקבל התראה כשמשהו נכשל.',
      roles: {
        senior: () => 'מי מקבל התראה כשיש כשל, ובאיזה ערוץ (מייל, ניטור)? אחרי כמה כשלים?',
        qa: () => 'איך אבדוק שנשלחה התראה בכשל? למי ובאיזה תוכן?',
      },
    },
    {
      id: 'e_partial', cat: 'errors', prio: 2.5,
      when: /קובץ|רשומות|שורות|batch|סנכרון|ממשק/i,
      has: /חלקי|partial|שורה (אחת )?(שגויה|תקינה)|שורות (שגויות|תקינות)|רשומה שגויה|נדח(ית|ות|ים|ה)|דחיי?ה|reject|rollback|טרנזקציה|transaction|הכל או כלום|all or nothing/i,
      miss: 'לא צוין מה קורה כשחלק מהרשומות תקינות וחלק לא.',
      roles: {
        senior: (c) => `אם שורה אחת ב${c.channel.replace(/^ה/, '')} שגויה - דוחים את כולו או קולטים רק את התקינות? איך מונעים קליטה חלקית?`,
        qa: () => 'מה התוצאה הצפויה כשחלק מהשורות תקינות וחלק לא?',
      },
    },
    {
      id: 'e_reprocess', cat: 'errors', prio: 2, when: INTERFACE_RE,
      has: /תיקון ידני|טיפול ידני|הרצה מחדש|להריץ מחדש|rerun|re-run|reprocess|שליחה מחדש|לשלוח מחדש|resend|תור שגיאות|error queue|dead.?letter|מסך (חריגים|שגיאות)/i,
      miss: 'לא צוין איך מתקנים ושולחים מחדש רשומות שנכשלו.',
      roles: {
        junior: () => 'איפה רואים רשומות שנכשלו, ואיך מתקנים ושולחים אותן מחדש?',
        senior: () => 'מה תהליך התיקון והקליטה מחדש של רשומות שנכשלו? יש תור שגיאות או מסך חריגים?',
      },
    },
    // הרשאות
    {
      id: 'p_access', cat: 'permissions', prio: 3,
      has: /הרשא|תפקיד|\brole\b|גישה|access|מורשה|מורשים|authoriz|רק (ה)?(מנהל|משתמש)|יכול(ים|ה)? (לראות|לערוך|לאשר|לצפות)/i,
      miss: 'לא צוין מי רשאי לצפות, לערוך או לאשר.',
      roles: {
        junior: () => 'מי רואה את המסך או הנתונים ומי יכול לשנות? אני צריך לדעת אילו בדיקות הרשאה לבנות.',
        qa: () => 'אילו תפקידים יש, ומה התוצאה הצפויה כשמשתמש בלי הרשאה מנסה לצפות או לעדכן?',
        security: () => 'מי מורשה לצפות, לערוך ולאשר? מה מגדיר את ההרשאה - תפקיד, צוות, אזור?',
      },
    },
    {
      id: 'p_row', cat: 'permissions', prio: 2.5,
      when: /מנהל|צוות|אזור|סניף|קניי?ן|יראה/i,
      has: /רק (את )?(ה)?(נתונים|רשומות|הזמנות) של|לפי (צוות|אזור|סניף|היררכיה)|row.?level|ברמת (ה)?(שורה|רשומה)|הכפופים|של הצוות שלו|בצד השרת/i,
      miss: 'לא הוגדר אם ההרשאה היא גם ברמת השורה (מי רואה אילו רשומות).',
      roles: {
        security: (c) => `ההרשאה היא גם ברמת השורה - כל משתמש רואה רק את ${c.scopeTerm} שלו? איך זה נאכף בצד השרת?`,
        senior: (c) => `סינון לפי ${c.scopeTerm} נעשה בשאילתה בצד השרת או רק במסך?`,
      },
    },
    {
      id: 'p_creds', cat: 'permissions', prio: 3, when: INTERFACE_RE,
      has: /סיסמ|password|token|טוקן|API key|מפתח API|credentials|פרטי (ה)?(גישה|חיבור)|OAuth|certificate|תעודה דיגיטלית|vault|secret|כספת/i,
      miss: 'לא צוין איך ואיפה נשמרים פרטי הגישה לממשק.',
      roles: {
        security: (c) => `איך נשמרים פרטי הגישה ל-${c.system} (סיסמה, token)? איפה הם יושבים, מי רשאי לראות אותם ומתי מחליפים אותם? הם לא אמורים להיות בקוד.`,
        senior: (c) => `איך מתבצע האימות מול ${c.system}, ואיפה נשמרים פרטי הגישה בכל סביבה?`,
      },
    },
    {
      id: 'p_transport', cat: 'permissions', prio: 2, when: INTERFACE_RE,
      has: /\bTLS\b|HTTPS|SFTP|\bSSL\b|הצפנ|encrypt|מוצפן|whitelist|רשימת (היתרים|IP)|\bVPN\b|כתובות IP/i,
      miss: 'לא צוין שהערוץ מוצפן או מי יכול לגשת אליו.',
      roles: {
        security: (c) => `האם ${c.channel} עובר בערוץ מוצפן (SFTP או HTTPS)? מי עוד יכול לגשת לנקודת החיבור?`,
      },
    },
    {
      id: 'p_audit', cat: 'permissions', prio: 2,
      has: /audit|תיעוד (שינויים|פעולות)|לוג פעולות|יומן (פעולות|ביקורת)|מי (שינה|אישר|עדכן)|נרשם מי|נרשמים/i,
      miss: 'לא צוין תיעוד של מי עשה מה (יומן ביקורת).',
      roles: {
        security: () => 'האם נרשם מי עשה כל פעולה (אישור, שינוי, ייצוא) ומתי? כמה זמן נשמר יומן הביקורת?',
        qa: () => 'איך אבדוק מי שינה מה? יש יומן פעולות?',
      },
    },
    {
      id: 'p_export', cat: 'permissions', prio: 2,
      when: /ייצוא|export|אקסל|Excel|הורדה|download/i,
      has: /(ייצוא|export)[^.\n]*(מורשה|הרשא|רק)|סימן מים|watermark|הגבלת ייצוא/i,
      miss: 'יש ייצוא נתונים בלי הגבלה או תיעוד.',
      roles: {
        security: () => 'מי מורשה לייצא נתונים לאקסל? ייצוא מוציא נתונים מחוץ לבקרה - יש הגבלה או תיעוד?',
      },
    },
    // ביצועים ונפח
    {
      id: 'v_volume', cat: 'performance', prio: 3,
      has: /\d[\d,.]*\s*(K|אלף|אלפי|מיליון)?\s*(רשומות|שורות|הזמנות|פריטים|קבצים|בקשות|משתמשים|עסקאות|מק"טים|מק״טים|אנשי מכירות|records|rows|items|orders|requests|users|transactions)|נפח (של )?\d/i,
      miss: 'לא נמצא נפח במספרים (כמה רשומות ביום או בריצה).',
      roles: {
        senior: (c) => `מה הנפח הצפוי: כמה ${c.volumeNoun} ביום, ובשיא? בלי זה אי אפשר לבחור בין קליטה שורה-שורה ל-bulk.`,
        junior: (c) => `כמה ${c.volumeNoun} מגיעים בכל ריצה? צריך לחשוב על ביצועים?`,
        qa: (c) => `איזה נפח לבדוק בבדיקת עומס? כמה ${c.volumeNoun} בריצה רגילה ובשיא?`,
      },
    },
    {
      id: 'v_time', cat: 'performance', prio: 2.5,
      has: /\d+\s*(שניות|שנייה|שניה|דקות|דקה|ms|מילישניות|seconds|sec|minutes|min)\b|\bSLA\b|זמן תגובה|response time|latency|זמן טעינה|תוך \d/i,
      miss: 'לא נמצאה דרישת זמן במספרים (שניות, דקות, SLA).',
      roles: {
        senior: (c) => {
          const s = sentenceFor(c, /מהר|מהיר|זמן אמת|מיד/);
          return s ? `"${s}" - מה זמן התגובה הנדרש במספרים, ובאיזה נפח?` : 'מה זמן התגובה או חלון הזמן הנדרש, במספרים?';
        },
        qa: () => 'מה זמן התגובה המקסימלי שאפשר לבדוק מולו? (למשל טעינה תוך X שניות עבור Y רשומות)',
        junior: () => 'יש דרישת זמן? תוך כמה שניות המסך או התהליך צריכים להסתיים?',
      },
    },
    {
      id: 'v_peak', cat: 'performance', prio: 2,
      has: /שיא|peak|עומס|\bload\b|גידול|growth|במקביל|concurrent|עונתי|סוף (חודש|רבעון)/i,
      miss: 'לא צוינו עומס שיא או גידול צפוי.',
      roles: {
        senior: () => 'מה העומס בשיא (סוף חודש, עונה), ומה הגידול הצפוי בשנה-שנתיים? כמה משתמשים או תהליכים במקביל?',
      },
    },
    {
      id: 'v_index', cat: 'performance', prio: 1.5,
      when: /דוח|report|סינון|חיפוש|filter|search/i,
      has: /אינדקס|index|טבלת סיכום|טבלה מסוכמת|aggregate|מצטבר|cache|מטמון|materialized|מחושב מראש/i,
      miss: 'יש דוח או חיפוש, ולא צוין איך הוא יעמוד בנפח.',
      roles: {
        senior: () => 'על כמה שנים של נתונים הדוח רץ? צריך טבלת סיכום או cache, או שמחשבים בכל טעינה?',
      },
    },
  ];

  // ---------- Ambiguity detection ----------
  const VAGUE = [
    { re: 'מהר|מהיר|מהירה|מהירים|מיידי|fast|quickly', hint: 'כמה שניות בדיוק, ובאיזה נפח?' },
    { re: "וכו'|וכו׳|וכדומה|וכד'|וכד׳|וכיוצא בזה|וכן הלאה|etc\\.?", hint: 'מה הרשימה המלאה? רשימה פתוחה אי אפשר לפתח ולבדוק.' },
    { re: 'בהתאם לצורך|לפי הצורך|במידת הצורך|במידת האפשר|as needed|if needed', hint: 'מי מחליט, ולפי איזה כלל?' },
    { re: 'אמור|אמורה|אמורים|אמורות', hint: 'זו דרישה מחייבת? מה קורה אם זה לא קורה?' },
    { re: 'בערך|בערך כ|approximately|about', hint: 'מה הערך המדויק או הטווח?' },
    { re: 'גמיש|גמישה|גמישים|גמישות|flexible', hint: 'איזה שינוי בדיוק צריך להיות אפשרי בלי פיתוח?' },
    { re: 'בקלות|קל|קלה|ידידותי למשתמש|ידידותית|ידידותי|נוח|נוחה|אינטואיטיבי|אינטואיטיבית|בצורה חלקה|user-friendly|easy|easily|intuitive', hint: 'מה הקריטריון שאפשר למדוד? (מספר קליקים, זמן לביצוע משימה)' },
    { re: 'רלוונטי|רלוונטית|רלוונטיים|רלוונטיות|מתאים|מתאימה|מתאימים|appropriate|relevant', hint: 'מה הכלל שקובע מה רלוונטי או מתאים?' },
    { re: 'באופן שוטף|שוטף|מעת לעת|periodically', hint: 'באיזו תדירות בדיוק?' },
    { re: 'אולי|ייתכן|יתכן|לרוב|בדרך כלל|maybe|usually', hint: 'זה חלק מהדרישה או לא? אם כן, באילו תנאים?' },
    { re: 'הרבה|מעט|קרוב|גדול|קטן|many|several|some', hint: 'כמה בדיוק? מה הסף המספרי?' },
    { re: 'TBD|ייקבע בהמשך|יוחלט בהמשך|יוגדר בהמשך', hint: 'מי מחליט ועד מתי? זה חוסם פיתוח.' },
  ];
  const VAGUE_RES = VAGUE.map((v) => ({
    hint: v.hint,
    re: new RegExp('(?:^|[^' + HE + 'A-Za-z0-9])([והבלכש]{0,2}(?:' + v.re + '))(?=$|[^' + HE + 'A-Za-z0-9])', 'i'),
  }));
  function findVague(text) {
    const out = [];
    const seen = new Set();
    sentences(text).forEach((s) => {
      for (const v of VAGUE_RES) {
        const m = s.match(v.re);
        if (m && !seen.has(s)) {
          seen.add(s);
          out.push({ word: m[1], sentence: s, hint: v.hint });
          break;
        }
      }
    });
    return out;
  }
  const VAGUE_PHRASE = {
    junior: (v) => `כתוב "${clip(v.sentence, 110)}". מה בדיוק לבנות כאן? "${v.word}" לא אומר לי מה לעשות. ${v.hint}`,
    senior: (v) => `"${v.word}" ב-"${clip(v.sentence, 110)}" - כל מפתח יפרש את זה אחרת. ${v.hint}`,
    qa: (v) => `איך אבדוק את "${clip(v.sentence, 110)}"? "${v.word}" לא ניתן למדידה. ${v.hint}`,
    security: (v) => `"${clip(v.sentence, 110)}" - "${v.word}" משאיר פתח לפרשנות. מי מחליט ומה הגבול?`,
  };

  /** Rule engine: returns [{id, cat, question, section, why}] */
  function generateRuleQuestions(text, role) {
    const t = String(text || '');
    const r = WEIGHTS[role] ? role : 'junior';
    const ctx = extractContext(t);
    const cands = [];
    BANK.forEach((q) => {
      const phr = q.roles[r];
      if (!phr) return;
      if (q.when && !q.when.test(t)) return;
      if (q.has.test(t)) return;
      const section = q.when ? sentenceFor(ctx, q.when) : null;
      cands.push({ id: q.id, cat: q.cat, question: phr(ctx), section, why: q.miss, score: WEIGHTS[r][q.cat] * q.prio, detector: q.has });
    });
    findVague(t)
      .slice(0, AMBIG_CAP[r])
      .forEach((v, i) =>
        cands.push({ id: 'amb_' + i, cat: 'ambiguity', question: VAGUE_PHRASE[r](v), section: clip(v.sentence, 160), why: 'מילה עמומה: "' + v.word + '"', score: WEIGHTS[r].ambiguity * (2.5 - i * 0.3) })
      );
    cands.sort((a, b) => b.score - a.score);
    const picked = cands.slice(0, MAX_Q);
    const order = CATS.map((c) => c.id);
    picked.sort((a, b) => order.indexOf(a.cat) - order.indexOf(b.cat) || b.score - a.score);
    return picked.map(({ score, ...q }) => q);
  }

  // ---------- Samples ----------
  const SAMPLES = [
    {
      id: 'po-intake',
      title: 'ממשק קליטת הזמנות מספק',
      level: 'בינוני',
      text: `אפיון טכני: ממשק קליטת הזמנות מספק

1. רקע
הספק "אלפא אספקה" שולח אלינו הזמנות רכש שאושרו אצלו. היום פקידת הרכש מקלידה אותן ידנית למערכת ה-ERP, וזה לוקח זמן ויוצר טעויות הקלדה. המטרה היא לקלוט את ההזמנות אוטומטית לטבלת PurchaseOrder ולחסוך את ההקלדה.

2. תיאור הממשק
הספק מעלה קובץ CSV לתיקייה משותפת בשרת הקבצים. המערכת קוראת את הקובץ, קולטת את ההזמנות ומעבירה את הקובץ לתיקיית ארכיון. הקליטה צריכה להיות מהירה ולעבוד בצורה חלקה.

3. מבנה הקובץ
כל שורה בקובץ היא שורת הזמנה אחת. העמודות: מספר הזמנה, תאריך הזמנה, מק"ט ספק, תיאור פריט, כמות, מחיר ליחידה, תאריך אספקה מבוקש, הערות וכו'. הזמנה עם כמה פריטים תופיע בכמה שורות עם אותו מספר הזמנה.

4. מיפוי לטבלת PurchaseOrder
מספר ההזמנה של הספק נשמר בשדה SupplierOrderNo. תאריך ההזמנה נשמר בשדה OrderDate. מק"ט הספק ממופה למק"ט שלנו לפי טבלת המרה שמתחזקת מחלקת הרכש. הכמות והמחיר נשמרים כמו שהם בשורות ההזמנה. סכום ההזמנה מחושב ונשמר בכותרת.

5. כללים
הזמנה נקלטת בסטטוס "חדשה". אחרי שהקניין בודק אותה ומאשר, היא עוברת לסטטוס "מאושרת" ונשלחת למחסן. אם מק"ט הספק לא נמצא בטבלת ההמרה, צריך לטפל בזה בהתאם לצורך. הזמנה שכבר קיימת במערכת לא אמורה להיקלט שוב.

6. משתמשים
הקניינים צופים בהזמנות שנקלטו במסך "הזמנות ספק" ויכולים לאשר אותן או להחזיר אותן לספק. המסך צריך להיות ידידותי למשתמש ולהציג את ההזמנות החדשות למעלה.

7. הערות
בעתיד ייתכן שספקים נוספים יעברו לעבוד באותה שיטה, ולכן הפתרון צריך להיות גמיש ולאפשר הוספת ספק בלי שינויים גדולים.

8. דיווח
בסוף כל יום נשלח לקניין הראשי סיכום של ההזמנות שנקלטו, כולל מספר ההזמנות, הסכום הכולל וההזמנות שעדיין מחכות לאישור. הסיכום יישלח במייל בפורמט נוח לקריאה.`,
    },
    {
      id: 'sales-report',
      title: 'דוח עמידה ביעדי מכירה',
      level: 'חלש',
      text: `אפיון: דוח עמידה ביעדי מכירה

מטרה
מנהלי המכירות רוצים לראות בקלות איך כל איש מכירות עומד ביעד שלו. כיום הנתונים מפוזרים בכמה קבצי Excel, וכל מנהל מחשב את העמידה ביעד בעצמו בסוף החודש. זה לוקח הרבה זמן וכל מנהל מחשב קצת אחרת.

מקורות נתונים
המכירות נלקחות ממערכת ה-CRM. היעדים מוזנים על ידי מנהלי המכירות בתחילת כל רבעון בערך, ויש מנהלים שמעדכנים אותם גם באמצע הרבעון.

תצוגת הדוח
הדוח יציג לכל איש מכירות: שם, צוות, יעד, מכירות בפועל ואחוז עמידה ביעד. אחוז העמידה מחושב לפי המכירות ביחס ליעד. יש להציג צבע ירוק למי שעומד ביעד ואדום למי שלא, ואולי גם צהוב למי שקרוב ליעד. בראש הדוח תופיע שורת סיכום לכל הצוות. כשלוחצים על איש מכירות, נפתחת רשימת העסקאות שלו בתקופה, עם קישור לכל עסקה ב-CRM.

סינונים
אפשר לסנן לפי תקופה, צוות, אזור, מוצר וכו'. הסינונים צריכים להיות גמישים ונוחים, ושהמנהל יוכל לשמור סינון שהוא משתמש בו הרבה.

ביצועים
הדוח צריך להיטען מהר מאוד, גם כשיש הרבה נתונים, כי מנהלים פותחים אותו בישיבות, לפעמים מהטלפון ולפעמים מהמחשב במשרד.

הרשאות
כל מנהל יראה את הנתונים הרלוונטיים לו. סמנכ"ל המכירות יראה את כל הנתונים.

נוסף
יש לאפשר ייצוא לאקסל כדי שאפשר יהיה להעביר את הנתונים להנהלה. הדוח אמור להתעדכן באופן שוטף, ובמידת האפשר להציג גם השוואה לשנה הקודמת. בהמשך אולי נוסיף גם גרף מגמה לכל איש מכירות.

שאלות פתוחות
עוד לא הוחלט אם מכירות שבוטלו נספרות במכירות בפועל, ואם עסקה שנסגרה ביום האחרון של הרבעון נכנסת לרבעון הנוכחי או לבא. הנושא ייקבע בהמשך מול מחלקת הכספים, וכנראה שזה יהיה דומה למה שעושים היום בקבצים.`,
    },
    {
      id: 'erp-wms',
      title: 'סנכרון מלאי ERP-WMS',
      level: 'טוב',
      text: `אפיון טכני: סנכרון יתרות מלאי מ-WMS ל-ERP

1. מטרה
מערכת ה-WMS מחזיקה את יתרות המלאי בפועל לכל מק"ט ומחסן. ה-ERP צריך את היתרות כדי להבטיח הזמנות לקוח. הממשק מעדכן את טבלת StockBalance ב-ERP.

2. ערוץ, טריגר ותדירות
ה-WMS שולח קריאת REST בפורמט JSON (קידוד UTF-8) ב-HTTPS ל-endpoint בכתובת /api/stock-balance. הקריאה מתוזמנת כל 15 דקות, וכוללת רק מק"טים שהשתנו מאז הריצה הקודמת. האימות הוא OAuth 2.0 עם token שנשמר ב-Key Vault, ולא בקוד. רק כתובות IP של שרתי ה-WMS ברשימת ההיתרים.

3. שדות ומיפוי
שדות ההודעה ממופים 1:1 לטבלת StockBalance:
- item_code → ItemCode, VARCHAR(20), חובה
- warehouse_code → WarehouseCode, VARCHAR(10), חובה
- qty_on_hand → QtyOnHand, DECIMAL(12,3), חובה, ביחידת המידה הבסיסית של המק"ט
- snapshot_at → SnapshotAt, DATETIME בפורמט ISO 8601, אזור זמן UTC
המפתח הייחודי הוא ItemCode + WarehouseCode. קובץ לדוגמה מצורף כנספח א'.

4. כללים
1. הודעה עם snapshot_at ישן מזה שכבר שמור נדחית, כדי שהודעה מאוחרת לא תדרוס נתון חדש.
2. כמות חייבת להיות גדולה מ-0 או שווה ל-0. כמות שלילית לא תקינה והשורה נדחית.
3. מק"ט שלא קיים ב-ERP נרשם בטבלת חריגים ולא נקלט.
4. אותה הודעה שמגיעה פעמיים (לפי message_id) נקלטת פעם אחת בלבד, כך שאין כפילויות.
לדוגמה: קיימת יתרה 40 מ-10:00 UTC, ומגיעה הודעה עם 35 מ-09:45 UTC. התוצאה הצפויה: ההודעה נדחית והיתרה נשארת 40.

5. שגיאות וחריגים
ה-ERP מחזיר 200 עם רשימת שורות שנקלטו ושורות שנדחו וסיבת הדחייה. שורה שגויה לא עוצרת את שאר השורות. אם ה-ERP לא זמין, ה-WMS מבצע 3 ניסיונות חוזרים במרווח של 5 דקות. אחרי 3 כשלים נשלחת התראה במייל לצוות התפעול. שורות שנדחו מוצגות במסך חריגים, ואחרי תיקון אפשר לשלוח אותן מחדש.

6. נפח וביצועים
נפח רגיל: עד 20,000 שורות ביום. בשיא, בסוף חודש: 80,000 שורות ביום. קריאה אחת מכילה עד 2,000 שורות וצריכה להסתיים תוך 10 שניות.

7. הרשאות ואבטחה
רק משתמש השירות של ה-WMS מורשה לקרוא ל-endpoint. בצד ה-ERP, משתמשים בתפקיד "תפעול" צופים במסך החריגים ורק "מנהל תפעול" יכול לשלוח שורות מחדש. כל שליחה מחדש נרשמת ביומן ביקורת עם שם המשתמש והשעה. ההודעות נשמרות למשך 90 יום ואז נמחקות.

8. קריטריוני קבלה
הממשק ייחשב תקין כאשר 1,000 הודעות בדיקה נקלטות בלי כפילויות, השורות השגויות מופיעות במסך החריגים, וכל התרחישים בסעיף 4 מחזירים את התוצאה הצפויה.`,
    },
  ];

  // ---------- AI ----------
  const AI_SCHEMA = {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            category: { type: 'string', enum: CATS.map((c) => c.id) },
            question: { type: 'string' },
            section: { type: 'string' },
            why: { type: 'string' },
          },
          required: ['category', 'question', 'section', 'why'],
          additionalProperties: false,
        },
      },
    },
    required: ['questions'],
    additionalProperties: false,
  };
  async function generateAIQuestions(text, roleId) {
    const role = roleOf(roleId);
    const system =
      `You are a ${role.id === 'qa' ? 'QA engineer' : role.id === 'security' ? 'information security officer' : role.id === 'senior' ? 'senior software developer' : 'junior software developer'} ` +
      `reading a technical specification you must implement or verify. Your focus: ${role.focus}. ` +
      'Ask the questions you would really ask the spec author before starting work. Ask ONLY about things whose answer is NOT already in the text. ' +
      'Each question must be specific to this spec (mention concrete fields, entities, systems or quote the vague sentence), not generic. ' +
      'Write questions in Hebrew, in the voice of your role. Between 3 and 15 questions; fewer is fine if the spec is complete. ' +
      'Categories: data (field types, keys, mandatory, units, formats), interfaces (format, trigger, channel, mapping, duplicates, acknowledgements), rules (calculations, statuses, validation, edge cases, examples, acceptance), ' +
      'errors (failures, retry, alerts, partial failure, reprocessing), permissions (who can do what, sensitive data, credentials, audit), performance (volume, response time, peak), ambiguity (vague wording). ' +
      '"section" = a short exact quote or section number from the spec the question refers to (or "כללי"). "why" = one short Hebrew sentence on why this matters for your role.';
    const res = await SL.ai.call({ system, prompt: 'האפיון:\n"""\n' + text + '\n"""', schema: AI_SCHEMA, maxTokens: 6000 });
    const qs = (res && res.questions) || [];
    if (!qs.length) throw new Error('לא התקבלו שאלות');
    return qs.slice(0, MAX_Q).map((q, i) => ({ id: 'ai_' + i, cat: CATS.some((c) => c.id === q.category) ? q.category : 'ambiguity', question: q.question, section: q.section && q.section !== 'כללי' ? q.section : null, why: q.why }));
  }
  async function aiVerifyQuote(question, quote) {
    return SL.ai.call({
      system: 'You check whether a quote from a technical specification answers a developer question. Be strict: the quote must actually contain the information asked for. Explanation in Hebrew, one sentence.',
      prompt: 'שאלה: ' + question + '\nציטוט מהאפיון: "' + quote + '"',
      schema: { type: 'object', properties: { answers: { type: 'boolean' }, explanation: { type: 'string' } }, required: ['answers', 'explanation'], additionalProperties: false },
      maxTokens: 600,
    });
  }

  // ---------- Styles ----------
  function injectStyles() {
    if (document.getElementById('devsim-css')) return;
    const css = `
.ds-samples { display:grid; gap:8px; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); }
.ds-sample { text-align:start; font:inherit; color:inherit; background:var(--surface); border:2px solid var(--border); border-radius:12px; padding:10px 12px; cursor:pointer; }
.ds-sample:hover, .ds-sample[aria-pressed='true'] { border-color:var(--primary); background:var(--primary-soft); }
.ds-roles { display:grid; gap:8px; }
.ds-role { display:flex; gap:10px; align-items:flex-start; padding:10px 12px; border:2px solid var(--border); border-radius:12px; cursor:pointer; font-weight:400; }
.ds-role:has(input:checked) { border-color:var(--primary); background:var(--primary-soft); }
.ds-role input { margin-top:5px; }
.ds-role b { display:block; }
.ds-spec { white-space:pre-wrap; max-height:70vh; overflow:auto; background:var(--surface-2); border-radius:10px; padding:12px; font-size:0.92rem; }
.ds-sticky { position:sticky; top:72px; }
.ds-q { border-inline-start:4px solid var(--warn); }
.ds-q.st-written { border-inline-start-color:var(--good); opacity:0.85; }
.ds-q.st-added { border-inline-start-color:var(--primary); }
.ds-q .q-snippet { margin:6px 0; font-size:0.9rem; }
.ds-q-text { font-weight:600; margin:6px 0; }
.ds-meter { display:flex; gap:16px; flex-wrap:wrap; align-items:baseline; }
.ds-bar { display:grid; grid-template-columns:130px 1fr 32px; gap:10px; align-items:center; margin:6px 0; }
.ds-bar .progress > div { background:var(--warn); }
.ds-chart { width:100%; height:auto; direction:ltr; }
.ds-chart .grid line { stroke:var(--border); }
.ds-chart text { fill:var(--muted); font-size:12px; font-family:var(--font); }
.ds-chart .line { fill:none; stroke:var(--primary); stroke-width:2; }
.ds-chart .dot { fill:var(--primary); stroke:var(--surface); stroke-width:2; }
.ds-chart .goal { stroke:var(--good); stroke-dasharray:4 4; stroke-width:1.5; }
.ds-chart .hit { fill:transparent; cursor:default; }
.ds-mark { background:var(--warn-soft); color:var(--text); font-weight:700; padding:0 2px; border-radius:3px; }
.ds-ctx { font-size:0.9rem; background:var(--surface-2); padding:6px 10px; border-radius:8px; margin-top:4px; overflow-wrap:anywhere; }
@media (max-width:520px){ .ds-bar { grid-template-columns:100px 1fr 28px; } }
`;
    document.head.appendChild(h('style', { id: 'devsim-css' }, css));
  }

  // ---------- Session state (in memory while the page is open) ----------
  let cur = null; // {role, text, sample, words, questions, mode, notice, finished, run}
  const draft = { text: '', sample: null, role: 'junior', useAI: true };

  function countedGaps(c) {
    return c.questions.filter((q) => q.status !== 'written');
  }
  const per1000 = (gaps, words) => (words ? Math.round((gaps * 1000 * 10) / words) / 10 : 0);
  function runsFor(role) {
    return (SL.state.devsim || []).filter((r) => r.role === role);
  }

  // ---------- Views ----------
  function render(el) {
    injectStyles();
    el.innerHTML = '';
    el.appendChild(
      h('div', { class: 'row between' },
        h('div', null, h('h1', null, '🧑‍💻 המפתח שואל'), h('p', { class: 'muted' }, 'מדביקים אפיון, בוחרים מי קורא אותו, ורואים אילו שאלות הוא היה שולח לכם. כל שאלה שהתשובה עליה לא כתובה היא פער.')),
        h('a', { class: 'btn ghost small', href: '#/labs' }, 'חזרה למעבדות')
      )
    );
    const body = h('div');
    el.appendChild(body);
    if (!cur) renderInput(body);
    else if (cur.loading) renderLoading(body);
    else if (cur.finished) renderResults(body);
    else renderQuestions(body);
  }
  const rerender = () => render(document.getElementById('main'));

  function renderInput(el) {
    const wc = h('span', { class: 'muted small' });
    const ta = h('textarea', { id: 'ds-text', rows: 16, placeholder: 'הדביקו כאן קטע אפיון (עברית או אנגלית), או בחרו אפיון לדוגמה', 'aria-label': 'טקסט האפיון', style: { minHeight: '320px' } });
    ta.value = draft.text;
    const upd = () => {
      draft.text = ta.value;
      const s = SAMPLES.find((x) => x.id === draft.sample);
      if (s && s.text !== ta.value) {
        draft.sample = null;
        sampleBtns.forEach((b) => b.setAttribute('aria-pressed', 'false'));
      }
      wc.textContent = wordCount(ta.value) + ' מילים';
    };
    ta.addEventListener('input', upd);
    const sampleBtns = SAMPLES.map((s) =>
      h('button', {
        class: 'ds-sample', type: 'button', 'aria-pressed': String(draft.sample === s.id), 'data-sample': s.id,
        onclick: () => {
          draft.sample = s.id;
          ta.value = s.text;
          draft.text = s.text;
          sampleBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-sample') === s.id)));
          upd();
        },
      }, h('b', null, s.title), h('div', { class: 'small muted' }, wordCount(s.text) + ' מילים · רמת אפיון: ' + s.level))
    );
    upd();

    const roles = h('div', { class: 'ds-roles', role: 'radiogroup', 'aria-label': 'תפקיד הקורא' },
      ROLES.map((r) =>
        h('label', { class: 'ds-role' },
          h('input', { type: 'radio', name: 'ds-role', value: r.id, checked: draft.role === r.id, onchange: () => { draft.role = r.id; trendBox.replaceChildren(trendCard(r.id)); } }),
          h('span', null, h('b', null, r.icon + ' ' + r.name), h('span', { class: 'small muted' }, r.focus))
        )
      )
    );
    const aiOn = SL.ai.enabled();
    const aiBox = aiOn
      ? h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: draft.useAI, onchange: (e) => (draft.useAI = e.target.checked) }), 'שאלות מבינה מלאכותית (אחרת: מנוע כללים)')
      : h('p', { class: 'small muted' }, 'השאלות נוצרות במנוע כללים מקומי. להגדרת מפתח API ושאלות חכמות יותר: ', h('a', { href: '#/settings' }, 'הגדרות'));
    const go = h('button', { class: 'btn primary big', onclick: () => start() }, 'צרו שאלות');
    const trendBox = h('div', null, trendCard(draft.role));

    el.appendChild(
      h('div', { class: 'split' },
        h('div', { class: 'card' },
          h('h2', { style: { marginTop: 0 } }, '1. האפיון'),
          h('div', { class: 'ds-samples' }, sampleBtns),
          h('div', { class: 'field', style: { marginTop: '12px' } }, ta, wc),
          h('p', { class: 'small muted' }, 'אל תדביקו נתונים אמיתיים של ארגון או מידע אישי. לפני יצירת השאלות נבדוק אם יש בטקסט מספרי זהות, מיילים או טלפונים.')
        ),
        h('div', null,
          h('div', { class: 'card' }, h('h2', { style: { marginTop: 0 } }, '2. מי קורא?'), roles, h('div', { style: { margin: '12px 0' } }, aiBox), go),
          trendBox
        )
      )
    );
  }

  function renderLoading(el) {
    el.appendChild(h('div', { class: 'card row', 'aria-live': 'polite' }, h('span', { class: 'spinner' }), roleOf(cur.role).icon + ' ' + roleOf(cur.role).name + ' קורא את האפיון...'));
  }

  async function start() {
    const text = draft.text.trim();
    const words = wordCount(text);
    if (words < 30) return SL.toast('צריך לפחות 30 מילים של אפיון');
    const isSample = !!draft.sample && SAMPLES.some((s) => s.id === draft.sample && s.text.trim() === text);
    let finalText = text;
    if (!isSample) {
      const res = await privacyGate(text);
      if (!res) return;
      if (res === 'mask') {
        finalText = maskPrivacy(text, findPrivacyIssues(text));
        draft.text = finalText;
      }
    }
    cur = { role: draft.role, text: finalText, sample: isSample ? draft.sample : null, words: wordCount(finalText), questions: [], mode: 'rule', notice: null, loading: true };
    rerender();
    let qs = null;
    if (SL.ai.enabled() && draft.useAI) {
      try {
        qs = await generateAIQuestions(finalText, cur.role);
        cur.mode = 'ai';
      } catch (e) {
        cur.notice = 'הבינה המלאכותית לא זמינה (' + e.message + '), ולכן השאלות נוצרו במנוע הכללים.';
      }
    }
    if (!qs) qs = generateRuleQuestions(finalText, cur.role);
    cur.questions = qs.map((q) => Object.assign({ status: 'open' }, q));
    cur.loading = false;
    if (location.hash === '#/lab/devsim') rerender();
  }

  /** BR 23. Resolves true (continue), 'mask', or false. */
  async function privacyGate(text) {
    const issues = findPrivacyIssues(text);
    if (!issues.length) {
      return SL.modal('בדיקת פרטיות', h('div', null,
        h('p', null, 'זה אפיון אישי. אסור לכלול בו נתונים אמיתיים של ארגון או מידע אישי.'),
        h('p', { class: 'small muted' }, 'לא זוהו בטקסט מספרי זהות, מיילים או טלפונים. השאלות נוצרות במחשב שלכם, או נשלחות לבינה מלאכותית רק אם הגדרתם מפתח.')
      ), [
        { label: 'חזרה לעריכה', value: false },
        { label: 'מאשר/ת, אין כאן מידע אמיתי', value: true, primary: true },
      ]).then((v) => v || false);
    }
    const list = h('ul', { class: 'fb-list', 'data-privacy-list': '' },
      issues.map((i) =>
        h('li', { class: 'warn', style: { color: 'var(--text)' } },
          h('b', null, i.label + ': '), h('code', null, i.value),
          h('div', { class: 'ds-ctx', dir: 'auto' }, (i.index > 30 ? '…' : '') + i.before, h('mark', { class: 'ds-mark' }, i.value), i.after + '…')
        )
      )
    );
    return SL.modal('⚠️ זוהה מידע שעלול להיות אישי', h('div', null,
      h('p', null, 'מצאנו בטקסט ' + issues.length + ' פריטים שנראים כמו מידע אישי. אסור לכלול באפיון נתונים אמיתיים של ארגון או של אנשים.'),
      list,
      h('p', { class: 'small muted' }, '"החלפה ב-X" מחליפה את הפריטים בטקסט מוסתר וממשיכה.')
    ), [
      { label: 'חזרה לעריכה', value: false },
      { label: 'החלפה ב-X והמשך', value: 'mask' },
      { label: 'זה לא מידע אמיתי, המשך', value: true, primary: true },
    ]).then((v) => v || false);
  }

  function meter() {
    const gaps = countedGaps(cur).length;
    return h('div', { class: 'ds-meter', 'aria-live': 'polite' },
      h('span', null, h('span', { class: 'score-big' }, gaps), ' פערים מתוך ', cur.questions.length, ' שאלות'),
      h('span', { class: 'tag ' + (per1000(gaps, cur.words) < 3 ? 'good' : 'warn') }, per1000(gaps, cur.words) + ' ל-1,000 מילים'),
      h('span', { class: 'muted small' }, cur.words + ' מילים · ' + (cur.mode === 'ai' ? 'בינה מלאכותית' : 'מנוע כללים'))
    );
  }

  function renderQuestions(el) {
    const role = roleOf(cur.role);
    const meterBox = h('div', null, meter());
    const refreshMeter = () => meterBox.replaceChildren(meter());
    const specView = h('div', { class: 'ds-spec', id: 'ds-spec', dir: 'auto' }, cur.text);
    const qList = h('div', { class: 'stack' });
    cur.questions.forEach((q, i) => qList.appendChild(questionCard(q, i, specView, refreshMeter)));
    if (!cur.questions.length)
      qList.appendChild(h('div', { class: 'notice good' }, 'ל' + role.name + ' אין שאלות על האפיון הזה. כל מה שהוא חיפש כתוב. אפשר לסיים את הסימולציה.'));

    el.appendChild(
      h('div', { class: 'card' },
        h('div', { class: 'row between' }, h('h2', { style: { margin: 0 } }, role.icon + ' ' + role.name + ' שואל'), h('span', { class: 'muted small' }, role.focus)),
        cur.notice ? h('div', { class: 'notice warn', style: { marginTop: '8px' } }, cur.notice) : null,
        h('div', { style: { marginTop: '8px' } }, meterBox),
        h('p', { class: 'small muted' }, 'לכל שאלה: "הוספתי לאפיון" אם התשובה חסרה (נספר כפער), או "כבר כתוב" עם ציטוט מדויק מהאפיון (השאלה יורדת מהספירה אם הציטוט נמצא).')
      )
    );
    el.appendChild(
      h('div', { class: 'split', style: { marginTop: '12px' } },
        h('div', null, qList,
          h('div', { class: 'row', style: { marginTop: '12px' } },
            h('button', { class: 'btn primary', onclick: finish }, 'סיום וחישוב'),
            h('button', { class: 'btn ghost', onclick: async () => { if (await SL.confirm('לבטל את הסימולציה? היא לא תישמר.')) { cur = null; rerender(); } } }, 'ביטול')
          )
        ),
        h('div', { class: 'card ds-sticky' }, h('h3', { style: { marginTop: 0 } }, 'האפיון'), h('p', { class: 'small muted' }, 'סמנו טקסט כאן ולחצו "כבר כתוב" כדי להשתמש בו כציטוט.'), specView)
      )
    );
  }

  function questionCard(q, i, specView, refreshMeter) {
    const card = h('div', { class: 'card ds-q st-' + q.status, 'data-qid': q.id });
    const draw = () => {
      card.className = 'card ds-q st-' + q.status;
      card.replaceChildren(...[
        h('div', { class: 'row between' },
          h('span', { class: 'tag primary' }, catName(q.cat)),
          h('span', { class: 'tag ' + (q.status === 'written' ? 'good' : q.status === 'added' ? 'primary' : 'warn') },
            q.status === 'written' ? '✓ כתוב באפיון · לא נספר' : q.status === 'added' ? 'נוסף לאפיון · נספר כפער' : 'נספר כפער')
        ),
        h('p', { class: 'ds-q-text' }, (i + 1) + '. ' + q.question),
        q.section ? h('div', { class: 'q-snippet', dir: 'auto' }, '📍 ', q.section) : null,
        q.why ? h('p', { class: 'small muted' }, q.why) : null,
        q.note ? h('div', { class: 'notice ' + (q.status === 'written' ? 'good' : 'bad'), style: { margin: '6px 0' } }, q.note) : null,
        q.addition ? h('div', { class: 'small' }, 'נוסף: ', h('i', null, q.addition)) : null,
        actions(),
      ].filter(Boolean));
    };
    const actions = () => {
      const box = h('div', { class: 'row', style: { marginTop: '8px' } });
      const addBtn = h('button', { class: 'btn small', 'data-act': 'added', onclick: () => openAdd(box) }, '✏️ הוספתי לאפיון');
      const wrBtn = h('button', { class: 'btn small', 'data-act': 'written', onclick: () => openQuote(box) }, '📄 כבר כתוב');
      box.append(addBtn, wrBtn);
      if (q.status !== 'open') box.append(h('button', { class: 'btn small ghost', onclick: () => { q.status = 'open'; q.note = null; q.addition = null; draw(); refreshMeter(); } }, 'איפוס'));
      return box;
    };
    const openAdd = (box) => {
      const ta = h('textarea', { rows: 3, placeholder: 'מה הוספתם לאפיון? (רשות - יתווסף לסוף הטקסט)', 'aria-label': 'התוספת לאפיון' });
      box.replaceChildren(
        h('div', { style: { width: '100%' } }, ta,
          h('div', { class: 'row', style: { marginTop: '6px' } },
            h('button', { class: 'btn small primary', 'data-act': 'save-add', onclick: () => {
              const add = ta.value.trim();
              q.status = 'added';
              q.note = null;
              if (add) {
                q.addition = add;
                cur.text += '\n' + add;
                specView.textContent = cur.text;
              }
              draw();
              refreshMeter();
            } }, 'שמירה'),
            h('button', { class: 'btn small ghost', onclick: draw }, 'ביטול')
          )
        )
      );
      ta.focus();
    };
    const openQuote = (box) => {
      const sel = String(window.getSelection ? window.getSelection() : '').trim();
      const inp = h('textarea', { rows: 2, placeholder: 'הדביקו את המשפט מהאפיון שעונה על השאלה', 'aria-label': 'ציטוט מהאפיון', dir: 'auto' });
      inp.value = sel && normalize(cur.text).includes(normalize(sel)) ? sel : '';
      const status = h('span', { class: 'small muted' });
      const check = h('button', { class: 'btn small primary', 'data-act': 'check-quote', onclick: async () => {
        const quote = inp.value.trim();
        const r = quoteInText(cur.text, quote);
        q.quote = quote;
        if (!r.ok) {
          q.status = 'open';
          q.note = '✗ ' + r.message + ' השאלה נשארת בספירה.';
          draw();
          refreshMeter();
          return;
        }
        let note = '✓ הציטוט נמצא באפיון, והשאלה ירדה מהספירה.';
        if (SL.ai.enabled() && draft.useAI) {
          check.disabled = true;
          status.replaceChildren(h('span', { class: 'spinner' }), ' בודק שהציטוט עונה על השאלה...');
          try {
            const v = await aiVerifyQuote(q.question, quote);
            if (!v.answers) {
              q.status = 'open';
              q.note = '✗ הציטוט קיים, אבל לא עונה על השאלה: ' + v.explanation + ' השאלה נשארת בספירה.';
              draw();
              refreshMeter();
              return;
            }
            note += ' ' + v.explanation;
          } catch (e) {
            note += ' (לא ניתן היה לבדוק את ההתאמה עם בינה מלאכותית.)';
          }
        } else if (q.detector && !q.detector.test(quote)) {
          note += ' שימו לב: לא מצאנו בציטוט מונחים שקשורים לשאלה. ודאו שהוא באמת עונה עליה.';
        }
        q.status = 'written';
        q.note = note;
        draw();
        refreshMeter();
      } }, 'בדיקה');
      box.replaceChildren(h('div', { style: { width: '100%' } }, inp, h('div', { class: 'row', style: { marginTop: '6px' } }, check, h('button', { class: 'btn small ghost', onclick: draw }, 'ביטול'), status)));
      inp.focus();
    };
    draw();
    return card;
  }

  async function finish() {
    const open = cur.questions.filter((q) => q.status === 'open').length;
    if (open && !(await SL.confirm(open + ' שאלות עוד לא קיבלו מענה. הן ייספרו כפערים. לסיים?'))) return;
    const gaps = countedGaps(cur);
    const cats = {};
    gaps.forEach((q) => (cats[q.cat] = (cats[q.cat] || 0) + 1));
    const p = per1000(gaps.length, cur.words);
    const run = { role: cur.role, words: cur.words, gapCount: gaps.length, per1000: p, categories: cats, runAt: Date.now(), sample: cur.sample, asked: cur.questions.length, mode: cur.mode };
    if (!Array.isArray(SL.state.devsim)) SL.state.devsim = [];
    SL.state.devsim.push(run);
    SL.save();
    SL.recordGaps('devsim', Object.keys(cats), checklistLabel);
    SL.recordSkill('requirements', Math.max(0, 100 - p * 4));
    SL.recordSkill('failure', Math.max(0, 100 - 25 * (cats.errors || 0)));
    if (INTERFACE_RE.test(cur.text)) SL.recordSkill('interfaces', Math.max(0, 100 - 20 * (cats.interfaces || 0)));
    if (p < 3) SL.awardBadge('devhappy');
    SL.addXP(20, 'סימולציית מפתח');
    SL.markActivity(10);
    cur.finished = true;
    cur.run = run;
    rerender();
  }

  function renderResults(el) {
    const run = cur.run;
    const role = roleOf(run.role);
    const max = Math.max(1, ...Object.values(run.categories));
    const removed = cur.questions.filter((q) => q.status === 'written').length;
    const topCats = Object.keys(run.categories).sort((a, b) => run.categories[b] - run.categories[a]);
    el.appendChild(
      h('div', { class: 'card', id: 'ds-results' },
        h('h2', { style: { marginTop: 0 } }, 'תוצאות · ' + role.icon + ' ' + role.name),
        h('div', { class: 'kpis' },
          h('div', { class: 'kpi' }, h('b', { class: run.per1000 < 3 ? 'good' : 'warn' }, run.per1000), 'פערים ל-1,000 מילים'),
          h('div', { class: 'kpi' }, h('b', null, run.gapCount), 'פערים'),
          h('div', { class: 'kpi' }, h('b', null, removed), 'כבר כתוב (לא נספר)'),
          h('div', { class: 'kpi' }, h('b', null, run.words), 'מילים')
        ),
        run.per1000 < 3
          ? h('div', { class: 'notice good', style: { marginTop: '10px' } }, '🧑‍💻 המפתח מרוצה: פחות מ-3 שאלות לכל 1,000 מילים.')
          : h('p', { class: 'small muted' }, 'היעד: פחות מ-3 פערים לכל 1,000 מילים (תג "המפתח מרוצה").'),
        topCats.length ? h('h3', null, 'פערים לפי קטגוריה') : null,
        topCats.map((c) =>
          h('div', { class: 'ds-bar' }, h('span', null, catName(c)), h('div', { class: 'progress', role: 'img', 'aria-label': catName(c) + ': ' + run.categories[c] }, h('div', { style: { width: (run.categories[c] / max) * 100 + '%' } })), h('b', null, run.categories[c]))
        ),
        topCats.length ? h('h3', null, 'מה להוסיף לאפיון הבא') : null,
        topCats.length ? h('ul', { class: 'fb-list' }, topCats.map((c) => h('li', { class: 'warn' }, h('b', null, catName(c) + ': '), CATS.find((x) => x.id === c).tip))) : null,
        h('div', { class: 'row', style: { marginTop: '14px' } },
          h('button', { class: 'btn primary', onclick: () => { draft.text = cur.text; draft.sample = cur.sample; cur = null; rerender(); } }, 'אותו אפיון, תפקיד אחר'),
          h('button', { class: 'btn', onclick: () => { draft.text = ''; draft.sample = null; cur = null; rerender(); } }, 'סימולציה חדשה'),
          h('a', { class: 'btn ghost', href: '#/progress' }, 'לצ\'קליסט ולהתקדמות')
        )
      )
    );
    el.appendChild(trendCard(run.role));
  }

  // ---------- Trend (BR 18) ----------
  function trendCard(roleId) {
    const role = roleOf(roleId);
    const runs = runsFor(roleId);
    const card = h('div', { class: 'card', id: 'ds-trend', style: { marginTop: '12px' } }, h('h3', { style: { marginTop: 0 } }, 'מגמה · ' + role.name));
    if (runs.length < 3) {
      card.appendChild(h('p', { class: 'muted' }, runs.length ? `יש ${runs.length} סימולציות בתפקיד הזה. המגמה מוצגת מ-3 סימולציות, חסרות עוד ${3 - runs.length}.` : 'עוד אין סימולציות בתפקיד הזה. המגמה מוצגת מ-3 סימולציות באותו תפקיד.'));
    } else {
      card.appendChild(h('p', { class: 'small muted' }, 'פערים לכל 1,000 מילים בכל סימולציה. הקו המקווקו הוא היעד: 3.'));
      card.appendChild(trendSvg(runs.slice(-12)));
      const first = runs[0].per1000;
      const last = runs[runs.length - 1].per1000;
      const change = first ? Math.round(((last - first) / first) * 100) : 0;
      card.appendChild(h('p', { class: 'small' }, `מהסימולציה הראשונה (${first}) לאחרונה (${last}): ` + (change <= 0 ? `ירידה של ${Math.abs(change)}%` : `עלייה של ${change}%`) + '.'));
    }
    if (runs.length) {
      card.appendChild(
        h('details', null, h('summary', { class: 'small' }, 'טבלת סימולציות'),
          h('div', { class: 'table-wrap', style: { marginTop: '6px' } },
            h('table', { class: 'tbl' },
              h('thead', null, h('tr', null, h('th', null, 'תאריך'), h('th', null, 'אפיון'), h('th', null, 'מילים'), h('th', null, 'פערים'), h('th', null, 'ל-1,000'))),
              h('tbody', null, runs.slice().reverse().map((r) =>
                h('tr', null, h('td', null, new Date(r.runAt).toLocaleDateString('he-IL')), h('td', null, r.sample ? (SAMPLES.find((s) => s.id === r.sample) || {}).title || r.sample : 'אישי'), h('td', null, r.words), h('td', null, r.gapCount), h('td', null, r.per1000))
              ))
            )
          )
        )
      );
    }
    return card;
  }
  function trendSvg(runs) {
    const NS = 'http://www.w3.org/2000/svg';
    const W0 = 560, H0 = 200, L = 40, R = 16, T = 14, B = 28;
    const maxV = Math.max(5, ...runs.map((r) => r.per1000)) * 1.1;
    const x = (i) => L + (runs.length === 1 ? 0 : (i * (W0 - L - R)) / (runs.length - 1));
    const y = (v) => T + (1 - v / maxV) * (H0 - T - B);
    const s = (tag, attrs, text) => {
      const e = document.createElementNS(NS, tag);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      if (text != null) e.textContent = text;
      return e;
    };
    const svg = s('svg', { viewBox: `0 0 ${W0} ${H0}`, class: 'ds-chart', role: 'img', 'aria-label': 'מגמת פערים לכל 1,000 מילים: ' + runs.map((r) => r.per1000).join(', ') });
    const grid = s('g', { class: 'grid' });
    const step = maxV > 40 ? 20 : maxV > 20 ? 10 : 5;
    for (let v = 0; v <= maxV; v += step) {
      grid.appendChild(s('line', { x1: L, x2: W0 - R, y1: y(v), y2: y(v) }));
      grid.appendChild(s('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end' }, String(v)));
    }
    svg.appendChild(grid);
    svg.appendChild(s('line', { class: 'goal', x1: L, x2: W0 - R, y1: y(3), y2: y(3) }));
    svg.appendChild(s('path', { class: 'line', d: runs.map((r, i) => (i ? 'L' : 'M') + x(i) + ' ' + y(r.per1000)).join(' ') }));
    runs.forEach((r, i) => {
      const g = s('g', null);
      g.appendChild(s('title', null, `#${i + 1} · ${new Date(r.runAt).toLocaleDateString('he-IL')} · ${r.per1000} ל-1,000 מילים (${r.gapCount} פערים)`));
      g.appendChild(s('circle', { class: 'dot', cx: x(i), cy: y(r.per1000), r: 5 }));
      g.appendChild(s('circle', { class: 'hit', cx: x(i), cy: y(r.per1000), r: 14 }));
      g.appendChild(s('text', { x: x(i), y: H0 - 8, 'text-anchor': 'middle' }, '#' + (i + 1)));
      svg.appendChild(g);
    });
    const last = runs[runs.length - 1];
    svg.appendChild(s('text', { x: x(runs.length - 1) - 8, y: y(last.per1000) - 10, 'text-anchor': 'end', style: 'fill:var(--text);font-weight:700' }, String(last.per1000)));
    return svg;
  }

  // ---------- Register ----------
  SL.route('/lab/devsim', (el) => {
    el.classList && el.classList.remove('narrow');
    render(el);
  });
  SL.registerLab({
    id: 'devsim',
    icon: '🧑‍💻',
    title: 'המפתח שואל',
    desc: 'מדביקים אפיון, ומפתח, בודק QA או איש אבטחה שואלים את מה שחסר. המדד: פערים לכל 1,000 מילים.',
    route: '/lab/devsim',
    skills: ['requirements', 'failure', 'interfaces'],
    count: () => (SL.state.devsim || []).length + ' סימולציות',
  });

  SL.devsim = {
    findPrivacyIssues,
    isValidIsraeliId,
    generateRuleQuestions,
    quoteInText,
    wordCount,
    maskPrivacy,
    findVague,
    samples: SAMPLES,
    roles: ROLES,
    categories: CATS,
  };
})();
