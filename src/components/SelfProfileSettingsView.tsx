import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AppSettings, EvidencePolaroidRecord, SelfSubView, UserProfile } from '../types';
import { ALL_DIALECTS, STITCH_ASSETS } from '../data/demoData';
import { ResilientImage } from './ResilientImage';
import { OrderTrackingProgress } from './OrderTrackingProgress';
import { isVoiceAndUiSupportedDialect } from '../utils/i18n';
import { getBcp47LocaleForDialect } from '../utils/speechCoordinator';

interface SelfProfileSettingsViewProps {
  subView: SelfSubView;
  onChangeSubView: (v: SelfSubView) => void;
  profile: UserProfile;
  onUpdateProfile: React.Dispatch<React.SetStateAction<UserProfile>>;
  settings: AppSettings;
  onUpdateSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  onOpenStealthCalculator: () => void;
  onOpenSplashSignIn: () => void;
  onOpenHealthJournal: () => void;
  onOpenSafetyPhrase?: () => void;
  onOpenBluetoothSuite?: () => void;
  onPurgeLocalData: () => void;
  onShowToast: (msg: string) => void;
}

type EvidencePolaroidItem = EvidencePolaroidRecord;

const EVIDENCE_STORAGE_KEY = 'saevy_proto_evidence_polaroids_v1';

const INITIAL_EVIDENCE_POLAROIDS: EvidencePolaroidItem[] = [
  {
    id: 'ev-1',
    title: 'Evening Cab Plate & Route Check',
    location: 'Koramangala 4th Block · Bengaluru',
    timestamp: '24 Oct 2026 · 21:18 IST',
    note: 'Driver route verified against Kensington Sanctuary corridor before boarding.',
    imageUrl: STITCH_ASSETS.reelHero,
  },
  {
    id: 'ev-2',
    title: 'Lobby Concierge Desk Arrival',
    location: 'Indiranagar Studio · Gate B',
    timestamp: '22 Oct 2026 · 19:42 IST',
    note: 'Quiet check-in logged upon reaching illuminated reception foyer.',
    imageUrl: STITCH_ASSETS.reelThumb,
  },
  {
    id: 'ev-3',
    title: 'Atelier Ring Pairing Seal',
    location: 'Royal Palms Suite 402',
    timestamp: '19 Oct 2026 · 11:05 IST',
    note: 'Personal safety talisman inspected and stored in private bedsidefolio.',
    imageUrl: STITCH_ASSETS.productRing,
  },
];

const POLAROID_PRESET_IMAGES = [
  { label: 'Evening Corridor', url: STITCH_ASSETS.reelHero },
  { label: 'Sanctuary Foyer', url: STITCH_ASSETS.reelThumb },
  { label: 'Atelier Talisman', url: STITCH_ASSETS.productRing },
  { label: 'Silk Tag Detail', url: STITCH_ASSETS.productTag },
];

const luxurySpring = { type: 'spring' as const, stiffness: 320, damping: 30 };

