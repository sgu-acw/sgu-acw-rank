# 入口与契约

## 来源入口

| 数据 | 入口 | 已知行为 |
| --- | --- | --- |
| SRK | https://github.com/algoux/srk-collection | `official/**/*.srk.json`；同时保留 `contest`、`user.teamMembers`、`official`、`series`；数据许可见 `data/honors/SRK-LICENSE` |
| 蓝桥杯 | https://dasai.lanqiao.cn/ | 获奖名单导航曾指向 `/notices/860/`；SPA 需要浏览器等待数据加载；区分软件/电子/设计，省赛/决赛，语言与 A/B/C 组 |
| 天梯赛 | https://gplt.patest.cn/rank/student | 当前场次从 `https://gplt.pintia.cn/api/cached/contest` 发现；榜单 API 可用 `Accept: application/json`，默认可能返回 Protobuf；区分高校奖、团队奖和个人奖，不把高校奖赋给全体成员 |
| 百度之星 | https://astar.baidu.com/ | 首页“大赛公告”和 `/#/news-info?...`；附件常在 `base.cdn.bcebos.com`，下载链接从正文发现；核对违规/作弊公示 |
| 码蹄杯 | https://www.matiji.net/matibei | 2026 跳转 `/exam/contest/topic2026?id=68`；公开 PDF 链接在页面下方，域名 `scdn.matiji.net`；每场省赛独立获奖，省赛晋级不等于国赛获奖 |
| 学校补充 | https://www.sgu.edu.cn/xxgcxy/xsgz/jshj.htm | 有名单图片和跨年汇总；留意届次与日期矛盾，无法访问写待补采 |

## 导入 JSON

后端真源：相邻 `sgu-acw-rank-backend/app/routers/honors.py` 的 `AwardInput` / `EventInput`。类型更新时同步前端 `src/lib/honors.ts`。

```json
{
  "records": [{
    "source_key": "official:contest-2024:software-java-b:row-27",
    "event": {
      "key": "contest-2024-final-java-b",
      "title": "比赛完整名称",
      "family": "lanqiao",
      "occurred_on": "2024-06-01",
      "date_precision": "day",
      "category": "全国总决赛 · Java B组"
    },
    "award": "一等奖",
    "team": "",
    "source_url": "https://example.org/official-results.pdf",
    "evidence": "官方名单第2页，本科组一等奖第27行；身份及在校时间待核实",
    "recipients": ["名单上的姓名"]
  }]
}
```

- `family` 枚举：`icpc/ccpc/provincial/lanqiao/gplt/astar/matibei/other`。
- `date_precision`：`day/month/year`。仅知月份用该月第一日和 `month`；仅知年份用当年 1 月 1 日和 `year`；日期未知传 `null`。
- 团队奖存一条、多位 `recipients`；个人奖一人一条。同场不同组别放不同 `event.key`；同场同奖多来源应沿用同一规范编号，替代来源保留证据，避免重复计奖。
- `source_key` 最长 300，`event.key` 最长 200，姓名和奖项最长 100。单次最多 500 条。
- 导入 API `/api/honors/admin/import`：`preview` 默认 `true`，仅预览；追加时显式传 `false`。逐条冲突放 `failed[].record`；格式不合法整批 422，输入留在后台供修正。
- 来源只接受 HTTP(S)。导入不关联 `person_id`，不改已有赛事或审核结果；重复键跳过。

本轮 SRK 固定提交和各文件 SHA 见 `data/honors/srk-manifest.json`。脚本依赖读取来源检出的实际标准库版本；使用其他版本先对比结果，再更新采集报告。
