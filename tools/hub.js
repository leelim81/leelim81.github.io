/* The desk. Tools are rendered from tools.json — append one there to add a card.
   Hero wash is a tiny cursor-reactive WebGL shader. It stays off for touch,
   data-saver, and reduced motion. */
(function () {
  var ICONS = {
    pen: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M6 26l4.2-1.2L24 11.2 20.8 8 7.2 21.6 6 26z"/><path d="M18.6 10.2l3.2 3.2"/><path d="M8 24c2.2.4 3.6 1.2 4.4 3"/></svg>',
    press: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="6" y="8" width="20" height="16"/><path d="M10 12h12M10 16h12M10 20h7"/><path d="M4 6l2 2M28 6l-2 2M4 26l2-2M28 26l-2-2"/></svg>',
    bind: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M9 7h12v18H9z"/><path d="M12 5h12v18"/><path d="M15 3h12v18"/><path d="M12 13h6M12 17h6"/></svg>',
    dot: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="16" cy="16" r="5"/></svg>'
  };

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  function sheet(tool, index) {
    var a = document.createElement('a');
    a.className = 'sheet';
    a.href = tool.href;
    a.style.animationDelay = (index * 70) + 'ms';
    var icon = document.createElement('span');
    icon.className = 'sheet-icon';
    icon.innerHTML = ICONS[tool.icon] || ICONS.dot;
    var copy = document.createElement('span');
    var kick = document.createElement('span');
    kick.className = 'sheet-kicker';
    kick.textContent = tool.kicker || String(index + 1).padStart(2, '0');
    var h2 = document.createElement('h2');
    h2.textContent = tool.name;
    var p = document.createElement('p');
    p.textContent = tool.description;
    copy.append(kick, h2, p);
    var go = document.createElement('span');
    go.className = 'sheet-go';
    go.setAttribute('aria-hidden', 'true');
    go.textContent = '→';
    a.append(icon, copy, go);
    if (fine && !reduce) {
      a.addEventListener('pointermove', function (e) {
        var r = a.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        a.style.setProperty('--ry', (px * 7).toFixed(2) + 'deg');
        a.style.setProperty('--rx', (-py * 6).toFixed(2) + 'deg');
      });
      a.addEventListener('pointerleave', function () {
        a.style.setProperty('--ry', '0deg');
        a.style.setProperty('--rx', '0deg');
      });
    }
    return a;
  }

  function chapter(tool, index) {
    var art = document.createElement('article');
    art.className = 'chapter';
    var num = document.createElement('div');
    num.className = 'ch-num';
    num.textContent = String(index + 1).padStart(2, '0');
    var body = document.createElement('div');
    var h2 = document.createElement('h2');
    h2.textContent = tool.chapter || tool.name;
    var p = document.createElement('p');
    p.textContent = tool.line || tool.description;
    var link = document.createElement('a');
    link.href = tool.href;
    link.textContent = 'Open ' + tool.name;
    body.append(h2, p, link);
    art.append(num, body);
    return art;
  }

  function render(data) {
    var tools = (data && data.tools) || [];
    var mount = document.getElementById('tools');
    var story = document.getElementById('story');
    mount.replaceChildren();
    story.replaceChildren();
    if (!tools.length) {
      mount.textContent = 'No tools are listed yet.';
      return;
    }
    tools.forEach(function (tool, i) {
      mount.appendChild(sheet(tool, i));
      story.appendChild(chapter(tool, i));
    });
    watchChapters();
    if (window.ToolsUsage) ToolsUsage.showHub(document.getElementById('usage'), tools);
  }

  function watchChapters() {
    if (reduce || !('IntersectionObserver' in window)) {
      document.querySelectorAll('.chapter').forEach(function (el) { el.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) entry.target.classList.add('in');
      });
    }, { threshold: 0.45 });
    document.querySelectorAll('.chapter').forEach(function (el) { io.observe(el); });
  }

  fetch('tools.json')
    .then(function (res) { if (!res.ok) throw new Error('bad list'); return res.json(); })
    .then(render)
    .catch(function () {
      document.getElementById('tools').textContent = 'The tool list could not be loaded.';
      if (window.ToolsUsage) ToolsUsage.showHub(document.getElementById('usage'), []);
    });

  var rule = document.querySelector('.scroll-rule');
  function onScroll() {
    var max = document.documentElement.scrollHeight - window.innerHeight;
    var p = max > 0 ? window.scrollY / max : 0;
    rule.style.transform = 'scaleX(' + p + ')';
  }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  function initCursor() {
    if (!fine || reduce) return;
    document.body.classList.add('has-cursor');
    var dot = document.querySelector('.cursor');
    var ring = document.querySelector('.cursor-ring');
    var x = window.innerWidth / 2;
    var y = window.innerHeight / 2;
    var rx = x;
    var ry = y;
    var visible = false;
    window.addEventListener('pointermove', function (e) {
      x = e.clientX;
      y = e.clientY;
      visible = true;
      dot.style.transform = 'translate(' + x + 'px,' + y + 'px)';
      var hot = e.target.closest && e.target.closest('a, button');
      document.body.classList.toggle('cursor-hot', !!hot);
    });
    window.addEventListener('pointerleave', function () { visible = false; });
    function loop() {
      rx += (x - rx) * 0.18;
      ry += (y - ry) * 0.18;
      ring.style.transform = 'translate(' + rx + 'px,' + ry + 'px)';
      ring.style.opacity = visible ? '1' : '0';
      dot.style.opacity = visible ? '1' : '0';
      requestAnimationFrame(loop);
    }
    loop();
  }
  initCursor();

  function initWash() {
    var canvas = document.getElementById('wash');
    if (!canvas) return;
    var coarse = window.matchMedia('(pointer: coarse)').matches;
    var saveData = navigator.connection && navigator.connection.saveData;
    if (coarse || saveData) { canvas.remove(); return; }
    var gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
    if (!gl) { canvas.remove(); return; }
    var vs = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}';
    var fs = [
      'precision mediump float;',
      'uniform vec2 uRes, uMouse;',
      'uniform float uTime, uNight;',
      'void main(){',
      '  vec2 uv = gl_FragCoord.xy / uRes;',
      '  vec2 m = uMouse;',
      '  float d = distance(uv, m);',
      '  float wash = smoothstep(0.62, 0.0, d);',
      '  float vein = sin(uv.x * 9.0 + uTime * 0.12 + uv.y * 4.0) * 0.5 + 0.5;',
      '  float fiber = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);',
      '  vec3 paper = mix(vec3(0.953, 0.933, 0.894), vec3(0.071, 0.063, 0.055), uNight);',
      '  vec3 ink = mix(vec3(0.102, 0.086, 0.071), vec3(0.953, 0.933, 0.894), uNight);',
      '  vec3 wax = vec3(0.761, 0.231, 0.133);',
      '  vec3 col = paper;',
      '  col = mix(col, ink, fiber * 0.035);',
      '  col = mix(col, mix(ink, wax, 0.42), wash * (0.28 + vein * 0.14));',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('');
    function shader(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    }
    var prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.remove(); return; }
    gl.useProgram(prog);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var uRes = gl.getUniformLocation(prog, 'uRes');
    var uMouse = gl.getUniformLocation(prog, 'uMouse');
    var uTime = gl.getUniformLocation(prog, 'uTime');
    var uNight = gl.getUniformLocation(prog, 'uNight');
    var mouse = { x: 0.3, y: 0.58 };
    var target = { x: 0.3, y: 0.58 };
    window.addEventListener('pointermove', function (e) {
      target.x = e.clientX / window.innerWidth;
      target.y = 1 - e.clientY / window.innerHeight;
    });
    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      var w = Math.min(window.innerWidth, 1440);
      var h = Math.min(window.innerHeight, 900);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    resize();
    window.addEventListener('resize', resize);
    var start = performance.now();
    var running = true;
    document.addEventListener('visibilitychange', function () {
      running = !document.hidden;
      if (running) requestAnimationFrame(frame);
    });
    function draw(now) {
      mouse.x += (target.x - mouse.x) * 0.06;
      mouse.y += (target.y - mouse.y) * 0.06;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.uniform1f(uTime, (now - start) / 1000);
      gl.uniform1f(uNight, document.documentElement.dataset.theme === 'night' ? 1 : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      canvas.classList.add('ready');
    }
    function frame(now) {
      if (!running) return;
      draw(now);
      if (!reduce) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  initWash();
})();
