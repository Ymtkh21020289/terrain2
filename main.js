const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const TILE_SIZE = 40;
const WORLD_COLS = 150; 
const WORLD_ROWS = 100; 
const REACH = TILE_SIZE * 5;

// --- インベントリ関連 ---
const hotbar = [
    { id: 1, count: 0 }, { id: 2, count: 0 }, { id: 3, count: 0 },
    { id: 4, count: 0 }, { id: 5, count: 0 }, { id: 6, count: 0 },
    { id: 7, count: 50 }, { id: 0, count: 0 }, { id: 0, count: 0 }
];
const inventory = Array.from({ length: 36 }, () => ({ id: 0, count: 0 }));

let selectedSlot = 0;
let showInventory = false;
let cursorItem = { id: 0, count: 0 };
let craftScrollY = 0;
let isNearWorkbench = false; // 作業台判定
let visibleRecipes = [];     // 実際にUIに表示するレシピ

// --- プレイヤー & ワールド ---
let isMining = false;
let miningTarget = null;
let miningProgress = 0;

const keys = { a: false, d: false, w: false, s: false };
let rawMouseX = 0, rawMouseY = 0;
let targetTile = null;
const camera = { x: 0, y: 0 };
let debugMode = false;

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

// 作業台が近くにあるかチェックする関数
function checkWorkbench() {
    isNearWorkbench = false;
    let pCol = Math.floor((player.x + player.width/2) / TILE_SIZE);
    let pRow = Math.floor((player.y + player.height/2) / TILE_SIZE);
    for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
            let r = pRow + dr, c = pCol + dc;
            if (r >= 0 && r < WORLD_ROWS && c >= 0 && c < WORLD_COLS) {
                if (world[r][c] === 12) isNearWorkbench = true;
            }
        }
    }
    // 表示するレシピを更新
    visibleRecipes = RECIPES.filter(r => !r.requiresWorkbench || isNearWorkbench);
    craftScrollY = 0; // スクロール位置リセット
}

