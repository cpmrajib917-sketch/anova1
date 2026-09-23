// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Bot, MessageSquare, X, Send, Trash2, Sparkles, RefreshCw, 
  Film, AlertTriangle, ShieldAlert, ChevronDown, Check, Loader2,
  Tv, Compass, HelpCircle, ExternalLink, Minimize2, Maximize2,
  Mic, MicOff, Volume2, VolumeX, Copy, Dices, Flame, Smile, Heart, Zap,
  Globe
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { AiMessage, AiConfig, AiCard } from './aiTypes';
import { AiMessageCards } from './AiMessageCards';
import { ReportBrokenModal, AnimeRequestModal } from './AiModals';
import { COMPREHENSIVE_ANIME_CATALOG } from '../../data/animeDatabase';
import { searchCatalogSmart } from '../../lib/aiFuzzySearch';

export interface CountryLanguage {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
  locale: string;
}

export const SUPPORTED_LANGUAGES: CountryLanguage[] = [
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', flag: '🇧🇩', locale: 'bn-BD' },
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸', locale: 'en-US' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳', locale: 'hi-IN' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵', locale: 'ja-JP' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸', locale: 'es-ES' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦', locale: 'ar-SA' }
];

export const UI_TRANSLATIONS: Record<string, any> = {
  bn: {
    title: 'Anime AI',
    badge: 'SMART',
    status: 'Online • হোম অ্যাসিস্ট্যান্ট',
    tooltip: 'Anime AI • চ্যাট করতে ক্লিক করুন',
    surpriseMe: 'সারপ্রাইজ মি',
    trending: 'ট্রেন্ডিং',
    moodFilter: 'মুড ফিল্টার',
    engDub: '🇬🇧 ইংলিশ ডাব',
    hindiDub: '🇮🇳 হিন্দি ডাব',
    moodTitle: 'আজকের মুড সিলেক্ট করুন:',
    moods: [
      { label: '💥 হাইপড অ্যাকশন', query: 'সেরা কয়েকটি হাইপড অ্যাকশন অ্যানিমে সাজেস্ট করো' },
      { label: '💖 মিষ্টি রোমান্টিক', query: 'সেরা মিষ্টি রোমান্টিক অ্যানিমে সাজেস্ট করো' },
      { label: '🕵️ রহস্য ও থ্রিলার', query: 'সাসপেন্স এবং সেরা থ্রিলার অ্যানিমে সাজেস্ট করো' },
      { label: '😂 কমেডি ও ফান', query: 'হাসির এবং মজার কমেডি অ্যানিমে সাজেস্ট করো' },
      { label: '😭 ইমোশনাল গল্প', query: 'চোখের জল এনে দেওয়া ইমোশনাল ড্রামা অ্যানিমে সাজেস্ট করো' }
    ],
    placeholder: 'Anime বা পর্ব খুঁজুন...',
    listeningText: 'ভয়েস শুনছি... কথা বলুন (বাংলা বা ইংরেজি)',
    stopListening: 'বন্ধ করুন',
    generatingText: 'উত্তর তৈরি করছে...',
    listenBtn: 'শুনুন',
    stopBtn: 'থামান',
    copyBtn: 'কপি',
    copiedBtn: 'কপি হয়েছে',
    reportModalBtn: '🚨 সমস্যা রিপোর্ট',
    requestModalBtn: '📩 রিকোয়েস্ট',
    footerInfo: 'সাইটের রিয়েল ক্যাটালগ ভিত্তিক AI',
    clearChat: 'চ্যাট ইতিহাস মুছুন',
    expand: 'বড় করুন',
    minimize: 'ছোট করুন',
    close: 'বন্ধ করুন',
    changeLang: 'ভাষা নির্বাচন করুন',
    welcomeMsg: `👋 হাই! আমি তোমার Anime Assistant।
Anime বা Episode খুঁজতে, নতুন Anime সাজেস্ট করতে অথবা সাইটের কোনো সমস্যা হলে আমাকে বলো।`,
    defaultActions: [
      '🎲 সারপ্রাইজ মি',
      '🔥 আজকের ট্রেন্ডিং',
      '🇬🇧 ইংলিশ ডাব অ্যানিমে',
      '🇮🇳 হিন্দি ডাব অ্যানিমে',
      '🆘 ভিডিও সমস্যা সমাধান'
    ],
    surprisePrompt: '🎲 সারপ্রাইজ মি! যেকোনো একটি দুর্দান্ত Anime সাজেস্ট করো',
    surpriseReply: (title: string, rating: string) => `🎲 তোমার জন্য আজকের বিশেষ সারপ্রাইজ Anime: **${title}**!\nরেটিং ${rating}★। নিচে সরাসরি দেখার লিংক দেওয়া হলো:`,
    dubNotice: 'অ্যানিমের কোনো বাংলা ডাব হয় না, তবে আমাদের সাইটে অফিশিয়াল ইংলিশ ও হিন্দি ডাব রয়েছে।'
  },
  en: {
    title: 'Anime AI',
    badge: 'SMART',
    status: 'Online • Home Assistant',
    tooltip: 'Anime AI • Click to chat',
    surpriseMe: 'Surprise Me',
    trending: 'Trending',
    moodFilter: 'Mood Filter',
    engDub: '🇬🇧 English Dub',
    hindiDub: '🇮🇳 Hindi Dub',
    moodTitle: 'Select your mood for today:',
    moods: [
      { label: '💥 Hype & Action', query: 'Recommend the top high-octane action anime' },
      { label: '💖 Sweet Romance', query: 'Recommend heartwarming romance anime' },
      { label: '🕵️ Mystery & Thriller', query: 'Recommend thrilling mystery and suspense anime' },
      { label: '😂 Comedy & Fun', query: 'Recommend hilarious comedy anime' },
      { label: '😭 Emotional & Tears', query: 'Recommend deep tearjerker emotional anime' }
    ],
    placeholder: 'Search anime, episodes, or ask...',
    listeningText: 'Listening to your voice... Speak now',
    stopListening: 'Stop',
    generatingText: 'Generating answer...',
    listenBtn: 'Listen',
    stopBtn: 'Stop',
    copyBtn: 'Copy',
    copiedBtn: 'Copied!',
    reportModalBtn: '🚨 Report Issue',
    requestModalBtn: '📩 Request Anime',
    footerInfo: 'Grounded in Real Website Catalog',
    clearChat: 'Clear chat history',
    expand: 'Expand',
    minimize: 'Minimize',
    close: 'Close',
    changeLang: 'Change Language',
    welcomeMsg: `👋 Hi! I am your Anime Assistant.
Ask me to find anime, specific episodes, recommendations, or troubleshoot video playback!`,
    defaultActions: [
      '🎲 Surprise Me',
      '🔥 Trending Anime',
      '🇬🇧 English Dubbed',
      '🇮🇳 Hindi Dubbed',
      '🆘 Troubleshoot Playback'
    ],
    surprisePrompt: '🎲 Surprise Me! Recommend a brilliant anime from the catalog',
    surpriseReply: (title: string, rating: string) => `🎲 Today's special surprise anime for you: **${title}**!\nRating: ${rating}★. Direct watch link below:`,
    dubNotice: 'Note: Anime features English Dub and Hindi Dub versions on our website.'
  },
  hi: {
    title: 'Anime AI',
    badge: 'SMART',
    status: 'ऑनलाइन • होम सहायक',
    tooltip: 'Anime AI • चैट करने के लिए क्लिक करें',
    surpriseMe: 'सरप्राइज मी',
    trending: 'ट्रेंडिंग',
    moodFilter: 'मूड फिल्टर',
    engDub: '🇬🇧 इंग्लिश डब',
    hindiDub: '🇮🇳 हिन्दी डब',
    moodTitle: 'आज का अपना मूड चुनें:',
    moods: [
      { label: '💥 एक्शन और रोमांच', query: 'शानदार एक्शन एनीमे सुझाएं' },
      { label: '💖 रोमांटिक लव स्टोरी', query: 'प्यारी रोमांटिक एनीमे सुझाएं' },
      { label: '🕵️ सस्पेंस और थ्रिलर', query: 'रोमांचक सस्पेंस और थ्रिलर एनीमे सुझाएं' },
      { label: '😂 मजेदार कॉमेडी', query: 'हंसी से भरपूर मजेदार कॉमेडी एनीमे सुझाएं' },
      { label: '😭 भावुक व इमोशनल', query: 'दिल को छू लेने वाली इमोशनल एनीमे सुझाएं' }
    ],
    placeholder: 'एनीमे या एपिसोड खोजें...',
    listeningText: 'आपकी आवाज़ सुन रहे हैं... बोलिए',
    stopListening: 'रोकें',
    generatingText: 'जवाब तैयार कर रहा है...',
    listenBtn: 'सुनें',
    stopBtn: 'रोकें',
    copyBtn: 'कॉपी',
    copiedBtn: 'कॉपी हुआ!',
    reportModalBtn: '🚨 समस्या रिपोर्ट',
    requestModalBtn: '📩 रिक्वेस्ट एनीमे',
    footerInfo: 'वेबसाइट के रियल कैटलॉग आधारित AI',
    clearChat: 'चैट इतिहास साफ़ करें',
    expand: 'बड़ा करें',
    minimize: 'छोटा करें',
    close: 'बंद करें',
    changeLang: 'भाषा बदलें',
    welcomeMsg: `👋 नमस्ते! मैं आपका Anime Assistant हूँ।
एनीमे या एपिसोड खोजने, सिफारिशें प्राप्त करने या वीडियो समस्या के लिए मुझसे पूछें!`,
    defaultActions: [
      '🎲 सरप्राइज मी',
      '🔥 ट्रेंडिंग एनीमे',
      '🇬🇧 इंग्लिश डब एनीमे',
      '🇮🇳 हिन्दी डब एनीमे',
      '🆘 वीडियो समस्या हल'
    ],
    surprisePrompt: '🎲 सरप्राइज मी! मुझे कोई बेहतरीन एनीमे सुझाएं',
    surpriseReply: (title: string, rating: string) => `🎲 आज आपके लिए खास सरप्राइज एनीमे: **${title}**!\nरेटिंग ${rating}★। नीचे डायरेक्ट प्लेबैक लिंक उपलब्ध है:`,
    dubNotice: 'एनीमे में इंग्लिश और हिन्दी डब उपलब्ध है।'
  },
  ja: {
    title: 'Anime AI',
    badge: 'SMART',
    status: 'オンライン • アシスタント',
    tooltip: 'Anime AI • クリックしてチャット',
    surpriseMe: 'サプライズ',
    trending: 'トレンド',
    moodFilter: '気分フィルター',
    engDub: '🇬🇧 英語吹替',
    hindiDub: '🇮🇳 ヒンディー吹替',
    moodTitle: '本日の気分を選択してください:',
    moods: [
      { label: '💥 熱血＆アクション', query: 'おすすめの熱血アクションアニメを教えて' },
      { label: '💖 胸キュンロマンス', query: '心温まるロマンスアニメをおすすめして' },
      { label: '🕵️ サスペンス＆謎解き', query: 'スリリングなミステリーアニメを教えて' },
      { label: '😂 爆笑コメディ', query: '面白いコメディアニメを教えて' },
      { label: '😭 感動＆涙のドラマ', query: '涙腺崩壊の感動アニメを教えて' }
    ],
    placeholder: 'アニメやエピソードを検索...',
    listeningText: '音声を聞き取っています...どうぞ',
    stopListening: '停止',
    generatingText: '回答を作成中...',
    listenBtn: '再生',
    stopBtn: '停止',
    copyBtn: 'コピー',
    copiedBtn: 'コピー済み!',
    reportModalBtn: '🚨 問題を報告',
    requestModalBtn: '📩 リクエスト',
    footerInfo: 'サイト公式カタログ連動AI',
    clearChat: 'チャット履歴を消去',
    expand: '拡大',
    minimize: '縮小',
    close: '閉じる',
    changeLang: '言語を選択',
    welcomeMsg: `👋 こんにちは！アニメアシスタントです。
アニメ検索、エピソード検索、おすすめ紹介、再生トラブルの解決など何でもお気軽にどうぞ！`,
    defaultActions: [
      '🎲 サプライズ',
      '🔥 トレンドアニメ',
      '🇬🇧 英語吹替アニメ',
      '🇮🇳 ヒンディー吹替',
      '🆘 再生トラブル解決'
    ],
    surprisePrompt: '🎲 サプライズ！おすすめの素晴らしいアニメを1つ教えて',
    surpriseReply: (title: string, rating: string) => `🎲 本日のサプライズアニメ：**${title}**！\n評価：${rating}★。以下から今すぐ視聴できます：`,
    dubNotice: '当サイトのアニメは英語およびヒンディー語の吹替版に対応しています。'
  },
  es: {
    title: 'Anime AI',
    badge: 'SMART',
    status: 'En línea • Asistente',
    tooltip: 'Anime AI • Clic para chatear',
    surpriseMe: 'Sorpréndeme',
    trending: 'Tendencias',
    moodFilter: 'Filtro de Estado',
    engDub: '🇬🇧 Doblaje Inglés',
    hindiDub: '🇮🇳 Doblaje Hindi',
    moodTitle: 'Elige tu estado de ánimo:',
    moods: [
      { label: '💥 Acción y Batallas', query: 'Recomienda los mejores animes de acción emocionante' },
      { label: '💖 Romance Agradable', query: 'Recomienda animes de romance conmovedores' },
      { label: '🕵️ Misterio y Suspenso', query: 'Recomienda animes de misterio y suspenso' },
      { label: '😂 Comedia Divertida', query: 'Recomienda animes cómicos muy divertidos' },
      { label: '😭 Drama y Lágrimas', query: 'Recomienda animes emotivos y sentimentales' }
    ],
    placeholder: 'Buscar anime, episodios o preguntar...',
    listeningText: 'Escuchando tu voz... Habla ahora',
    stopListening: 'Detener',
    generatingText: 'Generando respuesta...',
    listenBtn: 'Escuchar',
    stopBtn: 'Parar',
    copyBtn: 'Copiar',
    copiedBtn: '¡Copiado!',
    reportModalBtn: '🚨 Reportar problema',
    requestModalBtn: '📩 Solicitar Anime',
    footerInfo: 'Basado en el catálogo real del sitio',
    clearChat: 'Borrar historial',
    expand: 'Expandir',
    minimize: 'Minimizar',
    close: 'Cerrar',
    changeLang: 'Cambiar idioma',
    welcomeMsg: `👋 ¡Hola! Soy tu asistente de Anime.
¡Pídeme buscar animes, episodios específicos, recomendaciones o solucionar problemas de video!`,
    defaultActions: [
      '🎲 Sorpréndeme',
      '🔥 Animes en Tendencia',
      '🇬🇧 Doblaje en Inglés',
      '🇮🇳 Doblaje en Hindi',
      '🆘 Solucionar problemas'
    ],
    surprisePrompt: '🎲 ¡Sorpréndeme! Recomienda un anime fantástico del catálogo',
    surpriseReply: (title: string, rating: string) => `🎲 Tu anime sorpresa de hoy: **${title}**!\nCalificación: ${rating}★. Enlace para ver a continuación:`,
    dubNotice: 'El anime cuenta con doblaje en inglés y en hindi en nuestro sitio web.'
  },
  ar: {
    title: 'أنمي AI',
    badge: 'SMART',
    status: 'متصل • المساعد المنزلي',
    tooltip: 'Anime AI • انقر للدردشة',
    surpriseMe: 'فاجئني',
    trending: 'الأكثر رواجاً',
    moodFilter: 'فلتر المزاج',
    engDub: '🇬🇧 دبلجة إنجليزية',
    hindiDub: '🇮🇳 دبلجة هندية',
    moodTitle: 'اختر حالتك المزاجية اليوم:',
    moods: [
      { label: '💥 أكشن وحماس', query: 'اقترح أفضل أنميات الأكشن الحماسية' },
      { label: '💖 رومانسية هادئة', query: 'اقترح أنميات رومانسية جميلة' },
      { label: '🕵️ غموض وإثارة', query: 'اقترح أفضل أنميات الغموض والتشويق' },
      { label: '😂 كوميديا ومرح', query: 'اقترح أنميات كوميدية مضحكة' },
      { label: '😭 دراما مؤثرة', query: 'اقترح أنميات مؤثرة ومبكية' }
    ],
    placeholder: 'ابحث عن أنمي أو حلقة...',
    listeningText: 'أستمع لصوتك الآن... تحدث',
    stopListening: 'إيقاف',
    generatingText: 'جارٍ تجهيز الرد...',
    listenBtn: 'استمع',
    stopBtn: 'إيقاف',
    copyBtn: 'نسخ',
    copiedBtn: 'تم النسخ!',
    reportModalBtn: '🚨 إبلاغ عن مشكلة',
    requestModalBtn: '📩 طلب أنمي',
    footerInfo: 'مدعوم بالكتالوج الحقيقي للموقع',
    clearChat: 'مسح سجل المحادثة',
    expand: 'تكبير',
    minimize: 'تصغير',
    close: 'إغلاق',
    changeLang: 'تغيير اللغة',
    welcomeMsg: `👋 مرحباً! أنا مساعد الأنمي الذكي الخاص بك.
اطلب مني البحث عن أي أنمي، حلقات معينة، اقتراحات مميزة، أو حل مشاكل تشغيل الفيديو!`,
    defaultActions: [
      '🎲 فاجئني',
      '🔥 الأنميات الأكثر رواجاً',
      '🇬🇧 مدبلج بالإنجليزية',
      '🇮🇳 مدبلج بالهندية',
      '🆘 حل مشاكل التشغيل'
    ],
    surprisePrompt: '🎲 فاجئني! اقترح علي أنمي رائع من الكتالوج',
    surpriseReply: (title: string, rating: string) => `🎲 أنمي المفاجأة الخاص بك اليوم: **${title}**!\nالتقييم: ${rating}★. رابط المشاهدة المباشر بالأسفل:`,
    dubNotice: 'تتوفر الأنميات على الموقع بالدبلجة الإنجليزية والدبلجة الهندية.'
  }
};

