/*
 ============================================================================
  PRAKASHAN AI - AI-Powered Smart Solar Seed Dryer
  "Drying solutions for global agriculture"
  ESP32 Hardware Controller Firmware
 ============================================================================
  Hardware Pinout Configuration (ESP32 DevKit V1 / NodeMCU-32S):
  - Soil / Seed Moisture Sensor:  GPIO 34 (ADC1_CH6, 12-bit ADC)
  - DHT22 (Temp & Humidity):      GPIO 4
  - DC Blower Relay (Fan):        GPIO 26 (Active LOW)
  - Green Status LED (Normal):    GPIO 16
  - Yellow Status LED (Warning):  GPIO 17
  - Red Status LED (Alarm):       GPIO 18
  - Active Buzzer (Alarm):        GPIO 19
  - I2C OLED SSD1306 (128x64):    SDA -> GPIO 21, SCL -> GPIO 22

  Communication & Dashboard Linking:
  - Real-time JSON Telemetry streaming over USB Serial (115200 baud)
  - Seamless 2-way link with Prakashan AI Web Dashboard (Web Serial API)
  - Non-blocking millis() control loop (zero delay freeze)
  - Crop presets: Paddy (13.0%), Groundnut (9.0%), Maize (13.5%), Soybean (11.0%), Mustard (8.5%)
 ============================================================================
*/

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <DHT.h>

// ==========================================
// PIN DEFINITIONS (ESP32)
// ==========================================
#define SOIL_PIN        34      // Capacitive Seed/Soil Moisture Sensor (ADC)
#define DHT_PIN         4       // DHT22 Data Pin
#define RELAY_PIN       26      // DC Blower Relay (Active LOW)

#define GREEN_LED       16      // Green LED: Normal Drying
#define YELLOW_LED      17      // Yellow LED: Warning / Fan ON
#define RED_LED         18      // Red LED: Critical Overheat / Fault

#define BUZZER_PIN      19      // Active Alarm Buzzer

#define SDA_PIN         21      // I2C SDA Pin
#define SCL_PIN         22      // I2C SCL Pin

// ==========================================
// SENSOR & OLED CONFIGURATION
// ==========================================
#define DHTTYPE         DHT22
#define SCREEN_WIDTH    128
#define SCREEN_HEIGHT   64
#define OLED_RESET      -1
#define OLED_I2C_ADDR   0x3C

DHT dht(DHT_PIN, DHTTYPE);
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// Capacitive Sensor 12-bit ADC Calibration (ESP32 ADC: 0 - 4095)
int dryValue = 3000;    // Raw ADC in dry grain/air (0% mapped relative baseline)
int wetValue = 1200;    // Raw ADC in saturated wet grain (~35% moisture)

// ==========================================
// CROP PRESETS & THRESHOLDS
// ==========================================
float targetMoisture      = 13.0; // Target safe storage moisture (%)
float maxSafeTemp         = 42.0; // Upper critical safe temperature (°C)
float maxAmbientHumidity  = 80.0; // Ambient RH warning limit (%)

enum SystemState {
  STATE_IDLE,
  STATE_DRYING,
  STATE_VENTILATING,
  STATE_COMPLETED,
  STATE_ALARM_ERROR
};

SystemState currentState = STATE_DRYING;

// Telemetry Variables
float currentTemp       = 0.0;
float currentHumidity   = 0.0;
float currentMoisture   = 0.0;
int   rawSoilADC        = 0;
bool  fanState          = false;
int   ventAngle         = 45;
bool  buzzerState       = false;
bool  oledAvailable     = false;

char  currentSeedType[16] = "PADDY";

// Non-blocking Timing
unsigned long lastSensorReadTime = 0;
unsigned long lastSerialSendTime = 0;
unsigned long lastOledUpdateTime = 0;
unsigned long dryingStartTime    = 0;
unsigned long totalDryingSeconds = 0;

const unsigned long SENSOR_INTERVAL = 1000; // 1s sensor read
const unsigned long SERIAL_INTERVAL = 1000; // 1s JSON telemetry
const unsigned long OLED_INTERVAL   = 1500; // 1.5s OLED refresh

