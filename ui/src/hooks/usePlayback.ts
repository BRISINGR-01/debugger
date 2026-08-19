import { useEffect, useRef } from "react";

const PLAY_DURATION_MS = 7000;

export function usePlayback(
  playing: boolean,
  currentTime: number,
  setCurrentTime: (n: number) => void,
  minTime: number,
  maxTime: number,
  setPlaying: (n: boolean) => void,
) {
  const rafRef = useRef<number>(null);

  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return () => {};
    }

    const start = performance.now();
    const startTime = currentTime >= maxTime ? minTime : currentTime;
    const tick = (now: number) => {
      const frac = (now - start) / PLAY_DURATION_MS;
      const t = startTime + frac * (maxTime - startTime);
      if (t >= maxTime) {
        setCurrentTime(maxTime);
        setPlaying(false);
        return;
      }
      setCurrentTime(t);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => rafRef.current && cancelAnimationFrame(rafRef.current);
  }, [playing]);
}
