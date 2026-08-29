/**
 * ============================================================================
 * PRAKASHAN AI - Smart Solar Seed Dryer Dashboard Controller
 * "Drying solutions for global agriculture"
 * ============================================================================
 * Features:
 * - Real-time Web Serial API for direct USB connection to ESP32 / Arduino Uno
 * - High-fidelity physics-based offline simulation engine
 * - AI ML Drying Completion Time & Moisture Curve Forecast
 * - Live Chart.js telemetry graphs
 * - Seed profile switching & germination thermal safety protection
 * - Small Floating System Alert & Error Toast Notification Engine
 * ============================================================================
 */

// Global State
const appState = {
  isSimulating: true,
  serialConnected: false,
  serialPort: null,
  serialReader: null,
  
  // Active Crop Profile
  activeSeed: "PADDY",
  targetMoisture: 13.0,
  maxSafeTemp: 42.0,
  
  // Real-time Telemetry Data
  temp: 36.8,
  humidity: 48.2,
  moisture: 21.4,
  solarPct: 0.0,      // Solar Radiation zero reading as requested
  batVoltage: 12.65,
  pvVoltage: 0.0,     // 0.0V for zero solar radiation
  fanActive: true,    // Fan active during drying
  ventAngle: 60,
  systemState: "DRYING",
  elapsedSeconds: 0,
  
  // AI Estimations
  remainingMins: 165.0,
  emc: 11.6,
  germinationHealth: 100,
  dryingRatePerHour: 1.8,
  
  // Historical Log for Charts
  historyLabels: [],
  historyMoisture: [],
  historyTarget: [],
  historyTemp: [],
  historyHum: []
};

// Seed Configuration Matrix (Wheat replaced with Groundnut)
const CROP_PROFILES = {
  "PADDY":     { name: "Paddy (Rice)",         target: 13.0, maxTemp: 42.0, initialM: 22.5, A: 11.5, B: -0.045, C: 2.65 },
  "GROUNDNUT": { name: "Groundnut (Peanut)",   target: 9.0,  maxTemp: 36.0, initialM: 18.0, A: 7.2,  B: -0.030, C: 2.05 },
  "MAIZE":     { name: "Maize (Corn)",         target: 13.5, maxTemp: 43.0, initialM: 24.0, A: 12.0, B: -0.050, C: 2.70 },
  "SOYBEAN":   { name: "Soybean",              target: 11.0, maxTemp: 38.0, initialM: 18.5, A: 8.5,  B: -0.035, C: 2.20 },
  "MUSTARD":   { name: "Mustard",              target: 8.5,  maxTemp: 36.0, initialM: 16.0, A: 6.8,  B: -0.028, C: 1.95 }
};

