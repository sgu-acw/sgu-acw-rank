"""Extract workshop algorithm/B awards from the two supplied official archives.

Usage: python tools/honors/collect-lanqiao-2024.py /path/to/cache data/honors
Cache: sgu-lanqiao15-202407.rar, sgu-lanqiao15-202404.rar, their extracted
folders sgu-lanqiao15-final-unar / sgu-lanqiao15-pre-unar, and
sgu-lanqiao15-timetable.pdf. Use unar; 7zz cannot decode this final archive.
"""

import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path

from pypdf import PdfReader

from lanqiao_scope import is_workshop_lanqiao_category

cache, output = map(Path, sys.argv[1:])
output.mkdir(parents=True, exist_ok=True)
date_url = "https://x-static.lanqiao.cn/upload/202403/courseimg/b51b9feb-f45d-492e-9374-3e1d0bb3aab5.pdf"
manifest = {
    "retrieved_on": "2026-11-06", "school": "韶关学院",
    "scope": "C/C++、Java、Python 大学B组算法科目",
    "date_source": {
        "url": date_url, "title": "蓝桥杯组委会字[2024]12号", "page": 1,
        "sha256": hashlib.sha256((cache / "sgu-lanqiao15-timetable.pdf").read_bytes()).hexdigest(),
        "boundary": "仅佐证比赛日期，不佐证本校获奖姓名",
    },
    "archives": [], "excluded_school_rows": [],
}
records = []
for stage, tag, date in [("final", "202407", "2024-06-01"), ("preliminary", "202404", "2024-04-13")]:
    url = ("https://x-static.lanqiao.cn/upload/202407/courseimg/09265083-738d-483f-b885-21dd75c5c424.rar" if stage == "final" else
           "https://x-static.lanqiao.cn/upload/202404/courseimg/2d1afdd4-e563-4394-9875-d52e1a7a3994.rar")
    archive = cache / f"sgu-lanqiao15-{tag}.rar"
    root = cache / ("sgu-lanqiao15-final-unar" if stage == "final" else "sgu-lanqiao15-pre-unar")
    files = (sorted(root.rglob("*大学B组*.pdf")) if stage == "final" else list(root.rglob("*广东*.pdf")))
    assert len(files) == (3 if stage == "final" else 1)
    info = {"url": url, "stage": stage, "sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
            "bytes": archive.stat().st_size, "files": [], "school_rows": 0, "import_count": 0}
    manifest["archives"].append(info)
    for pdf in files:
        reader = PdfReader(pdf)
        header = reader.pages[0].extract_text()
        assert "第十五届" in header
        assert ("全国总决赛" if stage == "final" else "广东赛区") in header
        pdf_info = {"path": str(pdf.relative_to(root)), "pages": len(reader.pages),
                    "sha256": hashlib.sha256(pdf.read_bytes()).hexdigest(), "import_count": 0}
        info["files"].append(pdf_info)
        for page_no, page in enumerate(reader.pages, 1):
            for line in page.extract_text().splitlines():
                if "韶关学院" not in line:
                    continue
                pattern = (r"(\d+)\s+韶关学院\s+(\S+)\s+(.+?)\s+(一等奖|二等奖|三等奖|优秀奖)" if stage == "final" else
                           r"广东\s+(\d+)\s+韶关学院\s+(\S+)\s+(.+?)\s+(一等奖|二等奖|三等奖)(?:\s+是)?")
                match = re.fullmatch(pattern, line.strip())
                assert match, (pdf, page_no, line)
                exam, name, category, award = match.groups()
                category = re.sub(r"\s+", "", category)
                info["school_rows"] += 1
                if not is_workshop_lanqiao_category(category):
                    manifest["excluded_school_rows"].append({
                        "stage": stage, "pdf": pdf_info["path"], "page": page_no,
                        "name": name, "category": category, "award": award,
                        "reason": "非本工作坊大学B组算法赛道",
                    })
                    continue
                subject = {"C/C++程序设计大学B组": "cpp-b", "Java软件开发大学B组": "java-b", "Python程序设计大学B组": "python-b"}[category]
                records.append({
                    "source_key": f"official:lanqiao15-{stage}:{exam}",
                    "event": {"key": f"lanqiao-2024-{stage}-{subject}",
                              "title": "第十五届蓝桥杯全国软件和信息技术专业人才大赛",
                              "family": "lanqiao", "occurred_on": date, "date_precision": "day",
                              "category": ("全国总决赛" if stage == "final" else "广东省赛") + " · " + category},
                    "award": award, "team": "", "source_url": url,
                    "evidence": f"官方获奖压缩包 SHA-256 {info['sha256']}；{pdf_info['path']} 第{page_no}页，准考证号{exam}，原行：{line.strip()}。比赛日按{date_url}第1页核实为{date}。身份及在校时间待核实。",
                    "recipients": [name],
                })
                info["import_count"] += 1
                pdf_info["import_count"] += 1
    assert info["import_count"] == (16 if stage == "final" else 63), info
assert len(records) == 79 and len({r["source_key"] for r in records}) == 79
assert len(manifest["excluded_school_rows"]) == 8
manifest["record_count"] = len(records)
manifest["award_counts"] = dict(Counter((r["award"]) for r in records))
manifest["final_scope_note"] = "国赛仅解析3份算法B组PDF，其余赛道/组别PDF不纳入；Python B组未检出本校，不等于所有组别无获奖。"
(output / "lanqiao-2024-import.json").write_text(json.dumps({"records": records}, ensure_ascii=False, indent=2) + "\n")
(output / "lanqiao-2024-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
for stage in ["preliminary", "final"]:
    rows = [r for r in records if r["event"]["key"].startswith(f"lanqiao-2024-{stage}-")]
    print(stage, len(rows), dict(Counter(r["award"] for r in rows)), dict(Counter(r["event"]["category"] for r in rows)))
