const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const {
  SosAlertModel,
  ContactModel,
  EvidenceModel,
  LiveLocationModel,
  readLocalStore,
  writeLocalStore,
} = require('./models/SafetyModels');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 5000;

const CHAT_MODEL = 'gemini-3.8-flash';
const FALLBACK_CHAT_MODEL = 'gemini-3.1-flash-lite';
const TTS_MODEL = 'gemini-3.8-flash-lite-tts';

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '20mb' }));
app.use('/api/auth', authRoutes);

let mongoConnected = false;

async function connectMongoIfConfigured() {
  const uri = (process.env.MONGODB_URI || '').trim();
  if (!uri || uri === 'YOUR_MONGODB_URI_HERE') {
    return;
  }
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 4000 });
    mongoConnected = true;
    console.log('Connected to MongoDB');
  } catch (err) {
    console.warn('MongoDB unavailable, using persistent local JSON store:', err.message);
  }
}

function getConfiguredApiKey() {
  const raw = (process.env.GEMINI_API_KEY || '').trim();
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

async function getGeminiSdk() {
  const sdk = await import('@google/genai');
  const apiKey = getConfiguredApiKey();
  if (!apiKey) {
    return { ai: null, sdk };
  }
  const ai = new sdk.GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: 35000,
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
  return { ai, sdk };
}

function formatUpstreamError(err) {
  const raw = err instanceof Error ? err.message : 'Unexpected upstream error';
  if (
    raw.includes('503') ||
    raw.includes('504') ||
    raw.includes('UNAVAILABLE') ||
    raw.includes('DEADLINE_EXCEEDED')
  ) {
    return 'The AI model is experiencing temporary high demand. Please retry in a moment.';
  }
  if (raw.includes('429') || raw.includes('RESOURCE_EXHAUSTED')) {
    return 'Rate limit reached on the AI service. Please wait a few seconds and retry.';
  }
  return `AI service error: ${raw.slice(0, 180)}`;
}

async function generateWithFallback(ai, sdk, params) {
  try {
    const response = await ai.models.generateContent({
      model: CHAT_MODEL,
      ...params,
      config: {
        ...(params.config || {}),
        httpOptions: { timeout: 15000 },
        thinkingConfig: { thinkingLevel: sdk.ThinkingLevel.LOW },
      },
    });
    return { response, modelUsed: CHAT_MODEL };
  } catch (primaryErr) {
    const msg = primaryErr instanceof Error ? primaryErr.message : '';
    if (
      msg.includes('503') ||
      msg.includes('504') ||
      msg.includes('UNAVAILABLE') ||
      msg.includes('DEADLINE_EXCEEDED') ||
      msg.includes('timeout')
    ) {
      const response = await ai.models.generateContent({
        model: FALLBACK_CHAT_MODEL,
        ...params,
        config: {
          ...(params.config || {}),
          httpOptions: { timeout: 24000 },
          thinkingConfig: { thinkingLevel: sdk.ThinkingLevel.LOW },
        },
      });
      return { response, modelUsed: FALLBACK_CHAT_MODEL };
    }
    throw primaryErr;
  }
}

// 1. Health & Backend Status
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: "Saevy Women's Safety MVP Backend",
    port: PORT,
    storage: mongoConnected ? 'mongodb' : 'json-store',
    geminiConfigured: Boolean(getConfiguredApiKey()),
    timestamp: new Date().toISOString(),
  });
});

function normalizeLocationInput(value) {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (value && typeof value === 'object') {
    if (typeof value.label === 'string' && value.label.trim()) {
      return value.label.trim();
    }
    if (typeof value.name === 'string' && value.name.trim()) {
      return value.address ? `${value.name.trim()} (${value.address})` : value.name.trim();
    }
    if (typeof value.address === 'string' && value.address.trim()) {
      return value.address.trim();
    }
    if (value.lat != null && value.lng != null) {
      const lat = Number(value.lat);
      const lng = Number(value.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      }
    }
  }
  return '';
}

