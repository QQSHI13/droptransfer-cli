# DropTransfer CLI

Send files from command line to browser via WebRTC P2P. Compatible with https://qqshi13.github.io/droptransfer/

## Quick Start

```bash
npm install
node droptransfer-cli.js myfile.txt

# Or use the shortcut
./qq myfile.txt
```

## How It Works

1. **CLI connects to PeerJS cloud** and gets a code (peer ID)
2. **Share the code** with receiver
3. **Receiver** goes to https://qqshi13.github.io/droptransfer/
4. **Receiver enters code** and connects via WebRTC
5. **Files transfer directly** (P2P, no server storage)

## Requirements

- Node.js 14+
- `wrtc` npm package (requires build tools)
- Internet connection (for PeerJS signaling)
- Browser receiver at https://qqshi13.github.io/droptransfer/

## Installation

```bash
# Clone
git clone https://github.com/QQSHI13/droptransfer-cli.git
cd droptransfer-cli

# Install dependencies
npm install

# wrtc requires native compilation
# On Ubuntu/Debian:
#   sudo apt-get install build-essential python3
# On Windows:
#   npm install -g windows-build-tools
```

## Usage

```bash
# Single file
node droptransfer-cli.js document.pdf

# Multiple files
node droptransfer-cli.js file1.jpg file2.mp4 file3.zip
```

## Network

| Scenario | Works? | Notes |
|----------|--------|-------|
| Same WiFi | ✅ Yes | Direct local connection |
| Different networks | ✅ Yes | STUN helps NAT traversal |
| Mobile 4G/5G | ⚠️ Maybe | CGNAT may need TURN |

## License

GPL-3.0