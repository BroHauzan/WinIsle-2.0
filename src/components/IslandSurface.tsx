import React, { useEffect, useRef, useState } from 'react';

interface SpringState {
  value: number;
  velocity: number;
  target: number;
  stiffness: number;
  damping: number;
}

function stepSpring(s: SpringState, dt: number): boolean {
  const force = (s.target - s.value) * s.stiffness - s.velocity * s.damping;
  s.velocity += force * dt;
  s.value += s.velocity * dt;
  if (Math.abs(s.target - s.value) < 0.2 && Math.abs(s.velocity) < 1.0) {
    s.value = s.target;
    s.velocity = 0;
    return true;
  }
  return false;
}

export interface IslandSurfaceProps {
  width: number;
  height: number;
  radius: number;
  shoulder: number;
  topInset: number;
  tintStyle?: 'none' | 'wash' | 'glow' | 'aura';
  tintRgb?: [number, number, number];
  auraColors?: [number, number, number][];
  voiceLevel?: number;
  voiceLevelRef?: React.RefObject<number | null>;
  nudgeTrigger?: number;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onClick?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}

export const IslandSurface: React.FC<IslandSurfaceProps> = ({
  width,
  height,
  radius,
  shoulder,
  topInset,
  tintStyle = 'none',
  tintRgb = [0.2, 0.5, 0.95],
  auraColors = [
    [0.56, 0.4, 1],
    [0.27, 0.56, 1],
    [0.22, 0.84, 0.96],
  ],
  voiceLevel = 0,
  voiceLevelRef,
  nudgeTrigger = 0,
  onMouseEnter,
  onMouseLeave,
  onClick,
  onContextMenu,
  children,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const voiceLevelRefInternal = useRef(voiceLevel);
  voiceLevelRefInternal.current = voiceLevel;
  const [dims, setDims] = useState({ w: width, h: height, r: radius, s: shoulder });

  const springsRef = useRef({
    w: { value: width, velocity: 0, target: width, stiffness: 210, damping: 19.5 },
    h: { value: height, velocity: 0, target: height, stiffness: 210, damping: 19.5 },
    r: { value: radius, velocity: 0, target: radius, stiffness: 200, damping: 23 },
    s: { value: shoulder, velocity: 0, target: shoulder, stiffness: 200, damping: 23 },
  });

  // Smoothly interpolated RGB & Wash Alpha for organic ambient transitions
  const rgbCurrentRef = useRef<[number, number, number]>(
    tintRgb && tintRgb.length === 3 ? [...tintRgb] : [0.54, 0.16, 0.14]
  );
  const rgbTargetRef = useRef<[number, number, number]>(
    tintRgb && tintRgb.length === 3 ? [...tintRgb] : [0.54, 0.16, 0.14]
  );
  const washAlphaRef = useRef({
    current: tintStyle === 'wash' ? 1 : 0,
    target: tintStyle === 'wash' ? 1 : 0,
  });

  useEffect(() => {
    if (tintRgb && tintRgb.length === 3) {
      rgbTargetRef.current = [tintRgb[0], tintRgb[1], tintRgb[2]];
    }
  }, [tintRgb]);

  useEffect(() => {
    washAlphaRef.current.target = tintStyle === 'wash' ? 1 : 0;
  }, [tintStyle]);

  useEffect(() => {
    const sp = springsRef.current;
    const dw = width - sp.w.target;
    const dh = height - sp.h.target;
    // Add subtle organic elastic impulse when morphing between modes/menus
    if (Math.abs(dw) > 12) {
      sp.w.velocity += Math.sign(dw) * Math.min(180, Math.abs(dw) * 1.4);
    }
    if (Math.abs(dh) > 8) {
      sp.h.velocity += Math.sign(dh) * Math.min(140, Math.abs(dh) * 1.3);
    }
    sp.w.target = width;
    sp.h.target = height;
    sp.r.target = radius;
    sp.s.target = shoulder;
  }, [width, height, radius, shoulder]);

  useEffect(() => {
    if (nudgeTrigger > 0) {
      springsRef.current.w.velocity += 220;
    }
  }, [nudgeTrigger]);

  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();
    const startTime = lastTime;

    const tick = (now: number) => {
      if (document.hidden) {
        lastTime = now;
        rafId = requestAnimationFrame(tick);
        return;
      }
      const dt = Math.min(0.04, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;
      const sp = springsRef.current;
      stepSpring(sp.w, dt);
      stepSpring(sp.h, dt);
      stepSpring(sp.r, dt);
      stepSpring(sp.s, dt);

      // Smoothly lerp current RGB & wash opacity towards target
      const lerpFactor = Math.min(1, dt * 7.0);
      const curRgb = rgbCurrentRef.current;
      const tgtRgb = rgbTargetRef.current;
      curRgb[0] += (tgtRgb[0] - curRgb[0]) * lerpFactor;
      curRgb[1] += (tgtRgb[1] - curRgb[1]) * lerpFactor;
      curRgb[2] += (tgtRgb[2] - curRgb[2]) * lerpFactor;

      const wa = washAlphaRef.current;
      wa.current += (wa.target - wa.current) * Math.min(1, dt * 7.5);

      const curW = Math.max(0, sp.w.value);
      const curH = Math.max(0, sp.h.value);
      const curR = Math.max(0, sp.r.value);
      const curS = Math.max(0, sp.s.value);

      setDims((prev) => {
        const nw = Math.ceil(curW);
        const nh = Math.ceil(curH);
        const nr = Math.ceil(curR);
        const ns = Math.ceil(curS);
        if (prev.w === nw && prev.h === nh && prev.r === nr && prev.s === ns) return prev;
        return { w: nw, h: nh, r: nr, s: ns };
      });

      const canvas = canvasRef.current;
      if (canvas) {
        const dpr = window.devicePixelRatio || 1;
        const outerW = Math.ceil(curW + 2 * curS) + 8;
        const outerH = Math.ceil(curH) + 8;
        if (canvas.width !== Math.round(outerW * dpr) || canvas.height !== Math.round(outerH * dpr)) {
          canvas.width = Math.round(outerW * dpr);
          canvas.height = Math.round(outerH * dpr);
          canvas.style.width = `${outerW}px`;
          canvas.style.height = `${outerH}px`;
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.scale(dpr, dpr);
          ctx.translate(4, 0);

          const top = Math.min(topInset, curH);
          const margin = curS;
          const sh = Math.min(margin, Math.max(0, (curH - top) / 2));
          const left = margin;
          const right = left + curW;
          const hanging = Math.min(1, margin / 4);
          const rad = Math.max(0, Math.min(curR, curH - top * hanging - sh, (right - left) / 2));

          // Trace concave-shoulder notch path
          const traceOutline = () => {
            ctx.beginPath();
            ctx.moveTo(left - sh, 0);
            ctx.lineTo(right + sh, 0);
            ctx.lineTo(right + sh, top);
            if (sh > 0.1) {
              ctx.arc(right + sh, top + sh, sh, -Math.PI / 2, -Math.PI, true);
            } else {
              ctx.lineTo(right, top);
            }
            ctx.lineTo(right, curH - rad);
            if (rad > 0.1) {
              ctx.arc(right - rad, curH - rad, rad, 0, Math.PI / 2, false);
              ctx.arc(left + rad, curH - rad, rad, Math.PI / 2, Math.PI, false);
            } else {
              ctx.lineTo(right, curH);
              ctx.lineTo(left, curH);
            }
            ctx.lineTo(left, top + sh);
            if (sh > 0.1) {
              ctx.arc(left - sh, top + sh, sh, 0, -Math.PI / 2, true);
            } else {
              ctx.lineTo(left, top);
            }
            ctx.closePath();
          };

          const traceSidesAndBottom = () => {
            ctx.beginPath();
            ctx.moveTo(left, top + sh);
            ctx.lineTo(left, curH - rad);
            if (rad > 0.1) {
              ctx.arc(left + rad, curH - rad, rad, Math.PI, Math.PI / 2, true);
              ctx.lineTo(right - rad, curH);
              ctx.arc(right - rad, curH - rad, rad, Math.PI / 2, 0, true);
            } else {
              ctx.lineTo(left, curH);
              ctx.lineTo(right, curH);
            }
            ctx.lineTo(right, top + sh);
          };

          // Draw pure black notch body
          traceOutline();
          ctx.fillStyle = '#000000';
          ctx.fill();

          // Dominant Cover Color Wash (smoothly interpolated via wa.current)
          if (wa.current > 0.005 && tintStyle !== 'glow' && tintStyle !== 'aura') {
            ctx.save();
            traceOutline();
            ctx.clip();
            const [r, g, b] = curRgb;
            const R = Math.round(r * 255);
            const G = Math.round(g * 255);
            const B = Math.round(b * 255);
            const a = wa.current;

            // 1. Diagonal warm ambient wash across the island
            const wash = ctx.createLinearGradient(left, top, right, curH);
            wash.addColorStop(0, `rgba(${R}, ${G}, ${B}, ${(0.06 * a).toFixed(3)})`);
            wash.addColorStop(0.45, `rgba(${R}, ${G}, ${B}, ${(0.25 * a).toFixed(3)})`);
            wash.addColorStop(1, `rgba(${R}, ${G}, ${B}, ${(0.58 * a).toFixed(3)})`);
            ctx.fillStyle = wash;
            ctx.fillRect(0, 0, outerW, outerH);

            // 2. Soft radial aura bloom on bottom-left and bottom-right
            const bloomL = ctx.createRadialGradient(
              left + curW * 0.25,
              curH,
              4,
              left + curW * 0.25,
              curH,
              curW * 0.55
            );
            bloomL.addColorStop(0, `rgba(${R}, ${G}, ${B}, ${(0.34 * a).toFixed(3)})`);
            bloomL.addColorStop(1, `rgba(${R}, ${G}, ${B}, 0)`);
            ctx.fillStyle = bloomL;
            ctx.fillRect(0, 0, outerW, outerH);

            ctx.restore();
          } else if (tintStyle === 'glow') {
            // Corner Drop Glow
            ctx.save();
            traceOutline();
            ctx.clip();
            const [r, g, b] = curRgb;
            const gRad = Math.min((right - left) * 0.36, Math.max(0, curH - top) * 1.05);
            for (const cx of [left + gRad * 0.12, right - gRad * 0.12]) {
              const rg = ctx.createRadialGradient(cx, curH + gRad * 0.2, 0, cx, curH + gRad * 0.2, gRad);
              rg.addColorStop(0, `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, 0.85)`);
              rg.addColorStop(0.4, `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, 0.38)`);
              rg.addColorStop(1, `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, 0)`);
              ctx.fillStyle = rg;
              ctx.fillRect(0, 0, outerW, outerH);
            }
            ctx.restore();
          } else if (tintStyle === 'aura') {
            // Smooth Animated Ambient Gradient Inside Island (No moving border stroke)
            ctx.save();
            traceOutline();
            ctx.clip();

            const elapsed = Math.max(0, (now - startTime) / 1000);
            const geminiPalette: [number, number, number][] = [
              [0.26, 0.52, 0.96], // Blue
              [0.61, 0.45, 0.98], // Violet
              [0.93, 0.40, 0.58], // Rose
              [0.22, 0.78, 0.98], // Sky Cyan
            ];
            const pLen = geminiPalette.length;

            const makeFlow = (alpha: number, shift: number) => {
              const grad = ctx.createLinearGradient(left, top, right, curH);
              const stops = 16;
              for (let i = 0; i <= stops; i++) {
                const x = i / stops;
                const at = Math.abs((x + (elapsed * 0.18 + shift)) * pLen);
                const idx = Math.floor(at);
                const m = at - idx;
                const i1 = ((idx % pLen) + pLen) % pLen;
                const i2 = (((idx + 1) % pLen) + pLen) % pLen;
                const c1 = geminiPalette[i1];
                const c2 = geminiPalette[i2];
                const rr = Math.round((c1[0] + (c2[0] - c1[0]) * m) * 255);
                const gg = Math.round((c1[1] + (c2[1] - c1[1]) * m) * 255);
                const bb = Math.round((c1[2] + (c2[2] - c1[2]) * m) * 255);
                grad.addColorStop(x, `rgba(${rr}, ${gg}, ${bb}, ${alpha})`);
              }
              return grad;
            };

            // Soft animated gradient wash across the island interior
            const curVoiceLevel = voiceLevelRef?.current ?? voiceLevelRefInternal.current ?? 0;
            ctx.fillStyle = makeFlow(0.16 + curVoiceLevel * 0.1, 0);
            ctx.fillRect(0, 0, outerW, outerH);

            // Soft bottom radial ambient glow
            const bottomGlow = ctx.createRadialGradient(
              (left + right) / 2,
              curH + 8,
              4,
              (left + right) / 2,
              curH + 8,
              curW * 0.6
            );
            bottomGlow.addColorStop(0, `rgba(155, 114, 251, ${0.22 + curVoiceLevel * 0.14})`);
            bottomGlow.addColorStop(0.55, `rgba(66, 133, 244, ${0.1 + curVoiceLevel * 0.08})`);
            bottomGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = bottomGlow;
            ctx.fillRect(0, 0, outerW, outerH);

            ctx.restore();
          }

          // Subtle top-inner border highlight (skip top bezel edge)
          ctx.save();
          traceSidesAndBottom();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();

          ctx.restore();
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [topInset, tintStyle, auraColors, voiceLevelRef]);

  return (
    <div
      id="dynamic-island-surface"
      data-island-surface="true"
      className="relative flex flex-col items-center select-none pointer-events-auto"
      style={{
        width: `${dims.w + 2 * dims.s}px`,
        height: `${dims.h}px`,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2"
      />
      <div
        className="relative z-10 overflow-hidden flex flex-col justify-between"
        style={{
          width: `${dims.w}px`,
          height: `${dims.h}px`,
          borderBottomLeftRadius: `${dims.r}px`,
          borderBottomRightRadius: `${dims.r}px`,
          clipPath: `inset(0px 0px 0px 0px round 0px 0px ${dims.r}px ${dims.r}px)`,
        }}
      >
        {children}
      </div>
    </div>
  );
};
