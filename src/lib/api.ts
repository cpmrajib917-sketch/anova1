// @ts-nocheck
import { Anime } from '../types';
import { ref, get, set, onValue } from "firebase/database";
import { db } from "./firebase";
import { getCustomAnimes } from "./firebaseSync";
import { fuzzySearchAnime, buildSearchIndex, generateAutoAliases, normalizeString, suggestCorrectedKeyword, isMovieItem } from "./fuzzySearch";
import { ToonStreamConnector } from '../services/toonstreamConnector';
import { MovieBoxConnector } from '../services/movieboxConnector';
import { AnikotoConnector } from '../services/anikotoConnector';
import { enrichAnimeWithMetadata, isInvalidImage, getCachedMetadata, cleanTitleForMetadataSearch } from '../services/animeMetadataService';
import { COMPREHENSIVE_ANIME_CATALOG } from '../data/animeDatabase';
import { 
  getVerifiedAnimeImage, 
  GUARANTEED_FALLBACK_POSTER, 
  GUARANTEED_FALLBACK_BANNER,
  getDynamicAnimeFallbackPoster,
  getDynamicAnimeFallbackBanner
} from '../data/verifiedImages';

const BASE_URL = "/api/kryzox";

export interface GlobalContentSettings {
  myDatabase: boolean;
  fourAnimo: boolean;
  imported: boolean;
  toonStream: boolean;
  movieBox: boolean;
  anikoto: boolean;
  hideRestrictedPlaylists: boolean;
  hideMembersOnly: boolean;
  hideEmbedDisabled: boolean;
  hideRegionLocked: boolean;
  hidePrivatePlaylists: boolean;
  hidePlaybackRestricted: boolean;
}

export let globalSettings: GlobalContentSettings = {
  myDatabase: true,
  fourAnimo: true,
  imported: true,
  toonStream: true,
  movieBox: true,
  anikoto: true,
  hideRestrictedPlaylists: false,
  hideMembersOnly: false,
  hideEmbedDisabled: false,
  hideRegionLocked: false,
  hidePrivatePlaylists: false,
  hidePlaybackRestricted: false
};

// Check if we are running in browser context
const isBrowser = typeof window !== 'undefined';

export const brokenAnimesSet = new Set<string>();

if (isBrowser) {
  try {
    const saved = localStorage.getItem('anova_global_content_settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      globalSettings = { ...globalSettings, ...parsed, fourAnimo: parsed.fourAnimo !== false, toonStream: parsed.toonStream !== false, movieBox: parsed.movieBox !== false, anikoto: parsed.anikoto !== false };
    } else {
      globalSettings.fourAnimo = true;
      globalSettings.toonStream = true;
      globalSettings.movieBox = true;
      globalSettings.anikoto = true;
    }
  } catch (_) {}

  // Sync brokenAnimes from Firebase Database
  try {
    const brokenRef = ref(db, 'brokenAnimes');
    onValue(brokenRef, (snapshot) => {
      brokenAnimesSet.clear();
      if (snapshot.exists()) {
        const val = snapshot.val();
        Object.keys(val).forEach(id => {
          if (val[id] === true) {
            brokenAnimesSet.add(String(id));
          }
        });
      }
    });
  } catch (err) {
    console.error("Failed to sync brokenAnimes:", err);
  }
}

export function normalizeAndCleanEpisodes(eps: any[], animeType?: string): any[] {
  if (!Array.isArray(eps)) return [];
  
  const getYoutubeId = (url: string): string | null => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const mapped = eps.map(ep => {
    const num = Number(ep.episodeNumber !== undefined ? ep.episodeNumber : ep.number);
    return {
      ...ep,
      number: num,
      episodeNumber: num,
      title: ep.title || `Episode ${num}`,
      thumbnail: ep.thumbnail || '',
      videoSources: ep.videoSources || ep.video_sources || {}
    };
  }).filter(ep => {
    // Validate every episode before adding: episodeNumber must exist
    if (isNaN(ep.episodeNumber) || ep.episodeNumber === null || ep.episodeNumber === undefined) {
      return false;
    }
    return true;
  });

  // Filter out explicit broken/deleted/private status episodes
  const healthyEpisodes = mapped.filter(ep => {
    if (ep.status === 'broken' || ep.status === 'deleted' || ep.status === 'private' || ep.status === 'unavailable') {
      return false;
    }
    return true;
  });

  // Keep the longest full episode if duplicate episode numbers exist
  const dedupedByNum: Record<number, any> = {};
  healthyEpisodes.forEach(ep => {
    const epNum = ep.episodeNumber;
    const existing = dedupedByNum[epNum];
    if (!existing) {
      dedupedByNum[epNum] = ep;
    } else {
      const existingDuration = Number(existing.duration || existing.lengthSeconds || existing.durationInSeconds || existing.duration_seconds || 0);
      const epDuration = Number(ep.duration || ep.lengthSeconds || ep.durationInSeconds || ep.duration_seconds || 0);
      if (epDuration > existingDuration) {
        dedupedByNum[epNum] = ep;
      }
    }
  });

  const sortedByNum = Object.values(dedupedByNum).sort((a, b) => Number(a.episodeNumber) - Number(b.episodeNumber));

  // Detect and filter out duplicate YouTube IDs across all episodes to ensure uniqueness
  // "Never assign the same video to multiple episode numbers"
  const seenVideoIdsByLanguage: Record<string, Set<string>> = {
    sub: new Set<string>(),
    eng_dub: new Set<string>(),
    hindi_dub: new Set<string>(),
    other: new Set<string>()
  };

  const finalEpisodes: any[] = [];
  sortedByNum.forEach(ep => {
    const sources = ep.videoSources || {};
    let isDuplicateVideo = false;

    ['sub', 'eng_dub', 'hindi_dub', 'other'].forEach(lang => {
      const src = sources[lang];
      if (src && src.enabled && src.url) {
        const ytId = getYoutubeId(src.url);
        if (ytId) {
          if (seenVideoIdsByLanguage[lang].has(ytId)) {
            isDuplicateVideo = true;
          } else {
            seenVideoIdsByLanguage[lang].add(ytId);
          }
        }
      }
    });

    if (!isDuplicateVideo) {
      finalEpisodes.push(ep);
    }
  });

  // Sort final episodes by episodeNumber in ascending order
  return finalEpisodes.sort((a, b) => Number(a.episodeNumber) - Number(b.episodeNumber));
}

export const CORE_CATEGORIES = new Set([
  'featured',
  'trending',
  'popular',
  'topAiring',
  'recentlyAdded',
  'latest',
  'favorite',
  'completed',
  'upcoming',
  'ongoing',
  'hindi-dubbed'
]);

export const CARTOON_KEYWORDS = [
  'ben 10', 'ben10', 'transformers', 'the loud house', 'loud house', 'avatar: the last airbender',
  'avatar the last airbender', 'the legend of korra', 'legend of korra', 'korra', 'teen titans',
  'generator rex', 'gravity falls', 'adventure time', 'regular show', 'phineas and ferb',
  'rick and morty', 'doraemon', 'shin-chan', 'shin chan', 'shinchan', 'ninja hattori', 'oggy',
  'tom and jerry', 'courage the cowardly dog', 'chhota bheem', 'motu patlu', 'roll no 21',
  'dexter', 'powerpuff girls', 'johnny bravo', 'samurai jack', 'spongebob', 'sponge bob',
  'scooby-doo', 'scooby doo', 'we bare bears', 'gumball', 'arcane', 'invincible',
  'batman', 'spider-man', 'spiderman', 'superman', 'justice league', 'x-men'
];

export const isCartoonItem = (a: any): boolean => {
  if (!a) return false;
  if (a.isCartoon === true || a.type === 'Cartoon' || a.format === 'CARTOON') return true;
  if (a.categories && (a.categories.cartoon === true || a.categories.cartoons === true || a.categories['just-in-cartoons'] === true)) return true;
  if (Array.isArray(a.genres) && a.genres.some((g: string) => {
    const s = String(g).toLowerCase();
    return s.includes('cartoon') || s.includes('western animation');
  })) return true;
  const title = (a.title || a.name || '').toLowerCase();
  const idStr = (String(a.id || '')).toLowerCase();
  return CARTOON_KEYWORDS.some(kw => title.includes(kw) || idStr.includes(kw.replace(/\s+/g, '-')) || idStr.includes(kw.replace(/\s+/g, '')));
};

export const hasCategory = (anime: any, category: string): boolean => {
  if (!anime) return false;
  
  const lowerCat = (category || '').toLowerCase().trim();
  const normCat = lowerCat.replace(/[^a-z0-9]/g, '');
  if (!normCat) return false;

  // 1. Direct anime.categories check (highest authority)
  if (anime.categories && typeof anime.categories === 'object') {
    if (anime.categories[category] === true || anime.categories[lowerCat] === true || anime.categories[normCat] === true) {
      return true;
    }

    for (const [key, value] of Object.entries(anime.categories)) {
      const lowerKey = key.toLowerCase().trim();
      const normKey = lowerKey.replace(/[^a-z0-9]/g, '');
      if (lowerKey === lowerCat || normKey === normCat) {
        if (value === true) return true;
      }
    }
  }

  // 2. Cartoon / Western Animation check (Strictly Cartoons)
  if (normCat === 'cartoon' || normCat === 'cartoons' || normCat === 'justincartoons' || normCat === 'justincartoon') {
    return isCartoonItem(anime);
  }

  // If this item is a cartoon, exclude it from generic anime-only categories
  if (normCat === 'anime' || normCat === 'animeseries' || normCat === 'tvseries') {
    return !isCartoonItem(anime);
  }

  // 3. Must-Watch Series check
  if (normCat === 'mustwatch' || normCat === 'mustwatchanime' || normCat === 'mustwatchseries') {
    if (isCartoonItem(anime)) return false;
    if (anime.categories && (anime.categories.mustWatch === true || anime.categories['must-watch'] === true)) return true;
    const score = parseFloat(anime.rating || '0');
    return score >= 8.9 || anime.categories?.favorite || anime.categories?.topAiring;
  }

  // 4. Must-Watch Movies check
  if (normCat === 'mustwatchmovies' || normCat === 'mustwatchanimemovies' || normCat === 'mustwatchanimemovie') {
    if (isMovieItem(anime) || anime.type === 'Movie' || anime.format === 'MOVIE' || anime.categories?.movies) {
      const score = parseFloat(anime.rating || '0');
      return score >= 8.7 || anime.categories?.favorite || anime.categories?.movies;
    }
    return false;
  }

  // 5. Movie format check
  if (normCat === 'movies' || normCat === 'movie' || normCat === 'animemovie' || normCat === 'animemovies') {
    if (anime.categories && (anime.categories.movies === true || anime.categories.movie === true || anime.categories.animemovies === true)) return true;
    if (anime.type && (String(anime.type).toLowerCase() === 'movie' || String(anime.type).toLowerCase() === 'film')) return true;
    return isMovieItem(anime);
  }

  // 6. Ongoing check
  if (normCat === 'ongoing' || normCat === 'releasing') {
    if (anime.categories && (anime.categories.ongoing === true || anime.categories.releasing === true)) return true;
    const status = String(anime.status || '').toLowerCase();
    if (status.includes('releasing') || status.includes('ongoing') || status.includes('airing')) return true;
  }

  // 6b. Recent / Recently Added check
  if (normCat === 'recentlyadded' || normCat === 'recent' || normCat === 'newadded') {
    if (anime.categories && (anime.categories.recentlyAdded === true || anime.categories.recent === true || anime.categories.newAdded === true)) return true;
    if (anime.season_year === 2024 || anime.season_year === 2025) return true;
  }

  // 6c. Latest / Latest Episodes check (distinct from recently added, focusing on airing/ongoing with new episodes)
  if (normCat === 'latest' || normCat === 'latestepisode' || normCat === 'updated' || normCat === 'recentlyupdated') {
    if (anime.categories && (anime.categories.latest === true || anime.categories.latestEpisode === true || anime.categories.updated === true)) return true;
    const status = String(anime.status || '').toLowerCase();
    if (status.includes('releasing') || status.includes('ongoing') || status.includes('airing')) return true;
  }

  // 7. Completed check
  if (normCat === 'completed' || normCat === 'finished') {
    if (anime.categories && (anime.categories.completed === true || anime.categories.finished === true)) return true;
    const status = String(anime.status || '').toLowerCase();
    if (status.includes('completed') || status.includes('finished')) return true;
  }

  // 8. Hindi Dubbed check
  if (normCat === 'hindidubbed' || normCat === 'hindi' || normCat === 'hindidub') {
    if (anime.categories && (anime.categories['hindi-dubbed'] === true || anime.categories.hindi === true)) return true;
    if (anime.hindiAvailable === true || String(anime.language || '').toLowerCase().includes('hindi')) return true;
  }

  // 9. Bangla Dubbed check
  if (normCat === 'bangladubbed' || normCat === 'bangla' || normCat === 'bangladub') {
    if (anime.categories && (anime.categories['bangla-dubbed'] === true || anime.categories.bangla === true)) return true;
    if (String(anime.language || '').toLowerCase().includes('bangla')) return true;
  }

  // 10. English Dubbed check
  if (normCat === 'englishdubbed' || normCat === 'english' || normCat === 'englishdub') {
    if (anime.categories && (anime.categories['english-dubbed'] === true || anime.categories.english === true)) return true;
    if (String(anime.language || '').toLowerCase().includes('english')) return true;
  }

  // 8. Genre matching against anime.genres (Drama, Action, Romance, Comedy, Harem, Ecchi, etc.)
  const parsedGenres = parseAnimeGenres(anime.genres);
  if (matchGenre(category, parsedGenres)) return true;

  // 9. Substring match on parsed genres
  if (parsedGenres.some(g => {
    const normG = g.toLowerCase().replace(/[^a-z0-9]/g, '');
    return normG === normCat || normG.includes(normCat) || normCat.includes(normG);
  })) {
    return true;
  }

  return false;
};

