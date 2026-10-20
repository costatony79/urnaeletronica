// Banco de dados SQLite (já vem embutido no Node 22, não precisa instalar MySQL).
// Tudo fica na pasta "data": o arquivo do banco e as fotos dos candidatos.
// Essa pasta nunca vai para o GitHub (ver .gitignore).
const { DatabaseSync } = require("node:sqlite");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const bcrypt = require("bcryptjs");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const FOTOS_DIR = path.join(DATA_DIR, "fotos");
fs.mkdirSync(FOTOS_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, "urna.db"));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS usuarios (
    id            INTEGER PRIMARY KEY,
    nome          TEXT NOT NULL,
    usuario       TEXT NOT NULL UNIQUE COLLATE NOCASE,
    senha_hash    TEXT NOT NULL,
    papel         TEXT NOT NULL CHECK (papel IN ('admin', 'professor')),
    trocar_senha  INTEGER NOT NULL DEFAULT 1,
    ativo         INTEGER NOT NULL DEFAULT 1,
    criado_em     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS turmas (
    id            INTEGER PRIMARY KEY,
    professor_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    nome          TEXT NOT NULL,
    criado_em     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS candidatos (
    id               INTEGER PRIMARY KEY,
    turma_id         INTEGER NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
    nome             TEXT NOT NULL,
    numero           TEXT NOT NULL,
    foto             TEXT,
    data_nascimento  TEXT,
    UNIQUE (turma_id, numero)
  );

  -- Cada voto é uma linha. Votos não guardam quem votou: a eleição é secreta.
  CREATE TABLE IF NOT EXISTS votos (
    id            INTEGER PRIMARY KEY,
    turma_id      INTEGER NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
    candidato_id  INTEGER REFERENCES candidatos(id) ON DELETE CASCADE,
    tipo          TEXT NOT NULL CHECK (tipo IN ('candidato', 'branco', 'nulo'))
  );

  CREATE TABLE IF NOT EXISTS sessoes (
    sid     TEXT PRIMARY KEY,
    dados   TEXT NOT NULL,
    expira  INTEGER NOT NULL
  );
`);

// Senha provisória fácil de ditar: sem letras que confundem (l, I, O, 0, 1).
function gerarSenhaProvisoria() {
  const letras = "abcdefghjkmnpqrstuvwxyz";
  const numeros = "23456789";
  const parte = (alfabeto, n) =>
    Array.from({ length: n }, () => alfabeto[crypto.randomInt(alfabeto.length)]).join("");
  return `${parte(letras, 4)}-${parte(numeros, 4)}`;
}

function hashSenha(senha) {
  return bcrypt.hashSync(senha, 10);
}

function conferirSenha(senha, hash) {
  return bcrypt.compareSync(senha, hash);
}

// Na primeira vez que o sistema roda, cria o administrador (o "root").
// A senha vem da variável ADMIN_SENHA ou é gerada e mostrada no terminal.
function garantirAdministrador() {
  const existe = db.prepare("SELECT 1 FROM usuarios WHERE papel = 'admin'").get();
  if (existe) return;

  const usuario = process.env.ADMIN_USUARIO || "admin";
  const senha = process.env.ADMIN_SENHA || gerarSenhaProvisoria();
  db.prepare(
    "INSERT INTO usuarios (nome, usuario, senha_hash, papel, trocar_senha) VALUES (?, ?, ?, 'admin', 1)"
  ).run(process.env.ADMIN_NOME || "Administrador", usuario, hashSenha(senha));

  console.log("\n==============================================");
  console.log(" Administrador criado. Entre com:");
  console.log(`   usuário: ${usuario}`);
  console.log(`   senha:   ${process.env.ADMIN_SENHA ? "(a definida em ADMIN_SENHA)" : senha}`);
  console.log(" No primeiro acesso o sistema pede uma senha nova.");
  console.log("==============================================\n");
}

// Chave usada para assinar o cookie de login. Fica salva em data/ para
// que os professores não sejam desconectados quando o servidor reinicia.
function segredoDaSessao() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const arquivo = path.join(DATA_DIR, "segredo-sessao.txt");
  if (!fs.existsSync(arquivo)) {
    fs.writeFileSync(arquivo, crypto.randomBytes(32).toString("hex"), { mode: 0o600 });
  }
  return fs.readFileSync(arquivo, "utf8").trim();
}

module.exports = {
  db,
  DATA_DIR,
  FOTOS_DIR,
  gerarSenhaProvisoria,
  hashSenha,
  conferirSenha,
  garantirAdministrador,
  segredoDaSessao,
};
