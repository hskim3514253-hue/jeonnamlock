/* Scroll intro. The lock is a small 3D model built from stacked slices (body + raised
   handle) with the photographed front as its face, so it keeps its depth while turning.
   Everything is written through the CSSOM (no inline style attributes), so the page's
   Content-Security-Policy stays unchanged. */
(() => {
  'use strict';
  const section = document.querySelector('.lock-intro');
  if (!section || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const stage = section.querySelector('.lock-intro-stage');
  const door = section.querySelector('.intro-door');
  const photo = section.querySelector('.intro-door-photo');
  const caption = door.querySelector('figcaption');
  const lock = section.querySelector('.intro-lock');
  const face = lock.querySelector('.intro-lock-face');
  const copy = section.querySelector('.intro-copy');
  const lines = [...section.querySelectorAll('.intro-line')];
  const header = document.querySelector('.header');

  // Lock geometry on the door photo; keep in sync with .intro-lock in intro.css.
  const LOCK_X = 0.375, LOCK_Y = 0.5, LOCK_BOX = 0.88, SEATED = 0.659, RATIO = 299 / 1300;
  // Depth as a share of the lock's width: body, then the handle standing proud of it.
  const BODY_DEPTH = 0.3, HANDLE_DEPTH = 0.42, BODY_SLICES = 9, HANDLE_SLICES = 11;

  const clamp = value => Math.min(1, Math.max(0, value));
  const span = (value, from, to) => clamp((value - from) / (to - from));
  const mix = (from, to, amount) => from + (to - from) * amount;
  const inOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const out = t => 1 - Math.pow(1 - t, 3);
  const into = t => t * t * t;
  const grey = value => { const v = Math.round(value); return `rgb(${v},${v},${v + 1})`; };

  // Build the model once.
  const part = (className, tag = 'div') => { const node = document.createElement(tag); node.className = className; node.setAttribute('aria-hidden', 'true'); return node; };
  const shadow = part('lock-shadow');
  const bodySlices = Array.from({ length: BODY_SLICES }, (_, i) => { const node = part('lock-slice'); node.style.background = grey(mix(7, 24, i / (BODY_SLICES - 1))); return node; });
  const handleSlices = Array.from({ length: HANDLE_SLICES }, (_, i) => { const node = part('lock-slice lock-slice-handle'); node.style.background = grey(mix(18, 40, i / (HANDLE_SLICES - 1))); return node; });
  const sheen = part('lock-sheen');
  const handleFace = part('lock-handle-face', 'img');
  handleFace.alt = ''; handleFace.src = face.getAttribute('src');
  lock.prepend(shadow, ...bodySlices);
  lock.append(sheen, ...handleSlices, handleFace);

  // The scene, as keyframes over scroll progress. scale is a multiple of the opening size,
  // focus is the point of the lock (from its centre, in lock heights/widths) held at `at`
  // (from the stage centre, in stage widths/heights). The last keyframe is the seated lock.
  const SHOTS = [
    { p: 0.00, ry: 0,   rx: 0,  rz: 0,   scale: 1,    focus: [0, 0],     at: [0, 0] },
    { p: 0.05, ry: 0,   rx: 0,  rz: 0,   scale: 1,    focus: [0, 0],     at: [0, 0] },
    { p: 0.22, ry: -56, rx: 5,  rz: -5,  scale: 2.0,  focus: [0, -0.25], at: [0.05, 0] },
    { p: 0.34, ry: -30, rx: 8,  rz: -10, scale: 2.5,  focus: [0, -0.2],  at: [0.04, 0] },
    { p: 0.50, ry: 44,  rx: -7, rz: 9,   scale: 2.6,  focus: [0, 0.07],  at: [0.02, 0] },
    { p: 0.60, ry: 58,  rx: -4, rz: 4,   scale: 2.0,  focus: [0, 0.2],   at: [0.03, 0] },
    { p: 0.70, ry: -26, rx: 0,  rz: -22, scale: 1.3,  focus: [0, 0],     at: [0.15, 0] },
    { p: 0.86, seated: true }
  ];

  let layout = null, target = 0, shown = -1, frame = 0, drawn = 0;

  function measure() {
    const sticky = header && getComputedStyle(header).position === 'sticky';
    section.style.setProperty('--intro-top', (sticky ? Math.round(header.getBoundingClientRect().height) : 0) + 'px');
    let x = 0, y = 0;
    for (let node = door; node && node !== stage; node = node.offsetParent) { x += node.offsetLeft; y += node.offsetTop; }
    const width = stage.clientWidth, box = door.offsetHeight * LOCK_BOX, wide = box * RATIO;
    // Leave out space covered by the fixed mobile call bar.
    const height = stage.clientHeight - (parseFloat(getComputedStyle(stage).paddingBottom) || 0);
    const first = Math.min(height * 0.62, width * 0.6 / RATIO) / box;
    const seat = { x: x + door.offsetWidth * LOCK_X, y: y + door.offsetHeight * LOCK_Y };
    const narrow = width < 700 ? 0.4 : 1;
    layout = { seat, shots: SHOTS.map(shot => {
      if (shot.seated) return { p: shot.p, ry: 0, rx: 0, rz: 0, scale: SEATED, x: 0, y: 0 };
      const scale = first * (1 + (shot.scale - 1) * (width < 700 ? 0.8 : 1));
      const turn = shot.rz * Math.PI / 180;
      const fx = shot.focus[0] * wide * scale * Math.cos(shot.ry * Math.PI / 180), fy = shot.focus[1] * box * scale;
      return { p: shot.p, ry: shot.ry, rx: shot.rx, rz: shot.rz, scale,
        x: width / 2 + shot.at[0] * width * narrow - (fx * Math.cos(turn) - fy * Math.sin(turn)) - seat.x,
        y: height / 2 + shot.at[1] * height - (fx * Math.sin(turn) + fy * Math.cos(turn)) - seat.y };
    }) };
    // Depth of each slice, in layout pixels (the whole model is scaled as one).
    const body = wide * BODY_DEPTH, handle = wide * HANDLE_DEPTH;
    shadow.style.transform = 'translateZ(0)';
    bodySlices.forEach((node, i) => { node.style.transform = `translateZ(${(body * i / (BODY_SLICES - 1)).toFixed(2)}px)`; });
    face.style.transform = `translateZ(${(body + 0.2).toFixed(2)}px)`;
    sheen.style.transform = `translateZ(${(body + 0.4).toFixed(2)}px)`;
    handleSlices.forEach((node, i) => { node.style.transform = `translateZ(${(body + handle * (i + 1) / HANDLE_SLICES).toFixed(2)}px)`; });
    handleFace.style.transform = `translateZ(${(body + handle + 0.2).toFixed(2)}px)`;
  }

  function pose(p) {
    const shots = layout.shots;
    let index = 0;
    while (index < shots.length - 2 && p >= shots[index + 1].p) index++;
    const from = shots[index], to = shots[index + 1], raw = span(p, from.p, to.p);
    const t = index === shots.length - 2 ? into(raw) : inOut(raw);
    const result = {};
    for (const key of ['ry', 'rx', 'rz', 'scale', 'x', 'y']) result[key] = mix(from[key], to[key], t);
    return result;
  }

  function render(p) {
    const now = pose(p), s = now.scale.toFixed(4);
    lock.style.transform = `translate3d(${now.x.toFixed(1)}px,${now.y.toFixed(1)}px,0) perspective(2200px) rotateZ(${now.rz.toFixed(2)}deg) rotateX(${now.rx.toFixed(2)}deg) rotateY(${now.ry.toFixed(2)}deg) scale3d(${s},${s},${s})`;
    sheen.style.backgroundPositionX = (50 - now.ry * 1.1).toFixed(1) + '%';

    const seat = span(p, 0.7, 0.86);
    shadow.style.opacity = Math.pow(seat, 6).toFixed(3);
    const arrive = out(span(p, 0.62, 0.78));
    photo.style.opacity = arrive.toFixed(3);
    photo.style.transform = `translate3d(0,${((1 - arrive) * 36).toFixed(1)}px,0)`;
    caption.style.opacity = span(p, 0.86, 0.93).toFixed(3);

    const words = out(span(p, 0.86, 0.96));
    copy.style.opacity = words.toFixed(3);
    copy.style.transform = `translate3d(0,${((1 - words) * 18).toFixed(1)}px,0)`;
    copy.inert = words < 0.5;

    const windows = [[-1, -1, 0.03, 0.1], [0.14, 0.2, 0.3, 0.36], [0.4, 0.46, 0.56, 0.62]];
    lines.forEach((line, i) => {
      const [a, b, c, d] = windows[i] || windows[0];
      line.style.opacity = (Math.min(span(p, a, b), 1 - span(p, c, d))).toFixed(3);
    });
    section.classList.toggle('is-attached', p >= 0.86);
  }

  function tick() {
    frame = 0; drawn = performance.now();
    shown = shown < 0 ? target : shown + (target - shown) * 0.2;
    if (Math.abs(target - shown) < 0.0004) shown = target;
    render(shown);
    if (shown !== target) frame = requestAnimationFrame(tick);
  }
  function update() {
    const distance = section.offsetHeight - stage.offsetHeight;
    const top = parseFloat(section.style.getPropertyValue('--intro-top')) || 0;
    target = distance > 0 ? clamp((top - section.getBoundingClientRect().top) / distance) : 1;
    if (!frame) frame = requestAnimationFrame(tick);
    // Frames can stall in a background tab; never leave the scene behind the scroll position.
    setTimeout(() => { if (frame && performance.now() - drawn > 200) { cancelAnimationFrame(frame); shown = target; tick(); } }, 240);
  }
  function relayout() { measure(); shown = -1; update(); }

  section.classList.add('is-scripted');
  relayout();
  addEventListener('scroll', update, { passive: true });
  addEventListener('resize', relayout);
  addEventListener('load', relayout);
  for (const image of [photo, face]) if (!image.complete) image.addEventListener('load', relayout, { once: true });
})();
