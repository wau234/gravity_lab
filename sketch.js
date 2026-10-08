// Gravity Lab - N-body gravity simulator for p5.js
// Converted from Processing (Java mode).
// Right-drag: orbit camera / wheel: zoom / sliders: controls.

let bodies = [];
let stars = [];

let gravity = 0.16;
let timeScale = 1.0;
let softening = 18.0;
let planetMass = 5000;
let planetRadius = 15;
let particleMassScale = 0.0;
let particleSpeed = 2.0;
let particleRadius = 1.0;
let restitution = 1.0;
let gridSpacing = 8;
let gridSide = 10;

const PLANET_MASS_CONTROL = 0;
const PARTICLE_SIZE_CONTROL = 1;
const GRID_SPACING_CONTROL = 2;
const GRID_COUNT_CONTROL = 3;
const PARTICLE_MASS_CONTROL = 4;
const PARTICLE_SPEED_CONTROL = 5;
const RESTITUTION_CONTROL = 6;

const massSliderLeft = 40;
const massSliderRight = 258;
const planetMassSliderY = 145;
const particleSizeSliderY = 189;
const gridSpacingSliderY = 233;
const gridCountSliderY = 277;
const massSliderY = 321;
const speedSliderY = 365;
const restitutionSliderY = 409;

let paused = false;
let showHelp = true;
let particleGravityEnabled = false;
let activeSlider = -1;
let gridRebuildPending = false;
let cameraYaw = 0.55;
let cameraPitch = 0.45;
let cameraDistance = 1300;
let cameraZoom = 1.0;
let rotatingCamera = false;

const palette = [
  '#62D8FF', '#F5B95F', '#F275A6',
  '#9DE17C', '#B49AFF', '#FF836B'
];

function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  pixelDensity(1);
  smooth();
  makeStars();
  resetSystem();
  setupControls();
  updateDOM();
}

function draw() {
  background(5, 9, 18);
  drawStars();
  updateCamera();

  if (!paused) {
    for (let step = 0; step < 2; step++) {
      updateGravity(timeScale * 0.5);
    }
  }

  drawGridGuide();
  drawBodies();
  updateDOM();
}

function updateCamera() {
  const cubeReach = gridSide * gridSpacing;
  cameraDistance = max(900, cubeReach * 2.0 + 450) * cameraZoom;

  const horizontalDistance = cameraDistance * cos(cameraPitch);
  const eyeX = sin(cameraYaw) * horizontalDistance;
  const eyeY = -sin(cameraPitch) * cameraDistance;
  const eyeZ = cos(cameraYaw) * horizontalDistance;

  perspective(PI / 3.0, width / height, 1, cameraDistance * 8);
  camera(eyeX, eyeY, eyeZ, 0, 0, 0, 0, 1, 0);
}

function updateGravity(dt) {
  const count = bodies.length;

  for (const body of bodies) body.acceleration.set(0, 0, 0);

  // Planet -> particle gravity.
  for (const source of bodies) {
    if (!source.isPlanet) continue;
    for (const particle of bodies) {
      if (particle.isPlanet) continue;

      const dx = source.position.x - particle.position.x;
      const dy = source.position.y - particle.position.y;
      const dz = source.position.z - particle.position.z;
      const distanceSq = dx * dx + dy * dy + dz * dz + softening * softening;
      const inverseDistance = 1.0 / sqrt(distanceSq);
      const forceScale = gravity * source.mass * inverseDistance * inverseDistance * inverseDistance;

      particle.acceleration.x += dx * forceScale;
      particle.acceleration.y += dy * forceScale;
      particle.acceleration.z += dz * forceScale;
    }
  }

  // Particle-particle gravity, calculated once per pair.
  if (particleGravityEnabled && particleMassScale > 0) {
    for (let i = 0; i < count; i++) {
      const a = bodies[i];
      if (a.isPlanet) continue;

      for (let j = i + 1; j < count; j++) {
        const b = bodies[j];
        if (b.isPlanet) continue;

        const dx = b.position.x - a.position.x;
        const dy = b.position.y - a.position.y;
        const dz = b.position.z - a.position.z;
        const distanceSq = dx * dx + dy * dy + dz * dz + softening * softening;
        const inverseDistance = 1.0 / sqrt(distanceSq);
        const forceScale = gravity * inverseDistance * inverseDistance * inverseDistance;

        a.acceleration.x += dx * forceScale * b.mass;
        a.acceleration.y += dy * forceScale * b.mass;
        a.acceleration.z += dz * forceScale * b.mass;
        b.acceleration.x -= dx * forceScale * a.mass;
        b.acceleration.y -= dy * forceScale * a.mass;
        b.acceleration.z -= dz * forceScale * a.mass;
      }
    }
  }

  for (const body of bodies) {
    if (body.isPlanet) continue;
    body.velocity.add(p5.Vector.mult(body.acceleration, dt));
    body.position.add(p5.Vector.mult(body.velocity, dt));
  }

  resolveCollisions();
}

