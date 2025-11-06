const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const video = document.getElementById('video');
const toggle = document.getElementById('toggle');
const handlesContainer = document.getElementById('handles');
const slicer = document.getElementById('slicer');

let mode = 'mesh';
let rotationY = 0, rotationX = 0;
let isDragging = false;
let deforming = false;
let lastX = 0, lastY = 0;
let deformIndex = -1;
let videoReady = false;
let slices = 1;

// reaguj na změnu sliceru
slicer.addEventListener('input', () => {
  slices = parseInt(slicer.value);
});

// základní 3D body šestiúhelníku
const basePoints = [];
const numSides = 6;
const radius = 150;
for (let i = 0; i < numSides; i++) {
  const angle = (i / numSides) * Math.PI * 2;
  basePoints.push({
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
    z: Math.sin(angle) * 40
  });
}

// HTML nýty
const handleEls = [];
for (let i = 0; i < numSides; i++) {
  const el = document.createElement('div');
  el.className = 'handle';
  el.dataset.index = i;
  el.innerHTML = '<div class="pulse"></div><div class="ring"></div>';
  handlesContainer.appendChild(el);
  handleEls.push(el);

  // interaktivní deformace nýtů
  el.addEventListener('pointerdown', e => {
    e.preventDefault();
    deformIndex = parseInt(el.dataset.index);
    deforming = true;
    lastX = e.clientX;
    lastY = e.clientY;
    el.setPointerCapture(e.pointerId);
  });

  el.addEventListener('pointerup', e => {
    deforming = false;
    deformIndex = -1;
    el.releasePointerCapture(e.pointerId);
  });

  el.addEventListener('pointermove', e => {
    if (!deforming || deformIndex !== parseInt(el.dataset.index)) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    basePoints[deformIndex].x += dx * 0.5;
    basePoints[deformIndex].y += dy * 0.5;
    basePoints[deformIndex].z += Math.sin(dx * 0.05) * 20;
    lastX = e.clientX;
    lastY = e.clientY;
  });
}

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// 3D projekce
function project(p) {
  const cosY = Math.cos(rotationY);
  const sinY = Math.sin(rotationY);
  const cosX = Math.cos(rotationX);
  const sinX = Math.sin(rotationX);
  let x = p.x * cosY - p.z * sinY;
  let z = p.x * sinY + p.z * cosY;
  let y = p.y * cosX - z * sinX;
  z = p.y * sinX + z * cosX;
  const scale = 1 / (1 + z / 300);
  return {
    x: canvas.width / 2 + x * scale,
    y: canvas.height / 2 + y * scale
  };
}

// vykreslení bez kamery
function drawMesh() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let s = 0; s < slices; s++) {
    const depthOffset = (s - (slices - 1) / 2) * 40;
    const pts = basePoints.map(p => project({ ...p, z: p.z + depthOffset }));
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.strokeStyle = `rgba(255,255,255,${0.3 + 0.5 * (s / slices)})`;
    ctx.lineWidth = 2;
    ctx.fillStyle = `rgba(255,255,255,${0.03 + 0.02 * (s / slices)})`;
    ctx.fill();
    ctx.stroke();
  }
  updateHandles();
}

// vykreslení s kamerou
function drawCameraMesh() {
  if (!videoReady) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let s = 0; s < slices; s++) {
    const depthOffset = (s - (slices - 1) / 2) * 40;
    const pts = basePoints.map(p => project({ ...p, z: p.z + depthOffset }));
    const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;

    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % pts.length];
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.closePath();
      ctx.clip();

      const scaleX = 1 + (basePoints[i].x - basePoints[(i + 1) % numSides].x) / 800;
      const scaleY = 1 + (basePoints[i].y - basePoints[(i + 1) % numSides].y) / 800;
      ctx.scale(scaleX, scaleY);
      ctx.drawImage(video, 0, 0, canvas.width / scaleX, canvas.height / scaleY);
      ctx.restore();
    }
  }
  updateHandles();
}

function updateHandles() {
  const pts = basePoints.map(project);
  for (let i = 0; i < handleEls.length; i++) {
    handleEls[i].style.transform = `translate(${pts[i].x}px, ${pts[i].y}px)`;
  }
}

// ovládání kamery
toggle.onclick = async () => {
  if (mode === 'mesh') {
    mode = 'camera';
    toggle.classList.replace('mode-mesh', 'mode-camera');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      video.srcObject = stream;
      await video.play();
      videoReady = true;
    } catch (err) {
      alert("Kamera nedostupná: " + err.message);
      mode = 'mesh';
      toggle.classList.replace('mode-camera', 'mode-mesh');
    }
  } else {
    mode = 'mesh';
    toggle.classList.replace('mode-camera', 'mode-mesh');
    if (video.srcObject) {
      video.srcObject.getTracks().forEach(t => t.stop());
      video.srcObject = null;
    }
    videoReady = false;
  }
};

// rotace pomocí drag
canvas.addEventListener('pointerdown', e => {
  lastX = e.clientX;
  lastY = e.clientY;
  isDragging = true;
});
canvas.addEventListener('pointermove', e => {
  if (isDragging && !deforming) {
    rotationY += (e.clientX - lastX) * 0.01;
    rotationX += (e.clientY - lastY) * 0.01;
  }
  lastX = e.clientX;
  lastY = e.clientY;
});
canvas.addEventListener('pointerup', () => { isDragging = false; deforming = false; });

function loop() {
  if (mode === 'mesh') drawMesh();
  else drawCameraMesh();
  requestAnimationFrame(loop);
}
loop();
