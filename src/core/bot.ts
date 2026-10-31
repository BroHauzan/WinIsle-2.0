// Ported from gnome-extension/src/bot.js & gnome-extension/src/glow.js
// Draws the assistant's character (8 shapes, 11 colors, 3D foreshortened eyes, saccades, blinks, gestures)
// onto an HTML5 Canvas 2D context.

const SAMPLES = 64;
const ANGLES = Array.from({ length: SAMPLES }, (_, i) => (i / SAMPLES) * 2 * Math.PI);
const COS = ANGLES.map(Math.cos);
const SIN = ANGLES.map(Math.sin);

export const CLASSIC_GLOW: [number, number, number][] = [
  [0.56, 0.4, 1],
  [0.27, 0.56, 1],
  [0.22, 0.84, 0.96],
];

const normalize = (radii: number[], peak = 1): Float64Array => {
  const most = Math.max(...radii);
  return Float64Array.from(radii, (r) => (r * peak) / most);
};

function unionOfCircles(circles: { x: number; y: number; r: number }[]): number[] {
  return ANGLES.map((_, i) =>
    Math.max(
      0,
      ...circles.map(({ x, y, r }) => {
        const b = COS[i] * x + SIN[i] * y;
        const disc = b * b - (x * x + y * y - r * r);
        return disc < 0 ? 0 : b + Math.sqrt(disc);
      })
    )
  );
}

function fromPolygon(points: [number, number][]): number[] {
  return ANGLES.map((_, k) => {
    let best = 0;
    for (let i = 0; i < points.length; i++) {
      const [ax, ay] = points[i];
      const [bx, by] = points[(i + 1) % points.length];
      const ex = bx - ax;
      const ey = by - ay;
      const den = COS[k] * ey - SIN[k] * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = (ax * ey - ay * ex) / den;
      const u = (ax * SIN[k] - ay * COS[k]) / den;
      if (t > best && u >= 0 && u <= 1) best = t;
    }
    return best;
  });
}

function hullOfCircles(x1: number, y1: number, r1: number, x2: number, y2: number, r2: number): [number, number][] {
  const base = Math.atan2(y2 - y1, x2 - x1);
  const spread = Math.acos(Math.max(-1, Math.min(1, (r1 - r2) / (Math.hypot(x2 - x1, y2 - y1) || 1e-6))));
  const points: [number, number][] = [];
  for (let i = 0; i <= 48; i++) {
    const a = base + spread + ((2 * Math.PI - 2 * spread) * i) / 48;
    points.push([x1 + Math.cos(a) * r1, y1 + Math.sin(a) * r1]);
  }
  for (let i = 0; i <= 48; i++) {
    const a = base - spread + (2 * spread * i) / 48;
    points.push([x2 + Math.cos(a) * r2, y2 + Math.sin(a) * r2]);
  }
  return points;
}

function roundedPolygon(sides: number, radius: number, round: number, turn = 0): [number, number][] {
  const points: [number, number][] = [];
  for (let i = 0; i < sides; i++) {
    const a = turn + (i / sides) * 2 * Math.PI;
    const cx = Math.cos(a) * (radius - round);
    const cy = Math.sin(a) * (radius - round);
    const from = a - Math.PI / sides;
    const to = a + Math.PI / sides;
    for (let k = 0; k <= 10; k++) {
      const b = from + ((to - from) * k) / 10;
      points.push([cx + Math.cos(b) * round, cy + Math.sin(b) * round]);
    }
  }
  return points;
}

function ghostPoints(): [number, number][] {
  const points: [number, number][] = [];
  for (let i = 0; i <= 32; i++) {
    const a = Math.PI + (Math.PI * i) / 32;
    points.push([Math.cos(a), -0.08 + Math.sin(a)]);
  }
  for (let i = 0; i <= 48; i++) {
    const u = i / 48;
    points.push([1 - 2 * u, 0.74 + 0.17 * Math.abs(Math.sin(3 * Math.PI * u))]);
  }
  return points;
}

export type BotShapeName = 'circle' | 'pebble' | 'squircle' | 'capsule' | 'cloud' | 'hexagon' | 'drop' | 'ghost';

