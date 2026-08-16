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

// ----- Phantom-pulse guard -----
// A slot sensor counts *anything* that chops its beam at the right rate. In
// Jul/Aug 2026 a 120 Hz light source (mains ripple) reached the detector: the
// ISR debounce quantised it to a dead-steady 20 pulses/sec, 24 hours a day, and
// the backend banked ~337 miles/day against a real ~0.3. Nothing in the speed
// path caught it, because 20 Hz reads as ~15 mph — under the old 25 mph reject.
//
// Two tells separate a machine from a hamster:
//
//   1. Regularity. Mains flicker arrives every 50.000 ms forever; a hamster's
//      pulse interval wanders by tens of ms from step to step. So if
//      STEADY_PULSE_LIMIT consecutive intervals each land within
//      PULSE_JITTER_MS of the one before, it isn't a hamster. This is the fast
//      trip — it catches the fault in ~20 s, roughly a tenth of a mile.
//   2. It never stops. Backstop for a sensor that's noisy rather than periodic:
//      motion for MAX_CONTINUOUS_RUN_MS with never a STOPPED_AFTER_MS pause.
//      Mickey's *entire* day tops out around 45 wheel-minutes across several
//      bouts, so an unbroken 45-minute run is already off the map.
//
// Either trip freezes the counters until pulses genuinely cease for
// SENSOR_RECOVER_MS.
#define PULSE_JITTER_MS 3UL
#define STEADY_PULSE_LIMIT 400UL
#define MAX_CONTINUOUS_RUN_MS (45UL * 60UL * 1000UL)
#define SENSOR_RECOVER_MS 60000UL

// Belt and braces: a hard ceiling on miles banked in one day. Mickey's best
// real day is well under a mile.
#define MAX_DAILY_MILES 12.0f

// If no telemetry POST has succeeded in this long, something is wedged (Wi-Fi
// stack, HTTP client, DNS). Reboot rather than sit silent — the tracker went
// dark for 11 days in Aug 2026 with no way to recover on its own.
#define WATCHDOG_MS (15UL * 60UL * 1000UL)

// Re-sync the clock this often. Also re-synced whenever it looks unset.
#define CLOCK_RESYNC_MS (6UL * 60UL * 60UL * 1000UL)

// miles = (diameter_cm * PI) / 160934  — measured wheel: 20 cm diameter
#define WHEEL_CIRCUMFERENCE_MILES (20.0f * 3.14159265f / 160934.0f)

// Number of flags on the wheel that pass through the slot per full revolution.
// Two flags opposite each other -> 2 sensor pulses per revolution.
#define FLAGS_PER_REV 2

// Distance covered per sensor pulse (one flag pass = a fraction of a rev).
#define MILES_PER_PULSE (WHEEL_CIRCUMFERENCE_MILES / (float)FLAGS_PER_REV)

// ----- State -----
unsigned long revolutionsToday = 0;
// Wheel time is accumulated in whole milliseconds, not float minutes: a float
// carrying ~1000 minutes has an ulp bigger than a 3 ms loop tick, so the
// additions silently vanish and the counter freezes short of the real value.
unsigned long wheelMillisToday = 0;

char currentDateStr[12] = "1970-01-01";
char lastDateStr[12] = "";

// ----- Health -----
bool clockValid = false;             // NTP has actually landed (year >= 2020)
unsigned long lastClockSyncMs = 0;
unsigned long lastPostOkMs = 0;      // millis() of the last 2xx from the backend
bool sensorSuspect = false;          // phantom-pulse guard has latched
unsigned long runStartMs = 0;        // start of the current unbroken moving bout
unsigned long steadyPulseStreak = 0; // consecutive near-identical pulse intervals
unsigned long prevIntervalMs = 0;

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

/**
 * Sync the clock over NTP *in the trail timezone*.
 *
 * Use configTzTime, never configTime(0, 0, ...): configTime derives a TZ string
 * from the offsets it is handed and calls setenv("TZ")/tzset() itself, so
 * passing 0,0 silently overwrote the TZ_STRING set in setup() and left the
 * device on UTC. Every daily counter then rolled at 19:00 Central instead of
 * midnight, and the log's day boundaries drifted with it.
 */
