// Homepage backdrop: slender vines drawn on a transparent canvas behind the
// text, so only the strokes show against the page. Adapted from the "wildline" gesture garden.
//
// Growth runs in cycles: gestures spend a fixed ink budget, the vines hold for
// a moment once the backdrop is full, then dissolve before the next cycle. The
// monogram is written once into a clearing at the centre right after load and
// stays; it lives on its own layer so the dissolve never touches it.
(() => {
  "use strict";

  const canvas = document.getElementById("wildline");
  if (!canvas) return;
  const view = canvas.getContext("2d");
  const vineLayer = document.createElement("canvas");
  const logoLayer = document.createElement("canvas");
  const vineCtx = vineLayer.getContext("2d");
  const logoCtx = logoLayer.getContext("2d");
  // Drawing helpers paint into whichever layer this points at.
  let ctx = vineCtx;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Botanical-plate ink on white paper.
  const INK = { h: 30, s: 8, l: 20 };
  const SAGE = { h: 100, s: 16, l: 40 };
  const MOSS = { h: 75, s: 14, l: 50 };
  const ROSE = { h: 8, s: 46, l: 58 };
  const OCHRE = { h: 38, s: 42, l: 56 };

  // Monogram centre lines, traced from the logo artwork (source pixels), in writing order.
  const LOGO_STROKES = [
    [[393, 680], [378, 702], [363, 726], [350, 752], [338, 784]],
    [[306, 727], [360, 725], [425, 725], [440, 731], [440, 745], [425, 775], [400, 815], [375, 848],
     [352, 873], [342, 885], [352, 889], [380, 885], [440, 862], [480, 846], [517, 832]],
    [[467, 806], [458, 835], [445, 862], [430, 893], [420, 922]]
  ];
  const LOGO_SOURCE = { cx: 412, cy: 801, h: 254 };

  const maxVines = 90;
  const areaPerSeed = 32000;  // px² of backdrop per gesture seed in a cycle; once spent it is full
  const cellSize = 110;       // seeds are spread out so one spot cannot be overfilled
  const cellLimit = 2;
  const settleAfter = 2200;   // ms without new seeds before the cycle completes itself
  const logoDelay = 500;      // the monogram is written once, shortly after load, then stays
  const logoDuration = 3200;
  const holdDuration = 3400;
  const fadeDuration = 2600;
  const restDuration = 6500;  // idle time before the banner replays on its own

  let width = 0;
  let height = 0;
  let dpr = 1;
  let vines = [];
  let lastTime = 0;
  let clock = 0;
  let visible = true;
  let lastPointer = null;

  let phase = "rest";
  let phaseUntil = 0;
  let ink = 0;
  let budget = 0;
  let autoplay = false;
  let nextAuto = 0;
  let lastSeedAt = 0;
  let density = new Map();

  let logo = null;
  let logoProgress = 0;
  let logoIndex = 0;

  const random = (min, max) => min + Math.random() * (max - min);
  const chance = p => Math.random() < p;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const hsla = (c, a) => `hsla(${c.h}, ${c.s}%, ${c.l}%, ${a})`;
  const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));

  function catmullRom(points, spacing) {
    const out = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];
      const steps = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / spacing));
      for (let j = i === 0 ? 0 : 1; j <= steps; j++) {
        const t = j / steps;
        const t2 = t * t;
        const t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - 3 * c + d - a) * t3);
        out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    return out;
  }

  // Lays the monogram out at the banner's centre as one flat list of samples.
  function buildLogo() {
    const logoHeight = Math.min(height * 0.46, 124);
    const scale = logoHeight / LOGO_SOURCE.h;
    const cx = width / 2;
    const cy = height * 0.47;
    const samples = [];
    const sprouts = [];
    let total = 0;
    LOGO_STROKES.forEach((stroke, strokeIndex) => {
      const pts = catmullRom(stroke.map(([x, y]) => [cx + (x - LOGO_SOURCE.cx) * scale, cy + (y - LOGO_SOURCE.cy) * scale]), 1);
      let local = 0;
      const first = samples.length;
      pts.forEach((p, i) => {
        if (i) local += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
        samples.push({ x: p[0], y: p[1], s: total + local, local, stroke: strokeIndex, first: i === 0 });
      });
      const length = local;
      for (let i = first; i < samples.length; i++) samples[i].length = length;
      for (let s = random(10, 18); s < length - 10; s += random(20, 32)) {
        if (chance(0.5)) sprouts.push({ s: total + s, side: chance(0.5) ? 1 : -1 });
      }
      total += length;
    });
    return {
      samples, sprouts, total, scale,
      cx, cy,
      rx: (219 * scale) / 2 + 34,
      ry: logoHeight / 2 + 16,
      width: clamp(logoHeight * 0.019, 1.3, 2.3)
    };
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === width && rect.height === height) return;
    let previous = null;
    if (width && height) {
      previous = document.createElement("canvas");
      previous.width = vineLayer.width;
      previous.height = vineLayer.height;
      previous.getContext("2d").drawImage(vineLayer, 0, 0);
    }
    width = rect.width;
    height = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const [layer, layerCtx] of [[canvas, view], [vineLayer, vineCtx], [logoLayer, logoCtx]]) {
      layer.width = Math.round(width * dpr);
      layer.height = Math.round(height * dpr);
      layerCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    if (previous) vineCtx.drawImage(previous, 0, 0, previous.width / dpr, previous.height / dpr);

    // The monogram is re-laid at the new centre and redrawn to where it had got.
    logo = buildLogo();
    logoIndex = 0;
    drawLogo();
    composite();
  }

  function composite() {
    view.clearRect(0, 0, width, height);
    view.drawImage(vineLayer, 0, 0, width, height);
    view.drawImage(logoLayer, 0, 0, width, height);
  }

  // How deep a point sits inside the clearing kept around the monogram (<1 is inside).
  function clearingDepth(x, y) {
    const dx = (x - logo.cx) / logo.rx;
    const dy = (y - logo.cy) / logo.ry;
    return dx * dx + dy * dy;
  }

  // A vine steers by a slowly wandering curvature, ends in a curling tendril,
  // and sets leaves on alternating sides as it travels.
  function makeVine(x, y, angle, scale = 1, generation = 0) {
    return {
      x, y, angle, scale, generation,
      k: random(-0.012, 0.012),
      targetK: random(-0.02, 0.02),
      retarget: random(30, 80),
      speed: random(0.55, 0.8) * (generation ? 0.85 : 1),
      life: 0,
      maxLife: random(190, 320) * scale,
      baseWidth: random(0.9, 1.35) * scale,
      curl: chance(0.5) ? 1 : -1,
      travelled: 0,
      nextLeaf: random(14, 26),
      leafSide: chance(0.5) ? 1 : -1,
      ending: chance(0.32) ? "flower" : chance(0.4) ? "bud" : chance(0.35) ? "berries" : "none"
    };
  }

  function addVine(vine) {
    if (vines.length >= maxVines) return false;
    vines.push(vine);
    return true;
  }

  function drawLeaf(x, y, angle, size, side) {
    const stalk = size * 0.28;
    const len = size;
    const w = size * random(0.32, 0.4);
    const bend = side * size * 0.08;
    const color = chance(0.7) ? SAGE : MOSS;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle + side * random(0.55, 0.95));
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(stalk * 0.5, bend * 0.4, stalk, bend * 0.5);
    ctx.strokeStyle = hsla(color, 0.55);
    ctx.lineWidth = 0.5;
    ctx.stroke();

    ctx.translate(stalk, bend * 0.5);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(len * 0.25, -w * 1.05, len * 0.7, -w * 0.85 + bend, len, bend);
    ctx.bezierCurveTo(len * 0.7, w * 0.75 + bend, len * 0.25, w * 0.95, 0, 0);
    ctx.fillStyle = hsla(color, 0.13);
    ctx.fill();
    ctx.strokeStyle = hsla(color, 0.6);
    ctx.lineWidth = 0.55;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.5, bend * 0.6, len * 0.88, bend * 0.95);
    ctx.strokeStyle = hsla(color, 0.4);
    ctx.lineWidth = 0.4;
    ctx.stroke();
    ctx.restore();
  }

  function drawFlower(x, y, size, color = chance(0.75) ? ROSE : OCHRE) {
    const petals = chance(0.6) ? 5 : 6;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(random(0, Math.PI * 2));
    for (let i = 0; i < petals; i++) {
      ctx.rotate((Math.PI * 2) / petals);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-size * 0.62, -size * 0.25, -size * 0.55, -size * 1.0, 0, -size * 0.92);
      ctx.bezierCurveTo(size * 0.55, -size * 1.0, size * 0.62, -size * 0.25, 0, 0);
      ctx.fillStyle = hsla(color, 0.1);
      ctx.fill();
      ctx.strokeStyle = hsla(color, 0.58);
      ctx.lineWidth = 0.55;
      ctx.stroke();
    }
    ctx.fillStyle = hsla(OCHRE, 0.8);
    for (let i = 0; i < 5; i++) {
      const a = (Math.PI * 2 * i) / 5;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * size * 0.2, Math.sin(a) * size * 0.2, 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBud(x, y, angle, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(size * 0.35, -size * 0.5, size * 0.95, -size * 0.3, size * 1.15, 0);
    ctx.bezierCurveTo(size * 0.95, size * 0.3, size * 0.35, size * 0.5, 0, 0);
    ctx.fillStyle = hsla(ROSE, 0.16);
    ctx.fill();
    ctx.strokeStyle = hsla(ROSE, 0.6);
    ctx.lineWidth = 0.55;
    ctx.stroke();
    ctx.strokeStyle = hsla(SAGE, 0.6);
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(size * 0.25, s * size * 0.45, size * 0.55, s * size * 0.3);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBerries(x, y, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    const n = Math.floor(random(2, 5));
    for (let i = 0; i < n; i++) {
      const a = random(-1.1, 1.1);
      const len = random(5, 10);
      const bx = Math.cos(a) * len;
      const by = Math.sin(a) * len;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(bx * 0.5, by * 0.2, bx, by);
      ctx.strokeStyle = hsla(INK, 0.35);
      ctx.lineWidth = 0.4;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(bx, by, random(1.3, 2), 0, Math.PI * 2);
      ctx.fillStyle = hsla(chance(0.5) ? ROSE : OCHRE, 0.22);
      ctx.fill();
      ctx.strokeStyle = hsla(INK, 0.45);
      ctx.stroke();
    }
    ctx.restore();
  }

  function finish(v) {
    const size = 4 + 3 * v.scale;
    if (v.ending === "flower") drawFlower(v.x, v.y, size);
    else if (v.ending === "bud") drawBud(v.x, v.y, v.angle, size * 0.9);
    else if (v.ending === "berries") drawBerries(v.x, v.y, v.angle);
  }

  function sampleAngle(i) {
    const { samples } = logo;
    const a = samples[Math.max(0, i - 2)];
    const b = samples[Math.min(samples.length - 1, i + 2)];
    if (a.stroke !== b.stroke) return sampleAngle(a.stroke === samples[i].stroke ? i - 1 : i + 1);
    return Math.atan2(b.y - a.y, b.x - a.x);
  }

  // Ornaments that close each stroke of the monogram.
  function finishLogoStroke(strokeIndex, i) {
    const end = logo.samples[i];
    const angle = sampleAngle(i);
    const size = clamp(logo.scale * 22, 3.5, 6);
    if (strokeIndex === 0) {
      const start = logo.samples.find(s => s.stroke === 0);
      drawBud(start.x, start.y, sampleAngle(0) + Math.PI, size);
    } else if (strokeIndex === 1) {
      drawTendril(end.x, end.y, angle, logo.scale, chance(0.5) ? 1 : -1);
    } else {
      drawFlower(end.x, end.y, size * 0.8, ROSE);
    }
  }

  // A hairline that runs on from a stroke's end and winds into a spiral.
  function drawTendril(x, y, angle, scale, curl) {
    const steps = Math.round(90 * scale);
    ctx.strokeStyle = hsla(INK, 0.55);
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const nx = x + Math.cos(angle) * 0.9;
      const ny = y + Math.sin(angle) * 0.9;
      ctx.lineWidth = Math.max(0.25, logo.width * 0.6 * (1 - t));
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      x = nx;
      y = ny;
      angle += curl * (0.005 + 0.2 * t * t);
    }
  }

  // Writes the monogram up to the current progress with a soft, pressure-like stroke.
  function drawLogo() {
    const { samples, sprouts, total } = logo;
    const target = logoProgress * total;
    const previousCtx = ctx;
    ctx = logoCtx;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "hsl(30, 7%, 24%)";
    while (logoIndex < samples.length && samples[logoIndex].s <= target) {
      const p = samples[logoIndex];
      if (!p.first) {
        const q = samples[logoIndex - 1];
        const ends = clamp(Math.min(p.local + 3, p.length - p.local + 3) / 12, 0.3, 1);
        const pressure = 0.82 + 0.18 * Math.sin(p.local * 0.045 + p.stroke * 2);
        ctx.lineWidth = logo.width * ends * pressure;
        ctx.beginPath();
        ctx.moveTo(q.x, q.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      while (sprouts.length && sprouts[0].s <= p.s) {
        const sprout = sprouts.shift();
        drawLeaf(p.x, p.y, sampleAngle(logoIndex), clamp(logo.scale * 26, 4, 7), sprout.side);
        ctx.strokeStyle = "hsl(30, 7%, 24%)";
      }
      const next = samples[logoIndex + 1];
      if (!next || next.stroke !== p.stroke) {
        finishLogoStroke(p.stroke, logoIndex);
        ctx.strokeStyle = "hsl(30, 7%, 24%)";
      }
      logoIndex++;
    }
    ctx = previousCtx;
  }

  function steer(v, step) {
    const t = v.life / v.maxLife;
    v.retarget -= step;
    if (v.retarget <= 0) {
      v.targetK = random(-0.022, 0.022);
      v.retarget = random(40, 90);
    }
    // The last stretch winds into a tightening spiral, like a tendril.
    if (t > 0.8 && v.ending === "none") {
      v.targetK = v.curl * (0.04 + (t - 0.8) * 0.9);
    }
    v.k += (v.targetK - v.k) * 0.03 * step;

    // Prefer a horizontal drift, and turn back before the top or bottom edge.
    const heading = Math.cos(v.angle) >= 0 ? 0 : Math.PI;
    let pull = wrapAngle(heading - v.angle) * 0.0035;
    const margin = Math.min(height * 0.3, 80);
    if (v.y < margin) pull += wrapAngle(Math.PI / 2 - v.angle) * 0.03 * (1 - v.y / margin);
    if (v.y > height - margin) pull += wrapAngle(-Math.PI / 2 - v.angle) * 0.03 * (1 - (height - v.y) / margin);

    // Bend away from the monogram's clearing.
    const depth = clearingDepth(v.x, v.y);
    if (depth < 2.2) {
      const away = Math.atan2(v.y - logo.cy, v.x - logo.cx);
      pull += wrapAngle(away - v.angle) * 0.045 * (2.2 - depth);
    }

    v.angle += (v.k + pull) * step;
  }

  function growVines(step) {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = vines.length - 1; i >= 0; i--) {
      const v = vines[i];
      const t = v.life / v.maxLife;
      const px = v.x;
      const py = v.y;
      steer(v, step);
      const speed = v.speed * (t > 0.8 ? 1 - (t - 0.8) * 2.2 : 1) * step;
      v.x += Math.cos(v.angle) * speed;
      v.y += Math.sin(v.angle) * speed;
      v.life += step;
      v.travelled += speed;

      const intruding = clearingDepth(v.x, v.y) < 1;
      if (!intruding) {
        // Swell in, then taper to a hairline.
        const taper = Math.pow(Math.min(1, v.life / 45), 1.5) * Math.pow(1 - t, 0.75);
        ctx.strokeStyle = hsla(INK, 0.14 + 0.42 * taper);
        ctx.lineWidth = Math.max(0.2, v.baseWidth * taper);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(v.x, v.y);
        ctx.stroke();

        if (v.travelled >= v.nextLeaf && t > 0.06 && t < 0.78) {
          drawLeaf(v.x, v.y, v.angle, (6 + 7 * (1 - t)) * v.scale, v.leafSide);
          v.leafSide *= -1;
          v.nextLeaf = v.travelled + random(16, 30) * v.scale;
        }

        if (v.generation < 2 && t > 0.15 && t < 0.6 && chance(0.006 * step)) {
          const side = chance(0.5) ? 1 : -1;
          const child = makeVine(v.x, v.y, v.angle + side * random(0.5, 0.95), v.scale * random(0.5, 0.7), v.generation + 1);
          child.curl = side;
          addVine(child);
        }
      }

      const outside = v.x < -30 || v.x > width + 30 || v.y < -30 || v.y > height + 30;
      if (v.life >= v.maxLife || outside || intruding) {
        if (!outside && !intruding) finish(v);
        vines.splice(i, 1);
      }
    }
  }

  function startCycle(auto) {
    phase = "grow";
    autoplay = auto;
    ink = 0;
    budget = clamp(Math.round((width * height) / areaPerSeed), 8, 30);
    density = new Map();
    lastSeedAt = clock;
    nextAuto = clock;
  }

  // Spends one unit of the cycle's ink; returns false once the banner is full.
  function seed(x, y, angle, scale) {
    if (phase !== "grow" || ink >= budget) return false;
    const cell = `${Math.floor(x / cellSize)}:${Math.floor(y / cellSize)}`;
    const used = density.get(cell) || 0;
    if (used >= cellLimit) return false;
    density.set(cell, used + 1);
    ink++;
    lastSeedAt = clock;
    // Gestures over the clearing still count toward fullness but sprout no vine.
    if (clearingDepth(x, y) > 1.3) addVine(makeVine(x, y, angle, scale));
    return true;
  }

  function autoSeed() {
    const fromLeft = chance(0.5);
    const x = fromLeft ? random(width * 0.08, width * 0.42) : random(width * 0.58, width * 0.92);
    const angle = (fromLeft ? 0 : Math.PI) + random(-0.5, 0.5);
    seed(x, random(height * 0.15, height * 0.8), angle, random(0.85, 1.15));
  }

  function update(delta) {
    const step = Math.min(delta / 16.667, 2);
    clock += delta;

    if (logoProgress < 1 && clock >= logoDelay) {
      logoProgress = Math.min(1, logoProgress + delta / logoDuration);
      drawLogo();
      composite();
    }

    if (phase === "rest") {
      if (clock >= phaseUntil) startCycle(true);
      return;
    }

    if (phase === "grow") {
      if (autoplay && ink < budget * 0.45 && clock >= nextAuto) {
        autoSeed();
        nextAuto = clock + random(450, 950);
      }
      const settling = ink >= budget || clock - lastSeedAt > settleAfter;
      growVines(step);
      if (settling && vines.length === 0) {
        phase = "hold";
        phaseUntil = clock + holdDuration;
      }
      return;
    }

    if (phase === "hold") {
      if (clock >= phaseUntil) {
        phase = "fade";
        phaseUntil = clock + fadeDuration;
      }
      return;
    }

    // Dissolve: erase a little of the vines each frame, then clear their layer.
    vineCtx.save();
    vineCtx.globalCompositeOperation = "destination-out";
    vineCtx.fillStyle = `rgba(0, 0, 0, ${1 - Math.pow(0.968, step)})`;
    vineCtx.fillRect(0, 0, width, height);
    vineCtx.restore();
    if (clock >= phaseUntil) {
      vineCtx.clearRect(0, 0, width, height);
      composite();
      phase = "rest";
      phaseUntil = clock + restDuration;
    }
  }

  function tick(time) {
    const delta = lastTime ? Math.min(time - lastTime, 34) : 16.667;
    lastTime = time;
    if (visible) {
      update(delta);
      if (phase === "grow" || phase === "fade") composite();
    }
    window.requestAnimationFrame(tick);
  }

  // The canvas sits behind the text, so gestures are read from the whole page.
  function localPoint(event) {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return x >= 0 && y >= 0 && x <= rect.width && y <= rect.height ? { x, y } : null;
  }

  // A gesture lays a vine along its own direction of travel.
  window.addEventListener("pointermove", event => {
    const p = localPoint(event);
    if (!p) {
      lastPointer = null;
      return;
    }
    if (phase === "rest") startCycle(false);
    if (!lastPointer) {
      lastPointer = p;
      return;
    }
    const dx = p.x - lastPointer.x;
    const dy = p.y - lastPointer.y;
    if (Math.hypot(dx, dy) > 46) {
      seed(p.x, p.y, Math.atan2(dy, dx) + random(-0.35, 0.35), random(0.6, 0.95));
      lastPointer = p;
    }
  });

  window.addEventListener("pointerdown", event => {
    const p = localPoint(event);
    if (!p) return;
    if (phase === "rest") startCycle(false);
    if (phase !== "grow" || ink >= budget) return;
    if (clearingDepth(p.x, p.y) > 1.3) drawFlower(p.x, p.y, random(6, 8), ROSE);
    const offset = random(0, Math.PI * 2);
    for (let i = 0; i < 3; i++) {
      seed(p.x + random(-1, 1), p.y + random(-1, 1), offset + (Math.PI * 2 * i) / 3 + random(-0.3, 0.3), random(0.7, 0.95));
    }
    lastPointer = p;
  });

  document.documentElement.addEventListener("pointerleave", () => { lastPointer = null; });

  window.addEventListener("resize", () => window.requestAnimationFrame(resize));
  document.addEventListener("visibilitychange", () => { lastTime = 0; });

  // Pause the simulation while the banner is scrolled out of view.
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(entries => { visible = entries[0].isIntersecting; }).observe(canvas);
  }

  resize();
  startCycle(true);

  if (reducedMotion) {
    // Grow one still composition, then stop before it would dissolve.
    for (let i = 0; i < 3000 && phase === "grow"; i++) update(16.667);
    composite();
    return;
  }
  window.requestAnimationFrame(tick);
})();
