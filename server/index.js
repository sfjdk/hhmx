/**
 * 禾禾小冒险 Web - 服务器入口 v2
 * 计数模式背包 + 速率限制 + 萝莉领养/帮助 + 独立市场页面
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
// 📧 邮件发送配置（凭据通过环境变量配置，避免硬编码在源码中）
const SMTP_USER = process.env.SMTP_USER || 'hhmx223@163.com';
const SMTP_PASS = process.env.SMTP_PASS || '';
// 启动时检查 SMTP 配置
if (!SMTP_PASS) {
  console.warn('⚠️  SMTP_PASS 环境变量未设置！邮件验证码将无法发送。');
  console.warn('   请在宝塔面板 → 网站 → Node项目 → 设置 → 环境变量中设置 SMTP_PASS');
  console.warn('   SMTP_PASS 为 163 邮箱的客户端授权码（非登录密码），需在 mail.163.com 生成');
}
const mailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.163.com',
  port: parseInt(process.env.SMTP_PORT, 10) || 465,
  secure: true,
  auth: { user: SMTP_USER, pass: SMTP_PASS }
});
// 启动时验证 SMTP 连接
if (SMTP_PASS) {
  mailTransporter.verify(function(err, success) {
    if (err) console.error('📧 SMTP 连接验证失败:', err.message);
    else console.log('📧 SMTP 邮件服务就绪 ✓');
  });
}
function sendVerificationEmail(to, username, code) {
  if (!SMTP_PASS) {
    console.error('📧 邮件未发送: SMTP_PASS 未配置');
    return Promise.resolve(null);
  }
  return mailTransporter.sendMail({
    from: '"禾禾小冒险" <hhmx223@163.com>',
    to: to,
    subject: '🔑 禾禾小冒险 - 邮箱验证码',
    html: '<div style="background:#faf6ef;padding:30px;border-radius:12px;border:2px solid #d4c4a8;font-family:sans-serif">'
      + '<h2 style="color:#5d4037">🏚️ 禾禾小冒险</h2>'
      + '<p style="font-size:16px;color:#3e2f1c">你好 <b>' + username + '</b>，欢迎注册！</p>'
      + '<p style="font-size:16px;color:#3e2f1c">你的验证码是：</p>'
      + '<div style="font-size:36px;font-weight:bold;letter-spacing:8px;text-align:center;color:#8e44ad;padding:20px;background:#fdfbf7;border:1px solid #e8dcc8;border-radius:8px;margin:16px 0">' + code + '</div>'
      + '<p style="font-size:14px;color:#6b5d4f">请在游戏中输入此验证码完成邮箱验证。</p>'
      + '<p style="font-size:12px;color:#8d6e63">如果这不是你本人的操作，请忽略此邮件。</p>'
      + '</div>'
  }).catch(e => { console.error('📧 邮件发送失败:', e.message); return null; });
}
const { v4: uuidv4 } = require('uuid');

// -- 模块化加载：将配置/工具/数据/中间件提取到独立模块 --
const cfg = require('./lib/config');
const utils = require('./lib/utils');
const data = require('./lib/data');
const mw = require('./lib/middleware');
// 解构别名（保持与遗留代码兼容，逐步迁移）
const { uid, rand, randFloat, pick, weightedPick, parseDropString, materialArrayToObj, md5, today, now, currentHour, parseRange, expForLevel, forgeExpNeeded, fishExpNeeded, farmExpNeeded, cookExpNeeded, alchemyExpNeeded, mineExpNeeded } = utils;
const { ITEMS, TITLES, MAOXIAN, MONSTERS, SHOP, SIGNIN, SHENMI, INITIAL, HEIMINGDAN, NONGCHANG, MATFARM, FRUITREE, DIAOYU, YUER, YUGAN, DIAOYU_RARE, DUANZAO, JINENG, FOOD, BOSS, LOLI, SYNTHESIS, EVENTS, PROFESSIONS, REGIONS, QUESTS, ANNOUNCEMENTS, GEMS, FISHING_AREAS, WEATHER_CFG, SEASON_CFG, RUINS_CFG, SETS_CFG, FISHING_AREA_DETAILS, MAX_LEVEL, TZ_OFFSET, PENDING_EXPIRE_MS, RATE_LIMITS, DAILY_LIMITS, MONSTER_SPECIALS, regionToFishingArea } = cfg;
const { withFileLock, loadUser, saveUser, saveUserByObj, userPath, userExists, isValidToken, allUsers, findUserByUsername, findUserToken, loadMarket, saveMarket, loadMarketHistory, saveMarketHistory, loadForge, saveForge, loadBossData, saveBossData, cleanDefeatedBosses, getAliveBossCount, DATA_DIR, USERS_DIR, MARKET_FILE, BOSS_FILE, FORGE_FILE } = data;
// loadChatHistory/saveChatHistory 留在 index.js 中（签名不同）
const { authMiddleware, sanitizeUser, checkAuthRate } = mw;

const app = express();
app.set('trust proxy', true); // 信任 nginx 反向代理头
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  // 连接稳定性配置
  pingTimeout: 60000,       // 60s 无响应视为断线
  pingInterval: 25000,      // 25s 心跳间隔
  connectTimeout: 45000,    // 45s 连接超时
  // 传输层：同时支持长轮询(polling)和 WebSocket
  transports: ['websocket', 'polling'],
  allowEIO3: true,           // 兼容旧版客户端
  maxHttpBufferSize: 1e6,   // 1MB 消息上限
});

// -- 服务器启动时间戳，用于前端资源缓存破坏 --
const SERVER_START = Date.now();

// -- 首页：注入缓存破坏参数，确保每次服务器重启前端加载最新 JS --
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, '..', 'public', 'index.html');
  let html = fs.readFileSync(indexPath, 'utf-8');
  html = html.replace('src="/js/app.js"', `src="/js/app.js?v=${SERVER_START}"`);
  // 注入 __SERVER_START 供客户端动态加载 socket.io.js 时做缓存破坏
  html = html.replace('<script src="/js/app.js"', `<script>window.__SERVER_START=${SERVER_START};</script><script src="/js/app.js"`);
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.type('html').send(html);
});

// -- 规范域名重定向：防止 IP / 域名多入口导致 localStorage 数据不同步 --
// 设置环境变量 CANONICAL_HOST 即可启用，例如: CANONICAL_HOST=game.example.com:3456
const CANONICAL_HOST = process.env.CANONICAL_HOST || '';
if (CANONICAL_HOST) {
  app.use((req, res, next) => {
    const host = req.get('Host') || '';
    // 仅对 HTML 页面请求重定向，静态资源（js/css/png 等）和 API 请求不重定向
    const ext = require('path').extname(req.path).toLowerCase();
    const isStaticFile = !!ext && ['.js','.css','.png','.jpg','.gif','.svg','.ico','.woff','.woff2','.webp','.mp4','.webm'].includes(ext);
    const isApiOrSocket = req.path.startsWith('/api') || req.path.startsWith('/socket.io');
    if (!isStaticFile && !isApiOrSocket && host && host !== CANONICAL_HOST) {
      // 优先使用 X-Forwarded-Proto（Nginx 代理设置），其次 trust proxy 的 req.protocol
      const protocol = req.get('X-Forwarded-Proto') || req.protocol || 'http';
      const redirectUrl = protocol + '://' + CANONICAL_HOST + req.originalUrl;
      return res.redirect(301, redirectUrl);
    }
    next();
  });
}

// JSON 解析跳过 socket.io 路径，避免干扰 Socket.IO 长轮询握手
app.use((req, res, next) => {
  if (req.path.startsWith('/socket.io')) return next();
  express.json({ limit: '5mb' })(req, res, next);
});

// -- 防缓存中间件：API 响应禁止缓存，防止反向代理/CDN 缓存用户数据 --
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// -- 静态资源：HTML 禁止缓存，其他资源可短期缓存 --
app.use(express.static(path.join(__dirname, '..', 'public'), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
    } else if (filePath.match(/\.(js|css|png|jpg|gif|svg|ico|woff2?)$/)) {
      res.set('Cache-Control', 'public, max-age=60');
    }
  }
}));

// ===================== 配置加载（已移至 lib/config.js） =====================
// loadConfig 原地保留以供运行时动态重载使用
function loadConfig(name) {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'config', name), 'utf-8')); }
  catch (e) { return {}; }
}

// 冒险中钓鱼的共享逻辑（冒险事件和批量钓鱼按钮共用）
function doAdventureFishing(user, region, subRegion, event) {
  const fr = checkRateLimit(user, 'fishing');
  if (!fr.allowed) return { type: 'fishing', text: '钓鱼次数已用完，你放弃了钓鱼...', skipped: true };
  addRateCount(user, 'fishing');
  const rodName = user.equipped_rod || '竹竿';
  const rod = (YUGAN.rods || []).find(r => r.name === rodName) || { fail_reduction: 0, rare_bonus: 0 };
  // 优先使用子区域的 fishing_area
  let areaId;
  if (subRegion && subRegion.fishing_area) {
    areaId = subRegion.fishing_area;
  } else {
    areaId = regionToFishingArea(region ? region.id : null);
  }
  const area = (FISHING_AREAS.areas || []).find(a => a.id === areaId) || (FISHING_AREAS.areas || [])[0] || {};
  // 消耗鱼饵
  let autoBait = user.equipped_bait;
  if (autoBait && hasInv(user, autoBait)) { remInv(user, autoBait, 1); }
  else if (autoBait && (user.bait_data || {})[autoBait]) {
    user.bait_data[autoBait]--; if (user.bait_data[autoBait] <= 0) delete user.bait_data[autoBait];
  }
  // 失败率 = 基础 - 鱼竿 - 鱼饵 + 区域修正 - 渔夫职业 - 季节加成
  const profBonus = getProfessionBonus(user);
  const season = getSeasonState();
  let failChance = (DIAOYU.fail_chance || 0.25) - (rod.fail_reduction || 0) + (area.fail_modifier || 0);
  if (autoBait) {
    const bait = (YUER.baits || []).find(b => b.name === autoBait);
    if (bait) failChance = Math.max(0.01, failChance - (bait.fail_reduction || 0));
  }
  failChance -= (profBonus.fishing_bonus || 0);
  failChance -= (season.season_fish_bonus || 0);
  if (season.season_effects) {
    failChance -= (season.season_effects.fish_bonus || 0);
  }
  // 🎪 活动钓鱼加成
  const evtFishState = getEventState();
  if (evtFishState.is_active && evtFishState.cfg && evtFishState.cfg.effects && evtFishState.cfg.effects.fishing_rate_bonus) {
    failChance -= evtFishState.cfg.effects.fishing_rate_bonus;
  }
  failChance = Math.max(0.02, failChance);
  if (Math.random() < failChance) {
    return { type: 'fishing', text: '鱼脱钩了...', fail: true };
  }
  // 鱼池构建 + 季节过滤
  const areaFishNames = area.fish_pool || [];
  let fishPool = (DIAOYU.fish || []).filter(f => areaFishNames.includes(f.name));
  if (fishPool.length === 0) fishPool = (DIAOYU.fish || []).filter(f => f.rarity > 0);
  // 移除不在季节的鱼
  const offFish = getOffSeasonFish(season.season_id);
  if (offFish.length > 0) fishPool = fishPool.filter(f => !offFish.includes(f.name));
  if (fishPool.length === 0) fishPool = (DIAOYU.fish || []).filter(f => f.rarity > 0 && !offFish.includes(f.name));
  // 稀有加成 = 鱼竿 + 事件 + 职业 + 季节
  const evtWaterBonus1 = (function(){ var es=getEventState(); return (es.is_active&&es.cfg&&es.cfg.effects&&es.cfg.effects.water_drop_bonus)?es.cfg.effects.water_drop_bonus:0; })();
  let rareBonus = (rod.rare_bonus || 0) + ((event && event.rare_bonus) || 0) + (profBonus.rare_fish_bonus || 0) + evtWaterBonus1;
  if (season.season_effects) rareBonus += (season.season_effects.rare_bonus || 0);
  const seasonalFish = getSeasonalFish(season.season_id);
  const fish = weightedPick(fishPool, f => {
    let w = (DIAOYU.rarity_weights || { 1: 43, 2: 25, 3: 20, 4: 11, 999: 1 })[String(f.rarity)] || 1;
    if (f.rarity >= 3) w *= (1 + rareBonus);
    if (seasonalFish.includes(f.name)) w *= 2; // 季节鱼权重翻倍
    return w;
  });
  if (!fish) return { type: 'fishing', text: '鱼群都跑光了...', fail: true };
  addInv(user, fish.name);
  const fishExp = addExp(user, fish.exp || 10);
  const eventCoins = (event && event.coins) ? rand(event.coins[0], event.coins[1]) : 0;
  if (eventCoins) user.coins = (user.coins || 0) + eventCoins;
  return { type: 'fishing', text: (fish.text || ('钓到了' + fish.name + '！')), name: fish.name, rarity: fish.rarity, fish: true, coins: eventCoins, exp: fishExp };
}

// rarity_variants: { "1": {chance, stat_mult, special_count}, ... }
//   稀有度差距主要体现在副词条数量上，stat_mult 只做微调
function dropAdventureWeapon(user, weaponDef, forceRarity, weaponLevel) {
  const forge = loadForge();
  if (!forge[user.id]) forge[user.id] = [];
  const wid = uid();
  const eqType = weaponDef.type || 'weapon';
  const wLevel = weaponLevel || weaponDef._level || 1;
  const variance = weaponDef.stat_variance || 0.12;

  // 稀有度变体系统
  let finalRarity = weaponDef.rarity;
  let statMult = 1.0;
  let specialCountRange = [0, 1]; // [min, max] 额外副词条数
  if (weaponDef.rarity_variants && !forceRarity) {
    const variants = weaponDef.rarity_variants;
    const totalWeight = Object.values(variants).reduce((s, v) => s + (v.chance || 0), 0);
    let roll = Math.random() * totalWeight;
    for (const [r, v] of Object.entries(variants)) {
      roll -= (v.chance || 0);
      if (roll <= 0) {
        finalRarity = parseInt(r);
        statMult = v.stat_mult || 1.0;
        specialCountRange = v.special_count || [0, 1];
        break;
      }
    }
  } else if (forceRarity) {
    finalRarity = forceRarity;
  }

  // 属性浮动 (±variance, ×稀有度微调)
  const stats = {};
  for (const [k, v] of Object.entries(weaponDef.stats)) {
    const pct = 1 + (Math.random() * 2 - 1) * variance;
    stats[k] = Math.max(1, Math.round(v * pct * statMult));
  }

  // 主特殊属性
  const special = {};
  if (weaponDef.special) {
    for (const [k, v] of Object.entries(weaponDef.special)) {
      special[k] = v >= 1 ? Math.round(v * (0.85 + Math.random() * 0.3)) : +(v * (0.85 + Math.random() * 0.3)).toFixed(3);
    }
  }

  // 🏷️ 副词条：稀有度越高，抽得越多
  if (weaponDef.special_pool && weaponDef.special_pool.length > 0) {
    const pool = [...weaponDef.special_pool];
    const [scMin, scMax] = specialCountRange;
    const count = scMin + Math.floor(Math.random() * (scMax - scMin + 1));
    for (let i = 0; i < count && pool.length > 0; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      const [key, baseVal] = pool.splice(idx, 1)[0];
      if (!special[key]) {
        special[key] = baseVal >= 1 ? Math.round(baseVal * (0.8 + Math.random() * 0.4)) : +(baseVal * (0.8 + Math.random() * 0.4)).toFixed(3);
      }
    }
  }

  const weapon = {
    id: wid, name: weaponDef.name, type: eqType,
    rarity: finalRarity,
    rarity_name: (DUANZAO.rarity_names || {})[String(finalRarity)] || '',
    level: wLevel,
    stats, special_attrs: special,
    strengthen_count: 0, max_sockets: 3, sockets: [],
    adventure_drop: true, created_at: new Date().toISOString()
  };
  forge[user.id].push(weapon);
  saveForge(forge);
  return weapon;
}
function itemCategory(name) {
  const items = ITEMS.items || {};
  return items[name]?.category || null;
}

// -- 出售定价系统（移植自原版 _build_sell_base_prices） --
function parseBasePrice(coinConfig) {
  if (typeof coinConfig === 'number') return Math.floor(coinConfig);
  if (Array.isArray(coinConfig) && coinConfig.length === 2) return Math.floor((coinConfig[0] + coinConfig[1]) / 2);
  return 0;
}

let _sellPriceCache = null;
let _sellPriceCacheTime = 0;
function buildSellBasePrices() {
  if (_sellPriceCache && (Date.now() - _sellPriceCacheTime < 300000)) return _sellPriceCache; // 5分钟过期
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
  const DIAOYU_RARE = loadConfig('fishing/diaoyu_rare.json');
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

  _sellPriceCache = prices; _sellPriceCacheTime = Date.now();
  return prices;
}

// 怪物-区域-掉落缓存（图鉴用，启动时预计算）
const _monsterHandbookCache = (() => {
  const monsterRegions = {};
  for (const region of (REGIONS.regions || [])) {
    for (const eventName of (region.event_pool || [])) {
      if (!monsterRegions[eventName]) monsterRegions[eventName] = [];
      if (!monsterRegions[eventName].find(r => r.id === region.id)) {
        monsterRegions[eventName].push({ id: region.id, name: region.name, icon: region.icon || '📍' });
      }
    }
  }
  const eventDrops = {};
  for (const evt of (MAOXIAN.events || [])) {
    if (evt.name) {
      eventDrops[evt.name] = {
        type: evt.type || 'combat',
        drops: evt.drops || [],
        rare_drops: evt.rare_drops || [],
        rare_drop_chance: evt.rare_drop_chance || 0
      };
    }
  }
  return { monsterRegions, eventDrops };
})();

// 获取单个物品的收购价
function getSellPrice(itemName) {
  const prices = buildSellBasePrices();
  if (itemName in prices) return prices[itemName];
  // 兜底：按稀有度定价
  const items = ITEMS.items || {};
  const info = items[itemName];
  if (info) {
    const r = info.rarity || 1;
    const rarityPrice = { 1: 8, 2: 20, 3: 50, 4: 120, 5: 300, 999: 800, 9999: 2500 };
    return rarityPrice[r] || (r * 5);
  }
  return 10; // 绝对兜底
}

// ===================== 计数模式背包 =====================
function addInv(user, item, count = 1) {
  // 💎 宝石类物品路由到宝石系统
  const info = (ITEMS.items || {})[item];
  if (info && info.category === 'gem') {
    const gemRarity = info.rarity || 1;
    for (let i = 0; i < count; i++) {
      dropGemInRange(user, Math.max(1, gemRarity - 1), Math.min(999, gemRarity + 2));
    }
    return;
  }
  if (!user.inventory) user.inventory = {};
  ensureInvCounts(user);
  user.inventory[item] = (user.inventory[item] || 0) + count;
}
function remInv(user, item, count = 1) {
  if (!user.inventory) return false;
  ensureInvCounts(user);
  if ((user.inventory[item] || 0) < count) return false;
  user.inventory[item] = (user.inventory[item] || 0) - count;
  if (user.inventory[item] <= 0) delete user.inventory[item];
  return true;
}
function hasInv(user, item, count = 1) {
  if (!user.inventory) return false;
  ensureInvCounts(user);
  return (user.inventory[item] || 0) >= count;
}
function countInv(user, item) {
  if (!user.inventory) return 0;
  ensureInvCounts(user);
  return user.inventory[item] || 0;
}
function totalInv(user) {
  if (!user.inventory) return 0;
  ensureInvCounts(user);
  return Object.values(user.inventory).reduce((a, b) => a + b, 0);
}
function listInv(user) {
  if (!user.inventory) return {};
  ensureInvCounts(user);
  return { ...user.inventory };
}
function ensureInvCounts(user) { if (Array.isArray(user.inventory)) { const c = {}; for (const i of user.inventory) { const m = i.match(/^(.+?)\*(\d+)$/); if (m) { c[m[1]] = (c[m[1]] || 0) + parseInt(m[2], 10); } else { c[i] = (c[i] || 0) + 1; } } user.inventory = c; } }

// 生成神秘商人商品（随机选取 + 价格解析）
function generateMerchantItems() {
  const pool = [...(SHENMI.items || [])];
  // 随机打乱
  for (let i = pool.length - 1; i > 0; i--) { const j = rand(0, i); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const count = rand(2, 4);
  const selected = pool.slice(0, Math.min(count, pool.length));
  // 解析价格为具体数值
  return selected.map(item => ({
    name: item.name,
    price: parseRange(item.price, [50, 200]),
    rarity: item.rarity || 1,
    description: item.description || ''
  }));
}

// 清理过期待处理（5分钟）
// PENDING_EXPIRE_MS = 5 * 60 * 1000 （已移至 lib/config.js）
function cleanPendingExpired(user) {
  const cutoff = now() - PENDING_EXPIRE_MS;
  if (user.pending_lolis) user.pending_lolis = user.pending_lolis.filter(l => (l.added_at || 0) >= cutoff);
  if (user.pending_merchant) user.pending_merchant = user.pending_merchant.filter(m => (m.added_at || 0) >= cutoff);
  if (user.pending_goblin_merchant) user.pending_goblin_merchant = user.pending_goblin_merchant.filter(m => (m.added_at || 0) >= cutoff);
}

// ===================== 速率限制 =====================
// RATE_LIMITS / DAILY_LIMITS （已移至 lib/config.js）
function checkRateLimit(user, type) {
  const TEST_LIMITS = { adventure: 1000000, fishing: 10000000, forge_strengthen: 1000000 };
  const isTest = !!(user.tester);
  const max = isTest ? (TEST_LIMITS[type] || 1000000) : (RATE_LIMITS[type] || 999);
  const hour = currentHour();
  if (!user.rate_limits) user.rate_limits = {};
  if (!user.rate_limits[type]) user.rate_limits[type] = { hour: 0, count: 0 };
  if (user.rate_limits[type].hour !== hour) { user.rate_limits[type] = { hour, count: 0 }; }
  return { allowed: user.rate_limits[type].count < max, used: user.rate_limits[type].count, max };
}
function addRateCount(user, type) {
  const hour = currentHour();
  if (!user.rate_limits) user.rate_limits = {};
  if (!user.rate_limits[type]) user.rate_limits[type] = { hour: 0, count: 0 };
  if (user.rate_limits[type].hour !== hour) { user.rate_limits[type] = { hour, count: 0 }; }
  user.rate_limits[type].count++;
  user.rate_limits[type].hour = hour;
}
function checkDailyLimit(user, type) {
  const max = DAILY_LIMITS[type] || 999;
  const day = today();
  if (!user.daily_limits) user.daily_limits = {};
  if (!user.daily_limits[type]) user.daily_limits[type] = { day, count: 0 };
  if (user.daily_limits[type].day !== day) { user.daily_limits[type] = { day, count: 0 }; }
  return { allowed: user.daily_limits[type].count < max, used: user.daily_limits[type].count, max };
}
function addDailyCount(user, type) {
  const day = today();
  if (!user.daily_limits) user.daily_limits = {};
  if (!user.daily_limits[type]) user.daily_limits[type] = { day, count: 0 };
  if (user.daily_limits[type].day !== day) { user.daily_limits[type] = { day, count: 0 }; }
  user.daily_limits[type].count++;
  user.daily_limits[type].day = day;
}


// ===================== HP 系统 =====================
// 确保 current_hp 已初始化并应用自然恢复
function ensureHp(user) {
  const stats = getPlayerStats(user);
  const maxHp = stats.hp;
  if (user.current_hp === undefined || user.current_hp === null) {
    user.current_hp = maxHp;
    user._hp_last_regen = Date.now();
    return;
  }
  if (user.current_hp <= 0) {
    // 新账号或首次登录：给予满血
    if (!user._hp_last_regen) {
      user.current_hp = maxHp;
      user._hp_last_regen = Date.now();
    } else {
      // 体力为0时不再自动回满，依靠自然恢复或生命药剂
      user.current_hp = 0;
    }
  }
  // 自然恢复：每30秒恢复 maxHp 的 2%（最少1点）
  const last = user._hp_last_regen || Date.now();
  const elapsed = Date.now() - last;
  if (elapsed > 30000) {
    const regenPer30s = Math.max(1, Math.floor(maxHp * 0.02));
    const ticks = Math.floor(elapsed / 30000);
    const regen = regenPer30s * ticks;
    user.current_hp = Math.min(maxHp, user.current_hp + regen);
    user._hp_last_regen = Date.now();
  }
  // 上限封顶
  if (user.current_hp > maxHp) user.current_hp = maxHp;
}
// 自动使用血药：根据设置自动消耗背包中的生命药剂，喝到满血为止
function autoUseHpPotion(user) {
  const mode = user.auto_use_hp || 'none';
  if (mode === 'none') return false;
  const stats = getPlayerStats(user);
  const maxHp = stats.hp;
  if (user.current_hp >= maxHp) return false;
  // 根据模式选择药剂（按优先级排列）
  const potions = [];
  if (mode === 'any' || mode === 'big') potions.push({ name: '大生命药剂', pct: 0.6 });
  if (mode === 'any' || mode === 'medium') {
    const potionBonus = ((user.profession_stats || {}).potion_bonus || 0) + ((user.sub_profession_stats || {}).potion_bonus || 0);
    potions.push({ name: '治疗药水', pct: 0.4 * (1 + potionBonus) });
  }
  if (mode === 'any' || mode === 'small') potions.push({ name: '生命药剂', pct: 0.3 });
  if (mode === 'any' || mode === 'basic') potions.push({ name: '简易的生命药水', pct: 0.15 });
  let used = false;
  while (user.current_hp < maxHp) {
    let consumed = false;
    for (const p of potions) {
      if (hasInv(user, p.name, 1)) {
        remInv(user, p.name, 1);
        user.current_hp = Math.min(maxHp, (user.current_hp != null ? user.current_hp : 0) + Math.floor(maxHp * p.pct));
        consumed = true;
        used = true;
        break; // 用了1瓶，重新检查是否满血，不满继续喝
      }
    }
    if (!consumed) break; // 没有药了，退出循环
  }
  return used;
}

// -- 依赖注入：将本地函数注入到 lib/data 模块 --
data.setEnsureInvCounts(ensureInvCounts);
data.setEnsureHp(ensureHp);
data.setBossConfig(cfg.BOSS);

function createUser(username, password, email, verificationCode) {
  const token = uid();
  const hash = bcrypt.hashSync(password, 10);
  const init = INITIAL;
  const inv = {};
  for (const i of (init.items || [])) inv[i] = (inv[i] || 0) + 1;
  const user = {
    id: token, username, password: hash,
    email: email || '', email_verified: false, email_code: verificationCode || '',
    coins: init.coins || 100,
    last_signin: null, signin_streak: 0,
    adventure_count: 0,
    choice_events_enabled: true,
    inventory: inv,
    current_hp: 0,
    exp: 0, level: 1, skill_points: init.skill_points || 10,
    equipment: { weapon: '', helmet: '', armor: '', boots: '', leggings: '', accessory: '' },
    skills: {}, forge_level: 1, forge_exp: 0,
    monster_kills: {}, titles: ['新来的'], equipped_title: '新来的',
    auto_use_hp: 'none',
    total_harvest_count: 0, fish_collection: {}, fish_tank: [], total_fish_count: 0,
    total_monster_kills: 0, boss_kills: 0,
    equipped_rod: YUGAN.default_rod || '竹竿',
    equipped_bait: null, bait_data: {}, food_buffs: [], fishing_area: 'creek',
    lolis: [], married_loli: null,
    sell_blacklist: HEIMINGDAN.categories || [],
    item_blacklist: [...(HEIMINGDAN.protected_items || [])],
    farms: { plants: [], animals: [], material_plants: [], fruit_trees: [] },
    max_plots: NONGCHANG.max_plots_default || 3, max_pens: NONGCHANG.max_pens_default || 2,
    max_material_plots: 2, max_fruit_trees: 1, auto_replant: true,
    purchased_once: [], event_currencies: {}, event_converted: [], event_shop_purchases: {},
    pending_merchant: [], pending_lolis: [],
    sub_professions: {},
    sub_profession_stats: {},
    sub_profession_items_received: {},
    adv_gear_durability: 0,
    ruins_explored: {},
    ruins_current: null,
    learned_blueprints: [],
    friends: [],
    friend_requests: [],
    solar_terms_collected: [],
    created_at: new Date().toISOString(),
  };
  saveUser(token, user);
  return { token, user };
}


// ===================== 战斗系统 =====================
function calcPower(hp, attack, speed, atkSpeed, defense, dodge = 0, special = null) {
  let p = hp * 0.5 + attack * 2 + speed * 1.5 + atkSpeed * 1.5 + defense + dodge * 3;
  if (special) { p += (special.crit_rate || 0) * 500 + (special.crit_dmg || 0) * 300 + (special.lifesteal || 0) * 300 + (special.dmg_reduce || 0) * 400 + (special.counter || 0) * 300 + (special.extra_atk || 0) * 200 + (special.fire_damage || 0) * 150; }
  return Math.floor(p);
}
// --- 旧版伤害公式（保留兼容）---
function calcDmgReduction(def, atk) { const r = atk > 0 ? def / atk : 0; return r / (r + 1.5); }
function calcDodgeChance(pSpd, mSpd) {
  if (pSpd <= 0 || mSpd <= 0) return 0;
  const ratio = pSpd / mSpd;
  return Math.min(Math.max((ratio - 1) * 0.25, 0), 0.40);
}

// --- HeroCore 7 阶段伤害管道 ---
// Stage 1: 基础伤害   Stage 2: 防御减免   Stage 3: 暴击判定
// Stage 4: 特殊伤害   Stage 5: 减伤       Stage 6: 吸血/反击
// Stage 7: 保底+上限 → 应用伤害
function calcDamagePipeline(atkVal, defVal, critChance, critDmgBonus, fireDmg, targetMaxHP, isPlayer) {
  // Stage 1: 基础伤害
  let dmg = Math.floor(atkVal * 1.0);

  // Stage 2: 防御减免（对数衰减：100防御=50%减伤，200=67%，300=75%）
  const defReduction = defVal / (defVal + 100);
  dmg = Math.floor(dmg * (1 - defReduction));

  // Stage 3: 暴击判定
  let isCrit = false;
  if (Math.random() < Math.min(critChance, 0.95)) {
    const critMult = 1.5 + (isPlayer ? critDmgBonus : 0);
    dmg = Math.floor(dmg * critMult);
    isCrit = true;
  }

  // Stage 4: 特殊伤害加成（火焰伤害等）
  if (isPlayer && fireDmg > 0) dmg += fireDmg;

  // Stage 5-6: 减伤/吸血/反击由外部调用者逐层处理（怪物特殊技能、buff减伤、反击等）

  // Stage 7: 保底 1 点 + 单次上限 20% 目标最大血量
  dmg = Math.max(1, Math.min(dmg, Math.floor(targetMaxHP * 0.2)));

  return { damage: dmg, isCrit };
}
// 额外回合：基于攻速百分比差
function calcExtraTurns(pAspd, mAspd) {
  if (pAspd <= 0 || mAspd <= 0) return 0;
  const ratio = pAspd / mAspd;
  return Math.min(Math.max(Math.floor(ratio * 2 - 1.5), 0), 3);
}
// 暴击率：基础5% + 速度百分比差
function calcCritRate(pSpd, mSpd, baseRate) {
  if (pSpd <= 0 || mSpd <= 0) return baseRate || 0.05;
  const ratio = pSpd / mSpd;
  return Math.min((baseRate || 0.05) + Math.max((ratio - 1) * 0.15, 0), 0.50);
}
function calcDamage(atk, def) { return Math.max(Math.floor(atk * (1 - calcDmgReduction(def, atk))), 1); }

// MONSTER_SPECIALS 已移至 lib/config.js

function getPlayerStats(user) {
  const sk = JINENG;
  const forge = loadForge();
  const userWeapons = forge[user.id] || [];
  const forgeById = {};
  const forgeByName = {};
  for (const w of userWeapons) { forgeById[w.id] = w; forgeByName[w.name] = w; }

  const skillBase = (id, fallback) => {
    for (const s of (sk.skills || [])) { if (s.id === id) return (s.base != null ? s.base : fallback); }
    return fallback;
  };
  const skillBonus = (id) => {
    const lv = (user.skills || {})[id] || 0;
    for (const s of (sk.skills || [])) { if (s.id === id) return lv * (s.effect_per_level || 0); }
    return 0;
  };

  let hp = skillBase('hp', 100) + skillBonus('hp');
  let atk = skillBase('attack', 10) + skillBonus('attack');
  let spd = skillBase('speed', 0) + skillBonus('speed');
  let aspd = skillBase('attack_speed', 0) + skillBonus('attack_speed');
  let defense = skillBase('defense', 0) + skillBonus('defense');
  // 技能战斗属性
  const skillCritRate = (user.skills || {}).crit_rate ? ((user.skills || {}).crit_rate || 0) * 0.005 : 0;
  const skillDodgeRate = (user.skills || {}).dodge_rate ? ((user.skills || {}).dodge_rate || 0) * 0.004 : 0;
  const skillTenacity = (user.skills || {}).tenacity ? ((user.skills || {}).tenacity || 0) * 0.008 : 0;

  // 食物 Buff 累积的战斗特殊属性（自动过滤过期，使用副本避免副作用）
  const foodSpecial = { crit_rate: 0, crit_dmg: 0, lifesteal: 0, dmg_reduce: 0, counter: 0, extra_atk: 0, dodge: 0 };
  const nowSec = Math.floor(Date.now() / 1000);
  const activeBuffs = (user.food_buffs || []).filter(b => (b.ate_at || 0) + (b.duration || 0) > nowSec);
  if (activeBuffs.length !== (user.food_buffs || []).length) user.food_buffs = activeBuffs;
  for (const b of activeBuffs) {
    const stat = b.stat, val = b.value || 0;
    if (stat === 'all') { atk += val; defense += val; spd += val; aspd += val; }
    else if (stat === 'attack') atk += val;
    else if (stat === 'defense') defense += val;
    else if (stat === 'speed') spd += val;
    else if (stat === 'attack_speed') aspd += val;
    else if (stat === 'hp') hp += val;
    else if (foodSpecial.hasOwnProperty(stat)) foodSpecial[stat] += val;
  }

  // 🏅 称号属性加成
  const titles = TITLES.titles || {};
  const equippedTitle = user.equipped_title || '';
  const titleInfo = titles[equippedTitle] || {};
  const titleStats = titleInfo.stats || {};
  hp += (titleStats.hp || 0);
  atk += (titleStats.attack || 0);
  spd += (titleStats.speed || 0);
  aspd += (titleStats.attack_speed || 0);
  defense += (titleStats.defense || 0);
  const titleDodge = titleStats.dodge || 0;
  // 称号特殊属性
  const titleCritRate = titleStats.crit_rate || 0;
  const titleCritDmg = titleStats.crit_dmg || 0;
  const titleLifesteal = titleStats.lifesteal || 0;
  const titleDmgReduce = titleStats.dmg_reduce || 0;
  const titleCounter = titleStats.counter || 0;
  const titleExtraAtk = titleStats.extra_atk || 0;

  // 职业专属装备属性（主职业切换时清除）
  const profStats = user.profession_stats || {};
  // 副职业装备属性（主职业切换不清除）
  const subProfStats = user.sub_profession_stats || {};
  hp += (profStats.hp || 0) + (subProfStats.hp || 0);
  atk += (profStats.attack || 0) + (subProfStats.attack || 0);
  spd += (profStats.speed || 0) + (subProfStats.speed || 0);
  aspd += (profStats.attack_speed || 0) + (subProfStats.attack_speed || 0);
  defense += (profStats.defense || 0) + (subProfStats.defense || 0);
  const profDodge = (profStats.dodge || 0) + (subProfStats.dodge || 0);

  // 永久属性加成（来自职业物品等）
  const ps = user.perm_stats || {};
  hp += (ps.hp || 0);
  atk += (ps.attack || 0);
  spd += (ps.speed || 0);
  aspd += (ps.attack_speed || 0);
  defense += (ps.defense || 0);
  // crit_rate, crit_dmg, dodge, lifesteal 等战斗属性也支持永久加成
  const permCritRate = (ps.crit_rate || 0) + titleCritRate;
  const permCritDmg = (ps.crit_dmg || 0) + titleCritDmg;
  const permLifesteal = (ps.lifesteal || 0) + titleLifesteal;

  const slotBonus = { weapon: { attack: 5 }, helmet: { hp: 3 }, armor: { defense: 5 }, boots: { speed: 3 }, leggings: { attack_speed: 2 }, accessory: { dodge: 2 } };
  const equipStats = { attack: 0, defense: 0, speed: 0, attack_speed: 0, dodge: 0, hp: 0 };
  const weaponSpecial = {};

  for (const [slot, itemRef] of Object.entries(user.equipment || {})) {
    if (!itemRef) continue;
    let w = forgeById[itemRef] || forgeByName[itemRef];
    if (w) {
      // 🌱 活动武器随等级成长：基于base_stats × 当前等级（使用副本，不修改原始锻造缓存）
      const curLv = user.level || 1;
      let wStats = w.stats || {};
      let wSpecial = w.special_attrs || {};
      if (w.level_scale && w.base_stats) {
        wStats = {};
        for (var _k in w.base_stats) { wStats[_k] = Math.floor(w.base_stats[_k] * curLv); }
        // 特殊属性保留进化后的值，叠加等级加成（使用副本）
        wSpecial = { ...(w.special_attrs || {}) };
        if (!w._base_special) w._base_special = JSON.parse(JSON.stringify(w.special_attrs || {}));
        for (var _a in w._base_special) {
          if (_a === 'fire_damage') wSpecial[_a] = Math.floor(w._base_special[_a] + curLv * 0.2);
          else wSpecial[_a] = parseFloat(Math.min(0.25, w._base_special[_a] + curLv * 0.0003).toFixed(4));
        }
      }
      const merged = { ...wStats };
      for (const s of ['speed', 'attack', 'attack_speed', 'dodge', 'defense', 'hp']) {
        let val = merged[s] || 0;
        if (val <= 0) continue;
        equipStats[s] += val;
      }
      for (const [k, v] of Object.entries(wSpecial)) weaponSpecial[k] = (weaponSpecial[k] || 0) + v;
    } else if (slotBonus[slot]) {
      for (const [s, v] of Object.entries(slotBonus[slot])) equipStats[s] += v;
    }
  }

  hp += equipStats.hp; atk += equipStats.attack; spd += equipStats.speed;
  aspd += equipStats.attack_speed; defense += equipStats.defense;
  const dodge = equipStats.dodge + (ps.dodge || 0) + titleDodge + profDodge + skillDodgeRate;
  // 👔 套装效果计算
  const setCounts = {};
  const allSets = SETS_CFG.sets || [];
  for (const [slot, wid] of Object.entries(user.equipment || {})) {
    if (!wid) continue;
    const allWeapons = forge[user.id] || [];
    const w = allWeapons.find(w => w.id === wid);
    if (!w || !w.set_id) continue;
    setCounts[w.set_id] = (setCounts[w.set_id] || 0) + 1;
  }
  let setBonusAtkPct = 0, setBonusAllPct = 0, setBonusCrit = 0;
  for (const [sid, count] of Object.entries(setCounts)) {
    const sdef = allSets.find(s => s.id === sid);
    if (!sdef) continue;
    for (const [tier, bonus] of Object.entries(sdef.bonuses || {})) {
      if (count >= parseInt(tier)) {
        if (bonus.effects) {
          setBonusAtkPct += (bonus.effects.attack_pct || 0);
          setBonusAllPct += (bonus.effects.all_pct || 0);
          setBonusCrit += (bonus.effects.crit_rate || 0);
        }
      }
    }
  }
  if (setBonusAtkPct > 0) atk = Math.floor(atk * (1 + setBonusAtkPct));
  if (setBonusAllPct > 0) {
    atk = Math.floor(atk * (1 + setBonusAllPct));
    spd = Math.floor(spd * (1 + setBonusAllPct));
    aspd = Math.floor(aspd * (1 + setBonusAllPct));
    defense = Math.floor(defense * (1 + setBonusAllPct));
    hp = Math.floor(hp * (1 + setBonusAllPct));
  }
  // 合并永久特殊属性 + 食物Buff特殊属性到装备特殊属性
  const mergedSpecial = { ...weaponSpecial };
  if (setBonusCrit > 0) mergedSpecial.crit_rate = (mergedSpecial.crit_rate || 0) + setBonusCrit;
  if (permCritRate) mergedSpecial.crit_rate = (mergedSpecial.crit_rate || 0) + permCritRate;
  if (permCritDmg) mergedSpecial.crit_dmg = (mergedSpecial.crit_dmg || 0) + permCritDmg;
  if (permLifesteal) mergedSpecial.lifesteal = (mergedSpecial.lifesteal || 0) + permLifesteal;
  if (titleDmgReduce) mergedSpecial.dmg_reduce = (mergedSpecial.dmg_reduce || 0) + titleDmgReduce;
  // 技能加成
  if (skillCritRate) mergedSpecial.crit_rate = (mergedSpecial.crit_rate || 0) + skillCritRate;
  if (skillTenacity) mergedSpecial.tenacity = (mergedSpecial.tenacity || 0) + skillTenacity;
  if (titleCounter) mergedSpecial.counter = (mergedSpecial.counter || 0) + titleCounter;
  if (titleExtraAtk) mergedSpecial.extra_atk = (mergedSpecial.extra_atk || 0) + titleExtraAtk;
  if (ps.counter) mergedSpecial.counter = (mergedSpecial.counter || 0) + ps.counter;
  if (ps.dmg_reduce) mergedSpecial.dmg_reduce = (mergedSpecial.dmg_reduce || 0) + ps.dmg_reduce;
  if (ps.extra_atk) mergedSpecial.extra_atk = (mergedSpecial.extra_atk || 0) + ps.extra_atk;
  // 食物Buff特殊属性
  for (const [k, v] of Object.entries(foodSpecial)) {
    if (v !== 0) mergedSpecial[k] = (mergedSpecial[k] || 0) + v;
  }
  // 🧪 药师职业加成：异常抗性 → 战斗减伤
  const alcResist = getProfessionBonus(user);
  if (alcResist.resist_bonus) {
    mergedSpecial.dmg_reduce = (mergedSpecial.dmg_reduce || 0) + alcResist.resist_bonus;
  }
  // 🎯 职业冒险通用加成
  const profAdv = getProfessionBonus(user);
  if (profAdv.adv_atk) atk = Math.floor(atk * (1 + profAdv.adv_atk));
  if (profAdv.adv_def) defense = Math.floor(defense * (1 + profAdv.adv_def));
  if (profAdv.adv_hp) hp = Math.floor(hp * (1 + profAdv.adv_hp));
  if (profAdv.adv_speed) spd = Math.floor(spd * (1 + profAdv.adv_speed));
  return { hp, max_hp: hp, attack: atk, speed: spd, atk_speed: aspd, defense, dodge,
    power: calcPower(hp, atk, spd, aspd, defense, dodge, Object.keys(mergedSpecial).length > 0 ? mergedSpecial : null),
    special_attrs: mergedSpecial };
}



function getAdvGearBonus(user) {
  if (!user || !user.equipped_adv_gear) return {};
  if ((user.adv_gear_durability || 0) <= 0) return {};
  const info = (ITEMS.items || {})[user.equipped_adv_gear];
  return (info && info.gear_bonus) ? info.gear_bonus : {};
}
function genMonster(region, eventRarity) {
  // v3: 基于区域固定等级的怪物生成，不再随玩家等级缩放
  const regionId = (region && region.id) || 'plains';
  const regionLvRange = (region && region.monster_level_range) || [1, 10];
  // 筛选该区域的怪物
  const pool = [];
  for (const m of (MONSTERS.monsters || [])) {
    if ((m.rarity || 1) <= eventRarity + 2 && (m.region_id || 'plains') === regionId) pool.push(m);
  }
  // 如果该区域没有匹配怪物，回退到所有匹配稀有度的怪物
  if (pool.length === 0) {
    for (const m of (MONSTERS.monsters || [])) {
      if ((m.rarity || 1) <= eventRarity + 2) pool.push(m);
    }
  }
  if (pool.length === 0) {
    const lv = rand(regionLvRange[0], regionLvRange[1]);
    return { name: '软泥', rarity: 1, hp: 80, max_hp: 80, attack: 10, defense: 5, speed: 5, atk_speed: 4, special: '', exp: 10, coins: [10, 30], level: lv, power: 90 };
  }
  const chosen = weightedPick(pool, m => 1.0 / Math.max(m.rarity || 1, 1));
  // 怪物等级 = 从怪物的 level_range 和区域的 monster_level_range 的交集中随机
  const monLvRange = chosen.level_range || regionLvRange;
  const lvMin = Math.max(regionLvRange[0], monLvRange[0]);
  const lvMax = Math.min(regionLvRange[1], monLvRange[1]);
  const lv = rand(Math.max(lvMin, 1), Math.max(lvMax, lvMin));
  const rarityMult = (MONSTERS.rarity_multipliers || {})[String(chosen.rarity || 1)] || 1.0;
  const lvCoeff = MONSTERS.level_coefficient || 0.05;
  // 属性 = 基础 × (1 + 等级 × 系数) × 稀有度倍率
  const scale = (1 + lv * lvCoeff) * rarityMult;
  const hp = Math.floor((chosen.base_hp || 50) * scale);
  const atk = Math.floor((chosen.base_attack || 5) * scale);
  const def = Math.floor((chosen.base_defense || 2) * scale);
  const spd = Math.floor((chosen.base_speed || 1) * scale);
  const aspd = Math.floor((chosen.base_atk_speed || 0) * scale);
  let special = chosen.special || '';
  if (special && Math.random() > 0.6) special = '';
  return { name: chosen.name || '怪物', rarity: chosen.rarity || 1, hp, max_hp: hp, attack: atk, defense: def, speed: spd, atk_speed: aspd, special, exp: chosen.exp || Math.floor(lv * 2), coins: [Math.floor(lv * 3), Math.floor(lv * 8)], level: lv, power: calcPower(hp, atk, spd, aspd, def) };
}

function simulateBattle(playerStats, monster, newbieProtection = false, userBuffs = null) {
  let pHp = playerStats.hp, pMax = playerStats.hp;
  let pAtk = playerStats.attack, pSpd = playerStats.speed, pAspd = playerStats.atk_speed, pDef = playerStats.defense;
  let pDodgeStat = playerStats.dodge || 0;
  const ws = playerStats.special_attrs || {};
  let mHp = monster.hp, mMax = monster.hp;
  let mAtk = monster.attack, mSpd = monster.speed, mAspd = monster.atk_speed, mDef = monster.defense;
  const mSpecial = monster.special || '';
  const wCritRate = ws.crit_rate || 0, wCritDmg = ws.crit_dmg || 0, wLifesteal = ws.lifesteal || 0;
  const wDmgReduce = ws.dmg_reduce || 0, wCounter = ws.counter || 0, wExtraAtk = ws.extra_atk || 0;
  const wFireDamage = ws.fire_damage || 0;

  // 职业战斗 Buff：提神药水
  if (userBuffs && userBuffs.swift_potion > 0) {
    pSpd = Math.floor(pSpd * 1.8);
  }
  // 活力便当：5次战斗全属性+25%
  if (userBuffs && (userBuffs.temp_vitality_bento || 0) > 0) {
    const bentoMult = 1.25;
    pAtk = Math.floor(pAtk * bentoMult);
    pSpd = Math.floor(pSpd * bentoMult);
    pAspd = Math.floor(pAspd * bentoMult);
    pDef = Math.floor(pDef * bentoMult);
    pHp = Math.floor(pHp * bentoMult);
    pMax = pHp;
  }
  // 护体矿石：5次战斗减伤+10%
  const guardOreActive = userBuffs && (userBuffs.temp_guard_ore || 0) > 0;
  // 职业战斗 Buff：解毒药（免疫毒系特殊技能）
  const poisonImmune = userBuffs && userBuffs.poison_immune > 0;
  // 🧪 攻击药水：5次战斗攻击+50%
  if (userBuffs && (userBuffs.power_potion || 0) > 0) {
    pAtk = Math.floor(pAtk * 1.5);
  }
  // 🧪 防护药水：5次战斗防御翻倍
  if (userBuffs && (userBuffs.shield_potion || 0) > 0) {
    pDef = Math.floor(pDef * 2);
  }
  // 🧪 猛药：5次战斗暴击率+30%
  const critPotionActive = userBuffs && (userBuffs.crit_potion || 0) > 0;
  // 🧪 补药：5次战斗全属性+40%
  if (userBuffs && (userBuffs.all_potion || 0) > 0) {
    const allMult = 1.4;
    pAtk = Math.floor(pAtk * allMult);
    pSpd = Math.floor(pSpd * allMult);
    pAspd = Math.floor(pAspd * allMult);
    pDef = Math.floor(pDef * allMult);
    pHp = Math.floor(pHp * allMult);
    pMax = pHp;
  }
  // 坚韧意志：概率抵抗怪物特殊技能
  const tenacity = (playerStats.special_attrs || {}).tenacity || 0;

  let pDodge = calcDodgeChance(pSpd, mSpd);
  let mDodge = calcDodgeChance(mSpd, pSpd);
  let pCrit = calcCritRate(pSpd, mSpd) + wCritRate;
  if (critPotionActive) pCrit += 0.30;
  pCrit = Math.min(pCrit, 0.95);
  let mCrit = calcCritRate(mSpd, pSpd);
  if (mSpecial === '暗杀') { pCrit = Math.max(0, pCrit - 0.12); mCrit += 0.12; }

  let pExtra = calcExtraTurns(pAspd, mAspd);
  let mExtra = calcExtraTurns(mAspd, pAspd);
  if (mSpecial === '狂乱') mExtra += 1;
  if (mSpecial === '诅咒') pAtk = Math.max(1, Math.floor(pAtk * 0.92));
  if (mSpecial === '龙威') pDef = Math.max(0, Math.floor(pDef * 0.88));
  if (mSpecial === '硬化') mDef = Math.floor(mDef * 1.20);
  if (mSpecial === '虚化') mDodge = Math.min(mDodge + 0.18, 0.60);

  let dmgDealt = 0, dmgTaken = 0, dodges = 0, crits = 0, mDodges = 0, mCrits = 0;
  let spTrig = false, spText = '', turn = 0, maxTurns = 15, lifestealHealed = 0;
  let playerFrozen = false; // 冰冻：跳过玩家下一次攻击

  // 玩家有效攻击：所有属性参与伤害计算
  function playerEffectiveAtk() {
    return Math.floor(pAtk * 1.0 + pSpd * 0.3 + pAspd * 0.4 + pDodgeStat * 0.5 + pHp * 0.02);
  }
  function doAttacks(isPlayer) {
    const atkVal = isPlayer ? playerEffectiveAtk() : mAtk;
    const defVal = isPlayer ? mDef : pDef;
    const dodgeCh = isPlayer ? mDodge : pDodge;
    const critCh = isPlayer ? pCrit : mCrit;
    const critDmgB = isPlayer ? wCritDmg : 0;
    const fireD = isPlayer ? wFireDamage : 0;
    const targetMaxH = isPlayer ? mMax : pMax;
    let attacks = 1 + (isPlayer ? pExtra : mExtra);
    if (isPlayer && wExtraAtk > 0 && Math.random() < wExtraAtk) attacks++;

    for (let i = 0; i < attacks; i++) {
      if ((isPlayer ? mHp : pHp) <= 0) break;

      // --- 闪避判定 ---
      if (Math.random() < dodgeCh) { if (isPlayer) mDodges++; else dodges++; continue; }

      // --- Stage 1-4 + Stage 7: 伤害管道 ---
      const pipeResult = calcDamagePipeline(atkVal, defVal, critCh, critDmgB, fireD, targetMaxH, isPlayer);
      let dmg = pipeResult.damage;
      if (pipeResult.isCrit && isPlayer) crits++;
      if (pipeResult.isCrit && !isPlayer) mCrits++;

      // --- 怪物特殊技能（Stage 5-6 之前触发） ---
      if (!isPlayer) {
        // 神罚：第一回合必暴击
        if (mSpecial === '神罚' && turn === 1 && !spTrig) { dmg = Math.floor(dmg * 1.5); spTrig = true; spText = '神罚降临，第一击必暴击！'; }
        // 坚韧意志：概率抵抗怪物特殊技能
        const tenResisted = tenacity > 0 && mSpecial && Math.random() < tenacity;
        if (tenResisted) { spTrig = true; spText = '💪坚韧意志抵抗了特殊技能！'; }
        else if (mSpecial === '灼烧') { dmg += Math.floor(dmg * 0.10); spTrig = true; spText = '烈焰灼烧造成额外伤害！'; }
        else if (mSpecial === '混沌' && Math.random() < 0.22) { if (Math.random() < 0.5) dmg = Math.floor(dmg * 2); else { mHp = Math.max(0, mHp - Math.floor(dmg * 0.5)); dmg = 0; } spTrig = true; spText = '混沌之力爆发！'; }
        else if (mSpecial === '冰冻' && Math.random() < 0.12 && !playerFrozen) { playerFrozen = true; spTrig = true; spText = '寒气将你冻住，下次攻击被跳过！'; }
        else if (mSpecial === '猛毒' && Math.random() < 0.18 && !poisonImmune) { const poison = Math.floor(pMax * 0.05); pHp -= poison; dmgTaken += poison; spTrig = true; spText = '毒液侵蚀，持续掉血！'; }
        else if (mSpecial === '猛毒' && poisonImmune) { spTrig = true; spText = '解毒药抵御了猛毒攻击！'; }
      }

      // --- Stage 5: 减伤（仅对玩家受到伤害应用） ---
      if (!isPlayer) {
        const evtDmgReduce = (function(){ var es=getEventState(); return (es.is_active&&es.cfg&&es.cfg.effects&&es.cfg.effects.fire_resist)?es.cfg.effects.fire_resist:0; })();
        const totalDmgReduce = wDmgReduce + (guardOreActive ? 0.10 : 0) + evtDmgReduce;
        dmg = Math.max(1, Math.floor(dmg * (1 - Math.min(totalDmgReduce, 0.8))));
      }

      // --- Stage 7: 应用伤害 ---
      if (isPlayer) {
        // 冰冻：跳过本次玩家攻击
        if (playerFrozen) { playerFrozen = false; spTrig = true; spText = '寒气消散，恢复了行动！'; return; }
        mHp -= dmg; dmgDealt += dmg;
        // Stage 6: 吸血
        if (wLifesteal > 0) { const heal = Math.max(1, Math.floor(dmg * wLifesteal)); pHp = Math.min(pMax, pHp + heal); lifestealHealed += heal; }
      } else {
        pHp -= dmg; dmgTaken += dmg;
        // Stage 6: 反击
        if (wCounter > 0 && Math.random() < wCounter && mHp > 0) { const cdmg = Math.max(1, Math.min(calcDamagePipeline(pAtk, mDef, 0, 0, 0, mMax, true).damage, Math.floor(mMax * 0.2))); mHp -= cdmg; dmgDealt += cdmg; }
      }
      // 怪物再生
      if (!isPlayer && mSpecial === '再生') mHp = Math.min(mMax, mHp + Math.floor(mMax * 0.06));
    }
  }

  const playerFirst = pSpd >= mSpd;
  while (pHp > 0 && mHp > 0 && turn < maxTurns) {
    turn++;
    if (playerFirst) { doAttacks(true); if (mHp > 0 && pHp > 0) doAttacks(false); }
    else { doAttacks(false); if (pHp > 0 && mHp > 0) doAttacks(true); }
  }
  let win = mHp <= 0 && pHp > 0;
  const hpPct = Math.max(0, pHp) / pMax;
  let newbieGuardian = false;
  if (!win && newbieProtection) { win = true; newbieGuardian = true; pHp = 1; }
  // 红泪石：死亡时自动复活并恢复满血
  let phoenixRevived = false;
  if (!win && userBuffs && userBuffs.phoenix_tear) { win = true; phoenixRevived = true; pHp = pMax; userBuffs.phoenix_tear = (typeof userBuffs.phoenix_tear === 'number' ? userBuffs.phoenix_tear - 1 : false); }
  return { win, hp_remaining: Math.max(0, pHp), monster_hp_remaining: Math.max(0, mHp), hp_pct: hpPct, damage_dealt: dmgDealt, damage_taken: dmgTaken,
    dodges, crits, m_dodges: mDodges, m_crits: mCrits, turns: turn, special_triggered: spTrig, special_text: spText,
    newbie_guardian: newbieGuardian, lifesteal_healed: lifestealHealed, close_win: win && hpPct < 0.25,
    phoenix_revived: phoenixRevived,
    // 详细战斗数据
    detail: {
      player_hp: pMax, player_atk: pAtk, player_def: pDef, player_spd: pSpd, player_aspd: pAspd, player_dodge: pDodge,
      player_crit: pCrit, player_extra: pExtra, player_dmg_reduce: Math.round(wDmgReduce * 100),
      monster_hp: mMax, monster_atk: mAtk, monster_def: mDef, monster_spd: mSpd, monster_aspd: mAspd, monster_dodge: mDodge,
      monster_crit: mCrit, monster_extra: mExtra,
      extra_attacks_player: pExtra, extra_attacks_monster: mExtra,
      lifesteal: Math.round(wLifesteal * 100), counter: Math.round(wCounter * 100), fire_damage: wFireDamage
    } };
}

// ===================== 经验/等级 =====================
// expForLevel / forgeExpNeeded 等函数已移至 lib/utils.js
function addExp(user, amount) {
  let expBonus = 0;
  const harvestLv = (user.skills || {}).harvest_bonus || 0;
  expBonus += harvestLv * 0.012;
  const forge = loadForge();
  const userWeapons = forge[user.id] || [];
  const equipRef = (user.equipment || {}).weapon || '';
  if (equipRef) {
    const w = userWeapons.find(w => w.id === equipRef || w.name === equipRef);
    if (w && w.special_attrs && w.special_attrs.exp_bonus) expBonus += w.special_attrs.exp_bonus;
  }
  // ✨ 星光项链等永久经验加成
  if (user.perm_stats && user.perm_stats.exp_bonus) expBonus += user.perm_stats.exp_bonus;
  // 🍲 食物经验加成
  const nowSec = Math.floor(Date.now() / 1000);
  for (const b of (user.food_buffs || [])) {
    if ((b.ate_at || 0) + (b.duration || 0) <= nowSec) continue;
    if (b.stat === 'exp_bonus') expBonus += b.value;
  }
  // 🎪 活动经验加成
  const evtState = getEventState();
  if (evtState.is_active && evtState.cfg && evtState.cfg.effects && evtState.cfg.effects.exp_bonus) {
    expBonus += evtState.cfg.effects.exp_bonus;
  }
  const totalExp = Math.floor(amount * (1 + Math.min(expBonus, 0.6)));
  user.exp = (user.exp || 0) + totalExp;
  let safety = 0;
  while (safety < 1000) {
    if ((user.level || 1) >= MAX_LEVEL) { user.exp = 0; break; }
    const needed = expForLevel(user.level);
    if (needed <= 0) break; // 防御：避免无限循环
    if (user.exp >= needed) { user.exp -= needed; user.level = (user.level || 1) + 1; user.skill_points = (user.skill_points || 0) + (JINENG.points_per_level || 3); }
    else break;
    safety++;
  }
  return totalExp;
}
// forgeExpNeeded / fishExpNeeded 等经验函数已移至 lib/utils.js


// ===================== API 路由 =====================

// -- 认证 --
app.post('/api/register', (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const rateCheck = checkAuthRate(ip);
  if (!rateCheck.allowed) return res.status(429).json({ error: `注册尝试过于频繁，请 ${rateCheck.retryAfter} 秒后再试` });

  const { username, password, email } = req.body;
  if (!username || !password) return res.json({ error: '用户名和密码不能为空' });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.json({ error: '请输入有效的邮箱地址' });
  if (username.length < 2 || username.length > 16) return res.json({ error: '用户名2-16个字符' });
  if (password.length < 3) return res.json({ error: '密码至少3个字符' });
  if (findUserByUsername(username)) return res.json({ error: '用户名已被注册' });
  // 检查邮箱是否已被注册
  if (fs.existsSync(USERS_DIR)) {
    for (const t of fs.readdirSync(USERS_DIR).filter(f => f.endsWith('.json'))) {
      try { const d = JSON.parse(fs.readFileSync(path.join(USERS_DIR, t), 'utf-8')); if (d.email === email && d.email_verified) return res.json({ error: '该邮箱已被注册' }); } catch (e) {}
    }
  }
  const verificationCode = String(Math.floor(100000 + Math.random() * 900000));
  const { token, user } = createUser(username, password, email, verificationCode);
  // 📧 尝试发送验证邮件，失败时告知用户
  sendVerificationEmail(email, username, verificationCode).then(result => {
    if (result === null) {
      console.warn(`📧 [验证码发送失败] ${username} <${email}> — 验证码为: ${verificationCode}（用户无法收到邮件）`);
    } else {
      console.log(`📧 [验证码] ${username} <${email}> → ${verificationCode}`);
    }
  });
  const emailWarning = SMTP_PASS ? '' : '（邮件服务未配置，请联系管理员）';
  res.json({ token, user: sanitizeUser(user), need_verify: true, email, email_warning: emailWarning || undefined });
});
// -- 邮箱验证 --
app.post('/api/verify-email', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  if (!user) return res.json({ error: '用户不存在' });
  if (user.email_verified) return res.json({ error: '邮箱已验证过了' });
  const { code } = req.body;
  if (!code) return res.json({ error: '请输入验证码' });
  if (code !== user.email_code) return res.json({ error: '验证码错误' });
  user.email_verified = true;
  user.email_code = '';
  saveUser(req.userToken, user);
  console.log(`✅ [邮箱验证] ${user.username} <${user.email}> 验证成功`);
  res.json({ success: true, message: '邮箱验证成功！' });
});
app.post('/api/resend-code', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  if (!user) return res.json({ error: '用户不存在' });
  if (user.email_verified) return res.json({ error: '邮箱已验证过了' });
  const newCode = String(Math.floor(100000 + Math.random() * 900000));
  user.email_code = newCode;
  saveUser(req.userToken, user);
  sendVerificationEmail(user.email, user.username, newCode).then(result => {
    if (result === null) {
      console.warn(`📧 [验证码重发失败] ${user.username} <${user.email}> — 验证码为: ${newCode}`);
    } else {
      console.log(`📧 [验证码重发] ${user.username} <${user.email}> → ${newCode}`);
    }
  });
  const emailWarning = SMTP_PASS ? '' : '（邮件服务未配置，验证码将无法发送）';
  res.json({ success: true, message: '验证码已重新发送到你的邮箱' + emailWarning });
});
app.post('/api/login', (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const rateCheck = checkAuthRate(ip);
  if (!rateCheck.allowed) return res.status(429).json({ error: `登录尝试过于频繁，请 ${rateCheck.retryAfter} 秒后再试` });

  const { username, password } = req.body;
  const u = findUserByUsername(username);
  if (!u || !bcrypt.compareSync(password, u.password)) return res.json({ error: '用户名或密码错误' });
  res.json({ token: u.id || '', user: sanitizeUser(u) });
});

// -- 获取当前用户 --
// 头像图片（单独接口，避免每次 /api/me 携带大体积 base64）
// 调试：查看用户数据文件内容
app.get('/api/debug/data', authMiddleware, (req, res) => {
  const filePath = userPath(req.userToken);
  const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
  const raw = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath,'utf-8')) : null;
  res.json({
    token: req.userToken,
    file: filePath,
    file_exists: !!stat,
    file_mtime: stat ? new Date(stat.mtime).toISOString() : null,
    coins: raw ? raw.coins : null,
    level: raw ? raw.level : null,
    inv_count: raw ? Object.keys(raw.inventory||{}).length : null,
    fish_tank_count: raw ? (raw.fish_tank||[]).length : null,
  });
});
app.get('/api/avatar/:userId', (req, res) => {
  const userId = req.params.userId;
  if (!isValidToken(userId)) return res.status(400).json({ error: '无效的用户ID' });
  if (!userExists(userId)) return res.status(404).json({ error: '用户不存在' });
  const u = loadUser(userId);
  if (!u || !u.avatar_img) return res.status(404).json({ error: '无头像' });
  res.json({ image: u.avatar_img });
});

app.post('/api/dummy/hit', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const stats = getPlayerStats(user);
  const baseDmg = stats.attack || 10;
  const critRoll = Math.random();
  const crit = critRoll < ((stats.special_attrs && stats.special_attrs.crit_rate) || 0.05);
  const dodge = Math.random() < 0.05;
  const dmg = dodge ? 0 : Math.floor(baseDmg * (crit ? (1.5 + ((stats.special_attrs && stats.special_attrs.crit_dmg) || 0)) : 1) * (0.85 + Math.random() * 0.3));
  res.json({ damage: dmg, crit, dodge });
});

app.get('/api/me', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken) || req.user;
  if (!user) return res.json({ error: '用户数据加载失败' });
  console.log('📖 /api/me token:', req.userToken.substring(0,8), 'user:', user.username, 'coins:', user.coins, 'inv:', Object.keys(user.inventory||{}).length+'种');
  // ❤️ HP自然恢复先计算（必须在任何 saveUser 之前）
  ensureHp(user);
  cleanPendingExpired(user);
  // migrate equipment from name-based to id-based
  if (user.equipment) {
    const forge = loadForge();
    const userWeapons = forge[user.id] || [];
    const nameToId = {};
    for (const w of userWeapons) { if (w.id) nameToId[w.name] = w.id; }
    let eqMigrated = false;
    for (const [slot, ref] of Object.entries(user.equipment)) {
      if (ref && nameToId[ref] && ref !== nameToId[ref]) {
        user.equipment[slot] = nameToId[ref];
        eqMigrated = true;
      }
    }
    if (eqMigrated) saveUser(req.userToken, user);
  }
  // 为已有职业的老玩家补发专属道具
  const newItems = grantExclusiveItems(user);
  if (newItems.length > 0) saveUser(req.userToken, user);
  const signedToday = user.last_signin === today();
  const stats = getPlayerStats(user);
  const ar = checkRateLimit(user, 'adventure');
  const fr = checkRateLimit(user, 'fishing');
  // ❤️ HP数据 & 持久化：确保装备迁移/道具补发/HP恢复全部落盘
  ensureHp(user);
  saveUser(req.userToken, user);
  const maxHp = stats.hp;
  res.json({ user: sanitizeUser(user), signed_today: signedToday, stats,
    online_count: onlineUsers.size,
    exp_to_next: expForLevel(user.level) - (user.exp || 0),
    inv_total: totalInv(user),
    pending_merchant: (user.pending_merchant || []).length > 0,
    pending_lolis: (user.pending_lolis || []).length > 0,
    rate_adventure: { used: ar.used, max: ar.max },
    rate_fishing: { used: fr.used, max: fr.max },
    weather: getWeatherState(),
    season: getSeasonState(),
    fishing_areas: FISHING_AREA_DETAILS,
    hp: { current: user.current_hp != null ? user.current_hp : maxHp, max: maxHp },
  });
});

// -- 签到 --
app.post('/api/signin', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  if (user.last_signin === today()) return res.json({ error: '今天已经签到过了' });
  const yesterday = new Date(Date.now() + TZ_OFFSET - 86400000).toISOString().slice(0, 10);
  user.signin_streak = user.last_signin === yesterday ? (user.signin_streak || 0) + 1 : 1;
  user.last_signin = today();
  const base = parseRange(SIGNIN.base_coins, [50, 100]);
  const streakBonus = Math.min((user.signin_streak - 1) * (SIGNIN.streak_bonus || 10), SIGNIN.streak_max_bonus || 70);
  const total = base + streakBonus;
  user.coins = (user.coins || 0) + total;
  // 签到宝石奖励（里程碑）
  const gemRewards = [];
  const milestones = (SIGNIN.gem_rewards || {}).milestones || [];
  const milestone = milestones.find(m => m.streak === user.signin_streak);
  if (milestone && milestone.count > 0) {
    for (let i = 0; i < milestone.count; i++) {
      const gem = dropGemInRange(user, milestone.min_rarity || 1, milestone.max_rarity || 999);
      gemRewards.push({ name: gem.name, stat: gem.stat, value: gem.value, rarity: gem.rarity });
    }
  }
  saveUser(req.userToken, user);
  checkTitleMilestones(user);
  res.json({ coins: total, base, streak: streakBonus, streak_count: user.signin_streak, total_coins: user.coins, gems: gemRewards });
});

// -- 冒险 --
app.post('/api/adventure', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);

  // 速率限制
  const rl = checkRateLimit(user, 'adventure');
  if (!rl.allowed) return res.json({ error: `冒险次数已达上限 (${rl.used}/${rl.max}每小时)，请等待下一小时` });

  // ❤️ HP检查：不满血时自动使用血药（如果设置了）
  ensureHp(user);
  if (autoUseHpPotion(user)) saveUser(req.userToken, user);
  if (user.current_hp <= 0) return res.json({ error: '💔 体力不支，无法继续冒险！请使用生命药剂恢复或等待自然恢复' });

  const count = Math.min(req.body.count || 1, 50, rl.max - rl.used);
  if (count < 1) return res.json({ error: '冒险次数已用完' });
  const advWeather = getWeatherState();
  const advGear = getAdvGearBonus(user);
  const profBonus = getProfessionBonus(user); // 职业冒险加成

  const results = [];
  let totalExp = 0, totalCoins = 0;
  const totalDrops = {};
  const dropRarities = {}; // { name: rarity } 用于前端着色
  let deaths = 0;

  // 区域系统
  let region = null;
  const regionId = user.adventure_region || 'random';
  if (regionId === 'random') {
    const unlockedRegions = (REGIONS.regions || []).filter(r => (user.level || 1) >= (r.min_level || 1));
    if (unlockedRegions.length > 0) region = pick(unlockedRegions);
    else region = (REGIONS.regions || [])[0] || null;
  } else {
    region = (REGIONS.regions || []).find(r => r.id === regionId) || null;
  }
  // 🏞️ 子区域
  const subRegionId = user.adventure_sub_region || 'any';
  let subRegion = null;
  if (region && subRegionId !== 'any') {
    subRegion = (region.sub_regions || []).find(sr => sr.id === subRegionId) || null;
  }
  // 🎪 活动加成区域
  const evtState = getEventState();
  const evtBonusRegions = (evtState.is_active && evtState.cfg && evtState.cfg.bonus_regions) ? evtState.cfg.bonus_regions : [];
  const evtBonus = region ? (evtBonusRegions.find(br => br.region_id === region.id) || null) : null;
  let regionEvents = region && region.event_pool ? (MAOXIAN.events || []).filter(e => region.event_pool.includes(e.name)) : (MAOXIAN.events || []);
  // 区域过滤：矿山无萝莉/神秘商人事件
  if (region && region.no_merchant) regionEvents = regionEvents.filter(e => e.type !== 'merchant');
  if (region && region.no_loli) regionEvents = regionEvents.filter(e => e.type !== 'loli');
  // 等级门槛过滤：部分事件需达到指定等级才会触发
  const playerLv = user.level || 1;
  regionEvents = regionEvents.filter(e => !e.min_level || playerLv >= e.min_level);
  let eventPool = regionEvents.length > 0 ? regionEvents : (MAOXIAN.events || []);
  // 全局事件池也过滤等级
  if (regionEvents.length === 0) {
    eventPool = eventPool.filter(e => !e.min_level || playerLv >= e.min_level);
  }
  // 选择事件开关（默认关闭）；区域限定事件过滤
  if (!user.choice_events_enabled) eventPool = eventPool.filter(e => e.type !== 'choice');
  if (region) eventPool = eventPool.filter(e => {
    if (!e.required_region && !e.required_regions) return true;
    if (e.required_region) return e.required_region === region.id;
    if (e.required_regions) return e.required_regions.includes(region.id);
    return true;
  });
  // 职业专属事件注入
  if (user.profession) {
    const profEvents = (MAOXIAN.events || []).filter(e => e.required_profession === user.profession && (!e.required_region || e.required_region === (region ? region.id : null)));
    eventPool = eventPool.concat(profEvents);
  }

  // 活动代币（每次冒险独立判定）
  let eventCurrencyTotal = 0, eventCurrencyName = '', eventCurrencyEmoji = '';
  const evtCur = (evtState.is_active && evtState.cfg) ? (evtState.cfg.currency || null) : null;
  function tryEventDrop(cur, rateKey, minKey, maxKey) {
    if (!cur) return;
    // 🎪 加成区域使用自定义活动币掉落率
    const rate = (evtBonus && evtBonus.currency_rate != null) ? evtBonus.currency_rate : (cur[rateKey] || 0.3);
    if (Math.random() < rate) {
      const amt = rand(cur[minKey] || 1, cur[maxKey] || 3);
      if (!user.event_currencies) user.event_currencies = {};
      user.event_currencies[cur.name] = (user.event_currencies[cur.name] || 0) + amt;
      eventCurrencyTotal += amt; eventCurrencyName = cur.name; eventCurrencyEmoji = cur.emoji || '🪙';
    }
  }

  for (let i = 0; i < count; i++) {
    // ❤️ 体力检查（冒险开始前已补满，不再自动喝药）
    if (user.current_hp <= 0) saveUser(req.userToken, user);
    if (user.current_hp <= 0) { results.push({ type: 'system', text: '💔 体力不支，冒险中断！' }); break; }
    // 🏞️ 主区域低概率享受子区域加成 — 随机抽一个子区域，30%强度
    const activeSubBonus = subRegion || (!region ? null :
      (region.sub_regions && region.sub_regions.length > 0 && Math.random() < 0.30 ?
        region.sub_regions[Math.floor(Math.random() * region.sub_regions.length)] : null));

    const event = weightedPick(eventPool, e => {
      let weight = 1.0 / Math.sqrt(Math.max(e.rarity || 1, 1));
      // 🏞️ 子区域事件加成
      const applyBonus = activeSubBonus && activeSubBonus.event_bonus;
      if (applyBonus) {
        const mult = activeSubBonus === subRegion ? 1 : 0.30; // 主区域低概率=30%强度
        const typeMap = { '钓鱼': 'fishing', '战斗': 'combat', '宝箱': 'treasure', '商人': 'merchant', '采集': 'treasure', '采矿': 'treasure', '探索': 'treasure', '稀有': 'treasure', '金币': 'merchant', '矿石': 'treasure' };
        for (const [keyword, bonus] of Object.entries(activeSubBonus.event_bonus)) {
          const matchesType = (e.type || '') === keyword || typeMap[keyword] === e.type;
          if ((e.name || '').includes(keyword) || matchesType) {
            weight *= (1 + (bonus || 0) * mult);
          }
        }
      }
      return weight;
    });
    const eventRarity = Math.min(9999, (event.rarity || 1) + (region ? (region.rarity_bonus || 0) : 0) + Math.round((advGear.rare_event || 0) * 100) / 10);
    const eventType = event.type || 'combat';

    // 🔀 选择事件：auto_choice 则随机选，否则中断返回选项
    if (eventType === 'choice' && event.choices && event.choices.length >= 2) {
      if (user.auto_choice_enabled) {
        // 自动随机选择一个选项
        const picked = event.choices[rand(0, event.choices.length - 1)];
        const outcome = picked.outcome || 'nothing';
        if (outcome === 'combat') {
          const cMonster = genMonster(region, eventRarity);
          cMonster.name = picked.monster_name || event.name || cMonster.name;
          if (picked.elite && Math.random() < (picked.elite_chance || 0.15)) {
            cMonster.hp = Math.floor(cMonster.hp * 1.5); cMonster.max_hp = cMonster.hp;
            cMonster.attack = Math.floor(cMonster.attack * 1.3);
          }
          const cStats = getPlayerStats(user);
          const cBattle = simulateBattle(cStats, cMonster, user.adventure_count < 25, user);
          const cHpLoss = cBattle.phoenix_revived ? 0 : Math.max(1, Math.floor(cBattle.damage_taken / 2));
          user.current_hp = Math.max(0, (user.current_hp != null ? user.current_hp : cStats.max_hp) - cHpLoss);
          if (cBattle.win) {
            const cCoins = parseRange(picked.coins || event.coins, [30, 60]);
            user.coins = (user.coins || 0) + cCoins; totalCoins += cCoins;
            const cExp = addExp(user, picked.exp || event.exp || 15); totalExp += cExp;
            for (const d of (picked.drops || event.drops || [])) {
              if (d.chance && Math.random() > d.chance) continue;
              const p = parseDropString(d);
              addInv(user, p.name, p.count); totalDrops[p.name] = (totalDrops[p.name] || 0) + p.count;
            }
            results.push({ type: 'combat', win: true, text: '🔀 自动选择了「'+picked.text+'」并战胜了'+cMonster.name, monster: cMonster.name, monster_level: cMonster.level, coins: cCoins, exp: cExp, drops: [], isElite: false });
          } else {
            deaths++;
            results.push({ type: 'combat', win: false, text: '🔀 自动选择了「'+picked.text+'」但被'+cMonster.name+'击败', monster: cMonster.name, monster_level: cMonster.level });
            if (user.current_hp <= 0) { results.push({ type: 'system', text: '💔 体力不支，冒险中断！' }); break; }
          }
        } else if (outcome === 'treasure') {
          const cCoins = parseRange(picked.coins || event.coins, [50, 120]);
          if (picked.cost) user.coins = (user.coins || 0) - picked.cost;
          user.coins = (user.coins || 0) + cCoins; totalCoins += cCoins;
          const cExp = addExp(user, picked.exp || event.exp || 25); totalExp += cExp;
          for (const d of (picked.drops || event.drops || [])) {
            if (d.chance && Math.random() > d.chance) continue;
            const p = parseDropString(d);
            addInv(user, p.name, p.count); totalDrops[p.name] = (totalDrops[p.name] || 0) + p.count;
          }
          results.push({ type: 'system', text: '🔀 自动选择了「'+picked.text+'」💰+' + cCoins + ' ⭐+' + cExp });
        } else if (outcome === 'merchant') {
          const mItems = generateMerchantItems();
          if (!user.pending_merchant) user.pending_merchant = [];
          user.pending_merchant.push({ id: uid(), name: mItems.map(m => m.name).join('、'), items: mItems, added_at: now() });
          results.push({ type: 'system', text: '🔀 自动选择了「'+picked.text+'」并遇到了商人！' });
        } else if (outcome === 'ruins') {
          results.push({ type: 'ruins_discovered', text: '🔀 自动选择了「'+picked.text+'」并发现了废墟入口！', ruins_scroll: picked.ruins_scroll || 1, exp: picked.exp || 25 });
        } else {
          const cExp = addExp(user, picked.exp || event.exp || 8); totalExp += cExp;
          results.push({ type: 'system', text: '🔀 自动选择了「'+picked.text+'」' + (picked.text_result || '') });
        }
        addRateCount(user, 'adventure');
        tryEventDrop(evtCur, 'adventure_rate', 'adventure_min', 'adventure_max');
        continue;
      }
      const choiceData = { type: 'choice', text: event.text || '你面临一个选择...', event_name: event.name, rarity: eventRarity,
        choices: event.choices.map((c, ci) => ({ index: ci, text: c.text, desc: c.desc || '', outcome: c.outcome || '?' })) };
      user.pending_choice = { event: { name: event.name, choices: event.choices, rarity: eventRarity, drops: event.drops, coins: event.coins, exp: event.exp }, region_id: region ? region.id : null };
      addRateCount(user, 'adventure');
      tryEventDrop(evtCur, 'adventure_rate', 'adventure_min', 'adventure_max');
      results.push(choiceData);
      break;
    }

    // 商人事件（矿山区域不触发神秘商人）
    if (eventType === 'merchant') {
      const coins = parseRange(event.coins, [10, 30]);
      user.coins = (user.coins || 0) + coins; totalCoins += coins;
      const expGain = addExp(user, event.exp || 10); totalExp += expGain;
      if ((!region || !region.no_merchant) && event.merchant_spawn_chance && Math.random() < (event.merchant_spawn_chance)) {
        const mItems = generateMerchantItems();
        if (!user.pending_merchant) user.pending_merchant = [];
        user.pending_merchant.push({ id: uid(), name: mItems.map(m => m.name).join('、'), items: mItems, added_at: now() });
      }
      results.push({ type: 'merchant', text: event.text || '遇到了商人！', coins, exp: expGain });
      addRateCount(user, 'adventure');
      tryEventDrop(evtCur, 'adventure_rate', 'adventure_min', 'adventure_max');
      continue;
    }
    if (eventType === 'treasure') {
      // 🎭 宝箱怪: 5%概率宝箱变成怪物
      if (Math.random() < 0.05) {
        const mStats = getPlayerStats(user);
        const mimicMonster = genMonster(region, Math.max(eventRarity, 2));
        mimicMonster.name = '宝箱怪';
        mimicMonster.hp = 350 + (user.level || 1) * 5; mimicMonster.max_hp = mimicMonster.hp;
        mimicMonster.attack = 55 + (user.level || 1) * 2;
        mimicMonster.speed = 14; mimicMonster.attack_speed = 12; mimicMonster.defense = 30;
        if (advWeather.adventure_monster_bonus && region && !region.weather_immune) {
          const wmB = 1 + (advWeather.adventure_monster_bonus || 0);
          mimicMonster.hp = Math.floor(mimicMonster.hp * wmB); mimicMonster.max_hp = mimicMonster.hp;
          mimicMonster.attack = Math.floor(mimicMonster.attack * wmB);
        }
        const mIsElite = Math.random() < Math.max(0.01, 0.08 * (1 - (advGear.elite_resist || 0)));
        if (mIsElite) { mimicMonster.hp = Math.floor(mimicMonster.hp * 1.5); mimicMonster.max_hp = mimicMonster.hp; mimicMonster.attack = Math.floor(mimicMonster.attack * 1.3); mimicMonster.defense = Math.floor(mimicMonster.defense * 1.3); }
        const mBattle = simulateBattle(mStats, mimicMonster, user.adventure_count < 25, user);
        if (mBattle.win) {
          let mCoins = parseRange(event.coins, [50, 120]) * 2;
          if (mIsElite) mCoins *= 2;
          user.coins = (user.coins || 0) + mCoins; totalCoins += mCoins;
          const mExp = addExp(user, (event.exp || 25) * 2); totalExp += mExp;
          const ag = rand(2, 4); addInv(user, '古代金币', ag); totalDrops['古代金币'] = (totalDrops['古代金币'] || 0) + ag;
          const fs = rand(1, 2); addInv(user, '附魔石', fs); totalDrops['附魔石'] = (totalDrops['附魔石'] || 0) + fs;
          if (!user.monster_kills) user.monster_kills = {};
          user.monster_kills['宝箱怪'] = (user.monster_kills['宝箱怪'] || 0) + 1;
          user.total_monster_kills = (user.total_monster_kills || 0) + 1;
          results.push({ type: 'mimic', text: '🎭 宝箱突然张开大嘴——是宝箱怪！你击败了它！', coins: mCoins, exp: mExp, drops: ['古代金币x'+ag, '附魔石x'+fs], elite: mIsElite });
        } else {
          deaths++;
          const mLoss = Math.floor(parseRange(event.coins, [50, 120]) * 0.2);
          user.coins = (user.coins || 0) + mLoss; totalCoins += mLoss;
          totalExp += Math.floor((event.exp || 25) * 0.2);
          results.push({ type: 'mimic', text: '🎭 宝箱怪太过强大，你被击败了...', coins: mLoss, exp: Math.floor((event.exp || 25) * 0.2), win: false });
          if (user.current_hp <= 0) { results.push({ type: 'system', text: '💔 体力不支，冒险中断！' }); break; }
        }
        addRateCount(user, 'adventure');
        tryEventDrop(evtCur, 'adventure_rate', 'adventure_min', 'adventure_max');
        continue;
      }

      let coins = parseRange(event.coins, [50, 120]);
      const expGain = addExp(user, event.exp || 25); totalExp += expGain;
      // 🎰 宝箱大爆：10%概率触发金币翻倍
      let jackpot = false; let jackpotMult = 1;
      if (Math.random() < 0.10) { jackpot = true; jackpotMult = rand(2, 5); coins *= jackpotMult; }
      user.coins = (user.coins || 0) + coins; totalCoins += coins;
      const treasureDrops = [], treasureWeapons = [];
      for (const d of (event.drops || [])) {
        if (d.chance && Math.random() > d.chance) continue;
        const p = parseDropString(d);
        addInv(user, p.name, p.count); totalDrops[p.name] = (totalDrops[p.name] || 0) + p.count;
        treasureDrops.push(p.name+(p.count>1?'x'+p.count:''));
      }
      // 🗡️ 宝箱装备掉落
      if (event.weapon_drops && event.weapon_drops.length > 0) {
        for (const wdef of event.weapon_drops) {
          const wdcBase = (wdef.chance || 0.05) + (profBonus.weapon_drop_bonus || 0);
        if (Math.random() < wdcBase) {
            const equipment = dropAdventureWeapon(user, wdef, null, region ? (region.monster_level_range ? region.monster_level_range[0] : 15) : 15);
            if (equipment) {
              const rarityTag = equipment.rarity > 1 ? '[' + equipment.rarity_name + ']' : '';
              treasureDrops.push('🗡️' + equipment.name + rarityTag);
              totalDrops['🗡️' + equipment.name] = (totalDrops['🗡️' + equipment.name] || 0) + 1;
              dropRarities['🗡️' + equipment.name] = Math.max(dropRarities['🗡️' + equipment.name] || 0, equipment.rarity);
              // 🗑️ 自动分解检查
              if ((user.auto_decompose_rarity || 0) > 0 && equipment.rarity <= user.auto_decompose_rarity) {
                const forge = loadForge(); const fw = forge[user.id] || [];
                const idx = fw.findIndex(w => w.id === equipment.id);
                if (idx >= 0) { fw.splice(idx, 1); forge[user.id] = fw; saveForge(forge); }
                const mats = ['铁矿','铜矿','银矿','金矿'];
                const cnt = equipment.rarity * 2;
                const mat = mats[Math.min(equipment.rarity-1, mats.length-1)] || '铁矿';
                addInv(user, mat, cnt); totalDrops[mat] = (totalDrops[mat]||0) + cnt;
                treasureDrops.push('♻️已分解' + equipment.name + '→' + mat + 'x' + cnt);
              } else {
                treasureWeapons.push({
                  name: equipment.name, rarity: equipment.rarity, rarity_name: equipment.rarity_name,
                  slot: equipment.type, stats: equipment.stats, special: equipment.special_attrs
                });
              }
            }
          }
        }
      }
      // 神秘商人（宝箱事件也可触发，矿山区域不触发）
      if ((!region || !region.no_merchant) && event.merchant_spawn_chance && Math.random() < (event.merchant_spawn_chance)) {
        const mItems = generateMerchantItems();
        if (!user.pending_merchant) user.pending_merchant = [];
        user.pending_merchant.push({ id: uid(), name: mItems.map(m => m.name).join('、'), items: mItems, added_at: now() });
      }
      // 矿山小毛贼商人（宝箱事件）
      if (region && region.goblin_merchant_chance && Math.random() < (region.goblin_merchant_chance || 0.2)) {
        const pool = [...(region.goblin_merchant_items || [])];
        const gCount = rand(2, 4);
        for (let gi = pool.length - 1; gi > 0; gi--) { const gj = rand(0, gi); [pool[gi], pool[gj]] = [pool[gj], pool[gi]]; }
        const gItems = pool.slice(0, Math.min(gCount, pool.length)).map(item => ({
          name: item.name, price: parseRange(item.price, [50, 200]), rarity: item.rarity || 1
        }));
        if (!user.pending_goblin_merchant) user.pending_goblin_merchant = [];
        user.pending_goblin_merchant.push({ id: uid(), name: '小毛贼商人', items: gItems, added_at: now() });
      }
      addRateCount(user, 'adventure');
      tryEventDrop(evtCur, 'adventure_rate', 'adventure_min', 'adventure_max');
      results.push({ type: 'treasure', text: event.text || '发现了宝箱！', coins, exp: expGain, drops: treasureDrops, weapon_drops: treasureWeapons, jackpot, jackpotMult });
      continue;
    }

    // 萝莉事件
    if (eventType === 'loli') {
      const loliName = event.name || '迷路的小孩';
      const autoMode = user.auto_loli || 'none';
      let autoResult = null;

      // 自动处理萝莉
      if (autoMode === 'adopt' && (user.lolis || []).length < 8) {
        const loliCfg = (LOLI.lolis || []).find(l => l.name === loliName) || { name: loliName, rarity: 1, base_bonus: { coin: 0.05, drop: 0.05 }, max_level: 10 };
        if (!user.lolis) user.lolis = [];
        user.lolis.push({ name: loliName, rarity: event.rarity || 1, level: 1, exp: 0, favor: 0, base_bonus: loliCfg.base_bonus, max_level: loliCfg.max_level || 10, dispatch: null });
        const coins = parseRange(event.coins, [30, 80]);
        user.coins = (user.coins || 0) + coins; totalCoins += coins;
        totalExp += addExp(user, event.exp || 25);
        autoResult = 'adopt';
      } else if (autoMode === 'help') {
        // 帮助模式：获得帮助金币和经验（不受event基础金币/经验影响）
        const hCoins = parseRange(event.help_coins || [50, 120], [50, 120]);
        user.coins = (user.coins || 0) + hCoins; totalCoins += hCoins;
        totalExp += addExp(user, event.help_exp || 40);
        for (const d of (event.help_drops || [])) {
          const p = parseDropString(d);
          addInv(user, p.name, p.count);
        }
        for (const d of (event.drops || [])) {
          const p = parseDropString(d);
          addInv(user, p.name, p.count);
        }
        autoResult = 'help';
      } else {
        // 手动模式：获得基础金币和经验，萝莉加入待处理列表
        const coins = parseRange(event.coins, [30, 80]);
        user.coins = (user.coins || 0) + coins; totalCoins += coins;
        totalExp += addExp(user, event.exp || 25);
      }

      if (autoResult) {
        addRateCount(user, 'adventure');
        tryEventDrop(evtCur, 'adventure_rate', 'adventure_min', 'adventure_max');
        results.push({ type: 'loli', text: event.text || `遇到了${loliName}！`, loli_name: loliName, loli_rarity: event.rarity || 1, has_choice: false, auto: autoResult });
        continue;
      }

      // 手动模式：添加到待领养列表（即便同伴已满也可帮助，不能收养）
      if (!user.pending_lolis) user.pending_lolis = [];
        let loliIdx = -1;
        user.pending_lolis.push({ name: loliName, rarity: event.rarity || 1, text: event.text, help_coins: event.help_coins, help_exp: event.help_exp, help_drops: event.help_drops, drops: event.drops, added_at: now() });
        loliIdx = user.pending_lolis.length - 1;
      addRateCount(user, 'adventure');
      tryEventDrop(evtCur, 'adventure_rate', 'adventure_min', 'adventure_max');
      results.push({ type: 'loli', text: event.text || `遇到了${loliName}！`, loli_name: loliName, loli_rarity: event.rarity || 1, has_choice: true, loli_index: loliIdx });
      continue;
    }

    // 🎣 钓鱼事件（独立消耗钓鱼次数）
    if (eventType === 'fishing') {
      addRateCount(user, 'adventure');
      tryEventDrop(evtCur, 'adventure_rate', 'adventure_min', 'adventure_max');
      const fr = checkRateLimit(user, 'fishing');
      if (!fr.allowed) {
        results.push({ type: 'fishing', text: '钓鱼次数已用完，你放弃了钓鱼...', skipped: true });
        continue;
      }
      const result = doAdventureFishing(user, region, activeSubBonus, event);
      if (result) { results.push(result); if (result.exp) totalExp += result.exp; if (result.coins) totalCoins += result.coins; }
      continue;
    }

    // 战斗事件
    const stats = getPlayerStats(user);
    const monster = genMonster(region, eventRarity);
    monster.name = event.name || monster.name;
    // 🌤 天气时段怪物加成
    if (advWeather.adventure_monster_bonus && region && !region.weather_immune) {
      const wmBonus = 1 + (advWeather.adventure_monster_bonus || 0);
      monster.hp = Math.floor(monster.hp * wmBonus); monster.max_hp = monster.hp;
      monster.attack = Math.floor(monster.attack * wmBonus);
    }
    // 👹 精英怪：8%概率遭遇，属性1.5倍，奖励2倍
    let isElite = false;
    const eliteChance = Math.max(0.01, 0.08 * (1 - (advGear.elite_resist || 0)));
    if (Math.random() < eliteChance) { isElite = true; monster.hp = Math.floor(monster.hp * 1.5); monster.max_hp = monster.hp; monster.attack = Math.floor(monster.attack * 1.3); monster.defense = Math.floor(monster.defense * 1.3); }
    const battle = simulateBattle(stats, monster, user.adventure_count < 25, user);
    // 🪶 红羽毛/红泪石：simulateBattle 内部触发复活时修正 HP
    if (battle.phoenix_revived) {
      battle.hp_remaining = stats.hp;
      user.current_hp = stats.hp;
    }
    // ❤️ HP消耗：战斗受伤扣除体力（红羽毛复活不扣HP）
    const hpLoss = battle.phoenix_revived ? 0 : Math.max(1, Math.floor(battle.damage_taken / 2));
    user.current_hp = Math.max(0, (user.current_hp != null ? user.current_hp : stats.max_hp) - hpLoss);
    // 消耗战斗次数类 Buff（仅战斗中消耗）
    if (battle.win || !battle.win) {  // 只要是战斗（不论输赢）都消耗次数类Buff
      if (user.swift_potion > 0) { user.swift_potion--; if (user.swift_potion <= 0) delete user.swift_potion; }
      if (user.poison_immune > 0) { user.poison_immune--; if (user.poison_immune <= 0) delete user.poison_immune; }
      if (user.temp_vitality_bento > 0) { user.temp_vitality_bento--; if (user.temp_vitality_bento <= 0) delete user.temp_vitality_bento; }
      if (user.temp_guard_ore > 0) { user.temp_guard_ore--; if (user.temp_guard_ore <= 0) delete user.temp_guard_ore; }
      if (user.power_potion > 0) { user.power_potion--; if (user.power_potion <= 0) delete user.power_potion; }
      if (user.shield_potion > 0) { user.shield_potion--; if (user.shield_potion <= 0) delete user.shield_potion; }
      if (user.crit_potion > 0) { user.crit_potion--; if (user.crit_potion <= 0) delete user.crit_potion; }
      if (user.all_potion > 0) { user.all_potion--; if (user.all_potion <= 0) delete user.all_potion; }
    }
    let expGain = addExp(user, battle.win ? Math.floor((event.exp || 15) * (isElite ? 2.0 : 1)) : Math.floor((event.exp || 15) * 0.2));
    totalExp += expGain;
    addRateCount(user, 'adventure');
    tryEventDrop(evtCur, 'adventure_rate', 'adventure_min', 'adventure_max');

    let coins = 0, eventDrops = [], droppedWeapons = [];
    if (battle.win) {
      coins = parseRange(event.coins, [30, 60]);
      if (isElite) coins *= 2;
      user.coins = (user.coins || 0) + coins; totalCoins += coins;
      for (const d of (event.drops || [])) {
        if (d.chance && Math.random() > d.chance) continue;
        const p = parseDropString(d);
        addInv(user, p.name, p.count); totalDrops[p.name] = (totalDrops[p.name] || 0) + p.count;
        eventDrops.push(p.name+(p.count>1?'x'+p.count:''));
      }
      if (event.rare_drop_chance && Math.random() < (event.rare_drop_chance + (profBonus.rare_drop || 0))) {
        for (const d of (event.rare_drops || [])) {
          if (d.chance && Math.random() > d.chance) continue;
          const p = parseDropString(d);
          addInv(user, p.name, p.count); totalDrops[p.name] = (totalDrops[p.name] || 0) + p.count;
          eventDrops.push('✨'+p.name+(p.count>1?'x'+p.count:''));
        }
      }
      
      // 🗡️ 装备掉落（事件 + 怪物，统一处理）
      const weaponDropSources = [
        ...(event.weapon_drops || []).map(w => ({ ...w, _src: 'event' })),
        ...((monster.weapon_drops) || []).map(w => ({ ...w, _src: 'monster' }))
      ];
      for (const wdef of weaponDropSources) {
        const wdcMonster = (wdef.chance || 0.04) + (profBonus.weapon_drop_bonus || 0);
        if (Math.random() < wdcMonster) {
          const equipment = dropAdventureWeapon(user, wdef, null, monster.level || 1);
          if (equipment) {
            const rarityTag = equipment.rarity > 1 ? '[' + equipment.rarity_name + ']' : '';
            eventDrops.push('🗡️' + equipment.name + rarityTag);
            totalDrops['🗡️' + equipment.name] = (totalDrops['🗡️' + equipment.name] || 0) + 1;
            dropRarities['🗡️' + equipment.name] = Math.max(dropRarities['🗡️' + equipment.name] || 0, equipment.rarity);
            // 🗑️ 自动分解检查
            if ((user.auto_decompose_rarity || 0) > 0 && equipment.rarity <= user.auto_decompose_rarity) {
              const forge2 = loadForge(); const fw2 = forge2[user.id] || [];
              const idx2 = fw2.findIndex(w => w.id === equipment.id);
              if (idx2 >= 0) { fw2.splice(idx2, 1); forge2[user.id] = fw2; saveForge(forge2); }
              const mats2 = ['铁矿','铜矿','银矿','金矿'];
              const cnt2 = equipment.rarity * 2;
              const mat2 = mats2[Math.min(equipment.rarity-1, mats2.length-1)] || '铁矿';
              addInv(user, mat2, cnt2); totalDrops[mat2] = (totalDrops[mat2]||0) + cnt2;
              eventDrops.push('♻️已分解' + equipment.name + '→' + mat2 + 'x' + cnt2);
            } else {
              droppedWeapons.push({
                name: equipment.name, rarity: equipment.rarity, rarity_name: equipment.rarity_name,
                slot: equipment.type, stats: equipment.stats, special: equipment.special_attrs
              });
            }
          }
        }
      }
if (!user.monster_kills) user.monster_kills = {};
      user.monster_kills[monster.name] = (user.monster_kills[monster.name] || 0) + 1;
      user.total_monster_kills = (user.total_monster_kills || 0) + 1;

      // 区域额外掉落 + extra_drop_bonus
      if (region && region.region_drops) {
        const extraBonus = (region.extra_drop_bonus || {});
        for (const rd of region.region_drops) {
          let dropChance = rd.chance || 0.2;
          // 应用区域的 extra_drop_bonus（按类别提升掉率）
          const itemCat = (ITEMS.items||{})[rd.name]?.['category'] || '';
          if (itemCat && extraBonus[itemCat]) dropChance += extraBonus[itemCat];
          if (Math.random() < dropChance) {
            const cnt = parseRange(rd.count, [1, 1]);
            addInv(user, rd.name, cnt);
            totalDrops[rd.name] = (totalDrops[rd.name] || 0) + cnt;
            eventDrops.push('📍' + rd.name + (cnt > 1 ? 'x' + cnt : ''));
          }
        }
      }

      // 🏞️ 子区域额外掉落（主区域低概率触发）
      const extraDropSrc = activeSubBonus || null;
      if (extraDropSrc && extraDropSrc.extra_drops && extraDropSrc.extra_drops.length > 0) {
        const dropMult = activeSubBonus === subRegion ? 1 : 0.30;
        for (const sd of extraDropSrc.extra_drops) {
          if (Math.random() < (sd.chance || 0.15) * dropMult) {
            const cnt = parseRange(sd.count, [1, 1]);
            addInv(user, sd.name, cnt);
            totalDrops[sd.name] = (totalDrops[sd.name] || 0) + cnt;
            eventDrops.push('🏞️' + sd.name + (cnt > 1 ? 'x' + cnt : ''));
          }
        }
      }

      // 📜 区域蓝图掉落（8%概率，获得当前区域套装的一张未学习蓝图）
      if (region && Math.random() < 0.08) {
        const regionSets = (SETS_CFG.sets || []).filter(s => s.is_region_set && s.region_id === region.id);
        if (regionSets.length > 0) {
          const rset = regionSets[0];
          const allPieces = [];
          for (const [slot, piece] of Object.entries(rset.pieces || {})) {
            const bpName = piece.name + '图纸';
            if (!(user.learned_blueprints || []).includes(bpName)) {
              allPieces.push({ bpName, pieceName: piece.name });
            }
          }
          if (allPieces.length > 0) {
            const picked = pick(allPieces);
            addInv(user, picked.bpName, 1);
            totalDrops[picked.bpName] = (totalDrops[picked.bpName] || 0) + 1;
            eventDrops.push('📜' + picked.bpName);
          }
        }
      }

      // 宝石掉落 (4% + 天气加成 + 装备加成)
      const gemChance = 0.04 + (region && region.weather_immune ? 0 : (advWeather.adventure_drop || 0)) + (advGear.drop || 0);
      if (Math.random() < gemChance) {
        const gem = dropGem(user);
        totalDrops[gem.name] = (totalDrops[gem.name] || 0) + 1;
        eventDrops.push('💎' + gem.name);
      }

      // 🌙 晚上暗系怪物率提升
      if (advWeather.time_period === '晚上' && Math.random() < (advWeather.dark_monster_bonus || 0.15)) {
        const darkMonsters = ['杀手','雾气','江湖郎中','怪人','土匪头子'];
        const dm = darkMonsters[rand(0, darkMonsters.length - 1)];
        totalDrops[dm] = (totalDrops[dm] || 0) + 1;
        eventDrops.push('🌙' + dm + '(夜行)');
      }

      // 职业之魂掉落（20%概率，只掉当前职业魂）
      const soulMap = { blacksmith: '铁匠之魂', fisherman: '渔夫之魂', farmer: '农夫之魂', chef: '厨师之魂', alchemist: '药师之魂', miner: '矿工之魂' };
      if (user.profession && Math.random() < 0.20) {
        const soulName = soulMap[user.profession];
        if (soulName) {
          addInv(user, soulName, 1);
          totalDrops[soulName] = (totalDrops[soulName] || 0) + 1;
          eventDrops.push('💫' + soulName);
        }
      }
      // 副职业之魂掉落（10%概率）
      if (user.sub_professions) {
        for (const [sid, slv] of Object.entries(user.sub_professions)) {
          if (slv > 0 && soulMap[sid] && Math.random() < 0.10) {
            addInv(user, soulMap[sid], 1);
            totalDrops[soulMap[sid]] = (totalDrops[soulMap[sid]] || 0) + 1;
            eventDrops.push('💫' + soulMap[sid]);
          }
        }
      }

      // 职业专属掉落
      const profLevel = user.profession_level || 1;
      const minerBonus = getProfessionBonus(user);
      // ⛏️ 矿工职业加成 & 矿工工具
      const hasPick = (user.temp_miner_pick || 0) > 0;
      const hasOreDouble = (user.temp_ore_double || 0) > 0;
      const hasOreVein = (user.temp_ore_vein || 0) > 0;
      const oreDropChance = Math.min(0.95, (minerBonus.ore_bonus || (0.05 * profLevel)) + ((user.profession_stats || {}).ore_drop_bonus || 0));
      const shouldDrop = hasOreVein || (user.profession === 'miner' && Math.random() < oreDropChance)
                        || (hasPick && Math.random() < 0.4);
      if (shouldDrop) {
        if (hasOreVein) user.temp_ore_vein--;
        if (hasPick && !hasOreVein) user.temp_miner_pick = Math.max(0, (user.temp_miner_pick||0) - 1);
        const rareOreBoost = minerBonus.rare_ore_bonus || 0;
        // 根据矿工等级解锁专属矿石（professions.json exclusive_items）
        const commonOres = [];
        const rareOres = [];
        if (profLevel >= 2) commonOres.push('磁铁矿');
        if (profLevel >= 3) rareOres.push('萤石');
        if (profLevel >= 5) rareOres.push('火山石');
        if (profLevel >= 6) rareOres.push('绿石头');
        if (profLevel >= 7) rareOres.push('陨石');
        if (profLevel >= 9) rareOres.push('水晶矿');
        // 等级不够解锁专属矿石时，掉落基础矿石保底
        if (commonOres.length === 0) commonOres.push('铜矿', '银矿');
        if (rareOres.length === 0) rareOres.push('银矿', '金矿');
        const useRare = Math.random() < (0.3 + rareOreBoost);
        const pool = useRare ? rareOres : commonOres;
        const ore = pool[rand(0, pool.length - 1)] || '铁矿';
        let oreCnt = rand(1, Math.min(profLevel, 5));
        if (hasOreDouble) { oreCnt *= 2; user.temp_ore_double--; }
        addInv(user, ore, oreCnt);
        totalDrops[ore] = (totalDrops[ore] || 0) + oreCnt;
        eventDrops.push('⛏️' + ore + (oreCnt > 1 ? 'x' + oreCnt : ''));
        // 🏅 限定称号·职业 矿工效果：10%概率额外获得0-2个矿石
        if (user.profession === 'miner' && user.equipped_title === '限定称号·职业' && Math.random() < 0.1) {
          const bonusCnt = Math.floor(Math.random() * 3);
          if (bonusCnt > 0) { addInv(user, ore, bonusCnt); eventDrops.push('🎁' + ore + 'x' + bonusCnt); }
        }
      }
      // 渔夫/农夫专属掉落移至对应活动（钓鱼/收割）

      // 矿山小毛贼商人（独立于no_merchant标志）
      if (region && region.goblin_merchant_chance && Math.random() < (region.goblin_merchant_chance || 0.2)) {
        const pool = [...(region.goblin_merchant_items || [])];
        const gCount = rand(2, 4);
        for (let gi = pool.length - 1; gi > 0; gi--) { const gj = rand(0, gi); [pool[gi], pool[gj]] = [pool[gj], pool[gi]]; }
        const gItems = pool.slice(0, Math.min(gCount, pool.length)).map(item => ({
          name: item.name, price: parseRange(item.price, [50, 200]),
          rarity: item.rarity || 1
        }));
        if (!user.pending_goblin_merchant) user.pending_goblin_merchant = [];
        user.pending_goblin_merchant.push({ id: uid(), name: '小毛贼商人', items: gItems, added_at: now() });
      }

      // 神秘商人 (矿山区域不触发普通神秘商人)
      if (!region || !region.no_merchant) {
        if (event.merchant_spawn_chance && Math.random() < (event.merchant_spawn_chance)) {
          const mItems = generateMerchantItems();
          if (!user.pending_merchant) user.pending_merchant = [];
          user.pending_merchant.push({ id: uid(), name: mItems.map(m => m.name).join('、'), items: mItems, added_at: now() });
        }
      }

      results.push({ type: 'combat', win: true, text: event.text || `战胜了${monster.name}！`, monster: monster.name, monster_level: monster.level, monster_rarity: eventRarity,
        coins, exp: expGain, drops: eventDrops, isElite, weapon_drops: droppedWeapons,
        battle_summary: { damage_dealt: battle.damage_dealt, damage_taken: battle.damage_taken, turns: battle.turns, crits: battle.crits, dodges: battle.dodges, detail: battle.detail },
        newbie_protection: battle.newbie_guardian || false });
    } else {
        deaths++;
        results.push({ type: 'combat', win: false, text: `被${monster.name}击败了...`, monster: monster.name, monster_level: monster.level, monster_rarity: eventRarity, exp: expGain, isElite,
          battle_summary: { damage_dealt: battle.damage_dealt, damage_taken: battle.damage_taken, turns: battle.turns, crits: battle.crits, dodges: battle.dodges, detail: battle.detail } });
      }
    // 🏚️ 废墟发现：子区域有"废墟"加成时概率发现，主区域低概率触发
    const ruinsSrc = activeSubBonus || null;
    const ruinsBonus = (ruinsSrc && ruinsSrc.event_bonus && ruinsSrc.event_bonus['废墟']) ? ruinsSrc.event_bonus['废墟'] : 0;
    const isMainRegion = !subRegion && !!ruinsSrc; // 主区域随机触发的子区域
    const discoverChance = ruinsBonus > 0 ? (0.10 + ruinsBonus * 0.5) * (isMainRegion ? 0.40 : 1) :
      (region && (region.sub_regions || []).some(sr => sr.event_bonus && sr.event_bonus['废墟']) ? 0.03 : 0);
    if (discoverChance > 0 && Math.random() < discoverChance) {
        // 优先选该区域关联的废墟中玩家等级可进入的
        const regionId = region ? region.id : null;
        const allRuins = (RUINS_CFG.ruins || []).filter(r => (user.level || 1) >= (r.min_level || 1));
        const regionRuins = regionId ? allRuins.filter(r => (r.region || []).includes(regionId)) : [];
        const pool = regionRuins.length > 0 ? regionRuins : (allRuins.length > 0 ? allRuins : (RUINS_CFG.ruins || []));
        const pickedRuins = pool[Math.floor(Math.random() * pool.length)];
        const ticketName = pickedRuins ? (pickedRuins.ticket || '废墟探索卷轴') : '废墟探索卷轴';
        const scrollCnt = rand(1, 2);
        addInv(user, ticketName, scrollCnt);
        results.push({ type: 'ruins', ruins_discovered: true, ruins_scroll: scrollCnt, scroll_name: ticketName,
          ruins_name: pickedRuins ? pickedRuins.name : '未知废墟',
          text: `🏚️ 在探索中你发现了一处隐藏的废墟入口！获得了「${ticketName}」。`, exp: Math.floor((user.level || 1) * 1.5) });
      }
  }

  user.adventure_count = (user.adventure_count || 0) + count;

  // 每日任务进度追踪
  const questsCompleted = [];
  questsCompleted.push(...updateQuestProgress(user, 'adventure_times', count));
  if (results.filter(r => r.win === true).length > 0) questsCompleted.push(...updateQuestProgress(user, 'win_battles', results.filter(r => r.win === true).length));
  const monstersKilled = results.filter(r => r.type === 'combat' && r.win).length;
  if (monstersKilled > 0) {
    questsCompleted.push(...updateQuestProgress(user, 'kill_monsters', monstersKilled));
    const rareKills = results.filter(r => r.type === 'combat' && r.win && (r.monster_rarity || 1) >= 3).length;
    if (rareKills > 0) questsCompleted.push(...updateQuestProgress(user, 'kill_rare_monsters', rareKills));
  }
  // 区域探索任务
  if (region) {
    const regionQuests = (user.daily_quests || []).filter(q => q.id.startsWith('reach_region_') && !q.completed && !q.claimed);
    for (const rq of regionQuests) {
      if (rq.desc.includes(region.name)) questsCompleted.push(...updateQuestProgress(user, 'reach_region', count));
    }
  }
  // 追踪矿石/材料掉落
  let totalOreDrops = 0, totalMatDrops = 0;
  for (const [k, v] of Object.entries(totalDrops)) {
    const cat = itemCategory(k);
    if (cat === 'ore') totalOreDrops += v;
    else if (cat === 'material') totalMatDrops += v;
  }
  if (totalOreDrops > 0) questsCompleted.push(...updateQuestProgress(user, 'collect_ores', totalOreDrops));
  if (totalMatDrops > 0) questsCompleted.push(...updateQuestProgress(user, 'collect_materials', totalMatDrops));

  // 活动代币汇总
  let eventCurrencyGained = null;
  if (eventCurrencyTotal > 0) {
    eventCurrencyGained = { name: eventCurrencyName, emoji: eventCurrencyEmoji, amount: eventCurrencyTotal, total: user.event_currencies[eventCurrencyName] };
    results.push({ type: 'event_currency', text: `${eventCurrencyEmoji} 本次冒险共获得${eventCurrencyName} x${eventCurrencyTotal}！（共${user.event_currencies[eventCurrencyName]}个）`, currency: eventCurrencyName, amount: eventCurrencyTotal });
  }

  // 🎪 活动加成区域：额外掉落/经验/金币（在减半前计算）
  if (evtBonus) {
    if (evtBonus.coin_bonus) { const bonusCoin = Math.floor(totalCoins * evtBonus.coin_bonus); user.coins = (user.coins||0) + bonusCoin; totalCoins += bonusCoin; results.push({ type: 'system', text: '🏖️ 活动加成区域：金币 +' + bonusCoin.toLocaleString() }); }
    if (evtBonus.exp_bonus) { const bonusExp = Math.floor(totalExp * evtBonus.exp_bonus); totalExp += addExp(user, bonusExp); results.push({ type: 'system', text: '🏖️ 活动加成区域：经验 +' + bonusExp.toLocaleString() }); }
  }

  // 🎒 冒险装备加成（在减半前计算，基于全额收益）
  if (advGear.coin) { const gearCoin = Math.floor(totalCoins * advGear.coin); user.coins = (user.coins||0) + gearCoin; totalCoins += gearCoin; }
  if (advGear.exp) { const gearExp = Math.floor(totalExp * advGear.exp); totalExp += addExp(user, gearExp); }

  // 🍀 旧硬币：冒险金币翻倍（在减半前计算，基于全额收益）
  if ((user.temp_coin_double || 0) > 0) { const extra = totalCoins; totalCoins *= 2; user.coins = (user.coins || 0) + extra; user.temp_coin_double--; }

  // 冒险收益减半（仅调整显示数值，玩家实际获得全额）
  const halfCoins = Math.floor(totalCoins / 2);
  const halfExp = Math.floor(totalExp / 2);
  // 注意：coins和exp已在循环中直接加入玩家，这里不再扣除
  totalCoins -= halfCoins;
  totalExp -= halfExp;

  // 🔧 冒险装备耐久消耗（每次冒险50%概率扣1耐久）
  let gearBroken = false, gearName_broken = '';
  if (user.equipped_adv_gear) {
    for (let d = 0; d < count; d++) {
      if (Math.random() < 0.5) user.adv_gear_durability = Math.max(0, (user.adv_gear_durability || 0) - 1);
    }
    if ((user.adv_gear_durability || 0) <= 0) {
      gearName_broken = user.equipped_adv_gear;
      user.equipped_adv_gear = '';
      user.adv_gear_durability = 0;
      gearBroken = true;
      // 耐久归零消耗一件
      remInv(user, gearName_broken, 1);
    }
  }

  saveUser(req.userToken, user);
  checkTitleMilestones(user);

  const newRl = checkRateLimit(user, 'adventure');
  const gearInfo = user.equipped_adv_gear ? { name: user.equipped_adv_gear, durability: user.adv_gear_durability || 0 } : null;
  const statsFinal = getPlayerStats(user);
  // 🏷️ 构建带稀有度的掉落列表供前端着色
  const totalDropsList = Object.entries(totalDrops).map(([name, count]) => {
    let rarity = dropRarities[name] || 0;
    // 非武器物品从 ITEMS 配置查稀有度
    if (!rarity && !name.startsWith('🗡️')) {
      const itemDef = (ITEMS.items || {})[name];
      rarity = itemDef ? (itemDef.rarity || 1) : 1;
    }
    return { name, count, rarity: rarity || 1 };
  });

  // 📦 自动出售多余材料
  const autoSellMax = user.auto_sell_max || 0;
  if (autoSellMax > 0) {
    const soldItems = [];
    for (const [itemName, cnt] of Object.entries(user.inventory || {})) {
      if (typeof cnt !== 'number' || cnt <= autoSellMax) continue;
      const excess = cnt - autoSellMax;
      const itemDef = (ITEMS.items || {})[itemName];
      if (!itemDef || !itemDef.price) continue; // 不可出售的物品跳过
      const sellPrice = itemDef.price || 1;
      const revenue = excess * sellPrice;
      user.inventory[itemName] = autoSellMax;
      user.coins = (user.coins || 0) + revenue;
      soldItems.push(itemName + 'x' + excess + '(+' + revenue.toLocaleString() + '💰)');
    }
    if (soldItems.length > 0) {
      results.push({ type: 'system', text: '📦 自动出售多余材料: ' + soldItems.join(', ') });
    }
  }

  // 🎯 职业金币/经验加成
  if (profBonus.adv_coin) { const coinBonus = Math.floor(totalCoins * profBonus.adv_coin); user.coins = (user.coins||0) + coinBonus; totalCoins += coinBonus; }
  if (profBonus.adv_exp) { const expBonus = Math.floor(totalExp * profBonus.adv_exp); totalExp += addExp(user, expBonus); }

  saveUser(req.userToken, user);
  checkTitleMilestones(user);

  res.json({ count, results, total_exp: totalExp, total_coins: totalCoins,
    total_drops: totalDropsList,
    deaths, level: user.level, exp: user.exp,
    hp: { current: user.current_hp != null ? user.current_hp : statsFinal.hp, max: statsFinal.hp },
    quests_completed: questsCompleted,
    event_currency: eventCurrencyGained,
    gear_broken: gearBroken, gear_broken_name: gearName_broken, gear: gearInfo,
    rate_used: newRl.used, rate_max: newRl.max,
    pending_lolis: (user.pending_lolis || []).length > 0,
    pending_merchant: (user.pending_merchant || []).length > 0,
    region: region ? { id: region.id, name: region.name, icon: region.icon } : null,
  });
});

// -- 萝莉领养/帮助 --
app.get('/api/pending-lolis', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  cleanPendingExpired(user); saveUser(req.userToken, user);
  res.json({ lolis: user.pending_lolis || [] });
});
app.post('/api/loli/handle', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  cleanPendingExpired(user);
  const { loliIndex, loliName, action } = req.body;
  if (!action || !['adopt','help'].includes(action)) return res.json({ error: '无效的操作' });
  let idx = parseInt(loliIndex, 10);
  if (loliName && user.pending_lolis) {
    idx = user.pending_lolis.findIndex(l => l.name === loliName);
  }
  if (isNaN(idx) || !user.pending_lolis || idx < 0 || idx >= user.pending_lolis.length) return res.json({ error: '该萝莉已离开（5分钟未确认自动消失）' });
  const loliEncounter = user.pending_lolis[idx];
  const name = loliEncounter.name;

  if (action === 'adopt') {
    if (!user.lolis) user.lolis = [];
    if (user.lolis.length >= 8) return res.json({ error: '同伴已满（8个）' });
    const loliCfg = (LOLI.lolis || []).find(l => l.name === name) || { name, rarity: 1, base_bonus: { coin: 0.05, drop: 0.05 }, max_level: 10 };
    user.lolis.push({ name, rarity: loliEncounter.rarity || 1, level: 1, exp: 0, favor: 0, base_bonus: loliCfg.base_bonus, max_level: loliCfg.max_level || 10, dispatch: null });
    user.pending_lolis.splice(idx, 1);
    saveUser(req.userToken, user);
    return res.json({ action: 'adopt', name, total: user.lolis.length });
  }

  if (action === 'help') {
    const coins = parseRange(loliEncounter.help_coins || [50, 120], [50, 120]);
    user.coins = (user.coins || 0) + coins;
    const expGain = addExp(user, loliEncounter.help_exp || 40);
    for (const d of (loliEncounter.help_drops || [])) {
      const p = parseDropString(d);
      addInv(user, p.name, p.count);
    }
    for (const d of (loliEncounter.drops || [])) {
      const p = parseDropString(d);
      addInv(user, p.name, p.count);
    }
    user.pending_lolis.splice(idx, 1);
    saveUser(req.userToken, user);
    return res.json({ action: 'help', coins, exp: expGain, name });
  }

  res.json({ error: '无效操作' });
});

// -- 神秘商人 --
app.get('/api/merchant', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  cleanPendingExpired(user); saveUser(req.userToken, user);
  res.json({
    merchants: user.pending_merchant || [],
    goblin_merchants: user.pending_goblin_merchant || [],
    count: (user.pending_merchant || []).length + (user.pending_goblin_merchant || []).length
  });
});
app.post('/api/merchant/buy', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  cleanPendingExpired(user);
  const { merchantIndex, itemIndex, isGoblin } = req.body;
  const list = isGoblin ? (user.pending_goblin_merchant || []) : (user.pending_merchant || []);
  if (!list[merchantIndex]) return res.json({ error: '商人已离开' });
  const merchant = list[merchantIndex];
  const item = merchant.items[itemIndex];
  if (!item) return res.json({ error: '商品不存在' });
  const price = item.price; // 价格在生成时已解析
  if ((user.coins || 0) < price) return res.json({ error: `金币不足，需要${price}` });
  user.coins -= price;
  // 神秘商人宝石处理
  let gemResult = null;
  if (item.type === 'gem' && item.gem_rarity) {
    const [minR, maxR] = item.gem_rarity;
    const gem = dropGemInRange(user, minR, maxR);
    gemResult = { name: gem.name, stat: gem.stat, value: gem.value, rarity: gem.rarity };
  } else {
    addInv(user, item.name);
  }
  merchant.items.splice(itemIndex, 1);
  if (merchant.items.length === 0) {
    if (isGoblin) user.pending_goblin_merchant.splice(merchantIndex, 1);
    else user.pending_merchant.splice(merchantIndex, 1);
  }
  saveUser(req.userToken, user);
  res.json({ item: item.name, price, remaining_coins: user.coins, isGoblin: !!isGoblin, gem: gemResult });
});

// -- 鱼竿/鱼饵装备 --
// -- 冒险中批量钓鱼（独立消耗钓鱼次数） --
app.post('/api/adventure/fish-batch', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  if (user.current_hp <= 0) return res.json({ error: '💔 体力不支，无法钓鱼！' });
  const fr = checkRateLimit(user, 'fishing');
  if (!fr.allowed) return res.json({ error: `钓鱼次数已达上限 (${fr.used}/${fr.max}每小时)` });
  const count = Math.min(req.body.count || 1, 15, fr.max - fr.used);
  if (count < 1) return res.json({ error: '钓鱼次数已用完' });
  const regionId = user.adventure_region || 'plains';
  const region = (REGIONS.regions || []).find(r => r.id === regionId) || { id: 'plains' };
  const subRegionId = user.adventure_sub_region;
  let subRegion = null;
  if (region.sub_regions && subRegionId && subRegionId !== 'any') {
    subRegion = region.sub_regions.find(sr => sr.id === subRegionId);
  }
  const results = [];
  let totalExp = 0, totalCoins = 0, fishCaught = 0;
  for (let i = 0; i < count; i++) {
    if (user.current_hp <= 0) { results.push({ type: 'fail', text: '💔 体力不支，钓鱼中断！' }); break; }
    const r = doAdventureFishing(user, region, subRegion, null);
    if (r.skipped) { results.push(r); break; }
    results.push(r);
    if (r.exp) totalExp += r.exp;
    if (r.coins) totalCoins += r.coins;
    if (r.fish) fishCaught++;
  }
  updateQuestProgress(user, 'fish_catch', fishCaught);
  saveUser(req.userToken, user);
  checkTitleMilestones(user);
  const fr2 = checkRateLimit(user, 'fishing');
  res.json({ results, total_exp: totalExp, total_coins: totalCoins, count: results.length, rate_used: fr2.used, rate_max: fr2.max });
});
// -- 鱼缸系统 --
function getFishTankCapacity(user) { return 15 + Math.floor((user.level || 1) / 3); }
app.get('/api/fish-tank', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const tank = user.fish_tank || [];
  const capacity = getFishTankCapacity(user);
  // 补全鱼的稀有度信息
  const fishInfo = {};
  for (const f of (DIAOYU.fish || [])) fishInfo[f.name] = f.rarity || 1;
  const tankWithRarity = tank.map(f => ({ ...f, rarity: f.rarity || fishInfo[f.name] || 1 }));
  const allFishNames = (DIAOYU.fish || []).map(f => f.name);
  const allJunkNames = (DIAOYU.junk || []).map(j => j.name);
  res.json({ fish: tankWithRarity, capacity, used: tank.length, fish_names: allFishNames, junk_names: allJunkNames });
});
app.post('/api/fish-tank/add', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { fishName } = req.body;
  if (!hasInv(user, fishName, 1)) return res.json({ error: '背包中没有该物品' });
  const capacity = getFishTankCapacity(user);
  if (!user.fish_tank) user.fish_tank = [];
  if (user.fish_tank.length >= capacity) return res.json({ error: `鱼缸已满 (${user.fish_tank.length}/${capacity})` });
  // 从背包移除
  remInv(user, fishName, 1);
  // 获取鱼的体重记录
  const collection = user.fish_collection || {};
  const fishInfo = (DIAOYU.fish || []).find(f => f.name === fishName) || {};
  const weight = collection[fishName] || fishInfo.base_weight || 100;
  user.fish_tank.push({ name: fishName, weight, rarity: fishInfo.rarity || 1, added_at: Math.floor(Date.now() / 1000) });
  saveUser(req.userToken, user);
  res.json({ added: fishName, weight, used: user.fish_tank.length, capacity });
});
app.post('/api/fish-tank/remove', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { index } = req.body;
  if (!user.fish_tank || index < 0 || index >= user.fish_tank.length) return res.json({ error: '无效的鱼缸位置' });
  const removed = user.fish_tank.splice(index, 1)[0];
  addInv(user, removed.name, 1);
  saveUser(req.userToken, user);
  res.json({ removed: removed.name, used: user.fish_tank.length });
});

app.get('/api/fishing/gear', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const rods = YUGAN.rods || [];
  const baits = YUER.baits || [];
  // 玩家拥有的鱼竿（从背包检查）
  const ownedRods = rods.filter(r => r.price === 0 || hasInv(user, r.name));
  const ownedBaits = baits.filter(b => hasInv(user, b.name) || (user.bait_data||{})[b.name]);
  const baitQty = {};
  for (const b of baits) {
    const q = countInv(user, b.name) + ((user.bait_data||{})[b.name]||0);
    if (q > 0) baitQty[b.name] = q;
  }
  res.json({
    equipped_rod: user.equipped_rod || YUGAN.default_rod,
    equipped_bait: user.equipped_bait || null,
    rods: rods,
    baits: baits,
    owned_rods: ownedRods.map(r => r.name),
    owned_baits: ownedBaits.map(b => b.name),
    bait_qty: baitQty,
  });
});
app.post('/api/fishing/equip-rod', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const rodName = req.body.rodName;
  const rod = (YUGAN.rods || []).find(r => r.name === rodName);
  if (!rod) return res.json({ error: '鱼竿不存在' });
  user.equipped_rod = rodName;
  saveUser(req.userToken, user);
  res.json({ equipped: rodName });
});
app.post('/api/fishing/equip-bait', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const baitName = req.body.baitName;
  if (baitName === 'none' || baitName === '无') {
    user.equipped_bait = null;
    saveUser(req.userToken, user);
    return res.json({ equipped: null });
  }
  const bait = (YUER.baits || []).find(b => b.name === baitName);
  if (!bait) return res.json({ error: '鱼饵不存在' });
  // 检查是否真正拥有
  if (!hasInv(user, baitName) && !(user.bait_data || {})[baitName]) return res.json({ error: '你没有这个鱼饵' });
  user.equipped_bait = baitName;
  saveUser(req.userToken, user);
  res.json({ equipped: baitName });
});

// -- 合成鱼饵 --
app.post('/api/fishing/synth-bait', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const materials = req.body.materials || [];
  if (materials.length < 2 || materials.length > 4) return res.json({ error: '需要2-4个材料' });
  const batches = Math.min(req.body.count || 1, 100); // 一次最多合成100批
  // 检查所有材料是否够
  for (const m of materials) {
    if (!hasInv(user, m, batches)) return res.json({ error: `${m} 不足(需要${batches}个，有${countInv(user, m)}个)` });
  }
  // 消耗材料
  for (const m of materials) remInv(user, m, batches);
  // 批量生成鱼饵
  const baitNames = (YUER.baits||[]).map(b=>b.name);
  const results = {};
  for (let b = 0; b < batches; b++) {
    const bait = baitNames[Math.floor(Math.random() * Math.min(materials.length, baitNames.length))] || '蚯蚓';
    addInv(user, bait);
    results[bait] = (results[bait] || 0) + 1;
  }
  saveUser(req.userToken, user);
  const summary = Object.entries(results).map(([name, cnt]) => `${name} x${cnt}`).join(', ');
  res.json({ baits: results, summary, batches, materials_used: materials.length * batches });
});

// -- 钓鱼 --
app.post('/api/fishing/cast', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);

  const rl = checkRateLimit(user, 'fishing');
  if (!rl.allowed) return res.json({ error: `钓鱼次数已达上限 (${rl.used}/${rl.max}每小时)` });

  // ❤️ HP检查：不满血时自动使用血药（如果设置了）
  ensureHp(user);
  if (autoUseHpPotion(user)) saveUser(req.userToken, user);
  if (user.current_hp <= 0) return res.json({ error: '💔 体力不支，无法钓鱼！请使用生命药剂恢复或等待自然恢复' });

  const count = Math.min(req.body.count || 1, 15, rl.max - rl.used);
  if (count < 1) return res.json({ error: '钓鱼次数已用完' });

  const rodName = user.equipped_rod || '竹竿';
  const rod = (YUGAN.rods || []).find(r => r.name === rodName) || { fail_reduction: 0, rare_bonus: 0 };

  // 🌤 水域 & 天气
  const areaId = user.fishing_area || 'creek';
  const area = (FISHING_AREAS.areas || []).find(a => a.id === areaId) || (FISHING_AREAS.areas || [])[0] || {};
  const weather = getWeatherState();
  const weatherImmune = area.weather_immune;

  let failChance = (DIAOYU.fail_chance || 0.25) - (rod.fail_reduction || 0) + (area.fail_modifier || 0);
  failChance = Math.max(0.02, failChance - ((user.skills || {}).fishing_success || 0) * 0.005);

  // 🎣 渔夫职业加成
  const profBonus = getProfessionBonus(user);
  if (profBonus.fishing_bonus) {
    failChance = Math.max(0.01, failChance - profBonus.fishing_bonus);
  }
  // 渔夫斗笠：深海/深水区额外 -5% 失败率
  if (user.profession === 'fisherman' && user.profession_stats && user.profession_stats.speed >= 12) {
    if (areaId === 'deepsea' || areaId === 'abyss') failChance = Math.max(0.01, failChance - 0.05);
  }

  // 🎋 季节钓鱼加成
  const seasonState2 = getSeasonState();
  failChance = Math.max(0.01, failChance - (seasonState2.season_fish_bonus || 0) - (seasonState2.season_effects?.fish_bonus || 0));
  // 天气影响（非天气免疫水域）
  if (!weatherImmune) {
    failChance = Math.max(0.01, failChance - (weather.fish_bonus || 0));
    // 暴风雨：渔夫失败率减半
    if (weather.weather === '暴风雨' && user.profession === 'fisherman') {
      failChance = failChance * 0.5;
    }
  }

  // 鱼饵（failChance 的饵料部分在循环内动态计算，消费后失效）
  let autoBait = user.equipped_bait;

  // 水域鱼池和垃圾池
  const areaFishNames = area.fish_pool || [];
  const areaJunk = area.junk_pool || [];
  let fishPool = (DIAOYU.fish || []).filter(f => areaFishNames.includes(f.name));
  if (fishPool.length === 0) fishPool = (DIAOYU.fish || []).filter(f => f.rarity > 0);
  // 🎋 季节过滤：移除当季不可钓的鱼，添加当季专属鱼
  const offSeasonFish = getOffSeasonFish(seasonState2.season_id);
  const seasonalFish = getSeasonalFish(seasonState2.season_id);
  if (offSeasonFish.length > 0) fishPool = fishPool.filter(f => !offSeasonFish.includes(f.name));
  if (seasonalFish.length > 0) {
    for (const sf of seasonalFish) {
      const sfDef = (DIAOYU.fish || []).find(f => f.name === sf);
      if (sfDef && !fishPool.find(f => f.name === sf)) fishPool.push(sfDef);
    }
  }
  // 时段加成鱼（time_bonus_fish 配置中特定时段出率提升）
  const timeBonusFish = WEATHER_CFG.time_bonus_fish || {};

  const results = [];
  let totalExp = 0, totalCoins = 0;
  const totalFish = [];

  // 活动代币
  let eventCurrencyTotal = 0, eventCurrencyName = '', eventCurrencyEmoji = '';
  const evtState = getEventState();
  const evtCur = (evtState.is_active && evtState.cfg) ? (evtState.cfg.currency || null) : null;
  function tryFishEventDrop(cur) {
    if (!cur) return;
    if (Math.random() < (cur.fishing_rate || 0.15)) {
      const amt = rand(cur.fishing_min || 1, cur.fishing_max || 2);
      if (!user.event_currencies) user.event_currencies = {};
      user.event_currencies[cur.name] = (user.event_currencies[cur.name] || 0) + amt;
      eventCurrencyTotal += amt; eventCurrencyName = cur.name; eventCurrencyEmoji = cur.emoji || '🪙';
    }
  }

  for (let i = 0; i < count; i++) {
    // ❤️ 体力检查（开始前已补满，不再自动喝药）
    if (user.current_hp <= 0) saveUser(req.userToken, user);
    if (user.current_hp <= 0) { results.push({ type: 'fail', text: '💔 体力不支，钓鱼中断！' }); break; }
    addRateCount(user, 'fishing');
    tryFishEventDrop(evtCur);

    // 消耗鱼饵
    let baitConsumed = false;
    if (autoBait && hasInv(user, autoBait)) { remInv(user, autoBait, 1); baitConsumed = true; }
    else if (autoBait && (user.bait_data || {})[autoBait]) {
      user.bait_data[autoBait]--; if (user.bait_data[autoBait] <= 0) delete user.bait_data[autoBait];
      baitConsumed = true;
    }
    if (autoBait && !baitConsumed) {
      user.equipped_bait = null;
      autoBait = null;
    }
    // 🎣 动态计算 failChance（含当前饵料加成，饵料消耗后失效）
    let currentFailChance = failChance;
    if (autoBait) {
      const bait = (YUER.baits || []).find(b => b.name === autoBait);
      if (bait) currentFailChance = Math.max(0.01, currentFailChance - (bait.fail_reduction || 0));
    }

    if (Math.random() < currentFailChance) {
      // 深水区无垃圾（完全阻止垃圾，不再50%概率泄露）
      if (area.no_junk) {
        results.push({ type: 'fail', text: '深水区的力量抗拒了你的鱼钩...' });
        continue;
      }
      // 深海额外海草
      if (!area.no_junk && (area.seaweed_rate || 0) > 0 && Math.random() < area.seaweed_rate) {
        addInv(user, '水草', 1);
        totalExp += addExp(user, 3);
        results.push({ type: 'junk', text: '海草缠住了鱼钩...', name: '水草', value: 0 });
        continue;
      }
      if (Math.random() < 0.5) {
        const junkPool = areaJunk.length > 0 ? areaJunk : (DIAOYU.junk || []).map(j => j.name);
        const junkName = junkPool[rand(0, junkPool.length - 1)];
        const junk = (DIAOYU.junk || []).find(j => j.name === junkName) || { name: junkName || '树枝', value: [1, 4], exp: 2, text: '挂上来' + (junkName || '树枝') };
        addInv(user, junk.name);
        totalExp += addExp(user, junk.exp || 2);
        results.push({ type: 'junk', text: junk.text, name: junk.name, value: 0 });
      } else {
        results.push({ type: 'fail', text: '鱼脱钩了...' });
      }
      continue;
    }

    // 成功
    // 🎣 鱼群探测器：强制稀有以上
    let forceRare = false;
    if ((user.temp_rare_fish || 0) > 0) { user.temp_rare_fish--; forceRare = true; }
    // 🪝 精钢鱼钩（铁匠联动）：稀有率+10%
    let steelHookBonus = 0;
    if ((user.temp_rare_fish_boost || 0) > 0) { user.temp_rare_fish_boost--; steelHookBonus = 0.10; }
    let rareBonus = (rod.rare_bonus || 0) + (profBonus.rare_fish_bonus || 0) + ((user.skills || {}).fishing_rare || 0) * 0.008 + steelHookBonus;
    // 水域稀有加成
    rareBonus += (area.rare_bonus || 0);
    // 天气稀有加成（非免疫水域）
    if (!weatherImmune) rareBonus += (weather.rare_bonus || 0);
    // 渔夫小雨加成
    if (!weatherImmune && user.profession === 'fisherman' && weather.weather === '小雨') rareBonus += 0.05;

    let finalFishPool = fishPool.filter(f => f.rarity > 0);
    if (forceRare) finalFishPool = finalFishPool.filter(f => f.rarity >= 3);
    if (finalFishPool.length === 0) finalFishPool = fishPool.filter(f => f.rarity > 0);
    // 时段权重加成
    const currentPeriod = weather.time_period;
    const fish = weightedPick(finalFishPool, f => {
      let baseW = (DIAOYU.rarity_weights || { 1: 43, 2: 25, 3: 20, 4: 11, 999: 1 })[String(f.rarity)] || 1;
      if (f.rarity >= 3) baseW *= (1 + rareBonus);
      // 时段加成：特定鱼在特定时段权重翻倍
      const bonusPeriods = timeBonusFish[f.name] || [];
      if (bonusPeriods.includes(currentPeriod)) baseW *= 2;
      return baseW;
    });
    if (!fish) { results.push({ type: 'fail', text: '鱼群都跑光了...' }); continue; }
    const value = parseRange(fish.value, [10, 30]);
    // 鱼不自动出售，只进背包
    const fishingExpBonus = ((user.profession_stats || {}).fishing_exp_bonus || 0);
    totalExp += addExp(user, Math.floor((fish.exp || 10) * (1 + fishingExpBonus)));

    const baseWeight = fish.base_weight || 100;
    const variance = DIAOYU.weight_variance || 0.1;
    const weight = Math.max(0.01, Math.round(baseWeight * (1 + randFloat(-variance, variance)) * 100) / 100);
    const giantThreshold = DIAOYU.giant_rarity != null ? DIAOYU.giant_rarity : 999;
    const isGiant = (fish.rarity || 1) >= giantThreshold && Math.random() < 0.1;
    const actualWeight = isGiant ? weight * (DIAOYU.giant_weight_multiplier || 10) : weight;

    addInv(user, fish.name);
    // 🏅 限定称号·职业 渔夫效果：10%概率额外获得0-2条鱼
    if (user.profession === 'fisherman' && user.equipped_title === '限定称号·职业' && Math.random() < 0.1) {
      const bonusFish = Math.floor(Math.random() * 3);
      if (bonusFish > 0) addInv(user, fish.name, bonusFish);
    }
    totalFish.push(fish.name);
    if (!user.fish_collection) user.fish_collection = {};
    user.fish_collection[fish.name] = Math.max(user.fish_collection[fish.name] || 0, actualWeight);
    user.total_fish_count = (user.total_fish_count || 0) + 1;

    results.push({ type: 'fish', text: fish.text || `钓到了${fish.name}！`, name: fish.name, rarity: fish.rarity, weight: actualWeight, giant: isGiant, value });

    // 🎣 稀有宝物判定（每次成功钓鱼后）
    if (DIAOYU_RARE && DIAOYU_RARE.rare_treasures) {
      for (const rt of DIAOYU_RARE.rare_treasures) {
        if (Math.random() < (rt.chance || 0)) {
          if (rt.category === 'gem' && rt.gem_rarity) {
            const [minR, maxR] = rt.gem_rarity;
            const gem = dropGemInRange(user, minR, maxR);
            results.push({ type: 'treasure', text: `🎉 ${rt.desc || '发现了一颗宝石！'}`, name: gem.name, gem: { name: gem.name, stat: gem.stat, value: gem.value, rarity: gem.rarity } });
            if (rt.rarity >= (DIAOYU_RARE.notification_min_rarity || 3)) {
              io.emit('announcement', { msg: `🎣 ${user.username} 在钓鱼时发现了${gem.name}！` });
            }
          } else {
            addInv(user, rt.name, 1);
            results.push({ type: 'treasure', text: `🎉 ${rt.desc || '发现了好东西！'}`, name: rt.name });
          }
          break; // 一次只触发一个稀有宝物
        }
      }
    }

    // 🎣 渔夫职业专属：按水域分布，各等级可钓到不同的专属鱼类
    if (user.profession === 'fisherman') {
      const profLevel = user.profession_level || 1;
      const profFishPool = [];
      // 深海/深水区专属
      if (areaId === 'deepsea' || areaId === 'abyss') {
        if (profLevel >= 9) profFishPool.push('深海龙鲸');
        if (profLevel >= 7) profFishPool.push('龙鱼');
        if (profLevel >= 5) profFishPool.push('月光水母');
        if (profLevel >= 3) profFishPool.push('金鲤鱼');
        if (profLevel >= 2) profFishPool.push('彩虹鳟鱼');
      }
      // 深水区额外加成
      const exclusiveMult = (areaId === 'abyss') ? 0.5 : 0.33;
      let exclusiveChance = (profBonus.rare_fish_bonus || 0) * exclusiveMult;
      // 晚上渔夫专属鱼 +50%
      if (!weatherImmune && weather.time_period === '晚上') exclusiveChance *= 1.5;
      if (profFishPool.length > 0 && Math.random() < exclusiveChance) {
        const fItem = profFishPool[rand(0, profFishPool.length - 1)];
        addInv(user, fItem, 1);
        totalFish.push(fItem);
        var profWeight;
        if (fItem === '深海龙鲸') profWeight = randFloat(5000, 12000);
        else if (fItem === '龙鱼') profWeight = randFloat(2000, 5000);
        else if (fItem === '月光水母') profWeight = randFloat(200, 800);
        else if (fItem === '彩虹鳟鱼') profWeight = randFloat(800, 2000);
        else profWeight = randFloat(500, 1500);
        results.push({ type: 'fish', text: '🎣渔夫之幸运！额外获得 ' + fItem, name: fItem, rarity: 4, weight: Math.round(profWeight * 100) / 100, giant: false, value: 0, profession_bonus: true });
      }
      // 渔夫水域材料掉落
      const areaMats = {
        creek: ['软泥粘液','蜘蛛丝'],
        lake: ['蜂蜜','稻草'],
        river: ['蜂王浆','发光鱿鱼'],
        deepsea: ['发光鱿鱼','软泥粘液'],
        abyss: ['蜂王浆','蜘蛛丝']
      };
      const matDropChance = Math.min(0.40, profLevel * 0.03);
      if (Math.random() < matDropChance) {
        const fishMats = areaMats[areaId] || ['软泥粘液','蜘蛛丝','蜂蜜','稻草','蜂王浆'];
        const matName = fishMats[rand(0, fishMats.length - 1)];
        const matCnt = rand(1, 2);
        addInv(user, matName, matCnt);
        results.push({ type: 'material', text: '🎣垂钓之余捡到材料：' + matName + ' ×' + matCnt, name: matName, count: matCnt, profession_bonus: true });
      }
    }
  }

  // 每日任务追踪 - 钓鱼
  const questsCompleted = [];
  const fishCaught = results.filter(r => r.type === 'fish').length;
  if (fishCaught > 0) questsCompleted.push(...updateQuestProgress(user, 'fish_catch', fishCaught));

  // 活动代币汇总
  let eventCurrencyGained = null;
  if (eventCurrencyTotal > 0) {
    eventCurrencyGained = { name: eventCurrencyName, emoji: eventCurrencyEmoji, amount: eventCurrencyTotal, total: user.event_currencies[eventCurrencyName] };
    results.push({ type: 'event_currency', text: `${eventCurrencyEmoji} 本次钓鱼共获得${eventCurrencyName} x${eventCurrencyTotal}！（共${user.event_currencies[eventCurrencyName]}个）`, currency: eventCurrencyName, amount: eventCurrencyTotal });
  }

  saveUser(req.userToken, user);
  checkTitleMilestones(user);

  const newRl = checkRateLimit(user, 'fishing');
  res.json({ count, results, total_exp: totalExp, total_coins: totalCoins, total_fish: totalFish,
    level: user.level, exp: user.exp, fish_collection: user.fish_collection,
    event_currency: eventCurrencyGained,
    rate_used: newRl.used, rate_max: newRl.max, quests_completed: questsCompleted });
});

// -- 农场 --
app.get('/api/farm', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const isFarmer = user.profession === 'farmer';
  const farms = user.farms || { plants: [], animals: [], material_plants: [], fruit_trees: [] };
  const nowSec = Math.floor(Date.now() / 1000);

  function checkFarm(slots, configField) {
    const ready = [], growing = [];
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (!slot || !slot.planted_at) continue;
      const seed = configField.find(s => s.name === slot.seed);
      if (!seed) continue;
      const elapsed = nowSec - slot.planted_at;
      if (elapsed >= (seed.growth_time || 0)) ready.push({ index: i, ...slot, seed_data: seed, elapsed, ready: true });
      else growing.push({ index: i, ...slot, seed_data: seed, remaining: Math.max(0, seed.growth_time - elapsed), ready: false });
    }
    return { ready, growing };
  }

  res.json({
    is_farmer: isFarmer,
    farms,
    max_plots: user.max_plots || 3, max_pens: user.max_pens || 2,
    max_material_plots: user.max_material_plots || 2, max_fruit_trees: user.max_fruit_trees || 1,
    ready: {
      plants: checkFarm(farms.plants, NONGCHANG.seeds || []).ready,
      animals: checkFarm(farms.animals, NONGCHANG.animals || []).ready,
      materials: checkFarm(farms.material_plants || [], MATFARM.seeds || []).ready,
      fruits: checkFarm(farms.fruit_trees || [], FRUITREE.trees || []).ready,
    },
    growing: {
      plants: checkFarm(farms.plants, NONGCHANG.seeds || []).growing,
      animals: checkFarm(farms.animals, NONGCHANG.animals || []).growing,
      materials: checkFarm(farms.material_plants || [], MATFARM.seeds || []).growing,
      fruits: checkFarm(farms.fruit_trees || [], FRUITREE.trees || []).growing,
    },
    nongchang_config: NONGCHANG, matfarm_config: MATFARM, fruit_config: FRUITREE,
    auto_replant: user.auto_replant !== false,
    season: getSeasonState(),
    off_season_crops: getOffSeasonCrops(getSeasonState().season_id),
    seasonal_crops: getSeasonalCrops(getSeasonState().season_id),
  });
});

app.post('/api/farm/plant', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { seedName, count = 1, farmType = 'plant' } = req.body;

  // 重新加载配置以避免缓存问题
  const NC = loadConfig('farm/nongchang.json');
  const MF = loadConfig('farm/material_farm.json');
  const FT = loadConfig('farm/fruit_tree.json');

  let configField, maxSlots, slotKey;
  if (farmType === 'plant') { configField = (NC.seeds || []); maxSlots = user.max_plots || 3; slotKey = 'plants'; }
  else if (farmType === 'material') { configField = (MF.seeds || []); maxSlots = user.max_material_plots || 2; slotKey = 'material_plants'; }
  else if (farmType === 'fruit') { configField = (FT.trees || []); maxSlots = user.max_fruit_trees || 1; slotKey = 'fruit_trees'; }
  else if (farmType === 'animal') { configField = (NC.animals || []); maxSlots = user.max_pens || 2; slotKey = 'animals'; }
  else return res.json({ error: '无效的农场类型' });

  const seed = configField.find(s => s.name === seedName);
  if (!seed) return res.json({ error: `找不到该种子/动物: ${seedName} (类型:${farmType}, 可用:${configField.map(s=>s.name).slice(0,3).join(',')}...)` });
  // farmer_only 标记的作物仅限农夫种植
  if (seed.farmer_only && user.profession !== 'farmer') return res.json({ error: `${seedName} 仅限 🌾农夫职业种植` });
  // 季节限种检查（动物、果树、材料农场不受季节限制）
  if (farmType === 'plant') {
    const season = getSeasonState();
    const offCrops = getOffSeasonCrops(season.season_id);
    if (offCrops.includes(seedName)) return res.json({ error: `${seedName} 不在当季（${season.season_name}），无法种植。当季作物：${(getSeasonalCrops(season.season_id) || []).join('、')}` });
  }

  const farms = user.farms || { plants: [], animals: [], material_plants: [], fruit_trees: [] };
  if (!farms[slotKey]) farms[slotKey] = [];
  const available = Math.max(0, maxSlots - farms[slotKey].length);
  if (available <= 0) return res.json({ error: `没有空地了！已用 ${farms[slotKey].length}/${maxSlots}` });

  const plantCount = Math.min(count, available);
  const prevLen = farms[slotKey].length;
  let totalCost = 0;
  const useInstant = (user.temp_instant_grow || 0) > 0;
  const useFertilizer = (user.temp_fertilizer) ? user.temp_fertilizer.speed || 0 : 0;
  for (let i = 0; i < plantCount; i++) {
    if (hasInv(user, seedName)) { remInv(user, seedName, 1); }
    else if (seed.price && (user.coins || 0) >= seed.price) { user.coins -= seed.price; totalCost += seed.price; }
    else break;
    let growSpeed = (getProfessionBonus(user).growth_speed || 0) + (getSeasonState().season_crops_bonus || 0);
    // 节气额外生长加速
    const term = getCurrentSolarTerm();
    if (term && term.farm_bonus && term.farm_bonus.growth_speed) growSpeed += term.farm_bonus.growth_speed;
    let plantTime = Math.floor(Date.now() / 1000);
    // 生命之种：立即成熟（仅第一颗）
    if (useInstant && i === 0) { plantTime = 1; user.temp_instant_grow--; }
    // 肥料加速（仅第一颗）
    if (useFertilizer && i === 0) { growSpeed += useFertilizer; user.temp_fertilizer = null; }
    farms[slotKey].push({ seed: seedName, planted_at: plantTime, growth_speed: growSpeed });
  }

  const actualPlanted = farms[slotKey].length - prevLen;
  if (actualPlanted === 0) return res.json({ error: '背包中没有该种子且金币不足' });

  user.farms = farms;
  saveUser(req.userToken, user);
  res.json({ planted: actualPlanted, total_cost: totalCost, slots_used: farms[slotKey].length, max_slots: maxSlots });
});

app.post('/api/farm/clear', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { farmType = 'plant', index } = req.body;
  if (index === undefined || index < 0) return res.json({ error: '请指定要铲除的格子' });
  const slotKey = { plant: 'plants', material: 'material_plants', fruit: 'fruit_trees', animal: 'animals' }[farmType] || 'plants';
  const farms = user.farms || { plants: [], animals: [], material_plants: [], fruit_trees: [] };
  if (!farms[slotKey]) farms[slotKey] = [];
  if (index >= farms[slotKey].length) return res.json({ error: '无效的格子' });
  const removed = farms[slotKey].splice(index, 1)[0];
  // 退还种子（如果还在生长中）
  if (removed && removed.seed) {
    const nowSec = Math.floor(Date.now() / 1000);
    const NC = loadConfig('farm/nongchang.json');
    const MF = loadConfig('farm/material_farm.json');
    const FT = loadConfig('farm/fruit_tree.json');
    let configField;
    if (farmType === 'plant') configField = (NC.seeds || []);
    else if (farmType === 'material') configField = (MF.seeds || []);
    else if (farmType === 'fruit') configField = (FT.trees || []);
    else if (farmType === 'animal') configField = (NC.animals || []);
    const seed = configField.find(s => s.name === removed.seed);
    // 只有未成熟才退还（成熟了就该收割而不是铲除）
    if (seed && nowSec - removed.planted_at < Math.max(1, Math.floor((seed.growth_time || 0) * (1 - (removed.growth_speed || 0))))) {
      addInv(user, removed.seed, 1);
    }
  }
  user.farms = farms;
  saveUser(req.userToken, user);
  res.json({ removed: removed?.seed || '空地', slots_used: farms[slotKey].length });
});

app.post('/api/farm/harvest', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { farmType = 'all' } = req.body;
  const farms = user.farms || { plants: [], animals: [], material_plants: [], fruit_trees: [] };
  const nowSec = Math.floor(Date.now() / 1000);
  const allHarvested = [];
  let totalExp = 0, totalCoins = 0;

  function harvestSlots(slots, configField) {
    const harvested = [], newSlots = [];
    for (const slot of slots) {
      if (!slot || !slot.planted_at) { newSlots.push(slot); continue; }
      const seed = configField.find(s => s.name === slot.seed);
      if (!seed) { newSlots.push(slot); continue; }
      if (nowSec - slot.planted_at < Math.floor((seed.growth_time || 0) * (1 - (slot.growth_speed || 0)))) { newSlots.push(slot); continue; }

      // 累积型作物：收割所有已完成周期
      if (seed.accumulate) {
        const elapsed = nowSec - slot.planted_at;
        const effGrow = Math.floor((seed.growth_time || 1) * (1 - (slot.growth_speed || 0)));
        const fullCycles = Math.floor(elapsed / Math.max(1, effGrow));
        const totalAcc = (slot.accumulated || 0) + fullCycles;
        const maxAcc = seed.max_accumulate || seed.max_cycles || 0;
        if (totalAcc <= 0) { newSlots.push(slot); continue; }
        // 收割所有累积产出（不再只叠不割）
        const product = seed.harvest_product || seed.name;
        let amt = parseRange(seed.harvest_amount, [1, 3]) * totalAcc;
        const season = getSeasonState();
        let harvestBonus = ((user.skills || {}).harvest_bonus || 0) * 0.012 + (getProfessionBonus(user).harvest_bonus || 0) + (season.season_crops_bonus || 0);
        // 农夫职业秋季额外+10%收获
        if (user.profession === 'farmer' && season.season_id === 'autumn') harvestBonus += 0.10;
        if (harvestBonus > 0) amt += Math.floor(amt * harvestBonus);
      // 🌾 丰收护符/双倍收获卷轴
      if ((user.temp_harvest_boost || 0) > 0) { amt *= 2; user.temp_harvest_boost--; }
      if ((user.temp_double_harvest || 0) > 0) { amt *= 2; user.temp_double_harvest--; }
        addInv(user, product, amt);
        harvested.push({ product, count: amt, accumulated: totalAcc });
        // 🏅 限定称号·职业 农夫效果：10%概率额外获得0-2个收获
        if (user.profession === 'farmer' && user.equipped_title === '限定称号·职业' && Math.random() < 0.1) {
          const bonusAmt = Math.floor(Math.random() * 3);
          if (bonusAmt > 0) { addInv(user, product, bonusAmt); harvested.push({ product: '🎁' + product, count: bonusAmt, title_bonus: true }); }
        }
        const value = parseRange(seed.harvest_value, [10, 20]) * totalAcc;
        user.coins = (user.coins || 0) + value; totalCoins += value;
        totalExp += addExp(user, Math.floor((seed.harvest_exp * totalAcc || 10) * (1 + ((user.profession_stats || {}).harvest_exp_bonus || 0))));
        for (const bp of (seed.byproducts || [])) {
          if (Math.random() < (bp.chance || 0)) {
            const bAmt = parseRange(bp.amount || bp.count, [1, 1]) * totalAcc;
            addInv(user, bp.name, bAmt);
            harvested.push({ product: bp.name, count: bAmt, byproduct: true });
          }
        }
        // 保留未完成周期的进度，避免收割后倒计时被重置
        const partialElapsed = elapsed % Math.max(1, effGrow);
        const newPlantedAt = nowSec - partialElapsed;
        // 无限循环(max=0)自动补种，有限循环则追踪已消耗周期
        if (user.auto_replant !== false) {
          if (!maxAcc) {
            newSlots.push({ seed: slot.seed, planted_at: newPlantedAt, growth_speed: slot.growth_speed || 0, accumulated: 0 });
          } else {
            let usedCycles = (slot.used_cycles || 0) + totalAcc;
            if (usedCycles < maxAcc) {
              newSlots.push({ seed: slot.seed, planted_at: newPlantedAt, growth_speed: slot.growth_speed || 0, accumulated: 0, used_cycles: usedCycles });
            } else {
              // 周期耗尽，自动购买种子重新种植（先检查背包，再自动扣钱）
              let replanted = false;
              if (hasInv(user, slot.seed)) { remInv(user, slot.seed, 1); replanted = true; }
              else if (seed.price && (user.coins || 0) >= seed.price) { user.coins -= seed.price; replanted = true; }
              if (replanted) newSlots.push({ seed: slot.seed, planted_at: nowSec, growth_speed: slot.growth_speed || 0, accumulated: 0 });
            }
          }
        }
        continue;
      }

      const product = seed.harvest_product || seed.name;
      let amt = parseRange(seed.harvest_amount, [1, 3]);
      const season2 = getSeasonState();
      let harvestBonus = ((user.skills || {}).harvest_bonus || 0) * 0.012 + (getProfessionBonus(user).harvest_bonus || 0) + (season2.season_crops_bonus || 0);
      if (user.profession === 'farmer' && season2.season_id === 'autumn') harvestBonus += 0.10;
      if (harvestBonus > 0) amt += Math.floor(amt * harvestBonus);
      // 🌾 丰收护符/双倍收获卷轴
      if ((user.temp_harvest_boost || 0) > 0) { amt *= 2; user.temp_harvest_boost--; }
      if ((user.temp_double_harvest || 0) > 0) { amt *= 2; user.temp_double_harvest--; }
      addInv(user, product, amt);
      harvested.push({ product, count: amt });
      // 🏅 限定称号·职业 农夫效果：10%概率额外获得0-2个收获
      if (user.profession === 'farmer' && user.equipped_title === '限定称号·职业' && Math.random() < 0.1) {
        const bonusAmt = Math.floor(Math.random() * 3);
        if (bonusAmt > 0) { addInv(user, product, bonusAmt); harvested.push({ product: '🎁' + product, count: bonusAmt, title_bonus: true }); }
      }
      const value = parseRange(seed.harvest_value, [10, 20]);
      user.coins = (user.coins || 0) + value; totalCoins += value;
      totalExp += addExp(user, Math.floor((seed.harvest_exp || 10) * (1 + ((user.profession_stats || {}).harvest_exp_bonus || 0))));
      for (const bp of (seed.byproducts || [])) {
        if (Math.random() < (bp.chance || 0)) {
          const bAmt = parseRange(bp.amount || bp.count, [1, 1]);
          addInv(user, bp.name, bAmt);
          harvested.push({ product: bp.name, count: bAmt, byproduct: true });
        }
      }
      // 自动补种：可重复的直接补，不可重复的先检查背包再自动购买
      if (user.auto_replant !== false) {
        if (seed.repeatable) {
          let cycles = slot.cycles || 1;
          if (!seed.max_cycles || cycles < seed.max_cycles) {
            newSlots.push({ seed: slot.seed, planted_at: nowSec, growth_speed: slot.growth_speed || 0, cycles: cycles + 1 });
          } else {
            // max_cycles 耗尽，自动购买种子重新种植
            let replanted = false;
            if (hasInv(user, slot.seed)) { remInv(user, slot.seed, 1); replanted = true; }
            else if (seed.price && (user.coins || 0) >= seed.price) { user.coins -= seed.price; replanted = true; }
            if (replanted) newSlots.push({ seed: slot.seed, planted_at: nowSec, growth_speed: slot.growth_speed || 0, cycles: 1 });
          }
        } else {
          // 自动补种：背包有就用，没有就自动买（最多自动购买1次，避免金币耗尽）
          let replanted = false;
          if (hasInv(user, slot.seed)) { remInv(user, slot.seed, 1); replanted = true; }
          else if (seed.price && (user.coins || 0) >= seed.price) { user.coins -= seed.price; replanted = true; }
          if (replanted) newSlots.push({ seed: slot.seed, planted_at: nowSec, growth_speed: slot.growth_speed || 0 });
        }
      }
    }
    return { harvested, newSlots };
  }

  if (farmType === 'all' || farmType === 'plant') { const r = harvestSlots(farms.plants, NONGCHANG.seeds || []); allHarvested.push(...r.harvested); farms.plants = r.newSlots; }
  if (farmType === 'all' || farmType === 'animal') { const r = harvestSlots(farms.animals, NONGCHANG.animals || []); allHarvested.push(...r.harvested); farms.animals = r.newSlots; }
  if (farmType === 'all' || farmType === 'material') { const r = harvestSlots(farms.material_plants || [], MATFARM.seeds || []); allHarvested.push(...r.harvested); farms.material_plants = r.newSlots; }
  if (farmType === 'all' || farmType === 'fruit') { const r = harvestSlots(farms.fruit_trees || [], FRUITREE.trees || []); allHarvested.push(...r.harvested); farms.fruit_trees = r.newSlots; }

  user.farms = farms;
  user.total_harvest_count = (user.total_harvest_count || 0) + allHarvested.length;
  // 🌾 农夫职业专属：Lv.3+收割额外获得金色麦穗，Lv.7+野果子
  if (user.profession === 'farmer') {
    const profLevel = user.profession_level || 1;
    const cropPool = [];
    if (profLevel >= 7) cropPool.push('野果子');
    if (profLevel >= 3) cropPool.push('金色麦穗');
    if (cropPool.length > 0 && Math.random() < 0.06 * profLevel) {
      const crop = cropPool[rand(0, cropPool.length - 1)];
      const cropCnt = rand(1, Math.min(profLevel, 3));
      addInv(user, crop, cropCnt);
      allHarvested.push({ product: crop, count: cropCnt, profession_bonus: true });
    }
  }
  // 每日任务追踪 - 收获
  const questsCompleted = updateQuestProgress(user, 'harvest_crops', allHarvested.length);
  saveUser(req.userToken, user);
  checkTitleMilestones(user);
  res.json({ harvested: allHarvested, total_exp: totalExp, total_coins: totalCoins, quests_completed: questsCompleted });
});

// 切换自动补种
app.post('/api/farm/auto-replant', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { enabled } = req.body;
  user.auto_replant = !!enabled;
  saveUser(req.userToken, user);
  res.json({ auto_replant: user.auto_replant });
});

// 手动收割单个累积作物（一次性收取所有累积产出）
app.post('/api/farm/harvest-one', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { farmType = 'plant', index } = req.body;
  if (index === undefined || index < 0) return res.json({ error: '请指定要收割的格子' });
  const slotKey = { plant: 'plants', material: 'material_plants', fruit: 'fruit_trees', animal: 'animals' }[farmType] || 'plants';
  const farms = user.farms || { plants: [], animals: [], material_plants: [], fruit_trees: [] };
  if (!farms[slotKey] || index >= farms[slotKey].length) return res.json({ error: '无效的格子' });
  const slot = farms[slotKey][index];
  if (!slot || !slot.planted_at) return res.json({ error: '该格子无作物' });
  const NC = loadConfig('farm/nongchang.json');
  const MF = loadConfig('farm/material_farm.json');
  const FT = loadConfig('farm/fruit_tree.json');
  let configField;
  if (farmType === 'plant') configField = (NC.seeds || []);
  else if (farmType === 'material') configField = (MF.seeds || []);
  else if (farmType === 'fruit') configField = (FT.trees || []);
  else if (farmType === 'animal') configField = (NC.animals || []);
  const seed = configField.find(s => s.name === slot.seed);
  if (!seed) return res.json({ error: '作物配置错误' });
  const nowSec = Math.floor(Date.now() / 1000);
  const elapsed = nowSec - slot.planted_at;

  if (seed.accumulate) {
    // 累积型：计算已完成周期数 + 当前进度
    const effGrow = Math.floor((seed.growth_time || 1) * (1 - (slot.growth_speed || 0)));
    const fullCycles = Math.floor(elapsed / Math.max(1, effGrow));
    const currentProgress = elapsed % Math.max(1, effGrow);
    const acc = (slot.accumulated || 0) + fullCycles;
    if (acc <= 0 && currentProgress < (seed.growth_time || 1)) {
      return res.json({ error: '作物尚未完成第一个周期' });
    }
    const harvestCycles = Math.max(1, acc);
    const product = seed.harvest_product || seed.name;
    let amt = parseRange(seed.harvest_amount, [1, 3]) * harvestCycles;
    const s3 = getSeasonState();
    let harvestBonus = ((user.skills || {}).harvest_bonus || 0) * 0.012 + (getProfessionBonus(user).harvest_bonus || 0) + (s3.season_crops_bonus || 0);
    if (user.profession === 'farmer' && s3.season_id === 'autumn') harvestBonus += 0.10;
    if (harvestBonus > 0) amt += Math.floor(amt * harvestBonus);
    if ((user.temp_harvest_boost || 0) > 0) { amt *= 2; user.temp_harvest_boost--; }
    if ((user.temp_double_harvest || 0) > 0) { amt *= 2; user.temp_double_harvest--; }
    addInv(user, product, amt);
    const value = parseRange(seed.harvest_value, [10, 20]) * harvestCycles;
    user.coins = (user.coins || 0) + value;
    const expGained = addExp(user, (seed.harvest_exp || 10) * harvestCycles);
    for (const bp of (seed.byproducts || [])) {
      if (Math.random() < (bp.chance || 0)) {
        const bAmt = parseRange(bp.amount || bp.count, [1, 1]) * harvestCycles;
        addInv(user, bp.name, bAmt);
      }
    }
    // 移除已收割的作物（无限循环则补种）
    const maxAcc = seed.max_accumulate || seed.max_cycles || 0;
    if (!maxAcc) {
      farms[slotKey][index] = { seed: slot.seed, planted_at: nowSec, accumulated: 0, growth_speed: slot.growth_speed || 0 };
    } else {
      farms[slotKey].splice(index, 1);
    }
    user.farms = farms;
    user.total_harvest_count = (user.total_harvest_count || 0) + 1;
    const questsCompleted2 = updateQuestProgress(user, 'harvest_crops', 1);
    saveUser(req.userToken, user);
    checkTitleMilestones(user);
    return res.json({ harvested: { product, count: amt, cycles: harvestCycles }, coins: value, exp: expGained, replanted: !maxAcc, quests_completed: questsCompleted2 });
  }

  // 非累积型：检查是否成熟
  if (elapsed < (seed.growth_time || 0)) return res.json({ error: '作物尚未成熟' });
  const product = seed.harvest_product || seed.name;
  let amt = parseRange(seed.harvest_amount, [1, 3]);
  const s4 = getSeasonState();
  let harvestBonus = ((user.skills || {}).harvest_bonus || 0) * 0.012 + (getProfessionBonus(user).harvest_bonus || 0) + (s4.season_crops_bonus || 0);
  if (user.profession === 'farmer' && s4.season_id === 'autumn') harvestBonus += 0.10;
  if (harvestBonus > 0) amt += Math.floor(amt * harvestBonus);
  if ((user.temp_harvest_boost || 0) > 0) { amt *= 2; user.temp_harvest_boost--; }
  if ((user.temp_double_harvest || 0) > 0) { amt *= 2; user.temp_double_harvest--; }
  addInv(user, product, amt);
  const value = parseRange(seed.harvest_value, [10, 20]);
  user.coins = (user.coins || 0) + value;
  const expGained = addExp(user, seed.harvest_exp || 10);
  for (const bp of (seed.byproducts || [])) {
    if (Math.random() < (bp.chance || 0)) {
      const bAmt = parseRange(bp.amount || bp.count, [1, 1]);
      addInv(user, bp.name, bAmt);
    }
  }
  // 补种逻辑
  if (seed.repeatable) {
    let cycles = (slot.cycles || 0) + 1;
    if (!seed.max_cycles || cycles < seed.max_cycles) {
      farms[slotKey][index] = { seed: slot.seed, planted_at: nowSec, cycles, growth_speed: slot.growth_speed || 0 };
    } else {
      farms[slotKey].splice(index, 1);
    }
  } else {
    farms[slotKey].splice(index, 1);
  }
  user.farms = farms;
  user.total_harvest_count = (user.total_harvest_count || 0) + 1;
  const questsCompleted = updateQuestProgress(user, 'harvest_crops', 1);
  saveUser(req.userToken, user);
  checkTitleMilestones(user);
  res.json({ harvested: { product, count: amt }, coins: value, exp: expGained, quests_completed: questsCompleted });
});

app.post('/api/farm/expand', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  if (user.profession !== 'farmer') return res.json({ error: '只有农夫职业才能扩建农场' });
  const { type = 'plant' } = req.body;
  let key, max, cost;
  if (type === 'plant') { key = 'max_plots'; max = NONGCHANG.max_plots_max || 10; cost = NONGCHANG.expand_cost_per_plot || 500; }
  else if (type === 'animal') { key = 'max_pens'; max = NONGCHANG.max_pens_max || 10; cost = NONGCHANG.expand_cost_per_pen || 500; }
  else if (type === 'material') { key = 'max_material_plots'; max = 10; cost = 500; }
  else if (type === 'fruit') { key = 'max_fruit_trees'; max = 10; cost = 500; }
  else return res.json({ error: '无效类型' });
  if ((user[key] || 2) >= max) return res.json({ error: '已达上限' });
  if ((user.coins || 0) < cost) return res.json({ error: `金币不足，需要 ${cost}` });
  user.coins -= cost; user[key] = (user[key] || 2) + 1;
  saveUser(req.userToken, user);
  res.json({ new_max: user[key], cost });
});

// -- 商城 --
// 材料商店每日池子（全局），每人独立库存
let _matPoolCache = null; let _matPoolDate = '';
function getDailyMatPool() {
  const td = today();
  if (_matPoolDate !== td) {
    try {
      const matShop = SHOP.material_shop || {};
      const dailySeed = md5(td).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      const seededRandom = (seed) => { const x = Math.sin(seed++) * 10000; return x - Math.floor(x); };
      const pool = matShop.pool || [];
      const count = matShop.daily_count || 10;
      if (pool.length === 0) { console.warn('材料商店池为空! 请检查 shangcheng.json 中 material_shop.pool'); _matPoolCache = []; _matPoolDate = td; return []; }
      let s = dailySeed + 500;
      // Fisher-Yates shuffle with seeded random (replaces non-deterministic sort)
      const shuffled = [...pool];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(seededRandom(s++) * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const items = shuffled.slice(0, count).map((item, i) => ({
        name: item.name, base_price: item.base_price || 100,
        max_stock: rand(...(matShop.stock_per_item || [2, 15])),
      }));
      _matPoolCache = items;
      _matPoolDate = td;
    } catch (e) {
      console.error('材料商店每日刷新失败:', e.message);
      _matPoolCache = [];
      _matPoolDate = td;
    }
  }
  return _matPoolCache || [];
}

app.get('/api/shop', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const td = today();
  const dailySeed = md5(td).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const pool = SHOP.pool || [];
  const dailyCount = SHOP.daily_count || 30;
  const seededRandom = (seed) => { const x = Math.sin(seed++) * 10000; return x - Math.floor(x); };
  let s = dailySeed;
  // Fisher-Yates shuffle with seeded random (replaces non-deterministic sort)
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom(s++) * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const items = shuffled.slice(0, dailyCount);
  const dailyItems = items.map((item, i) => {
    const priceFluct = 0.85 + seededRandom(dailySeed + i + 100) * 0.3;
    return { ...item, price: Math.round(item.price * priceFluct) };
  });

  // 材料商店：每人独立库存
  if (!user.daily_mat_purchases) user.daily_mat_purchases = {};
  if (user.daily_mat_date !== td) { user.daily_mat_purchases = {}; user.daily_mat_date = td; }
  const matPool = getDailyMatPool();
  const matItems = matPool.map((item, i) => {
    const fluct = 0.75 + seededRandom(dailySeed + i + 1000) * 0.5;
    const bought = user.daily_mat_purchases[item.name] || 0;
    const stock = Math.max(0, item.max_stock - bought);
    return { name: item.name, price: Math.round((item.base_price || 100) * fluct), stock, max_stock: item.max_stock };
  });

  res.json({ shop: dailyItems, material_shop: matItems });
});

app.post('/api/shop/buy', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { itemName, amount = 1, shop_type = 'system' } = req.body;
  const td = today();

  // 查找物品（区分系统商城和材料商店）
  const shopItem = (SHOP.pool || []).find(i => i.name === itemName);
  const matShopPool = (SHOP.material_shop || {}).pool || [];
  const matPool = getDailyMatPool();
  const matItem = matPool.find(i => i.name === itemName);
  const isMatOnly = !shopItem && matItem;  // 仅材料商店才有的物品

  // 根据 shop_type 验证物品是否存在于对应商店
  if (shop_type === 'system' && !shopItem) return res.json({ error: '系统商城无此物品' });
  if (shop_type === 'material' && !matItem) return res.json({ error: '材料商店今日无此物品' });
  if (!shopItem && !matItem) return res.json({ error: '商城无此物品' });

  // 材料商店：按用户检查库存并记录购买（仅材料商店购买时追踪）
  if (shop_type === 'material') {
    if (!user.daily_mat_purchases) user.daily_mat_purchases = {};
    if (user.daily_mat_date !== td) { user.daily_mat_purchases = {}; user.daily_mat_date = td; }
    const already = user.daily_mat_purchases[itemName] || 0;
    const remaining = matItem.max_stock - already;
    if (remaining < amount) return res.json({ error: `库存不足 (你已买${already}个，上限${matItem.max_stock}个)` });
    user.daily_mat_purchases[itemName] = already + amount;
  }

  // 计算当日价格（与列表展示一致）
  const dailySeed = md5(td).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const seededRandom = (seed) => { const x = Math.sin(seed++) * 10000; return x - Math.floor(x); };
  let price;
  if (shop_type === 'system') {
    const pool2 = SHOP.pool || [];
    let s3 = dailySeed;
    // Fisher-Yates shuffle with seeded random
    const shuffled2 = [...pool2];
    for (let i = shuffled2.length - 1; i > 0; i--) {
      const j = Math.floor(seededRandom(s3++) * (i + 1));
      [shuffled2[i], shuffled2[j]] = [shuffled2[j], shuffled2[i]];
    }
    const items2 = shuffled2.slice(0, SHOP.daily_count || 30);
    const idx2 = items2.findIndex(i => i.name === itemName);
    const fluct2 = 0.85 + seededRandom(dailySeed + (idx2 >= 0 ? idx2 : 0) + 100) * 0.3;
    price = Math.round((shopItem.price || 100) * fluct2);
  } else {
    const idx = matPool.indexOf(matItem);
    const fluct = 0.75 + seededRandom(dailySeed + idx + 1000) * 0.5;
    price = Math.round((matItem.base_price || 100) * fluct);
  }
  const totalCost = price * amount;
  if ((user.coins || 0) < totalCost) return res.json({ error: `金币不足，需要 ${totalCost}` });
  // 系统商城限购一次检查
  if (shop_type === 'system' && shopItem?.once_only && (user.purchased_once || []).includes(itemName)) return res.json({ error: '该物品限购一次' });
  // 系统商城每日限购检查
  if (shop_type === 'system' && shopItem?.daily_limit) {
    if (!user.daily_shop_purchases) user.daily_shop_purchases = {};
    if (user.daily_shop_date !== td) { user.daily_shop_purchases = {}; user.daily_shop_date = td; }
    const bought = user.daily_shop_purchases[itemName] || 0;
    if (bought + amount > shopItem.daily_limit) return res.json({ error: `每日限购${shopItem.daily_limit}个，今日已买${bought}个` });
    user.daily_shop_purchases[itemName] = bought + amount;
  }
  // 标记限购一次（确认所有验证通过后再标记）
  if (shop_type === 'system' && shopItem?.once_only) {
    if (!user.purchased_once) user.purchased_once = [];
    user.purchased_once.push(itemName);
  }
  user.coins -= totalCost;
  // 宝石类商品：生成宝石而非 addInv
  if (shop_type === 'system' && shopItem && shopItem.category === 'gem' && shopItem.gem_rarity) {
    const [minR, maxR] = shopItem.gem_rarity;
    const gems = [];
    for (let gi = 0; gi < amount; gi++) {
      const gem = dropGemInRange(user, minR, maxR);
      gems.push({ name: gem.name, stat: gem.stat, value: gem.value, rarity: gem.rarity });
    }
    saveUser(req.userToken, user);
    return res.json({ item: itemName, amount, total_cost: totalCost, remaining_coins: user.coins, gems });
  }
  addInv(user, itemName, amount);
  saveUser(req.userToken, user);
  res.json({ item: itemName, amount, total_cost: totalCost, remaining_coins: user.coins });
});

// -- 出售 --
app.post('/api/sell', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { itemName, amount = 1, skip_blacklist } = req.body;
  if (!itemName) return res.json({ error: '请指定物品名' });
  if (!hasInv(user, itemName)) return res.json({ error: '背包中没有该物品' });
  const cat = itemCategory(itemName);
  if (!skip_blacklist) {
    const blacklist = user.sell_blacklist || HEIMINGDAN.categories || [];
    const itemBl = user.item_blacklist || HEIMINGDAN.protected_items || [];
    if (cat && blacklist.includes(cat)) return res.json({ error: '该物品类别在出售黑名单中，请在设置中调整' });
    if (itemBl.includes(itemName)) return res.json({ error: '该物品在出售黑名单中，请在设置中调整' });
  }
  const available = countInv(user, itemName);
  if (available <= 0) return res.json({ error: '背包中没有该物品' });
  const sold = Math.min(amount, available);
  remInv(user, itemName, sold);
  const basePrice = getSellPrice(itemName);
  user.coins = (user.coins || 0) + basePrice * sold;
  saveUser(req.userToken, user);
  res.json({ sold, total_coins: basePrice * sold, remaining_coins: user.coins, unit_price: basePrice });
});

// -- 一键出售（可指定分类，支持预览） --
app.post('/api/sell-all', authMiddleware, (req, res) => {
  try {
    const user = loadUser(req.userToken) || req.user;
    if (!user) return res.json({ error: '用户数据加载失败' });
    const blacklist = user.sell_blacklist || (HEIMINGDAN.categories || []);
    const itemBl = user.item_blacklist || (HEIMINGDAN.protected_items || []);
    const { category, preview } = req.body;  // preview: true=仅预览不动数据
    const inv = listInv(user);
    let totalSold = 0, totalCoins = 0;
    const previewItems = [];  // 预览详情
    const skippedItems = [];  // 被跳过的物品
    for (const [name, count] of Object.entries(inv)) {
      const cat = itemCategory(name);
      if (cat && blacklist.includes(cat)) { skippedItems.push({ name, count, reason: '类别保护:' + cat }); continue; }
      if (itemBl.includes(name)) { skippedItems.push({ name, count, reason: '物品保护' }); continue; }
      if (category && cat !== category) continue;  // 指定分类时只售该分类
      const unitPrice = getSellPrice(name);
      totalSold += count;
      totalCoins += unitPrice * count;
      previewItems.push({ name, count, coins: unitPrice * count, unit_price: unitPrice, category: cat });
      if (!preview) remInv(user, name, count);
    }
    if (totalSold === 0) {
      const skipSummary = skippedItems.length > 0 ? '（已跳过 ' + skippedItems.length + ' 种受保护物品）' : '';
      return res.json({ error: (category ? '该分类没有可出售的物品' : '没有可出售的物品') + skipSummary, skipped: skippedItems.slice(0, 10) });
    }
    if (preview) {
      return res.json({ preview: true, sold: totalSold, total_coins: totalCoins, items: previewItems.slice(0, 30), skipped_count: skippedItems.length, skipped_sample: skippedItems.slice(0, 5) });
    }
    user.coins = (user.coins || 0) + totalCoins;
    saveUser(req.userToken, user);
    res.json({ sold: totalSold, total_coins: totalCoins, remaining_coins: user.coins, skipped_blacklist: blacklist, skipped_item_count: skippedItems.length });
  } catch (e) {
    console.error('一键出售失败:', e.message);
    res.json({ error: '出售失败: ' + (e.message || '未知错误') });
  }
});

// -- 全球市场 (独立) --
app.get('/api/market', authMiddleware, (req, res) => {
  const market = loadMarket();
  res.json({ market, count: market.length });
});
app.post('/api/market/list', authMiddleware, withFileLock('market', async (req, res) => {
  const user = loadUser(req.userToken);
  const { itemName, price, qty, type } = req.body;

  // -- 武器上架 --
  if (type === 'weapon') {
    if (!price || price < 1) return res.json({ error: '参数错误' });
    const forge = loadForge();
    const weapons = forge[user.id] || [];
    const wIdx = weapons.findIndex(w => w.id === itemName || w.name === itemName);
    if (wIdx === -1) return res.json({ error: '武器库中找不到该武器' });
    const weapon = weapons.splice(wIdx, 1)[0];
    if (weapons.length === 0) delete forge[user.id]; else forge[user.id] = weapons;
    saveForge(forge);
    // 如果正装备着，卸下
    if (user.equipment) {
      for (const [slot, ref] of Object.entries(user.equipment)) {
        if (ref === weapon.id || ref === weapon.name) { user.equipment[slot] = ''; break; }
      }
    }
    saveUser(req.userToken, user);
    const market = loadMarket();
    market.push({ id: uid(), seller: user.username, seller_id: user.id, item: itemName, price: parseInt(price, 10), qty: 1, listed_at: now(), type: 'weapon', weapon });
    saveMarket(market);
    io.emit('market:update', { action: 'list', item: itemName, price, seller: user.username, type: 'weapon' });
    // market broadcast sent
    return res.json({ success: true, listed: 1, item: itemName, price, type: 'weapon' });
  }

  // 宝石上架
  if (type === 'gem') {
    if (!price || price < 1) return res.json({ error: '参数错误' });
    const gemIdx = (user.gems || []).findIndex(g => g.id === itemName);
    if (gemIdx === -1) return res.json({ error: '宝石背包中找不到该宝石' });
    const gem = user.gems.splice(gemIdx, 1)[0];
    saveUser(req.userToken, user);
    const market = loadMarket();
    market.push({ id: uid(), seller: user.username, seller_id: user.id, item: gem.name, price: parseInt(price, 10), qty: 1, listed_at: now(), type: 'gem', gem });
    saveMarket(market);
    io.emit('market:update', { action: 'list', item: gem.name, price, seller: user.username, type: 'gem' });
    return res.json({ success: true, listed: 1, item: gem.name, price, type: 'gem' });
  }

  // -- 普通物品上架 --
  const listQty = Math.min(qty || 1, 99);
  if (!itemName || !price || price < 1) return res.json({ error: '参数错误' });
  // 禁止限购物品上架市场
  const itemCfg = ITEMS.items?.[itemName];
  if (itemCfg?.marry_ring) return res.json({ error: '该物品限购，无法上架市场' });
  const shopItem = (SHOP.pool || []).find(i => i.name === itemName);
  if (shopItem?.once_only) return res.json({ error: '该物品限购，无法上架市场' });
  if (!hasInv(user, itemName, listQty)) return res.json({ error: `背包中 ${itemName} 不足（需要${listQty}个）` });
  remInv(user, itemName, listQty);
  saveUser(req.userToken, user);
  const market = loadMarket();
  market.push({ id: uid(), seller: user.username, seller_id: user.id, item: itemName, price: parseInt(price, 10), qty: listQty, listed_at: now(), type: 'item' });
  saveMarket(market);
  io.emit('market:update', { action: 'list', item: itemName, price, qty: listQty, seller: user.username });
  res.json({ success: true, listed: listQty, item: itemName, price });
}));
app.post('/api/market/buy', authMiddleware, withFileLock('market', async (req, res) => {
  const user = loadUser(req.userToken);
  const { listingId, buyQty } = req.body;
  const market = loadMarket();
  const idx = market.findIndex(l => l.id === listingId);
  if (idx === -1) return res.json({ error: '商品不存在或已售出' });
  const listing = market[idx];
  if (listing.seller_id === user.id) return res.json({ error: '不能购买自己的商品' });
  // 蓝图购买等级检查
  const itemName = listing.item || '';
  if (itemName.endsWith('图纸') || itemName.endsWith('配方')) {
    let bpMinLevel = 1;
    const sets = SETS_CFG.sets || [];
    for (const set of sets) {
      for (const [slot, piece] of Object.entries(set.pieces || {})) {
        if (piece.name + '图纸' === itemName) { bpMinLevel = set.min_level || 1; break; }
      }
      if (bpMinLevel > 1) break;
    }
    if ((user.level || 1) < bpMinLevel) return res.json({ error: `等级不足！需要 Lv.${bpMinLevel} 才能使用该蓝图` });
  }
  const qty = Math.min(buyQty || 1, listing.qty || 1);
  const totalPrice = listing.price * qty;
  if ((user.coins || 0) < totalPrice) return res.json({ error: `金币不足，需要 ${totalPrice}` });

  // 扣除数量或移除整条
  if (qty >= (listing.qty || 1)) {
    market.splice(idx, 1);
  } else {
    listing.qty -= qty;
  }
  saveMarket(market);
  user.coins -= totalPrice;

  if (listing.type === 'weapon' && listing.weapon) {
    const forge = loadForge();
    if (!forge[user.id]) forge[user.id] = [];
    forge[user.id].push(listing.weapon);
    saveForge(forge);
  } else if (listing.type === 'gem' && listing.gem) {
    if (!user.gems) user.gems = [];
    user.gems.push(listing.gem);
  } else {
    addInv(user, listing.item, qty);
  }
  saveUser(req.userToken, user);

  const seller = loadUser(listing.seller_id);
  if (seller) { seller.coins = (seller.coins || 0) + totalPrice; saveUser(listing.seller_id, seller); }
  // 记录交易历史
  const txHistory = loadMarketHistory();
  txHistory.unshift({ id: uid(), buyer: user.username, seller: listing.seller, item: listing.item, price: listing.price, qty, total: totalPrice, type: listing.type || 'item', time: now() });
  if (txHistory.length > 50) txHistory.length = 50;
  saveMarketHistory(txHistory);
  // 广播
  io.emit('market:update', { action: 'buy', item: listing.item, price: listing.price, qty, buyer: user.username, seller: listing.seller, total: totalPrice });
  // market buy broadcast sent
  res.json({ success: true, item: listing.item, price: listing.price, qty, total_price: totalPrice, type: listing.type || 'item' });
}));
app.post('/api/market/unlist', authMiddleware, withFileLock('market', async (req, res) => {
  const user = loadUser(req.userToken);
  const { listingId } = req.body;
  const market = loadMarket();
  const idx = market.findIndex(l => l.id === listingId && l.seller_id === user.id);
  if (idx === -1) return res.json({ error: '找不到该商品或不是你的' });
  const listing = market.splice(idx, 1)[0]; saveMarket(market);
  if (listing.type === 'weapon' && listing.weapon) {
    const forge = loadForge();
    if (!forge[user.id]) forge[user.id] = [];
    forge[user.id].push(listing.weapon);
    saveForge(forge);
  } else if (listing.type === 'gem' && listing.gem) {
    if (!user.gems) user.gems = [];
    user.gems.push(listing.gem);
  } else {
    addInv(user, listing.item, listing.qty || 1);
  }
  saveUser(req.userToken, user);
  res.json({ success: true, qty: listing.qty || 1 });
}));

// -- 市场交易记录 --
app.get('/api/market/history', authMiddleware, (req, res) => {
  const history = loadMarketHistory();
  res.json({ history });
});

// -- 求购系统 --
const BID_EXPIRE_MS = 3 * 24 * 3600 * 1000; // 3天
function cleanExpiredBids() {
  try {
    const bids = loadBids();
    const cutoff = now() - BID_EXPIRE_MS;
    const expired = bids.filter(b => (b.listed_at || 0) < cutoff);
    if (expired.length > 0) {
      const active = bids.filter(b => (b.listed_at || 0) >= cutoff);
      saveBids(active);
      // 退还过期求购的金币
      for (const b of expired) {
        const user = loadUser(b.buyer_id);
        if (user) { user.coins = (user.coins || 0) + b.price * b.qty; saveUser(b.buyer_id, user); }
      }
      console.log('🧹 清理过期求购', expired.length, '条，共退还金币', expired.reduce((s, b) => s + b.price * b.qty, 0));
    }
  } catch (e) { console.error('清理过期求购失败:', e.message); }
}
function loadBids() {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'bids.json'), 'utf8')); } catch (e) { return []; }
}
function saveBids(bids) {
  fs.writeFileSync(path.join(DATA_DIR, 'bids.json'), JSON.stringify(bids, null, 2));
}
app.get('/api/market/bids', authMiddleware, (req, res) => {
  cleanExpiredBids();
  const bids = loadBids();
  res.json({ bids, count: bids.length });
});
app.post('/api/market/bid', authMiddleware, withFileLock('bids', async (req, res) => {
  const user = loadUser(req.userToken);
  const { itemName, price, qty } = req.body;
  const bidQty = Math.min(qty || 1, 99);
  if (!itemName || !price || price < 1) return res.json({ error: '参数错误' });
  if ((user.coins || 0) < price * bidQty) return res.json({ error: '金币不足，求购需要预付全额金币' });
  user.coins -= price * bidQty;
  saveUser(req.userToken, user);
  const bids = loadBids();
  bids.push({ id: uid(), buyer: user.username, buyer_id: user.id, item: itemName, price: parseInt(price, 10), qty: bidQty, listed_at: now() });
  saveBids(bids);
  io.emit('market:update', { action: 'bid', item: itemName, price, qty: bidQty, buyer: user.username });
  res.json({ success: true, item: itemName, price, qty: bidQty });
}));
app.post('/api/market/bid-cancel', authMiddleware, withFileLock('bids', async (req, res) => {
  const user = loadUser(req.userToken);
  const { bidId } = req.body;
  const bids = loadBids();
  const idx = bids.findIndex(b => b.id === bidId && b.buyer_id === user.id);
  if (idx === -1) return res.json({ error: '找不到该求购或不是你的' });
  const bid = bids.splice(idx, 1)[0];
  saveBids(bids);
  user.coins = (user.coins || 0) + bid.price * bid.qty;
  saveUser(req.userToken, user);
  res.json({ success: true, refund: bid.price * bid.qty });
}));
app.post('/api/market/fulfill-bid', authMiddleware, withFileLock('bids', async (req, res) => {
  const user = loadUser(req.userToken);
  const { bidId, qty: fulfillQty } = req.body;
  const bids = loadBids();
  const idx = bids.findIndex(b => b.id === bidId);
  if (idx === -1) return res.json({ error: '求购已失效' });
  const bid = bids[idx];
  if (bid.buyer_id === user.id) return res.json({ error: '不能履行自己的求购' });
  const fQty = Math.min(fulfillQty || 1, bid.qty);
  if (!hasInv(user, bid.item, fQty)) return res.json({ error: `背包中 ${bid.item} 不足（需要${fQty}个）` });
  remInv(user, bid.item, fQty);
  const totalPrice = bid.price * fQty;
  user.coins = (user.coins || 0) + totalPrice;
  saveUser(req.userToken, user);
  // 给买家物品
  const buyer = loadUser(bid.buyer_id);
  if (buyer) { addInv(buyer, bid.item, fQty); saveUser(bid.buyer_id, buyer); }
  // 更新或移除求购
  if (fQty >= bid.qty) { bids.splice(idx, 1); } else { bid.qty -= fQty; }
  saveBids(bids);
  const txHistory = loadMarketHistory();
  txHistory.unshift({ id: uid(), buyer: bid.buyer, seller: user.username, item: bid.item, price: bid.price, qty: fQty, total: totalPrice, type: 'bid_fulfill', time: now() });
  if (txHistory.length > 50) txHistory.length = 50;
  saveMarketHistory(txHistory);
  io.emit('market:update', { action: 'bid_fulfill', item: bid.item, price: bid.price, qty: fQty, seller: user.username, buyer: bid.buyer });
  res.json({ success: true, item: bid.item, price: bid.price, qty: fQty, earned: totalPrice });
}));

// -- 物品详情查询（市场/背包通用） --
app.get('/api/item-detail', authMiddleware, (req, res) => {
  const itemName = req.query.name;
  if (!itemName) return res.json({ error: '缺少物品名称' });
  // 1. 查 ITEMS 配置
  const itemCfg = (ITEMS.items || {})[itemName];
  if (itemCfg) {
    const isUsable = itemCfg.category === 'consume' || itemCfg.category === 'food' || itemCfg.category === 'special'
      || !!itemCfg.loli_exp || !!itemCfg.loli_awaken || !!itemCfg.marry_ring
      || (YUER.baits||[]).some(b=>b.name===itemName)
      || itemName.includes('经验宝珠') || itemName === '旧书' || itemName === '铁匠笔记'
      || itemName === '渔夫笔记' || itemName === '农夫笔记' || itemName === '厨师笔记' || itemName === '药师笔记' || itemName === '矿工笔记'
      || itemName.includes('之魂')
      || itemName === '野果子' || itemName === '石核心' || itemName === '果树催熟剂'
      || itemName === '玩家改名卡' || itemName === '武器改名卡' || itemName === '改名卡'
      || itemName === '转职卡'
      || itemName === '月光水母' || itemName === '深海龙鲸' || itemName === '龙鱼'
      || itemName === '魔法浆果' || itemName === '黄果子' || itemName === '野果子' || itemName === '泉水'
      || itemName === '秘制烤鱼' || itemName === '特级寿司' || itemName === '满汉全席' || itemName === '丰盛大餐'
      || itemName === '解毒药' || itemName === '提神药水' || itemName === '红泪石'
      || itemName === '淬火油' || itemName === '老铁锤'
      || itemName === '治疗药水' || itemName === '补药' || itemName === '防护药水'
      || itemName === '猛药' || itemName === '大经验药水（强化）' || itemName === '提神水' || itemName === '经验圣水'
      || itemName === '生命药剂' || itemName === '大生命药剂' || itemName === '露珠'
      || itemName === '护身符' || itemName === '精炼石' || itemName === '保鲜盒'
      || itemName === '大肉餐' || itemName === '药水' || itemName === '轻羽毛'
      || itemName === '旧斗篷' || itemName === '红羽毛'
      || itemName === '转职证明' || itemName === '鱼王之饵'
      || itemCfg.category === 'blueprint' || itemName.includes('图纸');
    return res.json({ name: itemName, category: itemCfg.category, rarity: itemCfg.rarity, source: itemCfg.source, use: itemCfg.use, desc: itemCfg.desc||itemCfg.use||'', emoji: itemCfg.emoji, is_weapon: false, usable: isUsable });
  }
  // 2. 查锻造武器库（全局）
  const forge = loadForge();
  for (const uid of Object.keys(forge)) {
    const weapons = forge[uid] || [];
    const w = weapons.find(w => w.name === itemName);
    if (w) {
      const ws = w.stats || w;
      const wspec = w.special_attrs || {};
      const stats = { attack: ws.attack||0, defense: ws.defense||0, speed: ws.speed||0, attack_speed: ws.attack_speed||0, dodge: ws.dodge||0, hp: ws.hp||0, crit_rate: w.crit_rate||wspec.crit_rate||0, crit_dmg: w.crit_dmg||wspec.crit_dmg||0, lifesteal: w.lifesteal||wspec.lifesteal||0, dmg_reduce: w.dmg_reduce||wspec.dmg_reduce||0, counter: w.counter||wspec.counter||0, extra_atk: w.extra_atk||wspec.extra_atk||0, fire_damage: wspec.fire_damage||0 };
      const specials = []; for (const [k, v] of Object.entries(stats)) { if (v > 0) specials.push({ key: k, label: statCN[k] || k, value: v }); }
      // 排序：主属性优先
      const mainOrder = ['attack','defense','speed','attack_speed','dodge','hp'];
      specials.sort((a,b) => { const ai = mainOrder.indexOf(a.key), bi = mainOrder.indexOf(b.key); if (ai>=0&&bi>=0) return ai-bi; if (ai>=0) return -1; if (bi>=0) return 1; return a.label.localeCompare(b.label); });
      return res.json({ name: w.name, weapon_type: w.type || w.weapon_type, rarity: w.rarity, level: w.weapon_level || w.level, attack: ws.attack, defense: ws.defense, speed: ws.speed, attack_speed: ws.attack_speed, dodge: ws.dodge, hp: ws.hp, specials, is_weapon: true, crafter: w.crafter });
    }
  }
  // 3. 查鱼、鱼饵、鱼竿等配置
  const allFish = [...(DIAOYU.fish||[]), ...(DIAOYU.junk||[])];
  const fish = allFish.find(f => f.name === itemName);
  if (fish) return res.json({ name: itemName, category: 'fish', rarity: fish.rarity, emoji: fish.emoji, desc: fish.desc, is_weapon: false });
  const bait = (YUER.baits||[]).find(b => b.name === itemName);
  if (bait) return res.json({ name: itemName, category: 'bait', rarity: bait.rarity, emoji: bait.emoji, desc: bait.desc, is_weapon: false });
  const rod = (YUGAN.rods||[]).find(r => r.name === itemName);
  if (rod) return res.json({ name: itemName, category: 'rod', rarity: rod.rarity, emoji: rod.emoji, desc: rod.desc, is_weapon: false });
  // 4. 查种子/树苗/动物
  const allSeeds = [...(NONGCHANG.seeds||[]), ...(MATFARM.seeds||[]), ...(FRUITREE.trees||FRUITREE.seeds||[])];
  const seed = allSeeds.find(s => s.name === itemName);
  if (seed) return res.json({ name: itemName, category: seed.type||'seed', rarity: seed.rarity, grow_time: seed.grow_time, is_weapon: false });
  // 5. 查合成配方产物
  const synthRecipe = (SYNTHESIS.recipes||[]).find(r => r.name === itemName);
  if (synthRecipe) {
    const isUsable = itemName === '玩家改名卡' || itemName === '武器改名卡' || itemName === '改名卡'
      || itemName === '转职卡' || itemName === '经验药水' || itemName === '大经验药水'
      || itemName === '技能点药水' || itemName === '萝莉糖果' || itemName === '果树催熟剂';
    return res.json({ name: itemName, category: 'special', rarity: synthRecipe.rarity||1, source: '合成获得', use: synthRecipe.desc||'', desc: synthRecipe.desc||'', emoji: synthRecipe.emoji||'⚗️', is_weapon: false, usable: isUsable });
  }
  // 未找到
  res.json({ name: itemName, category: 'unknown', rarity: 0, is_weapon: false });
});
const statCN = { attack:'攻击', defense:'防御', speed:'速度', attack_speed:'攻速', dodge:'闪避', hp:'生命', crit_rate:'暴击率', crit_dmg:'暴伤', lifesteal:'吸血', dmg_reduce:'减伤', counter:'反击', extra_atk:'连击', fire_damage:'火焰伤害' };

// -- 图鉴 API --
app.get('/api/handbook/fish', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const prices = buildSellBasePrices();
  // 1. 钓鱼池的鱼
  const allFish = (DIAOYU.fish || []).map(f => ({
    name: f.name, rarity: f.rarity || 1, base_weight: f.base_weight || 0,
    value: parseRange(f.value, [10, 30]), exp: f.exp || 0, text: f.text || '',
    sell_price: prices[f.name] || parseRange(f.value, [10, 30]),
    source: '钓鱼'
  }));
  // 2. 渔夫职业专属鱼（从 items.json 补充，不在钓鱼池但可通过职业钓鱼获得）
  for (const [name, info] of Object.entries(ITEMS.items || {})) {
    if (info.category === 'fish' && (info.source || '').includes('渔夫') && !allFish.find(f => f.name === name)) {
      allFish.push({
        name, rarity: info.rarity || 1,
        base_weight: info.base_weight || 0,
        value: info.base_price || prices[name] || 50,
        exp: info.exp || 0,
        text: info.use || info.desc || '',
        sell_price: prices[name] || info.base_price || 0,
        source: info.source || '渔夫职业'
      });
    }
  }
  // 3. 垃圾
  const allJunk = (DIAOYU.junk || []).map(j => ({
    name: j.name, rarity: 0, base_weight: 0, value: parseRange(j.value, [1, 5]),
    exp: j.exp || 0, text: j.text || '', sell_price: prices[j.name] || parseRange(j.value, [1, 5]),
    source: '钓鱼垃圾'
  }));
  const fc = user.fish_collection || {};
  res.json({
    fish: allFish, junk: allJunk, fish_collection: fc,
    total_species: allFish.length,
    caught_species: allFish.filter(f => fc[f.name] !== undefined).length
  });
});

app.get('/api/handbook/items', authMiddleware, (req, res) => {
  const prices = buildSellBasePrices();
  const items = [];
  const cats = new Set();
  for (const [name, info] of Object.entries(ITEMS.items || {})) {
    const cat = info.category || 'other';
    cats.add(cat);
    items.push({
      name, category: cat, rarity: info.rarity || 0,
      source: info.source || '', use: info.use || '', desc: info.description || '',
      sell_price: prices[name] || 0
    });
  }
  items.sort((a, b) => (b.rarity || 0) - (a.rarity || 0) || a.name.localeCompare(b.name));
  res.json({ items, categories: [...cats].sort(), total: items.length });
});

app.get('/api/handbook/monsters', authMiddleware, (req, res) => {
  const monsters = (MONSTERS.monsters || []).map(m => {
    const ed = _monsterHandbookCache.eventDrops[m.name] || {};
    return {
      name: m.name,
      base_hp: m.base_hp || 0, base_attack: m.base_attack || 0,
      base_defense: m.base_defense || 0, base_speed: m.base_speed || 0,
      base_atk_speed: m.base_atk_speed || 0, min_power: m.min_power || 0,
      special: m.special || '',
      regions: _monsterHandbookCache.monsterRegions[m.name] || [],
      drops: ed.drops || [], rare_drops: ed.rare_drops || [],
      rare_drop_chance: ed.rare_drop_chance || 0
    };
  });
  monsters.sort((a, b) => (a.min_power || 0) - (b.min_power || 0));
  res.json({ monsters });
});

// -- 锻造材料信息 --
app.get('/api/forge/materials', authMiddleware, (req, res) => {
  const ores = (DUANZAO.ores || []).map(o => ({ name: o.name, stat: o.stat, value: o.value, rarity: o.rarity, type: 'ore', bonus: o.bonus||null, force_special: o.force_special||null, all_mult: o.all_mult||null }));
  const mats = (DUANZAO.materials || []).map(m => ({ name: m.name, stat: m.stat||'universal', value: m.value, rarity: m.rarity, type: 'material', universal: !!m.universal, bonus: m.bonus||null, force_special: m.force_special||null, all_mult: m.all_mult||null }));
  const statCN = { attack: '攻击', defense: '防御', speed: '速度', attack_speed: '攻速', dodge: '闪避', hp: '生命', universal: '全能' };
  res.json({ ores, materials: mats, statCN });
});

// -- 锻造 --
app.get('/api/forge', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const forge = loadForge();
  const weapons = forge[user.id] || [];
  // 返回可用材料列表（背包中属于矿石/锻造材料的物品）
  const ores = (DUANZAO.ores || []).map(o => o.name);
  const mats = (DUANZAO.materials || []).map(m => m.name);
  const allForgeMats = [...new Set([...ores, ...mats])];
  // migrate existing weapons without id
  let migrated = false;
  for (const w of weapons) {
    if (!w.id) { w.id = uid(); migrated = true; }
    if (!w.strengthen_count && w.strengthen_count !== 0) { w.strengthen_count = 0; migrated = true; }
    // 迁移旧字段 gems → sockets
    if (w.gems && (!w.sockets || w.sockets.length === 0)) { w.sockets = w.gems; delete w.gems; migrated = true; }
  }
  if (migrated) { forge[user.id] = weapons; saveForge(forge); }
  const available = [];
  for (const mat of allForgeMats) {
    const c = countInv(user, mat);
    if (c > 0) available.push({ name: mat, count: c });
  }
  const bsBonus = getProfessionBonus(user);
  res.json({ weapons, equipment: user.equipment || {}, forge_level: user.forge_level, forge_exp: user.forge_exp, available_materials: available, strengthen: DUANZAO.strengthen_stones || {}, forge_milestones: DUANZAO.forge_milestones || {},
    forge_stat_bonus: bsBonus.forge_stat_bonus || 0,
    forge_extra_material: (user.profession_stats || {}).forge_extra_material || 0,
  });
});
app.post('/api/forge/craft', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { weaponType, name, materials = [] } = req.body;
  if (!name || materials.length < 2) return res.json({ error: '请提供武器名称和至少2个材料' });
  const maxMats = 10 + ((user.profession_stats || {}).forge_extra_material ? 1 : 0);
  if (materials.length > maxMats) return res.json({ error: `最多${maxMats}个材料` });
  for (const mat of materials) { if (!hasInv(user, mat)) return res.json({ error: `背包中没有 ${mat}` }); }

  // -- 读取锻造等级加成 --
  const forgeLv = user.forge_level || 1;
  const milestones = DUANZAO.forge_milestones || {};
  let materialSaveChance = 0, failReduce = 0, specialBoostTotal = 0;
  let forgeGodChance = 0, bonusSocket = 0, doubleCraftChance = 0;
  let breakthroughBoost = 0, strengthenProtect = false, freeGold = false;
  let minSuccessBoost = 0, godMode = false;
  for (const [lv, ms] of Object.entries(milestones)) {
    if (forgeLv >= parseInt(lv, 10)) {
      if (ms.effect === 'material_save') materialSaveChance += (ms.value || 0);
      else if (ms.effect === 'bonus_socket') bonusSocket = 1;
      else if (ms.effect === 'strengthen_special') specialBoostTotal += (ms.value || 0);
      else if (ms.effect === 'strengthen_double') { /* 强化相关，锻造时不生效 */ }
      else if (ms.effect === 'double_craft') doubleCraftChance += (ms.value || 0);
      else if (ms.effect === 'breakthrough_boost') breakthroughBoost += (ms.value || 0);
      else if (ms.effect === 'strengthen_protect') strengthenProtect = true;
      else if (ms.effect === 'forge_god') forgeGodChance = (ms.value || 0);
      else if (ms.effect === 'free_craft') freeGold = true;
      else if (ms.effect === 'min_success_boost') minSuccessBoost += (ms.value || 0);
      else if (ms.effect === 'god_mode') godMode = true;
    }
  }

  // -- 材料不消耗（material_save）--
  let savedMats = [];
  for (const mat of materials) {
    if (Math.random() < materialSaveChance) savedMats.push(mat);
    else remInv(user, mat, 1);
  }

  // -- 锻造失败率 --
  const baseFail = DUANZAO.base_fail_chance || 0.03;
  const disparityFail = (DUANZAO.disparity_fail_per_level || 0.08) * Math.max(0, materials.length - forgeLv);
  let failChance = Math.max(0, baseFail + disparityFail - failReduce);
  // 淬火油/催化剂临时加成（用局部变量计算，成功后再消费）
  let boostFailReduce = 0;
  if (user.temp_forge_boost) boostFailReduce += 0.10;
  if (user.temp_forge_catalyst) boostFailReduce += 0.15;
  failChance = Math.max(0, failChance - boostFailReduce);

  const ores = DUANZAO.ores || [], forgeMats = DUANZAO.materials || [];
  const materialConfigs = [];
  for (const m of materials) {
    const ore = ores.find(o => o.name === m);
    const mat = forgeMats.find(fm => fm.name === m);
    if (ore) materialConfigs.push({ ...ore, isOre: true });
    else if (mat) materialConfigs.push({ ...mat, isOre: false });
  }
  const stats = {};
  // 先处理非全能材料
  for (const mc of materialConfigs) {
    if (mc.universal) continue;
    let val = mc.value || 7;
    if (mc.stat) { stats[mc.stat] = (stats[mc.stat] || 0) + val; }
    // 特殊材料额外加成 (e.g. 磁铁矿 bonus +8 attack)
    if (mc.bonus) {
      for (const [bs, bv] of Object.entries(mc.bonus)) {
        stats[bs] = (stats[bs] || 0) + bv;
      }
    }
  }
  // 再处理全能材料：总值平均分配到已有的属性上
  for (const mc of materialConfigs) {
    if (!mc.universal) continue;
    let val = mc.value || 7;
    const existingStats = Object.keys(stats);
    if (existingStats.length > 0) {
      const perStat = Math.max(1, Math.floor(val / existingStats.length));
      for (const s of existingStats) { stats[s] = (stats[s] || 0) + perStat; }
    } else {
      // 没有已有属性时，随机选一个属性
      const allStats = ['attack','defense','speed','attack_speed','dodge','hp'];
      const pick = allStats[rand(0, allStats.length - 1)];
      stats[pick] = (stats[pick] || 0) + val;
    }
  }
  // 特殊材料：全属性倍率（取最大值，如水晶矿 +25%）
  let allMult = 0;
  for (const mc of materialConfigs) {
    if (mc.all_mult && mc.all_mult > allMult) allMult = mc.all_mult;
  }
  if (allMult > 0) {
    for (const k of Object.keys(stats)) {
      stats[k] = Math.floor(stats[k] * (1 + allMult));
    }
  }
  // 收集材料强制触发的特殊属性（如 火山石 → 火焰伤害）
  const forcedSpecials = [];
  for (const mc of materialConfigs) {
    if (mc.force_special && !forcedSpecials.includes(mc.force_special)) {
      forcedSpecials.push(mc.force_special);
    }
  }
  // 🔨 铁匠锤：额外+1材料效果（取材料平均值作为额外属性，老铁锤翻倍前执行）
  const profStats2 = user.profession_stats || {};
  if (profStats2.forge_extra_material) {
    const totalMatVal = materialConfigs.reduce((s, mc) => s + (mc.value || 7), 0);
    const avgMatVal = Math.max(1, Math.floor(totalMatVal / Math.max(1, materialConfigs.length)));
    const existKeys = Object.keys(stats);
    if (existKeys.length > 0) {
      const perKey = Math.max(1, Math.floor(avgMatVal / existKeys.length));
      for (const s of existKeys) { stats[s] = (stats[s] || 0) + perKey; }
    }
  }
  // 老铁锤：属性翻倍（延迟到成功后消耗）
  const hasGodHammer = user.godsmith_hammer;
  if (hasGodHammer) { for (const k of Object.keys(stats)) stats[k] *= 2; }

  // 属性上限检查
  // 属性上限已移除（无上限）

  // 🔨 铁匠职业加成：先应用锻造属性提升，再计算稀有度
  const bsBonus1 = getProfessionBonus(user);
  const forgeInspLv = (user.skills || {}).forge_inspiration || 0;
  const forgeInspBonus = forgeInspLv * 0.005;
  const blacksmithBonus = 1 + (bsBonus1.forge_stat_bonus || 0) + forgeInspBonus;
  if (blacksmithBonus > 1) {
    for (const k of Object.keys(stats)) stats[k] = Math.floor(stats[k] * blacksmithBonus);
  }

  const statCount = Object.keys(stats).length;
  // 词条数决定稀有度上限，属性总和决定实际稀有度
  const maxRarityByCount = (DUANZAO.stat_count_to_rarity || {})[String(statCount)] || 1;
  const totalStat = Object.values(stats).reduce((a, b) => a + b, 0);
  let rarity = 1;
  for (const [rarityKey, requiredSum] of Object.entries(DUANZAO.stat_sum_to_rarity || {})) {
    if (totalStat >= requiredSum) rarity = Math.max(rarity, parseInt(rarityKey, 10));
  }
  rarity = Math.min(rarity, maxRarityByCount);
  // 铁匠天赋 + 技能：特殊属性出现概率提升
  const bsSpecialBoost = ((bsBonus1.forge_stat_bonus || 0) + forgeInspBonus) * 0.6;
  specialBoostTotal += bsSpecialBoost;
  // 铁匠天赋：锻造失败率降低
  const bsFailReduce = (bsBonus1.forge_fail_reduce || 0) + Math.min(0.10, (bsBonus1.forge_stat_bonus || 0) * 0.1);
  failChance = Math.max(0, failChance - bsFailReduce);
  // 🔨 铁匠印章：全属性+40%
  if ((user.temp_forge_master || 0) > 0) {
    for (const k of Object.keys(stats)) stats[k] = Math.floor(stats[k] * 1.4);
    user.temp_forge_master--;
  }
  // 🔨 神匠之锤：属性翻倍（一次性消耗）
  if ((user.temp_god_hammer || 0) > 0) {
    for (const k of Object.keys(stats)) stats[k] = Math.floor(stats[k] * 2);
    user.temp_god_hammer--;
  }
  // 确保稀有度不低于投入材料的最高稀有度
  const maxMatRarity2 = Math.max(...materialConfigs.map(mc => mc.rarity || 1));
  if (maxMatRarity2 > rarity) {
    rarity = maxMatRarity2;
    // 稀有度被材料品质提升时，同步提升属性以匹配新稀有度
    const minSumForRarity = Object.entries(DUANZAO.stat_sum_to_rarity || {})
      .filter(([rk]) => parseInt(rk, 10) === rarity)
      .map(([, rs]) => rs)[0];
    if (minSumForRarity && totalStat < minSumForRarity) {
      const scale = minSumForRarity / Math.max(1, totalStat);
      for (const k of Object.keys(stats)) stats[k] = Math.floor(stats[k] * scale);
    }
  }

  // -- 特殊属性生成 --
  const specialAttrs = {};
  // 材料强制触发的特殊属性（如 火山石 → 火焰伤害）
  for (const fsk of forcedSpecials) {
    const fscfg = DUANZAO.special_attr_config[fsk];
    if (fscfg) {
      if (fsk === 'fire_damage') {
        specialAttrs[fsk] = rand(fscfg.min_val, Math.floor(fscfg.max_val * 1));
      } else {
        specialAttrs[fsk] = randFloat(fscfg.min_val || 0.03, (fscfg.max_val || 0.12) * 1);
      }
    }
  }
  // 🔨 武器附魔卷轴：保底1个特殊属性
  let guaranteedSpecial = false;
  if ((user.temp_guaranteed_special || 0) > 0) { user.temp_guaranteed_special--; guaranteedSpecial = true; }
  // forge_god: 10%概率必定6词条+3特殊属性
  const isGodMode = forgeGodChance > 0 && Math.random() < forgeGodChance;
  if (isGodMode) {
    for (const s of DUANZAO.stat_names || ['speed','attack','attack_speed','defense','dodge','hp']) stats[s] = stats[s] || rand(3, 20);
    const spKeys = Object.keys(DUANZAO.special_attr_config || {});
    for (let i = 0; i < 3; i++) {
      const key = spKeys[rand(0, spKeys.length - 1)];
      const cfg = DUANZAO.special_attr_config[key];
      if (key === 'fire_damage') {
        specialAttrs[key] = rand(cfg.min_val, Math.floor(cfg.max_val * 1));
      } else {
        specialAttrs[key] = randFloat(cfg.min_val || 0.03, (cfg.max_val || 0.12) * 1);
      }
    }
  } else {
    for (const [key, cfg] of Object.entries(DUANZAO.special_attr_config || {})) {
      if (Math.random() < (0.05 + specialBoostTotal)) {
        if (key === 'fire_damage') {
          specialAttrs[key] = rand(cfg.min_val, Math.floor(cfg.max_val * 1));
        } else {
          specialAttrs[key] = randFloat(cfg.min_val || 0.03, (cfg.max_val || 0.12) * 1);
        }
      }
    }
    // min_special: 保底特殊属性数量（武器附魔卷轴也保底1个）
    let spKeys = Object.keys(specialAttrs);
    const effectiveMin = Math.max(0, guaranteedSpecial ? 1 : 0);
    while (spKeys.length < effectiveMin) {
      const avail = Object.keys(DUANZAO.special_attr_config || {}).filter(k => !specialAttrs[k]);
      if (avail.length === 0) break;
      const key = avail[rand(0, avail.length - 1)];
      const cfg = DUANZAO.special_attr_config[key];
      if (key === 'fire_damage') {
        specialAttrs[key] = rand(cfg.min_val, Math.floor(cfg.max_val * 1));
      } else {
        specialAttrs[key] = randFloat(cfg.min_val || 0.03, (cfg.max_val || 0.12) * 1);
      }
      spKeys = Object.keys(specialAttrs);
    }
  }

  // -- 失败检查 --
  if (failChance > 0 && Math.random() < failChance) {
    // 失败：未保存的材料已消耗，不消耗老铁锤和淬火油
    // savedMats 中的材料从未被消费，无需返还（之前此处有重复addInv的bug）
    saveUser(req.userToken, user);
    return res.json({ error: `锻造失败！材料已消耗（失败率: ${(failChance*100).toFixed(0)}%）`, fail_chance: failChance });
  }
  // 锻造成功：消耗老铁锤和淬火油
  if (hasGodHammer) { user.godsmith_hammer = (user.godsmith_hammer || 1) - 1; if (user.godsmith_hammer < 0) user.godsmith_hammer = 0; }
  if (user.temp_forge_boost) user.temp_forge_boost = false;
  if (user.temp_forge_catalyst) user.temp_forge_catalyst = false;

  const rarityNames = DUANZAO.rarity_names || { 1: '普通', 2: '优秀', 3: '精良', 4: '史诗', 999: '传说', 9999: '神话' };
  // ensure unique weapon name
  const forgeCheck = loadForge();
  const existingNames = new Set((forgeCheck[user.id] || []).map(w => w.name));
  let uniqueName = name;
  if (existingNames.has(uniqueName)) {
    let suffix = 2;
    while (existingNames.has(name + '❳' + suffix)) suffix++;
    uniqueName = name + '❳' + suffix;
  }
  // 武器等级取玩家等级和材料最高等级的较大值
  const maxSockets = (DUANZAO.max_sockets || 3) + bonusSocket;
  const maxMatLevel = Math.max(...materialConfigs.map(mc => mc.level || 1));
  const weapon = { id: uid(), name: uniqueName, rarity, type: weaponType || '剑', stats, special_attrs: specialAttrs, sockets: [], strengthen_count: 0,
    max_sockets: maxSockets, weapon_level: Math.max(user.level || 1, maxMatLevel), forge_level_at_forge: forgeLv, created_at: new Date().toISOString(), rarity_name: rarityNames[String(rarity)] || '普通' };

  const forge = loadForge();
  if (!forge[user.id]) forge[user.id] = [];
  forge[user.id].push(weapon); saveForge(forge);
  user.forge_exp = (user.forge_exp || 0) + totalStat;
  while (user.forge_exp >= forgeExpNeeded(user.forge_level)) { user.forge_exp -= forgeExpNeeded(user.forge_level); user.forge_level = (user.forge_level || 1) + 1; }
  // 每日任务追踪 - 锻造
  const questsCompleted = updateQuestProgress(user, 'forge_weapon', 1);
  saveUser(req.userToken, user);
  res.json({ weapon, forge_level: user.forge_level, forge_exp: user.forge_exp, rarity_name: weapon.rarity_name, quests_completed: questsCompleted,
    blacksmith_bonus: blacksmithBonus > 1 ? Math.round((blacksmithBonus - 1) * 100) : 0,
    special_boost: Math.round(bsSpecialBoost * 100), fail_reduced: Math.round(bsFailReduce * 100) });
});
// -- 直接制作配方列表（含已学套装） --
app.get('/api/forge/direct-craft-list', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const recipes = (DUANZAO.direct_craft || []).map(r => ({
    name: r.name, type: r.type, rarity: r.rarity,
    min_level: r.min_level, stats: r.stats, materials: r.materials, is_set: false
  }));
  // 已学蓝图的套装装备
  const sets = SETS_CFG;
  const setRecipes = [];
  if (sets && sets.sets) {
    for (const set of sets.sets) {
      for (const [slot, piece] of Object.entries(set.pieces || {})) {
        const bpName = piece.name + '图纸';
        if ((user.learned_blueprints || []).includes(bpName)) {
          setRecipes.push({
            name: piece.name, type: slot,
            rarity: set.min_level >= 170 ? 4 : (set.min_level >= 100 ? 3 : (set.min_level >= 40 ? 2 : 1)),
            min_level: set.min_level || 1,
            stats: piece.stats || {},
            materials: piece.materials ? materialArrayToObj(piece.materials) : {},
            is_set: true, set_id: set.id, set_name: set.name,
          });
        }
      }
    }
  }
  res.json({ recipes: recipes.concat(setRecipes) });
});
// -- 直接制作（使用预定义配方） --
app.post('/api/forge/direct-craft', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { craftName } = req.body;
  if (!craftName) return res.json({ error: '请指定要制作的装备名称' });
  const recipes = DUANZAO.direct_craft || [];
  const recipe = recipes.find(r => r.name === craftName);
  if (!recipe) return res.json({ error: '未找到该配方。可用: ' + recipes.map(r => r.name).join('、') });
  if ((user.level || 1) < (recipe.min_level || 1)) return res.json({ error: `等级不足，需要 Lv.${recipe.min_level}` });
  // 锻造里程碑 + 铁匠职业：材料节省
  const forgeLv = user.forge_level || 1;
  const milestones = DUANZAO.forge_milestones || {};
  const bsBonusDC = getProfessionBonus(user);
  let materialSaveChance = (bsBonusDC.material_save || 0), bonusSocket = 0;
  let doubleCraftChance = (bsBonusDC.double_craft || 0);
  // 里程碑加成
  for (const [lv, ms] of Object.entries(milestones)) {
    if (forgeLv >= parseInt(lv, 10)) {
      if (ms.effect === 'material_save') materialSaveChance += (ms.value || 0);
      if (ms.effect === 'double_craft') doubleCraftChance += (ms.value || 0);
      if (ms.effect === 'bonus_socket') bonusSocket = 1;
      if (ms.effect === 'free_craft') msFreeGold = true;
    }
  }
  // 检查材料（先检查再消耗，材料节省在消耗时判断）
  for (const [matName, matCount] of Object.entries(recipe.materials || {})) {
    if (!hasInv(user, matName, matCount)) return res.json({ error: `材料不足：需要 ${matName} x${matCount}` });
  }
  // 金币消耗
  const goldCost = (recipe.rarity || 1) * 200 + Object.values(recipe.materials || {}).reduce((s, c) => s + c * 30, 0);
  if ((user.coins || 0) < goldCost) return res.json({ error: `金币不足！需要 ${goldCost.toLocaleString()} 金币` });
  // 消耗材料和金币（material_save 概率不消耗单个材料）
  let savedCount = 0;
  for (const [matName, matCount] of Object.entries(recipe.materials || {})) {
    for (let i = 0; i < matCount; i++) {
      if (Math.random() < materialSaveChance) { savedCount++; continue; }
      remInv(user, matName, 1);
    }
  }
  user.coins -= goldCost;
  // 创建武器
  const rarityNames = DUANZAO.rarity_names || { 1: '普通', 2: '优秀', 3: '精良', 4: '史诗', 999: '传说', 9999: '神话' };
  const forge = loadForge();
  if (!forge[user.id]) forge[user.id] = [];
  const existingNames = new Set(forge[user.id].map(w => w.name));
  let uniqueName = recipe.name;
  if (existingNames.has(uniqueName)) {
    let suffix = 2;
    while (existingNames.has(recipe.name + '❳' + suffix)) suffix++;
    uniqueName = recipe.name + '❳' + suffix;
  }
  const weapon = {
    id: uid(), name: uniqueName, rarity: recipe.rarity || 1,
    type: recipe.type || 'weapon',
    stats: { attack: 0, defense: 0, speed: 0, attack_speed: 0, dodge: 0, hp: 0, ...(recipe.stats || {}) },
    special_attrs: {}, sockets: [], strengthen_count: 0,
    max_sockets: (DUANZAO.max_sockets || 3) + bonusSocket, weapon_level: Math.max(user.level || 1, recipe.min_level || 1),
    forge_level_at_forge: user.forge_level || 1, created_at: new Date().toISOString(),
    rarity_name: rarityNames[String(recipe.rarity || 1)] || '区'
  };
  // 💎？区？！必带特殊属性，🟥？强强？！概率带
  if (recipe.rarity === 9999 || recipe.rarity === 999) {
    const spCfg = DUANZAO.special_attr_config || {};
    const spKeys = Object.keys(spCfg);
    if (spKeys.length > 0) {
      const chance = recipe.rarity === 9999 ? 1.0 : 0.4;
      if (Math.random() < chance) {
        const count = recipe.rarity === 9999 ? (Math.random() < 0.4 ? 2 : 1) : 1;
        const shuffled = spKeys.sort(() => Math.random() - 0.5);
        for (let si = 0; si < Math.min(count, shuffled.length); si++) {
          const key = shuffled[si];
          const cfg = spCfg[key];
          const val = cfg.min_val + Math.random() * (cfg.max_val - cfg.min_val);
          weapon.special_attrs[key] = Math.round(val * 10000) / 10000;
        }
      }
    }
  }
  forge[user.id].push(weapon); saveForge(forge);
  // 锻造经验 - 铁匠职业加成
  const totalStat = Object.values(weapon.stats).reduce((a, b) => a + b, 0);
  const dcExpBonus = 1 + (bsBonusDC.forge_exp_bonus || 0);
  user.forge_exp = (user.forge_exp || 0) + Math.floor(totalStat * dcExpBonus);
  // 双倍制作
  let doubleCrafted = false;
  if (Math.random() < doubleCraftChance) {
    const weapon2 = { ...weapon, id: uid(), name: uniqueName + '❳复制' };
    forge[user.id].push(weapon2); doubleCrafted = true;
  }
  while (user.forge_exp >= forgeExpNeeded(user.forge_level)) {
    user.forge_exp -= forgeExpNeeded(user.forge_level);
    user.forge_level = (user.forge_level || 1) + 1;
  }
  updateQuestProgress(user, 'forge_weapon', 1);
  saveUser(req.userToken, user);
  res.json({ weapon, forge_level: user.forge_level, forge_exp: user.forge_exp, rarity_name: weapon.rarity_name, gold_cost: goldCost, materials_saved: savedCount > 0 ? savedCount : 0, double_crafted: doubleCrafted });
});
// -- 等级解锁配方 --
app.get('/api/forge/level-recipes', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const playerLv = user.level || 1;
  const tiers = (DUANZAO.level_recipes || {}).tiers || [];
  const unlocked = [];
  for (const tier of tiers) {
    if (playerLv >= (tier.level || 1)) {
      for (const rcpName of (tier.recipes || [])) {
        const fullRecipe = (DUANZAO.direct_craft || []).find(r => r.name === rcpName);
        if (fullRecipe) unlocked.push(fullRecipe);
      }
    }
  }
  res.json({ recipes: unlocked, player_level: playerLv, all_tiers: tiers });
});
app.post('/api/forge/equip', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { weaponId, weaponName, slot = 'weapon' } = req.body;
  const validSlots = ['weapon','helmet','armor','boots','leggings','accessory'];
  if (!validSlots.includes(slot)) return res.json({ error: '无效的装备槽位' });
  if (!weaponId && !weaponName) return res.json({ error: '请提供武器ID或名称' });
  const forge = loadForge();
  const userWeapons = forge[user.id] || [];
  let weapon = null;
  if (weaponId) weapon = userWeapons.find(w => w.id === weaponId);
  if (!weapon && weaponName) weapon = userWeapons.find(w => w.name === weaponName);
  if (!weapon) return res.json({ error: '武器库中找不到该武器' });
  if (!user.equipment) user.equipment = {};
  // store weapon id (migrate from name if needed)
  user.equipment[slot] = weapon.id;
  saveUser(req.userToken, user);
  res.json({ equipped: { slot, weapon: weapon.name, weaponId: weapon.id } });
});
// -- 分解武器 --
app.post('/api/forge/decompose', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { weaponId, weaponName } = req.body;
  const forge = loadForge();
  if (!forge[user.id]) return res.json({ error: '武器库为空' });
  let idx = -1;
  if (weaponId) idx = forge[user.id].findIndex(w => w.id === weaponId);
  if (idx === -1 && weaponName) idx = forge[user.id].findIndex(w => w.name === weaponName);
  if (idx === -1) return res.json({ error: '找不到该武器' });
  const weapon = forge[user.id][idx];
  // unequip if this weapon is equipped
  if (user.equipment) {
    for (const [slot, wid] of Object.entries(user.equipment)) {
      if (wid === weapon.id || wid === weapon.name) user.equipment[slot] = '';
    }
  }
  // 分解武器获得锻造经验（不再返还道具）
  const stats = weapon.stats || {};
  const totalStat = Object.values(stats).reduce((a, b) => a + b, 0);
  const expGain = Math.floor(totalStat * 0.75);
  user.forge_exp = (user.forge_exp || 0) + expGain;
  while (user.forge_exp >= forgeExpNeeded(user.forge_level)) {
    user.forge_exp -= forgeExpNeeded(user.forge_level);
    user.forge_level = (user.forge_level || 1) + 1;
  }
  // 从武器库移除
  forge[user.id].splice(idx, 1);
  saveForge(forge);
  saveUser(req.userToken, user);
  res.json({ decomposed: weapon.name, exp: expGain, forge_level: user.forge_level });
});

// 批量分解武器
app.post('/api/forge/decompose-batch', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { weaponIds = [] } = req.body;
  if (!weaponIds.length) return res.json({ error: '请选择要分解的武器' });
  const forge = loadForge();
  if (!forge[user.id]) return res.json({ error: '武器库为空' });
  let totalExp = 0, count = 0;
  const remaining = [];
  for (const w of (forge[user.id] || [])) {
    if (weaponIds.includes(w.id)) {
      if (user.equipment) {
        for (const [slot, wid] of Object.entries(user.equipment)) {
          if (wid === w.id || wid === w.name) user.equipment[slot] = '';
        }
      }
      const totalStat = Object.values(w.stats || {}).reduce((a, b) => a + b, 0);
      totalExp += Math.floor(totalStat * 0.75);
      count++;
    } else {
      remaining.push(w);
    }
  }
  forge[user.id] = remaining;
  user.forge_exp = (user.forge_exp || 0) + totalExp;
  while (user.forge_exp >= forgeExpNeeded(user.forge_level)) {
    user.forge_exp -= forgeExpNeeded(user.forge_level);
    user.forge_level = (user.forge_level || 1) + 1;
  }
  saveForge(forge);
  saveUser(req.userToken, user);
  res.json({ count, exp: totalExp, forge_level: user.forge_level });
});

// 一键分解：所有未装备武器
app.post('/api/forge/decompose-all', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const forge = loadForge();
  if (!forge[user.id] || !forge[user.id].length) return res.json({ error: '武器库为空' });
  // 收集已装备武器的id
  const equippedIds = new Set();
  if (user.equipment) {
    for (const wid of Object.values(user.equipment)) {
      if (wid) equippedIds.add(wid);
    }
  }
  let totalExp = 0, count = 0;
  const remaining = [];
  for (const w of forge[user.id]) {
    if (equippedIds.has(w.id) || equippedIds.has(w.name)) {
      remaining.push(w);
    } else {
      const totalStat = Object.values(w.stats || {}).reduce((a, b) => a + b, 0);
      totalExp += Math.floor(totalStat * 0.75);
      count++;
    }
  }
  if (count === 0) return res.json({ error: '没有可分解的武器（全部已装备）' });
  forge[user.id] = remaining;
  user.forge_exp = (user.forge_exp || 0) + totalExp;
  while (user.forge_exp >= forgeExpNeeded(user.forge_level)) {
    user.forge_exp -= forgeExpNeeded(user.forge_level);
    user.forge_level = (user.forge_level || 1) + 1;
  }
  saveForge(forge);
  saveUser(req.userToken, user);
  res.json({ count, exp: totalExp, forge_level: user.forge_level });
});

app.post('/api/forge/unequip', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { slot } = req.body;
  if (!user.equipment) user.equipment = {};
  user.equipment[slot] = '';
  saveUser(req.userToken, user);
  res.json({ unequipped: { slot } });
});
// -- 强化石强化 --
app.post('/api/forge/strengthen-stone', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { weaponId, stoneName } = req.body;
  if (!weaponId || !stoneName) return res.json({ error: '请提供武器ID和强化石名称' });
  const stonesCfg = (DUANZAO.strengthen_stones || {}).stones || {};
  const stoneCfg = stonesCfg[stoneName];
  if (!stoneCfg) return res.json({ error: '未知强化石。可用: ' + Object.keys(stonesCfg).join('、') });
  if (!hasInv(user, stoneName)) return res.json({ error: `背包中没有「${stoneName}」` });
  const forge = loadForge();
  const weapons = forge[user.id] || [];
  const wIdx = weapons.findIndex(w => w.id === weaponId);
  if (wIdx === -1) return res.json({ error: '武器库中找不到该武器' });
  const weapon = weapons[wIdx];
  const strCount = weapon.strengthen_count || 0;
  const maxStr = stoneCfg.max_strengthen || 20;
  if (strCount >= maxStr) return res.json({ error: `「${weapon.name}」强化等级+${strCount}，该强化石最高支持+${maxStr}` });
  // 读取锻造里程碑
  const forgeLv = user.forge_level || 1;
  const msCfg = DUANZAO.forge_milestones || {};
  let msStrengthenSpecial = 0, msStrengthenDouble = 0, msBreakthrough = 0, msDoubleCraft = 0;
  let msStrengthenProtect = false, msForgeGod = 0, msFreeGold = false, msMinSuccess = 0, msGodMode = false;
  for (const [lv, ms] of Object.entries(msCfg)) {
    if (forgeLv >= parseInt(lv, 10)) {
      if (ms.effect === 'strengthen_special') msStrengthenSpecial += (ms.value || 0);
      if (ms.effect === 'strengthen_double') msStrengthenDouble += (ms.value || 0);
      if (ms.effect === 'breakthrough_boost') msBreakthrough += (ms.value || 0);
      if (ms.effect === 'double_craft') msDoubleCraft += (ms.value || 0);
      if (ms.effect === 'strengthen_protect') msStrengthenProtect = true;
      if (ms.effect === 'forge_god') msForgeGod = (ms.value || 0);
      if (ms.effect === 'free_craft') msFreeGold = true;
      if (ms.effect === 'min_success_boost') msMinSuccess = (ms.value || 0);
      if (ms.effect === 'god_mode') msGodMode = true;
    }
  }
  // 金币消耗 - free_craft里程碑免金币
  const stonesAll = DUANZAO.strengthen_stones || {};
  const goldCost = msFreeGold ? 0 : (stonesAll.gold_cost_base || 300) + strCount * (stonesAll.gold_cost_per_level || 150);
  if ((user.coins || 0) < goldCost) return res.json({ error: `金币不足！需要 ${goldCost.toLocaleString()} 金币` });
  // 消耗强化石
  remInv(user, stoneName, 1);
  user.coins -= goldCost;
  // 成功率 - 铁匠职业加成
  const bsProf = getProfessionBonus(user);
  let successRate = (stoneCfg.success_rate || 0.5) + (bsProf.strengthen_bonus || 0) + ((user.perm_stats || {}).strengthen_bonus || 0);
  // 强化催化剂临时加成
  if ((user.temp_strengthen_catalyst || 0) > 0) { successRate += 0.20; user.temp_strengthen_catalyst--; }
  // 淬火油临时加成
  if ((user.temp_forge_boost || 0) > 0) { successRate += 0.15; user.temp_forge_boost--; }
  successRate = Math.min(1.0, Math.max(msMinSuccess || 0.05, successRate));
  const success = Math.random() < successRate;
  const statCN = { attack: '攻击', defense: '防御', speed: '速度', attack_speed: '攻速', dodge: '闪避', hp: '生命' };
  if (success) {
    // v3: 属性偏向强化 - 随机选1-2个主属性大幅提升，其余微升
    const allStats = ['attack','defense','speed','attack_speed','dodge','hp'];
    // 进化武器：用 base_stats × 等级 重算当前属性
    const uLv = Math.max(1, user.level || 1);
    if (weapon.level_scale && weapon.base_stats) {
      weapon.stats = {};
      for (const b in weapon.base_stats) {
        weapon.stats[b] = Math.floor(weapon.base_stats[b] * uLv);
      }
    }
    const currentStats = { ...(weapon.stats || {}) };
    const addedStats = {};
    const stoneRarity = stoneCfg.rarity || 1;
    const specialType = stoneCfg.special_type || 'normal';
    const variance = stoneCfg.stat_boost_variance || 0.08; // 🎲 属性浮动范围
    // 混沌强化石特殊处理
    let chaosEffect = null;
    if (specialType === 'chaos') {
      const chaosRoll = Math.random();
      const effects = stoneCfg.chaos_effects || { double_boost: 0.5, normal: 0.3, curse: 0.2 };
      if (chaosRoll < (effects.double_boost || 0.5)) chaosEffect = 'double';
      else if (chaosRoll < (effects.double_boost || 0.5) + (effects.normal || 0.3)) chaosEffect = 'normal';
      else chaosEffect = 'curse';
    }
    // 🎲 随机焦点属性数量（可能1~3个）
    let focusCount, focusStats;
    if (stoneCfg.focus_stats) {
      focusStats = stoneCfg.focus_stats.filter(s => (currentStats[s] || 0) > 0);
      if (!focusStats.length) focusStats = ['attack'];
    } else {
      focusCount = stoneRarity >= 4 ? rand(1, 3) : rand(1, 2); // 随机1-3个焦点
      const existingStats = allStats.filter(s => (currentStats[s] || 0) > 0);
      const shuffled = existingStats.sort(() => Math.random() - 0.5);
      focusStats = shuffled.slice(0, Math.min(focusCount, shuffled.length));
    }
    // 🎲 焦点属性大提升（固定数值），其余微升
    const chaosMult = chaosEffect === 'double' ? 2.5 : (chaosEffect === 'curse' ? 0.3 : 1.0);
    // 固定数值提升：基于武器等级×稀有度系数
    // 进化武器的"等级"即玩家等级（因为属性=base_stats×等级）
    const wLevel = weapon.level_scale ? (user.level || 1) : (weapon.level || weapon.weapon_level || 1);
    const weaponRarity = weapon.rarity || 1;
    const rarityTier = weaponRarity >= 99999 ? 6 : weaponRarity >= 9999 ? 5 : weaponRarity >= 999 ? 4 : Math.min(weaponRarity, 4);
    // 等级因子: 每10级+0.2倍 (温和增长)
    const lvFactor = 1 + Math.floor(wLevel / 10) * 0.2;
    const focusBase = Math.round([0, 3, 5, 7, 9, 12, 15][rarityTier] * lvFactor);
    const minorBase = Math.round([0, 1, 2, 3, 4, 5, 6][rarityTier] * lvFactor);
    const focusAdd = Math.round((focusBase + rand(-2, 3)) * chaosMult);
    const minorAdd = Math.round((minorBase + rand(-1, 2)) * chaosMult);
    // 🎲 小概率触发暴击强化（3%概率，提升×2.5）
    const isCrit = !chaosEffect && Math.random() < 0.03;
    for (const s of allStats) {
      if ((currentStats[s] || 0) <= 0) continue;
      const isFocus = focusStats.includes(s);
      let add = isFocus ? focusAdd : minorAdd;
      if (isCrit) add = Math.round(add * 2.5); // 🎲 暴击强化！
      if (chaosEffect === 'curse') add = -Math.abs(add);
      add = Math.max(chaosEffect === 'curse' ? -3 : 1, add);
      currentStats[s] = (currentStats[s] || 0) + add;
      addedStats[s] = (addedStats[s] || 0) + add;
    }
    // 🔄 进化武器：强化改 base_stats 而非 stats
    if (weapon.level_scale && weapon.base_stats) {
      const baseAdd = {};
      for (const s of allStats) {
        if (!addedStats[s]) continue;
        // 转换为 base_stats 增量（÷等级，保底0.01）
        const inc = Math.max(0.01, parseFloat((addedStats[s] / uLv).toFixed(4)));
        weapon.base_stats[s] = parseFloat(((weapon.base_stats[s] || 0) + inc).toFixed(4));
        baseAdd[s] = inc;
      }
      // 重算 stats
      weapon.stats = {};
      for (const b in weapon.base_stats) {
        weapon.stats[b] = Math.floor(weapon.base_stats[b] * uLv);
      }
      // 更新消息用
      for (const s of allStats) {
        if (baseAdd[s]) {
          addedStats[s] = Math.floor(baseAdd[s] * uLv);
        }
      }
    } else {
      weapon.stats = currentStats;
    }
    // 锻造之神：3%概率直接+3级且必定特殊+品质突破
    let godModeTriggered = false;
    let specialGained = null;
    let rarityUpgraded = false, oldRarity = weapon.rarity, oldRarityName = weapon.rarity_name;
    if (msForgeGod > 0 && Math.random() < msForgeGod) {
      weapon.strengthen_count = strCount + 3;
      godModeTriggered = true;
      // 必定特殊属性
      const spCfgGod = DUANZAO.special_attr_config || {};
      const spKeysGod = Object.keys(spCfgGod);
      if (spKeysGod.length > 0) {
        const spKeyG = spKeysGod[rand(0, spKeysGod.length - 1)];
        const cfgG = spCfgGod[spKeyG];
        weapon.special_attrs = weapon.special_attrs || {};
        weapon.special_attrs[spKeyG] = (weapon.special_attrs[spKeyG] || 0) + (spKeyG === 'fire_damage' ? rand(cfgG.min_val||5,cfgG.max_val||20) : parseFloat(randFloat(cfgG.min_val||0.02,cfgG.max_val||0.12).toFixed(4)));
        specialGained = spKeyG;
      }
      // 必定品质突破
      const rarityOrder = [1,2,3,4,999,9999];
      const curIdx2 = rarityOrder.indexOf(weapon.rarity||1);
      if (curIdx2 >= 0 && curIdx2 < rarityOrder.length - 1) {
        oldRarity = weapon.rarity; oldRarityName = weapon.rarity_name;
        weapon.rarity = rarityOrder[curIdx2 + 1];
        weapon.rarity_name = (DUANZAO.rarity_names||{})[String(weapon.rarity)] || weapon.rarity_name;
        rarityUpgraded = true;
      }
    } else {
      weapon.strengthen_count = strCount + 1;
      // 强化双倍：10%概率额外+1级
      if (msStrengthenDouble > 0 && Math.random() < msStrengthenDouble) {
        weapon.strengthen_count += 1;
      }
    }
    // 特殊属性 - 觉醒强化石必定获得，其他按概率
    const guaranteedSpecial = specialType === 'awakening' || (user.temp_guaranteed_special || 0) > 0;
    if ((user.temp_guaranteed_special || 0) > 0) user.temp_guaranteed_special--;
    let specialChance = guaranteedSpecial ? 1.0 : (0.05 + stoneRarity * 0.06 + (bsProf.special_chance || 0) + msStrengthenSpecial);
    if (Math.random() < specialChance) {
      const spCfg = DUANZAO.special_attr_config || {};
      const spKeys = Object.keys(spCfg);
      if (spKeys.length > 0) {
        const spKey = spKeys[rand(0, spKeys.length - 1)];
        const cfg = spCfg[spKey];
        weapon.special_attrs = weapon.special_attrs || {};
        if (spKey === 'fire_damage') {
          weapon.special_attrs[spKey] = (weapon.special_attrs[spKey] || 0) + rand(cfg.min_val || 5, cfg.max_val || 20);
        } else {
          weapon.special_attrs[spKey] = (weapon.special_attrs[spKey] || 0) + parseFloat(randFloat(cfg.min_val || 0.02, cfg.max_val || 0.12).toFixed(4));
        }
        const spLabels = { crit_rate:'暴击率', lifesteal:'吸血', crit_dmg:'暴击伤害', exp_bonus:'经验加成', coin_bonus:'金币加成', dmg_reduce:'伤害减免', counter:'反击', extra_atk:'额外攻击', fire_damage:'火焰伤害' };
        specialGained = (spLabels[spKey] || spKey);
      }
    }
    // 品质突破 - 突破强化石必定触发，其他按概率
    const newStrCount = weapon.strengthen_count;
    let isBreakthroughStone = specialType === 'breakthrough';
    if ((user.temp_guaranteed_breakthrough || 0) > 0) { isBreakthroughStone = true; user.temp_guaranteed_breakthrough--; }
    if ((newStrCount % 5 === 0 && newStrCount > 0) || isBreakthroughStone) {
      const breakthroughChance = isBreakthroughStone ? 1.0 : (0.25 + stoneRarity * 0.05 + (bsProf.breakthrough_bonus || 0) + msBreakthrough);
      if (Math.random() < breakthroughChance) {
        const rarityOrder = [1, 2, 3, 4, 999, 9999];
        const curIdx = rarityOrder.indexOf(weapon.rarity || 1);
        if (curIdx >= 0 && curIdx < rarityOrder.length - 1) {
          weapon.rarity = rarityOrder[curIdx + 1];
          const rarityNames = DUANZAO.rarity_names || {};
          weapon.rarity_name = rarityNames[String(weapon.rarity)] || weapon.rarity_name;
          rarityUpgraded = true;
        }
      }
    }
    weapons[wIdx] = weapon; forge[user.id] = weapons; saveForge(forge);
    saveUser(req.userToken, user);
    const addedStr = Object.entries(addedStats).map(([k, v]) => `${statCN[k] || k}: +${v}`).join(' | ');
    const focusStr = focusStats.map(s => statCN[s] || s).join('、');
    let msg = godModeTriggered ? `🌟 锻造之神降临！「${weapon.name}」→ +${weapon.strengthen_count}（连升3级！）\n` : `🔨 强化成功！「${weapon.name}」→ +${weapon.strengthen_count}\n`;
    if (specialType === 'chaos') {
      const chaosLabel = chaosEffect === 'double' ? '💥混沌爆发(2.5倍)!' : chaosEffect === 'curse' ? '💀混沌反噬(属性微降)...' : '🌊混沌平稳';
      msg += `🎲 混沌效果: ${chaosLabel}\n`;
    }
    msg += `🎯 焦点属性(${focusStr}): +${focusAdd} | 其余: +${minorAdd}`;
    if (isCrit) msg += ' ⚡暴击强化!';
    msg += `\n📊 本次提升: ${addedStr}`;
    if (specialGained) msg += `\n✨ ${specialType === 'awakening' ? '觉醒！' : '意外'}获得了特殊属性: ${specialGained}！`;
    if (rarityUpgraded) msg += `\n💎 ${specialType === 'breakthrough' ? '强制突破！' : '品质突破！'}${oldRarityName} → ${weapon.rarity_name}！`;
    // 强化也给锻造经验
    const strExp = Math.floor((strCount * 10 + stoneRarity * 20) * (1 + (bsProf.forge_exp_bonus || 0)));
    user.forge_exp = (user.forge_exp || 0) + strExp;
    while (user.forge_exp >= forgeExpNeeded(user.forge_level)) {
      user.forge_exp -= forgeExpNeeded(user.forge_level);
      user.forge_level = (user.forge_level || 1) + 1;
    }
    msg += `\n成功率: ${(successRate*100).toFixed(0)}% | 🔨锻造经验+${strExp} | 金币: -${goldCost.toLocaleString()}`;
    res.json({ success: true, weapon, addedStats, special_gained: specialGained, rarity_upgraded: rarityUpgraded, chaos_effect: chaosEffect, forge_exp: strExp, forge_level: user.forge_level, msg });
  } else {
    // 强化失败：降1级（可用保护符防止）
    let wasProtected = false;
    const protCharm = stonesAll.protection_charm || '强化保护符';
    const minProtLv = stonesAll.min_strengthen_for_protection || 5;
    const penalty = stonesAll.fail_penalty || 1;
    if (strCount >= minProtLv && hasInv(user, protCharm)) {
      remInv(user, protCharm, 1);
      wasProtected = true;
    }
    if (!wasProtected) {
      // 里程碑：强化保护(降级只降1) 或 神模式(不降级)
      const actualPenalty = msGodMode ? 0 : (msStrengthenProtect && strCount >= 10 ? Math.min(1, penalty) : penalty);
      weapon.strengthen_count = Math.max(0, strCount - actualPenalty);
    }
    weapons[wIdx] = weapon; forge[user.id] = weapons; saveForge(forge);
    saveUser(req.userToken, user);
    const penaltyMsg = wasProtected ? '（保护符已消耗，等级不变）' : `（降至 +${weapon.strengthen_count}）`;
    res.json({ success: false, weapon, msg: `💥 强化失败！「${weapon.name}」${penaltyMsg}\n成功率: ${(successRate*100).toFixed(0)}% | 金币: -${goldCost.toLocaleString()}` });
  }
});

// ===================== 蓝图 & 套装系统 =====================
app.get('/api/forge/sets', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const sets = (SETS_CFG.sets || []).map(s => ({
    id: s.id, name: s.name, ruins_id: s.ruins_id, min_level: s.min_level,
    pieces: s.pieces,
    bonuses: s.bonuses,
    learned: Object.values(s.pieces).every(p =>
      (user.learned_blueprints || []).includes(p.name + '图纸')
    )
  }));
  res.json({ sets, learned: user.learned_blueprints || [] });
});

// -- 蓝图管理 --
app.get('/api/forge/blueprints', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const learned = user.learned_blueprints || [];
  const inventory = user.inventory || {};
  const allBPs = [];

  // 收集所有可能的蓝图（来自套装）
  const sets = SETS_CFG.sets || [];
  for (const set of sets) {
    const pieces = [];
    for (const [slot, piece] of Object.entries(set.pieces || {})) {
      const bpName = piece.name + '图纸';
      const isLearned = learned.includes(bpName);
      const inInv = inventory[bpName] || 0;
      pieces.push({
        name: piece.name, slot, bpName,
        learned: isLearned,
        count: inInv,
        isDuplicate: isLearned && inInv > 0,
      });
    }
    allBPs.push({
      id: set.id, name: set.name, min_level: set.min_level,
      is_region_set: !!set.is_region_set, region_id: set.region_id,
      pieces,
      bonuses: set.bonuses,
      totalLearned: pieces.filter(p => p.learned).length,
      totalPieces: pieces.length,
    });
  }

  // 合成蓝图（配方类）
  const synthBPs = [];
  const synthesis = SYNTHESIS;
  if (synthesis && synthesis.recipes) {
    for (const recipe of synthesis.recipes) {
      if (recipe.unlocks_recipe) {
        const bpName = recipe.unlocks_recipe;
        synthBPs.push({
          name: recipe.name, bpName,
          learned: learned.includes(bpName),
          count: inventory[bpName] || 0,
          isDuplicate: learned.includes(bpName) && (inventory[bpName] || 0) > 0,
        });
      }
    }
  }

  res.json({ sets: allBPs, synthesis: synthBPs, learned });
});

app.post('/api/forge/learn-blueprint', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { blueprintName } = req.body;
  if (!blueprintName) return res.json({ error: '请指定蓝图' });
  if (!hasInv(user, blueprintName)) return res.json({ error: '背包中没有该蓝图' });
  if ((user.learned_blueprints || []).includes(blueprintName))
    return res.json({ error: '已经学会了该蓝图' });
  remInv(user, blueprintName, 1);
  if (!user.learned_blueprints) user.learned_blueprints = [];
  user.learned_blueprints.push(blueprintName);
  saveUser(req.userToken, user);
  res.json({ success: true, learned: user.learned_blueprints, msg: `📜 学会了「${blueprintName}」！` });
});

// -- 活动武器进化（手动）--
app.post('/api/forge/evolve', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { weaponId } = req.body;
  if (!weaponId) return res.json({ error: '请指定武器' });
  const forge = loadForge();
  const userWeapons = forge[user.id] || [];
  const weapon = userWeapons.find(w => w.id === weaponId);
  if (!weapon) return res.json({ error: '武器未找到' });
  if (!weapon.is_event_limited) return res.json({ error: '只有活动限定武器才能进化' });
  var stage = weapon.evolve_stage || 0;
  if (stage >= 3) return res.json({ error: '已达最高进化阶段 (III)' });
  const evtState = getEventState();
  const curName = evtState.cfg?.currency?.name || '活动币';
  const eventBalance = (user.event_currencies || {})[curName] || 0;
  const universalBal = (user.event_currencies || {})['通用活动币'] || 0;
  const balance = eventBalance + universalBal;
  var costs = [{s:1,cost:15,mats:{'火焰之心':3,'星之碎片':5}},{s:2,cost:30,mats:{'寒冰核心':5,'深海珍珠':5,'古代金币':10}},{s:3,cost:50,mats:{'大地核心':3,'混沌之鳞':5,'创世结晶':3}}];
  var costCfg = costs.find(function(c){return c.s === stage+1}) || costs[0];
  if(balance < costCfg.cost) return res.json({error:curName+'不足，需要'+costCfg.cost+'个'});
  for(var mk in costCfg.mats){ if(!hasInv(user, mk, costCfg.mats[mk])) return res.json({error:'材料不足：'+mk+' x'+costCfg.mats[mk]}); }
  var rem2 = costCfg.cost;
  var evDed = Math.min(rem2, eventBalance);
  user.event_currencies[curName] = eventBalance - evDed;
  rem2 -= evDed;
  if (rem2 > 0) user.event_currencies['通用活动币'] = universalBal - rem2;
  for(var mk in costCfg.mats){ remInv(user, mk, costCfg.mats[mk]); }
  // 进化：提升base_stats倍率，随等级成长的系数变大
  var stageMult = [1.15, 1.17, 1.19][stage] || 1.19; // 2→2.3→2.7→3.2
  var oldBaseAtk = (weapon.base_stats||weapon.stats).attack || 0;
  if(weapon.base_stats){
    for(var _b in weapon.base_stats){ weapon.base_stats[_b] = Math.ceil(weapon.base_stats[_b] * stageMult); }
  }
  // 同步更新当前stats
  var lv = user.level || 1;
  if(weapon.level_scale && weapon.base_stats){
    if(!weapon.stats) weapon.stats = {};
    for(var _b2 in weapon.base_stats){ weapon.stats[_b2] = Math.floor(weapon.base_stats[_b2] * lv); }
  }
  // 稀有度提升
  var rarityOrder = [1,2,3,4,999,9999];
  var curIdx = rarityOrder.indexOf(weapon.rarity||1);
  if(curIdx >= 0 && curIdx < rarityOrder.length-1){ weapon.rarity = rarityOrder[curIdx+1]; weapon.rarity_name = (DUANZAO.rarity_names||{})[String(weapon.rarity)] || weapon.rarity_name; }
  // 特殊属性增强
  weapon.special_attrs = weapon.special_attrs || {};
  for(var _a2 in weapon.special_attrs){
    weapon.special_attrs[_a2] = typeof weapon.special_attrs[_a2]==='number' ? parseFloat((weapon.special_attrs[_a2] * (1.3+Math.random()*0.3)).toFixed(4)) : weapon.special_attrs[_a2];
  }
  weapon.evolve_stage = stage + 1;
  weapon.name = weapon.name.replace(/·[IV]+$/,'') + '·' + ('I'.repeat(stage+1));
  saveForge(forge);
  saveUser(req.userToken, user);
  res.json({success:true,name:weapon.name,stage:weapon.evolve_stage,rarity_name:weapon.rarity_name,
    base_attack_per_level: weapon.base_stats.attack, atk_now: weapon.stats.attack});
});

app.post('/api/forge/craft-set', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { setId, slot } = req.body;
  if (!setId || !slot) return res.json({ error: '请指定套装和部位' });
  const sdef = (SETS_CFG.sets || []).find(s => s.id === setId);
  if (!sdef) return res.json({ error: '套装不存在' });
  const piece = sdef.pieces[slot];
  if (!piece) return res.json({ error: '无效部位' });
  if ((user.level || 1) < (sdef.min_level || 1))
    return res.json({ error: `等级不足，需要 Lv.${sdef.min_level}` });
  const bpName = piece.name + '图纸';
  if (!(user.learned_blueprints || []).includes(bpName))
    return res.json({ error: `未学会「${bpName}」，需要先使用蓝图` });
  // Check materials
  for (const mat of (piece.materials || [])) {
    const parts = mat.split('x');
    const matName = parts[0];
    const matCount = parseInt(parts[1]) || 1;
    if (!hasInv(user, matName, matCount))
      return res.json({ error: `材料不足：需要 ${matName} x${matCount}` });
  }
  // Consume materials
  for (const mat of (piece.materials || [])) {
    const parts = mat.split('x');
    remInv(user, parts[0], parseInt(parts[1]) || 1);
  }
  // Create set equipment
  const forge = loadForge();
  if (!forge[user.id]) forge[user.id] = [];
  // 根据套装等级计算稀有度（高等级套装有概率出更高稀有度）
  const setMinLv = sdef.min_level || 1;
  let rarity;
  if (setMinLv >= 170) rarity = Math.random() < 0.3 ? 9999 : (Math.random() < 0.5 ? 999 : 4);
  else if (setMinLv >= 120) rarity = Math.random() < 0.2 ? 9999 : (Math.random() < 0.4 ? 999 : Math.min(4, 1 + Math.floor(setMinLv / 30)));
  else if (setMinLv >= 75) rarity = Math.random() < 0.15 ? 999 : Math.min(4, 1 + Math.floor(setMinLv / 30));
  else rarity = Math.min(4, 1 + Math.floor(setMinLv / 30));
  const rarityNames = DUANZAO.rarity_names || { 1: '普通', 2: '优秀', 3: '精良', 4: '史诗', 999: '传说', 9999: '神话' };
  const weapon = {
    id: uuidv4(), name: piece.name,
    rarity, type: slot, set_id: setId, set_name: sdef.name,
    stats: { ...piece.stats, attack: piece.stats.attack || 0, defense: piece.stats.defense || 0,
      speed: piece.stats.speed || 0, attack_speed: piece.stats.attack_speed || 0,
      dodge: piece.stats.dodge || 0, hp: piece.stats.hp || 0 },
    special_attrs: {}, sockets: [], strengthen_count: 0,
    max_sockets: 3, weapon_level: user.level || 1,
    forge_level_at_forge: user.forge_level || 1,
    created_at: new Date().toISOString(),
    rarity_name: rarityNames[String(rarity)] || '区'
  };
  // 💎？区？！必带特殊属性，🟥？强强？！概率带
  if (rarity === 9999 || rarity === 999) {
    const spCfg = DUANZAO.special_attr_config || {};
    const spKeys = Object.keys(spCfg);
    if (spKeys.length > 0) {
      const chance = rarity === 9999 ? 1.0 : 0.4;
      if (Math.random() < chance) {
        const count = rarity === 9999 ? (Math.random() < 0.4 ? 2 : 1) : 1;
        const shuffled = spKeys.sort(() => Math.random() - 0.5);
        for (let si = 0; si < Math.min(count, shuffled.length); si++) {
          const key = shuffled[si];
          const cfg = spCfg[key];
          const val = cfg.min_val + Math.random() * (cfg.max_val - cfg.min_val);
          weapon.special_attrs[key] = Math.round(val * 10000) / 10000;
        }
      }
    }
  }
  forge[user.id].push(weapon); saveForge(forge);
  saveUser(req.userToken, user);
  res.json({ success: true, weapon, msg: `🔨 制作成功！获得了「${piece.name}」！` });
});

// ===================== 宝石系统 =====================
function gemStatRange(rarity) {
  const ranges = GEMS.gem_stat_range || { "1": [2,6], "2": [3,8], "3": [4,10], "4": [6,14], "999":[8,18], "9999":[10,24] };
  return ranges[String(rarity)] || [2, 6];
}
function genGemName() {
  const pre = pick(GEMS.gem_prefixes || ['火焰']);
  const suf = pick(GEMS.gem_suffixes || ['宝石']);
  return pre + suf;
}

app.get('/api/gems', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const forge = loadForge();
  const weapons = forge[user.id] || [];
  const gems = user.gems || [];
  const socketed = [];
  for (const w of weapons) {
    if (w.sockets && w.sockets.length > 0) {
      for (const g of w.sockets) socketed.push({ weapon: w.name, weaponId: w.id, gem: g });
    }
    // 迁移旧字段 gems → sockets
    if (w.gems && w.gems.length > 0 && (!w.sockets || w.sockets.length === 0)) {
      w.sockets = w.gems; delete w.gems;
    }
  }
  // 可用材料
  const ores = (DUANZAO.ores || []).map(o => o.name);
  const mats = (DUANZAO.materials || []).map(m => m.name);
  const allMats = [...new Set([...ores, ...mats])];
  const available = [];
  for (const mat of allMats) { const c = countInv(user, mat); if (c > 0) available.push({ name: mat, count: c }); }
  res.json({ gems, socketed, max_sockets: GEMS.max_sockets || 3, available_materials: available, ores: DUANZAO.ores || [], materials: DUANZAO.materials || [], statCN: { attack:'攻击',defense:'防御',speed:'速度',attack_speed:'攻速',dodge:'闪避',hp:'生命',crit_rate:'暴击率',crit_dmg:'暴伤',lifesteal:'吸血',counter:'反击',damage_reduce:'减伤',exp_bonus:'经验',gold_bonus:'金币' } });
});

app.post('/api/gem/craft', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { materials = [] } = req.body;
  if (materials.length < 2) return res.json({ error: '请选择至少2个材料' });
  if (materials.length > 6) return res.json({ error: '最多6个材料' });
  // 验证材料
  for (const m of materials) {
    if (!hasInv(user, m)) return res.json({ error: `背包中没有 ${m}` });
  }
  for (const m of materials) remInv(user, m, 1);
  // 计算宝石属性（和锻造用同一套材料体系）
  const ores = DUANZAO.ores || [], forgeMats = DUANZAO.materials || [];
  const matConfigs = [];
  for (const m of materials) {
    const ore = ores.find(o => o.name === m);
    const mat = forgeMats.find(fm => fm.name === m);
    if (ore) matConfigs.push({ ...ore, isOre: true });
    else if (mat) matConfigs.push({ ...mat, isOre: false });
    else matConfigs.push({ name: m, stat: 'attack', value: 5, universal: false }); // fallback
  }
  // 聚合属性：非全能材料先聚合，全能材料再分配到已有属性
  const statAcc = {};
  // 先处理非全能材料
  for (const mc of matConfigs) {
    if (mc.universal) continue;
    if (mc.stat) { statAcc[mc.stat] = (statAcc[mc.stat] || 0) + (mc.value || 5); }
  }
  // 再处理全能材料：总值平均分配到已有属性
  for (const mc of matConfigs) {
    if (!mc.universal) continue;
    let val = mc.value || 5;
    const existingStats = Object.keys(statAcc);
    if (existingStats.length > 0) {
      const perStat = Math.max(1, Math.floor(val / existingStats.length));
      for (const s of existingStats) { statAcc[s] = (statAcc[s] || 0) + perStat; }
    } else {
      const allStats = ['attack','defense','speed','attack_speed','dodge','hp'];
      const pick = allStats[rand(0, allStats.length - 1)];
      statAcc[pick] = (statAcc[pick] || 0) + val;
    }
  }
  // 选最高属性作为宝石主属性
  let bestStat = 'attack', bestVal = 0;
  for (const [s, v] of Object.entries(statAcc)) {
    if (v > bestVal) { bestVal = v; bestStat = s; }
  }
  // 稀有度由总属性值和材料数决定，但不低于投入材料的最高稀有度
  const totalVal = Object.values(statAcc).reduce((a, b) => a + b, 0);
  const maxMatRarity = Math.max(...matConfigs.map(mc => mc.rarity || 1));
  let rarity = 1;
  if (totalVal >= 80) rarity = 999;
  else if (totalVal >= 50) rarity = 4;
  else if (totalVal >= 30) rarity = 3;
  else if (totalVal >= 18) rarity = 2;
  rarity = Math.max(rarity, maxMatRarity);
  // 确保宝石属性值不低于该稀有度的最低标准
  const [minValForRarity] = gemStatRange(rarity);
  if (bestVal < minValForRarity) bestVal = minValForRarity;
  // 宝石名由材料前缀+后缀组成
  const prefixes = GEMS.gem_prefixes || ['火焰'];
  const suffixes = GEMS.gem_suffixes || ['宝石'];
  const name = pick(prefixes) + pick(suffixes);
  // 费用
  const rarityCost = { 1: 80, 2: 160, 3: 240, 4: 320, 999: 500, 9999: 800 };
  const cost = materials.length * 50 + (rarityCost[rarity] || rarity * 80);
  if ((user.coins || 0) < cost) {
    // 退还材料
    for (const m of materials) addInv(user, m, 1);
    return res.json({ error: `金币不足，需要${cost}` });
  }
  user.coins -= cost;
  const gem = { name, rarity, stat: bestStat, value: bestVal, id: uid() };
  if (!user.gems) user.gems = [];
  user.gems.push(gem);
  saveUser(req.userToken, user);
  res.json({ gem, cost });
});

// -- 宝石分解 --
app.post('/api/gem/decompose', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { gemId } = req.body;
  if (!user.gems || !user.gems.length) return res.json({ error: '没有可分解的宝石' });
  const idx = user.gems.findIndex(g => g.id === gemId);
  if (idx === -1) return res.json({ error: '宝石不存在' });
  const gem = user.gems[idx];
  user.gems.splice(idx, 1);
  // 分解返还：锻造经验 + 少量金币
  const rarityCoin = { 1: 20, 2: 40, 3: 80, 4: 150, 999: 300, 9999: 500 };
  const coins = rarityCoin[gem.rarity] || gem.rarity * 20;
  user.coins = (user.coins || 0) + coins;
  const expGain = Math.floor((gem.value || 10) * 10);
  user.forge_exp = (user.forge_exp || 0) + expGain;
  while (user.forge_exp >= forgeExpNeeded(user.forge_level)) {
    user.forge_exp -= forgeExpNeeded(user.forge_level);
    user.forge_level = (user.forge_level || 1) + 1;
  }
  saveUser(req.userToken, user);
  res.json({ decomposed: gem.name, coins, exp: expGain, forge_level: user.forge_level });
});

// 批量分解宝石
app.post('/api/gem/decompose-batch', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { gemIds = [] } = req.body;
  if (!gemIds.length) return res.json({ error: '请选择要分解的宝石' });
  if (!user.gems || !user.gems.length) return res.json({ error: '没有可分解的宝石' });
  const rarityCoin = { 1: 20, 2: 40, 3: 80, 4: 150, 999: 300, 9999: 500 };
  let totalExp = 0, totalCoins = 0;
  user.gems = (user.gems || []).filter(g => {
    if (gemIds.includes(g.id)) {
      totalCoins += rarityCoin[g.rarity] || g.rarity * 20;
      totalExp += Math.floor((g.value || 10) * 10);
      return false;
    }
    return true;
  });
  user.coins = (user.coins || 0) + totalCoins;
  user.forge_exp = (user.forge_exp || 0) + totalExp;
  while (user.forge_exp >= forgeExpNeeded(user.forge_level)) {
    user.forge_exp -= forgeExpNeeded(user.forge_level);
    user.forge_level = (user.forge_level || 1) + 1;
  }
  saveUser(req.userToken, user);
  res.json({ count: gemIds.length, coins: totalCoins, exp: totalExp, forge_level: user.forge_level });
});

app.post('/api/gem/socket', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { weaponId, gemId } = req.body;
  if (!user.gems || !user.gems.length) return res.json({ error: '没有可用的宝石' });
  const gemIdx = user.gems.findIndex(g => g.id === gemId);
  if (gemIdx === -1) return res.json({ error: '宝石不存在' });
  const forge = loadForge();
  const weapons = forge[user.id] || [];
  const wIdx = weapons.findIndex(w => w.id === weaponId);
  if (wIdx === -1) return res.json({ error: '武器不存在' });
  const weapon = weapons[wIdx];
  const maxSockets = weapon.max_sockets || GEMS.max_sockets || 3;
  if (!weapon.sockets) weapon.sockets = [];
  if (weapon.sockets.length >= maxSockets) return res.json({ error: `武器宝石孔已满 (${maxSockets}个)` });
  const gem = user.gems[gemIdx];
  user.gems.splice(gemIdx, 1);
  weapon.sockets.push(gem);
  // apply gem stat to weapon
  if (!weapon.gem_stats) weapon.gem_stats = {};
  weapon.gem_stats[gem.stat] = (weapon.gem_stats[gem.stat] || 0) + gem.value;
  weapon.stats = weapon.stats || {};
  weapon.stats[gem.stat] = (weapon.stats[gem.stat] || 0) + gem.value;
  forge[user.id] = weapons; saveForge(forge);
  saveUser(req.userToken, user);
  const statCN = { attack:'🗡️攻击', defense:'🛡️防御', speed:'💨速度', attack_speed:'⚡攻速', dodge:'👻闪避', hp:'❤️生命' };
  res.json({ weapon: weapon.name, gem: gem.name, stat: gem.stat, stat_cn: statCN[gem.stat] || gem.stat, value: gem.value });
});

// -- 批量镶嵌宝石 --
app.post('/api/gem/socket-batch', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { weaponId, gemIds = [] } = req.body;
  if (!user.gems || !user.gems.length) return res.json({ error: '没有可用的宝石' });
  if (!gemIds.length) return res.json({ error: '请选择要镶嵌的宝石' });
  const forge = loadForge();
  const weapons = forge[user.id] || [];
  const wIdx = weapons.findIndex(w => w.id === weaponId);
  if (wIdx === -1) return res.json({ error: '武器不存在' });
  const weapon = weapons[wIdx];
  const maxSockets = weapon.max_sockets || GEMS.max_sockets || 3;
  if (!weapon.sockets) weapon.sockets = [];
  const remainingSockets = maxSockets - weapon.sockets.length;
  if (remainingSockets <= 0) return res.json({ error: `武器宝石孔已满 (${maxSockets}个)` });
  // limit to remaining sockets
  const toSocket = gemIds.slice(0, remainingSockets);
  const socketed = [];
  for (const gemId of toSocket) {
    const gemIdx = user.gems.findIndex(g => g.id === gemId);
    if (gemIdx === -1) continue;
    const gem = user.gems[gemIdx];
    user.gems.splice(gemIdx, 1);
    weapon.sockets.push(gem);
    if (!weapon.gem_stats) weapon.gem_stats = {};
    weapon.gem_stats[gem.stat] = (weapon.gem_stats[gem.stat] || 0) + gem.value;
    weapon.stats = weapon.stats || {};
    weapon.stats[gem.stat] = (weapon.stats[gem.stat] || 0) + gem.value;
    socketed.push(gem);
  }
  forge[user.id] = weapons; saveForge(forge);
  saveUser(req.userToken, user);
  const statCN = { attack:'🗡️攻击', defense:'🛡️防御', speed:'💨速度', attack_speed:'⚡攻速', dodge:'👻闪避', hp:'❤️生命' };
  res.json({ weapon: weapon.name, count: socketed.length, gems: socketed.map(g => ({ name: g.name, stat: g.stat, stat_cn: statCN[g.stat] || g.stat, value: g.value })) });
});

app.post('/api/gem/unsocket', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { weaponId, gemIndex } = req.body;
  const forge = loadForge();
  const weapons = forge[user.id] || [];
  const wIdx = weapons.findIndex(w => w.id === weaponId);
  if (wIdx === -1) return res.json({ error: '武器不存在' });
  const weapon = weapons[wIdx];
  if (!weapon.sockets || !weapon.sockets[gemIndex]) return res.json({ error: '宝石不存在' });
  const gem = weapon.sockets[gemIndex];
  weapon.sockets.splice(gemIndex, 1);
  // remove gem stat from weapon
  if (weapon.gem_stats) weapon.gem_stats[gem.stat] = (weapon.gem_stats[gem.stat] || 0) - gem.value;
  weapon.stats[gem.stat] = Math.max(0, (weapon.stats[gem.stat] || 0) - gem.value);
  if (!user.gems) user.gems = [];
  user.gems.push(gem);
  forge[user.id] = weapons; saveForge(forge);
  saveUser(req.userToken, user);
  res.json({ weapon: weapon.name, gem: gem.name, removed: true });
});

// -- 一键卸下所有宝石 --
app.post('/api/gem/unsocket-all', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { weaponId } = req.body;
  const forge = loadForge();
  const weapons = forge[user.id] || [];
  const wIdx = weapons.findIndex(w => w.id === weaponId);
  if (wIdx === -1) return res.json({ error: '武器不存在' });
  const weapon = weapons[wIdx];
  if (!weapon.sockets || !weapon.sockets.length) return res.json({ error: '该武器上没有镶嵌宝石' });
  const removedGems = weapon.sockets.slice();
  // remove all gem stats from weapon
  for (const gem of removedGems) {
    if (weapon.gem_stats) weapon.gem_stats[gem.stat] = Math.max(0, (weapon.gem_stats[gem.stat] || 0) - gem.value);
    weapon.stats[gem.stat] = Math.max(0, (weapon.stats[gem.stat] || 0) - gem.value);
  }
  weapon.sockets = [];
  if (!user.gems) user.gems = [];
  for (const gem of removedGems) user.gems.push(gem);
  forge[user.id] = weapons; saveForge(forge);
  saveUser(req.userToken, user);
  res.json({ weapon: weapon.name, count: removedGems.length, removed: true });
});

// 冒险掉落宝石
function dropGem(user) {
  const rarityWeights = { 1: 50, 2: 30, 3: 13, 4: 6, 999: 1 };
  const total = Object.values(rarityWeights).reduce((a, b) => a + b, 0);
  let r = Math.random() * total, cum = 0, rarity = 1;
  for (const [k, w] of Object.entries(rarityWeights)) { cum += w; if (r <= cum) { rarity = parseInt(k, 10); break; } }
  const [minS, maxS] = gemStatRange(rarity);
  const useRare = GEMS.rare_stat_chance && Math.random() < GEMS.rare_stat_chance;
  const statPool = useRare ? (GEMS.rare_stat_names || GEMS.stat_names) : GEMS.stat_names;
  const statName = pick(statPool || ['attack']);
  const gem = { name: genGemName(), rarity, stat: statName, value: rand(minS, maxS), id: uid() };
  if (!user.gems) user.gems = [];
  user.gems.push(gem);
  return gem;
}

// 在指定稀有度范围内生成宝石（用于签到/BOSS/商城等系统）
function dropGemInRange(user, minRarity, maxRarity) {
  const allWeights = { 1: 50, 2: 30, 3: 13, 4: 6, 999: 1, 9999: 0.3 };
  const allowed = Object.entries(allWeights)
    .filter(([k]) => parseInt(k) >= (minRarity || 1) && parseInt(k) <= (maxRarity || 999));
  if (allowed.length === 0) return dropGem(user);
  const total = allowed.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total, cum = 0, rarity = 1;
  for (const [k, w] of allowed) { cum += w; if (r <= cum) { rarity = parseInt(k, 10); break; } }
  const [minS, maxS] = gemStatRange(rarity);
  const useRare = GEMS.rare_stat_chance && Math.random() < GEMS.rare_stat_chance;
  const statPool = useRare ? (GEMS.rare_stat_names || GEMS.stat_names) : GEMS.stat_names;
  const statName = pick(statPool || ['attack']);
  const gem = { name: genGemName(), rarity, stat: statName, value: rand(minS, maxS), id: uid() };
  if (!user.gems) user.gems = [];
  user.gems.push(gem);
  return gem;
}

// -- 技能 --
app.get('/api/skill', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  res.json({ skills: JINENG.skills || [], user_skills: user.skills || {}, skill_points: user.skill_points || 0, level: user.level });
});
app.post('/api/skill/add', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { skillId, points = 1 } = req.body;
  if (!Number.isInteger(points) || points <= 0) return res.json({ error: '无效的技能点数量' });
  if ((user.skill_points || 0) < points) return res.json({ error: '技能点不足' });
  const skill = (JINENG.skills || []).find(s => s.id === skillId);
  if (!skill) return res.json({ error: '未知技能' });
  const skillCfg = (JINENG.skills || []).find(s => s.id === skillId);
  const noMax = skillCfg?.no_max || ['hp','attack','defense','speed','attack_speed'].includes(skillId);
  const maxLv = noMax ? 999999 : (JINENG.max_skill_level || 50);
  const curLv = (user.skills || {})[skillId] || 0;
  if (curLv + points > maxLv) return res.json({ error: `技能已达最大等级 ${maxLv}` });
  if (!user.skills) user.skills = {};
  user.skills[skillId] = curLv + points;
  user.skill_points -= points;
  saveUser(req.userToken, user);
  res.json({ skill: skillId, new_level: user.skills[skillId], remaining_points: user.skill_points });
});

// -- 称号 --
app.get('/api/titles', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  res.json({ all_titles: TITLES.titles || {}, user_titles: user.titles || [], equipped: user.equipped_title });
});
app.post('/api/title/equip', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { title } = req.body;
  if (title === '' || title === 'none') { user.equipped_title = ''; saveUser(req.userToken, user); return res.json({ equipped: '' }); }
  if (!(user.titles || []).includes(title)) return res.json({ error: '你未拥有该称号' });
  user.equipped_title = title;
  saveUser(req.userToken, user);
  res.json({ equipped: title });
});
function checkTitleMilestones(user) {
  const titles = TITLES.titles || {};
  let changed = false;
  for (const [name, cfg] of Object.entries(titles)) {
    if ((user.titles || []).includes(name) || cfg.type !== 'milestone') continue;
    const cond = cfg.condition; if (!cond) continue;
    let met = false;
    switch (cond.type) {
      case 'level': met = (user.level || 1) >= cond.value; break;
      case 'fish_total': met = (user.total_fish_count || 0) >= cond.value; break;
      case 'fish_unique': met = (user.unique_fish_caught || 0) >= cond.value; break;
      case 'fish_giant': met = (user.giant_fish_caught || 0) >= cond.value; break;
      case 'monster_kills_total': met = (user.total_monster_kills || 0) >= cond.value; break;
      case 'boss_kills': met = (user.boss_kills || 0) >= cond.value; break;
      case 'adventure_count': met = (user.adventure_count || 0) >= cond.value; break;
      case 'forge_level': met = (user.forge_level || 1) >= cond.value; break;
      case 'signin_streak': met = (user.signin_streak || 0) >= cond.value; break;
      case 'harvest_total': met = (user.total_harvest_count || 0) >= cond.value; break;
      case 'coins': met = (user.coins || 0) >= cond.value; break;
      case 'power': met = (getPlayerStats(user).power || 0) >= cond.value; break;
      case 'weapons_count': {
        const forge = loadForge();
        met = ((forge[user.id] || []).length) >= cond.value;
        break;
      }
      case 'all_skills_5': {
        const skills = user.skills || {};
        met = (JINENG.skills || []).every(s => (skills[s.id] || 0) >= 5);
        break;
      }
    }
    if (met) { user.titles.push(name); changed = true; }
  }
  if (changed) { const ft = findUserToken(user.username); if (ft) saveUser(ft.token, user); }
}

// -- 食物 & 烹饪 --
app.get('/api/food', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  let recipes = [...(FOOD.recipes || [])];
  // 厨师副职业专属食谱
  const chefLv = (user.sub_professions || {}).chef || 0;
  if (chefLv > 0) {
    const prof = (PROFESSIONS.professions || []).find(p => p.id === 'chef');
    if (prof && prof.recipes) {
      recipes = recipes.concat(prof.recipes.filter(r => (r.min_level || 1) <= chefLv).map(r => ({ ...r, from_profession: 'chef' })));
    }
  }
  const invFoods = {};
  for (const r of recipes) { const c = countInv(user, r.name); if (c > 0) invFoods[r.name] = c; }
  // 厨师副职业专属美食也查
  if (chefLv > 0) {
    const prof = (PROFESSIONS.professions || []).find(p => p.id === 'chef');
    if (prof && prof.exclusive_items) {
      for (const item of prof.exclusive_items) {
        if (item.category === 'food') { const c = countInv(user, item.name); if (c > 0) invFoods[item.name] = c; }
      }
    }
  }
  // 清理过期食物Buff
  const nowSec = Math.floor(now() / 1000);
  user.food_buffs = (user.food_buffs || []).filter(b => (b.ate_at || 0) + (b.duration || 0) > nowSec);
  saveUser(req.userToken, user);
  res.json({ recipes, food_buffs: user.food_buffs, inv_foods: invFoods, max_buffs: FOOD.max_active_buffs || 3 });
});
app.post('/api/food/cook', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { recipeName } = req.body;
  let recipe = (FOOD.recipes || []).find(r => r.name === recipeName);
  // 也查厨师副职业配方
  if (!recipe && (user.sub_professions || {}).chef > 0) {
    const prof = (PROFESSIONS.professions || []).find(p => p.id === 'chef');
    if (prof && prof.recipes) recipe = prof.recipes.find(r => r.name === recipeName);
  }
  if (!recipe) return res.json({ error: '食谱不存在' });
  for (const ing of (recipe.ingredients || [])) { if (!hasInv(user, ing.name, ing.count || 1)) return res.json({ error: `缺少食材: ${ing.name} x${ing.count}` }); }
  for (const ing of (recipe.ingredients || [])) remInv(user, ing.name, ing.count || 1);
  const outputName = (recipe.output && recipe.output.name) ? recipe.output.name : recipeName;
  const cookLv = (user.skills || {}).cooking_mastery || 0;
  let extra = Math.random() < cookLv * 0.008 ? 1 : 0;
  // 🍳 急速烹饪石：产量翻倍
  let cookMult = 1;
  if ((user.temp_double_cook || 0) > 0) { cookMult = 2; user.temp_double_cook--; }
  const cookCount = (1 + extra) * cookMult;
  addInv(user, outputName, cookCount);
  // 🏅 限定称号·职业 厨师效果：10%概率额外获得0-2个食物
  let titleBonus = 0;
  if ((user.sub_professions || {}).chef > 0 && user.equipped_title === '限定称号·职业' && Math.random() < 0.1) {
    titleBonus = Math.floor(Math.random() * 3);
    if (titleBonus > 0) addInv(user, outputName, titleBonus);
  }
  saveUser(req.userToken, user);
  res.json({ cooked: outputName, count: cookCount, extra: extra > 0 || cookMult > 1, title_bonus: titleBonus > 0 ? `额外获得${outputName}x${titleBonus}` : undefined });
});
app.post('/api/food/eat', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { foodName } = req.body;
  let recipe = (FOOD.recipes || []).find(r => r.name === foodName);
  if (!recipe && (user.sub_professions || {}).chef > 0) {
    const prof = (PROFESSIONS.professions || []).find(p => p.id === 'chef');
    if (prof && prof.recipes) recipe = prof.recipes.find(r => r.name === foodName);
  }

  // 厨师副职业专属美食（显示在食物页面上，但不在 recipes 中）
  if (!recipe) {
    const chefFoods = {
      '秘制烤鱼': { stats: { attack: 30, defense: 30, speed: 30, attack_speed: 30 }, duration: 7200 },
      '特级寿司': { stats: { crit_rate: 0.15 }, duration: 5400 },
      '满汉全席': { stats: { attack: 80, defense: 80, speed: 80, attack_speed: 80 }, duration: 14400 },
      '丰盛大餐': { stats: { attack: 200, defense: 200, speed: 200, attack_speed: 200 }, duration: 28800, fullHeal: true },
    };
    const cfg = chefFoods[foodName];
    if (cfg) {
      if (!hasInv(user, foodName)) return res.json({ error: '背包中没有该食物' });
      remInv(user, foodName, 1);
      user.food_buffs = (user.food_buffs || []);
      if (user.food_buffs.length >= 6) user.food_buffs = user.food_buffs.slice(-5);
      const nowSec = Math.floor(now() / 1000);
      for (const [stat, value] of Object.entries(cfg.stats)) {
        user.food_buffs.push({ stat, value, duration: cfg.duration, name: foodName, ate_at: nowSec });
      }
      if (cfg.fullHeal) {
        user.perm_stats = user.perm_stats || {};
        user.perm_stats.hp = (user.perm_stats.hp || 0) + 100;
      }
      saveUser(req.userToken, user);
      return res.json({ eaten: foodName, buff: cfg.stats, buffs: user.food_buffs });
    }
  }

  if (!recipe) return res.json({ error: '食物不存在' });
  if (!recipe.effect) return res.json({ error: '该物品不能直接食用' });
  if (!hasInv(user, foodName)) return res.json({ error: '背包中没有该食物' });
  remInv(user, foodName, 1);
  if (!user.food_buffs) user.food_buffs = [];
  if (user.food_buffs.length >= (FOOD.max_active_buffs || 3)) user.food_buffs.shift();
  // 🍳 厨师职业加成：食物效果 & 持续时间
  const chefBonus = getProfessionBonus(user);
  let buffValue = recipe.effect.value;
  let buffDuration = recipe.effect.duration;
  const hatFoodBonus2 = ((user.profession_stats || {}).food_bonus || 0) + ((user.sub_profession_stats || {}).food_bonus || 0);
  const totalFoodBonus = (chefBonus.food_bonus || 0) + hatFoodBonus2;
  if (totalFoodBonus > 0) buffValue = Math.floor(buffValue * (1 + totalFoodBonus));
  if (chefBonus.food_duration) buffDuration = Math.floor(buffDuration * (1 + chefBonus.food_duration));
  // 🍳 黄金调味料：食物效果翻倍
  if ((user.temp_food_double || 0) > 0) { buffValue *= 2; buffDuration = Math.floor(buffDuration * 1.5); user.temp_food_double--; }
  // 📦 保鲜盒：食物持续时间+50%
  if ((user.temp_food_duration || 0) > 0) { buffDuration = Math.floor(buffDuration * 1.5); user.temp_food_duration--; }
  // 👑 丰盛大餐特殊效果：永久生命+100
  if (foodName === '丰盛大餐') {
    user.perm_stats = user.perm_stats || {};
    user.perm_stats.hp = (user.perm_stats.hp || 0) + 100;
  }
  user.food_buffs.push({ stat: recipe.effect.stat, value: buffValue, duration: buffDuration, name: foodName, ate_at: Math.floor(now() / 1000) });
  saveUser(req.userToken, user);
  res.json({ eaten: foodName, buff: { stat: recipe.effect.stat, value: buffValue, duration: buffDuration }, buffs: user.food_buffs });
});

// -- 同伴 --
app.get('/api/loli', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  // 迁移：更新萝莉等级上限（匹配旧版 max_level_map）
  let migrated = false;
  // 迁移：married_loli 从名字改为索引
  if (typeof user.married_loli === 'string' && user.lolis) {
    const marriedIdx = user.lolis.findIndex(l => l.name === user.married_loli);
    user.married_loli = marriedIdx >= 0 ? marriedIdx : null;
    migrated = true;
  }
  const maxLvMap = LOLI.max_level_map || {1: 15, 2: 30, 3: 50, 4: 80, 999: 100};
  for (let i = 0; i < (user.lolis || []).length; i++) {
    const l = user.lolis[i];
    const baseMax = maxLvMap[String(l.rarity || 1)] || 10;
    const newMax = user.married_loli === i ? baseMax + (LOLI.married_extra_levels || 30) : baseMax;
    if ((l.max_level || 10) < newMax) {
      l.max_level = newMax; migrated = true;
    }
    // 确保已婚萝莉 rarity 为 999
    if (user.married_loli === i && l.rarity < 999) {
      l.rarity = 999; migrated = true;
    }
    if (l.favor === undefined) { l.favor = 0; migrated = true; }
  }
  if (migrated) saveUser(req.userToken, user);
  res.json({ lolis: user.lolis || [], married: user.married_loli, config: LOLI, max: 8 });
});
app.post('/api/loli/feed', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { itemName, amount = 1, loliIndex } = req.body;
  if (!itemName) return res.json({ error: '请指定道具名称' });
  const idx = parseInt(loliIndex, 10);
  if (isNaN(idx) || !user.lolis || idx < 0 || idx >= user.lolis.length) return res.json({ error: '无效的同伴编号' });
  const loli = user.lolis[idx];
  const feedItems = LOLI.feed_items || {};
  const expPer = (feedItems[itemName] || { exp: 50 }).exp || 50;
  let fed = 0;
  for (let i = 0; i < amount; i++) { if (!hasInv(user, itemName)) break; remInv(user, itemName, 1); fed++; }
  if (fed === 0) return res.json({ error: '背包中没有该道具' });
  loli.exp = (loli.exp || 0) + expPer * fed;
  const married = user.married_loli === idx;
  // 使用与召回一致的等级上限
  const maxLvMap = LOLI.max_level_map || {1: 15, 2: 30, 3: 50, 4: 80, 999: 100};
  let maxLv = maxLvMap[String(loli.rarity)] || 10;
  if (married) maxLv += (LOLI.married_extra_levels || 30);
  while (loli.level < maxLv) {
    const needed = loliExpNeeded(loli.level, married, loli.rarity);
    if (loli.exp >= needed) { loli.exp -= Math.floor(needed); loli.level++; } else break;
  }
  // 满级后溢出经验转为好感度
  if (loli.level >= maxLv && loli.exp > 0) {
    loli.favor = (loli.favor || 0) + loli.exp;
    loli.exp = 0;
  }
  saveUser(req.userToken, user);
  res.json({ fed, loli });
});
app.post('/api/loli/dispatch', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const idx = parseInt(req.body.index, 10);
  if (isNaN(idx) || !user.lolis || idx < 0 || idx >= user.lolis.length) return res.json({ error: '无效的同伴编号' });
  const loli = user.lolis[idx];
  if (loli.dispatch && loli.dispatch.dispatched_at) return res.json({ error: '该同伴已在外探索' });
  // 每日派遣限制（每只每天N次，默认2次，由中国时区today()决定凌晨0点重置）
  const todayStr = today();
  const maxDispatch = LOLI.max_dispatch_per_day || 2;
  if (loli.daily_dispatch_date !== todayStr) { loli.daily_dispatch_date = todayStr; loli.daily_dispatch_count = 0; }
  if ((loli.daily_dispatch_count || 0) >= maxDispatch) return res.json({ error: `该同伴今天已派遣${maxDispatch}次，明天再来吧！` });
  const rarity = loli.rarity || 1;
  const married = user.married_loli === idx;
  // 好感度加成（匹配旧版 _get_loli_bonus）
  const level = loli.level || 1;
  const coinBonus = 1.0 + level * 0.05 + (married ? 0.50 : 0);
  const dropBonus = 1.0 + level * 0.03 + (married ? 0.30 : 0);
  const baseCoins = LOLI.base_coins_per_hour || {1: 80, 2: 180, 3: 350, 4: 600, 999: 1200};
  loli.dispatch = { dispatched_at: Math.floor(now() / 1000) };
  loli.daily_dispatch_count = (loli.daily_dispatch_count || 0) + 1;
  saveUser(req.userToken, user);
  res.json({ dispatched: loli.name, rarity, coins_per_hour: baseCoins[String(rarity)] || 60,
    coin_bonus_pct: Math.round((coinBonus - 1) * 100), drop_bonus_pct: Math.round((dropBonus - 1) * 100),
    married_bonus: married });
});
// — 萝莉派遣经验计算（匹配旧版 _loli_exp_needed）
function loliExpNeeded(level, married, rarity) {
  if (married && rarity != null) {
    const maxLvMap = LOLI.max_level_map || {1: 15, 2: 30, 3: 50, 4: 80, 999: 100};
    const baseMax = maxLvMap[String(rarity)] || 10;
    if (level >= baseMax) return 3000;  // 已婚超额等级
  }
  return Math.min(100 + level * 45, 1000);
}

// — 材料掉落池（匹配旧版 _get_item_materials，从 items.json 读取）
function getItemMaterials() {
  const items = ITEMS.items || {};
  const ores = [], materials = [], legendaries = [];
  for (const [name, info] of Object.entries(items)) {
    const cat = info.category || '';
    const rarity = info.rarity || 1;
    if (cat === 'ore' || cat === 'material') {
      // 排除职业专属物品（保留之魂）
      const src = info.source || '';
      if (src.includes('职业') && !name.endsWith('之魂')) continue;
      if (rarity >= 5) legendaries.push(name);
      else if (rarity >= 3) materials.push(name);
      else ores.push(name);
    }
  }
  return {
    common: ores.length ? ores : ['铁矿', '铜矿', '银矿'],
    rare: materials.length ? materials : ['金矿', '宝石碎片', '野果子'],
    legendary: legendaries.length ? legendaries : ['金矿石', '大鳞片', '银矿石'],
  };
}

app.post('/api/loli/recall', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const idx = parseInt(req.body.index, 10);
  if (isNaN(idx) || !user.lolis || idx < 0 || idx >= user.lolis.length) return res.json({ error: '无效的同伴编号' });
  const loli = user.lolis[idx];
  if (!loli.dispatch || !loli.dispatch.dispatched_at) return res.json({ error: '该同伴未在探索' });

  const rarity = loli.rarity || 1;
  const married = user.married_loli === idx;
  const level = loli.level || 1;

  // 最多3天（72小时）
  const maxDuration = (LOLI.max_dispatch_hours || 72) * 3600;
  const elapsedSec = (now() - (loli.dispatch.dispatched_at * 1000)) / 1000;
  const effective = Math.min(elapsedSec, maxDuration);
  const hours = Math.max(effective / 3600, 0.1);

  // 好感度加成（匹配旧版 _get_loli_bonus）
  let coinBonus = 1.0 + level * 0.05;
  let dropBonus = 1.0 + level * 0.03;
  if (married) { coinBonus += 0.50; dropBonus += 0.30; }

  // 基础金币（匹配旧版）
  const baseCoins = LOLI.base_coins_per_hour || {1: 80, 2: 180, 3: 350, 4: 600, 999: 1200};
  const baseCoinRate = baseCoins[String(rarity)] || 60;
  let totalCoins = Math.floor(baseCoinRate * hours * randFloat(0.8, 1.2) * coinBonus);

  // 收获加成技能 + 职业加成（农夫 harvest_bonus）
  const harvestLv = (user.skills || {}).harvest_bonus || 0;
  const profBonus = getProfessionBonus(user);
  const harvestSkillBonus = harvestLv * 0.012 + (profBonus.harvest_bonus || 0);
  if (harvestSkillBonus > 0) {
    totalCoins = Math.ceil(totalCoins * (1 + harvestSkillBonus));
  }

  // 掉落计算（匹配旧版：权重池 + 收获技能额外掉落）
  let dropChecks = Math.floor(hours * dropBonus);
  if (Math.random() < (hours % 1)) dropChecks++;
  dropChecks = Math.min(dropChecks, 72);

  const pools = getItemMaterials();
  const drops = [];
  for (let i = 0; i < dropChecks; i++) {
    const r = Math.random();
    if (r < 0.10) drops.push(pools.legendary[rand(0, pools.legendary.length - 1)]);
    else if (r < 0.35) drops.push(pools.rare[rand(0, pools.rare.length - 1)]);
    else if (r < 0.75) drops.push(pools.common[rand(0, pools.common.length - 1)]);
  }

  // 收获加成：概率额外掉落
  if (harvestSkillBonus > 0) {
    const bonusDrops = [];
    for (const d of drops) {
      if (Math.random() < harvestSkillBonus) bonusDrops.push(d);
    }
    drops.push(...bonusDrops);
  }

  // 汇总掉落
  const collectedItems = [];
  for (const d of drops) {
    addInv(user, d, 1);
    const existing = collectedItems.find(c => c.name === d);
    if (existing) existing.count++; else collectedItems.push({ name: d, count: 1 });
  }

  // 好感度（匹配旧版：hours * exp_per_hour_base * (1 + rarity * 0.5)）
  const expPerHourBase = LOLI.exp_per_hour_base || 10;
  let expGain = Math.floor(hours * expPerHourBase * (1 + rarity * 0.5));
  loli.exp = (loli.exp || 0) + expGain;
  loli.favor = (loli.favor || 0) + expGain;

  // 等级上限（匹配旧版 _loli_max_level）
  const maxLvMap = LOLI.max_level_map || {1: 15, 2: 30, 3: 50, 4: 80, 999: 100};
  let maxLv = maxLvMap[String(rarity)] || 10;
  if (married) maxLv += (LOLI.married_extra_levels || 30);

  // 升级 & 溢出金币（匹配旧版）
  const oldLevel = loli.level || 1;
  let reachedCap = false;
  let overflowCoins = 0;
  while (loli.exp >= loliExpNeeded(loli.level, married, rarity) && loli.level < maxLv) {
    loli.exp -= loliExpNeeded(loli.level, married, rarity);
    loli.level++;
    if (loli.level >= maxLv) {
      reachedCap = true;
      if (loli.exp > 0) {
        overflowCoins += Math.floor(loli.exp / 100);
        loli.exp = loli.exp % 100;
      }
      break;
    }
  }
  if (loli.level >= maxLv && loli.exp > 0) {
    overflowCoins += Math.floor(loli.exp / 100);
    loli.exp = loli.exp % 100;
  }

  const levelsGained = (loli.level || 1) - oldLevel;
  loli.dispatch = null;
  user.coins = (user.coins || 0) + totalCoins + overflowCoins;
  saveUser(req.userToken, user);

  res.json({ recalled: loli.name, coins: totalCoins, overflow_coins: overflowCoins,
    hours: Math.round(hours * 10) / 10, items: collectedItems,
    level: loli.level, max_level: maxLv, exp_gain: expGain, levels_gained: levelsGained,
    coin_bonus_pct: Math.round((coinBonus - 1) * 100),
    drop_bonus_pct: Math.round((dropBonus - 1) * 100),
    married_bonus: married ? (LOLI.married_bonus || {}) : null,
    reached_cap: reachedCap, exceeded_max: elapsedSec >= maxDuration });
});
app.post('/api/loli/marry', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const idx = parseInt(req.body.index, 10);
  if (isNaN(idx) || !user.lolis || idx < 0 || idx >= user.lolis.length) return res.json({ error: '无效的同伴编号' });
  if (user.married_loli != null) return res.json({ error: '你已经结婚了！' });
  if (!hasInv(user, '婚戒')) return res.json({ error: '需要婚戒（商城购买）' });
  remInv(user, '婚戒', 1);
  const loli = user.lolis[idx];
  if (loli.dispatch && loli.dispatch.dispatched_at) return res.json({ error: '该同伴正在探索中，无法结婚' });
  // 保存结婚前的稀有度和等级上限，以便离婚后恢复
  loli._pre_marry_rarity = loli.rarity;
  loli._pre_marry_max_level = loli.max_level || 10;
  loli.rarity = 999;
  loli.max_level = (LOLI.max_level_map || {})['999'] + (LOLI.married_extra_levels || 30);
  user.married_loli = idx;
  saveUser(req.userToken, user);
  res.json({ married: loli.name });
});
app.post('/api/loli/divorce', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  if (user.married_loli == null) return res.json({ error: '你还没有结婚' });
  const idx = user.married_loli;
  // 恢复萝莉结婚前的稀有度和等级上限
  if (user.lolis && user.lolis[idx]) {
    const loli = user.lolis[idx];
    if (loli._pre_marry_rarity != null) {
      loli.rarity = loli._pre_marry_rarity;
      delete loli._pre_marry_rarity;
    } else {
      // 没有保存过结婚前数据（旧数据），降为觉醒最高级4
      loli.rarity = 4;
    }
    if (loli._pre_marry_max_level != null) {
      loli.max_level = loli._pre_marry_max_level;
      delete loli._pre_marry_max_level;
    } else {
      // 根据恢复后的稀有度重新计算等级上限
      const maxLvMap = LOLI.max_level_map || {1: 15, 2: 30, 3: 50, 4: 80, 999: 100};
      loli.max_level = maxLvMap[String(loli.rarity)] || 10;
    }
  }
  user.married_loli = null;
  // 离婚返还婚戒
  addInv(user, '婚戒', 1);
  saveUser(req.userToken, user);
  res.json({ divorced: true, returned: '婚戒' });
});
app.post('/api/loli/rename', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { newName } = req.body;
  const idx = parseInt(req.body.index, 10);
  if (!newName || newName.trim().length < 1 || newName.trim().length > 12) return res.json({ error: '名字1-12个字符' });
  if (isNaN(idx) || !user.lolis || idx < 0 || idx >= user.lolis.length) return res.json({ error: '无效的同伴编号' });
  const loli = user.lolis[idx];
  const oldName = loli.name;
  loli.name = newName.trim();
  saveUser(req.userToken, user);
  res.json({ old_name: oldName, new_name: loli.name });
});

// -- 使用物品 --
app.post('/api/use', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { itemName } = req.body;
  const count = Math.min(parseInt(req.body.count, 10) || 1, 999);
  if (!itemName) return res.json({ error: '请指定物品名称' });
  if (!hasInv(user, itemName, count)) return res.json({ error: `背包中 ${itemName} 不足（需要${count}个）` });

  if (itemName.includes('经验宝珠')) {
    remInv(user, itemName, count);
    let expPer = 50; if (itemName.includes('大')) expPer = 500; else if (itemName.includes('中')) expPer = 200;
    const gained = addExp(user, expPer * count);
    saveUser(req.userToken, user);
    return res.json({ type: 'exp', amount: expPer * count, total_gained: gained, count });
  }
  if (itemName === '旧书') { remInv(user, itemName, count); user.skill_points = (user.skill_points || 0) + count; saveUser(req.userToken, user); return res.json({ type: 'skill_point', count }); }
  if (itemName === '铁匠笔记') {
    remInv(user, itemName, count);
    let gainedExp = 0;
    for (let i = 0; i < count; i++) {
      user.forge_exp = (user.forge_exp || 0) + 100;
      gainedExp += 100;
      while (user.forge_exp >= forgeExpNeeded(user.forge_level)) { user.forge_exp -= forgeExpNeeded(user.forge_level); user.forge_level++; }
    }
    saveUser(req.userToken, user);
    return res.json({ type: 'forge_exp', forge_level: user.forge_level, count, gained_exp: gainedExp });
  }
  if (itemName === '渔夫笔记') {
    remInv(user, itemName, count);
    let gained = 0;
    for (let i = 0; i < count; i++) {
      user.fish_exp = (user.fish_exp || 0) + 100; gained += 100;
      while (user.fish_exp >= fishExpNeeded(user.fish_level)) { user.fish_exp -= fishExpNeeded(user.fish_level); user.fish_level = (user.fish_level || 1) + 1; }
    }
    saveUser(req.userToken, user);
    return res.json({ type: 'exp', item: itemName, count, msg: `📖 阅读${count}本渔夫笔记，获得 ${gained} 钓鱼经验！（钓鱼 Lv.${user.fish_level}）` });
  }
  if (itemName === '农夫笔记') {
    remInv(user, itemName, count);
    let gained = 0;
    for (let i = 0; i < count; i++) {
      user.farm_exp = (user.farm_exp || 0) + 100; gained += 100;
      while (user.farm_exp >= farmExpNeeded(user.farm_level)) { user.farm_exp -= farmExpNeeded(user.farm_level); user.farm_level = (user.farm_level || 1) + 1; }
    }
    saveUser(req.userToken, user);
    return res.json({ type: 'exp', item: itemName, count, msg: `📖 阅读${count}本农夫笔记，获得 ${gained} 农场经验！（农场 Lv.${user.farm_level}）` });
  }
  if (itemName === '厨师笔记') {
    remInv(user, itemName, count);
    let gained = 0;
    for (let i = 0; i < count; i++) {
      user.cook_exp = (user.cook_exp || 0) + 100; gained += 100;
      while (user.cook_exp >= cookExpNeeded(user.cook_level)) { user.cook_exp -= cookExpNeeded(user.cook_level); user.cook_level = (user.cook_level || 1) + 1; }
    }
    saveUser(req.userToken, user);
    return res.json({ type: 'exp', item: itemName, count, msg: `📖 阅读${count}本厨师笔记，获得 ${gained} 烹饪经验！（烹饪 Lv.${user.cook_level}）` });
  }
  if (itemName === '药师笔记') {
    remInv(user, itemName, count);
    let gained = 0;
    for (let i = 0; i < count; i++) {
      user.alchemy_exp = (user.alchemy_exp || 0) + 100; gained += 100;
      while (user.alchemy_exp >= alchemyExpNeeded(user.alchemy_level)) { user.alchemy_exp -= alchemyExpNeeded(user.alchemy_level); user.alchemy_level = (user.alchemy_level || 1) + 1; }
    }
    saveUser(req.userToken, user);
    return res.json({ type: 'exp', item: itemName, count, msg: `📖 阅读${count}本药师笔记，获得 ${gained} 炼药经验！（炼药 Lv.${user.alchemy_level}）` });
  }
  if (itemName === '矿工笔记') {
    remInv(user, itemName, count);
    let gained = 0;
    for (let i = 0; i < count; i++) {
      user.mine_exp = (user.mine_exp || 0) + 100; gained += 100;
      while (user.mine_exp >= mineExpNeeded(user.mine_level)) { user.mine_exp -= mineExpNeeded(user.mine_level); user.mine_level = (user.mine_level || 1) + 1; }
    }
    saveUser(req.userToken, user);
    return res.json({ type: 'exp', item: itemName, count, msg: `📖 阅读${count}本矿工笔记，获得 ${gained} 采矿经验！（采矿 Lv.${user.mine_level}）` });
  }
  // 💫 职业之魂：使用获得对应职业经验
  if (itemName === '铁匠之魂') {
    remInv(user, itemName, count);
    let gainedExp = 0;
    for (let i = 0; i < count; i++) {
      user.forge_exp = (user.forge_exp || 0) + 150;
      gainedExp += 150;
      while (user.forge_exp >= forgeExpNeeded(user.forge_level)) { user.forge_exp -= forgeExpNeeded(user.forge_level); user.forge_level++; }
    }
    saveUser(req.userToken, user);
    return res.json({ type: 'forge_exp', forge_level: user.forge_level, count, gained_exp: gainedExp, msg: `💫 吸收${count}个铁匠之魂，获得 ${gainedExp} 锻造经验！（锻造 Lv.${user.forge_level}）` });
  }
  if (itemName === '渔夫之魂') {
    remInv(user, itemName, count);
    let gained = 0;
    for (let i = 0; i < count; i++) {
      user.fish_exp = (user.fish_exp || 0) + 150; gained += 150;
      while (user.fish_exp >= fishExpNeeded(user.fish_level)) { user.fish_exp -= fishExpNeeded(user.fish_level); user.fish_level = (user.fish_level || 1) + 1; }
    }
    saveUser(req.userToken, user);
    return res.json({ type: 'exp', item: itemName, count, msg: `💫 吸收${count}个渔夫之魂，获得 ${gained} 钓鱼经验！（钓鱼 Lv.${user.fish_level}）` });
  }
  if (itemName === '农夫之魂') {
    remInv(user, itemName, count);
    let gained = 0;
    for (let i = 0; i < count; i++) {
      user.farm_exp = (user.farm_exp || 0) + 150; gained += 150;
      while (user.farm_exp >= farmExpNeeded(user.farm_level)) { user.farm_exp -= farmExpNeeded(user.farm_level); user.farm_level = (user.farm_level || 1) + 1; }
    }
    saveUser(req.userToken, user);
    return res.json({ type: 'exp', item: itemName, count, msg: `💫 吸收${count}个农夫之魂，获得 ${gained} 农场经验！（农场 Lv.${user.farm_level}）` });
  }
  if (itemName === '厨师之魂') {
    remInv(user, itemName, count);
    let gained = 0;
    for (let i = 0; i < count; i++) {
      user.cook_exp = (user.cook_exp || 0) + 150; gained += 150;
      while (user.cook_exp >= cookExpNeeded(user.cook_level)) { user.cook_exp -= cookExpNeeded(user.cook_level); user.cook_level = (user.cook_level || 1) + 1; }
    }
    saveUser(req.userToken, user);
    return res.json({ type: 'exp', item: itemName, count, msg: `💫 吸收${count}个厨师之魂，获得 ${gained} 烹饪经验！（烹饪 Lv.${user.cook_level}）` });
  }
  if (itemName === '药师之魂') {
    remInv(user, itemName, count);
    let gained = 0;
    for (let i = 0; i < count; i++) {
      user.alchemy_exp = (user.alchemy_exp || 0) + 150; gained += 150;
      while (user.alchemy_exp >= alchemyExpNeeded(user.alchemy_level)) { user.alchemy_exp -= alchemyExpNeeded(user.alchemy_level); user.alchemy_level = (user.alchemy_level || 1) + 1; }
    }
    saveUser(req.userToken, user);
    return res.json({ type: 'exp', item: itemName, count, msg: `💫 吸收${count}个药师之魂，获得 ${gained} 炼药经验！（炼药 Lv.${user.alchemy_level}）` });
  }
  if (itemName === '矿工之魂') {
    remInv(user, itemName, count);
    let gained = 0;
    for (let i = 0; i < count; i++) {
      user.mine_exp = (user.mine_exp || 0) + 150; gained += 150;
      while (user.mine_exp >= mineExpNeeded(user.mine_level)) { user.mine_exp -= mineExpNeeded(user.mine_level); user.mine_level = (user.mine_level || 1) + 1; }
    }
    saveUser(req.userToken, user);
    return res.json({ type: 'exp', item: itemName, count, msg: `💫 吸收${count}个矿工之魂，获得 ${gained} 采矿经验！（采矿 Lv.${user.mine_level}）` });
  }
  if (itemName === '玩家改名卡') { remInv(user, itemName, 1); saveUser(req.userToken, user); return res.json({ type: 'rename_player_card', msg: '请在弹出的对话框中输入新名字' }); }
  if (itemName === '武器改名卡') { remInv(user, itemName, 1); saveUser(req.userToken, user); return res.json({ type: 'rename_weapon_card', msg: '请选择要改名的武器' }); }
  // 兼容旧版改名卡
  if (itemName === '改名卡') { remInv(user, itemName, 1); saveUser(req.userToken, user); return res.json({ type: 'rename_player_card', msg: '请在弹出的对话框中输入新名字（旧版改名卡已自动转为玩家改名卡）' }); }
  if (itemName === '石核心') {
    remInv(user, itemName, count);
    let totalCoins = 0, totalExp = 0;
    for (let i = 0; i < count; i++) { const c = rand(500, 2000); user.coins += c; totalCoins += c; const e = rand(100, 500); addExp(user, e); totalExp += e; }
    saveUser(req.userToken, user);
    return res.json({ type: 'chaos', coins: totalCoins, exp: totalExp, count });
  }
  if (itemName === '野果子') {
    if (count > 1) return res.json({ error: '野果子每次只能使用1个' });
    if (!user.perm_stats_used) user.perm_stats_used = [];
    if (user.perm_stats_used.includes(itemName)) return res.json({ error: '野果子已经使用过了，每种永久属性物品只能使用一次' });
    user.perm_stats_used.push(itemName);
    remInv(user, itemName, 1);
    // 随机食物Buff
    const boost = pick(['attack', 'defense', 'speed', 'attack_speed']);
    const maxBuffs3 = FOOD.max_active_buffs || 3;
    while ((user.food_buffs || []).length >= maxBuffs3) user.food_buffs.shift();
    if (!user.food_buffs) user.food_buffs = [];
    user.food_buffs.push({ stat: boost, value: 20, duration: 3600, name: '野果子', ate_at: Math.floor(now() / 1000) });
    // 永久HP加成
    user.perm_stats = user.perm_stats || {};
    user.perm_stats.hp = (user.perm_stats.hp || 0) + 20;
    saveUser(req.userToken, user);
    return res.json({ type: 'mystery_fruit', stat: boost, perm_hp: 20, msg: `食用野果子！${boost}+20持续1小时，生命值永久+20！` });
  }
  // loli feed items (need target selection like awakening)
  const itemData = (ITEMS.items || {})[itemName] || {};
  if (itemData.loli_exp) {
    const lolis = user.lolis || [];
    if (lolis.length === 0) { return res.json({ error: '没有同伴可以喂养' }); }
    const targetIndex = parseInt(req.body.target_index, 10);
    if (isNaN(targetIndex) || targetIndex < 0 || targetIndex >= lolis.length) {
      return res.json({ type: 'loli_feed_select', lolis: lolis.map((l,i) => ({ index: i, name: l.name, rarity: l.rarity, level: l.level })) });
    }
    remInv(user, itemName, count);
    const loli = lolis[targetIndex];
    const expPer = itemData.loli_exp || 50;
    const maxLv = loli.max_level || 10;
    const married = user.married_loli !== null && user.married_loli !== undefined && user.lolis && user.lolis[user.married_loli] === loli;
    for (let i = 0; i < count; i++) {
      loli.exp = (loli.exp || 0) + expPer;
      while (loli.exp >= loliExpNeeded(loli.level, married, loli.rarity) && loli.level < maxLv) {
        loli.exp -= loliExpNeeded(loli.level, married, loli.rarity);
        loli.level++;
        if (loli.level >= maxLv) { loli.exp = 0; break; }
      }
      // 满级后溢出经验转为好感度
      if (loli.level >= maxLv && loli.exp > 0) {
        loli.favor = (loli.favor || 0) + Math.floor(loli.exp / 10);
        loli.exp = 0;
      }
    }
    saveUser(req.userToken, user);
    return res.json({ type: 'loli_feed', loli: loli.name, count });
  }
  // 萝莉觉醒：提升稀有度1级（最高4）
  if (itemData.loli_awaken) {
    if (count > 1) return res.json({ error: '发光石每次只能使用1个' });
    const lolis = user.lolis || [];
    if (lolis.length === 0) { return res.json({ error: '没有同伴可以觉醒' }); }
    const targetIndex = parseInt(req.body.target_index, 10);
    if (isNaN(targetIndex) || targetIndex < 0 || targetIndex >= lolis.length) {
      // 需要选择目标
      return res.json({ type: 'loli_awaken_select', lolis: lolis.map((l,i) => ({ index: i, name: l.name, rarity: l.rarity, level: l.level })) });
    }
    remInv(user, itemName, 1);
    const target = lolis[targetIndex];
    const rarityMap = { 1: 2, 2: 3, 3: 4, 4: 999 };
    const newRarity = rarityMap[target.rarity] || target.rarity;
    if (target.rarity >= 999) { addInv(user, itemName, 1); return res.json({ error: '该同伴已达最高稀有度' }); }
    target.rarity = newRarity;
    // 同步更新满级、基础加成（不修改名称，保留玩家改名）
    const newCfg = (LOLI.lolis || []).find(l => l.rarity === newRarity);
    if (newCfg) {
      target.max_level = newCfg.max_level;
      target.base_bonus = newCfg.base_bonus;
    } else {
      target.max_level = Math.floor(30 + (newRarity - 1) * 15);
    }
    saveUser(req.userToken, user);
    return res.json({ type: 'loli_awaken', loli: target.name, new_rarity: newRarity });
  }

  // -- 职业物品使用效果 --
  // 永久属性加成（每人每种限用1次）
  if (itemName === '月光水母' || itemName === '黄果子' || itemName === '深海龙鲸' || itemName === '龙鱼' || itemName === '魔法浆果' || itemName === '泉水' || itemName === '露珠') {
    if (count > 1) return res.json({ error: '该物品每人限用1次，不能批量使用' });
    if (!user.perm_stats_used) user.perm_stats_used = [];
    if (user.perm_stats_used.includes(itemName)) return res.json({ error: '该物品已经使用过了，每种永久属性物品只能使用一次' });
    user.perm_stats_used.push(itemName);
  }
  if (itemName === '月光水母') {
    remInv(user, itemName, 1);
    user.perm_stats = user.perm_stats || {};
    user.perm_stats.speed = (user.perm_stats.speed || 0) + 20;
    saveUser(req.userToken, user);
    return res.json({ type: 'perm_stat', stat: 'speed', value: 20, msg: '速度永久+20！' });
  }
  if (itemName === '泉水') {
    remInv(user, itemName, 1);
    user.perm_stats = user.perm_stats || {};
    user.perm_stats.hp = (user.perm_stats.hp || 0) + 50;
    saveUser(req.userToken, user);
    return res.json({ type: 'perm_stat', stat: 'hp', value: 50, msg: '❤️ 泉水融入体内，生命值永久+50！' });
  }
  if (itemName === '黄果子') {
    remInv(user, itemName, 1);
    user.perm_stats = user.perm_stats || {};
    user.perm_stats.attack = (user.perm_stats.attack || 0) + 5;
    saveUser(req.userToken, user);
    return res.json({ type: 'perm_stat', stat: 'attack', value: 5, msg: '攻击力永久+5！' });
  }
  if (itemName === '深海龙鲸') {
    remInv(user, itemName, 1);
    user.perm_stats = user.perm_stats || {};
    user.perm_stats.hp = (user.perm_stats.hp || 0) + 50;
    user.perm_stats.attack = (user.perm_stats.attack || 0) + 50;
    user.perm_stats.defense = (user.perm_stats.defense || 0) + 50;
    user.perm_stats.speed = (user.perm_stats.speed || 0) + 50;
    user.perm_stats.attack_speed = (user.perm_stats.attack_speed || 0) + 50;
    saveUser(req.userToken, user);
    return res.json({ type: 'perm_stat', stat: 'all', value: 50, msg: '全属性永久+50！！' });
  }
  if (itemName === '龙鱼') {
    remInv(user, itemName, 1);
    user.perm_stats = user.perm_stats || {};
    user.perm_stats.attack = (user.perm_stats.attack || 0) + 30;
    user.perm_stats.defense = (user.perm_stats.defense || 0) + 30;
    user.perm_stats.speed = (user.perm_stats.speed || 0) + 30;
    user.perm_stats.attack_speed = (user.perm_stats.attack_speed || 0) + 30;
    saveUser(req.userToken, user);
    return res.json({ type: 'perm_stat', stat: 'all', value: 30, msg: '🐉 食用龙鱼！全属性永久+30！' });
  }
  if (itemName === '魔法浆果') {
    remInv(user, itemName, count);
    const gained = addExp(user, 100 * count);
    saveUser(req.userToken, user);
    return res.json({ type: 'exp', amount: 100 * count, total_gained: gained, count, msg: `食用${count}个魔法浆果，获得${100*count}经验！` });
  }

  // 食物 Buff 类（使用 food_buffs 系统）
  const chefFoods = {
    '秘制烤鱼': { stats: { attack: 30, defense: 30, speed: 30, attack_speed: 30 }, duration: 7200 },
    '特级寿司': { stats: { crit_rate: 0.15 }, duration: 5400 },
    '满汉全席': { stats: { attack: 80, defense: 80, speed: 80, attack_speed: 80 }, duration: 14400 },
    '丰盛大餐': { stats: { attack: 200, defense: 200, speed: 200, attack_speed: 200 }, duration: 28800, fullHeal: true },
  };
  if (chefFoods[itemName]) {
    remInv(user, itemName, 1);
    const cfg = chefFoods[itemName];
    user.food_buffs = (user.food_buffs || []);
    // 最多保留最近6个buff
    if (user.food_buffs.length >= 6) user.food_buffs = user.food_buffs.slice(-5);
    const nowSec = Math.floor(now() / 1000);
    for (const [stat, value] of Object.entries(cfg.stats)) {
      user.food_buffs.push({ stat, value, duration: cfg.duration, name: itemName, ate_at: nowSec });
    }
    if (cfg.fullHeal) {
      // 丰盛大餐：额外生命永久加成
      user.perm_stats = user.perm_stats || {};
      user.perm_stats.hp = (user.perm_stats.hp || 0) + 100;
    }
    saveUser(req.userToken, user);
    return res.json({ type: 'food_buff', item: itemName, buffs: cfg.stats, duration: cfg.duration });
  }

  // ==================== 职业专属消耗品 ====================

  // 🌾 农夫：肥料类
  if (itemName === '高效肥料' || itemName === '快速生长素' || itemName === '超级肥料') {
    remInv(user, itemName, 1);
    const speedMap = { '高效肥料': 0.3, '快速生长素': 0.2, '超级肥料': 0.6 };
    user.temp_fertilizer = { type: itemName, speed: speedMap[itemName] || 0.3 };
    saveUser(req.userToken, user);
    return res.json({ type: 'farm', item: itemName, msg: `已使用${itemName}！下次种植生长时间缩短 ${Math.floor(speedMap[itemName]*100)}%` });
  }
  if (itemName === '丰收护符') {
    remInv(user, itemName, count);
    user.temp_harvest_boost = (user.temp_harvest_boost || 0) + count;
    saveUser(req.userToken, user);
    return res.json({ type: 'farm', item: itemName, count, msg: `丰收护符×${count}已激活！剩余 ${user.temp_harvest_boost} 次翻倍机会` });
  }
  if (itemName === '双倍收获卷轴') {
    remInv(user, itemName, count);
    user.temp_double_harvest = (user.temp_double_harvest || 0) + count;
    saveUser(req.userToken, user);
    return res.json({ type: 'farm', item: itemName, count, msg: `双倍收获卷轴×${count}已激活！剩余 ${user.temp_double_harvest} 次翻倍机会` });
  }
  if (itemName === '生命之种') {
    remInv(user, itemName, count);
    user.temp_instant_grow = (user.temp_instant_grow || 0) + count;
    saveUser(req.userToken, user);
    return res.json({ type: 'farm', item: itemName, count, msg: `生命之种×${count}已激活！剩余 ${user.temp_instant_grow} 次立即成熟机会` });
  }
  if (itemName === '大地祝福') {
    remInv(user, itemName, 1);
    // 立即让所有已种植作物成熟
    const farms = user.farms || {};
    let ripened = 0;
    for (const key of ['plants', 'animals', 'material_plants', 'fruit_trees']) {
      if (farms[key]) {
        for (const slot of farms[key]) {
          if (slot && slot.planted_at) {
            slot.planted_at = 1; // 设为极早的时间，立即可收割
            ripened++;
          }
        }
      }
    }
    user.farms = farms;
    saveUser(req.userToken, user);
    return res.json({ type: 'farm', item: itemName, msg: `大地祝福已生效！${ripened}个作物立即成熟` });
  }

  // 🎣 渔夫：钓鱼工具
  if (itemName === '渔网') {
    remInv(user, itemName, 1);
    const netCount = rand(2, 4);
    const DIAOYU_CFG = loadConfig('fishing/diaoyu.json');
    const netFish = [];
    for (let n = 0; n < netCount; n++) {
      const f = pick(DIAOYU_CFG.fish || [{ name: '鲫鱼', rarity: 1, exp: 5, value: [3, 10] }]);
      addInv(user, f.name); netFish.push(f.name);
      addExp(user, f.exp || 5);
      user.total_fish_count = (user.total_fish_count || 0) + 1;
    }
    saveUser(req.userToken, user);
    return res.json({ type: 'fishing', item: itemName, fish: netFish, msg: `渔网捕获了 ${netCount} 条鱼：${netFish.join('、')}` });
  }
  if (itemName === '鱼群探测器') {
    remInv(user, itemName, count);
    user.temp_rare_fish = (user.temp_rare_fish || 0) + count;
    saveUser(req.userToken, user);
    return res.json({ type: 'fishing', item: itemName, count, msg: `鱼群探测器×${count}已激活！剩余 ${user.temp_rare_fish} 次稀有鱼机会` });
  }
  if (itemName === '捕鱼笼') {
    remInv(user, itemName, count);
    // 每个捕鱼笼随机得1-3条鱼
    const DIAOYU_CFG2 = loadConfig('fishing/diaoyu.json');
    let allFish = [];
    let totalCatch = 0;
    for (let c = 0; c < count; c++) {
      const cageCatch = rand(1, 3);
      totalCatch += cageCatch;
      for (let n = 0; n < cageCatch; n++) {
        const f = pick(DIAOYU_CFG2.fish || [{ name: '鲫鱼', rarity: 1, exp: 5, value: [3, 10] }]);
        addInv(user, f.name); allFish.push(f.name);
        addExp(user, f.exp || 5);
      }
    }
    saveUser(req.userToken, user);
    return res.json({ type: 'fishing', item: itemName, count, fish: allFish, msg: `${count}个捕鱼笼共收获 ${totalCatch} 条鱼：${allFish.join('、')}` });
  }

  // ⛏ 矿工：探险工具
  if (itemName === '矿工镐') {
    remInv(user, itemName, count);
    user.temp_miner_pick = (user.temp_miner_pick || 0) + 10 * count;
    saveUser(req.userToken, user);
    return res.json({ type: 'adventure', item: itemName, count, msg: `矿工镐×${count}已装备！接下来${10*count}次冒险额外获得矿石` });
  }
  if (itemName === '矿石探测器') {
    remInv(user, itemName, count);
    user.temp_ore_double = (user.temp_ore_double || 0) + 10 * count;
    saveUser(req.userToken, user);
    return res.json({ type: 'adventure', item: itemName, count, msg: `矿石探测器×${count}已启动！接下来${10*count}次冒险矿石掉落翻倍` });
  }
  if (itemName === '罗盘') {
    remInv(user, itemName, count);
    user.temp_ore_vein = (user.temp_ore_vein || 0) + 10 * count;
    saveUser(req.userToken, user);
    return res.json({ type: 'adventure', item: itemName, count, msg: `罗盘×${count}已激活！接下来${10*count}次冒险必遇矿脉` });
  }
  if (itemName === '炸药') {
    remInv(user, itemName, 1);
    user.temp_ore_vein = (user.temp_ore_vein || 0) + 10;
    user.temp_ore_double = (user.temp_ore_double || 0) + 10;
    saveUser(req.userToken, user);
    return res.json({ type: 'adventure', item: itemName, msg: '炸药已部署！接下来10次冒险必遇矿脉且掉落翻倍' });
  }

  // 🍳 厨师：烹饪辅助
  if (itemName === '急速烹饪石') {
    remInv(user, itemName, 1);
    user.temp_double_cook = (user.temp_double_cook || 0) + 1;
    saveUser(req.userToken, user);
    return res.json({ type: 'cooking', item: itemName, msg: '下次烹饪产量翻倍！' });
  }
  if (itemName === '秘制调味料') {
    return res.json({ error: '秘制调味料是烹饪黄金调味料的材料，不能直接使用' });
  }
  if (itemName === '黄金调味料') {
    remInv(user, itemName, 1);
    user.temp_food_double = (user.temp_food_double || 0) + 1;
    saveUser(req.userToken, user);
    return res.json({ type: 'cooking', item: itemName, msg: '下次食用食物效果翻倍！' });
  }
  if (itemName === '厨师勋章') {
    remInv(user, itemName, 1);
    user.perm_stats = user.perm_stats || {};
    user.perm_stats.attack = (user.perm_stats.attack || 0) + 15;
    user.perm_stats.defense = (user.perm_stats.defense || 0) + 15;
    user.perm_stats.speed = (user.perm_stats.speed || 0) + 15;
    user.perm_stats.attack_speed = (user.perm_stats.attack_speed || 0) + 15;
    saveUser(req.userToken, user);
    return res.json({ type: 'perm_stat', item: itemName, msg: '厨师勋章已使用！全属性+15（永久）' });
  }

  // ⚒ 职业专属装备（永久属性加成，切换职业时自动清除）
  if (itemName === '铁匠锤') {
    remInv(user, itemName, 1);
    user.profession_stats = user.profession_stats || {};
    user.profession_stats.attack = (user.profession_stats.attack || 0) + 12;
    user.profession_stats.defense = (user.profession_stats.defense || 0) + 6;
    user.profession_stats.forge_extra_material = 1;
    saveUser(req.userToken, user);
    return res.json({ type: 'perm_stat', item: itemName, msg: '🔨 铁匠锤已装备！攻击+12 防御+6，锻造时额外+1材料效果（切换职业失效）' });
  }
  if (itemName === '渔夫斗笠') {
    remInv(user, itemName, 1);
    user.profession_stats = user.profession_stats || {};
    user.profession_stats.speed = (user.profession_stats.speed || 0) + 12;
    user.profession_stats.hp = (user.profession_stats.hp || 0) + 25;
    user.profession_stats.fishing_exp_bonus = 0.20;
    saveUser(req.userToken, user);
    return res.json({ type: 'perm_stat', item: itemName, msg: '🎣 渔夫斗笠已装备！速度+12 生命+25，钓鱼经验+20%（切换职业失效）' });
  }
  if (itemName === '农夫草帽') {
    remInv(user, itemName, 1);
    user.profession_stats = user.profession_stats || {};
    user.profession_stats.hp = (user.profession_stats.hp || 0) + 35;
    user.profession_stats.defense = (user.profession_stats.defense || 0) + 8;
    user.profession_stats.harvest_exp_bonus = 0.20;
    saveUser(req.userToken, user);
    return res.json({ type: 'perm_stat', item: itemName, msg: '🌾 农夫草帽已装备！生命+35 防御+8，收获经验+20%（切换职业失效）' });
  }
  if (itemName === '厨师帽') {
    remInv(user, itemName, 1);
    user.sub_profession_stats = user.sub_profession_stats || {};
    user.sub_profession_stats.hp = (user.sub_profession_stats.hp || 0) + 25;
    user.sub_profession_stats.attack = (user.sub_profession_stats.attack || 0) + 8;
    user.sub_profession_stats.food_bonus = 0.20;
    saveUser(req.userToken, user);
    return res.json({ type: 'perm_stat', item: itemName, msg: '🍳 厨师帽已装备！生命+25 攻击+8，烹饪效果+20%（副职业永久）' });
  }
  if (itemName === '药师袍') {
    remInv(user, itemName, 1);
    user.sub_profession_stats = user.sub_profession_stats || {};
    user.sub_profession_stats.hp = (user.sub_profession_stats.hp || 0) + 30;
    user.sub_profession_stats.defense = (user.sub_profession_stats.defense || 0) + 12;
    user.sub_profession_stats.potion_bonus = 0.20;
    saveUser(req.userToken, user);
    return res.json({ type: 'perm_stat', item: itemName, msg: '🧪 药师袍已装备！生命+30 防御+12，药水效果+20%（副职业永久）' });
  }
  if (itemName === '矿工头盔') {
    remInv(user, itemName, 1);
    user.profession_stats = user.profession_stats || {};
    user.profession_stats.defense = (user.profession_stats.defense || 0) + 18;
    user.profession_stats.hp = (user.profession_stats.hp || 0) + 15;
    user.profession_stats.ore_drop_bonus = 0.15;
    saveUser(req.userToken, user);
    return res.json({ type: 'perm_stat', item: itemName, msg: '⛏️ 矿工头盔已装备！防御+18 生命+15，冒险矿石掉落+15%（切换职业失效）' });
  }

  // 🔨 铁匠：锻造辅助
  if (itemName === '武器附魔卷轴') {
    remInv(user, itemName, 1);
    user.temp_guaranteed_special = (user.temp_guaranteed_special || 0) + 1;
    saveUser(req.userToken, user);
    return res.json({ type: 'forge', item: itemName, msg: '下次锻造必出1个特殊属性！' });
  }
  if (itemName === '铁匠印章') {
    remInv(user, itemName, 1);
    user.temp_forge_master = (user.temp_forge_master || 0) + 1;
    saveUser(req.userToken, user);
    return res.json({ type: 'forge', item: itemName, msg: '下次锻造全属性+40%！' });
  }
  if (itemName === '保护符') {
    remInv(user, itemName, 1);
    user.temp_strengthen_protect = (user.temp_strengthen_protect || 0) + 1;
    saveUser(req.userToken, user);
    return res.json({ type: 'forge', item: itemName, msg: '保护符已激活！下次强化失败不降级' });
  }
  if (itemName === '锻造催化剂') {
    remInv(user, itemName, 1);
    user.temp_forge_catalyst = true;
    saveUser(req.userToken, user);
    return res.json({ type: 'forge', item: itemName, msg: '锻造催化剂已激活！下次锻造失败率-15%' });
  }
  if (itemName === '精钢鱼钩') {
    remInv(user, itemName, 1);
    user.temp_rare_fish_boost = (user.temp_rare_fish_boost || 0) + 20;
    saveUser(req.userToken, user);
    return res.json({ type: 'fishing', item: itemName, msg: '精钢鱼钩已装备！接下来20次钓鱼稀有率+10%' });
  }
  if (itemName === '鲜鱼食材包') {
    remInv(user, itemName, 1);
    user.temp_food_double = (user.temp_food_double || 0) + 1;
    saveUser(req.userToken, user);
    return res.json({ type: 'food', item: itemName, msg: '鲜鱼食材包已使用！下次烹饪效果翻倍' });
  }

  // 战斗状态类消耗品
  if (itemName === '解毒药') {
    remInv(user, itemName, 1);
    // 🧪 药师职业加成：药水效果提升
    const alcBonus2 = getProfessionBonus(user);
    const hatPotionBonus = ((user.profession_stats || {}).potion_bonus || 0) + ((user.sub_profession_stats || {}).potion_bonus || 0);
    const poisonCount = Math.floor(5 * (1 + (alcBonus2.potion_bonus || 0) + hatPotionBonus));
    user.poison_immune = (user.poison_immune || 0) + poisonCount;
    saveUser(req.userToken, user);
    return res.json({ type: 'battle_buff', item: itemName, msg: `接下来${poisonCount}次战斗免疫毒系特殊技能！`, remaining: user.poison_immune });
  }
  if (itemName === '提神药水') {
    remInv(user, itemName, 1);
    const alcBonus3 = getProfessionBonus(user);
    const hatPotionBonus2 = ((user.profession_stats || {}).potion_bonus || 0) + ((user.sub_profession_stats || {}).potion_bonus || 0);
    const swiftCount = Math.floor(5 * (1 + (alcBonus3.potion_bonus || 0) + hatPotionBonus2));
    user.swift_potion = (user.swift_potion || 0) + swiftCount;
    saveUser(req.userToken, user);
    return res.json({ type: 'battle_buff', item: itemName, msg: `接下来${swiftCount}次战斗速度+80%！`, remaining: user.swift_potion });
  }
  if (itemName === '活力便当') {
    remInv(user, itemName, 1);
    user.temp_vitality_bento = (user.temp_vitality_bento || 0) + 5;
    saveUser(req.userToken, user);
    return res.json({ type: 'battle_buff', item: itemName, msg: '活力便当已使用！接下来5次战斗全属性+25%' });
  }
  if (itemName === '护体矿石') {
    remInv(user, itemName, 1);
    user.temp_guard_ore = (user.temp_guard_ore || 0) + 5;
    saveUser(req.userToken, user);
    return res.json({ type: 'battle_buff', item: itemName, msg: '护体矿石已激活！接下来5次战斗减伤+10%' });
  }

  // 🧪 治疗药水：立即回复40%HP
  if (itemName === '治疗药水') {
    const curStats0 = getPlayerStats(user);
    if ((user.current_hp ?? curStats0.hp) >= curStats0.hp) {
      return res.json({ error: '体力已满，无需使用血药' });
    }
    remInv(user, itemName, 1);
    const hatBonus = ((user.profession_stats || {}).potion_bonus || 0) + ((user.sub_profession_stats || {}).potion_bonus || 0);
    const healPct = 0.4 * (1 + hatBonus);
    const maxHp = curStats0.hp;
    user.current_hp = Math.min(maxHp, (user.current_hp != null ? user.current_hp : maxHp) + Math.floor(maxHp * healPct));
    saveUser(req.userToken, user);
    return res.json({ type: 'heal', item: itemName, msg: `❤️ 使用治疗药水，恢复 ${Math.floor(healPct*100)}% HP！（当前 ${user.current_hp}/${maxHp}）` });
  }
  if (itemName === '补药') {
    remInv(user, itemName, 1);
    const hatBonus2 = ((user.profession_stats || {}).potion_bonus || 0) + ((user.sub_profession_stats || {}).potion_bonus || 0);
    const allCount = Math.floor(5 * (1 + hatBonus2));
    user.all_potion = (user.all_potion || 0) + allCount;
    saveUser(req.userToken, user);
    return res.json({ type: 'battle_buff', item: itemName, msg: `补药已使用！接下来${allCount}次战斗全属性+40%` });
  }
  if (itemName === '防护药水') {
    remInv(user, itemName, 1);
    const hatBonus3 = ((user.profession_stats || {}).potion_bonus || 0) + ((user.sub_profession_stats || {}).potion_bonus || 0);
    const shieldCount = Math.floor(5 * (1 + hatBonus3));
    user.shield_potion = (user.shield_potion || 0) + shieldCount;
    saveUser(req.userToken, user);
    return res.json({ type: 'battle_buff', item: itemName, msg: `防护药水已使用！接下来${shieldCount}次战斗防御翻倍` });
  }
  if (itemName === '猛药') {
    remInv(user, itemName, 1);
    const hatBonus4 = ((user.profession_stats || {}).potion_bonus || 0) + ((user.sub_profession_stats || {}).potion_bonus || 0);
    const critCount = Math.floor(5 * (1 + hatBonus4));
    user.crit_potion = (user.crit_potion || 0) + critCount;
    saveUser(req.userToken, user);
    return res.json({ type: 'battle_buff', item: itemName, msg: `猛药已使用！接下来${critCount}次战斗暴击率+30%` });
  }
  // 锻造辅助类
  if (itemName === '淬火油') {
    remInv(user, itemName, count);
    user.temp_forge_boost = (user.temp_forge_boost || 0) + count;
    saveUser(req.userToken, user);
    return res.json({ type: 'forge_boost', item: itemName, count, msg: `淬火油×${count}已使用！下次强化成功率+15%（累计${user.temp_forge_boost}次）` });
  }
  if (itemName === '强化催化剂') {
    remInv(user, itemName, count);
    user.temp_strengthen_catalyst = (user.temp_strengthen_catalyst || 0) + count;
    saveUser(req.userToken, user);
    return res.json({ type: 'forge_boost', item: itemName, count, msg: `强化催化剂×${count}已使用！下次强化成功率+20%（累计${user.temp_strengthen_catalyst}次）` });
  }
  if (itemName === '幸运淬火油') {
    remInv(user, itemName, count);
    user.temp_guaranteed_special = (user.temp_guaranteed_special || 0) + count;
    saveUser(req.userToken, user);
    return res.json({ type: 'forge_boost', item: itemName, count, msg: `幸运淬火油×${count}已使用！下次强化必定获得特殊属性（累计${user.temp_guaranteed_special}次）` });
  }
  if (itemName === '觉醒锤') {
    remInv(user, itemName, count);
    user.temp_guaranteed_breakthrough = (user.temp_guaranteed_breakthrough || 0) + count;
    saveUser(req.userToken, user);
    return res.json({ type: 'forge_boost', item: itemName, count, msg: `觉醒锤×${count}已使用！下次强化必定品质突破（累计${user.temp_guaranteed_breakthrough}次）` });
  }
  if (itemName === '神匠之魂') {
    if (!user.perm_stats_used) user.perm_stats_used = [];
    if (user.perm_stats_used.includes('god_smith_soul')) return res.json({ error: '已经使用过神匠之魂了' });
    remInv(user, itemName, 1);
    user.perm_stats_used.push('god_smith_soul');
    user.perm_stats = user.perm_stats || {};
    user.perm_stats.strengthen_bonus = (user.perm_stats.strengthen_bonus || 0) + 0.05;
    saveUser(req.userToken, user);
    return res.json({ type: 'perm_stat', item: itemName, msg: '🔨 神匠之魂融入体内！强化成功率永久+5%！' });
  }
  if (itemName === '铁匠围裙') {
    remInv(user, itemName, 1);
    user.profession_stats = user.profession_stats || {};
    user.profession_stats.forge_exp_bonus = (user.profession_stats.forge_exp_bonus || 0) + 0.15;
    saveUser(req.userToken, user);
    return res.json({ type: 'equip_prof', item: itemName, msg: '👕 穿上铁匠围裙！锻造经验+15%！' });
  }

  // 红泪石
  if (itemName === '红泪石') {
    remInv(user, itemName, 1);
    user.phoenix_tear = true;
    saveUser(req.userToken, user);
    return res.json({ type: 'revive', item: itemName, msg: '红泪石已激活，死亡时将自动复活并恢复满血！' });
  }

  // -- 合成消耗品 --
  if (itemName === '经验药水') {
    remInv(user, itemName, count);
    const gained = addExp(user, 300 * count);
    saveUser(req.userToken, user);
    return res.json({ type: 'exp', amount: 300 * count, total_gained: gained, count });
  }
  if (itemName === '大经验药水') {
    remInv(user, itemName, count);
    const gained = addExp(user, 800 * count);
    saveUser(req.userToken, user);
    return res.json({ type: 'exp', amount: 800 * count, total_gained: gained, count });
  }
  if (itemName === '大经验药水（强化）') {
    remInv(user, itemName, count);
    const gained = addExp(user, 1500 * count);
    saveUser(req.userToken, user);
    return res.json({ type: 'exp', amount: 1500 * count, total_gained: gained, count });
  }
  if (itemName === '经验珠(大)') {
    remInv(user, itemName, count);
    const gained = addExp(user, 500 * count);
    saveUser(req.userToken, user);
    return res.json({ type: 'exp', amount: 500 * count, total_gained: gained, count });
  }
  if (itemName === '提神水') {
    remInv(user, itemName, count);
    const gained = addExp(user, 3000 * count);
    saveUser(req.userToken, user);
    return res.json({ type: 'exp', amount: 3000 * count, total_gained: gained, count });
  }
  if (itemName === '经验圣水') {
    remInv(user, itemName, count);
    const gained = addExp(user, 3000 * count);
    saveUser(req.userToken, user);
    return res.json({ type: 'exp', amount: 3000 * count, total_gained: gained, count });
  }
  if (itemName === '技能点药水') {
    remInv(user, itemName, count);
    user.skill_points = (user.skill_points || 0) + 2 * count;
    saveUser(req.userToken, user);
    return res.json({ type: 'skill_point', amount: 2 * count, count, msg: `喝下${count}瓶技能点药水，获得${2*count}技能点！` });
  }
  if (itemName === '强化保护符') {
    remInv(user, itemName, count);
    user.temp_strengthen_protect = (user.temp_strengthen_protect || 0) + count;
    saveUser(req.userToken, user);
    return res.json({ type: 'strengthen_item', item: itemName, count, msg: `强化保护符已激活！累计 ${user.temp_strengthen_protect} 次保护` });
  }
  if (itemName === '幸运符' || itemName === '强化幸运符') {
    remInv(user, itemName, count);
    user.temp_forge_boost = (user.temp_forge_boost || 0)
    // 幸运符效果：下次锻造/强化失败率降低，通过 temp_forge_boost 生效
    if (!user._lucky_uses) user._lucky_uses = 0;
    user._lucky_uses += count;
    saveUser(req.userToken, user);
    return res.json({ type: 'strengthen_item', item: itemName, count, msg: `幸运符已激活！累计 ${user._lucky_uses} 次幸运使用` });
  }
  if (itemName === '磨刀石') {
    // 磨刀石改为降低锻造失败率（用于自由锻造）
    remInv(user, itemName, count);
    user.temp_forge_catalyst = (user.temp_forge_catalyst || 0) + count;
    saveUser(req.userToken, user);
    return res.json({ type: 'forge_boost', item: itemName, count, msg: `磨刀石已激活！累计 ${user.temp_forge_catalyst} 次锻造催化剂使用` });
  }
  if (itemName === '背包扩容符') {
    remInv(user, itemName, 1);
    const maxLimit = 12;
    let expanded = [];
    if ((user.max_plots || 3) < maxLimit) { user.max_plots = (user.max_plots || 3) + 1; expanded.push('普通土地'); }
    if ((user.max_pens || 2) < maxLimit) { user.max_pens = (user.max_pens || 2) + 1; expanded.push('养殖栏'); }
    if ((user.max_material_plots || 2) < maxLimit) { user.max_material_plots = (user.max_material_plots || 2) + 1; expanded.push('材料土地'); }
    if ((user.max_fruit_trees || 1) < maxLimit) { user.max_fruit_trees = (user.max_fruit_trees || 1) + 1; expanded.push('果树'); }
    saveUser(req.userToken, user);
    return res.json({ type: 'expand', item: itemName, expanded, msg: '使用背包扩容符！' + expanded.join('、') + ' 各+1' });
  }
  if (itemName === '果树催熟剂') {
    remInv(user, itemName, 1);
    const farms = user.farms || { fruit_trees: [] };
    const trees = farms.fruit_trees || [];
    let ripened = false;
    for (const t of trees) {
      if (t && t.planted_at) {
        const seed = (FRUITREE.trees || []).find(s => s.name === t.seed);
        if (seed && Date.now() / 1000 - t.planted_at < (seed.growth_time || 0)) {
          t.planted_at = 1; // 立即成熟（必须 > 0，否则 checkFarm/harvestSlots 当作空格子跳过）
          ripened = true;
          break;
        }
      }
    }
    saveUser(req.userToken, user);
    if (ripened) return res.json({ type: 'farm', item: itemName, msg: '果树催熟剂使用成功！一棵果树已立即成熟。' });
    return res.json({ error: '没有正在生长中的果树' });
  }

  // ==================== 神秘商人掉落道具 ====================
  if (itemName === '旧硬币') {
    remInv(user, itemName, count);
    user.temp_coin_double = (user.temp_coin_double || 0) + count;
    saveUser(req.userToken, user);
    return res.json({ type: 'adventure', item: itemName, count, msg: `🍀 旧硬币×${count}已使用！下次冒险金币翻倍` });
  }
  if (itemName === '旧卷轴') {
    remInv(user, itemName, 1);
    user.food_buffs = (user.food_buffs || []);
    if (user.food_buffs.length >= 6) user.food_buffs = user.food_buffs.slice(-5);
    user.food_buffs.push({ stat: 'attack', value: 30, duration: 3600, name: '旧卷轴', ate_at: Math.floor(now() / 1000) });
    saveUser(req.userToken, user);
    return res.json({ type: 'food_buff', item: itemName, msg: '💪 旧卷轴！攻击+30，持续1小时' });
  }
  if (itemName === '药水') {
    remInv(user, itemName, 1);
    const effects = ['coins', 'exp', 'attack_perm', 'speed_perm', 'defense_perm', 'skill_point'];
    const effect = pick(effects);
    let msg = '';
    switch (effect) {
      case 'coins': const c = rand(100, 1000); user.coins = (user.coins || 0) + c; msg = `金币+${c}`; break;
      case 'exp': const e = addExp(user, rand(50, 500)); msg = `经验+${e}`; break;
      case 'attack_perm': user.perm_stats = user.perm_stats || {}; user.perm_stats.attack = (user.perm_stats.attack || 0) + 2; msg = '攻击永久+2'; break;
      case 'speed_perm': user.perm_stats = user.perm_stats || {}; user.perm_stats.speed = (user.perm_stats.speed || 0) + 2; msg = '速度永久+2'; break;
      case 'defense_perm': user.perm_stats = user.perm_stats || {}; user.perm_stats.defense = (user.perm_stats.defense || 0) + 2; msg = '防御永久+2'; break;
      case 'skill_point': user.skill_points = (user.skill_points || 0) + 1; msg = '技能点+1'; break;
    }
    saveUser(req.userToken, user);
    return res.json({ type: 'mystery', item: itemName, msg: `🧪 喝下药水... ${msg}！` });
  }
  if (itemName === '轻羽毛') {
    remInv(user, itemName, 1);
    user.perm_stats = user.perm_stats || {};
    user.perm_stats.speed = (user.perm_stats.speed || 0) + 3;
    saveUser(req.userToken, user);
    return res.json({ type: 'perm_stat', item: itemName, stat: 'speed', value: 3, msg: '🪶 轻羽毛！速度永久+3' });
  }
  if (itemName === '旧斗篷') {
    remInv(user, itemName, 1);
    user.perm_stats = user.perm_stats || {};
    user.perm_stats.dodge = (user.perm_stats.dodge || 0) + 0.03;
    saveUser(req.userToken, user);
    return res.json({ type: 'perm_stat', item: itemName, stat: 'dodge', value: 0.03, msg: '🌑 旧斗篷！闪避永久+3%' });
  }
  if (itemName === '星光项链') {
    remInv(user, itemName, 1);
    user.perm_stats = user.perm_stats || {};
    user.perm_stats.exp_bonus = (user.perm_stats.exp_bonus || 0) + 0.1;
    saveUser(req.userToken, user);
    return res.json({ type: 'perm_stat', item: itemName, msg: '✨ 星光项链！经验获取永久+10%' });
  }
  if (itemName === '红羽毛') {
    remInv(user, itemName, count);
    user.phoenix_tear = (user.phoenix_tear || 0) + count;
    saveUser(req.userToken, user);
    return res.json({ type: 'revive', item: itemName, count, msg: `🪶 红羽毛×${count}已装备！累计 ${user.phoenix_tear} 次复活机会` });
  }
  if (itemName === '大鳞片碎片') {
    remInv(user, itemName, 1);
    user.perm_stats = user.perm_stats || {};
    user.perm_stats.defense = (user.perm_stats.defense || 0) + 3;
    saveUser(req.userToken, user);
    return res.json({ type: 'perm_stat', item: itemName, stat: 'defense', value: 3, msg: '🐉 大鳞片碎片！防御永久+3' });
  }

  // ==================== 生命恢复药水 ====================
  // 满血时阻止使用，避免浪费
  if (itemName === '简易的生命药水' || itemName === '生命药剂' || itemName === '大生命药剂' || itemName === '治疗药水') {
    const curStats2 = getPlayerStats(user);
    if ((user.current_hp ?? curStats2.hp) >= curStats2.hp) {
      return res.json({ error: '体力已满，无需使用血药' });
    }
  }
  // 🧪 简易的生命药水：立即回复15%HP
  if (itemName === '简易的生命药水') {
    remInv(user, itemName, count);
    const maxHp0 = getPlayerStats(user).hp;
    for (let i = 0; i < count; i++) {
      user.current_hp = Math.min(maxHp0, (user.current_hp != null ? user.current_hp : maxHp0) + Math.floor(maxHp0 * 0.15));
    }
    saveUser(req.userToken, user);
    return res.json({ type: 'heal', item: itemName, count, msg: `🧪 使用${count}瓶简易的生命药水，恢复${Math.round(15*count)}%HP！（${user.current_hp}/${maxHp0}）` });
  }
  // 💚 生命药剂：立即回复30%HP
  if (itemName === '生命药剂') {
    remInv(user, itemName, count);
    const maxHp1 = getPlayerStats(user).hp;
    for (let i = 0; i < count; i++) {
      user.current_hp = Math.min(maxHp1, (user.current_hp != null ? user.current_hp : maxHp1) + Math.floor(maxHp1 * 0.3));
    }
    saveUser(req.userToken, user);
    return res.json({ type: 'heal', item: itemName, count, msg: `💚 使用${count}瓶生命药剂，恢复${Math.round(30*count)}%HP！（${user.current_hp}/${maxHp1}）` });
  }
  // ❤️‍🔥 大生命药剂：立即回复60%HP
  if (itemName === '大生命药剂') {
    remInv(user, itemName, count);
    const maxHp2 = getPlayerStats(user).hp;
    for (let i = 0; i < count; i++) {
      user.current_hp = Math.min(maxHp2, (user.current_hp != null ? user.current_hp : maxHp2) + Math.floor(maxHp2 * 0.6));
    }
    saveUser(req.userToken, user);
    return res.json({ type: 'heal', item: itemName, count, msg: `❤️‍🔥 使用${count}瓶大生命药剂，恢复${Math.round(60*count)}%HP！（${user.current_hp}/${maxHp2}）` });
  }
  if (itemName === '露珠') {
    remInv(user, itemName, 1);
    if (!user.perm_stats_used) user.perm_stats_used = [];
    if (!user.perm_stats_used.includes(itemName)) {
      user.perm_stats_used.push(itemName);
      user.perm_stats = user.perm_stats || {};
      user.perm_stats.attack = (user.perm_stats.attack || 0) + 3;
      user.perm_stats.defense = (user.perm_stats.defense || 0) + 3;
      user.perm_stats.speed = (user.perm_stats.speed || 0) + 3;
    }
    saveUser(req.userToken, user);
    return res.json({ type: 'perm_stat', item: itemName, msg: '😇 露珠融入体内！攻击/防御/速度永久+3！' });
  }
  if (itemName === '护身符') {
    remInv(user, itemName, 1);
    const effects = ['coins', 'exp', 'skill_point', 'attack_perm', 'hp_perm'];
    const eff = pick(effects);
    let msg = '';
    switch (eff) {
      case 'coins': const cc = rand(500, 2000); user.coins = (user.coins || 0) + cc; msg = `金币+${cc}`; break;
      case 'exp': const ee = rand(200, 800); addExp(user, ee); msg = `经验+${ee}`; break;
      case 'skill_point': user.skill_points = (user.skill_points || 0) + 1; msg = '技能点+1'; break;
      case 'attack_perm': user.perm_stats = user.perm_stats || {}; user.perm_stats.attack = (user.perm_stats.attack || 0) + 5; msg = '攻击永久+5'; break;
      case 'hp_perm': user.perm_stats = user.perm_stats || {}; user.perm_stats.hp = (user.perm_stats.hp || 0) + 20; msg = '生命永久+20'; break;
    }
    saveUser(req.userToken, user);
    return res.json({ type: 'kamis_gift', item: itemName, msg: `✨ 卡密的恩赐！${msg}` });
  }

  // 🎣 保鲜盒：食物持续+50%
  if (itemName === '保鲜盒') {
    remInv(user, itemName, 1);
    user.temp_food_duration = (user.temp_food_duration || 0) + 1;
    saveUser(req.userToken, user);
    return res.json({ type: 'food_buff', item: itemName, msg: '🥡 保鲜盒已使用！下次食物持续时间+50%' });
  }

  // 🍳 大肉餐：全属性+100，持续4小时
  if (itemName === '大肉餐') {
    remInv(user, itemName, 1);
    user.food_buffs = (user.food_buffs || []);
    if (user.food_buffs.length >= 6) user.food_buffs = user.food_buffs.slice(-5);
    const nowSec = Math.floor(now() / 1000);
    user.food_buffs.push({ stat: 'attack', value: 100, duration: 14400, name: '大肉餐', ate_at: nowSec });
    user.food_buffs.push({ stat: 'defense', value: 100, duration: 14400, name: '大肉餐', ate_at: nowSec });
    user.food_buffs.push({ stat: 'speed', value: 100, duration: 14400, name: '大肉餐', ate_at: nowSec });
    user.food_buffs.push({ stat: 'attack_speed', value: 100, duration: 14400, name: '大肉餐', ate_at: nowSec });
    saveUser(req.userToken, user);
    return res.json({ type: 'food_buff', item: itemName, msg: '🐲 享用大肉餐！全属性+100，持续4小时！' });
  }

  // ⛏️ 精炼石：提升武器稀有度
  if (itemName === '精炼石') {
    const forge = loadForge();
    const userWeapons = forge[user.id] || [];
    const targetId = req.body.weapon_id;
    if (!targetId || isNaN(targetId)) {
      // 需要选择武器
      return res.json({ type: 'refine_select', weapons: userWeapons.map(w => ({ id: w.id, name: w.name, rarity: w.rarity })) });
    }
    const weapon = userWeapons.find(w => w.id === targetId);
    if (!weapon) return res.json({ error: '武器不存在' });
    // 稀有度提升映射：1→2→3→4→999→9999, 最高9999
    const rarityUp = { 1: 2, 2: 3, 3: 4, 4: 999, 999: 9999 };
    if (weapon.rarity >= 9999) return res.json({ error: '该武器已达最高稀有度，无法继续提升' });
    const newRarity = rarityUp[weapon.rarity] || weapon.rarity;
    if (newRarity === weapon.rarity) return res.json({ error: '该武器无法继续提升稀有度' });
    remInv(user, itemName, 1);
    const oldRarity = weapon.rarity;
    weapon.rarity = newRarity;
    // 属性随稀有度提升：基础属性+25%
    if (weapon.stats) {
      for (const key of Object.keys(weapon.stats)) {
        weapon.stats[key] = Math.floor(weapon.stats[key] * 1.25);
      }
    }
    forge[user.id] = userWeapons;
    saveForge(forge);
    saveUser(req.userToken, user);
    return res.json({ type: 'refine', weapon: weapon, old_rarity: oldRarity, new_rarity: newRarity, msg: `✨ 精炼石成功！「${weapon.name}」稀有度从 ${oldRarity} 提升至 ${newRarity}，属性+25%！` });
  }

  // 🍳 食物类：查找配方并使用 food_buffs 系统
  let foodRecipe = (FOOD.recipes || []).find(r => r.name === itemName);
  if (!foodRecipe && (user.sub_professions || {}).chef > 0) {
    const chefProf = (PROFESSIONS.professions || []).find(p => p.id === 'chef');
    if (chefProf && chefProf.recipes) foodRecipe = chefProf.recipes.find(r => r.name === itemName);
  }
  if (foodRecipe) {
    if (!foodRecipe.effect) return res.json({ error: '该物品不能直接使用，请尝试烹饪' });
    remInv(user, itemName, count);
    if (!user.food_buffs) user.food_buffs = [];
    const chefBonus = getProfessionBonus(user);
    let lastMsg = '';
    for (let i = 0; i < count; i++) {
      if (user.food_buffs.length >= (FOOD.max_active_buffs || 3)) user.food_buffs.shift();
      let buffValue = foodRecipe.effect.value;
      let buffDuration = foodRecipe.effect.duration;
      const hatFoodBonus3 = ((user.profession_stats || {}).food_bonus || 0) + ((user.sub_profession_stats || {}).food_bonus || 0);
      const totalFoodBonus2 = (chefBonus.food_bonus || 0) + hatFoodBonus3;
      if (totalFoodBonus2 > 0) buffValue = Math.floor(buffValue * (1 + totalFoodBonus2));
      if (chefBonus.food_duration) buffDuration = Math.floor(buffDuration * (1 + chefBonus.food_duration));
      if ((user.temp_food_double || 0) > 0) { buffValue *= 2; buffDuration = Math.floor(buffDuration * 1.5); user.temp_food_double--; }
      if ((user.temp_food_duration || 0) > 0) { buffDuration = Math.floor(buffDuration * 1.5); user.temp_food_duration--; }
      user.food_buffs.push({ stat: foodRecipe.effect.stat, value: buffValue, duration: buffDuration, name: itemName, ate_at: Math.floor(now() / 1000) });
      lastMsg = `🍽️ 食用 ${itemName}${count>1?' ×'+count:''}！${foodRecipe.effect.stat==='all'?'全属性':(foodRecipe.effect.stat==='attack'?'攻击':'防御')}+${buffValue}，持续${Math.floor(buffDuration/60)}分钟`;
    }
    saveUser(req.userToken, user);
    return res.json({ type: 'food', item: itemName, count, msg: lastMsg, buffs: user.food_buffs });
  }

  // 📜 转职证明：使用后获得转职卡
  if (itemName === '转职证明') {
    remInv(user, itemName, 1);
    addInv(user, '转职卡', 1);
    saveUser(req.userToken, user);
    return res.json({ type: 'item', item: '转职卡', msg: '📜 使用转职证明，获得转职卡×1！' });
  }

  // 🎣 鱼王之饵：下次钓鱼必得稀有以上品质
  if (itemName === '鱼王之饵') {
    remInv(user, itemName, count);
    user.temp_rare_fish = (user.temp_rare_fish || 0) + 3 * count;
    saveUser(req.userToken, user);
    return res.json({ type: 'fishing', item: itemName, count, msg: `👑 使用${count}个鱼王之饵！接下来${3*count}次钓鱼必得稀有以上品质！` });
  }

  // 🎒 冒险装备（需要装备，不能直接使用）
  var itemCfg2 = (ITEMS.items || {})[itemName];
  if (itemCfg2 && itemCfg2.category === 'adv_gear') {
    return res.json({ error: '该物品是冒险装备，请到冒险页面 → 冒险装备 中装备使用' });
  }

  // 🌾 种子/动物：引导去农场种植/养殖
  if (itemCfg2 && (itemCfg2.category === 'seed' || itemCfg2.category === 'animal')) {
    // 检查种子是否在农场配置中
    const NONGCHANG2 = loadConfig('farm/nongchang.json');
    const MATFARM2 = loadConfig('farm/material_farm.json');
    const FRUIT_TREE2 = loadConfig('farm/fruit_tree.json');
    const isSeed = (NONGCHANG2.seeds || []).find(s => s.name === itemName) ||
                   (MATFARM2.seeds || []).find(s => s.name === itemName) ||
                   (FRUIT_TREE2.trees || []).find(t => t.name === itemName);
    const isAnimal = (NONGCHANG2.animals || []).find(a => a.name === itemName);
    if (isSeed) return res.json({ error: '🌱 种子/树苗请到农场页面种植，不能直接使用' });
    if (isAnimal) return res.json({ error: '🐄 动物幼崽请到农场页面养殖，不能直接使用' });
  }

  // 💎 宝石合成符：3颗同稀有度宝石→1颗更高稀有度宝石
  if (itemName === '宝石合成符') {
    const gems = user.gems || [];
    if (gems.length < 3) return res.json({ error: '需要至少3颗宝石才能合成' });
    // 需要选择3颗同稀有度宝石
    const gemIds = req.body.gemIds || [];
    if (gemIds.length !== 3) return res.json({ type: 'gem_synthesis_select', gems: gems.map(g => ({ id: g.id, name: g.name, rarity: g.rarity, stat: g.stat, value: g.value })), msg: '请选择3颗同稀有度的宝石进行合成' });
    const selectedGems = gemIds.map(gid => gems.find(g => g.id === gid)).filter(Boolean);
    if (selectedGems.length !== 3) return res.json({ error: '请选择3颗有效的宝石' });
    const rarities = new Set(selectedGems.map(g => g.rarity));
    if (rarities.size !== 1) return res.json({ error: '请选择3颗相同稀有度的宝石' });
    const srcRarity = selectedGems[0].rarity;
    const rarityUp = { 1: 2, 2: 3, 3: 4, 4: 999, 999: 9999 };
    const newRarity = rarityUp[srcRarity] || srcRarity;
    // 移除3颗宝石
    for (const gid of gemIds) { const idx = gems.findIndex(g => g.id === gid); if (idx >= 0) gems.splice(idx, 1); }
    remInv(user, itemName, 1);
    // 生成新宝石
    const useRare2 = GEMS.rare_stat_chance && Math.random() < GEMS.rare_stat_chance;
    const statPool2 = useRare2 ? (GEMS.rare_stat_names || GEMS.stat_names) : GEMS.stat_names;
    const statName = pick(statPool2 || ['attack']);
    const [minS, maxS] = gemStatRange(newRarity);
    const newGem = { name: genGemName(), rarity: newRarity, stat: statName, value: rand(minS, maxS), id: uid() };
    gems.push(newGem);
    saveUser(req.userToken, user);
    return res.json({ type: 'gem_synthesis', gem: newGem, msg: `💎 宝石合成成功！获得 ${newGem.name}（${statName}+${newGem.value}）` });
  }
  // 🔧 开孔器：给武器增加宝石孔
  if (itemName === '开孔器') {
    const weaponId = req.body.weaponId;
    if (!weaponId) {
      const forge2 = loadForge();
      const wpns = forge2[user.id] || [];
      const canOpen = wpns.filter(w => (w.sockets ? w.sockets.length : 0) < (w.max_sockets || 3));
      return res.json({ type: 'socket_select', weapons: canOpen.map(w => ({ id: w.id, name: w.name, sockets: (w.sockets||[]).length, max: w.max_sockets||3 })), msg: '选择要开孔的武器' });
    }
    const forge2 = loadForge();
    const wpns = forge2[user.id] || [];
    const w = wpns.find(w2 => w2.id === weaponId);
    if (!w) return res.json({ error: '武器不存在' });
    if ((w.sockets||[]).length >= (w.max_sockets || 3)) return res.json({ error: '武器宝石孔已满' });
    w.max_sockets = (w.max_sockets || 3) + 1;
    remInv(user, itemName, 1);
    forge2[user.id] = wpns; saveForge(forge2);
    saveUser(req.userToken, user);
    return res.json({ type: 'socket_open', weapon: w.name, max_sockets: w.max_sockets, msg: `🔧 开孔成功！「${w.name}」宝石孔上限+1（当前${w.max_sockets}孔）` });
  }
  // ⭐ 锻造大师证明：提升锻造等级
  if (itemName === '锻造大师证明') {
    remInv(user, itemName, count);
    const expGain = forgeExpNeeded(user.forge_level || 1) * count;
    user.forge_exp = (user.forge_exp || 0) + expGain;
    let lvUps = 0;
    while (user.forge_exp >= forgeExpNeeded(user.forge_level || 1)) {
      user.forge_exp -= forgeExpNeeded(user.forge_level || 1);
      user.forge_level = (user.forge_level || 1) + 1;
      lvUps++;
    }
    saveUser(req.userToken, user);
    return res.json({ type: 'forge_level', count, level_ups: lvUps, forge_level: user.forge_level, msg: `⭐ 使用${count}张锻造大师证明！锻造等级提升${lvUps}级 → Lv.${user.forge_level}` });
  }
  // 🍎 生命果实：永久+20HP（限1次）
  if (itemName === '生命果实') {
    if (!user.perm_stats_used) user.perm_stats_used = [];
    if (user.perm_stats_used.includes('life_fruit')) return res.json({ error: '你已经使用过生命果实了，无法重复使用' });
    remInv(user, itemName, 1);
    user.perm_stats = user.perm_stats || {};
    user.perm_stats.hp = (user.perm_stats.hp || 0) + 20;
    user.perm_stats_used.push('life_fruit');
    saveUser(req.userToken, user);
    return res.json({ type: 'perm_stat', item: itemName, msg: '🍎 食用生命果实！最大生命值永久+20！' });
  }
  // 💧 生命之源：永久+50HP（限1次）
  if (itemName === '生命之源') {
    if (!user.perm_stats_used) user.perm_stats_used = [];
    if (user.perm_stats_used.includes('life_source')) return res.json({ error: '你已经使用过生命之源了，无法重复使用' });
    remInv(user, itemName, 1);
    user.perm_stats = user.perm_stats || {};
    user.perm_stats.hp = (user.perm_stats.hp || 0) + 50;
    user.perm_stats_used.push('life_source');
    saveUser(req.userToken, user);
    return res.json({ type: 'perm_stat', item: itemName, msg: '💧 生命之源融入体内！最大生命值永久+50！' });
  }
  // 🎲 经验宝珠: 使用获得经验
  if (itemName === '经验宝珠') {
    remInv(user, itemName, count);
    const expMap = { '经验宝珠(小)': 50, '经验宝珠(中)': 200, '经验宝珠(大)': 500, '经验宝珠': 50 };
    const expPer = expMap[itemName] || 50;
    const totalExp = expPer * count;
    addExp(user, totalExp);
    saveUser(req.userToken, user);
    return res.json({ type: 'exp', item: itemName, count, exp: totalExp, msg: `✨ 使用${count}个${itemName}，获得${totalExp}经验！` });
  }
  // 🧪 万能解毒药
  if (itemName === '万能解毒药') {
    remInv(user, itemName, count);
    const pc = (user.profession_buffs || {});
    user.profession_buffs = { ...pc, poison_immune: (pc.poison_immune || 0) + 5 * count };
    saveUser(req.userToken, user);
    return res.json({ type: 'battle_buff', item: itemName, count, msg: `🧪 使用${count}个万能解毒药！接下来5次战斗免疫毒系技能` });
  }
  // ⚡ 迅捷药水
  if (itemName === '迅捷药水') {
    remInv(user, itemName, count);
    const pc2 = (user.profession_buffs || {});
    user.profession_buffs = { ...pc2, swift_potion: (pc2.swift_potion || 0) + 5 * count };
    saveUser(req.userToken, user);
    return res.json({ type: 'battle_buff', item: itemName, count, msg: `⚡ 使用${count}瓶迅捷药水！接下来5次战斗速度+80%` });
  }
  // 🛡️ 护盾药剂
  if (itemName === '护盾药剂') {
    remInv(user, itemName, count);
    const pc3 = (user.profession_buffs || {});
    user.profession_buffs = { ...pc3, shield_count: (pc3.shield_count || 0) + 5 * count };
    saveUser(req.userToken, user);
    return res.json({ type: 'battle_buff', item: itemName, count, msg: `🛡️ 使用${count}瓶护盾药剂！接下来5次战斗防御翻倍` });
  }
  // 🗡️ 力量药剂
  if (itemName === '力量药剂') {
    remInv(user, itemName, count);
    const pc4 = (user.profession_buffs || {});
    user.profession_buffs = { ...pc4, attack_count: (pc4.attack_count || 0) + 5 * count };
    saveUser(req.userToken, user);
    return res.json({ type: 'battle_buff', item: itemName, count, msg: `🗡️ 使用${count}瓶力量药剂！接下来5次战斗攻击+50%` });
  }
  // ⛏️ 矿脉炸弹
  if (itemName === '矿脉炸弹') {
    remInv(user, itemName, count);
    user.temp_ore_double = (user.temp_ore_double || 0) + 10 * count;
    saveUser(req.userToken, user);
    return res.json({ type: 'adventure', item: itemName, count, msg: `💣 使用${count}个矿脉炸弹！接下来10次冒险矿石掉落翻倍` });
  }

  // 🎲 随机材料配方：随机获得稀有锻造材料
  if (itemName === '随机材料配方') {
    remInv(user, itemName, 1);
    const matPool = ['火焰精华','寒冰碎片','大地结晶','风之羽毛','附魔石','贤者之石','神之碎片','混沌之鳞','龙鳞','堕落之羽','骑士之魂','百炼钢','泰坦神铁','矿脉之心','铁砧之心'];
    const picked = matPool[Math.floor(Math.random() * matPool.length)];
    const qty = picked === '附魔石' ? rand(1,3) : 1;
    addInv(user, picked, qty);
    saveUser(req.userToken, user);
    return res.json({ type: 'synthesis', item: picked, count: qty, msg: `🎲 打开随机材料配方，获得了 ${picked} x${qty}！` });
  }

  // 📜 随机图纸包：随机获得一张未学习的套装图纸
  if (itemName === '随机图纸包') {
    remInv(user, itemName, 1);
    if (!user.learned_blueprints) user.learned_blueprints = [];
    // 收集所有可用的套装图纸
    const allBps = [];
    for (const s of (SETS_CFG.sets || [])) {
      for (const [slot, piece] of Object.entries(s.pieces || {})) {
        const bpName = piece.name + '图纸';
        if (!user.learned_blueprints.includes(bpName)) {
          allBps.push({ name: bpName, setId: s.id, slot, minLevel: s.min_level || 1 });
        }
      }
    }
    if (allBps.length === 0) {
      // 所有图纸都学会了，退还物品
      addInv(user, '随机图纸包', 1);
      saveUser(req.userToken, user);
      return res.json({ error: '你已经学会了所有套装图纸！' });
    }
    const picked = allBps[Math.floor(Math.random() * allBps.length)];
    user.learned_blueprints.push(picked.name);
    saveUser(req.userToken, user);
    return res.json({ type: 'blueprint', item: picked.name, msg: `📜 打开随机图纸包，学会了「${picked.name}」！（${picked.setId} 套装，需要 Lv.${picked.minLevel}）` });
  }

  // 🔨 神匠之锤：下次锻造属性翻倍（一次性消耗）
  if (itemName === '神匠之锤') {
    remInv(user, itemName, 1);
    user.temp_god_hammer = (user.temp_god_hammer || 0) + 1;
    saveUser(req.userToken, user);
    return res.json({ type: 'forge', item: itemName, msg: '🔨 神匠之锤已激活！下次锻造时属性翻倍！' });
  }

  // 📜 蓝图学习（套装图纸等）
  if (itemName.includes('图纸')) {
    if (!user.learned_blueprints) user.learned_blueprints = [];
    if (user.learned_blueprints.includes(itemName))
      return res.json({ error: '已经学会了该蓝图' });
    remInv(user, itemName, 1);
    user.learned_blueprints.push(itemName);
    saveUser(req.userToken, user);
    return res.json({ type: 'blueprint', item: itemName, msg: '📜 学会了「' + itemName + '」！' });
  }

  return res.json({ error: '该物品无法直接使用' });
});

// -- 物品详情 --
app.get('/api/item/:name', authMiddleware, (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const items = ITEMS.items || {};
  const item = items[name];
  if (!item) return res.json({ name, found: false });
  const user = loadUser(req.userToken);
  const count = countInv(user, name);
  // 可使用的物品：消耗品、有特殊属性的、鱼饵、种子、特殊物品
  const isUsable = item.category === 'consume' || item.category === 'food' || item.category === 'special'
    || !!item.loli_exp || !!item.loli_awaken || !!item.marry_ring
    || (YUER.baits||[]).some(b=>b.name===name)
    || name.includes('经验宝珠') || name === '旧书' || name === '铁匠笔记'
    || name === '渔夫笔记' || name === '农夫笔记' || name === '厨师笔记' || name === '药师笔记' || name === '矿工笔记'
    || name === '野果子' || name === '石核心' || name === '果树催熟剂'
    // 职业物品
    || name === '月光水母' || name === '野果子' || name === '黄果子' || name === '泉水'
    || name === '深海龙鲸' || name === '龙鱼' || name === '魔法浆果'
    || name === '秘制烤鱼' || name === '特级寿司' || name === '满汉全席' || name === '丰盛大餐'
    || name === '解毒药' || name === '提神药水'
    || name === '淬火油' || name === '老铁锤' || name === '红泪石'
    // 药师职业药水
    || name === '治疗药水' || name === '补药' || name === '防护药水'
    || name === '猛药' || name === '大经验药水（强化）' || name === '提神水' || name === '经验圣水'
    // 神秘商人物品
    || name === '简易的生命药水' || name === '生命药剂' || name === '大生命药剂' || name === '露珠'
    || name === '护身符' || name === '精炼石' || name === '保鲜盒'
    || name === '大肉餐' || name === '药水' || name === '轻羽毛'
    || name === '旧斗篷' || name === '红羽毛'
    // 转职证明 & 鱼王之饵
    || name === '转职证明' || name === '鱼王之饵'
    || item.category === 'blueprint' || name.includes('图纸');
  res.json({
    name, found: true, count,
    category: item.category,
    rarity: item.rarity,
    source: item.source || '未知',
    use: item.use || '无特殊用途',
    description: item.description || '',
    usable: isUsable,
    emoji: item.emoji || '',
    extra: { loli_exp: item.loli_exp, loli_awaken: item.loli_awaken, marry_ring: item.marry_ring },
  });
});

// -- 背包 --
app.get('/api/bag', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const counts = listInv(user);
  // 分类信息 + 出售价格
  const items = ITEMS.items || {};
  const categories = {};
  const sellPrices = {};
  for (const [name, count] of Object.entries(counts)) {
    const cat = (items[name]||{}).category || 'other';
    if (!categories[cat]) categories[cat] = {};
    categories[cat][name] = count;
    sellPrices[name] = getSellPrice(name);
  }
  res.json({ inventory: counts, total: totalInv(user), sell_blacklist: user.sell_blacklist, categories, sell_prices: sellPrices });
});
app.post('/api/bag/drop', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { itemName, amount = 1 } = req.body;
  const available = countInv(user, itemName);
  if (available <= 0) return res.json({ error: '背包中没有该物品' });
  const dropped = Math.min(amount, available);
  remInv(user, itemName, dropped);
  saveUser(req.userToken, user);
  res.json({ dropped, remaining: countInv(user, itemName) });
});

// -- 道具合成 --
app.get('/api/synthesis', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  // 全局合成 + 职业配方（主职业 + 副职业）
  const profRecipes = [];
  if (user.profession) {
    const prof = (PROFESSIONS.professions || []).find(p => p.id === user.profession);
    if (prof && prof.recipes) {
      const profLevel = user.profession_level || 1;
      profRecipes.push(...prof.recipes.filter(r => (r.min_level || 1) <= profLevel).map(r => ({ ...r, from_profession: user.profession })));
    }
  }
  // 副职业合成配方
  for (const sid of ['chef', 'alchemist']) {
    const subLv = (user.sub_professions || {})[sid] || 0;
    if (subLv > 0) {
      const sp = (PROFESSIONS.professions || []).find(p => p.id === sid);
      if (sp && sp.recipes) {
        profRecipes.push(...sp.recipes.filter(r => (r.min_level || 1) <= subLv).map(r => ({ ...r, from_profession: sid })));
      }
    }
  }
  res.json({ recipes: SYNTHESIS.recipes || [], prof_recipes: profRecipes });
});
app.post('/api/synthesis', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { recipeName } = req.body;
  // 先查全局配方，再查主职业配方，最后查副职业配方
  let recipe = (SYNTHESIS.recipes || []).find(r => r.name === recipeName);
  if (!recipe && user.profession) {
    const prof = (PROFESSIONS.professions || []).find(p => p.id === user.profession);
    if (prof && prof.recipes) recipe = prof.recipes.find(r => r.name === recipeName);
  }
  if (!recipe) {
    for (const sid of ['chef', 'alchemist']) {
      if ((user.sub_professions || {})[sid] > 0) {
        const sp = (PROFESSIONS.professions || []).find(p => p.id === sid);
        if (sp && sp.recipes) { recipe = sp.recipes.find(r => r.name === recipeName); if (recipe) break; }
      }
    }
  }
  if (!recipe) return res.json({ error: '配方不存在' });
  // 深拷贝配方，避免变异全局缓存
  recipe = JSON.parse(JSON.stringify(recipe));
  // 兼容两种原料格式：数组 [{name, count}] 和对象 {name: count}
  if (recipe.ingredients && !Array.isArray(recipe.ingredients)) {
    recipe.ingredients = Object.entries(recipe.ingredients).map(function(entry) {
      return { name: entry[0], count: typeof entry[1] === 'number' ? entry[1] : 1 };
    });
  }
  // 📜 检查是否需要蓝图：通过 unlocks_recipe 或命名匹配（{配方名}配方 / {配方名}图纸）
  const ITEMS_CFG = loadConfig('items.json');
  for (const [itemKey, itemDef] of Object.entries(ITEMS_CFG.items || {})) {
    const matchesName = itemDef.unlocks_recipe === recipeName ||
      itemKey === recipeName + '配方' || itemKey === recipeName + '图纸' ||
      itemKey === recipeName.replace(/配方$/, '') + '配方' || itemKey === recipeName.replace(/图纸$/, '') + '图纸';
    if (matchesName && !(user.learned_blueprints || []).includes(itemKey)) {
      return res.json({ error: `需要先学习「${itemKey}」才能合成此配方` });
    }
  }
  for (const ing of (recipe.ingredients || [])) { if (!hasInv(user, ing.name, ing.count || 1)) return res.json({ error: `缺少材料: ${ing.name} x${ing.count}` }); }
  for (const ing of (recipe.ingredients || [])) remInv(user, ing.name, ing.count || 1);

  // 🏅 限定称号·职业 效果：3%概率返还10%材料（铁匠/药师通用）
  let refunded = [];
  if (user.equipped_title === '限定称号·职业' && (user.profession === 'blacksmith' || (user.sub_professions || {}).alchemist > 0) && Math.random() < 0.03) {
    for (const ing of (recipe.ingredients || [])) {
      const refundCount = Math.max(1, Math.floor((ing.count || 1) * 0.1));
      addInv(user, ing.name, refundCount);
      refunded.push(`${ing.name}x${refundCount}`);
    }
  }

  const outputName = (recipe.output && recipe.output.name) ? recipe.output.name : recipeName;
  const outputCount = (recipe.output && recipe.output.count) || 1;
  addInv(user, outputName, outputCount);

  // 🏅 限定称号·职业 铁匠/药师效果：10%概率额外获得0-2个产出
  let bonusCount = 0;
  if (user.equipped_title === '限定称号·职业' && (user.profession === 'blacksmith' || (user.sub_professions || {}).alchemist > 0) && Math.random() < 0.1) {
    bonusCount = Math.floor(Math.random() * 3); // 0, 1, 2
    if (bonusCount > 0) addInv(user, outputName, bonusCount);
  }

  const questsCompleted = updateQuestProgress(user, 'synthesis_items', 1);
  saveUser(req.userToken, user);
  res.json({ synthesized: recipeName, desc: recipe.desc, quests_completed: questsCompleted, title_bonus: bonusCount > 0 ? `额外获得${outputName}x${bonusCount}` : undefined, title_refund: refunded.length > 0 ? `返还材料: ${refunded.join(', ')}` : undefined });
});

// ===================== 职业系统 v2 =====================
// 获取当前职业当前等级的加成数据（供各游戏系统使用）
function getProfessionBonus(user) {
  const result = {};
  // 主职业加成
  if (user.profession) {
    const prof = (PROFESSIONS.professions || []).find(p => p.id === user.profession);
    if (prof) {
      const level = user.profession_level || 1;
      const lvBonus = (prof.level_bonuses || []).find(l => l.level === level);
      if (lvBonus) Object.assign(result, lvBonus);
    }
  }
  // 副职业加成（厨师、药师始终生效）
  const subIds = ['chef', 'alchemist'];
  for (const sid of subIds) {
    const subLv = (user.sub_professions || {})[sid] || 0;
    if (subLv > 0) {
      const sp = (PROFESSIONS.professions || []).find(p => p.id === sid);
      if (sp) {
        const lvBonus = (sp.level_bonuses || []).find(l => l.level === subLv);
        if (lvBonus) Object.assign(result, lvBonus);
      }
    }
  }
  return result;
}

// 清除旧职业数据（切换职业时调用）
function clearProfessionData(user) {
  const oldProfId = user.profession;
  if (!oldProfId) return;
  const oldProf = (PROFESSIONS.professions || []).find(p => p.id === oldProfId);
  if (!oldProf) return;
  // 只清理主职业数据，副职业不受影响
  // 1. 清除旧职业专属装备的属性加成
  if (oldProf.type !== 'sub') user.profession_stats = {};
  // 2. 清除已领取的职业道具记录
  if (user.profession_items_received) {
    delete user.profession_items_received[oldProfId];
  }
  // 3. 移除背包中旧职业的专属道具（装备类）
  for (const item of oldProf.exclusive_items || []) {
    if (item.category === 'special') {
      const cnt = countInv(user, item.name);
      if (cnt > 0) remInv(user, item.name, cnt);
    }
  }
}

// 发放职业专属道具：选择职业或升级时自动获得已解锁的专属道具（每人每种限领1次）
// 支持主职业和副职业（传入 professionId 时为副职业）
function grantExclusiveItems(user, professionId) {
  const isSub = !!professionId;
  const profId = professionId || user.profession;
  if (!profId) return [];
  const prof = (PROFESSIONS.professions || []).find(p => p.id === profId);
  if (!prof) return [];
  const level = isSub ? ((user.sub_professions || {})[profId] || 0) : (user.profession_level || 1);
  const granted = [];
  const trackingKey = isSub ? 'sub_profession_items_received' : 'profession_items_received';
  if (!user[trackingKey]) user[trackingKey] = {};
  if (!user[trackingKey][profId]) user[trackingKey][profId] = [];
  const received = user[trackingKey][profId];
  for (const item of (prof.exclusive_items || [])) {
    if ((item.unlock_level || 1) <= level && !received.includes(item.name)) {
      addInv(user, item.name, 1);
      received.push(item.name);
      granted.push(item.name);
    }
  }
  return granted;
}

function getProfessionData(user) {
  if (!user.profession) return null;
  const prof = (PROFESSIONS.professions || []).find(p => p.id === user.profession);
  if (!prof) return null;
  const level = user.profession_level || 1;
  const levelData = (prof.level_bonuses || []).find(l => l.level === level) || (prof.level_bonuses || [])[0] || {};
  const nextLevel = (prof.level_bonuses || []).find(l => l.level === level + 1) || null;
  const maxLevel = PROFESSIONS.max_level || 10;
  // calc level-up cost
  let levelUpCost = 0;
  let levelUpMats = [];
  if (nextLevel) {
    levelUpCost = Math.floor((PROFESSIONS.level_up_base_cost || 1000) * Math.pow(PROFESSIONS.level_up_cost_multiplier || 1.8, level));
    levelUpMats = (prof.level_up_materials || []).map(m => ({
      name: m.name, count: (m.count_per_level || 2) * level, needed: (m.count_per_level || 2) * level,
      have: countInv(user, m.name)
    }));
  }
  // filter recipes by level
  const availableRecipes = (prof.recipes || []).filter(r => (r.min_level || 1) <= level);
  // exclusive items unlocked
  const unlockedItems = (prof.exclusive_items || []).filter(e => (e.unlock_level || 1) <= level);
  return {
    id: prof.id, name: prof.name, icon: prof.icon, description: prof.description,
    level, max_level: maxLevel,
    bonus_desc: levelData.bonus_desc || '',
    level_bonuses: prof.level_bonuses || [],
    recipes: availableRecipes,
    unlocked_items: unlockedItems,
    level_up_cost: levelUpCost,
    level_up_materials: levelUpMats,
    can_level_up: nextLevel !== null,
    level_up_mats_ready: levelUpMats.every(m => m.have >= m.needed)
  };
}

app.get('/api/profession/config', authMiddleware, (req, res) => {
  res.json({ professions: PROFESSIONS.professions || [] });
});
app.get('/api/profession', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  // 🚚 迁移：旧版主职业为厨师/药师 → 转为副职业
  let migrated = false;
  if (user.profession === 'chef' || user.profession === 'alchemist') {
    const oldProf = user.profession;
    if (!user.sub_professions) user.sub_professions = {};
    user.sub_professions[oldProf] = user.profession_level || 1;
    // 迁移已领取的专属道具记录
    if (user.profession_items_received && user.profession_items_received[oldProf]) {
      if (!user.sub_profession_items_received) user.sub_profession_items_received = {};
      user.sub_profession_items_received[oldProf] = user.profession_items_received[oldProf];
    }
    // 迁移职业装备加成
    if (oldProf === 'chef' && (user.profession_stats || {}).food_bonus) {
      if (!user.sub_profession_stats) user.sub_profession_stats = {};
      user.sub_profession_stats.hp = (user.sub_profession_stats.hp || 0) + (user.profession_stats.hp || 0);
      user.sub_profession_stats.attack = (user.sub_profession_stats.attack || 0) + (user.profession_stats.attack || 0);
      user.sub_profession_stats.food_bonus = user.profession_stats.food_bonus;
    }
    if (oldProf === 'alchemist' && (user.profession_stats || {}).potion_bonus) {
      if (!user.sub_profession_stats) user.sub_profession_stats = {};
      user.sub_profession_stats.hp = (user.sub_profession_stats.hp || 0) + (user.profession_stats.hp || 0);
      user.sub_profession_stats.defense = (user.sub_profession_stats.defense || 0) + (user.profession_stats.defense || 0);
      user.sub_profession_stats.potion_bonus = user.profession_stats.potion_bonus;
    }
    // 清除旧主职业数据
    user.profession = null;
    user.profession_level = 1;
    user.profession_stats = {};
    if (user.profession_items_received) delete user.profession_items_received[oldProf];
    migrated = true;
  }
  if (!user.sub_professions) user.sub_professions = {};
  // 副职业信息
  const subData = {};
  for (const sid of ['chef', 'alchemist']) {
    const sp = (PROFESSIONS.professions || []).find(p => p.id === sid);
    if (sp) {
      const subLv = user.sub_professions[sid] || 0;
      const maxLv = PROFESSIONS.max_level || 10;
      const nextLvData = (sp.level_bonuses || []).find(l => l.level === subLv + 1);
      let levelUpCost = 0, levelUpMats = [];
      if (nextLvData && subLv < maxLv) {
        levelUpCost = Math.floor((PROFESSIONS.level_up_base_cost || 1000) * Math.pow(PROFESSIONS.level_up_cost_multiplier || 1.8, subLv));
        levelUpMats = (sp.level_up_materials || []).map(m => ({
          name: m.name, count: (m.count_per_level || 2) * subLv, needed: (m.count_per_level || 2) * subLv,
          have: countInv(user, m.name)
        }));
      }
      const curLvData = (sp.level_bonuses || []).find(l => l.level === subLv) || {};
      // 已解锁的配方（按等级过滤）
      const subRecipes = (sp.recipes || []).filter(r => (r.min_level || 1) <= subLv);
      subData[sid] = {
        id: sid, name: sp.name, icon: sp.icon, type: 'sub',
        level: subLv, max_level: maxLv,
        bonus_desc: curLvData.bonus_desc || '',
        level_up_cost: levelUpCost,
        level_up_materials: levelUpMats,
        can_level_up: nextLvData !== null && subLv < maxLv,
        level_up_mats_ready: levelUpMats.length === 0 || levelUpMats.every(m => m.have >= m.needed),
        // 已解锁专属道具
        items: (sp.exclusive_items || []).filter(e => (e.unlock_level || 1) <= subLv),
        // 详细信息用于前端展示
        level_bonuses: sp.level_bonuses || [],
        recipes: subRecipes,
      };
    }
  }
  if (migrated) saveUser(req.userToken, user);
  const professions = (PROFESSIONS.professions || []).map(p => ({
    id: p.id, name: p.name, icon: p.icon, type: p.type, description: p.description,
    max_level: PROFESSIONS.max_level || 10
  }));
  const currentData = getProfessionData(user);
  res.json({
    professions,
    current: currentData,
    sub_professions: subData,
    can_switch: true,
    switch_cost: (user.profession_switches || 0) >= 3 ? 5000 : 0,
    respec_card_available: hasInv(user, '转职卡'),
    respec_card_cost: PROFESSIONS.respec_card_cost || 50000
  });
});

app.post('/api/profession/select', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { professionId } = req.body;
  const prof = (PROFESSIONS.professions || []).find(p => p.id === professionId);
  if (!prof) return res.json({ error: '职业不存在' });
  if (prof.type === 'sub') return res.json({ error: `${prof.name}为副职业，请通过副职业系统升级` });
  if (user.profession === professionId) return res.json({ error: `你已经是${prof.name}了` });
  const currentLevel = user.profession_level || 1;
  // 先检查转职卡，再清除旧数据（避免出错后职业数据丢失）
  if (user.profession && currentLevel > 1) {
    if (!hasInv(user, '转职卡')) {
      return res.json({ error: `当前职业已达Lv.${currentLevel}，切换需要消耗转职卡（可返还50%升级材料）。请在合成页面制作转职卡` });
    }
  }
  // 清除旧职业数据（属性加成、背包装备、领取记录）
  clearProfessionData(user);
  if (user.profession && currentLevel > 1) {
    // 需要转职卡：消耗卡片，返还50%升级材料，然后切换
    if (!hasInv(user, '转职卡')) {
      return res.json({ error: `当前职业已达Lv.${currentLevel}，切换需要消耗转职卡（可返还50%升级材料）。请在合成页面制作转职卡` });
    }
    remInv(user, '转职卡', 1);
    // 返还50%升级材料
    const oldProf = (PROFESSIONS.professions || []).find(p => p.id === user.profession);
    const refundMats = [];
    if (oldProf && oldProf.level_up_materials) {
      for (let lv = 2; lv <= currentLevel; lv++) {
        for (const m of oldProf.level_up_materials) {
          const count = Math.floor((m.count_per_level || 2) * (lv - 1) * 0.5);
          if (count > 0) {
            addInv(user, m.name, count);
            refundMats.push(`${m.name} x${count}`);
          }
        }
      }
    }
    user.profession_level = 1;
    user.profession = professionId;
    user.profession_switches = (user.profession_switches || 0) + 1;
    const newItems1 = grantExclusiveItems(user);
    saveUser(req.userToken, user);
    return res.json({ profession: prof.name, icon: prof.icon, level: 1, card_used: true, refunded: refundMats, items_granted: newItems1, cleared: true });
  }
  // Lv.1 免费切换
  user.profession = professionId;
  user.profession_level = 1;
  user.profession_switches = (user.profession_switches || 0) + 1;
  const newItems2 = grantExclusiveItems(user);
  saveUser(req.userToken, user);
  res.json({ profession: prof.name, icon: prof.icon, level: 1, switches: user.profession_switches, items_granted: newItems2, cleared: true });
});

app.post('/api/profession/levelup', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const currentData = getProfessionData(user);
  if (!currentData) return res.json({ error: '请先选择职业' });
  if (!currentData.can_level_up) return res.json({ error: `已达到最高等级 Lv.${currentData.max_level}` });
  if ((user.coins || 0) < currentData.level_up_cost) return res.json({ error: `金币不足，需要${currentData.level_up_cost}` });
  for (const m of currentData.level_up_materials) {
    if (!hasInv(user, m.name, m.needed)) return res.json({ error: `缺少材料: ${m.name} x${m.needed}（有${m.have}个）` });
  }
  user.coins -= currentData.level_up_cost;
  for (const m of currentData.level_up_materials) remInv(user, m.name, m.needed);
  user.profession_level = (user.profession_level || 1) + 1;
  const newItems3 = grantExclusiveItems(user);
  const newData = getProfessionData(user);
  saveUser(req.userToken, user);
  res.json({ new_level: user.profession_level, bonus_desc: newData.bonus_desc, cost: currentData.level_up_cost, items_granted: newItems3 });
});

app.post('/api/profession/respec', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  if (!user.profession) return res.json({ error: '没有职业可以重置' });
  const currentLevel = user.profession_level || 1;
  if (currentLevel <= 1) return res.json({ error: 'Lv.1 无需重置，直接切换职业即可' });
  if (!hasInv(user, '转职卡')) return res.json({ error: '需要转职卡才能重置职业等级' });
  remInv(user, '转职卡', 1);
  // 返还50%升级材料
  const prof = (PROFESSIONS.professions || []).find(p => p.id === user.profession);
  const refundMats = [];
  if (prof && prof.level_up_materials) {
    for (let lv = 2; lv <= currentLevel; lv++) {
      for (const m of prof.level_up_materials) {
        const count = Math.floor((m.count_per_level || 2) * (lv - 1) * 0.5);
        if (count > 0) {
          addInv(user, m.name, count);
          refundMats.push(`${m.name} x${count}`);
        }
      }
    }
  }
  user.profession_level = 1;
  saveUser(req.userToken, user);
  res.json({ refunded: refundMats, msg: '职业等级已重置为Lv.1，已返还50%升级材料' });
});

app.post('/api/profession/synthesize', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { recipeName } = req.body;
  if (!user.profession) return res.json({ error: '请先在技能页面选择职业' });
  const prof = (PROFESSIONS.professions || []).find(p => p.id === user.profession);
  if (!prof) return res.json({ error: '职业配置错误' });
  const level = user.profession_level || 1;
  const recipe = (prof.recipes || []).find(r => r.name === recipeName);
  if (!recipe) return res.json({ error: '配方不存在或不属于你的职业' });
  if ((recipe.min_level || 1) > level) return res.json({ error: `需要职业等级 Lv.${recipe.min_level}` });
  for (const ing of (recipe.ingredients || [])) {
    if (!hasInv(user, ing.name, ing.count || 1)) return res.json({ error: `缺少材料: ${ing.name} x${ing.count}` });
  }
  for (const ing of (recipe.ingredients || [])) remInv(user, ing.name, ing.count || 1);
  const output = recipe.output || { name: recipeName, count: 1 };
  addInv(user, output.name, output.count || 1);
  const questsCompleted = updateQuestProgress(user, 'synthesis_items', 1);
  saveUser(req.userToken, user);
  res.json({ synthesized: output.name, count: output.count, desc: recipe.desc, quests_completed: questsCompleted });
});

// -- 副职业升级 --
app.post('/api/sub-profession/levelup', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { professionId } = req.body;
  if (!professionId || !['chef', 'alchemist'].includes(professionId)) return res.json({ error: '无效的副职业' });
  const prof = (PROFESSIONS.professions || []).find(p => p.id === professionId);
  if (!prof) return res.json({ error: '职业配置错误' });
  if (!user.sub_professions) user.sub_professions = {};
  // 自动激活当前升级的副职业
  if (user.active_sub_profession && user.active_sub_profession !== professionId) {
    user.active_sub_profession = professionId;
  }
  const curLv = user.sub_professions[professionId] || 0;
  const maxLv = PROFESSIONS.max_level || 10;
  if (curLv >= maxLv) return res.json({ error: '已达最高等级' });
  const nextLv = curLv + 1;
  const nextBonus = (prof.level_bonuses || []).find(l => l.level === nextLv);
  if (!nextBonus) return res.json({ error: '等级配置错误' });
  // 计算费用
  const cost = Math.floor((PROFESSIONS.level_up_base_cost || 1000) * Math.pow(PROFESSIONS.level_up_cost_multiplier || 1.8, curLv));
  if ((user.coins || 0) < cost) return res.json({ error: `金币不足，需要 ${cost} 金币` });
  const materials = (prof.level_up_materials || []).map(m => ({
    name: m.name, needed: (m.count_per_level || 2) * curLv
  }));
  for (const m of materials) {
    if (!hasInv(user, m.name, m.needed)) return res.json({ error: `缺少材料: ${m.name} x${m.needed}` });
  }
  // 扣除
  user.coins -= cost;
  for (const m of materials) remInv(user, m.name, m.needed);
  user.sub_professions[professionId] = nextLv;
  user.active_sub_profession = professionId;
  // 发放新解锁的专属道具
  const granted = grantExclusiveItems(user, professionId);
  saveUser(req.userToken, user);
  res.json({
    new_level: nextLv, bonus_desc: nextBonus.bonus_desc || '',
    cost_paid: cost, items_granted: granted
  });
});

// -- 切换副职业（激活或切换，不再重置已有职业等级） --
app.post('/api/sub-profession/switch', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { professionId } = req.body;
  if (!professionId || !['chef', 'alchemist'].includes(professionId)) return res.json({ error: '无效的副职业' });
  if (!user.sub_professions) user.sub_professions = {};
  const otherSid = professionId === 'chef' ? 'alchemist' : 'chef';
  const otherLv = user.sub_professions[otherSid] || 0;
  // 如果目标已有等级，直接返回成功（已激活）
  const curLv = user.sub_professions[professionId] || 0;
  if (curLv > 0) {
    user.active_sub_profession = professionId;
    saveUser(req.userToken, user);
    return res.json({ switched_to: professionId, name: professionId === 'chef' ? '厨师' : '药师', level: curLv });
  }
  // 激活另一个副职业（首次激活或重新激活）
  if (otherLv > 0) {
    // 已有副职业在修炼中，激活另一个需消耗金币（不再重置原有职业等级）
    if ((user.coins || 0) < 10000) return res.json({ error: '激活副职业需要 10000 金币' });
    user.coins -= 10000;
    // 注意：不再将 otherSid 设为 0，保留其等级
  }
  // 首次选择副职业或重新激活：自动升到1级并发放初始物品
  user.sub_professions[professionId] = 1;
  user.active_sub_profession = professionId;
  grantExclusiveItems(user, professionId);
  saveUser(req.userToken, user);
  const profNames = { chef: '厨师', alchemist: '药师' };
  res.json({ switched_to: professionId, name: profNames[professionId] || professionId, level: user.sub_professions[professionId] || 0 });
});

// ===================== 区域系统 =====================
app.get('/api/regions', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const level = user.level || 1;
  // 🎪 活动加成区域
  const evtRgnState = getEventState();
  const bonusRegions = (evtRgnState.is_active && evtRgnState.cfg && evtRgnState.cfg.bonus_regions) ? evtRgnState.cfg.bonus_regions : [];
  const bonusMap = {};
  for (const br of bonusRegions) { bonusMap[br.region_id] = br; }

  res.json({
    regions: (REGIONS.regions || []).map(r => ({
      id: r.id, name: r.name, icon: r.icon, description: r.description,
      min_level: r.min_level || 1, unlocked: level >= (r.min_level || 1),
      rarity_bonus: r.rarity_bonus || 0,
      recommended_power: r.recommended_power || 0,
      event_bonus: bonusMap[r.id] || null,
      sub_regions: (r.sub_regions || []).map(sr => ({
        id: sr.id, name: sr.name, icon: sr.icon, desc: sr.desc,
        min_level: sr.min_level || 1,
        unlocked: level >= (sr.min_level || 1),
        recommended_power: sr.recommended_power || 0,
        fishing_spot: !!sr.fishing_spot
      }))
    })),
    bonus_regions: bonusRegions,
    current: user.adventure_region || 'random',
    current_sub_region: user.adventure_sub_region || 'any'
  });
});

// 🔀 冒险选择事件
app.post('/api/adventure/choose', authMiddleware, (req, res) => {
  try {
  const user = loadUser(req.userToken);
  const { choiceIndex } = req.body;
  const pending = user.pending_choice;
  if (!pending) return res.json({ error: '没有待处理的选择' });
  const choices = pending.event.choices || [];
  if (choiceIndex < 0 || choiceIndex >= choices.length) return res.json({ error: '无效的选择' });
  const chosen = choices[choiceIndex];
  const outcome = chosen.outcome || 'nothing';
  // 检查金币消耗
  if (chosen.cost && (user.coins || 0) < chosen.cost) return res.json({ error: `金币不足，需要 ${chosen.cost} 金币` });
  if (chosen.cost) user.coins = (user.coins || 0) - chosen.cost;
  const region = pending.region_id ? (REGIONS.regions || []).find(r => r.id === pending.region_id) : null;
  user.pending_choice = null;
  let result = { type: outcome, text: chosen.text_result || chosen.desc || '' };

  if (outcome === 'combat') {
    const eventRarity = pending.event.rarity || 1;
    const monster = genMonster(region, eventRarity);
    monster.name = chosen.monster_name || pending.event.name || monster.name;
    if (chosen.elite && Math.random() < (chosen.elite_chance || 0.15)) {
      monster.hp = Math.floor(monster.hp * 1.5); monster.max_hp = monster.hp;
      monster.attack = Math.floor(monster.attack * 1.3); monster.defense = Math.floor(monster.defense * 1.3);
      result.elite = true;
    }
    const stats = getPlayerStats(user);
    const battle = simulateBattle(stats, monster, user.adventure_count < 25, user);
    // ❤️ HP消耗（红羽毛复活不扣HP）
    const hpLoss2 = battle.phoenix_revived ? 0 : Math.max(1, Math.floor(battle.damage_taken / 2));
    user.current_hp = Math.max(0, (user.current_hp != null ? user.current_hp : stats.max_hp) - hpLoss2);
    if (user.swift_potion > 0) { user.swift_potion--; if (user.swift_potion <= 0) delete user.swift_potion; }
    if (user.poison_immune > 0) { user.poison_immune--; if (user.poison_immune <= 0) delete user.poison_immune; }
    if (user.temp_vitality_bento > 0) { user.temp_vitality_bento--; if (user.temp_vitality_bento <= 0) delete user.temp_vitality_bento; }
    if (user.temp_guard_ore > 0) { user.temp_guard_ore--; if (user.temp_guard_ore <= 0) delete user.temp_guard_ore; }
    if (user.power_potion > 0) { user.power_potion--; if (user.power_potion <= 0) delete user.power_potion; }
    if (user.shield_potion > 0) { user.shield_potion--; if (user.shield_potion <= 0) delete user.shield_potion; }
    if (user.crit_potion > 0) { user.crit_potion--; if (user.crit_potion <= 0) delete user.crit_potion; }
    if (user.all_potion > 0) { user.all_potion--; if (user.all_potion <= 0) delete user.all_potion; }
    result.battle = { win: battle.win, hp_remaining: battle.hp_remaining, monster_hp: battle.monster_hp_remaining, log: battle.log, special: monster.special, special_text: battle.special_text, phoenix_revived: battle.phoenix_revived || false, damage_dealt: battle.damage_dealt, damage_taken: battle.damage_taken, turns: battle.turns, crits: battle.crits, dodges: battle.dodges, detail: battle.detail };
    if (battle.win) {
      user.monster_kills = user.monster_kills || {}; user.monster_kills[monster.name] = (user.monster_kills[monster.name] || 0) + 1;
      user.total_monster_kills = (user.total_monster_kills || 0) + 1;
      const coins = parseRange(chosen.coins || pending.event.coins || [20, 60], [20, 60]);
      user.coins = (user.coins || 0) + coins; result.coins = coins;
      const expGain = addExp(user, chosen.exp || pending.event.exp || 20); result.exp = expGain;
      if (chosen.drops) {
        for (const d of chosen.drops) {
          // 检查概率掉落（chance 字段）
          if (typeof d === 'object' && d.chance !== undefined && Math.random() >= d.chance) continue;
          const cnt = typeof d === 'object' ? parseRange(d.count || [1, 1], [1, 1]) : 1;
          const name = typeof d === 'object' ? d.name : d;
          addInv(user, name, cnt); result.drops = result.drops || []; result.drops.push(name + (cnt > 1 ? 'x' + cnt : ''));
        }
      }
    } else {
      result.exp = Math.floor((chosen.exp || pending.event.exp || 20) * 0.2);
    }
  } else if (outcome === 'treasure') {
    const coins = parseRange(chosen.coins || pending.event.coins || [100, 300], [100, 300]);
    user.coins = (user.coins || 0) + coins; result.coins = coins;
    result.exp = addExp(user, chosen.exp || 30);
    if (chosen.drops) {
      for (const d of chosen.drops) {
        // 检查概率掉落（chance 字段）
        if (typeof d === 'object' && d.chance !== undefined && Math.random() >= d.chance) continue;
        const cnt = typeof d === 'object' ? parseRange(d.count || [1, 1], [1, 1]) : 1;
        const name = typeof d === 'object' ? d.name : d;
        addInv(user, name, cnt); result.drops = result.drops || []; result.drops.push(name + (cnt > 1 ? 'x' + cnt : ''));
      }
    }
    if (Math.random() < 0.10) { result.jackpot = true; result.coins = Math.floor((result.coins || coins) * rand(2, 4)); user.coins = (user.coins || 0) + result.coins - coins; }
  } else if (outcome === 'merchant') {
    const mItems = generateMerchantItems();
    if (!user.pending_merchant) user.pending_merchant = [];
    user.pending_merchant.push({ id: uid(), name: mItems.map(m => m.name).join('、'), items: mItems, added_at: now() });
    result.merchant = true;
    result.text = chosen.text_result || '你遇到了一个神秘商人！';
  } else if (outcome === 'ruins') {
    // 🏚️ 发现废墟：根据当前区域给予对应废墟探索卷轴
    const regionId = region ? region.id : null;
    const allRuins = (RUINS_CFG.ruins || []).filter(r => (user.level || 1) >= (r.min_level || 1));
    const regionRuins = regionId ? allRuins.filter(r => (r.region || []).includes(regionId)) : [];
    const pool = regionRuins.length > 0 ? regionRuins : (allRuins.length > 0 ? allRuins : (RUINS_CFG.ruins || []));
    const pickedRuins = pool[Math.floor(Math.random() * pool.length)];
    const ticketName = pickedRuins ? (pickedRuins.ticket || '废墟探索卷轴') : '废墟探索卷轴';
    const scrollCnt = chosen.ruins_scroll || 1;
    addInv(user, ticketName, scrollCnt);
    result.exp = addExp(user, chosen.exp || 10);
    result.ruins_discovered = true;
    result.ruins_scroll = scrollCnt;
    result.scroll_name = ticketName;
    result.ruins_name = pickedRuins ? pickedRuins.name : '';
    result.text = chosen.text_result || `你发现了一处废墟入口！获得了「${ticketName}」。`;
  } else {
    result.exp = addExp(user, chosen.exp || 5);
    result.text = chosen.text_result || '什么也没发生...';
  }

  const advWeather = getWeatherState();
  if (!region || !region.weather_immune) {
    const gemChance = 0.04 + (advWeather.adventure_drop || 0);
    if (Math.random() < gemChance) { const gem = dropGem(user); result.gem = gem.name; }
  }
  updateQuestProgress(user, 'adventure_times', 1);
  saveUser(req.userToken, user);
  res.json(result);
  } catch(e) {
    console.error('adventure/choose 错误:', e);
    // 清理 pending_choice 防止卡住后续冒险
    try { const u = loadUser(req.userToken); if (u && u.pending_choice) { u.pending_choice = null; saveUser(req.userToken, u); } } catch(e2) {}
    res.json({ error: '选择处理失败，请刷新重试' });
  }
});

// 🎒 冒险装备
app.get('/api/adventure/gear', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const allGear = [];
  for (const [name, info] of Object.entries(ITEMS.items || {})) {
    if (info.category === 'adv_gear') allGear.push({ name, rarity: info.rarity||1, use: info.use, gear_bonus: info.gear_bonus||{}, owned: hasInv(user, name), max_durability: info.durability || 100 });
  }
  res.json({ equipped: user.equipped_adv_gear || '', durability: user.adv_gear_durability || 0, gear: allGear });
});
app.post('/api/adventure/equip-gear', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { gearName } = req.body;
  if (gearName && !hasInv(user, gearName, 1)) return res.json({ error: '背包中没有该装备' });
  user.equipped_adv_gear = gearName || '';
  user.adv_gear_durability = gearName ? ((ITEMS.items[gearName] && ITEMS.items[gearName].durability) || 100) : 0;
  saveUser(req.userToken, user);
  res.json({ equipped: user.equipped_adv_gear, durability: user.adv_gear_durability });
});

app.post('/api/adventure/set-region', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { regionId } = req.body;
  if (regionId === 'random') {
    user.adventure_region = 'random';
    user.adventure_sub_region = 'any';
    saveUser(req.userToken, user);
    return res.json({ region: 'random', name: '随机区域', sub_region: 'any' });
  }
  const region = (REGIONS.regions || []).find(r => r.id === regionId);
  if (!region) return res.json({ error: '区域不存在' });
  if ((user.level || 1) < (region.min_level || 1)) return res.json({ error: `需要等级 ${region.min_level} 才能进入`+region.name });
  user.adventure_region = regionId;
  user.adventure_sub_region = 'any';
  saveUser(req.userToken, user);
  res.json({ region: regionId, name: region.name, icon: region.icon, sub_region: 'any' });
});

app.post('/api/adventure/set-sub-region', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { subRegionId } = req.body;
  const regionId = user.adventure_region || 'random';
  const region = (REGIONS.regions || []).find(r => r.id === regionId);
  if (!region) return res.json({ error: '当前未选择区域' });
  if (subRegionId === 'any') {
    user.adventure_sub_region = 'any';
    saveUser(req.userToken, user);
    return res.json({ sub_region: 'any', name: '全区域' });
  }
  const sr = (region.sub_regions || []).find(s => s.id === subRegionId);
  if (!sr) return res.json({ error: '子区域不存在' });
  if ((user.level || 1) < (sr.min_level || 1)) return res.json({ error: '需要等级 '+sr.min_level+' 才能进入'+sr.name });
  user.adventure_sub_region = subRegionId;
  saveUser(req.userToken, user);
  res.json({ sub_region: subRegionId, name: sr.name, icon: sr.icon });
});


// 🎣 冒险钓鱼（在钓鱼子区域使用）
app.post('/api/adventure/fish', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const rl = checkRateLimit(user, 'fishing');
  if (!rl.allowed) return res.json({ error: `钓鱼次数已达上限 (${rl.used}/${rl.max}每小时)` });
  if (user.current_hp <= 0) return res.json({ error: '💔 体力不支，无法钓鱼！' });

  const count = Math.min(req.body.count || 1, 15, rl.max - rl.used);
  if (count < 1) return res.json({ error: '钓鱼次数已用完' });

  const subRegionId = user.adventure_sub_region || 'any';
  const regionId = user.adventure_region || 'random';
  const region = (REGIONS.regions || []).find(r => r.id === regionId);
  if (!region) return res.json({ error: '未选择区域' });
  const sr = (region.sub_regions || []).find(s => s.id === subRegionId);
  if (!sr || !sr.fishing_spot) return res.json({ error: '当前子区域不适合钓鱼' });

  const targetAreaId = sr.fishing_area || 'creek';
  user.fishing_area = targetAreaId;

  // 总消耗
  const costPerCast = 10;
  const totalCost = costPerCast * count;
  if ((user.coins || 0) < totalCost) return res.json({ error: '金币不足，钓鱼需要 '+totalCost+' 金币' });
  user.coins -= totalCost;
  const hpCostPerCast = Math.max(1, Math.floor(((user.stats && user.stats.hp) || 100) * 0.02));
  const totalHpCost = Math.min((user.current_hp || 100), hpCostPerCast * count);
  user.current_hp = Math.max(0, (user.current_hp || 100) - totalHpCost);

  // 鱼竿
  const rodName = user.equipped_rod || '竹竿';
  const rod = (YUGAN.rods || []).find(r => r.name === rodName) || {};
  const failReduction = rod.fail_reduction || 0;
  const rareBonus = rod.rare_bonus || 0;

  // 水域
  const area = (FISHING_AREAS.areas || []).find(a => a.id === targetAreaId) || {};
  const areaFishPool = area.fish_pool || [];
  const areaJunk = area.junk_pool || [];
  let fishPool = (DIAOYU.fish || []).filter(f => areaFishPool.includes(f.name));
  if (fishPool.length === 0) fishPool = (DIAOYU.fish || []).filter(f => f.rarity > 0);

  // 失败率（一次性算出，后续沿用）
  let failChance = (DIAOYU.fail_chance || 0.25) - failReduction + (area.fail_modifier || 0);
  failChance = Math.max(0.02, failChance);

  // 鱼饵
  let baitName = user.equipped_bait;
  if (baitName) {
    const bait = (YUER.baits || []).find(b => b.name === baitName);
    if (bait) {
      failChance = Math.max(0.01, failChance - (bait.fail_reduction || 0));
    }
  }

  // 职业加成
  const profBonus = getProfessionBonus(user);
  if (profBonus.fishing_bonus) failChance = Math.max(0.01, failChance - profBonus.fishing_bonus);

  // 天气
  const weather = getWeatherState();
  if (!area.weather_immune) failChance = Math.max(0.01, failChance - (weather.fish_bonus || 0));

  // 批量钓鱼
  const results = [];
  let totalExp = 0, totalCoins = 0, fishCount = 0, junkCount = 0;
  const caughtFish = {};  // name -> count
  const caughtJunk = {};

  for (let i = 0; i < count; i++) {
    const castResult = {};

    if (Math.random() < failChance) {
      // 钓到垃圾
      const junkPool = areaJunk.length > 0 ? areaJunk : ['破鞋子', '水草', '树枝'];
      const junkName = junkPool[Math.floor(Math.random() * junkPool.length)];
      addInv(user, junkName, 1);
      caughtJunk[junkName] = (caughtJunk[junkName] || 0) + 1;
      castResult.type = 'junk';
      castResult.name = junkName;
      junkCount++;
    } else {
      // 钓到鱼
      const totalWeight = fishPool.reduce((s, f) => s + (1.0 / Math.max(f.rarity || 1, 1)), 0);
      let r = Math.random() * totalWeight;
      let caught = null;
      for (const f of fishPool) {
        r -= 1.0 / Math.max(f.rarity || 1, 1);
        if (r <= 0) { caught = f; break; }
      }
      if (!caught && fishPool.length > 0) caught = fishPool[0];
      if (caught) {
        const fishValue = (caught.value && Array.isArray(caught.value)) ? rand(caught.value[0], caught.value[1]) : 5;
        const isRare = (caught.rarity || 1) >= 3;
        addInv(user, caught.name, 1);
        user.coins = (user.coins || 0) + fishValue;
        totalCoins += fishValue;
        caughtFish[caught.name] = (caughtFish[caught.name] || 0) + 1;
        castResult.type = 'fish';
        castResult.name = caught.name;
        castResult.rare = isRare;
        castResult.coins = fishValue;
        if (isRare) {
          totalExp += 15;
          // 额外稀有鱼（鱼竿加成）
          if (Math.random() < rareBonus) {
            const rareFishPool = ['锦鲤', '大鲤鱼', '金龙鱼', '发光鱿鱼', '月光鱼'];
            const extraName = rareFishPool[Math.floor(Math.random() * rareFishPool.length)];
            addInv(user, extraName, 1);
            castResult.extra = extraName;
          }
        }
        fishCount++;
      }
    }
    results.push(castResult);
    totalExp += 10 + Math.floor(Math.random() * 10);
    addRateCount(user, 'fishing');
  }

  // 鱼饵消耗（批量后统一扣除一次）
  if (baitName && user.equipped_bait_count) {
    user.equipped_bait_count = Math.max(0, user.equipped_bait_count - Math.floor(count / 3));
    if (user.equipped_bait_count <= 0) { user.equipped_bait = null; user.equipped_bait_count = 0; }
  }

  const finalExp = addExp(user, totalExp);
  updateQuestProgress(user, 'fishing_times', count);
  saveUser(req.userToken, user);

  res.json({
    success: true,
    count,
    area: area.name || targetAreaId,
    area_icon: area.icon || '',
    rod: rodName,
    bait: baitName || null,
    results,
    summary: { fish: fishCount, junk: junkCount, coins: totalCoins, exp: finalExp, gold_cost: totalCost, stamina_cost: totalHpCost },
    caught_fish: caughtFish,
    caught_junk: caughtJunk
  });
});
// 钓鱼水域选择
app.post('/api/fishing/set-area', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { areaId } = req.body;
  const area = (FISHING_AREAS.areas || []).find(a => a.id === areaId);
  if (!area) return res.json({ error: '水域不存在' });
  if ((user.level || 1) < (area.min_level || 1)) return res.json({ error: `需要 Lv.${area.min_level} 才能前往${area.name}` });
  user.fishing_area = areaId;
  saveUser(req.userToken, user);
  res.json({ area: areaId, name: area.name, icon: area.icon });
});

// ===================== 每日任务系统 =====================
function generateDailyQuests(user) {
  const today2 = today();
  if (user.daily_quests_date === today2 && user.daily_quests && user.daily_quests.length > 0) {
    return user.daily_quests;
  }
  const pool = [...(QUESTS.quest_pool || [])];
  // shuffle
  for (let i = pool.length - 1; i > 0; i--) { const j = rand(0, i); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const maxQuests = QUESTS.max_quests_per_day || 3;
  const selected = pool.slice(0, Math.min(maxQuests, pool.length));
  const quests = selected.map(q => {
    const targets = q.target || [1];
    const target = targets[Math.floor(Math.random() * targets.length)];
    let desc = q.desc.replace('{target}', target);
    if (q.regions && q.id === 'reach_region') {
      const region = q.regions[Math.floor(Math.random() * q.regions.length)];
      desc = desc.replace('{region}', region);
    }
    return {
      id: q.id + '_' + uid(),
      name: q.name,
      desc: desc,
      target: target,
      progress: 0,
      completed: false,
      claimed: false,
      rewards: (q.rewards || []).map(r => ({ ...r }))
    };
  });
  user.daily_quests = quests;
  user.daily_quests_date = today2;
  return quests;
}

function updateQuestProgress(user, questType, amount) {
  if (!user.daily_quests) return [];
  const today2 = today();
  if (user.daily_quests_date !== today2) return [];
  const completed = [];
  for (const q of user.daily_quests) {
    if (q.completed || q.claimed) continue;
    if (q.id.startsWith(questType + '_')) {
      q.progress = Math.min(q.target, (q.progress || 0) + amount);
      if (q.progress >= q.target) {
        q.completed = true;
        // 自动领取奖励
        const rewardTexts = [];
        for (const rw of (q.rewards || [])) {
          switch (rw.type) {
            case 'coins':
              const c = parseRange(rw.amount, [100, 300]);
              user.coins = (user.coins || 0) + c;
              rewardTexts.push('💰+' + c);
              break;
            case 'exp':
              const e = parseRange(rw.amount, [50, 150]);
              addExp(user, e);
              rewardTexts.push('⭐+' + e + '经验');
              break;
            case 'skill_point':
              const sp = parseRange(rw.amount, [1, 1]);
              user.skill_points = (user.skill_points || 0) + sp;
              rewardTexts.push('📖+' + sp + '技能点');
              break;
            case 'item':
              if (rw.chance === undefined || Math.random() < (rw.chance || 1)) {
                const ic = parseRange(rw.count, [1, 1]);
                addInv(user, rw.name, ic);
                rewardTexts.push('📦' + rw.name + ' x' + ic);
              }
              break;
          }
        }
        q.claimed = true;
        completed.push({ id: q.id, name: q.name, rewards: rewardTexts });
      }
    }
  }
  return completed;
}

app.get('/api/quests', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const quests = generateDailyQuests(user);
  saveUser(req.userToken, user);
  res.json({ quests, date: user.daily_quests_date });
});

app.post('/api/quests/claim', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { questId } = req.body;
  if (!user.daily_quests) return res.json({ error: '没有进行中的任务' });
  const quest = user.daily_quests.find(q => q.id === questId);
  if (!quest) return res.json({ error: '任务不存在' });
  if (!quest.completed) return res.json({ error: '任务未完成' });
  if (quest.claimed) return res.json({ error: '已领取奖励' });
  quest.claimed = true;
  const rewards = [];
  for (const rw of (quest.rewards || [])) {
    switch (rw.type) {
      case 'coins':
        const cAmt = parseRange(rw.amount, [100, 300]);
        user.coins = (user.coins || 0) + cAmt;
        rewards.push(`💰+${cAmt}`);
        break;
      case 'exp':
        const eAmt = parseRange(rw.amount, [50, 150]);
        addExp(user, eAmt);
        rewards.push(`⭐+${eAmt}经验`);
        break;
      case 'skill_point':
        const spAmt = parseRange(rw.amount, [1, 1]);
        user.skill_points = (user.skill_points || 0) + spAmt;
        rewards.push(`📖+${spAmt}技能点`);
        break;
      case 'item':
        if (rw.chance === undefined || Math.random() < (rw.chance || 1)) {
          const iCnt = parseRange(rw.count, [1, 1]);
          addInv(user, rw.name, iCnt);
          rewards.push(`📦${rw.name} x${iCnt}`);
        }
        break;
    }
  }
  saveUser(req.userToken, user);
  res.json({ quest: quest.name, rewards, all_claimed: user.daily_quests.every(q => q.claimed) });
});

// ===================== 公告系统 =====================
app.get('/api/announcements', (req, res) => {
  // 自动清理：只保留最近5条，删除旧公告
  if (ANNOUNCEMENTS.announcements && ANNOUNCEMENTS.announcements.length > 5) {
    ANNOUNCEMENTS.announcements = ANNOUNCEMENTS.announcements.slice(0, 5);
    try { fs.writeFileSync(path.join(__dirname, 'config', 'announcements.json'), JSON.stringify(ANNOUNCEMENTS, null, 2)); } catch(e) {}
  }
  const list = (ANNOUNCEMENTS.announcements || []).slice(0, 1);
  res.json({ announcements: list });
});

// -- 天气与时段系统 --
function seedRandom(seed) { var x = Math.sin(seed) * 10000; return x - Math.floor(x); }
function getWeatherState() {
  var now = Date.now();
  var cycleMs = 3600000; // 1小时 = 1时段
  var periods = WEATHER_CFG.time_periods || ['早上','中午','下午','晚上'];
  var periodIndex = Math.floor(now / cycleMs) % periods.length;
  var currentPeriod = periods[periodIndex];
  // 天气种子：每个时段周期 + 日期偏移
  var weatherPeriod = Math.floor(now / (cycleMs * 3));
  var rng = seedRandom(weatherPeriod * 7919 + 104729);
  var weathers = WEATHER_CFG.weather_types || ['晴天'];
  var weatherIdx = Math.floor(rng * weathers.length);
  var currentWeather = weathers[weatherIdx];
  var effects = WEATHER_CFG.weather_effects || {};
  var we = effects[currentWeather] || {};
  var timeEff = WEATHER_CFG.time_effects || {};
  var te = timeEff[currentPeriod] || {};
  return {
    time_period: currentPeriod,
    time_icon: te.icon || (currentPeriod === '晚上' ? '🌙' : currentPeriod === '早上' ? '🌅' : currentPeriod === '中午' ? '☀️' : '🌇'),
    time_desc: te.desc || '',
    weather: currentWeather,
    weather_icon: we.icon || '☀️',
    weather_desc: we.desc || '',
    fish_bonus: (we.fish_bonus || 0) + (te.fish_bonus || 0),
    rare_bonus: we.rare_bonus || 0,
    adventure_drop: (we.adventure_drop || 0) + (te.adventure_drop || 0),
    adventure_monster_bonus: te.adventure_monster_bonus || 0,
    dark_monster_bonus: te.dark_monster_bonus || 0,
    period_duration: Math.floor(cycleMs / 1000),
    next_period_at: (Math.floor(now / cycleMs) + 1) * cycleMs
  };
}

// ===================== 游戏内日历 =====================
// 1现实小时 = 1游戏日，30游戏日 = 1游戏月，12月 = 1游戏年(360游戏日=15现实天)
const GAME_EPOCH = new Date('2026-01-01T00:00:00+08:00').getTime();
function gameDate() {
  const hours = Math.floor((Date.now() + TZ_OFFSET - GAME_EPOCH) / 3600000);
  const totalDays = hours;
  const dayOfYear = totalDays % 360;
  const month = Math.floor(dayOfYear / 30) + 1;
  const day = (dayOfYear % 30) + 1;
  const gameYear = Math.floor(totalDays / 360) + 1;
  return { month, day, totalDays, gameYear, realHours: hours };
}
// ===================== 季节与节气系统 =====================
function getCurrentSeason() {
  const gd = gameDate();
  const m = gd.month;
  for (const s of (SEASON_CFG.seasons || [])) {
    if (s.months && s.months.includes(m)) return s;
  }
  return SEASON_CFG.seasons?.[0] || { id: 'spring', name: '春天', icon: '\u{1F338}', desc: '' };
}
function getCurrentSolarTerm() {
  const gd = gameDate();
  const m = gd.month;
  const d = gd.day;
  let current = null;
  const terms = SEASON_CFG.solar_terms || [];
  for (const t of terms) {
    if (t.month < m || (t.month === m && t.day <= d)) {
      current = t;
    }
  }
  if (!current) {
    for (let i = terms.length - 1; i >= 0; i--) {
      if (terms[i].month >= 11) { current = terms[i]; break; }
    }
  }
  return current;
}
function getSeasonState() {
  const season = getCurrentSeason();
  const solarTerm = getCurrentSolarTerm();
  const pool = season.weather_pool || [];
  const weatherPeriod = Math.floor(Date.now() / 3600000);
  const rng = seedRandom(weatherPeriod * 131 + 3571);
  const gd = gameDate();
  const seasonWeatherName = pool.length > 0 ? pool[Math.floor(rng * pool.length)] : null;
  const seasonWeatherEffects = season.weather_effects || {};
  const sw = seasonWeatherName ? (seasonWeatherEffects[seasonWeatherName] || {}) : {};
  return {
    current_date: { year: gd.gameYear, month: gd.month, day: gd.day },
    season_id: season.id,
    season_name: season.name,
    season_icon: season.icon,
    season_desc: season.desc,
    season_weather: seasonWeatherName || '无',
    season_weather_icon: sw.icon || season.icon,
    season_weather_desc: sw.desc || '',
    season_fish_bonus: season.fish_bonus || 0,
    season_crops_bonus: season.crops_bonus || 0,
    season_effects: sw,
    current_solar_term: solarTerm ? {
      name: solarTerm.name,
      icon: solarTerm.icon,
      desc: solarTerm.desc,
      activity: solarTerm.activity || null,
      farm_bonus: solarTerm.farm_bonus || null
    } : null,
    seasonal_crops: SEASON_CFG.seasonal_crops?.[season.id] || [],
    seasonal_fish: SEASON_CFG.seasonal_fish?.[season.id] || []
  };
}
function doSolarTermActivity(user) {
  const term = getCurrentSolarTerm();
  if (!term || !term.activity) return null;
  const act = term.activity;
  const todayStr = today();
  const gd = gameDate();
  const key = 'solar_' + term.name + '_' + (term.month) + '_' + (term.day) + '_' + (gd.gameYear || 0);
  if ((user.solar_terms_collected || []).includes(key)) return { already_done: true, name: term.name };
  if (!user.solar_terms_collected) user.solar_terms_collected = [];
  user.solar_terms_collected.push(key);
  const result = { name: term.name, icon: term.icon, activity: act.title, rewards: [] };
  const rewardCfg = act.reward || {};
  const coinReward = Array.isArray(rewardCfg.coins) ? rand(rewardCfg.coins[0], rewardCfg.coins[1]) : (rewardCfg.coins || rand(30, 100));
  user.coins = (user.coins || 0) + coinReward;
  result.rewards.push({ type: 'coins', amount: coinReward });
  const expReward = Array.isArray(rewardCfg.exp) ? rand(rewardCfg.exp[0], rewardCfg.exp[1]) : (rewardCfg.exp || 0);
  if (expReward > 0) { addExp(user, expReward); result.rewards.push({ type: 'exp', amount: expReward }); }
  for (const bi of (act.bonus_items || [])) {
    if (Math.random() < (bi.chance || 0)) {
      const cnt = Array.isArray(bi.count) ? rand(bi.count[0], bi.count[1]) : (bi.count || 1);
      addInv(user, bi.name, cnt);
      result.rewards.push({ type: 'item', name: bi.name, count: cnt });
    }
  }
  if (act.special_item) {
    addInv(user, act.special_item.name, 1);
    result.rewards.push({ type: 'special_item', name: act.special_item.name });
  }
  if (act.hp_restore) {
    const stats = getPlayerStats(user);
    const hp = Math.floor(stats.hp * act.hp_restore);
    user.current_hp = Math.min(stats.hp, (user.current_hp || 0) + hp);
    result.rewards.push({ type: 'hp', amount: hp });
  }
  if (act.skill_point_bonus) {
    user.skill_points = (user.skill_points || 0) + act.skill_point_bonus;
    result.rewards.push({ type: 'skill_point', amount: act.skill_point_bonus });
  }
  return result;
}
function isDoubleHarvestDay() {
  const term = getCurrentSolarTerm();
  return term && term.activity && term.activity.double_harvest_day === true;
}
function getForgeBonusRate() {
  const term = getCurrentSolarTerm();
  return (term && term.activity && term.activity.forge_bonus_rate) || 0;
}
function getFoodBuffBonus() {
  const term = getCurrentSolarTerm();
  return (term && term.activity && term.activity.food_buff_bonus) || 0;
}
// 获取当前季节不出现在任何水域的鱼
function getOffSeasonFish(seasonId) {
  return (SEASON_CFG.off_season_fish || {})[seasonId] || [];
}
// 获取当前季节不可种植的作物
function getOffSeasonCrops(seasonId) {
  return (SEASON_CFG.off_season_crops || {})[seasonId] || [];
}
// 获取当前季节鱼列表
function getSeasonalFish(seasonId) {
  return (SEASON_CFG.seasonal_fish || {})[seasonId] || [];
}
// 获取当前季节作物列表
function getSeasonalCrops(seasonId) {
  return (SEASON_CFG.seasonal_crops || {})[seasonId] || [];
}

// ===================== 废墟探险系统 =====================
// 🗺️ 程序化废墟房间生成：用 dungeoneer 随机布局 + 原有主题房间内容
function generateProceduralRuins(ruinsTemplate, seed) {
  const { build } = require('dungeoneer');
  const roomPool = ruinsTemplate.rooms || [];
  if (roomPool.length < 2) return null; // 房间太少，退回到原始配置

  // 用 dungeoneer 生成地牢布局，多要几个房间备用
  const targetCount = Math.min(roomPool.length, 5 + Math.floor(Math.random() * 5)); // 5~9 个房间
  const d = build({
    width: 50, height: 50,
    maxRooms: targetCount + 4,
    minRoomSize: 3, maxRoomSize: 8
  });

  let dRooms = (d.rooms || []).slice(0, targetCount);
  if (dRooms.length < 2) return null;

  // 🌐 Prim 最小生成树 — 保证所有房间连通
  const allEdges = [];
  for (let ai = 0; ai < dRooms.length; ai++) {
    for (let bi = ai + 1; bi < dRooms.length; bi++) {
      const a = dRooms[ai], b = dRooms[bi];
      const ax = Math.floor(a.x + a.width / 2), ay = Math.floor(a.y + a.height / 2);
      const bx = Math.floor(b.x + b.width / 2), by = Math.floor(b.y + b.height / 2);
      allEdges.push({ from: ai, to: bi, dist: Math.abs(ax - bx) + Math.abs(ay - by) });
    }
  }
  // 按距离排序，Prim 算法
  allEdges.sort((a, b) => a.dist - b.dist);
  const connected = new Set([0]);
  const usedEdges = [];
  while (connected.size < dRooms.length) {
    let found = false;
    for (const e of allEdges) {
      const aIn = connected.has(e.from), bIn = connected.has(e.to);
      if (aIn !== bIn) {
        usedEdges.push(e);
        connected.add(e.from); connected.add(e.to);
        found = true; break;
      }
    }
    if (!found) break;
  }
  // 额外随机加 2~4 条边增加探索分支
  const shuffledEdges = [...allEdges].filter(e => !usedEdges.includes(e)).sort(() => Math.random() - 0.5);
  const extraEdges = shuffledEdges.slice(0, Math.min(3, shuffledEdges.length));
  for (const e of extraEdges) usedEdges.push(e);

  // 为每个房间分配主题（从 roomPool 随机不重复选取）
  const shuffled = [...roomPool].sort(() => Math.random() - 0.5);
  const themeMap = {}; // dRoomIndex → roomPool entry
  for (let i = 0; i < dRooms.length; i++) {
    themeMap[i] = shuffled[i % shuffled.length];
  }

  // 构建 exits 关系
  const roomExits = {}; // dRoomIndex → [dRoomIndex, ...]
  const roomExitsDesc = {}; // dRoomIndex → [desc, ...]
  for (const edge of usedEdges) {
    if (!roomExits[edge.from]) roomExits[edge.from] = [];
    if (!roomExits[edge.to]) roomExits[edge.to] = [];
    roomExits[edge.from].push(edge.to);
    roomExits[edge.to].push(edge.from);
  }

  // 生成最终房间列表（使用唯一 ID 前缀避免冲突）
  const prefix = ruinsTemplate.id + '_p';
  const newRooms = [];
  for (let i = 0; i < dRooms.length; i++) {
    const theme = themeMap[i];
    const exits = (roomExits[i] || []).map(j => prefix + '_' + j);
    // 🏷️ 出口描述按目标房间主题生成
    const exitsDesc = (roomExits[i] || []).map(j => {
      const destTheme = themeMap[j];
      const destName = destTheme ? destTheme.name : ('区域 ' + (j + 1));
      // 根据目标房间名生成自然的出口描述
      const prefixes = ['前往', '通向', '去往', '进入'];
      const prefixPick = prefixes[Math.floor(Math.random() * prefixes.length)];
      return prefixPick + destName;
    });
    newRooms.push({
      id: prefix + '_' + i,
      name: theme.name || ('区域 ' + (i + 1)),
      desc: theme.desc || '一个未知的区域',
      search_desc: theme.search_desc || theme.desc || '你仔细搜索了周围...',
      search_finds: theme.search_finds || [],
      traps: theme.traps || [],
      monster: theme.monster || null,
      chest: theme.chest || null,
      exits: exits,
      exits_desc: exitsDesc,
      is_exit: i === dRooms.length - 1, // 最后一个房间是出口
      spawn_chance: 0.85 + Math.random() * 0.15
    });
  }

  return {
    rooms: newRooms,
    usedLayout: true,
    roomCount: newRooms.length
  };
}

function enterRuins(user, ruinsId) {
  let ruins = (RUINS_CFG.ruins || []).find(r => r.id === ruinsId);
  if (!ruins) return { error: '找不到该废墟' };
  if ((user.current_hp || 0) <= 0) return { error: '💔 体力不支，无法进入废墟！请使用生命药剂恢复或等待自然恢复' };
  if ((user.level || 1) < ruins.min_level) return { error: `等级不足，需要 ${ruins.min_level} 级` };
  // 检查专属探索券（优先），否则检查通用券
  const ticketName = ruins.ticket || '废墟探索卷轴';
  const genericTicket = RUINS_CFG.generic_ticket || '废墟探索卷轴';
  let usedScroll = false;
  if (hasInv(user, ticketName)) { remInv(user, ticketName, 1); usedScroll = true; }
  else if (hasInv(user, genericTicket)) { remInv(user, genericTicket, 1); usedScroll = true; }
  else { return { error: `需要「${ticketName}」或「${genericTicket}」才能进入` }; }

  // 🗺️ 程序化布局：使用 dungeoneer 生成随机房间连接，但保留原有主题房间内容
  let generatedRooms = null;
  if (ruins.procedural_layout) {
    const seed = today() + '_' + ruinsId + '_' + (user.level || 1);
    generatedRooms = generateProceduralRuins(ruins, seed);
    if (generatedRooms) {
      ruins = { ...ruins, rooms: generatedRooms.rooms };
    }
  }

  const startRoom = ruins.rooms?.[0] || null;
  if (!startRoom) return { error: '废墟配置错误' };
  const baseSteps = ruins.max_steps || 10;
  const maxSteps = Math.max(baseSteps, 8) + rand(0, 4); // 🎲 最低8步，随机+0~4步
  // 🎲 概率房间：为每个房间判定是否出现
  const spawnedRooms = new Set();
  for (const room of (ruins.rooms || [])) {
    const chance = room.spawn_chance !== undefined ? room.spawn_chance : 1.0;
    if (Math.random() < chance) spawnedRooms.add(room.id);
  }
  // 确保入口房间必定出现
  spawnedRooms.add(startRoom.id);
  user.ruins_current = {
    ruins_id: ruinsId, current_room: startRoom.id, visited_rooms: [startRoom.id],
    explored_rooms: [], defeated_monsters: [], opened_chests: [],
    steps_taken: 1, max_steps: maxSteps, start_time: Date.now(),
    used_scroll: usedScroll, room_events: [],
    spawned_rooms: Array.from(spawnedRooms),
    _generated_rooms: generatedRooms ? generatedRooms.rooms : null  // 程序化生成的房间缓存
  };
  // 入口房间也有可能触发游荡怪物
  if (Math.random() < 0.08) {
    user.ruins_current.room_events.push({ type: 'wandering_monster', name: '👹 游荡怪物', desc: '一只怪物正好在入口附近徘徊！' });
  }
  if (!user.ruins_explored) user.ruins_explored = {};
  // 🎲 设置入口房间的有效出口（只显示已生成的房间）
  startRoom.valid_exits = (startRoom.exits || []).filter(e => spawnedRooms.has(e));
  startRoom.valid_exits_desc = [];
  for (let vi = 0; vi < (startRoom.exits || []).length; vi++) {
    if (spawnedRooms.has(startRoom.exits[vi])) {
      startRoom.valid_exits_desc.push((startRoom.exits_desc && startRoom.exits_desc[vi]) || ('出口' + (vi + 1)));
    }
  }
  // 探索次数在离开废墟时统一计数，避免进入+离开双重计数
  return { success: true, ruins_name: ruins.name, ruins_desc: ruins.desc, room: startRoom, steps_taken: 1, max_steps: maxSteps, used_scroll: usedScroll };
}
// 获取废墟的房间列表（优先使用程序化生成的房间）
function getRuinsRooms(state) {
  if (state._generated_rooms) return state._generated_rooms;
  const ruins = (RUINS_CFG.ruins || []).find(r => r.id === state.ruins_id);
  return ruins ? (ruins.rooms || []) : [];
}

function moveInRuins(user, exitIndex) {
  const state = user.ruins_current;
  if (!state) return { error: '未在废墟中' };
  const ruins = (RUINS_CFG.ruins || []).find(r => r.id === state.ruins_id);
  if (!ruins && !state._generated_rooms) return { error: '废墟数据错误' };
  const ruinsRooms = getRuinsRooms(state);
  const currentRoom = ruinsRooms.find(r => r.id === state.current_room);
  if (!currentRoom) return { error: '当前房间错误' };
  // 🎲 过滤到已出现的出口（与 /api/ruins 返回给前端的过滤一致，防止索引错位）
  const spawned = new Set(state.spawned_rooms || []);
  const validExits = (currentRoom.exits || []).filter(e => spawned.has(e));
  if (exitIndex < 0 || exitIndex >= validExits.length) return { error: '没有出口' };
  const nextRoomId = validExits[exitIndex];
  const nextRoom = ruinsRooms.find(r => r.id === nextRoomId);
  if (!nextRoom) return { error: '目标房间不存在' };
  // 步数：只有新房间才计数
  let stepsAdded = 0;
  if (!state.visited_rooms.includes(nextRoomId)) {
    state.visited_rooms.push(nextRoomId);
    stepsAdded = 1;
    state.steps_taken = (state.steps_taken || 0) + 1;
  }
  state.current_room = nextRoomId;
  // 🎲 过滤出口：只显示已生成的房间出口，防止前端索引与服务端过滤列表错位
  const nextSpawnedSet = new Set(state.spawned_rooms || []);
  nextRoom.valid_exits = (nextRoom.exits || []).filter(e => nextSpawnedSet.has(e));
  nextRoom.valid_exits_desc = [];
  for (let vi = 0; vi < (nextRoom.exits || []).length; vi++) {
    if (nextSpawnedSet.has(nextRoom.exits[vi])) {
      nextRoom.valid_exits_desc.push((nextRoom.exits_desc && nextRoom.exits_desc[vi]) || ('出口' + (vi + 1)));
    }
  }
  const maxSteps = state.max_steps || ruins.max_steps || 10;
  const stepsLeft = Math.max(0, maxSteps - (state.steps_taken || 0));
  // 🎲 进入新房间时随机生成房间事件（丰富的随机性）
  if (stepsAdded > 0) {
    const events = [];
    const rolls = { r1: Math.random(), r2: Math.random(), r3: Math.random(), r4: Math.random() };

    // —— 房间氛围（70%概率触发一种） ——
    if (rolls.r1 < 0.05) events.push({ type: 'lucky', name: '✨ 幸运之光', desc: '金色光芒笼罩房间，搜索收获翻倍！', search_mult: 2 });
    else if (rolls.r1 < 0.13) events.push({ type: 'rich', name: '📦 物资丰富', desc: '堆满了遗留的物资，能搜到更多物品。', search_extra: [1, 3] });
    else if (rolls.r1 < 0.19) events.push({ type: 'blessed', name: '🙏 祝福之室', desc: '远古祝福笼罩，发现率+15%。', find_bonus: 0.15 });
    else if (rolls.r1 < 0.23) events.push({ type: 'cursed', name: '💀 诅咒之地', desc: '黑暗诅咒笼罩，陷阱触发率+15%。', trap_bonus: 0.15 });
    else if (rolls.r1 < 0.28) events.push({ type: 'treasure_hint', name: '🗺️ 宝藏线索', desc: '墙上刻着藏宝图，宝箱开锁率+20%！', chest_bonus: 0.2 });
    else if (rolls.r1 < 0.32) events.push({ type: 'darkness', name: '🌑 暗影笼罩', desc: '房间昏暗无比，搜索发现率-10%但怪物掉落+30%。', find_bonus: -0.1, monster_loot_bonus: 0.3 });
    else if (rolls.r1 < 0.36) events.push({ type: 'echo', name: '🔊 回音之室', desc: '墙壁回荡着远古的低语，经验获取+25%。', exp_bonus: 0.25 });
    else if (rolls.r1 < 0.39) events.push({ type: 'time_warp', name: '⏳ 时光扭曲', desc: '时间流速异常，搜索不消耗步数！', free_search: true });
    else if (rolls.r1 < 0.42) events.push({ type: 'gold_rush', name: '💰 金币雨', desc: '天花板缝隙中不断掉出金币！额外获得金币。', coins_bonus: [50, 200] });

    // —— 随机遭遇（独立判定，可多个同时触发） ——
    if (rolls.r2 < 0.12) events.push({ type: 'wandering_monster', name: '👹 游荡怪物', desc: '一只怪物在此徘徊，击败它获得额外奖励。' });
    if (rolls.r2 > 0.85 && rolls.r2 < 0.93) events.push({ type: 'elite_guardian', name: '💀 精英守卫', desc: '一名精英守卫看守着这个房间，击败它获得稀有掉落！', loot_bonus: 0.3, hp_mult: 1.5, atk_mult: 1.3 });

    if (rolls.r3 < 0.06) events.push({ type: 'merchant', name: '🧙 流浪商人', desc: '一位流浪商人在此歇脚，出售稀有物品。' });
    else if (rolls.r3 < 0.09) events.push({ type: 'goblin_merchant', name: '👺 哥布林商贩', desc: '一只鬼鬼祟祟的哥布林在此摆摊，价格便宜但货品不稳定。' });
    else if (rolls.r3 < 0.12) events.push({ type: 'mysterious_stranger', name: '🎭 神秘旅人', desc: '一位身份不明的旅人，愿意用随机物品交换你的物品。' });

    if (rolls.r4 < 0.07) events.push({ type: 'treasure_goblin', name: '🏃 宝藏哥布林', desc: '一只背着宝袋的哥布林从眼前窜过！10秒内击败它可获得大量金币！', flee_chance: 0.6, coins_drop: [100, 500] });
    else if (rolls.r4 < 0.11) events.push({ type: 'trap_room', name: '⚠️ 陷阱房间', desc: '地板上布满了可疑的机关，搜索时陷阱触发率大幅提升。', trap_chance: 0.5, trap_dmg: [10, 30] });
    else if (rolls.r4 < 0.15) events.push({ type: 'puzzle', name: '🧩 古老谜题', desc: '墙上刻着一段古老的谜语，解开它可获得丰厚奖励。', puzzle_reward: true });

    state.room_events = events;
  } else {
    state.room_events = []; // 回访已探索房间无事件
  }
  // 如果到达出口或步数用完，自动退出
  if (nextRoom.is_exit || stepsLeft <= 0) {
    user.ruins_current = null;
    if (!user.ruins_explored) user.ruins_explored = {};
    user.ruins_explored[state.ruins_id] = (user.ruins_explored[state.ruins_id] || 0) + 1;
    return { success: true, room: nextRoom, is_new: stepsAdded > 0, steps_taken: state.steps_taken || 0, max_steps: maxSteps, is_exit: true, auto_exit: stepsLeft <= 0 && !nextRoom.is_exit, exit_msg: stepsLeft <= 0 ? '⚠️ 步数已用完，自动离开废墟！' : '🏚️ 你离开了废墟！' };
  }
  user.ruins_current = state;
  return { success: true, room: nextRoom, is_new: stepsAdded > 0, steps_taken: state.steps_taken, max_steps: maxSteps, steps_left: stepsLeft, is_exit: false };
}
function searchInRuins(user) {
  const state = user.ruins_current;
  if (!state) return { error: '未在废墟中' };
  if ((user.current_hp || 0) <= 0) return { error: '💔 体力不支，无法搜索！请使用生命药剂恢复或等待自然恢复' };
  const ruinsRooms = getRuinsRooms(state);
  const currentRoom = ruinsRooms.find(r => r.id === state.current_room);
  if (!currentRoom) return { error: '当前房间错误' };
  if (!state.explored_rooms) state.explored_rooms = [];
  // 每个房间只能搜索一次
  if (state.explored_rooms.includes(state.current_room)) return { error: '这个房间已经搜索过了' };
  state.explored_rooms.push(state.current_room);
  const finds = currentRoom.search_finds || [];
  const found = [];
  const seasonState = getSeasonState();
  const roomEvents = state.room_events || [];
  // 🎲 房间修饰加成
  const luckyMult = roomEvents.find(e => e.type === 'lucky') ? 2 : 1;
  const blessedBonus = (roomEvents.find(e => e.type === 'blessed') ? (roomEvents.find(e => e.type === 'blessed').find_bonus || 0) : 0);
  const cursedTrapBonus = (roomEvents.find(e => e.type === 'cursed') ? (roomEvents.find(e => e.type === 'cursed').trap_bonus || 0) : 0);
  let findBonus = (seasonState.season_effects?.ruins_find_bonus || 0) + blessedBonus;
  const richExtra = roomEvents.find(e => e.type === 'rich');
  let extraFinds = [];
  // 搜索房间
  for (const f of finds) {
    if (Math.random() < (f.chance || 0) + findBonus) {
      const cnt = f.count ? (Array.isArray(f.count) ? rand(f.count[0], f.count[1]) : f.count) : 1;
      const coins = f.coins ? (Array.isArray(f.coins) ? rand(f.coins[0], f.coins[1]) : f.coins) : 0;
      // 幸运房间：物品翻倍
      const finalCnt = cnt * luckyMult;
      found.push({ name: f.name, count: finalCnt, coins: coins * luckyMult, tip: f.tip || '', lucky: luckyMult > 1 });
    }
  }
  // 富矿房间：额外随机物品
  if (richExtra) {
    const extraCnt = Array.isArray(richExtra.search_extra) ? rand(richExtra.search_extra[0], richExtra.search_extra[1]) : 1;
    const bonusPool = [
      { name: '铜矿', count: [1, 3], coins: 0 },
      { name: '银矿', count: [1, 2], coins: 0 },
      { name: '铁矿', count: [1, 3], coins: 0 },
      { name: '旧银币', count: 1, coins: [20, 50] },
      { name: '旧金币', count: 1, coins: [50, 150] },
      { name: '磨刀石', count: 1, coins: 0 },
      { name: '宝石碎片', count: [1, 2], coins: 0 },
      { name: '经验珠(小)', count: 1, coins: 0 },
    ];
    for (let ei = 0; ei < extraCnt; ei++) {
      const pick = bonusPool[Math.floor(Math.random() * bonusPool.length)];
      const ecnt = Array.isArray(pick.count) ? rand(pick.count[0], pick.count[1]) : (pick.count || 1);
      const ecoins = pick.coins ? (Array.isArray(pick.coins) ? rand(pick.coins[0], pick.coins[1]) : pick.coins) : 0;
      extraFinds.push({ name: pick.name, count: ecnt, coins: ecoins, tip: '', from_event: '📦 物资丰富' });
    }
  }
  // 🎲 搜索惊喜事件
  let searchEvent = null;
  const surpriseRoll = Math.random();
  if (surpriseRoll < 0.06) {
    // 发现隐藏物品
    const hiddenPool = [
      { name: '旧金币', count: [2, 5], coins: [100, 300] },
      { name: '金矿', count: [1, 3], coins: 0 },
      { name: '旧书', count: 1, coins: 0 },
      { name: '磨刀石', count: [1, 3], coins: 0 },
      { name: '亮石子', count: [1, 2], coins: 0 },
    ];
    const hp = hiddenPool[Math.floor(Math.random() * hiddenPool.length)];
    const hcnt = Array.isArray(hp.count) ? rand(hp.count[0], hp.count[1]) : (hp.count || 1);
    const hcoins = hp.coins ? (Array.isArray(hp.coins) ? rand(hp.coins[0], hp.coins[1]) : hp.coins) : 0;
    // 自动将隐藏物品加入玩家背包
    if (hp.name === '金币') {
      if (hcoins > 0) user.coins = (user.coins || 0) + hcoins;
    } else {
      addInv(user, hp.name, hcnt);
      if (hcoins > 0) user.coins = (user.coins || 0) + hcoins;
    }
    searchEvent = { type: 'hidden_cache', name: '🎁 隐藏物品', desc: '你发现了一个被遗忘的包裹！', item: { name: hp.name, count: hcnt, coins: hcoins, auto_added: true } };
  } else if (surpriseRoll < 0.10) {
    // 发现密道 - 获得额外步数
    const bonusSteps = 1;
    state.steps_taken = Math.max(0, (state.steps_taken || 1) - bonusSteps);
    searchEvent = { type: 'secret_passage', name: '🕳️ 秘密通道', desc: '你发现了一条捷径！节省了 ' + bonusSteps + ' 步。', bonus_steps: bonusSteps };
  } else if (surpriseRoll < 0.13) {
    // 触发隐藏陷阱
    const trapDmg = rand(10, 30);
    if (user.current_hp) user.current_hp = Math.max(0, (user.current_hp || 0) - trapDmg);
    searchEvent = { type: 'hidden_trap', name: '⚠️ 隐藏陷阱', desc: '你不慎触发了隐藏的机关！', damage: trapDmg };
  }
  // 原有的房间陷阱
  const traps = currentRoom.traps || [];
  let trapEncountered = null;
  const trapChanceBonus = cursedTrapBonus;
  for (const trap of traps) {
    if (Math.random() < (trap.chance || 0) + trapChanceBonus) {
      const dodgeSuccess = Math.random() < (trap.dodge_sp || 0) / 100;
      const dmg = dodgeSuccess ? 0 : (Array.isArray(trap.damage) ? rand(trap.damage[0], trap.damage[1]) : (trap.damage || 0));
      trapEncountered = { name: trap.name, desc: trap.desc, dodged: dodgeSuccess, dodge_desc: trap.dodge_desc || '', damage: dmg };
      if (dmg > 0 && user.current_hp) user.current_hp = Math.max(0, (user.current_hp || 0) - dmg);
      break;
    }
  }
  user.ruins_current = state;
  return { success: true, finds: found, extra_finds: extraFinds, trap: trapEncountered, search_event: searchEvent, room_name: currentRoom.name, room_desc: currentRoom.search_desc || currentRoom.desc, room_events: roomEvents };
}
function pickUpRuinsItems(user, selectedItems) {
  if (!selectedItems || selectedItems.length === 0) return { picked: 0 };
  let count = 0;
  for (const item of selectedItems) {
    if (item.name && item.count > 0) {
      addInv(user, item.name, item.count);
      if (item.coins > 0) user.coins = (user.coins || 0) + item.coins;
      count++;
    }
  }
  return { picked: count };
}
function fightInRuins(user) {
  const state = user.ruins_current;
  if (!state) return { error: '未在废墟中' };
  if ((user.current_hp || 0) <= 0) return { error: '💔 体力不支，无法战斗！请使用生命药剂恢复或等待自然恢复' };
  // 只需要 check ruins 存在性（非程序化时才需要 config），这里仅验证状态有效
  const _ruins = (RUINS_CFG.ruins || []).find(r => r.id === state.ruins_id);
  if (!_ruins && !state._generated_rooms) return { error: '废墟数据错误' };
  const ruinsRooms = getRuinsRooms(state);
  const currentRoom = ruinsRooms.find(r => r.id === state.current_room);
  if (!currentRoom) return { error: '当前房间错误' };
  // 🎲 检查各种怪物事件
  const hasWandering = (state.room_events || []).some(e => e.type === 'wandering_monster');
  const hasElite = (state.room_events || []).some(e => e.type === 'elite_guardian');
  const hasGoblin = (state.room_events || []).some(e => e.type === 'treasure_goblin');
  const hasEventMonster = hasWandering || hasElite || hasGoblin;
  if (!currentRoom.monster && !hasEventMonster) return { error: '这个房间没有怪物' };
  // ⚔️ 已经击败过的房间怪物不能重复打（事件怪物可重复）
  const roomDefeated = (state.defeated_monsters || []).includes(currentRoom.id);
  if (roomDefeated && !hasEventMonster) return { error: '这个房间的怪物已经被击败了' };
  let m;
  let isWanderingFight = false, isEliteFight = false, isGoblinFight = false;
  // 宝藏哥布林优先
  if (hasGoblin) {
    const gEvt = (state.room_events || []).find(e => e.type === 'treasure_goblin');
    m = {
      name: '🏃 宝藏哥布林', rarity: 3,
      hp: [60, 120], attack: [8, 18], defense: [3, 8], speed: [25, 35],
      exp: [30, 80], coins: gEvt.coins_drop || [100, 500],
      drops: [{ name: '古代金币', chance: 0.6, count: [1, 3] }, { name: '宝石碎片', chance: 0.4, count: [1, 2] }],
      special: '逃跑', flee_chance: gEvt.flee_chance || 0.6
    };
    isGoblinFight = true;
  } else if (hasElite) {
    // 精英守卫 - 强化版房间怪物
    const eEvt = (state.room_events || []).find(e => e.type === 'elite_guardian');
    if (currentRoom.monster) {
      m = JSON.parse(JSON.stringify(currentRoom.monster)); // deep clone
      m.hp = [Math.floor(m.hp[0] * (eEvt.hp_mult || 1.5)), Math.floor(m.hp[1] * (eEvt.hp_mult || 1.5))];
      m.attack = [Math.floor(m.attack[0] * (eEvt.atk_mult || 1.3)), Math.floor(m.attack[1] * (eEvt.atk_mult || 1.3))];
      m.exp = [Math.floor(m.exp[0] * 1.5), Math.floor(m.exp[1] * 1.5)];
      m.coins = [Math.floor(m.coins[0] * 2), Math.floor(m.coins[1] * 2)];
      m.rarity = Math.min(9999, (m.rarity || 1) + 1);
      m.name = '💀 精英·' + m.name;
      if (!m.drops) m.drops = [];
      m.drops.push({ name: '觉醒之石', chance: 0.15, count: 1 }, { name: '附魔石', chance: 0.25, count: [1, 2] });
    } else {
      m = { name: '💀 精英守卫', rarity: 4, hp: [200, 400], attack: [40, 70], defense: [15, 30], speed: [10, 18], exp: [80, 200], coins: [100, 300], drops: [{ name: '觉醒之石', chance: 0.3, count: 1 }, { name: '百炼钢', chance: 0.2, count: 1 }], special: '精英' };
    }
    isEliteFight = true;
  } else if (hasWandering) {
    // 游荡怪物
    const wLevel = Math.max(1, Math.floor((user.level || 10) / 10));
    const wPool = [
      { name: '迷路的小毛贼', rarity: 1, hp: [40, 70], attack: [10, 18], defense: [3, 8], speed: [10, 18], exp: [12, 25], coins: [10, 30], drops: [{ name: '小毛贼耳朵', chance: 0.5, count: 1 }], special: '' },
      { name: '游荡的流浪汉', rarity: 1, hp: [50, 90], attack: [12, 22], defense: [5, 12], speed: [6, 12], exp: [15, 30], coins: [15, 35], drops: [{ name: '骨头片', chance: 0.4, count: [1, 2] }], special: '' },
      { name: '巨型老鼠', rarity: 1, hp: [35, 60], attack: [8, 15], defense: [2, 6], speed: [14, 22], exp: [10, 20], coins: [5, 20], drops: [{ name: '兽牙', chance: 0.3, count: 1 }], special: '' },
      { name: '幽灵斥候', rarity: 2, hp: [70, 120], attack: [18, 30], defense: [4, 10], speed: [12, 20], exp: [20, 40], coins: [20, 50], drops: [{ name: '幽灵残渣', chance: 0.35, count: 1 }], special: '虚化' },
      { name: '暗影潜行者', rarity: 2, hp: [80, 140], attack: [20, 35], defense: [5, 12], speed: [14, 24], exp: [25, 50], coins: [25, 60], drops: [{ name: '黑灰', chance: 0.25, count: 1 }], special: '暗杀' },
    ];
    m = wPool[rand(0, wPool.length - 1)];
    isWanderingFight = true;
  } else {
    m = currentRoom.monster;
  }
  // 创建废墟怪物
  const mHp = rand(m.hp?.[0] || 50, m.hp?.[1] || 100);
  const monster = {
    name: m.name, rarity: m.rarity || 1, max_hp: mHp,
    hp: mHp, attack: rand(m.attack?.[0] || 5, m.attack?.[1] || 20),
    defense: rand(m.defense?.[0] || 2, m.defense?.[1] || 10),
    speed: rand(m.speed?.[0] || 1, m.speed?.[1] || 10), atk_speed: 0,
    special: m.special || '', exp: rand(m.exp?.[0] || 10, m.exp?.[1] || 50),
    coins: rand(m.coins?.[0] || 10, m.coins?.[1] || 50),
    is_wandering: isWanderingFight, is_elite: isEliteFight, is_goblin: isGoblinFight,
    flee_chance: m.flee_chance || 0
  };
  // 🏃 宝藏哥布林逃跑判定
  let goblinFled = false;
  if (isGoblinFight && Math.random() < (m.flee_chance || 0.6)) { goblinFled = true; }
  const playerStats = getPlayerStats(user);
  const result = goblinFled ? { win: false, hp_remaining: playerStats.hp || 100, monster_hp_remaining: 0, detail: [] }
    : simulateBattle(playerStats, monster, false, user);
  let drops = [];
  let phoenixRevived = false;
  // 🪶 红泪石复活处理
  if (result.phoenix_revived) {
    phoenixRevived = true;
    user.current_hp = playerStats.hp; // 复活满血
  } else {
    const hpAfter = result.hp_remaining !== undefined ? result.hp_remaining : 0;
    user.current_hp = Math.max(0, hpAfter);
  }
  // 消耗战斗次数类 Buff（不论输赢，只要不是哥布林逃跑）
  if (!goblinFled) {
    if (user.swift_potion > 0) { user.swift_potion--; if (user.swift_potion <= 0) delete user.swift_potion; }
    if (user.poison_immune > 0) { user.poison_immune--; if (user.poison_immune <= 0) delete user.poison_immune; }
    if (user.temp_vitality_bento > 0) { user.temp_vitality_bento--; if (user.temp_vitality_bento <= 0) delete user.temp_vitality_bento; }
    if (user.temp_guard_ore > 0) { user.temp_guard_ore--; if (user.temp_guard_ore <= 0) delete user.temp_guard_ore; }
    if (user.power_potion > 0) { user.power_potion--; if (user.power_potion <= 0) delete user.power_potion; }
    if (user.shield_potion > 0) { user.shield_potion--; if (user.shield_potion <= 0) delete user.shield_potion; }
    if (user.crit_potion > 0) { user.crit_potion--; if (user.crit_potion <= 0) delete user.crit_potion; }
    if (user.all_potion > 0) { user.all_potion--; if (user.all_potion <= 0) delete user.all_potion; }
  }
  if (result.win) {
    const lootMult = isEliteFight ? 1.5 : 1;
    for (const d of (m.drops || [])) {
      if (Math.random() < ((d.chance || 0) * lootMult)) {
        const cnt = Array.isArray(d.count) ? rand(d.count[0], d.count[1]) : (d.count || 1);
        const finalCnt = Math.max(1, Math.floor(cnt * lootMult));
        addInv(user, d.name, finalCnt); drops.push({ name: d.name, count: finalCnt, elite: isEliteFight });
      }
    }
    // 暗影笼罩：怪物掉落金币+30%
    if ((state.room_events || []).some(e => e.type === 'darkness')) {
      monster.coins += Math.floor(monster.coins * 0.3);
    }
    // 回音之室：经验+25%
    const expMult = (state.room_events || []).some(e => e.type === 'echo') ? 1.25 : 1;
    user.coins = (user.coins || 0) + monster.coins;
    addExp(user, Math.floor(monster.exp * expMult));
    if (!isWanderingFight && !isEliteFight && !isGoblinFight) {
      if (!state.defeated_monsters) state.defeated_monsters = [];
      state.defeated_monsters.push(currentRoom.id);
    }
    // 移除对应的事件怪物（只移除当前战斗的类型）
    if (isWanderingFight || isEliteFight || isGoblinFight) {
      const eventTypesToRemove = [];
      if (isWanderingFight) eventTypesToRemove.push('wandering_monster');
      if (isEliteFight) eventTypesToRemove.push('elite_guardian');
      if (isGoblinFight) eventTypesToRemove.push('treasure_goblin');
      state.room_events = (state.room_events || []).filter(e => !eventTypesToRemove.includes(e.type));
    }
  }
  user.ruins_current = state;
  return {
    success: true, win: result.win,
    monster_data: { name: monster.name, rarity: monster.rarity, special: monster.special, is_wandering: !!monster.is_wandering, is_elite: !!monster.is_elite, is_goblin: !!monster.is_goblin, goblin_fled: goblinFled },
    drops, coins: result.win ? monster.coins : 0, exp: result.win ? monster.exp : 0,
    player_hp: user.current_hp, monster_hp: result.monster_hp_remaining || 0,
    phoenix_revived: phoenixRevived, goblin_fled: goblinFled,
    detail: result.detail || null
  };
}
function openChestInRuins(user) {
  const state = user.ruins_current;
  if (!state) return { error: '未在废墟中' };
  const ruinsRooms = getRuinsRooms(state);
  const currentRoom = ruinsRooms.find(r => r.id === state.current_room);
  if (!currentRoom || !currentRoom.chest) return { error: '这个房间没有宝箱' };
  if ((state.opened_chests || []).includes(currentRoom.id)) return { error: '这个宝箱已经打开过了' };
  const chest = currentRoom.chest;
  const lockDifficulty = chest.lock_difficulty || 1;
  // 🎲 宝藏线索房间事件：提升宝箱开锁成功率
  const chestBonus = (state.room_events || []).find(e => e.type === 'treasure_hint');
  const chestBonusVal = chestBonus ? (chestBonus.chest_bonus || 0.2) : 0;
  const pickSkill = Math.random() < (0.75 - lockDifficulty * 0.03 + chestBonusVal);
  let loot = null;
  if (pickSkill) {
    const pool = chest.loot_pool || [];
    const seasonState = getSeasonState();
    const bonusChance = seasonState.season_effects?.ruins_find_bonus || 0;
    for (const item of pool) {
      if (Math.random() < ((item.chance || 0) + bonusChance)) {
        const cnt = item.count ? (Array.isArray(item.count) ? rand(item.count[0], item.count[1]) : item.count) : 1;
        const coins = item.coins ? (Array.isArray(item.coins) ? rand(item.coins[0], item.coins[1]) : item.coins) : 0;
        loot = { name: item.name, count: cnt, coins }; break;
      }
    }
    if (!loot && chest.coins_pool) {
      const coins = Array.isArray(chest.coins_pool) ? rand(chest.coins_pool[0], chest.coins_pool[1]) : chest.coins_pool;
      loot = { name: '金币', count: coins, coins };
    }
  }
  if (loot) {
    if (!state.opened_chests) state.opened_chests = [];
    state.opened_chests.push(currentRoom.id);
    if (loot.name !== '金币') addInv(user, loot.name, loot.count);
    if (loot.coins > 0) user.coins = (user.coins || 0) + loot.coins;
  }
  user.ruins_current = state;
  return { success: true, opened: pickSkill, loot, retry: !loot, tip_success: chest.pick_tip_success || '', tip_fail: chest.pick_tip_fail || '' };
}
function restInRuins(user) {
  const state = user.ruins_current;
  if (!state) return { error: '未在废墟中' };
  const hpGain = RUINS_CFG.rest_hp_gain || 0.15;
  const stats = getPlayerStats(user);
  const hp = Math.floor(stats.hp * hpGain);
  if (hp > 0) user.current_hp = Math.min(stats.hp, (user.current_hp || 0) + hp);
  return { success: true, hp_restored: hp, steps_taken: state.steps_taken || 0, max_steps: state.max_steps || 10 };
}
function exitRuins(user) {
  const state = user.ruins_current;
  if (!state) return { error: '未在废墟中' };
  const elapsed = Math.floor((Date.now() - (state.start_time || Date.now())) / 1000);
  if (!user.ruins_explored) user.ruins_explored = {};
  user.ruins_explored[state.ruins_id] = (user.ruins_explored[state.ruins_id] || 0) + 1;
  user.ruins_current = null;
  return { success: true, elapsed };
}

// -- 活动系统 --
function getEventState() {
  const cfg = EVENTS.event; if (!cfg) return { is_active: false, is_shop_open: false, cfg: null };
  const t = today();
  const start = cfg.start || '2000-01-01', end = cfg.end || '2000-01-01';
  const shopEnd = new Date(new Date(end).getTime() + 3 * 86400000).toISOString().slice(0, 10);
  return { is_active: t >= start && t <= end, is_shop_open: t >= start && t <= shopEnd, cfg, shop_end: shopEnd };
}
app.get('/api/events', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const state = getEventState();
  const curName = state.cfg?.currency?.name || '活动币';
  // 💰 通用活动币：永久有效，跨活动不转换
  const universalBalance = (user.event_currencies || {})['通用活动币'] || 0;
  const balance = (user.event_currencies || {})[curName] || 0;
  let autoConverted = null;
  let legacyConverted = [];
  const rate = state.cfg?.currency?.coin_exchange_rate || 50;
  // 🧹 清理旧活动遗留代币：不是当前活动币种的都按汇率转金币（通用活动币除外）
  if (user.event_currencies) {
    for (const [oldCur, amount] of Object.entries(user.event_currencies)) {
      if (oldCur !== curName && oldCur !== '通用活动币' && amount > 0) {
        const coins = amount * rate;
        user.coins = (user.coins || 0) + coins;
        user.event_currencies[oldCur] = 0;
        legacyConverted.push({ currency: oldCur, amount, coins });
      }
    }
  }
  if (!state.is_active && !state.is_shop_open && state.cfg && balance > 0) {
    const eventId = state.cfg.name + '_' + state.cfg.end;
    if (!(user.event_converted || []).includes(eventId)) {
      const coins = balance * rate;
      user.coins = (user.coins || 0) + coins; user.event_currencies[curName] = 0;
      if (!user.event_converted) user.event_converted = [];
      user.event_converted.push(eventId);
      saveUser(req.userToken, user);
      autoConverted = { balance, coins, rate };
    }
  }
  if (legacyConverted.length > 0) saveUser(req.userToken, user);
  res.json({ event: state.cfg, is_active: state.is_active, is_shop_open: state.is_shop_open, shop_end: state.shop_end,
    currency_name: curName, balance, universal_balance: universalBalance, shop: EVENTS.shop || [], auto_converted: autoConverted, legacy_converted: legacyConverted, purchases: user.event_shop_purchases || {} });});
app.post('/api/events/buy', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const state = getEventState();
  if (!state.is_shop_open) return res.json({ error: '活动商店未开放' });
  const curName = state.cfg?.currency?.name || '活动币';
  const eventBalance = (user.event_currencies || {})[curName] || 0;
  const universalBalance = (user.event_currencies || {})['通用活动币'] || 0;
  const balance = eventBalance + universalBalance;
  const { shopIndex } = req.body;
  const shop = EVENTS.shop || [];
  if (shopIndex < 0 || shopIndex >= shop.length) return res.json({ error: '无效商品' });
  const item = shop[shopIndex];
  if (balance < item.price) return res.json({ error: `${curName}不足` });
  if (item.limit > 0) {
    if (!user.event_shop_purchases) user.event_shop_purchases = {};
    if ((user.event_shop_purchases[item.name] || 0) >= item.limit) return res.json({ error: `该商品限购 ${item.limit} 次` });
    user.event_shop_purchases[item.name] = (user.event_shop_purchases[item.name] || 0) + 1;
  }
  // 优先消耗活动专属币，不足时用通用活动币补齐
  var remaining = item.price;
  var eventDeduct = Math.min(remaining, eventBalance);
  user.event_currencies[curName] = eventBalance - eventDeduct;
  remaining -= eventDeduct;
  if (remaining > 0) {
    user.event_currencies['通用活动币'] = universalBalance - remaining;
  }
  if (item.name.startsWith('金币x')) { const amt = parseInt(item.name.replace('金币x', ''), 10) || 500; user.coins = (user.coins || 0) + amt; }
  else if (item.name.includes('称号')) { if (!(user.titles || []).includes(item.name)) user.titles.push(item.name); }
  else if (item.name === '转职证明') { addInv(user, '转职卡'); user._blindBoxResult = '转职卡'; }
  else if (item.name === '材料盲盒') {
    const matPool = ['磨刀石','金矿','银矿','银矿石','金矿石','铁矿','铜矿','铜矿石','磁铁矿','萤石','火山石','精炼铁矿','精炼铜矿','精炼银矿','大鳞片','兔脚','蜂蜜','软泥粘液','蜘蛛丝','骨头片','胡萝卜','煤炭','稻草','小毛贼耳朵','野猪獠牙','小偷的匕首','旧铁片','毒土豆','羊蛋子'];
    const picked = matPool[Math.floor(Math.random() * matPool.length)];
    addInv(user, picked);
    user._blindBoxResult = picked;
  }
  else if (item.name === '职业之魂盲盒') {
    const soulPool = ['铁匠之魂','渔夫之魂','农夫之魂','厨师之魂','药师之魂','矿工之魂'];
    const picked = soulPool[Math.floor(Math.random() * soulPool.length)];
    addInv(user, picked);
    user._blindBoxResult = picked;
  }
  else if (item.name === '职业材料盲盒') {
    const profPool = ['磁铁矿','萤石','火山石','精炼铁矿','精炼铜矿','精炼银矿','精炼金矿','好钢材','陨石','精炼煤炭'];
    const picked = profPool[Math.floor(Math.random() * profPool.length)];
    addInv(user, picked);
    user._blindBoxResult = picked;
  }
  else if (item.name === '高级职业盲盒') {
    const advPool = ['陨石','好钢材','精炼金矿','铁砧石','重铁块','水晶矿','地心石','淬火油','精钢鱼钩','山泉水'];
    const picked = advPool[Math.floor(Math.random() * advPool.length)];
    addInv(user, picked);
    user._blindBoxResult = picked;
  }
  // ☀️ 夏日活动专属商品
  else if (item.name === '🧊冰镇西瓜') {
    user.current_hp = (user.current_hp || 100) + Math.floor((getPlayerStats(user).hp || 100) * 0.5);
    user._blindBoxResult = '生命回复50%';
  }
  else if (item.name === '🥤冰霜汽水') {
    if(!user.food_buffs) user.food_buffs = [];
    const nowSec2 = Math.floor(Date.now()/1000);
    const maxBuffs = FOOD.max_active_buffs || 3;
    while (user.food_buffs.length + 2 > maxBuffs) user.food_buffs.shift();
    user.food_buffs.push({name:'冰霜汽水',stat:'speed',value:50,duration:7200,ate_at:nowSec2});
    user.food_buffs.push({name:'冰霜汽水',stat:'dodge',value:0.05,duration:7200,ate_at:nowSec2});
    user._blindBoxResult = '速度+50 闪避+5% (2小时)';
  }
  else if (item.name === '🩱泳装礼盒') {
    // Random Lv.50+ equipment rarity 3+
    var poolTypes = ['weapon','armor','helmet','boots','accessory'];
    var poolRarity = [3,3,4,4,999];
    var rar = poolRarity[rand(0,poolRarity.length-1)];
    var tp = poolTypes[rand(0,poolTypes.length-1)];
    var wname = '夏日' + {weapon:'水枪',armor:'泳衣',helmet:'遮阳帽',boots:'沙滩鞋',accessory:'贝壳项链'}[tp];
    var wstats = {attack:rand(60,120),defense:rand(60,120),speed:rand(80,150),attack_speed:rand(60,100),dodge:rand(60,100),hp:rand(100,200)};
    var wid = uid();
    var forge = loadForge(); if(!forge[user.id]) forge[user.id]=[];
    forge[user.id].push({id:wid,name:wname,type:tp,rarity:rar,rarity_name:(DUANZAO.rarity_names||{})[String(rar)]||'',stats:wstats,strengthen_count:0,max_sockets:3,sockets:[]});
    saveForge(forge);
    user._blindBoxResult = wname + ' (' + (DUANZAO.rarity_names||{})[String(rar)] + ')';
  }
  else if (item.name === '🏄冲浪板') {
    if(!user.perm_stats) user.perm_stats = {};
    user.perm_stats.speed = (user.perm_stats.speed||0) + 5;
    user._blindBoxResult = '永久速度+5！';
  }
  else if (item.name === '🔥烧烤大餐') {
    if(!user.food_buffs) user.food_buffs = [];
    var nowSec = Math.floor(Date.now()/1000);
    const maxBuffs2 = FOOD.max_active_buffs || 3;
    while (user.food_buffs.length >= maxBuffs2) user.food_buffs.shift();
    user.food_buffs.push({name:'烧烤大餐',stat:'all',value:200,duration:28800,ate_at:nowSec});
    user.current_hp = getPlayerStats(user).hp; // 回满
    user._blindBoxResult = '全属性+200 (8小时) + 满血';
  }
  else if (item.name === '🎆烟花礼盒') {
    var fwPool = ['特级强化石','觉醒强化石','宝石碎片','经验珠(大)'];
    var fwPick = fwPool[rand(0,fwPool.length-1)];
    var fwCnt = fwPick==='宝石碎片'?rand(3,6):(fwPick==='经验珠(大)'?2:1);
    for(var fi=0;fi<fwCnt;fi++) addInv(user, fwPick);
    user._blindBoxResult = fwPick + ' x' + fwCnt;
  }
  else if (item.name === '🌊深海宝箱') {
    var seaPool = ['深海珍珠','海神的三叉戟碎片','龙鱼','彩虹鳟鱼','古代金币','金币x500'];
    var seaPick = seaPool[rand(0,seaPool.length-1)];
    if(seaPick==='金币x500'){user.coins=(user.coins||0)+500;user._blindBoxResult='金币+500';}
    else if(seaPick==='古代金币'){var agc=rand(3,8);addInv(user,'古代金币',agc);user._blindBoxResult='古代金币x'+agc;}
    else {addInv(user,seaPick);user._blindBoxResult=seaPick;}
  }
  else if (item.name === '💎夏日宝石') {
    var gem = dropGemInRange(user, 3, 999);
    gem.value = Math.floor(gem.value * 1.5); // +50% stats
    user._blindBoxResult = gem.name + ' (' + gem.stat + '+' + gem.value + ')';
  }
  else if (item.name === '📦夏日材料包') {
    var smPool = ['椰子','水草','深海珍珠','火焰之心','寒冰核心','蜂蜜','魔法蘑菇','星之碎片','古代银币'];
    var smPick = smPool[rand(0,smPool.length-1)];
    var smCnt = smPick==='古代银币'?rand(3,8):rand(2,6);
    if(smPick==='古代银币'){user.coins=(user.coins||0)+rand(30,80)*smCnt;user._blindBoxResult='💰 +'+(rand(30,80)*smCnt);}
    else {addInv(user,smPick,smCnt);user._blindBoxResult=smPick+' x'+smCnt;}
  }
  else if (item.name === '⭐经验珠(大)') {
    addInv(user, '经验珠(大)');
    user._blindBoxResult = '经验珠(大) (获得500经验)';
  }
  else if (item.name === '💰夏日金币袋') {
    var gc = rand(300,800);
    user.coins = (user.coins||0) + gc;
    user._blindBoxResult = '金币 +' + gc;
  }
  else if (item.name === '☀️烈日之刃') {
    var forge = loadForge(); if(!forge[user.id]) forge[user.id]=[];
    var lv = user.level || 1;
    forge[user.id].push({
      id: uid(), name: '☀️烈日之刃', type: 'weapon', rarity: Math.min(9999,Math.floor(lv/30)+2), rarity_name: (DUANZAO.rarity_names||{})[String(Math.min(9999,Math.floor(lv/30)+2))]||'',
      level_scale: true, evolve_stage: 0,
      base_stats: {attack:3.5,defense:2,speed:2,attack_speed:2,dodge:2,hp:6},
      stats: {attack:Math.floor(lv*3.5),defense:lv*2,speed:lv*2,attack_speed:lv*2,dodge:lv*2,hp:lv*6},
      special_attrs: {fire_damage: 10+Math.floor(lv/5)},
      strengthen_count: 0, max_sockets: 3, sockets: [],
      is_event_limited: true, event_name: '炎夏狂欢'
    });
    saveForge(forge);
    user._blindBoxResult = '☀️烈日之刃 (攻击=等级×2, 可进化至×3.2)';
  }
  else if (item.name === '🌊潮汐之盾') {
    var forge = loadForge(); if(!forge[user.id]) forge[user.id]=[];
    var lv = user.level || 1;
    forge[user.id].push({
      id: uid(), name: '🌊潮汐之盾', type: 'armor', rarity: Math.min(9999,Math.floor(lv/30)+2), rarity_name: (DUANZAO.rarity_names||{})[String(Math.min(9999,Math.floor(lv/30)+2))]||'',
      level_scale: true, evolve_stage: 0,
      base_stats: {attack:2,defense:3.5,hp:7.5,speed:2,attack_speed:2,dodge:2},
      stats: {attack:lv*2,defense:Math.floor(lv*3.5),speed:lv*2,attack_speed:lv*2,dodge:lv*2,hp:Math.floor(lv*7.5)},
      special_attrs: {dmg_reduce: parseFloat(Math.min(0.15,0.03+lv*0.0004).toFixed(4))},
      strengthen_count: 0, max_sockets: 3, sockets: [],
      is_event_limited: true, event_name: '炎夏狂欢'
    });
    saveForge(forge);
    user._blindBoxResult = '🌊潮汐之盾 (防御=等级×2, 可进化至×3.2)';
  }
  else { addInv(user, item.name); }
  saveUser(req.userToken, user);
  const resultName = user._blindBoxResult || item.name;
  delete user._blindBoxResult;
  res.json({ purchased: item.name, price: item.price, remaining: user.event_currencies[curName], result: resultName });
});

// -- 世界BOSS --
app.get('/api/boss', authMiddleware, (req, res) => {
  const data = loadBossData();
  const cleaned = cleanDefeatedBosses(data);
  if (cleaned) saveBossData(data);
  const bosses = (data.active || []).map(b => ({
    id: b.id, name: b.name, rarity: b.rarity, hp: b.hp, max_hp: b.max_hp,
    attack: b.attack, defense: b.defense, speed: b.speed, atk_speed: b.atk_speed,
    min_level: b.min_level, rewards: b.rewards, desc: b.desc,
    participants: b.participants, last_attacks: b.last_attacks,
    is_alive: b.hp > 0,
  }));
  // 找到最近的击败时间用于冷却倒计时
  let latestDefeat = 0, latestCooldownHours = 20;
  for (const b of data.active) {
    if (b.defeated_at && b.defeated_at > latestDefeat) {
      latestDefeat = b.defeated_at;
      latestCooldownHours = b.cooldown_hours || 20;
    }
  }
  res.json({
    bosses,
    max_active: BOSS.max_active_bosses || 3,
    online_count: onlineUsers.size,
    config: { cooldown: BOSS.attack_cooldown_seconds || 45, min_damage: BOSS.participation_min_damage || 500 },
    recent_kills: data.recent_kills || [],
    defeated_at: latestDefeat,
    respawn_cooldown_hours: latestCooldownHours,
  });
});
app.post('/api/boss/attack', authMiddleware, withFileLock('boss', async (req, res) => {
  const user = loadUser(req.userToken);
  const data = loadBossData();
  cleanDefeatedBosses(data);
  // 查找目标BOSS
  const bossId = req.body.boss_id;
  let boss;
  if (bossId) {
    boss = data.active.find(b => b.id === bossId);
    if (!boss) return res.json({ error: 'BOSS不存在或已消失' });
  } else {
    // 向后兼容：攻击第一只存活的BOSS
    boss = data.active.find(b => b.hp > 0);
    if (!boss) return res.json({ error: '当前没有活跃的世界BOSS' });
  }
  if (boss.hp <= 0) return res.json({ error: '该BOSS已被击杀' });
  if ((user.level || 1) < (boss.min_level || 1)) return res.json({ error: `等级不足，需要 Lv.${boss.min_level}` });
  if (boss.rewards_distributed) return res.json({ error: '该BOSS奖励已发放' });
  const lastAttack = (boss.last_attacks || {})[user.id] || 0;
  const cooldown = (BOSS.attack_cooldown_seconds || 45) * 1000;
  if (now() - lastAttack < cooldown) return res.json({ error: `攻击冷却中，请等待 ${Math.ceil((cooldown - (now() - lastAttack)) / 1000)} 秒` });
  const stats = getPlayerStats(user);
  // BOSS伤害 = 随机基础 + 属性加成 - BOSS防御减免
  const wDiffBoss = 1.0;
  const bossBaseMin = Math.floor((BOSS.base_damage_min || 150) * (0.7 + wDiffBoss * 0.3));
  const bossBaseMax = Math.floor((BOSS.base_damage_max || 500) * (0.7 + wDiffBoss * 0.3));
  const baseRandom = rand(bossBaseMin, bossBaseMax);
  const statBonus = Math.floor(
    (stats.attack || 0) * 0.8 +
    (stats.speed || 0) * 0.4 +
    ((stats.attack_speed || 0) * 0.3)
  );
  // BOSS防御减免伤害（防御越高，玩家伤害越低）
  const bossDefReduction = 1 - calcDmgReduction(boss.defense || 0, (stats.attack || 0) * 1.0 + (stats.speed || 0) * 0.3 + (stats.attack_speed || 0) * 0.4);
  // 暴击：基于玩家暴击率，BOSS战暴击伤害1.5倍
  const critRoll = Math.random() < Math.min(0.35, ((stats.special_attrs || {}).crit_rate || 0.05)) ? 1.5 : 1;
  // 基础伤害 = 保底（不受BOSS防御减免影响），属性加成部分受减免
  const baseDmg = Math.floor(baseRandom * critRoll);
  const bonusAfterDef = Math.floor(statBonus * bossDefReduction * critRoll);
  const finalDmg = Math.min(baseDmg + bonusAfterDef, Math.floor(boss.max_hp * 0.1));
  // BOSS反击伤害（基于BOSS攻击力，只用于显示反馈）
  const bossCounter = Math.max(0, Math.floor(((boss.attack || 0) * 0.5) * (1 - calcDmgReduction(stats.defense || 0, boss.attack || 0))));
  boss.hp -= finalDmg;
  if (!boss.participants) boss.participants = [];
  const pIdx = boss.participants.findIndex(p => p.id === user.id);
  if (pIdx >= 0) boss.participants[pIdx].damage += finalDmg;
  else boss.participants.push({ id: user.id, username: user.username, damage: finalDmg });
  if (!boss.last_attacks) boss.last_attacks = {};
  boss.last_attacks[user.id] = now();
  // 每日任务追踪
  const questsCompleted = updateQuestProgress(user, 'defeat_boss', finalDmg);
  // 全局掉落（每击触发）
  const globalDrops = BOSS.global_drops || [];
  const playerDamage = (boss.participants.find(p => p.id === user.id) || {}).damage || 0;
  const globalDropResults = [];
  for (const gd of globalDrops) {
    if (playerDamage < (gd.min_participation || 0)) continue;
    if (Math.random() < (gd.chance || 0)) {
      const dropCount = Array.isArray(gd.count) ? rand(gd.count[0], gd.count[1]) : (gd.count || 1);
      if (gd.type === 'gem' && gd.gem_rarity) {
        const [minR, maxR] = gd.gem_rarity;
        for (let di = 0; di < dropCount; di++) {
          const gem = dropGemInRange(user, minR, maxR);
          globalDropResults.push({ name: gem.name, stat: gem.stat, value: gem.value, rarity: gem.rarity });
        }
      } else {
        addInv(user, gd.name, dropCount);
        globalDropResults.push({ name: gd.name, count: dropCount });
      }
    }
  }
  let killed = false;
  if (boss.hp <= 0) {
    boss.hp = 0; boss.defeated_at = now(); boss.rewards_distributed = true; killed = true;
    const minDmg = BOSS.participation_min_damage || 500;
    const rewards = boss.rewards || {};
    const eligible = boss.participants.filter(p => p.damage >= minDmg);
    let coinEach = 0, expEach = 0, itemDist = [];
    if (eligible.length > 0) {
      coinEach = Math.floor((rewards.coins || 0) / eligible.length);
      expEach = Math.floor((rewards.exp || 0) / eligible.length);
      // 物品平分：每人至少1个，总数不足时自动扩容
      itemDist = (rewards.items || []).map(item => {
        const cfgTotal = item.count || 1;
        const total = Math.max(cfgTotal, eligible.length); // 保证每人至少1个
        const base = Math.floor(total / eligible.length);
        const remainder = total - base * eligible.length;
        const bonusPlayers = new Set();
        if (remainder > 0) {
          const shuffled = [...eligible].sort(() => Math.random() - 0.5);
          for (let r = 0; r < remainder; r++) bonusPlayers.add(shuffled[r].id);
        }
        return { name: item.name, base, remainder, _bonusPlayers: bonusPlayers };
      });
      for (const p of eligible) {
        // 攻击者直接用 user 对象，避免后续 saveUser 覆盖
        const isAttacker = p.id === user.id;
        const pu = isAttacker ? user : loadUser(p.id);
        if (!pu) continue;
        pu.coins = (pu.coins || 0) + coinEach;
        addExp(pu, expEach);
        // 分配物品：保底 + 余数精确分配
        for (const d of itemDist) {
          let give = d.base;
          if (d.remainder > 0 && d._bonusPlayers && d._bonusPlayers.has(p.id)) give++;
          if (give > 0) addInv(pu, d.name, give);
        }
        // BOSS击杀额外掉落职业之魂（每人1-2个当前职业魂）
        if (pu.profession) {
          const soulMapBoss = { blacksmith:'铁匠之魂', fisherman:'渔夫之魂', farmer:'农夫之魂', chef:'厨师之魂', alchemist:'药师之魂', miner:'矿工之魂' };
          const sn = soulMapBoss[pu.profession];
          if (sn) {
            const soulCount = rand(1, 2);
            for (let s = 0; s < soulCount; s++) addInv(pu, sn, 1);
          }
        }
        // BOSS击杀宝石奖励
        const bossGemCfg = (rewards.gems || []);
        for (const gemEntry of bossGemCfg) {
          const gemCount = gemEntry.count || 1;
          for (let gi = 0; gi < gemCount; gi++) {
            dropGemInRange(pu, gemEntry.min_rarity || 1, gemEntry.max_rarity || 999);
          }
        }
        pu.boss_kills = (pu.boss_kills || 0) + 1;
        // 攻击者合并到 user 中，延迟到统一 saveUser；其他玩家立即保存
        if (!isAttacker) { saveUser(p.id, pu); checkTitleMilestones(pu); }
      }
      // 攻击者也记录里程碑
      if (eligible.some(p => p.id === user.id)) checkTitleMilestones(user);
    }
    // 记录最近击杀（含掉落详情，展示实际分配量）
    const dropSummary = itemDist.map(d => d.name + ' x' + (d.base * eligible.length + d.remainder));
    if (!data.recent_kills) data.recent_kills = [];
    data.recent_kills.unshift({
      name: boss.name, rarity: boss.rarity,
      players: boss.participants.length, eligible: eligible.length,
      coins_each: coinEach, exp_each: expEach, drops: dropSummary,
      date: new Date().toLocaleString('zh-CN'), ts: now()
    });
    if (data.recent_kills.length > 20) data.recent_kills.length = 20;
    io.emit('boss:killed', { boss_id: boss.id, boss: boss.name, participants: boss.participants.length });
  }
  saveBossData(data);
  saveUser(req.userToken, user);
  if (!killed) io.emit('boss:update', { boss_id: boss.id, name: boss.name, hp: boss.hp, max_hp: boss.max_hp, attacker: user.username, damage: finalDmg });
  res.json({ boss_id: boss.id, boss_name: boss.name, damage: finalDmg, boss_hp: boss.hp, boss_max_hp: boss.max_hp, boss_defense: boss.defense || 0, boss_counter: bossCounter, killed, quests_completed: questsCompleted, global_drops: globalDropResults });
}));

async function trySpawnBoss() {
  const lock = _acquireFileLock('boss');
  await lock.ready;
  try {
    const data = loadBossData();
    cleanDefeatedBosses(data);
    const maxActive = BOSS.max_active_bosses || 1;
    const aliveCount = getAliveBossCount(data);
    if (aliveCount >= maxActive) return;
    // 15%概率生成
    if (Math.random() > 0.15) return;
    // 构建候选池：排除处于冷却期的BOSS类型名
    const cooldownNames = new Set();
    for (const b of data.active) {
      if (b.hp <= 0 && b.defeated_at && (now() - b.defeated_at < (b.cooldown_hours || 12) * 3600000)) {
        cooldownNames.add(b.name);
      }
    }
    const candidates = (BOSS.bosses || []).filter(b => !cooldownNames.has(b.name));
    if (candidates.length === 0) return;
    const totalWeight = candidates.reduce((s, b) => s + (b.spawn_chance || 0.01), 0);
    if (totalWeight <= 0) return;
    const chosen = weightedPick(candidates, b => b.spawn_chance || 0.01);
    const bossHp = Math.floor(chosen.hp || 1000);
    const bossAtk = Math.floor(chosen.attack || 50);
    const bossDef = Math.floor(chosen.defense || 20);
    const bossSpd = Math.floor(chosen.speed || 10);
    const bossAspd = Math.floor(chosen.atk_speed || 8);
    const newBoss = { id: uid(), name: chosen.name, rarity: chosen.rarity || 3, hp: bossHp, max_hp: bossHp, attack: bossAtk, defense: bossDef,
      speed: bossSpd, atk_speed: bossAspd, min_level: chosen.min_level || 1, rewards: chosen.rewards,
      spawn_chance: chosen.spawn_chance, cooldown_hours: chosen.cooldown_hours || 12, desc: chosen.desc || '',
      participants: [], last_attacks: {}, spawned_at: now() };
    data.active.push(newBoss);
    saveBossData(data);
    io.emit('boss:spawn', { boss_id: newBoss.id, name: newBoss.name, hp: newBoss.hp, max_hp: newBoss.max_hp, desc: newBoss.desc });
  } finally { lock.release(); }
}

// -- 设置 --
app.post('/api/settings/sell-blacklist', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { categories } = req.body;
  if (!Array.isArray(categories)) return res.json({ error: '参数错误' });
  user.sell_blacklist = categories;
  saveUser(req.userToken, user);
  res.json({ success: true, categories });
});
// 物品级黑名单管理
app.post('/api/settings/item-blacklist', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { action, itemName } = req.body;  // action: 'add' | 'remove' | 'list' | 'clear'
  if (!user.item_blacklist) user.item_blacklist = [...(HEIMINGDAN.protected_items || [])];
  if (action === 'list') return res.json({ item_blacklist: user.item_blacklist });
  if (action === 'add' && itemName) {
    if (user.item_blacklist.includes(itemName)) return res.json({ error: '该物品已在黑名单中' });
    user.item_blacklist.push(itemName);
  } else if (action === 'remove' && itemName) {
    user.item_blacklist = user.item_blacklist.filter(n => n !== itemName);
  } else if (action === 'clear') {
    user.item_blacklist = [];
  } else {
    return res.json({ error: '参数错误，需要 action(add/remove/list/clear) 和 itemName' });
  }
  saveUser(req.userToken, user);
  res.json({ success: true, item_blacklist: user.item_blacklist });
});
app.post('/api/settings/auto-loli', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { auto_loli } = req.body;
  if (!['none','help','adopt'].includes(auto_loli)) return res.json({ error: '参数错误' });
  user.auto_loli = auto_loli;
  saveUser(req.userToken, user);
  res.json({ success: true, auto_loli });
});
app.post('/api/settings/auto-use-hp', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { auto_use_hp } = req.body;
  if (!['none','basic','small','medium','big','any'].includes(auto_use_hp)) return res.json({ error: '参数错误' });
  user.auto_use_hp = auto_use_hp;
  saveUser(req.userToken, user);
  res.json({ success: true, auto_use_hp });
});
app.post('/api/settings/choice-events', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  user.choice_events_enabled = !!req.body.enabled;
  if (req.body.auto_choice !== undefined) user.auto_choice_enabled = !!req.body.auto_choice;
  saveUser(req.userToken, user);
  res.json({ enabled: user.choice_events_enabled, auto_choice: user.auto_choice_enabled || false });
});
// 🗑️ 自动分解 / 📦 自动出售 / ⚡ 批量速览
app.post('/api/settings/optimize', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  if (req.body.auto_decompose !== undefined) user.auto_decompose_rarity = parseInt(req.body.auto_decompose) || 0;
  if (req.body.auto_sell_max !== undefined) user.auto_sell_max = parseInt(req.body.auto_sell_max) || 0;
  if (req.body.batch_collapse !== undefined) user.batch_collapse = !!req.body.batch_collapse;
  saveUser(req.userToken, user);
  res.json({ auto_decompose: user.auto_decompose_rarity||0, auto_sell_max: user.auto_sell_max||0, batch_collapse: user.batch_collapse||false });
});
app.post('/api/settings/tester', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  user.tester = !!req.body.enabled;
  saveUser(req.userToken, user);
  res.json({ tester: user.tester });
});
app.post('/api/settings/avatar', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { avatar, image } = req.body;
  // image 为 base64 图片数据
  if (image) {
    const base64Size = image.length;
    const rawSize = Math.floor(base64Size * 0.75); // base64 → 原始大小估算
    if (rawSize > 3 * 1024 * 1024) return res.json({ error: '图片大小不能超过3MB' });
    if (!image.startsWith('data:image/')) return res.json({ error: '仅支持图片格式' });
    user.avatar_img = image;
    user.avatar = '';
    saveUser(req.userToken, user);
    return res.json({ avatar_img: true });
  }
  // emoji 头像
  user.avatar = avatar && avatar.length <= 4 ? avatar : '';
  if (user.avatar) user.avatar_img = '';
  saveUser(req.userToken, user);
  res.json({ avatar: user.avatar || null, avatar_img: !!user.avatar_img });
});
app.post('/api/rename-self', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { newName, cardName } = req.body;
  if (!newName || newName.trim().length < 1 || newName.trim().length > 12) return res.json({ error: '名字1-12个字符' });
  // 需要改名卡（前端 UI 或直接调用时传入 cardName 自动消耗）
  const renameCard = cardName || '玩家改名卡';
  if (!hasInv(user, renameCard, 1)) return res.json({ error: `背包中没有 ${renameCard}，无法改名` });
  const oldName = user.username;
  // 检查重名
  if (findUserByUsername(newName.trim())) return res.json({ error: '该名字已被使用' });
  remInv(user, renameCard, 1);
  user.username = newName.trim();
  saveUser(req.userToken, user);
  res.json({ old_name: oldName, new_name: user.username });
});

app.post('/api/rename-weapon', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { weaponId, newName, cardName } = req.body;
  if (!newName || newName.trim().length < 1 || newName.trim().length > 12) return res.json({ error: '名字1-12个字符' });
  // 需要武器改名卡
  const renameCard = cardName || '武器改名卡';
  if (!hasInv(user, renameCard, 1)) return res.json({ error: `背包中没有 ${renameCard}，无法改名` });
  const forge = loadForge();
  const weapons = forge[user.id] || [];
  const w = weapons.find(w => w.id === weaponId || w.name === weaponId);
  if (!w) return res.json({ error: '未找到该武器' });
  remInv(user, renameCard, 1);
  const oldName = w.name;
  w.name = newName.trim();
  saveForge(forge);
  saveUser(req.userToken, user);
  res.json({ old_name: oldName, new_name: w.name });
});


// ===================== 季节节气 API =====================
app.get('/api/season', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const state = getSeasonState();
  // 检查今天节气活动是否已领取
  const term = getCurrentSolarTerm();
  let activity_done = false;
  if (term) {
    const gd2 = gameDate(); const key = 'solar_' + term.name + '_' + (term.month) + '_' + (term.day) + '_' + (gd2.gameYear || 0);
    activity_done = (user.solar_terms_collected || []).includes(key);
  }
  res.json({ ...state, activity_done, ruins_explored: user.ruins_explored || {}, all_terms: SEASON_CFG.solar_terms || [] });
});
app.post('/api/season/activity', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const result = doSolarTermActivity(user);
  if (!result) return res.json({ error: '当前没有节气活动' });
  saveUser(req.userToken, user);
  checkTitleMilestones(user);
  res.json(result);
});
// 合并季节信息到通用数据中（已有refresh接口，在前端合并）

// ===================== 废墟探险 API =====================
app.get('/api/ruins', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const ruins_list = (RUINS_CFG.ruins || []).map(r => ({
    id: r.id, name: r.name, min_level: r.min_level, ticket: r.ticket || '废墟探索卷轴',
    max_steps: r.max_steps || 10, desc: r.desc,
    room_count: r.procedural_layout ? '5~10' : (r.rooms || []).length,
    procedural: !!r.procedural_layout
  }));
  // 如果用户在废墟中，返回当前房间完整数据
  let current_room_data = null;
  if (user.ruins_current) {
    const ruinsRooms = getRuinsRooms(user.ruins_current);
    const room = ruinsRooms.find(r => r.id === user.ruins_current.current_room);
    if (room) {
      // 🎲 过滤：只显示通往已出现房间的出口
      const spawnedSet = new Set(user.ruins_current.spawned_rooms || []);
      const filteredExits = []; const filteredExitsDesc = [];
      for (let ei = 0; ei < (room.exits || []).length; ei++) {
        if (spawnedSet.has(room.exits[ei])) {
          filteredExits.push(room.exits[ei]);
          filteredExitsDesc.push((room.exits_desc || [])[ei] || '出口');
        }
      }
      current_room_data = {
        id: room.id, name: room.name, desc: room.desc,
        exits: filteredExits, exits_desc: filteredExitsDesc,
        is_exit: !!room.is_exit,
        monster: room.monster ? { name: room.monster.name, rarity: room.monster.rarity } : null,
        chest: room.chest ? { name: room.chest.name } : null
      };
    }
  }
  // 🗺️ 房间总览：当前废墟所有房间及探索状态
  let room_overview = null;
  if (user.ruins_current) {
    const allRooms = getRuinsRooms(user.ruins_current);
    const spawnedSet = new Set(user.ruins_current.spawned_rooms || []);
    const visitedSet = new Set(user.ruins_current.visited_rooms || []);
    const defeatedSet = new Set(user.ruins_current.defeated_monsters || []);
    const chestsSet = new Set(user.ruins_current.opened_chests || []);
    room_overview = allRooms.map(rm => ({
      id: rm.id, name: rm.name, spawned: spawnedSet.has(rm.id),
      visited: visitedSet.has(rm.id), is_current: rm.id === user.ruins_current.current_room,
      has_monster: !!rm.monster, monster_defeated: defeatedSet.has(rm.id),
      has_chest: !!rm.chest, chest_opened: chestsSet.has(rm.id),
      is_exit: !!rm.is_exit
    }));
  }
  res.json({
    ruins_list,
    generic_ticket: RUINS_CFG.generic_ticket || '废墟探索卷轴',
    ruins_explored: user.ruins_explored || {},
    room_overview: room_overview,
    current: user.ruins_current ? {
      ruins_id: user.ruins_current.ruins_id,
      current_room: user.ruins_current.current_room,
      steps_taken: user.ruins_current.steps_taken || 0,
      max_steps: user.ruins_current.max_steps || 10,
      visited_count: (user.ruins_current.visited_rooms || []).length,
      room_events: user.ruins_current.room_events || [],
      defeated_monsters: user.ruins_current.defeated_monsters || [],
      explored_rooms: user.ruins_current.explored_rooms || [],
      opened_chests: user.ruins_current.opened_chests || []
    } : null,
    current_room: current_room_data,
    rest_hp_gain: RUINS_CFG.rest_hp_gain || 0.15
  });
});
app.post('/api/ruins/enter', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { ruinsId } = req.body;
  if (user.ruins_current) return res.json({ error: '已经在废墟中，请先退出当前探索' });
  const result = enterRuins(user, ruinsId);
  if (result.error) return res.json(result);
  saveUser(req.userToken, user);
  res.json(result);
});
app.post('/api/ruins/move', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { exitIndex } = req.body;
  if (exitIndex === undefined) return res.json({ error: '请指定出口' });
  const result = moveInRuins(user, exitIndex);
  if (result.error) return res.json(result);
  saveUser(req.userToken, user);
  res.json(result);
});
app.post('/api/ruins/search', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const result = searchInRuins(user);
  if (result.error) return res.json(result);
  saveUser(req.userToken, user);
  res.json(result);
});
app.post('/api/ruins/pickup', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { items } = req.body;
  const result = pickUpRuinsItems(user, items || []);
  saveUser(req.userToken, user);
  res.json(result);
});
app.post('/api/ruins/fight', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const result = fightInRuins(user);
  if (result.error) return res.json(result);
  saveUser(req.userToken, user);
  checkTitleMilestones(user);
  res.json(result);
});
app.post('/api/ruins/chest', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const result = openChestInRuins(user);
  if (result.error) return res.json(result);
  saveUser(req.userToken, user);
  res.json(result);
});
app.post('/api/ruins/rest', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const result = restInRuins(user);
  if (result.error) return res.json(result);
  saveUser(req.userToken, user);
  res.json(result);
});
app.post('/api/ruins/exit', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const result = exitRuins(user);
  if (result.error) return res.json(result);
  saveUser(req.userToken, user);
  res.json(result);
});

// -- 反馈栏 --
const FEEDBACK_FILE = path.join(DATA_DIR, 'feedback.json');
const FEEDBACK_MAX_AGE = 3 * 24 * 60 * 60 * 1000; // 3天
const FEEDBACK_IMAGE_MAX = 700000; // base64图片最大长度 (~512KB原始)

function loadFeedback() {
  try { return JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf-8')); }
  catch(e) { return []; }
}
function saveFeedback(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(data), 'utf-8');
}
function cleanFeedback(data) {
  const cutoff = now() - FEEDBACK_MAX_AGE;
  return data.filter(f => (f.created_at || 0) >= cutoff);
}

// 获取反馈（公开，清理过期）
app.get('/api/feedback', (req, res) => {
  let fb = loadFeedback();
  fb = cleanFeedback(fb);
  if (fb.length < (loadFeedback().length)) saveFeedback(fb);
  res.json(fb);
});

// 提交反馈（需登录）
app.post('/api/feedback', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { text, image } = req.body;
  const txt = (text || '').trim();
  const img = (image || '').trim();
  if (!txt && !img) return res.json({ error: '至少填写文字或上传图片' });
  if (txt.length > 1000) return res.json({ error: '文字不能超过1000字' });
  if (img && img.length > FEEDBACK_IMAGE_MAX) return res.json({ error: '图片过大，请压缩后重试' });
  if (img && !img.startsWith('data:image/')) return res.json({ error: '图片格式不支持，请上传jpg/png/gif' });
  let fb = loadFeedback();
  fb = cleanFeedback(fb);
  fb.push({ id: uid(), username: user.username || '?', text: txt, image: img || null, created_at: now() });
  saveFeedback(fb);
  res.json({ success: true, count: fb.length });
});

// -- 好友系统 --
app.get('/api/friends', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const friends = user.friends || [];
  const requests = user.friend_requests || [];
  const all = allUsers();
  // Build online token set from onlineUsers Map
  const onlineSet = new Set();
  for (const [token, sockets] of onlineUsers) { if (sockets.size > 0) onlineSet.add(token); }
  // Map token→user for online check
  const tokenToUser = new Map();
  for (const u of all) { tokenToUser.set(u.id, u); }
  const friendList = friends.map(fid => {
    const f = all.find(u => u.id === fid);
    // Check online by finding this user's token in onlineUsers
    var isOnline = false;
    for (const [token, sockets] of onlineUsers) {
      var tu = tokenToUser.get(token);
      if (tu && tu.id === fid && sockets.size > 0) { isOnline = true; break; }
    }
    return f ? { id: f.id, username: f.username, level: f.level || 1, online: isOnline, title: f.equipped_title || '' } : { id: fid, username: '未知玩家', level: 1, online: false, title: '' };
  });
  const reqList = requests.map(fid => {
    const f = all.find(u => u.id === fid);
    return f ? { id: f.id, username: f.username, level: f.level || 1 } : { id: fid, username: '未知玩家', level: 1 };
  });
  var onlinePlayers = [];
  for (const [token, sockets] of onlineUsers) {
    if(sockets.size > 0){ var tu = tokenToUser.get(token); if(tu) onlinePlayers.push(tu.username); }
  }
  res.json({ friends: friendList, requests: reqList, max_friends: 50, online_players: onlinePlayers });
});

app.post('/api/friends/add', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { username } = req.body;
  if (!username) return res.json({ error: '请输入玩家名称' });
  if (username === user.username) return res.json({ error: '不能添加自己为好友' });
  const all = allUsers();
  const target = all.find(u => u.username === username);
  if (!target) return res.json({ error: '未找到该玩家' });
  if ((user.friends || []).includes(target.id)) return res.json({ error: '已经是好友了' });
  if ((user.friends || []).length >= 50) return res.json({ error: '好友已满（最多50人）' });
  if ((user.friend_requests || []).includes(target.id)) return res.json({ error: '已发送过好友请求' });
  // 如果对方已经向你发了好友请求，直接成为好友
  if ((target.friend_requests || []).includes(user.id)) {
    target.friend_requests = (target.friend_requests || []).filter(id => id !== user.id);
    if (!target.friends) target.friends = [];
    target.friends.push(user.id);
    if (!user.friends) user.friends = [];
    user.friends.push(target.id);
    saveUser(req.userToken, user);
    saveUserByObj(target);
    return res.json({ success: true, auto: true, username: target.username });
  }
  if (!target.friend_requests) target.friend_requests = [];
  target.friend_requests.push(user.id);
  saveUser(req.userToken, user);
  saveUserByObj(target);
  res.json({ success: true, sent: true, username: target.username });
});

app.post('/api/friends/accept', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { userId } = req.body;
  if (!userId) return res.json({ error: '请指定玩家' });
  const idx = (user.friend_requests || []).indexOf(userId);
  if (idx < 0) return res.json({ error: '没有该好友请求' });
  user.friend_requests.splice(idx, 1);
  if (!user.friends) user.friends = [];
  user.friends.push(userId);
  const all = allUsers();
  const target = all.find(u => u.id === userId);
  if (target) {
    if (!target.friends) target.friends = [];
    if (!target.friends.includes(user.id)) target.friends.push(user.id);
    saveUserByObj(target);
  }
  saveUser(req.userToken, user);
  res.json({ success: true, username: target ? target.username : '未知' });
});

app.post('/api/friends/decline', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { userId } = req.body;
  if (!userId) return res.json({ error: '请指定玩家' });
  user.friend_requests = (user.friend_requests || []).filter(id => id !== userId);
  saveUser(req.userToken, user);
  res.json({ success: true });
});

app.post('/api/friends/remove', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { userId } = req.body;
  if (!userId) return res.json({ error: '请指定玩家' });
  user.friends = (user.friends || []).filter(id => id !== userId);
  const all = allUsers();
  const target = all.find(u => u.id === userId);
  if (target) {
    target.friends = (target.friends || []).filter(id => id !== user.id);
    saveUserByObj(target);
  }
  saveUser(req.userToken, user);
  res.json({ success: true });
});

// -- 排行榜 --
app.get('/api/leaderboard', (req, res) => {
  const users = allUsers();
  // 收集在线用户的 token set
  const onlineTokens = new Set();
  for (const [token, sockets] of onlineUsers) { if (sockets.size > 0) onlineTokens.add(token); }
  const profNames = {};
  for (const p of (PROFESSIONS.professions || [])) profNames[p.id] = p.icon + ' ' + p.name;
  const byLevel = users.sort((a, b) => (b.level || 1) - (a.level || 1)).slice(0, 20).map(u => ({
    id: u.id, username: u.username, level: u.level, coins: u.coins, title: u.equipped_title, avatar: u.avatar || null, has_avatar_img: !!u.avatar_img,
    profession: u.profession ? (profNames[u.profession] || u.profession) : null,
    profession_level: u.profession_level || 0,
    online: onlineTokens.has(u.id)
  }));
  const byCoins = [...users].sort((a, b) => (b.coins || 0) - (a.coins || 0)).slice(0, 20).map(u => ({
    id: u.id, username: u.username, coins: u.coins, level: u.level, avatar: u.avatar || null, has_avatar_img: !!u.avatar_img,
    profession: u.profession ? (profNames[u.profession] || u.profession) : null,
    online: onlineTokens.has(u.id)
  }));
  const top5Avg = users.sort((a, b) => (b.level || 1) - (a.level || 1)).slice(0, 5).reduce((s, u) => s + (u.level || 1), 0) / Math.max(1, Math.min(5, users.length));
  res.json({ by_level: byLevel, by_coins: byCoins, total_players: users.length, top5_avg_level: Math.round(top5Avg) });
});

// ===================== Socket.IO =====================
// 按 token 追踪已登录用户（去重多标签页）
const onlineUsers = new Map(); // token → Set<socketId>
const CHAT_FILE = path.join(DATA_DIR, 'chat_history.json');
let chatHistory = loadChatHistory(); // 世界聊天记录

function loadChatHistory() {
  try { if (fs.existsSync(CHAT_FILE)) return JSON.parse(fs.readFileSync(CHAT_FILE, 'utf-8')); } catch (e) {}
  return [];
}
function saveChatHistory() {
  try { fs.writeFileSync(CHAT_FILE, JSON.stringify(chatHistory.slice(-50)), 'utf-8'); } catch (e) {}
}
// 启动时清理过期消息
(function cleanupOldChat() {
  const cutoff = Date.now() - 172800000;
  chatHistory = chatHistory.filter(m => m.created_at >= cutoff);
  saveChatHistory();
})();
// -- 稻草人训练假人 --
app.post('/api/train/dummy', authMiddleware, (req, res) => {
  const user = loadUser(req.userToken);
  const { hp, attack, defense, speed, atk_speed, rounds } = req.body;
  const dummy = {
    hp: parseInt(hp, 10) || 1000,
    max_hp: parseInt(hp, 10) || 1000,
    attack: parseInt(attack, 10) || 100,
    defense: parseInt(defense, 10) || 100,
    speed: parseInt(speed, 10) || 50,
    atk_speed: parseInt(atk_speed, 10) || 50,
    special: ''
  };
  const maxRounds = Math.min(rounds || 10, 50);
  const stats = getPlayerStats(user);
  const ws = stats.special_attrs || {};
  const pAtk = stats.attack, pSpd = stats.speed, pAspd = stats.atk_speed, pDef = stats.defense;
  const wCritRate = ws.crit_rate || 0, wCritDmg = ws.crit_dmg || 0, wLifesteal = ws.lifesteal || 0;
  const wExtraAtk = ws.extra_atk || 0, wFireDamage = ws.fire_damage || 0;

  let dmgTotal = 0, crits = 0, extraHits = 0, fireTotal = 0, hits = 0;
  for (let r = 0; r < maxRounds; r++) {
    let attacks = 1 + calcExtraTurns(pAspd, dummy.atk_speed || 1);
    if (wExtraAtk > 0 && Math.random() < wExtraAtk) { attacks++; extraHits++; }
    for (let a = 0; a < attacks; a++) {
      const baseDmg = calcDamage(pAtk, dummy.defense);
      const pCrit = 0.05 + Math.max(0, (pSpd - dummy.speed) * 0.005) + wCritRate;
      const crit = Math.random() < pCrit;
      let dmg = baseDmg;
      if (crit) { dmg = Math.floor(dmg * (1.5 + wCritDmg)); crits++; }
      if (wFireDamage > 0) { dmg += wFireDamage; fireTotal += wFireDamage; }
      dmg = Math.floor(dmg);
      dmgTotal += dmg;
      hits++;
    }
  }
  const avgDmg = hits > 0 ? Math.floor(dmgTotal / hits) : 0;
  const dps = maxRounds > 0 ? Math.floor(dmgTotal / maxRounds) : 0;
  res.json({
    dummy: { hp: dummy.max_hp, attack: dummy.attack, defense: dummy.defense, speed: dummy.speed, atk_speed: dummy.atk_speed },
    player: { attack: pAtk, speed: pSpd, atk_speed: pAspd, crit_rate: Math.round(wCritRate * 100), crit_dmg: Math.round(wCritDmg * 100), extra_atk: Math.round(wExtraAtk * 100), fire_damage: wFireDamage },
    result: { rounds: maxRounds, hits, total_dmg: dmgTotal, avg_dmg: avgDmg, dps, crits, extra_hits: extraHits, fire_total: fireTotal }
  });
});

function emitOnlineCount() {
  io.emit('players:online', { count: onlineUsers.size });
}

io.on('connection', (socket) => {
  console.log('🔌 新连接:', socket.id, 'transport:', socket.conn.transport.name, 'origin:', socket.handshake.headers.origin || '?');
  socket.on('user:login', (data) => {
    const token = (data && data.token) ? data.token : null;
    if (!token) return;
    if (!onlineUsers.has(token)) onlineUsers.set(token, new Set());
    onlineUsers.get(token).add(socket.id);
    // 记录认证用户名，防止聊天消息伪造
    socket.authUsername = (data && data.username) || '';
    console.log('👤 用户上线:', (data && data.username) || token.substring(0,8), '在线总数:', onlineUsers.size);
    // 发送最近聊天记录
    socket.emit('chat:history', chatHistory.slice(-30));
    emitOnlineCount();
  });
  socket.on('disconnect', () => {
    // 从所有 token 中移除此 socket
    for (const [token, sockets] of onlineUsers) {
      sockets.delete(socket.id);
      if (sockets.size === 0) onlineUsers.delete(token);
    }
    emitOnlineCount();
  });
  // 世界聊天
  socket.on('chat:message', (data) => {
    const msg = (data && data.text || '').trim();
    if (!msg || msg.length > 200) return;
    // 服务端安全清洗：移除 < > 等HTML标签字符，防止XSS
    const sanitized = msg.replace(/</g,'＜').replace(/>/g,'＞').replace(/&(?!#?\w+;)/g,'＆');
    // 使用认证用户名，防止伪造
    const username = (socket.authUsername || '?').substring(0, 12);
    const chatMsg = { user: username, text: sanitized, time: new Date().toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'}), created_at: Date.now() };
    chatHistory.push(chatMsg);
    if (chatHistory.length > 50) chatHistory.shift();
    saveChatHistory();
    io.emit('chat:message', chatMsg);
  });
});

// ===================== 全局错误处理 =====================
app.use((err, req, res, next) => {
  console.error('API错误 [' + req.method + ' ' + req.path + ']:', err.message || err);
  res.status(500).json({ error: '服务器内部错误: ' + (err.message || '未知错误') });
});

// -- 进程级错误捕获：防止未处理异常导致整个服务崩溃 --
process.on('uncaughtException', (err) => {
  console.error('💥 未捕获异常 (uncaughtException):', err.message);
  console.error(err.stack);
  // 记录到文件便于事后排查
  try { fs.appendFileSync(path.join(__dirname, '..', 'crash.log'), new Date().toISOString() + ' uncaughtException: ' + err.message + '\n' + err.stack + '\n\n'); } catch(_){}
});
process.on('unhandledRejection', (reason) => {
  console.error('💥 未处理的Promise拒绝 (unhandledRejection):', reason);
  try { fs.appendFileSync(path.join(__dirname, '..', 'crash.log'), new Date().toISOString() + ' unhandledRejection: ' + (reason&&reason.stack||reason) + '\n\n'); } catch(_){}
});
// 优雅退出
process.on('SIGTERM', () => { console.log('🛑 收到SIGTERM信号，正在退出...'); saveChatHistory(); process.exit(0); });
process.on('SIGINT',  () => { console.log('🛑 收到SIGINT信号，正在退出...');  saveChatHistory(); process.exit(0); });

// ===================== 启动 =====================

// -- 数据备份：每3小时备份一次 data 目录为 zip --
const AdmZip = require('adm-zip');
const BACKUP_DIR = path.join(__dirname, '..', 'backups');
function backupData() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const zipPath = path.join(BACKUP_DIR, 'data-' + ts + '.zip');
    const zip = new AdmZip();
    // 添加 users 目录
    const usersSrc = path.join(DATA_DIR, 'users');
    if (fs.existsSync(usersSrc)) zip.addLocalFolder(usersSrc, 'users');
    // 添加根级数据文件
    for (const f of ['market.json', 'market_history.json', 'boss.json', 'forge.json', 'chat_history.json', 'feedback.json']) {
      const src = path.join(DATA_DIR, f);
      if (fs.existsSync(src)) zip.addLocalFile(src);
    }
    zip.writeZip(zipPath);
    // 清理旧备份（只保留最近7天）
    const now = Date.now();
    const maxAge = 3 * 24 * 3600 * 1000;
    for (const f of fs.readdirSync(BACKUP_DIR)) {
      const fp = path.join(BACKUP_DIR, f);
      if (f.startsWith('data-') && now - fs.statSync(fp).mtimeMs > maxAge) {
        fs.rmSync(fp, { force: true });
      }
    }
    console.log('📦 数据已备份 →', zipPath);
  } catch (e) { console.error('备份失败:', e.message); }
}
setInterval(backupData, 3 * 3600 * 1000); // 每3小时
backupData(); // 启动时也备份一次
cleanExpiredBids(); // 启动时清理过期求购

setInterval(() => { try { trySpawnBoss(); } catch (e) { console.error('BOSS生成检查失败:', e.message); } }, 600000); // 每10分钟检查
// 每小时清理一次过期聊天记录（保留2天）
setInterval(() => { try { cleanExpiredBids(); } catch (e) { console.error('过期求购清理失败:', e.message); } }, 3600000); // 每小时检查过期求购
setInterval(() => {
  const cutoff = Date.now() - 172800000;
  const before = chatHistory.length;
  chatHistory = chatHistory.filter(m => m.created_at >= cutoff);
  if (chatHistory.length !== before) saveChatHistory();
}, 3600000);

const PORT = process.env.PORT || 3456;
server.listen(PORT, () => {
  const displayUrl = CANONICAL_HOST ? `http://${CANONICAL_HOST}` : `http://localhost:${PORT}`;
  if (CANONICAL_HOST) {
    console.log(`🔗 规范域名模式：所有非 ${CANONICAL_HOST} 的请求将被重定向`);
  }
  console.log(`禾禾小冒险 Web 服务器已启动 → ${displayUrl}`);
  // 验证配置加载
  console.log('系统商城池:', (SHOP.pool || []).length, '件');
  const matPool = (SHOP.material_shop || {}).pool || [];
  console.log('材料商店池:', matPool.length, '件 (每日随机'+(SHOP.material_shop?.daily_count||10)+'件)');
  if (matPool.length === 0) console.warn('⚠️ 材料商店池为空，请检查 server/config/economy/shangcheng.json');
});
