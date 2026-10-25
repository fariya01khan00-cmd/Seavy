import { useCallback, useEffect, useRef, useState } from 'react';
import { SupportedVoiceLang } from '../types';

export interface BrowserSpeechRecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      length: number;
      [altIndex: number]: {
        transcript: string;
        confidence: number;
      };
    };
  };
}

export interface BrowserSpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

export interface BrowserSpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onaudioend?: (() => void) | null;
  onspeechend?: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognitionInstance;

export function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionConstructor() !== null;
}

export function isSpeechSynthesisSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance !== 'undefined'
  );
}

export function isRunningInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/**
 * Maps all 52 Sanctuary dialects to standard BCP-47 speech recognition locales
 * so voice typing works in any Indian or international language the user chooses.
 */
const DIALECT_TO_BCP47: Record<string, string> = {
  as: 'as-IN',
  bn: 'bn-IN',
  brx: 'hi-IN',
  doi: 'hi-IN',
  en: 'en-IN',
  gu: 'gu-IN',
  hi: 'hi-IN',
  hinglish: 'en-IN',
  kn: 'kn-IN',
  ks: 'ur-IN',
  kok: 'mr-IN',
  mai: 'hi-IN',
  ml: 'ml-IN',
  mni: 'bn-IN',
  mr: 'mr-IN',
  ne: 'ne-NP',
  or: 'or-IN',
  pa: 'pa-IN',
  sa: 'hi-IN',
  sat: 'hi-IN',
  sd: 'ur-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  ur: 'ur-IN',
  bho: 'hi-IN',
  hne: 'hi-IN',
  bgc: 'hi-IN',
  mwr: 'hi-IN',
  raj: 'hi-IN',
  ar: 'ar-SA',
  'zh-CN': 'zh-CN',
  'zh-TW': 'zh-TW',
  nl: 'nl-NL',
  fr: 'fr-FR',
  de: 'de-DE',
  el: 'el-GR',
  he: 'he-IL',
  id: 'id-ID',
  it: 'it-IT',
  ja: 'ja-JP',
  ko: 'ko-KR',
  ms: 'ms-MY',
  fa: 'fa-IR',
  pl: 'pl-PL',
  pt: 'pt-BR',
  ru: 'ru-RU',
  es: 'es-ES',
  sw: 'sw-KE',
  th: 'th-TH',
  tr: 'tr-TR',
  uk: 'uk-UA',
  vi: 'vi-VN',
};

export function getBcp47LocaleForDialect(dialectCode: string): string {
  if (!dialectCode) return 'en-IN';
  if (dialectCode.includes('-')) return dialectCode;
  return DIALECT_TO_BCP47[dialectCode] || 'en-IN';
}

export const SUPPORTED_VOICE_LANGUAGES: {
  code: string;
  label: string;
  nativeLabel: string;
}[] = [
  { code: 'en-IN', label: 'English (India — en-IN)', nativeLabel: 'English' },
  { code: 'hi-IN', label: 'Hindi (हिन्दी — hi-IN)', nativeLabel: 'हिन्दी' },
  { code: 'bn-IN', label: 'Bengali (বাংলা — bn-IN)', nativeLabel: 'বাংলা' },
  { code: 'ta-IN', label: 'Tamil (தமிழ் — ta-IN)', nativeLabel: 'தமிழ்' },
  { code: 'te-IN', label: 'Telugu (తెలుగు — te-IN)', nativeLabel: 'తెలుగు' },
  { code: 'mr-IN', label: 'Marathi (मराठी — mr-IN)', nativeLabel: 'मराठी' },
  { code: 'gu-IN', label: 'Gujarati (ગુજરાતી — gu-IN)', nativeLabel: 'ગુજરાતી' },
  { code: 'kn-IN', label: 'Kannada (ಕನ್ನಡ — kn-IN)', nativeLabel: 'ಕನ್ನಡ' },
  { code: 'ml-IN', label: 'Malayalam (മലയാളം — ml-IN)', nativeLabel: 'മലയാളം' },
  { code: 'pa-IN', label: 'Punjabi (ਪੰਜਾਬੀ — pa-IN)', nativeLabel: 'ਪੰਜਾਬੀ' },
];

let activeRecognitionStopper: (() => void) | null = null;
let globalPermissionDenied = false;

export function registerActiveRecognition(stopFn: () => void): void {
  if (isSpeechSynthesisSupported()) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore
    }
  }
  if (activeRecognitionStopper && activeRecognitionStopper !== stopFn) {
    try {
      activeRecognitionStopper();
    } catch {
      // Ignore
    }
  }
  activeRecognitionStopper = stopFn;
}

export function clearActiveRecognition(stopFn: () => void): void {
  if (activeRecognitionStopper === stopFn) {
    activeRecognitionStopper = null;
  }
}

