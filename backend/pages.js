import dns from 'node:dns/promises';
import https from 'node:https';
import http from 'node:http';
import net from 'node:net';
import {normalize, safeUrl} from '../ranking/results.js';

export function isPublicIp(ip) {
  if (net.isIP(ip) === 4) {
    const [a,b] = ip.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0, 168].includes(b)) ||
      (a === 198 && [18, 19, 51].includes(b)) || (a === 203 && b === 0));
  }
  // IPv6: only global unicast 2000::/3, excluding documentation and transition ranges.
  const lower = ip.toLowerCase();
  return net.isIP(ip) === 6 && /^[23]/.test(lower) &&
    !/^(2001:db8:|2001:(?:0+:|:)|2002:)/.test(lower);
}

// Resolve, validate every address, and pin the connection to a checked IP.
// Redirect targets receive the same validation. No cookies or credentials are sent.
export async function readPublicPage(value, redirects = 0) {
  const link = safeUrl(value); if (!link) throw new Error('URL inválida');
  const url = new URL(link);
  if (url.port && !['80', '443'].includes(url.port)) throw new Error('Porta bloqueada');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = await Promise.race([dns.lookup(host, {all: true}),
    new Promise((_, reject) => {const t = setTimeout(() => reject(new Error('DNS timeout')), 3000); t.unref();})]);
  if (!addresses.length || addresses.some(a => !isPublicIp(a.address))) throw new Error('Endereço bloqueado');
  const address = addresses[0];
  const result = await new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.get(url, {agent: false,
      lookup: (_host, options, callback) => options?.all ? callback(null, [address]) : callback(null, address.address, address.family),
      headers: {'User-Agent': 'BuscaVisual/1.0 (public-page language check)', Accept: 'text/html', 'Accept-Encoding': 'identity'}
    }, res => {
      if ([301,302,303,307,308].includes(res.statusCode)) {
        res.resume(); resolve({redirect: res.headers.location}); return;
      }
      if (res.statusCode !== 200 || !String(res.headers['content-type']).includes('text/html')) {
        res.resume(); reject(new Error('Página indisponível')); return;
      }
      const chunks = []; let size = 0;
      res.on('data', chunk => {
        size += chunk.length;
        if (size > 250000) {req.destroy(new Error('Página excede limite')); return;}
        chunks.push(chunk);
      });
      res.on('end', () => resolve({html: Buffer.concat(chunks).toString('utf8')}));
      res.on('error', reject);
    });
    const deadline = setTimeout(() => req.destroy(new Error('Tempo esgotado')), 5000);
    req.on('close', () => clearTimeout(deadline)); req.on('error', reject);
  });
  if (result.redirect) {
    if (redirects >= 3) throw new Error('Muitos redirecionamentos');
    return readPublicPage(new URL(result.redirect, url).href, redirects + 1);
  }
  return result.html;
}

const dictionaries = {
  pt: 'que para uma como com nao dos das pelo pela sobre tambem sao esta esse essa mais muito entre foi tem seu sua voce nos onde quando porque ainda ser aos nas ou ao uma brasil',
  en: 'the and with from that this which their about also are was were have has your will not but can into our there when where because than its',
  es: 'que para una como con los las por del pero tambien son esta este mas muy entre fue tiene sus donde cuando porque aun ser al unos estas'
};
export function analyzeHtml(html) {
  const text = html.replace(/<(script|style|nav|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&(?:nbsp|amp|quot|lt|gt|#\d+);/g, ' ').replace(/\s+/g, ' ').trim();
  const words = normalize(text).match(/[a-z]+/g) || [];
  const declared = html.match(/<html\b[^>]*\blang\s*=\s*["']([a-z-]+)["']/i)?.[1]?.toLowerCase();
  const counts = Object.entries(dictionaries).map(([lang, vocabulary]) => {
    const set = new Set(vocabulary.split(' '));
    const hits = words.filter(w => set.has(w));
    return {lang, count: hits.length, distinct: new Set(hits).size};
  }).sort((a,b) => b.count - a.count);
  let language = 'unknown', languageMethod = 'insufficient_text';
  if (words.length >= 40 && counts[0].distinct >= 5 && counts[0].count >= 8 && counts[0].count >= counts[1].count * 1.4) {
    language = counts[0].lang === 'pt' ? 'pt' : 'other'; languageMethod = 'text_estimate';
  } else if (words.length >= 40 && declared) {
    language = declared.split('-')[0] === 'pt' ? 'pt' : 'other'; languageMethod = 'page_declaration';
  }
  return {language, languageMethod, excerpt: text.slice(0, 12000)};
}

export async function enrichLanguages(rows, {readPage = readPublicPage, limit = 40} = {}) {
  let cursor = 0;
  await Promise.all(Array.from({length: Math.min(4, rows.length)}, async () => {
    while (cursor < Math.min(rows.length, limit)) {
      const row = rows[cursor++];
      try {Object.assign(row, analyzeHtml(await readPage(row.link)));}
      catch {row.language = 'unknown'; row.languageMethod = 'unavailable';}
    }
  }));
  return rows;
}
