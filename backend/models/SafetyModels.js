const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

const SosAlertSchema = new mongoose.Schema(
  {
    alertId: { type: String, required: true, index: true },
    guardianName: { type: String, default: 'Saevy Guardian' },
    guardianId: { type: String, default: '#SV-92841' },
    mode: { type: String, enum: ['silent', 'louder'], default: 'silent' },
    message: { type: String, default: '' },
    coords: {
      lat: Number,
      lng: Number,
    },
    mapsUrl: { type: String, default: '' },
    contactsNotified: { type: Number, default: 0 },
    status: { type: String, default: 'dispatched' },
  },
  { timestamps: true }
);

const ContactSchema = new mongoose.Schema(
  {
    contactId: { type: String, required: true },
    name: { type: String, required: true },
    relation: { type: String, default: 'Family' },
    phone: { type: String, required: true },
    isFavourite: { type: Boolean, default: true },
    allowLiveLocation: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const EvidenceSchema = new mongoose.Schema(
  {
    recordId: { type: String, required: true },
    title: { type: String, required: true },
    timestampGold: { type: String, default: '' },
    locationLabel: { type: String, default: '' },
    mediaType: { type: String, default: 'photo' },
    previewUrl: { type: String, default: '' },
    verifiedHash: { type: String, default: '' },
  },
  { timestamps: true }
);

const LiveLocationSchema = new mongoose.Schema(
  {
    guardianId: { type: String, required: true },
    guardianName: { type: String, default: '' },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    mapsUrl: { type: String, default: '' },
    active: { type: Boolean, default: true },
    permittedCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const UserSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    fullName: { type: String, required: true, default: 'Saevy Member' },
    email: { type: String, default: '', lowercase: true, trim: true, index: true },
    phone: { type: String, default: '', trim: true, index: true },
    passwordHash: { type: String, required: true },
    passwordSalt: { type: String, required: true },
    guardianId: { type: String, default: '#SV-92841' },
    authMethod: { type: String, default: 'password' },
  },
  { timestamps: true }
);

const SosAlertModel =
  mongoose.models.SosAlert || mongoose.model('SosAlert', SosAlertSchema);
const ContactModel =
  mongoose.models.EmergencyContact || mongoose.model('EmergencyContact', ContactSchema);
const EvidenceModel =
  mongoose.models.EvidenceRecord || mongoose.model('EvidenceRecord', EvidenceSchema);
const LiveLocationModel =
  mongoose.models.LiveLocationSession ||
  mongoose.model('LiveLocationSession', LiveLocationSchema);
const UserModel =
  mongoose.models.UserAccount || mongoose.model('UserAccount', UserSchema);

function ensureStoreFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORE_FILE)) {
    const initial = {
      users: [],
      sosAlerts: [],
      contacts: [],
      evidence: [],
      liveLocations: [],
      profile: null,
      blePackets: [
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
      ],
    };
    fs.writeFileSync(STORE_FILE, JSON.stringify(initial, null, 2), 'utf8');
  }
}

function readLocalStore() {
  ensureStoreFile();
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    if (!Array.isArray(parsed.users)) {
      parsed.users = [];
    }
    return parsed;
  } catch {
    return {
      users: [],
      sosAlerts: [],
      contacts: [],
      evidence: [],
      liveLocations: [],
      profile: null,
      blePackets: [],
    };
  }
}

function writeLocalStore(data) {
  ensureStoreFile();
  fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), 'utf8');
}

module.exports = {
  SosAlertModel,
  ContactModel,
  EvidenceModel,
  LiveLocationModel,
  UserModel,
  readLocalStore,
  writeLocalStore,
};