void syncClock() {
  lastClockSyncMs = millis();
  configTzTime(TZ_STRING, "pool.ntp.org", "time.nist.gov");
  for (int i = 0; i < 30; i++) {
    struct tm ti;
    if (getLocalTime(&ti) && ti.tm_year + 1900 >= 2020) {
      clockValid = true;
      Serial.printf("[time] NTP synced: %04d-%02d-%02d %02d:%02d %s\n", ti.tm_year + 1900,
                    ti.tm_mon + 1, ti.tm_mday, ti.tm_hour, ti.tm_min, TZ_STRING);
      return;
    }
    delay(500);
  }
  Serial.println("[time] NTP sync failed — will retry; not posting until the clock is real");
}

/**
 * Re-sync when the clock has never landed, or every CLOCK_RESYNC_MS to correct
 * drift. setup() only ever synced once, so a device that booted while the
 * router was still down (power cut) stayed on 1970 forever.
 */
void maybeSyncClock() {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }
  unsigned long now = millis();
  unsigned long due = clockValid ? CLOCK_RESYNC_MS : 30000UL;
  if (lastClockSyncMs != 0 && now - lastClockSyncMs < due) {
    return;
  }
  syncClock();
}

void updateDateString() {
  struct tm ti;
  if (!getLocalTime(&ti) || ti.tm_year + 1900 < 2020) {
    clockValid = false;
    return;
  }
  clockValid = true;
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
    wheelMillisToday = 0;
    strncpy(lastDateStr, currentDateStr, sizeof(lastDateStr) - 1);
  }
}

/** Miles banked today, from the pulse count. */
float milesToday() {
  return revolutionsToday * MILES_PER_PULSE;
}

/**
 * Phantom-pulse guard, tell #1: metronome regularity. A hamster's stride wanders
 * by tens of milliseconds between pulses; a 120 Hz light source quantised by the
 * ISR debounce lands on the same interval every single time.
 */
void checkPulseRegularity(unsigned long intervalMs) {
  unsigned long drift = intervalMs > prevIntervalMs ? intervalMs - prevIntervalMs
                                                    : prevIntervalMs - intervalMs;
  if (prevIntervalMs != 0 && drift <= PULSE_JITTER_MS) {
    steadyPulseStreak++;
    if (!sensorSuspect && steadyPulseStreak >= STEADY_PULSE_LIMIT) {
      sensorSuspect = true;
      Serial.printf("[sensor] SUSPECT: %lu pulses at a steady %lu ms — that is not a hamster. "
                    "Freezing counters; check for a light source hitting the slot sensor.\n",
                    steadyPulseStreak, intervalMs);
    }
  } else {
    steadyPulseStreak = 0;
  }
  prevIntervalMs = intervalMs;
}

/**
 * Phantom-pulse guard, tell #2: it never stops. Latches when the wheel has
 * "moved" for MAX_CONTINUOUS_RUN_MS without a single STOPPED_AFTER_MS pause.
 * Either tell clears only after the pulses genuinely stop for SENSOR_RECOVER_MS.
 */
