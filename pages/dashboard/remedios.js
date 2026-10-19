/* ================= Catálogo de remédios do VitalCare =================
   Usado na busca do formulário "Novo medicamento" do dashboard.
   - forma: "redondo" | "oblongo" | "capsula" | "gel"  (desenho do comprimido)
   - cor / cor2: cores do comprimido (cor2 = outra metade da cápsula)
   - foto: opcional. Para usar uma FOTO REAL, salve a imagem em /pages/imagens/remedios/
     e coloque o caminho aqui, ex.: foto: "/pages/imagens/remedios/losartana.jpg"
   As cores são as mais comuns no Brasil, mas variam de fabricante para fabricante. */
(function () {
  const REMEDIOS = [
    // Pressão alta
    { nome: "Losartana", dose: "50 mg", classe: "Pressão alta", forma: "oblongo", cor: "#FFFFFF" },
    { nome: "Valsartana", dose: "80 mg", classe: "Pressão alta", forma: "oblongo", cor: "#F4C7A1" },
    { nome: "Candesartana", dose: "16 mg", classe: "Pressão alta", forma: "redondo", cor: "#FFFFFF" },
    { nome: "Enalapril", dose: "10 mg", classe: "Pressão alta", forma: "redondo", cor: "#FFFFFF" },
    { nome: "Captopril", dose: "25 mg", classe: "Pressão alta", forma: "redondo", cor: "#FFFFFF" },
    { nome: "Anlodipino", dose: "5 mg", classe: "Pressão alta", forma: "redondo", cor: "#FFFFFF" },
    { nome: "Nifedipino", dose: "20 mg", classe: "Pressão alta", forma: "redondo", cor: "#E8A6A0" },
    { nome: "Hidroclorotiazida", dose: "25 mg", classe: "Pressão alta", forma: "redondo", cor: "#FFFFFF" },
    { nome: "Atenolol", dose: "25 mg", classe: "Coração", forma: "redondo", cor: "#FFFFFF" },
    { nome: "Propranolol", dose: "40 mg", classe: "Coração", forma: "redondo", cor: "#FFFFFF" },
    { nome: "Carvedilol", dose: "6,25 mg", classe: "Coração", forma: "oblongo", cor: "#FFF3C4" },
    { nome: "Metoprolol", dose: "50 mg", classe: "Coração", forma: "redondo", cor: "#F7D6E0" },
    { nome: "Furosemida", dose: "40 mg", classe: "Coração", forma: "redondo", cor: "#FFFFFF" },
    { nome: "Espironolactona", dose: "25 mg", classe: "Coração", forma: "redondo", cor: "#F2E2C4" },

    // Colesterol
    { nome: "Sinvastatina", dose: "20 mg", classe: "Colesterol", forma: "oblongo", cor: "#F3B6C2" },
    { nome: "Atorvastatina", dose: "20 mg", classe: "Colesterol", forma: "oblongo", cor: "#FFFFFF" },
    { nome: "Rosuvastatina", dose: "10 mg", classe: "Colesterol", forma: "redondo", cor: "#F6C8A8" },

    // Sangue
    { nome: "AAS", dose: "100 mg", classe: "Afinar o sangue", forma: "redondo", cor: "#FFFFFF" },
    { nome: "Clopidogrel", dose: "75 mg", classe: "Afinar o sangue", forma: "redondo", cor: "#E59AA8" },
    { nome: "Varfarina", dose: "5 mg", classe: "Afinar o sangue", forma: "redondo", cor: "#F7E39A" },
    { nome: "Rivaroxabana", dose: "20 mg", classe: "Afinar o sangue", forma: "redondo", cor: "#C9584F" },

    // Diabetes
    { nome: "Metformina", dose: "850 mg", classe: "Diabetes", forma: "oblongo", cor: "#FFFFFF" },
    { nome: "Glibenclamida", dose: "5 mg", classe: "Diabetes", forma: "redondo", cor: "#FFFFFF" },
    { nome: "Gliclazida", dose: "30 mg", classe: "Diabetes", forma: "oblongo", cor: "#FFFFFF" },
    { nome: "Sitagliptina", dose: "100 mg", classe: "Diabetes", forma: "redondo", cor: "#E6A57E" },

    // Estômago
    { nome: "Omeprazol", dose: "20 mg", classe: "Estômago", forma: "capsula", cor: "#E9A8C6", cor2: "#F4E7EE" },
    { nome: "Pantoprazol", dose: "40 mg", classe: "Estômago", forma: "oblongo", cor: "#F5D76E" },
    { nome: "Esomeprazol", dose: "40 mg", classe: "Estômago", forma: "oblongo", cor: "#D88BB0" },

    // Tireoide
    { nome: "Levotiroxina", dose: "50 mcg", classe: "Tireoide", forma: "redondo", cor: "#FFFFFF" },

    // Dor e febre
    { nome: "Paracetamol", dose: "750 mg", classe: "Dor e febre", forma: "oblongo", cor: "#FFFFFF" },
    { nome: "Dipirona", dose: "500 mg", classe: "Dor e febre", forma: "oblongo", cor: "#FFFFFF" },
    { nome: "Ibuprofeno", dose: "400 mg", classe: "Dor e febre", forma: "redondo", cor: "#F2A65A" },

    // Vitaminas e suplementos
    { nome: "Vitamina D", dose: "7.000 UI", classe: "Vitaminas", forma: "gel", cor: "#F5C542" },
    { nome: "Cálcio", dose: "500 mg", classe: "Vitaminas", forma: "oblongo", cor: "#F1F1F1" },
    { nome: "Vitamina B12", dose: "1.000 mcg", classe: "Vitaminas", forma: "redondo", cor: "#E25B6A" },
    { nome: "Ácido fólico", dose: "5 mg", classe: "Vitaminas", forma: "redondo", cor: "#F3D25B" },
    { nome: "Ômega 3", dose: "1.000 mg", classe: "Vitaminas", forma: "gel", cor: "#E8B04A" },

    // Memória
    { nome: "Donepezila", dose: "10 mg", classe: "Memória", forma: "redondo", cor: "#F3E79B" },
    { nome: "Memantina", dose: "10 mg", classe: "Memória", forma: "oblongo", cor: "#F7E6B5" },
    { nome: "Rivastigmina", dose: "3 mg", classe: "Memória", forma: "capsula", cor: "#F2A65A", cor2: "#F6E3B4" },

    // Humor e sono
    { nome: "Sertralina", dose: "50 mg", classe: "Humor e sono", forma: "oblongo", cor: "#FFFFFF" },
    { nome: "Escitalopram", dose: "10 mg", classe: "Humor e sono", forma: "oblongo", cor: "#FFFFFF" },
    { nome: "Fluoxetina", dose: "20 mg", classe: "Humor e sono", forma: "capsula", cor: "#5B8DD6", cor2: "#F4E19C" },
    { nome: "Clonazepam", dose: "2 mg", classe: "Humor e sono", forma: "redondo", cor: "#FFFFFF" },
    { nome: "Zolpidem", dose: "10 mg", classe: "Humor e sono", forma: "oblongo", cor: "#FFFFFF" },

    // Ossos e articulações
    { nome: "Alendronato", dose: "70 mg", classe: "Ossos", forma: "oblongo", cor: "#FFFFFF" },
    { nome: "Alopurinol", dose: "100 mg", classe: "Ossos", forma: "redondo", cor: "#FFFFFF" },

    // Outros comuns na terceira idade
    { nome: "Levodopa + Benserazida", dose: "100/25 mg", classe: "Parkinson", forma: "capsula", cor: "#5DA9C9", cor2: "#E9C4D8" },
    { nome: "Tansulosina", dose: "0,4 mg", classe: "Próstata", forma: "capsula", cor: "#E3863F", cor2: "#5A7FBF" }
  ];

  function semAcento(texto) {
    return String(texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  }

  // Desenho do comprimido (SVG) quando não há foto real
  function desenho(remedio) {
    const cor = remedio.cor || "#FFFFFF";
    const cor2 = remedio.cor2 || cor;
    const borda = "#C9D2E0";
    let forma;
    if (remedio.forma === "capsula") {
      forma = `
        <g transform="rotate(-30 60 60)">
          <path d="M60 38 H38 a22 22 0 0 0 0 44 H60 Z" fill="${cor}" stroke="${borda}" stroke-width="2"/>
          <path d="M60 38 H82 a22 22 0 0 1 0 44 H60 Z" fill="${cor2}" stroke="${borda}" stroke-width="2"/>
          <rect x="24" y="44" width="30" height="6" rx="3" fill="#fff" opacity=".45"/>
        </g>`;
    } else if (remedio.forma === "gel") {
      forma = `
        <ellipse cx="60" cy="60" rx="38" ry="25" transform="rotate(-25 60 60)" fill="${cor}" stroke="${borda}" stroke-width="2" opacity=".92"/>
        <ellipse cx="48" cy="50" rx="13" ry="6" transform="rotate(-25 60 60)" fill="#fff" opacity=".55"/>`;
    } else if (remedio.forma === "oblongo") {
      forma = `
        <rect x="16" y="38" width="88" height="44" rx="22" transform="rotate(-20 60 60)" fill="${cor}" stroke="${borda}" stroke-width="2"/>
        <line x1="60" y1="40" x2="60" y2="80" transform="rotate(-20 60 60)" stroke="${borda}" stroke-width="2"/>`;
    } else {
      forma = `
        <circle cx="60" cy="60" r="34" fill="${cor}" stroke="${borda}" stroke-width="2"/>
        <line x1="34" y1="60" x2="86" y2="60" stroke="${borda}" stroke-width="2"/>
        <circle cx="50" cy="48" r="8" fill="#fff" opacity=".55"/>`;
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
      <rect width="120" height="120" rx="24" fill="#EDF5FF"/>
      <ellipse cx="60" cy="96" rx="34" ry="6" fill="#1F2A44" opacity=".08"/>
      ${forma}
    </svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function encontrar(nome) {
    const alvo = semAcento(nome);
    return REMEDIOS.find((remedio) => semAcento(remedio.nome) === alvo) || null;
  }

  function buscar(texto, limite) {
    const alvo = semAcento(texto);
    if (!alvo) return [];
    const comeca = REMEDIOS.filter((remedio) => semAcento(remedio.nome).startsWith(alvo));
    const contem = REMEDIOS.filter((remedio) => !comeca.includes(remedio) &&
      (semAcento(remedio.nome).includes(alvo) || semAcento(remedio.classe).includes(alvo)));
    return comeca.concat(contem).slice(0, limite || 6);
  }

  function relacionados(remedio, limite) {
    if (!remedio) return [];
    return REMEDIOS.filter((item) => item !== remedio && item.classe === remedio.classe).slice(0, limite || 4);
  }

  function imagem(remedioOuNome) {
    const remedio = typeof remedioOuNome === "string" ? encontrar(remedioOuNome) : remedioOuNome;
    if (!remedio) return desenho({ forma: "redondo", cor: "#FFFFFF" });
    return remedio.foto || desenho(remedio);
  }

  window.VitalRemedios = { lista: REMEDIOS, buscar, encontrar, relacionados, imagem };
})();
