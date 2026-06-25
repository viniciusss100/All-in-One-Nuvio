// Nuvio Provider - Anitube (anitube.vip)
// Modo "Chute Inteligente" e Diagnóstico de Cloudflare

"use strict";

var TMDB_API_KEY = "68e094699525b18a70bab2f86b1fa706";
var BASE_URL = "https://www.anitube.vip"; // O "www." previne muitos redirects que quebram o fetch
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
      // Limpa a string do ID caso o Nuvio mande algo como "tmdb:12345"
      var cleanId = String(id).replace(/[^a-zA-Z0-9]/g, ""); 
      var isImdb = cleanId.indexOf("tt") === 0;

      if (isImdb) {
         var findUrl = "https://api.themoviedb.org/3/find/" + cleanId + "?api_key=" + TMDB_API_KEY + "&external_source=imdb_id&language=pt-BR";
         var fRes = yield fetch(findUrl);
         var fData = yield fRes.json();
         var results = type === "tv" ? fData.tv_results : fData.movie_results;
         if (results && results.length > 0) return { title: results[0].name || results[0].title, original: results[0].original_name || results[0].original_title };
      } else {
         var url = "https://api.themoviedb.org/3/" + type + "/" + cleanId + "?api_key=" + TMDB_API_KEY + "&language=pt-BR";
         var res = yield fetch(url);
         var data = yield res.json();
         return { title: data.name || data.title, original: data.original_name || data.original_title };
      }
      return null;
    } catch (e) { return null; }
  });
}

function getStreams(id, type, season, episode) {
  return __async(this, null, function* () {
    try {
      if (type !== "tv") return [];

      var info = yield getTmdbInfo(id, type);
      if (!info || (!info.title && !info.original)) return [];

      var targetEp = episode || 1;
      
      // Tenta o título Original Japonês primeiro (O Anitube quase sempre usa esse)
      var query = info.original || info.title;
      var searchUrl = BASE_URL + "/?s=" + encodeURIComponent(query);
      
      var searchRes = yield fetchText(searchUrl);

      // --- 🚨 DETECTOR DE CLOUDFLARE 🚨 ---
      // Se aparecer isso na sua tela do Nuvio, o site barrou o seu celular.
      if (searchRes.status === 403 || searchRes.status === 503) {
          return [{ url: BASE_URL, quality: "Erro", title: "❌ Anitube: Bloqueado pelo Cloudflare", type: "web" }];
      }

      if (searchRes.status !== 200 || !searchRes.text) {
          // Tenta de novo com o título em Português se o servidor não respondeu bem
          searchUrl = BASE_URL + "/?s=" + encodeURIComponent(info.title);
          searchRes = yield fetchText(searchUrl);
          if (searchRes.status !== 200 || !searchRes.text) return [];
      }

      // 1. Extrai links de animes da página de busca
      var animeRe = /href=["']((?:https?:\/\/[^\/]+)?\/(?:anime|animes)\/[^"']+)["']/gi;
      var animeLinks = [];
      var match;

      while ((match = animeRe.exec(searchRes.text)) !== null) {
          var urlA = match[1];
          if (urlA.indexOf("http") !== 0) urlA = BASE_URL + urlA; // Corrige links relativos
          if (animeLinks.indexOf(urlA) === -1) animeLinks.push(urlA);
      }

      if (animeLinks.length === 0) return [];

      // Pega o PRIMEIRO resultado. A busca nativa deles costuma ser precisa.
      var animeLink = animeLinks[0]; 

      // 2. Entra na página do Anime e procura o Episódio
      var animeRes = yield fetchText(animeLink);
      if (animeRes.status !== 200) return [];

      var epLink = null;
      var epRe = /href=["']((?:https?:\/\/[^\/]+)?\/(?:video|episodio|episodios)\/[^"']+)["']/gi;
      var epLinksEncontrados = [];

      while ((match = epRe.exec(animeRes.text)) !== null) {
          var linkE = match[1];
          if (linkE.indexOf("http") !== 0) linkE = BASE_URL + linkE;
          epLinksEncontrados.push(linkE);
      }

      // Procura exatamente o número do episódio na URL
      for (var i = 0; i < epLinksEncontrados.length; i++) {
          var lnk = epLinksEncontrados[i];
          var epMatch = lnk.match(/-(?:episodio|ep)-?0*(\d+)\/?$/i) || lnk.match(/-0*(\d+)\/?$/i);
          if (epMatch && parseInt(epMatch[1], 10) === parseInt(targetEp, 10)) {
              epLink = lnk;
              break;
          }
      }

      // Fallback extremo
      if (!epLink) {
          epLink = animeLink.replace("/anime/", "/video/") + "-episodio-" + targetEp;
      }

      // 3. Entra no Episódio e Arranca o Iframe/Video
      var epRes = yield fetchText(epLink);
      if (epRes.status !== 200) return [];

      var finalUrl = null;
      var isIframe = false;

      // 3.1 Procura vídeo direto (M3U8 / MP4)
      var mp4Match = epRes.text.match(/(https?:\/\/[^\s"'<>]+(?:\.m3u8|\.mp4)[^\s"'<>]*)/i);
      if (mp4Match) {
          finalUrl = mp4Match[1];
      } else {
          // 3.2 Procura Iframes (Omitindo iframes de redes sociais)
          var iframeRe = /<iframe[^>]+src=["']([^"']+)["']/gi;
          while ((match = iframeRe.exec(epRes.text)) !== null) {
              var src = match[1];
              if (src.indexOf("facebook") === -1 && src.indexOf("disqus") === -1) {
                  finalUrl = src;
                  if (finalUrl.indexOf("http") !== 0) finalUrl = "https:" + finalUrl;
                  isIframe = true;
                  break;
              }
          }
      }

      if (!finalUrl) {
          // Para ajudar no diagnóstico, mostra que achou a página mas não achou o player
          return [{ url: epLink, quality: "Erro", title: "❌ Anitube: Player não encontrado no HTML", type: "web" }];
      }

      var typeStr = "mp4";
      if (finalUrl.indexOf(".m3u8") !== -1) typeStr = "hls";
      else if (isIframe) typeStr = "web";

      var displayTitle = info.title || "Anime";

      return [{
        url: finalUrl,
        quality: "720p",
        title: "🇧🇷 [Anitube] " + displayTitle + " · EP " + targetEp,
        type: typeStr,
        // Nuvio lê 'type: web' para abrir o navegador interno. Omitimos notWebReady para Iframes tocarem.
        behaviorHints: { notWebReady: !isIframe } 
      }];

    } catch (error) {
      return [];
    }
  });
}

module.exports = { getStreams: getStreams };
