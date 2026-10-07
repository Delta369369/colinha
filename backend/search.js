import {mergeResults, rankResults} from '../ranking/results.js';
import {enrichLanguages} from './pages.js';

export async function searchImage({provider, imageUrl, keyword = '', preferPortuguese = true,
  maxResults = 40, languageLimit = 40, readPage}) {
  const origins = keyword ? ['visual', 'keyword'] : ['visual'];
  const responses = await Promise.allSettled(origins.map(origin => provider.search(imageUrl, origin === 'keyword' ? keyword : '')));
  const batches = [], warnings = [];
  responses.forEach((response, index) => {
    if (response.status === 'fulfilled') batches.push({origin: origins[index], items: response.value});
    else warnings.push(`${origins[index] === 'visual' ? 'Busca visual' : 'Busca com palavra-chave'}: ${response.reason.message}`);
  });
  if (!batches.length) throw new Error(warnings.join(' '));
  let rows = rankResults(mergeResults(batches), keyword, false).slice(0, maxResults);
  await enrichLanguages(rows, {readPage, limit: languageLimit});
  rows = rankResults(rows, keyword, preferPortuguese).map(({excerpt, rankScore, ...row}) => row);
  return {results: rows, warnings, queries: origins.length, successfulQueries: batches.length,
    provider: 'Google Lens via SerpApi', checkedAt: new Date().toISOString()};
}