// Function Prototypes
void readSensors();
void executeAiControlLogic();
void applyActuators();
void sendJsonTelemetry();
void updateOledDisplay();
void handleSerialCommands();
void setLeds(bool green, bool yellow, bool red);
float calculateMoisturePercent(int raw);

// ==========================================
// ARDUINO SETUP
// ==========================================
void setup() {
  Serial.begin(115200);
  delay(500);

  // Initialize GPIO Pins
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(GREEN_LED, OUTPUT);
  pinMode(YELLOW_LED, OUTPUT);
  pinMode(RED_LED, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  // Initial State: Relay OFF (Active LOW), LEDs OFF, Buzzer OFF
  digitalWrite(RELAY_PIN, HIGH);
  setLeds(false, false, false);
  digitalWrite(BUZZER_PIN, LOW);

  // Initialize DHT22
  dht.begin();

  // Initialize I2C on ESP32 specific pins (SDA=21, SCL=22)
  Wire.begin(SDA_PIN, SCL_PIN);

  // Initialize OLED Display
  if (display.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDR)) {
    oledAvailable = true;
    display.clearDisplay();
    display.setTextColor(WHITE);
    
    // Boot Splash Banner
    display.setTextSize(2);
    display.setCursor(10, 10);
    display.println(F("PRAKASHAN"));
    display.setTextSize(1);
    display.setCursor(20, 36);
    display.println(F("AI SEED DRYER"));
    display.setCursor(10, 50);
    display.println(F("ESP32 Connected"));
    display.display();
  } else {
    Serial.println(F("{\"error\":\"OLED_INIT_FAILED\"}"));
  }

  delay(1500);
  dryingStartTime = millis();
  currentState = STATE_DRYING;

  Serial.println(F("{\"system\":\"PRAKASHAN_AI\",\"mcu\":\"ESP32\",\"status\":\"BOOT_COMPLETE\",\"version\":\"2.5\"}"));
}

// ==========================================
// MAIN LOOP (Non-Blocking)
// ==========================================
void loop() {
  unsigned long currentMillis = millis();

  // 1. Periodic Sensor Acquisition & Decision Loop (every 1s)
  if (currentMillis - lastSensorReadTime >= SENSOR_INTERVAL) {
    lastSensorReadTime = currentMillis;
    readSensors();
    executeAiControlLogic();
    applyActuators();
  }

  // 2. Periodic JSON Telemetry Stream to Dashboard (every 1s)
  if (currentMillis - lastSerialSendTime >= SERIAL_INTERVAL) {
    lastSerialSendTime = currentMillis;
    sendJsonTelemetry();
  }

  // 3. Periodic OLED Screen Refresh (every 1.5s)
  if (oledAvailable && (currentMillis - lastOledUpdateTime >= OLED_INTERVAL)) {
    lastOledUpdateTime = currentMillis;
    updateOledDisplay();
  }

  // 4. Handle Incoming Commands from Dashboard
  if (Serial.available() > 0) {
    handleSerialCommands();
  }
}

// ==========================================
// SENSOR ACQUISITION & FILTERING
// ==========================================
void readSensors() {
  // Multi-sample 12-bit ADC read on GPIO 34
  long adcSum = 0;
  for (int i = 0; i < 10; i++) {
    adcSum += analogRead(SOIL_PIN);
    delayMicroseconds(50);
  }
  rawSoilADC = adcSum / 10;

  // Convert raw ADC to calibrated Seed Moisture Percentage
  currentMoisture = calculateMoisturePercent(rawSoilADC);

  // Read DHT22 Temperature and Humidity on GPIO 4
  float t = dht.readTemperature();
  float h = dht.readHumidity();

  if (!isnan(t) && !isnan(h) && t >= -10.0 && t <= 80.0 && h >= 0.0 && h <= 100.0) {
    currentTemp     = t;
    currentHumidity = h;
  } else {
    // Keep last stable reading or fallback
    if (currentTemp == 0.0) currentTemp = 32.0;
    if (currentHumidity == 0.0) currentHumidity = 50.0;
  }

  if (currentState == STATE_DRYING || currentState == STATE_VENTILATING) {
    totalDryingSeconds = (millis() - dryingStartTime) / 1000;
  }
}

