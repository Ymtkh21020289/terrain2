const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const TILE_SIZE = 40;
const WORLD_COLS = 150; 
const WORLD_ROWS = 100; 
const REACH = TILE_SIZE * 5;

// --- インベントリ関連 ---
const hotbar = [
    { id: 0, count: 0 }, { id: 0, count: 0 }, { id: 0, count: 0 },
    { id: 0, count: 0 }, { id: 0, count: 0 }, { id: 0, count: 0 },
    { id: 7, count: 50 }, { id: 0, count: 0 }, { id: 0, count: 0 }
];
const inventory = Array.from({ length: 36 }, () => ({ id: 0, count: 0 }));

let selectedSlot = 0;
let showInventory = false;
let cursorItem = { id: 0, count: 0 };
let craftScrollY = 0;
let isNearWorkbench = false;
let visibleRecipes = [];

// --- プレイヤー & ワールド ---
let isMining = false;
let miningTarget = null;
let miningProgress = 0;

const keys = { a: false, d: false, w: false, s: false };
let rawMouseX = 0, rawMouseY = 0;
let targetTile = null;
const camera = { x: 0, y: 0 };
let debugMode = false;

// --- 【新規追加】光の拡散（スカイライト）システム ---
const lightMap = Array.from({length: WORLD_ROWS}, () => new Uint8Array(WORLD_COLS));
const lightQueue = new Int16Array(500000); // 処理速度アップのための専用キュー
let needsLightUpdate = true; // 光の再計算フラグ

// --- ブロックの透過判定ヘルパー ---
function isTransparent(blockId) {
    if (blockId === 0) return true; // 空気は透過
    if (blockId === 4 || blockId === 5) return true; // 葉っぱ(4)と松明(5)は透過
    return false;
}

function updateLighting() {
    let head = 0;
    let tail = 0;
    
    // 全タイルの光をリセット
    for (let r = 0; r < WORLD_ROWS; r++) {
        for (let c = 0; c < WORLD_COLS; c++) {
            lightMap[r][c] = 0;
        }
    }
    
    // 1. 真上からの太陽光（スカイライト）の計算
    for (let c = 0; c < WORLD_COLS; c++) {
        for (let r = 0; r < WORLD_ROWS; r++) {
            const blockId = world[r][c];
            const hasWater = water[r][c] > 0;

            // 太陽光をセット
            lightMap[r][c] = 15; 
            lightQueue[tail++] = r;
            lightQueue[tail++] = c;

            // 【重要】不透過ブロック（土、石、木など）に当たったら、直射日光はそこでストップ
            if (!isTransparent(blockId)) {
                break; 
            }
        }
    }
    
    // 2. 光を周囲に拡散させる（横方向や洞窟内への広がり）
    while(head < tail) {
        let r = lightQueue[head++];
        let c = lightQueue[head++];
        let currentLight = lightMap[r][c];
        if (currentLight <= 1) continue;
        
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (let [dr, dc] of dirs) {
            let nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < WORLD_ROWS && nc >= 0 && nc < WORLD_COLS) {
                const targetBlockId = world[nr][nc];
                const isWater = water[nr][nc] > 0;
                
                // --- 減衰率の決定 ---
                let decrease = 1; // 基本（空気や透過ブロック）は -1
                if (isWater) {
                    decrease = 2; // 水の中は少し暗くなりやすい
                } else if (!isTransparent(targetBlockId)) {
                    decrease = 3; // 不透過ブロックの中は急激に暗くなる
                }
                
                let nLight = currentLight - decrease;
                if (nLight > lightMap[nr][nc]) {
                    lightMap[nr][nc] = nLight;
                    lightQueue[tail++] = nr;
                    lightQueue[tail++] = nc;
                }
            }
        }
    }
}
// --- インベントリ管理関数 ---
function addToInventory(id, amount) {
    for(let i = 0; i < 9; i++) if(hotbar[i].id === id) { hotbar[i].count += amount; return; }
    for(let i = 0; i < 36; i++) if(inventory[i].id === id) { inventory[i].count += amount; return; }
    for(let i = 0; i < 9; i++) if(hotbar[i].id === 0) { hotbar[i].id = id; hotbar[i].count = amount; return; }
    for(let i = 0; i < 36; i++) if(inventory[i].id === 0) { inventory[i].id = id; inventory[i].count = amount; return; }
}