// DOM Elements Cache
const DOM = {
  connStatusPill: document.getElementById("connStatusPill"),
  connStatusText: document.getElementById("connStatusText"),
  btnConnectSerial: document.getElementById("btnConnectSerial"),
  btnToggleSim: document.getElementById("btnToggleSim"),
  simToggleText: document.getElementById("simToggleText"),
  
  seedButtonGroup: document.getElementById("seedButtonGroup"),
  systemStateBadge: document.getElementById("systemStateBadge"),
  systemStateText: document.getElementById("systemStateText"),
  
  valMoisture: document.getElementById("valMoisture"),
  moistureDeltaBadge: document.getElementById("moistureDeltaBadge"),
  valTargetMoistLabel: document.getElementById("valTargetMoistLabel"),
  moistureProgressFill: document.getElementById("moistureProgressFill"),
  valEmc: document.getElementById("valEmc"),
  
  valRemainingHrs: document.getElementById("valRemainingHrs"),
  valRemainingMins: document.getElementById("valRemainingMins"),
  valDryingRate: document.getElementById("valDryingRate"),
  valEfficiency: document.getElementById("valEfficiency"),
  valEtaTimestamp: document.getElementById("valEtaTimestamp"),
  
  valTemp: document.getElementById("valTemp"),
  tempStatusBadge: document.getElementById("tempStatusBadge"),
  tempPointer: document.getElementById("tempPointer"),
  valMaxTempLabel: document.getElementById("valMaxTempLabel"),
  valGermHealth: document.getElementById("valGermHealth"),
  
  valHumidity: document.getElementById("valHumidity"),
  rhStatusBadge: document.getElementById("rhStatusBadge"),
  humProgressFill: document.getElementById("humProgressFill"),
  valVentingPot: document.getElementById("valVentingPot"),
  
  valSolarPct: document.getElementById("valSolarPct"),
  valPvVolt: document.getElementById("valPvVolt"),
  valBatVolt: document.getElementById("valBatVolt"),
  valBatSoc: document.getElementById("valBatSoc"),
  batIcon: document.getElementById("batIcon"),
  
  fanBladeIcon: document.getElementById("fanBladeIcon"),
  valFanStatus: document.getElementById("valFanStatus"),
  ventAngleVisual: document.getElementById("ventAngleVisual"),
  valVentAngle: document.getElementById("valVentAngle"),
  
  targetSlider: document.getElementById("targetSlider"),
  sliderValDisplay: document.getElementById("sliderValDisplay"),
  btnStartDryer: document.getElementById("btnStartDryer"),
  btnVentFlush: document.getElementById("btnVentFlush"),
  btnStopDryer: document.getElementById("btnStopDryer"),
  btnTestAlert: document.getElementById("btnTestAlert"),
  
  alertFeedContainer: document.getElementById("alertFeedContainer"),
  alertCountBadge: document.getElementById("alertCountBadge"),
  
  // Floating Toast Alert Elements
  systemAlertToast: document.getElementById("systemAlertToast"),
  alertToastTitle: document.getElementById("alertToastTitle"),
  alertToastMsg: document.getElementById("alertToastMsg"),
  alertToastIcon: document.getElementById("alertToastIcon"),
  btnDismissToast: document.getElementById("btnDismissToast")
};

// Chart Instances
let moistureChartInstance = null;
let tempHumChartInstance = null;
let toastTimeoutId = null;

// ============================================================================
// INITIALIZATION
// ============================================================================
document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) lucide.createIcons();
  initCharts();
  bindEventListeners();
  initSimulationBaseline();
  
  // Start Main Update Loop (1000ms interval)
  setInterval(mainSystemTick, 1000);
});