function resolveCollisions() {
  if (bodies.length < 2) return;

  let planet = null;
  for (const body of bodies) {
    if (body.isPlanet) {
      planet = body;
      break;
    }
  }

  if (planet) {
    const collisionRadius = planet.radius + particleRadius;
    const collisionRadiusSq = collisionRadius * collisionRadius;

    for (let i = bodies.length - 1; i >= 0; i--) {
      const particle = bodies[i];
      if (particle.isPlanet) continue;
      const dx = particle.position.x - planet.position.x;
      const dy = particle.position.y - planet.position.y;
      const dz = particle.position.z - planet.position.z;
      if (dx * dx + dy * dy + dz * dz < collisionRadiusSq) {
        bodies.splice(i, 1);
      }
    }
  }

  if (bodies.length < 2) return;

  let largestRadius = 0;
  for (const body of bodies) largestRadius = max(largestRadius, body.radius);
  const cellSize = max(2 * largestRadius, 1);
  const cells = new Map();

  for (let i = 0; i < bodies.length; i++) {
    const body = bodies[i];
    if (body.isPlanet) continue;
    const key = cellKeyFor(body.position, cellSize);
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(i);
  }

  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i];
    if (a.isPlanet) continue;

    const cellX = floor(a.position.x / cellSize);
    const cellY = floor(a.position.y / cellSize);
    const cellZ = floor(a.position.z / cellSize);

    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        for (let oz = -1; oz <= 1; oz++) {
          const key = `${cellX + ox},${cellY + oy},${cellZ + oz}`;
          const bucket = cells.get(key);
          if (!bucket) continue;
          for (const j of bucket) {
            if (j > i) resolveCollision(a, bodies[j]);
          }
        }
      }
    }
  }
}

function cellKeyFor(position, cellSize) {
  return `${floor(position.x / cellSize)},${floor(position.y / cellSize)},${floor(position.z / cellSize)}`;
}

function resolveCollision(a, b) {
  if (a.mass <= 0 && b.mass <= 0) return;

  const dx = b.position.x - a.position.x;
  const dy = b.position.y - a.position.y;
  const dz = b.position.z - a.position.z;
  const minimumDistance = a.radius + b.radius;
  const distanceSq = dx * dx + dy * dy + dz * dz;
  if (distanceSq >= minimumDistance * minimumDistance) return;

  const distance = sqrt(distanceSq);
  const normal = distance > 0.0001
    ? createVector(dx / distance, dy / distance, dz / distance)
    : createVector(1, 0, 0);

  const penetration = minimumDistance - distance;
  const relativeVelocity = p5.Vector.sub(b.velocity, a.velocity);
  const normalVelocity = relativeVelocity.dot(normal);

  if (a.mass <= 0) {
    a.position.sub(p5.Vector.mult(normal, penetration));
    if (normalVelocity < 0) {
      a.velocity.add(p5.Vector.mult(normal, (1 + restitution) * normalVelocity));
    }
    return;
  }

  if (b.mass <= 0) {
    b.position.add(p5.Vector.mult(normal, penetration));
    if (normalVelocity < 0) {
      b.velocity.sub(p5.Vector.mult(normal, (1 + restitution) * normalVelocity));
    }
    return;
  }

  const inverseMassA = 1.0 / a.mass;
  const inverseMassB = 1.0 / b.mass;
  const inverseMassSum = inverseMassA + inverseMassB;
  const correction = penetration / inverseMassSum;

  a.position.sub(p5.Vector.mult(normal, correction * inverseMassA));
  b.position.add(p5.Vector.mult(normal, correction * inverseMassB));

  if (normalVelocity >= 0) return;

  const impulseMagnitude = -(1 + restitution) * normalVelocity / inverseMassSum;
  const impulse = p5.Vector.mult(normal, impulseMagnitude);
  a.velocity.sub(p5.Vector.mult(impulse, inverseMassA));
  b.velocity.add(p5.Vector.mult(impulse, inverseMassB));
}

