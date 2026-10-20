// Área do administrador: criar professores, gerar senhas provisórias,
// desativar e reativar contas.
const express = require("express");
const { db, gerarSenhaProvisoria, hashSenha } = require("../db");

const rotas = express.Router();

const listar = db.prepare(`
  SELECT u.id, u.nome, u.usuario, u.papel, u.ativo, u.trocar_senha,
         (SELECT COUNT(*) FROM turmas t WHERE t.professor_id = u.id) AS turmas
  FROM usuarios u
  ORDER BY u.papel, u.nome COLLATE NOCASE
`);
const buscar = db.prepare("SELECT * FROM usuarios WHERE id = ?");
const existeUsuario = db.prepare("SELECT 1 FROM usuarios WHERE usuario = ?");
const inserir = db.prepare(
  "INSERT INTO usuarios (nome, usuario, senha_hash, papel, trocar_senha) VALUES (?, ?, ?, ?, 1)"
);
const redefinir = db.prepare("UPDATE usuarios SET senha_hash = ?, trocar_senha = 1 WHERE id = ?");
const mudarAtivo = db.prepare("UPDATE usuarios SET ativo = ? WHERE id = ?");
// Desconecta a pessoa de todos os aparelhos em que ela estava logada.
const encerrarSessoes = db.prepare("DELETE FROM sessoes WHERE json_extract(dados, '$.usuarioId') = ?");

const FORMATO_USUARIO = /^[a-z0-9._-]{3,30}$/i;

function pagina(req, res, extra = {}) {
  // A senha provisória aparece uma única vez, logo depois de criada.
  const credencial = req.session.credencial || null;
  delete req.session.credencial;
  res.render("admin_professores", {
    professores: listar.all(),
    usuarioId: req.usuario.id,
    credencial,
    erro: null,
    form: { nome: "", usuario: "" },
    ...extra,
  });
}

rotas.get("/professores", (req, res) => pagina(req, res));

rotas.post("/professores", (req, res) => {
  const nome = String(req.body.nome || "").trim();
  const usuario = String(req.body.usuario || "").trim().toLowerCase();
  const papel = req.body.papel === "admin" ? "admin" : "professor";
  const form = { nome, usuario };

  let erro = null;
  if (nome.length < 2 || nome.length > 80) erro = "Digite o nome do professor.";
  else if (!FORMATO_USUARIO.test(usuario))
    erro = "O usuário deve ter de 3 a 30 caracteres: letras sem acento, números, ponto, hífen ou sublinhado.";
  else if (existeUsuario.get(usuario)) erro = `O usuário "${usuario}" já existe.`;
  if (erro) {
    res.status(400);
    return pagina(req, res, { erro, form });
  }

  const senha = gerarSenhaProvisoria();
  inserir.run(nome, usuario, hashSenha(senha), papel);
  req.session.credencial = { nome, usuario, senha, nova: true };
  res.redirect("/admin/professores");
});

rotas.post("/professores/:id/redefinir-senha", (req, res) => {
  const conta = buscar.get(Number(req.params.id));
  if (!conta) return res.redirect("/admin/professores");
  if (conta.id === req.usuario.id) {
    req.avisar("warning", "Para mudar a sua própria senha, use \"Trocar senha\" no menu.");
    return res.redirect("/admin/professores");
  }
  const senha = gerarSenhaProvisoria();
  redefinir.run(hashSenha(senha), conta.id);
  encerrarSessoes.run(conta.id);
  req.session.credencial = { nome: conta.nome, usuario: conta.usuario, senha, nova: false };
  res.redirect("/admin/professores");
});

rotas.post("/professores/:id/ativo", (req, res) => {
  const conta = buscar.get(Number(req.params.id));
  if (!conta) return res.redirect("/admin/professores");
  if (conta.id === req.usuario.id) {
    req.avisar("warning", "Você não pode desativar a sua própria conta.");
    return res.redirect("/admin/professores");
  }
  const ativar = req.body.ativo === "1";
  mudarAtivo.run(ativar ? 1 : 0, conta.id);
  if (!ativar) encerrarSessoes.run(conta.id);
  req.avisar("success", `${conta.nome} foi ${ativar ? "reativado(a)" : "desativado(a)"}.`);
  res.redirect("/admin/professores");
});

module.exports = rotas;
