// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { 
  Bot, Settings, BarChart3, ShieldAlert, MessageSquare, Sparkles, 
  Check, RefreshCw, Trash2, ExternalLink, AlertTriangle, CheckCircle2,
  Clock, Power, Film, Search, Filter, Save, Loader2, Send
} from 'lucide-react';
import { toast } from 'sonner';
import { AiConfig, AiAnalytics, BrokenEpisodeReport, AnimeUserRequest } from '../ai/aiTypes';
import { cn } from '../../lib/utils';

export const AiAssistantTab: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [subTab, setSubTab] = useState<'settings' | 'analytics' | 'reports' | 'requests'>('settings');

  const [config, setConfig] = useState<AiConfig>({
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
  });

  const [analytics, setAnalytics] = useState<AiAnalytics>({
    totalConversations: 0,
    totalMessages: 0,
    searchesCount: 0,
    successfulSearches: 0,
    failedSearches: 0,
    episodesCount: 0,
    recommendationsCount: 0,
    reportsCount: 0,
    requestsCount: 0,
  });

  const [reports, setReports] = useState<BrokenEpisodeReport[]>([]);
  const [requests, setRequests] = useState<AnimeUserRequest[]>([]);
  const [reportFilter, setReportFilter] = useState<string>('all');
  const [requestFilter, setRequestFilter] = useState<string>('all');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [cfgRes, anRes, repRes, reqRes] = await Promise.all([
        fetch('/api/ai-assistant/config'),
        fetch('/api/ai-assistant/analytics'),
        fetch('/api/ai-assistant/reports'),
        fetch('/api/ai-assistant/requests')
      ]);

      const [cfgData, anData, repData, reqData] = await Promise.all([
        cfgRes.json(),
        anRes.json(),
        repRes.json(),
        reqRes.json()
      ]);

      if (cfgData.success && cfgData.config) setConfig(cfgData.config);
      if (anData.success && anData.analytics) setAnalytics(anData.analytics);
      if (repData.success && repData.reports) setReports(repData.reports);
      if (reqData.success && reqData.requests) setRequests(reqData.requests);
    } catch (e) {
      console.error('Failed to load AI Admin data:', e);
      toast.error('AI প্যানেলের ডেটা লোড করতে সমস্যা হয়েছে');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/ai-assistant/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('AI সেটিংস সফলভাবে সেভ করা হয়েছে!');
      } else {
        throw new Error(data.message);
      }
    } catch (e) {
      toast.error('AI সেটিংস সেভ করতে ব্যর্থ হয়েছে');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateReportStatus = async (reportId: string, status: string) => {
    try {
      const res = await fetch(`/api/ai-assistant/reports/${reportId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (data.success) {
        setReports(prev => prev.map(r => r.id === reportId ? { ...r, status: status as any } : r));
        toast.success(`রিপোর্টের স্ট্যাটাস '${status}'-এ আপডেট হয়েছে`);
      }
    } catch (e) {
      toast.error('স্ট্যাটাস আপডেট করতে সমস্যা হয়েছে');
    }
  };

  const handleDeleteReport = async (reportId: string) => {
    if (!confirm('আপনি কি এই রিপোর্টটি মুছে ফেলতে চান?')) return;
    try {
      const res = await fetch(`/api/ai-assistant/reports/${reportId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setReports(prev => prev.filter(r => r.id !== reportId));
        toast.success('রিপোর্ট মুছে ফেলা হয়েছে');
      }
    } catch (e) {
      toast.error('রিপোর্ট মুছতে ব্যর্থ হয়েছে');
    }
  };

  const handleUpdateRequestStatus = async (requestId: string, status: string) => {
    try {
      const res = await fetch(`/api/ai-assistant/requests/${requestId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (data.success) {
        setRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: status as any } : r));
        toast.success(`রিকোয়েস্টের স্ট্যাটাস '${status}'-এ পরিবর্তন করা হয়েছে`);
      }
    } catch (e) {
      toast.error('রিকোয়েস্ট আপডেট করতে ব্যর্থ হয়েছে');
    }
  };

  const handleDeleteRequest = async (requestId: string) => {
    if (!confirm('আপনি কি এই Anime রিকোয়েস্টটি মুছতে চান?')) return;
    try {
      const res = await fetch(`/api/ai-assistant/requests/${requestId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setRequests(prev => prev.filter(r => r.id !== requestId));
        toast.success('রিকোয়েস্ট মুছে ফেলা হয়েছে');
      }
    } catch (e) {
      toast.error('রিকোয়েস্ট মুছতে সমস্যা হয়েছে');
    }
  };

  const filteredReports = reports.filter(r => {
    if (reportFilter === 'all') return true;
    return r.status.toLowerCase() === reportFilter.toLowerCase();
  });

  const filteredRequests = requests.filter(req => {
    if (requestFilter === 'all') return true;
    return req.status.toLowerCase() === requestFilter.toLowerCase();
  });

  return (
    <div className="space-y-6 text-gray-200">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#0a0e1a]/40 border border-cyan-500/20 p-6 rounded-3xl backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-2xl shadow-lg shadow-cyan-500/20 text-white">
            {config.avatar || '🤖'}
          </div>
          <div>
            <h2 className="text-xl font-black text-white tracking-wide flex items-center gap-2">
              AI Assistant & Intelligent Automation
              <span className={cn(
                "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase",
                config.enabled ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
              )}>
                {config.enabled ? 'Active / চালু' : 'Disabled / বন্ধ'}
              </span>
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              স্মার্ট অ্যানিমে সার্চ, এপিসোড খোঁজা, অটো রিকমেন্ডেশন ও ইউজার রিপোর্ট ম্যানেজমেন্ট
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            className="px-3.5 py-2 bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-bold rounded-xl border border-white/10 flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            Refresh
          </button>
          <button
            onClick={handleSaveConfig}
            disabled={saving}
            className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black text-xs font-black rounded-xl shadow-lg shadow-cyan-500/20 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save Settings
          </button>
        </div>
      </div>

      {/* Sub Tabs Navigation */}
      <div className="flex gap-2 border-b border-white/10 pb-3 text-xs font-bold uppercase tracking-wider overflow-x-auto">
        {[
          { id: 'settings', label: 'AI Configuration & Controls', icon: Settings },
          { id: 'analytics', label: 'Usage Analytics', icon: BarChart3 },
          { id: 'reports', label: `Broken Reports (${reports.filter(r => r.status === 'Pending').length})`, icon: ShieldAlert },
          { id: 'requests', label: `Anime Requests (${requests.filter(r => r.status === 'New').length})`, icon: Film },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id as any)}
              className={cn(
                "px-4 py-2 rounded-xl flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap",
                subTab === tab.id
                  ? "bg-cyan-500 text-black font-black shadow-md shadow-cyan-500/20"
                  : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/10"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 1. SubTab: SETTINGS */}
      {subTab === 'settings' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fadeIn">
          {/* Main Controls Card */}
          <div className="bg-[#0b101d]/60 border border-white/5 rounded-3xl p-6 space-y-5">
            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Power className="w-4 h-4 text-cyan-400" />
              General Controls
            </h3>

            {/* Master Toggle */}
            <div className="flex items-center justify-between p-3.5 bg-white/5 rounded-2xl border border-white/5">
              <div>
                <span className="text-sm font-bold text-white block">AI Assistant Master Switch</span>
                <span className="text-[11px] text-gray-400">ওয়েবসাইটে ফ্লোটিং AI বাটন প্রদর্শন ও ফিচার সচল রাখুন</span>
              </div>
              <button
                onClick={() => setConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer",
                  config.enabled ? "bg-cyan-500" : "bg-gray-700"
                )}
              >
                <span className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                  config.enabled ? "translate-x-6" : "translate-x-1"
                )} />
              </button>
            </div>

            {/* Maintenance Mode */}
            <div className="flex items-center justify-between p-3.5 bg-white/5 rounded-2xl border border-white/5">
              <div>
                <span className="text-sm font-bold text-white block">AI Maintenance Mode</span>
                <span className="text-[11px] text-gray-400">ইউজারদের সাময়িক মেইনটেন্যান্স বার্তা প্রদর্শন করবে</span>
              </div>
              <button
                onClick={() => setConfig(prev => ({ ...prev, maintenanceMode: !prev.maintenanceMode }))}
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer",
                  config.maintenanceMode ? "bg-amber-500" : "bg-gray-700"
                )}
              >
                <span className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                  config.maintenanceMode ? "translate-x-6" : "translate-x-1"
                )} />
              </button>
            </div>

            {/* AI Name & Avatar */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">AI Name</label>
                <input
                  type="text"
                  value={config.name}
                  onChange={(e) => setConfig(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">AI Avatar (Emoji/Icon)</label>
                <input
                  type="text"
                  value={config.avatar}
                  onChange={(e) => setConfig(prev => ({ ...prev, avatar: e.target.value }))}
                  placeholder="🤖, ⚡, 🎬"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-400 text-center"
                />
              </div>
            </div>

            {/* Welcome Message */}
            <div>
              <label className="text-xs font-bold text-gray-300 block mb-1">Welcome Greeting Message</label>
              <textarea
                value={config.welcomeMessage}
                onChange={(e) => setConfig(prev => ({ ...prev, welcomeMessage: e.target.value }))}
                rows={4}
                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-cyan-400 resize-none"
              />
            </div>
          </div>

          {/* Feature Toggles Card */}
          <div className="bg-[#0b101d]/60 border border-white/5 rounded-3xl p-6 space-y-4">
            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              Feature Specific Controls
            </h3>

            {[
              { key: 'search', title: 'Anime Search (স্মার্ট সার্চ)', desc: 'বাংলা ও ইংরেজি বানানে Anime খোঁজা' },
              { key: 'episodes', title: 'Episode Search (পর্ব খোঁজা)', desc: 'নির্দিষ্ট এপিসোড নম্বর বা সর্বশেষ পর্ব খোঁজা' },
              { key: 'recommendations', title: 'Recommendations (সাজেস্ট)', desc: 'জনপ্রিয় ও মানানসই Anime সুপারিশ করা' },
              { key: 'siteHelp', title: 'Site Help & Troubleshooting', desc: 'ভিডিও না চলা বা সার্ভার সমস্যার সমাধান গাইড' },
              { key: 'brokenReports', title: 'Broken Video Reporting', desc: 'নষ্ট ভিডিওর জন্য ইউজারদের রিপোর্ট ফরম দেওয়া' },
              { key: 'animeRequests', title: 'Anime Request System', desc: 'নতুন অ্যানিমে সাইটে যুক্ত করার অনুরোধ গ্রহণ' },
            ].map(feat => (
              <div key={feat.key} className="flex items-center justify-between p-3 bg-white/5 rounded-2xl border border-white/5">
                <div>
                  <span className="text-xs font-bold text-white block">{feat.title}</span>
                  <span className="text-[10px] text-gray-400">{feat.desc}</span>
                </div>
                <button
                  onClick={() => setConfig(prev => ({
                    ...prev,
                    features: {
                      ...prev.features,
                      [feat.key]: !prev.features[feat.key]
                    }
                  }))}
                  className={cn(
                    "relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer",
                    config.features[feat.key] ? "bg-cyan-500" : "bg-gray-700"
                  )}
                >
                  <span className={cn(
                    "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform",
                    config.features[feat.key] ? "translate-x-4" : "translate-x-1"
                  )} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. SubTab: ANALYTICS */}
      {subTab === 'analytics' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Quick Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[#0b101d]/60 border border-white/5 p-4 rounded-2xl">
              <span className="text-[10px] text-gray-400 font-bold uppercase block">Total Conversations</span>
              <p className="text-2xl font-black text-white mt-1">{analytics.totalConversations || 0}</p>
            </div>
            <div className="bg-[#0b101d]/60 border border-white/5 p-4 rounded-2xl">
              <span className="text-[10px] text-cyan-400 font-bold uppercase block">Anime Searches</span>
              <p className="text-2xl font-black text-white mt-1">{analytics.searchesCount || 0}</p>
              <span className="text-[9px] text-emerald-400 font-semibold">{analytics.successfulSearches || 0} Successful</span>
            </div>
            <div className="bg-[#0b101d]/60 border border-white/5 p-4 rounded-2xl">
              <span className="text-[10px] text-purple-400 font-bold uppercase block">Episode Searches</span>
              <p className="text-2xl font-black text-white mt-1">{analytics.episodesCount || 0}</p>
            </div>
            <div className="bg-[#0b101d]/60 border border-white/5 p-4 rounded-2xl">
              <span className="text-[10px] text-rose-400 font-bold uppercase block">Broken Reports</span>
              <p className="text-2xl font-black text-white mt-1">{reports.length}</p>
              <span className="text-[9px] text-amber-400 font-semibold">{reports.filter(r => r.status === 'Pending').length} Pending</span>
            </div>
          </div>

          <div className="bg-[#0b101d]/60 border border-white/5 rounded-3xl p-6">
            <h3 className="text-sm font-black text-white uppercase tracking-wider mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-cyan-400" />
              Detailed Interaction Breakdown
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/5">
                <span>Recommendations Requested</span>
                <span className="font-bold text-cyan-300">{analytics.recommendationsCount || 0}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/5">
                <span>Total Messages Exchanged</span>
                <span className="font-bold text-cyan-300">{analytics.totalMessages || 0}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/5">
                <span>Pending Anime Requests</span>
                <span className="font-bold text-amber-300">{requests.filter(r => r.status === 'New').length}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/5">
                <span>Resolved Broken Video Reports</span>
                <span className="font-bold text-emerald-300">{reports.filter(r => r.status === 'Resolved').length}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. SubTab: BROKEN VIDEO REPORTS */}
      {subTab === 'reports' && (
        <div className="space-y-4 animate-fadeIn">
          {/* Filter Bar */}
          <div className="flex items-center justify-between gap-4 bg-[#0b101d]/60 border border-white/5 p-4 rounded-2xl">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 font-bold uppercase">Filter:</span>
              {['all', 'pending', 'investigating', 'resolved'].map(f => (
                <button
                  key={f}
                  onClick={() => setReportFilter(f)}
                  className={cn(
                    "text-xs px-3 py-1 rounded-xl font-bold uppercase transition-all cursor-pointer",
                    reportFilter === f
                      ? "bg-rose-500 text-white shadow-md shadow-rose-500/20"
                      : "bg-white/5 text-gray-400 hover:text-white"
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
            <span className="text-xs text-gray-400">Total: {filteredReports.length}</span>
          </div>

          {filteredReports.length === 0 ? (
            <div className="p-12 text-center bg-[#0b101d]/40 border border-white/5 rounded-3xl">
              <ShieldAlert className="w-10 h-10 text-gray-500 mx-auto mb-2 opacity-50" />
              <p className="text-sm font-bold text-gray-400">কোনো Broken Episode Report পাওয়া যায়নি</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredReports.map((report) => (
                <div key={report.id} className="bg-[#0b101d]/60 border border-white/10 rounded-2xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-white font-bold text-sm tracking-wide">{report.animeTitle}</h4>
                      <div className="flex items-center gap-2 text-[11px] text-gray-400 mt-0.5">
                        <span className="text-rose-400 font-bold">Episode {report.episodeNumber}</span>
                        <span>•</span>
                        <span>{report.server}</span>
                        <span>•</span>
                        <span className="capitalize">{report.problemType.replace(/_/g, ' ')}</span>
                      </div>
                    </div>
                    <span className={cn(
                      "text-[9px] font-black uppercase px-2 py-0.5 rounded-full border",
                      report.status === 'Resolved' && "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
                      report.status === 'Investigating' && "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
                      report.status === 'Pending' && "bg-amber-500/20 text-amber-400 border-amber-500/30"
                    )}>
                      {report.status}
                    </span>
                  </div>

                  {report.userMessage && (
                    <div className="bg-black/30 p-2.5 rounded-xl border border-white/5 text-xs text-gray-300">
                      "{report.userMessage}"
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[10px] text-gray-400">
                    <span>{new Date(report.timestamp).toLocaleString()}</span>
                    <div className="flex items-center gap-1.5">
                      <select
                        value={report.status}
                        onChange={(e) => handleUpdateReportStatus(report.id, e.target.value)}
                        className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-gray-200 focus:outline-none"
                      >
                        <option value="Pending">Pending</option>
                        <option value="Investigating">Investigating</option>
                        <option value="Resolved">Resolved</option>
                      </select>
                      <a
                        href={`/watch/${report.animeId}?ep=${report.episodeNumber}`}
                        target="_blank"
                        rel="noreferrer"
                        title="Test Playback"
                        className="p-1.5 text-gray-400 hover:text-cyan-400 hover:bg-white/5 rounded-lg"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <button
                        onClick={() => handleDeleteReport(report.id)}
                        className="p-1.5 text-gray-400 hover:text-rose-400 hover:bg-white/5 rounded-lg cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 4. SubTab: ANIME REQUESTS */}
      {subTab === 'requests' && (
        <div className="space-y-4 animate-fadeIn">
          {/* Filter Bar */}
          <div className="flex items-center justify-between gap-4 bg-[#0b101d]/60 border border-white/5 p-4 rounded-2xl">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 font-bold uppercase">Filter:</span>
              {['all', 'new', 'in progress', 'added', 'rejected'].map(f => (
                <button
                  key={f}
                  onClick={() => setRequestFilter(f)}
                  className={cn(
                    "text-xs px-3 py-1 rounded-xl font-bold uppercase transition-all cursor-pointer",
                    requestFilter === f
                      ? "bg-cyan-500 text-black font-black shadow-md shadow-cyan-500/20"
                      : "bg-white/5 text-gray-400 hover:text-white"
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
            <span className="text-xs text-gray-400">Total: {filteredRequests.length}</span>
          </div>

          {filteredRequests.length === 0 ? (
            <div className="p-12 text-center bg-[#0b101d]/40 border border-white/5 rounded-3xl">
              <Film className="w-10 h-10 text-gray-500 mx-auto mb-2 opacity-50" />
              <p className="text-sm font-bold text-gray-400">কোনো Anime Request পাওয়া যায়নি</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredRequests.map((req) => (
                <div key={req.id} className="bg-[#0b101d]/60 border border-white/10 rounded-2xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-white font-bold text-sm tracking-wide">{req.animeName}</h4>
                      <p className="text-[11px] text-gray-400 mt-0.5">User Anime Request</p>
                    </div>
                    <span className={cn(
                      "text-[9px] font-black uppercase px-2 py-0.5 rounded-full border",
                      req.status === 'Added' && "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
                      req.status === 'In Progress' && "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
                      req.status === 'Rejected' && "bg-rose-500/20 text-rose-400 border-rose-500/30",
                      req.status === 'New' && "bg-amber-500/20 text-amber-400 border-amber-500/30"
                    )}>
                      {req.status}
                    </span>
                  </div>

                  {req.userMessage && (
                    <div className="bg-black/30 p-2.5 rounded-xl border border-white/5 text-xs text-gray-300">
                      "{req.userMessage}"
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[10px] text-gray-400">
                    <span>{new Date(req.timestamp).toLocaleString()}</span>
                    <div className="flex items-center gap-1.5">
                      <select
                        value={req.status}
                        onChange={(e) => handleUpdateRequestStatus(req.id, e.target.value)}
                        className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-gray-200 focus:outline-none"
                      >
                        <option value="New">New</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Added">Added</option>
                        <option value="Rejected">Rejected</option>
                      </select>
                      <button
                        onClick={() => handleDeleteRequest(req.id)}
                        className="p-1.5 text-gray-400 hover:text-rose-400 hover:bg-white/5 rounded-lg cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
