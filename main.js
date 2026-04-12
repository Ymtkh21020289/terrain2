const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const TILE_SIZE = 40;
const WORLD_COLS = 150; 
const WORLD_ROWS = 100; 
const REACH = TILE_SIZE * 5;

const BLOCK_COLORS = {
    1: "#2ecc71", // 草
    2: "#8e44ad", // 土
    3: "#8D6E63", // 原木
    4: "#27ae60", // 葉
    5: "#f39c12", // 松明
    6: "#e67e22", // 木材
    7: "#3498db", // 水
    8: "#7f8c8d"  // 石
};

const BLOCK_HARDNESS = { 1: 15, 2: 20, 3: 45, 4: 5, 5: 5, 6: 30, 8: 60 };

const hotbar = [
    { id: 1, count: 0 }, { id: 2, count: 0 }, { id: 3, count: 0 },
    { id: 4, count: 0 }, { id: 5, count: 0 }, { id: 6, count: 0 },
    { id: 7, count: 50 }, { id: 0, count: 0 }, { id: 0, count: 0 }
];
let selectedSlot = 0;

let isMining = false;
let miningTarget = null;
let miningProgress = 0;

// Sキー（下降用）とデバッグモードのフラグを追加
const keys = { a: false, d: false, w: false, s: false };
let rawMouseX = 0, rawMouseY = 0;
let targetTile = null;
const camera = { x: 0, y: 0 };
let debugMode = false;

function addToInventory(id, amount) {
    for(let i = 0; i < 9; i++) {
        if(hotbar[i].id === id) {
            hotbar[i].count += amount;
            return;
        }
    }
    for(let i = 0; i < 9; i++) {
        if(hotbar[i].id === 0 || hotbar[i].count === 0) {
            hotbar[i].id = id;
            hotbar[i].count = amount;
            return;
        }
    }
}
function countItem(id) {
    let total = 0;
    for(let i = 0; i < 9; i++) if(hotbar[i].id === id) total += hotbar[i].count;
    return total;
}
function consumeItem(id, amount) {
    if(countItem(id) < amount) return false;
    let remaining = amount;
    for(let i = 0; i < 9; i++) {
        if(hotbar[i].id === id && hotbar[i].count > 0) {
            let take = Math.min(hotbar[i].count, remaining);
            hotbar[i].count -= take;
            remaining -= take;
            if(hotbar[i].count === 0) hotbar[i].id = 0;
            if(remaining <= 0) return true;
        }
    }
    return false;
}

window.addEventListener("keydown", (e) => {
    if (e.key === "T") {
        debugMode = !debugMode;
        e.preventDefault();
    }
    if (e.key === "a" || e.key === "A") keys.a = true;
    if (e.key === "d" || e.key === "D") keys.d = true;
    if (e.key === "w" || e.key === "W") keys.w = true;
    if (e.key === "s" || e.key === "S") keys.s = true;
    if (e.key >= "1" && e.key <= "9") selectedSlot = parseInt(e.key) - 1;
    if (e.key === "z" || e.key === "Z") { if (consumeItem(3, 1)) addToInventory(6, 4); }
    if (e.key === "x" || e.key === "X") { if (consumeItem(6, 1)) addToInventory(5, 2); }
});
window.addEventListener("keyup", (e) => {
    if (e.key === "a" || e.key === "A") keys.a = false;
    if (e.key === "d" || e.key === "D") keys.d = false;
    if (e.key === "w" || e.key === "W") keys.w = false;
    if (e.key === "s" || e.key === "S") keys.s = false;
});
canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    rawMouseX = e.clientX - rect.left;
    rawMouseY = e.clientY - rect.top;
});
canvas.addEventListener("contextmenu", e => e.preventDefault());
canvas.addEventListener("mousedown", (e) => {
    if (!targetTile) return;
    const r = targetTile.row;
    const c = targetTile.col;
    if (e.button === 0) { 
        if (targetTile.isBlock) {
            isMining = true;
            miningTarget = { col: c, row: r };
            miningProgress = 0;
        } else if (water[r][c] > 0.1) {
            water[r][c] = 0;
            addToInventory(7, 1);
        }
    } else if (e.button === 2 && !targetTile.isBlock) { 
        const slot = hotbar[selectedSlot];
        if (slot.id === 7 && slot.count > 0) {
            water[r][c] = Math.min(1.0, water[r][c] + 1.0);
            slot.count--;
            if(slot.count === 0) slot.id = 0;
        } else if (slot.id !== 0 && slot.count > 0 && !isCollidingWithPlayer(c, r)) {
            world[r][c] = slot.id;
            water[r][c] = 0; 
            slot.count--;
            if(slot.count === 0) slot.id = 0;
        }
    }
});
canvas.addEventListener("mouseup", (e) => {
    if (e.button === 0) { isMining = false; miningProgress = 0; miningTarget = null; }
});
canvas.addEventListener("mouseleave", () => { isMining = false; miningProgress = 0; miningTarget = null; });

