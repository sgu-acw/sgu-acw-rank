// Keep transport revisions out of the decoded-object cache key. CDN entries
// created before Brotli delivery may otherwise serve immutable raw bytes.
export function packageDownloadUrl(path: string, origin: string): string {
  const url = new URL(path, origin)
  url.searchParams.set('encoding', 'br-1.2.1')
  return url.href
}
