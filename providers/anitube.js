// Nuvio Provider - Anitube (anitube.zip)
"use strict";

var TMDB_API_KEY = "68e094699525b18a70bab2f86b1fa706";
var BASE_URL = "https://anitube.zip";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/137.0.0.0 Safari/537.36";

// Helper Assíncrono obrigatório para a Engine do Nuvio
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
      var r = yield fetch(url, { headers: { "User-Agent": USER_AGENT } });
      return { status: r.status, text: yield r.text() };
    } catch (e) { return { status: -1, text: "" }; }
  });
}

function getTmdbTitle(tmdbId, type) {
  return __async(this, null, function* () {
    try {
      var url = "https://api.themoviedb.org/3/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=pt-BR";
      var res = yield fetch(url);
      var data = yield res.json();
      return data.name || data.title || data.original_name || null;
    } catch (e) { return null; }
  });
}

// O Nuvio espera exatamente esta função sendo exportada
function getStreams(tmdbId, type, season, episode) {
  return __async(this, null, function* () {
    try {
      if (type !== "tv") return []; // Foco em animes em formato de série
      
      var title = yield getTmdbTitle(tmdbId, type);
      if (!title) return [];
      
      // 1. Sua lógica de busca no Anitube (Ex: /?s=nome)
      var searchUrl = BASE_URL + "/?s=" + encodeURIComponent(title);
      var searchRes = yield fetchText(searchUrl);
      
      if (searchRes.status !== 200) return [];
      
      // 2. Regex para achar o link do anime nos resultados
      // Exemplo (ajuste conforme a DOM atual do anitube.zip):
      // var animeLinkMatch = searchRes.text.match(/<a href="(https:\/\/anitube\.zip\/anime\/[^"]+)"/);
      
      // 3. Entrar na página do anime e buscar o link do Episódio correspondente
      // Você usará a variável 'episode' para montar o regex do episódio específico.
      
      // 4. Entrar na página do episódio e extrair o Iframe/Player
      
      // 5. Retornar no formato do Nuvio:
      /*
      return [{
        url: "https://link-do-m3u8-ou-mp4-extraido",
        quality: "720p",
        title: "🇧🇷 Anitube | " + title + " EP " + episode,
        type: "hls", // ou mp4
        behaviorHints: { notWebReady: true }
      }];
      */

      return []; // Substitua pelo retorno do array montado
      
    } catch (error) {
      console.log("[Anitube Nuvio] Erro:", error);
      return [];
    }
  });
}

module.exports = { getStreams: getStreams };
