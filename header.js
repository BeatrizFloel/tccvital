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
}());
