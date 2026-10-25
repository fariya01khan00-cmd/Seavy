import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AppSettings,
  AtelierSubView,
  CommentItem,
  ConciergeAttachment,
  ConciergeMessage,
  FamilyEmergencyContact,
  GazetteArticle,
  HavenSubView,
  HealthSubView,
  HomeSubView,
  MainTab,
  ReelItem,
  SafetyPhraseAction,
  SelfSubView,
  UserProfile,
} from './types';
import {
  ALL_DIALECTS,
  ATELIER_PRODUCTS,
  DEFAULT_SETTINGS,
  DEFAULT_USER_PROFILE,
  INITIAL_COMMENTS,
  INITIAL_CONCIERGE_MESSAGES,
  INITIAL_FAMILY_CONTACTS,
  INITIAL_GAZETTE_ARTICLES,
  INITIAL_REELS,
  STITCH_ASSETS,
} from './data/demoData';
import { ResilientImage } from './components/ResilientImage';
import { HomeSanctuary } from './components/HomeSanctuary';
import { HavenView } from './components/HavenView';
import { HealthVaultView } from './components/HealthVaultView';
import { AtelierView } from './components/AtelierView';
import { SelfProfileSettingsView } from './components/SelfProfileSettingsView';
import { ChatView } from './components/ChatView';
import { SOSModal } from './components/SOSModal';
import { StealthCalculatorModal } from './components/StealthCalculatorModal';
import { RoyalOnboardingGate } from './components/RoyalOnboardingGate';
import {
  MediaCaptureAndNotesModal,
  StudioModalTab,
} from './components/MediaCaptureAndNotesModal';
import { getUiLang, UI_COPY } from './utils/i18n';
import { stopAllSpeechSynthesis, stopAnyActiveRecognition } from './utils/speechCoordinator';
import { API_URL, apiFetch } from './config/api';

const STORAGE_KEYS = {
  savedHealth: 'saevy_proto_saved_health_care_v1',
  familyContacts: 'saevy_royal_family_contacts_v3',
  profile: 'saevy_royal_profile_v3',
  settings: 'saevy_royal_settings_v3',
  reels: 'saevy_royal_reels_v3',
  comments: 'saevy_luxury_comments_v2',
  gazette: 'saevy_luxury_gazette_v2',
  wishlist: 'saevy_proto_wishlist_v1',
  cart: 'saevy_proto_cart_v1',
  chat: 'saevy_royal_concierge_chat_v3',
  royalOnboarded: 'saevy_royal_onboarded_v3',
};

