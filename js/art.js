// Built-in generated artwork: soft colour fields, so the app looks good before you add photos.
window.AmbientArt = (function () {
  'use strict';

  var PALETTES = {
    aurora: { title: 'Aurora', base: ['#04101c', '#0a2836'], blobs: ['#1de9b6', '#3d5afe', '#00b8d4', '#7c4dff'], seed: 11 },
    dusk:   { title: 'Dusk',   base: ['#1a0f2e', '#3b1c3f'], blobs: ['#ff7a59', '#ffb26b', '#c0399b', '#6a3093'], seed: 23 },
    tide:   { title: 'Tide',   base: ['#031a26', '#073b4c'], blobs: ['#118ab2', '#06d6a0', '#8ecae6', '#0b4f6c'], seed: 37 },
    ember:  { title: 'Ember',  base: ['#120806', '#2a0f0a'], blobs: ['#ff5e3a', '#ff9500', '#a4161a', '#ffba08'], seed: 41 },
    moss:   { title: 'Moss',   base: ['#0b130d', '#1b2a1f'], blobs: ['#588157', '#a3b18a', '#3a5a40', '#cfc9b8'], seed: 53 },
    linen:  { title: 'Linen',  base: ['#cfc6b8', '#a99f90'], blobs: ['#f2ece2', '#8e9a9c', '#d9c7ad', '#6f7d80'], seed: 67 }
  };

  var cache = {};

  function rng(seed) {
    return function () {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  }

  function rgba(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  function grainTile(r) {
    var t = document.createElement('canvas');
    t.width = t.height = 192;
    var ctx = t.getContext('2d');
    var img = ctx.createImageData(192, 192);
    for (var i = 0; i < img.data.length; i += 4) {
      var v = r() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return t;
  }

  function render(name) {
    if (cache[name]) return cache[name];
    var p = PALETTES[name];
    var w = 1920, h = 1080;
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d');
    var r = rng(p.seed);

    var lin = g.createLinearGradient(0, 0, w, h);
    lin.addColorStop(0, p.base[0]);
    lin.addColorStop(1, p.base[1]);
    g.fillStyle = lin;
    g.fillRect(0, 0, w, h);

    for (var i = 0; i < 10; i++) {
      var x = r() * w, y = r() * h * 1.1 - h * 0.05;
      var rad = (0.25 + r() * 0.45) * w;
      var col = p.blobs[i % p.blobs.length];
      var rg = g.createRadialGradient(x, y, 0, x, y, rad);
      rg.addColorStop(0, rgba(col, 0.55));
      rg.addColorStop(0.45, rgba(col, 0.22));
      rg.addColorStop(1, rgba(col, 0));
      g.fillStyle = rg;
      g.fillRect(0, 0, w, h);
    }

    g.globalAlpha = 0.045;
    g.globalCompositeOperation = 'overlay';
    g.fillStyle = g.createPattern(grainTile(r), 'repeat');
    g.fillRect(0, 0, w, h);

    cache[name] = c.toDataURL('image/jpeg', 0.92);
    return cache[name];
  }

  function list() {
    return Object.keys(PALETTES).map(function (k) {
      return { art: k, title: PALETTES[k].title, subtitle: 'Generated artwork' };
    });
  }

  return { render: render, list: list };
})();
