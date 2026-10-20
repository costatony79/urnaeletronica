// Guarda as sessões de login no próprio SQLite, para que ninguém seja
// desconectado quando o servidor reinicia.
const session = require("express-session");

class SessoesSQLite extends session.Store {
  constructor(db) {
    super();
    this.buscar = db.prepare("SELECT dados, expira FROM sessoes WHERE sid = ?");
    this.salvar = db.prepare(
      "INSERT INTO sessoes (sid, dados, expira) VALUES (?, ?, ?) " +
        "ON CONFLICT(sid) DO UPDATE SET dados = excluded.dados, expira = excluded.expira"
    );
    this.renovar = db.prepare("UPDATE sessoes SET expira = ? WHERE sid = ?");
    this.apagar = db.prepare("DELETE FROM sessoes WHERE sid = ?");
    const limpar = db.prepare("DELETE FROM sessoes WHERE expira < ?");
    setInterval(() => limpar.run(Date.now()), 60 * 60 * 1000).unref();
  }

  static expiracao(sess) {
    const fim = sess && sess.cookie && sess.cookie.expires;
    return fim ? new Date(fim).getTime() : Date.now() + 24 * 60 * 60 * 1000;
  }

  get(sid, cb) {
    try {
      const linha = this.buscar.get(sid);
      if (!linha || linha.expira < Date.now()) return cb(null, null);
      cb(null, JSON.parse(linha.dados));
    } catch (erro) {
      cb(erro);
    }
  }

  set(sid, sess, cb) {
    try {
      this.salvar.run(sid, JSON.stringify(sess), SessoesSQLite.expiracao(sess));
      cb && cb(null);
    } catch (erro) {
      cb && cb(erro);
    }
  }

  touch(sid, sess, cb) {
    try {
      this.renovar.run(SessoesSQLite.expiracao(sess), sid);
      cb && cb(null);
    } catch (erro) {
      cb && cb(erro);
    }
  }

  destroy(sid, cb) {
    try {
      this.apagar.run(sid);
      cb && cb(null);
    } catch (erro) {
      cb && cb(erro);
    }
  }
}

module.exports = SessoesSQLite;
