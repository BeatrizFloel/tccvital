(function () {
  document.querySelectorAll(".vc-burger").forEach(function (button) {
    button.addEventListener("click", function () {
      var header = button.closest("header");
      var open = header.classList.toggle("nav-open");
      button.setAttribute("aria-expanded", String(open));
      button.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
    });
  });

  document.querySelectorAll(".header .nav-link").forEach(function (link) {
    link.addEventListener("click", function () {
      var header = link.closest("header");
      if (!header) return;
      header.classList.remove("nav-open");
      var button = header.querySelector(".vc-burger");
      if (button) {
        button.setAttribute("aria-expanded", "false");
        button.setAttribute("aria-label", "Abrir menu");
      }
    });
  });

  // Animação de entrada dos blocos ao rolar a página
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !("IntersectionObserver" in window)) return;

  var selector = [
    ".card", ".obj-item", ".list-item", ".section-title", ".why-title", ".why-text",
    ".step-row", ".res-card", ".rem-card", ".video-card",
    ".spec-card", ".block-title", ".final", ".design",
    ".membro", ".contato", ".fundamentacao", ".ref-card", ".recurso",
    ".cta-card", ".info-card"
  ].map(function (s) { return ".vc-page " + s; }).join(",");

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var el = entry.target;
      el.classList.add("is-visible");
      observer.unobserve(el);
      // Depois da animação, devolve as transições normais (hover dos cartões)
      setTimeout(function () { el.classList.remove("vc-reveal", "is-visible"); }, 800);
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });

  document.querySelectorAll(selector).forEach(function (el) {
    // Só anima o que ainda não está visível na primeira tela
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    el.classList.add("vc-reveal");
    observer.observe(el);
  });
}());
