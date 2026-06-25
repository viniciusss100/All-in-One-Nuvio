// Nuvio Provider - PT-BR Prioritário (Baseado em D3adlyRocket/All-in-One-Nuvio)
// Com detecção de português, otimização de Trackers, Cache TMDB e ordenação inteligente.

const axios = require('axios');

// Configurações e Chaves
const TMDB_API_KEY = '68e094699525b18a70bab2f86b1fa706';
const TORRENTIO_API = 'https://torrentio.strem.io';

// Cache simples em memória para não esgotar o limite de requisições do TMDB
const imdbCache = new Map();

// Trackers extras fornecidos
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

// Mapeia os trackers para uso seguro na URL do Magnet Link
const trackersString = EXTRA_TRACKERS.map(tr => `tr=${encodeURIComponent(tr)}`).join('&');

// Detecta português pelas keywords do Nuvio e Torrentio
function detectLanguage(title = '') {
  if (!title) return 'indefinido';
  
  const lowerTitle = title.toLowerCase();
  
  const portugueseKeywords = [
    '1-sf', '0-sf', 'dual-', 'brazilian', 'portuguese', 'português', 'pt-br', 'pt-pt', 'pob', 'por'
  ];
  
  for (const keyword of portugueseKeywords) {
    if (lowerTitle.includes(keyword)) return 'português';
  }
  
  if (lowerTitle.includes('english') || lowerTitle.includes('eng')) return 'english';
  if (lowerTitle.includes('spanish') || lowerTitle.includes('español')) return 'spanish';
  
  return 'indefinido';
}

// Extrai qualidade
function extractQuality(title = '') {
  const lowerTitle = title.toLowerCase();
  
  if (lowerTitle.includes('2160p') || lowerTitle.includes('4k')) return '4K';
  if (lowerTitle.includes('1080p')) return '1080p';
  if (lowerTitle.includes('720p')) return '720p';
  if (lowerTitle.includes('480p')) return '480p';
  
  return '720p'; // Fallback
}

// Extrai seeders (Versão Resiliente: suporta diferentes emojis e a palavra Seeders)
function extractSeeders(title = '') {
  const match = title.match(/(?:👤|👥|Seeders:?)\s*(\d+)/i);
  return match ? parseInt(match[1], 10) : 0;
}

// Busca TMDB para get IMDB ID (Com Cache em memória)
async function getImdbId(movieId, type) {
  const cacheKey = `${type}_${movieId}`;
  
  // Retorna do cache se já tivermos buscado esse filme/série na sessão
  if (imdbCache.has(cacheKey)) {
    return imdbCache.get(cacheKey);
  }

  try {
    const url = `https://api.themoviedb.org/3/${type}/${movieId}/external_ids?api_key=${TMDB_API_KEY}&language=pt-BR`;
    const response = await axios.get(url, { timeout: 5000 });
    
    const imdbId = response.data?.external_ids?.imdb_id || response.data?.imdb_id || null;
    
    if (imdbId) {
      imdbCache.set(cacheKey, imdbId); // Salva no cache
    }
    
    return imdbId;
  } catch (error) {
    console.log('[NUVIO-PT] TMDB Erro:', error.message);
    return null;
  }
}

// Busca Torrentio e processa Streams
async function searchTorrentio(imdbId, season = null, episode = null) {
  try {
    if (!imdbId) return [];
    
    const hasSeasonEpisode = season != null && episode != null;
    const url = hasSeasonEpisode
      ? `${TORRENTIO_API}/stream/series/${imdbId}:${season}:${episode}.json`
      : `${TORRENTIO_API}/stream/movie/${imdbId}.json`;
    
    const response = await axios.get(url, {
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    
    if (!response.data || !response.data.streams) {
      return [];
    }
    
    const streams = [];
    
    for (const torrent of response.data.streams) {
      try {
        const title = torrent.title || '';
        const quality = extractQuality(title);
        const seeders = extractSeeders(title);
        const language = detectLanguage(title);
        const infoHash = torrent.infoHash;
        
        if (!infoHash) continue;
        
        const languageIcon = language === 'português' ? '🇧🇷' : '🌐';
        
        // Gera o Magnet Link combinando o InfoHash com a sua lista de Trackers Extras
        const magnetUrl = `magnet:?xt=urn:btih:${infoHash}&${trackersString}`;
        
        streams.push({
          title: `${languageIcon} [${quality}] | ${language} | 👤 ${seeders}`,
          url: magnetUrl,
          lang: language,
          quality: quality,
          seeders: seeders
        });
      } catch (err) {
        // Ignora streams inválidos e continua
      }
    }
    
    // ORDENAÇÃO INTELIGENTE
    streams.sort((a, b) => {
      // 1º: Português primeiro
      const aIsPortuguese = a.lang === 'português' ? 0 : 1;
      const bIsPortuguese = b.lang === 'português' ? 0 : 1;
      if (aIsPortuguese !== bIsPortuguese) return aIsPortuguese - bIsPortuguese;
      
      // 2º: Qualidade (4K > 1080p > 720p)
      const qualityOrder = { '4K': 0, '1080p': 1, '720p': 2, '480p': 3 };
      const aQuality = qualityOrder[a.quality] || 999;
      const bQuality = qualityOrder[b.quality] || 999;
      if (aQuality !== bQuality) return aQuality - bQuality;
      
      // 3º: Seeders (mais seeders = melhor)
      return b.seeders - a.seeders;
    });
    
    return streams;
    
  } catch (error) {
    console.log('[NUVIO-PT] Torrentio Erro:', error.message);
    return [];
  }
}

// Exportação padrão compatível com a estrutura de provedores Nuvio
module.exports = {
  meta: {
    id: 'nuvio-pt-br',
    name: '🇧🇷 Nuvio PT-BR Prioritário',
    description: 'Provedor com Torrentio, prioridade PT-BR e Múltiplos Trackers.',
    version: '1.1.0',
    author: 'Vinicius',
    icon: 'https://i.postimg.cc/nLwY1pJB/nuvio.png',
    supportedTypes: ['movie', 'tv'],
    contentLanguage: ['pt-BR', 'en']
  },
  
  async search(query, type, tmdbId, imdbId, season = null, episode = null) {
    try {
      let id = imdbId;
      
      // Converte TMDB para IMDB utilizando o Cache se necessário
      if (!id && tmdbId) {
        id = await getImdbId(tmdbId, type);
      }
      
      if (!id) {
        console.log('[NUVIO-PT] IMDB ID não encontrado para:', { query, type, tmdbId });
        return [];
      }
      
      return await searchTorrentio(id, type === 'tv' ? season : null, type === 'tv' ? episode : null);
      
    } catch (error) {
      console.log('[NUVIO-PT] Search Error:', error.message);
      return [];
    }
  }
};
