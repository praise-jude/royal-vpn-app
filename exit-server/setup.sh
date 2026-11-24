#!/usr/bin/env bash
# Turns a fresh Ubuntu server (e.g. Oracle Cloud Always Free) into a Royal-VPN exit server.
# Run as root:  API_IP=<Royalman Cloud server IP> CITY=Lagos COUNTRY=Nigeria FLAG=🇳🇬 ID=lag1 bash setup.sh
# Safe to run again: keeps existing keys, peers and status key.
set -euo pipefail

: "${API_IP:?set API_IP to the public IP of the Royal-VPN API server (only it may reach the agent)}"
: "${ID:?set ID, e.g. lag1}"
: "${CITY:?set CITY}"
: "${COUNTRY:?set COUNTRY}"
FLAG="${FLAG:-🌍}"
WG_PORT="${WG_PORT:-51820}"
AGENT_PORT="${AGENT_PORT:-8081}"
SUBNET="10.66.0.0/16"
DIR="$(cd "$(dirname "$0")" && pwd)"

[ "$(id -u)" = 0 ] || { echo "run as root"; exit 1; }

echo "== packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq wireguard iptables-persistent python3 >/dev/null

echo "== WireGuard key and interface"
install -d -m 700 /etc/wireguard /etc/royal-vpn-agent
[ -f /etc/wireguard/server.key ] || (umask 077 && wg genkey > /etc/wireguard/server.key)
wg pubkey < /etc/wireguard/server.key > /etc/wireguard/server.pub
EXT_IF="$(ip -4 route show default | awk '{print $5; exit}')"
if [ ! -f /etc/wireguard/wg0.conf ]; then
  umask 077
  cat > /etc/wireguard/wg0.conf <<CONF
[Interface]
Address = 10.66.0.1/16
ListenPort = ${WG_PORT}
PostUp = wg set %i private-key /etc/wireguard/server.key
CONF
fi

echo "== routing and firewall"
cat > /etc/sysctl.d/99-royal-vpn.conf <<SYS
net.ipv4.ip_forward = 1
SYS
sysctl -q --system

add_rule() { iptables -C "$@" 2>/dev/null || iptables -I "$@"; }
# Oracle's Ubuntu images end INPUT with a REJECT, so rules are inserted at the top.
add_rule INPUT -p udp --dport "$WG_PORT" -j ACCEPT
add_rule INPUT -p tcp -s "$API_IP" --dport "$AGENT_PORT" -j ACCEPT
iptables -C INPUT -p tcp --dport "$AGENT_PORT" -j DROP 2>/dev/null || iptables -A INPUT -p tcp --dport "$AGENT_PORT" -j DROP
# Customers can reach the internet but not each other or this server's private services.
add_rule FORWARD -i wg0 -o wg0 -j DROP
add_rule FORWARD -i wg0 -o "$EXT_IF" -j ACCEPT
add_rule FORWARD -i "$EXT_IF" -o wg0 -m state --state RELATED,ESTABLISHED -j ACCEPT
iptables -t nat -C POSTROUTING -s "$SUBNET" -o "$EXT_IF" -j MASQUERADE 2>/dev/null || iptables -t nat -A POSTROUTING -s "$SUBNET" -o "$EXT_IF" -j MASQUERADE
# Outbound mail is a common abuse route; block SMTP from VPN customers.
add_rule FORWARD -i wg0 -p tcp --dport 25 -j DROP
netfilter-persistent save >/dev/null

systemctl enable --now wg-quick@wg0 >/dev/null 2>&1 || systemctl restart wg-quick@wg0

echo "== agent"
install -m 755 "$DIR/agent.py" /usr/local/bin/royal-vpn-agent
[ -f /etc/royal-vpn-agent/env ] || (umask 077 && echo "STATUS_KEY=$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 40)" > /etc/royal-vpn-agent/env)
cat > /etc/systemd/system/royal-vpn-agent.service <<UNIT
[Unit]
Description=Royal-VPN exit server agent
After=wg-quick@wg0.service
Requires=wg-quick@wg0.service

[Service]
EnvironmentFile=/etc/royal-vpn-agent/env
Environment=AGENT_PORT=${AGENT_PORT}
ExecStart=/usr/bin/python3 /usr/local/bin/royal-vpn-agent
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now royal-vpn-agent >/dev/null 2>&1
systemctl restart royal-vpn-agent
sleep 1
systemctl is-active --quiet royal-vpn-agent && echo "agent running on :$AGENT_PORT"

PUBLIC_IP="$(curl -s -4 --max-time 5 https://api.ipify.org || hostname -I | awk '{print $1}')"
. /etc/royal-vpn-agent/env
umask 077
cat > /root/royal-vpn-server-entry.json <<JSON
{"id":"${ID}","city":"${CITY}","country":"${COUNTRY}","flag":"${FLAG}","statusHost":"${PUBLIC_IP}","statusPort":${AGENT_PORT},"statusKey":"${STATUS_KEY}","wgHost":"${PUBLIC_IP}","wgPort":${WG_PORT},"wgPublicKey":"$(cat /etc/wireguard/server.pub)"}
JSON
echo
echo "Done. This server's REAL_SERVERS entry (contains a secret) is in /root/royal-vpn-server-entry.json"
echo "Also open UDP ${WG_PORT} (anyone) and TCP ${AGENT_PORT} (from ${API_IP} only) in your cloud provider's firewall."