export const SHAPES: Record<BotShapeName, { label: string; radii: Float64Array }> = {
  circle: { label: 'Circle', radii: new Float64Array(SAMPLES).fill(1) },
  pebble: {
    label: 'Pebble',
    radii: normalize(ANGLES.map((a) => 1 + 0.075 * Math.cos(2 * a + 0.5) + 0.035 * Math.cos(3 * a + 2.1)), 1.02),
  },
  squircle: {
    label: 'Squircle',
    radii: normalize(ANGLES.map((_, i) => (Math.abs(COS[i]) ** 4.2 + Math.abs(SIN[i]) ** 4.2) ** (-1 / 4.2)), 1.1),
  },
  capsule: {
    label: 'Capsule',
    radii: normalize(fromPolygon(hullOfCircles(-0.42, 0, 0.62, 0.42, 0, 0.62)), 1.08),
  },
  cloud: {
    label: 'Cloud',
    radii: normalize(
      unionOfCircles([
        { x: -0.44, y: 0.2, r: 0.54 },
        { x: 0.46, y: 0.2, r: 0.5 },
        { x: 0.02, y: 0.3, r: 0.6 },
        { x: -0.24, y: -0.3, r: 0.48 },
        { x: 0.3, y: -0.24, r: 0.44 },
      ]),
      1.06
    ),
  },
  hexagon: {
    label: 'Hexagon',
    radii: normalize(fromPolygon(roundedPolygon(6, 1.04, 0.26)), 1.04),
  },
  drop: {
    label: 'Drop',
    radii: normalize(fromPolygon(hullOfCircles(0, 0.28, 0.66, 0, -0.96, 0.05)), 1.06),
  },
  ghost: {
    label: 'Ghost',
    radii: normalize(fromPolygon(ghostPoints()), 1.04),
  },
};

const EYE_FIT: Partial<Record<BotShapeName, { y: number; size: number }>> = {
  cloud: { y: 0.1, size: 1 },
  drop: { y: 0.2, size: 0.9 },
  hexagon: { y: 0, size: 0.95 },
  ghost: { y: -0.06, size: 1 },
};

const hex = (value: string): [number, number, number] => [
  parseInt(value.slice(1, 3), 16) / 255,
  parseInt(value.slice(3, 5), 16) / 255,
  parseInt(value.slice(5, 7), 16) / 255,
];

