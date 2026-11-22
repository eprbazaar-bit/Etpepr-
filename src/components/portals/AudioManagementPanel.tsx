import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  FileAudio,
  Headphones,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  Square,
  Upload,
  Volume2,
} from 'lucide-react';
import { useMarketplace } from '../../context/MarketplaceContext';
import { Button, MetricCard, StatusBadge } from '../ui/DesignSystem';
import { SiteAudioExplainerRecord, formatTime } from '../../types';
import {
  AudioLanguage,
  AudioTtsModel,
  AudioVoiceName,
  DEFAULT_AUDIO_METADATA,
  FALLBACK_TTS_MODEL,
  formatAudioDuration,
  MAX_NARRATION_SCRIPT_CHARS,
  PREFERRED_TTS_MODEL,
  VOICE_OPTIONS,
} from '../../../shared/audioExplainer';
import { AudioTtsStatusResponse, getAudioTtsStatusApi } from '../../services/audioExplainerService';

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const AudioManagementPanel: React.FC = () => {
  const {
    authUser,
    audioExplainers,
    adminSaveAudioScript,
    adminGenerateAudioExplainer,
    adminUploadAudioExplainer,
    adminToggleAudioExplainerPublish,
    addToast,
  } = useMarketplace();

  const [activeLang, setActiveLang] = useState<AudioLanguage>('en');
  const [ttsStatus, setTtsStatus] = useState<AudioTtsStatusResponse | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const [title, setTitle] = useState('');
  const [script, setScript] = useState('');
  const [voiceName, setVoiceName] = useState<AudioVoiceName>('Charon');
  const [selectedModel, setSelectedModel] = useState<AudioTtsModel>(PREFERRED_TTS_MODEL);

  const [savingScript, setSavingScript] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [togglingPublish, setTogglingPublish] = useState(false);

  // Built-in preview player state
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(0);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const recordByLang = useMemo(() => {
    const map: Partial<Record<AudioLanguage, SiteAudioExplainerRecord>> = {};
    for (const rec of audioExplainers) {
      map[rec.language] = rec;
    }
    return map;
  }, [audioExplainers]);

  const activeRecord = recordByLang[activeLang] || null;
  const langDefaults = DEFAULT_AUDIO_METADATA[activeLang];

  // Sync editor inputs when switching language or when record updates from Firestore
  useEffect(() => {
    setTitle(activeRecord?.title || langDefaults.title);
    setScript(activeRecord?.narrationScript || langDefaults.defaultScript);
    const recVoice = activeRecord?.voiceName;
    if (recVoice === 'Charon' || recVoice === 'Fenrir' || recVoice === 'Puck') {
      setVoiceName(recVoice);
    } else {
      setVoiceName('Charon');
    }
    if (activeRecord?.modelUsed === FALLBACK_TTS_MODEL) {
      setSelectedModel(FALLBACK_TTS_MODEL);
    } else {
      setSelectedModel(PREFERRED_TTS_MODEL);
    }

    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setCurrentTime(0);
    setPreviewDuration(activeRecord?.durationSeconds || 0);
    setPreviewError(null);
  }, [activeLang, activeRecord?.audioUrl, activeRecord?.narrationScript, activeRecord?.title]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!authUser) {
        setStatusLoading(false);
        return;
      }
      try {
        const idToken = await authUser.getIdToken();
        const res = await getAudioTtsStatusApi(idToken);
        if (mounted) setTtsStatus(res);
      } catch {
        if (mounted) setTtsStatus({ ok: false, geminiConfigured: false });
      } finally {
        if (mounted) setStatusLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [authUser]);

  const effectiveDuration =
    previewDuration > 0 ? previewDuration : activeRecord?.durationSeconds || 0;
  const progressPct =
    effectiveDuration > 0 ? Math.min(100, Math.max(0, (currentTime / effectiveDuration) * 100)) : 0;

  const handleSaveScript = async () => {
    setSavingScript(true);
    try {
      await adminSaveAudioScript({
        language: activeLang,
        title,
        narrationScript: script,
        voiceName,
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Unable to save script',
        description: err instanceof Error ? err.message : 'Please check narration script length.',
      });
    } finally {
      setSavingScript(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await adminGenerateAudioExplainer({
        language: activeLang,
        title,
        narrationScript: script,
        voiceName,
        model: selectedModel,
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: `Failed to generate ${langDefaults.languageLabel} audio`,
        description: err instanceof Error ? err.message : 'Voice generation error.',
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      await adminUploadAudioExplainer({
        language: activeLang,
        file,
        title,
        narrationScript: script,
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Audio upload failed',
        description: err instanceof Error ? err.message : 'Please upload a valid MP3 or WAV file.',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleTogglePublish = async () => {
    if (!activeRecord) return;
    setTogglingPublish(true);
    try {
      await adminToggleAudioExplainerPublish(activeRecord, !activeRecord.published);
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Publish status update failed',
        description: err instanceof Error ? err.message : 'Unable to update publish state.',
      });
    } finally {
      setTogglingPublish(false);
    }
  };

  const handlePreviewPlay = async () => {
    if (!previewAudioRef.current || !activeRecord?.audioUrl) return;
    setPreviewError(null);
    try {
      await previewAudioRef.current.play();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
      setPreviewError('Browser could not play this audio file. Try regenerating or uploading a standard MP3/WAV.');
    }
  };

  const handlePreviewPause = () => {
    previewAudioRef.current?.pause();
    setIsPlaying(false);
  };

  const handlePreviewStop = () => {
    if (!previewAudioRef.current) return;
    previewAudioRef.current.pause();
    previewAudioRef.current.currentTime = 0;
    setCurrentTime(0);
    setIsPlaying(false);
  };

  const enRec = recordByLang.en;
  const hiRec = recordByLang.hi;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#15803D]">
            <Headphones className="w-3.5 h-3.5" />
            Homepage Voice Briefing
          </div>
          <h1 className="font-display text-xl font-bold text-[#0A172A] mt-0.5">
            Audio Management
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5 max-w-2xl">
            Generate, preview, upload, edit scripts, and publish the English and Hindi audio explanations displayed in the “Listen to How EPR Bazaar Works” homepage player. Published audio is stored permanently—visitors play stored files directly.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="English Narration"
          value={enRec?.published ? 'Published' : enRec?.audioUrl ? 'Ready (Draft)' : 'Not Generated'}
          sublabel={
            enRec?.audioUrl
              ? `${formatAudioDuration(enRec.durationSeconds)} · ${formatBytes(enRec.fileSizeBytes)}`
              : 'Generate or upload MP3/WAV'
          }
          accent={enRec?.published ? 'emerald' : enRec?.audioUrl ? 'amber' : 'slate'}
        />
        <MetricCard
          label="Hindi Narration (हिंदी)"
          value={hiRec?.published ? 'Published' : hiRec?.audioUrl ? 'Ready (Draft)' : 'Not Generated'}
          sublabel={
            hiRec?.audioUrl
              ? `${formatAudioDuration(hiRec.durationSeconds)} · ${formatBytes(hiRec.fileSizeBytes)}`
              : 'Generate or upload MP3/WAV'
          }
          accent={hiRec?.published ? 'emerald' : hiRec?.audioUrl ? 'amber' : 'slate'}
        />
        <MetricCard
          label="Voice Synthesis Engine"
          value={
            statusLoading
              ? 'Checking...'
              : ttsStatus?.geminiConfigured
                ? 'Active'
                : 'Manual Upload Only'
          }
          sublabel={
            ttsStatus?.geminiConfigured
              ? `${PREFERRED_TTS_MODEL} (auto-fallback enabled)`
              : 'Configure GEMINI_API_KEY in server secrets for AI voice'
          }
          accent={ttsStatus?.geminiConfigured ? 'emerald' : 'amber'}
        />
        <MetricCard
          label="Homepage Player Status"
          value={enRec?.published || hiRec?.published ? 'Live on Homepage' : 'Waiting for Publish'}
          sublabel={`${[enRec?.published && 'English', hiRec?.published && 'Hindi'].filter(Boolean).join(' & ') || 'No languages live yet'}`}
          accent={enRec?.published || hiRec?.published ? 'emerald' : 'slate'}
        />
      </div>

      {!statusLoading && ttsStatus && !ttsStatus.geminiConfigured && (
        <div className="rounded-lg border border-[#FCD34D] bg-[#FFFBEB] p-4 flex items-start gap-3 text-xs text-[#92400E]">
          <AlertCircle className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-[#78350F]">
              Server Gemini TTS key is not configured yet
            </div>
            <p className="mt-0.5">
              To enable one-click AI voice generation (<span className="font-mono">{PREFERRED_TTS_MODEL}</span>), add{' '}
              <span className="font-mono font-semibold">GEMINI_API_KEY</span> in your deployment secrets. You can also upload pre-recorded MP3 or WAV narration files below at any time.
            </p>
          </div>
        </div>
      )}

      {/* Language Selector Tabs */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <div className="border-b border-[#E2E8F0] bg-[#F8FAFC] px-4 sm:px-6 pt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {(
              [
                { id: 'en' as AudioLanguage, label: 'English Narration', sub: 'Indian English' },
                { id: 'hi' as AudioLanguage, label: 'Hindi Narration (हिंदी)', sub: 'Natural Hindi' },
              ] as const
            ).map((tab) => {
              const rec = recordByLang[tab.id];
              const isActive = activeLang === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveLang(tab.id)}
                  className={`px-4 py-2.5 rounded-t-lg text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${
                    isActive
                      ? 'border-[#0A172A] bg-white text-[#0A172A]'
                      : 'border-transparent text-[#64748B] hover:text-[#0A172A]'
                  }`}
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      rec?.published
                        ? 'bg-[#16A36A]'
                        : rec?.audioUrl
                          ? 'bg-[#F59E0B]'
                          : 'bg-[#CBD5E1]'
                    }`}
                  />
                </button>
              );
            })}
          </div>

          <div className="pb-3 flex items-center gap-2">
            {activeRecord?.published ? (
              <StatusBadge status="Active" />
            ) : activeRecord?.audioUrl ? (
              <StatusBadge status="Draft" />
            ) : (
              <span className="text-[11px] font-medium text-[#64748B] px-2.5 py-1 rounded bg-[#F1F5F9]">
                No Audio File Yet
              </span>
            )}
          </div>
        </div>

        <div className="p-5 sm:p-6 space-y-6">
          {/* Audio Preview & Publish Controls */}
          <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-sm font-bold text-[#0A172A] flex items-center gap-2">
                  <FileAudio className="w-4 h-4 text-[#16A36A]" />
                  Stored Audio Preview &amp; Publishing ({langDefaults.languageLabel})
                </h2>
                <p className="text-[11px] text-[#64748B] mt-0.5">
                  Preview the persisted narration before publishing it to the homepage player.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant={activeRecord?.published ? 'secondary' : 'emerald'}
                  size="sm"
                  disabled={!activeRecord?.audioUrl || togglingPublish || generating || uploading}
                  onClick={handleTogglePublish}
                >
                  {togglingPublish ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : activeRecord?.published ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                  {activeRecord?.published ? 'Unpublish from Homepage' : 'Publish to Homepage'}
                </Button>
              </div>
            </div>

            {activeRecord?.audioUrl ? (
              <div className="space-y-3 bg-white rounded-lg border border-[#E2E8F0] p-4">
                <audio
                  ref={previewAudioRef}
                  src={activeRecord.audioUrl}
                  preload="metadata"
                  playsInline
                  onLoadedMetadata={(e) => {
                    const d = e.currentTarget.duration;
                    if (Number.isFinite(d) && d > 0) setPreviewDuration(d);
                  }}
                  onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                  onPause={() => setIsPlaying(false)}
                  onPlaying={() => setIsPlaying(true)}
                  onEnded={() => {
                    setIsPlaying(false);
                    setCurrentTime(effectiveDuration);
                  }}
                  onError={() => {
                    setIsPlaying(false);
                    setPreviewError('Preview failed to load. Regenerate or upload a new audio file.');
                  }}
                />

                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-center gap-2 shrink-0">
                    {!isPlaying ? (
                      <Button type="button" variant="emerald" size="sm" onClick={handlePreviewPlay}>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        Preview Play
                      </Button>
                    ) : (
                      <Button type="button" variant="primary" size="sm" onClick={handlePreviewPause}>
                        <Pause className="w-3.5 h-3.5 fill-current" />
                        Pause
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={!isPlaying && currentTime === 0}
                      onClick={handlePreviewStop}
                    >
                      <Square className="w-3 h-3 fill-current" />
                      Stop
                    </Button>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-[11px] text-[#475569] mb-1">
                      <span className="font-mono truncate">{activeRecord.fileName || 'Stored audio file'}</span>
                      <span className="font-mono font-semibold text-[#0A172A] tabular-nums shrink-0 ml-2">
                        {formatAudioDuration(currentTime)} / {formatAudioDuration(effectiveDuration)}
                      </span>
                    </div>
                    <div className="relative flex items-center h-4">
                      <div className="w-full h-2 rounded-full bg-[#E2E8F0] overflow-hidden">
                        <div
                          className="h-full bg-[#0A172A] transition-[width] duration-150"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={effectiveDuration > 0 ? effectiveDuration : 100}
                        step={0.1}
                        value={Math.min(currentTime, effectiveDuration > 0 ? effectiveDuration : 100)}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          setCurrentTime(next);
                          if (previewAudioRef.current) previewAudioRef.current.currentTime = next;
                        }}
                        aria-label="Preview audio progress"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>

                {previewError && (
                  <div className="text-xs text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded px-3 py-2">
                    {previewError}
                  </div>
                )}

                <div className="pt-2 border-t border-[#F1F5F9] grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                  <div>
                    <span className="text-[#64748B] block">Source</span>
                    <span className="font-semibold text-[#0A172A]">
                      {activeRecord.sourceType === 'ai-generated' ? 'AI Generated' : 'Uploaded File'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#64748B] block">Model / Voice</span>
                    <span className="font-mono text-[#0A172A]">
                      {activeRecord.sourceType === 'ai-generated'
                        ? `${activeRecord.modelUsed || PREFERRED_TTS_MODEL} (${activeRecord.voiceName || 'Charon'})`
                        : activeRecord.mimeType || 'MP3/WAV'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#64748B] block">Size &amp; Storage</span>
                    <span className="font-mono text-[#0A172A]">
                      {formatBytes(activeRecord.fileSizeBytes)} ·{' '}
                      {activeRecord.storageProvider === 'firebase-storage' ? 'Cloud Bucket' : 'Server Vault'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#64748B] block">Last Updated</span>
                    <span className="font-mono text-[#0A172A]">
                      {activeRecord.updatedAt ? formatTime(activeRecord.updatedAt) : 'Just now'}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-[#CBD5E1] bg-white p-5 text-center text-xs text-[#64748B]">
                No {langDefaults.languageLabel} audio file has been stored yet. Use{' '}
                <strong className="text-[#0A172A]">Generate {langDefaults.languageLabel} Narration</strong> or{' '}
                <strong className="text-[#0A172A]">Upload MP3 / WAV</strong> below to create a track for preview and publishing.
              </div>
            )}
          </div>

          {/* Generation & Upload Action Bar */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* AI Voice Generation Card */}
            <div className="rounded-xl border border-[#E2E8F0] p-4 sm:p-5 space-y-4">
              <div>
                <h3 className="font-display text-sm font-bold text-[#0A172A] flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#16A36A]" />
                  Generate {langDefaults.languageLabel} Voice Narration
                </h3>
                <p className="text-[11px] text-[#64748B] mt-0.5">
                  Synthesizes a professional Indian male corporate presentation narration using Gemini Text-to-Speech and saves the WAV file to persistent storage.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#334155] mb-1">
                    Narrator Voice
                  </label>
                  <select
                    value={voiceName}
                    onChange={(e) => setVoiceName(e.target.value as AudioVoiceName)}
                    className="w-full h-9 px-2.5 text-xs border border-[#CBD5E1] rounded-lg bg-white"
                  >
                    {VOICE_OPTIONS.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#334155] mb-1">
                    Gemini TTS Model
                  </label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value as AudioTtsModel)}
                    className="w-full h-9 px-2.5 text-xs font-mono border border-[#CBD5E1] rounded-lg bg-white"
                  >
                    <option value={PREFERRED_TTS_MODEL}>
                      {PREFERRED_TTS_MODEL} (Preferred)
                    </option>
                    <option value={FALLBACK_TTS_MODEL}>
                      {FALLBACK_TTS_MODEL} (Fallback)
                    </option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={generating || uploading || !ttsStatus?.geminiConfigured}
                  onClick={handleGenerate}
                >
                  {generating ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : activeRecord?.audioUrl ? (
                    <RefreshCw className="w-3.5 h-3.5" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  {generating
                    ? `Generating ${langDefaults.languageLabel} Audio...`
                    : activeRecord?.audioUrl
                      ? `Regenerate ${langDefaults.languageLabel} Narration`
                      : `Generate ${langDefaults.languageLabel} Narration`}
                </Button>
              </div>
            </div>

            {/* Manual MP3/WAV Upload Card */}
            <div className="rounded-xl border border-[#E2E8F0] p-4 sm:p-5 flex flex-col justify-between space-y-4">
              <div>
                <h3 className="font-display text-sm font-bold text-[#0A172A] flex items-center gap-2">
                  <Upload className="w-4 h-4 text-[#0A172A]" />
                  Upload Studio MP3 or WAV File
                </h3>
                <p className="text-[11px] text-[#64748B] mt-0.5">
                  Prefer a custom studio recording? Upload a mastered MP3 or WAV file (max 25 MB) for the {langDefaults.languageLabel} homepage track.
                </p>
              </div>

              <div className="space-y-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".mp3,.wav,audio/mpeg,audio/mp3,audio/wav,audio/x-wav"
                  onChange={handleFileSelected}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={uploading || generating}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  {uploading
                    ? 'Uploading Audio...'
                    : `Upload ${langDefaults.languageLabel} MP3 / WAV`}
                </Button>
                <div className="text-[11px] text-[#64748B]">
                  Supported formats: <span className="font-mono">.mp3, .wav</span> · Max size: 25 MB
                </div>
              </div>
            </div>
          </div>

          {/* Narration Script Editor */}
          <div className="rounded-xl border border-[#E2E8F0] p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-sm font-bold text-[#0A172A]">
                  Narration Script ({langDefaults.languageLabel})
                </h3>
                <p className="text-[11px] text-[#64748B] mt-0.5">
                  Edit the narration text below. Blank lines create natural professional pauses between sections during AI voice synthesis.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setTitle(langDefaults.title);
                    setScript(langDefaults.defaultScript);
                    addToast({
                      type: 'info',
                      title: 'Default 9-point script loaded in editor',
                      description: 'Click Save Script or Generate Narration to store your changes.',
                    });
                  }}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset Default Script
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={savingScript || generating}
                  onClick={handleSaveScript}
                >
                  {savingScript ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  Save Script
                </Button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1">
                Player Track Title
              </label>
              <input
                type="text"
                maxLength={160}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-[#CBD5E1] rounded-lg bg-white"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-[#334155]">
                  Narration Text
                </label>
                <span
                  className={`font-mono text-[11px] tabular-nums ${
                    script.length > MAX_NARRATION_SCRIPT_CHARS ? 'text-[#DC2626] font-semibold' : 'text-[#64748B]'
                  }`}
                >
                  {script.length} / {MAX_NARRATION_SCRIPT_CHARS} chars
                </span>
              </div>
              <textarea
                rows={12}
                value={script}
                onChange={(e) => setScript(e.target.value)}
                className="w-full p-3 text-sm leading-relaxed border border-[#CBD5E1] rounded-lg bg-white font-sans"
              />
            </div>

            <div className="flex items-center gap-2 text-[11px] text-[#475569] bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3.5 py-2.5">
              <CheckCircle2 className="w-4 h-4 text-[#16A36A] shrink-0" />
              <span>
                The official default script accurately reflects live EPR Bazaar capabilities—registration, KYC/GSTIN/CPCB verification, Recycler inventory, PIBO browsing, facilitator-managed matching, and GST compliance records—without inventing unsupported payment gateways or automated regulatory transfers.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
