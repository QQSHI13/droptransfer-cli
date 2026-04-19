# DropTransfer CLI

Send files from command line to browser via WebSocket relay (simple, no WebRTC needed).

## Quick Start

### 1. Start the relay server (on any machine accessible to both sides)

```bash
# On your server or local machine
node relay-server.js
# Server starts on port 3000
```

### 2. Update CLI to point to your relay

Edit `droptransfer-cli.js` and change:
```javascript
const RELAY_SERVER = 'ws://your-server-ip:3000';
```

### 3. Send files

```bash
npm install
node droptransfer-cli.js myfile.txt

# Or use the shortcut
./qq myfile.txt
```

## How It Works

1. **CLI generates a code** and connects to relay server
2. **Share the code** with receiver
3. **Receiver** goes to https://qqshi13.github.io/droptransfer/ (updated version needed)
4. **Receiver enters code** and connects to same relay
5. **Relay bridges** the connection
6. **Files transfer** through relay (or upgrade to WebRTC later)

## Deployment Options

### Option A: Local Network
```bash
# On sender machine
node relay-server.js
# Edit CLI: const RELAY_SERVER = 'ws://localhost:3000'
```

### Option B: VPS/Cloud
Deploy `relay-server.js` to:
- Glitch (free): https://glitch.com
- Heroku (free tier)
- Your VPS
- Fly.io (free)

### Option C: Public Relay (coming soon)
A public relay will be available at `wss://droptransfer-relay.example.com`

## Protocol

Message types:
- `join` - Join room as sender/receiver
- `metadata` - File info
- `ready` - Receiver ready
- `chunk` - File data (base64)
- `file-start` / `file-complete` - File boundaries
- `complete` - All files done

## Requirements

- Node.js 14+
- Network access to relay server
- Browser receiver (web version needs update)

## License

GPL-3.0