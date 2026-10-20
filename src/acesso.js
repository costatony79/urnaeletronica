// Regras de acesso: quem está logado, quem é administrador,
// proteção dos formulários e o "modo urna".
const crypto = require("node:crypto");
const { db } = require("./db");

const buscarUsuario = db.prepare(
  "SELECT id, nome, usuario, papel, trocar_senha, ativo, senha_hash FROM usuarios WHERE id = ?"
);

// Descobre quem está logado e deixa disponível para as telas.
function carregarUsuario(req, res, next) {
  res.locals.usuario = null;
  if (req.session.usuarioId) {
    const usuario = buscarUsuario.get(req.session.usuarioId);
    if (usuario && usuario.ativo) {
      req.usuario = usuario;
      res.locals.usuario = { nome: usuario.nome, papel: usuario.papel };
    } else {
      // Conta desativada pelo administrador: encerra o acesso.
      delete req.session.usuarioId;
      delete req.session.urnaTurmaId;
    }
  }
  next();
}

function exigirLogin(req, res, next) {
  if (!req.usuario) return res.redirect("/login");
  next();
}

// Quem entrou com senha provisória precisa trocá-la antes de usar o sistema.
function exigirSenhaDefinitiva(req, res, next) {
  if (req.usuario && req.usuario.trocar_senha) return res.redirect("/trocar-senha");
  next();
}

function exigirAdmin(req, res, next) {
  if (!req.usuario || req.usuario.papel !== "admin") {
    return res.status(403).render("erro", { titulo: "Acesso negado", mensagem: "Só o administrador pode abrir esta página." });
  }
  next();
}

// Enquanto a urna estiver aberta, o computador fica "travado" nela:
// um aluno não consegue sair da urna para o painel do professor
// (onde poderia ver ou apagar votos) sem a senha do professor.
function travarNaUrna(req, res, next) {
  const turmaId = req.session.urnaTurmaId;
  if (!turmaId) return next();
  const base = `/urna/${turmaId}`;
  if (req.path === base || req.path.startsWith(base + "/") || req.path.startsWith("/fotos/")) {
    return next();
  }
  res.redirect(base);
}

// Proteção contra envio de formulários por outros sites (CSRF).
function protegerFormularios(req, res, next) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString("hex");
  res.locals.csrf = req.session.csrf;
  if (req.method !== "POST") return next();
  // Formulários com foto são conferidos depois que o arquivo é recebido.
  if (req.is("multipart/form-data")) return next();
  conferirCsrf(req, res, next);
}

function conferirCsrf(req, res, next) {
  const enviado = (req.body && req.body._csrf) || req.get("x-csrf-token") || "";
  const esperado = req.session.csrf || "";
  const ok =
    enviado.length === esperado.length &&
    esperado.length > 0 &&
    crypto.timingSafeEqual(Buffer.from(enviado), Buffer.from(esperado));
  if (!ok) {
    return res.status(403).render("erro", {
      titulo: "Página expirada",
      mensagem: "Volte, recarregue a página e tente de novo.",
    });
  }
  next();
}

// Mensagens que aparecem uma vez no topo da próxima página.
function avisos(req, res, next) {
  res.locals.aviso = req.session.aviso || null;
  delete req.session.aviso;
  req.avisar = (tipo, texto) => {
    req.session.aviso = { tipo, texto };
  };
  next();
}

module.exports = {
  carregarUsuario,
  exigirLogin,
  exigirSenhaDefinitiva,
  exigirAdmin,
  travarNaUrna,
  protegerFormularios,
  conferirCsrf,
  avisos,
};
