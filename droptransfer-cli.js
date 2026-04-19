#!/usr/bin/env node
/**
 * DropTransfer CLI - Send files via WebRTC P2P
 * 
 * Usage: node droptransfer-cli.js <file1> [file2] ...
 * 
 * The CLI will:
 * 1. Create a PeerJS peer and get a code (peer ID)
 * 2. Wait for browser to connect using that code
 * 3. Send files via WebRTC data channel
 * 4. Exit when transfer complete
 */

const fs = require('fs');
const path = require('path');
const { Peer } = require('peerjs');

// ICE configuration (same as web version)
const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun01.sipphone.com' },
    { urls: 'stun:stun.ekiga.net' },
    { urls: 'stun:stun.ideasip.com' },
    { urls: 'stun:stun.iptel.org' },
    { urls: 'stun:stun.schlund.de' },
    { urls: 'stun:stunserver.org' },
    { urls: 'stun:stun.voipbuster.com' }
  ],
  iceCandidatePoolSize: 10,
  iceTransportPolicy: 'all'
};

// PeerJS cloud server (free tier)
const PEERJS_CONFIG = {
  host: '0.peerjs.com',
  port: 443,
  secure: true,
  config: ICE_CONFIG,
  debug: 1
};

const CHUNK_SIZE = 262144; // 256KB chunks

class DropTransferCLI {
  constructor(files) {
    this.files = files;
    this.peer = null;
    this.conn = null;
    this.fileIndex = 0;
    this.transferStartTime = null;
  }

  async start() {
    if (this.files.length === 0) {
      console.error('❌ No files specified');
      console.log('Usage: node droptransfer-cli.js <file1> [file2] ...');
      process.exit(1);
    }

    // Validate files
    for (const file of this.files) {
      if (!fs.existsSync(file)) {
        console.error(`❌ File not found: ${file}`);
        process.exit(1);
      }
    }

    console.log('📦 DropTransfer CLI');
    console.log(`📁 Files to send: ${this.files.length}`);
    this.files.forEach(f => {
      const stats = fs.statSync(f);
      console.log(`   - ${path.basename(f)} (${this.formatSize(stats.size)})`);
    });
    console.log('');

    await this.initPeer();
  }

  initPeer() {
    return new Promise((resolve, reject) => {
      console.log('🔌 Connecting to signaling server...');
      
      this.peer = new Peer(PEERJS_CONFIG);

      this.peer.on('open', (id) => {
        console.log('✅ Ready!');
        console.log('');
        console.log('═══════════════════════════════════════');
        console.log(`  YOUR CODE: ${id}`);
        console.log('═══════════════════════════════════════');
        console.log('');
        console.log('👉 Receiver: Go to https://qqshi13.github.io/droptransfer/');
        console.log(`👉 Enter code: ${id}`);
        console.log('');
        console.log('⏳ Waiting for receiver to connect...');
        resolve();
      });

      this.peer.on('connection', (conn) => {
        this.handleConnection(conn);
      });

      this.peer.on('error', (err) => {
        console.error('❌ Peer error:', err.message);
        reject(err);
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        if (!this.conn) {
          console.log('');
          console.log('⏱️  Timeout: No receiver connected within 5 minutes');
          console.log('   Try again or check your network/firewall');
          this.cleanup();
          process.exit(1);
        }
      }, 5 * 60 * 1000);
    });
  }

  handleConnection(conn) {
    console.log('🔗 Receiver connected!');
    this.conn = conn;

    conn.on('open', () => {
      console.log('📡 Starting file transfer...');
      this.transferStartTime = Date.now();
      this.sendFiles();
    });

    conn.on('data', (data) => {
      this.handleResponse(data);
    });

    conn.on('close', () => {
      console.log('👋 Connection closed');
      this.cleanup();
    });

    conn.on('error', (err) => {
      console.error('❌ Connection error:', err);
      this.cleanup();
    });
  }

  async sendFiles() {
    const totalSize = this.files.reduce((sum, f) => sum + fs.statSync(f).size, 0);
    
    // Send metadata
    const metadata = {
      type: 'metadata',
      files: this.files.map(f => ({
        name: path.basename(f),
        size: fs.statSync(f).size,
        type: 'application/octet-stream'
      })),
      totalSize: totalSize,
      fileCount: this.files.length
    };

    console.log(`📋 Sending metadata (${this.files.length} files, ${this.formatSize(totalSize)} total)...`);
    this.conn.send(metadata);

    // Wait for ready signal
    await this.waitForReady();

    // Send each file
    for (let i = 0; i < this.files.length; i++) {
      await this.sendFile(this.files[i], i);
    }

    // Send completion
    this.conn.send({ type: 'complete' });
    
    const duration = (Date.now() - this.transferStartTime) / 1000;
    const speed = (totalSize / duration / 1024 / 1024).toFixed(2);
    
    console.log('');
    console.log('✅ Transfer complete!');
    console.log(`   Duration: ${duration.toFixed(1)}s`);
    console.log(`   Average speed: ${speed} MB/s`);
    console.log('');

    // Wait a bit then cleanup
    setTimeout(() => this.cleanup(), 2000);
  }

  waitForReady() {
    return new Promise((resolve) => {
      const checkReady = (data) => {
        if (data === 'ready' || (data.type === 'ready')) {
          console.log('✋ Receiver ready, starting transfer...');
          resolve();
        }
      };
      this.conn.on('data', checkReady);
    });
  }

  async sendFile(filePath, fileIndex) {
    const fileName = path.basename(filePath);
    const stats = fs.statSync(filePath);
    const totalSize = stats.size;
    
    console.log(`\n📤 Sending: ${fileName} (${this.formatSize(totalSize)})`);

    // Send file start signal
    this.conn.send({
      type: 'file-start',
      index: fileIndex,
      name: fileName,
      size: totalSize
    });

    // Read and send chunks
    const stream = fs.createReadStream(filePath, { highWaterMark: CHUNK_SIZE });
    let chunkIndex = 0;
    let bytesSent = 0;

    for await (const chunk of stream) {
      this.conn.send({
        type: 'chunk',
        fileIndex: fileIndex,
        chunkIndex: chunkIndex,
        data: chunk
      });

      bytesSent += chunk.length;
      chunkIndex++;

      // Progress bar
      const progress = (bytesSent / totalSize * 100).toFixed(1);
      process.stdout.write(`\r   Progress: ${progress}% (${this.formatSize(bytesSent)}/${this.formatSize(totalSize)})`);

      // Throttle if buffer full (simple approach)
      if (this.conn.bufferSize > 8 * 1024 * 1024) {
        await this.sleep(50);
      }
    }

    console.log('');
    console.log(`   ✓ Sent ${chunkIndex} chunks`);

    // Send file complete
    this.conn.send({
      type: 'file-complete',
      index: fileIndex
    });
  }

  handleResponse(data) {
    if (typeof data === 'string') {
      if (data === 'ack') {
        // Simple acknowledgment
      }
      return;
    }

    if (data.type === 'progress') {
      // Receiver progress update
    }
  }

  formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  cleanup() {
    if (this.conn) {
      this.conn.close();
    }
    if (this.peer) {
      this.peer.destroy();
    }
    console.log('👋 Cleanup complete');
    process.exit(0);
  }
}

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\n🛑 Interrupted');
  process.exit(0);
});

// Main
const files = process.argv.slice(2);
const transfer = new DropTransferCLI(files);
transfer.start().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});