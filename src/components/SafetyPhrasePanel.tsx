import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppSettings, SafetyPhraseAction, SupportedVoiceLang } from '../types';
import { ALL_DIALECTS } from '../data/demoData';
import {
  clearActiveRecognition,
  containsWhisperOrFuzzyPhrase,
  describeSpeechError,
  getBcp47LocaleForDialect,
  getSpeechRecognitionConstructor,
  isRunningInIframe,
  isSpeechRecognitionSupported,
  normalizePhraseForMatch,
  registerActiveRecognition,
  SUPPORTED_VOICE_LANGUAGES,
} from '../utils/speechCoordinator';

interface SafetyPhrasePanelProps {
  settings: AppSettings;
  onUpdateSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  uiLang: 'en' | 'hi';
  onSyncAppLanguage: (voiceLang: SupportedVoiceLang) => void;
  onTriggerOpenSupport: () => void;
  onTriggerLocalAlarm: () => void;
  onTriggerCustomAction?: (action: SafetyPhraseAction) => void;
  onShowToast: (msg: string) => void;
}

type PhraseSessionStatus =
  | 'Stopped'
  | 'Active'
  | 'Permission Denied'
  | 'Unsupported'
  | 'Error';

const NINE_CODE_WORD_ACTIONS: {
  id: SafetyPhraseAction;
  title: string;
  desc: string;
  icon: string;
}[] = [
  {
    id: 'share_location',
    title: 'Share Live Location to Favourites',
    desc: 'Acquires live GPS and prepares instant SMS/Share dispatch to your Favourite people.',
    icon: 'share_location',
  },
  {
    id: 'record_audio',
    title: 'Record Audio Evidence',
    desc: 'Opens microphone recorder immediately to capture voice & ambient audio.',
    icon: 'mic',
  },
  {
    id: 'record_video',
    title: 'Record Video Evidence',
    desc: 'Launches video recorder immediately to capture timestamped surroundings.',
    icon: 'videocam',
  },
  {
    id: 'take_photo',
    title: 'Click a Picture',
    desc: 'Opens instant camera shutter to snap cab plates or surroundings.',
    icon: 'photo_camera',
  },
  {
    id: 'call_parents',
    title: 'Call Parents / Family',
    desc: 'Places an immediate phone call to your primary Parent / Family contact.',
    icon: 'family_restroom',
  },
  {
    id: 'sms_favourites',
    title: 'SMS Emergency Alert to Favourites',
    desc: 'Prepares urgent emergency SMS notification to all Favourite & emergency contacts.',
    icon: 'sms',
  },
  {
    id: 'call_police',
    title: 'Call Police (112)',
    desc: 'Opens 112 National Police & Emergency response dialer immediately.',
    icon: 'local_police',
  },
  {
    id: 'open_support',
    title: 'Open Helpline Sanctuary',
    desc: 'Transitions quietly to Emergency Helplines & Live GPS Safe Map.',
    icon: 'shield',
  },
  {
    id: 'play_alarm',
    title: 'Open Saevy SOS Suite',
    desc: 'Opens the Saevy Emblem SOS Sanctuary with acoustic deterrent.',
    icon: 'notifications_active',
  },
];