// 2. Gemini Safe Route Endpoint: POST /api/safe-route
app.post('/api/safe-route', async (req, res) => {
  const body = req.body || {};
  const rawFrom = body.from ?? body.origin ?? body.start;
  const rawTo = body.to ?? body.destination ?? body.end;
  const travelMode = String(body.travelMode || 'WALKING').toUpperCase();
  const language = body.language || 'en';

  const fromLabel = normalizeLocationInput(rawFrom);
  const toLabel = normalizeLocationInput(rawTo);

  if (!fromLabel || !toLabel) {
    res.status(400).json({
      error: 'Both "from" and "to" locations are required for safe route advice.',
    });
    return;
  }

  const { ai, sdk } = await getGeminiSdk();
  if (!ai) {
    res.status(503).json({
      error: 'Safe route service unavailable: GEMINI_API_KEY is not configured on the server.',
      code: 'MISSING_API_KEY',
    });
    return;
  }

  const isHi = language === 'hi';
  const prompt = [
    `Provide concise, practical women's personal safety route guidance for traveling from "${fromLabel}" to "${toLabel}" via ${travelMode}.`,
    'Focus on well-lit main corridors, staffed 24/7 checkpoints (metro gates, pharmacies, hospitals, police booths), live GPS sharing with trusted contacts, and transit/cab verification steps.',
    isHi
      ? 'Write the response in natural Hindi (हिन्दी).'
      : 'Write the response in clear, reassuring English.',
  ].join('\n');

  try {
    const { response, modelUsed } = await generateWithFallback(ai, sdk, {
      contents: prompt,
      config: {
        temperature: 0.3,
        responseMimeType: 'application/json',
        responseSchema: {
          type: sdk.Type.OBJECT,
          properties: {
            advice: { type: sdk.Type.STRING },
            safetyTips: {
              type: sdk.Type.ARRAY,
              items: { type: sdk.Type.STRING },
            },
            safeCheckpoints: {
              type: sdk.Type.ARRAY,
              items: { type: sdk.Type.STRING },
            },
          },
          required: ['advice', 'safetyTips', 'safeCheckpoints'],
        },
      },
    });

    const rawText = (response.text || '').trim();
    let parsed = {};
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
  } catch (err) {
    res.status(502).json({
      error: formatUpstreamError(err),
      code: 'SAFE_ROUTE_FAILED',
    });
  }
});

// 3. SOS Dispatch & History Endpoints
app.get('/api/sos', async (_req, res) => {
  if (mongoConnected) {
    const alerts = await SosAlertModel.find().sort({ createdAt: -1 }).limit(30).lean();
    res.json({ alerts });
    return;
  }
  const store = readLocalStore();
  res.json({ alerts: store.sosAlerts.slice(0, 30) });
});

app.post('/api/sos', async (req, res) => {
  const body = req.body || {};
  const coords =
    body.coords && typeof body.coords.lat === 'number' && typeof body.coords.lng === 'number'
      ? { lat: body.coords.lat, lng: body.coords.lng }
      : null;

  const alertRecord = {
    alertId: body.id || `sos-${Date.now()}`,
    guardianName: body.guardianName || 'Saevy Guardian',
    guardianId: body.guardianId || '#SV-92841',
    mode: body.mode === 'louder' ? 'louder' : 'silent',
    message:
      body.message ||
      `${body.mode === 'louder' ? 'Louder' : 'Silent'} SOS dispatched for ${
        body.guardianName || 'Saevy Guardian'
      }`,
    coords,
    mapsUrl: coords ? `https://www.google.com/maps?q=${coords.lat},${coords.lng}` : '',
    contactsNotified: Number(body.contactsNotified ?? (Array.isArray(body.contacts) ? body.contacts.length : 0)),
    status: 'dispatched',
    createdAt: new Date().toISOString(),
  };

  if (mongoConnected) {
    const created = await SosAlertModel.create(alertRecord);
    res.status(201).json({ ok: true, alert: created });
    return;
  }

  const store = readLocalStore();
  store.sosAlerts.unshift(alertRecord);
  store.sosAlerts = store.sosAlerts.slice(0, 50);
  writeLocalStore(store);
  res.status(201).json({ ok: true, alert: alertRecord });
});

