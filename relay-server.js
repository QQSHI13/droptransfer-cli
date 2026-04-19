#!/usr/bin/env node
/**
 * DropTransfer Relay Server
 * 
 * Simple WebSocket relay for CLI-to-browser file transfer.
 * Deploy to Glitch, Heroku, or run locally.
 * 
 * Environment variables:
 *   PORT - Server port (default: 3000)
 *   PING_INTERVAL - Keepalive ping in ms (default: 30000)
 */

const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 3000;
const PING_INTERVAL = process.env.PING_INTERVAL || 30000;

// Store rooms: { roomCode: { sender: ws, receiver: ws } }
const rooms = new Map();

// Create HTTP server (for health checks)
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      rooms: rooms.size,
      uptime: process.uptime()
    }));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('DropTransfer Relay Server\nUse WebSocket to connect\n');
  }
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  console.log(`[+] New connection from ${req.socket.remoteAddress}`);
  
  let currentRoom = null;
  let role = null;

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      handleMessage(ws, msg, currentRoom, role);
      
      // Update room reference if joined
      if (msg.type === 'join') {
        currentRoom = msg.room;
        role = msg.role;
      }
    } catch (err) {
      console.error('[!] Invalid message:', err.message);
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
    }
  });

  ws.on('close', () => {
    console.log(`[-] Connection closed (${role} in ${currentRoom})`);
    cleanupRoom(currentRoom, role);
  });

  ws.on('error', (err) => {
    console.error('[!] WebSocket error:', err.message);
  });

  // Send welcome
  ws.send(JSON.stringify({ type: 'connected', server: 'droptransfer-relay' }));
});

function handleMessage(ws, msg, currentRoom, currentRole) {
  switch (msg.type) {
    case 'join':
      handleJoin(ws, msg);
      break;
      
    case 'metadata':
    case 'ready':
    case 'chunk':
    case 'file-start':
    case 'file-complete':
    case 'complete':
    case 'ack':
      // Relay to the other peer in the room
      relayMessage(currentRoom, currentRole, msg);
      break;
      
    default:
      ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
  }
}

function handleJoin(ws, msg) {
  const { room, role } = msg;
  
  if (!room || !role) {
    ws.send(JSON.stringify({ type: 'error', message: 'Missing room or role' }));
    return;
  }
  
  if (role !== 'sender' && role !== 'receiver') {
    ws.send(JSON.stringify({ type: 'error', message: 'Role must be sender or receiver' }));
    return;
  }

  // Get or create room
  if (!rooms.has(room)) {
    rooms.set(room, { sender: null, receiver: null });
  }
  
  const roomData = rooms.get(room);
  
  // Check if slot is available
  if (roomData[role]) {
    ws.send(JSON.stringify({ type: 'error', message: `${role} already in room` }));
    return;
  }
  
  // Assign to room
  roomData[role] = ws;
  ws.room = room;
  ws.role = role;
  
  console.log(`[+] ${role} joined room ${room}`);
  ws.send(JSON.stringify({ type: 'joined', room, role }));
  
  // Notify if both peers are present
  if (roomData.sender && roomData.receiver) {
    console.log(`[🔄] Room ${room} is ready (both peers connected)`);
    roomData.sender.send(JSON.stringify({ type: 'receiver-connected' }));
    roomData.receiver.send(JSON.stringify({ type: 'connected-to-sender' }));
  }
}

function relayMessage(room, fromRole, msg) {
  if (!rooms.has(room)) return;
  
  const roomData = rooms.get(room);
  const toRole = fromRole === 'sender' ? 'receiver' : 'sender';
  const target = roomData[toRole];
  
  if (target && target.readyState === WebSocket.OPEN) {
    target.send(JSON.stringify(msg));
  }
}

function cleanupRoom(room, role) {
  if (!room || !rooms.has(room)) return;
  
  const roomData = rooms.get(room);
  roomData[role] = null;
  
  // Notify other peer
  const otherRole = role === 'sender' ? 'receiver' : 'sender';
  if (roomData[otherRole] && roomData[otherRole].readyState === WebSocket.OPEN) {
    roomData[otherRole].send(JSON.stringify({ type: 'peer-disconnected', role }));
  }
  
  // Clean up empty rooms
  if (!roomData.sender && !roomData.receiver) {
    rooms.delete(room);
    console.log(`[-] Room ${room} deleted (empty)`);
  }
}

// Keepalive ping
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  });
}, PING_INTERVAL);

// Clean up stale rooms periodically
setInterval(() => {
  const now = Date.now();
  for (const [roomCode, roomData] of rooms.entries()) {
    // Check if room has been empty for too long
    const hasSender = roomData.sender && roomData.sender.readyState === WebSocket.OPEN;
    const hasReceiver = roomData.receiver && roomData.receiver.readyState === WebSocket.OPEN;
    
    if (!hasSender && !hasReceiver) {
      rooms.delete(roomCode);
      console.log(`[-] Room ${roomCode} cleaned up (stale)`);
    }
  }
}, 60000); // Every minute

server.listen(PORT, () => {
  console.log(`🚀 DropTransfer Relay Server running on port ${PORT}`);
  console.log(`   WebSocket: ws://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
});