function countItem(id) {
    let total = 0;
    for(let i = 0; i < 9; i++) if(hotbar[i].id === id) total += hotbar[i].count;
    for(let i = 0; i < 36; i++) if(inventory[i].id === id) total += inventory[i].count;
    return total;
}

function consumeItem(id, amount) {
    if(countItem(id) < amount) return false;
    let remaining = amount;
    for(let i = 35; i >= 0; i--) {
        if(inventory[i].id === id && inventory[i].count > 0) {
            let take = Math.min(inventory[i].count, remaining);
            inventory[i].count -= take; remaining -= take;
            if(inventory[i].count === 0) inventory[i].id = 0;
            if(remaining <= 0) return true;
        }
    }
    for(let i = 8; i >= 0; i--) {
        if(hotbar[i].id === id && hotbar[i].count > 0) {
            let take = Math.min(hotbar[i].count, remaining);
            hotbar[i].count -= take; remaining -= take;
            if(hotbar[i].count === 0) hotbar[i].id = 0;
            if(remaining <= 0) return true;
        }
    }
    return false;
}

function checkWorkbench() {
    isNearWorkbench = false;
    let pCol = Math.floor((player.x + player.width/2) / TILE_SIZE);
    let pRow = Math.floor((player.y + player.height/2) / TILE_SIZE);
    for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
            let r = pRow + dr, c = pCol + dc;
            if (r >= 0 && r < WORLD_ROWS && c >= 0 && c < WORLD_COLS) if (world[r][c] === 12) isNearWorkbench = true;
        }
    }
    visibleRecipes = RECIPES.filter(r => !r.requiresWorkbench || isNearWorkbench);
    craftScrollY = 0;
}

// --- イベント ---
window.addEventListener("keydown", (e) => {
    if (e.key === "e" || e.key === "E") {
        showInventory = !showInventory;
        if (showInventory) checkWorkbench();
        else if (cursorItem.count > 0) { addToInventory(cursorItem.id, cursorItem.count); cursorItem = { id: 0, count: 0 }; }
        isMining = false; return;
    }
    if (e.key === "T") { debugMode = !debugMode; e.preventDefault(); }
    
    if (!showInventory) {
        if (e.key === "a" || e.key === "A") keys.a = true;
        if (e.key === "d" || e.key === "D") keys.d = true;
        if (e.key === "w" || e.key === "W") keys.w = true;
        if (e.key === "s" || e.key === "S") keys.s = true;
        if (e.key >= "1" && e.key <= "9") selectedSlot = parseInt(e.key) - 1;
    }
});

window.addEventListener("keyup", (e) => {
    if (e.key === "a" || e.key === "A") keys.a = false;
    if (e.key === "d" || e.key === "D") keys.d = false;
    if (e.key === "w" || e.key === "W") keys.w = false;
    if (e.key === "s" || e.key === "S") keys.s = false;
});

canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect(); rawMouseX = e.clientX - rect.left; rawMouseY = e.clientY - rect.top;
});

canvas.addEventListener("wheel", (e) => {
    if (showInventory) {
        craftScrollY += e.deltaY > 0 ? 30 : -30;
        craftScrollY = Math.max(0, Math.min(craftScrollY, Math.max(0, visibleRecipes.length * 60 - 200)));
    }
});

canvas.addEventListener("contextmenu", e => e.preventDefault());