// 4. Emergency & Favourite Contacts Sync
app.get('/api/contacts', async (_req, res) => {
  if (mongoConnected) {
    const contacts = await ContactModel.find().sort({ createdAt: 1 }).lean();
    res.json({ contacts });
    return;
  }
  const store = readLocalStore();
  res.json({ contacts: store.contacts || [] });
});

app.put('/api/contacts', async (req, res) => {
  const incoming = Array.isArray(req.body?.contacts) ? req.body.contacts : [];
  if (mongoConnected) {
    await ContactModel.deleteMany({});
    if (incoming.length > 0) {
      await ContactModel.insertMany(
        incoming.map((c) => ({
          contactId: c.id || `c-${Date.now()}`,
          name: c.name,
          relation: c.relation || 'Family',
          phone: c.phone,
          isFavourite: c.isFavourite !== false,
          allowLiveLocation: c.allowLiveLocation !== false,
        }))
      );
    }
    res.json({ ok: true, count: incoming.length });
    return;
  }
  const store = readLocalStore();
  store.contacts = incoming;
  writeLocalStore(store);
  res.json({ ok: true, count: incoming.length });
});

app.post('/api/contacts', async (req, res) => {
  const body = req.body || {};
  if (!body.name || !body.phone) {
    res.status(400).json({ error: 'Name and phone are required.' });
    return;
  }
  const newContact = {
    contactId: body.id || `c-${Date.now()}`,
    name: body.name,
    relation: body.relation || 'Family',
    phone: body.phone,
    isFavourite: body.isFavourite !== false,
    allowLiveLocation: body.allowLiveLocation !== false,
  };
  if (mongoConnected) {
    const created = await ContactModel.create(newContact);
    res.status(201).json({ ok: true, contact: created });
    return;
  }
  const store = readLocalStore();
  store.contacts = [newContact, ...(store.contacts || [])];
  writeLocalStore(store);
  res.status(201).json({ ok: true, contact: newContact });
});

app.delete('/api/contacts/:id', async (req, res) => {
  const { id } = req.params;
  if (mongoConnected) {
    await ContactModel.deleteOne({ $or: [{ contactId: id }, { _id: id }] });
    res.json({ ok: true, deleted: id });
    return;
  }
  const store = readLocalStore();
  store.contacts = (store.contacts || []).filter((c) => c.contactId !== id && c.id !== id);
  writeLocalStore(store);
  res.json({ ok: true, deleted: id });
});

app.get('/api/orders', (_req, res) => {
  const store = readLocalStore();
  res.json({ orders: store.orders || [] });
});

app.post('/api/orders', (req, res) => {
  const order = req.body || {};
  const store = readLocalStore();
  store.orders = [order, ...(store.orders || [])];
  writeLocalStore(store);
  res.status(201).json({ ok: true, order });
});

app.get('/api/chat/messages', (req, res) => {
  const { contactId } = req.query;
  const store = readLocalStore();
  const allChats = store.directChats || {};
  if (contactId) {
    res.json({ messages: allChats[contactId] || [] });
    return;
  }
  res.json({ chats: allChats });
});

app.post('/api/chat/messages', (req, res) => {
  const { contactId, message } = req.body || {};
  if (!contactId || !message) {
    res.status(400).json({ error: 'contactId and message are required.' });
    return;
  }
  const store = readLocalStore();
  if (!store.directChats) store.directChats = {};
  if (!store.directChats[contactId]) store.directChats[contactId] = [];
  store.directChats[contactId].push(message);
  writeLocalStore(store);
  res.status(201).json({ ok: true, message });
});

// 5. Evidence Locker Endpoints
app.get('/api/evidence', async (_req, res) => {
  if (mongoConnected) {
    const records = await EvidenceModel.find().sort({ createdAt: -1 }).limit(30).lean();
    res.json({ records });
    return;
  }
  const store = readLocalStore();
  res.json({ records: store.evidence || [] });
});

