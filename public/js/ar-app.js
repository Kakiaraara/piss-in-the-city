/**
 * URINATION IN THE CITY - Web AR Urination Experience
 * Visceral, raw, biological fluid physics, steam vapor, growing puddles, custom sizzle soundscape, and confessions modal
 */

// State variables
let scene, camera, renderer;
let streamParticles = [];
let splashes = [];
let ripples = [];
let steamParticles = [];
let activePuddles = []; // Grows where particles land
let groundPlane;
let audioCtx = null;
let currentCoords = { latitude: 35.6586, longitude: 139.7454 }; // Default to Tokyo Tower
let usingMockGPS = false;

// Targeted coordinates for current trigger action
let targetCoordinates = { x: 0, z: -1.5 };

// DOM Elements
const startScreen = document.getElementById('start-screen');
const btnStartAR = document.getElementById('btn-start-ar');
const btnTriggerDrip = document.getElementById('btn-trigger-drip');
const videoElement = document.getElementById('camera-stream');
const canvasElement = document.getElementById('webgl-canvas');
const gpsStatusDot = document.getElementById('gps-status-dot');
const gpsStatusText = document.getElementById('gps-status-text');
const gpsCoordsDisplay = document.getElementById('gps-coordinates');
const mockGpsPanel = document.getElementById('mock-gps-panel');
const toastElement = document.getElementById('toast');

// Thought Modal Elements
const thoughtModal = document.getElementById('thought-modal');
const inputThought = document.getElementById('input-thought');
const btnCancelThought = document.getElementById('btn-cancel-thought');
const btnSubmitThought = document.getElementById('btn-submit-thought');

// Input values for mock GPS
const inputMockLat = document.getElementById('mock-lat');
const inputMockLng = document.getElementById('mock-lng');

// Initialize system after user approval/start click
btnStartAR.addEventListener('click', async () => {
  initAudio();
  
  startScreen.style.opacity = 0;
  setTimeout(() => startScreen.style.display = 'none', 500);

  initGPS();
  await initCamera();
  initThreeJS();
  checkIfPC();
});

// Canvas screen tap: open thought modal first
canvasElement.addEventListener('pointerdown', (event) => {
  // Prevent tapping when modal is already visible
  if (thoughtModal.classList.contains('show')) return;

  const rect = renderer.domElement.getBoundingClientRect();
  const mouse = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(groundPlane);

  if (intersects.length > 0) {
    const point = intersects[0].point;
    openThoughtDialog(point.x, point.z);
  } else {
    // Fallback: Drop at a random forward location
    const randomX = (Math.random() - 0.5) * 3;
    const randomZ = -1.5 - Math.random() * 2;
    openThoughtDialog(randomX, randomZ);
  }
});

// Manual HUD button: open thought modal
btnTriggerDrip.addEventListener('click', (e) => {
  e.stopPropagation();
  if (thoughtModal.classList.contains('show')) return;
  const randomX = (Math.random() - 0.5) * 2;
  const randomZ = -1.5 - Math.random() * 1.5;
  openThoughtDialog(randomX, randomZ);
});

// Handle thought submission flow
function openThoughtDialog(x, z) {
  targetCoordinates.x = x;
  targetCoordinates.z = z;
  inputThought.value = ''; // Reset input
  thoughtModal.classList.add('show');
  inputThought.focus();
}

btnCancelThought.addEventListener('click', () => {
  thoughtModal.classList.remove('show');
});

btnSubmitThought.addEventListener('click', () => {
  const thoughtText = inputThought.value.trim() || '無題の放尿';
  thoughtModal.classList.remove('show');
  
  // Trigger physical animation, audio, and API POST with user's actual thoughts
  triggerUrinationStream(targetCoordinates.x, targetCoordinates.z, thoughtText);
});

/**
 * 1. Camera Initialization
 */
async function initCamera() {
  const constraints = {
    video: {
      facingMode: 'environment',
      width: { ideal: 1280 },
      height: { ideal: 720 }
    },
    audio: false
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    videoElement.srcObject = stream;
    console.log("Rear camera connected.");
  } catch (err) {
    console.warn("Could not access rear camera, attempting default...", err);
    try {
      const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoElement.srcObject = fallbackStream;
    } catch (fallbackErr) {
      console.error("Camera completely denied:", fallbackErr);
      const container = document.getElementById('ar-container');
      container.style.background = 'radial-gradient(circle at center, #261f0d 0%, #080705 100%)';
      videoElement.style.display = 'none';
      showToast("カメラにアクセスできません。バーチャル空間モードで起動します。");
    }
  }
}