const world = [];
const water = [];
const surfaceLevels = [];
const pondData = [];

for (let c = 0; c < WORLD_COLS; c++) {
    surfaceLevels[c] = 20 + Math.floor(Math.sin(c * 0.1) * 3) + Math.floor(Math.sin(c * 0.05) * 4);
}

for (let c = 10; c < WORLD_COLS - 15; c++) {
    if (Math.random() < 0.08) { 
        let pWidth = 5 + Math.floor(Math.random() * 6); 
        let pDepth = 3 + Math.floor(Math.random() * 3); 
        let startLevel = surfaceLevels[c]; 
        
        for (let i = 0; i < pWidth; i++) {
            let dip = Math.floor(Math.sin((i / (pWidth - 1)) * Math.PI) * pDepth);
            surfaceLevels[c + i] += dip; 
            pondData.push({ c: c + i, r: startLevel, dip: dip }); 
        }
        c += pWidth + 10; 
    }
}

for (let r = 0; r < WORLD_ROWS; r++) {
    let row = [];
    let wRow = [];
    for (let c = 0; c < WORLD_COLS; c++) {
        wRow.push(0);
        let sl = surfaceLevels[c];

        if (r < sl) row.push(0);
        else if (r === sl) row.push(1); 
        else if (r > sl && r < sl + 6) row.push(2); 
        else {
            row.push(Math.random() < 0.55 ? 8 : 0);
        }
    }
    world.push(row);
    water.push(wRow);
}

for(let pass = 0; pass < 4; pass++) {
    let newWorld = [];
    for (let r = 0; r < WORLD_ROWS; r++) {
        let newRow = [...world[r]];
        for (let c = 0; c < WORLD_COLS; c++) {
            if (r <= surfaceLevels[c] + 6) continue; 

            let walls = 0;
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    let nr = r + dr, nc = c + dc;
                    if (nr < 0 || nr >= WORLD_ROWS || nc < 0 || nc >= WORLD_COLS) walls++;
                    else if (world[nr][nc] === 8 || world[nr][nc] === 2) walls++;
                }
            }
            newRow[c] = (walls >= 5) ? 8 : 0;
        }
        newWorld.push(newRow);
    }
    for (let r = 0; r < WORLD_ROWS; r++) {
        for (let c = 0; c < WORLD_COLS; c++) {
            if (r > surfaceLevels[c] + 6) world[r][c] = newWorld[r][c];
        }
    }
}

for (let c = 0; c < WORLD_COLS; c++) {
    world[WORLD_ROWS - 1][c] = 8;
    world[WORLD_ROWS - 2][c] = 8;
}

for (let pd of pondData) {
    if (pd.dip > 0) {
        for(let r = pd.r; r < surfaceLevels[pd.c]; r++) {
            world[r][pd.c] = 0; 
            water[r][pd.c] = 1.0; 
        }
        world[surfaceLevels[pd.c]][pd.c] = 2; 
    }
}

for (let c = 5; c < WORLD_COLS - 5; c++) {
    let sl = surfaceLevels[c];
    if (Math.random() < 0.15 && world[sl][c] === 1 && water[sl - 1][c] === 0) {
        let treeHeight = Math.floor(Math.random() * 3) + 3;
        for (let i = 1; i <= treeHeight; i++) world[sl - i][c] = 3;
        for (let lr = sl - treeHeight - 2; lr <= sl - treeHeight; lr++) {
            for (let lc = c - 1; lc <= c + 1; lc++) {
                if (lr >= 0 && lc >= 0 && lc < WORLD_COLS && world[lr][lc] === 0) world[lr][lc] = 4;
            }
        }
        c += 2;
    }
}

