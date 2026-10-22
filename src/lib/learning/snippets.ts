/**
 * 竞赛惯用代码片段：前缀补全 + Tab 占位符。
 * 参考 OJ++ 的 code-library，换成自己的 CM6 snippetCompletion。
 */
import { snippetCompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import type { Environment } from './types'

interface Snippet { prefix: string; name: string; code: string }

const CPP_SNIPPETS: Snippet[] = [
  { prefix: 'fori', name: 'for 循环', code: 'for (int ${i} = ${0}; ${i} < ${n}; ${i}++) {\n    ${}\n}' },
  { prefix: 'forj', name: 'for 循环（j）', code: 'for (int ${j} = ${0}; ${j} < ${m}; ${j}++) {\n    ${}\n}' },
  { prefix: 'forr', name: '倒序 for', code: 'for (int ${i} = ${n} - 1; ${i} >= ${0}; ${i}--) {\n    ${}\n}' },
  { prefix: 'fore', name: '范围 for', code: 'for (auto ${&:e} : ${a}) {\n    ${}\n}' },
  { prefix: 'vi', name: 'vector<int>', code: 'vector<int> ${v}(${n})' },
  { prefix: 'vll', name: 'vector<long long>', code: 'vector<long long> ${v}(${n})' },
  { prefix: 'vs', name: 'vector<string>', code: 'vector<string> ${v}(${n})' },
  { prefix: 'pii', name: 'pair<int,int>', code: 'pair<int, int> ${p}' },
  { prefix: 'pb', name: 'push_back', code: 'push_back(${x})' },
  { prefix: 'eb', name: 'emplace_back', code: 'emplace_back(${x})' },
  { prefix: 'all', name: 'begin/end', code: '${x}.begin(), ${x}.end()' },
  { prefix: 'sorta', name: '排序', code: 'sort(${x}.begin(), ${x}.end())' },
  { prefix: 'rev', name: '反转', code: 'reverse(${x}.begin(), ${x}.end())' },
  { prefix: 'acc', name: '求和', code: 'accumulate(${x}.begin(), ${x}.end(), 0LL)' },
  { prefix: 'io', name: '快读快写', code: 'ios::sync_with_stdio(false);\ncin.tie(nullptr);' },
  { prefix: 'll', name: 'typedef ll', code: 'typedef long long ll;' },
  { prefix: 'gcd', name: '最大公约数', code: '__gcd(${a}, ${b})' },
  { prefix: 'lcm', name: '最小公倍数', code: '${a} / __gcd(${a}, ${b}) * ${b}' },
  { prefix: 'bs', name: '二分查找', code: 'int ${l} = ${0}, ${r} = ${n} - 1;\nwhile (${l} <= ${r}) {\n    int mid = ${l} + ${r} >> 1;\n    if (${mid_ok}) ${l} = mid + 1;\n    else ${r} = mid - 1;\n}' },
  { prefix: 'qpow', name: '快速幂', code: 'long long ${qpow}(long long a, long long b, long long mod) {\n    long long r = 1;\n    a %= mod;\n    while (b) {\n        if (b & 1) r = r * a % mod;\n        a = a * a % mod;\n        b >>= 1;\n    }\n    return r;\n}' },
  { prefix: 'yes', name: '输出 YES', code: 'cout << "${YES}\\n";' },
  { prefix: 'no', name: '输出 NO', code: 'cout << "${NO}\\n";' },
  { prefix: 'main', name: 'main 骨架', code: 'int main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    ${}\n    return 0;\n}' },
]

const C_SNIPPETS: Snippet[] = [
  { prefix: 'fori', name: 'for 循环', code: 'for (int ${i} = ${0}; ${i} < ${n}; ${i}++) {\n    ${}\n}' },
  { prefix: 'fore', name: 'while', code: 'while (${cond}) {\n    ${}\n}' },
  { prefix: 'scan', name: 'scanf', code: 'scanf("${%lld}", &${x})' },
  { prefix: 'print', name: 'printf', code: 'printf("${%lld}\\n", ${x})' },
  { prefix: 'main', name: 'main 骨架', code: 'int main(void) {\n    ${}\n    return 0;\n}' },
]

const PY_SNIPPETS: Snippet[] = [
  { prefix: 'fori', name: 'for 循环', code: 'for ${i} in range(${n}):\n    ${}' },
  { prefix: 'form', name: 'for 区间', code: 'for ${i} in range(${a}, ${b}):\n    ${}' },
  { prefix: 'fore', name: '遍历', code: 'for ${e} in ${a}:\n    ${}' },
  { prefix: 'ii', name: '读整数', code: '${x} = int(input())' },
  { prefix: 'mii', name: '读多个整数', code: '${a}, ${b} = map(int, input().split())' },
  { prefix: 'li', name: '读整数列表', code: '${a} = list(map(int, input().split()))' },
  { prefix: 'fastio', name: '快读', code: 'import sys\ninput = sys.stdin.readline' },
  { prefix: 'sorta', name: '排序', code: '${a}.sort()' },
  { prefix: 'rev', name: '反转', code: '${a}.reverse()' },
  { prefix: 'yes', name: '输出 YES', code: 'print("YES")' },
  { prefix: 'no', name: '输出 NO', code: 'print("NO")' },
  { prefix: 'gcd', name: '最大公约数', code: 'from math import gcd' },
  { prefix: 'bs', name: '二分查找', code: 'lo, hi = ${0}, ${n} - 1\nwhile lo <= hi:\n    mid = (lo + hi) // 2\n    if ${ok}:\n        lo = mid + 1\n    else:\n        hi = mid - 1' },
  { prefix: 'def', name: '函数定义', code: 'def ${f}(${args}):\n    ${}' },
  { prefix: 'main', name: 'main 骨架', code: 'def main():\n    ${}\n\n\nif __name__ == "__main__":\n    main()' },
]

const JAVA_SNIPPETS: Snippet[] = [
  { prefix: 'psvm', name: 'main 骨架', code: 'public static void main(String[] args) {\n    ${}\n}' },
  { prefix: 'sout', name: '输出', code: 'System.out.println(${x});' },
  { prefix: 'sc', name: 'Scanner', code: 'Scanner ${in} = new Scanner(System.in);' },
  { prefix: 'ni', name: '读整数', code: '${int x} = in.nextInt();' },
  { prefix: 'nl', name: '读 long', code: '${long x} = in.nextLong();' },
  { prefix: 'fori', name: 'for 循环', code: 'for (int ${i} = ${0}; ${i} < ${n}; ${i}++) {\n    ${}\n}' },
  { prefix: 'fore', name: '增强 for', code: 'for (${int} ${e} : ${a}) {\n    ${}\n}' },
  { prefix: 'sorta', name: '排序', code: 'Arrays.sort(${a});' },
  { prefix: 'yes', name: '输出 YES', code: 'System.out.println("YES");' },
  { prefix: 'no', name: '输出 NO', code: 'System.out.println("NO");' },
]

const TABLES: Record<Environment, Snippet[]> = {
  c: C_SNIPPETS,
  cpp: CPP_SNIPPETS,
  python: PY_SNIPPETS,
  java8: JAVA_SNIPPETS,
  java21: JAVA_SNIPPETS,
}

/** 每次调用按当前语言重建补全源——override 模式下源是稳定引用，语言在函数里取。 */
export function snippetSource(environment: () => Environment) {
  return (context: CompletionContext): CompletionResult | null => {
    const word = context.matchBefore(/[\w.]+/)
    if (!word || (word.from === word.to && !context.explicit)) return null
    const options: Completion[] = TABLES[environment()].map(s => snippetCompletion(s.code, {
      label: s.prefix, detail: s.name, type: 'snippet', boost: 3,
    }))
    if (!options.length) return null
    return { from: word.from, options, validFor: /^[\w.]*$/ }
  }
}
