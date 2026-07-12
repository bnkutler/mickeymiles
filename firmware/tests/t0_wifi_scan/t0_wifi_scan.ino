/**
 * WiFi SCAN — what 2.4 GHz networks can this board actually see?
 * If "Trap House" does NOT appear here, the board can't reach it
 * (it's 5 GHz-only, out of range, or hidden) — no password will fix that.
 *
 * Look at the RSSI: closer to 0 is stronger. Below about -80 is weak.
 */

#include <WiFi.h>

void setup() {
  Serial.begin(115200);
  delay(600);
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  delay(200);
  Serial.println("\n[scan] Scanning for 2.4 GHz networks...");
}

void loop() {
  int n = WiFi.scanNetworks();
  Serial.printf("[scan] found %d networks:\n", n);
  for (int i = 0; i < n; i++) {
    Serial.printf("  %2d) RSSI %4d dBm  %s%s\n",
      i + 1,
      WiFi.RSSI(i),
      WiFi.SSID(i).c_str(),
      (WiFi.encryptionType(i) == WIFI_AUTH_OPEN) ? "  [open]" : "");
  }
  Serial.println("[scan] ---- rescanning in 8s ----");
  delay(8000);
}
