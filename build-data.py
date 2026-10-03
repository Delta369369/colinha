import urllib.request,re,json,html,concurrent.futures
from pathlib import Path
BASE='https://www.tre-mt.jus.br/comunicacao/noticias/2026/Setembro/eleicoes-2026-candidatos-ao-cargo-de-'
def read(kind):
 url=BASE+kind
 raw=urllib.request.urlopen(url,timeout=45).read().decode()
 rows=[]
 for a in re.findall(r'<a\b[^>]*href="(https://divulgacandcontas[^\"]+)"[^>]*>(.*?)</a>',raw,re.S):
  num=re.search(r'<b[^>]*>(\d+)</b>',a[1]);name=re.search(r'<strong[^>]*>(.*?)</strong>',a[1],re.S);party=re.search(r'<small[^>]*>(.*?)\s*[\xa0 ]*•',a[1],re.S)
  if num and name: rows.append(dict(number=num[1],name=html.unescape(re.sub('<[^>]+>','',name[1])).strip(),party=html.unescape(re.sub('<[^>]+>','',party[1])).strip() if party else '',office={'deputado-estadual':'estadual','deputado-federal':'federal','senador-a':'senador','governador-a':'governador'}[kind],state='MT',photo=None,source=a[0],referenceDate='2026-09-11'))
 return rows
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex: data=sum(list(ex.map(read,['deputado-estadual','deputado-federal','senador-a','governador-a'])),[])
for num,name,party in [('13','LULA','PT'),('14','RENAN SANTOS','MISSÃO'),('16','HERTZ DIAS','PSTU'),('21','EDMILSON COSTA','PCB'),('22','FLÁVIO BOLSONARO','PL'),('27','CLARIANA BARÃO','DC'),('29','RUI COSTA PIMENTA','PCO'),('30','ROMEU ZEMA','NOVO'),('35','WILSON GRASSI','DEMOCRATA'),('55','RONALDO CAIADO','PSD'),('70','AUGUSTO CURY','AVANTE'),('80','SAMARA MARTINS','UP')]:
 data.append(dict(number=num,name=name,party=party,office='presidente',state='BR',photo=None,source='https://noticias.uol.com.br/eleicoes/2026/10/02/qual-o-numero-de-lula-e-dos-demais-candidatos-a-presidente-em-2026.ghtm',referenceDate='2026-10-02'))
parties={'10':'REPUBLICANOS','11':'PP','12':'PDT','13':'PT','14':'MISSÃO','15':'MDB','16':'PSTU','18':'REDE','20':'PODEMOS','21':'PCB','22':'PL','23':'CIDADANIA','25':'PRD','27':'DC','29':'PCO','30':'NOVO','35':'DEMOCRATA','36':'AGIR','40':'PSB','43':'PV','44':'UNIÃO BRASIL','45':'PSDB','50':'PSOL','55':'PSD','65':'PCdoB','70':'AVANTE','77':'SOLIDARIEDADE','80':'UP'}
for c in data:
 c['party']=parties.get(c['number'][:2],c['party'])
 m=re.search(r'/20322002026/(\d+)/2026/MT',c['source']) if c['state']=='MT' else None
 if m:
  cid=m[1]; c['tseId']=cid
  if Path(__file__).with_name('assets').joinpath('photos','mt',cid+'.jpg').exists():
   c['photo']='assets/photos/mt/'+cid+'.jpg'
   c['photoCredit']='TSE — Portal de Dados Abertos'
   c['photoSource']='https://dadosabertos.tse.jus.br/pt_BR/dataset/candidatos-2026/resource/ce184315-269e-49fa-a0d7-fab95286e0f3'
Path(__file__).with_name('candidates.json').write_text(json.dumps({'election':2026,'notice':'Relações de referência; confira a situação atual no TSE.','candidates':data},ensure_ascii=False,indent=2))
print({office:sum(c['office']==office for c in data) for office in set(c['office'] for c in data)})