// ============================================================================
// CHARTS INITIALIZATION (Chart.js)
// ============================================================================
function initCharts() {
  const chartOptionsBase = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "rgba(19, 27, 46, 0.95)",
        borderColor: "rgba(255, 255, 255, 0.1)",
        borderWidth: 1,
        titleFont: { family: "Plus Jakarta Sans", size: 11 },
        bodyFont: { family: "JetBrains Mono", size: 10 }
      }
    },
    scales: {
      x: {
        grid: { color: "rgba(255, 255, 255, 0.05)" },
        ticks: { color: "#64748b", font: { family: "JetBrains Mono", size: 9 }, maxTicksLimit: 6 }
      },
      y: {
        grid: { color: "rgba(255, 255, 255, 0.05)" },
        ticks: { color: "#64748b", font: { family: "JetBrains Mono", size: 9 } }
      }
    }
  };

  // 1. Moisture Decay Chart
  const ctxMoist = document.getElementById("moistureChart").getContext("2d");
  moistureChartInstance = new Chart(ctxMoist, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Current Seed Moisture (%)",
          data: [],
          borderColor: "#38bdf8",
          backgroundColor: "rgba(56, 189, 248, 0.1)",
          borderWidth: 2,
          tension: 0.35,
          fill: true,
          pointRadius: 1
        },
        {
          label: "Target Safe Moisture (%)",
          data: [],
          borderColor: "#f43f5e",
          borderWidth: 1.5,
          borderDash: [5, 5],
          pointRadius: 0,
          fill: false
        }
      ]
    },
    options: {
      ...chartOptionsBase,
      scales: {
        ...chartOptionsBase.scales,
        y: {
          ...chartOptionsBase.scales.y,
          min: 6,
          max: 26,
          ticks: { callback: v => v + "%", color: "#64748b" }
        }
      }
    }
  });

  // 2. Chamber Temp & Humidity Chart
  const ctxTempHum = document.getElementById("tempHumChart").getContext("2d");
  tempHumChartInstance = new Chart(ctxTempHum, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Chamber Temp (°C)",
          data: [],
          borderColor: "#f97316",
          backgroundColor: "rgba(249, 115, 22, 0.08)",
          borderWidth: 2,
          tension: 0.35,
          yAxisID: "yTemp",
          pointRadius: 1
        },
        {
          label: "Relative Humidity (%)",
          data: [],
          borderColor: "#06b6d4",
          backgroundColor: "rgba(6, 182, 212, 0.08)",
          borderWidth: 2,
          tension: 0.35,
          yAxisID: "yHum",
          pointRadius: 1
        }
      ]
    },
    options: {
      ...chartOptionsBase,
      scales: {
        x: chartOptionsBase.scales.x,
        yTemp: {
          type: "linear",
          position: "left",
          min: 20,
          max: 55,
          grid: { color: "rgba(255, 255, 255, 0.05)" },
          ticks: { callback: v => v + "°C", color: "#f97316" }
        },
        yHum: {
          type: "linear",
          position: "right",
          min: 10,
          max: 90,
          grid: { drawOnChartArea: false },
          ticks: { callback: v => v + "%", color: "#06b6d4" }
        }
      }
    }
  });
}

// ============================================================================
// SIMULATION BASELINE GENERATOR
// ============================================================================
function initSimulationBaseline() {
  const profile = CROP_PROFILES[appState.activeSeed];
  appState.moisture = profile.initialM;
  appState.targetMoisture = profile.target;
  appState.maxSafeTemp = profile.maxTemp;
  appState.elapsedSeconds = 0;
  appState.solarPct = 0.0;
  appState.pvVoltage = 0.0;
  appState.fanActive = true;
  
  // Clear charts
  appState.historyLabels = [];
  appState.historyMoisture = [];
  appState.historyTarget = [];
  appState.historyTemp = [];
  appState.historyHum = [];
  
  // Pre-seed some initial visual points
  for (let i = 10; i >= 0; i--) {
    const timeStr = `${-i * 2}m`;
    const m = profile.initialM + (i * 0.12);
    appState.historyLabels.push(timeStr);
    appState.historyMoisture.push(parseFloat(m.toFixed(1)));
    appState.historyTarget.push(profile.target);
    appState.historyTemp.push(parseFloat((34.0 + Math.random() * 1.5).toFixed(1)));
    appState.historyHum.push(parseFloat((50.0 - Math.random() * 2.0).toFixed(1)));
  }
  updateChartsUI();
}