/**
 * 2. GPS Location Setup
 */
function initGPS() {
  if (!navigator.geolocation) {
    enableMockGPS("GPS非対応端末");
    return;
  }

  const gpsOptions = {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 0
  };

  gpsStatusText.textContent = "GPS: 信号探索中...";

  navigator.geolocation.watchPosition(
    (position) => {
      currentCoords.latitude = position.coords.latitude;
      currentCoords.longitude = position.coords.longitude;
      
      gpsStatusDot.classList.add('active');
      gpsStatusText.textContent = "GPS: 接続完了 (高精度)";
      gpsCoordsDisplay.innerHTML = `
        LAT: ${currentCoords.latitude.toFixed(5)}<br>
        LNG: ${currentCoords.longitude.toFixed(5)}
      `;
      
      if (usingMockGPS) {
        inputMockLat.value = currentCoords.latitude.toFixed(4);
        inputMockLng.value = currentCoords.longitude.toFixed(4);
      }
    },
    (err) => {
      console.warn("GPS error:", err);
      enableMockGPS("位置情報の取得に失敗");
    },
    gpsOptions
  );
}

function enableMockGPS(reason) {
  usingMockGPS = true;
  mockGpsPanel.style.display = 'block';
  gpsStatusDot.classList.remove('active');
  gpsStatusDot.style.backgroundColor = '#f59e0b';
  gpsStatusDot.style.boxShadow = '0 0 8px #f59e0b';
  gpsStatusText.textContent = `GPS: 擬似モード (${reason})`;
  
  inputMockLat.addEventListener('change', updateMockCoords);
  inputMockLng.addEventListener('change', updateMockCoords);
  updateMockCoords();
}

function updateMockCoords() {
  currentCoords.latitude = parseFloat(inputMockLat.value) || 35.6586;
  currentCoords.longitude = parseFloat(inputMockLng.value) || 139.7454;
  gpsCoordsDisplay.innerHTML = `
    LAT: ${currentCoords.latitude.toFixed(5)}<br>
    LNG: ${currentCoords.longitude.toFixed(5)}
  `;
}

function checkIfPC() {
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (!isMobile) {
    enableMockGPS("PC開発環境");
  }
}

/**
 * 3. Web Audio API Urination Synthesizer (Extremely raw sizzling trickle)
 */
function initAudio() {
  try {
    window.AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
  } catch (e) {
    console.error("Web Audio API not supported:", e);
  }
}

function playPeeStreamSound() {
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  const now = audioCtx.currentTime;
  
  // 1. High frequency sizzling noise overlay (Sputtering biological fluid hitting floor)
  // We simulate continuous sizzling using 45 overlapping splashes spaced 25ms apart
  const streamDuration = 1.2; // Stream runs for 1.2s
  const dripCount = 45;
  
  for (let i = 0; i < dripCount; i++) {
    const timeOffset = (i / dripCount) * streamDuration;
    const dripTime = now + timeOffset;

    // Standard splash sweep
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();

    osc.type = 'sine';
    
    // Low, murky organic splat pitches (130Hz - 450Hz) mixed with high sizzling sweeps
    const isSplat = Math.random() > 0.4;
    const startFreq = isSplat ? (120 + Math.random() * 80) : (400 + Math.random() * 400);
    const endFreq = isSplat ? (320 + Math.random() * 100) : (1200 + Math.random() * 800);
    
    osc.frequency.setValueAtTime(startFreq, dripTime);
    osc.frequency.exponentialRampToValueAtTime(endFreq, dripTime + 0.04);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(endFreq + 100, dripTime);
    filter.Q.setValueAtTime(4, dripTime);

    // Dynamic sputtering volume envelope
    gain.gain.setValueAtTime(0.001, dripTime);
    gain.gain.linearRampToValueAtTime(0.12 + Math.random() * 0.08, dripTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, dripTime + 0.05);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(dripTime);
    osc.stop(dripTime + 0.08);
  }

  // 2. Final lagging dribbles (The classic visceral few slow drips as stream finishes!)
  const trailingDrips = 3;
  for (let i = 0; i < trailingDrips; i++) {
    const lagTime = now + streamDuration + 0.15 + (i * 0.25); // slow spacing (250ms delay)
    
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(140 + Math.random() * 40, lagTime);
    osc.frequency.exponentialRampToValueAtTime(450 + Math.random() * 150, lagTime + 0.06);

    gain.gain.setValueAtTime(0.001, lagTime);
    gain.gain.linearRampToValueAtTime(0.08, lagTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, lagTime + 0.07);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(lagTime);
    osc.stop(lagTime + 0.1);
  }
}

