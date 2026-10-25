import React, { useState } from 'react';
import { motion } from 'motion/react';
import { OrderTrackingStep, ProfileMockOrder, UserProfile } from '../types';
import { ResilientImage } from './ResilientImage';

interface OrderTrackingProgressProps {
  profile: UserProfile;
  onUpdateProfile?: React.Dispatch<React.SetStateAction<UserProfile>>;
  onShowToast?: (msg: string) => void;
}

const STEP_ORDER: OrderTrackingStep[] = ['placed', 'processing', 'dispatched', 'delivered'];

const STEP_CONFIG: Record<
  OrderTrackingStep,
  {
    index: number;
    label: string;
    icon: string;
    progressPercent: number;
    badgeColor: string;
    statusHeadline: string;
    defaultDesc: string;
  }
> = {
  placed: {
    index: 0,
    label: 'Placed',
    icon: 'shopping_bag',
    progressPercent: 5,
    badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
    statusHeadline: 'Order Placed & Payment Authorized',
    defaultDesc: 'Order details confirmed and secure payment clearance validated.',
  },
  processing: {
    index: 1,
    label: 'Processing',
    icon: 'inventory_2',
    progressPercent: 37,
    badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    statusHeadline: 'QC Testing & Tamper-Evident Packing',
    defaultDesc: 'Hardware battery calibrated, sound test verified, and sealed in discreet packaging.',
  },
  dispatched: {
    index: 2,
    label: 'Dispatched',
    icon: 'local_shipping',
    progressPercent: 68,
    badgeColor: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
    statusHeadline: 'In Transit · Air Express Line',
    defaultDesc: 'Handed over to BlueDart Express cargo terminal. En route to destination city hub.',
  },
  delivered: {
    index: 3,
    label: 'Delivered',
    icon: 'task_alt',
    progressPercent: 100,
    badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    statusHeadline: 'Delivered Securely to Sanctuary',
    defaultDesc: 'Package safely received by authorized recipient via 4-digit confidential OTP.',
  },
};

