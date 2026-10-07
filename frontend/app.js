const $ = id => document.getElementById(id);
let file = null, previewUrl = null, token = '', ready = false, healthVersion = 0;
let savedBase = '';
try {savedBase = localStorage.getItem('buscaVisualBackend') || '';} catch {}
let apiBase = savedBase || window.BUSCA_VISUAL_CONFIG?.apiBaseUrl || '';
const isPages = location.hostname.endsWith('.github.io');
const endpoint = path => `${apiBase.replace(/\/$/, '')}${path}`;
const setStatus = (message, className = '') => {$('status').textContent = message; $('status').className = `status ${className}`;};

async function checkHealth() {
  const version = ++healthVersion; ready = false;
  if (!apiBase && isPages) {$('connection-status').textContent = 'Conecte um backend para pesquisar.'; return;}
  try {
    const response = await fetch(endpoint('/api/health'), {signal: AbortSignal.timeout(6000)});
    if (!response.ok) throw new Error();
    const data = await response.json();
    if (version !== healthVersion) return;
    ready = data.ready === true;
    $('connection-status').textContent = ready ? 'Backend conectado. Informe o token para pesquisar.' : 'Backend conectado; configuração da SerpApi pendente.';
    $('connection-status').className = `connection ${ready ? 'online' : ''}`;
  } catch {
    if (version !== healthVersion) return;
    $('connection-status').textContent = 'Backend indisponível. Confira a conexão.';
    $('connection-status').className = 'connection';
  }
}
function selectFile(selected) {
  if (!selected) return;
  if (!['image/jpeg','image/png','image/webp','image/gif'].includes(selected.type) || selected.size > 5*1024*1024) {
    setStatus('Selecione JPEG, PNG, WebP ou GIF de até 5 MB.', 'error'); return;
  }
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  file = selected; previewUrl = URL.createObjectURL(selected);
  $('preview').src = previewUrl; $('preview').hidden = false; $('upload-prompt').hidden = true;
  $('file-name').textContent = `${selected.name} · ${(selected.size/1024).toFixed(0)} KB`;
  $('clear-image').hidden = false; setStatus('');
}
$('image-input').addEventListener('change', e => selectFile(e.target.files[0]));
$('dropzone').addEventListener('keydown', e => {if (['Enter',' '].includes(e.key)) {e.preventDefault();$('image-input').click();}});
for (const event of ['dragenter','dragover']) $('dropzone').addEventListener(event, e => {e.preventDefault();$('dropzone').classList.add('dragover');});
for (const event of ['dragleave','drop']) $('dropzone').addEventListener(event, e => {e.preventDefault();$('dropzone').classList.remove('dragover');});
$('dropzone').addEventListener('drop', e => selectFile(e.dataTransfer.files[0]));
$('clear-image').addEventListener('click', () => {
  file = null; if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = null;
  $('preview').hidden = true; $('preview').removeAttribute('src'); $('upload-prompt').hidden = false;
  $('image-input').value = ''; $('file-name').textContent = 'Nenhuma imagem selecionada'; $('clear-image').hidden = true;
});
function openSettings() {$('backend-url').value = apiBase;$('access-token').value = token;$('settings-error').textContent='';$('settings-dialog').showModal();}
$('settings-button').addEventListener('click', openSettings);
$('close-settings').addEventListener('click', () => $('settings-dialog').close());
$('settings-form').addEventListener('submit', e => {
  e.preventDefault(); const value = $('backend-url').value.trim().replace(/\/$/,'');
  if (value) {
    try {
      const url = new URL(value);
      if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname)))) throw new Error();
    } catch {$('settings-error').textContent = 'Use uma URL HTTPS válida (ou HTTP para localhost).';return;}
  } else if (isPages) {$('settings-error').textContent='Informe o endereço público do backend.';return;}
  apiBase = value; token = $('access-token').value.trim();
  try {localStorage.setItem('buscaVisualBackend', apiBase);} catch {}
  $('access-token').value = ''; $('settings-dialog').close(); checkHealth();
});
function render(data) {
  $('results').replaceChildren(); $('empty-state').hidden = data.results.length > 0;
  $('result-count').textContent = data.results.length;
  $('results-note').hidden = data.results.length === 0;
  $('warnings').hidden = !data.warnings.length; $('warnings').textContent = data.warnings.join(' ');
  data.results.forEach((row, index) => {
    const card = $('result-template').content.cloneNode(true);
    const pick = selector => card.querySelector(selector);
    pick('.number').textContent = String(index+1).padStart(2,'0');
    pick('.title').textContent = row.title; pick('.source').textContent = row.source;
    pick('.open-link').href = row.link;
    const image = pick('.thumbnail'), fallback = pick('.thumbnail-fallback');
    image.addEventListener('error', () => {image.hidden=true;fallback.hidden=false;});
    if (row.thumbnail) image.src = row.thumbnail; else {image.hidden=true;fallback.hidden=false;}
    const lang = pick('.language-tag');
    lang.textContent = {pt:'Português',other:'Outro idioma',unknown:'Idioma não determinado'}[row.language];
    if (row.language === 'pt') lang.classList.add('pt');
    pick('.origin-tag').textContent = row.origins.length > 1 ? 'Ambas as buscas' : row.origins[0] === 'keyword' ? 'Imagem + palavra-chave' : 'Busca visual';
    pick('.language-method').textContent = {text_estimate:'Idioma estimado pelo texto da página.',page_declaration:'Idioma declarado pela página.',insufficient_text:'Texto insuficiente para determinar o idioma.',unavailable:'Idioma não verificado; página indisponível ou fora do limite de análise.'}[row.languageMethod] || 'Idioma não determinado.';
    $('results').append(card);
  });
  setStatus(data.results.length ? `${data.results.length} fontes · ${data.successfulQueries} de ${data.queries} consultas concluídas.` : 'Nenhuma correspondência retornada. Tente outra imagem ou palavra-chave.');
}
const base64 = blob => new Promise((resolve,reject) => {const reader = new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob);});
$('search-form').addEventListener('submit', async e => {
  e.preventDefault();
  if (!file) {setStatus('Selecione uma imagem para começar.', 'error');return;}
  if (!ready || !token) {setStatus('Configure a conexão e o token de acesso antes de pesquisar.', 'error');openSettings();return;}
  $('search-button').disabled = true; $('results').replaceChildren(); $('result-count').textContent='0';
  $('results-note').hidden=true; $('empty-state').hidden=true; $('warnings').hidden=true;
  setStatus('Pesquisando correspondências e verificando o idioma das páginas…', 'busy');
  try {
    const response = await fetch(endpoint('/api/search'), {
      method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
      body:JSON.stringify({imageBase64:await base64(file),keyword:$('keyword').value.trim(),preferPortuguese:$('language').value==='pt',externalProcessingAccepted:$('consent').checked}),
      signal:AbortSignal.timeout(240000)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a pesquisa.');
    render(data);
  } catch(error) {
    setStatus(error.name==='TimeoutError' ? 'A pesquisa excedeu o tempo de espera. Tente novamente.' : error.message || 'Falha de conexão.', 'error');
    $('empty-state').hidden=false;
  } finally {$('search-button').disabled=false;}
});
checkHealth();
