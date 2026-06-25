// Nuvio Provider - PT-BR Prioritário
// Corrigido: Bypass inteligente de TMDB e sanitização estrita para o Player.

const TMDB_API_KEY = '68e094699525b18a70bab2f86b1fa706';
const TORRENTIO_API = 'https://torrentio.strem.io';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  'Accept': '*/*'
};

const TRACKERS = [
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://open.stealth.si:80/announce",
  "udp://open.demonii.com:1337/announce",
  "udp://open.tracker.cl:1337/announce",
  "udp://exodus.desync.com:6969/announce",
  "udp://tracker.torrent.eu.org:451/announce",
  "udp://tracker.dler.org:6969/announce"
];

// Monta os Trackers no formato exigido pelo magnet
const trackersString = TRACKERS.map(tr => `tr=${encodeURIComponent(tr)}`).join('&');

function detectLanguage(title = '') {
  const lower = title.toLowerCase();
  const ptKeys = ['1-sf', '0-sf', 'dual-', 'brazilian', 'portuguese', 'português', 'pt-br', 'pt-pt', 'pob', 'por', 'dublado'];
  for (const key of ptKeys) {
    if (lower.includes(key)) return 'português';
  }
  if (lower.includes('english') || lower.includes('eng')) return 'english';
  if (lower.includes('spanish') || lower.includes('español')) return 'spanish';
  return 'indefinido';
}

function extractQuality(title = '') {
  const lower = title.toLowerCase();
  if (lower.includes('2160p') || lower.includes('4k')) return '4K';
  if (lower.includes('1080p')) return '1080p';
  if (lower.includes('720p')) return '720p';
  if (lower.includes('480p')) return '480p';
  return '720p';
}

async function getStreams(id, type, season, episode) {
  try {
    let imdbId = id;
    
    // CORREÇÃO 1: Se o ID recebido NÃO começar com 'tt', usamos o TMDB para converter.
    // Se já for 'tt...', pula essa etapa e vai direto baixar o torrent, economizando tempo.
    if (id && !String(id).startsWith('tt')) {
      const tmdbUrl = `https://api.themoviedb.org/3/${type}/${id}/external_ids?api_key=${TMDB_API_KEY}&language=pt-BR`;
      const tmdbRes = await fetch(tmdbUrl, { skipSizeCheck: true });
      if (tmdbRes.ok) {
        const tmdbData = await tmdbRes.json();
        imdbId = tmdbData?.external_ids?.imdb_id || tmdbData?.imdb_id || id;
      }
    }
    
    // Se, mesmo após a checagem, não tivermos um ID válido pro Torrentio, aborta
    if (!imdbId || !String(imdbId).startsWith('tt')) {
      return [];
    }

    const isTv = (type === 'tv' && season != null && episode != null);
    const url = isTv
      ? `${TORRENTIO_API}/stream/series/${imdbId}:${season}:${episode}.json`
      : `${TORRENTIO_API}/stream/movie/${imdbId}.json`;
      
    const response = await fetch(url, { headers: HEADERS, skipSizeCheck: true });
    if (!response.ok) return [];
    
    const data = await response.json();
    if (!data || !data.streams) return [];

    const tempStreams = [];

    // Pegamos os 20 primeiros retornos do Torrentio para processar
    for (const torrent of data.streams.slice(0, 20)) {
      if (!torrent.infoHash) continue;
      
      const title = torrent.title || '';
      const quality = extractQuality(title);
      const lang = detectLanguage(title);
      
      // Captura a quantidade de seeders para ordenarmos
      const seederMatch = title.match(/👤\s*(\d+)/);
      const seeders = seederMatch ? parseInt(seederMatch[1], 10) : 0;
      
      const magnetUrl = `magnet:?xt=urn:btih:${torrent.infoHash}&${trackersString}`;
      const langIcon = lang === 'português' ? '🇧🇷' : '🌐';

      // Usamos chaves ocultas (com underline _) temporariamente para facilitar a ordenação
      tempStreams.push({
        _lang: lang,
        _quality: quality,
        _seeders: seeders,
        url: magnetUrl,
        quality: quality,
        title: `${langIcon} [${quality}] | ${lang} | 👤 ${seeders}`,
        subtitles: []
      });
    }

    // Ordenação: 1º Português, 2º Melhor Qualidade, 3º Mais Seeders
    tempStreams.sort((a, b) => {
      if (a._lang === 'português' && b._lang !== 'português') return -1;
      if (a._lang !== 'português' && b._lang === 'português') return 1;
      
      const qOrder = { '4K': 0, '1080p': 1, '720p': 2, '480p': 3 };
      const aQ = qOrder[a._quality] || 99;
      const bQ = qOrder[b._quality] || 99;
      if (aQ !== bQ) return aQ - bQ;
      
      return b._seeders - a._seeders;
    });

    // CORREÇÃO 2: Limpa o array, removendo as variáveis temporárias.
    // O Nuvio exige estritamente apenas as chaves (url, quality, title, subtitles).
    const finalStreams = tempStreams.map(stream => ({
      url: stream.url,
      quality: stream.quality,
      title: stream.title,
      subtitles: stream.subtitles
    }));

    return finalStreams;
  } catch (error) {
    return [];
  }
}

// O Motor do Nuvio espera esta exportação exata
module.exports = {
  getStreams: getStreams
};
