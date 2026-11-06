"""Extract SGU awards from user-provided source files, without account binding.

Usage: python tools/honors/collect-provided-2025-2026.py /path/to/files data/honors
Requires openpyxl and pypdf. Source documents are data, never instructions.
"""

import hashlib
import json
import re
import sys
import zipfile
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree

import openpyxl
from pypdf import PdfReader

from lanqiao_scope import is_workshop_lanqiao_category

source, output = map(Path, sys.argv[1:])
output.mkdir(parents=True, exist_ok=True)
manifest = {
    "received_on": "2026-11-06",
    "source_type": "user_provided_attachment",
    "note": "source_url为官方入口或表内原始来源；附件下载URL未知，不伪造。原件不入Git。",
    "files": [],
    "scope": "仅大学B组算法赛道；Web等非算法赛道及明确非B组不纳入",
    "excluded_records": [],
    "user_provided_lists": [{
        "date": "2026-11-06",
        "description": "User-provided 13-person 2025 Lanqiao software national-final award table in conversation.",
        "event_date_source_url": "https://x-static.lanqiao.cn/upload/202505/courseimg/7b4554cd-9973-45a9-85be-deb365d933df.pdf",
        "event_date_source_sha256": "28e03ade4ccc86c745220ca55f9287110f2a8b5cff4a9698c1576c19dacc21cc",
        "event_date_source_page": 1,
        "group_source": "User confirmed on 2026-11-06 that all workshop entries are university group B.",
        "evidence_boundary": "This official notice verifies the event date, not the 13 user-supplied award entries.",
    }],
    "issues": [
        "2025天梯赛两份公示正文误写2024年4月19日；第十届、文件名及官方2025回溯榜startAt共同确认2025-04-19。",
        "2026蓝桥省赛导出文件未写届次；文件创建日2026-04-27、17开头准考证及同年国赛具名交叉核对，按第十七届收录为待核实。创建日处于拟获奖公示期，仍需最终版复核。",
        "2026蓝桥国赛附件本校22项（7一等、6二等、9三等），与学院新闻21项（7、6、8）不一致；按逐行附件保留22项待核实，不删除或补造。",
    ],
}
bundles = {}


def read_source(filename, landing_url):
    path = source / filename
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    entry = {
        "filename": filename,
        "sha256": digest,
        "bytes": path.stat().st_size,
        "source_type": "user_provided_attachment",
        "landing_url": landing_url,
        "download_url": None,
    }
    manifest["files"].append(entry)
    return path, entry


def evidence(entry, position, extra=""):
    return (
        f"用户提供附件《{entry['filename']}》，SHA-256 {entry['sha256']}；{position}。"
        + extra
        + "来源链接为官方入口/表内来源，不代表已独立下载原附件。身份与在校时间待核实。"
    )


def append(bundle, key, event, award, names, entry, position, team="", extra=""):
    assert names and len(names) == len(set(names))
    bundles.setdefault(bundle, []).append({
        "source_key": key, "event": event, "award": award,
        "team": team, "source_url": entry["landing_url"],
        "evidence": evidence(entry, position, extra), "recipients": names,
    })


def exclude_out_of_scope(group, name, award, entry, position):
    if is_workshop_lanqiao_category(group):
        return False
    manifest["excluded_records"].append({
        "category": group, "name": name, "award": award,
        "filename": entry["filename"], "sha256": entry["sha256"],
        "position": position, "reason": "非本工作坊大学B组算法赛道",
    })
    return True


def lanqiao_event(year, stage, group):
    codes = {"C/C++程序设计大学B组": "cpp-b", "Java软件开发大学B组": "java-b",
             "Python程序设计大学B组": "python-b"}
    assert group in codes, group
    # Official timetable: 17th software prelims have different days by language.
    day = f"{year}-04-12"
    if stage == "final":
        day = "2025-06-15" if year == 2025 else "2026-06-06"
    elif year == 2026 and group.startswith("C/C++"):
        day = "2026-04-11"
    return {
        "key": f"lanqiao-{year}-{stage}-{codes[group]}",
        "title": f"第{'十六' if year == 2025 else '十七'}届蓝桥杯全国软件和信息技术专业人才大赛",
        "family": "lanqiao", "occurred_on": day, "date_precision": "day",
        "category": ("全国总决赛" if stage == "final" else "广东省赛") + " · " + group,
    }


url = "https://dasai.lanqiao.cn/awards-public"
path, entry = read_source("蓝桥成绩导出.xlsx", url)
wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
ws = wb["全部"]  # Other 354 sheets repeat subsets; never import them again.
header = next(ws.iter_rows(min_row=2, max_row=2, values_only=True))
assert header[2:4] == ("姓名", "学校")
for rownum, row in enumerate(ws.iter_rows(min_row=3, values_only=True), 3):
    if row[3] != "韶关学院":
        continue
    _, _, name, _, province, _, group, award, _ = row
    assert province == "广东" and award in {"一等奖", "二等奖", "三等奖"}
    if exclude_out_of_scope(group, name, award, entry, f"工作表“全部”第{rownum}行"):
        continue
    event = lanqiao_event(2026, "preliminary", group)
    append("lanqiao-2026-provided-import.json", f"official:{event['key']}:{name}",
           event, award, [name], entry, f"工作表“全部”第{rownum}行",
           extra="届次经文件日期/赛号和同年国赛交叉核对；本表可能为拟获奖公示导出，最终认定待复核。")