// Map ESP32 12-bit ADC (3000 dry -> 1200 wet) to 8% - 30% seed moisture
float calculateMoisturePercent(int raw) {
  // Linear interpolation with calibrated bounds
  float pct = ((float)(dryValue - raw) / (float)(dryValue - wetValue)) * 24.0 + 8.0;
  return constrain(pct, 5.0, 45.0);
}

// ==========================================
// PRAKASHAN AI DECISION & CONTROL LOGIC
// ==========================================
void executeAiControlLogic() {
  // SAFETY CHECK 1: Sensor Error / Disconnect
  if (currentTemp < 0.0 || currentTemp > 75.0 || currentMoisture < 3.0 || currentMoisture > 48.0) {
    currentState = STATE_ALARM_ERROR;
    setLeds(false, false, true);
    digitalWrite(BUZZER_PIN, HIGH);
    fanState = false;
    return;
  }

  // CHECK 2: Target Moisture Reached (Drying Complete)
  if (currentMoisture <= targetMoisture) {
    currentState = STATE_COMPLETED;
    setLeds(true, false, false);
    digitalWrite(BUZZER_PIN, LOW);
    fanState = false;   // Stop fan to prevent over-drying
    ventAngle = 10;
    return;
  }

  // CHECK 3: High Temperature Overheat Condition (> maxSafeTemp)
  if (currentTemp >= maxSafeTemp || currentHumidity >= maxAmbientHumidity) {
    currentState = STATE_VENTILATING;
    setLeds(false, false, true);    // Red ON
    digitalWrite(BUZZER_PIN, HIGH);  // Buzzer ON
    fanState = true;                // Fan ON (Relay LOW)
    ventAngle = 90;
    return;
  }

  // CHECK 4: Warning Condition (Warm / High Moisture: 30°C - 35°C)
  if (currentTemp >= 30.0 || currentHumidity >= 60.0 || currentMoisture > 16.0) {
    currentState = STATE_DRYING;
    setLeds(false, true, false);    // Yellow ON
    digitalWrite(BUZZER_PIN, LOW);   // Buzzer OFF
    fanState = true;                // Fan ON (Relay LOW)
    ventAngle = currentMoisture > 20.0 ? 75 : 45;
    return;
  }

  // CHECK 5: Normal Condition (Optimal Temp < 30°C, RH < 65%)
  currentState = STATE_DRYING;
  setLeds(true, false, false);      // Green ON
  digitalWrite(BUZZER_PIN, LOW);     // Buzzer OFF
  fanState = false;                 // Fan OFF (Relay HIGH)
  ventAngle = 30;
}

// ==========================================
// APPLY ACTUATORS
// ==========================================
void applyActuators() {
  // Relay control (LOW = ON, HIGH = OFF)
  digitalWrite(RELAY_PIN, fanState ? LOW : HIGH);
}

void setLeds(bool green, bool yellow, bool red) {
  digitalWrite(GREEN_LED, green ? HIGH : LOW);
  digitalWrite(YELLOW_LED, yellow ? HIGH : LOW);
  digitalWrite(RED_LED, red ? HIGH : LOW);
}

// ==========================================
// JSON TELEMETRY STREAM (Links to Web Dashboard)
// ==========================================
void sendJsonTelemetry() {
  const char* stateStr = "IDLE";
  switch (currentState) {
    case STATE_DRYING:      stateStr = "DRYING"; break;
    case STATE_VENTILATING: stateStr = "VENTILATING"; break;
    case STATE_COMPLETED:   stateStr = "COMPLETED"; break;
    case STATE_ALARM_ERROR: stateStr = "ALARM_ERROR"; break;
    default:                stateStr = "IDLE"; break;
  }

  // Send structured JSON packet over Serial
  Serial.print(F("{\"temp\":"));
  Serial.print(currentTemp, 1);
  Serial.print(F(",\"hum\":"));
  Serial.print(currentHumidity, 1);
  Serial.print(F(",\"moist\":"));
  Serial.print(currentMoisture, 1);
  Serial.print(F(",\"target_moist\":"));
  Serial.print(targetMoisture, 1);
  Serial.print(F(",\"solar_pct\":0"));
  Serial.print(F(",\"bat_v\":12.50"));
  Serial.print(F(",\"pv_v\":0.00"));
  Serial.print(F(",\"fan\":"));
  Serial.print(fanState ? 1 : 0);
  Serial.print(F(",\"vent\":"));
  Serial.print(ventAngle);
  Serial.print(F(",\"state\":\""));
  Serial.print(stateStr);
  Serial.print(F("\",\"seed\":\""));
  Serial.print(currentSeedType);
  Serial.print(F("\",\"elapsed_s\":"));
  Serial.print(totalDryingSeconds);
  Serial.println(F("}"));
}

