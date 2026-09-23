import express from 'express';
import fs from 'fs';
import path from 'path';
import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';
import { COMPREHENSIVE_ANIME_CATALOG } from '../src/data/animeDatabase';
import { searchCatalogSmart, normalizeSearchString } from '../src/lib/aiFuzzySearch';

export const aiAssistantRouter = express.Router();

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {
    console.error('Failed to create data directory:', e);
  }
}

const CONFIG_FILE = path.join(DATA_DIR, 'ai-config.json');
const ANALYTICS_FILE = path.join(DATA_DIR, 'ai-analytics.json');
const REPORTS_FILE = path.join(DATA_DIR, 'ai-reports.json');
const REQUESTS_FILE = path.join(DATA_DIR, 'ai-requests.json');

// Helper to read JSON file
function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as T;
    }
  } catch (err) {
    console.warn(`Error reading ${filePath}:`, err);
  }
  return fallback;
}

// Helper to write JSON file
function writeJsonFile<T>(filePath: string, data: T): void {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.warn(`Error writing ${filePath}:`, err);
  }
}

// Default Configuration
const DEFAULT_CONFIG = {
  enabled: true,
  maintenanceMode: false,
  name: 'Anime AI',
  welcomeMessage: '👋 হাই! আমি তোমার Anime Assistant।\nAnime খুঁজতে, Episode খুঁজতে, নতুন Anime সাজেস্ট করতে অথবা সাইটের কোনো সমস্যা হলে আমাকে বলো।',
  avatar: '🤖',
  features: {
    search: true,
    episodes: true,
    recommendations: true,
    siteHelp: true,
    brokenReports: true,
    animeRequests: true,
  }
};

const DEFAULT_ANALYTICS = {
  totalConversations: 0,
  totalMessages: 0,
  searchesCount: 0,
  successfulSearches: 0,
  failedSearches: 0,
  episodesCount: 0,
  recommendationsCount: 0,
  reportsCount: 0,
  requestsCount: 0,
};

function getAiConfig() {
  return readJsonFile(CONFIG_FILE, DEFAULT_CONFIG);
}

function updateAnalytics(updater: (prev: typeof DEFAULT_ANALYTICS) => typeof DEFAULT_ANALYTICS) {
  const current = readJsonFile(ANALYTICS_FILE, DEFAULT_ANALYTICS);
  const updated = updater(current);
  writeJsonFile(ANALYTICS_FILE, updated);
}

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Tool Definitions for Gemini Tool Calling
const searchAnimeTool: FunctionDeclaration = {
  name: 'searchAnime',
  description: 'Searches the website anime database catalog for matching anime series or movies using title, aliases, genre, or story tropes.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'Anime title, character name, or plot keywords in English, Bengali, or Banglish'
      },
      genre: {
        type: Type.STRING,
        description: 'Optional genre filter, e.g. Action, Romance, Fantasy, Sports'
      }
    },
    required: ['query']
  }
};

const getAnimeDetailsTool: FunctionDeclaration = {
  name: 'getAnimeDetails',
  description: 'Retrieves complete metadata, description, genres, year, and episode count for a specific anime from the website catalog.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      animeId: {
        type: Type.STRING,
        description: 'The slug or ID of the anime, e.g. "solo-leveling", "naruto", "jujutsu-kaisen"'
      }
    },
    required: ['animeId']
  }
};

const getEpisodeTool: FunctionDeclaration = {
  name: 'getEpisode',
  description: 'Finds a specific episode or latest episode of an anime in the website database, providing the direct watch link.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      animeId: {
        type: Type.STRING,
        description: 'The anime ID or title'
      },
      episodeNumber: {
        type: Type.INTEGER,
        description: 'The episode number (e.g. 1, 12, 1000). If omitted, finds episode 1 or latest.'
      },
      isLatest: {
        type: Type.BOOLEAN,
        description: 'True if the user is asking for the latest or last episode.'
      }
    },
    required: ['animeId']
  }
};

const getSimilarAnimeTool: FunctionDeclaration = {
  name: 'getSimilarAnime',
  description: 'Finds similar recommended anime from the website database matching genres, themes, and styles of the target anime.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      animeId: {
        type: Type.STRING,
        description: 'The target anime ID to find recommendations for'
      }
    },
    required: ['animeId']
  }
};

const getTroubleshootingGuideTool: FunctionDeclaration = {
  name: 'getTroubleshootingGuide',
  description: 'Provides official troubleshooting instructions for video playback issues, black screens, server errors, or buffering.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      issueType: {
        type: Type.STRING,
        description: 'Type of problem: "playback_failed", "server_down", "black_screen", "audio_desync", "slow_buffering"'
      },
      animeId: {
        type: Type.STRING,
        description: 'Optional anime ID being watched'
      },
      episodeNumber: {
        type: Type.INTEGER,
        description: 'Optional episode number being watched'
      }
    },
    required: ['issueType']
  }
};