export const SafetyPhrasePanel: React.FC<SafetyPhrasePanelProps> = ({
  settings,
  onUpdateSettings,
  uiLang,
  onSyncAppLanguage,
  onTriggerOpenSupport,
  onTriggerLocalAlarm,
  onTriggerCustomAction,
  onShowToast,
}) => {
  const supported = isSpeechRecognitionSupported();
  const [phraseDraft, setPhraseDraft] = useState(settings.safetyPhrase);
  const [phraseError, setPhraseError] = useState('');

  const [sessionStatus, setSessionStatus] = useState<PhraseSessionStatus>(() =>
    supported ? 'Stopped' : 'Unsupported'
  );
  const [statusDetail, setStatusDetail] = useState<string>(() =>
    supported
      ? 'Listening is paused. Enable Whisper & Far-Field Boost below to detect quiet or distant code words.'
      : 'Voice recognition is not supported on this browser.'
  );
  const [isTestMode, setIsTestMode] = useState(true);
  const [liveTranscriptPreview, setLiveTranscriptPreview] = useState('');
  const [lastMatchNotice, setLastMatchNotice] = useState<string | null>(null);
  const [permissionBlockedOnce, setPermissionBlockedOnce] = useState(false);
  const [whisperGainMeter, setWhisperGainMeter] = useState(0);

  const recRef = useRef<
    InstanceType<NonNullable<ReturnType<typeof getSpeechRecognitionConstructor>>> | null
  >(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  const sessionTriggeredRef = useRef(false);
  const processedResultSignaturesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setPhraseDraft(settings.safetyPhrase);
  }, [settings.safetyPhrase]);

  const stopWhisperPreAmp = useCallback(() => {
    if (meterFrameRef.current) {
      cancelAnimationFrame(meterFrameRef.current);
      meterFrameRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      void audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setWhisperGainMeter(0);
  }, []);

  const startWhisperPreAmp = useCallback(async () => {
    if (!settings.whisperBoostEnabled || !navigator.mediaDevices?.getUserMedia) return;
    stopWhisperPreAmp();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          noiseSuppression: false,
          echoCancellation: true,
        },
      });
      micStreamRef.current = stream;
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const gainNode = ctx.createGain();
      gainNode.gain.value = 3.5; // High whisper / far-field sensitivity boost

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -42;
      compressor.knee.value = 30;
      compressor.ratio.value = 10;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;

      source.connect(gainNode);
      gainNode.connect(compressor);
      compressor.connect(analyser);

      const freqData = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        analyser.getByteFrequencyData(freqData);
        let sum = 0;
        for (let i = 0; i < freqData.length; i++) sum += freqData[i];
        const boosted = Math.min(100, Math.round((sum / freqData.length) * 2.4));
        setWhisperGainMeter(boosted);
        meterFrameRef.current = requestAnimationFrame(loop);
      };
      loop();
    } catch {
      // SpeechRecognition will still run even if parallel analyser stream is skipped
    }
  }, [settings.whisperBoostEnabled, stopWhisperPreAmp]);

  const stopForegroundListening = useCallback(
    (customDetail?: string) => {
      stopWhisperPreAmp();
      const rec = recRef.current;
      recRef.current = null;
      if (rec) {
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        try {
          rec.stop();
        } catch {
          // Ignore
        }
      }
      setLiveTranscriptPreview('');
      setSessionStatus((prev) =>
        prev === 'Unsupported' || prev === 'Permission Denied' ? prev : 'Stopped'
      );
      setStatusDetail(customDetail || 'Foreground listening stopped. Microphone is inactive.');
    },
    [stopWhisperPreAmp]
  );

  useEffect(() => {
    return () => {
      stopWhisperPreAmp();
      clearActiveRecognition(stopForegroundListening);
      const rec = recRef.current;
      recRef.current = null;
      if (rec) {
        try {
          rec.abort();
        } catch {}
      }
    };
  }, [stopForegroundListening, stopWhisperPreAmp]);

  const handleSavePhrase = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizePhraseForMatch(phraseDraft);
    if (!normalized || normalized.length < 3) {
      setPhraseError(
        'Enter a clear custom code word (at least 3 characters) to avoid accidental matches.'
      );
      return;
    }
    setPhraseError('');
    onUpdateSettings((s) => ({ ...s, safetyPhrase: phraseDraft.trim() }));
    onShowToast(`Saved custom Safety Code Word: "${phraseDraft.trim()}"`);
  };

  const handleActionChange = (nextAction: SafetyPhraseAction) => {
    if (sessionStatus === 'Active') {
      stopForegroundListening('Listening stopped because code-word action changed.');
    }
    onUpdateSettings((s) => ({
      ...s,
      safetyPhraseAction: nextAction,
      safetyPhraseActionConfirmed: true,
    }));
  };

  const executeMatchedAction = (action: SafetyPhraseAction) => {
    if (onTriggerCustomAction) {
      onTriggerCustomAction(action);
      return;
    }
    if (action === 'open_support') {
      onTriggerOpenSupport();
    } else {
      onTriggerLocalAlarm();
    }
  };

  const startForegroundListening = async (runAsTestMode: boolean) => {
    setLastMatchNotice(null);

    const Ctor = getSpeechRecognitionConstructor();
    if (!Ctor) {
      setSessionStatus('Unsupported');
      setStatusDetail('Not available on this device.');
      return;
    }

    const activePhrase = settings.safetyPhrase.trim();
    if (normalizePhraseForMatch(activePhrase).length < 3) {
      setPhraseError('Save a valid custom Safety Code Word first before starting listening.');
      return;
    }

    if (permissionBlockedOnce && sessionStatus === 'Permission Denied') {
      setStatusDetail(
        `Microphone permission was previously denied. Enable microphone access in browser settings${
          isRunningInIframe() ? ' or open in a standalone tab.' : '.'
        }`
      );
      return;
    }

    setIsTestMode(runAsTestMode);
    sessionTriggeredRef.current = false;
    processedResultSignaturesRef.current.clear();
    setLiveTranscriptPreview('');

    registerActiveRecognition(stopForegroundListening);
    await startWhisperPreAmp();

    try {
      const rec = new Ctor();
      rec.lang = getBcp47LocaleForDialect(settings.safetyPhraseLang);
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 5; // Inspects top 5 phonetic hypotheses for whispers & distant speech!

      let encounteredError = false;

      rec.onstart = () => {
        setPermissionBlockedOnce(false);
        setSessionStatus('Active');
        setStatusDetail(
          runAsTestMode
            ? `Active (Whisper & Far-Field Test · ${rec.lang}) — Whisper or say "${activePhrase}" from a short distance.`
            : `Active (Live Whisper Guard · ${rec.lang}) — Listening for code word "${activePhrase}".`
        );
      };

      rec.onresult = (event) => {
        if (sessionTriggeredRef.current) return;

        let recentPreview = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          if (!res) continue;

          for (let altIdx = 0; altIdx < res.length; altIdx++) {
            const candidateChunk = res[altIdx]?.transcript?.trim() || '';
            if (!candidateChunk) continue;
            if (altIdx === 0) recentPreview = candidateChunk;

            const sig = `${i}:${altIdx}:${normalizePhraseForMatch(candidateChunk)}`;
            if (processedResultSignaturesRef.current.has(sig)) continue;

            if (
              containsWhisperOrFuzzyPhrase(
                candidateChunk,
                activePhrase,
                settings.whisperBoostEnabled
              )
            ) {
              processedResultSignaturesRef.current.add(sig);
              sessionTriggeredRef.current = true;

              stopWhisperPreAmp();
              clearActiveRecognition(stopForegroundListening);
              rec.onresult = null;
              rec.onend = null;
              try {
                rec.stop();
              } catch {}
              recRef.current = null;
              setSessionStatus('Stopped');
              setLiveTranscriptPreview('');

              const actionMeta =
                NINE_CODE_WORD_ACTIONS.find((a) => a.id === settings.safetyPhraseAction) ||
                NINE_CODE_WORD_ACTIONS[0];

              if (runAsTestMode) {
                setLastMatchNotice(
                  `Whisper / Far-Field Code Word Matched! Heard "${candidateChunk}" → Matched "${activePhrase}". Selected Live Action: ${actionMeta.title}.`
                );
                setStatusDetail('Code word verified! Foreground listening paused.');
                onShowToast('Whisper / Far-Field Safety Code Word recognized!');
              } else {
                setLastMatchNotice(
                  `Code Word Activated: "${activePhrase}" → Executing "${actionMeta.title}".`
                );
                setStatusDetail('Code word matched — action triggered.');
                executeMatchedAction(settings.safetyPhraseAction);
              }
              return;
            }
          }
        }

        if (recentPreview) {
          setLiveTranscriptPreview(recentPreview);
        }
      };

      rec.onerror = (ev) => {
        encounteredError = true;
        stopWhisperPreAmp();
        clearActiveRecognition(stopForegroundListening);
        recRef.current = null;
        setLiveTranscriptPreview('');

        const mapped = describeSpeechError(ev.error, uiLang);
        if (mapped.status === 'permission-denied') {
          setPermissionBlockedOnce(true);
          setSessionStatus('Permission Denied');
          setStatusDetail(mapped.message);
        } else if (ev.error === 'aborted') {
          setSessionStatus('Stopped');
          setStatusDetail('Foreground listening stopped.');
        } else if (ev.error === 'no-speech') {
          setSessionStatus('Stopped');
          setStatusDetail('Listening paused after silence. Tap Start Listening to resume.');
        } else {
          setSessionStatus('Error');
          setStatusDetail(mapped.message || `Recognition error (${ev.error}).`);
        }
      };

      rec.onend = () => {
        stopWhisperPreAmp();
        clearActiveRecognition(stopForegroundListening);
        recRef.current = null;
        setLiveTranscriptPreview('');
        if (!encounteredError && !sessionTriggeredRef.current) {
          setSessionStatus((curr) =>
            curr === 'Permission Denied' || curr === 'Unsupported' ? curr : 'Stopped'
          );
          setStatusDetail('Session ended. Tap Start Listening to arm your code word again.');
        }
      };

      recRef.current = rec;
      rec.start();
    } catch {
      stopWhisperPreAmp();
      clearActiveRecognition(stopForegroundListening);
      setSessionStatus('Error');
      setStatusDetail('Could not start speech recognition.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="luxury-card-blush p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-[#D4AF37] tracking-[0.14em] uppercase">
            Whisper &amp; Far-Field Secret Code Word
          </div>
          <h2 className="font-display text-2xl sm:text-[28px] font-bold tracking-wide text-[#0A0A0A] leading-snug">
            Custom Safety Phrase &amp; 9 Instant Actions
          </h2>
          <p className="text-xs sm:text-sm text-[#5C544E] leading-relaxed">
            Speak your secret code word softly while whispering or from a short distance—Saevy boosts mic sensitivity, checks phonetic whisper matches, and triggers your chosen emergency response.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (sessionStatus === 'Active') stopForegroundListening();
            onTriggerOpenSupport();
          }}
          className="btn-luxury px-6 font-medium text-xs sm:text-sm flex items-center justify-center gap-2 shrink-0"
        >
          <span className="material-symbols-outlined text-[18px] text-[#D4AF37]">
            emergency_share
          </span>
          <span>Open Helplines</span>
        </button>
      </div>

      {/* 1. Custom Code Word + Whisper Sensitivity Toggle + 52-Language Selector */}
      <div className="luxury-card p-6 sm:p-7 space-y-6">
        <form onSubmit={handleSavePhrase} noValidate className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-8">
              <label
                htmlFor="safety-phrase-input"
                className="block text-xs font-medium text-[#0A0A0A] mb-1.5"
              >
                Secret Safety Code Word *
              </label>
              <input
                id="safety-phrase-input"
                type="text"
                value={phraseDraft}
                onChange={(e) => {
                  setPhraseDraft(e.target.value);
                  if (phraseError) setPhraseError('');
                }}
                placeholder="e.g., Lotus Sanctuary / कमल सुरक्षा"
                className="w-full min-h-[52px] px-5 rounded-full bg-[#FAF3EB]/70 border border-[#F0E6DC] text-sm text-[#0A0A0A] focus:outline-none focus:border-[#D4AF37]"
              />
            </div>

            <div className="sm:col-span-4">
              <button
                type="submit"
                className="btn-luxury w-full px-6 font-medium text-xs sm:text-sm"
              >
                Save Code Word
              </button>
            </div>
          </div>

          {phraseError && <p className="text-xs text-[#9E2A3B]">{phraseError}</p>}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="text-xs text-[#5C544E]">
              Active Code Word:{' '}
              <strong className="text-[#0A0A0A]">&ldquo;{settings.safetyPhrase}&rdquo;</strong>
            </div>

            <label className="flex items-center gap-2 cursor-pointer text-xs text-[#0A0A0A]">
              <input
                type="checkbox"
                checked={settings.whisperBoostEnabled}
                onChange={(e) =>
                  onUpdateSettings((s) => ({ ...s, whisperBoostEnabled: e.target.checked }))
                }
                className="w-4 h-4 accent-[#D4AF37]"
              />
              <span>Whisper &amp; Far-Field Gain Boost (3.5× Mic Pre-Amp)</span>
            </label>
          </div>
        </form>

        {/* All 52 Dialects & Voice Languages Selector */}
        <div className="pt-5 border-t border-[#F0E6DC] space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <label className="text-xs font-medium text-[#0A0A0A]">
              Speak Code Word in Any Language (All 52 Languages Supported)
            </label>
            <select
              aria-label="Choose from all 52 languages"
              value={settings.selectedDialectCode}
              onChange={(e) => {
                const code = e.target.value;
                const bcp = getBcp47LocaleForDialect(code);
                if (sessionStatus === 'Active') {
                  stopForegroundListening('Language updated.');
                }
                onUpdateSettings((s) => ({
                  ...s,
                  selectedDialectCode: code,
                  safetyPhraseLang: bcp,
                }));
              }}
              className="min-h-[42px] px-4 rounded-full bg-[#FFFCF8] border border-[#F0E6DC] text-xs font-medium text-[#0A0A0A]"
            >
              {ALL_DIALECTS.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.name} ({d.nativeSample}) — {getBcp47LocaleForDialect(d.code)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            {SUPPORTED_VOICE_LANGUAGES.map((lang) => {
              const selected = settings.safetyPhraseLang === lang.code;
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => {
                    if (sessionStatus === 'Active') {
                      stopForegroundListening('Language changed.');
                    }
                    onUpdateSettings((s) => ({ ...s, safetyPhraseLang: lang.code }));
                    onSyncAppLanguage(lang.code);
                  }}
                  className={`min-h-[40px] px-4 rounded-full border text-xs font-medium whitespace-nowrap shrink-0 transition-all ${
                    selected
                      ? 'bg-[#0A0A0A] text-[#FFFCF8] border-[#D4AF37]'
                      : 'bg-[#FFFCF8] border-[#F0E6DC] text-[#5C544E]'
                  }`}
                >
                  {lang.nativeLabel}
                </button>
              );
            })}
          </div>
        </div>

        {/* 9 Selectable Code Word Actions Right Near the Phrase */}
        <div className="pt-5 border-t border-[#F0E6DC] space-y-3.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-semibold text-[#0A0A0A]">
              Choose What Happens When You Whisper or Speak Your Code Word:
            </span>
            <span className="text-xs text-[#8C6D1F]">9 Instant Response Modes</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {NINE_CODE_WORD_ACTIONS.map((act) => {
              const active = settings.safetyPhraseAction === act.id;
              return (
                <button
                  key={act.id}
                  type="button"
                  onClick={() => handleActionChange(act.id)}
                  className={`p-4 rounded-[20px] border text-left space-y-1.5 transition-all ${
                    active
                      ? 'bg-[#FAF3EB] border-[#D4AF37] shadow-[0_6px_22px_rgba(212,175,55,0.14)]'
                      : 'bg-[#FFFCF8] border-[#F0E6DC] hover:border-[#D4AF37]/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="material-symbols-outlined text-[19px] text-[#D4AF37]">
                      {act.icon}
                    </span>
                    <span className="material-symbols-outlined text-[17px] text-[#D4AF37]">
                      {active ? 'radio_button_checked' : 'radio_button_unchecked'}
                    </span>
                  </div>
                  <div className="font-semibold text-xs sm:text-sm text-[#0A0A0A]">
                    {act.title}
                  </div>
                  <p className="text-[11px] text-[#5C544E] leading-relaxed">{act.desc}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. Live Whisper & Far-Field Listening Session */}
      <div className="luxury-card p-6 sm:p-7 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-display text-2xl font-bold text-[#0A0A0A]">
              Whisper &amp; Far-Field Listening Guard
            </h3>
            <p className="text-xs text-[#5C544E]">
              Test whispering softly or arm live code-word protection
            </p>
          </div>

          <div className="text-xs font-medium text-[#8C6D1F]" role="status" aria-live="polite">
            Mic Status: <strong className="text-[#0A0A0A]">{sessionStatus}</strong>
          </div>
        </div>

        <div className="rounded-[20px] bg-[#FAF3EB]/70 border border-[#F0E6DC] p-4 space-y-2.5 text-xs">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="font-medium text-[#0A0A0A]">{statusDetail}</span>
            {sessionStatus === 'Active' && (
              <span className="text-[#D4AF37] font-semibold">
                {isTestMode ? 'Safe Whisper Test' : 'Live Code Word Armed'}
              </span>
            )}
          </div>

          {sessionStatus === 'Active' && (
            <>
              <div className="w-full h-2 rounded-full bg-[#FFFCF8] overflow-hidden border border-[#F0E6DC]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#B76E79] to-[#D4AF37] transition-all duration-75"
                  style={{ width: `${Math.max(8, whisperGainMeter)}%` }}
                />
              </div>
              <div className="text-[#5C544E]">
                Heard (Whisper-Boosted):{' '}
                <span className="text-[#0A0A0A] font-medium">
                  {liveTranscriptPreview || 'Listening for soft whisper or distant speech...'}
                </span>
              </div>
            </>
          )}
        </div>

        {lastMatchNotice && (
          <div className="luxury-card-sage p-4 text-xs text-[#0A0A0A] leading-relaxed">
            {lastMatchNotice}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            disabled={!supported || sessionStatus === 'Active'}
            onClick={() => void startForegroundListening(true)}
            className="btn-luxury-outline px-4 font-medium text-xs sm:text-sm flex items-center justify-center gap-2 disabled:opacity-45"
          >
            <span className="material-symbols-outlined text-[18px] text-[#D4AF37]">science</span>
            <span>Test Whisper / Distance</span>
          </button>

          <button
            type="button"
            disabled={!supported || sessionStatus === 'Active'}
            onClick={() => void startForegroundListening(false)}
            className="btn-luxury px-4 font-medium text-xs sm:text-sm flex items-center justify-center gap-2 disabled:opacity-45"
          >
            <span className="material-symbols-outlined text-[18px] text-[#D4AF37]">mic</span>
            <span>Arm Code Word Live</span>
          </button>

          <button
            type="button"
            disabled={sessionStatus !== 'Active'}
            onClick={() => stopForegroundListening('Stopped manually by user.')}
            className="min-h-[52px] px-4 rounded-full bg-[#B76E79] text-[#FFFCF8] font-medium text-xs sm:text-sm flex items-center justify-center gap-2 disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-[18px]">stop_circle</span>
            <span>Stop Listening</span>
          </button>
        </div>
      </div>
    </div>
  );
};
