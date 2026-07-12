/**
 * TEST 4 — Wi-Fi + backend reachability
 * Goal: confirm the board joins your Wi-Fi and can reach the server,
 *       BEFORE debugging the full telemetry firmware.
 *
 * Fill in the three values below (or copy from your secrets.h).
 * Note: ESP32 joins 2.4 GHz networks only — a 5 GHz-only SSID will fail.
 *
 * PASS = prints an IP address, then "health HTTP 200".
 */

#include <WiFi.h>
#include <HTTPClient.h>

const char* WIFI_SSID     = "your-wifi-name";
const char* WIFI_PASSWORD = "your-wifi-password";
const char* API_BASE_URL  = "https://mickeymiles.onrender.com"; // no trailing slash

void setup() {
  Serial.begin(115200);
  delay(600);
  Serial.printf("\n[t4] Connecting to %s ...\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 40) {
    delay(500);
    Serial.print(".");
    tries++;
  }
  Serial.println();
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[t4] Wi-Fi FAILED. Check SSID/password and that it's 2.4 GHz.");
    return;
  }
  Serial.print("[t4] Wi-Fi OK. IP = ");
  Serial.println(WiFi.localIP());

  HTTPClient http;
  String url = String(API_BASE_URL) + "/api/health";
  Serial.printf("[t4] GET %s\n", url.c_str());
  http.begin(url);
  http.setTimeout(15000);
  int code = http.GET();
  Serial.printf("[t4] health HTTP %d\n", code);
  Serial.println(http.getString());
  http.end();

  if (code == 200) {
    Serial.println("[t4] SUCCESS — board can reach the backend. Ready for full firmware.");
  } else {
    Serial.println("[t4] Reached Wi-Fi but not the server. If this is a fresh Render");
    Serial.println("     free instance it may be asleep — retry once, it cold-starts.");
  }
}

void loop() {}
