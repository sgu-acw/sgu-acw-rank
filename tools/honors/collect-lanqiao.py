"""Parse software individual award PDFs from the verified 12th–14th final archives.

Usage: uv run --with pypdf python tools/honors/collect-lanqiao.py /tmp data/honors
Archives must be extracted under sgu-lanqiao{edition}-final (including nested software archives).
"""

import hashlib
import json
import re
import sys
from pathlib import Path

from pypdf import PdfReader

cache, output = map(Path, sys.argv[1:])
urls = {
    12: "https://x-static.lanqiao.cn/upload/202110/courseimg/41147d63-c9bb-47d8-ae99-d5776a6c39f8.rar",
    13: "https://x-static.lanqiao.cn/upload/202210/courseimg/8044a2a8-df16-47b3-9055-7639605f65e7.rar",
    14: "https://x-static.lanqiao.cn/upload/202403/courseimg/ff620789-4672-404d-8fac-f3a166af880a.rar",
}
records, manifest = [], []
for edition, url in urls.items():
    root = cache / f"sgu-lanqiao{edition}-final"
    archive = cache / f"sgu-lanqiao{edition}-final.rar"
    manifest.append(
        {
            "edition": edition,
            "url": url,
            "sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
        }
    )
    for pdf in sorted(root.rglob("*.pdf")):
        if "软件" not in str(pdf) or "组织" in pdf.name or "学校" in pdf.name:
            continue
        for page_index, page in enumerate(PdfReader(pdf).pages):
            for line in page.extract_text(extraction_mode="layout").splitlines():
                if "韶关学院" not in line:
                    continue
                match = re.match(
                    r"\s*(\d+)\s+韶关学院\s+(\S+)\s+(.+?)\s+(一等奖|二等奖|三等奖|优秀奖)\s*$",
                    line,
                )
                if not match:
                    raise ValueError((pdf, page_index + 1, line))
                exam, name, category, award = match.groups()
                category = re.sub(r"\s+", "", category)
                records.append(
                    {
                        "source_key": f"official:lanqiao{edition}-final:{exam}",
                        "event": {
                            "key": f"lanqiao{edition}-final-{category}",
                            "title": f"第{edition}届蓝桥杯全国软件和信息技术专业人才大赛全国总决赛",
                            "family": "lanqiao",
                            "occurred_on": f"{edition + 2009}-01-01",
                            "date_precision": "year",
                            "category": category,
                        },
                        "award": award,
                        "team": "",
                        "source_url": url,
                        "evidence": f"官方压缩包内 {pdf.name} 第{page_index + 1}页；比赛日期暂仅精确到年份。身份与在校区间待核实。",
                        "recipients": [name],
                    }
                )
(output / "lanqiao-import.json").write_text(
    json.dumps({"records": records}, ensure_ascii=False, indent=2) + "\n"
)
(output / "lanqiao-manifest.json").write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
)
print(f"{len(records)} individual software award records")
