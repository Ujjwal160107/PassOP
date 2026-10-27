const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i
const LOOKS_LIKE_HOST = /^[^\s/]+\.[^\s/]+/

export function normalizeSite(input) {
  const site = input.trim()
  if (!site || HAS_SCHEME.test(site) || !LOOKS_LIKE_HOST.test(site)) return site
  return `https://${site}`
}

function parse(site) {
  try {
    return new URL(site.trim())
  } catch {
    return null
  }
}

// Only http(s) becomes a link; anything else (javascript:, data:, free text) stays plain text.
export function safeHref(site) {
  const url = parse(site)
  return url && (url.protocol === 'http:' || url.protocol === 'https:') ? url.href : null
}

export function siteLabel(site) {
  const url = safeHref(site) && parse(site)
  return url ? url.hostname.replace(/^www\./, '') : site.trim()
}