canvas.addEventListener("mousedown", (e) => {
    if (showInventory) {
        if (e.button !== 0) return;
        const invStartX = 20, invStartY = 40;
        if (rawMouseX >= invStartX && rawMouseX <= invStartX + 9 * 50 && rawMouseY >= invStartY && rawMouseY <= invStartY + 4 * 50) {
            let col = Math.floor((rawMouseX - invStartX) / 50), row = Math.floor((rawMouseY - invStartY) / 50);
            let temp = { ...inventory[row * 9 + col] }; inventory[row * 9 + col] = { ...cursorItem }; cursorItem = temp;
            return;
        }

        const hbStartX = (canvas.width - 9 * 50) / 2, hbStartY = canvas.height - 60;
        if (rawMouseX >= hbStartX && rawMouseX <= hbStartX + 9 * 50 && rawMouseY >= hbStartY && rawMouseY <= hbStartY + 50) {
            let col = Math.floor((rawMouseX - hbStartX) / 50);
            let temp = { ...hotbar[col] }; hotbar[col] = { ...cursorItem }; cursorItem = temp;
            return;
        }

        const craftStartX = 20, craftStartY = 280, craftAreaHeight = 200;
        if (rawMouseX >= craftStartX && rawMouseX <= craftStartX + 300 && rawMouseY >= craftStartY && rawMouseY <= craftStartY + craftAreaHeight) {
            let recipeIdx = Math.floor((rawMouseY - craftStartY + craftScrollY) / 60);
            if (recipeIdx >= 0 && recipeIdx < visibleRecipes.length) {
                let recipe = visibleRecipes[recipeIdx];
                let canCraft = true;
                for (let ing of recipe.ingredients) if (countItem(ing.id) < ing.count) canCraft = false;
                if (canCraft) {
                    for (let ing of recipe.ingredients) consumeItem(ing.id, ing.count);
                    addToInventory(recipe.result.id, recipe.result.count);
                }
            }
        }
        return;
    }

    if (!targetTile) return;
    const r = targetTile.row; const c = targetTile.col;
    
    if (e.button === 0) { 
        if (targetTile.isBlock) {
            isMining = true; miningTarget = { col: c, row: r }; miningProgress = 0;
        } else if (water[r][c] > 0.1) {
            water[r][c] = 0; addToInventory(7, 1);
            needsLightUpdate = true; // 水を汲んだら光を更新
        }
    } else if (e.button === 2 && !targetTile.isBlock) { 
        const slot = hotbar[selectedSlot];
        if (slot.id === 7 && slot.count > 0) {
            water[r][c] = Math.min(1.0, water[r][c] + 1.0);
            slot.count--; if(slot.count === 0) slot.id = 0;
            needsLightUpdate = true; // 水を置いたら光を更新
        } else if (slot.id !== 0 && slot.count > 0 && !isCollidingWithPlayer(c, r)) {
            if (BLOCKS[slot.id]) {
                world[r][c] = slot.id; water[r][c] = 0; 
                slot.count--; if(slot.count === 0) slot.id = 0;
                needsLightUpdate = true; // ブロックを置いたら光を更新
            }
        }
    }
});

canvas.addEventListener("mouseup", (e) => { if (e.button === 0) { isMining = false; miningProgress = 0; miningTarget = null; }});
canvas.addEventListener("mouseleave", () => { isMining = false; miningProgress = 0; miningTarget = null; });

// --- ワールド生成 ---
const world = []; const water = []; const surfaceLevels = []; const pondData = [];

for (let c = 0; c < WORLD_COLS; c++) surfaceLevels[c] = 20 + Math.floor(Math.sin(c * 0.1) * 3) + Math.floor(Math.sin(c * 0.05) * 4);

for (let c = 10; c < WORLD_COLS - 15; c++) {
    if (Math.random() < 0.08) { 
        let pWidth = 5 + Math.floor(Math.random() * 6), pDepth = 3 + Math.floor(Math.random() * 3), startLevel = surfaceLevels[c]; 
        for (let i = 0; i < pWidth; i++) {
            let dip = Math.floor(Math.sin((i / (pWidth - 1)) * Math.PI) * pDepth);
            surfaceLevels[c + i] += dip; pondData.push({ c: c + i, r: startLevel, dip: dip }); 
        }
        c += pWidth + 10; 
    }
}

