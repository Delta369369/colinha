# Memoriza Voto

Site estático para selecionar candidatos por cargo e gerar um cartão de estudo único. **Ferramenta de estudo. Não utilize durante a votação.**

## Executar

Na pasta do projeto: `python -m http.server 8000`. Abra `http://localhost:8000`. Nenhuma instalação ou etapa de compilação é necessária.

## Publicar no GitHub Pages

Em **Settings → Pages → Build and deployment**, escolha **GitHub Actions**. O workflow `Pages` publica os arquivos estáticos quando há um push na branch `main`; também permite execução manual em **Actions → Pages → Run workflow**. O endereço esperado é `https://delta369369.github.io/colinha/` após uma implantação bem-sucedida.

## Dados e fotografias

`candidates.json` contém 433 registros: 138 para deputado federal, 267 para deputado estadual, 10 para senador, 6 para governador e 12 para presidente. As relações do TRE-MT têm referência de **11/09/2026**; a relação presidencial tem referência de **02/10/2026**, com fonte por registro. Esses são registros de referência, e **não uma garantia de candidatura apta na data do voto**. Conferir substituições, renúncias e situação atual no DivulgaCandContas antes de divulgar o site como uma relação atualizada.

As fontes do TRE-MT estão em `build-data.py`. Execute `python build-data.py` para importar novamente essas páginas; isso não atualiza a data original da fonte nem verifica a situação de cada candidatura. Os registros presidenciais precisam de revisão específica. A data indicada na interface e na exportação deve acompanhar qualquer atualização das fontes.

A consulta automatizada ao endpoint de candidatos do TSE foi bloqueada (HTTP 403). Portanto, a primeira versão usa miniaturas com iniciais e **não inclui fotos reais**. O campo `photo` de cada registro aceita um caminho relativo para uma fotografia oficial previamente verificada. Prefira fotos no próprio repositório: imagens externas sem CORS podem impedir exportação pelo canvas. Não associar fotos por mera semelhança de nomes.

## Funcionalidades

- Busca por nome, sem distinção de acentos, ou por número; sugestões com miniatura e identificação do cargo.
- Navegação das sugestões com setas, Enter e Escape.
- Dois senadores diferentes; cartão liberado apenas após selecionar todos os campos.
- Alterar um campo invalida o cartão anterior, evitando exportação de escolhas desatualizadas.
- Escolhas salvas no `localStorage` do navegador; sem conta ou envio a servidor.
- Copiar texto, copiar PNG, baixar PNG e compartilhar PNG pelo menu nativo.
- Quando o navegador não oferece a função de compartilhar ou copiar imagem, o PNG é baixado com instruções para anexá-lo no WhatsApp.
- Escolher o local de salvamento depende de `showSaveFilePicker`. Outros navegadores usam o download padrão.
- A advertência e as datas de referência estão incorporadas à imagem.

HTTPS é necessário para clipboard e compartilhamento nativo; localhost costuma ser tratado como contexto seguro. A disponibilidade varia entre navegadores e sistemas. Fontes web do Google têm fallback local em Arial; o cartão exportado usa Arial para renderização consistente.
