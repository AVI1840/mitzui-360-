/**
 * מיצוי 360 — v4.0
 * כלי מיצוי זכויות לפקידי ביטוח לאומי
 * 3 תרחישים פעילים: פטירת ילד נכה, נכות כללית, הורה לילד נכה
 * 3 שלבים: בדיקות פקיד → שאלון למשפחה → ממצאים ומימוש
 * אין שמירת מידע אישי — כל הנתונים נמחקים בסגירת הדף
 */
import React, { useState, useMemo, useCallback, useRef, Fragment } from 'react';

type AT = 'boolean'|'number'|'text'|'select'|'date'|'status';
type DS = 'relevant'|'not_relevant'|'check'|null;
type Urg = 'urgent'|'within30'|'planning';
type Phase = 'clerk'|'family';
type A = Record<string,any>;
type SMap = Record<string,DS>;

interface Q { id:string; text:string; at:AT; phase:Phase; opts?:string[]; showIf?:(a:A)=>boolean; warn?:(a:A)=>string|null; info?:string; }
interface AR { urg:Urg; cond:(a:A,s:SMap)=>boolean; text:string|((a:A)=>string); tag?:string; clerkNote?:string; }
interface TR { cond:(a:A)=>boolean; text:string; fix?:string; }
interface RB { name:string; body:string; note?:string; }
interface Domain { id:string; n:string; b:string; am:string; ds:string; priority?:'high'|'medium'; qs:Q[]; ars:AR[]; trs?:TR[]; related?:RB[]; }
interface Scenario { id:string; name:string; icon:string; profile:string; active:boolean; color:string; domains:Domain[]; }

const rel = (s:DS) => s==='relevant'||s==='check';
const CY = new Date().getFullYear();
const inM = (n:number) => { const d=new Date(); d.setMonth(d.getMonth()+n); return d.toLocaleDateString('he-IL',{month:'long',year:'numeric'}); };
const daysSince = (ds:string):number => { if(!ds) return 0; const d=new Date(ds); return isNaN(d.getTime())?0:Math.floor((Date.now()-d.getTime())/86400000); };

const SHEET_URL = "https://script.google.com/macros/s/AKfycbwD8CMFoP5XoOwRLwK_OxMMOFKF8fS2CRpbJkNdOHjbnJIepkOLzlGrg3GQNGRqbwB6bA/exec";
const APP_NAME = "מיצוי 360";
async function sendSheet(data:Record<string,string>) { try { await fetch(SHEET_URL,{method:"POST",mode:"no-cors",headers:{"Content-Type":"application/json"},body:JSON.stringify({app:APP_NAME,...data})}); } catch(_){} }

