"""
CDP helper — proper WebSocket client with frame masking.
Usage: from scripts.cdp_helper import CDP
"""
import os, json, socket, struct, base64, re, time, urllib.request


class CDP:
    def __init__(self, ws_url, timeout=20):
        self.ws_url = ws_url
        self.timeout = timeout
        self._seq = 0
        self.sock = None
        self._connect()

    def _connect(self):
        m = re.match(r'ws://([^/]+)(/.+)', self.ws_url)
        hostname, port_str = m.group(1).split(':')
        self.port = int(port_str)
        self.hostname = hostname
        self.path = m.group(2)
        self.sock = socket.create_connection((hostname, self.port), timeout=self.timeout)
        nonce = base64.b64encode(os.urandom(16)).decode()
        self.sock.sendall((
            f'GET {self.path} HTTP/1.1\r\nHost: {hostname}:{self.port}\r\n'
            'Upgrade: websocket\r\nConnection: Upgrade\r\n'
            f'Sec-WebSocket-Key: {nonce}\r\nSec-WebSocket-Version: 13\r\n\r\n'
        ).encode())
        resp = b''
        while b'\r\n\r\n' not in resp:
            resp += self.sock.recv(4096)
        assert b'101' in resp, f'WS upgrade failed: {resp[:200]}'

    def send(self, method, params=None):
        self._seq += 1
        msg_id = self._seq
        payload = json.dumps({'id': msg_id, 'method': method, 'params': params or {}}).encode()
        n = len(payload)
        mask = os.urandom(4)
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        if n < 126:
            header = bytes([0x81, 0x80 | n]) + mask
        elif n < 65536:
            header = bytes([0x81, 0xfe]) + struct.pack('>H', n) + mask
        else:
            header = bytes([0x81, 0xff]) + struct.pack('>Q', n) + mask
        self.sock.sendall(header + masked)
        return msg_id

    def recv_until(self, msg_id, timeout=None):
        self.sock.settimeout(timeout or self.timeout)
        raw = b''
        while True:
            try:
                chunk = self.sock.recv(16384)
            except socket.timeout:
                return None, 'timeout'
            if not chunk:
                return None, 'closed'
            raw += chunk
            while len(raw) >= 2:
                pl = raw[1] & 0x7f
                hdr = 2
                if pl == 126:
                    if len(raw) < 4: break
                    pl = struct.unpack('>H', raw[2:4])[0]; hdr = 4
                elif pl == 127:
                    if len(raw) < 10: break
                    pl = struct.unpack('>Q', raw[2:10])[0]; hdr = 10
                if len(raw) < hdr + pl: break
                try:
                    msg = json.loads(raw[hdr:hdr+pl])
                except Exception:
                    raw = raw[hdr+pl:]; continue
                raw = raw[hdr+pl:]
                if msg.get('id') == msg_id:
                    return msg.get('result'), msg.get('error')
                # ignore events and other messages

    def call(self, method, params=None, timeout=None):
        mid = self.send(method, params)
        return self.recv_until(mid, timeout)

    def eval(self, expression):
        result, err = self.call('Runtime.evaluate', {'expression': expression, 'returnByValue': True})
        if err:
            return None
        return result.get('result', {}).get('value') if result else None

    def type_into(self, selector, text, clear_first=True):
        """Focus element and type text using real key events — works on React inputs."""
        # Focus
        self.call('Runtime.evaluate', {'expression': f'document.querySelector({json.dumps(selector)})?.focus()'})
        time.sleep(0.1)
        if clear_first:
            # Select all and delete
            self.call('Input.dispatchKeyEvent', {'type': 'keyDown', 'key': 'a', 'code': 'KeyA', 'modifiers': 2})
            self.call('Input.dispatchKeyEvent', {'type': 'keyUp', 'key': 'a', 'code': 'KeyA', 'modifiers': 2})
            self.call('Input.dispatchKeyEvent', {'type': 'keyDown', 'key': 'Backspace', 'code': 'Backspace'})
            self.call('Input.dispatchKeyEvent', {'type': 'keyUp', 'key': 'Backspace', 'code': 'Backspace'})
            time.sleep(0.05)
        for ch in text:
            self.call('Input.dispatchKeyEvent', {'type': 'char', 'text': ch})
            time.sleep(0.02)

    def click(self, selector):
        self.eval(f'document.querySelector({json.dumps(selector)})?.click()')

    def close(self):
        if self.sock:
            self.sock.close()
            self.sock = None

    @staticmethod
    def get_tab(url_contains):
        targets = json.loads(urllib.request.urlopen('http://localhost:9222/json').read())
        tab = next((t for t in targets if url_contains in t.get('url', '') and t.get('type') == 'page'), None)
        if not tab:
            raise RuntimeError(f'No page tab matching {url_contains!r}. Open tabs: {[t.get("url") for t in targets if t.get("type") == "page"]}')
        return CDP(tab['webSocketDebuggerUrl'])
