// Painel do professor: turmas, candidatos (com foto) e apuração.
// Cada professor só enxerga e mexe nas próprias turmas.
const express = require("express");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const multer = require("multer");
const { db, FOTOS_DIR, conferirSenha } = require("../db");
const { conferirCsrf } = require("../acesso");

const rotas = express.Router();

const sql = {
  turmasDoProfessor: db.prepare(`
    SELECT t.id, t.nome,
           (SELECT COUNT(*) FROM candidatos c WHERE c.turma_id = t.id) AS candidatos,
           (SELECT COUNT(*) FROM votos v WHERE v.turma_id = t.id) AS votos
    FROM turmas t WHERE t.professor_id = ? ORDER BY t.nome COLLATE NOCASE`),
  turma: db.prepare("SELECT * FROM turmas WHERE id = ? AND professor_id = ?"),
  criarTurma: db.prepare("INSERT INTO turmas (professor_id, nome) VALUES (?, ?)"),
  renomearTurma: db.prepare("UPDATE turmas SET nome = ? WHERE id = ?"),
  excluirTurma: db.prepare("DELETE FROM turmas WHERE id = ?"),
  candidatos: db.prepare("SELECT * FROM candidatos WHERE turma_id = ? ORDER BY numero"),
  candidato: db.prepare("SELECT * FROM candidatos WHERE id = ? AND turma_id = ?"),
  numeroEmUso: db.prepare("SELECT id FROM candidatos WHERE turma_id = ? AND numero = ?"),
  criarCandidato: db.prepare(
    "INSERT INTO candidatos (turma_id, nome, numero, foto, data_nascimento) VALUES (?, ?, ?, ?, ?)"
  ),
  editarCandidato: db.prepare(
    "UPDATE candidatos SET nome = ?, numero = ?, foto = ?, data_nascimento = ? WHERE id = ?"
  ),
  excluirCandidato: db.prepare("DELETE FROM candidatos WHERE id = ?"),
  votosDoCandidato: db.prepare("SELECT COUNT(*) AS n FROM votos WHERE candidato_id = ?"),
  totalVotos: db.prepare("SELECT COUNT(*) AS n FROM votos WHERE turma_id = ?"),
  apuracao: db.prepare(`
    SELECT c.numero, c.nome, COUNT(v.id) AS votos
    FROM candidatos c LEFT JOIN votos v ON v.candidato_id = c.id
    WHERE c.turma_id = ? GROUP BY c.id ORDER BY votos DESC, c.numero`),
  especiais: db.prepare(`
    SELECT SUM(tipo = 'branco') AS brancos, SUM(tipo = 'nulo') AS nulos
    FROM votos WHERE turma_id = ?`),
  zerar: db.prepare("DELETE FROM votos WHERE turma_id = ?"),
};

// ---------- Fotos ----------
const TIPOS_FOTO = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };

const enviarFoto = multer({
  storage: multer.diskStorage({
    destination: FOTOS_DIR,
    // Nome aleatório: o nome do arquivo não revela nada sobre o aluno.
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + TIPOS_FOTO[file.mimetype]),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => cb(null, Boolean(TIPOS_FOTO[file.mimetype])),
}).single("foto");

// Recebe a foto e mostra um erro amigável se ela for grande demais.
function receberFoto(req, res, next) {
  enviarFoto(req, res, (erro) => {
    if (erro) {
      req.erroFoto =
        erro.code === "LIMIT_FILE_SIZE" ? "A foto é muito grande. O limite é 5 MB." : "Não foi possível receber a foto.";
    }
    next();
  });
}

// Confere a proteção do formulário depois de receber a foto;
// se a conferência falhar, a foto recebida é descartada.
function csrfComFoto(req, res, next) {
  let aprovado = false;
  conferirCsrf(req, res, (erro) => {
    aprovado = true;
    next(erro);
  });
  if (!aprovado && req.file) apagarFoto(req.file.filename);
}

function apagarFoto(arquivo) {
  if (!arquivo) return;
  fs.rm(path.join(FOTOS_DIR, path.basename(arquivo)), { force: true }, () => {});
}

// ---------- Ajudantes ----------
function carregarTurma(req, res, next) {
  const turma = sql.turma.get(Number(req.params.id), req.usuario.id);
  if (!turma) {
    return res.status(404).render("erro", { titulo: "Turma não encontrada", mensagem: "Essa turma não existe ou não é sua." });
  }
  req.turma = turma;
  next();
}

function idade(dataNascimento) {
  if (!dataNascimento) return null;
  const nasc = new Date(dataNascimento + "T12:00:00");
  if (Number.isNaN(nasc.getTime())) return null;
  const hoje = new Date();
  let anos = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) anos -= 1;
  return anos >= 0 && anos < 120 ? anos : null;
}

