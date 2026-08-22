import crypto from 'crypto'

function sanitize(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function resourceName(prefix: string, replId: string) {
  const hash = crypto.createHash('sha1').update(replId).digest('hex').slice(0, 8)
  const base = sanitize(`${prefix}-${replId}`)
  const trimmed = base.slice(0, 52)
  return `${trimmed}-${hash}`.slice(0, 63)
}

export function workspaceHost(replId: string, baseDomain: string) {
  const safe = sanitize(replId) || 'repl'
  return `${safe}.${baseDomain}`
}
