"use client";

import { useEffect, useMemo, useRef } from "react";
import { confetti } from "@tsparticles/confetti";

type Props = {
  active: boolean;
  triggerKey?: string;
  intensity?: number;  // 1..10
  durationMs?: number; // e.g. 4500
};

const RAINBOW = ["#ef4444", "#f97316", "#facc15", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899"];

export default function ConfettiRain({
  active,
  triggerKey,
  intensity = 5,
  durationMs = 4000,
}: Props) {
  const rafRef = useRef<number | null>(null);
  const endAtRef = useRef<number>(0);
  const lastTriggerRef = useRef<string | undefined>(undefined);

  // make sure init runs once
  const initPromiseRef = useRef<Promise<void> | null>(null);
  const ensureInit = () => {
    if (!initPromiseRef.current) initPromiseRef.current = confetti.init();
    return initPromiseRef.current;
  };

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const stop = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const rainFrame = (i: number) => {
    const packet = Math.max(1, Math.round(i)) * 5;

    // tsParticles confetti uses position.x/y in percent: 0..100 :contentReference[oaicite:1]{index=1}
    void confetti({
      count: packet,
      angle: 60,
      spread: 55,
      position: { x: 0, y: 0 },
      colors: RAINBOW,
      startVelocity: 35,
      zIndex: 9999,
      disableForReducedMotion: true,
    });

    void confetti({
      count: packet,
      angle: 120,
      spread: 55,
      position: { x: 100, y: 0 },
      colors: RAINBOW,
      startVelocity: 35,
      zIndex: 9999,
      disableForReducedMotion: true,
    });
  };

  const loop = () => {
    if (Date.now() >= endAtRef.current) {
      stop();
      return;
    }
    rainFrame(intensity);
    rafRef.current = requestAnimationFrame(loop);
  };

  const start = async () => {
    if (rafRef.current !== null) return;

    await ensureInit();

    if (prefersReducedMotion) {
      void confetti({
        count: 120,
        spread: 70,
        position: { x: 50, y: 10 },
        colors: RAINBOW,
        zIndex: 9999,
        disableForReducedMotion: true,
      });
      return;
    }

    endAtRef.current = Date.now() + durationMs;
    rafRef.current = requestAnimationFrame(loop);
  };

  // Start/stop based on props
  useEffect(() => {
    if (!active) {
      stop();
      return;
    }

    // re-trigger when triggerKey changes
    if (triggerKey !== undefined && lastTriggerRef.current !== triggerKey) {
      lastTriggerRef.current = triggerKey;
      stop();
      void start();
      return;
    }

    void start();
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, triggerKey, intensity, durationMs]);

  // Safety: stop when tab hidden
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return null;
}
