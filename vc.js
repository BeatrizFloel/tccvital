/* ================= VitalCare: comportamento comum das páginas =================
   Tema claro/escuro (salvo no navegador) e menu mobile.
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
}());