const player = {
    x: (WORLD_COLS * TILE_SIZE) / 2, y: 0,
    width: 30, height: 40,
    vx: 0, vy: 0, speed: 5, jumpPower: -11, gravity: 0.6, grounded: false
};

function getTile(x, y) {
    const col = Math.floor(x / TILE_SIZE);
    const row = Math.floor(y / TILE_SIZE);
    if (row >= 0 && row < WORLD_ROWS && col >= 0 && col < WORLD_COLS) return world[row][col];
    return 0;
}
function isSolid(x, y) { return getTile(x, y) !== 0; }
function isCollidingWithPlayer(col, row) {
    const tx = col * TILE_SIZE;
    const ty = row * TILE_SIZE;
    return (player.x < tx + TILE_SIZE && player.x + player.width > tx && 
            player.y < ty + TILE_SIZE && player.y + player.height > ty);
}
function updateTargetTile() {
    targetTile = null;
    const absoluteMouseX = rawMouseX + camera.x;
    const absoluteMouseY = rawMouseY + camera.y;
    const px = player.x + player.width / 2;
    const py = player.y + player.height / 2;
    const dx = absoluteMouseX - px, dy = absoluteMouseY - py;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist > REACH) return; 

    const steps = dist / 2; 
    const stepX = dx / steps, stepY = dy / steps;
    let cx = px, cy = py;
    for (let i = 0; i <= steps; i++) {
        const col = Math.floor(cx / TILE_SIZE), row = Math.floor(cy / TILE_SIZE);
        if (row >= 0 && row < WORLD_ROWS && col >= 0 && col < WORLD_COLS) {
            if (world[row][col] !== 0) { targetTile = { col: col, row: row, isBlock: true }; return; }
        }
        cx += stepX; cy += stepY;
    }
    const mCol = Math.floor(absoluteMouseX / TILE_SIZE), mRow = Math.floor(absoluteMouseY / TILE_SIZE);
    if (mRow >= 0 && mRow < WORLD_ROWS && mCol >= 0 && mCol < WORLD_COLS) {
        targetTile = { col: mCol, row: mRow, isBlock: false };
    }
}

let frameCount = 0;
let scanDirection = 1;

function updateFluids() {
    scanDirection *= -1; 
    for (let r = WORLD_ROWS - 2; r >= 0; r--) {
        const start = scanDirection === 1 ? 0 : WORLD_COLS - 1;
        const end = scanDirection === 1 ? WORLD_COLS : -1;
        const step = scanDirection === 1 ? 1 : -1;

        for (let c = start; c !== end; c += step) {
            if (water[r][c] <= 0) continue;

            if (world[r + 1][c] === 0) {
                let freeSpace = 1.0 - water[r + 1][c];
                if (freeSpace > 0) {
                    let flow = Math.min(water[r][c], freeSpace);
                    water[r][c] -= flow;
                    water[r + 1][c] += flow;
                }
            }

            if (water[r][c] <= 0.005) continue;

            let c1 = c + step;
            let c2 = c - step;

            if (c1 >= 0 && c1 < WORLD_COLS && world[r][c1] === 0) {
                if (water[r][c] > water[r][c1]) {
                    let flow = (water[r][c] - water[r][c1]) / 2;
                    water[r][c] -= flow; water[r][c1] += flow;
                }
            }
            if (c2 >= 0 && c2 < WORLD_COLS && world[r][c2] === 0) {
                if (water[r][c] > water[r][c2]) {
                    let flow = (water[r][c] - water[r][c2]) / 2;
                    water[r][c] -= flow; water[r][c2] += flow;
                }
            }
        }
    }

    for (let r = 0; r < WORLD_ROWS; r++) {
        for (let c = 0; c < WORLD_COLS; c++) {
            if (water[r][c] > 0 && water[r][c] < 0.02) water[r][c] = 0;
        }
    }
}

