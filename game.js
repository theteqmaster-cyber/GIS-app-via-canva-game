const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Highway settings
const HIGHWAY_WIDTH = 60;
const HIGHWAY_Y = canvas.height / 2;
const HIGHWAY_COLOR = "#d7d7d7";
const HIGHWAY_LINE_COLOR = "#fff";
const HIGHWAY_LINE_WIDTH = 5;
const HIGHWAY_LINE_LENGTH = 40;
const HIGHWAY_LINE_GAP = 30;

// Player settings (car is always centered on highway)
const player = {
  x: canvas.width / 2,
  y: HIGHWAY_Y,
  size: 36,
  speed: 5,
  dx: 0,
  dy: 0,
  canMove: true,
  blockTimer: 0
};

const world = {
  offsetX: 0,
  offsetY: 0
};

const obstacleTypes = [
  {type: "tree", color: "#2b4b1c", width: 50, height: 70},
  {type: "rock", color: "#a8a39d", width: 40, height: 30}
];

const obstacles = [];
const OBSTACLE_DISTANCE = 120;

const GRASS_PATCH_RADIUS = 1000;
const GRASS_PATCH_DENSITY = 40;
let grassPatches = [];

// Roadblock settings
const ROADBLOCK_WIDTH = 42;
const ROADBLOCK_HEIGHT = 32;
const ROADBLOCK_COLOR = "#e74c3c";
// Increased frequency value so roadblocks are farther apart:
const ROADBLOCK_FREQ = 1200; // was 520, now farther apart
const ROADBLOCK_WAIT = 4000; // ms

let roadblocks = [];
let lastRoadblockX = 0;

let lastObstacleSpawn = { x: 0, y: 0 };
const OBSTACLE_SPAWN_DISTANCE = 400;

// Tree unique id
let nextTreeId = 1;

// For numbers on trees
const TREE_LABEL_RADIUS = 250;

// Utility
function randomInt(a, b) {
  return Math.floor(Math.random() * (b - a) + a);
}

// Generate grass patches (background)
function generateGrassPatches(centerX, centerY) {
  grassPatches = [];
  for (let i = 0; i < GRASS_PATCH_DENSITY; i++) {
    let gx = centerX + randomInt(-GRASS_PATCH_RADIUS, GRASS_PATCH_RADIUS);
    let gy = centerY + randomInt(-GRASS_PATCH_RADIUS, GRASS_PATCH_RADIUS);
    let size = randomInt(40, 100);
    let color = "#4e7a3a";
    grassPatches.push({x: gx, y: gy, size, color});
  }
}

// Generate obstacles AROUND the highway
function generateObstaclesAroundHighway(centerX) {
  const NUM_OBSTACLES = 18;
  const SPAWN_X_MIN = centerX - canvas.width;
  const SPAWN_X_MAX = centerX + canvas.width;

  for (let i = 0; i < NUM_OBSTACLES; i++) {
    let ox = randomInt(SPAWN_X_MIN, SPAWN_X_MAX);
    // Always spawn outside the highway area (above or below)
    let isAbove = Math.random() < 0.5;
    let minDist = HIGHWAY_WIDTH / 2 + 30;
    let maxDist = HIGHWAY_WIDTH / 2 + 200 + randomInt(0, 180);
    let distFromHighway = randomInt(minDist, maxDist);
    let oy = HIGHWAY_Y + (isAbove ? -distFromHighway : distFromHighway);

    // More trees further from highway, more rocks closer
    let typePool = distFromHighway > HIGHWAY_WIDTH ? ["tree", "tree", "rock"] : ["rock", "tree"];
    let typeStr = typePool[randomInt(0, typePool.length)];
    let type = obstacleTypes.find(o => o.type === typeStr);

    // Prevent obstacles overlapping
    let overlap = obstacles.some(
      ob =>
        Math.abs(ob.x - ox) < OBSTACLE_DISTANCE &&
        Math.abs(ob.y - oy) < OBSTACLE_DISTANCE
    );
    if (overlap) continue;

    let treeId = null;
    if (type.type === "tree") treeId = nextTreeId++;

    obstacles.push({
      x: ox,
      y: oy,
      width: type.width,
      height: type.height,
      color: type.color,
      type: type.type,
      treeId: treeId
    });
  }
}

