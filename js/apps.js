// App shortcuts shown in the dock, drawn as plain text tiles.
window.AmbientApps = (function () {
  'use strict';

  var SLIDERS = '<svg class="glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>';

  // ids are tried first (verified on a 2026 U8000H), then installed apps matching the name, then the store page.
  var CATALOG = {
    disney:     { name: 'Disney+',     match: /disney/i,               ids: ['MCmYXNxgcu.DisneyPlus'], store: '3201901017640' },
    applemusic: { name: 'Apple Music', match: /^apple\s*music$/i,       ids: ['org.tizen.apple.apple-music'], store: '3201908019041' },
    prime:      { name: 'Prime Video', match: /^prime\s*video$/i,       ids: ['org.tizen.primevideo', 'evKhCgZelL.AmazonIgnitionLauncher2', 'org.tizen.ignition'], store: '3201910019365' },
    youtube:    { name: 'YouTube',     match: /^youtube$/i,            ids: ['9Ur5IzDKqV.TizenYouTube', '111299001912'], store: '111299001912' },
    netflix:    { name: 'Netflix',     match: /^netflix$/i,            ids: ['org.tizen.netflix-app', '3201907018807', '11101200001'], store: '3201907018807' },
    appletv:    { name: 'Apple TV',    match: /^apple\s*tv$/i,          ids: ['com.samsung.tv.aria-video'], store: '3201807016597' }
  };

  var installed = [];

  function init() {
    try {
      tizen.application.getAppsInfo(function (list) { installed = list; }, function () {});
    } catch (e) {}
  }

  function tileHTML(keys) {
    return keys.map(function (k, i) {
      var a = CATALOG[k];
      return '<div class="tile tile-' + k + '" data-i="' + i + '"><div class="face"><span class="wm">' + a.name + '</span></div></div>';
    }).join('') +
      '<div class="tile tile-settings" data-i="' + keys.length + '"><div class="face">' + SLIDERS +
      '</div><div class="label">Settings</div></div>';
  }

  // done(ok, message)
  function launch(key, done) {
    var a = CATALOG[key];
    if (typeof tizen === 'undefined') return done(false, a.name + ' opens on the TV');

    // Skip placeholder/helper entries some TVs list next to the real app (e.g. "org.tizen.primevideo-dummy").
    var tries = a.ids.slice();
    installed.forEach(function (info) {
      if (a.match.test(info.name) && !/dummy|service|companion|cobalt/i.test(info.id) && tries.indexOf(info.id) < 0) tries.push(info.id);
    });
    if (tries.indexOf(a.store) < 0) tries.push(a.store);

    (function next(i) {
      if (i >= tries.length) return openStore(a, done);
      try {
        tizen.application.launch(tries[i], function () { done(true); }, function () { next(i + 1); });
      } catch (e) { next(i + 1); }
    })(0);
  }

  // Not installed: try to open its page in the Samsung app store.
  function openStore(a, done) {
    try {
      var ctrl = new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/default', null, null, null, [
        new tizen.ApplicationControlData('Sub_Menu', ['detail']),
        new tizen.ApplicationControlData('widget_id', [a.store])
      ]);
      tizen.application.launchAppControl(ctrl, 'org.volt.apps',
        function () { done(true); },
        function () { done(false, 'Couldn’t open ' + a.name + '. Is it installed?'); });
    } catch (e) {
      done(false, 'Couldn’t open ' + a.name + '. Is it installed?');
    }
  }

  return { init: init, tileHTML: tileHTML, launch: launch, catalog: CATALOG };
})();