// --- イベント ---
window.addEventListener("keydown", (e) => {
    if (e.key === "e" || e.key === "E") {
        showInventory = !showInventory;
        if (showInventory) {
            checkWorkbench(); // インベントリを開いたときに作業台をチェック
        } else if (cursorItem.count > 0) {
            addToInventory(cursorItem.id, cursorItem.count);
            cursorItem = { id: 0, count: 0 };
        }
        isMining = false;
        return;
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
    const rect = canvas.getBoundingClientRect();
    rawMouseX = e.clientX - rect.left;
    rawMouseY = e.clientY - rect.top;
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
            let idx = row * 9 + col;
            let temp = { ...inventory[idx] }; inventory[idx] = { ...cursorItem }; cursorItem = temp;
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
            let clickY = rawMouseY - craftStartY + craftScrollY;
            let recipeIdx = Math.floor(clickY / 60);
            
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
        }
    } else if (e.button === 2 && !targetTile.isBlock) { 
        const slot = hotbar[selectedSlot];
        if (slot.id === 7 && slot.count > 0) {
            water[r][c] = Math.min(1.0, water[r][c] + 1.0);
            slot.count--; if(slot.count === 0) slot.id = 0;
        } else if (slot.id !== 0 && slot.count > 0 && !isCollidingWithPlayer(c, r)) {
            // アイテム（ID100以上）はブロックとして置けないようにする
            if (BLOCKS[slot.id]) {
                world[r][c] = slot.id; water[r][c] = 0; 
                slot.count--; if(slot.count === 0) slot.id = 0;
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

// 鉱石の生成（石の中にランダムに配置）
for (let r = 0; r < WORLD_ROWS; r++) {
    for (let c = 0; c < WORLD_COLS; c++) {
        if (world[r][c] === 8) { 
            let depth = r - surfaceLevels[c];
            if (depth > 5 && Math.random() < 0.05) world[r][c] = 9;       // 石炭
            else if (depth > 15 && Math.random() < 0.03) world[r][c] = 10; // 鉄
            else if (depth > 30 && Math.random() < 0.01) world[r][c] = 11; // 金
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
    scanDirection *= -1; 
    for (let r = WORLD_ROWS - 2; r >= 0; r--) {
        const start = scanDirection === 1 ? 0 : WORLD_COLS - 1, end = scanDirection === 1 ? WORLD_COLS : -1, step = scanDirection === 1 ? 1 : -1;
        for (let c = start; c !== end; c += step) {
            if (water[r][c] <= 0) continue;
            if (world[r + 1][c] === 0) {
                let free = 1.0 - water[r + 1][c];
                if (free > 0) { let flow = Math.min(water[r][c], free); water[r][c] -= flow; water[r + 1][c] += flow; }
            }
            if (water[r][c] <= 0.005) continue;
            let c1 = c + step, c2 = c - step;
            if (c1 >= 0 && c1 < WORLD_COLS && world[r][c1] === 0 && water[r][c] > water[r][c1]) {
                let flow = (water[r][c] - water[r][c1]) / 2; water[r][c] -= flow; water[r][c1] += flow;
            }
            if (c2 >= 0 && c2 < WORLD_COLS && world[r][c2] === 0 && water[r][c] > water[r][c2]) {
                let flow = (water[r][c] - water[r][c2]) / 2; water[r][c] -= flow; water[r][c2] += flow;
            }
        }
    }
    for (let r = 0; r < WORLD_ROWS; r++) for (let c = 0; c < WORLD_COLS; c++) if (water[r][c] > 0 && water[r][c] < 0.02) water[r][c] = 0;
}

function update() {
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
            
            // ツールによる採掘力の計算
            const activeItem = hotbar[selectedSlot].id;
            let minePower = 1; // 素手の基本パワー
            if (ITEMS[activeItem]) minePower = ITEMS[activeItem].power;

            miningProgress += debugMode ? targetHardness : minePower;

            if (miningProgress >= targetHardness) {
                addToInventory(blockId, 1);
                world[miningTarget.row][miningTarget.col] = 0;
                isMining = false; miningProgress = 0; miningTarget = null;
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

    const startCol = Math.max(0, Math.floor(camera.x / TILE_SIZE));
    const endCol = Math.min(WORLD_COLS, startCol + Math.ceil(canvas.width / TILE_SIZE) + 1);
    const startRow = Math.max(0, Math.floor(camera.y / TILE_SIZE));
    const endRow = Math.min(WORLD_ROWS, startRow + Math.ceil(canvas.height / TILE_SIZE) + 1);

    const maxLightRadius = 6;
    const torchStartCol = Math.max(0, startCol - maxLightRadius);
    const torchEndCol = Math.min(WORLD_COLS, endCol + maxLightRadius);
    const torchStartRow = Math.max(0, startRow - maxLightRadius);
    const torchEndRow = Math.min(WORLD_ROWS, endRow + maxLightRadius);

    const torches = [];
    if (!debugMode) {
        for (let r = torchStartRow; r < torchEndRow; r++) {
            for (let c = torchStartCol; c < torchEndCol; c++) {
                if (world[r][c] === 5) torches.push({ r: r, c: c, intensity: maxLightRadius });
            }
        }
        torches.push({ r: Math.floor((player.y + player.height/2) / TILE_SIZE), c: Math.floor((player.x + player.width/2) / TILE_SIZE), intensity: 3 });
    }

    for (let r = startRow; r < endRow; r++) {
        for (let c = startCol; c < endCol; c++) {
            const tile = world[r][c]; const liquidLevel = water[r][c];
            if (tile !== 0) {
                ctx.fillStyle = getItemColor(tile); ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                // 作業台の場合は少し模様を描画
                if (tile === 12) {
                    ctx.fillStyle = "rgba(0,0,0,0.3)";
                    ctx.fillRect(c * TILE_SIZE + 5, r * TILE_SIZE + 5, TILE_SIZE - 10, TILE_SIZE - 10);
                }
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
                let depth = r - surfaceLevels[c], baseDarkness = depth > 0 ? Math.min(0.95, depth * 0.15) : 0, lightEffect = 0;
                for (let t of torches) {
                    let dist = Math.sqrt(Math.pow(r - t.r, 2) + Math.pow(c - t.c, 2));
                    if (dist < t.intensity) lightEffect += 1 - (dist / t.intensity);
                }
                let finalDarkness = Math.max(0, Math.min(0.95, baseDarkness - lightEffect));
                if (finalDarkness > 0) { ctx.fillStyle = `rgba(0, 0, 0, ${finalDarkness})`; ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE); }
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

    if (showInventory && cursorItem.count > 0) {
        ctx.fillStyle = getItemColor(cursorItem.id); ctx.fillRect(rawMouseX - 15, rawMouseY - 15, 30, 30);
        ctx.fillStyle = "white"; ctx.font = "bold 16px sans-serif"; ctx.fillText(cursorItem.count, rawMouseX + 5, rawMouseY + 15);
    }
}

function loop() { update(); draw(); requestAnimationFrame(loop); }
loop();