// ==========================================
// OLED DISPLAY REFRESH
// ==========================================
void updateOledDisplay() {
  display.clearDisplay();
  display.setTextColor(WHITE);

  // Header Line
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print(F("PRAKASHAN AI ["));
  display.print(currentSeedType);
  display.println(F("]"));

  display.drawLine(0, 10, 127, 10, WHITE);

  // Sensor Telemetry
  display.setCursor(0, 15);
  display.print(F("Moisture: "));
  display.print(currentMoisture, 1);
  display.print(F("% -> "));
  display.print((int)targetMoisture);
  display.println(F("%"));

  display.setCursor(0, 28);
  display.print(F("Temp: "));
  display.print(currentTemp, 1);
  display.println(F(" C"));

  display.setCursor(0, 41);
  display.print(F("Humidity: "));
  display.print(currentHumidity, 1);
  display.println(F("%"));

  display.setCursor(0, 54);
  display.print(F("Fan: "));
  display.print(fanState ? F("ON (RUN)") : F("OFF"));
  
  display.setCursor(75, 54);
  display.print(F("St: "));
  switch (currentState) {
    case STATE_DRYING:      display.print(F("DRY")); break;
    case STATE_VENTILATING: display.print(F("VENT")); break;
    case STATE_COMPLETED:   display.print(F("DONE")); break;
    case STATE_ALARM_ERROR: display.print(F("ERR")); break;
    default:                display.print(F("IDLE")); break;
  }

  display.display();
}

// ==========================================
// SERIAL COMMAND INTERFACE
// ==========================================
void handleSerialCommands() {
  String cmd = Serial.readStringUntil('\n');
  cmd.trim();

  if (cmd.startsWith("SET_TARGET:")) {
    float val = cmd.substring(11).toFloat();
    if (val >= 6.0 && val <= 25.0) {
      targetMoisture = val;
      Serial.print(F("{\"ack\":\"TARGET_SET\",\"value\":"));
      Serial.print(targetMoisture);
      Serial.println(F("}"));
    }
  } else if (cmd.startsWith("SET_SEED:")) {
    String seed = cmd.substring(9);
    seed.toUpperCase();
    seed.toCharArray(currentSeedType, 15);

    if (seed == "PADDY" || seed == "RICE") {
      targetMoisture = 13.0; maxSafeTemp = 42.0;
    } else if (seed == "GROUNDNUT" || seed == "PEANUT") {
      targetMoisture = 9.0;  maxSafeTemp = 36.0;
    } else if (seed == "WHEAT") {
      targetMoisture = 12.0; maxSafeTemp = 40.0;
    } else if (seed == "MAIZE" || seed == "CORN") {
      targetMoisture = 13.5; maxSafeTemp = 43.0;
    } else if (seed == "SOYBEAN") {
      targetMoisture = 11.0; maxSafeTemp = 38.0;
    } else if (seed == "MUSTARD") {
      targetMoisture = 8.5;  maxSafeTemp = 36.0;
    }

    Serial.print(F("{\"ack\":\"SEED_PROFILE_LOADED\",\"seed\":\""));
    Serial.print(currentSeedType);
    Serial.print(F("\",\"target\":"));
    Serial.print(targetMoisture);
    Serial.print(F(",\"max_temp\":"));
    Serial.print(maxSafeTemp);
    Serial.println(F("}"));
  } else if (cmd == "START") {
    currentState = STATE_DRYING;
    dryingStartTime = millis();
    Serial.println(F("{\"ack\":\"DRYING_STARTED\"}"));
  } else if (cmd == "STOP") {
    currentState = STATE_IDLE;
    fanState = false;
    applyActuators();
    setLeds(false, false, false);
    Serial.println(F("{\"ack\":\"DRYING_STOPPED\"}"));
  }
}
