/**
 * TEST 2 — Hall sensor RAW read (no wheel, no counting logic)
 * Goal: see the sensor's actual output change when a magnet is near,
 *       and learn (a) idle vs triggered level, (b) which magnet POLE
 *       triggers it, (c) whether it LATCHES.
 *
 * Wiring (XIAO ESP32-S3):
 *   Sensor VCC  -> 3V3
 *   Sensor GND  -> GND
 *   Sensor OUT  -> the pad labeled D3  (that pad == GPIO4)   <-- matches HALL_PIN 4
 *
 * The main firmware uses INPUT_PULLUP + SENSOR_ACTIVE_LOW=true, so this
 * test uses INPUT_PULLUP too. Open-drain hall sensors read HIGH idle,
 * LOW when triggered — that's what we're checking.
 *
 * HOW TO READ RESULTS:
 *   - With NO magnet, note the steady value (expected: 1 / HIGH).
 *   - Slowly bring one magnet face toward the sensor. Does it flip to 0?
 *   - Flip the magnet over (other pole) and try again.
 *       * Unipolar sensor: only ONE pole triggers it. Good for a single magnet.
 *       * Latching (bipolar) sensor: one pole sets it 0 and it STAYS 0 until
 *         the opposite pole passes. You'd need alternating-pole magnets, or
 *         switch to a unipolar sensor.
 *   - If the value never changes, check wiring/pin/power before anything else.
 */

#define HALL_PIN 4   // GPIO4 == pad labeled D3 on XIAO ESP32-S3

void setup() {
  Serial.begin(115200);
  pinMode(HALL_PIN, INPUT_PULLUP);
  delay(500);
  Serial.println();
  Serial.println("[t2] Reading HALL_PIN raw. Wave a magnet past the sensor.");
  Serial.println("[t2] Watch for the value flipping 1 <-> 0.");
}

void loop() {
  int v = digitalRead(HALL_PIN);
  // Print only on change so the log is readable.
  static int last = -1;
  static unsigned long lastHeartbeat = 0;
  if (v != last) {
    Serial.printf("[t2] level = %d  (%s)\n", v, v == LOW ? "TRIGGERED/active-low" : "idle");
    last = v;
  }
  // Heartbeat every 2s so you know it's alive even with no magnet.
  if (millis() - lastHeartbeat > 2000) {
    lastHeartbeat = millis();
    Serial.printf("[t2] (steady level = %d)\n", v);
  }
  delay(5);
}