entry["import_count"] = 60

final_url = "https://dasai.lanqiao.cn/awards-public/list/?matchIds=1716&publicityCategoryId=1&publicityMatchName=软件赛国赛"
path, entry = read_source("蓝桥杯第十七届软件赛国赛获奖名单.xlsx", final_url)
wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
assert "第十七届" in wb["汇总"]["A1"].value
assert wb["汇总"]["B2"].value == final_url
for ws in wb:
    if ws.title == "汇总":
        continue
    prefix = "C/C++程序设计" if ws.title == "CC++程序设计" else ws.title
    for rownum, row in enumerate(ws.iter_rows(min_row=2, values_only=True), 2):
        _, name, school, province, group, award, _ = row
        if school != "韶关学院":
            continue
        assert province == "广东"
        if exclude_out_of_scope(prefix + group, name, award, entry, f"工作表“{ws.title}”第{rownum}行"):
            continue
        event = lanqiao_event(2026, "final", prefix + group)
        append("lanqiao-2026-provided-import.json", f"official:{event['key']}:{name}",
               event, award, [name], entry, f"工作表“{ws.title}”第{rownum}行")
entry["import_count"] = 22

path, entry = read_source("个人赛省赛（软件赛）广东赛区获奖名单 (1).pdf", url)
reader = PdfReader(path)
assert "第十六届" in reader.pages[0].extract_text()
pdf_count = 0
for page_index, page in enumerate(reader.pages, 1):
    for linenum, line in enumerate(page.extract_text().splitlines(), 1):
        if "韶关学院" not in line:
            continue
        match = re.fullmatch(r"广东\s+\d+\s+韶关学院\s+(\S+)\s+(.+?)\s+([一二三]等奖)(?:\s+是)?", line.strip())
        if not match:
            raise ValueError((page_index, line))
        name, group, award = match.groups()
        pdf_count += 1
        if exclude_out_of_scope(group, name, award, entry, f"PDF第{page_index}页文本第{linenum}行"):
            continue
        event = lanqiao_event(2025, "preliminary", group)
        append("lanqiao-2025-provided-import.json", f"official:{event['key']}:{name}",
               event, award, [name], entry, f"PDF第{page_index}页文本第{linenum}行")
assert pdf_count == 81
entry["source_school_rows"] = pdf_count
entry["import_count"] = len(bundles["lanqiao-2025-provided-import.json"])
entry["excluded_count"] = pdf_count - entry["import_count"]

