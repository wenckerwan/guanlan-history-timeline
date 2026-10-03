import json, re, html
from pathlib import Path
import pdfplumber

root = Path(__file__).resolve().parent
workspace = Path('F:/2027考研资料/考研政治')
output = workspace / '近现代史时间轴'
records = []
with pdfplumber.open(workspace / '中国近现代史时间轴.pdf') as doc:
    for pi,page in enumerate(doc.pages):
        for cells in page.extract_table():
            if cells[0] == '时间': continue
            if cells[0] is None:
                for key,text in zip(('date','event','note'),cells):
                    if text: records[-1][key] += '\n'+text
                continue
            date,event,note = (c or '' for c in cells)
            if not event: continue
            year=re.search(r'(18\d\d|19\d\d|20\d\d)',date)
            if year: year=int(year[0])
            elif '四五' in date: year=1840
            elif '六七' in date or '60' in date: year=1860
            elif '70' in date: year=1870
            else: year=9999
            records.append(dict(id=f'p{pi+1}-r{len(records)+1:03}',page=pi+1,date=date,event=event,note=note,year=year))
root.joinpath('时间轴数据.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'{len(records)} table groups')

source = workspace / '时政热点/时政题库/教材语料/v1_text_layer/史纲/00_全文.md'
source_lines = source.read_text(encoding='utf-8-sig').splitlines()
source_rel = '../时政热点/时政题库/教材语料/v1_text_layer/史纲/00_全文.md'
textbook_rel = '../本科教材/《中国近现代史纲要》（2023版）.pdf'
textbook = json.loads(root.joinpath('2023版史纲教材原文.json').read_text(encoding='utf-8'))
assert '2023' in textbook['pages'][0]['text'], 'Textbook edition mismatch'
date_policy = '日期以《中国近现代史纲要》（2023版）为准；教材写到年、月或时段即保留该精度，不自行补造日；与原表冲突的日期列入审核清单。'
# 所有提议只进入审核材料，未获同意前不进入时间轴正文。
specs = [
('C01','纠错','1894年11月','兴中会成立时间','p1-r020','原表标为1894.7；拟改为1894年11月。','孙中山1894年11月'),
('C02','纠错','1915年9月','新文化运动与刊物名称','p2-r035','拟写为陈独秀创办《青年杂志》（后改名《新青年》），避免把创刊名写作《新青年》。','新文化运动是从1915年9月'),
('C03','纠错','1917年11月7日','十月革命日期的历法说明','p2-r037','原表1917.10未说明历法；拟注明公历1917年11月7日、俄历10月25日。','1917年11月7日'),
('C04','纠错','1946年12月30日','一二三〇运动','p5-r065','原表放在1945年事件组内；拟独立列入1946年12月30日。','1946年12月30日'),
('C05','纠错','1950年10月19日','志愿军入朝作战','p6-r070','原表标1950.12；拟改为1950年10月19日，另注明10月8日组建志愿军。','10月8日，毛泽东发布命令'),
('C06','纠错','1952年上半年','五反运动','p6-r071','原表与1951年底三反合列；拟将五反分列为1952年上半年。','1952年上半年，开展了'),
('C07','纠错','1969年4月','中国共产党第九次全国代表大会','p7-r087','原表1979.4.1有明显年份错误；教材记为1969年4月，拟按教材保留到月，不沿用原表的具体日。','1969年4月召开的'),
('C08','纠错','1978年5月10—11日','真理标准讨论文章标题','p7-r096','原表《时间是检验真理的唯一标准》；拟改《实践是检验真理的唯一标准》，5月10日内部刊登、11日公开发表。','1978年5月10日'),
('C09','纠错','1978年12月18—22日','十一届三中全会','p7-r096','原表1978.11.18；拟改为1978年12月18日至22日。','1978年12月18日至22日'),
('C10','纠错','1988年4月','海南建省并建立经济特区','p8-r101','原表1983.3“海南岛辟为经济特区”；拟改为1988年4月正式批准海南建省并建立经济特区。','4月，七届全国人大一次会议正式批准设立海南'),
('C11','纠错','1984年10月','有计划的商品经济','p8-r102','原表“在公有制基础上有计划的市场经济”；拟改为“在公有制基础上的有计划的商品经济”。','指出我国社会主义经济是在公有制基础上的有计划的商品'),
('C12','纠错','2012年','科学发展观成为党的指导思想','p9-r122','原表口诀“十七科观成指导”容易混淆；拟区分2007年十七大写入党章与2012年十八大确立为党的指导思想。','确立科学发展观为党的指导思想'),
('C13','纠错','1936年5月／9月1日','停止内战与逼蒋抗日的时间区分','p4-r056','原表把5月通电与“逼蒋抗日”合写；拟区分5月放弃反蒋口号、9月1日明确提出“逼蒋抗日”。','1936年5月，毛泽东、朱德联名'),
('C14','纠错','1931年2月','土地革命路线的形成','p3-r048','原表1929年土地法备注混入后来形成的完整阶级路线；拟把1931年2月总结经验及相关土地革命路线单独列出。','1931年2月，毛泽东总结'),
('B01','新增','1858年','《天津条约》','p1-r012','补足第二次鸦片战争条约链：增开通商口岸、允许外国公使常驻北京，并与1860年《北京条约》区分。','1858年《天津条约》又规定'),
('B02','新增','1876年3月起，历时两年','左宗棠收复新疆','p1-r018','补入1876年3月受命出兵、经过两年作战收复新疆；保留教材的起始月份和历时表述，连接1881年《伊犁条约》。','1876年3月，左'),
('B03','新增','1903年','民主革命思想宣传','p2-r026','补入章炳麟《驳康有为论革命书》、邹容《革命军》，串联革命思想传播与革命组织形成。','1903年，章炳麟发表'),
('B04','新增','1918年起','李大钊传播马克思主义','p2-r038','补入1918年开始发表宣传十月革命的文章，连接1919年《我的马克思主义观》与建党准备。','从1918年7月起'),
('B05','补细','1923年6月','中共三大的组织决定','p3-r042','补全月份，并说明共产党员以个人身份加入国民党，同时保持党的独立性。','1923年6月在广州举行'),
('B06','新增','1927年9月29日','三湾改编','p3-r046','补入从组织上确立党对军队领导的重要节点，连接秋收起义与井冈山根据地创建。','9月29日，毛泽东领导起义军'),
('B07','新增','1928年4月下旬','井冈山会师','p3-r047','补入朱德、陈毅率部与毛泽东部队会师，成立工农革命军第四军。','1928年4月下旬'),
('B08','补细','1936年12月','西安事变和平解决的意义','p4-r056','补充和平解决使十年内战局面基本结束、国内和平初步实现，并为国共合作抗日创造条件。','西安事变的和平解决成为'),
('B09','补细','1937年8月25日','红军主力改编为八路军','p4-r057','为原表改编事件补入8月25日命令，明确朱德、彭德怀的职务。','8月25日，中共中央革命军事委员会'),
('B10','新增','1939—1940年之交','新民主主义理论的系统阐明','p5-r061','补列《〈共产党人〉发刊词》《中国革命和中国共产党》，与《新民主主义论》形成著作链。','1939年、1940年之交'),
('B11','新增','1952年底','国民经济恢复','p6-r072','补入国民经济得到全面恢复和初步发展的节点，连接恢复时期与一五计划。','到1952年底，国民经济得'),
('B12','新增','1978年12月13日','《解放思想，实事求是，团结一致向前看》','p7-r096','单独补列邓小平在中央工作会议闭幕会的讲话，说明它为十一届三中全会奠定思想基础。','12月13日，邓小平在中央工作会议'),
('B13','新增','1980年8月','《党和国家领导制度的改革》','p8-r098','补入邓小平关于领导制度、组织制度改革的讲话及其根本性、全局性、稳定性、长期性认识。','1980年8月，中央政治局召开'),
('B14','新增','1990年4月','开发开放浦东','p8-r105','补齐对外开放节点，说明其对上海、长三角及长江流域的带动作用。','1990年4月，党中央、国务院批准开发开放浦东'),
('X01','范围扩展','2012年11月8—14日','党的十八大','', '原PDF止于2009年；可选扩展至新时代，补入全面建成小康社会部署及科学发展观指导地位。','2012年11月8日至14日'),
('X02','范围扩展','2013年11月9—12日','十八届三中全会','', '可选补入全面深化改革及完善和发展中国特色社会主义制度、推进国家治理体系和治理能力现代化的总目标。','2013年11月9日至12日'),
('X03','范围扩展','2017年10月18—24日','党的十九大','', '可选补入习近平新时代中国特色社会主义思想写入党章、我国社会主要矛盾变化及现代化战略安排。','2017年10月18日至24日'),
('X04','范围扩展','2021年7月1日','全面建成小康社会宣告','', '与2000年总体小康区分，补入实现第一个百年奋斗目标的宣告。','2021年7月1日，习近平在庆祝'),
('X05','范围扩展','2021年11月','十九届六中全会与第三个历史决议','', '与1945年、1981年历史决议串联，补入《关于党的百年奋斗重大成就和历史经验的决议》。','2021年11月，党的十九届六中全会通过'),
('X06','范围扩展','2022年10月16日','党的二十大开幕','', '可选补入以中国式现代化全面推进中华民族伟大复兴的主题节点；当前材料扩展上限为2022年。','大会于2022年10月16日'),
]
candidates=[]
for cid,kind,date,title,target,proposal,anchor in specs:
    hits=[i for i,line in enumerate(source_lines) if anchor in line]
    if not hits: raise ValueError(f'Missing source: {cid} {anchor}')
    i=hits[0]
    start=max(0,i-2); end=min(len(source_lines),i+7)
    preceding='\n'.join(source_lines[:i+1])
    pages=re.findall(r'## PDF p(\d+)',preceding)
    source_page = int(pages[-1])
    normalize = lambda t: re.sub(r'\s','',t)
    direct = textbook['pages'][source_page-1]['text']
    assert normalize(anchor) in normalize(direct), f'Textbook PDF source mismatch: {cid}'
    candidates.append(dict(id=cid,kind=kind,date=date,title=title,target=target,proposal=proposal,source=source_rel,line=start+1,end=end,source_page=str(source_page),textbook_source=f'{textbook_rel}#page={source_page}',date_basis='中国近现代史纲要（2023版）',source_verified='已与教材PDF原页文本层核对',excerpt='\n'.join(source_lines[start:end]),status='待审核'))
unverified=[
('U01','1937年南京陷落日期','p4-r057','原表1937.12.24疑似有误；已检索的教材段落未提供可直接核对的具体日期，暂不改写。'),
('U02','万隆会议年份','p6-r073','原表“1995年万隆会议”疑似笔误；目前找到的本地摘录缺少对应段落，暂不改写。'),
('U03','1928年《井冈山土地法》月份','p3-r047','原表时间合并在1928.12，多个事件共用单元格；月份需另核原始资料，不强行对应。'),
('U04','其他合并日期与事件的配对','p4-r057','原表1937.8.14未明确对应独立事件；原表合并排版可能产生错配，保留原组并待核。'),
('U05','口诀中的“九到十一文革兴”','p9-r124','原文记忆口诀可能使文革结束时间与党代会时间混淆；需与1976年10月文革结束节点对照，暂保留原文。'),
]
root.joinpath('待审核数据.json').write_text(json.dumps(dict(candidates=candidates,unverified=unverified),ensure_ascii=False,indent=2),encoding='utf-8')

def pdf_link(page): return f'[原PDF第{page}页](../中国近现代史时间轴.pdf#page={page})'
def table_cell(text): return text.replace('|','\\|').replace('\n','<br>')
raw=json.loads(root.joinpath('pdf原文.json').read_text(encoding='utf-8'))
appendix=raw['pages'][8]['text'].split('附：',1)[1]
notes=['---','title: 中国近现代史时间轴','aliases: [中国近现代史大事年表, 史纲时间轴]','tags: [考研政治, 史纲, 时间轴]','source: "中国近现代史时间轴.pdf"','source_pages: 9','status: "原文转换版；补充及纠错待审核"','created: 2026-10-03','---','','# 中国近现代史时间轴','','> [!info] 使用说明','> 本笔记仅转换原PDF（1839—2009年），保留原表的事件、备注与附录；补充史实和纠错建议均未并入正文。','> 原表有多日期、合并单元格，一行是一组相关事件，不代表日期与换行逐一对应；可用页码链接核对。','> 日期及措辞可能含原文错误，学习时请先查看 [[补充与纠错审核清单]]。','','- [[中国近现代史时间轴_逐页原文]]','- [[补充与纠错审核清单]]','- [打开详细时间轴HTML](中国近现代史时间轴.html)','','## 目录','']
for page in range(1,10): notes.append(f'- [[#原PDF第{page}页]]')
notes.append('- [[#附录：原文会议口诀及注释]]')
for page in range(1,10):
    notes+=['',f'## 原PDF第{page}页','',pdf_link(page),'']
    for r in records:
        if r['page']==page:
            notes += [f'### {r["date"].replace(chr(10)," / ")} ^{r["id"]}','','**事件**', '',r['event'].replace('\n','  \n'),'']
            if r['note']: notes += ['**原表备注**','',r['note'].replace('\n','  \n'),'']
notes += ['','## 原表编者说明','','注：用斜体或下划线标记的事件相互联系紧密。另外，如果需要标明主要阶段和时期可在页边栏自行添加。本表仅供参考，复习时仍需与其他资料结合使用，以达到最佳效果。','','> 转换后未复刻原表全部粗体、斜体及下划线样式；这些排版强调请查PDF原页。']
notes+=['','## 附录：原文会议口诀及注释','','> [!warning] 原文保留','> 口诀和注释未作史实订正，其中疑点已列入审核清单。','',appendix,'']
output.joinpath('中国近现代史时间轴.md').write_text('\n'.join(notes),encoding='utf-8')
note_path = output.joinpath('中国近现代史时间轴.md')
note_path.write_text(note_path.read_text(encoding='utf-8').replace('source_pages: 9', 'source_pages: 9\ndate_basis: "中国近现代史纲要（2023版）"').replace('> [!info] 使用说明','> [!info] 使用说明\n> '+date_policy+'\n> 日期核对教材：[2023版史纲PDF]('+textbook_rel+')'),encoding='utf-8')
original=['---','title: 中国近现代史时间轴（逐页原文）','tags: [考研政治, 史纲, PDF原文]','---','','# 中国近现代史时间轴 · 逐页原文','','> 按PDF文本层提取，保留各页原文；表格文本阅读顺序可能与视觉布局不同，排版关系请查原PDF。','']
for p in raw['pages']: original += [f'## 第{p["page"]}页','',pdf_link(p['page']),'','```text',p['text'],'```','']
output.joinpath('中国近现代史时间轴_逐页原文.md').write_text('\n'.join(original),encoding='utf-8')
review=['---','title: 近现代史时间轴补充与纠错审核清单','tags: [考研政治, 史纲, 待审核]','status: 待用户审核','---','','# 补充与纠错审核清单','','> 所有项目均为提议，尚未并入笔记和HTML时间轴正文。','> 来源为工作区教材文本层摘录；其文件本身标有 verification=pending，不视为完成教材原页的逐字校对。每项给出文件行号、教材PDF页码与上下文，便于复核。','> 可按编号回复“同意C01—C14、B01—B14；X组不加”，或逐项勾选；勾选只是审核记录，不会自动修改正文。','','## 审核汇总','','| 编号 | 类型 | 时间 | 项目 | 决定 |','| --- | --- | --- | --- | --- |']
for c in candidates: review.append(f'| {c["id"]} | {c["kind"]} | {c["date"]} | [[#{c["id"]} {c["title"]}\\|{c["title"]}]] | 待审核 |')
for c in candidates:
    review += ['',f'## {c["id"]} {c["title"]}','','- [ ] 同意此项',f'- 类型：{c["kind"]}；拟用时间：{c["date"]}',f'- 提议：{c["proposal"]}']
    if c['target']: review.append(f'- 对应原文：[[中国近现代史时间轴#^{c["target"]}]]')
    review += [f'- 依据：[教材全文 · 第{c["line"]}—{c["end"]}行]({source_rel})；教材PDF第{c["source_page"]}页。','','原文上下文：','','```text',c['excerpt'],'```']
review+=['','## 证据不足、暂不修改的疑点','']
for cid,title,target,reason in unverified: review += [f'### {cid} {title}','',reason,f'对应：[[中国近现代史时间轴#^{target}]]','']
output.joinpath('补充与纠错审核清单.md').write_text('\n'.join(review),encoding='utf-8')
review_path = output.joinpath('补充与纠错审核清单.md')
review_text = review_path.read_text(encoding='utf-8').replace('# 补充与纠错审核清单', '# 补充与纠错审核清单\n\n> [!important] 日期依据\n> '+date_policy+'\n> 已核对本地教材封面和版权页：2023年版、高等教育出版社、2023年2月第9版，ISBN 978-7-04-059901-5。')
review_text = review_text.replace('> 来源为工作区教材文本层摘录；其文件本身标有 verification=pending，不视为完成教材原页的逐字校对。每项给出文件行号、教材PDF页码与上下文，便于复核。','> 下列34项提议的定位关键词已与2023版教材PDF对应页文本层重新核对；摘录文件的 verification=pending 标记仍保留，文本层核对不等于完成原页图像的逐字校对。每项均增加教材原页链接。')
for c in candidates:
    heading = f'## {c["id"]} {c["title"]}'
    review_text = review_text.replace(heading, heading+f'\n\n日期依据：[《中国近现代史纲要》（2023版）PDF第{c["source_page"]}页]({c["textbook_source"]})；已核对该页文本层。')
review_path.write_text(review_text,encoding='utf-8')
print(f'{len(candidates)} sourced proposals; {len(unverified)} unresolved items; markdown generated')

template='''<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>中国近现代史时间轴 · 1839—2009</title>
<style>
:root{--paper:#f6f3ed;--card:#fffefa;--ink:#272f33;--muted:#656d70;--red:#863e3b;--line:#dcd6cb;--gold:#9b713a}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.8 system-ui,"Microsoft YaHei",sans-serif}button,input,select{font:inherit}a{color:var(--red);text-underline-offset:4px}button{cursor:pointer;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--ink);padding:7px 13px}button:hover{border-color:var(--red)}button.active{background:var(--red);color:white;border-color:var(--red)}button:focus-visible,input:focus-visible,select:focus-visible,a:focus-visible,summary:focus-visible{outline:3px solid #ac804e;outline-offset:3px}.layout{max-width:1380px;margin:auto;display:grid;grid-template-columns:235px minmax(0,1fr);gap:52px;padding:42px 42px 80px}aside{position:sticky;top:28px;align-self:start}.brand{letter-spacing:.16em;font-size:12px;color:var(--red);font-weight:700}.rail-title{font-family:Georgia,serif;font-size:42px;line-height:1.1;margin:20px 0 5px}.small{font-size:13px;color:var(--muted)}aside nav{display:grid;gap:9px;margin:30px 0}aside nav button{text-align:left;padding:12px 14px}aside .links{border-top:1px solid var(--line);padding-top:20px;display:grid;gap:8px;font-size:13px}h1{font-size:clamp(32px,4vw,54px);line-height:1.25;font-weight:700;letter-spacing:-.04em;margin:16px 0}h2{font-size:25px;margin:25px 0 14px}header{border-bottom:1px solid var(--line);padding-bottom:26px}.eyebrow{color:var(--red);font-size:13px;letter-spacing:.13em}.intro{max-width:760px;color:var(--muted)}.stats{display:flex;flex-wrap:wrap;gap:30px;margin:23px 0 0}.stats strong{font-family:Georgia,serif;font-size:30px;color:var(--red);display:block;line-height:1.3}.stats span{font-size:12px;color:var(--muted)}.notice{background:#efe6d8;border-left:3px solid var(--gold);padding:14px 18px;font-size:14px;margin:25px 0}.toolbar{display:flex;flex-wrap:wrap;gap:10px;background:var(--paper);padding:12px 0;align-items:center}.toolbar input{flex:1;min-width:180px;border:1px solid var(--line);border-radius:8px;background:var(--card);padding:10px 14px}.toolbar select{border:1px solid var(--line);border-radius:8px;background:var(--card);padding:10px;max-width:100%}.periods{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.periods button{font-size:13px}.count{font-size:13px;color:var(--muted);margin:16px 0}.timeline{border-left:1px solid #b9a28d;margin-left:15px;padding-left:28px}.entry{position:relative;margin:0 0 18px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:22px 26px}.entry:before{content:"";position:absolute;left:-35px;top:30px;width:11px;height:11px;background:var(--red);border:3px solid var(--paper);border-radius:50%;box-sizing:content-box}.entry-top{display:flex;gap:12px;align-items:flex-start;justify-content:space-between}.date{font-weight:700;color:var(--red);font-size:16px;white-space:pre-line}.source{font-size:12px;color:var(--muted);white-space:nowrap}.badge{font-size:12px;color:var(--gold);border:1px solid #d8c19e;border-radius:4px;padding:1px 6px;display:inline-block;margin:6px 4px 0 0}.entry h3{font-size:20px;line-height:1.55;margin:12px 0}.body{white-space:pre-line;overflow-wrap:anywhere;font-size:15px}.note{margin-top:16px;padding-top:12px;border-top:1px dashed var(--line);color:#4d585c}.note b{display:block;font-size:12px;color:var(--muted);letter-spacing:.1em;margin-bottom:6px}summary{cursor:pointer;font-size:14px;color:var(--red)}details[open] summary{margin-bottom:12px}.review-grid{display:grid;gap:15px}.review-card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:22px}.review-card h3{font-size:20px;margin:6px 0 8px}.review-head{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px}.review-card select{background:var(--paper);border:1px solid var(--line);border-radius:6px;padding:7px}.excerpt{font-size:13px;color:var(--muted);white-space:pre-wrap;background:#f6f3ed;padding:12px;border-radius:6px}.unresolved{border:1px dashed var(--gold);padding:18px;margin:14px 0}.poem{white-space:pre-line;background:var(--card);padding:26px;border:1px solid var(--line);border-radius:12px}.empty{padding:35px;text-align:center;color:var(--muted)}footer{border-top:1px solid var(--line);margin-top:35px;padding-top:15px;color:var(--muted);font-size:12px}[hidden]{display:none!important}
@media(max-width:900px){.layout{grid-template-columns:1fr;padding:24px 20px;gap:25px}aside{position:static}.rail-title{display:none}aside nav{display:flex;flex-wrap:wrap;margin:14px 0}aside .links{display:flex;flex-wrap:wrap;gap:14px;padding-top:12px}.entry{padding:18px}.timeline{padding-left:21px;margin-left:8px}.entry:before{left:-28px}.entry-top{flex-wrap:wrap}.stats{gap:22px}}
@media print{body{background:white;font-size:11pt}.layout{display:block;padding:0;max-width:none}aside,.toolbar,.periods,.notice .control,.review-controls,footer{display:none!important}header{padding-bottom:10px}h1{font-size:25pt}.stats{display:none}.entry{break-inside:avoid;border-radius:0;padding:12px 16px}.timeline{border-left:0;padding-left:0;margin:0}.entry:before{display:none}.body{font-size:10pt}summary{display:none}.notice{font-size:10pt}.review-card{break-inside:avoid}}
</style></head><body><div class="layout"><aside><div class="brand">CHRONICLE / 史纲</div><div class="rail-title">1839<br>—2009</div><div class="small">中国近现代史 · 原文转换版</div><nav aria-label="内容视图"><button class="active" data-view="timeline">01　详细时间轴</button><button data-view="review">02　补充与纠错审核</button><button data-view="appendix">03　原文记忆口诀</button></nav><div class="links"><a href="中国近现代史时间轴.md">Obsidian笔记</a><a href="补充与纠错审核清单.md">审核清单</a><a href="../中国近现代史时间轴.pdf">原始PDF</a><a href="中国近现代史时间轴_逐页原文.md">逐页原文备份</a></div><p class="small">离线可用，无需联网。<br>补充内容审核后再合入。</p></aside>
<main><header><div class="eyebrow">中国近现代史大事年表 / STUDY EDITION</div><h1>沿着时间，梳理历史。</h1><p class="intro">从虎门销烟到2009年，保留原表的事件、备注与会议线索。可以搜索年份、人物、条约和会议，并随时回到PDF原页核对。</p><div class="stats"><div><strong>9</strong><span>原PDF页数</span></div><div><strong>124</strong><span>原表事件组</span></div><div><strong>34</strong><span>有来源的待审提议</span></div><div><strong>5</strong><span>待进一步核实的疑点</span></div></div></header>
<section id="timeline-view"><div class="notice">正文保留PDF原文，尚未应用任何补充或史实纠错。多日期的合并单元格按原表成组展示，日期与事件不一定逐行对应；标有“待审核”的条目可在审核页查看具体建议。年份筛选依据原表所写时间。</div><div class="toolbar"><input id="search" type="search" aria-label="搜索时间轴" placeholder="搜索：年份 / 人物 / 事件 / 备注"><select id="sort" aria-label="排序"><option value="original">原表顺序</option><option value="year">按起始年份排列</option></select><button id="expand">展开全部详情</button><button id="collapse">收起全部详情</button><button id="print">打印</button></div><div class="periods" id="periods" aria-label="年份区间"></div><p class="count" id="count" aria-live="polite"></p><div class="timeline" id="timeline">__TIMELINE__</div><p class="empty" id="empty" hidden>没有找到匹配条目，试试其他关键词或年份区间。</p></section>
<section id="review-view" hidden><h2>先审核，再补充。</h2><div class="notice">下列提议独立于时间轴正文。来源是工作区教材文本摘录，原摘录标为 verification=pending，尚未逐页核图。选择审核意见后，可导出JSON文件；导出和选择均不会改动时间轴。建议优先审核C组纠错，再审核B组补充，X组用于可选扩展至2022年。</div><div class="toolbar review-controls"><select id="kind" aria-label="审核类型"><option value="all">全部审核项</option><option value="纠错">C组 · 纠错</option><option value="B">B组 · 补充与细化</option><option value="范围扩展">X组 · 范围扩展</option></select><button id="export">导出审核意见</button><button id="print-review">打印当前审核清单</button></div><p class="count" id="review-count" aria-live="polite"></p><div class="review-grid" id="reviews">__REVIEWS__</div><h2>仍需核实的疑点</h2>__UNVERIFIED__</section>
<section id="appendix-view" hidden><h2>原文会议口诀与注释</h2><div class="notice">以下是第9页附录的原文转换，含原文措辞及可能的错误。“十七科观成指导”等表述请结合C12审核建议核对。</div><div class="poem">__APPENDIX__</div><p><a href="../中国近现代史时间轴.pdf#page=9">查看PDF第9页</a></p><button id="print-appendix">打印附录</button></section>
<footer>制作日期：2026年10月3日 · 来源：中国近现代史时间轴.pdf · 原文版 / 补充待审核 · 原表行组保留；未补造具体日期</footer></main></div>
<script type="application/json" id="data">__DATA__</script>
<script>
const data=JSON.parse(document.getElementById('data').textContent),entries=[...document.querySelectorAll('.entry')];let period='all',view='timeline';
const bands=[['all','全部年份',0,9999],['early','1839—1918',1839,1918],['party','1919—1930',1919,1930],['war','1931—1945',1931,1945],['liberation','1946—1949',1946,1949],['build','1950—1977',1950,1977],['reform','1978—2009',1978,2009]];
const periodRoot=document.getElementById('periods');bands.forEach(([id,label])=>{const b=document.createElement('button');b.textContent=label;b.classList.toggle('active',id===period);b.setAttribute('aria-pressed',id===period);b.addEventListener('click',()=>{period=id;periodRoot.querySelectorAll('button').forEach(n=>{n.classList.toggle('active',n===b);n.setAttribute('aria-pressed',n===b)});filter()});periodRoot.append(b)});
function filter(){const query=document.getElementById('search').value.trim().toLowerCase(),band=bands.find(b=>b[0]===period);let visible=0;entries.forEach(e=>{const year=Number(e.dataset.year);e.hidden=!(year>=band[2]&&year<=band[3]&&e.textContent.toLowerCase().includes(query));if(!e.hidden)visible++});document.getElementById('count').textContent=`显示 ${visible} / ${entries.length} 组 · 日期、事件和备注均可检索`;document.getElementById('empty').hidden=visible!==0}
document.getElementById('search').addEventListener('input',filter);document.getElementById('sort').addEventListener('change',e=>{const order=[...entries].sort(e.target.value==='year'?(a,b)=>Number(a.dataset.year)-Number(b.dataset.year)||Number(a.dataset.index)-Number(b.dataset.index):(a,b)=>Number(a.dataset.index)-Number(b.dataset.index));order.forEach(n=>document.getElementById('timeline').append(n))});
document.getElementById('expand').onclick=()=>entries.filter(e=>!e.hidden).forEach(e=>e.querySelector('details').open=true);document.getElementById('collapse').onclick=()=>entries.filter(e=>!e.hidden).forEach(e=>e.querySelector('details').open=false);
function switchView(v){view=v;['timeline','review','appendix'].forEach(id=>document.getElementById(id+'-view').hidden=id!==v);document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===v);b.setAttribute('aria-pressed',b.dataset.view===v)})}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>switchView(b.dataset.view));document.querySelectorAll('[data-review]').forEach(b=>b.onclick=()=>{switchView('review');document.getElementById('kind').value='all';reviewFilter();document.getElementById(b.dataset.review).scrollIntoView({block:'center'})});
function printCurrent(){const opened=[...document.querySelectorAll('section:not([hidden]) details')].filter(d=>!d.open);opened.forEach(d=>d.open=true);window.addEventListener('afterprint',()=>opened.forEach(d=>d.open=false),{once:true});window.print()};['print','print-review','print-appendix'].forEach(id=>document.getElementById(id).onclick=printCurrent);
function reviewFilter(){const type=document.getElementById('kind').value;document.querySelectorAll('.review-card').forEach(c=>c.hidden=type!=='all'&&(type==='B'?!c.id.startsWith('B'):c.dataset.kind!==type))};document.getElementById('kind').onchange=reviewFilter;
function updateReviewCount(){const counts={pending:0,agree:0,reject:0,hold:0};document.querySelectorAll('.decision').forEach(s=>counts[s.value]++);document.getElementById('review-count').textContent=`同意 ${counts.agree} · 不采用 ${counts.reject} · 需调整 ${counts.hold} · 待审核 ${counts.pending}（意见仅保留在当前页面，离开前请导出）`};document.querySelectorAll('.decision').forEach(s=>s.onchange=updateReviewCount);
document.getElementById('export').onclick=()=>{const decisions=data.candidates.map(c=>({...c,decision:document.querySelector('#'+c.id+' .decision').value}));const blob=new Blob([JSON.stringify({document:'中国近现代史时间轴',exported_at:new Date().toISOString(),applied_to_timeline:false,decisions},null,2)],{type:'application/json;charset=utf-8'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='近现代史时间轴_审核意见.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
filter();updateReviewCount();
</script></body></html>'''
def esc(s): return html.escape(str(s),quote=True)
cards=[]
for index,r in enumerate(records):
    flags=[c for c in candidates if c['target']==r['id']]
    uncertain=[u for u in unverified if u[2]==r['id']]
    badges=''.join(f'<button class="badge" data-review="{c["id"]}">{c["id"]} 待审核</button>' for c in flags)
    badges+=''.join(f'<span class="badge">{u[0]} 待核实</span>' for u in uncertain)
    title=r['event'].split('\n')[0]
    cards.append(f'<article class="entry" id="{r["id"]}" data-year="{r["year"]}" data-index="{index}"><div class="entry-top"><div class="date">{esc(r["date"])}</div><a class="source" href="../中国近现代史时间轴.pdf#page={r["page"]}">PDF 第{r["page"]}页 ↗</a></div>{badges}<h3>{esc(title)}</h3><details open><summary>查看完整事件与原表备注</summary><div class="body">{esc(r["event"])}</div><div class="body note"><b>原表备注</b>{esc(r["note"]) if r["note"] else "原表此栏未填写备注。"}</div></details></article>')
review_cards=[]
for c in candidates:
    original_record=next((r for r in records if r['id']==c['target']),None)
    origin=f'<p class="small">对应原表：PDF第{original_record["page"]}页 · {esc(original_record["date"].replace(chr(10)," / "))}</p>' if original_record else '<p class="small">原表时间范围以外的可选扩展</p>'
    review_cards.append(f'<article class="review-card" id="{c["id"]}" data-kind="{c["kind"]}"><div class="review-head"><span class="eyebrow">{c["id"]} / {c["kind"]} / {c["date"]}</span><select class="decision" aria-label="{c["id"]}审核意见"><option value="pending">待审核</option><option value="agree">同意</option><option value="reject">不采用</option><option value="hold">需调整</option></select></div><h3>{esc(c["title"])}</h3>{origin}<p>{esc(c["proposal"])}</p><details><summary>查看本地来源与上下文</summary><p class="small"><a href="{esc(c["source"])}">史纲教材全文摘录</a> · 文件第{c["line"]}—{c["end"]}行 · 教材PDF第{c["source_page"]}页</p><div class="excerpt">{esc(c["excerpt"])}</div></details></article>')
unresolved=''.join(f'<div class="unresolved"><b>{u[0]} · {esc(u[1])}</b><p>{esc(u[3])}</p></div>' for u in unverified)
payload=json.dumps(dict(candidates=candidates),ensure_ascii=False).replace('<','\\u003c')
result=template.replace('__TIMELINE__','\n'.join(cards)).replace('__REVIEWS__','\n'.join(review_cards)).replace('__UNVERIFIED__',unresolved).replace('__APPENDIX__',esc(appendix)).replace('__DATA__',payload)
result = result.replace('正文保留PDF原文，尚未应用任何补充或史实纠错。',esc(date_policy)+'<br>正文保留PDF原文，尚未应用任何补充或史实纠错。')
result = result.replace('来源是工作区教材文本摘录，原摘录标为 verification=pending，尚未逐页核图。','日期统一以《中国近现代史纲要》（2023版）为准；34项定位关键词已与教材PDF原页文本层核对，原摘录的 verification=pending 标记保留，尚未逐页核图。')
for c in candidates:
    marker = f'<article class="review-card" id="{c["id"]}" data-kind="{c["kind"]}">'
    result = result.replace(marker, marker+f'<p class="small">日期依据：<a href="{esc(c["textbook_source"])}">2023版史纲PDF第{c["source_page"]}页</a> · 已核对文本层</p>')
output.joinpath('中国近现代史时间轴.html').write_text(result,encoding='utf-8')
print('Offline HTML generated')
import runpy
runpy.run_path(str(root/'简化日期对照.py'))
