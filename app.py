from flask import Flask, render_template, jsonify, request
import requests
import os
from dotenv import load_dotenv
from datetime import datetime, timedelta
import threading
import time

load_dotenv('config.env')

app = Flask(__name__)

# Configuration
PIHOLE_HOST = os.getenv('PIHOLE_HOST', '192.168.1.2')
PIHOLE_PASSWORD = os.getenv('PIHOLE_PASSWORD', '')
MAX_ENTRIES = int(os.getenv('MAX_ENTRIES', '50'))
REFRESH_INTERVAL = int(os.getenv('REFRESH_INTERVAL', '10'))
SESSION_REFRESH_MINUTES = int(os.getenv('SESSION_REFRESH_MINUTES', '30'))

# PiHole API endpoints
PIHOLE_BASE_URL = f"http://{PIHOLE_HOST}"
PIHOLE_API_URL = f"{PIHOLE_BASE_URL}/api"
PIHOLE_AUTH_URL = f"{PIHOLE_BASE_URL}/api/auth"

# Session management
class SessionManager:
    def __init__(self):
        self.session_id = None
        self.session_expiry = None
        self.lock = threading.Lock()
        self.last_error = None

    def login(self):
        """Authenticate with PiHole and get a session ID"""
        try:
            response = requests.post(
                PIHOLE_AUTH_URL,
                json={'password': PIHOLE_PASSWORD},
                timeout=10
            )

            if response.status_code == 200:
                data = response.json()
                if 'session' in data and 'sid' in data['session']:
                    with self.lock:
                        self.session_id = data['session']['sid']
                        # Set expiry to refresh time
                        self.session_expiry = datetime.now() + timedelta(minutes=SESSION_REFRESH_MINUTES)
                        self.last_error = None
                    return True

            # Try to extract from cookies if not in JSON
            if 'Set-Cookie' in response.headers:
                cookies = response.headers['Set-Cookie']
                if 'sid=' in cookies:
                    sid = cookies.split('sid=')[1].split(';')[0]
                    with self.lock:
                        self.session_id = sid
                        self.session_expiry = datetime.now() + timedelta(minutes=SESSION_REFRESH_MINUTES)
                        self.last_error = None
                    return True

            self.last_error = f"Login failed: {response.status_code}"
            return False

        except Exception as e:
            self.last_error = f"Login error: {str(e)}"
            return False

    def get_session_id(self):
        """Get current session ID, refresh if needed"""
        with self.lock:
            # Check if session is expired or doesn't exist
            if not self.session_id or (self.session_expiry and datetime.now() >= self.session_expiry):
                # Release lock before calling login (which acquires it)
                pass

        # Login outside the lock
        if not self.session_id or (self.session_expiry and datetime.now() >= self.session_expiry):
            self.login()

        with self.lock:
            return self.session_id

    def invalidate(self):
        """Invalidate current session"""
        with self.lock:
            self.session_id = None
            self.session_expiry = None

# Global session manager
session_manager = SessionManager()

# Initialize session on startup
session_manager.login()


def auto_refresh_session():
    """Background thread to refresh session periodically"""
    while True:
        time.sleep(SESSION_REFRESH_MINUTES * 60)
        session_manager.login()


# Start background session refresh
refresh_thread = threading.Thread(target=auto_refresh_session, daemon=True)
refresh_thread.start()


def get_headers():
    """Get headers with session ID for authentication"""
    sid = session_manager.get_session_id()
    return {
        'X-FTL-SID': sid if sid else '',
        'Content-Type': 'application/json'
    }


def make_api_request(method, endpoint, **kwargs):
    """
    Make an API request with automatic session refresh on auth failure

    Args:
        method: HTTP method (get, post, etc)
        endpoint: API endpoint path
        **kwargs: Additional arguments for requests

    Returns:
        Response object or None on failure
    """
    max_retries = 2

    for attempt in range(max_retries):
        try:
            headers = get_headers()
            url = f"{PIHOLE_API_URL}/{endpoint}"
            print(f"DEBUG: Making {method.upper()} request to {url}")
            print(f"DEBUG: Headers: {headers}")
            print(f"DEBUG: Params: {kwargs.get('params', {})}")

            response = requests.request(
                method,
                url,
                headers=headers,
                timeout=kwargs.get('timeout', 10),
                **{k: v for k, v in kwargs.items() if k != 'timeout'}
            )

            print(f"DEBUG: Response status code: {response.status_code}")
            print(f"DEBUG: Response text (first 200 chars): {response.text[:200]}")

            # If unauthorized, try to refresh session and retry
            if response.status_code == 401 and attempt < max_retries - 1:
                print(f"DEBUG: Got 401, refreshing session")
                session_manager.invalidate()
                session_manager.login()
                continue

            return response

        except Exception as e:
            print(f"DEBUG: Exception in make_api_request: {type(e).__name__}: {str(e)}")
            if attempt < max_retries - 1:
                time.sleep(1)
                continue
            raise e

    return None