export function stopAnyActiveRecognition(): void {
  if (activeRecognitionStopper) {
    const fn = activeRecognitionStopper;
    activeRecognitionStopper = null;
    try {
      fn();
    } catch {
      // Ignore
    }
  }
}

export function stopAllSpeechSynthesis(): void {
  if (isSpeechSynthesisSupported()) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore
    }
  }
}

export function normalizePhraseForMatch(raw: string): string {
  return raw
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

/**
 * Supports both exact normalized phrase match and whisper / far-field phonetic tolerance
 * so softly whispered or slightly distant safety code words reliably activate.
 */
export function containsWhisperOrFuzzyPhrase(
  transcript: string,
  targetPhrase: string,
  whisperTolerance = true
): boolean {
  const normTranscript = normalizePhraseForMatch(transcript);
  const normTarget = normalizePhraseForMatch(targetPhrase);
  if (!normTranscript || !normTarget || normTarget.length < 2) return false;

  if (normTranscript.includes(normTarget)) return true;
  if (!whisperTolerance) return false;

  const targetWords = normTarget.split(' ').filter(Boolean);
  const transcriptWords = normTranscript.split(' ').filter(Boolean);
  if (targetWords.length === 0 || transcriptWords.length === 0) return false;

  const windowLen = targetWords.length;
  const maxAllowedDistance = Math.max(1, Math.floor(normTarget.length * 0.24));

  for (let i = 0; i <= transcriptWords.length - windowLen; i++) {
    const candidate = transcriptWords.slice(i, i + windowLen).join(' ');
    if (editDistance(candidate, normTarget) <= maxAllowedDistance) {
      return true;
    }
  }

  if (transcriptWords.length < windowLen && normTranscript.length >= 4) {
    if (editDistance(normTranscript, normTarget) <= maxAllowedDistance) {
      return true;
    }
  }

  return false;
}

export function describeSpeechError(
  errorCode: string,
  lang: 'en' | 'hi' = 'en'
): {
  status: 'permission-denied' | 'stopped' | 'error';
  message: string;
} {
  const inFrame = isRunningInIframe();
  if (errorCode === 'not-allowed' || errorCode === 'service-not-allowed') {
    globalPermissionDenied = true;
    return {
      status: 'permission-denied',
      message:
        lang === 'hi'
          ? `माइक्रोफ़ोन अनुमति अस्वीकृत है। ब्राउज़र में माइक अनुमति दें${
              inFrame ? ' या ऐप को नए टैब में खोलें।' : '।'
            }`
          : `Microphone permission denied. Allow microphone access in browser settings${
              inFrame ? ' or open in a standalone tab if restricted.' : '.'
            }`,
    };
  }

  if (errorCode === 'audio-capture') {
    return {
      status: 'error',
      message:
        lang === 'hi'
          ? 'कोई कार्यशील माइक्रोफ़ोन नहीं मिला।'
          : 'No working microphone was found, or another app is using it.',
    };
  }

  if (errorCode === 'no-speech') {
    return {
      status: 'stopped',
      message:
        lang === 'hi'
          ? 'कोई आवाज़ नहीं सुनी गई। बोलने के लिए माइक दबाएँ।'
          : 'No speech detected. Tap the microphone when ready to speak.',
    };
  }

  if (errorCode === 'network') {
    return {
      status: 'error',
      message:
        lang === 'hi'
          ? 'नेटवर्क त्रुटि: वॉइस टाइपिंग के लिए इंटरनेट कनेक्शन आवश्यक है।'
          : 'Browser speech recognition requires an active connection.',
    };
  }

  if (errorCode === 'aborted') {
    return { status: 'stopped', message: '' };
  }

  return {
    status: 'error',
    message:
      lang === 'hi'
        ? `वॉइस पहचान समस्या (${errorCode})।`
        : `Speech recognition encountered an issue (${errorCode}).`,
  };
}

export type SingleShotMicStatus =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'stopped'
  | 'permission-denied'
  | 'unsupported'
  | 'error';

interface UseSingleShotSpeechOptions {
  recognitionLang: SupportedVoiceLang;
  uiLang: 'en' | 'hi';
  onTranscript: (transcript: string, isFinal: boolean) => void;
}

export function useSingleShotSpeechInput({
  recognitionLang,
  uiLang,
  onTranscript,
}: UseSingleShotSpeechOptions) {
  const supported = isSpeechRecognitionSupported();
  const [status, setStatus] = useState<SingleShotMicStatus>(() =>
    supported ? 'idle' : 'unsupported'
  );
  const [errorMessage, setErrorMessage] = useState<string>('');
  const recognitionRef = useRef<BrowserSpeechRecognitionInstance | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const stopListening = useCallback(() => {
    const rec = recognitionRef.current;
    recognitionRef.current = null;
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
    setStatus((prev) =>
      prev === 'listening' || prev === 'processing' ? 'stopped' : prev
    );
  }, []);

  useEffect(() => {
    return () => {
      clearActiveRecognition(stopListening);
      const rec = recognitionRef.current;
      recognitionRef.current = null;
      if (rec) {
        try {
          rec.abort();
        } catch {
          // Ignore
        }
      }
    };
  }, [stopListening]);

  const startListening = useCallback(() => {
    const Ctor = getSpeechRecognitionConstructor();
    if (!Ctor) {
      setStatus('unsupported');
      setErrorMessage(
        uiLang === 'hi'
          ? 'इस ब्राउज़र पर वॉइस टाइपिंग उपलब्ध नहीं है।'
          : 'Speech recognition is not supported in this browser.'
      );
      return;
    }

    if (globalPermissionDenied && status === 'permission-denied') {
      const info = describeSpeechError('not-allowed', uiLang);
      setErrorMessage(info.message);
      return;
    }

    registerActiveRecognition(stopListening);
    setErrorMessage('');

    try {
      const rec = new Ctor();
      rec.lang = getBcp47LocaleForDialect(recognitionLang);
      rec.continuous = false;
      rec.interimResults = true;
      rec.maxAlternatives = 3;

      let hadError = false;

      rec.onstart = () => {
        globalPermissionDenied = false;
        setStatus('listening');
      };

      rec.onspeechend = () => {
        setStatus((curr) => (curr === 'listening' ? 'processing' : curr));
      };

      rec.onresult = (event: BrowserSpeechRecognitionEvent) => {
        let combined = '';
        let anyFinal = false;
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          if (res && res[0]) {
            combined += res[0].transcript;
            if (res.isFinal) anyFinal = true;
          }
        }
        const cleaned = combined.trim();
        if (cleaned) {
          setStatus(anyFinal ? 'processing' : 'listening');
          onTranscriptRef.current(cleaned, anyFinal);
        }
      };

      rec.onerror = (ev: BrowserSpeechRecognitionErrorEvent) => {
        hadError = true;
        const mapped = describeSpeechError(ev.error, uiLang);
        setStatus(mapped.status);
        if (mapped.message) {
          setErrorMessage(mapped.message);
        }
        clearActiveRecognition(stopListening);
        recognitionRef.current = null;
      };

      rec.onend = () => {
        clearActiveRecognition(stopListening);
        recognitionRef.current = null;
        if (!hadError) {
          setStatus('stopped');
        }
      };

      recognitionRef.current = rec;
      rec.start();
    } catch {
      clearActiveRecognition(stopListening);
      setStatus('error');
      setErrorMessage('Could not start microphone session.');
    }
  }, [recognitionLang, status, stopListening, uiLang]);

  const resetPermissionDenialForRetry = useCallback(() => {
    globalPermissionDenied = false;
    setStatus(supported ? 'idle' : 'unsupported');
    setErrorMessage('');
  }, [supported]);

  return {
    supported,
    status,
    errorMessage,
    startListening,
    stopListening,
    resetPermissionDenialForRetry,
  };
}

