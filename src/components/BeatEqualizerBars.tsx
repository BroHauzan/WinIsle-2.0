import React, { useEffect, useRef } from 'react';

interface BeatEqualizerBarsProps {
  playing: boolean;
  size?: number;
  className?: string;
  activeTrackTitle?: string;
  activeTrackArtist?: string;
  hasAudioUrl?: boolean;
  audioEl?: HTMLAudioElement | null;
  positionMsRef: React.RefObject<number>;
  parsedLyricsCount?: number;
  activeLineIndex?: number;
}

export const BeatEqualizerBars: React.FC<BeatEqualizerBarsProps> = ({
  playing,
  size = 15,
  className = '',
  activeTrackTitle,
  activeTrackArtist,
  hasAudioUrl,
  audioEl,
  positionMsRef,
  parsedLyricsCount = 0,
  activeLineIndex = -1,
}) => {
  const bar0Ref = useRef<SVGRectElement | null>(null);
  const bar1Ref = useRef<SVGRectElement | null>(null);
  const bar2Ref = useRef<SVGRectElement | null>(null);
  const bar3Ref = useRef<SVGRectElement | null>(null);

  const webAudioCtxRef = useRef<AudioContext | null>(null);
  const webAudioAnalyserRef = useRef<AnalyserNode | null>(null);
  const webAudioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  useEffect(() => {
    const bars = [bar0Ref.current, bar1Ref.current, bar2Ref.current, bar3Ref.current];
    if (!playing) {
      // Idle heights set via direct DOM attributes without triggering React re-renders
      const idleHeights = [4, 6, 5, 3];
      bars.forEach((bar, i) => {
        if (bar) {
          bar.setAttribute('height', String(idleHeights[i]));
          bar.setAttribute('y', String(8 - idleHeights[i] / 2));
        }
      });
      return;
    }

    // Connect Web Audio Analyser if playing direct audio element
    if (audioEl && hasAudioUrl && !webAudioAnalyserRef.current) {
      try {
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        if (Ctx) {
          const ctx: AudioContext = webAudioCtxRef.current || new Ctx();
          webAudioCtxRef.current = ctx;
          if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
          }
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          analyser.smoothingTimeConstant = 0.68;
          if (!webAudioSourceRef.current) {
            const src = ctx.createMediaElementSource(audioEl);
            src.connect(analyser);
            analyser.connect(ctx.destination);
            webAudioSourceRef.current = src;
          }
          webAudioAnalyserRef.current = analyser;
        }
      } catch {
        // Fallback to beat synthesis
      }
    }

    const seedStr = `${activeTrackTitle || ''}-${activeTrackArtist || ''}`;
    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) {
      hash = (hash * 31 + seedStr.charCodeAt(i)) | 0;
    }
    const trackBpm = 94 + (Math.abs(hash) % 44);
    const beatPeriodSec = 60 / trackBpm;

    const fftData = new Uint8Array(32);
    let rafId = 0;
    let lastUpdate = 0;
    const prevBands = [0.25, 0.35, 0.3, 0.22];

    const tick = (now: number) => {
      // Pause updates completely when document is hidden to conserve 100% CPU
      if (document.hidden) {
        rafId = window.requestAnimationFrame(tick);
        return;
      }

      if (now - lastUpdate >= 32) {
        lastUpdate = now;
        let b0 = 0;
        let b1 = 0;
        let b2 = 0;
        let b3 = 0;
        let usedRealFft = false;

        if (webAudioAnalyserRef.current && hasAudioUrl) {
          try {
            webAudioAnalyserRef.current.getByteFrequencyData(fftData);
            const sum = fftData[0] + fftData[1] + fftData[2] + fftData[3] + fftData[4] + fftData[5];
            if (sum > 8) {
              usedRealFft = true;
              b0 = Math.min(1, ((fftData[0] + fftData[1]) / 2 / 255) * 1.15);
              b1 = Math.min(1, ((fftData[2] + fftData[3] + fftData[4]) / 3 / 255) * 1.25);
              b2 = Math.min(1, ((fftData[5] + fftData[6] + fftData[7] + fftData[8]) / 4 / 255) * 1.35);
              b3 = Math.min(1, ((fftData[9] + fftData[10] + fftData[11] + fftData[12]) / 4 / 255) * 1.45);
            }
          } catch {
            // ignore
          }
        }

        if (!usedRealFft) {
          const posSec = (positionMsRef.current || now) / 1000;
          const beatPhase = (posSec % beatPeriodSec) / beatPeriodSec;
          const halfBeatPhase = ((posSec + beatPeriodSec * 0.5) % beatPeriodSec) / beatPeriodSec;
          const sixteenthPhase = (posSec % (beatPeriodSec / 4)) / (beatPeriodSec / 4);

          const kickEnvelope = Math.pow(Math.max(0, 1 - beatPhase * 2.4), 1.8);
          const grooveEnvelope = Math.pow(Math.max(0, 1 - halfBeatPhase * 2.1), 1.6);

          let vocalEnergy = 0.45;
          if (parsedLyricsCount > 0 && activeLineIndex >= 0) {
            const syllableWave =
              0.55 +
              0.45 * Math.abs(Math.sin(posSec * 9.5 + (activeLineIndex % 5)) * Math.cos(posSec * 4.2));
            vocalEnergy = 0.35 + syllableWave * 0.65;
          } else {
            vocalEnergy = 0.42 + 0.45 * Math.abs(Math.sin(posSec * 6.8) * Math.cos(posSec * 3.1));
          }

          const hiHatShimmer =
            0.3 +
            0.55 * Math.pow(Math.max(0, 1 - sixteenthPhase * 1.9), 1.5) +
            0.15 * Math.abs(Math.sin(posSec * 17.3));

          b0 = Math.min(1, 0.22 + kickEnvelope * 0.68 + grooveEnvelope * 0.18);
          b1 = Math.min(1, 0.26 + grooveEnvelope * 0.52 + kickEnvelope * 0.34);
          b2 = Math.min(1, 0.2 + vocalEnergy * 0.78);
          b3 = Math.min(1, 0.18 + hiHatShimmer * 0.72);
        }

        prevBands[0] = prevBands[0] * 0.32 + b0 * 0.68;
        prevBands[1] = prevBands[1] * 0.32 + b1 * 0.68;
        prevBands[2] = prevBands[2] * 0.32 + b2 * 0.68;
        prevBands[3] = prevBands[3] * 0.32 + b3 * 0.68;

        // Zero React Re-render direct attribute mutation
        bars.forEach((bar, idx) => {
          if (bar) {
            const clamped = Math.max(0.16, Math.min(1, prevBands[idx]));
            const barHeight = +(2.4 + clamped * 11.6).toFixed(2);
            const barY = +(8 - barHeight / 2).toFixed(2);
            bar.setAttribute('height', String(barHeight));
            bar.setAttribute('y', String(barY));
          }
        });
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [
    playing,
    activeTrackTitle,
    activeTrackArtist,
    hasAudioUrl,
    audioEl,
    positionMsRef,
    parsedLyricsCount,
    activeLineIndex,
  ]);

  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <rect ref={bar0Ref} x="2" y="6" width="2" height="4" rx="1" fill="currentColor" />
      <rect ref={bar1Ref} x="5.6" y="5" width="2" height="6" rx="1" fill="currentColor" />
      <rect ref={bar2Ref} x="9.2" y="5.5" width="2" height="5" rx="1" fill="currentColor" />
      <rect ref={bar3Ref} x="12.8" y="6.5" width="2" height="3" rx="1" fill="currentColor" />
    </svg>
  );
};
