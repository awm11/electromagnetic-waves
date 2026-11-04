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
  const plotH = () => PH;
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
    rxFlow -= RX_AMP * ret(HS, RX_DEL) * DT * 180 * 3;
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
  function eAt(x) { return ret(HS, (x - rod.x) / V); }
  const BDIR = [-0.82, 0.46];

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

    rr(mx, rod.x - 8, rod.top, 16, rod.bot - rod.top, 8);
    mx.fillStyle = "#d4dfea"; mx.fill(); mx.strokeStyle = "#9fb0c2"; mx.lineWidth = 1.5; mx.stroke();

    mx.save();
    mx.strokeStyle = "#2166d1";
    mx.lineWidth = 4.5; mx.lineCap = "round";
    mx.setLineDash([9, 15]); mx.lineDashOffset = flowOff;
    mx.beginPath(); mx.moveTo(rod.x, rod.bot - 12); mx.lineTo(rod.x, rod.top + 12); mx.stroke();
    mx.restore();

    RYS.forEach(RY => RINGS.forEach((r, q) => {
      const col = ringCol(q), fx = rod.x, fy = RY + r * PS * PD / (PD - r * PC);
      mx.strokeStyle = col; mx.lineWidth = 2.5; ringArc(RY, r, 0, Math.PI);
      {
        const d = I >= 0 ? 1 : -1;
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


    seg(mx, WX0 - 10, rod.mid, WX1 + 10, rod.mid, "#a7afb8", 1.5);

    const N = 44, AL = 105, eT = [], bT = [];
    for (let i = 0; i <= N; i++) {
      const x = WX0 + (WX1 - WX0) * i / N, e = eAt(x);
      eT.push([x, rod.mid - e * AL]);
      bT.push([x + BDIR[0] * e * AL, rod.mid + BDIR[1] * e * AL]);
    }
    for (let i = 0; i <= N; i++) {
      const x = eT[i][0], e = eAt(x);
      arrow(mx, x, rod.mid, bT[i][0], bT[i][1], "rgba(194,37,92,0.8)", 2, 8);
      arrow(mx, x, rod.mid, eT[i][0], eT[i][1], "rgba(33,102,209,0.85)", 2, 8);
    }
    [[bT, COL.bfield], [eT, COL.blue]].forEach(([pts, col]) => {
      mx.strokeStyle = col; mx.lineWidth = 2.5; mx.beginPath();
      pts.forEach((p, i) => i ? mx.lineTo(p[0], p[1]) : mx.moveTo(p[0], p[1])); mx.stroke();
    });

    const pe = eAt(PROBE);
    if (Math.abs(pe) > 0.05) {
      const ep = [PROBE, rod.mid - pe * AL], bp = [PROBE + BDIR[0] * pe * AL, rod.mid + BDIR[1] * pe * AL];
      arrow(mx, PROBE, rod.mid, bp[0], bp[1], COL.bfield, 4.5, 15);
      arrow(mx, PROBE, rod.mid, ep[0], ep[1], COL.blue, 4.5, 15);
      const se = Math.sign(pe), m = 13, bl = Math.hypot(BDIR[0], BDIR[1]);
      const u1 = [0, -se], u2 = [BDIR[0] / bl * se, BDIR[1] / bl * se];
      mx.strokeStyle = COL.ink; mx.lineWidth = 1.5; mx.beginPath();
      mx.moveTo(PROBE + u1[0] * m, rod.mid + u1[1] * m);
      mx.lineTo(PROBE + (u1[0] + u2[0]) * m, rod.mid + (u1[1] + u2[1]) * m);
      mx.lineTo(PROBE + u2[0] * m, rod.mid + u2[1] * m); mx.stroke();
      mx.font = `italic 700 20px "Times New Roman", Times, Georgia, serif`;
      mx.fillStyle = COL.blue; mx.textAlign = "left"; mx.fillText("E", ep[0] + 10, ep[1] + (se > 0 ? 6 : -4));
      mx.fillStyle = COL.bfield; mx.textAlign = "right"; mx.fillText("B", bp[0] - 8, bp[1] + (se > 0 ? 10 : -6));
    }
    pill(mx, "E and B always at right angles", PROBE, rod.mid + 150);

    pill(mx, "E: up and down, in the page", WX1 - 2, 40, "right", COL.blue);
    pill(mx, "B: into and out of the page", WX1 - 2, 72, "right", COL.bfield);
    arrow(mx, WX1 - 150, H - 40, WX1, H - 40, COL.ink, 3, 13);
    mx.font = `700 13px ${FONT}`; mx.fillStyle = COL.muted; mx.textAlign = "right"; mx.textBaseline = "middle";
    mx.fillText("travels away at the speed of light", WX1 - 162, H - 40);
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
    pill(mx, WAVES[wave].name + " · not to scale", W - 24, 30, "right");
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
    pill(mx, enc === "am" ? "Radio wave: amplitude is adjusted to encode the sound wave" : "Radio wave: frequency is adjusted to encode the sound wave", (EX0 + EX1) / 2, EAX - 150);
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
      panel(w + gap, 3, w, h, "Current in receiving aerial", "", COL.muted, COL.green, b => a * ret(HS, b + d), 3);
    } else {
      panel(w + gap, 3, w, h, "Electric field at the marked point", "", COL.muted, COL.blue, b => ret(HS, b + (PROBE - rod.x) / V), 1);
    }
  }

  const statusText = document.getElementById("statusText"), dot = document.getElementById("dot"), lessonF = document.getElementById("lessonF");
  const hillStatus = document.getElementById("hillStatus"), hillDot = document.getElementById("hillDot");
  let shownF = 0;
  function updateText() {
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
    if (shownF !== freq) {
      shownF = freq;
      const hi = freq === F2;
      statusText.textContent = hi ? "200 kHz • higher frequency" : "100 kHz • lower frequency";
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
    } else if (view === "field-map") drawFieldView(); else drawWaveView();
    drawPlots(); updateText();
    requestAnimationFrame(loop);
  }

  const viewBtns = document.querySelectorAll("[data-view]");
  function setView(v) {
    view = v === "inside-the-wave" || v === "over-the-hill" || v === "encoding" ? v : "field-map";
    viewBtns.forEach(b => b.classList.toggle("on", b.dataset.view === view));
    const hill = view === "over-the-hill", encv = view === "encoding";
    document.getElementById("sigBar").hidden = hill || encv;
    document.getElementById("hillBar").hidden = !hill;
    document.getElementById("encBar").hidden = !encv;
    document.getElementById("lessonMain").hidden = hill || encv;
    document.getElementById("lessonHill").hidden = !hill;
    document.getElementById("lessonEnc").hidden = !encv;
    document.getElementById("hillBtn").hidden = !hill;
    document.getElementById("statusBox").hidden = hill;
    document.getElementById("footMain").hidden = hill || encv;
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
  requestAnimationFrame(loop);
})();
