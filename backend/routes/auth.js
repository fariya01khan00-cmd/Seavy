const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const { UserModel, readLocalStore, writeLocalStore } = require('../models/SafetyModels');

const router = express.Router();

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getTokenSecret() {
  const configured = (process.env.JWT_SECRET || '').trim();
  return configured || 'saevy-sanctuary-auth-secret-v1';
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash: derived };
}

function verifyPassword(password, salt, storedHash) {
  if (!salt || !storedHash) return false;
  const derivedBuf = crypto.scryptSync(String(password), salt, 64);
  const storedBuf = Buffer.from(storedHash, 'hex');
  if (derivedBuf.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derivedBuf, storedBuf);
}

function signAuthToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(
    JSON.stringify({
      ...payload,
      iat: Date.now(),
      exp: Date.now() + TOKEN_TTL_MS,
    })
  ).toString('base64url');
  const signature = crypto
    .createHmac('sha256', getTokenSecret())
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyAuthToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getTokenSecret())
    .update(`${header}.${body}`)
    .digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (decoded.exp && Date.now() > decoded.exp) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

function normalizeEmail(raw) {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

function normalizePhone(raw) {
  return typeof raw === 'string' ? raw.trim() : '';
}

function generateGuardianId() {
  return `#SV-${Math.floor(10000 + Math.random() * 90000)}`;
}

function sanitizePublicUser(user) {
  return {
    id: user.userId || user.id,
    fullName: user.fullName || user.name || 'Saevy Member',
    name: user.fullName || user.name || 'Saevy Member',
    email: user.email || '',
    phone: user.phone || '',
    guardianId: user.guardianId || '#SV-92841',
    authMethod: user.authMethod || 'password',
    createdAt: user.createdAt || null,
  };
}

function isMongoReady() {
  return mongoose.connection.readyState === 1;
}

async function findExistingUser({ email, phone, userId }) {
  if (isMongoReady()) {
    if (userId) {
      return UserModel.findOne({ userId }).lean();
    }
    const orClauses = [];
    if (email) orClauses.push({ email });
    if (phone) orClauses.push({ phone });
    if (orClauses.length === 0) return null;
    return UserModel.findOne({ $or: orClauses }).lean();
  }

  const store = readLocalStore();
  const users = Array.isArray(store.users) ? store.users : [];
  return (
    users.find((u) => {
      if (userId && (u.userId === userId || u.id === userId)) return true;
      if (email && u.email && u.email.toLowerCase() === email) return true;
      if (phone && u.phone && u.phone === phone) return true;
      return false;
    }) || null
  );
}

async function handleSignup(req, res) {
  try {
    const body = req.body || {};
    const fullName = String(body.fullName || body.name || 'Saevy Member').trim() || 'Saevy Member';
    const email = normalizeEmail(body.email);
    const phone = normalizePhone(body.phone);
    const password = typeof body.password === 'string' ? body.password : '';

    if (!email && !phone) {
      res.status(400).json({
        error: 'An email address or phone number is required to sign up.',
      });
      return;
    }

    if (email && !email.includes('@')) {
      res.status(400).json({
        error: 'Please provide a valid email address.',
      });
      return;
    }

    if (!password || password.length < 6) {
      res.status(400).json({
        error: 'Password must be at least 6 characters long.',
      });
      return;
    }

    const existing = await findExistingUser({ email, phone });
    if (existing) {
      res.status(409).json({
        error: 'An account with this email or phone number already exists.',
      });
      return;
    }

    const { salt, hash } = hashPassword(password);
    const userRecord = {
      userId: `usr-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      fullName,
      email,
      phone,
      passwordHash: hash,
      passwordSalt: salt,
      guardianId: body.guardianId || generateGuardianId(),
      authMethod: 'password',
      createdAt: new Date().toISOString(),
    };

    if (isMongoReady()) {
      await UserModel.create(userRecord);
    } else {
      const store = readLocalStore();
      store.users = [userRecord, ...(store.users || [])];
      writeLocalStore(store);
    }

    const publicUser = sanitizePublicUser(userRecord);
    const token = signAuthToken({
      sub: publicUser.id,
      email: publicUser.email,
      phone: publicUser.phone,
      guardianId: publicUser.guardianId,
    });

    res.status(201).json({
      ok: true,
      message: 'Account created successfully.',
      token,
      user: publicUser,
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Unable to complete signup.',
    });
  }
}

router.post('/signup', handleSignup);
router.post('/register', handleSignup);

router.post('/login', async (req, res) => {
  try {
    const body = req.body || {};
    const rawIdentifier = typeof body.identifier === 'string' ? body.identifier.trim() : '';
    const email = normalizeEmail(
      body.email || (rawIdentifier.includes('@') ? rawIdentifier : '')
    );
    const phone = normalizePhone(
      body.phone || (!rawIdentifier.includes('@') ? rawIdentifier : '')
    );
    const password = typeof body.password === 'string' ? body.password : '';

    if ((!email && !phone) || !password) {
      res.status(400).json({
        error: 'Email or phone number and password are required to log in.',
      });
      return;
    }

    const user = await findExistingUser({ email, phone });
    if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      res.status(401).json({
        error: 'Invalid credentials. Please check your email/phone and password.',
      });
      return;
    }

    const publicUser = sanitizePublicUser(user);
    const token = signAuthToken({
      sub: publicUser.id,
      email: publicUser.email,
      phone: publicUser.phone,
      guardianId: publicUser.guardianId,
    });

    res.json({
      ok: true,
      message: 'Login successful.',
      token,
      user: publicUser,
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Unable to complete login.',
    });
  }
});

router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const payload = verifyAuthToken(token);
  if (!payload || !payload.sub) {
    res.status(401).json({ error: 'Unauthorized or expired authentication token.' });
    return;
  }

  const user = await findExistingUser({ userId: payload.sub });
  if (!user) {
    res.status(404).json({ error: 'Authenticated user account not found.' });
    return;
  }

  res.json({
    ok: true,
    user: sanitizePublicUser(user),
  });
});

module.exports = router;
