# Changelog

All notable changes to Frostpane are documented here.

## [1.3.2] — 2026-10-04

### Changed
- The Sky background now plays out like a scene. Opening a tab by day starts with a soft sun glare and slowly turning light beams, then clouds fade in and flocks of birds cross the sky. By night each star twinkles on its own rhythm, a moon hangs in the corner, and shooting stars streak past every few seconds, the first within a second of opening
- Clouds are more defined and move faster

## [1.3.1] — 2026-10-03

### Changed
- The Sky background is visibly animated: two bands of clouds drift across it at different speeds, a soft sun/moon glow slowly breathes, the haze moves faster, stars twinkle more strongly, and a shooting star crosses the night sky every so often. Clouds thin out at night so the sky stays dark

## [1.3] — 2026-10-03

A visual refresh — new backgrounds and clock styles that all mix and match.

### Added
- **Selectable backgrounds** — keep the original Glow, or switch to **Sky**, which follows the clock through dawn, day, dusk, and a starlit night (or stays pinned to one phase), or **Aurora**, four slowly drifting colour fields derived from your accent
- **Film grain** — an optional texture over any background
- **Animate background** toggle — freeze the background motion without changing its look
- **Clock faces** — Light (the original), Serif, Mono, or Bold with an accent gradient
- **Clock colour** — pick any colour for the clock with the built-in picker, or leave it on Auto to keep each face's own colouring
- All of the above mix freely and are included in exported backups
- Ctrl-click (Cmd-click on macOS) a bookmark to open it in a new tab, matching how browsers treat any link — middle-click still does the same

### Changed
- The settings panel scrolls inside itself when the window is too short to show it all
## [1.2.1] — 2026-09-09

A quality pass — no new surface, three rough edges smoothed.

### Added
- Respect for the system **reduce motion** setting — the drifting background glows, pulsing colon, spinning search halo, cursor-tracked sheen, and hover lift all stand down when the OS asks for less movement
- Backups now carry your **whole page**, not just the grid: accent, layout, search engine, clock format, and the glass icons toggle travel with the file

### Changed
- Exported backups are now named `frostpane-backup.json` and use a tagged object format. Bookmark files exported by 1.0–1.2 still import exactly as before
- Cached favicons carry a version and a timestamp, and are pruned when they age past 30 days or their bookmark is removed — so the cache tracks the grid instead of growing forever

### Fixed
- Stale cached icons now heal on upgrade instead of needing the bookmark removed and re-added — the WhatsApp workaround from 1.2 is no longer necessary

## [1.2] — 2026-09-02

### Added
- **Glass icons** — bookmark favicons are desaturated and given a soft specular sheen so the grid reads as one pane of glass instead of a scatter of brand colors; full color returns on the tile you hover or focus
- A **Glass icons** toggle in settings to switch back to the original full-color logos at any time

### Fixed
- Favicons failing to load for subdomains — sites like `web.whatsapp.com` fell back to a letter tile because Google's favicon service has no entry for the subdomain; Frostpane now retries the root domain before giving up
- The icon finish no longer flashes on first paint when Glass icons is turned off

## [1.1] — 2026-08-16

### Added
- Search engine switcher — choose Brave, Google, DuckDuckGo, or Startpage from the settings panel
- Drag-to-reorder bookmarks — drag a tile onto another to swap their positions, including into an empty slot
- Cursor-tracked liquid-glass hover glow on the frosted card, search bar, and tiles
- Softly pulsing colon in the clock

### Changed
- The add/edit bookmark modal is now frosted and animates open/closed instead of appearing instantly
- Tile hover now lifts and brightens with an inset highlight, on top of the existing zoom
- In Single Panel layout, the date now sits next to the clock instead of pinned to the far edge
- The custom bookmark-name tooltip now only appears in Quiet Dock, since the other two layouts already show names inline
- Sharper date/greeting text via corrected font smoothing and weight

### Fixed
- Blurry date/day-of-week text rendering

## [1.0] — 2026-08-14

Initial release: live clock, quick search, 12-tile bookmark grid, three selectable layouts, accent color themes, cached favicons, keyboard navigation, and JSON export/import.
