import { HONOR_FAMILIES, type HonorEvent } from './honors'

export type MedalKind = 'gold' | 'silver' | 'bronze' | 'honorable'
export function medalKind(award: string): MedalKind {
  if (/金|一等奖|gold/i.test(award)) return 'gold'
  if (/银|二等奖|silver/i.test(award)) return 'silver'
  if (/铜|三等奖|bronze/i.test(award)) return 'bronze'
  return 'honorable'
}
export function honorCategory(category: string): string {
  return category.replace(/#/g, '').trim()
}
export function contestHeading(event: HonorEvent): string {
  const title = event.title
  const edition = title.match(/第\s*([\d一二三四五六七八九十百]+)\s*届/)?.[1]
  const round = edition ? `第${edition}届` : ''
  if (event.family === 'lanqiao') return ['蓝桥杯', round].filter(Boolean).join(' · ')
  if (event.family === 'matibei') return ['码蹄杯', round].filter(Boolean).join(' · ')
  if (event.family === 'astar') return ['百度之星', round].filter(Boolean).join(' · ')
  if (event.family === 'gplt') return ['天梯赛', round].filter(Boolean).join(' · ')
  if (event.family === 'icpc' || event.family === 'ccpc') {
    const brand = HONOR_FAMILIES[event.family]
    const site = title.match(/(?:区域赛|区域|邀请赛)\s*([\u4e00-\u9fff]{2,5})站/)?.[1]
      || title.match(/竞赛\s+([\u4e00-\u9fff]{2,5})站/)?.[1]
    if (site) return `${brand} ${site}站`
    const invitational = title.match(/邀请赛[（(]([\u4e00-\u9fff]{2,5})[)）]/)?.[1]
      || title.match(/CCPC([\u4e00-\u9fff]{2,4})邀请赛/i)?.[1]
    if (invitational) return `${brand} ${invitational}邀请赛`
  }
  if (event.family === 'provincial') {
    const provincial = title.match(/(?:广东|广西|福建|江西|河南|浙江|山东|湖南|湖北|四川|江苏|安徽)(?:省)?大学生程序设计(?:竞赛|大赛)/)?.[0]
    if (provincial) return provincial
  }
  return title.replace(/\s*[-－—]\s*正式赛\s*$/, '').trim()
}
export function contestMeta(event: HonorEvent): string {
  const category = honorCategory(event.category)
  const bits = [HONOR_FAMILIES[event.family], category]
  if (event.family === 'lanqiao' && /全国总?决赛/.test(event.title) && !category.includes('决赛')) {
    bits.push('全国总决赛')
  }
  return [...new Set(bits.filter((part) => part && !contestHeading(event).includes(part)))].join(' · ')
}
