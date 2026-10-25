import React, { useState } from 'react';

interface ResilientImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackIcon?: string;
  fallbackLabel?: string;
}

export const ResilientImage: React.FC<ResilientImageProps> = ({
  src,
  alt,
  className = '',
  fallbackIcon = 'diamond',
  fallbackLabel,
}) => {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#FFF8F0] via-[#FFE4E6]/35 to-[#F8EFE6] text-[#B76E79] ${className}`}
        role="img"
        aria-label={alt}
      >
        <span className="material-symbols-outlined text-[24px] text-[#D4AF37]">{fallbackIcon}</span>
        {fallbackLabel && (
          <span className="mt-1 text-[10px] font-medium text-[#5C544E] text-center px-2">
            {fallbackLabel}
          </span>
        )}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};
