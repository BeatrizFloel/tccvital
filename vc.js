/* ================= VitalCare — comportamento comum das páginas =================
   Tema claro/escuro (salvo no navegador), menu mobile e animação de entrada.
   O <head> de cada página já aplica o tema salvo antes de desenhar, para não piscar. */
(function () {
  var root = document.documentElement;

  document.addEventListener("click", function (event) {
    var toggle = event.target.closest(".theme-toggle");
    if (toggle) {
      var dark = root.classList.toggle("dark");
      try { localStorage.setItem("vc-theme", dark ? "dark" : "light"); } catch (e) {}
      return;
    }

    var burger = event.target.closest(".menu-toggle");
    var header = document.querySelector(".site-header");
    if (burger && header) {
      var open = header.classList.toggle("nav-open");
      burger.setAttribute("aria-expanded", String(open));
      burger.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
      return;
    }

    // Clicar num link ou fora do menu fecha o menu mobile
    if (header && header.classList.contains("nav-open") && (event.target.closest(".site-nav a") || !event.target.closest(".site-header"))) {
      header.classList.remove("nav-open");
      var button = header.querySelector(".menu-toggle");
      if (button) {
        button.setAttribute("aria-expanded", "false");
        button.setAttribute("aria-label", "Abrir menu");
      }
    }
  });

  // Animação de entrada ao rolar (só para o que ainda está fora da tela)
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !("IntersectionObserver" in window)) return;

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var el = entry.target;
      el.classList.add("is-visible");
      observer.unobserve(el);
      setTimeout(function () { el.classList.remove("reveal", "is-visible"); el.style.transitionDelay = ""; }, 900);
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });

  document.querySelectorAll("[data-reveal] > *, .reveal-item").forEach(function (el, index, list) {
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    var siblings = Array.prototype.indexOf.call(el.parentElement.children, el);
    el.style.transitionDelay = Math.min(siblings, 5) * 70 + "ms";
    el.classList.add("reveal");
    observer.observe(el);
  });
}());
