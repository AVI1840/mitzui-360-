/**
 * מיצוי 360 — v5.0
 * כלי מיצוי זכויות לפקידי ביטוח לאומי
 * 3 שלבים: בדיקות פקיד → שאלון למשפחה → ממצאים ומימוש
 * אין שמירת מידע אישי — 100% stateless
 *
 * v5.0 שינויים:
 * - תיקון באג familyCopied (חסר useState)
 * - שדה "מקור החוב" (Debt Source) — dropdown בסעיף חובות
 * - שדה "גמלאות נוספות" (multi-select) — סיעוד/הבטחת הכנסה/נכות כללית
 * - שדה "מצב משפחתי" (נשואים/גרושים) — radio, עם הערה בסיכום אם גרושים
 * - שינוי "שווי רכב" ל"יתרת הלוואת רכב ניידות"
 * - העשרת info/clerkNote מחוזר 33, 2026
 * - העשרת related rights (חשמל, מים, תחבורה)
 * - צ'קליסט פולו-אפ (פקיד + משפחה) במסך ממצאים
 * - קישורים סטטיים לארנק זכויות ואירועי חיים
 * - ייצוא מסמך מתוקן (download כ-txt)
 */
import React, { useState, useMemo, useCallback, Fragment } from 'react';

type AT = 'boolean'|'number'|'text'|'select'|'date'|'status'|'multiselect';
type Urg = 'urgent'|'within30'|'planning';
type Phase = 'clerk'|'family';
type A = Record<string,any>;

interface Q { id:string; text:string; at:AT; phase:Phase; opts?:string[]; showIf?:(a:A)=>boolean; warn?:(a:A)=>string|null; info?:string; }
interface AR { urg:Urg; cond:(a:A)=>boolean; text:string|((a:A)=>string); clerkNote?:string; }
interface TR { cond:(a:A)=>boolean; text:string; fix?:string; }
interface RB { name:string; body:string; note?:string; }
interface Section { id:string; title:string; qs:Q[]; ars:AR[]; trs?:TR[]; related?:RB[]; }
interface Scenario { id:string; name:string; icon:string; desc:string; active:boolean; color:string; sections:Section[]; }

const CY = new Date().getFullYear();
const daysSince = (ds:string):number => { if(!ds) return 0; const d=new Date(ds); return isNaN(d.getTime())?0:Math.floor((Date.now()-d.getTime())/86400000); };

const SHEET_URL = "https://script.google.com/macros/s/AKfycbwD8CMFoP5XoOwRLwK_OxMMOFKF8fS2CRpbJkNdOHjbnJIepkOLzlGrg3GQNGRqbwB6bA/exec";
const APP_NAME = "מיצוי 360";
async function sendSheet(data:Record<string,string>) { try { await fetch(SHEET_URL,{method:"POST",mode:"no-cors",headers:{"Content-Type":"application/json"},body:JSON.stringify({app:APP_NAME,...data})}); } catch(_){} }