@app.route('/')
def index():
    """Serve the main page"""
    return render_template('index.html',
                          max_entries=MAX_ENTRIES,
                          refresh_interval=REFRESH_INTERVAL)


@app.route('/api/blocked', methods=['GET'])
def get_blocked_queries():
    """Get recently blocked queries from PiHole"""
    try:
        # PiHole v6 API endpoint for queries
        print(f"DEBUG: Attempting to fetch blocked queries from PiHole")
        print(f"DEBUG: Session ID before request: {session_manager.session_id}")
        response = make_api_request(
            'get',
            'queries',
            params={
                'status': 'blocked',
                'limit': MAX_ENTRIES
            }
        )

        if not response:
            print(f"DEBUG: make_api_request returned None")
            print(f"DEBUG: Session manager last error: {session_manager.last_error}")
            return jsonify({
                'success': False,
                'error': f'Failed to connect to PiHole API. Last error: {session_manager.last_error}'
            }), 500

        print(f"DEBUG: Got response with status code: {response.status_code}")

        if response.status_code == 200:
            data = response.json()

            # Process and format the blocked queries
            blocked_list = []
            domain_counts = {}

            # Count occurrences and get latest timestamp for each domain
            if 'queries' in data:
                for query in data['queries']:
                    domain = query.get('domain', '')
                    timestamp = query.get('timestamp', 0)

                    if domain:
                        if domain not in domain_counts:
                            domain_counts[domain] = {
                                'count': 0,
                                'latest_timestamp': timestamp,
                                'domain': domain
                            }

                        domain_counts[domain]['count'] += 1
                        if timestamp > domain_counts[domain]['latest_timestamp']:
                            domain_counts[domain]['latest_timestamp'] = timestamp

            # Convert to list and sort by latest timestamp
            blocked_list = sorted(
                domain_counts.values(),
                key=lambda x: x['latest_timestamp'],
                reverse=True
            )[:MAX_ENTRIES]

            return jsonify({
                'success': True,
                'data': blocked_list
            })
        else:
            error_msg = f'PiHole API returned status code {response.status_code}'
            if session_manager.last_error:
                error_msg += f' (Auth: {session_manager.last_error})'

            return jsonify({
                'success': False,
                'error': error_msg
            }), response.status_code

    except requests.exceptions.RequestException as e:
        return jsonify({
            'success': False,
            'error': f'Failed to connect to PiHole: {str(e)}'
        }), 500
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Error processing request: {str(e)}'
        }), 500


@app.route('/api/whitelist', methods=['POST'])
def add_to_whitelist():
    """Add a domain to the PiHole whitelist"""
    try:
        data = request.get_json()
        domain = data.get('domain', '').strip()

        if not domain:
            return jsonify({
                'success': False,
                'error': 'Domain is required'
            }), 400

        # PiHole v6 API endpoint for adding to whitelist
        response = make_api_request(
            'post',
            'domains/whitelist',
            json={'domain': domain}
        )

        if not response:
            return jsonify({
                'success': False,
                'error': 'Failed to connect to PiHole API'
            }), 500

        if response.status_code in [200, 201]:
            return jsonify({
                'success': True,
                'message': f'Successfully added {domain} to whitelist'
            })
        else:
            error_msg = 'Unknown error'
            try:
                error_data = response.json()
                error_msg = error_data.get('error', error_msg)
            except:
                error_msg = response.text or error_msg

            return jsonify({
                'success': False,
                'error': f'Failed to add to whitelist: {error_msg}'
            }), response.status_code

    except requests.exceptions.RequestException as e:
        return jsonify({
            'success': False,
            'error': f'Failed to connect to PiHole: {str(e)}'
        }), 500
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Error processing request: {str(e)}'
        }), 500


@app.route('/api/health', methods=['GET'])
def health_check():
    """Check if PiHole is reachable and authenticated"""
    try:
        response = make_api_request('get', 'status', timeout=5)

        authenticated = session_manager.get_session_id() is not None
        pihole_reachable = response is not None and response.status_code == 200

        return jsonify({
            'success': True,
            'pihole_reachable': pihole_reachable,
            'authenticated': authenticated,
            'pihole_host': PIHOLE_HOST,
            'auth_error': session_manager.last_error
        })
    except:
        return jsonify({
            'success': True,
            'pihole_reachable': False,
            'authenticated': False,
            'pihole_host': PIHOLE_HOST,
            'auth_error': session_manager.last_error
        })


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