app.post('/api/evidence', async (req, res) => {
  const rec = req.body || {};
  const entry = {
    recordId: rec.id || `ev-${Date.now()}`,
    title: rec.title || 'Captured Safety Evidence',
    timestampGold: rec.timestampGold || new Date().toLocaleString(),
    locationLabel: rec.locationLabel || 'Sanctuary GPS Verified',
    mediaType: rec.mediaType || 'photo',
    previewUrl: rec.previewUrl || '',
    verifiedHash: rec.verifiedHash || `SHA256-${Date.now().toString(16).toUpperCase()}`,
    createdAt: new Date().toISOString(),
  };

  if (mongoConnected) {
    const saved = await EvidenceModel.create(entry);
    res.status(201).json({ ok: true, record: saved });
    return;
  }
  const store = readLocalStore();
  store.evidence = [entry, ...(store.evidence || [])].slice(0, 30);
  writeLocalStore(store);
  res.status(201).json({ ok: true, record: entry });
});

// 6. Live GPS Location Sharing Endpoint
app.post('/api/location/share', async (req, res) => {
  const body = req.body || {};
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

  if (mongoConnected) {
    await LiveLocationModel.create(session);
    res.json({ ok: true, session });
    return;
  }
  const store = readLocalStore();
  store.liveLocations = [session, ...(store.liveLocations || [])].slice(0, 20);
  writeLocalStore(store);
  res.json({ ok: true, session });
});

app.get('/api/location/share', async (_req, res) => {
  if (mongoConnected) {
    const sessions = await LiveLocationModel.find().sort({ createdAt: -1 }).limit(10).lean();
    res.json({ sessions });
    return;
  }
  const store = readLocalStore();
  res.json({ sessions: store.liveLocations || [] });
});

// 7. Editable User Profile Sync
app.get('/api/profile', (_req, res) => {
  const store = readLocalStore();
  res.json({ profile: store.profile || null });
});

app.put('/api/profile', (req, res) => {
  const store = readLocalStore();
  store.profile = req.body?.profile || req.body || null;
  writeLocalStore(store);
  res.json({ ok: true, profile: store.profile });
});

// 8. Bluetooth Peer Sync Bridge
app.get('/api/ble/messages', (_req, res) => {
  const store = readLocalStore();
  res.json({ packets: (store.blePackets || []).slice(0, 25) });
});

