/**
 * Mickey Miles — XIAO ESP32-S3 wheel tracker
 *
 * 1. Copy secrets_template.h to secrets.h and edit Wi-Fi + API settings.
 * 2. Set HALL_PIN to match your wiring (Seeed XIAO ESP32-S3: D4 = GPIO 4, etc.).
 * 3. Set WHEEL_CIRCUMFERENCE_MILES from wheel diameter (see comment below).
 *
 * Board: Seeed Studio XIAO ESP32-S3
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <time.h>

#include "secrets.h"

#ifndef SECRETS_H
#error "Create secrets.h from secrets_template.h"
#endif

// ----- Pin & wheel physics (adjust to your build) -----
#define HALL_PIN 4  // GPIO 4 — change to match your jumper wiring

// If your sensor reads LOW when the magnet is present, keep true.
#define SENSOR_ACTIVE_LOW true

// Ignore edges closer than this (ms) — reduces double-counts / chatter
#define DEBOUNCE_MS 45

// If no revolution for this long, treat wheel as stopped (ms)
#define STOPPED_AFTER_MS 4000

// POST interval to backend (ms)
#define TELEMETRY_INTERVAL_MS 5000

// Wi-Fi reconnect: try at most this often (ms)
#define WIFI_RETRY_MS 10000

// miles = (diameter_cm * PI) / 160934  — example: 28 cm diameter
#define WHEEL_CIRCUMFERENCE_MILES (28.0f * 3.14159265f / 160934.0f)

// ----- State -----
unsigned long revolutionsToday = 0;
float wheelMinutesToday = 0.0f;

char currentDateStr[12] = "1970-01-01";
char lastDateStr[12] = "";

bool lastStableHall = false;
unsigned long debounceStartMs = 0;

unsigned long lastRevMs = 0;
unsigned long lastRevIntervalMs = 0;
float smoothedMph = 0.0f;

unsigned long lastTelemetryMs = 0;
unsigned long lastWifiAttempt = 0;

void syncClock() {
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  for (int i = 0; i < 30; i++) {
    struct tm ti;
    if (getLocalTime(&ti)) {
      Serial.println("[time] NTP synced");
      return;
    }
    delay(500);
  }
  Serial.println("[time] NTP sync failed — day rollover may be wrong until sync");
}

void updateDateString() {
  struct tm ti;
  if (!getLocalTime(&ti)) {
    return;
  }
  strftime(currentDateStr, sizeof(currentDateStr), "%Y-%m-%d", &ti);
}

void maybeRollDaily() {
  updateDateString();
  if (lastDateStr[0] == '\0') {
    strncpy(lastDateStr, currentDateStr, sizeof(lastDateStr) - 1);
    return;
  }
  if (strcmp(currentDateStr, lastDateStr) != 0) {
    Serial.printf("[day] %s -> %s: reset daily counters\n", lastDateStr, currentDateStr);
    revolutionsToday = 0;
    wheelMinutesToday = 0.0f;
    strncpy(lastDateStr, currentDateStr, sizeof(lastDateStr) - 1);
  }
}

void connectWifi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }
  unsigned long now = millis();
  if (now - lastWifiAttempt < WIFI_RETRY_MS && lastWifiAttempt != 0) {
    return;
  }
  lastWifiAttempt = now;

  Serial.printf("[wifi] Connecting to %s ...\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 40) {
    delay(500);
    Serial.print(".");
    tries++;
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("[wifi] OK IP ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("[wifi] Failed — will retry");
  }
}

/** Raw: true when magnet present / "active" (depends on SENSOR_ACTIVE_LOW). */
bool hallRawActive() {
  int v = digitalRead(HALL_PIN);
#if SENSOR_ACTIVE_LOW
  return (v == LOW);
#else
  return (v == HIGH);
#endif
}

/**
 * Debounced level; returns true once per rising edge (magnet pass).
 */
bool pollHallEdge() {
  bool raw = hallRawActive();
  unsigned long now = millis();

  if (raw != lastStableHall) {
    if (debounceStartMs == 0) {
      debounceStartMs = now;
    }
    if (now - debounceStartMs >= DEBOUNCE_MS) {
      lastStableHall = raw;
      debounceStartMs = 0;
    }
  } else {
    debounceStartMs = 0;
  }

  static bool prevStable = false;
  bool rising = lastStableHall && !prevStable;
  prevStable = lastStableHall;
  return rising;
}

