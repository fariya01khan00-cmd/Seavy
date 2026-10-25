import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AppSettings,
  ConciergeAttachment,
  ConciergeMessage,
  FamilyEmergencyContact,
  FemaleAiVoiceOption,
  HavenSubView,
  SafetyPhraseAction,
  SupportedVoiceLang,
  UserProfile,
} from '../types';
import { SIX_FEMALE_AI_VOICES } from '../data/demoData';
import { getUiLang, UI_COPY } from '../utils/i18n';
import {
  getBcp47LocaleForDialect,
  isRunningInIframe,
  stopAllSpeechSynthesis,
  stopAnyActiveRecognition,
  useSingleShotSpeechInput,
  useSpeechSynthesisVoices,
} from '../utils/speechCoordinator';
import { SafetyPhrasePanel } from './SafetyPhrasePanel';
import { AiMediaCheckPanel } from './AiMediaCheckPanel';
import { NearbyDoctorsMap } from './NearbyDoctorsMap';
import {
  BluetoothPeerSanctuary,
  FakeParentCallCompanion,
} from './BluetoothAndParentCallSuite';
import { apiFetch } from '../config/api';

interface HavenViewProps {
  subView: HavenSubView;
  onChangeSubView: (v: HavenSubView) => void;
  messages: ConciergeMessage[];
  onUpdateMessages: React.Dispatch<React.SetStateAction<ConciergeMessage[]>>;
  settings: AppSettings;
  onUpdateSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  profile: UserProfile;
  familyContacts: FamilyEmergencyContact[];
  onTriggerPhraseAlarm: () => void;
  onExecuteSafetyPhraseAction: (action: SafetyPhraseAction) => void;
  onShowToast: (msg: string) => void;
}

