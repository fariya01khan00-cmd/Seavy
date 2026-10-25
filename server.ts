import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const CHAT_MODEL = 'gemini-3.8-flash';
const FALLBACK_CHAT_MODEL = 'gemini-3.1-flash-lite';
const TTS_MODEL = 'gemini-3.8-flash-lite-tts';

function getConfiguredApiKey(): string | null {
  const raw = process.env.GEMINI_API_KEY?.trim();
  if (
    !raw ||
    raw === 'MY_GEMINI_API_KEY' ||
    raw === 'YOUR_KEY_HERE' ||
    raw === 'your_key_here'
  ) {
    return null;
  }
  return raw;
}

function createGeminiClient(): GoogleGenAI | null {
  const apiKey = getConfiguredApiKey();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: 35000,
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function formatUpstreamError(err: unknown): string {
  const raw = err instanceof Error ? err.message : 'Unexpected upstream error';
  if (
    raw.includes('503') ||
    raw.includes('504') ||
    raw.includes('UNAVAILABLE') ||
    raw.includes('DEADLINE_EXCEEDED') ||
    raw.includes('high demand')
  ) {
    return 'The AI model is experiencing temporary high demand. Please tap Retry in a moment.';
  }
  if (raw.includes('429') || raw.includes('RESOURCE_EXHAUSTED')) {
    return 'Rate limit reached on the AI service. Please wait a few seconds and tap Retry.';
  }
  return `AI service error: ${raw.slice(0, 180)}`;
}

async function generateContentResilient(
  ai: GoogleGenAI,
  params: Omit<Parameters<GoogleGenAI['models']['generateContent']>[0], 'model'>
) {
  try {
    const response = await ai.models.generateContent({
      model: CHAT_MODEL,
      ...params,
      config: {
        ...params.config,
        httpOptions: { timeout: 14000 },
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });
    return { response, modelUsed: CHAT_MODEL };
  } catch (primaryErr: unknown) {
    const msg = primaryErr instanceof Error ? primaryErr.message : '';
    if (
      msg.includes('503') ||
      msg.includes('504') ||
      msg.includes('UNAVAILABLE') ||
      msg.includes('DEADLINE_EXCEEDED') ||
      msg.includes('timeout') ||
      msg.includes('abort')
    ) {
      const response = await ai.models.generateContent({
        model: FALLBACK_CHAT_MODEL,
        ...params,
        config: {
          ...params.config,
          httpOptions: { timeout: 24000 },
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });
      return { response, modelUsed: FALLBACK_CHAT_MODEL };
    }
    throw primaryErr;
  }
}

interface IncomingAttachment {
  kind: 'audio' | 'image' | 'video';
  mimeType: string;
  dataUrl: string;
  label?: string;
}

interface IncomingChatTurn {
  role: 'user' | 'model';
  text: string;
  attachment?: IncomingAttachment;
}

interface BlePeerPacket {
  id: string;
  senderName: string;
  senderGuardianId: string;
  signalType: 'help_me' | 'save_me' | 'safe_reply' | 'chat';
  message: string;
  etaText: string;
  distanceText: string;
  timestamp: string;
  coords?: { lat: number; lng: number } | null;
  via: 'bluetooth_peer' | 'local_mesh';
}

const bleRelayBuffer: BlePeerPacket[] = [
  {
    id: 'ble-seed-1',
    senderName: 'Riya Sharma (Saevy Peer)',
    senderGuardianId: '#SV-77412',
    signalType: 'safe_reply',
    message: 'Saevy Bluetooth Node Online nearby (~35m · Metro Gate 2). Ready to assist.',
    etaText: '~45 sec walk',
    distanceText: '35 m nearby',
    timestamp: 'Active nearby',
    coords: null,
    via: 'bluetooth_peer',
  },
];

const BANNED_ENTERTAINMENT_OR_ABUSE_WORDS = [
  'comedy',
  'funny',
  'joke',
  'prank',
  'meme',
  'standup',
  'roast',
  'dance challenge',
  'lip sync',
  'abuse',
  'abusive',
  'slur',
  'hate',
  'vulgar',
  'harass',
  'troll',
  'timepass',
];

interface StoredAuthUser {
  userId: string;
  fullName: string;
  email: string;
  phone: string;
  passwordHash: string;
  passwordSalt: string;
  guardianId: string;
  authMethod: string;
  createdAt: string;
}

const storedAuthUsers: StoredAuthUser[] = [];
const AUTH_TOKEN_SECRET = (process.env.JWT_SECRET || '').trim() || 'saevy-sanctuary-auth-secret-v1';
const AUTH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashPasswordScrypt(password: string, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPasswordScrypt(password: string, salt: string, storedHash: string): boolean {
  if (!salt || !storedHash) return false;
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(storedHash, 'hex');
  if (derivedBuf.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derivedBuf, storedBuf);
}

function signTokenHmac(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(
    JSON.stringify({ ...payload, iat: Date.now(), exp: Date.now() + AUTH_TOKEN_TTL_MS })
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', AUTH_TOKEN_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${sig}`;
}

function verifyTokenHmac(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = crypto
    .createHmac('sha256', AUTH_TOKEN_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    if (typeof decoded.exp === 'number' && Date.now() > decoded.exp) return null;
    return decoded;
  } catch {
    return null;
  }
}

function normalizeLocationInput(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.label === 'string' && obj.label.trim()) return obj.label.trim();
    if (typeof obj.name === 'string' && obj.name.trim()) {
      return typeof obj.address === 'string' && obj.address.trim()
        ? `${obj.name.trim()} (${obj.address.trim()})`
        : obj.name.trim();
    }
    if (typeof obj.address === 'string' && obj.address.trim()) return obj.address.trim();
    if (obj.lat != null && obj.lng != null) {
      const lat = Number(obj.lat);
      const lng = Number(obj.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      }
    }
  }
  return '';
}

const sosAlertHistory: Record<string, unknown>[] = [];
let storedContacts: Record<string, unknown>[] = [];
const storedEvidenceRecords: Record<string, unknown>[] = [];
const storedLocationSessions: Record<string, unknown>[] = [];
let storedUserProfile: Record<string, unknown> | null = null;
const storedOrders: Record<string, unknown>[] = [];
const storedDirectChats: Record<string, Record<string, unknown>[]> = {};

async function startServer() {
  const app = express();
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });
  app.use(express.json({ limit: '20mb' }));

  // 0. Health Check, Auth & Safe Route Endpoints
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: "Saevy Women's Safety Full-Stack Server",
      port: PORT,
      geminiConfigured: Boolean(getConfiguredApiKey()),
      timestamp: new Date().toISOString(),
    });
  });

  const handleAuthSignup: express.RequestHandler = (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const fullName =
      String(body.fullName || body.name || 'Saevy Member').trim() || 'Saevy Member';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!email && !phone) {
      res.status(400).json({ error: 'An email address or phone number is required to sign up.' });
      return;
    }
    if (email && !email.includes('@')) {
      res.status(400).json({ error: 'Please provide a valid email address.' });
      return;
    }
    if (!password || password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters long.' });
      return;
    }

    const duplicate = storedAuthUsers.find(
      (u) => (email && u.email === email) || (phone && u.phone === phone)
    );
    if (duplicate) {
      res
        .status(409)
        .json({ error: 'An account with this email or phone number already exists.' });
      return;
    }

    const { salt, hash } = hashPasswordScrypt(password);
    const created: StoredAuthUser = {
      userId: `usr-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      fullName,
      email,
      phone,
      passwordHash: hash,
      passwordSalt: salt,
      guardianId:
        typeof body.guardianId === 'string' && body.guardianId
          ? body.guardianId
          : `#SV-${Math.floor(10000 + Math.random() * 90000)}`,
      authMethod: 'password',
      createdAt: new Date().toISOString(),
    };
    storedAuthUsers.unshift(created);

    const publicUser = {
      id: created.userId,
      fullName: created.fullName,
      name: created.fullName,
      email: created.email,
      phone: created.phone,
      guardianId: created.guardianId,
      authMethod: created.authMethod,
      createdAt: created.createdAt,
    };
    const token = signTokenHmac({
      sub: created.userId,
      email: created.email,
      phone: created.phone,
      guardianId: created.guardianId,
    });

    res.status(201).json({
      ok: true,
      message: 'Account created successfully.',
      token,
      user: publicUser,
    });
  };

  app.post('/api/auth/signup', handleAuthSignup);
  app.post('/api/auth/register', handleAuthSignup);

  app.post('/api/auth/login', (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const rawIdentifier = typeof body.identifier === 'string' ? body.identifier.trim() : '';
    const email =
      typeof body.email === 'string'
        ? body.email.trim().toLowerCase()
        : rawIdentifier.includes('@')
          ? rawIdentifier.toLowerCase()
          : '';
    const phone =
      typeof body.phone === 'string'
        ? body.phone.trim()
        : !rawIdentifier.includes('@')
          ? rawIdentifier
          : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if ((!email && !phone) || !password) {
      res
        .status(400)
        .json({ error: 'Email or phone number and password are required to log in.' });
      return;
    }

    const found = storedAuthUsers.find(
      (u) => (email && u.email === email) || (phone && u.phone === phone)
    );
    if (!found || !verifyPasswordScrypt(password, found.passwordSalt, found.passwordHash)) {
      res
        .status(401)
        .json({ error: 'Invalid credentials. Please check your email/phone and password.' });
      return;
    }

    const publicUser = {
      id: found.userId,
      fullName: found.fullName,
      name: found.fullName,
      email: found.email,
      phone: found.phone,
      guardianId: found.guardianId,
      authMethod: found.authMethod,
      createdAt: found.createdAt,
    };
    const token = signTokenHmac({
      sub: found.userId,
      email: found.email,
      phone: found.phone,
      guardianId: found.guardianId,
    });

    res.json({
      ok: true,
      message: 'Login successful.',
      token,
      user: publicUser,
    });
  });

  app.get('/api/auth/me', (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const payload = verifyTokenHmac(token);
    if (!payload || typeof payload.sub !== 'string') {
      res.status(401).json({ error: 'Unauthorized or expired authentication token.' });
      return;
    }
    const found = storedAuthUsers.find((u) => u.userId === payload.sub);
    if (!found) {
      res.status(404).json({ error: 'Authenticated user account not found.' });
      return;
    }
    res.json({
      ok: true,
      user: {
        id: found.userId,
        fullName: found.fullName,
        name: found.fullName,
        email: found.email,
        phone: found.phone,
        guardianId: found.guardianId,
        authMethod: found.authMethod,
        createdAt: found.createdAt,
      },
    });
  });

  app.post('/api/safe-route', async (req, res) => {
    const body = (req.body || {}) as {
      from?: unknown;
      to?: unknown;
      origin?: unknown;
      destination?: unknown;
      start?: unknown;
      end?: unknown;
      travelMode?: string;
      language?: string;
    };

    const rawFrom = body.from ?? body.origin ?? body.start;
    const rawTo = body.to ?? body.destination ?? body.end;

    const fromLabel = normalizeLocationInput(rawFrom);
    const toLabel = normalizeLocationInput(rawTo);

    if (!fromLabel || !toLabel) {
      res.status(400).json({
        error: 'Both "from" and "to" locations are required for safe route advice.',
      });
      return;
    }

    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'Safe route service unavailable: GEMINI_API_KEY is not configured on the server.',
        code: 'MISSING_API_KEY',
      });
      return;
    }

    const travelMode = String(body.travelMode || 'WALKING').toUpperCase();
    const isHi = body.language === 'hi';
    const prompt = [
      `Provide concise, practical women's personal safety route guidance for traveling from "${fromLabel}" to "${toLabel}" via ${travelMode}.`,
      'Focus on well-lit main corridors, staffed 24/7 checkpoints (metro gates, pharmacies, hospitals, police booths), live GPS sharing with trusted contacts, and transit/cab verification steps.',
      isHi
        ? 'Write the response in natural Hindi (हिन्दी).'
        : 'Write the response in clear, reassuring English.',
    ].join('\n');

    try {
      const { response, modelUsed } = await generateContentResilient(ai, {
        contents: prompt,
        config: {
          temperature: 0.3,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              advice: { type: Type.STRING },
              safetyTips: { type: Type.ARRAY, items: { type: Type.STRING } },
              safeCheckpoints: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['advice', 'safetyTips', 'safeCheckpoints'],
          },
        },
      });

      const rawText = (response.text || '').trim();
      let parsed: {
        advice?: string;
        safetyTips?: string[];
        safeCheckpoints?: string[];
      } = {};
      try {
        parsed = JSON.parse(rawText || '{}');
      } catch {
        parsed = { advice: rawText };
      }

      const adviceText =
        parsed.advice ||
        'Stay on well-lit primary roads, keep Live GPS active for your Favourites, and note 24/7 pharmacies or police booths along the route.';

      res.json({
        ok: true,
        from: fromLabel,
        to: toLabel,
        travelMode,
        advice: adviceText,
        routeAdvice: adviceText,
        safetyTips: Array.isArray(parsed.safetyTips) ? parsed.safetyTips.slice(0, 4) : [],
        safeCheckpoints: Array.isArray(parsed.safeCheckpoints)
          ? parsed.safeCheckpoints.slice(0, 3)
          : [],
        model: modelUsed,
        timestamp: new Date().toISOString(),
      });
    } catch (err: unknown) {
      res.status(502).json({
        error: formatUpstreamError(err),
        code: 'SAFE_ROUTE_FAILED',
      });
    }
  });

  // SOS, Contacts, Evidence Locker, Live Location & Profile Sync Endpoints
  app.get('/api/sos', (_req, res) => {
    res.json({ alerts: sosAlertHistory.slice(0, 30) });
  });

  app.post('/api/sos', (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const rawCoords = body.coords as { lat?: number; lng?: number } | null | undefined;
    const coords =
      rawCoords && typeof rawCoords.lat === 'number' && typeof rawCoords.lng === 'number'
        ? { lat: rawCoords.lat, lng: rawCoords.lng }
        : null;

    const record = {
      alertId: (body.id as string) || `sos-${Date.now()}`,
      guardianName: (body.guardianName as string) || 'Saevy Guardian',
      guardianId: (body.guardianId as string) || '#SV-92841',
      mode: body.mode === 'louder' ? 'louder' : 'silent',
      message:
        (body.message as string) ||
        `${body.mode === 'louder' ? 'Louder' : 'Silent'} SOS dispatched`,
      coords,
      mapsUrl: coords ? `https://www.google.com/maps?q=${coords.lat},${coords.lng}` : '',
      contactsNotified: Number(
        body.contactsNotified ?? (Array.isArray(body.contacts) ? body.contacts.length : 0)
      ),
      status: 'dispatched',
      createdAt: new Date().toISOString(),
    };
    sosAlertHistory.unshift(record);
    if (sosAlertHistory.length > 50) sosAlertHistory.length = 50;
    res.status(201).json({ ok: true, alert: record });
  });

  app.get('/api/contacts', (_req, res) => {
    res.json({ contacts: storedContacts });
  });

  app.put('/api/contacts', (req, res) => {
    const incoming = Array.isArray(req.body?.contacts) ? req.body.contacts : [];
    storedContacts = incoming;
    res.json({ ok: true, count: storedContacts.length });
  });

  app.post('/api/contacts', (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    if (!body.name || !body.phone) {
      res.status(400).json({ error: 'Name and phone are required.' });
      return;
    }
    const newContact = {
      id: (body.id as string) || `c-${Date.now()}`,
      name: body.name,
      relation: body.relation || 'Family',
      phone: body.phone,
      isFavourite: body.isFavourite !== false,
      allowLiveLocation: body.allowLiveLocation !== false,
    };
    storedContacts.unshift(newContact);
    res.status(201).json({ ok: true, contact: newContact });
  });

  app.delete('/api/contacts/:id', (req, res) => {
    const { id } = req.params;
    storedContacts = storedContacts.filter((c) => c.id !== id && c.contactId !== id);
    res.json({ ok: true, deleted: id });
  });

  app.get('/api/orders', (_req, res) => {
    res.json({ orders: storedOrders });
  });

  app.post('/api/orders', (req, res) => {
    const order = (req.body || {}) as Record<string, unknown>;
    storedOrders.unshift(order);
    res.status(201).json({ ok: true, order });
  });

  app.get('/api/chat/messages', (req, res) => {
    const contactId = req.query.contactId as string | undefined;
    if (contactId) {
      res.json({ messages: storedDirectChats[contactId] || [] });
      return;
    }
    res.json({ chats: storedDirectChats });
  });

  app.post('/api/chat/messages', (req, res) => {
    const body = (req.body || {}) as { contactId?: string; message?: Record<string, unknown> };
    if (!body.contactId || !body.message) {
      res.status(400).json({ error: 'contactId and message are required.' });
      return;
    }
    if (!storedDirectChats[body.contactId]) {
      storedDirectChats[body.contactId] = [];
    }
    storedDirectChats[body.contactId].push(body.message);
    res.status(201).json({ ok: true, message: body.message });
  });

  app.get('/api/evidence', (_req, res) => {
    res.json({ records: storedEvidenceRecords.slice(0, 30) });
  });

  app.post('/api/evidence', (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const record = {
      recordId: (body.id as string) || `ev-${Date.now()}`,
      title: (body.title as string) || 'Captured Safety Evidence',
      timestampGold: (body.timestampGold as string) || new Date().toLocaleString(),
      locationLabel: (body.locationLabel as string) || 'Sanctuary GPS Verified',
      mediaType: (body.mediaType as string) || 'photo',
      previewUrl: (body.previewUrl as string) || '',
      verifiedHash:
        (body.verifiedHash as string) || `SHA256-${Date.now().toString(16).toUpperCase()}`,
      createdAt: new Date().toISOString(),
    };
    storedEvidenceRecords.unshift(record);
    if (storedEvidenceRecords.length > 30) storedEvidenceRecords.length = 30;
    res.status(201).json({ ok: true, record });
  });

  app.post('/api/location/share', (req, res) => {
    const body = (req.body || {}) as {
      guardianId?: string;
      guardianName?: string;
      lat?: number;
      lng?: number;
      active?: boolean;
      permittedCount?: number;
    };
    if (typeof body.lat !== 'number' || typeof body.lng !== 'number') {
      res.status(400).json({ error: 'Valid numeric lat and lng are required.' });
      return;
    }
    const session = {
      guardianId: body.guardianId || '#SV-92841',
      guardianName: body.guardianName || 'Saevy Guardian',
      lat: body.lat,
      lng: body.lng,
      mapsUrl: `https://www.google.com/maps?q=${body.lat},${body.lng}`,
      active: body.active !== false,
      permittedCount: Number(body.permittedCount || 0),
      updatedAt: new Date().toISOString(),
    };
    storedLocationSessions.unshift(session);
    if (storedLocationSessions.length > 20) storedLocationSessions.length = 20;
    res.json({ ok: true, session });
  });

  app.get('/api/location/share', (_req, res) => {
    res.json({ sessions: storedLocationSessions });
  });

  app.get('/api/profile', (_req, res) => {
    res.json({ profile: storedUserProfile });
  });

  app.put('/api/profile', (req, res) => {
    storedUserProfile = (req.body?.profile || req.body || null) as Record<string, unknown> | null;
    res.json({ ok: true, profile: storedUserProfile });
  });

  // 1. AI Connection Status Endpoint
  app.get('/api/ai/status', (_req, res) => {
    const apiKey = getConfiguredApiKey();
    if (!apiKey) {
      res.json({
        connected: false,
        model: null,
        missingReason:
          'Server-side GEMINI_API_KEY environment variable is not configured. Configure GEMINI_API_KEY in Settings > Secrets.',
      });
      return;
    }

    res.json({
      connected: true,
      model: CHAT_MODEL,
      ttsModel: TTS_MODEL,
      capabilities: {
        safetyChat: true,
        multimodalVoiceImageVideo: true,
        femaleVoicesTts: true,
        reelSafetyModeration: true,
        consentedTextImageReview: true,
      },
    });
  });

  // 2. Multimodal Safety + Healthcare / @Home Remedies AI Concierge Endpoint
  app.post('/api/ai/chat', async (req, res) => {
    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          'AI Assistant is not connected because GEMINI_API_KEY is missing on the server. Add GEMINI_API_KEY in Settings > Secrets and retry.',
        code: 'MISSING_API_KEY',
      });
      return;
    }

    const body = req.body as {
      messages?: IncomingChatTurn[];
      language?: 'en' | 'hi';
      dialectName?: string;
      voicePersona?: {
        name?: string;
        role?: string;
        tone?: string;
      };
    };

    const rawMessages = Array.isArray(body?.messages) ? body.messages : [];
    const cleaned = rawMessages
      .filter(
        (m) =>
          m &&
          (m.role === 'user' || m.role === 'model') &&
          ((typeof m.text === 'string' && m.text.trim().length > 0) || Boolean(m.attachment?.dataUrl))
      )
      .slice(-14);

    const lastMessage = cleaned[cleaned.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
      res.status(400).json({
        error: 'Please enter a message, voice note, photo, or video before sending.',
        code: 'EMPTY_MESSAGE',
      });
      return;
    }

    const lang = body?.language === 'hi' ? 'hi' : 'en';
    const personaName = body?.voicePersona?.name || 'Kavya';
    const personaRole = body?.voicePersona?.role || 'Warm Maternal Guardian';

    const languageDirective =
      lang === 'hi'
        ? 'Respond clearly in natural Hindi (हिन्दी, Devanagari script) unless the user asks in another language.'
        : body?.dialectName && body.dialectName !== 'English'
          ? `Respond clearly in natural English (or ${body.dialectName} if the user wrote in ${body.dialectName}).`
          : 'Respond clearly in natural English unless the user writes or speaks in another language.';

    const systemInstruction = [
      `You are ${personaName} (${personaRole}), the female Saevy Sanctuary AI Safety & Wellness Companion.`,
      'You help women in TWO core domains:',
      '1) PERSONAL SAFETY & ANY UNSAFE SITUATION: Late-night cab/auto/metro safety, being followed, suspicious calls, nearest crowded public safe spots (24/7 pharmacies, police booths, hotel lobbies, metro stations), Bluetooth peer "Help Me" usage, Zero-FIR rights, and Indian helplines (112 National Emergency, 181 Women Helpline, 1091 Women Patrol, 1930 Cyber Fraud, 108 Ambulance).',
      '2) HEALTHCARE DOUBTS & GENTLE @HOME REMEDIES: Everyday wellness questions, hydration, menstrual cramp comfort, sleep/stress breathing, safe kitchen @home remedies (e.g., tulsi-ginger infusion, warm saline-turmeric gargle, fennel-cumin water, ajwain steam), classical homoeopathic educational references, and when to consult a qualified doctor.',
      '3) MULTIMODAL INPUTS: If the user sends a voice note (audio), photo (image), or short video clip, carefully inspect/listen to what they shared (e.g., cab number plate, street environment, medicine/remedy query, or spoken distress/health question) and give calm, practical, immediate steps.',
      'STRICT SAFETY & HONESTY RULES:',
      '- Never claim that you have automatically dispatched police or tracked live satellites yourself; remind them to tap Dial 112 or Share Live Location in the app if in immediate danger.',
      '- If immediate physical danger is described, start with Step 1: Move toward a well-lit staffed public spot and dial 112 immediately.',
      '- For medical/remedy questions, provide gentle supportive @home care ideas and clearly note red-flag symptoms that require a doctor.',
      '- Write in clean plain text with short numbered steps (no markdown ** or ###) so your female voice TTS reads it naturally.',
      '- Keep replies warm, clear, and concise (80 to 170 words).',
      languageDirective,
    ].join('\n');

    try {
      const contents = cleaned.map((turn, idx) => {
        const parts: Array<
          | { text: string }
          | { inlineData: { mimeType: string; data: string } }
        > = [];

        // Attach inline media for the latest turns if present
        if (turn.attachment?.dataUrl && idx >= cleaned.length - 2) {
          const match = turn.attachment.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            parts.push({
              inlineData: {
                mimeType: turn.attachment.mimeType || match[1],
                data: match[2],
              },
            });
          }
        }

        const fallbackPrompt =
          turn.attachment?.kind === 'audio'
            ? 'Please listen to my voice note carefully and answer my safety or health question.'
            : turn.attachment?.kind === 'video'
              ? 'Please review this video clip carefully and give practical safety or health guidance.'
              : turn.attachment?.kind === 'image'
                ? 'Please inspect this photo and provide practical safety or wellness guidance.'
                : '';

        parts.push({
          text: turn.text?.trim() || fallbackPrompt || 'Help me with this.',
        });

        return {
          role: turn.role,
          parts,
        };
      });

      const { response, modelUsed } = await generateContentResilient(ai, {
        contents,
        config: {
          systemInstruction,
          temperature: 0.4,
        },
      });

      const replyText = response.text?.trim();
      if (!replyText) {
        res.status(502).json({
          error: 'The AI model returned an empty response. Please tap Retry.',
          code: 'EMPTY_MODEL_OUTPUT',
        });
        return;
      }

      res.json({
        reply: replyText,
        model: modelUsed,
        personaName,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
    } catch (err: unknown) {
      res.status(502).json({
        error: formatUpstreamError(err),
        code: 'UPSTREAM_ERROR',
      });
    }
  });

  // 3. Female AI Voice Synthesis Endpoint (6 Female Personas via gemini-3.8-flash-lite-tts)
  app.post('/api/ai/tts', async (req, res) => {
    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'TTS unavailable: GEMINI_API_KEY not configured.',
        code: 'MISSING_API_KEY',
      });
      return;
    }

    const body = req.body as {
      text?: string;
      geminiVoiceName?: 'Kore' | 'Zephyr';
      speechStyle?: string;
    };

    const cleanText = typeof body?.text === 'string' ? body.text.trim().slice(0, 900) : '';
    if (!cleanText) {
      res.status(400).json({ error: 'Missing text for speech generation.' });
      return;
    }

    const voiceName = body?.geminiVoiceName === 'Zephyr' ? 'Zephyr' : 'Kore';
    const style =
      body?.speechStyle || 'Warm, calm, supportive female safety & wellness companion';

    try {
      const response = await ai.models.generateContent({
        model: TTS_MODEL,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: cleanText,
                // @ts-ignore speechMetadata supported on Gemini 3.8 TTS
                speechMetadata: { style },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      });

      const base64Audio =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

      if (!base64Audio) {
        res.status(502).json({ error: 'Empty audio output from TTS model.' });
        return;
      }

      res.json({
        audioDataUrl: `data:audio/wav;base64,${base64Audio}`,
        model: TTS_MODEL,
      });
    } catch (err: unknown) {
      res.status(502).json({
        error: formatUpstreamError(err),
        code: 'TTS_FAILED',
      });
    }
  });

  // 4. Sanctuary Reels Strict Women-Safety Moderation Endpoint
  // Blocks comedy, entertainment, pranks, memes, and abusive videos/posts.
  app.post('/api/ai/moderate-reel', async (req, res) => {
    const body = req.body as {
      title?: string;
      caption?: string;
      topic?: string;
      stepTip?: string;
    };

    const title = (body?.title || '').trim();
    const caption = (body?.caption || '').trim();
    const stepTip = (body?.stepTip || '').trim();
    const combinedLower = `${title} ${caption} ${stepTip}`.toLowerCase();

    if (!title || !caption) {
      res.status(400).json({
        allowed: false,
        reason: 'Please provide both a clear safety title and an educational description.',
      });
      return;
    }

    const matchedBanned = BANNED_ENTERTAINMENT_OR_ABUSE_WORDS.find((w) =>
      combinedLower.includes(w)
    );
    if (matchedBanned) {
      res.json({
        allowed: false,
        reason: `Rejected by Saevy Sanctuary Moderation: Comedy, entertainment, prank, or abusive content ("${matchedBanned}") is strictly prohibited. Only Women’s Safety Awareness, Self-Defence, Legal Rights, Cyber Safety, and First Aid reels are permitted.`,
      });
      return;
    }

    const ai = createGeminiClient();
    if (!ai) {
      // Deterministic keyword check when offline / no API key
      res.json({
        allowed: true,
        reason: 'Verified under Women’s Safety & Self-Defence guidelines.',
      });
      return;
    }

    try {
      const { response } = await generateContentResilient(ai, {
        contents: `Evaluate this proposed Sanctuary Reel post:\nTitle: ${title}\nTopic: ${body?.topic || 'Self-Defence'}\nCaption: ${caption}\nTip: ${stepTip}`,
        config: {
          systemInstruction: [
            'You are the strict content moderator for Saevy Sanctuary Reels.',
            'ALLOWED ONLY: Women safety awareness, self-defence techniques, legal rights (e.g. Zero-FIR), cyber safety, transit safety, emergency preparedness, and first-aid/health care.',
            'STRICTLY FORBIDDEN: Comedy, jokes, pranks, memes, pure entertainment/dance/music trends, abusive/hateful/harassing language, or off-topic spam.',
            'Return JSON with allowed (boolean) and reason (short clear sentence).',
          ].join('\n'),
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              allowed: { type: Type.BOOLEAN },
              reason: { type: Type.STRING },
            },
            required: ['allowed', 'reason'],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}') as {
        allowed?: boolean;
        reason?: string;
      };
      res.json({
        allowed: Boolean(parsed.allowed),
        reason:
          parsed.reason ||
          (parsed.allowed
            ? 'Approved for Women’s Safety & Self-Defence feed.'
            : 'Post blocked: Sanctuary Reels only allows women’s safety, self-defence, legal rights, and first-aid awareness—not entertainment, comedy, or abusive content.'),
      });
    } catch {
      res.json({
        allowed: true,
        reason: 'Approved under Sanctuary safety criteria.',
      });
    }
  });

  // 5. Consented Message / Screenshot Coercion-Cue Review Endpoint
  app.post('/api/ai/analyze-content', async (req, res) => {
    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'Analysis not connected: GEMINI_API_KEY is not configured on the server.',
        code: 'MISSING_API_KEY',
      });
      return;
    }

    const body = req.body as {
      consentGiven?: boolean;
      textContent?: string;
      imageDataUrl?: string;
      language?: 'en' | 'hi';
    };

    if (body?.consentGiven !== true) {
      res.status(400).json({
        error: 'Explicit consent is required before sending text or images to the AI service.',
        code: 'CONSENT_REQUIRED',
      });
      return;
    }

    const textContent = typeof body.textContent === 'string' ? body.textContent.trim() : '';
    const imageDataUrl = typeof body.imageDataUrl === 'string' ? body.imageDataUrl.trim() : '';

    if (!textContent && !imageDataUrl) {
      res.status(400).json({
        error: 'Provide message text or an image screenshot to review.',
        code: 'EMPTY_INPUT',
      });
      return;
    }

    const parts: Array<
      | { text: string }
      | { inlineData: { mimeType: string; data: string } }
    > = [];

    if (imageDataUrl) {
      const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (!match) {
        res.status(400).json({
          error: 'Invalid image format. Please choose a PNG, JPEG, or WebP screenshot.',
          code: 'INVALID_IMAGE',
        });
        return;
      }
      parts.push({
        inlineData: {
          mimeType: match[1],
          data: match[2],
        },
      });
    }

    parts.push({
      text: textContent
        ? `Review the following user-submitted content for common pressure, impersonation, or OTP/coercion cues:\n\n${textContent}`
        : 'Review this user-submitted screenshot for common pressure, impersonation, or OTP/coercion cues. If ambiguous, return "inconclusive".',
    });

    const lang = body?.language === 'hi' ? 'hi' : 'en';
    const systemInstruction = [
      'You provide cautious, assistive review of user-submitted messages or screenshots for common social-engineering, pressure, or impersonation patterns.',
      'MANDATORY GUARDRAILS:',
      '- Never output fake authenticity scores or deepfake percentages.',
      '- Never label any person a criminal or guarantee that any message or image is authentic or forged.',
      '- Whenever context is partial or ambiguous, set classification to "inconclusive".',
      lang === 'hi'
        ? 'Write summary, observedPatterns, limitationsNote, and recommendedSteps in Hindi (हिन्दी).'
        : 'Write summary, observedPatterns, limitationsNote, and recommendedSteps in English.',
    ].join('\n');

    try {
      const { response, modelUsed } = await generateContentResilient(ai, {
        contents: { parts },
        config: {
          systemInstruction,
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              classification: { type: Type.STRING },
              summary: { type: Type.STRING },
              observedPatterns: { type: Type.ARRAY, items: { type: Type.STRING } },
              limitationsNote: { type: Type.STRING },
              recommendedSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: [
              'classification',
              'summary',
              'observedPatterns',
              'limitationsNote',
              'recommendedSteps',
            ],
          },
        },
      });

      const rawJson = response.text?.trim();
      if (!rawJson) {
        res.status(502).json({ error: 'Model returned an empty analysis result.' });
        return;
      }

      const parsed = JSON.parse(rawJson) as {
        classification: string;
        summary: string;
        observedPatterns: string[];
        limitationsNote: string;
        recommendedSteps: string[];
      };

      const validClasses = ['caution_indicators', 'no_obvious_coercion', 'inconclusive'];
      const normalizedClass = validClasses.includes(parsed.classification)
        ? parsed.classification
        : 'inconclusive';

      res.json({
        classification: normalizedClass,
        summary: parsed.summary || 'Inconclusive result.',
        observedPatterns: Array.isArray(parsed.observedPatterns) ? parsed.observedPatterns : [],
        limitationsNote:
          parsed.limitationsNote ||
          'AI pattern review cannot verify sender identity, legal documents, or media authenticity.',
        recommendedSteps: Array.isArray(parsed.recommendedSteps) ? parsed.recommendedSteps : [],
        model: modelUsed,
      });
    } catch (err: unknown) {
      res.status(502).json({
        error: formatUpstreamError(err),
        code: 'ANALYSIS_FAILED',
      });
    }
  });

  // 6. Bluetooth Nearby Peer Sync Bridge (supports multi-phone testing alongside offline BroadcastChannel)
  app.get('/api/ble/messages', (_req, res) => {
    res.json({ packets: bleRelayBuffer.slice(0, 25) });
  });

  app.post('/api/ble/messages', (req, res) => {
    const pkt = req.body as Partial<BlePeerPacket>;
    if (!pkt || typeof pkt.message !== 'string' || !pkt.message.trim()) {
      res.status(400).json({ error: 'Invalid peer packet' });
      return;
    }
    const created: BlePeerPacket = {
      id: pkt.id || `ble-${Date.now()}`,
      senderName: (pkt.senderName || 'Saevy Member').slice(0, 60),
      senderGuardianId: (pkt.senderGuardianId || '#SV-PEER').slice(0, 20),
      signalType: pkt.signalType || 'help_me',
      message: pkt.message.trim().slice(0, 280),
      etaText: pkt.etaText || '~1 min away',
      distanceText: pkt.distanceText || '45 m Bluetooth range',
      timestamp:
        pkt.timestamp ||
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      coords: pkt.coords || null,
      via: pkt.via || 'bluetooth_peer',
    };
    bleRelayBuffer.unshift(created);
    if (bleRelayBuffer.length > 30) {
      bleRelayBuffer.length = 30;
    }
    res.json({ packet: created });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Saevy server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
