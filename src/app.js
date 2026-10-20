// Monta o aplicativo: configurações, segurança e rotas.
const express = require("express");
const session = require("express-session");
const path = require("node:path");
const { db, segredoDaSessao, garantirAdministrador } = require("./db");
const SessoesSQLite = require("./sessoes");
const acesso = require("./acesso");

garantirAdministrador();

const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "views"));
app.disable("x-powered-by");

// Quando estiver atrás de um proxy com HTTPS (Nginx, Caddy, Render...),
// defina TRUST_PROXY=1 para o login funcionar com cookie seguro.
const atrasDeProxy = process.env.TRUST_PROXY === "1";
if (atrasDeProxy) app.set("trust proxy", 1);

app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
  });
  next();
});

app.use(express.static(path.join(__dirname, "..", "public")));
app.use(express.urlencoded({ extended: false, limit: "50kb" }));
app.use(express.json({ limit: "10kb" }));

app.use(
  session({
    store: new SessoesSQLite(db),
    secret: segredoDaSessao(),
    name: "urna.sid",
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: atrasDeProxy,
      maxAge: 8 * 60 * 60 * 1000, // 8 horas: um dia de aula
    },
  })
);

app.use(acesso.avisos);
app.use(acesso.carregarUsuario);
app.use(acesso.protegerFormularios);
app.use(acesso.travarNaUrna);

// Páginas abertas (login) e de conta.
app.use(require("./rotas/conta"));

// Daqui para baixo, só com login e senha definitiva.
app.use(acesso.exigirLogin, acesso.exigirSenhaDefinitiva);
app.use("/admin", acesso.exigirAdmin, require("./rotas/admin"));
app.use(require("./rotas/turmas").rotas);
app.use(require("./rotas/urna"));

app.use((req, res) => {
  res.status(404).render("erro", { titulo: "Página não encontrada", mensagem: "Confira o endereço e tente de novo." });
});

// eslint-disable-next-line no-unused-vars
app.use((erro, req, res, next) => {
  console.error(erro);
  res.status(500).render("erro", { titulo: "Algo deu errado", mensagem: "Tente de novo. Se continuar, avise o administrador." });
});

module.exports = app;
