import { SupportedVoiceLang } from '../types';
import { getBcp47LocaleForDialect } from './speechCoordinator';

export type UiLang = 'en' | 'hi';

export function getUiLang(dialectCode: string): UiLang {
  return dialectCode === 'hi' ? 'hi' : 'en';
}

export function getVoiceLangForDialect(dialectCode: string): SupportedVoiceLang {
  return getBcp47LocaleForDialect(dialectCode);
}

export function isVoiceAndUiSupportedDialect(dialectCode: string): boolean {
  return Boolean(dialectCode);
}

export const UI_COPY = {
  en: {
    navHome: 'Sanctuary Feed',
    navHaven: 'Haven & AI Guide',
    navHealth: 'Health & Remedies',
    navAtelier: 'Safety Atelier',
    navSelf: 'Profile & Settings',
    shortHome: 'Home',
    shortHaven: 'Haven',
    shortHealth: 'Health',
    shortAtelier: 'Atelier',
    shortSelf: 'Self',
    sosDrillBtn: 'Local Alarm / SOS',
    quickExitBtn: 'Quick Exit',
    switchLangBtn: 'Language',
    searchPlaceholder: 'Search self-defence, Zero-FIR, cyber tips...',
    searchConfirmBtn: 'Search',
    searchClearBtn: 'Clear',
    voiceMicStart: 'Voice',
    voiceMicStop: 'Stop Mic',
    havenHelplinesTab: 'Emergency Helplines',
    havenAiChatTab: 'AI Safety Chat',
    havenSafetyPhraseTab: 'Safety Phrase',
    havenMediaCheckTab: 'AI Scam & Media Check',
    chatHeading: 'How can Saevy assist your safety plan?',
    chatSubheading:
      'Ask specific questions on transit safety, statutory helplines (112, 181, 1930), Zero-FIR steps, or digital coercion precautions.',
    chatInputPlaceholder: 'Type or speak a safety question (Enter to send)...',
    sendBtn: 'Send',
    readAloudBtn: 'Read aloud',
    stopReadingBtn: 'Stop',
    retryBtn: 'Retry',
  },
  hi: {
    navHome: 'सैंक्चुअरी फ़ीड',
    navHaven: 'सहायता और AI गाइड',
    navHealth: 'स्वास्थ्य व उपचार',
    navAtelier: 'सेफ़्टी एटेलियर',
    navSelf: 'प्रोफ़ाइल व सेटिंग्स',
    shortHome: 'होम',
    shortHaven: 'सहायता',
    shortHealth: 'स्वास्थ्य',
    shortAtelier: 'स्टोर',
    shortSelf: 'प्रोफ़ाइल',
    sosDrillBtn: 'लोकल अलार्म / SOS',
    quickExitBtn: 'क्विक एग्ज़िट',
    switchLangBtn: 'भाषा बदलें',
    searchPlaceholder: 'आत्मरक्षा, ज़ीरो-FIR, साइबर सुरक्षा खोजें...',
    searchConfirmBtn: 'खोजें',
    searchClearBtn: 'हटाएँ',
    voiceMicStart: 'बोलें',
    voiceMicStop: 'माइक रोकें',
    havenHelplinesTab: 'आपातकालीन हेल्पलाइन',
    havenAiChatTab: 'AI सुरक्षा चैट',
    havenSafetyPhraseTab: 'सेफ़्टी फ़्रेज़',
    havenMediaCheckTab: 'AI संदेश जाँच',
    chatHeading: 'आज आपकी सुरक्षा तैयारी में हम कैसे मदद करें?',
    chatSubheading:
      'यात्रा सुरक्षा, सरकारी हेल्पलाइन (112, 181, 1930), ज़ीरो-FIR प्रक्रिया या साइबर सुरक्षा पर प्रश्न पूछें।',
    chatInputPlaceholder: 'सुरक्षा प्रश्न टाइप करें या माइक से बोलें...',
    sendBtn: 'भेजें',
    readAloudBtn: 'सुनें (Read aloud)',
    stopReadingBtn: 'रोकें (Stop)',
    retryBtn: 'पुनः प्रयास करें',
  },
} as const;
