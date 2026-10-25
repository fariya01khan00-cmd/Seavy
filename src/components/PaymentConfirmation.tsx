import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { OrderRecord } from '../types';
import { ResilientImage } from './ResilientImage';

export interface PaymentConfirmationProps {
  order: OrderRecord;
  onBackToCatalog: () => void;
  onTrackOrder?: (orderId: string) => void;
  onShowToast?: (msg: string) => void;
}

export const PaymentConfirmation: React.FC<PaymentConfirmationProps> = ({
  order,
  onBackToCatalog,
  onTrackOrder,
  onShowToast,
}) => {
  const [copiedOrderId, setCopiedOrderId] = useState(false);
  const [previewMode, setPreviewMode] = useState<'actual' | 'cash' | 'card' | 'upi' | 'emi'>('actual');
  const shimmerCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Determine actual payment type from order data
  const detectedType: 'cash' | 'card' | 'upi' | 'emi' =
    order.paymentType ||
    (order.paymentMethod?.toLowerCase().includes('cash') || order.paymentMethod?.toLowerCase().includes('cod')
      ? 'cash'
      : order.paymentMethod?.toLowerCase().includes('card')
      ? 'card'
      : order.paymentMethod?.toLowerCase().includes('emi')
      ? 'emi'
      : 'upi');

  const effectiveType = previewMode === 'actual' ? detectedType : previewMode;

  const isCash = effectiveType === 'cash';
  const isCard = effectiveType === 'card';
  const isUpi = effectiveType === 'upi';
  const isEmi = effectiveType === 'emi';

  // Shimmer celebratory canvas
  useEffect(() => {
    const canvas = shimmerCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    const width = (canvas.width = canvas.offsetWidth || 400);
    const height = (canvas.height = 200);
    const colors = isCash ? ['#D4AF37', '#E5A93C', '#F3D27E'] : ['#10B981', '#34D399', '#D4AF37'];

    const particles = Array.from({ length: 32 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 2.5 + 1,
      vy: -Math.random() * 0.45 - 0.2,
      vx: (Math.random() - 0.5) * 0.2,
      alpha: Math.random() * 0.65 + 0.2,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      for (const p of particles) {
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        p.y += p.vy;
        p.x += p.vx;
        if (p.y < 0) {
          p.y = height;
          p.x = Math.random() * width;
        }
      }
      animId = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(animId);
  }, [isCash, effectiveType]);

  const handleCopyOrderId = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(order.orderNumber);
      setCopiedOrderId(true);
      if (onShowToast) onShowToast(`Copied ${order.orderNumber}`);
      setTimeout(() => setCopiedOrderId(false), 2000);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-2xl mx-auto space-y-5"
    >
      {/* 1. HERO CELEBRATION & STATUS BANNER */}
      <div className="luxury-card p-6 sm:p-8 text-center space-y-4 relative overflow-hidden border border-[#D4AF37]/40 shadow-xl">
        <canvas ref={shimmerCanvasRef} className="absolute inset-0 pointer-events-none" />

        {/* Animated Checkmark / Status Orb */}
        <div
          className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center border-2 transition-transform hover:scale-105 ${
            isCash
              ? 'bg-amber-500/15 border-amber-500 text-amber-500 dark:text-amber-400'
              : 'bg-emerald-500/15 border-emerald-500 text-emerald-500'
          }`}
        >
          <span className="material-symbols-outlined text-4xl font-bold">
            {isCash ? 'local_shipping' : isCard ? 'credit_card' : isEmi ? 'calendar_month' : 'verified_user'}
          </span>
        </div>

        <div className="space-y-1 relative z-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase shadow-sm">
            <span
              className={`w-2 h-2 rounded-full animate-pulse ${
                isCash ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
            />
            <span
              className={
                isCash
                  ? 'text-amber-800 dark:text-amber-300'
                  : isCard
                  ? 'text-indigo-800 dark:text-indigo-300'
                  : isEmi
                  ? 'text-purple-800 dark:text-purple-300'
                  : 'text-emerald-800 dark:text-emerald-300'
              }
            >
              {isCash
                ? 'Cash on Delivery Confirmed'
                : isCard
                ? 'Card Payment Successful'
                : isEmi
                ? 'EMI Plan Approved & Active'
                : 'UPI Payment Cleared'}
            </span>
          </div>

          <h2 className="font-display font-bold text-2xl sm:text-3xl text-on-surface">
            {isCash ? 'Order Confirmed · Pay at Doorstep' : 'Payment Successful!'}
          </h2>

          <p className="text-xs sm:text-sm text-on-surface-variant max-w-md mx-auto">
            {isCash
              ? 'Your authentic safety gadgets are reserved & queued for express packing. Pay securely upon package delivery.'
              : 'Your transaction was authenticated securely. Your original safety gear is confirmed and preparing for priority dispatch.'}
          </p>
        </div>

        {/* Order Quick Metadata Pills */}
        <div className="flex items-center justify-center gap-3 flex-wrap pt-1 text-xs text-on-surface-variant relative z-10">
          <span className="flex items-center gap-1 bg-surface-container px-2.5 py-1 rounded-lg">
            <span className="material-symbols-outlined text-[15px] text-[#D4AF37]">schedule</span>
            <span>{order.createdAt}</span>
          </span>
          <span className="flex items-center gap-1 bg-surface-container px-2.5 py-1 rounded-lg">
            <span className="material-symbols-outlined text-[15px] text-emerald-600">verified</span>
            <span>Status: Confirmed</span>
          </span>
          <span className="flex items-center gap-1 bg-surface-container px-2.5 py-1 rounded-lg">
            <span className="material-symbols-outlined text-[15px] text-blue-500">local_shipping</span>
            <span>{order.courierPartner}</span>
          </span>
        </div>

        {/* Payment Confirmation Mode Switcher (Allows testing all 4 payment confirmation types) */}
        <div className="pt-3 border-t border-outline-variant/40 relative z-10">
          <div className="flex items-center justify-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-on-surface-variant font-medium mr-1">Preview Payment Mode:</span>
            <button
              type="button"
              onClick={() => setPreviewMode('actual')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                previewMode === 'actual'
                  ? 'bg-[#171412] text-[#F6F1EA] dark:bg-[#D4AF37] dark:text-[#171412]'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Order Method ({detectedType.toUpperCase()})
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode('cash')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                previewMode === 'cash'
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Cash (COD)
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode('card')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                previewMode === 'card'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Card
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode('upi')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                previewMode === 'upi'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
              }`}
            >
              UPI
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode('emi')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                previewMode === 'emi'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
              }`}
            >
              EMI
            </button>
          </div>
        </div>
      </div>

      {/* 2. TAILORED CONFIRMATION FOR THE SELECTED PAYMENT METHOD */}
      {isCash && (
        <div className="luxury-card p-5 border-l-4 border-amber-500 space-y-3 bg-gradient-to-br from-amber-50/50 to-transparent dark:from-amber-950/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-2xl text-amber-500">payments</span>
              <div>
                <h4 className="font-bold text-sm text-on-surface">Cash on Delivery (COD) Verified</h4>
                <p className="text-[11px] text-on-surface-variant">Pay safely at your sanctuary address upon package handover</p>
              </div>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              ₹0 Charged Today
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 text-xs">
            <div className="bg-surface-container p-3 rounded-xl">
              <span className="text-[11px] text-on-surface-variant block">Total Cash Due at Doorstep</span>
              <span className="text-xl font-black text-amber-600 dark:text-amber-400 font-mono">
                ₹{order.totalAmount}
              </span>
              <span className="text-[10px] text-on-surface-variant block mt-0.5">Exact change or contactless UPI accepted</span>
            </div>

            <div className="bg-surface-container p-3 rounded-xl">
              <span className="text-[11px] text-on-surface-variant block">Doorstep Payment Flexibility</span>
              <span className="font-semibold text-on-surface block mt-0.5">Physical Cash or UPI QR Code</span>
              <span className="text-[10px] text-emerald-600 font-medium block">Verified BlueDart agent carries official QR terminal</span>
            </div>

            <div className="sm:col-span-2 bg-surface-container p-3 rounded-xl flex items-start gap-2">
              <span className="material-symbols-outlined text-base text-amber-600 shrink-0 mt-0.5">security</span>
              <div className="text-[11px] text-on-surface-variant leading-relaxed">
                <span className="font-semibold text-on-surface">Discreet Safe Packaging:</span> Shipped in tamper-evident confidential packaging. The delivery executive will only hand over the parcel after verifying your private 4-digit OTP.
              </div>
            </div>
          </div>
        </div>
      )}

      {isCard && (
        <div className="luxury-card p-5 border-l-4 border-indigo-500 space-y-3 bg-gradient-to-br from-indigo-50/50 to-transparent dark:from-indigo-950/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-2xl text-indigo-500">credit_card</span>
              <div>
                <h4 className="font-bold text-sm text-on-surface">Card Payment Approved &amp; Settled</h4>
                <p className="text-[11px] text-on-surface-variant">Encrypted 256-bit bank gateway confirmation</p>
              </div>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              Paid in Full
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 text-xs">
            <div className="bg-surface-container p-3 rounded-xl">
              <span className="text-[11px] text-on-surface-variant block">Card Charged</span>
              <span className="font-mono font-bold text-sm text-on-surface block mt-0.5">
                •••• •••• •••• {order.paymentDetails?.cardLast4 || '8821'}
              </span>
              <span className="text-[10px] text-on-surface-variant block">
                {order.paymentDetails?.cardNetwork || 'Visa / RuPay / Mastercard Secured'}
              </span>
            </div>

            <div className="bg-surface-container p-3 rounded-xl">
              <span className="text-[11px] text-on-surface-variant block">Gateway Authorization Ref</span>
              <span className="font-mono font-bold text-sm text-indigo-600 dark:text-indigo-400 block mt-0.5">
                {order.paymentDetails?.authCode || 'AUTH-948210'}
              </span>
              <span className="text-[10px] text-emerald-600 font-medium block">RBI 3D-Secure 2.0 Tokenized Approval</span>
            </div>

            <div className="sm:col-span-2 bg-surface-container p-3 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-[11px] text-on-surface-variant block">Total Settled via Card</span>
                <span className="text-base font-bold text-emerald-600">₹{order.totalAmount}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                <span className="material-symbols-outlined text-emerald-500 text-sm">lock</span>
                <span>Zero liability buyer protection applied</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {isUpi && (
        <div className="luxury-card p-5 border-l-4 border-emerald-500 space-y-3 bg-gradient-to-br from-emerald-50/50 to-transparent dark:from-emerald-950/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-2xl text-emerald-500">account_balance_wallet</span>
              <div>
                <h4 className="font-bold text-sm text-on-surface">UPI Payment Cleared Instantly</h4>
                <p className="text-[11px] text-on-surface-variant">Real-time NPCI unified payments settlement</p>
              </div>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              Settled Instantly
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 text-xs">
            <div className="bg-surface-container p-3 rounded-xl">
              <span className="text-[11px] text-on-surface-variant block">UPI Handle / App</span>
              <span className="font-bold text-sm text-on-surface block mt-0.5">
                {order.paymentDetails?.upiAppOrId || 'Google Pay (UPI)'}
              </span>
              <span className="text-[10px] text-emerald-600 font-medium block">Verified Merchant Account</span>
            </div>

            <div className="bg-surface-container p-3 rounded-xl">
              <span className="text-[11px] text-on-surface-variant block">Bank Reference (UTR Number)</span>
              <span className="font-mono font-bold text-xs text-on-surface block mt-0.5">
                {order.paymentDetails?.utrNumber || 'UTR928410294821'}
              </span>
              <span className="text-[10px] text-on-surface-variant block">Bank-to-bank electronic clearance</span>
            </div>

            <div className="sm:col-span-2 bg-surface-container p-3 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-[11px] text-on-surface-variant block">Total Debited via UPI</span>
                <span className="text-base font-bold text-emerald-600">₹{order.totalAmount}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                <span className="material-symbols-outlined text-emerald-500 text-sm">check_circle</span>
                <span>Immediate bank clearance acknowledgement</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {isEmi && (
        <div className="luxury-card p-5 border-l-4 border-purple-500 space-y-3 bg-gradient-to-br from-purple-50/50 to-transparent dark:from-purple-950/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-2xl text-purple-500">calendar_month</span>
              <div>
                <h4 className="font-bold text-sm text-on-surface">EMI Installment Plan Activated</h4>
                <p className="text-[11px] text-on-surface-variant">Zero down payment today · Easy auto-debited monthly installments</p>
              </div>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
              EMI Active
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 text-xs">
            <div className="bg-surface-container p-3 rounded-xl">
              <span className="text-[11px] text-on-surface-variant block">Issuing Bank &amp; Tenure</span>
              <span className="font-bold text-sm text-on-surface block mt-0.5">
                {order.paymentDetails?.emiBank || 'HDFC Bank Credit Card'}
              </span>
              <span className="text-[10px] text-[#D4AF37] font-semibold block">
                Plan: {order.paymentDetails?.emiTenure || '3 Months'}
              </span>
            </div>

            <div className="bg-surface-container p-3 rounded-xl">
              <span className="text-[11px] text-on-surface-variant block">Monthly Installment</span>
              <span className="text-lg font-bold text-purple-600 dark:text-purple-400 font-mono block mt-0.5">
                ₹{order.paymentDetails?.emiMonthlyAmount || Math.round(order.totalAmount / 3)} / month
              </span>
              <span className="text-[10px] text-on-surface-variant block">Auto-debited on credit card billing cycle</span>
            </div>

            <div className="sm:col-span-2 bg-surface-container p-3 rounded-xl flex items-start gap-2">
              <span className="material-symbols-outlined text-base text-purple-600 shrink-0 mt-0.5">event_repeat</span>
              <div className="text-[11px] text-on-surface-variant leading-relaxed">
                <span className="font-semibold text-on-surface">First Billing Statement:</span> The first installment of ₹{order.paymentDetails?.emiMonthlyAmount || Math.round(order.totalAmount / 3)} will be billed on your regular credit card cycle. No cash is needed at delivery.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. ORDER DETAILS, SHIPPING SANCTUARY & ITEMS BREAKDOWN */}
      <div className="luxury-card p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-outline-variant/60">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Official Order ID</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="font-mono font-bold text-sm text-[#D4AF37]">{order.orderNumber}</span>
              <button
                type="button"
                onClick={handleCopyOrderId}
                className="text-[11px] text-on-surface-variant hover:text-[#D4AF37] flex items-center gap-0.5 transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">
                  {copiedOrderId ? 'check' : 'content_copy'}
                </span>
                <span>{copiedOrderId ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Estimated Delivery</span>
            <p className="font-semibold text-xs text-on-surface mt-0.5">{order.estimatedDelivery}</p>
          </div>
        </div>

        {/* Delivery Address & Courier Partner Details */}
        <div className="bg-surface-container rounded-xl p-3.5 space-y-2 text-xs">
          <div className="flex items-start gap-2">
            <span className="material-symbols-outlined text-lg text-[#D4AF37] shrink-0 mt-0.5">location_on</span>
            <div>
              <span className="font-semibold text-on-surface block">
                {order.recipientName ? `${order.recipientName} · ` : ''}{order.deliveryAddress}
              </span>
              {order.recipientPhone && (
                <span className="text-[11px] text-on-surface-variant">Contact: {order.recipientPhone}</span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-outline-variant/30 text-[11px] text-on-surface-variant">
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-emerald-600">local_shipping</span>
              <span>Courier: {order.courierPartner}</span>
            </span>
            <span className="font-mono">AWB: {order.trackingNumber}</span>
          </div>
        </div>

        {/* Ordered Gadgets List */}
        <div className="space-y-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant block">
            Purchased Safety Hardware ({order.items.length} items)
          </span>
          <div className="space-y-2">
            {order.items.map((item, idx) => (
              <div
                key={`${item.productId}-${idx}`}
                className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-surface-container"
              >
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-surface-container-high shrink-0">
                  <ResilientImage
                    src={item.imageUrl}
                    alt={item.title}
                    className="w-full h-full object-cover"
                    fallbackIcon="shield"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h5 className="font-semibold text-xs text-on-surface truncate">{item.title}</h5>
                  <span className="text-[11px] text-on-surface-variant">Qty: {item.quantity}</span>
                </div>
                <span className="font-bold text-xs text-on-surface">₹{item.price * item.quantity}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Price Breakdown */}
        <div className="pt-2 border-t border-outline-variant/40 space-y-1 text-xs">
          <div className="flex justify-between text-on-surface-variant">
            <span>Insured Express Courier</span>
            <span className="text-emerald-600 font-semibold">FREE</span>
          </div>
          <div className="flex justify-between font-bold text-sm text-on-surface pt-1 border-t border-outline-variant/30">
            <span>{isCash ? 'Total Due on Delivery' : 'Total Amount Paid'}</span>
            <span className="text-base font-bold text-[#D4AF37]">₹{order.totalAmount}</span>
          </div>
        </div>
      </div>

      {/* 4. PRIMARY & SECONDARY ACTIONS (Back to Catalog is Primary!) */}
      <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
        <button
          type="button"
          onClick={onBackToCatalog}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#171412] via-[#241E34] to-[#171412] dark:from-[#D4AF37] dark:via-[#F5D97E] dark:to-[#D4AF37] text-[#F6F1EA] dark:text-[#171412] text-sm font-bold flex items-center justify-center gap-2 shadow-lg active:scale-98 transition-all hover:opacity-95"
        >
          <span className="material-symbols-outlined text-[18px]">storefront</span>
          <span>Back to Catalog</span>
        </button>

        {onTrackOrder && (
          <button
            type="button"
            onClick={() => onTrackOrder(order.id)}
            className="w-full py-3.5 rounded-xl bg-surface-container text-on-surface text-sm font-semibold hover:bg-surface-container-high transition-colors flex items-center justify-center gap-2 border border-outline-variant/60 active:scale-98"
          >
            <span className="material-symbols-outlined text-[18px] text-emerald-600">location_searching</span>
            <span>Track Order Live</span>
          </button>
        )}

        <button
          type="button"
          onClick={handlePrint}
          className="w-full sm:w-auto px-4 py-3.5 rounded-xl bg-surface-container text-on-surface text-xs font-medium hover:bg-surface-container-high transition-colors flex items-center justify-center gap-1.5 shrink-0"
          title="Print or Save Official Receipt"
        >
          <span className="material-symbols-outlined text-[16px]">print</span>
          <span>Print</span>
        </button>
      </div>
    </motion.div>
  );
};
