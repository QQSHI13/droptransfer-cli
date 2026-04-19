# DropTransfer CLI

Send files from command line to browser via WebRTC P2P.

## Quick Start

```bash
# Install dependencies
npm install

# Send a file
node droptransfer-cli.js myfile.txt

# Or with alias
./qq myfile.txt
```

## How It Works

1. **CLI generates a code** (PeerJS peer ID)
2. **Share the code** with receiver
3. **Receiver** goes to https://qqshi13.github.io/droptransfer/
4. **Receiver enters code** and connects
5. **Files transfer directly** (P2P, no server storage)

## Usage

```bash
# Single file
node droptransfer-cli.js document.pdf

# Multiple files
node droptransfer-cli.js file1.jpg file2.mp4 file3.zip

# Folder (not implemented yet)
# node droptransfer-cli.js --folder myfolder/
```

## Requirements

- Node.js 14+
- Internet connection (for signaling server)
- Browser receiver at https://qqshi13.github.io/droptransfer/

## Features

- ✅ Direct P2P transfer (no intermediary server)
- ✅ End-to-end encryption (WebRTC DTLS)
- ✅ Works across networks (NAT traversal via STUN)
- ✅ Progress bar
- ✅ Multiple file support
- ✅ Large file support (chunked transfer)

## Network Requirements

| Scenario | Works? | Notes |
|----------|--------|-------|
| Same WiFi | ✅ Yes | Direct local connection |
| Different networks | ✅ Yes | STUN/TURN helps NAT traversal |
| Mobile 4G/5G | ⚠️ Maybe | CGNAT may need TURN relay |
| Corporate firewall | ⚠️ Maybe | May block WebRTC |

## Limitations

- Receiver must use browser (no CLI-to-CLI yet)
- Max 5 minute wait for receiver to connect
- Requires PeerJS cloud server for initial signaling

## License

GPL-3.0