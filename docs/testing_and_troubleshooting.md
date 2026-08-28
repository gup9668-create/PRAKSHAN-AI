# Testing Protocol & Troubleshooting Guide: PRAKASHAN AI
### "Drying solutions for global agriculture"

This document provides agricultural guidelines, bench test procedures, telemetry packet samples, and systematic troubleshooting steps for the **Prakashan AI Smart Solar Seed Dryer**.

---

## 1. Agricultural Germination Safety Limits Matrix

Maintaining seed temperature strictly below crop-specific thermal thresholds is critical. If seed temperature exceeds the safe limit, seed proteins and germination enzymes denature, permanently destroying seed vigor.

| Crop / Seed Type | Safe Storage Moisture (%) | Max Safe Chamber Temp (°C) | Optimum Drying Temp Range (°C) | Airflow Requirement |
| :--- | :--- | :--- | :--- | :--- |
| **Paddy (Rice)** | **13.0%** | **42.0°C** | 35.0°C – 40.0°C | Moderate (50–70 CFM) |
| **Wheat** | **12.0%** | **40.0°C** | 32.0°C – 38.0°C | High (60–80 CFM) |
| **Maize (Corn)** | **13.5%** | **43.0°C** | 36.0°C – 41.0°C | High (70–90 CFM) |
| **Soybean** | **11.0%** | **38.0°C** | 30.0°C – 35.0°C | Gentle (40–55 CFM) |
| **Mustard / Rapeseed** | **8.5%** | **36.0°C** | 28.0°C – 34.0°C | Gentle (35–50 CFM) |

---

## 2. Step-by-Step Hardware Bench Testing Protocol

Follow these steps prior to loading seed into the drying chamber:

### Step 1: Power-On Self-Test (POST)
1. Connect the regulated 5V power supply to Arduino Uno.
2. Confirm the OLED display illuminates and displays the **PRAKASHAN AI** boot splash screen.
3. Observe the Serial Monitor at **115200 baud**. You should see the boot message:
   ```json
   {"system":"PRAKASHAN_AI","status":"BOOT_COMPLETE","tagline":"Drying solutions for global agriculture","version":"2.0"}
   ```

### Step 2: Actuator & Relay Verification
1. Open the Serial Monitor and send: `START`.
2. Confirm the Relay click is heard, the Green Status LED turns ON, and the 12V Blower Fan begins spinning.
3. Observe the Servo Motor moving the exhaust flap from 0° (closed) to 45°/75°.
4. Send command `STOP` and ensure the fan stops immediately and the flap closes to 0°.

### Step 3: High-Temperature Overheat Protection Simulation
1. Gently warm the DHT22 sensor with warm air (e.g. hairdryer held at distance) until temperature crosses $42^\circ\text{C}$.
2. Verify:
   - System state switches immediately from `DRYING` to `VENTILATING`.
   - Yellow LED turns ON.
   - Servo flap swings to **90° (Full Exhaust Flush)**.
   - Blower fan runs at maximum power to evacuate hot air.

### Step 4: MicroSD Card Data Logging Verification
1. Power down the system, remove the MicroSD card, and insert it into a PC.
2. Open `DATALOG.CSV` and verify recorded entries:
   ```csv
   Timestamp_s,Temp_C,Humidity_pct,Moisture_pct,Solar_pct,Bat_V,PV_V,Fan,Vent_deg,State
   15,35.4,46.2,19.2,85,12.65,18.20,1,45,1
   30,35.6,45.8,19.1,86,12.64,18.15,1,45,1
   ```

---

## 3. Sample Telemetry Packets & AI Model Output

### Arduino Uno Raw Telemetry JSON (Sent over Serial every 1.0s):
```json
{
  "temp": 36.8,
  "hum": 44.5,
  "moist": 18.2,
  "target_moist": 13.0,
  "solar_pct": 82,
  "bat_v": 12.65,
  "pv_v": 18.20,
  "fan": 1,
  "vent": 45,
  "state": "DRYING",
  "seed": "PADDY",
  "elapsed_s": 3600
}
```

### Prakashan AI Prediction Engine Output:
```json
{
  "temp": 36.8,
  "hum": 44.5,
  "moist": 18.2,
  "ai_insights": {
    "estimated_remaining_mins": 144.5,
    "estimated_remaining_hrs": 2.41,
    "emc_pct": 11.45,
    "germination_health_pct": 100,
    "max_safe_temp_c": 42.0,
    "moisture_delta": 5.2,
    "drying_efficiency_score": 93.4,
    "forecast_curve": [
      {"t_offset_mins": 30, "predicted_moisture": 17.12},
      {"t_offset_mins": 60, "predicted_moisture": 16.04},
      {"t_offset_mins": 90, "predicted_moisture": 14.96},
      {"t_offset_mins": 120, "predicted_moisture": 13.88}
    ],
    "active_alerts": []
  }
}
```

---

## 4. Comprehensive Troubleshooting Matrix

| Symptom / Fault | Potential Root Cause | Recommended Corrective Action |
| :--- | :--- | :--- |
| **OLED displays "CHECK SENSORS" & Buzzer beeping** | DHT22 pin loose, or moisture reading $<2\%$ or $>50\%$ | Check D2 connection. Inspect capacitive probe wiring on A0. Ensure probe is inserted in seed bed. |
| **Blower Fan does not turn ON when State is "DRYING"** | Relay coil not energized or 12V battery discharged | Check Relay VCC (5V) and IN (D8). Verify battery voltage is $>11.8\,\text{V}$ on Pin A2. Check relay NO/COM terminals. |
| **Servo flap jittering or resetting Arduino** | Servo motor drawing peak current spikes from Arduino 5V pin | Power servo motor VCC from a dedicated 5V buck converter output rail with common GND (never directly from Arduino 5V pin during high load). |
| **Moisture reading fluctuates rapidly** | Electrical noise on analog input line | Ensure multi-sample averaging is enabled (in code: `readFilteredAdc(PIN_MOISTURE_ADC, 12)`). Add $0.1\,\mu\text{F}$ capacitor across A0 and GND. |
| **Drying time estimation is too long (>10 hours)** | Chamber humidity is excessively high, or solar collector shaded | Ensure exhaust vent is open. Clear any obstructions from solar air inlet duct. |
| **SD card initialization failed (`SD.begin() fails`)** | SPI wiring error or card not formatted as FAT16/FAT32 | Ensure CS is connected to Pin 10, MOSI to D11, MISO to D12, SCK to D13. Format SD card with FAT32 file system. |
| **Web Serial connection error in Dashboard** | Browser permissions or baud rate mismatch | Use Google Chrome / Microsoft Edge. Ensure baud rate is set to **115200**. Close any other Arduino Serial Monitor windows before connecting. |