/**
 * 4. Three.js Render Setup
 */
function initThreeJS() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 4.5, 6);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({
    canvas: canvasElement,
    alpha: true,
    antialias: true
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Golden-yellow biological ambient glow
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xcca00c, 1.4); // Organic warm golden yellow
  dirLight.position.set(5, 10, 3);
  scene.add(dirLight);

  const backLight = new THREE.DirectionalLight(0x8b7500, 0.7); // Darker brassy rim light
  backLight.position.set(-5, 8, -2);
  scene.add(backLight);

  // Create Ground plane
  const groundGeometry = new THREE.PlaneGeometry(30, 30);
  const groundMaterial = new THREE.MeshPhongMaterial({
    color: 0xffcc00,
    transparent: true,
    opacity: 0.03,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
  groundPlane.rotation.x = -Math.PI / 2;
  scene.add(groundPlane);

  // Visual grimy golden grid
  const gridHelper = new THREE.GridHelper(20, 20, 0xd4a017, 0x3d3106);
  gridHelper.position.y = 0.01;
  gridHelper.material.transparent = true;
  gridHelper.material.opacity = 0.18;
  scene.add(gridHelper);

  animate();
  window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

/**
 * 5. Parabolic Urination Stream Mechanics & Animation
 */

function triggerUrinationStream(x, z, thoughtText) {
  btnTriggerDrip.disabled = true;
  setTimeout(() => btnTriggerDrip.disabled = false, 1500); // 1.5s cool-down to cover trickle trail

  // 1. Play raw sizzling trickle audio
  playPeeStreamSound();

  // 2. Setup messy, organic fluid particles stream
  const startPos = new THREE.Vector3(0, 1.1, 4.3);
  const endPos = new THREE.Vector3(x, 0.01, z);

  // Murky, organic yellow-brownish liquid material representing urine
  const urineMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xcca00c, // Visceral warm urine color
    transparent: true,
    opacity: 0.88,
    roughness: 0.1,
    metalness: 0.05,
    transmission: 0.75, // slightly murky/turbid
    thickness: 0.4,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1
  });

  // 3. Create a unique growing puddle on ground at landing point (x, z)
  const puddleGeo = new THREE.CircleGeometry(0.1, 32);
  const puddleMat = new THREE.MeshPhysicalMaterial({
    color: 0xcca00c,
    transparent: true,
    opacity: 0.65,
    roughness: 0.05,
    metalness: 0.05,
    transmission: 0.8,
    depthWrite: false
  });
  
  const groundPuddle = new THREE.Mesh(puddleGeo, puddleMat);
  groundPuddle.position.set(x, 0.02, z);
  groundPuddle.rotation.x = -Math.PI / 2; // Lie flat
  scene.add(groundPuddle);

  // Track puddle so it grows in scale and slowly fades out
  activePuddles.push({
    mesh: groundPuddle,
    scale: 0.1,
    maxScale: 1.8 + Math.random() * 0.8, // puddle spreads organically
    growthSpeed: 0.06,
    life: 1.0,
    decay: 0.002 // stays on floor for about 10 seconds (500 frames)
  });

  // Spawn 32 particles in rapid sequence (creating a thick, sputtering, irregular biological flow)
  const particleCount = 32;
  for (let i = 0; i < particleCount; i++) {
    // Generate particle geometry with messy variations
    const size = 0.09 + Math.random() * 0.06;
    const pGeo = new THREE.SphereGeometry(size, 12, 12);
    
    const pMesh = new THREE.Mesh(pGeo, urineMaterial.clone());
    pMesh.visible = false;
    scene.add(pMesh);

    // Stagger particle starts and add turbulence/spray deviations
    const delayFrames = i * 2.5; // continuous sputter
    const speed = 0.02 + Math.random() * 0.003;
    const pathHeight = 0.65 + Math.random() * 0.25;

    // Messy spray deviation: slightly turbulent trajectory offset
    const turbulenceX = (Math.random() - 0.5) * 0.18;
    const turbulenceZ = (Math.random() - 0.5) * 0.18;

    streamParticles.push({
      mesh: pMesh,
      t: 0.0,
      speed: speed,
      delay: delayFrames,
      startX: startPos.x,
      startY: startPos.y,
      startZ: startPos.z,
      endX: endPos.x + turbulenceX,
      endY: endPos.y,
      endZ: endPos.z + turbulenceZ,
      hMax: pathHeight
    });
  }

  // 4. Send telemetry to Backend server (storing actual thought confession)
  sendDropToBackend(currentCoords.latitude, currentCoords.longitude, thoughtText);
}

async function sendDropToBackend(lat, lng, thoughtText) {
  try {
    const response = await fetch('/api/drops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latitude: lat,
        longitude: lng,
        intensity: 1.0,
        note: thoughtText
      })
    });
    
    if (response.ok) {
      console.log(`Confessional urine post successful.`);
      showToast();
    } else {
      console.error('Failed to post pee telemetry');
    }
  } catch (error) {
    console.error('Network error saving pee data:', error);
  }
}

