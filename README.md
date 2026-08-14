# Frostpane

A calm, glass-textured new tab page for Chrome and Brave — a live clock, quick search, and a 12-tile bookmark grid, wrapped in a soft animated frosted-glass surface.

![Open Stack layout](screenshots/stack.png)

## Features

- **Three layouts** — pick the shape that fits how you browse:
  - **Open Stack** — centered clock over a 6×2 bookmark grid
  - **Single Panel** — a wide, dense single card, bookmarks as horizontal pills
  - **Quiet Dock** — a minimal icon strip with the clock as the anchor
- **Live clock** with a 12/24-hour toggle and an auto date/greeting
- **Accent themes** — six curated color presets plus a custom color picker, applied as a soft dual-tone glow behind the whole page
- **12-tile bookmark grid** — click to open, right-click to edit, drag nothing (deliberately simple)
- **Cached favicons** — icons are fetched once per domain and cached locally, so new tabs load instantly and don't repeatedly ping a favicon service
- **Full keyboard navigation** — arrow keys move between bookmarks and the search bar, Enter/Space activates the focused tile
- **Middle-click** a bookmark to open it in a new tab
- **Liquid ripple** feedback on click, subtle zoom on hover
- **Export / Import** your bookmark grid as JSON
- **Hover-revealed settings** — no clutter until you need it

<p>
  <img src="screenshots/panel.png" width="49%" alt="Single Panel layout" />
  <img src="screenshots/dock.png" width="49%" alt="Quiet Dock layout" />
</p>

<img src="screenshots/settings.png" width="70%" alt="Settings panel" />

## Install

Frostpane isn't on the Chrome Web Store — install it as an unpacked extension:

1. Clone this repo:
   ```sh
   git clone https://github.com/talalahmad34/frostpane-home.git
   ```
2. Open `chrome://extensions` (or `brave://extensions`)
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the `frostpane-home` folder
5. Open a new tab

## Tech

No build step, no framework — vanilla HTML, CSS, and JavaScript, backed by `chrome.storage.local` for persistence. Manifest V3.

## License

[MIT](LICENSE)
