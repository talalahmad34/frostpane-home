/* Hold the first paint invisible until the font is actually usable, then
   reveal in one short beat — masks any residual swap instead of showing it.
   Capped low so a slow/failed font load never turns this into a spinner. */
Promise.race([
  document.fonts ? document.fonts.ready : Promise.resolve(),
  new Promise((resolve) => setTimeout(resolve, 120)),
]).then(() => document.documentElement.classList.add("ready"));

const TILE_COUNT = 12;
const STORAGE_KEYS = {
  tiles: "frostpane_tiles",
  accent: "frostpane_accent",
  layout: "frostpane_layout",
  clockFormat: "frostpane_clock_format",
  faviconCache: "frostpane_favicon_cache",
};

const LAYOUTS = [
  { id: "stack", label: "Open Stack" },
  { id: "panel", label: "Single Panel" },
  { id: "dock", label: "Quiet Dock" },
];

const ACCENT_PRESETS = [
  { accent: "#606edc", soft: "#3c828c" },
  { accent: "#e8615f", soft: "#d0718f" },
  { accent: "#5fbf8f", soft: "#3c828c" },
  { accent: "#d98a5a", soft: "#e07a78" },
  { accent: "#7d8cf5", soft: "#5a7fd4" },
  { accent: "#8f7fd4", soft: "#5a7fd4" },
];

let tiles = new Array(TILE_COUNT).fill(null);
let editingIndex = null;
let faviconCache = {};
const faviconFetching = new Set();

const grid = document.getElementById("tile-grid");
const clockEl = document.getElementById("clock");
const dateEl = document.getElementById("date");
const greetingEl = document.getElementById("greeting");
const searchForm = document.getElementById("search-form");
const searchInput = document.getElementById("search-input");
const tileTooltip = document.getElementById("tile-tooltip");

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}
function storageSet(items) {
  return new Promise((resolve) => chrome.storage.local.set(items, resolve));
}

/* ---------- Clock ---------- */
let use24Hour = true;

function updateClock() {
  const now = new Date();
  let hour = now.getHours();
  let suffix = "";
  if (!use24Hour) {
    suffix = hour >= 12 ? " PM" : " AM";
    hour = hour % 12 || 12;
  }
  const h = String(hour).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  clockEl.innerHTML = suffix
    ? `${h}:${m}<span class="clock-meridiem">${suffix.trim()}</span>`
    : `${h}:${m}`;

  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  dateEl.textContent = `${days[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]}`;

  const rawHour = now.getHours();
  greetingEl.textContent = rawHour < 5 ? "Good night" : rawHour < 12 ? "Good morning" : rawHour < 18 ? "Good afternoon" : "Good evening";
}
updateClock();
setInterval(updateClock, 1000 * 30);

/* ---------- Search ---------- */
searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = searchInput.value.trim();
  if (!q) return;
  window.location.href = `https://search.brave.com/search?q=${encodeURIComponent(q)}`;
});