// ═══════════════════════════════════════════════
// תרחיש 1: פטירת ילד נכה — כל הסעיפים פעילים תמיד
// ═══════════════════════════════════════════════
const DDC: Section[] = [
  { id:'dd', title:'תאריך פטירה ופרטי רקע',
    qs:[
      {id:'dd_date',text:'תאריך פטירת הילד',at:'date',phase:'clerk',info:'משפיע על כל הפרמטרים: מענק, חובות, ניידות, חסכונות, קצבת ילדים'},
      {id:'dd_age',text:'גיל הילד בפטירה',at:'number',phase:'clerk',warn:(a)=>a.dd_age>18?'מעל 18 — בדוק חוזר מנהל 1915':null},
      {id:'dd_marital',text:'מצב משפחתי ההורים',at:'select',phase:'clerk',opts:['נשואים','גרושים'],info:'במקרה של גירושין — חלוקת גמלאות מורכבת, נדרש ייעוץ פרטני'},
      {id:'dd_allow',text:'קצבת ילדים',at:'status',phase:'clerk',opts:['משולמת','הופסקה','לבדיקה'],info:'זכאות עד 3 חודשים מהפטירה (חוזר 33, 2026)'},
      {id:'dd_other_allow',text:'גמלאות נוספות שמקבלת המשפחה',at:'multiselect',phase:'clerk',opts:['סיעוד','הבטחת הכנסה','נכות כללית'],info:'חשוב לבדוק חפיפות וצירופים בין גמלאות'},
    ],
    ars:[
      {urg:'urgent',cond:(a)=>a.dd_date&&daysSince(a.dd_date)<=90&&a.dd_allow==='הופסקה',text:'קצבת ילדים הופסקה תוך 3 חודשים מהפטירה — לבדוק זכאות להמשך',clerkNote:'בדוק במערכת אם הופסקה בטעות. לפי חוזר 33 — זכאות עד 3 חודשים.'},
      {urg:'within30',cond:(a)=>a.dd_date&&daysSince(a.dd_date)>90&&a.dd_allow==='משולמת',text:'חלפו 3 חודשים — קצבת ילדים אמורה להיפסק'},
      {urg:'within30',cond:(a)=>a.dd_marital==='גרושים',text:'הורים גרושים — חלוקת גמלאות מורכבת. נדרש ייעוץ פרטני, אין לחשב חלוקה אוטומטית',clerkNote:'הפנה ליועץ זכויות. אין לבצע חלוקת גמלאות ללא ייעוץ מקצועי.'},
      {urg:'within30',cond:(a)=>Array.isArray(a.dd_other_allow)&&a.dd_other_allow.includes('סיעוד'),text:'המשפחה מקבלת סיעוד — בדוק השפעת הפטירה על גמלת הסיעוד',clerkNote:'פטירת ילד עשויה לשנות מבחן הכנסה לסיעוד. בדוק תחשיב מחדש.'},
      {urg:'within30',cond:(a)=>Array.isArray(a.dd_other_allow)&&a.dd_other_allow.includes('הבטחת הכנסה'),text:'המשפחה מקבלת הבטחת הכנסה — לעדכן תחשיב בעקבות הפטירה'},
    ],
    trs:[{cond:(a)=>a.dd_age>18,text:'חריג גיל — מעל 18',fix:'בדוק חוזר מנהל 1915'}],
  },
  { id:'dg', title:'מענק פטירה (10,514 ₪ — חוזר 33, 2026)',
    qs:[
      {id:'dg_st',text:'מענק פטירה',at:'status',phase:'clerk',opts:['שולם','בטיפול','לא רלוונטי'],info:'סכום מעודכן: 10,514 ₪ (חוזר 33, 2026)'},
      {id:'dg_bank',text:'חשבון הבנק פעיל?',at:'boolean',phase:'clerk',showIf:(a)=>a.dg_st==='בטיפול'},
    ],
    ars:[
      {urg:'urgent',cond:(a)=>a.dg_st==='בטיפול'&&a.dg_bank===false,text:'חשבון לא פעיל — לעדכן בנק לפני שחרור מענק',clerkNote:'ודא חשבון פעיל. מענק 10,514 ₪ (חוזר 33, 2026).'},
      {urg:'within30',cond:(a)=>a.dg_st==='בטיפול'&&a.dg_bank!==false,text:'מענק 10,514 ₪ בטיפול — לוודא העברה'},
    ],
  },
  { id:'dm', title:'חובות וגבייה',
    qs:[
      {id:'dm_st',text:'חוב להורים בביטוח לאומי',at:'status',phase:'clerk',opts:['יש חוב','אין חוב','לבדיקה']},
      {id:'dm_amt',text:'סכום החוב (₪)',at:'number',phase:'clerk',showIf:(a)=>a.dm_st==='יש חוב'},
      {id:'dm_source',text:'מקור החוב',at:'select',phase:'clerk',opts:['גביית יתר קצבה','הלוואה','חוב דמי ביטוח','קנס','אחר'],showIf:(a)=>a.dm_st==='יש חוב',info:'סיווג מקור החוב משפיע על אפשרויות הביטול'},
      {id:'dm_reason',text:'בגין מה נוצר?',at:'text',phase:'clerk',showIf:(a)=>a.dm_st==='יש חוב'},
      {id:'dm_notes',text:'הערות פקיד לחוב',at:'text',phase:'clerk',showIf:(a)=>a.dm_st==='יש חוב'},
      {id:'dm_cancel',text:'לשקול בקשה לביטול חוב?',at:'boolean',phase:'clerk',showIf:(a)=>a.dm_st==='יש חוב',info:'בפטירת ילד נכה — לשקול הכנת בקשה לביטול. גבייה מוקפאת 60 יום מהפטירה.'},
    ],
    ars:[
      {urg:'within30',cond:(a)=>a.dm_st==='יש חוב',text:(a)=>`חוב ${a.dm_amt?(a.dm_amt).toLocaleString()+' ₪':'(סכום לא ידוע)'}${a.dm_source?' ('+a.dm_source+')':''} — גבייה מוקפאת 60 יום. ${a.dm_cancel?'להכין בקשה לביטול':'לתאם סדר תשלומים'}`,clerkNote:'בפטירת ילד נכה — להכין בקשה לביטול חוב. בדוק אפשרות מחיקה מול מחלקת גבייה. הקפאת גבייה: 60 יום.'},
    ],
    trs:[{cond:(a)=>a.dm_st==='יש חוב'&&a.dm_amt>50000,text:'חוב מעל 50,000 ₪',fix:'תאם עם מחלקת גבייה'}],
  },
  { id:'is', title:'הבטחת הכנסה',
    qs:[
      {id:'is_st',text:'זכאות הבטחת הכנסה',at:'status',phase:'clerk',opts:['זכאי','לא זכאי','לבדיקה'],info:'שיעור מימוש 60% בלבד — פער קריטי (חוזר 33, 2026)'},
      {id:'is_emp',text:'מצב תעסוקתי ההורים',at:'select',phase:'family',opts:['שניהם עובדים','אחד עובד','שניהם לא עובדים']},
      {id:'is_office',text:'פטור מהתייצבות בלשכה',at:'status',phase:'clerk',opts:['יש פטור','אין פטור','לבדיקה'],showIf:(a)=>a.is_emp==='שניהם לא עובדים'||a.is_emp==='אחד עובד',info:'3 חודשי פטור מהתייצבות בפטירת ילד'},
      {id:'is_kids',text:'מספר ילדים נותרים',at:'number',phase:'family'},
    ],
    ars:[
      {urg:'urgent',cond:(a)=>a.is_st==='זכאי',text:(a)=>`זכאי להבטחת הכנסה — לעדכן תחשיב${a.is_emp!=='שניהם עובדים'?' + פטור 3 חודשים מלשכה':''}`,clerkNote:'עדכן תחשיב הכנסה. בדוק פטור 3 חודשים מהתייצבות. רכב ניידות לא נספר כפוסל מהפטירה.'},
      {urg:'within30',cond:(a)=>a.is_st==='לבדיקה',text:'לבדוק זכאות הבטחת הכנסה — ייתכן שינוי בעקבות הפטירה',clerkNote:'בדוק הכנסות, נכסים, מצב תעסוקתי. רכב ניידות לא פוסל.'},
    ],
  },
  { id:'mo', title:'ניידות — רכב והלוואות',
    qs:[
      {id:'mo_grant',text:'קיבלו הטבת רכישה כהלוואה עומדת?',at:'boolean',phase:'clerk'},
      {id:'mo_fund',text:'קיבלו הלוואה מקרן הלוואות?',at:'boolean',phase:'clerk',info:'הופכת למענק אחרי 5 שנים'},
      {id:'mo_year',text:'שנת לקיחת ההלוואה',at:'number',phase:'clerk',showIf:(a)=>a.mo_grant||a.mo_fund},
      {id:'mo_loan_balance',text:'יתרת הלוואת רכב ניידות (₪)',at:'number',phase:'family',showIf:(a)=>a.mo_grant||a.mo_fund,info:'סכום יתרת ההלוואה הנוכחית — לא שווי הרכב'},
      {id:'mo_intent',text:'כוונת המשפחה לגבי הרכב',at:'select',phase:'family',opts:['להמתין שנה','למכור כעת','להחזיר הלוואה','לא ידוע'],showIf:(a)=>a.mo_grant||a.mo_fund,info:'הלוואה עומדת: שנה להחזר מהפטירה, פטור אחרי 7 שנים. תקופת חסד: 12 חודש.'},
    ],
    ars:[
      {urg:'within30',cond:(a)=>a.mo_grant&&a.mo_year&&(CY-a.mo_year<7),text:(a)=>`הלוואה עומדת מ-${a.mo_year} (${CY-a.mo_year} שנים) — שנה להחזר, פטור אחרי 7${a.mo_loan_balance?' | יתרה: '+(a.mo_loan_balance).toLocaleString()+' ₪':''}`,clerkNote:'חשב למשפחה יתרת החזר. תקופת חסד 12 חודש מהפטירה.'},
      {urg:'planning',cond:(a)=>a.mo_grant&&a.mo_year&&(CY-a.mo_year>=7),text:'הלוואה עומדת 7+ שנים — פטור מהחזר'},
      {urg:'within30',cond:(a)=>a.mo_fund&&a.mo_year&&(CY-a.mo_year>=5),text:(a)=>`קרן הלוואות מ-${a.mo_year} — הפכה למענק`},
      {urg:'within30',cond:(a)=>a.mo_fund&&a.mo_year&&(CY-a.mo_year<5),text:(a)=>`קרן הלוואות — ${5-(CY-a.mo_year)} שנים עד מענק`,clerkNote:'אם רוצים להחזיר — חשב סכום'},
      {urg:'urgent',cond:(a)=>a.mo_intent==='למכור כעת',text:'ליצור קשר עם ניידות לשובר החזר — לפני מכירה'},
    ],
    trs:[{cond:(a)=>a.mo_grant&&a.mo_year&&(CY-a.mo_year<7)&&a.mo_intent==='למכור כעת',text:'מכירה לפני 7 שנים — חובת החזר',fix:'תאם עם ניידות חישוב יתרה'}],
  },
  { id:'cs', title:'חיסכון לכל ילד',
    qs:[
      {id:'cs_fund',text:'היכן חסכונות הילד שנפטר? (קופה/בנק)',at:'text',phase:'clerk',info:'הפקדות ימשכו 3 חודשים. משיכה עם טופס 5022'},
      {id:'cs_amt',text:'סכום משוער שנצבר (₪)',at:'number',phase:'clerk'},
      {id:'cs_others',text:'ילדים נוספים עם חיסכון',at:'number',phase:'family'},
      {id:'cs_where',text:'היכן חסכונות שאר הילדים?',at:'select',phase:'family',opts:['בנק','קופת גמל','לא יודעים'],showIf:(a)=>a.cs_others>0},
      {id:'cs_knows',text:'המשפחה יודעת כיצד למשוך?',at:'boolean',phase:'family'},
    ],
    ars:[
      {urg:'within30',cond:(a)=>!!a.cs_fund,text:(a)=>`טופס 5022 לקופה: ${a.cs_fund}. הפקדות ימשכו 3 חודשים מהפטירה.`,clerkNote:'הדפס טופס 5022. ודא שהמשפחה יודעת כיצד למשוך.'},
      {urg:'planning',cond:(a)=>a.cs_where==='בנק',text:'חסכונות ילדים בבנק — מומלץ העברה לקופת גמל (תשואה גבוהה יותר, דמי ניהול נמוכים)',clerkNote:'הסבר למשפחה יתרונות קופת גמל מול בנק'},
    ],
  },
  { id:'pd', title:'נכות הורים ותוספת תלויים',
    qs:[
      {id:'pd_dis',text:'הורה מקבל קצבת נכות?',at:'boolean',phase:'clerk'},
      {id:'pd_who',text:'מי?',at:'select',phase:'clerk',opts:['אב','אם','שניהם'],showIf:(a)=>a.pd_dis===true},
      {id:'pd_dep',text:'תוספת תלויים עבור הילד שנפטר',at:'status',phase:'clerk',opts:['כן','לא','לבדיקה'],showIf:(a)=>a.pd_dis===true,info:'יש לעדכן מערכת. סכומי נכות: 100%: 4,711 ₪ | 74%: 3,211 ₪ (חוזר 33, 2026)'},
    ],
    ars:[
      {urg:'within30',cond:(a)=>a.pd_dis&&a.pd_dep==='כן',text:'תוספת תלויים לילד שנפטר — לעדכן מערכת',clerkNote:'עדכן תלויים, בדוק השפעה על קצבה. סכומי נכות מעודכנים בחוזר 33.'},
      {urg:'planning',cond:(a)=>a.pd_dis&&a.pd_dep==='לבדיקה',text:'לבדוק תוספת תלויים'},
    ],
  },
  { id:'sb', title:'אחים — ילדים נכים נוספים',
    qs:[
      {id:'sb_has',text:'יש עוד ילדים זכאים לקצבת ילד נכה?',at:'boolean',phase:'family'},
      {id:'sb_n',text:'כמה?',at:'number',phase:'family',showIf:(a)=>a.sb_has===true},
      {id:'sb_recv',text:'כולם מקבלים קצבה?',at:'boolean',phase:'family',showIf:(a)=>a.sb_has===true},
    ],
    ars:[{urg:'urgent',cond:(a)=>a.sb_has&&a.sb_recv===false,text:(a)=>`${a.sb_n||''} ילדים נכים לא מקבלים קצבה — לפתוח תביעות`}],
  },
  { id:'ub', title:'אבטלה ושיקום מקצועי',
    qs:[
      {id:'ub_sys',text:'זכאות אבטלה במערכת',at:'status',phase:'clerk',opts:['זכאי','לא זכאי','לבדיקה']},
      {id:'ub_stop',text:'הורה הפסיק לעבוד בשנה האחרונה?',at:'boolean',phase:'family'},
      {id:'ub_why',text:'סיבת עזיבה',at:'select',phase:'family',opts:['פיטורין','התפטרות בשל טיפול בילד','אחר'],showIf:(a)=>a.ub_stop===true},
      {id:'ub_mo',text:'חודשי עבודה מתוך 18 אחרונים',at:'number',phase:'family',showIf:(a)=>a.ub_stop===true},
      {id:'ub_rehab',text:'מעוניין בהסבה מקצועית?',at:'boolean',phase:'family',info:'תיקון 208 — מימון לימודים ודמי מחיה'},
    ],
    ars:[
      {urg:'urgent',cond:(a)=>a.ub_stop&&a.ub_why==='התפטרות בשל טיפול בילד'&&a.ub_mo>=12,text:'התפטרות מוצדקת — אבטלה ללא המתנה',clerkNote:'התפטרות מוצדקת בשל טיפול בילד — ללא תקופת המתנה.'},
      {urg:'within30',cond:(a)=>a.ub_stop&&a.ub_why==='פיטורין'&&a.ub_mo>=12,text:'פיטורין — לפתוח תביעת אבטלה'},
      {urg:'planning',cond:(a)=>a.ub_rehab===true,text:'להפנות לפקיד שיקום — תיקון 208',clerkNote:'תיקון 208: מימון לימודים + דמי מחיה. פחות מ-30% ממשים.'},
    ],
  },
];

