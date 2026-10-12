/* SpecQuest - ERD lab (spec §6.5, SpecLab §6.3, Business Rules 4-9, 13).
   Tabular editor + live SVG diagram, structural check, meaning-based grading against
   one or more reference solutions, attempt-dependent feedback, Mermaid / SQL DDL export.
   Pure functions are exposed on SL.erd for testing. */
(function () {
  const SL = window.SL;
  if (!SL) return;
  const h = SL.h;
  const esc = SL.esc;

  // ---------------------------------------------------------------- constants
  const TYPES = ['TEXT', 'INTEGER', 'DECIMAL', 'DATE', 'DATETIME', 'BOOLEAN'];
  const CARDS = [
    { v: '1', he: 'בדיוק אחת', sym: '1' },
    { v: '01', he: 'אפס או אחת', sym: '0..1' },
    { v: '0N', he: 'אפס או יותר', sym: '0..N' },
    { v: '1N', he: 'אחת או יותר', sym: '1..N' },
  ];
  const ETYPES = [
    { v: 'master', he: 'נתוני אב', why: 'נתוני אב: פרטים קבועים שחוזרים בהרבה תנועות.' },
    { v: 'trans', he: 'תנועה', why: 'תנועה: אירוע שקורה בזמן מסוים ומפנה לנתוני אב.' },
    { v: 'link', he: 'קישור', why: 'קישור: ישות שמפרקת קשר רבים-לרבים.' },
    { v: 'code', he: 'קוד', why: 'קוד: רשימה סגורה וקטנה של ערכים.' },
  ];
  const WEIGHTS = {
    logical: { entities: 30, relationships: 30, keys: 25, fields: 15 },
    conceptual: { entities: 50, relationships: 50 },
  };
  const PART_HE = { entities: 'ישויות', relationships: 'קשרים וקרדינליות', keys: 'מפתחות', fields: 'שדות וסוגי נתונים' };
  const PART_SKILL = { entities: 'entities', relationships: 'relationships', keys: 'keys', fields: 'fieldTypes' };
  const AI_THRESHOLD = 0.7;
  const PASS = 80;

  const isMany = (c) => c === '0N' || c === '1N';
  const cardHe = (c) => (CARDS.find((x) => x.v === c) || { he: 'לא הוגדר' }).he;
  const etypeHe = (t) => (ETYPES.find((x) => x.v === t) || { he: 'לא הוגדר' }).he;
  let seq = 0;
  const uid = (p) => p + (++seq).toString(36) + Math.random().toString(36).slice(2, 7);

  /** Name normalization for meaning-based matching: case/underscore/space-insensitive, singular. */
  function norm(s) {
    s = String(s || '').toLowerCase().replace(/[\s_\-.]/g, '');
    if (s.length > 3) {
      if (s.endsWith('ies')) s = s.slice(0, -3) + 'y';
      else if (s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1);
    }
    return s;
  }
  const heNorm = (s) => String(s || '').replace(/[״]/g, '"').replace(/[׳]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();

  // ---------------------------------------------------------------- model building
  /** Field spec: "Name TYPE(len) PK req opt ->Entity.Field" */
  function parseField(s) {
    const parts = s.trim().split(/\s+/);
    const f = { id: uid('f'), name: parts[0], type: '', len: '', required: false, pk: false, ref: '' };
    parts.slice(1).forEach((p) => {
      const m = p.match(/^(TEXT|INTEGER|DECIMAL|DATE|DATETIME|BOOLEAN)(?:\((\d+)\))?$/);
      if (m) {
        f.type = m[1];
        f.len = m[2] || '';
      } else if (p === 'PK') f.pk = f.required = true;
      else if (p === 'req') f.required = true;
      else if (p === 'opt') f.opt = true;
      else if (p.startsWith('->')) f.ref = p.slice(2);
    });
    return f;
  }
  /** Builds an editable model {entities, rels} from an authoring definition. */
  function buildModel(def) {
    const entities = (def.entities || []).map((e) => ({
      id: uid('e'),
      name: e.n,
      display: e.he || '',
      type: [].concat(e.t || '')[0],
      desc: e.d || '',
      fields: (e.f || []).map((x) => {
        const f = parseField(x);
        delete f.opt;
        return f;
      }),
    }));
    const idOf = (n) => (entities.find((x) => x.name === n) || {}).id || '';
    const rels = (def.rels || []).map((r) => ({ id: uid('r'), from: idOf(r[0]), to: idOf(r[1]), fromCard: r[2] || '', toCard: r[3] || '', name: r[4] || '' }));
    return { entities, rels };
  }
  /** Reference solution in grading form: entities keep meta, fields parsed, rels by name. */
  function prepSolution(def) {
    if (def._prep) return def._prep;
    const entities = def.entities.map((e) => Object.assign({}, e, { fields: (e.f || []).map(parseField) }));
    const rels = (def.rels || []).map((r) => ({ from: r[0], to: r[1], fc: r[2], tc: r[3], name: r[4] || '', why: r[5] || '' }));
    Object.defineProperty(def, '_prep', { value: { entities, rels, label: def.label || '' }, enumerable: false });
    return def._prep;
  }

  // ---------------------------------------------------------------- exercises
  const EXERCISES = [
    {
      id: 'erd-po',
      title: 'רכש וקליטה במחסן',
      kind: 'בנייה מתרחיש',
      level: 'logical',
      short: 'בונים ERD לוגי מאפס מתוך תיאור עסקי והזמנת רכש לדוגמה.',
      scenario: [
        'חברת ההפצה "דלתא הפצה" קונה מוצרים מכמה עשרות ספקים ומאחסנת אותם במחסן מרכזי. קניין מפיק הזמנת רכש לספק אחד. בכל הזמנה יש שורה אחת או יותר, וכל שורה היא פריט (מק"ט) בכמות ובמחיר שסוכמו.',
        'כשמשלוח מגיע למחסן, המחסנאי פותח קליטה (תעודת כניסה) ורושם לכל שורה כמה יחידות התקבלו בפועל. ספק יכול לספק הזמנה בכמה משלוחים, ולכן שורת הזמנה אחת יכולה להיקלט בכמה קליטות.',
        'שימו לב לנתונים עצמם: יש מק"טים שמתחילים באפס, ויש כמויות שבריות (קילוגרמים).',
      ],
      task: 'בנו ERD לוגי: ישויות, שדות עם סוגי נתונים, מפתחות ראשיים וזרים, וקשרים עם קרדינליות בשני הצדדים.',
      doc: {
        title: 'מסמך דוגמה: הזמנת רכש',
        header: [
          ['מספר הזמנה', 'PO-2026-0457'],
          ['ספק', '10023 · אלקטרו-טק בע"מ'],
          ['תאריך הזמנה', '05/10/2026'],
          ['אספקה צפויה', '12/10/2026'],
          ['סטטוס', 'פתוחה'],
        ],
        columns: ['שורה', 'מק"ט', 'תיאור', 'כמות', 'יחידה', 'מחיר ליחידה'],
        rows: [
          ['1', '004512', "כבל USB-C 1 מ'", '200', "יח'", '12.90'],
          ['2', '017730', 'מטען קיר 20W', '50', "יח'", '45.00'],
          ['3', '120005', 'סרט אריזה שקוף', '12.5', 'ק"ג', '18.40'],
        ],
        note: "תעודת כניסה GR-88120 · 09/10/2026 08:40 · מול PO-2026-0457: שורה 1 התקבלו 120 יח', שורה 3 התקבלו 12.5 ק\"ג. היתרה צפויה במשלוח נוסף.",
      },
      hints: [
        'התחילו ממסמך ההזמנה: הפרידו בין פרטים שחוזרים בהרבה מסמכים (נתוני אב) לבין המסמך עצמו (תנועה).',
        'מסמך עם כותרת ושורות הופך בדרך כלל לשתי ישויות. גם תעודת הכניסה היא מסמך כזה.',
        'שורת קליטה צריכה לדעת לאיזו שורת הזמנה היא שייכת, כי שורה אחת יכולה להיקלט בכמה משלוחים. ובדקו את סוג השדה של המק"ט.',
      ],
      prefixes: ['po', 'gr', 'order', 'receipt', 'line', 'goods'],
      fieldMeta: {
        SupplierNo: { syn: ['SupplierCode', 'SupplierNumber', 'VendorNo', 'VendorCode', 'VendorNumber', 'SupplierNum'], trap: 'מספר ספק הוא מזהה עסקי: לא מחשבים איתו, והוא יכול לכלול אפסים מובילים, ולכן טקסט.' },
        SupplierName: { syn: ['Name', 'VendorName', 'CompanyName'] },
        Phone: { syn: ['PhoneNumber', 'Tel', 'Telephone'] },
        ItemSKU: { syn: ['SKU', 'ItemCode', 'CatalogNo', 'ItemNo', 'ItemNumber', 'Makat', 'PartNo', 'ProductCode', 'ProductNo'], trap: 'מק"ט יכול להתחיל באפס (004512). בשדה מספרי האפס המוביל נעלם, ולכן מק"ט הוא טקסט.' },
        ItemName: { syn: ['Description', 'ItemDescription', 'Name', 'ProductName', 'Desc'] },
        UnitOfMeasure: { syn: ['UOM', 'Unit', 'UnitName', 'MeasureUnit'] },
        PONumber: { syn: ['OrderNumber', 'PONo', 'OrderNo', 'PurchaseOrderNo', 'PurchaseOrderNumber', 'DocumentNo'], trap: 'PO-2026-0457 כולל אותיות ומקפים, ולכן טקסט.' },
        OrderDate: { syn: ['PODate', 'Date', 'OrderedAt', 'CreatedDate'] },
        ExpectedDate: { syn: ['DeliveryDate', 'ExpectedDeliveryDate', 'DueDate', 'SupplyDate', 'ExpectedArrival'] },
        Status: { syn: ['OrderStatus', 'POStatus', 'StatusCode'] },
        LineNo: { syn: ['LineNumber', 'Line', 'LineNum', 'Seq', 'LineSeq'] },
        Quantity: { syn: ['Qty', 'OrderedQty', 'OrderQty', 'QtyOrdered', 'OrderedQuantity'], trap: 'יש כמויות שבריות (12.5 ק"ג), ולכן מספר עשרוני ולא שלם.' },
        UnitPrice: { syn: ['Price', 'PricePerUnit', 'ItemPrice'], trap: 'מחיר כולל אגורות, ולכן מספר עשרוני עם 2 ספרות אחרי הנקודה.' },
        ReceiptNo: { syn: ['ReceiptNumber', 'GRNumber', 'GRNo', 'DocumentNo', 'EntryNo', 'GoodsReceiptNo'], trap: 'GR-88120 כולל אותיות ומקף, ולכן טקסט.' },
        ReceiptDateTime: { syn: ['ReceiptDate', 'ReceivedAt', 'ReceiveDate', 'Date', 'ReceivedDate', 'ReceiptTime'], trap: 'במסמך מופיעה גם שעה (08:40), ולכן תאריך ושעה.' },
        ReceivedQty: { syn: ['Quantity', 'Qty', 'QuantityReceived', 'ReceivedQuantity', 'QtyReceived'], trap: 'התקבלו 12.5 ק"ג: כמות שברית, ולכן מספר עשרוני.' },
      },
      solutions: [
        {
          label: 'קליטה מול הזמנה',
          entities: [
            { n: 'Supplier', he: 'ספק', t: 'master', syn: ['Vendor', 'Provider', 'SupplierMaster'], heSyn: ['ספקים'], kw: ['ספק', 'vendor', 'supplier'],
              q: 'מי שולח את הסחורה? איפה נשמרים הפרטים הקבועים שלו, כך שלא יוקלדו מחדש בכל הזמנה?', why: 'ספק הוא נתון אב: הפרטים שלו קבועים וחוזרים בהרבה הזמנות.',
              f: ['SupplierID INTEGER PK', 'SupplierNo TEXT(10) req', 'SupplierName TEXT(100) req', 'Phone TEXT(20) opt'] },
            { n: 'Item', he: 'פריט', t: 'master', syn: ['Product', 'CatalogItem', 'Part', 'Material', 'Sku'], heSyn: ['מוצר', 'מק"ט'], kw: ['פריט', 'מוצר', 'מק"ט', 'מקט', 'product', 'item'],
              q: 'כל שורה במסמך מציינת מק"ט ותיאור. איפה נשמר התיאור, כדי שלא יחזור בכל שורה?', why: 'פריט הוא נתון אב. שורת הזמנה מפנה אליו במקום להעתיק את התיאור.',
              f: ['ItemID INTEGER PK', 'ItemSKU TEXT(20) req', 'ItemName TEXT(100) req', 'UnitOfMeasure TEXT(10) req'] },
            { n: 'PurchaseOrder', he: 'הזמנת רכש', t: 'trans', syn: ['PO', 'Order', 'POHeader', 'PurchaseOrderHeader', 'PurchOrder', 'PurchaseOrderHead'], heSyn: ['הזמנה', 'כותרת הזמנה'], kw: ['הזמנת רכש', 'כותרת הזמנה', 'הזמנה', 'purchase order'],
              q: 'מה מחזיק את פרטי הכותרת של המסמך: מספר, ספק, תאריכים וסטטוס?', why: 'הזמנת רכש היא תנועה עם כותרת: מספר, ספק, תאריכים וסטטוס.',
              f: ['PurchaseOrderID INTEGER PK', 'PONumber TEXT(20) req', 'SupplierID INTEGER req ->Supplier.SupplierID', 'OrderDate DATE req', 'ExpectedDate DATE', 'Status TEXT(20) req'] },
            { n: 'PurchaseOrderLine', he: 'שורת הזמנת רכש', t: ['trans', 'link'], syn: ['OrderItem', 'POLine', 'PurchaseOrderItem', 'OrderLine', 'PurchaseOrderDetail', 'PODetail', 'OrderDetail', 'POItem'], heSyn: ['שורת הזמנה', 'פריט בהזמנה'], kw: ['שורת הזמנה', 'שורות הזמנה', 'שורה בהזמנה', 'פריט בהזמנה', 'order line'],
              q: 'בהזמנה אחת יש כמה פריטים, כל אחד בכמות ובמחיר משלו. איפה נשמר כל אחד מהם?', why: 'שורת הזמנה מפרקת את הקשר רבים-לרבים בין הזמנה לפריט, ושומרת כמות ומחיר לכל פריט בהזמנה.',
              f: ['PurchaseOrderLineID INTEGER PK', 'PurchaseOrderID INTEGER req ->PurchaseOrder.PurchaseOrderID', 'LineNo INTEGER req', 'ItemID INTEGER req ->Item.ItemID', 'Quantity DECIMAL(3) req', 'UnitPrice DECIMAL(2) req'] },
            { n: 'GoodsReceipt', he: 'קליטת סחורה', t: 'trans', syn: ['Receipt', 'GR', 'GRN', 'GoodsReceiptNote', 'ReceivingDocument', 'Receiving', 'WarehouseReceipt', 'InboundReceipt', 'GoodsReceived'], heSyn: ['תעודת כניסה', 'קליטה'], kw: ['קליטה', 'תעודת כניסה', 'כניסה למחסן', 'receipt', 'קבלת סחורה'],
              q: 'כשמשלוח מגיע למחסן, איפה נרשם האירוע: מתי הגיע ומול מה?', why: 'קליטה היא תנועה נפרדת מההזמנה, כי הזמנה אחת יכולה להגיע בכמה משלוחים.',
              f: ['GoodsReceiptID INTEGER PK', 'ReceiptNo TEXT(20) req', 'PurchaseOrderID INTEGER req ->PurchaseOrder.PurchaseOrderID', 'ReceiptDateTime DATETIME req'] },
            { n: 'GoodsReceiptLine', he: 'שורת קליטה', t: ['trans', 'link'], syn: ['ReceiptLine', 'GRLine', 'GRNLine', 'ReceiptItem', 'GoodsReceiptItem', 'ReceivingLine', 'ReceiptDetail', 'GoodsReceiptDetail'], heSyn: ['שורת תעודת כניסה'], kw: ['שורת קליטה', 'שורת תעודת כניסה', 'שורות קליטה', 'receipt line'],
              q: 'בקליטה רושמים לכל שורה כמה התקבל בפועל. איפה נשמרת הכמות שהתקבלה?', why: 'שורת קליטה מקשרת בין הקליטה לשורת ההזמנה, ומאפשרת קליטה חלקית בכמה משלוחים.',
              f: ['GoodsReceiptLineID INTEGER PK', 'GoodsReceiptID INTEGER req ->GoodsReceipt.GoodsReceiptID', 'PurchaseOrderLineID INTEGER req ->PurchaseOrderLine.PurchaseOrderLineID', 'ReceivedQty DECIMAL(3) req'] },
          ],
          rels: [
            ['Supplier', 'PurchaseOrder', '1', '0N', 'מקבל', 'ספק חדש עדיין בלי הזמנות, וכל הזמנה נשלחת לספק אחד בלבד.'],
            ['PurchaseOrder', 'PurchaseOrderLine', '1', '1N', 'כוללת', 'אין הזמנה בלי שורות, וכל שורה שייכת להזמנה אחת.'],
            ['Item', 'PurchaseOrderLine', '1', '0N', 'מוזמן ב', 'פריט יכול להופיע בהרבה שורות או באף אחת, וכל שורה היא פריט אחד.'],
            ['PurchaseOrder', 'GoodsReceipt', '1', '0N', 'נקלטת ב', 'הזמנה יכולה להגיע בכמה משלוחים, או עוד לא להגיע.'],
            ['GoodsReceipt', 'GoodsReceiptLine', '1', '1N', 'כוללת', 'אין קליטה בלי שורות.'],
            ['PurchaseOrderLine', 'GoodsReceiptLine', '1', '0N', 'נקלטת ב', 'שורת הזמנה יכולה להיקלט בכמה משלוחים (קליטה חלקית).'],
          ],
        },
        {
          label: 'קליטה לפי ספק (משלוח שמכסה כמה הזמנות)',
          entities: null, // filled below from solution 1 with changes
          rels: [
            ['Supplier', 'PurchaseOrder', '1', '0N', 'מקבל'],
            ['PurchaseOrder', 'PurchaseOrderLine', '1', '1N', 'כוללת'],
            ['Item', 'PurchaseOrderLine', '1', '0N', 'מוזמן ב'],
            ['Supplier', 'GoodsReceipt', '1', '0N', 'שולח', 'משלוח אחד של ספק יכול לכסות כמה הזמנות, ולכן הקליטה מפנה לספק.'],
            ['GoodsReceipt', 'GoodsReceiptLine', '1', '1N', 'כוללת'],
            ['PurchaseOrderLine', 'GoodsReceiptLine', '1', '0N', 'נקלטת ב'],
            ['Item', 'GoodsReceiptLine', '1', '0N', 'נקלט ב'],
          ],
        },
      ],
    },
    {
      id: 'erd-so-fix',
      title: 'הזמנת לקוח ומשלוח',
      kind: 'תיקון ERD',
      level: 'logical',
      short: 'מודל מוכן עם 4 שגיאות שתולות. מאתרים, מתקנים ומסבירים.',
      scenario: [
        'המודל בעורך תוכנן לתהליך הזמנת לקוח ומשלוח באותה חברת הפצה, ונשתלו בו 4 שגיאות.',
        'לקוח מבצע הזמנות לאורך זמן. בכל הזמנה יש שורה אחת או יותר, וכל שורה היא פריט בכמות ובמחיר. ההזמנה יוצאת ללקוח במשלוח אחד או יותר (משלוח חלקי אפשרי).',
      ],
      task: 'מצאו ותקנו את 4 השגיאות, וכתבו בקצרה מה תיקנתם ולמה.',
      hints: [
        'שלוש מהשגיאות נתפסות בבדיקה המבנית. הרביעית היא שגיאה עסקית שבדיקה מבנית לא יכולה לתפוס.',
        'השגיאה העסקית נמצאת באחד הקשרים. קראו את המשפט שמתחת לכל קשר, ובדקו אם הוא נכון עסקית.',
        'בדקו את הקשר בין Customer ל-SalesOrder: האם לקוח באמת מבצע לכל היותר הזמנה אחת?',
      ],
      prefixes: ['so', 'order', 'sales', 'line', 'ship'],
      fieldMeta: {
        CustomerNo: { syn: ['CustomerCode', 'CustomerNumber', 'ClientNo', 'ClientCode'], trap: 'מספר לקוח הוא מזהה עסקי שלא מחשבים איתו, ולכן טקסט.' },
        CustomerName: { syn: ['Name', 'ClientName', 'CompanyName'] },
        City: { syn: ['CityName', 'Town'] },
        ItemSKU: { syn: ['SKU', 'ItemCode', 'ItemNo', 'CatalogNo', 'ProductCode'], trap: 'מק"ט יכול להתחיל באפס, ולכן טקסט.' },
        ItemName: { syn: ['Description', 'Name', 'ItemDescription', 'ProductName'] },
        OrderNo: { syn: ['OrderNumber', 'SalesOrderNo', 'SONumber', 'SONo', 'SalesOrderNumber'], trap: 'מספר הזמנה כמו SO-2026-0091 כולל אותיות, ולכן טקסט.' },
        OrderDate: { syn: ['Date', 'SODate', 'CreatedDate'] },
        Status: { syn: ['OrderStatus', 'SOStatus'] },
        Quantity: { syn: ['Qty', 'OrderedQty', 'OrderQty'], trap: 'כמות יכולה להיות שברית, ולכן מספר עשרוני.' },
        UnitPrice: { syn: ['Price', 'PricePerUnit'], trap: 'מחיר כולל אגורות, ולכן מספר עשרוני.' },
        ShipmentNo: { syn: ['ShipmentNumber', 'DeliveryNo', 'TrackingNo', 'ShipNo'] },
        ShipDate: { syn: ['ShipmentDate', 'DeliveryDate', 'Date', 'ShippedAt'] },
        Carrier: { syn: ['CarrierName', 'Courier', 'Shipper'] },
      },
      start: {
        entities: [
          { n: 'Customer', he: 'לקוח', t: 'master', d: 'לקוח שקונה מהחברה', f: ['CustomerID INTEGER PK', 'CustomerNo TEXT(10) req', 'CustomerName TEXT(100) req', 'City TEXT(50)'] },
          { n: 'Item', he: 'פריט', t: 'master', d: 'פריט בקטלוג', f: ['ItemID INTEGER PK', 'ItemSKU TEXT(20) req', 'ItemName TEXT(100) req'] },
          { n: 'SalesOrder', he: 'הזמנת לקוח', t: 'trans', d: 'הזמנה שלקוח ביצע', f: ['SalesOrderID INTEGER PK', 'OrderNo TEXT(20) req', 'CustomerID INTEGER req ->Customer.CustomerID', 'OrderDate DATE req', 'Status TEXT(20) req'] },
          { n: 'Shipment', he: 'משלוח', t: 'trans', d: 'משלוח שיוצא ללקוח', f: ['ShipmentID INTEGER req', 'ShipmentNo TEXT(20) req', 'SalesOrderID INTEGER req ->SalesOrder.OrderID', 'ShipDate DATE req', 'Carrier TEXT(50)'] },
        ],
        rels: [
          ['Customer', 'SalesOrder', '1', '01', 'מבצע'],
          ['SalesOrder', 'Item', '0N', '1N', 'כוללת'],
          ['SalesOrder', 'Shipment', '1', '0N', 'נשלחת ב'],
        ],
      },
      planted: [
        {
          id: 'pk', skill: 'keys',
          check: (c) => {
            const s = c.ent('Shipment');
            if (!s) return { kind: 'model' };
            return s.fields.some((f) => f.pk) ? null : { kind: 'entity', id: s.id };
          },
          guide: 'בדקו את Shipment: איך מזהים משלוח אחד באופן חד-ערכי?',
          full: 'ל-Shipment לא הוגדר מפתח ראשי. ShipmentID צריך להיות PK, אחרת אי אפשר להפנות למשלוח מסוים.',
        },
        {
          id: 'fk', skill: 'keys',
          check: (c) => (c.dangling[0] ? { kind: 'field', id: c.dangling[0].id } : null),
          guide: 'אחד המפתחות הזרים מפנה לשדה שלא קיים. בדקו את עמודת "מפנה אל" בכל הישויות.',
          full: 'Shipment.SalesOrderID הפנה ל-SalesOrder.OrderID, שדה שלא קיים. המפתח הזר צריך להפנות למפתח הראשי SalesOrder.SalesOrderID.',
        },
        {
          id: 'mn', skill: 'relationships',
          check: (c) => {
            const mn = c.model.rels.find((r) => isMany(r.fromCard) && isMany(r.toCard));
            if (mn) return { kind: 'rel', id: mn.id };
            if (!c.ent('SalesOrderLine')) {
              const so = c.ent('SalesOrder');
              return so ? { kind: 'entity', id: so.id } : { kind: 'model' };
            }
            return null;
          },
          guide: 'הזמנה כוללת כמה פריטים, ופריט מופיע בכמה הזמנות. איפה נשמרים הכמות והמחיר של פריט בהזמנה מסוימת?',
          full: 'הקשר רבים-לרבים בין SalesOrder ל-Item צריך להתפרק לישות SalesOrderLine, עם SalesOrderID, ItemID, Quantity ו-UnitPrice.',
        },
        {
          id: 'card', skill: 'relationships',
          check: (c) => {
            const a = c.ent('Customer');
            const b = c.ent('SalesOrder');
            if (!a || !b) return (a || b) ? { kind: 'entity', id: (a || b).id } : { kind: 'model' };
            const r = c.relBetween(a, b);
            if (!r) return { kind: 'entity', id: a.id };
            const cardAtB = r.from === b.id ? r.fromCard : r.toCard;
            return isMany(cardAtB) ? null : { kind: 'rel', id: r.id };
          },
          guide: 'בקשר בין Customer ל-SalesOrder: כמה הזמנות יכול לקוח אחד לבצע לאורך זמן?',
          full: 'לכל Customer יש אפס או יותר SalesOrder, ולא "אפס או אחת". לקוח חוזר מבצע הרבה הזמנות.',
        },
      ],
      solutions: [
        {
          label: 'פתרון ייחוס',
          entities: [
            { n: 'Customer', he: 'לקוח', t: 'master', syn: ['Client', 'Account'], kw: ['לקוח', 'customer', 'client'], q: 'מי מבצע את ההזמנה?', why: 'לקוח הוא נתון אב.',
              f: ['CustomerID INTEGER PK', 'CustomerNo TEXT(10) req', 'CustomerName TEXT(100) req', 'City TEXT(50) opt'] },
            { n: 'Item', he: 'פריט', t: 'master', syn: ['Product', 'CatalogItem'], heSyn: ['מוצר'], kw: ['פריט', 'מוצר', 'item', 'product'], q: 'מה מזמינים?', why: 'פריט הוא נתון אב.',
              f: ['ItemID INTEGER PK', 'ItemSKU TEXT(20) req', 'ItemName TEXT(100) req'] },
            { n: 'SalesOrder', he: 'הזמנת לקוח', t: 'trans', syn: ['Order', 'CustomerOrder', 'SO', 'SalesOrderHeader'], heSyn: ['הזמנה', 'הזמנת מכירה'], kw: ['הזמנת לקוח', 'הזמנה', 'sales order'], q: 'איפה נשמרת כותרת ההזמנה?', why: 'הזמנת לקוח היא תנועה.',
              f: ['SalesOrderID INTEGER PK', 'OrderNo TEXT(20) req', 'CustomerID INTEGER req ->Customer.CustomerID', 'OrderDate DATE req', 'Status TEXT(20) req'] },
            { n: 'SalesOrderLine', he: 'שורת הזמנת לקוח', t: ['trans', 'link'], syn: ['OrderItem', 'OrderLine', 'SOLine', 'SalesOrderItem', 'SalesOrderDetail', 'OrderDetail', 'SalesLine'], heSyn: ['שורת הזמנה', 'פריט בהזמנה'], kw: ['שורת הזמנה', 'שורה בהזמנה', 'פריט בהזמנה', 'order line'],
              q: 'הזמנה כוללת כמה פריטים, כל אחד בכמות משלו. איפה זה נשמר?', why: 'שורת הזמנה מפרקת את הקשר רבים-לרבים בין הזמנה לפריט.',
              f: ['SalesOrderLineID INTEGER PK', 'SalesOrderID INTEGER req ->SalesOrder.SalesOrderID', 'ItemID INTEGER req ->Item.ItemID', 'Quantity DECIMAL(3) req', 'UnitPrice DECIMAL(2) req'] },
            { n: 'Shipment', he: 'משלוח', t: 'trans', syn: ['Delivery', 'Shipping', 'Dispatch'], heSyn: ['אספקה'], kw: ['משלוח', 'אספקה', 'shipment', 'delivery'], q: 'איך ההזמנה מגיעה ללקוח?', why: 'משלוח הוא תנועה נפרדת, כי הזמנה יכולה לצאת בכמה משלוחים.',
              f: ['ShipmentID INTEGER PK', 'ShipmentNo TEXT(20) req', 'SalesOrderID INTEGER req ->SalesOrder.SalesOrderID', 'ShipDate DATE req', 'Carrier TEXT(50) opt'] },
          ],
          rels: [
            ['Customer', 'SalesOrder', '1', '0N', 'מבצע', 'לקוח חוזר מבצע הרבה הזמנות, וכל הזמנה שייכת ללקוח אחד.'],
            ['SalesOrder', 'SalesOrderLine', '1', '1N', 'כוללת', 'אין הזמנה בלי שורות.'],
            ['Item', 'SalesOrderLine', '1', '0N', 'מופיע ב'],
            ['SalesOrder', 'Shipment', '1', '0N', 'נשלחת ב', 'משלוח חלקי אפשרי, ולכן כמה משלוחים להזמנה.'],
          ],
        },
      ],
    },
    {
      id: 'erd-targets',
      title: 'יעדי מכירה',
      kind: 'נרמול קובץ שטוח',
      level: 'conceptual',
      short: 'מפרקים קובץ אקסל שטוח לישויות וקשרים, ברמה מושגית.',
      scenario: [
        'מחלקת התכנון ברשת "סיטי-מרקט" מנהלת את יעדי המכירה בקובץ אקסל אחד. כל שורה היא יעד חודשי של סניף בקטגוריית מוצרים.',
        'פרטי הסניף, האזור ומנהל האזור חוזרים בעשרות שורות. כשמנהל אזור מתחלף, צריך לעדכן את כל השורות שלו, ולפעמים שוכחים אחת.',
      ],
      task: 'פרקו את הקובץ לישויות והגדירו ביניהן קשרים עם קרדינליות. רמה מושגית: שדות לא נדרשים.',
      doc: {
        title: 'הקובץ השטוח: SalesTargets.xlsx',
        ltrHead: true,
        columns: ['BranchCode', 'BranchName', 'BranchCity', 'RegionName', 'RegionManager', 'Month', 'CategoryCode', 'CategoryName', 'TargetAmount'],
        rows: [
          ['B01', 'סיטי-מרקט דיזנגוף', 'תל אביב', 'מרכז', 'דנה כהן', '2026-01', 'C10', 'מוצרי חלב', '450,000'],
          ['B01', 'סיטי-מרקט דיזנגוף', 'תל אביב', 'מרכז', 'דנה כהן', '2026-01', 'C20', 'ניקיון', '120,000'],
          ['B01', 'סיטי-מרקט דיזנגוף', 'תל אביב', 'מרכז', 'דנה כהן', '2026-02', 'C10', 'מוצרי חלב', '470,000'],
          ['B02', 'סיטי-מרקט הדר', 'חיפה', 'צפון', 'יוסי לוי', '2026-01', 'C10', 'מוצרי חלב', '310,000'],
          ['B02', 'סיטי-מרקט הדר', 'חיפה', 'צפון', 'יוסי לוי', '2026-01', 'C20', 'ניקיון', '95,000'],
          ['B03', 'סיטי-מרקט קריון', 'קריית ביאליק', 'צפון', 'יוסי לוי', '2026-01', 'C10', 'מוצרי חלב', '220,000'],
        ],
      },
      hints: [
        'חפשו עמודות שהערכים שלהן חוזרים שוב ושוב יחד. כל קבוצה כזו היא מועמדת לישות.',
        'BranchName ו-BranchCity תלויים רק ב-BranchCode, ו-RegionManager תלוי רק ב-RegionName. מה זה אומר על המבנה?',
        'היעד עצמו (TargetAmount) תלוי בשילוב של סניף, קטגוריה וחודש. זו ישות התנועה, והיא מחוברת לסניף ולקטגוריה.',
      ],
      solutions: [
        { label: 'ארבע ישויות', entities: null, rels: null },
        { label: 'עם מנהל אזור כישות', entities: null, rels: null },
        { label: 'עם תקופה כישות', entities: null, rels: null },
      ],
    },
  ];

  // complete solutions that are derived from others (keeps authoring short)
  (function completeSolutions() {
    const po = EXERCISES[0].solutions;
    po[1].entities = po[0].entities.map((e) => {
      if (e.n === 'GoodsReceipt')
        return Object.assign({}, e, {
          why: 'קליטה היא תנועה של משלוח מספק, ומשלוח אחד יכול לכסות כמה הזמנות.',
          f: ['GoodsReceiptID INTEGER PK', 'ReceiptNo TEXT(20) req', 'SupplierID INTEGER req ->Supplier.SupplierID', 'ReceiptDateTime DATETIME req'],
        });
      if (e.n === 'GoodsReceiptLine')
        return Object.assign({}, e, {
          f: ['GoodsReceiptLineID INTEGER PK', 'GoodsReceiptID INTEGER req ->GoodsReceipt.GoodsReceiptID', 'PurchaseOrderLineID INTEGER req ->PurchaseOrderLine.PurchaseOrderLineID', 'ItemID INTEGER req ->Item.ItemID', 'ReceivedQty DECIMAL(3) req'],
        });
      return e;
    });
    const T = {
      Region: { n: 'Region', he: 'אזור', t: 'master', syn: ['Area', 'District', 'Zone'], heSyn: ['מחוז'], kw: ['אזור', 'מחוז', 'region'], q: 'אילו ערכים חוזרים יחד עם שם האזור בכל שורה?', why: 'אזור הוא נתון אב: מנהל האזור שייך לאזור ולא ליעד.' },
      Branch: { n: 'Branch', he: 'סניף', t: 'master', syn: ['Store', 'Shop', 'Outlet', 'Site'], heSyn: ['חנות'], kw: ['סניף', 'חנות', 'store', 'branch'], q: 'BranchName ו-BranchCity חוזרים בכל שורה של אותו קוד סניף. איפה הם צריכים לשבת?', why: 'סניף הוא נתון אב שהיעדים מפנים אליו.' },
      ItemCategory: { n: 'ItemCategory', he: 'קטגוריה', t: ['code', 'master'], syn: ['Category', 'ProductCategory', 'ProductGroup', 'ItemGroup', 'Department'], heSyn: ['קטגוריית מוצרים', 'קטגוריית פריטים'], kw: ['קטגוריה', 'קבוצת מוצרים', 'category'], q: 'CategoryName חוזר עם כל CategoryCode. מה זה אומר?', why: 'קטגוריה היא רשימת קוד קטנה וקבועה.' },
      SalesTarget: { n: 'SalesTarget', he: 'יעד מכירה', t: 'trans', syn: ['Target', 'MonthlyTarget', 'BranchTarget', 'SalesGoal', 'Goal', 'Budget', 'SalesBudget'], heSyn: ['יעד', 'יעדי מכירה', 'יעד חודשי'], kw: ['יעד', 'target', 'goal'], q: 'מה נשאר בכל שורה אחרי שמוציאים את פרטי הסניף, האזור והקטגוריה?', why: 'יעד מכירה הוא הרשומה עצמה: סכום לסניף, לקטגוריה ולחודש.' },
      Employee: { n: 'Employee', he: 'עובד', t: 'master', syn: ['Manager', 'RegionManager', 'Person', 'Staff', 'Worker'], heSyn: ['מנהל אזור', 'מנהל'], kw: ['מנהל', 'עובד', 'manager', 'employee'], q: 'מנהל אזור הוא אדם. האם כדאי לשמור אותו כישות?', why: 'מנהל הוא עובד, ונתוני האדם לא שייכים לאזור.' },
      Period: { n: 'Period', he: 'תקופה', t: ['code', 'master'], syn: ['Month', 'CalendarMonth', 'TimePeriod', 'FiscalPeriod', 'TargetMonth'], heSyn: ['חודש'], kw: ['חודש', 'תקופה', 'month', 'period'], q: 'יעד נקבע לחודש. האם החודש הוא ישות בפני עצמו?', why: 'תקופה כישות מאפשרת לנהל חודשים פתוחים וסגורים.' },
    };
    const base = [
      ['Region', 'Branch', '1', '0N', 'כולל', 'כל סניף שייך לאזור אחד, ובאזור כמה סניפים.'],
      ['Branch', 'SalesTarget', '1', '0N', 'מקבל', 'לסניף יש יעד לכל קטגוריה ולכל חודש.'],
      ['ItemCategory', 'SalesTarget', '1', '0N', 'מוגדר ל', 'לכל קטגוריה יעדים בכמה סניפים וחודשים.'],
    ];
    const s = EXERCISES[2].solutions;
    s[0].entities = [T.Region, T.Branch, T.ItemCategory, T.SalesTarget];
    s[0].rels = base;
    s[1].entities = [T.Region, T.Branch, T.ItemCategory, T.SalesTarget, T.Employee];
    s[1].rels = base.concat([['Employee', 'Region', '1', '0N', 'מנהל', 'לכל אזור מנהל אחד, ועובד יכול לנהל כמה אזורים.']]);
    s[2].entities = [T.Region, T.Branch, T.ItemCategory, T.SalesTarget, T.Period];
    s[2].rels = base.concat([['Period', 'SalesTarget', '1', '0N', 'חל על']]);
  })();

  const exById = (id) => EXERCISES.find((e) => e.id === id);
  const resolveEx = (x) => (typeof x === 'string' ? exById(x) : x);

  // ---------------------------------------------------------------- model helpers
  const entByName = (model, name) => {
    const n = String(name || '').toLowerCase();
    return model.entities.find((e) => (e.name || '').toLowerCase() === n);
  };
  function resolveRef(model, ref) {
    if (!ref) return null;
    const i = ref.lastIndexOf('.');
    if (i < 0) return { ent: null, field: null };
    const ent = entByName(model, ref.slice(0, i));
    const fname = ref.slice(i + 1).toLowerCase();
    const field = ent ? ent.fields.find((f) => (f.name || '').toLowerCase() === fname) : null;
    return { ent, field };
  }
  const relBetween = (model, a, b) => model.rels.find((r) => (r.from === a.id && r.to === b.id) || (r.from === b.id && r.to === a.id));
  const isIdent = (s) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s || '');

  // ---------------------------------------------------------------- validation (BR4)
  /** Structural check. Returns {errors:[{msg,target}], warnings:[...]}; target = {kind:'entity'|'field'|'rel', id}. */
  function validate(model, level) {
    const logical = level !== 'conceptual';
    const errors = [];
    const warnings = [];
    const E = (msg, kind, id) => errors.push({ msg, target: { kind, id } });
    const W = (msg, kind, id) => warnings.push({ msg, target: { kind, id } });
    const ents = model.entities || [];
    const byId = new Map(ents.map((e) => [e.id, e]));
    const nm = (e) => e.name || '(ללא שם)';

    // entity names
    const seen = {};
    ents.forEach((e) => {
      if (!String(e.name || '').trim()) return E('ישות בלי שם טכני', 'entity', e.id);
      const k = e.name.trim().toLowerCase();
      if (seen[k]) {
        E(`שתי ישויות באותו שם: ${e.name}`, 'entity', e.id);
        if (seen[k] !== true) E(`שתי ישויות באותו שם: ${e.name}`, 'entity', seen[k]);
        seen[k] = true;
      } else seen[k] = e.id;
      if (!isIdent(e.name.trim())) W(`השם ${e.name} לא תקין כשם טכני: אותיות באנגלית, ספרות וקו תחתון, בלי רווחים`, 'entity', e.id);
    });

    // relationships
    model.rels.forEach((r) => {
      const a = byId.get(r.from);
      const b = byId.get(r.to);
      const label = `${a ? nm(a) : '?'} ↔ ${b ? nm(b) : '?'}`;
      if (!a || !b) return E(`קשר ${label}: חסרה ישות בצד אחד`, 'rel', r.id);
      if (!r.fromCard || !r.toCard) E(`קשר ${label}: חסרה קרדינליות ${!r.fromCard && !r.toCard ? 'בשני הצדדים' : 'בצד ' + (!r.fromCard ? nm(a) : nm(b))}`, 'rel', r.id);
      if (logical && isMany(r.fromCard) && isMany(r.toCard)) E(`קשר ${label}: רבים-לרבים שלא פורק לישות קישור`, 'rel', r.id);
    });

    // fields
    ents.forEach((e) => {
      const fields = e.fields || [];
      fields.forEach((f) => {
        if (f.ref) {
          const res = resolveRef(model, f.ref);
          if (!res.field) E(`${nm(e)}.${f.name || '?'}: מפתח זר מפנה ל-${f.ref}, שדה שלא קיים`, 'field', f.id);
        }
        if (!logical) return;
        if (!String(f.name || '').trim()) E(`${nm(e)}: שדה בלי שם טכני`, 'field', f.id);
        else if (!isIdent(f.name.trim())) W(`${nm(e)}.${f.name}: שם טכני צריך להיות באנגלית, בלי רווחים`, 'field', f.id);
        if (!f.type) E(`${nm(e)}.${f.name || '?'}: שדה בלי סוג נתון`, 'field', f.id);
      });
      if (logical && !fields.some((f) => f.pk)) E(`${nm(e)}: ישות בלי מפתח ראשי`, 'entity', e.id);
    });

    // warnings
    if (ents.length > 1)
      ents.forEach((e) => {
        if (!model.rels.some((r) => r.from === e.id || r.to === e.id)) W(`${nm(e)}: ישות בלי קשרים`, 'entity', e.id);
      });
    if (logical) {
      const occ = {};
      ents.forEach((e) => (e.fields || []).forEach((f) => {
        if (!f.name) return;
        const k = f.name.toLowerCase();
        (occ[k] = occ[k] || []).push({ e, f });
      }));
      Object.keys(occ).forEach((k) => {
        const list = occ[k];
        if (new Set(list.map((x) => x.e.id)).size < 2) return;
        const pkOwner = list.find((x) => x.f.pk);
        if (!pkOwner) return;
        list.forEach((x) => {
          if (x === pkOwner || x.f.pk || x.f.ref) return;
          W(`${nm(x.e)}.${x.f.name}: אותו שם כמו המפתח הראשי של ${nm(pkOwner.e)}, אבל לא מוגדר כמפתח זר`, 'field', x.f.id);
        });
      });
    }
    return { errors, warnings };
  }

  // ---------------------------------------------------------------- matching (BR6)
  function kwScore(text, kws) {
    let s = 0;
    (kws || []).forEach((k) => {
      if (text.includes(heNorm(k))) s += heNorm(k).length;
    });
    return s;
  }
  /** Map refName -> {ent, method} for one solution. */
  function matchEntities(model, sol, opts) {
    opts = opts || {};
    const map = new Map();
    const used = new Set();
    const subs = model.entities.filter((e) => e.name || e.display);
    const pass = (fn, method) =>
      sol.entities.forEach((re) => {
        if (map.has(re.n)) return;
        const cand = subs.find((se) => !used.has(se.id) && fn(se, re));
        if (cand) {
          map.set(re.n, { ent: cand, method });
          used.add(cand.id);
        }
      });
    pass((se, re) => norm(se.name) && norm(se.name) === norm(re.n), 'name');
    pass((se, re) => norm(se.name) && (re.syn || []).some((s) => norm(s) === norm(se.name)), 'synonym');
    const aliases = opts.aliases || {};
    pass((se, re) => aliases[se.id] === re.n, 'ai');
    pass((se, re) => se.display && [re.he].concat(re.heSyn || []).some((x) => heNorm(x) === heNorm(se.display)), 'hebrew');
    // keyword overlap over display name + description + the learner's explanation
    const descs = opts.descs || {};
    subs.forEach((se) => {
      if (used.has(se.id)) return;
      const text = heNorm([se.display, se.desc, descs[se.id]].filter(Boolean).join(' '));
      if (!text) return;
      let best = null;
      let tie = false;
      sol.entities.forEach((re) => {
        if (map.has(re.n)) return;
        const sc = kwScore(text, re.kw);
        if (!sc) return;
        if (!best || sc > best.sc) {
          best = { re, sc };
          tie = false;
        } else if (sc === best.sc) tie = true;
      });
      if (best && !tie) {
        map.set(best.re.n, { ent: se, method: 'keyword' });
        used.add(se.id);
      }
    });
    return map;
  }

  const METHOD_HE = { name: 'לפי שם', synonym: 'לפי שם נרדף', ai: 'לפי משמעות', hebrew: 'לפי שם התצוגה', keyword: 'לפי התיאור' };

  function typeScore(a, b) {
    if (!a) return 0;
    if (a === b) return 1;
    const num = ['INTEGER', 'DECIMAL'];
    const dt = ['DATE', 'DATETIME'];
    if (num.includes(a) && num.includes(b)) return 0.5;
    if (dt.includes(a) && dt.includes(b)) return 0.75;
    return 0;
  }
  const typeStr = (f) => (f.type ? f.type + (f.len ? '(' + f.len + ')' : '') : '?');
  function sideScore(actual, expected) {
    if (actual === expected) return 1;
    if (actual && expected && isMany(actual) === isMany(expected)) return 0.5;
    return 0;
  }
  function findField(se, rf, re, ex, used) {
    const meta = (ex.fieldMeta || {})[rf.name] || {};
    const names = [rf.name].concat(meta.syn || []).map(norm);
    const pre = [re.n].concat(re.syn || [], [se.name], ex.prefixes || []).map(norm).filter(Boolean).sort((a, b) => b.length - a.length);
    const strip = (s) => {
      for (const p of pre) if (s.length > p.length && s.startsWith(p)) return s.slice(p.length);
      return s;
    };
    const cands = se.fields.filter((f) => f.name && !f.pk && !f.ref && !used.has(f.id));
    return cands.find((f) => names.includes(norm(f.name))) || cands.find((f) => names.some((n) => strip(n) === strip(norm(f.name))));
  }

  // ---------------------------------------------------------------- grading (BR5, BR7, BR9, BR13)
  function gradeOne(model, ex, sol, opts) {
    const logical = ex.level === 'logical';
    const detailed = !!opts.detailed;
    const fb = [];
    const marks = { e: {}, f: {}, r: {} };
    const RANK = { good: 1, warn: 2, bad: 3 };
    const mark = (t, st) => {
      if (!t || !st || !marks[t.kind[0]]) return;
      const m = marks[t.kind[0]];
      if (!m[t.id] || RANK[st] > RANK[m[t.id]]) m[t.id] = st;
    };
    const add = (target, skill, sev, guide, full, markAs) => {
      fb.push({ target, skill, sev, text: detailed ? full : guide });
      if (target) mark(target, markAs === undefined ? sev : markAs);
    };
    const T = (kind, id) => ({ kind, id });
    const M = matchEntities(model, sol, opts);
    const subOf = (n) => (M.get(n) ? M.get(n).ent : null);
    const parts = {};

    // entities
    let eSum = 0;
    sol.entities.forEach((re) => {
      const m = M.get(re.n);
      if (m) {
        const types = [].concat(re.t);
        const okType = types.includes(m.ent.type);
        eSum += okType ? 1 : 0.85;
        if (okType) add(T('entity', m.ent.id), 'entities', 'good', `${m.ent.name}: ישות נכונה (${METHOD_HE[m.method]})`, `${m.ent.name} מתאימה ל-${re.n} (${re.he}), ${METHOD_HE[m.method]}. ${re.why}`);
        else
          add(T('entity', m.ent.id), 'entities', 'warn',
            `${m.ent.name}: הישות נכונה, אבל בדקו את סוג הישות. האם היא מתארת דבר קבוע שחוזר בהרבה תנועות, או אירוע שקורה בזמן מסוים?`,
            `${m.ent.name}: סוג הישות צריך להיות ${types.map(etypeHe).join(' או ')} (סומן ${etypeHe(m.ent.type)}). ${(ETYPES.find((x) => x.v === types[0]) || {}).why || ''}`);
      } else {
        let anchor = null;
        sol.rels.forEach((rr) => {
          if (anchor) return;
          if (rr.from === re.n && subOf(rr.to)) anchor = subOf(rr.to);
          else if (rr.to === re.n && subOf(rr.from)) anchor = subOf(rr.from);
        });
        add(anchor ? T('entity', anchor.id) : null, 'entities', 'bad', (anchor ? `סביב ${anchor.name}: ` : '') + re.q, `חסרה ישות ${re.n} (${re.he}). ${re.why}`, 'warn');
      }
    });
    parts.entities = sol.entities.length ? eSum / sol.entities.length : 1;

    // relationships
    let rSum = 0;
    const usedRels = new Set();
    sol.rels.forEach((rr) => {
      const a = subOf(rr.from);
      const b = subOf(rr.to);
      if (!a || !b) return; // the missing entity is already reported
      const cands = model.rels.filter((r) => !usedRels.has(r.id) && ((r.from === a.id && r.to === b.id) || (r.from === b.id && r.to === a.id)));
      const expect = `לכל ${a.name}: ${cardHe(rr.tc)} ${b.name}, ולכל ${b.name}: ${cardHe(rr.fc)} ${a.name}.`;
      if (!cands.length) {
        add(T('entity', b.id), 'relationships', 'bad', `${b.name}: חסר לה קשר. לאיזו ישות היא צריכה להיות מחוברת, ובאיזו קרדינליות?`, `חסר קשר בין ${a.name} ל-${b.name}: ${expect} ${rr.why}`, 'warn');
        return;
      }
      let best = null;
      cands.forEach((r) => {
        const atA = r.from === a.id ? r.fromCard : r.toCard;
        const atB = r.from === a.id ? r.toCard : r.fromCard;
        const sa = sideScore(atA, rr.fc);
        const sb = sideScore(atB, rr.tc);
        const sc = 0.5 + 0.25 * sa + 0.25 * sb;
        if (!best || sc > best.sc) best = { r, sc, sa, sb, atA, atB };
      });
      usedRels.add(best.r.id);
      rSum += best.sc;
      const t = T('rel', best.r.id);
      if (best.sa === 1 && best.sb === 1) add(t, 'relationships', 'good', `${a.name} ↔ ${b.name}: קשר וקרדינליות נכונים`, `${a.name} ↔ ${b.name}: נכון. ${expect}`);
      else {
        const qs = [];
        if (best.sb < 1) qs.push(`כמה ${b.name} יכולות להיות ל-${a.name} אחת, והאם ${a.name} יכולה להתקיים בלי אף ${b.name}?`);
        if (best.sa < 1) qs.push(`לכמה ${a.name} שייכת ${b.name} אחת, והאם זה חובה?`);
        const got = `לכל ${a.name}: ${cardHe(best.atB)} ${b.name}, ולכל ${b.name}: ${cardHe(best.atA)} ${a.name}`;
        add(t, 'relationships', best.sa + best.sb >= 1 ? 'warn' : 'bad', `${a.name} ↔ ${b.name}: בדקו את הקרדינליות. ${qs.join(' ')}`, `${a.name} ↔ ${b.name}: צריך להיות ${expect} (סומן: ${got}). ${rr.why}`);
      }
    });
    // extra relationships between recognized entities - reported, not penalized
    const matchedIds = new Set([...M.values()].map((m) => m.ent.id));
    model.rels.forEach((r) => {
      if (usedRels.has(r.id) || !matchedIds.has(r.from) || !matchedIds.has(r.to)) return;
      const a = model.entities.find((e) => e.id === r.from);
      const b = model.entities.find((e) => e.id === r.to);
      if (isMany(r.fromCard) && isMany(r.toCard) && !logical) return; // conceptual M:N may stand for a link entity
      add(T('rel', r.id), 'relationships', 'warn', `${a.name} ↔ ${b.name}: האם הקשר הזה נחוץ, או שאפשר להגיע ממנו דרך ישויות אחרות?`, `${a.name} ↔ ${b.name}: הקשר לא מופיע בפתרון. אפשר להגיע מ-${a.name} ל-${b.name} דרך קשרים אחרים, וקשר ישיר יוצר כפילות. הקשר לא הוריד ניקוד.`);
    });
    parts.relationships = sol.rels.length ? rSum / sol.rels.length : 1;

    if (logical) {
      // keys
      let kTot = 0;
      let kOk = 0;
      sol.entities.forEach((re) => {
        const se = subOf(re.n);
        kTot++;
        if (se && se.fields.some((f) => f.pk)) {
          kOk++;
          se.fields.filter((f) => f.pk).forEach((f) => mark(T('field', f.id), 'good'));
        }
        re.fields.filter((f) => f.ref).forEach((rf) => {
          kTot++;
          const parentName = rf.ref.split('.')[0];
          const pse = subOf(parentName);
          if (!se || !pse) return;
          const hit = se.fields.find((f) => f.ref && f.ref.split('.')[0].toLowerCase() === pse.name.toLowerCase());
          if (!hit) {
            add(T('entity', se.id), 'keys', 'bad', `${se.name}: איך יודעים לאיזו ${pse.name} שייכת כל רשומה כאן?`, `ב-${se.name} חסר מפתח זר שמפנה ל-${pse.name} (בפתרון: ${rf.name} → ${rf.ref}).`, 'warn');
            return;
          }
          const tgt = resolveRef(model, hit.ref);
          if (tgt.field && !tgt.field.pk) {
            kOk += 0.5;
            add(T('field', hit.id), 'keys', 'warn', `${se.name}.${hit.name}: לאיזה שדה ב-${pse.name} מפתח זר מפנה בדרך כלל?`, `${se.name}.${hit.name} מפנה ל-${hit.ref}, שאינו המפתח הראשי. מפתח זר מפנה למפתח הראשי של ${pse.name}.`);
          } else {
            kOk++;
            add(T('field', hit.id), 'keys', 'good', `${se.name}.${hit.name}: מפתח זר נכון`, `${se.name}.${hit.name}: מפתח זר נכון ל-${pse.name}.`);
          }
        });
      });
      parts.keys = kTot ? kOk / kTot : 1;

      // fields
      let fTot = 0;
      let fSc = 0;
      sol.entities.forEach((re) => {
        const se = subOf(re.n);
        const graded = re.fields.filter((f) => !f.pk && !f.ref && !f.opt);
        fTot += graded.length;
        if (!se) return;
        const used = new Set();
        const missing = [];
        let okCount = 0;
        graded.forEach((rf) => {
          const sf = findField(se, rf, re, ex, used);
          if (!sf) return missing.push(rf.name);
          used.add(sf.id);
          const ts = typeScore(sf.type, rf.type);
          fSc += ts;
          if (ts === 1) {
            okCount++;
            mark(T('field', sf.id), 'good');
            return;
          }
          const trap = ((ex.fieldMeta || {})[rf.name] || {}).trap || '';
          add(T('field', sf.id), 'fieldTypes', ts >= 0.5 ? 'warn' : 'bad',
            `${se.name}.${sf.name}: האם ${typeStr(sf)} הוא הסוג המתאים? חשבו על ערך אמיתי מהמסמך.`,
            `${se.name}.${sf.name} צריך להיות ${typeStr(rf)} (סומן ${typeStr(sf)}). ${trap}`);
        });
        if (missing.length)
          add(T('entity', se.id), 'fieldTypes', 'warn', `${se.name}: חסרים שדות שמופיעים בתרחיש או במסמך הדוגמה. עברו עליו שוב.`, `${se.name}: חסרים השדות ${missing.join(', ')}.`);
        if (okCount) add(T('entity', se.id), 'fieldTypes', 'good', `${se.name}: ${okCount} שדות עם סוג נתון נכון`, `${se.name}: ${okCount} שדות עם סוג נתון נכון.`);
      });
      parts.fields = fTot ? fSc / fTot : 1;
    }

    const weights = WEIGHTS[ex.level];
    let score = 0;
    Object.keys(weights).forEach((k) => (score += weights[k] * (parts[k] || 0)));
    const matches = {};
    M.forEach((v, k) => (matches[v.ent.id] = k));
    return {
      score: Math.round(score),
      raw: score,
      parts,
      weights,
      feedback: fb,
      marks,
      matches,
      unknown: model.entities.filter((e) => !matches[e.id]).map((e) => e.id),
      missingRefs: sol.entities.filter((re) => !M.has(re.n)).map((re) => re.n),
      solutionLabel: sol.label,
      _M: M,
    };
  }

  /** Context for planted-error checks (fix exercises). */
  function plantedCtx(model, ex, opts) {
    const M = matchEntities(model, prepSolution(ex.solutions[0]), opts);
    const dangling = [];
    model.entities.forEach((e) => e.fields.forEach((f) => {
      if (f.ref && !resolveRef(model, f.ref).field) dangling.push(f);
    }));
    return {
      model,
      ent: (n) => (M.get(n) ? M.get(n).ent : null),
      relBetween: (a, b) => relBetween(model, a, b),
      dangling,
    };
  }
  /** Planted issues still present in the model: [{id, skill, target, guide, full}] */
  function plantedIssues(model, exOrId, opts) {
    const ex = resolveEx(exOrId);
    if (!ex || !ex.planted) return [];
    const c = plantedCtx(model, ex, opts || {});
    const out = [];
    ex.planted.forEach((p) => {
      const t = p.check(c);
      if (t) out.push({ id: p.id, skill: p.skill, target: t, guide: p.guide, full: p.full });
    });
    return out;
  }

  /** Grades a model against every reference solution and keeps the best (BR7).
      opts: {attempt, solutionViewed, aliases:{entityId: refName}, descs:{entityId: text}} */
  function grade(model, exOrId, opts) {
    const ex = resolveEx(exOrId);
    opts = Object.assign({}, opts || {});
    if (opts.detailed == null) opts.detailed = (opts.attempt || 1) >= 3 || !!opts.solutionViewed;
    let best = null;
    ex.solutions.forEach((def, i) => {
      const g = gradeOne(model, ex, prepSolution(def), opts);
      g.solutionIndex = i;
      if (!best || g.raw > best.raw) best = g;
    });
    const res = best;
    // learner entities that matched no reference entity in any solution - not counted wrong (BR6)
    const everMatched = new Set();
    ex.solutions.forEach((def) => matchEntities(model, prepSolution(def), opts).forEach((v) => everMatched.add(v.ent.id)));
    res.unknown = model.entities.filter((e) => !everMatched.has(e.id)).map((e) => e.id);
    res.unknown.forEach((id) => {
      const e = model.entities.find((x) => x.id === id);
      res.feedback.push({ target: { kind: 'entity', id }, skill: 'entities', sev: 'info', text: `${e.name || e.display || 'ישות'}: לא זיהינו מה הישות מייצגת. היא לא נספרת כשגיאה. אפשר לתאר אותה בהגשה הבאה.` });
    });
    // planted errors
    if (ex.planted) {
      const present = plantedIssues(model, ex, opts);
      const keys = new Set(present.map((p) => p.target.kind + ':' + p.target.id));
      res.feedback = res.feedback.filter((f) => f.sev === 'good' || f.sev === 'info' || !f.target || !keys.has(f.target.kind + ':' + f.target.id));
      present.forEach((p) => {
        const t = p.target.kind === 'model' ? null : p.target;
        res.feedback.unshift({ target: t, skill: p.skill, sev: 'bad', text: opts.detailed ? p.full : p.guide, planted: p.id });
        if (t) res.marks[t.kind[0]][t.id] = 'bad';
      });
      res.planted = { total: ex.planted.length, remaining: present.map((p) => p.id) };
    }
    const order = { bad: 0, warn: 1, info: 2, good: 3 };
    res.feedback.sort((a, b) => order[a.sev] - order[b.sev]);
    // BR13: items without an element are not shown as separate items - they go to a summary line
    res.summary = res.feedback.filter((f) => !f.target).map((f) => f.text);
    res.feedback = res.feedback.filter((f) => f.target);
    res.detailed = opts.detailed;
    res.skills = {};
    Object.keys(res.weights).forEach((k) => (res.skills[PART_SKILL[k]] = Math.round((res.parts[k] || 0) * 100)));
    delete res._M;
    return res;
  }

  // ---------------------------------------------------------------- export (Interface 3)
  const MER_L = { '01': '|o', 1: '||', '0N': '}o', '1N': '}|' };
  const MER_R = { '01': 'o|', 1: '||', '0N': 'o{', '1N': '|{' };
  const ident = (s) => String(s || 'Unnamed').trim().replace(/[^A-Za-z0-9_]/g, '_') || 'Unnamed';
  function toMermaid(model) {
    const lines = ['erDiagram'];
    const byId = new Map(model.entities.map((e) => [e.id, e]));
    model.rels.forEach((r) => {
      const a = byId.get(r.from);
      const b = byId.get(r.to);
      if (!a || !b) return;
      lines.push(`  ${ident(a.name)} ${MER_L[r.fromCard] || '||'}--${MER_R[r.toCard] || '||'} ${ident(b.name)} : "${String(r.name || '').replace(/"/g, "'")}"`);
    });
    model.entities.forEach((e) => {
      if (!e.fields.length) {
        lines.push(`  ${ident(e.name)}`);
        return;
      }
      lines.push(`  ${ident(e.name)} {`);
      e.fields.forEach((f) => {
        const keys = [f.pk && 'PK', f.ref && 'FK'].filter(Boolean).join(', ');
        const t = (f.type || 'UNKNOWN') + (f.len ? '(' + f.len + ')' : '');
        const comment = [f.required && !f.pk ? 'required' : '', f.ref ? 'ref ' + f.ref : ''].filter(Boolean).join('; ');
        lines.push(`    ${t} ${ident(f.name)}${keys ? ' ' + keys : ''}${comment ? ' "' + comment + '"' : ''}`);
      });
      lines.push('  }');
    });
    return lines.join('\n') + '\n';
  }
  function sqlType(f) {
    switch (f.type) {
      case 'TEXT': return 'VARCHAR(' + (f.len || 255) + ')';
      case 'INTEGER': return 'INT';
      case 'DECIMAL': return 'DECIMAL(18, ' + (f.len || 2) + ')';
      case 'DATE': return 'DATE';
      case 'DATETIME': return 'DATETIME';
      case 'BOOLEAN': return 'BOOLEAN';
      default: return 'VARCHAR(255) /* סוג נתון חסר */';
    }
  }
  function toDDL(model) {
    const out = [];
    const ents = model.entities;
    const done = new Set();
    const order = [];
    const visiting = new Set();
    const visit = (e) => {
      if (done.has(e.id) || visiting.has(e.id)) return;
      visiting.add(e.id);
      e.fields.forEach((f) => {
        const t = f.ref && resolveRef(model, f.ref);
        if (t && t.ent && t.ent.id !== e.id) visit(t.ent);
      });
      visiting.delete(e.id);
      done.add(e.id);
      order.push(e);
    };
    ents.forEach(visit);
    const emitted = new Set();
    const later = [];
    order.forEach((e) => {
      const tn = ident(e.name);
      const defs = [];
      const notes = [];
      e.fields.forEach((f) => defs.push(`${ident(f.name)} ${sqlType(f)}${f.required || f.pk ? ' NOT NULL' : ''}`));
      const pk = e.fields.filter((f) => f.pk).map((f) => ident(f.name));
      if (pk.length) defs.push(`CONSTRAINT PK_${tn} PRIMARY KEY (${pk.join(', ')})`);
      e.fields.forEach((f) => {
        if (!f.ref) return;
        const t = resolveRef(model, f.ref);
        if (!t.field) return notes.push(`-- ${tn}.${ident(f.name)}: מפנה ל-${f.ref} שלא קיים`);
        const fk = `CONSTRAINT FK_${tn}_${ident(f.name)} FOREIGN KEY (${ident(f.name)}) REFERENCES ${ident(t.ent.name)} (${ident(t.field.name)})`;
        if (t.ent.id === e.id || emitted.has(t.ent.id)) defs.push(fk);
        else later.push(`ALTER TABLE ${tn} ADD ${fk};`);
      });
      if (e.display) notes.unshift(`-- ${e.display}${e.desc ? ': ' + e.desc : ''}`);
      if (!defs.length) notes.push('-- רמה מושגית: עדיין לא הוגדרו שדות');
      out.push(notes.concat([`CREATE TABLE ${tn} (`, defs.map((d) => '  ' + d).join(',\n'), ');']).filter((x) => x !== '').join('\n') + '\n');
      emitted.add(e.id);
    });
    return out.join('\n') + (later.length ? '\n' + later.join('\n') + '\n' : '');
  }

  // ---------------------------------------------------------------- diagram (SVG)
  const HEAD = 28;
  const DISP = 17;
  const ROW = 19;
  const tw = (s, size) => String(s || '').length * size * 0.6;
  const trunc = (s, max) => (String(s).length > max ? String(s).slice(0, max - 1) + '…' : String(s));

  function layout(model, showFields) {
    const ents = model.entities;
    const byId = new Map(ents.map((e) => [e.id, e]));
    const size = new Map();
    ents.forEach((e) => {
      const fields = showFields ? e.fields : [];
      let w = Math.max(tw(e.name || '?', 13) + 34, e.display ? tw(e.display, 11) + 24 : 0);
      fields.forEach((f) => (w = Math.max(w, 44 + tw(f.name || '?', 12) + 16 + tw(typeStr(f), 11) + 10)));
      w = Math.round(Math.min(Math.max(w, showFields ? 150 : 130), 270));
      const hgt = HEAD + (e.display ? DISP : 0) + (fields.length ? fields.length * ROW + 8 : e.display ? 6 : 10);
      size.set(e.id, { w, h: hgt });
    });
    const parents = new Map(ents.map((e) => [e.id, []]));
    model.rels.forEach((r) => {
      if (!byId.has(r.from) || !byId.has(r.to) || r.from === r.to) return;
      if (isMany(r.fromCard) && isMany(r.toCard)) return;
      if (isMany(r.fromCard)) parents.get(r.from).push(r.to);
      else parents.get(r.to).push(r.from);
    });
    const layer = new Map(ents.map((e) => [e.id, 0]));
    for (let it = 0; it < ents.length; it++) {
      let ch = false;
      ents.forEach((e) => parents.get(e.id).forEach((p) => {
        const v = Math.min(layer.get(p) + 1, ents.length);
        if (v > layer.get(e.id)) {
          layer.set(e.id, v);
          ch = true;
        }
      }));
      if (!ch) break;
    }
    const levels = [...new Set(ents.map((e) => layer.get(e.id)))].sort((a, b) => a - b);
    const maxPer = showFields ? 3 : 4;
    let rows = [];
    const pos = new Map();
    levels.forEach((lv) => {
      let list = ents.filter((e) => layer.get(e.id) === lv);
      // barycenter ordering relative to already placed parents
      list = list
        .map((e, i) => {
          const ps = parents.get(e.id).filter((p) => pos.has(p));
          return { e, k: ps.length ? ps.reduce((s, p) => s + pos.get(p), 0) / ps.length : 1000 + i };
        })
        .sort((a, b) => a.k - b.k)
        .map((x) => x.e);
      for (let i = 0; i < list.length; i += maxPer) {
        const chunk = list.slice(i, i + maxPer);
        chunk.forEach((e, j) => pos.set(e.id, j - (chunk.length - 1) / 2));
        rows.push(chunk);
      }
    });
    const GX = 56;
    const GY = 70;
    const MARGIN = 30;
    const widths = rows.map((r) => r.reduce((s, e) => s + size.get(e.id).w, 0) + GX * (r.length - 1));
    const W = Math.max(320, ...widths.concat([0])) + MARGIN * 2;
    const boxes = new Map();
    let y = MARGIN;
    rows.forEach((r, ri) => {
      let x = (W - widths[ri]) / 2;
      const rh = Math.max(...r.map((e) => size.get(e.id).h));
      r.forEach((e) => {
        const s = size.get(e.id);
        boxes.set(e.id, { x, y, w: s.w, h: s.h });
        x += s.w + GX;
      });
      y += rh + GY;
    });
    return { boxes, width: W, height: Math.max(160, y - GY + MARGIN) };
  }

  function clip(b, dx, dy) {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const tx = dx ? b.w / 2 / Math.abs(dx) : Infinity;
    const ty = dy ? b.h / 2 / Math.abs(dy) : Infinity;
    const t = Math.min(tx, ty);
    return { x: cx + dx * t, y: cy + dy * t };
  }
  const P = (p) => p.x.toFixed(1) + ',' + p.y.toFixed(1);
  /** Crow's foot marker at border point p, u = unit vector pointing away from the entity. */
  function marker(p, u, card) {
    const n = { x: -u.y, y: u.x };
    const at = (d, s) => ({ x: p.x + u.x * d + n.x * s, y: p.y + u.y * d + n.y * s });
    let s = '';
    if (!card) return `<text class="mq" x="${at(16, 0).x.toFixed(1)}" y="${(at(16, 0).y + 4).toFixed(1)}" text-anchor="middle">?</text>`;
    if (isMany(card)) s += `<path class="mk" d="M${P(at(0, -7))} L${P(at(12, 0))} L${P(at(0, 7))}"/>`;
    else s += `<path class="mk" d="M${P(at(8, -6))} L${P(at(8, 6))}"/>`;
    if (card === '01' || card === '0N') s += `<circle class="mk mo" cx="${at(20, 0).x.toFixed(1)}" cy="${at(20, 0).y.toFixed(1)}" r="4.5"/>`;
    else s += `<path class="mk" d="M${P(at(16, -6))} L${P(at(16, 6))}"/>`;
    return s;
  }
  const ST_SYM = { good: '✓', warn: '!', bad: '✗' };

  /** Returns SVG markup for a model. opts: {showFields, marks, selected, label} */
  function diagramSVG(model, opts) {
    opts = opts || {};
    const marks = opts.marks || { e: {}, f: {}, r: {} };
    const L = layout(model, opts.showFields);
    const W = L.width;
    const H = L.height;
    let s = `<svg class="erd-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="group" aria-label="${esc(opts.label || 'תרשים ERD')}">`;
    if (!model.entities.length) {
      s += `<text class="empty" x="${W / 2}" y="${H / 2}" text-anchor="middle">הוסיפו ישות כדי להתחיל</text></svg>`;
      return s;
    }
    const byId = new Map(model.entities.map((e) => [e.id, e]));
    // edges
    const pairCount = {};
    const pairIdx = {};
    model.rels.forEach((r) => {
      const k = [r.from, r.to].sort().join('|');
      pairCount[k] = (pairCount[k] || 0) + 1;
    });
    let labels = '';
    model.rels.forEach((r) => {
      const A = L.boxes.get(r.from);
      const B = L.boxes.get(r.to);
      const a = byId.get(r.from);
      const b = byId.get(r.to);
      if (!A || !B) return;
      const st = marks.r[r.id];
      const title = `${a.name} ↔ ${b.name}${r.name ? ' (' + r.name + ')' : ''}: לכל ${a.name} ${cardHe(r.toCard)} ${b.name}; לכל ${b.name} ${cardHe(r.fromCard)} ${a.name}`;
      s += `<g class="rel${st ? ' st-' + st : ''}" data-rel="${r.id}"><title>${esc(title)}</title>`;
      if (r.from === r.to) {
        const x = A.x + A.w;
        const y1 = A.y + 10;
        const y2 = A.y + 34;
        s += `<path class="ln" d="M${x},${y1} C${x + 46},${y1 - 14} ${x + 46},${y2 + 14} ${x},${y2}"/>`;
        s += marker({ x, y: y1 }, { x: 1, y: 0 }, r.fromCard) + marker({ x, y: y2 }, { x: 1, y: 0 }, r.toCard);
        if (r.name) labels += `<text class="rl" x="${x + 40}" y="${(y1 + y2) / 2 + 4}">${esc(r.name)}</text>`;
        s += '</g>';
        return;
      }
      const k = [r.from, r.to].sort().join('|');
      const idx = (pairIdx[k] = (pairIdx[k] || 0) + 1) - 1;
      const off = (idx - (pairCount[k] - 1) / 2) * 16;
      let dx = B.x + B.w / 2 - (A.x + A.w / 2);
      let dy = B.y + B.h / 2 - (A.y + A.h / 2);
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      const nx = -dy * off;
      const ny = dx * off;
      const pa = clip({ x: A.x + nx, y: A.y + ny, w: A.w, h: A.h }, dx, dy);
      const pb = clip({ x: B.x + nx, y: B.y + ny, w: B.w, h: B.h }, -dx, -dy);
      s += `<path class="ln" d="M${P(pa)} L${P(pb)}"/>`;
      s += marker(pa, { x: dx, y: dy }, r.fromCard) + marker(pb, { x: -dx, y: -dy }, r.toCard);
      if (st) {
        const m = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
        labels += `<g class="rel st-${st}"><circle class="stb" cx="${m.x.toFixed(1)}" cy="${(m.y - (r.name ? 14 : 0)).toFixed(1)}" r="8"/><text class="sts" x="${m.x.toFixed(1)}" y="${(m.y - (r.name ? 14 : 0) + 4).toFixed(1)}" text-anchor="middle">${ST_SYM[st]}</text></g>`;
      }
      if (r.name) {
        const m = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
        labels += `<text class="rl" x="${m.x.toFixed(1)}" y="${(m.y + 4).toFixed(1)}" text-anchor="middle">${esc(r.name)}</text>`;
      }
      s += '</g>';
    });
    // entities
    model.entities.forEach((e) => {
      const b = L.boxes.get(e.id);
      const st = marks.e[e.id];
      const t = ETYPES.some((x) => x.v === e.type) ? e.type : 'none';
      const fields = opts.showFields ? e.fields : [];
      const aria = `${e.name || 'ישות'}${e.display ? ' (' + e.display + ')' : ''}, ${etypeHe(e.type)}${st ? ', ' + { good: 'נכון', warn: 'חלקי', bad: 'שגוי' }[st] : ''}`;
      s += `<g class="ent t-${t}${st ? ' st-' + st : ''}${opts.selected === e.id ? ' sel' : ''}" data-ent="${e.id}" tabindex="0" role="button" aria-label="${esc(aria)}">`;
      s += `<rect class="bd" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="8"/>`;
      s += `<path class="hd" d="M${b.x},${b.y + HEAD} V${b.y + 8} Q${b.x},${b.y} ${b.x + 8},${b.y} H${b.x + b.w - 8} Q${b.x + b.w},${b.y} ${b.x + b.w},${b.y + 8} V${b.y + HEAD} Z"/>`;
      s += `<text class="hdt" x="${b.x + b.w / 2}" y="${b.y + 19}" text-anchor="middle">${esc(trunc(e.name || '(ללא שם)', Math.floor((b.w - 26) / 8)))}</text>`;
      let y = b.y + HEAD;
      if (e.display) {
        s += `<text class="disp" x="${b.x + b.w / 2}" y="${y + 13}" text-anchor="middle">${esc(trunc(e.display, Math.floor((b.w - 12) / 6.6)))}</text>`;
        y += DISP;
      }
      y += 4;
      fields.forEach((f) => {
        const fst = marks.f[f.id];
        if (fst) s += `<rect class="frow st-${fst}" x="${b.x + 2}" y="${y}" width="${b.w - 4}" height="${ROW}" rx="3"/>`;
        const key = f.pk && f.ref ? 'PF' : f.pk ? 'PK' : f.ref ? 'FK' : '';
        const dangling = f.ref && !resolveRef(model, f.ref).field;
        if (key) s += `<text class="${f.pk ? 'kpk' : 'kfk'}${dangling ? ' kbad' : ''}" x="${b.x + 8}" y="${y + 13.5}">${key}</text>`;
        s += `<text class="fn${f.required ? ' req' : ''}" x="${b.x + 32}" y="${y + 13.5}">${esc(trunc(f.name || '?', Math.floor((b.w - 40 - tw(typeStr(f), 11)) / 7.2)))}${fst ? ' ' + ST_SYM[fst] : ''}</text>`;
        s += `<text class="ft${f.type ? '' : ' miss'}" x="${b.x + b.w - 8}" y="${y + 13.5}" text-anchor="end">${esc(typeStr(f))}</text>`;
        y += ROW;
      });
      if (st) s += `<circle class="stb" cx="${b.x + b.w - 4}" cy="${b.y + 4}" r="9"/><text class="sts" x="${b.x + b.w - 4}" y="${b.y + 8}" text-anchor="middle">${ST_SYM[st]}</text>`;
      s += '</g>';
    });
    s += labels + '</svg>';
    return s;
  }

  function cardIcon(card) {
    const p = { x: 70, y: 11 };
    return `<svg class="erd-cardicon" viewBox="0 0 84 22" width="84" height="22" aria-hidden="true" style="direction:ltr"><path class="ln" d="M4,11 L70,11"/>${marker(p, { x: -1, y: 0 }, card)}<rect class="cbx" x="70" y="2" width="12" height="18" rx="2"/></svg>`;
  }

  // ---------------------------------------------------------------- styles
  const ERD_CSS = `
.erd-split { grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); }
.erd-split.wide { grid-template-columns: minmax(0, 1fr); }
.erd-ed .card h2 { margin-top: 0; font-size: 1.05rem; }
.erd-ed input[type='text'], .erd-ed select { min-height: 32px; padding: 3px 6px; font-size: 0.86rem; width: 100%; border-radius: 6px; }
.erd-ed table.tbl td, .erd-ed table.tbl th { padding: 4px 4px; vertical-align: middle; font-size: 0.85rem; }
.erd-ed table.tbl th { position: static; }
.erd-ed td.c { text-align: center; }
.erd-ed tr.sel > td { box-shadow: inset 0 0 0 9999px var(--primary-soft); }
.erd-ed tr.sel > td:first-child { border-inline-start: 3px solid var(--primary); }
.erd-ed .tech { direction: ltr; text-align: left; font-family: var(--mono); }
.erd-ed .table-wrap { max-height: none; }
.erd-ed input[type='checkbox'] { width: 18px; height: 18px; }
.erd-rels { display: grid; gap: 8px; }
.erd-rel { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 0.8fr) minmax(0, 1fr) 34px; gap: 2px 6px; align-items: center; padding: 8px; border: 1px solid var(--border); border-radius: 10px; }
.erd-rel .c { text-align: center; }
.erd-rel .erd-sent { grid-column: 1 / -1; font-size: 0.78rem; color: var(--muted); margin-top: 2px; }
.erd-rel.ok-row { border-color: var(--good); } .erd-rel.warn-row { border-color: var(--warn); } .erd-rel.err-row { border-color: var(--bad); }
.erd-sentence td { font-size: 0.78rem; color: var(--muted); padding-top: 0 !important; border-bottom: 1px solid var(--border); }
.erd-rel-main td { border-bottom: none !important; }
.erd-x { min-height: 30px !important; padding: 2px 8px !important; color: var(--bad); }
.erd-svgbox { position: relative; }
.erd-svg { display: block; }
.erd-svg text { font-family: var(--font); }
.erd-svg .empty { fill: var(--muted); font-size: 15px; }
.erd-svg .ent { cursor: pointer; }
.erd-svg .ent:focus { outline: none; }
.erd-svg .bd { fill: var(--surface); stroke-width: 1.6; stroke: var(--muted); }
.erd-svg .hd { fill: var(--muted); }
.erd-svg .t-master .bd { stroke: var(--e-master); } .erd-svg .t-master .hd { fill: var(--e-master); }
.erd-svg .t-trans .bd { stroke: var(--e-trans); } .erd-svg .t-trans .hd { fill: var(--e-trans); }
.erd-svg .t-link .bd { stroke: var(--e-link); } .erd-svg .t-link .hd { fill: var(--e-link); }
.erd-svg .t-code .bd { stroke: var(--e-code); } .erd-svg .t-code .hd { fill: var(--e-code); }
.erd-svg .hdt { fill: var(--surface); font-weight: 700; font-size: 13px; font-family: var(--mono); }
.erd-svg .disp { fill: var(--muted); font-size: 11px; }
.erd-svg .fn { fill: var(--text); font-size: 12px; font-family: var(--mono); }
.erd-svg .fn.req { font-weight: 600; }
.erd-svg .ft { fill: var(--muted); font-size: 11px; font-family: var(--mono); }
.erd-svg .ft.miss { fill: var(--bad); font-weight: 700; }
.erd-svg .kpk { fill: var(--gold); font-weight: 800; font-size: 10px; font-family: var(--mono); }
.erd-svg .kfk { fill: var(--primary); font-weight: 800; font-size: 10px; font-family: var(--mono); }
.erd-svg .kbad { fill: var(--bad); }
.erd-svg .ln { stroke: var(--muted); stroke-width: 1.6; fill: none; }
.erd-svg .mk { stroke: var(--muted); stroke-width: 1.6; fill: none; }
.erd-svg .mo { fill: var(--surface-2); }
.erd-svg .mq { fill: var(--bad); font-weight: 800; font-size: 13px; }
.erd-svg .rl { fill: var(--text); font-size: 11px; paint-order: stroke; stroke: var(--surface-2); stroke-width: 4px; stroke-linejoin: round; }
.erd-svg .ent.sel .bd { stroke: var(--primary); stroke-width: 3; stroke-dasharray: 6 3; }
.erd-svg .ent:focus-visible .bd { stroke: var(--primary); stroke-width: 3.5; }
.erd-svg .st-good .bd { stroke: var(--good); stroke-width: 3; }
.erd-svg .st-warn .bd { stroke: var(--warn); stroke-width: 3; }
.erd-svg .st-bad .bd { stroke: var(--bad); stroke-width: 3.5; }
.erd-svg .rel.st-good .ln, .erd-svg .rel.st-good .mk { stroke: var(--good); stroke-width: 2.4; }
.erd-svg .rel.st-warn .ln, .erd-svg .rel.st-warn .mk { stroke: var(--warn); stroke-width: 2.4; }
.erd-svg .rel.st-bad .ln, .erd-svg .rel.st-bad .mk { stroke: var(--bad); stroke-width: 2.6; }
.erd-svg .rel.st-bad .ln { stroke-dasharray: 6 4; }
.erd-svg .frow.st-good { fill: var(--good-soft); } .erd-svg .frow.st-warn { fill: var(--warn-soft); } .erd-svg .frow.st-bad { fill: var(--bad-soft); }
.erd-svg .stb { stroke: var(--surface); stroke-width: 2; }
.erd-svg .st-good .stb { fill: var(--good); } .erd-svg .st-warn .stb { fill: var(--warn); } .erd-svg .st-bad .stb { fill: var(--bad); }
.erd-svg .sts { fill: var(--surface); font-size: 11px; font-weight: 800; }
.erd-cardicon .ln, .erd-cardicon .mk { stroke: var(--text); stroke-width: 1.6; fill: none; }
.erd-cardicon .mo { fill: var(--surface); }
.erd-cardicon .cbx { fill: var(--surface-2); stroke: var(--text); stroke-width: 1.4; }
.erd-legend { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 0.8rem; color: var(--muted); margin-top: 8px; align-items: center; }
.erd-legend i { width: 12px; height: 12px; border-radius: 3px; display: inline-block; vertical-align: -1px; margin-inline-end: 4px; }
.erd-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 6px 14px; }
.erd-cards div { display: flex; align-items: center; gap: 8px; font-size: 0.9rem; }
.erd-doc { display: grid; gap: 10px; }
.erd-doc dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 6px 14px; margin: 0; }
.erd-doc dt { font-size: 0.8rem; color: var(--muted); } .erd-doc dd { margin: 0; font-weight: 600; }
.erd-doc table.tbl td, .erd-doc table.tbl th { font-size: 0.84rem; }
.erd-toolbar { position: sticky; top: 56px; z-index: 5; }
.erd-status { font-size: 0.86rem; }
.fb-list li.info { border-color: var(--primary); }
.fb-list li { display: flex; gap: 8px; align-items: flex-start; }
.fb-list li .sym { font-weight: 800; flex: none; width: 1.1em; text-align: center; }
.fb-list li.good .sym { color: var(--good); } .fb-list li.warn .sym { color: var(--warn); } .fb-list li.bad .sym { color: var(--bad); } .fb-list li.info .sym { color: var(--primary); }
.fb-list li button.fb-go { all: unset; cursor: pointer; flex: 1; }
.fb-list li button.fb-go:focus-visible { outline: 3px solid var(--primary); outline-offset: 2px; border-radius: 4px; }
.erd-bars { display: grid; gap: 6px; margin: 10px 0; }
.erd-bars > div { display: grid; grid-template-columns: 150px 1fr 70px; gap: 8px; align-items: center; font-size: 0.88rem; }
.erd-hints ol { margin: 0; padding-inline-start: 20px; }
.modal.erd-wide { max-width: min(1100px, 96vw); }
.erd-export pre { max-height: 50vh; white-space: pre; }
`;
  function injectCSS() {
    if (document.getElementById('erd-css')) return;
    const st = document.createElement('style');
    st.id = 'erd-css';
    st.textContent = ERD_CSS;
    document.head.appendChild(st);
  }

  // ---------------------------------------------------------------- shared UI bits
  function drafts() {
    if (!SL.state.erdDrafts) SL.state.erdDrafts = {};
    return SL.state.erdDrafts;
  }
  function getDraft(ex) {
    const all = drafts();
    if (!all[ex.id] || !all[ex.id].model) all[ex.id] = { model: freshModel(ex), notes: '', aliases: {}, descs: {}, hints: 0 };
    const d = all[ex.id];
    d.aliases = d.aliases || {};
    d.descs = d.descs || {};
    d.hints = d.hints || 0;
    return d;
  }
  const freshModel = (ex) => (ex.start ? buildModel(ex.start) : { entities: [], rels: [] });
  const levelHe = (l) => (l === 'logical' ? 'רמה לוגית' : 'רמה מושגית');

  function docView(doc) {
    if (!doc) return null;
    return h(
      'div',
      { class: 'erd-doc' },
      h('h3', { style: { margin: 0 } }, doc.title),
      doc.header ? h('dl', null, doc.header.map(([k, v]) => h('div', null, h('dt', null, k), h('dd', { dir: 'auto' }, v)))) : null,
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          { class: 'tbl' },
          h('thead', null, h('tr', null, doc.columns.map((c) => h('th', doc.ltrHead ? { dir: 'ltr', style: { textAlign: 'left' } } : null, doc.ltrHead ? SL.code(c) : c)))),
          h('tbody', null, doc.rows.map((r) => h('tr', null, r.map((c) => h('td', { dir: 'auto' }, c)))))
        )
      ),
      doc.note ? h('p', { class: 'small muted' }, doc.note) : null
    );
  }
  function legend() {
    return h(
      'div',
      { class: 'erd-legend' },
      ETYPES.map((t) => h('span', null, h('i', { style: { background: `var(--e-${t.v})` } }), t.he)),
      h('span', null, 'PK מפתח ראשי · FK מפתח זר'),
      h('span', null, 'ירוק נכון · כתום חלקי · אדום חסר או שגוי')
    );
  }
  function svgNode(markup) {
    const d = h('div', { class: 'erd-svgbox' });
    d.innerHTML = markup;
    return d;
  }

  // ---------------------------------------------------------------- list screen
  function labCount() {
    const done = EXERCISES.filter((e) => (SL.labState(e.id).best || 0) >= PASS).length;
    return done + '/' + EXERCISES.length;
  }
  SL.registerLab({
    id: 'erd',
    icon: '🧩',
    title: 'מעבדת ERD',
    desc: 'בונים ומתקנים מודלי נתונים בטבלה, רואים תרשים חי, ומקבלים ציון ומשוב מול פתרון ייחוס.',
    route: '/lab/erd',
    skills: ['entities', 'relationships', 'keys', 'fieldTypes'],
    count: labCount,
  });

  SL.route('/lab/erd', (el) => {
    injectCSS();
    el.append(
      h('p', { class: 'small' }, h('a', { href: '#/labs' }, 'מעבדות'), ' / מעבדת ERD'),
      h('h1', null, '🧩 מעבדת ERD'),
      h(
        'div',
        { class: 'card' },
        h('p', null, 'בונים את המודל בטבלאות: ישויות, שדות וקשרים. התרשים מתעדכן מיד עם כל שינוי. בהגשה המערכת מריצה בדיקה מבנית, מתאימה את הישויות לפתרון הייחוס לפי משמעות ולא רק לפי שם, ומחזירה ציון ומשוב שמסומן על התרשים.'),
        h('p', { class: 'muted small' }, 'בניסיון הראשון והשני המשוב מכוון: מצביע על האזור ושואל שאלה. מהניסיון השלישי המשוב מלא. הפתרון נפתח אחרי שתי הגשות.'),
        h('h3', null, 'סימון הקרדינליות'),
        h('p', { class: 'small muted' }, 'הסימן שליד ישות אומר כמה רשומות שלה מתאימות לרשומה אחת בצד השני.'),
        h('div', { class: 'erd-cards' }, CARDS.map((c) => h('div', null, h('span', { html: cardIcon(c.v) }), h('span', null, c.he, ' ', h('span', { class: 'muted', dir: 'ltr' }, '(' + c.sym + ')'))))),
        legend()
      ),
      h('h2', null, 'תרגילים'),
      h(
        'div',
        { class: 'ex-list' },
        EXERCISES.map((ex) => {
          const st = SL.labState(ex.id);
          const hasDraft = drafts()[ex.id] && drafts()[ex.id].model && drafts()[ex.id].model.entities.length && !ex.start;
          return h(
            'button',
            { class: 'ex-item', onclick: () => SL.go('/lab/erd/' + ex.id) },
            h('span', { style: { fontSize: '1.4rem' } }, ex.level === 'logical' ? (ex.start ? '🛠️' : '🏗️') : '🧮'),
            h(
              'span',
              { style: { flex: 1 } },
              h('b', null, ex.title),
              ' ',
              h('span', { class: 'tag' }, ex.kind),
              ' ',
              h('span', { class: 'tag primary' }, levelHe(ex.level)),
              h('div', { class: 'small muted' }, ex.short)
            ),
            st.best != null ? h('span', { class: 'tag ' + (st.best >= PASS ? 'good' : 'warn') }, 'הכי טוב: ' + st.best) : hasDraft ? h('span', { class: 'tag' }, 'טיוטה שמורה') : null,
            st.solutionViewed ? h('span', { class: 'tag' }, 'נצפה פתרון') : null
          );
        })
      )
    );
  });

  // ---------------------------------------------------------------- workspace
  SL.route('/lab/erd/:id', (el, params) => {
    const ex = exById(params.id);
    if (!ex) return SL.go('/lab/erd');
    injectCSS();
    const logical = ex.level === 'logical';
    const D = getDraft(ex);
    let selectedId = D.model.entities[0] ? D.model.entities[0].id : null;
    let undo = [];
    let redo = [];
    let lastSnap = JSON.stringify(D.model);
    let marks = { e: {}, f: {}, r: {} };
    let liveValidate = false;
    let lastValidation = null;
    let result = null; // {type:'blocked'|'graded', ...}
    let busy = false;
    let saveTimer = null;

    const M = () => D.model;
    const saveNow = () => {
      clearTimeout(saveTimer);
      SL.save();
    };
    const saveSoon = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(SL.save, 400);
    };
    function commit() {
      const s = JSON.stringify(M());
      if (s !== lastSnap) {
        undo.push(lastSnap);
        if (undo.length > 100) undo.shift();
        redo = [];
        lastSnap = s;
        updateUndoButtons();
      }
      saveNow();
    }
    function replaceModel(json) {
      D.model = JSON.parse(json);
      lastSnap = json;
      if (!M().entities.some((e) => e.id === selectedId)) selectedId = M().entities[0] ? M().entities[0].id : null;
      renderEditor();
      touched();
      saveNow();
      updateUndoButtons();
    }
    function doUndo() {
      commit();
      if (!undo.length) return;
      redo.push(lastSnap);
      replaceModel(undo.pop());
    }
    function doRedo() {
      if (!redo.length) return;
      undo.push(lastSnap);
      replaceModel(redo.pop());
    }

    // --- layout skeleton
    const tb = {};
    const statusEl = h('div', { class: 'erd-status', 'aria-live': 'polite' });
    const diagramEl = h('div');
    const resultsEl = h('div', { id: 'erd-results', tabindex: '-1' });
    const hintsEl = h('div');
    const edEl = h('section', { class: 'erd-ed', 'aria-label': 'עורך טבלאי' });
    const split = h('div', { class: 'split erd-split' });
    const st0 = SL.labState(ex.id);

    el.append(
      h('p', { class: 'small' }, h('a', { href: '#/labs' }, 'מעבדות'), ' / ', h('a', { href: '#/lab/erd' }, 'מעבדת ERD'), ' / ', ex.title),
      h('h1', null, '🧩 ' + ex.title),
      h('div', { class: 'row', style: { marginBottom: '10px' } }, h('span', { class: 'tag' }, ex.kind), h('span', { class: 'tag primary' }, levelHe(ex.level)), st0.best != null ? h('span', { class: 'tag' }, 'הכי טוב: ' + st0.best + ' · ' + st0.attempts + ' הגשות') : null),
      h(
        'details',
        { class: 'card', open: !st0.attempts },
        h('summary', null, h('b', null, 'תיאור התרגיל')),
        ex.scenario.map((p) => h('p', null, p)),
        h('p', null, h('b', null, 'המשימה: '), ex.task),
        ex.doc ? docView(ex.doc) : null
      )
    );

    const btn = (label, onclick, cls, attrs) => h('button', Object.assign({ class: 'btn small ' + (cls || ''), onclick }, attrs || {}), label);
    tb.addEnt = btn('➕ ישות', addEntity);
    tb.addRel = btn('➕ קשר', addRel);
    tb.undo = btn('↶ בטל', doUndo, 'ghost', { title: 'Ctrl+Z', 'aria-keyshortcuts': 'Control+Z' });
    tb.redo = btn('↷ חזור', doRedo, 'ghost', { title: 'Ctrl+Y', 'aria-keyshortcuts': 'Control+Y' });
    tb.check = btn('בדיקה מבנית', () => runValidation(true), 'ghost');
    tb.hint = btn('', showHint, 'ghost');
    tb.exp = btn('ייצוא', exportModal, 'ghost');
    tb.sol = btn('הצג פתרון', viewSolution, 'ghost');
    tb.reset = btn('התחל מחדש', resetModel, 'ghost');
    tb.wide = btn('', toggleWide, 'ghost');
    tb.submit = btn('הגש לבדיקה', submit, 'primary');
    const toolbar = h('div', { class: 'card erd-toolbar row', role: 'toolbar', 'aria-label': 'פעולות' }, tb.addEnt, tb.addRel, tb.undo, tb.redo, h('span', { class: 'spacer' }), tb.check, tb.hint, tb.wide, tb.exp, tb.sol, tb.reset, tb.submit);
    el.append(toolbar, hintsEl, split);
    split.append(edEl, h('section', { 'aria-label': 'תרשים ומשוב' }, h('div', { class: 'card' }, h('div', { class: 'row between' }, h('h2', { style: { margin: 0, fontSize: '1.05rem' } }, 'תרשים'), statusEl), h('div', { style: { marginTop: '8px' } }, diagramEl), legend()), resultsEl));

    function updateUndoButtons() {
      tb.undo.disabled = !undo.length && JSON.stringify(M()) === lastSnap;
      tb.redo.disabled = !redo.length;
    }
    function updateHintBtn() {
      tb.hint.textContent = '💡 רמז (' + D.hints + '/' + ex.hints.length + ')';
      tb.hint.disabled = D.hints >= ex.hints.length;
    }
    let wide = false;
    function toggleWide() {
      wide = !wide;
      split.classList.toggle('wide', wide);
      tb.wide.textContent = wide ? 'תצוגה צד לצד' : 'תרשים רחב';
    }
    toggleWide();
    toggleWide();

    function renderHints() {
      hintsEl.innerHTML = '';
      updateHintBtn();
      if (!D.hints) return;
      const names = ['כיוון כללי', 'אזור בעייתי', 'רמז ממוקד'];
      hintsEl.append(h('div', { class: 'card erd-hints', style: { marginTop: '12px' } }, h('h3', { style: { marginTop: 0 } }, '💡 רמזים'), h('ol', null, ex.hints.slice(0, D.hints).map((t, i) => h('li', null, h('b', null, names[i] + ': '), t)))));
    }
    function showHint() {
      if (D.hints < ex.hints.length) D.hints++;
      saveNow();
      renderHints();
    }

    // --- mutations
    function uniqueName(base) {
      let i = 1;
      while (entByName(M(), base + i)) i++;
      return base + i;
    }
    function addEntity() {
      const e = { id: uid('e'), name: uniqueName('Entity'), display: '', type: '', desc: '', fields: [] };
      if (logical) e.fields.push({ id: uid('f'), name: e.name + 'ID', type: 'INTEGER', len: '', required: true, pk: true, ref: '' });
      M().entities.push(e);
      selectedId = e.id;
      commit();
      renderEditor();
      touched();
      focusKey('e:' + e.id + ':name', true);
    }
    function deleteEntity(e) {
      const m = M();
      m.entities = m.entities.filter((x) => x.id !== e.id);
      m.rels = m.rels.filter((r) => r.from !== e.id && r.to !== e.id);
      let cleared = 0;
      m.entities.forEach((x) => x.fields.forEach((f) => {
        if (f.ref && f.ref.split('.')[0].toLowerCase() === (e.name || '').toLowerCase()) {
          f.ref = '';
          cleared++;
        }
      }));
      delete D.aliases[e.id];
      delete D.descs[e.id];
      if (selectedId === e.id) selectedId = m.entities[0] ? m.entities[0].id : null;
      commit();
      renderEditor();
      touched();
      SL.toast('הישות ' + (e.name || '') + ' נמחקה' + (cleared ? ', ונוקו ' + cleared + ' מפתחות זרים שהפנו אליה' : '') + ' (Ctrl+Z לביטול)');
    }
    function addField() {
      const e = M().entities.find((x) => x.id === selectedId);
      if (!e) return;
      const f = { id: uid('f'), name: '', type: '', len: '', required: false, pk: false, ref: '' };
      e.fields.push(f);
      commit();
      renderEditor();
      touched();
      focusKey('f:' + f.id + ':name', true);
    }
    function deleteField(e, f) {
      e.fields = e.fields.filter((x) => x.id !== f.id);
      const full = (e.name + '.' + f.name).toLowerCase();
      M().entities.forEach((x) => x.fields.forEach((y) => {
        if (y.ref && y.ref.toLowerCase() === full) y.ref = '';
      }));
      commit();
      renderEditor();
      touched();
    }
    function addRel(from, to) {
      const ents = M().entities;
      if (!ents.length) return SL.toast('הוסיפו קודם ישויות');
      const r = { id: uid('r'), from: typeof from === 'string' ? from : '', to: typeof to === 'string' ? to : '', fromCard: '', toCard: '', name: '' };
      M().rels.push(r);
      commit();
      renderEditor();
      touched();
      if (typeof from !== 'string') focusKey('r:' + r.id + ':from', true);
      return r;
    }
    function renameEntity(e, name) {
      const old = e.name;
      if (old && old !== name)
        M().entities.forEach((x) => x.fields.forEach((f) => {
          if (f.ref && f.ref.startsWith(old + '.')) f.ref = name + f.ref.slice(old.length);
        }));
      e.name = name;
      delete D.aliases[e.id];
    }
    function renameField(e, f, name) {
      const old = e.name + '.' + f.name;
      if (f.name)
        M().entities.forEach((x) => x.fields.forEach((y) => {
          if (y.ref === old) y.ref = e.name + '.' + name;
        }));
      f.name = name;
    }
    function setRef(e, f, value) {
      f.ref = value;
      if (!value) return;
      const pe = entByName(M(), value.split('.')[0]);
      if (pe && pe.id !== e.id && !relBetween(M(), pe, e)) {
        addRel(pe.id, e.id);
        SL.toast(`נוסף קשר בין ${pe.name} ל-${e.name}. הגדירו לו קרדינליות`);
      }
    }
    function resetModel() {
      SL.confirm('להתחיל את התרגיל מחדש? המודל הנוכחי יימחק (אפשר לבטל עם Ctrl+Z).').then((ok) => {
        if (!ok) return;
        D.model = freshModel(ex);
        D.aliases = {};
        D.descs = {};
        selectedId = M().entities[0] ? M().entities[0].id : null;
        marks = { e: {}, f: {}, r: {} };
        result = null;
        liveValidate = false;
        commit();
        renderEditor();
        touched();
        renderResults();
      });
    }

    // --- editor rendering
    function focusKey(k, select) {
      const el2 = edEl.querySelector('[data-k="' + CSS.escape(k) + '"]');
      if (!el2) return;
      el2.focus({ preventScroll: false });
      if (select && el2.select) el2.select();
    }
    let rerenderTimer = null;
    function rerenderSoon() {
      clearTimeout(rerenderTimer);
      rerenderTimer = setTimeout(renderEditor, 0);
    }
    function textInput(key, value, onInput, o) {
      o = o || {};
      const i = h('input', { type: 'text', 'data-k': key, value: value || '', dir: o.ltr ? 'ltr' : 'auto', class: o.ltr ? 'tech' : null, 'aria-label': o.label, placeholder: o.ph || '', spellcheck: o.ltr ? 'false' : null, autocomplete: 'off' });
      i.addEventListener('input', () => {
        onInput(i.value);
        touched();
      });
      i.addEventListener('change', () => {
        commit();
        if (o.structural) rerenderSoon();
      });
      return i;
    }
    function selectInput(key, options, value, onChange, o) {
      o = o || {};
      const s = h('select', { 'data-k': key, 'aria-label': o.label, dir: o.ltr ? 'ltr' : null, class: o.ltr ? 'tech' : null, title: o.title || null }, options.map((op) => (op.group ? h('optgroup', { label: op.group }, op.items.map((x) => h('option', { value: x.v }, x.t))) : h('option', { value: op.v }, op.t))));
      s.value = value || '';
      s.addEventListener('change', () => {
        onChange(s.value);
        commit();
        touched();
        rerenderSoon();
      });
      return s;
    }
    function checkInput(key, checked, onChange, label) {
      const c = h('input', { type: 'checkbox', 'data-k': key, checked, 'aria-label': label });
      c.addEventListener('change', () => {
        onChange(c.checked);
        commit();
        touched();
        rerenderSoon();
      });
      return c;
    }
    const cardOptions = [{ v: '', t: '— בחרו —' }].concat(CARDS.map((c) => ({ v: c.v, t: c.he + ' (\u2066' + c.sym + '\u2069)' })));

    function setSelected(id) {
      if (selectedId === id) return;
      selectedId = id;
      edEl.querySelectorAll('tr[data-row^="e:"]').forEach((tr) => tr.classList.toggle('sel', tr.getAttribute('data-row') === 'e:' + id));
      const old = edEl.querySelector('#erd-detail');
      if (old) old.replaceWith(detailCard());
      applyRowMarks();
      renderDiagram();
    }

    function entitiesCard() {
      const ents = M().entities;
      const rows = ents.map((e) => {
        const tr = h(
          'tr',
          { 'data-row': 'e:' + e.id, class: e.id === selectedId ? 'sel' : null },
          h('td', null, textInput('e:' + e.id + ':name', e.name, (v) => renameEntity(e, v), { ltr: true, label: 'שם טכני של הישות', structural: true, ph: 'EntityName' })),
          h('td', null, textInput('e:' + e.id + ':display', e.display, (v) => (e.display = v), { label: 'שם תצוגה בעברית', ph: 'שם בעברית' })),
          h('td', null, selectInput('e:' + e.id + ':type', [{ v: '', t: '— סוג —' }].concat(ETYPES.map((t) => ({ v: t.v, t: t.he }))), e.type, (v) => (e.type = v), { label: 'סוג ישות' })),
          logical ? h('td', { class: 'c' }, h('button', { class: 'btn small ghost', 'data-k': 'e:' + e.id + ':fields', onclick: () => { setSelected(e.id); focusKey('detail:desc'); }, 'aria-label': 'שדות של ' + (e.name || 'ישות') }, String(e.fields.length))) : null,
          h('td', { class: 'c' }, h('button', { class: 'btn small ghost erd-x', 'data-k': 'e:' + e.id + ':del', onclick: () => deleteEntity(e), 'aria-label': 'מחק ישות ' + (e.name || ''), title: 'מחק' }, '✕'))
        );
        tr.addEventListener('focusin', () => setSelected(e.id));
        tr.addEventListener('click', (ev) => {
          if (!ev.target.closest('input,select,button')) setSelected(e.id);
        });
        return tr;
      });
      return h(
        'div',
        { class: 'card' },
        h('div', { class: 'row between' }, h('h2', null, 'ישויות'), h('button', { class: 'btn small', onclick: addEntity }, '➕ ישות')),
        ents.length
          ? h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, 'שם טכני'), h('th', null, 'שם תצוגה'), h('th', { style: { width: '108px' } }, 'סוג'), logical ? h('th', { style: { width: '50px' } }, 'שדות') : null, h('th', { style: { width: '40px' } }, h('span', { class: 'hidden' }, 'מחיקה')))), h('tbody', null, rows)))
          : h('p', { class: 'muted' }, 'אין עדיין ישויות. לחצו "➕ ישות" כדי להתחיל.')
      );
    }

    function refOptions() {
      const groups = M().entities.filter((e) => e.name && e.fields.some((f) => f.name)).map((e) => ({ group: e.name, items: e.fields.filter((f) => f.name).map((f) => ({ v: e.name + '.' + f.name, t: (f.pk ? '🔑 ' : '') + e.name + '.' + f.name })) }));
      return [{ v: '', t: '—' }].concat(groups);
    }

    function detailCard() {
      const e = M().entities.find((x) => x.id === selectedId);
      if (!e) return h('div', { id: 'erd-detail' });
      const refs = refOptions();
      const body = [
        h('div', { class: 'field' }, h('label', { for: 'erd-desc' }, 'תיאור הישות'), (() => {
          const i = textInput('detail:desc', e.desc, (v) => (e.desc = v), { label: 'תיאור הישות', ph: 'מה הישות מייצגת?' });
          i.id = 'erd-desc';
          return i;
        })()),
      ];
      if (logical) {
        const rows = e.fields.map((f) => {
          const opts = refs.slice();
          if (f.ref && !resolveRef(M(), f.ref).field) opts.push({ v: f.ref, t: f.ref + ' (לא קיים)' });
          return h(
            'tr',
            { 'data-row': 'f:' + f.id },
            h('td', null, textInput('f:' + f.id + ':name', f.name, (v) => renameField(e, f, v), { ltr: true, label: 'שם טכני של השדה', structural: true, ph: 'FieldName' })),
            h('td', null, selectInput('f:' + f.id + ':type', [{ v: '', t: '— סוג —' }].concat(TYPES.map((t) => ({ v: t, t }))), f.type, (v) => (f.type = v), { label: 'סוג נתון', ltr: true })),
            h('td', null, textInput('f:' + f.id + ':len', f.len, (v) => (f.len = v.replace(/[^\d]/g, '')), { ltr: true, label: f.type === 'DECIMAL' ? 'ספרות אחרי הנקודה' : 'אורך', ph: f.type === 'DECIMAL' ? '2' : f.type === 'TEXT' ? '50' : '' })),
            h('td', { class: 'c' }, checkInput('f:' + f.id + ':req', f.required, (v) => (f.required = v), 'חובה')),
            h('td', { class: 'c' }, checkInput('f:' + f.id + ':pk', f.pk, (v) => {
              f.pk = v;
              if (v) f.required = true;
            }, 'מפתח ראשי')),
            h('td', null, selectInput('f:' + f.id + ':ref', opts, f.ref, (v) => setRef(e, f, v), { label: 'מפנה אל (מפתח זר)', ltr: true })),
            h('td', { class: 'c' }, h('button', { class: 'btn small ghost erd-x', 'data-k': 'f:' + f.id + ':del', onclick: () => deleteField(e, f), 'aria-label': 'מחק שדה ' + (f.name || ''), title: 'מחק' }, '✕'))
          );
        });
        body.push(
          e.fields.length
            ? h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', { style: { width: '30%' } }, 'שם טכני'), h('th', { style: { width: '98px' } }, 'סוג נתון'), h('th', { style: { width: '52px' }, title: 'אורך טקסט, או ספרות אחרי הנקודה' }, 'אורך'), h('th', { style: { width: '42px' } }, 'חובה'), h('th', { style: { width: '34px' } }, 'PK'), h('th', null, 'מפנה אל'), h('th', { style: { width: '40px' } }, h('span', { class: 'hidden' }, 'מחיקה')))), h('tbody', null, rows)))
            : h('p', { class: 'muted small' }, 'אין שדות.'),
          h('div', { class: 'row', style: { marginTop: '8px' } }, h('button', { class: 'btn small', onclick: addField, 'data-k': 'detail:addfield' }, '➕ שדה'), h('span', { class: 'small muted' }, 'אורך: תווים בטקסט, ספרות אחרי הנקודה במספר עשרוני.'))
        );
      }
      return h('div', { class: 'card', id: 'erd-detail' }, h('h2', null, logical ? 'שדות של ' : 'פרטי ', SL.code(e.name || '?'), e.display ? ' · ' + e.display : ''), body);
    }

    function relsCard() {
      const ents = M().entities;
      const entOpts = [{ v: '', t: '— ישות —' }].concat(ents.map((e) => ({ v: e.id, t: e.name || '(ללא שם)' })));
      const byId = new Map(ents.map((e) => [e.id, e]));
      const rows = [];
      M().rels.forEach((r) => {
        const a = byId.get(r.from);
        const b = byId.get(r.to);
        rows.push(
          h(
            'div',
            { 'data-row': 'r:' + r.id, class: 'erd-rel' },
            h('span', { class: 'small muted' }, 'מישות'),
            h('span', { class: 'small muted' }, 'שם הקשר'),
            h('span', { class: 'small muted' }, 'לישות'),
            h('span'),
            selectInput('r:' + r.id + ':from', entOpts, r.from, (v) => (r.from = v), { label: 'מישות', ltr: true }),
            textInput('r:' + r.id + ':name', r.name, (v) => (r.name = v), { label: 'שם הקשר', ph: 'שם' }),
            selectInput('r:' + r.id + ':to', entOpts, r.to, (v) => (r.to = v), { label: 'לישות', ltr: true }),
            h('button', { class: 'btn small ghost erd-x', 'data-k': 'r:' + r.id + ':del', onclick: () => { M().rels = M().rels.filter((x) => x.id !== r.id); commit(); renderEditor(); touched(); }, 'aria-label': 'מחק קשר', title: 'מחק' }, '✕'),
            selectInput('r:' + r.id + ':fc', cardOptions, r.fromCard, (v) => (r.fromCard = v), { label: 'קרדינליות בצד ישות המקור', title: 'כמה רשומות של ישות המקור מתאימות לרשומה אחת של ישות היעד' }),
            h('span', { class: 'muted c', 'aria-hidden': 'true' }, '↔'),
            selectInput('r:' + r.id + ':tc', cardOptions, r.toCard, (v) => (r.toCard = v), { label: 'קרדינליות בצד ישות היעד', title: 'כמה רשומות של ישות היעד מתאימות לרשומה אחת של ישות המקור' }),
            h('span'),
            h('div', { class: 'erd-sent' }, a && b ? [`לכל `, SL.code(a.name), `: ${r.toCard ? cardHe(r.toCard) : '?'} `, SL.code(b.name), ` · לכל `, SL.code(b.name), `: ${r.fromCard ? cardHe(r.fromCard) : '?'} `, SL.code(a.name)] : 'בחרו ישות בשני הצדדים')
          )
        );
      });
      return h(
        'div',
        { class: 'card' },
        h('div', { class: 'row between' }, h('h2', null, 'קשרים'), h('button', { class: 'btn small', onclick: addRel }, '➕ קשר')),
        h('p', { class: 'small muted', style: { marginTop: 0 } }, 'הקרדינליות שליד כל ישות אומרת כמה רשומות שלה מתאימות לרשומה אחת בצד השני.'),
        rows.length
          ? h('div', { class: 'erd-rels' }, rows)
          : h('p', { class: 'muted small' }, 'אין עדיין קשרים.')
      );
    }

    function notesCard() {
      if (!ex.planted) return null;
      const ta = h('textarea', { 'data-k': 'notes', 'aria-label': 'הסבר התיקונים', placeholder: 'לכל שגיאה: מה מצאתם, מה תיקנתם ולמה' });
      ta.value = D.notes || '';
      ta.addEventListener('input', () => {
        D.notes = ta.value;
        saveSoon();
      });
      return h('div', { class: 'card' }, h('h2', null, 'מה תיקנתם ולמה?'), ta);
    }

    function renderEditor() {
      clearTimeout(rerenderTimer);
      const active = document.activeElement;
      const k = active && edEl.contains(active) ? active.getAttribute('data-k') : null;
      const caret = k && active.selectionStart != null && active.type === 'text' ? active.selectionStart : null;
      edEl.innerHTML = '';
      edEl.append(entitiesCard(), detailCard(), relsCard());
      const n = notesCard();
      if (n) edEl.append(n);
      applyRowMarks();
      if (k) {
        const t = edEl.querySelector('[data-k="' + CSS.escape(k) + '"]');
        if (t) {
          t.focus({ preventScroll: true });
          if (caret != null) {
            try {
              t.setSelectionRange(caret, caret);
            } catch (e) {}
          }
        }
      }
      updateUndoButtons();
    }

    function applyRowMarks() {
      const cls = { good: 'ok-row', warn: 'warn-row', bad: 'err-row' };
      edEl.querySelectorAll('[data-row]').forEach((tr) => {
        const [kind, id] = tr.getAttribute('data-row').split(':');
        const st = (marks[kind] || {})[id];
        tr.classList.remove('ok-row', 'warn-row', 'err-row');
        if (st) tr.classList.add(cls[st]);
      });
    }

    // --- diagram & live status
    function renderDiagram() {
      diagramEl.innerHTML = diagramSVG(M(), { showFields: logical, marks, selected: selectedId, label: 'תרשים ERD של ' + ex.title });
    }
    diagramEl.addEventListener('click', (ev) => {
      const g = ev.target.closest('[data-ent]');
      if (!g) return;
      const id = g.getAttribute('data-ent');
      setSelected(id);
      const row = edEl.querySelector('tr[data-row="e:' + id + '"]');
      if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    diagramEl.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      const g = ev.target.closest('[data-ent]');
      if (!g) return;
      ev.preventDefault();
      setSelected(g.getAttribute('data-ent'));
      focusKey('e:' + g.getAttribute('data-ent') + ':name');
    });

    function updateStatus() {
      const v = validate(M(), ex.level);
      lastValidation = v;
      statusEl.innerHTML = '';
      statusEl.append(
        v.errors.length ? h('span', { class: 'tag bad' }, v.errors.length + ' שגיאות חוסמות') : h('span', { class: 'tag good' }, '✓ מבנה תקין'),
        ' ',
        v.warnings.length ? h('span', { class: 'tag warn' }, v.warnings.length + ' אזהרות') : ''
      );
      return v;
    }
    function validationMarks(v) {
      const m = { e: {}, f: {}, r: {} };
      v.warnings.forEach((x) => (m[x.target.kind[0]][x.target.id] = 'warn'));
      v.errors.forEach((x) => (m[x.target.kind[0]][x.target.id] = 'bad'));
      return m;
    }
    function touched() {
      const v = updateStatus();
      if (liveValidate) {
        marks = validationMarks(v);
        if (result && result.type === 'blocked') {
          result.v = v;
          renderResults();
        }
      }
      renderDiagram();
      applyRowMarks();
      saveSoon();
      updateUndoButtons();
    }
    function runValidation(show) {
      const v = updateStatus();
      liveValidate = true;
      marks = validationMarks(v);
      result = { type: 'blocked', v, manual: !!show };
      renderDiagram();
      applyRowMarks();
      renderResults();
      if (show) resultsEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return v;
    }

    // --- results
    function focusTarget(t) {
      if (!t) return;
      if (t.kind === 'entity') {
        setSelected(t.id);
        focusKey('e:' + t.id + ':name');
      } else if (t.kind === 'field') {
        const e = M().entities.find((x) => x.fields.some((f) => f.id === t.id));
        if (e) {
          setSelected(e.id);
          focusKey('f:' + t.id + ':name');
        }
      } else if (t.kind === 'rel') focusKey('r:' + t.id + ':from');
    }
    const SYM = { good: '✓', warn: '!', bad: '✗', info: '?' };
    function fbList(items) {
      return h(
        'ul',
        { class: 'fb-list' },
        items.map((it) =>
          h(
            'li',
            { class: it.sev },
            h('span', { class: 'sym', 'aria-hidden': 'true' }, SYM[it.sev]),
            h('button', { class: 'fb-go', onclick: () => focusTarget(it.target), title: 'עבור לאלמנט' }, h('span', { class: 'hidden' }, { good: 'נכון: ', warn: 'חלקי: ', bad: 'חסר או שגוי: ', info: 'לא זוהה: ' }[it.sev]), it.text),
            it.skill ? h('span', { class: 'tag' }, SL.skillName(it.skill)) : null
          )
        )
      );
    }
    function renderResults() {
      resultsEl.innerHTML = '';
      if (!result) return;
      if (result.type === 'blocked') {
        const v = result.v;
        const blocked = v.errors.length > 0;
        resultsEl.append(
          h(
            'div',
            { class: 'card', style: { marginTop: '12px' } },
            h('h2', { style: { marginTop: 0 } }, 'בדיקה מבנית'),
            h('div', { class: 'notice ' + (blocked ? 'bad' : 'good') }, blocked ? (result.manual ? `נמצאו ${v.errors.length} שגיאות חוסמות. תקנו אותן לפני ההגשה.` : `ההגשה נחסמה: ${v.errors.length} שגיאות חוסמות. האלמנטים מסומנים באדום בטבלה ובתרשים.`) : 'אין שגיאות חוסמות. אפשר להגיש.'),
            v.errors.length || v.warnings.length ? h('div', { style: { marginTop: '10px' } }, fbList(v.errors.map((x) => ({ sev: 'bad', text: x.msg, target: x.target })).concat(v.warnings.map((x) => ({ sev: 'warn', text: 'אזהרה: ' + x.msg, target: x.target }))))) : null
          )
        );
        return;
      }
      const g = result.g;
      const st = SL.labState(ex.id);
      const cls = g.score >= 85 ? 'good' : g.score >= 60 ? 'warn' : 'bad';
      const card = h(
        'div',
        { class: 'card', style: { marginTop: '12px' } },
        h('div', { class: 'row between' }, h('h2', { style: { margin: 0 } }, 'תוצאה · ניסיון ' + result.attempt), h('span', { class: 'tag ' + (g.detailed ? 'primary' : '') }, g.detailed ? 'משוב מלא' : 'משוב מכוון')),
        h('div', { class: 'row' }, h('span', { class: 'score-big ' + cls }, g.score), h('span', { class: 'muted' }, '/ 100', ex.solutions.length > 1 ? ' · נבדק מול ' + ex.solutions.length + ' פתרונות, הקרוב ביותר: ' + g.solutionLabel : '')),
        h(
          'div',
          { class: 'erd-bars' },
          Object.keys(g.weights).map((k) => {
            const pct = Math.round((g.parts[k] || 0) * 100);
            return h('div', null, h('span', null, PART_HE[k], h('span', { class: 'muted small' }, ' (' + g.weights[k] + '%)')), h('div', { class: 'progress' + (pct >= 85 ? ' good' : '') }, h('div', { style: { width: pct + '%' } })), h('span', { class: 'small' }, pct + '%'));
          })
        ),
        g.planted ? h('p', null, h('b', null, `תוקנו ${g.planted.total - g.planted.remaining.length} מתוך ${g.planted.total} השגיאות השתולות.`)) : null,
        g.score >= 85 ? h('div', { class: 'notice good' }, '🧩 מצוין! ציון 85 ומעלה מזכה בתג "ארכיטקט נתונים".') : null,
        !g.detailed ? h('p', { class: 'small muted' }, 'בניסיון הראשון והשני המשוב מצביע על האזור ושואל שאלה. מהניסיון השלישי תקבלו הסבר מלא.') : null,
        g.summary.length ? h('div', { class: 'notice warn', style: { marginTop: '8px' } }, g.summary.join(' ')) : null,
        h('h3', null, 'משוב'),
        g.feedback.some((f) => f.sev !== 'good') ? fbList(g.feedback.filter((f) => f.sev !== 'good')) : h('p', { class: 'muted' }, 'אין הערות לתיקון.'),
        g.feedback.some((f) => f.sev === 'good') ? h('details', { style: { marginTop: '10px' }, open: !g.feedback.some((f) => f.sev !== 'good') ? null : null }, h('summary', null, '✓ מה נכון (' + g.feedback.filter((f) => f.sev === 'good').length + ')'), h('div', { style: { marginTop: '8px' } }, fbList(g.feedback.filter((f) => f.sev === 'good')))) : null,
        st.solutionViewed ? altSuggestion() : null
      );
      resultsEl.append(card);
    }
    function altSuggestion() {
      const alt = EXERCISES.find((x) => x.id !== ex.id && !SL.labState(x.id).solutionViewed && (SL.labState(x.id).best || 0) < PASS);
      if (!alt) return null;
      return h('div', { class: 'notice', style: { marginTop: '10px' } }, 'צפיתם בפתרון, ולכן התרגיל לא נספר בתנאי המעבר. תרגיל חלופי באותה מיומנות: ', h('a', { href: '#/lab/erd/' + alt.id }, alt.title));
    }

    // --- submit (spec §6.3 submission flow)
    async function aiMatch(ids) {
      const refs = [];
      const seen = new Set();
      ex.solutions.forEach((s) => prepSolution(s).entities.forEach((e) => {
        if (!seen.has(e.n)) {
          seen.add(e.n);
          refs.push({ name: e.n, hebrew: e.he, meaning: e.why });
        }
      }));
      const byId = new Map(M().entities.map((e) => [e.id, e]));
      const subs = ids.map((id) => {
        const e = byId.get(id);
        const related = M().rels.filter((r) => r.from === id || r.to === id).map((r) => (byId.get(r.from === id ? r.to : r.from) || {}).name).filter(Boolean);
        return { id, name: e.name, display: e.display, description: [e.desc, D.descs[id]].filter(Boolean).join(' | '), fields: e.fields.map((f) => f.name), related };
      });
      const schema = {
        type: 'object',
        properties: {
          matches: {
            type: 'array',
            items: {
              type: 'object',
              properties: { submitted_id: { type: 'string' }, reference: { type: 'string' }, confidence: { type: 'number' } },
              required: ['submitted_id', 'reference', 'confidence'],
              additionalProperties: false,
            },
          },
        },
        required: ['matches'],
        additionalProperties: false,
      };
      const res = await SL.ai.call({
        system: 'You compare entities in a learner\'s ERD with the reference entities of an exercise and match them by meaning (what real-world thing they represent), not by spelling. Each reference entity may be used at most once. Use an empty string as reference when nothing fits. confidence is 0..1.',
        prompt: 'Exercise scenario (Hebrew):\n' + ex.scenario.join('\n') + '\n\nReference entities:\n' + JSON.stringify(refs) + '\n\nLearner entities to match:\n' + JSON.stringify(subs),
        schema,
        maxTokens: 2000,
      });
      const out = {};
      (res.matches || []).forEach((m) => {
        if (m.reference && m.confidence >= AI_THRESHOLD && seen.has(m.reference) && ids.includes(m.submitted_id)) out[m.submitted_id] = m.reference;
      });
      return out;
    }
    async function askDescriptions(ids) {
      const byId = new Map(M().entities.map((e) => [e.id, e]));
      const areas = {};
      const content = h(
        'div',
        null,
        h('p', null, 'לא זיהינו מה הישויות האלה מייצגות. הן לא ייספרו כשגויות. תארו במשפט מה כל אחת מייצגת, ונבדוק שוב את ההתאמה לפתרון.'),
        ids.map((id) => {
          const e = byId.get(id);
          const ta = h('textarea', { rows: '2', 'aria-label': 'מה הישות ' + e.name + ' מייצגת' });
          ta.value = D.descs[id] || e.desc || '';
          areas[id] = ta;
          return h('div', { class: 'field' }, h('label', null, SL.code(e.name || '?'), e.display ? ' · ' + e.display : ''), ta);
        })
      );
      const ok = await SL.modal('מה הישות מייצגת?', content, [
        { label: 'דלג', value: false },
        { label: 'בדוק התאמה', value: true, primary: true },
      ]);
      if (!ok) return false;
      ids.forEach((id) => (D.descs[id] = areas[id].value.trim()));
      saveNow();
      return true;
    }
    async function submit() {
      if (busy) return;
      commit();
      const v = runValidation(false);
      if (v.errors.length) {
        resultsEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        SL.toast('ההגשה נחסמה: יש שגיאות חוסמות');
        return;
      }
      if (!M().entities.length) return SL.toast('המודל ריק');
      busy = true;
      tb.submit.disabled = true;
      const orig = tb.submit.textContent;
      tb.submit.textContent = 'בודק...';
      try {
        const st = SL.labState(ex.id);
        const attempt = st.attempts + 1;
        const gopts = () => ({ attempt, solutionViewed: st.solutionViewed, aliases: D.aliases, descs: D.descs });
        let g = grade(M(), ex, gopts());
        const needs = () => g.unknown.length && g.missingRefs.length;
        if (needs() && SL.ai.enabled()) {
          tb.submit.textContent = 'מתאים ישויות...';
          try {
            Object.assign(D.aliases, await aiMatch(g.unknown));
            g = grade(M(), ex, gopts());
          } catch (e) {
            SL.toast('התאמה בבינה מלאכותית נכשלה: ' + e.message + '. ממשיכים עם בדיקת כללים.');
          }
        }
        if (needs()) {
          const ids = g.unknown.slice();
          if (await askDescriptions(ids)) {
            g = grade(M(), ex, gopts());
            const still = g.unknown.filter((id) => ids.includes(id));
            if (still.length && g.missingRefs.length && SL.ai.enabled()) {
              try {
                Object.assign(D.aliases, await aiMatch(still));
                g = grade(M(), ex, gopts());
              } catch (e) {
                SL.toast('התאמה בבינה מלאכותית נכשלה: ' + e.message);
              }
            }
          }
        }
        liveValidate = false;
        marks = g.marks;
        result = { type: 'graded', g, attempt };
        SL.labSubmit(ex.id, {
          score: g.score,
          skills: g.skills,
          feedback: g.feedback.map((f) => ({ sev: f.sev, skill: f.skill, text: f.text, target: f.target })),
        });
        if (g.score >= 85) SL.awardBadge('architect');
        saveNow();
        renderDiagram();
        applyRowMarks();
        renderResults();
        resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } finally {
        busy = false;
        tb.submit.disabled = false;
        tb.submit.textContent = orig;
      }
    }

    // --- solution (BR8) & export
    function modelTable(model) {
      const byId = new Map(model.entities.map((e) => [e.id, e]));
      return h(
        'div',
        { class: 'stack' },
        h(
          'div',
          { class: 'table-wrap' },
          h(
            'table',
            { class: 'tbl' },
            h('thead', null, h('tr', null, h('th', null, 'ישות'), h('th', null, 'סוג'), logical ? h('th', null, 'שדות') : null)),
            h('tbody', null, model.entities.map((e) => h('tr', null, h('td', null, SL.code(e.name), ' ', e.display), h('td', null, etypeHe(e.type)), logical ? h('td', { dir: 'ltr', style: { textAlign: 'left' } }, e.fields.map((f) => h('div', { class: 'small' }, h('code', null, f.name), ' ', typeStr(f), f.pk ? ' PK' : '', f.ref ? ' → ' + f.ref : ''))) : null)))
          )
        ),
        h(
          'div',
          { class: 'table-wrap' },
          h(
            'table',
            { class: 'tbl' },
            h('thead', null, h('tr', null, h('th', null, 'קשר'), h('th', null, 'קרדינליות'))),
            h('tbody', null, model.rels.map((r) => {
              const a = byId.get(r.from);
              const b = byId.get(r.to);
              return h('tr', null, h('td', null, SL.code(a.name), ' ↔ ', SL.code(b.name), r.name ? ' (' + r.name + ')' : ''), h('td', { class: 'small' }, 'לכל ', SL.code(a.name), ': ' + cardHe(r.toCard) + ' ', SL.code(b.name), ' · לכל ', SL.code(b.name), ': ' + cardHe(r.fromCard) + ' ', SL.code(a.name)));
            }))
          )
        )
      );
    }
    function widen() {
      const all = document.querySelectorAll('.modal');
      const m = all[all.length - 1];
      if (m) m.classList.add('erd-wide');
    }
    async function viewSolution() {
      const ok = await SL.labViewSolution(ex.id);
      if (!ok) return;
      const sols = ex.solutions.map((s) => buildModel(Object.assign({}, s, { entities: prepSolution(s).entities.map((e) => Object.assign({}, e, { t: [].concat(e.t)[0] })) })));
      const body = h('div');
      const tabs = h('div', { class: 'tabs', role: 'tablist' });
      const show = (i) => {
        tabs.querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-selected', String(i === j)));
        body.innerHTML = '';
        body.append(svgNode(diagramSVG(sols[i], { showFields: logical, label: 'פתרון ייחוס' })), h('div', { style: { marginTop: '10px' } }, modelTable(sols[i])));
      };
      ex.solutions.forEach((s, i) => tabs.append(h('button', { role: 'tab', onclick: () => show(i) }, s.label || 'פתרון ' + (i + 1))));
      const content = h('div', null, ex.solutions.length > 1 ? h('p', { class: 'small muted' }, 'לתרגיל יש כמה פתרונות תקינים. ההגשה נבדקת מול כולם והציון נקבע לפי הקרוב ביותר.') : null, ex.solutions.length > 1 ? tabs : null, body);
      show(0);
      const p = SL.modal('פתרון ייחוס: ' + ex.title, content, [{ label: 'סגור', value: true, primary: true }]);
      widen();
      await p;
      renderResults();
    }
    function exportModal() {
      const mer = toMermaid(M());
      const sql = toDDL(M());
      const pane = h('div', { class: 'erd-export' });
      const tabs = h('div', { class: 'tabs', role: 'tablist' });
      const show = (which) => {
        tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.w === which)));
        const text = which === 'mer' ? mer : sql;
        pane.innerHTML = '';
        pane.append(
          which === 'sql' && !logical ? h('p', { class: 'small muted' }, 'ברמה מושגית אין שדות, ולכן ה-DDL הוא שלד בלבד.') : null,
          h('pre', { dir: 'ltr' }, text),
          h('button', { class: 'btn small', onclick: () => SL.copyText(text) }, '📋 העתק ' + (which === 'mer' ? 'Mermaid' : 'SQL'))
        );
      };
      tabs.append(h('button', { role: 'tab', 'data-w': 'mer', onclick: () => show('mer') }, 'Mermaid'), h('button', { role: 'tab', 'data-w': 'sql', onclick: () => show('sql') }, 'SQL DDL'));
      show('mer');
      SL.modal('ייצוא המודל', h('div', null, tabs, pane), [{ label: 'סגור', value: true, primary: true }]);
      widen();
    }

    // --- keyboard (undo / redo)
    const onKey = (ev) => {
      if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return;
      if (document.querySelector('.modal-back')) return;
      if (ev.target && ev.target.tagName === 'TEXTAREA') return;
      const k = ev.key.toLowerCase();
      if (k === 'z' && !ev.shiftKey) {
        ev.preventDefault();
        doUndo();
      } else if (k === 'y' || (k === 'z' && ev.shiftKey)) {
        ev.preventDefault();
        doRedo();
      }
    };
    document.addEventListener('keydown', onKey);
    SL.cleanup = () => {
      document.removeEventListener('keydown', onKey);
      clearTimeout(rerenderTimer);
      clearTimeout(saveTimer);
      SL.save();
    };

    renderEditor();
    renderHints();
    touched();
    updateUndoButtons();
  });

  // ---------------------------------------------------------------- testing API
  SL.erd = {
    validate,
    grade,
    toMermaid,
    toDDL,
    exercises: EXERCISES,
    buildModel,
    plantedIssues,
    diagramSVG,
    /** Editable model of reference solution i of an exercise (for tests and the solution view). */
    solutionModel(exOrId, i) {
      const ex = resolveEx(exOrId);
      const s = ex.solutions[i || 0];
      return buildModel({ entities: prepSolution(s).entities.map((e) => Object.assign({}, e, { t: [].concat(e.t)[0] })), rels: s.rels });
    },
    startModel: (exOrId) => freshModel(resolveEx(exOrId)),
  };
})();
