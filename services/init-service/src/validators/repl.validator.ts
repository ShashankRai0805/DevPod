export const NAME_RE = /^[A-Za-z0-9_-]+$/
export const ALLOWED_LANGS = ['node', 'python', 'java', 'cpp'] as const

export function validateName(name: unknown) {
  if (typeof name !== 'string') return false
  if (!name.length) return false
  if (!NAME_RE.test(name)) return false
  if (name === '.' || name === '..') return false
  return true
}

export function validateLanguage(lang: unknown) {
  if (typeof lang !== 'string') return false
  return (ALLOWED_LANGS as readonly string[]).includes(lang)
}