const LEGACY_HEALTH_STORAGE_KEYS = [
  'saevy_proto_health_entries_v1',
  'saevy_proto_visit_summary_v1',
];

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default function App() {
  // Navigation state
  const [activeTab, setActiveTab] = useState<MainTab>('home');
  const [homeSub, setHomeSub] = useState<HomeSubView>('reels');
  const [havenSub, setHavenSub] = useState<HavenSubView>('helplines');
  const [healthSub, setHealthSub] = useState<HealthSubView>('overview');
  const [atelierSub, setAtelierSub] = useState<AtelierSubView>('catalog');
  const [selfSub, setSelfSub] = useState<SelfSubView>('profile');

  // Royal 3-Step Main Entrance Gate (Saevy Logo -> 52 Languages + Mic/Speaker Test -> Login/OTP)
  const [hasCompletedRoyalGate, setHasCompletedRoyalGate] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEYS.royalOnboarded) === '1';
    } catch {
      return false;
    }
  });
  const [royalGateOpen, setRoyalGateOpen] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEYS.royalOnboarded) !== '1';
    } catch {
      return true;
    }
  });
  const [royalGateStep, setRoyalGateStep] = useState<
    'royal_logo' | 'language_voice' | 'login_otp'
  >('royal_logo');

  // Modals & Toast
  const [sosOpen, setSosOpen] = useState(false);
  const [autoTriggerPhraseAlarm, setAutoTriggerPhraseAlarm] = useState(false);
  const [autoTriggerSilentSos, setAutoTriggerSilentSos] = useState(false);
  const [stealthCalcOpen, setStealthCalcOpen] = useState(false);

  // Camera / Video / Audio Studio + Personal Quick Notes Modal
  const [studioModalOpen, setStudioModalOpen] = useState(false);
  const [studioModalTab, setStudioModalTab] = useState<StudioModalTab>('photo');
  const [studioAutoStart, setStudioAutoStart] = useState(false);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);

  // Persistent Local State
  const [savedHealthIds, setSavedHealthIds] = useState<string[]>(() =>
    loadFromStorage(STORAGE_KEYS.savedHealth, ['tip-hydration', 'rem-ginger-tulsi'])
  );
  const [familyContacts, setFamilyContacts] = useState<FamilyEmergencyContact[]>(() =>
    loadFromStorage(STORAGE_KEYS.familyContacts, INITIAL_FAMILY_CONTACTS)
  );
  const [profile, setProfile] = useState<UserProfile>(() => {
    const loaded = loadFromStorage<Partial<UserProfile>>(STORAGE_KEYS.profile, DEFAULT_USER_PROFILE);
    return {
      ...DEFAULT_USER_PROFILE,
      ...loaded,
      activeOrder: loaded?.activeOrder || DEFAULT_USER_PROFILE.activeOrder,
      mockOrders: loaded?.mockOrders && loaded.mockOrders.length > 0 ? loaded.mockOrders : DEFAULT_USER_PROFILE.mockOrders,
    };
  });
  const [settings, setSettings] = useState<AppSettings>(() => ({
    ...DEFAULT_SETTINGS,
    ...loadFromStorage(STORAGE_KEYS.settings, DEFAULT_SETTINGS),
  }));
  const [reels, setReels] = useState<ReelItem[]>(() =>
    loadFromStorage(STORAGE_KEYS.reels, INITIAL_REELS)
  );
  const [comments, setComments] = useState<CommentItem[]>(() =>
    loadFromStorage(STORAGE_KEYS.comments, INITIAL_COMMENTS)
  );
  const [gazette, setGazette] = useState<GazetteArticle[]>(() =>
    loadFromStorage(STORAGE_KEYS.gazette, INITIAL_GAZETTE_ARTICLES)
  );
  const [conciergeMessages, setConciergeMessages] = useState<ConciergeMessage[]>(() =>
    loadFromStorage(STORAGE_KEYS.chat, INITIAL_CONCIERGE_MESSAGES)
  );
  const [wishlistIds, setWishlistIds] = useState<string[]>(() =>
    loadFromStorage(STORAGE_KEYS.wishlist, [
      'item-ring',
      'item-siren',
      'item-pepper-gel',
      'item-sanitary-kit',
    ])
  );
  const [cartQuantities, setCartQuantities] = useState<Record<string, number>>(() =>
    loadFromStorage(STORAGE_KEYS.cart, { 'item-ring': 1, 'item-pepper-gel': 1 })
  );

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 2900);
    return () => clearTimeout(t);
  }, [toastMessage]);

  // Listen for Google Maps Platform Demo Key Quota Event
  useEffect(() => {
    const onQuotaExceeded = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  // Clear legacy symptom/visit-summary keys on mount
  useEffect(() => {
    LEGACY_HEALTH_STORAGE_KEYS.forEach((k) => {
      try {
        window.localStorage.removeItem(k);
      } catch {}
    });
  }, []);

  // Hydrate persisted contacts and user profile from `${API_URL}/api/...` on mount
  const hasHydratedBackendRef = useRef(false);
  useEffect(() => {
    let cancelled = false;

    const hydrateFromBackend = async () => {
      try {
        const [contactsRes, profileRes] = await Promise.allSettled([
          apiFetch(`${API_URL}/api/contacts`),
          apiFetch(`${API_URL}/api/profile`),
        ]);

        if (!cancelled && contactsRes.status === 'fulfilled' && contactsRes.value.ok) {
          const data = (await contactsRes.value.json()) as {
            contacts?: FamilyEmergencyContact[];
          };
          if (Array.isArray(data?.contacts) && data.contacts.length > 0) {
            setFamilyContacts(data.contacts);
          }
        }

        if (!cancelled && profileRes.status === 'fulfilled' && profileRes.value.ok) {
          const data = (await profileRes.value.json()) as {
            profile?: Partial<UserProfile> | null;
          };
          if (data?.profile && typeof data.profile === 'object' && data.profile.fullName) {
            setProfile((prev) => ({ ...prev, ...data.profile }));
          }
        }
      } catch {
        // Offline or local-only mode: keep localStorage state
      } finally {
        if (!cancelled) {
          hasHydratedBackendRef.current = true;
        }
      }
    };

    void hydrateFromBackend();
    return () => {
      cancelled = true;
    };
  }, []);

  // Sync to localStorage & `${API_URL}/api/...`
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.savedHealth, JSON.stringify(savedHealthIds));
    } catch {}
  }, [savedHealthIds]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.familyContacts, JSON.stringify(familyContacts));
    } catch {}
    if (!hasHydratedBackendRef.current) return;
    apiFetch(`${API_URL}/api/contacts`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contacts: familyContacts }),
    }).catch(() => {});
  }, [familyContacts]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(profile));
    } catch {}
    if (!hasHydratedBackendRef.current) return;
    apiFetch(`${API_URL}/api/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile }),
    }).catch(() => {});
  }, [profile]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
    } catch {}
  }, [settings]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.reels, JSON.stringify(reels));
    } catch {}
  }, [reels]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.comments, JSON.stringify(comments));
    } catch {}
  }, [comments]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.gazette, JSON.stringify(gazette));
    } catch {}
  }, [gazette]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.chat, JSON.stringify(conciergeMessages));
    } catch {}
  }, [conciergeMessages]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.wishlist, JSON.stringify(wishlistIds));
    } catch {}
  }, [wishlistIds]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.cart, JSON.stringify(cartQuantities));
    } catch {}
  }, [cartQuantities]);

  // Apply Royal Dark / Cashmere Light appearance & accessible text size to root HTML element
  const isDarkTheme = useMemo(() => {
    if (settings.appearance === 'dark') return true;
    if (settings.appearance === 'light') return false;
    return (
      typeof window !== 'undefined' &&
      Boolean(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
    );
  }, [settings.appearance]);

  useEffect(() => {
    const html = document.documentElement;
    if (settings.largeText) {
      html.classList.add('text-scale-large');
    } else {
      html.classList.remove('text-scale-large');
    }

    if (isDarkTheme) {
      html.classList.add('dark');
      html.classList.remove('theme-light-sanctuary');
    } else {
      html.classList.remove('dark');
      html.classList.add('theme-light-sanctuary');
    }
  }, [isDarkTheme, settings.largeText]);

  // 3× Rapid Press Shortcut Listener (Shift key pressed 3× within 1.1s triggers Silent SOS or Louder SOS)
  const shiftTapTimesRef = useRef<number[]>([]);
  useEffect(() => {
    if (royalGateOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Shift' || e.repeat) return;
      const now = Date.now();
      const recent = [...shiftTapTimesRef.current, now].filter((t) => now - t < 1100);
      shiftTapTimesRef.current = recent;

      if (recent.length >= 3) {
        shiftTapTimesRef.current = [];
        if (settings.powerTriplePressMode === 'louder_sos') {
          setAutoTriggerSilentSos(false);
          setAutoTriggerPhraseAlarm(true);
          setSosOpen(true);
          showToast('3× Rapid Press: Louder SOS Sanctuary activated');
        } else {
          setAutoTriggerPhraseAlarm(false);
          setAutoTriggerSilentSos(true);
          setSosOpen(true);
          showToast('3× Rapid Press: Zero-Noise Silent SOS + Bluetooth Alert active');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [royalGateOpen, settings.powerTriplePressMode, showToast]);

  const activeDialect = useMemo(
    () =>
      ALL_DIALECTS.find((d) => d.code === settings.selectedDialectCode) ||
      ALL_DIALECTS.find((d) => d.code === 'en')!,
    [settings.selectedDialectCode]
  );

  const uiLang = getUiLang(settings.selectedDialectCode);
  const copy = UI_COPY[uiLang];

  // Toggle between Royal Dark & Cashmere Light
  const handleToggleTheme = () => {
    const next = isDarkTheme ? 'light' : 'dark';
    setSettings((s) => ({ ...s, appearance: next }));
    showToast(
      next === 'dark'
        ? 'Royal Obsidian Velvet Dark theme active'
        : 'Classy Cashmere Light theme active'
    );
  };

  // Open Saevy Logo SOS Sanctuary
  const handleOpenSaevySos = () => {
    setAutoTriggerPhraseAlarm(false);
    setAutoTriggerSilentSos(false);
    setSosOpen(true);
  };

  // Execute any of the 9 Whisper / Far-Field Safety Phrase Code-Word Actions
  const handleExecuteSafetyPhraseAction = useCallback(
    (action: SafetyPhraseAction) => {
      switch (action) {
        case 'record_audio':
          setStudioModalTab('audio');
          setStudioAutoStart(true);
          setStudioModalOpen(true);
          showToast('Code Word verified: Recording emergency voice evidence');
          break;
        case 'record_video':
          setStudioModalTab('video');
          setStudioAutoStart(true);
          setStudioModalOpen(true);
          showToast('Code Word verified: Recording emergency video evidence');
          break;
        case 'take_photo':
          setStudioModalTab('photo');
          setStudioAutoStart(true);
          setStudioModalOpen(true);
          showToast('Code Word verified: Capturing instant camera snapshot');
          break;
        case 'share_location':
        case 'sms_favourites':
          setAutoTriggerPhraseAlarm(false);
          setAutoTriggerSilentSos(true);
          setSosOpen(true);
          showToast('Code Word verified: Silent SOS GPS + Favourites & Bluetooth alert active');
          break;
        case 'call_parents': {
          const primary =
            familyContacts.find((c) => c.isFavourite) || familyContacts[0];
          setActiveTab('haven');
          setHavenSub('parent_call');
          if (primary?.phone) {
            showToast(
              `Code Word verified: Parent Call Companion ready · Dial ${primary.name} (${primary.phone})`
            );
          } else {
            showToast('Code Word verified: Realistic Parent on Call companion opened');
          }
          break;
        }
        case 'call_police':
          setAutoTriggerPhraseAlarm(false);
          setAutoTriggerSilentSos(true);
          setSosOpen(true);
          showToast('Code Word verified: Emergency 112 & Silent GPS lock ready');
          try {
            window.location.href = 'tel:112';
          } catch {}
          break;
        case 'open_support':
          setActiveTab('haven');
          setHavenSub('helplines');
          showToast('Code Word verified: 24/7 Helpline Sanctuary opened');
          break;
        case 'play_alarm':
          setAutoTriggerSilentSos(false);
          setAutoTriggerPhraseAlarm(true);
          setSosOpen(true);
          break;
        default:
          setSosOpen(true);
      }
    },
    [familyContacts, showToast]
  );

  // Send query or media attachment straight into Multimodal AI Concierge
  const handleAskAiWithPrompt = useCallback(
    (promptText: string, attachment?: ConciergeAttachment) => {
      const trimmed = promptText.trim();
      if (!trimmed && !attachment) return;
      const userMsg: ConciergeMessage = {
        id: `u-${Date.now()}`,
        sender: 'user',
        text: trimmed || 'Please inspect this safety attachment and advise me.',
        timestamp: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        lang: uiLang,
        attachment,
      };
      setConciergeMessages((prev) => [...prev, userMsg]);
      setActiveTab('haven');
      setHavenSub('concierge');
    },
    [uiLang]
  );

  // Quick navigation from front-page Omnisearch
  const handleQuickNavigate = useCallback((tab: MainTab, sub?: string) => {
    setActiveTab(tab);
    if (tab === 'home' && sub) setHomeSub(sub as HomeSubView);
    if (tab === 'haven' && sub) setHavenSub(sub as HavenSubView);
    if (tab === 'health' && sub) setHealthSub(sub as HealthSubView);
    if (tab === 'atelier' && sub) setAtelierSub(sub as AtelierSubView);
    if (tab === 'self' && sub) setSelfSub(sub as SelfSubView);
  }, []);

  // Handler for Saved Health Tips / Remedies / Doctors
  const handleToggleSavedHealthItem = (id: string, title: string) => {
    setSavedHealthIds((prev) => {
      const exists = prev.includes(id);
      showToast(exists ? `Removed "${title}" from saved` : `Saved "${title}" to Sanctuary`);
      return exists ? prev.filter((item) => item !== id) : [...prev, id];
    });
  };

  // Handlers for Wishlist & Cart
  const handleToggleWishlist = (id: string) => {
    setWishlistIds((prev) => {
      const exists = prev.includes(id);
      const item = ATELIER_PRODUCTS.find((p) => p.id === id);
      showToast(
        exists
          ? `${item?.title || 'Creation'} removed from Wishlist`
          : `${item?.title || 'Creation'} saved to Wishlist`
      );
      return exists ? prev.filter((x) => x !== id) : [...prev, id];
    });
  };

  const handleUpdateCartQty = (id: string, delta: number) => {
    setCartQuantities((prev) => {
      const nextQty = Math.max(0, (prev[id] || 0) + delta);
      const copyMap = { ...prev };
      if (nextQty === 0) {
        delete copyMap[id];
      } else {
        copyMap[id] = nextQty;
      }
      return copyMap;
    });
  };

  const handleMoveAllWishlistToCart = () => {
    setCartQuantities((prev) => {
      const copyMap = { ...prev };
      wishlistIds.forEach((id) => {
        copyMap[id] = (copyMap[id] || 0) + 1;
      });
      return copyMap;
    });
    const count = wishlistIds.length;
    setWishlistIds([]);
    showToast(`Moved ${count} item${count === 1 ? '' : 's'} to Atelier Bag`);
  };

  const handlePurgeLocalData = () => {
    stopAnyActiveRecognition();
    stopAllSpeechSynthesis();
    [...Object.values(STORAGE_KEYS), ...LEGACY_HEALTH_STORAGE_KEYS].forEach((k) => {
      try {
        window.localStorage.removeItem(k);
      } catch {}
    });
    setSavedHealthIds(['tip-hydration', 'rem-ginger-tulsi']);
    setFamilyContacts(INITIAL_FAMILY_CONTACTS);
    setProfile(DEFAULT_USER_PROFILE);
    setSettings(DEFAULT_SETTINGS);
    setReels(INITIAL_REELS);
    setComments(INITIAL_COMMENTS);
    setGazette(INITIAL_GAZETTE_ARTICLES);
    setConciergeMessages(INITIAL_CONCIERGE_MESSAGES);
    setWishlistIds(['item-ring', 'item-siren', 'item-pepper-gel', 'item-sanitary-kit']);
    setCartQuantities({ 'item-ring': 1, 'item-pepper-gel': 1 });
    setHasCompletedRoyalGate(false);
    showToast('Sanctuary preferences & local records restored');
  };

  const handleOpenQuickExit = () => {
    stopAnyActiveRecognition();
    stopAllSpeechSynthesis();
    setStealthCalcOpen(true);
  };

  const navItems: { id: MainTab; label: string; shortLabel: string; icon: string }[] = [
    { id: 'home', label: copy.navHome, shortLabel: copy.shortHome, icon: 'cottage' },
    { id: 'haven', label: copy.navHaven, shortLabel: copy.shortHaven, icon: 'shield' },
    { id: 'chat', label: 'Safety Chat', shortLabel: 'Chat', icon: 'chat' },
    { id: 'health', label: copy.navHealth, shortLabel: copy.shortHealth, icon: 'spa' },
    { id: 'atelier', label: copy.navAtelier, shortLabel: copy.shortAtelier, icon: 'diamond' },
    { id: 'self', label: copy.navSelf, shortLabel: copy.shortSelf, icon: 'person' },
  ];

  return (
    <div className="min-h-screen flex flex-col text-on-surface relative">
      {gmpQuotaExceeded && (
        <div className="bg-surface-container border-b border-[#D4AF37]/50 text-on-surface px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-[#D4AF37] hover:opacity-80"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Royal Obsidian & Champagne Gold Toast */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="fixed top-20 inset-x-4 z-50 flex justify-center pointer-events-none no-print"
            role="status"
            aria-live="polite"
          >
            <div className="px-5 py-3 rounded-full bg-[#120F1C]/95 border border-[#D4AF37]/55 backdrop-blur-xl shadow-[0_12px_36px_rgba(0,0,0,0.42)] flex items-center gap-2.5 text-xs sm:text-sm font-medium text-[#F6F1EA]">
              <span className="material-symbols-outlined text-[#D4AF37] text-[18px]">
                auto_awesome
              </span>
              <span>{toastMessage}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Royal Maison Header (Strict 3-Zone Contract) */}
      <header className="sticky top-0 z-40 h-[72px] bg-surface-container-low/90 backdrop-blur-2xl border-b border-outline-variant/60 px-4 sm:px-8 flex items-center justify-between gap-4 no-print">
        {/* Zone 1: Maison Wordmark */}
        <button
          type="button"
          onClick={() => {
            setActiveTab('home');
            setHomeSub('reels');
          }}
          className="flex items-center gap-3 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#D4AF37] rounded-full py-1"
        >
          <div className="w-10 h-10 rounded-full bg-[#13101E] border border-[#D4AF37]/55 flex items-center justify-center p-1.5 shadow-[0_4px_18px_rgba(212,175,55,0.22)] shrink-0">
            <ResilientImage
              src={STITCH_ASSETS.logoEmblem}
              alt="Saevy Royal Emblem"
              className="h-7 w-7 object-contain shrink-0"
              fallbackIcon="shield"
            />
          </div>
          <span className="font-display text-2xl font-semibold tracking-[0.06em] text-on-surface">
            Saevy
          </span>
        </button>

        {/* Zone 2: Clean Editorial Desktop Links */}
        <nav
          aria-label="Primary Navigation"
          className="hidden lg:flex items-center gap-8 text-sm font-medium"
        >
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`relative py-2 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#D4AF37] rounded ${
                  isActive
                    ? 'text-on-surface font-semibold'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {item.label}
                {isActive && (
                  <motion.span
                    layoutId="desktop-nav-underline"
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-5 h-[2px] bg-[#D4AF37] rounded-full shadow-[0_0_8px_rgba(212,175,55,0.65)]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Profile Avatar + Theme Switcher + Saevy Logo SOS Trigger */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setActiveTab('self');
              setSelfSub('profile');
            }}
            aria-label={`Edit profile for ${profile.fullName}`}
            title={`${profile.fullName} — Edit Profile & Photo`}
            className="w-11 h-11 rounded-full overflow-hidden border border-[#D4AF37]/70 hover:border-[#D4AF37] bg-surface-container shrink-0 transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-[#D4AF37]"
          >
            <ResilientImage
              src={profile.avatarUrl || STITCH_ASSETS.sarahAvatar}
              alt={profile.fullName}
              className="w-full h-full object-cover"
              fallbackIcon="person"
            />
          </button>

          <button
            type="button"
            onClick={handleToggleTheme}
            aria-label={isDarkTheme ? 'Switch to Cashmere Light theme' : 'Switch to Royal Dark theme'}
            title={isDarkTheme ? 'Switch to Cashmere Light' : 'Switch to Royal Dark'}
            className="w-11 h-11 rounded-full bg-surface-container border border-outline-variant/70 hover:border-[#D4AF37] flex items-center justify-center text-on-surface transition-all active:scale-95 focus-visible:outline-2 focus-visible:outline-[#D4AF37]"
          >
            <span className="material-symbols-outlined text-[20px] text-[#D4AF37]">
              {isDarkTheme ? 'light_mode' : 'dark_mode'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleOpenSaevySos}
            aria-label="Activate Saevy Logo SOS Sanctuary"
            title="Press Saevy Logo to open Silent or Louder SOS"
            className="min-h-[46px] pl-2 pr-4 rounded-full bg-gradient-to-r from-[#171226] via-[#241B38] to-[#171226] text-[#F6F1EA] text-xs sm:text-sm font-medium tracking-wide flex items-center gap-2.5 shadow-[0_6px_26px_rgba(212,175,55,0.25)] border border-[#D4AF37]/65 hover:border-[#D4AF37] active:scale-[0.98] transition-all whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#D4AF37]"
          >
            <span className="w-8 h-8 rounded-full bg-[#0E0B16] border border-[#D4AF37]/60 flex items-center justify-center p-1 shadow-[0_0_12px_rgba(212,175,55,0.35)]">
              <ResilientImage
                src={STITCH_ASSETS.logoEmblem}
                alt="Saevy SOS Emblem"
                className="w-5 h-5 object-contain"
                fallbackIcon="shield"
              />
            </span>
            <span>Saevy SOS</span>
          </button>
        </div>
      </header>

      {/* Delicate Whisper Ribbon: Dialect Safe Phrase, Bluetooth Peer Quick Link, EN/HI Switch & Camouflage */}
      <div className="bg-surface-container/80 border-b border-outline-variant/50 px-4 sm:px-8 py-2 text-xs text-on-surface-variant flex flex-wrap items-center justify-between gap-2 no-print">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[#D4AF37] font-medium shrink-0">{activeDialect.name}</span>
          <span aria-hidden="true" className="text-[#D4AF37]/70">·</span>
          <span className="truncate font-serif italic text-sm text-on-surface">
            {activeDialect.safePhrase}
          </span>
        </div>

        <div className="flex items-center gap-3 text-[11px] flex-wrap">
          {/* Quick Offline Bluetooth Peer Sanctuary Link */}
          <button
            type="button"
            onClick={() => {
              setActiveTab('haven');
              setHavenSub('bluetooth_peer');
            }}
            className="text-on-surface hover:text-[#D4AF37] font-medium whitespace-nowrap transition-colors flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[15px] text-[#D4AF37]">bluetooth_searching</span>
            <span>Bluetooth Mesh</span>
          </button>

          {/* Synchronized EN / हिन्दी Switch */}
          <div className="inline-flex items-center rounded-full bg-surface-container-low p-0.5 border border-outline-variant/70">
            <button
              type="button"
              onClick={() => {
                setSettings((s) => ({
                  ...s,
                  selectedDialectCode: 'en',
                  safetyPhraseLang: 'en-IN',
                }));
                showToast('English active across Sanctuary, Voice & Concierge');
              }}
              className={`px-3 py-1 rounded-full font-medium transition-all whitespace-nowrap ${
                uiLang === 'en'
                  ? 'bg-[#D4AF37] text-[#120F1C] shadow-sm font-semibold'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => {
                setSettings((s) => ({
                  ...s,
                  selectedDialectCode: 'hi',
                  safetyPhraseLang: 'hi-IN',
                }));
                showToast('हिन्दी सक्रिय — सैंक्चुअरी, आवाज़ व AI गाइड');
              }}
              className={`px-3 py-1 rounded-full font-medium transition-all whitespace-nowrap ${
                uiLang === 'hi'
                  ? 'bg-[#D4AF37] text-[#120F1C] shadow-sm font-semibold'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              हिन्दी
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setRoyalGateStep('language_voice');
              setRoyalGateOpen(true);
            }}
            className="text-on-surface hover:text-[#D4AF37] font-medium whitespace-nowrap transition-colors flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[15px] text-[#D4AF37]">language</span>
            <span>52 Languages</span>
          </button>

          {settings.fakeCalculatorMode && (
            <button
              type="button"
              onClick={handleOpenQuickExit}
              title="Switches screen to discreet calculator view"
              className="text-[#B76E79] hover:text-on-surface font-medium whitespace-nowrap flex items-center gap-1 transition-colors"
            >
              <span className="material-symbols-outlined text-[15px]">visibility_off</span>
              <span>{copy.quickExitBtn}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Boutique Viewport */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-32 lg:pb-16">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          >
            {activeTab === 'home' && (
              <HomeSanctuary
                subView={homeSub}
                onChangeSubView={setHomeSub}
                reels={reels}
                onUpdateReels={setReels}
                comments={comments}
                onUpdateComments={setComments}
                gazette={gazette}
                onUpdateGazette={setGazette}
                bilingualSubtitles={settings.bilingualSubtitles}
                onToggleSubtitles={() =>
                  setSettings((s) => ({ ...s, bilingualSubtitles: !s.bilingualSubtitles }))
                }
                dialectCode={settings.selectedDialectCode}
                userProfile={profile}
                onOpenStudioModal={(tab) => {
                  setStudioModalTab(tab);
                  setStudioAutoStart(false);
                  setStudioModalOpen(true);
                }}
                onAskAiFromSearch={(query) => handleAskAiWithPrompt(query)}
                onQuickNavigate={handleQuickNavigate}
                onShowToast={showToast}
              />
            )}

            {activeTab === 'haven' && (
              <HavenView
                subView={havenSub}
                onChangeSubView={setHavenSub}
                messages={conciergeMessages}
                onUpdateMessages={setConciergeMessages}
                settings={settings}
                onUpdateSettings={setSettings}
                profile={profile}
                familyContacts={familyContacts}
                onTriggerPhraseAlarm={() => {
                  setAutoTriggerSilentSos(false);
                  setAutoTriggerPhraseAlarm(true);
                  setSosOpen(true);
                }}
                onExecuteSafetyPhraseAction={handleExecuteSafetyPhraseAction}
                onShowToast={showToast}
              />
            )}

            {activeTab === 'chat' && (
              <ChatView
                familyContacts={familyContacts}
                onShowToast={showToast}
              />
            )}

            {activeTab === 'health' && (
              <HealthVaultView
                subView={healthSub}
                onChangeSubView={setHealthSub}
                familyContacts={familyContacts}
                onUpdateFamilyContacts={setFamilyContacts}
                savedIds={savedHealthIds}
                onToggleSaved={handleToggleSavedHealthItem}
                dialectCode={settings.selectedDialectCode}
                liveLocationPermitted={settings.liveLocationShareEnabled}
                onToggleLiveLocationPermitted={() =>
                  setSettings((s) => ({
                    ...s,
                    liveLocationShareEnabled: !s.liveLocationShareEnabled,
                  }))
                }
                onOpenNotes={() => {
                  setStudioModalTab('notes');
                  setStudioAutoStart(false);
                  setStudioModalOpen(true);
                }}
                onShowToast={showToast}
              />
            )}

            {activeTab === 'atelier' && (
              <AtelierView
                subView={atelierSub}
                onChangeSubView={setAtelierSub}
                products={ATELIER_PRODUCTS}
                wishlistIds={wishlistIds}
                onToggleWishlist={handleToggleWishlist}
                cartQuantities={cartQuantities}
                onUpdateCartQty={handleUpdateCartQty}
                onMoveAllWishlistToCart={handleMoveAllWishlistToCart}
                onClearCart={() => setCartQuantities({})}
                profile={profile}
                onUpdateProfile={setProfile}
                onShowToast={showToast}
              />
            )}

            {activeTab === 'self' && (
              <SelfProfileSettingsView
                subView={selfSub}
                onChangeSubView={setSelfSub}
                profile={profile}
                onUpdateProfile={setProfile}
                settings={settings}
                onUpdateSettings={setSettings}
                onOpenStealthCalculator={handleOpenQuickExit}
                onOpenSplashSignIn={() => {
                  setRoyalGateStep('royal_logo');
                  setRoyalGateOpen(true);
                }}
                onOpenHealthJournal={() => {
                  setActiveTab('health');
                  setHealthSub('overview');
                }}
                onOpenSafetyPhrase={() => {
                  setActiveTab('haven');
                  setHavenSub('safety_phrase');
                }}
                onOpenBluetoothSuite={() => {
                  setActiveTab('haven');
                  setHavenSub('bluetooth_peer');
                }}
                onPurgeLocalData={handlePurgeLocalData}
                onShowToast={showToast}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Floating Royal Frosted Bottom Nav — 6 Tabs */}
      <div className="lg:hidden fixed bottom-4 inset-x-0 z-40 px-3 pb-[env(safe-area-inset-bottom,0px)] pointer-events-none flex justify-center no-print">
        <nav
          aria-label="Mobile Bottom Navigation"
          className="pointer-events-auto w-full max-w-[480px] h-[66px] rounded-full bg-surface-container-low/95 backdrop-blur-2xl border border-[#D4AF37]/45 shadow-[0_14px_42px_rgba(0,0,0,0.34)] px-2 grid grid-cols-6 items-center"
        >
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`relative min-h-[46px] flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 ${
                  active ? 'text-on-surface font-semibold' : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                <span className="text-[10px] font-medium tracking-wide whitespace-nowrap">
                  {item.shortLabel}
                </span>
                {active && (
                  <motion.span
                    layoutId="mobile-nav-dot"
                    transition={{ type: 'spring', stiffness: 450, damping: 30 }}
                    className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] shadow-[0_0_10px_2px_rgba(212,175,55,0.85)]"
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Royal 3-Step Entrance Gate (Saevy Logo -> Select Your Language + Voice Test -> Login/OTP) */}
      <RoyalOnboardingGate
        open={royalGateOpen}
        initialStep={royalGateStep}
        settings={settings}
        profile={profile}
        onUpdateSettings={setSettings}
        onUpdateProfile={setProfile}
        onComplete={() => {
          try {
            window.localStorage.setItem(STORAGE_KEYS.royalOnboarded, '1');
          } catch {}
          setHasCompletedRoyalGate(true);
          setRoyalGateOpen(false);
        }}
        allowClose={hasCompletedRoyalGate}
        onClose={() => setRoyalGateOpen(false)}
        onShowToast={showToast}
      />

      {/* Saevy Logo SOS Modal (Zero-Noise Silent SOS + Louder SOS + 3× Rapid Press Choice) */}
      <SOSModal
        open={sosOpen}
        onClose={() => {
          setSosOpen(false);
          setAutoTriggerPhraseAlarm(false);
          setAutoTriggerSilentSos(false);
        }}
        onNavigateHelplines={() => {
          setActiveTab('haven');
          setHavenSub('helplines');
        }}
        onNavigateConcierge={() => {
          setActiveTab('haven');
          setHavenSub('concierge');
        }}
        sirenVolumePercent={settings.sirenVolumePercent}
        powerTriplePressMode={settings.powerTriplePressMode}
        onChangeTriplePressMode={(mode) =>
          setSettings((s) => ({ ...s, powerTriplePressMode: mode }))
        }
        familyContacts={familyContacts}
        guardianName={profile.fullName}
        guardianId={profile.guardianId}
        autoTriggerSoundFromPhrase={autoTriggerPhraseAlarm}
        autoTriggerSilentFromShortcut={autoTriggerSilentSos}
        onConsumeAutoTrigger={() => {
          setAutoTriggerPhraseAlarm(false);
          setAutoTriggerSilentSos(false);
        }}
        onShowToast={showToast}
      />

      {/* Camera / Video / Audio Capture Studio + Voice-Typed Personal Notes */}
      <MediaCaptureAndNotesModal
        open={studioModalOpen}
        initialTab={studioModalTab}
        autoStartCapture={studioAutoStart}
        dialectCode={settings.selectedDialectCode}
        defaultLocationLabel={profile.homeSanctuaryZone}
        onClose={() => {
          setStudioModalOpen(false);
          setStudioAutoStart(false);
        }}
        onSendMediaToAi={(attachment, promptText) =>
          handleAskAiWithPrompt(promptText, attachment)
        }
        onShowToast={showToast}
      />

      {/* Discreet Calculator Camouflage */}
      <StealthCalculatorModal
        open={stealthCalcOpen}
        secretPin={settings.calculatorPin}
        onUnlock={() => {
          setStealthCalcOpen(false);
          showToast('Returned to Saevy Sanctuary');
        }}
      />
    </div>
  );
}
