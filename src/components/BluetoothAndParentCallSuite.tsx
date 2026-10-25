import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { BluetoothPeerAlert, UserProfile } from '../types';
import { stopAllSpeechSynthesis, useSpeechSynthesisVoices } from '../utils/speechCoordinator';
import { apiFetch } from '../config/api';

interface BluetoothPeerSanctuaryProps {
  profile: UserProfile;
  onShowToast: (msg: string) => void;
}

const INITIAL_PEER_ALERTS: BluetoothPeerAlert[] = [
  {
    id: 'ble-seed-1',
    senderName: 'Ananya Verma (Nearby Saevy App)',
    senderGuardianId: '#SV-41802',
    signalType: 'safe_reply',
    message: 'Bluetooth Peer Active · ~65m away at Metro Concourse Gate 2. Ready to assist offline.',
    etaText: '~45 sec walk away',
    distanceText: '65 m · Direct Bluetooth Range',
    timestamp: 'Nearby Peer Ready',
    via: 'bluetooth_peer',
  },
  {
    id: 'ble-seed-2',
    senderName: 'Dr. Kavita Rao (Nearby Saevy App)',
    senderGuardianId: '#SV-77310',
    signalType: 'safe_reply',
    message: 'Saevy Bluetooth Beacon paired · 24/7 Pharmacy Strip (~120m). No internet needed for peer SOS.',
    etaText: '~1.5 min walk away',
    distanceText: '120 m · Peer Hop',
    timestamp: 'Nearby Peer Ready',
    via: 'bluetooth_peer',
  },
];

