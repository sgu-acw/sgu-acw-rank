/** Apply a hard maximum to defined wasm32 memories before instantiation. */
export function limitMemory(binary: Uint8Array, pages = 4096): Uint8Array {
  if (binary.length < 8 || binary[0] !== 0 || binary[1] !== 97 || binary[2] !== 115 || binary[3] !== 109) throw new Error('无效的 WASM 程序')
  const leb = (value: number) => {
    const bytes: number[] = []
    do { const part = value & 127; value = Math.floor(value / 128); bytes.push(part | (value ? 128 : 0)) } while (value)
    return bytes
  }
  const read = (cursor: { at: number }) => {
    let value = 0, factor = 1
    for (let i = 0; i < 5; i++) {
      const byte = binary[cursor.at++]
      if (byte === undefined) throw new Error('WASM 长度无效')
      value += (byte & 127) * factor
      if (!(byte & 128)) return value
      factor *= 128
    }
    throw new Error('WASM 整数无效')
  }
  for (const cursor = { at: 8 }; cursor.at < binary.length;) {
    const start = cursor.at, id = binary[cursor.at++], size = read(cursor), end = cursor.at + size
    if (end > binary.length) throw new Error('WASM 长度无效')
    if (id !== 5) { cursor.at = end; continue }
    const count = read(cursor), payload = [...leb(count)]
    for (let i = 0; i < count; i++) {
      const flags = read(cursor)
      if (flags !== 0 && flags !== 1) throw new Error('只支持普通 wasm32 内存')
      const minimum = read(cursor), maximum = flags & 1 ? read(cursor) : pages
      if (minimum > pages) throw new Error('运行环境初始内存超过限制')
      payload.push(1, ...leb(minimum), ...leb(Math.min(maximum, pages)))
    }
    if (cursor.at !== end) throw new Error('WASM 内存段无效')
    const section = new Uint8Array([5, ...leb(payload.length), ...payload])
    const output = new Uint8Array(start + section.length + binary.length - end)
    output.set(binary.subarray(0, start)); output.set(section, start); output.set(binary.subarray(end), start + section.length)
    return output
  }
  return binary
}
