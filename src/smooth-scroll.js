const MIN_DURATION = 280;
const MAX_DURATION = 650;
const DURATION_BASE = 180;
const DURATION_PER_PIXEL = 0.6;
const LINE_HEIGHT = 100 / 6;

// One easing shape for every step, but a step's length now sets its duration:
// short nudges settle fast, long jumps keep the same curve over a longer span.
function scrollDuration(distance) {
  const raw = DURATION_BASE + Math.abs(distance) * DURATION_PER_PIXEL;
  return Math.round(Math.min(MAX_DURATION, Math.max(MIN_DURATION, raw)));
}

// Match Urbiscor's wheel easing while moving the real document scroll position.
// Touch, anchor navigation, focus and keyboard scrolling remain browser-native.
export function initSmoothScroll() {
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const pointer = window.matchMedia("(any-pointer: fine)");
  const listeners = new AbortController();
  const { signal } = listeners;
  let enabled = false;
  let frame = 0;
  // Read layout only when a wheel gesture needs it, never during page startup.
  let from = 0;
  let target = 0;
  let written = 0;
  let started = 0;
  let span = MIN_DURATION;

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
  }

  function animate(time) {
    frame = 0;
    if (
      !enabled || document.hidden ||
      Math.abs(window.scrollY - written) > 1
    ) {
      stop();
      return;
    }
    const progress = Math.min(1, Math.max(0, (time - started) / span));
    const eased = progress === 1 ? 1 : Math.min(1, 1.001 - 2 ** (-10 * progress));
    window.scrollTo({ top: from + (target - from) * eased, behavior: "instant" });
    written = window.scrollY;
    if (progress < 1 && Math.abs(target - written) > 0.5) {
      frame = requestAnimationFrame(animate);
    }
  }

  function nativeTarget(event) {
    for (const element of event.composedPath()) {
      if (element === document.body || element === document.documentElement) break;
      if (!(element instanceof HTMLElement)) continue;
      if (element.matches("input, textarea, select, [contenteditable]:not([contenteditable='false']), [data-native-scroll]")) {
        return true;
      }
      if (
        element.scrollHeight > element.clientHeight + 1 &&
        /^(auto|scroll)$/.test(getComputedStyle(element).overflowY)
      ) {
        return true;
      }
    }
    return false;
  }

  function wheel(event) {
    if (
      !event.cancelable || event.defaultPrevented ||
      event.ctrlKey || event.metaKey || event.shiftKey ||
      Math.abs(event.deltaX) >= Math.abs(event.deltaY)
    ) {
      stop();
      return;
    }
    const modal = document.querySelector("dialog:modal");
    if (modal) {
      stop();
      if (!event.composedPath().includes(modal) && event.cancelable) event.preventDefault();
      return;
    }
    if (
      nativeTarget(event) ||
      [document.documentElement, document.body].some(element =>
        /^(hidden|clip)$/.test(getComputedStyle(element).overflowY),
      )
    ) {
      stop();
      return;
    }
    const multiplier = event.deltaMode === 1
      ? LINE_HEIGHT
      : event.deltaMode === 2 ? window.innerHeight : 1;
    const limit = Math.max(0, document.scrollingElement.scrollHeight - window.innerHeight);
    const next = Math.max(0, Math.min(limit, (frame ? target : window.scrollY) + event.deltaY * multiplier));
    if (next === window.scrollY && !frame) return;

    event.preventDefault();
    from = window.scrollY;
    target = next;
    written = from;
    started = performance.now();
    // A retarget keeps `from` at the live scroll position, so the step's own
    // distance (and therefore its duration) is recomputed on every gesture.
    span = scrollDuration(target - from);
    // Cancel a browser anchor animation when a new wheel gesture takes priority.
    window.scrollTo({ top: from, behavior: "instant" });
    if (!frame) frame = requestAnimationFrame(animate);
  }

  function update() {
    const next = pointer.matches && !motion.matches;
    if (next === enabled) return;
    stop();
    enabled = next;
    if (enabled) window.addEventListener("wheel", wheel, { passive: false, signal });
    else window.removeEventListener("wheel", wheel);
  }

  motion.addEventListener("change", update, { signal });
  pointer.addEventListener("change", update, { signal });
  for (const type of ["pointerdown", "touchstart", "keydown", "click"]) {
    document.addEventListener(type, stop, { capture: true, passive: true, signal });
  }
  for (const type of ["resize", "hashchange", "popstate"]) {
    window.addEventListener(type, stop, { passive: true, signal });
  }
  document.addEventListener("visibilitychange", stop, { signal });
  window.addEventListener("scroll", () => {
    if (frame && Math.abs(window.scrollY - written) > 1) stop();
  }, { passive: true, signal });
  update();

  return () => {
    stop();
    listeners.abort();
  };
}