/* ---------- Tiles ---------- */
function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function faviconUrl(url) {
  const host = hostOf(url);
  return host ? `https://www.google.com/s2/favicons?sz=64&domain=${host}` : null;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function cacheFavicon(host, networkUrl, img) {
  if (!host || faviconFetching.has(host)) return;
  faviconFetching.add(host);
  try {
    const res = await fetch(networkUrl);
    if (!res.ok) return;
    const blob = await res.blob();
    const dataUrl = await blobToDataUrl(blob);
    faviconCache[host] = dataUrl;
    await storageSet({ [STORAGE_KEYS.faviconCache]: faviconCache });
    if (img && img.isConnected) img.src = dataUrl;
  } catch {
    /* offline or blocked — the live network URL already set on img stays as-is */
  } finally {
    faviconFetching.delete(host);
  }
}

async function loadFaviconCache() {
  const data = await storageGet(STORAGE_KEYS.faviconCache);
  faviconCache = data[STORAGE_KEYS.faviconCache] || {};
}

function initials(name) {
  const trimmed = (name || "").trim();
  return trimmed ? trimmed[0].toUpperCase() : "?";
}

function showTileTooltip(el, text) {
  if (!text) return;
  if (document.body.getAttribute("data-layout") !== "dock") return;
  tileTooltip.textContent = text;
  const rect = el.getBoundingClientRect();
  tileTooltip.style.left = `${rect.left + rect.width / 2}px`;
  tileTooltip.style.top = `${rect.top}px`;
  tileTooltip.classList.add("visible");
}

function hideTileTooltip() {
  tileTooltip.classList.remove("visible");
}

function spawnRipple(el, clientX, clientY) {
  const rect = el.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 2.4;
  const ripple = document.createElement("span");
  ripple.className = "tile-ripple";
  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.left = `${clientX - rect.left - size / 2}px`;
  ripple.style.top = `${clientY - rect.top - size / 2}px`;
  el.appendChild(ripple);
  ripple.addEventListener("animationend", () => ripple.remove());
}

function renderTiles() {
  hideTileTooltip();
  grid.innerHTML = "";
  tiles.forEach((tile, i) => {
    const el = document.createElement("div");
    el.className = "tile" + (tile ? "" : " empty");
    el.setAttribute("data-index", String(i));
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    const tooltipText = tile ? tile.name : "Add bookmark";
    el.setAttribute("aria-label", tooltipText);
    el.addEventListener("mouseenter", () => showTileTooltip(el, tooltipText));
    el.addEventListener("mouseleave", hideTileTooltip);
    el.addEventListener("focus", () => showTileTooltip(el, tooltipText));
    el.addEventListener("blur", hideTileTooltip);

    const icon = document.createElement("div");
    icon.className = "tile-icon";

    if (tile) {
      if (tile.icon) {
        icon.textContent = tile.icon;
      } else {
        const host = hostOf(tile.url);
        const cached = host && faviconCache[host];
        const netUrl = faviconUrl(tile.url);
        if (cached || netUrl) {
          const img = document.createElement("img");
          img.alt = "";
          img.onerror = () => {
            img.remove();
            icon.textContent = initials(tile.name);
          };
          if (cached) {
            img.src = cached;
          } else {
            img.className = "icon-loading";
            img.onload = () => img.classList.remove("icon-loading");
            img.src = netUrl;
          }
          icon.appendChild(img);
          if (!cached && netUrl) cacheFavicon(host, netUrl, img);
        } else {
          icon.textContent = initials(tile.name);
        }
      }
    } else {
      icon.textContent = "+";
    }

    const label = document.createElement("span");
    label.className = "tile-label";
    label.textContent = tile ? tile.name : "Add";

    el.appendChild(icon);
    el.appendChild(label);

    el.addEventListener("mousedown", (e) => {
      if (e.button === 1) e.preventDefault();
    });

    el.addEventListener("auxclick", (e) => {
      if (e.button !== 1 || !tile) return;
      e.preventDefault();
      spawnRipple(el, e.clientX, e.clientY);
      window.open(tile.url, "_blank");
    });

    el.addEventListener("click", (e) => {
      const rect = el.getBoundingClientRect();
      const x = e.detail === 0 ? rect.left + rect.width / 2 : e.clientX;
      const y = e.detail === 0 ? rect.top + rect.height / 2 : e.clientY;
      spawnRipple(el, x, y);
      if (tile) {
        setTimeout(() => {
          window.location.href = tile.url;
        }, 260);
      } else {
        openTileModal(i);
      }
    });

    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (tile) openTileModal(i);
    });

    grid.appendChild(el);
  });
}

/* ---------- Keyboard navigation ---------- */
function gridColumns() {
  const layout = document.body.getAttribute("data-layout");
  if (layout === "panel") return 4;
  if (layout === "dock") return TILE_COUNT;
  return 6;
}

