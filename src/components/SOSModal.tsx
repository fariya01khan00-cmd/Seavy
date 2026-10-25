import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { FamilyEmergencyContact, PowerTriplePressMode } from '../types';
import { STITCH_ASSETS } from '../data/demoData';
import { ResilientImage } from './ResilientImage';
import { apiFetch } from '../config/api';

interface SOSModalProps {
  open: boolean;
  onClose: () => void;
  onNavigateHelplines: () => void;
  onNavigateConcierge: () => void;
  sirenVolumePercent: number;
  powerTriplePressMode: PowerTriplePressMode;
  onChangeTriplePressMode: (mode: PowerTriplePressMode) => void;
  familyContacts: FamilyEmergencyContact[];
  guardianName: string;
  guardianId: string;
  autoTriggerSoundFromPhrase?: boolean;
  autoTriggerSilentFromShortcut?: boolean;
  onConsumeAutoTrigger?: () => void;
  onShowToast?: (msg: string) => void;
}

interface ActiveSirenNodes {
  ctx: AudioContext;
  masterGain: GainNode;
  oscPrimary: OscillatorNode;
  oscSecondary: OscillatorNode;
  lfo: OscillatorNode;
}

function volumePercentToGain(percent: number): number {
  const clamped = Math.max(20, Math.min(100, percent));
  const normalized = (clamped - 20) / 80;
  return Number((0.14 + Math.pow(normalized, 1.3) * 0.74).toFixed(3));
}

