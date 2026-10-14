/**
 * 禾禾小冒险 Web - 纯工具函数模块
 * 从 server/index.js 提取的纯函数，不依赖全局游戏配置或 fs/path
 */
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

// 中国时区 UTC+8，每天凌晨0点重置
const TZ_OFFSET = 8 * 3600000;

function uid() { return uuidv4().slice(0, 8); }

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function randFloat(min, max) { return Math.random() * (max - min) + min; }

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function weightedPick(items, weightFn) {
  const total = items.reduce((s, i) => s + weightFn(i), 0);
  let r = Math.random() * total, cum = 0;
  for (const item of items) { cum += weightFn(item); if (r <= cum) return item; }
  return items[items.length - 1];
}

// 解析掉落物字符串 "物品名*min-max" 或 "物品名*count"
function parseDropString(d) {
  if (typeof d === 'string') {
    const m = d.match(/^(.+?)\*(\d+)(?:-(\d+))?$/);
    if (m) return { name: m[1], count: m[3] ? rand(parseInt(m[2],10), parseInt(m[3],10)) : parseInt(m[2],10) };
    return { name: d, count: 1 };
  }
  const cnt = Array.isArray(d.count) ? rand(d.count[0], d.count[1]) : (d.count || rand(d.min || 1, d.max || 1));
  return { name: d.name, count: cnt };
}

// 将 ['铁矿x3','煤炭x2'] 转为 {铁矿:3,煤炭:2}
function materialArrayToObj(arr) {
  const obj = {};
  if (!Array.isArray(arr)) return obj;
  for (const s of arr) {
    const m = String(s).match(/^(.+?)x(\d+)$/);
    if (m) obj[m[1]] = parseInt(m[2], 10);
  }
  return obj;
}

function md5(s) { return crypto.createHash('md5').update(s).digest('hex'); }

function today() { var d = new Date(Date.now() + TZ_OFFSET); return d.toISOString().slice(0, 10); }

function now() { return Date.now(); }

function currentHour() { return Math.floor((Date.now() + TZ_OFFSET) / 3600000); }

function parseRange(v, def = [0, 0]) {
  if (Array.isArray(v)) return rand(v[0], v[1]);
  if (typeof v === 'number') return v;
  return def ? rand(def[0] || 0, def[1] || 0) : 0;
}

function itemCategory(name, itemsConfig) {
  const items = itemsConfig.items || {};
  return items[name]?.category || null;
}

// -- 出售定价系统（移植自原版 _build_sell_base_prices） --
function parseBasePrice(coinConfig) {
  if (typeof coinConfig === 'number') return Math.floor(coinConfig);
  if (Array.isArray(coinConfig) && coinConfig.length === 2) return Math.floor((coinConfig[0] + coinConfig[1]) / 2);
  return 0;
}

/**
 * 构建物品出售底价映射
 * @param {Object} configs - 包含所有必需的配置对象
 * @param {Object} configs.diaoyu - 钓鱼配置 (DIAOYU)
 * @param {Object} configs.items - 物品配置 (ITEMS)
 * @param {Object} configs.heimingdan - 黑名单配置 (HEIMINGDAN)
 * @param {Object} [configs.nongchang] - 农场配置 (NONGCHANG)
 * @param {Object} [configs.matfarm] - 材料农场配置 (MATFARM)
 * @param {Object} [configs.fruitree] - 果树配置 (FRUITREE)
 * @param {Object} [configs.shop] - 商城配置 (SHOP)
 * @param {Object} [configs.yugan] - 鱼竿配置 (YUGAN)
 * @param {Object} [configs.diaoyuRare] - 钓鱼稀有宝物配置
 */
