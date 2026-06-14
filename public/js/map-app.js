/**
 * URINATION IN THE CITY - Real-time Collaborative Map Dashboard
 * Logic for dark-themed Leaflet map, auto-reconnecting WebSockets, custom CSS ripples, and confessions
 */

// State variables
let map;
let ws;
let audioCtx = null;
let soundEnabled = false;
let followLatest = true;
let totalDropsCount = 0;
const persistentMarkers = [];

// DOM Elements
const socketStatusDot = document.getElementById('socket-status');
const statTotal = document.getElementById('stat-total');
const statVolume = document.getElementById('stat-volume');
const eventsFeed = document.getElementById('events-feed');
const btnToggleFollow = document.getElementById('btn-toggle-follow');
const btnToggleSound = document.getElementById('btn-toggle-sound');

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  initWebSocket();
  setupUIHandlers();
});

/**
 * 1. Initialize Leaflet Map (CartoDB Dark Matter style)
 */
function initMap() {
  map = L.map('map-container', {
    center: [35.6762, 139.6503],
    zoom: 6,
    zoomControl: false,
    attributionControl: false
  });

  L.control.zoom({ position: 'bottomleft' }).addTo(map);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
}

/**
 * 2. Setup WebSocket Connection
 */
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
  const wsUrl = protocol + window.location.host;

  console.log(`Connecting to WebSocket: ${wsUrl}`);
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('Connected to server!');
    socketStatusDot.className = 'status-dot active';
    socketStatusDot.style.backgroundColor = 'var(--accent-cyan)';
    socketStatusDot.style.boxShadow = '0 0 8px var(--accent-cyan)';
  };

  ws.onclose = () => {
    console.warn('Disconnected from server. Reconnecting in 3 seconds...');
    socketStatusDot.className = 'status-dot';
    socketStatusDot.style.backgroundColor = '#ef4444';
    socketStatusDot.style.boxShadow = '0 0 8px #ef4444';
    setTimeout(initWebSocket, 3000);
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === 'history') {
        loadHistory(message.data);
      } else if (message.type === 'new_drop') {
        handleNewDrop(message.data);
      }
    } catch (err) {
      console.error('Failed to parse WebSocket message:', err);
    }
  };

  ws.onerror = (err) => {
    console.error('WebSocket error:', err);
  };
}

/**
 * 3. Event Handlers and Visual/Audio Triggers
 */

function loadHistory(drops) {
  eventsFeed.innerHTML = '';
  totalDropsCount = drops.length;
  statTotal.textContent = totalDropsCount;
  statVolume.textContent = (totalDropsCount * 0.35).toFixed(1);

  if (drops.length === 0) {
    eventsFeed.innerHTML = `
      <div style="text-align: center; color: var(--text-secondary); margin-top: 20px; font-size: 0.8rem;">
        放尿ログがまだありません。<br>Web ARから最初の放尿を行ってください！
      </div>
    `;
    return;
  }

  const sortedDrops = [...drops].sort((a, b) => b.timestamp - a.timestamp);

  sortedDrops.forEach((drop) => {
    addPersistentPointOnMap(drop);
    appendFeedItem(drop);
  });
}

function handleNewDrop(drop) {
  totalDropsCount++;
  statTotal.textContent = totalDropsCount;
  statVolume.textContent = (totalDropsCount * 0.35).toFixed(1);

  playChime();
  triggerMapRippleAnimation(drop.latitude, drop.longitude);
  addPersistentPointOnMap(drop);
  appendFeedItem(drop, true);

  if (followLatest) {
    map.panTo([drop.latitude, drop.longitude], { animate: true, duration: 1.2 });
  }
}

function triggerMapRippleAnimation(lat, lng) {
  const rippleIcon = L.divIcon({
    html: `
      <div class="ripple-marker">
        <div class="ripple-core"></div>
        <div class="ripple-wave"></div>
        <div class="ripple-wave-delay"></div>
      </div>
    `,
    className: 'custom-ripple-container',
    iconSize: [0, 0]
  });

  const rippleMarker = L.marker([lat, lng], { icon: rippleIcon }).addTo(map);

  setTimeout(() => {
    map.removeLayer(rippleMarker);
  }, 3500);
}

