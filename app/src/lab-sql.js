/* SpecQuest - SQL sandbox lab (spec §6.6, SpecLab BR 11-12).
   Exposes SL.SCENARIO_DB (scenario database shared by other modules) and SL.sqlLab. */
(function () {
  const h = SL.h;

  // =====================================================================
  // Scenario database: fictional Israeli distribution & retail company
  // "today" in the scenario is 2026-09-30, the current month is 2026-09.
  // =====================================================================
  const CURRENT_MONTH = '2026-09';
  const SCENARIO_TODAY = '2026-09-30';

  const TABLES = [
    {
      name: 'Supplier',
      desc: 'ספקים של חברת ההפצה',
      columns: [
        { name: 'SupplierID', type: 'INTEGER', desc: 'מזהה ספק (מפתח ראשי)', pk: true },
        { name: 'SupplierName', type: 'TEXT', desc: 'שם הספק' },
        { name: 'TaxID', type: 'TEXT', desc: 'מספר עוסק / ח"פ (9 ספרות, טקסט)' },
        { name: 'City', type: 'TEXT', desc: 'עיר' },
        { name: 'ContactPhone', type: 'TEXT', desc: 'טלפון איש קשר' },
        { name: 'PaymentTermsDays', type: 'INTEGER', desc: 'תנאי תשלום בימים (שוטף +)' },
        { name: 'IsActive', type: 'INTEGER', desc: '1 = ספק פעיל, 0 = לא פעיל' },
      ],
    },
    {
      name: 'Item',
      desc: 'קטלוג הפריטים',
      columns: [
        { name: 'ItemSKU', type: 'TEXT', desc: 'מק"ט, 6 ספרות עם אפסים מובילים (מפתח ראשי)', pk: true },
        { name: 'ItemName', type: 'TEXT', desc: 'שם הפריט' },
        { name: 'Barcode', type: 'TEXT', desc: 'ברקוד 13 ספרות (טקסט, יכול להתחיל ב-0)' },
        { name: 'Category', type: 'TEXT', desc: 'קטגוריה' },
        { name: 'UnitOfMeasure', type: 'TEXT', desc: 'יחידת מידה' },
        { name: 'UnitPrice', type: 'REAL', desc: 'מחיר מכירה לצרכן בש"ח' },
        { name: 'SupplierID', type: 'INTEGER', desc: 'ספק ברירת מחדל (Supplier)' },
        { name: 'IsActive', type: 'INTEGER', desc: '1 = פריט פעיל, 0 = הורד מהמכירה' },
      ],
    },
    {
      name: 'PurchaseOrder',
      desc: 'כותרות הזמנות רכש מספקים',
      columns: [
        { name: 'POID', type: 'INTEGER', desc: 'מזהה הזמנה (מפתח ראשי)', pk: true },
        { name: 'PONumber', type: 'TEXT', desc: 'מספר הזמנה עסקי, למשל PO-26-0001' },
        { name: 'SupplierID', type: 'INTEGER', desc: 'ספק (Supplier)' },
        { name: 'OrderDate', type: 'TEXT', desc: 'תאריך הזמנה (YYYY-MM-DD)' },
        { name: 'ExpectedDate', type: 'TEXT', desc: 'מועד אספקה צפוי (YYYY-MM-DD)' },
        { name: 'Status', type: 'TEXT', desc: 'OPEN / CLOSED / CANCELLED' },
      ],
    },
    {
      name: 'PurchaseOrderLine',
      desc: 'שורות הזמנות רכש',
      columns: [
        { name: 'POID', type: 'INTEGER', desc: 'הזמנה (PurchaseOrder), חלק מהמפתח', pk: true },
        { name: 'LineNo', type: 'INTEGER', desc: 'מספר שורה בהזמנה, חלק מהמפתח', pk: true },
        { name: 'ItemSKU', type: 'TEXT', desc: 'פריט (Item)' },
        { name: 'OrderedQty', type: 'INTEGER', desc: 'כמות שהוזמנה' },
        { name: 'UnitCost', type: 'REAL', desc: 'מחיר קנייה ליחידה' },
      ],
    },
    {
      name: 'GoodsReceipt',
      desc: 'קליטות סחורה במחסן (כותרת)',
      columns: [
        { name: 'ReceiptID', type: 'INTEGER', desc: 'מזהה קליטה (מפתח ראשי)', pk: true },
        { name: 'POID', type: 'INTEGER', desc: 'הזמנת הרכש שנקלטה' },
        { name: 'ReceiptDate', type: 'TEXT', desc: 'תאריך קליטה (YYYY-MM-DD)' },
        { name: 'Warehouse', type: 'TEXT', desc: 'מחסן קולט' },
      ],
    },
    {
      name: 'GoodsReceiptLine',
      desc: 'שורות קליטה. להזמנה אחת יכולות להיות כמה קליטות',
      columns: [
        { name: 'ReceiptID', type: 'INTEGER', desc: 'קליטה (GoodsReceipt), חלק מהמפתח', pk: true },
        { name: 'LineNo', type: 'INTEGER', desc: 'מספר שורה בקליטה, חלק מהמפתח', pk: true },
        { name: 'POID', type: 'INTEGER', desc: 'הזמנת הרכש' },
        { name: 'POLineNo', type: 'INTEGER', desc: 'שורת ההזמנה שנקלטה (PurchaseOrderLine.LineNo)' },
        { name: 'ItemSKU', type: 'TEXT', desc: 'פריט' },
        { name: 'ReceivedQty', type: 'INTEGER', desc: 'כמות שנקלטה בפועל' },
      ],
    },
    {
      name: 'Customer',
      desc: 'לקוחות עסקיים של חברת ההפצה',
      columns: [
        { name: 'CustomerID', type: 'INTEGER', desc: 'מזהה לקוח (מפתח ראשי)', pk: true },
        { name: 'CustomerName', type: 'TEXT', desc: 'שם הלקוח' },
        { name: 'City', type: 'TEXT', desc: 'עיר' },
        { name: 'CustomerType', type: 'TEXT', desc: 'קמעונאי / סיטונאי / מוסדי' },
        { name: 'CreditLimit', type: 'REAL', desc: 'מסגרת אשראי בש"ח' },
        { name: 'JoinDate', type: 'TEXT', desc: 'תאריך הצטרפות' },
      ],
    },
    {
      name: 'SalesOrder',
      desc: 'הזמנות לקוח (כותרת)',
      columns: [
        { name: 'SOID', type: 'INTEGER', desc: 'מזהה הזמנה (מפתח ראשי)', pk: true },
        { name: 'CustomerID', type: 'INTEGER', desc: 'לקוח (Customer)' },
        { name: 'OrderDate', type: 'TEXT', desc: 'תאריך הזמנה (YYYY-MM-DD)' },
        { name: 'DeliveryDate', type: 'TEXT', desc: 'תאריך אספקה מבוקש' },
        { name: 'Status', type: 'TEXT', desc: 'OPEN / SHIPPED / CANCELLED' },
      ],
    },
    {
      name: 'SalesOrderLine',
      desc: 'שורות הזמנות לקוח',
      columns: [
        { name: 'SOID', type: 'INTEGER', desc: 'הזמנה (SalesOrder), חלק מהמפתח', pk: true },
        { name: 'LineNo', type: 'INTEGER', desc: 'מספר שורה, חלק מהמפתח', pk: true },
        { name: 'ItemSKU', type: 'TEXT', desc: 'פריט (Item)' },
        { name: 'Qty', type: 'INTEGER', desc: 'כמות' },
        { name: 'UnitPrice', type: 'REAL', desc: 'מחיר ליחידה בהזמנה' },
        { name: 'DiscountPct', type: 'REAL', desc: 'אחוז הנחה בשורה' },
      ],
    },
    {
      name: 'Branch',
      desc: 'סניפי רשת הקמעונאות',
      columns: [
        { name: 'BranchID', type: 'INTEGER', desc: 'מזהה סניף (מפתח ראשי)', pk: true },
        { name: 'BranchName', type: 'TEXT', desc: 'שם הסניף' },
        { name: 'City', type: 'TEXT', desc: 'עיר' },
        { name: 'Region', type: 'TEXT', desc: 'אזור' },
        { name: 'OpenDate', type: 'TEXT', desc: 'תאריך פתיחה' },
      ],
    },
    {
      name: 'SalesTarget',
      desc: 'יעד מכירה חודשי לסניף',
      columns: [
        { name: 'BranchID', type: 'INTEGER', desc: 'סניף (Branch), חלק מהמפתח', pk: true },
        { name: 'TargetMonth', type: 'TEXT', desc: 'חודש היעד (YYYY-MM), חלק מהמפתח', pk: true },
        { name: 'TargetAmount', type: 'REAL', desc: 'יעד בש"ח' },
      ],
    },
    {
      name: 'DailySales',
      desc: 'מכירות יומיות לפי סניף ופריט (אוגוסט-ספטמבר 2026)',
      columns: [
        { name: 'SaleDate', type: 'TEXT', desc: 'תאריך (YYYY-MM-DD), חלק מהמפתח', pk: true },
        { name: 'BranchID', type: 'INTEGER', desc: 'סניף, חלק מהמפתח', pk: true },
        { name: 'ItemSKU', type: 'TEXT', desc: 'פריט, חלק מהמפתח', pk: true },
        { name: 'Qty', type: 'INTEGER', desc: 'כמות שנמכרה' },
        { name: 'Amount', type: 'REAL', desc: 'סכום בש"ח' },
      ],
    },
    {
      name: 'ImportedOrderFile',
      desc: 'קובץ CSV של הזמנות שנטען מלקוח (טבלת ביניים, בלי מפתח)',
      columns: [
        { name: 'FileName', type: 'TEXT', desc: 'שם הקובץ' },
        { name: 'RowNum', type: 'INTEGER', desc: 'מספר השורה בקובץ' },
        { name: 'ExternalOrderRef', type: 'TEXT', desc: 'מספר ההזמנה במערכת הלקוח' },
        { name: 'CustomerID', type: 'INTEGER', desc: 'לקוח' },
        { name: 'ItemSKU', type: 'TEXT', desc: 'מק"ט כפי שהגיע בקובץ' },
        { name: 'Qty', type: 'INTEGER', desc: 'כמות' },
        { name: 'OrderDate', type: 'TEXT', desc: 'תאריך הזמנה' },
      ],
    },
  ];

  // ---- master data ----
  const SUPPLIERS = [
    [1, 'שדות הגליל בע"מ', '514238765', 'קריית שמונה', '04-6901234', 60, 1],
    [2, 'מחלבות העמק', '513377120', 'עפולה', '04-6528800', 45, 1],
    [3, 'משקאות הנגב', '515012345', 'באר שבע', '08-6234500', 60, 1],
    [4, 'אורן ניקיון ותחזוקה', '512998431', 'חולון', '03-5011122', 90, 1],
    [5, 'מאפיית השרון', '516700219', 'נתניה', '09-8855001', 30, 1],
    [6, 'יבוא דלתא פלוס', '514450987', 'אשדוד', '08-8567700', 90, 1],
    [7, 'קפה כרמל', '513890456', 'חיפה', '04-8123456', 60, 1],
    [8, 'חטיפי הצפון', '515567234', 'כרמיאל', '04-9987766', 45, 1],
    [9, 'נייר ואריזה ירושלים', '512345671', 'ירושלים', '02-6789012', 60, 1],
    [10, 'פירות ים המלח', '516001234', 'ערד', '08-9950011', 30, 0],
  ];
  // [SKU, name, barcode, category, uom, price, supplier, active]
  const ITEMS = [
    ['000101', 'חלב 3% 1 ליטר', '7290000101015', 'מוצרי חלב', 'יחידה', 6.9, 2, 1],
    ['000102', 'גבינה לבנה 5% 250 גרם', '7290000102012', 'מוצרי חלב', 'יחידה', 5.5, 2, 1],
    ['000103', 'יוגורט טבעי 200 גרם', '7290000103019', 'מוצרי חלב', 'יחידה', 3.9, 2, 1],
    ['000104', 'חמאה 200 גרם', '7290000104016', 'מוצרי חלב', 'יחידה', 9.9, 2, 1],
    ['000105', 'גבינה צהובה פרוסה 200 גרם', '7290000105013', 'מוצרי חלב', 'יחידה', 14.9, 2, 1],
    ['000201', 'מים מינרליים 1.5 ליטר', '7290000201012', 'משקאות', 'יחידה', 3.5, 3, 1],
    ['000202', 'מיץ תפוזים 1 ליטר', '7290000202019', 'משקאות', 'יחידה', 11.9, 3, 1],
    ['000203', 'משקה קולה 1.5 ליטר', '7290000203016', 'משקאות', 'יחידה', 7.9, 3, 1],
    ['000204', 'סודה 1 ליטר', '7290000204013', 'משקאות', 'יחידה', 3.2, 3, 1],
    ['000301', 'נוזל כלים 750 מ"ל', '7290000301019', 'ניקיון', 'יחידה', 8.9, 4, 1],
    ['000302', 'אבקת כביסה 3 ק"ג', '7290000302016', 'ניקיון', 'יחידה', 39.9, 4, 1],
    ['000303', 'מרכך כביסה 2 ליטר', '7290000303013', 'ניקיון', 'יחידה', 17.9, 4, 1],
    ['000304', 'אקונומיקה 2 ליטר', '7290000304010', 'ניקיון', 'יחידה', 7.5, 4, 1],
    ['000401', 'לחם אחיד פרוס', '7290000401016', 'מאפים', 'יחידה', 7.2, 5, 1],
    ['000402', 'חלה מתוקה', '7290000402013', 'מאפים', 'יחידה', 12, 5, 1],
    ['000403', "פיתות (10 יח')", '7290000403010', 'מאפים', 'מארז', 9, 5, 1],
    ['000404', "לחמניות המבורגר (6 יח')", '7290000404017', 'מאפים', 'מארז', 11.5, 5, 1],
    ['000501', 'אורז פרסי 1 ק"ג', '0012345678905', 'יבשים', 'ק"ג', 10.9, 6, 1],
    ['000502', 'פסטה ספגטי 500 גרם', '7290000502010', 'יבשים', 'יחידה', 5.9, 1, 1],
    ['000503', 'שמן קנולה 1 ליטר', '0076543210982', 'יבשים', 'יחידה', 12.5, 6, 1],
    ['000504', 'קמח לבן 1 ק"ג', '7290000504014', 'יבשים', 'ק"ג', 4.9, 1, 1],
    ['000505', 'סוכר לבן 1 ק"ג', '7290000505011', 'יבשים', 'ק"ג', 4.5, 1, 1],
    ['000601', 'קפה טורקי 200 גרם', '7290000601010', 'קפה ותה', 'יחידה', 13.9, 7, 1],
    ['000602', 'קפה נמס 200 גרם', '0087654321096', 'קפה ותה', 'יחידה', 24.9, 6, 1],
    ['000603', 'תה ירוק (25 שקיקים)', '7290000603014', 'קפה ותה', 'מארז', 11.9, 7, 1],
    ['000701', 'חטיף בוטנים 80 גרם', '7290000701017', 'חטיפים', 'יחידה', 4.2, 8, 1],
    ['000702', 'חטיף תירס 60 גרם', '7290000702014', 'חטיפים', 'יחידה', 3.9, 8, 1],
    ['000703', 'בייגלה מלוח 200 גרם', '7290000703011', 'חטיפים', 'יחידה', 6.9, 8, 1],
    ['000801', 'נייר טואלט (32 גלילים)', '7290000801014', 'נייר וחד"פ', 'מארז', 44.9, 9, 1],
    ['000802', 'מגבות נייר (6 גלילים)', '7290000802011', 'נייר וחד"פ', 'מארז', 19.9, 9, 1],
    ['000803', "שקיות אשפה (50 יח')", '7290000803018', 'נייר וחד"פ', 'מארז', 12.9, 9, 1],
    ['000804', "מפיות (100 יח')", '7290000804015', 'נייר וחד"פ', 'מארז', 6.5, 9, 0],
  ];
  const CUSTOMERS = [
    [1001, 'מינימרקט השכונה', 'תל אביב', 'קמעונאי', 20000, '2023-02-01'],
    [1002, 'סופר כהן ובניו', 'חולון', 'קמעונאי', 50000, '2022-06-15'],
    [1003, 'מכולת אבו סאלח', 'נצרת', 'קמעונאי', 15000, '2024-01-10'],
    [1004, 'קייטרינג טעמים', 'ראשון לציון', 'מוסדי', 80000, '2021-09-01'],
    [1005, 'בית אבות נווה שלום', 'רמת גן', 'מוסדי', 60000, '2023-11-20'],
    [1006, 'רשת קפה בדרך', 'הרצליה', 'סיטונאי', 120000, '2020-03-05'],
    [1007, 'סופר הגבעה', 'מודיעין', 'קמעונאי', 40000, '2024-07-01'],
    [1008, 'מסעדת הנמל', 'יפו', 'מוסדי', 25000, '2025-02-14'],
    [1009, 'קיוסק הים', 'אשקלון', 'קמעונאי', 8000, '2025-05-01'],
    [1010, 'מרכולית הדר', 'כפר סבא', 'קמעונאי', 30000, '2022-12-12'],
    [1011, 'אולמות גן עדן', 'פתח תקווה', 'מוסדי', 90000, '2021-04-18'],
    [1012, 'סיטונאות המרכז', 'לוד', 'סיטונאי', 150000, '2019-08-30'],
    [1013, 'פיצוצית לילה', 'באר שבע', 'קמעונאי', 5000, '2026-08-20'],
    [1014, 'מעונות סטודנטים רחובות', 'רחובות', 'מוסדי', 35000, '2026-09-02'],
    [1015, 'חנות הטבע ירוק', 'זכרון יעקב', 'קמעונאי', 10000, '2026-09-18'],
  ];
  const BRANCHES = [
    [1, 'תל אביב - דיזנגוף', 'תל אביב', 'מרכז', '2018-05-01'],
    [2, 'חיפה - כרמל', 'חיפה', 'צפון', '2019-03-15'],
    [3, 'באר שבע - העיר העתיקה', 'באר שבע', 'דרום', '2020-10-01'],
    [4, 'ירושלים - תלפיות', 'ירושלים', 'ירושלים', '2021-06-20'],
    [5, 'נתניה - עיר ימים', 'נתניה', 'שרון', '2026-09-15'],
  ];
  const BRANCH_SIZE = { 1: 1.4, 2: 1.0, 3: 0.8, 4: 1.1, 5: 0.7 };
  // Branch 5 opened mid-September and has no target yet (LEFT JOIN case).
  const TARGETS = [
    [1, '2026-08', 28000], [2, '2026-08', 22000], [3, '2026-08', 18000], [4, '2026-08', 26000],
    [1, '2026-09', 24000], [2, '2026-09', 18500], [3, '2026-09', 16000], [4, '2026-09', 23000],
  ];
  // [POID, supplier, orderDate, expectedDate, status, receiptPlan]
  const POS = [
    [1, 2, '2026-07-02', '2026-07-09', 'CLOSED', 'full'],
    [2, 3, '2026-07-05', '2026-07-12', 'CLOSED', 'over'],
    [3, 5, '2026-07-08', '2026-07-10', 'CLOSED', 'full'],
    [4, 1, '2026-07-14', '2026-07-28', 'CLOSED', 'split'],
    [5, 8, '2026-07-20', '2026-07-30', 'CLOSED', 'full'],
    [6, 9, '2026-07-27', '2026-08-10', 'CLOSED', 'split'],
    [7, 5, '2026-08-03', '2026-08-05', 'CANCELLED', 'none'],
    [8, 7, '2026-08-06', '2026-08-20', 'CLOSED', 'over'],
    [9, 2, '2026-08-11', '2026-08-18', 'CLOSED', 'full'],
    [10, 5, '2026-08-17', '2026-08-19', 'CLOSED', 'split'],
    [11, 6, '2026-08-20', '2026-09-10', 'OPEN', 'partial'],
    [12, 4, '2026-08-24', '2026-09-07', 'OPEN', 'partial'],
    [13, 3, '2026-08-28', '2026-09-04', 'OPEN', 'split-partial'],
    [14, 6, '2026-09-01', '2026-09-22', 'OPEN', 'none'],
    [15, 4, '2026-09-03', '2026-09-17', 'OPEN', 'over-open'],
    [16, 2, '2026-09-07', '2026-09-14', 'OPEN', 'partial'],
    [17, 6, '2026-09-08', '2026-09-26', 'OPEN', 'partial'],
    [18, 3, '2026-09-10', '2026-09-17', 'OPEN', 'none'],
    [19, 7, '2026-09-14', '2026-09-28', 'OPEN', 'none'],
    [20, 4, '2026-09-15', '2026-09-29', 'OPEN', 'none'],
    [21, 6, '2026-09-17', '2026-10-08', 'OPEN', 'none'],
    [22, 9, '2026-09-21', '2026-10-05', 'OPEN', 'none'],
    [23, 3, '2026-09-23', '2026-09-30', 'OPEN', 'none'],
    [24, 4, '2026-09-25', '2026-10-09', 'OPEN', 'none'],
    [25, 6, '2026-09-28', '2026-10-19', 'OPEN', 'none'],
  ];
  const FILE = 'orders_2026-09-15.csv';
  // [RowNum, ExternalOrderRef, CustomerID, ItemSKU, Qty]
  const IMPORTED = [
    [1, 'EXT-7781', 1003, '000101', 40],
    [2, 'EXT-7781', 1003, '000102', 20],
    [3, 'EXT-7781', 1003, '000201', 60],
    [4, 'EXT-7782', 1005, '000302', 10],
    [5, 'EXT-7782', 1005, '000301', 24],
    [6, 'EXT-7783', 1008, '000601', 12],
    [7, 'EXT-7783', 1008, '000602', 6],
    [8, 'EXT-7784', 1002, '201', 48],
    [9, 'EXT-7784', 1002, '000203', 36],
    [10, 'EXT-7785', 1011, '000401', 30],
    [11, 'EXT-7785', 1011, '000402', 15],
    [12, 'EXT-7783', 1008, '000602', 6],
    [13, 'EXT-7786', 1006, '000999', 5],
    [14, 'EXT-7786', 1006, '000801', 10],
    [15, 'EXT-7787', 1009, '0702', 25],
    [16, 'EXT-7781', 1003, '000101', 40],
    [17, 'EXT-7788', 1004, '000502', 50],
    [18, 'EXT-7788', 1004, '000503', 20],
    [19, 'EXT-7785', 1011, '000401', 35],
  ];

  function buildSeed() {
    let s = 12345;
    const rnd = () => {
      // mulberry32 - deterministic data
      s |= 0;
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const r2 = (x) => Math.round(x * 100) / 100;
    const addDays = (iso, n) => {
      const d = new Date(iso + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    };
    const lit = (v) => (v == null ? 'NULL' : typeof v === 'number' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'");
    const out = [];
    TABLES.forEach((t) => {
      const pk = t.columns.filter((c) => c.pk).map((c) => c.name);
      const defs = t.columns.map((c) => c.name + ' ' + c.type);
      if (pk.length) defs.push('PRIMARY KEY (' + pk.join(', ') + ')');
      out.push('CREATE TABLE ' + t.name + ' (' + defs.join(', ') + ');');
    });
    const ins = (table, rows) => {
      const cols = TABLES.find((t) => t.name === table).columns.map((c) => c.name);
      for (let i = 0; i < rows.length; i += 250)
        out.push('INSERT INTO ' + table + ' (' + cols.join(', ') + ') VALUES\n' + rows.slice(i, i + 250).map((r) => '(' + r.map(lit).join(', ') + ')').join(',\n') + ';');
    };
    ins('Supplier', SUPPLIERS);
    ins('Item', ITEMS);
    ins('Customer', CUSTOMERS);
    ins('Branch', BRANCHES);
    ins('SalesTarget', TARGETS);
    ins('ImportedOrderFile', IMPORTED.map((r) => [FILE, r[0], r[1], r[2], r[3], r[4], '2026-09-15']));

    // purchasing & receiving
    const catalog = (sup) => ITEMS.filter((i) => i.length && i[6] === sup && i[7] === 1);
    const po = [], pol = [], gr = [], grl = [];
    let rid = 9001;
    POS.forEach(([id, sup, od, ed, st, plan]) => {
      po.push([id, 'PO-26-' + String(id).padStart(4, '0'), sup, od, ed, st]);
      const cat = catalog(sup);
      const n = Math.min(2 + (id % 2), cat.length);
      const lines = [];
      for (let k = 0; k < n; k++) {
        const it = cat[(id + k) % cat.length];
        const q = (10 + Math.floor(rnd() * 20)) * 10;
        lines.push({ no: k + 1, sku: it[0], q });
        pol.push([id, k + 1, it[0], q, r2(it[5] * 0.6)]);
      }
      const rdate = (k) => {
        const d = addDays(ed, (id % 3) + k);
        return d > SCENARIO_TODAY ? SCENARIO_TODAY : d;
      };
      const receipt = (date, qtys) => {
        const r = rid++;
        gr.push([r, id, date, 'מרכז לוגיסטי מודיעין']);
        let ln = 0;
        lines.forEach((l, i) => {
          if (qtys[i] > 0) grl.push([r, ++ln, id, l.no, l.sku, qtys[i]]);
        });
      };
      const full = lines.map((l) => l.q);
      const half = lines.map((l) => l.q / 2);
      if (plan === 'full') receipt(rdate(0), full);
      else if (plan === 'over') receipt(rdate(0), lines.map((l, i) => (i === 0 ? l.q + 10 : l.q)));
      else if (plan === 'split') {
        receipt(rdate(0), half);
        receipt(rdate(3), lines.map((l) => l.q - l.q / 2));
      } else if (plan === 'partial') receipt(rdate(0), lines.map((l, i) => (i === 0 ? l.q - 20 : i === 1 ? l.q : 0)));
      else if (plan === 'split-partial') {
        receipt(rdate(0), half);
        receipt(rdate(4), lines.map((l, i) => l.q - l.q / 2 - (i === 0 ? 10 : 0)));
      } else if (plan === 'over-open') receipt(rdate(0), lines.map((l, i) => (i === 0 ? l.q + 20 : 0)));
    });
    ins('PurchaseOrder', po);
    ins('PurchaseOrderLine', pol);
    ins('GoodsReceipt', gr);
    ins('GoodsReceiptLine', grl);

    // customer orders (some customers never ordered)
    const so = [], sol = [];
    const active = ITEMS.filter((i) => i[7] === 1);
    const offsets = [];
    for (let i = 0; i < 30; i++) offsets.push(Math.floor(rnd() * 90));
    offsets.sort((a, b) => a - b);
    offsets.forEach((off, i) => {
      const id = 5001 + i;
      const date = addDays('2026-07-01', off);
      const cust = 1001 + ((i * 7 + Math.floor(rnd() * 3)) % 12);
      const status = i === 5 || i === 17 ? 'CANCELLED' : date > '2026-09-20' ? 'OPEN' : 'SHIPPED';
      so.push([id, cust, date, addDays(date, 2 + (i % 4)), status]);
      const n = 1 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) {
        const it = active[Math.floor(rnd() * active.length)];
        sol.push([id, k + 1, it[0], 5 * (1 + Math.floor(rnd() * 10)), it[5], [0, 0, 5, 10][Math.floor(rnd() * 4)]]);
      }
    });
    ins('SalesOrder', so);
    ins('SalesOrderLine', sol);

    // daily sales Aug-Sep 2026. Some items were not sold in the current month (2026-09).
    const notSoldSept = ['000104', '000304', '000505', '000603'];
    const neverSold = ['000603'];
    const ds = [];
    for (let day = 0; day < 61; day++) {
      const date = addDays('2026-08-01', day);
      BRANCHES.forEach(([bid, , , , open]) => {
        if (date < open) return;
        active.forEach((it) => {
          if (neverSold.includes(it[0])) return;
          if (date >= '2026-09-01' && notSoldSept.includes(it[0])) return;
          if (rnd() > 0.3) return;
          const q = 1 + Math.floor(rnd() * 12 * BRANCH_SIZE[bid]);
          ds.push([date, bid, it[0], q, r2(q * it[5])]);
        });
      });
    }
    ins('DailySales', ds);
    return out.join('\n');
  }

  SL.SCENARIO_DB = {
    currentMonth: CURRENT_MONTH,
    today: SCENARIO_TODAY,
    tables: TABLES.map((t) => ({ name: t.name, desc: t.desc, columns: t.columns.map((c) => ({ name: c.name, type: c.type, desc: c.desc })) })),
    seed: buildSeed(),
  };

  // =====================================================================
  // Exercises
  // =====================================================================
  const EXERCISES = [
    {
      id: 'sql-01',
      level: 'קל',
      title: 'פריטי משקאות לפי מחיר',
      task: "מנהלת הקטגוריה מבקשת את כל הפריטים בקטגוריה 'משקאות': מק\"ט, שם פריט ומחיר, ממוינים מהמחיר הגבוה לנמוך.",
      solution: "SELECT ItemSKU, ItemName, UnitPrice\nFROM Item\nWHERE Category = 'משקאות'\nORDER BY UnitPrice DESC;",
      ordered: true,
      hints: [
        'כל הנתונים נמצאים בטבלה אחת: Item.',
        "סננו עם WHERE Category = 'משקאות' ומיינו עם ORDER BY ... DESC.",
        'SELECT ItemSKU, ItemName, UnitPrice FROM Item WHERE ... ORDER BY UnitPrice DESC',
      ],
      explain:
        'שליפה פשוטה היא הדרך המהירה לוודא שהשדות שאתם עומדים לכתוב באפיון קיימים ומה שמם המדויק. שימו לב ש-ItemSKU הוא טקסט עם אפסים מובילים: באפיון מגדירים אותו כטקסט באורך קבוע, לא כמספר.',
    },
    {
      id: 'sql-02',
      level: 'קל',
      title: 'הזמנות רכש פתוחות באיחור',
      task: "ה'היום' של התרחיש הוא 2026-09-30. אילו הזמנות רכש בסטטוס OPEN עברו את מועד האספקה הצפוי, כלומר ExpectedDate מוקדם מ-2026-09-30? החזירו PONumber ו-ExpectedDate.",
      solution: "SELECT PONumber, ExpectedDate\nFROM PurchaseOrder\nWHERE Status = 'OPEN'\n  AND ExpectedDate < '2026-09-30';",
      ordered: false,
      hints: [
        'הטבלה היא PurchaseOrder. צריך שני תנאים: סטטוס ותאריך.',
        "התאריכים שמורים כטקסט ISO ‏(YYYY-MM-DD), ולכן אפשר להשוות אותם כמחרוזת: ExpectedDate < '2026-09-30'.",
        "WHERE Status = 'OPEN' AND ExpectedDate < '2026-09-30'",
      ],
      explain:
        "הגדרה כמו 'באיחור' נשמעת ברורה עד שבודקים נתונים: יש הזמנה שמועדה בדיוק היום. האם היא באיחור? באפיון צריך לכתוב במפורש את פורמט התאריך ואת הגבול (לפני היום, או כולל היום).",
    },
    {
      id: 'sql-03',
      level: 'קל',
      title: 'פריטים פעילים בכל קטגוריה',
      task: 'כמה פריטים פעילים (IsActive = 1) יש בכל קטגוריה? החזירו את שם הקטגוריה ואת מספר הפריטים.',
      solution: 'SELECT Category, COUNT(*) AS ItemCount\nFROM Item\nWHERE IsActive = 1\nGROUP BY Category;',
      ordered: false,
      hints: ['צריך שורה אחת לכל קטגוריה, כלומר קיבוץ.', 'השתמשו ב-GROUP BY Category וב-COUNT(*). את הסינון לפעילים עושים ב-WHERE לפני הקיבוץ.', 'SELECT Category, COUNT(*) FROM Item WHERE IsActive = 1 GROUP BY Category'],
      explain:
        'ספירה לפי קבוצה עונה על שאלות כמו "אילו ערכים באמת קיימים בשדה הזה ובאיזו כמות" לפני שמגדירים באפיון רשימת ערכים, סינון במסך או חלוקה בדוח.',
    },
    {
      id: 'sql-04',
      level: 'בינוני',
      title: 'הזמנות לקוח לפי חודש',
      task: 'כמה הזמנות לקוח (SalesOrder) נפתחו בכל חודש, לא כולל הזמנות בסטטוס CANCELLED? החזירו חודש בפורמט YYYY-MM ומספר הזמנות, ממוינים לפי החודש מהמוקדם למאוחר.',
      solution: "SELECT substr(OrderDate, 1, 7) AS OrderMonth, COUNT(*) AS Orders\nFROM SalesOrder\nWHERE Status <> 'CANCELLED'\nGROUP BY substr(OrderDate, 1, 7)\nORDER BY OrderMonth;",
      ordered: true,
      hints: [
        'צריך להפוך את התאריך המלא לחודש, ואז לקבץ לפיו.',
        "אפשר לחתוך את 7 התווים הראשונים: substr(OrderDate, 1, 7), או להשתמש ב-strftime('%Y-%m', OrderDate).",
        "SELECT substr(OrderDate,1,7) AS m, COUNT(*) FROM SalesOrder WHERE Status <> 'CANCELLED' GROUP BY m ORDER BY m",
      ],
      explain:
        'דוחות לפי חודש הם בקשה נפוצה. באפיון הדוח צריך לקבוע לפי איזה תאריך משייכים לחודש (הזמנה? אספקה?) ואילו סטטוסים נספרים. שאילתה כזו מראה מהר אם ההחלטה משנה את המספרים.',
    },
    {
      id: 'sql-05',
      level: 'בינוני',
      title: 'לקוחות בלי אף הזמנה',
      task: 'צוות המכירות רוצה לפנות ללקוחות שעדיין לא ביצעו אף הזמנה (בכל סטטוס). החזירו CustomerID ו-CustomerName.',
      solution: 'SELECT c.CustomerID, c.CustomerName\nFROM Customer c\nLEFT JOIN SalesOrder o ON o.CustomerID = c.CustomerID\nWHERE o.SOID IS NULL;',
      ordered: false,
      joinDemo: 'customer',
      hints: [
        'צריך את כל הלקוחות, גם כאלה שאין להם שורה מתאימה ב-SalesOrder.',
        'LEFT JOIN שומר את כל הלקוחות. ללקוח בלי הזמנה, עמודות SalesOrder יהיו NULL.',
        'FROM Customer c LEFT JOIN SalesOrder o ON o.CustomerID = c.CustomerID WHERE o.SOID IS NULL',
      ],
      explain:
        'LEFT JOIN עם IS NULL מוצא "ישויות יתומות". באפיון של דוח או מסך, השאלה "האם להציג לקוח בלי הזמנות?" קובעת אם זה INNER או LEFT JOIN, וצריך לכתוב אותה במפורש.',
    },
    {
      id: 'sql-06',
      level: 'בינוני',
      title: 'ספקים עם יותר משלוש הזמנות פתוחות',
      task: 'קניין ראשי רוצה לדעת אילו ספקים מחזיקים יותר משלוש הזמנות רכש בסטטוס OPEN. החזירו את שם הספק ואת מספר ההזמנות הפתוחות שלו.',
      solution:
        "SELECT s.SupplierName, COUNT(*) AS OpenOrders\nFROM Supplier s\nJOIN PurchaseOrder po ON po.SupplierID = s.SupplierID\nWHERE po.Status = 'OPEN'\nGROUP BY s.SupplierID, s.SupplierName\nHAVING COUNT(*) > 3;",
      ordered: false,
      joinDemo: null,
      hints: [
        'מחברים בין Supplier ל-PurchaseOrder, מסננים פתוחות, וסופרים לכל ספק.',
        'WHERE מסנן שורות לפני הקיבוץ, HAVING מסנן קבוצות אחרי הספירה.',
        "... WHERE po.Status = 'OPEN' GROUP BY s.SupplierID, s.SupplierName HAVING COUNT(*) > 3",
      ],
      explain:
        '"יותר משלוש" ו"שלוש לפחות" הם שני כללים שונים, ובנתונים יש ספק עם בדיוק 3 הזמנות פתוחות. זה בדיוק הניסוח שצריך לדייק בכלל עסקי באפיון, ולבדוק מול נתונים אמיתיים.',
    },
    {
      id: 'sql-07',
      level: 'בינוני',
      title: 'שורות כפולות בקובץ שנטען',
      task: 'בקובץ ההזמנות שנטען מלקוחות (ImportedOrderFile) חשד לכפילויות: אותה הזמנה חיצונית (ExternalOrderRef) ואותו מק"ט (ItemSKU) מופיעים יותר מפעם אחת. החזירו ExternalOrderRef, ItemSKU ומספר ההופעות.',
      solution: 'SELECT ExternalOrderRef, ItemSKU, COUNT(*) AS Occurrences\nFROM ImportedOrderFile\nGROUP BY ExternalOrderRef, ItemSKU\nHAVING COUNT(*) > 1;',
      ordered: false,
      hints: [
        'כפילות = יותר משורה אחת לאותו צירוף של הזמנה ופריט.',
        'קבצו לפי שתי העמודות יחד, וסננו קבוצות עם יותר משורה אחת.',
        'GROUP BY ExternalOrderRef, ItemSKU HAVING COUNT(*) > 1',
      ],
      explain:
        'לפני שכותבים אפיון לממשק קליטה בודקים קובץ אמיתי: יש כפילויות? הן זהות לגמרי, או רק באותו מפתח עם כמות שונה? התשובה קובעת את כלל הטיפול בכפילויות באפיון: לדחות, לאחד או לסכם.',
    },
    {
      id: 'sql-08',
      level: 'מתקדם',
      title: 'פריטים שלא נמכרו החודש',
      task: 'החודש הנוכחי בתרחיש הוא ספטמבר 2026 (2026-09). אילו פריטים פעילים (IsActive = 1) לא נמכרו באף סניף החודש לפי DailySales? החזירו ItemSKU ו-ItemName.',
      solution:
        "SELECT i.ItemSKU, i.ItemName\nFROM Item i\nWHERE i.IsActive = 1\n  AND NOT EXISTS (\n    SELECT 1 FROM DailySales d\n    WHERE d.ItemSKU = i.ItemSKU\n      AND d.SaleDate BETWEEN '2026-09-01' AND '2026-09-30');",
      ordered: false,
      joinDemo: 'item',
      hints: [
        'מתחילים מכל הפריטים הפעילים, ומחפשים את אלה שאין להם אף שורת מכירה בספטמבר.',
        'אפשר LEFT JOIN עם IS NULL או NOT EXISTS. תנאי החודש חייב להיות בתוך ה-ON (או בתוך NOT EXISTS), לא ב-WHERE הראשי. אחרת ה-LEFT JOIN הופך בפועל ל-INNER.',
        "LEFT JOIN DailySales d ON d.ItemSKU = i.ItemSKU AND d.SaleDate LIKE '2026-09%' ... WHERE i.IsActive = 1 AND d.ItemSKU IS NULL",
      ],
      explain:
        'פריט שלא נמכר לא מופיע בטבלת המכירות בכלל, ולכן דוח "מכירות לפי פריט" שבנוי על INNER JOIN פשוט לא יראה אותו. באפיון דוח כזה צריך לכתוב אם פריטים בלי מכירות מוצגים עם 0, ולפי איזו הגדרה של "החודש".',
    },
    {
      id: 'sql-09',
      level: 'מתקדם',
      title: 'מק"טים בקובץ שלא קיימים בקטלוג',
      task: 'בקובץ ההזמנות שנטען (ImportedOrderFile) יש שורות שהמק"ט שלהן לא נמצא בטבלת Item. החזירו RowNum ו-ItemSKU כפי שהגיע בקובץ.',
      solution: 'SELECT f.RowNum, f.ItemSKU\nFROM ImportedOrderFile f\nLEFT JOIN Item i ON i.ItemSKU = f.ItemSKU\nWHERE i.ItemSKU IS NULL;',
      ordered: false,
      joinDemo: 'file',
      hints: [
        'זה אותו דפוס של "ישויות יתומות": כל שורות הקובץ, בלי התאמה בקטלוג.',
        'LEFT JOIN מהקובץ ל-Item לפי ItemSKU, ואז IS NULL על עמודה מ-Item.',
        'FROM ImportedOrderFile f LEFT JOIN Item i ON i.ItemSKU = f.ItemSKU WHERE i.ItemSKU IS NULL',
      ],
      explain:
        'הסתכלו על המק"טים שחזרו: חלקם פשוט איבדו אפסים מובילים (קובץ שעבר דרך Excel). זה מקור קלאסי לתקלות קליטה. באפיון הממשק מגדירים את המק"ט כטקסט באורך 6, וקובעים מה עושים במק"ט לא מוכר: דחייה, השלמת אפסים, או תור חריגים.',
    },
    {
      id: 'sql-10',
      level: 'מתקדם',
      title: 'שורות הזמנה שנקלטו חלקית',
      task: 'שורת הזמנת רכש "נקלטה חלקית" אם סך הכמות שנקלטה בכל הקליטות יחד גדול מ-0 וקטן מהכמות שהוזמנה. החזירו PONumber, LineNo, ItemSKU, OrderedQty וסך הכמות שנקלטה.',
      solution:
        'SELECT po.PONumber, pol.LineNo, pol.ItemSKU, pol.OrderedQty,\n       SUM(grl.ReceivedQty) AS ReceivedQty\nFROM PurchaseOrderLine pol\nJOIN PurchaseOrder po ON po.POID = pol.POID\nJOIN GoodsReceiptLine grl ON grl.POID = pol.POID AND grl.POLineNo = pol.LineNo\nGROUP BY pol.POID, pol.LineNo\nHAVING SUM(grl.ReceivedQty) < pol.OrderedQty;',
      ordered: false,
      joinDemo: 'receipt',
      hints: [
        'לשורת הזמנה אחת יכולות להיות כמה שורות קליטה (משלוח מפוצל). קודם צריך לסכם.',
        'מחברים PurchaseOrderLine ל-GoodsReceiptLine לפי POID ו-POLineNo, מקבצים לפי שורת ההזמנה, ומשווים את SUM(ReceivedQty) ל-OrderedQty ב-HAVING.',
        'GROUP BY pol.POID, pol.LineNo HAVING SUM(grl.ReceivedQty) < pol.OrderedQty',
      ],
      explain:
        'השוואה של שורת קליטה בודדת מול ההזמנה תסמן בטעות משלוחים מפוצלים כ"חלקיים". באפיון הסטטוס "נקלטה חלקית" צריך להגדיר שהבדיקה היא על הסכום המצטבר, ולאיזו רמה (שורה או הזמנה).',
    },
    {
      id: 'sql-11',
      level: 'מתקדם',
      title: 'קליטות עודפות',
      task: 'אילו שורות הזמנת רכש נקלטו בכמות גדולה מהכמות שהוזמנה (בכל הקליטות יחד)? החזירו PONumber, LineNo, ItemSKU, OrderedQty, סך הכמות שנקלטה, והעודף (נקלט פחות הוזמן).',
      solution:
        'SELECT po.PONumber, pol.LineNo, pol.ItemSKU, pol.OrderedQty,\n       SUM(grl.ReceivedQty) AS ReceivedQty,\n       SUM(grl.ReceivedQty) - pol.OrderedQty AS Excess\nFROM PurchaseOrderLine pol\nJOIN PurchaseOrder po ON po.POID = pol.POID\nJOIN GoodsReceiptLine grl ON grl.POID = pol.POID AND grl.POLineNo = pol.LineNo\nGROUP BY pol.POID, pol.LineNo\nHAVING SUM(grl.ReceivedQty) > pol.OrderedQty;',
      ordered: false,
      joinDemo: 'receipt',
      hints: [
        'כמו התרגיל הקודם, רק בכיוון ההפוך, ועם עמודה מחושבת נוספת.',
        'העודף הוא SUM(grl.ReceivedQty) - pol.OrderedQty, והסינון ב-HAVING.',
        'HAVING SUM(grl.ReceivedQty) > pol.OrderedQty',
      ],
      explain:
        'האם המחסן רשאי לקלוט יותר ממה שהוזמן? אם הנתונים מראים שזה קורה, האפיון חייב להגדיר סף סבילות (למשל עד 5%), מי מאשר חריגה, ומה קורה בחשבונית.',
    },
    {
      id: 'sql-12',
      level: 'מתקדם',
      title: 'ביצוע מול יעד לפי סניף',
      task: 'לכל סניף, בחודש הנוכחי (2026-09): שם הסניף, יעד המכירה (TargetAmount) וסך המכירות בפועל מ-DailySales. כל הסניפים צריכים להופיע, גם סניף שאין לו יעד לחודש (היעד יהיה NULL).',
      solution:
        "SELECT b.BranchName, t.TargetAmount, ROUND(s.ActualAmount, 2) AS ActualAmount\nFROM Branch b\nLEFT JOIN SalesTarget t\n  ON t.BranchID = b.BranchID AND t.TargetMonth = '2026-09'\nLEFT JOIN (\n  SELECT BranchID, SUM(Amount) AS ActualAmount\n  FROM DailySales\n  WHERE SaleDate BETWEEN '2026-09-01' AND '2026-09-30'\n  GROUP BY BranchID) s ON s.BranchID = b.BranchID;",
      ordered: false,
      joinDemo: 'target',
      hints: [
        'שלוש טבלאות: Branch (כל הסניפים), SalesTarget (יעד, אולי חסר), DailySales (סכום).',
        'סכמו קודם את המכירות לכל סניף בתת-שאילתה, ורק אז חברו. תנאי החודש של היעד צריך להיות בתוך ה-ON של LEFT JOIN.',
        "FROM Branch b LEFT JOIN SalesTarget t ON t.BranchID = b.BranchID AND t.TargetMonth = '2026-09' LEFT JOIN (SELECT BranchID, SUM(Amount) ... GROUP BY BranchID) s ON ...",
      ],
      explain:
        'סניף חדש בלי יעד הוא מקרה קצה שמפיל דוחות: INNER JOIN מעלים אותו, וחישוב אחוז עמידה ביעד מתחלק ב-NULL. האפיון צריך לקבוע מה מוצג במקרה כזה, לפני שהמפתח מחליט לבד.',
    },
  ];

  // =====================================================================
  // JOIN visualisation presets ({JOIN} is replaced by INNER JOIN / LEFT JOIN)
  // =====================================================================
  const JOIN_DEMOS = {
    item: {
      label: 'פריטים ומכירות ספטמבר (Item ← DailySales)',
      sql: "SELECT i.ItemSKU, i.ItemName, s.QtySold\nFROM Item i\n{JOIN} (SELECT ItemSKU, SUM(Qty) AS QtySold\n        FROM DailySales\n        WHERE SaleDate BETWEEN '2026-09-01' AND '2026-09-30'\n        GROUP BY ItemSKU) s\n  ON s.ItemSKU = i.ItemSKU",
      why: 'פריטים שלא נמכרו בספטמבר לא מופיעים בטבלת המכירות, ולכן INNER JOIN מעלים אותם.',
    },
    customer: {
      label: 'לקוחות והזמנות (Customer ← SalesOrder)',
      sql: 'SELECT c.CustomerID, c.CustomerName, o.SOID, o.OrderDate\nFROM Customer c\n{JOIN} SalesOrder o ON o.CustomerID = c.CustomerID',
      why: 'לקוח בלי הזמנות אין לו אף שורה ב-SalesOrder להתחבר אליה.',
    },
    target: {
      label: 'סניפים ויעדי ספטמבר (Branch ← SalesTarget)',
      sql: "SELECT b.BranchID, b.BranchName, t.TargetMonth, t.TargetAmount\nFROM Branch b\n{JOIN} SalesTarget t\n  ON t.BranchID = b.BranchID AND t.TargetMonth = '2026-09'",
      why: 'לסניף שנפתח באמצע החודש עדיין לא הוגדר יעד.',
    },
    receipt: {
      label: 'שורות הזמנה וקליטות (PurchaseOrderLine ← GoodsReceiptLine)',
      sql: 'SELECT pol.POID, pol.LineNo, pol.ItemSKU, pol.OrderedQty, grl.ReceiptID, grl.ReceivedQty\nFROM PurchaseOrderLine pol\n{JOIN} GoodsReceiptLine grl\n  ON grl.POID = pol.POID AND grl.POLineNo = pol.LineNo',
      why: 'שורות הזמנה שעוד לא נקלטו בכלל אין להן שורת קליטה. שימו לב גם ששורה שנקלטה בשני משלוחים מופיעה פעמיים.',
    },
    file: {
      label: 'שורות קובץ וקטלוג (ImportedOrderFile ← Item)',
      sql: 'SELECT f.RowNum, f.ExternalOrderRef, f.ItemSKU, i.ItemName\nFROM ImportedOrderFile f\n{JOIN} Item i ON i.ItemSKU = f.ItemSKU',
      why: 'מק"טים שלא קיימים בקטלוג (למשל כאלה שאיבדו אפסים מובילים) לא מוצאים התאמה ב-Item.',
    },
  };

  // =====================================================================
  // Styles (module specific)
  // =====================================================================
  function injectStyles() {
    if (document.getElementById('sqll-styles')) return;
    const css = `
.sqll-grid { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 16px; align-items: start; }
@media (max-width: 900px) { .sqll-grid { grid-template-columns: minmax(0, 1fr); } .sqll-schema { max-height: 260px; } }
.sqll-schema { position: sticky; top: 76px; max-height: calc(100vh - 100px); overflow: auto; padding: 12px; }
.sqll-schema h2 { font-size: 1rem; margin: 0 0 6px; }
.sqll-schema details { border-bottom: 1px solid var(--border); padding: 4px 0; }
.sqll-schema summary { cursor: pointer; display: flex; align-items: center; gap: 6px; list-style: none; }
.sqll-schema summary::-webkit-details-marker { display: none; }
.sqll-schema summary::before { content: '▸'; color: var(--muted); font-size: 0.8rem; width: 10px; }
.sqll-schema details[open] > summary::before { content: '▾'; }
.sqll-name { font-family: var(--mono); direction: ltr; background: none; border: 0; padding: 2px 4px; border-radius: 6px; cursor: pointer; color: var(--primary); font-weight: 700; font-size: 0.88rem; }
.sqll-name:hover { background: var(--primary-soft); }
.sqll-cols { list-style: none; margin: 2px 0 6px; padding: 0 16px 0 0; }
.sqll-cols li { display: flex; align-items: baseline; gap: 6px; font-size: 0.82rem; }
.sqll-cols .sqll-name { color: var(--text); font-weight: 500; font-size: 0.82rem; }
.sqll-type { color: var(--muted); font-family: var(--mono); font-size: 0.72rem; direction: ltr; }
.sqll-pk { color: var(--gold); font-size: 0.75rem; }
.sqll-editor { min-height: 170px; font-size: 0.95rem; line-height: 1.5; tab-size: 2; }
.sqll-meta { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin: 8px 0; font-size: 0.9rem; }
.sqll-null { color: var(--muted); font-style: italic; font-size: 0.82rem; }
.sqll-hist { list-style: none; padding: 0; margin: 0; display: grid; gap: 4px; max-height: 260px; overflow: auto; }
.sqll-hist button { width: 100%; text-align: left; direction: ltr; font-family: var(--mono); font-size: 0.8rem; background: var(--surface-2); border: 1px solid transparent; border-radius: 8px; padding: 6px 8px; cursor: pointer; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; gap: 8px; }
.sqll-hist button:hover { border-color: var(--primary); }
.sqll-hist .st { flex: none; }
.sqll-task { font-size: 1.05rem; }
.sqll-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 10px 0; }
.sqll-kpis .kpi b { font-size: 1.6rem; }
.sqll-join-tbls h3 { margin: 6px 0; font-size: 0.95rem; }
.sqll-legend { display: inline-block; width: 14px; height: 14px; border-radius: 4px; background: var(--bad-soft); border: 1px solid var(--bad); vertical-align: middle; }
.sqll-ex-num { flex: none; width: 30px; height: 30px; border-radius: 8px; background: var(--surface-2); display: inline-flex; align-items: center; justify-content: center; font-weight: 800; }
.sqll-ex-item .grow { flex: 1; min-width: 0; }
.sqll-tech { font-family: var(--mono); font-size: 0.92em; }
.sqll-err-orig { font-family: var(--mono); direction: ltr; text-align: left; font-size: 0.8rem; color: var(--muted); margin-top: 4px; }
`;
    document.head.appendChild(h('style', { id: 'sqll-styles' }, css));
  }

  // =====================================================================
  // Helpers
  // =====================================================================
  const SEED = () => SL.SCENARIO_DB.seed;
  function bag(key) {
    if (!SL.state[key] || typeof SL.state[key] !== 'object') SL.state[key] = {};
    return SL.state[key];
  }
  const normQ = (q) => q.replace(/\s+/g, ' ').trim().replace(/;$/, '').toLowerCase();

  function hebError(msg) {
    msg = String(msg || '');
    let m;
    if (msg === 'stopped' || msg.includes('5 שניות'))
      return 'השאילתה רצה יותר מ-5 שניות ונעצרה. בדקו לולאה ב-CTE רקורסיבי או JOIN בלי תנאי. אפשר להמשיך לעבוד כרגיל.';
    if (/[֐-׿]/.test(msg)) return msg;
    if ((m = msg.match(/no such table: (\S+)/i))) return 'הטבלה ' + m[1] + ' לא קיימת. בדקו את שם הטבלה ברשימת מבנה הנתונים.';
    if ((m = msg.match(/no such column: (\S+)/i))) return 'העמודה ' + m[1] + ' לא קיימת (או שהכינוי של הטבלה שגוי).';
    if ((m = msg.match(/ambiguous column name: (\S+)/i))) return 'שם העמודה ' + m[1] + ' קיים ביותר מטבלה אחת. ציינו את הטבלה, למשל t.' + m[1].replace(/^.*\./, '') + '.';
    if ((m = msg.match(/near "([^"]*)": syntax error/i))) return 'שגיאת תחביר ליד "' + m[1] + '".';
    if (/incomplete input/i.test(msg)) return 'השאילתה לא שלמה (אולי חסר סוגר או סוף משפט).';
    if ((m = msg.match(/no such function: (\S+)/i))) return 'הפונקציה ' + m[1] + ' לא קיימת ב-SQLite.';
    if ((m = msg.match(/wrong number of arguments to function (\S+)/i))) return 'מספר ארגומנטים שגוי לפונקציה ' + m[1] + '.';
    if (/misuse of aggregate/i.test(msg)) return 'שימוש שגוי בפונקציית קיבוץ (COUNT/SUM...). תנאי על תוצאת קיבוץ כותבים ב-HAVING, לא ב-WHERE.';
    if (/GROUP BY clause is required before HAVING|HAVING clause on a non-aggregate/i.test(msg)) return 'HAVING דורש GROUP BY.';
    if (/do not have the same number of result columns/i.test(msg)) return 'בשני צדי UNION צריך אותו מספר עמודות.';
    if (/readonly|query_only/i.test(msg)) return 'בארגז החול מותרות רק שאילתות קריאה. הפקודה נחסמה.';
    return 'שגיאת SQL.';
  }
  function errorBox(err) {
    const raw = String((err && err.message) || err);
    const heb = hebError(raw);
    return h('div', { class: 'notice bad', role: 'alert' }, h('b', null, '⚠️ ', rich(heb)), heb !== raw && !/[֐-׿]/.test(raw) ? h('div', { class: 'sqll-err-orig' }, raw) : null);
  }

  /** Hebrew text with embedded technical tokens: wrap Latin/ISO runs in LTR <bdi> so bidi stays readable. */
  const TECH_UNIT = String.raw`[A-Za-z_](?:[\w.]*\w)?(?:\(\*?\))?(?:\s*(?:<>|<=|>=|=|<|>)\s*(?:'[^']*'|[\w.\-]+))?`;
  const TECH_RE = new RegExp('(?:' + TECH_UNIT + '(?:\\s+' + TECH_UNIT + ')*|\\d{4}-\\d{2}(?:-\\d{2})?)', 'g');
  function rich(text) {
    const out = [];
    let last = 0;
    String(text).replace(TECH_RE, (m, off) => {
      if (off > last) out.push(text.slice(last, off));
      out.push(h('bdi', { dir: 'ltr', class: 'sqll-tech' }, m));
      last = off + m.length;
      return m;
    });
    if (last < text.length) out.push(text.slice(last));
    return out;
  }

  function fmtCell(v) {
    if (v == null) return h('span', { class: 'sqll-null' }, 'NULL');
    if (typeof v === 'number' && !Number.isInteger(v)) return String(Math.round(v * 1e6) / 1e6);
    if (v instanceof Uint8Array) return '[BLOB]';
    return String(v);
  }
  function resultTable(res, marks) {
    if (!res.columns.length) return h('p', { class: 'muted' }, 'השאילתה לא החזירה עמודות.');
    return h(
      'div',
      { class: 'table-wrap' },
      h(
        'table',
        { class: 'tbl ltr', dir: 'ltr' },
        h('thead', null, h('tr', null, res.columns.map((c) => h('th', null, c)))),
        h(
          'tbody',
          null,
          res.rows.map((r, i) => h('tr', { class: marks && marks[i] ? 'err-row' : null }, r.map((v) => h('td', typeof v === 'string' && /[\u0590-\u05FF]/.test(v) ? { dir: 'auto' } : null, fmtCell(v)))))
        )
      )
    );
  }
  function resultMeta(res) {
    return h(
      'div',
      null,
      h('div', { class: 'sqll-meta' }, h('span', { class: 'tag primary' }, res.total.toLocaleString('he-IL') + ' שורות'), h('span', { class: 'tag' }, res.ms + ' ms')),
      res.total > res.rows.length ? h('div', { class: 'notice warn small' }, 'מוצגות 1,000 השורות הראשונות מתוך ' + res.total.toLocaleString('he-IL') + '.') : null
    );
  }
  const rowKey = (r) => r.map((v) => (v == null ? '∅' : typeof v === 'number' ? String(Math.round(v * 1e6) / 1e6) : String(v))).join('\u0001');
  /** Indexes of rows in `a` that are not present in `b` (multiset difference). */
  function missingRows(a, b) {
    const cnt = new Map();
    b.rows.forEach((r) => {
      const k = rowKey(r);
      cnt.set(k, (cnt.get(k) || 0) + 1);
    });
    const out = [];
    a.rows.forEach((r, i) => {
      const k = rowKey(r);
      if (cnt.get(k) > 0) cnt.set(k, cnt.get(k) - 1);
      else out.push(i);
    });
    return out;
  }

  const refCache = {};
  function refResult(ex) {
    if (!refCache[ex.id]) refCache[ex.id] = SL.sql.run(SEED(), ex.solution).catch((e) => {
      delete refCache[ex.id];
      throw e;
    });
    return refCache[ex.id];
  }

  /** Grade a query for an exercise. Resolves {correct, feedback:[{kind,text}], user, ref} or rejects on SQL error. */
  async function grade(ex, query) {
    const ref = await refResult(ex);
    const user = await SL.sql.run(SEED(), query);
    const correct = SL.sql.sameResult(user, ref, ex.ordered);
    const fb = [];
    if (correct) {
      fb.push({ kind: 'good', text: 'התוצאה זהה לתוצאת הייחוס: ' + ref.total + ' שורות, ' + ref.columns.length + ' עמודות.' + (ex.ordered ? ' גם הסדר נכון.' : '') });
    } else {
      if (user.columns.length !== ref.columns.length)
        fb.push({ kind: 'bad', text: 'מספר העמודות: ציפינו ל-' + ref.columns.length + ', התקבלו ' + user.columns.length + '.' });
      else fb.push({ kind: 'good', text: 'מספר העמודות נכון (' + ref.columns.length + ').' });
      if (user.total !== ref.total) {
        fb.push({ kind: 'bad', text: 'מספר השורות: ציפינו ל-' + ref.total + ', התקבלו ' + user.total + '.' + (user.total > ref.total ? ' אולי חסר תנאי סינון, או ש-JOIN משכפל שורות.' : ' אולי תנאי מחמיר מדי, או INNER JOIN במקום LEFT JOIN.') });
      } else fb.push({ kind: 'good', text: 'מספר השורות נכון (' + ref.total + ').' });
      if (user.columns.length === ref.columns.length) {
        if (ex.ordered && user.total === ref.total && SL.sql.sameResult(user, ref, false)) fb.push({ kind: 'warn', text: 'הערכים נכונים, אבל סדר השורות לא. התרגיל דורש מיון.' });
        else {
          const extra = missingRows(user, ref).length;
          const miss = missingRows(ref, user);
          if (extra) fb.push({ kind: 'bad', text: extra + ' שורות בתוצאה שלך לא מופיעות בתוצאת הייחוס.' });
          if (miss.length) fb.push({ kind: 'bad', text: miss.length + ' שורות מתוצאת הייחוס חסרות אצלך. בדקו גם את סדר העמודות ואת העיגול.' });
        }
      }
    }
    return { correct, feedback: fb, user, ref };
  }

  function solvedCount() {
    return EXERCISES.filter((e) => SL.labState(e.id).best === 100).length;
  }

  // =====================================================================
  // Registration & routes
  // =====================================================================
  SL.registerLab({
    id: 'sql',
    icon: '🗄️',
    title: 'ארגז חול SQL',
    desc: 'שאילתות על בסיס הנתונים של חברת ההפצה: מאמתים הנחות בנתונים לפני שכותבים אפיון.',
    route: '/lab/sql',
    skills: ['sql'],
    count: () => solvedCount() + '/' + EXERCISES.length,
  });

  SL.route('/lab/sql', (el) => {
    injectStyles();
    el.appendChild(
      h(
        'div',
        { class: 'stack' },
        h('div', { class: 'row small' }, h('a', { href: '#/labs' }, '← מעבדות')),
        h('h1', null, '🗄️ ארגז חול SQL'),
        h(
          'p',
          { class: 'muted' },
          'המטרה היא לא להפוך למפתחים, אלא לקרוא נתונים, לאמת הנחות, ולכתוב באפיון בדיוק מאיפה נשלף כל נתון. בסיס הנתונים הוא של חברת הפצה וקמעונאות בדיונית: רכש וקליטה, הזמנות לקוח, ויעדי מכירה לסניפים. ',
          h('b', null, 'החודש הנוכחי בתרחיש: ספטמבר 2026 (' + CURRENT_MONTH + '), וה"היום" הוא ' + SCENARIO_TODAY + '.')
        ),
        h(
          'div',
          { class: 'card row between' },
          h('div', null, h('h2', { style: { margin: 0 } }, '🧪 ארגז חול חופשי'), h('p', { class: 'muted small' }, 'הריצו כל שאילתת SELECT, בלי בדיקה. כולל המחשת JOIN.')),
          h('button', { class: 'btn primary', onclick: () => SL.go('/lab/sql/free') }, 'פתיחה')
        ),
        h('h2', null, 'תרגילים (' + solvedCount() + '/' + EXERCISES.length + ' נפתרו)'),
        h(
          'div',
          { class: 'ex-list' },
          EXERCISES.map((ex, i) => {
            const st = SL.labState(ex.id);
            const status =
              st.best === 100
                ? h('span', { class: 'tag good' }, '✓ נפתר')
                : st.attempts
                  ? h('span', { class: 'tag warn' }, st.attempts + ' בדיקות')
                  : h('span', { class: 'tag' }, 'חדש');
            return h(
              'button',
              { class: 'ex-item sqll-ex-item', onclick: () => SL.go('/lab/sql/' + ex.id) },
              h('span', { class: 'sqll-ex-num' }, i + 1),
              h('span', { class: 'grow' }, h('b', null, ex.title), h('div', { class: 'muted small' }, rich(ex.task.length > 110 ? ex.task.slice(0, 108) + '…' : ex.task))),
              h('span', { class: 'tag ' + (ex.level === 'קל' ? 'good' : ex.level === 'בינוני' ? 'warn' : 'bad') }, ex.level),
              st.solutionViewed ? h('span', { class: 'tag' }, 'נצפה פתרון') : null,
              status
            );
          })
        )
      )
    );
  });

  SL.route('/lab/sql/:id', (el, params) => {
    injectStyles();
    if (params.id === 'free') return renderWorkspace(el, null);
    const ex = EXERCISES.find((e) => e.id === params.id);
    if (!ex) return SL.go('/lab/sql');
    renderWorkspace(el, ex);
  });

  // =====================================================================
  // Workspace
  // =====================================================================
  function renderWorkspace(el, ex) {
    const key = ex ? ex.id : 'free';
    const drafts = bag('sqlDrafts');
    const hintsState = bag('sqlHints');
    let busy = false;
    let saveTimer = null;
    let escPressed = false;

    const idx = ex ? EXERCISES.indexOf(ex) : -1;
    const defaultQ = ex ? '' : 'SELECT *\nFROM Item\nLIMIT 20;';

    // ---- editor ----
    const ta = h('textarea', {
      class: 'code sqll-editor',
      dir: 'ltr',
      spellcheck: 'false',
      autocomplete: 'off',
      'aria-label': 'עורך SQL',
      placeholder: 'SELECT ...',
      value: drafts[key] != null ? drafts[key] : defaultQ,
    });
    const saveDraft = () => {
      clearTimeout(saveTimer);
      saveTimer = null;
      bag('sqlDrafts')[key] = ta.value;
      SL.save();
    };
    ta.addEventListener('input', () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveDraft, 400);
    });
    ta.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        run();
        return;
      }
      if (e.key === 'Escape') {
        escPressed = true;
        return;
      }
      if (e.key === 'Tab' && !e.shiftKey && !escPressed && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        insertAtCursor('  ', false);
      }
      escPressed = false;
    });
    function insertAtCursor(text, focus) {
      const s = ta.selectionStart,
        en = ta.selectionEnd;
      let t = text;
      if (focus !== false) {
        const before = ta.value.slice(0, s);
        if (before && !/[\s(,.]$/.test(before)) t = ' ' + t;
      }
      ta.setRangeText(t, s, en, 'end');
      ta.focus();
      ta.dispatchEvent(new Event('input'));
    }

    // ---- output areas ----
    const resultsBox = h('div', { 'aria-live': 'polite' });
    const feedbackBox = h('div', { 'aria-live': 'polite' });
    const hintsBox = h('div');
    const solutionBox = h('div');
    const joinBox = h('div');
    const histList = h('ul', { class: 'sqll-hist' });

    const runBtn = h('button', { class: 'btn primary', onclick: () => run(), title: 'Ctrl+Enter' }, '▶ הרצה');
    const checkBtn = ex ? h('button', { class: 'btn', onclick: () => check() }, '✔ בדיקה') : null;
    const hintBtn = ex ? h('button', { class: 'btn ghost', onclick: () => revealHint() }) : null;
    const solBtn = ex ? h('button', { class: 'btn ghost', onclick: () => showSolution() }, 'הצג פתרון') : null;
    const joinBtn = h('button', { class: 'btn ghost', onclick: () => toggleJoin() }, '🔗 המחשת JOIN');
    const allBtns = [runBtn, checkBtn, joinBtn].filter(Boolean);

    function setBusy(b, label) {
      busy = b;
      allBtns.forEach((x) => (x.disabled = b));
      if (b) {
        resultsBox.innerHTML = '';
        resultsBox.appendChild(h('div', { class: 'row muted' }, h('span', { class: 'spinner' }), label || 'מריץ...'));
      }
    }

    // ---- history ----
    function pushHistory(q, ok, info) {
      const list = (bag('sqlHistory')[key] = bag('sqlHistory')[key] || []);
      const n = normQ(q);
      const at = list.findIndex((x) => normQ(x.q) === n);
      if (at >= 0) list.splice(at, 1);
      list.unshift({ q, ok, info, at: Date.now() });
      if (list.length > 20) list.length = 20;
      SL.save();
      renderHistory();
    }
    function renderHistory() {
      const list = bag('sqlHistory')[key] || [];
      histList.innerHTML = '';
      if (!list.length) histList.appendChild(h('li', { class: 'muted small' }, 'עוד לא הורצו שאילתות.'));
      list.forEach((it) =>
        histList.appendChild(
          h(
            'li',
            null,
            h(
              'button',
              {
                title: it.q,
                onclick: () => {
                  ta.value = it.q;
                  ta.focus();
                  saveDraft();
                },
              },
              h('span', { class: 'st' }, it.ok === true ? '✅' : it.ok === false ? '❌' : it.ok === 'err' ? '⚠️' : '▶'),
              it.q.replace(/\s+/g, ' ')
            )
          )
        )
      );
    }

    // ---- run ----
    async function run() {
      if (busy) return;
      const q = ta.value;
      saveDraft();
      feedbackBox.innerHTML = '';
      setBusy(true);
      try {
        const res = await SL.sql.run(SEED(), q);
        resultsBox.innerHTML = '';
        resultsBox.appendChild(resultMeta(res));
        resultsBox.appendChild(resultTable(res));
        pushHistory(q, 'run', res.total + ' שורות');
      } catch (e) {
        resultsBox.innerHTML = '';
        resultsBox.appendChild(errorBox(e));
        if (q.trim()) pushHistory(q, 'err', hebError(e.message));
      } finally {
        setBusy(false);
      }
    }

    // ---- check ----
    async function check() {
      if (busy || !ex) return;
      const q = ta.value;
      saveDraft();
      feedbackBox.innerHTML = '';
      setBusy(true, 'בודק מול תוצאת הייחוס...');
      let g;
      try {
        g = await grade(ex, q);
      } catch (e) {
        resultsBox.innerHTML = '';
        resultsBox.appendChild(errorBox(e));
        if (q.trim()) pushHistory(q, 'err', hebError(e.message));
        setBusy(false);
        return;
      }
      setBusy(false);
      resultsBox.innerHTML = '';
      resultsBox.appendChild(resultMeta(g.user));
      resultsBox.appendChild(resultTable(g.user));
      pushHistory(q, g.correct, g.user.total + ' שורות');

      // Submit only on the first check, on an improvement, or on a new wrong query (no spam).
      const st = SL.labState(ex.id);
      const n = normQ(q);
      const shouldSubmit = st.attempts === 0 || (st.best !== 100 && (g.correct || bag('sqlLastSubmitted')[ex.id] !== n));
      if (shouldSubmit) {
        bag('sqlLastSubmitted')[ex.id] = n;
        SL.labSubmit(ex.id, { score: g.correct ? 100 : 0, skillId: 'sql', feedback: g.feedback.map((f) => f.text) });
      }
      feedbackBox.appendChild(
        h(
          'div',
          { class: 'card ' + (g.correct ? 'pop' : 'shake'), style: { borderInlineStart: '4px solid var(--' + (g.correct ? 'good' : 'bad') + ')' } },
          h('h3', { style: { marginTop: 0 } }, g.correct ? '✅ נכון!' : '❌ עוד לא'),
          h('ul', { class: 'fb-list' }, g.feedback.map((f) => h('li', { class: f.kind }, rich(f.text)))),
          !shouldSubmit && st.best !== 100 ? h('p', { class: 'muted small' }, 'אותה שאילתה כבר נבדקה, ולכן לא נרשמה הגשה נוספת.') : null,
          g.correct && ex.explain ? h('p', { class: 'small', style: { marginTop: '10px' } }, h('b', null, 'למה זה חשוב למאפיין: '), rich(ex.explain)) : null,
          g.correct && idx < EXERCISES.length - 1 ? h('div', { class: 'row end' }, h('button', { class: 'btn primary small', onclick: () => SL.go('/lab/sql/' + EXERCISES[idx + 1].id) }, 'לתרגיל הבא ←')) : null
        )
      );
      renderStatus();
    }

    // ---- hints ----
    function renderHints() {
      if (!ex) return;
      const n = hintsState[ex.id] || 0;
      hintBtn.textContent = n >= ex.hints.length ? 'כל הרמזים נחשפו' : '💡 רמז ' + (n + 1) + '/' + ex.hints.length;
      hintBtn.disabled = n >= ex.hints.length;
      hintsBox.innerHTML = '';
      if (n)
        hintsBox.appendChild(
          h(
            'ul',
            { class: 'fb-list' },
            ex.hints.slice(0, n).map((t, i) => h('li', { class: 'warn' }, h('b', null, 'רמז ' + (i + 1) + ': '), /[A-Z]{3,}/.test(t) && i === 2 ? h('code', { dir: 'ltr' }, t) : rich(t)))
          )
        );
    }
    function revealHint() {
      const hs = bag('sqlHints');
      hs[ex.id] = Math.min(ex.hints.length, (hs[ex.id] || 0) + 1);
      SL.save();
      renderHints();
    }

    // ---- solution (BR 8) ----
    async function showSolution() {
      const ok = await SL.labViewSolution(ex.id);
      if (!ok) return;
      solutionBox.innerHTML = '';
      solutionBox.appendChild(
        h(
          'div',
          { class: 'card' },
          h('h3', { style: { marginTop: 0 } }, 'פתרון ייחוס'),
          h('pre', { dir: 'ltr' }, ex.solution),
          h('p', { class: 'muted small' }, 'זו לא הדרך היחידה. כל שאילתה שמחזירה את אותם ערכים' + (ex.ordered ? ' באותו סדר' : '') + ' נחשבת נכונה.'),
          h(
            'div',
            { class: 'row' },
            h(
              'button',
              {
                class: 'btn small',
                onclick: () => {
                  ta.value = ex.solution;
                  saveDraft();
                  ta.focus();
                },
              },
              'העתק לעורך'
            )
          )
        )
      );
      renderStatus();
    }

    // ---- JOIN visualisation ----
    let joinOpen = false;
    function toggleJoin() {
      joinOpen = !joinOpen;
      joinBox.innerHTML = '';
      if (!joinOpen) return;
      const sel = h(
        'select',
        { 'aria-label': 'דוגמה' },
        Object.keys(JOIN_DEMOS).map((k) => h('option', { value: k, selected: ex && ex.joinDemo === k }, JOIN_DEMOS[k].label)),
        h('option', { value: 'mine' }, 'השאילתה שבעורך (כל JOIN מוחלף)')
      );
      const out = h('div');
      const go = h('button', { class: 'btn primary small', onclick: () => runJoin(sel.value, out) }, 'הרץ INNER מול LEFT');
      joinBox.appendChild(
        h(
          'div',
          { class: 'card' },
          h('h3', { style: { marginTop: 0 } }, '🔗 המחשת JOIN: אילו שורות נעלמות ב-INNER JOIN?'),
          h('p', { class: 'muted small' }, 'אותה שאילתה רצה פעמיים: פעם עם INNER JOIN ופעם עם LEFT JOIN. השורות המסומנות קיימות רק ב-LEFT JOIN, כי אין להן התאמה בטבלה שאחרי ה-JOIN (העמודות שלה ריקות, NULL).'),
          h('div', { class: 'row' }, sel, go),
          out
        )
      );
      runJoin(sel.value, out);
    }
    async function runJoin(which, out) {
      if (busy) return;
      let base, why;
      if (which === 'mine') {
        const q = ta.value.trim().replace(/;\s*$/, '');
        if (!/\bJOIN\b/i.test(q)) {
          out.innerHTML = '';
          out.appendChild(h('div', { class: 'notice warn', style: { marginTop: '10px' } }, 'בשאילתה שבעורך אין JOIN. כתבו שאילתה עם JOIN, או בחרו אחת מהדוגמאות.'));
          return;
        }
        base = q.replace(/\b(?:(?:LEFT|RIGHT|FULL)\s+(?:OUTER\s+)?|INNER\s+)?JOIN\b/gi, '{JOIN}');
        why = 'שימו לב: אם יש בשאילתה תנאי IS NULL על הטבלה השנייה, ב-INNER JOIN היא תחזיר 0 שורות. זו בדיוק הסיבה שחיפוש "יתומים" חייב LEFT JOIN.';
      } else {
        base = JOIN_DEMOS[which].sql;
        why = JOIN_DEMOS[which].why;
      }
      const innerQ = base.split('{JOIN}').join('INNER JOIN');
      const leftQ = base.split('{JOIN}').join('LEFT JOIN');
      out.innerHTML = '';
      out.appendChild(h('div', { class: 'row muted', style: { marginTop: '10px' } }, h('span', { class: 'spinner' }), 'מריץ...'));
      busy = true;
      allBtns.forEach((x) => (x.disabled = true));
      try {
        const inner = await SL.sql.run(SEED(), innerQ);
        const left = await SL.sql.run(SEED(), leftQ);
        const gone = missingRows(left, inner);
        const marks = {};
        gone.forEach((i) => (marks[i] = true));
        out.innerHTML = '';
        out.appendChild(
          h(
            'div',
            null,
            h('pre', { dir: 'ltr', style: { marginTop: '10px' } }, base.replace(/\{JOIN\}/g, 'INNER JOIN / LEFT JOIN')),
            h(
              'div',
              { class: 'sqll-kpis' },
              h('div', { class: 'kpi' }, 'INNER JOIN', h('b', null, inner.total)),
              h('div', { class: 'kpi' }, 'LEFT JOIN', h('b', null, left.total)),
              h('div', { class: 'kpi bad-bg' }, 'נעלמות ב-INNER', h('b', null, gone.length + (left.total > left.rows.length ? '+' : '')))
            ),
            h('p', null, rich(gone.length ? why : 'במקרה הזה לכל שורה יש התאמה, ולכן אין הבדל בין INNER ל-LEFT.')),
            h(
              'div',
              { class: 'split sqll-join-tbls' },
              h('div', null, h('h3', null, 'INNER JOIN · ' + inner.total + ' שורות'), resultTable(inner)),
              h('div', null, h('h3', null, 'LEFT JOIN · ' + left.total + ' שורות ', h('span', { class: 'sqll-legend', 'aria-hidden': 'true' }), ' = נעלמת ב-INNER'), resultTable(left, marks))
            )
          )
        );
      } catch (e) {
        out.innerHTML = '';
        out.appendChild(h('div', { style: { marginTop: '10px' } }, errorBox(e)));
      } finally {
        busy = false;
        allBtns.forEach((x) => (x.disabled = false));
      }
    }

    // ---- schema panel ----
    const schema = h(
      'aside',
      { class: 'card sqll-schema', 'aria-label': 'מבנה הנתונים' },
      h('h2', null, '📋 מבנה הנתונים'),
      h('p', { class: 'muted small' }, 'לחיצה על שם מוסיפה אותו לעורך.'),
      TABLES.map((t) =>
        h(
          'details',
          null,
          h('summary', { title: t.desc }, h('button', { class: 'sqll-name', type: 'button', onclick: (e) => (e.preventDefault(), insertAtCursor(t.name)) }, t.name)),
          h('div', { class: 'muted small' }, t.desc),
          h(
            'ul',
            { class: 'sqll-cols' },
            t.columns.map((c) =>
              h(
                'li',
                { title: c.desc },
                c.pk ? h('span', { class: 'sqll-pk', title: 'מפתח ראשי' }, '🔑') : null,
                h('button', { class: 'sqll-name', type: 'button', onclick: () => insertAtCursor(c.name) }, c.name),
                h('span', { class: 'sqll-type' }, c.type)
              )
            )
          )
        )
      )
    );

    // ---- header / task ----
    const statusBox = h('span');
    function renderStatus() {
      if (!ex) return;
      const st = SL.labState(ex.id);
      statusBox.innerHTML = '';
      statusBox.appendChild(
        h(
          'span',
          { class: 'row' },
          st.best === 100 ? h('span', { class: 'tag good' }, '✓ נפתר') : st.attempts ? h('span', { class: 'tag warn' }, st.attempts + ' הגשות') : null,
          st.solutionViewed ? h('span', { class: 'tag' }, 'נצפה פתרון') : null
        )
      );
    }

    const nav = h(
      'div',
      { class: 'row between small' },
      h('a', { href: '#/lab/sql' }, '← כל התרגילים'),
      ex
        ? h(
            'span',
            { class: 'row' },
            idx > 0 ? h('a', { href: '#/lab/sql/' + EXERCISES[idx - 1].id }, '→ הקודם') : null,
            idx < EXERCISES.length - 1 ? h('a', { href: '#/lab/sql/' + EXERCISES[idx + 1].id }, 'הבא ←') : null
          )
        : null
    );

    const taskCard = ex
      ? h(
          'div',
          { class: 'card' },
          h(
            'div',
            { class: 'row between' },
            h('h1', { style: { margin: 0 } }, 'תרגיל ' + (idx + 1) + ': ' + ex.title),
            h('span', { class: 'row' }, h('span', { class: 'tag ' + (ex.level === 'קל' ? 'good' : ex.level === 'בינוני' ? 'warn' : 'bad') }, ex.level), statusBox)
          ),
          h('p', { class: 'sqll-task' }, rich(ex.task)),
          h(
            'p',
            { class: 'muted small' },
            ex.ordered ? '↕️ בתרגיל הזה סדר השורות נבדק.' : 'סדר השורות לא נבדק.',
            ' שמות העמודות ונוסח השאילתה לא נבדקים, רק הערכים, מספר העמודות ומספר השורות.'
          ),
          h('details', null, h('summary', null, 'למה זה חשוב למאפיין?'), h('p', { class: 'small' }, rich(ex.explain)))
        )
      : h(
          'div',
          { class: 'card' },
          h('h1', { style: { margin: 0 } }, '🧪 ארגז חול חופשי'),
          h('p', { class: 'muted' }, 'הריצו כל שאילתת SELECT על בסיס הנתונים של התרחיש. החודש הנוכחי בתרחיש: ' + CURRENT_MONTH + '. פקודות שמשנות נתונים חסומות, וזמן הריצה מוגבל ל-5 שניות.')
        );

    el.appendChild(
      h(
        'div',
        { class: 'stack' },
        nav,
        taskCard,
        h(
          'div',
          { class: 'sqll-grid' },
          schema,
          h(
            'div',
            { class: 'stack', style: { minWidth: 0 } },
            h(
              'div',
              { class: 'card' },
              h('label', { for: 'sqll-ed-' + key, class: 'small' }, 'שאילתה'),
              ta,
              h('div', { class: 'muted small', style: { margin: '4px 0 8px' } }, 'Ctrl+Enter להרצה · Tab מוסיף רווחים (Esc ואז Tab כדי לצאת מהעורך)'),
              h('div', { class: 'row' }, runBtn, checkBtn, hintBtn, solBtn, h('span', { class: 'spacer' }), joinBtn)
            ),
            hintsBox,
            feedbackBox,
            h('div', { class: 'card' }, h('h2', { style: { marginTop: 0, fontSize: '1.05rem' } }, 'תוצאות'), resultsBox),
            joinBox,
            solutionBox,
            h('details', { class: 'card', open: true }, h('summary', null, h('b', null, 'היסטוריית שאילתות (20 אחרונות)')), h('div', { style: { marginTop: '8px' } }, histList))
          )
        )
      )
    );
    ta.id = 'sqll-ed-' + key;
    resultsBox.appendChild(h('p', { class: 'muted small' }, 'הריצו שאילתה כדי לראות תוצאות.'));
    renderHints();
    renderHistory();
    renderStatus();

    SL.cleanup = () => {
      if (saveTimer) saveDraft();
    };
  }

  // Exposed for tests and for other modules
  SL.sqlLab = { exercises: EXERCISES, joinDemos: JOIN_DEMOS, grade, hebError };
})();