function buildSellBasePrices(configs) {
  const { diaoyu: DIAOYU, items: ITEMS, nongchang: NONGCHANG, matfarm: MATFARM,
          fruitree: FRUITREE, shop: SHOP, yugan: YUGAN, diaoyuRare: DIAOYU_RARE } = configs || {};
  const prices = {};

  // 1. 钓鱼产物：鱼
  for (const f of (DIAOYU.fish || [])) {
    if (f.name) prices[f.name] = parseBasePrice(f.value);
  }
  // 2. 钓鱼垃圾
  for (const j of (DIAOYU.junk || [])) {
    if (j.name) prices[j.name] = parseBasePrice(j.value);
  }

  // 3. 普通农场产物
  for (const s of (NONGCHANG.seeds || [])) {
    if (s.harvest_product && s.harvest_value) prices[s.harvest_product] = parseBasePrice(s.harvest_value);
  }
  for (const a of (NONGCHANG.animals || [])) {
    if (a.harvest_product && a.harvest_value) prices[a.harvest_product] = parseBasePrice(a.harvest_value);
  }

  // 4. 材料农场产物
  if (MATFARM && MATFARM.seeds) {
    for (const s of MATFARM.seeds) {
      if (s.harvest_product && s.harvest_value && !(s.harvest_product in prices)) {
        prices[s.harvest_product] = parseBasePrice(s.harvest_value);
      }
    }
  }

  // 5. 果树产物
  if (FRUITREE && FRUITREE.trees) {
    for (const t of FRUITREE.trees) {
      if (t.harvest_product && t.harvest_value && !(t.harvest_product in prices)) {
        prices[t.harvest_product] = parseBasePrice(t.harvest_value);
      }
    }
  }

  // 6. 商城物品（回收价为基础价的 80%）
  const pool = SHOP.pool || [];
  for (const item of pool) {
    if (item.name) prices[item.name] = Math.floor((item.price || 0) * 0.8);
  }

  // 7. 材料商城的 base_price 直接作为收购价基准
  const matPool = (SHOP.material_shop && SHOP.material_shop.pool) || [];
  for (const item of matPool) {
    if (item.name && item.base_price && !(item.name in prices)) {
      prices[item.name] = item.base_price;
    }
  }

  // 8. 自动定价：从 items.json 按 base_price 或稀有度计算
  const rarityPrice = { 1: 8, 2: 20, 3: 50, 4: 120, 5: 300, 999: 800, 9999: 2500 };
  const items = ITEMS.items || {};
  for (const [name, info] of Object.entries(items)) {
    if (name in prices) continue;
    if (/\*\d/.test(name)) continue;
    const cat = info.category || '';
    if (['ore', 'material', 'special', 'product', 'fish'].includes(cat)) {
      const r = info.rarity || 1;
      prices[name] = info.base_price || rarityPrice[r] || (r * 5);
    }
  }

  // 9. 钓鱼稀有宝物
  if (DIAOYU_RARE && DIAOYU_RARE.rare_treasures) {
    for (const rt of DIAOYU_RARE.rare_treasures) {
      if (rt.name && !(rt.name in prices)) {
        prices[rt.name] = rt.value || 300;
      }
    }
  }

  // 10. 鱼竿回收价（购买价的 60%）
  for (const r of (YUGAN.rods || [])) {
    if (r.name && (r.price || 0) > 0 && !(r.name in prices)) {
      prices[r.name] = Math.floor(r.price * 0.6);
    }
  }

  return prices;
}

/**
 * 获取物品出售价格
 * @param {string} itemName - 物品名称
 * @param {Object} sellPriceCache - 通过 buildSellBasePrices 构建的价格缓存
 */
function getSellPrice(itemName, sellPriceCache) {
  if (itemName in sellPriceCache) return sellPriceCache[itemName];
  return 10; // 绝对兜底
}

// ===================== 经验/等级 =====================
function expForLevel(lv) { return Math.floor(75 * Math.pow(Math.max(lv, 1), 1.4)); }

function forgeExpNeeded(lv) { return Math.floor(100 * Math.pow(lv, 1.3)); }
function fishExpNeeded(lv) { return Math.floor(100 * Math.pow(lv, 1.3)); }
function farmExpNeeded(lv) { return Math.floor(100 * Math.pow(lv, 1.3)); }
function cookExpNeeded(lv) { return Math.floor(100 * Math.pow(lv, 1.3)); }
function alchemyExpNeeded(lv) { return Math.floor(100 * Math.pow(lv, 1.3)); }
function mineExpNeeded(lv) { return Math.floor(100 * Math.pow(lv, 1.3)); }

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

module.exports = {
  uid, rand, randFloat, pick, weightedPick,
  parseDropString, materialArrayToObj, md5,
  today, now, currentHour,
  parseRange, itemCategory, parseBasePrice,
  buildSellBasePrices, getSellPrice,
  expForLevel,
  forgeExpNeeded, fishExpNeeded, farmExpNeeded, cookExpNeeded, alchemyExpNeeded, mineExpNeeded,
  sleep
};
