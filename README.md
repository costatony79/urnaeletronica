# Urna Eletrônica · Eleição do Líder de Turma

Urna eletrônica para a eleição do líder de turma, inspirada na urna de verdade.
Vários professores da escola podem usar, cada um com a sua conta e as suas turmas.

## Como funciona

- **Administrador**: cria as contas dos professores. Cada conta nova recebe uma
  **senha provisória**, que aparece uma única vez para ser repassada ao professor.
  O administrador também pode gerar uma nova senha provisória (quando alguém esquece
  a senha), desativar e excluir contas. Ele vê **todas as turmas da escola** e pode
  gerenciar qualquer uma: abrir, editar, apurar e excluir turmas e candidatos,
  inclusive candidatos que já têm votos (os votos dele são apagados junto).
  Ações que apagam dados pedem a senha do administrador.
- **Professor**: no primeiro acesso, troca a senha provisória por uma senha pessoal.
  Depois cria as suas turmas, cadastra os candidatos (com foto, se quiser) e abre a urna.
- **Urna**: os alunos votam todos no mesmo computador, um de cada vez, como na urna real.
  Dá para digitar o número, votar em branco, corrigir e confirmar. Número que não existe
  conta como voto nulo. O teclado do computador também funciona (Enter confirma,
  Backspace corrige).
- **Modo urna**: enquanto a urna está aberta, o computador fica travado na tela de votação.
  Para sair, o professor clica em “Encerrar votação” e digita a própria senha.
- **Apuração**: boletim de urna como o real: votos e porcentagem de cada candidato sobre
  os votos válidos, e um resumo com votos válidos, brancos, nulos e total. Avisa empate.
  Pode ser impresso. Zerar os votos para uma nova eleição pede a senha do professor.

Cada professor só vê as próprias turmas, candidatos, fotos e votos; só o administrador vê todas. Os votos são secretos:
o sistema guarda em quem se votou, nunca quem votou.

## Rodando no computador

Precisa do [Node.js](https://nodejs.org) **versão 22.13 ou mais nova**. Não precisa
instalar MySQL: o banco de dados (SQLite) já vem com o Node.

```bash
npm install
npm start
```

Abra <http://localhost:1314>. Na primeira vez, o terminal mostra o usuário (`admin`)
e a senha provisória do administrador. Ao entrar, o sistema pede uma senha nova.

Para desenvolver, `npm run dev` reinicia o servidor sozinho a cada alteração.

## Onde ficam os dados

Tudo fica na pasta `data/`, que **nunca vai para o GitHub**:

- `data/urna.db`: banco de dados com contas, turmas, candidatos e votos;
- `data/fotos/`: fotos dos candidatos, com nomes aleatórios;
- `data/segredo-sessao.txt`: chave que protege o login.

Para fazer backup, copie a pasta `data/` com o sistema desligado.

## Configurações (opcionais)

| Variável | Para que serve | Padrão |
|---|---|---|
| `PORT` | Porta do servidor | `1314` |
| `DATA_DIR` | Pasta dos dados | `./data` |
| `ADMIN_USUARIO` | Usuário do primeiro administrador | `admin` |
| `ADMIN_SENHA` | Senha provisória do primeiro administrador | gerada e mostrada no terminal |
| `ADMIN_NOME` | Nome do primeiro administrador | `Administrador` |
| `TRUST_PROXY` | Use `1` quando o site estiver atrás de um proxy com HTTPS (Nginx, Caddy etc.) | desligado |
| `SESSION_SECRET` | Chave do login, se preferir não usar o arquivo em `data/` | gerada automaticamente |

As variáveis `ADMIN_*` só valem na primeira vez, quando ainda não existe administrador.

## Colocando online (servidor Ubuntu, como a VM gratuita da Oracle)

1. No painel da nuvem, libere as portas **80** e **443** (na Oracle: Security List, regras de entrada TCP).
2. Crie um nome de domínio apontando para o IP do servidor (por exemplo, grátis no DuckDNS).
3. Entre no servidor pelo SSH e rode, trocando pelo seu domínio:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/costatony79/urnaeletronica/main/deploy/instalar.sh | sudo bash -s -- seu-nome.duckdns.org
   ```

O script (`deploy/instalar.sh`) cria espaço de troca, libera as portas no firewall do Ubuntu,
instala o Node.js 22 e o Caddy (HTTPS automático), baixa a urna, configura o serviço que inicia
sozinho e mostra a senha provisória do administrador. Os dados ficam em `/var/lib/urnaeletronica`.
Para **atualizar** a urna depois de mudanças no GitHub, rode o mesmo comando de novo.

## Colocando online em outro servidor

O sistema precisa de um servidor que rode Node.js e guarde a pasta `data/` de forma
permanente (uma máquina virtual, por exemplo). Ao publicar na internet:

1. Use **HTTPS** (por exemplo, com o Caddy ou o Nginx na frente) e defina `TRUST_PROXY=1`.
2. Faça backup da pasta `data/` com frequência.
3. Mantenha o Node.js e as dependências atualizados (`npm audit` mostra problemas conhecidos).
