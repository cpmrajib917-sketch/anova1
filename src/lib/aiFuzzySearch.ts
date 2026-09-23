// @ts-nocheck
import { Anime } from '../types';

/**
 * Common Bengali and colloquial Banglish aliases mapped to standard anime identifiers/titles
 */
export const BENGALI_ANIME_ALIASES: Record<string, string[]> = {
  "jujutsu-kaisen": ["জুজুৎসু কাইসেন", "জুজু কাইসেন", "jujutsu kaizen", "jjk", "gojo", "sukuna"],
  "naruto": ["নারুতো", "নারুটো", "naruto", "hokage", "sasuke"],
  "naruto-shippuden": ["নারুতো শিপ্পুডেন", "নারুটো সিপুডেন", "shippuden", "naruto 2"],
  "one-piece": ["ওয়ান পিস", "ওয়ান পিস", "one piece", "luffy", "zoro", "op"],
  "demon-slayer": ["ডেমোন স্লেয়ার", "ডেমন স্লেয়ার", "কিমেৎসু নো ইয়াইবা", "demon slayer", "kny", "tanjiro", "nezuko", "demonslayer"],
  "solo-leveling": ["সোলো লেভেলিং", "solo leveling", "sung jin woo", "shadow monarch"],
  "chainsaw-man": ["চেইনসো ম্যান", "চেনসো ম্যান", "chainsaw man", "denji", "csm"],
  "attack-on-titan": ["অ্যাটাক অন টাইটান", "attack on titan", "aot", "eren", "levi", "shingeki no kyojin"],
  "bleach": ["ব্লিচ", "bleach", "ichigo"],
  "bleach-tybw": ["ব্লিচ হাজার বছরের রক্তযুদ্ধ", "bleach tybw", "thousand year blood war"],
  "hunter-x-hunter": ["হান্টার এক্স হান্টার", "hunter x hunter", "gon", "killua", "hxh"],
  "fullmetal-alchemist-brotherhood": ["ফুলমেটাল অ্যালকেমিস্ট", "ফুল মেটাল এলকেমিস্ট", "fullmetal alchemist", "edward elric", "fma", "fmab"],
  "death-note": ["ডেথ নোট", "death note", "light yagami", "ryuk", "l"],
  "tokyo-ghoul": ["টোকিও ঘুল", "টোকিও গুল", "tokyo ghoul", "kaneki"],
  "dandadan": ["ড্যানডাড্যান", "ডানডাডান", "dandadan", "okarun", "momo"],
  "sakamoto-days": ["সাকামোটো ডেজ", "sakamoto days", "taro sakamoto"],
  "blue-lock": ["ব্লু লক", "blue lock", "isagi", "football", "soccer"],
  "my-hero-academia": ["মাই হিরো একাডেমিয়া", "my hero academia", "boku no hero", "deku", "mha"],
  "dr-stone": ["ডক্টর স্টোন", "dr stone", "senku", "science"],
  "mob-psycho-100": ["মব সাইকো ১০০", "mob psycho 100", "shigeo", "mob"],
  "haikyuu": ["হাইকিউ", "haikyuu", "volleyball", "hinata"],
  "spy-x-family": ["স্পাই এক্স ফ্যামিলি", "spy x family", "anya", "loid", "yor"],
  "oshi-no-ko": ["ওশি নো কো", "oshi no ko", "ai hoshino", "aqua", "ruby"],
  "kaiju-no-8": ["কাইজূ নং ৮", "kaiju no 8", "kafka hibino"],
  "wind-breaker": ["উইন্ড ব্রেকার", "wind breaker", "sakura haruka"],
  "vinland-saga": ["ভিনল্যান্ড সাগা", "vinland saga", "thorfinn", "vikings"],
  "cowboy-bebop": ["কাউবয় বিবপ", "cowboy bebop", "spike spiegel"],
  "code-geass": ["কোড গিয়াস", "code geass", "lelouch"],
  "steins-gate": ["স্টাইনস গেট", "steins gate", "okabe", "time travel"],
  "your-name": ["তোমার নাম", "ইউর নেম", "your name", "kimi no na wa", "taki", "mitsuha"],
  "suzume": ["সুজুমে", "suzume", "suzume no tojimari"],
  "a-silent-voice": ["নীরব কণ্ঠস্বর", "সাইলেন্ট ভয়েস", "a silent voice", "koi no katachi", "shoko"],
  "weathering-with-you": ["ওয়েদারিং উইথ ইউ", "weathering with you", "tenki no ko", "hina", "hodaka"],
  "doraemon": ["ডোরেমন", "doraemon", "nobita"],
  "shin-chan": ["শিন চ্যান", "shin chan", "shinnosuke"],
  "dragon-ball-daima": ["ড্রাগন বল ডাইমা", "dragon ball daima", "goku"],
  "dragon-ball-z": ["ড্রাগন বল জেড", "dragon ball z", "dbz", "super saiyan"],
  "pokemon-horizons": ["পোকেমন", "pokemon horizons", "pikachu"],
  "frieren": ["ফ্রিরেন", "frieren", "frieren beyond journeys end", "sousou no frieren", "elf"]
};

