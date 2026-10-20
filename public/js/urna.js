// Funcionamento da urna na tela: teclado, display e envio do voto.
(function () {
  const candidatos = JSON.parse(document.getElementById("candidatos").textContent);
  const csrf = document.querySelector('meta[name="csrf"]').content;

  const el = (id) => document.getElementById(id);
  const display = el("display");
  const foto = el("foto");
  const nome = el("nome");
  const idade = el("idade");
  const linhaIdade = el("linha-idade");
  const aviso = el("aviso");
  const telaVoto = el("tela-voto");
  const telaFim = el("tela-fim");

  const somTecla = new Audio("/sons/tecla.mp3");
  const somFim = new Audio("/sons/fim.mp3");
  const tocar = (som) => {
    som.currentTime = 0;
    som.play().catch(() => {});
  };

  let digitos = "";
  let branco = false;
  let ocupado = false;

  function candidatoAtual() {
    return candidatos.find((c) => c.numero === digitos) || null;
  }

  function mostrar() {
    display.textContent = branco ? "" : digitos.padEnd(2, "_").split("").join(" ");
    nome.textContent = "";
    idade.textContent = "";
    linhaIdade.classList.add("d-none");
    aviso.textContent = "";
    aviso.className = "aviso-urna";
    foto.classList.add("d-none");
    foto.removeAttribute("src");

    if (branco) {
      aviso.textContent = "VOTO EM BRANCO";
      aviso.classList.add("aviso-destaque");
      return;
    }
    if (digitos.length < 2) return;

    const c = candidatoAtual();
    if (!c) {
      nome.textContent = "NÚMERO ERRADO";
      aviso.textContent = "VOTO NULO";
      aviso.classList.add("aviso-destaque");
      return;
    }
    nome.textContent = c.nome;
    if (c.idade !== null) {
      idade.textContent = `${c.idade} anos`;
      linhaIdade.classList.remove("d-none");
    }
    if (c.foto) {
      foto.src = c.foto;
      foto.alt = `Foto de ${c.nome}`;
      foto.classList.remove("d-none");
    }
  }

  function digitar(numero) {
    if (ocupado || branco || digitos.length >= 2) return;
    digitos += numero;
    tocar(somTecla);
    mostrar();
  }

  function corrigir() {
    if (ocupado) return;
    digitos = "";
    branco = false;
    tocar(somTecla);
    mostrar();
  }

  function votarEmBranco() {
    // Como na urna de verdade: o branco só vale com o display vazio.
    if (ocupado || digitos.length > 0) return;
    branco = true;
    tocar(somTecla);
    mostrar();
  }

  async function confirmar() {
    if (ocupado || !(branco || digitos.length === 2)) return;
    ocupado = true;
    try {
      const resposta = await fetch(window.URNA_VOTAR, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify(branco ? { branco: true } : { numero: digitos }),
        credentials: "same-origin",
      });
      if (!resposta.ok) throw new Error("falha");
      tocar(somFim);
      telaVoto.classList.add("d-none");
      telaFim.classList.remove("d-none");
      setTimeout(() => {
        digitos = "";
        branco = false;
        telaFim.classList.add("d-none");
        telaVoto.classList.remove("d-none");
        mostrar();
        ocupado = false;
      }, 2500);
    } catch (erro) {
      ocupado = false;
      alert("O voto NÃO foi registrado. Chame o professor.");
    }
  }

  el("teclado").addEventListener("click", (e) => {
    const botao = e.target.closest("[data-tecla]");
    if (botao) digitar(botao.dataset.tecla);
  });
  el("corrige").addEventListener("click", corrigir);
  el("branco").addEventListener("click", votarEmBranco);
  el("confirma").addEventListener("click", confirmar);

  // Também funciona com o teclado numérico do computador.
  document.addEventListener("keydown", (e) => {
    if (/^\d$/.test(e.key)) digitar(e.key);
    else if (e.key === "Backspace" || e.key === "Delete") corrigir();
    else if (e.key === "Enter") confirmar();
  });

  mostrar();
})();
