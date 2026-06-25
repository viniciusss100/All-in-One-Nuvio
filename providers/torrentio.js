// Nuvio Provider - PT-BR Prioritário
// Adaptado para o motor nativo do Nuvio (usando Fetch API no lugar do Axios)
// Com detecção de português, otimização de Trackers, Cache TMDB e ordenação.

const TMDB_API_KEY = '68e094699525b18a70bab2f86b1fa706';
const TORRENTIO_API = 'https://torrentio.strem.io';

// Cache em memória para evitar limite no TMDB
const imdbCache = new Map();

// Trackers Extras
const EXTRA_TRACKERS = [
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://open.stealth.si:80/announce",
  "udp://open.demonii.com:1337/announce",
  "udp://open.tracker.cl:1337/announce",
  "udp://exodus.desync.com:6969/announce",
  "udp://tracker.torrent.eu.org:451/announce",
  "udp://tracker.dler.org:6969/announce",
  "udp://p4p.arenabg.com:1337/announce",
  "udp://wepzone.net:6969/announce",
  "http://tracker.bt4g.com:2095/announce",
  "udp://tracker.filemail.com:6969/announce",
  "udp://tracker-udp.gbitt.info:80/announce",
  "https://tracker.ghostchu-services.top:443/announce",
];

const trackersString = EXTRA_TRACKERS.map(tr => `tr=${encodeURIComponent(tr)}`).join('&');

function detectLanguage(title = '') {
  if (!title) return 'indefinido';
  const lowerTitle = title.toLowerCase();
  
  const portugueseKeywords = ['1-sf', '0-sf', 'dual-', 'brazilian', 'portuguese', 'português', 'pt-br', 'pt-pt', 'pob', 'por'];
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

function extractSeeders(title = '') {
  const match = title.match(/(?:👤|👥|Seeders:?)\s*(\d+)/i);
  return match ? parseInt(match[1], 10) : 0;
}

// Requisição TMDB usando Fetch nativo
async function getImdbId(movieId, type) {
  const cacheKey = `${type}_${movieId}`;
  
  if (imdbCache.has(cacheKey)) {
    return imdbCache.get(cacheKey);
  }

  try {
    const url = `https://api.themoviedb.org/3/${type}/${movieId}/external_ids?api_key=${TMDB_API_KEY}&language=pt-BR`;
    
    const response = await fetch(url);
    if (!response.ok) return null;
    
    const data = await response.json();
    const imdbId = data?.external_ids?.imdb_id || data?.imdb_id || null;
    
    if (imdbId) {
      imdbCache.set(cacheKey, imdbId);
    }
    
    return imdbId;
  } catch (error) {
    console.log('[NUVIO-PT] TMDB Erro:', error.message);
    return null;
  }
}

// Requisição Torrentio usando Fetch nativo
async function searchTorrentio(imdbId, season = null, episode = null) {
  try {
    if (!imdbId) return [];
    
    const hasSeasonEpisode = season != null && episode != null;
    const url = hasSeasonEpisode
      ? `${TORRENTIO_API}/stream/series/${imdbId}:${season}:${episode}.json`
      : `${TORRENTIO_API}/stream/movie/${imdbId}.json`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) return [];
    
    const data = await response.json();
    if (!data || !data.streams) {
      return [];
    }
    
    const streams = [];
    
    for (const torrent of data.streams) {
      try {
        const title = torrent.title || '';
        const quality = extractQuality(title);
        const seeders = extractSeeders(title);
        const language = detectLanguage(title);
        const infoHash = torrent.infoHash;
        
        if (!infoHash) continue;
        
        const languageIcon = language === 'português' ? '🇧🇷' : '🌐';
        const magnetUrl = `magnet:?xt=urn:btih:${infoHash}&${trackersString}`;
        
        streams.push({
          title: `${languageIcon} [${quality}] | ${language} | 👤 ${seeders}`,
          url: magnetUrl,
          lang: language,
          quality: quality,
          seeders: seeders
        });
      } catch (err) {
        // ignora e continua
      }
    }
    
    // ORDENAÇÃO INTELIGENTE
    streams.sort((a, b) => {
      const aIsPortuguese = a.lang === 'português' ? 0 : 1;
      const bIsPortuguese = b.lang === 'português' ? 0 : 1;
      if (aIsPortuguese !== bIsPortuguese) return aIsPortuguese - bIsPortuguese;
      
      const qualityOrder = { '4K': 0, '1080p': 1, '720p': 2, '480p': 3 };
      const aQuality = qualityOrder[a.quality] || 999;
      const bQuality = qualityOrder[b.quality] || 999;
      if (aQuality !== bQuality) return aQuality - bQuality;
      
      return b.seeders - a.seeders;
    });
    
    return streams;
    
  } catch (error) {
    console.log('[NUVIO-PT] Torrentio Erro:', error.message);
    return [];
  }
}

module.exports = {
  meta: {
    id: 'nuvio-pt-br',
    name: '🇧🇷 Nuvio PT-BR Prioritário',
    description: 'Provedor com Torrentio, prioridade PT-BR e Múltiplos Trackers.',
    version: '1.1.0',
    author: 'Vinicius',
    icon: 'https://i.postimg.cc/ZRYTCy0T/torrentio.png',
    supportedTypes: ['movie', 'tv'],
    contentLanguage: ['pt-BR', 'en']
  },
  
  async search(query, type, tmdbId, imdbId, season = null, episode = null) {
    try {
      let id = imdbId;
      
      if (!id && tmdbId) {
        id = await getImdbId(tmdbId, type);
      }
      
      if (!id) {
        return [];
      }
      
      return await searchTorrentio(id, type === 'tv' ? season : null, type === 'tv' ? episode : null);
      
    } catch (error) {
      console.log('[NUVIO-PT] Search Error:', error.message);
      return [];
    }
  }
};
