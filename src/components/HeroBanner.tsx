import React, { useState, useEffect } from "react";
import { Play, Info, Sparkles, Star, Volume2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Anime } from "../types";
import { startTopLoading } from "../lib/topLoadingManager";
import { prefetchEpisodeStream } from "../lib/playerPreloader";
import { 
  getVerifiedAnimeImage, 
  getDynamicAnimeFallbackBanner, 
  getDynamicAnimeFallbackPoster 
} from "../data/verifiedImages";

interface HeroBannerProps {
  displayAnimes?: Anime[];
  trending?: Anime[];
  spotlight?: Anime[];
}

const DEFAULT_SPOTLIGHT_ANIMES: Anime[] = [
  {
    id: "solo-leveling",
    title: "Solo Leveling",
    poster: "https://media.kitsu.app/anime/46231/poster_image/large-cdadff31f42490b9f48a035939a01a92.jpeg",
    banner: "https://media.kitsu.app/anime/46231/cover_image/large-33273dc297cdc8b10cc1140de07d3dae.jpeg",
    description: "In a world where hunters must battle deadly monsters to protect humanity, Sung Jinwoo, notoriously known as the 'Weakest Hunter of All Mankind,' awakens with a unique mysterious power.",
    rating: "9.6",
    type: "TV SERIES",
    status: "Releasing",
    genres: ["Action", "Fantasy", "Supernatural", "Adventure"]
  },
  {
    id: "jujutsu-kaisen-2",
    title: "Jujutsu Kaisen Season 2",
    poster: "https://media.kitsu.app/anime/46114/poster_image/large-41f6c44a7f052528dd29cb32cf39db90.jpeg",
    banner: "https://media.kitsu.app/anime/46114/cover_image/large-5a50785055b88825c8cfce79da152864.jpeg",
    description: "The past comes to light as Satoru Gojo and Suguru Geto take on a fateful mission in the Shibuya Incident, forever altering the world of Jujutsu Sorcery.",
    rating: "9.5",
    type: "TV SERIES",
    status: "Completed",
    genres: ["Action", "Supernatural", "Shounen", "Fantasy"]
  },
  {
    id: "demon-slayer-swordsmith",
    title: "Demon Slayer: Kimetsu no Yaiba",
    poster: "https://media.kitsu.app/anime/poster_images/40061/large.jpg",
    banner: "https://media.kitsu.app/anime/cover_images/40061/large.jpg",
    description: "Tanjiro Kamado continues his relentless quest to defeat Muzan Kibutsuji and restore his sister Nezuko to human form.",
    rating: "9.4",
    type: "TV SERIES",
    status: "Releasing",
    genres: ["Action", "Historical", "Supernatural", "Shounen"]
  },
  {
    id: "one-piece",
    title: "One Piece (Egghead Arc)",
    poster: "https://media.kitsu.app/anime/poster_images/12/large.jpg",
    banner: "https://media.kitsu.app/anime/cover_images/12/large.jpg",
    description: "Monkey D. Luffy and the Straw Hat Pirates explore the futuristic Island of the Future, Egghead, encountering Dr. Vegapunk and world-shattering secrets.",
    rating: "9.7",
    type: "TV SERIES",
    status: "Releasing",
    genres: ["Action", "Adventure", "Fantasy", "Shounen"]
  },
  {
    id: "frieren-beyond-journeys-end",
    title: "Frieren: Beyond Journey's End",
    poster: "https://media.kitsu.app/anime/46474/poster_image/large-22c60829ea1b2e67df66a1506bf181a1.jpeg",
    banner: "https://media.kitsu.app/anime/46474/cover_image/large-5fbe602517865ce3cf23ae4874c77174.jpeg",
    description: "After defeating the Demon King, elf mage Frieren embarks on a poignant journey of discovery to understand humanity and honor the memories of her companions.",
    rating: "9.8",
    type: "TV SERIES",
    status: "Completed",
    genres: ["Adventure", "Drama", "Fantasy", "Magic"]
  }
];

function cleanAnimeTitleForDisplay(title: string | undefined): string {
  if (!title) return "Featured Anime";
  return title
    .replace(/^AniWatch - Watch /i, "")
    .replace(/^AniWatch - /i, "")
    .replace(/^Watch /i, "")
    .replace(/ HD Free$/i, "")
    .replace(/ Online Free$/i, "")
    .replace(/ Free$/i, "")
    .replace(/ Stream Online$/i, "")
    .replace(/ Dub Online HD$/i, "")
    .trim();
}

function sanitizeBannerUrl(
  bannerUrl: string | undefined,
  posterUrl: string | undefined,
  title?: string,
  id?: string
): string {
  const verified = getVerifiedAnimeImage(title || id);
  if (verified?.banner) return verified.banner;
  if (bannerUrl && bannerUrl.startsWith("http") && !bannerUrl.includes("placeholder")) {
    return bannerUrl;
  }
  if (verified?.poster) return verified.poster;
  if (posterUrl && posterUrl.startsWith("http") && !posterUrl.includes("placeholder")) {
    return posterUrl;
  }
  return getDynamicAnimeFallbackBanner(title);
}

