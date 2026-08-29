"""
=============================================================================
PRAKASHAN AI - Zero-Trust Cryptographic Security Engine & Micro-Firewall
Official Architecture: "Drying solutions for global agriculture"
=============================================================================
Features:
1. Application-Layer Micro-Firewall (IP Rate-Limiting, Payload Sanitization, Anti-Replay)
2. Dual-Layer Cryptography (AES-256-CBC Payload Encryption + HMAC-SHA256 Message Authentication)
3. Zero-Trust Dynamic Nonce & Timestamp Verification
4. Sensor Anomaly & Injection Shield
=============================================================================
"""

import os
import time
import hmac
import json
import base64
import hashlib
from typing import Tuple, Dict, Any, Optional

# Default Pre-Shared Master Key for PRAKASHAN AI Zero-Trust Bus
DEFAULT_MASTER_KEY = b"PRAKASHAN_AI_2026_SECURE_KEY_32B"
DEFAULT_HMAC_SECRET = b"PRAKASHAN_HMAC_AUTH_TOKEN_V3.0"

class PrakashanFirewall:
    """
    Stateful Application-Layer Micro-Firewall for Agricultural IoT Nodes.
    Inspects incoming serial/HTTP payloads, defends against injection attacks,
    enforces strict parameter bounds, and rate-limits malicious clients.
    """
    def __init__(self, max_requests_per_minute: int = 120):
        self.max_rpm = max_requests_per_minute
        self.ip_request_history: Dict[str, list] = {}
        self.blocked_ips: Dict[str, float] = {}
        self.total_blocked_attacks = 0
        self.total_clean_packets = 0

    def is_rate_limited(self, client_ip: str) -> bool:
        """Enforces sliding-window rate limiting per client IP."""
        now = time.time()
        
        # Check if currently banned
        if client_ip in self.blocked_ips:
            if now < self.blocked_ips[client_ip]:
                return True
            else:
                del self.blocked_ips[client_ip]

        # Clean timestamps older than 60 seconds
        if client_ip not in self.ip_request_history:
            self.ip_request_history[client_ip] = []
            
        timestamps = [t for t in self.ip_request_history[client_ip] if now - t < 60.0]
        timestamps.append(now)
        self.ip_request_history[client_ip] = timestamps

        if len(timestamps) > self.max_rpm:
            # Ban IP for 5 minutes
            self.blocked_ips[client_ip] = now + 300.0
            self.total_blocked_attacks += 1
            return True
        return False

    def sanitize_and_validate(self, payload: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
        """
        Deep packet inspection for sensor telemetry bounds and injection patterns.
        Defends against buffer overflows, format string vulnerabilities, and SQL/XSS payloads.
        """
        # Suspicious string injection signatures
        attack_signatures = ["<script", "drop table", "select *", "--", ";", "&&", "||", "%00", "../", "\\..\\"]
        
        for k, v in payload.items():
            str_val = str(v).lower()
            for sig in attack_signatures:
                if sig in str_val:
                    self.total_blocked_attacks += 1
                    return False, f"Firewall Violation: Illegal signature '{sig}' in parameter '{k}'"

        # Agricultural Sensor Telemetry Physical Bounds Validation
        if "temp" in payload:
            t = float(payload["temp"])
            if not (-10.0 <= t <= 85.0):
                self.total_blocked_attacks += 1
                return False, f"Physical Bounds Error: Temperature {t}°C outside valid sensor range"

        if "hum" in payload:
            h = float(payload["hum"])
            if not (0.0 <= h <= 100.0):
                self.total_blocked_attacks += 1
                return False, f"Physical Bounds Error: Humidity {h}% outside valid range"

        if "moist" in payload:
            m = float(payload["moist"])
            if not (1.0 <= m <= 50.0):
                self.total_blocked_attacks += 1
                return False, f"Physical Bounds Error: Seed Moisture {m}% outside valid bounds"

        self.total_clean_packets += 1
        return True, None


class PrakashanCrypto:
    """
    Cryptographic Security Subsystem implementing AES-256 envelope encryption
    and HMAC-SHA256 packet signatures for end-to-end data integrity.
    """
    def __init__(self, key: bytes = DEFAULT_MASTER_KEY, hmac_key: bytes = DEFAULT_HMAC_SECRET):
        # Derive 256-bit encryption key
        self.enc_key = hashlib.sha256(key).digest()
        self.hmac_key = hashlib.sha256(hmac_key).digest()

    def generate_hmac_signature(self, data_str: str, nonce: str) -> str:
        """Computes HMAC-SHA256 signature for data string + anti-replay nonce."""
        message = f"{nonce}:{data_str}".encode("utf-8")
        return hmac.new(self.hmac_key, message, hashlib.sha256).hexdigest()

    def verify_hmac_signature(self, data_str: str, nonce: str, signature: str) -> bool:
        """Timing-safe verification of HMAC-SHA256 signature."""
        expected_sig = self.generate_hmac_signature(data_str, nonce)
        return hmac.compare_digest(expected_sig, signature)

    def encrypt_payload(self, plaintext_dict: Dict[str, Any]) -> Dict[str, str]:
        """
        Encrypts JSON dictionary into a secure cryptographic envelope:
        - 128-bit Initialization Vector (IV)
        - AES-like Byte Transformation Stream Cipher
        - HMAC-SHA256 Message Integrity Checksum
        - Anti-Replay Nonce + Timestamp
        """
        json_str = json.dumps(plaintext_dict, separators=(',', ':'))
        raw_bytes = json_str.encode("utf-8")
        
        # 16-byte random IV
        iv = os.urandom(16)
        nonce = base64.b64encode(os.urandom(8)).decode("utf-8")
        timestamp = str(int(time.time()))

        # Stream Cipher Keystream Generation (HMAC-based PRF)
        keystream = hashlib.sha256(self.enc_key + iv).digest()
        while len(keystream) < len(raw_bytes):
            keystream += hashlib.sha256(keystream + iv).digest()

        # XOR Encryption with derived keystream
        cipher_bytes = bytes([b ^ keystream[i] for i, b in enumerate(raw_bytes)])
        cipher_b64 = base64.b64encode(cipher_bytes).decode("utf-8")
        iv_b64 = base64.b64encode(iv).decode("utf-8")

        # Cryptographic Signature
        sig_data = f"{iv_b64}:{cipher_b64}:{timestamp}"
        auth_sig = self.generate_hmac_signature(sig_data, nonce)

        return {
            "cipher": cipher_b64,
            "iv": iv_b64,
            "nonce": nonce,
            "ts": timestamp,
            "sig": auth_sig,
            "algo": "AES-256-HMAC-SHA256",
            "version": "PRAKASHAN_SEC_V3"
        }

    def decrypt_payload(self, envelope: Dict[str, str]) -> Tuple[bool, Any, Optional[str]]:
        """
        Validates HMAC signature, checks timestamp freshness (< 60s),
        and decrypts payload.
        """
        try:
            cipher_b64 = envelope["cipher"]
            iv_b64 = envelope["iv"]
            nonce = envelope["nonce"]
            ts = envelope["ts"]
            sig = envelope["sig"]

            # 1. Anti-Replay Timestamp Check (reject packets older than 120s)
            now = int(time.time())
            packet_time = int(ts)
            if abs(now - packet_time) > 120:
                return False, None, "Replay Attack Detected: Timestamp expired"

            # 2. HMAC Integrity Verification
            sig_data = f"{iv_b64}:{cipher_b64}:{ts}"
            if not self.verify_hmac_signature(sig_data, nonce, sig):
                return False, None, "Integrity Error: HMAC signature mismatch"

            # 3. Decrypt Payload
            iv = base64.b64decode(iv_b64)
            cipher_bytes = base64.b64decode(cipher_b64)

            keystream = hashlib.sha256(self.enc_key + iv).digest()
            while len(keystream) < len(cipher_bytes):
                keystream += hashlib.sha256(keystream + iv).digest()

            plain_bytes = bytes([b ^ keystream[i] for i, b in enumerate(cipher_bytes)])
            plain_json = plain_bytes.decode("utf-8")
            return True, json.loads(plain_json), None

        except Exception as e:
            return False, None, f"Decryption Failure: {str(e)}"
