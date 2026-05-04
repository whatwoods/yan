// src/gestures.js — Touch gesture hooks with direction lock and RAF throttle.
import { useEffect, useRef } from 'react';

/**
 * useSwipeActions — horizontal left-swipe to reveal action buttons.
 * Direction lock: first move where |dx|>8 && |dx|>|dy| enters horizontal mode.
 * dx clamped to [-maxSwipe, 0]. Elastic overflow past maxSwipe.
 */
export function useSwipeActions(ref, { onDelete, onPin, isOpen, onOpenChange, maxSwipe = 120, threshold = 60, deleteThreshold }) {
  const state = useRef({ startX: 0, startY: 0, dx: 0, locked: null, swiping: false, raf: 0 });
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;
  const cb = useRef({ onDelete, onPin, onOpenChange });
  cb.current = { onDelete, onPin, onOpenChange };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function onTouchStart(e) {
      if (isOpenRef.current) return;
      const t = e.touches[0];
      state.current.startX = t.clientX;
      state.current.startY = t.clientY;
      state.current.dx = 0;
      state.current.locked = null;
      state.current.swiping = false;
    }

    function onTouchMove(e) {
      const s = state.current;
      if (s.locked === 'vertical') return;
      const t = e.touches[0];
      const rawDx = t.clientX - s.startX;
      const dy = t.clientY - s.startY;

      if (s.locked === null) {
        if (Math.abs(rawDx) < 8) return;
        if (Math.abs(rawDx) > Math.abs(dy)) {
          s.locked = 'horizontal';
          s.swiping = true;
        } else {
          s.locked = 'vertical';
          return;
        }
      }

      let dx = Math.min(0, rawDx);
      if (dx < -maxSwipe) {
        const overflow = dx + maxSwipe;
        dx = -maxSwipe + overflow * 0.3;
      }
      s.dx = dx;

      if (s.raf) cancelAnimationFrame(s.raf);
      s.raf = requestAnimationFrame(() => {
        el.style.transform = `translateX(${dx}px)`;
        el.style.transition = 'none';
      });

      e.preventDefault();
    }

    function onTouchEnd() {
      const s = state.current;
      if (!s.swiping) {
        s.locked = null;
        return;
      }

      if (s.raf) cancelAnimationFrame(s.raf);
      const dx = s.dx;
      const screenW = window.innerWidth;

      if (deleteThreshold && dx < -screenW * 0.4) {
        cb.current.onDelete?.();
        el.style.transition = 'transform .25s cubic-bezier(.2,.8,.2,1)';
        el.style.transform = 'translateX(0)';
        s.dx = 0;
        s.swiping = false;
        s.locked = null;
        return;
      }

      let snapX = 0;
      if (dx < -threshold) {
        snapX = -maxSwipe;
        cb.current.onOpenChange?.(true);
      } else {
        snapX = 0;
        cb.current.onOpenChange?.(false);
      }

      el.style.transition = 'transform .25s cubic-bezier(.2,.8,.2,1)';
      el.style.transform = `translateX(${snapX}px)`;
      s.dx = 0;
      s.swiping = false;
      s.locked = null;
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      if (state.current.raf) cancelAnimationFrame(state.current.raf);
    };
  }, [ref, maxSwipe, threshold, deleteThreshold]);

  const reset = () => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = 'transform .25s cubic-bezier(.2,.8,.2,1)';
    el.style.transform = 'translateX(0)';
    state.current.dx = 0;
    cb.current.onOpenChange?.(false);
  };

  return { reset, isSwiping: () => state.current.swiping };
}

/**
 * useLongPress — fires callback after delay ms of no movement.
 * Cancelled if finger moves beyond moveTolerance.
 * Also supports desktop right-click (onContextMenu).
 */
export function useLongPress(ref, onLongPress, { delay = 500, moveTolerance = 10 } = {}) {
  const timerRef = useRef(null);
  const startPos = useRef(null);
  const fired = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function onTouchStart(e) {
      const t = e.touches[0];
      startPos.current = { x: t.clientX, y: t.clientY };
      fired.current = false;
      timerRef.current = setTimeout(() => {
        fired.current = true;
        navigator.vibrate?.(15);
        onLongPress(e);
      }, delay);
    }

    function onTouchMove(e) {
      if (fired.current || !startPos.current) return;
      const t = e.touches[0];
      const dist = Math.hypot(t.clientX - startPos.current.x, t.clientY - startPos.current.y);
      if (dist > moveTolerance) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }

    function onTouchEnd() {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      startPos.current = null;
    }

    function onContextMenu(e) {
      e.preventDefault();
      fired.current = true;
      onLongPress(e);
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('contextmenu', onContextMenu);

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('contextmenu', onContextMenu);
      clearTimeout(timerRef.current);
    };
  }, [ref, onLongPress, delay, moveTolerance]);

  return { isLongPressFired: () => fired.current };
}

