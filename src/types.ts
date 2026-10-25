export type MainTab = 'home' | 'haven' | 'chat' | 'health' | 'atelier' | 'self';

export type HomeSubView = 'reels' | 'comments' | 'gazette';
export type HavenSubView =
  | 'helplines'
  | 'concierge'
  | 'bluetooth_peer'
  | 'parent_call'
  | 'safety_phrase'
  | 'ai_check';
export type HealthSubView =
  | 'overview'
  | 'emergency'
  | 'nearby_map'
  | 'doctors'
  | 'tips'
  | 'remedies';
export type AtelierSubView = 'catalog' | 'cart' | 'checkout' | 'tracking' | 'receipt' | 'wishlist';
export type SelfSubView = 'profile' | 'settings' | 'language';

export type SupportedVoiceLang = string;

export type SafetyPhraseAction =
  | 'open_support'
  | 'play_alarm'
  | 'record_audio'
  | 'record_video'
  | 'take_photo'
  | 'call_parents'
  | 'sms_favourites'
  | 'call_police'
  | 'share_location';

export type PowerTriplePressMode = 'silent_sos' | 'louder_sos';

export type FemaleAiVoiceId = 'kavya' | 'aanya' | 'meera' | 'zoya' | 'nandini' | 'siya';

export interface FemaleAiVoiceOption {
  id: FemaleAiVoiceId;
  name: string;
  role: string;
  tone: string;
  geminiVoiceName: 'Kore' | 'Zephyr';
  speechStyle: string;
  pitch: number;
  rate: number;
  sampleLine: string;
}

export interface QuickNoteItem {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
  languageCode?: string;
}

export interface EvidencePolaroidRecord {
  id: string;
  title: string;
  location: string;
  timestamp: string;
  note: string;
  imageUrl: string;
  mediaKind?: 'photo' | 'video' | 'audio';
  mediaDataUrl?: string;
}