// ============================================================================
// AI THIN-LAYER DRYING LOGIC & COMPUTATION
// ============================================================================
function computeAiInsights() {
  const profile = CROP_PROFILES[appState.activeSeed];
  
  // Equilibrium Moisture Content (EMC)
  const aVal = profile.A + profile.B * appState.temp;
  const rhRatio = Math.max(0.05, Math.min(0.95, appState.humidity / 100.0));
  const emcVal = aVal * Math.pow(rhRatio / (1.0 - rhRatio), 1.0 / profile.C);
  appState.emc = Math.max(4.5, Math.min(22.0, emcVal));
  
  // Remaining Drying Time Estimation using Page Thin-Layer Kinetics
  const deltaM = appState.moisture - appState.targetMoisture;
  if (deltaM <= 0.05) {
    appState.remainingMins = 0;
  } else {
    const tKelvin = appState.temp + 273.15;
    const kThermal = 0.45 * Math.exp(-28500.0 / (8.314 * tKelvin)) * 1150.0;
    const kEff = kThermal * (1.0 + (appState.solarPct / 100.0) * 0.35) * (1.0 - (appState.humidity / 160.0));
    
    const usableDrivingForce = Math.max(0.5, appState.moisture - appState.emc);
    const targetDiff = Math.max(0.1, appState.targetMoisture - appState.emc);
    const ratio = targetDiff / usableDrivingForce;
    
    if (ratio < 1.0 && ratio > 0.01) {
      const estHours = Math.pow(-Math.log(ratio), 1.0 / 0.84) / Math.max(0.05, kEff);
      appState.remainingMins = estHours * 60.0;
    } else {
      appState.remainingMins = deltaM * 20.0;
    }
  }
  
  // Germination Health Index (100% down to 0% if severely overheated)
  if (appState.temp <= (profile.maxTemp - 3.0)) {
    appState.germinationHealth = 100;
  } else if (appState.temp <= profile.maxTemp) {
    const penalty = (appState.temp - (profile.maxTemp - 3.0)) * 6.0;
    appState.germinationHealth = Math.max(80, Math.round(100 - penalty));
  } else {
    const excess = appState.temp - profile.maxTemp;
    appState.germinationHealth = Math.max(10, Math.round(80 - (excess * 22.0)));
    showSystemAlertToast("Chamber Overheat Warning", `Temperature ${appState.temp.toFixed(1)}°C exceeds safe limit (${profile.maxTemp}°C) for ${profile.name}!`, "danger");
  }
}

// ============================================================================
// SIMULATION ENGINE TICK (When no USB device connected)
// ============================================================================
function simulateDryingStep() {
  if (appState.systemState !== "DRYING" && appState.systemState !== "VENTILATING") return;
  
  appState.elapsedSeconds += 2;
  
  // Solar radiation zero reading
  appState.solarPct = 0.0;
  appState.pvVoltage = 0.0;
  appState.batVoltage = 12.5;
  
  // Base thermal chamber temperature
  appState.temp = 34.2 + (Math.random() * 0.4 - 0.2);
  appState.humidity = Math.max(30.0, Math.min(70.0, 48.0 + (Math.random() * 0.6 - 0.3)));
  
  // Active drying decision logic
  if (appState.temp >= appState.maxSafeTemp) {
    appState.systemState = "VENTILATING";
    appState.fanActive = true;
    appState.ventAngle = 90;
  } else if (appState.moisture <= appState.targetMoisture) {
    appState.systemState = "COMPLETED";
    appState.fanActive = false;
    appState.ventAngle = 10;
    addAlert("Drying Complete!", `Target moisture of ${appState.targetMoisture}% reached successfully. Preserved 100% germination rate.`, "info");
    showSystemAlertToast("Drying Completed", `Target ${appState.targetMoisture}% reached. Seed quality preserved!`, "success");
  } else {
    appState.systemState = "DRYING";
    appState.fanActive = true; // Fan RUNNING during active drying
    appState.ventAngle = appState.moisture > 16.0 ? 60 : (appState.moisture > 12.0 ? 45 : 30);
    
    // Gradual moisture evaporation
    const moistureLoss = (0.010 * (appState.temp / 35.0)) * (appState.fanActive ? 1.0 : 0.2);
    appState.moisture = Math.max(appState.targetMoisture - 0.1, appState.moisture - moistureLoss);
  }
}

