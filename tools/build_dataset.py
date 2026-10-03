import json,re,pathlib,datetime,subprocess
root=pathlib.Path(__file__).resolve().parents[1]
def read(n):return json.loads((root/n).read_text(encoding='utf-8-sig'))
rows=read('时间轴数据.json'); byid={r['id']:r for r in rows}
pages={p['page']:re.sub(r'\s+','',p['text']) for p in read('2023版史纲教材原文.json')['pages']}
# Manual source mappings: same precision/date already present in PDF; no draft refinements.
verified={
'三元里人民抗英':45,'金田起义':60,'太平天国定都天京':60,'《资政新篇》':61,
'戊戌变法开始':72,'戊戌政变':73,'《民报》发刊词阐发三民主义':83,
'武昌起义':88,'中华民国临时政府成立':89,'清帝退位':88,'五四运动爆发':106,
'中国共产党第一次全国代表大会':117,'中国共产党第二次全国代表大会':120,
'国民党第一次全国代表大会':122,'北伐战争开始':124,'南昌起义':134,
'《星星之火，可以燎原》':137,'《反对本本主义》':146,'九一八事变':148,
'一二九运动':152,'七七事变':149,'皖南事变':162,'《改造我们的学习》':168,
'全面内战爆发':182,'七届二中全会':196,'《论人民民主专政》':197,
'中国人民政治协商会议第一届全体会议':198,'中华人民共和国成立':204,
'第一届全国人大与宪法':223,'《论十大关系》':249,'调整、巩固、充实、提高':236,
'尼克松访华':248,'坚持四项基本原则':258,'澳门回归':298,'首次提出三个代表重要思想':301}
def assertion(label,source,page,status):return dict(label=label,start=None,end=None,precision='unknown',sourceId=source,page=page,status=status)
topics=[dict(id='war',name='革命与战争',color='#ab6548',description='起义、革命与民族解放'),dict(id='thought',name='思想与著作',color='#827152',description='理论、著作与思想发展'),dict(id='politics',name='政治与制度',color='#416979',description='政党、会议与国家制度'),dict(id='economy',name='经济与社会',color='#6c8562',description='经济建设、社会发展与科技')]
events=[]
for r in rows:
 events.append(dict(id=r['id'],groupId=r['id'],title=r['event'].split('\n')[0],content=r['event'],note=r['note'],topicId='politics',tags=['原表档案'],publication='original',trainable=False,isGroup=True,dates=dict(original=assertion(r['date'],'original',r['page'],'original'),textbook=None)))
counts={}
for line in (root/'data/event-map.tsv').read_text(encoding='utf-8-sig').splitlines():
 gid,date,title,topic,anchor=line.split('|');r=byid[gid];counts[gid]=counts.get(gid,0)+1
 bp=verified.get(title);book=None
 if bp:
  assert anchor and anchor in pages[bp],(title,bp,anchor)
  book=assertion(anchor,'textbook',bp,'verified')
 # Mapping is editorially selected per event, not positional splitting of wrapped cell lines.
 events.append(dict(id=f'{gid}-e{counts[gid]:02}',groupId=gid,title=title,content=title,note='',topicId=topic,tags=[],publication='verified' if book else 'original',trainable=bool(book),isGroup=False,dates=dict(original=assertion(date,'original',r['page'],'original'),textbook=book)))
comparisons=[]
for c in read('时间对照数据.json'):
 page=int(re.search(r'page=(\d+)',c['textbook_source']).group(1)); origpage=re.search(r'page=(\d+)',c.get('original_source',''))
 comparisons.append(dict(id=c['id'],title=c['title'],kind=c['kind'],publication='pending',textbook=assertion(c['textbook_date'],'textbook',page,'pending'),original=assertion(c['original_date'],'original',int(origpage.group(1)) if origpage else None,'original'),originalLabel=c['original_label']))
dataset=dict(version='history.v1',title='近现代史时间实验室',range=dict(start=1839,end=2010),topics=topics,sources=[dict(id='original',title='中国近现代史时间轴.pdf',fileName='original.pdf',kind='original',version='原始PDF',pdfPages=9),dict(id='textbook',title='中国近现代史纲要（2023版）',fileName='textbook.pdf',kind='textbook',version='2023',pdfPages=428)],events=events,comparisons=comparisons,generatedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
(root/'data/history.v1.json').write_text(json.dumps(dataset,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'{len(rows)} archive groups; {len(events)-len(rows)} curated events; {len(verified)} textbook-confirmed; {len(comparisons)} pending comparisons')
subprocess.run(['node','--experimental-strip-types',str(root/'tools/normalize_dataset.ts')],check=True,cwd=root)
