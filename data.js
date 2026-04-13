// --- ブロックデータ ---
const BLOCKS = {
    0:  { name: "Air", color: null, hardness: 0 },
    1:  { name: "Grass", color: "#2ecc71", hardness: 15 },
    2:  { name: "Dirt", color: "#8e44ad", hardness: 20 },
    3:  { name: "Log", color: "#8D6E63", hardness: 45 },
    4:  { name: "Leaves", color: "#27ae60", hardness: 5 },
    5:  { name: "Torch", color: "#f39c12", hardness: 5 },
    6:  { name: "Planks", color: "#e67e22", hardness: 30 },
    7:  { name: "Water", color: "#3498db", hardness: 0 },
    8:  { name: "Stone", color: "#7f8c8d", hardness: 60 },
    9:  { name: "Coal Ore", color: "#2c3e50", hardness: 70 }, // 石炭（黒灰色）
    10: { name: "Iron Ore", color: "#d1ccc0", hardness: 90 }, // 鉄（薄灰色）
    11: { name: "Gold Ore", color: "#f1c40f", hardness: 90 }, // 金（黄色）
    12: { name: "Crafting Table", color: "#d35400", hardness: 30 } // 作業台（濃いオレンジ）
};

// --- アイテム（ツールなど）データ ---
const ITEMS = {
    101: { name: "Wooden Pickaxe", color: "#a0522d", power: 2 },
    102: { name: "Stone Pickaxe", color: "#95a5a6", power: 5 },
    103: { name: "Iron Pickaxe", color: "#bdc3c7", power: 10 }
};

// 描画用の色取得ヘルパー関数
function getItemColor(id) {
    if (BLOCKS[id]) return BLOCKS[id].color;
    if (ITEMS[id]) return ITEMS[id].color;
    return "white";
}

// --- クラフトレシピデータ ---
// requiresWorkbench: true にすると、近くに作業台がないと作れない
const RECIPES = [
    // --- 手作り可能 ---
    { result: { id: 6, count: 4 }, ingredients: [{ id: 3, count: 1 }], requiresWorkbench: false }, // 原木(1) -> 木材(4)
    { result: { id: 12, count: 1 }, ingredients: [{ id: 6, count: 4 }], requiresWorkbench: false }, // 木材(4) -> 作業台(1)
    { result: { id: 5, count: 4 }, ingredients: [{ id: 6, count: 1 }, { id: 9, count: 1 }], requiresWorkbench: false }, // 木材(1)+石炭(1) -> 松明(4)

    // --- 作業台が必要 ---
    { result: { id: 101, count: 1 }, ingredients: [{ id: 6, count: 3 }], requiresWorkbench: true }, // 木材(3) -> 木のツルハシ
    { result: { id: 102, count: 1 }, ingredients: [{ id: 8, count: 3 }, { id: 6, count: 2 }], requiresWorkbench: true }, // 石(3)+木材(2) -> 石のツルハシ
    { result: { id: 103, count: 1 }, ingredients: [{ id: 10, count: 3 }, { id: 6, count: 2 }], requiresWorkbench: true } // 鉄鉱石(3)+木材(2) -> 鉄のツルハシ
];
