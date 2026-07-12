/**
 * TEST 5 — Raw edge monitor (NO debounce, NO dwell, counts EVERY transition)
 * Purpose: prove whether the SENSOR emits an edge on a fast pass.
 *
 * This removes every bit of software filtering. If a fast magnet pass produces
 * NO log line here, the sensor itself isn't tripping — it's 100% physical
 * (gap / magnet strength / pole), not the code.
 *
 * Wiring: sensor OUT -> pad D3 (GPIO4), VCC -> 3V3, GND -> GND.
 *
 * HOW TO USE:
 *   1. Pass the magnet SLOWLY  -> you should see  FALL then RISE.
 *   2. Pass the magnet FAST    -> you should STILL see FALL then RISE.
 *   If fast produces nothing, the sensor never crossed its trigger threshold
 *   on that pass -> strengthen field / shrink gap / flip pole.
 */

#define HALL_PIN 4  // GPIO4 == pad D3

volatile unsigned long fallCount = 0;
volatile unsigned long riseCount = 0;
volatile unsigned long lastEdgeUs = 0;
volatile unsigned long lastGapUs  = 0;
volatile bool lastWasFall = false;
volatile bool haveEvent = false;

void IRAM_ATTR onAnyEdge() {
  unsigned long nowUs = micros();
  lastGapUs = (lastEdgeUs == 0) ? 0 : (nowUs - lastEdgeUs);
  lastEdgeUs = nowUs;
  // active-low sensor: LOW == magnet present == a FALLING edge
  if (digitalRead(HALL_PIN) == LOW) {
    fallCount++;
    lastWasFall = true;
  } else {
    riseCount++;
    lastWasFall = false;
  }
  haveEvent = true;
}

void setup() {
  Serial.begin(115200);
  pinMode(HALL_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(HALL_PIN), onAnyEdge, CHANGE);
  delay(500);
  Serial.println();
  Serial.println("[t5] Raw edge monitor: NO debounce. Pass magnet slow, then FAST.");
  Serial.println("[t5] Every real edge prints. If fast passes print nothing -> sensor issue.");
}

void loop() {
  if (haveEvent) {
    noInterrupts();
    bool fall = lastWasFall;
    unsigned long gap = lastGapUs;
    unsigned long fc = fallCount, rc = riseCount;
    haveEvent = false;
    interrupts();
    Serial.printf("[t5] %s   gap=%lu us   falls=%lu rises=%lu\n",
                  fall ? "FALL (magnet)" : "RISE (clear) ", gap, fc, rc);
  }
  // Heartbeat so you know it's alive with no magnet.
  static unsigned long hb = 0;
  if (millis() - hb > 3000) {
    hb = millis();
    Serial.printf("[t5] (alive) pin=%d falls=%lu rises=%lu\n",
                  digitalRead(HALL_PIN), fallCount, riseCount);
  }
  delay(2);
}
