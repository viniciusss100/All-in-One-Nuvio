// Nuvio Provider - Anitube (anitube.vip)
// Resiliência: Múltiplos idiomas (TMDB), URLs Relativas e Extração de Iframes.

"use strict";

var TMDB_API_KEY = "68e094699525b18a70bab2f86b1fa706";
var BASE_URL = "https://anitube.vip"; 
var PROVIDER_TAG = "Anitube";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/137.0.0.0 Safari/537.36";

var __async = function (__this, __arguments, generator) {
  return new Promise(function (resolve, reject) {
    var fulfilled = function (v) { try { step(generator.next(v)); } catch (e) { reject(e); } };
    var rejected = function (v) { try { step(generator.throw(v)); } catch (e) { reject(e); } };
    var step = function (x) { return x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected); };
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

function fetchText(url) {
  return __async(this, null, function* () {
    try {
      var r = yield fetch(url, { headers: { "User-Agent": USER_AGENT }, redirect: "follow" });
      return { status: r.status, text: yield r.text() };
    } catch (e) { return { status: -1, text: "" }; }
  });
}

function getTmdbInfo(id, type) {
  return __async(this, null, function* () {
    try {
      var isImdb = String(id).indexOf("tt") === 0;
      var data = null;

      if (isImdb) {
         var findUrl = "https://api.themoviedb.org/3/find/" + id + "?api_key=" + TMDB_API_KEY + "&external_source=imdb_id&language=pt-BR";
         var fRes = yield fetch(findUrl);
         var fData = yield fRes.json();
         var results = type === "tv" ? fData.tv_results : fData.movie_results;
         if (results && results.length > 0) data = results[0];
      } else {
         var url = "https://api.themoviedb.org/3/" + type + "/" + id + "?api_key=" + TMDB_API_KEY + "&language=pt-BR";
         var res = yield fetch(url);
         data = yield res.json();
      }

      if (data) {
          // Coletamos Título em PT-BR e o Título Original para aumentar as chances na busca
          return {
              title: data.name || data.title || null,
              originalTitle: data.original_name || data.original_title || null
          };
      }
      return null;
    } catch (e) { return null; }
  });
}

function normalizeTitle(str) {
    if (!str) return "";
    return str.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
}

function getStreams(id, type, season, episode) {
  return __async(this, null, function* () {
    try {
      if (type !== "tv") return [];

      var info = yield getTmdbInfo(id, type);
      if (!info || (!info.title && !info.originalTitle)) return [];

      var targetEp = episode || 1;
      
      // Cria uma fila de buscas: PT-BR -> Nome Original -> Primeira Palavra do Nome
      var queries = [];
      if (info.title) queries.push(info.title);
      if (info.originalTitle && info.originalTitle !== info.title) queries.push(info.originalTitle);
      if (info.title && info.title.indexOf(' ') !== -1) queries.push(info.title.split(' ')[0]);

      var animeLink = null;

      // 1. Tenta achar a página do anime usando as diferentes buscas
      for (var i = 0; i < queries.length; i++) {
          var q = queries[i];
          var searchUrl = BASE_URL + "/?s=" + encodeURIComponent(q);
          var searchRes = yield fetchText(searchUrl);
          
          if (searchRes.status === 200 && searchRes.text) {
              var animeRe = /href=["']((?:https?:\/\/[^\/]+)?\/(?:anime|animes)\/[^"']+)["']/gi;
              var match;
              var normQuery = normalizeTitle(q).split(' ')[0];

              while ((match = animeRe.exec(searchRes.text)) !== null) {
                  var urlA = match[1];
                  if (urlA.indexOf("http") !== 0) urlA = BASE_URL + urlA; // Corrige link relativo
                  var slug = urlA.split('/').filter(Boolean).pop();
                  
                  if (normalizeTitle(slug).indexOf(normQuery) !== -1) {
                      animeLink = urlA;
                      break;
                  }
              }
          }
          if (animeLink) break; // Se achou, para de tentar buscar outros nomes
      }

      if (!animeLink) return [];

      // 2. Entra na página do Anime e procura o Episódio Correto
      var animeRes = yield fetchText(animeLink);
      if (animeRes.status !== 200) return [];

      var epLink = null;
      // Captura o link e o texto dentro da tag <a> do episódio
      var epBlockRe = /<a[^>]+href=["']((?:https?:\/\/[^\/]+)?\/(?:video|episodio|episodios)\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      
      while ((match = epBlockRe.exec(animeRes.text)) !== null) {
          var linkE = match[1];
          var innerText = match[2];
          if (linkE.indexOf("http") !== 0) linkE = BASE_URL + linkE;

          // Procura o número no Link OU no Texto Visível para o usuário
          var numInLink = linkE.match(/-(?:episodio|ep)-?0*(\d+)/i) || linkE.match(/-0*(\d+)\/?$/i);
          var numInText = innerText.match(/(?:epis[oó]dio|ep)\s*0*(\d+)/i) || innerText.match(/\b0*(\d+)\b/);
          
          var isCorrectEp = (numInLink && parseInt(numInLink[1], 10) === parseInt(targetEp, 10)) || 
                            (numInText && parseInt(numInText[1], 10) === parseInt(targetEp, 10));

          if (isCorrectEp) {
              epLink = linkE;
              break;
          }
      }

      // Fallback
      if (!epLink) {
          epLink = animeLink.replace("/anime/", "/video/") + "-episodio-" + targetEp;
      }

      // 3. Entra na página do Episódio e arranca o Player
      var epRes = yield fetchText(epLink);
      if (epRes.status !== 200) return [];

      var finalUrl = null;
      var isIframe = false;

      var mp4Match = epRes.text.match(/(https?:\/\/[^\s"'<>]+(?:m3u8|mp4)[^\s"'<>]*)/i);
      if (mp4Match) {
          finalUrl = mp4Match[1];
      } else {
          var iframeMatch = epRes.text.match(/<iframe[^>]+src=["']([^"']+)["']/i);
          if (iframeMatch) {
              finalUrl = iframeMatch[1];
              if (finalUrl.indexOf("http") !== 0) finalUrl = "https:" + finalUrl;
              isIframe = true;
          }
      }

      if (!finalUrl) return [];

      var typeStr = "mp4";
      if (finalUrl.indexOf(".m3u8") !== -1) typeStr = "hls";
      else if (isIframe) typeStr = "web";

      var displayTitle = info.title || info.originalTitle || "Anitube";

      return [{
        url: finalUrl,
        quality: "720p",
        title: "🇧🇷 [Anitube] " + displayTitle + " · EP " + targetEp,
        type: typeStr,
        behaviorHints: { notWebReady: !isIframe }
      }];

    } catch (error) {
      return [];
    }
  });
}

module.exports = { getStreams: getStreams };
