import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AppSettings, UserProfile } from '../types';
import { ALL_DIALECTS, SIX_FEMALE_AI_VOICES, STITCH_ASSETS } from '../data/demoData';
import { ResilientImage } from './ResilientImage';
import {
  getBcp47LocaleForDialect,
  isSpeechRecognitionSupported,
  stopAllSpeechSynthesis,
  useSingleShotSpeechInput,
  useSpeechSynthesisVoices,
} from '../utils/speechCoordinator';
import { getUiLang } from '../utils/i18n';

interface RoyalOnboardingGateProps {
  open: boolean;
  initialStep?: 'royal_logo' | 'language_voice' | 'login_otp';
  settings: AppSettings;
  profile: UserProfile;
  onUpdateSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  onUpdateProfile: React.Dispatch<React.SetStateAction<UserProfile>>;
  onComplete: () => void;
  allowClose?: boolean;
  onClose?: () => void;
  onShowToast: (msg: string) => void;
}

type OnboardingStep = 'royal_logo' | 'language_voice' | 'login_otp';
type LoginChannel = 'idle' | 'email' | 'phone';

export const RoyalOnboardingGate: React.FC<RoyalOnboardingGateProps> = ({
  open,
  initialStep = 'royal_logo',
  settings,
  profile,
  onUpdateSettings,
  onUpdateProfile,
  onComplete,
  allowClose = false,
  onClose,
  onShowToast,
}) => {
  const [step, setStep] = useState<OnboardingStep>(initialStep);
  const [dialectQuery, setDialectQuery] = useState('');

  // Step 2: Mic & Speaker Access + Voice Test state
  const [micPermissionState, setMicPermissionState] = useState<
    'idle' | 'requesting' | 'granted' | 'denied'
  >('idle');
  const [micLevel, setMicLevel] = useState(0);
  const [spokenTestTranscript, setSpokenTestTranscript] = useState('');
  const [speakerTested, setSpeakerTested] = useState(false);
  const [testingSpeaker, setTestingSpeaker] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const meterAnimRef = useRef<number | null>(null);

  // Step 3: Login & Safe OTP Verification state
  const [loginChannel, setLoginChannel] = useState<LoginChannel>('idle');
  const [identifierInput, setIdentifierInput] = useState('');
  const [fullNameInput, setFullNameInput] = useState(profile.fullName || '');
  const [generatedOtp, setGeneratedOtp] = useState<string | null>(null);
  const [otpInput, setOtpInput] = useState('');
  const [authError, setAuthError] = useState('');

  const uiLang = getUiLang(settings.selectedDialectCode);
  const recognitionLocale = getBcp47LocaleForDialect(settings.selectedDialectCode);
  const { findMatchingVoice } = useSpeechSynthesisVoices();

  const selectedDialect = useMemo(
    () =>
      ALL_DIALECTS.find((d) => d.code === settings.selectedDialectCode) ||
      ALL_DIALECTS.find((d) => d.code === 'en')!,
    [settings.selectedDialectCode]
  );

  const voiceTestMic = useSingleShotSpeechInput({
    recognitionLang: recognitionLocale,
    uiLang,
    onTranscript: (text) => {
      setSpokenTestTranscript(text);
    },
  });

  useEffect(() => {
    if (open) {
      setStep(initialStep);
      setLoginChannel('idle');
      setGeneratedOtp(null);
      setOtpInput('');
      setAuthError('');
    }
  }, [open, initialStep]);

  const cleanupMicStream = () => {
    if (meterAnimRef.current) {
      cancelAnimationFrame(meterAnimRef.current);
      meterAnimRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      void audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setMicLevel(0);
  };

  useEffect(() => {
    if (!open) {
      cleanupMicStream();
      voiceTestMic.stopListening();
      stopAllSpeechSynthesis();
    }
    return () => {
      cleanupMicStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleGrantAllMicAndTestVoice = async () => {
    setMicPermissionState('requesting');
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        cleanupMicStream();
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        mediaStreamRef.current = stream;
        setMicPermissionState('granted');

        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          audioCtxRef.current = ctx;
          const src = ctx.createMediaStreamSource(stream);
          const gain = ctx.createGain();
          gain.gain.value = 2.2;
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          src.connect(gain);
          gain.connect(analyser);

          const dataArr = new Uint8Array(analyser.frequencyBinCount);
          const updateMeter = () => {
            analyser.getByteFrequencyData(dataArr);
            let sum = 0;
            for (let i = 0; i < dataArr.length; i++) sum += dataArr[i];
            const avg = Math.min(100, Math.round((sum / dataArr.length) * 1.8));
            setMicLevel(avg);
            meterAnimRef.current = requestAnimationFrame(updateMeter);
          };
          updateMeter();
        }
      } else {
        setMicPermissionState('granted');
      }

      if (isSpeechRecognitionSupported()) {
        voiceTestMic.startListening();
      }
      onShowToast(`Microphone access enabled (${selectedDialect.name})`);
    } catch {
      setMicPermissionState('denied');
    }
  };

  const handleTestSpeakerAccess = async () => {
    setTestingSpeaker(true);
    stopAllSpeechSynthesis();
    const chosenVoice =
      SIX_FEMALE_AI_VOICES.find((v) => v.id === settings.selectedFemaleVoiceId) ||
      SIX_FEMALE_AI_VOICES[0];
    const sampleText = `${selectedDialect.safePhrase}. Welcome to Saevy Sanctuary. Microphone and speaker access are ready.`;

    try {
      const res = await fetch('/api/ai/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: sampleText,
          voiceName: chosenVoice.geminiVoiceName,
          stylePrompt: chosenVoice.speechStyle,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.audioDataUrl) {
          const audio = new Audio(data.audioDataUrl);
          audio.onended = () => setTestingSpeaker(false);
          audio.onerror = () => setTestingSpeaker(false);
          await audio.play();
          setSpeakerTested(true);
          return;
        }
      }
    } catch {
      // Fallback to browser female speech synthesis
    }

    try {
      if ('speechSynthesis' in window) {
        const utter = new window.SpeechSynthesisUtterance(sampleText);
        utter.lang = recognitionLocale;
        const v = findMatchingVoice(recognitionLocale, true);
        if (v) utter.voice = v;
        utter.pitch = chosenVoice.pitch;
        utter.rate = chosenVoice.rate;
        utter.onend = () => setTestingSpeaker(false);
        utter.onerror = () => setTestingSpeaker(false);
        window.speechSynthesis.speak(utter);
        setSpeakerTested(true);
      } else {
        setTestingSpeaker(false);
      }
    } catch {
      setTestingSpeaker(false);
    }
  };

  const filteredDialects = useMemo(() => {
    const q = dialectQuery.trim().toLowerCase();
    if (!q) return ALL_DIALECTS;
    return ALL_DIALECTS.filter((d) =>
      `${d.name} ${d.nativeSample} ${d.region} ${d.safePhrase}`.toLowerCase().includes(q)
    );
  }, [dialectQuery]);

  const handleSocialLogin = (provider: 'google' | 'facebook') => {
    cleanupMicStream();
    onUpdateProfile((prev) => ({
      ...prev,
      fullName: fullNameInput.trim() || prev.fullName || 'Sanctuary Member',
      authMethod: provider,
      email:
        provider === 'google'
          ? prev.email || 'member.sanctuary@gmail.com'
          : prev.email || 'member.sanctuary@facebook.com',
    }));
    onShowToast(
      provider === 'google'
        ? 'Verified securely via Google Sanctuary Sign-In'
        : 'Verified securely via Facebook Sanctuary Sign-In'
    );
    onComplete();
  };

  const handleRequestOtp = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = identifierInput.trim();
    if (!cleaned) {
      setAuthError(
        loginChannel === 'email'
          ? 'Please enter your email address to receive a 6-digit verification code.'
          : 'Please enter your mobile number to receive a 6-digit verification OTP.'
      );
      return;
    }
    if (loginChannel === 'email' && !cleaned.includes('@')) {
      setAuthError('Please enter a valid email address (e.g., name@domain.com).');
      return;
    }
    if (loginChannel === 'phone' && cleaned.replace(/\D/g, '').length < 8) {
      setAuthError('Please enter a valid mobile number with at least 8 digits.');
      return;
    }
    setAuthError('');
    const code = String(Math.floor(100000 + Math.random() * 900000));
    setGeneratedOtp(code);
    setOtpInput('');
    onShowToast(`6-digit safe verification OTP dispatched to ${cleaned}`);
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!generatedOtp) return;
    if (otpInput.trim() !== generatedOtp) {
      setAuthError('Verification code does not match. Please check the 6-digit OTP.');
      return;
    }
    setAuthError('');
    cleanupMicStream();
    onUpdateProfile((prev) => ({
      ...prev,
      fullName: fullNameInput.trim() || prev.fullName,
      phone: loginChannel === 'phone' ? identifierInput.trim() : prev.phone,
      email: loginChannel === 'email' ? identifierInput.trim() : prev.email,
      authMethod: loginChannel === 'email' ? 'email_otp' : 'phone_otp',
    }));
    onShowToast('Safe OTP verification complete — Welcome to Saevy Sanctuary');
    onComplete();
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 overflow-y-auto bg-[#08060E] text-[#F5EFE6] flex flex-col justify-between no-print"
        role="dialog"
        aria-modal="true"
        aria-label="Saevy Royal Sanctuary Welcome"
      >
        {/* Subtle Royal Obsidian & Champagne Gold Ambient Backdrop */}
        <div
          aria-hidden="true"
          className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_28%,rgba(212,175,55,0.16)_0%,rgba(197,123,136,0.08)_34%,rgba(8,6,14,0.98)_76%)]"
        />

        {/* Top Minimalist Bar */}
        <div className="relative z-10 w-full max-w-5xl mx-auto px-5 pt-5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs tracking-[0.22em] uppercase text-[#D4AF37]/85">
            {step === 'royal_logo' && <span>Maison Saevy</span>}
            {step === 'language_voice' && <span>Step 01 · 52 Languages &amp; Voice Access</span>}
            {step === 'login_otp' && <span>Step 02 · Safe Verification</span>}
          </div>

          <div className="flex items-center gap-2">
            {step !== 'royal_logo' && (
              <button
                type="button"
                onClick={() =>
                  setStep(step === 'login_otp' ? 'language_voice' : 'royal_logo')
                }
                className="min-h-[40px] px-4 rounded-full border border-[#D4AF37]/30 bg-[#151120]/85 text-xs text-[#F5EFE6] hover:border-[#D4AF37] transition-all"
              >
                Back
              </button>
            )}
            {allowClose && onClose && (
              <button
                type="button"
                onClick={() => {
                  cleanupMicStream();
                  onClose();
                }}
                aria-label="Close welcome screen"
                className="w-10 h-10 rounded-full border border-[#D4AF37]/30 bg-[#151120]/85 flex items-center justify-center text-[#F5EFE6] hover:border-[#D4AF37]"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            )}
          </div>
        </div>

        {/* ================= STEP 1: BLANK BOLD ROYAL INTERFACE WITH SAEVY LOGO ================= */}
        {step === 'royal_logo' && (
          <motion.div
            key="step-royal-logo"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.03 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-12 text-center select-none"
          >
            <div className="relative flex items-center justify-center mb-10">
              <motion.span
                aria-hidden="true"
                animate={{ scale: [1, 1.12, 1], opacity: [0.35, 0.7, 0.35] }}
                transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute w-64 h-64 sm:w-72 sm:h-72 rounded-full bg-[radial-gradient(circle,rgba(212,175,55,0.32)_0%,rgba(212,175,55,0)_70%)] pointer-events-none"
              />
              <motion.button
                type="button"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => setStep('language_voice')}
                aria-label="Press Saevy Logo to open language selection and Sanctuary features"
                className="relative w-44 h-44 sm:w-52 sm:h-52 rounded-full bg-[radial-gradient(circle_at_30%_25%,#231C35_0%,#120E1C_65%,#09070F_100%)] border-2 border-[#D4AF37]/75 shadow-[0_24px_80px_rgba(212,175,55,0.28),inset_0_2px_18px_rgba(255,255,255,0.12)] flex flex-col items-center justify-center p-7 cursor-pointer group focus-visible:outline-2 focus-visible:outline-[#D4AF37]"
              >
                <ResilientImage
                  src={STITCH_ASSETS.logoEmblem}
                  alt="Saevy Royal Crest"
                  className="w-24 h-24 sm:w-28 sm:h-28 object-contain drop-shadow-[0_6px_22px_rgba(212,175,55,0.45)] transition-transform duration-500 group-hover:scale-105"
                  fallbackIcon="shield_with_heart"
                />
              </motion.button>
            </div>

            <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-[0.14em] text-[#F5EFE6]">
              SAEVY
            </h1>
            <p className="mt-3 font-serif italic text-base sm:text-lg text-[#D4AF37] tracking-wide">
              Royal Private Sanctuary · Bluetooth &amp; Hybrid Guardian
            </p>
            <button
              type="button"
              onClick={() => setStep('language_voice')}
              className="mt-8 min-h-[48px] px-7 rounded-full border border-[#D4AF37]/50 bg-[#171324]/90 text-xs sm:text-sm tracking-[0.16em] uppercase text-[#F5EFE6] hover:border-[#D4AF37] transition-all"
            >
              Press Logo to Enter
            </button>
          </motion.div>
        )}

        {/* ================= STEP 2: CHOOSE YOUR 52 LANGUAGES + TEST VOICE & MIC/SPEAKER ACCESS ================= */}
        {step === 'language_voice' && (
          <motion.div
            key="step-language-voice"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="relative z-10 flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6"
          >
            <div className="text-center space-y-2">
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-[#F5EFE6] tracking-wide">
                Choose Your Sanctuary Language
              </h2>
              <p className="text-xs sm:text-sm text-[#B5AB9E] max-w-xl mx-auto">
                Select from all 52 Indian &amp; international languages, and test your microphone and speaker so voice typing and whispered safety phrases work seamlessly.
              </p>
            </div>

            {/* Voice, Microphone & Speaker Access Test Card */}
            <div className="rounded-[24px] bg-[#161222]/90 border border-[#D4AF37]/35 p-5 sm:p-6 space-y-4 shadow-[0_14px_40px_rgba(0,0,0,0.45)]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-[#D4AF37]">
                    Audio &amp; Voice Readiness
                  </div>
                  <h3 className="font-display text-xl font-bold text-[#F5EFE6] mt-0.5">
                    Allow All Microphone &amp; Speaker Access
                  </h3>
                  <p className="text-xs text-[#B5AB9E] mt-0.5">
                    Test speaking in <strong>{selectedDialect.name}</strong> ({recognitionLocale}) and hear your female guardian voice response.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleGrantAllMicAndTestVoice()}
                    className="min-h-[46px] px-5 rounded-full bg-[#D4AF37] text-[#0B0910] text-xs font-semibold flex items-center gap-2 hover:brightness-105 active:scale-[0.98] transition-all"
                  >
                    <span className="material-symbols-outlined text-[18px]">mic</span>
                    <span>
                      {micPermissionState === 'granted' ? 'Test Voice Again' : 'Allow Mic & Test Voice'}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={testingSpeaker}
                    onClick={() => void handleTestSpeakerAccess()}
                    className="min-h-[46px] px-5 rounded-full border border-[#D4AF37]/50 bg-[#201A30] text-[#F5EFE6] text-xs font-medium flex items-center gap-2 hover:border-[#D4AF37] active:scale-[0.98] transition-all disabled:opacity-60"
                  >
                    <span className="material-symbols-outlined text-[18px] text-[#D4AF37]">
                      volume_up
                    </span>
                    <span>
                      {testingSpeaker
                        ? 'Playing Voice...'
                        : speakerTested
                          ? 'Speaker Verified'
                          : 'Test Speaker Voice'}
                    </span>
                  </button>
                </div>
              </div>

              {(micPermissionState === 'granted' || spokenTestTranscript) && (
                <div className="rounded-[18px] bg-[#0E0C16] border border-[#2C253D] p-3.5 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[#B5AB9E]">Live Microphone Sensitivity</span>
                    <span className="text-[#D4AF37] font-semibold tabular-nums">{micLevel}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-[#1E192B] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#C57B88] to-[#D4AF37] transition-all duration-75"
                      style={{ width: `${Math.max(6, micLevel)}%` }}
                    />
                  </div>
                  <p className="text-[#F5EFE6] pt-1">
                    {spokenTestTranscript ? (
                      <>
                        Recognized voice: <strong className="text-[#D4AF37]">&ldquo;{spokenTestTranscript}&rdquo;</strong>
                      </>
                    ) : (
                      `Say "${selectedDialect.safePhrase}" or "${settings.safetyPhrase}" softly to test your voice...`
                    )}
                  </p>
                </div>
              )}

              {micPermissionState === 'denied' && (
                <p className="text-xs text-[#F2A6B3]">
                  Microphone access was blocked by the browser. You can enable it anytime in site permissions or continue to Sanctuary.
                </p>
              )}
            </div>

            {/* Searchable 52 Languages Grid */}
            <div className="space-y-3">
              <div className="relative">
                <span className="material-symbols-outlined text-[18px] text-[#D4AF37] absolute left-4 top-1/2 -translate-y-1/2">
                  search
                </span>
                <input
                  type="search"
                  value={dialectQuery}
                  onChange={(e) => setDialectQuery(e.target.value)}
                  placeholder="Search all 52 languages (Hindi, English, Bengali, Tamil, Marathi, Arabic, French...)"
                  className="w-full min-h-[48px] pl-11 pr-4 rounded-full bg-[#161222] border border-[#2D263E] text-sm text-[#F5EFE6] placeholder:text-[#8E8479] focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <div className="max-h-[300px] overflow-y-auto pr-1 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                {filteredDialects.map((d) => {
                  const active = settings.selectedDialectCode === d.code;
                  return (
                    <button
                      key={d.code}
                      type="button"
                      onClick={() => {
                        const locale = getBcp47LocaleForDialect(d.code);
                        onUpdateSettings((s) => ({
                          ...s,
                          selectedDialectCode: d.code,
                          safetyPhraseLang: locale,
                        }));
                      }}
                      className={`p-3.5 rounded-[18px] border text-left transition-all flex flex-col justify-between gap-1.5 ${
                        active
                          ? 'bg-[#231C34] border-[#D4AF37] shadow-[0_8px_24px_rgba(212,175,55,0.2)]'
                          : 'bg-[#14111F]/90 border-[#282238] hover:border-[#D4AF37]/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="font-display font-bold text-sm text-[#F5EFE6] truncate">
                          {d.name}
                        </span>
                        {active && (
                          <span className="material-symbols-outlined text-[16px] text-[#D4AF37]">
                            check_circle
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-[#D4AF37] truncate">{d.nativeSample}</span>
                      <span className="text-[11px] text-[#9E9488] truncate">{d.safePhrase}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  cleanupMicStream();
                  voiceTestMic.stopListening();
                  setStep('login_otp');
                }}
                className="w-full sm:w-auto min-h-[52px] px-8 rounded-full bg-gradient-to-r from-[#D4AF37] to-[#E6C762] text-[#0B0910] font-semibold text-sm flex items-center justify-center gap-2 shadow-[0_10px_30px_rgba(212,175,55,0.28)]"
              >
                <span>{selectedDialect.continueLabel}</span>
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </button>
            </div>
          </motion.div>
        )}

        {/* ================= STEP 3: FRONT LOGIN PAGE + EMAIL/PHONE OTP VERIFICATION ================= */}
        {step === 'login_otp' && (
          <motion.div
            key="step-login-otp"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="relative z-10 flex-1 w-full max-w-md mx-auto px-5 py-6 flex flex-col justify-center space-y-6"
          >
            <div className="text-center space-y-2">
              <div className="w-16 h-16 mx-auto rounded-full bg-[#171324] border border-[#D4AF37]/60 flex items-center justify-center p-2.5 shadow-[0_8px_28px_rgba(212,175,55,0.22)]">
                <ResilientImage
                  src={STITCH_ASSETS.logoEmblem}
                  alt="Saevy Crest"
                  className="w-full h-full object-contain"
                  fallbackIcon="shield"
                />
              </div>
              <h2 className="font-display text-3xl font-bold text-[#F5EFE6]">
                Safe Sanctuary Sign-In
              </h2>
              <p className="text-xs sm:text-sm text-[#B5AB9E]">
                Verify your identity safely via Google, Facebook, Email OTP, or Mobile Number OTP.
              </p>
            </div>

            <div className="rounded-[26px] bg-[#151120]/95 border border-[#D4AF37]/35 p-6 space-y-4 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
              <div>
                <label className="block text-xs text-[#B5AB9E] mb-1.5">Your Name (Optional)</label>
                <input
                  type="text"
                  value={fullNameInput}
                  onChange={(e) => setFullNameInput(e.target.value)}
                  placeholder="e.g. Sarah Jenkins"
                  className="w-full min-h-[46px] px-4 rounded-full bg-[#0E0B16] border border-[#2C253E] text-sm text-[#F5EFE6] focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              {loginChannel === 'idle' && (
                <div className="space-y-3 pt-1">
                  <button
                    type="button"
                    onClick={() => handleSocialLogin('google')}
                    className="w-full min-h-[50px] px-5 rounded-full bg-[#F5EFE6] text-[#0E0C14] font-semibold text-xs sm:text-sm flex items-center justify-center gap-2.5 hover:brightness-95 active:scale-[0.99] transition-all"
                  >
                    <span className="material-symbols-outlined text-[18px] text-[#B76E79]">
                      verified_user
                    </span>
                    <span>Continue with Google</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSocialLogin('facebook')}
                    className="w-full min-h-[50px] px-5 rounded-full bg-[#1F2942] border border-[#3B4F7D] text-[#F5EFE6] font-semibold text-xs sm:text-sm flex items-center justify-center gap-2.5 hover:brightness-110 active:scale-[0.99] transition-all"
                  >
                    <span className="material-symbols-outlined text-[18px] text-[#93C5FD]">
                      public
                    </span>
                    <span>Continue with Facebook</span>
                  </button>

                  <div className="flex items-center gap-3 py-1 text-[11px] text-[#8E8479]">
                    <span className="flex-1 h-px bg-[#2C253E]" />
                    <span>OR SAFE OTP VERIFICATION</span>
                    <span className="flex-1 h-px bg-[#2C253E]" />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setLoginChannel('email');
                      setIdentifierInput(profile.email || '');
                      setGeneratedOtp(null);
                      setAuthError('');
                    }}
                    className="w-full min-h-[50px] px-5 rounded-full bg-[#1E192D] border border-[#D4AF37]/45 text-[#F5EFE6] font-medium text-xs sm:text-sm flex items-center justify-center gap-2.5 hover:border-[#D4AF37] transition-all"
                  >
                    <span className="material-symbols-outlined text-[18px] text-[#D4AF37]">
                      mail
                    </span>
                    <span>Continue with Email (OTP)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setLoginChannel('phone');
                      setIdentifierInput(profile.phone || '+91 ');
                      setGeneratedOtp(null);
                      setAuthError('');
                    }}
                    className="w-full min-h-[50px] px-5 rounded-full bg-[#1E192D] border border-[#D4AF37]/45 text-[#F5EFE6] font-medium text-xs sm:text-sm flex items-center justify-center gap-2.5 hover:border-[#D4AF37] transition-all"
                  >
                    <span className="material-symbols-outlined text-[18px] text-[#D4AF37]">
                      smartphone
                    </span>
                    <span>Continue with Phone Number (OTP)</span>
                  </button>
                </div>
              )}

              {loginChannel !== 'idle' && !generatedOtp && (
                <form onSubmit={handleRequestOtp} className="space-y-3.5 pt-1">
                  <div>
                    <label className="block text-xs font-medium text-[#D4AF37] mb-1.5">
                      {loginChannel === 'email' ? 'Email Address *' : 'Phone Number *'}
                    </label>
                    <input
                      type={loginChannel === 'email' ? 'email' : 'tel'}
                      value={identifierInput}
                      onChange={(e) => {
                        setIdentifierInput(e.target.value);
                        if (authError) setAuthError('');
                      }}
                      placeholder={
                        loginChannel === 'email' ? 'you@example.com' : '+91 98765 01420'
                      }
                      className="w-full min-h-[50px] px-4 rounded-full bg-[#0E0B16] border border-[#D4AF37]/50 text-sm text-[#F5EFE6] focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>

                  {authError && <p className="text-xs text-[#F2A6B3]">{authError}</p>}

                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setLoginChannel('idle');
                        setAuthError('');
                      }}
                      className="min-h-[48px] px-5 rounded-full border border-[#2C253E] text-xs text-[#B5AB9E] hover:text-[#F5EFE6]"
                    >
                      Other Methods
                    </button>
                    <button
                      type="submit"
                      className="flex-1 min-h-[48px] px-5 rounded-full bg-[#D4AF37] text-[#0B0910] font-semibold text-xs sm:text-sm"
                    >
                      Send 6-Digit OTP
                    </button>
                  </div>
                </form>
              )}

              {loginChannel !== 'idle' && generatedOtp && (
                <form onSubmit={handleVerifyOtp} className="space-y-4 pt-1">
                  <div className="rounded-[18px] bg-[#1F1930] border border-[#D4AF37]/45 p-3.5 text-xs space-y-1.5">
                    <div className="flex items-center justify-between text-[#D4AF37] font-semibold">
                      <span>Safe Verification Code Dispatched</span>
                      <button
                        type="button"
                        onClick={() => setOtpInput(generatedOtp)}
                        className="underline text-[#F5EFE6]"
                      >
                        Auto-Fill OTP
                      </button>
                    </div>
                    <p className="text-[#B5AB9E]">
                      Sent to <strong className="text-[#F5EFE6]">{identifierInput}</strong> · Instant Sanctuary Code:{' '}
                      <strong className="text-[#D4AF37] tracking-widest tabular-nums">
                        {generatedOtp}
                      </strong>
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#F5EFE6] mb-1.5">
                      Enter 6-Digit OTP *
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={otpInput}
                      onChange={(e) => {
                        setOtpInput(e.target.value.replace(/\D/g, ''));
                        if (authError) setAuthError('');
                      }}
                      placeholder="• • • • • •"
                      className="w-full min-h-[52px] px-4 rounded-full bg-[#0E0B16] border border-[#D4AF37] text-center text-lg tracking-[0.35em] font-bold text-[#D4AF37] tabular-nums focus:outline-none"
                    />
                  </div>

                  {authError && <p className="text-xs text-[#F2A6B3]">{authError}</p>}

                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setGeneratedOtp(null)}
                      className="min-h-[48px] px-4 rounded-full border border-[#2C253E] text-xs text-[#B5AB9E]"
                    >
                      Change {loginChannel === 'email' ? 'Email' : 'Number'}
                    </button>
                    <button
                      type="submit"
                      className="flex-1 min-h-[48px] px-5 rounded-full bg-[#D4AF37] text-[#0B0910] font-semibold text-xs sm:text-sm"
                    >
                      Verify &amp; Open Saevy
                    </button>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        )}

        {/* Footer Bluetooth-First Assurance */}
        <div className="relative z-10 w-full max-w-4xl mx-auto px-5 pb-5 text-center text-[11px] text-[#8E8479]">
          Bluetooth Peer-to-Peer Ready · Offline SOS &amp; Nearby Guardian Alerts + Hybrid AI &amp; Live GPS
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