export const HavenView: React.FC<HavenViewProps> = ({
  subView,
  onChangeSubView,
  messages,
  onUpdateMessages,
  settings,
  onUpdateSettings,
  profile,
  familyContacts,
  onTriggerPhraseAlarm,
  onExecuteSafetyPhraseAction,
  onShowToast,
}) => {
  const uiLang = getUiLang(settings.selectedDialectCode);
  const voiceLang = getBcp47LocaleForDialect(settings.selectedDialectCode);
  const copy = UI_COPY[uiLang];

  // Helpline interactive preview dialogs
  const [selectedHelpline, setSelectedHelpline] = useState<{
    number: string;
    title: string;
    detail: string;
  } | null>(null);
  const [sanctuaryDrawerOpen, setSanctuaryDrawerOpen] = useState(false);
  const [caseTrackerOpen, setCaseTrackerOpen] = useState(false);

  // Server-side AI connection status
  const [aiConnected, setAiConnected] = useState<boolean>(true);
  const [aiModel, setAiModel] = useState<string | null>('gemini-3.8-flash');
  const [aiMissingReason, setAiMissingReason] = useState<string | null>(null);

  // Chat state + Multimodal attachment state
  const [draft, setDraft] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState<ConciergeAttachment | null>(null);
  const [isRecordingVoiceNote, setIsRecordingVoiceNote] = useState(false);
  const voiceNoteRecorderRef = useRef<MediaRecorder | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  const [voiceTranscriptNotice, setVoiceTranscriptNotice] = useState(false);
  const [isLoadingReply, setIsLoadingReply] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [retryPayloadMessages, setRetryPayloadMessages] = useState<ConciergeMessage[] | null>(null);
  const [confirmClearChat, setConfirmClearChat] = useState(false);

  // Spoken Response (6 Female AI Voices + Server Gemini TTS + Browser Female Fallback)
  const { supported: ttsSupported, findMatchingVoice } = useSpeechSynthesisVoices();
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [ttsNoticeById, setTtsNoticeById] = useState<Record<string, string>>({});
  const activeServerAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastAutoHandledUserMsgRef = useRef<string | null>(null);

  const activeFemaleVoice: FemaleAiVoiceOption = useMemo(
    () =>
      SIX_FEMALE_AI_VOICES.find((v) => v.id === settings.selectedFemaleVoiceId) ||
      SIX_FEMALE_AI_VOICES[0],
    [settings.selectedFemaleVoiceId]
  );

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/ai/status')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setAiConnected(Boolean(data?.connected));
        setAiModel(data?.model || null);
        setAiMissingReason(data?.missingReason || null);
      })
      .catch(() => {
        if (cancelled) return;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const chatMic = useSingleShotSpeechInput({
    recognitionLang: voiceLang,
    uiLang,
    onTranscript: (transcript) => {
      setDraft(transcript);
      setVoiceTranscriptNotice(true);
    },
  });

  const handleStopSpeaking = useCallback(() => {
    stopAllSpeechSynthesis();
    if (activeServerAudioRef.current) {
      activeServerAudioRef.current.pause();
      activeServerAudioRef.current = null;
    }
    setSpeakingMessageId(null);
  }, []);

  useEffect(() => {
    return () => {
      chatMic.stopListening();
      handleStopSpeaking();
    };
  }, [subView, handleStopSpeaking]); // eslint-disable-line react-hooks/exhaustive-deps

  const speakWithFemaleVoiceFallback = (
    textToSpeak: string,
    targetLang: SupportedVoiceLang,
    voiceOpt: FemaleAiVoiceOption,
    msgId: string
  ) => {
    if (!ttsSupported) {
      setSpeakingMessageId(null);
      setTtsNoticeById((prev) => ({
        ...prev,
        [msgId]: 'Speech playback is not supported in this browser.',
      }));
      return;
    }
    const matchedVoice = findMatchingVoice(targetLang, true);
    try {
      const utterance = new window.SpeechSynthesisUtterance(textToSpeak);
      utterance.lang = targetLang;
      if (matchedVoice) utterance.voice = matchedVoice;
      utterance.pitch = voiceOpt.pitch;
      utterance.rate = voiceOpt.rate;
      utterance.onstart = () => setSpeakingMessageId(msgId);
      utterance.onend = () => setSpeakingMessageId((curr) => (curr === msgId ? null : curr));
      utterance.onerror = () => setSpeakingMessageId((curr) => (curr === msgId ? null : curr));
      setSpeakingMessageId(msgId);
      window.speechSynthesis.speak(utterance);
    } catch {
      setSpeakingMessageId(null);
    }
  };

  const handlePreviewFemaleVoice = async (voiceOpt: FemaleAiVoiceOption) => {
    onUpdateSettings((s) => ({ ...s, selectedFemaleVoiceId: voiceOpt.id }));
    handleStopSpeaking();
    const previewId = `preview-${voiceOpt.id}`;
    setSpeakingMessageId(previewId);

    try {
      const res = await apiFetch('/api/ai/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: voiceOpt.sampleLine,
          geminiVoiceName: voiceOpt.geminiVoiceName,
          speechStyle: voiceOpt.speechStyle,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.audioDataUrl) {
        const audio = new Audio(data.audioDataUrl);
        activeServerAudioRef.current = audio;
        audio.onended = () => setSpeakingMessageId((c) => (c === previewId ? null : c));
        audio.onerror = () =>
          speakWithFemaleVoiceFallback(voiceOpt.sampleLine, 'en-IN', voiceOpt, previewId);
        await audio.play();
        return;
      }
    } catch {
      // Fallback to female browser voice
    }
    speakWithFemaleVoiceFallback(voiceOpt.sampleLine, 'en-IN', voiceOpt, previewId);
  };

  const handleReadAloud = async (msg: ConciergeMessage) => {
    chatMic.stopListening();
    stopAnyActiveRecognition();
    handleStopSpeaking();

    const hasDevanagari = /[\u0900-\u097F]/.test(msg.text);
    const targetVoiceLang: SupportedVoiceLang =
      msg.lang === 'hi' || hasDevanagari ? 'hi-IN' : voiceLang;

    const fullTextToRead = [
      msg.text,
      ...(msg.steps ? msg.steps.map((s, idx) => `${idx + 1}. ${s}`) : []),
    ]
      .join(' ')
      .replace(/[*#_`~]/g, '');

    setSpeakingMessageId(msg.id);
    setTtsNoticeById((prev) => {
      const next = { ...prev };
      delete next[msg.id];
      return next;
    });

    try {
      const res = await apiFetch('/api/ai/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: fullTextToRead,
          geminiVoiceName: activeFemaleVoice.geminiVoiceName,
          speechStyle: activeFemaleVoice.speechStyle,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.audioDataUrl) {
        const audio = new Audio(data.audioDataUrl);
        activeServerAudioRef.current = audio;
        audio.onended = () => setSpeakingMessageId((c) => (c === msg.id ? null : c));
        audio.onerror = () =>
          speakWithFemaleVoiceFallback(
            fullTextToRead,
            targetVoiceLang,
            activeFemaleVoice,
            msg.id
          );
        await audio.play();
        return;
      }
    } catch {
      // Fallback to browser female speech synthesis
    }

    speakWithFemaleVoiceFallback(fullTextToRead, targetVoiceLang, activeFemaleVoice, msg.id);
  };

  const requestAiReply = useCallback(
    async (conversationSnapshot: ConciergeMessage[], latestAttachment?: ConciergeAttachment) => {
      setIsLoadingReply(true);
      setChatError(null);
      setRetryPayloadMessages(null);

      try {
        const apiTurns = conversationSnapshot
          .filter((m) => !m.isInitialSample)
          .map((m) => ({
            role: m.sender === 'user' ? ('user' as const) : ('model' as const),
            text: m.text,
          }));

        const lastMsg = conversationSnapshot[conversationSnapshot.length - 1];
        const attachmentPayload = latestAttachment || lastMsg?.attachment;

        const response = await apiFetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: apiTurns,
            language: settings.selectedDialectCode,
            voicePersona: `${activeFemaleVoice.name} (${activeFemaleVoice.role})`,
            attachment: attachmentPayload
              ? {
                  mimeType: attachmentPayload.mimeType,
                  dataUrl: attachmentPayload.dataUrl,
                }
              : undefined,
          }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            data?.error ||
              `Concierge request failed (HTTP ${response.status}). Check network or server configuration.`
          );
        }

        const replyMsg: ConciergeMessage = {
          id: `c-${Date.now()}`,
          sender: 'concierge',
          text: data.reply,
          timestamp: data.timestamp || 'Just now',
          modelUsed: data.model || 'gemini-3.8-flash',
          lang: uiLang,
          voicePersonaName: activeFemaleVoice.name,
        };

        onUpdateMessages((prev) => [...prev, replyMsg]);
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : 'Network error while contacting the server-side AI concierge.';
        setChatError(message);
        setRetryPayloadMessages(conversationSnapshot);
      } finally {
        setIsLoadingReply(false);
      }
    },
    [activeFemaleVoice.name, activeFemaleVoice.role, onUpdateMessages, settings.selectedDialectCode, uiLang]
  );

  // Automatically answer user messages routed from Front-Page Omnisearch or Camera/Audio/Video Modal
  useEffect(() => {
    if (subView !== 'concierge' || isLoadingReply || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (
      last.sender === 'user' &&
      !last.isInitialSample &&
      lastAutoHandledUserMsgRef.current !== last.id
    ) {
      lastAutoHandledUserMsgRef.current = last.id;
      void requestAiReply(messages, last.attachment);
    }
  }, [subView, messages, isLoadingReply, requestAiReply]);

  const submitChatMessage = (rawText: string, customAttachment?: ConciergeAttachment | null) => {
    const chosenAttachment = customAttachment !== undefined ? customAttachment : pendingAttachment;
    const trimmed =
      rawText.trim() ||
      (chosenAttachment
        ? chosenAttachment.kind === 'audio'
          ? 'Please listen to my voice note and guide me step-by-step.'
          : chosenAttachment.kind === 'video'
            ? 'Please inspect this video clip and give me immediate safety or health guidance.'
            : 'Please inspect this photo and share clear safety or healthcare steps.'
        : '');

    if (!trimmed || isLoadingReply) {
      return;
    }

    chatMic.stopListening();
    handleStopSpeaking();
    setVoiceTranscriptNotice(false);

    const msgId = `u-${Date.now()}`;
    lastAutoHandledUserMsgRef.current = msgId;

    const userMsg: ConciergeMessage = {
      id: msgId,
      sender: 'user',
      text: trimmed,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      lang: uiLang,
      attachment: chosenAttachment || undefined,
    };

    const nextConversation = [...messages, userMsg];
    onUpdateMessages(nextConversation);
    setDraft('');
    setPendingAttachment(null);
    void requestAiReply(nextConversation, chosenAttachment || undefined);
  };

  // Inline Voice Note Recorder for AI Concierge
  const handleToggleVoiceNoteRecording = async () => {
    if (isRecordingVoiceNote) {
      voiceNoteRecorderRef.current?.stop();
      setIsRecordingVoiceNote(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: BlobPart[] = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            setPendingAttachment({
              kind: 'audio',
              mimeType: blob.type || 'audio/webm',
              dataUrl: reader.result,
              label: 'Recorded Voice Note',
            });
            onShowToast('Voice note attached — press Send for AI voice analysis');
          }
        };
        reader.readAsDataURL(blob);
      };
      voiceNoteRecorderRef.current = rec;
      rec.start();
      setIsRecordingVoiceNote(true);
    } catch {
      onShowToast('Microphone permission is required to record a voice note');
    }
  };

  const handleAttachFile = (
    e: React.ChangeEvent<HTMLInputElement>,
    kind: 'image' | 'video'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      onShowToast('Please choose a photo or short clip under 12 MB');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        setPendingAttachment({
          kind,
          mimeType: file.type || (kind === 'image' ? 'image/jpeg' : 'video/mp4'),
          dataUrl: reader.result,
          label: file.name,
        });
        onShowToast(`${kind === 'image' ? 'Photo' : 'Video'} attached to Concierge`);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSyncLanguageSwitch = (targetVoiceLang: SupportedVoiceLang) => {
    const nextDialectCode = targetVoiceLang.startsWith('hi') ? 'hi' : settings.selectedDialectCode;
    onUpdateSettings((s) => ({
      ...s,
      selectedDialectCode: nextDialectCode,
      safetyPhraseLang: targetVoiceLang,
    }));
  };

  const helplines = [
    {
      kicker: '24/7 Unified Response',
      number: '112',
      title: 'National Emergency Line',
      desc: 'Integrated emergency response for Police, Medical & Fire support across India.',
      cta: 'Dial 112',
      primary: true,
    },
    {
      kicker: '24/7 Women’s Support',
      number: '181',
      title: 'Women’s Sanctuary Helpline',
      desc: 'Confidential crisis counseling, shelter coordination, and immediate guidance.',
      cta: 'Dial 181',
      primary: false,
    },
    {
      kicker: 'Rapid Patrol Desk',
      number: '1091',
      title: 'Women’s Patrol Control Room',
      desc: 'Direct women’s safety desk for transit and neighborhood patrol assistance.',
      cta: 'Dial 1091',
      primary: false,
    },
    {
      kicker: 'Digital & Financial Protection',
      number: '1930',
      title: 'Cyber Protection Line',
      desc: 'Immediate reporting line for financial fraud, impersonation, and digital harassment.',
      cta: 'Dial 1930',
      primary: false,
    },
  ];

  const micStatusLabelMap: Record<typeof chatMic.status, string> = {
    idle: uiLang === 'hi' ? 'माइक तैयार' : 'Mic ready',
    listening: uiLang === 'hi' ? 'सुन रहा है...' : 'Listening...',
    processing: uiLang === 'hi' ? 'प्रोसेसिंग...' : 'Processing...',
    stopped: uiLang === 'hi' ? 'तैयार' : 'Ready',
    'permission-denied': uiLang === 'hi' ? 'अनुमति अस्वीकृत' : 'Permission denied',
    unsupported: uiLang === 'hi' ? 'उपलब्ध नहीं' : 'Unsupported',
    error: uiLang === 'hi' ? 'त्रुटि' : 'Error',
  };

  return (
    <div className="space-y-6">
      {/* Frosted Pill Sub-Navigation (6 Royal Sanctuary Suites) */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar bg-[#FFFCF8]/90 border border-[#F0E6DC] rounded-[28px] sm:rounded-full p-1.5 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.05)]">
        {(
          [
            { id: 'helplines', label: copy.havenHelplinesTab, icon: 'location_on' },
            { id: 'bluetooth_peer', label: 'Bluetooth Peer', icon: 'bluetooth_connected' },
            { id: 'parent_call', label: 'Parent on Call', icon: 'ring_volume' },
            { id: 'concierge', label: 'AI Concierge (6 Voices)', icon: 'auto_awesome' },
            { id: 'safety_phrase', label: copy.havenSafetyPhraseTab, icon: 'record_voice_over' },
            { id: 'ai_check', label: copy.havenMediaCheckTab, icon: 'fact_check' },
          ] as { id: HavenSubView; label: string; icon: string }[]
        ).map((tab) => {
          const active = subView === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChangeSubView(tab.id)}
              className={`relative flex-1 min-w-[132px] min-h-[46px] px-3.5 rounded-full text-xs sm:text-sm font-medium flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap active:scale-[0.98] ${
                active ? 'text-[#FFFCF8]' : 'text-[#5C544E] hover:text-[#0A0A0A]'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="haven-subtab-pill"
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

      <AnimatePresence mode="wait">
        {/* ======================== 1. HAVEN GPS MAP & HELPLINE SUITE ======================== */}
        {subView === 'helplines' && (
          <motion.div
            key="helplines"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="space-y-6"
          >
            {/* Priority Support + Quick Offline Bluetooth & Fake Parent Call Shortcuts */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-7 luxury-card-blush p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-[#FFFCF8] border border-[#B76E79]/35 flex items-center justify-center text-[#9E2A3B] shrink-0 shadow-sm">
                    <span className="material-symbols-outlined text-[24px]">call</span>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs font-medium tracking-[0.14em] text-[#B76E79]">
                      24/7 Priority Sanctuary Line · GPS + Directions
                    </div>
                    <h2 className="font-display text-2xl sm:text-[28px] font-bold tracking-wide text-[#0A0A0A] leading-tight">
                      Haven GPS Map, Directions &amp; Support
                    </h2>
                    <p className="text-xs sm:text-sm text-[#5C544E] leading-relaxed">
                      Search any location, get live walking/driving directions to the nearest public safe spot, share your live location with Favourites, or dial <strong>112</strong>.
                    </p>
                  </div>
                </div>
                <a
                  href="tel:112"
                  className="btn-luxury px-6 font-medium text-sm flex items-center justify-center gap-2 shrink-0"
                >
                  <span className="material-symbols-outlined text-[18px] text-[#D4AF37]">call</span>
                  <span>Dial 112</span>
                </a>
              </div>

              <div className="lg:col-span-5 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => onChangeSubView('bluetooth_peer')}
                  className="luxury-card p-4 text-left flex flex-col justify-between gap-3 hover:border-[#D4AF37] transition-all active:scale-[0.98]"
                >
                  <span className="material-symbols-outlined text-[24px] text-[#D4AF37]">
                    bluetooth_connected
                  </span>
                  <div>
                    <div className="font-display font-bold text-base text-[#0A0A0A]">
                      Bluetooth Peer SOS
                    </div>
                    <p className="text-[11px] text-[#5C544E] mt-0.5">
                      Offline &ldquo;Help Me&rdquo; &amp; &ldquo;Save Me&rdquo; to nearby Saevy phones
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => onChangeSubView('parent_call')}
                  className="luxury-card-sage p-4 text-left flex flex-col justify-between gap-3 hover:border-[#D4AF37] transition-all active:scale-[0.98]"
                >
                  <span className="material-symbols-outlined text-[24px] text-[#B76E79]">
                    ring_volume
                  </span>
                  <div>
                    <div className="font-display font-bold text-base text-[#0A0A0A]">
                      Parent on Call
                    </div>
                    <p className="text-[11px] text-[#5C544E] mt-0.5">
                      Realistic Maa/Papa speakerphone call for unsafe cabs &amp; walks
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* Live Haven GPS Map Card (Upper Search Bar, Directions, Nearest Safe Spot & Live Location Share) */}
            <div className="luxury-card p-6 space-y-4">
              <div className="space-y-1">
                <span className="text-xs font-medium text-[#8C6D1F] tracking-[0.14em]">
                  Live GPS Search · Route Directions · Share My Live Location
                </span>
                <h3 className="font-display text-[28px] font-bold tracking-wide text-[#0A0A0A]">
                  Haven GPS Sanctuary, Safe Spots &amp; Clinic Map
                </h3>
                <p className="text-xs sm:text-sm text-[#5C544E]">
                  Search any destination in the upper search bar, tap Directions for turn-by-turn routing, find the Nearest Public Safe Spot, or share live GPS with permitted Favourites.
                </p>
              </div>
              <NearbyDoctorsMap
                isHi={uiLang === 'hi'}
                familyContacts={familyContacts}
                liveLocationPermitted={settings.liveLocationShareEnabled}
                onToggleLiveLocationPermitted={() =>
                  onUpdateSettings((s) => ({
                    ...s,
                    liveLocationShareEnabled: !s.liveLocationShareEnabled,
                  }))
                }
                onShowToast={onShowToast}
              />
            </div>

            {/* Helpline Numbers Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {helplines.map((h, idx) => (
                <motion.div
                  key={h.number}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04, duration: 0.22 }}
                  className={
                    h.primary
                      ? 'luxury-card-blush p-6 flex flex-col justify-between space-y-5'
                      : 'luxury-card p-6 flex flex-col justify-between space-y-5'
                  }
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-[#8C6D1F] font-medium">
                      <span>{h.kicker}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedHelpline({
                            number: h.number,
                            title: h.title,
                            detail: h.desc,
                          })
                        }
                        className="text-[#5C544E] hover:text-[#0A0A0A] underline"
                      >
                        Details
                      </button>
                    </div>
                    <div className="font-display text-4xl font-bold text-[#0A0A0A] tabular-nums">
                      {h.number}
                    </div>
                    <h3 className="font-display text-xl font-bold text-[#0A0A0A]">{h.title}</h3>
                    <p className="text-xs sm:text-sm text-[#5C544E] leading-relaxed">{h.desc}</p>
                  </div>

                  <a
                    href={`tel:${h.number}`}
                    className={
                      h.primary
                        ? 'btn-luxury w-full font-medium text-sm flex items-center justify-center gap-2'
                        : 'btn-luxury-outline w-full font-medium text-sm flex items-center justify-center gap-2'
                    }
                  >
                    <span className="material-symbols-outlined text-[18px] text-[#D4AF37]">
                      call
                    </span>
                    <span>{h.cta}</span>
                  </a>
                </motion.div>
              ))}
            </div>

            {/* Sanctuary Lounges, Concierge & Case Folio */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="luxury-card p-6 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <span className="text-xs font-medium text-[#8C6D1F] tracking-wider">
                    Curated Waiting Lounges
                  </span>
                  <h3 className="font-display text-2xl font-bold text-[#0A0A0A]">
                    Safe Haven Lounges
                  </h3>
                  <p className="text-xs sm:text-sm text-[#5C544E] leading-relaxed">
                    Browse 24/7 staffed hotel concourses, pharmacies, and illuminated transit desks.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSanctuaryDrawerOpen(true)}
                  className="btn-luxury-outline w-full text-xs sm:text-sm font-medium flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px] text-[#D4AF37]">
                    near_me
                  </span>
                  <span>View Safe Lounges</span>
                </button>
              </div>

              <div className="luxury-card-sage p-6 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <span className="text-xs font-medium text-[#3E6B4E] tracking-wider">
                    Multimodal AI · 6 Female Voices
                  </span>
                  <h3 className="font-display text-2xl font-bold text-[#0A0A0A]">
                    Safety &amp; Health AI
                  </h3>
                  <p className="text-xs sm:text-sm text-[#5C544E] leading-relaxed">
                    Send voice notes, photos, videos, or text for unsafe situations or @home health remedies.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onChangeSubView('concierge')}
                  className="btn-luxury w-full text-xs sm:text-sm font-medium flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px] text-[#D4AF37]">
                    auto_awesome
                  </span>
                  <span>Open AI Concierge</span>
                </button>
              </div>

              <div className="luxury-card p-6 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <span className="text-xs font-medium text-[#B76E79] tracking-wider">
                    Personal Reference Folio
                  </span>
                  <h3 className="font-display text-2xl font-bold text-[#0A0A0A]">
                    Zero-FIR Stages
                  </h3>
                  <p className="text-xs sm:text-sm text-[#5C544E] leading-relaxed">
                    Review how statutory Zero-FIR registration and liaison milestones unfold step by step.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCaseTrackerOpen(true)}
                  className="btn-luxury-outline w-full text-xs sm:text-sm font-medium flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px] text-[#B76E79]">
                    description
                  </span>
                  <span>View Stage Guide</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ======================== 2. BLUETOOTH PEER-TO-PEER SANCTUARY ======================== */}
        {subView === 'bluetooth_peer' && (
          <motion.div
            key="bluetooth-peer"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          >
            <BluetoothPeerSanctuary profile={profile} onShowToast={onShowToast} />
          </motion.div>
        )}

        {/* ======================== 3. FAKE PARENT ON CALL COMPANION ======================== */}
        {subView === 'parent_call' && (
          <motion.div
            key="parent-call"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          >
            <FakeParentCallCompanion onShowToast={onShowToast} />
          </motion.div>
        )}

        {/* ======================== 4. MULTIMODAL AI CONCIERGE + 6 FEMALE VOICES ======================== */}
        {subView === 'concierge' && (
          <motion.div
            key="concierge"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="max-w-3xl mx-auto space-y-6"
          >
            {/* Concierge Status + Hybrid Internet Badge */}
            <div className="luxury-card p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-[20px] shrink-0 mt-0.5 text-[#D4AF37]">
                  {aiConnected ? 'verified' : 'cloud_off'}
                </span>
                <div className="space-y-0.5">
                  <div className="font-semibold text-[#0A0A0A]">
                    {aiConnected
                      ? `Saevy Multimodal AI · Speaking as ${activeFemaleVoice.name}`
                      : 'AI Concierge Requires Internet Connection'}
                  </div>
                  <p className="text-[#5C544E] leading-relaxed">
                    {aiConnected
                      ? 'Send voice recordings, photos, videos, or text in any of 52 languages for safety steps, @home remedies, and Zero-FIR help.'
                      : aiMissingReason ||
                        'Configure GEMINI_API_KEY in Settings > Secrets, or switch to Bluetooth Peer tab for zero-internet SOS.'}
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-medium text-[#D4AF37] shrink-0">
                Hybrid Cloud AI · {voiceLang}
              </span>
            </div>

            {/* 6 Female AI Voices Selector */}
            <div className="luxury-card-blush p-5 space-y-3.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <div className="text-xs font-medium text-[#B76E79] tracking-wide">
                    6 Curated Female Guardian Voices
                  </div>
                  <h3 className="font-display text-xl font-bold text-[#0A0A0A]">
                    Choose Your AI Companion Voice
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => void handlePreviewFemaleVoice(activeFemaleVoice)}
                  className="btn-luxury-outline px-4 text-xs font-medium flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px] text-[#D4AF37]">
                    volume_up
                  </span>
                  <span>Hear {activeFemaleVoice.name}</span>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {SIX_FEMALE_AI_VOICES.map((v) => {
                  const selected = v.id === activeFemaleVoice.id;
                  const isPreviewing = speakingMessageId === `preview-${v.id}`;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => void handlePreviewFemaleVoice(v)}
                      className={`p-3.5 rounded-[18px] border text-left transition-all active:scale-[0.98] ${
                        selected
                          ? 'bg-[#0A0A0A] text-[#FFFCF8] border-[#D4AF37] shadow-[0_8px_24px_rgba(212,175,55,0.18)]'
                          : 'bg-[#FFFCF8] text-[#0A0A0A] border-[#F0E6DC] hover:border-[#D4AF37]/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-display font-bold text-base">{v.name}</span>
                        <span className="material-symbols-outlined text-[16px] text-[#D4AF37]">
                          {isPreviewing ? 'graphic_eq' : selected ? 'check_circle' : 'play_circle'}
                        </span>
                      </div>
                      <div
                        className={`text-[11px] mt-0.5 truncate ${
                          selected ? 'text-[#F8E4A8]' : 'text-[#B76E79]'
                        }`}
                      >
                        {v.role}
                      </div>
                      <div
                        className={`text-[10px] mt-0.5 line-clamp-1 ${
                          selected ? 'text-[#FFFCF8]/75' : 'text-[#5C544E]'
                        }`}
                      >
                        {v.tone}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick Safety & Healthcare @Home Prompts */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
                {[
                  {
                    icon: 'local_taxi',
                    label: 'Unsafe Cab Route Now',
                    prompt:
                      'My cab driver just turned onto a dark unfamiliar road at night. Give me calm, immediate steps right now.',
                  },
                  {
                    icon: 'healing',
                    label: 'Period Cramps @Home',
                    prompt:
                      'What safe @home natural & homoeopathic remedies help ease acute menstrual cramps and nausea quickly?',
                  },
                  {
                    icon: 'gavel',
                    label: 'Zero-FIR Rights',
                    prompt:
                      'Explain step-by-step how to register a Zero-FIR at any nearest police station in India.',
                  },
                  {
                    icon: 'medical_services',
                    label: 'Dizziness & Dehydration',
                    prompt:
                      'I feel lightheaded and exhausted during my evening commute. What immediate @home hydration and safety steps should I take?',
                  },
                ].map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    disabled={isLoadingReply}
                    onClick={() => submitChatMessage(chip.prompt, null)}
                    className="min-h-[42px] px-4 rounded-full bg-[#FFFCF8] border border-[#F0E6DC] text-xs font-medium text-[#0A0A0A] hover:border-[#D4AF37] flex items-center gap-1.5 shrink-0 active:scale-[0.98] transition-all disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[#D4AF37] text-[16px]">
                      {chip.icon}
                    </span>
                    <span>{chip.label}</span>
                  </button>
                ))}
              </div>

              {messages.length > 1 && (
                <div>
                  {!confirmClearChat ? (
                    <button
                      type="button"
                      onClick={() => setConfirmClearChat(true)}
                      className="min-h-[38px] px-3.5 rounded-full bg-[#FFFCF8] border border-[#F0E6DC] text-xs text-[#5C544E] hover:text-[#9E2A3B] flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[15px]">delete_sweep</span>
                      <span>Clear</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          handleStopSpeaking();
                          onUpdateMessages((prev) => prev.filter((m) => m.isInitialSample));
                          setChatError(null);
                          setRetryPayloadMessages(null);
                          setConfirmClearChat(false);
                          onShowToast('Cleared conversation');
                        }}
                        className="min-h-[36px] px-3.5 rounded-full bg-[#9E2A3B] text-[#FFFCF8] text-xs font-medium"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmClearChat(false)}
                        className="min-h-[36px] px-3 rounded-full bg-[#FFFCF8] border border-[#F0E6DC] text-xs text-[#0A0A0A]"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Chat Stream */}
            <div className="space-y-4">
              {messages.map((m) =>
                m.sender === 'user' ? (
                  <div key={m.id} className="flex flex-col items-end space-y-1.5">
                    <div className="max-w-[85%] px-5 py-3.5 rounded-[24px] rounded-tr-md bg-[#0A0A0A] text-[#FFFCF8] border border-[#D4AF37]/35 text-sm shadow-[0_8px_24px_rgba(10,10,10,0.16)] space-y-2.5">
                      {m.attachment && (
                        <div className="rounded-[16px] overflow-hidden border border-[#D4AF37]/35 bg-[#171422] p-2">
                          {m.attachment.kind === 'image' && (
                            <img
                              src={m.attachment.dataUrl}
                              alt={m.attachment.label}
                              className="max-h-48 rounded-[12px] object-cover"
                            />
                          )}
                          {m.attachment.kind === 'video' && (
                            <video
                              src={m.attachment.dataUrl}
                              controls
                              playsInline
                              className="max-h-48 rounded-[12px]"
                            />
                          )}
                          {m.attachment.kind === 'audio' && (
                            <audio src={m.attachment.dataUrl} controls className="w-full max-w-xs" />
                          )}
                          <div className="text-[11px] text-[#D4AF37] px-1 pt-1">
                            Attached {m.attachment.kind}: {m.attachment.label}
                          </div>
                        </div>
                      )}
                      <div className="whitespace-pre-wrap">{m.text}</div>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-[#5C544E] px-1">
                      <span>{m.timestamp}</span>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateMessages((prev) => prev.filter((item) => item.id !== m.id))
                        }
                        className="hover:text-[#9E2A3B] underline"
                        aria-label="Delete message"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#FFFCF8] border border-[#D4AF37]/50 flex items-center justify-center shrink-0 text-[#D4AF37] shadow-sm">
                      <span className="material-symbols-outlined text-[17px]">filter_vintage</span>
                    </div>
                    <div className="flex-1 luxury-card p-5 sm:p-6 space-y-3.5">
                      <div className="flex items-center justify-between flex-wrap gap-2 border-b border-[#F0E6DC] pb-2.5">
                        <span className="font-display font-bold text-base text-[#0A0A0A]">
                          {m.voicePersonaName
                            ? `${m.voicePersonaName} · Saevy Concierge`
                            : `${activeFemaleVoice.name} · Saevy Concierge`}
                        </span>
                        <span className="text-[11px] text-[#8C6D1F]">
                          {m.isInitialSample ? 'Sanctuary Welcome' : m.timestamp}
                        </span>
                      </div>

                      <div className="text-sm text-[#0A0A0A] leading-relaxed whitespace-pre-wrap">
                        {m.text}
                      </div>

                      {m.steps && m.steps.length > 0 && (
                        <div className="space-y-2 text-xs sm:text-sm text-[#0A0A0A]">
                          {m.steps.map((st, idx) => (
                            <div key={idx} className="flex items-start gap-2.5">
                              <span className="text-[#D4AF37] font-bold tabular-nums">
                                0{idx + 1}.
                              </span>
                              <span>{st}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="pt-2.5 border-t border-[#F0E6DC] flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleReadAloud(m)}
                            disabled={speakingMessageId === m.id}
                            className="min-h-[42px] px-4 rounded-full bg-[#FAF3EB] border border-[#F0E6DC] hover:border-[#D4AF37] text-[#0A0A0A] text-xs font-medium flex items-center gap-1.5 disabled:opacity-55 active:scale-[0.98] transition-all"
                          >
                            <span className="material-symbols-outlined text-[17px] text-[#D4AF37]">
                              volume_up
                            </span>
                            <span>
                              {speakingMessageId === m.id
                                ? `${activeFemaleVoice.name} Speaking...`
                                : `Speak (${activeFemaleVoice.name})`}
                            </span>
                          </button>

                          {speakingMessageId === m.id && (
                            <button
                              type="button"
                              onClick={handleStopSpeaking}
                              className="min-h-[42px] px-4 rounded-full bg-[#B76E79] text-[#FFFCF8] text-xs font-medium flex items-center gap-1.5 active:scale-[0.98] transition-all"
                            >
                              <span className="material-symbols-outlined text-[17px]">stop</span>
                              <span>{copy.stopReadingBtn}</span>
                            </button>
                          )}
                        </div>

                        {!m.isInitialSample && (
                          <button
                            type="button"
                            onClick={() => {
                              if (speakingMessageId === m.id) handleStopSpeaking();
                              onUpdateMessages((prev) => prev.filter((item) => item.id !== m.id));
                            }}
                            className="min-h-[36px] px-2.5 text-xs text-[#5C544E] hover:text-[#9E2A3B]"
                          >
                            Delete
                          </button>
                        )}
                      </div>

                      {ttsNoticeById[m.id] && (
                        <p className="text-xs text-[#8C6D1F] leading-relaxed">
                          {ttsNoticeById[m.id]}
                        </p>
                      )}
                    </div>
                  </div>
                )
              )}

              {isLoadingReply && (
                <div
                  className="luxury-card-sage p-4 flex items-center gap-3 text-xs sm:text-sm text-[#0A0A0A]"
                  role="status"
                  aria-live="polite"
                >
                  <span className="material-symbols-outlined text-[20px] text-[#D4AF37] animate-spin">
                    progress_activity
                  </span>
                  <span>
                    {activeFemaleVoice.name} is analyzing your message &amp; preparing guidance...
                  </span>
                </div>
              )}

              {chatError && (
                <div
                  className="luxury-card-blush p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                  role="alert"
                >
                  <div className="text-xs text-[#0A0A0A] space-y-0.5">
                    <strong className="font-semibold text-[#9E2A3B] block">
                      Could not reach Concierge
                    </strong>
                    <span>{chatError}</span>
                  </div>
                  {retryPayloadMessages && (
                    <button
                      type="button"
                      disabled={isLoadingReply}
                      onClick={() => void requestAiReply(retryPayloadMessages)}
                      className="btn-luxury px-5 text-xs font-medium flex items-center gap-1.5 shrink-0"
                    >
                      <span className="material-symbols-outlined text-[16px] text-[#D4AF37]">
                        refresh
                      </span>
                      <span>{copy.retryBtn}</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Pending Multimodal Attachment Preview */}
            {pendingAttachment && (
              <div className="luxury-card p-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="material-symbols-outlined text-[22px] text-[#D4AF37]">
                    {pendingAttachment.kind === 'audio'
                      ? 'graphic_eq'
                      : pendingAttachment.kind === 'video'
                        ? 'videocam'
                        : 'image'}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#0A0A0A] truncate">
                      Ready to send {pendingAttachment.kind}: {pendingAttachment.label}
                    </div>
                    <div className="text-[11px] text-[#5C544E]">
                      Add an optional question below or press Send immediately
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPendingAttachment(null)}
                  className="w-8 h-8 rounded-full bg-[#FAF3EB] border border-[#F0E6DC] flex items-center justify-center text-[#5C544E] hover:text-[#9E2A3B]"
                  aria-label="Remove attachment"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              </div>
            )}

            {/* Multimodal Attachment Bar + Voice Typing + Text Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitChatMessage(draft);
              }}
              noValidate
              className="space-y-2.5"
            >
              {/* Hidden file inputs for Photo & Video */}
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleAttachFile(e, 'image')}
              />
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleAttachFile(e, 'video')}
              />

              {/* Multimodal Quick Capture Toolbar */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleToggleVoiceNoteRecording()}
                  className={`min-h-[40px] px-3.5 rounded-full text-xs font-medium flex items-center gap-1.5 border transition-all ${
                    isRecordingVoiceNote
                      ? 'bg-[#9E2A3B] text-[#FFFCF8] border-[#D4AF37]'
                      : 'bg-[#FFFCF8] text-[#0A0A0A] border-[#F0E6DC] hover:border-[#D4AF37]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[17px] text-[#D4AF37]">
                    {isRecordingVoiceNote ? 'stop_circle' : 'mic_external_on'}
                  </span>
                  <span>
                    {isRecordingVoiceNote ? 'Stop & Attach Voice Note' : 'Record Voice Note'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="min-h-[40px] px-3.5 rounded-full bg-[#FFFCF8] text-[#0A0A0A] border border-[#F0E6DC] hover:border-[#D4AF37] text-xs font-medium flex items-center gap-1.5 transition-all"
                >
                  <span className="material-symbols-outlined text-[17px] text-[#D4AF37]">
                    add_a_photo
                  </span>
                  <span>Attach Photo</span>
                </button>

                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  className="min-h-[40px] px-3.5 rounded-full bg-[#FFFCF8] text-[#0A0A0A] border border-[#F0E6DC] hover:border-[#D4AF37] text-xs font-medium flex items-center gap-1.5 transition-all"
                >
                  <span className="material-symbols-outlined text-[17px] text-[#B76E79]">
                    videocam
                  </span>
                  <span>Attach Video</span>
                </button>
              </div>

              <div className="p-2 rounded-full bg-[#FFFCF8] border border-[#F0E6DC] flex items-center gap-2 shadow-[0_8px_32px_rgba(0,0,0,0.06)]">
                <button
                  type="button"
                  onClick={() => {
                    if (chatMic.status === 'listening' || chatMic.status === 'processing') {
                      chatMic.stopListening();
                    } else {
                      setVoiceTranscriptNotice(false);
                      chatMic.startListening();
                    }
                  }}
                  aria-pressed={chatMic.status === 'listening'}
                  aria-label={
                    chatMic.status === 'listening'
                      ? 'Stop voice typing'
                      : `Voice type in ${voiceLang}`
                  }
                  className={`min-h-[46px] px-4 rounded-full text-xs font-medium flex items-center gap-1.5 shrink-0 transition-all active:scale-[0.98] ${
                    chatMic.status === 'listening'
                      ? 'bg-[#B76E79] text-[#FFFCF8]'
                      : 'bg-[#FAF3EB] text-[#0A0A0A] border border-[#F0E6DC] hover:border-[#D4AF37]'
                  }`}
                >
                  <span
                    className={`material-symbols-outlined text-[18px] ${
                      chatMic.status === 'listening' ? 'text-[#FFFCF8]' : 'text-[#B76E79]'
                    }`}
                  >
                    {chatMic.status === 'listening' ? 'stop_circle' : 'mic'}
                  </span>
                  <span className="hidden sm:inline">
                    {chatMic.status === 'listening' ? copy.voiceMicStop : copy.voiceMicStart}
                  </span>
                </button>

                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      submitChatMessage(draft);
                    }
                  }}
                  placeholder="Ask about an unsafe situation, Zero-FIR, or @home health doubts..."
                  className="flex-1 min-h-[46px] px-2 sm:px-3 bg-transparent text-sm text-[#0A0A0A] placeholder:text-[#5C544E]/60 focus:outline-none"
                />

                {draft && (
                  <button
                    type="button"
                    onClick={() => {
                      chatMic.stopListening();
                      setDraft('');
                      setVoiceTranscriptNotice(false);
                    }}
                    className="w-9 h-9 rounded-full text-[#5C544E] hover:text-[#0A0A0A] flex items-center justify-center"
                    aria-label="Clear draft message"
                  >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                )}

                <button
                  type="submit"
                  disabled={(!draft.trim() && !pendingAttachment) || isLoadingReply}
                  className="min-h-[46px] px-5 rounded-full bg-[#0A0A0A] text-[#FFFCF8] border border-[#D4AF37]/40 font-medium text-xs sm:text-sm flex items-center gap-1.5 shrink-0 hover:border-[#D4AF37] disabled:opacity-45 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
                >
                  <span>{copy.sendBtn}</span>
                  <span className="material-symbols-outlined text-[18px] text-[#D4AF37]">
                    arrow_upward
                  </span>
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 px-3 text-xs text-[#5C544E]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span>
                    52-Language Voice Typing ({voiceLang}):{' '}
                    <strong className="text-[#0A0A0A]">{micStatusLabelMap[chatMic.status]}</strong>
                  </span>
                  {voiceTranscriptNotice && draft.trim() && (
                    <span className="text-[#8C6D1F] font-medium">
                      · Review transcript above, then press {copy.sendBtn}.
                    </span>
                  )}
                </div>
                <span className="text-[11px]">Voice · Photo · Video · Text</span>
              </div>

              {chatMic.errorMessage && (
                <div
                  className="luxury-card-blush p-3 text-xs text-[#0A0A0A] flex flex-wrap items-center justify-between gap-2"
                  role="alert"
                >
                  <span>{chatMic.errorMessage}</span>
                  {chatMic.status === 'permission-denied' && (
                    <button
                      type="button"
                      onClick={chatMic.resetPermissionDenialForRetry}
                      className="underline text-[#0A0A0A] font-semibold"
                    >
                      Reset mic
                    </button>
                  )}
                  {isRunningInIframe() && (
                    <span className="block w-full text-[11px] text-[#5C544E]">
                      Open the app URL in a standalone browser tab if embedded preview blocks microphone access.
                    </span>
                  )}
                </div>
              )}
            </form>
          </motion.div>
        )}

        {/* ======================== 5. WHISPER & FAR-FIELD SAFETY CODE WORD ======================== */}
        {subView === 'safety_phrase' && (
          <motion.div
            key="safety-phrase"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          >
            <SafetyPhrasePanel
              settings={settings}
              onUpdateSettings={onUpdateSettings}
              uiLang={uiLang}
              onSyncAppLanguage={handleSyncLanguageSwitch}
              onTriggerOpenSupport={() => {
                onChangeSubView('helplines');
                onShowToast('Code Word matched: Opened Helpline Sanctuary');
              }}
              onTriggerLocalAlarm={onTriggerPhraseAlarm}
              onTriggerCustomAction={onExecuteSafetyPhraseAction}
              onShowToast={onShowToast}
            />
          </motion.div>
        )}

        {/* ======================== 6. DIGITAL SAFETY SCANNER ======================== */}
        {subView === 'ai_check' && (
          <motion.div
            key="ai-check"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          >
            <AiMediaCheckPanel
              aiConnected={aiConnected}
              aiModel={aiModel}
              aiMissingReason={aiMissingReason}
              uiLang={uiLang}
              onShowToast={onShowToast}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Helpline Detail Modal */}
      <AnimatePresence>
        {selectedHelpline && (
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
              className="w-full max-w-md luxury-card p-7 space-y-4 bg-[#FFFCF8]"
            >
              <div className="text-xs font-medium text-[#B76E79] tracking-wider">
                24/7 Public Helpline Directory
              </div>
              <h3 className="font-display text-2xl font-bold text-[#0A0A0A]">
                {selectedHelpline.number} — {selectedHelpline.title}
              </h3>
              <p className="text-sm text-[#5C544E] leading-relaxed">{selectedHelpline.detail}</p>
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedHelpline(null)}
                  className="btn-luxury-outline px-5 text-xs font-medium"
                >
                  Close
                </button>
                <a
                  href={`tel:${selectedHelpline.number}`}
                  className="btn-luxury px-6 text-xs font-medium inline-flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-[16px] text-[#D4AF37]">call</span>
                  <span>Dial {selectedHelpline.number}</span>
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Safe Haven Lounges Modal */}
      <AnimatePresence>
        {sanctuaryDrawerOpen && (
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
              className="w-full max-w-md luxury-card p-7 space-y-4 bg-[#FFFCF8]"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display text-2xl font-bold text-[#0A0A0A]">
                  Safe Haven Waiting Lounges
                </h3>
                <button
                  type="button"
                  onClick={() => setSanctuaryDrawerOpen(false)}
                  className="w-9 h-9 rounded-full bg-[#FAF3EB] border border-[#F0E6DC] flex items-center justify-center text-[#5C544E] hover:text-[#0A0A0A]"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
              <p className="text-xs text-[#5C544E]">
                Recommended well-lit 24/7 concourses and pharmacies for safe waiting:
              </p>
              <div className="space-y-3">
                {[
                  {
                    name: 'Wellness Forever 24/7 Pharmacy Lounge',
                    dist: 'Open 24 Hours · Staffed Counter',
                    note: 'Illuminated boulevard frontage & CCTV reception',
                  },
                  {
                    name: 'The Taj & Imperial Grand Lobby',
                    dist: '24/7 Concierge Desk',
                    note: 'Attended porte-cochère & verified cab pickup',
                  },
                  {
                    name: 'Metro Boulevard Gate 3 Women’s Desk',
                    dist: 'Staffed Until 23:30',
                    note: 'Monitored concourse & direct helpline booth',
                  },
                ].map((s) => (
                  <div
                    key={s.name}
                    className="p-4 rounded-[20px] bg-[#FAF3EB]/75 border border-[#F0E6DC]"
                  >
                    <div className="font-semibold text-sm text-[#0A0A0A]">{s.name}</div>
                    <div className="text-xs text-[#8C6D1F] mt-0.5">{s.dist}</div>
                    <div className="text-xs text-[#5C544E] mt-1">{s.note}</div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setSanctuaryDrawerOpen(false)}
                  className="btn-luxury px-6 text-xs font-medium"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Zero-FIR Stage Guide Modal */}
      <AnimatePresence>
        {caseTrackerOpen && (
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
              className="w-full max-w-md luxury-card p-7 space-y-4 bg-[#FFFCF8]"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display text-2xl font-bold text-[#0A0A0A]">
                  Zero-FIR Milestone Guide
                </h3>
                <button
                  type="button"
                  onClick={() => setCaseTrackerOpen(false)}
                  className="w-9 h-9 rounded-full bg-[#FAF3EB] border border-[#F0E6DC] flex items-center justify-center text-[#5C544E] hover:text-[#0A0A0A]"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
              <p className="text-xs text-[#5C544E]">
                Reference overview of how a statutory Zero-FIR proceeds after filing:
              </p>
              <div className="space-y-3 text-xs">
                <div className="p-3.5 rounded-[18px] bg-[#E8EDE8]/65 border border-[#DFE7DF]">
                  <div className="font-semibold text-[#0A0A0A]">
                    01. Immediate Registration &amp; Free Copy
                  </div>
                  <div className="text-[#5C544E] mt-0.5">
                    Any police station registers the complaint regardless of jurisdiction and provides a free signed copy.
                  </div>
                </div>
                <div className="p-3.5 rounded-[18px] bg-[#FAF3EB]/75 border border-[#F0E6DC]">
                  <div className="font-semibold text-[#0A0A0A]">
                    02. Liaison Officer &amp; Jurisdiction Transfer
                  </div>
                  <div className="text-[#5C544E] mt-0.5">
                    Initial statement is recorded respectfully before forwarding to the local station.
                  </div>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setCaseTrackerOpen(false)}
                  className="btn-luxury px-6 text-xs font-medium"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