export function useSpeechSynthesisVoices() {
  const supported = isSpeechSynthesisSupported();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (!supported) return;
    const loadVoices = () => {
      try {
        const list = window.speechSynthesis.getVoices();
        if (list && list.length > 0) {
          setVoices(list);
        }
      } catch {
        // Ignore
      }
    };

    loadVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', loadVoices);
    };
  }, [supported]);

  const findMatchingVoice = useCallback(
    (targetLang: SupportedVoiceLang, preferFemale = true): SpeechSynthesisVoice | null => {
      if (voices.length === 0) return null;
      const normalizedTarget = getBcp47LocaleForDialect(targetLang).toLowerCase();
      const langPrefix = normalizedTarget.split('-')[0];

      const femaleRegex = /female|woman|veena|lekha|heera|kalpana|samantha|victoria|zira|aria|jenny|karen|moira|tessa|google हिन्दी|google uk english female/i;

      const localeMatches = voices.filter(
        (v) => v.lang.toLowerCase().replace('_', '-') === normalizedTarget
      );
      if (preferFemale) {
        const femExact = localeMatches.find((v) => femaleRegex.test(v.name));
        if (femExact) return femExact;
      }
      if (localeMatches.length > 0) return localeMatches[0];

      const prefixMatches = voices.filter((v) =>
        v.lang.toLowerCase().startsWith(langPrefix)
      );
      if (preferFemale) {
        const femPrefix = prefixMatches.find((v) => femaleRegex.test(v.name));
        if (femPrefix) return femPrefix;
      }
      if (prefixMatches.length > 0) return prefixMatches[0];

      return null;
    },
    [voices]
  );

  return {
    supported,
    voices,
    findMatchingVoice,
  };
}
