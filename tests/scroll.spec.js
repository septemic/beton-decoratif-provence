import { test, expect } from "@playwright/test";

async function probe(page) {
  await page.addInitScript(() => {
    const request = window.requestAnimationFrame.bind(window);
    const cancel = window.cancelAnimationFrame.bind(window);
    window.__scrollProbe = { positions: [], pending: new Set(), calls: 0, prevented: null };
    window.requestAnimationFrame = (callback) => {
      const id = request(time => {
        window.__scrollProbe.pending.delete(id);
        callback(time);
        window.__scrollProbe.positions.push(window.scrollY);
      });
      window.__scrollProbe.calls++;
      window.__scrollProbe.pending.add(id);
      return id;
    };
    window.cancelAnimationFrame = id => {
      window.__scrollProbe.pending.delete(id);
      cancel(id);
    };
  });
  await page.goto("./");
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    window.addEventListener("wheel", event => {
      window.__scrollProbe.prevented = event.defaultPrevented;
    }, { passive: true });
  });
  const viewport = page.viewportSize();
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
}

async function near(page, position) {
  await expect.poll(() => page.evaluate(() => scrollY), { timeout: 5000 })
    .toBeGreaterThanOrEqual(position - 1);
  await expect.poll(() => page.evaluate(() => scrollY), { timeout: 5000 })
    .toBeLessThanOrEqual(position + 1);
}

test("wheel movement eases to its destination and schedules no frames while idle", async ({ page }) => {
  await probe(page);
  const fine = await page.evaluate(() => matchMedia("(any-pointer: fine)").matches);
  await page.mouse.wheel(0, 600);
  await near(page, 600);
  await expect.poll(() => page.evaluate(() => window.__scrollProbe.pending.size)).toBe(0);
  const result = await page.evaluate(() => ({
    positions: window.__scrollProbe.positions,
    calls: window.__scrollProbe.calls,
    prevented: window.__scrollProbe.prevented,
  }));
  expect(result.prevented).toBe(fine);
  if (fine) {
    expect(result.positions.length).toBeGreaterThan(5);
    expect(result.positions[0]).toBeGreaterThan(0);
    expect(result.positions[0]).toBeLessThan(600);
    expect(result.positions.every((y, i, positions) => !i || y >= positions[i - 1])).toBe(true);
  } else {
    expect(result.calls).toBe(0);
  }
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.__scrollProbe.calls)).toBe(result.calls);
});

test("successive wheel gestures accumulate and can reverse direction", async ({ page }) => {
  await probe(page);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(90);
  await page.mouse.wheel(0, 350);
  await page.waitForTimeout(70);
  await page.mouse.wheel(0, -200);
  await near(page, 550);
  await expect.poll(() => page.evaluate(() => window.__scrollProbe.pending.size)).toBe(0);
});

test("keyboard and anchor navigation interrupt wheel inertia without being pulled back", async ({ page }, testInfo) => {
  await probe(page);
  await page.mouse.wheel(0, 600);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await page.keyboard.press("Home");
  await near(page, 0);
  await page.waitForTimeout(1250);
  await near(page, 0);

  await page.mouse.wheel(0, 450);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "Ouvrir le menu" }).click();
  }
  await page.getByRole("navigation", { name: "Navigation principale" })
    .getByRole("link", { name: /Votre projet/ }).click();
  await expect(page).toHaveURL(/#contact$/);
  await expect.poll(() => page.locator("#contact").evaluate(element => element.getBoundingClientRect().top))
    .toBeLessThanOrEqual(160);
  await page.waitForTimeout(1250);
  const top = await page.locator("#contact").evaluate(element => element.getBoundingClientRect().top);
  expect(top).toBeGreaterThanOrEqual(-1);
  expect(top).toBeLessThanOrEqual(160);
});

test("textarea and modal scrolling stay native and do not move the background", async ({ page }) => {
  await probe(page);
  const message = page.getByLabel("Parlez-nous de votre projet");
  await message.fill(Array(80).fill("Une ligne du projet.").join("\n"));
  // fill() leaves the caret at the end, so the textarea is already scrolled:
  // reset it so the poll below really waits for the wheel instead of passing at once.
  await message.evaluate(element => { element.scrollTop = 0; });
  await message.hover();
  const before = await page.evaluate(() => scrollY);
  await page.mouse.wheel(0, 350);
  await expect.poll(() => message.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => scrollY)).toBe(before);
  expect(await page.evaluate(() => window.__scrollProbe.prevented)).toBe(false);

  await page.setViewportSize({ width: page.viewportSize().width, height: 480 });
  await page.getByRole("button", { name: /Sable Doux/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.hover();
  const background = await page.evaluate(() => scrollY);
  await page.mouse.wheel(0, 400);
  await expect.poll(() => dialog.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await page.mouse.wheel(0, 5000);
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => scrollY)).toBe(background);
  expect(await page.evaluate(() => window.__scrollProbe.prevented)).toBe(false);
  expect(await page.evaluate(() => {
    const event = new WheelEvent("wheel", { deltaY: 400, ctrlKey: true, cancelable: true });
    window.dispatchEvent(event);
    return !event.defaultPrevented;
  })).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});

