import "./style.css";

(() => {
  const W = 1100, H = 520, G = 450, PH = 190;
  const DT = 1 / 240, BUF = 4096;
  const F1 = 1, F2 = 2, V = 336;
  const COL = { ink: "#202020", muted: "#59636f", blue: "#2166d1", green: "#2d9b55", current: "#e8281e", bfield: "#c2255c", line: "#d9dee4" };
  const FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
  const TWO_PI = Math.PI * 2;

  const main = document.getElementById("main"), plots = document.getElementById("plots");
  let mx, px;
  const collapsed = [true, true], PHC = 46;
  const plotH = () => collapsed[0] && collapsed[1] ? PHC : PH;
  function setup() {
    const d = Math.min(window.devicePixelRatio || 1, 2);
    main.width = W * d; main.height = H * d; plots.width = W * d; plots.height = plotH() * d;
    mx = main.getContext("2d"); px = plots.getContext("2d");
    mx.setTransform(d, 0, 0, d, 0, 0); px.setTransform(d, 0, 0, d, 0, 0);
  }
  setup();
  window.addEventListener("resize", setup);
  const plotBtn = e => {
    const b = plots.getBoundingClientRect(), x = (e.clientX - b.left) * W / b.width, y = (e.clientY - b.top) * plotH() / b.height;
    const w = (W - 12) / 2;
    for (let s2 = 0; s2 < 2; s2++) { const x0 = s2 * (w + 12); if (x >= x0 && x <= x0 + w && y >= 3 && y <= 43) return s2; }
    return -1;
  };
  plots.addEventListener("click", e => { const s2 = plotBtn(e); if (s2 >= 0) { collapsed[s2] = !collapsed[s2]; setup(); } });
  plots.addEventListener("pointermove", e => { plots.style.cursor = plotBtn(e) >= 0 ? "pointer" : "default"; });

  const HI = new Float32Array(BUF), HS = new Float32Array(BUF);
  let n = 0, phase = 0, freq = F1, lastCycle = 0, cyc = 0, amp = 0;
  let mode = "steady", on = true, slow = false, view = "field-map", flowOff = 0, rxFlow = 0;
  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) slow = true;

  function step() {
    phase += TWO_PI * freq * DT;
    const ci = Math.floor(phase / TWO_PI);
    if (ci !== lastCycle) {
      lastCycle = ci;
      if (mode === "changing") { cyc++; if (cyc >= 3) { cyc = 0; freq = freq === F1 ? F2 : F1; } }
      else { freq = F1; cyc = 0; }
    }
    amp += ((on ? 1 : 0) - amp) * Math.min(1, DT * 5);
    HI[n % BUF] = amp * Math.sin(phase);
    HS[n % BUF] = amp * Math.cos(phase);
    flowOff -= HI[n % BUF] * DT * 180;
    n++;
    rxFlow += RX_AMP * ret(HS, RX_DEL) * DT * 180 * 3;  // received current follows the radiated E (see eAt)
  }
  function ret(buf, delay) {
    const idx = (n - 1) - delay / DT;
    if (idx < 0) return 0;
    const i0 = Math.floor(idx);
    if (n - 1 - i0 >= BUF - 2) return 0;
    const a = buf[i0 % BUF], b = buf[(i0 + 1) % BUF];
    return a + (b - a) * (idx - i0);
  }

  const VIR = ["#440154","#482878","#3e4989","#31688e","#26828e","#1f9e89","#35b779","#6ece58","#b5de2b","#fde725"].map(h => [1,3,5].map(i => parseInt(h.slice(i, i + 2), 16)));
  const LUT = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const u = i / 255 * (VIR.length - 1), k = Math.min(VIR.length - 2, Math.floor(u)), f = u - k;
    for (let c = 0; c < 3; c++) LUT[i * 3 + c] = Math.round(VIR[k][c] + (VIR[k + 1][c] - VIR[k][c]) * f);
  }

  const T = { x: 210, top: 190 };
  const CELL = 5, GW = W / CELL, GH = G / CELL;
  const off = document.createElement("canvas"); off.width = GW; off.height = GH;
  const ox = off.getContext("2d"), img = ox.createImageData(GW, GH);
  const cAmp = new Float32Array(GW * GH), cDel = new Float32Array(GW * GH);
  const ampAt = (x, y) => { const dx = x - T.x, dy = y - G, r = Math.hypot(dx, dy) + 1e-6; return (Math.abs(dx) / r) / (r / 120 + 0.5); };
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const x = i * CELL + CELL / 2, y = j * CELL + CELL / 2, k = j * GW + i;
    cAmp[k] = ampAt(x, y); cDel[k] = Math.hypot(x - T.x, y - G) / V;
  }
  for (let k = 0; k < GW * GH; k++) img.data[k * 4 + 3] = 255;

  const R = { x: 870, y: G - 140 };
  const RX_AMP = ampAt(R.x, R.y), RX_DEL = Math.hypot(R.x - T.x, R.y - G) / V;

  // Smooth field renderer. The signed field is blended between grid points first and only then coloured, one screen
  // pixel at a time. Colouring each grid cell and then enlarging the picture breaks the sharp zero lines into dots.
  const smCv = document.createElement("canvas"); smCv.width = W; smCv.height = G;
  const smCx = smCv.getContext("2d"), smImg = smCx.createImageData(W, G);
  for (let p = 3; p < smImg.data.length; p += 4) smImg.data[p] = 255;
  const LN = 4096;
  function makeLut(aMax, lo, span) {
    const t = new Uint8Array(LN * 3);
    for (let i = 0; i < LN; i++) {
      let u = (Math.log10(i / (LN - 1) * aMax + 0.003) + lo) / span;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const li = (u * 255 | 0) * 3; t[i * 3] = LUT[li]; t[i * 3 + 1] = LUT[li + 1]; t[i * 3 + 2] = LUT[li + 2];
    }
    return { t, s: (LN - 1) / aMax };
  }
  function axisMap(npx, cell, cells) {
    const i0 = new Int32Array(npx), f = new Float32Array(npx);
    for (let x = 0; x < npx; x++) { let g = (x + 0.5) / cell - 0.5; g = g < 0 ? 0 : g > cells - 1.001 ? cells - 1.001 : g; i0[x] = g | 0; f[x] = g - (g | 0); }
    return { i0, f };
  }
  function smoothDraw(vals, gw, lut, X, Y) {
    const d = smImg.data, t = lut.t, s = lut.s;
    let p = 0;
    for (let y = 0; y < G; y++) {
      const r0 = Y.i0[y] * gw, r1 = r0 + gw, fy = Y.f[y];
      for (let x = 0; x < W; x++, p += 4) {
        const i = X.i0[x], fx = X.f[x];
        const a = vals[r0 + i] + (vals[r0 + i + 1] - vals[r0 + i]) * fx, b = vals[r1 + i] + (vals[r1 + i + 1] - vals[r1 + i]) * fx;
        let v = a + (b - a) * fy; if (v < 0) v = -v;
        let k = (v * s) | 0; if (k > LN - 1) k = LN - 1; k *= 3;
        d[p] = t[k]; d[p + 1] = t[k + 1]; d[p + 2] = t[k + 2];
      }
    }
    smCx.putImageData(smImg, 0, 0);
    mx.drawImage(smCv, 0, 0, W, G);
  }

  const fVal = new Float32Array(GW * GH), fLut = makeLut(1, 2.5, 2.5), fX = axisMap(W, CELL, GW), fY = axisMap(G, CELL, GH);
  function drawFieldImage() {
    const last = n - 1;
    for (let k = 0; k < GW * GH; k++) {
      const idx = last - cDel[k] / DT;
      let v = 0;
      if (idx >= 0) { const i0 = idx | 0, fr = idx - i0, a = HS[i0 % BUF], b = HS[(i0 + 1) % BUF]; v = (a + (b - a) * fr) * cAmp[k]; }
      fVal[k] = v;
    }
    smoothDraw(fVal, GW, fLut, fX, fY);
  }

  // Key for the field colours: a small white panel in the top-right corner, with its top edge at y.
  function fieldKey(y) {
    const bw = 130, bh = 9, pw = 250, ph = 44, px1 = W - 24, px0 = px1 - pw, x0 = px0 + 52, x1 = x0 + bw, cy = y + 29;
    rr(mx, px0, y, pw, ph, 10); mx.fillStyle = "rgba(255,255,255,0.94)"; mx.fill(); mx.strokeStyle = "#c6ccd3"; mx.lineWidth = 1; mx.stroke();
    const g = mx.createLinearGradient(x0, 0, x1, 0);
    VIR.forEach((c, i) => g.addColorStop(i / (VIR.length - 1), `rgb(${c.join(",")})`));
    rr(mx, x0, cy - bh / 2, bw, bh, 3); mx.fillStyle = g; mx.fill();
    mx.font = `600 12px ${FONT}`; mx.fillStyle = COL.ink; mx.textBaseline = "middle";
    mx.textAlign = "right"; mx.fillText("zero", x0 - 8, cy);
    mx.textAlign = "left"; mx.fillText("strong", x1 + 8, cy);
    mx.textAlign = "center"; mx.fillText("Field strength", (x0 + x1) / 2, y + 13);
  }
  function rr(c, x, y, w, h, r) { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); }
  function pill(c, text, x, y, align = "center", color = COL.ink) {
    c.font = `700 13px ${FONT}`;
    const w = c.measureText(text).width + 20, h = 24;
    const left = align === "center" ? x - w / 2 : align === "left" ? x : x - w;
    rr(c, left, y - h / 2, w, h, 12);
    c.fillStyle = "rgba(255,255,255,0.94)"; c.fill();
    c.strokeStyle = "#c6ccd3"; c.lineWidth = 1; c.stroke();
    c.fillStyle = color; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(text, left + w / 2, y + 1);
  }
  // A pill label with several centred lines.
  function pill2(c, lines, x, y, color = COL.ink) {
    c.font = `700 13px ${FONT}`;
    const lh = 17, w = Math.max(...lines.map(l => c.measureText(l).width)) + 24, h = lines.length * lh + 10;
    rr(c, x - w / 2, y - h / 2, w, h, 12);
    c.fillStyle = "rgba(255,255,255,0.94)"; c.fill();
    c.strokeStyle = "#c6ccd3"; c.lineWidth = 1; c.stroke();
    c.fillStyle = color; c.textAlign = "center"; c.textBaseline = "middle";
    lines.forEach((l, i) => c.fillText(l, x, y - (lines.length - 1) * lh / 2 + i * lh + 1));
  }
  function seg(c, x1, y1, x2, y2, col, w) { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
  function arrow(c, x1, y1, x2, y2, col, w, head = 11) {
    const L = Math.hypot(x2 - x1, y2 - y1);
    if (L < 3) return;
    const ux = (x2 - x1) / L, uy = (y2 - y1) / L, hh = Math.min(head, L * 0.6);
    seg(c, x1, y1, x2 - ux * hh * 0.6, y2 - uy * hh * 0.6, col, w);
    c.fillStyle = col; c.beginPath();
    c.moveTo(x2, y2);
    c.lineTo(x2 - ux * hh - uy * hh * 0.55, y2 - uy * hh + ux * hh * 0.55);
    c.lineTo(x2 - ux * hh + uy * hh * 0.55, y2 - uy * hh - ux * hh * 0.55);
    c.closePath(); c.fill();
  }
  function electron(c, x, y, tracer) {
    c.fillStyle = tracer ? "#fac775" : "#b5d4f4";
    c.strokeStyle = "rgba(0,0,0,0.35)"; c.lineWidth = 1;
    c.beginPath(); c.arc(x, y, tracer ? 4.5 : 3.6, 0, TWO_PI); c.fill(); c.stroke();
  }

  function drawFieldView() {
    drawFieldImage();
    mx.fillStyle = "#2b3138"; mx.fillRect(0, G, W, H - G);
    mx.fillStyle = "#4b5560"; mx.fillRect(0, G, W, 3);

    const I = HI[(n - 1) % BUF] || 0;
    drawMast(I, T.top, flowOff);
    drawHouse(R.x, G, rxFlow);
    fieldKey(18);
  }

  function drawMast(I, tp, offs, mxp = T.x, bx = 34, bw = 112) {
    const by = G - 78, bh = 56, sw = 60, sx0 = bx + (bw - sw) / 2;
    rr(mx, bx, by, bw, bh, 10); mx.fillStyle = "#ffffff"; mx.fill(); mx.strokeStyle = "#8f969d"; mx.lineWidth = 1.5; mx.stroke();
    mx.strokeStyle = COL.current; mx.lineWidth = 2.5; mx.beginPath();
    for (let i = 0; i <= sw; i++) { const xx = sx0 + i, yy = by + bh / 2 - Math.sin(i / sw * TWO_PI) * 12; i ? mx.lineTo(xx, yy) : mx.moveTo(xx, yy); }
    mx.stroke();
    pill(mx, "AC signal", bx + bw / 2, by - 18);

    const wy = G - 40;
    seg(mx, bx + bw, wy, mxp, wy, "#d3d1c7", 7);

    const hw = 26, col = "#d3d1c7", N = Math.max(4, Math.round((G - tp) / 29));
    seg(mx, mxp - hw, G, mxp, tp, col, 3); seg(mx, mxp + hw, G, mxp, tp, col, 3);
    for (let i = 0; i < N; i++) {
      const y1 = G - (G - tp) * i / N, y2 = G - (G - tp) * (i + 1) / N, w1 = hw * (1 - i / N), w2 = hw * (1 - (i + 1) / N);
      seg(mx, mxp - w1, y1, mxp + w2, y2, col, 1.2); seg(mx, mxp + w1, y1, mxp - w2, y2, col, 1.2); seg(mx, mxp - w2, y2, mxp + w2, y2, col, 1.2);
    }
    mastDetail(mxp, tp, G, hw, col);
    seg(mx, mxp, wy + 3.5, mxp, tp + 6, "#d3d1c7", 7);
    mx.save();
    mx.strokeStyle = COL.current; mx.lineWidth = 4.5; mx.lineCap = "round";
    mx.setLineDash([9, 15]); mx.lineDashOffset = offs;
    mx.beginPath(); mx.moveTo(bx + bw + 4, wy); mx.lineTo(mxp, wy); mx.lineTo(mxp, tp + 10); mx.stroke();
    mx.restore();
    pill(mx, "Transmitting mast", mxp, tp - 30);
  }

  // A little extra mast detail: concrete footing, base insulator, a platform near the top, and red warning lights.
  function mastDetail(mxp, tp, base, hw, col) {
    const ht = base - tp;
    mx.fillStyle = "#8f969d"; mx.beginPath();
    mx.moveTo(mxp - hw - 10, base); mx.lineTo(mxp - hw - 4, base - 7); mx.lineTo(mxp + hw + 4, base - 7); mx.lineTo(mxp + hw + 10, base); mx.closePath(); mx.fill();
    rr(mx, mxp - 7, base - 15, 14, 8, 3); mx.fillStyle = "#f4f1e8"; mx.fill(); mx.strokeStyle = "#8f969d"; mx.lineWidth = 1; mx.stroke();
    const py = tp + ht * 0.16, pw = hw * 0.16 + 9;
    seg(mx, mxp - pw, py, mxp + pw, py, col, 2.5);
    seg(mx, mxp - pw, py, mxp - pw, py - 6, col, 1.2); seg(mx, mxp + pw, py, mxp + pw, py - 6, col, 1.2);
    const light = (lx, ly, r) => { mx.fillStyle = "rgba(226,75,74,0.25)"; mx.beginPath(); mx.arc(lx, ly, r + 3, 0, TWO_PI); mx.fill(); mx.fillStyle = "#e24b4a"; mx.beginPath(); mx.arc(lx, ly, r, 0, TWO_PI); mx.fill(); };
    light(mxp, tp - 5, 4.5);
    const my = tp + ht * 0.55, mw = hw * 0.45 + 3;
    light(mxp - mw - 3, my, 3); light(mxp + mw + 3, my, 3);
  }

  const HOUSE_ROD = 140;
  function drawHouse(x, base, offs) {
    const wallTop = base - 54, peak = base - 88, hx = 38, bot = peak - 14, top = bot - 76;
    mx.fillStyle = "#ece6da"; mx.strokeStyle = "#6b6f75"; mx.lineWidth = 1.5;
    mx.fillRect(x - hx + 4, wallTop, 2 * hx - 8, base - wallTop); mx.strokeRect(x - hx + 4, wallTop, 2 * hx - 8, base - wallTop);
    mx.fillStyle = "#8a4b36"; mx.beginPath(); mx.moveTo(x - hx - 4, wallTop + 1); mx.lineTo(x, peak); mx.lineTo(x + hx + 4, wallTop + 1); mx.closePath(); mx.fill(); mx.stroke();
    mx.fillStyle = "#fac775";
    [[x - 26, wallTop + 11], [x + 11, wallTop + 11]].forEach(([wx, wy2]) => { mx.fillRect(wx, wy2, 15, 13); mx.strokeRect(wx, wy2, 15, 13); });
    mx.fillStyle = "#5a6470"; mx.fillRect(x - 6, base - 24, 13, 24);
    seg(mx, x, peak, x, bot, "#a7afb8", 2.5);
    seg(mx, x - 10, bot, x + 10, bot, "#d3d1c7", 3);
    seg(mx, x, top, x, bot, "#d3d1c7", 7);
    mx.save();
    mx.beginPath(); mx.rect(x - 6, top + 1, 12, bot - top - 2); mx.clip();
    mx.strokeStyle = COL.current; mx.lineWidth = 4.5; mx.lineCap = "round";
    mx.setLineDash([9, 15]); mx.lineDashOffset = offs;
    mx.beginPath(); mx.moveTo(x, bot - 4); mx.lineTo(x, top + 4); mx.stroke();
    mx.restore();
    pill(mx, "Receiving aerial", x, top - 20);
  }

  const rod = { x: 190, top: -12, bot: H + 12, mid: 260 };
  const WX0 = 320, WX1 = 1050, PROBE = 570;
  // A thick wire standing in the wave's path, with one electron in it.
  const WIRE = { x: 985, top: 135, bot: 385, w: 38 };
  // Radiated E points opposite to the change in the aerial current (HI is the current, HS its rate of change),
  // so E is up while the upward current is falling. B then follows from E for a wave travelling right.
  function eAt(x) { return -ret(HS, (x - rod.x) / V); }
  let showWire = true;
  const BDIR = [-0.82, 0.46], PROBE_E = "#0d47a8", PROBE_B = "#99124a";

  function drawWaveView() {
    mx.fillStyle = "#ffffff"; mx.fillRect(0, 0, W, H);
    mx.strokeStyle = COL.line; mx.lineWidth = 1.5; rr(mx, 0.75, 0.75, W - 1.5, H - 1.5, 12); mx.stroke();

    const I = HI[(n - 1) % BUF] || 0, S = HS[(n - 1) % BUF] || 0;
    const q = -S;

    const RYS = [100, rod.mid - 15, 420], RINGS = [34, 62, 90];
    const la = 0.15 + 0.85 * Math.abs(I);
    const ringCol = q => { const a = la * (1 - 0.22 * q), m = v => Math.round(255 - (255 - v) * a); return `rgb(${m(194)},${m(37)},${m(92)})`; };
    const PD = 520, PS = Math.sin(0.4), PC = Math.cos(0.4);
    const proj = (RY, r, th) => { const z = r * Math.sin(th), sc = PD / (PD - z * PC); return [rod.x + r * Math.cos(th) * sc, RY + z * PS * sc]; };
    const ringArc = (RY, r, a0, a1) => {
      mx.beginPath();
      for (let k = 0; k <= 40; k++) {
        const th = a0 + (a1 - a0) * k / 40, z = r * Math.sin(th), sc = PD / (PD - z * PC), px2 = rod.x + r * Math.cos(th) * sc, py2 = RY + z * PS * sc;
        k ? mx.lineTo(px2, py2) : mx.moveTo(px2, py2);
      }
      mx.stroke();
    };
    RYS.forEach(RY => RINGS.forEach((r, q) => { mx.strokeStyle = ringCol(q); mx.lineWidth = 2.5; ringArc(RY, r, Math.PI, TWO_PI); }));

    // Copper, like the wire on the right, so the pale electrons stand out against it.
    rr(mx, rod.x - 8, rod.top, 16, rod.bot - rod.top, 8);
    { const g = mx.createLinearGradient(rod.x - 8, 0, rod.x + 8, 0);
      g.addColorStop(0, "#b8783d"); g.addColorStop(0.45, "#dc9f62"); g.addColorStop(1, "#a0652f");
      mx.fillStyle = g; }
    mx.fill(); mx.strokeStyle = "#7a4c22"; mx.lineWidth = 1.5; mx.stroke();

    { // Electrons in the transmitter, in a single column. They move the opposite way to the current
      // (flowOff falls while the current flows up), so they shuffle down when the current is upwards.
      const sp = 28, shift = ((-flowOff % sp) + sp) % sp;
      mx.save(); rr(mx, rod.x - 8, rod.top, 16, rod.bot - rod.top, 8); mx.clip();
      for (let y = rod.top - sp; y < rod.bot + sp; y += sp) {
        const ey = y + shift;
        mx.beginPath(); mx.arc(rod.x, ey, 5.6, 0, TWO_PI);
        mx.fillStyle = "#c9e3fb"; mx.fill(); mx.strokeStyle = "#1d3f73"; mx.lineWidth = 1.2; mx.stroke();
        seg(mx, rod.x - 2.8, ey, rod.x + 2.8, ey, "#1d3f73", 1.8);
      }
      mx.restore();
    }

    RYS.forEach(RY => RINGS.forEach((r, q) => {
      const col = ringCol(q), fx = rod.x, fy = RY + r * PS * PD / (PD - r * PC);
      mx.strokeStyle = col; mx.lineWidth = 2.5; ringArc(RY, r, 0, Math.PI);
      {
        const d = I >= 0 ? 1 : -1;  // right-hand grip rule: upward current gives anticlockwise rings seen from above
        [0.25 * Math.PI - Math.PI / 9, 1.25 * Math.PI - Math.PI / 9].forEach(t0 => {
          const c = proj(RY, r, t0), p1 = proj(RY, r, t0 + 0.01), p0 = proj(RY, r, t0 - 0.01);
          const hs = Math.sin(t0) > 0 ? 12 : 10.5;
          const tx = p0[0] - p1[0], ty = p0[1] - p1[1], tl = Math.hypot(tx, ty), ux = d * tx / tl, uy = d * ty / tl;
          mx.fillStyle = col; mx.beginPath();
          mx.moveTo(c[0] + ux * hs * 0.6, c[1] + uy * hs * 0.6);
          mx.lineTo(c[0] - ux * hs * 0.4 - uy * hs * 0.5, c[1] - uy * hs * 0.4 + ux * hs * 0.5);
          mx.lineTo(c[0] - ux * hs * 0.4 + uy * hs * 0.5, c[1] - uy * hs * 0.4 - ux * hs * 0.5);
          mx.closePath(); mx.fill();
        });
      }
    }));

    mx.textBaseline = "middle";

    const ACY = 335;
    mx.beginPath(); mx.arc(rod.x, ACY, 25, 0, TWO_PI); mx.fillStyle = "#fff"; mx.fill(); mx.strokeStyle = COL.ink; mx.lineWidth = 2; mx.stroke();
    mx.strokeStyle = COL.ink; mx.lineWidth = 2.2; mx.beginPath();
    for (let i = 0; i <= 30; i++) { const xx = rod.x - 13 + i * 26 / 30, yy = ACY - Math.sin(i / 30 * TWO_PI) * 8; i ? mx.lineTo(xx, yy) : mx.moveTo(xx, yy); }
    mx.stroke();


    // With the wire shown, the wave runs on past it to the edge of the frame; without it, the wave ends at WX1.
    const waveEnd = showWire ? W + 110 : WX1;
    seg(mx, WX0 - 10, rod.mid, showWire ? W - 2 : WX1 + 10, rod.mid, "#a7afb8", 1.5);

    // The wave carries straight on past the wire. E lies in the page, behind the wire. B points out of the page
    // (drawn down-left, towards the viewer) or into it (up-right, away), so each part of B is drawn in front of
    // or behind the wire and the E wave depending on which way it points.
    // Curves are sampled finely, with one sample exactly at PROBE so the bold arrows sit on the curves.
    // The thin arrows are drawn at every third sample.
    const AL = 105, STEP = (PROBE - WX0) / 63, N = Math.floor((waveEnd - WX0) / STEP + 1e-9), eT = [], bT = [], eV = [], isArrow = i => i % 3 === 0;
    // The wave runs on to the edge of the frame; clip it to the inside of the rounded border.
    const inFrame = fn => { mx.save(); rr(mx, 1.5, 1.5, W - 3, H - 3, 11); mx.clip(); fn(); mx.restore(); };
    for (let i = 0; i <= N; i++) {
      const x = WX0 + STEP * i, e = eAt(x);
      eV.push(e); eT.push([x, rod.mid - e * AL]);
      bT.push([x + BDIR[0] * e * AL, rod.mid + BDIR[1] * e * AL]);
    }
    const drawB = front => {
      for (let i = 0; i <= N; i++) if (isArrow(i) && (eV[i] > 0) === front) arrow(mx, eT[i][0], rod.mid, bT[i][0], bT[i][1], "rgba(194,37,92,0.8)", 2, 8);
      mx.strokeStyle = COL.bfield; mx.lineWidth = 2.5; mx.lineCap = "round";
      for (let i = 0; i < N; i++) if ((eV[i] + eV[i + 1] > 0) === front) { mx.beginPath(); mx.moveTo(bT[i][0], bT[i][1]); mx.lineTo(bT[i + 1][0], bT[i + 1][1]); mx.stroke(); }
      mx.lineCap = "butt";
    };
    inFrame(() => {
      drawB(false);
      for (let i = 0; i <= N; i++) if (isArrow(i)) arrow(mx, eT[i][0], rod.mid, eT[i][0], eT[i][1], "rgba(33,102,209,0.85)", 2, 8);
      mx.strokeStyle = COL.blue; mx.lineWidth = 2.5; mx.beginPath();
      eT.forEach((p, i) => i ? mx.lineTo(p[0], p[1]) : mx.moveTo(p[0], p[1])); mx.stroke();
    });

    pill(mx, "E and B always at right angles", PROBE, rod.mid + 150);

    if (showWire) { // The electron is pushed the opposite way to E (it has negative charge), so it oscillates up and down in the wire.
      const d = (WIRE.x - rod.x) / V, ew = eAt(WIRE.x), cx = WIRE.x;
      // A cylinder: shaded body with a curved bottom edge, and a flat elliptical cap on top showing the cut end.
      const hw = WIRE.w / 2, cy = 7;
      mx.beginPath();
      mx.moveTo(cx - hw, WIRE.top); mx.lineTo(cx - hw, WIRE.bot);
      mx.ellipse(cx, WIRE.bot, hw, cy, 0, Math.PI, 0, true);
      mx.lineTo(cx + hw, WIRE.top);
      mx.ellipse(cx, WIRE.top, hw, cy, 0, 0, Math.PI, true);
      mx.closePath();
      const g = mx.createLinearGradient(cx - hw, 0, cx + hw, 0);
      g.addColorStop(0, "#c98a4b"); g.addColorStop(0.45, "#f0c08a"); g.addColorStop(1, "#b0733a");
      mx.fillStyle = g; mx.fill(); mx.strokeStyle = "#8a5a2b"; mx.lineWidth = 1.5; mx.stroke();
      mx.beginPath(); mx.ellipse(cx, WIRE.top, hw, cy, 0, 0, TWO_PI);
      const gc = mx.createLinearGradient(cx - hw, 0, cx + hw, 0);
      gc.addColorStop(0, "#e2a868"); gc.addColorStop(0.5, "#f3cc9c"); gc.addColorStop(1, "#d79a5b");
      mx.fillStyle = gc; mx.fill(); mx.stroke();
      const ey2 = rod.mid - 42 * (F1 / freq) * ret(HI, d);
      if (Math.abs(ew) > 0.05) arrow(mx, cx, ey2 + Math.sign(ew) * 13, cx, ey2 + Math.sign(ew) * (13 + 42 * Math.abs(ew)), "#1d3f73", 3, 10);
      mx.beginPath(); mx.arc(cx, ey2, 11, 0, TWO_PI); mx.fillStyle = "#b5d4f4"; mx.fill(); mx.strokeStyle = "#1d3f73"; mx.lineWidth = 1.5; mx.stroke();
      seg(mx, cx - 5, ey2, cx + 5, ey2, "#1d3f73", 2.2);
      pill(mx, "Electron in a wire", cx, WIRE.top - 32);
      mx.font = `600 12px ${FONT}`; mx.fillStyle = "#1d3f73"; mx.textAlign = "center"; mx.textBaseline = "middle";
      mx.fillText("force on the electron", cx, WIRE.bot + 18);
    }
    if (!showWire) inFrame(() => drawB(true));
    else inFrame(() => {
      // Away from the wire, out-of-page B is simply drawn on top.
      const xc = WIRE.x, r = WIRE.w / 2;
      mx.save(); mx.beginPath(); mx.rect(0, 0, W, H); mx.rect(xc - r, 0, 2 * r, H); mx.clip("evenodd");
      drawB(true);
      mx.restore();
      // Over the wire, which is a cylinder: only the part of each B vector that sticks out beyond the wire's
      // front surface (its semicircular cross-section) can be seen.
      const k = Math.hypot(BDIR[0], BDIR[1]);
      const surf = sx => { const d = sx - xc; return Math.abs(d) >= r ? 0 : Math.sqrt(r * r - d * d); };
      mx.save(); mx.beginPath(); mx.rect(xc - r, 0, 2 * r, H); mx.clip();
      for (let i = 0; i <= N; i++) {
        if (!isArrow(i) || eV[i] <= 0) continue;
        // Walk along the vector and draw only the stretches that are further out of the page than the wire's surface.
        const bx0 = eT[i][0], by0 = rod.mid, tx = bT[i][0], ty = bT[i][1], L = eV[i] * AL * k, len = Math.hypot(tx - bx0, ty - by0);
        const at = t => [bx0 + (tx - bx0) * t, by0 + (ty - by0) * t], vis = t => t * L > surf(bx0 + (tx - bx0) * t);
        mx.strokeStyle = "rgba(194,37,92,0.8)"; mx.lineWidth = 2; mx.beginPath();
        let prev = vis(0);
        for (let q = 1; q <= 80; q++) {
          const t0 = (q - 1) / 80, t1 = q / 80, v = vis(t1);
          if (prev && v) { const a = at(t0), b = at(t1); mx.moveTo(a[0], a[1]); mx.lineTo(b[0], b[1]); }
          prev = v;
        }
        mx.stroke();
        if (vis(1) && len > 4) { const a = at(Math.max(0, 1 - 12 / len)); arrow(mx, a[0], a[1], tx, ty, "rgba(194,37,92,0.8)", 2, 8); }
      }
      mx.strokeStyle = COL.bfield; mx.lineWidth = 2.5; mx.lineCap = "round";
      for (let i = 0; i < N; i++) {
        const em = (eV[i] + eV[i + 1]) / 2; if (em <= 0) continue;
        const mxp = (bT[i][0] + bT[i + 1][0]) / 2;
        if (em * AL * k > surf(mxp)) { mx.beginPath(); mx.moveTo(bT[i][0], bT[i][1]); mx.lineTo(bT[i + 1][0], bT[i + 1][1]); mx.stroke(); }
      }
      mx.lineCap = "butt"; mx.restore();
    });
    // The bold E and B arrows at one point, drawn last and in darker shades so they stand out.
    const pe = eAt(PROBE);
    if (Math.abs(pe) > 0.05) {
      const ep = [PROBE, rod.mid - pe * AL], bp = [PROBE + BDIR[0] * pe * AL, rod.mid + BDIR[1] * pe * AL];
      // Rounded shaft ends so the two arrows meet cleanly at their shared starting point.
      mx.lineCap = "round";
      arrow(mx, PROBE, rod.mid, bp[0], bp[1], PROBE_B, 5, 16);
      arrow(mx, PROBE, rod.mid, ep[0], ep[1], PROBE_E, 5, 16);
      mx.lineCap = "butt";
      const se = Math.sign(pe), m = 13, bl = Math.hypot(BDIR[0], BDIR[1]);
      const u1 = [0, -se], u2 = [BDIR[0] / bl * se, BDIR[1] / bl * se];
      mx.strokeStyle = COL.ink; mx.lineWidth = 1.5; mx.beginPath();
      mx.moveTo(PROBE + u1[0] * m, rod.mid + u1[1] * m);
      mx.lineTo(PROBE + (u1[0] + u2[0]) * m, rod.mid + (u1[1] + u2[1]) * m);
      mx.lineTo(PROBE + u2[0] * m, rod.mid + u2[1] * m); mx.stroke();
      mx.font = `italic 700 20px "Times New Roman", Times, Georgia, serif`;
      mx.fillStyle = PROBE_E; mx.textAlign = "left"; mx.fillText("E", ep[0] + 10, ep[1] + (se > 0 ? 6 : -4));
      mx.fillStyle = PROBE_B; mx.textAlign = "right"; mx.fillText("B", bp[0] - 8, bp[1] + (se > 0 ? 10 : -6));
    }

    pill(mx, "E: up and down, in the page", PROBE, 40, "center", COL.blue);
    pill(mx, "B: into and out of the page", PROBE, 72, "center", COL.bfield);
    { // "travels away" label and arrow, centred across the frame
      mx.font = `700 13px ${FONT}`; mx.fillStyle = COL.muted; mx.textAlign = "left"; mx.textBaseline = "middle";
      const txt = "travels away at the speed of light", tw = mx.measureText(txt).width, aw = 150, gap = 12, x0 = W / 2 - (tw + gap + aw) / 2;
      mx.fillText(txt, x0, H - 40);
      arrow(mx, x0 + tw + gap, H - 40, x0 + tw + gap + aw, H - 40, COL.ink, 3, 13);
    }
    pill(mx, "Transmitter with AC signal", rod.x + 24, 30, "left");
  }

  const HV = 100, HDT = 1 / 100, HBUF = 1600;
  const HILL = { x: 560, h: 260, s: 70 }, HMAST = 110, HMX = 120, SRC = { x: HMX, y: G };
  const WAVES = { long: { lam: 480, win: 10, name: "Long wave" }, short: { lam: 40, win: 2, name: "Shorter wave" } };
  const HREF = 690;
  let hillOn = true, wave = "long", hReady = false, hn = 0, hphase = 0, hamp = 1, hflow = 0, hrflow = 0;
  const hTI = new Float32Array(HBUF), hTR = new Float32Array(HBUF), hENV = new Float32Array(HBUF);
  const Rh = { x: 960 };
  const hTop = x => G - (hillOn ? HILL.h * Math.exp(-Math.pow((x - HILL.x) / HILL.s, 2)) : 0);

  const FV0 = -12, FV1 = 12, FDV = 0.01, FN = Math.round((FV1 - FV0) / FDV) + 1;
  const FRe = new Float32Array(FN), FIm = new Float32Array(FN);
  {
    const M = Math.round(FV1 / FDV), Cs = new Float64Array(M + 1), Ss = new Float64Array(M + 1), sub = 20, h = FDV / sub;
    let c = 0, sn = 0, t = 0;
    const fc = q => Math.cos(Math.PI * q * q / 2), fs = q => Math.sin(Math.PI * q * q / 2);
    for (let m = 1; m <= M; m++) {
      for (let q = 0; q < sub; q++) { c += h / 6 * (fc(t) + 4 * fc(t + h / 2) + fc(t + h)); sn += h / 6 * (fs(t) + 4 * fs(t + h / 2) + fs(t + h)); t += h; }
      Cs[m] = c; Ss[m] = sn;
    }
    for (let n2 = 0; n2 < FN; n2++) {
      const v = FV0 + n2 * FDV, m = Math.round(Math.abs(v) / FDV), sg = v < 0 ? -1 : 1;
      const A = 0.5 - sg * Cs[m], B = 0.5 - sg * Ss[m];
      FRe[n2] = (A + B) / 2; FIm[n2] = (A - B) / 2;
    }
  }
  function fresnel(v) {
    if (v <= FV0) return [1, 0];
    if (v >= FV1) { const a = 1 / (Math.PI * v * Math.SQRT2), p = -Math.PI * v * v / 2 - Math.PI / 4 - Math.PI / 4; return [a * Math.cos(p), a * Math.sin(p)]; }
    const n2 = Math.round((v - FV0) / FDV);
    return [FRe[n2], FIm[n2]];
  }
  const wrap = a => { a %= TWO_PI; return a < 0 ? a + TWO_PI : a; };
  function fieldAt(x, y) {
    const lam = WAVES[wave].lam, k = TWO_PI / lam;
    const r = Math.max(20, Math.hypot(x - SRC.x, y - SRC.y)), z = k * r, A = Math.sqrt(HREF / r);
    const dre = A * Math.cos(-z) - (A / (8 * z)) * Math.sin(-z), dim = A * Math.sin(-z) + (A / (8 * z)) * Math.cos(-z);
    const pat = (px, py) => Math.abs(px - SRC.x) / (Math.hypot(px - SRC.x, py - SRC.y) + 1e-6);
    if (!hillOn) return { r, amp: Math.hypot(dre, dim) * pat(x, y), ph: Math.atan2(dim, dre) };
    const Ex = HILL.x, Ey = G - HILL.h;
    const rho = Math.hypot(x - Ex, y - Ey) + 1e-6, rSE = Math.hypot(SRC.x - Ex, SRC.y - Ey);
    const phi = wrap(Math.atan2(-(y - Ey), x - Ex) + Math.PI / 2), phs = wrap(Math.atan2(-(SRC.y - Ey), SRC.x - Ex) + Math.PI / 2);
    const rhoEff = rho * rSE / (rSE + rho);
    const v = -Math.sqrt(8 * rhoEff / lam) * Math.cos((phi - phs) / 2);
    const [fr, fi] = fresnel(v);
    const ure = dre * fr - dim * fi, uim = dre * fi + dim * fr;
    const pf = v < 0 ? pat(x, y) : pat(Ex, Ey);
    return { r: v < 0 ? r : rSE + rho, amp: Math.hypot(ure, uim) * pf, ph: Math.atan2(uim, ure) };
  }
  const HCELL = 4, HGW = W / HCELL, HGH = Math.ceil(G / HCELL);
  const hR = new Float32Array(HGW * HGH), hA = new Float32Array(HGW * HGH), hP = new Float32Array(HGW * HGH);
  let hRec = null;
  function hReset() {
    for (let j = 0; j < HGH; j++) for (let i = 0; i < HGW; i++) {
      const k = j * HGW + i, x = i * HCELL + HCELL / 2, y = j * HCELL + HCELL / 2;
      if (y >= hTop(x) + 2 * HCELL) { hR[k] = 0; hA[k] = 0; hP[k] = 0; continue; }
      const f = fieldAt(x, y); hR[k] = f.r; hA[k] = f.amp; hP[k] = f.ph;
    }
    hRec = fieldAt(Rh.x, hTop(Rh.x) - HOUSE_ROD);
    hENV.fill(on ? 1 : 0); hTI.fill(0); hTR.fill(0); hamp = on ? 1 : 0; hn = HBUF;
    hReady = true;
  }
  const hAt = (buf, back) => { const idx = hn - 1 - Math.round(back / HDT); return idx < 0 || hn - 1 - idx >= HBUF ? buf[0] * 0 : buf[((idx % HBUF) + HBUF) % HBUF]; };
  // Same lookup, but blended between neighbouring samples, so the graphs are smooth curves rather than steps.
  const hAtL = (buf, back) => {
    const idx = hn - 1 - back / HDT, i0 = Math.floor(idx), f = idx - i0;
    if (i0 < 0 || hn - 1 - i0 >= HBUF - 1) return 0;
    const a = buf[i0 % HBUF], b = buf[(i0 + 1) % HBUF];
    return a + (b - a) * f;
  };
  const hVal = new Float32Array(HGW * HGH), hLut = makeLut(2.5, 1.2, 1.6), hX = axisMap(W, HCELL, HGW), hY = axisMap(G, HCELL, HGH);
  function hStep() {
    hphase += TWO_PI * (HV / WAVES[wave].lam) * HDT;
    hamp += ((on ? 1 : 0) - hamp) * Math.min(1, HDT * 5);
    const s = hamp * Math.sin(hphase);
    hENV[hn % HBUF] = hamp;
    hTI[hn % HBUF] = s;
    hn++;
    hTR[(hn - 1) % HBUF] = hAt(hENV, hRec.r / HV) * hRec.amp * Math.sin(hphase + hRec.ph);
    const lw = wave === "long", fs = lw ? 0.5 : 1;
    hflow -= s * HDT * 180 * fs;
    hrflow -= hTR[(hn - 1) % HBUF] * HDT * 180 * fs * (hillOn && lw ? 3 : 1);
  }
  function hSignal() {
    const per = WAVES[wave].lam / HV; let m = 0;
    for (let b = 0; b <= per; b += HDT) m = Math.max(m, Math.abs(hAt(hTR, b)));
    return m;
  }

  function drawHillView() {
    for (let k = 0; k < HGW * HGH; k++) hVal[k] = hA[k] > 0 ? hAtL(hENV, hR[k] / HV) * hA[k] * Math.sin(hphase + hP[k]) : 0;
    smoothDraw(hVal, HGW, hLut, hX, hY);
    mx.fillStyle = "#2b3138"; mx.beginPath(); mx.moveTo(0, H);
    for (let x = 0; x <= W; x += 5) mx.lineTo(x, hTop(x));
    mx.lineTo(W, H); mx.closePath(); mx.fill();
    mx.strokeStyle = "#4b5560"; mx.lineWidth = 3; mx.beginPath();
    for (let x = 0; x <= W; x += 5) x ? mx.lineTo(x, hTop(x)) : mx.moveTo(x, hTop(x));
    mx.stroke();
    drawMast(hTI[(hn - 1 + HBUF) % HBUF] || 0, G - HMAST, hflow, HMX, 6, 84);
    drawHouse(Rh.x, hTop(Rh.x), hrflow);
    pill(mx, WAVES[wave].name + " · not to scale · slowed down", W - 24, 30, "right");
    fieldKey(52);
  }

  const EDT = 1 / 240, EBUF = 2400, EFC = 5, EV = 150, EDEV = 2;
  const fcNow = () => enc === "fm" ? EFC * 1.5 : EFC;
  const EM = { x: 520, base: 470, top: 250 }, ER = { x: 1000, top: 250, bot: 410 }, EAX = 330, EX0 = 560, EX1 = 940, EXW = W - 16;
  const eM = new Float32Array(EBUF), eS = new Float32Array(EBUF), eA = new Float32Array(EBUF), eC = new Float32Array(EBUF), eD = new Float32Array(EBUF);
  const DP = Math.round(1 / (EFC * EDT));
  const DEC = { bi: new Float32Array(DP), bq: new Float32Array(DP), bo: new Float32Array(DP), si: 0, sq: 0, so: 0, k: 0, lo: 0, dc: 1 / 1.6, ph: null, out: 0 };
  const decReset = () => { DEC.bi.fill(0); DEC.bq.fill(0); DEC.bo.fill(0); DEC.so = 0; DEC.si = 0; DEC.sq = 0; DEC.k = 0; DEC.dc = 1 / 1.6; DEC.ph = null; DEC.out = 0; };
  let enc = "am", en = 0, et = 0, ephase = 0, eamp = 1, eflow = 0, erflow = 0, eacc = 0;
  const sound = t => 0.6 * Math.sin(TWO_PI * 0.5 * t) + 0.4 * Math.sin(TWO_PI * 0.9 * t + 1);
  const encAt = (buf, back) => { const idx = en - 1 - back / EDT; if (idx < 0) return 0; const i0 = Math.floor(idx), f = idx - i0; if (en - 1 - i0 >= EBUF - 2) return 0; const a = buf[i0 % EBUF], b = buf[(i0 + 1) % EBUF]; return a + (b - a) * f; };
  function eStep() {
    et += EDT;
    eamp += ((on ? 1 : 0) - eamp) * Math.min(1, EDT * 5);
    const snd = sound(et);
    let m;
    if (enc === "am") { ephase += TWO_PI * EFC * EDT; m = eamp * (1 + 0.6 * snd) * Math.sin(ephase) / 1.6; }
    else { ephase += TWO_PI * (fcNow() + EDEV * snd) * EDT; m = eamp * Math.sin(ephase); }
    const k = en % EBUF;
    eM[k] = m; eS[k] = snd; eA[k] = eamp; eC[k] = Math.sin(TWO_PI * fcNow() * et);
    en++;
    const rv = encAt(eM, (ER.x - EM.x) / EV);
    DEC.lo += TWO_PI * fcNow() * EDT;
    const pi = rv * Math.cos(DEC.lo), pq = rv * Math.sin(DEC.lo), kk = DEC.k % DP;
    DEC.si += pi - DEC.bi[kk]; DEC.sq += pq - DEC.bq[kk]; DEC.bi[kk] = pi; DEC.bq[kk] = pq; DEC.k++;
    const I = DEC.si / DP, Q = DEC.sq / DP, Aenv = 2 * Math.hypot(I, Q);
    let target;
    if (enc === "am") {
      DEC.dc += (Aenv - DEC.dc) * EDT / 2.5;
      target = (Aenv - DEC.dc) * 1.6 / 0.6;
    } else {
      const ph = Math.atan2(Q, I);
      let dph = DEC.ph === null ? 0 : ph - DEC.ph;
      if (dph > Math.PI) dph -= TWO_PI; else if (dph < -Math.PI) dph += TWO_PI;
      DEC.ph = ph;
      const raw = Aenv > 0.1 ? (-dph / (TWO_PI * EDT)) / EDEV : 0;
      DEC.so += raw - DEC.bo[kk]; DEC.bo[kk] = raw;
      target = DEC.so / DP;
    }
    DEC.out += (target - DEC.out) * Math.min(1, EDT / 0.02);
    const out = DEC.out;
    eD[(en - 1) % EBUF] = out;
    eflow -= m * EDT * 300;
    erflow -= encAt(eM, (ER.x - EM.x) / EV) * EDT * 300;
  }
  function dashPath(pts, offs, col) {
    mx.save(); mx.strokeStyle = col; mx.lineWidth = 4.5; mx.lineCap = "round"; mx.lineJoin = "round";
    mx.setLineDash([9, 15]); mx.lineDashOffset = offs;
    mx.beginPath(); pts.forEach((q, i) => i ? mx.lineTo(q[0], q[1]) : mx.moveTo(q[0], q[1])); mx.stroke(); mx.restore();
  }
  function tLabel(c, x, y) {
    c.font = `italic 700 17px "Times New Roman", Times, Georgia, serif`; c.fillStyle = COL.muted; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText("t", x, y);
  }
  function miniTrace(x, y, w, h, title, col, buf, scale) {
    rr(mx, x, y, w, h, 10); mx.fillStyle = "#fafbfc"; mx.fill(); mx.strokeStyle = "#d9dee4"; mx.lineWidth = 1.5; mx.stroke();
    mx.font = `600 14px ${FONT}`; mx.fillStyle = COL.ink; mx.textAlign = "left"; mx.textBaseline = "alphabetic";
    mx.fillText(title, x + 14, y + 22);
    const L = x + 14, Rr = x + w - 14, M = y + h / 2 + 10, A = h / 2 - 22;
    mx.setLineDash([4, 4]); seg(mx, L, M, Rr, M, "#a7afb8", 1); mx.setLineDash([]);
    mx.strokeStyle = col; mx.lineWidth = 1.8; mx.lineJoin = "round"; mx.beginPath();
    const K = 600;
    for (let k = 0; k <= K; k++) { const v = encAt(buf, 3 * (1 - k / K)) * scale, xx = L + (Rr - L) * k / K, yy = M - v * A; k ? mx.lineTo(xx, yy) : mx.moveTo(xx, yy); }
    mx.stroke();
    tLabel(mx, x + w - 9, M + 13);
  }
  function drawEncView() {
    mx.fillStyle = "#ffffff"; mx.fillRect(0, 0, W, H);
    mx.strokeStyle = COL.line; mx.lineWidth = 1.5; rr(mx, 0.75, 0.75, W - 1.5, H - 1.5, 12); mx.stroke();

    miniTrace(24, 20, 240, 104, "Sound signal", COL.green, eS, 1);
    miniTrace(284, 20, 240, 104, "Carrier wave", COL.muted, eC, 1);
    arrow(mx, 144, 126, 238, 168, COL.ink, 2, 10);
    arrow(mx, 404, 126, 312, 168, COL.ink, 2, 10);
    rr(mx, 180, 170, 190, 64, 10); mx.fillStyle = "#ffffff"; mx.fill(); mx.strokeStyle = COL.ink; mx.lineWidth = 2; mx.stroke();
    mx.textAlign = "center"; mx.textBaseline = "middle";
    mx.font = `600 13px ${FONT}`; mx.fillStyle = COL.muted; mx.fillText("Modulator", 275, 188);
    mx.font = `800 22px ${FONT}`; mx.fillStyle = COL.current; mx.fillText(enc === "am" ? "AM" : "FM", 275, 214);

    seg(mx, 0, EM.base, W, EM.base, "#c6ccd3", 2);
    const wire = [[370, 202], [440, 202], [440, EM.base - 18], [EM.x, EM.base - 18], [EM.x, EM.top + 10]];
    mx.strokeStyle = "#d5d9de"; mx.lineWidth = 7; mx.lineJoin = "round"; mx.beginPath(); wire.forEach((q, i) => i ? mx.lineTo(q[0], q[1]) : mx.moveTo(q[0], q[1])); mx.stroke();
    const hw = 24, col = "#8f969d", NL = 7;
    seg(mx, EM.x - hw, EM.base, EM.x, EM.top, col, 2.5); seg(mx, EM.x + hw, EM.base, EM.x, EM.top, col, 2.5);
    for (let i = 0; i < NL; i++) {
      const y1 = EM.base - (EM.base - EM.top) * i / NL, y2 = EM.base - (EM.base - EM.top) * (i + 1) / NL, w1 = hw * (1 - i / NL), w2 = hw * (1 - (i + 1) / NL);
      seg(mx, EM.x - w1, y1, EM.x + w2, y2, col, 1); seg(mx, EM.x + w1, y1, EM.x - w2, y2, col, 1);
    }
    mastDetail(EM.x, EM.top, EM.base, hw, col);
    dashPath(wire, eflow, COL.current);
    pill(mx, "Transmitting mast", EM.x, EM.top - 24);

    mx.setLineDash([5, 5]); seg(mx, EX0, EAX, EXW, EAX, "#a7afb8", 1.2); mx.setLineDash([]);
    const N = 260, AMP = 70, pts = [];
    for (let i = 0; i <= N; i++) { const x = EX0 + (EXW - EX0) * i / N; pts.push([x, EAX - encAt(eM, (x - EM.x) / EV) * AMP]); }
    mx.strokeStyle = "rgba(33,102,209,0.28)"; mx.lineWidth = 1.5;
    for (let i = 0; i <= N; i += 3) { mx.beginPath(); mx.moveTo(pts[i][0], EAX); mx.lineTo(pts[i][0], pts[i][1]); mx.stroke(); }
    mx.strokeStyle = COL.blue; mx.lineWidth = 2.5; mx.beginPath(); pts.forEach((q, i) => i ? mx.lineTo(q[0], q[1]) : mx.moveTo(q[0], q[1])); mx.stroke();
    pill2(mx, [enc === "am" ? "Radio wave: amplitude is adjusted" : "Radio wave: frequency is adjusted", "to encode the sound wave"], (EX0 + EX1) / 2, EAX - 150);
    const tcx = (EX0 + EX1) / 2;
    mx.font = `700 13px ${FONT}`; mx.fillStyle = COL.muted; mx.textAlign = "right"; mx.textBaseline = "middle";
    mx.fillText("travels at the speed of light", tcx + 50, EAX - 188);
    arrow(mx, tcx + 62, EAX - 188, tcx + 180, EAX - 188, COL.ink, 2.5, 12);

    const dec = { x: 820, y: 414, w: 130, h: 44 }, wy2 = dec.y + dec.h / 2;
    const rwire = [[ER.x, ER.top + 6], [ER.x, wy2], [dec.x + dec.w, wy2]];
    mx.strokeStyle = "#d5d9de"; mx.lineWidth = 7; mx.lineJoin = "round"; mx.beginPath();
    mx.moveTo(ER.x, ER.top); mx.lineTo(ER.x, wy2); mx.lineTo(dec.x + dec.w, wy2); mx.stroke();
    dashPath(rwire, erflow, COL.current);
    rr(mx, dec.x, dec.y, dec.w, dec.h, 10); mx.fillStyle = "#ffffff"; mx.fill(); mx.strokeStyle = COL.ink; mx.lineWidth = 2; mx.stroke();
    mx.font = `600 14px ${FONT}`; mx.fillStyle = COL.ink; mx.textAlign = "center"; mx.textBaseline = "middle"; mx.fillText("Decoder", dec.x + dec.w / 2, dec.y + dec.h / 2);
    pill(mx, "Receiving aerial", ER.x, ER.top - 24);
    pill(mx, "Slowed down thousands of times", 24, H - 24, "left", COL.muted);
  }

  // ---- Sending data: SOS sent by switching the carrier on and off, with fixed noise and a real decoder ----
  // The display is a sweep: each send draws left to right across the whole message, then holds still.
  const DDT = 1 / 240, DBUF = 6000, DNOISE = 0.45;
  const DFREQ = { low: 2, medium: 7.5, high: 18 }, DSPEED = { normal: 0.2, slow: 0.5 };
  const MORSE = { ".-": "A", "-...": "B", "-.-.": "C", "-..": "D", ".": "E", "..-.": "F", "--.": "G", "....": "H", "..": "I", ".---": "J", "-.-": "K", ".-..": "L", "--": "M", "-.": "N", "---": "O", ".--.": "P", "--.-": "Q", ".-.": "R", "...": "S", "-": "T", "..-": "U", "...-": "V", ".--": "W", "-..-": "X", "-.--": "Y", "--..": "Z" };
  // SOS in Morse units: dot = 1, dash = 3, gap inside a letter = 1, gap between letters = 3.
  const SOS_ON = [[0, 1], [2, 3], [4, 5], [8, 11], [12, 15], [16, 19], [22, 23], [24, 25], [26, 27]], SOS_LEAD = 0.3;
  const dKey = new Float32Array(DBUF), dTX = new Float32Array(DBUF), dRX = new Float32Array(DBUF), dEN = new Float32Array(DBUF), dPI = new Float32Array(DBUF), dPQ = new Float32Array(DBUF);
  let dFreq = "high", dSpeed = "normal", dn = 0, dt = 0, dph = 0, dSI = 0, dSQ = 0, dHas = false, dT = 1, dacc = 0, dLetters = [];
  const dU = () => DSPEED[dSpeed];
  const sosOn = t => SOS_ON.some(([a, b]) => t >= a * dU() && t < b * dU());
  const dWinN = () => Math.round(2 / DFREQ[dFreq] / DDT);
  let gSpare = null;
  const gauss = () => {
    if (gSpare !== null) { const g = gSpare; gSpare = null; return g; }
    let u = 0, v = 0; while (u === 0) u = Math.random(); v = Math.random();
    const r = Math.sqrt(-2 * Math.log(u)); gSpare = r * Math.sin(TWO_PI * v); return r * Math.cos(TWO_PI * v);
  };
  function dStep() {
    dt += DDT;
    const fq = DFREQ[dFreq], key = sosOn(dt - SOS_LEAD) ? 1 : 0;
    dph += TWO_PI * fq * DDT;
    const tx = key * Math.sin(dph), rx = tx + DNOISE * gauss(), k = dn % DBUF;
    dKey[k] = key; dTX[k] = tx; dRX[k] = rx;
    // The decoder mixes the received signal with its own copy of the carrier and averages over two cycles.
    const pi = rx * Math.cos(dph), pq = rx * Math.sin(dph), Nw = dWinN();
    dPI[k] = pi; dPQ[k] = pq; dSI += pi; dSQ += pq;
    if (dn >= Nw) { const j = (dn - Nw) % DBUF; dSI -= dPI[j]; dSQ -= dPQ[j]; }
    dEN[k] = 2 * Math.hypot(dSI, dSQ) / Math.min(Nw, dn + 1);
    dn++;
  }
  function dReset() {
    [dKey, dTX, dRX, dEN, dPI, dPQ].forEach(b => b.fill(0));
    dn = 0; dt = 0; dph = 0; dSI = 0; dSQ = 0; dLetters = []; dacc = 0;
  }
  // Send SOS: clear the screen and start a new sweep long enough for the whole message.
  function dSend() { dReset(); dHas = true; dT = SOS_LEAD + 27 * dU() + 0.8 + 0.5 * dWinN() * DDT; }
  function dIdle() { dReset(); dHas = false; }
  // Value of a buffer at time tau (seconds since the send began).
  const dVal = (buf, tau) => {
    const idx = tau / DDT - 1, i0 = Math.floor(idx), f = idx - i0;
    if (i0 < 0 || i0 + 1 >= dn) return null;
    return buf[i0] + (buf[i0 + 1] - buf[i0]) * f;
  };
  const LO_T = 0.3, HI_T = 0.7;
  // The decoder's decisions, lined up with the key. It switches to 1 above the upper line and back to 0 below the
  // lower line (so noise can't make it flicker), and marks "can't tell" wherever it lingers between the lines.
  function dDecisions() {
    const half = dWinN() >> 1, len = Math.max(0, dn - half), minQ = Math.round(1.5 * dWinN()), arr = new Int8Array(len);
    let b = 0, bandStart = -1;
    for (let i = 0; i < len; i++) {
      const e = dEN[i + half];
      if (e > HI_T) b = 1; else if (e < LO_T) b = 0;
      arr[i] = b;
      if (e >= LO_T && e <= HI_T) { if (bandStart < 0) bandStart = i; }
      else { if (bandStart >= 0 && i - bandStart >= minQ) arr.fill(2, bandStart, i); bandStart = -1; }
    }
    if (bandStart >= 0 && len - bandStart >= minQ) arr.fill(2, bandStart, len);
    return arr;
  }
  // Read the decisions back as Morse letters. SOS is sent with exact timing, so fixed thresholds are enough.
  function dDecode(arr, done) {
    const runs = [];
    for (let i = 0; i < arr.length; i++) { const r = runs[runs.length - 1]; if (r && r.s === arr[i]) r.n++; else runs.push({ s: arr[i], n: 1 }); }
    const u = dU(), dotMax = 2 * u, gapMin = 2.25 * u, longMax = 7 * u;
    const letters = []; let cur = "", unsure = false;
    const close = () => { if (cur || unsure) letters.push({ c: unsure ? "?" : (MORSE[cur] || "?"), code: unsure ? "" : cur }); cur = ""; unsure = false; };
    runs.forEach((r, i) => {
      const sec = r.n * DDT;
      if (r.s === 1) { if (sec > longMax) unsure = true; else cur += sec < dotMax ? "." : "-"; }
      else if (r.s === 2) unsure = true;
      else if (sec >= gapMin && i < runs.length - 1) close();
    });
    const last = runs[runs.length - 1];
    if (last && last.s === 0 && (done || last.n * DDT >= gapMin)) close();
    return letters;
  }

  const DX0 = 300, DX1 = 1070, DROWS = [{ y: 18, h: 92 }, { y: 122, h: 104 }, { y: 238, h: 104 }, { y: 354, h: 150 }];
  const dX = tau => DX0 + tau / dT * (DX1 - DX0);
  const KEYR = { x: 34, y: 48, w: 210, h: 120 };
  // The Morse key presses itself in time with the message being sent (it is a picture, not a control).
  function drawMorseKey(pressed) {
    const { x, y, w } = KEYR, by = y + 92;
    rr(mx, x, by, w, 24, 6); mx.fillStyle = "#8a5a3c"; mx.fill(); mx.strokeStyle = "#5e3c27"; mx.lineWidth = 1.5; mx.stroke();
    const px0 = x + 58, py0 = by - 16;
    rr(mx, px0 - 14, py0, 28, 16, 3); mx.fillStyle = "#b08d57"; mx.fill(); mx.strokeStyle = "#7a6038"; mx.stroke();
    const cx = x + w - 52;
    rr(mx, cx - 10, by - 8, 20, 8, 2); mx.fillStyle = pressed ? "#e8281e" : "#b08d57"; mx.fill();
    const ang = pressed ? 0.07 : -0.05, len = w - 40;
    mx.save(); mx.translate(px0, py0 + 2); mx.rotate(ang);
    rr(mx, -36, -6, len, 9, 4); mx.fillStyle = "#c9a35f"; mx.fill(); mx.strokeStyle = "#7a6038"; mx.lineWidth = 1.2; mx.stroke();
    const kx = len - 66;
    mx.beginPath(); mx.ellipse(kx, -14, 24, 10, 0, 0, TWO_PI); mx.fillStyle = "#2b3138"; mx.fill();
    rr(mx, kx - 4, -10, 8, 8, 2); mx.fill();
    mx.restore();
    mx.beginPath(); mx.arc(px0, py0 + 2, 4, 0, TWO_PI); mx.fillStyle = "#7a6038"; mx.fill();
    pill(mx, "Morse key", x + w / 2, y - 6);
  }
  function dRowLabel(r, text, col) { mx.font = `600 14px ${FONT}`; mx.fillStyle = col; mx.textAlign = "left"; mx.textBaseline = "middle"; mx.fillText(text, DX0, r.y + 10); }
  function dTrace(buf, mid, amp, col, lw, clampV) {
    if (!dHas) { seg(mx, DX0, mid, DX1, mid, col, lw); return; }
    const K = 2400; mx.strokeStyle = col; mx.lineWidth = lw; mx.lineJoin = "round"; mx.beginPath(); let started = false;
    for (let k = 0; k <= K; k++) {
      const v = dVal(buf, dT * k / K); if (v === null) { if (started) break; continue; }
      const vv = Math.max(-clampV, Math.min(clampV, v)), xx = DX0 + (DX1 - DX0) * k / K, yy = mid - vv * amp;
      started ? mx.lineTo(xx, yy) : mx.moveTo(xx, yy); started = true;
    }
    mx.stroke();
  }
  function drawDataView() {
    mx.fillStyle = "#ffffff"; mx.fillRect(0, 0, W, H);
    mx.strokeStyle = COL.line; mx.lineWidth = 1.5; rr(mx, 0.75, 0.75, W - 1.5, H - 1.5, 12); mx.stroke();

    drawMorseKey(dHas && dn > 0 && dKey[dn - 1] > 0.5 && dt < dT);
    const [r1, r2, r3, r4] = DROWS;
    mx.setLineDash([4, 4]);
    [r1.y + r1.h - 14, r2.y + 60, r3.y + 60].forEach(yy => seg(mx, DX0, yy, DX1, yy, "#c6ccd3", 1));
    mx.setLineDash([]);
    dRowLabel(r1, "Key: 1 = on, 0 = off", COL.ink);
    { const base = r1.y + r1.h - 14, hgt = 56;
      mx.font = `13px ${FONT}`; mx.fillStyle = COL.muted; mx.textAlign = "right"; mx.fillText("1", DX0 - 8, base - hgt); mx.fillText("0", DX0 - 8, base);
      dTrace(dKey, base, hgt, COL.ink, 2.5, 1); }
    dRowLabel(r2, "Transmitted radio wave", COL.blue);
    dTrace(dTX, r2.y + 60, 36, COL.blue, 1.4, 1);
    dRowLabel(r3, "Received wave, with noise", COL.green);
    dTrace(dRX, r3.y + 60, 22, COL.green, 1.1, 1.9);

    // Decoder: its estimate of how much wave is present, lined up with the key above.
    dRowLabel(r4, "Decoder: is the wave there?", "#6d4bd1");
    const half = dWinN() / 2 * DDT, top = r4.y + 26, bot = r4.y + r4.h - 30, ey = e => bot - Math.min(1.25, e) / 1.25 * (bot - top);
    mx.fillStyle = "rgba(232,40,30,0.08)"; mx.fillRect(DX0, ey(HI_T), DX1 - DX0, ey(LO_T) - ey(HI_T));
    mx.setLineDash([4, 4]); seg(mx, DX0, ey(HI_T), DX1, ey(HI_T), "#e8a29e", 1); seg(mx, DX0, ey(LO_T), DX1, ey(LO_T), "#e8a29e", 1); mx.setLineDash([]);
    seg(mx, DX0, bot, DX1, bot, "#c6ccd3", 1);
    const bandMid = (ey(HI_T) + ey(LO_T)) / 2;
    mx.font = `600 12px ${FONT}`; mx.fillStyle = "#b91c1c"; mx.textAlign = "right"; mx.textBaseline = "middle";
    mx.fillText("can't", DX0 - 8, bandMid - 7); mx.fillText("tell", DX0 - 8, bandMid + 7);
    mx.fillStyle = COL.muted; mx.font = `13px ${FONT}`; mx.fillText("1", DX0 - 8, ey(1)); mx.fillText("0", DX0 - 8, bot);
    const sy = bot + 10, sh = 12;
    mx.font = `600 12px ${FONT}`; mx.textAlign = "right"; mx.fillStyle = COL.muted; mx.fillText("decoded", DX0 - 8, sy + sh / 2);
    const done = dHas && dt >= dT - 1e-6;
    if (dHas) {
      const K = 1600; mx.strokeStyle = "#6d4bd1"; mx.lineWidth = 2.5; mx.lineJoin = "round"; mx.beginPath(); let st = false;
      for (let k = 0; k <= K; k++) {
        const tau = dT * k / K, e = dVal(dEN, tau + half);
        if (e === null) break;
        const xx = DX0 + (DX1 - DX0) * k / K, yy = ey(e); st ? mx.lineTo(xx, yy) : mx.moveTo(xx, yy); st = true;
      }
      mx.stroke();
      // decision strip: green = 1, red = can't tell, blank = 0
      const arr = dDecisions(); let i0 = 0;
      for (let i = 1; i <= arr.length; i++) {
        if (i === arr.length || arr[i] !== arr[i0]) {
          if (arr[i0]) { const xa = dX((i0 + 1) * DDT), xb = Math.min(DX1, dX((i + 1) * DDT)); mx.fillStyle = arr[i0] === 1 ? "#2d9b55" : "#e8281e"; mx.fillRect(xa, sy, xb - xa, sh); }
          i0 = i;
        }
      }
      dLetters = dDecode(arr, done);
      // sweep front
      if (!done) { const fx = dX(dt); mx.setLineDash([3, 4]); seg(mx, fx, r1.y, fx, sy + sh, "#a7afb8", 1); mx.setLineDash([]); }
    } else {
      pill(mx, "Choose a frequency and speed, then press Send SOS", (DX0 + DX1) / 2, r3.y + 60, "center", COL.blue);
    }

    // Decoded message, with the dots and dashes the decoder heard under each letter.
    const bx = 34, by = 214, bw = 210, bh = 112;
    rr(mx, bx, by, bw, bh, 12); mx.fillStyle = "#fafbfc"; mx.fill(); mx.strokeStyle = COL.line; mx.lineWidth = 1.5; mx.stroke();
    mx.font = `600 13px ${FONT}`; mx.fillStyle = COL.muted; mx.textAlign = "center"; mx.textBaseline = "middle"; mx.fillText("Decoded message", bx + bw / 2, by + 20);
    const shown = dLetters.slice(-8), sym = code => code.split("").map(ch => ch === "." ? "•" : "–").join(" ");
    if (!shown.length) { mx.font = `800 34px ${FONT}`; mx.fillStyle = "#c6ccd3"; mx.fillText("–", bx + bw / 2, by + 60); }
    else {
      const gap = shown.length > 1 ? Math.min(44, (bw - 36) / (shown.length - 1)) : 44, x0 = bx + bw / 2 - (shown.length - 1) * gap / 2, small = gap < 34;
      shown.forEach((l, i) => {
        const xx = x0 + i * gap;
        mx.font = `800 ${small ? 24 : 32}px ${FONT}`; mx.fillStyle = l.c === "?" ? "#e8281e" : COL.ink; mx.fillText(l.c, xx, by + 58);
        mx.font = `800 ${small ? 10 : 12}px ${FONT}`; mx.fillStyle = COL.muted; mx.fillText(sym(l.code), xx, by + 90);
      });
    }
    // Morse reminder
    mx.font = `600 13px ${FONT}`; mx.fillStyle = COL.muted; mx.fillText("SOS in Morse code", bx + bw / 2, by + bh + 34);
    mx.font = `800 16px ${FONT}`; mx.fillStyle = COL.ink; mx.fillText("• • •    – – –    • • •", bx + bw / 2, by + bh + 58);
  }

  const WINDOW = 3;
  function panel(x, y, w, h, title, tag, tagCol, col, fn, scale, win = WINDOW, overlays = []) {
    const side = x === 0 ? 0 : 1, shut = collapsed[side];
    if (shut) h = PHC - 6;
    rr(px, x, y, w, h, 10); px.fillStyle = "#fafbfc"; px.fill(); px.strokeStyle = "#d9dee4"; px.lineWidth = 1.5; px.stroke();
    px.font = `600 15px ${FONT}`; px.fillStyle = COL.ink; px.textAlign = "left"; px.textBaseline = "alphabetic";
    px.fillText(title, x + 16, y + 26);
    const bx = x + w - 22, by = y + 20;
    px.beginPath(); px.arc(bx, by, 13, 0, TWO_PI);
    if (shut) { px.fillStyle = COL.blue; px.fill(); }
    else { px.fillStyle = "#ffffff"; px.fill(); px.strokeStyle = "#c6ccd3"; px.lineWidth = 1; px.stroke(); }
    px.strokeStyle = shut ? "#ffffff" : COL.ink; px.lineWidth = 2.5; px.lineCap = "round"; px.beginPath(); px.moveTo(bx - 6, by); px.lineTo(bx + 6, by);
    if (shut) { px.moveTo(bx, by - 6); px.lineTo(bx, by + 6); }
    px.stroke(); px.lineCap = "butt";
    if (shut) { px.font = `700 13px ${FONT}`; px.fillStyle = COL.blue; px.textAlign = "right"; px.textBaseline = "alphabetic"; px.fillText("Show graph", bx - 20, y + 25); }
    if (tag && !shut) { px.font = `700 13px ${FONT}`; px.fillStyle = tagCol; px.textAlign = "right"; px.textBaseline = "alphabetic"; px.fillText(tag, x + w - 44, y + 26); }
    if (shut) return;
    const L = x + 40, Rr = x + w - 20, M = y + h / 2 + 6, A = 48;
    px.setLineDash([5, 5]); seg(px, L, M, Rr, M, "#a7afb8", 1.2); px.setLineDash([]);
    seg(px, L, M - A - 6, L, M + A + 6, "#a7afb8", 1.2);
    px.font = `13px ${FONT}`; px.fillStyle = COL.muted; px.textAlign = "right";
    px.fillText("+", L - 8, M - A + 5); px.fillText("0", L - 8, M + 5); px.fillText("–", L - 8, M + A + 5);
    tLabel(px, x + w - 12, M + 17);
    const K = 600; let lastY = M;
    overlays.forEach(o => {
      px.strokeStyle = o.col; px.lineWidth = 2; px.beginPath();
      const dashT = win * 11 / (Rr - L);
      let wasOn = false;
      for (let k = 0; k <= K; k++) {
        const back = win * (1 - k / K), on = Math.floor((o.now - back) / dashT) % 2 === 0;
        const v = Math.max(-1.15, Math.min(1.15, o.fn(back))), yy = M - v * A, xx = L + (Rr - L) * k / K;
        if (on && wasOn) px.lineTo(xx, yy); else px.moveTo(xx, yy);
        wasOn = on;
      }
      px.stroke();
    });
    px.strokeStyle = col; px.lineWidth = 3; px.lineJoin = "round"; px.lineCap = "round"; px.beginPath();
    for (let k = 0; k <= K; k++) {
      const back = win * (1 - k / K);
      const v = Math.max(-1.15, Math.min(1.15, fn(back) * scale));
      const yy = M - v * A, xx = L + (Rr - L) * k / K;
      k ? px.lineTo(xx, yy) : px.moveTo(xx, yy); lastY = yy;
    }
    px.stroke();
    px.fillStyle = col; px.beginPath(); px.arc(Rr, lastY, 6, 0, TWO_PI); px.fill();
  }
  function drawPlots() {
    px.clearRect(0, 0, W, plotH());
    const gap = 12, w = (W - gap) / 2, h = PH - 6;
    if (view === "encoding") {
      const ov = enc === "am" ? [{ now: et, col: "rgba(45,155,85,0.7)", fn: b => encAt(eA, b) * (1 + 0.6 * encAt(eS, b)) / 1.6 }, { now: et, col: "rgba(45,155,85,0.7)", fn: b => -encAt(eA, b) * (1 + 0.6 * encAt(eS, b)) / 1.6 }] : [];
      panel(0, 3, w, h, "Current in transmitter", enc === "am" ? "AM" : "FM", COL.current, COL.current, b => encAt(eM, b), 1, WINDOW, ov);
      const d = (ER.x - EM.x) / EV;
      panel(w + gap, 3, w, h, "Sound out of the decoder", "dashed: original sound", COL.muted, "#6d4bd1", b => encAt(eD, b), 1, WINDOW, [{ now: et, col: "rgba(45,155,85,0.85)", fn: b => encAt(eS, b + d + (enc === "am" ? 0.1 : 0.2)) }]);
      return;
    }
    if (view === "over-the-hill") {
      const lw = wave === "long";
      panel(0, 3, w, h, "Current in transmitter", WAVES[wave].name, lw ? "#9b5d13" : "#19743b", COL.current, b => hAtL(hTI, b), 1, WAVES[wave].win);
      const mag = hillOn && wave === "long" ? 3 : 1;
      const vweak = hSignal() < 0.12;
      panel(w + gap, 3, w, h, "Current in receiving aerial", vweak ? "very weak signal" : "", "#b91c1c", COL.green, b => hAtL(hTR, b), mag, WAVES[wave].win);
      return;
    }
    const fTag = freq === F1 ? "100 kHz" : "200 kHz", fCol = freq === F1 ? "#9b5d13" : "#19743b";
    panel(0, 3, w, h, "Current in transmitter", fTag, fCol, COL.current, b => ret(HI, b), 1);
    if (view === "field-map") {
      const d = Math.hypot(R.x - T.x, R.y - G) / V, a = ampAt(R.x, R.y);
      panel(w + gap, 3, w, h, "Current in receiving aerial", "", COL.muted, COL.green, b => -a * ret(HS, b + d), 3);
    } else {
      // With the wire shown, follow the field where the electron is; otherwise at the bold E and B arrows.
      const gx = showWire ? WIRE.x : PROBE;
      panel(w + gap, 3, w, h, showWire ? "Electric field at the electron" : "Electric field at the marked point", "", COL.muted, COL.blue, b => -ret(HS, b + (gx - rod.x) / V), 1);
    }
  }

  const statusText = document.getElementById("statusText"), dot = document.getElementById("dot"), lessonF = document.getElementById("lessonF");
  const hillStatus = document.getElementById("hillStatus"), hillDot = document.getElementById("hillDot");
  let shownF = 0;
  function updateText() {
    if (view === "sending-data") {
      const key = "d" + dFreq + dSpeed;
      if (shownF !== key) {
        shownF = key;
        const cyc = (DFREQ[dFreq] * dU()).toFixed(1);
        statusText.textContent = `One dot lasts ${cyc} cycle${cyc === "1.0" ? "" : "s"} of the wave`;
        dot.classList.toggle("on", dFreq === "high");
      }
      return;
    }
    if (view === "encoding") {
      const key = "e" + enc;
      if (shownF !== key) {
        shownF = key;
        statusText.textContent = enc === "am" ? "AM • amplitude varies with the signal" : "FM • frequency varies with the signal";
        dot.classList.toggle("on", enc === "fm");
      }
      return;
    }
    if (view === "over-the-hill") {
      const key = "h" + wave;
      if (shownF !== key) {
        shownF = key;
        hillStatus.textContent = wave === "long" ? "Wavelength about the size of the hill" : "Wavelength much smaller than the hill";
        hillDot.classList.toggle("on", wave === "short");
      }
      return;
    }
    const fkey = mode + freq;
    if (shownF !== fkey) {
      shownF = fkey;
      const hi = freq === F2;
      // "lower" and "higher" only mean something when the frequency is changing between the two.
      statusText.textContent = mode === "steady" ? "Frequency: 100 kHz" : hi ? "200 kHz • higher frequency" : "100 kHz • lower frequency";
      dot.classList.toggle("on", hi);
      lessonF.textContent = hi ? "200,000 Hz (200 kHz): 200,000 complete cycles every second" : "100,000 Hz (100 kHz): 100,000 complete cycles every second";
      lessonF.className = hi ? "hi" : "lo";
    }
  }

  let last = performance.now(), speed = slow ? 0.2 : 1, acc = 0, hacc = 0;
  function loop(now) {
    const real = Math.min((now - last) / 1000, 0.1); last = now;
    speed += ((slow ? 0.2 : 1) - speed) * Math.min(1, real * 6);
    acc += real * speed;
    while (acc >= DT) { step(); acc -= DT; }
    if (view === "over-the-hill") {
      if (!hReady) hReset();
      hacc += real * speed;
      while (hacc >= HDT) { hStep(); hacc -= HDT; }
      drawHillView();
    } else if (view === "encoding") {
      eacc += real * speed;
      while (eacc >= EDT) { eStep(); eacc -= EDT; }
      drawEncView();
    } else if (view === "sending-data") {
      // Only run while a message is being swept across; afterwards the picture holds still.
      if (dHas && dt < dT) { dacc += real * speed; while (dacc >= DDT && dt < dT) { dStep(); dacc -= DDT; } }
      drawDataView();
    } else if (view === "field-map") drawFieldView(); else drawWaveView();
    if (view !== "sending-data") drawPlots();
    updateText();
    requestAnimationFrame(loop);
  }

  const viewBtns = document.querySelectorAll("[data-view]");
  // The paragraph under the title changes with the mode.
  const INTROS = {
    "field-map": "An alternating current in the transmitting mast makes a wave in the electric and magnetic fields. The wave travels outwards, and when it reaches another aerial it makes an alternating current there too.",
    "inside-the-wave": "Zoom in on the wave itself: electric and magnetic fields oscillating at right angles to each other, travelling away from the transmitter at the speed of light. When the wave reaches a wire, its electric field pushes the electrons inside.",
    "over-the-hill": "Radio waves spread out when they pass the edge of an obstacle. Compare how a long wave and a shorter wave get over a hill to reach a house on the other side.",
    "encoding": "A steady radio wave carries no information. To send sound, the transmitter changes the carrier wave to match the sound signal, and the receiver decodes it back again.",
    "sending-data": "Digital data is sent as pulses: the carrier wave is switched on for a 1 and off for a 0. The frequency of the carrier limits how short the pulses can be, and so how quickly data can be sent."
  };
  function setView(v) {
    view = ["inside-the-wave", "over-the-hill", "encoding", "sending-data"].includes(v) ? v : "field-map";
    viewBtns.forEach(b => b.classList.toggle("on", b.dataset.view === view));
    document.getElementById("intro").textContent = INTROS[view];
    const hill = view === "over-the-hill", encv = view === "encoding", data = view === "sending-data";
    document.getElementById("sigBar").hidden = hill || encv || data;
    document.getElementById("dataBar").hidden = !data;
    document.getElementById("lessonData").hidden = !data;
    document.getElementById("dykData").hidden = !data;
    document.getElementById("onBtn").hidden = data;
    plots.hidden = data;
    document.getElementById("hillBar").hidden = !hill;
    document.getElementById("encBar").hidden = !encv;
    document.getElementById("lessonMain").hidden = hill || encv || data;
    document.getElementById("lessonHill").hidden = !hill;
    document.getElementById("lessonEnc").hidden = !encv;
    document.getElementById("hillBtn").hidden = !hill;
    document.getElementById("wireBtn").hidden = view !== "inside-the-wave";
    // In Inside the wave and Over the hill, Transmitter on comes first and the mode's own switch (Show wire or
    // Hill in the way) comes last. Other modes keep their usual order.
    document.getElementById("onBtn").style.order = view === "inside-the-wave" || hill ? -1 : 0;
    document.getElementById("wireBtn").style.order = view === "inside-the-wave" ? 1 : 0;
    document.getElementById("hillBtn").style.order = hill ? 1 : 0;
    document.getElementById("statusBox").hidden = hill;
    document.getElementById("footMain").hidden = hill || encv || data;
    document.getElementById("dykEnc").hidden = !encv;
    shownF = 0;
  }
  document.querySelectorAll("[data-enc]").forEach(b => b.addEventListener("click", () => {
    if (enc !== b.dataset.enc) decReset();
    enc = b.dataset.enc;
    document.querySelectorAll("[data-enc]").forEach(x => x.classList.toggle("on", x === b));
  }));
  document.querySelectorAll("[data-wave]").forEach(b => b.addEventListener("click", () => {
    if (wave === b.dataset.wave) return;
    wave = b.dataset.wave;
    document.querySelectorAll("[data-wave]").forEach(x => x.classList.toggle("on", x === b));
    hReady = false;
  }));
  const wireBtn = document.getElementById("wireBtn"), wireTog = document.getElementById("wireTog");
  wireBtn.addEventListener("click", () => { showWire = !showWire; wireTog.classList.toggle("on", showWire); wireBtn.setAttribute("aria-pressed", showWire); });
  const hillBtn = document.getElementById("hillBtn"), hillTog = document.getElementById("hillTog");
  hillBtn.addEventListener("click", () => {
    hillOn = !hillOn; hillTog.classList.toggle("on", hillOn); hillBtn.setAttribute("aria-pressed", hillOn);
    hReady = false;
  });
  viewBtns.forEach(b => b.addEventListener("click", () => { setView(b.dataset.view); try { history.replaceState(null, "", "#" + view); } catch (e) { location.hash = view; } }));
  window.addEventListener("hashchange", () => setView(location.hash.slice(1)));
  setView(location.hash.slice(1));

  document.querySelectorAll("[data-mode]").forEach(b => b.addEventListener("click", () => {
    mode = b.dataset.mode;
    document.querySelectorAll("[data-mode]").forEach(x => x.classList.toggle("on", x === b));
  }));
  const slowBtn = document.getElementById("slowBtn"), slowTog = document.getElementById("slowTog");
  function syncSlow() { slowTog.classList.toggle("on", slow); slowBtn.setAttribute("aria-pressed", slow); }
  slowBtn.addEventListener("click", () => { slow = !slow; syncSlow(); });
  syncSlow();
  const onBtn = document.getElementById("onBtn"), onTog = document.getElementById("onTog");
  onBtn.addEventListener("click", () => { on = !on; onTog.classList.toggle("on", on); onBtn.setAttribute("aria-pressed", on); });

  for (let i = 0; i < Math.round(8 / DT); i++) step();
  for (let i = 0; i < Math.round(9 / EDT); i++) eStep();
  document.querySelectorAll("[data-dfreq]").forEach(b => b.addEventListener("click", () => {
    if (dFreq === b.dataset.dfreq) return;
    dFreq = b.dataset.dfreq;
    document.querySelectorAll("[data-dfreq]").forEach(x => x.classList.toggle("on", x === b));
    dIdle();
  }));
  // Each Send SOS starts a fresh decoded message.
  document.querySelectorAll("[data-dspeed]").forEach(b => b.addEventListener("click", () => {
    if (dSpeed === b.dataset.dspeed) return;
    dSpeed = b.dataset.dspeed;
    document.querySelectorAll("[data-dspeed]").forEach(x => x.classList.toggle("on", x === b));
    dIdle();
  }));
  document.getElementById("sosBtn").addEventListener("click", dSend);
  requestAnimationFrame(loop);
})();