for (let r = 0; r < WORLD_ROWS; r++) {
    let row = [], wRow = [];
    for (let c = 0; c < WORLD_COLS; c++) {
        wRow.push(0);
        let sl = surfaceLevels[c];
        if (r < sl) row.push(0);
        else if (r === sl) row.push(1); 
        else if (r > sl && r < sl + 6) row.push(2); 
        else row.push(Math.random() < 0.55 ? 8 : 0);
    }
    world.push(row); water.push(wRow);
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
    for (let r = 0; r < WORLD_ROWS; r++) for (let c = 0; c < WORLD_COLS; c++) if (r > surfaceLevels[c] + 6) world[r][c] = newWorld[r][c];
}

for (let c = 0; c < WORLD_COLS; c++) { world[WORLD_ROWS - 1][c] = 8; world[WORLD_ROWS - 2][c] = 8; }

for (let pd of pondData) {
    if (pd.dip > 0) {
        for(let r = pd.r; r < surfaceLevels[pd.c]; r++) { world[r][pd.c] = 0; water[r][pd.c] = 1.0; }
        world[surfaceLevels[pd.c]][pd.c] = 2; 
    }
}

for (let c = 5; c < WORLD_COLS - 5; c++) {
    let sl = surfaceLevels[c];
    if (Math.random() < 0.15 && world[sl][c] === 1 && water[sl - 1][c] === 0) {
        let treeHeight = Math.floor(Math.random() * 3) + 3;
        for (let i = 1; i <= treeHeight; i++) world[sl - i][c] = 3;
        for (let lr = sl - treeHeight - 2; lr <= sl - treeHeight; lr++) {
            for (let lc = c - 1; lc <= c + 1; lc++) if (lr >= 0 && lc >= 0 && lc < WORLD_COLS && world[lr][lc] === 0) world[lr][lc] = 4;
        }
        c += 2;
    }
}

for (let r = 0; r < WORLD_ROWS; r++) {
    for (let c = 0; c < WORLD_COLS; c++) {
        if (world[r][c] === 8) { 
            let depth = r - surfaceLevels[c];
            if (depth > 5 && Math.random() < 0.05) world[r][c] = 9;
            else if (depth > 15 && Math.random() < 0.03) world[r][c] = 10;
            else if (depth > 30 && Math.random() < 0.01) world[r][c] = 11;
        }
    }
}

const player = {
    x: (WORLD_COLS * TILE_SIZE) / 2, y: 0, width: 30, height: 40,
    vx: 0, vy: 0, speed: 5, jumpPower: -11, gravity: 0.6, grounded: false
};

function getTile(x, y) {
    const col = Math.floor(x / TILE_SIZE), row = Math.floor(y / TILE_SIZE);
    if (row >= 0 && row < WORLD_ROWS && col >= 0 && col < WORLD_COLS) return world[row][col];
    return 0;
}
function isSolid(x, y) { return getTile(x, y) !== 0; }
function isCollidingWithPlayer(col, row) {
    const tx = col * TILE_SIZE, ty = row * TILE_SIZE;
    return (player.x < tx + TILE_SIZE && player.x + player.width > tx && player.y < ty + TILE_SIZE && player.y + player.height > ty);
}
function updateTargetTile() {
    targetTile = null;
    const absX = rawMouseX + camera.x, absY = rawMouseY + camera.y;
    const px = player.x + player.width / 2, py = player.y + player.height / 2;
    const dx = absX - px, dy = absY - py, dist = Math.sqrt(dx*dx + dy*dy);
    if (dist > REACH) return; 

    const steps = dist / 2, stepX = dx / steps, stepY = dy / steps;
    let cx = px, cy = py;
    for (let i = 0; i <= steps; i++) {
        const col = Math.floor(cx / TILE_SIZE), row = Math.floor(cy / TILE_SIZE);
        if (row >= 0 && row < WORLD_ROWS && col >= 0 && col < WORLD_COLS && world[row][col] !== 0) {
            targetTile = { col: col, row: row, isBlock: true }; return;
        }
        cx += stepX; cy += stepY;
    }
    const mCol = Math.floor(absX / TILE_SIZE), mRow = Math.floor(absY / TILE_SIZE);
    if (mRow >= 0 && mRow < WORLD_ROWS && mCol >= 0 && mCol < WORLD_COLS) targetTile = { col: mCol, row: mRow, isBlock: false };
}

