/** Reject incomplete language packs rather than reporting Python builtins as undefined. */
export function pyrightInitializationOptions(files: unknown): { files: Record<string, string> } {
  if (!files || typeof files !== 'object' || Array.isArray(files)) {
    throw new Error('Python 类型声明损坏，请更新 Python 语言包')
  }
  const stubs = files as Record<string, unknown>
  const required = ['builtins.pyi', 'typing.pyi', 'typing_extensions.pyi', '_typeshed/__init__.pyi']
  if (Object.values(stubs).some(value => typeof value !== 'string')
    || required.some(name => typeof stubs[`/typeshed/stdlib/${name}`] !== 'string' || !stubs[`/typeshed/stdlib/${name}`])) {
    throw new Error('Python 类型声明不完整，请更新 Python 语言包')
  }
  return { files: {
    ...stubs as Record<string, string>,
    '/workspace/pyrightconfig.json': JSON.stringify({
      pythonVersion: '3.11', pythonPlatform: 'Linux', typeCheckingMode: 'basic', typeshedPath: '/typeshed',
    }),
  } }
}