/**
 * useHorizontalSwipe — full-screen horizontal swipe for page navigation.
 * Direction lock: |dx|>12 && |dx|>|dy|*1.5 enters horizontal mode.
 * Calls onPrev/onNext when threshold crossed, otherwise rebounds.
 * Boundary rubber-banding when no prev/next available.
 */
export function useHorizontalSwipe(ref, { onPrev, onNext, enabled = true, threshold = 0.3 }) {
  const state = useRef({ startX: 0, startY: 0, dx: 0, locked: null, swiping: false, raf: 0, startTime: 0 });
  const callbacks = useRef({ onPrev, onNext });
  callbacks.current = { onPrev, onNext };

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    function onTouchStart(e) {
      const t = e.touches[0];
      state.current.startX = t.clientX;
      state.current.startY = t.clientY;
      state.current.dx = 0;
      state.current.locked = null;
      state.current.swiping = false;
      state.current.startTime = Date.now();
    }

    function onTouchMove(e) {
      const s = state.current;
      if (s.locked === 'vertical') return;
      const t = e.touches[0];
      const rawDx = t.clientX - s.startX;
      const dy = t.clientY - s.startY;

      // Direction lock — stricter: |dx| > 12 && |dx| > 1.5 * |dy|
      if (s.locked === null) {
        if (Math.abs(rawDx) < 12) return;
        if (Math.abs(rawDx) > Math.abs(dy) * 1.5) {
          s.locked = 'horizontal';
          s.swiping = true;
        } else {
          s.locked = 'vertical';
          return;
        }
      }

      let dx = rawDx;
      // Rubber-band at boundaries
      if ((dx > 0 && !callbacks.current.onPrev) || (dx < 0 && !callbacks.current.onNext)) {
        dx *= 0.3;
      }

      s.dx = dx;

      if (s.raf) cancelAnimationFrame(s.raf);
      s.raf = requestAnimationFrame(() => {
        el.style.transition = 'none';
        el.style.transform = `translateX(${dx}px)`;
      });

      e.preventDefault();
    }

    function onTouchEnd() {
      const s = state.current;
      if (!s.swiping) {
        s.locked = null;
        return;
      }

      if (s.raf) cancelAnimationFrame(s.raf);
      const dx = s.dx;
      const elapsed = Date.now() - s.startTime;
      const velocity = Math.abs(dx) / Math.max(elapsed, 1);
      const screenW = window.innerWidth;
      const absThreshold = screenW * threshold;

      let trigger = null;
      if (Math.abs(dx) > absThreshold || velocity > 0.4) {
        if (dx < 0 && callbacks.current.onNext) trigger = 'next';
        if (dx > 0 && callbacks.current.onPrev) trigger = 'prev';
      }

      s.dx = 0;
      s.swiping = false;
      s.locked = null;

      if (trigger === 'next') {
        // Slide out to left, switch content, slide in from right
        el.style.transition = 'transform .22s cubic-bezier(.2,.8,.2,1)';
        el.style.transform = `translateX(${-screenW}px)`;
        setTimeout(() => {
          el.style.transition = 'none';
          el.style.transform = `translateX(${screenW}px)`;
          callbacks.current.onNext?.();
          requestAnimationFrame(() => {
            el.style.transition = 'transform .22s cubic-bezier(.2,.8,.2,1)';
            el.style.transform = 'translateX(0)';
          });
        }, 220);
      } else if (trigger === 'prev') {
        // Slide out to right, switch content, slide in from left
        el.style.transition = 'transform .22s cubic-bezier(.2,.8,.2,1)';
        el.style.transform = `translateX(${screenW}px)`;
        setTimeout(() => {
          el.style.transition = 'none';
          el.style.transform = `translateX(${-screenW}px)`;
          callbacks.current.onPrev?.();
          requestAnimationFrame(() => {
            el.style.transition = 'transform .22s cubic-bezier(.2,.8,.2,1)';
            el.style.transform = 'translateX(0)';
          });
        }, 220);
      } else {
        // Rebound
        el.style.transition = 'transform .2s cubic-bezier(.2,.8,.2,1)';
        el.style.transform = 'translateX(0)';
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      if (state.current.raf) cancelAnimationFrame(state.current.raf);
    };
  }, [ref, enabled, threshold]);

  return { isSwiping: () => state.current.swiping };
}