export const OrderTrackingProgress: React.FC<OrderTrackingProgressProps> = ({
  profile,
  onShowToast,
}) => {
  // Available mock orders in profile
  const mockOrdersList = profile.mockOrders || (profile.activeOrder ? [profile.activeOrder] : []);

  const [selectedOrderId, setSelectedOrderId] = useState<string>(
    mockOrdersList[0]?.id || 'sv-mock-ord-1'
  );

  const selectedOrder: ProfileMockOrder | undefined =
    mockOrdersList.find((o) => o.id === selectedOrderId) || mockOrdersList[0];

  // Active step override to allow interactive testing of Placed -> Processing -> Dispatched -> Delivered
  const [stepOverride, setStepOverride] = useState<OrderTrackingStep | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [expandedLog, setExpandedLog] = useState(true);

  if (!selectedOrder) {
    return (
      <div className="luxury-card p-6 text-center space-y-2">
        <span className="material-symbols-outlined text-4xl text-on-surface-variant">local_shipping</span>
        <h4 className="font-bold text-sm text-on-surface">No Mock Orders in Profile</h4>
        <p className="text-xs text-on-surface-variant">Your sanctuary order tracking history will display here.</p>
      </div>
    );
  }

  const currentStep = stepOverride || selectedOrder.currentStep;
  const currentStepConfig = STEP_CONFIG[currentStep];
  const activeIndex = currentStepConfig.index;

  const handleCopyAWB = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(selectedOrder.trackingNumber);
      setCopiedCode(true);
      if (onShowToast) onShowToast(`Copied AWB ${selectedOrder.trackingNumber}`);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  return (
    <div className="luxury-card p-5 sm:p-7 space-y-6 border border-[#D4AF37]/35 shadow-sm">
      {/* 1. Header with Title & Multi-Order Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-outline-variant/60">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#D4AF37]">
              Live Courier Progress Monitor
            </span>
          </div>
          <h3 className="font-display font-bold text-xl sm:text-2xl text-on-surface mt-0.5">
            Order Tracking &amp; Delivery
          </h3>
          <p className="text-xs text-on-surface-variant">
            Real-time step-by-step progress visual for original safety gadgets in your profile.
          </p>
        </div>

        {/* Order switcher tabs if multiple orders exist */}
        {mockOrdersList.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
            {mockOrdersList.map((ord, idx) => (
              <button
                key={ord.id}
                type="button"
                onClick={() => {
                  setSelectedOrderId(ord.id);
                  setStepOverride(null);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                  selectedOrder.id === ord.id
                    ? 'bg-[#171412] text-[#F6F1EA] dark:bg-[#D4AF37] dark:text-[#171412] border-[#D4AF37]'
                    : 'bg-surface-container text-on-surface-variant hover:text-on-surface border-outline-variant/50'
                }`}
              >
                <span>Order #{idx + 1}</span>
                <span className="text-[10px] opacity-75 ml-1">({ord.currentStep.toUpperCase()})</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 2. Order Preview Banner Card */}
      <div className="bg-surface-container rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-16 h-16 rounded-xl overflow-hidden bg-surface-container-high shrink-0 border border-outline-variant/40">
            <ResilientImage
              src={selectedOrder.itemImageUrl || '/assets/aistudio/Image_25_9234754c.png'}
              alt={selectedOrder.itemTitle}
              className="w-full h-full object-cover"
              fallbackIcon="shield"
            />
          </div>

          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-[#D4AF37]">{selectedOrder.orderNumber}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${currentStepConfig.badgeColor}`}>
                {currentStep.toUpperCase()}
              </span>
            </div>
            <h4 className="font-bold text-sm text-on-surface truncate">{selectedOrder.itemTitle}</h4>
            <p className="text-[11px] text-on-surface-variant">{selectedOrder.itemSubtitle}</p>
            <div className="flex items-center gap-2 pt-0.5 text-xs">
              <span className="font-bold text-on-surface">₹{selectedOrder.price}</span>
              <span className="text-[11px] text-emerald-600 font-medium">✓ {selectedOrder.paymentMethod}</span>
            </div>
          </div>
        </div>

        {/* Courier & ETA Info Pill */}
        <div className="bg-surface-container-high/80 rounded-xl p-3 sm:text-right shrink-0 space-y-1 text-xs">
          <div className="flex sm:justify-end items-center gap-1.5 text-on-surface-variant">
            <span className="material-symbols-outlined text-[16px] text-blue-500">local_shipping</span>
            <span className="font-semibold text-on-surface">{selectedOrder.courierPartner}</span>
          </div>
          <div className="flex sm:justify-end items-center gap-1.5 font-mono text-[11px] text-on-surface-variant">
            <span>AWB: {selectedOrder.trackingNumber}</span>
            <button
              type="button"
              onClick={handleCopyAWB}
              className="hover:text-[#D4AF37] text-on-surface-variant"
              title="Copy AWB Tracking Number"
            >
              <span className="material-symbols-outlined text-[13px]">
                {copiedCode ? 'check' : 'content_copy'}
              </span>
            </button>
          </div>
          <p className="text-[11px] text-emerald-600 font-medium">
            Est. Arrival: {selectedOrder.estimatedDelivery}
          </p>
        </div>
      </div>

      {/* 3. CORE STEP-BY-STEP PROGRESS VISUAL (Placed -> Processing -> Dispatched -> Delivered) */}
      <div className="bg-surface-container-high/50 rounded-2xl p-5 sm:p-6 space-y-5 border border-outline-variant/40">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px] text-[#D4AF37]">timeline</span>
            <span>Step-by-Step Delivery Progress</span>
          </span>
          <span className="text-xs font-semibold text-[#D4AF37]">
            Stage {activeIndex + 1} of 4: {currentStepConfig.label}
          </span>
        </div>

        {/* Horizontal Visual Progress Stepper Bar */}
        <div className="relative pt-3 pb-6 sm:px-4">
          {/* Background Track Line */}
          <div className="absolute top-7 left-6 right-6 h-1.5 bg-outline-variant/40 rounded-full" />

          {/* Filled Active Progress Line */}
          <motion.div
            className="absolute top-7 left-6 h-1.5 rounded-full bg-gradient-to-r from-emerald-500 via-[#D4AF37] to-emerald-500 shadow-sm"
            initial={false}
            animate={{
              width: `calc(${currentStepConfig.progressPercent}% - 12px)`,
            }}
            transition={{ duration: 0.45, ease: 'easeInOut' }}
          />

          {/* 4 Steps Nodes */}
          <div className="relative flex justify-between items-start">
            {STEP_ORDER.map((stepKey, idx) => {
              const cfg = STEP_CONFIG[stepKey];
              const isCompleted = idx < activeIndex;
              const isCurrent = idx === activeIndex;
              const isUpcoming = idx > activeIndex;

              return (
                <div
                  key={stepKey}
                  className="flex flex-col items-center text-center max-w-[80px] sm:max-w-[110px]"
                >
                  {/* Step Node Circle */}
                  <motion.button
                    type="button"
                    onClick={() => setStepOverride(stepKey)}
                    whileHover={{ scale: 1.12 }}
                    whileTap={{ scale: 0.95 }}
                    className={`relative w-9 h-9 sm:w-11 sm:h-11 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm z-10 transition-all cursor-pointer shadow-md ${
                      isCompleted
                        ? 'bg-emerald-600 text-white border-2 border-emerald-500'
                        : isCurrent
                        ? 'bg-gradient-to-br from-[#171412] to-[#2D241E] dark:from-[#D4AF37] dark:to-[#B89628] text-white dark:text-black border-2 border-[#D4AF37] ring-4 ring-[#D4AF37]/25'
                        : 'bg-surface-container border-2 border-outline-variant text-on-surface-variant'
                    }`}
                    title={`Click to preview step: ${cfg.label}`}
                  >
                    {isCompleted ? (
                      <span className="material-symbols-outlined text-[18px] sm:text-[20px]">check</span>
                    ) : (
                      <span className="material-symbols-outlined text-[17px] sm:text-[19px]">{cfg.icon}</span>
                    )}

                    {/* Pulsing beacon animation on current step */}
                    {isCurrent && (
                      <span className="absolute -inset-1 rounded-full border border-[#D4AF37] animate-ping pointer-events-none opacity-60" />
                    )}
                  </motion.button>

                  {/* Step Label */}
                  <div className="mt-2.5 space-y-0.5">
                    <span
                      className={`block font-bold text-xs sm:text-sm transition-colors ${
                        isCurrent
                          ? 'text-[#D4AF37]'
                          : isCompleted
                          ? 'text-on-surface font-semibold'
                          : 'text-on-surface-variant'
                      }`}
                    >
                      {cfg.label}
                    </span>

                    {/* Step Sub-state pill */}
                    <span
                      className={`inline-block text-[10px] font-medium leading-tight ${
                        isCurrent
                          ? 'text-emerald-600 font-bold'
                          : isCompleted
                          ? 'text-on-surface-variant'
                          : 'text-on-surface-variant/70'
                      }`}
                    >
                      {isCurrent ? 'Active Now' : isCompleted ? 'Completed' : 'Upcoming'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Current Step Description Card */}
        <div className="bg-surface-container rounded-xl p-4 flex items-start gap-3 border border-outline-variant/30">
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
              activeIndex === 3
                ? 'bg-emerald-500/15 text-emerald-600'
                : 'bg-[#D4AF37]/15 text-[#D4AF37]'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">{currentStepConfig.icon}</span>
          </div>
          <div className="space-y-0.5 min-w-0">
            <h5 className="font-bold text-xs sm:text-sm text-on-surface">
              {currentStepConfig.statusHeadline}
            </h5>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              {selectedOrder.timeline.find((t) => t.step === currentStep)?.description ||
                currentStepConfig.defaultDesc}
            </p>
          </div>
        </div>

        {/* Step Preview & Simulator Selector */}
        <div className="flex items-center justify-between gap-2 flex-wrap pt-2 border-t border-outline-variant/40">
          <div className="text-[11px] text-on-surface-variant font-medium">
            Preview / Test Progress Step:
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {STEP_ORDER.map((s, idx) => (
              <button
                key={s}
                type="button"
                onClick={() => setStepOverride(s)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  currentStep === s
                    ? 'bg-[#171412] text-white dark:bg-[#D4AF37] dark:text-black shadow-sm'
                    : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {idx + 1}. {STEP_CONFIG[s].label}
              </button>
            ))}
            {stepOverride && (
              <button
                type="button"
                onClick={() => setStepOverride(null)}
                className="text-[11px] text-[#D4AF37] hover:underline font-semibold ml-1"
              >
                Reset to Live
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 4. Delivery Destination & Security Protocol */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div className="bg-surface-container rounded-xl p-3.5 space-y-1.5">
          <span className="font-bold text-on-surface flex items-center gap-1.5">
            <span className="material-symbols-outlined text-base text-[#D4AF37]">location_on</span>
            <span>Sanctuary Delivery Destination</span>
          </span>
          <p className="text-on-surface font-semibold">{profile.fullName || selectedOrder.recipientName}</p>
          <p className="text-on-surface-variant leading-relaxed">
            {profile.deliveryAddress || selectedOrder.destinationAddress}
          </p>
          <p className="text-[11px] text-on-surface-variant">Phone: {profile.phone}</p>
        </div>

        <div className="bg-surface-container rounded-xl p-3.5 space-y-1.5">
          <span className="font-bold text-on-surface flex items-center gap-1.5">
            <span className="material-symbols-outlined text-base text-emerald-600">verified_user</span>
            <span>4-Stage Confidential Protocol</span>
          </span>
          <ul className="space-y-1 text-on-surface-variant text-[11px]">
            <li className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[13px] text-emerald-500">check_circle</span>
              <span>100% Original hardware verified by Saevy Tech</span>
            </li>
            <li className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[13px] text-emerald-500">check_circle</span>
              <span>Tamper-evident confidential safety package</span>
            </li>
            <li className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[13px] text-emerald-500">check_circle</span>
              <span>Direct delivery OTP verification handover</span>
            </li>
          </ul>
        </div>
      </div>

      {/* 5. Detailed Checkpoint Timeline Log (Expandable) */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setExpandedLog((v) => !v)}
          className="w-full flex items-center justify-between text-xs font-bold text-on-surface hover:text-[#D4AF37] transition-colors py-1"
        >
          <span className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]">history</span>
            <span>Detailed Checkpoint Timeline ({selectedOrder.timeline.length} Events)</span>
          </span>
          <span className="material-symbols-outlined text-[18px]">
            {expandedLog ? 'expand_less' : 'expand_more'}
          </span>
        </button>

        {expandedLog && (
          <div className="space-y-2 pt-1">
            {selectedOrder.timeline.map((item, idx) => {
              const cfg = STEP_CONFIG[item.step];
              const isPastOrActive = idx <= activeIndex;

              return (
                <div
                  key={`${item.step}-${idx}`}
                  className={`p-3 rounded-xl border flex items-start gap-3 transition-colors ${
                    item.step === currentStep
                      ? 'bg-surface-container border-[#D4AF37]/50'
                      : 'bg-surface-container/60 border-outline-variant/30'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold ${
                      isPastOrActive
                        ? 'bg-emerald-500/15 text-emerald-600'
                        : 'bg-surface-container-high text-on-surface-variant'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">{cfg.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-xs text-on-surface">
                        {item.label} · {cfg.statusHeadline}
                      </span>
                      <span className="text-[10px] text-on-surface-variant shrink-0">{item.time}</span>
                    </div>
                    <p className="text-[11px] text-on-surface-variant leading-relaxed">{item.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
