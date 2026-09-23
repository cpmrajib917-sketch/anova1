// @ts-nocheck
import React, { useState } from 'react';
import { X, ShieldAlert, Send, CheckCircle2, Film, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface ReportBrokenModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: {
    animeId?: string;
    animeTitle?: string;
    episode?: number;
    server?: string;
  };
  onSubmitSuccess?: (message: string) => void;
}

export const ReportBrokenModal: React.FC<ReportBrokenModalProps> = ({
  isOpen,
  onClose,
  initialData,
  onSubmitSuccess
}) => {
  const [animeTitle, setAnimeTitle] = useState(initialData?.animeTitle || '');
  const [animeId, setAnimeId] = useState(initialData?.animeId || '');
  const [episodeNumber, setEpisodeNumber] = useState(initialData?.episode || 1);
  const [server, setServer] = useState(initialData?.server || 'HD-1 (Vidsrc)');
  const [problemType, setProblemType] = useState('black_screen');
  const [userMessage, setUserMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    if (initialData) {
      if (initialData.animeTitle) setAnimeTitle(initialData.animeTitle);
      if (initialData.animeId) setAnimeId(initialData.animeId);
      if (initialData.episode) setEpisodeNumber(initialData.episode);
      if (initialData.server) setServer(initialData.server);
    }
  }, [initialData]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!animeTitle.trim()) {
      toast.error('দয়া করে Anime-এর নাম দিন');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/ai-assistant/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          animeId: animeId || animeTitle.toLowerCase().replace(/[^a-z0-9]/g, '-'),
          animeTitle,
          episodeNumber: Number(episodeNumber) || 1,
          server,
          problemType,
          userMessage: userMessage.trim(),
        })
      });

      if (!response.ok) {
        throw new Error('Failed to submit report');
      }

      toast.success('Broken episode report সফলভাবে জমা নেওয়া হয়েছে!');
      if (onSubmitSuccess) {
        onSubmitSuccess(`🚨 "${animeTitle}" Episode ${episodeNumber}-এর রিপোর্ট জমা নেওয়া হয়েছে। আমাদের টিম খুব দ্রুত এটি ফিক্স করবে।`);
      }
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('রিপোর্ট জমা দিতে সমস্যা হয়েছে, অনুগ্রহ করে আবার চেষ্টা করুন।');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-md bg-[#0d1322] border border-rose-500/30 rounded-3xl p-6 shadow-2xl text-white">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white rounded-full bg-white/5 hover:bg-white/10 transition-all cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-black tracking-wide">Report Broken Video</h3>
            <p className="text-xs text-gray-400">ভিডিও বা সার্ভার সমস্যা অ্যাডমিনকে জানান</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="text-xs font-bold text-gray-300 block mb-1">Anime Name</label>
            <input
              type="text"
              value={animeTitle}
              onChange={(e) => setAnimeTitle(e.target.value)}
              placeholder="e.g. Solo Leveling, Naruto"
              required
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-rose-400 transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-300 block mb-1">Episode No.</label>
              <input
                type="number"
                min="1"
                value={episodeNumber}
                onChange={(e) => setEpisodeNumber(Number(e.target.value))}
                required
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-rose-400 transition-colors"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-300 block mb-1">Server</label>
              <select
                value={server}
                onChange={(e) => setServer(e.target.value)}
                className="w-full bg-[#11192e] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-rose-400 transition-colors"
              >
                <option value="HD-1 (Vidsrc)">HD-1 (Vidsrc)</option>
                <option value="HD-2 (Vidstream)">HD-2 (Vidstream)</option>
                <option value="HD-3 (Abyss)">HD-3 (Abyss)</option>
                <option value="HD-4 (Filemoon)">HD-4 (Filemoon)</option>
                <option value="HD-5 (Streamtape)">HD-5 (Streamtape)</option>
                <option value="Custom Stream">Custom / Hindi Stream</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-300 block mb-1">Problem Type</label>
            <select
              value={problemType}
              onChange={(e) => setProblemType(e.target.value)}
              className="w-full bg-[#11192e] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-rose-400 transition-colors"
            >
              <option value="black_screen">Black Screen / Video not loading</option>
              <option value="server_error">Server Connection Failed (403/404)</option>
              <option value="audio_sync">Audio Out of Sync / Missing Subtitles</option>
              <option value="wrong_episode">Wrong Episode Loaded</option>
              <option value="buffering">Constant Buffering / Stutter</option>
              <option value="other">Other Issue</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-300 block mb-1">Details (Optional)</label>
            <textarea
              value={userMessage}
              onChange={(e) => setUserMessage(e.target.value)}
              rows={2}
              placeholder="কী সমস্যা হচ্ছে বিস্তারিত লিখুন..."
              className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-rose-400 transition-colors resize-none"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-white/10 hover:bg-white/15 text-gray-300 text-xs font-bold py-2.5 rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-rose-600/30 cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <ShieldAlert className="w-4 h-4" />
                  Submit Report
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface AnimeRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitSuccess?: (message: string) => void;
}

export const AnimeRequestModal: React.FC<AnimeRequestModalProps> = ({
  isOpen,
  onClose,
  onSubmitSuccess
}) => {
  const [animeName, setAnimeName] = useState('');
  const [userMessage, setUserMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!animeName.trim()) {
      toast.error('দয়া করে Anime-এর নাম লিখুন');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/ai-assistant/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          animeName: animeName.trim(),
          userMessage: userMessage.trim(),
        })
      });

      if (!response.ok) {
        throw new Error('Failed to submit anime request');
      }

      toast.success('Anime Request সফলভাবে জমা দেওয়া হয়েছে!');
      if (onSubmitSuccess) {
        onSubmitSuccess(`📩 "${animeName}"-এর রিকোয়েস্ট সফলভাবে অ্যাডমিন প্যানেলে পাঠানো হয়েছে। শীঘ্রই সাইটে যুক্ত করার চেষ্টা করা হবে!`);
      }
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('রিকোয়েস্ট পাঠাতে সমস্যা হয়েছে, অনুগ্রহ করে আবার চেষ্টা করুন।');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-md bg-[#0d1322] border border-cyan-500/30 rounded-3xl p-6 shadow-2xl text-white">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white rounded-full bg-white/5 hover:bg-white/10 transition-all cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-black tracking-wide">Request an Anime</h3>
            <p className="text-xs text-gray-400">সাইটে নেই এমন কোনো Anime যুক্ত করার অনুরোধ করুন</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="text-xs font-bold text-gray-300 block mb-1">Anime Name</label>
            <input
              type="text"
              value={animeName}
              onChange={(e) => setAnimeName(e.target.value)}
              placeholder="e.g. Bleach, Wind Breaker, Sakamoto Days"
              required
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-cyan-400 transition-colors"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-300 block mb-1">Note / Season / Language (Optional)</label>
            <textarea
              value={userMessage}
              onChange={(e) => setUserMessage(e.target.value)}
              rows={3}
              placeholder="যেমন: Season 2 বা Hindi Dubbed থাকলে ভালো হয়..."
              className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-cyan-400 transition-colors resize-none"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-white/10 hover:bg-white/15 text-gray-300 text-xs font-bold py-2.5 rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black text-xs font-black py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-cyan-500/20 cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Submit Request
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
