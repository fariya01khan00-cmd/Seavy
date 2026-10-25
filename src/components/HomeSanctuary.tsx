import React, { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CommentItem,
  GazetteArticle,
  HomeSubView,
  MainTab,
  ReelItem,
  UserProfile,
} from '../types';
import { apiFetch } from '../config/api';
import {
  DOCTOR_TIPS,
  FIVE_EMERGENCY_NUMBERS,
  HOMEOPATHIC_AND_HOME_REMEDIES,
  POPULAR_DOCTORS_DIRECTORY,
  STITCH_ASSETS,
} from '../data/demoData';
import { ResilientImage } from './ResilientImage';
import { getUiLang, UI_COPY } from '../utils/i18n';
import {
  getBcp47LocaleForDialect,
  isRunningInIframe,
  useSingleShotSpeechInput,
} from '../utils/speechCoordinator';
import { StudioModalTab } from './MediaCaptureAndNotesModal';

interface HomeSanctuaryProps {
  subView: HomeSubView;
  onChangeSubView: (v: HomeSubView) => void;
  reels: ReelItem[];
  onUpdateReels: React.Dispatch<React.SetStateAction<ReelItem[]>>;
  comments: CommentItem[];
  onUpdateComments: React.Dispatch<React.SetStateAction<CommentItem[]>>;
  gazette: GazetteArticle[];
  onUpdateGazette: React.Dispatch<React.SetStateAction<GazetteArticle[]>>;
  bilingualSubtitles: boolean;
  onToggleSubtitles: () => void;
  dialectCode: string;
  userProfile?: UserProfile;
  onOpenStudioModal: (tab: StudioModalTab) => void;
  onAskAiFromSearch: (query: string) => void;
  onQuickNavigate: (tab: MainTab, sub?: string) => void;
  onShowToast: (msg: string) => void;
}

const APP_FEATURES_OMNI_INDEX: {
  id: string;
  title: string;
  detail: string;
  keywords: string;
  tab: MainTab;
  sub?: string;
  icon: string;
}[] = [
  {
    id: 'feat-ble',
    title: 'Bluetooth Peer-to-Peer SOS ("Help Me" & "Save Me")',
    detail: 'Zero-internet nearby Saevy-to-Saevy distress alerts with walking arrival ETA.',
    keywords: 'bluetooth offline peer help me save me nearby mesh no internet',
    tab: 'haven',
    sub: 'bluetooth_peer',
    icon: 'bluetooth_connected',
  },
  {
    id: 'feat-parent',
    title: 'Fake "Parent on Call" Speakerphone Companion',
    detail: 'Realistic Maa/Papa incoming call watching your live GPS route.',
    keywords: 'parent call fake call papa maa cab unsafe night walk voice',
    tab: 'haven',
    sub: 'parent_call',
    icon: 'ring_volume',
  },
  {
    id: 'feat-phrase',
    title: 'Whisper & Far-Field Safety Code Word',
    detail: '3.5x mic pre-amp triggers audio/video recording, police call, or live GPS share.',
    keywords: 'whisper code word safety phrase voice secret trigger record police',
    tab: 'haven',
    sub: 'safety_phrase',
    icon: 'record_voice_over',
  },
  {
    id: 'feat-map',
    title: 'Live GPS Safe Spots, Directions & Share Live Location',
    detail: 'Search any destination, compute routes, and share live GPS with Favourites.',
    keywords: 'gps map directions route safe spot live location share hospital pharmacy',
    tab: 'haven',
    sub: 'helplines',
    icon: 'location_on',
  },
  {
    id: 'feat-ai',
    title: 'Multimodal AI Concierge & 6 Female Voices',
    detail: 'Send voice notes, photos, or videos for safety steps & @home healthcare doubts.',
    keywords: 'ai concierge voice female kavya aanya meera zoya nandini siya health doubt',
    tab: 'haven',
    sub: 'concierge',
    icon: 'auto_awesome',
  },
  {
    id: 'feat-favourites',
    title: 'Favourite People, Family Circle & @Home Remedies',
    detail: 'Pick phone contacts, permit live GPS access, dial 3 doctors, or read @home remedies.',
    keywords: 'favourite family contacts remedies homoeopathic doctor tips cramp fever cold',
    tab: 'health',
    sub: 'overview',
    icon: 'spa',
  },
  {
    id: 'feat-atelier',
    title: 'Essential Safety Gear & ₹89 Sanitary Care Atelier',
    detail: 'Organic sanitary pads (₹89), cramp heat patches, pepper gel, cab window-breaker.',
    keywords: 'sanitary pads period pepper spray gel alarm window breaker shop atelier cheap',
    tab: 'atelier',
    sub: 'catalog',
    icon: 'shopping_bag',
  },
  {
    id: 'feat-language',
    title: '52 Indian & Global Languages + Royal Theme Settings',
    detail: 'Switch between Royal Dark & Cashmere Light, Evidence Locker, and 3x Press SOS.',
    keywords: 'language hindi tamil bengali theme dark light evidence locker triple press',
    tab: 'self',
    sub: 'settings',
    icon: 'tune',
  },
];

function expandBilingualQueryTerms(rawQuery: string): string[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return [];
  const terms = [q];
  if (q.includes('आत्मरक्षा') || q.includes('बचाव') || q.includes('कलाई') || q.includes('पकड़')) {
    terms.push('wrist', 'self-defence', 'grab');
  }
  if (q.includes('ज़ीरो') || q.includes('जीरो') || q.includes('एफआईआर') || q.includes('थाना') || q.includes('कानून')) {
    terms.push('zero-fir', 'legal', 'precinct');
  }
  if (q.includes('साइबर') || q.includes('धोखाधड़ी') || q.includes('कॉल') || q.includes('वारंट') || q.includes('1930')) {
    terms.push('cyber', '1930', 'custody', 'scam');
  }
  if (q.includes('रात') || q.includes('मेट्रो') || q.includes('दुकान') || q.includes('फार्मेसी')) {
    terms.push('night', 'pharmacy', 'sanctuary', 'patrol');
  }
  return terms;
}

