// Nuvio Provider - PT-BR Prioritário
// Código limpo (sem ofuscação) e 100% compatível com a engine do Nuvio.

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

// Monta os Trackers no formato para URL
const trackersString = TRACKERS.map(tr => `tr=${encodeURIComponent(tr)}`).join('&');

// Detecta se é dublado/português baseado nas keywords comuns de torrents
function detectLanguage(title = '') {
  if (!title) return 'indefinido';
  const lowerTitle = title.toLowerCase();
  
  const portugueseKeywords = ['1-sf', '0-sf', 'dual-', 'brazilian', 'portuguese', 'português', 'pt-br', 'pt-pt', 'pob', 'por', 'dublado', 'nacional'];
  for (const keyword of portugueseKeywords) {
    if (lowerTitle.includes(keyword)) return 'português';
  }
  
  if (lowerTitle.includes('english') || lowerTitle.includes('eng')) return 'english';
  if (lowerTitle.includes('spanish') || lowerTitle.includes('español')) return 'spanish';
  
  return 'indefinido';
}

function extractQuality(title = '') {
  const lowerTitle = title.toLowerCase();
  if (lowerTitle.includes('2160p') || lowerTitle.includes('4k')) return '4K';
  if (lowerTitle.includes('1080p')) return '1080p';
  if (lowerTitle.includes('720p')) return '720p';
  if (lowerTitle.includes('480p')) return '480p';
  return '720p';
}

function buildMagnet(infoHash) {
  if (!infoHash) return '';
  return `magnet:?xt=urn:btih:${infoHash}&${trackersString}`;
}

// O código ofuscado original extraía o ID usando fetch nativo na API do TMDB
async function getImdbId(tmdbId, type) {
  try {
    const url = `https://api.themoviedb.org/3/${type}/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}&language=pt-BR`;
    const response = await fetch(url, { skipSizeCheck: true });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    return data?.external_ids?.imdb_id || data?.imdb_id || null;
  } catch (error) {
    console.log('[TMDB] Erro ao buscar ID:', error);
    return null;
  }
}

async function invokeTorrentio(imdbId, season = null, episode = null) {
  try {
    const isTv = season != null && episode != null;
    const url = isTv
      ? `${TORRENTIO_API}/stream/series/${imdbId}:${season}:${episode}.json`
      : `${TORRENTIO_API}/stream/movie/${imdbId}.json`;
      
    console.log('[TORRENTIO] Requesting:', url);

    const response = await fetch(url, { headers: HEADERS, skipSizeCheck: true });
    
    if (!response.ok) return [];
    
    const data = await response.json();
    
    if (!data || !data.streams) {
      console.log('[TORRENTIO] No streams found');
      return [];
    }

    const streams = [];

    // Processa os primeiros 20 resultados (o original pegava 15)
    for (const torrent of data.streams.slice(0, 20)) {
      try {
        const title = torrent.title || '';
        const quality = extractQuality(title);
        
        // Match seguro para seeders
        const seederMatch = title.match(/(?:👤|👥|Seeders:?)\s*(\d+)/i);
        const seeders = seederMatch ? parseInt(seederMatch[1], 10) : 0;
        
        const language = detectLanguage(title);
        const magnetUrl = buildMagnet(torrent.infoHash);

        if (!magnetUrl) continue;

        const langIcon = language === 'português' ? '🇧🇷' : '🌐';

        streams.push({
          url: magnetUrl,
          quality: quality,
          lang: language,
          seeders: seeders,
          title: `${langIcon} ${quality} | ${language} | 👤 ${seeders}`,
          subtitles: [] // Opcional, exigido pela arquitetura original ofuscada
        });
      } catch (err) {
        // Ignora erros individuais de loop
      }
    }

    // Ordenação: 1º PT-BR, 2º Qualidade, 3º Seeders
    streams.sort((a, b) => {
      const aIsPt = a.lang === 'português' ? 0 : 1;
      const bIsPt = b.lang === 'português' ? 0 : 1;
      if (aIsPt !== bIsPt) return aIsPt - bIsPt;
      
      const qOrder = { '4K': 0, '1080p': 1, '720p': 2, '480p': 3 };
      const aQ = qOrder[a.quality] || 999;
      const bQ = qOrder[b.quality] || 999;
      if (aQ !== bQ) return aQ - bQ;
      
      return b.seeders - a.seeders;
    });

    return streams;
  } catch (error) {
    console.log('[TORRENTIO] Fetch Error:', error);
    return [];
  }
}

// A EXPORTAÇÃO EXATA QUE O MOTOR DO NUVIO ESPERA
async function getStreams(tmdbId, type, season, episode) {
  try {
    const imdbId = await getImdbId(tmdbId, type);
    if (!imdbId) {
      console.log('[NUVIO] Falha ao obter IMDB ID');
      return [];
    }
    
    console.log('[NUVIO] IMDB ID:', imdbId);
    
    const streams = await invokeTorrentio(imdbId, type === 'tv' ? season : null, type === 'tv' ? episode : null);
    return streams;
  } catch (error) {
    console.log('[NUVIO] Erro Crítico:', error);
    return [];
  }
}

module.exports = {
  getStreams: getStreams
};
