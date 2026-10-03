import type { DateAssertion, HistoryEvent, StudyState } from './types';
export type * from './types';
type Parsed = Pick<DateAssertion, 'start'|'end'|'precision'>;
const unknown = ():Parsed => ({start:null,end:null,precision:'unknown'});
function part(s:string, base?:number[]):Parsed {
 const n=s.split('.').filter(Boolean).map(Number);
 if(base && n[0]!<100){if(n.length===1 && base.length===2 && n[0]!<=12)n.unshift(base[0]!);else if(n.length===1 && base.length===3)n.unshift(base[0]!,base[1]!);else if(n.length===2 && base.length===3 && n[0]!<=12)n.unshift(base[0]!);else n[0]=Math.floor(base[0]!/100)*100+n[0]!;}
 const [y,m=1,d=1]=n;
 if(!y || n.length>3 || m<1 || m>12 || d<1 || d>31)return unknown();
 const start=Date.UTC(y,m-1,d), date=new Date(start);
 if(date.getUTCFullYear()!==y || date.getUTCMonth()!==m-1 || date.getUTCDate()!==d)return unknown();
 return {start,end:n.length===1?Date.UTC(y+1,0,1)-1:n.length===2?Date.UTC(y,m,1)-1:start+86400000-1,precision:n.length===1?'year':n.length===2?'month':'day'};
}
export function parseDate(label:string):Parsed {
 const s=label.trim().replace(/[年月]/g,'.').replace(/日/g,'').replace(/[—–～~至]/g,'-').replace(/\s/g,'').replace(/\.$/,'');
 const period=label.trim().match(/^(\d{4})[年.]?(上半年|下半年|年底|年初)$/);
 if(period){const y=Number(period[1]),p=period[2];const a=p==='下半年'?6:p==='年底'?11:0,b=p==='上半年'?6:p==='年初'?3:12;return {start:Date.UTC(y,a,1),end:Date.UTC(y,b,1)-1,precision:'period'};}
 if(!/^\d{4}(?:\.\d{1,2}){0,2}(?:-\d{1,4}(?:\.\d{1,2}){0,2})?$/.test(s))return unknown();
 const [left,right]=s.split('-'),a=part(left!);if(!right)return a;
 const b=part(right,left!.split('.').map(Number));return a.start!==null && b.end!==null && b.end>=a.start?{start:a.start,end:b.end,precision:'range'}:unknown();
}
export function getPrimaryDate(event:HistoryEvent):DateAssertion|null {return event.dates.textbook?.status==='verified'?event.dates.textbook:event.dates.original;}
export function toDecimalYear(timestamp:number):number {const y=new Date(timestamp).getUTCFullYear();return y+(timestamp-Date.UTC(y,0,1))/(Date.UTC(y+1,0,1)-Date.UTC(y,0,1));}
export function getTrainingEvents(events:HistoryEvent[]):HistoryEvent[] {return events.filter(e=>!e.isGroup && e.publication!=='pending' && e.trainable && e.dates.textbook?.status==='verified' && e.dates.textbook.start!==null && e.dates.textbook.end!==null);}
export function gradeOrder(ids:string[],events:HistoryEvent[]):{correct:boolean;violations:string[]} {
 if(ids.length!==events.length || new Set(ids).size!==ids.length || events.some(e=>!ids.includes(e.id)))return {correct:false,violations:['事件缺失或重复']};
 const ordered=ids.map(id=>events.find(e=>e.id===id)!),violations:string[]=[];
 for(let i=0;i<ordered.length;i++)for(let j=i+1;j<ordered.length;j++){const a=getPrimaryDate(ordered[i]!),b=getPrimaryDate(ordered[j]!);if(!a || !b || a.start===null || b.end===null)violations.push('时间未核定');else if(a.start>b.end)violations.push(`${ordered[i]!.id}:${ordered[j]!.id}`);}
 return {correct:!violations.length,violations};
}
export function zoomWindow(window:{start:number;end:number},factor:number,focus=(window.start+window.end)/2):{start:number;end:number} {
 const width=Math.min(171,Math.max(.25,(window.end-window.start)*Math.max(.01,factor))),ratio=Math.max(0,Math.min(1,(focus-window.start)/(window.end-window.start||1)));
 const start=Math.max(1839,Math.min(2010-width,focus-width*ratio));return {start,end:start+width};
}
export function filterEvents(events:HistoryEvent[],options:{query?:string;topicIds?:string[];start?:number;end?:number;archive?:boolean}={}):HistoryEvent[] {
 const q=(options.query??'').trim().toLowerCase();return events.filter(e=>{
 if(e.publication==='pending' || Boolean(e.isGroup)!==Boolean(options.archive))return false;
 if(options.topicIds?.length && !options.topicIds.includes(e.topicId))return false;
 if(q && ![e.title,e.content,e.note,...e.tags,e.dates.original?.label??'',e.dates.textbook?.label??''].join(' ').toLowerCase().includes(q))return false;
 const d=getPrimaryDate(e);if(!d || d.start===null || d.end===null)return Boolean(options.archive) || (options.start===undefined && options.end===undefined);
 return (options.start===undefined || toDecimalYear(d.end)>=options.start) && (options.end===undefined || toDecimalYear(d.start)<=options.end);
 });
}
export function makeInitialStudyState():StudyState {return {version:1,bookmarks:[],notes:{},attempts:[],view:null};}