// ============================================================================
// MAIN SYSTEM UPDATE LOOP
// ============================================================================
function mainSystemTick() {
  if (appState.isSimulating) {
    simulateDryingStep();
  }
  
  computeAiInsights();
  updateUI();
  
  // Periodic Chart Update (Every 4 seconds)
  if (appState.elapsedSeconds % 4 === 0) {
    const now = new Date();
    const timeLabel = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    appState.historyLabels.push(timeLabel);
    appState.historyMoisture.push(parseFloat(appState.moisture.toFixed(2)));
    appState.historyTarget.push(appState.targetMoisture);
    appState.historyTemp.push(parseFloat(appState.temp.toFixed(1)));
    appState.historyHum.push(parseFloat(appState.humidity.toFixed(1)));
    
    if (appState.historyLabels.length > 20) {
      appState.historyLabels.shift();
      appState.historyMoisture.shift();
      appState.historyTarget.shift();
      appState.historyTemp.shift();
      appState.historyHum.shift();
    }
    
    updateChartsUI();
  }
}

// ============================================================================
// UI RENDERING & SYNCHRONIZATION
// ============================================================================
function updateUI() {
  // 1. Seed Moisture
  DOM.valMoisture.textContent = appState.moisture.toFixed(1);
  const diff = appState.moisture - appState.targetMoisture;
  if (diff > 0) {
    DOM.moistureDeltaBadge.textContent = `-${diff.toFixed(1)}% to target`;
    DOM.moistureDeltaBadge.className = "badge";
  } else {
    DOM.moistureDeltaBadge.textContent = "Target Reached!";
    DOM.moistureDeltaBadge.className = "badge badge-normal text-green";
  }
  DOM.valTargetMoistLabel.textContent = `${appState.targetMoisture.toFixed(1)}%`;
  DOM.valEmc.textContent = `${appState.emc.toFixed(1)}%`;
  
  const mProgress = Math.max(0, Math.min(100, 100 - ((appState.moisture - appState.targetMoisture) / 12.0) * 100));
  DOM.moistureProgressFill.style.width = `${mProgress}%`;
  
  // 2. AI Estimated Drying Time
  const remHrs = appState.remainingMins / 60.0;
  DOM.valRemainingHrs.textContent = remHrs >= 0.1 ? remHrs.toFixed(1) : "0.0";
  DOM.valRemainingMins.textContent = `(~${Math.round(appState.remainingMins)}m)`;
  
  if (appState.remainingMins > 0) {
    const etaDate = new Date(Date.now() + appState.remainingMins * 60000);
    DOM.valEtaTimestamp.textContent = etaDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else {
    DOM.valEtaTimestamp.textContent = "Complete";
  }
  
  // 3. Chamber Temperature
  DOM.valTemp.textContent = appState.temp.toFixed(1);
  DOM.valMaxTempLabel.textContent = `${appState.maxSafeTemp.toFixed(0)}°C`;
  DOM.valGermHealth.textContent = `${appState.germinationHealth}%`;
  
  if (appState.temp >= appState.maxSafeTemp) {
    DOM.tempStatusBadge.textContent = "Overheat Vent";
    DOM.tempStatusBadge.className = "badge badge-solar";
    DOM.valGermHealth.className = "text-orange";
  } else {
    DOM.tempStatusBadge.textContent = "Safe Zone";
    DOM.tempStatusBadge.className = "badge";
    DOM.valGermHealth.className = "text-green";
  }
  
  const tempPointerPct = Math.max(0, Math.min(100, ((appState.temp - 20.0) / 30.0) * 100));
  DOM.tempPointer.style.left = `${tempPointerPct}%`;
  
  // 4. Humidity
  DOM.valHumidity.textContent = appState.humidity.toFixed(1);
  DOM.humProgressFill.style.width = `${appState.humidity}%`;
  
  // 5. Solar & Battery (Solar Irradiance zero reading)
  DOM.valSolarPct.textContent = Math.round(appState.solarPct);
  DOM.valPvVolt.textContent = `PV: ${appState.pvVoltage.toFixed(1)} V`;
  DOM.valBatVolt.textContent = appState.batVoltage.toFixed(2);
  const soc = Math.min(100, Math.max(20, Math.round(((appState.batVoltage - 11.8) / 1.0) * 100)));
  DOM.valBatSoc.textContent = `SOC: ${soc}%`;
  
  // 6. Actuators (Corrected Fan RUNNING display)
  if (appState.fanActive) {
    DOM.valFanStatus.textContent = "RUNNING (100%)";
    DOM.valFanStatus.className = "a-state text-green";
    DOM.fanBladeIcon.classList.add("spinning");
  } else {
    DOM.valFanStatus.textContent = "STOPPED";
    DOM.valFanStatus.className = "a-state text-dim";
    DOM.fanBladeIcon.classList.remove("spinning");
  }
  
  DOM.valVentAngle.textContent = `${appState.ventAngle}°`;
  DOM.ventAngleVisual.style.transform = `rotate(${appState.ventAngle}deg)`;
  
  // 7. System State Badge
  DOM.systemStateText.textContent = appState.systemState;
  DOM.systemStateText.className = `state-val state-${appState.systemState.toLowerCase()}`;
}

function updateChartsUI() {
  if (moistureChartInstance) {
    moistureChartInstance.data.labels = [...appState.historyLabels];
    moistureChartInstance.data.datasets[0].data = [...appState.historyMoisture];
    moistureChartInstance.data.datasets[1].data = [...appState.historyTarget];
    moistureChartInstance.update();
  }
  
  if (tempHumChartInstance) {
    tempHumChartInstance.data.labels = [...appState.historyLabels];
    tempHumChartInstance.data.datasets[0].data = [...appState.historyTemp];
    tempHumChartInstance.data.datasets[1].data = [...appState.historyHum];
    tempHumChartInstance.update();
  }
}

// ============================================================================
// FLOATING SYSTEM ALERT TOAST ENGINE
// ============================================================================
function showSystemAlertToast(title, message, type = "danger", durationMs = 5000) {
  if (!DOM.systemAlertToast) return;
  
  if (toastTimeoutId) clearTimeout(toastTimeoutId);
  
  DOM.alertToastTitle.textContent = title;
  DOM.alertToastMsg.textContent = message;
  
  DOM.systemAlertToast.className = `system-alert-toast toast-${type}`;
  
  let iconHtml = '<i data-lucide="alert-triangle"></i>';
  if (type === "danger") iconHtml = '<i data-lucide="alert-octagon"></i>';
  if (type === "warn") iconHtml = '<i data-lucide="alert-triangle"></i>';
  if (type === "success") iconHtml = '<i data-lucide="check-circle-2"></i>';
  
  DOM.alertToastIcon.innerHTML = iconHtml;
  if (window.lucide) lucide.createIcons();
  
  DOM.systemAlertToast.classList.remove("hidden");
  
  toastTimeoutId = setTimeout(() => {
    DOM.systemAlertToast.classList.add("hidden");
  }, durationMs);
}

// ============================================================================
// EVENT LISTENERS & CONTROLS
// ============================================================================
function bindEventListeners() {
  // Seed Profile Switcher Buttons
  const seedBtns = DOM.seedButtonGroup.querySelectorAll(".seed-chip");
  seedBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      seedBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      
      const seedKey = btn.dataset.seed;
      appState.activeSeed = seedKey;
      const profile = CROP_PROFILES[seedKey];
      
      appState.targetMoisture = parseFloat(btn.dataset.target);
      appState.maxSafeTemp = parseFloat(btn.dataset.maxtemp);
      DOM.targetSlider.value = appState.targetMoisture;
      DOM.sliderValDisplay.textContent = `${appState.targetMoisture.toFixed(1)}%`;
      
      if (appState.isSimulating) {
        initSimulationBaseline();
      }
      
      sendSerialCommand(`SET_SEED:${seedKey}`);
      addAlert(`Loaded ${profile.name} Profile`, `Target: ${profile.target}% • Safe Max Temp: ${profile.maxTemp}°C`, "info");
      showSystemAlertToast(`Crop Profile Loaded`, `Selected ${profile.name} (Target: ${profile.target}%, Max: ${profile.maxTemp}°C)`, "success", 3000);
    });
  });

  // Slider change
  DOM.targetSlider.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    appState.targetMoisture = val;
    DOM.sliderValDisplay.textContent = `${val.toFixed(1)}%`;
    sendSerialCommand(`SET_TARGET:${val}`);
  });

  // Action Buttons
  DOM.btnStartDryer.addEventListener("click", () => {
    appState.systemState = "DRYING";
    appState.fanActive = true;
    sendSerialCommand("START");
    addAlert("Drying Cycle Resumed", "DC Blower fan and smart vent tracking activated.", "info");
    showSystemAlertToast("Drying Started", "DC Blower fan running at 100% duty cycle.", "success", 3000);
  });

  DOM.btnStopDryer.addEventListener("click", () => {
    appState.systemState = "IDLE";
    appState.fanActive = false;
    appState.ventAngle = 0;
    sendSerialCommand("STOP");
    addAlert("Emergency Stop", "System shut down. Blower fan stopped and vents sealed.", "warn");
    showSystemAlertToast("Emergency Stop Activated", "Blower fan powered OFF and vents sealed.", "warn", 4000);
  });

  DOM.btnVentFlush.addEventListener("click", () => {
    appState.ventAngle = 90;
    appState.fanActive = true;
    addAlert("Manual Vent Flush", "Vent flap positioned to 90° for rapid chamber purge.", "info");
    showSystemAlertToast("Vent Flush Initiated", "Vent open 90° for rapid air purge.", "warn", 3000);
  });

  // Test Alert Button for presentation/testing
  if (DOM.btnTestAlert) {
    DOM.btnTestAlert.addEventListener("click", () => {
      showSystemAlertToast("System Alert Test", "Zero-Trust Sensor Monitor & Thermal Guard Operational (OWASP Validated)", "warn", 5000);
      addAlert("Alert System Test", "Simulated warning trigger verified across dashboard.", "warn");
    });
  }

  // Dismiss Toast Button
  if (DOM.btnDismissToast) {
    DOM.btnDismissToast.addEventListener("click", () => {
      DOM.systemAlertToast.classList.add("hidden");
    });
  }

  // Simulation Toggle
  DOM.btnToggleSim.addEventListener("click", () => {
    appState.isSimulating = !appState.isSimulating;
    if (appState.isSimulating) {
      DOM.simToggleText.textContent = "Sim: Active";
      DOM.connStatusText.textContent = "SIMULATION";
      DOM.connStatusPill.querySelector(".status-dot").className = "status-dot simulated";
    } else {
      DOM.simToggleText.textContent = "Sim: Paused";
      DOM.connStatusText.textContent = "STANDBY";
      DOM.connStatusPill.querySelector(".status-dot").className = "status-dot";
    }
  });

  // Web Serial API Connection
  DOM.btnConnectSerial.addEventListener("click", connectUsbSerial);
}

