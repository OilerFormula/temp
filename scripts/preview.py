"""Start a loopback-only preview and open the user's browser. No dependencies."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from functools import partial
from threading import Timer
import webbrowser

root = Path(__file__).resolve().parent.parent
try:
    server = ThreadingHTTPServer(('127.0.0.1', 4173), partial(SimpleHTTPRequestHandler, directory=str(root)))
except OSError:
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(SimpleHTTPRequestHandler, directory=str(root)))
url = f'http://127.0.0.1:{server.server_port}/'
print(f'Evrima Compare: {url}\nKeep this window open. Press Ctrl+C to stop.')
Timer(0.6, lambda: webbrowser.open(url)).start()
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
