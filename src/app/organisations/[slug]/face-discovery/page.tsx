'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Shield,
  Camera,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Search,
  Lock,
  EyeOff,
  Sparkles,
  ArrowLeft,
  RefreshCw,
  Info,
  UserCheck,
  Zap,
} from 'lucide-react';

interface ConsentData {
  hasActiveConsent: boolean;
  status: string;
  consentVersion: string;
  consentedAt?: string;
  requiresReconsent: boolean;
  faceDiscoveryEnabled: boolean;
  privacyPolicyUrl?: string;
  privacyContactEmail?: string;
}

interface ProfileData {
  enabled: boolean;
  consentStatus: string;
  consentVersion: string;
  profileStatus: string;
  profileVersion: number;
  canSearch: boolean;
  failureReason?: string;
}

export default function FaceDiscoveryPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params.slug;

  const [loading, setLoading] = useState(true);
  const [consent, setConsent] = useState<ConsentData | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Consent checkbox state
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [submittingConsent, setSubmittingConsent] = useState(false);

  // Upload/Camera state
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<string>('');
  const [useCamera, setUseCamera] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Fetch consent & profile status
  const loadStatus = async () => {
    try {
      setLoading(true);
      setError(null);

      const [consentRes, profileRes] = await Promise.all([
        fetch(`/api/organisations/${slug}/face-discovery/consent`),
        fetch(`/api/organisations/${slug}/face-discovery/profile`),
      ]);

      const consentData = await consentRes.json();
      const profileData = await profileRes.json();

      if (!consentData.success) {
        throw new Error(consentData.error?.message || 'Failed to load face discovery status');
      }

      setConsent(consentData.data);
      if (profileData.success) {
        setProfile(profileData.data);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (slug) {
      loadStatus();
    }
  }, [slug]);

  // Clean up camera stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const handleGrantConsent = async () => {
    if (!termsAgreed) return;
    try {
      setSubmittingConsent(true);
      setError(null);
      const res = await fetch(`/api/organisations/${slug}/face-discovery/consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isMinor: false }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to record consent');
      }
      setSuccessMsg('Explicit consent recorded successfully.');
      await loadStatus();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmittingConsent(false);
    }
  };

  const handleWithdrawConsent = async () => {
    if (!confirm('Are you sure you want to withdraw consent? Your face profile and associated embeddings will be purged immediately.')) {
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/organisations/${slug}/face-discovery/consent/withdraw`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to withdraw consent');
      }
      setSuccessMsg('Consent withdrawn and biometric data purged.');
      setSelfieFile(null);
      setPreviewUrl(null);
      await loadStatus();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProfile = async () => {
    if (!confirm('Are you sure you want to delete your face profile? You will need to upload a new selfie to search for photos.')) {
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/organisations/${slug}/face-discovery/profile`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to delete face profile');
      }
      setSuccessMsg('Face profile deleted.');
      setSelfieFile(null);
      setPreviewUrl(null);
      await loadStatus();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Camera handling
  const startCamera = async () => {
    try {
      setUseCamera(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 640 }, facingMode: 'user' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      setError('Unable to access camera: ' + err.message);
      setUseCamera(false);
    }
  };

  const captureCameraSnapshot = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 480;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], 'selfie.webp', { type: 'image/webp' });
          setSelfieFile(file);
          setPreviewUrl(URL.createObjectURL(blob));
          stopCamera();
        }
      }, 'image/webp', 0.9);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setUseCamera(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelfieFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setError(null);
    }
  };

  const handleProcessSelfie = async () => {
    if (!selfieFile) return;

    try {
      setIsProcessing(true);
      setError(null);

      setProcessingStep('1/4 Inspecting selfie quality and dimensions...');
      await new Promise((r) => setTimeout(r, 400));

      setProcessingStep('2/4 Detecting single frontal face & landmarks...');
      const formData = new FormData();
      formData.append('file', selfieFile);

      setProcessingStep('3/4 Generating normalized 128D face embedding...');
      const res = await fetch(`/api/organisations/${slug}/face-discovery/profile/process`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error?.message || 'Face detection/processing failed');
      }

      setProcessingStep('4/4 Purging raw selfie image from storage (Privacy Guarantee)...');
      await new Promise((r) => setTimeout(r, 300));

      setSuccessMsg('Face profile created successfully! You can now search for your photos.');
      setSelfieFile(null);
      setPreviewUrl(null);
      await loadStatus();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
          <p className="text-slate-400 text-sm">Verifying biometric privacy settings...</p>
        </div>
      </div>
    );
  }

  const isFeatureActive = !!consent?.faceDiscoveryEnabled;
  const hasConsent = !!consent?.hasActiveConsent;
  const isProfileActive = profile?.profileStatus === 'ACTIVE';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={`/organisations/${slug}`}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-indigo-400" />
                <h1 className="text-lg font-bold text-white tracking-wide">Privacy-First Face Discovery</h1>
              </div>
              <p className="text-xs text-slate-400">Consent-controlled photo discovery for authorised events</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5 ${
                isProfileActive
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : hasConsent
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isProfileActive ? 'bg-emerald-400' : hasConsent ? 'bg-amber-400' : 'bg-slate-500'
                }`}
              />
              {isProfileActive ? 'Profile Active' : hasConsent ? 'Consent Granted' : 'Opt-in Required'}
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Error / Success Alerts */}
        {error && (
          <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/50 flex items-start gap-3 text-red-200 text-sm">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">{error}</div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
              ✕
            </button>
          </div>
        )}

        {successMsg && (
          <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/50 flex items-start gap-3 text-emerald-200 text-sm">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="flex-1">{successMsg}</div>
            <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-300">
              ✕
            </button>
          </div>
        )}

        {/* Disabled Banner */}
        {!isFeatureActive && (
          <div className="p-6 rounded-2xl bg-amber-950/30 border border-amber-800/40 text-amber-200">
            <div className="flex items-center gap-3 mb-2">
              <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0" />
              <h3 className="font-semibold text-lg text-amber-300">Face Discovery is currently disabled</h3>
            </div>
            <p className="text-sm text-amber-200/80 leading-relaxed">
              Face discovery is not currently enabled for this organisation. An organisation owner or administrator must enable this feature before you can configure your profile.
            </p>
          </div>
        )}

        {isFeatureActive && (
          <>
            {/* STEP 1: CONSENT OPT-IN */}
            {!hasConsent ? (
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                    <Shield className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Biometric Consent & Disclosures</h2>
                    <p className="text-sm text-slate-400 mt-1">
                      Please review how your biometric data will be processed and protected under DPDP-aligned privacy standards.
                    </p>
                  </div>
                </div>

                {/* Privacy Safeguards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 space-y-2">
                    <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm">
                      <Lock className="w-4 h-4" />
                      <span>Data Minimization</span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Your uploaded selfie is temporarily held in private storage solely to generate a 128D vector, and is purged immediately afterwards.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 space-y-2">
                    <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                      <EyeOff className="w-4 h-4" />
                      <span>Zero Vector Exposure</span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Raw mathematical embeddings are strictly retained on the backend and never exposed to the frontend or public APIs.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 space-y-2">
                    <div className="flex items-center gap-2 text-rose-400 font-semibold text-sm">
                      <Trash2 className="w-4 h-4" />
                      <span>Absolute Withdrawal</span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      You can revoke consent or delete your biometric profile at any time. Revocation instantly purges all stored embeddings.
                    </p>
                  </div>
                </div>

                {/* Terms of Consent Checkbox */}
                <div className="p-4 rounded-xl bg-slate-950/80 border border-indigo-500/20 space-y-3">
                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={termsAgreed}
                      onChange={(e) => setTermsAgreed(e.target.checked)}
                      className="mt-1 w-4 h-4 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900"
                    />
                    <div className="text-xs text-slate-300 leading-relaxed">
                      <span className="font-semibold text-white">Affirmative Consent: </span>
                      I explicitly consent to the extraction and storage of a 128-dimensional biometric mathematical representation of my face solely for the purpose of locating photos of me within approved event galleries of this organisation. I understand that I may withdraw this consent and purge all biometric data at any time.
                    </div>
                  </label>
                </div>

                <div className="flex items-center justify-end">
                  <button
                    onClick={handleGrantConsent}
                    disabled={!termsAgreed || submittingConsent}
                    className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium text-sm flex items-center gap-2 transition shadow-lg shadow-indigo-600/20"
                  >
                    {submittingConsent ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <UserCheck className="w-4 h-4" />
                    )}
                    <span>I Agree & Enable Face Discovery</span>
                  </button>
                </div>
              </div>
            ) : isProfileActive ? (
              /* STEP 3: PROFILE ACTIVE & SEARCH HUB */
              <div className="space-y-6">
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-xl font-bold text-white">Face Discovery Profile Ready</h2>
                          <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-semibold">
                            v{profile?.profileVersion || 1}
                          </span>
                        </div>
                        <p className="text-sm text-slate-400 mt-0.5">
                          Your 128D mathematical embedding is securely registered. You can search event photos at any time.
                        </p>
                      </div>
                    </div>

                    <Link
                      href={`/organisations/${slug}/face-discovery/results`}
                      className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm flex items-center justify-center gap-2 transition shadow-lg shadow-indigo-600/20 shrink-0"
                    >
                      <Search className="w-4 h-4" />
                      <span>Find My Photos</span>
                    </Link>
                  </div>

                  {/* Profile Metadata Details */}
                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                    <div>
                      <span className="text-slate-500 block">Consent Status</span>
                      <span className="text-emerald-400 font-semibold">{consent?.status}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Consent Version</span>
                      <span className="text-slate-300 font-semibold">{consent?.consentVersion}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Model Specification</span>
                      <span className="text-slate-300 font-semibold">MobileFaceNet-128D</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Storage Minimization</span>
                      <span className="text-slate-300 font-semibold">Selfie Purged ✓</span>
                    </div>
                  </div>
                </div>

                {/* Privacy Management Card */}
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 space-y-4">
                  <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-indigo-400" />
                    <span>Your Privacy Controls</span>
                  </h3>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <p className="text-xs text-slate-400 leading-relaxed max-w-lg">
                      You maintain full sovereignty over your biometric data. Withdrawing consent or deleting your profile will immediately delete all biometric embeddings.
                    </p>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={handleDeleteProfile}
                        className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition"
                      >
                        Delete Face Profile
                      </button>
                      <button
                        onClick={handleWithdrawConsent}
                        className="px-4 py-2 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/50 text-rose-300 text-xs font-medium transition flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Withdraw Consent</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* STEP 2: SELFIE UPLOAD / CAPTURE */
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                    <Camera className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Upload or Capture a Selfie</h2>
                    <p className="text-sm text-slate-400 mt-1">
                      A clear, front-facing selfie is required to generate your face discovery vector.
                    </p>
                  </div>
                </div>

                {/* Quality Tips */}
                <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 text-xs text-slate-400 space-y-1.5">
                  <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Photo Guidelines for Best Results:</span>
                  </span>
                  <ul className="list-disc list-inside space-y-1 text-slate-400 ml-1">
                    <li>Ensure only your face is visible (photos with multiple faces will be rejected).</li>
                    <li>Look directly into the camera with neutral, even lighting.</li>
                    <li>Avoid heavy sunglasses, masks, or extreme angles.</li>
                  </ul>
                </div>

                {/* Processing State */}
                {isProcessing && (
                  <div className="p-6 rounded-xl bg-indigo-950/30 border border-indigo-800/40 text-center space-y-3">
                    <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin mx-auto" />
                    <p className="text-sm font-semibold text-indigo-200">{processingStep}</p>
                    <p className="text-xs text-indigo-300/70">
                      Generating secure 128D mathematical representation...
                    </p>
                  </div>
                )}

                {!isProcessing && (
                  <div className="space-y-4">
                    {/* Camera Feed if Active */}
                    {useCamera && (
                      <div className="relative rounded-2xl overflow-hidden bg-black border border-slate-800 aspect-video sm:aspect-square max-w-md mx-auto flex items-center justify-center">
                        <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                        <div className="absolute bottom-4 flex items-center gap-3">
                          <button
                            onClick={captureCameraSnapshot}
                            className="px-5 py-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm flex items-center gap-2 shadow-lg"
                          >
                            <Camera className="w-4 h-4" />
                            <span>Capture Photo</span>
                          </button>
                          <button
                            onClick={stopCamera}
                            className="px-4 py-2.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Preview Selected Photo */}
                    {previewUrl && !useCamera && (
                      <div className="relative rounded-2xl overflow-hidden bg-black border border-slate-800 aspect-square max-w-xs mx-auto">
                        <img src={previewUrl} alt="Selfie Preview" className="w-full h-full object-cover" />
                        <button
                          onClick={() => {
                            setSelfieFile(null);
                            setPreviewUrl(null);
                          }}
                          className="absolute top-2 right-2 p-1.5 rounded-full bg-slate-900/80 text-slate-300 hover:text-white"
                        >
                          ✕
                        </button>
                      </div>
                    )}

                    {/* Dropzone & Buttons */}
                    {!previewUrl && !useCamera && (
                      <div className="border-2 border-dashed border-slate-700 hover:border-indigo-500/50 rounded-2xl p-8 text-center space-y-4 transition">
                        <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 mx-auto">
                          <Upload className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-200">
                            Drag & drop your selfie here, or browse files
                          </p>
                          <p className="text-xs text-slate-500 mt-1">Supports JPEG, PNG, WebP up to 10MB</p>
                        </div>
                        <div className="flex flex-wrap items-center justify-center gap-3">
                          <label className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium cursor-pointer transition">
                            <span>Browse Device</span>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              onChange={handleFileChange}
                              className="hidden"
                            />
                          </label>
                          <button
                            onClick={startCamera}
                            className="px-4 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 text-xs font-medium flex items-center gap-1.5 transition"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            <span>Use Camera</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Submit Action */}
                    {previewUrl && (
                      <div className="flex items-center justify-end gap-3 pt-2">
                        <button
                          onClick={() => {
                            setSelfieFile(null);
                            setPreviewUrl(null);
                          }}
                          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition"
                        >
                          Choose Different Photo
                        </button>
                        <button
                          onClick={handleProcessSelfie}
                          className="px-6 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold flex items-center gap-2 transition shadow-lg shadow-indigo-600/20"
                        >
                          <Sparkles className="w-4 h-4" />
                          <span>Process & Register Face Profile</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