export const ALL_GENRE_ALIASES: Record<string, string[]> = {
  'movie': ['movie', 'movies', 'anime movies', 'anime movie', 'film', 'films'],
  'anime': ['anime', 'anime series', 'tv series', 'tv show', 'tv'],
  'action': ['action'],
  'adventure': ['adventure'],
  'comedy': ['comedy'],
  'drama': ['drama'],
  'fantasy': ['fantasy'],
  'horror': ['horror'],
  'mystery': ['mystery'],
  'romance': ['romance'],
  'scifi': ['scifi', 'sci-fi', 'sci fi', 'science fiction', 'sciencefiction'],
  'sliceoflife': ['slice of life', 'sliceoflife', 'slice_of_life', 'slice-of-life', 'sol'],
  'sports': ['sports', 'sport'],
  'supernatural': ['supernatural'],
  'thriller': ['thriller'],
  'ecchi': ['ecchi', 'eccei', 'ecce'],
  'harem': ['harem'],
  'isekai': ['isekai'],
  'mecha': ['mecha', 'robot', 'robots'],
  'psychological': ['psychological'],
  'school': ['school'],
  'seinen': ['seinen'],
  'shoujo': ['shoujo', 'shojo'],
  'shounen': ['shounen', 'shonen'],
  'chibi': ['chibi'],
  'cultivation': ['cultivation'],
  'darkfantasy': ['dark fantasy', 'darkfantasy'],
  'demons': ['demons', 'demon'],
  'friendship': ['friendship'],
  'game': ['game', 'gaming'],
  'historical': ['historical'],
  'iyashikei': ['iyashikei'],
  'magic': ['magic'],
  'mahoushoujo': ['mahou shoujo', 'mahou_shoujo', 'magical girl'],
  'martialarts': ['martial arts', 'martialarts', 'martial_arts', 'martial-arts'],
  'military': ['military', 'war'],
  'music': ['music'],
  'parody': ['parody'],
  'racing': ['racing', 'cars'],
  'samurai': ['samurai'],
  'shoujoai': ['shoujo ai', 'shoujoai', 'yuri'],
  'shounenai': ['shounen ai', 'shounenai', 'yaoi'],
  'space': ['space'],
  'superpower': ['super power', 'superpower', 'powers'],
  'suspense': ['suspense'],
  'vampire': ['vampire', 'vampires'],
  'zombies': ['zombies', 'zombie'],
  'cartoons': ['cartoon', 'cartoons', 'animation', 'western animation'],
  'hindidubbed': ['hindi dubbed', 'hindi', 'hindidub', 'hindi-dubbed', 'hindi dub'],
  'bangladubbed': ['bangla dubbed', 'bangla', 'bangladub', 'bangla-dubbed', 'bangla dub'],
  'englishdubbed': ['english dubbed', 'english', 'englishdub', 'english-dubbed', 'english dub', 'dubbed'],
  'toprated': ['top rated', 'toprated', 'top-rated', 'highest rated'],
  'trending': ['trending', 'trending anime', 'popular', 'most popular'],
  'superhero': ['superhero', 'super heroes']
};

export const isGenreKeyword = (kw: string): boolean => {
  if (!kw) return false;
  const clean = kw.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!clean) return false;
  for (const [key, aliases] of Object.entries(ALL_GENRE_ALIASES)) {
    if (key === clean) return true;
    if (aliases.some(a => a.toLowerCase().replace(/[^a-z0-9]/g, '') === clean)) return true;
  }
  return false;
};

export const parseAnimeGenres = (genresInput: any): string[] => {
  if (!genresInput) return [];
  let rawList: string[] = [];
  if (Array.isArray(genresInput)) {
    rawList = genresInput.map(g => typeof g === 'object' ? (g?.name || g?.title || String(g)) : String(g));
  } else if (typeof genresInput === 'string') {
    rawList = genresInput.split(/[,\/|;]+/);
  }
  
  const seen = new Set<string>();
  const normalized: string[] = [];
  rawList.forEach(g => {
    const trimmed = g.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      normalized.push(trimmed);
    }
  });
  return normalized;
};

export const matchGenre = (categoryNameOrSlug: string, animeGenres: any): boolean => {
  if (!categoryNameOrSlug) return false;
  const parsed = parseAnimeGenres(animeGenres);
  
  const cleanString = (str: string) => {
    return str
      .toLowerCase()
      .replace(/[\u1F600-\u1F64F\u1F300-\u1F5FF\u1F680-\u1F6FF\u1F1E0-\u1F1FF\u2700-\u27BF\u1F900-\u1F9FF\u1F018-\u1F0F5\u1F300-\u1F5FF\u1F600-\u1F64F\u1F680-\u1F6FF\u1F900-\u1F9FF\u2600-\u26FF\u2700-\u27BF]/g, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();
  };

  const normCategory = cleanString(categoryNameOrSlug);
  if (!normCategory) return false;

  // If anime has parsed genres, match against them
  if (parsed.length > 0) {
    return parsed.some(genre => {
      const normGenre = cleanString(genre);
      if (!normGenre) return false;
      
      if (normCategory === normGenre) return true;

      for (const [key, aliases] of Object.entries(ALL_GENRE_ALIASES)) {
        const normAliases = aliases.map(a => cleanString(a));
        if (normAliases.includes(normCategory) && normAliases.includes(normGenre)) {
          return true;
        }
      }

      return false;
    });
  }

  return false;
};

const cache = new Map<string, { data: any, timestamp: number }>();

export function clearAnimeCaches() {
  cache.clear();
  activePromises.clear();
  if (typeof localStorage !== 'undefined') {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key.startsWith('swr_') || 
          key.startsWith('resolved_') ||
          key.startsWith('cache_') ||
          key.startsWith('anova_custom_') ||
          key.includes('custom_category_') || 
          key.includes('anime_info_') || 
          key.includes('episodes_') || 
          key.includes('api_home_data') ||
          key.includes('all_custom_animes')
        )) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => {
        try { localStorage.removeItem(k); } catch (_) {}
      });
    } catch (_) {}
  }
  if (typeof sessionStorage !== 'undefined') {
    try { sessionStorage.clear(); } catch (_) {}
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('anova_anime_updated'));
    window.dispatchEvent(new CustomEvent('anova_content_settings_changed'));
  }
}

// Hook up Realtime Database listener for content source visibility settings
try {
  const settingsRef = ref(db, 'globalContentSettings');
  onValue(settingsRef, (snap) => {
    if (snap.exists()) {
      const val = snap.val();
      globalSettings = {
        myDatabase: val.myDatabase !== false,
        fourAnimo: val.fourAnimo !== false,
        imported: val.imported !== false,
        toonStream: val.toonStream !== false,
        movieBox: val.movieBox !== false,
        hideRestrictedPlaylists: !!val.hideRestrictedPlaylists,
        hideMembersOnly: !!val.hideMembersOnly,
        hideEmbedDisabled: !!val.hideEmbedDisabled,
        hideRegionLocked: !!val.hideRegionLocked,
        hidePrivatePlaylists: !!val.hidePrivatePlaylists,
        hidePlaybackRestricted: !!val.hidePlaybackRestricted
      };
      if (isBrowser) {
        try {
          localStorage.setItem('anova_global_content_settings', JSON.stringify(globalSettings));
          // Dispatch a custom event to trigger instant re-fetch in UI
          window.dispatchEvent(new CustomEvent('anova_content_settings_changed', { detail: globalSettings }));
        } catch (_) {}
      }
      clearAnimeCaches();
    }
  }, (err) => {
    console.error("Failed to sync globalContentSettings:", err);
  });
} catch (e) {
  console.warn("Could not set up globalContentSettings real-time sync:", e);
}
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes cache TTL for ultimate speed

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const activePromises = new Map<string, Promise<any>>();

export function dedupeRequest<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  let active = activePromises.get(key);
  if (!active) {
    active = fetcher().then((res) => {
      activePromises.delete(key);
      return res;
    }).catch((err) => {
      activePromises.delete(key);
      throw err;
    });
    activePromises.set(key, active);
  }
  return active;
}

export function getPerfSettings() {
  const defaults = {
    smartPrefetch: true,
    smartCache: true,
    autoServerRanking: true,
    autoRetry: true,
    autoFailover: true,
    dnsPrefetch: true,
    preconnect: true,
    backgroundPreload: true,
    responseCache: true,
    compression: true,
  };
  try {
    const saved = localStorage.getItem('anova_perf_settings');
    if (saved) {
      return { ...defaults, ...JSON.parse(saved) };
    }
  } catch (_) {}
  return defaults;
}

export function safeLocalStorageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k !== key && (
          k.startsWith('swr_') || 
          k.startsWith('resolved_ids_') || 
          k.startsWith('cache_') ||
          k.startsWith('anilist_') ||
          k.startsWith('search_') ||
          k.includes('home_section_data_') || 
          k.includes('api_home_data') ||
          k.includes('anime_info_') ||
          k.includes('episodes_')
        )) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => {
        try { localStorage.removeItem(k); } catch (_) {}
      });

      // Retry setting key in localStorage
      localStorage.setItem(key, value);
    } catch (retryError) {
      try {
        sessionStorage.setItem(key, value);
      } catch (_) {}
      console.warn(`[Storage] LocalStorage quota exceeded for ${key}. Kept in memory/session cache.`);
    }
  }
}

export const apiCache = {
  get: (key: string): any => {
    const settings = getPerfSettings();
    if (!settings.smartCache && !settings.responseCache) {
      return null;
    }
    const checkEmpty = (val: any) => {
      if (!val) return true;
      if (Array.isArray(val) && val.length === 0) return true;
      if (typeof val === 'object' && Array.isArray(val.data) && val.data.length === 0) return true;
      return false;
    };

    // Memory Cache
    const mem = cache.get(key);
    if (mem && (Date.now() - mem.timestamp < CACHE_TTL)) {
      if (checkEmpty(mem.data)) {
        cache.delete(key);
      } else {
        return mem.data;
      }
    }

    // LocalStorage / SessionStorage Cache
    try {
      const storageKey = `swr_v4_${key}`;
      const stored = localStorage.getItem(storageKey) || sessionStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (checkEmpty(parsed)) {
          try { localStorage.removeItem(storageKey); } catch (_) {}
          try { sessionStorage.removeItem(storageKey); } catch (_) {}
        } else {
          cache.set(key, { data: parsed, timestamp: Date.now() });
          return parsed;
        }
      }
    } catch (_) {}
    return null;
  },
  set: (key: string, data: any) => {
    const settings = getPerfSettings();
    if (!settings.smartCache && !settings.responseCache) {
      return;
    }
    if (data === null || data === undefined) return;
    // Never cache empty results
    if (Array.isArray(data) && data.length === 0) return;
    if (typeof data === 'object' && Array.isArray(data.data) && data.data.length === 0) return;

    cache.set(key, { data, timestamp: Date.now() });
    safeLocalStorageSet(`swr_v4_${key}`, JSON.stringify(data));
  },
  delete: (key: string) => {
    cache.delete(key);
    try {
      localStorage.removeItem(`swr_v4_${key}`);
    } catch (_) {}
  }
};

// clearAnimeCaches is declared above on line 34

export interface ApiLog {
  id: string;
  url: string;
  statusCode: number | string;
  responseBody: string;
  headers: Record<string, string>;
  timing: number;
  retryCount: number;
  error?: string;
  timestamp: number;
}

if (typeof window !== 'undefined') {
  (window as any).__anova_api_logs = (window as any).__anova_api_logs || [];
}

export function logApiRequest(log: ApiLog) {
  if (typeof window !== 'undefined') {
    (window as any).__anova_api_logs = [log, ...(window as any).__anova_api_logs].slice(0, 50);
    window.dispatchEvent(new CustomEvent('anova_api_log_added', { detail: log }));
  }
}

const withTimeout = <T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> => {
  return Promise.race([
    promise.catch((err) => {
      console.warn("withTimeout promise rejected, using fallback:", err);
      return fallback;
    }),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))
  ]);
};

