import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  DoctorTipItem,
  FamilyEmergencyContact,
  HealthSubView,
  HomeRemedyItem,
  PopularDoctorContact,
} from '../types';
import {
  DOCTOR_TIPS,
  FIVE_EMERGENCY_NUMBERS,
  HOMEOPATHIC_AND_HOME_REMEDIES,
  POPULAR_DOCTORS_DIRECTORY,
} from '../data/demoData';
import { NearbyDoctorsMap } from './NearbyDoctorsMap';

interface HealthVaultViewProps {
  subView: HealthSubView;
  onChangeSubView: (v: HealthSubView) => void;
  familyContacts: FamilyEmergencyContact[];
  onUpdateFamilyContacts: React.Dispatch<React.SetStateAction<FamilyEmergencyContact[]>>;
  savedIds: string[];
  onToggleSaved: (id: string, title: string) => void;
  dialectCode: string;
  liveLocationPermitted?: boolean;
  onToggleLiveLocationPermitted?: () => void;
  onOpenNotes?: () => void;
  onShowToast: (msg: string) => void;
}

interface CallItem {
  id: string;
  name: string;
  role: string;
  phone: string;
  category: 'family' | 'emergency' | 'doctor';
  icon: string;
  color: string;
}

export const HealthVaultView: React.FC<HealthVaultViewProps> = ({
  subView,
  onChangeSubView,
  familyContacts,
  onUpdateFamilyContacts,
  savedIds,
  onToggleSaved,
  dialectCode = 'en',
  onShowToast,
}) => {
  const [callFilter, setCallFilter] = useState<'all' | 'family' | 'emergency' | 'doctor'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [remedyType, setRemedyType] = useState<'all' | 'home_remedy' | 'homoeopathic'>('all');

  // Contact form modal state
  const [addContactModalOpen, setAddContactModalOpen] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactRelation, setContactRelation] = useState('Family');
  const [contactPhone, setContactPhone] = useState('+91 ');

  // Build the complete Call List (Family, Emergency Helplines, Specialists)
  const allCalls = useMemo<CallItem[]>(() => {
    const list: CallItem[] = [];

    // Family Contacts
    familyContacts.forEach((c) => {
      list.push({
        id: c.id,
        name: c.name,
        role: c.relation || 'Family Contact',
        phone: c.phone,
        category: 'family',
        icon: c.isFavourite ? 'favorite' : 'person',
        color: '#D4AF37',
      });
    });

    // 5 Emergency Helplines
    FIVE_EMERGENCY_NUMBERS.forEach((e) => {
      list.push({
        id: e.id,
        name: `${e.number} · ${e.title}`,
        role: e.subtitle,
        phone: e.number,
        category: 'emergency',
        icon: 'emergency',
        color: '#9E2A3B',
      });
    });

    // Popular Doctor Specialists
    POPULAR_DOCTORS_DIRECTORY.forEach((d) => {
      list.push({
        id: d.id,
        name: d.name,
        role: `${d.specialty} · ${d.clinicName}`,
        phone: d.phoneDisplay,
        category: 'doctor',
        icon: 'medical_services',
        color: '#2E7D32',
      });
    });

    return list;
  }, [familyContacts]);

  const filteredCalls = useMemo(() => {
    return allCalls.filter((c) => {
      if (callFilter !== 'all' && c.category !== callFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q) || c.role.toLowerCase().includes(q);
      }
      return true;
    });
  }, [allCalls, callFilter, searchQuery]);

  const handleAddContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName.trim() || !contactPhone.trim()) {
      onShowToast('Please enter name and phone number');
      return;
    }
    const newContact: FamilyEmergencyContact = {
      id: `fam-${Date.now()}`,
      name: contactName.trim(),
      relation: contactRelation.trim() || 'Family',
      phone: contactPhone.trim(),
      isFavourite: true,
      allowLiveLocation: true,
    };
    onUpdateFamilyContacts((prev) => [newContact, ...prev]);
    setAddContactModalOpen(false);
    setContactName('');
    setContactPhone('+91 ');
    onShowToast(`Added ${newContact.name} to Call List`);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-outline-variant/60 pb-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-on-surface">
            Health &amp; Emergency Vault
          </h1>
          <p className="text-xs sm:text-sm text-on-surface-variant">
            One-tap emergency call list, doctor wellness guidance, and gentle remedies.
          </p>
        </div>

        {/* Sub-view switcher */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { id: 'overview', label: 'Call List' },
            { id: 'tips', label: 'Doctor Tips' },
            { id: 'remedies', label: 'Remedies' },
            { id: 'nearby_map', label: 'Nearby Map' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChangeSubView(tab.id as HealthSubView)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                subView === tab.id
                  ? 'bg-[#171412] text-[#F6F1EA] dark:bg-[#D4AF37] dark:text-[#171412]'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* SWIPEABLE HORIZONTAL CALL LIST SECTION */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#D4AF37] text-[20px]">swap_horiz</span>
            <h2 className="font-bold text-sm sm:text-base text-on-surface">
              Call List (Swipe Left ↔ Right)
            </h2>
          </div>

          <button
            type="button"
            onClick={() => setAddContactModalOpen(true)}
            className="text-xs font-semibold text-[#D4AF37] hover:underline flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            <span>Add Contact</span>
          </button>
        </div>

        {/* Filter buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {[
            { id: 'all', label: `All (${allCalls.length})` },
            { id: 'family', label: `Family (${familyContacts.length})` },
            { id: 'emergency', label: 'Helplines (5)' },
            { id: 'doctor', label: 'Doctors (4)' },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setCallFilter(f.id as any)}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                callFilter === f.id
                  ? 'bg-[#171412] text-white dark:bg-[#D4AF37] dark:text-black'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* HORIZONTAL SWIPEABLE CAROUSEL CONTAINER */}
        <div className="overflow-x-auto flex gap-3 pb-3 snap-x snap-mandatory no-scrollbar scroll-smooth">
          {filteredCalls.map((call) => (
            <div
              key={call.id}
              className="snap-start shrink-0 w-[240px] sm:w-[260px] luxury-card p-4 flex flex-col justify-between space-y-3 hover:border-[#D4AF37]/60 transition-colors"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0 shadow-sm"
                    style={{ backgroundColor: call.color }}
                  >
                    <span className="material-symbols-outlined text-[18px]">{call.icon}</span>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      call.category === 'emergency'
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-200'
                        : call.category === 'doctor'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-200'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-200'
                    }`}
                  >
                    {call.category.toUpperCase()}
                  </span>
                </div>

                <div>
                  <h3 className="font-bold text-sm text-on-surface truncate">{call.name}</h3>
                  <p className="text-[11px] text-on-surface-variant line-clamp-2 mt-0.5 leading-snug">
                    {call.role}
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-outline-variant/40 space-y-2">
                <span className="font-mono text-xs font-semibold text-on-surface block truncate">
                  {call.phone}
                </span>

                <a
                  href={`tel:${call.phone.replace(/[^0-9+]/g, '')}`}
                  onClick={() => onShowToast(`Calling ${call.name} (${call.phone})`)}
                  className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
                >
                  <span className="material-symbols-outlined text-[16px]">call</span>
                  <span>Dial Call</span>
                </a>
              </div>
            </div>
          ))}

          {/* Quick Add Card at end of swipe carousel */}
          <button
            type="button"
            onClick={() => setAddContactModalOpen(true)}
            className="snap-start shrink-0 w-[180px] luxury-card p-4 flex flex-col items-center justify-center text-center space-y-2 border-dashed border-2 border-outline-variant/70 hover:border-[#D4AF37] transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-[#D4AF37]">
              <span className="material-symbols-outlined text-2xl">add</span>
            </div>
            <span className="text-xs font-bold text-on-surface">+ Add Contact</span>
            <span className="text-[10px] text-on-surface-variant">Add family or doctor number</span>
          </button>
        </div>
      </div>

      {/* SUB-VIEW CONTENT: DOCTOR TIPS */}
      {(subView === 'tips' || subView === 'overview') && (
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between pb-1 border-b border-outline-variant/50">
            <h2 className="font-bold text-base text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-[#D4AF37] text-[20px]">health_and_safety</span>
              <span>Essential Doctor Wellness Guidance</span>
            </h2>
            <span className="text-xs text-on-surface-variant">4 Certified Tips</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {DOCTOR_TIPS.map((tip) => {
              const isSaved = savedIds.includes(tip.id);
              return (
                <div key={tip.id} className="luxury-card p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-bold text-[#D4AF37] uppercase tracking-wide">
                        {tip.category} · {tip.readTime}
                      </span>
                      <h3 className="font-bold text-sm sm:text-base text-on-surface mt-0.5">
                        {tip.title}
                      </h3>
                      <p className="text-xs text-on-surface-variant">
                        By {tip.doctorName} ({tip.specialty})
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onToggleSaved(tip.id, tip.title)}
                      className="p-1.5 rounded-full hover:bg-surface-container text-on-surface-variant"
                    >
                      <span className={`material-symbols-outlined text-[18px] ${isSaved ? 'text-[#D4AF37] material-symbols-filled' : ''}`}>
                        bookmark
                      </span>
                    </button>
                  </div>

                  <p className="text-xs text-on-surface-variant leading-relaxed">
                    {tip.summary}
                  </p>

                  <div className="bg-surface-container rounded-xl p-3 space-y-1 text-xs">
                    <span className="font-semibold text-on-surface block">Key Steps:</span>
                    <ul className="list-disc list-inside space-y-0.5 text-on-surface-variant">
                      {tip.steps.map((s, idx) => (
                        <li key={idx}>{s}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUB-VIEW CONTENT: REMEDIES */}
      {(subView === 'remedies' || subView === 'overview') && (
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between pb-1 border-b border-outline-variant/50">
            <h2 className="font-bold text-base text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-[#D4AF37] text-[20px]">spa</span>
              <span>Gentle @Home &amp; Homoeopathic Remedies</span>
            </h2>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setRemedyType('all')}
                className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  remedyType === 'all' ? 'bg-[#171412] text-white dark:bg-[#D4AF37] dark:text-black' : 'text-on-surface-variant'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setRemedyType('home_remedy')}
                className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  remedyType === 'home_remedy' ? 'bg-[#171412] text-white dark:bg-[#D4AF37] dark:text-black' : 'text-on-surface-variant'
                }`}
              >
                Kitchen
              </button>
              <button
                type="button"
                onClick={() => setRemedyType('homoeopathic')}
                className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  remedyType === 'homoeopathic' ? 'bg-[#171412] text-white dark:bg-[#D4AF37] dark:text-black' : 'text-on-surface-variant'
                }`}
              >
                Homoeopathic
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {HOMEOPATHIC_AND_HOME_REMEDIES.filter(
              (r) => remedyType === 'all' || r.remedyType === remedyType
            ).map((rem) => (
              <div key={rem.id} className="luxury-card p-4 space-y-2 flex flex-col justify-between">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-[#D4AF37] uppercase">
                      {rem.focusArea}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-container font-medium">
                      {rem.remedyType === 'home_remedy' ? 'Kitchen @Home' : 'Homoeopathic'}
                    </span>
                  </div>
                  <h3 className="font-bold text-sm text-on-surface">{rem.title}</h3>
                  <p className="text-xs text-on-surface-variant">{rem.summary}</p>
                </div>

                <div className="bg-surface-container rounded-xl p-2.5 text-xs text-on-surface-variant space-y-1">
                  <p className="font-semibold text-on-surface">Usage:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                    {rem.howToUse.map((step, idx) => (
                      <li key={idx}>{step}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-VIEW CONTENT: NEARBY MAP */}
      {subView === 'nearby_map' && (
        <div className="space-y-4">
          <NearbyDoctorsMap isHi={dialectCode === 'hi'} onShowToast={onShowToast} />
        </div>
      )}

      {/* MODAL: ADD CONTACT */}
      <AnimatePresence>
        {addContactModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md luxury-card p-5 space-y-4"
            >
              <div className="flex items-center justify-between pb-2 border-b border-outline-variant/60">
                <h3 className="font-bold text-base text-on-surface">Add to Call List</h3>
                <button
                  type="button"
                  onClick={() => setAddContactModalOpen(false)}
                  className="w-7 h-7 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-on-surface"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleAddContactSubmit} className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-on-surface">Name *</label>
                  <input
                    type="text"
                    required
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="e.g. Papa, Sister, Dr. Verma"
                    className="w-full bg-surface-container rounded-xl p-2.5 text-xs text-on-surface mt-1 outline-none focus:ring-1 focus:ring-[#D4AF37]"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-on-surface">Relationship / Role</label>
                  <input
                    type="text"
                    value={contactRelation}
                    onChange={(e) => setContactRelation(e.target.value)}
                    placeholder="e.g. Trusted Contact, Gynecologist"
                    className="w-full bg-surface-container rounded-xl p-2.5 text-xs text-on-surface mt-1 outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-on-surface">Phone Number *</label>
                  <input
                    type="tel"
                    required
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    className="w-full bg-surface-container rounded-xl p-2.5 text-xs text-on-surface mt-1 outline-none focus:ring-1 focus:ring-[#D4AF37]"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/40">
                  <button
                    type="button"
                    onClick={() => setAddContactModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-surface-container text-xs font-medium text-on-surface"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-[#171412] dark:bg-[#D4AF37] text-white dark:text-black text-xs font-bold shadow-sm"
                  >
                    Save to Call List
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
