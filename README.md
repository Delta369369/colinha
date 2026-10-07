# Busca Visual

Site de busca reversa de imagens com contexto textual opcional. Uma consulta visual ampla é preservada; quando existe palavra-chave, uma segunda consulta usa imagem + texto. Resultados são unidos e links repetidos são removidos. Português recebe preferência, sem exclusão de outros idiomas, países ou domínios.

## O que está implementado

- Interface responsiva, upload por clique/arraste, prévia, palavra-chave e preferência de idioma.
- Backend Node.js 22+, sem dependências de terceiros, com adaptador Google Lens via SerpApi.
- Deduplicação de URLs (fragmentos e parâmetros de rastreamento), preservando parâmetros significativos.
- Ranking por posição do buscador, presença nas duas consultas, palavras no título/texto, português e pequeno bônus para `.br`. Não é uma probabilidade de identidade nem de localização. A posição original é preservada por consulta.
- Leitura de páginas públicas para estimativa conservadora de português/inglês/espanhol pelo texto. Se ambíguo, usa o idioma declarado no HTML quando há texto suficiente. Sem leitura ou texto suficiente, mantém “idioma não determinado”. Não diferencia confiavelmente português brasileiro de europeu, não executa JavaScript e não usa domínio para determinar idioma.
- Resultado parcial quando uma das consultas falha; mensagem de erro quando ambas falham.
- Autenticação por token compartilhado, CORS por lista de origens, limite de cinco consultas por minuto por IP e três buscas simultâneas por processo.
- URLs das páginas são validadas contra endereços internos; DNS é validado e fixado à conexão, incluindo redirecionamentos. Leitura limitada a HTML, 250 KB e cinco segundos por requisição.

## Executar

```bash
cp .env.example .env
# Edite .env antes de pesquisar
npm start
```

Abra `http://localhost:8080`. A interface funciona sem chave, mas não simula resultados e exibe a configuração pendente. Para consultas reais:

1. Configure `SERPAPI_API_KEY` somente no backend.
2. Gere um `SEARCH_ACCESS_TOKEN` com no mínimo 24 caracteres aleatórios. O token compartilhado é adequado a um piloto restrito; não substitui autenticação individual para uso multiusuário.
3. Configure `PUBLIC_BASE_URL` com a URL HTTPS pública do backend. A SerpApi precisa acessar o caminho `/api/images/<token>`, que não deve exigir autenticação do proxy. Um localhost sem URL pública não pode fornecer a imagem ao provedor.
4. Configure `ALLOWED_ORIGINS` (origens completas, sem caminho). Para GitHub Pages: `https://delta369369.github.io`.
5. Na interface, clique em **Configurar conexão**, informe a URL do backend e o token. O endereço é salvo no navegador; o token fica apenas na memória da aba. Não informe a chave SerpApi na interface.

## Hospedagem

O workflow testa o código e publica **somente `frontend/`** em GitHub Pages. Node.js não é executado pelo Pages. O backend precisa de uma hospedagem separada que aceite Node.js ou Docker, HTTPS e requisições de até quatro minutos. Alternativamente, o backend serve a própria interface no mesmo domínio.

```bash
docker build -t busca-visual .
docker run --rm --env-file .env -p 8080:8080 busca-visual
```

Coloque um proxy HTTPS na frente do backend. Configure o limite de corpo do proxy para pelo menos 7 MB. Não registre corpos, cabeçalhos Authorization ou caminhos `/api/images/` nos logs do proxy. Atrás de um proxy, o limitador atual agrupa usuários pelo IP do proxy; para escalar, implemente rate limiting no proxy com política explícita de IP confiável. Não há confiança automática em `X-Forwarded-For`.

Não use múltiplas réplicas sem adaptar o armazenamento temporário: a imagem fica na memória do processo que recebeu a consulta. Uma segunda réplica não tem essa imagem.

## Configuração

| Variável | Uso |
|---|---|
| `PORT` | Porta do servidor, padrão 8080 |
| `SERPAPI_API_KEY` | Chave do provedor; obrigatória para pesquisar |
| `PUBLIC_BASE_URL` | URL HTTPS pública que a SerpApi consegue acessar |
| `SEARCH_ACCESS_TOKEN` | Token de acesso ao backend; mínimo 24 caracteres |
| `ALLOWED_ORIGINS` | Origens permitidas, separadas por vírgula |
| `SERPAPI_ZERO_TRACE` | `true` somente quando disponível no plano Enterprise |
| `MAX_RESULTS` | Máximo de links apresentados, padrão 40, teto 100 |
| `LANGUAGE_CHECK_LIMIT` | Limite de páginas analisadas, padrão 40, teto 100 |

Para fixar o backend na interface, edite `frontend/config.js`. Esse arquivo é público e nunca deve conter segredos.

## Imagens, retenção e fontes externas

O backend aceita JPEG, PNG, WebP ou GIF de até 5 MB e verifica sua assinatura. Não reprocessa o arquivo nem remove EXIF: metadados podem ser enviados ao provedor. Não grava upload, páginas ou resultados em disco; usa um link aleatório de 256 bits, disponível a quem conhecer o endereço. Remove a imagem ao finalizar a consulta ou quando o prazo de três minutos expira (limpeza periódica a cada 30 segundos; o endpoint recusa imagens expiradas imediatamente).

Essa exclusão é local. Não garante exclusão da cópia acessada por SerpApi/Google. A documentação de segurança da SerpApi informa expiração padrão de dados de pesquisa após 31 dias. ZeroTrace é Enterprise e possui condições/exceções legais; não foi validado com uma conta real. `no_cache=true` força nova consulta e **não** significa ausência de retenção. Confira a política do seu contrato antes de enviar arquivos sensíveis.

- [Google Lens API e parâmetros](https://serpapi.com/google-lens-api)
- [Segurança e retenção](https://serpapi.com/security)
- [ZeroTrace](https://serpapi.com/zero-trace-mode)
- [Termos, privacidade e retenção](https://serpapi.com/legal)

Com palavra-chave, são feitas duas consultas ao provedor; sem palavra-chave, uma. As consultas podem consumir cota/custo. A busca depende da cobertura do Google Lens e não faz varredura direta completa de redes sociais. Miniaturas são carregadas de sites externos no navegador ao exibir os resultados. Leia a fonte para avaliar o contexto: semelhança visual não comprova identidade ou localização.

## API

- `GET /api/health`: estado de configuração, sem segredos.
- `POST /api/search`: `Authorization: Bearer <SEARCH_ACCESS_TOKEN>` e JSON com `imageBase64` (base64 puro), `keyword` opcional, `preferPortuguese` booleano e `externalProcessingAccepted: true`.
- `GET /api/images/<token>`: acesso temporário ao upload, para o provedor.

Resposta: `results`, `warnings`, `queries`, `successfulQueries`, `provider`, `checkedAt`. Cada resultado traz `link`, `title`, `source`, `thumbnail`, `language`, `languageMethod`, `origins`, `positions` e `keywordMatch`. Nenhum score é apresentado como precisão biométrica/geográfica.

## Verificação

```bash
npm run check
npm test
```

Os testes usam provedor simulado e servidor HTTP local: validam união das duas buscas, consulta única, falha parcial/total, ranking, detecção de idioma, URLs, autenticação, CORS, entrega temporária e exclusão da imagem. Uma pesquisa real precisa da chave e da hospedagem pública do backend, ainda não fornecidas.
