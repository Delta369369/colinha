const tracking = /^(utm_.+|fbclid|gclid|msclkid|igshid)$/i;
export function safeUrl(value) {
  try {
    const u = new URL(value);
    return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u.href : null;
  } catch { return null; }
}
export function canonicalUrl(value) {
  const link = safeUrl(value); if (!link) return null;
  const u = new URL(link); u.hash = '';
  for (const key of [...u.searchParams.keys()]) if (tracking.test(key)) u.searchParams.delete(key);
  u.searchParams.sort();
  // Keep meaningful query parameters and HTTP/HTTPS distinctions.
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, '');
  return u.href;
}
export const normalize = value => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function mergeResults(batches) {
  const found = new Map();
  for (const {origin, items} of batches) for (const [index, item] of items.entries()) {
    const link = canonicalUrl(item.link); if (!link) continue;
    const position = Number.isFinite(item.position) && item.position > 0 ? item.position : index + 1;
    let row = found.get(link);
    if (!row) {
      row = {link, title: String(item.title || 'Página sem título').slice(0, 500),
        source: String(item.source || new URL(link).hostname).slice(0, 150),
        thumbnail: safeUrl(item.thumbnail), origins: [], positions: {}, language: 'unknown',
        languageMethod: 'unavailable', excerpt: ''};
      found.set(link, row);
    }
    if (!row.origins.includes(origin)) row.origins.push(origin);
    row.positions[origin] = Math.min(row.positions[origin] ?? Infinity, position);
    if (!row.thumbnail) row.thumbnail = safeUrl(item.thumbnail);
  }
  return [...found.values()];
}
export function rankResults(rows, keyword = '', preferPortuguese = true) {
  const tokens = normalize(keyword).match(/[a-z0-9]{2,}/g) || [];
  return rows.map(row => {
    const text = normalize(`${row.title} ${row.excerpt}`);
    const keywordMatch = tokens.length ? tokens.filter(t => text.includes(t)).length / tokens.length : 0;
    const bestPosition = Math.min(...Object.values(row.positions));
    const domain = new URL(row.link).hostname;
    const score = 10 / bestPosition + (row.origins.length > 1 ? 5 : 0) + keywordMatch * 4
      + (preferPortuguese && row.language === 'pt' ? 7 : 0) + (domain.endsWith('.br') ? 0.25 : 0);
    return {...row, keywordMatch, rankScore: score};
  }).sort((a, b) => b.rankScore - a.rankScore || a.link.localeCompare(b.link));
}
