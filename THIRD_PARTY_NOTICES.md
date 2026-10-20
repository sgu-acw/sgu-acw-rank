# Third-party runtime notices

题库在浏览器里编译和执行代码，运行包由 `tools/learning/prepare.cjs` 生成。
下列组件的许可证独立于本站源码的许可。

| 组件 | 来源 | 许可证 |
| --- | --- | --- |
| CPython 3.11.3 WASI 二进制与标准库 | `taybenlor/runno` revision `3c32435e7a07a59aac3f5497040c8c6317d1cff3`，`langs/python-3.11.3.wasm`、`langs/python-3.11.3.tar.gz`；https://github.com/python/cpython/tree/v3.11.3 | PSF-2.0 |
| YoWASP Clang/LLD 22.0.0-git20542-10 | npm `@yowasp/clang`（ISC），https://github.com/YoWASP/clang — 内含 LLVM/Clang/LLD，Apache-2.0 WITH LLVM-exception | ISC + Apache-2.0 WITH LLVM-exception |
| wasi-libc | https://github.com/WebAssembly/wasi-libc | Apache-2.0 WITH LLVM-exception |
| clangd-wasm 0.1.1 | npm `@algoproclub/clangd-wasm`，https://github.com/algoproclub/clangd-wasm | Apache-2.0 WITH LLVM-exception |
| Pyright Browser 1.1.299 | npm `@typefox/pyright-browser`，https://github.com/TypeFox/pyright | MIT |
| Python 标准库类型存根 | `pyright` 1.1.299 对应的 typeshed 快照，https://github.com/python/typeshed | Apache-2.0 |
| B-JVM | https://github.com/andrewromanenco/bjvm（本地构建，`pnpm learning:java`） | MIT |
| Eclipse Compiler for Java (ECJ) | https://github.com/eclipse-jdt/eclipse.jdt.core | EPL-2.0 |
| OpenJDK 21 / JDK 8 类库 | https://github.com/openjdk/jdk，https://github.com/openjdk/jdk8u | GPL-2.0 WITH Classpath-exception-2.0 |
| CodeMirror 6 | npm `@codemirror/*`，https://github.com/codemirror/dev | MIT |
| Lucide 图标 | npm `lucide-vue-next`，https://github.com/lucide-icons/lucide | ISC |

运行包的精确 SHA-256 摘要记录在 `manifest.json` 里，下载后逐个校验。
浏览器只从 `judge.zh314.xyz` 加载这些文件，不从第三方 CDN 取可执行代码。

运行时提供的 `bits/stdc++.h` 是兼容头文件，展开为 C++17 标准头，不是 GCC 实现，
也不提供 PBDS 等 GNU 扩展。
