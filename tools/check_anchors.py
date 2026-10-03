import json,re,pathlib
root=pathlib.Path(__file__).resolve().parents[1]
pages=json.loads((root/'2023版史纲教材原文.json').read_text(encoding='utf-8-sig'))['pages']
for line in (root/'data/event-map.tsv').read_text(encoding='utf-8-sig').splitlines():
 g,d,t,topic,anchor=line.split('|')
 if anchor:
  hits=[p for p in pages if anchor in re.sub(r'\s+','',p['text'])]
  print(t,anchor,[(p['page'], re.sub(r'\s+','',p['text'])[max(0,re.sub(r'\s+','',p['text']).find(anchor)-35):re.sub(r'\s+','',p['text']).find(anchor)+110]) for p in hits[:3]])
