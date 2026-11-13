// @ts-nocheck
/* Tu Marca · Choose your match — motor procedural de la caja de fósforos.
   mountMatch(rootEl, { shapes, isoSvg, onPick }) -> { light(key), reset(), destroy() }
   Todo se dibuja con canvas + CSS (clases mb-, estilos en ./match.css).
   Los colores de este archivo son texturas de madera, llama y cartón del dibujo
   procedural, no colores de interfaz: la interfaz usa los tokens de tokens.css. */


  var SW = 640, SH = 480;            // internal stage size
  var L = 236, H = 26, CY = 13;      // match element box
  var T = 10, Y0 = CY - T / 2, Y1 = CY + T / 2; // stick thickness (L/T = 23.6)
  var OX = 223, OY = 13;             // head centre inside the match box (transform origin)
  var RES = 3;                       // match bitmap resolution
  var ROW0 = 262.5, PITCH = 24, HEADX = 461, TAGX = 496;
  var STRIKE = { x0: 132, x1: 298, y: 392, r0: 56, r1: 52 };
  var HOLD = { x: 548, y: 114, r: -40 };
  var SLIDE = 112;
  var BURN_MAX = 8;

  /* ---------------- utils ---------------- */
  function prng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hexRgb(hex) {
    var h = String(hex || '#888').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, k) { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
  function rgba(c, a) { return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + (a == null ? 1 : a) + ')'; }
  function lum(c) { return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function el(tag, cls, parent) { var e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; }
  var ease = {
    outCubic: function (p) { return 1 - Math.pow(1 - p, 3); },
    inOutCubic: function (p) { return p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; },
    inQuad: function (p) { return p * p; },
    outBack: function (p) { var c = 1.25; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); },
    lin: function (p) { return p; }
  };
  var WHITE = [255, 255, 255], BLACK = [0, 0, 0];

  /* ---------------- match bitmap ---------------- */
  function headPath(c, m) {
    var j = m.j;
    var xa = L - 29 + j[0] * 1.2, xt = L - 0.9, hT = 8.5 + j[1] * .55, hB = 8.7 + j[2] * .5, xm = L - 12.5 + j[3];
    c.beginPath();
    c.moveTo(xa, Y0 - 0.5);
    c.bezierCurveTo(xa + 5, Y0 - 0.9, xm - 9.5, CY - hT, xm - 1, CY - hT);
    c.bezierCurveTo(xm + 6.5, CY - hT, xt, CY - 5.2 + j[4] * .7, xt, CY + j[5] * .8);
    c.bezierCurveTo(xt, CY + 5.4 + j[6] * .7, xm + 6, CY + hB, xm - 1.5, CY + hB);
    c.bezierCurveTo(xm - 10, CY + hB, xa + 5.5, Y1 + 1.0, xa + 1.2 + j[7], Y1 + 0.5);
    c.quadraticCurveTo(xa - 1.3 + j[8] * .9, CY + 2.2, xa + 0.6 + j[9] * .7, CY);
    c.quadraticCurveTo(xa + 1.5 + j[10] * .9, CY - 2.6, xa, Y0 - 0.5);
    c.closePath();
    return xa;
  }

  function drawMatch(m) {
    var c = m.ctx, rnd = prng(m.seed), i, g, x, y, len, a;
    c.setTransform(RES, 0, 0, RES, 0, 0);
    c.clearRect(0, 0, L, H);
    var xEnd = L - 8;

    /* ---- stick ---- */
    c.save();
    c.beginPath();
    c.moveTo(0.9 + m.j[11] * .5, Y0 + 0.2);
    c.lineTo(xEnd, Y0 + m.j[12] * .25);
    c.lineTo(xEnd, Y1 + m.j[13] * .25);
    c.lineTo(0.4 + m.j[14] * .4, Y1 - 0.1);
    c.closePath();
    c.clip();
    // square section: lit top face + darker side face
    var fy = Y0 + T * 0.63;
    g = c.createLinearGradient(0, Y0, 0, Y1);
    g.addColorStop(0, '#F6E8C6'); g.addColorStop(.07, '#EEDCB4'); g.addColorStop(.36, '#E8D3A8');
    g.addColorStop(.6, '#E1C999'); g.addColorStop(.635, '#D2B27F'); g.addColorStop(.66, '#C7A570');
    g.addColorStop(.9, '#B58F5A'); g.addColorStop(1, '#9E7A49');
    c.fillStyle = g; c.fillRect(0, Y0 - 1, L, T + 2);
    // slow tone drift along the length
    g = c.createLinearGradient(0, 0, L, 0);
    for (i = 0; i <= 6; i++) g.addColorStop(i / 6, 'rgba(150,104,48,' + (rnd() * .11).toFixed(3) + ')');
    c.fillStyle = g; c.fillRect(0, Y0 - 1, L, T + 2);
    // growth bands (wide soft grain)
    for (i = 0; i < 7; i++) {
      y = Y0 + rnd() * T; len = 0.8 + rnd() * 1.6;
      c.fillStyle = 'rgba(166,122,64,' + (0.05 + rnd() * .08).toFixed(3) + ')';
      c.fillRect(0, y, L, len);
    }
    // long fibres
    c.lineCap = 'butt';
    for (i = 0; i < 110; i++) {
      y = Y0 + rnd() * T; x = rnd() * (L + 60) - 60; len = 24 + rnd() * 170;
      a = 0.05 + rnd() * 0.16;
      c.strokeStyle = rnd() < 0.68 ? 'rgba(128,90,44,' + a.toFixed(3) + ')' : 'rgba(255,248,226,' + (a * 1.3).toFixed(3) + ')';
      c.lineWidth = 0.22 + rnd() * 0.42;
      c.beginPath(); c.moveTo(x, y);
      c.bezierCurveTo(x + len * .33, y + (rnd() - .5) * .9, x + len * .66, y + (rnd() - .5) * .9, x + len, y + (rnd() - .5) * 1.1);
      c.stroke();
    }
    // pores / short dashes
    for (i = 0; i < 260; i++) {
      y = Y0 + rnd() * T; x = rnd() * L; len = 1 + rnd() * 5;
      c.fillStyle = 'rgba(104,70,30,' + (0.06 + rnd() * .15).toFixed(3) + ')';
      c.fillRect(x, y, len, 0.25 + rnd() * .2);
    }
    // re-assert the side face shade over the grain
    c.fillStyle = 'rgba(120,82,38,.16)'; c.fillRect(0, fy, L, Y1 - fy + 1);
    // edges
    c.fillStyle = 'rgba(255,251,236,.6)'; c.fillRect(0, Y0, L, 0.55);
    c.fillStyle = 'rgba(255,248,226,.28)'; c.fillRect(0, fy - 0.5, L, 0.5);
    c.fillStyle = 'rgba(86,56,22,.24)'; c.fillRect(0, fy, L, 0.4);
    c.fillStyle = 'rgba(70,44,16,.5)'; c.fillRect(0, Y1 - 0.6, L, 0.7);
    // cut end (left): darker, slightly fuzzy saw cut
    g = c.createLinearGradient(0, 0, 7, 0);
    g.addColorStop(0, 'rgba(96,64,28,.62)'); g.addColorStop(.25, 'rgba(110,76,36,.3)'); g.addColorStop(1, 'rgba(110,76,36,0)');
    c.fillStyle = g; c.fillRect(0, Y0 - 1, 7, T + 2);
    for (i = 0; i < 14; i++) {
      c.fillStyle = 'rgba(84,54,22,' + (0.12 + rnd() * .2).toFixed(3) + ')';
      c.fillRect(0.4 + rnd() * 1.6, Y0 + rnd() * T, 0.5 + rnd() * 1.3, 0.3 + rnd() * .5);
    }
    c.restore();

    /* ---- head ---- */
    var col = m.rgb, lm = lum(col), burn = m.burn;
    var hc = burn <= 0 ? 0 : clamp(0.16 + burn / 3.2, 0, 1);   // head char
    var sc = clamp((burn - 1.2) / (BURN_MAX - 1.2), 0, 1);     // stick char
    // stick scorch just behind the head (drawn under the head)
    if (sc > 0) {
      var cl = 4 + sc * 13, xs = L - 28;
      c.save();
      c.beginPath(); c.rect(0, Y0, xEnd, T); c.clip();
      g = c.createLinearGradient(xs + 3, 0, xs - cl, 0);
      g.addColorStop(0, 'rgba(18,13,10,.96)'); g.addColorStop(.45, 'rgba(30,20,13,.86)');
      g.addColorStop(.75, 'rgba(70,42,20,.45)'); g.addColorStop(1, 'rgba(110,70,30,0)');
      c.fillStyle = g; c.fillRect(xs - cl, Y0, cl + 4, T);
      for (i = 0; i < 26; i++) {
        c.fillStyle = 'rgba(12,9,7,' + (0.2 + rnd() * .4).toFixed(3) + ')';
        c.fillRect(xs - rnd() * cl * 0.95, Y0 + rnd() * T, 1 + rnd() * 3.5, 0.3 + rnd() * .5);
      }
      c.restore();
    }
    // tiny shadow of the dip rim on the stick
    var xa0 = L - 29 + m.j[0] * 1.2;
    g = c.createLinearGradient(xa0 - 3, 0, xa0 + 1.5, 0);
    g.addColorStop(0, 'rgba(60,38,14,0)'); g.addColorStop(1, 'rgba(60,38,14,.38)');
    c.fillStyle = g; c.fillRect(xa0 - 3, Y0 + 0.6, 4.5, T - 1);

    c.save();
    headPath(c, m);
    c.fillStyle = rgba(col); c.fill();
    c.clip();
    var hx0 = L - 30, hx1 = L, hy0 = CY - 10, hy1 = CY + 10;
    // form shading: light from upper-left, matte
    g = c.createLinearGradient(0, hy0, 0, hy1);
    g.addColorStop(0, rgba(WHITE, lm < .35 ? .2 : .3)); g.addColorStop(.34, rgba(WHITE, lm < .35 ? .07 : .1));
    g.addColorStop(.52, 'rgba(0,0,0,0)'); g.addColorStop(.74, rgba(BLACK, lm < .35 ? .26 : .15));
    g.addColorStop(1, rgba(BLACK, lm < .35 ? .58 : .42));
    c.fillStyle = g; c.fillRect(hx0, hy0, 30, 20);
    // warm bounce on the lower side (tray)
    g = c.createLinearGradient(0, CY + 4, 0, hy1);
    g.addColorStop(0, 'rgba(190,150,100,0)'); g.addColorStop(1, 'rgba(190,150,100,.16)');
    c.fillStyle = g; c.fillRect(hx0, CY + 4, 30, 7);
    // tip: slightly different tone where the dip pooled
    g = c.createRadialGradient(L - 3, CY + 1, 0.5, L - 3, CY + 1, 9);
    g.addColorStop(0, lm < .35 ? rgba(mix(col, WHITE, .3), .3) : rgba(mix(col, BLACK, .45), .26));
    g.addColorStop(1, rgba(col, 0));
    c.fillStyle = g; c.fillRect(hx0, hy0, 30, 20);
    // soft matte highlight
    g = c.createRadialGradient(L - 15, CY - 4.6, 0.4, L - 14, CY - 3.6, 8.5);
    g.addColorStop(0, rgba(WHITE, lm < .35 ? .34 : .5)); g.addColorStop(.38, rgba(WHITE, lm < .35 ? .13 : .2));
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(hx0, hy0, 30, 20);
    // grainy phosphorus texture
    var hr = prng(m.seed * 7 + 3);
    for (i = 0; i < 900; i++) {
      x = hx0 + hr() * 30; y = hy0 + hr() * 20; a = 0.05 + hr() * 0.19; len = 0.25 + hr() * 0.55;
      var up = y < CY - 1;
      c.fillStyle = hr() < (up ? 0.62 : 0.36) ? rgba(mix(col, WHITE, .75), a * (lm < .35 ? .8 : 1)) : rgba(mix(col, BLACK, .78), a * 1.15);
      c.fillRect(x, y, len, len);
    }
    for (i = 0; i < 16; i++) { // a few bigger pits / lumps
      x = hx0 + 3 + hr() * 25; y = hy0 + 3 + hr() * 14; len = 0.6 + hr() * 0.8;
      c.fillStyle = rgba(mix(col, BLACK, .7), .16 + hr() * .12);
      c.beginPath(); c.arc(x, y, len, 0, 6.283); c.fill();
      c.fillStyle = rgba(mix(col, WHITE, .8), .12 + hr() * .1);
      c.beginPath(); c.arc(x - len * .5, y - len * .6, len * .6, 0, 6.283); c.fill();
    }
    // charring: creeps from the tip towards the base, never fully covering the base
    if (hc > 0) {
      var cr = prng(m.seed * 13 + 5), stops = 10, p, al;
      g = c.createLinearGradient(L, 0, L - 29, 0);
      for (i = 0; i <= stops; i++) {
        p = i / stops;
        al = clamp((hc * 1.28 - p) * 3.2, 0, 1) * 0.955;
        if (p > 0.82) al *= clamp(1 - (p - 0.82) / 0.2, 0.25, 1);
        g.addColorStop(p, 'rgba(20,16,14,' + al.toFixed(3) + ')');
      }
      c.fillStyle = g; c.fillRect(hx0, hy0, 30, 20);
      // ash: grey matte flecks + faint top sheen so the black head still reads as a volume
      var front = L - 29 * clamp(hc * 1.05, 0, 0.84);
      for (i = 0; i < 260; i++) {
        x = front + cr() * (L - front); y = hy0 + cr() * 20; len = 0.3 + cr() * 0.6;
        c.fillStyle = cr() < .5 ? 'rgba(150,144,136,' + (0.05 + cr() * .16).toFixed(3) + ')' : 'rgba(0,0,0,' + (0.1 + cr() * .25).toFixed(3) + ')';
        c.fillRect(x, y, len, len);
      }
      g = c.createRadialGradient(L - 13, CY - 4.5, 0.4, L - 12, CY - 3.5, 7.5);
      g.addColorStop(0, 'rgba(200,194,186,' + (0.26 * hc).toFixed(3) + ')'); g.addColorStop(1, 'rgba(200,194,186,0)');
      c.fillStyle = g; c.fillRect(front, hy0, L - front, 20);
    }
    c.restore();
    // rim: thin irregular edge of the dip + contour
    headPath(c, m);
    c.lineWidth = 0.55; c.strokeStyle = rgba(mix(col, BLACK, hc > .5 ? .9 : .62), .42); c.stroke();
    c.beginPath();
    c.moveTo(xa0 + 1.2 + m.j[7], Y1 + 0.5);
    c.quadraticCurveTo(xa0 - 1.3 + m.j[8] * .9, CY + 2.2, xa0 + 0.6 + m.j[9] * .7, CY);
    c.quadraticCurveTo(xa0 + 1.5 + m.j[10] * .9, CY - 2.6, xa0, Y0 - 0.5);
    c.lineWidth = 0.8; c.strokeStyle = rgba(mix(col, BLACK, .5), .55); c.stroke();
    m.drawnBurn = burn;
  }

  /* ---------------- flame ---------------- */
  function flameShape(ctx, bx, by, Hh, W, t, lean, wS, hS, ph) {
    var N = 30, i, u, v, prof, cx, hw, y, Lp = [], Rp = [];
    var sway = W * 0.34;
    for (i = 0; i <= N; i++) {
      u = i / N; v = u * hS;
      prof = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.6)), 0.82);
      cx = bx + lean * v * v + sway * Math.pow(v, 1.5) * (Math.sin(v * 5.2 - t * 9.4 + ph) + 0.5 * Math.sin(v * 9.6 - t * 15.1 + 1.7 + ph));
      y = by - v * Hh;
      hw = W * wS * prof;
      Lp.push([cx - hw * (1 + 0.085 * Math.sin(v * 13 - t * 16.5 + ph)), y]);
      Rp.push([cx + hw * (1 + 0.085 * Math.sin(v * 12 - t * 18.2 + 2.3 + ph)), y]);
    }
    ctx.beginPath();
    ctx.moveTo(Lp[0][0], Lp[0][1]);
    for (i = 1; i <= N; i++) ctx.lineTo(Lp[i][0], Lp[i][1]);
    for (i = N; i >= 0; i--) ctx.lineTo(Rp[i][0], Rp[i][1]);
    ctx.closePath();
  }

  function drawFlame(ctx, f, t, pr) {
    var size = f.k * (1 + 0.6 * f.flare);
    if (size < 0.02) return;
    var st = f.still;
    var fl = st ? 1 : 1 + 0.07 * Math.sin(t * 8.7 + f.ph) + 0.045 * Math.sin(t * 21.3 + f.ph * 2) + 0.03 * Math.sin(t * 37.1);
    var fw = st ? 1 : 1 + 0.05 * Math.sin(t * 12.9 + 1 + f.ph) - 0.03 * Math.sin(t * 8.7 + f.ph);
    var Hh = 76 * size * fl, W = 11.6 * Math.sqrt(size) * Math.min(1, size * 1.6) * fw;
    var bx = f.x, by = f.y + 6 * Math.min(1, size);
    var lean = st ? 0 : f.lean + 2.4 * Math.sin(t * 2.3 + f.ph) + 1.4 * Math.sin(t * 5.1);
    var tt = st ? 0.6 : t, g, ph = f.ph;
    var I = clamp(size, 0, 1.3) * (st ? 1 : 0.9 + 0.1 * (fl - 1) / 0.1);

    // warm light thrown on the whole scene
    var gx = bx, gy = by - Hh * 0.3, R = 150 * Math.min(1.1, 0.5 + size * 0.5);
    g = ctx.createRadialGradient(gx, gy, 2, gx, gy, R);
    g.addColorStop(0, 'rgba(255,176,84,' + (0.26 * I).toFixed(3) + ')');
    g.addColorStop(0.14, 'rgba(255,172,80,' + (0.16 * I).toFixed(3) + ')');
    g.addColorStop(0.28, 'rgba(255,168,78,' + (0.085 * I).toFixed(3) + ')');
    g.addColorStop(0.42, 'rgba(255,166,76,' + (0.036 * I).toFixed(3) + ')');
    g.addColorStop(0.56, 'rgba(255,166,76,' + (0.012 * I).toFixed(3) + ')');
    g.addColorStop(0.72, 'rgba(255,166,76,0)');
    g.addColorStop(1, 'rgba(255,166,76,0)');
    ctx.fillStyle = g; ctx.fillRect(gx - R, gy - R, R * 2, R * 2);
    // close halo
    R = 58 * size;
    g = ctx.createRadialGradient(gx, gy, 2, gx, gy, R);
    g.addColorStop(0, 'rgba(255,204,110,' + (0.5 * I).toFixed(3) + ')');
    g.addColorStop(0.5, 'rgba(255,180,84,' + (0.2 * I).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(255,170,70,0)');
    ctx.fillStyle = g; ctx.fillRect(gx - R, gy - R, R * 2, R * 2);

    ctx.save();
    // outer envelope
    g = ctx.createLinearGradient(0, by, 0, by - Hh);
    g.addColorStop(0, 'rgba(250,150,60,.10)'); g.addColorStop(.12, 'rgba(252,150,44,.55)');
    g.addColorStop(.3, 'rgba(253,158,40,.86)'); g.addColorStop(.62, 'rgba(250,140,34,.84)');
    g.addColorStop(.86, 'rgba(238,104,28,.6)'); g.addColorStop(1, 'rgba(226,84,24,0)');
    ctx.shadowColor = 'rgba(246,132,40,.75)'; ctx.shadowBlur = 9 * pr * Math.min(1, size);
    ctx.fillStyle = g; flameShape(ctx, bx, by, Hh, W, tt, lean, 1, 1, ph); ctx.fill();
    // body
    g = ctx.createLinearGradient(0, by, 0, by - Hh * 0.86);
    g.addColorStop(0, 'rgba(255,196,90,.0)'); g.addColorStop(.16, 'rgba(255,206,92,.7)');
    g.addColorStop(.4, 'rgba(255,222,110,.97)'); g.addColorStop(.78, 'rgba(255,206,88,.88)'); g.addColorStop(1, 'rgba(255,170,60,0)');
    ctx.shadowColor = 'rgba(255,204,90,.85)'; ctx.shadowBlur = 5 * pr * Math.min(1, size);
    ctx.fillStyle = g; flameShape(ctx, bx, by - Hh * 0.03, Hh, W, tt, lean, 0.7, 0.86, ph); ctx.fill();
    // incandescent core
    g = ctx.createLinearGradient(0, by - Hh * 0.08, 0, by - Hh * 0.68);
    g.addColorStop(0, 'rgba(255,250,224,0)'); g.addColorStop(.22, 'rgba(255,250,226,.82)');
    g.addColorStop(.55, 'rgba(255,253,236,.98)'); g.addColorStop(.86, 'rgba(255,244,190,.7)'); g.addColorStop(1, 'rgba(255,232,150,0)');
    ctx.shadowColor = 'rgba(255,248,214,.9)'; ctx.shadowBlur = 4 * pr * Math.min(1, size);
    ctx.fillStyle = g; flameShape(ctx, bx, by - Hh * 0.08, Hh, W, tt, lean, 0.4, 0.6, ph); ctx.fill();
    // blue base hugging the head
    g = ctx.createLinearGradient(0, by + 1, 0, by - Hh * 0.25);
    g.addColorStop(0, 'rgba(58,112,246,.5)'); g.addColorStop(.35, 'rgba(74,132,250,.34)');
    g.addColorStop(.7, 'rgba(96,150,255,.2)'); g.addColorStop(1, 'rgba(110,160,255,0)');
    ctx.shadowColor = 'rgba(70,120,255,.55)'; ctx.shadowBlur = 4 * pr * Math.min(1, size);
    ctx.fillStyle = g; flameShape(ctx, bx, by + 1, Hh, W, tt, lean, 1.06, 1, ph); ctx.fill();
    ctx.restore();
  }

  /* ---------------- component ---------------- */
  function mount(root, options) {
    options = options || {};
    var shapes = options.shapes || [];
    var isoSvg = options.isoSvg || options.isSvg || '';
    var onPick = typeof options.onPick === 'function' ? options.onPick : function () {};
    var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

    root.classList.add('mb-root');
    root.innerHTML = '';
    var stage = el('div', 'mb-stage', root);
    stage.setAttribute('role', 'group');
    stage.setAttribute('aria-label', 'Choose your match');

    el('div', 'mb-ground mb-ground--drawer', stage);
    el('div', 'mb-ground mb-ground--sleeve', stage);
    var drawer = el('div', 'mb-drawer', stage);
    var tray = el('div', 'mb-tray', drawer);
    el('div', 'mb-tray-wall', tray);
    el('div', 'mb-tray-floor', tray);
    el('div', 'mb-drawer-front', stage);

    /* matches */
    var matches = [], byKey = {};
    shapes.forEach(function (s, i) {
      var seed = 9173 + i * 7919, r = prng(seed), j = [], k;
      for (k = 0; k < 16; k++) j.push(r() * 2 - 1);
      var m = {
        key: s.key, label: String(s.label || s.key).toUpperCase(), rgb: hexRgb(s.color), seed: seed, j: j,
        rest: { x: HEADX - 3.2 * r(), y: ROW0 + i * PITCH + (r() - .5) * 1.6, r: (r() - .5) * 1.2, lift: 0 },
        state: 'rest', out: false, burn: 0, drawnBurn: -1, queue: [], seg: null, token: 0
      };
      m.cur = { x: m.rest.x, y: m.rest.y, r: m.rest.r, lift: 0 };
      m.disp = { x: m.cur.x, y: m.cur.y };
      m.el = el('button', 'mb-match mb-is-rest', stage);
      m.el.type = 'button';
      m.el.setAttribute('aria-label', 'Elegir forma ' + m.label);
      m.el.setAttribute('aria-pressed', 'false');
      m.sh = el('span', 'mb-match-sh', m.el);
      m.inn = el('span', 'mb-match-in', m.el);
      m.cv = el('canvas', 'mb-match-cv', m.inn);
      m.cv.width = L * RES; m.cv.height = H * RES;
      m.ctx = m.cv.getContext('2d');
      m.tag = el('span', 'mb-tag', stage);
      m.tag.textContent = m.label;
      m.tag.setAttribute('aria-hidden', 'true');
      m.tag.style.top = (ROW0 + i * PITCH) + 'px';
      m.el.addEventListener('click', function () { light(m.key); });
      m.tag.addEventListener('click', function () { light(m.key); });
      drawMatch(m);
      place(m);
      matches.push(m); byKey[m.key] = m;
    });

    el('div', 'mb-cast', stage);

    /* sleeve */
    var sleeve = el('div', 'mb-sleeve', stage);
    el('div', 'mb-frame', sleeve);
    var print = el('div', 'mb-print', sleeve);
    el('div', 'mb-print-tiny', print).textContent = 'Safety matches';
    if (isoSvg) { var iso = el('div', 'mb-print-iso', print); iso.innerHTML = isoSvg; iso.setAttribute('aria-hidden', 'true'); }
    else el('div', 'mb-print-rule', print);
    el('div', 'mb-print-title', print).textContent = 'Choose your match';
    el('div', 'mb-print-tiny', print).textContent = 'Nº 777 · Tu Marca';
    el('div', 'mb-ink', sleeve);
    var side = el('div', 'mb-side', stage);
    el('div', 'mb-striker', side);

    var fx = el('canvas', 'mb-fx', stage);
    fx.setAttribute('aria-hidden', 'true');
    var fc = fx.getContext('2d');

    /* ---- state ---- */
    var pr = 1, scale = 1, visible = true, raf = 0, last = 0, time = 0, destroyed = false;
    var current = null;           // match being lit / lit
    var flames = [], sparks = [], puffs = [], emitters = [], flashes = [];

    function place(m) {
      var c = m.cur, x = c.x, y = c.y, r = c.r;
      if (m.state === 'lit' && !m.still) {
        x += Math.sin(time * 1.25 + 1) * 1.3; y += Math.sin(time * 1.7) * 1.6; r += Math.sin(time * 1.05 + 2) * 0.7;
      }
      m.disp.x = x; m.disp.y = y;
      m.el.style.transform = 'translate(' + (x - OX).toFixed(2) + 'px,' + (y - OY).toFixed(2) + 'px) rotate(' + r.toFixed(2) + 'deg)';
      if (m.out) {
        var lf = c.lift, ox = 1.5 + 11 * lf, oy = 2.5 + 20 * lf, a = r * Math.PI / 180;
        var lx = ox * Math.cos(a) + oy * Math.sin(a), ly = -ox * Math.sin(a) + oy * Math.cos(a);
        m.sh.style.transform = 'translate(' + lx.toFixed(2) + 'px,' + ly.toFixed(2) + 'px) scale(' + (1 + lf * 0.03).toFixed(3) + ',' + (1 + lf * 0.5).toFixed(3) + ')';
        m.sh.style.opacity = (0.8 - 0.5 * lf).toFixed(3);
      }
    }
    function setOut(m, v) {
      m.out = v;
      m.el.classList.toggle('mb-is-out', v);
      if (!v) { m.sh.style.transform = ''; m.sh.style.opacity = ''; }
    }
    function setState(m, s) {
      m.state = s;
      m.el.classList.toggle('mb-is-rest', s === 'rest');
      m.el.setAttribute('aria-pressed', s === 'lit' ? 'true' : 'false');
      m.tag.classList.toggle('mb-is-on', s === 'lit' || s === 'lighting');
    }
    function seg(m, dur, to, ez, onEnd, onTick) { m.queue.push({ dur: dur, to: to, ez: ez || ease.inOutCubic, onEnd: onEnd, onTick: onTick }); }
    function clearAnim(m) { m.queue.length = 0; m.seg = null; }

    function stepMatch(m, dt) {
      var guard = 0;
      while (dt >= 0 && guard++ < 8) {
        if (!m.seg) {
          if (!m.queue.length) return;
          m.seg = m.queue.shift();
          m.seg.t = 0;
          m.seg.from = { x: m.cur.x, y: m.cur.y, r: m.cur.r, lift: m.cur.lift };
        }
        var s = m.seg;
        s.t += dt;
        var p = s.dur <= 0 ? 1 : Math.min(1, s.t / s.dur), e = s.ez(p), to = s.to, f = s.from;
        if (to) {
          m.cur.x = f.x + (to.x - f.x) * e; m.cur.y = f.y + (to.y - f.y) * e;
          m.cur.r = f.r + (to.r - f.r) * e;
          m.cur.lift = f.lift + (to.lift - f.lift) * (to.liftLin ? p : e) + (to.arc || 0) * Math.sin(Math.PI * p);
        }
        if (s.onTick) s.onTick(p, dt);
        if (p < 1) return;
        dt = s.t - s.dur; m.seg = null;
        if (s.onEnd) s.onEnd();
      }
    }

    /* ---- effects ---- */
    function burst(x, y, n, spread, base) {
      for (var i = 0; i < n; i++) {
        var a = base + (Math.random() - .5) * spread, v = 110 + Math.random() * 300;
        sparks.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: 0.28 + Math.random() * 0.42, w: 1 + Math.random() * 1 });
      }
    }
    function addFlame(m, still) {
      var f = { m: m, k: still ? 1 : 0, target: 1, flare: still ? 0 : 1, lean: 0, ph: Math.random() * 6, x: m.disp.x, y: m.disp.y, px: m.disp.x, still: !!still };
      flames.push(f); m.flame = f; return f;
    }
    function blowOut(m) {
      if (m.flame) { m.flame.target = 0; m.flame = null; emitters.push({ m: m, t: 0, dur: 0.95, acc: 0, n: 0, ph: Math.random() * 6 }); }
      if (m.burn < 2.7) m.burn = 2.7;
      drawMatch(m);
    }
    function sendHome(m, delay) {
      m.token++;
      clearAnim(m);
      setState(m, 'returning');
      var out = { x: m.rest.x + SLIDE, y: m.rest.y, r: m.rest.r, lift: 0.12, arc: 0.35 };
      if (m.out) {
        if (delay) seg(m, delay, null);
        seg(m, 0.56, out, ease.inOutCubic, function () { setOut(m, false); });
      }
      seg(m, 0.3, { x: m.rest.x, y: m.rest.y, r: m.rest.r, lift: 0 }, ease.outCubic, function () { setState(m, 'rest'); });
    }
    function release(m) {
      var hadFlame = !!m.flame;
      blowOut(m);
      sendHome(m, hadFlame ? 0.7 : 0);
    }

    function light(key) {
      var m = byKey[key];
      if (!m || destroyed) return;
      if (m.state === 'lighting' || m.state === 'lit') return;
      var reduce = !!mq.matches;
      if (current && current !== m) {
        if (reduce || current.still) settle(current, true); else release(current);
      }
      current = m;
      if (reduce) { lightStill(m); return; }
      var tk = ++m.token;
      clearAnim(m);
      setState(m, 'lighting');
      // 1. slide out of the drawer
      if (!m.out) seg(m, 0.26, { x: m.rest.x + SLIDE, y: m.rest.y, r: m.rest.r, lift: 0.12 }, ease.outCubic, function () { setOut(m, true); });
      // 2. travel to the striker
      seg(m, 0.5, { x: STRIKE.x0, y: STRIKE.y, r: STRIKE.r0, lift: 0.04, arc: 0.75 }, ease.inOutCubic);
      seg(m, 0.07, null);
      // 3. strike: fast drag with the head on the strip
      var emitted = 0;
      seg(m, 0.2, { x: STRIKE.x1, y: STRIKE.y, r: STRIKE.r1, lift: 0.04 }, ease.inQuad, function () {
        burst(m.cur.x + 6, m.cur.y - 1, 9, 2.5, -0.5);
        flashes.push({ x: m.cur.x + 4, y: m.cur.y - 2, age: 0, life: 0.2 });
        addFlame(m, false);
      }, function (p) {
        if (p > 0.5 && emitted < 3 && p > 0.5 + emitted * 0.15) { emitted++; burst(m.cur.x + 5, m.cur.y, 1, 1.6, -0.9); }
      });
      // 4/5. swing up and hold
      seg(m, 0.57, { x: HOLD.x, y: HOLD.y, r: HOLD.r, lift: 1 }, ease.outBack, function () {
        if (m.token !== tk) return;
        setState(m, 'lit');
        try { onPick(m.key); } catch (err) { if (window.console) console.error(err); }
      });
      wake();
    }

    function lightStill(m) {
      m.token++;
      clearAnim(m);
      m.still = true;
      if (m.burn < 1.4) m.burn = 1.4;
      drawMatch(m);
      setState(m, 'lit');
      addFlame(m, true);
      renderFx();
      try { onPick(m.key); } catch (err) { if (window.console) console.error(err); }
    }
    // put a match back in its slot instantly
    function settle(m, charred) {
      m.token++;
      clearAnim(m);
      if (m.flame) { flames.splice(flames.indexOf(m.flame), 1); m.flame = null; }
      m.still = false;
      if (charred && m.burn < 2.7) m.burn = 2.7;
      m.cur.x = m.rest.x; m.cur.y = m.rest.y; m.cur.r = m.rest.r; m.cur.lift = 0;
      setOut(m, false);
      setState(m, 'rest');
      drawMatch(m);
      place(m);
    }

    function reset() {
      current = null;
      flames.length = sparks.length = puffs.length = emitters.length = flashes.length = 0;
      matches.forEach(function (m) { m.burn = 0; settle(m, false); });
      renderFx();
    }

    /* ---- frame ---- */
    function update(dt) {
      var i, m, f, s, e, p;
      for (i = 0; i < matches.length; i++) {
        m = matches[i];
        if (m.seg || m.queue.length) { stepMatch(m, dt); place(m); }
        else if (m.state === 'lit' && !m.still) place(m);
        if (m.flame && !m.still && m.burn < BURN_MAX) {
          m.burn = Math.min(BURN_MAX, m.burn + dt);
          if (m.burn - m.drawnBurn > 0.14 || m.burn === BURN_MAX) drawMatch(m);
        }
      }
      for (i = flames.length - 1; i >= 0; i--) {
        f = flames[i];
        if (f.still) continue;
        if (f.target > 0 && f.m) {
          var vx = (f.m.disp.x - f.px) / Math.max(dt, 0.001);
          f.px = f.m.disp.x; f.x = f.m.disp.x; f.y = f.m.disp.y;
          f.lean += (clamp(-vx * 0.03, -16, 16) - f.lean) * (1 - Math.exp(-dt * 10));
        }
        f.k += (f.target - f.k) * (1 - Math.exp(-dt * (f.target > 0 ? 9 : 17)));
        f.flare *= Math.exp(-dt * 4.2);
        if (f.target === 0 && f.k < 0.03) flames.splice(i, 1);
      }
      for (i = sparks.length - 1; i >= 0; i--) {
        s = sparks[i]; s.age += dt;
        if (s.age >= s.life) { sparks.splice(i, 1); continue; }
        s.vy += 640 * dt; s.vx *= Math.exp(-dt * 1.6);
        s.x += s.vx * dt; s.y += s.vy * dt;
      }
      for (i = flashes.length - 1; i >= 0; i--) { flashes[i].age += dt; if (flashes[i].age >= flashes[i].life) flashes.splice(i, 1); }
      for (i = emitters.length - 1; i >= 0; i--) {
        e = emitters[i]; e.t += dt; e.acc += dt;
        var rate = 0.011;
        while (e.acc > rate) {
          e.acc -= rate;
          puffs.push({ x: e.m.disp.x + 2, y: e.m.disp.y - 4, age: e.acc, life: 2.3 + 0.6 * Math.sin(e.t * 9) * 0.5 + 0.3, em: e.ph - e.t * 2.6, k: (1 - 0.75 * (e.t / e.dur)) * Math.min(1, e.t / 0.08 + 0.2), d: 5, id: e.n++, src: e });
        }
        if (e.t >= e.dur) emitters.splice(i, 1);
      }
      for (i = puffs.length - 1; i >= 0; i--) { p = puffs[i]; p.age += dt; if (p.age >= p.life) puffs.splice(i, 1); }
    }

    function renderFx() {
      var i, s, p, g, a;
      fc.setTransform(pr, 0, 0, pr, 0, 0);
      fc.clearRect(0, 0, SW, SH);
      // smoke wisp: a coherent curling ribbon (soft stroke through the puffs + faint haze)
      if (puffs.length) {
        var pts = [];
        for (i = 0; i < puffs.length; i++) {
          p = puffs[i];
          var rise = 84 * p.age * (1 - 0.13 * p.age);
          var amp = Math.min(24, rise * 0.17);
          pts.push({
            x: p.x + p.d * p.age + amp * Math.sin(rise * 0.034 + p.em) + amp * 0.4 * Math.sin(rise * 0.08 + p.em * 1.7),
            y: p.y - rise, r: rise, id: p.id, src: p.src,
            a: p.k * Math.min(1, p.age / 0.1) * Math.pow(1 - p.age / p.life, 1.5)
          });
        }
        for (i = 0; i < pts.length; i++) {
          p = pts[i];
          var rad = 2.6 + p.r * 0.095;
          a = Math.min(0.5, 0.62 * p.a / rad);
          g = fc.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad);
          g.addColorStop(0, 'rgba(118,112,105,' + a.toFixed(4) + ')');
          g.addColorStop(0.5, 'rgba(122,116,109,' + (a * 0.55).toFixed(4) + ')');
          g.addColorStop(1, 'rgba(128,122,115,0)');
          fc.fillStyle = g; fc.fillRect(p.x - rad, p.y - rad, rad * 2, rad * 2);
        }
      }
      for (i = 0; i < flames.length; i++) drawFlame(fc, flames[i], time, pr);
      // strike flash
      for (i = 0; i < flashes.length; i++) {
        s = flashes[i]; a = Math.pow(1 - s.age / s.life, 1.4);
        var R = 46 + 70 * (s.age / s.life);
        g = fc.createRadialGradient(s.x, s.y, 0, s.x, s.y, R);
        g.addColorStop(0, 'rgba(255,250,226,' + a.toFixed(3) + ')');
        g.addColorStop(0.1, 'rgba(255,232,150,' + (0.95 * a).toFixed(3) + ')');
        g.addColorStop(0.28, 'rgba(255,190,84,' + (0.6 * a).toFixed(3) + ')');
        g.addColorStop(0.6, 'rgba(255,160,70,' + (0.18 * a).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(255,160,70,0)');
        fc.fillStyle = g; fc.fillRect(s.x - R, s.y - R, R * 2, R * 2);
      }
      // sparks: tiny incandescent streaks
      if (sparks.length) {
        fc.save();
        fc.lineCap = 'round';
        fc.shadowColor = 'rgba(240,120,30,.95)'; fc.shadowBlur = 6 * pr;
        for (i = 0; i < sparks.length; i++) {
          s = sparks[i]; p = s.age / s.life;
          fc.strokeStyle = p < 0.25 ? 'rgba(255,226,150,1)' : p < 0.62 ? 'rgba(255,170,64,' + (1 - p * .4).toFixed(3) + ')' : 'rgba(226,96,34,' + Math.min(1, (1 - p) * 2.6).toFixed(3) + ')';
          fc.lineWidth = s.w * (1 - p * 0.5);
          fc.beginPath(); fc.moveTo(s.x, s.y); fc.lineTo(s.x - s.vx * 0.03, s.y - s.vy * 0.03); fc.stroke();
        }
        fc.restore();
      }
    }

    function busy() {
      if (sparks.length || puffs.length || emitters.length || flashes.length) return true;
      for (var i = 0; i < flames.length; i++) if (!flames[i].still) return true;
      for (i = 0; i < matches.length; i++) if (matches[i].seg || matches[i].queue.length) return true;
      return false;
    }
    function frame(now) {
      raf = 0;
      if (destroyed) return;
      var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
      last = now; time += dt;
      update(dt);
      renderFx();
      if (busy() && visible) raf = requestAnimationFrame(frame); else last = 0;
    }
    function wake() { if (!raf && visible && !destroyed && busy()) { last = 0; raf = requestAnimationFrame(frame); } }

    /* ---- sizing / visibility ---- */
    function resize() {
      var w = root.clientWidth;
      if (!w) return;
      scale = w / SW;
      root.style.setProperty('--mb-s', scale.toFixed(4));
      root.style.height = Math.round(SH * scale) + 'px';
      var npr = clamp((window.devicePixelRatio || 1) * scale, 1, 2);
      npr = Math.round(npr * 4) / 4;
      if (npr !== pr || fx.width !== Math.round(SW * npr)) {
        pr = npr; fx.width = Math.round(SW * pr); fx.height = Math.round(SH * pr);
      }
      renderFx();
    }
    var ro = null, io = null;
    if (window.ResizeObserver) { ro = new ResizeObserver(resize); ro.observe(root); }
    else window.addEventListener('resize', resize);
    if (window.IntersectionObserver) {
      io = new IntersectionObserver(function (en) {
        visible = en[en.length - 1].isIntersecting;
        if (visible) wake();
      }, { rootMargin: '80px' });
      io.observe(root);
    }
    resize();

    return {
      light: light,
      reset: reset,
      destroy: function () {
        destroyed = true;
        if (raf) cancelAnimationFrame(raf);
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize);
        if (io) io.disconnect();
        root.innerHTML = ''; root.style.height = '';
      }
    };
  }

  export { mount as mountMatch };
