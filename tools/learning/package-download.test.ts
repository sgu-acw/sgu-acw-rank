// @ts-nocheck
// Node-only regression tests; the app's TypeScript config targets the browser.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { packageDownloadUrl } from './package-download.ts'

test('package downloads bypass old immutable representations without changing the object key', () => {
  const path = '/packages/objects/sha256/java21.jar'
  const url = new URL(packageDownloadUrl(path, 'https://judge.example'))
  assert.equal(url.origin, 'https://judge.example')
  assert.equal(url.pathname, path)
  assert.equal(url.search, '?encoding=br-1.2.1')
  assert.notEqual(url.href, new URL(path, url.origin).href)
})

test('the transport revision preserves other query parameters and stays stable across retries', () => {
  const url = packageDownloadUrl('/packages/objects/hash/file?other=1&encoding=old', 'https://judge.example')
  assert.equal(new URL(url).searchParams.get('other'), '1')
  assert.deepEqual(new URL(url).searchParams.getAll('encoding'), ['br-1.2.1'])
  assert.equal(packageDownloadUrl(url, 'https://judge.example'), url)
})