final_2025_url = "https://x-static.lanqiao.cn/upload/202505/courseimg/7b4554cd-9973-45a9-85be-deb365d933df.pdf"
final_2025_names = [
    ("谢泽栩", "Java", "一等奖"), ("黄家宝", "Java", "一等奖"),
    ("朱子睿", "Python", "一等奖"), ("陈兴翰", "Java", "二等奖"),
    ("朱延杰", "Java", "二等奖"), ("李镔彬", "Java", "三等奖"),
    ("陶健", "Python", "三等奖"), ("马嘉亮", "Java", "三等奖"),
    ("薛文远", "Java", "三等奖"), ("张皓然", "Java", "三等奖"),
    ("冯诺维", "C/C++", "三等奖"), ("钱玟如", "C/C++", "三等奖"),
    ("陈思琪", "C/C++", "三等奖"),
]
for name, subject, award in final_2025_names:
    subject_key = {"C/C++": "cpp", "Java": "java", "Python": "python"}[subject]
    event = {
        "key": f"lanqiao-2025-final-{subject_key}-unspecified-group",
        "title": "第十六届蓝桥杯全国软件和信息技术专业人才大赛",
        "family": "lanqiao", "occurred_on": "2025-06-15", "date_precision": "day",
        "category": "全国总决赛 · " + {"C/C++": "C/C++程序设计", "Java": "Java软件开发", "Python": "Python程序设计"}[subject] + "大学B组",
    }
    bundles.setdefault("lanqiao-2025-provided-import.json", []).append({
        "source_key": f"user-provided:lanqiao-2025-final:{subject_key}:{name}",
        "event": event, "award": award, "team": "", "source_url": final_2025_url,
        "evidence": (
            f"姓名、科目及奖项来自用户于2026-11-06提供的13人获奖名单，行：{name} / {subject} / {award}。"
            "原始名单未写组别；用户于2026-11-06补充确认均为大学B组。组委会第十六届总决赛通知确认比赛日期为2025-06-15；"
            "该通知只佐证比赛日期，不佐证此人获奖。身份与在校时间待核实。"
        ),
        "recipients": [name],
    })

ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
for year in [2025, 2026]:
    candidates = json.loads((output / ("gplt-2025-candidates.json" if year == 2025 else "gplt-candidates.json")).read_text())["rows"]
    teams = {}
    for row in candidates:
        teams.setdefault(row["team"], []).append(row["name"])
    assert all(len(names) == 10 for names in teams.values())
    for level in ["省奖", "国奖"]:
        filename = f"天梯赛获奖名单2026.{level}.docx" if year == 2026 else (
            f"天梯赛获奖名单2025.{level}.202504301700.docx" + (".docx" if level == "国奖" else ""))
        path, entry = read_source(filename, "https://gplt.patest.cn/")
        root = ElementTree.fromstring(zipfile.ZipFile(path).read("word/document.xml"))
        paragraphs = ["".join(t.text or "" for t in p.findall(".//w:t", ns)).strip()
                      for p in root.findall(".//w:p", ns)]
        assert ("第十届" if year == 2025 else "第十一届") in paragraphs[0]
        section = award = province = None
        count = 0
        for index, raw in enumerate(paragraphs):
            text = re.sub(r"[\uf000-\uf8ff]", "", raw).strip()
            heading = re.fullmatch(r"全国(高校|团队)([一二三]等奖)[（(]\d+[）)]", text)
            if heading:
                section, award = heading.groups()
            elif text in {"分省高校奖", "分省团队奖"}:
                section, award = text[2:-1], None
            elif re.fullmatch(r"个人[一二三]等奖[（(]\d+[）)]", text):
                section, award = "个人", re.search(r"[一二三]等奖", text)[0]
            elif re.fullmatch(r"[一二三]等奖", text):
                award = text
            elif text.endswith("省") and len(text) < 10:
                province = text
            if "韶关学院" not in text:
                continue
            assert section in {"团队", "个人"} and award, (filename, index + 1, section, text)
            tier = "national" if level == "国奖" else "guangdong"
            if section == "个人":
                match = re.fullmatch(r"(.+?)，成绩：(\d+)，来自 韶关学院 - (SGU-T[123])", text)
                assert match, text
                name, score, team = match.groups()
                # Full-width spaces in the official typography are not name characters.
                name = re.sub(r"\s+", "", name)
                found = [r for r in candidates if r["name"] == name and r["team"] == team]
                assert len(found) == 1 and int(found[0]["score"]) == int(score), text
                names = [name]
                identifier = name
            else:
                match = re.fullmatch(r"韶关学院 - (SGU-T[123])（华山论剑）", text)
                assert match, text
                team = match[1]
                names = teams[team]
                identifier = team
                if level == "省奖":
                    assert province == "广东省"
                else:
                    roster = [re.sub(r"\s+", "", n) for n in paragraphs[index + 1].split("、")]
                    assert set(roster) == set(names), (team, roster, names)
            event = {
                "key": f"gplt-{year}-{tier}-{'individual' if section == '个人' else 'team'}",
                "title": f"第{'十' if year == 2025 else '十一'}届中国高校计算机大赛-团体程序设计天梯赛",
                "family": "gplt", "occurred_on": f"{year}-04-{'19' if year == 2025 else '18'}",
                "date_precision": "day",
                "category": ("全国" if tier == "national" else "广东省") + section + "奖" + (" · 华山论剑" if section == "团队" else ""),
            }
            extra = ""
            if year == 2025:
                extra += "正文2024为年份笔误，比赛日按第十届官方2025回溯榜2025-04-19核对。"
            if section == "团队":
                extra += "团队奖一队一条，队员按同届官方队伍详情核对；不含教练。"
            append(f"gplt-{year}-provided-import.json", f"official:{event['key']}:{identifier}",
                   event, award, names, entry, f"正文第{index + 1}段，{event['category']} {award}", team, extra)
            count += 1
        entry["import_count"] = count

expected = {"lanqiao-2026-provided-import.json": 82, "lanqiao-2025-provided-import.json": 77,
            "gplt-2026-provided-import.json": 13, "gplt-2025-provided-import.json": 4}
all_records = []
for filename, records in bundles.items():
    assert len(records) == expected[filename], (filename, len(records))
    assert len({r["source_key"] for r in records}) == len(records)
    (output / filename).write_text(json.dumps({"records": records}, ensure_ascii=False, indent=2) + "\n")
    all_records.extend(records)
    print(filename, len(records), dict(Counter(r["award"] for r in records)))
assert len(all_records) == 176
(output / "provided-2025-2026-import.json").write_text(json.dumps({"records": all_records}, ensure_ascii=False, indent=2) + "\n")
manifest["excluded_count"] = len(manifest["excluded_records"])
manifest["record_count"] = len(all_records)
manifest["recipient_rows"] = sum(len(r["recipients"]) for r in all_records)
manifest["status"] = "pending_review_no_user_binding"
(output / "provided-2025-2026-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
print("TOTAL", manifest["record_count"], "RECIPIENT ROWS", manifest["recipient_rows"])