// ═══════════════════════════════════════════════
// SCENARIO 1: פטירת ילד נכה (DDC) — PRIMARY
// ═══════════════════════════════════════════════
const DDC_DOMAINS: Domain[] = [
  {
    id:'dd', n:'תאריך פטירה ופרטי רקע', b:'ביטוח לאומי',
    am:'משפיע על כל הפרמטרים', priority:'high',
    ds:'תאריך הפטירה הוא נקודת המוצא — זכאות לקצבת ילדים עד 3 חודשים מהפטירה',
    qs:[
      {id:'dd_date',text:'תאריך פטירת הילד',at:'date',phase:'clerk',info:'תאריך הפטירה משפיע על כל הפרמטרים: מענק, חובות, ניידות, חסכונות'},
      {id:'dd_age',text:'גיל הילד בפטירה',at:'number',phase:'clerk',warn:(a)=>a.dd_age>18?'ילד מעל 18 — בדוק חוזר מנהל 1915':null},
      {id:'dd_child_allow',text:'סטטוס קצבת ילדים',at:'status',phase:'clerk',opts:['משולמת','הופסקה','לבדיקה'],info:'זכאות לקצבת ילדים עד 3 חודשים מתאריך הפטירה'},
    ],
    ars:[
      {urg:'urgent',cond:(a,s)=>rel(s.dd)&&a.dd_date&&daysSince(a.dd_date)<=90&&a.dd_child_allow==='הופסקה',text:'קצבת ילדים הופסקה אך טרם חלפו 3 חודשים — לבדוק זכאות להמשך',clerkNote:'בדוק במערכת האם הופסקה בטעות'},
    ],
    trs:[{cond:(a)=>a.dd_age>18,text:'חריג גיל — ילד מעל 18',fix:'בדוק חוזר מנהל 1915'}],
  },
  {
    id:'dg', n:'מענק פטירה', b:'ביטוח לאומי',
    am:'10,514 ₪ (חד-פעמי)', priority:'high',
    ds:'מענק אוטומטי בגין פטירת ילד שקיבל קצבת ילד נכה',
    qs:[
      {id:'dg_st',text:'סטטוס מענק פטירה',at:'status',phase:'clerk',opts:['שולם','בטיפול','לא רלוונטי']},
      {id:'dg_bank',text:'האם חשבון הבנק פעיל?',at:'boolean',phase:'clerk',showIf:(a)=>a.dg_st==='בטיפול'},
    ],
    ars:[
      {urg:'urgent',cond:(a,s)=>rel(s.dg)&&a.dg_st==='בטיפול'&&a.dg_bank===false,text:'חשבון לא פעיל — לעדכן פרטי בנק לפני שחרור המענק'},
      {urg:'within30',cond:(a,s)=>rel(s.dg)&&a.dg_st==='בטיפול'&&a.dg_bank!==false,text:'מענק פטירה 10,514 ₪ — לוודא העברה לחשבון'},
    ],
  },
  {
    id:'dm', n:'חובות וגבייה', b:'ביטוח לאומי',
    am:'משתנה', ds:'בדיקת חובות — גבייה מוקפאת 60 יום מהפטירה',
    qs:[
      {id:'dm_st',text:'חוב להורים בביטוח לאומי',at:'status',phase:'clerk',opts:['יש חוב','אין חוב','לבדיקה']},
      {id:'dm_amt',text:'סכום החוב (₪)',at:'number',phase:'clerk',showIf:(a)=>a.dm_st==='יש חוב'},
      {id:'dm_reason',text:'בגין מה נוצר החוב?',at:'text',phase:'clerk',showIf:(a)=>a.dm_st==='יש חוב'},
      {id:'dm_notes',text:'הערות פקיד',at:'text',phase:'clerk',showIf:(a)=>a.dm_st==='יש חוב'},
      {id:'dm_cancel',text:'לשקול בקשה לביטול חוב?',at:'boolean',phase:'clerk',showIf:(a)=>a.dm_st==='יש חוב',info:'בפטירת ילד נכה — לשקול הכנת בקשה לביטול חוב'},
    ],
    ars:[
      {urg:'within30',cond:(a,s)=>rel(s.dm)&&a.dm_st==='יש חוב',text:(a)=>`חוב ${a.dm_amt?(a.dm_amt).toLocaleString()+' ₪':'(סכום לא ידוע)'} — גבייה מוקפאת 60 יום. ${a.dm_cancel?'להכין בקשה לביטול':'לתאם סדר תשלומים'}`,clerkNote:'בדוק אפשרות ביטול חוב בנסיבות פטירה'},
    ],
    trs:[{cond:(a)=>a.dm_st==='יש חוב'&&a.dm_amt>50000,text:'חוב מעל 50,000 ₪',fix:'תאם עם מחלקת גבייה'}],
  },
  {
    id:'is', n:'הבטחת הכנסה', b:'ביטוח לאומי',
    am:'עד 3,500 ₪/חודש', ds:'בדיקת זכאות + השפעת שינוי הרכב משפחה',
    qs:[
      {id:'is_st',text:'זכאות הבטחת הכנסה במערכת',at:'status',phase:'clerk',opts:['זכאי','לא זכאי','לבדיקה']},
      {id:'is_emp',text:'מצב תעסוקתי של ההורים',at:'select',phase:'family',opts:['שניהם עובדים','אחד עובד','שניהם לא עובדים']},
      {id:'is_office',text:'פטור מהתייצבות בלשכת התעסוקה',at:'status',phase:'clerk',opts:['יש פטור','אין פטור','לבדיקה'],showIf:(a)=>a.is_emp==='שניהם לא עובדים'||a.is_emp==='אחד עובד',info:'בפטירת ילד — 3 חודשי פטור מהתייצבות'},
      {id:'is_kids',text:'מספר ילדים נותרים',at:'number',phase:'family'},
      {id:'is_vehicle',text:'שווי רכב (₪)',at:'number',phase:'family',info:'מתאריך הפטירה — הרכב לא נספר כפוסל זכאות'},
    ],
    ars:[
      {urg:'urgent',cond:(a,s)=>rel(s.is)&&a.is_st==='זכאי',text:(a)=>`זכאי להבטחת הכנסה — לעדכן תחשיב${a.is_emp!=='שניהם עובדים'?' + לבדוק פטור 3 חודשים מלשכה':''}`,clerkNote:'עדכן תחשיב + בדוק פטור מהתייצבות'},
      {urg:'within30',cond:(a,s)=>rel(s.is)&&a.is_st==='לבדיקה',text:'לבדוק זכאות — שינוי הרכב משפחה עשוי לפתוח זכאות חדשה'},
      {urg:'within30',cond:(a,s)=>rel(s.is)&&a.is_vehicle>0,text:(a)=>`רכב ${(a.is_vehicle||0).toLocaleString()} ₪ — מהפטירה לא נספר כפוסל`},
    ],
  },
  {
    id:'mo', n:'ניידות — רכב והלוואות', b:'מחלקת ניידות',
    am:'עשרות–מאות אלפי ₪', ds:'הלוואה עומדת, קרן הלוואות, תקופת חסד',
    qs:[
      {id:'mo_st',text:'סטטוס ניידות',at:'status',phase:'clerk',opts:['לבדיקה','יש הלוואה עומדת','יש קרן הלוואות','לא רלוונטי']},
      {id:'mo_grant',text:'קיבלו הטבת רכישה כהלוואה עומדת?',at:'boolean',phase:'clerk',showIf:(a)=>a.mo_st!=='לא רלוונטי'},
      {id:'mo_fund',text:'קיבלו הלוואה מקרן הלוואות?',at:'boolean',phase:'clerk',showIf:(a)=>a.mo_st!=='לא רלוונטי',info:'קרן הלוואות הופכת למענק אחרי 5 שנים'},
      {id:'mo_year',text:'שנת לקיחת ההלוואה',at:'number',phase:'clerk',showIf:(a)=>a.mo_grant===true||a.mo_fund===true},
      {id:'mo_intent',text:'כוונת המשפחה לגבי הרכב',at:'select',phase:'family',opts:['להמתין שנה','למכור כעת','להחזיר הלוואה','לא ידוע'],info:'הלוואה עומדת: שנה להחזר מהפטירה, פטור אחרי 7 שנים'},
    ],
    ars:[
      {urg:'within30',cond:(a,s)=>rel(s.mo)&&a.mo_grant&&a.mo_year&&(CY-a.mo_year<7),text:(a)=>`הלוואה עומדת מ-${a.mo_year} (${CY-a.mo_year} שנים) — שנה להחזר, פטור אחרי 7 שנים`,clerkNote:'חשב למשפחה יתרת החזר'},
      {urg:'planning',cond:(a,s)=>rel(s.mo)&&a.mo_grant&&a.mo_year&&(CY-a.mo_year>=7),text:'הלוואה עומדת 7+ שנים — פטור מהחזר'},
      {urg:'within30',cond:(a,s)=>rel(s.mo)&&a.mo_fund&&a.mo_year&&(CY-a.mo_year>=5),text:(a)=>`קרן הלוואות מ-${a.mo_year} — הפכה למענק`},
      {urg:'within30',cond:(a,s)=>rel(s.mo)&&a.mo_fund&&a.mo_year&&(CY-a.mo_year<5),text:(a)=>`קרן הלוואות — ${5-(CY-a.mo_year)} שנים עד מענק`},
      {urg:'urgent',cond:(a,s)=>rel(s.mo)&&a.mo_intent==='למכור כעת',text:'ליצור קשר עם ניידות לשובר החזר — לפני מכירה'},
    ],
    trs:[{cond:(a)=>a.mo_grant&&a.mo_year&&(CY-a.mo_year<7)&&a.mo_intent==='למכור כעת',text:'מכירה לפני 7 שנים — חובת החזר',fix:'תאם עם ניידות חישוב יתרה'}],
  },
  {
    id:'cs', n:'חיסכון לכל ילד', b:'ביטוח לאומי + קופת גמל',
    am:'צבירה חודשית × שנים', ds:'חסכונות הילד שנפטר + בדיקת חסכונות כל הילדים',
    qs:[
      {id:'cs_fund',text:'היכן נצברו חסכונות הילד שנפטר?',at:'text',phase:'clerk',info:'הפקדות ימשכו 3 חודשים. משיכה עם טופס 5022'},
      {id:'cs_amt',text:'סכום משוער שנצבר (₪)',at:'number',phase:'clerk'},
      {id:'cs_others',text:'ילדים נוספים עם חיסכון',at:'number',phase:'family'},
      {id:'cs_where',text:'היכן חסכונות שאר הילדים?',at:'select',phase:'family',opts:['בנק','קופת גמל','לא יודעים'],showIf:(a)=>a.cs_others>0},
      {id:'cs_knows',text:'המשפחה יודעת כיצד למשוך?',at:'boolean',phase:'family'},
    ],
    ars:[
      {urg:'within30',cond:(_,s)=>rel(s.cs),text:(a)=>`טופס 5022 לקופה: ${a.cs_fund||'(לא צוין)'}`,clerkNote:'הדפס טופס 5022 והסבר למשפחה'},
      {urg:'planning',cond:(a,s)=>rel(s.cs)&&a.cs_where==='בנק',text:'חסכונות ילדים בבנק — מומלץ לשקול העברה לקופת גמל רווחית יותר'},
    ],
  },
  {
    id:'pd', n:'נכות הורים ותוספת תלויים', b:'ביטוח לאומי',
    am:'תוספת תלויים + קצבת נכות', ds:'בדיקה האם ההורים מקבלים נכות ותוספת תלויים עבור הילד שנפטר',
    qs:[
      {id:'pd_dis',text:'האם הורה מקבל קצבת נכות?',at:'boolean',phase:'clerk'},
      {id:'pd_who',text:'מי מקבל?',at:'select',phase:'clerk',opts:['אב','אם','שניהם'],showIf:(a)=>a.pd_dis===true},
      {id:'pd_dep',text:'תוספת תלויים עבור הילד שנפטר',at:'status',phase:'clerk',opts:['כן','לא','לבדיקה'],showIf:(a)=>a.pd_dis===true,info:'יש לעדכן את המערכת'},
    ],
    ars:[
      {urg:'within30',cond:(a,s)=>rel(s.pd)&&a.pd_dis&&a.pd_dep==='כן',text:'תוספת תלויים לילד שנפטר — לעדכן מערכת',clerkNote:'עדכן תלויים ובדוק השפעה על קצבה'},
      {urg:'planning',cond:(a,s)=>rel(s.pd)&&a.pd_dis&&a.pd_dep==='לבדיקה',text:'לבדוק תוספת תלויים עבור הילד שנפטר'},
    ],
  },
  {
    id:'sb', n:'אחים — ילדים נכים נוספים', b:'ביטוח לאומי',
    am:'קצבת ילד נכה לכל ילד', ds:'בדיקה האם יש אחים זכאים לקצבת ילד נכה',
    qs:[
      {id:'sb_has',text:'יש עוד ילדים זכאים לקצבת ילד נכה?',at:'boolean',phase:'family'},
      {id:'sb_n',text:'כמה ילדים נוספים עם נכות?',at:'number',phase:'family',showIf:(a)=>a.sb_has===true},
      {id:'sb_recv',text:'כולם מקבלים קצבה?',at:'boolean',phase:'family',showIf:(a)=>a.sb_has===true},
    ],
    ars:[
      {urg:'urgent',cond:(a,s)=>rel(s.sb)&&a.sb_has&&a.sb_recv===false,text:(a)=>`${a.sb_n||''} ילדים נוספים עם נכות לא מקבלים קצבה — לפתוח תביעות`},
    ],
  },
  {
    id:'ub', n:'אבטלה ושיקום מקצועי', b:'ביטוח לאומי',
    am:'עד 80% שכר + מימון לימודים', ds:'זכאות לאבטלה, שיקום מקצועי ותעסוקתי',
    qs:[
      {id:'ub_sys',text:'זכאות אבטלה במערכת',at:'status',phase:'clerk',opts:['זכאי','לא זכאי','לבדיקה']},
      {id:'ub_stop',text:'הורה הפסיק לעבוד בשנה האחרונה?',at:'boolean',phase:'family'},
      {id:'ub_why',text:'סיבת עזיבה',at:'select',phase:'family',opts:['פיטורין','התפטרות בשל טיפול בילד','אחר'],showIf:(a)=>a.ub_stop===true},
      {id:'ub_mo',text:'חודשי עבודה מתוך 18 אחרונים',at:'number',phase:'family',showIf:(a)=>a.ub_stop===true},
      {id:'ub_rehab',text:'מעוניין בהסבה מקצועית?',at:'boolean',phase:'family',info:'תיקון 208 — מימון לימודים ודמי מחיה'},
    ],
    ars:[
      {urg:'urgent',cond:(a,s)=>rel(s.ub)&&a.ub_stop&&a.ub_why==='התפטרות בשל טיפול בילד'&&a.ub_mo>=12,text:'התפטרות מוצדקת — אבטלה ללא המתנה'},
      {urg:'within30',cond:(a,s)=>rel(s.ub)&&a.ub_stop&&a.ub_why==='פיטורין'&&a.ub_mo>=12,text:'פיטורין — לפתוח תביעת אבטלה'},
      {urg:'planning',cond:(a,s)=>rel(s.ub)&&a.ub_rehab===true,text:'להפנות לפקיד שיקום — תיקון 208'},
    ],
  },
];

