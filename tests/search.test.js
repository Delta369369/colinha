import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {canonicalUrl, mergeResults, rankResults} from '../ranking/results.js';
import {analyzeHtml, isPublicIp, enrichLanguages} from '../backend/pages.js';
import {SerpApiProvider} from '../providers/serpapi.js';
import {searchImage} from '../backend/search.js';
import {createServer, imageMime} from '../backend/server.js';

const portuguese = '<html lang="pt-BR"><body>' + 'A floresta que fica entre as cidades tem uma paisagem muito rica. Para conhecer mais sobre esta região, veja como são os parques e as trilhas, onde também há rios. Você pode explorar sua história porque ainda existem muitas áreas preservadas. '.repeat(3) + '</body></html>';
test('deduplica rastreadores sem apagar parâmetros significativos', () => {
  assert.equal(canonicalUrl('https://example.com/p?utm_source=x&id=2#photo'),'https://example.com/p?id=2');
  assert.notEqual(canonicalUrl('https://example.com/p?id=2'),canonicalUrl('https://example.com/p?id=3'));
  assert.equal(canonicalUrl('javascript:alert(1)'), null);
  const rows=mergeResults([{origin:'visual',items:[{link:'https://example.com/p?utm_source=a',position:2}]},{origin:'keyword',items:[{link:'https://example.com/p',position:1}]}]);
  assert.equal(rows.length,1);assert.deepEqual(rows[0].origins,['visual','keyword']);
});
test('português aumenta prioridade sem excluir outros ou presumir idioma por .br', () => {
  const rows=mergeResults([{origin:'visual',items:[{link:'https://site.com/en',position:1},{link:'https://site.com/pt',position:2},{link:'https://site.br/x',position:3}]}]);
  rows[0].language='other';rows[1].language='pt';
  assert.equal(rankResults(rows,'',true)[0].language,'pt');assert.equal(rankResults(rows,'',false)[0].language,'other');
  assert.equal(rows[2].language,'unknown');assert.equal(rankResults(rows).length,3);
});
test('verifica texto, distingue declaração e texto insuficiente', () => {
  assert.equal(analyzeHtml(portuguese).language,'pt');
  assert.equal(analyzeHtml('<html lang="pt"><p>Olá!</p>').language,'unknown');
  assert.equal(analyzeHtml('<html lang="de"><p>'+('Wald Natur Landschaft '.repeat(30))+'</p>').languageMethod,'page_declaration');
});
test('falha na leitura conserva resultado com idioma não determinado', async () => {
  const rows=mergeResults([{origin:'visual',items:[{link:'https://example.com/'}]}]);
  await enrichLanguages(rows,{readPage:async()=>{throw new Error('blocked');}});
  assert.equal(rows.length,1);assert.equal(rows[0].language,'unknown');
});
test('bloqueia IPs internos, loopback e IPv6 de transição', () => {
  for (const ip of ['127.0.0.1','10.1.2.3','192.168.1.1','169.254.169.254','100.64.0.1','::1','::ffff:127.0.0.1','2002:7f00:1::','2001:db8::1','2001::1']) assert.equal(isPublicIp(ip),false,ip);
  assert.equal(isPublicIp('8.8.8.8'),true);assert.equal(isPublicIp('2606:4700:4700::1111'),true);
});
test('envia imagem e texto sem restrição de país; não vaza chave nos erros', async () => {
  let request;
  const p=new SerpApiProvider({apiKey:'secret',fetchImpl:async url=>{request=new URL(url);return {ok:true,json:async()=>({visual_matches:[]})};}});
  await p.search('https://public.example/image','Mato Grosso');
  assert.equal(request.searchParams.get('q'),'Mato Grosso');assert.equal(request.searchParams.has('country'),false);
  const bad=new SerpApiProvider({apiKey:'secret',fetchImpl:async()=>{throw new Error('secret');}});
  await assert.rejects(()=>bad.search('https://example.com'),e=>!e.message.includes('secret'));
});
test('duas consultas, união e resultados parciais', async () => {
  const calls=[];
  const result=await searchImage({provider:{search:async(_image,q)=>{calls.push(q);return [{link:'https://example.com/p',title:'Mato Grosso',position:1}];}},imageUrl:'https://example.com/img',keyword:'Mato Grosso',readPage:async()=>portuguese});
  assert.deepEqual(calls,['','Mato Grosso']);assert.equal(result.results.length,1);assert.equal(result.results[0].origins.length,2);assert.equal(result.results[0].language,'pt');
  const partial=await searchImage({provider:{search:async(_image,q)=>{if(q)throw new Error('indisponível');return [{link:'https://example.com/p'}];}},imageUrl:'https://example.com/img',keyword:'x',readPage:async()=>''});
  assert.equal(partial.successfulQueries,1);assert.equal(partial.warnings.length,1);assert.equal(partial.results.length,1);
});
test('Lens sem correspondências é resultado vazio, mas falhas continuam explícitas', async () => {
  const payload={search_metadata:{status:'Success'},search_information:{images_results_state:'Fully empty'},error:"Google Lens hasn't returned any results for this query."};
  const provider=new SerpApiProvider({apiKey:'secret',fetchImpl:async()=>({ok:true,json:async()=>payload})});
  const result=await searchImage({provider,imageUrl:'https://example.com/image',keyword:'querencia'});
  assert.equal(result.successfulQueries,2);assert.deepEqual(result.results,[]);assert.deepEqual(result.warnings,[]);
  payload.error='Invalid API key: secret';
  await assert.rejects(()=>provider.search('https://example.com/image'),e=>!e.message.includes('secret'));
  payload.error="Google Lens hasn't returned any results for this query.";payload.search_metadata.status='Error';
  await assert.rejects(()=>provider.search('https://example.com/image'));
});
test('sem palavra-chave faz só uma consulta e falha total não vira resultado vazio', async () => {
  let n=0;await searchImage({provider:{search:async()=>{n++;return [];}},imageUrl:'https://example.com/img'});assert.equal(n,1);
  await assert.rejects(()=>searchImage({provider:{search:async()=>{throw new Error('falhou');}},imageUrl:'x'}),/falhou/);
});
test('aceita formatos de imagem e recusa SVG', () => {
  assert.equal(imageMime(Buffer.from('<svg></svg>xxxxxxxx')) ,null);
  assert.equal(imageMime(Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0])),'image/png');
});
test('API: autenticação, CORS, imagem temporária, busca e exclusão após consulta', async t => {
  let imageUrl, temporaryWasAccessible=false;
  const server=createServer({env:{SERPAPI_API_KEY:'dummy',SEARCH_ACCESS_TOKEN:'a'.repeat(32),PUBLIC_BASE_URL:'https://backend.example',ALLOWED_ORIGINS:'https://delta369369.github.io'},
    readPage:async()=>portuguese,
    provider:{search:async url=>{imageUrl=new URL(url);const response=await fetch(`${base}${imageUrl.pathname}`);temporaryWasAccessible=response.ok;return [{link:'https://example.com/page',title:'Floresta'}];}}});
  server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  assert.equal((await fetch(`${base}/api/health`)).status,200);
  assert.equal((await fetch(`${base}/api/health`,{headers:{Origin:'https://evil.example'}})).status,403);
  assert.equal((await fetch(`${base}/api/search`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
  const image=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]).toString('base64');
  const send=body=>fetch(`${base}/api/search`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${'a'.repeat(32)}`},body:JSON.stringify(body)});
  assert.equal((await send({imageBase64:image})).status,400);
  const response=await send({imageBase64:image,externalProcessingAccepted:true});
  assert.equal(response.status,200);assert.equal((await response.json()).results[0].language,'pt');assert.equal(temporaryWasAccessible,true);
  assert.equal((await fetch(`${base}${imageUrl.pathname}`)).status,404);
  assert.equal((await fetch(`${base}/.env`)).status,404);
  assert.equal((await fetch(`${base}/`)).status,200);
});
test('API não configurada é explícita', async t => {
  const server=createServer({env:{}});server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const base=`http://127.0.0.1:${server.address().port}`;
  assert.equal((await (await fetch(`${base}/api/health`)).json()).ready,false);
  assert.equal((await fetch(`${base}/api/search`,{method:'POST'})).status,503);
});