// ═══════════════════════════════════════════════
// תרחיש 2: נכות כללית
// ═══════════════════════════════════════════════
const GD: Section[] = [
  { id:'gd_dis', title:'קצבת נכות כללית',
    qs:[
      {id:'gd1',text:'אחוז נכות מוכרת',at:'number',phase:'clerk',warn:(a)=>a.gd1<60?'מתחת ל-60% — אין זכאות':null,info:'סכומים: 100%: 4,711 ₪ | 74%: 3,211 ₪ | 65%: 2,894 ₪ | 60%: 2,718 ₪ (חוזר 33, 2026)'},
      {id:'gd2',text:'מקבל קצבת נכות?',at:'boolean',phase:'clerk'},
      {id:'gd3',text:'גיל',at:'number',phase:'clerk',warn:(a)=>a.gd3>=67?'גיל פרישה — בדוק זקנה מול נכות':null},
      {id:'gd_marital',text:'מצב משפחתי',at:'select',phase:'clerk',opts:['נשואים','גרושים','רווק/ה','אלמן/ה'],info:'במקרה של גירושין — חלוקת גמלאות מורכבת, נדרש ייעוץ פרטני'},
      {id:'gd_other_allow',text:'גמלאות נוספות',at:'multiselect',phase:'clerk',opts:['סיעוד','הבטחת הכנסה','שאירים'],info:'בדוק חפיפות וצירופים. נכות + ניידות = מצטברות.'},
      {id:'gd4',text:'הכנסה חודשית מעבודה (₪)',at:'number',phase:'family'},
    ],
    ars:[
      {urg:'urgent',cond:(a)=>a.gd1>=60&&a.gd2===false,text:'זכאי לנכות ולא מגיש — לפתוח תביעה',clerkNote:'נכות 60%+ = זכאות. סכומים מעודכנים בחוזר 33, 2026.'},
      {urg:'urgent',cond:(a)=>a.gd3>=67&&a.gd2===true,text:'גיל פרישה — בדוק מה גבוה יותר: זקנה או נכות. בונוס דחייה: +5% לשנה',clerkNote:'חשב ערך מצטבר לטווח ארוך. זקנה בסיסי: ~1,810 ₪ יחיד | ~2,730 ₪ זוג (חוזר 33).'},
      {urg:'within30',cond:(a)=>a.gd_marital==='גרושים',text:'מבוטח/ת גרוש/ה — חלוקת גמלאות מורכבת. נדרש ייעוץ פרטני',clerkNote:'אין לחשב חלוקת גמלאות אוטומטית. הפנה ליועץ.'},
    ],
    trs:[
      {cond:(a)=>a.gd4>0,text:'הכנסה מעבודה משפיעה על קצבה',fix:'חשב "נקודת שבירה" — ההכנסה שממנה הפסד הזכויות הנלוות עולה על הרווח'},
    ],
  },
  { id:'gd_sp', title:'שירותים מיוחדים (שר"מ)',
    qs:[
      {id:'gd_sp1',text:'מקבל שר"מ?',at:'boolean',phase:'clerk',info:'לא אוטומטי — פחות מ-30% ממשים! חייב הגשה נפרדת.'},
      {id:'gd_sp2',text:'זקוק לעזרה בפעולות יומיום?',at:'boolean',phase:'family'},
    ],
    ars:[{urg:'urgent',cond:(a)=>a.gd_sp2===true&&a.gd_sp1===false,text:'זכאי לשר"מ ולא מקבל — פחות מ-30% ממשים! חייב הגשה נפרדת',clerkNote:'שר"מ לא אוטומטי. הגשה נפרדת חובה. פחות מ-30% מממשים.'}],
  },
  { id:'gd_mo', title:'ניידות',
    qs:[
      {id:'gd_mo1',text:'קשיי ניידות?',at:'boolean',phase:'family'},
      {id:'gd_mo2',text:'מקבל תמיכת ניידות?',at:'boolean',phase:'clerk'},
    ],
    ars:[{urg:'planning',cond:(a)=>a.gd_mo1===true&&a.gd_mo2===false,text:'לבדוק זכאות ניידות — מצטברת עם נכות'}],
  },
  { id:'gd_voc', title:'שיקום מקצועי',
    qs:[
      {id:'gd_v1',text:'הנכות משפיעה על כושר עבודה?',at:'boolean',phase:'family'},
      {id:'gd_v2',text:'מעוניין בהסבה מקצועית?',at:'boolean',phase:'family'},
    ],
    ars:[{urg:'planning',cond:(a)=>a.gd_v2===true,text:'להפנות לפקיד שיקום — פחות מ-30% ממשים',clerkNote:'שיקום מקצועי: מימון לימודים + דמי מחיה. פחות מ-30% ממשים.'}],
  },
  { id:'gd_ext', title:'זכויות נלוות',
    qs:[
      {id:'gd_e1',text:'אחוז נכות',at:'number',phase:'clerk'},
      {id:'gd_e2',text:'מגיש טופס 127?',at:'boolean',phase:'clerk',info:'100% נכות = פטור מלא ממס הכנסה'},
      {id:'gd_e3',text:'בדק הנחת ביטוח רכב?',at:'boolean',phase:'family'},
      {id:'gd_e4',text:'בדק הנחת ארנונה?',at:'boolean',phase:'family'},
      {id:'gd_e5',text:'בדק הנחת חשמל?',at:'boolean',phase:'family'},
    ],
    ars:[
      {urg:'within30',cond:(a)=>a.gd_e1>=100&&a.gd_e2===false,text:'נכות 100% — פטור מס (טופס 127)',clerkNote:'פטור מלא ממס הכנסה. רשות המסים.'},
      {urg:'within30',cond:(a)=>a.gd_e3===false,text:'הנחת ביטוח רכב — לפנות לחברת הביטוח'},
      {urg:'within30',cond:(a)=>a.gd_e4===false,text:'הנחת ארנונה — עד 70%, לפנות לרשות המקומית'},
      {urg:'within30',cond:(a)=>a.gd_e5===false,text:'הנחת חשמל — לפנות לחברת החשמל'},
    ],
    related:[
      {name:'פטור מס הכנסה',body:'רשות המסים',note:'100% — פטור מלא'},
      {name:'הנחת ביטוח רכב',body:'חברות ביטוח'},
      {name:'הנחת ארנונה',body:'רשות מקומית',note:'עד 70%'},
      {name:'הנחת חשמל',body:'חברת החשמל',note:'הנחה לנכים'},
      {name:'הנחת מים',body:'תאגיד המים',note:'תעריף מופחת'},
      {name:'תחבורה ציבורית',body:'משרד התחבורה',note:'הנחה בכרטיס רב-קו'},
    ],
  },
];

// ═══════════════════════════════════════════════
// תרחיש 3: הורה לילד נכה
// ═══════════════════════════════════════════════
const HC: Section[] = [
  { id:'hc_dis', title:'קצבת ילד נכה',
    qs:[
      {id:'hc1',text:'גיל הילד',at:'number',phase:'clerk',warn:(a)=>a.hc1>=18?'גיל 18 — להגיש נכות כללית!':null,info:'זכאות מגיל 91 יום עד 18. 100% נכות ≠ 100% קצבה — יש מדרגות לפי גיל ותפקוד.'},
      {id:'hc2',text:'אחוז נכות',at:'number',phase:'clerk'},
      {id:'hc3',text:'מקבל קצבת ילד נכה?',at:'boolean',phase:'clerk'},
      {id:'hc_marital',text:'מצב משפחתי ההורים',at:'select',phase:'clerk',opts:['נשואים','גרושים'],info:'במקרה של גירושין — חלוקת גמלאות מורכבת, נדרש ייעוץ פרטני'},
      {id:'hc_other_allow',text:'גמלאות נוספות שמקבלת המשפחה',at:'multiselect',phase:'clerk',opts:['סיעוד','הבטחת הכנסה','נכות כללית'],info:'ילד נכה + קצבת ילדים = מצטברות!'},
      {id:'hc4',text:'שינוי בתפקוד לאחרונה?',at:'boolean',phase:'family',info:'הידרדרות = "הגדלת קצבה" — לא הגשה מחדש. שני מסלולים שונים לחלוטין.'},
    ],
    ars:[
      {urg:'urgent',cond:(a)=>a.hc3===false&&a.hc1>=0.25&&a.hc1<18,text:'לא מגיש ילד נכה — לפתוח תביעה'},
      {urg:'urgent',cond:(a)=>a.hc1>=17,text:'גיל 17+ — להגיש נכות כללית לפני 18! מעבר לא אוטומטי.',clerkNote:'הגש 6 חודשים לפני גיל 18. מעבר ילד נכה → נכות כללית לא אוטומטי — חייב הגשה פרואקטיבית.'},
      {urg:'within30',cond:(a)=>a.hc4===true,text:'הידרדרות — "הגדלת קצבה" (לא הגשה מחדש)',clerkNote:'הגדלת קצבה ≠ הגשה מחדש. שני מסלולים שונים.'},
      {urg:'within30',cond:(a)=>a.hc_marital==='גרושים',text:'הורים גרושים — חלוקת גמלאות מורכבת. נדרש ייעוץ פרטני',clerkNote:'אין לחשב חלוקת גמלאות אוטומטית. הפנה ליועץ.'},
    ],
    trs:[{cond:(a)=>a.hc1>=17&&a.hc1<19,text:'מעבר 18 לא אוטומטי',fix:'הגש 6 חודשים לפני 18'}],
  },
  { id:'hc_ch', title:'קצבת ילדים',
    qs:[{id:'hc_ch1',text:'מקבלים קצבת ילדים?',at:'boolean',phase:'clerk',info:'מצטברת עם ילד נכה — ~170 ₪ לילד (חוזר 33, 2026)'}],
    ars:[{urg:'within30',cond:(a)=>a.hc_ch1===false,text:'לא מקבלים קצבת ילדים — לבדוק. מצטברת עם ילד נכה.'}],
  },
  { id:'hc_wel', title:'סל שירותים — רווחה',
    qs:[
      {id:'hc_w1',text:'ממצים סל שירותים?',at:'boolean',phase:'family',info:'40% לא ממצים! סל שירותים ממשרד הרווחה (לא מביטוח לאומי)'},
      {id:'hc_w2',text:'ידועות המסגרות?',at:'boolean',phase:'family'},
    ],
    ars:[{urg:'within30',cond:(a)=>a.hc_w1===false,text:'לא ממצים סל רווחה — להפנות לעו"ס. 40% לא ממצים!',clerkNote:'סל שירותים ממשרד הרווחה, לא מביטוח לאומי. 40% לא ממצים.'}],
  },
  { id:'hc_18', title:'מעבר גיל 18',
    qs:[
      {id:'hc_18a',text:'גיל הילד',at:'number',phase:'clerk',warn:(a)=>a.hc_18a>=17?'גיל קריטי!':null},
      {id:'hc_18b',text:'הוגשה נכות כללית?',at:'boolean',phase:'clerk'},
    ],
    ars:[{urg:'urgent',cond:(a)=>a.hc_18a>=16&&a.hc_18b===false,text:'גיל 16+ — להגיש נכות כללית! מעבר לא אוטומטי',clerkNote:'הגש 6 חודשים לפני 18. מעבר לא אוטומטי — חייב הגשה פרואקטיבית.'}],
    trs:[{cond:(a)=>a.hc_18a>=18&&a.hc_18b===false,text:'עבר 18 ולא הגיש',fix:'הגש מיידית — ניתן לתבוע 12 חודשים רטרואקטיבית'}],
  },
  { id:'hc_ext', title:'זכויות נלוות',
    qs:[
      {id:'hc_e1',text:'הנחת ארנונה?',at:'boolean',phase:'family'},
      {id:'hc_e2',text:'טופס 127 (6090)?',at:'boolean',phase:'family'},
      {id:'hc_e3',text:'סיוע שיכון?',at:'boolean',phase:'family'},
      {id:'hc_e4',text:'הנחת חשמל?',at:'boolean',phase:'family'},
    ],
    ars:[
      {urg:'within30',cond:(a)=>a.hc_e1===false,text:'הנחת ארנונה — לפנות לרשות המקומית'},
      {urg:'within30',cond:(a)=>a.hc_e2===false,text:'טופס 127 — זיכוי מס 6090'},
      {urg:'within30',cond:(a)=>a.hc_e4===false,text:'הנחת חשמל — לפנות לחברת החשמל'},
    ],
    related:[
      {name:'הנחת ארנונה',body:'רשות מקומית'},
      {name:'הנחת חשמל',body:'חברת החשמל'},
      {name:'הנחת מים',body:'תאגיד המים'},
      {name:'זיכוי מס 6090',body:'רשות המסים'},
      {name:'סיוע שיכון',body:'משרד הבינוי'},
      {name:'קרן השתלמות',body:'משרד החינוך',note:'להורים לילדים עם מוגבלות'},
      {name:'תחבורה ציבורית',body:'משרד התחבורה',note:'הנחה בכרטיס רב-קו'},
    ],
  },
];

