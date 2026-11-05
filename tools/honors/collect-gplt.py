"""Collect SGU team score details via the public website's observed endpoints.

Usage: python tools/honors/collect-gplt.py data/honors
This preserves score evidence and official anchor scores, without guessing award titles.
"""

import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path

competition = "2041434074606342144"  # /api/cached/contest, checked 2026-11-06
output = Path(sys.argv[1])
base = f"https://pintia.cn/api/competitions/{competition}"
sources, rows = [], []


def fetch(url):
    # One bounded read per second. An HTTP error (including 429) stops the run.
    raw = subprocess.check_output(
        [
            "curl",
            "-fLsS",
            "--max-time",
            "25",
            "-H",
            "Accept: application/json",
            url,
        ]
    )
    sources.append({"url": url, "sha256": hashlib.sha256(raw).hexdigest()})
    time.sleep(1)
    return json.loads(raw)


cutoffs = fetch(base + "/gplt-anchor-scores")
url = (
    base
    + "/gplt-team-rankings?filter=%7B%22groupFid%22%3A%222%22%2C%22provinceCode%22%3A%22GUANG_DONG%22%7D"
)
teams = fetch(url)
sgu = {fid for fid, s in teams["schoolByFid"].items() if s["name"] == "韶关学院"}
for fid, team in teams["teamByFid"].items():
    if team["schoolFid"] not in sgu:
        continue
    url = base + f"/gplt-team-ranking-scores?team_fid={fid}"
    detail = fetch(url)
    if detail["schoolName"] != "韶关学院":
        raise ValueError("School mismatch")
    for person in detail["personScoreItems"]:
        rows.append(
            {
                "name": person["name"],
                "person_fid": person["personFid"],
                "team": detail["teamName"],
                "score": person["totalStrictScore"],
                "excluded": person["excluded"] or team["excluded"],
                "source_url": url,
                "award": None,
                "reason": "已取得官方成绩，待对照正式奖项口径",
            }
        )
if len(rows) != 30:
    raise ValueError(f"Expected the three SGU teams (30 people), found {len(rows)}")
(output / "gplt-candidates.json").write_text(
    json.dumps(
        {
            "competition": competition,
            "date": "2026-04-18",
            "official_anchor_scores": cutoffs,
            "sources": sources,
            "rows": rows,
        },
        ensure_ascii=False,
        indent=2,
    )
    + "\n"
)
print(f"{len(rows)} SGU score rows; award titles pending verification")