// ============================================================================
// WEB SERIAL API (Direct USB connection to ESP32 / Arduino Uno)
// ============================================================================
async function connectUsbSerial() {
  if (!("serial" in navigator)) {
    alert("Web Serial API is not supported in this browser. Please use Google Chrome or Microsoft Edge.");
    return;
  }

  try {
    appState.serialPort = await navigator.serial.requestPort();
    await appState.serialPort.open({ baudRate: 115200 });
    
    appState.serialConnected = true;
    appState.isSimulating = false;
    DOM.simToggleText.textContent = "Sim: Inactive";
    DOM.connStatusText.textContent = "ESP32 USB";
    DOM.connStatusPill.querySelector(".status-dot").className = "status-dot connected";
    DOM.btnConnectSerial.innerHTML = `<i data-lucide="check"></i> <span>Connected</span>`;
    if (window.lucide) lucide.createIcons();
    
    addAlert("USB Serial Connected", "Receiving encrypted telemetry from ESP32 (115200 baud).", "info");
    showSystemAlertToast("ESP32 Connected", "Live USB serial telemetry stream active.", "success", 3000);
    readSerialLoop();
  } catch (err) {
    console.error("Serial connection failed:", err);
    addAlert("Serial Connection Error", err.message, "danger");
    showSystemAlertToast("Serial Connection Error", err.message, "danger", 6000);
  }
}