const SCENARIOS: Scenario[] = [
  {id:'ddc',name:'פטירת ילד נכה',icon:'💙',desc:'הורה לילד עם מוגבלות שנפטר',active:true,color:'blue',sections:DDC},
  {id:'gd',name:'נכות כללית',icon:'♿',desc:'כלי עזר למקרים מורכבים — נכות 60%+',active:true,color:'orange',sections:GD},
  {id:'hc',name:'הורה לילד נכה',icon:'👨‍👩‍👧',desc:'כלי עזר למקרים מורכבים — ילד עם מוגבלות',active:true,color:'teal',sections:HC},
  {id:'ep',name:'קשיש/ה — הכנסה נמוכה',icon:'🏠',desc:'קשיש 67+',active:false,color:'green',sections:[]},
  {id:'w',name:'שכול — אלמן/ה',icon:'🕊️',desc:'אלמנה/אלמן',active:false,color:'purple',sections:[]},
  {id:'u',name:'פיטורין / אבטלה',icon:'💼',desc:'עובד שפוטר',active:false,color:'red',sections:[]},
];

const STEPS = ['בחירת תרחיש','בדיקות פקיד','סיכום ביניים','שאלון למשפחה','ממצאים ומימוש'];
const uLbl = (u:Urg) => u==='urgent'?'דחוף':u==='within30'?'תוך 30 יום':'לתכנון';
const uClr = (u:Urg) => u==='urgent'?'bg-red-100 text-red-800 border-red-300':u==='within30'?'bg-amber-100 text-amber-800 border-amber-300':'bg-sky-100 text-sky-800 border-sky-300';
const uDot = (u:Urg) => u==='urgent'?'bg-red-500':u==='within30'?'bg-amber-500':'bg-sky-500';
const sClr:Record<string,string> = {blue:'border-blue-500 bg-blue-50 hover:bg-blue-100',green:'border-green-500 bg-green-50',purple:'border-purple-500 bg-purple-50',orange:'border-orange-500 bg-orange-50 hover:bg-orange-100',teal:'border-teal-500 bg-teal-50 hover:bg-teal-100',red:'border-red-500 bg-red-50'};
const sBdg:Record<string,string> = {blue:'bg-blue-600 text-white',green:'bg-green-600 text-white',purple:'bg-purple-600 text-white',orange:'bg-orange-600 text-white',teal:'bg-teal-600 text-white',red:'bg-red-600 text-white'};

// BTL Links
const BTL_LINKS = [
  {name:'ארנק זכויות',url:'https://www.btl.gov.il/benefits/Pages/default.aspx',icon:'💼'},
  {name:'אירועי חיים',url:'https://www.btl.gov.il/Life%20Events/Pages/default.aspx',icon:'🔄'},
  {name:'אתר ביטוח לאומי',url:'https://www.btl.gov.il',icon:'🏛️'},
];

// Feedback
type FCat = 'professional'|'ux'|'process'|'data';
type FSev = 'critical'|'improvement'|'minor';
interface FEntry { id:number; category:FCat; severity:FSev; screen:string; description:string; suggestion:string; ts:string; }
const catL:Record<FCat,string> = {professional:'📋 תוכן מקצועי',ux:'🖥️ ממשק',process:'🔄 תהליך',data:'📊 נתונים'};
const sevL:Record<FSev,string> = {critical:'🔴 קריטי',improvement:'🟡 שיפור',minor:'🟢 מינורי'};

