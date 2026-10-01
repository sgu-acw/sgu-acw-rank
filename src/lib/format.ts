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
