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

// Slotted IR module (LM393): D0 reads HIGH when a flag blocks the slot and LOW
// when the slot is clear -> the sensor is active HIGH, so this is false.
#define SENSOR_ACTIVE_LOW false

// Ignore edges closer than this (ms) — reduces double-counts / chatter.
// Also caps top speed: 45 ms -> up to ~22 revs/sec, far beyond any hamster.
#define DEBOUNCE_MS 45

// If no revolution for this long, treat wheel as stopped (ms).
// Should be >= TELEMETRY_INTERVAL_MS so one slow revolution still reads "moving".
#define STOPPED_AFTER_MS 6000

// POST interval to backend (ms)
#define TELEMETRY_INTERVAL_MS 5000

// Wi-Fi reconnect: try at most this often (ms)
#define WIFI_RETRY_MS 10000

// miles = (diameter_cm * PI) / 160934  — measured wheel: 20 cm diameter
#define WHEEL_CIRCUMFERENCE_MILES (20.0f * 3.14159265f / 160934.0f)

// Number of flags on the wheel that pass through the slot per full revolution.
// Two flags opposite each other -> 2 sensor pulses per revolution.
#define FLAGS_PER_REV 2

// Distance covered per sensor pulse (one flag pass = a fraction of a rev).
#define MILES_PER_PULSE (WHEEL_CIRCUMFERENCE_MILES / (float)FLAGS_PER_REV)

// ----- State -----
unsigned long revolutionsToday = 0;
float wheelMinutesToday = 0.0f;

char currentDateStr[12] = "1970-01-01";
char lastDateStr[12] = "";

// ----- Interrupt-driven revolution counting -----
// The ISR counts magnet passes in hardware, so we NEVER miss one — even while
// loop() is blocked doing a Wi-Fi POST. All ISR vars are volatile.
volatile unsigned long isrRevCount = 0;          // total passes seen by the ISR
volatile unsigned long isrLastRevMicros = 0;     // micros() of last accepted pass
volatile unsigned long isrLastIntervalMicros = 0;// gap between the last two passes
unsigned long processedRevCount = 0;             // how many we've folded into totals

unsigned long lastRevMs = 0;
unsigned long lastRevIntervalMs = 0;
float smoothedMph = 0.0f;

// ----- Speed smoothing -----
// A single revolution interval swings a lot (the flags aren't perfectly
// spaced and the hamster surges), so we keep the last SPEED_WINDOW accepted
// intervals and speed from the MEDIAN of them, then blend it into the
// displayed value once per pulse. A smaller window + heavier weight on the
// new reading keeps the display responsive (ramps up quickly, tracks the
// real speed) instead of lagging. Impossible (>25 mph) intervals are
// rejected before they enter the window.
#define SPEED_WINDOW 4
#define SPEED_MAX_MPH 25.0f
unsigned long revIntervalBuf[SPEED_WINDOW];
uint8_t revIntervalCount = 0;
uint8_t revIntervalIdx = 0;

// True if the wheel turned at all since the last telemetry POST. This makes the
// 5 s snapshot report "moving" whenever motion happened during the window,
// instead of only if it was moving at the exact instant of the POST.
bool movedSinceLastTelemetry = false;

unsigned long lastTelemetryMs = 0;
unsigned long lastWifiAttempt = 0;

/** Runs in hardware on each magnet pass. Keep it tiny + IRAM-resident. */
void IRAM_ATTR onHallEdge() {
  unsigned long nowUs = micros();
  unsigned long last = isrLastRevMicros;
  // Debounce in the ISR: ignore edges closer together than DEBOUNCE_MS.
  if (last != 0 && (nowUs - last) < (unsigned long)DEBOUNCE_MS * 1000UL) {
    return;
  }
  if (last != 0) {
    isrLastIntervalMicros = nowUs - last;
  }
  isrLastRevMicros = nowUs;
  isrRevCount++;
}

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
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);         // disable modem power-save — top cause of random drops
  WiFi.setAutoReconnect(true);  // let the stack re-associate cleanly on its own
  WiFi.disconnect();            // clear any half-open attempt (stops "cannot set config")
  delay(100);
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
    // status codes: 1=SSID not found, 4=wrong password/auth, 6=disconnected
    Serial.printf("[wifi] Failed (status=%d) — will retry\n", WiFi.status());
  }
}