export const AiAssistant: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // STRICT REQUIREMENT: Only visible on Home page ('/' or '/home').
  // When user clicks on any anime (/anime/:id) or starts playing (/watch/:id) or any other page, do NOT show.
  const isHomePage = location.pathname === '/' || location.pathname === '/home';

  // Language state (Persisted in localStorage)
  const [selectedLang, setSelectedLang] = useState<string>(() => {
    return localStorage.getItem('anova_ai_lang') || 'bn';
  });
  const [showLangMenu, setShowLangMenu] = useState(false);

  const currentT = UI_TRANSLATIONS[selectedLang] || UI_TRANSLATIONS.bn;
  const currentLangObj = SUPPORTED_LANGUAGES.find(l => l.code === selectedLang) || SUPPORTED_LANGUAGES[0];

  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showMoodPills, setShowMoodPills] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const langMenuRef = useRef<HTMLDivElement>(null);

  // Close when navigating away from home
  useEffect(() => {
    if (!isHomePage && isOpen) {
      setIsOpen(false);
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    }
  }, [isHomePage, isOpen]);

  // Click outside to close language menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setShowLangMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [messages, setMessages] = useState<AiMessage[]>(() => {
    try {
      const saved = sessionStorage.getItem(`anova_ai_chat_${selectedLang}`);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      // ignore
    }
    const t = UI_TRANSLATIONS[selectedLang] || UI_TRANSLATIONS.bn;
    return [
      {
        id: 'welcome-1',
        sender: 'assistant',
        text: t.welcomeMsg,
        timestamp: Date.now(),
        quickActions: t.defaultActions
      }
    ];
  });

  const [aiConfig, setAiConfig] = useState<AiConfig>({
    enabled: true,
    maintenanceMode: false,
    name: 'Anime AI',
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

  // Modals state
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [reportModalData, setReportModalData] = useState<any>(null);

  // Save messages to sessionStorage per language
  useEffect(() => {
    try {
      sessionStorage.setItem(`anova_ai_chat_${selectedLang}`, JSON.stringify(messages));
    } catch (e) {
      // ignore
    }
    scrollToBottom();
  }, [messages, selectedLang]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        scrollToBottom();
      }, 100);
    } else {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      setShowLangMenu(false);
    }
  }, [isOpen]);

  // Handle switching language
  const handleSelectLanguage = (newLangCode: string) => {
    setSelectedLang(newLangCode);
    localStorage.setItem('anova_ai_lang', newLangCode);
    setShowLangMenu(false);
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
    }

    const newT = UI_TRANSLATIONS[newLangCode] || UI_TRANSLATIONS.bn;
    const switchedLangObj = SUPPORTED_LANGUAGES.find(l => l.code === newLangCode) || SUPPORTED_LANGUAGES[0];

    const welcomeMsg: AiMessage = {
      id: `lang-${Date.now()}`,
      sender: 'assistant',
      text: `${switchedLangObj.flag} ${newT.welcomeMsg}`,
      timestamp: Date.now(),
      quickActions: newT.defaultActions
    };
    setMessages([welcomeMsg]);
  };

  const handleClearChat = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
    }
    const welcomeMsg: AiMessage = {
      id: `welcome-${Date.now()}`,
      sender: 'assistant',
      text: currentT.welcomeMsg,
      timestamp: Date.now(),
      quickActions: currentT.defaultActions
    };
    setMessages([welcomeMsg]);
  };

  // Voice Speech-to-Text Handler (Using active country locale)
  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser. Please type your message.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = currentLangObj.locale;
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setInputMessage(transcript);
          handleSendMessage(transcript);
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn('Speech recognition error:', err);
      setIsListening(false);
    }
  };

  // Text-to-Speech (Listen in chosen language)
  const handleSpeak = (msgId: string, text: string) => {
    if (!('speechSynthesis' in window)) return;

    if (speakingMsgId === msgId) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
      return;
    }

    window.speechSynthesis.cancel();
    const cleanText = text.replace(/[*#_~`]/g, '').trim();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = currentLangObj.locale;
    utterance.rate = 1.0;
    utterance.onend = () => setSpeakingMsgId(null);
    utterance.onerror = () => setSpeakingMsgId(null);
    setSpeakingMsgId(msgId);
    window.speechSynthesis.speak(utterance);
  };

  // Copy Message Text
  const handleCopy = (msgId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  // Surprise Me / Random Anime
  const handleSurpriseMe = () => {
    const highRated = COMPREHENSIVE_ANIME_CATALOG.filter(a => parseFloat(String(a.rating || '0')) >= 8.2);
    const pool = highRated.length > 0 ? highRated : COMPREHENSIVE_ANIME_CATALOG;
    const randomItem = pool[Math.floor(Math.random() * pool.length)];

    const userMsg: AiMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: currentT.surprisePrompt,
      timestamp: Date.now()
    };

    const surpriseCard: AiCard = {
      type: 'anime',
      data: {
        id: randomItem.id,
        title: randomItem.title,
        poster: randomItem.poster,
        year: randomItem.year,
        genres: randomItem.genres,
        status: randomItem.status,
        episodes: randomItem.episodes,
        dubAvailable: randomItem.dubAvailable,
        subAvailable: randomItem.subAvailable,
        hindiAvailable: randomItem.hindiAvailable,
        description: randomItem.description,
        rating: randomItem.rating,
        matchReason: `🎲 ${currentT.surpriseMe}`
      }
    };

    const assistantMsg: AiMessage = {
      id: `ai-${Date.now() + 1}`,
      sender: 'assistant',
      text: currentT.surpriseReply(randomItem.title, randomItem.rating || '8.5'),
      timestamp: Date.now() + 1,
      cards: [surpriseCard],
      quickActions: [currentT.defaultActions[0], currentT.defaultActions[1]]
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text) return;

    if (!textToSend) {
      setInputMessage('');
    }

    setShowMoodPills(false);

    // 1. Add user message
    const userMsg: AiMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: Date.now(),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setIsTyping(true);

    try {
      // 2. Send to backend AI Assistant endpoint with selected language
      const response = await fetch('/api/ai-assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: newMessages.slice(-8).map(m => ({
            role: m.sender === 'user' ? 'user' : 'model',
            text: m.text
          })),
          activeContext: null,
          config: aiConfig,
          language: selectedLang
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();

      if (data && data.success) {
        const assistantMsg: AiMessage = {
          id: `ai-${Date.now()}`,
          sender: 'assistant',
          text: data.reply || (selectedLang === 'en' ? 'Here are the results I found for you:' : 'আমি তোমার অনুসন্ধানের ফলাফল খুঁজে পেয়েছি:'),
          timestamp: Date.now(),
          cards: data.cards || [],
          quickActions: data.quickActions || []
        };
        setMessages(prev => [...prev, assistantMsg]);
      } else {
        throw new Error(data.message || 'AI service unavailable');
      }
    } catch (err) {
      console.log('[AI Assistant] Seamlessly responding via client engine:', err);
      handleClientSmartFallback(text);
    } finally {
      setIsTyping(false);
    }
  };

  // Client-side fallback if network drops
  const handleClientSmartFallback = (query: string) => {
    const lower = query.toLowerCase();

    // Check if troubleshooting problem
    if (lower.includes('problem') || lower.includes('চলছে না') || lower.includes('কাজ করছে না') || lower.includes('server') || lower.includes('play') || lower.includes('error') || lower.includes('ভিডিও') || lower.includes('সমস্যা')) {
      const assistantMsg: AiMessage = {
        id: `ai-${Date.now()}`,
        sender: 'assistant',
        text: selectedLang === 'en' 
          ? 'Here are the solutions for video and server playback issues:' 
          : 'ভিডিও বা প্লেব্যাক সংক্রান্ত সমস্যার জন্য নিচের সমাধানগুলো দেখুন:',
        timestamp: Date.now(),
        cards: [
          {
            type: 'troubleshoot',
            data: {
              issueType: 'playback',
              title: selectedLang === 'en' ? 'Video Playback Guide' : 'ভিডিও প্লেব্যাক সমাধান',
              description: selectedLang === 'en' ? 'Quick troubleshooting steps to fix buffering or black screens:' : 'ব্রাউজার ক্যাশ বা সার্ভার ট্রাফিকের কারণে সমস্যা হতে পারে। নিচের ধাপগুলো অনুসরণ করুন:',
              steps: [
                selectedLang === 'en' ? 'Switch between HD-1 (Vidsrc), HD-2 (Vidstream), or HD-3 (Abyss).' : 'HD-1 সার্ভার কাজ না করলে HD-2 (Vidstream) বা HD-3 (Abyss) সার্ভারে সুইচ করুন।',
                selectedLang === 'en' ? 'Refresh the web page (F5).' : 'ব্রাউজার পেজটি একবার Refresh (F5) দিন।',
                selectedLang === 'en' ? 'Temporarily pause any AdBlocker extensions.' : 'AdBlocker বা কোনো থার্ড পার্টি এক্সটেনশন সাময়িকভাবে বন্ধ করে দেখুন।'
              ],
              suggestedServer: 'HD-2 (Vidstream)',
              canReport: true
            }
          }
        ],
        quickActions: ['🚨 Report Problem', 'HD-2 Server']
      };
      setMessages(prev => [...prev, assistantMsg]);
      return;
    }

    // Check English / Hindi Dub (Strict rule: No Bangla Dub, Anime has English and Hindi Dubs)
    if (lower.includes('dub') || lower.includes('ডাব') || lower.includes('hindi') || lower.includes('হিন্দি') || lower.includes('english') || lower.includes('ইংলিশ') || lower.includes('ইংরেজি') || lower.includes('डब')) {
      const isHindi = lower.includes('hindi') || lower.includes('হিন্দি') || lower.includes('हिन्दी');
      const filtered = COMPREHENSIVE_ANIME_CATALOG.filter(a => isHindi ? a.hindiAvailable : a.dubAvailable).slice(0, 3);

      if (filtered.length > 0) {
        const cards: AiCard[] = filtered.map(a => ({ type: 'anime', data: a }));
        const assistantMsg: AiMessage = {
          id: `ai-${Date.now()}`,
          sender: 'assistant',
          text: isHindi 
            ? (selectedLang === 'en' ? 'Here are the top anime available with Hindi Dub:' : selectedLang === 'hi' ? 'यहाँ हिन्दी डब में उपलब्ध टॉप एनीमे हैं:' : 'এখানে হিন্দি ডাবে (Hindi Dub) উপলব্ধ শীর্ষ Anime গুলো রয়েছে:')
            : (selectedLang === 'en' ? 'Here are the top anime available with English Dub (Anime features English & Hindi Dubs):' : selectedLang === 'hi' ? 'यहाँ इंग्लिश डब में उपलब्ध टॉप एनीमे हैं:' : 'এখানে ইংলিশ ডাবে (English Dub) উপলব্ধ শীর্ষ Anime গুলো রয়েছে (অ্যানিমের কোনো বাংলা ডাব হয় না, ইংলিশ ও হিন্দি ডাব রয়েছে):'),
          timestamp: Date.now(),
          cards,
          quickActions: [currentT.defaultActions[0], currentT.defaultActions[1]]
        };
        setMessages(prev => [...prev, assistantMsg]);
        return;
      }
    }

    // Check if Anime Request
    if (lower.includes('request') || lower.includes('রিকোয়েস্ট') || lower.includes('add করেন') || lower.includes('সাইটে নেই') || lower.includes('अनुरोध')) {
      const assistantMsg: AiMessage = {
        id: `ai-${Date.now()}`,
        sender: 'assistant',
        text: selectedLang === 'en' 
          ? 'Sure! You can submit an Anime Request to add a new title to the catalog:' 
          : 'অবশ্যই! তুমি সাইটে নতুন কোনো Anime যুক্ত করার জন্য Anime Request ফর্ম পাঠাতে পারো:',
        timestamp: Date.now(),
        quickActions: [currentT.requestModalBtn]
      };
      setMessages(prev => [...prev, assistantMsg]);
      setIsRequestModalOpen(true);
      return;
    }

    // Smart Catalog Search
    const searchResults = searchCatalogSmart(COMPREHENSIVE_ANIME_CATALOG, query, { limit: 3 });

    if (searchResults.length > 0) {
      const cards: AiCard[] = searchResults.map(res => ({
        type: 'anime',
        data: {
          id: res.anime.id,
          title: res.anime.title,
          poster: res.anime.poster,
          year: res.anime.year,
          genres: res.anime.genres,
          status: res.anime.status,
          episodes: res.anime.episodes,
          dubAvailable: res.anime.dubAvailable,
          subAvailable: res.anime.subAvailable,
          hindiAvailable: res.anime.hindiAvailable,
          description: res.anime.description,
          rating: res.anime.rating,
          matchReason: res.matchReason
        }
      }));

      const assistantMsg: AiMessage = {
        id: `ai-${Date.now()}`,
        sender: 'assistant',
        text: selectedLang === 'en' 
          ? `Here are the anime matches found for your search:` 
          : `তোমার খোঁজার ভিত্তিতে এই Anime গুলো পাওয়া গেছে:`,
        timestamp: Date.now(),
        cards,
        quickActions: [currentT.defaultActions[0], currentT.defaultActions[1]]
      };
      setMessages(prev => [...prev, assistantMsg]);
    } else {
      const assistantMsg: AiMessage = {
        id: `ai-${Date.now()}`,
        sender: 'assistant',
        text: selectedLang === 'en' 
          ? `I could not find "${query}" in our catalog. Try another spelling or submit an Anime Request.` 
          : `আমি তোমার সাইটে "${query}" সম্পর্কিত কোনো Anime খুঁজে পাইনি। নামটি অন্য বানানে লিখে দেখতে পারো অথবা নতুন রিকোয়েস্ট পাঠাতে পারো।`,
        timestamp: Date.now(),
        quickActions: [currentT.requestModalBtn, currentT.defaultActions[0]]
      };
      setMessages(prev => [...prev, assistantMsg]);
    }
  };

  const handleQuickAction = (action: string) => {
    if (action.includes('সারপ্রাইজ') || action.includes('Surprise') || action.includes('सरप्राइज') || action.includes('サプライズ') || action.includes('Sorpréndeme') || action.includes('فاجئني')) {
      handleSurpriseMe();
      return;
    }
    if (action.includes('ট্রেন্ডিং') || action.includes('Trending') || action.includes('トレンド') || action.includes('Tendencia') || action.includes('الأكثر رواجاً')) {
      handleSendMessage(selectedLang === 'en' ? 'Show the top trending anime on the website' : 'সাইটের শীর্ষ ট্রেন্ডিং অ্যানিমেগুলো দেখাও');
      return;
    }
    if (action.includes('English Dub') || action.includes('ইংলিশ ডাব') || action.includes('इंग्लिश डब') || action.includes('英語吹替') || action.includes('Doblaje Inglés') || action.includes('دبلجة إنجليزية')) {
      handleSendMessage(selectedLang === 'en' ? 'Show top English Dubbed anime' : 'ইংলিশ ডাবড (English Dub) অ্যানিমেগুলো দেখাও');
      return;
    }
    if (action.includes('Hindi Dub') || action.includes('হিন্দি ডাব') || action.includes('हिन्दी डब') || action.includes('ヒンディー吹替') || action.includes('Doblaje Hindi') || action.includes('دبلجة هندية')) {
      handleSendMessage(selectedLang === 'en' ? 'Show top Hindi Dubbed anime' : 'হিন্দি ডাবড (Hindi Dub) অ্যানিমেগুলো দেখাও');
      return;
    }
    if (action.includes('Request') || action.includes('রিকোয়েস্ট') || action.includes('अनुरोध') || action.includes('リクエスト') || action.includes('طلب')) {
      setIsRequestModalOpen(true);
      return;
    }
    if (action.includes('সমস্যা') || action.includes('Troubleshoot') || action.includes('Problem') || action.includes('समस्या') || action.includes('مشاكل')) {
      handleSendMessage(selectedLang === 'en' ? 'Video is not playing, what is the fix?' : 'সাইটে ভিডিও প্লে হচ্ছে না, সমাধান কী?');
      return;
    }
    handleSendMessage(action);
  };

  // STRICT REQUIREMENT: Only render on Home page ('/' or '/home')
  if (!isHomePage || aiConfig.enabled === false) {
    return null;
  }

  return (
    <>
      {/* 1. COMPACT CIRCULAR LAUNCHER BUTTON (আকার গোল ও ছোট, কোণায় ডকড, মাঝখানে নয়) */}
      <div className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-40 select-none">
        {!isOpen && (
          <div className="relative group">
            {/* Tooltip on hover (left side, never covers the center) */}
            <div className="absolute right-14 top-1/2 -translate-y-1/2 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-200 bg-[#0c1222]/90 backdrop-blur-md text-white text-[11px] font-semibold px-2.5 py-1 rounded-full border border-cyan-500/30 shadow-xl whitespace-nowrap flex items-center gap-1.5">
              <span>{currentT.tooltip}</span>
              <Sparkles className="w-3 h-3 text-cyan-400" />
            </div>

            <button
              onClick={() => setIsOpen(true)}
              className="relative w-12 h-12 sm:w-13 sm:h-13 rounded-full flex items-center justify-center bg-gradient-to-tr from-cyan-400 via-indigo-500 to-purple-600 p-[2px] shadow-lg shadow-cyan-500/25 hover:shadow-cyan-400/50 hover:scale-110 active:scale-95 transition-all duration-300 cursor-pointer"
              aria-label="Open Anime AI Assistant"
            >
              {/* Inner dark glass circle */}
              <div className="w-full h-full rounded-full bg-[#0a0f1d] flex items-center justify-center relative overflow-hidden group-hover:bg-[#0e1629] transition-colors">
                <span className="text-xl select-none group-hover:scale-110 transition-transform">
                  {aiConfig.avatar || '🤖'}
                </span>
                
                {/* Active online green dot with country flag micro badge */}
                <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-[#0a0f1d] shadow-sm"></span>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* 2. CHAT PANEL (Responsive Drawer docked at Bottom-Right, not center) */}
      {isOpen && (
        <div 
          className={cn(
            "fixed z-50 flex flex-col bg-[#0a0f1d]/95 border border-cyan-500/30 shadow-2xl shadow-black/80 backdrop-blur-2xl transition-all duration-300 overflow-hidden",
            "bottom-5 right-4 sm:right-6 w-[calc(100vw-32px)] sm:w-[400px] rounded-3xl",
            isMinimized ? "h-[58px]" : "h-[550px] sm:h-[590px] max-h-[82vh]"
          )}
        >
          {/* Panel Header */}
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-gradient-to-r from-[#11192e] to-[#0c1221] border-b border-white/10 select-none">
            <div className="flex items-center gap-2">
              <div className="relative w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-base shadow-md shadow-cyan-500/20 border border-white/10">
                {aiConfig.avatar || '🤖'}
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 border-2 border-[#0a0f1d] rounded-full"></span>
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-white font-black text-xs sm:text-sm tracking-wide">
                    {currentT.title}
                  </h3>
                  <span className="text-[8px] font-bold bg-cyan-500/20 text-cyan-300 px-1 py-0.2 rounded border border-cyan-500/30 uppercase">
                    {currentT.badge}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[9px] text-emerald-400 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>{currentT.status}</span>
                </div>
              </div>
            </div>

            {/* Header Action Controls (Language Selector + Clear + Min + Close) */}
            <div className="flex items-center gap-1">
              {/* Language Switcher Dropdown */}
              <div className="relative" ref={langMenuRef}>
                <button
                  onClick={() => setShowLangMenu(!showLangMenu)}
                  title={currentT.changeLang}
                  className="flex items-center gap-1 px-2 py-1 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-white border border-white/10 transition-colors cursor-pointer"
                >
                  <Globe className="w-3 h-3 text-cyan-400" />
                  <span className="text-[10px] font-bold">{currentLangObj.flag} {currentLangObj.code.toUpperCase()}</span>
                  <ChevronDown className="w-2.5 h-2.5 text-gray-400" />
                </button>

                {showLangMenu && (
                  <div className="absolute top-full right-0 mt-1.5 w-44 bg-[#0d1424] border border-cyan-500/30 rounded-2xl shadow-2xl p-1 z-50 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-2.5 py-1 text-[9px] font-bold text-gray-400 uppercase tracking-wider border-b border-white/5 mb-1">
                      {currentT.changeLang}
                    </div>
                    {SUPPORTED_LANGUAGES.map(langItem => (
                      <button
                        key={langItem.code}
                        onClick={() => handleSelectLanguage(langItem.code)}
                        className={cn(
                          "w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition-colors cursor-pointer text-left",
                          selectedLang === langItem.code 
                            ? "bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30" 
                            : "text-gray-300 hover:bg-white/5 hover:text-white"
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <span className="text-sm">{langItem.flag}</span>
                          <span>{langItem.nativeName}</span>
                        </span>
                        {selectedLang === langItem.code && <Check className="w-3 h-3 text-cyan-400" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={handleClearChat}
                title={currentT.clearChat}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setIsMinimized(!isMinimized)}
                title={isMinimized ? currentT.expand : currentT.minimize}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
              >
                {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title={currentT.close}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {/* Smart Quick Navigation Bar (With English Dub & Hindi Dub, No Bangla Dub) */}
              <div className="px-3 py-2 bg-[#0d1424] border-b border-white/5 flex items-center gap-1.5 overflow-x-auto custom-scrollbar no-scrollbar text-[11px]">
                <button
                  onClick={handleSurpriseMe}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 hover:from-purple-500/30 hover:to-pink-500/30 border border-purple-500/30 text-purple-300 font-semibold whitespace-nowrap cursor-pointer transition-all active:scale-95"
                >
                  <Dices className="w-3 h-3 text-pink-400" />
                  <span>{currentT.surpriseMe}</span>
                </button>
                <button
                  onClick={() => handleSendMessage(selectedLang === 'en' ? 'Show trending anime' : 'আজকের শীর্ষ ট্রেন্ডিং অ্যানিমেগুলো দেখাও')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-300 font-semibold whitespace-nowrap cursor-pointer transition-all active:scale-95"
                >
                  <Flame className="w-3 h-3 text-amber-400" />
                  <span>{currentT.trending}</span>
                </button>
                <button
                  onClick={() => setShowMoodPills(!showMoodPills)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 text-cyan-300 font-semibold whitespace-nowrap cursor-pointer transition-all active:scale-95"
                >
                  <Smile className="w-3 h-3 text-cyan-400" />
                  <span>{currentT.moodFilter}</span>
                </button>
                {/* DUB BUTTONS: English Dub & Hindi Dub (No Bangla Dub) */}
                <button
                  onClick={() => handleSendMessage(selectedLang === 'en' ? 'Show top English Dubbed anime' : 'ইংলিশ ডাব (English Dub) অ্যানিমেগুলো দেখাও')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-300 font-semibold whitespace-nowrap cursor-pointer transition-all active:scale-95"
                >
                  <span>{currentT.engDub}</span>
                </button>
                <button
                  onClick={() => handleSendMessage(selectedLang === 'en' ? 'Show top Hindi Dubbed anime' : 'হিন্দি ডাব (Hindi Dub) অ্যানিমেগুলো দেখাও')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 font-semibold whitespace-nowrap cursor-pointer transition-all active:scale-95"
                >
                  <span>{currentT.hindiDub}</span>
                </button>
              </div>

              {/* Mood Selector Dropdown if toggled */}
              {showMoodPills && (
                <div className="px-3 py-2 bg-[#10182b] border-b border-white/10 flex flex-wrap gap-1.5 animate-in fade-in duration-200">
                  <span className="w-full text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">
                    {currentT.moodTitle}
                  </span>
                  {currentT.moods.map((m: any, idx: number) => (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(m.query)}
                      className="text-[10px] bg-white/5 hover:bg-cyan-500/20 hover:text-cyan-300 text-gray-300 border border-white/10 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Message List */}
              <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 custom-scrollbar text-xs">
                {messages.map((msg) => {
                  const isUser = msg.sender === 'user';
                  const isSpeakingThis = speakingMsgId === msg.id;
                  const isCopiedThis = copiedMsgId === msg.id;

                  return (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex flex-col animate-fadeIn group",
                        isUser ? "items-end" : "items-start"
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs shadow-md leading-relaxed whitespace-pre-wrap relative",
                          isUser
                            ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-medium rounded-br-none"
                            : "bg-[#141b2c] border border-white/10 text-gray-200 rounded-bl-none"
                        )}
                      >
                        {msg.text}

                        {/* Assistant message utility buttons (Listen & Copy) */}
                        {!isUser && (
                          <div className="flex items-center gap-1.5 mt-2 pt-1 border-t border-white/5 text-gray-400">
                            <button
                              onClick={() => handleSpeak(msg.id, msg.text)}
                              title={isSpeakingThis ? currentT.stopBtn : currentT.listenBtn}
                              className={cn(
                                "p-1 rounded-md transition-colors cursor-pointer flex items-center gap-1 text-[10px]",
                                isSpeakingThis ? "text-cyan-400 bg-cyan-500/20" : "hover:text-cyan-300 hover:bg-white/5"
                              )}
                            >
                              {isSpeakingThis ? <VolumeX className="w-3 h-3 animate-pulse" /> : <Volume2 className="w-3 h-3" />}
                              <span>{isSpeakingThis ? currentT.stopBtn : currentT.listenBtn}</span>
                            </button>

                            <button
                              onClick={() => handleCopy(msg.id, msg.text)}
                              title={currentT.copyBtn}
                              className="p-1 rounded-md hover:text-cyan-300 hover:bg-white/5 transition-colors cursor-pointer flex items-center gap-1 text-[10px]"
                            >
                              {isCopiedThis ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                              <span>{isCopiedThis ? currentT.copiedBtn : currentT.copyBtn}</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Interactive Cards */}
                      {msg.cards && msg.cards.length > 0 && (
                        <div className="w-full space-y-2 mt-1">
                          {msg.cards.map((card, cIdx) => (
                            <AiMessageCards 
                              key={cIdx} 
                              card={card} 
                              onAction={handleSendMessage}
                              onOpenReport={(data) => {
                                setReportModalData(data);
                                setIsReportModalOpen(true);
                              }}
                            />
                          ))}
                        </div>
                      )}

                      {/* Quick Action Chips */}
                      {msg.quickActions && msg.quickActions.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2 max-w-full">
                          {msg.quickActions.map((action, idx) => (
                            <button
                              key={idx}
                              onClick={() => handleQuickAction(action)}
                              className="text-[11px] bg-white/5 hover:bg-cyan-500/20 hover:text-cyan-300 text-gray-300 border border-white/10 hover:border-cyan-500/40 px-2.5 py-1 rounded-full transition-all cursor-pointer font-medium active:scale-95"
                            >
                              {action}
                            </button>
                          ))}
                        </div>
                      )}

                      <span className="text-[8px] text-gray-500 mt-1 px-1">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  );
                })}

                {/* Typing Indicator */}
                {isTyping && (
                  <div className="flex items-center gap-2 text-gray-400 text-xs py-1.5 px-1 animate-pulse">
                    <div className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-[10px]">
                      {aiConfig.avatar || '🤖'}
                    </div>
                    <span>{currentT.generatingText}</span>
                    <span className="flex gap-1">
                      <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                      <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                      <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce"></span>
                    </span>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Voice Listening Bar Indicator if active */}
              {isListening && (
                <div className="px-3 py-1.5 bg-red-950/40 border-t border-red-500/30 flex items-center justify-between text-xs text-red-300 animate-pulse">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                    <span>{currentT.listeningText}</span>
                  </div>
                  <button 
                    onClick={toggleListening}
                    className="text-[10px] text-white bg-red-600/60 px-2 py-0.5 rounded cursor-pointer hover:bg-red-600"
                  >
                    {currentT.stopListening}
                  </button>
                </div>
              )}

              {/* Input Area */}
              <div className="p-2.5 bg-[#0d1322] border-t border-white/10">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                  className="flex items-center gap-1.5"
                >
                  {/* Speech-to-Text Microphone Button */}
                  <button
                    type="button"
                    onClick={toggleListening}
                    title={isListening ? currentT.stopListening : currentT.listeningText}
                    className={cn(
                      "p-2 rounded-xl transition-all cursor-pointer flex-shrink-0",
                      isListening 
                        ? "bg-red-500 text-white animate-pulse" 
                        : "bg-white/5 hover:bg-cyan-500/20 text-gray-400 hover:text-cyan-300 border border-white/10"
                    )}
                  >
                    {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>

                  <input
                    ref={inputRef}
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder={currentT.placeholder}
                    className="flex-1 bg-[#151c2f] border border-white/10 focus:border-cyan-500 text-white placeholder-gray-500 text-xs rounded-xl px-3 py-2 outline-none transition-colors"
                  />

                  <button
                    type="submit"
                    disabled={!inputMessage.trim() || isTyping}
                    className="p-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-40 text-black font-bold rounded-xl transition-all cursor-pointer flex-shrink-0 disabled:cursor-not-allowed shadow-md shadow-cyan-500/20 active:scale-95"
                  >
                    {isTyping ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Send className="w-4 h-4" />}
                  </button>
                </form>

                {/* Footer Micro Links */}
                <div className="flex items-center justify-between text-[10px] text-gray-500 mt-2 px-1">
                  <span>{currentT.footerInfo}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsReportModalOpen(true)}
                      className="hover:text-red-400 transition-colors cursor-pointer"
                    >
                      {currentT.reportModalBtn}
                    </button>
                    <span>•</span>
                    <button
                      onClick={() => setIsRequestModalOpen(true)}
                      className="hover:text-cyan-400 transition-colors cursor-pointer"
                    >
                      {currentT.requestModalBtn}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* 3. Broken Episode Report Modal */}
      <ReportBrokenModal
        isOpen={isReportModalOpen}
        onClose={() => {
          setIsReportModalOpen(false);
          setReportModalData(null);
        }}
        initialData={reportModalData || undefined}
        onSubmitSuccess={(msg) => {
          setMessages(prev => [
            ...prev,
            {
              id: `sys-${Date.now()}`,
              sender: 'assistant',
              text: msg,
              timestamp: Date.now()
            }
          ]);
        }}
      />

      {/* 4. Anime Request Modal */}
      <AnimeRequestModal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        onSubmitSuccess={(msg) => {
          setMessages(prev => [
            ...prev,
            {
              id: `sys-${Date.now()}`,
              sender: 'assistant',
              text: msg,
              timestamp: Date.now()
            }
          ]);
        }}
      />
    </>
  );
};
