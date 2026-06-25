/**
 * BrazucaPlay - Provider Nuvio para conteúdo
 * Utiliza o sistema nativo GeekAntenado (Kodi) para extrair links diretos (MP4/M3U8)
 * compatíveis com o player do Nuvio.
 */

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
  'Connection': 'keep-alive',
  'Accept': 'application/json, text/plain, */*'
};

const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJyZXNvbHZlciIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzc5MDk4OTczfQ.WzQBuOqMai96Afleh9g-i7NXo6h-YsjPUbOgxlUqVsU';

// Cache em memória para o banco de dados (evitar múltiplos downloads de 19MB)
let MOVIE_DB_CACHE = null;

function requestRaw(method, urlString, options) {
  return fetch(urlString, {
    method: method,
    headers: (options && options.headers) || {},
    body: (options && options.body) || undefined
  }).then(function(response) {
    return response.text().then(function(body) {
      if (response.ok) {
        return { status: response.status, headers: response.headers, body: body };
      } else {
        throw new Error('HTTP ' + response.status + ': ' + body);
      }
    });
  });
}

function toBase64(str) {
  if (typeof btoa === 'function') return btoa(str);
  if (typeof Buffer !== 'undefined') return Buffer.from(str).toString('base64');
  return '';
}

function fromBase64(str) {
  if (typeof atob === 'function') return atob(str);
  if (typeof Buffer !== 'undefined') return Buffer.from(str, 'base64').toString('utf-8');
  return '';
}

function getGeekAntenadoData(params) {
  // Transforma o JSON params em string -> base64 -> url encoded
  const jsonStr = JSON.stringify(params).replace(/"/g, "'"); // o Python deles as vezes espera aspas simples
  const payload = encodeURIComponent(toBase64(jsonStr));
  const url = 'https://api.geekantenado.online/?resolver=' + payload;
  
  return requestRaw('GET', url, {
    headers: {
      'Authorization': 'Bearer ' + TOKEN,
      'User-Agent': HEADERS['User-Agent'],
      'Accept': HEADERS['Accept']
    }
  }).then(function(res) {
    try {
      const data = JSON.parse(res.body);
      if (data && data.success && data.result && data.result !== 'episode not found!') {
         return fromBase64(data.result);
      }
    } catch(e) {
      // Ignorar erros de parse
    }
    return null;
  });
}

async function getMovieDb() {
  if (MOVIE_DB_CACHE) return MOVIE_DB_CACHE;
  
  let lancamentosBody = '';
  let pageBody = '';
  
  try {
    const lancamentos = await requestRaw('GET', 'https://gist.githubusercontent.com/skyrisk/5b87797329c7b46422565ffbaab3be7e/raw/lancamentos.xml');
    lancamentosBody = lancamentos.body;
  } catch (e) {}

  try {
    const pageXml = await requestRaw('GET', 'https://gist.githubusercontent.com/skyrisk/5b87797329c7b46422565ffbaab3be7e/raw/page.xml');
    pageBody = pageXml.body;
  } catch (e) {}
  
  MOVIE_DB_CACHE = lancamentosBody + '\n' + pageBody;
  return MOVIE_DB_CACHE;
}

function extractResolverSlugs(xmlContent, tmdbId) {
  // Regex segura que não avança para o próximo <item>
  const regexStr = '<item>(?:(?!<\\/item>)[\\s\\S])*?<tmdb_id>' + tmdbId + '<\\/tmdb_id>(?:(?!<\\/item>)[\\s\\S])*?<\\/item>';
  const regex = new RegExp(regexStr, 'i');
  const match = xmlContent.match(regex);
  if (!match) return null;

  const itemBlock = match[0];
  const linkMatch = itemBlock.match(/<link>(.*?)<\/link>/i);
  if (!linkMatch) return null;
  const linkData = linkMatch[1];
  
  // Pegamos as resoluções do GeekAntenado ignorando providers mortos como videasy/movie2
  const resolvers = [];
  const resolverRegex = /resolver(\d+)_(mv|tvshows|episodes)=([^|<]+)/gi;
  let m;
  while ((m = resolverRegex.exec(linkData)) !== null) {
      resolvers.push({
          id: parseInt(m[1], 10),
          type: m[2],
          slug: m[3]
      });
  }
  return resolvers;
}

async function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  try {
    const streams = [];
    if (mediaType === 'movie') {
      const xml = await getMovieDb();
      const resolvers = extractResolverSlugs(xml, tmdbId);
      
      if (resolvers && resolvers.length > 0) {
        for (let r of resolvers) {
          // Ex: { 'resolver': 3, 'request': 'mvshows=cara-de-um-focinho-de-outro' }
          const params = { resolver: r.id, request: `mvshows=${r.slug}` };
          const directUrl = await getGeekAntenadoData(params).catch(() => null);
          
          if (directUrl && (directUrl.includes('.mp4') || directUrl.includes('.m3u8') || directUrl.startsWith('http'))) {
            streams.push({
              name: 'BrazucaPlay',
              title: 'Servidor ' + r.id + ' (Direto)',
              url: directUrl,
              quality: directUrl.includes('FHD') ? '1080p' : (directUrl.includes('HD') ? '720p' : 'Auto'),
              size: 'Unknown',
              headers: HEADERS,
              provider: 'brazucaplay'
            });
          }
        }
      }
    } else {
        // Implementação de séries requereria parsing do SeriesBase e duas chamadas de API.
        // Foco inicial em filmes para sanar o Player Error
        return [];
    }
    
    return streams;
  } catch (e) {
    console.error('BrazucaPlay Error: ', e);
    return [];
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
