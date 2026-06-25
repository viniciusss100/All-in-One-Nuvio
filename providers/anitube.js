/**
 * Anitube - Nuvio Provider (Fixed Build based on AnimesDigital logic)
 */
"use strict";

var TMDB_API_KEY = "68e094699525b18a70bab2f86b1fa706";
var BASE_URL = "https://www.anitube.vip";
var PROVIDER_TAG = "Anitube";
var PROVIDER_VERSION = "2.0.0";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/137.0.0.0 Safari/537.36";

var __async = function (__this, __arguments, generator) {
  return new Promise(function (resolve, reject) {
    var fulfilled = function (v) { try { step(generator.next(v)); } catch (e) { reject(e); } };
    var rejected = function (v) { try { step(generator.throw(v)); } catch (e) { reject(e); } };
    var step = function (x) { return x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected); };
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

function fetchText(url, opts) {
  if (!opts) opts = {};
  return __async(this, null, function* () {
    try {
      var r = yield fetch(url, {
        method: opts.method || "GET",
        redirect: "follow",
        headers: Object.assign({ "User-Agent": USER_AGENT }, opts.headers || {})
      });
      return { status: r.status, text: yield r.text() };
    } catch (e) { return { status: -1, text: "" }; }
  });
}

function fetchJson(url, opts) {
  if (!opts) opts = {};
  return __async(this, null, function* () {
    try {
      var r = yield fetch(url, {
        method: opts.method || "GET",
        redirect: "follow",
        headers: Object.assign({ "User-Agent": USER_AGENT, Accept: "application/json" }, opts.headers || {})
      });
      return { status: r.status, data: yield r.json() };
    } catch (e) { return { status: -1, data: null }; }
  });
}

// ─────────────────────────────────────────────
// Slug utilities (from AnimesDigital)
// ─────────────────────────────────────────────
var STOPWORDS = {
  a: 1, o: 1, os: 1, as: 1, de: 1, do: 1, da: 1, dos: 1, das: 1,
  the: 1, of: 1, and: 1, e: 1, "no": 1, na: 1, nos: 1, nas: 1,
  to: 1, in: 1, on: 1, at: 1, for: 1, ni: 1, wa: 1, ga: 1, wo: 1, ka: 1,
};

function normalize(str) {
  if (!str) return "";
  str = str.toLowerCase();
  str = str.replace(/[áàâãä]/g, "a")
           .replace(/[éèêë]/g, "e")
           .replace(/[íìîï]/g, "i")
           .replace(/[óòôõö]/g, "o")
           .replace(/[úùûü]/g, "u")
           .replace(/[ç]/g, "c")
           .replace(/[ñ]/g, "n")
           .replace(/[:：]/g, " ")
           .replace(/[^a-z0-9\s-]/g, " ")
           .replace(/\s+/g, " ")
           .trim();
  return str;
}

function slugify(str) {
  return normalize(str).replace(/\s+/g, "-");
}

function slugBody(slug) {
  return slug
    .replace(/-dublado$/, "")
    .replace(/-legendado$/, "")
    .replace(/-online$/, "")
    .replace(/-[0-9]+$/, "");
}

function buildExpectedRoots(tmdbInfo) {
  var titles = [tmdbInfo.title, tmdbInfo.originalTitle]
    .concat(tmdbInfo.altTitles || [])
    .filter(Boolean);
  var roots = [];
  var seen = {};
  function push(s) { if (s && !seen[s]) { seen[s] = 1; roots.push(s); } }
  for (var i = 0; i < titles.length; i++) {
    var base = slugify(titles[i]);
    if (!base) continue;
    push(base);
    push(base.replace(/^the-/, ""));
    var afterColon = titles[i].indexOf(":") !== -1
      ? titles[i].split(":").slice(1).join(":")
      : "";
    if (afterColon) {
      var slug = slugify(afterColon);
      if (slug) push(slug);
    }
  }
  return roots;
}

function isStrictMatch(slug, expectedRoots) {
  if (!slug) return false;
  var body = slugBody(slug);

  for (var i = 0; i < expectedRoots.length; i++) {
    var root = expectedRoots[i];
    if (!root) continue;
    if (body === root) return true;
    if (body.indexOf(root + "-") === 0) return true;
  }

  for (var j = 0; j < expectedRoots.length; j++) {
    var r2 = expectedRoots[j];
    if (!r2 || r2.length < 6) continue;
    if (body.indexOf("-" + r2 + "-") !== -1) return true;
    if (body.length > r2.length && body.substring(body.length - r2.length - 1) === "-" + r2) return true;
  }

  return false;
}

// ─────────────────────────────────────────────
// TMDB
// ─────────────────────────────────────────────
function getTmdbInfo(tmdbId, type) {
  return __async(this, null, function* () {
    var cleanId = String(tmdbId).replace(/[^a-zA-Z0-9]/g, ""); 
    var isImdb = cleanId.indexOf("tt") === 0;

    var d = null;
    if (isImdb) {
       var findUrl = "https://api.themoviedb.org/3/find/" + cleanId + "?api_key=" + TMDB_API_KEY + "&external_source=imdb_id&language=pt-BR";
       var fRes = yield fetchJson(findUrl);
       if (!fRes.data) return null;
       var results = type === "tv" ? fRes.data.tv_results : fRes.data.movie_results;
       if (results && results.length > 0) d = results[0];
       if (!d) return null;
       cleanId = d.id;
    }

    var path = type === "tv" ? "tv" : "movie";
    var base = "https://api.themoviedb.org/3/" + path + "/" + cleanId;
    var ptRes = yield fetchJson(base + "?api_key=" + TMDB_API_KEY + "&language=pt-BR");
    if (!ptRes.data) return null;
    d = ptRes.data;

    var origin = d.origin_country || [];
    var isJapaneseOrigin = d.original_language === "ja" || origin.indexOf("JP") !== -1 || origin.indexOf("JA") !== -1;

    var altTitles = [];
    var altRes = yield fetchJson(base + "/alternative_titles?api_key=" + TMDB_API_KEY);
    if (altRes && altRes.data) {
      var results = altRes.data.results || altRes.data.titles || [];
      for (var i = 0; i < results.length; i++) {
        var r = results[i];
        if (!r || !r.title) continue;
        var c = (r.iso_3166_1 || "").toUpperCase();
        if (c === "JP" || c === "US" || c === "GB" || c === "BR" || c === "PT") {
          altTitles.push(r.title);
        }
      }
    }

    return {
      title: d.title || d.name || "",
      originalTitle: d.original_title || d.original_name || "",
      altTitles: altTitles,
      year: ((d.release_date || d.first_air_date || "").split("-")[0]) || null,
      isAnime: isJapaneseOrigin,
    };
  });
}

// ─────────────────────────────────────────────
// Search & Extract
// ─────────────────────────────────────────────
function searchAnime(query) {
  return __async(this, null, function* () {
    if (!query) return [];
    var url = BASE_URL + "/?s=" + encodeURIComponent(query);
    var res = yield fetchText(url);
    
    if (res.status === 403 || res.status === 503) {
      // Cloudflare block
      return [{ cloudflare: true }];
    }

    if (res.status !== 200 || !res.text) return [];

    var results = [];
    var seen = {};
    var animeRe = /href=["']((?:https?:\/\/[^\/]+)?\/(?:anime|animes)\/([^"']+))["']/gi;
    var m;

    while ((m = animeRe.exec(res.text)) !== null) {
      var fullUrl = m[1];
      if (fullUrl.indexOf("http") !== 0) fullUrl = BASE_URL + fullUrl;
      var slug = m[2].replace(/\/$/, ""); // Remove trailing slash
      if (seen[slug]) continue;
      seen[slug] = 1;
      results.push({ url: fullUrl, slug: slug });
    }
    return results;
  });
}

function parseEpisodes(html, targetEp) {
    var epLink = null;
    var epRe = /href=["']((?:https?:\/\/[^\/]+)?\/(?:video|episodio|episodios)\/[^"']+)["']/gi;
    var epLinksEncontrados = [];
    var m;

    while ((m = epRe.exec(html)) !== null) {
        var linkE = m[1];
        if (linkE.indexOf("http") !== 0) linkE = BASE_URL + linkE;
        if (epLinksEncontrados.indexOf(linkE) === -1) {
            epLinksEncontrados.push(linkE);
        }
    }

    for (var i = 0; i < epLinksEncontrados.length; i++) {
        var lnk = epLinksEncontrados[i];
        var epMatch = lnk.match(/-(?:episodio|ep)-?0*(\d+)\/?$/i) || lnk.match(/-0*(\d+)\/?$/i);
        if (epMatch && parseInt(epMatch[1], 10) === parseInt(targetEp, 10)) {
            epLink = lnk;
            break;
        }
    }
    return epLink;
}

function extractStream(html) {
    var finalUrl = null;
    var isIframe = false;

    // 1. Procura vídeo direto (M3U8 / MP4)
    var mp4Match = html.match(/(https?:\/\/[^\s"'<>]+(?:\.m3u8|\.mp4)[^\s"'<>]*)/i);
    if (mp4Match) {
        finalUrl = mp4Match[1];
    } else {
        // 2. Procura Iframes (Omitindo iframes de redes sociais e ads)
        var iframeRe = /<iframe[^>]+src=["']([^"']+)["']/gi;
        var match;
        while ((match = iframeRe.exec(html)) !== null) {
            var src = match[1];
            if (src.indexOf("facebook") === -1 && src.indexOf("disqus") === -1 && src.indexOf("ads") === -1) {
                finalUrl = src;
                if (finalUrl.indexOf("http") !== 0) finalUrl = "https:" + finalUrl;
                isIframe = true;
                break;
            }
        }
    }

    if (!finalUrl) return null;

    var typeStr = "mp4";
    if (finalUrl.indexOf(".m3u8") !== -1) typeStr = "hls";
    else if (isIframe) typeStr = "web";

    return { url: finalUrl, type: typeStr, isIframe: isIframe };
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────
function getStreams(tmdbId, type, season, episode) {
  return __async(this, null, function* () {
    try {
      if (type !== "tv") return [];
      var info = yield getTmdbInfo(tmdbId, type);
      if (!info || (!info.title && !info.originalTitle)) return [];

      var targetEp = episode || 1;
      
      var queries = [];
      var src = [info.originalTitle, info.title].concat(info.altTitles || []);
      for (var qi = 0; qi < src.length; qi++) {
        var t = (src[qi] || "").trim();
        if (t && queries.indexOf(t) === -1) queries.push(t);
      }
      
      var expectedRoots = buildExpectedRoots(info);
      var candidatePages = [];
      var seenPage = {};
      var hasCloudflare = false;

      for (var q = 0; q < queries.length && candidatePages.length < 4; q++) {
          var searchResults = yield searchAnime(queries[q]);
          
          if (searchResults.length > 0 && searchResults[0].cloudflare) {
             hasCloudflare = true;
             break;
          }

          for (var sr = 0; sr < searchResults.length; sr++) {
              if (seenPage[searchResults[sr].slug]) continue;
              if (!isStrictMatch(searchResults[sr].slug, expectedRoots)) continue;
              
              seenPage[searchResults[sr].slug] = 1;
              candidatePages.push(searchResults[sr]);
              if (candidatePages.length >= 4) break;
          }
      }

      if (hasCloudflare) {
          return [{ url: BASE_URL, quality: "Erro", title: "❌ Anitube: Bloqueado pelo Cloudflare", type: "web" }];
      }

      if (candidatePages.length === 0) return [];

      var streams = [];
      var seenStreamUrl = {};

      for (var cp = 0; cp < candidatePages.length && streams.length < 4; cp++) {
          var page = candidatePages[cp];
          
          var pageRes = yield fetchText(page.url);
          if (pageRes.status !== 200) continue;

          var epLink = parseEpisodes(pageRes.text, targetEp);
          
          if (!epLink) {
              epLink = page.url.replace("/anime/", "/video/") + "-episodio-" + targetEp;
          }

          var epRes = yield fetchText(epLink);
          if (epRes.status !== 200) continue;

          var sx = extractStream(epRes.text);
          if (!sx) continue;

          if (seenStreamUrl[sx.url]) continue;
          seenStreamUrl[sx.url] = 1;

          var displayTitle = info.title || "Anime";
          var isDubbed = /dublado/i.test(page.slug);
          var flag = isDubbed ? "DUB" : "LEG";

          streams.push({
              url: sx.url,
              quality: sx.type === "hls" ? "Auto" : "720p",
              title: "🇧🇷 [" + PROVIDER_TAG + "] " + displayTitle + " · EP " + targetEp + " [" + flag + "]",
              type: sx.type,
              behaviorHints: { notWebReady: !sx.isIframe, bingeGroup: "anitube-" + page.slug }
          });
      }

      return streams;

    } catch (error) {
      return [];
    }
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams: getStreams };
} else if (typeof global !== "undefined") {
  global.getStreams = getStreams;
}
