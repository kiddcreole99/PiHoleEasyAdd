# PiHole Easy Add

A web-based application for managing PiHole blocked domains. View recently blocked URLs and easily add them to your PiHole whitelist with a single click.

## Features

- **Real-time Monitoring**: View the 50 most recently blocked domains
- **Auto-refresh**: Automatically updates the list every 10 seconds
- **Search & Filter**: Quickly find specific domains in the blocked list
- **Timestamps**: See when domains were blocked and how many times
- **One-click Whitelist**: Add domains to your PiHole whitelist instantly
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Docker Ready**: Easy deployment with Docker and Docker Compose

## Screenshots

The application displays:
- Connection status to your PiHole instance
- Search bar for filtering domains
- List of blocked domains with timestamps and block counts
- "Allow" button for each domain to add to whitelist

## Prerequisites

- Docker and Docker Compose installed
- PiHole v6.0.6 running on your network
- Network access to your PiHole instance (IP: 192.168.1.2 in this setup)

## PiHole Authentication Setup

This application uses your PiHole web interface password for authentication. PiHole v6 uses session-based authentication, so the application will automatically log in and maintain the session for you.

### What You Need

Simply use the same password you use to log into your PiHole web interface at `http://192.168.1.2/admin`.

**Don't remember your password?** Reset it via SSH:

```bash
# SSH into your PiHole
ssh pi@192.168.1.2

# Set a new password
pihole -a -p
```

You'll be prompted to enter a new password. Use this password in the application configuration.

## Installation

### Step 1: Clone or Download

Download the application files to your machine:

```bash
git clone <repository-url>
cd PiHoleEasyAdd
```

Or simply copy all files to a directory on your machine.

### Step 2: Configure Environment

1. Copy the example configuration file:
   ```bash
   cp config.env.example config.env
   ```

2. Edit `config.env` with your settings:
   ```bash
   nano config.env
   ```

3. Update the following values:
   ```env
   # PiHole Configuration
   PIHOLE_HOST=192.168.1.2
   PIHOLE_PASSWORD=your_pihole_web_password

   # Application Configuration
   MAX_ENTRIES=50
   REFRESH_INTERVAL=10

   # Session Management
   SESSION_REFRESH_MINUTES=30
   ```

   - `PIHOLE_HOST`: IP address of your PiHole (default: 192.168.1.2)
   - `PIHOLE_PASSWORD`: Your PiHole web interface password
   - `MAX_ENTRIES`: Maximum number of blocked domains to display (default: 50)
   - `REFRESH_INTERVAL`: Auto-refresh interval in seconds (default: 10)
   - `SESSION_REFRESH_MINUTES`: How often to refresh the authentication session (default: 30)

4. Save and exit (Ctrl+X, then Y, then Enter in nano)

### Step 3: Build and Run

Build and start the Docker container:

```bash
docker-compose up -d
```

This will:
- Build the Docker image
- Start the container in the background
- Expose the application on port 5000

### Step 4: Access the Application

Open your browser and navigate to:

```
http://localhost:5000
```

Or from another device on your network:

```
http://<your-machine-ip>:5000
```

## Usage

### Viewing Blocked Domains

1. The application automatically loads the 50 most recently blocked domains
2. Each domain shows:
   - Domain name
   - Time since last block (e.g., "5m ago", "2h ago")
   - Number of times blocked

### Searching/Filtering

- Use the search bar at the top to filter domains by name
- Results update in real-time as you type

### Adding to Whitelist

1. Find the domain you want to allow
2. Click the green **"Allow"** button next to it
3. The domain will be added to your PiHole whitelist
4. A confirmation message will appear
5. The domain will be removed from the blocked list

### Auto-refresh

- Auto-refresh is enabled by default (every 10 seconds)
- Toggle it on/off using the checkbox in the controls
- Manually refresh by clicking the **"Refresh Now"** button

### Connection Status

- Green dot: Successfully connected to PiHole
- Red dot: Cannot connect to PiHole (check configuration)

## Configuration Options

Edit `config.env` to customize:

