import React, { useEffect, useRef } from 'react';
import { Bot, BotColorName, BotForm, BotShapeName, paletteFor } from '../core/bot';

interface BotCanvasProps {
  size?: number;
  shape: BotShapeName;
  color: BotColorName;
  glowMode?: 'match' | 'classic';
  form?: BotForm;
  voiceLevel?: number;
  voiceLevelRef?: React.RefObject<number | null>;
  gestureTrigger?: { type: 'nod' | 'shake' | 'hop'; id: number } | null;
  className?: string;
}

export const BotCanvas: React.FC<BotCanvasProps> = ({
  size = 36,
  shape,
  color,
  glowMode = 'match',
  form = 'listening',
  voiceLevel = 0,
  voiceLevelRef,
  gestureTrigger = null,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const botRef = useRef<Bot | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const levelRef = useRef(voiceLevel);
  levelRef.current = voiceLevel;

  if (!botRef.current) {
    botRef.current = new Bot(shape, paletteFor(color, glowMode));
  }

  useEffect(() => {
    const bot = botRef.current;
    if (!bot) return;
    bot.setShape(shape);
    bot.palette = paletteFor(color, glowMode);
  }, [shape, color, glowMode]);

  useEffect(() => {
    botRef.current?.setForm(form);
  }, [form]);

  useEffect(() => {
    if (gestureTrigger) {
      botRef.current?.gesture(gestureTrigger.type);
    }
  }, [gestureTrigger]);

  useEffect(() => {
    if (form === 'reply') return;
    const handleMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = Math.max(-1, Math.min(1, (e.clientX - cx) / 280));
      const dy = Math.max(-1, Math.min(1, (e.clientY - cy) / 220));
      pointerRef.current = { x: dx, y: dy };
    };
    window.addEventListener('mousemove', handleMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMove);
  }, [form]);

  useEffect(() => {
    let rafId = 0;
    const start = performance.now();
    let lastDraw = 0;

    const drawFrame = (now: number) => {
      const canvas = canvasRef.current;
      const bot = botRef.current;
      if (canvas && bot) {
        const targetW = Math.max(1, Math.round(size));
        if (canvas.width !== targetW || canvas.height !== targetW) {
          canvas.width = targetW;
          canvas.height = targetW;
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.clearRect(0, 0, targetW, targetW);
          const elapsed = (now - start) / 1000;
          const currentLevel = voiceLevelRef?.current ?? levelRef.current;
          bot.step(elapsed, pointerRef.current, currentLevel);
          bot.paint(ctx, size);
          ctx.restore();
        }
      }
    };

    // Static reply avatar only needs a single paint (0% ongoing GPU/CPU usage)
    if (form === 'reply' && !gestureTrigger) {
      drawFrame(start);
      return;
    }

    const render = (now: number) => {
      if (document.hidden) {
        rafId = requestAnimationFrame(render);
        return;
      }
      if (now - lastDraw >= 48) {
        lastDraw = now;
        drawFrame(now);
      }
      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [size, form, shape, color, glowMode, gestureTrigger, voiceLevelRef]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
      className={`shrink-0 ${className}`}
    />
  );
};