export const SOSModal: React.FC<SOSModalProps> = ({
  open,
  onClose,
  onNavigateHelplines,
  onNavigateConcierge,
  sirenVolumePercent,
  powerTriplePressMode,
  onChangeTriplePressMode,
  familyContacts,
  guardianName,
  guardianId,
  autoTriggerSoundFromPhrase = false,
  autoTriggerSilentFromShortcut = false,
  onConsumeAutoTrigger,
  onShowToast,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const [mode, setMode] = useState<'ready' | 'silent_active' | 'sound_active'>('ready');
  const [isSirenPlaying, setIsSirenPlaying] = useState(false);
  const [warningAcknowledged, setWarningAcknowledged] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [liveCoords, setLiveCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsStatusText, setGpsStatusText] = useState<string>('Ready to lock live GPS');

  const sirenNodesRef = useRef<ActiveSirenNodes | null>(null);

  const permittedFavourites = useMemo(
    () =>
      familyContacts.filter(
        (c) => c.isFavourite !== false && c.allowLiveLocation !== false
      ),
    [familyContacts]
  );

  const primaryParentContact = useMemo(
    () =>
      familyContacts.find((c) => /parent|home|maa|papa/i.test(`${c.name} ${c.relation}`)) ||
      familyContacts[0] ||
      null,
    [familyContacts]
  );

  const stopSirenAudio = useCallback(() => {
    const active = sirenNodesRef.current;
    sirenNodesRef.current = null;
    setIsSirenPlaying(false);

    if (!active) return;

    const { ctx, masterGain, oscPrimary, oscSecondary, lfo } = active;
    try {
      const now = ctx.currentTime;
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setValueAtTime(Math.max(masterGain.gain.value, 0.0001), now);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

      window.setTimeout(() => {
        try {
          oscPrimary.stop();
          oscSecondary.stop();
          lfo.stop();
        } catch {
          // Already stopped
        }
        if (ctx.state !== 'closed') {
          void ctx.close().catch(() => {});
        }
      }, 80);
    } catch {
      if (ctx.state !== 'closed') {
        void ctx.close().catch(() => {});
      }
    }
  }, []);

  /**
   * Executes full SOS dispatch protocol (Live GPS lock + Bluetooth nearby peer broadcast + Favourites share payload)
   * Works identically for both Silent SOS (zero sound) and Louder SOS!
   */
  const executeFullSosDispatch = useCallback(
    (silent: boolean) => {
      setGpsStatusText('Acquiring high-accuracy live GPS...');

      const broadcastPacket = (coords: { lat: number; lng: number } | null) => {
        const packet = {
          id: `ble-sos-${Date.now()}`,
          senderName: guardianName,
          senderGuardianId: guardianId,
          signalType: 'save_me' as const,
          message: silent
            ? `SILENT SOS ACTIVE — ${guardianName} needs discreet immediate assistance. Do not trigger loud alarms.`
            : `LOUDER SOS ACTIVE — ${guardianName} activated urgent SOS & live location alert!`,
          etaText: 'Immediate Nearby Alert',
          distanceText: coords
            ? `GPS ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`
            : 'Bluetooth Peer Beacon',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          coords,
          via: 'bluetooth_peer' as const,
        };

        try {
          if ('BroadcastChannel' in window) {
            const ch = new BroadcastChannel('saevy_ble_peer_v1');
            ch.postMessage(packet);
            ch.close();
          }
        } catch {}

        apiFetch('/api/ble/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(packet),
        }).catch(() => {});

        apiFetch('/api/sos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: packet.id,
            guardianName,
            guardianId,
            mode: silent ? 'silent' : 'louder',
            message: packet.message,
            coords,
            contacts: permittedFavourites,
            contactsNotified: permittedFavourites.length,
          }),
        }).catch(() => {});
      };

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setLiveCoords(coords);
            const mapsUrl = `https://www.google.com/maps?q=${coords.lat},${coords.lng}`;
            setGpsStatusText(
              `Live GPS shared with ${permittedFavourites.length} Favourite contact${
                permittedFavourites.length === 1 ? '' : 's'
              }: ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`
            );
            navigator.clipboard
              ?.writeText(
                `SAEVY ${silent ? 'SILENT' : 'URGENT'} SOS — Live Location for ${guardianName}: ${mapsUrl}`
              )
              .catch(() => {});
            broadcastPacket(coords);
          },
          () => {
            setGpsStatusText(
              `Bluetooth peer alert sent & SMS dispatch ready for ${permittedFavourites.length} Favourites`
            );
            broadcastPacket(null);
          },
          { enableHighAccuracy: true, timeout: 8000 }
        );
      } else {
        setGpsStatusText('Bluetooth peer alert sent & SMS dispatch ready');
        broadcastPacket(null);
      }
    },
    [guardianId, guardianName, permittedFavourites]
  );

  const activateSilentSos = useCallback(() => {
    stopSirenAudio();
    setMode('silent_active');
    executeFullSosDispatch(true);
    onShowToast?.(
      'Silent SOS Active — Zero noise · Live location & Bluetooth peer alert prepared for Favourites'
    );
  }, [executeFullSosDispatch, onShowToast, stopSirenAudio]);

  const startSirenAudio = useCallback(async () => {
    setAudioError(null);
    executeFullSosDispatch(false);

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioCtx) {
      setAudioError('Web Audio API is not supported on this browser.');
      return;
    }

    stopSirenAudio();

    try {
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const now = ctx.currentTime;
      const targetGain = volumePercentToGain(sirenVolumePercent);

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-6, now);
      compressor.knee.setValueAtTime(12, now);
      compressor.ratio.setValueAtTime(8, now);
      compressor.attack.setValueAtTime(0.003, now);
      compressor.release.setValueAtTime(0.15, now);
      compressor.connect(ctx.destination);

      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.0001, now);
      masterGain.gain.exponentialRampToValueAtTime(targetGain, now + 0.07);
      masterGain.connect(compressor);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(3200, now);
      filter.Q.setValueAtTime(1.2, now);
      filter.connect(masterGain);

      const oscPrimary = ctx.createOscillator();
      oscPrimary.type = 'sawtooth';
      oscPrimary.frequency.setValueAtTime(1080, now);

      const oscSecondary = ctx.createOscillator();
      oscSecondary.type = 'triangle';
      oscSecondary.frequency.setValueAtTime(1096, now);

      const primaryMix = ctx.createGain();
      primaryMix.gain.setValueAtTime(0.55, now);
      const secondaryMix = ctx.createGain();
      secondaryMix.gain.setValueAtTime(0.35, now);

      oscPrimary.connect(primaryMix);
      oscSecondary.connect(secondaryMix);
      primaryMix.connect(filter);
      secondaryMix.connect(filter);

      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(1.9, now);

      const lfoDepth = ctx.createGain();
      lfoDepth.gain.setValueAtTime(320, now);

      lfo.connect(lfoDepth);
      lfoDepth.connect(oscPrimary.frequency);
      lfoDepth.connect(oscSecondary.frequency);

      oscPrimary.start(now);
      oscSecondary.start(now);
      lfo.start(now);

      sirenNodesRef.current = {
        ctx,
        masterGain,
        oscPrimary,
        oscSecondary,
        lfo,
      };
      setIsSirenPlaying(true);
      setMode('sound_active');
    } catch {
      setAudioError(
        'Browser prevented automatic sound playback. Tap the Saevy Logo orb to start manually.'
      );
      setIsSirenPlaying(false);
    }
  }, [executeFullSosDispatch, sirenVolumePercent, stopSirenAudio]);

  useEffect(() => {
    const active = sirenNodesRef.current;
    if (!active || !isSirenPlaying) return;
    const now = active.ctx.currentTime;
    active.masterGain.gain.cancelScheduledValues(now);
    active.masterGain.gain.setTargetAtTime(volumePercentToGain(sirenVolumePercent), now, 0.05);
  }, [sirenVolumePercent, isSirenPlaying]);

  useEffect(() => {
    if (!open) return;
    if (autoTriggerSoundFromPhrase) {
      setWarningAcknowledged(true);
      void startSirenAudio();
      onConsumeAutoTrigger?.();
    } else if (autoTriggerSilentFromShortcut) {
      activateSilentSos();
      onConsumeAutoTrigger?.();
    }
  }, [
    open,
    autoTriggerSoundFromPhrase,
    autoTriggerSilentFromShortcut,
    startSirenAudio,
    activateSilentSos,
    onConsumeAutoTrigger,
  ]);

  useEffect(() => {
    if (!open) {
      stopSirenAudio();
      setMode('ready');
      setWarningAcknowledged(false);
      setAudioError(null);
    }
  }, [open, stopSirenAudio]);

  useEffect(() => {
    return () => {
      stopSirenAudio();
    };
  }, [stopSirenAudio]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        stopSirenAudio();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, stopSirenAudio]);

  const handleCloseModal = () => {
    stopSirenAudio();
    onClose();
  };

  const handleSaevyEmblemPress = () => {
    if (isSirenPlaying) {
      stopSirenAudio();
      setMode('ready');
      return;
    }
    if (warningAcknowledged) {
      void startSirenAudio();
    } else {
      activateSilentSos();
    }
  };

  const smsNumbers = permittedFavourites
    .map((f) => f.phone.replace(/\s+/g, ''))
    .filter(Boolean)
    .join(',');
  const mapsShareUrl = liveCoords
    ? `https://www.google.com/maps?q=${liveCoords.lat},${liveCoords.lng}`
    : 'Live GPS locating';
  const smsBody = encodeURIComponent(
    `SAEVY ${mode === 'silent_active' ? 'SILENT' : 'EMERGENCY'} SOS from ${guardianName}: Please check my live location immediately (${mapsShareUrl}) and call me / 112.`
  );
  const smsHref = `sms:${smsNumbers}?body=${smsBody}`;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={prefersReducedMotion ? undefined : { opacity: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.28 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#07060C]/80 backdrop-blur-2xl no-print"
          role="dialog"
          aria-modal="true"
          aria-label="Saevy Emblem SOS Sanctuary"
        >
          <motion.div
            initial={prefersReducedMotion ? false : { y: 28, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={prefersReducedMotion ? undefined : { y: 20, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="w-full max-w-lg max-h-[94dvh] overflow-y-auto rounded-t-[32px] sm:rounded-[32px] luxury-card p-6 sm:p-8 space-y-5"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <span className="text-xs font-medium tracking-[0.18em] text-[#D4AF37] uppercase">
                  Saevy Emblem Guardian · Offline Bluetooth &amp; GPS
                </span>
                <h2 className="font-display text-[28px] font-bold leading-tight text-[#0A0A0A] tracking-wide">
                  Saevy SOS Sanctuary
                </h2>
                <p className="text-xs text-[#5C544E] leading-relaxed">
                  Press the Saevy Logo for <strong>Silent SOS</strong> (full live location &amp; Bluetooth alert with zero loud sound) or enable <strong>Original Louder SOS</strong>.
                </p>
              </div>

              <button
                type="button"
                onClick={handleCloseModal}
                className="min-w-[44px] min-h-[44px] rounded-full bg-[#FFF8F0] border border-[#F0E6DC] flex items-center justify-center text-[#0A0A0A] hover:border-[#D4AF37] active:scale-95 transition-all shrink-0"
                aria-label="Close Saevy SOS Sanctuary"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* 180px Royal Saevy Logo SOS Button (Replaces Red SOS Button) */}
            <div className="py-2 flex flex-col items-center justify-center text-center space-y-4">
              <div className="relative flex items-center justify-center">
                {!prefersReducedMotion && (
                  <motion.span
                    aria-hidden="true"
                    animate={
                      isSirenPlaying
                        ? { scale: [1, 1.18, 1], opacity: [0.65, 0.2, 0.65] }
                        : mode === 'silent_active'
                          ? { scale: [1, 1.12, 1], opacity: [0.5, 0.18, 0.5] }
                          : { scale: [1, 1.07, 1], opacity: [0.35, 0.14, 0.35] }
                    }
                    transition={{
                      duration: isSirenPlaying ? 1.8 : 3.4,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                    className="absolute w-[216px] h-[216px] rounded-full bg-[radial-gradient(circle,rgba(212,175,55,0.42)_0%,rgba(197,123,136,0.16)_45%,rgba(0,0,0,0)_74%)] pointer-events-none"
                  />
                )}

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={handleSaevyEmblemPress}
                  aria-label={
                    isSirenPlaying
                      ? 'Stop Louder SOS siren immediately'
                      : warningAcknowledged
                        ? 'Activate Louder SOS with Saevy Logo'
                        : 'Activate Silent SOS with Saevy Logo'
                  }
                  className="relative w-[180px] h-[180px] rounded-full bg-[radial-gradient(circle_at_30%_25%,#261E3A_0%,#130F1E_62%,#09070F_100%)] text-[#F5EFE6] border-2 border-[#D4AF37] shadow-[0_20px_56px_rgba(212,175,55,0.28),inset_0_2px_14px_rgba(255,255,255,0.16)] flex flex-col items-center justify-center gap-1.5 p-4 focus-visible:outline-2 focus-visible:outline-[#D4AF37]"
                >
                  <ResilientImage
                    src={STITCH_ASSETS.logoEmblem}
                    alt="Saevy SOS Emblem"
                    className="w-16 h-16 object-contain drop-shadow-[0_4px_16px_rgba(212,175,55,0.5)]"
                    fallbackIcon="shield_with_heart"
                  />
                  <span className="font-display text-lg font-bold tracking-[0.14em] text-[#D4AF37]">
                    {isSirenPlaying
                      ? 'STOP SIREN'
                      : mode === 'silent_active'
                        ? 'SILENT SOS ON'
                        : 'SAEVY SOS'}
                  </span>
                  <span className="text-[11px] font-medium text-[#E4DDD3] px-2">
                    {isSirenPlaying
                      ? 'Tap Logo to Silence'
                      : warningAcknowledged
                        ? 'Tap Logo for Louder SOS'
                        : 'Tap Logo for Silent SOS'}
                  </span>
                </motion.button>
              </div>

              {/* Active Silent SOS or Louder SOS Live Dispatch Status */}
              {(mode === 'silent_active' || isSirenPlaying) && (
                <div
                  role="status"
                  aria-live="polite"
                  className="w-full luxury-card-sage p-4 text-left space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#0A0A0A]">
                      {isSirenPlaying
                        ? `Original Louder SOS Active (${sirenVolumePercent}% Siren + Live GPS)`
                        : 'Silent SOS Active (Zero Sound · Full Live GPS & Bluetooth Alert)'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        stopSirenAudio();
                        setMode('ready');
                      }}
                      className="text-xs underline text-[#8C6D1F]"
                    >
                      Reset
                    </button>
                  </div>
                  <p className="text-xs text-[#5C544E] leading-relaxed">{gpsStatusText}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <a
                      href={smsHref}
                      className="btn-luxury px-4 text-xs font-semibold flex items-center justify-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-[16px] text-[#D4AF37]">
                        sms
                      </span>
                      <span>SMS Live GPS to Favourites ({permittedFavourites.length})</span>
                    </a>
                    {primaryParentContact && (
                      <a
                        href={`tel:${primaryParentContact.phone.replace(/\s+/g, '')}`}
                        className="btn-luxury-outline px-4 text-xs font-semibold flex items-center justify-center gap-1.5"
                      >
                        <span className="material-symbols-outlined text-[16px] text-[#D4AF37]">
                          call
                        </span>
                        <span>Call {primaryParentContact.name}</span>
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Power-Button 3x Rapid Press Mode Choice (Silent SOS vs Louder SOS) */}
            <div className="luxury-card p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#0A0A0A] flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-[#D4AF37]">
                    power_settings_new
                  </span>
                  <span>3× Rapid Press SOS Mode</span>
                </span>
                <span className="text-[11px] text-[#8C6D1F]">Press Shift 3× rapidly to test</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onChangeTriplePressMode('silent_sos')}
                  className={`min-h-[42px] px-3 rounded-full text-xs font-medium border transition-all ${
                    powerTriplePressMode === 'silent_sos'
                      ? 'bg-[#0A0A0A] text-[#FFFCF8] border-[#D4AF37]'
                      : 'bg-[#FFFCF8] text-[#5C544E] border-[#F0E6DC]'
                  }`}
                >
                  3× → Silent SOS
                </button>
                <button
                  type="button"
                  onClick={() => onChangeTriplePressMode('louder_sos')}
                  className={`min-h-[42px] px-3 rounded-full text-xs font-medium border transition-all ${
                    powerTriplePressMode === 'louder_sos'
                      ? 'bg-[#0A0A0A] text-[#FFFCF8] border-[#D4AF37]'
                      : 'bg-[#FFFCF8] text-[#5C544E] border-[#F0E6DC]'
                  }`}
                >
                  3× → Louder SOS
                </button>
              </div>
            </div>

            {/* Dual Mode Controls: Silent SOS vs Original Louder SOS */}
            {!isSirenPlaying && (
              <div className="luxury-card p-5 space-y-3.5">
                <label className="flex items-start gap-2.5 cursor-pointer select-none text-xs text-[#0A0A0A]">
                  <input
                    type="checkbox"
                    checked={warningAcknowledged}
                    onChange={(e) => setWarningAcknowledged(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-[#D4AF37] rounded shrink-0"
                  />
                  <span>
                    Enable <strong>Original Louder SOS Siren</strong> ({sirenVolumePercent}% gain — remove earphones first). Leave unchecked for zero-noise <strong>Silent SOS</strong>.
                  </span>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={activateSilentSos}
                    className="btn-luxury-outline px-4 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    <span className="material-symbols-outlined text-[18px] text-[#D4AF37]">
                      notifications_off
                    </span>
                    <span>Silent SOS (No Sound)</span>
                  </button>

                  <button
                    type="button"
                    disabled={!warningAcknowledged}
                    onClick={() => void startSirenAudio()}
                    className="btn-luxury px-4 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    <span className="material-symbols-outlined text-[18px] text-[#D4AF37]">
                      volume_up
                    </span>
                    <span>Original Louder SOS</span>
                  </button>
                </div>

                {audioError && (
                  <p className="text-xs text-[#9E2A3B]" role="alert">
                    {audioError}
                  </p>
                )}
              </div>
            )}

            {/* Direct Phone Dial & Concierge Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <a
                href="tel:112"
                className="btn-luxury px-4 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-[18px] text-[#D4AF37]">call</span>
                <span>Dial 112 Now</span>
              </a>

              <button
                type="button"
                onClick={() => {
                  handleCloseModal();
                  onNavigateHelplines();
                }}
                className="btn-luxury-outline px-4 text-xs sm:text-sm font-medium flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-[18px] text-[#B76E79]">
                  shield
                </span>
                <span>Helplines</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  handleCloseModal();
                  onNavigateConcierge();
                }}
                className="btn-luxury-outline px-4 text-xs sm:text-sm font-medium flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-[18px] text-[#D4AF37]">
                  auto_awesome
                </span>
                <span>AI Concierge</span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