const reportBrokenEpisodeTool: FunctionDeclaration = {
  name: 'reportBrokenEpisode',
  description: 'Submits a broken video or server error report to the admin panel for quick investigation.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      animeTitle: {
        type: Type.STRING,
        description: 'Name of the anime'
      },
      episodeNumber: {
        type: Type.INTEGER,
        description: 'Episode number with issue'
      },
      server: {
        type: Type.STRING,
        description: 'Server name, e.g. HD-1 (Vidsrc), HD-2 (Vidstream)'
      },
      problemType: {
        type: Type.STRING,
        description: 'Nature of error: "black_screen", "server_error", "audio_sync", "buffering"'
      },
      userMessage: {
        type: Type.STRING,
        description: 'User description of problem'
      }
    },
    required: ['animeTitle', 'episodeNumber']
  }
};

const requestAnimeTool: FunctionDeclaration = {
  name: 'requestAnime',
  description: 'Submits an anime request to the admin panel when a requested anime is not found on the website.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      animeName: {
        type: Type.STRING,
        description: 'Name of the anime requested by the user'
      },
      userMessage: {
        type: Type.STRING,
        description: 'Optional note or details from the user'
      }
    },
    required: ['animeName']
  }
};

// Tool Execution Handlers
function executeSearchAnime(query: string, genre?: string) {
  const matches = searchCatalogSmart(COMPREHENSIVE_ANIME_CATALOG, query, {
    genre,
    limit: 4,
    threshold: 30
  });

  if (matches.length === 0) {
    updateAnalytics(a => ({ ...a, failedSearches: (a.failedSearches || 0) + 1 }));
    return {
      found: false,
      message: `No anime found for query "${query}" on this website.`
    };
  }

  updateAnalytics(a => ({
    ...a,
    searchesCount: (a.searchesCount || 0) + 1,
    successfulSearches: (a.successfulSearches || 0) + 1
  }));

  return {
    found: true,
    count: matches.length,
    animes: matches.map(m => ({
      id: m.anime.id,
      title: m.anime.title,
      poster: m.anime.poster,
      year: m.anime.year,
      genres: m.anime.genres,
      status: m.anime.status,
      episodes: m.anime.episodes,
      dubAvailable: m.anime.dubAvailable,
      subAvailable: m.anime.subAvailable,
      hindiAvailable: m.anime.hindiAvailable,
      rating: m.anime.rating,
      description: m.anime.description?.slice(0, 160) + '...',
      matchReason: m.matchReason
    }))
  };
}

function executeGetAnimeDetails(animeId: string) {
  const item = COMPREHENSIVE_ANIME_CATALOG.find(a => 
    a.id.toLowerCase() === animeId.toLowerCase() ||
    normalizeSearchString(a.title) === normalizeSearchString(animeId)
  );

  if (!item) {
    return { found: false, message: `Anime "${animeId}" not found in database.` };
  }

  return {
    found: true,
    anime: {
      id: item.id,
      title: item.title,
      poster: item.poster,
      banner: item.banner,
      year: item.year,
      genres: item.genres,
      status: item.status,
      episodes: item.episodes,
      dubAvailable: item.dubAvailable,
      subAvailable: item.subAvailable,
      hindiAvailable: item.hindiAvailable,
      rating: item.rating,
      description: item.description,
      studio: item.studio
    }
  };
}

function executeGetEpisode(animeId: string, episodeNumber?: number, isLatest?: boolean) {
  let target = COMPREHENSIVE_ANIME_CATALOG.find(a => 
    a.id.toLowerCase() === animeId.toLowerCase() ||
    normalizeSearchString(a.title) === normalizeSearchString(animeId)
  );

  if (!target) {
    const searchRes = searchCatalogSmart(COMPREHENSIVE_ANIME_CATALOG, animeId, { limit: 1 });
    if (searchRes.length > 0) {
      target = searchRes[0].anime;
    }
  }

  if (!target) {
    return { found: false, message: `Anime "${animeId}" not found.` };
  }

  const maxEp = target.episodes || 12;
  let epNum = episodeNumber || 1;
  if (isLatest) {
    epNum = maxEp;
  } else if (epNum > maxEp && target.status === 'Completed') {
    epNum = maxEp;
  }

  updateAnalytics(a => ({ ...a, episodesCount: (a.episodesCount || 0) + 1 }));

  return {
    found: true,
    episode: {
      animeId: target.id,
      animeTitle: target.title,
      poster: target.poster,
      episodeNumber: epNum,
      episodeTitle: `Episode ${epNum}`,
      watchUrl: `/watch/${target.id}?ep=${epNum}`
    }
  };
}

function executeGetSimilarAnime(animeId: string) {
  let target = COMPREHENSIVE_ANIME_CATALOG.find(a => 
    a.id.toLowerCase() === animeId.toLowerCase() ||
    normalizeSearchString(a.title) === normalizeSearchString(animeId)
  );

  if (!target) {
    const searchRes = searchCatalogSmart(COMPREHENSIVE_ANIME_CATALOG, animeId, { limit: 1 });
    if (searchRes.length > 0) {
      target = searchRes[0].anime;
    }
  }

  if (!target || !target.genres) {
    return { found: false, message: `Anime not found or lacks genre data.` };
  }

  const primaryGenre = target.genres[0];
  const similar = COMPREHENSIVE_ANIME_CATALOG.filter(a => 
    a.id !== target.id && 
    a.genres && 
    a.genres.some(g => target.genres?.includes(g))
  ).slice(0, 4);

  updateAnalytics(a => ({ ...a, recommendationsCount: (a.recommendationsCount || 0) + 1 }));

  return {
    found: true,
    baseAnimeTitle: target.title,
    similarAnime: similar.map(s => ({
      id: s.id,
      title: s.title,
      poster: s.poster,
      year: s.year,
      rating: s.rating,
      genres: s.genres
    }))
  };
}

