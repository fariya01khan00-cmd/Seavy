import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ConciergeAttachment,
  EvidencePolaroidRecord,
  QuickNoteItem,
} from '../types';
import { STITCH_ASSETS } from '../data/demoData';
import {
  getBcp47LocaleForDialect,
  useSingleShotSpeechInput,
} from '../utils/speechCoordinator';
import { getUiLang } from '../utils/i18n';
import { apiFetch } from '../config/api';

export type StudioModalTab = 'photo' | 'video' | 'audio' | 'notes';

interface MediaCaptureAndNotesModalProps {
  open: boolean;
  initialTab?: StudioModalTab;
  autoStartCapture?: boolean;
  dialectCode: string;
  defaultLocationLabel: string;
  onClose: () => void;
  onSendMediaToAi: (attachment: ConciergeAttachment, promptText: string) => void;
  onShowToast: (msg: string) => void;
}

const EVIDENCE_STORAGE_KEY = 'saevy_proto_evidence_polaroids_v1';
const NOTES_STORAGE_KEY = 'saevy_personal_quick_notes_v1';

function loadNotes(): QuickNoteItem[] {
  try {
    const raw = window.localStorage.getItem(NOTES_STORAGE_KEY);
    if (!raw) {
      return [
        {
          id: 'note-welcome',
          title: 'Evening Cab & Metro Checklist',
          body: 'Share live location with Saif & Maa before boarding. Check child-lock switch on rear door.',
          updatedAt: 'Saved locally',
          languageCode: 'en',
        },
      ];
    }
    const parsed = JSON.parse(raw) as QuickNoteItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function appendPolaroidToLocker(record: EvidencePolaroidRecord) {
  try {
    const raw = window.localStorage.getItem(EVIDENCE_STORAGE_KEY);
    const existing: EvidencePolaroidRecord[] = raw ? JSON.parse(raw) : [];
    const next = [record, ...(Array.isArray(existing) ? existing : [])];
    window.localStorage.setItem(EVIDENCE_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('saevy-evidence-updated'));
  } catch {
    // Ignore quota errors
  }
  apiFetch('/api/evidence', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  }).catch(() => {});
}

export const MediaCaptureAndNotesModal: React.FC<MediaCaptureAndNotesModalProps> = ({
  open,
  initialTab = 'photo',
  autoStartCapture = false,
  dialectCode,
  defaultLocationLabel,
  onClose,
  onSendMediaToAi,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<StudioModalTab>(initialTab);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isStreamActive, setIsStreamActive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);

  // Captured Preview
  const [capturedAttachment, setCapturedAttachment] = useState<ConciergeAttachment | null>(null);
  const [captureTitle, setCaptureTitle] = useState('');
  const [aiQuestionDraft, setAiQuestionDraft] = useState('');

  // Personal Notes state
  const [notes, setNotes] = useState<QuickNoteItem[]>(() => loadNotes());
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');

  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);

  const uiLang = getUiLang(dialectCode);
  const bcp47 = getBcp47LocaleForDialect(dialectCode);

  const noteDictationMic = useSingleShotSpeechInput({
    recognitionLang: bcp47,
    uiLang,
    onTranscript: (text, isFinal) => {
      if (isFinal) {
        setNoteBody((prev) => (prev ? `${prev} ${text}` : text));
      }
    },
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
    } catch {
      // Ignore
    }
  }, [notes]);

  const stopMediaStream = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop();
      } catch {
        // Ignore
      }
    }
    recorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsStreamActive(false);
    setIsRecording(false);
    setRecordSeconds(0);
  };

  const startCameraOrMic = async (mode: StudioModalTab) => {
    if (mode === 'notes') {
      stopMediaStream();
      return;
    }
    stopMediaStream();
    setCameraError(null);
    setCapturedAttachment(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera / Microphone capture is not supported in this browser. Use file upload below.');
      return;
    }

    try {
      const constraints: MediaStreamConstraints =
        mode === 'audio'
          ? { audio: true, video: false }
          : mode === 'video'
            ? { video: { facingMode: 'environment', width: { ideal: 640 } }, audio: true }
            : { video: { facingMode: 'environment', width: { ideal: 960 } }, audio: false };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      setIsStreamActive(true);

      if (mode !== 'audio' && videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
        void videoPreviewRef.current.play().catch(() => {});
      }

      if (autoStartCapture && (mode === 'audio' || mode === 'video')) {
        window.setTimeout(() => {
          beginRecording(stream, mode);
        }, 250);
      }
    } catch {
      setCameraError(
        'Permission was declined or hardware is unavailable. Allow camera/microphone access or upload a file directly below.'
      );
    }
  };

  useEffect(() => {
    if (!open) {
      stopMediaStream();
      noteDictationMic.stopListening();
      return;
    }
    setActiveTab(initialTab);
    void startCameraOrMic(initialTab);
    return () => {
      stopMediaStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTab]);

  const handleSwitchTab = (tab: StudioModalTab) => {
    setActiveTab(tab);
    setCapturedAttachment(null);
    void startCameraOrMic(tab);
  };

  const handleTakePhoto = () => {
    const video = videoPreviewRef.current;
    if (!video || !isStreamActive) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    setCapturedAttachment({
      kind: 'image',
      mimeType: 'image/jpeg',
      dataUrl,
      label: `Camera Photo · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
    });
    setCaptureTitle('Quick Sanctuary Camera Snapshot');
    stopMediaStream();
  };

  const beginRecording = (activeStream: MediaStream, mode: 'video' | 'audio') => {
    try {
      chunksRef.current = [];
      const preferredMime =
        mode === 'video'
          ? MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
            ? 'video/webm;codecs=vp8,opus'
            : 'video/webm'
          : MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : '';

      const rec = preferredMime
        ? new MediaRecorder(activeStream, { mimeType: preferredMime })
        : new MediaRecorder(activeStream);

      rec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      rec.onstop = () => {
        const mimeType = rec.mimeType || (mode === 'video' ? 'video/webm' : 'audio/webm');
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            setCapturedAttachment({
              kind: mode === 'video' ? 'video' : 'audio',
              mimeType: mimeType.split(';')[0],
              dataUrl: reader.result,
              label:
                mode === 'video'
                  ? `Recorded Video Clip`
                  : `Recorded Voice Audio`,
            });
            setCaptureTitle(
              mode === 'video' ? 'Sanctuary Video Evidence' : 'Sanctuary Voice Recording'
            );
          }
        };
        reader.readAsDataURL(blob);
        stopMediaStream();
      };

      recorderRef.current = rec;
      rec.start();
      setIsRecording(true);
      setRecordSeconds(0);
      timerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => {
          if (s >= 19) {
            rec.stop();
            return 20;
          }
          return s + 1;
        });
      }, 1000);
    } catch {
      setCameraError('Unable to start media recorder on this browser.');
    }
  };

  const handleFileUploadFallback = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      setCameraError('Please select a photo, video, or audio file under 12 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        const kind: ConciergeAttachment['kind'] = file.type.startsWith('video/')
          ? 'video'
          : file.type.startsWith('audio/')
            ? 'audio'
            : 'image';
        setCapturedAttachment({
          kind,
          mimeType: file.type || 'image/jpeg',
          dataUrl: reader.result,
          label: file.name,
        });
        setCaptureTitle(file.name.replace(/\.[^.]+$/, ''));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveToEvidenceLocker = () => {
    if (!capturedAttachment) return;
    const now = new Date();
    const stamp =
      now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' · ' +
      now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) +
      ' IST';

    appendPolaroidToLocker({
      id: `ev-${Date.now()}`,
      title: captureTitle.trim() || capturedAttachment.label,
      location: defaultLocationLabel,
      timestamp: stamp,
      note:
        capturedAttachment.kind === 'audio'
          ? 'Encrypted local voice recording saved to Evidence Locker.'
          : capturedAttachment.kind === 'video'
            ? 'Timestamped video clip saved to Evidence Locker.'
            : 'Timestamped camera snapshot saved to Evidence Locker.',
      imageUrl:
        capturedAttachment.kind === 'image'
          ? capturedAttachment.dataUrl
          : STITCH_ASSETS.reelHero,
      mediaKind:
        capturedAttachment.kind === 'image'
          ? 'photo'
          : capturedAttachment.kind === 'video'
            ? 'video'
            : 'audio',
      mediaDataUrl: capturedAttachment.dataUrl,
    });
    onShowToast('Saved media record to Polaroid Evidence Locker');
    onClose();
  };

  const handleSaveNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteBody.trim() && !noteTitle.trim()) return;
    const item: QuickNoteItem = {
      id: `note-${Date.now()}`,
      title: noteTitle.trim() || 'Personal Sanctuary Note',
      body: noteBody.trim(),
      updatedAt: new Date().toLocaleString([], {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }),
      languageCode: dialectCode,
    };
    setNotes((prev) => [item, ...prev]);
    setNoteTitle('');
    setNoteBody('');
    onShowToast('Saved personal note on this device');
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-[#07060C]/75 backdrop-blur-xl no-print"
        role="dialog"
        aria-modal="true"
        aria-label="Camera, Audio & Personal Notes Studio"
      >
        <motion.div
          initial={{ scale: 0.96, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0, y: 12 }}
          className="w-full max-w-2xl max-h-[92dvh] overflow-y-auto luxury-card p-5 sm:p-7 space-y-5"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-xs font-medium tracking-[0.16em] text-[#D4AF37] uppercase">
                Instant Capture &amp; Personal Journal
              </span>
              <h2 className="font-display text-2xl sm:text-[28px] font-bold text-[#0A0A0A]">
                Camera, Video, Audio &amp; My Notes
              </h2>
            </div>
            <button
              type="button"
              onClick={() => {
                stopMediaStream();
                onClose();
              }}
              className="w-10 h-10 rounded-full bg-[#FAF3EB] border border-[#F0E6DC] flex items-center justify-center text-[#0A0A0A] hover:border-[#D4AF37]"
              aria-label="Close studio"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>

          {/* 4-Tab Switcher */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-1.5 rounded-[24px] bg-[#FAF3EB]/75 border border-[#F0E6DC]">
            {(
              [
                { id: 'photo', label: 'Take Picture', icon: 'photo_camera' },
                { id: 'video', label: 'Record Video', icon: 'videocam' },
                { id: 'audio', label: 'Record Audio', icon: 'mic' },
                { id: 'notes', label: 'My Notes', icon: 'edit_note' },
              ] as { id: StudioModalTab; label: string; icon: string }[]
            ).map((t) => {
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleSwitchTab(t.id)}
                  className={`min-h-[44px] px-3 rounded-full text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                    active
                      ? 'bg-[#0A0A0A] text-[#FFFCF8] border border-[#D4AF37]/50'
                      : 'text-[#5C544E] hover:text-[#0A0A0A]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px] text-[#D4AF37]">
                    {t.icon}
                  </span>
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* ================= PHOTO / VIDEO / AUDIO CAPTURE ================= */}
          {activeTab !== 'notes' && (
            <div className="space-y-4">
              {!capturedAttachment ? (
                <div className="space-y-4">
                  {activeTab !== 'audio' ? (
                    <div className="relative aspect-[16/10] w-full rounded-[22px] overflow-hidden bg-[#0E0C14] border border-[#F0E6DC] flex items-center justify-center">
                      <video
                        ref={videoPreviewRef}
                        muted
                        playsInline
                        className="w-full h-full object-cover"
                      />
                      {!isStreamActive && !cameraError && (
                        <span className="text-xs text-[#B5AB9E]">Starting camera preview...</span>
                      )}
                      {isRecording && (
                        <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-[#9E2A3B] text-[#FFFCF8] text-xs font-semibold tabular-nums flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                          <span>REC 00:{String(recordSeconds).padStart(2, '0')} / 00:20</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-[22px] p-8 bg-[#FAF3EB]/70 border border-[#F0E6DC] text-center space-y-3">
                      <div className="w-16 h-16 rounded-full mx-auto bg-[#0A0A0A] border border-[#D4AF37] flex items-center justify-center text-[#D4AF37]">
                        <span className="material-symbols-outlined text-[28px]">
                          {isRecording ? 'graphic_eq' : 'mic'}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-[#0A0A0A]">
                        {isRecording
                          ? `Recording Audio... 00:${String(recordSeconds).padStart(2, '0')} (max 20s)`
                          : 'Ready to record ambient audio or a voice safety note'}
                      </p>
                    </div>
                  )}

                  {cameraError && (
                    <div className="luxury-card-blush p-3.5 text-xs text-[#0A0A0A]">
                      {cameraError}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    {activeTab === 'photo' && (
                      <button
                        type="button"
                        disabled={!isStreamActive}
                        onClick={handleTakePhoto}
                        className="btn-luxury px-6 text-xs sm:text-sm font-medium flex items-center gap-2 disabled:opacity-45"
                      >
                        <span className="material-symbols-outlined text-[18px] text-[#D4AF37]">
                          photo_camera
                        </span>
                        <span>Click Picture Now</span>
                      </button>
                    )}

                    {(activeTab === 'video' || activeTab === 'audio') && (
                      <>
                        {!isRecording ? (
                          <button
                            type="button"
                            disabled={!isStreamActive}
                            onClick={() => {
                              if (streamRef.current) {
                                beginRecording(streamRef.current, activeTab);
                              }
                            }}
                            className="btn-luxury px-6 text-xs sm:text-sm font-medium flex items-center gap-2 disabled:opacity-45"
                          >
                            <span className="material-symbols-outlined text-[18px] text-[#D4AF37]">
                              fiber_manual_record
                            </span>
                            <span>
                              Start {activeTab === 'video' ? 'Video' : 'Audio'} Recording
                            </span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => recorderRef.current?.stop()}
                            className="min-h-[52px] px-6 rounded-full bg-[#9E2A3B] text-[#FFFCF8] text-xs sm:text-sm font-semibold flex items-center gap-2"
                          >
                            <span className="material-symbols-outlined text-[18px]">
                              stop_circle
                            </span>
                            <span>Stop &amp; Save Clip</span>
                          </button>
                        )}
                      </>
                    )}

                    <label className="btn-luxury-outline px-5 text-xs font-medium flex items-center gap-2 cursor-pointer">
                      <span className="material-symbols-outlined text-[17px] text-[#D4AF37]">
                        upload_file
                      </span>
                      <span>Or Choose File</span>
                      <input
                        type="file"
                        accept={
                          activeTab === 'photo'
                            ? 'image/*'
                            : activeTab === 'video'
                              ? 'video/*'
                              : 'audio/*'
                        }
                        onChange={handleFileUploadFallback}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-[20px] p-4 bg-[#FAF3EB]/75 border border-[#F0E6DC] space-y-3">
                    {capturedAttachment.kind === 'image' && (
                      <img
                        src={capturedAttachment.dataUrl}
                        alt="Captured snapshot"
                        className="w-full max-h-64 object-contain rounded-[14px]"
                      />
                    )}
                    {capturedAttachment.kind === 'video' && (
                      <video
                        src={capturedAttachment.dataUrl}
                        controls
                        className="w-full max-h-64 rounded-[14px]"
                      />
                    )}
                    {capturedAttachment.kind === 'audio' && (
                      <audio src={capturedAttachment.dataUrl} controls className="w-full" />
                    )}

                    <input
                      type="text"
                      value={captureTitle}
                      onChange={(e) => setCaptureTitle(e.target.value)}
                      placeholder="Label this capture (e.g., Cab Number Plate, Street View, Voice Note)..."
                      className="w-full min-h-[46px] px-4 rounded-full bg-[#FFFCF8] border border-[#F0E6DC] text-xs sm:text-sm text-[#0A0A0A] focus:outline-none focus:border-[#D4AF37]"
                    />

                    <input
                      type="text"
                      value={aiQuestionDraft}
                      onChange={(e) => setAiQuestionDraft(e.target.value)}
                      placeholder="Optional note for AI Concierge (e.g., Check this situation / Suggest @home care)..."
                      className="w-full min-h-[46px] px-4 rounded-full bg-[#FFFCF8] border border-[#F0E6DC] text-xs sm:text-sm text-[#0A0A0A] focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={handleSaveToEvidenceLocker}
                      className="btn-luxury px-5 text-xs sm:text-sm font-medium flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined text-[18px] text-[#D4AF37]">
                        lock
                      </span>
                      <span>Save to Evidence Locker</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onSendMediaToAi(
                          capturedAttachment,
                          aiQuestionDraft.trim() ||
                            (capturedAttachment.kind === 'audio'
                              ? 'Please listen to my voice note and guide me calmly.'
                              : 'Please inspect this media and give practical safety or wellness advice.')
                        );
                        onClose();
                      }}
                      className="btn-luxury-outline px-5 text-xs sm:text-sm font-medium flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined text-[18px] text-[#D4AF37]">
                        auto_awesome
                      </span>
                      <span>Send to AI Concierge</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setCapturedAttachment(null);
                        void startCameraOrMic(activeTab);
                      }}
                      className="min-h-[46px] px-4 text-xs text-[#5C544E] hover:text-[#0A0A0A] underline"
                    >
                      Retake
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================= PERSONAL NOTES IN HER OWN WORDS ================= */}
          {activeTab === 'notes' && (
            <div className="space-y-5">
              <form onSubmit={handleSaveNote} className="space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs text-[#5C544E]">
                    Write in your own words or speak in your selected language ({bcp47})
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (noteDictationMic.status === 'listening') {
                        noteDictationMic.stopListening();
                      } else {
                        noteDictationMic.startListening();
                      }
                    }}
                    className="min-h-[38px] px-4 rounded-full bg-[#FAF3EB] border border-[#D4AF37]/50 text-xs font-medium text-[#0A0A0A] flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[16px] text-[#D4AF37]">
                      {noteDictationMic.status === 'listening' ? 'stop_circle' : 'mic'}
                    </span>
                    <span>
                      {noteDictationMic.status === 'listening'
                        ? 'Stop Voice Typing'
                        : 'Voice Type Note'}
                    </span>
                  </button>
                </div>

                <input
                  type="text"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  placeholder="Note heading (e.g., Cab details, Doctor question, Safety reminder)..."
                  className="w-full min-h-[48px] px-4 rounded-full bg-[#FAF3EB]/70 border border-[#F0E6DC] text-sm text-[#0A0A0A] focus:outline-none focus:border-[#D4AF37]"
                />
                <textarea
                  rows={3}
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  placeholder="Write your private notes in your own words..."
                  className="w-full p-4 rounded-[20px] bg-[#FAF3EB]/70 border border-[#F0E6DC] text-sm text-[#0A0A0A] focus:outline-none focus:border-[#D4AF37]"
                />
                <div className="flex justify-end">
                  <button type="submit" className="btn-luxury px-6 text-xs sm:text-sm font-medium">
                    Save Personal Note
                  </button>
                </div>
              </form>

              <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                {notes.map((n) => (
                  <div
                    key={n.id}
                    className="p-4 rounded-[18px] bg-[#FAF3EB]/65 border border-[#F0E6DC] flex items-start justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs text-[#8C6D1F]">
                        <strong className="text-sm text-[#0A0A0A] font-display">{n.title}</strong>
                        <span>· {n.updatedAt}</span>
                      </div>
                      <p className="text-xs sm:text-sm text-[#5C544E] whitespace-pre-wrap leading-relaxed">
                        {n.body}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setNotes((prev) => prev.filter((x) => x.id !== n.id))}
                      aria-label="Delete note"
                      className="text-[#5C544E] hover:text-[#9E2A3B] shrink-0"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