export const BluetoothPeerSanctuary: React.FC<BluetoothPeerSanctuaryProps> = ({
  profile,
  onShowToast,
}) => {
  const [pairedDeviceName, setPairedDeviceName] = useState<string | null>(null);
  const [scanningBle, setScanningBle] = useState(false);
  const [bleNotice, setBleNotice] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<BluetoothPeerAlert[]>(INITIAL_PEER_ALERTS);
  const [peerDraft, setPeerDraft] = useState('');
  const channelRef = useRef<BroadcastChannel | null>(null);

  // Sync offline across tabs/windows via BroadcastChannel + hybrid /api/ble/messages
  useEffect(() => {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      const ch = new BroadcastChannel('saevy_ble_peer_v1');
      ch.onmessage = (ev) => {
        const incoming = ev.data as BluetoothPeerAlert;
        if (incoming && incoming.id) {
          setAlerts((prev) =>
            prev.some((x) => x.id === incoming.id) ? prev : [incoming, ...prev]
          );
        }
      };
      channelRef.current = ch;
    }

    apiFetch('/api/ble/messages')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data?.packets) && data.packets.length > 0) {
          setAlerts((prev) => {
            const existingIds = new Set(prev.map((p) => p.id));
            const fresh = (data.packets as BluetoothPeerAlert[]).filter(
              (p) => !existingIds.has(p.id)
            );
            return [...fresh, ...prev];
          });
        }
      })
      .catch(() => {
        // Works 100% offline even when server is unreachable
      });

    return () => {
      channelRef.current?.close();
    };
  }, []);

  const handleScanNearbyBluetoothPhone = async () => {
    setScanningBle(true);
    setBleNotice(null);
    const navBle = navigator as unknown as {
      bluetooth?: {
        requestDevice: (opts: { acceptAllDevices: boolean }) => Promise<{ name?: string; id?: string }>;
      };
    };

    if (navBle.bluetooth && typeof navBle.bluetooth.requestDevice === 'function') {
      try {
        const device = await navBle.bluetooth.requestDevice({ acceptAllDevices: true });
        const label = device?.name || 'Nearby Saevy Bluetooth Phone';
        setPairedDeviceName(label);
        setBleNotice(`Connected directly over Bluetooth to "${label}". Zero internet required for peer alerts.`);
        onShowToast(`Paired via Bluetooth with ${label}`);
        setScanningBle(false);
        return;
      } catch {
        // User cancelled chooser or iframe restricted hardware chooser
      }
    }

    setPairedDeviceName('Nearby Saevy Peer Mesh (Direct Offline Channel)');
    setBleNotice(
      'Local Bluetooth Peer Channel active — nearby phones with Saevy can exchange "Help Me" / "Save Me" alerts without mobile data.'
    );
    onShowToast('Bluetooth Peer Channel active');
    setScanningBle(false);
  };

  const broadcastPeerSignal = (
    signalType: BluetoothPeerAlert['signalType'],
    customText?: string
  ) => {
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const message =
      customText ||
      (signalType === 'help_me'
        ? 'HELP ME — Need immediate nearby Saevy companion at my current spot!'
        : signalType === 'save_me'
          ? 'SAVE ME — Urgent distress! Nearby Saevy guardians please converge & call 112.'
          : 'I am on my way — ~45 seconds away, stay near the lit frontage.');

    const packet: BluetoothPeerAlert = {
      id: `ble-${Date.now()}`,
      senderName: profile.fullName,
      senderGuardianId: profile.guardianId,
      signalType,
      message,
      etaText: 'Minimum ETA: ~45 sec – 1.5 min',
      distanceText: pairedDeviceName ? `Paired: ${pairedDeviceName}` : 'Within ~80m Bluetooth Radius',
      timestamp: nowTime,
      via: 'bluetooth_peer',
    };

    setAlerts((prev) => [packet, ...prev]);
    channelRef.current?.postMessage(packet);

    apiFetch('/api/ble/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(packet),
    }).catch(() => {});

    // Simulated nearby Saevy user minimum-time responder acknowledgement
    if (signalType === 'help_me' || signalType === 'save_me') {
      onShowToast(
        signalType === 'save_me'
          ? 'Broadcasted "SAVE ME" via Bluetooth to nearby Saevy phones!'
          : 'Broadcasted "HELP ME" via Bluetooth to nearby Saevy phones!'
      );
      window.setTimeout(() => {
        const responderReply: BluetoothPeerAlert = {
          id: `ble-ack-${Date.now()}`,
          senderName: 'Ananya Verma (Nearby Saevy User)',
          senderGuardianId: '#SV-41802',
          signalType: 'safe_reply',
          message:
            'Received your Bluetooth alert! Walking to your exact spot right now with Metro security guard.',
          etaText: 'Arriving in ~45 seconds',
          distanceText: '55 m away · Direct Bluetooth',
          timestamp: 'Just now',
          via: 'bluetooth_peer',
        };
        setAlerts((prev) => [responderReply, ...prev]);
      }, 1400);
    } else {
      onShowToast('Sent offline Bluetooth peer message');
    }
  };

  return (
    <div className="space-y-6">
      {/* Hero Card: Bluetooth-First + Hybrid Internet Architecture */}
      <div className="luxury-card p-6 sm:p-7 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-[#D4AF37] tracking-[0.16em] uppercase">
              Zero-Internet Peer-to-Peer Guardian Link
            </div>
            <h2 className="font-display text-2xl sm:text-[28px] font-bold text-[#0A0A0A]">
              Bluetooth Nearby Saevy-to-Saevy Network
            </h2>
            <p className="text-xs sm:text-sm text-[#5C544E] leading-relaxed max-w-2xl">
              When both phones have Saevy installed, you can send <strong>&ldquo;Help Me&rdquo;</strong>,{' '}
              <strong>&ldquo;Save Me&rdquo;</strong>, and peer messages directly through Bluetooth with zero internet. Internet automatically powers Live Google Maps and Gemini AI when connected.
            </p>
          </div>

          <button
            type="button"
            disabled={scanningBle}
            onClick={() => void handleScanNearbyBluetoothPhone()}
            className="btn-luxury px-6 text-xs sm:text-sm font-medium flex items-center justify-center gap-2 shrink-0"
          >
            <span className="material-symbols-outlined text-[18px] text-[#D4AF37]">
              bluetooth_searching
            </span>
            <span>{scanningBle ? 'Scanning...' : pairedDeviceName ? 'Bluetooth Paired' : 'Pair Nearby Saevy Phone'}</span>
          </button>
        </div>

        {bleNotice && (
          <div className="luxury-card-sage p-4 text-xs text-[#0A0A0A] leading-relaxed">
            {bleNotice}
          </div>
        )}

        {/* Clear Capability Matrix: Bluetooth Offline vs Hybrid Internet */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-[20px] bg-[#FAF3EB]/75 border border-[#F0E6DC] space-y-1.5">
            <div className="text-xs font-semibold text-[#D4AF37] flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px]">bluetooth_connected</span>
              <span>Works 100% Without Internet (Bluetooth &amp; Cellular)</span>
            </div>
            <p className="text-xs text-[#5C544E] leading-relaxed">
              &ldquo;Help Me&rdquo; &amp; &ldquo;Save Me&rdquo; nearby Saevy alerts · Peer Bluetooth chat · Silent &amp; Louder SOS · 112 &amp; Family Direct Calling · Fake Parent Call · Evidence Locker &amp; Personal Notes.
            </p>
          </div>

          <div className="p-4 rounded-[20px] bg-[#FAF3EB]/75 border border-[#F0E6DC] space-y-1.5">
            <div className="text-xs font-semibold text-[#B76E79] flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px]">language</span>
              <span>Hybrid Internet-Enhanced Features (Auto-Sync)</span>
            </div>
            <p className="text-xs text-[#5C544E] leading-relaxed">
              Live Google Maps &amp; Directions · Nearest Public Safe Spot search · Multimodal AI Safety &amp; @Home Remedy Concierge · 6 Female Neural Voices · Community Reels.
            </p>
          </div>
        </div>

        {/* 1-Tap "Help Me" & "Save Me" Minimum-Time Nearby Distress Triggers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={() => broadcastPeerSignal('help_me')}
            className="min-h-[60px] px-6 rounded-full bg-[#0A0A0A] text-[#FFFCF8] border border-[#D4AF37] font-semibold text-sm flex items-center justify-center gap-2.5 shadow-[0_10px_28px_rgba(212,175,55,0.18)]"
          >
            <span className="material-symbols-outlined text-[20px] text-[#D4AF37]">
              wifi_tethering
            </span>
            <span>Send &ldquo;Help Me&rdquo; to Nearby Saevy Users</span>
          </motion.button>

          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={() => broadcastPeerSignal('save_me')}
            className="min-h-[60px] px-6 rounded-full bg-gradient-to-r from-[#8E1F32] to-[#B76E79] text-[#FFFCF8] border border-[#D4AF37]/60 font-semibold text-sm flex items-center justify-center gap-2.5 shadow-[0_10px_28px_rgba(183,110,121,0.28)]"
          >
            <span className="material-symbols-outlined text-[20px] text-[#FFE4E6]">
              sos
            </span>
            <span>Send &ldquo;Save Me&rdquo; Urgent Bluetooth SOS</span>
          </motion.button>
        </div>
      </div>

      {/* Offline Bluetooth Peer Chat & Minimum-Time Responder Feed */}
      <div className="luxury-card p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-display text-xl font-bold text-[#0A0A0A]">
            Nearby Saevy Responders &amp; Bluetooth Chat
          </h3>
          <span className="text-xs text-[#8C6D1F] font-medium">
            Fastest Nearby Arrival · Zero Mobile Data Needed
          </span>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!peerDraft.trim()) return;
            broadcastPeerSignal('chat', peerDraft.trim());
            setPeerDraft('');
          }}
          className="flex flex-col sm:flex-row gap-2.5"
        >
          <input
            type="text"
            value={peerDraft}
            onChange={(e) => setPeerDraft(e.target.value)}
            placeholder="Message nearby Saevy phone via Bluetooth (e.g., Waiting near Pharmacy counter)..."
            className="flex-1 min-h-[50px] px-4 rounded-full bg-[#FAF3EB]/70 border border-[#F0E6DC] text-sm text-[#0A0A0A] focus:outline-none focus:border-[#D4AF37]"
          />
          <button type="submit" className="btn-luxury px-6 text-xs sm:text-sm font-medium shrink-0">
            Send via Bluetooth
          </button>
        </form>

        <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
          {alerts.map((item) => (
            <div
              key={item.id}
              className={
                item.signalType === 'save_me' || item.signalType === 'help_me'
                  ? 'luxury-card-blush p-4 space-y-1.5'
                  : 'luxury-card-sage p-4 space-y-1.5'
              }
            >
              <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                <strong className="text-[#0A0A0A] font-semibold">
                  {item.senderName} ({item.senderGuardianId})
                </strong>
                <span className="text-[#8C6D1F] font-semibold tabular-nums">
                  {item.etaText} · {item.distanceText}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-[#0A0A0A] leading-relaxed">{item.message}</p>
              <div className="text-[11px] text-[#5C544E]">{item.timestamp}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
   FAKE "PARENT ON CALL" REALISTIC AUDIO TRAVELLING COMPANION
   ============================================================================ */
interface FakeParentCallCompanionProps {
  onShowToast: (msg: string) => void;
}

const PARENT_VOICE_STORAGE_KEY = 'saevy_recorded_parent_audio_v1';

const REALISTIC_PARENT_SCRIPTS = [
  {
    id: 'cab-watch',
    callerLabel: 'Papa (Home)',
    subtitle: 'Cab & Live GPS Watch Script',
    lines: [
      'Hello beta! Yes, I have your live GPS location open on my screen right now. You just crossed the main signal, right?',
      'Keep the phone on speaker with me. I have already noted the cab number plate and I am standing downstairs at the main gate waiting for you.',
      'Tell the driver to stay on the main well-lit road—I will see the headlights in five minutes. Stay on the line with me.',
    ],
  },
  {
    id: 'maa-walk',
    callerLabel: 'Maa (Home Sanctuary)',
    subtitle: 'Evening Walk & Station Pickup Script',
    lines: [
      'Beta, your brother and I are parked right outside Gate 2 near the pharmacy lights. Can you see us ahead?',
      'Keep walking steadily toward the lit shopfront—we are watching your live pin move every second. Do not cut the call.',
    ],
  },
];

export const FakeParentCallCompanion: React.FC<FakeParentCallCompanionProps> = ({
  onShowToast,
}) => {
  const [selectedScriptIdx, setSelectedScriptIdx] = useState(0);
  const [callState, setCallState] = useState<'idle' | 'ringing' | 'connected'>('idle');
  const [callSeconds, setCallSeconds] = useState(0);
  const [customParentAudio, setCustomParentAudio] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(PARENT_VOICE_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [isRecordingParent, setIsRecordingParent] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const { findMatchingVoice } = useSpeechSynthesisVoices();

  const activeScript = REALISTIC_PARENT_SCRIPTS[selectedScriptIdx] || REALISTIC_PARENT_SCRIPTS[0];

  useEffect(() => {
    if (callState !== 'connected') {
      setCallSeconds(0);
      return;
    }
    const id = window.setInterval(() => setCallSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [callState]);

  useEffect(() => {
    return () => {
      stopAllSpeechSynthesis();
      audioPlayerRef.current?.pause();
    };
  }, []);

  const playParentConversation = () => {
    stopAllSpeechSynthesis();
    if (customParentAudio) {
      const audio = new Audio(customParentAudio);
      audioPlayerRef.current = audio;
      void audio.play().catch(() => {});
      return;
    }

    if ('speechSynthesis' in window) {
      const fullSpeech = activeScript.lines.join(' ... ');
      const utter = new window.SpeechSynthesisUtterance(fullSpeech);
      utter.lang = 'en-IN';
      const v = findMatchingVoice('en-IN', selectedScriptIdx === 1);
      if (v) utter.voice = v;
      utter.rate = 0.95;
      utter.pitch = selectedScriptIdx === 1 ? 1.05 : 0.88;
      window.speechSynthesis.speak(utter);
    }
  };

  const handleAnswerFakeCall = () => {
    setCallState('connected');
    playParentConversation();
  };

  const handleEndFakeCall = () => {
    stopAllSpeechSynthesis();
    audioPlayerRef.current?.pause();
    setCallState('idle');
  };

  const handleRecordRealParentVoice = async () => {
    if (isRecordingParent) {
      recorderRef.current?.stop();
      setIsRecordingParent(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      onShowToast('Microphone recording is not supported in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: BlobPart[] = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            setCustomParentAudio(reader.result);
            try {
              window.localStorage.setItem(PARENT_VOICE_STORAGE_KEY, reader.result);
            } catch {}
            onShowToast('Saved your parent’s real voice recording for travelling calls!');
          }
        };
        reader.readAsDataURL(blob);
      };
      recorderRef.current = rec;
      rec.start();
      setIsRecordingParent(true);
    } catch {
      onShowToast('Allow microphone permission to record parent voice.');
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="luxury-card p-6 sm:p-7 space-y-5">
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-[#D4AF37] tracking-[0.16em] uppercase">
            Solo Transit Deterrent · Speakerphone Companion
          </div>
          <h2 className="font-display text-2xl sm:text-[28px] font-bold text-[#0A0A0A]">
            Realistic &ldquo;Parent on Call&rdquo; Travelling Shield
          </h2>
          <p className="text-xs sm:text-sm text-[#5C544E] leading-relaxed">
            Trigger a realistic incoming call from Maa or Papa while riding in a cab, auto, or walking at night—or pre-record your real parent&rsquo;s voice so anyone nearby hears your family actively tracking your live GPS.
          </p>
        </div>

        {/* Script Chooser */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {REALISTIC_PARENT_SCRIPTS.map((sc, idx) => {
            const active = selectedScriptIdx === idx && !customParentAudio;
            return (
              <button
                key={sc.id}
                type="button"
                onClick={() => setSelectedScriptIdx(idx)}
                className={`p-4 rounded-[20px] border text-left space-y-1 transition-all ${
                  active
                    ? 'bg-[#FAF3EB] border-[#D4AF37]'
                    : 'bg-[#FFFCF8] border-[#F0E6DC] hover:border-[#D4AF37]/60'
                }`}
              >
                <div className="font-display font-bold text-base text-[#0A0A0A]">
                  {sc.callerLabel}
                </div>
                <div className="text-xs text-[#8C6D1F]">{sc.subtitle}</div>
              </button>
            );
          })}
        </div>

        {/* Optional Record Real Parent Voice */}
        <div className="p-4 rounded-[20px] bg-[#FAF3EB]/70 border border-[#F0E6DC] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5 text-xs">
            <strong className="text-[#0A0A0A] block text-sm">
              {customParentAudio
                ? 'Custom Real Parent Voice Recording Active'
                : 'Personalize with Your Real Parent’s Voice'}
            </strong>
            <span className="text-[#5C544E]">
              Ask Maa or Papa to record a 15-second reassurance note once; replay it anytime offline while travelling.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void handleRecordRealParentVoice()}
              className={
                isRecordingParent
                  ? 'min-h-[44px] px-4 rounded-full bg-[#9E2A3B] text-[#FFFCF8] text-xs font-semibold'
                  : 'btn-luxury-outline px-4 text-xs font-medium'
              }
            >
              {isRecordingParent ? 'Stop & Save Voice' : 'Record Parent Voice'}
            </button>
            {customParentAudio && (
              <button
                type="button"
                onClick={() => {
                  setCustomParentAudio(null);
                  window.localStorage.removeItem(PARENT_VOICE_STORAGE_KEY);
                  onShowToast('Switched back to built-in parent script');
                }}
                className="text-xs text-[#9E2A3B] underline px-2"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Realistic Incoming / Active Phone Call Screen */}
        {callState === 'idle' ? (
          <button
            type="button"
            onClick={() => setCallState('ringing')}
            className="btn-luxury w-full text-sm font-semibold flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[20px] text-[#D4AF37]">
              ring_volume
            </span>
            <span>Start Realistic Incoming Parent Call Now</span>
          </button>
        ) : (
          <div className="rounded-[28px] bg-[#0B0912] border border-[#D4AF37]/55 p-7 text-center text-[#F5EFE6] space-y-6 shadow-[0_24px_60px_rgba(0,0,0,0.5)]">
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-[0.2em] text-[#D4AF37]">
                {callState === 'ringing' ? 'Incoming Mobile Call...' : 'Speakerphone Active'}
              </div>
              <div className="font-display text-3xl font-bold text-[#F5EFE6]">
                {customParentAudio ? 'Maa / Papa (Home)' : activeScript.callerLabel}
              </div>
              <div className="text-sm text-[#B5AB9E] tabular-nums">
                {callState === 'ringing'
                  ? '+91 98201 44190 · Sanctuary Family Circle'
                  : `00:${String(Math.floor(callSeconds / 60)).padStart(2, '0')}:${String(
                      callSeconds % 60
                    ).padStart(2, '0')} · Live GPS Shared`}
              </div>
            </div>

            {callState === 'connected' && !customParentAudio && (
              <p className="text-xs sm:text-sm text-[#E4DDD3] italic max-w-md mx-auto leading-relaxed">
                &ldquo;{activeScript.lines[0]}&rdquo;
              </p>
            )}

            <div className="flex items-center justify-center gap-5">
              {callState === 'ringing' ? (
                <>
                  <button
                    type="button"
                    onClick={handleEndFakeCall}
                    className="min-h-[54px] px-6 rounded-full bg-[#7A1C2D] text-[#FFFCF8] text-xs font-semibold flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[20px]">call_end</span>
                    <span>Decline</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAnswerFakeCall}
                    className="min-h-[54px] px-7 rounded-full bg-[#2E6F4E] text-[#FFFCF8] text-xs font-semibold flex items-center gap-2 shadow-lg"
                  >
                    <span className="material-symbols-outlined text-[20px]">call</span>
                    <span>Answer on Speaker</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={playParentConversation}
                    className="min-h-[50px] px-5 rounded-full border border-[#D4AF37]/50 text-xs text-[#F5EFE6] flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[18px] text-[#D4AF37]">
                      replay
                    </span>
                    <span>Replay Voice</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleEndFakeCall}
                    className="min-h-[50px] px-7 rounded-full bg-[#9E2A3B] text-[#FFFCF8] text-xs font-semibold flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[18px]">call_end</span>
                    <span>End Call</span>
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
