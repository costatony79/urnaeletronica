// A urna em si. Enquanto ela está aberta, o computador fica travado nesta
// tela; para sair, o professor digita a própria senha.
const express = require("express");
const { db, conferirSenha } = require("../db");
const { idade, buscarTurma } = require("./turmas");

const rotas = express.Router();

const candidatos = db.prepare("SELECT id, nome, numero, foto, data_nascimento FROM candidatos WHERE turma_id = ? ORDER BY numero");
const candidatoPorNumero = db.prepare("SELECT id FROM candidatos WHERE turma_id = ? AND numero = ?");
const registrarVoto = db.prepare("INSERT INTO votos (turma_id, candidato_id, tipo) VALUES (?, ?, ?)");

// Só entra quem abriu a urna desta turma pelo painel.
function urnaAberta(req, res, next) {
  const id = Number(req.params.id);
  const turma = buscarTurma(id, req.usuario);
  if (!turma || req.session.urnaTurmaId !== id) {
    return res.redirect(turma ? `/turmas/${id}` : "/painel");
  }
  req.turma = turma;
  next();
}

rotas.get("/urna/:id", urnaAberta, (req, res) => {
  const lista = candidatos.all(req.turma.id).map((c) => ({
    numero: c.numero,
    nome: c.nome,
    foto: c.foto ? `/fotos/${c.foto}` : null,
    idade: idade(c.data_nascimento),
  }));
  res.render("urna", { turma: req.turma, candidatos: lista });
});

rotas.post("/urna/:id/votar", urnaAberta, (req, res) => {
  if (req.body.branco === true) {
    registrarVoto.run(req.turma.id, null, "branco");
    return res.json({ ok: true });
  }
  const numero = String(req.body.numero || "");
  if (!/^\d{2}$/.test(numero)) return res.status(400).json({ ok: false });
  const candidato = candidatoPorNumero.get(req.turma.id, numero);
  registrarVoto.run(req.turma.id, candidato ? candidato.id : null, candidato ? "candidato" : "nulo");
  res.json({ ok: true });
});

rotas.get("/urna/:id/encerrar", urnaAberta, (req, res) => {
  res.render("urna_encerrar", { turma: req.turma, erro: null });
});

rotas.post("/urna/:id/encerrar", urnaAberta, (req, res) => {
  if (!conferirSenha(String(req.body.senha || ""), req.usuario.senha_hash)) {
    return res.status(401).render("urna_encerrar", { turma: req.turma, erro: "Senha incorreta." });
  }
  delete req.session.urnaTurmaId;
  res.redirect(`/turmas/${req.turma.id}/apuracao`);
});

module.exports = rotas;
