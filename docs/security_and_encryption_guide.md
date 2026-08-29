# 🛡️ Zero-Trust Security Architecture & Cryptographic Engine
### PRAKASHAN AI: "Drying solutions for global agriculture"
*Patent-Grade Architecture & Plagiarism-Free Engineering Specification*

---

## 1. Executive Security Summary

Agricultural IoT telemetry and drying control systems face three major vulnerabilities:
1. **False Data Injection Attacks (FDIA)**: Malicious manipulation of temperature and moisture telemetry to intentionally overheat seed embryos and destroy germination rates.
2. **Replay & Command Hijacking**: Intercepting valid control packets (`START`, `STOP`, `VENT_FLUSH`) and replaying them to disrupt drying kinetics.
3. **Sensor Spoofing & Denial of Service (DoS)**: Overwhelming embedded edge controllers (ESP32/Arduino) with unconstrained telemetry bursts.

**PRAKASHAN AI** integrates a multi-layered **Zero-Trust Cryptographic Micro-Firewall** directly at both the hardware edge and cloud layer.

---

## 2. Cryptographic Security Model (AES-256 + HMAC-SHA256)

```text
+-----------------------------------------------------------------------------+
|                      PRAKASHAN ZERO-TRUST DATA ENVELOPE                     |
+-----------------------------------------------------------------------------+
|  1. Plaintext JSON Telemetry Payload                                        |
|     {"temp":34.2, "hum":48.0, "moist":18.0, "seed":"GROUNDNUT"}             |
|                                                                             |
|  2. Cryptographic Key Derivation (HKDF / SHA-256)                          |
|     Master Key + Salt -> 256-bit Encryption Key (K_enc)                     |
|     Master Key + Salt -> 256-bit Integrity Key (K_hmac)                     |
|                                                                             |
|  3. AES-256-CBC Payload Encryption with Random 128-bit IV                  |
|     Ciphertext = Encrypt(K_enc, IV, Plaintext)                              |
|                                                                             |
|  4. Anti-Replay Nonce & Timestamp Envelope Binding                          |
|     Envelope = { IV, Ciphertext, Timestamp, Nonce }                         |
|                                                                             |
|  5. Message Authentication Code (MAC) Generation                            |
|     Signature = HMAC-SHA256(K_hmac, Nonce : IV : Ciphertext : Timestamp)    |
+-----------------------------------------------------------------------------+
```

### Mathematical Formula for Message Verification:
$$Signature = \text{HMAC-SHA256}\Big(K_{\text{hmac}}, \text{Nonce} \parallel IV \parallel \text{Ciphertext} \parallel \text{Timestamp}\Big)$$

---

## 3. Application-Layer Micro-Firewall Architecture

The **Prakashan Micro-Firewall** executes 4 layers of deep packet inspection (DPI):

1. **Sliding-Window Rate Limiter**:
   - Enforces a strict limit of **120 Requests Per Minute (RPM)** per client IP address.
   - Automatically bans offending IPs for 300 seconds if rate limit is exceeded.

2. **Physical Sensor Bounds Validation**:
   - Rejects physically impossible agricultural telemetry:
     * Temperature: $-10.0^\circ\text{C} \le T \le 85.0^\circ\text{C}$
     * Relative Humidity: $0.0\% \le RH \le 100.0\%$
     * Seed Moisture: $1.0\% \le M \le 50.0\%$

3. **Injection & Malicious Payload Shield**:
   - Defends against SQL injection (`' OR '1'='1`, `DROP TABLE`), Cross-Site Scripting (`<script>`), buffer overflows, and null-byte `%00` terminations.

4. **Freshness & Replay Defense**:
   - Rejects any telemetry packet with a timestamp skew $|\Delta t| > 120\text{ seconds}$.

---

## 4. Plagiarism-Free Innovation Highlights (Evaluation Panel Guide)

| Innovation Vector | Traditional IoT Systems | PRAKASHAN AI Solution |
| :--- | :--- | :--- |
| **Telemetry Transport** | Unencrypted plaintext JSON/MQTT | Zero-Trust AES-256 Envelope + HMAC-SHA256 |
| **Drying Kinetics** | Simple static timer or fixed hysteresis | Adaptive Page & Oswin Thin-Layer Thermodynamic Model |
| **Embryo Protection** | Generic temperature trip points | Dynamic Thermal Embryo Guard (DTEG) algorithm |
| **Security Layer** | None / relies on perimeter network | Embedded Micro-Firewall with DPI & Anti-Replay |
| **Crop Versatility** | Fixed for 1 crop type | 5 Dynamically Tuned Crop Profiles (Paddy, Groundnut, Maize, Soybean, Mustard) |

---

## 5. Security API Endpoints

- **`GET /api/secure-telemetry`**: Delivers real-time AES-256 encrypted & HMAC-SHA256 signed agricultural telemetry envelope.
- **`GET /api/security-status`**: Returns live firewall statistics (total clean packets, blocked attacks, active cipher standard).
- **`POST /api/secure-telemetry`**: Decrypts, verifies, and sanitizes incoming cloud control setpoints before dispatching to ESP32 hardware.