// Generate roadblocks ahead on the highway
function generateRoadblocks(centerX) {
  // Place blocks at intervals in the visible area
  let startX = Math.floor((centerX - canvas.width) / ROADBLOCK_FREQ) * ROADBLOCK_FREQ;
  let endX = Math.floor((centerX + canvas.width) / ROADBLOCK_FREQ) * ROADBLOCK_FREQ;
  for (let x = startX; x <= endX; x += ROADBLOCK_FREQ) {
    if (roadblocks.some(rb => Math.abs(rb.x - x) < ROADBLOCK_FREQ / 2)) continue;
    roadblocks.push({
      x: x,
      y: HIGHWAY_Y,
      width: ROADBLOCK_WIDTH,
      height: ROADBLOCK_HEIGHT,
      blockedOnce: false, // NEW!
      active: true,       // active means will block, inactive means passed
      timer: 0
    });
  }
}

// Draw ground
function drawGround() {
  ctx.save();
  ctx.fillStyle = "#415d2d";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let patch of grassPatches) {
    let gx = patch.x - world.offsetX + canvas.width / 2;
    let gy = patch.y - world.offsetY + canvas.height / 2;
    if (
      gx + patch.size < 0 ||
      gx - patch.size > canvas.width ||
      gy + patch.size < 0 ||
      gy - patch.size > canvas.height
    )
      continue;
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    ctx.arc(gx, gy, patch.size, 0, 2 * Math.PI);
    ctx.fillStyle = patch.color;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  ctx.restore();
}

// Draw highway (guaranteed visible, centered vertically)
function drawHighway() {
  ctx.save();
  let roadY = HIGHWAY_Y - HIGHWAY_WIDTH / 2;
  ctx.fillStyle = HIGHWAY_COLOR;
  ctx.fillRect(
    0,
    roadY,
    canvas.width,
    HIGHWAY_WIDTH
  );
  // Dashed center line
  let lineY = HIGHWAY_Y;
  let screenLeftWorldX = world.offsetX - canvas.width / 2;
  let lineStartX = -((screenLeftWorldX) % (HIGHWAY_LINE_LENGTH + HIGHWAY_LINE_GAP));
  for (
    let lx = lineStartX;
    lx < canvas.width;
    lx += HIGHWAY_LINE_LENGTH + HIGHWAY_LINE_GAP
  ) {
    ctx.fillStyle = HIGHWAY_LINE_COLOR;
    ctx.fillRect(
      lx,
      lineY - HIGHWAY_LINE_WIDTH / 2,
      HIGHWAY_LINE_LENGTH,
      HIGHWAY_LINE_WIDTH
    );
  }
  ctx.restore();
}

// Draw roadblocks
function drawRoadblocks() {
  for (let rb of roadblocks) {
    let cx = rb.x - world.offsetX + canvas.width / 2;
    let cy = rb.y;
    if (
      cx + rb.width / 2 < 0 ||
      cx - rb.width / 2 > canvas.width
    ) continue;

    ctx.save();
    ctx.globalAlpha = rb.active ? 1 : 0.35;
    ctx.fillStyle = ROADBLOCK_COLOR;
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - rb.width / 2, cy - rb.height / 2);
    ctx.lineTo(cx + rb.width / 2, cy - rb.height / 2);
    ctx.lineTo(cx + rb.width / 2, cy + rb.height / 2);
    ctx.lineTo(cx - rb.width / 2, cy + rb.height / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Draw warning sign
    ctx.globalAlpha = rb.active ? 1 : 0.15;
    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("STOP", cx, cy);

    ctx.restore();
  }
}