let frameCount = 0;
let scanDirection = 1;

function updateFluids() {
    let moved = false;
    scanDirection *= -1; 
    for (let r = WORLD_ROWS - 2; r >= 0; r--) {
        const start = scanDirection === 1 ? 0 : WORLD_COLS - 1, end = scanDirection === 1 ? WORLD_COLS : -1, step = scanDirection === 1 ? 1 : -1;
        for (let c = start; c !== end; c += step) {
            if (water[r][c] <= 0) continue;
            if (world[r + 1][c] === 0) {
                let free = 1.0 - water[r + 1][c];
                if (free > 0) { let flow = Math.min(water[r][c], free); water[r][c] -= flow; water[r + 1][c] += flow; moved = true; }
            }
            if (water[r][c] <= 0.005) continue;
            let c1 = c + step, c2 = c - step;
            if (c1 >= 0 && c1 < WORLD_COLS && world[r][c1] === 0 && water[r][c] > water[r][c1]) {
                let flow = (water[r][c] - water[r][c1]) / 2; water[r][c] -= flow; water[r][c1] += flow; moved = true;
            }
            if (c2 >= 0 && c2 < WORLD_COLS && world[r][c2] === 0 && water[r][c] > water[r][c2]) {
                let flow = (water[r][c] - water[r][c2]) / 2; water[r][c] -= flow; water[r][c2] += flow; moved = true;
            }
        }
    }
    for (let r = 0; r < WORLD_ROWS; r++) {
        for (let c = 0; c < WORLD_COLS; c++) {
            if (water[r][c] > 0 && water[r][c] < 0.02) { water[r][c] = 0; moved = true; }
        }
    }
    if (moved) needsLightUpdate = true; // 水が動いたら光を更新
}

function update() {
    // 必要な場合のみ光を計算
    if (needsLightUpdate) {
        updateLighting();
        needsLightUpdate = false;
    }

    frameCount++; if (frameCount % 10 === 0) updateFluids();
    if (showInventory) return;

    let pCol = Math.floor((player.x + player.width/2) / TILE_SIZE), pRow = Math.floor((player.y + player.height/2) / TILE_SIZE);
    let inWater = pRow >= 0 && pRow < WORLD_ROWS && pCol >= 0 && pCol < WORLD_COLS && water[pRow][pCol] > 0.3;
    let currentSpeed = (inWater && !debugMode) ? player.speed * 0.5 : player.speed;
    let currentGravity = (inWater && !debugMode) ? player.gravity * 0.5 : player.gravity;

    if (keys.a) player.vx = -currentSpeed; else if (keys.d) player.vx = currentSpeed; else player.vx = 0;

    if (debugMode) {
        if (keys.w) player.vy = -currentSpeed; else if (keys.s) player.vy = currentSpeed; else player.vy = 0;
    } else {
        if (keys.w) {
            if (player.grounded) { player.vy = player.jumpPower; player.grounded = false; }
            else if (inWater) { player.vy = player.jumpPower * 0.7; }
        }
        player.vy += currentGravity;
    }
    
    player.x += player.vx;
    if (player.vx > 0) { if (isSolid(player.x + player.width, player.y) || isSolid(player.x + player.width, player.y + player.height - 1)) player.x = Math.floor((player.x + player.width) / TILE_SIZE) * TILE_SIZE - player.width; }
    else if (player.vx < 0) { if (isSolid(player.x, player.y) || isSolid(player.x, player.y + player.height - 1)) player.x = Math.floor(player.x / TILE_SIZE) * TILE_SIZE + TILE_SIZE; }

    player.y += player.vy; player.grounded = false;
    if (player.vy > 0) {
        if (isSolid(player.x, player.y + player.height) || isSolid(player.x + player.width - 1, player.y + player.height)) {
            player.y = Math.floor((player.y + player.height) / TILE_SIZE) * TILE_SIZE - player.height; player.vy = 0; player.grounded = true;
        }
    } else if (player.vy < 0) {
        if (isSolid(player.x, player.y) || isSolid(player.x + player.width - 1, player.y)) { player.y = Math.floor(player.y / TILE_SIZE) * TILE_SIZE + TILE_SIZE; player.vy = 0; }
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
            const targetHardness = BLOCKS[blockId] ? BLOCKS[blockId].hardness : 10;
            const activeItem = hotbar[selectedSlot].id;
            let minePower = 1;
            if (ITEMS[activeItem]) minePower = ITEMS[activeItem].power;

            miningProgress += debugMode ? targetHardness : minePower;

            if (miningProgress >= targetHardness) {
                addToInventory(blockId, 1);
                world[miningTarget.row][miningTarget.col] = 0;
                isMining = false; miningProgress = 0; miningTarget = null;
                needsLightUpdate = true; // ブロックを壊したら光を更新
            }
        }
    }
}