export const SelfProfileSettingsView: React.FC<SelfProfileSettingsViewProps> = ({
  subView,
  onChangeSubView,
  profile,
  onUpdateProfile,
  settings,
  onUpdateSettings,
  onOpenStealthCalculator,
  onOpenSplashSignIn,
  onOpenHealthJournal,
  onOpenSafetyPhrase,
  onOpenBluetoothSuite,
  onPurgeLocalData,
  onShowToast,
}) => {
  // Optional dedicated Evidence Locker & Order Tracking sub-tabs while preserving external SelfSubView contract
  const [evidenceOnlyMode, setEvidenceOnlyMode] = useState(false);
  const [orderTrackingOnlyMode, setOrderTrackingOnlyMode] = useState(false);

  useEffect(() => {
    setEvidenceOnlyMode(false);
    setOrderTrackingOnlyMode(false);
  }, [subView]);

  // Editable Personal & Medical Profile Form State (directly editable)
  const [draftProfile, setDraftProfile] = useState<UserProfile>(profile);
  const [profileError, setProfileError] = useState('');
  const [selfieCameraOpen, setSelfieCameraOpen] = useState(false);
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
  const selfieVideoRef = useRef<HTMLVideoElement | null>(null);
  const selfieStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    setDraftProfile(profile);
  }, [profile]);

  const stopSelfieCamera = () => {
    if (selfieStreamRef.current) {
      selfieStreamRef.current.getTracks().forEach((t) => t.stop());
      selfieStreamRef.current = null;
    }
    setSelfieCameraOpen(false);
  };

  useEffect(() => {
    return () => {
      if (selfieStreamRef.current) {
        selfieStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const handleOpenSelfieCamera = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        avatarFileInputRef.current?.click();
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } },
        audio: false,
      });
      selfieStreamRef.current = stream;
      setSelfieCameraOpen(true);
      setTimeout(() => {
        if (selfieVideoRef.current) {
          selfieVideoRef.current.srcObject = stream;
          selfieVideoRef.current.play().catch(() => {});
        }
      }, 60);
    } catch {
      onShowToast('Camera unavailable — opening image picker instead');
      avatarFileInputRef.current?.click();
    }
  };

  const handleCaptureSelfieFrame = () => {
    const video = selfieVideoRef.current;
    if (!video || !video.videoWidth) return;
    const size = Math.min(video.videoWidth, video.videoHeight, 480);
    const sx = (video.videoWidth - Math.min(video.videoWidth, video.videoHeight)) / 2;
    const sy = (video.videoHeight - Math.min(video.videoWidth, video.videoHeight)) / 2;
    const sDim = Math.min(video.videoWidth, video.videoHeight);

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, sx, sy, sDim, sDim, 0, 0, size, size);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.86);

    setDraftProfile((prev) => ({ ...prev, avatarUrl: dataUrl }));
    onUpdateProfile((prev) => ({ ...prev, avatarUrl: dataUrl }));
    stopSelfieCamera();
    onShowToast('Profile picture captured and saved');
  };

  const handleUploadAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setProfileError('Please choose a valid image file (JPG, PNG, WebP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') return;
      const img = new Image();
      img.onload = () => {
        const maxDim = 440;
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        const targetSize = Math.min(minSide, maxDim);

        const canvas = document.createElement('canvas');
        canvas.width = targetSize;
        canvas.height = targetSize;
        const ctx = canvas.getContext('2d');
        const finalUrl = ctx
          ? (ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, targetSize, targetSize),
            canvas.toDataURL('image/jpeg', 0.86))
          : result;

        setProfileError('');
        setDraftProfile((prev) => ({ ...prev, avatarUrl: finalUrl }));
        onUpdateProfile((prev) => ({ ...prev, avatarUrl: finalUrl }));
        onShowToast('Profile picture updated');
      };
      img.onerror = () => {
        setDraftProfile((prev) => ({ ...prev, avatarUrl: result }));
        onUpdateProfile((prev) => ({ ...prev, avatarUrl: result }));
        onShowToast('Profile picture updated');
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  };

  // Evidence Locker Polaroid State (persisted in localStorage)
  const [polaroids, setPolaroids] = useState<EvidencePolaroidItem[]>(() => {
    try {
      const raw = window.localStorage.getItem(EVIDENCE_STORAGE_KEY);
      if (!raw) return INITIAL_EVIDENCE_POLAROIDS;
      const parsed = JSON.parse(raw) as EvidencePolaroidItem[];
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : INITIAL_EVIDENCE_POLAROIDS;
    } catch {
      return INITIAL_EVIDENCE_POLAROIDS;
    }
  });
  const [addingPolaroid, setAddingPolaroid] = useState(false);
  const [polTitle, setPolTitle] = useState('');
  const [polLocation, setPolLocation] = useState('');
  const [polNote, setPolNote] = useState('');
  const [polImage, setPolImage] = useState(POLAROID_PRESET_IMAGES[0].url);

  useEffect(() => {
    try {
      window.localStorage.setItem(EVIDENCE_STORAGE_KEY, JSON.stringify(polaroids));
    } catch {
      // Ignore storage quota errors
    }
  }, [polaroids]);

  useEffect(() => {
    const syncEvidenceFromModal = () => {
      try {
        const raw = window.localStorage.getItem(EVIDENCE_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as EvidencePolaroidItem[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPolaroids(parsed);
        }
      } catch {
        // Ignore parse error
      }
    };
    window.addEventListener('saevy-evidence-updated', syncEvidenceFromModal);
    return () => window.removeEventListener('saevy-evidence-updated', syncEvidenceFromModal);
  }, []);

  // Settings local micro-states
  const [confirmPurgeOpen, setConfirmPurgeOpen] = useState(false);
  const [editingPin, setEditingPin] = useState(false);
  const [pinDraft, setPinDraft] = useState(settings.calculatorPin);

  // Language search
  const [dialectSearch, setDialectSearch] = useState('');

  const selectedDialect = useMemo(
    () =>
      ALL_DIALECTS.find((d) => d.code === settings.selectedDialectCode) ||
      ALL_DIALECTS.find((d) => d.code === 'en')!,
    [settings.selectedDialectCode]
  );

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftProfile.fullName.trim()) {
      setProfileError('Please enter your name.');
      return;
    }
    if (!draftProfile.bloodGroup.trim()) {
      setProfileError('Blood Group is required.');
      return;
    }
    if (!draftProfile.emergencyContactName.trim() || !draftProfile.emergencyContactPhone.trim()) {
      setProfileError('Emergency Contact Name and Phone are required.');
      return;
    }
    setProfileError('');
    const cleanedProfile: UserProfile = {
      ...draftProfile,
      fullName: draftProfile.fullName.trim(),
    };
    onUpdateProfile(cleanedProfile);
    setDraftProfile(cleanedProfile);
    onShowToast(`Profile updated for ${cleanedProfile.fullName}`);
  };

  const handleCreatePolaroid = (e: React.FormEvent) => {
    e.preventDefault();
    if (!polTitle.trim()) return;
    const now = new Date();
    const formattedStamp =
      now.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }) +
      ' · ' +
      now.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
      }) +
      ' IST';

    const entry: EvidencePolaroidItem = {
      id: `ev-${Date.now()}`,
      title: polTitle.trim(),
      location: polLocation.trim() || profile.homeSanctuaryZone,
      timestamp: formattedStamp,
      note: polNote.trim() || 'Private timestamped sanctuary record saved to local locker.',
      imageUrl: polImage,
    };

    setPolaroids((prev) => [entry, ...prev]);
    setPolTitle('');
    setPolLocation('');
    setPolNote('');
    setAddingPolaroid(false);
    onShowToast('Saved timestamped Polaroid to Evidence Locker');
  };

  const handleDeletePolaroid = (id: string, title: string) => {
    setPolaroids((prev) => prev.filter((item) => item.id !== id));
    onShowToast(`Removed "${title}" from Evidence Locker`);
  };

  const handleSelectDialect = (code: string, name: string, safePhrase: string) => {
    const locale = getBcp47LocaleForDialect(code);
    onUpdateSettings((s) => ({
      ...s,
      selectedDialectCode: code,
      safetyPhraseLang: locale,
    }));
    onShowToast(
      `Language set to ${name} (${locale}) — Voice Typing, Safety Phrase & Greeting synced ("${safePhrase}")`
    );
  };

  const filteredDialects = useMemo(() => {
    const q = dialectSearch.trim().toLowerCase();
    if (!q) return ALL_DIALECTS;
    return ALL_DIALECTS.filter((d) =>
      `${d.name} ${d.region} ${d.nativeSample} ${d.safePhrase}`.toLowerCase().includes(q)
    );
  }, [dialectSearch]);

  const indianDialects = filteredDialects.filter((d) => d.group === 'indian');
  const globalDialects = filteredDialects.filter((d) => d.group === 'global');

  const renderEvidenceLockerSection = () => (
    <section className="luxury-card p-6 sm:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-[#D4AF37] tracking-wide">
            Private Sanctuary Archive · Gold-Stamped Chronology
          </div>
          <h2 className="font-display text-[28px] font-bold tracking-wide text-[#0A0A0A] leading-tight">
            Evidence Locker
          </h2>
          <p className="text-xs sm:text-sm text-[#5C544E] max-w-2xl">
            Curate private Polaroid keepsakes of cab plates, arrival check-ins, and safety notes stored locally in this browser.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setAddingPolaroid((v) => !v)}
          className={
            addingPolaroid
              ? 'btn-luxury-outline px-6 text-xs sm:text-sm font-medium shrink-0'
              : 'btn-luxury px-6 text-xs sm:text-sm font-medium flex items-center gap-2 shrink-0'
          }
        >
          <span className="material-symbols-outlined text-[18px] text-[#D4AF37]">
            {addingPolaroid ? 'close' : 'add_a_photo'}
          </span>
          <span>{addingPolaroid ? 'Cancel' : 'New Polaroid Record'}</span>
        </button>
      </div>

      {addingPolaroid && (
        <form
          onSubmit={handleCreatePolaroid}
          className="luxury-card-blush p-5 sm:p-6 space-y-4"
        >
          <div className="font-display text-lg font-bold text-[#0A0A0A]">
            Log New Timestamped Polaroid
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <input
              type="text"
              required
              value={polTitle}
              onChange={(e) => setPolTitle(e.target.value)}
              placeholder="Record Title (e.g. Late Ride Plate KA-01-AB-4021)"
              className="min-h-[52px] px-4 rounded-full bg-[#FFFCF8] border border-[#F0E6DC] text-xs sm:text-sm text-[#0A0A0A] placeholder:text-[#8C7B6E] focus:outline-none focus:border-[#D4AF37]"
            />
            <input
              type="text"
              value={polLocation}
              onChange={(e) => setPolLocation(e.target.value)}
              placeholder="Location (e.g. Indiranagar 100ft Road)"
              className="min-h-[52px] px-4 rounded-full bg-[#FFFCF8] border border-[#F0E6DC] text-xs sm:text-sm text-[#0A0A0A] placeholder:text-[#8C7B6E] focus:outline-none focus:border-[#D4AF37]"
            />
          </div>
          <input
            type="text"
            value={polNote}
            onChange={(e) => setPolNote(e.target.value)}
            placeholder="Brief note or observation..."
            className="w-full min-h-[52px] px-4 rounded-full bg-[#FFFCF8] border border-[#F0E6DC] text-xs sm:text-sm text-[#0A0A0A] placeholder:text-[#8C7B6E] focus:outline-none focus:border-[#D4AF37]"
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-[#5C544E]">Visual Frame:</span>
              {POLAROID_PRESET_IMAGES.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setPolImage(preset.url)}
                  className={`min-h-[38px] px-3.5 rounded-full text-xs font-medium border transition-colors ${
                    polImage === preset.url
                      ? 'bg-[#0A0A0A] text-[#FFFCF8] border-[#D4AF37]'
                      : 'bg-[#FFFCF8] text-[#5C544E] border-[#F0E6DC] hover:border-[#D4AF37]/60'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <button type="submit" className="btn-luxury px-6 text-xs sm:text-sm font-medium">
              Stamp &amp; Save Polaroid
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {polaroids.map((item) => (
          <article
            key={item.id}
            className="polaroid-card group flex flex-col justify-between gap-4 transition-transform duration-300 hover:-translate-y-1"
          >
            <div className="space-y-3.5">
              <div className="relative aspect-[4/3] w-full rounded-[16px] overflow-hidden bg-[#F8EFE6] border border-[#F0E6DC] flex items-center justify-center">
                {item.mediaKind === 'video' && item.mediaDataUrl ? (
                  <video
                    src={item.mediaDataUrl}
                    controls
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ) : item.mediaKind === 'audio' && item.mediaDataUrl ? (
                  <div className="w-full h-full p-4 flex flex-col items-center justify-center gap-3 bg-[#171422] text-[#F5EFE6]">
                    <span className="material-symbols-outlined text-[32px] text-[#D4AF37]">
                      graphic_eq
                    </span>
                    <audio src={item.mediaDataUrl} controls className="w-full max-w-[240px]" />
                  </div>
                ) : (
                  <ResilientImage
                    src={item.mediaDataUrl || item.imageUrl}
                    alt={item.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    fallbackIcon="photo_camera"
                  />
                )}
                <button
                  type="button"
                  onClick={() => handleDeletePolaroid(item.id, item.title)}
                  aria-label={`Remove ${item.title}`}
                  className="absolute top-2.5 right-2.5 w-9 h-9 rounded-full bg-[#FFFCF8]/90 backdrop-blur-md border border-[#F0E6DC] text-[#5C544E] hover:text-[#9E2A3B] flex items-center justify-center transition-colors shadow-sm"
                >
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                </button>
              </div>

              <div className="px-1 space-y-1.5">
                <div className="text-xs font-semibold text-[#D4AF37] tracking-wide tabular-nums flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[15px] text-[#D4AF37]">
                    schedule
                  </span>
                  <span>{item.timestamp}</span>
                </div>
                <h3 className="font-display text-lg font-bold text-[#0A0A0A] leading-snug">
                  {item.title}
                </h3>
                <div className="text-xs text-[#B76E79]">{item.location}</div>
                <p className="text-xs text-[#5C544E] leading-relaxed pt-1">{item.note}</p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );

  return (
    <div className="space-y-7">
      {/* Frosted Luxury Sub-Navigation Switcher */}
      <div className="flex items-center justify-between gap-1.5 flex-wrap bg-[#FFFCF8]/90 border border-[#F0E6DC] rounded-full p-1.5 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.05)]">
        {[
          {
            key: 'profile',
            label: 'Profile',
            icon: 'person',
            active: subView === 'profile' && !evidenceOnlyMode && !orderTrackingOnlyMode,
            onClick: () => {
              setEvidenceOnlyMode(false);
              setOrderTrackingOnlyMode(false);
              onChangeSubView('profile');
            },
          },
          {
            key: 'tracking',
            label: 'Order Tracking',
            icon: 'local_shipping',
            active: orderTrackingOnlyMode,
            onClick: () => {
              onChangeSubView('profile');
              setEvidenceOnlyMode(false);
              setOrderTrackingOnlyMode(true);
            },
          },
          {
            key: 'evidence',
            label: `Evidence Locker (${polaroids.length})`,
            icon: 'photo_library',
            active: evidenceOnlyMode,
            onClick: () => {
              onChangeSubView('profile');
              setOrderTrackingOnlyMode(false);
              setEvidenceOnlyMode(true);
            },
          },
          {
            key: 'settings',
            label: 'Settings & Suite',
            icon: 'tune',
            active: subView === 'settings' && !evidenceOnlyMode && !orderTrackingOnlyMode,
            onClick: () => {
              setEvidenceOnlyMode(false);
              setOrderTrackingOnlyMode(false);
              onChangeSubView('settings');
            },
          },
          {
            key: 'language',
            label: `52 Dialects (${selectedDialect.name})`,
            icon: 'translate',
            active: subView === 'language' && !evidenceOnlyMode && !orderTrackingOnlyMode,
            onClick: () => {
              setEvidenceOnlyMode(false);
              setOrderTrackingOnlyMode(false);
              onChangeSubView('language');
            },
          },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={tab.onClick}
            className={`relative flex-1 min-h-[46px] px-3 sm:px-4 rounded-full text-xs sm:text-sm font-medium flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
              tab.active ? 'text-[#FFFCF8]' : 'text-[#5C544E] hover:text-[#0A0A0A]'
            }`}
          >
            {tab.active && (
              <motion.span
                layoutId="self-subtab-pill"
                transition={luxurySpring}
                className="absolute inset-0 rounded-full bg-[#0A0A0A] border border-[#D4AF37]/50 shadow-[0_6px_20px_rgba(10,10,10,0.16)]"
              />
            )}
            <span
              className={`material-symbols-outlined text-[18px] relative z-10 ${
                tab.active ? 'text-[#D4AF37]' : 'text-[#8C7B6E]'
              }`}
            >
              {tab.icon}
            </span>
            <span className="relative z-10">{tab.label}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* ======================== DEDICATED ORDER TRACKING VIEW ======================== */}
        {orderTrackingOnlyMode && (
          <motion.div
            key="order-tracking-only"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={luxurySpring}
          >
            <OrderTrackingProgress
              profile={profile}
              onUpdateProfile={onUpdateProfile}
              onShowToast={onShowToast}
            />
          </motion.div>
        )}

        {/* ======================== DEDICATED EVIDENCE LOCKER VIEW ======================== */}
        {evidenceOnlyMode && (
          <motion.div
            key="evidence-only"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={luxurySpring}
          >
            {renderEvidenceLockerSection()}
          </motion.div>
        )}

        {/* ======================== 1. PROFILE + POLAROID LOCKER VIEW ======================== */}
        {subView === 'profile' && !evidenceOnlyMode && !orderTrackingOnlyMode && (
          <motion.div
            key="profile"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={luxurySpring}
            className="space-y-8"
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Maison Identity Card with Instant Profile Photo Upload & Editable Name */}
              <div className="lg:col-span-5 luxury-card-blush p-7 text-center space-y-5">
                <input
                  ref={avatarFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleUploadAvatarFile}
                />

                <div className="relative w-32 h-32 mx-auto group">
                  <button
                    type="button"
                    onClick={() => avatarFileInputRef.current?.click()}
                    title="Click to insert or change your profile picture"
                    className="w-32 h-32 rounded-full overflow-hidden border-2 border-[#D4AF37] shadow-[0_10px_28px_rgba(212,175,55,0.25)] block relative focus-visible:outline-2 focus-visible:outline-[#D4AF37]"
                  >
                    <ResilientImage
                      src={draftProfile.avatarUrl || profile.avatarUrl || STITCH_ASSETS.sarahAvatar}
                      alt={draftProfile.fullName || profile.fullName}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      fallbackIcon="person"
                    />
                    <span className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-medium">
                      Change Photo
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => avatarFileInputRef.current?.click()}
                    aria-label="Upload profile picture"
                    title="Upload profile picture from device"
                    className="absolute bottom-0.5 right-0.5 w-10 h-10 rounded-full bg-[#0A0A0A] text-[#D4AF37] border border-[#D4AF37] shadow-md flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
                  >
                    <span className="material-symbols-outlined text-[18px]">add_a_photo</span>
                  </button>
                </div>

                {/* Upload Photo / Take Selfie Action Row */}
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => avatarFileInputRef.current?.click()}
                    className="min-h-[38px] px-4 rounded-full bg-[#FFFCF8] border border-[#D4AF37]/60 text-xs font-medium text-[#0A0A0A] hover:border-[#D4AF37] inline-flex items-center gap-1.5 transition-all"
                  >
                    <span className="material-symbols-outlined text-[16px] text-[#D4AF37]">
                      upload
                    </span>
                    <span>Insert Photo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleOpenSelfieCamera()}
                    className="min-h-[38px] px-4 rounded-full bg-[#FFFCF8] border border-[#F0E6DC] hover:border-[#D4AF37] text-xs font-medium text-[#0A0A0A] inline-flex items-center gap-1.5 transition-all"
                  >
                    <span className="material-symbols-outlined text-[16px] text-[#B76E79]">
                      photo_camera
                    </span>
                    <span>Take Selfie</span>
                  </button>
                </div>

                {selfieCameraOpen && (
                  <div className="p-3.5 rounded-[20px] bg-[#120F1C] border border-[#D4AF37]/50 space-y-3">
                    <div className="aspect-square max-w-[220px] mx-auto rounded-full overflow-hidden border-2 border-[#D4AF37]">
                      <video
                        ref={selfieVideoRef}
                        muted
                        playsInline
                        className="w-full h-full object-cover scale-x-[-1]"
                      />
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={handleCaptureSelfieFrame}
                        className="min-h-[40px] px-4 rounded-full bg-[#D4AF37] text-[#120F1C] text-xs font-semibold flex items-center gap-1.5"
                      >
                        <span className="material-symbols-outlined text-[16px]">camera</span>
                        <span>Use Photo</span>
                      </button>
                      <button
                        type="button"
                        onClick={stopSelfieCamera}
                        className="min-h-[40px] px-4 rounded-full bg-white/10 text-white text-xs font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="text-xs font-medium text-[#B76E79] tracking-wide">
                    Sanctuary Maison · Private Suite
                  </div>
                  <h2 className="font-display text-[28px] font-bold tracking-wide text-[#0A0A0A] leading-tight">
                    {draftProfile.fullName.trim() || profile.fullName}
                  </h2>

                  {/* Quick Direct Name Input on Card */}
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      value={draftProfile.fullName}
                      onChange={(e) => {
                        setDraftProfile({ ...draftProfile, fullName: e.target.value });
                        if (profileError) setProfileError('');
                      }}
                      placeholder="Enter your name..."
                      aria-label="Edit your display name"
                      className="flex-1 min-h-[44px] px-4 rounded-full bg-[#FFFCF8] border border-[#F0E6DC] text-xs sm:text-sm text-[#0A0A0A] focus:outline-none focus:border-[#D4AF37]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const trimmed = draftProfile.fullName.trim();
                        if (!trimmed) {
                          setProfileError('Please enter your name.');
                          return;
                        }
                        const updated = { ...profile, ...draftProfile, fullName: trimmed };
                        onUpdateProfile(updated);
                        setDraftProfile(updated);
                        onShowToast(`Name updated to ${trimmed}`);
                      }}
                      className="min-h-[44px] px-4 rounded-full bg-[#0A0A0A] text-[#FFFCF8] border border-[#D4AF37]/50 text-xs font-medium shrink-0 hover:border-[#D4AF37] active:scale-95 transition-all"
                    >
                      Save Name
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(profile.guardianId).catch(() => {});
                      onShowToast(`Copied Member Key ${profile.guardianId}`);
                    }}
                    className="min-h-[36px] px-4 rounded-full bg-[#FFFCF8] border border-[#F0E6DC] hover:border-[#D4AF37] text-xs text-[#5C544E] hover:text-[#0A0A0A] inline-flex items-center gap-1.5 transition-colors"
                  >
                    <span className="tabular-nums">{profile.guardianId}</span>
                    <span className="material-symbols-outlined text-[14px] text-[#D4AF37]">
                      content_copy
                    </span>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2.5 pt-1">
                  <div className="p-3.5 rounded-[20px] bg-[#FFFCF8]/90 border border-[#F0E6DC]">
                    <div className="font-display text-xl font-bold text-[#0A0A0A] tabular-nums">
                      5
                    </div>
                    <div className="text-[11px] text-[#5C544E]">Trusted Circle</div>
                  </div>
                  <div className="p-3.5 rounded-[20px] bg-[#FFFCF8]/90 border border-[#F0E6DC]">
                    <div className="font-display text-xl font-bold text-[#B76E79]">
                      {draftProfile.bloodGroup || profile.bloodGroup}
                    </div>
                    <div className="text-[11px] text-[#5C544E]">Blood Group</div>
                  </div>
                  <div className="p-3.5 rounded-[20px] bg-[#FFFCF8]/90 border border-[#F0E6DC]">
                    <div className="font-display text-lg font-bold text-[#8C6D1F] truncate">
                      {selectedDialect.name}
                    </div>
                    <div className="text-[11px] text-[#5C544E]">Language</div>
                  </div>
                </div>

                <div className="pt-2 space-y-3">
                  <button
                    type="button"
                    onClick={onOpenHealthJournal}
                    className="btn-luxury w-full px-5 text-xs sm:text-sm font-medium flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[18px] text-[#D4AF37]">
                      spa
                    </span>
                    <span>Open Specialists, Tips &amp; @Home Care</span>
                  </button>
                  {onOpenSafetyPhrase && (
                    <button
                      type="button"
                      onClick={onOpenSafetyPhrase}
                      className="btn-luxury-outline w-full px-5 text-xs sm:text-sm font-medium flex items-center justify-center gap-2"
                    >
                      <span className="material-symbols-outlined text-[18px] text-[#B76E79]">
                        record_voice_over
                      </span>
                      <span>Configure Voice Safety Phrase</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onOpenSplashSignIn}
                    className="btn-luxury-outline w-full px-5 text-xs sm:text-sm font-medium flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[18px] text-[#D4AF37]">
                      key
                    </span>
                    <span>Preview Maison Sign-In Suite</span>
                  </button>
                </div>
              </div>

              {/* Right Column: Directly Editable Personal & Wellness Profile Form */}
              <div className="lg:col-span-7 space-y-6">
                <form
                  onSubmit={handleSaveProfile}
                  noValidate
                  className="luxury-card p-6 sm:p-7 space-y-5"
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="space-y-1">
                      <h3 className="font-display text-[24px] sm:text-[28px] font-bold tracking-wide text-[#0A0A0A] leading-tight">
                        Editable Personal &amp; Wellness Profile
                      </h3>
                      <p className="text-xs text-[#5C544E]">
                        Update your profile picture, name, contact details, and emergency info anytime. Saved privately on this device.
                      </p>
                    </div>
                  </div>

                  {/* Profile Picture Row Inside Form */}
                  <div className="p-4 rounded-[20px] bg-[#FFF8F0]/80 border border-[#F0E6DC] flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-[#D4AF37] shrink-0">
                        <ResilientImage
                          src={
                            draftProfile.avatarUrl ||
                            profile.avatarUrl ||
                            STITCH_ASSETS.sarahAvatar
                          }
                          alt={draftProfile.fullName || 'Profile picture'}
                          className="w-full h-full object-cover"
                          fallbackIcon="person"
                        />
                      </div>
                      <div>
                        <div className="text-xs sm:text-sm font-semibold text-[#0A0A0A]">
                          Profile Picture
                        </div>
                        <p className="text-[11px] text-[#5C544E]">
                          Insert any JPG, PNG, or WebP photo from your phone or computer
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => avatarFileInputRef.current?.click()}
                        className="btn-luxury-outline px-4 min-h-[42px] text-xs font-medium flex items-center gap-1.5"
                      >
                        <span className="material-symbols-outlined text-[17px] text-[#D4AF37]">
                          add_photo_alternate
                        </span>
                        <span>Choose Image</span>
                      </button>
                      {(draftProfile.avatarUrl &&
                        draftProfile.avatarUrl !== STITCH_ASSETS.sarahAvatar) && (
                        <button
                          type="button"
                          onClick={() => {
                            setDraftProfile((prev) => ({
                              ...prev,
                              avatarUrl: STITCH_ASSETS.sarahAvatar,
                            }));
                            onUpdateProfile((prev) => ({
                              ...prev,
                              avatarUrl: STITCH_ASSETS.sarahAvatar,
                            }));
                            onShowToast('Restored default profile portrait');
                          }}
                          className="min-h-[42px] px-3.5 rounded-full text-xs text-[#5C544E] hover:text-[#9E2A3B] transition-colors"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-xs font-medium text-[#0A0A0A] mb-1.5">
                        Your Name *
                      </label>
                      <input
                        type="text"
                        value={draftProfile.fullName}
                        onChange={(e) => {
                          setDraftProfile({ ...draftProfile, fullName: e.target.value });
                          if (profileError) setProfileError('');
                        }}
                        placeholder="Enter your full name"
                        className="w-full min-h-[50px] px-4 rounded-full bg-[#FFFCF8] border border-[#F0E6DC] text-sm text-[#0A0A0A] focus:outline-none focus:border-[#D4AF37]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#0A0A0A] mb-1.5">
                        Blood Group *
                      </label>
                      <input
                        type="text"
                        value={draftProfile.bloodGroup}
                        onChange={(e) =>
                          setDraftProfile({ ...draftProfile, bloodGroup: e.target.value })
                        }
                        placeholder="e.g., B+, O+, A+"
                        className="w-full min-h-[50px] px-4 rounded-full bg-[#FFFCF8] border border-[#F0E6DC] text-sm text-[#0A0A0A] focus:outline-none focus:border-[#D4AF37]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-xs font-medium text-[#0A0A0A] mb-1.5">
                        Personal Phone Number
                      </label>
                      <input
                        type="tel"
                        value={draftProfile.phone}
                        onChange={(e) =>
                          setDraftProfile({ ...draftProfile, phone: e.target.value })
                        }
                        placeholder="+91 98765 01420"
                        className="w-full min-h-[50px] px-4 rounded-full bg-[#FFFCF8] border border-[#F0E6DC] text-sm text-[#0A0A0A] tabular-nums focus:outline-none focus:border-[#D4AF37]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#5C544E] mb-1.5">
                        Email Address (Optional)
                      </label>
                      <input
                        type="email"
                        value={draftProfile.email || ''}
                        onChange={(e) =>
                          setDraftProfile({ ...draftProfile, email: e.target.value })
                        }
                        placeholder="you@example.com"
                        className="w-full min-h-[50px] px-4 rounded-full bg-[#FFFCF8] border border-[#F0E6DC] text-sm text-[#0A0A0A] focus:outline-none focus:border-[#D4AF37]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#5C544E] mb-1.5">
                      Home Sanctuary Zone / City
                    </label>
                    <input
                      type="text"
                      value={draftProfile.homeSanctuaryZone}
                      onChange={(e) =>
                        setDraftProfile({ ...draftProfile, homeSanctuaryZone: e.target.value })
                      }
                      placeholder="e.g., Koramangala Sanctuary · Bengaluru"
                      className="w-full min-h-[50px] px-4 rounded-full bg-[#FFFCF8] border border-[#F0E6DC] text-sm text-[#0A0A0A] focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-xs font-medium text-[#5C544E] mb-1.5">
                        Wellness Notes &amp; Conditions
                      </label>
                      <input
                        type="text"
                        value={draftProfile.knownConditions}
                        onChange={(e) =>
                          setDraftProfile({ ...draftProfile, knownConditions: e.target.value })
                        }
                        className="w-full min-h-[50px] px-4 rounded-full bg-[#FFFCF8] border border-[#F0E6DC] text-sm text-[#0A0A0A] focus:outline-none focus:border-[#D4AF37]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#5C544E] mb-1.5">
                        Known Allergies
                      </label>
                      <input
                        type="text"
                        value={draftProfile.allergies}
                        onChange={(e) =>
                          setDraftProfile({ ...draftProfile, allergies: e.target.value })
                        }
                        className="w-full min-h-[50px] px-4 rounded-full bg-[#FFFCF8] border border-[#F0E6DC] text-sm text-[#0A0A0A] focus:outline-none focus:border-[#D4AF37]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-xs font-medium text-[#0A0A0A] mb-1.5">
                        Emergency Contact Name *
                      </label>
                      <input
                        type="text"
                        value={draftProfile.emergencyContactName}
                        onChange={(e) =>
                          setDraftProfile({
                            ...draftProfile,
                            emergencyContactName: e.target.value,
                          })
                        }
                        className="w-full min-h-[50px] px-4 rounded-full bg-[#FFFCF8] border border-[#F0E6DC] text-sm text-[#0A0A0A] focus:outline-none focus:border-[#D4AF37]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#0A0A0A] mb-1.5">
                        Emergency Contact Phone *
                      </label>
                      <input
                        type="tel"
                        value={draftProfile.emergencyContactPhone}
                        onChange={(e) =>
                          setDraftProfile({
                            ...draftProfile,
                            emergencyContactPhone: e.target.value,
                          })
                        }
                        className="w-full min-h-[50px] px-4 rounded-full bg-[#FFFCF8] border border-[#F0E6DC] text-sm text-[#0A0A0A] tabular-nums focus:outline-none focus:border-[#D4AF37]"
                      />
                    </div>
                  </div>

                  {profileError && (
                    <p className="text-xs text-[#9E2A3B] font-medium">{profileError}</p>
                  )}

                  <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDraftProfile(profile);
                        setProfileError('');
                      }}
                      className="btn-luxury-outline px-5 text-xs sm:text-sm font-medium"
                    >
                      Discard Unsaved Edits
                    </button>
                    <button
                      type="submit"
                      className="btn-luxury px-7 text-xs sm:text-sm font-medium flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined text-[18px] text-[#D4AF37]">
                        check_circle
                      </span>
                      <span>Save Profile Changes</span>
                    </button>
                  </div>
                </form>

                {/* Acoustic & Sanctuary Preferences */}
                <div className="luxury-card-sage p-6 sm:p-7 space-y-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h3 className="font-display text-xl sm:text-2xl font-bold text-[#0A0A0A]">
                      Language &amp; Sensory Preferences
                    </h3>
                    <span className="text-xs text-[#3E6B4E] font-medium">
                      Device-Local Controls
                    </span>
                  </div>

                  <div className="divide-y divide-[#DFE7DF]">
                    <div className="py-3.5 flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold text-[#0A0A0A]">
                          Sanctuary Dialect &amp; Voice
                        </div>
                        <div className="text-xs text-[#5C544E]">
                          {selectedDialect.name} ({selectedDialect.region}) ·{' '}
                          {isVoiceAndUiSupportedDialect(selectedDialect.code)
                            ? 'Full UI + Voice + Spoken Replies Active'
                            : 'Header Greeting Phrase Active (Voice & UI in English)'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onChangeSubView('language')}
                        className="btn-luxury-outline px-5 text-xs font-medium shrink-0"
                      >
                        52 Dialects
                      </button>
                    </div>

                    {[
                      {
                        key: 'discreetHaptics' as const,
                        title: 'Discreet Pocket Haptics',
                        desc: 'Saved UI preference — mobile browsers restrict background vibration.',
                      },
                      {
                        key: 'highDbAlert' as const,
                        title: 'Local Audio Chime Preference',
                        desc: 'Sets default preference for Web Audio chime; always prompts headphone check first.',
                      },
                      {
                        key: 'guardianAutoPing' as const,
                        title: 'Background Circle Auto-Pings (Off)',
                        desc: 'No background GPS or SMS messages are ever sent without your action.',
                      },
                    ].map((pref) => {
                      const checked = settings[pref.key];
                      return (
                        <div
                          key={pref.key}
                          className="py-3.5 flex items-center justify-between gap-4"
                        >
                          <div>
                            <div className="text-sm font-semibold text-[#0A0A0A]">{pref.title}</div>
                            <div className="text-xs text-[#5C544E]">{pref.desc}</div>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={checked}
                            onClick={() =>
                              onUpdateSettings((s) => ({ ...s, [pref.key]: !s[pref.key] }))
                            }
                            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full p-0.5 transition-colors border ${
                              checked
                                ? 'bg-[#0A0A0A] border-[#D4AF37]'
                                : 'bg-[#F2E7DC] border-[#E2D4C6]'
                            }`}
                          >
                            <span
                              className={`inline-block h-5.5 w-5.5 rounded-full shadow-sm transition-transform ${
                                checked
                                  ? 'translate-x-5 bg-[#D4AF37]'
                                  : 'translate-x-0 bg-[#FFFCF8]'
                              }`}
                            />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Real-time Order Tracking Step-by-Step Progress Visual from User Profile */}
            <OrderTrackingProgress
              profile={profile}
              onUpdateProfile={onUpdateProfile}
              onShowToast={onShowToast}
            />

            {/* Luxury Polaroid Evidence Locker right below Profile */}
            {renderEvidenceLockerSection()}
          </motion.div>
        )}

        {/* ======================== 2. SETTINGS & SUITE STATUS VIEW ======================== */}
        {subView === 'settings' && !evidenceOnlyMode && !orderTrackingOnlyMode && (
          <motion.div
            key="settings"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={luxurySpring}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
          >
            <div className="lg:col-span-6 space-y-6">
              {/* Privacy & Local Browser Storage */}
              <div className="luxury-card p-6 sm:p-7 space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[#D4AF37] tracking-wide">
                    Sanctuary Discretion &amp; Privacy
                  </span>
                  <span className="material-symbols-outlined text-[#D4AF37] text-[20px]">
                    verified_user
                  </span>
                </div>
                <h2 className="font-display text-[28px] font-bold tracking-wide text-[#0A0A0A] leading-tight">
                  Private by Design
                </h2>
                <ul className="text-xs sm:text-sm text-[#5C544E] space-y-2 leading-relaxed list-disc pl-4">
                  <li>
                    <strong className="text-[#0A0A0A]">On-Device Folio:</strong> Profile details, Polaroid records, and preferences remain in local browser storage on this device.
                  </li>
                  <li>
                    <strong className="text-[#0A0A0A]">Zero Silent Sharing:</strong> Nothing leaves your browser unless you actively send a Concierge message or opt in to AI Media Safety Check.
                  </li>
                  <li>
                    <strong className="text-[#0A0A0A]">Clean Reset Anytime:</strong> Resetting clears saved browser keys inside Saevy without altering external files or phone call logs.
                  </li>
                </ul>
              </div>

              {/* Power-Button / 3× Rapid Press Choice: Silent SOS vs Louder SOS */}
              <div className="luxury-card-blush p-6 sm:p-7 space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2.5">
                    <span className="material-symbols-outlined text-[#B76E79] text-[20px]">
                      power_settings_new
                    </span>
                    <h3 className="font-display text-xl font-bold text-[#0A0A0A]">
                      3× Rapid Press SOS Mode
                    </h3>
                  </div>
                  <span className="text-xs font-medium text-[#8C6D1F]">
                    Silent or Louder SOS
                  </span>
                </div>

                <p className="text-xs sm:text-sm text-[#5C544E] leading-relaxed">
                  Choose whether pressing 3× rapidly triggers discreet <strong>Silent SOS</strong> (zero sound, shares live GPS + Bluetooth nearby alert) or <strong>Louder SOS</strong> (acoustic siren + live GPS). Test anytime on desktop/mobile by pressing <kbd className="px-1.5 py-0.5 rounded border border-[#D4AF37]/40 text-[11px]">Shift</kbd> 3 times rapidly.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateSettings((s) => ({ ...s, powerTriplePressMode: 'silent_sos' }));
                      onShowToast('3× Rapid Press set to Silent SOS (zero noise)');
                    }}
                    className={`p-4 rounded-[20px] border text-left transition-all ${
                      settings.powerTriplePressMode === 'silent_sos'
                        ? 'bg-[#FFFCF8] border-[#D4AF37] shadow-[0_8px_24px_rgba(212,175,55,0.16)]'
                        : 'bg-[#FFF8F0]/70 border-[#F0E6DC] hover:border-[#D4AF37]/50'
                    }`}
                  >
                    <div className="text-xs font-bold text-[#0A0A0A] flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px] text-[#D4AF37]">
                        volume_off
                      </span>
                      <span>Silent SOS (Discreet)</span>
                    </div>
                    <p className="text-[11px] text-[#5C544E] mt-1 leading-snug">
                      Zero noise — silently locks GPS, alerts Favourites, and pings nearby Saevy Bluetooth peers.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onUpdateSettings((s) => ({ ...s, powerTriplePressMode: 'louder_sos' }));
                      onShowToast('3× Rapid Press set to Louder SOS (siren + GPS)');
                    }}
                    className={`p-4 rounded-[20px] border text-left transition-all ${
                      settings.powerTriplePressMode === 'louder_sos'
                        ? 'bg-[#FFFCF8] border-[#D4AF37] shadow-[0_8px_24px_rgba(212,175,55,0.16)]'
                        : 'bg-[#FFF8F0]/70 border-[#F0E6DC] hover:border-[#D4AF37]/50'
                    }`}
                  >
                    <div className="text-xs font-bold text-[#0A0A0A] flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px] text-[#B76E79]">
                        campaign
                      </span>
                      <span>Louder SOS (Siren)</span>
                    </div>
                    <p className="text-[11px] text-[#5C544E] mt-1 leading-snug">
                      Activates high-attention acoustic deterrent alongside live GPS &amp; emergency dispatch.
                    </p>
                  </button>
                </div>
              </div>

              {/* Camouflage & Quick Exit */}
              <div className="luxury-card p-6 sm:p-7 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="material-symbols-outlined text-[#D4AF37] text-[20px]">
                      visibility_off
                    </span>
                    <h3 className="font-display text-xl font-bold text-[#0A0A0A]">
                      Discreet Calculator Veil
                    </h3>
                  </div>
                  <span className="text-xs text-[#B76E79] font-medium">Instant Screen Veil</span>
                </div>

                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-[#0A0A0A]">
                      Quick Exit Calculator Screen
                    </div>
                    <p className="text-xs text-[#5C544E] leading-relaxed">
                      Veils the interface behind a working minimalist calculator. Enter PIN ({settings.calculatorPin}) followed by &ldquo;=&rdquo; to return.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.fakeCalculatorMode}
                    onClick={() =>
                      onUpdateSettings((s) => ({
                        ...s,
                        fakeCalculatorMode: !s.fakeCalculatorMode,
                      }))
                    }
                    className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full p-0.5 transition-colors border ${
                      settings.fakeCalculatorMode
                        ? 'bg-[#0A0A0A] border-[#D4AF37]'
                        : 'bg-[#F2E7DC] border-[#E2D4C6]'
                    }`}
                  >
                    <span
                      className={`inline-block h-5.5 w-5.5 rounded-full shadow-sm transition-transform ${
                        settings.fakeCalculatorMode
                          ? 'translate-x-5 bg-[#D4AF37]'
                          : 'translate-x-0 bg-[#FFFCF8]'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#F0E6DC]">
                  <button
                    type="button"
                    onClick={onOpenStealthCalculator}
                    className="btn-luxury px-5 text-xs font-medium flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[17px] text-[#D4AF37]">
                      calculate
                    </span>
                    <span>Open Calculator Veil</span>
                  </button>

                  {!editingPin ? (
                    <button
                      type="button"
                      onClick={() => {
                        setPinDraft(settings.calculatorPin);
                        setEditingPin(true);
                      }}
                      className="btn-luxury-outline px-5 text-xs font-medium tabular-nums"
                    >
                      Change PIN ({settings.calculatorPin})
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={pinDraft}
                        onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, ''))}
                        className="w-24 min-h-[48px] px-3 rounded-full bg-[#FFFCF8] border border-[#D4AF37] text-xs text-center text-[#0A0A0A] tabular-nums focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (pinDraft.length >= 3) {
                            onUpdateSettings((s) => ({ ...s, calculatorPin: pinDraft }));
                            setEditingPin(false);
                            onShowToast(`Unlock PIN updated to ${pinDraft}`);
                          }
                        }}
                        className="btn-luxury px-5 text-xs font-medium"
                      >
                        Save
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="lg:col-span-6 space-y-6">
              {/* Clean Bluetooth Peer-to-Peer Sanctuary & Acoustic Gain Card */}
              <div className="luxury-card p-6 sm:p-7 space-y-5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2.5">
                    <span className="material-symbols-outlined text-[#D4AF37] text-[20px]">
                      bluetooth_connected
                    </span>
                    <h3 className="font-display text-xl font-bold text-[#0A0A0A]">
                      Bluetooth Peer-to-Peer Sanctuary
                    </h3>
                  </div>
                  <span className="text-xs font-medium text-[#3E6B4E]">
                    Works Offline · Zero Internet Needed
                  </span>
                </div>

                <p className="text-xs sm:text-sm text-[#5C544E] leading-relaxed">
                  Communicate directly with nearby Saevy phones over Bluetooth when mobile data is unavailable, or send instant 1-tap <strong>&ldquo;Help Me&rdquo;</strong> &amp; <strong>&ldquo;Save Me&rdquo;</strong> alerts with walking arrival ETA.
                </p>

                {onOpenBluetoothSuite && (
                  <button
                    type="button"
                    onClick={onOpenBluetoothSuite}
                    className="btn-luxury w-full px-6 text-xs sm:text-sm font-medium flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[18px] text-[#D4AF37]">
                      bluetooth_searching
                    </span>
                    <span>Open Live Bluetooth Peer Suite</span>
                  </button>
                )}

                {/* Local Siren Gain */}
                <div className="pt-3 border-t border-[#F0E6DC] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[#0A0A0A]">
                      Louder SOS Acoustic Siren Gain
                    </span>
                    <span className="text-xs font-semibold text-[#8C6D1F] tabular-nums">
                      {settings.sirenVolumePercent}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={50}
                    max={100}
                    value={settings.sirenVolumePercent}
                    onChange={(e) =>
                      onUpdateSettings((s) => ({
                        ...s,
                        sirenVolumePercent: Number(e.target.value),
                      }))
                    }
                    aria-label="Local browser alarm relative gain percent"
                    className="w-full accent-[#D4AF37] cursor-pointer"
                  />
                  <p className="text-[11px] text-[#5C544E] leading-relaxed">
                    Controls relative Web Audio gain when Louder SOS is triggered (Silent SOS always remains 0 dB).
                  </p>
                </div>
              </div>

              {/* Appearance & Legibility */}
              <div className="luxury-card-sage p-6 sm:p-7 space-y-4">
                <h3 className="font-display text-xl font-bold text-[#0A0A0A]">
                  Royal Theme &amp; Typography Scale
                </h3>

                <div className="grid grid-cols-3 gap-2 p-1.5 rounded-full bg-[#FFFCF8] border border-[#DFE7DF]">
                  {(
                    [
                      { id: 'dark', label: 'Royal Dark', icon: 'dark_mode' },
                      { id: 'light', label: 'Cashmere Light', icon: 'light_mode' },
                      { id: 'system', label: 'Auto', icon: 'settings_brightness' },
                    ] as const
                  ).map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => onUpdateSettings((s) => ({ ...s, appearance: mode.id }))}
                      className={`min-h-[42px] rounded-full text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                        settings.appearance === mode.id
                          ? 'bg-[#0A0A0A] text-[#FFFCF8] shadow-sm'
                          : 'text-[#5C544E] hover:text-[#0A0A0A]'
                      }`}
                    >
                      <span
                        className={`material-symbols-outlined text-[16px] ${
                          settings.appearance === mode.id ? 'text-[#D4AF37]' : ''
                        }`}
                      >
                        {mode.icon}
                      </span>
                      <span>{mode.label}</span>
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-[#DFE7DF] gap-3">
                  <div>
                    <div className="text-sm font-semibold text-[#0A0A0A]">
                      Editorial Large Text Scale
                    </div>
                    <div className="text-xs text-[#5C544E]">
                      {settings.largeText ? 'Expanded (112.5%)' : 'Standard Boutique (100%)'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSettings((s) => ({ ...s, largeText: !s.largeText }))
                    }
                    className="btn-luxury-outline px-5 text-xs font-medium"
                  >
                    {settings.largeText ? 'Standard Size' : 'Large Text'}
                  </button>
                </div>
              </div>

              {/* Soft Blush Reset Card */}
              <div className="luxury-card-blush p-6 sm:p-7 space-y-4">
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-[#9E2A3B] text-[22px]">
                    restart_alt
                  </span>
                  <h3 className="font-display text-xl font-bold text-[#0A0A0A]">
                    Reset Sanctuary Browser Data
                  </h3>
                </div>
                <p className="text-xs sm:text-sm text-[#5C544E] leading-relaxed">
                  Clears saved entries, Concierge conversations, Polaroids, Atelier bag items, and local preferences in this browser and restores serene defaults.
                </p>

                {!confirmPurgeOpen ? (
                  <button
                    type="button"
                    onClick={() => setConfirmPurgeOpen(true)}
                    className="btn-luxury w-full px-6 text-xs sm:text-sm font-medium flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[18px] text-[#D4AF37]">
                      delete_sweep
                    </span>
                    <span>Reset All Local Sanctuary Data</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        window.localStorage.removeItem(EVIDENCE_STORAGE_KEY);
                        setPolaroids(INITIAL_EVIDENCE_POLAROIDS);
                        onPurgeLocalData();
                        setConfirmPurgeOpen(false);
                      }}
                      className="btn-luxury flex-1 px-5 text-xs sm:text-sm font-medium"
                    >
                      Confirm Reset Now
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmPurgeOpen(false)}
                      className="btn-luxury-outline px-6 text-xs sm:text-sm font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* ======================== 3. SELECT YOUR LANGUAGE — 52 ELEGANT CREAM & GOLD CHIPS ======================== */}
        {subView === 'language' && !evidenceOnlyMode && !orderTrackingOnlyMode && (
          <motion.div
            key="language"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={luxurySpring}
            className="max-w-5xl mx-auto space-y-7"
          >
            {/* Editorial Heading */}
            <div className="text-center space-y-2.5 pt-2">
              <div className="text-xs font-medium tracking-widest text-[#B76E79]">
                Maison Multilingual Suite · 52 Curated Dialects
              </div>
              <h2 className="font-display text-[28px] sm:text-[36px] font-bold tracking-wide text-[#0A0A0A]">
                Select Your Sanctuary Language
              </h2>
              <p className="text-xs sm:text-sm text-[#5C544E] max-w-xl mx-auto leading-relaxed">
                <strong className="text-[#0A0A0A]">English (en-IN)</strong> and{' '}
                <strong className="text-[#0A0A0A]">Hindi (hi-IN)</strong> synchronize full UI labels, voice recognition, spoken replies, and Concierge chat. Regional &amp; global dialects personalize your Sanctuary greeting ribbon.
              </p>
            </div>

            {/* Quick Full-Voice Switcher Card */}
            <div className="luxury-card-blush p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs font-semibold text-[#8C6D1F]">
                  Full Voice · Spoken Audio · Concierge Sync
                </div>
                <p className="text-xs text-[#5C544E] leading-relaxed">
                  Instant full-application translation with synchronized microphone and text-to-speech support.
                </p>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    handleSelectDialect('en', 'English', 'You are safe here.')
                  }
                  className={
                    settings.selectedDialectCode === 'en'
                      ? 'btn-luxury px-5 text-xs font-medium'
                      : 'btn-luxury-outline px-5 text-xs font-medium'
                  }
                >
                  English (en-IN)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleSelectDialect('hi', 'Hindi', 'आप यहाँ सुरक्षित हैं।')
                  }
                  className={
                    settings.selectedDialectCode === 'hi'
                      ? 'btn-luxury px-5 text-xs font-medium'
                      : 'btn-luxury-outline px-5 text-xs font-medium'
                  }
                >
                  हिन्दी · Hindi
                </button>
              </div>
            </div>

            {/* Frosted Search Input */}
            <div className="space-y-2.5">
              <div className="relative">
                <span className="material-symbols-outlined text-[20px] text-[#8C7B6E] absolute left-5 top-1/2 -translate-y-1/2">
                  search
                </span>
                <input
                  type="search"
                  value={dialectSearch}
                  onChange={(e) => setDialectSearch(e.target.value)}
                  placeholder="Search 52 Indian & international dialects (e.g., Hindi, Tamil, French, Japanese)..."
                  className="w-full min-h-[52px] pl-12 pr-5 rounded-full bg-[#FFFCF8] border border-[#F0E6DC] text-sm text-[#0A0A0A] placeholder:text-[#8C7B6E] focus:outline-none focus:border-[#D4AF37] shadow-[0_6px_24px_rgba(0,0,0,0.04)]"
                />
              </div>
              <div className="flex items-center justify-between text-xs text-[#5C544E] px-2 flex-wrap gap-2">
                <span>52 Curated Dialects · Cream &amp; Champagne Gold Grid</span>
                <span>
                  Selected:{' '}
                  <strong className="text-[#0A0A0A]">{selectedDialect.name}</strong>{' '}
                  <span className="text-[#D4AF37]">({selectedDialect.nativeSample})</span>
                </span>
              </div>
            </div>

            {/* 29 Indian Dialects — Cream Chips with Champagne Gold Active Border */}
            {indianDialects.length > 0 && (
              <div className="space-y-3.5">
                <div className="flex items-center justify-between text-xs font-medium text-[#8C6D1F] px-1">
                  <span>Indian Languages &amp; Regional Dialects</span>
                  <span className="tabular-nums">{indianDialects.length} Dialects</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
                  {indianDialects.map((d) => {
                    const active = settings.selectedDialectCode === d.code;
                    const fullSupport = isVoiceAndUiSupportedDialect(d.code);
                    return (
                      <button
                        key={d.code}
                        type="button"
                        onClick={() => handleSelectDialect(d.code, d.name, d.safePhrase)}
                        className={`text-left p-4 rounded-[20px] border transition-all active:scale-[0.98] flex flex-col justify-between gap-2.5 ${
                          active
                            ? 'bg-[#FFFCF8] border-[#D4AF37] ring-1 ring-[#D4AF37]/45 shadow-[0_10px_28px_rgba(212,175,55,0.20)]'
                            : 'bg-[#FFFCF8]/90 border-[#F0E6DC] hover:border-[#D4AF37]/60 shadow-[0_4px_16px_rgba(0,0,0,0.03)]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 w-full">
                          <div className="min-w-0">
                            <div className="font-display font-bold text-base text-[#0A0A0A] truncate">
                              {d.name}
                            </div>
                            <div className="text-[11px] text-[#8C7B6E] truncate">
                              {d.region}
                              {fullSupport ? ' · Full Voice' : ''}
                            </div>
                          </div>
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                              active
                                ? 'bg-[#D4AF37] text-[#0A0A0A]'
                                : 'bg-[#FFF8F0] border border-[#F0E6DC] text-transparent'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[14px]">check</span>
                          </span>
                        </div>

                        <div className="pt-2 border-t border-[#F0E6DC]/80 w-full space-y-0.5">
                          <div className="text-xs font-semibold text-[#B76E79] truncate">
                            {d.nativeSample}
                          </div>
                          <div className="text-[11px] text-[#5C544E] line-clamp-1">
                            {d.safePhrase}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 23 International Dialects — Cream Chips with Champagne Gold Active Border */}
            {globalDialects.length > 0 && (
              <div className="space-y-3.5 pt-2">
                <div className="flex items-center justify-between text-xs font-medium text-[#8C6D1F] px-1">
                  <span>International Languages &amp; Maison Greetings</span>
                  <span className="tabular-nums">{globalDialects.length} Dialects</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
                  {globalDialects.map((d) => {
                    const active = settings.selectedDialectCode === d.code;
                    const fullSupport = isVoiceAndUiSupportedDialect(d.code);
                    return (
                      <button
                        key={d.code}
                        type="button"
                        onClick={() => handleSelectDialect(d.code, d.name, d.safePhrase)}
                        className={`text-left p-4 rounded-[20px] border transition-all active:scale-[0.98] flex flex-col justify-between gap-2.5 ${
                          active
                            ? 'bg-[#FFFCF8] border-[#D4AF37] ring-1 ring-[#D4AF37]/45 shadow-[0_10px_28px_rgba(212,175,55,0.20)]'
                            : 'bg-[#FFFCF8]/90 border-[#F0E6DC] hover:border-[#D4AF37]/60 shadow-[0_4px_16px_rgba(0,0,0,0.03)]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 w-full">
                          <div className="min-w-0">
                            <div className="font-display font-bold text-base text-[#0A0A0A] truncate">
                              {d.name}
                            </div>
                            <div className="text-[11px] text-[#8C7B6E] truncate">
                              {d.region}
                              {fullSupport ? ' · Full Voice' : ''}
                            </div>
                          </div>
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                              active
                                ? 'bg-[#D4AF37] text-[#0A0A0A]'
                                : 'bg-[#FFF8F0] border border-[#F0E6DC] text-transparent'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[14px]">check</span>
                          </span>
                        </div>

                        <div className="pt-2 border-t border-[#F0E6DC]/80 w-full space-y-0.5">
                          <div className="text-xs font-semibold text-[#B76E79] truncate">
                            {d.nativeSample}
                          </div>
                          <div className="text-[11px] text-[#5C544E] line-clamp-1">
                            {d.safePhrase}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Confirm CTA */}
            <div className="sticky bottom-24 lg:bottom-6 z-20 pt-2">
              <button
                type="button"
                onClick={() => {
                  onChangeSubView('profile');
                  onShowToast(`${selectedDialect.name} active: "${selectedDialect.safePhrase}"`);
                }}
                className="btn-luxury w-full px-8 font-medium text-sm sm:text-base flex items-center justify-center gap-2.5"
              >
                <span>{selectedDialect.continueLabel}</span>
                <span className="material-symbols-outlined text-[20px] text-[#D4AF37]">
                  arrow_forward
                </span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