/**
 * Fold any passes the ISR counted into the running totals. Called every loop —
 * cheap, and immune to whatever else loop() is doing (Wi-Fi, delays, etc.).
 */
void processRevolutions() {
  noInterrupts();
  unsigned long revs = isrRevCount;
  unsigned long intervalUs = isrLastIntervalMicros;
  interrupts();

  if (revs != processedRevCount) {
    unsigned long added = revs - processedRevCount;
    processedRevCount = revs;
    revolutionsToday += added;
    lastRevMs = millis();
    movedSinceLastTelemetry = true;
    if (intervalUs > 0) {
      lastRevIntervalMs = intervalUs / 1000UL;
      pushRevInterval(lastRevIntervalMs);
    }
    Serial.printf("[wheel] +%lu rev (today %lu)\n", added, revolutionsToday);
  }
}

/** Accept a new pulse interval into the window and update the speed. */
void pushRevInterval(unsigned long intervalMs) {
  if (intervalMs == 0) {
    return;
  }
  float inst = (MILES_PER_PULSE * 3600.0f * 1000.0f) / (float)intervalMs;
  if (inst > SPEED_MAX_MPH) {
    return;  // sensor chatter / impossible speed — reject the sample
  }
  revIntervalBuf[revIntervalIdx] = intervalMs;
  revIntervalIdx = (revIntervalIdx + 1) % SPEED_WINDOW;
  if (revIntervalCount < SPEED_WINDOW) {
    revIntervalCount++;
  }

  float target = (MILES_PER_PULSE * 3600.0f * 1000.0f) / (float)medianIntervalMs();
  // Weight the new (median) reading heavily so the speed responds quickly; the
  // median has already removed most of the per-pulse jitter.
  smoothedMph = smoothedMph * 0.35f + target * 0.65f;
}

/** Median of the buffered intervals (insertion sort — max 6 elements). */
unsigned long medianIntervalMs() {
  unsigned long sorted[SPEED_WINDOW];
  for (uint8_t i = 0; i < revIntervalCount; i++) {
    unsigned long v = revIntervalBuf[i];
    int8_t j = i - 1;
    while (j >= 0 && sorted[j] > v) {
      sorted[j + 1] = sorted[j];
      j--;
    }
    sorted[j + 1] = v;
  }
  if (revIntervalCount == 0) {
    return 0;
  }
  if (revIntervalCount % 2 == 1) {
    return sorted[revIntervalCount / 2];
  }
  return (sorted[revIntervalCount / 2 - 1] + sorted[revIntervalCount / 2]) / 2;
}

float computeSpeedMph() {
  unsigned long now = millis();
  if (lastRevMs == 0) {
    return 0.0f;
  }
  unsigned long since = now - lastRevMs;
  if (since > STOPPED_AFTER_MS) {
    // Stopped: decay toward 0 and drop stale intervals so the next run
    // doesn't start from old (possibly slow) samples.
    revIntervalCount = 0;
    revIntervalIdx = 0;
    smoothedMph *= 0.9f;
    if (smoothedMph < 0.05f) {
      smoothedMph = 0.0f;
    }
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

String buildJsonPayload(float mph, bool moving) {
  float milesToday = revolutionsToday * MILES_PER_PULSE;
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
  // "Moving" if the wheel turned any time during this telemetry window, OR it's
  // still within the stopped-timeout right now. This is what kills the flicker.
  bool moving = movedSinceLastTelemetry || computeIsMoving(mph);

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

  // Reset the window flag AFTER a successful attempt so the next window is fresh.
  movedSinceLastTelemetry = false;
}

void setup() {
  Serial.begin(115200);
  delay(600);

  pinMode(HALL_PIN, INPUT);  // LM393 module drives D0 and has its own pull-up
  // Count every flag pass in hardware. Active-high sensor -> trigger on RISING.
  attachInterrupt(digitalPinToInterrupt(HALL_PIN), onHallEdge,
                  SENSOR_ACTIVE_LOW ? FALLING : RISING);

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

  processRevolutions();

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