grid.addEventListener("keydown", (e) => {
  const current = document.activeElement;
  if (!current || !current.classList.contains("tile")) return;
  const idx = Number(current.getAttribute("data-index"));
  const cols = gridColumns();
  let next = null;

  switch (e.key) {
    case "ArrowRight":
      if (idx + 1 < TILE_COUNT) next = idx + 1;
      break;
    case "ArrowLeft":
      if (idx - 1 >= 0) {
        next = idx - 1;
      } else {
        e.preventDefault();
        searchInput.focus();
        return;
      }
      break;
    case "ArrowDown":
      if (idx + cols < TILE_COUNT) {
        next = idx + cols;
      } else if (cols === TILE_COUNT) {
        e.preventDefault();
        return;
      }
      break;
    case "ArrowUp":
      if (idx - cols >= 0) {
        next = idx - cols;
      } else {
        e.preventDefault();
        searchInput.focus();
        return;
      }
      break;
    case "Enter":
    case " ":
      e.preventDefault();
      current.click();
      return;
    default:
      return;
  }

  if (next !== null) {
    e.preventDefault();
    const nextEl = grid.querySelector(`[data-index="${next}"]`);
    if (nextEl) nextEl.focus();
  }
});

searchInput.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    const first = grid.querySelector('[data-index="0"]');
    if (first) first.focus();
  }
});

async function saveTiles() {
  await storageSet({ [STORAGE_KEYS.tiles]: tiles });
}

async function loadTiles() {
  const data = await storageGet(STORAGE_KEYS.tiles);
  const stored = data[STORAGE_KEYS.tiles];
  if (Array.isArray(stored)) {
    tiles = new Array(TILE_COUNT).fill(null);
    for (let i = 0; i < Math.min(TILE_COUNT, stored.length); i++) {
      tiles[i] = stored[i] || null;
    }
  }
  renderTiles();
}

/* ---------- Tile modal ---------- */
const modalBackdrop = document.getElementById("tile-modal-backdrop");
const modalTitle = document.getElementById("modal-title");
const nameInput = document.getElementById("tile-name");
const urlInput = document.getElementById("tile-url");
const iconInput = document.getElementById("tile-icon");
const removeBtn = document.getElementById("tile-remove");
const cancelBtn = document.getElementById("tile-cancel");
const saveBtn = document.getElementById("tile-save");

function openTileModal(index) {
  editingIndex = index;
  const tile = tiles[index];
  modalTitle.textContent = tile ? "Edit bookmark" : "Add bookmark";
  nameInput.value = tile ? tile.name : "";
  urlInput.value = tile ? tile.url : "";
  iconInput.value = tile && tile.icon ? tile.icon : "";
  removeBtn.hidden = !tile;
  modalBackdrop.hidden = false;
  nameInput.focus();
}

function closeTileModal() {
  modalBackdrop.hidden = true;
  editingIndex = null;
}

function normalizeUrl(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

saveBtn.addEventListener("click", async () => {
  const name = nameInput.value.trim();
  const url = normalizeUrl(urlInput.value);
  if (!name || !url) return;
  tiles[editingIndex] = { name, url, icon: iconInput.value.trim() || null };
  await saveTiles();
  renderTiles();
  closeTileModal();
});

removeBtn.addEventListener("click", async () => {
  tiles[editingIndex] = null;
  await saveTiles();
  renderTiles();
  closeTileModal();
});

cancelBtn.addEventListener("click", closeTileModal);
modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeTileModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modalBackdrop.hidden) closeTileModal();
});

/* ---------- Export / Import ---------- */
document.getElementById("export-btn").addEventListener("click", () => {
  const payload = tiles.slice(0, TILE_COUNT);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "frostpane-bookmarks.json";
  a.click();
  URL.revokeObjectURL(url);
});

const importInput = document.getElementById("import-file");
document.getElementById("import-btn").addEventListener("click", () => importInput.click());

importInput.addEventListener("change", async () => {
  const file = importInput.files[0];
  importInput.value = "";
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!validateImport(data)) {
      alert("Invalid file: expected an array of up to 12 { name, url, icon } objects.");
      return;
    }
    tiles = new Array(TILE_COUNT).fill(null);
    for (let i = 0; i < Math.min(TILE_COUNT, data.length); i++) {
      const item = data[i];
      tiles[i] = item ? { name: item.name, url: item.url, icon: item.icon || null } : null;
    }
    await saveTiles();
    renderTiles();
  } catch {
    alert("Could not read that file as valid JSON.");
  }
});

