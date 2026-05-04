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
 * useHorizontalSwipe — full-screen horizontal swipe for page navigation,
 * rendered as a book-style page flip. The element hinges around its leading
 * edge (left edge for swipe-left/next, right edge for swipe-right/prev),
 * tilts via rotateY during drag, and on commit folds to ±95° (edge-on),
 * swaps content, and unfolds from the opposite ±95°.
 *
 * Direction lock: |dx|>12 && |dx|>|dy|*1.5 enters horizontal mode.
 * onProgress(dx, direction) fires every drag frame and on phase clears.
 */
export function useHorizontalSwipe(ref, { onPrev, onNext, onProgress, enabled = true, threshold = 0.3 }) {
  const state = useRef({ startX: 0, startY: 0, dx: 0, locked: null, swiping: false, raf: 0, startTime: 0 });
  const callbacks = useRef({ onPrev, onNext, onProgress });
  callbacks.current = { onPrev, onNext, onProgress };

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    function applyDragTransform(dx) {
      const screenW = window.innerWidth;
      const progress = Math.max(-1, Math.min(1, dx / screenW));
      // Damped tilt — finger moves dx but rotation only goes to ±22°
      const rotY = Math.max(-22, Math.min(22, progress * 32));
      const sc = 1 - 0.04 * Math.abs(progress);
      // Hinge at the leading edge (the side the page is "lifting" from)
      const origin = dx < 0 ? '0% 50%' : '100% 50%';
      el.style.transformOrigin = origin;
      el.style.transform = `translateX(${dx}px) rotateY(${rotY}deg) scale(${sc})`;
    }

    function clearTransform() {
      el.style.transition = '';
      el.style.transform = '';
      el.style.transformOrigin = '';
      el.style.opacity = '';
    }

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
        applyDragTransform(dx);
        callbacks.current.onProgress?.(dx, dx < 0 ? 'next' : 'prev');
      });

      e.preventDefault();
    }

    function foldFlip(direction) {
      // direction: 'next' (left hinge, fold to -95°) or 'prev' (right hinge, +95°)
      const outOrigin = direction === 'next' ? '0% 50%' : '100% 50%';
      const inOrigin = direction === 'next' ? '100% 50%' : '0% 50%';
      const outRot = direction === 'next' ? -95 : 95;
      const inRot = direction === 'next' ? 95 : -95;
      const trigger = direction === 'next' ? callbacks.current.onNext : callbacks.current.onPrev;

      // Phase 1: fold out (page rotates to edge-on)
      el.style.transition = 'transform .2s cubic-bezier(.4,.05,.7,.4), opacity .16s linear';
      el.style.transformOrigin = outOrigin;
      el.style.transform = `translateX(0) rotateY(${outRot}deg) scale(.94)`;
      el.style.opacity = '0';
      callbacks.current.onProgress?.(0, null);

      setTimeout(() => {
        // Swap content
        trigger?.();
        // Phase 2: jump to opposite hinge, edge-on, invisible
        el.style.transition = 'none';
        el.style.transformOrigin = inOrigin;
        el.style.transform = `translateX(0) rotateY(${inRot}deg) scale(.94)`;
        el.style.opacity = '0';

        requestAnimationFrame(() => {
          // Phase 3: unfold to face-on
          el.style.transition = 'transform .22s cubic-bezier(.2,.8,.2,1), opacity .18s linear';
          el.style.transform = 'translateX(0) rotateY(0deg) scale(1)';
          el.style.opacity = '1';
          setTimeout(clearTransform, 240);
        });
      }, 200);
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

      if (trigger === 'next' || trigger === 'prev') {
        foldFlip(trigger);
      } else {
        // Rebound — settle back to identity
        el.style.transition = 'transform .22s cubic-bezier(.2,.8,.2,1)';
        el.style.transform = 'translateX(0) rotateY(0deg) scale(1)';
        callbacks.current.onProgress?.(0, null);
        setTimeout(clearTransform, 220);
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