function sanitizePosterUrl(posterUrl: string | undefined, title?: string, id?: string): string {
  const verified = getVerifiedAnimeImage(title || id);
  if (verified?.poster) return verified.poster;
  if (posterUrl && posterUrl.startsWith("http") && !posterUrl.includes("placeholder")) {
    return posterUrl;
  }
  if (verified?.banner) return verified.banner;
  return getDynamicAnimeFallbackPoster(title);
}

function preloadImage(url: string) {
  if (!url) return;
  const img = new Image();
  img.src = url;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({ displayAnimes, trending, spotlight }) => {
  const [current, setCurrent] = useState(0);

  const rawList = (displayAnimes && displayAnimes.length > 0)
    ? displayAnimes
    : (trending && trending.length > 0)
      ? trending
      : (spotlight && spotlight.length > 0)
        ? spotlight
        : DEFAULT_SPOTLIGHT_ANIMES;

  const animes = rawList.slice(0, 7);

  useEffect(() => {
    if (animes.length <= 1) return;
    const interval = setInterval(() => {
      setCurrent((c) => (c + 1) % animes.length);
    }, 7000);
    return () => clearInterval(interval);
  }, [animes.length]);

  const anime = animes[current] || animes[0] || DEFAULT_SPOTLIGHT_ANIMES[0];

  const displayTitle = (() => {
    const clean = cleanAnimeTitleForDisplay(anime.title);
    if (/^\d+$/.test(clean) || /^custom-\d+$/i.test(anime.title)) {
      return "Anime Title #" + String(anime.id || anime.title).replace(/^custom-/i, "");
    }
    return clean;
  })();

  const imdbRating = anime.rating || (8.5 + (current * 0.2)).toFixed(1);

  return (
    <div className="relative w-full h-[36vh] xs:h-[39vh] sm:h-[44vh] md:h-[48vh] lg:h-[50vh] min-h-[290px] xs:min-h-[310px] sm:min-h-[350px] md:min-h-[390px] max-h-[490px] overflow-hidden hero border-b border-blue-500/20 bg-[#060a14]">
      {/* Background Banner Slides */}
      {animes.map((item, idx) => {
        const verified = getVerifiedAnimeImage(item.title);
        const resolvedBanner =
          verified?.banner ||
          sanitizeBannerUrl(item.banner, item.poster, item.title, item.id);

        return (
          <div
            key={item.id || idx}
            className="absolute inset-0 transition-opacity duration-1000 ease-in-out z-0"
            style={{ opacity: idx === current ? 1 : 0 }}
          >
            {/* Anime Background Image with smart positioning to keep character visible across mobile & desktop */}
            <img
              src={resolvedBanner}
              alt={cleanAnimeTitleForDisplay(item.title)}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover object-[75%_20%] sm:object-[center_20%] md:object-[center_15%] opacity-95 transition-transform duration-[8000ms] ease-out bg-[#060a14]"
              style={{ transform: idx === current ? "scale(1.02)" : "scale(1.0)" }}
              onError={(e) => {
                const verifiedPoster = verified?.poster;
                const itemPoster = item.poster;
                const dynamicFallback = getDynamicAnimeFallbackBanner(item.title);
                if (verifiedPoster && e.currentTarget.src !== verifiedPoster) {
                  e.currentTarget.src = verifiedPoster;
                } else if (itemPoster && e.currentTarget.src !== itemPoster) {
                  e.currentTarget.src = itemPoster;
                } else {
                  e.currentTarget.src = dynamicFallback;
                }
              }}
            />

            {/* Gradient Scrims: Tuned to keep the anime character vividly highlighted while giving crisp text contrast */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a12] via-[#0a0a12]/35 via-25% to-transparent pointer-events-none" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a12]/90 via-[#0a0a12]/40 via-50% to-transparent pointer-events-none" />
          </div>
        );
      })}

      {/* Top Subtle Scrim */}
      <div className="absolute top-0 left-0 right-0 h-10 bg-gradient-to-b from-[#0a0a12]/40 to-transparent pointer-events-none z-[1]" />

      {/* Slide Content */}
      <div className="absolute inset-0 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col justify-end pb-5 sm:pb-8 md:pb-10 z-10">
        <div className="max-w-2xl space-y-2 sm:space-y-3">
          {/* Badges Row */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="bg-[#0d1630]/90 text-cyan-300 text-[9px] sm:text-[10px] md:text-xs font-bold px-2 py-0.5 sm:py-1 rounded-lg uppercase tracking-wider border border-cyan-500/40 shadow-lg flex items-center gap-1 backdrop-blur-md">
              <Sparkles size={11} className="text-cyan-400" />
              SPOTLIGHT #{current + 1}
            </span>
            <span className="bg-[#FFC857] text-black font-black text-[9px] sm:text-[10px] md:text-xs px-2 py-0.5 sm:py-1 rounded-lg flex items-center gap-1 shadow-md">
              <Star size={10} fill="black" />
              IMDb {imdbRating}
            </span>
            <span className="bg-[#0d1630]/80 border border-[#00d2ff]/60 text-[#00d2ff] font-bold text-[9px] sm:text-[10px] md:text-xs px-2 py-0.5 sm:py-1 rounded-lg shadow-sm backdrop-blur-md">
              4K ULTRA HD
            </span>
            <span className="bg-[#0d1630]/80 border border-blue-500/30 text-blue-300 text-[9px] sm:text-[10px] md:text-xs font-semibold px-2 py-0.5 sm:py-1 rounded-lg flex items-center gap-1 backdrop-blur-md hidden xs:flex">
              <Volume2 size={11} /> DOLBY ATMOS
            </span>
          </div>

          {/* Title */}
          <h1 className="text-lg xs:text-xl sm:text-2xl md:text-3xl lg:text-4xl font-black text-white leading-snug tracking-tight line-clamp-2 drop-shadow-[0_3px_12px_rgba(0,0,0,0.95)]">
            {displayTitle}
          </h1>

          {/* Metadata */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs md:text-sm text-zinc-200 font-medium drop-shadow-[0_1px_6px_rgba(0,0,0,0.8)]">
            <span className="text-white font-bold bg-[#132046]/90 px-2 py-0.5 rounded-md border border-blue-500/40 shadow-sm">
              {anime.type || "TV SERIES"}
            </span>
            <span>•</span>
            <span className="text-zinc-200">{anime.releaseDate || (anime as any).released || "2024"}</span>
            <span>•</span>
            <span className="text-cyan-400 font-bold drop-shadow">DUAL AUDIO</span>
            {anime.studio && (
              <>
                <span className="hidden sm:inline">•</span>
                <span className="text-zinc-300 hidden sm:inline">{anime.studio}</span>
              </>
            )}
          </div>

          {/* Synopsis */}
          <p className="text-zinc-200/90 max-w-xl text-[10px] sm:text-xs md:text-sm leading-relaxed line-clamp-2 drop-shadow-[0_1px_6px_rgba(0,0,0,0.8)]">
            {anime.description ||
              "Stream the latest anime releases and series in crystal clear 4K Ultra HD. Premium high-speed servers, spatial audio, and fast playback with zero ads."}
          </p>

          {/* Primary & Secondary Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 pt-0.5">
            <Link
              to={"/watch/" + anime.id}
              onMouseEnter={() => prefetchEpisodeStream(anime.id)}
              onTouchStart={() => prefetchEpisodeStream(anime.id)}
              onClick={() => {
                startTopLoading("anime_" + anime.id);
                if (anime.poster) preloadImage(anime.poster);
              }}
              className="flex items-center gap-1.5 sm:gap-2 btn-primary font-black text-xs sm:text-sm px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl transition-all duration-300 active:scale-95 cursor-pointer shadow-[0_4px_16px_rgba(0,210,255,0.4)] hover:shadow-[0_6px_22px_rgba(0,210,255,0.6)]"
            >
              <Play fill="white" size={13} />
              <span>WATCH IN 4K</span>
            </Link>
            <Link
              to={"/anime/" + anime.id}
              onMouseEnter={() => prefetchEpisodeStream(anime.id)}
              onTouchStart={() => prefetchEpisodeStream(anime.id)}
              onClick={() => {
                startTopLoading("anime_" + anime.id);
                if (anime.poster) preloadImage(anime.poster);
              }}
              className="flex items-center gap-1.5 sm:gap-2 bg-[#0d1630]/90 hover:bg-[#132046] text-zinc-100 hover:text-white font-semibold text-xs sm:text-sm px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl border border-blue-500/40 hover:border-cyan-400 transition-all duration-300 active:scale-95 cursor-pointer backdrop-blur-md shadow-md"
            >
              <Info size={13} className="text-[#00d2ff]" />
              <span>DETAILS</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Slide Indicators */}
      <div className="absolute bottom-3 sm:bottom-5 right-4 md:right-8 flex gap-1.5 sm:gap-2 z-10">
        {animes.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setCurrent(idx)}
            className={"h-1.5 sm:h-2 rounded-full transition-all duration-300 cursor-pointer " + (
              idx === current
                ? "w-5 sm:w-7 bg-gradient-to-r from-[#0066ff] to-[#00d2ff] shadow-[0_0_12px_#00d2ff]"
                : "w-1.5 sm:w-2 bg-white/30 hover:bg-white/50"
            )}
            aria-label={"Go to slide " + (idx + 1)}
          />
        ))}
      </div>
    </div>
  );
};

export default HeroBanner;
