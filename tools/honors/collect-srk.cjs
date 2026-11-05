// Usage: node tools/honors/collect-srk.cjs /path/to/pinned/srk-collection output-directory
// Uses the source checkout's own SRK implementation; never estimates medal percentages.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')
const { createRequire } = require('node:module')
const [input, output] = process.argv.slice(2)
if (!input || !output) throw new Error('Provide SRK checkout and output directory')
const root = path.resolve(input)
const sourceRequire = createRequire(path.join(root, 'package.json'))
const { convertToStaticRanklist, resolveText } = sourceRequire('@algoux/standard-ranklist-utils')
const utilsPackage = JSON.parse(fs.readFileSync(path.resolve(path.dirname(sourceRequire.resolve('@algoux/standard-ranklist-utils')), '../package.json')))
const commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const resolve = v => typeof v === 'string' ? v : resolveText(v, ['zh-CN'])
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(f => f.isDirectory() ? files(path.join(dir, f.name)) : f.name.endsWith('.srk.json') ? [path.join(dir, f.name)] : [])
}
const aliases = require('./srk-event-aliases.json')
const suppressedDuplicates = []
const records = [], candidates = [], sources = [], errors = []
let scanned = 0
const allFiles = files(path.join(root, 'official')).sort()
for (const file of allFiles) {
  scanned++
  const bytes = fs.readFileSync(file)
  const raw = JSON.parse(bytes)
  const matches = raw.rows.filter(r => ['韶关学院', 'Shaoguan University'].includes(resolve(r.user.organization || '').trim()))
  if (!matches.length) continue
  const relative = path.relative(root, file).split(path.sep).join('/')
  const source_url = `https://github.com/algoux/srk-collection/blob/${commit}/${relative}`
  sources.push({ path: relative, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), source_url })
  let converted
  try { converted = convertToStaticRanklist(raw) } catch (error) { errors.push({ path: relative, error: error.message }) }
  const contestId = path.basename(file, '.srk.json')
  const event = { key: contestId, title: resolve(raw.contest.title), family: relative.split('/')[1], occurred_on: raw.contest.startAt?.slice(0, 10) || null, date_precision: 'day', category: '' }
  if (!['icpc', 'ccpc', 'provincial'].includes(event.family)) event.family = 'other'
  for (const row of matches) {
    const calculated = converted?.rows.find(r => r.user.id === row.user.id)
    const members = (row.user.teamMembers || []).filter(p => !p.role || p.role === 'contestant').map(p => resolve(p.name).trim()).filter(Boolean)
    const segments = (calculated?.rankValues || []).flatMap((v, i) => {
      const segment = v.segmentIndex === null ? null : raw.series?.[i]?.segments?.[v.segmentIndex]
      if (!segment) return []
      return [{ index: i, rank: v.rank, style: segment.style, title: resolve(segment.title || ''), series: resolve(raw.series[i].title || '') }]
    })
    const base = { source_key: `srk:${contestId}:${row.user.id}`, event, team: resolve(row.user.name), source_url, recipients: members }
    const reason = !row.user.official ? '非明确正式参赛队伍' : !members.length ? '缺少选手姓名' : !segments.length ? '无奖项或无法确认奖项' : null
    candidates.push({ ...base, official: row.user.official ?? null, segments, reason, score: row.score, raw_members: row.user.teamMembers || [] })
    if (reason) continue
    if (aliases[contestId]) {
      const canonicalFile = allFiles.find(p => path.basename(p, '.srk.json') === aliases[contestId])
      if (!canonicalFile) throw new Error(`Missing canonical event for ${contestId}`)
      const canonical = JSON.parse(fs.readFileSync(canonicalFile))
      const canonicalRow = convertToStaticRanklist(canonical).rows.find(r => r.user.id === row.user.id)
      const canonicalMembers = (canonicalRow?.user.teamMembers || []).filter(p => !p.role || p.role === 'contestant').map(p => resolve(p.name).trim()).filter(Boolean)
      const canonicalSegments = (canonicalRow?.rankValues || []).flatMap((v, i) => {
        const segment = v.segmentIndex === null ? null : canonical.series?.[i]?.segments?.[v.segmentIndex]
        return segment ? [resolve(segment.title || '')] : []
      })
      if (canonical.contest.startAt !== raw.contest.startAt ||
          JSON.stringify([...canonicalMembers].sort()) !== JSON.stringify([...members].sort()) ||
          JSON.stringify(canonicalSegments) !== JSON.stringify(segments.map(s => s.title))) {
        throw new Error(`Alias evidence changed for ${contestId}:${row.user.id}; review before suppressing`)
      }
      suppressedDuplicates.push({ source_key: base.source_key, canonical_event: aliases[contestId] })
      continue
    }
    for (const segment of segments) {
      const award = ({ gold: '金奖', silver: '银奖', bronze: '铜奖' })[segment.style] || segment.title
      if (!award) continue
      records.push({ ...base, source_key: `${base.source_key}:series-${segment.index}`, event: { ...event, category: segment.series }, award, evidence: `SRK ${raw.version}；series[${segment.index}]，rank=${segment.rank}，segment=${segment.title}。按上游标准库 ${utilsPackage.version} 解析；待核实身份和在校时间。` })
    }
  }
}
fs.mkdirSync(output, { recursive: true })
function write(name, value) { fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n') }
write('srk-import.json', { records })
write('srk-candidates.json', candidates)
write('srk-manifest.json', { repository: 'https://github.com/algoux/srk-collection', commit, scanned, matched_files: sources.length, candidates: candidates.length, import_records: records.length, sources, suppressed_duplicates: suppressedDuplicates, errors })
console.log(JSON.stringify({ scanned, matched_files: sources.length, candidates: candidates.length, import_records: records.length, errors }))
