// @ts-nocheck
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Play, Info, AlertTriangle, ShieldAlert, CheckCircle, RefreshCw, 
  ExternalLink, Sparkles, Send, Check, Film, Tv, Star
} from 'lucide-react';
import { AiCard, AiCardAnimeData, AiCardEpisodeData, AiCardTroubleshootData } from './aiTypes';

interface AiMessageCardsProps {
  card: AiCard;
  onAction?: (actionText: string) => void;
  onOpenReport?: (data: { animeId: string; animeTitle: string; episode?: number; server?: string }) => void;
}

export const AiMessageCards: React.FC<AiMessageCardsProps> = ({ card, onAction, onOpenReport }) => {
  const navigate = useNavigate();

  if (card.type === 'anime') {
    const item = card.data;
    return (
      <div className="mt-2.5 bg-gradient-to-b from-[#131b2e]/90 to-[#0b101d]/90 border border-cyan-500/20 hover:border-cyan-500/40 rounded-2xl p-3 shadow-lg transition-all duration-300 backdrop-blur-md max-w-sm">
        <div className="flex gap-3">
          {/* Poster */}
          <div className="relative w-20 h-28 flex-shrink-0 rounded-xl overflow-hidden shadow-md border border-white/10 group">
            <img 
              src={item.poster} 
              alt={item.title} 
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=300&q=80';
              }}
            />
            {item.rating && (
              <div className="absolute top-1 left-1 bg-black/70 backdrop-blur-md px-1.5 py-0.5 rounded text-[9px] font-black text-amber-400 flex items-center gap-0.5 border border-amber-500/20">
                <Star className="w-2.5 h-2.5 fill-current" />
                {item.rating}
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="flex-1 min-w-0 flex flex-col justify-between">
            <div>
              <h4 className="text-white font-bold text-sm truncate leading-snug tracking-wide" title={item.title}>
                {item.title}
              </h4>
              {item.japaneseTitle && (
                <p className="text-[10px] text-gray-400 truncate italic">
                  {item.japaneseTitle}
                </p>
              )}

              {/* Badges */}
              <div className="flex flex-wrap items-center gap-1 mt-1 text-[9px] font-bold">
                {item.year && (
                  <span className="text-cyan-300 bg-cyan-950/60 border border-cyan-800/40 px-1.5 py-0.5 rounded">
                    {item.year}
                  </span>
                )}
                {item.status && (
                  <span className="text-emerald-300 bg-emerald-950/60 border border-emerald-800/40 px-1.5 py-0.5 rounded">
                    {item.status}
                  </span>
                )}
                {item.episodes && (
                  <span className="text-purple-300 bg-purple-950/60 border border-purple-800/40 px-1.5 py-0.5 rounded">
                    {item.episodes} Ep
                  </span>
                )}
                {item.dubAvailable && (
                  <span className="text-amber-300 bg-amber-950/60 border border-amber-800/40 px-1.5 py-0.5 rounded font-bold">
                    ENG DUB
                  </span>
                )}
                {item.hindiAvailable && (
                  <span className="text-rose-300 bg-rose-950/60 border border-rose-800/40 px-1.5 py-0.5 rounded font-bold">
                    HINDI DUB
                  </span>
                )}
                {item.subAvailable && (
                  <span className="text-blue-300 bg-blue-950/60 border border-blue-800/40 px-1.5 py-0.5 rounded font-bold">
                    SUB
                  </span>
                )}
              </div>

              {/* Genre chips */}
              {item.genres && item.genres.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {item.genres.slice(0, 3).map((g, idx) => (
                    <span key={idx} className="text-[9px] text-gray-300 bg-white/5 px-1.5 py-0.2 rounded-md">
                      {g}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Description Snippet */}
            {item.description && (
              <p className="text-[10px] text-gray-400 line-clamp-2 mt-1 leading-relaxed">
                {item.description}
              </p>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 mt-2.5 pt-2 border-t border-white/5">
          <button
            onClick={() => navigate(`/watch/${item.id}`)}
            className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-black text-xs py-1.5 px-3 rounded-xl transition-all shadow-md shadow-cyan-500/20 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Watch Now
          </button>
          <button
            onClick={() => navigate(`/anime/${item.id}`)}
            className="bg-white/10 hover:bg-white/20 text-white font-semibold text-xs py-1.5 px-3 rounded-xl transition-all border border-white/10 flex items-center justify-center gap-1 cursor-pointer"
          >
            <Info className="w-3.5 h-3.5" />
            Details
          </button>
        </div>
      </div>
    );
  }

  if (card.type === 'episode') {
    const ep = card.data;
    return (
      <div className="mt-2.5 bg-gradient-to-b from-[#11192e]/95 to-[#0b101c]/95 border border-cyan-500/30 rounded-2xl p-3 shadow-xl backdrop-blur-md max-w-sm">
        <div className="flex items-center gap-3">
          <div className="relative w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 border border-white/10 group cursor-pointer" onClick={() => navigate(ep.watchUrl)}>
            <img 
              src={ep.poster} 
              alt={ep.animeTitle} 
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
            />
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <div className="w-7 h-7 rounded-full bg-cyan-500 text-black flex items-center justify-center shadow-lg">
                <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
              </div>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-black uppercase text-cyan-400 tracking-wider block">
              Episode {ep.episodeNumber}
            </span>
            <h4 className="text-white font-bold text-sm truncate" title={ep.animeTitle}>
              {ep.animeTitle}
            </h4>
            <p className="text-[11px] text-gray-400 truncate mt-0.5">
              {ep.episodeTitle || `Episode ${ep.episodeNumber}`}
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate(ep.watchUrl)}
          className="w-full mt-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-black text-xs py-2 px-3 rounded-xl transition-all shadow-md shadow-cyan-500/20 flex items-center justify-center gap-2 cursor-pointer"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          Watch Episode {ep.episodeNumber}
        </button>
      </div>
    );
  }

  if (card.type === 'similar') {
    const { animeList, baseAnimeTitle } = card.data;
    return (
      <div className="mt-2.5 space-y-2 max-w-sm">
        <p className="text-[11px] text-gray-400 font-semibold flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          Similar to <span className="text-white font-bold">{baseAnimeTitle}</span>:
        </p>
        <div className="grid grid-cols-2 gap-2">
          {animeList.map((item) => (
            <div 
              key={item.id}
              onClick={() => navigate(`/anime/${item.id}`)}
              className="bg-[#11192e]/80 border border-white/5 hover:border-cyan-500/40 rounded-xl p-2 transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div className="relative aspect-[3/4] w-full rounded-lg overflow-hidden mb-1.5">
                <img 
                  src={item.poster} 
                  alt={item.title} 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                {item.rating && (
                  <span className="absolute bottom-1 right-1 bg-black/80 px-1 py-0.2 rounded text-[8px] font-bold text-amber-400">
                    ★ {item.rating}
                  </span>
                )}
              </div>
              <h5 className="text-white text-xs font-bold truncate group-hover:text-cyan-300 transition-colors">
                {item.title}
              </h5>
              <div className="flex items-center justify-between text-[9px] text-gray-400 mt-1">
                <span>{item.year || 'Anime'}</span>
                <span className="text-cyan-400">View</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (card.type === 'troubleshoot') {
    const data = card.data;
    return (
      <div className="mt-2.5 bg-gradient-to-b from-[#181622]/90 to-[#100e18]/90 border border-amber-500/30 rounded-2xl p-3.5 shadow-xl max-w-sm">
        <div className="flex items-start gap-2.5 mb-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-white font-bold text-sm tracking-wide">
              {data.title}
            </h4>
            <p className="text-[11px] text-gray-300 mt-0.5 leading-snug">
              {data.description}
            </p>
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-1.5 my-2.5 bg-black/30 p-2.5 rounded-xl border border-white/5">
          {data.steps.map((step, idx) => (
            <div key={idx} className="flex items-start gap-2 text-[11px] text-gray-300">
              <span className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-400 text-[10px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">
                {idx + 1}
              </span>
              <span className="leading-tight">{step}</span>
            </div>
          ))}
        </div>

        {/* Direct Action Options */}
        <div className="flex flex-col gap-1.5 mt-2.5">
          {data.targetAnimeId && (
            <button
              onClick={() => {
                navigate(`/watch/${data.targetAnimeId}?ep=${data.targetEpisode || 1}&server=vidstream`);
              }}
              className="w-full bg-white/10 hover:bg-white/20 text-white text-xs font-bold py-1.5 px-3 rounded-xl border border-white/10 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
              Try HD-2 (Vidstream) Server
            </button>
          )}

          {data.targetAnimeId && (
            <button
              onClick={() => {
                navigate(`/watch/${data.targetAnimeId}?ep=${data.targetEpisode || 1}&server=abyss`);
              }}
              className="w-full bg-white/10 hover:bg-white/20 text-white text-xs font-bold py-1.5 px-3 rounded-xl border border-white/10 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
              Try HD-3 (Abyss) Server
            </button>
          )}

          {data.canReport && onOpenReport && (
            <button
              onClick={() => onOpenReport({
                animeId: data.targetAnimeId || 'active-anime',
                animeTitle: data.title || 'Anime Video',
                episode: data.targetEpisode || 1,
                server: data.suggestedServer || 'Default Server'
              })}
              className="w-full bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 font-bold text-xs py-1.5 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer mt-0.5"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
              Report Broken Episode
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
};