// Places a small permanent neon-gold point representing urination trace absorbed
function addPersistentPointOnMap(drop) {
  const marker = L.circleMarker([drop.latitude, drop.longitude], {
    radius: 9,
    color: '#000000',
    fillColor: '#ffee00',
    fillOpacity: 1.0,
    weight: 3.5,
    className: 'glowing-point'
  }).addTo(map);

  const timeString = new Date(drop.timestamp).toLocaleString('ja-JP');
  
  // Format the popup to prominently display the confession (thought)
  marker.bindPopup(`
    <div style="color:#080705; font-family:var(--font-body); font-size:0.8rem; line-height:1.45; min-width:220px; max-width:280px; padding:4px;">
      <strong style="color:#d4a017; font-size:0.85rem; font-family:var(--font-heading); display:flex; align-items:center; gap:4px;">🟡 都市における放尿</strong>
      <div style="margin-top:6px; font-size:0.75rem; color:#666;">
        <span>時刻: ${timeString}</span><br>
        <span>位置: ${drop.latitude.toFixed(4)}, ${drop.longitude.toFixed(4)} (0.35 L)</span>
      </div>
      ${drop.note ? `
        <hr style="border:0; border-top:1px solid rgba(0,0,0,0.1); margin:8px 0;">
        <div style="font-weight:600; color:#333; font-size:0.75rem; margin-bottom:4px;">💭 その瞬間の独白:</div>
        <div style="background:rgba(255, 204, 0, 0.07); border-left:3px solid #ffcc00; padding:6px 10px; font-style:italic; font-size:0.8rem; color:#111; border-radius:0 4px 4px 0; word-break:break-all;">
          「${drop.note}」
        </div>
      ` : ''}
    </div>
  `);

  persistentMarkers.push(marker);
}

// Appends log cards with user confession blockquotes to sidebar panel
function appendFeedItem(drop, isNew = false) {
  if (eventsFeed.innerHTML.includes('放尿を待機中') || eventsFeed.innerHTML.includes('放尿ログがまだありません')) {
    eventsFeed.innerHTML = '';
  }

  const timeString = new Date(drop.timestamp).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const feedItem = document.createElement('div');
  feedItem.className = 'feed-item';
  
  const locationTag = getApproxLocationName(drop.latitude, drop.longitude);

  feedItem.innerHTML = `
    <div class="feed-time">
      <span>${timeString}</span>
      <span style="font-weight:600; color:var(--accent-cyan);">🟡 放流</span>
    </div>
    <div class="feed-desc" style="font-weight:600; margin-bottom:4px;">${locationTag}</div>
    ${drop.note ? `
      <div style="margin: 8px 0; padding: 8px 12px; background:rgba(255,204,0,0.03); border-left:3px solid var(--accent-blue); font-style:italic; color:var(--text-primary); font-size:0.82rem; border-radius:0 6px 6px 0; line-height:1.45; word-break:break-all;">
        「${drop.note}」
      </div>
    ` : ''}
    <div class="feed-meta" style="color:var(--text-secondary); font-size:0.7rem;">LAT:${drop.latitude.toFixed(4)} / LNG:${drop.longitude.toFixed(4)} (0.35L)</div>
  `;

  if (isNew) {
    eventsFeed.insertBefore(feedItem, eventsFeed.firstChild);
    
    feedItem.style.boxShadow = '0 0 12px rgba(255, 204, 0, 0.4)';
    feedItem.style.borderColor = 'var(--accent-cyan)';
    setTimeout(() => {
      feedItem.style.boxShadow = '';
      feedItem.style.borderColor = '';
    }, 2000);
  } else {
    eventsFeed.appendChild(feedItem);
  }
}

// Converts GPS coords into standard region descriptors
function getApproxLocationName(lat, lng) {
  if (lat > 35.0 && lat < 36.2 && lng > 139.0 && lng < 140.2) return "東京・関東エリア";
  if (lat > 34.3 && lat < 35.3 && lng > 135.0 && lng < 136.0) return "京都・関西エリア";
  if (lat > 34.8 && lat < 35.5 && lng > 136.5 && lng < 137.5) return "愛知・東海エリア";
  if (lat > 33.0 && lat < 34.0 && lng > 130.0 && lng < 131.0) return "福岡・九州エリア";
  if (lat > 42.5 && lat < 43.5 && lng > 141.0 && lng < 142.0) return "札幌・北海道エリア";
  
  return `GPS地点 (${lat.toFixed(2)}, ${lng.toFixed(2)})`;
}