const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const luminance = ([r, g, b]: [number, number, number]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

export type BotColorName =
  | 'cloud'
  | 'ink'
  | 'peach'
  | 'coral'
  | 'amber'
  | 'mint'
  | 'teal'
  | 'sky'
  | 'lavender'
  | 'rose'
  | 'graphite';

export const COLORS: Record<
  BotColorName,
  { label: string; body: string; glow: ([number, number, number] | string)[] }
> = {
  cloud: { label: 'Cloud', body: '#f5f5f8', glow: CLASSIC_GLOW },
  ink: { label: 'Ink', body: '#2a2a33', glow: ['#7f8cff', '#b9c2ff', '#5fb4ff'] },
  peach: { label: 'Peach', body: '#ffb48f', glow: ['#ff7a59', '#ffb36b', '#ff8fa3'] },
  coral: { label: 'Coral', body: '#ff6f61', glow: ['#ff4d6d', '#ff7a45', '#ffb347'] },
  amber: { label: 'Amber', body: '#ffc94a', glow: ['#ff9f0a', '#ffd60a', '#ff7a2f'] },
  mint: { label: 'Mint', body: '#63e2ad', glow: ['#30d158', '#5fe0c0', '#b4f05a'] },
  teal: { label: 'Teal', body: '#2fc6b8', glow: ['#30c8d8', '#30d1a0', '#4f9dff'] },
  sky: { label: 'Sky', body: '#5eaaff', glow: ['#4f7dff', '#3fb6ff', '#6fe3ff'] },
  lavender: { label: 'Lavender', body: '#ab8eff', glow: ['#8f66ff', '#c77dff', '#5e7bff'] },
  rose: { label: 'Rose', body: '#ff80b8', glow: ['#ff5fa2', '#c86bff', '#ff8a7a'] },
  graphite: { label: 'Graphite', body: '#8f909c', glow: ['#a0a8c0', '#d6dae6', '#7d8bb0'] },
};

const toRgb = (c: [number, number, number] | string): [number, number, number] =>
  typeof c === 'string' ? hex(c) : c;

export interface BotPalette {
  base: [number, number, number];
  light: [number, number, number];
  shade: [number, number, number];
  eyes: [number, number, number];
  glow: [number, number, number][];
  dark: boolean;
}

export function paletteFor(color: BotColorName = 'cloud', glowMode: 'match' | 'classic' = 'match'): BotPalette {
  const preset = COLORS[color] ?? COLORS.cloud;
  const base = hex(preset.body);
  const dark = luminance(base) < 0.42;
  const light = base.every((v) => v > 0.9);
  const glowColors = glowMode === 'classic' ? CLASSIC_GLOW : preset.glow.map(toRgb);

  return {
    base,
    light: mix(base, [1, 1, 1], dark ? 0.22 : 0.55),
    shade: light ? [0.74, 0.76, 0.84] : mix(base, [0, 0, 0.04], dark ? 0.35 : 0.3),
    eyes: dark ? [0.96, 0.96, 0.98] : [0.07, 0.07, 0.09],
    glow: glowColors,
    dark,
  };
}

interface EyeSpec {
  w: number;
  h: number;
  tilt: number;
  open: number;
  curve: number;
}

interface ExpressionSpec {
  yaw: number;
  pitch: number;
  roll: number;
  split: number;
  eyes: [EyeSpec, EyeSpec];
}

const pair = (w: number, h: number, tilt = 0, open = 1, curve = 0): [EyeSpec, EyeSpec] => [
  { w, h, tilt, open, curve },
  { w, h, tilt: -tilt, open, curve },
];

const EXPRESSIONS: Record<string, ExpressionSpec> = {
  attentive: { yaw: 3, pitch: 4, roll: 0, split: 16, eyes: pair(0.22, 0.44) },
  surprised: { yaw: 0, pitch: -2, roll: 0, split: 17.5, eyes: pair(0.32, 0.5) },
  curious: { yaw: 8, pitch: -5, roll: -5, split: 16, eyes: pair(0.22, 0.42) },
  happy: { yaw: 2, pitch: 7, roll: 0, split: 17, eyes: pair(0.3, 0.27, 0, 1, 1) },
  joy: { yaw: 0, pitch: 8, roll: 0, split: 17.5, eyes: pair(0.34, 0.3, 0, 1, 1) },
  focused: { yaw: 0, pitch: -4, roll: 0, split: 15.5, eyes: pair(0.23, 0.42, 0, 0.64) },
  confused: {
    yaw: -6,
    pitch: 2,
    roll: 7,
    split: 16,
    eyes: [
      { w: 0.22, h: 0.44, tilt: 0, open: 1, curve: 0 },
      { w: 0.22, h: 0.44, tilt: 0, open: 0.66, curve: 0 },
    ],
  },
  sad: { yaw: 2, pitch: -9, roll: 0, split: 15.5, eyes: pair(0.22, 0.42, 0, 0.6) },
  sleepy: { yaw: 3, pitch: -7, roll: -2, split: 16, eyes: pair(0.22, 0.42, 0, 0.4) },
};

const copyExpression = (e: ExpressionSpec): ExpressionSpec => ({
  yaw: e.yaw,
  pitch: e.pitch,
  roll: e.roll,
  split: e.split,
  eyes: [{ ...e.eyes[0] }, { ...e.eyes[1] }],
});

export type BotForm =
  | 'listening'
  | 'typing'
  | 'thinking'
  | 'searching'
  | 'asking'
  | 'running'
  | 'reply'
  | 'success'
  | 'confused'
  | 'error';

const HEAD = 15 / 36;
const EYE_BALL = 17.3 / 15;
const EYE_UNIT = 20.3 / 15;
const LOOK_TURN = { yaw: 12, pitch: 10 };
const MAX_TURN = { yaw: 20, pitch: 16 };
const FORESHORTEN = 0.3;
const EYE_ROLL = 0.4;
const MORPH_RATE = 10;
const BLINK_S = 0.18;
const BLINK_CLOSING = 0.45;
const SMILE_S = 1.6;
const SACCADE = { stiffness: 420, damping: 25 };
const RAD = Math.PI / 180;

const clamp = (value: number, limit = 1) => Math.max(-limit, Math.min(limit, value));
const easeOutBack = (x: number) => 1 + 2.2 * (x - 1) ** 3 + 1.2 * (x - 1) ** 2;

function rotate(u: Float64Array, v: Float64Array, angle: number) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  for (let i = 0; i < 3; i++) {
    const x = u[i];
    const y = v[i];
    u[i] = x * c + y * s;
    v[i] = y * c - x * s;
  }
}

