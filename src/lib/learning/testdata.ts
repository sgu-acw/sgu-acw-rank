import type { TestCase } from './types'

/** 判题时输入/输出文件常见命名：洛谷、casetool/FPS、以及手动导出的 .txt。 */
const INPUT = /\.(in|inp|input)$/i
const OUTPUT = /\.(out|ans|output|exp|answer)$/i

export interface UploadFile { name: string; text: string }

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/**
 * 直接读 ZIP 中央目录，只依赖浏览器自带的 DecompressionStream。
 * 洛谷和 casetool 导出的测试数据都是 zip，省得让管理员先解压。
 */
export async function readZip(buffer: ArrayBuffer): Promise<UploadFile[]> {
  const view = new DataView(buffer), bytes = new Uint8Array(buffer), decoder = new TextDecoder()
  let end = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65558); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break }
  }
  if (end < 0) throw new Error('不是有效的 ZIP 文件')
  const count = view.getUint16(end + 10, true)
  let offset = view.getUint32(end + 16, true)
  const files: UploadFile[] = []
  for (let i = 0; i < count; i++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) break
    const method = view.getUint16(offset + 10, true)
    const compressed = view.getUint32(offset + 20, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const local = view.getUint32(offset + 42, true)
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength))
    offset += 46 + nameLength + extraLength + commentLength
    if (name.endsWith('/')) continue
    if (local + 30 > bytes.length) continue
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
    const raw = bytes.subarray(start, start + compressed)
    if (method === 0) files.push({ name, text: decoder.decode(raw) })
    else if (method === 8) files.push({ name, text: decoder.decode(await inflateRaw(raw)) })
  }
  return files
}

const natural = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

/** 按同名配对 .in/.out，覆盖洛谷（1.in/1.out）和 casetool（1.in/1.ans）。 */
export function pairTests(files: UploadFile[]): { tests: Omit<TestCase, 'sample'>[]; skipped: string[] } {
  const groups = new Map<string, { input?: string; output?: string; inputName?: string; outputName?: string }>()
  const skipped: string[] = []
  for (const file of files) {
    const base = file.name.split('/').pop() ?? file.name
    const match = base.match(/^(.*?)(\.in|\.inp|\.input|\.out|\.ans|\.output|\.exp|\.answer)$/i)
    if (!match) { skipped.push(base); continue }
    const key = match[1].toLowerCase()
    const group = groups.get(key) ?? {}
    if (INPUT.test(match[2])) { group.input = file.text; group.inputName = base }
    else if (OUTPUT.test(match[2])) { group.output = file.text; group.outputName = base }
    groups.set(key, group)
  }
  for (const g of groups.values()) {
    if (g.input === undefined && g.outputName) skipped.push(g.outputName)
    if (g.output === undefined && g.inputName) skipped.push(g.inputName)
  }
  const tests = [...groups.entries()]
    .filter(([, g]) => g.input !== undefined && g.output !== undefined)
    .sort(([a], [b]) => natural(a, b))
    .map(([, g], index) => ({ name: `测试点 ${index + 1}`, input: g.input!, output: g.output! }))
  return { tests, skipped }
}
