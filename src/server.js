// Liga o servidor.
const app = require("./app");

const PORTA = Number(process.env.PORT) || 1314;

app.listen(PORTA, () => {
  console.log(`Urna Eletrônica rodando em http://localhost:${PORTA}`);
});
