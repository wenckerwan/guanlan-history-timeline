import html, json, re
from pathlib import Path

root = Path(__file__).resolve().parent
output = Path('F:/2027考研资料/考研政治/近现代史时间轴')
candidates = json.loads((root/'待审核数据.json').read_text(encoding='utf-8'))['candidates']
records = {r['id']:r for r in json.loads((root/'时间轴数据.json').read_text(encoding='utf-8'))}
# 按同一事项取原表日期，不把同一合并格内其他事项的日期误当作该事项日期。
original_dates = {
 'C01':'1894.7','C02':'1915','C03':'1917.10','C04':'未单列日期（列在1945年事件组内）',
 'C05':'1950.12','C06':'1951年底','C07':'1979.4.1','C08':'1978.5','C09':'1978.11.18',
 'C10':'1983.3','C11':'1984.10','C12':'2007.10.15','C13':'1936.5','C14':'1929.4',
 'B01':'未单列','B02':'未单列','B03':'未单列','B04':'未单列','B05':'1923',
 'B06':'未单列','B07':'未单列','B08':'未单列和平解决时间','B09':'未单列改编时间',
 'B10':'未单列该组著作时间','B11':'未单列','B12':'未单列讲话时间','B13':'未单列','B14':'未单列',
}
def esc(s):return html.escape(s,quote=True)
rows=[]
for c in candidates:
    record=records.get(c['target'])
    original=original_dates.get(c['id'],'未收录（超出原表范围）')
    original_source=f'../中国近现代史时间轴.pdf#page={record["page"]}' if record else '../中国近现代史时间轴.pdf'
    original_label=f'原PDF第{record["page"]}页' if record else '原PDF，1839—2009年'
    rows.append(dict(id=c['id'],title=c['title'],kind=c['kind'],textbook_date=c['date'],textbook_source=c['textbook_source'],textbook_label=f'《中国近现代史纲要》（2023版），PDF第{c["source_page"]}页',original_date=original,original_source=original_source,original_label=original_label))

md=['# 时间对照','','| 事项 | 《中国近现代史纲要》（2023版）时间 | 原PDF时间 |','| --- | --- | --- |']
for r in rows:
    md.append(f'| {r["id"]} {r["title"]} | {r["textbook_date"]}（来源：[{r["textbook_label"]}]({r["textbook_source"]})） | {r["original_date"]}（来源：[{r["original_label"]}]({r["original_source"]})） |')
(output/'补充与纠错审核清单.md').write_text('\n'.join(md)+'\n',encoding='utf-8')
(root/'时间对照数据.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')

path=output/'中国近现代史时间轴.html'
content=path.read_text(encoding='utf-8')
cards=[]
for r in rows:
    cards.append(f'<article class="review-card" id="{r["id"]}" data-kind="{r["kind"]}"><h3>{r["id"]} {esc(r["title"])}</h3><p>教材时间：<strong>{esc(r["textbook_date"])}</strong> <span class="small">（来源：<a href="{esc(r["textbook_source"])}">{esc(r["textbook_label"])}</a>）</span></p><p>原PDF时间：<strong>{esc(r["original_date"])}</strong> <span class="small">（来源：<a href="{esc(r["original_source"])}">{esc(r["original_label"])}</a>）</span></p></article>')
section='<section id="review-view" hidden><h2>时间对照</h2><div class="toolbar"><select id="kind" aria-label="对照类型"><option value="all">全部</option><option value="纠错">C组</option><option value="B">B组</option><option value="范围扩展">X组</option></select><button id="print-review">打印时间对照</button></div><div class="review-grid" id="reviews">'+''.join(cards)+'</div></section>'
content=re.sub(r'<section id="review-view" hidden>.*?</section>',lambda m:section,content,flags=re.S)
content=content.replace('02　补充与纠错审核','02　时间对照')
start=content.index('function updateReviewCount()')
end=content.index('filter();updateReviewCount();',start)
content=content[:start]+'filter();\n'+content[end+len('filter();updateReviewCount();'):]
path.write_text(content,encoding='utf-8')
print('34 date comparisons generated; source annotations follow each date')
