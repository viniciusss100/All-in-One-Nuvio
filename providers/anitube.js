// Nuvio Provider - Anitube (anitube.zip / anitube.vip)
// Extração Heurística completa (Hermes-Safe)

"use strict";

var TMDB_API_KEY = "68e094699525b18a70bab2f86b1fa706";
var BASE_URL = "https://anitube.zip"; // Ajuste para o domínio ativo do Anitube, ex: anitube.vip
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
      var r = yield fetch(url, { 
          headers: { "User-Agent": USER_AGENT },
          redirect: "follow"
      });
      return { status: r.status, text: yield r.text(), url: r.url };
    } catch (e) { return { status: -1, text: "", url: url }; }
  });
}

function getTmdbInfo(tmdbId, type) {
  return __async(this, null, function* () {
    try {
      var url = "https://api.themoviedb.org/3/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=pt-BR";
      var res = yield fetch(url);
      var data = yield res.json();
      return {
          title: data.name || data.title || null,
          originalTitle: data.original_name || data.original_title || null
      };
    } catch (e) { return null; }
  });
}

function normalizeTitle(str) {
    if (!str) return "";
    return str.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
}

function getStreams(tmdbId, type, season, episode) {
  return __async(this, null, function* () {
    try {
      if (type !== "tv") return []; // Foco exclusivo em animes/séries
      
      var info = yield getTmdbInfo(tmdbId, type);
      if (!info || !info.title) return [];
      
      var query = info.title;
      var targetEp = episode || 1;
      
      console.log("[" + PROVIDER_TAG + "] Buscando: " + query + " Ep: " + targetEp);
      
      // 1. Pesquisa no site
      var searchUrl = BASE_URL + "/?s=" + encodeURIComponent(query);
      var searchRes = yield fetchText(searchUrl);
      if (searchRes.status !== 200 || !searchRes.text) return [];

      // 2. Extrai o link da página do anime nos resultados
      var animeLink = null;
      var animeRe = /href=["'](https?:\/\/[^\/]+\/(?:anime|video)\/[^"']+)["']/gi;
      var match;
      var normQuery = normalizeTitle(query);
      
      while ((match = animeRe.exec(searchRes.text)) !== null) {
          var urlA = match[1];
          var slug = urlA.split('/').filter(Boolean).pop();
          var normSlug = normalizeTitle(slug);
          
          // Verifica se o slug bate com o nome do anime
          if (normSlug.indexOf(normQuery.split(' ')[0]) !== -1) {
              animeLink = urlA;
              break;
          }
      }
      
      if (!animeLink) return [];
      console.log("[" + PROVIDER_TAG + "] Página do anime: " + animeLink);

      // 3. Entra na página do anime para achar o episódio
      var animeRes = yield fetchText(animeLink);
      if (animeRes.status !== 200) return [];
      
      var epLink = null;
      var epRe = /<a[^>]+href=["'](https?:\/\/[^\/]+\/(?:video|episodio)\/[^"']+)["']/gi;
      
      while ((match = epRe.exec(animeRes.text)) !== null) {
          var linkE = match[1];
          // Procura pelo número do episódio no link (ex: naruto-episodio-1)
          var epMatch = linkE.match(/-(?:episodio|ep)-?0*(\d+)/i) || linkE.match(/-0*(\d+)$/i);
          if (epMatch && parseInt(epMatch[1], 10) === targetEp) {
              epLink = linkE;
              break;
          }
      }
      
      // Fallback: se não achar o link exato, tenta deduzir a URL (Padrão de muitos temas de anime)
      if (!epLink) {
          epLink = animeLink.replace("/anime/", "/video/") + "-episodio-" + targetEp;
      }

      console.log("[" + PROVIDER_TAG + "] Página do Ep: " + epLink);

      // 4. Entra na página do episódio e extrai o player
      var epRes = yield fetchText(epLink);
      if (epRes.status !== 200) return [];
      
      var finalUrl = null;
      var sourceType = "mp4";
      
      // Procura vídeos diretos
      var mp4Match = epRes.text.match(/(https?:\/\/[^\s"'<>]+(?:m3u8|mp4)[^\s"'<>]*)/i);
      if (mp4Match) {
          finalUrl = mp4Match[1];
          if (finalUrl.indexOf(".m3u8") !== -1) sourceType = "hls";
      } else {
          // Procura iframes de players externos (ex: Blogger, Fembed, etc)
          var iframeMatch = epRes.text.match(/<iframe[^>]+src=["']([^"']+)["']/i);
          if (iframeMatch) {
              finalUrl = iframeMatch[1];
              // Se o iframe não for um vídeo direto, pode não tocar nativamente,
              // mas players de celular costumam resolver a rota dependendo do host.
          }
      }

      if (!finalUrl) {
          console.log("[" + PROVIDER_TAG + "] Nenhum player/vídeo encontrado.");
          return [];
      }

      console.log("[" + PROVIDER_TAG + "] Vídeo Extraído!");

      // 5. Retorna o array no formato que o Nuvio lê
      return [{
        url: finalUrl,
        quality: "720p",
        title: "🇧🇷 [Anitube] " + query + " · EP " + targetEp,
        type: sourceType,
        behaviorHints: { notWebReady: true }
      }];
      
    } catch (error) {
      console.log("[" + PROVIDER_TAG + "] Erro:", error);
      return [];
    }
  });
}

module.exports = { getStreams: getStreams };
