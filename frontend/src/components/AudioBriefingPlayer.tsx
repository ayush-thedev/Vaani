import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, RotateCcw, Loader2, AlertCircle } from 'lucide-react';

interface AudioBriefingPlayerProps {
  text: string;
  languageCode: string;
  label?: string;
  accentColor?: 'amber' | 'indigo';
}

export const AudioBriefingPlayer: React.FC<AudioBriefingPlayerProps> = ({
  text,
  languageCode,
  label = "Listen to Briefing",
  accentColor = 'amber'
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastGeneratedKey = useRef<string>('');

  // Reset audio when text or language changes
  useEffect(() => {
    const currentKey = `${languageCode}:${text.slice(0, 50)}`;
    if (lastGeneratedKey.current && lastGeneratedKey.current !== currentKey) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setIsPlaying(false);
      setAudioSrc(null);
      setCurrentTime(0);
      setDuration(0);
      setError(null);
    }
  }, [text, languageCode]);

  const fetchAudioAndPlay = async () => {
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/v1/voice/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          language_code: languageCode
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `TTS request failed with status ${res.status}`);
      }

      const data = await res.json();
      if (!data.audio_base64) {
        throw new Error("No audio returned from speech synthesis.");
      }

      const fullDataUri = `data:audio/mp3;base64,${data.audio_base64}`;
      setAudioSrc(fullDataUri);
      lastGeneratedKey.current = `${languageCode}:${text.slice(0, 50)}`;

      if (audioRef.current) {
        audioRef.current.src = fullDataUri;
        await audioRef.current.play();
        setIsPlaying(true);
      }
    } catch (err: any) {
      setError(err.message || "Failed to generate audio narration.");
      setIsPlaying(false);
    } finally {
      setIsLoading(false);
    }
  };

  const togglePlay = () => {
    if (!audioSrc) {
      fetchAudioAndPlay();
      return;
    }

    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch((e) => {
        console.error("Audio playback error:", e);
      });
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const handleRestart = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return "0:00";
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const isAmber = accentColor === 'amber';
  const themeClasses = {
    btnBg: isAmber ? 'bg-amber-600 hover:bg-amber-700' : 'bg-indigo-600 hover:bg-indigo-700',
    sliderAccent: isAmber ? 'accent-amber-600' : 'accent-indigo-600',
    tagBg: isAmber ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-indigo-50 text-indigo-800 border-indigo-200',
    border: isAmber ? 'border-amber-200/80 bg-amber-50/40' : 'border-indigo-200/80 bg-indigo-50/40'
  };

  return (
    <div className={`mt-4 p-3.5 rounded-xl border ${themeClasses.border} transition-all`}>
      <audio
        ref={audioRef}
        onTimeUpdate={() => {
          if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
          }
        }}
        onLoadedMetadata={() => {
          if (audioRef.current) {
            setDuration(audioRef.current.duration || 0);
          }
        }}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Play/Pause Button & Label */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={togglePlay}
            disabled={isLoading || !text}
            className={`w-9 h-9 rounded-full ${themeClasses.btnBg} text-white flex items-center justify-center shadow-xs transition-all disabled:opacity-50 shrink-0`}
            title={isPlaying ? "Pause Narration" : "Play Narration"}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" />
            )}
          </button>

          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-stone-800">
                {isLoading ? "Generating Speech..." : label}
              </span>
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${themeClasses.tagBg}`}>
                Bulbul v4 Flash
              </span>
            </div>
            <p className="text-[11px] text-stone-500">
              {audioSrc ? (isPlaying ? "Playing voice briefing" : "Paused") : "Natural regional voice narration"}
            </p>
          </div>
        </div>

        {/* Scrubbing & Controls (Visible once audio is ready or loading) */}
        {audioSrc && (
          <div className="flex items-center gap-3 flex-1 max-w-xs justify-end">
            <span className="text-[11px] font-mono text-stone-500 min-w-8 text-right">
              {formatTime(currentTime)}
            </span>

            <input
              type="range"
              min="0"
              max={duration || 100}
              step="0.1"
              value={currentTime}
              onChange={handleSeek}
              className={`w-full h-1.5 bg-stone-200 rounded-lg appearance-none cursor-pointer ${themeClasses.sliderAccent}`}
            />

            <span className="text-[11px] font-mono text-stone-500 min-w-8">
              {formatTime(duration)}
            </span>

            <button
              type="button"
              onClick={handleRestart}
              className="text-stone-400 hover:text-stone-700 p-1 rounded-md transition-colors"
              title="Restart Audio"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-2 text-xs text-red-600 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};
