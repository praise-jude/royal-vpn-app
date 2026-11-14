#!/usr/bin/env python3
"""Royal-VPN exit server agent.

Runs on each exit server next to WireGuard (interface wg0). The Royal-VPN API calls it to:
  GET    /status  -> {"memUsedPct", "wgActivePeers", "peers"}
  POST   /peer    {"publicKey"} -> {"address"}   add a device (idempotent)
  DELETE /peer    {"publicKey"} -> {"ok": true}  remove a device
Every request needs the header x-royal-status-key. The firewall should also allow port 8081 only
from the Royal-VPN API server. Device addresses are kept in peers.json and re-applied on start.
Standard library only.
"""
import hmac
import ipaddress
import json
import os
import re
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn

IFACE = os.environ.get("WG_IFACE", "wg0")
PORT = int(os.environ.get("AGENT_PORT", "8081"))
# 127.0.0.1 when the Royal-VPN API runs on this same machine; 0.0.0.0 (firewalled) otherwise.
BIND = os.environ.get("AGENT_BIND", "0.0.0.0")
KEY = os.environ["STATUS_KEY"]
SUBNET = ipaddress.ip_network(os.environ.get("WG_SUBNET", "10.66.0.0/16"))
STATE = os.environ.get("STATE_FILE", "/var/lib/royal-vpn-agent/peers.json")
WG_KEY_RE = re.compile(r"^[A-Za-z0-9+/]{42,43}=$")

lock = threading.Lock()


def load():
    try:
        with open(STATE) as f:
            return json.load(f)
    except FileNotFoundError:
        return {}


def save(peers):
    os.makedirs(os.path.dirname(STATE), exist_ok=True)
    tmp = STATE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(peers, f)
    os.replace(tmp, STATE)


def wg(*args):
    # Python 3.6 compatible (no capture_output/text).
    return subprocess.run(["wg"] + list(args), check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True).stdout


def apply_peer(public_key, address):
    wg("set", IFACE, "peer", public_key, "allowed-ips", f"{address}/32")


def next_address(peers):
    used = set(peers.values())
    hosts = SUBNET.hosts()
    next(hosts)  # .1 is the server
    for ip in hosts:
        if str(ip) not in used:
            return str(ip)
    raise RuntimeError("address pool exhausted")


def status(peers):
    mem = {}
    with open("/proc/meminfo") as f:
        for line in f:
            k, v = line.split(":", 1)
            mem[k] = int(v.split()[0])
    used_pct = round(100 * (1 - mem.get("MemAvailable", 0) / mem["MemTotal"]), 1)
    active = 0
    now = time.time()
    for line in wg("show", IFACE, "latest-handshakes").splitlines():
        parts = line.split()
        if len(parts) == 2 and parts[1] != "0" and now - int(parts[1]) < 180:
            active += 1
    return {"memUsedPct": used_pct, "wgActivePeers": active, "peers": len(peers)}


class Handler(BaseHTTPRequestHandler):
    server_version = "royal-vpn-agent"

    def log_message(self, fmt, *args):  # keep the journal quiet; no client keys in logs
        pass

    def reply(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def authorized(self):
        return hmac.compare_digest(self.headers.get("x-royal-status-key", ""), KEY)

    def body_key(self):
        n = int(self.headers.get("content-length") or 0)
        if n > 4096:
            return None
        try:
            key = json.loads(self.rfile.read(n) or b"{}").get("publicKey", "")
        except ValueError:
            return None
        return key if isinstance(key, str) and WG_KEY_RE.match(key) else None

    def do_GET(self):
        if not self.authorized():
            return self.reply(401, {"error": "unauthorized"})
        if self.path != "/status":
            return self.reply(404, {"error": "not found"})
        with lock:
            return self.reply(200, status(load()))

    def do_POST(self):
        if not self.authorized():
            return self.reply(401, {"error": "unauthorized"})
        if self.path != "/peer":
            return self.reply(404, {"error": "not found"})
        key = self.body_key()
        if not key:
            return self.reply(400, {"error": "valid publicKey required"})
        with lock:
            peers = load()
            address = peers.get(key) or next_address(peers)
            apply_peer(key, address)
            peers[key] = address
            save(peers)
        return self.reply(200, {"address": address})

    def do_DELETE(self):
        if not self.authorized():
            return self.reply(401, {"error": "unauthorized"})
        if self.path != "/peer":
            return self.reply(404, {"error": "not found"})
        key = self.body_key()
        if not key:
            return self.reply(400, {"error": "valid publicKey required"})
        with lock:
            peers = load()
            if key in peers:
                wg("set", IFACE, "peer", key, "remove")
                del peers[key]
                save(peers)
        return self.reply(200, {"ok": True})


def main():
    with lock:
        for key, address in load().items():
            try:
                apply_peer(key, address)
            except subprocess.CalledProcessError:
                pass
    ThreadingHTTPServer((BIND, PORT), Handler).serve_forever()


class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):  # http.server's own version needs Python 3.7
    daemon_threads = True


if __name__ == "__main__":
    main()