function executeGetTroubleshooting(issueType: string, animeId?: string, episodeNumber?: number) {
  return {
    issueType: issueType || 'playback_failed',
    title: 'ভিডিও ও সার্ভার সমস্যা সমাধান গাইড',
    description: 'ভিডিও লোড না হওয়া বা সার্ভার আটকে যাওয়ার জন্য নিচের সমাধানগুলো দেখুন:',
    steps: [
      'HD-1 (Vidsrc) কাজ না করলে HD-2 (Vidstream) বা HD-3 (Abyss) সার্ভারে সুইচ করুন।',
      'ব্রাউজারের ক্যাশ ক্লিয়ার করুন অথবা একবার পেজ রিলোড (Refresh) দিন।',
      'AdBlocker বা ট্র্যাকিং এক্সটেনশন থাকলে এই সাইটের জন্য সাময়িকভাবে পজ (Pause) করে দেখুন।'
    ],
    targetAnimeId: animeId,
    targetEpisode: episodeNumber || 1,
    suggestedServer: 'HD-2 (Vidstream)',
    canReport: true
  };
}

function executeReportBrokenEpisode(data: {
  animeTitle: string;
  episodeNumber: number;
  server?: string;
  problemType?: string;
  userMessage?: string;
  animeId?: string;
}) {
  const reports = readJsonFile<any[]>(REPORTS_FILE, []);
  const newReport = {
    id: `rep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    animeId: data.animeId || data.animeTitle.toLowerCase().replace(/[^a-z0-9]/g, '-'),
    animeTitle: data.animeTitle,
    episodeNumber: Number(data.episodeNumber) || 1,
    server: data.server || 'HD-1 (Vidsrc)',
    problemType: data.problemType || 'black_screen',
    userMessage: data.userMessage || '',
    timestamp: Date.now(),
    status: 'Pending',
    reportCount: 1
  };

  // Check for duplicates
  const existingIndex = reports.findIndex(r => 
    r.animeTitle.toLowerCase() === newReport.animeTitle.toLowerCase() &&
    r.episodeNumber === newReport.episodeNumber &&
    r.server === newReport.server
  );

  if (existingIndex >= 0) {
    reports[existingIndex].reportCount = (reports[existingIndex].reportCount || 1) + 1;
    reports[existingIndex].timestamp = Date.now();
  } else {
    reports.unshift(newReport);
  }

  writeJsonFile(REPORTS_FILE, reports);
  updateAnalytics(a => ({ ...a, reportsCount: (a.reportsCount || 0) + 1 }));

  return { success: true, message: `Report recorded for ${data.animeTitle} Ep ${data.episodeNumber}` };
}

function executeRequestAnime(data: { animeName: string; userMessage?: string }) {
  const requests = readJsonFile<any[]>(REQUESTS_FILE, []);
  const newReq = {
    id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    animeName: data.animeName,
    userMessage: data.userMessage || '',
    timestamp: Date.now(),
    status: 'New',
    requestCount: 1
  };

  const existingIdx = requests.findIndex(r => 
    r.animeName.toLowerCase().trim() === newReq.animeName.toLowerCase().trim()
  );

  if (existingIdx >= 0) {
    requests[existingIdx].requestCount = (requests[existingIdx].requestCount || 1) + 1;
    requests[existingIdx].timestamp = Date.now();
  } else {
    requests.unshift(newReq);
  }

  writeJsonFile(REQUESTS_FILE, requests);
  updateAnalytics(a => ({ ...a, requestsCount: (a.requestsCount || 0) + 1 }));

  return { success: true, message: `Request recorded for ${data.animeName}` };
}

let geminiQuotaExhaustedUntil = 0;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. POST /api/ai-assistant/chat
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
aiAssistantRouter.post('/chat', async (req, res) => {
  const { message, history, activeContext, config, language = 'bn' } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ success: false, message: 'Message text is required' });
  }

  updateAnalytics(a => ({
    ...a,
    totalConversations: (a.totalConversations || 0) + (history?.length <= 2 ? 1 : 0),
    totalMessages: (a.totalMessages || 0) + 1
  }));

  const cards: any[] = [];
  const quickActions: string[] = [];

  const langNames: Record<string, string> = {
    bn: 'Bengali (বাংলা)',
    en: 'English',
    hi: 'Hindi (हिन्दी)',
    ja: 'Japanese (日本語)',
    es: 'Spanish (Español)',
    ar: 'Arabic (العربية)'
  };
  const targetLanguageName = langNames[language] || 'Bengali (বাংলা)';

  // Build Context Header
  let contextPrompt = '';
  if (activeContext && activeContext.id) {
    contextPrompt = `[CURRENT ACTIVE PAGE CONTEXT: The user is currently on the anime page for "${activeContext.title}" (ID: ${activeContext.id}${activeContext.currentEpisode ? `, Episode: ${activeContext.currentEpisode}` : ''}). When the user uses pronouns like "its", "এর", "এই anime", "পরের পর্ব", refer to "${activeContext.title}".]\n`;
  }

  const systemInstruction = `You are "Anime AI", an intelligent, polite, friendly, and helpful anime assistant integrated into this anime streaming website.
Your mission:
1. Search anime from the website's database
2. Find episodes and watch links from the website database
3. Recommend similar anime available on this website
4. Troubleshoot video playback and server issues
5. Record broken video reports and anime requests from users

CRITICAL LANGUAGE REQUIREMENT:
- The user has chosen the language: "${targetLanguageName}".
- You MUST write your final response text strictly and fluently in ${targetLanguageName}.
- Keep responses concise, warm, helpful, and natural in ${targetLanguageName}.

CRITICAL DUBBING & CATALOG RULES:
- Anime on this website has English Dub ("English Dub") and Hindi Dub ("Hindi Dub") available, along with Japanese Audio with Subtitles ("SUB").
- Anime DOES NOT have Bengali Dub. NEVER say anime has Bengali Dub. When users ask for dubbed anime, recommend English Dub and Hindi Dub anime from the catalog.
- Ground all anime facts and watch recommendations in the website's own catalog. NEVER hallucinate fake anime or fake watch links that do not exist.
- When searching, finding episodes, or recommending, ALWAYS call the appropriate tool so that rich interactive cards can be displayed to the user.`;

  try {
    // If Gemini API is unconfigured or temporarily under quota cooldown, jump directly to local engine
    if (!process.env.GEMINI_API_KEY || Date.now() < geminiQuotaExhaustedUntil) {
      throw new Error('Local engine active');
    }

    const chatContents: any[] = [];

    // Add prior history if provided
    if (Array.isArray(history)) {
      for (const h of history.slice(-6)) {
        chatContents.push({
          role: h.role === 'model' ? 'model' : 'user',
          parts: [{ text: h.text }]
        });
      }
    }

    // Add current user prompt with context
    chatContents.push({
      role: 'user',
      parts: [{ text: `${contextPrompt}${message}` }]
    });

    const modelsToTry = ['gemini-3.8-flash', 'gemini-3.1-flash-lite'];
    let geminiResponse: any = null;

    for (const modelName of modelsToTry) {
      try {
        const geminiPromise = ai.models.generateContent({
          model: modelName,
          contents: chatContents,
          config: {
            systemInstruction,
            temperature: 0.7,
            tools: [{
              functionDeclarations: [
                searchAnimeTool,
                getAnimeDetailsTool,
                getEpisodeTool,
                getSimilarAnimeTool,
                getTroubleshootingGuideTool,
                reportBrokenEpisodeTool,
                requestAnimeTool
              ]
            }]
          }
        });

        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('timeout')), 20000)
        );

        geminiResponse = await Promise.race([geminiPromise, timeoutPromise]);
        if (geminiResponse) break;
      } catch (mErr: any) {
        const mStr = String(mErr?.message || '');
        if (mStr.includes('429') || mStr.includes('RESOURCE_EXHAUSTED') || mStr.includes('Quota')) {
          geminiQuotaExhaustedUntil = Date.now() + 60 * 1000;
        }
      }
    }

    if (!geminiResponse) {
      throw new Error('Local engine active');
    }

    let replyText = '';
    try {
      replyText = geminiResponse.text || '';
    } catch (_e) {
      // In @google/genai, .text accessor throws if response only contains functionCalls
      replyText = '';
    }

    const functionCalls = geminiResponse.functionCalls || 
      geminiResponse.candidates?.[0]?.content?.parts?.filter((p: any) => p.functionCall)?.map((p: any) => p.functionCall);

    // Handle Tool Execution
    if (functionCalls && functionCalls.length > 0) {
      for (const call of functionCalls) {
        const { name, args } = call;

        if (name === 'searchAnime') {
          const result = executeSearchAnime((args as any).query, (args as any).genre);
          if (result.found && result.animes) {
            for (const a of result.animes) {
              cards.push({ type: 'anime', data: a });
            }
            if (!replyText) {
              replyText = `আমি তোমার জন্য এই ফলাফলগুলো খুঁজে পেয়েছি:`;
            }
          } else {
            if (!replyText) {
              replyText = `আমি তোমার সাইটে "${(args as any).query}" খুঁজে পাইনি। নামটি অন্য বানানে লিখে দেখতে পারো।`;
            }
            quickActions.push('📩 Anime Request', '✨ জনপ্রিয় Anime সাজেস্ট করুন');
          }
        }

        if (name === 'getAnimeDetails') {
          const result = executeGetAnimeDetails((args as any).animeId);
          if (result.found && result.anime) {
            cards.push({ type: 'anime', data: result.anime });
          }
        }

        if (name === 'getEpisode') {
          const result = executeGetEpisode((args as any).animeId, (args as any).episodeNumber, (args as any).isLatest);
          if (result.found && result.episode) {
            cards.push({ type: 'episode', data: result.episode });
            if (!replyText) {
              replyText = `এখানে ${result.episode.animeTitle} Episode ${result.episode.episodeNumber}-এর প্লেব্যাক লিংক রয়েছে:`;
            }
          }
        }

        if (name === 'getSimilarAnime') {
          const result = executeGetSimilarAnime((args as any).animeId);
          if (result.found && result.similarAnime) {
            cards.push({
              type: 'similar',
              data: {
                animeList: result.similarAnime,
                baseAnimeTitle: result.baseAnimeTitle
              }
            });
          }
        }

        if (name === 'getTroubleshootingGuide') {
          const result = executeGetTroubleshooting(
            (args as any).issueType,
            (args as any).animeId || activeContext?.id,
            (args as any).episodeNumber || activeContext?.currentEpisode
          );
          cards.push({ type: 'troubleshoot', data: result });
          if (!replyText) {
            replyText = `ভিডিও বা সার্ভার সমস্যার সমাধানের জন্য নিচের ধাপগুলো দেখুন:`;
          }
        }

        if (name === 'reportBrokenEpisode') {
          executeReportBrokenEpisode(args as any);
          if (!replyText) {
            replyText = `🚨 "${(args as any).animeTitle}" Episode ${(args as any).episodeNumber}-এর রিপোর্ট জমা নেওয়া হয়েছে। আমাদের টিম খুব দ্রুত এটি পর্যবেক্ষণ করবে।`;
          }
        }

        if (name === 'requestAnime') {
          executeRequestAnime(args as any);
          if (!replyText) {
            replyText = `📩 "${(args as any).animeName}"-এর অনুরোধ অ্যাডমিন প্যানেলে পাঠানো হয়েছে। শীঘ্রই সাইটে যুক্ত করার চেষ্টা করা হবে!`;
          }
        }
      }
    }

    const defaultReplyTranslations: Record<string, any> = {
      bn: {
        similar: 'আমি তোমার পছন্দের ভিত্তিতে এই অনুরূপ Anime গুলো রিকমেন্ড করছি:',
        anime: 'আমি তোমার জন্য এই ফলাফলগুলো খুঁজে পেয়েছি:',
        episode: 'এখানে অনুরোধকৃত পর্বের প্লেব্যাক লিংক দেওয়া হলো:',
        troubleshoot: 'ভিডিও বা সার্ভার সমস্যা সমাধানের জন্য নিচের নির্দেশনা দেখুন:',
        fallback: 'আমি তোমাকে কীভাবে সাহায্য করতে পারি? Anime বা Episode খুঁজতে আমাকে নাম বলো।'
      },
      en: {
        similar: 'Based on your preferences, here are recommended similar anime:',
        anime: 'Here are the anime results found for your search:',
        episode: 'Here is the watch link for the requested episode:',
        troubleshoot: 'Please follow the troubleshooting steps below for video playback:',
        fallback: 'How can I help you today? Tell me what anime or episode you are looking for.'
      },
      hi: {
        similar: 'आपकी पसंद के आधार पर ये मिलते-जुलते एनीमे सुझाव हैं:',
        anime: 'आपकी खोज के आधार पर ये परिणाम मिले हैं:',
        episode: 'अनुरोध किए गए एपिसोड का प्लेबैक लिंक यहाँ है:',
        troubleshoot: 'वीडियो या सर्वर समस्या के समाधान के लिए नीचे दिए गए निर्देश देखें:',
        fallback: 'मैं आपकी किस तरह सहायता कर सकता हूँ? एनीमे या एपिसोड खोजने के लिए नाम बताएं।'
      },
      ja: {
        similar: 'お好みに合わせたおすすめのアニメはこちらです：',
        anime: '検索結果のアニメが見つかりました：',
        episode: 'リクエストされたエピソードの再生リンクはこちらです：',
        troubleshoot: '動画またはサーバーの問題を解決するには以下の手順をご覧ください：',
        fallback: 'どのようにお手伝いしましょうか？探しているアニメやエピソードをお知らせください。'
      },
      es: {
        similar: 'Según tus preferencias, aquí tienes animes similares recomendados:',
        anime: 'Estos son los resultados de anime encontrados para tu búsqueda:',
        episode: 'Aquí está el enlace de reproducción para el episodio solicitado:',
        troubleshoot: 'Sigue estos pasos para solucionar problemas con el video o servidor:',
        fallback: '¿Cómo puedo ayudarte? Dime qué anime o episodio estás buscando.'
      },
      ar: {
        similar: 'بناءً على تفضيلاتك، إليك هذه الأنميات المشابهة المقترحة:',
        anime: 'إليك نتائج الأنمي التي تم العثور عليها لبحثك:',
        episode: 'إليك رابط المشاهدة للحلقة المطلوبة:',
        troubleshoot: 'يرجى اتباع خطوات استكشاف الأخطاء وإصلاحها لمشاكل تشغيل الفيديو:',
        fallback: 'كيف يمكنني مساعدتك؟ أخبرني عن اسم الأنمي أو الحلقة التي تبحث عنها.'
      }
    };
    const currentDefT = defaultReplyTranslations[language || 'bn'] || defaultReplyTranslations.bn;

    if (!replyText && cards.length > 0) {
      if (cards.some(c => c.type === 'similar')) {
        replyText = currentDefT.similar;
      } else if (cards.some(c => c.type === 'anime')) {
        replyText = currentDefT.anime;
      } else if (cards.some(c => c.type === 'episode')) {
        replyText = currentDefT.episode;
      } else if (cards.some(c => c.type === 'troubleshoot')) {
        replyText = currentDefT.troubleshoot;
      }
    }

    if (!replyText && cards.length === 0) {
      replyText = currentDefT.fallback;
    }

    return res.json({
      success: true,
      reply: replyText,
      cards,
      quickActions
    });
  } catch (err: any) {
    const errStr = String(err?.message || '');
    if (errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('Quota')) {
      geminiQuotaExhaustedUntil = Date.now() + 60 * 1000;
    }
    
    const lowerMsg = (message || '').toLowerCase();
    const lang = (language && ['bn', 'en', 'hi', 'ja', 'es', 'ar'].includes(language)) ? language : 'bn';

    const i18n: Record<string, any> = {
      bn: {
        troubleshoot: 'ভিডিও বা সার্ভার সমস্যার সমাধানের জন্য নিচের ধাপগুলো দেখুন:',
        episodeFound: (title: string, ep: number) => `এখানে ${title} Episode ${ep}-এর প্লেব্যাক লিংক রয়েছে:`,
        similar: 'আমি তোমার পছন্দের ভিত্তিতে এই অনুরূপ Anime গুলো রিকমেন্ড করছি:',
        request: 'তুমি ওয়েবসাইটে নতুন কোনো Anime যুক্ত করার জন্য Anime Request পাঠাতে পারো:',
        found: 'তোমার খোঁজার ভিত্তিতে এই Anime গুলো পাওয়া গেছে:',
        notFound: (q: string) => `আমি তোমার সাইটে "${q}" সম্পর্কিত কোনো Anime খুঁজে পাইনি। নামটি অন্য বানানে লিখে চেষ্টা করতে পারো।`,
        engDub: 'এখানে ইংলিশ ডাবে (English Dub) উপলব্ধ শীর্ষ Anime গুলো রয়েছে (অ্যানিমের কোনো বাংলা ডাব হয় না, ইংলিশ ও হিন্দি ডাব রয়েছে):',
        hiDub: 'এখানে হিন্দি ডাবে (Hindi Dub) উপলব্ধ শীর্ষ Anime গুলো রয়েছে:'
      },
      en: {
        troubleshoot: 'Here are the steps to troubleshoot video and server playback issues:',
        episodeFound: (title: string, ep: number) => `Here is the playback watch link for ${title} Episode ${ep}:`,
        similar: 'Based on your preferences, here are recommended similar anime:',
        request: 'You can submit an Anime Request to add a new anime to the website:',
        found: 'Here are the anime found matching your search:',
        notFound: (q: string) => `No anime found matching "${q}" in the catalog. Please try a different title.`,
        engDub: 'Here are the top anime available with English Dub (Anime features English & Hindi Dubs):',
        hiDub: 'Here are the top anime available with Hindi Dub:'
      },
      hi: {
        troubleshoot: 'वीडियो या सर्वर प्लेबैक समस्या के समाधान के लिए नीचे दिए गए चरण देखें:',
        episodeFound: (title: string, ep: number) => `यहाँ ${title} Episode ${ep} का डायरेक्ट प्लेबैक लिंक है:`,
        similar: 'आपकी पसंद के आधार पर ये मिलते-जुलते एनीमे सुझाव हैं:',
        request: 'वेबसाइट पर नया एनीमे जोड़ने के लिए आप एनीमे रिक्वेस्ट भेज सकते हैं:',
        found: 'आपकी खोज के आधार पर ये एनीमे उपलब्ध हैं:',
        notFound: (q: string) => `कैटलॉग में "${q}" का कोई एनीमे नहीं मिला। कृपया दूसरा नाम आज़माएँ।`,
        engDub: 'यहाँ इंग्लिश डब (English Dub) में उपलब्ध लोकप्रिय एनीमे हैं (एनीमे में इंग्लिश और हिन्दी डब उपलब्ध है):',
        hiDub: 'यहाँ हिन्दी डब (Hindi Dub) में उपलब्ध लोकप्रिय एनीमे हैं:'
      },
      ja: {
        troubleshoot: '動画やサーバーの再生問題を解決するための手順は以下をご覧ください：',
        episodeFound: (title: string, ep: number) => `『${title}』第${ep}話の再生リンクはこちらです：`,
        similar: 'お好みに合わせたおすすめのアニメはこちらです：',
        request: '新しいアニメの追加リクエストを送信できます：',
        found: '検索に一致するアニメが見つかりました：',
        notFound: (q: string) => `「${q}」に一致するアニメは見つかりませんでした。別の名称でお試しください。`,
        engDub: '英語吹替（English Dub）対応の人気アニメ一覧です：',
        hiDub: 'ヒンディー語吹替（Hindi Dub）対応の人気アニメ一覧です：'
      },
      es: {
        troubleshoot: 'Aquí tienes los pasos para resolver problemas de reproducción o servidor:',
        episodeFound: (title: string, ep: number) => `Aquí tienes el enlace de reproducción para ${title} Episodio ${ep}:`,
        similar: 'Según tus preferencias, te recomendamos estos animes similares:',
        request: 'Puedes enviar una solicitud para agregar un nuevo anime a la plataforma:',
        found: 'Estos son los animes encontrados para tu búsqueda:',
        notFound: (q: string) => `No se encontró ningún anime para "${q}". Intenta con otra búsqueda.`,
        engDub: 'Aquí tienes los mejores animes con doblaje en inglés (English Dub):',
        hiDub: 'Aquí tienes los mejores animes con doblaje en hindi (Hindi Dub):'
      },
      ar: {
        troubleshoot: 'إليك خطوات حل مشاكل تشغيل الفيديو أو الخادم:',
        episodeFound: (title: string, ep: number) => `إليك رابط المشاهدة لـ ${title} الحلقة ${ep}:`,
        similar: 'بناءً على تفضيلاتك، إليك هذه الأنميات المشابهة المقترحة:',
        request: 'يمكنك تقديم طلب لإضافة أنمي جديد إلى الموقع:',
        found: 'إليك الأنميات المتوفرة بناءً على بحثك:',
        notFound: (q: string) => `لم يتم العثور على أنمي يطابق "${q}". يرجى محاولة كتابة الاسم بشكل آخر.`,
        engDub: 'إليك أفضل الأنميات المتوفرة بالدبلجة الإنجليزية (English Dub):',
        hiDub: 'إليك أفضل الأنميات المتوفرة بالدبلجة الهندية (Hindi Dub):'
      }
    };
    const t = i18n[lang] || i18n.bn;

    // 1. Proactive Troubleshooting Check
    if (lowerMsg.includes('ভিডিও') || lowerMsg.includes('চলছে না') || lowerMsg.includes('problem') || lowerMsg.includes('server') || lowerMsg.includes('play') || lowerMsg.includes('error') || lowerMsg.includes('সমস্যা') || lowerMsg.includes('প্লে') || lowerMsg.includes('مشكلة') || lowerMsg.includes('সমস্য')) {
      const troubleshootData = executeGetTroubleshooting('playback_failed', activeContext?.id, activeContext?.currentEpisode);
      return res.json({
        success: true,
        reply: t.troubleshoot,
        cards: [{ type: 'troubleshoot', data: troubleshootData }],
        quickActions: ['🚨 Report Problem', 'HD-2 Server']
      });
    }

    // 2. English / Hindi Dub Check (Explicit rule: Anime has English & Hindi dubs, no Bangla dub)
    if (lowerMsg.includes('dub') || lowerMsg.includes('ডাব') || lowerMsg.includes('hindi') || lowerMsg.includes('হিন্দি') || lowerMsg.includes('english') || lowerMsg.includes('ইংলিশ') || lowerMsg.includes('ইংরেজি') || lowerMsg.includes('डब') || lowerMsg.includes('吹替') || lowerMsg.includes('doblaje') || lowerMsg.includes('مدبلج')) {
      const isHindi = lowerMsg.includes('hindi') || lowerMsg.includes('হিন্দি') || lowerMsg.includes('हिन्दी') || lowerMsg.includes('ヒンディー');
      const filtered = COMPREHENSIVE_ANIME_CATALOG.filter(a => isHindi ? a.hindiAvailable : a.dubAvailable).slice(0, 4);

      if (filtered.length > 0) {
        return res.json({
          success: true,
          reply: isHindi ? t.hiDub : t.engDub,
          cards: filtered.map(a => ({ type: 'anime', data: a })),
          quickActions: ['🔥 ট্রেন্ডিং', '🎲 সারপ্রাইজ']
        });
      }
    }

    // 3. Episode Finding Pattern Check
    const epMatch1 = message.match(/(.+?)\s+(?:episode|ep|পর্ব|एपिसोड|話|capitulo|الحلقة)\s*[:#-]?\s*(\d+)/i);
    const epMatch2 = message.match(/(?:episode|ep|পর্ব|एपिसोड|話|capitulo|الحلقة)\s*[:#-]?\s*(\d+)\s+(?:of\s+)?(.+)/i);
    const latestEpMatch = message.match(/(.+?)(?:এর)?\s+(?:শেষ|লাস্ট|সর্বশেষ|latest|last|अंतिम|最新|último|الأخيرة)\s+(?:পর্ব|episode)/i);

    if (epMatch1 || epMatch2 || latestEpMatch) {
      const animeName = epMatch1 ? epMatch1[1] : epMatch2 ? epMatch2[2] : latestEpMatch![1];
      const epNum = epMatch1 ? parseInt(epMatch1[2], 10) : epMatch2 ? parseInt(epMatch2[1], 10) : undefined;
      const isLatest = Boolean(latestEpMatch);

      const epRes = executeGetEpisode(animeName.trim(), epNum, isLatest);
      if (epRes.found && epRes.episode) {
        return res.json({
          success: true,
          reply: t.episodeFound(epRes.episode.animeTitle, epRes.episode.episodeNumber),
          cards: [{ type: 'episode', data: epRes.episode }],
          quickActions: ['🎬 অন্য পর্ব দেখুন']
        });
      }
    }

    // 4. Similar / Recommendation Pattern Check
    const simMatch = message.match(/(.+?)(?:এর|এর মতো|এর মত| মতো| মত| similar to)\s+(?:কিছু\s+)?(?:অ্যানিমে|anime|সাজেস্ট|recommend)/i);
    if (simMatch || lowerMsg.includes('recommend') || lowerMsg.includes('সাজেস্ট') || lowerMsg.includes('সেরা') || lowerMsg.includes('सुझाव') || lowerMsg.includes('sugerir')) {
      const targetQuery = simMatch ? simMatch[1].trim() : (activeContext?.title || 'Action');
      const simRes = executeGetSimilarAnime(targetQuery);
      if (simRes.found && simRes.similarAnime) {
        return res.json({
          success: true,
          reply: t.similar,
          cards: [{
            type: 'similar',
            data: {
              animeList: simRes.similarAnime,
              baseAnimeTitle: simRes.baseAnimeTitle
            }
          }],
          quickActions: ['✨ আরও সাজেস্ট করুন']
        });
      }
    }

    // 5. Request Pattern Check
    if (lowerMsg.includes('request') || lowerMsg.includes('রিকোয়েস্ট') || lowerMsg.includes('যুক্ত করুন') || lowerMsg.includes('add') || lowerMsg.includes('अनुरोध') || lowerMsg.includes('solicitud') || lowerMsg.includes('طلب')) {
      return res.json({
        success: true,
        reply: t.request,
        cards: [],
        quickActions: ['📩 Anime Request']
      });
    }

    // 6. Local Fallback: Smart Fuzzy Search
    const fallbackResults = searchCatalogSmart(COMPREHENSIVE_ANIME_CATALOG, message, { limit: 3 });
    if (fallbackResults.length > 0) {
      const fallbackCards = fallbackResults.map(r => ({
        type: 'anime',
        data: r.anime
      }));
      return res.json({
        success: true,
        reply: t.found,
        cards: fallbackCards,
        quickActions: ['✨ আরও সাজেস্ট করুন']
      });
    }

    return res.json({
      success: true,
      reply: t.notFound(message),
      cards: [],
      quickActions: ['📩 Anime Request']
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. CONFIG ROUTES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
aiAssistantRouter.get('/config', (_req, res) => {
  const config = getAiConfig();
  res.json({ success: true, config });
});

aiAssistantRouter.post('/config', (req, res) => {
  const { config } = req.body;
  if (!config) {
    return res.status(400).json({ success: false, message: 'Config payload is required' });
  }
  writeJsonFile(CONFIG_FILE, config);
  res.json({ success: true, message: 'AI configuration updated successfully', config });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. ANALYTICS ROUTES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
aiAssistantRouter.get('/analytics', (_req, res) => {
  const analytics = readJsonFile(ANALYTICS_FILE, DEFAULT_ANALYTICS);
  res.json({ success: true, analytics });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. BROKEN VIDEO REPORTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
aiAssistantRouter.get('/reports', (_req, res) => {
  const reports = readJsonFile<any[]>(REPORTS_FILE, []);
  res.json({ success: true, reports });
});

aiAssistantRouter.post('/reports', (req, res) => {
  const { animeTitle, animeId, episodeNumber, server, problemType, userMessage } = req.body;
  if (!animeTitle) {
    return res.status(400).json({ success: false, message: 'animeTitle is required' });
  }

  const result = executeReportBrokenEpisode({
    animeTitle,
    animeId,
    episodeNumber,
    server,
    problemType,
    userMessage
  });

  res.json(result);
});

aiAssistantRouter.post('/reports/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const reports = readJsonFile<any[]>(REPORTS_FILE, []);
  const report = reports.find(r => r.id === id);
  if (!report) {
    return res.status(404).json({ success: false, message: 'Report not found' });
  }
  report.status = status;
  writeJsonFile(REPORTS_FILE, reports);
  res.json({ success: true, message: 'Report status updated' });
});

aiAssistantRouter.delete('/reports/:id', (req, res) => {
  const { id } = req.params;
  let reports = readJsonFile<any[]>(REPORTS_FILE, []);
  reports = reports.filter(r => r.id !== id);
  writeJsonFile(REPORTS_FILE, reports);
  res.json({ success: true, message: 'Report deleted' });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. ANIME REQUESTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
aiAssistantRouter.get('/requests', (_req, res) => {
  const requests = readJsonFile<any[]>(REQUESTS_FILE, []);
  res.json({ success: true, requests });
});

aiAssistantRouter.post('/requests', (req, res) => {
  const { animeName, userMessage } = req.body;
  if (!animeName) {
    return res.status(400).json({ success: false, message: 'animeName is required' });
  }

  const result = executeRequestAnime({ animeName, userMessage });
  res.json(result);
});

aiAssistantRouter.post('/requests/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const requests = readJsonFile<any[]>(REQUESTS_FILE, []);
  const reqItem = requests.find(r => r.id === id);
  if (!reqItem) {
    return res.status(404).json({ success: false, message: 'Request not found' });
  }
  reqItem.status = status;
  writeJsonFile(REQUESTS_FILE, requests);
  res.json({ success: true, message: 'Request status updated' });
});

aiAssistantRouter.delete('/requests/:id', (req, res) => {
  const { id } = req.params;
  let requests = readJsonFile<any[]>(REQUESTS_FILE, []);
  requests = requests.filter(r => r.id !== id);
  writeJsonFile(REQUESTS_FILE, requests);
  res.json({ success: true, message: 'Request deleted' });
});
