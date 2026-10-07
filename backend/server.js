import http from 'node:http';
import {randomBytes, timingSafeEqual} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {SerpApiProvider} from '../providers/serpapi.js';
import {searchImage} from './search.js';

export function imageMime(buffer) {
  if (buffer.length < 12) return null;
  if (buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return 'image/jpeg';
  if (['GIF87a','GIF89a'].includes(buffer.subarray(0,6).toString())) return 'image/gif';
  if (buffer.subarray(0,4).toString() === 'RIFF' && buffer.subarray(8,12).toString() === 'WEBP') return 'image/webp';
  return null;
}
const defaultRoot = fileURLToPath(new URL('../frontend/', import.meta.url));
const clamp = (v, fallback, max) => Math.max(1, Math.min(Number(v) || fallback, max));

export function createServer({env = process.env, provider, readPage, frontendRoot = defaultRoot, now = Date.now} = {}) {
  const images = new Map(), rateLimits = new Map(); let active = 0;
  const accessToken = env.SEARCH_ACCESS_TOKEN || '';
  const allowed = new Set((env.ALLOWED_ORIGINS || 'http://localhost:8080').split(',').map(s => s.trim()));
  const apiKey = env.SERPAPI_API_KEY || '';
  const base = (env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  let baseValid = false;
  try {const u = new URL(base); baseValid = u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash;} catch {}
  const ready = !!(apiKey && accessToken.length >= 24 && baseValid);
  provider ||= new SerpApiProvider({apiKey, zeroTrace: env.SERPAPI_ZERO_TRACE === 'true'});
  const cleanup = () => {
    for (const [key, image] of images) if (image.expires <= now()) images.delete(key);
    for (const [key, value] of rateLimits) if (value.until <= now()) rateLimits.delete(key);
  };
  const timer = setInterval(cleanup, 30000); timer.unref();
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    const origin = req.headers.origin;
    if (origin) {
      if (!allowed.has(origin)) {res.writeHead(403); res.end(); return;}
      res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    const json = (status, data) => {res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8'}); res.end(JSON.stringify(data));};
    const url = new URL(req.url, 'http://local');
    if (req.method === 'OPTIONS') {res.writeHead(204); res.end(); return;}
    if (req.method === 'GET' && url.pathname === '/api/health') {
      json(200, {ready, provider: 'SerpApi', maxImageBytes: 5 * 1024 * 1024}); return;
    }
    if (req.method === 'GET' && url.pathname.startsWith('/api/images/')) {
      cleanup(); const token = url.pathname.slice('/api/images/'.length);
      const image = images.get(token);
      if (!image) {json(404, {error: 'Imagem expirada.'}); return;}
      res.writeHead(200, {'Content-Type': image.mime, 'Content-Length': image.buffer.length,
        'Content-Disposition': 'inline', 'Content-Security-Policy': "default-src 'none'; sandbox"});
      res.end(image.buffer); return;
    }
    if (req.method === 'POST' && url.pathname === '/api/search') {
      if (!ready) {json(503, {error: 'Backend ainda não configurado. Configure SERPAPI_API_KEY, PUBLIC_BASE_URL e SEARCH_ACCESS_TOKEN no servidor.'}); return;}
      const supplied = String(req.headers.authorization || '').replace(/^Bearer /, '');
      const expected = Buffer.from(accessToken), actual = Buffer.from(supplied);
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {json(401, {error: 'Token de acesso inválido.'}); return;}
      if (!String(req.headers['content-type']).startsWith('application/json')) {json(415,{error:'Envie JSON.'});return;}
      cleanup(); const ip = req.socket.remoteAddress;
      const rate = rateLimits.get(ip) || {count: 0, until: now()+60000};
      if (rate.count >= 5) {json(429, {error:'Limite de cinco pesquisas por minuto atingido.'}); return;}
      if (active >= 3) {json(429, {error:'Servidor ocupado. Aguarde e tente novamente.'}); return;}
      rate.count++; rateLimits.set(ip, rate); active++;
      let imageToken;
      try {
        const chunks = []; let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 7 * 1024 * 1024) {const error = new Error('Arquivo muito grande. Limite: 5 MB.'); error.status = 413; throw error;}
          chunks.push(chunk);
        }
        let input;
        try {input = JSON.parse(Buffer.concat(chunks).toString());} catch {throw new Error('Dados inválidos.');}
        if (!input || typeof input !== 'object' || input.externalProcessingAccepted !== true) throw new Error('Confirme o envio da imagem ao provedor externo.');
        if (typeof input.keyword !== 'undefined' && typeof input.keyword !== 'string') throw new Error('Palavra-chave inválida.');
        const keyword = (input.keyword || '').trim();
        if (keyword.length > 200) throw new Error('Use uma palavra-chave de até 200 caracteres.');
        const encoded = input.imageBase64;
        if (typeof encoded !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('Imagem inválida.');
        const buffer = Buffer.from(encoded, 'base64');
        if (buffer.length > 5*1024*1024) {const error = new Error('Limite de imagem: 5 MB.'); error.status = 413; throw error;}
        const mime = imageMime(buffer);
        if (!mime) throw new Error('Use uma imagem JPEG, PNG, WebP ou GIF.');
        imageToken = randomBytes(32).toString('hex');
        images.set(imageToken, {buffer, mime, expires: now()+180000});
        let result;
        try {
          result = await searchImage({provider, imageUrl: `${base}/api/images/${imageToken}`, keyword,
            preferPortuguese: input.preferPortuguese !== false,
            maxResults: clamp(env.MAX_RESULTS,40,100), languageLimit: clamp(env.LANGUAGE_CHECK_LIMIT,40,100), readPage});
        } catch(error) {error.status = 502; throw error;}
        json(200,result);
      } catch(error) {
        json(error.status || 400, {error: error.message || 'Não foi possível concluir a pesquisa.'});
      } finally {if (imageToken) images.delete(imageToken); active--;}
      return;
    }
    const files = {'/':'index.html','/index.html':'index.html','/styles.css':'styles.css','/app.js':'app.js','/config.js':'config.js'};
    if (req.method === 'GET' && files[url.pathname]) {
      try {
        const file = files[url.pathname]; const body = await readFile(path.join(frontendRoot,file));
        const mime = file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'text/javascript';
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: http: blob: data:; connect-src 'self' https: http://localhost:* http://127.0.0.1:*; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
        res.writeHead(200, {'Content-Type': `${mime}; charset=utf-8`}); res.end(body);
      } catch {json(404,{error:'Não encontrado.'});}
      return;
    }
    json(404,{error:'Não encontrado.'});
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  server.on('close', () => {clearInterval(timer); images.clear();});
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 8080;
  createServer().listen(port, '0.0.0.0', () => console.log(`Busca visual disponível na porta ${port}.`));
}
