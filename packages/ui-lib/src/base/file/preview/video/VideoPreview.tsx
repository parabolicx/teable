import { Maximize, Minimize, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Button, Popover, PopoverContent, PopoverTrigger } from '../../../../shadcn';
import type { IFileItemInner } from '../FilePreviewContext';

interface IVideoPreview extends IFileItemInner {}

export function formatVideoTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const remainder = String(whole % 60).padStart(2, '0');
  return `${minutes}:${remainder}`;
}

const ParabolicVideoPreview = (props: IVideoPreview) => {
  const { src, name, mimetype } = props;
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState('1');
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.load();
    video.playbackRate = 1;
    setPlaying(false);
    setLoading(true);
    setError(undefined);
    setDuration(0);
    setCurrentTime(0);
    setSpeed('1');
    // React removes the old source on navigation; release its decoder on close.
    return () => video.pause();
  }, [src, mimetype]);

  useEffect(() => {
    setCanFullscreen(Boolean(playerRef.current?.requestFullscreen));
    const updateFullscreen = () => setFullscreen(document.fullscreenElement === playerRef.current);
    document.addEventListener('fullscreenchange', updateFullscreen);
    return () => document.removeEventListener('fullscreenchange', updateFullscreen);
  }, []);

  const togglePlayback = async () => {
    const video = videoRef.current;
    if (!video || error) return;
    if (!video.paused) {
      video.pause();
      return;
    }
    try {
      await video.play();
    } catch {
      setError('Playback could not start. Try again or download this video.');
    }
  };

  const seek = (time: number) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    video.currentTime = Math.min(duration, Math.max(0, time));
    setCurrentTime(video.currentTime);
  };

  const changeVolume = (value: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = Math.min(1, Math.max(0, value));
    video.muted = false;
  };

  const toggleMute = () => {
    if (videoRef.current) videoRef.current.muted = !videoRef.current.muted;
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement === playerRef.current) await document.exitFullscreen();
      else await playerRef.current?.requestFullscreen?.();
    } catch {
      // Browser policy can deny fullscreen. Playback remains usable.
    }
  };

  const reportLoadError = () => {
    setLoading(false);
    setError('This browser could not load or decode the video. Download it to play locally.');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    // Only the stage owns playback keys. Sliders, selects and buttons retain
    // their native key handling; unfocused player keys never affect Teable.
    if (event.target !== playerRef.current && event.target !== videoRef.current) {
      // A focused seek/volume control must not also navigate attachments.
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') event.stopPropagation();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    switch (event.key.toLowerCase()) {
      case ' ':
      case 'k':
        void togglePlayback();
        break;
      case 'arrowleft':
        seek(currentTime - 5);
        break;
      case 'arrowright':
        seek(currentTime + 5);
        break;
      case 'arrowup':
        changeVolume(volume + 0.1);
        break;
      case 'arrowdown':
        changeVolume(volume - 0.1);
        break;
      case 'm':
        toggleMute();
        break;
      case 'f':
        void toggleFullscreen();
        break;
      case 'escape':
        if (!fullscreen) return;
        void toggleFullscreen();
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      ref={playerRef}
      role="group"
      aria-label={`Video player: ${name}`}
      className="flex size-full min-h-0 flex-col overflow-hidden rounded-md bg-black"
    >
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        <video
          ref={videoRef}
          className="size-full min-h-0 object-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          playsInline
          preload="metadata"
          aria-label={name}
          aria-keyshortcuts="Space K ArrowLeft ArrowRight ArrowUp ArrowDown M F"
          tabIndex={0}
          onKeyDown={onKeyDown}
          onLoadedMetadata={(event) => {
            const value = event.currentTarget.duration;
            setDuration(Number.isFinite(value) ? value : 0);
          }}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onWaiting={() => setLoading(true)}
          onPlaying={() => setLoading(false)}
          onCanPlay={() => setLoading(false)}
          onVolumeChange={(event) => {
            setVolume(event.currentTarget.volume);
            setMuted(event.currentTarget.muted);
          }}
          onError={reportLoadError}
        >
          <track kind="captions" default />
          <source src={src} type={mimetype || undefined} onError={reportLoadError} />
        </video>
        {loading && !error && (
          <div
            role="status"
            className="pointer-events-none absolute rounded-md bg-background/90 px-3 py-2 text-sm text-foreground"
          >
            Loading video…
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="absolute max-w-md space-y-3 rounded-md border bg-background p-4 text-sm text-foreground"
          >
            <p>{error}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setError(undefined);
                setLoading(true);
                videoRef.current?.load();
              }}
            >
              Retry
            </Button>
          </div>
        )}
      </div>
      <div className="shrink-0 space-y-2 border-t bg-background px-3 py-2 text-foreground">
        <input
          type="range"
          className="w-full accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Video position"
          aria-valuetext={`${formatVideoTime(currentTime)} of ${formatVideoTime(duration)}`}
          value={currentTime}
          min={0}
          max={duration || 1}
          step={0.1}
          disabled={!duration || Boolean(error)}
          onChange={(event) => seek(Number(event.target.value))}
          onKeyDown={onKeyDown}
        />
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={playing ? 'Pause video' : 'Play video'}
            disabled={Boolean(error)}
            onClick={() => void togglePlayback()}
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </Button>
          <span className="min-w-0 text-xs tabular-nums">
            {formatVideoTime(currentTime)} / {formatVideoTime(duration)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={muted ? 'Unmute video' : 'Mute video'}
            onClick={toggleMute}
          >
            {muted || volume === 0 ? (
              <VolumeX className="size-4" />
            ) : (
              <Volume2 className="size-4" />
            )}
          </Button>
          <input
            type="range"
            className="hidden w-20 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:block"
            aria-label="Video volume"
            value={muted ? 0 : volume}
            min={0}
            max={1}
            step={0.05}
            onChange={(event) => changeVolume(Number(event.target.value))}
            onKeyDown={onKeyDown}
          />
          <div className="flex-1" />
          <Popover open={speedMenuOpen} onOpenChange={setSpeedMenuOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={`Playback speed: ${speed}×`}
              >
                {speed}×
              </Button>
            </PopoverTrigger>
            <PopoverContent
              container={fullscreen ? playerRef.current : undefined}
              side="top"
              className="w-24 p-1"
              // Radix dismisses this popup during document capture. Keep the
              // same Escape from bubbling into the attachment viewer's close
              // handler, while leaving Radix's default dismissal enabled.
              onEscapeKeyDown={(event) => event.stopPropagation()}
            >
              {['0.25', '0.5', '0.75', '1', '1.25', '1.5', '2'].map((value) => (
                <Button
                  type="button"
                  key={value}
                  variant={speed === value ? 'secondary' : 'ghost'}
                  size="sm"
                  className="w-full"
                  aria-pressed={speed === value}
                  onClick={() => {
                    setSpeed(value);
                    if (videoRef.current) videoRef.current.playbackRate = Number(value);
                    setSpeedMenuOpen(false);
                  }}
                >
                  {value}×
                </Button>
              ))}
            </PopoverContent>
          </Popover>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            disabled={!canFullscreen}
            onClick={() => void toggleFullscreen()}
          >
            {fullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
};

// Keep the upstream player available when the fork's application extensions
// are disabled. The enhanced viewer is enabled by the same build-time flag as
// the native shell, without changing attachment selection or access policy.
const UpstreamVideoPreview = (props: IVideoPreview) => {
  const { src, name, downloadUrl } = props;
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    videoRef.current?.load();
  }, [src]);
  return (
    <video ref={videoRef} className="max-h-full max-w-full" controls>
      <track kind="captions" default />
      <source src={src} type="video/webm" />
      <source src={src} type="video/mp4" />
      {downloadUrl && (
        <a href={downloadUrl} download={name}>
          MP4
        </a>
      )}
      {downloadUrl && (
        <a href={downloadUrl} download={name}>
          WEBM
        </a>
      )}
    </video>
  );
};

export const VideoPreview = (props: IVideoPreview) =>
  process.env.NEXT_PUBLIC_PARABOLIC_ENABLED === 'true' ? (
    <ParabolicVideoPreview {...props} />
  ) : (
    <UpstreamVideoPreview {...props} />
  );