test("reduced motion changes cancel animation and zoom gestures are untouched", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await probe(page);
  await page.mouse.wheel(0, 350);
  await near(page, 350);
  expect(await page.evaluate(() => window.__scrollProbe.prevented)).toBe(false);
  expect(await page.evaluate(() => window.__scrollProbe.calls)).toBe(0);

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.mouse.wheel(0, 200);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(350);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => page.evaluate(() => window.__scrollProbe.pending.size)).toBe(0);
  const stopped = await page.evaluate(() => scrollY);
  await page.waitForTimeout(1250);
  expect(await page.evaluate(() => scrollY)).toBe(stopped);

  await page.emulateMedia({ reducedMotion: "no-preference" });
  const untouched = await page.evaluate(() => {
    const event = new WheelEvent("wheel", { deltaY: 400, ctrlKey: true, cancelable: true });
    window.dispatchEvent(event);
    return !event.defaultPrevented;
  });
  expect(untouched).toBe(true);
  expect(await page.evaluate(() => window.__scrollProbe.pending.size)).toBe(0);
});

test("touch scrolling and document boundaries remain usable", async ({ page }, testInfo) => {
  await probe(page);
  if (testInfo.project.name === "mobile") {
    const session = await page.context().newCDPSession(page);
    await page.evaluate(() => {
      window.__touchPrevented = [];
      window.addEventListener("touchmove", event => window.__touchPrevented.push(event.defaultPrevented), { passive: true });
    });
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 195, y: 650 }] });
    for (const y of [570, 490, 410, 330]) {
      await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 195, y }] });
      await page.waitForTimeout(40);
    }
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(200);
    expect(await page.evaluate(() => window.__touchPrevented.every(value => !value))).toBe(true);
    expect(await page.evaluate(() => window.__scrollProbe.calls)).toBe(0);
    await page.waitForTimeout(800);
    await session.detach();
  }
  await page.mouse.wheel(0, 1000000);
  const limit = await page.evaluate(() => document.scrollingElement.scrollHeight - innerHeight);
  await near(page, limit);
  await page.mouse.wheel(0, -1000000);
  await near(page, 0);
});

// Timing instrument: each animation frame records its timestamp and the real
// scroll position, so a step's settle time can be read from the clock instead
// of from how many frames the browser happened to run.
async function timing(page) {
  await page.addInitScript(() => {
    const request = window.requestAnimationFrame.bind(window);
    window.__timing = { frames: [], start: null };
    window.requestAnimationFrame = callback => request(time => {
      callback(time);
      window.__timing.frames.push({ time, position: window.scrollY });
    });
    window.addEventListener("wheel", () => {
      if (window.__timing.start === null) window.__timing.start = performance.now();
    }, { capture: true, passive: true });
  });
  await page.goto("./");
  await page.evaluate(() => document.fonts.ready);
  const viewport = page.viewportSize();
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
}

async function settleTime(page, delta) {
  await page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    window.__timing.frames.length = 0;
    window.__timing.start = null;
  });
  // Let the reset land before the wheel event, so the step starts from rest.
  await page.waitForTimeout(250);
  await page.mouse.wheel(0, delta);
  await expect.poll(() => page.evaluate(() => Math.round(scrollY)), { timeout: 5000 })
    .toBeGreaterThanOrEqual(delta - 1);
  return page.evaluate(() => {
    const { frames, start } = window.__timing;
    const settled = frames[frames.length - 1];
    const arrived = frames.find(frame => settled.position - frame.position <= 1);
    return arrived && start !== null ? Math.round(arrived.time - start) : null;
  });
}

test("wheel settle time follows the step distance, not a fixed duration", async ({ page }) => {
  await timing(page);
  const fine = await page.evaluate(() => matchMedia("(any-pointer: fine)").matches);
  test.skip(!fine, "wheel smoothing only runs on fine pointers");

  const short = await settleTime(page, 100);
  const long = await settleTime(page, 1200);

  expect(short).not.toBeNull();
  expect(long).not.toBeNull();
  // CI tolerances: the measured values are roughly 200ms and 450ms.
  expect(short).toBeLessThanOrEqual(600);
  expect(long).toBeLessThanOrEqual(900);
  // The long step must stay slower than the short one: equal times would mean
  // the duration is constant again.
  expect(long).toBeGreaterThan(short);
});
