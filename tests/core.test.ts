import { describe, expect, it } from 'vitest';
import { parseDate, gradeOrder, getTrainingEvents, zoomWindow, filterEvents, getPrimaryDate } from '@history/core';
import type { HistoryEvent } from '@history/core';
const event=(id:string,label:string, extra:Partial<HistoryEvent>={}):HistoryEvent=>({id,title:id,content:'会议',note:'',groupId:'g',topicId:'politics',tags:[],publication:'verified',trainable:true,dates:{original:null,textbook:{...parseDate(label),label,sourceId:'textbook',page:1,status:'verified'}},...extra});
describe('source date intervals',()=>{
  it('retains a whole year instead of fabricating a day',()=>{const r=parseDate('1923年'); expect(r.precision).toBe('year');expect(r.start).toBe(Date.UTC(1923,0,1));expect(r.end).toBe(Date.UTC(1924,0,1)-1)});
  it('covers the whole month and supports leap years',()=>{const r=parseDate('1924年2月');expect(r.precision).toBe('month');expect(r.end).toBe(Date.UTC(1924,2,1)-1)});
  it('parses exact dates and rejects invalid ones',()=>{expect(parseDate('1919年5月4日').precision).toBe('day');expect(parseDate('1919.2.30').start).toBeNull()});
  it('preserves ranges and marks unknown dates unlocated',()=>{expect(parseDate('1978年12月18—22日').end).toBe(Date.UTC(1978,11,23)-1);expect(parseDate('1931.1-35.1').end).toBe(Date.UTC(1935,1,1)-1);expect(parseDate('未单列').start).toBeNull()});
});
describe('learning without false chronology',()=>{
  it('accepts either order for overlapping month/year assertions',()=>{const a=event('a','1923年'),b=event('b','1923年6月');expect(gradeOrder(['b','a'],[a,b]).correct).toBe(true)});
  it('rejects reversing strictly separated dates',()=>{const a=event('a','1919.5.4'),b=event('b','1921.7.23');expect(gradeOrder(['b','a'],[a,b]).correct).toBe(false)});
  it('rejects duplicate or missing IDs rather than granting a pass',()=>{const e=[event('a','1919年'),event('b','1921年')];expect(gradeOrder(['a','a'],e).correct).toBe(false);expect(gradeOrder(['a'],e).correct).toBe(false)});
  it('excludes unreviewed additions, unverified dates and archive groups',()=>{const good=event('good','1919年');const pending=event('pending','1923年',{publication:'pending'});const group=event('group','1924年',{isGroup:true});expect(getTrainingEvents([good,pending,group])).toEqual([good])});
});
describe('focused exploration',()=>{
  it('filters period by overlap and topic without erasing a year-only event',()=>{expect(filterEvents([event('a','1923年'),event('b','1925年')],{start:1923.4,end:1923.6,topicIds:['politics']})).toHaveLength(1)});
  it('keeps selected focus while zooming and clamps to dataset bounds',()=>{const w=zoomWindow({start:1839,end:2010},.1,1949);expect(w.start).toBeLessThan(1949);expect(w.end).toBeGreaterThan(1949);expect(zoomWindow({start:1839,end:1849},2,1839).start).toBe(1839)});
  it('uses only verified textbook dates ahead of original dates',()=>{const e=event('a','1923年');e.dates.textbook!.status='pending';e.dates.original={...parseDate('1922年'),label:'1922年',sourceId:'original',page:1,status:'original'};expect(getPrimaryDate(e)?.label).toBe('1922年')});
});

describe('source shorthand',()=>{
 it('retains within-year month ranges',()=>{expect(parseDate('1938.5-6')).toEqual({start:Date.UTC(1938,4,1),end:Date.UTC(1938,6,1)-1,precision:'range'});});
 it('recognizes half-years without stripping the period suffix',()=>{expect(parseDate('1940.下半年')).toEqual({start:Date.UTC(1940,6,1),end:Date.UTC(1941,0,1)-1,precision:'period'});expect(parseDate('1952年上半年').end).toBe(Date.UTC(1952,6,1)-1);});
});
