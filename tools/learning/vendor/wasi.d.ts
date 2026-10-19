export type WASIFS = Record<string, { path: string; content: Uint8Array; mode: 'binary'; timestamps: { access: Date; modification: Date; change: Date } }>
export class WASI {
  constructor(options: { args: string[]; fs: WASIFS; env: Record<string, string>; isTTY: boolean })
  memory: WebAssembly.Memory
  getImportObject(): Record<string, Record<string, (...args: number[]) => number>>
  start(value: { module: WebAssembly.Module; instance: WebAssembly.Instance }): { exitCode: number }
}
