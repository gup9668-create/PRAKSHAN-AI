"""
=============================================================================
PRAKASHAN AI - Cloud Telemetry & AI Prediction Web Server
"Drying solutions for global agriculture"
=============================================================================
Provides REST and WebSocket endpoints for live remote farm monitoring,
supporting cloud deployments on Render, Railway, Vercel, or Raspberry Pi.
=============================================================================
"""

import os
import json
import time
from http.server import HTTPServer, SimpleHTTPRequestHandler
from prakshan_ai_core import PrakashanAICore

ai_engine = PrakashanAICore()

# In-memory latest telemetry state
latest_telemetry = {
    "temp": 36.8,
    "hum": 44.5,
    "moist": 18.2,
    "target_moist": 13.0,
    "solar_pct": 82.0,
    "bat_v": 12.65,
    "pv_v": 18.20,
    "fan": 1,
    "vent": 45,
    "state": "DRYING",
    "seed": "PADDY",
    "elapsed_s": 3600
}

class PrakashanHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # Serve static dashboard files from the dashboard directory
        dashboard_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dashboard"))
        super().__init__(*args, directory=dashboard_dir, **kwargs)

    def do_GET(self):
        if self.path == "/api/telemetry":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            
            # Process with AI Engine
            enriched = ai_engine.process_telemetry(latest_telemetry)
            self.wfile.write(json.dumps(enriched).encode("utf-8"))
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == "/api/telemetry":
            content_length = int(self.headers.get("Content-Length", 0))
            post_data = self.rfile.read(content_length)
            try:
                global latest_telemetry
                data = json.loads(post_data.decode("utf-8"))
                latest_telemetry.update(data)
                
                enriched = ai_engine.process_telemetry(latest_telemetry)
                
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "data": enriched}).encode("utf-8"))
            except Exception as e:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

def run_server(port=8080):
    server_address = ("", port)
    httpd = HTTPServer(server_address, PrakashanHandler)
    print("=================================================================")
    print("  PRAKASHAN AI - Cloud Server & Web Dashboard Running")
    print(f"  URL: http://localhost:{port}")
    print("  API: http://localhost:{port}/api/telemetry")
    print("=================================================================")
    httpd.serve_forever()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    run_server(port)
