const TMDB_API_KEY = '68e094699525b18a70bab2f86b1fa706';
const TORRENTIO_API = 'https://torrentio.strem.io';

// Reduzimos os trackers aos 4 essenciais do original para não estourar o limite da URL do player
const TRACKERS = [
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://open.stealth.si:80/announce",
  "udp://tracker.torrent.eu.org:451/announce",
  "udp://exodus.desync.com:6969/announce"
];
const trackersString = TRACKERS.map(tr => `tr=${encodeURIComponent(tr)}`).join('&');

async function getStreams(id, type, season, episode) {
  try {
    let imdbId = id;
    
    // Tenta converter o ID se não for padrão IMDB (tt...)
    if (id && !String(imdbId).startsWith('tt')) {
      try {
        const tmdbUrl = `https://api.themoviedb.org/3/${type}/${id}/external_ids?api_key=${TMDB_API_KEY}&language=pt-BR`;
        const tmdbRes = await fetch(tmdbUrl, { skipSizeCheck: true });
        const tmdbData = await tmdbRes.json();
        imdbId = tmdbData.imdb_id || tmdbData.external_ids?.imdb_id || id;
      } catch (err) {
        // Se falhar, segue em frente silenciosamente, não quebra o script
      }
    }
    
    // Se no fim das contas não tivermos um ID válido, encerra a busca.
    if (!imdbId || !String(imdbId).startsWith('tt')) return [];

    const isTv = (type === 'tv' && season != null && episode != null);
    const url = isTv
      ? `${TORRENTIO_API}/stream/series/${imdbId}:${season}:${episode}.json`
      : `${TORRENTIO_API}/stream/movie/${imdbId}.json`;
      
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36', 'Accept': '*/*' },
      skipSizeCheck: true
    });
    
    const data = await response.json();
    if (!data || !data.streams) return [];

    const results = [];

    // Processa os links
    for (const torrent of data.streams) {
      if (!torrent.infoHash) continue;
      
      // Torrentio divide as informações. Precisamos juntar 'name' e 'title' para fazer o match.
      const tName = torrent.name || '';
      const tTitle = torrent.title || '';
      const fullText = `${tName} ${tTitle}`.toLowerCase();
      
      let quality = '720p';
      if (fullText.includes('2160p') || fullText.includes('4k')) quality = '4K';
      else if (fullText.includes('1080p')) quality = '1080p';
      else if (fullText.includes('480p')) quality = '480p';

      let lang = 'indefinido';
      const ptKeys = ['1-sf', '0-sf', 'dual', 'brazilian', 'portuguese', 'português', 'pt-br', 'pt-pt', 'pob', 'por', 'dublado', 'nacional'];
      
      for (const key of ptKeys) {
        if (fullText.includes(key)) {
          lang = 'português';
          break;
        }
      }
      
      if (lang === 'indefinido') {
        if (fullText.includes('english') || fullText.includes('eng')) lang = 'english';
        if (fullText.includes('spanish') || fullText.includes('español')) lang = 'spanish';
      }

      // Regex flexível procurando pelos emojis ou a palavra 'seeders' na string combinada
      const seederMatch = fullText.match(/(?:👤|👥|seeders:?)\s*(\d+)/i);
      const seeders = seederMatch ? parseInt(seederMatch[1], 10) : 0;
      
      const magnetUrl = `magnet:?xt=urn:btih:${torrent.infoHash}&${trackersString}`;
      const langIcon = lang === 'português' ? '🇧🇷' : '🌐';

      results.push({
        _lang: lang,
        _q: quality,
        _s: seeders,
        url: magnetUrl,
        quality: quality,
        title: `${langIcon} ${quality} | ${lang} | 👤 ${seeders}`,
        subtitles: []
      });
    }

    // Ordenação robusta
    results.sort((a, b) => {
      if (a._lang === 'português' && b._lang !== 'português') return -1;
      if (a._lang !== 'português' && b._lang === 'português') return 1;
      
      const qOrder = { '4K': 0, '1080p': 1, '720p': 2, '480p': 3 };
      const aQ = qOrder[a._q] || 99;
      const bQ = qOrder[b._q] || 99;
      if (aQ !== bQ) return aQ - bQ;
      
      return b._s - a._s;
    });

    // Filtra para enviar no máximo 25 resultados e limpa as chaves temporárias ('_lang', '_q', '_s')
    return results.slice(0, 25).map(r => ({
      url: r.url,
      quality: r.quality,
      title: r.title,
      subtitles: r.subtitles
    }));

  } catch (error) {
    return [];
  }
}

module.exports = { getStreams };