function update() {
    frameCount++;
    if (frameCount % 10 === 0) updateFluids();

    let pCol = Math.floor((player.x + player.width/2) / TILE_SIZE);
    let pRow = Math.floor((player.y + player.height/2) / TILE_SIZE);
    let inWater = pRow >= 0 && pRow < WORLD_ROWS && pCol >= 0 && pCol < WORLD_COLS && water[pRow][pCol] > 0.3;
    
    // デバッグモード時は水による減速ペナルティを無効化
    let currentSpeed = (inWater && !debugMode) ? player.speed * 0.5 : player.speed;
    let currentGravity = (inWater && !debugMode) ? player.gravity * 0.5 : player.gravity;

    // X軸の移動
    if (keys.a) player.vx = -currentSpeed;
    else if (keys.d) player.vx = currentSpeed;
    else player.vx = 0;

    // Y軸の移動（デバッグモードと通常時で分岐）
    if (debugMode) {
        if (keys.w) player.vy = -currentSpeed;
        else if (keys.s) player.vy = currentSpeed;
        else player.vy = 0;
    } else {
        if (keys.w) {
            if (player.grounded) { player.vy = player.jumpPower; player.grounded = false; }
            else if (inWater) { player.vy = player.jumpPower * 0.4; }
        }
        player.vy += currentGravity;
    }
    
    player.x += player.vx;
    if (player.vx > 0) {
        if (isSolid(player.x + player.width, player.y) || isSolid(player.x + player.width, player.y + player.height - 1)) {
            player.x = Math.floor((player.x + player.width) / TILE_SIZE) * TILE_SIZE - player.width;
        }
    } else if (player.vx < 0) {
        if (isSolid(player.x, player.y) || isSolid(player.x, player.y + player.height - 1)) {
            player.x = Math.floor(player.x / TILE_SIZE) * TILE_SIZE + TILE_SIZE;
        }
    }

    player.y += player.vy;
    player.grounded = false;
    if (player.vy > 0) {
        if (isSolid(player.x, player.y + player.height) || isSolid(player.x + player.width - 1, player.y + player.height)) {
            player.y = Math.floor((player.y + player.height) / TILE_SIZE) * TILE_SIZE - player.height;
            player.vy = 0;
            player.grounded = true;
        }
    } else if (player.vy < 0) {
        if (isSolid(player.x, player.y) || isSolid(player.x + player.width - 1, player.y)) {
            player.y = Math.floor(player.y / TILE_SIZE) * TILE_SIZE + TILE_SIZE;
            player.vy = 0;
        }
    }

    if (player.x < 0) player.x = 0;
    if (player.x + player.width > WORLD_COLS * TILE_SIZE) player.x = WORLD_COLS * TILE_SIZE - player.width;
    if (player.y > WORLD_ROWS * TILE_SIZE) { player.y = 0; player.vy = 0; }

    camera.x = Math.max(0, Math.min(player.x + player.width / 2 - canvas.width / 2, WORLD_COLS * TILE_SIZE - canvas.width));
    camera.y = Math.max(0, Math.min(player.y + player.height / 2 - canvas.height / 2, WORLD_ROWS * TILE_SIZE - canvas.height));

    updateTargetTile();

    if (isMining && miningTarget) {
        if (!targetTile || !targetTile.isBlock || targetTile.col !== miningTarget.col || targetTile.row !== miningTarget.row) {
            isMining = false; miningProgress = 0; miningTarget = null;
        } else {
            const blockId = world[miningTarget.row][miningTarget.col];
            // デバッグモードなら即座に最大プログレス（破壊）にする
            miningProgress += debugMode ? BLOCK_HARDNESS[blockId] : 1;
            
            if (miningProgress >= BLOCK_HARDNESS[blockId]) {
                addToInventory(blockId, 1);
                world[miningTarget.row][miningTarget.col] = 0;
                isMining = false; miningProgress = 0; miningTarget = null;
            }
        }
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    const startCol = Math.max(0, Math.floor(camera.x / TILE_SIZE));
    const endCol = Math.min(WORLD_COLS, startCol + Math.ceil(canvas.width / TILE_SIZE) + 1);
    const startRow = Math.max(0, Math.floor(camera.y / TILE_SIZE));
    const endRow = Math.min(WORLD_ROWS, startRow + Math.ceil(canvas.height / TILE_SIZE) + 1);

    const torches = [];
    if (!debugMode) {
        for (let r = startRow; r < endRow; r++) {
            for (let c = startCol; c < endCol; c++) {
                if (world[r][c] === 5) torches.push({ r: r, c: c, intensity: 6 });
            }
        }
        torches.push({ r: Math.floor((player.y + player.height/2) / TILE_SIZE), c: Math.floor((player.x + player.width/2) / TILE_SIZE), intensity: 3 });
    }

    for (let r = startRow; r < endRow; r++) {
        for (let c = startCol; c < endCol; c++) {
            const tile = world[r][c];
            const liquidLevel = water[r][c];
            
            if (tile !== 0) {
                ctx.fillStyle = BLOCK_COLORS[tile] || "white";
                ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                ctx.strokeStyle = "rgba(0,0,0,0.2)";
                ctx.strokeRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                
                if (!debugMode && miningTarget && miningTarget.row === r && miningTarget.col === c) {
                    const ratio = miningProgress / BLOCK_HARDNESS[tile];
                    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
                    const h = TILE_SIZE * ratio;
                    ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE + (TILE_SIZE - h), TILE_SIZE, h);
                }
            } 
            else if (liquidLevel > 0) {
                ctx.fillStyle = "rgba(52, 152, 219, 0.7)";
                let h = liquidLevel * TILE_SIZE;
                let yOffset = TILE_SIZE - h;
                if (r > 0 && water[r - 1][c] > 0) { h = TILE_SIZE; yOffset = 0; }
                ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE + yOffset, TILE_SIZE, h);
            }

            // デバッグモードがOFFのときだけ暗闇を描画
            if (!debugMode) {
                let depth = r - surfaceLevels[c];
                let baseDarkness = depth > 0 ? Math.min(0.95, depth * 0.15) : 0;
                
                let lightEffect = 0;
                for (let t of torches) {
                    let dist = Math.sqrt(Math.pow(r - t.r, 2) + Math.pow(c - t.c, 2));
                    if (dist < t.intensity) lightEffect += 1 - (dist / t.intensity);
                }
                let finalDarkness = Math.max(0, Math.min(0.95, baseDarkness - lightEffect));
                if (finalDarkness > 0) {
                    ctx.fillStyle = `rgba(0, 0, 0, ${finalDarkness})`;
                    ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                }
            }
        }
    }

    if (targetTile) {
        ctx.strokeStyle = "rgba(255, 255, 0, 0.9)";
        ctx.lineWidth = 3;
        ctx.strokeRect(targetTile.col * TILE_SIZE, targetTile.row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        ctx.lineWidth = 1;
    }

    ctx.fillStyle = "#e74c3c";
    ctx.fillRect(player.x, player.y, player.width, player.height);
    ctx.restore();

    // デバッグモード状態の表示
    if (debugMode) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.fillRect(10, 10, 150, 30);
        ctx.fillStyle = "#f1c40f";
        ctx.font = "bold 16px sans-serif";
        ctx.fillText("DEBUG MODE ON", 20, 30);
    }

    // --- ホットバー ---
    const barWidth = 9 * 50;
    const startX = (canvas.width - barWidth) / 2;
    const startY = canvas.height - 60;

    for (let i = 0; i < 9; i++) {
        const slotX = startX + i * 50;
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.fillRect(slotX, startY, 45, 45);
        if (i === selectedSlot) {
            ctx.strokeStyle = "#f1c40f"; ctx.lineWidth = 3; ctx.strokeRect(slotX, startY, 45, 45); ctx.lineWidth = 1;
        } else {
            ctx.strokeStyle = "rgba(255, 255, 255, 0.3)"; ctx.strokeRect(slotX, startY, 45, 45);
        }

        const item = hotbar[i];
        if (item.id !== 0 && item.count > 0) {
            ctx.fillStyle = BLOCK_COLORS[item.id];
            ctx.fillRect(slotX + 10, startY + 10, 25, 25);
            ctx.fillStyle = "white"; ctx.font = "bold 14px sans-serif";
            ctx.fillText(item.count, slotX + 25, startY + 40);
        }
        ctx.fillStyle = "rgba(255, 255, 255, 0.5)"; ctx.font = "10px sans-serif";
        ctx.fillText(i + 1, slotX + 3, startY + 12);
    }
}

function loop() { update(); draw(); requestAnimationFrame(loop); }
loop();