// Collisions trigger splashes, flat ripples, and warm steam vapor rising
function trigger3DSplash(x, z) {
  // 1. Spattering Sparks (12 dirty golden particles bouncing off)
  const splashGeo = new THREE.SphereGeometry(0.035, 8, 8);
  const splashMat = new THREE.MeshBasicMaterial({
    color: 0xc29b0a,
    transparent: true,
    opacity: 0.85
  });

  const splashCount = 10;
  for (let i = 0; i < splashCount; i++) {
    const particle = new THREE.Mesh(splashGeo, splashMat.clone());
    particle.position.set(x, 0.05, z);
    
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.02 + Math.random() * 0.04;
    const velocityX = Math.cos(angle) * speed;
    const velocityY = 0.03 + Math.random() * 0.05; // splat up
    const velocityZ = Math.sin(angle) * speed;

    scene.add(particle);
    splashes.push({
      mesh: particle,
      vx: velocityX,
      vy: velocityY,
      vz: velocityZ,
      life: 1.0,
      decay: 0.05 + Math.random() * 0.05
    });
  }

  // 2. Rising Warm Steam Vapor (Semi-transparent grimy white spheres rising and dissipating)
  if (Math.random() > 0.4) {
    const steamGeo = new THREE.SphereGeometry(0.18 + Math.random() * 0.12, 8, 8);
    const steamMat = new THREE.MeshBasicMaterial({
      color: 0xeeddbb, // grimy white-amber vapor
      transparent: true,
      opacity: 0.12,
      depthWrite: false
    });
    const steam = new THREE.Mesh(steamGeo, steamMat);
    steam.position.set(x + (Math.random() - 0.5) * 0.2, 0.05, z + (Math.random() - 0.5) * 0.2);
    scene.add(steam);

    steamParticles.push({
      mesh: steam,
      vy: 0.008 + Math.random() * 0.008, // float upwards
      vx: (Math.random() - 0.5) * 0.004,
      scale: 1.0,
      opacity: 0.12,
      decay: 0.0015
    });
  }

  // 3. Flat expanding golden ring waves
  const ringGeo = new THREE.RingGeometry(0.01, 0.06, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffcc00,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
    depthWrite: false
  });

  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.position.set(x, 0.02, z);
  ringMesh.rotation.x = -Math.PI / 2;
  scene.add(ringMesh);

  ripples.push({
    mesh: ringMesh,
    scale: 1.0,
    speed: 0.04,
    opacity: 0.6,
    decay: 0.03
  });
}

function showToast() {
  toastElement.textContent = `⚡ 独白が空間に堆積し、マップ上に記録されました！`;
  toastElement.classList.add('show');
  setTimeout(() => {
    toastElement.classList.remove('show');
  }, 3000);
}

