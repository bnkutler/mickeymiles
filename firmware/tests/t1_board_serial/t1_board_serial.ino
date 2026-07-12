/**
 * TEST 1 — Board + Serial + LED
 * Goal: prove the board is selected, the port works, upload works,
 *       and the Serial Monitor is talking at 115200.
 *
 * Board:  Seeed Studio XIAO ESP32-S3
 * Tools ▸ USB CDC On Boot:  ENABLED   (required or Serial won't appear)
 * Tools ▸ Upload Speed:     921600 (or 115200 if uploads fail)
 * Serial Monitor baud:      115200
 *
 * PASS = onboard LED blinks AND you see the counter printing once/second.
 */

void setup() {
  Serial.begin(115200);
  pinMode(LED_BUILTIN, OUTPUT);
  delay(500);
  Serial.println();
  Serial.println("[t1] Board alive. If you can read this, Serial works.");
}

void loop() {
  static unsigned long n = 0;
  digitalWrite(LED_BUILTIN, HIGH);
  delay(500);
  digitalWrite(LED_BUILTIN, LOW);
  delay(500);
  Serial.printf("[t1] tick %lu\n", n++);
}
