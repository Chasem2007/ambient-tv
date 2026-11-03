(function () {
  'use strict';

  // Written in ES5 so it runs on older Samsung TVs (Tizen 3/4 ship an old Chromium).

  var KEY = {
    LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13,
    BACK: 10009, ESC: 27, BACKSPACE: 8,
    PLAYPAUSE: 10252, PLAY: 415, PAUSE: 19, YELLOW: 405, SPACE: 32,
    CH_UP: 427, CH_DOWN: 428, PAGE_UP: 33, PAGE_DOWN: 34
  };

  var cfg = window.AMBIENT_CONFIG || {};
  var STORE_KEY = 'ambient.settings.v1';

  var OPTIONS = [
    { key: 'rotate', label: 'Change background', values: [0, 60, 300, 900, 1800, 3600],
      fmt: function (v) { return v === 0 ? 'Never' : v < 3600 ? (v / 60) + ' min' : '1 hour'; } },
    { key: 'motion', label: 'Slow motion', values: [true, false], fmt: onOff },
    { key: 'shuffle', label: 'Shuffle', values: [true, false], fmt: onOff },
    { key: 'clockStyle', label: 'Clock style', values: ['analog', 'digital'],
      fmt: function (v) { return v === 'analog' ? 'Analog' : 'Digital'; } },
    { key: 'idleClock', label: 'Clock while idle', values: ['analog', 'small', 'off'],
      fmt: function (v) { return { off: 'Off', small: 'Small', analog: 'Analog' }[v]; } },
    { key: 'night', label: 'Night mode', values: ['auto', 'off'],
      fmt: function (v) { return v === 'auto' ? 'After sunset' : 'Off'; } },
    { key: 'infoTimeout', label: 'Hide after', values: [5, 10, 15, 30, 60],
      fmt: function (v) { return v + ' sec'; } },
    { key: 'dim', label: 'Dim background', values: [0, 0.2, 0.4, 0.6],
      fmt: function (v) { return v === 0 ? 'Off' : Math.round(v * 100) + '%'; } },
    { key: 'units', label: 'Temperature', values: ['F', 'C'],
      fmt: function (v) { return '°' + v; } }
  ];

  // With a video background, the photo options don't apply.
  if (cfg.video) OPTIONS = OPTIONS.filter(function (o) { return !/^(rotate|motion|shuffle)$/.test(o.key); });

  function onOff(v) { return v ? 'On' : 'Off'; }
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---------- Settings persistence ----------

  var settings = (function () {
    var s = {}, d = cfg.defaults || {};
    OPTIONS.forEach(function (o) { s[o.key] = d.hasOwnProperty(o.key) ? d[o.key] : o.values[0]; });
    try {
      var saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      Object.keys(saved).forEach(function (k) { if (s.hasOwnProperty(k)) s[k] = saved[k]; });
    } catch (e) {}
    return s;
  })();

  function saveSettings() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch (e) {}
  }

  // ---------- Toast ----------

  var toastTimer = null;

  function toast(html) {
    var el = $('toast');
    el.innerHTML = html;
    el.className = 'show';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = ''; }, 3200);
  }

  // ---------- Backgrounds ----------

  var backgrounds = [].concat(window.AMBIENT_BACKGROUNDS || [], cfg.remoteBackgrounds || []);
  if (cfg.includeGeneratedArt !== false || backgrounds.length === 0) {
    backgrounds = backgrounds.concat(window.AmbientArt.list());
  }

  var order = [], pos = 0, held = false, rotateTimer = null;
  var layers = [$('layerA'), $('layerB')], front = 0, loadToken = 0;

  function buildOrder(keepCurrent) {
    var current = order[pos];
    order = backgrounds.map(function (_, i) { return i; });
    if (settings.shuffle) {
      for (var i = order.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1)), t = order[i];
        order[i] = order[j]; order[j] = t;
      }
    }
    pos = keepCurrent && current !== undefined ? Math.max(0, order.indexOf(current)) : 0;
  }

  function srcFor(bg) { return bg.art ? window.AmbientArt.render(bg.art) : bg.src; }

  // Calls done(true) once the image has loaded, done(false) if it can't load.
  // Don't use img.decode() here: on this Samsung TV it appears to black out the whole display.
  function whenLoaded(img, done) {
    var finished = false;
    function finish(ok) { if (!finished) { finished = true; clearTimeout(timer); done(ok); } }
    img.onload = function () { finish(true); };
    img.onerror = function () { finish(false); };
    var timer = setTimeout(function () { finish(img.complete && img.naturalWidth > 0); }, 8000);
  }

  function showBackground(step, announce, tries) {
    tries = tries || 0;
    if (step) pos = (pos + step + order.length) % order.length;
    var bg = backgrounds[order[pos]];
    var token = ++loadToken;
    var src = srcFor(bg), next = layers[1 - front], img = new Image();
    img.src = src;
    whenLoaded(img, function (ok) {
      if (token !== loadToken) return;
      if (!ok) {
        // Skip a broken photo, but give up after trying each one once instead of looping forever.
        if (tries + 1 < backgrounds.length) showBackground(step < 0 ? -1 : 1, announce, tries + 1);
        return;
      }
      next.style.backgroundImage = 'url("' + src + '")';
      next.className = 'layer kb-' + Math.floor(Math.random() * 4);
      void next.offsetWidth; // restart animation
      next.className += ' active';
      layers[front].className = layers[front].className.replace(' active', '');
      front = 1 - front;
      if (announce) toast(esc(bg.title || '') + (bg.subtitle ? '<span class="muted">' + esc(bg.subtitle) + '</span>' : ''));
    });
    scheduleRotate();
  }

  function scheduleRotate() {
    clearTimeout(rotateTimer);
    if (settings.rotate > 0 && !held && backgrounds.length > 1) {
      rotateTimer = setTimeout(function () { showBackground(1); }, settings.rotate * 1000);
    }
  }

  // ---------- Video background ----------

  // A looping video (cfg.video) replaces the photos. The clip's end is crossfaded into its
  // start, so the loop point has no visible cut.
  function startVideo() {
    var v = document.createElement('video');
    v.className = 'layer video';
    v.muted = true;
    v.loop = true;
    v.autoplay = true;
    v.setAttribute('playsinline', '');
    v.addEventListener('playing', function () { v.classList.add('active'); });
    v.src = cfg.video;
    $('stage').appendChild(v);
    v.play();
    // If the TV ever pauses or stalls it (e.g. after coming back from another app), start it again.
    setInterval(function () { if (v.paused || v.ended) v.play(); }, 5000);
  }

  function toggleHold() {
    if (cfg.video) return;
    held = !held;
    toast(held ? 'Holding this background' : 'Backgrounds will rotate');
    scheduleRotate();
  }

  // ---------- Clock ----------

  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                'August', 'September', 'October', 'November', 'December'];

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function timeText(d, withAmpm) {
    var h = d.getHours(), m = pad(d.getMinutes());
    if (cfg.clock24) return pad(h) + ':' + m;
    return ((h % 12) || 12) + ':' + m + (withAmpm ? (h < 12 ? ' AM' : ' PM') : '');
  }

  // Analog dial in the style of Apple's Clock widget, drawn in a 200×200 SVG.
  // Hands are rotated from code each second (CSS animations on SVG blacked out the TV's display).
  function buildDial(el, seconds) {
    var marks = '', i;
    for (i = 0; i < 60; i++) {
      if (i % 5) marks += '<line class="tk" x1="100" y1="7" x2="100" y2="11" transform="rotate(' + i * 6 + ' 100 100)"/>';
    }
    for (i = 1; i <= 12; i++) {
      var a = i * Math.PI / 6;
      marks += '<text class="num" x="' + (100 + 76 * Math.sin(a)).toFixed(1) + '" y="' + (100 - 76 * Math.cos(a)).toFixed(1) + '">' + i + '</text>';
    }
    // Apple-style hands: a thin stem from the centre, then a thicker rounded bar.
    function hand(cls, len) {
      return '<g class="' + cls + '"><line class="stem" x1="100" y1="100" x2="100" y2="86"/>' +
        '<line class="bar" x1="100" y1="86" x2="100" y2="' + (100 - len) + '"/></g>';
    }
    el.innerHTML = '<svg viewBox="0 0 200 200"><circle class="face" cx="100" cy="100" r="99"/>' + marks +
      hand('h', 46) + hand('m', 78) + '<circle class="cap" cx="100" cy="100" r="5.5"/>' +
      (seconds ? '<g class="s"><line x1="100" y1="118" x2="100" y2="10"/></g><circle class="cap-s" cx="100" cy="100" r="3.6"/>' +
        '<circle class="hole" cx="100" cy="100" r="1.3"/>' : '') + '</svg>';
  }

  // Faceless dial for the idle clock: 12 bars, white hands, orange-ringed centre.
  function buildBarDial(el) {
    var marks = '';
    for (var i = 0; i < 12; i++) marks += '<line class="bm" x1="100" y1="4" x2="100" y2="27" transform="rotate(' + i * 30 + ' 100 100)"/>';
    function hand(cls, len) {
      return '<g class="' + cls + '"><line class="stem" x1="100" y1="100" x2="100" y2="88"/>' +
        '<line class="bar" x1="100" y1="88" x2="100" y2="' + (100 - len) + '"/></g>';
    }
    el.innerHTML = '<svg viewBox="0 0 200 200">' + marks + hand('h', 58) + hand('m', 96) +
      '<circle class="cap" cx="100" cy="100" r="6"/><circle class="cap-s" cx="100" cy="100" r="3.8"/>' +
      '<circle class="hole" cx="100" cy="100" r="1.7"/></svg>';
  }

  function setHands(el, d) {
    var sec = d.getSeconds() + d.getMilliseconds() / 1000, min = d.getMinutes() + sec / 60, hr = (d.getHours() % 12) + min / 60;
    el.querySelector('.h').setAttribute('transform', 'rotate(' + hr * 30 + ' 100 100)');
    el.querySelector('.m').setAttribute('transform', 'rotate(' + min * 6 + ' 100 100)');
    var s = el.querySelector('.s');
    if (s) s.setAttribute('transform', 'rotate(' + Math.floor(sec) * 6 + ' 100 100)');
  }

  var mainDial = document.querySelector('.main-analog'), idleDial = document.querySelector('.idle-analog');

  var lastMinute = -1;

  function tick() {
    var d = new Date();
    $('clock-hm').textContent = timeText(d, false);
    $('clock-ampm').textContent = cfg.clock24 ? '' : (d.getHours() < 12 ? 'AM' : 'PM');
    document.querySelector('#idle-clock .idle-text').textContent = timeText(d, settings.idleClock === 'analog');
    $('date').textContent = DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate();
    setHands(mainDial, d);
    setHands(idleDial, d);
    if (d.getMinutes() !== lastMinute) { lastMinute = d.getMinutes(); renderAgenda(); applyDim(); }
  }

  // Drift the idle clock between corners so it never burns into the panel.
  function moveIdleClock() {
    // Fall back to the clock's known size if it measures as 0, so it never lands off-screen.
    var el = $('idle-clock'), w = el.offsetWidth || 180, h = el.offsetHeight || 190;
    var xs = [112, 1920 - 112 - w, (1920 - w) / 2], ys = [96, 1080 - 96 - h];
    var x = xs[Math.floor(Math.random() * xs.length)], y = ys[Math.floor(Math.random() * ys.length)];
    el.style.left = Math.round(x + Math.random() * 30 - 15) + 'px';
    el.style.top = Math.round(y + Math.random() * 16 - 8) + 'px';
  }

  // ---------- Night mode ----------

  // 0 during the day, easing to 1 over the 40 minutes around sunset (and back around sunrise).
  function nightLevel() {
    if (settings.night !== 'auto' || !weather || !weather.sunrise) return 0;
    var now = Date.now(), ramp = 40 * 6e4;
    var morning = 1 - (now - (weather.sunrise - ramp / 2)) / ramp;
    var evening = (now - (weather.sunset - ramp / 2)) / ramp;
    return Math.max(0, Math.min(1, Math.max(morning, evening)));
  }

  function applyDim() {
    var night = nightLevel();
    $('dim').style.opacity = Math.max(settings.dim, night * (cfg.nightDim || 0.5));
    body.classList.toggle('night', night > 0.5);
  }

  // ---------- Weather (Open-Meteo, no API key needed) ----------

  var weather = null;

  var WMO = {
    0: 'Clear', 1: 'Mostly Clear', 2: 'Partly Cloudy', 3: 'Cloudy', 45: 'Fog', 48: 'Freezing Fog',
    51: 'Light Drizzle', 53: 'Drizzle', 55: 'Heavy Drizzle', 56: 'Freezing Drizzle', 57: 'Freezing Drizzle',
    61: 'Light Rain', 63: 'Rain', 65: 'Heavy Rain', 66: 'Freezing Rain', 67: 'Freezing Rain',
    71: 'Light Snow', 73: 'Snow', 75: 'Heavy Snow', 77: 'Snow Grains',
    80: 'Showers', 81: 'Showers', 82: 'Heavy Showers', 85: 'Snow Showers', 86: 'Snow Showers',
    95: 'Thunderstorms', 96: 'Thunderstorms', 99: 'Thunderstorms'
  };

  function getJSON(url, ok, fail) {
    var x = new XMLHttpRequest();
    x.open('GET', url);
    x.timeout = 15000;
    x.onload = function () {
      if (x.status !== 200) return fail && fail();
      try { ok(JSON.parse(x.responseText)); } catch (e) { if (fail) fail(); }
    };
    x.onerror = x.ontimeout = function () { if (fail) fail(); };
    x.send();
  }

  var place = cfg.location || {};

  function locate(done) {
    if (place.lat != null && place.lon != null) return done();
    getJSON('https://ipapi.co/json/', function (j) {
      place = { lat: j.latitude, lon: j.longitude, name: place.name || j.city };
      done();
    });
  }

  function fetchWeather() {
    locate(function () {
      getJSON('https://api.open-meteo.com/v1/forecast?latitude=' + place.lat + '&longitude=' + place.lon +
        '&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto&forecast_days=1',
        function (j) {
          weather = {
            t: j.current.temperature_2m, code: j.current.weather_code,
            hi: j.daily.temperature_2m_max[0], lo: j.daily.temperature_2m_min[0],
            // Local times like "2026-10-20T17:52" — parsed in the TV's time zone.
            sunrise: new Date(j.daily.sunrise[0]).getTime(), sunset: new Date(j.daily.sunset[0]).getTime()
          };
          renderWeather();
          applyDim();
        });
    });
  }

  function deg(c) { return Math.round(settings.units === 'F' ? c * 9 / 5 + 32 : c) + '°'; }

  function renderWeather() {
    if (!weather) return;
    $('weather').innerHTML = esc(deg(weather.t) + '  ' + (WMO[weather.code] || '')) +
      '<span class="muted">H ' + deg(weather.hi) + '  L ' + deg(weather.lo) +
      (place.name ? '  ·  ' + esc(place.name) : '') + '</span>';
  }

  // ---------- Calendar ----------

  var events = null;

  function fetchCalendar() {
    window.AmbientCalendar.load(cfg.calendars, cfg.agendaDays || 2, function (list) {
      if (list === false) return; // offline: keep showing the last good copy
      events = list;
      renderAgenda();
    });
  }

  function dayLabel(dayStart) {
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var diff = Math.round((dayStart - today.getTime()) / 864e5);
    if (diff <= 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    var d = new Date(dayStart);
    return DAYS[d.getDay()];
  }

  function renderAgenda() {
    var box = $('agenda');
    if (!events) { box.style.display = 'none'; return; }
    box.style.display = '';

    var now = new Date(), html = '', lastDay = null;
    var upcoming = events.filter(function (e) { return e.end > now; }).slice(0, 4);

    if (!upcoming.length) {
      $('agenda-list').innerHTML = '<div class="card-empty">Nothing else on your calendar</div>';
      return;
    }

    upcoming.forEach(function (e) {
      var label = dayLabel(e.day);
      if (label !== lastDay) { html += '<div class="day">' + label + '</div>'; lastDay = label; }
      var ongoing = !e.allDay && e.start <= now;
      var when = e.allDay ? 'All day' : timeText(e.start, true) + ' – ' + timeText(e.end, true);
      if (e.loc) when += '  ·  ' + e.loc;
      html += '<div class="event"><div class="bar" style="background:' + esc(e.color || '#fff') + '"></div>' +
        '<div class="body"><div class="title">' + (ongoing ? '<span class="now">NOW</span>' : '') + esc(e.title) + '</div>' +
        '<div class="when">' + esc(when) + '</div></div></div>';
    });
    $('agenda-list').innerHTML = html;
  }

  // ---------- Sports ----------

  var games = null, sportsTimer = null;

  // Checks every minute while a game is live, otherwise every 15 minutes.
  function fetchSports() {
    clearTimeout(sportsTimer);
    window.AmbientSports.load(cfg.sports, function (rows) {
      if (rows !== false) games = rows;
      renderSports();
      var live = games && games.some(function (g) { return g.state === 'in'; });
      sportsTimer = setTimeout(fetchSports, (live ? 1 : 15) * 6e4);
    });
  }

  function gameDay(d) {
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var day = new Date(d.getTime()); day.setHours(0, 0, 0, 0);
    var diff = Math.round((day - today) / 864e5);
    return diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday' : DAYS[d.getDay()];
  }

  function renderSports() {
    var box = $('sports');
    var rows = (games || []).slice(0, 3);
    if (!rows.length) { box.style.display = 'none'; return; }
    box.style.display = '';
    $('sports-list').innerHTML = rows.map(function (g) {
      var title, when, pill = '';
      if (g.state === 'pre') {
        title = g.team + (g.away ? ' at ' : ' vs ') + g.opp;
        when = gameDay(g.start) + ' \u00B7 ' + timeText(g.start, true);
      } else {
        title = g.team + ' ' + g.us + ', ' + g.opp + ' ' + g.them;
        if (g.state === 'in') { pill = '<span class="now live">LIVE</span>'; when = g.detail; }
        else when = (g.won ? 'Won' : 'Final') + ' \u00B7 ' + gameDay(g.start);
      }
      return '<div class="event"><div class="bar" style="background:' + esc(g.color) + '"></div>' +
        '<div class="body"><div class="title">' + pill + esc(title) + '</div><div class="when">' + esc(when) + '</div></div></div>';
    }).join('');
  }

  // ---------- Overlay & dock ----------

  var body = document.body, hideTimer = null;
  var appKeys = (cfg.apps || ['disney', 'applemusic', 'prime', 'youtube']).filter(function (k) {
    return window.AmbientApps.catalog[k];
  });
  var dockFocus = 0, tiles;

  function isInfo() { return body.classList.contains('info'); }

  function showInfo() {
    body.classList.add('info');
    clearTimeout(hideTimer);
    if (!isSettings()) hideTimer = setTimeout(hideInfo, settings.infoTimeout * 1000);
  }

  function hideInfo() {
    clearTimeout(hideTimer);
    body.classList.remove('info');
    body.classList.remove('settings');
  }

  function renderDock() {
    $('dock').innerHTML = window.AmbientApps.tileHTML(appKeys);
    tiles = $('dock').querySelectorAll('.tile');
    focusTile(dockFocus);
  }

  function focusTile(i) {
    dockFocus = Math.max(0, Math.min(tiles.length - 1, i));
    for (var j = 0; j < tiles.length; j++) tiles[j].classList.toggle('focus', j === dockFocus);
  }

  function activateTile() {
    if (dockFocus === appKeys.length) return openSettings();
    window.AmbientApps.launch(appKeys[dockFocus], function (ok, msg) {
      if (!ok && msg) toast(esc(msg));
      if (ok) hideInfo();
    });
  }

  // ---------- Settings panel ----------

  var focusRow = 0;

  function isSettings() { return body.classList.contains('settings'); }

  function renderSettings() {
    $('settings-rows').innerHTML = OPTIONS.map(function (o, i) {
      return '<div class="row' + (i === focusRow ? ' focus' : '') + '"><span>' + o.label +
        '</span><span class="val">' + o.fmt(settings[o.key]) + '</span></div>';
    }).join('');
  }

  function openSettings() {
    body.classList.add('settings');
    renderSettings();
    showInfo();
  }

  function closeSettings() {
    body.classList.remove('settings');
    showInfo();
  }

  function changeSetting(dir) {
    var o = OPTIONS[focusRow];
    var i = o.values.indexOf(settings[o.key]);
    settings[o.key] = o.values[(i + dir + o.values.length) % o.values.length];
    saveSettings();
    applySettings(o.key);
    renderSettings();
  }

  function applySettings(changed) {
    body.classList.toggle('motion', !!settings.motion);
    body.classList.toggle('idle-clock', settings.idleClock !== 'off');
    body.classList.toggle('idle-dial-on', settings.idleClock === 'analog');
    body.classList.toggle('clock-analog', settings.clockStyle === 'analog');
    applyDim();
    if (changed === 'idleClock') { tick(); moveIdleClock(); }
    if (changed === 'units') renderWeather();
    if (changed === 'rotate') scheduleRotate();
    if (changed === 'shuffle') buildOrder(true);
  }

  // ---------- Input ----------

  function isBack(k) { return k === KEY.BACK || k === KEY.ESC || k === KEY.BACKSPACE; }
  function isHold(k) { return k === KEY.PLAYPAUSE || k === KEY.PLAY || k === KEY.PAUSE || k === KEY.YELLOW || k === KEY.SPACE; }

  function exitApp() {
    try { tizen.application.getCurrentApplication().exit(); } catch (e) {}
  }

  document.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    e.preventDefault();

    if (isSettings()) {
      if (isBack(k) || k === KEY.ENTER) return closeSettings();
      if (k === KEY.UP) focusRow = (focusRow - 1 + OPTIONS.length) % OPTIONS.length;
      else if (k === KEY.DOWN) focusRow = (focusRow + 1) % OPTIONS.length;
      else if (k === KEY.LEFT) return changeSetting(-1);
      else if (k === KEY.RIGHT) return changeSetting(1);
      return renderSettings();
    }

    if (!cfg.video) {
      if (isHold(k)) return toggleHold();
      if (k === KEY.CH_UP || k === KEY.PAGE_UP) return showBackground(1, true);
      if (k === KEY.CH_DOWN || k === KEY.PAGE_DOWN) return showBackground(-1, true);
    }

    if (!isInfo()) {
      // While idle, ◀ ▶ flip backgrounds without bringing up the info.
      if (!cfg.video && k === KEY.LEFT) return showBackground(-1, true);
      if (!cfg.video && k === KEY.RIGHT) return showBackground(1, true);
      if (isBack(k)) return exitApp();
      return showInfo();
    }

    if (isBack(k) || k === KEY.DOWN) return hideInfo();
    if (k === KEY.LEFT) focusTile(dockFocus - 1);
    else if (k === KEY.RIGHT) focusTile(dockFocus + 1);
    else if (k === KEY.ENTER) return activateTile();
    showInfo();
  });

  // The Samsung remote can act as a pointer; movement wakes the info, hovering focuses tiles.
  var lastMove = 0;
  document.addEventListener('mousemove', function (e) {
    var now = Date.now();
    if (now - lastMove > 300) { lastMove = now; if (!isSettings()) showInfo(); }
    var t = e.target.closest && e.target.closest('.tile');
    if (t) focusTile(+t.getAttribute('data-i'));
  });
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('.tile');
    if (t && isInfo() && !isSettings()) { focusTile(+t.getAttribute('data-i')); activateTile(); }
  });

  // ---------- TV platform ----------

  function registerKeys() {
    try {
      tizen.tvinputdevice.registerKeyBatch(['MediaPlayPause', 'MediaPlay', 'MediaPause', 'ColorF2Yellow', 'ChannelUp', 'ChannelDown']);
    } catch (e) {}
  }

  // Stop the TV's own screensaver from kicking in over the background.
  function keepAwake() {
    try {
      webapis.appcommon.setScreenSaver(webapis.appcommon.AppCommonScreenSaverState.SCREEN_SAVER_OFF,
        function () {}, function () {});
    } catch (e) {}
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { keepAwake(); fetchWeather(); fetchCalendar(); fetchSports(); }
  });

  // ---------- Start ----------

  registerKeys();
  keepAwake();
  window.AmbientApps.init();
  buildDial(mainDial, true);
  buildBarDial(idleDial);
  applySettings();
  renderDock();
  if (cfg.video) startVideo();
  else { buildOrder(false); showBackground(0); }
  tick();
  moveIdleClock();
  fetchWeather();
  fetchCalendar();
  fetchSports();
  setInterval(tick, 1000);
  setInterval(moveIdleClock, 5 * 60 * 1000);
  setInterval(fetchWeather, 20 * 60 * 1000);
  setInterval(fetchCalendar, 15 * 60 * 1000);
  setInterval(keepAwake, 10 * 60 * 1000);

  // Refresh once a day at 4 AM. TV web engines can stall after running for days on end;
  // a quiet reload clears that out (settings are saved, so nothing is lost).
  var started = Date.now();
  setInterval(function () {
    var d = new Date();
    if (d.getHours() === 4 && Date.now() - started > 3 * 36e5 && !isInfo()) location.reload();
  }, 5 * 60 * 1000);
  showInfo();
})();
