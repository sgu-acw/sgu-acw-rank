/**
 * 题单批量导入解析器。
 *
 * 支持按行粘贴题号或题目链接：
 * - 纯题号（使用默认平台）：`1900C`、`P1001`、`abc350_a`
 * - 平台前缀：`cf 1900C`、`atcoder abc350_a`、`luogu P1001`、`nowcoder 1001`、`learn 12`
 * - 完整 URL：Codeforces / AtCoder / 洛谷 / 牛客 / 站内题库
 * - 可选备注：行尾用 `# 备注内容` 分隔
 */
import type { Platform } from './api'

export type BatchPlatform = Platform | 'learn'

export interface ParsedBatchItem {
  platform: BatchPlatform
  key: string
  note?: string
}

const PREFIX_MAP: Record<string, BatchPlatform> = {
  cf: 'codeforces',
  codeforces: 'codeforces',
  at: 'atcoder',
  atc: 'atcoder',
  atcoder: 'atcoder',
  lg: 'luogu',
  luogu: 'luogu',
  洛谷: 'luogu',
  nc: 'nowcoder',
  nowcoder: 'nowcoder',
  牛客: 'nowcoder',
  learn: 'learn',
  题库: 'learn',
}

function parseUrl(raw: string): { platform: BatchPlatform; key: string } | null {
  const cfProblemset = raw.match(/codeforces\.com\/problemset\/problem\/(\d+)\/([A-Za-z0-9]+)/i)
  if (cfProblemset) return { platform: 'codeforces', key: `${cfProblemset[1]}${cfProblemset[2].toUpperCase()}` }

  const cfContest = raw.match(/codeforces\.com\/(?:contest|gym)\/(\d+)\/problem\/([A-Za-z0-9]+)/i)
  if (cfContest) return { platform: 'codeforces', key: `${cfContest[1]}${cfContest[2].toUpperCase()}` }

  const atc = raw.match(/atcoder\.jp\/contests\/[^/]+\/tasks\/([A-Za-z0-9_]+)/i)
  if (atc) return { platform: 'atcoder', key: atc[1] }

  const luogu = raw.match(/luogu\.com\.cn\/problem\/([A-Za-z0-9_]+)/i)
  if (luogu) return { platform: 'luogu', key: luogu[1] }

  const nowcoder = raw.match(/ac\.nowcoder\.com\/acm\/problem\/(\d+)/i)
  if (nowcoder) return { platform: 'nowcoder', key: nowcoder[1] }

  const learn = raw.match(/\/learn\/problem\?(?:[^#]*&)?id=(\d+)/i)
  if (learn) return { platform: 'learn', key: learn[1] }

  return null
}

export function parseBatchProblems(
  text: string,
  defaultPlatform: BatchPlatform = 'codeforces',
): ParsedBatchItem[] {
  const out: ParsedBatchItem[] = []
  for (const rawLine of text.split(/\r?\n/)) {
    const trimmed = rawLine.trim()
    if (!trimmed) continue

    let main = trimmed
    let note: string | undefined
    const hashIdx = trimmed.indexOf(' #')
    if (hashIdx > 0) {
      main = trimmed.slice(0, hashIdx).trim()
      note = trimmed.slice(hashIdx + 2).trim() || undefined
    }

    const fromUrl = parseUrl(main)
    if (fromUrl) {
      out.push({ ...fromUrl, ...(note ? { note } : {}) })
      continue
    }

    const parts = main.split(/[\s,，]+/).filter(Boolean)
    if (!parts.length) continue

    const firstLower = parts[0].toLowerCase()
    const mapped = PREFIX_MAP[firstLower] ?? PREFIX_MAP[parts[0]]
    if (mapped && parts.length >= 2) {
      const restNote = parts.length > 2 && !note ? parts.slice(2).join(' ') : note
      out.push({
        platform: mapped,
        key: parts[1],
        ...(restNote ? { note: restNote } : {}),
      })
    } else {
      const restNote = parts.length > 1 && !note ? parts.slice(1).join(' ') : note
      out.push({
        platform: defaultPlatform,
        key: parts[0],
        ...(restNote ? { note: restNote } : {}),
      })
    }
  }
  return out
}