const rgba = ([r, g, b]: [number, number, number], a = 1) =>
  `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;

export class Bot {
  palette: BotPalette;
  private _radii: Float64Array;
  private _goalRadii: Float64Array;
  private _fit: { y: number; size: number };
  private _goalFit: { y: number; size: number };
  private _points = new Float64Array(2 * SAMPLES);
  private _head = {
    forward: new Float64Array(3),
    across: new Float64Array(3),
    up: new Float64Array(3),
  };
  private _places = [0, 1].map(() => ({
    x: 0,
    y: 0,
    at: new Float64Array(3),
    across: new Float64Array(3),
  }));
  private _turn = { yaw: 0, pitch: 0, roll: 0, split: 0, lift: 0, squash: 0 };
  time = 0;
  level = 0;
  private _form: BotForm = 'listening';
  private _formAt = 0;
  private _last = 0;
  private _gaze = { x: 0, y: 0, vx: 0, vy: 0 };
  private _glance = { x: 0, y: 0 };
  private _jitter = { x: 0, y: 0, next: 0 };
  private _nextGlance = 0;
  private _blinkAt = -1;
  private _nextBlink = 1.2;
  private _gesture: 'nod' | 'shake' | 'hop' | null = null;
  private _gestureAt = 0;
  private _expression = copyExpression(EXPRESSIONS.attentive);

  constructor(shape: BotShapeName = 'circle', palette: BotPalette = paletteFor()) {
    this.palette = palette;
    this._radii = Float64Array.from(SHAPES[shape]?.radii ?? SHAPES.circle.radii);
    this._goalRadii = SHAPES[shape]?.radii ?? SHAPES.circle.radii;
    this._fit = { y: 0, size: 1, ...EYE_FIT[shape] };
    this._goalFit = this._fit;
  }

  setShape(shape: BotShapeName) {
    const goal = SHAPES[shape]?.radii ?? SHAPES.circle.radii;
    if (goal === this._goalRadii) return;
    this._goalRadii = goal;
    this._goalFit = { y: 0, size: 1, ...EYE_FIT[shape] };
    this.blink();
  }

  setForm(form: BotForm) {
    if (form === this._form) return;
    this._form = form;
    this._formAt = this.time;
    this.blink();
    if (form === 'success') this.gesture('hop');
  }

  gesture(name: 'nod' | 'shake' | 'hop') {
    this._gesture = name;
    this._gestureAt = this.time;
  }

  blink() {
    if (this.time - this._blinkAt > BLINK_S) this._blinkAt = this.time;
  }

  step(time: number, look: { x: number; y: number } | null, level = 0) {
    const dt = Math.min(0.1, Math.max(0, time - this._last));
    this._last = this.time = time;
    this.level = level;

    const target = look ?? this._target(time);
    if (time >= this._jitter.next) {
      this._jitter.x = (Math.random() * 2 - 1) * 0.05;
      this._jitter.y = (Math.random() * 2 - 1) * 0.04;
      this._jitter.next = time + 0.35 + Math.random() * 0.6;
    }

    const gaze = this._gaze;
    const { stiffness, damping } = SACCADE;
    gaze.vx += ((target.x + this._jitter.x - gaze.x) * stiffness - gaze.vx * damping) * dt;
    gaze.vy += ((target.y + this._jitter.y - gaze.y) * stiffness - gaze.vy * damping) * dt;
    gaze.x += gaze.vx * dt;
    gaze.y += gaze.vy * dt;

    const exprKey = this._expressionAt(time);
    const goal = EXPRESSIONS[exprKey] ?? EXPRESSIONS.attentive;
    const morph = 1 - Math.exp(-dt * MORPH_RATE);
    const shape = this._expression;
    shape.yaw += (goal.yaw - shape.yaw) * morph;
    shape.pitch += (goal.pitch - shape.pitch) * morph;
    shape.roll += (goal.roll - shape.roll) * morph;
    shape.split += (goal.split - shape.split) * morph;

    for (let index = 0; index < 2; index++) {
      shape.eyes[index].w += (goal.eyes[index].w - shape.eyes[index].w) * morph;
      shape.eyes[index].h += (goal.eyes[index].h - shape.eyes[index].h) * morph;
      shape.eyes[index].tilt += (goal.eyes[index].tilt - shape.eyes[index].tilt) * morph;
      shape.eyes[index].open += (goal.eyes[index].open - shape.eyes[index].open) * morph;
      shape.eyes[index].curve += (goal.eyes[index].curve - shape.eyes[index].curve) * morph;
    }

    for (let i = 0; i < SAMPLES; i++) {
      this._radii[i] += (this._goalRadii[i] - this._radii[i]) * morph;
    }
    this._fit = {
      y: this._fit.y + (this._goalFit.y - this._fit.y) * morph,
      size: this._fit.size + (this._goalFit.size - this._fit.size) * morph,
    };

    if (time >= this._nextBlink) {
      this._blinkAt = time;
      const sleepy = shape.eyes[0].open < 0.7;
      this._nextBlink =
        time + (sleepy ? 3.5 + Math.random() * 3 : Math.random() < 0.18 ? 0.26 : 1.9 + Math.random() * 2.7);
    }

    if (this._gesture) {
      const gLen = this._gesture === 'nod' ? 0.7 : this._gesture === 'shake' ? 0.62 : 0.6;
      if (time - this._gestureAt > gLen) this._gesture = null;
    }
  }

  private _expressionAt(time: number): string {
    const since = time - this._formAt;
    switch (this._form) {
      case 'thinking':
      case 'searching':
        return 'curious';
      case 'running':
        return 'focused';
      case 'success':
        return since < SMILE_S ? 'joy' : 'attentive';
      case 'reply':
        return since < SMILE_S ? 'happy' : 'attentive';
      case 'confused':
        return 'confused';
      case 'error':
        return 'sad';
      default:
        return this.level > 0.35 ? 'surprised' : 'attentive';
    }
  }

  private _target(time: number): { x: number; y: number } {
    switch (this._form) {
      case 'thinking':
        return { x: 0.3 * Math.sin(time * 1.3), y: -0.25 };
      case 'searching':
        return { x: 0.85 * Math.sin(time * 2.2), y: 0.15 + 0.1 * Math.sin(time * 0.7) };
      case 'asking':
        return { x: Math.sin(time * 0.5) > 0.85 ? 0 : 0.5, y: 0.45 };
      case 'running':
        return { x: 0.25 * Math.sin(time * 0.9), y: 0.35 };
      case 'error':
        return { x: 0.15 * Math.sin(time * 0.8), y: 0.2 };
    }
    if (time >= this._nextGlance) {
      this._glance.x = (Math.random() * 2 - 1) * 0.7;
      this._glance.y = (Math.random() * 2 - 1) * 0.45;
      this._nextGlance = time + 1.1 + Math.random() * 2.2;
    }
    return this._glance;
  }

  paint(ctx: CanvasRenderingContext2D, size: number) {
    const radius = size * HEAD;
    const since = this.time - this._formAt;
    const pop = easeOutBack(Math.min(1, since / 0.3));
    const { x: gx, y: gy } = this._gaze;
    const turn = this._turn;
    const shape = this._expression;
    const t = this.time * 2 * Math.PI;
    turn.lift = 0;
    turn.squash = 0;
    turn.yaw = shape.yaw + gx * LOOK_TURN.yaw + 2.2 * Math.sin(t / 11.3 + 0.4) + 0.7 * Math.sin(t / 3.7 + 2.1);
    turn.pitch = shape.pitch - gy * LOOK_TURN.pitch + 1.7 * Math.sin(t / 9.1 + 1.3) + 0.5 * Math.sin(t / 4.3 + 0.7);
    turn.roll = shape.roll + 0.9 * Math.sin(t / 13.7 + 3.2);
    turn.split = shape.split;

    if (this._gesture) {
      const gt = this.time - this._gestureAt;
      if (this._gesture === 'nod') {
        turn.pitch -= 11 * Math.sin((gt * 2 * Math.PI) / 0.34) * (1 - gt / 0.7);
      } else if (this._gesture === 'shake') {
        turn.yaw += 14 * Math.sin((gt * 2 * Math.PI) / 0.24) * (1 - gt / 0.62);
      } else if (this._gesture === 'hop') {
        const up = Math.max(0, Math.sin((Math.PI * gt) / 0.36));
        turn.lift += gt < 0.36 ? up : 0;
        turn.squash += gt >= 0.36 ? 0.09 * Math.sin((Math.PI * (gt - 0.36)) / 0.24) : -0.05 * up;
      }
    }

    turn.yaw = clamp(turn.yaw, MAX_TURN.yaw);
    turn.pitch = clamp(turn.pitch, MAX_TURN.pitch);

    const voice = this._form === 'listening' ? this.level : 0;
    const breath = 0.006 * Math.sin(t / 3.4);
    const stretch = 1 + breath + 0.05 * voice - turn.squash;
    const widen = 1 - 0.5 * (stretch - 1);
    const scale = (0.88 + 0.12 * pop) * (1 + 0.03 * voice);

    ctx.save();
    ctx.translate(
      size / 2 + gx * radius * 0.087,
      size / 2 + gy * radius * 0.067 - turn.lift * radius * 0.16
    );
    ctx.scale(scale * widen, scale * stretch);
    this._paintBody(ctx, radius);
    this._paintEyes(ctx, radius, turn);
    ctx.restore();
  }

  private _trace(ctx: CanvasRenderingContext2D, radius: number) {
    const p = this._points;
    for (let i = 0; i < SAMPLES; i++) {
      p[2 * i] = radius * this._radii[i] * COS[i];
      p[2 * i + 1] = radius * this._radii[i] * SIN[i];
    }
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    for (let i = 0; i < SAMPLES; i++) {
      const a = 2 * ((i + SAMPLES - 1) % SAMPLES);
      const b = 2 * i;
      const c = 2 * ((i + 1) % SAMPLES);
      const d = 2 * ((i + 2) % SAMPLES);
      ctx.bezierCurveTo(
        p[b] + (p[c] - p[a]) / 6,
        p[b + 1] + (p[c + 1] - p[a + 1]) / 6,
        p[c] - (p[d] - p[b]) / 6,
        p[c + 1] - (p[d + 1] - p[b + 1]) / 6,
        p[c],
        p[c + 1]
      );
    }
    ctx.closePath();
  }

  private _paintBody(ctx: CanvasRenderingContext2D, radius: number) {
    const { light, base, shade, glow, dark } = this.palette;
    this._trace(ctx, radius);
    const bodyGrad = ctx.createRadialGradient(
      -0.38 * radius,
      -0.42 * radius,
      0,
      -0.1 * radius,
      -0.1 * radius,
      1.35 * radius
    );
    bodyGrad.addColorStop(0, rgba(light, 1));
    bodyGrad.addColorStop(0.45, rgba(base, 1));
    bodyGrad.addColorStop(1, rgba(shade, 1));
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    ctx.save();
    this._trace(ctx, radius);
    ctx.clip();

    const caught = ctx.createLinearGradient(0, 0.35 * radius, 0, 1.15 * radius);
    caught.addColorStop(0, rgba(glow[1], 0));
    caught.addColorStop(1, rgba(glow[1], dark ? 0.55 : 0.32));
    ctx.fillStyle = caught;
    ctx.fillRect(-radius * 1.5, -radius * 1.5, radius * 3, radius * 3);

    const glint = ctx.createRadialGradient(
      -0.42 * radius,
      -0.5 * radius,
      0,
      -0.42 * radius,
      -0.5 * radius,
      0.42 * radius
    );
    glint.addColorStop(0, `rgba(255,255,255,${dark ? 0.32 : 0.6})`);
    glint.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glint;
    ctx.fillRect(-radius * 1.5, -radius * 1.5, radius * 3, radius * 3);
    ctx.restore();

    this._trace(ctx, radius);
    ctx.lineWidth = Math.max(0.8, radius / 15);
    const rim = ctx.createLinearGradient(0, -radius, 0, radius);
    rim.addColorStop(0, `rgba(255,255,255,${dark ? 0.35 : 0.5})`);
    rim.addColorStop(0.5, `rgba(255,255,255,${dark ? 0.08 : 0})`);
    rim.addColorStop(1, rgba(glow[1], dark ? 0.6 : 0.25));
    ctx.strokeStyle = rim;
    ctx.stroke();
  }

  private _paintEyes(ctx: CanvasRenderingContext2D, radius: number, turn: typeof this._turn) {
    const { forward, across, up } = this._head;
    forward.fill(0);
    across.fill(0);
    up.fill(0);
    forward[2] = 1;
    across[0] = 1;
    up[1] = 1;
    rotate(forward, across, turn.yaw * RAD);
    rotate(up, forward, turn.pitch * RAD);
    rotate(across, up, turn.roll * RAD);
    const ball = radius * EYE_BALL * this._fit.size;
    const shift = radius * this._fit.y;

    for (let index = 0; index < 2; index++) {
      const place = this._places[index];
      place.at.set(forward);
      place.across.set(across);
      rotate(place.at, place.across, turn.split * (index ? 1 : -1) * RAD);
      this._paintEye(
        ctx,
        radius,
        place.at[0] * ball,
        place.at[1] * ball + shift,
        place.across,
        up,
        this._expression.eyes[index]
      );
    }
  }

  private _paintEye(
    ctx: CanvasRenderingContext2D,
    radius: number,
    x: number,
    y: number,
    across: Float64Array,
    up: Float64Array,
    eye: EyeSpec
  ) {
    const unit = radius * EYE_UNIT * this._fit.size;
    const since = this.time - this._blinkAt;
    const length = eye.open < 0.7 ? 2 * BLINK_S : BLINK_S;
    let lid = 1;
    if (since >= 0 && since < length) {
      const at = since / length;
      lid = at < BLINK_CLOSING ? 1 - at / BLINK_CLOSING : (at - BLINK_CLOSING) / (1 - BLINK_CLOSING);
    }
    const listening = this._form === 'listening' ? 1 + 0.28 * this.level : 1;
    const w = unit * eye.w;
    const h = unit * eye.h * listening * (0.08 + 0.92 * lid);
    const angle = Math.atan2(across[1], across[0]);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle * EYE_ROLL);
    const across1 = Math.hypot(across[0], across[1]);
    const up1 = Math.abs(-Math.sin(angle) * up[0] + Math.cos(angle) * up[1]);
    ctx.scale(1 - FORESHORTEN * (1 - across1), 1 - FORESHORTEN * (1 - up1));
    ctx.rotate(eye.tilt * RAD);

    const open = Math.max(0.12, Math.min(1, eye.open));
    if (open < 0.99) {
      ctx.beginPath();
      ctx.rect(-w, h / 2 - h * open, 2 * w, h * open + 1);
      ctx.clip();
    }

    if (eye.curve < 0.98) {
      const rr = Math.min(w, h) / 2;
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, rr);
      ctx.fillStyle = rgba(this.palette.eyes, 1 - eye.curve);
      ctx.fill();
    }

    if (eye.curve > 0.02) {
      const arc = w / 2;
      ctx.strokeStyle = rgba(this.palette.eyes, eye.curve);
      ctx.lineWidth = Math.max(1.2, w * 0.42);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, arc * 0.55 + (1 - lid) * arc * 0.3, arc, Math.PI * 1.18, Math.PI * 1.82);
      ctx.stroke();
    }
    ctx.restore();
  }
}
