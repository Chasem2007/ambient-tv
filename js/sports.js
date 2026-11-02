// Scores and upcoming games from ESPN's public scoreboard data (no account or key needed).
window.AmbientSports = (function () {
  'use strict';

  var DAY = 864e5;

  function getJSON(url, ok, fail) {
    // Desktop preview: browsers block ESPN's data, so go through the local preview server.
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) url = location.origin + '/proxy?url=' + encodeURIComponent(url);
    var x = new XMLHttpRequest();
    x.open('GET', url);
    x.timeout = 15000;
    x.onload = function () {
      if (x.status !== 200) return fail();
      try { ok(JSON.parse(x.responseText)); } catch (e) { fail(); }
    };
    x.onerror = x.ontimeout = fail;
    x.send();
  }

  function score(c) {
    var s = c.score;
    return s && typeof s === 'object' ? s.displayValue : s;
  }

  // One row per team: a live game, a final from the last few days, or a game in the coming week.
  function toRow(t) {
    var e = t.nextEvent && t.nextEvent[0];
    if (!e) return null;
    var comp = e.competitions[0], status = comp.status.type, start = new Date(e.date), now = Date.now();
    var us = null, them = null;
    comp.competitors.forEach(function (c) { if (c.team.id === t.id) us = c; else them = c; });
    if (!us || !them) return null;

    var row = {
      team: t.shortDisplayName || t.name,
      opp: them.team.shortDisplayName || them.team.name,
      away: us.homeAway === 'away',
      color: t.color ? '#' + t.color : '#fff',
      start: start,
      state: status.state,
      detail: status.shortDetail
    };
    if (status.state === 'in') {
      row.us = score(us); row.them = score(them);
    } else if (status.state === 'post') {
      if (now - start > 3 * DAY) return null;
      row.us = score(us); row.them = score(them);
      row.won = us.winner === true;
    } else if (start - now > 7 * DAY || /TBD/.test(status.shortDetail) && start - now > DAY) {
      return null;
    }
    return row;
  }

  // done(rows | false). false = nothing could be downloaded.
  function load(teams, done) {
    if (!teams || !teams.length) return done([]);
    var pending = teams.length, ok = 0, rows = [];
    teams.forEach(function (tm, i) {
      getJSON('https://site.api.espn.com/apis/site/v2/sports/' + tm.sport + '/' + tm.league + '/teams/' + tm.team,
        function (j) {
          ok++;
          var r = j.team && toRow(j.team);
          if (r) { r.order = i; rows.push(r); }
          finish();
        }, finish);
    });
    function finish() {
      if (--pending) return;
      if (!ok) return done(false);
      var rank = { 'in': 0, post: 1, pre: 2 };
      rows.sort(function (a, b) { return (rank[a.state] - rank[b.state]) || (a.start - b.start) || (a.order - b.order); });
      done(rows);
    }
  }

  return { load: load };
})();
