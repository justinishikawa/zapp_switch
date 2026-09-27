#!/usr/bin/env python3
"""
zapp_switch local bridge (optional advanced mode)

Runs a tiny HTTP server on your network. The zapp_switch side-service
(running inside the Zepp app on your phone) calls it when "Local Bridge"
mode is selected in settings, and this script translates those calls into
TP-Link Kasa's local TCP protocol (port 9999, XOR-obfuscated JSON).

Why bother?
  * Works even if TP-Link's legacy cloud API rejects your account
    (some newer Kasa-app-only / Tapo-migrated accounts).
  * Faster — commands go straight over your LAN.
  * Keeps working if your internet drops.

Requirements: Python 3.8+, no third-party packages.

Usage:
    python3 kasa_bridge.py --light 192.168.1.42 --port 8765

Then in the Zepp app settings for zapp_switch set mode to "Local Bridge" and
bridge URL to  http://<this-machine-ip>:8765

Endpoints (used by the watch app):
    GET /status          -> {"state": 0|1}
    GET /set?state=0|1   -> {"state": 0|1}
    GET /toggle          -> {"state": 0|1}

NOTE: this speaks the *legacy* Kasa protocol (HS100/HS110/KP115/LB-series
era and most KL ones). Devices that only speak the newer KLAP handshake are
NOT supported here — use cloud mode for those.
"""

import argparse
import json
import socket
import struct
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

XOR_KEY = 0xAB
DEFAULT_KASA_PORT = 9999


# ---------------------------------------------------------------------------
# Kasa legacy wire protocol
# ---------------------------------------------------------------------------
def kasa_encrypt(plain: bytes) -> bytes:
    key = XOR_KEY
    out = bytearray()
    for b in plain:
        out.append(b ^ key)
        key = out[-1]
    return bytes(out)


def kasa_decrypt(cipher: bytes) -> bytes:
    key = XOR_KEY
    out = bytearray()
    for b in cipher:
        out.append(b ^ key)
        key = b
    return bytes(out)


def kasa_command(host: str, port: int, payload: dict, timeout: float = 5.0) -> dict:
    body = json.dumps(payload).encode()
    frame = struct.pack(">I", len(body)) + kasa_encrypt(body)

    with socket.create_connection((host, port), timeout=timeout) as sock:
        sock.sendall(frame)
        raw_len = b""
        while len(raw_len) < 4:
            chunk = sock.recv(4 - len(raw_len))
            if not chunk:
                raise ConnectionError("light closed connection")
            raw_len += chunk
        (length,) = struct.unpack(">I", raw_len)
        data = b""
        while len(data) < length:
            chunk = sock.recv(min(4096, length - len(data)))
            if not chunk:
                raise ConnectionError("light closed connection mid-message")
            data += chunk

    return json.loads(kasa_decrypt(data).decode())


CMD_ON = {"system": {"set_relay_state": {"state": 1}}}
CMD_OFF = {"system": {"set_relay_state": {"state": 0}}}
CMD_INFO = {"system": {"get_sysinfo": {}}}


# ---------------------------------------------------------------------------
# HTTP surface for the watch app
# ---------------------------------------------------------------------------
class BridgeHandler(BaseHTTPRequestHandler):
    light_host = "127.0.0.1"
    light_port = DEFAULT_KASA_PORT

    def _reply(self, obj: dict, code: int = 200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _state(self) -> int:
        resp = kasa_command(self.light_host, self.light_port, CMD_INFO)
        info = resp["system"]["get_sysinfo"]
        return 1 if info.get("relay_state") else 0

    def do_GET(self):  # noqa: N802 (http.server naming)
        from urllib.parse import urlparse, parse_qs

        url = urlparse(self.path)
        try:
            if url.path == "/status":
                self._reply({"ok": True, "state": self._state()})
            elif url.path == "/set":
                qs = parse_qs(url.query)
                want = int(qs.get("state", ["-1"])[0])
                if want not in (0, 1):
                    self._reply({"ok": False, "error": "state must be 0 or 1"}, 400)
                    return
                kasa_command(
                    self.light_host,
                    self.light_port,
                    CMD_ON if want == 1 else CMD_OFF,
                )
                self._reply({"ok": True, "state": self._state()})
            elif url.path == "/toggle":
                nxt = 0 if self._state() == 1 else 1
                kasa_command(
                    self.light_host, self.light_port, CMD_ON if nxt == 1 else CMD_OFF
                )
                self._reply({"ok": True, "state": self._state()})
            else:
                self._reply(
                    {"ok": False, "error": "use /status, /set?state=0|1 or /toggle"},
                    404,
                )
        except Exception as exc:  # surface any light error to the watch
            self._reply({"ok": False, "error": str(exc)}, 502)

    def log_message(self, *args):  # quiet by default
        pass


def main():
    parser = argparse.ArgumentParser(description="zapp_switch Kasa local bridge")
    parser.add_argument("--light", required=True, help="IP of the Kasa device")
    parser.add_argument(
        "--light-port", type=int, default=DEFAULT_KASA_PORT, help="Kasa TCP port"
    )
    parser.add_argument("--host", default="0.0.0.0", help="listen address")
    parser.add_argument("--port", type=int, default=8765, help="listen port")
    args = parser.parse_args()

    BridgeHandler.light_host = args.light
    BridgeHandler.light_port = args.light_port

    server = ThreadingHTTPServer((args.host, args.port), BridgeHandler)
    print(f"zapp_switch bridge listening on http://{args.host}:{args.port}")
    print(f"targeting Kasa device at {args.light}:{args.light_port}")
    print("Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