function FeedbackModal({items,scenName,onAdd,onClose}:{items:FEntry[];scenName:string;onAdd:(e:FEntry)=>void;onClose:()=>void}) {
  const [cat,setCat]=useState<FCat>('professional');
  const [sev,setSev]=useState<FSev>('improvement');
  const [desc,setDesc]=useState('');
  const [sugg,setSugg]=useState('');
  const [copied,setCopied]=useState(false);
  const [tab,setTab]=useState<'add'|'list'>('add');
  const submit=()=>{
    if(!desc.trim()) return;
    const e:FEntry={id:Date.now(),category:cat,severity:sev,screen:scenName||'כללי',description:desc.trim(),suggestion:sugg.trim(),ts:new Date().toLocaleTimeString('he-IL')};
    onAdd(e); sendSheet({category:catL[cat],severity:sevL[sev],text:e.description+(e.suggestion?` | ${e.suggestion}`:''),page:scenName||'כללי'});
    setDesc('');setSugg('');setTab('list');
  };
  const exp=()=>{
    const t=[`=== משוב מיצוי 360 ===`,`${scenName} | ${new Date().toLocaleDateString('he-IL')}`,'',
      ...items.map((e,i)=>`${i+1}. [${catL[e.category]}] ${e.description}${e.suggestion?' → '+e.suggestion:''}`),'=== סוף ==='].join('\n');
    navigator.clipboard.writeText(t).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2500);});
  };
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" dir="rtl">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div><h2 className="font-bold text-base">משוב מקצועי</h2><p className="text-xs text-gray-500">{items.length} הערות</p></div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl font-bold">×</button>
        </div>
        <div className="flex border-b">{(['add','list'] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)} className={`flex-1 py-2.5 text-sm font-medium ${tab===t?'border-b-2 border-blue-600 text-blue-700':'text-gray-500'}`}>{t==='add'?'+ הוסף':`הערות (${items.length})`}</button>
        ))}</div>
        <div className="overflow-y-auto flex-1 p-5">
          {tab==='add'?(
            <div className="space-y-4">
              <div><label className="block text-xs font-semibold text-gray-600 mb-2">קטגוריה</label><div className="grid grid-cols-2 gap-2">{(Object.keys(catL) as FCat[]).map(c=>(<button key={c} onClick={()=>setCat(c)} className={`py-2 px-3 rounded-lg text-xs font-medium border ${cat===c?'bg-blue-700 text-white border-blue-700':'border-gray-300 text-gray-700'}`}>{catL[c]}</button>))}</div></div>
              <div><label className="block text-xs font-semibold text-gray-600 mb-2">חומרה</label><div className="flex gap-2">{(Object.keys(sevL) as FSev[]).map(s=>(<button key={s} onClick={()=>setSev(s)} className={`flex-1 py-2 rounded-lg text-xs font-medium border ${sev===s?'bg-blue-700 text-white border-blue-700':'border-gray-300 text-gray-700'}`}>{sevL[s]}</button>))}</div></div>
              <div><label className="block text-xs font-semibold text-gray-600 mb-2">תיאור *</label><textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={3} placeholder="..." className="w-full border rounded-lg px-3 py-2.5 text-sm text-right resize-none focus:ring-2 focus:ring-blue-500 outline-none"/></div>
              <div><label className="block text-xs font-semibold text-gray-600 mb-2">הצעה</label><textarea value={sugg} onChange={e=>setSugg(e.target.value)} rows={2} placeholder="..." className="w-full border rounded-lg px-3 py-2.5 text-sm text-right resize-none focus:ring-2 focus:ring-blue-500 outline-none"/></div>
              <button onClick={submit} disabled={!desc.trim()} className={`w-full py-3 rounded-xl font-bold text-sm ${desc.trim()?'bg-blue-700 text-white':'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>שמור</button>
            </div>
          ):(
            <div className="space-y-3">
              {items.length===0&&<p className="text-gray-400 text-sm text-center py-6">אין הערות</p>}
              {items.map(e=>(<div key={e.id} className="bg-gray-50 border rounded-xl p-3"><div className="flex gap-2 mb-1 text-xs flex-wrap"><span className="font-bold text-blue-700">{catL[e.category]}</span><span>{sevL[e.severity]}</span><span className="text-gray-400 mr-auto">{e.ts}</span></div><p className="text-sm font-medium">{e.description}</p>{e.suggestion&&<p className="text-xs text-gray-500 mt-1">💡 {e.suggestion}</p>}</div>))}
            </div>
          )}
        </div>
        {items.length>0&&<div className="border-t p-4 bg-gray-50 rounded-b-2xl"><button onClick={exp} className={`w-full py-2.5 rounded-xl text-sm font-bold ${copied?'bg-green-600 text-white':'bg-gray-800 text-white hover:bg-gray-900'}`}>{copied?'✓ הועתק!':`📋 העתק ${items.length} הערות`}</button></div>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// Helper: generate full export text for download
// ═══════════════════════════════════════════════
function buildExportText(scenName:string, today:string, actions:{urg:Urg;text:string;tag:string;clerkNote?:string}[], traps:{text:string;fix?:string}[], related:RB[], staffNotes:string, actionNotes:Record<number,string>) {
  const lines:string[] = [];
  lines.push('══════════════════════════════════════');
  lines.push('       מיצוי 360 — סיכום פגישה');
  lines.push('══════════════════════════════════════');
  lines.push(`תרחיש: ${scenName}`);
  lines.push(`תאריך: ${today}`);
  lines.push('');

  const urgent = actions.filter(a=>a.urg==='urgent');
  const within30 = actions.filter(a=>a.urg==='within30');
  const planning = actions.filter(a=>a.urg==='planning');

  if(urgent.length>0){
    lines.push('🔴 דחוף — לטפל מיד:');
    lines.push('─────────────────────');
    urgent.forEach((a,i)=>{
      lines.push(`  ${i+1}. ${a.text}`);
      if(a.clerkNote) lines.push(`     📋 ${a.clerkNote}`);
      const ni = actions.indexOf(a);
      if(actionNotes[ni]) lines.push(`     📝 הערה: ${actionNotes[ni]}`);
    });
    lines.push('');
  }
  if(within30.length>0){
    lines.push('🟡 תוך 30 יום:');
    lines.push('─────────────────────');
    within30.forEach((a,i)=>{
      lines.push(`  ${i+1}. ${a.text}`);
      if(a.clerkNote) lines.push(`     📋 ${a.clerkNote}`);
      const ni = actions.indexOf(a);
      if(actionNotes[ni]) lines.push(`     📝 הערה: ${actionNotes[ni]}`);
    });
    lines.push('');
  }
  if(planning.length>0){
    lines.push('🔵 לתכנון:');
    lines.push('─────────────────────');
    planning.forEach((a,i)=>{
      lines.push(`  ${i+1}. ${a.text}`);
      if(a.clerkNote) lines.push(`     📋 ${a.clerkNote}`);
      const ni = actions.indexOf(a);
      if(actionNotes[ni]) lines.push(`     📝 הערה: ${actionNotes[ni]}`);
    });
    lines.push('');
  }

  if(traps.length>0){
    lines.push('⚠️ אזהרות:');
    lines.push('─────────────────────');
    traps.forEach(t=>{
      lines.push(`  - ${t.text}`);
      if(t.fix) lines.push(`    → ${t.fix}`);
    });
    lines.push('');
  }

  if(related.length>0){
    lines.push('↗ זכויות נלוות:');
    lines.push('─────────────────────');
    related.forEach(r=>lines.push(`  - ${r.name} — ${r.body}${r.note?' ('+r.note+')':''}`));
    lines.push('');
  }

  // Follow-up checklist
  lines.push('✅ צ\'קליסט פולו-אפ — פקיד:');
  lines.push('─────────────────────');
  if(urgent.length>0) urgent.forEach((a,i)=>lines.push(`  ☐ ${a.text}`));
  if(within30.length>0) within30.forEach((a,i)=>lines.push(`  ☐ ${a.text}`));
  lines.push('');
  lines.push('✅ צ\'קליסט פולו-אפ — משפחה:');
  lines.push('─────────────────────');
  if(related.length>0) related.forEach(r=>lines.push(`  ☐ ${r.name} — פנייה ל${r.body}`));
  if(planning.length>0) planning.forEach(a=>lines.push(`  ☐ ${a.text}`));
  lines.push('');

  if(staffNotes){
    lines.push('הערות כלליות:');
    lines.push('─────────────────────');
    lines.push(staffNotes);
    lines.push('');
  }

  lines.push('🔗 קישורים שימושיים:');
  lines.push('─────────────────────');
  lines.push('  ארנק זכויות: https://www.btl.gov.il/benefits/Pages/default.aspx');
  lines.push('  אירועי חיים: https://www.btl.gov.il/Life%20Events/Pages/default.aspx');
  lines.push('  אתר ביטוח לאומי: https://www.btl.gov.il');
  lines.push('');
  lines.push('══════════════════════════════════════');
  lines.push('⚠️ אמת פרטים ב-btl.gov.il או *6050 לפני הגשה.');
  lines.push(`מיצוי 360 v5.0 | ${today} | אין שמירת מידע אישי`);
  lines.push('══════════════════════════════════════');
  return lines.join('\n');
}

function buildFamilySummary(scenName:string, today:string, actions:{urg:Urg;text:string;tag:string;clerkNote?:string}[], related:RB[]) {
  const urgentActions = actions.filter(a=>a.urg==='urgent');
  const within30Actions = actions.filter(a=>a.urg==='within30');
  const planningActions = actions.filter(a=>a.urg==='planning');
  const lines:string[] = [];
  lines.push(`שלום רב 👋`);
  lines.push(``);
  lines.push(`להלן סיכום הפגישה שלנו בביטוח לאומי:`);
  lines.push(`📅 ${today} | ${scenName}`);
  lines.push(``);
  if(urgentActions.length>0){
    lines.push(`🔴 *דורש טיפול מיידי:*`);
    urgentActions.forEach((a,i)=>lines.push(`   ${i+1}. ${a.text}`));
    lines.push(``);
  }
  if(within30Actions.length>0){
    lines.push(`🟡 *לטפל תוך 30 יום:*`);
    within30Actions.forEach((a,i)=>lines.push(`   ${i+1}. ${a.text}`));
    lines.push(``);
  }
  if(planningActions.length>0){
    lines.push(`🔵 *לתכנון:*`);
    planningActions.forEach((a,i)=>lines.push(`   ${i+1}. ${a.text}`));
    lines.push(``);
  }
  if(related.length>0){
    lines.push(`📌 *זכויות נוספות שכדאי לבדוק:*`);
    related.forEach(r=>lines.push(`   ↗ ${r.name} — ${r.body}${r.note?' ('+r.note+')':''}`));
    lines.push(``);
  }
  // Follow-up for family
  const familyTasks = [...(related.map(r=>`${r.name} — פנייה ל${r.body}`)), ...(planningActions.map(a=>a.text))];
  if(familyTasks.length>0){
    lines.push(`✅ *מה עליכם לעשות:*`);
    familyTasks.forEach((t,i)=>lines.push(`   ${i+1}. ${t}`));
    lines.push(``);
  }
  lines.push(`🔗 *קישורים שימושיים:*`);
  lines.push(`   ארנק זכויות: btl.gov.il/benefits`);
  lines.push(`   אירועי חיים: btl.gov.il/Life-Events`);
  lines.push(``);
  lines.push(`ℹ️ לבירורים: *6050 או btl.gov.il`);
  lines.push(`📎 סיכום זה הופק ע"י מערכת מיצוי 360 — ביטוח לאומי`);
  return lines.join('\n');
}

// ═══════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════
export default function App() {
  const [step,setStep]=useState(0);
  const [scenId,setScenId]=useState<string|null>(null);
  const [ans,setAns]=useState<A>({});
  const [resetPending,setResetPending]=useState(false);
  const [feedbackItems,setFeedbackItems]=useState<FEntry[]>([]);
  const [showFeedback,setShowFeedback]=useState(false);
  const [staffNotes,setStaffNotes]=useState('');
  const [actionNotes,setActionNotes]=useState<Record<number,string>>({});
  const [auditCopied,setAuditCopied]=useState(false);
  const [familyCopied,setFamilyCopied]=useState(false); // BUG FIX: was missing
  const [counterSent,setCounterSent]=useState(false);

  const scen = useMemo(()=>SCENARIOS.find(s=>s.id===scenId)||null,[scenId]);
  const sections = scen?.sections||[];

  const clerkQs = useMemo(()=>{
    const r:{sec:Section;q:Q}[]=[];
    for(const s of sections) for(const q of s.qs) if(q.phase==='clerk'&&(!q.showIf||q.showIf(ans))) r.push({sec:s,q});
    return r;
  },[sections,ans]);
  const familyQs = useMemo(()=>{
    const r:{sec:Section;q:Q}[]=[];
    for(const s of sections) for(const q of s.qs) if(q.phase==='family'&&(!q.showIf||q.showIf(ans))) r.push({sec:s,q});
    return r;
  },[sections,ans]);
  const missingClerk = useMemo(()=>clerkQs.filter(({q})=>ans[q.id]===undefined||ans[q.id]===''),[clerkQs,ans]);
  const missingFamily = useMemo(()=>familyQs.filter(({q})=>ans[q.id]===undefined||ans[q.id]===''),[familyQs,ans]);

  const actions = useMemo(()=>{
    const r:{urg:Urg;text:string;tag:string;clerkNote?:string}[]=[];
    for(const s of sections) for(const ar of s.ars) if(ar.cond(ans)) r.push({urg:ar.urg,text:typeof ar.text==='function'?ar.text(ans):ar.text,tag:s.title,clerkNote:ar.clerkNote});
    return r.sort((a,b)=>({urgent:0,within30:1,planning:2}[a.urg])-({urgent:0,within30:1,planning:2}[b.urg]));
  },[sections,ans]);
  const traps = useMemo(()=>{
    const r:{text:string;fix?:string}[]=[];
    for(const s of sections) for(const t of s.trs||[]) if(t.cond(ans)) r.push({text:t.text,fix:t.fix});
    return r;
  },[sections,ans]);
  const related = useMemo(()=>{
    const r:RB[]=[];
    for(const s of sections) for(const rb of s.related||[]) r.push(rb);
    return r;
  },[sections]);

  const sa = useCallback((id:string,v:any)=>setAns(p=>({...p,[id]:v})),[]);
  const doReset = ()=>{setStep(0);setScenId(null);setAns({});setResetPending(false);setStaffNotes('');setActionNotes({});setCounterSent(false);setFamilyCopied(false);};
  const today = new Date().toLocaleDateString('he-IL',{year:'numeric',month:'long',day:'numeric'});
  const urgCnt = actions.filter(a=>a.urg==='urgent').length;

  // Download export as file
  const downloadExport = () => {
    const text = buildExportText(scen?.name||'', today, actions, traps, related, staffNotes, actionNotes);
    const blob = new Blob(['\uFEFF'+text], {type:'text/plain;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `מיצוי-360-${scen?.name||'סיכום'}-${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Multi-select toggle helper
  const toggleMulti = (id:string, val:string) => {
    setAns(p => {
      const cur:string[] = Array.isArray(p[id]) ? [...p[id]] : [];
      const idx = cur.indexOf(val);
      if(idx>=0) cur.splice(idx,1); else cur.push(val);
      return {...p, [id]: cur};
    });
  };

  // Question renderer
  const renderQ = (q:Q, secTitle?:string) => (
    <div key={q.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      {secTitle&&<p className="text-xs text-blue-600 font-semibold mb-1">{secTitle}</p>}
      <label className="block font-medium text-sm mb-3 text-gray-800">{q.text}</label>
      {q.at==='boolean'&&<div className="flex gap-3">{[true,false].map(v=>(<button key={String(v)} onClick={()=>sa(q.id,v)} className={`flex-1 py-2.5 rounded-lg text-sm font-bold border ${ans[q.id]===v?(v?'bg-green-600 text-white border-green-600':'bg-red-500 text-white border-red-500'):'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}>{v?'כן':'לא'}</button>))}</div>}
      {q.at==='number'&&<input type="number" value={ans[q.id]??''} onChange={e=>sa(q.id,e.target.value===''?'':Number(e.target.value))} className="w-full border rounded-lg px-4 py-2.5 text-sm text-right focus:ring-2 focus:ring-blue-500 outline-none"/>}
      {q.at==='text'&&<input type="text" value={ans[q.id]??''} onChange={e=>sa(q.id,e.target.value)} className="w-full border rounded-lg px-4 py-2.5 text-sm text-right focus:ring-2 focus:ring-blue-500 outline-none"/>}
      {q.at==='date'&&<input type="date" value={ans[q.id]??''} onChange={e=>sa(q.id,e.target.value)} className="w-full border rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"/>}
      {(q.at==='select'||q.at==='status')&&q.opts&&<div className="flex flex-wrap gap-2">{q.opts.map(o=>(<button key={o} onClick={()=>sa(q.id,o)} className={`flex-1 min-w-fit py-2 px-3 rounded-lg text-xs font-medium border ${ans[q.id]===o?'bg-blue-700 text-white border-blue-700':'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}>{o}</button>))}</div>}
      {q.at==='multiselect'&&q.opts&&<div className="flex flex-wrap gap-2">{q.opts.map(o=>{const sel=Array.isArray(ans[q.id])&&ans[q.id].includes(o);return(<button key={o} onClick={()=>toggleMulti(q.id,o)} className={`flex-1 min-w-fit py-2 px-3 rounded-lg text-xs font-medium border ${sel?'bg-blue-700 text-white border-blue-700':'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}>{sel?'✓ ':''}{o}</button>);})}</div>}
      {q.warn&&q.warn(ans)&&<div className="mt-2 flex items-start gap-2 bg-orange-50 border border-orange-300 rounded-lg p-2.5 text-orange-800 text-xs"><span>⚠️</span><span>{q.warn(ans)}</span></div>}
      {q.info&&<div className="mt-2 flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-blue-800 text-xs"><span>ℹ️</span><span>{q.info}</span></div>}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900" dir="rtl">
      <header className="no-print bg-blue-900 text-white py-4 px-6 shadow-lg">
        <div className="max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl font-bold">360</div>
            <div><h1 className="text-xl font-bold leading-none">מיצוי 360</h1><p className="text-blue-300 text-xs mt-0.5">כלי סיוע לפקידים במיצוי זכויות</p></div>
          </div>
          {step>0&&<button onClick={()=>resetPending?doReset():setResetPending(true)} onBlur={()=>setResetPending(false)} className={`text-sm px-4 py-2 rounded-lg font-medium ${resetPending?'bg-red-500 text-white':'bg-white/10 hover:bg-white/20 text-white'}`}>{resetPending?'⚠️ לחץ שוב':'↺ פגישה חדשה'}</button>}
        </div>
      </header>
      <nav className="no-print bg-white border-b py-3 px-6 shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center gap-1">
          {STEPS.map((label,i)=>(
            <Fragment key={i}>
              {i>0&&<div className={`flex-1 h-0.5 ${i<=step?'bg-blue-600':'bg-gray-200'}`}/>}
              <button onClick={()=>{if(i<step)setStep(i);}} disabled={i>step}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${i===step?'bg-blue-700 text-white shadow':i<step?'bg-blue-50 text-blue-700 cursor-pointer hover:bg-blue-100':'bg-gray-50 text-gray-400'}`}>
                <span className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold ${i<step?'bg-blue-600 text-white':''}`}>{i<step?'✓':i+1}</span>{label}
              </button>
            </Fragment>
          ))}
        </div>
      </nav>
      <main className="max-w-5xl mx-auto p-4 sm:p-6">

        {/* SCREEN 0 — בחירת תרחיש */}
        {step===0&&(
          <section className="animate-fade-in">
            <div className="mb-8 rounded-2xl overflow-hidden shadow-sm border">
              <div className="bg-gradient-to-l from-blue-900 to-blue-700 px-6 py-5 text-white">
                <h2 className="text-xl font-bold mb-1">ברוכים הבאים למיצוי 360</h2>
                <p className="text-blue-200 text-sm">כלי סיוע לפקידים במיצוי זכויות — ביטוח לאומי</p>
              </div>
              <div className="bg-white px-6 py-5">
                <p className="text-sm text-gray-700 leading-relaxed mb-4">המערכת מסייעת לזהות את <strong>מלוא הזכויות</strong> המגיעות למבוטח. התהליך בנוי ב-3 שלבים:</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[{e:'1️⃣',t:'בדיקות פקיד',d:'בדוק במערכת סטטוסים וזכאויות'},{e:'2️⃣',t:'שאלון למשפחה',d:'שאלות למילוי בפגישה'},{e:'3️⃣',t:'ממצאים ומימוש',d:'סיכום פעולות להדפסה'}].map((s,i)=>(
                    <div key={i} className="flex items-start gap-3 bg-slate-50 rounded-xl p-3"><span className="text-lg">{s.e}</span><div><p className="text-xs font-bold text-gray-800">{s.t}</p><p className="text-xs text-gray-500">{s.d}</p></div></div>
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-2 text-xs text-gray-400"><span>🔒</span><span>אין שמירת מידע אישי — הנתונים נמחקים בסגירת הדף</span></div>
              </div>
            </div>
            <h2 className="text-lg font-bold mb-1">בחר תרחיש</h2>
            <p className="text-sm text-gray-500 mb-4">{SCENARIOS.filter(s=>s.active).length} תרחישים פעילים</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {SCENARIOS.filter(s=>s.active).map(s=>(
                <button key={s.id} onClick={()=>{setScenId(s.id);setAns({});setStep(1);if(!counterSent){sendSheet({category:'counter',text:s.name,page:'home'});setCounterSent(true);}}}
                  className={`rounded-xl border-2 p-5 text-right transition-all hover:shadow-md cursor-pointer ${sClr[s.color]}`}>
                  <div className="flex items-start justify-between mb-2"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sBdg[s.color]}`}>פעיל</span><span className="text-2xl">{s.icon}</span></div>
                  <h3 className="font-bold text-base text-gray-900 mb-1">{s.name}</h3>
                  <p className="text-xs text-gray-500">{s.desc}</p>
                  <p className="text-xs text-gray-400 mt-2">{s.sections.length} נושאים</p>
                </button>
              ))}
            </div>
            {SCENARIOS.filter(s=>!s.active).length>0&&(
              <div className="mt-8">
                <h3 className="text-base font-bold mb-1 text-gray-500">תרחישים נוספים — בהמשך..</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 opacity-50 mt-3">
                  {SCENARIOS.filter(s=>!s.active).map(s=>(
                    <div key={s.id} className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-5 text-right">
                      <div className="flex items-start justify-between mb-2"><span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-300 text-gray-600">בהמשך..</span><span className="text-2xl grayscale">{s.icon}</span></div>
                      <h3 className="font-bold text-base text-gray-500 mb-1">{s.name}</h3><p className="text-xs text-gray-400">{s.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* SCREEN 1 — בדיקות פקיד */}
        {step===1&&scen&&(
          <section className="animate-fade-in">
            <div className="flex items-center gap-3 mb-1"><span className="text-2xl">{scen.icon}</span><h2 className="text-lg font-bold">בדיקות פקיד — {scen.name}</h2></div>
            <p className="text-sm text-gray-500 mb-5">מלא את הבדיקות במערכת לפי הסעיפים. כל הסעיפים פעילים — אין צורך לסמן רלוונטיות.</p>
            {sections.map(sec=>{
              const qs=sec.qs.filter(q=>q.phase==='clerk'&&(!q.showIf||q.showIf(ans)));
              if(qs.length===0) return null;
              return (
                <div key={sec.id} className="mb-6">
                  <h3 className="text-sm font-bold text-blue-800 mb-3 flex items-center gap-2 border-b border-blue-100 pb-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500"/>
                    {sec.title}
                  </h3>
                  <div className="space-y-3">{qs.map(q=>renderQ(q))}</div>
                </div>
              );
            })}
            <div className="mt-6 flex items-start gap-4">
              <button onClick={()=>setStep(2)} className="px-8 py-3 rounded-xl font-bold text-base bg-blue-700 text-white hover:bg-blue-800 shadow-md">המשך לסיכום ביניים ←</button>
              {missingClerk.length>0&&<p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 max-w-xs">⚠️ {missingClerk.length} שדות לא מולאו — ניתן להמשיך</p>}
            </div>
          </section>
        )}

        {/* SCREEN 2 — סיכום ביניים לפקיד */}
        {step===2&&scen&&(
          <section className="animate-fade-in">
            <div className="mb-5 bg-gradient-to-l from-indigo-600 to-blue-700 rounded-2xl p-5 text-white shadow-lg">
              <div className="flex items-center gap-3 mb-2"><span className="text-2xl">🔍</span><h2 className="text-lg font-bold">סיכום ביניים — {scen.name}</h2></div>
              <p className="text-blue-100 text-sm">ממצאים ראשוניים מהבדיקה במערכת. השתמש בכיוונים אלה כדי לדייק את השאלות למשפחה.</p>
            </div>
            <div className="mb-5 grid grid-cols-3 gap-3">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-red-600">{actions.filter(a=>a.urg==='urgent').length}</div>
                <div className="text-xs text-red-700 font-medium mt-1">דחוף — לטפל מיד</div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-amber-600">{actions.filter(a=>a.urg==='within30').length}</div>
                <div className="text-xs text-amber-700 font-medium mt-1">תוך 30 יום</div>
              </div>
              <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-sky-600">{actions.filter(a=>a.urg==='planning').length}</div>
                <div className="text-xs text-sky-700 font-medium mt-1">לתכנון</div>
              </div>
            </div>
            {actions.length>0&&(
              <div className="mb-5">
                <h3 className="text-base font-bold mb-3 text-indigo-900 flex items-center gap-2"><span>🧭</span>כיוונים שזוהו מהבדיקה</h3>
                <div className="space-y-2">
                  {actions.map((a,i)=>(
                    <div key={i} className={`rounded-xl border-r-4 p-3 ${a.urg==='urgent'?'border-r-red-500 bg-red-50':a.urg==='within30'?'border-r-amber-500 bg-amber-50':'border-r-sky-500 bg-sky-50'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${uClr(a.urg)}`}>{uLbl(a.urg)}</span>
                        <span className="text-xs text-gray-500">{a.tag}</span>
                      </div>
                      <p className="text-sm font-medium text-gray-900">{a.text}</p>
                      {a.clerkNote&&<p className="text-xs text-indigo-700 mt-1 bg-indigo-50 rounded px-2 py-1">💡 {a.clerkNote}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {traps.length>0&&(
              <div className="mb-5">
                <h3 className="text-base font-bold mb-3 text-orange-800 flex items-center gap-2"><span>⚠️</span>נקודות לתשומת לב</h3>
                <div className="space-y-2">{traps.map((t,i)=>(
                  <div key={i} className="bg-orange-50 border border-orange-300 rounded-xl p-3">
                    <p className="font-bold text-sm text-orange-800">{t.text}</p>
                    {t.fix&&<p className="text-xs text-orange-700 mt-1">→ {t.fix}</p>}
                  </div>
                ))}</div>
              </div>
            )}
            {familyQs.length>0&&(
              <div className="mb-5">
                <h3 className="text-base font-bold mb-3 text-purple-900 flex items-center gap-2"><span>🎯</span>שאלות מפתח לפגישה עם המשפחה ({familyQs.length})</h3>
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                  <p className="text-xs text-purple-700 mb-3">על בסיס הממצאים, אלה השאלות שכדאי לשאול בפגישה:</p>
                  <div className="space-y-2">
                    {familyQs.slice(0,8).map(({sec,q},i)=>(
                      <div key={q.id} className="flex items-start gap-2">
                        <span className="text-purple-500 font-bold text-sm shrink-0">{i+1}.</span>
                        <div>
                          <p className="text-sm text-gray-800">{q.text}</p>
                          <p className="text-xs text-purple-600">{sec.title}</p>
                        </div>
                      </div>
                    ))}
                    {familyQs.length>8&&<p className="text-xs text-purple-500 mt-2">+ עוד {familyQs.length-8} שאלות בשאלון המלא</p>}
                  </div>
                </div>
              </div>
            )}
            {missingClerk.length>0&&(
              <div className="mb-5 bg-amber-50 border border-amber-200 rounded-xl p-4">
                <h3 className="text-sm font-bold text-amber-800 mb-2">📝 שדות שלא מולאו בבדיקת הפקיד ({missingClerk.length})</h3>
                <div className="flex flex-wrap gap-1">
                  {missingClerk.map(({q})=>(
                    <span key={q.id} className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-lg">{q.text}</span>
                  ))}
                </div>
                <button onClick={()=>setStep(1)} className="mt-3 text-xs text-amber-800 underline hover:text-amber-900">← חזרה להשלמת בדיקות</button>
              </div>
            )}
            <div className="mt-6 flex items-center justify-between">
              <button onClick={()=>setStep(1)} className="px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-100 font-medium text-sm">→ חזרה לבדיקות</button>
              <button onClick={()=>setStep(3)} className="px-8 py-3 rounded-xl font-bold text-base bg-purple-600 text-white hover:bg-purple-700 shadow-md">המשך לשאלון משפחה ←</button>
            </div>
          </section>
        )}

        {/* SCREEN 3 — שאלון למשפחה */}
        {step===3&&scen&&(
          <section className="animate-fade-in">
            {familyQs.length===0?(
              <div className="text-center py-12">
                <p className="text-gray-500 text-lg mb-3">אין שאלות משפחה</p>
                <div className="flex gap-3 justify-center">
                  <button onClick={()=>setStep(2)} className="text-blue-600 underline text-sm">חזרה לסיכום ביניים</button>
                  <button onClick={()=>setStep(4)} className="px-6 py-2 rounded-xl bg-green-600 text-white font-bold text-sm">לממצאים ←</button>
                </div>
              </div>
            ):(
              <>
                <div className="mb-4 bg-purple-50 border border-purple-200 rounded-xl p-3 flex items-center gap-3">
                  <span className="text-xl">👨‍👩‍👧</span>
                  <div><p className="text-sm font-bold text-purple-900">שאלון למשפחה — {scen.name}</p><p className="text-xs text-purple-700">שאלות למילוי בפגישה עם המבוטח</p></div>
                </div>
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-sm font-bold text-gray-800">{familyQs.length} שאלות</span>
                  <span className="text-sm text-gray-400">{familyQs.length-missingFamily.length}/{familyQs.length} מולאו</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 mb-5"><div className="bg-purple-600 h-2 rounded-full transition-all" style={{width:`${familyQs.length>0?((familyQs.length-missingFamily.length)/familyQs.length)*100:0}%`}}/></div>
                {sections.map(sec=>{
                  const qs=sec.qs.filter(q=>q.phase==='family'&&(!q.showIf||q.showIf(ans)));
                  if(qs.length===0) return null;
                  return (
                    <div key={sec.id} className="mb-6">
                      <h3 className="text-sm font-bold text-purple-800 mb-3 flex items-center gap-2 border-b border-purple-100 pb-2"><span className="w-2 h-2 rounded-full bg-purple-500"/>{sec.title}</h3>
                      <div className="space-y-3">{qs.map(q=>renderQ(q))}</div>
                    </div>
                  );
                })}
                <div className="mt-6 flex items-center justify-between">
                  <button onClick={()=>setStep(2)} className="px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-100 font-medium text-sm">→ חזרה לסיכום ביניים</button>
                  <div className="flex flex-col items-end gap-2">
                    <button onClick={()=>setStep(4)} className="px-8 py-3 rounded-xl font-bold text-base bg-green-600 text-white hover:bg-green-700 shadow-md">לממצאים ←</button>
                    {missingFamily.length>0&&<p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">⚠️ {missingFamily.length} שדות לא מולאו — ניתן להמשיך</p>}
                  </div>
                </div>
              </>
            )}
          </section>
        )}

        {/* SCREEN 4 — ממצאים ומימוש */}
        {step===4&&scen&&(
          <section className="animate-fade-in">
            <div className="hidden print:block mb-6 border-b-2 border-gray-800 pb-4">
              <h1 className="text-2xl font-bold">מיצוי 360 — סיכום פגישה</h1>
              <p className="text-gray-600">{today} | {scen.name}</p>
            </div>
            <div className="no-print flex items-center justify-between mb-5 flex-wrap gap-3">
              <div><h2 className="text-lg font-bold">ממצאים ומימוש — {scen.name}</h2><p className="text-sm text-gray-500">{today}</p></div>
              <div className="flex gap-2">
                {urgCnt>0&&<span className="bg-red-100 text-red-800 text-sm font-bold px-3 py-1.5 rounded-full border border-red-300">{urgCnt} דחוף</span>}
                <button onClick={()=>window.print()} className="px-5 py-2.5 rounded-xl bg-blue-700 text-white hover:bg-blue-800 font-bold shadow text-sm">🖨️ הדפסה</button>
              </div>
            </div>

            {/* פעולות */}
            <div className="mb-6 print-summary">
              <h3 className="text-base font-bold mb-3 text-blue-900 border-b-2 border-blue-200 pb-2">פעולות נדרשות ({actions.length})</h3>
              {actions.length===0?<p className="text-gray-400 py-4 text-sm">לא נמצאו פעולות</p>:(
                <div className="space-y-2">{actions.map((a,i)=>(
                  <div key={i} className="bg-white rounded-xl border p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className={`shrink-0 w-2 h-2 rounded-full mt-2 ${uDot(a.urg)}`}/>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap"><span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${uClr(a.urg)}`}>{uLbl(a.urg)}</span><span className="text-xs text-gray-400">{a.tag}</span></div>
                        <p className="font-medium text-sm text-gray-900">{a.text}</p>
                        {a.clerkNote&&<p className="text-xs text-blue-700 mt-1 bg-blue-50 rounded px-2 py-1">📋 {a.clerkNote}</p>}
                      </div>
                    </div>
                    <input type="text" value={actionNotes[i]??''} onChange={e=>{const v=e.target.value;setActionNotes(p=>({...p,[i]:v}));}} placeholder="הערת פקיד לפעולה זו..." className="no-print mt-2 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-right focus:ring-1 focus:ring-blue-400 outline-none"/>
                    {actionNotes[i]&&<p className="hidden print:block text-xs text-gray-600 mt-1">📝 {actionNotes[i]}</p>}
                  </div>
                ))}</div>
              )}
            </div>

            {/* אזהרות */}
            {traps.length>0&&(
              <div className="mb-6 print-summary">
                <h3 className="text-base font-bold mb-3 text-orange-800 border-b-2 border-orange-200 pb-2">אזהרות ({traps.length})</h3>
                <div className="space-y-2">{traps.map((t,i)=>(<div key={i} className="bg-orange-50 border border-orange-300 rounded-xl p-4"><p className="font-bold text-sm text-orange-800 mb-1">⚠️ {t.text}</p>{t.fix&&<p className="text-xs text-orange-700">פעולה: {t.fix}</p>}</div>))}</div>
              </div>
            )}

            {/* זכויות נלוות */}
            {related.length>0&&(
              <div className="mb-6 print-summary">
                <h3 className="text-base font-bold mb-3 text-teal-800 border-b-2 border-teal-200 pb-2">זכויות נלוות ({related.length})</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{related.map((r,i)=>(<div key={i} className="bg-teal-50 border border-teal-200 rounded-xl p-3 flex items-start gap-2"><span className="text-teal-600 font-bold shrink-0">↗</span><div><p className="font-semibold text-sm text-teal-900">{r.name}</p><p className="text-xs text-teal-700">{r.body}{r.note?` — ${r.note}`:''}</p></div></div>))}</div>
              </div>
            )}

            {/* צ'קליסט פולו-אפ */}
            <div className="mb-6 print-summary">
              <h3 className="text-base font-bold mb-3 text-violet-800 border-b-2 border-violet-200 pb-2">✅ צ'קליסט פולו-אפ</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <h4 className="text-sm font-bold text-blue-900 mb-2">📋 משימות פקיד</h4>
                  <div className="space-y-1.5">
                    {actions.filter(a=>a.urg==='urgent'||a.urg==='within30').map((a,i)=>(
                      <div key={i} className="flex items-start gap-2 text-xs text-gray-800">
                        <span className={`shrink-0 w-3 h-3 rounded border mt-0.5 ${uDot(a.urg).replace('bg-','border-')}`}/>
                        <span>{a.text}</span>
                      </div>
                    ))}
                    {actions.filter(a=>a.urg==='urgent'||a.urg==='within30').length===0&&<p className="text-xs text-gray-400">אין משימות דחופות</p>}
                  </div>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <h4 className="text-sm font-bold text-green-900 mb-2">👨‍👩‍👧 משימות משפחה</h4>
                  <div className="space-y-1.5">
                    {related.map((r,i)=>(
                      <div key={i} className="flex items-start gap-2 text-xs text-gray-800">
                        <span className="shrink-0 w-3 h-3 rounded border border-green-400 mt-0.5"/>
                        <span>{r.name} — פנייה ל{r.body}</span>
                      </div>
                    ))}
                    {actions.filter(a=>a.urg==='planning').map((a,i)=>(
                      <div key={'p'+i} className="flex items-start gap-2 text-xs text-gray-800">
                        <span className="shrink-0 w-3 h-3 rounded border border-sky-400 mt-0.5"/>
                        <span>{a.text}</span>
                      </div>
                    ))}
                    {related.length===0&&actions.filter(a=>a.urg==='planning').length===0&&<p className="text-xs text-gray-400">אין משימות</p>}
                  </div>
                </div>
              </div>
            </div>

            {/* סיכום */}
            <div className="mb-6 print-summary bg-gray-50 border rounded-xl p-4">
              <h3 className="text-sm font-bold text-gray-700 mb-2">סיכום</h3>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-white rounded-lg p-3 border"><div className="text-2xl font-bold text-red-600">{actions.filter(a=>a.urg==='urgent').length}</div><div className="text-xs text-gray-500">דחוף</div></div>
                <div className="bg-white rounded-lg p-3 border"><div className="text-2xl font-bold text-amber-600">{actions.filter(a=>a.urg==='within30').length}</div><div className="text-xs text-gray-500">תוך 30 יום</div></div>
                <div className="bg-white rounded-lg p-3 border"><div className="text-2xl font-bold text-sky-600">{actions.filter(a=>a.urg==='planning').length}</div><div className="text-xs text-gray-500">לתכנון</div></div>
              </div>
            </div>

            {/* הערות + ייצוא */}
            <div className="mb-6 print-summary">
              <h3 className="text-base font-bold mb-3 text-gray-800 border-b-2 border-gray-300 pb-2">הערות כלליות + ייצוא</h3>
              <textarea value={staffNotes} onChange={e=>setStaffNotes(e.target.value)} rows={3} placeholder="הערות לתיעוד התיק..." className="w-full border rounded-lg px-3 py-2.5 text-sm text-right resize-none focus:ring-2 focus:ring-blue-500 outline-none mb-3 no-print"/>
              {staffNotes&&<p className="hidden print:block text-sm text-gray-700 mb-3 whitespace-pre-wrap">הערות: {staffNotes}</p>}
              <div className="flex gap-2 no-print">
                <button onClick={()=>{
                  const t = buildExportText(scen?.name||'', today, actions, traps, related, staffNotes, actionNotes);
                  navigator.clipboard.writeText(t).then(()=>{setAuditCopied(true);setTimeout(()=>setAuditCopied(false),2500);});
                }} className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${auditCopied?'bg-green-600 text-white':'bg-gray-800 text-white hover:bg-gray-900'}`}>
                  {auditCopied?'✓ הועתק!':'📋 העתק ללוח'}
                </button>
                <button onClick={downloadExport} className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-indigo-700 text-white hover:bg-indigo-800">
                  📥 הורד מסמך
                </button>
              </div>
            </div>

            {/* סיכום למשפחה */}
            <div className="mb-6 print-summary bg-green-50 border-2 border-green-300 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">📱</span>
                <h3 className="text-base font-bold text-green-900">סיכום למשפחה — מוכן לשליחה</h3>
              </div>
              <p className="text-xs text-green-700 mb-3">הטקסט מעוצב ומוכן לשליחה בוואטסאפ או במייל. לחצו להעתקה.</p>
              <div className="bg-white rounded-xl border border-green-200 p-4 mb-3 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap" dir="rtl">
                {buildFamilySummary(scen?.name||'', today, actions, related)}
              </div>
              <div className="flex gap-2">
                <button onClick={()=>{
                  const txt = buildFamilySummary(scen?.name||'', today, actions, related);
                  navigator.clipboard.writeText(txt).then(()=>{setFamilyCopied(true);setTimeout(()=>setFamilyCopied(false),2500);});
                }} className={`flex-1 py-3 rounded-xl text-sm font-bold ${familyCopied?'bg-green-600 text-white':'bg-green-700 text-white hover:bg-green-800'}`}>
                  {familyCopied?'✅ הועתק!':'📋 העתק סיכום למשפחה'}
                </button>
                <button onClick={()=>{
                  const txt = buildFamilySummary(scen?.name||'', today, actions, related).replace(/\*/g,'');
                  const body = encodeURIComponent(txt);
                  const subj = encodeURIComponent(`סיכום פגישה — ביטוח לאומי — ${today}`);
                  window.open(`mailto:?subject=${subj}&body=${body}`);
                }} className="px-5 py-3 rounded-xl text-sm font-bold bg-blue-600 text-white hover:bg-blue-700">
                  ✉️ שלח במייל
                </button>
              </div>
            </div>

            {/* קישורים שימושיים */}
            <div className="mb-6 print-summary">
              <h3 className="text-base font-bold mb-3 text-gray-700 border-b-2 border-gray-200 pb-2">🔗 קישורים שימושיים — ביטוח לאומי</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {BTL_LINKS.map((l,i)=>(
                  <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl p-3 hover:bg-blue-50 hover:border-blue-300 transition-colors">
                    <span className="text-lg">{l.icon}</span>
                    <span className="text-sm font-medium text-blue-800">{l.name}</span>
                    <span className="text-xs text-gray-400 mr-auto">↗</span>
                  </a>
                ))}
              </div>
            </div>

            <div className="border-t pt-4 text-xs text-gray-400 print-summary">
              <p>⚠️ <strong>אמת פרטים ב-btl.gov.il או *6050 לפני הגשה.</strong></p>
              <p className="mt-1">מיצוי 360 v5.0 | {today} | אין שמירת מידע אישי | מקור נתונים: חוזר 33, 2026</p>
            </div>
            <div className="mt-6 no-print flex gap-3">
              <button onClick={()=>setStep(3)} className="px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-100 font-medium text-sm">→ שאלון משפחה</button>
              <button onClick={()=>setStep(1)} className="px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-100 font-medium text-sm">→ בדיקות פקיד</button>
              <button onClick={doReset} className="px-5 py-2.5 rounded-xl bg-blue-700 text-white hover:bg-blue-800 font-medium text-sm">פגישה חדשה ↺</button>
            </div>
          </section>
        )}
      </main>
      <footer className="no-print text-center py-4 text-xs text-gray-400 border-t mt-10">כלי סיוע לפקידים במיצוי זכויות | מיצוי 360 v5.0 | אין שמירת מידע | {today}</footer>
      <div className="no-print fixed bottom-6 left-6 z-40 flex flex-col items-end gap-2">
        {feedbackItems.length>0&&<div className="bg-white border rounded-full px-3 py-1 text-xs text-gray-600 shadow-md">{feedbackItems.length} הערות</div>}
        <button onClick={()=>setShowFeedback(true)} className="flex items-center gap-2 px-5 py-3 rounded-full bg-purple-700 text-white shadow-xl hover:bg-purple-800 text-sm font-bold">💬 משוב</button>
      </div>
      {showFeedback&&<FeedbackModal items={feedbackItems} scenName={scen?.name||''} onAdd={e=>setFeedbackItems(p=>[...p,e])} onClose={()=>setShowFeedback(false)}/>}
    </div>
  );
}
