import "./style.css";
import "./blackbody.css";

(() => {
  "use strict";
  // ================= Physics =================
  // Planck's law, in relative units: B(λ, T) ∝ 1 / (λ⁵ (e^(hc/λkT) − 1)). Everything is quoted relative to the
  // peak of the Sun's curve (5778 K), which is set to 100.
  const K0 = 273.15, C2 = 14388; // hc/k in µm·K
  const TMIN = 20 + K0, TMAX = 10000 + K0, TROOM = 20 + K0;
  const planck = (nm, T) => { const l = nm / 1000, x = C2 / (l * T); return x > 700 ? 0 : 1 / (l ** 5 * Math.expm1(x)); };
  const SUNPK = planck(2897.77e3 / 5778, 5778);
  const rel = (nm, T) => 100 * planck(nm, T) / SUNPK;
  const peakNm = T => 2897.77e3 / T; // Wien's law

  // The real range of brightness is enormous (the Sun's peak is about 4 million times the red light from a red-hot
  // coal), so brightness on screen follows the logarithm of the intensity, much as our eyes do: each equal step
  // brighter is ten times more light. LMIN is set so a red-hot coal just puts a faint red on the screen, LMAX is the
  // peak of the hottest star on the slider. The "squashed" graph uses exactly the same scale, so it matches the screen.
  const LMIN = -5.3, LMAX = 3.3;
  const bright = r => r <= 0 ? 0 : Math.max(0, Math.min(1, (Math.log10(r) - LMIN) / (LMAX - LMIN)));
  // Looking straight at the rock you see all of its light at once, so it glows visibly from about 600 °C.
  const brightRock = r => r <= 0 ? 0 : Math.max(0, Math.min(1, (Math.log10(r) + 8) / (LMAX + 8)));

  // The thermometer in the infrared (at 3 µm) heats up in proportion to the extra radiation falling on it (beyond what
  // it gets from the room). Scaled so a red-hot coal (900 °C) warms it by 1 °C; then the Sun gives about +45 °C.
  const TH_NM = 3000;
  const TH_GAIN = 1 / (planck(TH_NM, 900 + K0) - planck(TH_NM, TROOM));
  // That honest scale leaves cooler rocks barely moving it, so the rise is cheated upwards for low temperatures:
  // a boost that fades away as the rise grows, so coal reads about 28 °C but the lamp, Sun and star read almost
  // what they honestly would. The reading still rises steadily with temperature.
  const thRise = T => Math.max(0, TH_GAIN * (planck(TH_NM, T) - planck(TH_NM, TROOM)));
  const thTarget = T => { const r = thRise(T); return 20 + r + 7.5 * Math.sqrt(r) * Math.exp(-r / 8); };

  // ================= Colour =================
  // CIE 1931 colour matching functions (multi-lobe Gaussian fit, Wyman, Sloan & Shirley 2013), XYZ → sRGB.
  const gss = (l, m, s1, s2) => { const t = (l - m) / (l < m ? s1 : s2); return Math.exp(-0.5 * t * t); };
  const cie = l => [
    1.056 * gss(l, 599.8, 37.9, 31.0) + 0.362 * gss(l, 442.0, 16.0, 26.7) - 0.065 * gss(l, 501.1, 20.4, 26.2),
    0.821 * gss(l, 568.8, 46.9, 40.5) + 0.286 * gss(l, 530.9, 16.3, 31.1),
    1.217 * gss(l, 437.0, 11.8, 36.0) + 0.681 * gss(l, 459.0, 26.0, 13.8)];
  const toLin = ([X, Y, Z]) => [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.2040 * Y + 1.0570 * Z];
  const enc = c => c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  const smooth = f => { f = Math.max(0, Math.min(1, f)); return f * f * (3 - 2 * f); };

  // The colour of pure light of one wavelength, at full brightness, faded at the ends of the visible range
  // where the eye is barely sensitive. Pure spectral colours lie outside what a screen can show, and clipping them
  // leaves flat bands (violet, blue, cyan, green, yellow, red), so the clipped colours are blurred a little along
  // the spectrum to give a smooth rainbow.
  const SPEC = [], HUE = [], LIN = [];
  for (let nm = 380; nm <= 740; nm++) {
    // Deep red (650 nm and beyond) is pure red to the eye. The fitted colour-matching curves drift to orange and
    // then green past about 680 nm, which is an artefact of the fit, so the red end is pinned to pure red.
    const c = nm >= 650 ? [1, 0, 0] : toLin(cie(nm)).map(k => Math.max(0, k)), M = Math.max(...c) || 1;
    LIN.push(c.map(k => k / M));
  }
  const SIG = 11;
  for (let i = 0; i < LIN.length; i++) {
    const acc = [0, 0, 0]; let wt = 0;
    for (let j = -3 * SIG; j <= 3 * SIG; j++) {
      const k = Math.max(0, Math.min(LIN.length - 1, i + j)), w = Math.exp(-0.5 * (j / SIG) ** 2);
      acc[0] += LIN[k][0] * w; acc[1] += LIN[k][1] * w; acc[2] += LIN[k][2] * w; wt += w;
    }
    const M = Math.max(...acc) || 1, nm = 380 + i;
    // fade out at the ends, within 400–700 nm, where the screen gives the visible light plenty of room
    const f = nm < 445 ? smooth((nm - 395) / 50) : nm > 625 ? smooth((710 - nm) / 85) : 1;
    HUE.push(acc.map(k => enc(k / M)));
    SPEC.push(HUE[i].map(k => k * f));
  }
  const specRGB = nm => nm < 380 || nm > 740 ? [0, 0, 0] : SPEC[Math.round(nm) - 380];

  // False colour for the infrared goggles: night-vision green, brighter for more infrared.
  const PAL = [[0, [0, 0, 0]], [0.2, [4, 40, 18]], [0.45, [20, 130, 50]], [0.7, [80, 225, 100]], [0.88, [190, 255, 180]], [1, [245, 255, 240]]];
  function irRGB(v) {
    for (let i = 1; i < PAL.length; i++) if (v <= PAL[i][0]) {
      const [a, ca] = PAL[i - 1], [b, cb] = PAL[i], f = (v - a) / (b - a);
      return ca.map((c, k) => (c + (cb[k] - c) * f) / 255);
    }
    return [1, 1, 1];
  }

  // False colour for the ultraviolet goggles: icy cyan, brighter for more ultraviolet.
  const UPAL = [[0, [0, 0, 0]], [0.2, [2, 26, 44]], [0.45, [10, 110, 150]], [0.7, [60, 210, 240]], [0.88, [180, 245, 255]], [1, [245, 253, 255]]];
  function uvRGB(v) {
    for (let i = 1; i < UPAL.length; i++) if (v <= UPAL[i][0]) {
      const [a, ca] = UPAL[i - 1], [b, cb] = UPAL[i], f = (v - a) / (b - a);
      return ca.map((c, k) => (c + (cb[k] - c) * f) / 255);
    }
    return [1, 1, 1];
  }
  const UV_NM = 330, IR_NM = 2000; // wavelengths used for how strongly the rock glows in each kind of goggles
  const vIrOf = Tk => bright(rel(IR_NM, Tk)), vUvOf = Tk => bright(rel(UV_NM, Tk));

  // Colour and brightness of the glowing rock, tabulated against log T.
  const NT = 240, BB = [];
  const tAt = i => TMIN * (TMAX / TMIN) ** (i / (NT - 1));
  {
    let ybar = 0; for (let nm = 380; nm <= 780; nm += 5) ybar += cie(nm)[1];
    for (let i = 0; i < NT; i++) {
      const T = tAt(i); let X = 0, Y = 0, Z = 0, Yr = 0;
      for (let nm = 380; nm <= 780; nm += 5) { const p = planck(nm, T), c = cie(nm); X += p * c[0]; Y += p * c[1]; Z += p * c[2]; Yr += rel(nm, T) * c[1]; }
      let lin = toLin([X, Y, Z]).map(c => Math.max(0, c)); const M = Math.max(...lin) || 1;
      BB.push({ rgb: lin.map(c => enc(c / M)), v: brightRock(Yr / ybar) });
    }
  }
  const bbAt = T => BB[Math.max(0, Math.min(NT - 1, Math.round((NT - 1) * Math.log(T / TMIN) / Math.log(TMAX / TMIN))))];

  // What one wavelength looks like on the screen at temperature T: its colour, scaled by the (squashed) intensity.
  // Very bright light also bleaches towards white, as it does to our eyes and to cameras.
  // With goggles on, the false colour fades in gradually beyond the visible ends, overlapping the fading red and
  // violet, so there is no hard edge. wIr and wUv say how strongly; by default, infrared fades in from 660 to 760 nm
  // and ultraviolet from 410 down to 340 nm (the prism screen passes its own, based on position across the screen).
  function screenRGB(nm, T, gog, ugog, wIr, wUv) {
    const v = bright(rel(nm, T));
    let out = [0, 0, 0];
    // With ultraviolet goggles on, the violet end is not faded out to black first, but runs on at full strength
    // and crossfades straight into the false colour. (The red end fades as normal before the infrared appears.)
    const uvSide = ugog && nm < 445;
    if ((nm >= 380 && nm <= 740) || uvSide) {
      const c = uvSide ? HUE[Math.max(0, Math.round(nm) - 380)] : specRGB(nm), w = 0.5 * smooth((v - 0.72) / 0.28);
      out = c.map(k => { const o = k * v; return o + w * (1 - o) * k; });
    }
    // crossfade (rather than add) so the overlap doesn't turn a muddy dark brown
    const mix = (col, f) => { if (f > 0) out = out.map((k, i) => k + (col[i] - k) * f); };
    if (gog) mix(irRGB(v), wIr ?? smooth((nm - 660) / 100));
    if (ugog) mix(uvRGB(v), wUv ?? smooth((410 - nm) / 70));
    return out;
  }
  const css = (c, a = 1) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;

  // ================= State =================
  let T = 900 + K0, view = "prism", gog = false, ugog = false, scale = "sun", thT = 20, time = 0;
  const PRESETS = [
    [20, "room temperature"], [300, "a hot plate"], [900, "red-hot coal"], [1400, "a candle flame"],
    [2800, "a lamp filament"], [5500, "the surface of the Sun"], [10000, "a hot blue star"]];
  const sToT = s => TMIN * (TMAX / TMIN) ** (s / 1000);
  const tToS = t => Math.round(1000 * Math.log(t / TMIN) / Math.log(TMAX / TMIN));

  // ================= Canvas =================
  const W = 1100, H = 540;
  const FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
  const main = document.getElementById("main"), mx = main.getContext("2d");
  let dpr = 1;
  function setup() {
    const shown = main.clientWidth || W, k = Math.min(window.devicePixelRatio || 1, 2) * Math.max(1, shown / W);
    dpr = Math.min(k, 4);
    main.width = Math.round(W * dpr); main.height = Math.round(H * dpr); mx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function pill(text, x, y, opt = {}) {
    const { align = "center", dark = true, color, size = 13 } = opt;
    mx.font = `700 ${size}px ${FONT}`;
    const w = mx.measureText(text).width + 20, h = size + 11, x0 = align === "left" ? x : align === "right" ? x - w : x - w / 2;
    rr(mx, x0, y - h / 2, w, h, h / 2);
    mx.fillStyle = dark ? "rgba(22,27,35,0.86)" : "rgba(255,255,255,0.94)"; mx.fill();
    mx.strokeStyle = dark ? "rgba(150,165,185,0.45)" : "#c6ccd3"; mx.lineWidth = 1; mx.stroke();
    mx.fillStyle = color || (dark ? "#e8edf3" : "#202020"); mx.textAlign = "center"; mx.textBaseline = "middle"; mx.fillText(text, x0 + w / 2, y + 1);
  }

  // ---- A simple perspective camera, looking at the bench from the front left and a little above ----
  // World units are centimetres: x along the bench (left to right), y up, z towards the viewer.
  const CAM = { yaw: 0.40, pitch: 0.47, D: 420, F: 2750, tx: 2, ty: 14, tz: -14, cx: 540, cy: 300 };
  const cyw = Math.cos(CAM.yaw), syw = Math.sin(CAM.yaw), cp = Math.cos(CAM.pitch), sp = Math.sin(CAM.pitch);
  function P(x, y, z) {
    const dx = x - CAM.tx, dy = y - CAM.ty, dz = z - CAM.tz;
    const x1 = dx * cyw + dz * syw, z1 = -dx * syw + dz * cyw;
    const y2 = dy * cp - z1 * sp, z2 = dy * sp + z1 * cp, s = CAM.F / (CAM.D - z2);
    return [CAM.cx + x1 * s, CAM.cy - y2 * s, z2, s];
  }
  const Pv = v => P(v[0], v[1], v[2]);
  function path(pts) { mx.beginPath(); pts.forEach((p, i) => { const q = Pv(p); i ? mx.lineTo(q[0], q[1]) : mx.moveTo(q[0], q[1]); }); mx.closePath(); }
  function face(pts, fill, stroke, lw = 1) { path(pts); if (fill) { mx.fillStyle = fill; mx.fill(); } if (stroke) { mx.strokeStyle = stroke; mx.lineWidth = lw; mx.stroke(); } }
  const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
  function box(x0, x1, y0, y1, z0, z1, cols) { // draws the faces seen from the front left: left, front, top
    const [left, front, top] = cols;
    face([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], left);
    face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], front);
    face([[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], top);
  }

  // ---- The apparatus ----
  const BH = 15;                                        // height of the beam above the bench
  const ROCK = { x: -60, y: BH, z: 0, r: 7.5 };
  const WALL = { x0: -40, x1: -36, y0: 0, y1: 34, z0: -26, z1: 20, hole: 2.6 };
  // The prism: an equilateral triangle in the x–z plane, turned 20° anticlockwise (seen from above) so the light
  // crosses the glass parallel to its base, close to the textbook "minimum deviation" position.
  const PR_ROT = 20 * Math.PI / 180;
  const rotXZ = ([x, z]) => [x * Math.cos(PR_ROT) + z * Math.sin(PR_ROT), -x * Math.sin(PR_ROT) + z * Math.cos(PR_ROT)];
  // ...and slid sideways so the beam (along z = 0) meets the middle of the first face, crosses the glass and leaves
  // from the middle of the far face, rather than near a corner
  const PR0 = [rotXZ([0, 7.2]), rotXZ([-6.2, -3.6]), rotXZ([6.2, -3.6])], PR_DZ = -(PR0[0][1] + PR0[1][1]) / 2;
  const PR = { cx: 0, cz: PR_DZ, y0: 8.5, y1: 21.5, a: [PR0[0][0], PR0[0][1] + PR_DZ], b: [PR0[1][0], PR0[1][1] + PR_DZ], c: [PR0[2][0], PR0[2][1] + PR_DZ] };
  // where the beam (along z = 0) enters face AB, then travels parallel to the base BC until it leaves through face AC
  function hitSeg(p, d, s0, s1) { // ray p + t d meets segment s0–s1
    const ex = s1[0] - s0[0], ez = s1[1] - s0[1], den = d[0] * ez - d[1] * ex;
    const t = ((s0[0] - p[0]) * ez - (s0[1] - p[1]) * ex) / den;
    return [p[0] + d[0] * t, p[1] + d[1] * t];
  }
  const IN_XZ = hitSeg([-20, 0], [1, 0], PR.a, PR.b);
  const BASE = [PR.c[0] - PR.b[0], PR.c[1] - PR.b[1]];
  const OUT_XZ = hitSeg(IN_XZ, BASE, PR.a, PR.c);
  const ENTRY = [IN_XZ[0], BH, IN_XZ[1]], EXIT = [OUT_XZ[0], BH, OUT_XZ[1]];
  // The colours already begin to separate inside the glass, so they leave the far face spread over a short distance:
  // violet and ultraviolet (bent most) nearer the base, red and infrared nearer the top corner.
  const AC_LEN = Math.hypot(PR.c[0] - PR.a[0], PR.c[1] - PR.a[1]);
  const AC_DIR = [(PR.c[0] - PR.a[0]) / AC_LEN, 0, (PR.c[1] - PR.a[1]) / AC_LEN];
  const EXIT_SPREAD = 3.2;
  const exitAt = u => add(EXIT, AC_DIR, EXIT_SPREAD * (0.5 - u));
  const SDIR = [Math.cos(0.74), 0, -Math.sin(0.74)];       // from the prism to the middle of the screen
  const SW_ = 92, SY0 = 3, SY1 = 38;                    // screen width, bottom and top
  const SU = [Math.sin(0.74), 0, Math.cos(0.74)];         // along the screen, from the ultraviolet end to the infrared end
  // centre of the screen at beam height: 50 cm from the prism, slid 9.5 cm along itself (to the right) so both feet
  // stand on the bench; the rays are aimed at the screen, so they follow it
  const SC = add(add(EXIT, SDIR, 50), SU, 9.5);
  const SN = [-SDIR[0], 0, -SDIR[2]];                   // the screen faces back towards the prism
  const BAND = 5;                                     // half-height of the spectrum on the screen
  const onScreen = (u, y, off = 0) => add(add([SC[0], y, SC[2]], SU, (u - 0.5) * SW_ * 0.92), SN, off);
  // Where each wavelength lands across the screen (u = 0 to 1). The prism spreads the light schematically:
  // ultraviolet 250–400 nm, visible 400–700 nm, infrared 700–3500 nm.
  const SEG = [[0, 250], [0.13, 400], [0.5, 700], [1, 3500]];
  function lamAt(u) {
    for (let i = 1; i < SEG.length; i++) if (u <= SEG[i][0]) { const [u0, l0] = SEG[i - 1], [u1, l1] = SEG[i]; return l0 + (l1 - l0) * (u - u0) / (u1 - u0); }
    return 3500;
  }
  function uAt(nm) {
    for (let i = 1; i < SEG.length; i++) if (nm <= SEG[i][1]) { const [u0, l0] = SEG[i - 1], [u1, l1] = SEG[i]; return u0 + (u1 - u0) * (nm - l0) / (l1 - l0); }
    return 1;
  }
  const UTH = uAt(TH_NM);

  // The spectrum as an image: one column per position across the screen, soft at the top and bottom.
  const SPX = 440, SPY = 40, strip = document.createElement("canvas"); strip.width = SPX; strip.height = SPY;
  const sx = strip.getContext("2d"), cols = new Array(SPX);
  let stripKey = "";
  function buildStrip() {
    const key = T.toFixed(1) + gog + ugog; if (key === stripKey) return; stripKey = key;
    const img = sx.createImageData(SPX, SPY);
    // the screen gives the near infrared little width, so the false colours fade in over a set distance across it
    for (let i = 0; i < SPX; i++) {
      const u = (i + 0.5) / SPX;
      cols[i] = screenRGB(lamAt(u), T, gog, ugog, smooth((u - 0.44) / 0.07), smooth((0.165 - u) / 0.075));
    }
    for (let j = 0; j < SPY; j++) {
      const d = Math.abs((j + 0.5) / SPY - 0.5) * 2, p = 1 / (1 + Math.exp((d - 0.72) / 0.07));
      for (let i = 0; i < SPX; i++) {
        const c = cols[i], k = (j * SPX + i) * 4;
        img.data[k] = 8 + c[0] * p * 247; img.data[k + 1] = 9 + c[1] * p * 246; img.data[k + 2] = 11 + c[2] * p * 244; img.data[k + 3] = 255;
      }
    }
    sx.putImageData(img, 0, 0);
  }
  // Draw the spectrum image onto the screen in perspective, a slice at a time.
  function drawStrip() {
    const N = 22;
    mx.save(); mx.imageSmoothingEnabled = true;
    for (let k = 0; k < N; k++) {
      const u0 = k / N, u1 = (k + 1) / N;
      const A = Pv(onScreen(u0, BH + BAND, 0.05)), B = Pv(onScreen(u1, BH + BAND, 0.05)), C = Pv(onScreen(u0, BH - BAND, 0.05));
      const sx0 = u0 * SPX, sw = SPX / N;
      const ax = (B[0] - A[0]) / sw, ay = (B[1] - A[1]) / sw, cx = (C[0] - A[0]) / SPY, cy = (C[1] - A[1]) / SPY;
      mx.setTransform(dpr * ax, dpr * ay, dpr * cx, dpr * cy, dpr * (A[0] - ax * sx0), dpr * (A[1] - ay * sx0));
      mx.drawImage(strip, sx0, 0, Math.min(sw + 1, SPX - sx0), SPY, sx0, 0, Math.min(sw + 1, SPX - sx0), SPY);
    }
    mx.restore(); mx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---- Light leaving the rock in all directions ----
  const rays = []; let visAcc = 0, irAcc = 0, uvAcc = 0;
  function spawn(k) {
    let dx, dy, dz, n;
    do { dx = Math.random() * 2 - 1; dy = Math.random() * 2 - 1; dz = Math.random() * 2 - 1; n = Math.hypot(dx, dy, dz); } while (n > 1 || n < 0.2);
    dx /= n; dy /= n; dz /= n;
    rays.push({ p: [ROCK.x + dx * ROCK.r, ROCK.y + dy * ROCK.r, ROCK.z + dz * ROCK.r], d: [dx, dy, dz], s: 0, k });
  }
  function updateRays(dt) {
    const vVis = bbAt(T).v, vIr = vIrOf(T), vUv = vUvOf(T);
    visAcc += dt * 110 * smooth(vVis * 2.2); irAcc += dt * 110 * smooth(vIr * 1.6); uvAcc += dt * 110 * smooth(vUv * 1.6);
    while (visAcc >= 1) { visAcc--; spawn("vis"); }
    while (irAcc >= 1) { irAcc--; spawn("ir"); }
    while (uvAcc >= 1) { uvAcc--; spawn("uv"); }
    for (let i = rays.length - 1; i >= 0; i--) {
      const r = rays[i], v = 70 * dt; r.p = add(r.p, r.d, v); r.s += v;
      if (r.s > 46 || r.p[0] > WALL.x0 || r.p[1] < 0.5) rays.splice(i, 1);
    }
  }
  function drawRays(front) {
    const bb = bbAt(T), vVis = bb.v, vIr = vIrOf(T), vUv = vUvOf(T);
    mx.save(); mx.globalCompositeOperation = "lighter"; mx.lineCap = "round";
    for (const r of rays) {
      if ((r.k === "ir" && !gog) || (r.k === "uv" && !ugog)) continue;
      if ((r.p[2] > ROCK.z) !== front) continue;
      const a = Pv(r.p), b = Pv(add(r.p, r.d, -4.5)), fade = 1 - r.s / 46;
      const c = r.k === "ir" ? irRGB(0.35 + 0.6 * vIr) : r.k === "uv" ? uvRGB(0.35 + 0.6 * vUv) : bb.rgb.map(k => k * (0.4 + 0.6 * vVis));
      mx.strokeStyle = css(c, 0.85 * fade); mx.lineWidth = r.k === "vis" ? 2 : 1.6;
      mx.beginPath(); mx.moveTo(a[0], a[1]); mx.lineTo(b[0], b[1]); mx.stroke();
    }
    mx.restore();
  }

  // ---- The rock: an irregular lump, fixed shape ----
  const ROCK_PTS = [1.0, 0.86, 0.95, 1.08, 0.9, 0.98, 1.05, 0.84, 0.97, 1.1, 0.92, 0.88, 1.02, 0.94];
  const CRACKS = [[[-0.5, 0.1], [-0.1, -0.15], [0.3, 0.05], [0.55, -0.2]], [[-0.2, 0.5], [0.05, 0.2], [0.0, -0.1]], [[0.15, 0.45], [0.4, 0.3]], [[-0.55, -0.35], [-0.2, -0.5], [0.15, -0.55]]];
  function rockPath(c, r) {
    mx.beginPath();
    const n = ROCK_PTS.length;
    for (let i = 0; i <= n; i++) {
      const a = (i % n) / n * Math.PI * 2, k = ROCK_PTS[i % n] * (i % n === 3 ? 1 : 1), q = [c[0] + Math.cos(a) * r * k * 1.15, c[1] + Math.sin(a) * r * k * 0.86];
      i ? mx.lineTo(q[0], q[1]) : mx.moveTo(q[0], q[1]);
    }
    mx.closePath();
  }
  function drawRock() {
    const c = Pv([ROCK.x, ROCK.y, ROCK.z]), r = ROCK.r * c[3];
    const bb = bbAt(T), v = bb.v, vIr = vIrOf(T), vUv = vUvOf(T);
    // halo of light all around
    mx.save(); mx.globalCompositeOperation = "lighter";
    if (v > 0) {
      const g = mx.createRadialGradient(c[0], c[1], r * 0.6, c[0], c[1], r * (1.4 + 5 * v));
      g.addColorStop(0, css(bb.rgb, 0.75 * smooth(v * 1.6))); g.addColorStop(0.35, css(bb.rgb, 0.22 * smooth(v * 1.6))); g.addColorStop(1, css(bb.rgb, 0));
      mx.fillStyle = g; mx.fillRect(c[0] - r * 8, c[1] - r * 8, r * 16, r * 16);
    }
    if (gog && vIr > 0.05) {
      const ic = irRGB(0.3 + 0.65 * vIr), g = mx.createRadialGradient(c[0], c[1], r * 0.6, c[0], c[1], r * (1.6 + 3 * vIr));
      g.addColorStop(0, css(ic, 0.6 * vIr)); g.addColorStop(1, css(ic, 0));
      mx.fillStyle = g; mx.fillRect(c[0] - r * 6, c[1] - r * 6, r * 12, r * 12);
    }
    if (ugog && vUv > 0.05) {
      const uc = uvRGB(0.3 + 0.65 * vUv), g = mx.createRadialGradient(c[0], c[1], r * 0.6, c[0], c[1], r * (1.6 + 3 * vUv));
      g.addColorStop(0, css(uc, 0.6 * vUv)); g.addColorStop(1, css(uc, 0));
      mx.fillStyle = g; mx.fillRect(c[0] - r * 6, c[1] - r * 6, r * 12, r * 12);
    }
    mx.restore();
    // the rock itself, dimly lit by the room
    rockPath(c, r);
    const g = mx.createRadialGradient(c[0] - r * 0.4, c[1] - r * 0.45, r * 0.1, c[0], c[1], r * 1.25);
    g.addColorStop(0, "#77706a"); g.addColorStop(0.6, "#4d4844"); g.addColorStop(1, "#2a2726");
    mx.fillStyle = g; mx.fill();
    mx.save(); mx.clip();
    mx.strokeStyle = "rgba(20,18,17,0.7)"; mx.lineWidth = 1.4;
    for (const cr of CRACKS) { mx.beginPath(); cr.forEach(([a, b], i) => i ? mx.lineTo(c[0] + a * r, c[1] + b * r) : mx.moveTo(c[0] + a * r, c[1] + b * r)); mx.stroke(); }
    // glowing from within: deep red cracks first, then the whole surface
    if (v > 0) {
      const a = smooth(v * 2.4);
      mx.globalCompositeOperation = "source-over";
      const gl = mx.createRadialGradient(c[0], c[1], 0, c[0], c[1], r * 1.2);
      const core = bb.rgb.map(k => k + (1 - k) * smooth((v - 0.55) / 0.4) * 0.9);
      gl.addColorStop(0, css(core, a)); gl.addColorStop(0.7, css(bb.rgb.map(k => k * (0.55 + 0.45 * v)), a * 0.95)); gl.addColorStop(1, css(bb.rgb.map(k => k * 0.45), a * 0.9));
      mx.fillStyle = gl; mx.fillRect(c[0] - r * 2, c[1] - r * 2, r * 4, r * 4);
      mx.strokeStyle = css(core, Math.min(1, a * 1.6)); mx.lineWidth = 1.6;
      for (const cr of CRACKS) { mx.beginPath(); cr.forEach(([p, q], i) => i ? mx.lineTo(c[0] + p * r, c[1] + q * r) : mx.moveTo(c[0] + p * r, c[1] + q * r)); mx.stroke(); }
    }
    if (gog && vIr > 0.05) { mx.fillStyle = css(irRGB(0.3 + 0.65 * vIr), 0.55 * (1 - 0.7 * v)); mx.fillRect(c[0] - r * 2, c[1] - r * 2, r * 4, r * 4); }
    if (ugog && vUv > 0.05) { mx.fillStyle = css(uvRGB(0.3 + 0.65 * vUv), 0.45 * (1 - 0.6 * v)); mx.fillRect(c[0] - r * 2, c[1] - r * 2, r * 4, r * 4); }
    mx.restore();
  }

  // ---- The whole scene ----
  function drawScene(dt) {
    const bb = bbAt(T), v = bb.v, vIr = vIrOf(T), vUv = vUvOf(T);
    // a darkened lab
    const bg = mx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#0b0f15"); bg.addColorStop(1, "#141a22");
    mx.fillStyle = bg; mx.fillRect(0, 0, W, H);

    // bench
    box(-92, 76, -4, 0, -60, 34, ["#2a2f36", "#22262c", "#30353d"]);
    // light from the rock spilling onto the bench (and the wall's lit face, below)
    if (v > 0) {
      const c = Pv([ROCK.x, 0, ROCK.z]), g = mx.createRadialGradient(c[0], c[1], 0, c[0], c[1], 150 + 260 * v);
      g.addColorStop(0, css(bb.rgb, 0.38 * smooth(v * 1.8))); g.addColorStop(1, css(bb.rgb, 0));
      mx.save(); path([[-92, 0, -60], [-92, 0, 34], [76, 0, 34], [76, 0, -60]]); mx.clip();
      mx.globalCompositeOperation = "lighter"; mx.fillStyle = g; mx.fillRect(0, 0, W, H); mx.restore();
    }

    // screen on two legs
    const sl = onScreen(-0.04, 0), sr = onScreen(1.04, 0);
    [[0.08], [0.92]].forEach(([u]) => { const p = onScreen(u, 0, -1.2); face([add(p, SU, -0.8), add(p, SU, 0.8), add([p[0], SY0, p[2]], SU, 0.8), add([p[0], SY0, p[2]], SU, -0.8)], "#1a1d22"); });
    const corners = [[-0.04, SY0], [1.04, SY0], [1.04, SY1], [-0.04, SY1]].map(([u, y]) => onScreen(u, y));
    const back = corners.map(p => add(p, SN, -1.4));
    face([back[1], back[2], corners[2], corners[1]], "#23272d");               // right edge
    face([back[3], back[2], corners[2], corners[3]], "#2c3138");               // top edge
    face(corners, "#08090b", "rgba(120,132,148,0.55)", 1.2);                    // the dark face
    void sl; void sr;

    buildStrip();
    drawStrip();
    // light passing through the air: a faint fan from the prism to the screen. It is drawn over the spectrum so each
    // ray visibly reaches its own colour, and fades out inside the band (the fade runs parallel to the band, so it
    // leaves no edge or sawtooth across the spectrum).
    mx.save(); mx.globalCompositeOperation = "lighter";
    const NF = 40;
    for (let k = 0; k < NF; k++) {
      const um = (k + 0.5) / NF, c = cols[Math.floor(um * SPX)];
      if (c[0] + c[1] + c[2] < 0.01) continue;
      const a = Pv(onScreen(k / NF, BH)), b = Pv(onScreen((k + 1) / NF, BH)), e0 = Pv(exitAt(k / NF)), e1 = Pv(exitAt((k + 1) / NF));
      const lo = Pv(onScreen(um, BH - BAND)), hi = Pv(onScreen(um, BH - BAND * 0.2));
      const g = mx.createLinearGradient(lo[0], lo[1], hi[0], hi[1]);
      g.addColorStop(0, css(c, 0.16)); g.addColorStop(1, css(c, 0));
      mx.fillStyle = g;
      mx.beginPath(); mx.moveTo(e0[0], e0[1]); mx.lineTo(a[0], a[1]); mx.lineTo(b[0], b[1]); mx.lineTo(e1[0], e1[1]); mx.closePath(); mx.fill();
    }
    mx.restore();


    // screen labels and wavelength marks
    mx.save(); mx.font = `700 12px ${FONT}`; mx.textAlign = "center"; mx.textBaseline = "middle";
    const pkNm = peakNm(T), uPk = pkNm <= 3500 ? uAt(pkNm) : null;
    [["ultraviolet", (0 + 0.13) / 2], ["visible light", (0.13 + 0.5) / 2], ["infrared", 0.75]].forEach(([t, u]) => {
      // a label fades back where the "peak radiation" arrow passes through it
      const near = uPk !== null && Math.abs(u - uPk) < 0.07;
      const p = Pv(onScreen(u, BH + BAND + 2.6)); mx.fillStyle = `rgba(205,215,228,${near ? 0.3 : 0.85})`; mx.fillText(t, p[0], p[1]);
    });
    mx.font = `600 10.5px ${FONT}`;
    [[400, "400 nm"], [700, "700 nm"], [1500, "1.5 µm"], [2000, "2 µm"], [2500, "2.5 µm"], [3000, "3 µm"]].forEach(([nm, t]) => {
      const u = uAt(nm), a = Pv(onScreen(u, BH - BAND - 0.6)), b = Pv(onScreen(u, BH - BAND - 1.8)), q = Pv(onScreen(u, BH - BAND - 2.9));
      mx.strokeStyle = "rgba(170,182,198,0.6)"; mx.lineWidth = 1; mx.beginPath(); mx.moveTo(a[0], a[1]); mx.lineTo(b[0], b[1]); mx.stroke();
      mx.fillStyle = "rgba(170,182,198,0.75)"; mx.fillText(t, q[0], q[1] + 1);
    });
    mx.restore();

    drawPeakArrow(uPk);
    drawThermometer(dt);

    // prism on a little stand
    box(-7.5, 5.5, 0, PR.y0, -6.5 + PR.cz, 7.5 + PR.cz, ["#2a2e35", "#23272d", "#383d45"]);
    const tri = y => [PR.a, PR.b, PR.c].map(([x, z]) => [PR.cx + x, y, z]);
    const lo = tri(PR.y0), hi = tri(PR.y1);
    // light inside the glass
    const ec = bb.rgb.map(k => k * (0.35 + 0.65 * v)), beamA = 0.85 * smooth(v * 2.2);
    {
      // the beam enters as one colour and starts to spread into a narrow fan before it leaves the glass
      const A = Pv(ENTRY), NG = 24;
      mx.save(); mx.globalCompositeOperation = "lighter";
      for (let k = 0; k < NG; k++) {
        const c = cols[Math.floor((k + 0.5) / NG * SPX)];
        if (c[0] + c[1] + c[2] < 0.01) continue;
        const e0 = Pv(exitAt(k / NG)), e1 = Pv(exitAt((k + 1) / NG));
        mx.fillStyle = css(c, 0.5);
        mx.beginPath(); mx.moveTo(A[0], A[1]); mx.lineTo(e0[0], e0[1]); mx.lineTo(e1[0], e1[1]); mx.closePath(); mx.fill();
      }
      mx.restore();
    }
    // beam from the hole to the prism
    const hole = [WALL.x1, BH, 0];
    drawBeam(hole, ENTRY, ec, beamA, [gog && [irRGB(0.3 + 0.65 * vIr), vIr, 0], ugog && [uvRGB(0.3 + 0.65 * vUv), vUv, 5.5]]);
    [[0, 1], [1, 2], [2, 0]].forEach(([i, j]) => face([lo[i], lo[j], hi[j], hi[i]], "rgba(170,210,255,0.08)", "rgba(190,225,255,0.35)"));
    face(hi, "rgba(190,225,255,0.14)", "rgba(210,235,255,0.7)", 1.2);


    // the wall, with the hole
    const { x0, x1, y0, y1, z0, z1 } = WALL;
    const leftFace = [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]];
    face(leftFace, "#3a4049");
    if (v > 0 || (gog && vIr > 0.05) || (ugog && vUv > 0.05)) { // lit by the rock
      const c = Pv([x0, ROCK.y, ROCK.z]);
      mx.save(); path(leftFace); mx.clip(); mx.globalCompositeOperation = "lighter";
      const g = mx.createRadialGradient(c[0], c[1], 0, c[0], c[1], 120 + 140 * v);
      if (v > 0) { g.addColorStop(0, css(bb.rgb, 0.6 * smooth(v * 1.8))); g.addColorStop(1, css(bb.rgb, 0)); mx.fillStyle = g; mx.fillRect(0, 0, W, H); }
      if (gog && vIr > 0.05) { const g2 = mx.createRadialGradient(c[0], c[1], 0, c[0], c[1], 160); const ic = irRGB(0.3 + 0.6 * vIr); g2.addColorStop(0, css(ic, 0.5 * vIr)); g2.addColorStop(1, css(ic, 0)); mx.fillStyle = g2; mx.fillRect(0, 0, W, H); }
      if (ugog && vUv > 0.05) { const g3 = mx.createRadialGradient(c[0], c[1], 0, c[0], c[1], 160); const uc = uvRGB(0.3 + 0.6 * vUv); g3.addColorStop(0, css(uc, 0.45 * vUv)); g3.addColorStop(1, css(uc, 0)); mx.fillStyle = g3; mx.fillRect(0, 0, W, H); }
      mx.restore();
    }
    face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], "#2b3037");
    face([[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], "#4a515b");
    // the hole: dark, with the far rim catching nothing
    mx.beginPath();
    for (let i = 0; i <= 28; i++) { const a = i / 28 * Math.PI * 2, q = P(x0, BH + Math.sin(a) * WALL.hole, Math.cos(a) * WALL.hole); i ? mx.lineTo(q[0], q[1]) : mx.moveTo(q[0], q[1]); }
    mx.closePath(); mx.fillStyle = "#05070a"; mx.fill(); mx.strokeStyle = "rgba(0,0,0,0.6)"; mx.lineWidth = 1.5; mx.stroke();
    if (beamA > 0.01) { mx.save(); mx.globalCompositeOperation = "lighter"; mx.fillStyle = css(ec, beamA * 0.5); mx.fill(); mx.restore(); }

    // stand for the rock, the rock and its light
    drawRays(false);
    box(-69, -55, 0, BH - ROCK.r * 0.8, -6, 6, ["#5b4e45", "#4a3f38", "#6d5f55"]);
    drawRock();
    drawRays(true);

    // labels
    const lab = (t, p3, dy = 0) => { const p = Pv(p3); pill(t, p[0], p[1] + dy); };
    lab("Hot rock", [ROCK.x, ROCK.y + ROCK.r + 6, 0]);
    lab("Wall with a hole", [x0, y1 + 3, 14]);
    lab("Prism", [0, PR.y1 + 4, 0]);
    lab("Screen", onScreen(0.5, SY1 + 3.5));

    // goggles overlay
    if (gog || ugog) {
      const g = mx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.62);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.6)"); mx.fillStyle = g; mx.fillRect(0, 0, W, H);
      let y = H - 22;
      if (ugog) { pill("Ultraviolet goggles on: ultraviolet shown in false colour", 16, y, { align: "left", color: "#9eeeff" }); y -= 32; }
      if (gog) pill("Infrared goggles on: infrared shown in false colour", 16, y, { align: "left", color: "#9dffa8" });
    }
    const pre = nearest();
    pill(`Rock: ${fmtC(T)}` + (pre ? `  ·  about as hot as ${pre}` : ""), 16, 24, { align: "left" });
  }

  // A subtle arrow on the screen, pointing down at the peak of the spectrum (Wien's law), visible or not.
  function drawPeakArrow(u) {
    mx.save(); mx.font = `700 14px ${FONT}`; mx.textAlign = "center"; mx.textBaseline = "bottom";
    const col = "rgba(235,240,248,0.6)";
    if (u === null) { // cooler than about 550 °C: the peak is further into the infrared than the screen reaches
      // shown off the right-hand edge of the screen, level with the spectrum, where the peak would land
      const p = Pv(onScreen(1.075, BH)), lines = ["peak radiation", "beyond the", "screen →"];
      const w = Math.max(...lines.map(t => mx.measureText(t).width)), x = Math.min(p[0], W - 6 - w);
      mx.fillStyle = col; mx.textAlign = "left"; mx.textBaseline = "middle";
      lines.forEach((t, i) => mx.fillText(t, x, p[1] + (i - 1) * 17));
      mx.restore(); return;
    }
    const tip = Pv(onScreen(u, BH + BAND + 0.6)), tail = Pv(onScreen(u, BH + BAND + 7));
    const dx = tip[0] - tail[0], dy = tip[1] - tail[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, hs = 6;
    mx.strokeStyle = col; mx.fillStyle = col; mx.lineWidth = 1.6; mx.lineCap = "round";
    mx.beginPath(); mx.moveTo(tail[0], tail[1]); mx.lineTo(tip[0] - ux * hs, tip[1] - uy * hs); mx.stroke();
    mx.beginPath(); mx.moveTo(tip[0], tip[1]); mx.lineTo(tip[0] - ux * hs - uy * hs * 0.6, tip[1] - uy * hs + ux * hs * 0.6);
    mx.lineTo(tip[0] - ux * hs + uy * hs * 0.6, tip[1] - uy * hs - ux * hs * 0.6); mx.closePath(); mx.fill();
    mx.fillText("peak radiation", tail[0], tail[1] - 3);
    mx.restore();
  }

  function drawBeam(a3, b3, c, alpha, extras) {
    const a = Pv(a3), b = Pv(b3), w = 2 * WALL.hole * a[3] * 0.9;
    mx.save(); mx.globalCompositeOperation = "lighter"; mx.lineCap = "round";
    if (alpha > 0.01) {
      mx.strokeStyle = css(c, alpha * 0.25); mx.lineWidth = w * 1.8; mx.beginPath(); mx.moveTo(a[0], a[1]); mx.lineTo(b[0], b[1]); mx.stroke();
      mx.strokeStyle = css(c, alpha * 0.8); mx.lineWidth = w * 0.7; mx.beginPath(); mx.moveTo(a[0], a[1]); mx.lineTo(b[0], b[1]); mx.stroke();
    }
    // invisible radiation in the beam, seen through the goggles, as moving dashes. Once the beam carries visible
    // light, the visible beam stands for all of it, so the dashes are left out.
    if (alpha <= 0.01) for (const e of extras) {
      if (!e || e[1] <= 0.05) continue;
      const [col, vv, ph] = e;
      mx.setLineDash([6, 5]); mx.lineDashOffset = -time * 40 + ph; mx.strokeStyle = css(col, 0.7 * vv); mx.lineWidth = w * 0.5;
      mx.beginPath(); mx.moveTo(a[0], a[1]); mx.lineTo(b[0], b[1]); mx.stroke();
    }
    mx.restore();
  }

  // ---- Thermometer taped to the screen in the infrared ----
  const TH_LO = 0, TH_HI = 140;
  function drawThermometer(dt) {
    thT += (thTarget(T) - thT) * (1 - Math.exp(-dt / 1.6));
    const off = 0.5, yb = BH - 0.6, yt = BH + 23, tube = 0.75;
    const at = y => Pv(onScreen(UTH, y, off));
    const b = at(yb), t = at(yt), s = b[3];
    // glass tube
    mx.lineCap = "round";
    mx.strokeStyle = "rgba(225,235,245,0.9)"; mx.lineWidth = tube * 2 * s + 2; mx.beginPath(); mx.moveTo(b[0], b[1]); mx.lineTo(t[0], t[1]); mx.stroke();
    mx.strokeStyle = "#cfd8e2"; mx.lineWidth = tube * 2 * s; mx.beginPath(); mx.moveTo(b[0], b[1]); mx.lineTo(t[0], t[1]); mx.stroke();
    // scale marks
    const yOf = c => yb + 3 + (yt - 1 - yb - 3) * (Math.max(TH_LO, Math.min(TH_HI, c)) - TH_LO) / (TH_HI - TH_LO);
    mx.strokeStyle = "rgba(60,70,85,0.8)"; mx.lineWidth = 1;
    for (let c = 0; c <= TH_HI; c += 10) {
      const p = Pv(onScreen(UTH - 0.008, yOf(c), off + 0.1)), q = Pv(add(onScreen(UTH - 0.008, yOf(c), off + 0.1), SU, c % 50 ? 0.5 : 0.9));
      mx.beginPath(); mx.moveTo(p[0], p[1]); mx.lineTo(q[0], q[1]); mx.stroke();
    }
    // red liquid
    const lq = at(yOf(thT));
    mx.strokeStyle = "#d8262a"; mx.lineWidth = tube * 0.9 * s; mx.beginPath(); mx.moveTo(b[0], b[1]); mx.lineTo(lq[0], lq[1]); mx.stroke();
    mx.beginPath(); mx.arc(b[0], b[1], tube * 1.7 * s, 0, Math.PI * 2); mx.fillStyle = "#d8262a"; mx.fill(); mx.strokeStyle = "rgba(240,245,250,0.9)"; mx.lineWidth = 1.5; mx.stroke();
    // two strips of tape
    [yb + 7, yt - 4].forEach(y => {
      const q = [-1.6, 1.6].flatMap(du => [-0.9, 0.9].map(dy => onScreen(UTH + du / SW_, y + dy + du * 0.15, off + 0.3)));
      face([q[0], q[2], q[3], q[1]], "rgba(228,214,170,0.78)", "rgba(180,165,120,0.6)");
    });
    pill(`${thT.toFixed(1)} °C`, t[0], t[1] - 18, { color: thT > 20.05 ? "#ffb4a6" : "#e8edf3" });
  }

  // ================= The graph =================
  // the plot's bottom edge moves down to use the space when the screen strip is hidden
  const G = { l: 92, r: 1062, t: 62, b: 400, sy0: 440, sy1: 482, lmax: 3500 };
  let showScr = false;
  const gx = nm => G.l + (G.r - G.l) * nm / G.lmax;
  const STEP = 5;
  function curve(Tk) { const pts = []; for (let nm = STEP; nm <= G.lmax; nm += STEP) pts.push([nm, rel(nm, Tk)]); return pts; }
  function niceStep(span, n = 5) { const raw = span / n, m = 10 ** Math.floor(Math.log10(raw)), f = raw / m; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * m; }
  const fmtNum = x => x >= 1000 ? x.toLocaleString("en-GB") : x >= 1 ? +x.toPrecision(4) + "" : +x.toPrecision(2) + "";
  const SUP = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
  const pow10 = e => e === 0 ? "1" : e === 1 ? "10" : "10" + String(e).split("").map(c => SUP[c]).join("");
  let linStrip = null, linKey = "";
  // True scale without comparison curves: the axis stays fixed over a range of temperatures, so you can watch the
  // curve grow and shrink, and only rescales (animated over 0.5 s) when it has to. Heating: when the peak reaches the
  // top, the axis grows so the peak drops to a fifth of the height, ready to grow again. Cooling: when the peak falls
  // below a fifth of the height, the axis shrinks so the peak sits right at the top again.
  // A jump in temperature (a preset button) happens in two steps: first the curve grows or shrinks to its new
  // size on the old scale (it may shoot off the top), then the scale changes to fit it. Dragging the slider moves
  // the curve directly, and the scale changes only when it has to.
  const AX = { from: 0, to: 0, t0: -1, dur: 0.6 }, AX_LOW = 0.2, AX_TOP = 1.03;
  const DT = { cur: null, from: 0, to: 0, t0: -1, dur: 0.6, jumped: false };
  function shownT() {
    if (DT.cur === null) DT.cur = DT.to = T;
    if (T !== DT.to) {
      if (DT.t0 < 0 && Math.abs(Math.log(T / DT.cur)) < 0.03) DT.cur = DT.to = T; // a small slider step
      else { DT.from = DT.cur; DT.to = T; DT.t0 = time; }
    }
    if (DT.t0 >= 0) {
      const f = Math.min(1, (time - DT.t0) / DT.dur), e = f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2;
      DT.cur = DT.from * (DT.to / DT.from) ** e;
      if (f >= 1) { DT.cur = DT.to; DT.t0 = -1; DT.jumped = true; }
    }
    return DT.cur;
  }
  function steppedAxis(curveMax) {
    const top = Math.max(curveMax, 1e-12) * AX_TOP, fit = DT.jumped; DT.jumped = false;
    if (!AX.to) { AX.from = AX.to = top; AX.t0 = -1; }
    else if (top > AX.to * 1.0001) {
      // never further than 2,000 (just above the 10,000 °C peak at about 1,770), and round up to it near the top
      let to = fit ? top : top / AX_LOW;
      if (to > 1500) to = Math.max(2000, top);
      AX.from = axisNow(); AX.to = to; AX.t0 = time;
    }
    else if (top < AX.to * AX_LOW) { AX.from = axisNow(); AX.to = top; AX.t0 = time; }
    return axisNow();
  }
  function axisNow() {
    if (AX.t0 < 0) return AX.to;
    const f = Math.min(1, (time - AX.t0) / AX.dur), e = f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2;
    if (f >= 1) AX.t0 = -1;
    return AX.from * (AX.to / AX.from) ** e; // move smoothly in proportion, so big jumps look even
  }
  function drawGraph() {
    mx.fillStyle = "#ffffff"; mx.fillRect(0, 0, W, H);
    G.b = showScr ? 400 : 476;
    // Every scale compares the rock's curve with coal, candle, lamp and Sun (dashed). On the dynamic scale the axis
    // follows the rock's curve alone, so the comparison curves can run off the top.
    const real = scale === "sun" || scale === "dynamic";
    // The comparison curves are always drawn, even when the rock is at one of those temperatures.
    const refT = PRESETS.map(p => p[0] + K0); // every preset: room, hot plate, coal, candle, lamp, Sun, hot blue star
    const shown = [T, ...refT];
    // the temperature the curve is drawn at: on the dynamic scale it moves to a new temperature over 0.6 s
    const Td = scale === "dynamic" ? shownT() : (DT.cur = null, T);
    let yMax, yMin = 0, Y;
    if (real) {
      const top = t => rel(Math.min(G.lmax, Math.max(STEP, peakNm(t))), t);
      // fitted to the rock and the comparison temperatures up to the Sun, so the Sun's peak stays near the top;
      // the hot blue star's curve runs off the top unless the rock is that hot
      if (scale === "sun") { yMax = Math.max(top(T), ...PRESETS.slice(0, 6).map(p => top(p[0] + K0))) * 1.08; AX.to = 0; }
      else yMax = DT.t0 >= 0 ? axisNow() : steppedAxis(top(Td)); // hold the scale while the curve changes size
      Y = r => G.b - (G.b - G.t) * r / yMax;
    } else if (scale === "log") {
      yMin = LMIN; yMax = LMAX;
      Y = r => G.b - (G.b - G.t) * bright(r);
    } else {
      yMax = 108;
    }
    const peakOf = t => rel(peakNm(t), t);
    const yN = (r, t) => scale === "norm" ? G.b - (G.b - G.t) * (100 * r / peakOf(t)) / yMax : Y(r);

    // regions of the spectrum
    const vis0 = gx(400), vis1 = gx(700);
    const vg = mx.createLinearGradient(vis0, 0, vis1, 0);
    for (let k = 0; k <= 10; k++) vg.addColorStop(k / 10, css(specRGB(400 + 30 * k).map(c => c * 0.5 + 0.5 * 0.9), 0.35));
    mx.fillStyle = vg; mx.fillRect(vis0, G.t, vis1 - vis0, G.b - G.t);
    mx.fillStyle = "rgba(196,90,60,0.05)"; mx.fillRect(vis1, G.t, G.r - vis1, G.b - G.t);
    mx.fillStyle = "rgba(120,80,200,0.06)"; mx.fillRect(G.l, G.t, vis0 - G.l, G.b - G.t);
    mx.font = `800 11px ${FONT}`; mx.textBaseline = "bottom"; mx.textAlign = "center";
    mx.fillStyle = "#6b53b8"; mx.fillText("UV", (G.l + vis0) / 2, G.t - 4);
    mx.fillStyle = "#4c5a6b"; mx.fillText("VISIBLE", (vis0 + vis1) / 2, G.t - 4);
    mx.fillStyle = "#a2452b"; mx.fillText("INFRARED", (vis1 + G.r) / 2, G.t - 4);

    // gridlines and y-axis labels
    mx.font = `600 12px ${FONT}`; mx.textAlign = "right"; mx.textBaseline = "middle"; mx.lineWidth = 1;
    if (scale === "log") {
      for (let e = -5; e <= 3; e++) {
        const y = Y(10 ** e); mx.strokeStyle = e === 0 ? "#c9d0d8" : "#e6e9ed"; mx.beginPath(); mx.moveTo(G.l, y); mx.lineTo(G.r, y); mx.stroke();
        mx.fillStyle = "#59636f"; mx.fillText(pow10(e), G.l - 8, y);
      }
    } else {
      const top = scale === "norm" ? 100 : yMax, st = scale === "norm" ? 20 : niceStep(yMax);
      for (let v = 0; v <= top * 1.0001; v += st) {
        const y = G.b - (G.b - G.t) * v / yMax; mx.strokeStyle = "#e6e9ed"; mx.beginPath(); mx.moveTo(G.l, y); mx.lineTo(G.r, y); mx.stroke();
        mx.fillStyle = "#59636f"; mx.fillText(scale === "norm" ? v + "%" : fmtNum(+v.toPrecision(6)), G.l - 8, y);
      }
    }
    // x-axis
    mx.textAlign = "center"; mx.textBaseline = "top";
    for (let nm = 0; nm <= G.lmax; nm += 500) {
      const x = gx(nm); mx.strokeStyle = "#e6e9ed"; mx.beginPath(); mx.moveTo(x, G.t); mx.lineTo(x, G.b); mx.stroke();
      mx.strokeStyle = "#59636f"; mx.beginPath(); mx.moveTo(x, G.b); mx.lineTo(x, G.b + 5); mx.stroke();
      mx.fillStyle = "#59636f"; mx.fillText((nm / 1000).toFixed(1), x, G.b + 8);
    }
    mx.strokeStyle = "#202020"; mx.lineWidth = 1.5; mx.beginPath(); mx.moveTo(G.l, G.t - 6); mx.lineTo(G.l, G.b); mx.lineTo(G.r + 6, G.b); mx.stroke();
    mx.font = `700 13px ${FONT}`; mx.fillStyle = "#202020"; mx.fillText("wavelength (µm)", (G.l + G.r) / 2, showScr ? G.sy1 + 10 : G.b + 30);
    mx.save(); mx.translate(28, (G.t + G.b) / 2); mx.rotate(-Math.PI / 2); mx.textBaseline = "middle";
    mx.fillText(real ? "intensity (Sun's peak = 100)" : scale === "log" ? "intensity (log scale)" : "intensity (% of its own peak)", 0, 0); mx.restore();


    mx.save(); mx.beginPath(); mx.rect(G.l, G.t - 2, G.r - G.l, G.b - G.t + 2); mx.clip();
    // comparison curves
    refT.forEach(t => {
      const pts = curve(t);
      mx.setLineDash([6, 5]); mx.strokeStyle = "#98a3b0"; mx.lineWidth = 1.6; mx.beginPath();
      pts.forEach(([nm, r], i) => { const y = Math.max(G.t - 40, yN(r, t)); i ? mx.lineTo(gx(nm), y) : mx.moveTo(gx(nm), y); }); mx.stroke(); mx.setLineDash([]);
    });
    // the current curve, filled with the colours it contains; it may rise above the plot while the scale catches up
    mx.restore(); mx.save(); mx.beginPath(); mx.rect(G.l, 32, G.r - G.l, G.b - 32); mx.clip();
    const pts = curve(Td);
    mx.beginPath(); mx.moveTo(gx(STEP), G.b);
    pts.forEach(([nm, r]) => mx.lineTo(gx(nm), Math.max(32, yN(r, Td))));
    mx.lineTo(gx(G.lmax), G.b); mx.closePath();
    const fg = mx.createLinearGradient(G.l, 0, G.r, 0);
    for (let nm = 0; nm <= G.lmax; nm += 25) {
      const c = nm < 380 ? [0.5, 0.35, 0.85] : nm > 740 ? [0.85, 0.35, 0.25] : HUE[nm - 380];
      const a = nm < 380 || nm > 740 ? 0.22 : 0.75;
      fg.addColorStop(nm / G.lmax, css(c, a));
    }
    mx.fillStyle = fg; mx.fill();
    mx.strokeStyle = "#202020"; mx.lineWidth = 2.6; mx.beginPath();
    pts.forEach(([nm, r], i) => { const y = Math.max(32, yN(r, Td)); i ? mx.lineTo(gx(nm), y) : mx.moveTo(gx(nm), y); }); mx.stroke();
    mx.restore();

    // labels for the comparison curves, at their peaks (or where they leave the graph)
    refT.forEach(t => {
      const pk = Math.min(G.lmax, peakNm(t)), y = yN(rel(pk, t), t), name = PRESETS.find(p => Math.abs(p[0] + K0 - t) < 1)[1];
      if (y < G.t - 2 || y > G.b - 12) return;
      const short = { "red-hot coal": "red-hot coal", "a candle flame": "candle", "a lamp filament": "lamp", "the surface of the Sun": "Sun", "a hot blue star": "hot star", "room temperature": "room", "a hot plate": "hot plate" }[name] || name;
      // a curve whose peak is beyond the right-hand edge is labelled where it leaves the graph
      if (peakNm(t) > G.lmax) pill(short, G.r - 4, y - 17, { dark: false, size: 14, color: "#59636f", align: "right" });
      else pill(short, gx(pk), y - 17, { dark: false, size: 14, color: "#59636f" });
    });

    // the peak of the current curve (Wien's law)
    const pk = peakNm(Td);
    if (pk <= G.lmax) {
      const x = gx(pk), y = Math.max(G.t, yN(rel(pk, Td), Td));
      mx.setLineDash([4, 4]); mx.strokeStyle = "#2166d1"; mx.lineWidth = 1.4; mx.beginPath(); mx.moveTo(x, y); mx.lineTo(x, G.b); mx.stroke(); mx.setLineDash([]);
      // the label sits on the dashed line, well below the peak, so the top of the curve stays visible
      const yl = G.b - y > 80 ? y + Math.max(36, 0.4 * (G.b - y)) : y - 18;
      pill(`peak at ${pk < 1000 ? Math.round(pk) + " nm" : (pk / 1000).toFixed(2) + " µm"}`, x, yl, { dark: false, color: "#2166d1" });
    } else {
      pill(`peak at ${(pk / 1000).toFixed(1)} µm, off the graph →`, G.r - 4, G.b - 22, { dark: false, align: "right", color: "#2166d1" });
    }
    if (real && DT.t0 < 0 && rel(Math.min(G.lmax, pk), Td) < 0.03 * yMax)
      pill(`The ${fmtC(T)} curve is too small to see on this scale`, (G.l + G.r) / 2, G.b - 60, { dark: false, color: "#202020" });
    // caption
    const cap = scale === "sun" ? "The Sun scale: real heights, compared with the Sun. Hotter objects give out vastly more."
      : scale === "dynamic" ? "Dynamic scale: real heights. The scale stays put as the curve grows, and changes when it must."
      : scale === "log" ? "Logarithmic scale: each gridline up is 10 times more. The brightness on the screen uses this scale."
      : "Same peak height: every curve is stretched to the same height, to compare their shapes and peaks.";
    mx.font = `600 13px ${FONT}`; mx.fillStyle = "#59636f"; mx.textAlign = "left"; mx.textBaseline = "middle"; mx.fillText(cap, G.l, 22);
    pill(fmtC(T), G.r, 22, { dark: false, align: "right" });

    // the screen, laid out on the same wavelength scale as the graph (if shown)
    if (!showScr) return;
    const key = T.toFixed(1) + gog + ugog;
    if (key !== linKey) {
      linKey = key; const n = Math.round(G.r - G.l);
      linStrip = linStrip || document.createElement("canvas"); linStrip.width = n; linStrip.height = 1;
      const c = linStrip.getContext("2d"), img = c.createImageData(n, 1);
      for (let i = 0; i < n; i++) { const col = screenRGB((i + 0.5) / n * G.lmax, T, gog, ugog); img.data.set([col[0] * 255, col[1] * 255, col[2] * 255, 255], i * 4); }
      c.putImageData(img, 0, 0);
    }
    rr(mx, G.l - 2, G.sy0 - 14, G.r - G.l + 4, G.sy1 - G.sy0 + 16, 6); mx.fillStyle = "#08090b"; mx.fill();
    mx.imageSmoothingEnabled = true; mx.drawImage(linStrip, G.l, G.sy0 - 4, G.r - G.l, G.sy1 - G.sy0);
    mx.font = `700 11px ${FONT}`; mx.fillStyle = "rgba(205,215,228,0.85)"; mx.textAlign = "left"; mx.textBaseline = "middle";
    const gl = [gog && "infrared", ugog && "ultraviolet"].filter(Boolean).join(" and ");
    mx.fillText("The screen, spread out to match the graph" + (gl ? ` (${gl} goggles on)` : ""), G.l + 6, G.sy0 - 8);
  }

  // ================= Text and controls =================
  const fmtC = Tk => { const c = Tk - K0; return `${c < 1000 ? Math.round(c) : (Math.round(c / 10) * 10).toLocaleString("en-GB")} °C`; };
  function nearest() { const c = T - K0; const p = PRESETS.find(([t]) => Math.abs(Math.log((t + K0) / T)) < 0.05); return p ? p[1] : (c < 30 ? "room temperature" : ""); }
  const slider = document.getElementById("tSlider"), tRead = document.getElementById("tRead"), statusText = document.getElementById("statusText");
  function updateText() {
    tRead.innerHTML = `${fmtC(T)}<small>(${Math.round(T).toLocaleString("en-GB")} K)</small>`;
    const ratio = (T / TROOM) ** 4;
    statusText.textContent = ratio < 1.05 ? "Emits the same power as its surroundings"
      : `Emits ${ratio.toLocaleString("en-GB", { maximumSignificantDigits: 2 })}× the power it did at 20 °C`;
    document.querySelectorAll("[data-t]").forEach(b => b.classList.toggle("on", Math.abs(+b.dataset.t + K0 - T) < 1));
  }
  function setT(Tk) { T = Math.max(TMIN, Math.min(TMAX, Tk)); slider.value = tToS(T); updateText(); }
  slider.addEventListener("input", () => { T = sToT(+slider.value); updateText(); });
  document.querySelectorAll("[data-t]").forEach(b => b.addEventListener("click", () => setT(+b.dataset.t + K0)));
  // the slider's track shows the colour of the glow at each temperature
  slider.style.setProperty("--track", `linear-gradient(90deg, ${Array.from({ length: 13 }, (_, k) => { const b = BB[Math.round(k / 12 * (NT - 1))]; const lit = b.rgb.map(c => 0.16 + 0.84 * c * b.v); return css(lit) + ` ${(k / 12 * 100).toFixed(1)}%`; }).join(", ")})`);

  const scrBtn = document.getElementById("scrBtn");
  scrBtn.addEventListener("click", () => { showScr = !showScr; scrBtn.setAttribute("aria-pressed", showScr); document.getElementById("scrTog").classList.toggle("on", showScr); });
  const gogBtn = document.getElementById("gogBtn");
  gogBtn.addEventListener("click", () => { gog = !gog; gogBtn.setAttribute("aria-pressed", gog); document.getElementById("gogTog").classList.toggle("on", gog); });
  const uvBtn = document.getElementById("uvBtn");
  uvBtn.addEventListener("click", () => { ugog = !ugog; uvBtn.setAttribute("aria-pressed", ugog); document.getElementById("uvTog").classList.toggle("on", ugog); });
  document.querySelectorAll("[data-scale]").forEach(b => b.addEventListener("click", () => {
    scale = b.dataset.scale; document.querySelectorAll("[data-scale]").forEach(x => x.classList.toggle("on", x === b));
  }));
  function setView(v) {
    view = v === "graph" ? "graph" : "prism";
    document.querySelectorAll("[data-view]").forEach(b => b.classList.toggle("on", b.dataset.view === view));
    document.querySelectorAll(".graphOnly").forEach(e => { e.hidden = view !== "graph"; });
    main.setAttribute("aria-label", view === "graph"
      ? "The black body curve: intensity against wavelength for the rock's temperature, with the screen's spectrum laid out underneath"
      : "A hot rock glowing behind a wall with a hole. A beam through the hole is split by a prism into a spectrum on a dark screen, with a thermometer taped in the infrared part.");
    main.style.background = view === "graph" ? "#fff" : "#0c1016";
    if (location.hash.slice(1) !== view) history.replaceState(null, "", "#" + view);
  }
  document.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));
  window.addEventListener("hashchange", () => setView(location.hash.slice(1)));
  window.addEventListener("resize", setup);

  const fsBtn = document.getElementById("fsBtn"), card = fsBtn.closest(".card");
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  const canFs = (card.requestFullscreen || card.webkitRequestFullscreen) && (document.fullscreenEnabled || document.webkitFullscreenEnabled);
  if (!canFs) fsBtn.hidden = true;
  fsBtn.addEventListener("click", () => {
    try {
      const r = fsEl() ? (document.exitFullscreen || document.webkitExitFullscreen).call(document)
                       : (card.requestFullscreen || card.webkitRequestFullscreen).call(card);
      if (r && r.catch) r.catch(() => {});
    } catch (e) { /* full screen not allowed here */ }
  });
  const onFs = () => { const on = !!fsEl(); fsBtn.querySelector("span").textContent = on ? "Exit full screen" : "Full screen"; fsBtn.setAttribute("aria-pressed", on); requestAnimationFrame(setup); };
  document.addEventListener("fullscreenchange", onFs); document.addEventListener("webkitfullscreenchange", onFs);

  // ================= Run =================
  let last = 0;
  function loop(ts) {
    const dt = Math.min(0.05, last ? (ts - last) / 1000 : 0.016); last = ts; time += dt;
    updateRays(dt);
    if (view === "graph") { thT += (thTarget(T) - thT) * (1 - Math.exp(-dt / 1.6)); drawGraph(); }
    else drawScene(dt);
    requestAnimationFrame(loop);
  }
  setup();
  setT(900 + K0); thT = thTarget(T);
  setView(location.hash.slice(1));
  for (let i = 0; i < 60; i++) updateRays(1 / 60);
  requestAnimationFrame(loop);
})();