void updateSensorHealth(bool moving) {
  unsigned long now = millis();

  if (moving) {
    if (runStartMs == 0) {
      runStartMs = now;
    } else if (!sensorSuspect && now - runStartMs > MAX_CONTINUOUS_RUN_MS) {
      sensorSuspect = true;
      Serial.printf("[sensor] SUSPECT: %lu min of unbroken motion — freezing counters. "
                    "Check for a light source hitting the slot sensor.\n",
                    (now - runStartMs) / 60000UL);
    }
    return;
  }

  runStartMs = 0;
  if (sensorSuspect && lastRevMs != 0 && now - lastRevMs > SENSOR_RECOVER_MS) {
    sensorSuspect = false;
    steadyPulseStreak = 0;
    prevIntervalMs = 0;
    Serial.println("[sensor] recovered — pulses stopped, counting again");
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
    lastRevMs = millis();
    if (intervalUs > 0) {
      lastRevIntervalMs = intervalUs / 1000UL;
      checkPulseRegularity(lastRevIntervalMs);
    }
    // Pulses always update lastRevMs and feed the guard (that is how it notices
    // they never stop), but a suspect sensor — or a day already past the
    // plausible ceiling — banks no miles.
    if (!sensorSuspect && milesToday() < MAX_DAILY_MILES) {
      revolutionsToday += added;
      movedSinceLastTelemetry = true;
      if (intervalUs > 0) {
        pushRevInterval(lastRevIntervalMs);
      }
    }
    // Rate-limited: at a phantom 20 pulses/sec this printf ran nonstop, and a
    // USB CDC write with nothing draining the other end can block the loop.
    static unsigned long lastRevLogMs = 0;
    if (lastRevMs - lastRevLogMs >= 1000UL) {
      lastRevLogMs = lastRevMs;
      Serial.printf("[wheel] +%lu rev (today %lu, %.4f mi)%s\n", added, revolutionsToday,
                    milesToday(), sensorSuspect ? " [SENSOR SUSPECT — not counted]" : "");
    }
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
  float miles = milesToday();
  float wheelMinutes = wheelMillisToday / 60000.0f;
  float avg = 0.0f;
  if (wheelMinutes > 0.05f) {
    avg = miles / (wheelMinutes / 60.0f);
    if (avg > 25.0f) {
      avg = 0.0f;
    }
  }

  String j = "{";
  j += "\"secret\":\"" + String(API_SECRET) + "\",";
  j += "\"date\":\"" + String(currentDateStr) + "\",";
  j += "\"isMoving\":" + String(moving ? "true" : "false") + ",";
  j += "\"speedMph\":" + String(mph, 3) + ",";
  j += "\"milesToday\":" + String(miles, 5) + ",";
  j += "\"wheelMinutesToday\":" + String(wheelMinutes, 3) + ",";
  j += "\"avgSpeedMph\":" + String(avg, 3);
  j += "}";
  return j;
}

void postTelemetry() {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }
  // Never post on an unsynced clock — the backend would open a 1970-01-01 row
  // at the wrong end of the trail log.
  if (!clockValid) {
    Serial.println("[api] skipped — clock not synced yet");
    return;
  }

  float mph = computeSpeedMph();
  // "Moving" if the wheel turned any time during this telemetry window, OR it's
  // still within the stopped-timeout right now. This is what kills the flicker.
  bool moving = movedSinceLastTelemetry || computeIsMoving(mph);
  if (sensorSuspect) {
    // Don't paint the site with a sprint the hamster isn't running.
    moving = false;
    mph = 0.0f;
  }

  HTTPClient http;
  String url = String(API_BASE_URL) + "/api/telemetry";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(12000);

  String body = buildJsonPayload(mph, moving);
  int code = http.POST(body);
  if (code >= 200 && code < 300) {
    lastPostOkMs = millis();
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
  lastPostOkMs = millis();  // give the watchdog a full window before it fires

  Serial.println("[boot] Mickey Miles tracker ready");
}

/** Reboot if we've been unable to reach the backend for a very long time. */
void watchdog() {
  unsigned long now = millis();
  if (now - lastPostOkMs < WATCHDOG_MS) {
    return;
  }
  Serial.printf("[watchdog] no successful POST in %lu min — restarting\n",
                (now - lastPostOkMs) / 60000UL);
  Serial.flush();
  delay(100);
  ESP.restart();
}

void loop() {
  static unsigned long lastLoopMs = 0;
  unsigned long now = millis();
  unsigned long dtMs = lastLoopMs > 0 ? now - lastLoopMs : 0;
  lastLoopMs = now;

  if (WiFi.status() != WL_CONNECTED) {
    connectWifi();
  }
  maybeSyncClock();

  maybeRollDaily();

  processRevolutions();

  float mph = computeSpeedMph();
  bool moving = computeIsMoving(mph);
  updateSensorHealth(moving);
  if (moving && !sensorSuspect) {
    wheelMillisToday += dtMs;
  }

  if (now - lastTelemetryMs >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryMs = now;
    postTelemetry();
  }

  watchdog();

  delay(3);
}
