import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

interface StealthCalculatorModalProps {
  open: boolean;
  secretPin: string;
  onUnlock: () => void;
}

export const StealthCalculatorModal: React.FC<StealthCalculatorModalProps> = ({
  open,
  secretPin,
  onUnlock,
}) => {
  const [display, setDisplay] = useState('0');
  const [expression, setExpression] = useState('');
  const [showHint, setShowHint] = useState(false);

  const handlePress = (key: string) => {
    if (key === 'C') {
      setDisplay('0');
      setExpression('');
      return;
    }

    if (key === '=') {
      if (display === secretPin || expression === secretPin) {
        setDisplay('0');
        setExpression('');
        onUnlock();
        return;
      }
      try {
        const sanitized = expression.replace(/[^0-9+\-*/.]/g, '');
        if (!sanitized) return;
        const tokens = sanitized.match(/(\d+\.?\d*|[+\-*/])/g);
        if (tokens && tokens.length >= 3) {
          let total = parseFloat(tokens[0]);
          for (let i = 1; i < tokens.length; i += 2) {
            const op = tokens[i];
            const next = parseFloat(tokens[i + 1] || '0');
            if (op === '+') total += next;
            if (op === '-') total -= next;
            if (op === '*') total *= next;
            if (op === '/') total = next !== 0 ? total / next : 0;
          }
          const formatted = Number.isFinite(total)
            ? String(Math.round(total * 10000) / 10000)
            : '0';
          setDisplay(formatted);
          setExpression(formatted);
        }
      } catch {
        setDisplay('0');
        setExpression('');
      }
      return;
    }

    if (['+', '-', '*', '/'].includes(key)) {
      setExpression((prev) => (prev || display) + key);
      setDisplay(key);
      return;
    }

    const nextDisplay =
      display === '0' || ['+', '-', '*', '/'].includes(display) ? key : display + key;
    setDisplay(nextDisplay.slice(0, 12));
    setExpression((prev) => (prev + key).slice(0, 24));
  };

  const keys = ['7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', 'C', '0', '=', '+'];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 bg-[#FFF8F0] flex flex-col items-center justify-center p-4 no-print"
          role="dialog"
          aria-modal="true"
          aria-label="Calculator Utility"
        >
          <div className="w-full max-w-sm rounded-[28px] bg-[#FFFCF8] border border-[#F0E6DC] p-6 shadow-[0_16px_48px_rgba(0,0,0,0.07)] space-y-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium tracking-widest text-[#5C544E] uppercase">
                Calculator
              </span>
              <button
                type="button"
                onClick={() => setShowHint((h) => !h)}
                className="min-h-[38px] px-3 rounded-full text-xs text-[#5C544E] hover:text-[#0A0A0A] hover:bg-[#FFF8F0] transition-colors"
              >
                {showHint ? `Enter ${secretPin} then =` : 'Passcode Hint'}
              </button>
            </div>

            <div className="rounded-[20px] bg-[#FFF8F0] p-4 text-right border border-[#F0E6DC]">
              <div className="text-xs text-[#5C544E] h-4 truncate tabular-nums">
                {expression || ' '}
              </div>
              <div className="text-3xl font-semibold text-[#0A0A0A] tracking-wider tabular-nums mt-1 truncate">
                {display}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2.5">
              {keys.map((k) => {
                const isAction = ['/', '*', '-', '+', '='].includes(k);
                const isClear = k === 'C';
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => handlePress(k)}
                    className={`min-h-[56px] rounded-full text-lg font-medium transition-all active:scale-95 focus-visible:outline-2 focus-visible:outline-[#D4AF37] ${
                      k === '='
                        ? 'bg-[#0A0A0A] text-[#FFFCF8] border border-[#D4AF37]/40 shadow-sm'
                        : isAction
                          ? 'bg-[#FBF4DF] text-[#0A0A0A] border border-[#D4AF37]/30'
                          : isClear
                            ? 'bg-[#FFE4E6] text-[#5E111E]'
                            : 'bg-[#FFF8F0] text-[#0A0A0A] border border-[#F0E6DC] hover:border-[#D4AF37]/40'
                    }`}
                  >
                    {k}
                  </button>
                );
              })}
            </div>

            <div className="pt-1 flex items-center justify-between text-xs text-[#5C544E]">
              <span>Enter {secretPin} + &ldquo;=&rdquo; to return</span>
              <button
                type="button"
                onClick={onUnlock}
                className="underline hover:text-[#0A0A0A] min-h-[36px] px-2 font-medium"
              >
                Return
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