function validarCandidato(req, idAtual) {
  const nome = String(req.body.nome || "").trim();
  const numero = String(req.body.numero || "").trim();
  const data_nascimento = String(req.body.data_nascimento || "").trim() || null;
  const form = { nome, numero, data_nascimento };

  let erro = req.erroFoto || null;
  if (!erro && (nome.length < 2 || nome.length > 80)) erro = "Digite o nome do candidato.";
  else if (!erro && !/^\d{2}$/.test(numero)) erro = "O número deve ter exatamente 2 dígitos (por exemplo, 07 ou 15).";
  else if (!erro && data_nascimento && !/^\d{4}-\d{2}-\d{2}$/.test(data_nascimento)) erro = "Data de nascimento inválida.";
  else if (!erro) {
    const outro = sql.numeroEmUso.get(req.turma.id, numero);
    if (outro && outro.id !== idAtual) erro = `O número ${numero} já é de outro candidato desta turma.`;
  }
  return { erro, form };
}

function paginaTurma(req, res, extra = {}) {
  const candidatos = sql.candidatos.all(req.turma.id).map((c) => ({ ...c, idade: idade(c.data_nascimento) }));
  res.render("turma", {
    turma: req.turma,
    candidatos,
    totalVotos: sql.totalVotos.get(req.turma.id).n,
    erro: null,
    form: { nome: "", numero: "", data_nascimento: "" },
    ...extra,
  });
}

// ---------- Painel ----------
rotas.get("/painel", (req, res) => {
  res.render("painel", { turmas: sql.turmasDoProfessor.all(req.usuario.id), erro: null });
});

rotas.post("/turmas", (req, res) => {
  const nome = String(req.body.nome || "").trim();
  if (nome.length < 2 || nome.length > 60) {
    return res.status(400).render("painel", {
      turmas: sql.turmasDoProfessor.all(req.usuario.id),
      erro: "Digite o nome da turma (por exemplo, 5º Ano B).",
    });
  }
  const { lastInsertRowid } = sql.criarTurma.run(req.usuario.id, nome);
  res.redirect(`/turmas/${lastInsertRowid}`);
});

// ---------- Turma ----------
rotas.get("/turmas/:id", carregarTurma, (req, res) => paginaTurma(req, res));

rotas.post("/turmas/:id/renomear", carregarTurma, (req, res) => {
  const nome = String(req.body.nome || "").trim();
  if (nome.length >= 2 && nome.length <= 60) {
    sql.renomearTurma.run(nome, req.turma.id);
    req.avisar("success", "Nome da turma atualizado.");
  }
  res.redirect(`/turmas/${req.turma.id}`);
});

rotas.post("/turmas/:id/excluir", carregarTurma, (req, res) => {
  if (!conferirSenha(String(req.body.senha || ""), req.usuario.senha_hash)) {
    req.avisar("danger", "Senha incorreta. A turma não foi excluída.");
    return res.redirect(`/turmas/${req.turma.id}`);
  }
  sql.candidatos.all(req.turma.id).forEach((c) => apagarFoto(c.foto));
  sql.excluirTurma.run(req.turma.id);
  req.avisar("success", `A turma ${req.turma.nome} foi excluída.`);
  res.redirect("/painel");
});

// ---------- Candidatos ----------
rotas.post("/turmas/:id/candidatos", carregarTurma, receberFoto, csrfComFoto, (req, res) => {
  const { erro, form } = validarCandidato(req, null);
  if (erro) {
    if (req.file) apagarFoto(req.file.filename);
    res.status(400);
    return paginaTurma(req, res, { erro, form });
  }
  sql.criarCandidato.run(req.turma.id, form.nome, form.numero, req.file ? req.file.filename : null, form.data_nascimento);
  req.avisar("success", `${form.nome} cadastrado(a) com o número ${form.numero}.`);
  res.redirect(`/turmas/${req.turma.id}`);
});

