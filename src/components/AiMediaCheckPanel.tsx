import React, { useRef, useState } from 'react';
import { apiFetch } from '../config/api';

interface AiMediaCheckPanelProps {
  aiConnected: boolean;
  aiModel: string | null;
  aiMissingReason: string | null;
  uiLang: 'en' | 'hi';
  onShowToast: (msg: string) => void;
}

interface AnalysisResult {
  classification: 'caution_indicators' | 'no_obvious_coercion' | 'inconclusive';
  summary: string;
  observedPatterns: string[];
  limitationsNote: string;
  recommendedSteps: string[];
  model: string;
}

export const AiMediaCheckPanel: React.FC<AiMediaCheckPanelProps> = ({
  aiConnected,
  aiModel,
  aiMissingReason,
  uiLang,
  onShowToast,
}) => {
  const [textContent, setTextContent] = useState('');
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageFileName, setImageFileName] = useState<string>('');
  const [consentGiven, setConsentGiven] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please select a PNG, JPEG, or WebP screenshot image.');
      return;
    }
    if (file.size > 3.5 * 1024 * 1024) {
      setErrorMsg('Please select an image smaller than 3.5 MB.');
      return;
    }
    setErrorMsg(null);
    setResult(null);
    setConsentGiven(false);
    setImageFileName(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImagePreviewUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleClear = () => {
    setTextContent('');
    setImagePreviewUrl(null);
    setImageFileName('');
    setConsentGiven(false);
    setErrorMsg(null);
    setResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onShowToast('Cleared previewed content and review summary');
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiConnected) {
      setErrorMsg(aiMissingReason || 'Analysis not connected.');
      return;
    }
    if (!textContent.trim() && !imagePreviewUrl) {
      setErrorMsg('Paste message text or choose a screenshot image to preview first.');
      return;
    }
    if (!consentGiven) {
      setErrorMsg(
        'Explicit consent is required before sending text or uploaded images for assistive review.'
      );
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setResult(null);

    try {
      const response = await apiFetch('/api/ai/analyze-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consentGiven: true,
          textContent: textContent.trim(),
          imageDataUrl: imagePreviewUrl || undefined,
          language: uiLang,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || `Request failed (${response.status})`);
      }

      setResult(data as AnalysisResult);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not complete analysis.');
    } finally {
      setLoading(false);
    }
  };

  const hasContentToPreview = Boolean(textContent.trim() || imagePreviewUrl);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Safety Scanner Header & Capability Transparency */}
      <div className="luxury-card p-6 sm:p-7 space-y-5">
        <div className="space-y-1">
          <span className="text-xs font-medium text-[#B76E79] tracking-[0.14em]">
            Discreet Digital Safety Scanner
          </span>
          <h2 className="font-display text-[28px] font-bold tracking-wide text-[#0A0A0A] leading-tight">
            Message &amp; Screenshot Review
          </h2>
          <p className="text-xs sm:text-sm text-[#5C544E] leading-relaxed">
            Calm assistive review for suspicious coercion cues, urgency pressure, or impersonation scripts—with transparent scope.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
          <div className="p-4 rounded-[20px] bg-[#FAF3EB]/65 border border-[#F0E6DC] space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-[#0A0A0A]">1. Safety &amp; Helpline Concierge</span>
              <span className="text-[11px] font-medium text-[#3E6B4E]">
                {aiConnected ? `Active (${aiModel || 'Gemini'})` : 'Offline'}
              </span>
            </div>
            <p className="text-[#5C544E] leading-relaxed">
              Server-side guidance via <code>/api/ai/chat</code> with private server credentials.
            </p>
          </div>

          <div className="p-4 rounded-[20px] bg-[#FAF3EB]/65 border border-[#F0E6DC] space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-[#0A0A0A]">2. Coercion Cue Scanner</span>
              <span className="text-[11px] font-medium text-[#3E6B4E]">
                {aiConnected ? 'Active with Consent' : 'Offline'}
              </span>
            </div>
            <p className="text-[#5C544E] leading-relaxed">
              Reviews text or screenshots for pressure patterns while allowing inconclusive outcomes.
            </p>
          </div>

          <div className="p-4 rounded-[20px] bg-[#FAF3EB]/45 border border-[#F0E6DC] space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-[#0A0A0A]">3. Acoustic Voice Forensics</span>
              <span className="text-[11px] text-[#8C6D1F]">Not connected</span>
            </div>
            <p className="text-[#5C544E] leading-relaxed">
              Browser tools do not certify voiceprints or guarantee audio authenticity.
            </p>
          </div>

          <div className="p-4 rounded-[20px] bg-[#FAF3EB]/45 border border-[#F0E6DC] space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-[#0A0A0A]">4. Caller Identity Lookup</span>
              <span className="text-[11px] text-[#8C6D1F]">Not connected</span>
            </div>
            <p className="text-[#5C544E] leading-relaxed">
              Independent of subscriber databases; never names or accuses individuals.
            </p>
          </div>
        </div>
      </div>

      {/* Interactive Consented Scanner Card */}
      <div className="luxury-card p-6 sm:p-7 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-display text-2xl font-bold text-[#0A0A0A]">
              Inspect Suspicious Message or Screenshot
            </h3>
            <p className="text-xs text-[#5C544E]">
              Nothing leaves your screen until you preview and confirm consent below.
            </p>
          </div>
        </div>

        {!aiConnected ? (
          <div className="luxury-card-blush p-4 text-xs text-[#0A0A0A]">
            <strong>Scanner offline:</strong>{' '}
            {aiMissingReason ||
              'Configure GEMINI_API_KEY in Settings > Secrets to enable assistive pattern review.'}
          </div>
        ) : (
          <form onSubmit={handleAnalyze} noValidate className="space-y-4">
            <div>
              <label
                htmlFor="coercion-message-text"
                className="block text-xs font-medium text-[#0A0A0A] mb-1.5"
              >
                Suspicious SMS or Chat Excerpt
              </label>
              <textarea
                id="coercion-message-text"
                rows={3}
                value={textContent}
                onChange={(e) => {
                  setTextContent(e.target.value);
                  setConsentGiven(false);
                }}
                placeholder='e.g., "Stay on video call and transfer a verification deposit immediately..."'
                className="w-full p-4 rounded-[20px] bg-[#FAF3EB]/65 border border-[#F0E6DC] text-sm text-[#0A0A0A] placeholder:text-[#5C544E]/60 focus:outline-none focus:border-[#D4AF37]"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-[#5C544E]">
                Optional Screenshot (PNG, JPEG, or WebP · up to 3.5 MB)
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleImageSelect}
                  className="text-xs text-[#5C544E] file:mr-3 file:py-2.5 file:px-5 file:rounded-full file:border file:border-[#F0E6DC] file:text-xs file:font-medium file:bg-[#FFFCF8] file:text-[#0A0A0A] hover:file:border-[#D4AF37] file:cursor-pointer"
                />
                {imageFileName && (
                  <span className="text-xs text-[#8C6D1F] truncate max-w-[220px]">
                    Selected: {imageFileName}
                  </span>
                )}
              </div>
            </div>

            {hasContentToPreview && (
              <div className="luxury-card-sage p-5 space-y-3 text-xs">
                <div className="font-semibold text-[#0A0A0A]">
                  Preview Before Consented Review
                </div>
                {textContent.trim() && (
                  <div className="p-3 rounded-[16px] bg-[#FFFCF8] border border-[#F0E6DC] text-[#0A0A0A] break-words">
                    <span className="text-[#5C544E] block text-[11px] mb-0.5">
                      Excerpt ({textContent.trim().length} characters):
                    </span>
                    {textContent.trim()}
                  </div>
                )}
                {imagePreviewUrl && (
                  <div className="space-y-1.5">
                    <span className="text-[#5C544E] block text-[11px]">
                      Screenshot ({imageFileName}):
                    </span>
                    <img
                      src={imagePreviewUrl}
                      alt="Selected screenshot preview before consent"
                      className="max-h-40 rounded-[16px] border border-[#F0E6DC] object-contain bg-[#FFFCF8] p-1"
                    />
                  </div>
                )}

                <p className="text-[#5C544E] leading-relaxed">
                  Assistive review highlights common pressure cues and may return <strong>Inconclusive</strong>. Avoid uploading personal identity cards or private medical files.
                </p>

                <label className="flex items-start gap-2.5 cursor-pointer select-none text-[#0A0A0A] pt-1">
                  <input
                    type="checkbox"
                    checked={consentGiven}
                    onChange={(e) => setConsentGiven(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-[#0A0A0A] rounded shrink-0"
                  />
                  <span>
                    I consent to sending the previewed content above for assistive safety cue review.
                  </span>
                </label>
              </div>
            )}

            {errorMsg && (
              <div className="luxury-card-blush p-3.5 text-xs text-[#9E2A3B]" role="alert">
                {errorMsg}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={loading || !hasContentToPreview || !consentGiven}
                className="btn-luxury px-7 font-medium text-xs sm:text-sm flex items-center gap-2 disabled:opacity-45 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-[18px] text-[#D4AF37]">
                  policy
                </span>
                <span>{loading ? 'Reviewing Cues...' : 'Scan With Consent'}</span>
              </button>

              {(hasContentToPreview || result) && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="btn-luxury-outline px-5 text-xs font-medium"
                >
                  Clear Scanner
                </button>
              )}
            </div>
          </form>
        )}

        {result && (
          <div
            className={`p-6 space-y-4 text-xs sm:text-sm ${
              result.classification === 'caution_indicators'
                ? 'luxury-card-blush'
                : 'luxury-card-sage'
            }`}
          >
            <div className="flex items-center justify-between flex-wrap gap-2 border-b border-[#F0E6DC] pb-3">
              <span className="font-display text-lg font-bold text-[#0A0A0A]">
                Scanner Review Summary
              </span>
              <span className="text-xs font-semibold text-[#8C6D1F]">
                {result.classification === 'caution_indicators'
                  ? 'Caution Cues Noted'
                  : result.classification === 'no_obvious_coercion'
                    ? 'No Obvious Coercion Cues'
                    : 'Inconclusive'}
              </span>
            </div>

            <p className="text-[#0A0A0A] leading-relaxed">{result.summary}</p>

            {result.observedPatterns.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-[#0A0A0A]">Observed Cues</div>
                <ul className="list-disc pl-5 space-y-1 text-xs text-[#5C544E]">
                  {result.observedPatterns.map((p, idx) => (
                    <li key={idx}>{p}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.recommendedSteps.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-[#8C6D1F]">
                  Independent Verification Steps
                </div>
                <ul className="list-disc pl-5 space-y-1 text-xs text-[#5C544E]">
                  {result.recommendedSteps.map((s, idx) => (
                    <li key={idx}>{s}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="p-3.5 rounded-[16px] bg-[#FFFCF8]/80 text-[11px] text-[#5C544E] border border-[#F0E6DC]">
              <strong>Note ({result.model}):</strong> {result.limitationsNote}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