function validateImport(data) {
  if (!Array.isArray(data) || data.length > TILE_COUNT) return false;
  return data.every((item) => {
    if (item === null) return true;
    if (typeof item !== "object") return false;
    const keys = Object.keys(item).filter((k) => !["name", "url", "icon"].includes(k));
    if (keys.length) return false;
    return typeof item.name === "string" && typeof item.url === "string";
  });
}

/* ---------- Settings widget ---------- */
const settingsWidget = document.getElementById("settings-widget");
const settingsToggle = document.getElementById("settings-toggle");
const settingsPanel = document.getElementById("settings-panel");

function closeSettingsPanel() {
  settingsPanel.hidden = true;
  settingsWidget.classList.remove("open");
  colorPicker.hidden = true;
}

settingsToggle.addEventListener("click", (e) => {
  e.stopPropagation();
  const willOpen = settingsPanel.hidden;
  settingsPanel.hidden = !willOpen;
  settingsWidget.classList.toggle("open", willOpen);
  if (!willOpen) colorPicker.hidden = true;
});
document.addEventListener("click", (e) => {
  if (!settingsPanel.hidden && !settingsWidget.contains(e.target)) {
    closeSettingsPanel();
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !settingsPanel.hidden) closeSettingsPanel();
});

/* ---------- Layout ---------- */
const layoutRow = document.getElementById("layout-row");

function applyLayout(layoutId) {
  document.body.setAttribute("data-layout", layoutId);
}

function renderLayoutOptions(active) {
  layoutRow.innerHTML = "";
  LAYOUTS.forEach((l) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "layout-option" + (l.id === active ? " active" : "");
    btn.textContent = l.label;
    btn.addEventListener("click", async () => {
      applyLayout(l.id);
      await storageSet({ [STORAGE_KEYS.layout]: l.id });
      renderLayoutOptions(l.id);
      renderTiles();
    });
    layoutRow.appendChild(btn);
  });
}

async function loadLayout() {
  const data = await storageGet(STORAGE_KEYS.layout);
  const layoutId = data[STORAGE_KEYS.layout] || "stack";
  applyLayout(layoutId);
  renderLayoutOptions(layoutId);
}

/* ---------- Clock format ---------- */
const clockFormatToggle = document.getElementById("clock-format-toggle");

clockFormatToggle.addEventListener("change", async () => {
  use24Hour = clockFormatToggle.checked;
  await storageSet({ [STORAGE_KEYS.clockFormat]: use24Hour });
  updateClock();
});

async function loadClockFormat() {
  const data = await storageGet(STORAGE_KEYS.clockFormat);
  use24Hour = data[STORAGE_KEYS.clockFormat] !== undefined ? data[STORAGE_KEYS.clockFormat] : true;
  clockFormatToggle.checked = use24Hour;
  updateClock();
}

/* ---------- Accent colour ---------- */
const swatchRow = document.getElementById("swatch-row");

function applyAccent(accent, soft) {
  document.documentElement.style.setProperty("--accent", accent);
  document.documentElement.style.setProperty("--accent-soft", soft || accent);
}

function renderSwatches(active) {
  swatchRow.innerHTML = "";
  ACCENT_PRESETS.forEach((preset) => {
    const s = document.createElement("div");
    s.className = "swatch" + (preset.accent === active ? " active" : "");
    s.style.background = `linear-gradient(135deg, ${preset.accent}, ${preset.soft})`;
    s.addEventListener("click", async () => {
      applyAccent(preset.accent, preset.soft);
      await storageSet({ [STORAGE_KEYS.accent]: preset });
      renderSwatches(preset.accent);
      syncPickerUI(preset.accent);
    });
    swatchRow.appendChild(s);
  });
}

