export const policy = {
  id: 'wasi-practice-1',
  memoryPages: 4096,
  outputBytes: 1048576,
  compileTimeoutMs: 120000,
  cStandard: 'c11',
  cppStandard: 'c++17',
  clangArguments: ['-O2', '-fno-exceptions', '-isystem', '.', '-Wl,--max-memory=268435456', '-Wl,-z,stack-size=8388608'],
}
