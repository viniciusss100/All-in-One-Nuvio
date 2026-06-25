// Nuvio Provider - Anitube (anitube.vip)
// Modo Debugger: Força a exibição do log de erros na tela do Nuvio

"use strict";

var TMDB_API_KEY = "68e094699525b18a70bab2f86b1fa706";
var BASE_URL = "https://www.anitube.vip";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/137.0.0.0 Safari/537.36";

// Um vídeo MP4 real de testes do Google. Isso força o Nuvio a renderizar o item sem escondê-lo.
var DUMMY_VIDEO = "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";

var __async = function (__this, __arguments, generator) {
  return new Promise(function (resolve, reject) {
    var fulfilled = function (v) { try { step(generator.next(v)); } catch (e) { reject(e); } };
    var rejected = function (v) { try { step(generator.throw(v)); } catch (e) { reject(e); } };
    var step = function (x) { return x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected); };
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// Função que envia o erro disfarçado de vídeo pro Nuvio exibir
function debugError(mensagem) {
    return [{
        url: DUMMY_VIDEO,
        quality: "Erro",
        title: "🛠️ DEBUG: " + mensagem,
        type: "mp4"
    }];
}

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
      if (!info || (!info.title && !info.original)) return debugError("Falha ao puxar nome no TMDB/IMDb");

      var targetEp = episode || 1;
      var query = info.original || info.title;
      
      // PASSO 1: Busca no Anitube
      var searchUrl = BASE_URL + "/?s=" + encodeURIComponent(query);
      var searchRes = yield fetchText(searchUrl);

      // Verifica se tomou bloqueio do Cloudflare
      if (searchRes.status === 403 || searchRes.status === 503) {
          return debugError("Busca bloqueada pelo Cloudflare (HTTP " + searchRes.status + ")");
      }
      
      // Se a busca falhou ou retornou nada, tenta em português
      if (searchRes.status !== 200 || !searchRes.text) {
          searchUrl = BASE_URL + "/?s=" + encodeURIComponent(info.title);
          searchRes = yield fetchText(searchUrl);
          if (searchRes.status !== 200 || !searchRes.text) return debugError("Busca falhou. Status: " + searchRes.status);
      }

      // PASSO 2: Extrai links da busca
      var animeRe = /href=["']((?:https?:\/\/[^\/]+)?\/(?:anime|animes)\/[^"']+)["']/gi;
      var animeLinks = [];
      var match;

      while ((match = animeRe.exec(searchRes.text)) !== null) {
          var urlA = match[1];
          if (urlA.indexOf("http") !== 0) urlA = BASE_URL + urlA;
          if (animeLinks.indexOf(urlA) === -1) animeLinks.push(urlA);
      }

      if (animeLinks.length === 0) return debugError("Buscou, mas não achou nenhum link de anime");

      var animeLink = animeLinks[0]; 

      // PASSO 3: Entra no Anime
      var animeRes = yield fetchText(animeLink);
      if (animeRes.status === 403 || animeRes.status === 503) return debugError("Página do Anime bloqueada (Cloudflare)");
      if (animeRes.status !== 200) return debugError("Erro ao carregar a página do Anime");

      // PASSO 4: Procura o Episódio
      var epLink = null;
      var epRe = /href=["']((?:https?:\/\/[^\/]+)?\/(?:video|episodio|episodios)\/[^"']+)["']/gi;
      var epLinksEncontrados = [];

      while ((match = epRe.exec(animeRes.text)) !== null) {
          var linkE = match[1];
          if (linkE.indexOf("http") !== 0) linkE = BASE_URL + linkE;
          epLinksEncontrados.push(linkE);
      }

      for (var i = 0; i < epLinksEncontrados.length; i++) {
          var lnk = epLinksEncontrados[i];
          // Pega o número no fim do link
          var epMatch = lnk.match(/-(?:episodio|ep)-?0*(\d+)\/?$/i) || lnk.match(/-0*(\d+)\/?$/i) || lnk.match(/\/0*(\d+)\/?$/);
          if (epMatch && parseInt(epMatch[1], 10) === parseInt(targetEp, 10)) {
              epLink = lnk;
              break;
          }
      }

      if (!epLink) return debugError("Não encontrou o Link do Episódio " + targetEp + " no HTML");

      // PASSO 5: Entra na página do Episódio
      var epRes = yield fetchText(epLink);
      if (epRes.status === 403 || epRes.status === 503) return debugError("Página do Episódio bloqueada");
      if (epRes.status !== 200) return debugError("Erro ao acessar a página do Episódio");

      // PASSO 6: Extrai o Player
      var finalUrl = null;
      var isIframe = false;

      var mp4Match = epRes.text.match(/(https?:\/\/[^\s"'<>]+(?:\.m3u8|\.mp4)[^\s"'<>]*)/i);
      if (mp4Match) {
          finalUrl = mp4Match[1];
      } else {
          var iframeRe = /<iframe[^>]+src=["']([^"']+)["']/gi;
          while ((match = iframeRe.exec(epRes.text)) !== null) {
              var src = match[1];
              // Ignora iframes inuteis (redes sociais/comentários)
              if (src.indexOf("facebook") === -1 && src.indexOf("disqus") === -1 && src.indexOf("youtube") === -1) {
                  finalUrl = src;
                  if (finalUrl.indexOf("http") !== 0) finalUrl = "https:" + finalUrl;
                  isIframe = true;
                  break;
              }
          }
      }

      if (!finalUrl) return debugError("Player de vídeo não encontrado no HTML");

      var typeStr = "mp4";
      if (finalUrl.indexOf(".m3u8") !== -1) typeStr = "hls";

      var displayTitle = info.title || "Anime";

      // SUCESSO ABSOLUTO: Retorna o link real
      return [{
        url: finalUrl,
        quality: "720p",
        title: "🇧🇷 [Anitube] " + displayTitle + " · EP " + targetEp,
        type: typeStr
      }];

    } catch (error) {
      return debugError("O código crashou: " + error.message);
    }
  });
}

module.exports = { getStreams: getStreams };
