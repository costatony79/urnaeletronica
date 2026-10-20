// Login, saída e troca de senha.
const express = require("express");
const { db, hashSenha, conferirSenha } = require("../db");
const { exigirLogin } = require("../acesso");

const rotas = express.Router();

const buscarPorUsuario = db.prepare("SELECT * FROM usuarios WHERE usuario = ?");
const atualizarSenha = db.prepare("UPDATE usuarios SET senha_hash = ?, trocar_senha = 0 WHERE id = ?");

// Bloqueia por 5 minutos depois de 5 senhas erradas seguidas,
// para dificultar que alguém fique tentando adivinhar.
const tentativas = new Map();
const LIMITE = 5;
const ESPERA_MS = 5 * 60 * 1000;

function bloqueado(chave) {
  const t = tentativas.get(chave);
  if (!t) return false;
  if (Date.now() - t.ultima > ESPERA_MS) {
    tentativas.delete(chave);
    return false;
  }
  return t.erros >= LIMITE;
}

function registrarErro(chave) {
  const t = tentativas.get(chave) || { erros: 0, ultima: 0 };
  t.erros += 1;
  t.ultima = Date.now();
  tentativas.set(chave, t);
}

rotas.get("/", (req, res) => res.redirect(req.usuario ? "/painel" : "/login"));

rotas.get("/login", (req, res) => {
  if (req.usuario) return res.redirect("/painel");
  res.render("login", { erro: null, usuarioDigitado: "" });
});

rotas.post("/login", (req, res, next) => {
  const usuarioDigitado = String(req.body.usuario || "").trim();
  const senha = String(req.body.senha || "");
  const chave = `${usuarioDigitado.toLowerCase()}|${req.ip}`;

  if (bloqueado(chave)) {
    return res.status(429).render("login", {
      erro: "Muitas tentativas erradas. Espere 5 minutos e tente de novo.",
      usuarioDigitado,
    });
  }

  const conta = buscarPorUsuario.get(usuarioDigitado);
  if (!conta || !conta.ativo || !conferirSenha(senha, conta.senha_hash)) {
    registrarErro(chave);
    return res.status(401).render("login", { erro: "Usuário ou senha incorretos.", usuarioDigitado });
  }

  tentativas.delete(chave);
  // Gera uma sessão nova a cada login (evita sequestro de sessão).
  req.session.regenerate((erro) => {
    if (erro) return next(erro);
    req.session.usuarioId = conta.id;
    res.redirect(conta.trocar_senha ? "/trocar-senha" : "/painel");
  });
});

rotas.post("/sair", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

rotas.get("/trocar-senha", exigirLogin, (req, res) => {
  res.render("trocar_senha", { erro: null, provisoria: !!req.usuario.trocar_senha });
});

rotas.post("/trocar-senha", exigirLogin, (req, res) => {
  const { senha_atual = "", nova_senha = "", confirmar = "" } = req.body;
  const provisoria = !!req.usuario.trocar_senha;
  const falhar = (erro) => res.status(400).render("trocar_senha", { erro, provisoria });

  if (!conferirSenha(senha_atual, req.usuario.senha_hash)) return falhar("A senha atual está incorreta.");
  if (nova_senha.length < 8) return falhar("A nova senha precisa ter pelo menos 8 caracteres.");
  if (nova_senha !== confirmar) return falhar("A confirmação não é igual à nova senha.");
  if (nova_senha === senha_atual) return falhar("A nova senha precisa ser diferente da atual.");

  atualizarSenha.run(hashSenha(nova_senha), req.usuario.id);
  req.avisar("success", "Senha alterada com sucesso.");
  res.redirect("/painel");
});

module.exports = rotas;