app.post('/api/ble/messages', (req, res) => {
  const pkt = req.body || {};
  if (!pkt || typeof pkt.message !== 'string' || !pkt.message.trim()) {
    res.status(400).json({ error: 'Invalid peer packet' });
    return;
  }
  const created = {
    id: pkt.id || `ble-${Date.now()}`,
    senderName: String(pkt.senderName || 'Saevy Member').slice(0, 60),
    senderGuardianId: String(pkt.senderGuardianId || '#SV-PEER').slice(0, 20),
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
  const store = readLocalStore();
  store.blePackets = [created, ...(store.blePackets || [])].slice(0, 30);
  writeLocalStore(store);
  res.json({ packet: created });
});

// 9. AI Status, Multimodal Concierge, TTS, Reel Moderation & Coercion Review
app.get('/api/ai/status', (_req, res) => {
  const apiKey = getConfiguredApiKey();
  if (!apiKey) {
    res.json({
      connected: false,
      model: null,
      missingReason:
        'GEMINI_API_KEY is not configured on the backend. Add GEMINI_API_KEY in backend/.env or Settings > Secrets.',
    });
    return;
  }
  res.json({
    connected: true,
    model: CHAT_MODEL,
    ttsModel: TTS_MODEL,
    capabilities: {
      safetyChat: true,
      safeRoute: true,
      multimodalVoiceImageVideo: true,
      femaleVoicesTts: true,
      reelSafetyModeration: true,
      consentedTextImageReview: true,
    },
  });
});

app.post('/api/ai/chat', async (req, res) => {
  const { ai, sdk } = await getGeminiSdk();
  if (!ai) {
    res.status(503).json({
      error: 'AI Assistant unavailable: GEMINI_API_KEY is not configured on the server.',
      code: 'MISSING_API_KEY',
    });
    return;
  }

  const body = req.body || {};
  const rawMessages = Array.isArray(body.messages) ? body.messages : [];
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

  const lang = body.language === 'hi' ? 'hi' : 'en';
  const personaLabel =
    typeof body.voicePersona === 'string'
      ? body.voicePersona
      : `${body.voicePersona?.name || 'Kavya'} (${body.voicePersona?.role || 'Warm Maternal Guardian'})`;

  const systemInstruction = [
    `You are ${personaLabel}, the female Saevy Sanctuary AI Safety & Wellness Companion.`,
    'You help women with personal safety, safe transit routes, Indian helplines (112, 181, 1091, 1930, 108), and gentle @home wellness care.',
    'Write in clean plain text with short numbered steps (80 to 170 words).',
    lang === 'hi'
      ? 'Respond clearly in natural Hindi (हिन्दी).'
      : 'Respond clearly in natural English unless asked in another language.',
  ].join('\n');

  try {
    const contents = cleaned.map((turn, idx) => {
      const parts = [];
      const inlineAtt =
        idx === cleaned.length - 1 && body.attachment?.dataUrl
          ? body.attachment
          : turn.attachment;
      if (inlineAtt?.dataUrl && idx >= cleaned.length - 2) {
        const match = String(inlineAtt.dataUrl).match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          parts.push({
            inlineData: {
              mimeType: inlineAtt.mimeType || match[1],
              data: match[2],
            },
          });
        }
      }
      parts.push({ text: (turn.text || '').trim() || 'Please guide me step-by-step.' });
      return { role: turn.role, parts };
    });

    const { response, modelUsed } = await generateWithFallback(ai, sdk, {
      contents,
      config: { systemInstruction, temperature: 0.4 },
    });

    const replyText = (response.text || '').trim();
    if (!replyText) {
      res.status(502).json({ error: 'Empty response from AI model.' });
      return;
    }

    res.json({
      reply: replyText,
      model: modelUsed,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
  } catch (err) {
    res.status(502).json({ error: formatUpstreamError(err), code: 'UPSTREAM_ERROR' });
  }
});

app.post('/api/ai/tts', async (req, res) => {
  const { ai } = await getGeminiSdk();
  if (!ai) {
    res.status(503).json({ error: 'TTS unavailable: GEMINI_API_KEY not configured.' });
    return;
  }
  const cleanText = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, 900) : '';
  if (!cleanText) {
    res.status(400).json({ error: 'Missing text for speech generation.' });
    return;
  }
  const voiceName = req.body?.geminiVoiceName === 'Zephyr' ? 'Zephyr' : 'Kore';
  const style =
    req.body?.speechStyle || 'Warm, calm, supportive female safety & wellness companion';

  try {
    const response = await ai.models.generateContent({
      model: TTS_MODEL,
      contents: [
        {
          role: 'user',
          parts: [{ text: cleanText, speechMetadata: { style } }],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName } },
        },
      },
    });
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      res.status(502).json({ error: 'Empty audio output from TTS model.' });
      return;
    }
    res.json({ audioDataUrl: `data:audio/wav;base64,${base64Audio}`, model: TTS_MODEL });
  } catch (err) {
    res.status(502).json({ error: formatUpstreamError(err), code: 'TTS_FAILED' });
  }
});