function drawGridGuide() {
  // Particle grid guide: a subtle wireframe box around the particle region.
  const extent = (gridSide - 1) * gridSpacing;
  const half = extent * 0.5;
  const planet = bodies.find(body => body.isPlanet);
  if (!planet || gridSide < 2) return;

  const cx = planet.position.x + planet.radius + 95 + half;
  const cy = planet.position.y;
  const cz = planet.position.z;

  push();
  translate(cx, cy, cz);
  noFill();
  stroke(80, 120, 160, 45);
  strokeWeight(1);
  box(extent, extent, extent);
  pop();
}

function drawBodies() {
  let planet = null;
  let hasParticles = false;

  for (const body of bodies) {
    if (body.isPlanet) planet = body;
    else hasParticles = true;
  }

  if (hasParticles) {
    strokeWeight(constrain(particleRadius * 2, 2, 12));
    beginShape(POINTS);
    for (const body of bodies) {
      if (body.isPlanet) continue;
      stroke(body.tint);
      vertex(body.position.x, body.position.y, body.position.z);
    }
    endShape();
  }

  noStroke();
  if (planet) {
    push();
    translate(planet.position.x, planet.position.y, planet.position.z);
    fill(planet.tint);
    sphere(planet.radius);
    pop();
  }
}

function makeStars() {
  randomSeed(14);
  stars = [];
  for (let i = 0; i < 230; i++) {
    const brightness = random(35, 135);
    stars.push({
      x: random(-width / 2, width / 2),
      y: random(-height / 2, height / 2),
      brightness,
      diameter: random(0.7, 2.0)
    });
  }
}

function drawStars() {
  push();
  resetMatrix();
  translate(-width / 2, -height / 2);
  noStroke();
  for (const s of stars) {
    fill(150 + s.brightness * 0.55,
         175 + s.brightness * 0.45,
         210 + s.brightness * 0.3,
         s.brightness);
    ellipse(s.x + width / 2, s.y + height / 2, s.diameter, s.diameter);
  }
  pop();
}

function resetSystem() {
  bodies = [];
  addBody(0, 0, 0, 0, 0, 0, planetMass, planetRadius, '#FFE3A1', true, false);
  rebuildGridParticles();
}

function rebuildGridParticles() {
  for (let i = bodies.length - 1; i >= 0; i--) {
    if (bodies[i].isGridParticle) bodies.splice(i, 1);
  }

  const planet = bodies.find(body => body.isPlanet);
  if (!planet) return;

  const halfExtent = (gridSide - 1) * gridSpacing * 0.5;
  const firstX = planet.position.x + planet.radius + 95;
  const firstY = planet.position.y - halfExtent;
  const firstZ = planet.position.z - halfExtent;

  for (let layer = 0; layer < gridSide; layer++) {
    for (let row = 0; row < gridSide; row++) {
      for (let column = 0; column < gridSide; column++) {
        const x = firstX + column * gridSpacing;
        const y = firstY + row * gridSpacing;
        const z = firstZ + layer * gridSpacing;
        const index = layer * gridSide * gridSide + row * gridSide + column;
        addBody(x, y, z, 0, 0, -particleSpeed,
          random(3, 8), particleRadius,
          palette[index % palette.length], false, true);
      }
    }
  }
}

function addBody(x, y, z, vx, vy, vz, mass, radius, tint, isPlanet = false, isGridParticle = false) {
  bodies.push(new Body(x, y, z, vx, vy, vz, mass, radius, tint, isPlanet, isGridParticle));
}

function mousePressed(event) {
  if (event && event.target && event.target.closest && event.target.closest('#ui')) return true;
  if (mouseButton === RIGHT) {
    rotatingCamera = true;
    return false;
  }
  return false;
}

function mouseDragged(event) {
  if (event && event.target && event.target.closest && event.target.closest('#ui')) return true;
  if (rotatingCamera) {
    cameraYaw -= (mouseX - pmouseX) * 0.008;
    cameraPitch = constrain(cameraPitch + (mouseY - pmouseY) * 0.008, -1.25, 1.25);
  }
  return false;
}