// Standard Three.js rendering and physics loop
function animate() {
  requestAnimationFrame(animate);

  // 1. Update fluid stream particles (parabolic urine spray)
  for (let i = streamParticles.length - 1; i >= 0; i--) {
    const sp = streamParticles[i];
    
    if (sp.delay > 0) {
      sp.delay--;
      continue;
    }

    sp.mesh.visible = true;
    sp.t += sp.speed;

    if (sp.t >= 1.0) {
      trigger3DSplash(sp.endX, sp.endZ);

      scene.remove(sp.mesh);
      sp.mesh.geometry.dispose();
      sp.mesh.material.dispose();
      streamParticles.splice(i, 1);
    } else {
      const t = sp.t;
      const x = sp.startX + (sp.endX - sp.startX) * t;
      const z = sp.startZ + (sp.endZ - sp.startZ) * t;
      // Parabolic arc formula
      const y = sp.startY * (1 - t) + sp.endY * t + sp.hMax * 4 * t * (1 - t);

      sp.mesh.position.set(x, y, z);
      
      // Sputtering, irregular biological flow scaling (thick in center, messy)
      const fluidFactor = 4.0 * t * (1.0 - t);
      const scaleVal = 0.65 + (fluidFactor * 0.7) + (Math.sin(t * 30) * 0.15); // turbulent sputter!
      sp.mesh.scale.set(scaleVal, scaleVal, scaleVal);
    }
  }

  // 2. Update particle splashes
  for (let i = splashes.length - 1; i >= 0; i--) {
    const sp = splashes[i];
    sp.mesh.position.x += sp.vx;
    sp.mesh.position.y += sp.vy;
    sp.mesh.position.z += sp.vz;

    sp.vy -= 0.004;

    sp.life -= sp.decay;
    sp.mesh.material.opacity = sp.life;

    if (sp.life <= 0 || sp.mesh.position.y < 0) {
      scene.remove(sp.mesh);
      sp.mesh.geometry.dispose();
      sp.mesh.material.dispose();
      splashes.splice(i, 1);
    }
  }

  // 3. Update expanding ripples
  for (let i = ripples.length - 1; i >= 0; i--) {
    const rp = ripples[i];
    rp.scale += rp.speed;
    rp.opacity -= rp.decay;
    
    rp.mesh.scale.set(rp.scale, rp.scale, 1.0);
    rp.mesh.material.opacity = rp.opacity;

    if (rp.opacity <= 0) {
      scene.remove(rp.mesh);
      rp.mesh.geometry.dispose();
      rp.mesh.material.dispose();
      ripples.splice(i, 1);
    }
  }

  // 4. Update rising warm steam vapor particles
  for (let i = steamParticles.length - 1; i >= 0; i--) {
    const st = steamParticles[i];
    st.mesh.position.y += st.vy;
    st.mesh.position.x += st.vx;
    
    st.scale += 0.015; // steam disperses and expands
    st.opacity -= st.decay;
    
    st.mesh.scale.set(st.scale, st.scale, st.scale);
    st.mesh.material.opacity = st.opacity;

    if (st.opacity <= 0) {
      scene.remove(st.mesh);
      st.mesh.geometry.dispose();
      st.mesh.material.dispose();
      steamParticles.splice(i, 1);
    }
  }

  // 5. Update growing, glossy puddles pooling on floor
  for (let i = activePuddles.length - 1; i >= 0; i--) {
    const pd = activePuddles[i];
    
    // Grow puddle scale slowly until maxScale is reached
    if (pd.scale < pd.maxScale) {
      pd.scale += pd.growthSpeed;
      pd.mesh.scale.set(pd.scale, pd.scale, 1.0);
    }

    // Slowly decay life (fade out grimy urine pool over 10s)
    pd.life -= pd.decay;
    pd.mesh.material.opacity = pd.life * 0.65; // keep cap transparent

    if (pd.life <= 0) {
      scene.remove(pd.mesh);
      pd.mesh.geometry.dispose();
      pd.mesh.material.dispose();
      activePuddles.splice(i, 1);
    }
  }

  renderer.render(scene, camera);
}
