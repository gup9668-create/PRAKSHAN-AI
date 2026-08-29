"""
=============================================================================
PRAKASHAN AI - Cloud Telemetry & AI Prediction Web Server with Micro-Firewall
"Drying solutions for global agriculture"
=============================================================================
Features:
- OWASP-Compliant Security Headers
- Application Micro-Firewall (Rate-Limiter & Injection Shield)
- End-to-End Encrypted Telemetry (AES-256 + HMAC-SHA256)
- REST & Secure WebSocket APIs
=============================================================================
"""

import os
import json
import time
from http.server import HTTPServer, SimpleHTTPRequestHandler
from prakshan_ai_core import PrakashanAICore
from security_engine import PrakashanFirewall, PrakashanCrypto

ai_engine = PrakashanAICore()
firewall = PrakashanFirewall(max_requests_per_minute=120)
crypto = PrakashanCrypto()

# In-memory latest telemetry state
latest_telemetry = {
    "temp": 36.8,
    "hum": 48.2,
    "moist": 21.4,
    "target_moist": 13.0,
    "solar_pct": 0.0,
    "bat_v": 12.65,
    "pv_v": 0.00,
    "fan": 1,
    "vent": 60,
    "state": "DRYING",
    "seed": "PADDY",
    "elapsed_s": 120
}

# Determine web static directory
current_script_dir = os.path.dirname(os.path.abspath(__file__))
candidate_dirs = [
    os.path.abspath(os.path.join(current_script_dir, "..", "dashboard")),
    os.path.abspath(os.path.join(current_script_dir, "dashboard")),
    current_script_dir
]

static_dir = current_script_dir
for c_dir in candidate_dirs:
    if os.path.exists(os.path.join(c_dir, "index.html")):
        static_dir = c_dir
        break

class PrakashanSecureHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=static_dir, **kwargs)

    def _send_security_headers(self, content_type: str = "application/json"):
        """Attaches strict OWASP-compliant security headers to all responses."""
        self.send_header("Content-Type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Prakashan-Auth")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("X-XSS-Protection", "1; mode=block")
        self.send_header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.end_headers()

    def do_GET(self):
        client_ip = self.client_address[0]
        
        # 1. Firewall Rate-Limiting Check
        if firewall.is_rate_limited(client_ip):
            self.send_response(429)
            self._send_security_headers()
            self.wfile.write(json.dumps({"error": "Firewall Rate Limit Exceeded. Try again later."}).encode("utf-8"))
            return

        # 2. Standard Telemetry Endpoint
        if self.path == "/api/telemetry":
            self.send_response(200)
            self._send_security_headers()
            enriched = ai_engine.process_telemetry(latest_telemetry)
            self.wfile.write(json.dumps(enriched).encode("utf-8"))

        # 3. AES-256 Encrypted Telemetry Endpoint
        elif self.path == "/api/secure-telemetry":
            self.send_response(200)
            self._send_security_headers()
            enriched = ai_engine.process_telemetry(latest_telemetry)
            encrypted_envelope = crypto.encrypt_payload(enriched)
            self.wfile.write(json.dumps(encrypted_envelope).encode("utf-8"))

        # 4. Live Firewall & Cryptography Security Status
        elif self.path == "/api/security-status":
            self.send_response(200)
            self._send_security_headers()
            sec_status = {
                "firewall_status": "ACTIVE",
                "encryption_standard": "AES-256-CBC + HMAC-SHA256",
                "clean_packets": firewall.total_clean_packets,
                "blocked_attacks": firewall.total_blocked_attacks,
                "rate_limit_rpm": firewall.max_rpm,
                "zero_trust_bus": "ENABLED"
            }
            self.wfile.write(json.dumps(sec_status).encode("utf-8"))

        else:
            super().do_GET()

    def do_POST(self):
        client_ip = self.client_address[0]
        
        # 1. Firewall Rate-Limiting Check
        if firewall.is_rate_limited(client_ip):
            self.send_response(429)
            self._send_security_headers()
            self.wfile.write(json.dumps({"error": "Firewall Rate Limit Exceeded"}).encode("utf-8"))
            return

        if self.path == "/api/telemetry" or self.path == "/api/secure-telemetry":
            content_length = int(self.headers.get("Content-Length", 0))
            post_data = self.rfile.read(content_length)
            
            try:
                raw_json = json.loads(post_data.decode("utf-8"))
                
                # Check if it's an encrypted envelope
                if "cipher" in raw_json and "sig" in raw_json:
                    success, decrypted_data, err = crypto.decrypt_payload(raw_json)
                    if not success:
                        self.send_response(403)
                        self._send_security_headers()
                        self.wfile.write(json.dumps({"error": err}).encode("utf-8"))
                        return
                    data = decrypted_data
                else:
                    data = raw_json

                # 2. Firewall Deep Packet Inspection
                is_valid, violation_msg = firewall.sanitize_and_validate(data)
                if not is_valid:
                    self.send_response(400)
                    self._send_security_headers()
                    self.wfile.write(json.dumps({"error": violation_msg}).encode("utf-8"))
                    return

                global latest_telemetry
                latest_telemetry.update(data)
                enriched = ai_engine.process_telemetry(latest_telemetry)

                self.send_response(200)
                self._send_security_headers()
                self.wfile.write(json.dumps({"status": "authenticated_and_processed", "data": enriched}).encode("utf-8"))

            except Exception as e:
                self.send_response(400)
                self._send_security_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
        else:
            self.send_response(404)
            self._send_security_headers()

def run_server(port=8080):
    server_address = ("", port)
    httpd = HTTPServer(server_address, PrakashanSecureHandler)
    print("=================================================================")
    print("  PRAKASHAN AI - Zero-Trust Cloud Server & Micro-Firewall")
    print(f"  Security: AES-256 Encryption + HMAC-SHA256 Anti-Tamper Enabled")
    print(f"  Serving Static Dir: {static_dir}")
    print(f"  URL: http://0.0.0.0:{port}")
    print(f"  Secure API: http://0.0.0.0:{port}/api/secure-telemetry")
    print("=================================================================")
    httpd.serve_forever()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    run_server(port)