/**
 * 4. Ambient Chime Audio Synthesis (Warm Brass)
 */
function playChime() {
  if (!soundEnabled) return;

  try {
    if (!audioCtx) {
      window.AudioContext = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContext();
    }
    
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const now = audioCtx.currentTime;
    
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();

    osc.type = 'sine';
    
    const pitches = [392.00, 440.00, 523.25, 587.33, 659.25, 783.99]; // G4, A4, C5, D5, E5, G5
    const chosenPitch = pitches[Math.floor(Math.random() * pitches.length)];
    
    osc.frequency.setValueAtTime(chosenPitch, now);
    
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(chosenPitch, now);
    filter.Q.setValueAtTime(10, now);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + 2.0);

  } catch (err) {
    console.error("Failed to synthesize chime:", err);
  }
}

/**
 * 5. Dashboard Top/Control HUD buttons handlers
 */
function setupUIHandlers() {
  btnToggleFollow.addEventListener('click', () => {
    followLatest = !followLatest;
    if (followLatest) {
      btnToggleFollow.classList.add('active');
      btnToggleFollow.textContent = '🎯';
    } else {
      btnToggleFollow.classList.remove('active');
      btnToggleFollow.textContent = '📍';
    }
  });

  btnToggleSound.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    if (soundEnabled) {
      btnToggleSound.classList.add('active');
      btnToggleSound.textContent = '🔊';
      
      if (!audioCtx) {
        window.AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();
      }
      playChime();
    } else {
      btnToggleSound.classList.remove('active');
      btnToggleSound.textContent = '🔇';
    }
  });

  setupQRGenerator();
}

/**
 * Parses and generates custom golden-amber QR Codes for mobile devices
 */
function setupQRGenerator() {
  const inputTunnelUrl = document.getElementById('input-tunnel-url');
  const qrDisplay = document.getElementById('qr-display');

  if (!inputTunnelUrl || !qrDisplay) return;

  function generateQR(val) {
    let urlVal = val.trim();
    if (!urlVal) {
      qrDisplay.innerHTML = `<span style="font-size: 0.6rem; color: var(--text-secondary); text-align: center; padding: 5px; line-height: 1.3;">URLをペーストすると<br>自動でQRコードが<br>生成されます</span>`;
      return;
    }
    
    // Auto-prepend https:// if missing
    if (!/^https?:\/\//i.test(urlVal)) {
      urlVal = 'https://' + urlVal;
    }
    
    try {
      const url = new URL(urlVal);
      // Append target path if not specified
      if (url.pathname === '/' || url.pathname === '') {
        url.pathname = '/ar.html';
      }
      
      const targetUrl = url.toString();
      
      // Request theme-colored QR Code (neon-urine gold on dark background)
      const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&color=ffcc00&bgcolor=080705&data=${encodeURIComponent(targetUrl)}`;
      
      qrDisplay.innerHTML = `
        <a href="${targetUrl}" target="_blank" title="PC上でもARシミュレータを開く" style="display: block;">
          <img src="${qrApiUrl}" alt="QR Code" style="display: block; width: 100px; height: 100px; border-radius: 4px; border: 1px solid rgba(255, 204, 0, 0.25); box-shadow: 0 0 10px rgba(255, 204, 0, 0.2);">
        </a>
      `;
    } catch (e) {
      qrDisplay.innerHTML = `<span style="font-size: 0.7rem; color: #ef4444; text-align: center; padding: 10px;">有効なURLを<br>入力してください</span>`;
    }
  }

  // Auto-detect current host (localhost, LAN IP, or Render production domain) on load
  const initialUrl = window.location.origin;
  inputTunnelUrl.value = initialUrl;
  generateQR(initialUrl);

  inputTunnelUrl.addEventListener('input', () => {
    generateQR(inputTunnelUrl.value);
  });
}
