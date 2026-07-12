/**
 * TEST 3 — Revolution counter (same debounce logic as the real firmware)
 * Goal: confirm each magnet pass counts exactly ONCE (no double counts,
 *       no missed passes), and that it works at spinning speed.
 *
 * Uses the identical debounce + rising-edge detection from mickey_tracker.ino,
 * so if this behaves, the real firmware's counting will too.
 *
 * TRY THIS:
 *   1. Wave the magnet past ~10 times slowly. Count should land on 10.
 *   2. Tape the magnet to the wheel, spin it by hand. Watch the interval (ms)
 *      and estimated MPH look sane. If you get 2 counts per pass, raise
 *      DEBOUNCE_MS. If you MISS fast passes, lower it.
 */

#define HALL_PIN 4              // GPIO4 == pad D3
#define SENSOR_ACTIVE_LOW true
#define DEBOUNCE_MS 45          // same as firmware; tune here if needed

// Set this from your wheel to sanity-check MPH (diameter in cm):
#define WHEEL_DIAMETER_CM 28.0f
#define WHEEL_MILES (WHEEL_DIAMETER_CM * 3.14159265f / 160934.0f)

bool lastStableHall = false;
unsigned long debounceStartMs = 0;
unsigned long revolutions = 0;
unsigned long lastRevMs = 0;

bool hallRawActive() {
  int v = digitalRead(HALL_PIN);
#if SENSOR_ACTIVE_LOW
  return (v == LOW);
#else
  return (v == HIGH);
#endif
}

bool pollHallEdge() {
  bool raw = hallRawActive();
  unsigned long now = millis();
  if (raw != lastStableHall) {
    if (debounceStartMs == 0) debounceStartMs = now;
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

void setup() {
  Serial.begin(115200);
  pinMode(HALL_PIN, INPUT_PULLUP);
  delay(500);
  Serial.println();
  Serial.println("[t3] Counting magnet passes. Wave or spin the wheel.");
}

void loop() {
  if (pollHallEdge()) {
    unsigned long now = millis();
    unsigned long dt = (lastRevMs > 0) ? (now - lastRevMs) : 0;
    lastRevMs = now;
    revolutions++;
    float mph = 0.0f;
    if (dt > 0) mph = (WHEEL_MILES * 3600000.0f) / (float)dt;
    Serial.printf("[t3] count=%lu  interval=%lums  ~%.2f mph\n", revolutions, dt, mph);
  }
  delay(2);
}
