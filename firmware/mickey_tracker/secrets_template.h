/**
 * Copy this file to secrets.h and fill in your values.
 * secrets.h is gitignored — do not commit real credentials.
 */

#ifndef SECRETS_H
#define SECRETS_H

// Your Wi-Fi network
#define WIFI_SSID "your-wifi-name"
#define WIFI_PASSWORD "your-wifi-password"

// Backend base URL with NO trailing slash
// Local dev:  "http://192.168.1.50:3000"  (your PC's LAN IP)
// Deployed:   "https://your-service.onrender.com"
#define API_BASE_URL "https://your-backend.example.com"

// Must match TELEMETRY_SECRET in server .env
#define API_SECRET "same-secret-as-server-env"

// IANA timezone for "today" boundaries (examples below)
// US Pacific:  "PST8PDT,M3.2.0,M11.1.0"
// US Eastern:  "EST5EDT,M3.2.0,M11.1.0"
// UTC:         "UTC0"
#define TZ_STRING "PST8PDT,M3.2.0,M11.1.0"

#endif