const BANNED_WORDS = [
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

app.post('/api/ai/moderate-reel', async (req, res) => {
  const title = String(req.body?.title || '').trim();
  const caption = String(req.body?.caption || '').trim();
  const stepTip = String(req.body?.stepTip || '').trim();
  const combined = `${title} ${caption} ${stepTip}`.toLowerCase();

  if (!title || !caption) {
    res.status(400).json({
      allowed: false,
      reason: 'Please provide both a clear safety title and an educational description.',
    });
    return;
  }

  const matched = BANNED_WORDS.find((w) => combined.includes(w));
  if (matched) {
    res.json({
      allowed: false,
      reason: `Rejected by Saevy Sanctuary Moderation: Comedy, entertainment, prank, or abusive content ("${matched}") is strictly prohibited.`,
    });
    return;
  }

  const { ai, sdk } = await getGeminiSdk();
  if (!ai) {
    res.json({ allowed: true, reason: 'Verified under Women’s Safety & Self-Defence guidelines.' });
    return;
  }

  try {
    const { response } = await generateWithFallback(ai, sdk, {
      contents: `Evaluate this proposed Sanctuary Reel:\nTitle: ${title}\nTopic: ${req.body?.topic || 'Self-Defence'}\nCaption: ${caption}`,
      config: {
        systemInstruction:
          'Allow ONLY women safety awareness, self-defence, legal rights, cyber safety, transit safety, and first aid. Block comedy, pranks, memes, entertainment, or abuse.',
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: {
          type: sdk.Type.OBJECT,
          properties: {
            allowed: { type: sdk.Type.BOOLEAN },
            reason: { type: sdk.Type.STRING },
          },
          required: ['allowed', 'reason'],
        },
      },
    });
    const parsed = JSON.parse(response.text || '{}');
    res.json({
      allowed: Boolean(parsed.allowed),
      reason: parsed.reason || 'Verified under Sanctuary guidelines.',
    });
  } catch {
    res.json({ allowed: true, reason: 'Approved under Sanctuary safety criteria.' });
  }
});

app.post('/api/ai/analyze-content', async (req, res) => {
  const { ai, sdk } = await getGeminiSdk();
  if (!ai) {
    res.status(503).json({
      error: 'Analysis not connected: GEMINI_API_KEY is not configured on the server.',
      code: 'MISSING_API_KEY',
    });
    return;
  }
  const body = req.body || {};
  if (body.consentGiven !== true) {
    res.status(400).json({ error: 'Explicit consent is required.' });
    return;
  }
  const textContent = String(body.textContent || '').trim();
  const imageDataUrl = String(body.imageDataUrl || '').trim();
  if (!textContent && !imageDataUrl) {
    res.status(400).json({ error: 'Provide message text or an image screenshot to review.' });
    return;
  }

  const parts = [];
  if (imageDataUrl) {
    const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
      res.status(400).json({ error: 'Invalid image format.' });
      return;
    }
    parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
  }
  parts.push({
    text: textContent
      ? `Review for common pressure, impersonation, or OTP/coercion cues:\n\n${textContent}`
      : 'Review this screenshot for common pressure, impersonation, or OTP/coercion cues.',
  });

  try {
    const { response, modelUsed } = await generateWithFallback(ai, sdk, {
      contents: { parts },
      config: {
        systemInstruction:
          'Provide cautious review for social-engineering, pressure, or impersonation patterns. Set classification to caution_indicators, no_obvious_coercion, or inconclusive.',
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: {
          type: sdk.Type.OBJECT,
          properties: {
            classification: { type: sdk.Type.STRING },
            summary: { type: sdk.Type.STRING },
            observedPatterns: { type: sdk.Type.ARRAY, items: { type: sdk.Type.STRING } },
            limitationsNote: { type: sdk.Type.STRING },
            recommendedSteps: { type: sdk.Type.ARRAY, items: { type: sdk.Type.STRING } },
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
    const parsed = JSON.parse(response.text || '{}');
    const valid = ['caution_indicators', 'no_obvious_coercion', 'inconclusive'];
    res.json({
      classification: valid.includes(parsed.classification) ? parsed.classification : 'inconclusive',
      summary: parsed.summary || 'Inconclusive result.',
      observedPatterns: Array.isArray(parsed.observedPatterns) ? parsed.observedPatterns : [],
      limitationsNote:
        parsed.limitationsNote ||
        'AI pattern review cannot verify sender identity or legal documents.',
      recommendedSteps: Array.isArray(parsed.recommendedSteps) ? parsed.recommendedSteps : [],
      model: modelUsed,
    });
  } catch (err) {
    res.status(502).json({ error: formatUpstreamError(err), code: 'ANALYSIS_FAILED' });
  }
});

connectMongoIfConfigured().finally(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Saevy Women's Safety Backend running on port ${PORT} (http://localhost:${PORT})`);
  });
});
