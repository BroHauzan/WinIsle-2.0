// Ported from crates/isle-core/src/pomodoro.rs

export enum Phase {
  Idle = 'idle',
  Focus = 'focus',
  ShortBreak = 'short_break',
  LongBreak = 'long_break',
}

export interface PomodoroConfig {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  sessionsBeforeLongBreak: number;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
}

export const DEFAULT_POMODORO_CONFIG: PomodoroConfig = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  sessionsBeforeLongBreak: 4,
  autoStartBreaks: true,
  autoStartFocus: false,
};

export function phaseLabel(phase: Phase): string {
  switch (phase) {
    case Phase.Idle:
    case Phase.Focus:
      return 'Focus';
    case Phase.ShortBreak:
      return 'Short break';
    case Phase.LongBreak:
      return 'Long break';
  }
}

export function formatTimerMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
