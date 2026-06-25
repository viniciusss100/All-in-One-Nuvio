// Nuvio Provider - PT-BR Prioritário
// Baseado na estrutura oficial do Nuvio
// Com detecção de português para: 1-sf, 0-sf, dual-, brazilian

const axios = require('axios');

const TMDB_API_KEY = '68e094699525b18a70bab2f86b1fa706';
const TORRENTIO_API = 'https://torrentio.strem.io';

// Detecta português pelas keywords do Nuvio
function detectLanguage(title = '') {
  if (!title) return 'indefinido';
  
  const lowerTitle = title.toLowerCase();
  
  // Keywords de português (Nuvio format)
  const portugueseKeywords = [
    '1-sf',        // Legendado PT-BR (Nuvio format)
    '0-sf',        // Sem som (Nuvio format)
    'dual-',       // Áudio dual (Nuvio format)
    'brazilian',   // Genérico
    'portuguese',
    'português',
    'pt-br',
    'pt-pt',
    'pob',
    'por'
  ];
  
  for (const keyword of portugueseKeywords) {
    if (lowerTitle.includes(keyword)) {
      return 'português';
    }
  }
  
  // Outros idiomas
  if (lowerTitle.includes('english') || lowerTitle.includes('eng')) {
    return 'english';
  }
  if (lowerTitle.includes('spanish') || lowerTitle.includes('español')) {
    return 'spanish';
  }
  
  return 'indefinido';
}

// Extrai qualidade
function extractQuality(title = '') {
  const lowerTitle = title.toLowerCase();
  
  if (lowerTitle.includes('2160p') || lowerTitle.includes('4k')) {
    return '4K';
  }
  if (lowerTitle.includes('1080p')) {
    return '1080p';
  }
  if (lowerTitle.includes('720p')) {
    return '720p';
  }
  if (lowerTitle.includes('480p')) {
    return '480p';
  }
  return '720p';
}

// Extrai seeders
function extractSeeders(title = '') {
  const match = title.match(/👤\s*(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

// Busca TMDB para get IMDB ID
async function getImdbId(movieId, type) {
  try {
    const url = `https://api.themoviedb.org/3/${type}/${movieId}/external_ids?api_key=${TMDB_API_KEY}&language=pt-BR`;
    
    const response = await axios.get(url, {
      timeout: 5000
    });
    
    return response.data?.external_ids?.imdb_id || response.data?.imdb_id || null;
  } catch (error) {
    console.log('[NUVIO-PT] TMDB Erro:', error.message);
    return null;
  }
}

// Busca Torrentio
async function searchTorrentio(imdbId, season = null, episode = null) {
  try {
    if (!imdbId) return [];
    
    const hasSeasonEpisode = season != null && episode != null;
    const url = hasSeasonEpisode
      ? `${TORRENTIO_API}/stream/series/${imdbId}:${season}:${episode}.json`
      : `${TORRENTIO_API}/stream/movie/${imdbId}.json`;
    
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.data || !response.data.streams) {
      return [];
    }
    
    // Processa streams
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
        
        streams.push({
          title: `${languageIcon} [${quality}] | ${language} | 👤 ${seeders}`,
          url: `magnet:?xt=urn:btih:${infoHash}&tr=udp://tracker.opentrackr.org:6969/announce&tr=udp://tracker.torrent.eu.org:451/announce`,
          lang: language,
          quality: quality,
          seeders: seeders
        });
      } catch (err) {
        // continue
      }
    }
    
    // ORDENAÇÃO INTELIGENTE
    streams.sort((a, b) => {
      // 1º: Português primeiro
      const aIsPortuguese = a.lang === 'português' ? 0 : 1;
      const bIsPortuguese = b.lang === 'português' ? 0 : 1;
      
      if (aIsPortuguese !== bIsPortuguese) {
        return aIsPortuguese - bIsPortuguese;
      }
      
      // 2º: Qualidade (4K > 1080p > 720p)
      const qualityOrder = { '4K': 0, '1080p': 1, '720p': 2, '480p': 3 };
      const aQuality = qualityOrder[a.quality] || 999;
      const bQuality = qualityOrder[b.quality] || 999;
      
      if (aQuality !== bQuality) {
        return aQuality - bQuality;
      }
      
      // 3º: Seeders (mais seeders = melhor)
      return b.seeders - a.seeders;
    });
    
    return streams;
    
  } catch (error) {
    console.log('[NUVIO-PT] Torrentio Erro:', error.message);
    return [];
  }
}

// Interface do Nuvio
module.exports = {
  // Informações do provedor
  meta: {
    id: 'nuvio-pt-br',
    name: '🇧🇷 Nuvio PT-BR Prioritário',
    description: 'Streaming com português como prioridade',
    version: '1.0.0',
    author: 'Vinicius',
    icon: 'https://i.postimg.cc/nLwY1pJB/nuvio.png',
    supportedTypes: ['movie', 'tv'],
    contentLanguage: ['pt-BR', 'en']
  },
  
  // Função de busca principal
  async search(query, type, tmdbId, imdbId, season = null, episode = null) {
    try {
      // Se temos IMDB ID, usa direto
      let id = imdbId;
      
      // Se não, busca pelo TMDB
      if (!id && tmdbId) {
        id = await getImdbId(tmdbId, type);
      }
      
      if (!id) {
        console.log('[NUVIO-PT] ID não encontrado:', { query, type, tmdbId });
        return [];
      }
      
      // Busca streams
      const streams = await searchTorrentio(id, type === 'tv' ? season : null, type === 'tv' ? episode : null);
      
      return streams;
      
    } catch (error) {
      console.log('[NUVIO-PT] Search Error:', error.message);
      return [];
    }
  }
};
