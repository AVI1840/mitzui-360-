/**
 * מיצוי 360 — כלי מיצוי זכויות לפקידים
 * Based on: btl-domain-engine v4.1.0 + rights-decision-engine v2.1.0
 * No data persistence — every session resets on refresh (security requirement)
 */
import React, { useState, useMemo, useCallback, useRef, Fragment } from 'react';

// ═══════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════
type AT = 'boolean' | 'number' | 'text' | 'select';
type DS = 'relevant' | 'not_relevant' | 'check' | null;
type Urg = 'urgent' | 'within30' | 'planning';
type A = Record<string, any>;
type SMap = Record<string, DS>;

interface Q {
  id: string;
  text: string;
  at: AT;
  opts?: string[];
  showIf?: (a: A) => boolean;
  warn?: (a: A) => string | null;
  info?: string;
  ok?: (a: A) => string | null;
}

interface AR {
  urg: Urg;
  cond: (a: A, s: SMap) => boolean;
  text: string | ((a: A) => string);
  tag?: string;
}

interface TR {
  cond: (a: A) => boolean;
  text: string;
  fix?: string;
}

interface RB {
  name: string;
  body: string;
  note?: string;
}

interface Domain {
  id: string;
  n: string;
  b: string;
  am: string;
  ds: string;
  priority?: 'high' | 'medium';
  qs: Q[];
  ars: AR[];
  trs?: TR[];
  related?: RB[];
}

interface Scenario {
  id: string;
  name: string;
  icon: string;
  profile: string;
  active: boolean;
  color: string;
  domains: Domain[];
}

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════
const rel = (s: DS) => s === 'relevant' || s === 'check';
const CY = new Date().getFullYear();
const inMonths = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
};

// ═══════════════════════════════════════════════

// ═══════════════════════════════════════════════
// ENGINE TYPES (v3.0)
// ═══════════════════════════════════════════════
type CondOp = '==' | '!=' | '>=' | '<=' | '>' | '<';
interface BenefitRule {
  id: string; name: string; scenarioIds: string[]; domainId: string;
  confidenceBase: number; estimatedMonthly?: string;
  conditions: { field: string; operator: CondOp; value: any; label: string }[];
  explanation: string; action: string;
}
interface UnclaimedRule {
  existingDomain: string; existingLabel: string;
  potentialBenefits: { name: string; body: string; reason: string }[];
}
interface EvalResult {
  rule: BenefitRule; confidence: number; triggered: string[];
}
interface AuditEntry {
  ts: string; event: string; detail: string;
}
interface PilotTelemetry {
  scenarioId: string; benefitsDetected: number; recommendedActions: number;
  unclaimedFound: number; sessionDurationSec: number; domainsScanned: number;
}

const evalCond = (op: CondOp, actual: any, expected: any): boolean => {
  if (actual === undefined || actual === null || actual === '') return false;
  switch (op) {
    case '==': return actual === expected;
    case '!=': return actual !== expected;
    case '>=': return Number(actual) >= Number(expected);
    case '<=': return Number(actual) <= Number(expected);
    case '>': return Number(actual) > Number(expected);
    case '<': return Number(actual) < Number(expected);
    default: return false;
  }
};
const confLbl = (c: number) => c >= 0.85 ? 'גבוה' : c >= 0.7 ? 'בינוני' : 'נמוך';
const confClr = (c: number) => c >= 0.85 ? 'text-green-700 bg-green-100' : c >= 0.7 ? 'text-amber-700 bg-amber-100' : 'text-red-700 bg-red-100';
const confBar = (c: number) => c >= 0.85 ? 'bg-green-500' : c >= 0.7 ? 'bg-amber-500' : 'bg-red-500';
const fmtTs = () => new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

