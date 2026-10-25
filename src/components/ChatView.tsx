import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { DirectChatMessage, FamilyEmergencyContact } from '../types';
import { FIVE_EMERGENCY_NUMBERS, INITIAL_DIRECT_CHATS } from '../data/demoData';

interface ChatViewProps {
  familyContacts: FamilyEmergencyContact[];
  onShowToast: (msg: string) => void;
}

interface ChatTarget {
  id: string;
  name: string;
  role: string;
  phone: string;
  isEmergency: boolean;
  avatarIcon: string;
  color: string;
  isOnline: boolean;
}

const STORAGE_KEY = 'saevy_direct_chats_v2';

export const ChatView: React.FC<ChatViewProps> = ({ familyContacts, onShowToast }) => {
  // Chat targets: combine family contacts and emergency lines
  const chatTargets = useMemo<ChatTarget[]>(() => {
    const list: ChatTarget[] = [];

    // Family / Favourite contacts
    familyContacts.forEach((c) => {
      list.push({
        id: c.id,
        name: c.name,
        role: c.relation || 'Family Contact',
        phone: c.phone,
        isEmergency: false,
        avatarIcon: c.isFavourite ? 'star' : 'person',
        color: '#D4AF37',
        isOnline: true,
      });
    });

    // 5 Emergency Helplines
    FIVE_EMERGENCY_NUMBERS.forEach((e) => {
      list.push({
        id: e.id,
        name: `${e.number} · ${e.title}`,
        role: e.subtitle,
        phone: e.number,
        isEmergency: true,
        avatarIcon: 'shield',
        color: '#9E2A3B',
        isOnline: true,
      });
    });

    return list;
  }, [familyContacts]);

  const [activeTargetId, setActiveTargetId] = useState<string>(() => chatTargets[0]?.id || 'fam-saif');
  const [filterType, setFilterType] = useState<'all' | 'family' | 'emergency'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // Load chat messages from localStorage or fallback to INITIAL_DIRECT_CHATS
  const [allMessages, setAllMessages] = useState<Record<string, DirectChatMessage[]>>(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return INITIAL_DIRECT_CHATS;
  });

  // Save to localStorage whenever updated
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(allMessages));
    } catch {}
  }, [allMessages]);

  const activeTarget = useMemo(() => {
    return chatTargets.find((t) => t.id === activeTargetId) || chatTargets[0];
  }, [chatTargets, activeTargetId]);

  const currentMessages = useMemo(() => {
    if (!activeTarget) return [];
    return allMessages[activeTarget.id] || [];
  }, [allMessages, activeTarget]);

  const filteredTargets = useMemo(() => {
    return chatTargets.filter((t) => {
      if (filterType === 'family' && t.isEmergency) return false;
      if (filterType === 'emergency' && !t.isEmergency) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return t.name.toLowerCase().includes(q) || t.phone.toLowerCase().includes(q) || t.role.toLowerCase().includes(q);
      }
      return true;
    });
  }, [chatTargets, filterType, searchQuery]);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages, isTyping]);

  const handleSendMessage = (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || !activeTarget) return;

    const newMsg: DirectChatMessage = {
      id: `dm-${Date.now()}`,
      contactId: activeTarget.id,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'sent',
    };

    setAllMessages((prev) => ({
      ...prev,
      [activeTarget.id]: [...(prev[activeTarget.id] || []), newMsg],
    }));

    if (!textToSend) setInputText('');

    // Simulate realistic auto-response
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      let replyText = 'Received your message! Stay safe, I am keeping an eye on this chat.';
      if (activeTarget.isEmergency) {
        if (activeTarget.phone === '112') {
          replyText = '112 Emergency Dispatch: Message logged. If in immediate danger, dial 112 directly. Officers on standby.';
        } else if (activeTarget.phone === '181') {
          replyText = '181 Women Helpline: Received your message. Counselor active 24×7. Keep live location on.';
        } else if (activeTarget.phone === '108') {
          replyText = '108 Medical Dispatch: Ambulance triage unit ready. In critical condition, call 108 immediately.';
        } else {
          replyText = `${activeTarget.name}: Message acknowledged by official safety dispatch desk.`;
        }
      } else {
        if (text.includes('safe') || text.includes('reached')) {
          replyText = 'So glad to hear you arrived safely! Take rest now. ❤️';
        } else if (text.includes('urgent') || text.includes('call') || text.includes('help')) {
          replyText = 'Calling you right now! Stay in a bright, crowded spot and keep your phone in hand.';
        } else if (text.includes('location') || text.includes('GPS')) {
          replyText = 'Got your live coordinates on Saevy! Tracking your route until you reach home.';
        }
      }

      const botReply: DirectChatMessage = {
        id: `dm-${Date.now()}-reply`,
        contactId: activeTarget.id,
        sender: 'contact',
        text: replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'read',
      };

      setAllMessages((prev) => ({
        ...prev,
        [activeTarget.id]: [...(prev[activeTarget.id] || []), botReply],
      }));
    }, 1200);
  };

  const QUICK_PHRASES = [
    { label: '📍 Reached safely', text: 'I have reached safely, all good!' },
    { label: '🚨 Call me urgently', text: 'Please call me urgently on my phone.' },
    { label: '🛡️ Live GPS shared', text: 'Sharing my live location with you on Saevy.' },
    { label: '📞 Stay on line', text: 'Please stay on the line with me while I walk.' },
  ];

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-outline-variant/60 pb-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-on-surface">
            Safety Chat
          </h1>
          <p className="text-xs sm:text-sm text-on-surface-variant">
            Chat directly with your family, favourite persons, and 24×7 emergency helplines.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-medium text-on-surface-variant">Direct Secure Channel</span>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 h-[650px] sm:h-[680px]">
        {/* Left Column: Contact & Helpline Selector */}
        <div className="md:col-span-5 lg:col-span-4 luxury-card p-3 flex flex-col h-full overflow-hidden">
          {/* Filter Chips */}
          <div className="flex items-center gap-1.5 pb-2.5 border-b border-outline-variant/40">
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                filterType === 'all'
                  ? 'bg-[#171412] text-[#F6F1EA] dark:bg-[#D4AF37] dark:text-[#171412]'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
              }`}
            >
              All ({chatTargets.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('family')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                filterType === 'family'
                  ? 'bg-[#171412] text-[#F6F1EA] dark:bg-[#D4AF37] dark:text-[#171412]'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Favourites ({familyContacts.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('emergency')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                filterType === 'emergency'
                  ? 'bg-[#9E2A3B] text-white'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Emergency (5)
            </button>
          </div>

          {/* Search box */}
          <div className="py-2">
            <div className="relative">
              <span className="material-symbols-outlined text-[18px] text-on-surface-variant absolute left-3 top-1/2 -translate-y-1/2">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search contact or helpline..."
                className="w-full bg-surface-container-high/80 text-on-surface rounded-xl pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
              />
            </div>
          </div>

          {/* Targets List */}
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 no-scrollbar">
            {filteredTargets.map((target) => {
              const isSelected = activeTarget?.id === target.id;
              const targetMsgs = allMessages[target.id] || [];
              const lastMsg = targetMsgs[targetMsgs.length - 1];

              return (
                <button
                  key={target.id}
                  type="button"
                  onClick={() => setActiveTargetId(target.id)}
                  className={`w-full text-left p-2.5 rounded-2xl transition-all flex items-center gap-3 ${
                    isSelected
                      ? 'bg-surface-container-highest border border-[#D4AF37]/50 shadow-sm'
                      : 'hover:bg-surface-container-high/60 border border-transparent'
                  }`}
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white font-bold text-sm shadow-sm relative"
                    style={{ backgroundColor: target.isEmergency ? '#9E2A3B' : '#2D283E' }}
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      {target.avatarIcon}
                    </span>
                    {target.isOnline && (
                      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-surface" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs sm:text-sm text-on-surface truncate">
                        {target.name}
                      </span>
                      {lastMsg && (
                        <span className="text-[10px] text-on-surface-variant shrink-0">
                          {lastMsg.timestamp}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-on-surface-variant truncate">
                      {lastMsg ? lastMsg.text : target.role}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Chat Conversation Thread */}
        <div className="md:col-span-7 lg:col-span-8 luxury-card flex flex-col h-full overflow-hidden">
          {/* Chat Target Header */}
          {activeTarget && (
            <div className="p-3.5 bg-surface-container-high/80 border-b border-outline-variant/60 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0 shadow-sm"
                  style={{ backgroundColor: activeTarget.isEmergency ? '#9E2A3B' : '#2D283E' }}
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {activeTarget.avatarIcon}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold text-sm sm:text-base text-on-surface truncate">
                      {activeTarget.name}
                    </h2>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        activeTarget.isEmergency
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-200'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-200'
                      }`}
                    >
                      {activeTarget.isEmergency ? 'Emergency' : 'Favourite'}
                    </span>
                  </div>
                  <p className="text-xs text-on-surface-variant truncate">
                    {activeTarget.phone} · {activeTarget.role}
                  </p>
                </div>
              </div>

              {/* Call button */}
              <a
                href={`tel:${activeTarget.phone.replace(/[^0-9+]/g, '')}`}
                onClick={() => onShowToast(`Dialing ${activeTarget.name} (${activeTarget.phone})`)}
                className="px-3.5 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all shrink-0"
              >
                <span className="material-symbols-outlined text-[16px]">call</span>
                <span>Call Now</span>
              </a>
            </div>
          )}

          {/* Messages Bubble Thread */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {currentMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-2 text-on-surface-variant">
                <span className="material-symbols-outlined text-4xl text-[#D4AF37]">
                  chat_bubble_outline
                </span>
                <p className="font-medium text-sm text-on-surface">
                  Start your safety conversation with {activeTarget?.name}
                </p>
                <p className="text-xs max-w-sm">
                  Send a text, share live status, or tap any quick safety button below.
                </p>
              </div>
            ) : (
              currentMessages.map((msg) => {
                const isMe = msg.sender === 'user';
                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[82%] sm:max-w-[70%] p-3 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                        isMe
                          ? 'bg-[#171412] text-[#F6F1EA] dark:bg-[#D4AF37] dark:text-[#171412] rounded-br-sm shadow-sm'
                          : 'bg-surface-container-high text-on-surface border border-outline-variant/60 rounded-bl-sm shadow-sm'
                      }`}
                    >
                      <p>{msg.text}</p>
                      <div
                        className={`text-[10px] mt-1 flex items-center gap-1 justify-end ${
                          isMe ? 'text-white/70 dark:text-black/70' : 'text-on-surface-variant'
                        }`}
                      >
                        <span>{msg.timestamp}</span>
                        {isMe && (
                          <span className="material-symbols-outlined text-[13px]">
                            done_all
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}

            {isTyping && (
              <div className="flex items-center gap-1.5 p-2 text-xs text-on-surface-variant">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] animate-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] animate-bounce [animation-delay:0.2s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] animate-bounce [animation-delay:0.4s]" />
                <span className="ml-1 text-[11px]">{activeTarget?.name} is typing...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Safety Phrase Chips */}
          <div className="px-3 py-2 bg-surface-container-low/70 border-t border-outline-variant/40 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {QUICK_PHRASES.map((qp, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendMessage(qp.text)}
                className="px-2.5 py-1 rounded-full bg-surface-container text-[11px] font-medium text-on-surface hover:border-[#D4AF37] border border-outline-variant/60 whitespace-nowrap active:scale-95 transition-all"
              >
                {qp.label}
              </button>
            ))}
          </div>

          {/* Input & Send Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-3 bg-surface-container-high/80 border-t border-outline-variant/60 flex items-center gap-2"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={`Message ${activeTarget?.name || 'contact'}...`}
              className="flex-1 bg-surface-container text-on-surface rounded-full px-4 py-2.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37] border border-outline-variant/60"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="w-10 h-10 rounded-full bg-[#171412] dark:bg-[#D4AF37] text-[#F6F1EA] dark:text-[#171412] flex items-center justify-center shrink-0 disabled:opacity-40 transition-transform active:scale-95"
            >
              <span className="material-symbols-outlined text-[19px]">send</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
