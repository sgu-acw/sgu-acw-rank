import json
import re
import sys
from pathlib import Path

from pypdf import PdfReader

root = Path(sys.argv[1])
manifest = {
    s["key"]: s for s in json.loads((root / "official-pdf-manifest.json").read_text())
}
records = []
for key in [
    "matibei-2026-pre1",
    "matibei-2026-pre2",
    "matibei-2026-pre3",
    "matibei-2026-final",
]:
    award = category = None
    for i, page in enumerate(PdfReader(root / "sources" / (key + ".pdf")).pages):
        for line in page.extract_text().splitlines():
            line = line.strip()
            if re.match(r"（[一二三四五六]）", line):
                category = line
            if line in ["金奖", "银奖", "铜奖", "优秀奖"]:
                award = line
            if "韶关学院" not in line:
                continue
            m = re.match(r"(\d+)\s+(\S+)\s+韶关学院", line)
            if not m or not award or not category:
                raise ValueError((key, i, line, category, award))
            rank, name = m.groups()
            stage = "全国决赛" if "final" in key else "省赛第" + key[-1] + "场"
            day = "2026-08-02" if "final" in key else {"1": "2026-03-22", "2": "2026-04-26", "3": "2026-05-24"}[key[-1]]
            records.append(
                {
                    "source_key": f"official:{key}:{category}:{award}:{rank}",
                    "event": {
                        "key": key + "-undergraduate",
                        "title": "2026年第八届码蹄杯全国大学生程序设计大赛",
                        "family": "matibei",
                        "occurred_on": day,
                        "date_precision": "day",
                        "category": stage + " · 本科院校赛道",
                    },
                    "award": award,
                    "team": "",
                    "source_url": manifest[key]["url"],
                    "evidence": f"官方公示PDF第{i + 1}页，{category}，{award}第{rank}行。"
                    + ("决赛日期按用户补充：2026-08-02。" if "final" in key else "")
                    + "身份与在校时间待核实。",
                    "recipients": [name],
                }
            )
(root / "matibei-import.json").write_text(
    json.dumps({"records": records}, ensure_ascii=False, indent=2) + "\n"
)
print("records", len(records))
print([(r["source_key"], r["recipients"]) for r in records])
