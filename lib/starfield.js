/* Starfield background with a "dropping out of hyperspace" opening and cursor
 * parallax.
 *
 * Ported from Shimmer Tab (https://github.com/dmitthedazed/shimmer-tab),
 * helium-newtab/src/Stars.svelte and helium-newtab/src/pointer.ts,
 * Copyright (c) dmitthedazed. Licensed under the GNU General Public License v3.0.
 * Shimmer Tab's starfield is itself after ErrorZeros' Helium New Tab.
 *
 * Changes for Frostpane: plain DOM instead of a Svelte component; the pointer
 * position is published as --star-x / --star-y so it cannot collide with the
 * --mx / --my that Frostpane's glass highlights use. Styles are in styles.css.
 */
(function () {
  "use strict";

  const root = document.documentElement;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const fine = window.matchMedia("(pointer: fine)");
  const WARP = 550;

  /* Smoothed pointer for the parallax: eases towards the cursor and stops
     animating once it has caught up. Only runs while the starfield is shown. */
  let tracking = false;
  let tx = innerWidth / 2;
  let ty = innerHeight / 2;
  let x = tx;
  let y = ty;
  let frame = 0;

  function step() {
    x += (tx - x) * 0.08;
    y += (ty - y) * 0.08;
    root.style.setProperty("--star-x", ((x / innerWidth) * 2 - 1).toFixed(4));
    root.style.setProperty("--star-y", ((y / innerHeight) * 2 - 1).toFixed(4));
    frame = Math.abs(tx - x) + Math.abs(ty - y) > 0.3 ? requestAnimationFrame(step) : 0;
  }

  window.addEventListener(
    "pointermove",
    (e) => {
      if (!tracking || reduce.matches || !fine.matches || e.pointerType === "touch") return;
      tx = e.clientX;
      ty = e.clientY;
      if (!frame) frame = requestAnimationFrame(step);
    },
    { passive: true },
  );

  /* Entrance: streaks fly out of the centre and brake, a flash marks the
     arrival, then the starfield settles in from the depth. */
  function playWarp(layer) {
    if (reduce.matches) return;
    layer.classList.add("arriving");
    const canvas = document.createElement("canvas");
    canvas.className = "stars-warp";
    const flash = document.createElement("div");
    flash.className = "stars-flash";
    layer.append(canvas, flash);

    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = innerWidth;
    const h = innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    const cx = w / 2;
    const cy = h / 2;
    const focal = Math.max(w, h) * 0.6;
    const stars = Array.from({ length: 420 }, () => ({
      x: (Math.random() - 0.5) * w * 2.2,
      y: (Math.random() - 0.5) * h * 2.2,
      z: Math.random() * 1000 + 50,
      hue: 220 + Math.random() * 40,
    }));
    const start = performance.now();
    let last = start;

    const draw = (now) => {
      const t = Math.min(1, (now - start) / WARP);
      const dt = Math.min(48, now - last);
      last = now;
      // speed: full warp, then a hard brake towards the end
      const speed = 3.2 * Math.pow(1 - t, 2.2) + 0.02;
      ctx.clearRect(0, 0, w, h);
      // deep space dark that lifts as we arrive
      ctx.fillStyle = `rgba(4, 6, 16, ${0.92 * (1 - t) ** 1.5})`;
      ctx.fillRect(0, 0, w, h);
      ctx.lineCap = "round";
      for (const s of stars) {
        const pz = s.z;
        s.z -= speed * dt;
        if (s.z < 1) {
          s.z = 1000;
          continue;
        }
        const sx = (s.x / s.z) * focal + cx;
        const sy = (s.y / s.z) * focal + cy;
        const px = (s.x / pz) * focal + cx;
        const py = (s.y / pz) * focal + cy;
        const near = 1 - s.z / 1050;
        ctx.strokeStyle = `hsla(${s.hue}, 90%, ${78 + near * 20}%, ${Math.min(1, near * 1.6) * (1 - t * 0.85)})`;
        ctx.lineWidth = 0.6 + near * 2.2;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(sx, sy);
        ctx.stroke();
      }
      if (t < 1) requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);

    // The warp canvas and flash fade themselves out in CSS; remove them after.
    setTimeout(() => {
      canvas.remove();
      flash.remove();
      layer.classList.remove("arriving");
    }, 1200);
  }

  window.FrostpaneStars = {
    /** Turn the cursor parallax on or off. */
    track(on) {
      tracking = on;
      if (!on) {
        root.style.removeProperty("--star-x");
        root.style.removeProperty("--star-y");
      }
    },
    playWarp,
  };
})();