/* ---------- Custom colour picker ----------
   Built in-house rather than using the native <input type="color">: that
   popup's positioning inside a backdrop-filter'd panel is unreliable
   across browsers (renders off-screen, or steals focus and closes the
   settings panel entirely). This is plain DOM, so none of that applies. */
function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}

function rgbToHsv(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r, g, b;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

const customColorTrigger = document.getElementById("custom-color-trigger");
const customColorChip = document.getElementById("custom-color-chip");
const colorPicker = document.getElementById("color-picker");
const colorSv = document.getElementById("color-sv");
const colorSvThumb = document.getElementById("color-sv-thumb");
const colorHue = document.getElementById("color-hue");
const colorHueThumb = document.getElementById("color-hue-thumb");
const colorHexInput = document.getElementById("color-hex-input");

let pickerHsv = { h: 228, s: 0.61, v: 0.86 };

function currentPickerHex() {
  const { r, g, b } = hsvToRgb(pickerHsv.h, pickerHsv.s, pickerHsv.v);
  return rgbToHex(r, g, b);
}

function renderPickerUI() {
  colorSvThumb.style.left = `${pickerHsv.s * 100}%`;
  colorSvThumb.style.top = `${(1 - pickerHsv.v) * 100}%`;
  colorHueThumb.style.left = `${(pickerHsv.h / 360) * 100}%`;
  colorSv.style.backgroundColor = `hsl(${pickerHsv.h}, 100%, 50%)`;
  const hex = currentPickerHex();
  customColorChip.style.background = hex;
  if (document.activeElement !== colorHexInput) {
    colorHexInput.value = hex.slice(1).toUpperCase();
  }
}

async function commitPickerColor() {
  const hex = currentPickerHex();
  applyAccent(hex, hex);
  await storageSet({ [STORAGE_KEYS.accent]: { accent: hex, soft: hex } });
  renderSwatches(null);
}

function syncPickerUI(hex) {
  const { r, g, b } = hexToRgb(hex);
  pickerHsv = rgbToHsv(r, g, b);
  renderPickerUI();
}

function dragSv(e) {
  const rect = colorSv.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
  pickerHsv.s = x;
  pickerHsv.v = 1 - y;
  renderPickerUI();
  commitPickerColor();
}

colorSv.addEventListener("pointerdown", (e) => {
  colorSv.setPointerCapture(e.pointerId);
  dragSv(e);
});
colorSv.addEventListener("pointermove", (e) => {
  if (e.buttons & 1) dragSv(e);
});

function dragHue(e) {
  const rect = colorHue.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  pickerHsv.h = x * 360;
  renderPickerUI();
  commitPickerColor();
}

colorHue.addEventListener("pointerdown", (e) => {
  colorHue.setPointerCapture(e.pointerId);
  dragHue(e);
});
colorHue.addEventListener("pointermove", (e) => {
  if (e.buttons & 1) dragHue(e);
});

colorHexInput.addEventListener("input", () => {
  const clean = colorHexInput.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6);
  if (clean.length !== colorHexInput.value.length) colorHexInput.value = clean;
  if (clean.length === 6) {
    syncPickerUI(`#${clean}`);
    commitPickerColor();
  }
});

customColorTrigger.addEventListener("click", (e) => {
  e.stopPropagation();
  colorPicker.hidden = !colorPicker.hidden;
});

const colorPickerDone = document.getElementById("color-picker-done");
colorPickerDone.addEventListener("click", (e) => {
  e.stopPropagation();
  colorPicker.hidden = true;
});

async function loadAccent() {
  const data = await storageGet(STORAGE_KEYS.accent);
  const stored = data[STORAGE_KEYS.accent];
  const accent = stored || ACCENT_PRESETS[0];
  applyAccent(accent.accent, accent.soft);
  renderSwatches(accent.accent);
  syncPickerUI(accent.accent);
}

/* ---------- Init ---------- */
(async function init() {
  await loadFaviconCache();
  await loadTiles();
  loadAccent();
  loadLayout();
  loadClockFormat();
})();
