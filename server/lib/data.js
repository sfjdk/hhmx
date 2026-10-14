/**
 * 禾禾小冒险 Web - 数据持久化模块
 *
 * 从 server/index.js 提取的所有文件 I/O 操作。
 * 外部依赖通过 setter 注入（ensureInvCounts, ensureHp, bossConfig）。
 */
const path = require('path');
const fs = require('fs');

// ===================== 数据路径常量 =====================
const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_DIR = path.join(DATA_DIR, 'users');
const MARKET_FILE = path.join(DATA_DIR, 'market.json');
const MARKET_HISTORY_FILE = path.join(DATA_DIR, 'market_history.json');
const BOSS_FILE = path.join(DATA_DIR, 'boss.json');
const FORGE_FILE = path.join(DATA_DIR, 'forge.json');
const CHAT_FILE = path.join(DATA_DIR, 'chat_history.json');

// ===================== 外部依赖注入 =====================
// 由主应用在启动后注入，避免循环依赖
let _ensureInvCounts = u => u;
let _ensureHp = u => u;
let _BOSS = {};

function setEnsureInvCounts(fn) { _ensureInvCounts = fn; }
function setEnsureHp(fn) { _ensureHp = fn; }
function setBossConfig(config) { _BOSS = config; }

function now() { return Date.now(); }

// ===================== 文件锁（防止并发读写竞争） =====================
// 基于 Promise 链的互斥锁，确保同一资源（用户文件/市场/BOSS）不会同时被多个请求读写
const _fileLocks = {};
function _acquireFileLock(key) {
  if (!_fileLocks[key]) _fileLocks[key] = Promise.resolve();
  let release;
  const prev = _fileLocks[key];
  _fileLocks[key] = new Promise(res => { release = res; });
  return { ready: prev, release };
}

// 用文件锁包装路由处理函数，自动在 handler 执行期间持有锁
function withFileLock(lockKey, handler) {
  return async (req, res) => {
    const lock = _acquireFileLock(lockKey);
    await lock.ready;
    try { await handler(req, res); } finally { lock.release(); }
  };
}

// ===================== 用户验证与路径 =====================
function isValidToken(token) {
  return typeof token === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(token) && !token.includes('..');
}
function userPath(token) {
  if (!isValidToken(token)) throw new Error('Invalid token');
  return path.join(USERS_DIR, token + '.json');
}
function userExists(token) {
  if (!isValidToken(token)) return false;
  return fs.existsSync(userPath(token));
}

// ===================== 用户数据加载/保存 =====================
function loadUser(token) {
  try {
    const u = JSON.parse(fs.readFileSync(userPath(token), 'utf-8'));
    _ensureInvCounts(u);
    return u;
  } catch (e) {
    console.log('⚠️ loadUser 失败:', token, e.message);
    return null;
  }
}

function saveUser(token, data) {
  if (!fs.existsSync(USERS_DIR)) fs.mkdirSync(USERS_DIR, { recursive: true });
  // 在保存前确保HP已初始化
  _ensureHp(data);
  fs.writeFileSync(userPath(token), JSON.stringify(data, null, 2), 'utf-8');
}

function saveUserByObj(userObj) {
  if (!userObj || !userObj.username) return;
  const ft = findUserToken(userObj.username);
  if (ft) saveUser(ft.token, userObj);
}

// ===================== 用户搜索 =====================
function allUsers() {
  if (!fs.existsSync(USERS_DIR)) return [];
  return fs.readdirSync(USERS_DIR).filter(f => f.endsWith('.json')).map(f => {
    try {
      const u = JSON.parse(fs.readFileSync(path.join(USERS_DIR, f), 'utf-8'));
      _ensureInvCounts(u);
      return u;
    } catch (e) {
      return null;
    }
  }).filter(Boolean);
}

function findUserByUsername(username) {
  if (!fs.existsSync(USERS_DIR)) return null;
  const files = fs.readdirSync(USERS_DIR).filter(f => f.endsWith('.json'));
  for (const f of files) {
    try {
      const u = JSON.parse(fs.readFileSync(path.join(USERS_DIR, f), 'utf-8'));
      _ensureInvCounts(u); // 迁移旧格式背包
      if (u.username === username) return u;
    } catch (e) { /* 跳过损坏的用户文件 */ }
  }
  return null;
}

function findUserToken(username) {
  if (!fs.existsSync(USERS_DIR)) return null;
  for (const f of fs.readdirSync(USERS_DIR).filter(f => f.endsWith('.json'))) {
    try {
      const u = JSON.parse(fs.readFileSync(path.join(USERS_DIR, f), 'utf-8'));
      _ensureInvCounts(u); // 迁移旧格式背包
      if (u.username === username) return { token: f.replace('.json', ''), user: u };
    } catch (e) { /* 跳过损坏的用户文件 */ }
  }
  return null;
}

