/* Runs before the page's first paint. chrome.storage is asynchronous and can be
   slow while the browser is starting, so the settings that decide where things
   sit are also mirrored in localStorage (see saveBootState in script.js), which
   can be read immediately. Without this the default layout can be seen first. */
(function () {
  let boot = {};
  try {
    boot = JSON.parse(localStorage.getItem("frostpane_boot")) || {};
  } catch {}
  window.frostpaneBoot = boot;
  const { dataset } = document.body;
  if (boot.layout) dataset.layout = boot.layout;
  if (["glow", "sky", "shimmer", "stars"].includes(boot.bg)) dataset.bg = boot.bg;
  if (boot.clock) dataset.clock = boot.clock;
  if (boot.accent) document.documentElement.style.setProperty("--accent", boot.accent);
  if (boot.soft) document.documentElement.style.setProperty("--accent-soft", boot.soft);
})();
