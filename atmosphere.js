(function () {
  "use strict";
  var main = document.querySelector("main"); if (!main) return;
  var base = new URL("./assets/atmosphere/", document.currentScript.src);
  var scenes = ["scene-01.png", "scene-02.png", "scene-03.png", "scene-04.png", "scene-05.png", "scene-06.png"];
  var motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var backdrop = document.createElement("div"); backdrop.className = "site-atmosphere"; backdrop.setAttribute("aria-hidden", "true");
  backdrop.innerHTML = '<div class="site-atmosphere__scene"></div><div class="site-atmosphere__scene"></div>';
  main.prepend(backdrop);
  var layers = Array.from(backdrop.children), current = -1, front = 0, timer = null, loading = false;
  function fit() { backdrop.style.top = Math.max(0, main.getBoundingClientRect().top) + "px"; }
  function active() { return main.classList.contains("atmosphere-on") && !document.hidden; }
  function schedule() {
    clearTimeout(timer); timer = null;
    if (active() && !motion.matches && current >= 0) timer = setTimeout(next, 25000);
  }
  function next() {
    if (!active() || loading) return;
    loading = true;
    var index = (current + 1) % scenes.length, url = new URL(scenes[index], base).href, photo = new Image();
    photo.onload = function () {
      loading = false;
      if (active() && !(motion.matches && current >= 0)) {
        var target = current < 0 ? front : 1 - front;
        layers[target].style.backgroundImage = 'url("' + url + '")';
        layers[target].classList.add("is-current");
        if (current >= 0) layers[front].classList.remove("is-current");
        front = target; current = index;
      }
      schedule();
    };
    photo.onerror = function () { loading = false; if (active() && !motion.matches) timer = setTimeout(next, 25000); };
    photo.src = url;
  }
  function update() {
    fit();
    main.classList.toggle("atmosphere-on", /^(#wall|#state|#rules)$/.test(location.hash));
    clearTimeout(timer); timer = null;
    if (active() && current < 0) next(); else schedule();
  }
  window.addEventListener("hashchange", update);
  document.addEventListener("visibilitychange", update);
  window.addEventListener("resize", fit);
  if (window.ResizeObserver && document.querySelector("header")) new ResizeObserver(fit).observe(document.querySelector("header"));
  if (motion.addEventListener) motion.addEventListener("change", update); else motion.addListener(update);
  update();
}());
