import "./style.css";
import "./infrared.css";

(() => {
  "use strict";
  // ---- Physics ----
  // Each surface absorbs and emits the same fraction (eps) of what a perfect black surface would.
  // dT/dt = K * eps * (Ts^4 - T^4) / Tref^4, temperatures in kelvin. K is chosen per scenario so a matt black
  // object settles in about 7 s of screen time (time is sped up), grey in about 12 s and shiny silver in about 33 s.
  const SCENES = {
    banana:  { label: "Banana", place: "cupboard", T0: 20, Ts: 20,   K: 73,  yMin: 0,   yMax: 40,   step: 10 },
    pottery: { label: "Pottery", place: "kiln",    T0: 20, Ts: 1000, K: 296, yMin: 0,   yMax: 1100, step: 200 },
    bagel:   { label: "Bagel", place: "freezer",   T0: 20, Ts: -18,  K: 73,  yMin: -30, yMax: 30,   step: 10 },
  };
  const SURF = {
    black:  { eps: 0.95, name: "Matt black",   curve: "#202326" },
    grey:   { eps: 0.55, name: "Grey",         curve: "#8a9097" },
    silver: { eps: 0.20, name: "Shiny silver", curve: "#5b93c2" },
  };
  const TWIN = 36, SDT = 1 / 240, K0 = 273.15;
  const RATE = 7; // infrared arrows per second for the strongest flow in a scenario

  let scene = "pottery", surf = "black", T = 20, t = 0, runs = {};
  const sc = () => SCENES[scene], eps = () => SURF[surf].eps;
  const ref4 = () => (Math.max(sc().T0, sc().Ts) + K0) ** 4;
  const pIn = () => (sc().Ts + K0) ** 4 / ref4();          // infrared arriving from the surroundings (0..1)
  const pAbs = () => eps() * pIn();                         // the part the surface absorbs
  const pEmit = () => eps() * (T + K0) ** 4 / ref4();       // what the object emits

  function restart() { T = sc().T0; t = 0; runs[surf] = [[0, T]]; arrows.length = 0; inAcc = 0; outAcc = 0; }
  function step(dt) {
    const s = sc();
    if (t >= TWIN) return;
    T += s.K * eps() * ((s.Ts + K0) ** 4 - (T + K0) ** 4) / ref4() * dt;
    t += dt;
    const run = runs[surf];
    if (t - run[run.length - 1][0] >= 0.05) run.push([t, T]);
  }

  // ---- Canvas ----
  const W = 1100, H = 486, TWO_PI = Math.PI * 2;
  const FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
  const COL = { ink: "#202020", muted: "#59636f", line: "#d9dee4", blue: "#2166d1", inArrow: "#d0201a", outArrow: "#e07b00" };
  const main = document.getElementById("main"), mx = main.getContext("2d");
  let dpr = 1;
  function setup() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    main.width = W * dpr; main.height = H * dpr; mx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function pill(text, x, y, align = "center", color = COL.ink) {
    mx.font = `700 13px ${FONT}`;
    const w = mx.measureText(text).width + 22, h = 26, x0 = align === "left" ? x : align === "right" ? x - w : x - w / 2;
    rr(mx, x0, y - h / 2, w, h, 13); mx.fillStyle = "rgba(255,255,255,0.94)"; mx.fill(); mx.strokeStyle = "#c6ccd3"; mx.lineWidth = 1; mx.stroke();
    mx.fillStyle = color; mx.textAlign = "center"; mx.textBaseline = "middle"; mx.fillText(text, x0 + w / 2, y + 1);
  }

  // ---- The room and the object ----
  const ROOM = { x0: 30, y0: 22, x1: 520, y1: 386, wall: 24 };
  const IN = { x0: ROOM.x0 + ROOM.wall, y0: ROOM.y0 + ROOM.wall, x1: ROOM.x1 - ROOM.wall, y1: ROOM.y1 - ROOM.wall };
  const OC = { x: (IN.x0 + IN.x1) / 2, y: (IN.y0 + IN.y1) / 2 + 14 };
  const SHAPE = { banana: [96, 44], pottery: [62, 76], bagel: [84, 54] }; // rough size, for shading

  function drawRoom() {
    const p = sc().place;
    let wall, inner;
    if (p === "cupboard") { wall = "#a8784a"; inner = "#f4e8d6"; }
    else if (p === "freezer") { wall = "#d7e5f0"; inner = "#e6f1fa"; }
    else { wall = "#8e4a31"; inner = null; }
    rr(mx, ROOM.x0, ROOM.y0, ROOM.x1 - ROOM.x0, ROOM.y1 - ROOM.y0, 10); mx.fillStyle = wall; mx.fill();
    if (p === "kiln") { // bricks
      mx.save(); rr(mx, ROOM.x0, ROOM.y0, ROOM.x1 - ROOM.x0, ROOM.y1 - ROOM.y0, 10); mx.clip();
      mx.strokeStyle = "rgba(60,20,10,0.35)"; mx.lineWidth = 1;
      for (let y = ROOM.y0, r = 0; y < ROOM.y1; y += 12, r++) {
        mx.beginPath(); mx.moveTo(ROOM.x0, y); mx.lineTo(ROOM.x1, y); mx.stroke();
        for (let x = ROOM.x0 + (r % 2) * 14; x < ROOM.x1; x += 28) { mx.beginPath(); mx.moveTo(x, y); mx.lineTo(x, y + 12); mx.stroke(); }
      }
      mx.restore();
      const g = mx.createRadialGradient(OC.x, OC.y, 30, OC.x, OC.y, 300);
      g.addColorStop(0, "#fff0d8"); g.addColorStop(1, "#ffc27e"); inner = g;
    }
    mx.fillStyle = inner; mx.fillRect(IN.x0, IN.y0, IN.x1 - IN.x0, IN.y1 - IN.y0);
    if (p === "freezer") { // frost along the inside edges
      mx.fillStyle = "rgba(255,255,255,0.9)";
      for (let i = 0; i < 40; i++) {
        const u = (i * 37 % 100) / 100, side = i % 4, r = 2 + (i * 13 % 4);
        const x = side < 2 ? IN.x0 + u * (IN.x1 - IN.x0) : side === 2 ? IN.x0 + 4 : IN.x1 - 4;
        const y = side < 2 ? (side === 0 ? IN.y0 + 4 : IN.y1 - 4) : IN.y0 + u * (IN.y1 - IN.y0);
        mx.beginPath(); mx.arc(x, y, r, 0, TWO_PI); mx.fill();
      }
    }
    if (p === "cupboard") { // shelf
      mx.fillStyle = "#c79a68"; mx.fillRect(IN.x0, OC.y + 64, IN.x1 - IN.x0, 8);
    }
    mx.strokeStyle = "rgba(0,0,0,0.25)"; mx.lineWidth = 1.5; mx.strokeRect(IN.x0, IN.y0, IN.x1 - IN.x0, IN.y1 - IN.y0);
  }

  function surfaceFill(x0, y0, x1, y1) {
    if (surf === "black") return "#262829";
    if (surf === "grey") return "#8d939a";
    const g = mx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, "#f6f8fa"); g.addColorStop(0.35, "#b8c0c8"); g.addColorStop(0.6, "#eef1f4"); g.addColorStop(1, "#9aa3ac");
    return g;
  }
  function objectPath() {
    const { x, y } = OC;
    mx.beginPath();
    if (scene === "banana") {
      mx.moveTo(x - 96, y - 30);
      mx.quadraticCurveTo(x - 5, y + 88, x + 96, y - 40);
      mx.lineTo(x + 104, y - 52); mx.lineTo(x + 92, y - 56);
      mx.quadraticCurveTo(x - 5, y + 24, x - 90, y - 42);
      mx.quadraticCurveTo(x - 100, y - 40, x - 96, y - 30);
      mx.closePath();
    } else if (scene === "bagel") {
      mx.ellipse(x, y, 84, 52, 0, 0, TWO_PI);
      mx.moveTo(x + 22, y); mx.ellipse(x, y, 22, 12, 0, 0, TWO_PI, true);
    } else {
      mx.moveTo(x - 26, y - 76); mx.lineTo(x + 26, y - 76);
      mx.quadraticCurveTo(x + 22, y - 56, x + 30, y - 46);
      mx.bezierCurveTo(x + 80, y - 20, x + 70, y + 66, x + 34, y + 76);
      mx.lineTo(x - 34, y + 76);
      mx.bezierCurveTo(x - 70, y + 66, x - 80, y - 20, x - 30, y - 46);
      mx.quadraticCurveTo(x - 22, y - 56, x - 26, y - 76);
      mx.closePath();
    }
  }
  function drawObject() {
    const { x, y } = OC, [rx, ry] = SHAPE[scene];
    const glow = Math.max(0, Math.min(1, (T - 450) / 500)); // red-hot glow above about 450 °C
    if (glow > 0) { mx.save(); mx.shadowColor = `rgba(255,120,20,${0.9 * glow})`; mx.shadowBlur = 40 * glow; objectPath(); mx.fillStyle = "#ff9a3c"; mx.fill("evenodd"); mx.restore(); }
    objectPath(); mx.fillStyle = surfaceFill(x - rx, y - ry, x + rx, y + ry); mx.fill("evenodd");
    if (surf !== "silver") { // a soft highlight so dark surfaces still read as 3D
      mx.save(); objectPath(); mx.clip("evenodd");
      const g = mx.createRadialGradient(x - rx * 0.35, y - ry * 0.5, 4, x - rx * 0.35, y - ry * 0.5, rx);
      g.addColorStop(0, "rgba(255,255,255,0.22)"); g.addColorStop(1, "rgba(255,255,255,0)");
      mx.fillStyle = g; mx.fillRect(x - rx - 10, y - ry - 10, 2 * rx + 20, 2 * ry + 20); mx.restore();
    }
    if (glow > 0) { objectPath(); mx.fillStyle = `rgba(255,110,25,${0.8 * glow})`; mx.fill("evenodd"); }
    objectPath(); mx.strokeStyle = "rgba(0,0,0,0.45)"; mx.lineWidth = 1.5; mx.stroke();
  }

  // ---- Infrared arrows ----
  // Incoming arrows start at the walls and head for the object; a fraction eps are absorbed, the rest reflect.
  // Emitted arrows leave the object's surface and travel out to the walls.
  const arrows = []; let inAcc = 0, outAcc = 0;
  const SPEED = 150;
  // Where a line from the wall towards the object's centre first touches the object's real outline.
  function inObject(x, y) { objectPath(); return mx.isPointInPath(x * dpr, y * dpr, "evenodd"); }
  function edgeAlong(ux, uy) {
    const [wx, wy] = wallPointToward(ux, uy), far = Math.hypot(wx - OC.x, wy - OC.y);
    for (let s = far; s > 0; s -= 2) if (inObject(OC.x + ux * s, OC.y + uy * s)) return [OC.x + ux * s, OC.y + uy * s, wx, wy];
    return null;
  }
  function randomEdge() {
    for (let k = 0; k < 12; k++) { const th = Math.random() * TWO_PI, ux = Math.cos(th), uy = Math.sin(th), e = edgeAlong(ux, uy); if (e) return e; }
    return null;
  }
  function wallPointToward(ux, uy) {
    // where a ray from the object centre in direction (ux, uy) meets the inner wall
    let s = Infinity;
    if (ux > 0) s = Math.min(s, (IN.x1 - OC.x) / ux); if (ux < 0) s = Math.min(s, (IN.x0 - OC.x) / ux);
    if (uy > 0) s = Math.min(s, (IN.y1 - OC.y) / uy); if (uy < 0) s = Math.min(s, (IN.y0 - OC.y) / uy);
    return [OC.x + ux * s, OC.y + uy * s];
  }
  function spawnIn() {
    const e = randomEdge(); if (!e) return;
    arrows.push({ kind: "in", x0: e[2], y0: e[3], x1: e[0], y1: e[1], d: 0, ph: Math.random() * TWO_PI });
  }
  function spawnOut() {
    const e = randomEdge(); if (!e) return;
    arrows.push({ kind: "out", x0: e[0], y0: e[1], x1: e[2], y1: e[3], d: 0, ph: Math.random() * TWO_PI });
  }
  function updateArrows(dt) {
    inAcc += RATE * pIn() * dt; outAcc += RATE * pEmit() * dt;
    while (inAcc >= 1) { spawnIn(); inAcc--; }
    while (outAcc >= 1) { spawnOut(); outAcc--; }
    for (let i = arrows.length - 1; i >= 0; i--) {
      const a = arrows[i], len = Math.hypot(a.x1 - a.x0, a.y1 - a.y0);
      a.d += SPEED * dt;
      if (a.kind === "flash") { if ((a.life -= dt) <= 0) arrows.splice(i, 1); continue; }
      if (a.d < len) continue;
      if (a.kind === "in") {
        if (Math.random() < eps()) arrows[i] = { kind: "flash", x: a.x1, y: a.y1, life: 0.35 };
        else { // bounce back out, roughly away from the surface
          const th = Math.atan2(a.y1 - OC.y, a.x1 - OC.x) + (Math.random() - 0.5) * 1.2;
          const [wx, wy] = wallPointToward(Math.cos(th), Math.sin(th));
          arrows[i] = { kind: "refl", x0: a.x1, y0: a.y1, x1: wx, y1: wy, d: 0, ph: a.ph };
        }
      } else arrows.splice(i, 1);
    }
  }
  function squiggle(a, color, alpha) {
    const len = Math.hypot(a.x1 - a.x0, a.y1 - a.y0), ux = (a.x1 - a.x0) / len, uy = (a.y1 - a.y0) / len, nx = -uy, ny = ux;
    const head = Math.min(a.d, len), tail = Math.max(0, head - 46);
    if (head - tail < 4) return;
    mx.save(); mx.globalAlpha = alpha; mx.strokeStyle = color; mx.lineWidth = 2.4; mx.lineCap = "round"; mx.lineJoin = "round";
    mx.beginPath();
    for (let s = tail; s <= head - 6; s += 2) {
      const o = Math.sin((s - head) / 14 * TWO_PI + a.ph) * 4.5 * Math.min(1, (head - s) / 8);
      const px = a.x0 + ux * s + nx * o, py = a.y0 + uy * s + ny * o;
      s === tail ? mx.moveTo(px, py) : mx.lineTo(px, py);
    }
    mx.stroke();
    const hx = a.x0 + ux * head, hy = a.y0 + uy * head;
    mx.beginPath(); mx.moveTo(hx, hy); mx.lineTo(hx - ux * 10 + nx * 5.5, hy - uy * 10 + ny * 5.5); mx.lineTo(hx - ux * 10 - nx * 5.5, hy - uy * 10 - ny * 5.5); mx.closePath();
    mx.fillStyle = color; mx.fill(); mx.restore();
  }
  function drawArrows(front) {
    for (const a of arrows) {
      if (a.kind === "flash") { if (!front) continue; mx.fillStyle = `rgba(208,32,26,${a.life / 0.35 * 0.6})`; mx.beginPath(); mx.arc(a.x, a.y, 7 * (1.3 - a.life / 0.35), 0, TWO_PI); mx.fill(); continue; }
      const len = Math.hypot(a.x1 - a.x0, a.y1 - a.y0), fade = a.kind === "in" ? 1 : Math.max(0, Math.min(1, (len - a.d) / 40 + 0.15));
      if (a.kind === "in") squiggle(a, COL.inArrow, 1);
      else if (a.kind === "out") squiggle(a, COL.outArrow, fade);
      else squiggle(a, COL.inArrow, 0.45 * fade);
    }
  }

  // ---- Energy bars under the room ----
  function drawBars() {
    const x0 = ROOM.x0 + 96, x1 = ROOM.x1, y = ROOM.y1 + 30, bh = 18, gap = 34;
    mx.font = `600 12px ${FONT}`; mx.fillStyle = COL.muted; mx.textAlign = "left"; mx.textBaseline = "middle";
    mx.fillText("Energy transferred by infrared each second", ROOM.x0, y - 14);
    [["Emitted", pEmit(), COL.outArrow], ["Absorbed", pAbs(), COL.inArrow]].forEach(([lab, v, c], i) => {
      const yy = y + 10 + i * gap;
      mx.font = `700 14px ${FONT}`; mx.fillStyle = COL.ink; mx.textAlign = "left"; mx.fillText(lab, ROOM.x0, yy);
      rr(mx, x0, yy - bh / 2, x1 - x0, bh, 5); mx.fillStyle = "#eef1f4"; mx.fill();
      const w = Math.max(2, (x1 - x0) * Math.min(1, v));
      rr(mx, x0, yy - bh / 2, w, bh, 5); mx.fillStyle = c; mx.fill();
    });
  }

  // ---- Temperature graph ----
  const G = { x0: 640, x1: 1066, y0: 56, y1: 440 };
  function drawGraph() {
    const s = sc(), X = tt => G.x0 + tt / TWIN * (G.x1 - G.x0), Y = v => G.y1 - (v - s.yMin) / (s.yMax - s.yMin) * (G.y1 - G.y0);
    mx.font = `700 15px ${FONT}`; mx.fillStyle = COL.ink; mx.textAlign = "left"; mx.textBaseline = "middle";
    mx.fillText("Temperature of the " + s.label.toLowerCase(), G.x0 - 52, 24);
    // grid and axes
    mx.font = `13px ${FONT}`; mx.textAlign = "right";
    for (let v = s.yMin; v <= s.yMax + 1e-9; v += s.step) {
      const yy = Y(v); mx.strokeStyle = v === 0 ? "#c6ccd3" : "#eef1f4"; mx.lineWidth = 1;
      mx.beginPath(); mx.moveTo(G.x0, yy); mx.lineTo(G.x1, yy); mx.stroke();
      mx.fillStyle = COL.muted; mx.fillText(`${v}`, G.x0 - 8, yy);
    }
    mx.save(); mx.translate(G.x0 - 44, (G.y0 + G.y1) / 2); mx.rotate(-Math.PI / 2); mx.textAlign = "center"; mx.fillStyle = COL.muted; mx.font = `600 13px ${FONT}`; mx.fillText("temperature (°C)", 0, 0); mx.restore();
    mx.strokeStyle = "#a7afb8"; mx.lineWidth = 1.5; mx.beginPath(); mx.moveTo(G.x0, G.y0); mx.lineTo(G.x0, G.y1); mx.lineTo(G.x1, G.y1); mx.stroke();
    mx.font = `italic 700 17px "Times New Roman", Times, Georgia, serif`; mx.fillStyle = COL.muted; mx.textAlign = "center"; mx.fillText("t", G.x1 - 4, G.y1 + 18);
    // surroundings temperature
    const ys = Y(s.Ts);
    mx.setLineDash([6, 5]); mx.strokeStyle = "#b45309"; mx.lineWidth = 1.6; mx.beginPath(); mx.moveTo(G.x0, ys); mx.lineTo(G.x1, ys); mx.stroke(); mx.setLineDash([]);
    mx.font = `700 12px ${FONT}`; mx.fillStyle = "#b45309"; mx.textAlign = "right"; mx.textBaseline = "bottom";
    mx.fillText(`surroundings ${s.Ts} °C`, G.x1, ys - 4);
    // runs: earlier surfaces faint, the current one bold
    const order = Object.keys(SURF).filter(k => runs[k] && k !== surf).concat([surf]);
    order.forEach(k => {
      const run = runs[k]; if (!run || run.length < 1) return;
      const cur = k === surf;
      mx.save(); mx.globalAlpha = cur ? 1 : 0.8; mx.strokeStyle = SURF[k].curve; mx.lineWidth = cur ? 3.2 : 1.8; mx.lineJoin = "round";
      mx.beginPath(); run.forEach(([tt, v], i) => i ? mx.lineTo(X(tt), Y(v)) : mx.moveTo(X(tt), Y(v)));
      if (cur) mx.lineTo(X(Math.min(t, TWIN)), Y(T));
      mx.stroke();
      const [et, ev] = cur ? [Math.min(t, TWIN), T] : run[run.length - 1];
      if (cur) { mx.beginPath(); mx.arc(X(et), Y(ev), 5.5, 0, TWO_PI); mx.fillStyle = SURF[k].curve; mx.fill(); }
      mx.restore();
    });
    // legend of the surfaces drawn so far
    let lx = G.x0 + 10; const ly = G.y0 + 2;
    mx.font = `600 12px ${FONT}`; mx.textBaseline = "middle"; mx.textAlign = "left";
    order.slice().sort((a, b) => Object.keys(SURF).indexOf(a) - Object.keys(SURF).indexOf(b)).forEach(k => {
      mx.strokeStyle = SURF[k].curve; mx.lineWidth = k === surf ? 3.2 : 1.8; mx.beginPath(); mx.moveTo(lx, ly); mx.lineTo(lx + 18, ly); mx.stroke();
      mx.fillStyle = COL.ink; mx.fillText(SURF[k].name, lx + 24, ly);
      lx += 24 + mx.measureText(SURF[k].name).width + 18;
    });
  }

  // ---- Frame ----
  function draw() {
    mx.fillStyle = "#ffffff"; mx.fillRect(0, 0, W, H);
    drawRoom();
    drawArrows(false);
    drawObject();
    drawArrows(true);
    // readouts
    pill(`${sc().label}: ${Math.round(T)} °C`, IN.x0 + 10, IN.y0 + 20, "left");
    pill(`${sc().place[0].toUpperCase() + sc().place.slice(1)}: ${sc().Ts} °C`, IN.x1 - 10, IN.y0 + 20, "right", "#b45309");
    pill("Only infrared shown · time sped up", IN.x0 + 10, IN.y1 - 20, "left", COL.muted);
    drawBars();
    drawGraph();
  }
  const statusText = document.getElementById("statusText"), dot = document.getElementById("dot");
  let shown = "";
  function updateText() {
    const e = pEmit(), a = pAbs(), d = (e - a) / Math.max(e, a, 1e-9);
    const msg = Math.abs(d) < 0.03 ? "Absorbing as much as it emits: temperature steady" : d > 0 ? "Emitting more than it absorbs: cooling down" : "Absorbing more than it emits: warming up";
    if (msg !== shown) { shown = msg; statusText.textContent = msg; dot.classList.toggle("on", Math.abs(d) < 0.03); }
  }

  let last = performance.now(), acc = 0;
  function loop(now) {
    const real = Math.min(0.05, (now - last) / 1000); last = now;
    acc += real;
    while (acc >= SDT) { step(SDT); acc -= SDT; }
    updateArrows(real);
    draw(); updateText();
    requestAnimationFrame(loop);
  }

  // ---- Controls ----
  const sceneBtns = document.querySelectorAll("[data-scene]"), surfBtns = document.querySelectorAll("[data-surface]");
  function setScene(k) {
    if (!SCENES[k]) return;
    scene = k; runs = {};
    sceneBtns.forEach(b => b.classList.toggle("on", b.dataset.scene === k));
    restart();
  }
  sceneBtns.forEach(b => b.addEventListener("click", () => { setScene(b.dataset.scene); history.replaceState(null, "", "#" + scene); }));
  surfBtns.forEach(b => b.addEventListener("click", () => {
    surf = b.dataset.surface;
    surfBtns.forEach(x => x.classList.toggle("on", x === b));
    restart();
  }));
  document.getElementById("restartBtn").addEventListener("click", restart);
  window.addEventListener("resize", setup);
  window.addEventListener("hashchange", () => setScene(location.hash.slice(1)));

  setup();
  setScene(SCENES[location.hash.slice(1)] ? location.hash.slice(1) : "pottery");
  // Start with a little infrared already in flight, so the picture is complete from the first frame.
  for (let i = 0; i < 90; i++) updateArrows(1 / 60);
  requestAnimationFrame(loop);
})();