export interface BluetoothPeerAlert {
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

export interface ConciergeAttachment {
  kind: 'audio' | 'image' | 'video';
  mimeType: string;
  dataUrl: string;
  label: string;
}

export interface DoctorTipItem {
  id: string;
  title: string;
  doctorName: string;
  specialty: string;
  category: 'Daily Wellness' | 'Respiratory' | 'Sleep & Stress' | 'Women’s Health' | 'Nutrition';
  readTime: string;
  summary: string;
  steps: string[];
  seekCareNote: string;
}

export interface HomeRemedyItem {
  id: string;
  title: string;
  remedyType: 'homoeopathic' | 'home_remedy';
  focusArea: string;
  ingredientsOrPotency: string;
  summary: string;
  howToUse: string[];
  caution: string;
}

export interface PopularDoctorContact {
  id: string;
  name: string;
  qualification: string;
  specialty: string;
  clinicName: string;
  city: string;
  experience: string;
  timings: string;
  languages: string;
  phoneDisplay: string;
  phoneDial: string;
}

export interface EmergencyPhoneItem {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  availability: string;
  whenToCall: string;
}

export interface FamilyEmergencyContact {
  id: string;
  name: string;
  relation: string;
  phone: string;
  note?: string;
  isFavourite?: boolean;
  allowLiveLocation?: boolean;
}

export interface CommentItem {
  id: string;
  author: string;
  saevyId: string;
  timeAgo: string;
  avatarUrl: string;
  verifiedRole?: string;
  badgeText?: string;
  body: string;
  likes: number;
  likedByMe?: boolean;
  repliesCount: number;
  replies?: { id: string; author: string; body: string; timeAgo: string }[];
}

export interface ReelItem {
  id: string;
  instructor: string;
  credential: string;
  role: string;
  avatarUrl: string;
  heroImageUrl: string;
  thumbUrl: string;
  videoDataUrl?: string;
  topic: 'Self-Defence' | 'Legal Rights' | 'Cyber Safety' | 'First Aid';
  duration: string;
  title: string;
  caption: string;
  tags: string[];
  stepEn: string;
  stepHi: string;
  likesCount: number;
  liked: boolean;
  saved: boolean;
  following: boolean;
  repostedByMe?: boolean;
  repostCount?: number;
  drillSteps: string[];
}

export interface GazetteArticle {
  id: string;
  category: 'Transit Patrols' | 'Cyber Sanctuary' | 'Legal Mandate' | 'Sanctuary Map';
  tagLabel: string;
  kicker: string;
  readTime: string;
  timeAgo: string;
  title: string;
  summary: string;
  actionLabel: string;
  saved: boolean;
  visualTheme: 'cyber' | 'scales' | 'pharmacy';
}

export interface ConciergeMessage {
  id: string;
  sender: 'user' | 'concierge';
  text: string;
  timestamp: string;
  steps?: string[];
  isInitialSample?: boolean;
  modelUsed?: string;
  lang?: 'en' | 'hi';
  attachment?: ConciergeAttachment;
  voicePersonaName?: string;
}

export interface AtelierProduct {
  id: string;
  title: string;
  subtitle: string;
  category:
    | 'Fine Jewelry'
    | 'Covert Alarms'
    | 'Mesh Trackers'
    | 'Critical Safety Gadgets'
    | 'Health & Sanitary Care';
  wishlistCategory: 'Wearables' | 'Acoustics & Strobe' | 'Essentials & Hygiene';
  badge: string;
  specChip: string;
  material: string;
  techSpec: string;
  description: string;
  price: number;
  originalPrice: number;
  rating: number;
  lowStock?: boolean;
  shippingNote: string;
  imageUrl: string;
}

export interface DialectOption {
  code: string;
  name: string;
  region: string;
  group: 'indian' | 'global';
  nativeSample: string;
  safePhrase: string;
  continueLabel: string;
}

export type OrderTrackingStep = 'placed' | 'processing' | 'dispatched' | 'delivered';

export interface ProfileMockOrder {
  id: string;
  orderNumber: string;
  itemTitle: string;
  itemSubtitle?: string;
  itemImageUrl?: string;
  price: number;
  paymentMethod: string;
  currentStep: OrderTrackingStep;
  courierPartner: string;
  trackingNumber: string;
  estimatedDelivery: string;
  destinationAddress: string;
  recipientName: string;
  timeline: {
    step: OrderTrackingStep;
    label: 'Placed' | 'Processing' | 'Dispatched' | 'Delivered';
    time: string;
    description: string;
    completed: boolean;
    current: boolean;
  }[];
}

export interface UserProfile {
  fullName: string;
  avatarUrl?: string;
  guardianId: string;
  phone: string;
  email?: string;
  authMethod?: 'google' | 'facebook' | 'email_otp' | 'phone_otp';
  bloodGroup: string;
  knownConditions: string;
  allergies: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  homeSanctuaryZone: string;
  workSanctuaryZone: string;
  deliveryAddress: string;
  activeOrder?: ProfileMockOrder;
  mockOrders?: ProfileMockOrder[];
}

export interface AppSettings {
  fakeCalculatorMode: boolean;
  calculatorPin: string;
  simulatedBleMesh: boolean;
  sirenVolumePercent: number;
  discreetHaptics: boolean;
  highDbAlert: boolean;
  guardianAutoPing: boolean;
  appearance: 'dark' | 'light' | 'system';
  largeText: boolean;
  selectedDialectCode: string;
  bilingualSubtitles: boolean;
  safetyPhrase: string;
  safetyPhraseLang: SupportedVoiceLang;
  safetyPhraseAction: SafetyPhraseAction;
  safetyPhraseActionConfirmed: boolean;
  whisperBoostEnabled: boolean;
  powerTriplePressMode: PowerTriplePressMode;
  selectedFemaleVoiceId: FemaleAiVoiceId;
  liveLocationShareEnabled: boolean;
}

export interface OrderItem {
  productId: string;
  title: string;
  quantity: number;
  price: number;
  imageUrl: string;
}

export interface OrderRecord {
  id: string;
  orderNumber: string;
  createdAt: string;
  items: OrderItem[];
  totalAmount: number;
  status: 'confirmed' | 'packed' | 'in_transit' | 'out_for_delivery' | 'delivered';
  deliveryAddress: string;
  recipientName?: string;
  recipientPhone?: string;
  paymentMethod: string;
  paymentType?: 'cash' | 'card' | 'upi' | 'emi';
  paymentDetails?: {
    upiAppOrId?: string;
    utrNumber?: string;
    cardLast4?: string;
    cardNetwork?: string;
    authCode?: string;
    emiBank?: string;
    emiTenure?: string;
    emiMonthlyAmount?: number;
    cashDueOnDelivery?: number;
  };
  courierPartner: string;
  trackingNumber: string;
  estimatedDelivery: string;
  checkpoints: { time: string; location: string; status: string; completed: boolean }[];
}

export interface DirectChatMessage {
  id: string;
  contactId: string;
  sender: 'user' | 'contact';
  text: string;
  timestamp: string;
  status?: 'sent' | 'delivered' | 'read';
}
