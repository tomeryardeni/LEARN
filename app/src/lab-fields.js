/* SpecQuest lab: fields & interfaces (SpecQuest spec §6.7, SpecLab §6.4 / §6.7).
   Four tabs: field types, field mapping, interface card, failure scenarios.
   Rules: BR 9 (feedback detail by attempt), BR 10 (mapping blocking), BR 13 (feedback per element),
   BR 16 (gap categories), Interface 1 (AI with fallback to rules). */
(function () {
  'use strict';
  const h = SL.h;
  const ROUTE = '/lab/fields';
  let alive = false;
  let saveTimer = null;

  // =====================================================================
  // Trap library (SpecLab §6.4)
  // =====================================================================
  const TRAPS = {
    leadingZeros: { name: 'אפסים מובילים', lesson: 'מזהים שלא מחשבים איתם הם טקסט' },
    decimalPrecision: { name: 'דיוק עשרוני', lesson: 'דיוק נקבע לפי השימוש, לא לפי התצוגה' },
    dateFormat: { name: 'פורמט תאריך', lesson: 'פורמט מפורש בכל ממשק' },
    timezone: { name: 'אזור זמן', lesson: 'הגדרת אזור הזמן שבו נשמר הנתון' },
    nullZero: { name: 'ריק מול אפס', lesson: 'הבחנה בין "לא ידוע" לבין "אפס"' },
    uom: { name: 'יחידות מידה', lesson: 'יחידת מידה כשדה נפרד או ככלל עסקי מתועד' },
    encoding: { name: 'קידוד עברית', lesson: 'הגדרת קידוד בכל ממשק קבצים' },
    multiMeaning: { name: 'שדה עם כמה משמעויות', lesson: 'רשימת ערכים ומשמעות מתועדת לכל ערך' },
  };

  // =====================================================================
  // Tab 1: field types
  // =====================================================================
  const DTYPES = [
    ['', 'בחרו סוג…'],
    ['CHAR', 'CHAR · טקסט באורך קבוע'],
    ['VARCHAR', 'VARCHAR · טקסט באורך משתנה'],
    ['INT', 'INT · מספר שלם'],
    ['BIGINT', 'BIGINT · מספר שלם גדול'],
    ['DECIMAL', 'DECIMAL · מספר עשרוני מדויק'],
    ['FLOAT', 'FLOAT · נקודה צפה'],
    ['DATE', 'DATE · תאריך'],
    ['DATETIME', 'DATETIME · תאריך ושעה (שעון מקומי)'],
    ['DATETIMETZ', 'DATETIME + אזור זמן / UTC'],
    ['BOOLEAN', 'BOOLEAN · כן/לא'],
    ['CODE', 'קוד מטבלת ערכים (FK)'],
  ];
  const typeLabel = (t) => (DTYPES.find((x) => x[0] === t) || [t, t])[1];
  const TEXT_TYPES = ['CHAR', 'VARCHAR'];

  const typeItems = [
    {
      id: 'barcode',
      name: 'ברקוד מוצר (EAN-13)',
      sample: '7290012345678, 0012345678905',
      usage: 'נסרק במסוף במחסן ומושווה לברקוד בכרטיס הפריט. לא מחשבים איתו.',
      types: { CHAR: 'ok', VARCHAR: 'ok' },
      len: { min: 13, max: 14 },
      trap: 'leadingZeros',
      ref: { type: 'CHAR', len: 13 },
      hint: 'בדקו את הדוגמה השנייה: מה יקרה לאפס שבהתחלה אם השדה יוגדר כמספר? והאם מישהו מחשב עם ברקוד?',
      full: 'ברקוד הוא מזהה, לא כמות. בשדה מספרי האפס המוביל נמחק (0012345678905 הופך ל-12345678905) וההשוואה לסריקה נכשלת. נכון: CHAR(13) או VARCHAR(13–14) עם ולידציה של 13 ספרות.',
    },
    {
      id: 'price',
      name: 'מחיר קנייה ליחידה',
      sample: 'בקובץ הספק: 1990 (באגורות, כלומר 19.90 ₪)',
      usage: 'מוכפל בכמות ומסוכם בשורת ההזמנה, בהזמנה ובדוח רכש חודשי.',
      types: { DECIMAL: 'ok', INT: 'partial', BIGINT: 'partial' },
      dec: { pMin: 9, pMax: 19, sMin: 3, sMax: 6, sNear: [2] },
      follow: {
        q: 'הספק שולח באגורות. מה נכון לכתוב באפיון?',
        options: ['שומרים באגורות כמו בקובץ, בלי לציין', 'ממירים לשקלים בממשק (חלוקה ב-100) ומתעדים את הכלל ואת המטבע', 'שומרים באגורות או בשקלים, לפי מה שכל ספק שולח'],
        correct: 1,
      },
      trap: 'decimalPrecision',
      ref: { type: 'DECIMAL', p: 18, s: 4, follow: 1 },
      hint: 'המחיר משתתף בהכפלות ובסיכומים. כמה ספרות אחרי הנקודה צריך כדי שעיגול בכל שורה לא יצטבר לסטייה? ובאיזו יחידה (אגורות או שקלים) הערך נשמר?',
      full: 'דיוק נקבע לפי השימוש ולא לפי התצוגה: מחיר ליחידה שמוכפל בכמות ומסוכם נשמר ב-DECIMAL עם 4 ספרות אחרי הנקודה (למשל DECIMAL(18,4)), והתצוגה מעגלת ל-2. FLOAT יוצר שגיאות עיגול, ו-INT באגורות מחייב שכל המערכות יעבדו באגורות. ההמרה מאגורות לשקלים (חלוקה ב-100) נכתבת במפורש בממשק.',
    },
    {
      id: 'qty',
      name: 'כמות מוזמנת',
      sample: 'בקובץ הספק: 12 (קרטונים; בקרטון 6 יחידות)',
      usage: 'המחסן קולט ובודק כמויות ביחידות בודדות.',
      types: { INT: 'ok', BIGINT: 'ok', DECIMAL: 'ok', FLOAT: 'partial' },
      dec: { pMin: 6, pMax: 18, sMin: 0, sMax: 4 },
      follow: {
        q: 'איך מבחינים בין קרטונים ליחידות?',
        options: ['שדה יחידת מידה נפרד, או המרה ליחידות בממשק עם כלל מתועד', 'אין צורך, ברור מההקשר', 'כותבים "קרטונים" בתיאור הפריט'],
        correct: 0,
      },
      trap: 'uom',
      ref: { type: 'DECIMAL', p: 12, s: 3, follow: 0 },
      hint: 'הספק סופר בקרטונים והמחסן ביחידות. איך מי שקורא את השדה יידע באיזו יחידה המספר?',
      full: 'כמות בלי יחידת מידה היא מלכודת: 12 קרטונים ייקלטו כ-12 יחידות במקום 72. מגדירים שדה יחידת מידה נפרד (UOM), או ממירים ליחידות בממשק לפי גודל הקרטון ומתעדים את הכלל. הסוג: מספר שלם, או DECIMAL אם יש פריטים במשקל.',
    },
    {
      id: 'idnum',
      name: 'תעודת זהות של נהג',
      sample: '012345674',
      usage: 'מזהה את הנהג בקליטה במחסן. בודקים ספרת ביקורת.',
      types: { CHAR: 'ok', VARCHAR: 'ok' },
      len: { min: 9, max: 10 },
      trap: 'leadingZeros',
      ref: { type: 'CHAR', len: 9 },
      hint: 'מה יקרה ל-012345674 בשדה מספרי? והאם מחשבים משהו עם מספר תעודת זהות?',
      full: 'ת"ז היא מזהה בן 9 ספרות שיכול להתחיל ב-0. בשדה מספרי האפס נמחק, האורך משתנה ובדיקת ספרת הביקורת נכשלת. נכון: CHAR(9) עם ולידציה של ספרת ביקורת. זה גם מידע אישי, אז מציינים מי מורשה לראות אותו.',
    },
    {
      id: 'zip',
      name: 'מיקוד',
      sample: '6100101 (ישראל), SW1A 1AA (ספק מאנגליה)',
      usage: 'חלק מכתובת המשלוח. לא מחשבים איתו.',
      types: { VARCHAR: 'ok', CHAR: 'ok' },
      len: { min: 8, max: 12, nearMin: 7, nearMax: 20 },
      trap: 'leadingZeros',
      ref: { type: 'VARCHAR', len: 10 },
      hint: 'האם מחשבים משהו עם מיקוד? ומה עם הדוגמה של הספק מחו"ל, כמה תווים יש בה?',
      full: 'מיקוד הוא טקסט: לא מחשבים איתו, ובחו"ל יש בו אותיות ורווחים (SW1A 1AA, 8 תווים). VARCHAR(10) מכסה מיקוד ישראלי (7 ספרות) ומיקודים זרים נפוצים. בשדה מספרי מיקוד שמתחיל ב-0 מאבד ספרה.',
    },
    {
      id: 'status',
      name: 'סטטוס הזמנת רכש',
      sample: 'פתוחה, אושרה, נקלטה חלקית, נסגרה, בוטלה',
      usage: 'קובע אילו פעולות מותרות על ההזמנה, ומופיע בדוחות.',
      types: { CODE: 'ok', CHAR: 'ok', VARCHAR: 'ok', INT: 'partial' },
      len: { min: 1, max: 30, nearMin: 1, nearMax: 100 },
      follow: {
        q: 'מה עוד חייב להופיע באפיון השדה?',
        options: ['רשימת הערכים המותרים, משמעות כל ערך ומי מעביר בין סטטוסים', 'רק סוג ואורך', 'הצבע של כל סטטוס במסך'],
        correct: 0,
      },
      trap: 'multiMeaning',
      ref: { type: 'CODE', follow: 0 },
      hint: 'מה ימנע ממחלקה אחת לכתוב "סגור" ומאחרת "נסגרה"? ואיפה כתוב מה כל ערך אומר?',
      full: 'סטטוס הוא ערך מתוך רשימה סגורה: קוד מטבלת ערכים (FK), או טקסט קצר עם רשימה מותרת. בלי רשימת ערכים, משמעות ומעברים מתועדים, מחלקות שונות ישתמשו בשדה בדרכים שונות. INT בלי טבלת ערכים לא מסביר את עצמו.',
    },
    {
      id: 'scanTime',
      name: 'זמן סריקה במסוף',
      sample: '31/03/2026 23:50 שעון ישראל. המסוף שולח 2026-03-31T20:50:00Z',
      usage: 'שיוך הקליטה ליום עבודה בדוח הקליטות היומי.',
      types: { DATETIMETZ: 'ok', DATETIME: 'partial' },
      follow: {
        q: 'באיזה אזור זמן נשמר הערך?',
        options: ['UTC (או עם היסט), והדוח היומי ממיר לשעון ישראל', 'כמו שהמסוף שולח, בלי לתעד', 'שומרים רק תאריך, השעה לא חשובה'],
        correct: 0,
      },
      trap: 'timezone',
      ref: { type: 'DATETIMETZ', follow: 0 },
      hint: 'הסריקה הייתה ב-23:50 בישראל, אבל המסוף שלח 20:50Z. לאיזה יום היא תשויך בדוח אם אזור הזמן לא מוגדר?',
      full: 'אירוע סמוך לחצות נרשם ביום הלא נכון כשאזור הזמן לא מוגדר. שומרים תאריך ושעה עם אזור זמן (או ב-UTC בהגדרה מפורשת), והדוח היומי ממיר לשעון ישראל. DATE מאבד את השעה, ו-DATETIME בלי הגדרה משאיר את השאלה פתוחה.',
    },
    {
      id: 'discount',
      name: 'אחוז הנחה מספק',
      sample: '12.5%',
      usage: 'מופעל על המחיר ליחידה לפני סיכום ההזמנה.',
      types: { DECIMAL: 'ok', FLOAT: 'partial' },
      dec: { pMin: 4, pMax: 9, sMin: 2, sMax: 4, sNear: [1] },
      follow: {
        q: 'מה צריך לתעד?',
        options: ['ייצוג (12.5 או 0.125) וטווח מותר 0–100%', 'שום דבר, ברור שזה אחוז', 'לשמור "12.5%" כמו בתצוגה'],
        correct: 0,
      },
      trap: 'decimalPrecision',
      ref: { type: 'DECIMAL', p: 5, s: 2, follow: 0 },
      hint: 'מה יקרה ל-12.5 בשדה של מספר שלם? ואם מערכת אחת שומרת 0.125 ואחרת 12.5?',
      full: 'אחוז הנחה הוא עשרוני: INT מעגל 12.5 ל-12 או ל-13. DECIMAL(5,2) מכסה 0.00–100.00. חובה לתעד את הייצוג (12.5 מול 0.125) ואת הטווח, אחרת הנחה של 12.5% עלולה להיות מחושבת כהנחה של 1,250%.',
    },
    {
      id: 'phone',
      name: 'טלפון נייד של איש קשר בספק',
      sample: '054-1234567, +972-54-1234567',
      usage: 'ליצירת קשר ולשליחת SMS על משלוח.',
      types: { VARCHAR: 'ok', CHAR: 'partial' },
      len: { min: 13, max: 20, nearMin: 10, nearMax: 30 },
      trap: 'leadingZeros',
      ref: { type: 'VARCHAR', len: 20 },
      hint: 'מה קורה ל-0 בתחילת 054 ולסימן + בשדה מספרי? ומה האורך של הדוגמה הבינלאומית?',
      full: 'טלפון הוא טקסט: יש בו 0 מוביל, + ומקפים, ולא מחשבים איתו. VARCHAR(20) מספיק גם לפורמט בינלאומי. כדאי להגדיר פורמט שמירה אחיד (למשל E.164: ‎+972541234567).',
    },
    {
      id: 'counted',
      name: 'כמות שנספרה בספירת מלאי',
      sample: 'ריק (טרם נספר), 0 (נספר ואין מלאי), 37',
      usage: 'דוח הפרשי ספירה משווה את הכמות שנספרה לכמות במערכת.',
      types: { INT: 'ok', BIGINT: 'ok', DECIMAL: 'ok' },
      dec: { pMin: 6, pMax: 18, sMin: 0, sMax: 4 },
      follow: {
        q: 'האם השדה יכול להיות ריק (NULL)?',
        options: ['כן: ריק = טרם נספר, 0 = נספר ואין מלאי', 'לא: ברירת מחדל 0 לכל הפריטים', 'לא משנה, ריק ו-0 הם אותו דבר'],
        correct: 0,
      },
      trap: 'nullZero',
      ref: { type: 'INT', follow: 0 },
      hint: 'אם פריט עוד לא נספר והשדה מקבל 0, מה יראה דוח ההפרשים?',
      full: 'ריק מול אפס: "לא ידוע" ו"אפס" הם שני מצבים שונים. אם ברירת המחדל היא 0, כל פריט שלא נספר ייראה כחוסר מלאי בדוח ההפרשים. השדה מאפשר NULL, ו-0 נשמר רק כשנספר בפועל.',
    },
  ];

  function sizeStatus(item, a) {
    const t = a.type;
    const num = (v) => (v === '' || v == null ? NaN : Number(v));
    if (TEXT_TYPES.includes(t)) {
      const n = num(a.len);
      if (!Number.isFinite(n) || n <= 0) return { st: 'bad', msg: 'חסר אורך לשדה הטקסט' };
      if (!item.len) return { st: 'ok' };
      if (n >= item.len.min && n <= item.len.max) return { st: 'ok' };
      if (item.len.nearMin != null && n >= item.len.nearMin && n <= item.len.nearMax) return { st: 'partial', msg: 'האורך כמעט מתאים. בדקו שוב את הדוגמאות' };
      return { st: 'bad', msg: n < item.len.min ? 'האורך קצר מדי לדוגמאות' : 'האורך גדול בהרבה מהנדרש' };
    }
    if (t === 'DECIMAL') {
      const p = num(a.p);
      const s = num(a.s);
      if (!Number.isFinite(p) || !Number.isFinite(s) || p <= 0 || s < 0) return { st: 'bad', msg: 'חסרים דיוק (סך ספרות) ומספר ספרות אחרי הנקודה' };
      if (s > p) return { st: 'bad', msg: 'מספר הספרות אחרי הנקודה גדול מסך הספרות' };
      const d = item.dec;
      if (!d) return { st: 'ok' };
      const pOk = p >= d.pMin && p <= d.pMax;
      const sOk = s >= d.sMin && s <= d.sMax;
      if (pOk && sOk) return { st: 'ok' };
      if (pOk && d.sNear && d.sNear.includes(s)) return { st: 'partial', msg: 'מספר הספרות אחרי הנקודה לא מספיק לשימוש בחישובים' };
      if (!sOk) return { st: 'bad', msg: 'מספר הספרות אחרי הנקודה לא מתאים לשימוש' };
      return { st: 'bad', msg: p < d.pMin ? 'הדיוק (סך הספרות) קטן מדי' : 'הדיוק (סך הספרות) גדול בהרבה מהנדרש' };
    }
    return { st: 'ok' };
  }

  /** Grade one field-types draft. attempt: submission number (BR 9). */
  function checkTypes(draft, attempt) {
    const full = (attempt || 3) >= 3;
    const out = [];
    let sum = 0;
    typeItems.forEach((it) => {
      const a = (draft && draft[it.id]) || {};
      const W = it.follow ? { type: 0.5, size: 0.25, follow: 0.25 } : { type: 0.6, size: 0.4, follow: 0 };
      const tSt = !a.type ? 'missing' : it.types[a.type] || 'bad';
      let pts = 0;
      const problems = [];
      if (tSt === 'ok') pts += W.type;
      else if (tSt === 'partial') {
        pts += W.type / 2;
        problems.push('הסוג אפשרי, אבל לא הכי מתאים לשימוש');
      } else problems.push(tSt === 'missing' ? 'לא נבחר סוג' : 'הסוג לא מתאים לנתון');
      if (tSt === 'ok' || tSt === 'partial') {
        const sz = sizeStatus(it, a);
        if (sz.st === 'ok') pts += W.size;
        else {
          if (sz.st === 'partial') pts += W.size / 2;
          problems.push(sz.msg);
        }
      }
      if (it.follow) {
        if (String(a.follow) === String(it.follow.correct)) pts += W.follow;
        else problems.push(a.follow == null || a.follow === '' ? 'לא נענתה שאלת ההמשך' : 'התשובה לשאלת ההמשך לא מדויקת');
      }
      pts = Math.round(pts * 1000) / 1000;
      sum += pts;
      const severity = pts >= 0.999 ? 'good' : pts >= 0.5 ? 'warn' : 'bad';
      let text;
      if (severity === 'good') text = 'נכון. ' + TRAPS[it.trap].lesson + '.';
      else if (!full) text = problems.join('. ') + '. ' + it.hint;
      else text = problems.join('. ') + '. ' + it.full + ' תשובת ייחוס: ' + refTypeText(it) + '.';
      out.push({ el: it.id, label: it.name, severity, text, trap: it.trap, points: pts });
    });
    const score = Math.round((100 * sum) / typeItems.length);
    return { score, items: out };
  }
  function refTypeText(it) {
    const r = it.ref;
    let s = r.type === 'CODE' ? 'קוד מטבלת ערכים (FK)' : r.type === 'DATETIMETZ' ? 'DATETIME עם אזור זמן' : r.type;
    if (r.len) s += '(' + r.len + ')';
    if (r.p) s += '(' + r.p + ',' + r.s + ')';
    if (it.follow) s += '; ' + it.follow.options[r.follow];
    return s;
  }
  function refTypesDraft() {
    const d = {};
    typeItems.forEach((it) => {
      const r = it.ref;
      d[it.id] = { type: r.type, len: r.len != null ? String(r.len) : '', p: r.p != null ? String(r.p) : '', s: r.s != null ? String(r.s) : '', follow: r.follow != null ? String(r.follow) : '' };
    });
    return d;
  }

  // =====================================================================
  // Tab 2: field mapping
  // =====================================================================
  const SRC_COLS = ['ORD_NO', 'ORD_DATE', 'SUPP_ID', 'SUPP_ITEM', 'ITEM_DESC', 'QTY_CTN', 'CTN_SIZE', 'PRICE_AG', 'DELIV_DATE', 'REMARKS'];
  const DATE_RE = /DD.?MM.?YY|dd.?mm.?yy|YYYY|yyyy|ISO|פורמט|המר(ה|ת)|convert|parse|to_date|STR_TO_DATE|יום.?חודש|ממיר/i;
  const mappingSpec = {
    fileName: 'SUPP_ORDERS_20261012.csv',
    lines: [
      'ORD_NO;ORD_DATE;SUPP_ID;SUPP_ITEM;ITEM_DESC;QTY_CTN;CTN_SIZE;PRICE_AG;DELIV_DATE;REMARKS',
      'SO-55871;03/04/26;S-1043;AB-778;שמן זית 1 ליטר;12;6;4590;10/04/26;',
      'SO-55871;03/04/26;S-1043;AB-912;רסק עגבניות;40;24;350;10/04/26;דחוף',
      'SO-55872;03/04/26;S-1043;CD-104;פסטה 500 גרם;25;12;;;',
    ],
    notes: [
      'הקובץ מגיע מהספק בקידוד Windows-1255. מערכת הרכש מצפה ל-UTF-8.',
      'כל שורה בקובץ היא שורת הזמנה. כמה שורות עם אותו ORD_NO שייכות לאותה הזמנה.',
      'SUPP_ITEM הוא קוד הפריט אצל הספק, לא המק"ט שלנו. ההתאמה נמצאת בטבלה ItemSupplier.',
      'QTY_CTN היא כמות בקרטונים. CTN_SIZE הוא מספר היחידות בקרטון.',
      'PRICE_AG הוא מחיר ליחידה באגורות, ולפעמים ריק (אז המחיר נלקח מהמחירון).',
      'SUPP_ID הוא קוד הספק בקובץ. בטבלה Supplier יש SupplierId פנימי ושדה SupplierCode.',
    ],
    fileSettings: [
      { id: 'encoding', label: 'קידוד הקובץ', options: [['', 'בחרו…'], ['UTF-8', 'UTF-8'], ['WINDOWS-1255', 'Windows-1255'], ['ISO-8859-8', 'ISO-8859-8'], ['UNKNOWN', 'לא ידוע, נקבע אוטומטית']], correct: 'WINDOWS-1255', trap: 'encoding', hint: 'הקובץ מגיע ממערכת של הספק. מה יקרה לתיאורים בעברית אם נקרא אותו בקידוד הלא נכון?', full: 'קידוד עברית: קובץ ב-Windows-1255 שנקרא כ-UTF-8 מציג ג\'יבריש. מגדירים את הקידוד במפורש בממשק וממירים ל-UTF-8 בקליטה.' },
      { id: 'sep', label: 'מפריד שדות', options: [['', 'בחרו…'], [',', 'פסיק ,'], [';', 'נקודה-פסיק ;'], ['TAB', 'טאב'], ['|', 'קו אנכי |']], correct: ';', hint: 'הסתכלו על שורת הכותרת. איזה תו מפריד בין העמודות?', full: 'המפריד בקובץ הוא נקודה-פסיק (;). מפריד לא נכון יטען כל שורה כעמודה אחת.' },
      { id: 'dateFmt', label: 'פורמט תאריך בקובץ', options: [['', 'בחרו…'], ['DD/MM/YY', 'DD/MM/YY'], ['MM/DD/YY', 'MM/DD/YY'], ['YY/MM/DD', 'YY/MM/DD'], ['YYYY-MM-DD', 'YYYY-MM-DD']], correct: 'DD/MM/YY', trap: 'dateFormat', hint: '03/04/26: האם זה 3 באפריל או 4 במרץ? היעזרו בתאריך האספקה 10/04/26.', full: 'פורמט תאריך: 03/04/26 הוא 3 באפריל 2026 (DD/MM/YY). בלי פורמט מפורש הממשק עלול לקרוא 4 במרץ.' },
    ],
    targets: [
      { id: 'PO.SupplierOrderNo', table: 'PurchaseOrder', field: 'SupplierOrderNo', type: 'VARCHAR(20)', required: true, desc: 'מספר ההזמנה אצל הספק', ref: { source: 'ORD_NO' }, hint: 'איזו עמודה בקובץ מזהה את ההזמנה אצל הספק?', full: 'ממפים מ-ORD_NO, בלי טרנספורמציה. הוא גם מזהה כפילות: אותו ORD_NO מאותו ספק לא נקלט פעמיים.' },
      { id: 'PO.SupplierId', table: 'PurchaseOrder', field: 'SupplierId', type: 'INT (FK)', required: true, desc: 'מזהה הספק אצלנו', ref: { source: 'SUPP_ID', transformRe: /lookup|חיפוש|איתור|שליפ|Supplier|טבלת ספקים|SupplierCode|תרגום|המר|join|מיפוי|התאמ/i, transformMiss: 'חסרה טרנספורמציה: הקוד בקובץ אינו המזהה הפנימי' }, hint: 'הערך בקובץ הוא קוד ספק (S-1043), ובטבלה נשמר מזהה פנימי מספרי. מה צריך לקרות ביניהם?', full: 'ממפים מ-SUPP_ID עם חיפוש (lookup) של SupplierId בטבלה Supplier לפי SupplierCode. ספק שלא נמצא נכנס לתור שגיאות.' },
      { id: 'PO.OrderDate', table: 'PurchaseOrder', field: 'OrderDate', type: 'DATE', required: true, desc: 'תאריך ההזמנה', ref: { source: 'ORD_DATE', transformRe: DATE_RE, transformMiss: 'חסרה המרת פורמט תאריך' }, trap: 'dateFormat', hint: 'באיזה פורמט מגיע התאריך, ובאיזה פורמט הוא נשמר בשדה DATE?', full: 'ממפים מ-ORD_DATE עם המרת פורמט מ-DD/MM/YY ל-YYYY-MM-DD (תאריך תקני).' },
      { id: 'PO.ExpectedDate', table: 'PurchaseOrder', field: 'ExpectedDate', type: 'DATE', required: false, desc: 'תאריך אספקה צפוי', ref: { source: 'DELIV_DATE', transformRe: DATE_RE, transformMiss: 'חסרה המרת פורמט תאריך' }, trap: 'dateFormat', hint: 'גם כאן יש תאריך מהקובץ. האם הוא צריך את אותו טיפול כמו תאריך ההזמנה?', full: 'ממפים מ-DELIV_DATE עם אותה המרת פורמט. אם ריק אפשר להשאיר ריק או להגדיר ברירת מחדל (למשל OrderDate + 7 ימים).' },
      { id: 'PO.Status', table: 'PurchaseOrder', field: 'Status', type: 'VARCHAR(10)', required: true, desc: 'סטטוס ההזמנה', ref: { source: '', needDefault: true }, hint: 'אין עמודת סטטוס בקובץ, והשדה חובה. מה יהיה הסטטוס של הזמנה שנקלטה עכשיו?', full: 'אין מקור בקובץ. ברירת מחדל: OPEN (פתוחה), כי כל הזמנה שנקלטת מהספק מתחילה כפתוחה.' },
      { id: 'PO.Remarks', table: 'PurchaseOrder', field: 'Remarks', type: 'VARCHAR(200)', required: false, desc: 'הערות', ref: { source: 'REMARKS' }, hint: 'יש בקובץ עמודה שמתאימה לשדה הזה?', full: 'ממפים מ-REMARKS. שימו לב שההערה בקובץ היא ברמת שורה ("דחוף"). אפשר גם להעביר אותה לשורת ההזמנה.' },
      { id: 'POL.LineNo', table: 'PurchaseOrderLine', field: 'LineNo', type: 'INT', required: true, desc: 'מספר שורה בהזמנה', ref: { source: '', needDefault: true }, hint: 'אין מספר שורה בקובץ. איך ייווצר מספר לכל שורה?', full: 'אין מקור. ברירת מחדל: מספור רץ (1, 2, 3...) לפי סדר השורות בכל הזמנה.' },
      { id: 'POL.ItemSKU', table: 'PurchaseOrderLine', field: 'ItemSKU', type: 'VARCHAR(20) (FK)', required: true, desc: 'המק"ט שלנו', ref: { source: 'SUPP_ITEM', transformRe: /SKU|מק"?ט|מקט|lookup|ItemSupplier|טבלת המרה|טבלת התאמה|חיפוש|תרגום|המר|join|התאמ/i, transformMiss: 'חסרה המרה מקוד פריט ספק למק"ט שלנו' }, hint: 'AB-778 הוא הקוד אצל הספק. איך מגיעים למק"ט שלנו?', full: 'ממפים מ-SUPP_ITEM עם חיפוש בטבלה ItemSupplier (קוד ספק + קוד פריט ספק → SKU). פריט שלא נמצא נכנס לתור שגיאות ולא נקלט עם קוד הספק.' },
      { id: 'POL.QtyUnits', table: 'PurchaseOrderLine', field: 'QtyUnits', type: 'DECIMAL(12,3)', required: true, desc: 'כמות ביחידות', ref: { source: 'QTY_CTN', transformRe: /CTN_SIZE|\*|×|כפול|הכפל|מכפל|להכפיל|יחידות בקרטון|גודל קרטון|multiply/i, transformMiss: 'חסרה המרה מקרטונים ליחידות' }, trap: 'uom', hint: 'הכמות בקובץ בקרטונים, והשדה ביחידות. מה עוד צריך מהקובץ כדי להמיר?', full: 'ממפים מ-QTY_CTN כפול CTN_SIZE (12 קרטונים × 6 = 72 יחידות).' },
      { id: 'POL.UnitPrice', table: 'PurchaseOrderLine', field: 'UnitPrice', type: 'DECIMAL(18,4)', required: false, desc: 'מחיר ליחידה בשקלים', ref: { source: 'PRICE_AG', transformRe: /\/\s*100|÷\s*100|חלוק|לחלק|מחולק|אגורות|שקל|divide/i, transformMiss: 'חסרה המרה מאגורות לשקלים' }, trap: 'decimalPrecision', hint: 'באיזו יחידה המחיר בקובץ, ובאיזו יחידה השדה ביעד?', full: 'ממפים מ-PRICE_AG חלקי 100 (אגורות לשקלים). אם ריק: ברירת מחדל מהמחירון של הספק.' },
      { id: 'POL.WarehouseId', table: 'PurchaseOrderLine', field: 'WarehouseId', type: 'VARCHAR(5) (FK)', required: true, desc: 'מחסן יעד לקליטה', ref: { source: '', needDefault: true }, hint: 'הספק לא יודע לאיזה מחסן אנחנו קולטים, והשדה חובה. מה עושים?', full: 'אין מקור בקובץ. ברירת מחדל: המחסן המרכזי (למשל 01), או כלל מתועד לפי ספק.' },
    ],
  };

  function refMappingDraft() {
    const R = {
      'PO.SupplierOrderNo': { source: 'ORD_NO' },
      'PO.SupplierId': { source: 'SUPP_ID', transform: 'חיפוש SupplierId בטבלה Supplier לפי SupplierCode (lookup)' },
      'PO.OrderDate': { source: 'ORD_DATE', transform: 'המרת פורמט תאריך מ-DD/MM/YY ל-YYYY-MM-DD' },
      'PO.ExpectedDate': { source: 'DELIV_DATE', transform: 'המרת פורמט תאריך מ-DD/MM/YY ל-YYYY-MM-DD', def: 'אם ריק: OrderDate + 7 ימים' },
      'PO.Status': { source: '', def: 'OPEN' },
      'PO.Remarks': { source: 'REMARKS' },
      'POL.LineNo': { source: '', def: 'מספור רץ 1, 2, 3 לפי סדר השורות בכל הזמנה' },
      'POL.ItemSKU': { source: 'SUPP_ITEM', transform: 'lookup בטבלה ItemSupplier: קוד פריט ספק → SKU שלנו. לא נמצא → תור שגיאות' },
      'POL.QtyUnits': { source: 'QTY_CTN', transform: 'QTY_CTN * CTN_SIZE (קרטונים ליחידות)' },
      'POL.UnitPrice': { source: 'PRICE_AG', transform: 'PRICE_AG / 100 (אגורות לשקלים)', def: 'אם ריק: מחיר מהמחירון' },
      'POL.WarehouseId': { source: '', def: '01 (מחסן מרכזי)' },
    };
    const rows = {};
    mappingSpec.targets.forEach((t) => (rows[t.id] = Object.assign({ source: '', transform: '', def: '', unmapped: false, reason: '' }, R[t.id])));
    return { file: { encoding: 'WINDOWS-1255', sep: ';', dateFmt: 'DD/MM/YY' }, rows };
  }

  const txt = (v) => String(v == null ? '' : v).trim();

  /** BR 10 + grading. draft = {file:{encoding,sep,dateFmt}, rows:{targetId:{source,transform,def,unmapped,reason}}} */
  function checkMapping(draft, attempt) {
    const full = (attempt || 3) >= 3;
    draft = draft || {};
    const rows = draft.rows || {};
    const file = draft.file || {};
    const blocked = [];
    const items = [];
    let sum = 0;
    let total = 0;
    mappingSpec.targets.forEach((t) => {
      const r = rows[t.id] || {};
      const src = r.unmapped ? '' : txt(r.source);
      const def = r.unmapped ? '' : txt(r.def);
      const tr = r.unmapped ? '' : txt(r.transform);
      const covered = r.unmapped ? !!txt(r.reason) : !!(src || def);
      if (t.required && !covered) {
        blocked.push({ id: t.id, msg: r.unmapped ? 'סומן "לא ממופה" בלי נימוק' : 'שדה חובה בלי שדה מקור, בלי ברירת מחדל ובלי סימון "לא ממופה" עם נימוק' });
      }
      const ref = t.ref;
      let pts = 0;
      const problems = [];
      total += 1;
      if (r.unmapped) {
        problems.push('השדה סומן "לא ממופה", אבל יש לו פתרון בקובץ או בברירת מחדל');
        if (!t.required && ref.source && txt(r.reason)) pts = 0.25;
      } else if (ref.source) {
        const wSrc = ref.transformRe ? 0.5 : 1;
        if (src === ref.source) pts += wSrc;
        else problems.push(src ? 'שדה המקור לא מתאים' : 'לא נבחר שדה מקור');
        if (ref.transformRe) {
          if (src === ref.source && ref.transformRe.test(tr)) pts += 0.5;
          else if (src === ref.source) problems.push(ref.transformMiss);
        }
      } else if (ref.needDefault) {
        if (!src) pts += 0.4;
        else problems.push('אין בקובץ עמודה שמתאימה לשדה הזה');
        if (def || (!src && tr)) pts += 0.6;
        else problems.push('חסרה ברירת מחדל');
      }
      pts = Math.round(pts * 1000) / 1000;
      sum += pts;
      const severity = pts >= 0.999 ? 'good' : pts >= 0.5 ? 'warn' : 'bad';
      let text;
      if (severity === 'good') text = 'נכון.';
      else if (!full) text = problems.join('. ') + '. ' + t.hint;
      else text = problems.join('. ') + '. ' + t.full;
      items.push({ el: t.id, label: t.table + '.' + t.field, severity, text, points: pts });
    });
    mappingSpec.fileSettings.forEach((fs) => {
      total += 0.5;
      const v = file[fs.id] || '';
      const ok = v === fs.correct;
      if (ok) sum += 0.5;
      items.push({
        el: 'file.' + fs.id,
        label: fs.label,
        severity: ok ? 'good' : 'bad',
        text: ok ? 'נכון.' : (v ? 'הערך לא מתאים לקובץ. ' : 'לא הוגדר. ') + (full ? fs.full : fs.hint),
        points: ok ? 0.5 : 0,
      });
    });
    const score = Math.round((100 * sum) / total);
    return { ok: blocked.length === 0, blocked, items, score };
  }

  // =====================================================================
  // Tab 3: interface card (15 components)
  // =====================================================================
  const SYS_OPTS = [['', 'בחרו…'], ['ERP', 'ERP (רכש ופריטים)'], ['WMS', 'WMS (ניהול מחסן)'], ['BI', 'מחסן נתונים (BI)'], ['ECOM', 'אתר מכירות']];
  const SKU_RE = /SKU|מק"?ט|מקט|ItemCode|item.?code|קוד פריט|item.?no\b|ItemNo|PartNo|מספר פריט/i;
  const INTERNAL_RE = /\bid\b|ItemId|מזהה פנימי|identity|row.?id|מספר רשומה|auto.?inc|מספור אוטומטי|GUID/i;
  const DEDUP_RE = /upsert|merge|unique|ייחוד|ייחודי|אידמפוט|idempot|אם קיים|אם הפריט קיים|כבר קיים|insert or update|עדכון במקום|מפתח ההתאמה|לפי מפתח|לפי SKU|לפי מק"?ט|message.?id|מזהה הודעה|גרסה|version|חותמת זמן|timestamp/i;
  const RETRY_RE = /retry|ניסיון חוזר|ניסיונות חוזרים|ניסיון נוסף|לנסות שוב|ננסה שוב|back.?off/i;
  const QUEUE_RE = /queue|תור|DLQ|dead.?letter|טבלת שגיאות|לוג שגיאות|error.?log|תיקיית שגיאות|נשמר|נשמרת|נשמרות/i;
  const RERUN_RE = /הרצה חוזרת|הרצה מחדש|re.?run|re.?send|replay|שליחה חוזרת|שליחה מחדש|הפעלה ידנית|השלמה|לשלוח מחדש/i;
  const RECIP_RE = /@|מנהל|אחראי|צוות|תמיכה|מוקד|\bIT\b|מערכות מידע|אדמין|admin|support|team|בעלים|כונן|on.?call|מפעיל|helpdesk|הלפדסק|רכש|מחסן|טלפון|SMS/i;
  const NUM_RE = /\d/;
  const UNIT_RE = /רשומות|רשומה|פריטים|פריט|הודעות|הודעה|שורות|שינויים|קבצים|records?|items?|messages?|rows|MB|KB|GB|ליום|ביום|בשעה|לשעה|בדקה|per\s*(day|hour)|\/\s*(day|hour|יום|שעה)/i;
  const TRIGGER_RE = /שינוי|יצירה|יצירת|עדכון|אירוע|event|תזמון|מתוזמן|schedule|cron|\bכל\s|שמירה|webhook|הוספה|פתיחת|לחיצה|ידני|trigger/i;
  const FREQ_RE = /\d+\s*(דק|שנ|שע|ימ|min|sec|hour|hr|h\b|m\b)|בזמן אמת|real.?time|מיידי|מיד\b|online|כל שעה|כל דקה|יומי|פעם ביום|לילי|כל לילה|near.?real|שבועי/i;
  const FMT_RE = /JSON|XML|CSV|TXT|קבוע|fixed|flat|שטוח|EDI|EDIFACT|IDoc/i;
  const FILEFMT_RE = /CSV|TXT|קבוע|fixed|flat|שטוח/i;
  const ENC_RE = /UTF|1255|קידוד|encoding|ASCII|unicode/i;

  const CARD = [
    { id: 'source', label: 'מקור', kind: 'select', options: SYS_OPTS, q: 'איזו מערכת היא בעלת הנתון (master) של כרטיס הפריט?' },
    { id: 'target', label: 'יעד', kind: 'select', options: SYS_OPTS, q: 'איזו מערכת צריכה את הפריטים כדי לקלוט סחורה?' },
    { id: 'initiator', label: 'יוזם', kind: 'select', options: [['', 'בחרו…'], ['push', 'המקור דוחף (Push)'], ['pull', 'היעד מושך (Pull)'], ['middleware', 'שכבת אינטגרציה (Middleware)'], ['manual', 'משתמש, ידנית']], q: 'מי מתחיל את העברת הנתונים, ומה קורה אם אף אחד לא זוכר להפעיל?' },
    { id: 'method', label: 'שיטה', kind: 'select', options: [['', 'בחרו…'], ['api', 'REST API'], ['file', 'קובץ בתיקייה משותפת / SFTP'], ['mq', 'תור הודעות'], ['db', 'קריאה ישירה מבסיס הנתונים']], q: 'איך הנתונים עוברים פיזית בין המערכות?' },
    { id: 'trigger', label: 'טריגר', kind: 'text', ph: 'מה מפעיל את הממשק?', q: 'איזה אירוע או תזמון מפעיל את הממשק?' },
    { id: 'frequency', label: 'תדירות', kind: 'text', ph: 'למשל: כל 15 דקות', q: 'כל כמה זמן הממשק רץ? מספר ויחידת זמן, או "בזמן אמת"' },
    { id: 'load', label: 'טעינה', kind: 'select', options: [['', 'בחרו…'], ['full', 'מלאה בכל ריצה'], ['incr', 'מצטברת (רק שינויים)'], ['incr+full', 'מצטברת, וטעינה מלאה ראשונית ותקופתית']], q: 'האם בכל ריצה עוברים כל 5,000 הפריטים, או רק מה שהשתנה? ואיך מתחילים בפעם הראשונה?' },
    { id: 'format', label: 'פורמט', kind: 'text', ph: 'למשל: JSON, UTF-8', q: 'באיזה פורמט עוברים הנתונים, ובאיזה קידוד?' },
    { id: 'data', label: 'נתונים', kind: 'textarea', ph: 'אילו שדות עוברים? (מופרדים בפסיקים)', wide: true, q: 'אילו שדות של כרטיס הפריט המחסן צריך?' },
    { id: 'matchKey', label: 'מפתח התאמה', kind: 'text', ph: 'לפי מה מזהים פריט ביעד?', q: 'לפי איזה שדה ה-WMS יודע שזה אותו פריט? האם השדה הזה קיים בשתי המערכות?' },
    { id: 'dedup', label: 'מניעת כפילויות', kind: 'textarea', ph: 'מה קורה אם אותו פריט נשלח פעמיים?', q: 'מה קורה אם אותו פריט נשלח פעמיים, או אם הממשק רץ פעמיים?' },
    { id: 'failure', label: 'טיפול בכשל', kind: 'textarea', ph: 'מה קורה כשה-WMS לא זמין או רשומה נדחית?', q: 'מה קורה כשה-WMS לא זמין, ומה קורה לרשומה בודדת שנדחתה?' },
    { id: 'alerts', label: 'התראות', kind: 'textarea', ph: 'מי מקבל התראה, מתי ובאיזה ערוץ?', q: 'מי בדיוק מקבל התראה, ובאיזה מצב?' },
    { id: 'volume', label: 'נפח', kind: 'text', ph: 'למשל: 200 שינויים ביום', q: 'כמה רשומות עוברות, ביום רגיל ובשיא?' },
    { id: 'owner', label: 'בעלים', kind: 'text', ph: 'מי אחראי על הממשק?', q: 'מי אחראי על הממשק ועל הנתון, ולמי פונים כשיש בעיה?' },
  ];
  const cardLabel = (id) => (CARD.find((c) => c.id === id) || { label: id }).label;

  const REF_CARD = {
    source: 'ERP',
    target: 'WMS',
    initiator: 'push',
    method: 'api',
    trigger: 'יצירה או עדכון של פריט ב-ERP (אירוע שמירה), וגם הפעלה ידנית לטעינה מלאה',
    frequency: 'בזמן אמת (עד דקה מהשינוי). טעינה מלאה פעם בשבוע בלילה',
    load: 'incr+full',
    format: 'JSON, UTF-8',
    data: 'SKU, תיאור, יחידת מידה, יחידות בקרטון, ברקוד, משקל, נפח, סטטוס פריט',
    matchKey: 'SKU (מק"ט): מפתח עסקי שקיים בשתי המערכות',
    dedup: 'upsert לפי SKU: אם הפריט קיים מעדכנים, אחרת יוצרים. לכל הודעה מזהה הודעה ייחודי וחותמת זמן, והודעה ישנה לא דורסת חדשה',
    failure: 'ניסיונות חוזרים: 3 ניסיונות אחרי 1, 5 ו-15 דקות. אחר כך ההודעה נשמרת בתור שגיאות, ואפשר הרצה חוזרת לרשומה בודדת אחרי תיקון',
    alerts: 'מייל ל-it-integration@company.co.il ולמנהל המחסן כשהודעה נכשלה אחרי 3 ניסיונות, או כשאין ריצה מוצלחת 60 דקות',
    volume: '5,000 פריטים בטעינה מלאה. כ-200 שינויים ביום, ובשיא (החלפת קטלוג) עד 2,000 שינויים ביום',
    owner: 'צוות מערכות מידע (אחראית: מנהלת ה-ERP). בעלת הנתון: מחלקת רכש',
  };
  const FULL_TIPS = {
    source: 'ה-ERP הוא בעל כרטיס הפריט: שם נפתחים ומתעדכנים פריטים.',
    target: 'ה-WMS צריך את הפריטים כדי לקלוט ולנהל מלאי.',
    initiator: 'עדיף יוזם אוטומטי (המקור דוחף או שכבת אינטגרציה). הפעלה ידנית תלויה בזיכרון של אדם.',
    method: 'API או תור הודעות. קריאה ישירה מבסיס הנתונים של מערכת אחרת יוצרת תלות במבנה הפנימי שלה ונשברת בשדרוג.',
    trigger: 'כותבים מה מפעיל: אירוע (יצירה או עדכון של פריט) או תזמון מפורש.',
    frequency: 'תדירות היא מספר ויחידת זמן ("כל 15 דקות") או "בזמן אמת" עם זמן תגובה.',
    load: 'לכרטיס פריט מתאימה טעינה מצטברת, עם טעינה מלאה ראשונית ותקופתית ליישור פערים.',
    format: 'מציינים פורמט וקידוד. בקובץ שטוח (CSV) חובה לציין קידוד ומפריד.',
    data: 'רשימת השדות כוללת את המפתח (SKU) ואת מה שהמחסן צריך: יחידת מידה, יחידות בקרטון, ברקוד, משקל.',
    matchKey: 'מפתח התאמה הוא מפתח עסקי שקיים בשתי המערכות, כמו SKU. מזהה פנימי של ה-ERP לא קיים ב-WMS.',
    dedup: 'מניעת כפילויות: upsert לפי מפתח ייחודי, ומזהה הודעה או חותמת זמן כדי שהודעה ישנה לא תדרוס חדשה.',
    failure: 'טיפול בכשל כולל ניסיונות חוזרים, תור שגיאות, והרצה חוזרת לרשומה בודדת.',
    alerts: 'התראה מציינת נמען מוגדר (צוות, תפקיד או כתובת), מתי היא נשלחת ובאיזה ערוץ.',
    volume: 'נפח הוא מספר ויחידה ("200 שינויים ביום"), כולל נפח שיא.',
    owner: 'בעלים הוא אדם או צוות מוגדר שאחראי על הממשק ולמי פונים בתקלה.',
  };

  function ruleOne(c, card) {
    const v = txt(card[c.id]);
    const R = (severity, comment) => ({ severity, comment });
    switch (c.id) {
      case 'source':
        if (!v) return R('missing', 'לא נבחר מקור');
        return v === 'ERP' ? R('ok', 'נכון') : R('missing', 'המקור שנבחר אינו בעל הנתון');
      case 'target':
        if (!v) return R('missing', 'לא נבחר יעד');
        if (v === txt(card.source)) return R('missing', 'המקור והיעד זהים');
        return v === 'WMS' ? R('ok', 'נכון') : R('missing', 'היעד שנבחר לא צריך את הנתון בתרחיש');
      case 'initiator':
        if (!v) return R('missing', 'לא נבחר יוזם');
        return v === 'manual' ? R('partial', 'יוזם ידני תלוי באדם') : R('ok', 'מוגדר יוזם אוטומטי');
      case 'method':
        if (!v) return R('missing', 'לא נבחרה שיטה');
        return v === 'db' ? R('partial', 'גישה ישירה לבסיס נתונים יוצרת תלות') : R('ok', 'שיטה מוגדרת');
      case 'trigger':
        if (!v) return R('missing', 'לא הוגדר טריגר');
        return TRIGGER_RE.test(v) ? R('ok', 'מוגדר מה מפעיל את הממשק') : R('partial', 'לא ברור אם הטריגר הוא אירוע או תזמון');
      case 'frequency':
        if (!v) return R('missing', 'לא הוגדרה תדירות');
        return FREQ_RE.test(v) ? R('ok', 'תדירות מדידה') : R('partial', 'התדירות לא מדידה: חסר מספר ויחידת זמן');
      case 'load':
        if (!v) return R('missing', 'לא נבחר סוג טעינה');
        if (v === 'full') return R('partial', 'טעינה מלאה של כל הפריטים בכל ריצה מעמיסה ומסתירה מה השתנה');
        return v === 'incr' ? R('partial', 'טעינה מצטברת טובה, אבל איך נטענים הפריטים בפעם הראשונה ואיך מיישרים פערים?') : R('ok', 'טעינה מוגדרת');
      case 'format':
        if (!v) return R('missing', 'לא הוגדר פורמט');
        if (!FMT_RE.test(v)) return R('partial', 'לא ברור מה הפורמט');
        if (FILEFMT_RE.test(v) && !ENC_RE.test(v)) return R('partial', 'קובץ שטוח בלי קידוד מוגדר');
        return R('ok', 'פורמט מוגדר');
      case 'data': {
        if (!v) return R('missing', 'לא פורטו נתונים');
        const n = v.split(/[,،\n;]+/).map((x) => x.trim()).filter(Boolean).length;
        if (!SKU_RE.test(v)) return R('partial', 'רשימת הנתונים לא כוללת את מפתח הפריט');
        return n >= 4 ? R('ok', 'רשימת שדות מפורטת') : R('partial', 'רשימת השדות קצרה מדי');
      }
      case 'matchKey':
        if (!v) return R('missing', 'לא הוגדר מפתח התאמה');
        if (SKU_RE.test(v)) return R('ok', 'מפתח עסקי שקיים בשתי המערכות');
        if (INTERNAL_RE.test(v)) return R('partial', 'נראה כמו מזהה פנימי, שלא קיים במערכת היעד');
        return R('partial', 'לא ברור אם המפתח קיים בשתי המערכות');
      case 'dedup':
        if (!v) return R('missing', 'לא הוגדרה מניעת כפילויות');
        return DEDUP_RE.test(v) ? R('ok', 'מוגדר מנגנון לפי מפתח ייחודי') : R('partial', 'לא ברור לפי מה מזהים כפילות ומה קורה בה');
      case 'failure': {
        if (!v) return R('missing', 'לא הוגדר טיפול בכשל');
        const k = [RETRY_RE, QUEUE_RE, RERUN_RE].filter((re) => re.test(v)).length;
        if (k >= 2) return R('ok', 'מוגדרים ניסיונות חוזרים, תור או הרצה חוזרת');
        return R('partial', k === 1 ? 'מוגדר רק חלק מהטיפול (ניסיון חוזר, תור שגיאות, הרצה חוזרת)' : 'לא מוגדר מה קורה לנתונים בזמן הכשל');
      }
      case 'alerts':
        if (!v) return R('missing', 'לא הוגדרו התראות');
        return RECIP_RE.test(v) ? R('ok', 'מוגדר נמען') : R('partial', 'לא מוגדר מי מקבל את ההתראה');
      case 'volume':
        if (!v) return R('missing', 'לא הוגדר נפח');
        if (NUM_RE.test(v) && UNIT_RE.test(v)) return R('ok', 'נפח עם מספר ויחידה');
        return R('partial', NUM_RE.test(v) ? 'חסרה יחידה (רשומות ביום? בשעה?)' : 'חסר מספר');
      case 'owner':
        if (!v) return R('missing', 'לא הוגדרו בעלים');
        if (/^(לא ידוע|לא יודע|tbd|\?+|-+|אין)$/i.test(v) || v.length < 3) return R('partial', 'הבעלים לא מוגדרים בפועל');
        return R('ok', 'מוגדרים בעלים');
    }
    return R('missing', '');
  }

  /** Rule-based interface card check (no AI). Returns {items:[{component,label,severity,comment}], score, skills, missing}. */
  function checkCard(card, attempt) {
    card = card || {};
    const full = (attempt || 3) >= 3;
    const items = CARD.map((c) => {
      const r = ruleOne(c, card);
      let comment = r.comment;
      if (r.severity !== 'ok') comment += '. ' + (full ? FULL_TIPS[c.id] + ' דוגמה: ' + refCardText(c.id) : c.q);
      return { component: c.id, label: c.label, severity: r.severity, comment };
    });
    return summarizeCard(items);
  }
  function summarizeCard(items) {
    const val = (s) => (s === 'ok' ? 1 : s === 'partial' ? 0.5 : 0);
    const score = Math.round((100 * items.reduce((a, i) => a + val(i.severity), 0)) / CARD.length);
    const fIds = ['dedup', 'failure', 'alerts'];
    const failure = Math.round((100 * fIds.reduce((a, id) => a + val((items.find((i) => i.component === id) || {}).severity), 0)) / fIds.length);
    return { items, score, skills: { interfaces: score, failure }, missing: items.filter((i) => i.severity === 'missing').map((i) => i.component) };
  }
  function refCardText(id) {
    const c = CARD.find((x) => x.id === id);
    const v = REF_CARD[id];
    if (c && c.kind === 'select') return (c.options.find((o) => o[0] === v) || [v, v])[1];
    return v;
  }

  const AI_SCHEMA = {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            component: { type: 'string', enum: CARD.map((c) => c.id) },
            severity: { type: 'string', enum: ['ok', 'partial', 'missing'] },
            comment: { type: 'string' },
          },
          required: ['component', 'severity', 'comment'],
          additionalProperties: false,
        },
      },
      score: { type: 'number' },
    },
    required: ['items', 'score'],
    additionalProperties: false,
  };

  async function aiCheckCard(card, attempt) {
    const full = attempt >= 3;
    const values = {};
    CARD.forEach((c) => {
      const v = txt(card[c.id]);
      values[c.id] = c.kind === 'select' ? (c.options.find((o) => o[0] === v) || ['', ''])[1] || '' : v;
    });
    const rubric = CARD.map((c) => '- ' + c.id + ' (' + c.label + '): ' + FULL_TIPS[c.id]).join('\n');
    const prompt =
      'תרחיש: חברת הפצה. ממשק כרטיסי פריט (Item master) מה-ERP ל-WMS. ב-ERP כ-5,000 פריטים פעילים, כ-200 שינויים ביום, ובשיא עד 2,000. ה-WMS צריך את הפריטים כדי לקלוט סחורה.\n\n' +
      'מחוון לכל רכיב:\n' + rubric + '\n\n' +
      'כרטיס הממשק של הלומד (JSON):\n' + JSON.stringify(values, null, 2) + '\n\n' +
      'החזר פריט אחד לכל אחד מ-15 הרכיבים. severity: ok = מלא ונכון, partial = קיים אבל עמום או חלקי, missing = חסר או שגוי. ' +
      'comment בעברית, משפט או שניים, מקושר לרכיב. ' +
      (full ? 'זה ניסיון שלישי ומעלה: הסבר מה נכון ולמה, ותן דוגמה.' : 'זה ניסיון ראשון או שני: הצבע על הבעיה ושאל שאלה מכוונת, בלי לחשוף את התשובה.') +
      ' score: 0 עד 100, לפי ok=1, partial=0.5, missing=0 חלקי 15.';
    const res = await SL.ai.call({
      system: 'אתה מנטור לאפיון טכני של ממשקים בין מערכות. אתה בודק כרטיס ממשק מול מחוון ומחזיר JSON בלבד.',
      prompt,
      schema: AI_SCHEMA,
      maxTokens: 4000,
    });
    if (!res || !Array.isArray(res.items)) throw new Error('תשובת הבינה המלאכותית לא במבנה הצפוי');
    const rule = checkCard(card, attempt);
    const items = CARD.map((c) => {
      const a = res.items.find((i) => i && i.component === c.id && ['ok', 'partial', 'missing'].includes(i.severity));
      return a ? { component: c.id, label: c.label, severity: a.severity, comment: String(a.comment || '') } : rule.items.find((i) => i.component === c.id);
    });
    return summarizeCard(items);
  }

  // =====================================================================
  // Tab 4: failure scenarios (SpecLab §6.7)
  // =====================================================================
  const failureScenarios = [
    {
      id: 'twice',
      title: 'הממשק רץ פעמיים באותו חלון זמן',
      story: 'בגלל תקלה בתזמון, ממשק קליטת הזמנות הרכש מהספק רץ פעמיים תוך 5 דקות על אותו קובץ.',
      checks: 'מניעת כפילויות',
      options: [
        'לחסום הפעלה ידנית של הממשק בשעות העבודה',
        'לכל הזמנה ושורה מפתח ייחודי (ספק + מספר הזמנה + שורה). קליטה לפי upsert: הרצה שנייה מעדכנת או מדלגת, ולא יוצרת כפילות',
        'פעם בשבוע להריץ שאילתה שמוצאת כפילויות ולמחוק אותן ידנית',
        'להוסיף לכל רשומה שדה "תאריך טעינה" כדי שאפשר יהיה לזהות אותה',
      ],
      correct: 1,
      hint: 'מה יבטיח שהרצה שנייה על אותם נתונים לא תשנה את התוצאה? חשבו על מפתח.',
      explain: 'ממשק צריך להיות אידמפוטנטי: הרצה חוזרת על אותם נתונים מגיעה לאותה תוצאה. מפתח ייחודי עסקי ו-upsert מונעים כפילות כבר בקליטה. ניקוי ידני מאוחר משאיר בינתיים הזמנות כפולות אצל המחסן, ושדה תאריך טעינה רק עוזר לזהות כפילות אחרי שקרתה.',
      reasonRe: /מפתח|ייחוד|upsert|אידמפוט|idempot|כפיל/i,
    },
    {
      id: 'down',
      title: 'מערכת היעד לא זמינה שלוש שעות',
      story: 'ה-WMS בהשבתה לא מתוכננת מ-09:00 עד 12:00. בזמן הזה נוצרו ב-ERP 40 פריטים חדשים ו-15 הזמנות רכש.',
      checks: 'ניסיונות חוזרים, תור, והשלמה אחרי החזרה',
      options: [
        'לדלג על הנתונים של שלוש השעות ולהמשיך מהריצה הבאה',
        'לנסות לשלוח שוב כל שנייה עד שהמערכת חוזרת',
        'לשמור את ההודעות בתור, לנסות שוב במרווחים הולכים וגדלים, לשלוח התראה אחרי מספר ניסיונות, ובחזרת המערכת להשלים את כל ההודעות לפי הסדר',
        'לשלוח את הנתונים במייל למחסן כדי שיקלידו ידנית',
      ],
      correct: 2,
      hint: 'איפה הנתונים "מחכים" בזמן ההשבתה, ומה מבטיח שאף אחד מהם לא ילך לאיבוד?',
      explain: 'בזמן השבתה הנתונים נשמרים בתור ולא הולכים לאיבוד. ניסיונות חוזרים במרווחים הולכים וגדלים (back-off) לא מציפים את המערכת כשהיא עולה, התראה מעדכנת את האחראי, וההשלמה לפי הסדר שומרת על עקביות (פריט לפני הזמנה שמשתמשת בו). ניסיון כל שנייה יוצר עומס, ודילוג מאבד נתונים.',
      reasonRe: /תור|queue|retry|ניסיון|השלמה|התראה|back.?off/i,
    },
    {
      id: 'column',
      title: 'קובץ הגיע בלי אחת העמודות',
      story: 'קובץ ההזמנות מהספק הגיע בלי העמודה CTN_SIZE (יחידות בקרטון).',
      checks: 'ולידציה, דחייה או טעינה חלקית, והתראה',
      options: [
        'ולידציית מבנה לפני הטעינה: הקובץ נדחה (או נטען חלקית לפי כלל מתועד), עובר לתיקיית שגיאות, ונשלחת התראה לספק ולאחראי הממשק',
        'לטעון את הקובץ ולמלא בעמודה החסרה 1',
        'לטעון לפי מיקום העמודות כרגיל, כי שאר העמודות קיימות',
        'למחוק את הקובץ בשקט ולחכות לקובץ הבא',
      ],
      correct: 0,
      hint: 'מה יקרה לכמויות אם CTN_SIZE חסר ומשהו "ימלא" אותו? ומי צריך לדעת שהקובץ לא תקין?',
      explain: 'בודקים מבנה לפני טעינה. בלי CTN_SIZE אי אפשר להמיר קרטונים ליחידות, וערך ברירת מחדל ייצור כמויות שגויות בשקט. טעינה לפי מיקום תזיז את כל העמודות. הקובץ נדחה או נטען חלקית לפי כלל מתועד, נשמר לבדיקה, ונשלחת התראה כדי שהספק ישלח קובץ מתוקן.',
      reasonRe: /ולידצי|בדיק|דחי|התראה|מבנה|validation/i,
    },
    {
      id: 'sku',
      title: 'רשומה עם מק"ט שלא קיים ביעד',
      story: 'בקובץ של 120 שורות, שורה אחת מתייחסת לפריט שעוד לא נפתח ב-WMS.',
      checks: 'תור שגיאות והרצה חוזרת לרשומה בודדת',
      options: [
        'לדחות את כל הקובץ עד שהפריט ייפתח',
        'ליצור ב-WMS פריט חדש אוטומטית, עם התיאור מהקובץ',
        'לדלג על השורה בלי לתעד, כדי לא לעכב את השאר',
        'השורה נכנסת לתור שגיאות עם סיבה, שאר השורות נקלטות, ואחרי פתיחת הפריט מריצים מחדש את השורה הבודדת',
      ],
      correct: 3,
      hint: 'האם שורה אחת צריכה לעצור 119 שורות תקינות? ומה מבטיח שהשורה הבעייתית לא תישכח?',
      explain: 'תקלה ברשומה בודדת מטופלת ברמת הרשומה: היא נשמרת בתור שגיאות עם סיבה, השאר נקלטות, ואחרי התיקון מריצים מחדש רק אותה. דחיית כל הקובץ עוצרת את המחסן, יצירת פריט אוטומטית עוקפת את בעל הנתון (ה-ERP), ודילוג בלי תיעוד מאבד הזמנה.',
      reasonRe: /תור|שגיא|הרצה|בודד|רשומה|queue/i,
    },
    {
      id: 'processed',
      title: 'עדכון לרשומה שכבר עובדה ביעד',
      story: 'הספק שלח עדכון כמות לשורת הזמנה שהמחסן כבר קלט במלואה.',
      checks: 'טיפול בשינויים אחרי קליטה',
      options: [
        'לדרוס תמיד את הרשומה ביעד עם הערך החדש',
        'כלל מתועד: שינוי מתקבל רק במצב שמאפשר אותו (למשל לפני קליטה). אחרת הוא עובר לתור חריגים עם התראה לגורם אחראי. חותמת זמן או גרסה מונעות מעדכון ישן לדרוס חדש',
        'להתעלם מכל עדכון שמגיע אחרי היצירה הראשונה',
        'ליצור רשומה חדשה לכל עדכון',
      ],
      correct: 1,
      hint: 'האם כל עדכון מותר בכל שלב? מה קורה לכמות שכבר נקלטה במחסן אם דורסים אותה?',
      explain: 'אחרי שהרשומה עובדה ביעד (נקלטה), שינוי עלול לסתור את מה שקרה בפועל. מגדירים לפי סטטוס מתי שינוי מותר, ומה קורה כשלא: תור חריגים והתראה לגורם שמחליט. גרסה או חותמת זמן מונעות מעדכון ישן לדרוס חדש. דריסה עיוורת משבשת מלאי, התעלמות מאבדת שינויים לגיטימיים, ורשומה חדשה לכל עדכון יוצרת כפילות.',
      reasonRe: /סטטוס|מצב|חריג|גרסה|חותמת|version|כלל/i,
    },
    {
      id: 'peak',
      title: 'נפח כפול מהרגיל בסוף חודש',
      story: 'בשלושת הימים האחרונים בחודש מספר הזמנות הרכש מכפיל את עצמו, והממשק מתחיל לסיים אחרי תחילת המשמרת במחסן.',
      checks: 'עמידה בזמנים ובעומס',
      options: [
        'אין צורך לטפל. הממשק כבר עובד בשאר החודש',
        'להריץ את הממשק רק בלילה בימי סוף החודש',
        'להגדיר באפיון נפח שיא (פי 2 ומעלה) וזמן סיום מרבי, לבדוק עומס מראש, לעבד במנות, ולשלוח התראה אם הריצה חורגת מהזמן',
        'לבקש מהספקים לשלוח פחות הזמנות בסוף החודש',
      ],
      correct: 2,
      hint: 'מה כתוב באפיון על נפח בשיא, ועל זמן הסיום שהמחסן צריך?',
      explain: 'דרישת נפח כוללת שיא, לא רק ממוצע: מספר רשומות בשיא וזמן סיום מרבי (למשל עד 06:00, לפני המשמרת). בודקים עומס מראש, מעבדים במנות כדי לעמוד בזמן, ומתריעים על חריגה. הרצה רק בלילה מעכבת הזמנות, ובקשה מהספקים לא פותרת את בעיית הממשק.',
      reasonRe: /שיא|peak|עומס|מנות|batch|זמן|נפח/i,
    },
  ];

  function checkFailures(draft, attempt) {
    const full = (attempt || 3) >= 3;
    draft = draft || {};
    let correct = 0;
    const items = failureScenarios.map((s) => {
      const a = draft[s.id] || {};
      const chosen = a.choice === '' || a.choice == null ? null : Number(a.choice);
      const ok = chosen === s.correct;
      if (ok) correct++;
      const why = txt(a.why);
      let text;
      if (ok) text = 'נכון. ' + s.explain;
      else if (chosen == null) text = 'לא נבחרה תשובה. ' + (full ? 'התשובה הנכונה: ' + s.options[s.correct] + '. ' + s.explain : 'מה בודקים כאן: ' + s.checks + '. ' + s.hint);
      else if (!full) text = 'לא הטיפול הטוב ביותר. מה בודקים כאן: ' + s.checks + '. ' + s.hint;
      else text = 'לא הטיפול הטוב ביותר. התשובה הנכונה: ' + s.options[s.correct] + '. ' + s.explain;
      if (why) text += s.reasonRe.test(why) ? ' הנימוק שלך נוגע במושג המרכזי.' : ' בנימוק שלך חסר המושג המרכזי (' + s.checks + ').';
      return { el: s.id, label: s.title, severity: ok ? 'good' : 'bad', text, correct: ok };
    });
    return { score: Math.round((100 * correct) / failureScenarios.length), correct, items };
  }
  function refFailuresDraft() {
    const d = {};
    failureScenarios.forEach((s) => (d[s.id] = { choice: String(s.correct), why: '' }));
    return d;
  }

  // =====================================================================
  // State / drafts
  // =====================================================================
  function drafts() {
    const st = SL.state;
    if (!st.fieldsDrafts || typeof st.fieldsDrafts !== 'object') st.fieldsDrafts = {};
    const d = st.fieldsDrafts;
    if (!d.types || typeof d.types !== 'object') d.types = {};
    if (!d.mapping || typeof d.mapping !== 'object') d.mapping = {};
    if (!d.mapping.file) d.mapping.file = {};
    if (!d.mapping.rows) d.mapping.rows = {};
    if (!d.card || typeof d.card !== 'object') d.card = {};
    if (!d.failures || typeof d.failures !== 'object') d.failures = {};
    return d;
  }
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      SL.save();
    }, 300);
  }
  const attemptNo = (ex) => {
    const s = SL.labState(ex);
    return s.solutionViewed ? Math.max(3, s.attempts + 1) : s.attempts + 1;
  };

  // =====================================================================
  // UI
  // =====================================================================
  const TABS = [
    { id: 'types', ex: 'fields-types', label: 'בחירת סוג שדה', render: renderTypes },
    { id: 'mapping', ex: 'fields-mapping', label: 'מיפוי שדות', render: renderMapping },
    { id: 'card', ex: 'iface-card', label: 'כרטיס ממשק', render: renderCard },
    { id: 'failures', ex: 'iface-failures', label: 'תרחישי כשל', render: renderFailures },
  ];

  function injectStyles() {
    if (document.getElementById('fl-styles')) return;
    const css = `
.fl-items{display:grid;gap:10px}
.fl-item{border:1px solid var(--border);border-radius:12px;padding:12px 14px;background:var(--surface)}
.fl-item h3{margin:0 0 2px}
.fl-item .fl-meta{font-size:.92rem}
.fl-ctrls{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin-top:8px}
.fl-ctrls .field{margin:0}
.fl-num{width:92px}
.fl-item select{max-width:100%}
.fl-item.fl-good{border-inline-start:5px solid var(--good)}
.fl-item.fl-warn{border-inline-start:5px solid var(--warn)}
.fl-item.fl-bad{border-inline-start:5px solid var(--bad)}
.fl-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:14px 0}
.fl-result:empty{display:none}
.fl-result{margin-top:14px}
.fl-result .fb-list li b{margin-inline-end:6px}
.fl-csv{white-space:pre;font-size:.82rem;margin:8px 0}
.fl-map .table-wrap{max-height:none}
.fl-map-tbl input[type=text]{width:100%;min-width:130px}
.fl-map-tbl select{min-width:120px;width:100%}
.fl-map-tbl td.fl-tgt{min-width:170px}
.fl-map-tbl .fl-rowmsg{color:var(--bad);font-weight:600;font-size:.85rem;margin-top:4px}
.fl-map-tbl .fl-un{display:flex;gap:6px;align-items:center;font-weight:400;white-space:nowrap}
.fl-file{display:flex;flex-wrap:wrap;gap:12px}
.fl-file .field{margin:0}
@media (max-width:760px){
 .fl-map-tbl thead{display:none}
 .fl-map-tbl,.fl-map-tbl tbody,.fl-map-tbl tr,.fl-map-tbl td{display:block;width:100%}
 .fl-map-tbl tr{border-bottom:2px solid var(--border);padding:6px 0}
 .fl-map-tbl td{border:none !important;padding:4px 8px}
 .fl-map-tbl td[data-label]::before{content:attr(data-label);display:block;font-size:.8rem;font-weight:700;color:var(--muted)}
}
.fl-card-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}
.fl-card-grid .field{margin:0;padding-inline-start:8px;border-inline-start:4px solid transparent;border-radius:2px}
.fl-card-grid .field.wide{grid-column:1/-1}
.fl-card-grid .field input,.fl-card-grid .field select{width:100%}
.fl-card-grid textarea{min-height:64px}
.fl-card-grid .field.sev-ok{border-color:var(--good)}
.fl-card-grid .field.sev-partial{border-color:var(--warn)}
.fl-card-grid .field.sev-missing{border-color:var(--bad)}
.fl-opts{display:grid;gap:6px;margin:8px 0}
.fl-opts label{display:flex;gap:8px;align-items:flex-start;padding:8px 10px;border:1px solid var(--border);border-radius:10px;font-weight:400;cursor:pointer;background:var(--surface)}
.fl-opts label:hover{border-color:var(--primary)}
.fl-opts input{margin-top:5px;flex:none}
.fl-opts label.fl-correct{border-color:var(--good);background:var(--good-soft)}
.fl-opts label.fl-wrong{border-color:var(--bad);background:var(--bad-soft)}
.fl-sol td,.fl-sol th{font-size:.88rem}
`;
    document.head.appendChild(h('style', { id: 'fl-styles' }, css));
  }

  function select(opts, value, onchange, attrs) {
    const s = h('select', Object.assign({ onchange: (e) => onchange(e.target.value) }, attrs || {}), opts.map((o) => h('option', { value: o[0], selected: String(value == null ? '' : value) === o[0] }, o[1])));
    return s;
  }

  function statusLine(ex) {
    const s = SL.labState(ex);
    return h(
      'div',
      { class: 'row small muted' },
      h('span', null, 'הגשות: ' + s.attempts),
      s.best != null ? h('span', null, '· ציון הטוב ביותר: ', h('b', null, String(s.best))) : null,
      s.solutionViewed ? h('span', { class: 'tag warn' }, 'נצפה פתרון') : null,
      h('span', null, '· ' + (attemptNo(ex) >= 3 ? 'משוב מלא' : 'משוב מכוון (ניסיון ' + attemptNo(ex) + ')'))
    );
  }

  function feedbackList(items, sevMap) {
    return h(
      'ul',
      { class: 'fb-list' },
      items.map((i) => {
        const sev = sevMap ? sevMap[i.severity] : i.severity;
        const icon = sev === 'good' ? '✓' : sev === 'warn' ? '◐' : '✗';
        return h('li', { class: sev, 'data-el': i.el || i.component }, h('b', null, icon + ' ' + i.label), h('span', null, i.text || i.comment));
      })
    );
  }
  function scoreBox(score, sub) {
    return h('div', { class: 'row', style: { gap: '14px', marginBottom: '10px' } }, h('div', { class: 'score-big', 'aria-label': 'ציון ' + score }, String(score)), h('div', null, h('div', null, h('b', null, 'ציון')), sub ? h('div', { class: 'small muted' }, sub) : null));
  }

  async function viewSolution(ex, title, body, fill) {
    const ok = await SL.labViewSolution(ex);
    if (!ok || !alive) return;
    const v = await SL.modal(title, body(), [
      { label: 'טען לטופס', value: 'fill' },
      { label: 'סגור', value: true, primary: true },
    ]);
    if (v === 'fill' && alive) fill();
  }

  // ---------- page ----------
  let current = null; // {panel, tabs, tab}

  function renderPage(el, params) {
    injectStyles();
    alive = true;
    const d = drafts();
    let tabId = params && params.tab;
    if (!TABS.some((t) => t.id === tabId)) tabId = TABS.some((t) => t.id === d.lastTab) ? d.lastTab : 'types';
    SL.cleanup = () => {
      alive = false;
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
        SL.save();
      }
    };
    const tabBtns = TABS.map((t) =>
      h('button', { type: 'button', role: 'tab', id: 'fl-tab-' + t.id, 'aria-controls': 'fl-panel', 'aria-selected': 'false', tabindex: '-1', onclick: () => selectTab(t.id, true) }, t.label, ' ', doneMark(t.ex))
    );
    const tablist = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'תרגילי המעבדה', onkeydown: onTabKey }, tabBtns);
    const panel = h('section', { id: 'fl-panel', role: 'tabpanel' });
    el.appendChild(
      h(
        'div',
        null,
        h('div', { class: 'row', style: { marginBottom: '6px' } }, h('a', { href: '#/labs', class: 'small' }, '→ חזרה למעבדות')),
        h('h1', null, '🔧 מעבדת שדות וממשקים'),
        h('p', { class: 'muted' }, 'סוגי שדות ומלכודות, מיפוי קובץ ספק לטבלת הזמנות רכש, כרטיס ממשק ERP-WMS ותרחישי כשל.'),
        tablist,
        panel
      )
    );
    current = { panel, tabBtns, tab: null };
    selectTab(tabId, false);
  }
  function doneMark(ex) {
    const s = SL.labState(ex);
    return s.best != null ? h('span', { class: 'tag ' + (s.best >= 80 ? 'good' : 'warn') }, String(s.best)) : null;
  }
  function onTabKey(e) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) || !current) return;
    const i = TABS.findIndex((t) => t.id === current.tab);
    let n = i;
    // RTL: ArrowLeft moves to the next tab
    if (e.key === 'ArrowLeft') n = (i + 1) % TABS.length;
    if (e.key === 'ArrowRight') n = (i - 1 + TABS.length) % TABS.length;
    if (e.key === 'Home') n = 0;
    if (e.key === 'End') n = TABS.length - 1;
    e.preventDefault();
    selectTab(TABS[n].id, true);
    current.tabBtns[n].focus();
  }
  function selectTab(id, updateHash) {
    if (!current) return;
    const d = drafts();
    d.lastTab = id;
    SL.save();
    current.tab = id;
    TABS.forEach((t, i) => {
      const b = current.tabBtns[i];
      b.setAttribute('aria-selected', t.id === id ? 'true' : 'false');
      b.setAttribute('tabindex', t.id === id ? '0' : '-1');
    });
    current.panel.setAttribute('aria-labelledby', 'fl-tab-' + id);
    if (updateHash) {
      try {
        history.replaceState(null, '', '#' + ROUTE + '/' + id);
      } catch (e) {}
    }
    renderTab();
  }
  function renderTab() {
    if (!current) return;
    const t = TABS.find((x) => x.id === current.tab);
    current.panel.innerHTML = '';
    t.render(current.panel, t);
  }
  function refreshTabMarks() {
    if (!current) return;
    TABS.forEach((t, i) => {
      const b = current.tabBtns[i];
      const old = b.querySelector('.tag');
      if (old) old.remove();
      const m = doneMark(t.ex);
      if (m) b.appendChild(m);
    });
  }

  // ---------- Tab 1 UI ----------
  function renderTypes(panel, tab) {
    const d = drafts();
    const items = {};
    const result = h('div', { class: 'fl-result', 'aria-live': 'polite' });
    panel.appendChild(
      h(
        'div',
        { class: 'card' },
        h('h2', { style: { marginTop: 0 } }, 'בחירת סוג שדה'),
        h('p', null, 'לכל נתון עסקי בחרו סוג, אורך או דיוק, וענו על שאלת ההמשך. שימו לב לדוגמאות ולשימוש: הן מסתירות מלכודות.'),
        statusLine(tab.ex)
      )
    );
    const list = h('div', { class: 'fl-items', style: { marginTop: '12px' } });
    typeItems.forEach((it) => {
      const a = (d.types[it.id] = d.types[it.id] || {});
      const sizeBox = h('div', { class: 'fl-ctrls', style: { marginTop: 0 } });
      const drawSize = () => {
        sizeBox.innerHTML = '';
        const num = (key, label, ph) =>
          h('label', { class: 'field' }, label, h('input', { type: 'number', min: '0', max: '4000', class: 'fl-num', value: a[key] || '', placeholder: ph, dir: 'ltr', 'aria-label': it.name + ': ' + label, oninput: (e) => ((a[key] = e.target.value), saveSoon()) }));
        if (TEXT_TYPES.includes(a.type)) sizeBox.appendChild(num('len', 'אורך', 'תווים'));
        if (a.type === 'DECIMAL') {
          sizeBox.appendChild(num('p', 'דיוק (סך ספרות)', 'p'));
          sizeBox.appendChild(num('s', 'ספרות אחרי הנקודה', 's'));
        }
      };
      drawSize();
      const box = h(
        'div',
        { class: 'fl-item', 'data-item': it.id },
        h('h3', null, it.name),
        h('div', { class: 'fl-meta' }, h('span', { class: 'muted' }, 'דוגמה: '), h('span', { dir: 'auto' }, it.sample)),
        h('div', { class: 'fl-meta' }, h('span', { class: 'muted' }, 'שימוש: '), it.usage),
        h(
          'div',
          { class: 'fl-ctrls' },
          h(
            'label',
            { class: 'field' },
            'סוג נתון',
            select(DTYPES, a.type, (v) => {
              a.type = v;
              saveSoon();
              drawSize();
            }, { 'aria-label': it.name + ': סוג נתון', 'data-k': 'type' })
          ),
          sizeBox
        ),
        it.follow
          ? h(
              'div',
              { class: 'fl-ctrls' },
              h('label', { class: 'field', style: { flex: '1 1 260px' } }, it.follow.q, select([['', 'בחרו…']].concat(it.follow.options.map((o, i) => [String(i), o])), a.follow, (v) => ((a.follow = v), saveSoon()), { 'aria-label': it.name + ': ' + it.follow.q, 'data-k': 'follow', style: { width: '100%' } }))
            )
          : null
      );
      items[it.id] = box;
      list.appendChild(box);
    });
    panel.appendChild(list);
    const submit = () => {
      const att = attemptNo(tab.ex);
      const r = checkTypes(drafts().types, att);
      SL.labSubmit(tab.ex, { score: r.score, skillId: 'fieldTypes', feedback: r.items.map((i) => ({ el: i.el, severity: i.severity, text: i.text })) });
      Object.keys(items).forEach((k) => items[k].classList.remove('fl-good', 'fl-warn', 'fl-bad'));
      r.items.forEach((i) => items[i.el] && items[i.el].classList.add('fl-' + i.severity));
      showResult(result, r.score, r.items, att, tab);
    };
    panel.appendChild(actionBar(tab, submit, () => viewSolution(tab.ex, 'פתרון: בחירת סוג שדה', typesSolution, () => ((drafts().types = refTypesDraft()), SL.save(), renderTab())), () => ((drafts().types = {}), SL.save(), renderTab())));
    panel.appendChild(result);
  }
  function typesSolution() {
    return h(
      'div',
      { class: 'table-wrap' },
      h(
        'table',
        { class: 'tbl fl-sol' },
        h('thead', null, h('tr', null, h('th', null, 'נתון'), h('th', null, 'תשובת ייחוס'), h('th', null, 'מלכודת והסבר'))),
        h(
          'tbody',
          null,
          typeItems.map((it) => h('tr', null, h('td', null, it.name), h('td', null, h('span', { dir: 'auto' }, refTypeText(it))), h('td', null, h('span', { class: 'tag primary' }, TRAPS[it.trap].name), ' ', it.full)))
        )
      )
    );
  }

  function actionBar(tab, onSubmit, onSolution, onReset, extra) {
    return h(
      'div',
      { class: 'fl-bar' },
      h('button', { class: 'btn primary', type: 'button', 'data-act': 'submit', onclick: onSubmit }, 'בדיקה והגשה'),
      extra || null,
      h('button', { class: 'btn ghost', type: 'button', 'data-act': 'solution', onclick: onSolution }, '👁 צפייה בפתרון'),
      h(
        'button',
        {
          class: 'btn ghost',
          type: 'button',
          'data-act': 'reset',
          onclick: async () => {
            if (await SL.confirm('לנקות את הטופס בלשונית הזו?')) onReset();
          },
        },
        'ניקוי טופס'
      )
    );
  }

  function showResult(box, score, items, att, tab, sevMap, extraTop) {
    box.innerHTML = '';
    const s = SL.labState(tab.ex);
    box.appendChild(
      h(
        'div',
        { class: 'card' },
        extraTop || null,
        scoreBox(score, 'הגשה ' + s.attempts + (s.best != null ? ' · הטוב ביותר ' + s.best : '') + (att < 3 ? ' · משוב מכוון: מצביע על הבעיה בלי לחשוף את התשובה (מהניסיון השלישי המשוב מלא)' : ' · משוב מלא')),
        feedbackList(items, sevMap)
      )
    );
    refreshTabMarks();
    const st = current && current.panel.querySelector('.card .row.small.muted');
    if (st) st.replaceWith(statusLine(tab.ex));
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- Tab 2 UI ----------
  function renderMapping(panel, tab) {
    const d = drafts();
    const m = d.mapping;
    const result = h('div', { class: 'fl-result', 'aria-live': 'polite' });
    const blockBox = h('div', { 'aria-live': 'assertive' });
    const rowEls = {};
    panel.appendChild(
      h(
        'div',
        { class: 'card fl-map' },
        h('h2', { style: { marginTop: 0 } }, 'מיפוי שדות: קובץ הזמנות מספק → PurchaseOrder'),
        h('p', null, 'לכל שדה ביעד בחרו שדה מקור, כתבו טרנספורמציה וערך ברירת מחדל, או סמנו "לא ממופה" עם נימוק. שדה חובה בלי אף אחד מאלה חוסם את ההגשה.'),
        statusLine(tab.ex),
        h('h3', null, 'קובץ המקור: ', SL.code(mappingSpec.fileName)),
        h('p', { class: 'small muted' }, 'שורת כותרת ושלוש שורות לדוגמה, מוצגות כטבלה (המפריד בקובץ הגולמי נראה בשורת הכותרת):'),
        h('pre', { class: 'fl-csv', dir: 'ltr' }, mappingSpec.lines[0]),
        h(
          'div',
          { class: 'table-wrap', dir: 'ltr' },
          h(
            'table',
            { class: 'tbl ltr' },
            h('thead', null, h('tr', null, mappingSpec.lines[0].split(';').map((c) => h('th', null, c)))),
            h('tbody', null, mappingSpec.lines.slice(1).map((l) => h('tr', null, l.split(';').map((c) => h('td', { dir: 'auto' }, c || h('span', { class: 'muted' }, '(ריק)'))))))
          )
        ),
        h('ul', { class: 'small' }, mappingSpec.notes.map((n) => h('li', null, n))),
        h('h3', null, 'הגדרות הקובץ'),
        h(
          'div',
          { class: 'fl-file' },
          mappingSpec.fileSettings.map((fs) => h('label', { class: 'field' }, fs.label, select(fs.options, m.file[fs.id], (v) => ((m.file[fs.id] = v), saveSoon()), { 'data-file': fs.id, dir: 'ltr' })))
        )
      )
    );
    const tbody = h('tbody');
    mappingSpec.targets.forEach((t) => {
      const r = (m.rows[t.id] = Object.assign({ source: '', transform: '', def: '', unmapped: false, reason: '' }, m.rows[t.id] || {}));
      const msg = h('div', { class: 'fl-rowmsg', role: 'alert' });
      const srcSel = select([['', '(ללא מקור)']].concat(SRC_COLS.map((c) => [c, c])), r.source, (v) => ((r.source = v), saveSoon(), clearRow()), { dir: 'ltr', 'aria-label': t.field + ': שדה מקור', 'data-k': 'source' });
      const trIn = h('input', { type: 'text', value: r.transform, placeholder: 'למשל: המרה, חישוב, חיפוש', 'aria-label': t.field + ': טרנספורמציה', 'data-k': 'transform', oninput: (e) => ((r.transform = e.target.value), saveSoon()) });
      const defIn = h('input', { type: 'text', value: r.def, placeholder: 'ערך או כלל', 'aria-label': t.field + ': ברירת מחדל', 'data-k': 'def', oninput: (e) => ((r.def = e.target.value), saveSoon(), clearRow()) });
      const reasonIn = h('input', { type: 'text', value: r.reason, placeholder: 'נימוק', 'aria-label': t.field + ': נימוק לאי-מיפוי', 'data-k': 'reason', oninput: (e) => ((r.reason = e.target.value), saveSoon(), clearRow()) });
      const unChk = h('input', {
        type: 'checkbox',
        checked: r.unmapped,
        'data-k': 'unmapped',
        onchange: (e) => {
          r.unmapped = e.target.checked;
          saveSoon();
          sync();
          clearRow();
        },
      });
      const sync = () => {
        srcSel.disabled = trIn.disabled = defIn.disabled = !!r.unmapped;
        reasonIn.classList.toggle('hidden', !r.unmapped);
      };
      const tr = h(
        'tr',
        { 'data-target': t.id },
        h('td', { class: 'fl-tgt', 'data-label': 'שדה יעד' }, h('div', null, SL.code(t.table + '.' + t.field), ' ', t.required ? h('span', { class: 'tag bad' }, 'חובה') : h('span', { class: 'tag' }, 'רשות')), h('div', { class: 'small muted' }, t.desc, ' · ', h('span', { dir: 'ltr' }, t.type)), msg),
        h('td', { 'data-label': 'שדה מקור' }, srcSel),
        h('td', { 'data-label': 'טרנספורמציה' }, trIn),
        h('td', { 'data-label': 'ברירת מחדל' }, defIn),
        h('td', { 'data-label': 'לא ממופה' }, h('label', { class: 'fl-un' }, unChk, 'לא ממופה'), reasonIn)
      );
      const clearRow = () => {
        if (tr.classList.contains('err-row')) {
          const cr = checkMapping(drafts().mapping, 1);
          if (!cr.blocked.some((b) => b.id === t.id)) {
            tr.classList.remove('err-row');
            msg.textContent = '';
          }
        }
      };
      sync();
      rowEls[t.id] = { tr, msg };
      tbody.appendChild(tr);
    });
    panel.appendChild(
      h(
        'div',
        { class: 'card fl-map', style: { marginTop: '12px' } },
        h('h3', { style: { marginTop: 0 } }, 'טבלאות היעד: ', SL.code('PurchaseOrder'), ', ', SL.code('PurchaseOrderLine')),
        h('div', { class: 'table-wrap' }, h('table', { class: 'tbl fl-map-tbl' }, h('thead', null, h('tr', null, ['שדה יעד', 'שדה מקור', 'טרנספורמציה', 'ברירת מחדל', 'לא ממופה + נימוק'].map((x) => h('th', null, x)))), tbody))
      )
    );
    const submit = () => {
      const att = attemptNo(tab.ex);
      const r = checkMapping(drafts().mapping, att);
      Object.keys(rowEls).forEach((k) => {
        rowEls[k].tr.classList.remove('err-row', 'warn-row', 'ok-row');
        rowEls[k].msg.textContent = '';
      });
      blockBox.innerHTML = '';
      if (!r.ok) {
        r.blocked.forEach((b) => {
          rowEls[b.id].tr.classList.add('err-row');
          rowEls[b.id].msg.textContent = b.msg;
        });
        result.innerHTML = '';
        blockBox.appendChild(
          h('div', { class: 'notice bad', 'data-blocked': String(r.blocked.length) }, h('b', null, 'ההגשה נחסמה. '), r.blocked.length + ' שדות חובה בלי שדה מקור, ברירת מחדל או סימון "לא ממופה" עם נימוק: ', r.blocked.map((b) => b.id).join(', '))
        );
        const first = rowEls[r.blocked[0].id].tr;
        first.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const inp = first.querySelector('select:not([disabled]), input:not(.hidden)');
        if (inp) inp.focus({ preventScroll: true });
        return;
      }
      SL.labSubmit(tab.ex, { score: r.score, skillId: 'mapping', feedback: r.items.map((i) => ({ el: i.el, severity: i.severity, text: i.text })) });
      r.items.forEach((i) => rowEls[i.el] && rowEls[i.el].tr.classList.add(i.severity === 'good' ? 'ok-row' : i.severity === 'warn' ? 'warn-row' : 'err-row'));
      showResult(result, r.score, r.items, att, tab);
    };
    panel.appendChild(blockBox);
    panel.appendChild(actionBar(tab, submit, () => viewSolution(tab.ex, 'פתרון: מיפוי שדות', mappingSolution, () => ((drafts().mapping = refMappingDraft()), SL.save(), renderTab())), () => ((drafts().mapping = { file: {}, rows: {} }), SL.save(), renderTab())));
    panel.appendChild(result);
  }
  function mappingSolution() {
    const ref = refMappingDraft();
    return h(
      'div',
      null,
      h('p', null, 'קידוד Windows-1255 (המרה ל-UTF-8), מפריד ;, תאריכים DD/MM/YY.'),
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          { class: 'tbl fl-sol' },
          h('thead', null, h('tr', null, h('th', null, 'שדה יעד'), h('th', null, 'מקור'), h('th', null, 'טרנספורמציה / ברירת מחדל'), h('th', null, 'למה'))),
          h(
            'tbody',
            null,
            mappingSpec.targets.map((t) => {
              const r = ref.rows[t.id];
              return h('tr', null, h('td', null, SL.code(t.field)), h('td', null, r.source ? SL.code(r.source) : '—'), h('td', null, [r.transform, r.def].filter(Boolean).join(' · ') || '—'), h('td', null, t.full));
            })
          )
        )
      )
    );
  }

  // ---------- Tab 3 UI ----------
  function renderCard(panel, tab) {
    const d = drafts();
    const card = d.card;
    const result = h('div', { class: 'fl-result', 'aria-live': 'polite' });
    const fieldEls = {};
    const open = (SL.state.checklist || []).filter((i) => i.status === 'open' && i.category && CARD.some((c) => c.id === i.category));
    panel.appendChild(
      h(
        'div',
        { class: 'card' },
        h('h2', { style: { marginTop: 0 } }, 'כרטיס ממשק: כרטיסי פריט מ-ERP ל-WMS'),
        h('p', null, 'חברת הפצה. ב-ERP כ-5,000 פריטים פעילים, כ-200 שינויים ביום, ובהחלפת קטלוג עד 2,000 שינויים ביום. ה-WMS צריך את כרטיסי הפריט כדי לקלוט סחורה ולנהל מלאי. מלאו את 15 רכיבי הממשק.'),
        statusLine(tab.ex),
        open.length ? h('div', { class: 'notice warn', style: { marginTop: '8px' } }, h('b', null, '📝 מהצ\'קליסט שלך: '), open.map((i) => i.text).join(' · ')) : null
      )
    );
    const grid = h('div', { class: 'fl-card-grid' });
    CARD.forEach((c) => {
      let input;
      const on = (e) => ((card[c.id] = e.target.value), saveSoon());
      if (c.kind === 'select') input = select(c.options, card[c.id], (v) => ((card[c.id] = v), saveSoon()), { 'data-comp': c.id, id: 'fl-c-' + c.id });
      else if (c.kind === 'textarea') input = h('textarea', { 'data-comp': c.id, id: 'fl-c-' + c.id, placeholder: c.ph, oninput: on, value: card[c.id] || '' });
      else input = h('input', { type: 'text', 'data-comp': c.id, id: 'fl-c-' + c.id, placeholder: c.ph, oninput: on, value: card[c.id] || '' });
      const f = h('div', { class: 'field' + (c.wide ? ' wide' : '') }, h('label', { for: 'fl-c-' + c.id }, c.label), input);
      fieldEls[c.id] = f;
      grid.appendChild(f);
    });
    panel.appendChild(h('div', { class: 'card', style: { marginTop: '12px' } }, grid));

    const mark = (items) =>
      items.forEach((i) => {
        const f = fieldEls[i.component];
        if (!f) return;
        f.classList.remove('sev-ok', 'sev-partial', 'sev-missing');
        f.classList.add('sev-' + i.severity);
      });
    const sevMap = { ok: 'good', partial: 'warn', missing: 'bad' };
    const finish = (r, att, viaAI, note) => {
      const missing = r.missing;
      SL.recordGaps('interface', missing, (c) => 'כרטיס ממשק: להגדיר "' + cardLabel(c) + '"');
      SL.labSubmit(tab.ex, { score: r.score, skills: r.skills, feedback: r.items.map((i) => ({ el: i.component, severity: i.severity, text: i.comment })) });
      mark(r.items);
      const top = h(
        'div',
        null,
        note || null,
        h('p', { class: 'small muted' }, viaAI ? '🤖 נבדק בבינה מלאכותית מול מחוון.' : '📏 נבדק במנוע כללים: שלמות ומילות מפתח לכל רכיב.', ' אפיון ממשק: ' + r.skills.interfaces + ' · טיפול בכשל: ' + r.skills.failure)
      );
      showResult(result, r.score, r.items, att, tab, sevMap, top);
    };
    const ruleSubmit = () => {
      const att = attemptNo(tab.ex);
      finish(checkCard(drafts().card, att), att, false);
    };
    let aiBtn = null;
    if (SL.ai.enabled()) {
      aiBtn = h(
        'button',
        {
          class: 'btn',
          type: 'button',
          'data-act': 'ai',
          onclick: async () => {
            const att = attemptNo(tab.ex);
            const c = Object.assign({}, drafts().card);
            aiBtn.disabled = true;
            result.innerHTML = '';
            result.appendChild(h('div', { class: 'notice' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), ' הבינה המלאכותית בודקת את הכרטיס (עד דקה)…'));
            let r;
            let note = null;
            let viaAI = true;
            try {
              r = await aiCheckCard(c, att);
            } catch (e) {
              viaAI = false;
              r = checkCard(c, att);
              note = h('div', { class: 'notice warn', style: { marginBottom: '10px' } }, 'בדיקת הבינה המלאכותית נכשלה (' + (e && e.message ? e.message : 'שגיאה') + '). מוצגת בדיקת הכללים במקומה.');
            }
            if (!alive) return;
            aiBtn.disabled = false;
            finish(r, att, viaAI, note);
          },
        },
        '🤖 בדיקה עם AI'
      );
    }
    panel.appendChild(
      actionBar(
        tab,
        ruleSubmit,
        () => viewSolution(tab.ex, 'פתרון: כרטיס ממשק', cardSolution, () => ((drafts().card = Object.assign({}, REF_CARD)), SL.save(), renderTab())),
        () => ((drafts().card = {}), SL.save(), renderTab()),
        aiBtn
      )
    );
    if (!aiBtn) panel.appendChild(h('p', { class: 'small muted' }, 'הבדיקה נעשית במנוע כללים. להגדרת מפתח API לבדיקה עם בינה מלאכותית: ', h('a', { href: '#/settings' }, 'הגדרות'), '.'));
    panel.appendChild(result);
  }
  function cardSolution() {
    return h(
      'div',
      { class: 'table-wrap' },
      h(
        'table',
        { class: 'tbl fl-sol' },
        h('thead', null, h('tr', null, h('th', null, 'רכיב'), h('th', null, 'דוגמת ייחוס'), h('th', null, 'למה'))),
        h('tbody', null, CARD.map((c) => h('tr', null, h('td', null, c.label), h('td', null, h('span', { dir: 'auto' }, refCardText(c.id))), h('td', null, FULL_TIPS[c.id]))))
      )
    );
  }

  // ---------- Tab 4 UI ----------
  function renderFailures(panel, tab) {
    const d = drafts();
    const result = h('div', { class: 'fl-result', 'aria-live': 'polite' });
    const boxes = {};
    panel.appendChild(
      h(
        'div',
        { class: 'card' },
        h('h2', { style: { marginTop: 0 } }, 'תרחישי כשל'),
        h('p', null, 'לכל אירוע בחרו את הטיפול הטוב ביותר שהממשק צריך לבצע, ואם תרצו נמקו בקצרה.'),
        statusLine(tab.ex)
      )
    );
    const list = h('div', { class: 'fl-items', style: { marginTop: '12px' } });
    failureScenarios.forEach((s, si) => {
      const a = (d.failures[s.id] = d.failures[s.id] || {});
      const name = 'fl-f-' + s.id;
      const labels = s.options.map((o, i) =>
        h('label', { 'data-opt': String(i) }, h('input', { type: 'radio', name, value: String(i), checked: String(a.choice) === String(i), onchange: () => ((a.choice = String(i)), saveSoon()) }), h('span', null, o))
      );
      const box = h(
        'div',
        { class: 'fl-item', 'data-scen': s.id },
        h('h3', null, si + 1 + '. ' + s.title),
        h('p', { class: 'fl-meta' }, s.story),
        h('div', { class: 'fl-opts', role: 'radiogroup', 'aria-label': s.title }, labels),
        h('label', { class: 'field' }, h('span', null, 'נימוק ', h('span', { class: 'muted small' }, '(רשות)')), h('textarea', { value: a.why || '', placeholder: 'למה זה הטיפול הנכון?', style: { minHeight: '54px' }, 'data-k': 'why', oninput: (e) => ((a.why = e.target.value), saveSoon()) }))
      );
      boxes[s.id] = { box, labels };
      list.appendChild(box);
    });
    panel.appendChild(list);
    const submit = () => {
      const att = attemptNo(tab.ex);
      const r = checkFailures(drafts().failures, att);
      SL.labSubmit(tab.ex, { score: r.score, skillId: 'failure', feedback: r.items.map((i) => ({ el: i.el, severity: i.severity, text: i.text })) });
      failureScenarios.forEach((s) => {
        const b = boxes[s.id];
        const a = drafts().failures[s.id] || {};
        b.box.classList.remove('fl-good', 'fl-bad');
        b.labels.forEach((l) => l.classList.remove('fl-correct', 'fl-wrong'));
        const ok = String(a.choice) === String(s.correct);
        b.box.classList.add(ok ? 'fl-good' : 'fl-bad');
        if (a.choice != null && a.choice !== '') b.labels[Number(a.choice)].classList.add(ok ? 'fl-correct' : 'fl-wrong');
        if (att >= 3) b.labels[s.correct].classList.add('fl-correct');
      });
      showResult(result, r.score, r.items, att, tab, null, h('p', { class: 'small muted' }, r.correct + ' מתוך ' + failureScenarios.length + ' נכונות'));
    };
    panel.appendChild(actionBar(tab, submit, () => viewSolution(tab.ex, 'פתרון: תרחישי כשל', failuresSolution, () => ((drafts().failures = refFailuresDraft()), SL.save(), renderTab())), () => ((drafts().failures = {}), SL.save(), renderTab())));
    panel.appendChild(result);
  }
  function failuresSolution() {
    return h(
      'ul',
      { class: 'fb-list' },
      failureScenarios.map((s) => h('li', { class: 'good' }, h('b', null, s.title), h('div', null, s.options[s.correct]), h('div', { class: 'small muted' }, s.explain)))
    );
  }

  // =====================================================================
  // Registration
  // =====================================================================
  SL.route(ROUTE, (el) => renderPage(el, {}));
  SL.route(ROUTE + '/:tab', (el, p) => renderPage(el, p));
  SL.registerLab({
    id: 'fields',
    icon: '🔧',
    title: 'מעבדת שדות וממשקים',
    desc: 'סוגי שדות ומלכודות, מיפוי קובץ ספק, כרטיס ממשק ERP-WMS ותרחישי כשל',
    route: ROUTE,
    skills: ['fieldTypes', 'mapping', 'interfaces', 'failure'],
    count: () => TABS.filter((t) => SL.labState(t.ex).best != null).length + '/' + TABS.length,
    exercises: TABS.map((t) => ({ id: t.ex, title: t.label, route: ROUTE + '/' + t.id })),
  });

  SL.fieldsLab = {
    typeItems,
    mappingSpec,
    failureScenarios,
    traps: TRAPS,
    cardComponents: CARD,
    checkTypes,
    checkMapping,
    checkCard,
    checkFailures,
    aiCheckCard,
    reference: { types: refTypesDraft, mapping: refMappingDraft, card: () => Object.assign({}, REF_CARD), failures: refFailuresDraft },
  };
})();
