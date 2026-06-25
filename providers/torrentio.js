// ==========================================
// PLUGIN TORRENTIO MELHORADO
// Filtra e prioriza streams em português
// ==========================================

const TMDB_API_KEY = '7ab8a2e339d7f3644d075128951597b0';
const TORRENTIO_API = 'https://torrentio.strem.io';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  'Accept': 'application/json'
};

const TRACKERS = [
  'udp://tracker.opentrackr.org:6969/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://exodus.desync.com:6969/announce'
];

// ==========================================
// NOVO: Detectar idioma do título
// ==========================================
function detectLanguage(title = '') {
  const lowerTitle = title.toLowerCase();
  
  // Palavras-chave para português (Brasil e Portugal)
  const portugueseKeywords = [
    'portuguese',
    'português',
    'dublado',
    'dublagem',
    'brazilian',
    'sf',
    'dual-',
    'pt-br',
    'pt-pt',
    'pob',      // Código ISO para português do Brasil
    'por'       // Código ISO geral para português
  ];
  
  // Palavras-chave para outros idiomas
  const otherLanguages = {
    'english': ['english', 'eng', 'en-us'],
    'spanish': ['spanish', 'español', 'castellano', 'spa'],
    'french': ['french', 'français', 'fra'],
    'italian': ['italian', 'italiano', 'ita']
  };
  
  // Verifica português primeiro
  for (const keyword of portugueseKeywords) {
    if (lowerTitle.includes(keyword)) {
      return 'português';
    }
  }
  
  // Verifica outros idiomas
  for (const [lang, keywords] of Object.entries(otherLanguages)) {
    for (const keyword of keywords) {
      if (lowerTitle.includes(keyword)) {
        return lang;
      }
    }
  }
  
  // Se não encontrar, assume "indefinido"
  return 'indefinido';
}

// ==========================================
// NOVO: Extrair qualidade (melhorado)
// ==========================================
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