rotas.get("/turmas/:id/candidatos/:cid/editar", carregarTurma, (req, res) => {
  const candidato = sql.candidato.get(Number(req.params.cid), req.turma.id);
  if (!candidato) return res.redirect(`/turmas/${req.turma.id}`);
  res.render("candidato_editar", { turma: req.turma, candidato, form: candidato, erro: null });
});

rotas.post("/turmas/:id/candidatos/:cid/editar", carregarTurma, receberFoto, csrfComFoto, (req, res) => {
  const candidato = sql.candidato.get(Number(req.params.cid), req.turma.id);
  if (!candidato) return res.redirect(`/turmas/${req.turma.id}`);

  const { erro, form } = validarCandidato(req, candidato.id);
  if (erro) {
    if (req.file) apagarFoto(req.file.filename);
    return res.status(400).render("candidato_editar", { turma: req.turma, candidato, form, erro });
  }

  let foto = candidato.foto;
  if (req.file) {
    apagarFoto(candidato.foto);
    foto = req.file.filename;
  } else if (req.body.remover_foto === "1") {
    apagarFoto(candidato.foto);
    foto = null;
  }
  sql.editarCandidato.run(form.nome, form.numero, foto, form.data_nascimento, candidato.id);
  req.avisar("success", "Candidato atualizado.");
  res.redirect(`/turmas/${req.turma.id}`);
});

rotas.post("/turmas/:id/candidatos/:cid/excluir", carregarTurma, (req, res) => {
  const candidato = sql.candidato.get(Number(req.params.cid), req.turma.id);
  if (candidato) {
    if (sql.votosDoCandidato.get(candidato.id).n > 0) {
      req.avisar("warning", `${candidato.nome} já recebeu votos. Zere a votação antes de excluir um candidato.`);
    } else {
      apagarFoto(candidato.foto);
      sql.excluirCandidato.run(candidato.id);
      req.avisar("success", `${candidato.nome} foi removido(a).`);
    }
  }
  res.redirect(`/turmas/${req.turma.id}`);
});

// ---------- Votação ----------
rotas.post("/turmas/:id/abrir-urna", carregarTurma, (req, res) => {
  if (sql.candidatos.all(req.turma.id).length === 0) {
    req.avisar("warning", "Cadastre pelo menos um candidato antes de abrir a urna.");
    return res.redirect(`/turmas/${req.turma.id}`);
  }
  req.session.urnaTurmaId = req.turma.id;
  res.redirect(`/urna/${req.turma.id}`);
});

rotas.get("/turmas/:id/apuracao", carregarTurma, (req, res) => {
  const resultado = sql.apuracao.all(req.turma.id);
  const { brancos, nulos } = sql.especiais.get(req.turma.id);
  const total = sql.totalVotos.get(req.turma.id).n;
  res.render("apuracao", {
    turma: req.turma,
    resultado,
    brancos: brancos || 0,
    nulos: nulos || 0,
    total,
    agora: new Date().toLocaleString("pt-BR", { timeZone: process.env.TZ || "America/Boa_Vista" }),
  });
});

rotas.post("/turmas/:id/zerar", carregarTurma, (req, res) => {
  if (!conferirSenha(String(req.body.senha || ""), req.usuario.senha_hash)) {
    req.avisar("danger", "Senha incorreta. Os votos não foram apagados.");
  } else {
    sql.zerar.run(req.turma.id);
    req.avisar("success", "Votação zerada. A turma está pronta para uma nova eleição.");
  }
  res.redirect(`/turmas/${req.turma.id}/apuracao`);
});

// ---------- Mostrar fotos (só para o dono da turma) ----------
const fotoDoProfessor = db.prepare(`
  SELECT c.foto FROM candidatos c JOIN turmas t ON t.id = c.turma_id
  WHERE c.foto = ? AND t.professor_id = ?`);

rotas.get("/fotos/:arquivo", (req, res) => {
  const arquivo = path.basename(req.params.arquivo);
  if (!fotoDoProfessor.get(arquivo, req.usuario.id)) return res.sendStatus(404);
  res.set("Cache-Control", "private, max-age=3600");
  res.sendFile(path.join(FOTOS_DIR, arquivo));
});

module.exports = { rotas, idade };
