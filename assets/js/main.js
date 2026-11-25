/* Inara Architects and Interiors: interaction and scroll engine.
   One rAF loop reads scroll position once per frame and writes CSS
   custom properties (--p, --py, --sc ...). CSS does the drawing. */
(function () {
  "use strict";
  var doc = document.documentElement;
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  doc.classList.add("js");
  if (reduce) doc.classList.add("rm");

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var vh = window.innerHeight, vw = window.innerWidth;
  var root = (document.body.getAttribute("data-root") || "");

  /* ---------- loader (once per session) ---------- */
  var seen = false;
  try { seen = sessionStorage.getItem("inara-seen") === "1"; sessionStorage.setItem("inara-seen", "1"); } catch (e) { seen = true; }
  if (!seen && !reduce) {
    var ld = document.createElement("div");
    ld.className = "loader";
    ld.setAttribute("aria-hidden", "true");
    ld.innerHTML = '<div class="lbox"><img class="lmark" src="' + root + 'assets/logo/mark-brown.png" alt="" width="84" height="100"><span class="lline"><i></i></span><span class="lword">Inara</span></div>';
    document.body.appendChild(ld);
    var drop = function () { ld.classList.add("out"); setTimeout(function () { ld.remove(); }, 1200); };
    var t0 = Date.now();
    window.addEventListener("load", function () { setTimeout(drop, Math.max(0, 1500 - (Date.now() - t0))); });
    setTimeout(drop, 3200); /* never block the page */
  }

  /* ---------- page transition veil ---------- */
  var veil = document.createElement("div");
  veil.className = "veil";
  veil.setAttribute("aria-hidden", "true");
  veil.innerHTML = '<img src="' + root + 'assets/logo/mark-white.png" alt="" width="60" height="71">';
  document.body.appendChild(veil);
  window.addEventListener("pageshow", function () { veil.classList.remove("in"); });
  if (!reduce) {
    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("a[href]");
      if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      var href = a.getAttribute("href");
      if (!href || href.charAt(0) === "#" || a.target === "_blank" || /^(mailto|tel|https?):/i.test(href)) return;
      if (href.indexOf("#") > -1 && a.pathname === location.pathname) return;
      e.preventDefault();
      veil.classList.add("in");
      setTimeout(function () { location.href = a.href; }, 560);
    });
  }

  /* ---------- header ---------- */
  var header = $(".site-header");
  var progress = document.createElement("div");
  progress.className = "progress";
  document.body.appendChild(progress);
  var lastY = window.scrollY;
  var darkZones = $$("[data-dark]");

  /* ---------- mobile drawer ---------- */
  var menuBtn = $(".menu-btn");
  if (menuBtn) {
    menuBtn.addEventListener("click", function () {
      var open = document.body.classList.toggle("menu-open");
      menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") document.body.classList.remove("menu-open"); });
  }

  /* ---------- split headings into words ---------- */
  $$("[data-split]").forEach(function (el) {
    var i = 0;
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(" ")); return; }
            var w = document.createElement("span"); w.className = "w";
            var s = document.createElement("span"); s.textContent = part; s.style.setProperty("--i", i++);
            w.appendChild(s); frag.appendChild(w);
          });
          n.parentNode.replaceChild(frag, n);
        } else if (n.nodeType === 1 && n.tagName !== "BR") { walk(n); }
      });
    })(el);
    el.classList.add("split");
  });

  /* ---------- in-view reveals ---------- */
  var revealEls = $$(".rv, .split, .wipe, [data-count]");
  function reveal(el) {
    if (el.classList.contains("in")) return;
    el.classList.add("in");
    if (el.hasAttribute("data-count")) countUp(el);
  }
  if ("IntersectionObserver" in window && !reduce) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) { reveal(en.target); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -10% 0px" });
    revealEls.forEach(function (el) { io.observe(el); });
  } else { revealEls.forEach(reveal); }
  setTimeout(function () { revealEls.forEach(function (el) { if (el.getBoundingClientRect().top < vh) reveal(el); }); }, 3500);

  function countUp(el) {
    var to = parseFloat(el.getAttribute("data-count")), suf = el.getAttribute("data-suffix") || "";
    if (reduce) { el.textContent = to + suf; return; }
    var st = null, dur = 1600;
    function step(t) {
      if (!st) st = t;
      var k = clamp((t - st) / dur, 0, 1), e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(to * e) + suf;
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ---------- scroll scenes ---------- */
  var scenes = $$("[data-scene]");
  var parallax = $$("[data-parallax]");
  var sCards = $$(".s-card");
  var pLine = $(".p-line"), pSteps = $$(".p-step");
  var scrubWords = $$(".scrub .sw");
  var xScene = $(".x-scene"), xTrack = $(".x-track"), xCount = $(".x-count");
  var zScene = $(".z-scene");

  function sceneProgress(el) {
    var r = el.getBoundingClientRect();
    var total = r.height - vh;
    return total > 0 ? clamp(-r.top / total, 0, 1) : clamp((vh - r.top) / (vh + r.height), 0, 1);
  }

  /* horizontal gallery: section height derived from track width */
  function sizeX() {
    if (!xScene || !xTrack) return;
    if (vw < 800 || reduce) { xScene.style.height = ""; return; }
    var max = Math.max(0, xTrack.scrollWidth - vw);
    xScene.style.setProperty("--xmax", max + "px");
    xScene.style.height = (vh + max) + "px";
  }

  /* zoom-through-the-I: fit the word, find the I */
  var zSvg = zScene && $(".z-mask", zScene), zText = zSvg && $("text", zSvg), zGroup = zSvg && $("g.zoom", zSvg), zOrigin = { x: 0, y: 0 };
  function sizeZ() {
    if (!zText) return;
    zSvg.setAttribute("viewBox", "0 0 " + vw + " " + vh);
    var mk = $("rect.mk", zSvg);
    mk.setAttribute("x", -vw); mk.setAttribute("y", -vh); mk.setAttribute("width", vw * 3); mk.setAttribute("height", vh * 3);
    var fs = Math.min(vw * 0.25, vh * 0.42);
    var cap = fs * 0.7, stemW = fs * 0.15, gap = fs * 0.11;
    zText.setAttribute("font-size", fs);
    zText.setAttribute("letter-spacing", fs * 0.02);
    var len = 0;
    try { len = zText.getComputedTextLength(); } catch (e) { len = fs * 2.6; }
    var total = stemW + gap + len, x0 = (vw - total) / 2, base = vh / 2 + cap / 2;
    var stem = $("rect.istem", zSvg);
    stem.setAttribute("x", x0); stem.setAttribute("y", base - cap); stem.setAttribute("width", stemW); stem.setAttribute("height", cap);
    zText.setAttribute("x", x0 + stemW + gap); zText.setAttribute("y", base);
    zOrigin = { x: x0 + stemW / 2, y: base - cap / 2 };
  }

  var ticking = false;
  function frame() {
    ticking = false;
    var y = window.scrollY, docH = doc.scrollHeight - vh;
    progress.style.setProperty("--sp", docH > 0 ? (y / docH).toFixed(4) : 0);

    /* header: solid after 40px, hides on scroll down */
    if (header) {
      header.classList.toggle("solid", y > 40 && !header.classList.contains("on-dark-lock"));
      var down = y > lastY + 4, up = y < lastY - 4;
      if (down && y > 400 && !document.body.classList.contains("menu-open")) header.classList.add("hide");
      if (up || y < 200) header.classList.remove("hide");
      var dark = false;
      darkZones.forEach(function (z) {
        var r = z.getBoundingClientRect();
        if (r.top <= 44 && r.bottom >= 44 && z.getAttribute("data-dark") !== "off") dark = true;
      });
      header.classList.toggle("on-dark", dark);
      if (dark) header.classList.remove("solid");
    }
    lastY = y;
    if (reduce) return;

    scenes.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.bottom < -vh || r.top > vh * 2) return;
      var p = sceneProgress(el);
      el.style.setProperty("--p", p.toFixed(4));
      var type = el.getAttribute("data-scene");
      if (type === "hero") el.setAttribute("data-dark", p > 0.32 ? "on" : "off");
      if (type === "zoom" && zGroup) {
        var z = clamp((p - 0.12) / 0.6, 0, 1), ez = z * z * z;
        var s = 1 + ez * 90;
        var kc = Math.min(1, z * 1.6), tx = zOrigin.x + (vw / 2 - zOrigin.x) * kc, ty = zOrigin.y + (vh / 2 - zOrigin.y) * kc;
        zGroup.setAttribute("transform", "translate(" + tx + " " + ty + ") scale(" + s + ") translate(" + -zOrigin.x + " " + -zOrigin.y + ")");
        el.style.setProperty("--z", z.toFixed(3));
        zSvg.style.opacity = z > 0.97 ? 0 : 1;
        el.setAttribute("data-dark", z > 0.6 ? "on" : "off");
      }
      if (type === "words" && scrubWords.length) {
        var lit = Math.floor(clamp((p - 0.05) / 0.8, 0, 1) * scrubWords.length);
        scrubWords.forEach(function (w, i) { w.classList.toggle("lit", i < lit); });
      }
      if (type === "x" && xCount) {
        var n = $$(".x-card", el).length;
        xCount.textContent = String(Math.min(n, 1 + Math.floor(p * n))).padStart(2, "0") + " / " + String(n).padStart(2, "0");
      }
      if (type === "process" && pLine) {
        var pr = pLine.getBoundingClientRect();
        var lp = clamp((vh * 0.6 - pr.top) / pr.height, 0, 1);
        pLine.style.setProperty("--lp", lp.toFixed(4));
        pSteps.forEach(function (s) { s.classList.toggle("on", s.getBoundingClientRect().top < vh * 0.6); });
      }
    });

    parallax.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) return;
      var k = (r.top + r.height / 2 - vh / 2) / vh;
      el.style.setProperty("--py", (k * -60).toFixed(1) + "px");
    });

    /* stacking cards: a card shrinks as the next one slides over it */
    sCards.forEach(function (c, i) {
      var next = sCards[i + 1];
      if (!next) return;
      var nr = next.getBoundingClientRect(), cr = c.getBoundingClientRect();
      var k = clamp(1 - (nr.top - cr.top) / cr.height, 0, 1);
      c.style.setProperty("--sc", (1 - k * 0.06).toFixed(4));
    });
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }
  window.addEventListener("scroll", onScroll, { passive: true });
  function onResize() { vh = window.innerHeight; vw = window.innerWidth; sizeX(); sizeZ(); frame(); }
  window.addEventListener("resize", onResize);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { sizeZ(); sizeX(); frame(); });
  window.addEventListener("load", onResize);
  onResize();

  /* ---------- cursor label over project imagery ---------- */
  var fine = window.matchMedia && matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (fine && !reduce) {
    var cur = document.createElement("div");
    cur.className = "cursor"; cur.setAttribute("aria-hidden", "true"); cur.textContent = "View";
    document.body.appendChild(cur);
    var cx = -200, cy = -200, tx = -200, ty = -200;
    document.addEventListener("mousemove", function (e) {
      tx = e.clientX; ty = e.clientY;
      var t = e.target.closest && e.target.closest("[data-cursor]");
      if (t) cur.textContent = t.getAttribute("data-cursor");
      cur.classList.toggle("on", !!t);
    });
    (function loop() {
      cx += (tx - cx) * 0.18; cy += (ty - cy) * 0.18;
      cur.style.setProperty("--cx", cx.toFixed(1) + "px"); cur.style.setProperty("--cy", cy.toFixed(1) + "px");
      requestAnimationFrame(loop);
    })();
  }

  /* ---------- testimonials ---------- */
  var quotes = $$(".quote[data-q]");
  if (quotes.length) {
    var qi = 0, timer;
    var count = $(".q-count"), bar = $(".q-bar i");
    var showQ = function (i) {
      qi = (i + quotes.length) % quotes.length;
      quotes.forEach(function (q, k) { q.classList.toggle("on", k === qi); });
      if (count) count.textContent = String(qi + 1).padStart(2, "0") + " / " + String(quotes.length).padStart(2, "0");
      if (bar) bar.style.width = ((qi + 1) / quotes.length * 100) + "%";
    };
    var auto = function () { clearInterval(timer); if (!reduce) timer = setInterval(function () { showQ(qi + 1); }, 8000); };
    var prev = $(".q-prev"), next = $(".q-next");
    if (prev) prev.addEventListener("click", function () { showQ(qi - 1); auto(); });
    if (next) next.addEventListener("click", function () { showQ(qi + 1); auto(); });
    showQ(0); auto();
  }

  /* ---------- portfolio filter ---------- */
  var filters = $$(".filters button");
  if (filters.length) {
    var cards = $$(".proj-grid .card");
    var applyFilter = function (cat) {
      filters.forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.cat === cat ? "true" : "false"); });
      cards.forEach(function (c) {
        var show = cat === "all" || c.dataset.cat === cat;
        c.hidden = !show;
        if (show && !reduce) { c.classList.remove("in"); void c.offsetWidth; c.classList.add("in"); }
      });
    };
    filters.forEach(function (b) {
      b.addEventListener("click", function () {
        applyFilter(b.dataset.cat);
        if (history.replaceState) history.replaceState(null, "", b.dataset.cat === "all" ? location.pathname : "#" + b.dataset.cat);
      });
    });
    var h = location.hash.replace("#", "");
    if (h && $('.filters button[data-cat="' + h + '"]')) applyFilter(h);
  }

  /* ---------- lightbox ---------- */
  var items = $$("[data-full]");
  if (items.length) {
    var lb = document.createElement("div");
    lb.className = "lb"; lb.setAttribute("role", "dialog"); lb.setAttribute("aria-modal", "true"); lb.setAttribute("aria-label", "Image viewer");
    lb.innerHTML = '<img alt=""><button class="x" aria-label="Close">&#x2715;</button><button class="p" aria-label="Previous image">&#x2190;</button><button class="n" aria-label="Next image">&#x2192;</button><div class="c"></div>';
    document.body.appendChild(lb);
    var lbImg = $("img", lb), lbC = $(".c", lb), li = 0, lastFocus;
    var openLb = function (i) {
      li = (i + items.length) % items.length;
      var b = items[li];
      lbImg.src = b.dataset.full; lbImg.alt = $("img", b).alt;
      lbC.textContent = String(li + 1).padStart(2, "0") + " / " + String(items.length).padStart(2, "0");
      if (!lb.classList.contains("on")) { lastFocus = document.activeElement; lb.classList.add("on"); $(".x", lb).focus(); document.body.style.overflow = "hidden"; }
    };
    var closeLb = function () { lb.classList.remove("on"); document.body.style.overflow = ""; if (lastFocus) lastFocus.focus(); };
    items.forEach(function (b, i) { b.addEventListener("click", function () { openLb(i); }); });
    $(".x", lb).addEventListener("click", closeLb);
    $(".p", lb).addEventListener("click", function () { openLb(li - 1); });
    $(".n", lb).addEventListener("click", function () { openLb(li + 1); });
    lb.addEventListener("click", function (e) { if (e.target === lb) closeLb(); });
    document.addEventListener("keydown", function (e) {
      if (!lb.classList.contains("on")) return;
      if (e.key === "Escape") closeLb();
      if (e.key === "ArrowLeft") openLb(li - 1);
      if (e.key === "ArrowRight") openLb(li + 1);
    });
  }

  if (location.search.indexOf("sent=1") > -1) { var ok = $(".form-ok"); if (ok) ok.hidden = false; }
  $$("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