function mouseReleased(event) {
  if (event && event.target && event.target.closest && event.target.closest('#ui')) return true;
  rotatingCamera = false;
  return false;
}

function mouseWheel(event) {
  cameraZoom = constrain(cameraZoom * (1 + event.delta * 0.0015), 0.35, 3.0);
  return false;
}

function setupControls() {
  // Keep DOM controls completely independent from p5 canvas mouse handling.
  document.querySelectorAll('#ui input').forEach(el => {
    ['pointerdown', 'pointermove', 'pointerup', 'mousedown', 'mouseup', 'click'].forEach(type => {
      el.addEventListener(type, e => e.stopPropagation());
    });
  });
  const bind = (id, fn) => document.getElementById(id).addEventListener('input', fn);
  const pair = document.getElementById('pairGravity');
  pair.addEventListener('change', () => particleGravityEnabled = pair.checked);

  bind('planetMass', e => {
    planetMass = +e.target.value;
    for (const body of bodies) if (body.isPlanet) body.mass = planetMass;
  });
  bind('particleSize', e => {
    particleRadius = +e.target.value;
    for (const body of bodies) if (!body.isPlanet) body.radius = particleRadius;
  });
  bind('gridSpacing', e => {
    gridSpacing = +e.target.value;
    rebuildGridParticles();
  });
  bind('gridCount', e => {
    gridSide = +e.target.value;
    rebuildGridParticles();
  });
  bind('particleMass', e => {
    const pos = +e.target.value;
    particleMassScale = pos <= 0 ? 0 : pow(10, map(pos, 0, 1, -3, 0));
    for (const body of bodies) if (!body.isPlanet) body.mass = body.baseMass * particleMassScale;
  });
  bind('particleSpeed', e => {
    particleSpeed = +e.target.value;
    for (const body of bodies) {
      if (body.isPlanet) continue;
      if (body.velocity.magSq() < 0.0001) body.velocity.set(0, 0, -1);
      body.velocity.setMag(particleSpeed);
    }
  });
  bind('restitution', e => restitution = +e.target.value);
}

function updateDOM() {
  const set = (id, value) => document.getElementById(id).textContent = value;
  set('modeText', `N-BODY SIMULATION / ${paused ? 'PAUSED' : 'LIVE'}`);
  set('bodyCount', `Bodies ${bodies.length}`);
  set('gravityText', `Gravity ${nf(gravity,1,2)}`);
  set('timeText', `Time ${nf(timeScale,1,1)}x`);
  set('planetMassValue', nf(planetMass,1,0));
  set('particleSizeValue', `${nf(particleRadius,1,1)} px`);
  set('gridSpacingValue', `${nf(gridSpacing,1,1)} px`);
  set('gridCountValue', `${gridSide*gridSide*gridSide} (${gridSide}^3)`);
  set('particleMassValue', particleMassScale === 0 ? '0x' : `${nf(particleMassScale,1,3)}x`);
  set('particleSpeedValue', nf(particleSpeed,1,1));
  set('restitutionValue', nf(restitution,1,2));

  // Do not write slider values every frame. Doing so fights the browser's
  // native range input while the user is dragging it. Values are updated by
  // the input/change handlers instead.
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  makeStars();
}

function keyPressed() {
  if (key === ' ') paused = !paused;
  if (key === 'r' || key === 'R') resetSystem();
  if (key === '+' || key === '=') gravity = min(0.8, gravity * 1.2);
  if (key === '-' || key === '_') gravity = max(0.01, gravity / 1.2);
  if (key === ']') timeScale = min(3.0, timeScale + 0.1);
  if (key === '[') timeScale = max(0.1, timeScale - 0.1);
  if (key === 'h' || key === 'H') { showHelp = !showHelp; document.querySelector('#ui .help').style.display = showHelp ? '' : 'none'; }
  if (key === 'x' || key === 'X') bodies = [];
}

class Body {
  constructor(x, y, z, vx, vy, vz, bodyMass, bodyRadius, bodyTint, planet, gridParticle) {
    this.position = createVector(x, y, z);
    this.velocity = createVector(vx, vy, vz);
    this.acceleration = createVector(0, 0, 0);
    this.baseMass = bodyMass;
    this.mass = planet ? bodyMass : bodyMass * particleMassScale;
    this.radius = bodyRadius;
    this.tint = bodyTint;
    this.isPlanet = planet;
    this.isGridParticle = gridParticle;
  }
}