function drawSlot(ctx, x, y, item, isSelected = false) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)"; ctx.fillRect(x, y, 45, 45);
    if (isSelected) { ctx.strokeStyle = "#f1c40f"; ctx.lineWidth = 3; ctx.strokeRect(x, y, 45, 45); ctx.lineWidth = 1; } 
    else { ctx.strokeStyle = "rgba(255, 255, 255, 0.3)"; ctx.strokeRect(x, y, 45, 45); }
    if (item.id !== 0 && item.count > 0) {
        ctx.fillStyle = getItemColor(item.id); ctx.fillRect(x + 10, y + 10, 25, 25);
        ctx.fillStyle = "white"; ctx.font = "bold 14px sans-serif"; ctx.fillText(item.count, x + 25, y + 40);
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.save(); ctx.translate(-camera.x, -camera.y);

    const startCol = Math.max(0, Math.floor(camera.x / TILE_SIZE)), endCol = Math.min(WORLD_COLS, startCol + Math.ceil(canvas.width / TILE_SIZE) + 1);
    const startRow = Math.max(0, Math.floor(camera.y / TILE_SIZE)), endRow = Math.min(WORLD_ROWS, startRow + Math.ceil(canvas.height / TILE_SIZE) + 1);

    const maxLightRadius = 6;
    const torchStartCol = Math.max(0, startCol - maxLightRadius);
    const torchEndCol = Math.min(WORLD_COLS, endCol + maxLightRadius);
    const torchStartRow = Math.max(0, startRow - maxLightRadius);
    const torchEndRow = Math.min(WORLD_ROWS, endRow + maxLightRadius);

    const torches = [];
    if (!debugMode) {
        for (let r = torchStartRow; r < torchEndRow; r++) for (let c = torchStartCol; c < torchEndCol; c++) if (world[r][c] === 5) torches.push({ r: r, c: c, intensity: maxLightRadius });
        torches.push({ r: Math.floor((player.y + player.height/2) / TILE_SIZE), c: Math.floor((player.x + player.width/2) / TILE_SIZE), intensity: 3 });
    }

    for (let r = startRow; r < endRow; r++) {
        for (let c = startCol; c < endCol; c++) {
            const tile = world[r][c]; const liquidLevel = water[r][c];
            if (tile !== 0) {
                ctx.fillStyle = getItemColor(tile); ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                if (tile === 12) { ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(c * TILE_SIZE + 5, r * TILE_SIZE + 5, TILE_SIZE - 10, TILE_SIZE - 10); }
                ctx.strokeStyle = "rgba(0,0,0,0.2)"; ctx.strokeRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                if (!debugMode && miningTarget && miningTarget.row === r && miningTarget.col === c) {
                    const ratio = miningProgress / (BLOCKS[tile] ? BLOCKS[tile].hardness : 10);
                    ctx.fillStyle = "rgba(0, 0, 0, 0.6)"; const h = TILE_SIZE * ratio; ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE + (TILE_SIZE - h), TILE_SIZE, h);
                }
            } else if (liquidLevel > 0) {
                ctx.fillStyle = "rgba(52, 152, 219, 0.7)"; let h = liquidLevel * TILE_SIZE, yOffset = TILE_SIZE - h;
                if (r > 0 && water[r - 1][c] > 0) { h = TILE_SIZE; yOffset = 0; }
                ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE + yOffset, TILE_SIZE, h);
            }
            
            if (!debugMode) {
                // 【変更箇所】新しい lightMap をベースに影を計算
                let depthDarkness = 1.0 - (lightMap[r][c] / 15.0);
                let baseDarkness = Math.min(0.95, Math.max(0, depthDarkness));
                
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

    if (!showInventory && targetTile) {
        ctx.strokeStyle = "rgba(255, 255, 0, 0.9)"; ctx.lineWidth = 3;
        ctx.strokeRect(targetTile.col * TILE_SIZE, targetTile.row * TILE_SIZE, TILE_SIZE, TILE_SIZE); ctx.lineWidth = 1;
    }
    ctx.fillStyle = "#e74c3c"; ctx.fillRect(player.x, player.y, player.width, player.height); ctx.restore();

    if (debugMode) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)"; ctx.fillRect(10, 10, 150, 30);
        ctx.fillStyle = "#f1c40f"; ctx.font = "bold 16px sans-serif"; ctx.fillText("DEBUG MODE ON", 20, 30);
    }

    if (showInventory) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "white"; ctx.font = "bold 18px sans-serif"; ctx.fillText("Inventory", 20, 30);

        const invStartX = 20, invStartY = 40;
        for (let r = 0; r < 4; r++) for (let c = 0; c < 9; c++) drawSlot(ctx, invStartX + c * 50, invStartY + r * 50, inventory[r * 9 + c]);

        ctx.fillStyle = isNearWorkbench ? "#f1c40f" : "white";
        ctx.fillText(isNearWorkbench ? "Crafting (Workbench Available)" : "Crafting", 20, 270);
        
        const craftStartX = 20, craftStartY = 280, craftAreaHeight = 200;
        ctx.save(); ctx.beginPath(); ctx.rect(craftStartX, craftStartY, 400, craftAreaHeight); ctx.clip();

        for (let i = 0; i < visibleRecipes.length; i++) {
            let recipe = visibleRecipes[i];
            let y = craftStartY + i * 60 - craftScrollY;
            let canCraft = true;
            for (let ing of recipe.ingredients) if (countItem(ing.id) < ing.count) canCraft = false;

            ctx.fillStyle = canCraft ? "rgba(255, 255, 255, 0.2)" : "rgba(255, 255, 255, 0.05)";
            ctx.fillRect(craftStartX, y, 300, 50); ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.strokeRect(craftStartX, y, 300, 50);

            ctx.fillStyle = getItemColor(recipe.result.id); ctx.fillRect(craftStartX + 10, y + 10, 30, 30);
            ctx.fillStyle = "white"; ctx.font = "bold 14px sans-serif"; ctx.fillText(recipe.result.count, craftStartX + 30, y + 40);
            ctx.fillText("=", craftStartX + 55, y + 30);

            for (let j = 0; j < recipe.ingredients.length; j++) {
                let ing = recipe.ingredients[j], ix = craftStartX + 80 + j * 60;
                ctx.fillStyle = getItemColor(ing.id); ctx.fillRect(ix, y + 10, 30, 30);
                let current = countItem(ing.id);
                ctx.fillStyle = current >= ing.count ? "white" : "#e74c3c"; ctx.font = "12px sans-serif";
                ctx.fillText(`${current}/${ing.count}`, ix + 5, y + 45);
            }
        }
        ctx.restore();
    }

    const hbStartX = (canvas.width - 9 * 50) / 2, hbStartY = canvas.height - 60;
    for (let i = 0; i < 9; i++) {
        drawSlot(ctx, hbStartX + i * 50, hbStartY, hotbar[i], i === selectedSlot && !showInventory);
        if (!showInventory) {
            ctx.fillStyle = "rgba(255, 255, 255, 0.5)"; ctx.font = "10px sans-serif"; ctx.fillText(i + 1, hbStartX + i * 50 + 3, hbStartY + 12);
        }
    }

    let hoverText = null;

    // ① インベントリを閉じている時：選択中のアイテム名をホットバーの上に表示
    if (!showInventory) {
        let selectedItem = hotbar[selectedSlot];
        if (selectedItem && selectedItem.id !== 0) {
            ctx.fillStyle = "white";
            ctx.font = "bold 18px sans-serif";
            ctx.textAlign = "center";
            // 見やすいように薄く影をつける
            ctx.shadowColor = "rgba(0, 0, 0, 0.8)"; ctx.shadowBlur = 4;
            ctx.fillText(getItemName(selectedItem.id), canvas.width / 2, hbStartY - 15);
            ctx.shadowBlur = 0; ctx.textAlign = "left"; // 設定をリセット
        }
    }

    // ② マウスカーソルが乗っているアイテムの名前を判定
    // ホットバーのホバー判定
    for (let i = 0; i < 9; i++) {
        let slotX = hbStartX + i * 50;
        if (rawMouseX >= slotX && rawMouseX <= slotX + 45 && rawMouseY >= hbStartY && rawMouseY <= hbStartY + 45) {
            if (hotbar[i].id !== 0) hoverText = getItemName(hotbar[i].id);
        }
    }

    if (showInventory) {
        // インベントリのホバー判定
        const invStartX = 20, invStartY = 40;
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 9; c++) {
                let slotX = invStartX + c * 50, slotY = invStartY + r * 50;
                if (rawMouseX >= slotX && rawMouseX <= slotX + 45 && rawMouseY >= slotY && rawMouseY <= slotY + 45) {
                    let item = inventory[r * 9 + c];
                    if (item.id !== 0) hoverText = getItemName(item.id);
                }
            }
        }

        // クラフト画面の完成品のホバー判定
        const craftStartX = 20, craftStartY = 280, craftAreaHeight = 200;
        if (rawMouseX >= craftStartX && rawMouseX <= craftStartX + 300 && rawMouseY >= craftStartY && rawMouseY <= craftStartY + craftAreaHeight) {
            let recipeIdx = Math.floor((rawMouseY - craftStartY + craftScrollY) / 60);
            if (recipeIdx >= 0 && recipeIdx < visibleRecipes.length) {
                let y = craftStartY + recipeIdx * 60 - craftScrollY;
                // 完成品アイコンの描画エリア（craftStartX + 10, y + 10 からの 30x30 サイズ）にカーソルがあるか
                if (rawMouseX >= craftStartX + 10 && rawMouseX <= craftStartX + 40 && rawMouseY >= y + 10 && rawMouseY <= y + 40) {
                    hoverText = getItemName(visibleRecipes[recipeIdx].result.id);
                }
            }
        }
    }

    // ③ ツールチップの描画（マウスにアイテムを掴んでいない時のみ表示）
    if (hoverText && cursorItem.count === 0) {
        ctx.font = "14px sans-serif";
        let textWidth = ctx.measureText(hoverText).width;
        
        // 背景の黒い半透明ボックス
        ctx.fillStyle = "rgba(16, 16, 20, 0.9)";
        ctx.fillRect(rawMouseX + 15, rawMouseY + 15, textWidth + 16, 26);
        // 白枠線
        ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        ctx.strokeRect(rawMouseX + 15, rawMouseY + 15, textWidth + 16, 26);
        
        // テキスト
        ctx.fillStyle = "white";
        ctx.fillText(hoverText, rawMouseX + 23, rawMouseY + 33);
    }

    if (showInventory && cursorItem.count > 0) {
        ctx.fillStyle = getItemColor(cursorItem.id); ctx.fillRect(rawMouseX - 15, rawMouseY - 15, 30, 30);
        ctx.fillStyle = "white"; ctx.font = "bold 16px sans-serif"; ctx.fillText(cursorItem.count, rawMouseX + 5, rawMouseY + 15);
    }
}

function loop() { update(); draw(); requestAnimationFrame(loop); }
loop();

function getItemName(id) {
    return ITEMS[id].jp_name || `アイテム (${id})`;
}
