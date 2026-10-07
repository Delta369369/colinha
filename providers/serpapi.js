export class ProviderError extends Error {}

export class SerpApiProvider {
  constructor({ apiKey, zeroTrace = false, fetchImpl = fetch }) {
    this.apiKey = apiKey; this.zeroTrace = zeroTrace; this.fetch = fetchImpl;
  }
  async search(imageUrl, keyword = '') {
    const params = new URLSearchParams({engine: 'google_lens', url: imageUrl,
      type: 'visual_matches', hl: 'pt', api_key: this.apiKey, no_cache: 'true'});
    if (keyword) params.set('q', keyword);
    if (this.zeroTrace) params.set('zero_trace', 'true');
    try {
      const response = await this.fetch(`https://serpapi.com/search.json?${params}`, {
        signal: AbortSignal.timeout(65000), redirect: 'error'
      });
      if (!response.ok) throw new ProviderError('O provedor recusou a consulta. Verifique sua chave e cota no painel SerpApi.');
      const data = await response.json();
      if (data.error || data.search_metadata?.status === 'Error')
        throw new ProviderError('O provedor não concluiu a consulta. Verifique sua chave e cota no painel SerpApi.');
      return Array.isArray(data.visual_matches) ? data.visual_matches : [];
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError('Não foi possível consultar o provedor agora. Tente novamente.');
    }
  }
}
