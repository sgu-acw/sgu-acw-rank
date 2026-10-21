export type Environment = 'c' | 'cpp' | 'python' | 'java8' | 'java21'
export type RuntimeId = 'c-cpp' | 'python' | 'java8' | 'java21'
export type Verdict = 'AC' | 'WA' | 'CE' | 'RE' | 'TLE' | 'OLE' | 'CANCELLED' | 'ENVIRONMENT_ERROR'
export const environments: { id: Environment; label: string; runtime: RuntimeId }[] = [
  { id: 'c', label: 'C11', runtime: 'c-cpp' }, { id: 'cpp', label: 'C++17', runtime: 'c-cpp' },
  { id: 'python', label: 'Python', runtime: 'python' }, { id: 'java8', label: 'Java 8', runtime: 'java8' },
  { id: 'java21', label: 'Java 21', runtime: 'java21' },
]
export type Difficulty = '入门' | '基础' | '进阶'
export const difficulties: Difficulty[] = ['入门', '基础', '进阶']
export interface TestCase { name: string; input: string; output: string; sample: boolean }
export interface ProblemContent {
  title: string; chapter: string; difficulty: Difficulty; tags: string[]; statement: string; environments: Environment[]
  /** 可选：输入/输出格式说明，留空则不显示。 */
  input_format?: string; output_format?: string
  /** 可选：说明/提示（样例解释、注意事项）。 */
  note?: string
  checker: 'exact' | 'tokens' | 'spj'; time_ms: number; tests: TestCase[]
  /** checker=spj 时的 Python 判定程序（读 /input /expected /actual，退出码定胜负）。 */
  checker_source?: string
}
export interface Problem { id: number; version_id: string; revision: number; content: ProblemContent }
export interface ProblemSummary { id: number; version_id: string; revision: number; title: string; chapter: string; difficulty: Difficulty; tags: string[]; environments: Environment[] }
export interface Draft { id: number; revision: number; published_revision: number | null; content: ProblemContent }
export interface RuntimeAsset { path: string; bytes: number; transferBytes: number; sha256: string; type: string }
export interface Runtime {
  id: RuntimeId; label: string; version: string; available: boolean; reason?: string
  assets: RuntimeAsset[]; provenance: string
}
export type LspId = 'clangd' | 'pyright'
/** 可选语言服务：clangd 给 C/C++，pyright 给 Python。按需下载，不绑在主评测包里。 */
export interface LspService { runtime: RuntimeId; assets: RuntimeAsset[] }
export interface Manifest { schema: 1; runtimes: Runtime[]; services?: Partial<Record<LspId, LspService>> }
export interface PackageState {
  id: RuntimeId; version: string | null; ready: boolean
  /** 上次中断时已下载的字节数，用于提示「继续下载」。 */
  downloaded?: number
}
export interface Execution { verdict: 'OK' | Verdict; stdout: string; stderr: string; error?: string; elapsedMs?: number
  /** checker=spj 时判定程序的结论：OK=通过，否则答案错误；stderr 是它的说明。 */
  spj?: { verdict: 'OK' | Verdict; stderr: string; error?: string } }
export interface PointResult extends Execution { name: string; verdict: Verdict; expected?: string }
export interface JudgeResult { id: string; runtimeVersion: string; verdict: Verdict; points: PointResult[] }
export interface JudgeRequest { environment: Environment; source: string; cases: TestCase[]; checker: 'exact' | 'tokens' | 'spj'; checkerSource?: string; timeMs: number; custom?: boolean }
export interface Progress { phase: string; done?: number; total?: number; point?: number; points?: number }
export const verdictLabels: Record<string, string> = {
  OK: '运行完成', AC: '通过', WA: '答案错误', CE: '编译错误', RE: '运行错误', TLE: '运行超时', OLE: '输出超限',
  CANCELLED: '已取消', ENVIRONMENT_ERROR: '运行环境错误',
}
export const size = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MiB`
const LAST_ENV_KEY = 'learning:last-env'
/** 上次选过的语言；换语言时记，开新题/进 IDE 时带过来。 */
export function loadLastEnv(): Environment | null {
  try {
    const v = localStorage.getItem(LAST_ENV_KEY)
    return v && environments.some(e => e.id === v) ? v as Environment : null
  } catch { return null }
}
export function saveLastEnv(env: Environment) {
  try { localStorage.setItem(LAST_ENV_KEY, env) } catch { /* 隐私模式忽略 */ }
}

export const starter: Record<Environment, string> = {
  // 中立骨架：能编译通过但不带任何题目逻辑，打开题面时给用户一个起手点，
  // 不会像之前那样在每个题面塞一份 A+B 的答案。
  c: '#include <stdio.h>\n\nint main(void) {\n    return 0;\n}\n',
  cpp: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    return 0;\n}\n',
  python: 'import sys\ninput = sys.stdin.readline\n\n\n',
  java8: 'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner in = new Scanner(System.in);\n    }\n}\n',
  java21: 'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner in = new Scanner(System.in);\n    }\n}\n',
}
