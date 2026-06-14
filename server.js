const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'drops.json');

// Ensure data directory and drops.json exist
if (!fs.existsSync(path.dirname(DB_PATH))) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}
if (!fs.existsSync(DB_PATH)) {
  fs.writeFileSync(DB_PATH, JSON.stringify([], null, 2), 'utf8');
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper to read database
function readDrops() {
  try {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading drops DB:', err);
    return [];
  }
}

// Helper to write database
function writeDrops(drops) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(drops, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing drops DB:', err);
  }
}

// REST API Endpoints
// Get all drops
app.get('/api/drops', (req, res) => {
  const drops = readDrops();
  res.json(drops);
});

// Create a new drop (can be triggered by POST request)
app.post('/api/drops', (req, res) => {
  const { latitude, longitude, intensity, note } = req.body;

  if (latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'Latitude and Longitude are required.' });
  }

  const drops = readDrops();
  const newDrop = {
    id: 'drop_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    latitude: parseFloat(latitude),
    longitude: parseFloat(longitude),
    intensity: parseFloat(intensity || 1.0),
    note: note || '',
    timestamp: Date.now()
  };

  drops.push(newDrop);
  writeDrops(drops);

  // Broadcast to all active WebSocket clients (Map views)
  broadcast(newDrop);

  res.status(201).json({ success: true, drop: newDrop });
});

// WebSocket Handling
wss.on('connection', (ws) => {
  console.log('Client connected to WebSocket server');
  
  // Send current historical drops upon initial connection
  const history = readDrops();
  ws.send(JSON.stringify({ type: 'history', data: history }));

  ws.on('close', () => {
    console.log('Client disconnected');
  });
  
  ws.on('error', (err) => {
    console.error('WebSocket client error:', err);
  });
});

// Broadcast helper to send to all connected clients
function broadcast(data) {
  const message = JSON.stringify({ type: 'new_drop', data });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Start Server
server.listen(PORT, () => {
  const os = require('os');
  let localIp = '127.0.0.1';
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          localIp = iface.address;
          break;
        }
      }
      if (localIp !== '127.0.0.1') break;
    }
  } catch (err) {
    console.error('Error fetching local IP address:', err);
  }

  console.log(`==================================================`);
  console.log(` PISS IN THE CITY // 都市における放尿 Active!`);
  console.log(` Server (Local):       http://localhost:${PORT}`);
  console.log(` Server (LAN / Wi-Fi): http://${localIp}:${PORT}`);
  console.log(` Map Dashboard (LAN):  http://${localIp}:${PORT}/map.html`);
  console.log(`==================================================`);
});
