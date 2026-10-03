import fs from 'node:fs';
import { parseDate } from '../packages/history-core/src/index.ts';
const path=new URL('../data/history.v1.json',import.meta.url);
const dataset=JSON.parse(fs.readFileSync(path,'utf8'));
for(const e of dataset.events){for(const d of Object.values(e.dates) as any[]){if(d)Object.assign(d,parseDate(d.label));}}
for(const c of dataset.comparisons){Object.assign(c.textbook,parseDate(c.textbook.label));if(c.original)Object.assign(c.original,parseDate(c.original.label));}
fs.writeFileSync(path,JSON.stringify(dataset,null,2)+'\n');
