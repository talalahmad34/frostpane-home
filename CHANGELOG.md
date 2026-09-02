# Changelog

All notable changes to Frostpane are documented here.

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