// ==========================================
// NOVO: Contar seeders
// ==========================================
function extractSeeders(title = '') {
  const match = title.match(/👤\s*(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

// ==========================================
// Construir magnet link
// ==========================================
function buildMagnet(infoHash) {
  if (!infoHash) return '';
  
  const trackerParams = TRACKERS
    .map(tracker => '&tr=' + encodeURIComponent(tracker))
    .join('');
  
  return 'magnet:?xt=urn:btih:' + infoHash + trackerParams;
}

// ==========================================
// Buscar ID IMDB no TMDB
// ==========================================
async function getImdbId(movieId, type) {
  try {
    const url = `https://api.themoviedb.org/3/${type}/${movieId}/external_ids?api_key=${TMDB_API_KEY}&language=pt-BR`;
    
    const response = await fetch(url, { skipSizeCheck: true });
    const data = await response.json();
    
    return data.external_ids?.imdb_id || data.imdb_id || null;
  } catch (error) {
    console.log('Erro ao buscar IMDB ID:', error);
    return null;
  }
}

// ==========================================
// MELHORADO: Buscar streams com filtro de idioma
// ==========================================
async function invokeTorrentio(imdbId, season, episode) {
  try {
    const hasSeasonEpisode = season != null && episode != null;
    const url = hasSeasonEpisode 
      ? `${TORRENTIO_API}/stream/series/${imdbId}:${season}:${episode}.json`
      : `${TORRENTIO_API}/stream/movie/${imdbId}.json`;
    
    console.log('[TORRENTIO] URL:', url);
    
    const response = await fetch(url, { headers: HEADERS, skipSizeCheck: true });
    const data = await response.json();
    
    if (!data || !data.streams) {
      console.log('[TORRENTIO] Sem streams encontrados');
      return [];
    }
    
    // Processa TODOS os streams (não limita a 15)
    const processedStreams = [];
    
    for (const torrent of data.streams) {
      try {
        const title = torrent.title || '';
        const quality = extractQuality(title);
        const seeders = extractSeeders(title);
        const language = detectLanguage(title);
        const magnet = buildMagnet(torrent.infoHash);
        
        if (!magnet) continue;
        
        // Adiciona informação de idioma ao título
        const languageIcon = language === 'português' ? '🇧🇷' : '🌐';
        
        processedStreams.push({
          url: magnet,
          quality: quality,
          title: `${languageIcon} [${quality}] | ${language} | 👤 ${seeders}`,
          subtitles: [],
          // Adiciona propriedades auxiliares para ordenação
          _language: language,
          _seeders: seeders,
          _quality: quality
        });
      } catch (error) {
        // Continua
      }
    }
    
    // ✨ ORDENAÇÃO INTELIGENTE ✨
    // 1º: Português (prioridade 1)
    // 2º: Qualidade (1080p > 720p > 480p)
    // 3º: Número de seeders (mais seeders = melhor)
    
    processedStreams.sort((a, b) => {
      // Prioridade 1: Idioma (português em primeiro)
      const aIsPortuguese = a._language === 'português' ? 0 : 1;
      const bIsPortuguese = b._language === 'português' ? 0 : 1;
      
      if (aIsPortuguese !== bIsPortuguese) {
        return aIsPortuguese - bIsPortuguese;
      }
      
      // Prioridade 2: Qualidade (ordem: 4K > 1080p > 720p > 480p)
      const qualityOrder = { '4K': 0, '1080p': 1, '720p': 2, '480p': 3 };
      const aQuality = qualityOrder[a._quality] || 999;
      const bQuality = qualityOrder[b._quality] || 999;
      
      if (aQuality !== bQuality) {
        return aQuality - bQuality;
      }
      
      // Prioridade 3: Seeders (mais seeders = melhor)
      return b._seeders - a._seeders;
    });
    
    // Remove as propriedades auxiliares antes de retornar
    return processedStreams.map(stream => {
      const { _language, _seeders, _quality, ...clean } = stream;
      return clean;
    });
    
  } catch (error) {
    console.log('[ERRO] Torrentio:', error);
    return [];
  }
}

// ==========================================
// Função principal: Obter streams
// ==========================================
async function getStreams(movieId, type, season, episode) {
  try {
    const imdbId = await getImdbId(movieId, type);
    
    if (!imdbId) {
      console.log('[ERRO] IMDB ID não encontrado');
      return [];
    }
    
    console.log('[SUCESSO] IMDB ID encontrado:', imdbId);
    
    const streams = await invokeTorrentio(
      imdbId, 
      type === 'tv' ? season : null, 
      type === 'tv' ? episode : null
    );
    
    // Log dos resultados (útil para debug)
    console.log('[STREAMS] Total encontrado:', streams.length);
    streams.slice(0, 5).forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.title}`);
    });
    
    return streams;
  } catch (error) {
    console.log('[ERRO] getStreams:', error);
    return [];
  }
}

module.exports = { getStreams };

// ==========================================
// RESUMO DAS ALTERAÇÕES
// ==========================================
/*
✅ ADICIONADO:
1. detectLanguage() - identifica idioma no título
2. extractSeeders() - extrai quantidade de seeders
3. Priorização em 3 níveis:
   - 1º lugar: Streams em português 🇧🇷
   - 2º lugar: Melhor qualidade (1080p antes de 720p)
   - 3º lugar: Mais seeders (mais estável)

✅ MELHORIAS NO VISUAL:
- 🇧🇷 mostra português
- 🌐 mostra outros idiomas
- Mostra idioma no título
- Processa TODOS os streams (não limita a 15)

📊 EXEMPLO DE SAÍDA:
  1. 🇧🇷 [1080p] | português | 👤 150
  2. 🇧🇷 [720p] | português | 👤 200
  3. 🌐 [1080p] | english | 👤 500
  4. 🌐 [1080p] | spanish | 👤 120

💡 PRÓXIMAS MELHORIAS POSSÍVEIS:
- Filtrar por qualidade mínima
- Suportar legendas em português
- Detectar se é dublado ou legendado
- Cache de resultados
*/