export const TOPIC_KEYWORDS: Record<string, string[]> = {
  "slime": ["that time i got reincarnated as a slime", "slime"],
  "magic": ["dr-stone", "frieren", "jujutsu-kaisen", "black-clover"],
  "ninja": ["naruto", "naruto-shippuden"],
  "pirate": ["one-piece"],
  "vampire": ["tokyo-ghoul", "bleach"],
  "detective": ["death-note", "monster"],
  "sports": ["blue-lock", "haikyuu"],
  "game": ["solo-leveling", "sword-art-online"],
  "romance": ["your-name", "weathering-with-you", "a-silent-voice", "suzume"],
  "sad": ["a-silent-voice", "your-name"],
  "op mc": ["solo-leveling", "one-punch-man", "mob-psycho-100", "jujutsu-kaisen"],
  "action": ["solo-leveling", "jujutsu-kaisen", "demon-slayer", "attack-on-titan", "chainsaw-man", "bleach", "naruto", "one-piece"]
};

export function normalizeSearchString(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s\u0980-\u09FF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function calculateMatchScore(candidate: string, query: string): number {
  const normCandidate = normalizeSearchString(candidate);
  const normQuery = normalizeSearchString(query);

  if (!normCandidate || !normQuery) return 0;
  if (normCandidate === normQuery) return 100;
  if (normCandidate.startsWith(normQuery)) return 90;
  if (normCandidate.includes(normQuery)) return 80;
  if (normQuery.includes(normCandidate)) return 75;

  const queryTokens = normQuery.split(' ').filter(t => t.length > 1);
  const candidateTokens = normCandidate.split(' ').filter(t => t.length > 1);

  if (queryTokens.length === 0 || candidateTokens.length === 0) return 0;

  let matchedTokens = 0;
  for (const qToken of queryTokens) {
    if (candidateTokens.some(cToken => cToken.includes(qToken) || qToken.includes(cToken))) {
      matchedTokens++;
    }
  }

  const tokenRatio = matchedTokens / queryTokens.length;
  if (tokenRatio >= 0.5) {
    return Math.round(tokenRatio * 70);
  }

  return 0;
}

export function searchCatalogSmart(
  catalog: Anime[],
  query: string,
  options?: {
    genre?: string;
    limit?: number;
    threshold?: number;
  }
): { anime: Anime; score: number; matchReason: string }[] {
  if (!query || !query.trim()) return [];

  const normQuery = normalizeSearchString(query);
  const limit = options?.limit || 10;
  const threshold = options?.threshold || 35;
  const targetGenre = options?.genre ? options.genre.toLowerCase() : null;

  const results: { anime: Anime; score: number; matchReason: string }[] = [];

  const matchedTropes: string[] = [];
  for (const [trope, targetIds] of Object.entries(TOPIC_KEYWORDS)) {
    if (normQuery.includes(trope)) {
      matchedTropes.push(...targetIds);
    }
  }

  for (const item of catalog) {
    if (!item || !item.title) continue;

    if (targetGenre) {
      const hasGenre = item.genres?.some(g => g.toLowerCase().includes(targetGenre));
      if (!hasGenre) continue;
    }

    let highestScore = 0;
    let matchReason = '';

    const titleScore = calculateMatchScore(item.title, normQuery);
    if (titleScore > highestScore) {
      highestScore = titleScore;
      matchReason = 'Title Match';
    }

    const idScore = calculateMatchScore(item.id.replace(/-/g, ' '), normQuery);
    if (idScore > highestScore) {
      highestScore = idScore;
      matchReason = 'Slug Match';
    }

    const aliases = BENGALI_ANIME_ALIASES[item.id] || [];
    for (const alias of aliases) {
      const aliasScore = calculateMatchScore(alias, normQuery);
      if (aliasScore > highestScore) {
        highestScore = aliasScore;
        matchReason = `Matched Alias: "${alias}"`;
      }
    }

    if (matchedTropes.includes(item.id)) {
      if (highestScore < 65) {
        highestScore = 65;
        matchReason = 'Topic / Trope Match';
      }
    }

    if (item.description && highestScore < 50) {
      const queryWords = normQuery.split(' ').filter(w => w.length > 2);
      const descLower = item.description.toLowerCase();
      const matchedWords = queryWords.filter(w => descLower.includes(w));
      if (matchedWords.length >= 2 || (queryWords.length === 1 && matchedWords.length === 1)) {
        highestScore = Math.max(highestScore, 45);
        matchReason = 'Story / Description Match';
      }
    }

    if (item.genres && item.genres.some(g => normQuery.includes(g.toLowerCase()))) {
      if (highestScore < 40) {
        highestScore = 40;
        matchReason = 'Genre Match';
      }
    }

    if (highestScore >= threshold) {
      results.push({ anime: item, score: highestScore, matchReason });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}
