/**
 * 展示用的格式化函数。
 *
 * 放在一处而不是散在各个组件里：同一个字段在三四个地方显示，规则改一次
 * 却要改三四遍，很容易漏掉其中一处。
 */

/**
 * 年级。root 账号的入学年份是 0（它不是真实学生），这种情况返回空串，
 * 让调用方决定显示什么，而不是把「0 级」摆到页面上。
 */
export function formatEnrollYear(year: number | null | undefined): string {
  if (!year || year <= 0) return ''
  return `${year} 级`
}

/**
 * 大数字缩写。用于「多少人做过」这类统计。
 *
 * 一万以上写「1.2 万」，一亿以上写「1.2 亿」。CF 的过题人数常见几万，
 * 原样显示「123456 人做过」太长，占掉卡片一行。
 */
export function formatCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return ''
  const abs = Math.abs(value)
  if (abs >= 100_000_000) return `${trim(value / 100_000_000)}亿`
  if (abs >= 10_000) return `${trim(value / 10_000)}万`
  return String(value)
}

/** 保留一位小数，整数就不显示小数点。 */
function trim(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}