// ===================== 全球市场 =====================
function loadMarket() {
  try { return JSON.parse(fs.readFileSync(MARKET_FILE, 'utf-8')); } catch (e) { return []; }
}
function saveMarket(m) {
  fs.writeFileSync(MARKET_FILE, JSON.stringify(m, null, 2));
}
function loadMarketHistory() {
  try { return JSON.parse(fs.readFileSync(MARKET_HISTORY_FILE, 'utf-8')); } catch (e) { return []; }
}
function saveMarketHistory(h) {
  fs.writeFileSync(MARKET_HISTORY_FILE, JSON.stringify(h, null, 2));
}

// ===================== 锻造数据 =====================
function loadForge() {
  try { return JSON.parse(fs.readFileSync(FORGE_FILE, 'utf-8')); } catch (e) { return {}; }
}
function saveForge(f) {
  fs.writeFileSync(FORGE_FILE, JSON.stringify(f, null, 2));
}

// ===================== BOSS 数据 =====================
function loadBossData() {
  let raw;
  try { raw = JSON.parse(fs.readFileSync(BOSS_FILE, 'utf-8')); } catch (e) { return { active: [], recent_kills: [] }; }
  if (!raw || typeof raw !== 'object') return { active: [], recent_kills: [] };
  // 旧格式迁移：单个BOSS对象 → { active: [...], recent_kills: [...] }
  if (!('active' in raw) && 'name' in raw && 'hp' in raw) {
    const recent_kills = raw.recent_kills || [];
    delete raw.recent_kills;
    const migrated = { active: [raw], recent_kills };
    saveBossData(migrated);
    return migrated;
  }
  if (!raw.active) raw.active = [];
  if (!raw.recent_kills) raw.recent_kills = [];
  // 清理：确保单个boss对象上没有recent_kills
  for (const b of raw.active) {
    if (b.recent_kills) delete b.recent_kills;
  }
  return raw;
}
function saveBossData(b) {
  fs.writeFileSync(BOSS_FILE, JSON.stringify(b, null, 2));
}
function cleanDefeatedBosses(data) {
  // 移除冷却已过期的已击败BOSS
  const maxActive = _BOSS.max_active_bosses || 1;
  // 保留最近的已击败BOSS（用于冷却检查），但最多保留maxActive*2个
  const alive = data.active.filter(b => b.hp > 0);
  const defeated = data.active.filter(b => b.hp <= 0 && b.defeated_at);
  const fresh = defeated.filter(b => now() - b.defeated_at < (b.cooldown_hours || 12) * 3600000);
  const stale = defeated.filter(b => now() - b.defeated_at >= (b.cooldown_hours || 12) * 3600000);
  // 保留存活 + 冷却中的已击败 + 最近2个过期（用于历史显示）
  const keepStale = stale.slice(-2);
  const newActive = [...alive, ...fresh, ...keepStale];
  const changed = newActive.length !== data.active.length;
  data.active = newActive;
  return changed;
}
function getAliveBossCount(data) {
  return data.active.filter(b => b.hp > 0).length;
}

// ===================== 聊天历史 =====================
function loadChatHistory() {
  try {
    if (fs.existsSync(CHAT_FILE)) return JSON.parse(fs.readFileSync(CHAT_FILE, 'utf-8'));
  } catch (e) {}
  return [];
}
function saveChatHistory(chatHistory) {
  try { fs.writeFileSync(CHAT_FILE, JSON.stringify(chatHistory.slice(-50)), 'utf-8'); } catch (e) {}
}

// ===================== 导出 =====================
module.exports = {
  // 常量
  DATA_DIR,
  USERS_DIR,
  MARKET_FILE,
  MARKET_HISTORY_FILE,
  BOSS_FILE,
  FORGE_FILE,
  CHAT_FILE,

  // 注入点
  setEnsureInvCounts,
  setEnsureHp,
  setBossConfig,

  // 文件锁
  _acquireFileLock,
  withFileLock,

  // 用户验证 / 路径
  isValidToken,
  userPath,
  userExists,

  // 用户加载 / 保存
  loadUser,
  saveUser,
  saveUserByObj,

  // 用户搜索
  allUsers,
  findUserByUsername,
  findUserToken,

  // 全球市场
  loadMarket,
  saveMarket,
  loadMarketHistory,
  saveMarketHistory,

  // 锻造
  loadForge,
  saveForge,

  // BOSS
  loadBossData,
  saveBossData,
  cleanDefeatedBosses,
  getAliveBossCount,

  // 聊天历史
  loadChatHistory,
  saveChatHistory,
};
