import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Headphones,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Square,
  Volume2,
} from 'lucide-react';
import { SiteAudioExplainerRecord } from '../../types';
import { AudioLanguage, formatAudioDuration } from '../../../shared/audioExplainer';

interface AudioExplainerPlayerProps {
  explainers: SiteAudioExplainerRecord[];
  onLearnMore?: () => void;
}

export const AudioExplainerPlayer: React.FC<AudioExplainerPlayerProps> = ({
  explainers,
  onLearnMore,
}) => {
  const publishedTracks = useMemo(
    () => explainers.filter((item) => item.published && Boolean(item.audioUrl)),
    [explainers]
  );

  const trackByLang = useMemo(() => {
    const map: Partial<Record<AudioLanguage, SiteAudioExplainerRecord>> = {};
    for (const item of publishedTracks) {
      map[item.language] = item;
    }
    return map;
  }, [publishedTracks]);

  const [selectedLang, setSelectedLang] = useState<AudioLanguage>('en');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // If the selected language is not published yet but the other language is, switch selection cleanly
  useEffect(() => {
    if (!trackByLang[selectedLang]) {
      if (trackByLang.en) setSelectedLang('en');
      else if (trackByLang.hi) setSelectedLang('hi');
    }
  }, [trackByLang, selectedLang]);

  const activeTrack = trackByLang[selectedLang] || null;
  const effectiveDuration = duration > 0 ? duration : activeTrack?.durationSeconds || 0;
  const progressPercent =
    effectiveDuration > 0 ? Math.min(100, Math.max(0, (currentTime / effectiveDuration) * 100)) : 0;

  // Reset playback state when switching language or audio source (strictly NO autoplay)
  useEffect(() => {
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
    setIsPlaying(false);
    setIsBuffering(false);
    setCurrentTime(0);
    setDuration(activeTrack?.durationSeconds || 0);
    setPlaybackError(null);
  }, [activeTrack?.audioUrl, selectedLang]);

  const handlePlay = async () => {
    const el = audioRef.current;
    if (!el || !activeTrack?.audioUrl) return;
    setPlaybackError(null);
    setIsBuffering(true);
    try {
      await el.play();
      setIsPlaying(true);
      setIsBuffering(false);
    } catch {
      setIsPlaying(false);
      setIsBuffering(false);
      setPlaybackError('Unable to play the audio explanation right now. Please tap Play again.');
    }
  };

  const handlePause = () => {
    const el = audioRef.current;
    if (!el) return;
    el.pause();
    setIsPlaying(false);
    setIsBuffering(false);
  };

  const handleStop = () => {
    const el = audioRef.current;
    if (!el) return;
    el.pause();
    el.currentTime = 0;
    setCurrentTime(0);
    setIsPlaying(false);
    setIsBuffering(false);
    setPlaybackError(null);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextTime = Number(e.target.value);
    setCurrentTime(nextTime);
    if (audioRef.current && Number.isFinite(nextTime)) {
      audioRef.current.currentTime = nextTime;
    }
  };

  const handleLanguageChange = (lang: AudioLanguage) => {
    if (lang === selectedLang) return;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setSelectedLang(lang);
  };

  const handleRetry = () => {
    const el = audioRef.current;
    if (!el || !activeTrack?.audioUrl) return;
    setPlaybackError(null);
    el.load();
    void handlePlay();
  };

  return (
    <section
      aria-label="Listen to How EPR Bazaar Works"
      className="bg-white border-b border-[#E2E8F0]"
    >
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="rounded-xl border border-[#CBD5E1] bg-gradient-to-br from-[#F8FAFC] via-white to-[#F0FDF4]/60 p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
            {/* Heading & Description */}
            <div className="flex items-start gap-3.5 max-w-2xl">
              <div className="w-11 h-11 rounded-xl bg-[#0A172A] text-white flex items-center justify-center shrink-0 shadow-xs">
                <Headphones className="w-5 h-5 text-[#4ADE80]" />
              </div>
              <div>
                <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#15803D]">
                  <Volume2 className="w-3.5 h-3.5" />
                  Platform Audio Walkthrough
                </div>
                <h2 className="font-display text-lg sm:text-xl font-bold text-[#0A172A] mt-0.5">
                  Listen to How EPR Bazaar Works
                </h2>
                <p className="text-xs sm:text-sm text-[#475569] mt-1 leading-relaxed">
                  A concise guided overview for Recyclers and PIBOs covering registration, KYC &amp; CPCB verification, credit inventory listings, facilitated transactions, and compliance documentation.
                </p>
              </div>
            </div>

            {/* Language Selector */}
            <div className="flex items-center gap-2 self-start lg:self-center shrink-0">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] mr-1">
                Language
              </span>
              <div
                role="group"
                aria-label="Audio explanation language"
                className="inline-flex rounded-lg border border-[#CBD5E1] bg-white p-0.5 shadow-2xs"
              >
                {(
                  [
                    { id: 'en' as AudioLanguage, label: 'English' },
                    { id: 'hi' as AudioLanguage, label: 'हिंदी (Hindi)' },
                  ] as const
                ).map((option) => {
                  const available = Boolean(trackByLang[option.id]);
                  const selected = selectedLang === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      disabled={!available && publishedTracks.length > 0}
                      onClick={() => handleLanguageChange(option.id)}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                        selected
                          ? 'bg-[#0A172A] text-white'
                          : 'text-[#334155] hover:bg-[#F1F5F9]'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Player Controls & Progress Bar */}
          {activeTrack ? (
            <div className="mt-5 pt-5 border-t border-[#E2E8F0]">
              <audio
                ref={audioRef}
                src={activeTrack.audioUrl}
                preload="metadata"
                playsInline
                onLoadedMetadata={(e) => {
                  const d = e.currentTarget.duration;
                  if (Number.isFinite(d) && d > 0) setDuration(d);
                }}
                onTimeUpdate={(e) => {
                  setCurrentTime(e.currentTarget.currentTime);
                }}
                onWaiting={() => setIsBuffering(true)}
                onCanPlay={() => setIsBuffering(false)}
                onPlaying={() => {
                  setIsPlaying(true);
                  setIsBuffering(false);
                }}
                onPause={() => setIsPlaying(false)}
                onEnded={() => {
                  setIsPlaying(false);
                  setIsBuffering(false);
                  setCurrentTime(effectiveDuration);
                }}
                onError={() => {
                  setIsPlaying(false);
                  setIsBuffering(false);
                  setPlaybackError('Audio stream could not be loaded. Please check your connection and retry.');
                }}
              />

              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                {/* Transport Buttons */}
                <div className="flex items-center gap-2 shrink-0">
                  {!isPlaying ? (
                    <button
                      type="button"
                      onClick={handlePlay}
                      aria-label="Play audio explanation"
                      className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-[#16A36A] hover:bg-[#15803D] text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                    >
                      {isBuffering ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4 fill-current" />
                      )}
                      <span>{isBuffering ? 'Loading...' : 'Play'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handlePause}
                      aria-label="Pause audio explanation"
                      className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-[#0A172A] hover:bg-[#1E293B] text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                    >
                      <Pause className="w-4 h-4 fill-current" />
                      <span>Pause</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleStop}
                    disabled={!isPlaying && currentTime === 0}
                    aria-label="Stop audio explanation"
                    className="inline-flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-lg border border-[#CBD5E1] bg-white hover:bg-[#F8FAFC] text-[#334155] text-xs font-semibold transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>Stop</span>
                  </button>
                </div>

                {/* Progress Bar & Time Readout */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-xs font-medium text-[#0A172A] truncate">
                      {activeTrack.title}
                    </span>
                    <span className="font-mono text-xs font-semibold text-[#334155] tabular-nums shrink-0">
                      {formatAudioDuration(currentTime)} / {formatAudioDuration(effectiveDuration)}
                    </span>
                  </div>
                  <div className="relative flex items-center h-5">
                    <div className="w-full h-2 rounded-full bg-[#E2E8F0] overflow-hidden">
                      <div
                        className="h-full bg-[#16A36A] transition-[width] duration-150"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={effectiveDuration > 0 ? effectiveDuration : 100}
                      step={0.1}
                      value={Math.min(currentTime, effectiveDuration > 0 ? effectiveDuration : 100)}
                      onChange={handleSeek}
                      aria-label="Audio playback progress"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {playbackError && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-2 text-xs text-[#991B1B]">
                  <span className="inline-flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {playbackError}
                  </span>
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="inline-flex items-center gap-1 font-semibold text-[#991B1B] underline cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Retry
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-5 pt-4 border-t border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-[#475569]">
                Our guided Hindi and English audio briefing is currently being finalized by the EPR Bazaar desk and will be available to play here shortly.
              </div>
              {onLearnMore && (
                <button
                  type="button"
                  onClick={onLearnMore}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0A172A] hover:text-[#16A36A] transition-colors shrink-0 cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  Read How EPR Bazaar Works
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