async function fetchApi(endpoint: string, retries = 3, delayMs = 1000, currentAttempt = 0): Promise<any> {
  const settings = getPerfSettings();
  const cacheKey = `fetch_${endpoint}`;
  const localData = apiCache.get(cacheKey);
  const fullUrl = `${BASE_URL}${endpoint}`;
  const startTime = performance.now();

  const fetcherPromise = (async () => {
    let statusCode: number | string = 'Unknown';
    let responseText = '';
    let headersObj: Record<string, string> = {};
    let errorMsg = '';

    // If autoRetry is disabled, force 0 retries
    const activeRetries = settings.autoRetry ? retries : 0;

    try {
      const controller = new AbortController();
      const tId = setTimeout(() => controller.abort(), 4500);
      const res = await fetch(fullUrl, { signal: controller.signal });
      clearTimeout(tId);
      statusCode = res.status;
      
      try {
        res.headers.forEach((val, key) => {
          headersObj[key] = val;
        });
      } catch (_) {}

      const contentType = res.headers.get('content-type') || '';
      responseText = await res.clone().text();

      if (!res.ok) {
        if (responseText.includes('cloudflare') || responseText.includes('cf-browser-verification') || responseText.includes('Just a moment...')) {
          errorMsg = `Cloudflare protection page detected. Status: ${res.status}`;
        } else if (contentType.includes('text/html') || responseText.trim().startsWith('<')) {
          errorMsg = `HTML returned instead of JSON. Status: ${res.status}`;
        } else {
          errorMsg = `HTTP Error ${res.status}`;
        }

        const duration = Math.round(performance.now() - startTime);
        
        // Log Perf metrics
        if (typeof window !== 'undefined') {
          const m = (window as any).__anova_perf_metrics || { apiResponseTimes: [], embedLoadTimes: [], playerInitTimes: [], cacheHits: 0, cacheMisses: 0, retries: 0 };
          m.apiResponseTimes.push(duration);
          m.retries += currentAttempt;
          (window as any).__anova_perf_metrics = m;
        }

        logApiRequest({
          id: `${Date.now()}-${Math.random()}`,
          url: fullUrl,
          statusCode,
          responseBody: responseText.slice(0, 500),
          headers: headersObj,
          timing: duration,
          retryCount: currentAttempt,
          error: errorMsg,
          timestamp: Date.now()
        });

        if (res.status === 429 || res.status >= 500) {
          if (activeRetries > 0) {
            await delay(delayMs);
            return fetchApi(endpoint, activeRetries - 1, delayMs * 2, currentAttempt + 1);
          }
          if (localData) return localData;
        }
        throw new Error(errorMsg);
      }

      if (contentType.includes('text/html') || responseText.trim().startsWith('<')) {
        errorMsg = "HTML returned instead of JSON despite 200 OK status";
        if (responseText.includes('cloudflare') || responseText.includes('cf-browser-verification') || responseText.includes('Just a moment...')) {
          errorMsg = "Cloudflare security/challenge block page (200 OK HTML)";
        }
        
        const duration = Math.round(performance.now() - startTime);
        
        // Log Perf metrics
        if (typeof window !== 'undefined') {
          const m = (window as any).__anova_perf_metrics || { apiResponseTimes: [], embedLoadTimes: [], playerInitTimes: [], cacheHits: 0, cacheMisses: 0, retries: 0 };
          m.apiResponseTimes.push(duration);
          m.retries += currentAttempt;
          (window as any).__anova_perf_metrics = m;
        }

        logApiRequest({
          id: `${Date.now()}-${Math.random()}`,
          url: fullUrl,
          statusCode,
          responseBody: responseText.slice(0, 500),
          headers: headersObj,
          timing: duration,
          retryCount: currentAttempt,
          error: errorMsg,
          timestamp: Date.now()
        });

        if (activeRetries > 0) {
          await delay(delayMs);
          return fetchApi(endpoint, activeRetries - 1, delayMs * 2, currentAttempt + 1);
        }
        if (localData) return localData;
        throw new Error(errorMsg);
      }

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e: any) {
        errorMsg = `JSON parsing failed: ${e.message}`;
        const duration = Math.round(performance.now() - startTime);
        logApiRequest({
          id: `${Date.now()}-${Math.random()}`,
          url: fullUrl,
          statusCode,
          responseBody: responseText.slice(0, 500),
          headers: headersObj,
          timing: duration,
          retryCount: currentAttempt,
          error: errorMsg,
          timestamp: Date.now()
        });
        throw new Error(errorMsg);
      }

      const duration = Math.round(performance.now() - startTime);

      // Log Perf metrics
      if (typeof window !== 'undefined') {
        const m = (window as any).__anova_perf_metrics || { apiResponseTimes: [], embedLoadTimes: [], playerInitTimes: [], cacheHits: 0, cacheMisses: 0, retries: 0 };
        m.apiResponseTimes.push(duration);
        m.retries += currentAttempt;
        (window as any).__anova_perf_metrics = m;
      }

      logApiRequest({
        id: `${Date.now()}-${Math.random()}`,
        url: fullUrl,
        statusCode,
        responseBody: responseText.slice(0, 100),
        headers: headersObj,
        timing: duration,
        retryCount: currentAttempt,
        timestamp: Date.now()
      });

      apiCache.set(cacheKey, data);
      return data;

    } catch (error: any) {
      if (statusCode === 'Unknown') {
        statusCode = 'CORS Blocked/Network Error';
        errorMsg = error.message || 'Network fetch rejected (likely CORS, CSP or server offline)';
      } else {
        errorMsg = error.message || 'Unknown fetch error';
      }

      const duration = Math.round(performance.now() - startTime);

      // Log Perf metrics
      if (typeof window !== 'undefined') {
        const m = (window as any).__anova_perf_metrics || { apiResponseTimes: [], embedLoadTimes: [], playerInitTimes: [], cacheHits: 0, cacheMisses: 0, retries: 0 };
        m.apiResponseTimes.push(duration);
        m.retries += currentAttempt;
        (window as any).__anova_perf_metrics = m;
      }

      logApiRequest({
        id: `${Date.now()}-${Math.random()}`,
        url: fullUrl,
        statusCode,
        responseBody: responseText ? responseText.slice(0, 500) : 'No response content available due to network error.',
        headers: headersObj,
        timing: duration,
        retryCount: currentAttempt,
        error: errorMsg,
        timestamp: Date.now()
      });

      console.warn(`AnOvA client status: fetch failed for ${endpoint} (${errorMsg}).`);
      
      if (activeRetries > 0) {
        await delay(delayMs);
        return fetchApi(endpoint, activeRetries - 1, delayMs * 2, currentAttempt + 1);
      }

      // Auto failover support: return local stale data if failover is enabled
      if (settings.autoFailover && localData) {
        console.info(`Auto Failover triggered for ${endpoint}. Returning stale local cache.`);
        return localData;
      }
      return null;
    }
  })();

  const dedupedPromise = dedupeRequest(cacheKey, () => fetcherPromise);

  if (localData) {
    dedupedPromise.catch(() => {});
    return localData;
  }

  return dedupedPromise;
}

export const fallbackAnimes = [
  ...COMPREHENSIVE_ANIME_CATALOG
];

const mapAnime = (item: any): Anime => {
  if (!item) return item;

  let poster = item.images?.poster || item.poster || '';
  let banner = item.images?.banner || item.banner || item.images?.poster || item.poster || '';

  let id = String(item.id);
  let title = item.titles?.english || item.titles?.romaji || item.title || 'Unknown Title';
  let al_id = item.al_id;
  let mal_id = item.mal_id;

  // Intercept and resolve broken Black Clover Season 2 records dynamically to the main high-fidelity master series
  if (
    id === '19706' || 
    String(al_id) === '195604' || 
    String(mal_id) === '61967' || 
    title.toLowerCase() === 'black clover season 2' || 
    title.toLowerCase().includes('black clover 2nd season')
  ) {
    id = '8568'; // Map to Black Clover (real Kryzox ID)
    title = 'Black Clover';
    al_id = 97940;
    mal_id = 34572;
    poster = "https://media.kitsu.app/anime/poster_images/13511/large.jpg";
    banner = "https://media.kitsu.app/anime/cover_images/13511/large.jpg";
  }

  return {
    ...item,
    id,
    title,
    poster,
    banner,
    type: item.type,
    status: item.status,
    episodes: item.episodes_count || item.episodes,
    rating: item.rating,
    description: item.description || item.synopsis,
    genres: item.genres || item.genre || item.tags || [],
    studio: item.studios?.[0]?.name || item.studio,
    al_id: al_id,
    mal_id: mal_id,
    subAvailable: item.subAvailable !== undefined ? item.subAvailable : true,
    dubAvailable: item.dubAvailable !== undefined ? item.dubAvailable : (item.dub_count ? item.dub_count > 0 : (item.dub === true)),
    source: item.source || (String(item.id).startsWith('custom-') ? 'my_database' : 'four_animo'),
    categories: item.categories || {},
  };
};

export const isInvalidPoster = (url?: string): boolean => {
  if (!url) return true;
  return isInvalidImage(url);
};

export const sanitizePosterUrl = (url?: string, title?: string, id?: string): string => {
  // 1. If an anime has its own valid, high-resolution poster from its provider, ALWAYS use it!
  if (url && !isInvalidPoster(url)) {
    return url;
  }

  // 2. Fallback: check strictly verified image dictionary by exact title
  if (title) {
    const verified = getVerifiedAnimeImage(title);
    if (verified?.poster && !isInvalidPoster(verified.poster)) {
      return verified.poster;
    }
  }

  // 3. Fallback: check cached metadata
  if (title || id) {
    const rawTitle = title || id || '';
    const cleanSearchTitle = cleanTitleForMetadataSearch(rawTitle);
    const meta = getCachedMetadata(rawTitle) || (cleanSearchTitle ? getCachedMetadata(cleanSearchTitle) : null);
    if (meta && meta.poster && !isInvalidPoster(meta.poster)) {
      return meta.poster;
    }
  }

  // 4. Fallback: check local comprehensive catalog by ID
  if (id) {
    const cleanId = String(id).replace(/^(toonstream|moviebox|anikoto)-/, '');
    const matchedById = COMPREHENSIVE_ANIME_CATALOG.find(a => String(a.id) === cleanId);
    if (matchedById && matchedById.poster && !isInvalidPoster(matchedById.poster)) {
      return matchedById.poster;
    }
  }

  // 5. Fallback: check local comprehensive catalog by exact title match only
  if (title) {
    const cleanTitle = title.toLowerCase().trim();
    const cleanTitleNorm = cleanTitle.replace(/[^a-z0-9]/g, '');
    const matchedByTitle = COMPREHENSIVE_ANIME_CATALOG.find(a => {
      const catTitle = a.title.toLowerCase().trim();
      const catTitleNorm = catTitle.replace(/[^a-z0-9]/g, '');
      return catTitle === cleanTitle || (cleanTitleNorm.length >= 5 && catTitleNorm === cleanTitleNorm);
    });
    if (matchedByTitle && matchedByTitle.poster && !isInvalidPoster(matchedByTitle.poster)) {
      return matchedByTitle.poster;
    }
  }

  return getDynamicAnimeFallbackPoster(title || id);
};

export const sanitizeBannerUrl = (bannerUrl?: string, posterUrl?: string, title?: string, id?: string): string => {
  // 1. If an anime has its own valid banner, ALWAYS prefer it!
  if (bannerUrl && !isInvalidPoster(bannerUrl)) {
    return bannerUrl;
  }

  // 2. Fallback: check strictly verified image dictionary by title
  if (title) {
    const verified = getVerifiedAnimeImage(title);
    if (verified?.banner && !isInvalidPoster(verified.banner)) {
      return verified.banner;
    }
  }

  // 3. Fallback: check cached metadata
  if (title || id) {
    const rawTitle = title || id || '';
    const cleanSearchTitle = cleanTitleForMetadataSearch(rawTitle);
    const meta = getCachedMetadata(rawTitle) || (cleanSearchTitle ? getCachedMetadata(cleanSearchTitle) : null);
    if (meta && meta.banner && !isInvalidPoster(meta.banner)) {
      return meta.banner;
    }
  }

  // 4. Fallback: check local catalog by ID
  if (id) {
    const cleanId = String(id).replace(/^(toonstream|moviebox|anikoto)-/, '');
    const matchedById = COMPREHENSIVE_ANIME_CATALOG.find(a => String(a.id) === cleanId);
    if (matchedById && matchedById.banner && !isInvalidPoster(matchedById.banner)) {
      return matchedById.banner;
    }
  }

  // 5. Fallback: check local catalog by exact title
  if (title) {
    const cleanTitle = title.toLowerCase().trim();
    const cleanTitleNorm = cleanTitle.replace(/[^a-z0-9]/g, '');
    const matchedByTitle = COMPREHENSIVE_ANIME_CATALOG.find(a => {
      const catTitle = a.title.toLowerCase().trim();
      const catTitleNorm = catTitle.replace(/[^a-z0-9]/g, '');
      return catTitle === cleanTitle || (cleanTitleNorm.length >= 5 && catTitleNorm === cleanTitleNorm);
    });
    if (matchedByTitle && matchedByTitle.banner && !isInvalidPoster(matchedByTitle.banner)) {
      return matchedByTitle.banner;
    }
  }

  if (posterUrl && !isInvalidPoster(posterUrl)) {
    return posterUrl;
  }

  return getDynamicAnimeFallbackBanner(title || id);
};

export const mapToonStreamAnime = (item: any): Anime => {
  if (!item) return item;
  let id = String(item.id || '');
  if (!id.startsWith('toonstream-')) {
    id = `toonstream-${id}`;
  }
  
  const rawTitle = item.title || '';
  const cleanTitle = cleanTitleForMetadataSearch(rawTitle) || 'Anime Series';
  const meta = getCachedMetadata(rawTitle) || getCachedMetadata(cleanTitle);

  const title = meta?.title || cleanTitle;
  const poster = meta?.poster && !isInvalidPoster(meta.poster) 
    ? meta.poster 
    : sanitizePosterUrl(item.poster, title, id);
  const banner = meta?.banner && !isInvalidPoster(meta.banner) 
    ? meta.banner 
    : ((!item.banner || isInvalidPoster(item.banner)) ? poster : item.banner);

  const cleanDesc = (item.description || '').replace(/toonstream/gi, 'Anova');
  const cleanStudio = (item.studios?.[0] || item.studio || '').replace(/toonstream/gi, 'Anova');

  return {
    ...item,
    id,
    title,
    poster,
    banner,
    type: meta?.type || item.type || 'TV',
    status: meta?.status || item.status || 'Ongoing',
    episodes: meta?.episodesCount || item.episodesCount || (Array.isArray(item.episodes) ? item.episodes.length : 12),
    rating: meta?.rating || item.rating || '8.5',
    description: meta?.description || (cleanDesc ? cleanDesc : `Watch ${title} on Anova in HD with sub and dub.`),
    genres: meta?.genres && meta.genres.length > 0 ? meta.genres : (parseAnimeGenres(item.genres) || ['Anime']),
    studio: meta?.studio || (cleanStudio ? cleanStudio : 'Anova'),
    subAvailable: true,
    dubAvailable: item.dubTypes ? item.dubTypes.length > 0 : true,
    source: 'toonstream',
    url: item.url
  };
};

