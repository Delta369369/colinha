# Memorize Já

Site estático para selecionar candidatos por cargo e gerar um cartão de estudo único. **Ferramenta de estudo. Não utilize durante a votação.**

## Executar

Na pasta do projeto: `python -m http.server 8000`. Abra `http://localhost:8000`. Nenhuma instalação ou etapa de compilação é necessária.

## Publicar no GitHub Pages

Em **Settings → Pages → Build and deployment**, escolha **GitHub Actions**. O workflow `Pages` publica os arquivos estáticos quando há um push na branch `main`; também permite execução manual em **Actions → Pages → Run workflow**. O endereço esperado é `https://delta369369.github.io/colinha/` após uma implantação bem-sucedida.

## Dados e fotografias

`candidates.json` contém 433 registros: 138 para deputado federal, 267 para deputado estadual, 10 para senador, 6 para governador e 12 para presidente. As relações do TRE-MT têm referência de **11/09/2026**; a relação presidencial tem referência de **02/10/2026**, com fonte por registro. Esses são registros de referência, e **não uma garantia de candidatura apta na data do voto**. Conferir substituições, renúncias e situação atual no DivulgaCandContas antes de divulgar o site como uma relação atualizada.

As fontes do TRE-MT estão em `build-data.py`. Execute `python build-data.py` para importar novamente essas páginas; isso não atualiza a data original da fonte nem verifica a situação de cada candidatura. Os registros presidenciais precisam de revisão específica. A data indicada na interface e na exportação deve acompanhar qualquer atualização das fontes.

As fotos dos **421 candidatos de MT** foram obtidas do pacote oficial [MT — Fotos de candidatos do TSE](https://dadosabertos.tse.jus.br/pt_BR/dataset/candidatos-2026/resource/ce184315-269e-49fa-a0d7-fab95286e0f3). O recurso informa licença Creative Commons Atribuição. Crédito: **TSE — Portal de Dados Abertos**. Os JPEGs originais ficam em `assets/photos/mt/<identificador-TSE>.jpg`, sem alteração do arquivo; apenas o enquadramento visual das miniaturas e do cartão é aplicado. Também foram adicionadas as fotos oficiais dos 12 candidatos à Presidência existentes na base, provenientes do pacote BR do TSE e vinculadas ao SQ_CANDIDATO do CSV oficial de 2026.

`photo-credits.json` registra o vínculo entre identificador TSE, nome, cargo, número, caminho local e nome do arquivo no ZIP original. A fonte e o crédito também aparecem no site, no texto copiado e no cartão exportado. Se uma fotografia ficar indisponível, as iniciais continuam como fallback.

O cartão agora mede 1080 × 1030 pixels, com fundo escuro, destaques em verde, ciano e roxo, seis linhas compactas e números grandes.

## Funcionalidades

- Busca por nome, sem distinção de acentos, ou por número; sugestões com miniatura e identificação do cargo.
- Navegação das sugestões com setas, Enter e Escape.
- Dois senadores diferentes; cartão liberado apenas após selecionar todos os campos.
- Alterar um campo invalida o cartão anterior, evitando exportação de escolhas desatualizadas.
- Cada acesso, recarregamento ou retorno pelo histórico começa com os campos vazios. Escolhas anteriores do localStorage são apagadas; sem conta ou envio a servidor.
- Copiar texto, copiar PNG, baixar PNG e compartilhar PNG pelo menu nativo.
- Quando o navegador não oferece a função de compartilhar ou copiar imagem, o PNG é baixado com instruções para anexá-lo no WhatsApp.
- Escolher o local de salvamento depende de `showSaveFilePicker`. Outros navegadores usam o download padrão.
- A advertência e as datas de referência estão incorporadas à imagem.

HTTPS é necessário para clipboard e compartilhamento nativo; localhost costuma ser tratado como contexto seguro. A disponibilidade varia entre navegadores e sistemas. Fontes web do Google têm fallback local em Arial; o cartão exportado usa Arial para renderização consistente.