export const HomeSanctuary: React.FC<HomeSanctuaryProps> = ({
  subView,
  onChangeSubView,
  reels,
  onUpdateReels,
  comments,
  onUpdateComments,
  gazette,
  onUpdateGazette,
  bilingualSubtitles,
  onToggleSubtitles,
  dialectCode,
  userProfile,
  onOpenStudioModal,
  onAskAiFromSearch,
  onQuickNavigate,
  onShowToast,
}) => {
  const uiLang = getUiLang(dialectCode);
  const voiceLang = getBcp47LocaleForDialect(dialectCode);
  const copy = UI_COPY[uiLang];

  const [feedMode, setFeedMode] = useState<'foryou' | 'following'>('foryou');
  const [topicFilter, setTopicFilter] = useState<string>('All');
  const [searchDraft, setSearchDraft] = useState('');
  const [voiceReadyToConfirm, setVoiceReadyToConfirm] = useState(false);
  const [activeReelIndex, setActiveReelIndex] = useState(0);
  const [heartBurstId, setHeartBurstId] = useState<string | null>(null);
  const lastTapRef = useRef<number>(0);
  const reelFeedContainerRef = useRef<HTMLDivElement | null>(null);

  const searchMic = useSingleShotSpeechInput({
    recognitionLang: voiceLang,
    uiLang,
    onTranscript: (transcript) => {
      setSearchDraft(transcript);
      setVoiceReadyToConfirm(true);
    },
  });

  const confirmSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    searchMic.stopListening();
    setVoiceReadyToConfirm(false);
    setActiveReelIndex(0);
  };

  const clearSearch = () => {
    searchMic.stopListening();
    setSearchDraft('');
    setVoiceReadyToConfirm(false);
    setActiveReelIndex(0);
  };

  // Global Omnisearch Results (App Features + Healthcare Doubts + @Home Remedies + Specialists)
  const omniQuery = searchDraft.trim().toLowerCase();
  const omniResults = useMemo(() => {
    if (!omniQuery) return null;
    const matchedFeatures = APP_FEATURES_OMNI_INDEX.filter((f) =>
      `${f.title} ${f.detail} ${f.keywords}`.toLowerCase().includes(omniQuery)
    ).slice(0, 4);

    const matchedRemedies = HOMEOPATHIC_AND_HOME_REMEDIES.filter((r) =>
      `${r.title} ${r.focusArea} ${r.ingredientsOrPotency} ${r.summary}`
        .toLowerCase()
        .includes(omniQuery)
    ).slice(0, 3);

    const matchedTips = DOCTOR_TIPS.filter((t) =>
      `${t.title} ${t.category} ${t.summary} ${t.doctorName}`.toLowerCase().includes(omniQuery)
    ).slice(0, 3);

    const matchedDoctors = POPULAR_DOCTORS_DIRECTORY.filter((d) =>
      `${d.name} ${d.specialty} ${d.clinicName} ${d.city}`.toLowerCase().includes(omniQuery)
    ).slice(0, 2);

    const matchedHelplines = FIVE_EMERGENCY_NUMBERS.filter((h) =>
      `${h.number} ${h.title} ${h.subtitle} ${h.whenToCall}`.toLowerCase().includes(omniQuery)
    ).slice(0, 2);

    return {
      matchedFeatures,
      matchedRemedies,
      matchedTips,
      matchedDoctors,
      matchedHelplines,
      totalCount:
        matchedFeatures.length +
        matchedRemedies.length +
        matchedTips.length +
        matchedDoctors.length +
        matchedHelplines.length,
    };
  }, [omniQuery]);

  // Practice Drill Modal
  const [practiceReel, setPracticeReel] = useState<ReelItem | null>(null);
  const [practiceStepIdx, setPracticeStepIdx] = useState(0);

  // Create & Moderate Reel Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTopic, setNewTopic] = useState<ReelItem['topic']>('Self-Defence');
  const [newCaption, setNewCaption] = useState('');
  const [newStepTip, setNewStepTip] = useState('');
  const [newReelVideoUrl, setNewReelVideoUrl] = useState<string | undefined>(undefined);
  const [newReelImageUrl, setNewReelImageUrl] = useState<string | undefined>(undefined);
  const [newReelMediaName, setNewReelMediaName] = useState<string>('');
  const [isModeratingReel, setIsModeratingReel] = useState(false);
  const [createError, setCreateError] = useState('');

  // Comments state
  const [commentText, setCommentText] = useState('');
  const [commentError, setCommentError] = useState('');
  const [commentSort, setCommentSort] = useState<'top' | 'recent'>('top');
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [confirmDeleteCommentId, setConfirmDeleteCommentId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');

  // Gazette state
  const [gazetteFilter, setGazetteFilter] = useState<string>('All');
  const [directiveSaved, setDirectiveSaved] = useState(false);
  const [readingArticle, setReadingArticle] = useState<GazetteArticle | null>(null);

  const filteredReels = useMemo(() => {
    const terms = expandBilingualQueryTerms(searchDraft);
    return reels.filter((r) => {
      if (feedMode === 'following' && !r.following) return false;
      if (topicFilter !== 'All' && r.topic !== topicFilter) return false;
      if (terms.length > 0) {
        const haystack = `${r.title} ${r.caption} ${r.instructor} ${r.topic} ${r.stepEn} ${r.stepHi} ${r.tags.join(' ')}`.toLowerCase();
        if (!terms.some((t) => haystack.includes(t))) {
          return false;
        }
      }
      return true;
    });
  }, [reels, feedMode, topicFilter, searchDraft]);

  const currentReel = filteredReels[activeReelIndex] || filteredReels[0];

  const scrollToReelIdx = (idx: number) => {
    setActiveReelIndex(idx);
    const el = reelFeedContainerRef.current;
    if (el) {
      el.scrollTo({ top: idx * el.clientHeight, behavior: 'smooth' });
    }
  };

  const handleReelScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (!el.clientHeight) return;
    const idx = Math.round(el.scrollTop / el.clientHeight);
    if (idx !== activeReelIndex && idx >= 0 && idx < filteredReels.length) {
      setActiveReelIndex(idx);
    }
  };

  const toggleReelLike = (id: string, forceTrue = false) => {
    onUpdateReels((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const nextLiked = forceTrue ? true : !r.liked;
        if (nextLiked === r.liked) return r;
        return {
          ...r,
          liked: nextLiked,
          likesCount: nextLiked ? r.likesCount + 1 : Math.max(0, r.likesCount - 1),
        };
      })
    );
  };

  const toggleRepostReel = (id: string) => {
    onUpdateReels((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const nextRepost = !r.repostedByMe;
        const baseCount = r.repostCount ?? 42;
        onShowToast(
          nextRepost
            ? `Reposted "${r.title}" to your Sanctuary Reels`
            : `Removed repost for "${r.title}"`
        );
        return {
          ...r,
          repostedByMe: nextRepost,
          repostCount: nextRepost ? baseCount + 1 : Math.max(0, baseCount - 1),
        };
      })
    );
  };

  const handleVideoAreaDoubleTap = (reelId: string) => {
    const now = Date.now();
    if (now - lastTapRef.current < 320) {
      toggleReelLike(reelId, true);
      setHeartBurstId(reelId);
      setTimeout(() => setHeartBurstId(null), 650);
    }
    lastTapRef.current = now;
  };

  const toggleFollow = (id: string) => {
    onUpdateReels((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const next = !r.following;
        onShowToast(next ? `Following ${r.instructor}` : `Unfollowed ${r.instructor}`);
        return { ...r, following: next };
      })
    );
  };

  const toggleSaveReel = (id: string) => {
    onUpdateReels((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const next = !r.saved;
        onShowToast(next ? 'Saved Reel to Sanctuary Suite' : 'Removed Reel from saved list');
        return { ...r, saved: next };
      })
    );
  };

  const handleAttachReelMedia = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 14 * 1024 * 1024) {
      setCreateError('Please select a video or image under 14 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        if (file.type.startsWith('video/')) {
          setNewReelVideoUrl(reader.result);
          setNewReelImageUrl(undefined);
        } else {
          setNewReelImageUrl(reader.result);
          setNewReelVideoUrl(undefined);
        }
        setNewReelMediaName(file.name);
        setCreateError('');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleCreateReel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newCaption.trim()) {
      setCreateError('Please enter both a Reel title and a clear women’s safety / self-defence description.');
      return;
    }

    setIsModeratingReel(true);
    setCreateError('');

    try {
      const modRes = await apiFetch('/api/ai/moderate-reel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          caption: `${newCaption.trim()} ${newStepTip.trim()}`,
          topic: newTopic,
        }),
      });
      const modData = await modRes.json().catch(() => ({ allowed: true }));
      if (!modRes.ok || modData?.allowed === false) {
        setCreateError(
          modData?.reason ||
            'Blocked by Sanctuary Moderation: Comedy, entertainment, memes, pranks, and abusive reels are strictly not permitted. Only Women’s Safety Awareness & Self-Defence reels are allowed.'
        );
        setIsModeratingReel(false);
        return;
      }
    } catch {
      // Server fallback handled cleanly
    }

    const created: ReelItem = {
      id: `reel-${Date.now()}`,
      instructor: userProfile?.fullName?.trim() || 'Sarah Jenkins',
      credential: 'Verified Sanctuary Creator',
      role: 'Safety Awareness Contributor',
      avatarUrl: userProfile?.avatarUrl || STITCH_ASSETS.sarahAvatar,
      heroImageUrl: newReelImageUrl || STITCH_ASSETS.reelThumb,
      thumbUrl: newReelImageUrl || STITCH_ASSETS.reelThumb,
      videoDataUrl: newReelVideoUrl,
      topic: newTopic,
      duration: newReelVideoUrl ? '0:30' : '0:35',
      title: newTitle.trim(),
      caption: newCaption.trim(),
      tags: [`#${newTopic.replace(/\s+/g, '')}`, '#WomenSafetyReels', '#SaevySanctuary'],
      stepEn: newStepTip.trim()
        ? `"${newStepTip.trim()}"`
        : '"Stay observant, create safe distance, and alert trusted contacts."',
      stepHi: 'शांत रहें, सुरक्षित दूरी बनाएँ और विश्वसनीय संपर्क को सूचित करें।',
      likesCount: 1,
      liked: true,
      saved: true,
      following: true,
      repostedByMe: false,
      repostCount: 1,
      drillSteps: [
        newStepTip.trim() || 'Assess your surroundings and locate the nearest well-lit public exit.',
        'Maintain clear posture and vocalize boundaries firmly.',
      ],
    };
    onUpdateReels((prev) => [created, ...prev]);
    setIsModeratingReel(false);
    setActiveReelIndex(0);
    setFeedMode('foryou');
    setTopicFilter('All');
    setNewTitle('');
    setNewCaption('');
    setNewStepTip('');
    setNewReelVideoUrl(undefined);
    setNewReelImageUrl(undefined);
    setNewReelMediaName('');
    setCreateError('');
    setCreateOpen(false);
    onShowToast('Verified Women’s Safety Reel published to Sanctuary feed');
    setTimeout(() => scrollToReelIdx(0), 80);
  };

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) {
      setCommentError('Please write a comment or question before posting.');
      return;
    }
    const item: CommentItem = {
      id: `comment-${Date.now()}`,
      author: userProfile?.fullName?.trim() || 'Sarah Jenkins',
      saevyId: userProfile?.guardianId || '#SV-92841',
      timeAgo: 'Just now',
      avatarUrl: userProfile?.avatarUrl || STITCH_ASSETS.sarahAvatar,
      body: commentText.trim(),
      likes: 1,
      likedByMe: true,
      repliesCount: 0,
      replies: [],
    };
    onUpdateComments((prev) => [item, ...prev]);
    setCommentText('');
    setCommentError('');
    onShowToast('Reflection posted to Sanctuary Circle');
  };

  const handleAddReply = (commentId: string) => {
    if (!replyDraft.trim()) return;
    onUpdateComments((prev) =>
      prev.map((c) => {
        if (c.id !== commentId) return c;
        const nextReplies = [
          ...(c.replies || []),
          {
            id: `rep-${Date.now()}`,
            author: userProfile?.fullName?.trim() || 'Sarah Jenkins',
            body: replyDraft.trim(),
            timeAgo: 'Just now',
          },
        ];
        return {
          ...c,
          repliesCount: c.repliesCount + 1,
          replies: nextReplies,
        };
      })
    );
    setReplyDraft('');
    setReplyingToId(null);
    onShowToast('Reply added');
  };

  const sortedComments = useMemo(() => {
    const list = [...comments];
    if (commentSort === 'top') {
      list.sort((a, b) => b.likes - a.likes);
    }
    return list;
  }, [comments, commentSort]);

  const filteredGazette = useMemo(() => {
    const terms = expandBilingualQueryTerms(searchDraft);
    return gazette.filter((g) => {
      if (gazetteFilter !== 'All' && g.category !== gazetteFilter) return false;
      if (terms.length > 0) {
        const hay = `${g.title} ${g.summary} ${g.category} ${g.tagLabel} ${g.kicker}`.toLowerCase();
        if (!terms.some((t) => hay.includes(t))) return false;
      }
      return true;
    });
  }, [gazette, gazetteFilter, searchDraft]);

  const searchMicStatusLabel: Record<typeof searchMic.status, string> = {
    idle: uiLang === 'hi' ? 'तैयार' : 'Ready',
    listening: uiLang === 'hi' ? 'सुन रहा है...' : 'Listening...',
    processing: uiLang === 'hi' ? 'प्रोसेसिंग...' : 'Processing...',
    stopped: uiLang === 'hi' ? 'तैयार' : 'Ready',
    'permission-denied': uiLang === 'hi' ? 'अनुमति अस्वीकृत' : 'Permission denied',
    unsupported: uiLang === 'hi' ? 'उपलब्ध नहीं' : 'Unsupported',
    error: uiLang === 'hi' ? 'त्रुटि' : 'Error',
  };

  return (
    <div className="space-y-6">
      {/* Frosted Luxury Sub-Navigation Pill */}
      <div className="flex items-center justify-between gap-2 flex-wrap bg-[#FFFCF8]/90 border border-[#F0E6DC] rounded-full p-1.5 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.05)]">
        {(
          [
            { id: 'reels', label: 'Sanctuary Reels', icon: 'smart_display' },
            { id: 'comments', label: `Circle (${comments.length})`, icon: 'forum' },
            { id: 'gazette', label: 'The Gazette', icon: 'auto_stories' },
          ] as { id: HomeSubView; label: string; icon: string }[]
        ).map((tab) => {
          const active = subView === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChangeSubView(tab.id)}
              className={`relative flex-1 min-h-[46px] px-4 rounded-full text-xs sm:text-sm font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap active:scale-[0.98] ${
                active ? 'text-[#FFFCF8]' : 'text-[#5C544E] hover:text-[#0A0A0A]'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="home-subtab-pill"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  className="absolute inset-0 rounded-full bg-[#0A0A0A] border border-[#D4AF37]/40 shadow-[0_6px_20px_rgba(10,10,10,0.16)]"
                />
              )}
              <span
                className={`material-symbols-outlined text-[18px] relative z-10 ${
                  active ? 'text-[#D4AF37]' : ''
                }`}
              >
                {tab.icon}
              </span>
              <span className="relative z-10">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Front-Page Global Omnisearch + Camera/Video/Audio Capture + 52-Language Voice Typing + Personal Notes */}
      <div className="luxury-card p-3 sm:p-3.5 space-y-2.5">
        <form
          onSubmit={confirmSearch}
          role="search"
          aria-label="Global Saevy Search across App Features, Healthcare Doubts, Remedies & Reels"
          className="flex flex-wrap sm:flex-nowrap items-center gap-2"
        >
          <div className="relative flex-1 min-w-[200px]">
            <span className="material-symbols-outlined text-[#D4AF37] text-[20px] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
              search
            </span>
            <input
              type="text"
              value={searchDraft}
              onChange={(e) => {
                setSearchDraft(e.target.value);
                setActiveReelIndex(0);
              }}
              placeholder="Search app features, healthcare doubts, @home remedies, reels..."
              aria-label="Search app features, healthcare doubts, remedies, and reels"
              className="w-full min-h-[50px] pl-11 pr-10 rounded-full bg-[#FAF3EB]/65 border border-[#F0E6DC] text-xs sm:text-sm text-[#0A0A0A] placeholder:text-[#5C544E]/70 focus:outline-none focus:border-[#D4AF37]"
            />
            {searchDraft && (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="Clear search"
                className="w-7 h-7 rounded-full flex items-center justify-center text-[#5C544E] hover:text-[#0A0A0A] absolute right-2.5 top-1/2 -translate-y-1/2 transition-colors"
              >
                <span className="material-symbols-outlined text-[17px]">close</span>
              </button>
            )}
          </div>

          {/* 52-Language Voice Typing Button */}
          <button
            type="button"
            onClick={() => {
              if (searchMic.status === 'listening' || searchMic.status === 'processing') {
                searchMic.stopListening();
              } else {
                setVoiceReadyToConfirm(false);
                searchMic.startListening();
              }
            }}
            aria-pressed={searchMic.status === 'listening'}
            title={`Voice typing (${voiceLang})`}
            className={
              searchMic.status === 'listening'
                ? 'min-h-[50px] px-4 rounded-full bg-[#B76E79] text-[#FFFCF8] text-xs font-medium flex items-center gap-1.5 shrink-0 shadow-[0_6px_20px_rgba(183,110,121,0.3)] active:scale-[0.98] transition-all'
                : 'btn-luxury-outline px-4 text-xs font-medium flex items-center gap-1.5 shrink-0'
            }
          >
            <span
              className={`material-symbols-outlined text-[18px] ${
                searchMic.status === 'listening' ? 'text-[#FFFCF8]' : 'text-[#B76E79]'
              }`}
            >
              {searchMic.status === 'listening' ? 'stop_circle' : 'mic'}
            </span>
            <span>{searchMic.status === 'listening' ? copy.voiceMicStop : copy.voiceMicStart}</span>
          </button>

          {/* Camera / Video / Audio Capture Button RIGHT NEXT TO SEARCH BAR */}
          <button
            type="button"
            onClick={() => onOpenStudioModal('photo')}
            title="Open Camera, Video & Audio Capture Studio"
            className="btn-luxury-outline px-4 text-xs font-medium flex items-center gap-1.5 shrink-0"
          >
            <span className="material-symbols-outlined text-[18px] text-[#D4AF37]">
              photo_camera
            </span>
            <span>Camera / Mic</span>
          </button>

          {/* Personal Notes Button */}
          <button
            type="button"
            onClick={() => onOpenStudioModal('notes')}
            title="Write personal notes in your own words"
            className="btn-luxury-outline px-4 text-xs font-medium flex items-center gap-1.5 shrink-0"
          >
            <span className="material-symbols-outlined text-[18px] text-[#D4AF37]">
              edit_note
            </span>
            <span>Notes</span>
          </button>
        </form>

        {(searchMic.status === 'listening' ||
          searchMic.status === 'processing' ||
          (voiceReadyToConfirm && searchDraft.trim())) && (
          <div className="flex items-center gap-2 px-2 text-xs text-[#5C544E]">
            <span>
              Voice ({voiceLang}):{' '}
              <strong className="text-[#0A0A0A]">{searchMicStatusLabel[searchMic.status]}</strong>
            </span>
            {voiceReadyToConfirm && searchDraft.trim() && (
              <span className="text-[#8C6D1F] font-medium">· Results updated live</span>
            )}
          </div>
        )}

        {/* Instant Global Omnisearch Results Drawer */}
        {omniResults && (
          <div className="pt-3 border-t border-[#F0E6DC] space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-semibold text-[#D4AF37]">
                Global Saevy Answers for &ldquo;{searchDraft.trim()}&rdquo; ({omniResults.totalCount}{' '}
                direct matches)
              </span>
              <button
                type="button"
                onClick={() => onAskAiFromSearch(searchDraft.trim())}
                className="btn-luxury px-4 text-xs font-medium flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px] text-[#D4AF37]">
                  auto_awesome
                </span>
                <span>Ask AI Concierge: &ldquo;{searchDraft.trim().slice(0, 28)}&rdquo;</span>
              </button>
            </div>

            {omniResults.matchedFeatures.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {omniResults.matchedFeatures.map((feat) => (
                  <button
                    key={feat.id}
                    type="button"
                    onClick={() => {
                      onQuickNavigate(feat.tab, feat.sub);
                      clearSearch();
                    }}
                    className="p-3.5 rounded-[18px] bg-[#FAF3EB]/85 border border-[#F0E6DC] hover:border-[#D4AF37] text-left flex items-start gap-3 transition-all"
                  >
                    <span className="material-symbols-outlined text-[20px] text-[#D4AF37] mt-0.5">
                      {feat.icon}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#0A0A0A]">{feat.title}</div>
                      <p className="text-[11px] text-[#5C544E] mt-0.5 leading-snug">
                        {feat.detail}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {(omniResults.matchedRemedies.length > 0 || omniResults.matchedTips.length > 0) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {omniResults.matchedRemedies.map((rem) => (
                  <button
                    key={rem.id}
                    type="button"
                    onClick={() => {
                      onQuickNavigate('health', 'remedies');
                      clearSearch();
                    }}
                    className="p-3.5 rounded-[18px] bg-[#E8EDE8]/80 border border-[#DFE7DF] hover:border-[#D4AF37] text-left space-y-1 transition-all"
                  >
                    <div className="text-[11px] font-semibold text-[#3E6B4E]">
                      @Home Remedy · {rem.focusArea}
                    </div>
                    <div className="text-xs font-bold text-[#0A0A0A]">{rem.title}</div>
                    <p className="text-[11px] text-[#5C544E] line-clamp-2">{rem.summary}</p>
                  </button>
                ))}
                {omniResults.matchedTips.map((tip) => (
                  <button
                    key={tip.id}
                    type="button"
                    onClick={() => {
                      onQuickNavigate('health', 'tips');
                      clearSearch();
                    }}
                    className="p-3.5 rounded-[18px] bg-[#FAF3EB]/80 border border-[#F0E6DC] hover:border-[#D4AF37] text-left space-y-1 transition-all"
                  >
                    <div className="text-[11px] font-semibold text-[#B76E79]">
                      Doctor Tip · {tip.doctorName}
                    </div>
                    <div className="text-xs font-bold text-[#0A0A0A]">{tip.title}</div>
                    <p className="text-[11px] text-[#5C544E] line-clamp-2">{tip.summary}</p>
                  </button>
                ))}
              </div>
            )}

            {(omniResults.matchedDoctors.length > 0 || omniResults.matchedHelplines.length > 0) && (
              <div className="flex flex-wrap items-center gap-2">
                {omniResults.matchedDoctors.map((doc) => (
                  <a
                    key={doc.id}
                    href={`tel:${doc.phoneDial}`}
                    className="min-h-[38px] px-4 rounded-full bg-[#FFFCF8] border border-[#D4AF37]/50 text-xs font-medium text-[#0A0A0A] flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[15px] text-[#D4AF37]">
                      call
                    </span>
                    <span>
                      {doc.name} ({doc.specialty}) · {doc.phoneDisplay}
                    </span>
                  </a>
                ))}
                {omniResults.matchedHelplines.map((h) => (
                  <a
                    key={h.id}
                    href={`tel:${h.number}`}
                    className="min-h-[38px] px-4 rounded-full bg-[#0A0A0A] text-[#FFFCF8] border border-[#D4AF37]/50 text-xs font-medium flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[15px] text-[#D4AF37]">
                      emergency
                    </span>
                    <span>
                      Dial {h.number} · {h.title}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {searchMic.errorMessage && (
          <div
            className="luxury-card-blush p-3 text-xs text-[#0A0A0A] flex flex-wrap items-center justify-between gap-2"
            role="alert"
          >
            <span>{searchMic.errorMessage}</span>
            {searchMic.status === 'permission-denied' && (
              <button
                type="button"
                onClick={searchMic.resetPermissionDenialForRetry}
                className="underline text-[#0A0A0A] font-semibold"
              >
                Reset mic state
              </button>
            )}
            {isRunningInIframe() && (
              <span className="block w-full text-[11px] text-[#5C544E]">
                If preview restricts microphone access, open the app URL in a standalone browser tab.
              </span>
            )}
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {/* ======================== 1. INSTAGRAM-STYLE VERTICAL SANCTUARY REELS VIEW ======================== */}
        {subView === 'reels' && (
          <motion.div
            key="reels-view"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
          >
            {/* Left Column: Vertical Snap-Scrolling Reels Feed (Scroll Up & Down Like Instagram Reels) */}
            <div className="lg:col-span-7 space-y-4">
              {/* Top Feed Controls + Create Verified Safety Reel */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-4 bg-[#FFFCF8]/90 backdrop-blur-xl px-4 py-1.5 rounded-full border border-[#F0E6DC]">
                  <button
                    type="button"
                    onClick={() => {
                      setFeedMode('foryou');
                      scrollToReelIdx(0);
                    }}
                    className={`relative min-h-[36px] text-xs sm:text-sm font-semibold transition-colors ${
                      feedMode === 'foryou'
                        ? 'text-[#0A0A0A]'
                        : 'text-[#5C544E] hover:text-[#0A0A0A]'
                    }`}
                  >
                    Reels For You
                    {feedMode === 'foryou' && (
                      <motion.span
                        layoutId="reel-feed-underline"
                        className="absolute bottom-0.5 left-0 right-0 h-0.5 rounded-full bg-[#D4AF37]"
                      />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFeedMode('following');
                      scrollToReelIdx(0);
                    }}
                    className={`relative min-h-[36px] text-xs sm:text-sm font-medium transition-colors ${
                      feedMode === 'following'
                        ? 'text-[#0A0A0A]'
                        : 'text-[#5C544E] hover:text-[#0A0A0A]'
                    }`}
                  >
                    Following
                    {feedMode === 'following' && (
                      <motion.span
                        layoutId="reel-feed-underline"
                        className="absolute bottom-0.5 left-0 right-0 h-0.5 rounded-full bg-[#D4AF37]"
                      />
                    )}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onToggleSubtitles}
                    className={`min-h-[40px] px-3.5 rounded-full text-xs font-medium flex items-center gap-1.5 border transition-all ${
                      bilingualSubtitles
                        ? 'bg-[#FFFCF8] text-[#0A0A0A] border-[#D4AF37]'
                        : 'bg-[#FFFCF8]/80 text-[#5C544E] border-[#F0E6DC]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px] text-[#D4AF37]">
                      subtitles
                    </span>
                    <span>{bilingualSubtitles ? 'EN + हिन्दी' : 'EN'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCreateOpen(true)}
                    className="btn-luxury px-4 text-xs sm:text-sm font-medium flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[18px] text-[#D4AF37]">
                      video_call
                    </span>
                    <span>Create Safety Reel</span>
                  </button>
                </div>
              </div>

              {/* Topic Filter Strip */}
              <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
                <div className="flex items-center gap-2">
                  {['All', 'Self-Defence', 'Legal Rights', 'Cyber Safety', 'First Aid'].map(
                    (topic) => (
                      <button
                        key={topic}
                        type="button"
                        onClick={() => {
                          setTopicFilter(topic);
                          scrollToReelIdx(0);
                        }}
                        className={`min-h-[36px] px-4 rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition-all ${
                          topicFilter === topic
                            ? 'bg-[#0A0A0A] text-[#FFFCF8] border border-[#D4AF37]/60'
                            : 'bg-[#FFFCF8]/90 text-[#5C544E] border border-[#F0E6DC] hover:text-[#0A0A0A]'
                        }`}
                      >
                        {topic}
                      </button>
                    )
                  )}
                </div>
                <span className="text-[11px] text-[#8C6D1F] shrink-0 hidden sm:inline">
                  Swipe / Scroll Up &amp; Down · Safety Only
                </span>
              </div>

              {/* Vertical Snap-Scrolling Instagram-Style Reels Viewport */}
              {filteredReels.length === 0 ? (
                <div className="luxury-card p-10 text-center space-y-3">
                  <p className="text-sm font-medium text-[#0A0A0A]">
                    No safety reels match &ldquo;{searchDraft.trim() || topicFilter}&rdquo;.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setFeedMode('foryou');
                      setTopicFilter('All');
                      clearSearch();
                    }}
                    className="btn-luxury px-5 text-xs font-medium"
                  >
                    Show All Safety Reels
                  </button>
                </div>
              ) : (
                <div
                  ref={reelFeedContainerRef}
                  onScroll={handleReelScroll}
                  className="h-[600px] sm:h-[640px] overflow-y-scroll snap-y snap-mandatory no-scrollbar rounded-[24px] border border-[#F0E6DC] shadow-[0_12px_38px_rgba(0,0,0,0.18)] bg-[#0E0C14]"
                >
                  {filteredReels.map((reel, idx) => (
                    <div
                      key={reel.id}
                      onClick={() => handleVideoAreaDoubleTap(reel.id)}
                      className="snap-start h-[600px] sm:h-[640px] w-full relative overflow-hidden flex flex-col justify-between select-none shrink-0"
                    >
                      {reel.videoDataUrl ? (
                        <video
                          src={reel.videoDataUrl}
                          autoPlay={idx === activeReelIndex}
                          muted
                          loop
                          playsInline
                          controls
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      ) : (
                        <ResilientImage
                          src={reel.heroImageUrl}
                          alt={`${reel.instructor} demonstrating ${reel.title}`}
                          className="absolute inset-0 w-full h-full object-cover"
                          fallbackIcon="sports_martial_arts"
                        />
                      )}

                      {/* Cinematic Top & Bottom Scrim */}
                      <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/90 pointer-events-none" />

                      {/* Top Reel Indicator & Strict Safety Badge */}
                      <div className="relative z-20 p-4 flex items-center justify-between text-xs text-white/90">
                        <span className="font-medium tracking-wide text-[#F5D97E]">
                          Verified Safety Reel · {reel.topic}
                        </span>
                        <span className="tabular-nums text-white/75">
                          {idx + 1} / {filteredReels.length} · Scroll ↕
                        </span>
                      </div>

                      {/* Double-Tap Heart Burst */}
                      <div className="relative z-10 flex-1 flex items-center justify-center pointer-events-none">
                        <AnimatePresence>
                          {heartBurstId === reel.id && (
                            <motion.div
                              initial={{ scale: 0.4, opacity: 0 }}
                              animate={{ scale: 1.2, opacity: 1 }}
                              exit={{ scale: 0.8, opacity: 0 }}
                              transition={{ duration: 0.25 }}
                            >
                              <span className="material-symbols-outlined material-symbols-filled text-[#FFE4E6] text-[86px] drop-shadow-lg">
                                favorite
                              </span>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Bottom Creator Caption + Right Instagram-Style Action Column (Like, Comment, Repost, Save, Share) */}
                      <div
                        className="relative z-20 p-5 flex items-end justify-between gap-4"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex-1 min-w-0 space-y-2.5 text-white">
                          {reel.repostedByMe && (
                            <div className="text-[11px] font-medium text-[#F5D97E] flex items-center gap-1">
                              <span className="material-symbols-outlined text-[15px]">repeat</span>
                              <span>You reposted this Safety Reel</span>
                            </div>
                          )}

                          <div className="flex items-center gap-3 flex-wrap">
                            <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-[#D4AF37] shrink-0">
                              <ResilientImage
                                src={reel.avatarUrl}
                                alt={reel.instructor}
                                className="w-full h-full object-cover"
                                fallbackIcon="person"
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-display font-bold text-base text-white truncate">
                                  {reel.instructor}
                                </span>
                                <span className="text-xs text-[#F5D97E]">· {reel.credential}</span>
                              </div>
                              <p className="text-[11px] text-white/75">{reel.role}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleFollow(reel.id)}
                              className={`min-h-[32px] px-3.5 rounded-full text-xs font-medium transition-all active:scale-95 ${
                                reel.following
                                  ? 'bg-white/20 backdrop-blur-md text-white border border-white/30'
                                  : 'bg-[#D4AF37] text-[#0A0A0A]'
                              }`}
                            >
                              {reel.following ? 'Following' : '+ Follow'}
                            </button>
                          </div>

                          <div>
                            <h3 className="font-display font-bold text-lg sm:text-xl text-white tracking-wide">
                              {reel.title}
                            </h3>
                            <p className="text-xs sm:text-sm text-white/90 leading-relaxed mt-0.5 line-clamp-2">
                              {reel.caption}
                            </p>
                            <p className="text-[11px] text-[#F5D97E] mt-1">
                              {reel.tags.join(' · ')} · {reel.duration}
                            </p>
                          </div>

                          {/* Technique Subtitle Cue */}
                          <div className="p-3 rounded-[16px] bg-black/55 backdrop-blur-md border border-[#D4AF37]/35 text-white space-y-0.5">
                            <p className="text-xs italic text-white/95">{reel.stepEn}</p>
                            {bilingualSubtitles && (
                              <p className="text-[11px] text-[#F5D97E]">{reel.stepHi}</p>
                            )}
                          </div>
                        </div>

                        {/* Vertical Action Column */}
                        <div className="flex flex-col items-center gap-2.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => toggleReelLike(reel.id)}
                            className="flex flex-col items-center gap-0.5 min-w-[46px] active:scale-90 transition-transform"
                          >
                            <span
                              className={`w-10 h-10 rounded-full bg-black/55 backdrop-blur-xl border border-white/20 flex items-center justify-center ${
                                reel.liked ? 'text-[#FF6B8B]' : 'text-white'
                              }`}
                            >
                              <span
                                className={`material-symbols-outlined text-[21px] ${
                                  reel.liked ? 'material-symbols-filled' : ''
                                }`}
                              >
                                favorite
                              </span>
                            </span>
                            <span className="text-[10px] font-medium text-white tabular-nums">
                              {reel.likesCount >= 1000
                                ? `${(reel.likesCount / 1000).toFixed(1)}k`
                                : reel.likesCount}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onChangeSubView('comments')}
                            className="flex flex-col items-center gap-0.5 min-w-[46px] active:scale-90 transition-transform"
                          >
                            <span className="w-10 h-10 rounded-full bg-black/55 backdrop-blur-xl border border-white/20 flex items-center justify-center text-white">
                              <span className="material-symbols-outlined text-[19px]">
                                chat_bubble
                              </span>
                            </span>
                            <span className="text-[10px] font-medium text-white tabular-nums">
                              {comments.length + 839}
                            </span>
                          </button>

                          {/* Repost Reel Button */}
                          <button
                            type="button"
                            onClick={() => toggleRepostReel(reel.id)}
                            className="flex flex-col items-center gap-0.5 min-w-[46px] active:scale-90 transition-transform"
                          >
                            <span
                              className={`w-10 h-10 rounded-full bg-black/55 backdrop-blur-xl border flex items-center justify-center ${
                                reel.repostedByMe
                                  ? 'border-[#D4AF37] text-[#F5D97E]'
                                  : 'border-white/20 text-white'
                              }`}
                            >
                              <span className="material-symbols-outlined text-[20px]">repeat</span>
                            </span>
                            <span className="text-[10px] font-medium text-white tabular-nums">
                              {reel.repostedByMe ? 'Reposted' : reel.repostCount ?? 42}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => toggleSaveReel(reel.id)}
                            className="flex flex-col items-center gap-0.5 min-w-[46px] active:scale-90 transition-transform"
                          >
                            <span
                              className={`w-10 h-10 rounded-full bg-black/55 backdrop-blur-xl border border-white/20 flex items-center justify-center ${
                                reel.saved ? 'text-[#F5D97E]' : 'text-white'
                              }`}
                            >
                              <span
                                className={`material-symbols-outlined text-[19px] ${
                                  reel.saved ? 'material-symbols-filled' : ''
                                }`}
                              >
                                bookmark
                              </span>
                            </span>
                            <span className="text-[10px] font-medium text-white">
                              {reel.saved ? 'Saved' : 'Save'}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard?.writeText(window.location.href).catch(() => {});
                              onShowToast('Reel link copied');
                            }}
                            className="flex flex-col items-center gap-0.5 min-w-[46px] active:scale-90 transition-transform"
                          >
                            <span className="w-10 h-10 rounded-full bg-black/55 backdrop-blur-xl border border-white/20 flex items-center justify-center text-white">
                              <span className="material-symbols-outlined text-[18px]">
                                ios_share
                              </span>
                            </span>
                            <span className="text-[10px] font-medium text-white">Share</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Interactive Muscle Memory Practice Card */}
              {currentReel && (
                <div className="luxury-card-sage p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-full bg-[#FFFCF8] border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shrink-0">
                      <span className="material-symbols-outlined text-[22px]">psychology</span>
                    </div>
                    <div>
                      <h4 className="font-display font-bold text-base text-[#0A0A0A]">
                        Rehearse Technique Calmly
                      </h4>
                      <p className="text-xs text-[#5C544E]">
                        Step through {currentReel.title.toLowerCase()} with guided posture cues.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPracticeStepIdx(0);
                      setPracticeReel(currentReel);
                    }}
                    className="btn-luxury px-6 font-medium text-xs sm:text-sm shrink-0"
                  >
                    Practice Steps
                  </button>
                </div>
              )}
            </div>

            {/* Right Companion Column: Sanctuary Reels Queue + Strict Content Policy + Gazette */}
            <div className="lg:col-span-5 space-y-5">
              <div className="luxury-card p-6 space-y-4">
                <div className="flex items-baseline justify-between">
                  <h3 className="font-display text-2xl font-bold text-[#0A0A0A]">
                    Safety Reels Queue
                  </h3>
                  <span className="text-xs text-[#5C544E] tabular-nums">
                    {filteredReels.length} Verified Reels
                  </span>
                </div>

                <p className="text-xs text-[#5C544E] leading-relaxed">
                  Strictly moderated for Women&rsquo;s Safety Awareness, Self-Defence, Zero-FIR Legal Rights &amp; First Aid. Comedy, memes, and abusive videos are automatically blocked.
                </p>

                <div className="space-y-3">
                  {filteredReels.map((r, idx) => {
                    const isSelected = currentReel?.id === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => scrollToReelIdx(idx)}
                        className={`w-full text-left p-3.5 rounded-[20px] border transition-all flex items-center gap-3.5 active:scale-[0.99] ${
                          isSelected
                            ? 'bg-[#FAF3EB] border-[#D4AF37] shadow-[0_6px_22px_rgba(212,175,55,0.12)]'
                            : 'bg-[#FFFCF8] border-[#F0E6DC] hover:border-[#D4AF37]/50'
                        }`}
                      >
                        <div className="w-14 h-16 rounded-[14px] overflow-hidden border border-[#F0E6DC] shrink-0">
                          <ResilientImage
                            src={r.thumbUrl}
                            alt={r.title}
                            className="w-full h-full object-cover"
                            fallbackIcon="play_circle"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-[#8C6D1F] font-medium">
                            {r.topic} · {r.duration}
                          </div>
                          <div className="font-semibold text-sm text-[#0A0A0A] truncate mt-0.5">
                            {r.title}
                          </div>
                          <div className="text-xs text-[#5C544E] truncate">
                            {r.instructor} · {r.credential}
                          </div>
                        </div>
                        <span className="material-symbols-outlined text-[#D4AF37] text-[22px] shrink-0">
                          play_circle
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Editorial Preview of The Gazette */}
              <div className="luxury-card-blush p-6 space-y-3.5">
                <div className="text-xs font-medium text-[#B76E79] tracking-[0.16em]">
                  Maison Editorial Journal
                </div>
                <h3 className="font-display text-[28px] font-bold tracking-wide text-[#0A0A0A] leading-tight">
                  The Sanctuary <span className="italic font-normal text-[#B76E79]">Gazette</span>
                </h3>
                <p className="text-xs sm:text-sm text-[#5C544E] leading-relaxed">
                  Curated legal briefings on Zero-FIR rights, digital impersonation safeguards, and late-evening city travel etiquette.
                </p>
                <button
                  type="button"
                  onClick={() => onChangeSubView('gazette')}
                  className="btn-luxury px-6 font-medium text-xs sm:text-sm inline-flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px] text-[#D4AF37]">
                    auto_stories
                  </span>
                  <span>Read The Gazette</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ======================== 2. CIRCLE COMMENTS VIEW ======================== */}
        {subView === 'comments' && (
          <motion.div
            key="comments-view"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="max-w-3xl mx-auto space-y-5"
          >
            {currentReel && (
              <div className="luxury-card p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-12 h-16 rounded-[14px] overflow-hidden border border-[#F0E6DC] shrink-0">
                    <ResilientImage
                      src={currentReel.thumbUrl}
                      alt={currentReel.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs text-[#8C6D1F] font-medium">
                      {currentReel.topic} · {currentReel.duration}
                    </div>
                    <h2 className="font-display font-bold text-base sm:text-lg text-[#0A0A0A] truncate">
                      {currentReel.title}
                    </h2>
                    <p className="text-xs text-[#5C544E] truncate">{currentReel.instructor}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onChangeSubView('reels')}
                  className="btn-luxury-outline px-5 text-xs font-medium shrink-0 flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                  <span>Back to Reel</span>
                </button>
              </div>
            )}

            <form
              onSubmit={handleAddComment}
              noValidate
              className="luxury-card p-5 space-y-3"
            >
              <label htmlFor="new-reel-comment" className="block text-xs font-medium text-[#0A0A0A]">
                Share a reflection or safety question
              </label>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <input
                  id="new-reel-comment"
                  type="text"
                  value={commentText}
                  onChange={(e) => {
                    setCommentText(e.target.value);
                    if (commentError) setCommentError('');
                  }}
                  placeholder="Share how you practiced this technique or suggest a topic..."
                  className="flex-1 min-h-[52px] px-5 rounded-full bg-[#FAF3EB]/65 border border-[#F0E6DC] text-sm text-[#0A0A0A] placeholder:text-[#5C544E]/60 focus:outline-none focus:border-[#D4AF37]"
                />
                <button
                  type="submit"
                  className="btn-luxury px-7 font-medium text-xs sm:text-sm flex items-center justify-center gap-2 shrink-0"
                >
                  <span className="material-symbols-outlined text-[18px] text-[#D4AF37]">send</span>
                  <span>Post Note</span>
                </button>
              </div>
              {commentError && <p className="text-xs text-[#9E2A3B] pl-2">{commentError}</p>}
            </form>

            <div className="flex items-center justify-between px-1">
              <div className="font-display text-xl font-bold text-[#0A0A0A]">
                Circle Notes · <span className="text-[#8C6D1F] tabular-nums">{comments.length}</span>
              </div>
              <button
                type="button"
                onClick={() => setCommentSort((s) => (s === 'top' ? 'recent' : 'top'))}
                className="min-h-[42px] px-4 rounded-full bg-[#FFFCF8] border border-[#F0E6DC] text-xs font-medium text-[#5C544E] hover:text-[#0A0A0A] hover:border-[#D4AF37] flex items-center gap-1 transition-all"
              >
                <span>Sort: {commentSort === 'top' ? 'Most Appreciated' : 'Newest First'}</span>
                <span className="material-symbols-outlined text-[16px]">swap_vert</span>
              </button>
            </div>

            <div className="space-y-3.5">
              {sortedComments.length === 0 ? (
                <div className="luxury-card p-10 text-center space-y-2">
                  <span className="material-symbols-outlined text-4xl text-[#D4AF37]">
                    chat_bubble_outline
                  </span>
                  <h3 className="font-bold text-sm text-[#0A0A0A]">No comments yet</h3>
                  <p className="text-xs text-[#5C544E]">
                    Be the first to write a reflection, question, or technique tip above!
                  </p>
                </div>
              ) : (
                sortedComments.map((c) => (
                  <motion.article
                    key={c.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={c.verifiedRole ? 'luxury-card-blush p-5' : 'luxury-card p-5'}
                  >
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-full overflow-hidden border border-[#D4AF37]/50 shrink-0">
                      <ResilientImage
                        src={c.avatarUrl}
                        alt={c.author}
                        className="w-full h-full object-cover"
                        fallbackIcon="person"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-[#0A0A0A]">{c.author}</span>
                            {c.verifiedRole && (
                              <span className="text-xs font-medium text-[#8C6D1F]">
                                · {c.verifiedRole}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-[#5C544E]">
                            {c.saevyId} · {c.timeAgo}
                          </div>
                        </div>
                        {c.badgeText && (
                          <span className="text-xs font-medium text-[#B76E79]">{c.badgeText}</span>
                        )}
                      </div>

                      {editingCommentId === c.id ? (
                        <div className="mt-2 space-y-2">
                          <textarea
                            value={editingCommentText}
                            onChange={(e) => setEditingCommentText(e.target.value)}
                            rows={2}
                            className="w-full p-2.5 rounded-xl bg-surface-container border border-[#D4AF37] text-xs text-on-surface outline-none"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (!editingCommentText.trim()) return;
                                onUpdateComments((prev) =>
                                  prev.map((item) =>
                                    item.id === c.id ? { ...item, body: editingCommentText.trim() } : item
                                  )
                                );
                                setEditingCommentId(null);
                                onShowToast('Comment updated');
                              }}
                              className="px-3 py-1 rounded-lg bg-[#171412] dark:bg-[#D4AF37] text-white dark:text-black text-xs font-semibold"
                            >
                              Save Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingCommentId(null)}
                              className="px-3 py-1 rounded-lg bg-surface-container text-xs text-on-surface-variant"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-[#0A0A0A] mt-2 leading-relaxed">{c.body}</p>
                      )}

                      <div className="flex items-center gap-4 mt-3 text-xs text-[#5C544E] flex-wrap">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateComments((prev) =>
                              prev.map((item) =>
                                item.id === c.id
                                  ? {
                                      ...item,
                                      likedByMe: !item.likedByMe,
                                      likes: item.likedByMe ? item.likes - 1 : item.likes + 1,
                                    }
                                  : item
                              )
                            )
                          }
                          className={`min-h-[32px] flex items-center gap-1.5 font-medium transition-colors ${
                            c.likedByMe ? 'text-[#B76E79]' : 'hover:text-[#0A0A0A]'
                          }`}
                        >
                          <span
                            className={`material-symbols-outlined text-[16px] ${
                              c.likedByMe ? 'material-symbols-filled' : ''
                            }`}
                          >
                            favorite
                          </span>
                          <span className="tabular-nums">{c.likes}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setEditingCommentId(c.id);
                            setEditingCommentText(c.body);
                          }}
                          className="min-h-[32px] flex items-center gap-1 hover:text-[#0A0A0A] transition-colors"
                        >
                          <span className="material-symbols-outlined text-[15px]">edit</span>
                          <span>Edit</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setReplyingToId((curr) => (curr === c.id ? null : c.id))
                          }
                          className="min-h-[32px] flex items-center gap-1.5 hover:text-[#0A0A0A] transition-colors"
                        >
                          <span className="material-symbols-outlined text-[16px]">
                            chat_bubble_outline
                          </span>
                          <span>Reply ({c.repliesCount})</span>
                        </button>

                        {confirmDeleteCommentId === c.id ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                onUpdateComments((prev) => prev.filter((item) => item.id !== c.id));
                                setConfirmDeleteCommentId(null);
                                onShowToast('Comment removed');
                              }}
                              className="min-h-[30px] px-3 rounded-full bg-[#9E2A3B] text-[#FFFCF8] font-medium"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteCommentId(null)}
                              className="min-h-[30px] px-2 text-[#5C544E] hover:text-[#0A0A0A]"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteCommentId(c.id)}
                            className="min-h-[32px] flex items-center gap-1 hover:text-[#9E2A3B] transition-colors"
                          >
                            <span className="material-symbols-outlined text-[15px]">delete</span>
                            <span>Delete</span>
                          </button>
                        )}
                      </div>

                      {c.replies && c.replies.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-[#F0E6DC] space-y-2">
                          {c.replies.map((rep) => (
                            <div
                              key={rep.id}
                              className="text-xs bg-[#FAF3EB]/70 rounded-[16px] p-3 border border-[#F0E6DC]"
                            >
                              <span className="font-semibold text-[#0A0A0A]">{rep.author}</span>{' '}
                              <span className="text-[#5C544E]">· {rep.timeAgo}</span>
                              <p className="text-[#0A0A0A] mt-1">{rep.body}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      <AnimatePresence>
                        {replyingToId === c.id && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-3 flex items-center gap-2 overflow-hidden"
                          >
                            <input
                              type="text"
                              value={replyDraft}
                              onChange={(e) => setReplyDraft(e.target.value)}
                              placeholder={`Reply to ${c.author}...`}
                              className="flex-1 min-h-[44px] px-4 rounded-full bg-[#FAF3EB]/70 border border-[#F0E6DC] text-xs text-[#0A0A0A] focus:outline-none focus:border-[#D4AF37]"
                            />
                            <button
                              type="button"
                              onClick={() => handleAddReply(c.id)}
                              className="min-h-[44px] px-5 rounded-full bg-[#0A0A0A] text-[#FFFCF8] text-xs font-medium"
                            >
                              Reply
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </motion.article>
              ))
            )}
            </div>
          </motion.div>
        )}

        {/* ======================== 3. THE GAZETTE VIEW ======================== */}
        {subView === 'gazette' && (
          <motion.div
            key="gazette-view"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="space-y-6"
          >
            <div className="luxury-card p-7 sm:p-10 text-center space-y-4">
              <div className="text-xs font-medium tracking-[0.22em] text-[#B76E79]">
                Maison Saevy Editorial Journal
              </div>
              <h2 className="font-display text-[30px] sm:text-[38px] font-bold tracking-wide text-[#0A0A0A]">
                Women&rsquo;s Sanctuary <span className="italic font-normal text-[#B76E79]">Gazette</span>
              </h2>
              <p className="text-sm text-[#5C544E] max-w-lg mx-auto leading-relaxed">
                Refined legal briefings, evening transit guides, and personal digital composure curated for modern city life.
              </p>
              <div className="flex items-center justify-center gap-2 flex-wrap pt-2">
                {['All', 'Transit Patrols', 'Cyber Sanctuary', 'Legal Mandate'].map((cat) => {
                  const active = gazetteFilter === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setGazetteFilter(cat)}
                      className={`min-h-[46px] px-5 rounded-full text-xs font-medium tracking-wide transition-all active:scale-[0.98] ${
                        active
                          ? 'bg-[#0A0A0A] text-[#FFFCF8] border border-[#D4AF37]/50 shadow-sm'
                          : 'bg-[#FAF3EB]/80 text-[#5C544E] border border-[#F0E6DC] hover:text-[#0A0A0A] hover:border-[#D4AF37]/50'
                      }`}
                    >
                      {cat === 'All' ? 'All Stories' : cat}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="luxury-card-blush p-6 sm:p-7 space-y-4">
              <div className="flex items-center justify-between text-xs text-[#8C6D1F] font-medium flex-wrap gap-2">
                <span className="tracking-wider">Evening Transit Note</span>
                <span className="text-[#5C544E]">Boulevard Corridor · 25m ago</span>
              </div>
              <h3 className="font-display text-2xl sm:text-[28px] font-bold tracking-wide text-[#0A0A0A] leading-snug">
                Evening Escort Desks &amp; Illuminated Concourses Along Corridor 18–29
              </h3>
              <p className="text-sm text-[#5C544E] leading-relaxed">
                Dedicated evening transit hosts and well-lit concourse lounges remain open past 21:00 hrs at Exit 3 hubs for solo travelers.
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard
                      ?.writeText('Metro Corridor Sector 18-29 Evening Concourse Guide')
                      .catch(() => {});
                    onShowToast('Editorial note copied to clipboard');
                  }}
                  className="btn-luxury px-6 text-xs sm:text-sm font-medium"
                >
                  Share Story
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDirectiveSaved((s) => !s);
                    onShowToast(
                      directiveSaved ? 'Removed from Reading List' : 'Saved to Reading List'
                    );
                  }}
                  className="btn-luxury-outline px-6 text-xs sm:text-sm font-medium"
                >
                  {directiveSaved ? 'Saved in Suite' : 'Save Story'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {filteredGazette.map((art) => (
                <article
                  key={art.id}
                  className="luxury-card overflow-hidden flex flex-col justify-between"
                >
                  <div
                    className={`h-44 p-5 flex flex-col justify-between relative overflow-hidden border-b border-[#F0E6DC] ${
                      art.visualTheme === 'cyber'
                        ? 'bg-gradient-to-br from-[#FFE4E6]/85 via-[#FFF8F0] to-[#FBF4DF]/80'
                        : art.visualTheme === 'scales'
                          ? 'bg-gradient-to-br from-[#FBF4DF] via-[#FFF8F0] to-[#FAF1E6]'
                          : 'bg-gradient-to-br from-[#E8EDE8] via-[#FFF8F0] to-[#FAF1E6]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-medium text-[#8C6D1F] tracking-wide relative z-10">
                      <span>{art.tagLabel}</span>
                      <span className="text-[#5C544E]">{art.readTime}</span>
                    </div>
                    <div className="my-auto flex items-center justify-center relative z-10">
                      <div className="w-15 h-15 rounded-full bg-[#FFFCF8] border border-[#D4AF37]/45 shadow-[0_6px_20px_rgba(212,175,55,0.14)] flex items-center justify-center text-[#0A0A0A]">
                        <span className="material-symbols-outlined text-[28px] text-[#D4AF37]">
                          {art.visualTheme === 'cyber'
                            ? 'shield_lock'
                            : art.visualTheme === 'scales'
                              ? 'balance'
                              : 'local_pharmacy'}
                        </span>
                      </div>
                    </div>
                    <div className="text-xs text-[#5C544E] relative z-10">
                      {art.kicker} · {art.timeAgo}
                    </div>
                  </div>

                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <h4 className="font-display text-xl font-bold text-[#0A0A0A] leading-snug">
                        {art.title}
                      </h4>
                      <p className="text-xs sm:text-sm text-[#5C544E] leading-relaxed">
                        {art.summary}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-3 border-t border-[#F0E6DC]">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateGazette((prev) =>
                            prev.map((g) => (g.id === art.id ? { ...g, saved: !g.saved } : g))
                          )
                        }
                        className={`min-h-[44px] px-4 rounded-full text-xs font-medium flex items-center gap-1.5 border transition-all ${
                          art.saved
                            ? 'bg-[#FAF3EB] border-[#D4AF37] text-[#0A0A0A]'
                            : 'bg-[#FFFCF8] border-[#F0E6DC] text-[#5C544E] hover:text-[#0A0A0A]'
                        }`}
                      >
                        <span
                          className={`material-symbols-outlined text-[17px] ${
                            art.saved ? 'material-symbols-filled text-[#D4AF37]' : ''
                          }`}
                        >
                          bookmark
                        </span>
                        <span>{art.saved ? 'Saved' : 'Save'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setReadingArticle(art)}
                        className="min-h-[44px] px-5 rounded-full bg-[#0A0A0A] text-[#FFFCF8] border border-[#D4AF37]/40 text-xs font-medium hover:border-[#D4AF37] active:scale-[0.98] transition-all"
                      >
                        {art.actionLabel}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Practice Muscle Memory Modal */}
      <AnimatePresence>
        {practiceReel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A0A0A]/40 backdrop-blur-md no-print"
            role="dialog"
            aria-modal="true"
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="w-full max-w-md luxury-card p-6 sm:p-7 space-y-5 bg-[#FFFCF8]"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#8C6D1F] tracking-wider">
                  Guided Rehearsal
                </span>
                <button
                  type="button"
                  onClick={() => setPracticeReel(null)}
                  className="w-9 h-9 rounded-full bg-[#FAF3EB] border border-[#F0E6DC] flex items-center justify-center text-[#5C544E] hover:text-[#0A0A0A]"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
              <h3 className="font-display text-2xl font-bold text-[#0A0A0A]">
                {practiceReel.title}
              </h3>
              <div className="p-4 rounded-[20px] bg-[#FAF3EB]/80 border border-[#F0E6DC] space-y-2">
                <div className="text-xs font-semibold text-[#D4AF37]">
                  Step 0{practiceStepIdx + 1} of 0{practiceReel.drillSteps.length}
                </div>
                <p className="text-sm text-[#0A0A0A] leading-relaxed">
                  {practiceReel.drillSteps[practiceStepIdx]}
                </p>
              </div>
              <div className="flex items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  disabled={practiceStepIdx === 0}
                  onClick={() => setPracticeStepIdx((i) => Math.max(0, i - 1))}
                  className="btn-luxury-outline px-5 text-xs font-medium disabled:opacity-40"
                >
                  Previous
                </button>
                {practiceStepIdx < practiceReel.drillSteps.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => setPracticeStepIdx((i) => i + 1)}
                    className="btn-luxury px-6 text-xs font-medium"
                  >
                    Next Step
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setPracticeReel(null);
                      onShowToast('Technique rehearsal complete');
                    }}
                    className="btn-luxury px-6 text-xs font-medium"
                  >
                    Complete
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create & Strictly Moderated Women's Safety Reel Modal */}
      <AnimatePresence>
        {createOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A0A0A]/50 backdrop-blur-md no-print overflow-y-auto"
            role="dialog"
            aria-modal="true"
          >
            <motion.form
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onSubmit={(e) => void handleCreateReel(e)}
              noValidate
              className="w-full max-w-md luxury-card p-6 sm:p-7 space-y-4 bg-[#FFFCF8] my-auto"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-medium text-[#D4AF37]">
                    AI-Moderated Women&rsquo;s Safety Feed
                  </div>
                  <h3 className="font-display text-2xl font-bold text-[#0A0A0A]">
                    Create Safety Reel
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="w-9 h-9 rounded-full bg-[#FAF3EB] border border-[#F0E6DC] flex items-center justify-center text-[#5C544E] hover:text-[#0A0A0A]"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <p className="text-xs text-[#5C544E] leading-relaxed">
                <strong>Content Policy:</strong> Only Women&rsquo;s Safety Awareness, Self-Defence, Legal Rights, Cyber Safety &amp; First Aid reels are allowed. Comedy, memes, pranks, entertainment, or abusive posts are blocked automatically.
              </p>

              <div className="space-y-3.5">
                <div>
                  <label className="block text-xs font-medium text-[#0A0A0A] mb-1">
                    Safety Category *
                  </label>
                  <select
                    value={newTopic}
                    onChange={(e) => setNewTopic(e.target.value as ReelItem['topic'])}
                    className="w-full min-h-[48px] px-4 rounded-full bg-[#FAF3EB]/70 border border-[#F0E6DC] text-sm text-[#0A0A0A] focus:outline-none focus:border-[#D4AF37]"
                  >
                    <option value="Self-Defence">Self-Defence</option>
                    <option value="Legal Rights">Legal Rights</option>
                    <option value="Cyber Safety">Cyber Safety</option>
                    <option value="First Aid">First Aid</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#0A0A0A] mb-1">
                    Upload Short Video or Photo (Optional)
                  </label>
                  <label className="w-full min-h-[48px] px-4 rounded-full bg-[#FAF3EB]/70 border border-[#F0E6DC] hover:border-[#D4AF37] text-xs font-medium text-[#0A0A0A] flex items-center justify-between cursor-pointer">
                    <span className="truncate">
                      {newReelMediaName || 'Choose MP4/WebM video or safety photo...'}
                    </span>
                    <span className="material-symbols-outlined text-[18px] text-[#D4AF37]">
                      upload_file
                    </span>
                    <input
                      type="file"
                      accept="video/*,image/*"
                      className="hidden"
                      onChange={handleAttachReelMedia}
                    />
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#0A0A0A] mb-1">
                    Reel Title *
                  </label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => {
                      setNewTitle(e.target.value);
                      if (createError) setCreateError('');
                    }}
                    placeholder="e.g., Wrist Release & Cab Child-Lock Check"
                    className="w-full min-h-[48px] px-4 rounded-full bg-[#FAF3EB]/70 border border-[#F0E6DC] text-sm text-[#0A0A0A] focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#0A0A0A] mb-1">
                    Safety Awareness Description *
                  </label>
                  <textarea
                    rows={3}
                    value={newCaption}
                    onChange={(e) => {
                      setNewCaption(e.target.value);
                      if (createError) setCreateError('');
                    }}
                    placeholder="Explain the practical women's safety or self-defence technique..."
                    className="w-full p-4 rounded-[20px] bg-[#FAF3EB]/70 border border-[#F0E6DC] text-sm text-[#0A0A0A] focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#5C544E] mb-1">
                    Key Action Cue (Optional)
                  </label>
                  <input
                    type="text"
                    value={newStepTip}
                    onChange={(e) => setNewStepTip(e.target.value)}
                    placeholder="e.g., Check child-lock switch before closing door"
                    className="w-full min-h-[48px] px-4 rounded-full bg-[#FAF3EB]/70 border border-[#F0E6DC] text-sm text-[#0A0A0A] focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
                {createError && (
                  <p className="text-xs text-[#9E2A3B] font-medium leading-relaxed">{createError}</p>
                )}
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="btn-luxury-outline px-5 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isModeratingReel}
                  className="btn-luxury px-6 text-xs font-medium flex items-center gap-1.5 disabled:opacity-55"
                >
                  <span className="material-symbols-outlined text-[17px] text-[#D4AF37]">
                    verified
                  </span>
                  <span>{isModeratingReel ? 'Verifying Safety Policy...' : 'Publish Reel'}</span>
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Gazette Reader Modal */}
      <AnimatePresence>
        {readingArticle && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A0A0A]/40 backdrop-blur-md no-print"
            role="dialog"
            aria-modal="true"
          >
            <motion.div
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 16, opacity: 0 }}
              className="w-full max-w-lg luxury-card p-7 space-y-4 bg-[#FFFCF8]"
            >
              <div className="flex items-center justify-between text-xs text-[#B76E79] tracking-wider">
                <span>{readingArticle.kicker}</span>
                <button
                  type="button"
                  onClick={() => setReadingArticle(null)}
                  className="w-9 h-9 rounded-full bg-[#FAF3EB] border border-[#F0E6DC] flex items-center justify-center text-[#5C544E] hover:text-[#0A0A0A]"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
              <h3 className="font-display text-2xl sm:text-[28px] font-bold text-[#0A0A0A] leading-snug">
                {readingArticle.title}
              </h3>
              <p className="text-sm text-[#0A0A0A] leading-relaxed">{readingArticle.summary}</p>
              <div className="p-4 rounded-[20px] bg-[#FAF3EB]/75 border border-[#F0E6DC] text-xs text-[#5C544E] leading-relaxed">
                <strong className="text-[#0A0A0A]">Key Note:</strong> Verify urgent official notices independently via public lines (112 for emergencies, 1930 for cyber protection, 181 for women&rsquo;s support).
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setReadingArticle(null)}
                  className="btn-luxury px-7 text-xs sm:text-sm font-medium"
                >
                  Close Essay
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