float computeSpeedMph() {
  unsigned long now = millis();
  if (lastRevMs == 0) {
    return 0.0f;
  }
  unsigned long since = now - lastRevMs;
  if (since > STOPPED_AFTER_MS) {
    smoothedMph *= 0.9f;
    if (smoothedMph < 0.05f) {
      smoothedMph = 0.0f;
    }
    return smoothedMph;
  }
  if (lastRevIntervalMs > 0) {
    float inst = (WHEEL_CIRCUMFERENCE_MILES * 3600.0f * 1000.0f) / (float)lastRevIntervalMs;
    if (inst > 25.0f) {
      inst = smoothedMph;
    }
    smoothedMph = smoothedMph * 0.45f + inst * 0.55f;
    return smoothedMph;
  }
  return smoothedMph;
}

bool computeIsMoving(float mph) {
  unsigned long now = millis();
  if (lastRevMs == 0) {
    return false;
  }
  return (now - lastRevMs) < STOPPED_AFTER_MS && mph >= 0.07f;
}

void onRevolution() {
  unsigned long now = millis();
  if (lastRevMs > 0) {
    unsigned long dt = now - lastRevMs;
    if (dt >= DEBOUNCE_MS && dt < 120000UL) {
      lastRevIntervalMs = dt;
    }
  }
  lastRevMs = now;
  revolutionsToday++;
  Serial.printf("[wheel] revolution #%lu today\n", revolutionsToday);
}

String buildJsonPayload(float mph, bool moving) {
  float milesToday = revolutionsToday * WHEEL_CIRCUMFERENCE_MILES;
  float avg = 0.0f;
  if (wheelMinutesToday > 0.05f) {
    avg = milesToday / (wheelMinutesToday / 60.0f);
    if (avg > 25.0f) {
      avg = 0.0f;
    }
  }

  String j = "{";
  j += "\"secret\":\"" + String(API_SECRET) + "\",";
  j += "\"date\":\"" + String(currentDateStr) + "\",";
  j += "\"isMoving\":" + String(moving ? "true" : "false") + ",";
  j += "\"speedMph\":" + String(mph, 3) + ",";
  j += "\"milesToday\":" + String(milesToday, 5) + ",";
  j += "\"wheelMinutesToday\":" + String(wheelMinutesToday, 3) + ",";
  j += "\"avgSpeedMph\":" + String(avg, 3);
  j += "}";
  return j;
}

void postTelemetry() {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  float mph = computeSpeedMph();
  bool moving = computeIsMoving(mph);

  HTTPClient http;
  String url = String(API_BASE_URL) + "/api/telemetry";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(12000);

  String body = buildJsonPayload(mph, moving);
  int code = http.POST(body);
  if (code >= 200 && code < 300) {
    Serial.println("[api] telemetry OK");
  } else {
    Serial.printf("[api] telemetry HTTP %d\n", code);
    Serial.println(http.getString());
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  delay(600);

  pinMode(HALL_PIN, INPUT_PULLUP);

  setenv("TZ", TZ_STRING, 1);
  tzset();

  connectWifi();
  if (WiFi.status() == WL_CONNECTED) {
    syncClock();
  }
  updateDateString();
  strncpy(lastDateStr, currentDateStr, sizeof(lastDateStr) - 1);

  Serial.println("[boot] Mickey Miles tracker ready");
}

void loop() {
  static unsigned long lastLoopMs = 0;
  unsigned long now = millis();
  float dtMin = 0.0f;
  if (lastLoopMs > 0) {
    dtMin = (now - lastLoopMs) / 60000.0f;
  }
  lastLoopMs = now;

  if (WiFi.status() != WL_CONNECTED) {
    connectWifi();
  }

  maybeRollDaily();

  if (pollHallEdge()) {
    onRevolution();
  }

  float mph = computeSpeedMph();
  bool moving = computeIsMoving(mph);
  if (moving && dtMin > 0) {
    wheelMinutesToday += dtMin;
  }

  if (now - lastTelemetryMs >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryMs = now;
    postTelemetry();
  }

  delay(3);
}
