#!/usr/bin/env bash
# Royal-VPN exit server on AlmaLinux / Rocky / RHEL 8 with firewalld (e.g. the Royalman Cloud server,
# where the Royal-VPN API runs on the same machine).
# Run as root:  ID=dal1 CITY=Dallas COUNTRY="United States" FLAG=🇺🇸 bash setup-almalinux.sh
# Safe to run again: keeps existing keys, devices and the status key.
#
# Isolation: VPN customers live in their own firewalld zone (royalvpn, target DROP), so they reach the
# internet but not this server's own services, and (zone forward=no) not each other. Outbound SMTP is
# blocked. The agent listens on 127.0.0.1 only; the only new public port is UDP 51820.
set -euo pipefail

: "${ID:?set ID, e.g. dal1}"
: "${CITY:?set CITY}"
: "${COUNTRY:?set COUNTRY}"
FLAG="${FLAG:-🌍}"
WG_PORT="${WG_PORT:-51820}"
AGENT_PORT="${AGENT_PORT:-8081}"
APP_GROUP="${APP_GROUP:-royalman}"
SUBNET="10.66.0.0/16"
DIR="$(cd "$(dirname "$0")" && pwd)"

[ "$(id -u)" = 0 ] || { echo "run as root"; exit 1; }
EXT_ZONE="$(firewall-cmd --get-default-zone)"

echo "== WireGuard (ELRepo kernel module)"
rpm -q elrepo-release >/dev/null 2>&1 || dnf -y -q install elrepo-release
rpm -q kmod-wireguard wireguard-tools >/dev/null 2>&1 || dnf -y -q install kmod-wireguard wireguard-tools
modprobe wireguard
echo wireguard > /etc/modules-load.d/wireguard.conf

echo "== keys and interface"
install -d -m 700 /etc/wireguard /etc/royal-vpn-agent
[ -f /etc/wireguard/server.key ] || (umask 077 && wg genkey > /etc/wireguard/server.key)
wg pubkey < /etc/wireguard/server.key > /etc/wireguard/server.pub
if [ ! -f /etc/wireguard/wg0.conf ]; then
  (umask 077 && cat > /etc/wireguard/wg0.conf <<CONF
[Interface]
Address = 10.66.0.1/16
ListenPort = ${WG_PORT}
PostUp = wg set %i private-key /etc/wireguard/server.key
CONF
)
fi

echo "== firewall"
firewall-cmd --permanent --get-zones | tr ' ' '\n' | grep -qx royalvpn || firewall-cmd -q --permanent --new-zone=royalvpn
firewall-cmd -q --permanent --zone=royalvpn --set-target=DROP
firewall-cmd -q --permanent --zone=royalvpn --add-interface=wg0 2>/dev/null || true
firewall-cmd -q --permanent --zone="$EXT_ZONE" --add-port="${WG_PORT}/udp"
firewall-cmd --permanent --get-policies | tr ' ' '\n' | grep -qx royalvpn-out || firewall-cmd -q --permanent --new-policy=royalvpn-out
firewall-cmd -q --permanent --policy=royalvpn-out --add-ingress-zone=royalvpn 2>/dev/null || true
firewall-cmd -q --permanent --policy=royalvpn-out --add-egress-zone="$EXT_ZONE" 2>/dev/null || true
firewall-cmd -q --permanent --policy=royalvpn-out --set-target=ACCEPT
# firewalld 0.9 refuses masquerade in a policy whose ingress zone has interfaces, so NAT is a direct rule
# limited to the VPN range leaving through the external interface.
EXT_IF="$(ip -4 route show default | awk '{print $5; exit}')"
firewall-cmd -q --permanent --direct --add-rule ipv4 nat POSTROUTING 0 -s "$SUBNET" -o "$EXT_IF" -j MASQUERADE 2>/dev/null || true
firewall-cmd -q --permanent --policy=royalvpn-out --add-rich-rule='rule family="ipv4" port port="25" protocol="tcp" reject' 2>/dev/null || true
firewall-cmd -q --reload

echo "== start WireGuard"
systemctl enable -q --now wg-quick@wg0 || systemctl restart wg-quick@wg0
firewall-cmd -q --zone=royalvpn --change-interface=wg0 2>/dev/null || true
sysctl -q -w net.ipv4.ip_forward=1
echo "net.ipv4.ip_forward = 1" > /etc/sysctl.d/99-royal-vpn.conf

echo "== agent (127.0.0.1:${AGENT_PORT})"
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
Environment=AGENT_BIND=127.0.0.1
ExecStart=/usr/bin/python3 /usr/local/bin/royal-vpn-agent
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable -q --now royal-vpn-agent
systemctl restart royal-vpn-agent

echo "== server list for the Royal-VPN API (/etc/royal-vpn/servers.json, root + ${APP_GROUP} only)"
PUBLIC_IP="$(ip -4 route get 1.1.1.1 | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}')"
. /etc/royal-vpn-agent/env
install -d -m 750 -g "$APP_GROUP" /etc/royal-vpn
(umask 027 && cat > /etc/royal-vpn/servers.json.tmp <<JSON
[{"id":"${ID}","city":"${CITY}","country":"${COUNTRY}","flag":"${FLAG}","statusHost":"127.0.0.1","statusPort":${AGENT_PORT},"statusKey":"${STATUS_KEY}","wgHost":"${PUBLIC_IP}","wgPort":${WG_PORT},"wgPublicKey":"$(cat /etc/wireguard/server.pub)"}]
JSON
)
chgrp "$APP_GROUP" /etc/royal-vpn/servers.json.tmp
mv /etc/royal-vpn/servers.json.tmp /etc/royal-vpn/servers.json

sleep 1
curl -s -m 5 -H "x-royal-status-key: ${STATUS_KEY}" "http://127.0.0.1:${AGENT_PORT}/status" && echo
echo "Done: ${CITY} exit server on ${PUBLIC_IP}:${WG_PORT}/udp. The Royal-VPN API picks it up within a minute."
