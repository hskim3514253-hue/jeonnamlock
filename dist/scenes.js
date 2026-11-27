/* Scroll scenes for the homepage: header tone, mobile menu, hero lenses, the diamond that opens onto
   the door photo, the consultation steps and the stories carousel. Without this script (or with
   reduced motion) the page keeps the `no-motion` class and every scene shows its finished state. */
(() => {
  const body = document.body;
  if (!body.classList.contains('pb')) return;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const lerp = (from, to, t) => from + (to - from) * t;
  const ease = t => t * t * (3 - 2 * t);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const motion = !reduced.matches;
  if (motion) body.classList.remove('no-motion');

  /* Header: tone follows the section under it; menu for phones */
  const header = $('.pb-header'), burger = $('.pb-burger'), menu = $('#pb-menu');
  const toned = $$('main > section, footer.pb-footer');
  function setTone() {
    const line = header.getBoundingClientRect().height / 2;
    let tone = 'dark';
    for (const section of toned) {
      const box = section.getBoundingClientRect();
      if (box.top <= line && box.bottom > line) { tone = section.dataset.tone || 'light'; break; }
    }
    if (header.dataset.tone !== tone) header.dataset.tone = tone;
  }
  function setMenu(open) {
    body.classList.toggle('menu-open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
  }
  burger.addEventListener('click', () => setMenu(burger.getAttribute('aria-expanded') !== 'true'));
  menu.addEventListener('click', event => { if (event.target.closest('a')) setMenu(false); });
  addEventListener('keydown', event => { if (event.key === 'Escape' && body.classList.contains('menu-open')) { setMenu(false); burger.focus(); } });
  matchMedia('(min-width: 992px)').addEventListener('change', () => setMenu(false));

  /* The closing call to action lands on the door-photo upload */
  $$('[data-photo-quote]').forEach(link => link.addEventListener('click', () => setTimeout(() => $('#door-photos')?.focus({ preventScroll: true }), 700)));

  /* Lines rise when their block enters the view */
  const reveal = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-in'); reveal.unobserve(entry.target); } }), { threshold: 0.35 });
  $$('.pb-open-lead, .pb-final').forEach(node => reveal.observe(node));
  requestAnimationFrame(() => requestAnimationFrame(() => $('.pb-hero').classList.add('is-in')));

  /* Hero lenses: two glass discs refracting the gradient behind them */
  const hero = $('.pb-hero'), canvas = $('.pb-lens');
  let drawLens = null;
  (() => {
    const gl = canvas && canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
    if (!gl) return;
    const vertex = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
    const fragment = `precision highp float;
uniform vec2 uR;uniform vec3 uA;uniform vec3 uB;
vec3 grad(float y){
  vec3 c=mix(vec3(.095,.052,.028),vec3(.23,.14,.085),smoothstep(-.05,.34,y));
  c=mix(c,vec3(.6,.42,.27),smoothstep(.3,.6,y));
  c=mix(c,vec3(.86,.74,.59),smoothstep(.56,.78,y));
  return mix(c,vec3(.955,.915,.85),smoothstep(.76,1.02,y));}
vec3 sceneA(vec2 p){
  vec3 col=grad(p.y/uR.y);
  vec2 d=p-uA.xy;float r=length(d)/uA.z;float aa=1.5/uA.z;
  float inside=1.-smoothstep(1.-aa,1.+aa,r);
  float m=mix(.42,.7,r*r);
  vec3 lens=grad((uA.y+d.y*m)/uR.y)*mix(vec3(.96,.88,.79),vec3(1.),.35);
  float down=clamp(d.y/uA.z,0.,1.);
  lens*=1.-.34*smoothstep(.8,1.,r)*down;
  float rim=smoothstep(1.-6.*aa,1.-aa,r)*inside;
  lens+=rim*mix(vec3(.2,.11,.05),vec3(.8,.64,.46),clamp(.5-d.y/uA.z*.6+d.x/uA.z*.4,0.,1.))*.55;
  return mix(col,lens,inside);}
void main(){
  vec2 p=vec2(gl_FragCoord.x,uR.y-gl_FragCoord.y);
  vec3 col=sceneA(p);
  vec2 d=p-uB.xy;float r=length(d)/uB.z;float aa=1.5/uB.z;
  float inside=1.-smoothstep(1.-aa,1.+aa,r);
  if(inside>0.){
    float bend=.2*pow(r,3.);
    vec2 q=p+d*bend;vec2 ca=d*.014*pow(r,6.);
    vec3 lens=vec3(sceneA(q+ca).r,sceneA(q).g,sceneA(q-ca).b);
    lens=mix(lens,vec3(.975,.945,.9),.1+.12*(1.-r));
    float up=clamp(-d.y/uB.z,0.,1.);
    float rim=smoothstep(1.-2.4*aa,1.-.6*aa,r);
    lens+=rim*vec3(.87,.75,.6)*(.2+.8*up);
    lens+=smoothstep(.9,1.,r)*up*.1;
    col=mix(col,lens,inside);}
  gl_FragColor=vec4(col,1.);}`;
    const compile = (type, source) => { const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader); return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null; };
    const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment);
    if (!vs || !fs) return;
    const program = gl.createProgram(); gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const at = gl.getAttribLocation(program, 'p'); gl.enableVertexAttribArray(at); gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
    const uR = gl.getUniformLocation(program, 'uR'), uA = gl.getUniformLocation(program, 'uA'), uB = gl.getUniformLocation(program, 'uB');
    drawLens = seconds => {
      const ratio = Math.min(devicePixelRatio || 1, 1.5);
      const width = Math.round(canvas.clientWidth * ratio), height = Math.round(canvas.clientHeight * ratio);
      if (!width || !height) return;
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; gl.viewport(0, 0, width, height); }
      const narrow = width / height < 0.85, away = clamp(scrollY / innerHeight, 0, 1.2) * height;
      const sway = Math.sin(seconds * 0.27), bob = Math.cos(seconds * 0.21);
      const a = narrow ? [1.05 * width, 0.2 * height, 1.25 * width] : [0.5 * width, 0.08 * height, 0.427 * width];
      const b = narrow ? [1.0 * width, 1.22 * height, 1.15 * width] : [0.5 * width, 1.232 * height, 0.4 * width];
      gl.uniform2f(uR, width, height);
      gl.uniform3f(uA, a[0] + sway * 0.012 * width, a[1] + bob * 0.012 * height - away * 0.12, a[2]);
      gl.uniform3f(uB, b[0] - sway * 0.016 * width, b[1] - bob * 0.014 * height - away * 0.34, b[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      canvas.classList.add('is-live');
    };
  })();
  let heroVisible = true;
  new IntersectionObserver(entries => { heroVisible = entries[0].isIntersecting; }).observe(hero);
  function lensLoop(now) { if (heroVisible && !document.hidden) drawLens(now / 1000); requestAnimationFrame(lensLoop); }
  if (drawLens) { if (motion) requestAnimationFrame(lensLoop); else drawLens(0); addEventListener('resize', () => { if (!motion) drawLens(0); }); }

  /* Steps: build the cylinder once (it also stands still when motion is reduced) */
  const cylinder = $('.pb-cyl-body'), ring = $('.pb-ring');
  function buildCylinder() {
    const depth = ring.clientWidth * 0.2, count = 22;
    cylinder.replaceChildren(...Array.from({ length: count }, (_, i) => { const slice = document.createElement('i'); slice.style.setProperty('--z', (i * depth / count).toFixed(1)); if (i > count - 7 && i < count - 1) slice.className = 'is-band'; return slice; }));
    cylinder.style.setProperty('--top', depth.toFixed(1));
  }
  buildCylinder();
  addEventListener('resize', buildCylinder);

  /* Carousel */
  const track = $('#story-track'), previous = $('#story-prev'), next = $('#story-next');
  const stepWidth = () => { const card = $('.pb-story', track); return card.getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap || 0); };
  const syncArrows = () => { previous.disabled = track.scrollLeft < 8; next.disabled = track.scrollLeft > track.scrollWidth - track.clientWidth - 8; };
  const slide = direction => track.scrollBy({ left: direction * stepWidth(), behavior: motion ? 'smooth' : 'auto' });
  previous.addEventListener('click', () => slide(-1)); next.addEventListener('click', () => slide(1));
  track.addEventListener('keydown', event => { if (event.key === 'ArrowRight') { event.preventDefault(); slide(1); } if (event.key === 'ArrowLeft') { event.preventDefault(); slide(-1); } });
  track.addEventListener('scroll', syncArrows, { passive: true }); addEventListener('resize', syncArrows); syncArrows();
  let drag = null;
  track.addEventListener('pointerdown', event => { if (event.pointerType === 'mouse' && event.button === 0) drag = { x: event.clientX, left: track.scrollLeft, moved: false }; });
  addEventListener('pointermove', event => { if (!drag) return; const delta = event.clientX - drag.x; if (Math.abs(delta) > 6) { drag.moved = true; track.classList.add('is-dragging'); track.style.scrollSnapType = 'none'; } if (drag.moved) track.scrollLeft = drag.left - delta; });
  addEventListener('pointerup', () => { if (!drag) return; const moved = drag.moved; drag = null; track.style.scrollSnapType = ''; if (moved) { track.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); }, { capture: true, once: true }); setTimeout(() => track.classList.remove('is-dragging'), 0); } });

  /* Picture-rail gallery: its script is only fetched when the section comes near */
  const rail = $('#rail-gallery');
  if (rail && 'attachShadow' in rail && 'adoptedStyleSheets' in document) {
    const loadRail = new IntersectionObserver(entries => { if (!entries.some(entry => entry.isIntersecting)) return; loadRail.disconnect(); const script = document.createElement('script'); script.src = '/rail-gallery.js'; document.head.append(script); }, { rootMargin: '900px 0px' });
    loadRail.observe(rail);
  }

  if (!motion) { setTone(); addEventListener('scroll', setTone, { passive: true }); return; }

  /* Scroll-driven scenes */
  const open = $('.pb-open'), lead = $('.pb-open-lead'), scene = $('.pb-open-scene'), door = $('.pb-door'), doorImage = $('.pb-door-wood'), tilt = $('.pb-door-tilt');
  // The pointer leans the door a little; the scroll decides everything else.
  const lean = { x: 0, y: 0 };
  if (matchMedia('(hover:hover) and (pointer:fine)').matches) {
    scene.addEventListener('pointermove', event => { lean.x = event.clientX / innerWidth - 0.5; lean.y = event.clientY / innerHeight - 0.5; request(); });
    scene.addEventListener('pointerleave', () => { lean.x = 0; lean.y = 0; request(); });
  }
  const steps = $('.pb-steps'), panels = $$('.pb-step-panel'), items = $$('.pb-step-list li'), arc = $('.pb-ring-arc');
  const progress = section => { const box = section.getBoundingClientRect(); return clamp(-box.top / (box.height - innerHeight)); };
  function diamond(cx, cy, half) {
    const round = Math.min(half * 0.24, 130), k = round * Math.SQRT1_2;
    const top = [cx, cy - half], right = [cx + half, cy], bottom = [cx, cy + half], left = [cx - half, cy];
    const f = n => n.toFixed(1);
    return `path('M${f(top[0] - k)} ${f(top[1] + k)}Q${f(top[0])} ${f(top[1])} ${f(top[0] + k)} ${f(top[1] + k)}L${f(right[0] - k)} ${f(right[1] - k)}Q${f(right[0])} ${f(right[1])} ${f(right[0] - k)} ${f(right[1] + k)}L${f(bottom[0] + k)} ${f(bottom[1] - k)}Q${f(bottom[0])} ${f(bottom[1])} ${f(bottom[0] - k)} ${f(bottom[1] - k)}L${f(left[0] + k)} ${f(left[1] + k)}Q${f(left[0])} ${f(left[1])} ${f(left[0] + k)} ${f(left[1] - k)}Z')`;
  }
  let lastStep = -1;
  function frame() {
    ticking = false;
    setTone();
    const width = innerWidth, height = innerHeight;
    const p = progress(open), t = clamp(p / 0.37), grow = ease(t);
    const cover = (width + height) / 2 + 100;
    const centerY = lerp(height * 1.02, height * 0.5, ease(t)), half = cover * Math.pow(grow, 1.05);
    scene.style.clipPath = t >= 1 ? 'none' : diamond(width / 2, centerY, half);
    // The photo sits on its own layer, so it carries the same window in its own coordinates.
    const doorBox = door.getBoundingClientRect(), stageTop = scene.getBoundingClientRect().top;
    door.style.clipPath = t >= 1 ? 'none' : diamond(width / 2 - doorBox.left, centerY + stageTop - doorBox.top, half);
    doorImage.style.setProperty('--zoom', lerp(1.32, 1.06, ease(clamp(p / 0.5))).toFixed(3));
    // The lock rises into place on the door while the camera pulls back.
    const q = ease(clamp((p - 0.16) / 0.3));
    tilt.style.setProperty('--show', clamp((p - 0.16) / 0.14).toFixed(3));
    tilt.style.setProperty('--rise', `${(doorBox.height * 0.09 * (1 - q)).toFixed(1)}px`);
    tilt.style.setProperty('--grow', lerp(1.1, 1, q).toFixed(3));
    tilt.style.setProperty('--px', `${(lean.x * 14).toFixed(1)}px`);
    tilt.style.setProperty('--py', `${(lean.y * 10).toFixed(1)}px`);
    lead.style.transform = `translate3d(0,${(-t * height * 0.09).toFixed(1)}px,0)`;
    lead.style.opacity = (1 - clamp((t - 0.45) / 0.35)).toFixed(3);
    open.classList.toggle('is-open', p > 0.4);
    const openBox = open.getBoundingClientRect();
    body.classList.toggle('float-away', openBox.top < height * 0.4 && openBox.bottom > height * 0.9);

    const s = progress(steps), index = Math.min(panels.length - 1, Math.floor(s * panels.length));
    arc.style.setProperty('--arc', (4 + s * 96).toFixed(1));
    cylinder.style.setProperty('--rx', `${(58 - 10 * Math.sin(s * Math.PI * 2)).toFixed(1)}deg`);
    cylinder.style.setProperty('--rz', `${(-28 + s * 300).toFixed(1)}deg`);
    cylinder.style.setProperty('--key', `${(s * 360).toFixed(1)}deg`);
    if (index !== lastStep) { lastStep = index; panels.forEach((panel, i) => panel.classList.toggle('is-active', i === index)); items.forEach((item, i) => item.classList.toggle('is-active', i === index)); }
  }
  let ticking = false;
  const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
  addEventListener('scroll', request, { passive: true }); addEventListener('resize', request);
  items.forEach((item, i) => item.addEventListener('click', () => { const box = steps.getBoundingClientRect(); scrollTo({ top: scrollY + box.top + (box.height - innerHeight) * ((i + 0.5) / items.length), behavior: 'smooth' }); }));
  frame();
})();
