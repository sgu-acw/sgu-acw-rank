/**
 * Renders a marked paragraph as a link card.
 *
 * Usage in a markdown file:
 *
 *   :::card [标题](https://example.com)
 *   一句话说明。
 *   :::
 *
 * The description is optional. Internal links (starting with "/") open in the
 * same tab and are labelled 站内; external links open in a new tab and show
 * their hostname.
 */

const MARKER = ':::card'

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function textOf(node) {
  if (node.value) return node.value
  if (!node.children) return ''
  return node.children.map(textOf).join('')
}

function parseCard(paragraph) {
  const [first, ...rest] = paragraph.children ?? []
  if (!first || first.type !== 'text' || !first.value.startsWith(MARKER)) return null

  const linkIndex = rest.findIndex((child) => child.type === 'link')
  if (linkIndex === -1) return null
  const link = rest[linkIndex]

  const description = rest
    .slice(linkIndex + 1)
    .map(textOf)
    .join('')
    .replace(/:::\s*$/, '')
    .trim()

  const title = textOf(link).trim() || link.url
  const internal = link.url.startsWith('/')
  const host = internal ? '站内' : link.url.replace(/^https?:\/\//, '').split('/')[0]

  return { title, url: link.url, description, internal, host }
}

function renderCard({ title, url, description, internal, host }) {
  const attrs = internal
    ? `href="${escapeHtml(url)}"`
    : `href="${escapeHtml(url)}" target="_blank" rel="noreferrer"`

  return [
    `<a class="link-card" ${attrs}>`,
    '<span class="link-card-main">',
    `<span class="link-card-title">${escapeHtml(title)}</span>`,
    description ? `<span class="link-card-desc">${escapeHtml(description)}</span>` : '',
    `<span class="link-card-host">${escapeHtml(host)}</span>`,
    '</span>',
    '<span class="link-card-arrow" aria-hidden="true">↗</span>',
    '</a>',
  ].join('')
}

function walk(node) {
  if (!node.children) return
  node.children = node.children.map((child) => {
    if (child.type === 'paragraph') {
      const card = parseCard(child)
      if (card) return { type: 'html', value: renderCard(card) }
    }
    walk(child)
    return child
  })
}

export default function remarkLinkCard() {
  return (tree) => {
    walk(tree)
  }
}
