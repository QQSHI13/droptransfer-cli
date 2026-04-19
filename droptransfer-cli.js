#!/usr/bin/env node
/**
 * DropTransfer CLI v2 - WebSocket-based (works in Node.js)
 * 
 * Uses WebSocket relay for signaling, then WebRTC for data transfer
 * or falls back to WebSocket relay for the actual transfer.
 * 
 * Usage: node droptransfer-cli.js <file1> [file2] ...
 */

const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const crypto = require('crypto');

// Configuration
const RELAY_SERVER = process.env.DROPTRANSFER_RELAY || 'ws://localhost:3000';
const CHUNK_SIZE = 64 * 1024; // 64KB chunks for WebSocket

class DropTransferCLI {
  constructor(files) {
    this.files = files;
    this.ws = null;
    this.roomCode = null;
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

    console.log('📦 DropTransfer CLI v2');
    console.log(`📁 Files to send: ${this.files.length}`);
    this.files.forEach(f => {
      const stats = fs.statSync(f);
      console.log(`   - ${path.basename(f)} (${this.formatSize(stats.size)})`);
    });
    console.log('');

    await this.connect();
  }

  connect() {
    return new Promise((resolve, reject) => {
      console.log('🔌 Connecting to relay server...');
      
      this.ws = new WebSocket(RELAY_SERVER);

      this.ws.on('open', () => {
        console.log('✅ Connected to relay');
        
        // Generate room code
        this.roomCode = this.generateCode();
        
        // Join room as sender
        this.ws.send(JSON.stringify({
          type: 'join',
          role: 'sender',
          room: this.roomCode
        }));
      });

      this.ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        this.handleMessage(msg);
      });

      this.ws.on('error', (err) => {
        console.error('❌ WebSocket error:', err.message);
        reject(err);
      });

      this.ws.on('close', () => {
        console.log('🔌 Connection closed');
      });

      // Timeout
      setTimeout(() => {
        if (!this.transferStartTime) {
          console.log('');
          console.log('⏱️  Timeout: No receiver connected within 5 minutes');
          this.cleanup();
          process.exit(1);
        }
      }, 5 * 60 * 1000);
    });
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'joined':
        console.log('✅ Room created!');
        console.log('');
        console.log('═══════════════════════════════════════');
        console.log(`  YOUR CODE: ${this.roomCode}`);
        console.log('═══════════════════════════════════════');
        console.log('');
        console.log('👉 Receiver: Go to https://qqshi13.github.io/droptransfer/');
        console.log(`👉 Enter code: ${this.roomCode}`);
        console.log('');
        console.log('⏳ Waiting for receiver to connect...');
        break;

      case 'receiver-connected':
        console.log('🔗 Receiver connected!');
        this.sendMetadata();
        break;

      case 'ready':
        console.log('✋ Receiver ready, starting transfer...');
        this.transferStartTime = Date.now();
        this.sendFiles();
        break;

      case 'ack':
        // Chunk acknowledged, continue
        break;

      case 'error':
        console.error('❌ Error:', msg.message);
        break;
    }
  }

  generateCode() {
    // Generate 6-character alphanumeric code
    return crypto.randomBytes(4).toString('base64url').slice(0, 6).toLowerCase();
  }

  sendMetadata() {
    const totalSize = this.files.reduce((sum, f) => sum + fs.statSync(f).size, 0);
    
    this.ws.send(JSON.stringify({
      type: 'metadata',
      files: this.files.map(f => ({
        name: path.basename(f),
        size: fs.statSync(f).size
      })),
      totalSize,
      fileCount: this.files.length
    }));
  }

  async sendFiles() {
    for (let i = 0; i < this.files.length; i++) {
      await this.sendFile(this.files[i], i);
    }

    // Send completion
    this.ws.send(JSON.stringify({ type: 'complete' }));
    
    const duration = (Date.now() - this.transferStartTime) / 1000;
    const totalSize = this.files.reduce((sum, f) => sum + fs.statSync(f).size, 0);
    const speed = (totalSize / duration / 1024 / 1024).toFixed(2);
    
    console.log('');
    console.log('✅ Transfer complete!');
    console.log(`   Duration: ${duration.toFixed(1)}s`);
    console.log(`   Average speed: ${speed} MB/s`);
    console.log('');

    setTimeout(() => this.cleanup(), 2000);
  }

  async sendFile(filePath, fileIndex) {
    const fileName = path.basename(filePath);
    const stats = fs.statSync(filePath);
    const totalSize = stats.size;
    
    console.log(`\n📤 Sending: ${fileName} (${this.formatSize(totalSize)})`);

    // Send file start
    this.ws.send(JSON.stringify({
      type: 'file-start',
      index: fileIndex,
      name: fileName,
      size: totalSize
    }));

    // Read and send chunks
    const stream = fs.createReadStream(filePath, { highWaterMark: CHUNK_SIZE });
    let chunkIndex = 0;
    let bytesSent = 0;

    for await (const chunk of stream) {
      // Convert chunk to base64 for JSON transport
      const base64Chunk = chunk.toString('base64');
      
      this.ws.send(JSON.stringify({
        type: 'chunk',
        fileIndex,
        chunkIndex,
        data: base64Chunk
      }));

      bytesSent += chunk.length;
      chunkIndex++;

      // Progress bar
      const progress = (bytesSent / totalSize * 100).toFixed(1);
      process.stdout.write(`\r   Progress: ${progress}% (${this.formatSize(bytesSent)}/${this.formatSize(totalSize)})  `);

      // Small delay to prevent overwhelming the connection
      await this.sleep(10);
    }

    console.log('');
    console.log(`   ✓ Sent ${chunkIndex} chunks`);

    // Send file complete
    this.ws.send(JSON.stringify({
      type: 'file-complete',
      index: fileIndex
    }));
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
    if (this.ws) {
      this.ws.close();
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