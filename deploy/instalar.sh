#!/usr/bin/env bash
# Instala (ou atualiza) a Urna Eletrônica num servidor Ubuntu, como a VM gratuita da Oracle.
#
# Uso, já dentro do servidor:
#   curl -fsSL https://raw.githubusercontent.com/costatony79/urnaeletronica/main/deploy/instalar.sh | sudo bash -s -- SEU-NOME.duckdns.org
#
# Sem o nome de domínio, a urna fica só em HTTP pelo IP (serve para testar, não para usar com login de verdade).
# Rodar de novo atualiza a urna para a versão mais nova do GitHub, sem apagar os dados.
set -euo pipefail

DOMINIO="${1:-}"
REPO="https://github.com/costatony79/urnaeletronica.git"
PASTA_APP="/opt/urnaeletronica"
PASTA_DADOS="/var/lib/urnaeletronica"
ARQ_CONFIG="/etc/urnaeletronica.env"
PORTA=1314

etapa() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
aviso() { printf '\033[1;33m%s\033[0m\n' "$*"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "Rode com sudo. Exemplo: curl -fsSL .../instalar.sh | sudo bash -s -- seu-nome.duckdns.org" >&2
  exit 1
fi
if [ -n "$DOMINIO" ] && ! [[ "$DOMINIO" =~ ^[a-z0-9.-]+\.[a-z]{2,}$ ]]; then
  echo "Domínio inválido: '$DOMINIO'. Use só o nome, por exemplo: urnajuslany.duckdns.org" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
etapa "1/7 Espaço de troca (a VM tem só 1 GB de memória)"
if [ -z "$(swapon --show --noheadings)" ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "Criado /swapfile de 2 GB."
else
  echo "Já existe espaço de troca."
fi

# ---------------------------------------------------------------------------
etapa "2/7 Pacotes básicos"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q curl git xz-utils ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https iptables-persistent >/dev/null

# ---------------------------------------------------------------------------
etapa "3/7 Firewall do Ubuntu: liberar as portas 80 e 443"
# As imagens Ubuntu da Oracle bloqueiam tudo menos o SSH no próprio sistema,
# além das regras do painel. As regras novas entram antes da regra que rejeita.
for porta in 80 443; do
  if ! iptables -C INPUT -p tcp -m state --state NEW --dport "$porta" -j ACCEPT 2>/dev/null; then
    linha=$(iptables -L INPUT --line-numbers -n | awk '$2=="REJECT"{print $1; exit}')
    if [ -n "$linha" ]; then
      iptables -I INPUT "$linha" -p tcp -m state --state NEW --dport "$porta" -j ACCEPT
    else
      iptables -A INPUT -p tcp -m state --state NEW --dport "$porta" -j ACCEPT
    fi
    echo "Porta $porta liberada."
  else
    echo "Porta $porta já estava liberada."
  fi
done
netfilter-persistent save >/dev/null 2>&1 || true

# ---------------------------------------------------------------------------
etapa "4/7 Node.js 22"
precisa_node=1
if command -v node >/dev/null 2>&1; then
  versao=$(node -p 'process.versions.node')
  maior=${versao%%.*}; resto=${versao#*.}; menor=${resto%%.*}
  if [ "$maior" -gt 22 ] || { [ "$maior" -eq 22 ] && [ "$menor" -ge 13 ]; }; then precisa_node=0; fi
fi
if [ "$precisa_node" -eq 1 ]; then
  base="https://nodejs.org/dist/latest-v22.x"
  somas=$(curl -fsSL "$base/SHASUMS256.txt")
  arquivo=$(awk '/linux-x64\.tar\.xz$/{print $2}' <<<"$somas")
  soma=$(awk '/linux-x64\.tar\.xz$/{print $1}' <<<"$somas")
  tmp=$(mktemp -d)
  curl -fsSL "$base/$arquivo" -o "$tmp/$arquivo"
  echo "$soma  $tmp/$arquivo" | sha256sum -c - >/dev/null
  tar -xJf "$tmp/$arquivo" -C /usr/local --strip-components=1
  rm -rf "$tmp"
fi
echo "Node.js $(node -v)"

# ---------------------------------------------------------------------------
etapa "5/7 Urna Eletrônica"
id urna >/dev/null 2>&1 || useradd --system --home "$PASTA_DADOS" --shell /usr/sbin/nologin urna
mkdir -p "$PASTA_DADOS"
chown urna:urna "$PASTA_DADOS"
chmod 750 "$PASTA_DADOS"

if [ -d "$PASTA_APP/.git" ]; then
  git -C "$PASTA_APP" fetch -q --depth 1 origin main
  git -C "$PASTA_APP" reset -q --hard origin/main
  echo "Urna atualizada para a versão mais nova do GitHub."
else
  git clone -q --depth 1 "$REPO" "$PASTA_APP"
  echo "Urna baixada do GitHub."
fi
cd "$PASTA_APP"
npm ci --omit=dev --no-audit --no-fund --loglevel=error

primeira_vez=0
if [ ! -f "$ARQ_CONFIG" ]; then
  primeira_vez=1
  SENHA_ADMIN="$(node -e '
    const c = require("crypto"), p = (a, n) => Array.from({ length: n }, () => a[c.randomInt(a.length)]).join("");
    console.log(p("abcdefghjkmnpqrstuvwxyz", 4) + "-" + p("23456789", 4));')"
  {
    echo "PORT=$PORTA"
    echo "DATA_DIR=$PASTA_DADOS"
    echo "TZ=America/Boa_Vista"
    echo "NODE_ENV=production"
    echo "ADMIN_SENHA=$SENHA_ADMIN"
  } > "$ARQ_CONFIG"
fi
# Cookie seguro só funciona com HTTPS (ou seja, quando há domínio).
sed -i '/^TRUST_PROXY=/d' "$ARQ_CONFIG"
if [ -n "$DOMINIO" ]; then echo "TRUST_PROXY=1" >> "$ARQ_CONFIG"; fi
chmod 600 "$ARQ_CONFIG"

cat > /etc/systemd/system/urnaeletronica.service <<EOF
[Unit]
Description=Urna Eletrônica
After=network-online.target
Wants=network-online.target

[Service]
User=urna
Group=urna
WorkingDirectory=$PASTA_APP
EnvironmentFile=$ARQ_CONFIG
ExecStart=/usr/local/bin/node --no-warnings=ExperimentalWarning src/server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=$PASTA_DADOS

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable -q urnaeletronica
systemctl restart urnaeletronica

# A senha provisória do administrador só é usada na primeira vez; depois sai do arquivo.
if [ "$primeira_vez" -eq 1 ]; then
  for _ in $(seq 1 30); do [ -f "$PASTA_DADOS/urna.db" ] && break; sleep 1; done
  sed -i '/^ADMIN_SENHA=/d' "$ARQ_CONFIG"
fi

for _ in $(seq 1 20); do curl -fsS -o /dev/null "http://127.0.0.1:$PORTA/login" && break; sleep 1; done
if curl -fsS -o /dev/null "http://127.0.0.1:$PORTA/login"; then
  echo "A urna está rodando na porta $PORTA."
else
  aviso "A urna não respondeu. Veja o erro com: sudo journalctl -u urnaeletronica -n 50"
  exit 1
fi

# ---------------------------------------------------------------------------
etapa "6/7 Caddy (HTTPS automático)"
if ! command -v caddy >/dev/null 2>&1; then
  curl -fsSL 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
  apt-get install -y -q caddy >/dev/null
fi
# Cada app tem o próprio arquivo em /etc/caddy/sites/; o Caddyfile principal só importa todos.
# Assim, atualizar a urna não mexe na configuração de outros apps do mesmo servidor.
mkdir -p /etc/caddy/sites
if ! grep -qs '^import sites/\*' /etc/caddy/Caddyfile; then
  if [ -s /etc/caddy/Caddyfile ] && ! grep -q 'Caddy Documentation\|caddyserver.com/docs/caddyfile' /etc/caddy/Caddyfile; then
    cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.antes-$(date +%Y%m%d%H%M%S)"
  fi
  printf '# Cada app tem o seu arquivo em /etc/caddy/sites/\nimport sites/*.caddy\n' > /etc/caddy/Caddyfile
fi
SITE=/etc/caddy/sites/urnaeletronica.caddy
if [ -n "$DOMINIO" ]; then
  cat > "$SITE" <<EOF
$DOMINIO {
	encode gzip
	reverse_proxy 127.0.0.1:$PORTA
	header {
		Strict-Transport-Security "max-age=31536000"
	}
}
EOF
else
  cat > "$SITE" <<EOF
:80 {
	encode gzip
	reverse_proxy 127.0.0.1:$PORTA
}
EOF
fi
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 || {
  aviso "A configuração do Caddy tem erro. Veja com: sudo caddy validate --config /etc/caddy/Caddyfile"; exit 1; }
systemctl enable -q caddy
systemctl reload caddy 2>/dev/null || systemctl restart caddy

# ---------------------------------------------------------------------------
etapa "7/7 Pronto"
IP=$(curl -fsS https://api.ipify.org 2>/dev/null || echo "IP-DO-SERVIDOR")
if [ -n "$DOMINIO" ]; then
  echo "Endereço da urna: https://$DOMINIO"
  echo "(O certificado HTTPS leva alguns segundos para ser emitido na primeira vez.)"
else
  echo "Endereço da urna: http://$IP"
  aviso "Sem domínio, a urna está sem HTTPS. Para usar com os professores, rode de novo informando o domínio do DuckDNS."
fi
if [ "$primeira_vez" -eq 1 ]; then
  echo
  echo "Primeiro acesso do administrador:"
  echo "   usuário: admin"
  echo "   senha provisória: $SENHA_ADMIN"
  aviso "Anote agora: essa senha não aparece de novo. No primeiro acesso, a urna pede uma senha nova."
fi
echo
echo "Comandos úteis:"
echo "   sudo systemctl status urnaeletronica     (ver se a urna está rodando)"
echo "   sudo journalctl -u urnaeletronica -n 50  (ver os últimos registros)"
echo "   sudo cp -r $PASTA_DADOS ~/backup-urna    (fazer backup dos dados)"
echo
echo "Outros apps no mesmo servidor: rode cada um numa porta interna diferente (a urna usa a $PORTA)"
echo "e crie um arquivo para ele em /etc/caddy/sites/, por exemplo /etc/caddy/sites/outroapp.caddy:"
echo "   outroapp.duckdns.org {"
echo "       reverse_proxy 127.0.0.1:3000"
echo "   }"
echo "Depois: sudo systemctl reload caddy"
