import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { STITCH_ASSETS } from '../data/demoData';
import { ResilientImage } from './ResilientImage';

interface SplashAuthModalProps {
  open: boolean;
  onClose: () => void;
  onAuthenticated: (phone: string) => void;
}

export const SplashAuthModal: React.FC<SplashAuthModalProps> = ({
  open,
  onClose,
  onAuthenticated,
}) => {
  const [step, setStep] = useState<'splash' | 'phone' | 'otp'>('splash');
  const [phone, setPhone] = useState('+91 98765 01420');
  const [otp, setOtp] = useState('4829');
  const [error, setError] = useState('');

  const handleRequestOtp = (e: React.FormEvent) => {
    e.preventDefault();
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 8) {
      setError('Please enter a valid mobile number (at least 8 digits).');
      return;
    }
    setError('');
    setStep('otp');
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.trim().length < 4) {
      setError('Enter the 4-digit verification code (e.g., 4829).');
      return;
    }
    setError('');
    onAuthenticated(phone.trim());
    setStep('splash');
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A0A0A]/35 backdrop-blur-xl no-print"
          role="dialog"
          aria-modal="true"
          aria-label="Saevy Private Member Sign-In"
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
            className="relative w-full max-w-md rounded-[28px] bg-[#FFFCF8] border border-[#F0E6DC] p-6 sm:p-8 shadow-[0_24px_64px_rgba(10,10,10,0.12)] overflow-hidden"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-medium text-[#B76E79] tracking-[0.16em] uppercase">
                Maison Member Salon
              </span>
              <button
                type="button"
                onClick={onClose}
                className="min-w-[44px] min-h-[44px] -mr-2 rounded-full flex items-center justify-center text-[#5C544E] hover:text-[#0A0A0A] hover:bg-[#FFF8F0] active:scale-95 transition-all"
                aria-label="Close member sign-in"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <AnimatePresence mode="wait">
              {step === 'splash' && (
                <motion.div
                  key="splash"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18 }}
                  className="flex flex-col items-center text-center py-4 space-y-6"
                >
                  <div className="w-32 h-32 rounded-[28px] bg-gradient-to-br from-[#FFF8F0] via-[#FFFCF8] to-[#FFE4E6]/50 border border-[#D4AF37]/40 shadow-[0_12px_32px_rgba(212,175,55,0.14)] flex flex-col items-center justify-center p-4">
                    <ResilientImage
                      src={STITCH_ASSETS.logoEmblem}
                      alt="Saevy Maison Emblem"
                      className="w-20 h-20 object-contain"
                      fallbackIcon="diamond"
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs tracking-[0.22em] text-[#B76E79] uppercase">
                      Serene Protection By
                    </p>
                    <h2 className="font-display text-3xl font-bold tracking-[0.08em] text-[#0A0A0A] border-b border-[#D4AF37]/50 pb-1.5 inline-block">
                      Saevy
                    </h2>
                    <p className="text-xs text-[#5C544E] max-w-xs mx-auto pt-2 leading-relaxed">
                      Personal safety sanctuary, wellness concierge, and fine wearable atelier stored privately on your device.
                    </p>
                  </div>

                  <div className="pt-2 w-full flex flex-col items-center space-y-3">
                    <button
                      type="button"
                      onClick={() => setStep('phone')}
                      className="btn-luxury w-full px-6 text-sm font-medium flex items-center justify-center gap-2"
                    >
                      <span className="material-symbols-outlined text-[18px] text-[#D4AF37]">
                        key
                      </span>
                      <span>Sign In with Mobile Passcode</span>
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="min-h-[44px] px-4 text-xs text-[#5C544E] hover:text-[#0A0A0A] underline underline-offset-4 transition-colors"
                    >
                      Continue to Sanctuary
                    </button>
                  </div>
                </motion.div>
              )}

              {step === 'phone' && (
                <motion.form
                  key="phone"
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.18 }}
                  onSubmit={handleRequestOtp}
                  className="space-y-5 py-2"
                  noValidate
                >
                  <div>
                    <h3 className="font-display text-2xl font-bold text-[#0A0A0A]">
                      Mobile Verification
                    </h3>
                    <p className="text-xs text-[#5C544E] mt-1">
                      Enter your mobile number to generate a local session code.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="demo-phone-input"
                      className="block text-xs font-medium text-[#0A0A0A]"
                    >
                      Mobile Number
                    </label>
                    <input
                      id="demo-phone-input"
                      type="tel"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        if (error) setError('');
                      }}
                      placeholder="+91 98765 01420"
                      className="w-full min-h-[52px] px-4 rounded-2xl bg-[#FFF8F0] border border-[#F0E6DC] text-[#0A0A0A] text-sm focus:outline-none focus:border-[#D4AF37] transition-colors"
                      required
                    />
                    {error && <p className="text-xs text-[#9E2A3B]">{error}</p>}
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setError('');
                        setStep('splash');
                      }}
                      className="btn-luxury-outline px-5 text-sm font-medium"
                    >
                      Back
                    </button>
                    <button type="submit" className="btn-luxury flex-1 px-6 text-sm font-medium">
                      Request Passcode
                    </button>
                  </div>
                </motion.form>
              )}

              {step === 'otp' && (
                <motion.form
                  key="otp"
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.18 }}
                  onSubmit={handleVerifyOtp}
                  className="space-y-5 py-2"
                  noValidate
                >
                  <div>
                    <h3 className="font-display text-2xl font-bold text-[#0A0A0A]">
                      Enter Passcode
                    </h3>
                    <p className="text-xs text-[#5C544E] mt-1">
                      Passcode <span className="text-[#D4AF37] font-semibold">4829</span> prepared for {phone}.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="demo-otp-input"
                      className="block text-xs font-medium text-[#0A0A0A]"
                    >
                      4-Digit Passcode
                    </label>
                    <input
                      id="demo-otp-input"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => {
                        setOtp(e.target.value);
                        if (error) setError('');
                      }}
                      className="w-full min-h-[52px] px-4 rounded-2xl bg-[#FFF8F0] border border-[#F0E6DC] text-[#0A0A0A] text-lg tracking-[0.35em] font-semibold text-center tabular-nums focus:outline-none focus:border-[#D4AF37]"
                      required
                    />
                    {error && <p className="text-xs text-[#9E2A3B]">{error}</p>}
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setError('');
                        setStep('phone');
                      }}
                      className="btn-luxury-outline px-5 text-sm font-medium"
                    >
                      Back
                    </button>
                    <button type="submit" className="btn-luxury flex-1 px-6 text-sm font-medium">
                      Enter Sanctuary
                    </button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
