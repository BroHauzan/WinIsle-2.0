import React from 'react';

interface IconProps {
  className?: string;
  size?: number;
}

// 1. Music Note Symbolic (Beamed Eighth Notes)
export const MusicNoteSvg: React.FC<IconProps> = ({ className = '', size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
    <path
      d="M6 12.5V3.8L13.5 2.3V11"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M6 5.8L13.5 4.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <circle cx="4.1" cy="12.5" r="2" fill="currentColor" />
    <circle cx="11.6" cy="11" r="2" fill="currentColor" />
  </svg>
);

// 2. Bell Outline Symbolic (Notifications & DND Off)
export const BellOutlineSvg: React.FC<IconProps> = ({ className = '', size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
    <path
      d="M8 2C5.5 2 3.8 3.8 3.8 6.3V9.5L2.3 11.3C2.1 11.6 2.3 12 2.7 12H13.3C13.7 12 13.9 11.6 13.7 11.3L12.2 9.5V6.3C12.2 3.8 10.5 2 8 2Z"
      stroke="currentColor"
      strokeWidth="1.45"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M6.4 12.5C6.6 13.4 7.2 14 8 14C8.8 14 9.4 13.4 9.6 12.5"
      stroke="currentColor"
      strokeWidth="1.45"
      strokeLinecap="round"
    />
  </svg>
);

// 3. Moon Filled Symbolic (Do Not Disturb On)
export const MoonFilledSvg: React.FC<IconProps> = ({ className = '', size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
    <path
      d="M13.2 10.4A5.8 5.8 0 0 1 5.6 2.8A5.8 5.8 0 1 0 13.2 10.4Z"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
  </svg>
);

// 4. Timer / Stopwatch Symbolic (Focus / Pomodoro)
export const TimerStopwatchSvg: React.FC<IconProps> = ({ className = '', size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
    <path d="M6.2 1.6H9.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="8" cy="9" r="5.3" stroke="currentColor" strokeWidth="1.45" />
    <path d="M8 6.2V9L9.8 10.2" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12.2 4.3L13.3 3.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

// 5. Task Checkbox Symbolic (Tasks / Reminders)
export const TaskCheckBoxSvg: React.FC<IconProps> = ({ className = '', size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
    <rect x="2.2" y="2.2" width="11.6" height="11.6" rx="2.8" stroke="currentColor" strokeWidth="1.45" />
    <path
      d="M5.2 8.2L7.1 10.1L10.9 5.9"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// 6. Shelf Tray / Download Box Symbolic
export const ShelfTraySvg: React.FC<IconProps> = ({ className = '', size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
    <path d="M8 2.2V9.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path
      d="M5.3 7.3L8 10L10.7 7.3"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M2.3 10.5V12.2C2.3 13.1 3 13.8 3.9 13.8H12.1C13 13.8 13.7 13.1 13.7 12.2V10.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

// 7. Calendar Grid Symbolic
export const CalendarGridSvg: React.FC<IconProps> = ({ className = '', size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
    <rect x="2.1" y="3.2" width="11.8" height="10.6" rx="2.3" stroke="currentColor" strokeWidth="1.45" />
    <path d="M5.2 1.8V4.1M10.8 1.8V4.1" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
    <path d="M2.3 6.3H13.7" stroke="currentColor" strokeWidth="1.35" />
    <circle cx="5.4" cy="9" r="0.85" fill="currentColor" />
    <circle cx="8" cy="9" r="0.85" fill="currentColor" />
    <circle cx="10.6" cy="9" r="0.85" fill="currentColor" />
    <circle cx="5.4" cy="11.4" r="0.85" fill="currentColor" />
    <circle cx="8" cy="11.4" r="0.85" fill="currentColor" />
  </svg>
);

// 8. Equalizer Audio Bars Symbolic (|||) — Real-Time Beat-Reactive 4-Band Visualizer
export const EqualizerBarsSvg: React.FC<
  IconProps & { playing?: boolean; bands?: [number, number, number, number] }
> = ({ className = '', size = 15, playing = false, bands }) => {
  if (playing && bands && bands.length === 4) {
    const xCoords = [2, 5.6, 9.2, 12.8];
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
        {bands.map((level, idx) => {
          const clamped = Math.max(0.16, Math.min(1, level));
          const barHeight = +(2.4 + clamped * 11.6).toFixed(2);
          const barY = +(8 - barHeight / 2).toFixed(2);
          return (
            <rect
              key={idx}
              x={xCoords[idx]}
              y={barY}
              width="2"
              height={barHeight}
              rx="1"
              fill="currentColor"
            />
          );
        })}
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <rect x="2" y={playing ? '5' : '6'} width="2" height={playing ? '6' : '4'} rx="1" fill="currentColor">
        {playing && (
          <animate attributeName="height" values="4;10;5;9;4" dur="0.9s" repeatCount="indefinite" />
        )}
        {playing && <animate attributeName="y" values="6;3;5.5;3.5;6" dur="0.9s" repeatCount="indefinite" />}
      </rect>
      <rect x="5.6" y={playing ? '2.5' : '4'} width="2" height={playing ? '11' : '8'} rx="1" fill="currentColor">
        {playing && (
          <animate attributeName="height" values="11;5;12;6;11" dur="0.75s" repeatCount="indefinite" />
        )}
        {playing && <animate attributeName="y" values="2.5;5.5;2;5;2.5" dur="0.75s" repeatCount="indefinite" />}
      </rect>
      <rect x="9.2" y={playing ? '4' : '5'} width="2" height={playing ? '8' : '6'} rx="1" fill="currentColor">
        {playing && (
          <animate attributeName="height" values="6;11;4;9;6" dur="0.85s" repeatCount="indefinite" />
        )}
        {playing && <animate attributeName="y" values="5;2.5;6;3.5;5" dur="0.85s" repeatCount="indefinite" />}
      </rect>
      <rect x="12.8" y="6" width="2" height="4" rx="1" fill="currentColor">
        {playing && (
          <animate attributeName="height" values="4;8;3;7;4" dur="1s" repeatCount="indefinite" />
        )}
        {playing && <animate attributeName="y" values="6;4;6.5;4.5;6" dur="1s" repeatCount="indefinite" />}
      </rect>
    </svg>
  );
};

// 9. Four-Point Sparkle Symbolic (Assistant)
export const SparkleFourPointSvg: React.FC<IconProps> = ({ className = '', size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
    <path
      d="M8 1.4C8.4 4.8 11.2 7.6 14.6 8C11.2 8.4 8.4 11.2 8 14.6C7.6 11.2 4.8 8.4 1.4 8C4.8 7.6 7.6 4.8 8 1.4Z"
      fill="currentColor"
    />
  </svg>
);

// 10. Gear Settings Symbolic
export const GearSettingsSvg: React.FC<IconProps> = ({ className = '', size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
    <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.45" />
    <path
      d="M8 1.7V3.1M8 12.9V14.3M1.7 8H3.1M12.9 8H14.3M3.5 3.5L4.5 4.5M11.5 11.5L12.5 12.5M12.5 3.5L11.5 4.5M4.5 11.5L3.5 12.5"
      stroke="currentColor"
      strokeWidth="1.45"
      strokeLinecap="round"
    />
    <circle cx="8" cy="8" r="4.8" stroke="currentColor" strokeWidth="1.35" strokeDasharray="2.2 1.8" />
  </svg>
);

// 11. Speaker Symbolic with Waves / Mute (Matches video 00:00-00:03)
export const SpeakerWaveSvg: React.FC<IconProps & { level?: number; muted?: boolean }> = ({
  className = '',
  size = 16,
  level = 65,
  muted = false,
}) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
    <path
      d="M2.2 6.1H4.8L8.4 3.1C8.8 2.8 9.4 3.1 9.4 3.6V12.4C9.4 12.9 8.8 13.2 8.4 12.9L4.8 9.9H2.2C1.7 9.9 1.4 9.5 1.4 9V7C1.4 6.5 1.7 6.1 2.2 6.1Z"
      fill="currentColor"
    />
    {muted || level === 0 ? (
      <path
        d="M11.4 6.2L14.6 9.8M14.6 6.2L11.4 9.8"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
      />
    ) : (
      <>
        {level > 5 && (
          <path
            d="M11.3 6C12 6.6 12.3 7.3 12.3 8C12.3 8.7 12 9.4 11.3 10"
            stroke="currentColor"
            strokeWidth="1.45"
            strokeLinecap="round"
          />
        )}
        {level >= 50 && (
          <path
            d="M13 4.3C14.1 5.3 14.6 6.6 14.6 8C14.6 9.4 14.1 10.7 13 11.7"
            stroke="currentColor"
            strokeWidth="1.45"
            strokeLinecap="round"
          />
        )}
      </>
    )}
  </svg>
);

// 12. Sun Brightness Symbolic
export const SunBrightnessSvg: React.FC<IconProps> = ({ className = '', size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
    <circle cx="8" cy="8" r="3.1" fill="currentColor" />
    <path
      d="M8 1.5V3.1M8 12.9V14.5M1.5 8H3.1M12.9 8H14.5M3.4 3.4L4.5 4.5M11.5 11.5L12.6 12.6M12.6 3.4L11.5 4.5M4.5 11.5L3.4 12.6"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

// 13. Caps Lock Up Arrow Symbolic
export const CapsLockArrowSvg: React.FC<IconProps> = ({ className = '', size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
    <path
      d="M8 2.2L2.8 7.6H5.8V10.6H10.2V7.6H13.2L8 2.2Z"
      stroke="currentColor"
      strokeWidth="1.45"
      strokeLinejoin="round"
    />
    <path d="M5.5 13.4H10.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

// 14. Bolt Charging Symbolic
export const BoltChargingSvg: React.FC<IconProps> = ({ className = '', size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
    <path
      d="M8.8 1.8L3.6 8.8H7.8L7.2 14.2L12.4 7.2H8.2L8.8 1.8Z"
      fill="currentColor"
    />
  </svg>
);

// 15. Video Camera Symbolic (Meetings)
export const VideoCameraSvg: React.FC<IconProps> = ({ className = '', size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
    <rect x="1.6" y="4.2" width="9" height="7.6" rx="1.8" fill="currentColor" />
    <path d="M11.2 6.8L14.4 4.8V11.2L11.2 9.2V6.8Z" fill="currentColor" />
  </svg>
);

// 16. Mail Envelope Symbolic
export const MailEnvelopeSvg: React.FC<IconProps> = ({ className = '', size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
    <rect x="1.8" y="3.4" width="12.4" height="9.2" rx="1.8" stroke="currentColor" strokeWidth="1.45" />
    <path d="M2.4 4.4L8 8.4L13.6 4.4" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// 17. Message Chat Bubble Symbolic
export const MessageBubbleSvg: React.FC<IconProps> = ({ className = '', size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
    <path
      d="M2.4 3.4H13.6C14.1 3.4 14.5 3.8 14.5 4.3V10.5C14.5 11 14.1 11.4 13.6 11.4H5.8L2.6 13.8V11.4H2.4C1.9 11.4 1.5 11 1.5 10.5V4.3C1.5 3.8 1.9 3.4 2.4 3.4Z"
      stroke="currentColor"
      strokeWidth="1.45"
      strokeLinejoin="round"
    />
  </svg>
);

// 18. Lyrics Quote Bubble Symbolic
export const LyricsQuoteBubbleSvg: React.FC<IconProps & { active?: boolean }> = ({
  className = '',
  size = 15,
  active = false,
}) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
    <rect
      x="1.8"
      y="2.4"
      width="12.4"
      height="9.4"
      rx="2.4"
      fill={active ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.45"
    />
    <path d="M5 11.8L3.5 14V11.8" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" />
    <path
      d="M5.6 5.8H6.8V7.6L5.8 8.8M9.2 5.8H10.4V7.6L9.4 8.8"
      stroke={active ? '#050506' : 'currentColor'}
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// 19. Media Transport: Backward Skip, Play, Pause, Forward Skip
export const BackwardSkipSvg: React.FC<IconProps> = ({ className = '', size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" />
  </svg>
);

export const ForwardSkipSvg: React.FC<IconProps> = ({ className = '', size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
  </svg>
);

export const PlayFilledSvg: React.FC<IconProps> = ({ className = '', size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M7 5.2v13.6L18.4 12 7 5.2z" />
  </svg>
);

export const PauseFilledSvg: React.FC<IconProps> = ({ className = '', size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="6" y="5" width="4" height="14" rx="1.2" />
    <rect x="14" y="5" width="4" height="14" rx="1.2" />
  </svg>
);

// 20. Chevrons, Plus, Close, Check, Stop, Mic, Keyboard, Send, Globe, Edit, Reset
export const ChevronLeftSvg: React.FC<IconProps> = ({ className = '', size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
    <path d="M10 3.5L5.5 8L10 12.5" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ChevronRightSvg: React.FC<IconProps> = ({ className = '', size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
    <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ChevronDownSvg: React.FC<IconProps> = ({ className = '', size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
    <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ChevronUpSvg: React.FC<IconProps> = ({ className = '', size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
    <path d="M4 10L8 6L12 10" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const PlusSvg: React.FC<IconProps> = ({ className = '', size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
    <path d="M8 3.2V12.8M3.2 8H12.8" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" />
  </svg>
);

export const CloseCrossSvg: React.FC<IconProps> = ({ className = '', size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
    <path d="M4.2 4.2L11.8 11.8M11.8 4.2L4.2 11.8" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" />
  </svg>
);

export const CheckTickSvg: React.FC<IconProps> = ({ className = '', size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
    <path d="M3.2 8.4L6.4 11.6L12.8 4.6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const StopSquareSvg: React.FC<IconProps> = ({ className = '', size = 11 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
    <rect x="3" y="3" width="10" height="10" rx="1.8" fill="currentColor" />
  </svg>
);

export const MicSymbolicSvg: React.FC<IconProps> = ({ className = '', size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
    <rect x="5.6" y="1.8" width="4.8" height="7.6" rx="2.4" fill="currentColor" />
    <path
      d="M3.4 7.4C3.4 9.9 5.5 11.8 8 11.8C10.5 11.8 12.6 9.9 12.6 7.4M8 11.8V14.2"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

export const KeyboardSymbolicSvg: React.FC<IconProps> = ({ className = '', size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
    <rect x="1.5" y="3.5" width="13" height="9" rx="2" stroke="currentColor" strokeWidth="1.4" />
    <circle cx="4.5" cy="6.3" r="0.7" fill="currentColor" />
    <circle cx="6.8" cy="6.3" r="0.7" fill="currentColor" />
    <circle cx="9.2" cy="6.3" r="0.7" fill="currentColor" />
    <circle cx="11.5" cy="6.3" r="0.7" fill="currentColor" />
    <path d="M5 9.8H11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

export const SendArrowSvg: React.FC<IconProps> = ({ className = '', size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
    <path
      d="M2.2 7.6L13.6 2.4L9.2 13.8L7.2 8.8L2.2 7.6Z"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinejoin="round"
    />
  </svg>
);

export const GlobeTimezoneSvg: React.FC<IconProps> = ({ className = '', size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
    <circle cx="8" cy="8" r="5.8" stroke="currentColor" strokeWidth="1.35" />
    <ellipse cx="8" cy="8" rx="2.7" ry="5.8" stroke="currentColor" strokeWidth="1.25" />
    <path d="M2.4 8H13.6" stroke="currentColor" strokeWidth="1.25" />
  </svg>
);

export const EditPencilSvg: React.FC<IconProps> = ({ className = '', size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
    <path
      d="M11.2 2.4L13.6 4.8L5.4 13H3V10.6L11.2 2.4Z"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
  </svg>
);

export const RotateResetSvg: React.FC<IconProps> = ({ className = '', size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
    <path
      d="M3.2 8A4.8 4.8 0 1 1 4.6 11.4M3.2 5V8H6.2"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// 21. Folded Document Sheet with Semantic File Extension Badge (Matches Shelf video 00:10-00:13)
export const FileDocumentBadgeSvg: React.FC<{
  ext?: 'pdf' | 'docx' | 'msi' | 'img' | 'other';
  size?: number;
  className?: string;
}> = ({ ext = 'pdf', size = 38, className = '' }) => {
  const badgeConfig =
    ext === 'pdf'
      ? { bg: '#e53935', label: 'PDF' }
      : ext === 'docx'
      ? { bg: '#1976d2', label: 'W' }
      : ext === 'msi'
      ? { bg: '#4f46e5', label: 'MSI' }
      : ext === 'img'
      ? { bg: '#10b981', label: 'IMG' }
      : { bg: '#52525b', label: 'FILE' };

  const w = Math.round(size * 0.86);
  const h = size;

  return (
    <svg width={w} height={h} viewBox="0 0 36 42" fill="none" className={className}>
      {/* White Document Page with Folded Top-Right Corner */}
      <path
        d="M6 2H23.5L32 10.5V37C32 39.2091 30.2091 41 28 41H6C3.79086 41 2 39.2091 2 37V6C2 3.79086 3.79086 2 6 2Z"
        fill="#F4F4F6"
      />
      {/* Folded Corner Flap */}
      <path
        d="M23.5 2L32 10.5H26C24.6193 10.5 23.5 9.38071 23.5 8V2Z"
        fill="#D4D4DA"
      />
      {/* Subtle Document Lines */}
      <rect x="7" y="13.5" width="14" height="1.8" rx="0.9" fill="#C4C4CC" />
      <rect x="7" y="17.5" width="18" height="1.8" rx="0.9" fill="#D4D4DC" />
      {/* Colored Extension Badge Pill */}
      <rect x="5" y="23" width="24" height="12.5" rx="3.2" fill={badgeConfig.bg} />
      <text
        x="17"
        y="31.6"
        textAnchor="middle"
        fill="#FFFFFF"
        fontSize={badgeConfig.label.length > 2 ? '7.6' : '8.8'}
        fontWeight="800"
        fontFamily="Inter, system-ui, sans-serif"
        letterSpacing="0.02em"
      >
        {badgeConfig.label}
      </text>
    </svg>
  );
};

export const CoffeeCupSvg: React.FC<IconProps> = ({ size = 14, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
    <path d="M3 8h14v7a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
    <line x1="6" y1="2" x2="6" y2="4" />
    <line x1="10" y1="2" x2="10" y2="4" />
    <line x1="14" y1="2" x2="14" y2="4" />
  </svg>
);

export const TargetFocusSvg: React.FC<IconProps> = ({ size = 14, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" fill="currentColor" />
  </svg>
);

export const AlarmBellSvg: React.FC<IconProps> = ({ size = 14, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    <path d="M4 2C2.8 3.7 2 5.7 2 8" />
    <path d="M20 2c1.2 1.7 2 3.7 2 6" />
  </svg>
);