// SCENARIO DATA
// ═══════════════════════════════════════════════
const SCENARIOS: Scenario[] = [

  // ─────────────────────────────────────────────
  // 1. ילד נכה שנפטר
  // ─────────────────────────────────────────────
  {
    id: 'ddc',
    name: 'ילד נכה שנפטר',
    icon: '💙',
    profile: 'פרופיל 3 — הורה לילד עם מוגבלות',
    active: true,
    color: 'blue',
    domains: [
      {
        id: 'dg', n: 'מענק פטירה — קצבת ילד נכה', b: 'ביטוח לאומי',
        am: '10,514 ₪ (חד-פעמי)', priority: 'high',
        ds: 'מענק אוטומטי בגין פטירת ילד שקיבל קצבת ילד נכה',
        qs: [
          { id: 'dg1', text: 'האם חשבון הבנק שאליו שולמה הקצבה עדיין פעיל?', at: 'boolean' },
          { id: 'dg2', text: 'האם התקבל תשלום מלא עבור חודש הפטירה?', at: 'boolean' },
          {
            id: 'dg3', text: 'גיל הילד בפטירה', at: 'number',
            warn: (a) => a.dg3 > 18 ? 'יש לבחון חריג גיל — בדוק חוזר מנהל 1915' : null,
          },
        ],
        ars: [
          { urg: 'urgent', cond: (a, s) => rel(s.dg) && a.dg1 === true, text: 'מענק פטירה 10,514 ₪ — לוודא העברה אוטומטית לחשבון' },
          { urg: 'within30', cond: (a, s) => rel(s.dg) && a.dg1 === false, text: 'חשבון לא פעיל — לעדכן פרטי חשבון בנק לפני שחרור המענק' },
        ],
        trs: [
          { cond: (a) => a.dg3 > 18, text: 'חריג גיל — ילד מעל 18, זכאות שונה', fix: 'בדוק חוזר מנהל 1915 לפני פעולה' },
        ],
      },
      {
        id: 'dm', n: 'ניהול חובות וקיזוזים', b: 'ביטוח לאומי',
        am: 'משתנה', ds: 'בדיקת חובות קיימים והקפאת הליכי גבייה אוטומטיים',
        qs: [
          { id: 'dm1', text: 'האם קיים חוב בביטוח לאומי?', at: 'boolean', info: 'גבייה אוטומטית מוקפאת ל-60 יום מיום הפטירה' },
          { id: 'dm2', text: 'סכום החוב המשוער (₪)', at: 'number', showIf: (a) => a.dm1 === true },
          { id: 'dm3', text: 'בגין מה נוצר החוב?', at: 'text', showIf: (a) => a.dm1 === true },
          { id: 'dm4', text: 'האם המשפחה מעוניינת לקזז מתוך מענק הפטירה?', at: 'boolean', showIf: (a) => a.dm1 === true },
        ],
        ars: [
          { urg: 'within30', cond: (a, s) => rel(s.dm) && a.dm1 === true && a.dm4 !== true, text: 'חוב קיים — גבייה מוקפאת 60 יום. לתאם פגישה לסדר תשלומים' },
          { urg: 'urgent', cond: (a, s) => rel(s.dm) && a.dm1 === true && a.dm4 === true, text: 'קיזוז חוב מאושר — לבצע מתוך מענק הפטירה' },
        ],
        trs: [{ cond: (a) => a.dm1 === true && a.dm2 > 50000, text: 'חוב גבוה מ-50,000 ₪ — סיכון גבייה משמעותי', fix: 'לתאם טיפול עם מחלקת גבייה לפני כל פעולה אחרת' }],
      },
      {
        id: 'is', n: 'הבטחת הכנסה — שינוי הרכב משפחה', b: 'ביטוח לאומי',
        am: 'עד 3,500 ₪/חודש', ds: 'עדכון תחשיב בשל שינוי מספר הנפשות ובדיקת פטור רכב',
        qs: [
          { id: 'is1', text: 'האם ההורים מקבלים כיום קצבת הבטחת הכנסה?', at: 'boolean' },
          { id: 'is2', text: 'האם יש בבעלותם רכב ששוויו מעל 46,138 ₪?', at: 'boolean', showIf: (a) => a.is1 === true, info: 'פטור רכב מופעל אוטומטית ל-90 יום' },
          { id: 'is3', text: 'מספר הילדים הנותרים במשפחה', at: 'number' },
        ],
        ars: [
          {
            urg: 'within30', cond: (a, s) => rel(s.is) && a.is1 === true && a.is2 === true,
            text: () => `פטור רכב פעיל 90 יום — לעדכן תיק בחודש ${inMonths(3)}`,
          },
          { urg: 'within30', cond: (a, s) => rel(s.is) && a.is1 === true, text: (a) => `לעדכן תחשיב הבטחת הכנסה — ירידה מ-${(a.is3 || 0) + 1} ל-${a.is3 || 0} ילדים` },
        ],
      },
      {
        id: 'mo', n: 'ניידות — הלוואה עומדת', b: 'ביטוח לאומי — מחלקת ניידות',
        am: 'עשרות–מאות אלפי ₪', ds: 'טיפול בהלוואה עומדת, תקופת חסד 12 חודש',
        qs: [
          { id: 'mo1', text: 'האם קיימת הלוואת ניידות עומדת?', at: 'boolean' },
          {
            id: 'mo2', text: 'מתי נלקחה ההלוואה (שנה)?', at: 'number', showIf: (a) => a.mo1 === true,
            warn: (a) => a.mo2 && (CY - a.mo2 < 7) ? 'ההלוואה בתוך חלון 7 השנים — יש לטפל בתקופת חסד' : null,
          },
          {
            id: 'mo3', text: 'כוונת המשפחה לגבי הרכב:', at: 'select',
            opts: ['להמתין שנה', 'למכור כעת', 'לא ידוע'],
            info: 'תקופת חסד: 12 חודשים ללא ריבית. אחרי 14 חודשים — ריבית 6.41%',
          },
        ],
        ars: [
          {
            urg: 'planning', cond: (a, s) => rel(s.mo) && a.mo1 === true && a.mo2 && (CY - a.mo2 < 7) && a.mo3 === 'להמתין שנה',
            text: () => `הלוואה עומדת — תזכורת ל-12 חודשים ממועד הפטירה (עד ${inMonths(12)})`,
          },
          { urg: 'urgent', cond: (a, s) => rel(s.mo) && a.mo3 === 'למכור כעת', text: 'ליצור קשר עם מחלקת ניידות לקבלת שובר החזר — לפני מכירה' },
        ],
        trs: [{ cond: (a) => a.mo1 === true && a.mo2 && (CY - a.mo2 >= 7), text: 'הלוואה עומדת מעבר ל-7 שנים — ייתכן ריבית', fix: 'לבדוק עם מחלקת ניידות את יתרת החוב המעודכנת' }],
      },
      {
        id: 'cs', n: 'חיסכון לכל ילד', b: 'ביטוח לאומי + קופת גמל',
        am: 'צבירה חודשית × שנים', ds: 'הפסקת הפקדות לאחר 3 חודשים ומשיכת הכספים',
        qs: [
          { id: 'cs1', text: 'שם קופת הגמל / הבנק שמנהל את החיסכון:', at: 'text' },
          { id: 'cs2', text: 'האם המשפחה יודעת כיצד למשוך את הכספים?', at: 'boolean', info: 'הפקדות ימשכו 3 חודשים נוספים. לאחר מכן — משיכה עם טופס 5022' },
        ],
        ars: [
          { urg: 'within30', cond: (_, s) => rel(s.cs), text: (a) => `להדפיס טופס 5022 ולהגיש לקופה: ${a.cs1 || '(לא צוין)'}` },
        ],
      },
      {
        id: 'ub', n: 'אבטלה — התפטרות מוצדקת', b: 'ביטוח לאומי',
        am: 'עד 80% שכר, עד 6 חודשים', ds: 'בדיקת זכאות לדמי אבטלה ללא תקופת המתנה',
        qs: [
          { id: 'ub1', text: 'האם אחד ההורים הפסיק לעבוד בשנה האחרונה?', at: 'boolean' },
          { id: 'ub2', text: 'מה הסיבה לעזיבה?', at: 'select', opts: ['פיטורין', 'התפטרות בשל טיפול בילד', 'אחר'], showIf: (a) => a.ub1 === true },
          { id: 'ub3', text: 'האם יש לו/לה 12+ חודשי עבודה מתוך 18 האחרונים?', at: 'boolean', showIf: (a) => a.ub1 === true },
        ],
        ars: [
          { urg: 'urgent', cond: (a) => a.ub1 === true && a.ub2 === 'התפטרות בשל טיפול בילד' && a.ub3 === true, text: 'לפתוח תביעת אבטלה מיידית — התפטרות מוצדקת, ללא תקופת המתנה' },
          { urg: 'within30', cond: (a) => a.ub1 === true && a.ub2 === 'פיטורין' && a.ub3 === true, text: 'לפתוח תביעת אבטלה — פיטורין, לוודא ותק 12 חודש מתוך 18' },
        ],
      },
      {
        id: 'rh', n: 'שיקום מקצועי — תיקון 208', b: 'ביטוח לאומי',
        am: 'מימון לימודים + דמי מחיה', ds: 'זכאות להסבה מקצועית ומימון אקדמי להורים שכולים',
        qs: [
          { id: 'rh1', text: 'האם הורה צמצם/עזב עבודה בשל טיפול בילד?', at: 'boolean' },
          { id: 'rh2', text: 'האם ההורה מעוניין לבחון הסבה מקצועית?', at: 'boolean', info: 'הפנה לפקיד שיקום — זכאות לאבחון, מימון לימודים ודמי מחיה' },
        ],
        ars: [
          { urg: 'planning', cond: (a) => a.rh2 === true, text: 'להפנות לפקיד שיקום — לקבוע פגישת היכרות ואבחון' },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────
  // 2. קשיש/ה — הכנסה נמוכה
  // ─────────────────────────────────────────────
  {
    id: 'ep',
    name: 'קשיש/ה — הכנסה נמוכה',
    icon: '🏠',
    profile: 'פרופיל 1 — קשיש 67+ לבד, הכנסה נמוכה',
    active: false,
    color: 'green',
    domains: [
      {
        id: 'ep_oa', n: 'קצבת זקנה', b: 'ביטוח לאומי', priority: 'high',
        am: 'יחיד ~1,810 ₪ | זוג ~2,730 ₪/חודש',
        ds: 'קצבה בסיסית עם אפשרות לבונוס דחייה 5%/שנה',
        qs: [
          { id: 'ep_oa1', text: 'האם המבוטח מקבל כיום קצבת זקנה?', at: 'boolean' },
          {
            id: 'ep_oa2', text: 'גיל המבוטח:', at: 'number',
            warn: (a) => a.ep_oa2 && a.ep_oa2 >= 67 && a.ep_oa1 === false ? 'גיל זכאות — לא מגיש! לבדוק מיידית' : null,
          },
          { id: 'ep_oa3', text: 'מין:', at: 'select', opts: ['זכר', 'נקבה'] },
          {
            id: 'ep_oa4', text: 'האם דחה את הגשת הבקשה מעבר לגיל הזכאות?', at: 'boolean',
            info: 'בונוס דחייה: +5% לכל שנת דחייה. ניתן לצבור עד שנים רבות',
          },
        ],
        ars: [
          { urg: 'urgent', cond: (a, s) => rel(s.ep_oa) && a.ep_oa1 === false && a.ep_oa2 >= 67, text: 'לא מגיש קצבת זקנה בגיל זכאות — לפתוח תביעה מיידית! רטרואקטיביות מוגבלת' },
          { urg: 'planning', cond: (a, s) => rel(s.ep_oa) && a.ep_oa4 === true, text: (a) => `בונוס דחייה — לחשב ערך צבור לפי ${CY - (a.ep_oa2 - 67)} שנות דחייה (כ-${(CY - (a.ep_oa2 - 67)) * 5}%)` },
        ],
        trs: [
          { cond: (a) => a.ep_oa3 === 'נקבה' && a.ep_oa2 && a.ep_oa2 >= 62 && a.ep_oa2 <= 65, text: 'אישה 62–65 — גיל פרישה עולה בהדרגה עד 65 (2027)', fix: 'לבדוק גיל פרישה מדויק לפי שנת לידה בטבלת ביטוח לאומי' },
        ],
      },
      {
        id: 'ep_si', n: 'השלמת הכנסה לזקנה', b: 'ביטוח לאומי', priority: 'high',
        am: 'עד ~2,000 ₪/חודש נוסף',
        ds: 'שיעור מימוש 60% בלבד — פער קריטי! "מביש לבקש" — הגשה פרואקטיבית חיונית',
        qs: [
          { id: 'ep_si1', text: 'האם מקבל כיום השלמת הכנסה?', at: 'boolean' },
          { id: 'ep_si2', text: 'סך הכנסות חודשיות ברוטו (עבודה + פנסיה + נכסים) ₪:', at: 'number', info: 'הסף לזכאות: יחיד ~3,600 ₪ | זוג ~5,400 ₪ (לפי 2026)' },
          { id: 'ep_si3', text: 'מצב משפחתי:', at: 'select', opts: ['יחיד/ה', 'זוג'] },
          { id: 'ep_si4', text: 'האם בבעלותו נכסים (דירה נוספת, מניות)?', at: 'boolean' },
        ],
        ars: [
          {
            urg: 'urgent',
            cond: (a, s) => rel(s.ep_si) && a.ep_si1 === false && a.ep_si2 && (
              (a.ep_si3 === 'יחיד/ה' && a.ep_si2 < 3600) ||
              (a.ep_si3 === 'זוג' && a.ep_si2 < 5400)
            ),
            text: 'זכאי להשלמת הכנסה ולא מגיש! — לפתוח תביעה מיידית, רטרואקטיביות 12 חודש',
          },
        ],
        trs: [
          { cond: (a) => a.ep_si4 === true, text: 'בעלות על נכסים עשויה לפגוע בזכאות להשלמת הכנסה', fix: 'לבדוק שווי נכסים לפי נוסחת ביטוח לאומי לפני הגשה' },
        ],
        related: [
          { name: 'הנחת ארנונה', body: 'רשות מקומית', note: 'קשיש עם הכנסה נמוכה — עד 90% הנחה' },
          { name: 'הנחת חשמל', body: 'חברת חשמל', note: 'כ-400 ₪/שנה — לפנות לחברת חשמל' },
          { name: 'הנחת מים', body: 'רשות המים', note: 'הנחה לזכאי השלמת הכנסה' },
        ],
      },
      {
        id: 'ep_nc', n: 'גמלת סיעוד', b: 'ביטוח לאומי',
        am: 'רמה 1–4 | 4–16 שעות/שבוע',
        ds: 'מבחן תפקודי (לא רפואי!) — ADL + IADL + השגחה. 390,000 מקבלים, 415,000 הערכות/שנה',
        qs: [
          { id: 'ep_nc1', text: 'האם עבר הערכת סיעוד בעבר?', at: 'boolean' },
          { id: 'ep_nc2', text: 'האם יש קשיים בפעולות יומיום? (רחצה, לבישה, אכילה, ניידות)', at: 'boolean' },
          { id: 'ep_nc3', text: 'האם יש ירידה קוגניטיבית / דמנציה?', at: 'boolean', info: 'דמנציה — הצורך בהשגחה (supervision) מחושב גם הוא! לא רק ADL פיזי' },
          { id: 'ep_nc4', text: 'האם מעדיף גמלה בכסף או שירות?', at: 'select', opts: ['גמלה בכסף', 'שירות מטפל', 'לא ידוע'], info: '44.6% ברמה 1 בוחרים גמלה בכסף — לשקול לפי מצב' },
        ],
        ars: [
          { urg: 'urgent', cond: (a, s) => rel(s.ep_nc) && a.ep_nc1 === false && (a.ep_nc2 === true || a.ep_nc3 === true), text: 'לא עבר הערכת סיעוד — לפתוח תביעה מיידית! ניתן לתבוע 12 חודשים אחורה' },
          { urg: 'within30', cond: (a, s) => rel(s.ep_nc) && a.ep_nc1 === true && (a.ep_nc2 === true || a.ep_nc3 === true), text: 'לבדוק תאריך הערכה אחרונה — אם הידרדרות, לבקש "הגדלת גמלה" (לא להגיש מחדש!)' },
        ],
        trs: [
          { cond: (a) => a.ep_nc3 === true, text: 'דמנציה — מבחן ה-IADL וההשגחה קריטיים, לא רק ה-ADL הפיזי', fix: 'לתעד דפוסי השגחה ואירועי תפקוד בשפה תפקודית — לא רפואית בלבד' },
        ],
        related: [
          { name: 'הנחת ארנונה מסיעוד', body: 'רשות מקומית' },
          { name: 'הנחת תחבורה', body: 'תחבורה ציבורית' },
        ],
      },
      {
        id: 'ep_mo', n: 'ניידות', b: 'ביטוח לאומי',
        am: 'הלוואה / סיוע לרכב מותאם',
        ds: 'לבעלי קשיי ניידות — הלוואה עומדת לרכישת רכב, אם לא מנוצל',
        qs: [
          { id: 'ep_mo1', text: 'האם יש קשיי ניידות מוכחים?', at: 'boolean' },
          { id: 'ep_mo2', text: 'האם מקבל כיום סיוע ניידות מביטוח לאומי?', at: 'boolean' },
        ],
        ars: [
          { urg: 'planning', cond: (a, s) => rel(s.ep_mo) && a.ep_mo1 === true && a.ep_mo2 === false, text: 'לבדוק זכאות לניידות — לפנות למחלקת ניידות בסניף' },
        ],
      },
      {
        id: 'ep_ext', n: 'זכויות נלוות חוץ-ארגוניות', b: 'רשויות שונות',
        am: 'אלפי ₪/שנה בצבירה',
        ds: 'דומינו-אפקט: קצבת זקנה/סיעוד פותחת זכויות בגורמים חיצוניים',
        qs: [
          { id: 'ep_ext1', text: 'האם נבדקה הנחת ארנונה ברשות המקומית?', at: 'boolean' },
          { id: 'ep_ext2', text: 'האם נבדקה הנחת חשמל?', at: 'boolean' },
          { id: 'ep_ext3', text: 'האם נבדקה הנחת מים?', at: 'boolean' },
          { id: 'ep_ext4', text: 'האם הוגשה בקשה לסיוע שיכון (משרד הבינוי)?', at: 'boolean' },
        ],
        ars: [
          { urg: 'within30', cond: (a, s) => rel(s.ep_ext) && a.ep_ext1 === false, text: 'לפנות לרשות המקומית לבקשת הנחת ארנונה — קשיש עם הכנסה נמוכה' },
          { urg: 'within30', cond: (a, s) => rel(s.ep_ext) && a.ep_ext2 === false, text: 'לפנות לחברת חשמל לבקשת הנחה — ≈400 ₪/שנה' },
          { urg: 'within30', cond: (a, s) => rel(s.ep_ext) && a.ep_ext3 === false, text: 'לבדוק זכאות להנחת מים ברשות המקומית' },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────
  // 3. אלמן/ה
  // ─────────────────────────────────────────────
  {
    id: 'w',
    name: 'שכול — אלמן/ה',
    icon: '🕊️',
    profile: 'פרופיל 2 — אלמנה/אלמן 55–65',
    active: false,
    color: 'purple',
    domains: [
      {
        id: 'w_sur', n: 'קצבת שאירים', b: 'ביטוח לאומי', priority: 'high',
        am: 'אלמנה/אלמן ~1,838 ₪ | ילד שאר ~862 ₪/חודש',
        ds: 'פוטנציאל רטרואקטיביות 12 חודש! שיעור מימוש נמוך אצל אלמנות צעירות',
        qs: [
          { id: 'w_sur1', text: 'גיל האלמן/ה:', at: 'number' },
          { id: 'w_sur2', text: 'כמה שנים נמשך הנישואין?', at: 'number', info: 'נדרש ותק נישואין לפחות (תנאי לקצבת שאירים — נדרש אימות)' },
          { id: 'w_sur3', text: 'האם יש ילדים מתחת לגיל 18?', at: 'boolean' },
          { id: 'w_sur4', text: 'מתי נפטר בן/בת הזוג?', at: 'select', opts: ['פחות מ-3 חודשים', '3–12 חודשים', 'יותר מ-12 חודשים'] },
          { id: 'w_sur5', text: 'האם הוגשה תביעת שאירים?', at: 'boolean', warn: (a) => a.w_sur5 === false && a.w_sur4 === 'יותר מ-12 חודשים' ? 'פספוס רטרואקטיביות! מוגבל ל-12 חודש אחורה' : null },
        ],
        ars: [
          { urg: 'urgent', cond: (a, s) => rel(s.w_sur) && a.w_sur5 === false, text: 'תביעת שאירים לא הוגשה — לפתוח מיידית! רטרואקטיביות מוגבלת ל-12 חודש' },
          { urg: 'urgent', cond: (a, s) => rel(s.w_sur) && a.w_sur3 === true, text: 'יש ילדים — לכלול קצבת ילד שאר לכל ילד בנפרד (~862 ₪ לילד)' },
        ],
        trs: [
          { cond: (a) => a.w_sur4 === 'יותר מ-12 חודשים' && a.w_sur5 === false, text: 'פספוס רטרואקטיביות — יותר מ-12 חודש ללא הגשה', fix: 'להגיש עכשיו — ניתן לקבל לכל היותר 12 חודשים אחורה' },
          { cond: (a) => a.w_sur1 < 40, text: 'אלמן/ה צעיר/ה — בחר/י שאירים מול שיקום מקצועי בזהירות', fix: 'בחירת שאירים עשויה להגביל זכויות שיקום עתידיות — להתייעץ' },
        ],
      },
      {
        id: 'w_inc', n: 'הבטחת הכנסה', b: 'ביטוח לאומי',
        am: 'לפי מצב משפחתי + ילדים',
        ds: 'משלים את קצבת השאירים לרמת הכנסה מינימלית',
        qs: [
          { id: 'w_inc1', text: 'מה ההכנסה החודשית הנוכחית (ברוטו)?', at: 'number' },
          { id: 'w_inc2', text: 'האם מועסק/ת כיום?', at: 'boolean' },
        ],
        ars: [
          { urg: 'within30', cond: (a, s) => rel(s.w_inc) && a.w_inc1 < 4000 && a.w_inc2 === false, text: 'לבדוק זכאות להבטחת הכנסה — הכנסה נמוכה + לא מועסק' },
        ],
      },
      {
        id: 'w_dis', n: 'נכות כללית (אם רלוונטי)', b: 'ביטוח לאומי',
        am: '2,718–4,711 ₪/חודש',
        ds: 'אם יש מוגבלות — ניתן לשלב עם שאירים (לבדוק)',
        qs: [
          { id: 'w_dis1', text: 'האם לאלמן/ה יש נכות מוכרת?', at: 'boolean' },
          { id: 'w_dis2', text: 'אחוז הנכות (אם ידוע):', at: 'number', showIf: (a) => a.w_dis1 === true },
        ],
        ars: [
          { urg: 'planning', cond: (a, s) => rel(s.w_dis) && a.w_dis1 === true && a.w_dis2 >= 60, text: 'לבדוק שילוב קצבת נכות + שאירים — עשוי לשפר את הסכום הכולל' },
        ],
      },
      {
        id: 'w_voc', n: 'שיקום מקצועי', b: 'ביטוח לאומי',
        am: 'מימון לימודים + דמי מחיה',
        ds: 'זכאות לאלמן/ה שהפסיק לעבוד או שינה מסגרת תעסוקתית',
        qs: [
          { id: 'w_voc1', text: 'האם השתנה מצב תעסוקתי בשל האובדן?', at: 'boolean' },
          { id: 'w_voc2', text: 'האם מעוניין/ת לבחון הסבה מקצועית?', at: 'boolean' },
        ],
        ars: [
          { urg: 'planning', cond: (a, s) => rel(s.w_voc) && a.w_voc2 === true, text: 'להפנות לפקיד שיקום — לבדוק זכאות תיקון 208 (אלמן/ה)' },
        ],
        trs: [
          { cond: (a) => a.w_voc2 === true, text: 'בחירה מוקדמת בשאירים לפני בחינת שיקום עשויה לפגוע בזכויות', fix: 'לשקול ולהתייעץ עם פקיד שיקום לפני הגשת שאירים באלמנות צעירה' },
        ],
      },
      {
        id: 'w_ext', n: 'זכויות נלוות + מענק פטירה', b: 'גורמים שונים',
        am: 'מענק 10,514 ₪ + זכויות נלוות',
        ds: 'סל מלא בגין אירוע פטירה — יש לסרוק את כל הזכויות',
        qs: [
          { id: 'w_ext1', text: 'האם הוגשה בקשה למענק פטירה?', at: 'boolean' },
          { id: 'w_ext2', text: 'האם היה חוב בביטוח לאומי למנוח?', at: 'boolean', info: 'הקפאת גביית חובות: 60 יום' },
          { id: 'w_ext3', text: 'האם יש הלוואת ניידות?', at: 'boolean', info: 'תקופת חסד: 12 חודשים' },
          { id: 'w_ext4', text: 'האם בוטלה קצבת ילדים בשל פטירה?', at: 'boolean' },
        ],
        ars: [
          { urg: 'urgent', cond: (a, s) => rel(s.w_ext) && a.w_ext1 === false, text: 'לפתוח תביעת מענק פטירה — 10,514 ₪ חד-פעמי' },
          { urg: 'within30', cond: (a, s) => rel(s.w_ext) && a.w_ext2 === true, text: 'חוב קיים — גבייה מוקפאת 60 יום מיום הפטירה' },
          { urg: 'within30', cond: (a, s) => rel(s.w_ext) && a.w_ext3 === true, text: 'הלוואת ניידות — תקופת חסד 12 חודש ללא ריבית' },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────
  // 4. נכות כללית
  // ─────────────────────────────────────────────
  {
    id: 'gd',
    name: 'נכות כללית',
    icon: '♿',
    profile: 'פרופיל 5 — נכות כללית 60%+',
    active: true,
    color: 'orange',
    domains: [
      {
        id: 'gd_dis', n: 'קצבת נכות כללית', b: 'ביטוח לאומי', priority: 'high',
        am: '100%: 4,711 ₪ | 74%: 3,211 ₪ | 65%: 2,894 ₪ | 60%: 2,718 ₪',
        ds: 'קצבה לפי אחוז נכות. מחייב הגשה — לא אוטומטי',
        qs: [
          { id: 'gd_dis1', text: 'אחוז הנכות המוכרת:', at: 'number', warn: (a) => a.gd_dis1 < 60 ? 'נכות מתחת ל-60% — אין זכאות לקצבת נכות כללית' : null },
          { id: 'gd_dis2', text: 'האם מקבל כיום קצבת נכות?', at: 'boolean' },
          { id: 'gd_dis3', text: 'גיל המבוטח:', at: 'number' },
          {
            id: 'gd_dis4', text: 'האם בגיל עבודה (מתחת לגיל פרישה)?', at: 'boolean',
            info: 'גיל פרישה: גברים 67 | נשים 62–65. מתחת לגיל פרישה — סכומים גבוהים יותר',
          },
          { id: 'gd_dis5', text: 'מה ההכנסה החודשית מעבודה (₪)?', at: 'number' },
        ],
        ars: [
          { urg: 'urgent', cond: (a, s) => rel(s.gd_dis) && a.gd_dis1 >= 60 && a.gd_dis2 === false, text: 'זכאי לקצבת נכות ולא מגיש! — לפתוח תביעה מיידית' },
          { urg: 'urgent', cond: (a, s) => rel(s.gd_dis) && a.gd_dis3 >= 67 && a.gd_dis2 === true, text: 'הגיע לגיל פרישה — לבדוק: מה גבוה יותר, זקנה או נכות? מעבר ללא פגיעה בסכום' },
        ],
        trs: [
          { cond: (a) => a.gd_dis5 > 0, text: 'הכנסה מעבודה עשויה להשפיע על גובה הקצבה', fix: 'לחשב "נקודת שבירה" — מאיזה שכר אבדן זכויות נלוות עולה על הרווח' },
          { cond: (a) => a.gd_dis3 < 67 && a.gd_dis3 >= 64, text: 'קרוב לגיל פרישה — בדוק מה גבוה יותר: נכות מול זקנה', fix: 'לחשב ערך כולל (סכום × תוחלת חיים + זכויות נלוות) לכל אפשרות' },
        ],
      },
      {
        id: 'gd_sp', n: 'שירותים מיוחדים (שר"מ)', b: 'ביטוח לאומי', priority: 'high',
        am: 'תוספת משמעותית לקצבה',
        ds: 'לא אוטומטי! פחות מ-30% מהזכאים ממשים. מחייב הגשה נפרדת.',
        qs: [
          { id: 'gd_sp1', text: 'האם מקבל כיום שירותים מיוחדים (שר"מ)?', at: 'boolean', info: 'שר"מ = תוספת לקצבה עבור צורך בעזרה מאדם אחר. לא ניתן אוטומטית!' },
          { id: 'gd_sp2', text: 'האם המבוטח זקוק לעזרה של אדם אחר בפעולות יומיום?', at: 'boolean' },
          { id: 'gd_sp3', text: 'האם הוגשה אי פעם בקשה לשר"מ?', at: 'boolean' },
        ],
        ars: [
          { urg: 'urgent', cond: (a, s) => rel(s.gd_sp) && a.gd_sp2 === true && a.gd_sp1 === false, text: 'זכאי לשר"מ ולא מקבל! — לפתוח תביעה נפרדת מיידית (פחות מ-30% ממשים)' },
        ],
      },
      {
        id: 'gd_mo', n: 'ניידות', b: 'ביטוח לאומי',
        am: 'הלוואה עומדת + סיוע רכב',
        ds: 'לנכים עם קשיי ניידות — נוצל פחות מ-30% מהזכאים',
        qs: [
          { id: 'gd_mo1', text: 'האם יש קשיי ניידות בשל הנכות?', at: 'boolean' },
          { id: 'gd_mo2', text: 'האם מקבל כיום תמיכת ניידות?', at: 'boolean' },
        ],
        ars: [
          { urg: 'planning', cond: (a, s) => rel(s.gd_mo) && a.gd_mo1 === true && a.gd_mo2 === false, text: 'לבדוק זכאות ניידות — נוצל פחות מ-30%, לפנות למחלקת ניידות' },
        ],
      },
      {
        id: 'gd_voc', n: 'שיקום מקצועי', b: 'ביטוח לאומי',
        am: 'מימון לימודים + דמי מחיה',
        ds: 'זכאות לנכות כללית — נוצל פחות מ-30% מהזכאים',
        qs: [
          { id: 'gd_voc1', text: 'האם הנכות משפיעה על כושר העבודה?', at: 'boolean' },
          { id: 'gd_voc2', text: 'האם מעוניין לשקול הסבה מקצועית?', at: 'boolean' },
        ],
        ars: [
          { urg: 'planning', cond: (a, s) => rel(s.gd_voc) && a.gd_voc2 === true, text: 'להפנות לפקיד שיקום — זכאות להסבה מקצועית ומימון לימודים' },
        ],
      },
      {
        id: 'gd_ext', n: 'זכויות נלוות (דומינו-אפקט)', b: 'גורמים שונים',
        am: 'עשרות אלפי ₪/שנה בצבירה',
        ds: 'נכות 100%: פטור מס הכנסה + ביטוח רכב + ארנונה. הפער בנלוות = הפער בפנימיות',
        qs: [
          { id: 'gd_ext1', text: 'אחוז נכות מוכרת (לנלוות):', at: 'number' },
          { id: 'gd_ext2', text: 'האם מגיש/ה טופס 127 לפטור/הנחה ממס הכנסה?', at: 'boolean' },
          { id: 'gd_ext3', text: 'האם בדק הנחת ביטוח רכב?', at: 'boolean' },
          { id: 'gd_ext4', text: 'האם בדק הנחת ארנונה?', at: 'boolean' },
        ],
        ars: [
          { urg: 'within30', cond: (a, s) => rel(s.gd_ext) && a.gd_ext1 >= 100 && a.gd_ext2 === false, text: 'נכות 100% — פטור מלא ממס הכנסה (טופס 127). לפנות לפקיד שומה' },
          { urg: 'within30', cond: (a, s) => rel(s.gd_ext) && a.gd_ext3 === false, text: 'לבדוק הנחת ביטוח רכב בגין נכות — פנה לחברת הביטוח' },
          { urg: 'within30', cond: (a, s) => rel(s.gd_ext) && a.gd_ext4 === false, text: 'לפנות לרשות המקומית לבקשת הנחת ארנונה בגין נכות' },
        ],
        related: [
          { name: 'פטור מס הכנסה (סעיף 9(5))', body: 'רשות המסים', note: 'נכות 100% — פטור מלא' },
          { name: 'הנחת ביטוח רכב', body: 'חברות ביטוח', note: 'הנחה משמעותית לנכים' },
          { name: 'הנחת ארנונה', body: 'רשות מקומית', note: 'עד 70% הנחה' },
          { name: 'קרן השתלמות', body: 'מעסיק', note: 'הפקדה מוגברת לעובד עם נכות' },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────
  // 5. הורה לילד נכה (חי)
  // ─────────────────────────────────────────────
  {
    id: 'hc',
    name: 'הורה לילד נכה',
    icon: '👨‍👩‍👧',
    profile: 'פרופיל 3 — הורה לילד עם מוגבלות',
    active: true,
    color: 'teal',
    domains: [
      {
        id: 'hc_dis', n: 'קצבת ילד נכה', b: 'ביטוח לאומי', priority: 'high',
        am: 'לפי אחוז מגבלה וגיל — עד ~3,400 ₪/חודש',
        ds: 'מגיל 91 יום עד 18. אחוז נכות ≠ אחוז קצבה מקסימלי — יש מדרגות',
        qs: [
          { id: 'hc_dis1', text: 'גיל הילד:', at: 'number', warn: (a) => a.hc_dis1 >= 18 ? 'גיל 18 — צריך להגיש לנכות כללית! לא אוטומטי!' : a.hc_dis1 < 0.25 ? 'מתחת ל-91 יום — עדיין לא ניתן להגיש' : null },
          { id: 'hc_dis2', text: 'אחוז נכות מוכרת:', at: 'number' },
          { id: 'hc_dis3', text: 'האם מקבל כיום קצבת ילד נכה?', at: 'boolean' },
          { id: 'hc_dis4', text: 'האם חל שינוי בתפקוד הילד לאחרונה?', at: 'boolean', info: 'הידרדרות = זכות לבקש "הגדלת קצבה" — לא להגיש מחדש' },
        ],
        ars: [
          { urg: 'urgent', cond: (a, s) => rel(s.hc_dis) && a.hc_dis3 === false && a.hc_dis1 >= 0.25 && a.hc_dis1 < 18, text: 'לא מגיש קצבת ילד נכה — לפתוח תביעה מיידית' },
          { urg: 'urgent', cond: (a, s) => rel(s.hc_dis) && a.hc_dis1 >= 17, text: 'גיל 17–18 — להגיש תביעת נכות כללית לפני גיל 18! אינו אוטומטי' },
          { urg: 'within30', cond: (a, s) => rel(s.hc_dis) && a.hc_dis4 === true, text: 'הידרדרות תפקודית — לבקש "הגדלת קצבה" (לא הגשה מחדש!)' },
        ],
        trs: [
          { cond: (a) => a.hc_dis1 >= 17 && a.hc_dis1 < 19, text: 'מעבר גיל 18 — לא אוטומטי! עלול לאבד קצבה בין 18 לאישור', fix: 'להגיש נכות כללית לפחות 6 חודשים לפני גיל 18' },
        ],
      },
      {
        id: 'hc_ch', n: 'קצבת ילדים', b: 'ביטוח לאומי',
        am: '~170 ₪/חודש לילד',
        ds: 'מצטברת עם קצבת ילד נכה — שתיהן ניתן לקבל במקביל',
        qs: [
          { id: 'hc_ch1', text: 'האם מקבלים קצבת ילדים עבור הילד?', at: 'boolean', info: 'ניתן לקבל גם קצבת ילד נכה וגם קצבת ילדים — לא מנוגדות!' },
        ],
        ars: [
          { urg: 'within30', cond: (a, s) => rel(s.hc_ch) && a.hc_ch1 === false, text: 'לא מקבלים קצבת ילדים — לבדוק ולהגיש (מצטברת עם ילד נכה)' },
        ],
      },
      {
        id: 'hc_wel', n: 'סל שירותים — משרד הרווחה', b: 'משרד הרווחה',
        am: 'שעות טיפול + מסגרות', priority: 'high',
        ds: '40% מהמשפחות לא ממצות! אינו מביטוח לאומי — פנייה לעו"ס ברשות המקומית',
        qs: [
          { id: 'hc_wel1', text: 'האם ממצים כיום סל שירותים ממשרד הרווחה?', at: 'boolean', info: '40% מהמשפחות לא ממצות את הסל — פנה לעובד סוציאלי ברשות המקומית' },
          { id: 'hc_wel2', text: 'האם ידועות המסגרות המגיעות לילד?', at: 'boolean' },
        ],
        ars: [
          { urg: 'within30', cond: (a, s) => rel(s.hc_wel) && a.hc_wel1 === false, text: 'לא ממצים סל שירותים ממשרד הרווחה — להפנות לעו"ס ברשות המקומית מיידית' },
        ],
      },
      {
        id: 'hc_18', n: 'מעבר גיל 18 — נכות כללית', b: 'ביטוח לאומי',
        am: 'עד 4,711 ₪/חודש', priority: 'high',
        ds: 'המעבר לא אוטומטי! ילד שלא הגיש — עלול לאבד קצבה לתקופה ארוכה',
        qs: [
          { id: 'hc_18_1', text: 'גיל הילד הנוכחי:', at: 'number', warn: (a) => a.hc_18_1 >= 17 && a.hc_18_1 < 19 ? 'גיל קריטי! — חייב הגשה פרואקטיבית לנכות כללית לפני גיל 18' : null },
          { id: 'hc_18_2', text: 'האם הוגשה תביעת נכות כללית?', at: 'boolean' },
        ],
        ars: [
          { urg: 'urgent', cond: (a, s) => rel(s.hc_18) && a.hc_18_1 >= 16 && a.hc_18_2 === false, text: 'גיל 16+ — להגיש תביעת נכות כללית עוד היום! אינו אוטומטי' },
        ],
        trs: [
          { cond: (a) => a.hc_18_1 >= 18 && a.hc_18_2 === false, text: 'עבר גיל 18 ולא הגיש — עלול להיות ללא קצבה!', fix: 'להגיש נכות כללית מיידית — אין רטרואקטיביות לפני הגשה' },
        ],
      },
      {
        id: 'hc_ext', n: 'זכויות נלוות — דומינו-אפקט', b: 'גורמים שונים',
        am: 'אלפי ₪/שנה',
        ds: 'ילד נכה פותח זכויות ארנונה, חשמל, מים, מס הכנסה 6090, שיכון ועוד',
        qs: [
          { id: 'hc_ext1', text: 'האם ניצלו הנחת ארנונה בגין ילד נכה?', at: 'boolean' },
          { id: 'hc_ext2', text: 'האם הוגש טופס 127 לנקודות זיכוי מס (סעיף 6090)?', at: 'boolean' },
          { id: 'hc_ext3', text: 'האם בדקו סיוע שיכון ממשרד הבינוי?', at: 'boolean' },
        ],
        ars: [
          { urg: 'within30', cond: (a, s) => rel(s.hc_ext) && a.hc_ext1 === false, text: 'לפנות לרשות המקומית לבקשת הנחת ארנונה בגין ילד נכה' },
          { urg: 'within30', cond: (a, s) => rel(s.hc_ext) && a.hc_ext2 === false, text: 'לפנות לפקיד שומה להגשת טופס 127 — נקודות זיכוי מס (סעיף 6090)' },
        ],
        related: [
          { name: 'הנחת ארנונה', body: 'רשות מקומית', note: 'בגין ילד נכה בבית' },
          { name: 'הנחת חשמל', body: 'חברת חשמל', note: 'לבעלי ילד נכה' },
          { name: 'הנחת מים', body: 'רשות המים' },
          { name: 'נקודות זיכוי מס (6090)', body: 'רשות המסים', note: 'הורה לילד נכה' },
          { name: 'קרן השתלמות מוגברת', body: 'מעסיק', note: 'לבדוק' },
          { name: 'סיוע שיכון', body: 'משרד הבינוי', note: 'עדיפות לדיור ציבורי' },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────
  // 6. פיטורין / אבטלה
  // ─────────────────────────────────────────────
  {
    id: 'u',
    name: 'פיטורין / אבטלה',
    icon: '💼',
    profile: 'פרופיל 4 — עובד שפוטר/נפגע בעבודה',
    active: false,
    color: 'red',
    domains: [
      {
        id: 'u_unemp', n: 'דמי אבטלה', b: 'ביטוח לאומי', priority: 'high',
        am: 'עד 80% שכר, עד 6 חודשים',
        ds: 'תנאים: 12 חודשי עבודה מתוך 18 האחרונים. התפטרות מוצדקת — ללא המתנה',
        qs: [
          { id: 'u_unemp1', text: 'סיבת עזיבת העבודה:', at: 'select', opts: ['פיטורין', 'התפטרות מוצדקת (טיפול בבן משפחה)', 'התפטרות מוצדקת (סיבה אחרת)', 'התפטרות רגילה'] },
          { id: 'u_unemp2', text: 'ותק: מספר חודשי עבודה מתוך 18 האחרונים:', at: 'number', warn: (a) => a.u_unemp2 < 12 ? 'פחות מ-12 חודשים — ייתכן שאין זכאות לאבטלה' : null },
          { id: 'u_unemp3', text: 'האם הוגשה תביעת אבטלה?', at: 'boolean' },
          { id: 'u_unemp4', text: 'שכר חודשי ממוצע ב-3 חודשים האחרונים (₪):', at: 'number' },
        ],
        ars: [
          { urg: 'urgent', cond: (a, s) => rel(s.u_unemp) && a.u_unemp1 === 'פיטורין' && a.u_unemp2 >= 12 && a.u_unemp3 === false, text: 'לפתוח תביעת אבטלה מיידית! 60 יום מחוסר עבודה — לא לאחר' },
          { urg: 'urgent', cond: (a, s) => rel(s.u_unemp) && (a.u_unemp1 === 'התפטרות מוצדקת (טיפול בבן משפחה)' || a.u_unemp1 === 'התפטרות מוצדקת (סיבה אחרת)') && a.u_unemp2 >= 12, text: 'התפטרות מוצדקת — זכאי ללא תקופת המתנה! לפתוח תביעה מיידית' },
          { urg: 'within30', cond: (a, s) => rel(s.u_unemp) && a.u_unemp1 === 'התפטרות רגילה', text: 'התפטרות רגילה — תקופת המתנה 90 יום לאחר מכן דמי אבטלה' },
        ],
        trs: [
          { cond: (a) => a.u_unemp3 === false && a.u_unemp1 !== 'התפטרות רגילה', text: 'כל יום ללא הגשה = יום ללא תשלום (לא רטרואקטיבי!)', fix: 'להגיש תביעה בהקדם האפשרי — היום אם אפשר' },
        ],
      },
      {
        id: 'u_inc', n: 'הבטחת הכנסה (חלופה לאבטלה)', b: 'ביטוח לאומי',
        am: 'לפי מצב משפחתי',
        ds: 'כשלא עומד בתנאי אבטלה — בדוק הבטחת הכנסה. לא ניתן לקבל שניהם',
        qs: [
          { id: 'u_inc1', text: 'האם הכנסה חודשית מתחת ל-5,000 ₪?', at: 'boolean' },
          { id: 'u_inc2', text: 'מצב משפחתי:', at: 'select', opts: ['יחיד/ה', 'זוג ללא ילדים', 'הורה + ילדים'] },
        ],
        ars: [
          { urg: 'within30', cond: (a, s) => rel(s.u_inc) && a.u_inc1 === true, text: 'לבדוק זכאות להבטחת הכנסה — אם אינו זכאי לאבטלה' },
        ],
        trs: [
          { cond: (a) => a.u_unemp2 >= 12, text: 'מי שזכאי לאבטלה — לא יקבל הבטחת הכנסה במקביל', fix: 'להגיש אבטלה קודם. הבטחת הכנסה רק אם אינו זכאי לאבטלה' },
        ],
      },
      {
        id: 'u_inj', n: 'נפגע עבודה', b: 'ביטוח לאומי',
        am: 'לפי שכר + נכות תאונה',
        ds: 'נפרד לחלוטין מאבטלה! ניתן לקבל שניהם בנסיבות מסוימות',
        qs: [
          { id: 'u_inj1', text: 'האם אירעה תאונת עבודה / מחלת מקצוע?', at: 'boolean' },
          { id: 'u_inj2', text: 'האם הוגשה תביעת נפגע עבודה?', at: 'boolean', showIf: (a) => a.u_inj1 === true },
        ],
        ars: [
          { urg: 'urgent', cond: (a, s) => rel(s.u_inj) && a.u_inj1 === true && a.u_inj2 === false, text: 'תאונת עבודה ולא הוגשה תביעה! — לפתוח תביעת נפגע עבודה מיידית (נפרדת מאבטלה)' },
        ],
      },
      {
        id: 'u_voc', n: 'שיקום מקצועי', b: 'ביטוח לאומי',
        am: 'מימון לימודים + דמי מחיה',
        ds: 'לנפגעי עבודה ונכים — מימון הסבה מקצועית',
        qs: [
          { id: 'u_voc1', text: 'האם הפיטורין / האובדן קשורים לבעיה רפואית?', at: 'boolean' },
          { id: 'u_voc2', text: 'האם מעוניין בהסבה מקצועית?', at: 'boolean' },
        ],
        ars: [
          { urg: 'planning', cond: (a, s) => rel(s.u_voc) && a.u_voc1 === true && a.u_voc2 === true, text: 'לפנות לפקיד שיקום — זכאי לאבחון, מימון לימודים ודמי מחיה' },
        ],
      },
    ],
  },
];

// ═══════════════════════════════════════════════

// BENEFITS RULES ENGINE DATA
const BENEFITS_RULES: BenefitRule[] = [
  { id: 'br_death_grant', name: 'מענק פטירה', scenarioIds: ['ddc'], domainId: 'dg', confidenceBase: 0.92, estimatedMonthly: '10,514 ₪ (חד-פעמי)',
    conditions: [{ field: 'dg1', operator: '==', value: true, label: 'חשבון בנק פעיל' }, { field: 'dg2', operator: '==', value: true, label: 'תשלום מלא התקבל' }],
    explanation: 'מענק אוטומטי בגין פטירת ילד נכה', action: 'לוודא העברה אוטומטית לחשבון' },
  { id: 'br_debt_freeze', name: 'הקפאת גבייה', scenarioIds: ['ddc'], domainId: 'dm', confidenceBase: 0.85,
    conditions: [{ field: 'dm1', operator: '==', value: true, label: 'קיים חוב' }],
    explanation: 'גבייה אוטומטית מוקפאת 60 יום', action: 'לתאם פגישה לסדר תשלומים' },
  { id: 'br_income_supp', name: 'הבטחת הכנסה', scenarioIds: ['ddc'], domainId: 'is', confidenceBase: 0.78, estimatedMonthly: 'עד 3,500 ₪/חודש',
    conditions: [{ field: 'is1', operator: '==', value: true, label: 'מקבל הבטחת הכנסה' }],
    explanation: 'שינוי הרכב משפחה משפיע על תחשיב', action: 'לעדכן תחשיב הבטחת הכנסה' },
  { id: 'br_mobility', name: 'ניידות — הלוואה עומדת', scenarioIds: ['ddc'], domainId: 'mo', confidenceBase: 0.75,
    conditions: [{ field: 'mo1', operator: '==', value: true, label: 'קיימת הלוואה עומדת' }],
    explanation: 'טיפול בהלוואה עומדת — תקופת חסד 12 חודש', action: 'לבדוק תקופת חסד ואפשרויות' },
  { id: 'br_child_save', name: 'חיסכון לכל ילד', scenarioIds: ['ddc'], domainId: 'cs', confidenceBase: 0.88,
    conditions: [], explanation: 'הפקדות נמשכות 3 חודשים נוספים', action: 'להדפיס טופס 5022 ולהגיש לקופה' },
  { id: 'br_unemployment', name: 'אבטלה — התפטרות מוצדקת', scenarioIds: ['ddc'], domainId: 'ub', confidenceBase: 0.72, estimatedMonthly: 'עד 80% שכר',
    conditions: [{ field: 'ub1', operator: '==', value: true, label: 'הפסיק לעבוד' }, { field: 'ub3', operator: '==', value: true, label: '12+ חודשי עבודה' }],
    explanation: 'זכאות לדמי אבטלה ללא תקופת המתנה', action: 'לפתוח תביעת אבטלה מיידית' },
  { id: 'br_rehab', name: 'שיקום מקצועי — תיקון 208', scenarioIds: ['ddc'], domainId: 'rh', confidenceBase: 0.70,
    conditions: [{ field: 'rh2', operator: '==', value: true, label: 'מעוניין בהסבה' }],
    explanation: 'זכאות להסבה מקצועית ומימון אקדמי', action: 'להפנות לפקיד שיקום' },
  { id: 'br_old_age', name: 'קצבת זקנה', scenarioIds: ['ep'], domainId: 'ep_oa', confidenceBase: 0.90, estimatedMonthly: '~1,810 ₪/חודש',
    conditions: [{ field: 'ep_oa2', operator: '>=', value: 67, label: 'גיל 67+' }, { field: 'ep_oa1', operator: '==', value: false, label: 'לא מקבל קצבה' }],
    explanation: 'גיל זכאות ולא מגיש — פספוס רטרואקטיביות', action: 'לפתוח תביעה מיידית' },
  { id: 'br_income_supp_elderly', name: 'השלמת הכנסה לזקנה', scenarioIds: ['ep'], domainId: 'ep_si', confidenceBase: 0.85, estimatedMonthly: '~2,000 ₪/חודש',
    conditions: [{ field: 'ep_si1', operator: '==', value: false, label: 'לא מקבל השלמה' }, { field: 'ep_si2', operator: '<', value: 3600, label: 'הכנסה מתחת לסף' }],
    explanation: 'שיעור מימוש 60% בלבד — פער קריטי', action: 'לפתוח תביעה מיידית' },
  { id: 'br_nursing', name: 'גמלת סיעוד', scenarioIds: ['ep'], domainId: 'ep_nc', confidenceBase: 0.80, estimatedMonthly: '4–16 שעות/שבוע',
    conditions: [{ field: 'ep_nc2', operator: '==', value: true, label: 'קשיים בפעולות יומיום' }],
    explanation: 'מבחן תפקודי — לא רפואי', action: 'לפתוח תביעת סיעוד' },
  { id: 'br_survivors', name: 'קצבת שאירים', scenarioIds: ['w'], domainId: 'w_sur', confidenceBase: 0.88, estimatedMonthly: '~1,838 ₪/חודש',
    conditions: [{ field: 'w_sur5', operator: '==', value: false, label: 'לא הוגשה תביעה' }],
    explanation: 'רטרואקטיביות מוגבלת ל-12 חודש', action: 'לפתוח תביעת שאירים מיידית' },
  { id: 'br_gen_disability', name: 'קצבת נכות כללית', scenarioIds: ['gd'], domainId: 'gd_dis', confidenceBase: 0.87, estimatedMonthly: '2,718–4,711 ₪/חודש',
    conditions: [{ field: 'gd_dis1', operator: '>=', value: 60, label: 'נכות 60%+' }, { field: 'gd_dis2', operator: '==', value: false, label: 'לא מקבל קצבה' }],
    explanation: 'זכאי לקצבת נכות ולא מגיש', action: 'לפתוח תביעה מיידית' },
  { id: 'br_special_services', name: 'שירותים מיוחדים', scenarioIds: ['gd'], domainId: 'gd_sp', confidenceBase: 0.82,
    conditions: [{ field: 'gd_sp2', operator: '==', value: true, label: 'זקוק לעזרה' }, { field: 'gd_sp1', operator: '==', value: false, label: 'לא מקבל שירותים מיוחדים' }],
    explanation: 'פחות מ-30% ממשים — פער קריטי', action: 'לפתוח תביעה נפרדת מיידית' },
  { id: 'br_child_disability', name: 'קצבת ילד נכה', scenarioIds: ['hc'], domainId: 'hc_dis', confidenceBase: 0.85, estimatedMonthly: 'עד ~3,400 ₪/חודש',
    conditions: [{ field: 'hc_dis3', operator: '==', value: false, label: 'לא מקבל קצבה' }],
    explanation: 'ילד עם מוגבלות לא ממצה קצבה', action: 'לפתוח תביעה מיידית' },
  { id: 'br_age18_transition', name: 'מעבר גיל 18', scenarioIds: ['hc'], domainId: 'hc_18', confidenceBase: 0.92,
    conditions: [{ field: 'hc_18_1', operator: '>=', value: 16, label: 'גיל 16+' }, { field: 'hc_18_2', operator: '==', value: false, label: 'לא הוגשה נכות כללית' }],
    explanation: 'מעבר לא אוטומטי — עלול לאבד קצבה', action: 'להגיש נכות כללית לפני גיל 18' },
  { id: 'br_unemp', name: 'דמי אבטלה', scenarioIds: ['u'], domainId: 'u_unemp', confidenceBase: 0.83, estimatedMonthly: 'עד 80% שכר',
    conditions: [{ field: 'u_unemp2', operator: '>=', value: 12, label: '12+ חודשי עבודה' }, { field: 'u_unemp3', operator: '==', value: false, label: 'לא הוגשה תביעה' }],
    explanation: 'זכאי לדמי אבטלה ולא מגיש', action: 'לפתוח תביעה מיידית' },
  { id: 'br_work_injury', name: 'נפגע עבודה', scenarioIds: ['u'], domainId: 'u_inj', confidenceBase: 0.90,
    conditions: [{ field: 'u_inj1', operator: '==', value: true, label: 'אירעה תאונת עבודה' }, { field: 'u_inj2', operator: '==', value: false, label: 'לא הוגשה תביעה' }],
    explanation: 'תאונת עבודה ללא תביעה — נפרד מאבטלה', action: 'לפתוח תביעת נפגע עבודה מיידית' },
];

// UNCLAIMED RIGHTS MATRIX
const UNCLAIMED_MATRIX: UnclaimedRule[] = [
  {
    existingDomain: 'gd_dis',
    existingLabel: 'קצבת נכות כללית',
    potentialBenefits: [
      { name: 'שירותים מיוחדים (שר"מ)', body: 'ביטוח לאומי', reason: 'פחות מ-30% ממשים' },
      { name: 'הנחת ארנונה', body: 'רשות מקומית', reason: 'עד 70% הנחה לנכים' },
      { name: 'פטור ממס הכנסה', body: 'רשות המסים', reason: 'נכות 100% — פטור מלא' },
    ],
  },
  {
    existingDomain: 'ep_oa',
    existingLabel: 'קצבת זקנה',
    potentialBenefits: [
      { name: 'השלמת הכנסה', body: 'ביטוח לאומי', reason: '60% מימוש בלבד' },
      { name: 'גמלת סיעוד', body: 'ביטוח לאומי', reason: 'לבדוק תפקוד ADL' },
      { name: 'הנחת חשמל', body: 'חברת חשמל', reason: '~400 ₪/שנה' },
    ],
  },
  {
    existingDomain: 'w_sur',
    existingLabel: 'קצבת שאירים',
    potentialBenefits: [
      { name: 'מענק פטירה', body: 'ביטוח לאומי', reason: '10,514 ₪ חד-פעמי' },
      { name: 'שיקום מקצועי', body: 'ביטוח לאומי', reason: 'תיקון 208 — הסבה מקצועית' },
    ],
  },
  {
    existingDomain: 'hc_dis',
    existingLabel: 'קצבת ילד נכה',
    potentialBenefits: [
      { name: 'סל שירותים משרד הרווחה', body: 'משרד הרווחה', reason: '40% לא ממצות' },
      { name: 'נקודות זיכוי מס (6090)', body: 'רשות המסים', reason: 'טופס 127 להורה לילד נכה' },
      { name: 'מעבר גיל 18', body: 'ביטוח לאומי', reason: 'לא אוטומטי — חובה הגשה' },
    ],
  },
];


// UI CONSTANTS
// ═══════════════════════════════════════════════
const STEPS = ['תרחיש', 'סריקת פקיד', 'בירור מול משפחה', 'סיכום והנגשה'];
const uLbl = (u: Urg) => u === 'urgent' ? 'דחוף' : u === 'within30' ? 'תוך 30 יום' : 'לתכנון';
const uClr = (u: Urg) =>
  u === 'urgent' ? 'bg-red-100 text-red-800 border-red-300' :
  u === 'within30' ? 'bg-amber-100 text-amber-800 border-amber-300' :
  'bg-sky-100 text-sky-800 border-sky-300';
const uDot = (u: Urg) =>
  u === 'urgent' ? 'bg-red-500' :
  u === 'within30' ? 'bg-amber-500' :
  'bg-sky-500';
const scenColor: Record<string, string> = {
  blue: 'border-blue-500 bg-blue-50 hover:bg-blue-100',
  green: 'border-green-500 bg-green-50 hover:bg-green-100',
  purple: 'border-purple-500 bg-purple-50 hover:bg-purple-100',
  orange: 'border-orange-500 bg-orange-50 hover:bg-orange-100',
  teal: 'border-teal-500 bg-teal-50 hover:bg-teal-100',
  red: 'border-red-500 bg-red-50 hover:bg-red-100',
};
const scenBadge: Record<string, string> = {
  blue: 'bg-blue-600 text-white',
  green: 'bg-green-600 text-white',
  purple: 'bg-purple-600 text-white',
  orange: 'bg-orange-600 text-white',
  teal: 'bg-teal-600 text-white',
  red: 'bg-red-600 text-white',
};

// ═══════════════════════════════════════════════
// FEEDBACK / PILOT REVIEW SYSTEM
// ═══════════════════════════════════════════════
type FeedbackCategory = 'professional' | 'ux' | 'process' | 'data';
type FeedbackSeverity = 'critical' | 'improvement' | 'minor';

interface FeedbackEntry {
  id: number;
  category: FeedbackCategory;
  severity: FeedbackSeverity;
  screen: string;
  description: string;
  suggestion: string;
  ts: string;
}

const catLabel: Record<FeedbackCategory, string> = {
  professional: '📋 תוכן מקצועי',
  ux: '🖥️ ממשק / UI‑UX',
  process: '🔄 זרימת תהליך',
  data: '📊 נתונים / סכומים',
};
const sevLabel: Record<FeedbackSeverity, string> = {
  critical: '🔴 קריטי',
  improvement: '🟡 שיפור',
  minor: '🟢 מינורי',
};

// ═══════════════════════════════════════════════
// GOOGLE SHEET FEEDBACK INTEGRATION
// ═══════════════════════════════════════════════
const SHEET_URL = "https://script.google.com/macros/s/AKfycbwD8CMFoP5XoOwRLwK_OxMMOFKF8fS2CRpbJkNdOHjbnJIepkOLzlGrg3GQNGRqbwB6bA/exec";
const APP_NAME = "מיצוי 360";

async function sendFeedback({ name, category, severity, text, page }: {
  name?: string; category?: string; severity?: string; text: string; page?: string;
}) {
  try {
    await fetch(SHEET_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app: APP_NAME,
        name: name || "אנונימי",
        category: category || "כללי",
        severity: severity || "—",
        text: text,
        page: page || window.location.pathname,
      }),
    });
  } catch (_) { /* silent — no-cors */ }
}

function FeedbackModal({
  items, scenName, onAdd, onClose,
}: {
  items: FeedbackEntry[];
  scenName: string;
  onAdd: (e: FeedbackEntry) => void;
  onClose: () => void;
}) {
  const [cat, setCat] = useState<FeedbackCategory>('professional');
  const [sev, setSev] = useState<FeedbackSeverity>('improvement');
  const [desc, setDesc] = useState('');
  const [sugg, setSugg] = useState('');
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<'add' | 'list'>('add');

  const submit = () => {
    if (!desc.trim()) return;
    const entry: FeedbackEntry = {
      id: Date.now(), category: cat, severity: sev,
      screen: scenName || 'כללי',
      description: desc.trim(),
      suggestion: sugg.trim(),
      ts: new Date().toLocaleTimeString('he-IL'),
    };
    onAdd(entry);
    sendFeedback({
      category: catLabel[cat],
      severity: sevLabel[sev],
      text: entry.description + (entry.suggestion ? ` | הצעה: ${entry.suggestion}` : ''),
      page: scenName || 'כללי',
    });
    setDesc(''); setSugg(''); setTab('list');
  };

  const exportText = () => {
    const lines = [
      `=== משוב פיילוט מיצוי 360 ===`,
      `תרחיש: ${scenName || 'כללי'} | ${new Date().toLocaleDateString('he-IL')}`,
      '',
      ...items.map((e, i) => [
        `--- הערה ${i + 1} ---`,
        `קטגוריה: ${catLabel[e.category]}`,
        `חומרה: ${sevLabel[e.severity]}`,
        `תיאור: ${e.description}`,
        e.suggestion ? `הצעה: ${e.suggestion}` : '',
        `שעה: ${e.ts}`,
      ].filter(Boolean).join('\n')),
      '',
      '=== סוף משוב ===',
    ].join('\n');

    navigator.clipboard.writeText(lines).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="font-bold text-gray-900 text-base">משוב מקצועי — פיילוט</h2>
            <p className="text-xs text-gray-500 mt-0.5">{items.length} הערות בפגישה זו</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl font-bold leading-none">×</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          {(['add', 'list'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${tab === t ? 'border-b-2 border-blue-600 text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}>
              {t === 'add' ? '+ הוסף הערה' : `הערות (${items.length})`}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 p-5">
          {tab === 'add' && (
            <div className="space-y-4">
              {/* Category */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">קטגוריה</label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(catLabel) as FeedbackCategory[]).map(c => (
                    <button key={c} onClick={() => setCat(c)}
                      className={`py-2 px-3 rounded-lg text-xs font-medium border transition-colors ${cat === c ? 'bg-blue-700 text-white border-blue-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                      {catLabel[c]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Severity */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">חומרה / עדיפות</label>
                <div className="flex gap-2">
                  {(Object.keys(sevLabel) as FeedbackSeverity[]).map(s => (
                    <button key={s} onClick={() => setSev(s)}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${sev === s ? 'bg-blue-700 text-white border-blue-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                      {sevLabel[s]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">תיאור הבעיה / הצורך *</label>
                <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} placeholder="תאר את הבעיה או את מה שצריך שיפור..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-right resize-none focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>

              {/* Suggestion */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">הצעה לתיקון / שיפור (אופציונלי)</label>
                <textarea value={sugg} onChange={e => setSugg(e.target.value)} rows={2} placeholder="הצע פתרון או שיפור..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-right resize-none focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>

              <button onClick={submit} disabled={!desc.trim()}
                className={`w-full py-3 rounded-xl font-bold text-sm transition-colors ${desc.trim() ? 'bg-blue-700 text-white hover:bg-blue-800' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>
                שמור הערה
              </button>
            </div>
          )}

          {tab === 'list' && (
            <div className="space-y-3">
              {items.length === 0 && <p className="text-gray-400 text-sm text-center py-6">אין הערות עדיין</p>}
              {items.map((e, i) => (
                <div key={e.id} className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="text-xs font-bold text-blue-700">{catLabel[e.category]}</span>
                    <span className="text-xs">{sevLabel[e.severity]}</span>
                    <span className="text-xs text-gray-400 mr-auto">{e.ts}</span>
                  </div>
                  <p className="text-sm text-gray-800 font-medium">{e.description}</p>
                  {e.suggestion && <p className="text-xs text-gray-500 mt-1">💡 {e.suggestion}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer with export */}
        {items.length > 0 && (
          <div className="border-t border-gray-200 p-4 bg-gray-50 rounded-b-2xl">
            <button onClick={exportText}
              className={`w-full py-2.5 rounded-xl text-sm font-bold transition-colors ${copied ? 'bg-green-600 text-white' : 'bg-gray-800 text-white hover:bg-gray-900'}`}>
              {copied ? '✓ הועתק ללוח!' : `📋 העתק ${items.length} הערות (לשליחה למפתח)`}
            </button>
            <p className="text-xs text-gray-400 text-center mt-2">הדבק באימייל / Slack ושלח לצוות הפיתוח</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════
export default function App() {
  const [step, setStep] = useState(0);
  const [scenId, setScenId] = useState<string | null>(null);
  const [domSt, setDomSt] = useState<SMap>({});
  const [ans, setAns] = useState<A>({});
  const [di, setDi] = useState(0);
  const [resetPending, setResetPending] = useState(false);
  const [feedbackItems, setFeedbackItems] = useState<FeedbackEntry[]>([]);
  const [showFeedback, setShowFeedback] = useState(false);

  const sessionStartRef = useRef(Date.now());
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [showAudit, setShowAudit] = useState(false);
  const [staffNotes, setStaffNotes] = useState('');
  const [showXai, setShowXai] = useState(true);
  const [auditCopied, setAuditCopied] = useState(false);

  const addAudit = useCallback((event: string, detail: string) => {
    setAuditLog(prev => [...prev, { ts: fmtTs(), event, detail }]);
  }, []);

  const scen = useMemo(() => SCENARIOS.find(s => s.id === scenId) || null, [scenId]);
  const allDoms = scen?.domains || [];
  const activeDoms = useMemo(() => allDoms.filter(d => rel(domSt[d.id])), [allDoms, domSt]);
  const allSelected = allDoms.length > 0 && allDoms.every(d => domSt[d.id] != null);
  const curDom = activeDoms[di];

  const curQs = useMemo(() => {
    if (!curDom) return [];
    return curDom.qs.filter(q => !q.showIf || q.showIf(ans));
  }, [curDom, ans]);

  const allAnswered = useMemo(() => {
    for (const dom of activeDoms) {
      const qs = dom.qs.filter(q => !q.showIf || q.showIf(ans));
      for (const q of qs) if (ans[q.id] === undefined || ans[q.id] === '') return false;
    }
    return activeDoms.length > 0;
  }, [activeDoms, ans]);

  const missingFields = useMemo(() => {
    const missing: { domName: string; domIdx: number; qText: string }[] = [];
    activeDoms.forEach((dom, idx) => {
      const qs = dom.qs.filter(q => !q.showIf || q.showIf(ans));
      for (const q of qs) {
        if (ans[q.id] === undefined || ans[q.id] === '') {
          missing.push({ domName: dom.n, domIdx: idx, qText: q.text });
        }
      }
    });
    return missing;
  }, [activeDoms, ans]);

  const actions = useMemo(() => {
    const res: { urg: Urg; text: string; tag: string }[] = [];
    for (const dom of activeDoms) {
      for (const ar of dom.ars) {
        if (ar.cond(ans, domSt)) {
          res.push({
            urg: ar.urg,
            text: typeof ar.text === 'function' ? ar.text(ans) : ar.text,
            tag: dom.n,
          });
        }
      }
    }
    const order: Record<Urg, number> = { urgent: 0, within30: 1, planning: 2 };
    return res.sort((a, b) => order[a.urg] - order[b.urg]);
  }, [activeDoms, ans, domSt]);

  const traps = useMemo(() => {
    const res: { text: string; fix?: string }[] = [];
    for (const dom of activeDoms) {
      for (const tr of dom.trs || []) {
        if (tr.cond(ans)) res.push({ text: tr.text, fix: tr.fix });
      }
    }
    return res;
  }, [activeDoms, ans]);

  const related = useMemo(() => {
    const res: RB[] = [];
    for (const dom of activeDoms) {
      for (const rb of dom.related || []) res.push(rb);
    }
    return res;
  }, [activeDoms]);

  
  // ═══ Rules Engine Evaluation ═══
  const evalResults = useMemo<EvalResult[]>(() => {
    if (!scen) return [];
    return BENEFITS_RULES
      .filter(r => r.scenarioIds.includes(scen.id))
      .map(rule => {
        const triggered: string[] = [];
        let matchCount = 0;
        for (const c of rule.conditions) {
          if (evalCond(c.operator, ans[c.field], c.value)) {
            matchCount++;
            triggered.push(c.label);
          }
        }
        const ratio = rule.conditions.length > 0 ? matchCount / rule.conditions.length : 1;
        const confidence = Math.round(rule.confidenceBase * ratio * 100) / 100;
        return { rule, confidence, triggered };
      })
      .filter(e => e.confidence > 0.3)
      .sort((a, b) => b.confidence - a.confidence);
  }, [scen, ans]);

  // ═══ Unclaimed Rights Detection ═══
  const unclaimed = useMemo(() => {
    if (!scen) return [];
    const activeDomIds = new Set(activeDoms.map(d => d.id));
    return UNCLAIMED_MATRIX
      .filter(u => activeDomIds.has(u.existingDomain))
      .flatMap(u => u.potentialBenefits.map(pb => ({ ...pb, source: u.existingLabel })));
  }, [scen, activeDoms]);

  // ═══ Pilot Telemetry ═══
  const telemetry = useMemo<PilotTelemetry | null>(() => {
    if (!scen) return null;
    return {
      scenarioId: scen.id,
      benefitsDetected: evalResults.length,
      recommendedActions: actions.length,
      unclaimedFound: unclaimed.length,
      sessionDurationSec: Math.round((Date.now() - sessionStartRef.current) / 1000),
      domainsScanned: activeDoms.length,
    };
  }, [scen, evalResults, actions, unclaimed, activeDoms]);

const sa = useCallback((id: string, v: any) => setAns(p => ({ ...p, [id]: v })), []);
  const sd = useCallback((id: string, v: DS) => setDomSt(p => ({ ...p, [id]: v })), []);

  const doReset = () => {
    setStep(0); setScenId(null); setDomSt({}); setAns({}); setDi(0); setResetPending(false); setAuditLog([]); setStaffNotes(''); sessionStartRef.current = Date.now();
  };

  const today = new Date().toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' });
  const urgentCount = actions.filter(a => a.urg === 'urgent').length;

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900" dir="rtl">

      {/* ── HEADER ── */}
      <header className="no-print bg-blue-900 text-white py-4 px-6 shadow-lg">
        <div className="max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl font-bold">360</div>
            <div>
              <h1 className="text-xl font-bold leading-none">מיצוי 360</h1>
              <p className="text-blue-300 text-xs mt-0.5">כלי מיצוי זכויות — פקיד ביטוח לאומי</p>
            </div>
          </div>
          {step > 0 && (
            <button
              onClick={() => resetPending ? doReset() : setResetPending(true)}
              onBlur={() => setResetPending(false)}
              className={`text-sm px-4 py-2 rounded-lg font-medium transition-all ${resetPending ? 'bg-red-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white'}`}>
              {resetPending ? '⚠️ לחץ שוב לאיפוס' : '↺ פגישה חדשה'}
            </button>
          )}
        </div>
      </header>

      {/* ── STEP NAV ── */}
      <nav className="no-print bg-white border-b border-gray-200 py-3 px-6 shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center gap-1">
          {STEPS.map((label, i) => (
            <Fragment key={i}>
              {i > 0 && <div className={`flex-1 h-0.5 transition-colors ${i <= step ? 'bg-blue-600' : 'bg-gray-200'}`} />}
              <button
                onClick={() => { if (i < step) { setStep(i); setResetPending(false); } }}
                disabled={i > step}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${i === step ? 'bg-blue-700 text-white shadow' : i < step ? 'bg-blue-50 text-blue-700 cursor-pointer hover:bg-blue-100' : 'bg-gray-50 text-gray-400 cursor-default'}`}>
                <span className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold ${i < step ? 'bg-blue-600 text-white' : ''}`}>{i < step ? '✓' : i + 1}</span>
                {label}
              </button>
            </Fragment>
          ))}
        </div>
      </nav>

      <main className="max-w-5xl mx-auto p-4 sm:p-6">

        {/* ══════════════════════════════════════
            SCREEN 0 — בחירת תרחיש
        ══════════════════════════════════════ */}
        {step === 0 && (
          <section className="animate-fade-in">
            {/* ── הקדמה מקצועית ── */}
            <div className="mb-8 rounded-2xl overflow-hidden shadow-sm border border-gray-200">
              <div className="bg-gradient-to-l from-blue-900 to-blue-700 px-6 py-5 text-white">
                <h2 className="text-xl font-bold mb-1">ברוכים הבאים למיצוי 360</h2>
                <p className="text-blue-200 text-sm">כלי סיוע מקצועי לפקידי ביטוח לאומי — מיצוי זכויות מלא במקרים מורכבים</p>
              </div>
              <div className="bg-white px-6 py-5">
                <p className="text-sm text-gray-700 leading-relaxed mb-4">
                  המערכת נועדה לסייע לפקידים לזהות את <strong>מלוא הזכויות</strong> המגיעות למבוטח, עם דגש על מקרים מורכבים הזקוקים לתמיכה וסיוע מיוחד.
                  המערכת מנחה אותך שלב אחר שלב — מזיהוי התרחיש, דרך סריקת תחומים ושאלות ממוקדות, ועד לסיכום פעולות מוכן להדפסה ולתיעוד תיק.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="flex items-start gap-3 bg-slate-50 rounded-xl p-3">
                    <span className="text-lg">1️⃣</span>
                    <div>
                      <p className="text-xs font-bold text-gray-800">בחר תרחיש</p>
                      <p className="text-xs text-gray-500">לפי אירוע החיים של המבוטח</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 bg-slate-50 rounded-xl p-3">
                    <span className="text-lg">2️⃣</span>
                    <div>
                      <p className="text-xs font-bold text-gray-800">סרוק תחומים</p>
                      <p className="text-xs text-gray-500">סמן רלוונטיות לכל תחום</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 bg-slate-50 rounded-xl p-3">
                    <span className="text-lg">3️⃣</span>
                    <div>
                      <p className="text-xs font-bold text-gray-800">ענה על שאלות</p>
                      <p className="text-xs text-gray-500">שאלות ממוקדות לכל תחום</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 bg-slate-50 rounded-xl p-3">
                    <span className="text-lg">4️⃣</span>
                    <div>
                      <p className="text-xs font-bold text-gray-800">קבל סיכום</p>
                      <p className="text-xs text-gray-500">פעולות, אזהרות, זכויות נלוות</p>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
                  <span>🔒</span>
                  <span>אין שמירת מידע — כל הנתונים נמחקים בסגירת הדף. אין צורך בהתחברות.</span>
                </div>
              </div>
            </div>

            {/* ── תרחישים פעילים (פיילוט) ── */}
            <h2 className="text-lg font-bold mb-1 text-gray-800">בחר תרחיש</h2>
            <p className="text-sm text-gray-500 mb-4">{SCENARIOS.filter(s => s.active).length} תרחישים פעילים בפיילוט</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {SCENARIOS.filter(s => s.active).map(s => (
                <button
                  key={s.id}
                  onClick={() => { setScenId(s.id); setDomSt({}); setAns({}); setDi(0); setStep(1); }}
                  className={`rounded-xl border-2 p-5 text-right transition-all hover:shadow-md cursor-pointer ${scenColor[s.color]}`}>
                  <div className="flex items-start justify-between mb-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${scenBadge[s.color]}`}>פעיל</span>
                    <span className="text-2xl">{s.icon}</span>
                  </div>
                  <h3 className="font-bold text-base text-gray-900 mb-1">{s.name}</h3>
                  <p className="text-xs text-gray-500">{s.profile}</p>
                  <p className="text-xs text-gray-400 mt-2">{s.domains.length} תחומים</p>
                </button>
              ))}
            </div>

            {/* ── תרחישים להמשך ── */}
            {SCENARIOS.filter(s => !s.active).length > 0 && (
              <div className="mt-8">
                <h3 className="text-base font-bold mb-1 text-gray-500">תרחישים נוספים — להמשך</h3>
                <p className="text-xs text-gray-400 mb-4">תרחישים אלו יופעלו בגרסאות הבאות</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 opacity-50">
                  {SCENARIOS.filter(s => !s.active).map(s => (
                    <div
                      key={s.id}
                      className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-5 text-right cursor-default">
                      <div className="flex items-start justify-between mb-2">
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-300 text-gray-600">להמשך</span>
                        <span className="text-2xl grayscale">{s.icon}</span>
                      </div>
                      <h3 className="font-bold text-base text-gray-500 mb-1">{s.name}</h3>
                      <p className="text-xs text-gray-400">{s.profile}</p>
                      <p className="text-xs text-gray-300 mt-2">{s.domains.length} תחומים</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
              <strong>הוראות שימוש:</strong> בחר תרחיש לפי אירוע החיים של המבוטח. המערכת תנחה אותך שלב אחר שלב. הפלט מוכן להדפסה ולתיעוד תיק.
            </div>
          </section>
        )}

        {/* ══════════════════════════════════════
            SCREEN 1 — סריקה ראשונית
        ══════════════════════════════════════ */}
        {step === 1 && scen && (
          <section>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-2xl">{scen.icon}</span>
              <h2 className="text-lg font-bold text-gray-800">שלב 1 — סריקת פקיד: {scen.name}</h2>
            </div>
            <p className="text-sm text-gray-500 mb-5">בדוק את התחומים הרלוונטיים למבוטח וסמן לכל תחום: רלוונטי / לא רלוונטי / לבדיקה</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {allDoms.map(d => {
                const v = domSt[d.id];
                return (
                  <div key={d.id} className={`rounded-xl border p-4 shadow-sm transition-all ${v === 'relevant' ? 'border-green-400 bg-green-50' : v === 'check' ? 'border-amber-400 bg-amber-50' : v === 'not_relevant' ? 'border-gray-200 bg-gray-50 opacity-60' : 'border-gray-200 bg-white'}`}>
                    <div className="flex items-start justify-between mb-1.5">
                      <h3 className="font-bold text-sm text-gray-900 flex-1 ml-2">{d.n}</h3>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full whitespace-nowrap">{d.b}</span>
                        {d.priority === 'high' && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">עדיפות גבוהה</span>}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mb-1">{d.ds}</p>
                    <p className="text-xs font-semibold text-blue-800 mb-3">{d.am}</p>
                    <div className="flex gap-2">
                      {(['relevant', 'check', 'not_relevant'] as DS[]).map(x => {
                        const lb = x === 'relevant' ? 'רלוונטי' : x === 'not_relevant' ? 'לא רלוונטי' : 'לבדיקה';
                        const ac = x === 'relevant' ? 'bg-green-600 text-white' : x === 'not_relevant' ? 'bg-gray-500 text-white' : 'bg-amber-500 text-white';
                        return (
                          <button key={x} onClick={() => sd(d.id, x!)}
                            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${v === x ? ac : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                            {lb}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-6 flex justify-start">
              <button disabled={!allSelected} onClick={() => { setDi(0); setStep(2); }}
                className={`px-8 py-3 rounded-xl font-bold text-base transition-colors ${allSelected ? 'bg-blue-700 text-white hover:bg-blue-800 shadow-md' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>
                המשך לבירור מול משפחה ←
              </button>
            </div>
          </section>
        )}

        {/* ══════════════════════════════════════
            SCREEN 2 — בירור מול משפחה
        ══════════════════════════════════════ */}
        {step === 2 && scen && (
          <section>
            {activeDoms.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500 text-lg mb-3">לא נבחרו תחומים רלוונטיים</p>
                <button onClick={() => setStep(1)} className="text-blue-600 underline text-sm">חזרה לסריקה</button>
              </div>
            ) : (
              <>
                {/* Banner — בירור מול משפחה */}
                <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center gap-3">
                  <span className="text-xl">👨‍👩‍👧</span>
                  <div>
                    <p className="text-sm font-bold text-blue-900">שלב בירור מול המשפחה</p>
                    <p className="text-xs text-blue-700">שאלות אלו נועדו לברר פרטים ישירות מול המבוטח או בני משפחתו. ענה לפי המידע שנמסר בפגישה.</p>
                  </div>
                </div>

                <div className="mb-5">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-base font-bold text-gray-800">{curDom?.n}</h2>
                    <span className="text-sm text-gray-400">תחום {di + 1} מתוך {activeDoms.length}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${((di + 1) / activeDoms.length) * 100}%` }} />
                  </div>
                </div>

                <div className="space-y-4">
                  {curQs.map(q => (
                    <div key={q.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                      <label className="block font-medium text-sm mb-3 text-gray-800">{q.text}</label>

                      {q.at === 'boolean' && (
                        <div className="flex gap-3">
                          {[true, false].map(v => (
                            <button key={String(v)} onClick={() => sa(q.id, v)}
                              className={`flex-1 py-3 rounded-lg text-base font-bold transition-colors border ${ans[q.id] === v ? (v ? 'bg-green-600 text-white border-green-600' : 'bg-red-500 text-white border-red-500') : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                              {v ? 'כן' : 'לא'}
                            </button>
                          ))}
                        </div>
                      )}

                      {q.at === 'number' && (
                        <input type="number" value={ans[q.id] ?? ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => sa(q.id, e.target.value === '' ? '' : Number(e.target.value))}
                          className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base text-right focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                      )}

                      {q.at === 'text' && (
                        <input type="text" value={ans[q.id] ?? ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => sa(q.id, e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base text-right focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                      )}

                      {q.at === 'select' && q.opts && (
                        <div className="flex flex-wrap gap-2">
                          {q.opts.map((opt: string) => (
                            <button key={opt} onClick={() => sa(q.id, opt)}
                              className={`flex-1 min-w-fit py-2.5 px-3 rounded-lg text-sm font-medium transition-colors border ${ans[q.id] === opt ? 'bg-blue-700 text-white border-blue-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                              {opt}
                            </button>
                          ))}
                        </div>
                      )}

                      {q.warn && q.warn(ans) && (
                        <div className="mt-3 flex items-start gap-2 bg-orange-50 border border-orange-300 rounded-lg p-3 text-orange-800 text-xs">
                          <span className="shrink-0">⚠️</span><span>{q.warn(ans)}</span>
                        </div>
                      )}
                      {q.info && (
                        <div className="mt-3 flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3 text-blue-800 text-xs">
                          <span className="shrink-0">ℹ️</span><span>{q.info}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-6 flex items-center justify-between">
                  <button onClick={() => di > 0 ? setDi(di - 1) : setStep(1)}
                    className="px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-100 font-medium transition-colors text-sm">
                    → הקודם
                  </button>
                  {di < activeDoms.length - 1 ? (
                    <button onClick={() => setDi(di + 1)}
                      className="px-6 py-2.5 rounded-xl bg-blue-700 text-white hover:bg-blue-800 font-medium shadow transition-colors text-sm">
                      הבא ←
                    </button>
                  ) : (
                    <div className="flex flex-col items-end gap-2">
                      <button onClick={() => { addAudit('סיכום', missingFields.length > 0 ? `התקדם לסיכום עם ${missingFields.length} שדות חסרים` : 'התקדם לסיכום — כל השדות מלאים'); setStep(3); }}
                        className="px-8 py-3 rounded-xl font-bold text-base transition-colors bg-green-600 text-white hover:bg-green-700 shadow-md">
                        לסיכום והנגשה ←
                      </button>
                      {missingFields.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 w-full max-w-md animate-fade-in">
                          <p className="text-xs font-bold text-amber-800 mb-2">⚠️ שדות שלא מולאו ({missingFields.length}) — ניתן להמשיך, אך מומלץ להשלים:</p>
                          <div className="space-y-1.5 max-h-40 overflow-y-auto">
                            {missingFields.map((m, i) => (
                              <button key={i} onClick={() => setDi(m.domIdx)}
                                className="w-full text-right flex items-start gap-2 text-xs hover:bg-amber-100 rounded-lg p-1.5 transition-colors">
                                <span className="shrink-0 w-2 h-2 rounded-full bg-amber-400 mt-1" />
                                <span className="text-amber-700"><strong>{m.domName}:</strong> {m.qText}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        )}

        {/* ══════════════════════════════════════
            SCREEN 3 — סיכום, הנגשה וקידום
        ══════════════════════════════════════ */}
        {step === 3 && scen && (
          <section>
            {/* Print header */}
            <div className="hidden print:block mb-6 border-b-2 border-gray-800 pb-4">
              <h1 className="text-2xl font-bold">מיצוי 360 — סיכום פגישה</h1>
              <p className="text-gray-600">{today} | תרחיש: {scen.name}</p>
              <p className="text-xs text-gray-400 mt-1">אמת פרטים מעודכנים ב-btl.gov.il או *6050 לפני הגשה</p>
            </div>

            {/* Screen header */}
            <div className="no-print flex items-center justify-between mb-5 flex-wrap gap-3">
              <div>
                <h2 className="text-lg font-bold text-gray-800">סיכום, הנגשה וקידום — {scen.name}</h2>
                <p className="text-sm text-gray-500">{today} | מוכן להדפסה ולהנגשה למשפחה</p>
              </div>
              <div className="flex gap-2">
                {urgentCount > 0 && (
                  <span className="bg-red-100 text-red-800 text-sm font-bold px-3 py-1.5 rounded-full border border-red-300">
                    {urgentCount} פעולות דחופות
                  </span>
                )}
                <button onClick={() => window.print()}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-700 text-white hover:bg-blue-800 font-bold shadow transition-colors text-sm">
                  🖨️ הדפסה / PDF
                </button>
              </div>
            </div>

            {/* SECTION A — פעולות נדרשות */}
            <div className="mb-6 print-summary">
              <h3 className="text-base font-bold mb-3 text-blue-900 border-b-2 border-blue-200 pb-2">
                פעולות נדרשות ({actions.length})
              </h3>
              {actions.length === 0 ? (
                <p className="text-gray-400 py-4 text-sm">לא נמצאו פעולות נדרשות על בסיס התשובות</p>
              ) : (
                <div className="space-y-2">
                  {actions.map((act, i) => (
                    <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex items-start gap-3">
                      <div className={`shrink-0 w-2 h-2 rounded-full mt-2 ${uDot(act.urg)}`} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${uClr(act.urg)}`}>{uLbl(act.urg)}</span>
                          <span className="text-xs text-gray-400">{act.tag}</span>
                        </div>
                        <p className="font-medium text-sm text-gray-900">{act.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* SECTION B — מלכודות */}
            {traps.length > 0 && (
              <div className="mb-6 print-summary">
                <h3 className="text-base font-bold mb-3 text-orange-800 border-b-2 border-orange-200 pb-2">
                  אזהרות ומלכודות ({traps.length})
                </h3>
                <div className="space-y-2">
                  {traps.map((tr, i) => (
                    <div key={i} className="bg-orange-50 border border-orange-300 rounded-xl p-4">
                      <p className="font-bold text-sm text-orange-800 mb-1">⚠️ {tr.text}</p>
                      {tr.fix && <p className="text-xs text-orange-700">פעולה מונעת: {tr.fix}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SECTION C — זכויות נלוות */}
            {related.length > 0 && (
              <div className="mb-6 print-summary">
                <h3 className="text-base font-bold mb-3 text-teal-800 border-b-2 border-teal-200 pb-2">
                  זכויות נלוות — דומינו-אפקט ({related.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {related.map((rb, i) => (
                    <div key={i} className="bg-teal-50 border border-teal-200 rounded-xl p-3 flex items-start gap-2">
                      <span className="text-teal-600 text-sm font-bold shrink-0">↗</span>
                      <div>
                        <p className="font-semibold text-sm text-teal-900">{rb.name}</p>
                        <p className="text-xs text-teal-700">{rb.body}{rb.note ? ` — ${rb.note}` : ''}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SECTION D — סיכום ידע פקיד */}
            <div className="mb-6 print-summary bg-gray-50 border border-gray-200 rounded-xl p-4">
              <h3 className="text-sm font-bold text-gray-700 mb-2">מצב פגישה</h3>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-white rounded-lg p-3 border border-gray-200">
                  <div className="text-2xl font-bold text-red-600">{actions.filter(a => a.urg === 'urgent').length}</div>
                  <div className="text-xs text-gray-500">דחוף</div>
                </div>
                <div className="bg-white rounded-lg p-3 border border-gray-200">
                  <div className="text-2xl font-bold text-amber-600">{actions.filter(a => a.urg === 'within30').length}</div>
                  <div className="text-xs text-gray-500">תוך 30 יום</div>
                </div>
                <div className="bg-white rounded-lg p-3 border border-gray-200">
                  <div className="text-2xl font-bold text-sky-600">{actions.filter(a => a.urg === 'planning').length}</div>
                  <div className="text-xs text-gray-500">לתכנון</div>
                </div>
              </div>
            </div>

            
            {/* XAI BENEFIT CARDS */}
            {evalResults.length > 0 && (
              <div className="mb-6 print-summary">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-bold text-indigo-900 border-b-2 border-indigo-200 pb-2">
                    זיהוי זכאות — מנוע חכמי ({evalResults.length})
                  </h3>
                  <button onClick={() => setShowXai(!showXai)} className="no-print text-xs text-indigo-600 hover:underline">
                    {showXai ? 'הסתר פירוט' : 'הצג פירוט'}
                  </button>
                </div>
                <div className="space-y-3">
                  {evalResults.map((ev) => (
                    <div key={ev.rule.id} className="bg-white rounded-xl border border-indigo-200 p-4 shadow-sm">
                      <div className="flex items-start justify-between mb-2 flex-wrap gap-2">
                        <div className="flex-1">
                          <h4 className="font-bold text-sm text-gray-900">{ev.rule.name}</h4>
                          {ev.rule.estimatedMonthly && <span className="text-xs text-blue-700 font-semibold">{ev.rule.estimatedMonthly}</span>}
                        </div>
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${confClr(ev.confidence)}`}>
                          סיכוי: {confLbl(ev.confidence)} ({Math.round(ev.confidence * 100)}%)
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                        <div className={`h-2 rounded-full transition-all ${confBar(ev.confidence)}`} style={{ width: `${Math.round(ev.confidence * 100)}%` }} />
                      </div>
                      {showXai && (
                        <div className="mt-2 space-y-1.5">
                          <p className="text-xs text-gray-600"><strong>הסבר:</strong> {ev.rule.explanation}</p>
                          {ev.triggered.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              <span className="text-xs text-gray-500">כללים:</span>
                              {ev.triggered.map((t, j) => <span key={j} className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-200">{t}</span>)}
                            </div>
                          )}
                          <p className="text-xs text-indigo-800 font-medium">פעולה: {ev.rule.action}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* UNCLAIMED RIGHTS */}
            {unclaimed.length > 0 && (
              <div className="mb-6 print-summary">
                <h3 className="text-base font-bold mb-3 text-purple-900 border-b-2 border-purple-200 pb-2">
                  זכויות לא ממוצות ({unclaimed.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {unclaimed.map((u, i) => (
                    <div key={i} className="bg-purple-50 border border-purple-200 rounded-xl p-3">
                      <div className="flex items-start gap-2">
                        <span className="text-purple-600 text-lg shrink-0">⚠️</span>
                        <div>
                          <p className="font-bold text-sm text-purple-900">{u.name}</p>
                          <p className="text-xs text-purple-700">{u.body}</p>
                          <p className="text-xs text-purple-600 mt-1">סיבה: {u.reason}</p>
                          <p className="text-xs text-gray-500 mt-0.5">מקור: {u.source}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* PILOT ANALYTICS */}
            {telemetry && (
              <div className="mb-6 print-summary">
                <h3 className="text-base font-bold mb-3 text-cyan-900 border-b-2 border-cyan-200 pb-2">
                  אנליטיקת פיילוט
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { label: 'זכאויות שזוהו', value: telemetry.benefitsDetected, color: 'text-blue-700' },
                    { label: 'פעולות מומלצות', value: telemetry.recommendedActions, color: 'text-green-700' },
                    { label: 'לא ממוצות', value: telemetry.unclaimedFound, color: 'text-purple-700' },
                    { label: 'תחומים נסרקו', value: telemetry.domainsScanned, color: 'text-teal-700' },
                    { label: 'משך פגישה (שניות)', value: telemetry.sessionDurationSec, color: 'text-gray-700' },
                  ].map((m, i) => (
                    <div key={i} className="bg-white rounded-lg p-3 border border-cyan-200 text-center">
                      <div className={`text-2xl font-bold ${m.color}`}>{m.value}</div>
                      <div className="text-xs text-gray-500 mt-1">{m.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* STAFF AUDIT LOG + NOTES */}
            <div className="mb-6 print-summary">
              <h3 className="text-base font-bold mb-3 text-gray-800 border-b-2 border-gray-300 pb-2">
                תיעוד פקיד + הערות
              </h3>
              <textarea
                value={staffNotes}
                onChange={e => setStaffNotes(e.target.value)}
                rows={3}
                placeholder="הערות פקיד לתיעוד התיק..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-right resize-none focus:ring-2 focus:ring-blue-500 outline-none mb-3 no-print"
              />
              {staffNotes && <p className="hidden print:block text-sm text-gray-700 mb-3 whitespace-pre-wrap">הערות: {staffNotes}</p>}
              <button
                onClick={() => {
                  const lines = [
                    '=== יומן ביקורת מיצוי 360 ===',
                    'תרחיש: ' + (scen?.name || ''),
                    'תאריך: ' + today,
                    '',
                    'פעולות (' + actions.length + '):',
                    ...actions.map((a,i) => (i+1) + '. [' + uLbl(a.urg) + '] ' + a.text),
                    '',
                    'זכאויות שזוהו (' + evalResults.length + '):',
                    ...evalResults.map(e => '- ' + e.rule.name + ' (' + Math.round(e.confidence*100) + '%)'),
                    '',
                    'לא ממוצות (' + unclaimed.length + '):',
                    ...unclaimed.map(u => '- ' + u.name + ' (' + u.body + ')'),
                    '',
                    'הערות פקיד:',
                    staffNotes || '(ללא)',
                    '',
                    '=== סוף יומן ===',
                  ].join('\n');
                  navigator.clipboard.writeText(lines).then(() => { setAuditCopied(true); setTimeout(() => setAuditCopied(false), 2500); });
                }}
                className={`no-print w-full py-2.5 rounded-xl text-sm font-bold transition-colors ${auditCopied ? 'bg-green-600 text-white' : 'bg-gray-800 text-white hover:bg-gray-900'}`}>
                {auditCopied ? '✓ הועתק ללוח!' : 'ייצא יומן ביקורת ללוח'}
              </button>
            </div>

{/* Footer disclaimer */}
            <div className="border-t border-gray-200 pt-4 text-xs text-gray-400 print-summary">
              <p>⚠️ <strong>אמת פרטים מעודכנים ב-btl.gov.il או *6050 לפני הגשה.</strong></p>
              <p className="mt-1">מיצוי 360 v3.0 | btl-domain-engine v4.1.0 | {today} | אין שמירת מידע — כל הנתונים נמחקים בסגירת הדף</p>
            </div>

            {/* Nav buttons */}
            <div className="mt-6 no-print flex gap-3">
              <button onClick={() => setStep(2)}
                className="px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-100 font-medium transition-colors text-sm">
                → חזרה לשאלות
              </button>
              <button onClick={doReset}
                className="px-5 py-2.5 rounded-xl bg-blue-700 text-white hover:bg-blue-800 font-medium transition-colors text-sm">
                פגישה חדשה ↺
              </button>
            </div>
          </section>
        )}

      </main>

      <footer className="no-print text-center py-4 text-xs text-gray-400 border-t border-gray-200 mt-10">
        כלי עזר למיצוי זכויות 360 לפקידי ביטוח לאומי | אין שמירת מידע | מינהל גמלאות | {today}
      </footer>

      {/* ── FLOATING FEEDBACK BUTTON ── */}
      <div className="no-print fixed bottom-6 left-6 z-40 flex flex-col items-end gap-2">
        {feedbackItems.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-full px-3 py-1 text-xs text-gray-600 shadow-md">
            {feedbackItems.length} הערות
          </div>
        )}
        <button
          onClick={() => setShowFeedback(true)}
          title="משוב מקצועי — פיילוט"
          className="flex items-center gap-2 px-5 py-3 rounded-full bg-purple-700 text-white shadow-xl hover:bg-purple-800 transition-all hover:scale-105 text-sm font-bold">
          💬 משוב
        </button>
      </div>

      {/* ── FEEDBACK MODAL ── */}
      {showFeedback && (
        <FeedbackModal
          items={feedbackItems}
          scenName={scen?.name || ''}
          onAdd={e => setFeedbackItems(prev => [...prev, e])}
          onClose={() => setShowFeedback(false)}
        />
      )}
    </div>
  );
}
