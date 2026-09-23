// @ts-nocheck
import { Anime } from '../../types';

export interface AiCardAnimeData {
  id: string;
  title: string;
  englishTitle?: string;
  japaneseTitle?: string;
  poster: string;
  banner?: string;
  year?: string | number;
  genres?: string[];
  status?: string;
  episodes?: number;
  dubAvailable?: boolean;
  subAvailable?: boolean;
  hindiAvailable?: boolean;
  description?: string;
  rating?: string;
  matchReason?: string;
}

export interface AiCardEpisodeData {
  animeId: string;
  animeTitle: string;
  poster: string;
  episodeNumber: number;
  episodeTitle?: string;
  watchUrl: string;
  server?: string;
}

export interface AiCardTroubleshootData {
  issueType: string;
  title: string;
  description: string;
  steps: string[];
  suggestedServer?: string;
  targetAnimeId?: string;
  targetEpisode?: number;
  canReport: boolean;
}

export type AiCard =
  | { type: 'anime'; data: AiCardAnimeData }
  | { type: 'episode'; data: AiCardEpisodeData }
  | { type: 'similar'; data: { animeList: AiCardAnimeData[]; baseAnimeTitle: string } }
  | { type: 'troubleshoot'; data: AiCardTroubleshootData };

export interface AiMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: number;
  cards?: AiCard[];
  quickActions?: string[];
  isError?: boolean;
}

export interface AiConfig {
  enabled: boolean;
  maintenanceMode: boolean;
  name: string;
  welcomeMessage: string;
  avatar: string;
  features: {
    search: boolean;
    episodes: boolean;
    recommendations: boolean;
    siteHelp: boolean;
    brokenReports: boolean;
    animeRequests: boolean;
  };
}

export interface AiAnalytics {
  totalConversations: number;
  totalMessages: number;
  searchesCount: number;
  successfulSearches: number;
  failedSearches: number;
  episodesCount: number;
  recommendationsCount: number;
  reportsCount: number;
  requestsCount: number;
}

export interface BrokenEpisodeReport {
  id: string;
  animeId: string;
  animeTitle: string;
  episodeNumber: number;
  server: string;
  problemType: string;
  userMessage: string;
  timestamp: number;
  status: 'Pending' | 'Investigating' | 'Resolved';
  reportCount: number;
}

export interface AnimeUserRequest {
  id: string;
  animeName: string;
  userMessage: string;
  timestamp: number;
  status: 'New' | 'In Progress' | 'Added' | 'Rejected';
  requestCount: number;
}
