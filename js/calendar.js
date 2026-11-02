// Reads calendars from private iCal (.ics) links — works with Google, iCloud and Outlook.
// Handles all-day events, time zones, and common repeating events (daily/weekly/monthly/yearly).
window.AmbientCalendar = (function () {
  'use strict';

  var DAY = 864e5;
  var WEEKDAYS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

  // ---------- Line parsing ----------

  function parseLine(line) {
    var quoted = false, i;
    for (i = 0; i < line.length; i++) {
      var ch = line.charAt(i);
      if (ch === '"') quoted = !quoted;
      else if (ch === ':' && !quoted) break;
    }
    if (i >= line.length) return null;
    var head = line.slice(0, i).split(';'), params = {};
    for (var j = 1; j < head.length; j++) {
      var eq = head[j].indexOf('=');
      if (eq > 0) params[head[j].slice(0, eq).toUpperCase()] = head[j].slice(eq + 1).replace(/^"|"$/g, '');
    }
    return { name: head[0].toUpperCase(), params: params, value: line.slice(i + 1) };
  }

  function unescapeText(s) { return s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1'); }

  // -> { wall: Date in local wall-clock terms, tz: TZID | 'UTC' | null, allDay }
  function parseDate(value, params) {
    var m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/.exec(value);
    if (!m) return null;
    return {
      wall: new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)),
      allDay: !m[4],
      tz: m[7] ? 'UTC' : (params.TZID || null)
    };
  }

  function parseDuration(v) {
    var m = /^([-+])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v);
    if (!m) return null;
    var ms = ((+m[2] || 0) * 7 * DAY) + ((+m[3] || 0) * DAY) + ((+m[4] || 0) * 36e5) + ((+m[5] || 0) * 6e4) + ((+m[6] || 0) * 1e3);
    return m[1] === '-' ? -ms : ms;
  }

  function parseRule(s) {
    var r = {};
    s.split(';').forEach(function (kv) { var p = kv.split('='); r[p[0].toUpperCase()] = p[1]; });
    return r;
  }

  // ---------- Time zones ----------

  // How far ahead of UTC `tz` is at a given instant, in ms.
  function zoneOffset(tz, date) {
    var n = date.toLocaleString('en-US', {
      timeZone: tz, hour12: false, year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric'
    }).match(/\d+/g);
    return Date.UTC(+n[2], +n[0] - 1, +n[1], +n[3] % 24, +n[4], +n[5]) - Math.floor(date.getTime() / 1000) * 1000;
  }

  // Convert a wall-clock time in `tz` to a real instant.
  function toReal(wall, tz) {
    if (!tz) return wall;
    var utc = Date.UTC(wall.getFullYear(), wall.getMonth(), wall.getDate(), wall.getHours(), wall.getMinutes(), wall.getSeconds());
    if (tz === 'UTC') return new Date(utc);
    try {
      var guess = utc - zoneOffset(tz, new Date(utc));
      return new Date(utc - zoneOffset(tz, new Date(guess)));
    } catch (e) {
      return wall; // unknown zone name (e.g. Windows-style) — assume TV's local time
    }
  }

  function real(d) { return d.allDay ? d.wall : toReal(d.wall, d.tz); }

  // ---------- Recurrence ----------

  function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }

  function at(y, m, day, tmpl) {
    var d = new Date(y, m, day, tmpl.getHours(), tmpl.getMinutes(), tmpl.getSeconds());
    return d.getMonth() === m ? d : null;
  }

  function nthWeekday(y, m, wd, n, tmpl) {
    var d;
    if (n > 0) {
      d = new Date(y, m, 1);
      d = at(y, m, 1 + (wd - d.getDay() + 7) % 7 + (n - 1) * 7, tmpl);
    } else {
      d = new Date(y, m + 1, 0);
      d = at(y, m, d.getDate() - (d.getDay() - wd + 7) % 7 + (n + 1) * 7, tmpl);
    }
    return d;
  }

  // Calls emit(wallDate) for each occurrence from `start` until `limit`.
  function expand(start, rr, limit, emit) {
    var interval = +(rr.INTERVAL || 1), count = rr.COUNT ? +rr.COUNT : Infinity, n = 0, guard = 0;
    var until = Infinity;
    if (rr.UNTIL) {
      var u = parseDate(rr.UNTIL, {});
      if (u) until = u.allDay ? u.wall.getTime() + DAY - 1 : real(u).getTime();
    }
    var byday = rr.BYDAY ? rr.BYDAY.split(',') : null;

    function take(d) {
      if (d.getTime() > until || n >= count || d > limit) return false;
      if (d >= start) { n++; emit(d); }
      return true;
    }

    function takeAll(list) {
      list.sort(function (a, b) { return a - b; });
      for (var i = 0; i < list.length; i++) if (!take(list[i])) return false;
      return true;
    }

    var y0 = start.getFullYear(), m0 = start.getMonth(), d, k;

    if (rr.FREQ === 'DAILY') {
      for (d = start; guard++ < 6000; d = addDays(d, interval)) if (!take(d)) break;
    } else if (rr.FREQ === 'WEEKLY') {
      var days = byday ? byday.map(function (x) { return (WEEKDAYS[x.slice(-2)] + 6) % 7; }) : [(start.getDay() + 6) % 7];
      var monday = addDays(start, -((start.getDay() + 6) % 7));
      for (k = 0; guard++ < 3000; k += interval) {
        var week = days.map(function (off) {
          var c = addDays(monday, k * 7 + off);
          c.setHours(start.getHours(), start.getMinutes(), start.getSeconds());
          return c;
        });
        if (!takeAll(week)) break;
      }
    } else if (rr.FREQ === 'MONTHLY') {
      for (k = 0; guard++ < 1200; k += interval) {
        var y = y0 + Math.floor((m0 + k) / 12), m = (m0 + k) % 12, cands = [];
        if (byday) {
          byday.forEach(function (x) {
            var p = /^([+-]?\d)?([A-Z]{2})$/.exec(x);
            if (p && p[1]) { var c = nthWeekday(y, m, WEEKDAYS[p[2]], +p[1], start); if (c) cands.push(c); }
          });
        } else {
          (rr.BYMONTHDAY ? rr.BYMONTHDAY.split(',') : [start.getDate()]).forEach(function (md) {
            md = +md;
            var c = at(y, m, md > 0 ? md : new Date(y, m + 1, 0).getDate() + md + 1, start);
            if (c) cands.push(c);
          });
        }
        if (!takeAll(cands)) break;
      }
    } else if (rr.FREQ === 'YEARLY') {
      for (k = 0; guard++ < 300; k += interval) {
        d = at(y0 + k, m0, start.getDate(), start);
        if (d && !take(d)) break;
      }
    } else {
      emit(start);
    }
  }

  // ---------- Parse a whole feed ----------

  function parse(text, cal, from, to) {
    var lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/), ev = null, events = [], overrides = {}, out = [];

    lines.forEach(function (line) {
      if (line === 'BEGIN:VEVENT') { ev = { ex: [] }; return; }
      if (line === 'END:VEVENT') { if (ev) events.push(ev); ev = null; return; }
      if (!ev) return;
      var p = parseLine(line);
      if (!p) return;
      switch (p.name) {
        case 'DTSTART': ev.start = parseDate(p.value, p.params); break;
        case 'DTEND': ev.end = parseDate(p.value, p.params); break;
        case 'DURATION': ev.dur = parseDuration(p.value); break;
        case 'SUMMARY': ev.title = unescapeText(p.value); break;
        case 'LOCATION': ev.loc = unescapeText(p.value); break;
        case 'RRULE': ev.rrule = parseRule(p.value); break;
        case 'RECURRENCE-ID': ev.recurId = parseDate(p.value, p.params); break;
        case 'UID': ev.uid = p.value; break;
        case 'STATUS': ev.status = p.value.toUpperCase(); break;
        case 'EXDATE':
          p.value.split(',').forEach(function (v) {
            var x = parseDate(v, p.params);
            if (x) ev.ex.push(real(x).getTime());
          });
          break;
      }
    });

    events.forEach(function (e) {
      if (e.recurId && e.uid) overrides[e.uid + '@' + real(e.recurId).getTime()] = true;
    });

    events.forEach(function (e) {
      if (!e.start || e.status === 'CANCELLED') return;
      var s0 = real(e.start);
      var len = e.end ? real(e.end) - s0 : e.dur != null ? e.dur : (e.start.allDay ? DAY : 0);

      function add(st) {
        var en = new Date(st.getTime() + len);
        if ((len > 0 ? en <= from : en < from) || st >= to) return;
        out.push({ title: e.title || 'Busy', loc: e.loc || '', start: st, end: en, allDay: e.start.allDay, color: cal.color });
      }

      if (e.rrule && !e.recurId) {
        var wall = e.start.wall, tz = e.start.tz;
        if (tz === 'UTC') { wall = s0; tz = null; }
        var skipBefore = from.getTime() - len - 2 * DAY;
        expand(wall, e.rrule, new Date(to.getTime() + 2 * DAY), function (w) {
          if (w.getTime() < skipBefore) return;
          var r = e.start.allDay ? w : toReal(w, tz);
          if (overrides[e.uid + '@' + r.getTime()] || e.ex.indexOf(r.getTime()) >= 0) return;
          add(r);
        });
      } else {
        add(s0);
      }
    });

    return out;
  }

  // ---------- Fetch ----------

  // done(events | null | false). null = no calendars set up, false = none could be downloaded.
  function load(cals, days, done) {
    if (!cals || !cals.length) return done(null);
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var from = today, to = addDays(today, days);
    var pending = cals.length, loaded = 0, all = [];

    cals.forEach(function (cal) {
      var url = cal.url.replace(/^webcal:/i, 'https:');
      // Desktop preview: browsers block calendar downloads, so go through the local preview server.
      if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) url = location.origin + '/proxy?url=' + encodeURIComponent(url);
      var x = new XMLHttpRequest();
      x.open('GET', url);
      x.timeout = 20000;
      x.onload = function () {
        if (x.status === 200) { try { all = all.concat(parse(x.responseText, cal, from, to)); loaded++; } catch (e) {} }
        finish();
      };
      x.onerror = x.ontimeout = finish;
      x.send();
    });

    function finish() {
      if (--pending) return;
      if (!loaded) return done(false);
      all.forEach(function (e) {
        var d = new Date(e.start.getTime()); d.setHours(0, 0, 0, 0);
        e.day = Math.max(d.getTime(), today.getTime());
      });
      all.sort(function (a, b) { return (a.day - b.day) || (b.allDay - a.allDay) || (a.start - b.start); });
      done(all);
    }
  }

  return { load: load, parse: parse };
})();
