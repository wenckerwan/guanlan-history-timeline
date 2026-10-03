import { describe,it,expect } from 'vitest';
import fs from 'node:fs';
import {getTrainingEvents,filterEvents} from '@history/core';
import type {HistoryDataset} from '@history/core';
const data:HistoryDataset=JSON.parse(fs.readFileSync('data/history.v1.json','utf8'));
const original=JSON.parse(fs.readFileSync('时间轴数据.json','utf8'));
describe('publication and source integrity',()=>{
 it('preserves every original group and all extracted wording',()=>{const groups=data.events.filter(e=>e.isGroup);expect(groups).toHaveLength(124);for(const r of original){const g=groups.find(e=>e.id===r.id)!;expect(g.content).toBe(r.event);expect(g.note).toBe(r.note);expect(g.dates.original?.label).toBe(r.date);expect(g.dates.original?.page).toBe(r.page);}});
 it('keeps supplements and later dates exclusively in pending comparisons',()=>{expect(data.comparisons).toHaveLength(34);expect(data.comparisons.every(c=>c.publication==='pending')).toBe(true);expect(filterEvents(data.events).every(e=>!e.isGroup && e.publication!=='pending')).toBe(true);expect(getTrainingEvents(data.events).every(e=>e.dates.textbook!.end!<Date.UTC(2010,0,1))).toBe(true);});
 it('uses unique stable IDs and portable source references',()=>{expect(new Set(data.events.map(e=>e.id)).size).toBe(data.events.length);expect(JSON.stringify(data)).not.toMatch(/[FD]:[\\/]/);for(const e of data.events)for(const d of Object.values(e.dates))if(d)expect(data.sources.some(s=>s.id===d.sourceId)).toBe(true);});
 it('keeps independent events linked to their original group and trainable dates confirmed',()=>{for(const e of data.events.filter(e=>!e.isGroup)){expect(data.events.some(g=>g.isGroup && g.id===e.groupId)).toBe(true);}expect(getTrainingEvents(data.events)).toHaveLength(35);});
});