| Variable | Description | Default |
|----------|-------------|---------|
| `PIHOLE_HOST` | PiHole IP address or hostname | 192.168.1.2 |
| `PIHOLE_PASSWORD` | Your PiHole web interface password | (required) |
| `MAX_ENTRIES` | Maximum domains to display | 50 |
| `REFRESH_INTERVAL` | Auto-refresh interval (seconds) | 10 |
| `SESSION_REFRESH_MINUTES` | Session refresh interval (minutes) | 30 |

After changing configuration:

```bash
docker-compose down
docker-compose up -d
```

## Docker Commands

### View Logs

```bash
docker-compose logs -f
```

### Stop the Application

```bash
docker-compose down
```

### Restart the Application

```bash
docker-compose restart
```

### Rebuild After Code Changes

```bash
docker-compose up -d --build
```

## Troubleshooting

### Connection Issues

**Problem**: "Cannot connect to PiHole" error

**Solutions**:
1. Verify PiHole is running: `ping 192.168.1.2`
2. Check password is correct in `config.env`
3. Ensure firewall allows connections to PiHole on port 80
4. Check Docker logs for authentication errors: `docker-compose logs -f`
5. Verify you can log into PiHole web interface with the same password

### No Domains Showing

**Problem**: Application loads but shows "No blocked domains found"

**Solutions**:
1. Check if PiHole has actually blocked any domains recently
2. Visit a known blocked site to generate test data
3. Check PiHole query log: `http://192.168.1.2/admin`
4. Verify authentication is working by checking Docker logs

### Whitelist Not Working

**Problem**: "Allow" button doesn't add domain to whitelist

**Solutions**:
1. Verify your PiHole password is correct and you're authenticated
2. Check PiHole web interface to see if whitelist is accessible
3. Check Docker logs for errors: `docker-compose logs -f`
4. Try adding domain manually in PiHole web interface to verify it works
5. Ensure session hasn't expired (app auto-refreshes every 30 minutes)

### Port Already in Use

**Problem**: Port 5000 is already in use

**Solution**: Edit `docker-compose.yml` to use a different port:
```yaml
ports:
  - "8080:5000"  # Change 5000 to any available port
```

Then restart: `docker-compose up -d`

### Docker Permission Issues

**Problem**: Permission denied when running Docker commands

**Solutions**:
- Add your user to the docker group: `sudo usermod -aG docker $USER`
- Log out and back in
- Or run commands with `sudo`

## API Endpoints

The application provides the following API endpoints:

- `GET /` - Main web interface
- `GET /api/blocked` - Fetch blocked domains (JSON)
- `POST /api/whitelist` - Add domain to whitelist
- `GET /api/health` - Check PiHole connection status

## Technical Details

- **Backend**: Python Flask
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **PiHole API**: v6.0.6 compatible
- **Container**: Python 3.11 slim
- **Web Server**: Gunicorn

## Security Notes

- This application is designed for internal home network use only
- No authentication is implemented (as requested)
- Do not expose this application to the internet
- Keep your API token secure and never commit it to version control
- The application runs as a non-root user inside the container

## Customization

### Changing the Port

Edit `docker-compose.yml`:
```yaml
ports:
  - "8080:5000"  # Change left number to desired port
```

### Changing Display Limits

Edit `config.env`:
```env
MAX_ENTRIES=100  # Show up to 100 domains
REFRESH_INTERVAL=5  # Refresh every 5 seconds
```

### Styling

To customize the appearance, edit:
- `static/style.css` - Color scheme, fonts, layout
- `templates/index.html` - HTML structure

Then rebuild: `docker-compose up -d --build`

## Support

For issues related to:
- **PiHole functionality**: Visit [PiHole Discourse](https://discourse.pi-hole.net/)
- **PiHole v6 API**: Check [PiHole v6 Documentation](https://docs.pi-hole.net/)
- **This application**: Check logs with `docker-compose logs -f`

## License

This project is provided as-is for personal use.

## Credits

Built for easy PiHole whitelist management on home networks.