// Draw obstacles and tree numbers in a rounded white box
function drawObstacles() {
  for (let ob of obstacles) {
    let cx = ob.x - world.offsetX + canvas.width / 2;
    let cy = ob.y;
    if (
      cx + ob.width / 2 < 0 ||
      cx - ob.width / 2 > canvas.width ||
      cy + ob.height / 2 < 0 ||
      cy - ob.height / 2 > canvas.height
    )
      continue;

    ctx.save();
    if (ob.type === "tree") {
      // Tree trunk
      ctx.fillStyle = "#614c2a";
      ctx.fillRect(
        cx - 7,
        cy + ob.height / 2 - 18,
        14,
        22
      );
      // Tree canopy
      ctx.beginPath();
      ctx.arc(cx, cy, ob.width / 2, 0, 2 * Math.PI);
      ctx.fillStyle = ob.color;
      ctx.fill();

      // Show tree number label if player is close (bigger radius)
      let distToPlayer = Math.hypot(cx - player.x, cy - player.y);
      if (ob.treeId && distToPlayer <= TREE_LABEL_RADIUS) {
        ctx.font = "bold 20px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        let label = ob.treeId.toString();
        let boxWidth = ctx.measureText(label).width + 20;
        let boxHeight = 32;
        let labelY = cy - ob.width / 2 - boxHeight / 2 - 6;
        let labelX = cx - boxWidth / 2;
        ctx.save();
        ctx.beginPath();
        let radius = 12;
        ctx.moveTo(labelX + radius, labelY);
        ctx.lineTo(labelX + boxWidth - radius, labelY);
        ctx.quadraticCurveTo(labelX + boxWidth, labelY, labelX + boxWidth, labelY + radius);
        ctx.lineTo(labelX + boxWidth, labelY + boxHeight - radius);
        ctx.quadraticCurveTo(labelX + boxWidth, labelY + boxHeight, labelX + boxWidth - radius, labelY + boxHeight);
        ctx.lineTo(labelX + radius, labelY + boxHeight);
        ctx.quadraticCurveTo(labelX, labelY + boxHeight, labelX, labelY + boxHeight - radius);
        ctx.lineTo(labelX, labelY + radius);
        ctx.quadraticCurveTo(labelX, labelY, labelX + radius, labelY);
        ctx.closePath();
        ctx.fillStyle = "#fff";
        ctx.shadowColor = "rgba(0,0,0,0.2)";
        ctx.shadowBlur = 5;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "#233618";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = "#233618";
        ctx.fillText(label, cx, labelY + boxHeight / 2 + 1);
        ctx.restore();
      }

      ctx.globalAlpha = 0.1;
      ctx.beginPath();
      ctx.arc(cx, cy + 12, ob.width / 2 + 10, 0, 2 * Math.PI);
      ctx.fillStyle = "#222";
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (ob.type === "rock") {
      ctx.beginPath();
      ctx.ellipse(cx, cy, ob.width / 2, ob.height / 2, Math.PI / 8, 0, 2 * Math.PI);
      ctx.fillStyle = ob.color;
      ctx.fill();
      ctx.globalAlpha = 0.2;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 8, ob.width / 2 + 8, ob.height / 2 + 4, Math.PI / 8, 0, 2 * Math.PI);
      ctx.fillStyle = "#222";
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}

// Draw player as safari truck (centered on highway)
function drawPlayer() {
  ctx.save();
  let px = player.x;
  let py = player.y;
  let w = player.size;
  let h = player.size * 0.6;

  // Main body (safari beige)
  ctx.fillStyle = "#dfc98b";
  ctx.fillRect(px - w/2, py - h/2, w, h);

  // Cabin
  ctx.fillStyle = "#bca76a";
  ctx.fillRect(px - w/2 + 4, py - h/2 + 4, w * 0.55, h - 8);

  // Roof rack
  ctx.save();
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(px - w/2 + 6, py - h/2 - 7);
  ctx.lineTo(px + w/2 - 6, py - h/2 - 7);
  ctx.stroke();
  ctx.restore();

  // Spare tire (back right)
  ctx.save();
  ctx.beginPath();
  ctx.arc(px + w/2 + 4, py + h/2 - 5, 8, 0, 2 * Math.PI);
  ctx.fillStyle = "#232323";
  ctx.fill();
  ctx.restore();

  // Headlights
  ctx.beginPath();
  ctx.arc(px - w/2 + 7, py - h/2 + 5, 5, 0, 2 * Math.PI);
  ctx.arc(px - w/2 + 7, py + h/2 - 5, 5, 0, 2 * Math.PI);
  ctx.fillStyle = "#fff9c4";
  ctx.fill();

  // Bumper guard (front)
  ctx.save();
  ctx.strokeStyle = "#666";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(px - w/2 - 6, py - h/2 + 2);
  ctx.lineTo(px - w/2 - 6, py + h/2 - 2);
  ctx.stroke();
  ctx.restore();

  // Wheels
  let wheelRadius = 9;
  ctx.beginPath();
  ctx.arc(px - w/2 + 12, py - h/2 + h, wheelRadius, 0, 2 * Math.PI);
  ctx.arc(px + w/2 - 12, py - h/2 + h, wheelRadius, 0, 2 * Math.PI);
  ctx.arc(px - w/2 + 12, py - h/2, wheelRadius, 0, 2 * Math.PI);
  ctx.arc(px + w/2 - 12, py - h/2, wheelRadius, 0, 2 * Math.PI);
  ctx.fillStyle = "#232323";
  ctx.fill();

  // Windows
  ctx.save();
  ctx.globalAlpha = 0.65;
  ctx.fillStyle = "#aeeaf7";
  ctx.fillRect(px - w/2 + 8, py - h/2 + 8, w * 0.32, h - 16);
  ctx.restore();

  ctx.restore();
}

let grassPatchOrigin = {x: world.offsetX, y: world.offsetY};
generateGrassPatches(grassPatchOrigin.x, grassPatchOrigin.y);
generateObstaclesAroundHighway(world.offsetX);
generateRoadblocks(world.offsetX);
lastObstacleSpawn = { x: world.offsetX, y: world.offsetY };

function updateRoadblocks(dt) {
  for (let rb of roadblocks) {
    if (!rb.active && rb.timer > 0) {
      rb.timer -= dt;
      if (rb.timer <= 0) {
        rb.active = false; // stays inactive (passed)
        rb.timer = 0;
        rb.blockedOnce = true;
      }
    }
  }
}

function update() {
  let dt = 16; // ~60FPS

  // Only allow left/right movement if not blocked
  player.dy = 0;
  let nextX = world.offsetX + (player.canMove ? player.dx : 0);

  // Check for roadblock collision
  let blocked = false;
  let blockingRb = null;
  for (let rb of roadblocks) {
    let cx = rb.x - nextX + canvas.width / 2;
    // Only block if not already passed
    if (!rb.blockedOnce && rb.active &&
        Math.abs(cx - player.x) < ROADBLOCK_WIDTH / 2 + player.size / 2 &&
        Math.abs(HIGHWAY_Y - player.y) < ROADBLOCK_HEIGHT / 2 + player.size / 2) {
      blocked = true;
      blockingRb = rb;
      break;
    }
  }

  // Handle block logic
  if (blocked && player.canMove) {
    player.canMove = false;
    player.blockTimer = ROADBLOCK_WAIT;
    if (blockingRb) {
      blockingRb.active = false;
      blockingRb.timer = ROADBLOCK_WAIT;
    }
  }

  if (!player.canMove) {
    player.blockTimer -= dt;
    if (player.blockTimer <= 0) {
      player.canMove = true;
      player.blockTimer = 0;
      // Mark the current blocking roadblock as passed (blockedOnce)
      if (blockingRb) {
        blockingRb.blockedOnce = true;
      }
    }
  }

  // Collision logic (only for obstacles off highway)
  let collided = false;
  for (let ob of obstacles) {
    let ox = ob.x - nextX + canvas.width / 2;
    let oy = ob.y;
    let distFromHighway = Math.abs(ob.y - HIGHWAY_Y);
    if (
      distFromHighway > HIGHWAY_WIDTH / 2
    ) {
      if (
        player.x + player.size / 2 > ox - ob.width / 2 &&
        player.x - player.size / 2 < ox + ob.width / 2 &&
        player.y + player.size / 2 > oy - ob.height / 2 &&
        player.y - player.size / 2 < oy + ob.height / 2
      ) {
        collided = true;
        break;
      }
    }
  }
  if (!collided && player.canMove) {
    world.offsetX = nextX;

    // Regenerate grass patches if needed
    if (
      Math.abs(world.offsetX - grassPatchOrigin.x) > GRASS_PATCH_RADIUS / 2
    ) {
      grassPatchOrigin.x = world.offsetX;
      generateGrassPatches(grassPatchOrigin.x, grassPatchOrigin.y);
    }

    // Generate obstacles if moved far from last spawn location
    if (
      Math.abs(world.offsetX - lastObstacleSpawn.x) > OBSTACLE_SPAWN_DISTANCE
    ) {
      generateObstaclesAroundHighway(world.offsetX);
      lastObstacleSpawn.x = world.offsetX;
      lastObstacleSpawn.y = world.offsetY;
    }

    // Generate roadblocks ahead if needed
    generateRoadblocks(world.offsetX);
  }

  // Roadblock timers
  updateRoadblocks(dt);
}

function draw() {
  drawGround();
  drawHighway();
  drawObstacles();
  drawRoadblocks();
  drawPlayer();

  // If blocked, show waiting overlay
  if (!player.canMove) {
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#fff";
    ctx.font = "bold 32px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Road Block! Please Wait...", canvas.width / 2, canvas.height / 2 - 30);
    ctx.font = "bold 24px Arial";
    ctx.fillText(Math.ceil(player.blockTimer / 1000) + " seconds", canvas.width / 2, canvas.height / 2 + 10);
    ctx.restore();
  }
}

function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

// Input (left/right only)
const keys = {};
window.addEventListener("keydown", e => {
  keys[e.key] = true;
  setVelocity();
});
window.addEventListener("keyup", e => {
  keys[e.key] = false;
  setVelocity();
});

function setVelocity() {
  player.dx = 0;
  if (keys["ArrowLeft"] || keys["a"]) player.dx = -player.speed;
  if (keys["ArrowRight"] || keys["d"]) player.dx = player.speed;
}

requestAnimationFrame(gameLoop);