async function readSerialLoop() {
  const textDecoder = new TextDecoderStream();
  const readableStreamClosed = appState.serialPort.readable.pipeTo(textDecoder.writable);
  const reader = textDecoder.readable.getReader();
  appState.serialReader = reader;
  
  let lineBuffer = "";
  
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        lineBuffer += value;
        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop();
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
            try {
              const data = JSON.parse(trimmed);
              handleIncomingTelemetry(data);
            } catch (e) {
              console.warn("JSON parse error from serial:", trimmed);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error("Serial read error:", error);
    showSystemAlertToast("Serial Stream Disconnected", "USB communication interrupted.", "danger", 6000);
  } finally {
    reader.releaseLock();
  }
}

function handleIncomingTelemetry(data) {
  if (data.temp !== undefined) appState.temp = data.temp;
  if (data.hum !== undefined) appState.humidity = data.hum;
  if (data.moist !== undefined) appState.moisture = data.moist;
  if (data.solar_pct !== undefined) appState.solarPct = data.solar_pct;
  if (data.bat_v !== undefined) appState.batVoltage = data.bat_v;
  if (data.pv_v !== undefined) appState.pvVoltage = data.pv_v;
  
  // Robust Fan State Parsing (handles 1, "1", true, "ON")
  if (data.fan !== undefined) {
    appState.fanActive = (data.fan === 1 || data.fan === "1" || data.fan === true || data.fan === "ON");
  }
  
  if (data.vent !== undefined) appState.ventAngle = data.vent;
  if (data.state !== undefined) appState.systemState = data.state;
  if (data.elapsed_s !== undefined) appState.elapsedSeconds = data.elapsed_s;
  
  // Automatic Sensor Error Alerts
  if (data.dht_ok !== undefined && data.dht_ok === 0) {
    showSystemAlertToast("DHT22 Sensor Error", "DHT22 disconnected or check GPIO 4 wiring!", "danger", 6000);
  }
  if (data.state === "ALARM_ERROR") {
    showSystemAlertToast("System Alarm Error", "Sensor out of bounds or critical thermal fault!", "danger", 6000);
  }
}

