/* Gradient shimmer background.
 *
 * Ported from Helium Prism's GradientShimmer
 *   https://github.com/imputnet/helium-prism
 *   src/lib/gradient-shimmer.ts, src/lib/components/GradientShimmer.svelte,
 *   src/lib/shaders/gradient-shimmer.vert.glsl and .frag.glsl
 * Copyright (c) imput. Licensed under the GNU General Public License v3.0.
 *
 * Changes for Frostpane: plain WebGL 2 instead of the OGL library and a Svelte
 * component; colours come from Frostpane's accent instead of Prism's theme;
 * the loop can be paused when the background is hidden or motion is switched
 * off. The shaders, timing and wave constants are unchanged.
 */
(function () {
  "use strict";

  const STRIPE_WIDTH = { min: 64, target: 110, max: 120 };
  const GRADIENT = { bandWidth: 0.48, minStop: 0.14, maxStop: 0.96 };
  const INTRO = {
    delay: 700,
    revealDuration: 840,
    idleBlendDuration: 500,
    stagger: 45,
    startCenter: 0.96,
    idleCenter: 0.5,
  };
  const WAVE_SPEED_UP = { multiplier: 2.15, rampUpDuration: 140, waveDuration: 320, rampDownDuration: 480 };
  const IDLE_WAVE = {
    speed: 0.42,
    stripePhase: 0.74,
    secondarySpeed: 0.26,
    secondaryStripePhase: 1.28,
    primaryAmplitude: 0.19,
    secondaryAmplitude: 0.055,
  };
  const FULL_CIRCLE = Math.PI * 2;
  const GRAIN = {
    size: 180,
    hashScale: [127.1, 311.7],
    hashOffset: 43758.5,
    // Luminance, then the red, green and blue colour shifts.
    channelOffsets: [[0, 0], [17, 3], [7, 29], [31, 11]],
  };

  const VERTEX_SHADER = `#version 300 es
precision highp float;

// X is 0 at the stripe's left edge and 1 at its right edge, Y is in clip space.
in vec2 position;

uniform vec2 u_size;
uniform float u_stripe_max_index;
uniform float u_stripe_width;
uniform float u_wave_phase;
uniform float u_secondary_wave_phase;
uniform float u_intro_active;
uniform float u_intro_elapsed;
uniform float u_shine_progress;

uniform float u_alpha;
uniform float u_intro_alpha;
uniform float u_speed_up_shine_boost;

uniform float u_gradient_band_width;
uniform float u_gradient_min_stop;
uniform float u_gradient_max_stop;
uniform float u_intro_reveal_duration;
uniform float u_intro_reveal_duration_inverse;
uniform float u_intro_idle_blend_duration_inverse;
uniform float u_intro_stagger;
uniform float u_intro_center_index;
uniform float u_intro_center_distance;
uniform float u_intro_start_center;
uniform float u_intro_idle_center;
uniform float u_idle_stripe_phase;
uniform float u_idle_secondary_stripe_phase;
uniform float u_idle_primary_amplitude;
uniform float u_idle_secondary_amplitude;

// Everything below is constant across a stripe, so it's computed per stripe
// instead of per pixel.
flat out float v_stripe_start;
// Band start, center and band end.
flat out vec3 v_band;
// Inverse lengths of the three gradient segments.
flat out vec3 v_band_inverse;
flat out float v_out_alpha;
flat out float v_highlight_strength;

const float EPSILON = 0.0001;

float clamp01(float value) {
    return clamp(value, 0.0, 1.0);
}

float easeOutCubic(float value) {
    float inverse = 1.0 - value;
    return 1.0 - inverse * inverse * inverse;
}

float introRevealProgress(float delayed_elapsed) {
    if (u_intro_active < 0.5) {
        return 1.0;
    }
    return easeOutCubic(clamp01(delayed_elapsed * u_intro_reveal_duration_inverse));
}

float introIdleProgress(float delayed_elapsed) {
    if (u_intro_active < 0.5) {
        return 1.0;
    }
    return easeOutCubic(
        clamp01((delayed_elapsed - u_intro_reveal_duration) * u_intro_idle_blend_duration_inverse)
    );
}

void main() {
    float stripe_index = float(gl_InstanceID);
    float stripe_start = stripe_index * u_stripe_width;
    float edge_x = (stripe_index + position.x) * u_stripe_width;

    // Avoid a gap at the right edge from float error.
    if (stripe_index == u_stripe_max_index && position.x > 0.5) {
        edge_x = u_size.x;
    }

    gl_Position = vec4(edge_x / u_size.x * 2.0 - 1.0, position.y, 0.0, 1.0);

    float reveal_delay = max(
        0.0,
        abs(stripe_index - u_intro_center_index) - u_intro_center_distance
    ) * u_intro_stagger;
    float delayed_intro_elapsed = u_intro_elapsed - reveal_delay;
    float reveal_progress = introRevealProgress(delayed_intro_elapsed);
    float idle_progress = introIdleProgress(delayed_intro_elapsed);
    float alpha = u_intro_alpha + (u_alpha - u_intro_alpha) * idle_progress;
    float stripe_phase = stripe_index * u_idle_stripe_phase;
    float secondary_stripe_phase = stripe_index * u_idle_secondary_stripe_phase;
    float primary_wave = sin(u_wave_phase - stripe_phase);
    float secondary_wave = sin(u_secondary_wave_phase + secondary_stripe_phase);
    float idle_center = 0.5 +
        primary_wave * u_idle_primary_amplitude +
        secondary_wave * u_idle_secondary_amplitude;
    float intro_center = mix(u_intro_start_center, u_intro_idle_center, reveal_progress);
    float center = mix(intro_center, idle_center, idle_progress);
    float band_start = clamp(center - u_gradient_band_width, u_gradient_min_stop, u_gradient_max_stop);
    float band_end = clamp(center + u_gradient_band_width, u_gradient_min_stop, u_gradient_max_stop);
    float gradient_alpha = clamp01(
        alpha * (1.0 + u_shine_progress * u_speed_up_shine_boost)
    ) * reveal_progress;
    float out_alpha = gradient_alpha + alpha * (1.0 - gradient_alpha);

    v_stripe_start = stripe_start;
    v_band = vec3(band_start, center, band_end);
    v_band_inverse = 1.0 / max(vec3(band_start, center - band_start, band_end - center), EPSILON);
    v_out_alpha = out_alpha;
    // Compositing the gradient over the start color reduces to
    // start + delta * amount * gradient_alpha / out_alpha.
    v_highlight_strength = gradient_alpha / max(out_alpha, EPSILON);
}`;

  const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform vec2 u_size;
uniform float u_inverse_dpr;
uniform float u_stripe_width;
uniform float u_gradient_top;
uniform float u_gradient_vertical_span;
uniform float u_inverse_gradient_denominator;

uniform vec3 u_start_color;
uniform vec3 u_highlight_delta;
uniform float u_grain_alpha;
uniform float u_grain_luminance;
uniform float u_grain_contrast;
uniform float u_grain_saturation;
uniform sampler2D u_grain_noise;

flat in float v_stripe_start;
flat in vec3 v_band;
flat in vec3 v_band_inverse;
flat in float v_out_alpha;
flat in float v_highlight_strength;

const float GRAIN_SIZE = 180.0;

out vec4 fragment_color;

float clamp01(float value) {
    return clamp(value, 0.0, 1.0);
}

vec3 overlayBlend(vec3 base, vec3 blend) {
    vec3 low = 2.0 * base * blend;
    vec3 high = 1.0 - 2.0 * (1.0 - base) * (1.0 - blend);
    return mix(low, high, step(vec3(0.5), base));
}

float gradientHighlightAmount(float position) {
    if (position < v_band.x) {
        return 1.0 - clamp01(position * v_band_inverse.x);
    }
    if (position < v_band.y) {
        return clamp01((position - v_band.x) * v_band_inverse.y);
    }
    if (position < v_band.z) {
        return 1.0 - clamp01((position - v_band.y) * v_band_inverse.z);
    }
    return 0.0;
}

void main() {
    vec2 css_position = vec2(
        gl_FragCoord.x * u_inverse_dpr,
        u_size.y - gl_FragCoord.y * u_inverse_dpr
    );
    vec2 gradient_offset = vec2(css_position.x - v_stripe_start, css_position.y - u_gradient_top);
    vec2 gradient_axis = vec2(u_stripe_width, u_gradient_vertical_span);
    float gradient_position = clamp01(
        dot(gradient_offset, gradient_axis) * u_inverse_gradient_denominator
    );
    vec3 color = u_start_color + u_highlight_delta * (
        gradientHighlightAmount(gradient_position) * v_highlight_strength
    );

    ivec2 grain_position = min(ivec2(mod(css_position, GRAIN_SIZE)), ivec2(GRAIN_SIZE - 1.0));
    vec4 noise = texelFetch(u_grain_noise, grain_position, 0) - 0.5;
    float luminance = u_grain_luminance + noise.r * u_grain_contrast;
    vec3 color_shift = noise.gba * u_grain_saturation;
    vec3 grain = clamp((vec3(luminance) + color_shift) / 255.0, 0.0, 1.0);

    color = mix(color, overlayBlend(color, grain), u_grain_alpha);

    fragment_color = vec4(color * v_out_alpha, v_out_alpha);
}`;

  const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
  const lerp = (start, end, progress) => start + (end - start) * progress;
  const easeOutCubic = (value) => 1 - Math.pow(1 - value, 3);
  const easeInOutCubic = (value) => (value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2);

  // Grain is static, so it's hashed once here instead of per pixel every frame.
  function createGrainNoise() {
    const { size, hashScale, hashOffset, channelOffsets } = GRAIN;
    const data = new Uint8Array(size * size * channelOffsets.length);
    let index = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        for (const [offsetX, offsetY] of channelOffsets) {
          const hash = Math.sin((x + offsetX) * hashScale[0] + (y + offsetY) * hashScale[1]) * hashOffset;
          data[index++] = Math.round((hash - Math.floor(hash)) * 255);
        }
      }
    }
    return data;
  }

  function getStripeCount(canvasWidth) {
    const minCount = Math.max(1, Math.ceil(canvasWidth / STRIPE_WIDTH.max));
    const maxCount = Math.max(1, Math.floor(canvasWidth / STRIPE_WIDTH.min));
    const targetCount = Math.max(1, Math.round(canvasWidth / STRIPE_WIDTH.target));
    return Math.max(minCount, Math.min(maxCount, targetCount));
  }

  function getStripeMetrics(width) {
    const count = getStripeCount(width);
    const maxIndex = count - 1;
    return {
      count,
      width: width / count,
      maxIndex,
      introCenterIndex: maxIndex / 2,
      introCenterDistance: count % 2 === 0 ? 0.5 : 0,
    };
  }

  function getRevealDelay(index, stripeCount, stagger = INTRO.stagger) {
    const centerIndex = (stripeCount - 1) / 2;
    const centerDistance = stripeCount % 2 === 0 ? 0.5 : 0;
    return Math.max(0, Math.abs(index - centerIndex) - centerDistance) * stagger;
  }

  function isIntroComplete(time, introAnimation, stripeCount) {
    if (!introAnimation) return true;
    const maxDelay = stripeCount <= 0
      ? 0
      : Math.max(getRevealDelay(0, stripeCount), getRevealDelay(stripeCount - 1, stripeCount));
    return time >= introAnimation.startedAt + INTRO.delay + maxDelay + INTRO.revealDuration + INTRO.idleBlendDuration;
  }

  /* ---------- Wave speed-up ("emphasize") ---------- */
  const IDLE_SPEED_UP = { multiplier: 1, shineProgress: 0 };
  const PEAK_SPEED_UP = { multiplier: WAVE_SPEED_UP.multiplier, shineProgress: 1 };
  const lerpSpeedUp = (from, to, progress) => ({
    multiplier: lerp(from.multiplier, to.multiplier, progress),
    shineProgress: lerp(from.shineProgress, to.shineProgress, progress),
  });
  const getProgress = (time, startedAt, duration) => clamp((time - startedAt) / duration);

  function updateSpeedUpAnimation(time, anim) {
    if (!anim) return { animation: null, ...IDLE_SPEED_UP };
    if (anim.phase === "ramp-up") {
      const progress = getProgress(time, anim.startedAt, anim.duration);
      const values = lerpSpeedUp(anim.from, PEAK_SPEED_UP, easeOutCubic(progress));
      if (progress >= 1) return { animation: { phase: "hold", startedAt: time }, ...values };
      return { animation: anim, ...values };
    }
    if (anim.phase === "hold") {
      const progress = getProgress(time, anim.startedAt, WAVE_SPEED_UP.waveDuration);
      if (progress >= 1) return { animation: { phase: "ramp-down", startedAt: time, from: PEAK_SPEED_UP }, ...PEAK_SPEED_UP };
      return { animation: anim, ...PEAK_SPEED_UP };
    }
    const progress = getProgress(time, anim.startedAt, WAVE_SPEED_UP.rampDownDuration);
    const values = lerpSpeedUp(anim.from, IDLE_SPEED_UP, easeInOutCubic(progress));
    return { animation: progress >= 1 ? null : anim, ...values };
  }

  function triggerSpeedUpAnimation(time, anim) {
    const { multiplier, shineProgress } = updateSpeedUpAnimation(time, anim);
    const from = { multiplier, shineProgress };
    if (multiplier >= WAVE_SPEED_UP.multiplier && shineProgress >= 1) return { phase: "hold", startedAt: time };
    const remaining = Math.max(
      clamp((WAVE_SPEED_UP.multiplier - from.multiplier) / (WAVE_SPEED_UP.multiplier - 1)),
      1 - from.shineProgress,
    );
    return { phase: "ramp-up", startedAt: time, duration: Math.max(1, WAVE_SPEED_UP.rampUpDuration * remaining), from };
  }

  /* ---------- Colours, read from CSS custom properties on the canvas ---------- */
  function parseColor(context, raw) {
    context.fillStyle = "#000000";
    context.fillStyle = raw;
    const color = context.fillStyle.trim().toLowerCase();
    if (color.startsWith("#") && color.length === 7) {
      return [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255);
    }
    const channels = color.match(/-?\d*\.?\d+(?:e[+-]?\d+)?%?/g) || [];
    if (color.startsWith("color(") && channels.length >= 3) {
      return channels.slice(0, 3).map((c) => clamp(parseFloat(c)));
    }
    if (channels.length >= 3) {
      return channels.slice(0, 3).map((c) => (c.endsWith("%") ? clamp(parseFloat(c) / 100) : clamp(parseFloat(c) / 255)));
    }
    throw new Error(`Unsupported CSS color: ${raw}`);
  }

  function readShaderColors(canvas, context) {
    const styles = getComputedStyle(canvas);
    const num = (name) => {
      const value = Number(styles.getPropertyValue(name).trim());
      if (!Number.isFinite(value)) throw new Error(`Missing CSS number: ${name}`);
      return value;
    };
    const start = parseColor(context, styles.getPropertyValue("--shimmer-start").trim());
    const highlight = parseColor(context, styles.getPropertyValue("--shimmer-highlight").trim());
    return {
      alpha: num("--shimmer-alpha"),
      grainAlpha: num("--shimmer-grain-alpha"),
      grainLuminance: num("--shimmer-grain-luminance"),
      grainContrast: num("--shimmer-grain-contrast"),
      grainSaturation: num("--shimmer-grain-saturation"),
      introAlpha: num("--shimmer-intro-alpha"),
      speedUpShineBoost: num("--shimmer-speed-up-shine-boost"),
      start,
      highlightDelta: [highlight[0] - start[0], highlight[1] - start[1], highlight[2] - start[2]],
    };
  }

  /* ---------- WebGL 2 renderer ---------- */
  function compile(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(log || "shader compile failed");
    }
    return shader;
  }

  function createRenderer(canvas) {
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
    });
    const colorContext = document.createElement("canvas").getContext("2d");
    if (!gl || !colorContext) return null;

    let program;
    try {
      program = gl.createProgram();
      gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
      gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    } catch {
      return null;
    }

    // One instanced quad per stripe. The vertex shader takes the stripe index
    // from gl_InstanceID, so no per-instance attribute is needed.
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 1, -1, 0, 1, 0, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const positionLocation = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    const grain = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, grain);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, GRAIN.size, GRAIN.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, createGrainNoise());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const locations = {};
    const uniform = (name) => (locations[name] ??= gl.getUniformLocation(program, name));
    const set1 = (name, value) => gl.uniform1f(uniform(name), value);

    gl.useProgram(program);
    gl.uniform1i(uniform("u_grain_noise"), 0);
    set1("u_gradient_band_width", GRADIENT.bandWidth);
    set1("u_gradient_min_stop", GRADIENT.minStop);
    set1("u_gradient_max_stop", GRADIENT.maxStop);
    set1("u_intro_reveal_duration", INTRO.revealDuration);
    set1("u_intro_reveal_duration_inverse", 1 / INTRO.revealDuration);
    set1("u_intro_idle_blend_duration_inverse", 1 / INTRO.idleBlendDuration);
    set1("u_intro_stagger", INTRO.stagger);
    set1("u_intro_start_center", INTRO.startCenter);
    set1("u_intro_idle_center", INTRO.idleCenter);
    set1("u_idle_stripe_phase", IDLE_WAVE.stripePhase);
    set1("u_idle_secondary_stripe_phase", IDLE_WAVE.secondaryStripePhase);
    set1("u_idle_primary_amplitude", IDLE_WAVE.primaryAmplitude);
    set1("u_idle_secondary_amplitude", IDLE_WAVE.secondaryAmplitude);

    let stripes = getStripeMetrics(1);

    function resize() {
      const rect = canvas.getBoundingClientRect();
      // Grain cells are CSS pixels and the gradient is smooth, so rendering
      // above CSS resolution adds nothing. The canvas is upscaled pixelated.
      const dpr = Math.min(window.devicePixelRatio || 1, 1);
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      stripes = getStripeMetrics(width);
      const span = height * 1.7;
      gl.useProgram(program);
      gl.uniform2f(uniform("u_size"), width, height);
      set1("u_inverse_dpr", 1 / dpr);
      set1("u_stripe_max_index", stripes.maxIndex);
      set1("u_stripe_width", stripes.width);
      set1("u_gradient_top", height * -0.35);
      set1("u_gradient_vertical_span", span);
      set1("u_inverse_gradient_denominator", 1 / (stripes.width * stripes.width + span * span));
      set1("u_intro_center_index", stripes.introCenterIndex);
      set1("u_intro_center_distance", stripes.introCenterDistance);
    }

    function readColors() {
      const c = readShaderColors(canvas, colorContext);
      gl.useProgram(program);
      gl.uniform3fv(uniform("u_start_color"), c.start);
      gl.uniform3fv(uniform("u_highlight_delta"), c.highlightDelta);
      set1("u_alpha", c.alpha);
      set1("u_intro_alpha", c.introAlpha);
      set1("u_speed_up_shine_boost", c.speedUpShineBoost);
      set1("u_grain_alpha", c.grainAlpha);
      set1("u_grain_luminance", c.grainLuminance);
      set1("u_grain_contrast", c.grainContrast);
      set1("u_grain_saturation", c.grainSaturation);
    }

    function render({ time, wavePhase, secondaryWavePhase, introStartedAt, shineProgress }) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      set1("u_wave_phase", wavePhase);
      set1("u_secondary_wave_phase", secondaryWavePhase);
      set1("u_intro_active", introStartedAt === null ? 0 : 1);
      set1("u_intro_elapsed", introStartedAt === null ? 0 : time - introStartedAt - INTRO.delay);
      set1("u_shine_progress", shineProgress);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, grain);
      gl.bindVertexArray(vao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, stripes.count);
      gl.bindVertexArray(null);
    }

    return { resize, readColors, render, getStripeCount: () => stripes.count };
  }

  /* ---------- Controller (the Svelte component's lifecycle, as a plain object) ---------- */
  function createShimmer(canvas) {
    const renderer = createRenderer(canvas);
    if (!renderer) {
      canvas.classList.add("fallback", "visible");
      return { intro() {}, emphasize() {}, setRunning() {}, readColors() {}, ok: false };
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animationFrame = null;
    let introAnimation = null;
    let speedUpAnimation = null;
    let wavePhase = Math.random() * FULL_CIRCLE;
    let secondaryWavePhase = -wavePhase * 0.7;
    let lastFrameTime = null;
    let running = false;

    function drawFrame(time) {
      const still = reducedMotion.matches || !running;
      const deltaSeconds = still || lastFrameTime === null ? 0 : Math.min((time - lastFrameTime) / 1000, 0.064);
      const speedUp = updateSpeedUpAnimation(time, speedUpAnimation);
      const activeIntro = reducedMotion.matches ? null : introAnimation;

      lastFrameTime = still ? null : time;
      speedUpAnimation = reducedMotion.matches ? null : speedUp.animation;
      if (!still) {
        wavePhase += IDLE_WAVE.speed * speedUp.multiplier * deltaSeconds;
        secondaryWavePhase += IDLE_WAVE.secondarySpeed * speedUp.multiplier * deltaSeconds;
      }

      renderer.render({
        time,
        wavePhase,
        secondaryWavePhase,
        introStartedAt: activeIntro ? activeIntro.startedAt : null,
        shineProgress: reducedMotion.matches ? 0 : speedUp.shineProgress,
      });

      if (isIntroComplete(time, introAnimation, renderer.getStripeCount())) introAnimation = null;
    }

    function loop(time) {
      animationFrame = null;
      drawFrame(time);
      request();
    }

    function request() {
      if (animationFrame !== null || reducedMotion.matches || !running) return;
      animationFrame = requestAnimationFrame(loop);
    }

    function cancel() {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }

    renderer.resize();
    renderer.readColors();

    new ResizeObserver(() => requestAnimationFrame((time) => {
      renderer.resize();
      drawFrame(time);
    })).observe(canvas);

    reducedMotion.addEventListener("change", () => {
      if (reducedMotion.matches) {
        introAnimation = null;
        speedUpAnimation = null;
        cancel();
        drawFrame(performance.now());
      } else {
        lastFrameTime = null;
        request();
      }
    });

    return {
      ok: true,
      /** Plays the opening: stripes fan out from the centre and drop into place. */
      intro() {
        if (reducedMotion.matches) return;
        introAnimation = { startedAt: performance.now() };
        drawFrame(performance.now());
        // Reveal after the first WebGL frame has been painted.
        requestAnimationFrame(() => canvas.classList.add("visible"));
      },
      /** A brief speed-up and brightening of the waves. */
      emphasize() {
        if (reducedMotion.matches) return;
        speedUpAnimation = triggerSpeedUpAnimation(performance.now(), speedUpAnimation);
        request();
      },
      /** Run the loop only while the shimmer is on screen and motion is allowed. */
      setRunning(on) {
        running = on;
        if (on) {
          lastFrameTime = null;
          request();
        } else {
          cancel();
          drawFrame(performance.now());
        }
        canvas.classList.add("visible");
      },
      readColors() {
        renderer.readColors();
        drawFrame(performance.now());
      },
    };
  }

  window.FrostpaneShimmer = { create: createShimmer };
})();