// ═══════════════════════════════════════════════
// SCENARIO 2: נכות כללית (GD)
// ═══════════════════════════════════════════════
const GD_DOMAINS: Domain[] = [
  {
    id:'gd_dis', n:'קצבת נכות כללית', b:'ביטוח לאומי', priority:'high',
    am:'100%: 4,711 ₪ | 74%: 3,211 ₪ | 60%: 2,718 ₪',
    ds:'קצבה לפי אחוז נכות. מחייב הגשה — לא אוטומטי',
    qs:[
      {id:'gd1',text:'אחוז נכות מוכרת',at:'number',phase:'clerk',warn:(a)=>a.gd1<60?'מתחת ל-60% — אין זכאות לקצבת נכות כללית':null},
      {id:'gd2',text:'מקבל כיום קצבת נכות?',at:'boolean',phase:'clerk'},
      {id:'gd3',text:'גיל המבוטח',at:'number',phase:'clerk'},
      {id:'gd4',text:'הכנסה חודשית מעבודה (₪)',at:'number',phase:'family'},
    ],
    ars:[
      {urg:'urgent',cond:(a,s)=>rel(s.gd_dis)&&a.gd1>=60&&a.gd2===false,text:'זכאי לקצבת נכות ולא מגיש — לפתוח תביעה מיידית'},
      {urg:'urgent',cond:(a,s)=>rel(s.gd_dis)&&a.gd3>=67&&a.gd2===true,text:'הגיע לגיל פרישה — לבדוק מה גבוה יותר: זקנה או נכות'},
    ],
    trs:[
      {cond:(a)=>a.gd4>0,text:'הכנסה מעבודה עשויה להשפיע על הקצבה',fix:'חשב "נקודת שבירה" — מאיזה שכר אבדן זכויות נלוות עולה על הרווח'},
      {cond:(a)=>a.gd3<67&&a.gd3>=64,text:'קרוב לגיל פרישה — בדוק נכות מול זקנה',fix:'חשב ערך כולל לכל אפשרות'},
    ],
  },
  {
    id:'gd_sp', n:'שירותים מיוחדים (שר"מ)', b:'ביטוח לאומי', priority:'high',
    am:'תוספת משמעותית לקצבה', ds:'פחות מ-30% מהזכאים ממשים. מחייב הגשה נפרדת',
    qs:[
      {id:'gd_sp1',text:'מקבל שר"מ?',at:'boolean',phase:'clerk',info:'שר"מ = תוספת לקצבה עבור צורך בעזרה. לא אוטומטי!'},
      {id:'gd_sp2',text:'זקוק לעזרה של אדם אחר בפעולות יומיום?',at:'boolean',phase:'family'},
    ],
    ars:[
      {urg:'urgent',cond:(a,s)=>rel(s.gd_sp)&&a.gd_sp2===true&&a.gd_sp1===false,text:'זכאי לשר"מ ולא מקבל — לפתוח תביעה (פחות מ-30% ממשים)'},
    ],
  },
  {
    id:'gd_mo', n:'ניידות', b:'ביטוח לאומי',
    am:'הלוואה עומדת + סיוע רכב', ds:'לנכים עם קשיי ניידות — נוצל פחות מ-30%',
    qs:[
      {id:'gd_mo1',text:'יש קשיי ניידות?',at:'boolean',phase:'family'},
      {id:'gd_mo2',text:'מקבל תמיכת ניידות?',at:'boolean',phase:'clerk'},
    ],
    ars:[
      {urg:'planning',cond:(a,s)=>rel(s.gd_mo)&&a.gd_mo1===true&&a.gd_mo2===false,text:'לבדוק זכאות ניידות — פחות מ-30% מנצלים'},
    ],
  },
  {
    id:'gd_voc', n:'שיקום מקצועי', b:'ביטוח לאומי',
    am:'מימון לימודים + דמי מחיה', ds:'נוצל פחות מ-30%',
    qs:[
      {id:'gd_v1',text:'הנכות משפיעה על כושר עבודה?',at:'boolean',phase:'family'},
      {id:'gd_v2',text:'מעוניין בהסבה מקצועית?',at:'boolean',phase:'family'},
    ],
    ars:[
      {urg:'planning',cond:(a,s)=>rel(s.gd_voc)&&a.gd_v2===true,text:'להפנות לפקיד שיקום — הסבה מקצועית ומימון לימודים'},
    ],
  },
  {
    id:'gd_ext', n:'זכויות נלוות (דומינו)', b:'גורמים שונים',
    am:'עשרות אלפי ₪/שנה', ds:'נכות 100%: פטור מס + ביטוח רכב + ארנונה',
    qs:[
      {id:'gd_e1',text:'אחוז נכות (לנלוות)',at:'number',phase:'clerk'},
      {id:'gd_e2',text:'מגיש טופס 127 לפטור מס?',at:'boolean',phase:'clerk'},
      {id:'gd_e3',text:'בדק הנחת ביטוח רכב?',at:'boolean',phase:'family'},
      {id:'gd_e4',text:'בדק הנחת ארנונה?',at:'boolean',phase:'family'},
    ],
    ars:[
      {urg:'within30',cond:(a,s)=>rel(s.gd_ext)&&a.gd_e1>=100&&a.gd_e2===false,text:'נכות 100% — פטור מלא ממס הכנסה (טופס 127)'},
      {urg:'within30',cond:(a,s)=>rel(s.gd_ext)&&a.gd_e3===false,text:'לבדוק הנחת ביטוח רכב בגין נכות'},
      {urg:'within30',cond:(a,s)=>rel(s.gd_ext)&&a.gd_e4===false,text:'לפנות לרשות המקומית — הנחת ארנונה בגין נכות'},
    ],
    related:[
      {name:'פטור מס הכנסה (9(5))',body:'רשות המסים',note:'נכות 100% — פטור מלא'},
      {name:'הנחת ביטוח רכב',body:'חברות ביטוח'},
      {name:'הנחת ארנונה',body:'רשות מקומית',note:'עד 70%'},
    ],
  },
];