export const mapMovieBoxAnime = (item: any): Anime => {
  if (!item) return item;
  let id = String(item.id || item.subjectId || '');
  if (!id.startsWith('moviebox-')) {
    id = `moviebox-${id}`;
  }
  const title = item.title || 'Unknown Title';
  const poster = sanitizePosterUrl(item.poster, title, id);
  const banner = (!item.banner || isInvalidPoster(item.banner)) ? poster : item.banner;

  return {
    ...item,
    id,
    title,
    poster,
    banner,
    type: item.type || 'Movie',
    status: item.status || 'Completed',
    episodes: item.episodesCount || (Array.isArray(item.episodes) ? item.episodes.length : 1),
    rating: item.rating || '8.8',
    description: item.description || `Watch ${title} on MovieBox. High quality streaming.`,
    genres: item.genres || ['Movie'],
    studio: item.studio || 'MovieBox',
    subAvailable: true,
    dubAvailable: true,
    source: 'moviebox',
    provider: 'moviebox',
    url: item.url || `https://themoviebox.xyz/movies/${id.replace(/^moviebox-/, '')}?id=${id.replace(/^moviebox-/, '')}`
  };
};

export const mapAnikotoAnime = (item: any): Anime => {
  if (!item) return item;
  let id = String(item.id || item.slug || '');
  if (!id.startsWith('anikoto-')) {
    id = `anikoto-${id}`;
  }
  const title = item.title || 'Unknown Title';
  const poster = sanitizePosterUrl(item.poster, title, id);
  const banner = (!item.banner || isInvalidPoster(item.banner)) ? poster : item.banner;

  return {
    ...item,
    id,
    title,
    poster,
    banner,
    type: item.type || 'TV',
    status: item.status || 'Ongoing',
    episodes: item.episodesCount || (Array.isArray(item.episodes) ? item.episodes.length : 12),
    rating: item.rating || '8.2',
    description: item.synopsis || item.description || `Watch ${title} on Anikoto. High quality streaming.`,
    genres: item.genres || ['Anime', 'Action'],
    studio: item.studios?.[0] || 'Anikoto',
    subAvailable: true,
    dubAvailable: true,
    source: 'anikoto',
    provider: 'anikoto',
    url: item.url || `https://anikototv.to/watch/${id.replace(/^anikoto-/, '')}`
  };
};

const mapAnimeList = (data: any) => {
  if (!data) return [];
  if (Array.isArray(data)) return data.map(mapAnime).filter(Boolean);
  if (data?.data?.data && Array.isArray(data.data.data)) return data.data.data.map(mapAnime).filter(Boolean);
  if (data?.data && Array.isArray(data.data)) return data.data.map(mapAnime).filter(Boolean);
  if (data?.animes && Array.isArray(data.animes)) return data.animes.map(mapAnime).filter(Boolean);
  if (data?.suggestions && Array.isArray(data.suggestions)) return data.suggestions.map(mapAnime).filter(Boolean);
  if (data?.data?.animes && Array.isArray(data.data.animes)) return data.data.animes.map(mapAnime).filter(Boolean);
  
  if (typeof data === 'object') {
    for (const key in data) {
      if (Array.isArray(data[key])) return data[key].map(mapAnime).filter(Boolean);
    }
  }
  return [];
};

export function getCanonicalAnimeKey(item: any): string {
  if (!item) return '';
  const rawTitle = String(item.title || item.titles?.english || item.name || '').trim();
  const seasonMatch = rawTitle.match(/(?:season|s)\s*(\d+)/i);
  const seasonPart = seasonMatch ? `_s${seasonMatch[1]}` : '';
  const cleanTitle = rawTitle
    .toLowerCase()
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\bthe\s+movie\b/gi, '')
    .replace(/\bmovie\b/gi, '')
    .replace(/season\s*\d+|s\d+/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
  
  if (cleanTitle && cleanTitle.length >= 3) {
    return `title_${cleanTitle}${seasonPart}`;
  }
  return `id_${String(item.id || rawTitle).trim().toLowerCase()}`;
}

export function filterAndDeduplicateAnimes(animes: any[]): any[] {
  if (!animes) return [];

  // Filter based on active global settings and valid playable metadata
  const filteredAnimes = animes.filter(anime => {
    if (!anime) return false;

    const idStr = String(anime.id || '').trim();

    // Filter out known broken custom playlist/anime IDs or unplayable items that cause black/blue screen
    if (
      !idStr ||
      idStr === 'yt-pl-PLxSscENEp7JgVHy1m2-yD5jbgOGDyqSLc' || 
      idStr.includes('PLxSscENEp7JgVHy1m2-yD5jbgOGDyqSLc') || 
      brokenAnimesSet.has(idStr) ||
      anime.status === 'broken' ||
      anime.status === 'unplayable' ||
      anime.status === 'error' ||
      anime.isPlayable === false ||
      anime.playable === false
    ) {
      return false;
    }

    // Ensure valid title exists
    if (!anime.title || anime.title === 'Unknown Title') {
      return false;
    }

    const isImported = anime.source === 'imported' || anime.imported === true || anime.isImported === true || String(anime.source || '').includes('import') || idStr.startsWith('movie-yt-') || idStr.startsWith('yt-') || idStr.startsWith('ai-scrape-');
    const isToonStream = anime.source === 'toonstream' || idStr.startsWith('toonstream-');
    const isMovieBox = anime.source === 'moviebox' || idStr.startsWith('moviebox-');
    const isMyDatabase = anime.source === 'my_database' || idStr.startsWith('custom-');
    const isFourAnimo = anime.source === 'four_animo' || idStr.startsWith('4animo-') || idStr.startsWith('kryzox-');

    const source = isImported 
      ? 'imported' 
      : (isMyDatabase 
          ? 'my_database' 
          : (isToonStream 
              ? 'toonstream' 
              : (isMovieBox 
                  ? 'moviebox' 
                  : (isFourAnimo ? 'four_animo' : (anime.source || 'four_animo')))));
    
    // Evaluate smart YouTube playlist restriction hiding
    if (anime.validationStatus) {
      const vStatus = anime.validationStatus;
      if (globalSettings.hideRestrictedPlaylists && vStatus !== 'AVAILABLE') {
        return false;
      }
      if (globalSettings.hideMembersOnly && vStatus === 'MEMBERS_ONLY') {
        return false;
      }
      if (globalSettings.hideEmbedDisabled && vStatus === 'EMBED_DISABLED') {
        return false;
      }
      if (globalSettings.hideRegionLocked && vStatus === 'REGION_BLOCKED') {
        return false;
      }
      if (globalSettings.hidePrivatePlaylists && (vStatus === 'PRIVATE' || vStatus === 'UNAVAILABLE')) {
        return false;
      }
      if (globalSettings.hidePlaybackRestricted && (vStatus === 'PLAYBACK_RESTRICTED' || vStatus === 'SUBSCRIPTION_REQUIRED')) {
        return false;
      }
    }

    if (source === 'my_database') return globalSettings.myDatabase !== false;
    if (source === 'imported') return globalSettings.imported !== false;
    if (source === 'four_animo') return globalSettings.fourAnimo !== false;
    if (source === 'toonstream') return globalSettings.toonStream !== false;
    if (source === 'moviebox' || idStr.startsWith('moviebox-')) return globalSettings.movieBox !== false;
    if (source === 'anikoto' || idStr.startsWith('anikoto-')) return globalSettings.anikoto !== false;
    return true;
  });

  // Deduplicate based on canonical key (title + season) AND unique anime ID
  const grouped = new Map<string, any>();
  const idToKeyMap = new Map<string, string>();

  const priorityScore = (a: any) => {
    let score = 0;
    const isImported = a.source === 'imported' || a.imported === true || a.isImported === true;
    const isToonStream = a.source === 'toonstream' || String(a.id).startsWith('toonstream-');
    const src = a.source || (isImported ? 'imported' : (String(a.id).startsWith('custom-') ? 'my_database' : (isToonStream ? 'toonstream' : 'four_animo')));
    if (src === 'my_database') score += 40;
    else if (src === 'toonstream') score += 30;
    else if (src === 'imported') score += 20;
    else if (src === 'four_animo') score += 10;

    if (a.poster && !isInvalidPoster(a.poster)) score += 5;
    const epCount = a.episodes || a.episodes_count || 0;
    if (typeof epCount === 'number' && epCount > 0) score += 2;
    return score;
  };

  filteredAnimes.forEach(anime => {
    if (!anime || !anime.id) return;
    const titleKey = getCanonicalAnimeKey(anime);
    const normId = String(anime.id).trim().toLowerCase();

    // Check if we already have this anime by canonical title key OR by exact ID
    const existingKey = idToKeyMap.get(normId) || (grouped.has(titleKey) ? titleKey : null);
    const existing = existingKey ? grouped.get(existingKey) : null;

    if (!existing) {
      grouped.set(titleKey, anime);
      idToKeyMap.set(normId, titleKey);
      return;
    }

    if (priorityScore(anime) > priorityScore(existing)) {
      // Remove old references
      const oldNormId = String(existing.id).trim().toLowerCase();
      idToKeyMap.delete(oldNormId);
      if (existingKey) grouped.delete(existingKey);

      grouped.set(titleKey, anime);
      idToKeyMap.set(normId, titleKey);
    }
  });

  // Final sanity pass to guarantee 100% ID uniqueness in the output array
  const finalUnique: any[] = [];
  const finalSeenIds = new Set<string>();
  for (const item of grouped.values()) {
    if (!item || !item.id) continue;
    const normId = String(item.id).trim().toLowerCase();
    if (finalSeenIds.has(normId)) continue;
    finalSeenIds.add(normId);
    finalUnique.push(item);
  }

  return finalUnique;
}

const getCustomByCategory = async (category: string): Promise<Anime[]> => {
  const cacheKey = `custom_category_${category}`;
  const cached = apiCache.get(cacheKey);

  const fetcher = async () => {
    try {
      const animesRef = ref(db, 'animes');
      const snap = await withTimeout(get(animesRef), 3000, null);
      if (snap && snap.exists()) {
        const val = snap.val();
        const normCat = category.toLowerCase().trim();

        const data = Object.values(val)
          .filter((a: any) => {
            if (!a || a.visibility === 'draft') return false;
            return hasCategory(a, category);
          })
          .map((a: any) => {
            const isImported = a.source === 'imported' || a.imported === true || a.isImported === true;
            return mapAnime({
              ...a,
              id: String(a.id),
              source: isImported ? 'imported' : (a.source || 'my_database')
            });
          });
        apiCache.set(cacheKey, data);
        return data;
      }
    } catch (e) {
      console.error("Failed to fetch custom animes for category:", category, e);
    }
    return cached || [];
  };

  const dedupedPromise = dedupeRequest(cacheKey, fetcher);

  if (cached) {
    dedupedPromise.catch(() => {});
    return cached;
  }

  return dedupedPromise;
};

export const legacyToRealIdMap: Record<string, string> = {
  "1": "12",      // One Piece
  "2": "20",      // Naruto Original
  "11": "11",     // Naruto Shippuden
  "3": "6436",    // Attack on Titan
  "4": "15334",   // Demon Slayer
  "5": "11777",   // Jujutsu Kaisen
  "6": "16262",   // Solo Leveling
  "7": "13508",   // Chainsaw Man
  "8": "16467",   // Frieren
  "9": "174070",  // Sakamoto Days
  "10": "171018", // Dandadan
  "13": "8568",   // Black Clover
  "14": "15818",  // Witch Hat Atelier
  "15": "33456",  // Crowned in a Hundred Days
  "16": "16809",  // Pokémon Horizons
  "17": "55530",  // Noob Academy
  "18": "8127",   // Your Name
  "19": "15358",  // Suzume
  "20": "7678",   // A Silent Voice
  "21": "10832",  // Weathering With You
};

export const localToKryzoxIdMap: Record<string, string> = {
  "1": "12",      // One Piece
  "2": "20",      // Naruto Original
  "11": "11",     // Naruto Shippuden
  "3": "6436",    // Attack on Titan
  "4": "15334",   // Demon Slayer
  "5": "11777",   // Jujutsu Kaisen
  "6": "16262",   // Solo Leveling
  "7": "13508",   // Chainsaw Man
  "8": "16467",   // Frieren
  "9": "174070",  // Sakamoto Days
  "10": "171018", // Dandadan
  "13": "8568",   // Black Clover
  "14": "15818",  // Witch Hat Atelier
  "15": "33456",  // Crowned in a Hundred Days
  "16": "16809",  // Pokémon Horizons
  "18": "8127",   // Your Name
  "19": "15358",  // Suzume
  "20": "7678",   // A Silent Voice
  "21": "10832",  // Weathering With You
  "another": "5580",
  "parasyte": "7363",
  "monster": "219",
  "cyberpunk-edgerunners": "15206",
  "neon-genesis-evangelion": "17",
  "re-zero": "8785",
  "death-note": "244",
  "tokyo-ghoul": "6779",
  "steins-gate": "4266",
  "cowboy-bebop": "1",
  "fullmetal-alchemist-brotherhood": "3673",
  "hunter-x-hunter": "6444",
  "bleach": "238",
  "bleach-tybw": "15074",
  "vinland-saga": "11342",
  "code-geass": "305",
  "kaiju-no-8": "16314",
  "wind-breaker": "16757",
  "oshi-no-ko": "15763",
  "spy-x-family": "15007",
  "jujutsu-kaisen": "11777",
  "demon-slayer": "15334",
  "attack-on-titan": "6436",
  "solo-leveling": "16262",
  "frieren": "16467",
  "one-piece": "12",
  "naruto": "20",
  "naruto-shippuden": "11",
  "black-clover": "8568",
  "your-name": "8127",
  "suzume": "15358",
  "a-silent-voice": "7678",
  "weathering-with-you": "10832",
  "doraemon": "2471",
  "shin-chan": "2735",
};

