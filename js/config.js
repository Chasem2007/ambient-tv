// Your personal setup. Edit this file, then run ./scripts/publish.sh — the TV picks it up next time the app starts.
window.AMBIENT_CONFIG = {
  // Weather location. Leave lat/lon as null to auto-detect from your internet connection.
  location: { lat: null, lon: null, name: null },

  // true = 24-hour clock (20:42), false = 12-hour (8:42 PM)
  clock24: false,

  // App shortcuts in the dock, left to right.
  // Available: 'disney', 'applemusic', 'prime', 'youtube', 'netflix', 'appletv'
  apps: ['disney', 'applemusic', 'prime', 'youtube'],

  // Calendars live in js/private.js so the links never get published online.
  calendars: (window.AMBIENT_PRIVATE || {}).calendars || [],
  agendaDays: 7,      // how many days ahead to look (shows the next 4 events)

  // Teams for the Scores card (shows live games, recent finals, and games in the next week).
  // sport/league/team come from ESPN URLs, e.g. espn.com/nba/team/_/name/phx → basketball, nba, phx
  sports: [
    { sport: 'basketball', league: 'nba', team: 'phx' },                     // Suns
    { sport: 'football', league: 'nfl', team: 'ari' },                       // Cardinals
    { sport: 'baseball', league: 'mlb', team: 'ari' },                       // Diamondbacks
    { sport: 'basketball', league: 'mens-college-basketball', team: '2253' } // GCU Lopes
  ],

  // How dark the background gets after sunset (0 – 1) when Night mode is on.
  nightDim: 0.5,

  // Looping video background (replaces the photos). Set to null to go back to photos.
  // Also available: 'video/fireplace.mp4' (plain fire)
  video: 'video/christmas-fireplace.mp4',

  // Extra backgrounds loaded from the internet (any direct image URL).
  // Photos dropped into the /backgrounds folder are picked up by scripts/build-manifest.sh.
  remoteBackgrounds: [
    // { src: 'https://example.com/photo.jpg', title: 'Lake Como', subtitle: 'Italy' }
  ],

  // Include the built-in generated artwork alongside your own photos.
  includeGeneratedArt: false,

  // Starting values for the on-TV Settings menu (changes made on the TV are remembered).
  defaults: {
    rotate: 900,        // seconds between backgrounds (0 = never change)
    motion: true,       // slow drift/zoom; also helps prevent burn-in
    clockStyle: 'analog', // 'analog' (dial + small digital) | 'digital' (large digital)
    idleClock: 'analog', // 'analog' | 'small' | 'off' — clock while the info is hidden
    night: 'auto',      // 'auto' dims after sunset | 'off'
    infoTimeout: 15,    // seconds before the info fades away
    units: 'F',         // 'F' | 'C'
    shuffle: true,
    dim: 0              // 0 – 0.6, darkens the background (nice at night)
  }
};