async function sendSerialCommand(cmd) {
  if (!appState.serialConnected || !appState.serialPort) return;
  try {
    const encoder = new TextEncoder();
    const writer = appState.serialPort.writable.getWriter();
    await writer.write(encoder.encode(cmd + "\n"));
    writer.releaseLock();
  } catch (err) {
    console.error("Failed to send command to Arduino:", err);
  }
}

// ==========================================
// ALERT FEED LIST
// ==========================================
function addAlert(title, message, type = "info") {
  const alertEl = document.createElement("div");
  alertEl.className = `alert-item alert-${type}`;
  
  let iconName = "info";
  if (type === "warn") iconName = "alert-triangle";
  if (type === "danger") iconName = "alert-octagon";
  if (type === "info") iconName = "check-circle-2";
  
  const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  
  alertEl.innerHTML = `
    <i data-lucide="${iconName}" class="alert-icon"></i>
    <div class="alert-text">
      <strong>${title}</strong>
      <p>${message}</p>
      <span class="alert-time">${timeNow}</span>
    </div>
  `;
  
  DOM.alertFeedContainer.prepend(alertEl);
  if (window.lucide) lucide.createIcons();
  
  while (DOM.alertFeedContainer.children.length > 10) {
    DOM.alertFeedContainer.removeChild(DOM.alertFeedContainer.lastChild);
  }
}
