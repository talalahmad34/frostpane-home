/* Bangs: "!yt lofi", "cats !w" and so on, with autocomplete.
 *
 * The resolver (createBangResolver) is from exsesx/helium-new-tab
 *   https://github.com/exsesx/helium-new-tab/blob/main/src/lib/bangs.js
 *   Copyright (c) 2026 Oleh Vanin. MIT License, see licenses/helium-new-tab-MIT.txt.
 * Loading and suggestion ranking are ported from Shimmer Tab
 *   https://github.com/dmitthedazed/shimmer-tab, helium-newtab/src/bangs.svelte.ts
 *   Copyright (c) dmitthedazed. GNU General Public License v3.0.
 * The catalog, bangs.json, is Helium's bang list: Copyright (c) 2024 Kagi Search,
 *   2026 imput. MIT License, see licenses/bangs-MIT.txt.
 *
 * The catalog is about 1 MB, so it is only fetched once a bang is typed.
 */
(function () {
  "use strict";

  /* ---------- Resolver (MIT, Oleh Vanin) ---------- */
  const flags = { openBasePath: 1, encodeQuery: 4, spaceToPlus: 8 };
  const defaultFormat = flags.openBasePath | flags.encodeQuery | flags.spaceToPlus;

  function createBangResolver(catalog) {
    const bangs = new Map();

    for (const entry of catalog) {
      for (const trigger of entry.ts) {
        if (!bangs.has(trigger.toLowerCase())) {
          bangs.set(trigger.toLowerCase(), entry);
        }
      }
    }

    return function resolveBang(text) {
      const match = /(?:^|\s)!(\S+)/u.exec(text);
      const entry = match && bangs.get(match[1].toLowerCase());

      if (!entry) {
        return null;
      }

      const query = [text.slice(0, match.index).trim(), text.slice(match.index + match[0].length).trim()]
        .filter(Boolean)
        .join(" ");

      try {
        const template = new URL(entry.u);
        const dynamicHost = template.hostname.toLowerCase().includes("{searchterms}");

        if (dynamicHost && !query) {
          return null;
        }

        const format = entry.f ?? defaultFormat;
        let terms = format & flags.encodeQuery ? encodeURIComponent(query) : query;

        if (format & flags.spaceToPlus) {
          terms = terms.replaceAll(format & flags.encodeQuery ? "%20" : " ", "+");
        }

        const url =
          !query && format & flags.openBasePath
            ? new URL("/", template)
            : new URL(entry.u.replaceAll("{searchTerms}", () => terms));

        if (
          !["https:", "http:"].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.hostname.startsWith(".") ||
          url.hostname.includes("..") ||
          (dynamicHost && !url.hostname.split(".").every((label) => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label)))
        ) {
          return null;
        }

        return {
          url: url.href,
          service: entry.s,
          // Query-derived hostnames never get an icon while the user is still typing.
          siteOrigin: dynamicHost ? "" : template.origin,
        };
      } catch {
        // Some bangs put the query in a hostname, where spaces are invalid.
      }

      return null;
    };
  }

  /* ---------- Loading and suggestions (GPL-3.0, Shimmer Tab) ---------- */
  let resolver = null;
  let catalog = [];
  let request;
  const listeners = new Set();

  const hasBang = (text) => /(?:^|\s)!\S+/.test(text);

  function load() {
    request ??= fetch("bangs.json")
      .then((res) => {
        if (!res.ok) throw new Error("Bang catalog unavailable");
        return res.json();
      })
      .then((entries) => {
        catalog = entries;
        resolver = createBangResolver(entries);
        listeners.forEach((fn) => fn());
      })
      .catch(() => {
        request = undefined;
      });
    return request;
  }

  /** Sync lookup for the hint; null until the catalog is loaded. */
  function resolve(text) {
    if (!hasBang(text)) return null;
    if (!resolver) load();
    return resolver ? resolver(text) : null;
  }

  /** For submit: waits for the catalog if needed. */
  async function resolveAsync(text) {
    if (!hasBang(text)) return null;
    await load();
    return resolver ? resolver(text) : null;
  }

  // what most people mean when they start typing a bang
  const POPULAR = [
    "youtube.com", "google.com", "github.com", "en.wikipedia.org", "reddit.com", "duckduckgo.com",
    "amazon.com", "x.com", "twitter.com", "ya.ru", "wikipedia.org", "maps.google.com", "translate.google.com",
    "stackoverflow.com", "imdb.com", "twitch.tv", "spotify.com", "netflix.com", "music.youtube.com",
    "chatgpt.com", "perplexity.ai", "npmjs.com", "developer.mozilla.org", "archlinux.org",
  ];

  /**
   * Bangs whose trigger starts with `prefix`, for autocomplete. The catalog is roughly
   * ordered by popularity, so that order ranks them; an exact trigger match comes first.
   */
  function suggest(prefix, limit = 6) {
    if (!resolver) {
      load();
      return [];
    }
    const p = prefix.toLowerCase();
    const found = [];
    const boosted = new Set();
    for (let i = 0; i < catalog.length && found.length < 200; i++) {
      const entry = catalog[i];
      let best = null;
      for (const t of entry.ts) {
        const lt = t.toLowerCase();
        if (lt.startsWith(p) && (best === null || lt.length < best.length)) best = lt;
      }
      if (best === null) continue;
      let origin = "";
      try {
        const url = new URL(entry.u);
        if (!url.hostname.includes("{")) origin = url.origin;
      } catch {}
      const host = origin.replace(/^https?:\/\/(www\.)?/, "");
      // only a service's main bang gets the boost, not all its variants
      const boost = boosted.has(host) ? -1 : POPULAR.indexOf(host);
      if (boost >= 0) boosted.add(host);
      // exact trigger first, then well-known services, then catalog order
      const rank = best === p ? -1e6 : boost >= 0 ? -1e5 + boost : i;
      found.push({ trigger: best, service: entry.s, origin, rank });
    }
    return found
      .sort((a, b) => a.rank - b.rank)
      .slice(0, limit)
      .map(({ trigger, service, origin }) => ({ trigger, service, origin }));
  }

  window.FrostpaneBangs = {
    hasBang,
    load,
    resolve,
    resolveAsync,
    suggest,
    /** Called once when the catalog finishes loading, so the UI can refresh. */
    onLoad(fn) {
      listeners.add(fn);
    },
  };
})();
