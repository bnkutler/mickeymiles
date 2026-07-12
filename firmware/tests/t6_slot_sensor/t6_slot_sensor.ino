/**
 * TEST 6 — Slotted IR module (LM393 comparator) check
 *
 * Wiring (XIAO ESP32-S3):
 *   VCC -> 3V3
 *   GND -> GND
 *   D0  -> pad D3 (GPIO4)     (same pin as the old hall sensor)
 *   A0  -> leave unconnected
 *
 * The D0 line is a driven digital output (LM393 + onboard pull-up), so we use
 * plain INPUT — no internal pull-up needed.
 *
 * WHAT TO DO:
 *   1. Adjust the POTENTIOMETER until the module's SIGNAL LED flips cleanly
 *      on/off as you block/unblock the slot with paper or a fingernail.
 *   2. Watch the monitor: block vs clear the slot and note which level (0/1)
 *      is which. Tell me, and we'll set SENSOR_ACTIVE_LOW in the firmware.
 *   3. Pass a tab through the slot FAST and SLOW. Because this is a beam-break,
 *      the count should increment every single time regardless of speed.
 */

#define SLOT_PIN 4  // GPIO4 == pad D3

unsigned long passCount = 0;
int lastLevel = -1;

void setup() {
  Serial.begin(115200);
  pinMode(SLOT_PIN, INPUT);   // module actively drives D0
  delay(500);
  Serial.println();
  Serial.println("[t6] Slot sensor monitor. Block/unblock the slot, then pass a tab fast.");
}

void loop() {
  int v = digitalRead(SLOT_PIN);
  if (v != lastLevel) {
    // Count on each HIGH->LOW transition (one pass = one count).
    // If your module reads inverted, we just flip this after seeing the levels.
    if (lastLevel == 1 && v == 0) {
      passCount++;
    }
    Serial.printf("[t6] level=%d   passes=%lu\n", v, passCount);
    lastLevel = v;
  }
  static unsigned long hb = 0;
  if (millis() - hb > 2000) {
    hb = millis();
    Serial.printf("[t6] (steady level=%d)  passes=%lu\n", digitalRead(SLOT_PIN), passCount);
  }
  delay(2);
}