export const api = {
  _homeInternal: async () => {
    // Parallelize all three calls: customAnimes, dynamicSections, and liveData
    const customAnimesPromise = (async () => {
      const cacheKey = "all_custom_animes";
      const cached = apiCache.get(cacheKey);
      try {
        const snap = await withTimeout(get(ref(db, 'animes')), 5000, null);
        if (snap && snap.exists()) {
          const val = snap.val();
          const mapped = Object.values(val)
            .filter((a: any) => a && a.visibility !== 'draft')
            .map((a: any) => {
              const isImported = a.source === 'imported' || a.imported === true || a.isImported === true || String(a.source || '').includes('import') || String(a.id || '').startsWith('movie-yt-') || String(a.id || '').startsWith('yt-');
              return {
                ...a,
                id: String(a.id),
                source: isImported ? 'imported' : (a.source || 'my_database')
              };
            });
          apiCache.set(cacheKey, mapped);
          return mapped;
        }
      } catch (e) {
        console.error("Firebase custom animes fetch failed:", e);
      }
      return cached || [];
    })();

    const dynamicSectionsPromise = (async () => {
      try {
        const snap = await withTimeout(get(ref(db, 'homepageSections')), 3000, null);
        if (snap && snap.exists()) {
          const rawSecs = Object.values(snap.val()) as any[];
          return rawSecs.sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0));
        } else {
          const defaultSections = [
            { id: 'featured', name: 'Featured', slug: 'featured', displayOrder: 1, numCards: 12, visible: true, status: 'active' },
            { id: 'trending', name: 'Trending', slug: 'trending', displayOrder: 2, numCards: 12, visible: true, status: 'active' },
            { id: 'popular', name: 'Popular', slug: 'popular', displayOrder: 3, numCards: 12, visible: true, status: 'active' },
            { id: 'topAiring', name: 'Top Airing', slug: 'topAiring', displayOrder: 4, numCards: 12, visible: true, status: 'active' },
            { id: 'recentlyAdded', name: 'Recently Added', slug: 'recentlyAdded', displayOrder: 5, numCards: 12, visible: true, status: 'active' },
            { id: 'latest', name: 'Latest', slug: 'latest', displayOrder: 6, numCards: 12, visible: true, status: 'active' },
            { id: 'favorite', name: 'Most Favorite', slug: 'favorite', displayOrder: 7, numCards: 12, visible: true, status: 'active' },
            { id: 'completed', name: 'Completed', slug: 'completed', displayOrder: 8, numCards: 12, visible: true, status: 'active' },
            { id: 'upcoming', name: 'Upcoming', slug: 'upcoming', displayOrder: 9, numCards: 12, visible: true, status: 'active' },
            { id: 'hindi-dubbed', name: 'Hindi Dubbed', slug: 'hindi-dubbed', displayOrder: 10, numCards: 12, visible: true, status: 'active' },
          ];
          for (const sec of defaultSections) {
            set(ref(db, `homepageSections/${sec.id}`), sec).catch(() => {});
          }
          return [...defaultSections].sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0));
        }
      } catch (e) {
        console.error("Firebase dynamic sections fetch/seed failed:", e);
      }
      return [];
    })();

    const liveDataPromise = (async () => {
      try {
        const live = await withTimeout(fetchApi("/home"), 4500, null);
        if (live && live.data) {
          const d = live.data;
          // Normalize newer kryzox API key names to what the Home page expects
          return {
            ...d,
            mostFavoriteAnimes: d.mostFavoriteAnimes || d.mostFavorite || [],
            completedAnimes: d.completedAnimes || d.justCompleted || [],
            topUpcomingAnimes: d.topUpcomingAnimes || d.topUpcoming || [],
            trending: d.trending || d.spotlight || [],
          };
        }
      } catch (e) {
        console.error("Home API fetch failed, falling back to mock dataset:", e);
      }
      return null;
    })();

    const toonStreamPromise = (async () => {
      if (globalSettings.toonStream) {
        try {
          return await withTimeout(ToonStreamConnector.getHome(), 4000, null);
        } catch (e) {
          console.error("ToonStream Home Connector failed:", e);
        }
      }
      return null;
    })();

    const movieBoxPromise = (async () => {
      if (globalSettings.movieBox) {
        try {
          return await withTimeout(MovieBoxConnector.getHome(), 4000, null);
        } catch (e) {
          console.error("MovieBox Home Connector failed:", e);
        }
      }
      return null;
    })();

    const anikotoPromise = (async () => {
      if (globalSettings.anikoto) {
        try {
          return await withTimeout(AnikotoConnector.getHome(), 4000, null);
        } catch (e) {
          console.error("Anikoto Home Connector failed:", e);
        }
      }
      return null;
    })();

    const [customAnimesRaw, rawDynamicSections, liveDataRaw, toonStreamRaw, movieBoxRaw, anikotoRaw] = await Promise.all([
      customAnimesPromise,
      dynamicSectionsPromise,
      liveDataPromise,
      toonStreamPromise,
      movieBoxPromise,
      anikotoPromise
    ]);

    const customAnimes = customAnimesRaw as any[];
    const dynamicSections = rawDynamicSections as any[];

    const getCustomLocal = (catName: string) => {
      return customAnimes
        .filter(a => a && a.visibility !== 'draft' && hasCategory(a, catName))
        .map(a => ({
          ...a,
          id: String(a.id)
        }));
    };

    let liveData = liveDataRaw;
    if (!liveData) {
      liveData = {
        trending: fallbackAnimes.slice(0, 8),
        mostPopular: fallbackAnimes.slice(3, 11),
        newAdded: fallbackAnimes.slice(5, 13),
        topAiring: {
          all: fallbackAnimes.slice(2, 10)
        },
        latestEpisode: fallbackAnimes.slice(4, 12),
        completedAnimes: fallbackAnimes.filter(a => a.status === 'Completed'),
        topUpcomingAnimes: fallbackAnimes.filter(a => a.status === 'Ongoing').slice(0, 8),
        mostFavoriteAnimes: fallbackAnimes.slice(1, 9)
      };
    }

    const tsTrending = (toonStreamRaw?.trending || []).map(mapToonStreamAnime);
    const tsLatest = (toonStreamRaw?.latest || []).map(mapToonStreamAnime);
    const tsPopular = (toonStreamRaw?.popular || []).map(mapToonStreamAnime);
    const tsMovies = (toonStreamRaw?.movies || []).map(mapToonStreamAnime);
    const tsUpdated = (toonStreamRaw?.recentlyUpdated || []).map(mapToonStreamAnime);

    const mbTrending = (movieBoxRaw?.trending || []).map(mapMovieBoxAnime);
    const mbLatest = (movieBoxRaw?.latest || []).map(mapMovieBoxAnime);
    const mbPopular = (movieBoxRaw?.popular || []).map(mapMovieBoxAnime);
    const mbMovies = (movieBoxRaw?.movies || []).map(mapMovieBoxAnime);
    const mbUpdated = (movieBoxRaw?.recentlyUpdated || []).map(mapMovieBoxAnime);

    const akTrending = (anikotoRaw?.trending || []).map(mapAnikotoAnime);
    const akLatest = (anikotoRaw?.latest || []).map(mapAnikotoAnime);
    const akPopular = (anikotoRaw?.popular || []).map(mapAnikotoAnime);

    const allVisibleCustom = filterAndDeduplicateAnimes(
      customAnimes.map(a => mapAnime({
        ...a,
        id: String(a.id),
        source: a.source || 'my_database'
      }))
    );

    const hasCustomUploads = allVisibleCustom.length > 0;

    const customTrending = getCustomLocal('trending').map(mapAnime);
    const trendingList = filterAndDeduplicateAnimes([
      ...customTrending,
      ...tsTrending,
      ...mbTrending,
      ...(globalSettings.fourAnimo && liveData?.trending ? liveData.trending.map(mapAnime) : []),
      ...(globalSettings.fourAnimo ? fallbackAnimes.slice(0, 8).map(mapAnime) : [])
    ]);

    const customPopular = getCustomLocal('popular').map(mapAnime);
    const mostPopularList = filterAndDeduplicateAnimes([
      ...customPopular,
      ...tsPopular,
      ...mbPopular,
      ...(globalSettings.fourAnimo && liveData?.mostPopular ? liveData.mostPopular.map(mapAnime) : []),
      ...(globalSettings.fourAnimo ? fallbackAnimes.slice(3, 11).map(mapAnime) : [])
    ]);

    const customNew = getCustomLocal('recentlyAdded').map(mapAnime);
    const newAddedList = filterAndDeduplicateAnimes([
      ...customNew,
      ...tsUpdated,
      ...mbUpdated,
      ...(globalSettings.fourAnimo && liveData?.newAdded ? liveData.newAdded.map(mapAnime) : []),
      ...(globalSettings.fourAnimo ? fallbackAnimes.slice(5, 13).map(mapAnime) : [])
    ]);

    const customAiring = getCustomLocal('topAiring').map(mapAnime);
    const topAiringList = filterAndDeduplicateAnimes([
      ...customAiring,
      ...tsTrending,
      ...mbTrending,
      ...(globalSettings.fourAnimo && liveData?.topAiring?.all ? liveData.topAiring.all.map(mapAnime) : []),
      ...(globalSettings.fourAnimo ? fallbackAnimes.slice(2, 10).map(mapAnime) : [])
    ]);

    const customLatest = getCustomLocal('latest').map(mapAnime);
    const newAddedKeys = new Set(newAddedList.map(a => (String(a.title || a.name || a.id)).toLowerCase().replace(/[^a-z0-9]/g, '')));
    const latestEpisodeList = filterAndDeduplicateAnimes([
      ...customLatest,
      ...tsLatest.filter(a => !newAddedKeys.has((String(a.title || a.name || a.id)).toLowerCase().replace(/[^a-z0-9]/g, ''))),
      ...mbLatest.filter(a => !newAddedKeys.has((String(a.title || a.name || a.id)).toLowerCase().replace(/[^a-z0-9]/g, ''))),
      ...(globalSettings.fourAnimo && liveData?.latestEpisode ? liveData.latestEpisode.map(mapAnime).filter((a: Anime) => !newAddedKeys.has((String(a.title || a.name || a.id)).toLowerCase().replace(/[^a-z0-9]/g, ''))) : []),
      ...(globalSettings.fourAnimo ? fallbackAnimes.filter(a => a.status === 'Ongoing' && !newAddedKeys.has((String(a.title || a.name || a.id)).toLowerCase().replace(/[^a-z0-9]/g, ''))).map(mapAnime) : [])
    ]);

    const customCompleted = getCustomLocal('completed').map(mapAnime);
    const completedAnimesList = filterAndDeduplicateAnimes([
      ...customCompleted,
      ...tsPopular,
      ...mbMovies,
      ...(globalSettings.fourAnimo && liveData?.completedAnimes ? liveData.completedAnimes.map(mapAnime) : []),
      ...(globalSettings.fourAnimo ? fallbackAnimes.filter(a => a.status === 'Completed').map(mapAnime) : [])
    ]);

    const customUpcoming = getCustomLocal('upcoming').map(mapAnime);
    const topUpcomingAnimesList = filterAndDeduplicateAnimes([
      ...customUpcoming,
      ...tsTrending,
      ...(globalSettings.fourAnimo && liveData?.topUpcomingAnimes ? liveData.topUpcomingAnimes.map(mapAnime) : []),
      ...(globalSettings.fourAnimo ? fallbackAnimes.filter(a => a.status === 'Ongoing').slice(0, 8).map(mapAnime) : [])
    ]);

    const customFavorite = getCustomLocal('favorite').map(mapAnime);
    const mostFavoriteAnimesList = filterAndDeduplicateAnimes([
      ...customFavorite,
      ...tsPopular,
      ...(globalSettings.fourAnimo && liveData?.mostFavoriteAnimes ? liveData.mostFavoriteAnimes.map(mapAnime) : []),
      ...(globalSettings.fourAnimo ? fallbackAnimes.slice(1, 9).map(mapAnime) : [])
    ]);

    return {
      data: {
        trending: trendingList,
        mostPopular: mostPopularList,
        newAdded: newAddedList,
        topAiring: {
          all: topAiringList
        },
        latestEpisode: latestEpisodeList,
        completedAnimes: completedAnimesList,
        topUpcomingAnimes: topUpcomingAnimesList,
        mostFavoriteAnimes: mostFavoriteAnimesList
      },
      dynamicSections: dynamicSections.map(sec => {
        let sectionAnimes: any[] = [];
        const normSlug = sec.slug ? sec.slug.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
        const normId = sec.id ? sec.id.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
        const normName = sec.name ? sec.name.toLowerCase().replace(/[^a-z0-9]/g, '') : '';

        const isMatch = (key: string) => {
          const normKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
          return normSlug === normKey || normId === normKey || normName === normKey;
        };

        if (isMatch('trending') || isMatch('trendinganime')) {
          sectionAnimes = trendingList;
        } else if (isMatch('popular') || isMatch('mostpopular')) {
          sectionAnimes = mostPopularList;
        } else if (isMatch('recentlyadded') || isMatch('recent')) {
          sectionAnimes = newAddedList;
        } else if (isMatch('topairing')) {
          sectionAnimes = topAiringList;
        } else if (isMatch('latest') || isMatch('updated')) {
          sectionAnimes = latestEpisodeList;
        } else if (isMatch('completed')) {
          sectionAnimes = completedAnimesList;
        } else if (isMatch('upcoming')) {
          sectionAnimes = topUpcomingAnimesList;
        } else if (isMatch('favorite')) {
          sectionAnimes = mostFavoriteAnimesList;
        } else if (isMatch('featured')) {
          const customFeatured = getCustomLocal('featured');
          if (customFeatured.length > 0) {
            sectionAnimes = filterAndDeduplicateAnimes(customFeatured.map(mapAnime));
          } else if (globalSettings.toonStream && tsTrending.length > 0) {
            sectionAnimes = tsTrending;
          } else if (hasCustomUploads) {
            sectionAnimes = allVisibleCustom.slice(0, 12);
          } else if (globalSettings.fourAnimo) {
            sectionAnimes = trendingList;
          } else {
            sectionAnimes = [];
          }
        } else if (isMatch('hindi-dubbed') || isMatch('hindidubbed')) {
          const customHindi = getCustomLocal('hindi-dubbed');
          if (customHindi.length > 0) {
            sectionAnimes = filterAndDeduplicateAnimes(customHindi.map(mapAnime));
          } else if (hasCustomUploads) {
            const hindiUploads = allVisibleCustom.filter(a => a.hindiAvailable || String(a.language || '').toLowerCase().includes('hindi'));
            sectionAnimes = hindiUploads.length > 0 ? hindiUploads : (globalSettings.toonStream ? tsPopular : []);
          } else if (globalSettings.toonStream && tsPopular.length > 0) {
            sectionAnimes = tsPopular;
          } else if (globalSettings.fourAnimo) {
            sectionAnimes = filterAndDeduplicateAnimes(fallbackAnimes.filter(a => a.hindiAvailable || a.language?.toLowerCase().includes('hindi')).map(mapAnime));
          } else {
            sectionAnimes = [];
          }
        } else if (isMatch('ongoing')) {
          const customOngoing = getCustomLocal('ongoing');
          if (customOngoing.length > 0) {
            sectionAnimes = filterAndDeduplicateAnimes(customOngoing.map(mapAnime));
          } else if (hasCustomUploads) {
            const ongoingUploads = allVisibleCustom.filter(a => String(a.status || '').toLowerCase().includes('releasing') || String(a.status || '').toLowerCase().includes('ongoing'));
            sectionAnimes = ongoingUploads.length > 0 ? ongoingUploads : (globalSettings.toonStream ? tsUpdated : []);
          } else if (globalSettings.toonStream && tsUpdated.length > 0) {
            sectionAnimes = tsUpdated;
          } else if (globalSettings.fourAnimo) {
            sectionAnimes = filterAndDeduplicateAnimes(fallbackAnimes.filter(a => a.status === 'Ongoing').map(mapAnime));
          } else {
            sectionAnimes = [];
          }
        } else if (isMatch('movies') || isMatch('movie')) {
          const customMovies = getCustomLocal('movies');
          if (customMovies.length > 0) {
            sectionAnimes = filterAndDeduplicateAnimes(customMovies.map(mapAnime));
          } else if (globalSettings.toonStream && tsMovies.length > 0) {
            sectionAnimes = tsMovies;
          } else if (hasCustomUploads) {
            const movieUploads = allVisibleCustom.filter(a => isMovieItem(a) || hasCategory(a, 'movies'));
            sectionAnimes = movieUploads.length > 0 ? movieUploads : (globalSettings.toonStream ? tsMovies : []);
          } else if (globalSettings.fourAnimo) {
            sectionAnimes = filterAndDeduplicateAnimes(fallbackAnimes.filter(a => a.type === 'Movie').map(mapAnime));
          } else {
            sectionAnimes = globalSettings.toonStream ? tsMovies : [];
          }
        } else {
          const keysToTry = [sec.slug, sec.id, sec.name].filter(Boolean);
          let matchedCustom: any[] = [];

          for (const k of keysToTry) {
            if (matchedCustom.length === 0 && k) {
              matchedCustom = customAnimes.filter(a => hasCategory(a, k));
            }
          }

          if (matchedCustom.length > 0) {
            sectionAnimes = filterAndDeduplicateAnimes(matchedCustom.map(mapAnime));
          } else {
            // Try genre match in customAnimes
            let matchedByGenre: any[] = [];
            for (const k of keysToTry) {
              if (matchedByGenre.length === 0 && k) {
                matchedByGenre = allVisibleCustom.filter(a => matchGenre(k, parseAnimeGenres(a.genres)));
              }
            }

            if (matchedByGenre.length > 0) {
              sectionAnimes = filterAndDeduplicateAnimes(matchedByGenre.map(mapAnime));
            } else {
              // Try genre match in fallbackAnimes
              let matchedFallback: any[] = [];
              for (const k of keysToTry) {
                if (matchedFallback.length === 0 && k) {
                  matchedFallback = fallbackAnimes.filter(a => matchGenre(k, parseAnimeGenres(a.genres)));
                }
              }

              if (matchedFallback.length > 0) {
                sectionAnimes = filterAndDeduplicateAnimes(matchedFallback.map(mapAnime));
              } else {
                // If custom category has no matched anime, keep it empty so no unrelated anime is forced into it
                sectionAnimes = [];
              }
            }
          }
        }

        console.log(`Homepage [${sec.slug || sec.id || sec.name}]: Found ${sectionAnimes.length} anime`);
        return {
          ...sec,
          animes: sectionAnimes.slice(0, sec.numCards || 12)
        };
      })
    };
  },
  home: async (forceFresh = false) => {
    const cacheKey = "api_home_data";
    const cached = apiCache.get(cacheKey);

    const fetcherPromise = api._homeInternal().then((res) => {
      apiCache.set(cacheKey, res);
      return res;
    });

    const dedupedPromise = dedupeRequest(cacheKey, () => fetcherPromise);

    if (cached && !forceFresh) {
      dedupedPromise.catch(() => {});
      return cached;
    }

    return dedupedPromise;
  },
  category: async (categorySlug: string, categoryName?: string): Promise<Anime[]> => {
    const normSlug = (categorySlug || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const isMovieCategory = normSlug === 'movie' || normSlug === 'movies' || normSlug === 'animemovies' || normSlug === '4kmovies';
    const searchKw = categoryName || categorySlug;

    // 1. Get custom local animes matching this category or category name
    let custom = await getCustomByCategory(categorySlug);
    if (custom.length === 0 && categoryName && categoryName !== categorySlug) {
      custom = await getCustomByCategory(categoryName);
    }

    // 2. MovieBox connector candidates (specialized high-res movies)
    let mbCandidates: Anime[] = [];
    if (isMovieCategory && globalSettings.moviebox) {
      try {
        const mbHome = await MovieBoxConnector.getHome();
        if (mbHome) {
          const mbList = [...(mbHome.movies || []), ...(mbHome.popular || []), ...(mbHome.trending || [])];
          mbCandidates = mbList.map(mapMovieBoxAnime);
        }
      } catch (e) {
        console.error("MovieBox Category fetch failed:", e);
      }
    }

    // 3. ToonStream connector candidates
    let tsCandidates: Anime[] = [];
    if (globalSettings.toonStream) {
      try {
        const homeData = await ToonStreamConnector.getHome();
        if (homeData) {
          if (isMovieCategory) {
            tsCandidates = (homeData.movies || []).map(mapToonStreamAnime);
          } else if (normSlug === 'trending') {
            tsCandidates = (homeData.trending || []).map(mapToonStreamAnime);
          } else if (normSlug === 'popular') {
            tsCandidates = (homeData.popular || []).map(mapToonStreamAnime);
          } else if (normSlug === 'latest' || normSlug === 'recentlyadded' || normSlug === 'newreleases') {
            tsCandidates = [...(homeData.latest || []), ...(homeData.recentlyUpdated || [])].map(mapToonStreamAnime);
          } else if (normSlug === 'topairing' || normSlug === 'toprated') {
            tsCandidates = [...(homeData.popular || []), ...(homeData.trending || [])].map(mapToonStreamAnime);
          } else if (normSlug === 'ongoing' || normSlug === 'tvseries') {
            tsCandidates = (homeData.recentlyUpdated || []).map(mapToonStreamAnime).filter(a => !isMovieItem(a));
          } else if (normSlug === 'featured' || normSlug === 'anime') {
            tsCandidates = [...(homeData.trending || []), ...(homeData.popular || [])].map(mapToonStreamAnime);
          } else if (normSlug === 'favorite' || normSlug === 'fanfavorites') {
            tsCandidates = [...(homeData.popular || []), ...(homeData.trending || [])].map(mapToonStreamAnime);
          } else if (normSlug === 'completed' || normSlug === 'completedseries') {
            tsCandidates = (homeData.popular || []).map(mapToonStreamAnime).filter(a => a.status === 'Completed');
          } else if (normSlug === 'upcoming' || normSlug === 'comingsoon') {
            tsCandidates = (homeData.latest || []).map(mapToonStreamAnime);
          } else if (normSlug === 'hindidubbed' || normSlug === 'hindi' || normSlug === 'hindidub') {
            const allTs = [
              ...(homeData.trending || []),
              ...(homeData.latest || []),
              ...(homeData.popular || []),
              ...(homeData.movies || []),
              ...(homeData.recentlyUpdated || [])
            ].map(mapToonStreamAnime);
            tsCandidates = allTs.filter(a => a.hindiAvailable === true || String(a.language || '').toLowerCase().includes('hindi') || hasCategory(a, 'hindi-dubbed'));
          } else {
            // Genre matching against ToonStream pool
            const allTs = [
              ...(homeData.trending || []),
              ...(homeData.latest || []),
              ...(homeData.popular || []),
              ...(homeData.movies || []),
              ...(homeData.recentlyUpdated || [])
            ].map(mapToonStreamAnime);

            tsCandidates = allTs.filter(a => {
              if (normSlug === 'action') return matchGenre('Action', parseAnimeGenres(a.genres)) || hasCategory(a, 'action');
              if (normSlug === 'romance') return matchGenre('Romance', parseAnimeGenres(a.genres)) || hasCategory(a, 'romance');
              if (normSlug === 'comedy') return matchGenre('Comedy', parseAnimeGenres(a.genres)) || hasCategory(a, 'comedy');
              if (normSlug === 'scifi' || normSlug === 'sciencefiction') return matchGenre('Sci-Fi', parseAnimeGenres(a.genres)) || hasCategory(a, 'scifi');
              if (normSlug === 'horror') return matchGenre('Horror', parseAnimeGenres(a.genres)) || matchGenre('Thriller', parseAnimeGenres(a.genres)) || hasCategory(a, 'horror');
              if (normSlug === 'adventure') return matchGenre('Adventure', parseAnimeGenres(a.genres)) || hasCategory(a, 'adventure');
              if (normSlug === 'fantasy') return matchGenre('Fantasy', parseAnimeGenres(a.genres)) || hasCategory(a, 'fantasy');
              if (normSlug === 'drama') return matchGenre('Drama', parseAnimeGenres(a.genres)) || hasCategory(a, 'drama');
              if (normSlug === 'sports') return matchGenre('Sports', parseAnimeGenres(a.genres)) || hasCategory(a, 'sports');
              return matchGenre(searchKw, parseAnimeGenres(a.genres)) || matchGenre(categorySlug, parseAnimeGenres(a.genres)) || hasCategory(a, searchKw);
            });

            // If few results in cache, query ToonStream search for this genre
            if (tsCandidates.length < 8) {
              try {
                const searchResults = await ToonStreamConnector.searchAnime(searchKw);
                if (searchResults && searchResults.length > 0) {
                  const searchedMapped = searchResults.map(mapToonStreamAnime);
                  tsCandidates = [...tsCandidates, ...searchedMapped];
                }
              } catch (_) {}
            }
          }
        }
      } catch (e) {
        console.error("ToonStream Category fetch failed:", e);
      }
    }

    // 4. FourAnimo & Comprehensive Catalog Candidates
    const catalogCandidates = COMPREHENSIVE_ANIME_CATALOG.filter(a => {
      if (!a) return false;
      return hasCategory(a, categorySlug) || hasCategory(a, searchKw);
    }).map(mapAnime);

    let fourAnimoCandidates: Anime[] = [];
    if (globalSettings.fourAnimo) {
      fourAnimoCandidates = fallbackAnimes.filter(a => {
        if (!a) return false;
        return hasCategory(a, categorySlug) || hasCategory(a, searchKw);
      }).map(mapAnime);
    }

    const merged = filterAndDeduplicateAnimes([
      ...custom.map(mapAnime),
      ...catalogCandidates,
      ...mbCandidates,
      ...tsCandidates,
      ...fourAnimoCandidates
    ]);

    return merged;
  },
  getAllGenres: async (): Promise<string[]> => {
    try {
      const uniqueGenres = new Set<string>();
      
      const baselineGenres = [
        'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Movie', 'Mystery', 
        'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller', 
        'Ecchi', 'Harem', 'Isekai', 'Mecha', 'Psychological', 'School', 
        'Seinen', 'Shoujo', 'Shounen'
      ];

      baselineGenres.forEach(g => uniqueGenres.add(g));

      if (globalSettings.toonStream) {
        try {
          const tsGenres = await ToonStreamConnector.getGenres();
          tsGenres.forEach(g => {
            if (g) {
              const titleCased = g.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
              uniqueGenres.add(titleCased);
            }
          });
        } catch (_) {}
      }

      // 1. Fetch dynamic database sections created in Admin
      try {
        const sectionsSnap = await get(ref(db, 'homepageSections'));
        if (sectionsSnap && sectionsSnap.exists()) {
          const sections = Object.values(sectionsSnap.val()) as any[];
          sections.forEach(sec => {
            if (sec.visible !== false && sec.status !== 'draft') {
              let name = (sec.name || sec.title || sec.slug || '').replace(/^✨\s*/, '').trim();
              if (name && !name.toLowerCase().includes('all')) {
                const titleCased = name.split(' ')
                  .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                  .join(' ');
                uniqueGenres.add(titleCased);
              }
            }
          });
        }
      } catch (_) {}

      // 2. Fetch custom anime database items to collect genres & active categories
      try {
        const animesRef = ref(db, 'animes');
        const snap = await get(animesRef);
        if (snap && snap.exists()) {
          const val = snap.val();
          Object.values(val).forEach((a: any) => {
            if (a.visibility === 'draft') return;

            // Collect genres
            const parsed = parseAnimeGenres(a.genres);
            parsed.forEach(g => {
              if (!g) return;
              const matchedBaseline = baselineGenres.find(b => b.toLowerCase() === g.toLowerCase());
              if (matchedBaseline) {
                uniqueGenres.add(matchedBaseline);
              } else {
                const titleCased = g.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
                uniqueGenres.add(titleCased);
              }
            });

            // Collect categories object
            if (a.categories && typeof a.categories === 'object') {
              Object.entries(a.categories).forEach(([catKey, isEnabled]) => {
                if (isEnabled === true) {
                  // Skip internal system flags
                  if (['featured', 'trending', 'popular', 'topairing', 'recentlyadded', 'latest', 'favorite', 'upcoming'].includes(catKey.toLowerCase())) return;
                  
                  let formattedKey = catKey.replace(/[-_]/g, ' ').trim();
                  if (formattedKey) {
                    const titleCased = formattedKey.split(' ')
                      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                      .join(' ');
                    uniqueGenres.add(titleCased);
                  }
                }
              });
            }
          });
        }
      } catch (_) {}

      return Array.from(uniqueGenres).sort((a, b) => a.localeCompare(b));
    } catch (e) {
      console.error("Failed to read genres from Anime database:", e);
      return [
        'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Movie', 'Mystery', 
        'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller', 
        'Ecchi', 'Harem', 'Isekai', 'Mecha', 'Psychological', 'School', 
        'Seinen', 'Shoujo', 'Shounen'
      ];
    }
  },
  trending: async () => {
    let liveList: Anime[] = [];
    if (globalSettings.fourAnimo) {
      try {
        const live = await fetchApi("/anime/trending");
        if (live) liveList = mapAnimeList(live);
      } catch (e) {
        console.error("Trending API failed:", e);
        liveList = fallbackAnimes.slice(0, 8).map(mapAnime);
      }
    }
    let tsList: Anime[] = [];
    if (globalSettings.toonStream) {
      try {
        const tsData = await ToonStreamConnector.getTrending();
        if (tsData) tsList = tsData.map(mapToonStreamAnime);
      } catch (e) {
        console.error("ToonStream Trending failed:", e);
      }
    }
    const custom = await getCustomByCategory('trending');
    return filterAndDeduplicateAnimes([...custom.map(mapAnime), ...tsList, ...liveList]);
  },
  topAiring: async () => {
    let liveList: Anime[] = [];
    if (globalSettings.fourAnimo) {
      try {
        const live = await fetchApi("/anime/top-airing");
        if (live) liveList = mapAnimeList(live);
      } catch (e) {
        console.error("Top Airing API failed:", e);
        liveList = fallbackAnimes.slice(2, 10).map(mapAnime);
      }
    }
    let tsList: Anime[] = [];
    if (globalSettings.toonStream) {
      try {
        const tsData = await ToonStreamConnector.getTrending();
        if (tsData) tsList = tsData.map(mapToonStreamAnime);
      } catch (e) {
        console.error("ToonStream Top Airing failed:", e);
      }
    }
    const custom = await getCustomByCategory('topAiring');
    return filterAndDeduplicateAnimes([...custom.map(mapAnime), ...tsList, ...liveList]);
  },
  popular: async () => {
    let liveList: Anime[] = [];
    if (globalSettings.fourAnimo) {
      try {
        const live = await fetchApi("/anime/most-popular");
        if (live) liveList = mapAnimeList(live);
      } catch (e) {
        console.error("Popular API failed:", e);
        liveList = fallbackAnimes.slice(4, 10).map(mapAnime);
      }
    }
    let tsList: Anime[] = [];
    if (globalSettings.toonStream) {
      try {
        const tsHome = await ToonStreamConnector.getHome();
        if (tsHome && tsHome.popular) tsList = tsHome.popular.map(mapToonStreamAnime);
      } catch (e) {
        console.error("ToonStream Popular failed:", e);
      }
    }
    const custom = await getCustomByCategory('popular');
    return filterAndDeduplicateAnimes([...custom.map(mapAnime), ...tsList, ...liveList]);
  },
  recent: async () => {
    let liveList: Anime[] = [];
    if (globalSettings.fourAnimo) {
      try {
        const live = await fetchApi("/anime/recently-added");
        if (live) liveList = mapAnimeList(live);
      } catch (e) {
        console.error("Recent API failed:", e);
        liveList = fallbackAnimes.slice(5, 10).map(mapAnime);
      }
    }
    let tsList: Anime[] = [];
    if (globalSettings.toonStream) {
      try {
        const tsData = await ToonStreamConnector.getLatest();
        if (tsData) tsList = tsData.map(mapToonStreamAnime);
      } catch (e) {
        console.error("ToonStream Recent failed:", e);
      }
    }
    const custom = await getCustomByCategory('recentlyAdded');
    return filterAndDeduplicateAnimes([...custom.map(mapAnime), ...tsList, ...liveList]);
  },
  updated: async () => {
    let liveList: Anime[] = [];
    if (globalSettings.fourAnimo) {
      try {
        const live = await fetchApi("/anime/recently-updated");
        if (live) liveList = mapAnimeList(live);
      } catch (e) {
        console.error("Updated API failed:", e);
        liveList = fallbackAnimes.slice(1, 7).map(mapAnime);
      }
    }
    let tsList: Anime[] = [];
    if (globalSettings.toonStream) {
      try {
        const tsData = await ToonStreamConnector.getLatest();
        if (tsData) tsList = tsData.map(mapToonStreamAnime);
      } catch (e) {
        console.error("ToonStream Updated failed:", e);
      }
    }
    const custom = await getCustomByCategory('latest');
    return filterAndDeduplicateAnimes([...custom.map(mapAnime), ...tsList, ...liveList]);
  },
  search: async (keyword: string, page = 1, filters: { type?: string; status?: string; season?: string; year?: string; genre?: string; category?: string } = {}) => {
    let customResults: any[] = [];

    const rawKw = (keyword || '').trim();
    const normKw = rawKw.toLowerCase();
    const MOVIE_TERMS = ['movie', 'movies', 'anime movies', 'anime movie', 'film', 'films'];
    const TV_TERMS = ['tv', 'series', 'tv series', 'shows', 'anime series', 'anime shows'];

    const isMovieKw = MOVIE_TERMS.includes(normKw);
    const isTvKw = TV_TERMS.includes(normKw);

    let searchType = filters.type;
    if (!searchType) {
      if (isMovieKw) searchType = 'MOVIE';
      else if (isTvKw) searchType = 'TV';
    }

    // Determine target genre / category from filters or keyword
    let activeGenre = (filters.genre || filters.category || '').trim();
    let effectiveKeyword = rawKw;

    if (!activeGenre && isGenreKeyword(normKw)) {
      activeGenre = rawKw;
      effectiveKeyword = '';
    } else if (activeGenre && normKw === activeGenre.toLowerCase()) {
      effectiveKeyword = '';
    }

    const isAllAnime = !effectiveKeyword || [
      'all', 'all anime', 'all-anime', 'all_anime', 'all animes', '🌐 all anime', 'browse'
    ].includes(effectiveKeyword.toLowerCase()) || isTvKw;

    try {
      const customMap = await getCustomAnimes().catch(() => ({}));
      const val = customMap || {};
      customResults = Object.values(val)
        .filter((a: any) => a && a.visibility !== 'draft')
        .map((a: any) => {
          const isImported = a.source === 'imported' || a.imported === true || a.isImported === true;
          return mapAnime({
            ...a,
            id: String(a.id),
            source: isImported ? 'imported' : 'my_database'
          });
        });
    } catch (e) {
      console.error("Firebase custom search failed:", e);
    }

    const ITEMS_PER_PAGE = 50;

    // Collect full database candidates pool
    const datasetPool: any[] = [];
    
    // 0. Curated Comprehensive Anime Catalog (High-resolution, rich metadata)
    COMPREHENSIVE_ANIME_CATALOG.forEach(item => {
      datasetPool.push(mapAnime(item));
    });

    // 1. Always include Custom Firebase anime
    datasetPool.push(...customResults);

    // 2. Include ToonStream catalog search items if ToonStream is enabled
    if (globalSettings.toonStream) {
      try {
        if (keyword && keyword.trim().length >= 2) {
          const tsSearchResults = await ToonStreamConnector.searchAnime(keyword, page).catch(() => []);
          if (tsSearchResults && tsSearchResults.length > 0) {
            datasetPool.push(...tsSearchResults.map(mapToonStreamAnime));
          }
        }
        // Load ToonStream home catalog cards to enrich search dataset
        const tsHome = await ToonStreamConnector.getHome().catch(() => null);
        if (tsHome) {
          const allTsHomeCards = [
            ...(tsHome.trending || []),
            ...(tsHome.latest || []),
            ...(tsHome.popular || []),
            ...(tsHome.movies || []),
            ...(tsHome.recentlyUpdated || [])
          ].map(mapToonStreamAnime);
          datasetPool.push(...allTsHomeCards);
        }
      } catch (e) {
        console.error("ToonStream search/catalog enrichment failed:", e);
      }
    }

    // 2b. Include MovieBox catalog search items if MovieBox is enabled
    if (globalSettings.movieBox) {
      try {
        if (keyword && keyword.trim().length >= 2) {
          const mbSearchResults = await MovieBoxConnector.searchAnime(keyword, page).catch(() => []);
          if (mbSearchResults && mbSearchResults.length > 0) {
            datasetPool.push(...mbSearchResults.map(mapMovieBoxAnime));
          }
        }
        // Load MovieBox home catalog cards to enrich search dataset
        const mbHome = await MovieBoxConnector.getHome().catch(() => null);
        if (mbHome) {
          const allMbHomeCards = [
            ...(mbHome.trending || []),
            ...(mbHome.latest || []),
            ...(mbHome.popular || []),
            ...(mbHome.movies || []),
            ...(mbHome.recentlyUpdated || [])
          ].map(mapMovieBoxAnime);
          datasetPool.push(...allMbHomeCards);
        }
      } catch (e) {
        console.error("MovieBox search/catalog enrichment failed:", e);
      }
    }

    // 2c. Include Anikoto catalog search items if Anikoto is enabled
    if (globalSettings.anikoto) {
      try {
        if (keyword && keyword.trim().length >= 2) {
          const akSearchResults = await AnikotoConnector.searchAnime(keyword).catch(() => []);
          if (akSearchResults && akSearchResults.length > 0) {
            datasetPool.push(...akSearchResults.map(mapAnikotoAnime));
          }
        }
        const akHome = await AnikotoConnector.getHome().catch(() => null);
        if (akHome) {
          const allAkHomeCards = [
            ...(akHome.trending || []),
            ...(akHome.latest || []),
            ...(akHome.popular || [])
          ].map(mapAnikotoAnime);
          datasetPool.push(...allAkHomeCards);
        }
      } catch (e) {
        console.error("Anikoto search/catalog enrichment failed:", e);
      }
    }

    // 3. High-priority static anime dataset & Live API search ONLY if fourAnimo is enabled
    if (globalSettings.fourAnimo) {
      fallbackAnimes.forEach(item => {
        datasetPool.push(mapAnime(item));
      });

      if (isMovieKw || searchType === 'MOVIE') {
        try {
          const movieSearchTerms = ['movie', 'film', 'anime movie', 'the movie'];
          if (keyword && !isMovieKw) {
            movieSearchTerms.unshift(keyword);
          }

          for (const term of movieSearchTerms) {
            try {
              const url = `/anime/search?keyword=${encodeURIComponent(term)}&page=${page}`;
              const liveRes = await fetchApi(url).catch(() => null);
              if (liveRes) {
                const mapped = mapAnimeList(liveRes);
                if (mapped && mapped.length > 0) {
                  datasetPool.push(...mapped);
                }
              }
            } catch (_) {}
          }
        } catch (_) {}
      } else if (!isAllAnime) {
        try {
          const correctedKeyword = suggestCorrectedKeyword(keyword);
          const firstWord = keyword.trim().split(/\s+/)[0];
          const searchTerms = Array.from(new Set([
            keyword,
            correctedKeyword,
            firstWord
          ])).filter(t => t && t.trim().length >= 2);

          for (const term of searchTerms) {
            try {
              const url = `/anime/search?keyword=${encodeURIComponent(term)}&page=${page}`;
              const liveRes = await fetchApi(url).catch(() => null);
              if (liveRes) {
                const mapped = mapAnimeList(liveRes);
                if (mapped && mapped.length > 0) {
                  datasetPool.push(...mapped);
                }
              }
            } catch (_) {}
          }
        } catch (_) {}
      } else {
        // Load top popular endpoints to enrich default catalog
        const endpoints = [
          "/anime/most-popular",
          "/anime/trending",
          "/anime/recently-added",
          "/anime/recently-updated",
          "/anime/top-airing"
        ];
        for (const ep of endpoints) {
          try {
            const res = await fetchApi(ep).catch(() => null);
            if (res) datasetPool.push(...mapAnimeList(res));
          } catch (_) {}
        }
      }
    }

    const deduplicatedPool = filterAndDeduplicateAnimes(datasetPool);

    // Execute Smart Fuzzy Search Engine
    const searchResults = fuzzySearchAnime(effectiveKeyword, deduplicatedPool, {
      type: searchType,
      status: filters.status,
      season: filters.season,
      year: filters.year,
      genre: activeGenre || undefined
    });

    const targetStartIndex = (page - 1) * ITEMS_PER_PAGE;
    const targetEndIndex = page * ITEMS_PER_PAGE;
    const pageItems = searchResults.slice(targetStartIndex, targetEndIndex);

    const totalCount = searchResults.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));

    return {
      data: pageItems,
      total: totalCount,
      pages: totalPages,
      page
    };
  },
  suggestions: async (query: string) => {
    if (!query || query.trim().length < 2) return [];

    let customResults: any[] = [];
    try {
      const customMap = await getCustomAnimes().catch(() => ({}));
      const val = customMap || {};
      customResults = Object.values(val)
        .filter((a: any) => a && a.visibility !== 'draft')
        .map(mapAnime);
    } catch (_) {}

    let tsSuggestions: any[] = [];
    if (globalSettings.toonStream) {
      try {
        const tsRes = await ToonStreamConnector.searchAnime(query, 1).catch(() => []);
        if (tsRes) tsSuggestions = tsRes.map(mapToonStreamAnime);
      } catch (_) {}
    }

    let liveResults: any[] = [];
    if (globalSettings.fourAnimo) {
      try {
        const live = await fetchApi(`/suggestion?q=${encodeURIComponent(query)}`);
        if (live) liveResults = mapAnimeList(live);
      } catch (_) {}
    }

    const pool = filterAndDeduplicateAnimes([
      ...customResults,
      ...tsSuggestions,
      ...(globalSettings.fourAnimo ? fallbackAnimes.map(mapAnime) : []),
      ...liveResults
    ]);

    const fuzzyMatches = fuzzySearchAnime(query, pool);
    return fuzzyMatches.slice(0, 8);
  },
  animeInfo: async (id: string) => {
    // Resolve legacy or aliased IDs
    let targetId = id;
    if (id === '19706' || id === '195604' || id === '61967') {
      targetId = '8568'; // Black Clover Season 2 aliased to Black Clover Master
    } else if (legacyToRealIdMap[id]) {
      targetId = legacyToRealIdMap[id];
    }
    const cacheKey = `anime_info_${targetId}`;
    const cached = apiCache.get(cacheKey);

    const fetcher = async () => {
      // 1. Check custom Firebase database
      try {
        const animeRef = ref(db, `animes/${targetId}`);
        const snap = await withTimeout(get(animeRef), 2500, null);
        if (snap && snap.exists && snap.exists()) {
          const val = snap.val();
          const isImported = val.source === 'imported' || val.imported === true || val.isImported === true;
          const mapped = {
            ...val,
            id: String(val.id),
            source: isImported ? 'imported' : 'my_database'
          };
          apiCache.set(cacheKey, mapped);
          return mapped;
        }
      } catch (e) {
        console.error("Firebase custom animeInfo failed:", e);
      }

      // 2. Check ToonStream Connector if ID is toonstream prefixed
      if (targetId.startsWith('toonstream-')) {
        try {
          const cleanTsId = targetId.replace(/^toonstream-/, '');
          const tsDetails = await ToonStreamConnector.getAnimeDetails(cleanTsId).catch(() => null);
          if (tsDetails) {
            const mapped = mapToonStreamAnime(tsDetails);
            mapped.id = targetId;
            apiCache.set(cacheKey, mapped);
            return mapped;
          }
        } catch (e) {
          console.error("ToonStream animeInfo failed:", e);
        }
      }

      // 2b. Check MovieBox Connector if ID is moviebox prefixed
      if (targetId.startsWith('moviebox-')) {
        try {
          const cleanMbId = targetId.replace(/^moviebox-/, '');
          const mbDetails = await MovieBoxConnector.getAnimeDetails(cleanMbId).catch(() => null);
          if (mbDetails) {
            const mapped = mapMovieBoxAnime(mbDetails);
            mapped.id = targetId;
            apiCache.set(cacheKey, mapped);
            return mapped;
          }
        } catch (e) {
          console.error("MovieBox animeInfo failed:", e);
        }
      }

      // 2c. Check Anikoto Connector if ID is anikoto prefixed
      if (targetId.startsWith('anikoto-')) {
        try {
          const cleanAkId = targetId.replace(/^anikoto-/, '');
          const akDetails = await AnikotoConnector.getAnimeDetails(cleanAkId).catch(() => null);
          if (akDetails) {
            const mapped = mapAnikotoAnime(akDetails);
            mapped.id = targetId;
            apiCache.set(cacheKey, mapped);
            return mapped;
          }
        } catch (e) {
          console.error("Anikoto animeInfo failed:", e);
        }
      }

      // 3. Fallback to Kryzox live API
      const realKryzoxId = localToKryzoxIdMap[targetId];
      try {
        const liveId = realKryzoxId || targetId;
        const live = await fetchApi(`/anime/${liveId}`);
        if (live) {
          const mapped = mapAnime(live);
          mapped.id = String(targetId);
          mapped.source = 'anova';
          
          const matchedFallback = fallbackAnimes.find(a => String(a.id) === String(targetId));
          if (matchedFallback) {
            mapped.title = matchedFallback.title || mapped.title;
            if (!mapped.poster || (matchedFallback.poster && !matchedFallback.poster.includes("unsplash.com") && mapped.poster.includes("unsplash.com"))) {
              mapped.poster = matchedFallback.poster;
            }
            if (!mapped.banner || (matchedFallback.banner && !matchedFallback.banner.includes("unsplash.com") && mapped.banner.includes("unsplash.com"))) {
              mapped.banner = matchedFallback.banner;
            }
          }

          apiCache.set(cacheKey, mapped);
          return mapped;
        }
      } catch (e) {
        console.error("Anime Info API failed:", e);
      }
      const matched = fallbackAnimes.find(a => String(a.id) === String(targetId));
      if (matched) {
        return {
          ...matched,
          source: 'four_animo'
        };
      }
      
      return {
        id: String(targetId),
        title: `Anime #${targetId}`,
        poster: getDynamicAnimeFallbackPoster(`Anime #${targetId}`),
        banner: getDynamicAnimeFallbackBanner(`Anime #${targetId}`),
        type: "TV",
        status: "Ongoing",
        episodes: 24,
        rating: "8.5",
        description: `This is a high-speed premium streaming channel for Anime ID #${targetId}. Start watching your favorite episodes instantly with zero ads, seamless sub/dub switching, and ultra-high speed servers.`,
        genres: ["Action", "Sci-Fi", "Adventure"],
        studio: "AnOvA Production",
        source: 'four_animo'
      };
    };

    const getResult = async () => {
      if (cached) {
        return cached;
      }
      return dedupeRequest(cacheKey, fetcher);
    };

    const result = await getResult();
    if (!result) return null;

    let source = result.source;
    if (!source) {
      const isImported = result.source === 'imported' || result.imported === true || result.isImported === true;
      const isTs = result.source === 'toonstream' || String(result.id).startsWith('toonstream-');
      const isMb = result.source === 'moviebox' || String(result.id).startsWith('moviebox-');
      source = isImported ? 'imported' : (String(result.id).startsWith('custom-') ? 'my_database' : (isTs ? 'toonstream' : (isMb ? 'moviebox' : 'four_animo')));
    }

    if (source === 'my_database' && !globalSettings.myDatabase) {
      return null;
    }
    if (source === 'imported' && !globalSettings.imported) {
      return null;
    }
    if (source === 'four_animo' && !globalSettings.fourAnimo) {
      return null;
    }
    if (source === 'toonstream' && !globalSettings.toonStream) {
      return null;
    }
    if (source === 'moviebox' && !globalSettings.movieBox) {
      return null;
    }

    const enriched = await enrichAnimeWithMetadata(result);
    apiCache.set(cacheKey, enriched);
    return enriched;
  },

  episodes: async (id: string) => {
    // Check if the parent anime is active and visible
    const parentAnime = await api.animeInfo(id);
    if (!parentAnime) {
      return [];
    }

    let targetId = id;
    if (id === '19706' || id === '195604' || id === '61967') {
      targetId = '8568';
    } else if (legacyToRealIdMap[id]) {
      targetId = legacyToRealIdMap[id];
    }
    const cacheKey = `episodes_${targetId}`;
    const cached = apiCache.get(cacheKey);

    const fetcher = async () => {
      let episodesResult: any[] = [];

      // 1. Check custom Firebase episodes
      try {
        const episodesRef = ref(db, `episodes/${targetId}`);
        const snap = await withTimeout(get(episodesRef), 2500, null);
        if (snap && snap.exists && snap.exists()) {
          const epsObj = snap.val();
          episodesResult = Object.values(epsObj).filter(Boolean);
        }
      } catch (e) {
        console.error("Firebase custom episodes fetch failed:", e);
      }

      // 2. Check ToonStream Connector if anime source is toonstream or ID is toonstream-
      if (episodesResult.length === 0 && (targetId.startsWith('toonstream-') || parentAnime?.source === 'toonstream' || globalSettings.toonStream)) {
        try {
          const cleanTsId = targetId.replace(/^toonstream-/, '');
          const tsEps = await ToonStreamConnector.getEpisodes(cleanTsId).catch(() => []);
          if (tsEps && tsEps.length > 0) {
            episodesResult = tsEps.map(ep => ({
              id: ep.id || `${targetId}-ep-${ep.number}`,
              number: ep.number,
              episodeNumber: ep.number,
              title: ep.title || `Episode ${ep.number}`,
              thumbnail: ep.thumbnail || parentAnime?.poster || '',
              url: ep.url,
              videoSources: {
                sub: {
                  enabled: true,
                  url: ep.url,
                  label: 'ToonStream'
                }
              }
            }));
          }
        } catch (e) {
          console.error("ToonStream episodes fetch failed:", e);
        }
      }

      // 2b. Check Anikoto Connector if anime source is anikoto or ID is anikoto-
      if (episodesResult.length === 0 && (targetId.startsWith('anikoto-') || parentAnime?.source === 'anikoto')) {
        try {
          const cleanAkId = targetId.replace(/^anikoto-/, '');
          const akEps = await AnikotoConnector.getEpisodes(cleanAkId).catch(() => []);
          if (akEps && akEps.length > 0) {
            episodesResult = akEps.map(ep => ({
              id: ep.dataId || `${targetId}-ep-${ep.number}`,
              number: ep.number,
              episodeNumber: ep.number,
              title: ep.title || `Episode ${ep.number}`,
              thumbnail: parentAnime?.poster || '',
              url: `https://anikototv.to/watch/${cleanAkId}/ep-${ep.number}`,
              videoSources: {
                sub: {
                  enabled: true,
                  url: `https://anikototv.to/watch/${cleanAkId}/ep-${ep.number}`,
                  label: 'Anikoto'
                }
              }
            }));
          }
        } catch (e) {
          console.error("Anikoto episodes fetch failed:", e);
        }
      }

      // 3. Check Kryzox live API
      if (episodesResult.length === 0) {
        const realKryzoxId = localToKryzoxIdMap[targetId];
        try {
          const liveId = realKryzoxId || targetId;
          const data = await fetchApi(`/anime/${liveId}/episodes`);
          if (data) {
            let eps: any[] = [];
            if (Array.isArray(data)) eps = data;
            else if (Array.isArray(data?.data)) eps = data.data;
            else if (Array.isArray(data?.episodes)) eps = data.episodes;
            else if (data?.data?.data && Array.isArray(data.data.data)) eps = data.data.data;
            else if (typeof data === 'object') {
              for (const key in data) {
                if (Array.isArray(data[key])) {
                  eps = data[key];
                  break;
                }
              }
            }
            if (eps.length > 0) {
              episodesResult = eps;
            }
          }
        } catch (e) {
          console.error("Episodes API failed:", e);
        }
      }

      if (episodesResult.length === 0) {
        const matched = fallbackAnimes.find(a => String(a.id) === String(targetId));
        const animeObj = parentAnime || matched;
        const isMovie = (animeObj?.type && String(animeObj.type).toLowerCase().includes('movie')) ||
                        animeObj?.categories?.movies === true;
        const totalEp = isMovie ? 1 : Number(animeObj?.episodes || animeObj?.episodesCount || matched?.episodes || 12);
        const eps = [];
        for (let i = 1; i <= Math.min(totalEp, 200); i++) {
          eps.push({ id: `${targetId}-ep-${i}`, number: i, title: isMovie ? 'Full Movie' : `Episode ${i}` });
        }
        episodesResult = eps;
      }

      const finalEpisodes = normalizeAndCleanEpisodes(episodesResult, parentAnime?.type);
      apiCache.set(cacheKey, finalEpisodes);
      return finalEpisodes;
    };

    const dedupedPromise = dedupeRequest(cacheKey, fetcher);

    if (cached) {
      dedupedPromise.catch(() => {});
      return cached;
    }

    return dedupedPromise;
  },
  characters: async (id: string) => {
    const liveId = localToKryzoxIdMap[id] || id;
    try {
      return await fetchApi(`/anime/${liveId}/characters`);
    } catch (e) {
      return [];
    }
  },
  staff: async (id: string) => {
    const liveId = localToKryzoxIdMap[id] || id;
    try {
      return await fetchApi(`/anime/${liveId}/staff`);
    } catch (e) {
      return [];
    }
  },
  relations: async (id: string) => {
    const liveId = localToKryzoxIdMap[id] || id;
    try {
      return await fetchApi(`/anime/${liveId}/relations`);
    } catch (e) {
      return [];
    }
  },
  recommendations: async (id: string) => {
    const liveId = localToKryzoxIdMap[id] || id;
    try {
      return await fetchApi(`/anime/${liveId}/recommendations`);
    } catch (e) {
      return [];
    }
  },
};

import { prefetchEpisodeStream } from './playerPreloader';

export function prefetchAnime(id: string, episode: number | string = 1, audio: string = 'sub') {
  if (typeof window === 'undefined' || !id) return;
  const runner = async () => {
    try {
      const animePromise = api.animeInfo(id).catch(() => null);
      const epPromise = api.episodes(id).catch(() => []);

      const [anime, eps] = await Promise.all([animePromise, epPromise]);

      if (anime) {
        if (anime.poster) {
          const img = new Image();
          img.src = anime.poster;
        }
        if (anime.banner) {
          const img = new Image();
          img.src = anime.banner;
        }
        // Pre-fetch video stream source for episode 1 (or requested episode)
        prefetchEpisodeStream(id, episode, audio, anime.title).catch(() => {});
      }
    } catch (_) {}
  };

  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(runner);
  } else {
    setTimeout(runner, 50);
  }
}