// ═══════════════════════════════════════════════
// SCENARIO 3: הורה לילד נכה (HC)
// ═══════════════════════════════════════════════
const HC_DOMAINS: Domain[] = [
  {
    id:'hc_dis', n:'קצבת ילד נכה', b:'ביטוח לאומי', priority:'high',
    am:'עד ~3,400 ₪/חודש', ds:'מגיל 91 יום עד 18. אחוז נכות ≠ קצבה מקסימלית',
    qs:[
      {id:'hc1',text:'גיל הילד',at:'number',phase:'clerk',warn:(a)=>a.hc1>=18?'גיל 18 — צריך להגיש נכות כללית!':a.hc1<0.25?'מתחת ל-91 יום':null},
      {id:'hc2',text:'אחוז נכות מוכרת',at:'number',phase:'clerk'},
      {id:'hc3',text:'מקבל קצבת ילד נכה?',at:'boolean',phase:'clerk'},
      {id:'hc4',text:'חל שינוי בתפקוד לאחרונה?',at:'boolean',phase:'family',info:'הידרדרות = "הגדלת קצבה" — לא הגשה מחדש'},
    ],
    ars:[
      {urg:'urgent',cond:(a,s)=>rel(s.hc_dis)&&a.hc3===false&&a.hc1>=0.25&&a.hc1<18,text:'לא מגיש קצבת ילד נכה — לפתוח תביעה'},
      {urg:'urgent',cond:(a,s)=>rel(s.hc_dis)&&a.hc1>=17,text:'גיל 17+ — להגיש נכות כללית לפני 18! לא אוטומטי'},
      {urg:'within30',cond:(a,s)=>rel(s.hc_dis)&&a.hc4===true,text:'הידרדרות — לבקש "הגדלת קצבה" (לא הגשה מחדש)'},
    ],
    trs:[{cond:(a)=>a.hc1>=17&&a.hc1<19,text:'מעבר 18 לא אוטומטי — עלול לאבד קצבה',fix:'הגש נכות כללית 6 חודשים לפני 18'}],
  },
  {
    id:'hc_ch', n:'קצבת ילדים', b:'ביטוח לאומי',
    am:'~170 ₪/חודש', ds:'מצטברת עם ילד נכה',
    qs:[{id:'hc_ch1',text:'מקבלים קצבת ילדים?',at:'boolean',phase:'clerk',info:'ניתן לקבל גם ילד נכה וגם ילדים'}],
    ars:[{urg:'within30',cond:(a,s)=>rel(s.hc_ch)&&a.hc_ch1===false,text:'לא מקבלים קצבת ילדים — לבדוק ולהגיש'}],
  },
  {
    id:'hc_wel', n:'סל שירותים — משרד הרווחה', b:'משרד הרווחה',
    am:'שעות טיפול + מסגרות', ds:'40% לא ממצים — פנייה לעו"ס ברשות',
    qs:[
      {id:'hc_w1',text:'ממצים סל שירותים מהרווחה?',at:'boolean',phase:'family',info:'40% לא ממצים — פנה לעו"ס ברשות'},
      {id:'hc_w2',text:'ידועות המסגרות המגיעות?',at:'boolean',phase:'family'},
    ],
    ars:[{urg:'within30',cond:(a,s)=>rel(s.hc_wel)&&a.hc_w1===false,text:'לא ממצים סל רווחה — להפנות לעו"ס ברשות'}],
  },
  {
    id:'hc_18', n:'מעבר גיל 18 — נכות כללית', b:'ביטוח לאומי', priority:'high',
    am:'עד 4,711 ₪/חודש', ds:'המעבר לא אוטומטי! עלול לאבד קצבה',
    qs:[
      {id:'hc_18a',text:'גיל הילד',at:'number',phase:'clerk',warn:(a)=>a.hc_18a>=17&&a.hc_18a<19?'גיל קריטי — חובה הגשה פרואקטיבית':null},
      {id:'hc_18b',text:'הוגשה תביעת נכות כללית?',at:'boolean',phase:'clerk'},
    ],
    ars:[{urg:'urgent',cond:(a,s)=>rel(s.hc_18)&&a.hc_18a>=16&&a.hc_18b===false,text:'גיל 16+ — להגיש נכות כללית עוד היום!'}],
    trs:[{cond:(a)=>a.hc_18a>=18&&a.hc_18b===false,text:'עבר 18 ולא הגיש — ללא קצבה!',fix:'הגש מיידית — אין רטרואקטיביות'}],
  },
  {
    id:'hc_ext', n:'זכויות נלוות — דומינו', b:'גורמים שונים',
    am:'אלפי ₪/שנה', ds:'ארנונה, חשמל, מים, מס 6090, שיכון',
    qs:[
      {id:'hc_e1',text:'ניצלו הנחת ארנונה?',at:'boolean',phase:'family'},
      {id:'hc_e2',text:'הוגש טופס 127 (סעיף 6090)?',at:'boolean',phase:'family'},
      {id:'hc_e3',text:'בדקו סיוע שיכון?',at:'boolean',phase:'family'},
    ],
    ars:[
      {urg:'within30',cond:(a,s)=>rel(s.hc_ext)&&a.hc_e1===false,text:'הנחת ארנונה בגין ילד נכה — לפנות לרשות'},
      {urg:'within30',cond:(a,s)=>rel(s.hc_ext)&&a.hc_e2===false,text:'טופס 127 — נקודות זיכוי מס (6090)'},
    ],
    related:[
      {name:'הנחת ארנונה',body:'רשות מקומית'},
      {name:'הנחת חשמל',body:'חברת חשמל'},
      {name:'נקודות זיכוי מס (6090)',body:'רשות המסים'},
      {name:'סיוע שיכון',body:'משרד הבינוי'},
    ],
  },
];

// ═══════════════════════════════════════════════
// ALL SCENARIOS
// ═══════════════════════════════════════════════
const SCENARIOS: Scenario[] = [
  {id:'ddc',name:'פטירת ילד נכה',icon:'💙',profile:'הורה לילד עם מוגבלות שנפטר',active:true,color:'blue',domains:DDC_DOMAINS},
  {id:'gd',name:'נכות כללית',icon:'♿',profile:'כלי עזר למקרים מורכבים — נכות 60%+',active:true,color:'orange',domains:GD_DOMAINS},
  {id:'hc',name:'הורה לילד נכה',icon:'👨‍👩‍👧',profile:'כלי עזר למקרים מורכבים — ילד עם מוגבלות',active:true,color:'teal',domains:HC_DOMAINS},
  {id:'ep',name:'קשיש/ה — הכנסה נמוכה',icon:'🏠',profile:'קשיש 67+ לבד, הכנסה נמוכה',active:false,color:'green',domains:[]},
  {id:'w',name:'שכול — אלמן/ה',icon:'🕊️',profile:'אלמנה/אלמן',active:false,color:'purple',domains:[]},
  {id:'u',name:'פיטורין / אבטלה',icon:'💼',profile:'עובד שפוטר/נפגע בעבודה',active:false,color:'red',domains:[]},
];

// ═══════════════════════════════════════════════
// UI CONSTANTS
// ═══════════════════════════════════════════════
const STEPS = ['בחירת תרחיש','בדיקות פקיד','שאלון למשפחה','ממצאים ומימוש'];
const uLbl = (u:Urg) => u==='urgent'?'דחוף':u==='within30'?'תוך 30 יום':'לתכנון';
const uClr = (u:Urg) => u==='urgent'?'bg-red-100 text-red-800 border-red-300':u==='within30'?'bg-amber-100 text-amber-800 border-amber-300':'bg-sky-100 text-sky-800 border-sky-300';
const uDot = (u:Urg) => u==='urgent'?'bg-red-500':u==='within30'?'bg-amber-500':'bg-sky-500';
const sClr:Record<string,string> = {blue:'border-blue-500 bg-blue-50 hover:bg-blue-100',green:'border-green-500 bg-green-50',purple:'border-purple-500 bg-purple-50',orange:'border-orange-500 bg-orange-50 hover:bg-orange-100',teal:'border-teal-500 bg-teal-50 hover:bg-teal-100',red:'border-red-500 bg-red-50'};
const sBdg:Record<string,string> = {blue:'bg-blue-600 text-white',green:'bg-green-600 text-white',purple:'bg-purple-600 text-white',orange:'bg-orange-600 text-white',teal:'bg-teal-600 text-white',red:'bg-red-600 text-white'};

// ═══════════════════════════════════════════════
// FEEDBACK SYSTEM
// ═══════════════════════════════════════════════
type FCat = 'professional'|'ux'|'process'|'data';
type FSev = 'critical'|'improvement'|'minor';
interface FEntry { id:number; category:FCat; severity:FSev; screen:string; description:string; suggestion:string; ts:string; }
const catL:Record<FCat,string> = {professional:'📋 תוכן מקצועי',ux:'🖥️ ממשק',process:'🔄 תהליך',data:'📊 נתונים'};
const sevL:Record<FSev,string> = {critical:'🔴 קריטי',improvement:'🟡 שיפור',minor:'🟢 מינורי'};

// ═══════════════════════════════════════════════
// FEEDBACK MODAL COMPONENT
// ═══════════════════════════════════════════════
function FeedbackModal({items,scenName,onAdd,onClose}:{items:FEntry[];scenName:string;onAdd:(e:FEntry)=>void;onClose:()=>void}) {
  const [cat,setCat]=useState<FCat>('professional');
  const [sev,setSev]=useState<FSev>('improvement');
  const [desc,setDesc]=useState('');
  const [sugg,setSugg]=useState('');
  const [copied,setCopied]=useState(false);
  const [tab,setTab]=useState<'add'|'list'>('add');

  const submit=()=>{
    if(!desc.trim()) return;
    const entry:FEntry={id:Date.now(),category:cat,severity:sev,screen:scenName||'כללי',description:desc.trim(),suggestion:sugg.trim(),ts:new Date().toLocaleTimeString('he-IL')};
    onAdd(entry);
    sendSheet({category:catL[cat],severity:sevL[sev],text:entry.description+(entry.suggestion?` | הצעה: ${entry.suggestion}`:''),page:scenName||'כללי'});
    setDesc('');setSugg('');setTab('list');
  };

  const exportText=()=>{
    const lines=[`=== משוב מיצוי 360 ===`,`תרחיש: ${scenName||'כללי'} | ${new Date().toLocaleDateString('he-IL')}`,'',
      ...items.map((e,i)=>[`--- הערה ${i+1} ---`,`קטגוריה: ${catL[e.category]}`,`חומרה: ${sevL[e.severity]}`,`תיאור: ${e.description}`,e.suggestion?`הצעה: ${e.suggestion}`:'',`שעה: ${e.ts}`].filter(Boolean).join('\n')),'','=== סוף ==='].join('\n');
    navigator.clipboard.writeText(lines).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2500);});
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" dir="rtl">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div><h2 className="font-bold text-gray-900 text-base">משוב מקצועי</h2><p className="text-xs text-gray-500">{items.length} הערות</p></div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl font-bold">×</button>
        </div>
        <div className="flex border-b">
          {(['add','list'] as const).map(t=>(
            <button key={t} onClick={()=>setTab(t)} className={`flex-1 py-2.5 text-sm font-medium ${tab===t?'border-b-2 border-blue-600 text-blue-700':'text-gray-500'}`}>
              {t==='add'?'+ הוסף הערה':`הערות (${items.length})`}
            </button>
          ))}
        </div>
        <div className="overflow-y-auto flex-1 p-5">
          {tab==='add'&&(
            <div className="space-y-4">
              <div><label className="block text-xs font-semibold text-gray-600 mb-2">קטגוריה</label>
                <div className="grid grid-cols-2 gap-2">{(Object.keys(catL) as FCat[]).map(c=>(
                  <button key={c} onClick={()=>setCat(c)} className={`py-2 px-3 rounded-lg text-xs font-medium border ${cat===c?'bg-blue-700 text-white border-blue-700':'bg-white border-gray-300 text-gray-700'}`}>{catL[c]}</button>
                ))}</div>
              </div>
              <div><label className="block text-xs font-semibold text-gray-600 mb-2">חומרה</label>
                <div className="flex gap-2">{(Object.keys(sevL) as FSev[]).map(s=>(
                  <button key={s} onClick={()=>setSev(s)} className={`flex-1 py-2 rounded-lg text-xs font-medium border ${sev===s?'bg-blue-700 text-white border-blue-700':'bg-white border-gray-300 text-gray-700'}`}>{sevL[s]}</button>
                ))}</div>
              </div>
              <div><label className="block text-xs font-semibold text-gray-600 mb-2">תיאור *</label>
                <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={3} placeholder="תאר את הבעיה..." className="w-full border rounded-lg px-3 py-2.5 text-sm text-right resize-none focus:ring-2 focus:ring-blue-500 outline-none"/>
              </div>
              <div><label className="block text-xs font-semibold text-gray-600 mb-2">הצעה (אופציונלי)</label>
                <textarea value={sugg} onChange={e=>setSugg(e.target.value)} rows={2} placeholder="הצע פתרון..." className="w-full border rounded-lg px-3 py-2.5 text-sm text-right resize-none focus:ring-2 focus:ring-blue-500 outline-none"/>
              </div>
              <button onClick={submit} disabled={!desc.trim()} className={`w-full py-3 rounded-xl font-bold text-sm ${desc.trim()?'bg-blue-700 text-white hover:bg-blue-800':'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>שמור הערה</button>
            </div>
          )}
          {tab==='list'&&(
            <div className="space-y-3">
              {items.length===0&&<p className="text-gray-400 text-sm text-center py-6">אין הערות</p>}
              {items.map(e=>(
                <div key={e.id} className="bg-gray-50 border rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="text-xs font-bold text-blue-700">{catL[e.category]}</span>
                    <span className="text-xs">{sevL[e.severity]}</span>
                    <span className="text-xs text-gray-400 mr-auto">{e.ts}</span>
                  </div>
                  <p className="text-sm text-gray-800 font-medium">{e.description}</p>
                  {e.suggestion&&<p className="text-xs text-gray-500 mt-1">💡 {e.suggestion}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
        {items.length>0&&(
          <div className="border-t p-4 bg-gray-50 rounded-b-2xl">
            <button onClick={exportText} className={`w-full py-2.5 rounded-xl text-sm font-bold ${copied?'bg-green-600 text-white':'bg-gray-800 text-white hover:bg-gray-900'}`}>
              {copied?'✓ הועתק!':`📋 העתק ${items.length} הערות`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// MAIN APP COMPONENT
// ═══════════════════════════════════════════════
export default function App() {
  const [step,setStep]=useState(0);
  const [scenId,setScenId]=useState<string|null>(null);
  const [domSt,setDomSt]=useState<SMap>({});
  const [ans,setAns]=useState<A>({});
  const [di,setDi]=useState(0);
  const [resetPending,setResetPending]=useState(false);
  const [feedbackItems,setFeedbackItems]=useState<FEntry[]>([]);
  const [showFeedback,setShowFeedback]=useState(false);
  const [staffNotes,setStaffNotes]=useState('');
  const [auditCopied,setAuditCopied]=useState(false);
  const [counterSent,setCounterSent]=useState(false);

  const scen = useMemo(()=>SCENARIOS.find(s=>s.id===scenId)||null,[scenId]);
  const allDoms = scen?.domains||[];
  const activeDoms = useMemo(()=>allDoms.filter(d=>rel(domSt[d.id])),[allDoms,domSt]);

  // Phase-based question filtering
  const clerkQs = useMemo(()=>{
    const res:{dom:Domain;q:Q}[]=[];
    for(const d of activeDoms) for(const q of d.qs) if(q.phase==='clerk'&&(!q.showIf||q.showIf(ans))) res.push({dom:d,q});
    return res;
  },[activeDoms,ans]);

  const familyQs = useMemo(()=>{
    const res:{dom:Domain;q:Q}[]=[];
    for(const d of activeDoms) for(const q of d.qs) if(q.phase==='family'&&(!q.showIf||q.showIf(ans))) res.push({dom:d,q});
    return res;
  },[activeDoms,ans]);

  const missingClerk = useMemo(()=>clerkQs.filter(({q})=>ans[q.id]===undefined||ans[q.id]===''),[clerkQs,ans]);
  const missingFamily = useMemo(()=>familyQs.filter(({q})=>ans[q.id]===undefined||ans[q.id]===''),[familyQs,ans]);

  const actions = useMemo(()=>{
    const res:{urg:Urg;text:string;tag:string;clerkNote?:string}[]=[];
    for(const dom of activeDoms) for(const ar of dom.ars) {
      if(ar.cond(ans,domSt)) res.push({urg:ar.urg,text:typeof ar.text==='function'?ar.text(ans):ar.text,tag:dom.n,clerkNote:ar.clerkNote});
    }
    const o:Record<Urg,number>={urgent:0,within30:1,planning:2};
    return res.sort((a,b)=>o[a.urg]-o[b.urg]);
  },[activeDoms,ans,domSt]);

  const traps = useMemo(()=>{
    const res:{text:string;fix?:string}[]=[];
    for(const dom of activeDoms) for(const tr of dom.trs||[]) if(tr.cond(ans)) res.push({text:tr.text,fix:tr.fix});
    return res;
  },[activeDoms,ans]);

  const related = useMemo(()=>{
    const res:RB[]=[];
    for(const dom of activeDoms) for(const rb of dom.related||[]) res.push(rb);
    return res;
  },[activeDoms]);

  const sa = useCallback((id:string,v:any)=>setAns(p=>({...p,[id]:v})),[]);
  const sd = useCallback((id:string,v:DS)=>setDomSt(p=>({...p,[id]:v})),[]);
  const doReset = ()=>{setStep(0);setScenId(null);setDomSt({});setAns({});setDi(0);setResetPending(false);setStaffNotes('');setCounterSent(false);};
  const today = new Date().toLocaleDateString('he-IL',{year:'numeric',month:'long',day:'numeric'});
  const urgentCount = actions.filter(a=>a.urg==='urgent').length;

  // ═══ Question Renderer ═══
  const renderQ = (q:Q, domName?:string) => (
    <div key={q.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      {domName && <p className="text-xs text-blue-600 font-semibold mb-1">{domName}</p>}
      <label className="block font-medium text-sm mb-3 text-gray-800">{q.text}</label>
      {q.at==='boolean'&&(
        <div className="flex gap-3">
          {[true,false].map(v=>(
            <button key={String(v)} onClick={()=>sa(q.id,v)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold border ${ans[q.id]===v?(v?'bg-green-600 text-white border-green-600':'bg-red-500 text-white border-red-500'):'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
              {v?'כן':'לא'}
            </button>
          ))}
        </div>
      )}
      {q.at==='number'&&(
        <input type="number" value={ans[q.id]??''} onChange={e=>sa(q.id,e.target.value===''?'':Number(e.target.value))}
          className="w-full border rounded-lg px-4 py-2.5 text-sm text-right focus:ring-2 focus:ring-blue-500 outline-none"/>
      )}
      {q.at==='text'&&(
        <input type="text" value={ans[q.id]??''} onChange={e=>sa(q.id,e.target.value)}
          className="w-full border rounded-lg px-4 py-2.5 text-sm text-right focus:ring-2 focus:ring-blue-500 outline-none"/>
      )}
      {q.at==='date'&&(
        <input type="date" value={ans[q.id]??''} onChange={e=>sa(q.id,e.target.value)}
          className="w-full border rounded-lg px-4 py-2.5 text-sm text-right focus:ring-2 focus:ring-blue-500 outline-none"/>
      )}
      {(q.at==='select'||q.at==='status')&&q.opts&&(
        <div className="flex flex-wrap gap-2">
          {q.opts.map(opt=>(
            <button key={opt} onClick={()=>sa(q.id,opt)}
              className={`flex-1 min-w-fit py-2 px-3 rounded-lg text-xs font-medium border ${ans[q.id]===opt?'bg-blue-700 text-white border-blue-700':'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
              {opt}
            </button>
          ))}
        </div>
      )}
      {q.warn&&q.warn(ans)&&(
        <div className="mt-2 flex items-start gap-2 bg-orange-50 border border-orange-300 rounded-lg p-2.5 text-orange-800 text-xs">
          <span>⚠️</span><span>{q.warn(ans)}</span>
        </div>
      )}
      {q.info&&(
        <div className="mt-2 flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-blue-800 text-xs">
          <span>ℹ️</span><span>{q.info}</span>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900" dir="rtl">
      {/* HEADER */}
      <header className="no-print bg-blue-900 text-white py-4 px-6 shadow-lg">
        <div className="max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl font-bold">360</div>
            <div><h1 className="text-xl font-bold leading-none">מיצוי 360</h1><p className="text-blue-300 text-xs mt-0.5">כלי מיצוי זכויות — v4.0</p></div>
          </div>
          {step>0&&(
            <button onClick={()=>resetPending?doReset():setResetPending(true)} onBlur={()=>setResetPending(false)}
              className={`text-sm px-4 py-2 rounded-lg font-medium ${resetPending?'bg-red-500 text-white':'bg-white/10 hover:bg-white/20 text-white'}`}>
              {resetPending?'⚠️ לחץ שוב לאיפוס':'↺ פגישה חדשה'}
            </button>
          )}
        </div>
      </header>
      {/* STEP NAV */}
      <nav className="no-print bg-white border-b py-3 px-6 shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center gap-1">
          {STEPS.map((label,i)=>(
            <Fragment key={i}>
              {i>0&&<div className={`flex-1 h-0.5 ${i<=step?'bg-blue-600':'bg-gray-200'}`}/>}
              <button onClick={()=>{if(i<step){setStep(i);setResetPending(false);}}} disabled={i>step}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${i===step?'bg-blue-700 text-white shadow':i<step?'bg-blue-50 text-blue-700 cursor-pointer hover:bg-blue-100':'bg-gray-50 text-gray-400 cursor-default'}`}>
                <span className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold ${i<step?'bg-blue-600 text-white':''}`}>{i<step?'✓':i+1}</span>
                {label}
              </button>
            </Fragment>
          ))}
        </div>
      </nav>
      <main className="max-w-5xl mx-auto p-4 sm:p-6">

        {/* ══ SCREEN 0 — בחירת תרחיש ══ */}
        {step===0&&(
          <section className="animate-fade-in">
            <div className="mb-8 rounded-2xl overflow-hidden shadow-sm border">
              <div className="bg-gradient-to-l from-blue-900 to-blue-700 px-6 py-5 text-white">
                <h2 className="text-xl font-bold mb-1">ברוכים הבאים למיצוי 360</h2>
                <p className="text-blue-200 text-sm">כלי סיוע מקצועי לפקידי ביטוח לאומי — מיצוי זכויות מלא במקרים מורכבים</p>
              </div>
              <div className="bg-white px-6 py-5">
                <p className="text-sm text-gray-700 leading-relaxed mb-4">
                  המערכת מסייעת לזהות את <strong>מלוא הזכויות</strong> המגיעות למבוטח, עם דגש על מקרים מורכבים.
                  התהליך בנוי ב-3 שלבים: <strong>בדיקות פקיד</strong> במערכת, <strong>שאלון למשפחה</strong> למילוי בפגישה, ו<strong>ממצאים ומימוש</strong> — סיכום מוכן להדפסה.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[{e:'1️⃣',t:'בדיקות פקיד',d:'בדוק במערכת סטטוסים וזכאויות'},{e:'2️⃣',t:'שאלון למשפחה',d:'שאלות למילוי בפגישה עם המבוטח'},{e:'3️⃣',t:'ממצאים ומימוש',d:'סיכום פעולות מוכן להדפסה'}].map((s,i)=>(
                    <div key={i} className="flex items-start gap-3 bg-slate-50 rounded-xl p-3">
                      <span className="text-lg">{s.e}</span>
                      <div><p className="text-xs font-bold text-gray-800">{s.t}</p><p className="text-xs text-gray-500">{s.d}</p></div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-2 text-xs text-gray-400"><span>🔒</span><span>אין שמירת מידע אישי — כל הנתונים נמחקים בסגירת הדף</span></div>
              </div>
            </div>

            <h2 className="text-lg font-bold mb-1 text-gray-800">בחר תרחיש</h2>
            <p className="text-sm text-gray-500 mb-4">{SCENARIOS.filter(s=>s.active).length} תרחישים פעילים</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {SCENARIOS.filter(s=>s.active).map(s=>(
                <button key={s.id} onClick={()=>{setScenId(s.id);setDomSt({});setAns({});setDi(0);setStep(1);if(!counterSent){sendSheet({category:'counter',text:`תרחיש: ${s.name}`,page:'home'});setCounterSent(true);}}}
                  className={`rounded-xl border-2 p-5 text-right transition-all hover:shadow-md cursor-pointer ${sClr[s.color]}`}>
                  <div className="flex items-start justify-between mb-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sBdg[s.color]}`}>פעיל</span>
                    <span className="text-2xl">{s.icon}</span>
                  </div>
                  <h3 className="font-bold text-base text-gray-900 mb-1">{s.name}</h3>
                  <p className="text-xs text-gray-500">{s.profile}</p>
                  <p className="text-xs text-gray-400 mt-2">{s.domains.length} תחומים</p>
                </button>
              ))}
            </div>
            {SCENARIOS.filter(s=>!s.active).length>0&&(
              <div className="mt-8">
                <h3 className="text-base font-bold mb-1 text-gray-500">תרחישים נוספים — בהמשך..</h3>
                <p className="text-xs text-gray-400 mb-4">תרחישים אלו יופעלו בגרסאות הבאות</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 opacity-50">
                  {SCENARIOS.filter(s=>!s.active).map(s=>(
                    <div key={s.id} className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-5 text-right cursor-default">
                      <div className="flex items-start justify-between mb-2">
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-300 text-gray-600">בהמשך..</span>
                        <span className="text-2xl grayscale">{s.icon}</span>
                      </div>
                      <h3 className="font-bold text-base text-gray-500 mb-1">{s.name}</h3>
                      <p className="text-xs text-gray-400">{s.profile}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ══ SCREEN 1 — בדיקות פקיד ══ */}
        {step===1&&scen&&(
          <section className="animate-fade-in">
            <div className="flex items-center gap-3 mb-1">
              <span className="text-2xl">{scen.icon}</span>
              <h2 className="text-lg font-bold text-gray-800">שלב 1 — בדיקות פקיד: {scen.name}</h2>
            </div>
            <p className="text-sm text-gray-500 mb-5">סמן רלוונטיות לכל תחום, ומלא את הבדיקות במערכת</p>

            {/* Domain relevance cards */}
            <h3 className="text-sm font-bold text-gray-700 mb-3">סריקת תחומים</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
              {allDoms.map(d=>{
                const v=domSt[d.id];
                return (
                  <div key={d.id} className={`rounded-xl border p-4 shadow-sm transition-all ${v==='relevant'?'border-green-400 bg-green-50':v==='check'?'border-amber-400 bg-amber-50':v==='not_relevant'?'border-gray-200 bg-gray-50 opacity-60':'border-gray-200 bg-white'}`}>
                    <div className="flex items-start justify-between mb-1">
                      <h4 className="font-bold text-sm text-gray-900 flex-1 ml-2">{d.n}</h4>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{d.b}</span>
                        {d.priority==='high'&&<span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">עדיפות גבוהה</span>}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mb-1">{d.ds}</p>
                    <p className="text-xs font-semibold text-blue-800 mb-2">{d.am}</p>
                    <div className="flex gap-2">
                      {(['relevant','check','not_relevant'] as DS[]).map(x=>{
                        const lb=x==='relevant'?'רלוונטי':x==='not_relevant'?'לא רלוונטי':'לבדיקה';
                        const ac=x==='relevant'?'bg-green-600 text-white':x==='not_relevant'?'bg-gray-500 text-white':'bg-amber-500 text-white';
                        return <button key={x} onClick={()=>sd(d.id,x!)} className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${v===x?ac:'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}>{lb}</button>;
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Clerk questions */}
            {clerkQs.length>0&&(
              <>
                <h3 className="text-sm font-bold text-gray-700 mb-3 mt-6 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">🔍</span>
                  בדיקות פקיד במערכת ({clerkQs.length})
                </h3>
                <div className="space-y-3">
                  {clerkQs.map(({dom,q})=>renderQ(q,dom.n))}
                </div>
              </>
            )}

            <div className="mt-6 flex items-start gap-4">
              <button onClick={()=>{setDi(0);setStep(2);}}
                className="px-8 py-3 rounded-xl font-bold text-base bg-blue-700 text-white hover:bg-blue-800 shadow-md">
                המשך לשאלון משפחה ←
              </button>
              {missingClerk.length>0&&(
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 max-w-xs">
                  ⚠️ {missingClerk.length} שדות פקיד לא מולאו — ניתן להמשיך
                </p>
              )}
            </div>
          </section>
        )}

        {/* ══ SCREEN 2 — שאלון למשפחה ══ */}
        {step===2&&scen&&(
          <section className="animate-fade-in">
            {familyQs.length===0?(
              <div className="text-center py-12">
                <p className="text-gray-500 text-lg mb-3">אין שאלות משפחה לתחומים שנבחרו</p>
                <div className="flex gap-3 justify-center">
                  <button onClick={()=>setStep(1)} className="text-blue-600 underline text-sm">חזרה לבדיקות פקיד</button>
                  <button onClick={()=>setStep(3)} className="px-6 py-2 rounded-xl bg-green-600 text-white font-bold text-sm">לממצאים ←</button>
                </div>
              </div>
            ):(
              <>
                <div className="mb-4 bg-purple-50 border border-purple-200 rounded-xl p-3 flex items-center gap-3">
                  <span className="text-xl">👨‍👩‍👧</span>
                  <div>
                    <p className="text-sm font-bold text-purple-900">שאלון למשפחה</p>
                    <p className="text-xs text-purple-700">שאלות אלו נועדו למילוי בפגישה עם המבוטח או בני משפחתו</p>
                  </div>
                </div>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-base font-bold text-gray-800">שאלות למשפחה ({familyQs.length})</h2>
                  <span className="text-sm text-gray-400">{familyQs.length-missingFamily.length} מתוך {familyQs.length} מולאו</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 mb-5">
                  <div className="bg-purple-600 h-2 rounded-full transition-all" style={{width:`${familyQs.length>0?((familyQs.length-missingFamily.length)/familyQs.length)*100:0}%`}}/>
                </div>
                <div className="space-y-3">
                  {familyQs.map(({dom,q})=>renderQ(q,dom.n))}
                </div>
                <div className="mt-6 flex items-center justify-between">
                  <button onClick={()=>setStep(1)} className="px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-100 font-medium text-sm">→ חזרה לבדיקות פקיד</button>
                  <div className="flex flex-col items-end gap-2">
                    <button onClick={()=>setStep(3)} className="px-8 py-3 rounded-xl font-bold text-base bg-green-600 text-white hover:bg-green-700 shadow-md">לממצאים ומימוש ←</button>
                    {missingFamily.length>0&&(
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">⚠️ {missingFamily.length} שדות לא מולאו — ניתן להמשיך</p>
                    )}
                  </div>
                </div>
              </>
            )}
          </section>
        )}

        {/* ══ SCREEN 3 — ממצאים ומימוש ══ */}
        {step===3&&scen&&(
          <section className="animate-fade-in">
            <div className="hidden print:block mb-6 border-b-2 border-gray-800 pb-4">
              <h1 className="text-2xl font-bold">מיצוי 360 — סיכום פגישה</h1>
              <p className="text-gray-600">{today} | תרחיש: {scen.name}</p>
            </div>
            <div className="no-print flex items-center justify-between mb-5 flex-wrap gap-3">
              <div>
                <h2 className="text-lg font-bold text-gray-800">ממצאים ומימוש — {scen.name}</h2>
                <p className="text-sm text-gray-500">{today}</p>
              </div>
              <div className="flex gap-2">
                {urgentCount>0&&<span className="bg-red-100 text-red-800 text-sm font-bold px-3 py-1.5 rounded-full border border-red-300">{urgentCount} דחוף</span>}
                <button onClick={()=>window.print()} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-700 text-white hover:bg-blue-800 font-bold shadow text-sm">🖨️ הדפסה</button>
              </div>
            </div>

            {/* Actions */}
            <div className="mb-6 print-summary">
              <h3 className="text-base font-bold mb-3 text-blue-900 border-b-2 border-blue-200 pb-2">פעולות נדרשות ({actions.length})</h3>
              {actions.length===0?<p className="text-gray-400 py-4 text-sm">לא נמצאו פעולות</p>:(
                <div className="space-y-2">
                  {actions.map((act,i)=>(
                    <div key={i} className="bg-white rounded-xl border p-4 shadow-sm flex items-start gap-3">
                      <div className={`shrink-0 w-2 h-2 rounded-full mt-2 ${uDot(act.urg)}`}/>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${uClr(act.urg)}`}>{uLbl(act.urg)}</span>
                          <span className="text-xs text-gray-400">{act.tag}</span>
                        </div>
                        <p className="font-medium text-sm text-gray-900">{act.text}</p>
                        {act.clerkNote&&<p className="text-xs text-blue-700 mt-1 bg-blue-50 rounded px-2 py-1">📋 הנחיה לפקיד: {act.clerkNote}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Traps */}
            {traps.length>0&&(
              <div className="mb-6 print-summary">
                <h3 className="text-base font-bold mb-3 text-orange-800 border-b-2 border-orange-200 pb-2">אזהרות ({traps.length})</h3>
                <div className="space-y-2">
                  {traps.map((tr,i)=>(
                    <div key={i} className="bg-orange-50 border border-orange-300 rounded-xl p-4">
                      <p className="font-bold text-sm text-orange-800 mb-1">⚠️ {tr.text}</p>
                      {tr.fix&&<p className="text-xs text-orange-700">פעולה: {tr.fix}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Related rights */}
            {related.length>0&&(
              <div className="mb-6 print-summary">
                <h3 className="text-base font-bold mb-3 text-teal-800 border-b-2 border-teal-200 pb-2">זכויות נלוות ({related.length})</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {related.map((rb,i)=>(
                    <div key={i} className="bg-teal-50 border border-teal-200 rounded-xl p-3 flex items-start gap-2">
                      <span className="text-teal-600 text-sm font-bold shrink-0">↗</span>
                      <div><p className="font-semibold text-sm text-teal-900">{rb.name}</p><p className="text-xs text-teal-700">{rb.body}{rb.note?` — ${rb.note}`:''}</p></div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Summary stats */}
            <div className="mb-6 print-summary bg-gray-50 border rounded-xl p-4">
              <h3 className="text-sm font-bold text-gray-700 mb-2">סיכום פגישה</h3>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-white rounded-lg p-3 border"><div className="text-2xl font-bold text-red-600">{actions.filter(a=>a.urg==='urgent').length}</div><div className="text-xs text-gray-500">דחוף</div></div>
                <div className="bg-white rounded-lg p-3 border"><div className="text-2xl font-bold text-amber-600">{actions.filter(a=>a.urg==='within30').length}</div><div className="text-xs text-gray-500">תוך 30 יום</div></div>
                <div className="bg-white rounded-lg p-3 border"><div className="text-2xl font-bold text-sky-600">{actions.filter(a=>a.urg==='planning').length}</div><div className="text-xs text-gray-500">לתכנון</div></div>
              </div>
            </div>

            {/* Staff notes + audit export */}
            <div className="mb-6 print-summary">
              <h3 className="text-base font-bold mb-3 text-gray-800 border-b-2 border-gray-300 pb-2">הערות פקיד + ייצוא</h3>
              <textarea value={staffNotes} onChange={e=>setStaffNotes(e.target.value)} rows={3} placeholder="הערות פקיד לתיעוד התיק..."
                className="w-full border rounded-lg px-3 py-2.5 text-sm text-right resize-none focus:ring-2 focus:ring-blue-500 outline-none mb-3 no-print"/>
              {staffNotes&&<p className="hidden print:block text-sm text-gray-700 mb-3 whitespace-pre-wrap">הערות: {staffNotes}</p>}
              <button onClick={()=>{
                const lines=['=== מיצוי 360 — יומן ===','תרחיש: '+(scen?.name||''),'תאריך: '+today,'',
                  'פעולות ('+actions.length+'):',
                  ...actions.map((a,i)=>(i+1)+'. ['+uLbl(a.urg)+'] '+a.text+(a.clerkNote?' | הנחיה: '+a.clerkNote:'')),
                  '','אזהרות:',
                  ...traps.map(t=>'- '+t.text+(t.fix?' → '+t.fix:'')),
                  '','הערות פקיד:',staffNotes||'(ללא)','','=== סוף ==='].join('\n');
                navigator.clipboard.writeText(lines).then(()=>{setAuditCopied(true);setTimeout(()=>setAuditCopied(false),2500);});
              }} className={`no-print w-full py-2.5 rounded-xl text-sm font-bold ${auditCopied?'bg-green-600 text-white':'bg-gray-800 text-white hover:bg-gray-900'}`}>
                {auditCopied?'✓ הועתק!':'📋 ייצא יומן ללוח'}
              </button>
            </div>

            {/* Footer disclaimer */}
            <div className="border-t pt-4 text-xs text-gray-400 print-summary">
              <p>⚠️ <strong>אמת פרטים ב-btl.gov.il או *6050 לפני הגשה.</strong></p>
              <p className="mt-1">מיצוי 360 v4.0 | {today} | אין שמירת מידע אישי</p>
            </div>
            <div className="mt-6 no-print flex gap-3">
              <button onClick={()=>setStep(2)} className="px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-100 font-medium text-sm">→ חזרה לשאלון</button>
              <button onClick={()=>setStep(1)} className="px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-100 font-medium text-sm">→ חזרה לבדיקות פקיד</button>
              <button onClick={doReset} className="px-5 py-2.5 rounded-xl bg-blue-700 text-white hover:bg-blue-800 font-medium text-sm">פגישה חדשה ↺</button>
            </div>
          </section>
        )}

      </main>

      <footer className="no-print text-center py-4 text-xs text-gray-400 border-t mt-10">
        כלי עזר למיצוי זכויות 360 | אין שמירת מידע | {today}
      </footer>

      {/* Floating feedback button */}
      <div className="no-print fixed bottom-6 left-6 z-40 flex flex-col items-end gap-2">
        {feedbackItems.length>0&&<div className="bg-white border rounded-full px-3 py-1 text-xs text-gray-600 shadow-md">{feedbackItems.length} הערות</div>}
        <button onClick={()=>setShowFeedback(true)} title="משוב" className="flex items-center gap-2 px-5 py-3 rounded-full bg-purple-700 text-white shadow-xl hover:bg-purple-800 text-sm font-bold">💬 משוב</button>
      </div>

      {showFeedback&&<FeedbackModal items={feedbackItems} scenName={scen?.name||''} onAdd={e=>setFeedbackItems(p=>[...p,e])} onClose={()=>setShowFeedback(false)}/>}
    </div>
  );
}
