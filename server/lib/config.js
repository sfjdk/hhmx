/**
 * 禾禾小冒险 Web - 游戏配置加载模块
 * 从 server/index.js 中提取的所有配置加载逻辑
 */
const fs = require('fs');
const path = require('path');

// ===================== 配置加载 =====================
function loadConfig(name) {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', name), 'utf-8')); }
  catch (e) { return {}; }
}

const ITEMS = loadConfig('items.json');
const TITLES = loadConfig('titles.json');
const MAOXIAN = loadConfig('adventure/maoxian.json');
const MONSTERS = loadConfig('adventure/monsters.json');
const SHOP = loadConfig('economy/shangcheng.json');
const SIGNIN = loadConfig('economy/qiandao.json');
const SHENMI = loadConfig('economy/shenmi.json');
const INITIAL = loadConfig('economy/initial.json');
const HEIMINGDAN = loadConfig('economy/heimingdan.json');
const NONGCHANG = loadConfig('farm/nongchang.json');
const MATFARM = loadConfig('farm/material_farm.json');
const FRUITREE = loadConfig('farm/fruit_tree.json');
const DIAOYU = loadConfig('fishing/diaoyu.json');
const YUER = loadConfig('fishing/yuer.json');
const YUGAN = loadConfig('fishing/yugan.json');
const DIAOYU_RARE = loadConfig('fishing/diaoyu_rare.json');
const DUANZAO = loadConfig('forge/duanzao.json');
const JINENG = loadConfig('skill/jineng.json');
const FOOD = loadConfig('food/food.json');
const BOSS = loadConfig('boss/boss.json');
const LOLI = loadConfig('loli/loli.json');
const SYNTHESIS = loadConfig('synthesis/synthesis.json');
const EVENTS = loadConfig('events/events.json');
const PROFESSIONS = loadConfig('skill/professions.json');
const REGIONS = loadConfig('adventure/regions.json');
const QUESTS = loadConfig('adventure/quests.json');
const ANNOUNCEMENTS = loadConfig('announcements.json');
const GEMS = loadConfig('gem/gems.json');
const FISHING_AREAS = loadConfig('fishing/areas.json');
const WEATHER_CFG = loadConfig('weather.json');
const SEASON_CFG = loadConfig('season.json');
const RUINS_CFG = loadConfig('ruins.json');
const SETS_CFG = loadConfig('forge/sets.json');

// 预计算钓鱼水域鱼种详情（启动时一次，数据不变）
const FISHING_AREA_DETAILS = (FISHING_AREAS.areas||[]).map(a => {
  const fishDetail = (a.fish_pool||[]).map(fn => { const f = (DIAOYU.fish||[]).find(x => x.name === fn); return f ? { name: f.name, rarity: f.rarity, value_min: (f.value||[])[0], value_max: (f.value||[])[1], exp: f.exp } : { name: fn }; });
  const junkDetail = (a.junk_pool||[]).map(jn => { const j = (DIAOYU.junk||[]).find(x => x.name === jn); return j ? { name: j.name, rarity: j.rarity||0 } : { name: jn }; });
  return { id: a.id, name: a.name, icon: a.icon, min_level: a.min_level, description: a.description, fish_pool: a.fish_pool, junk_pool: a.junk_pool, fish_detail: fishDetail, junk_detail: junkDetail, fail_modifier: a.fail_modifier, rare_bonus: a.rare_bonus, no_junk: !!a.no_junk };
});

// 冒险区域 → 钓鱼水域映射（用于冒险中的钓鱼事件）
function regionToFishingArea(regionId) {
  const map = {
    plains: 'creek', forest: 'swamp', mine: 'underground',
    desert: 'oasis', royal_road: 'river', snow_mountain: 'alpine',
    volcano: 'volcanic', elven_deepwood: 'alpine', golden_coast: 'reef',
    abyss: 'abyss', starfall_wastes: 'cloud_river', time_rift: 'cloud_river',
    dragon_domain: 'abyss', chaos_abyss: 'underground',
    divine_border: 'cloud_river', creation_ruins: 'abyss', final_realm: 'abyss'
  };
  return map[regionId] || 'creek';
}

// ===================== 常量 =====================
const MAX_LEVEL = 250;

// 中国时区 UTC+8，每天凌晨0点重置
const TZ_OFFSET = 8 * 3600000;

// 清理过期待处理（5分钟）
const PENDING_EXPIRE_MS = 5 * 60 * 1000;

// ===================== 速率限制 =====================
const RATE_LIMITS = { adventure: 10, fishing: 30, forge_strengthen: 30 };
const DAILY_LIMITS = { forge_strengthen: 200 };

// ===================== 怪物特殊属性 =====================
const MONSTER_SPECIALS = {
  '虚化': { dodge_bonus: 0.18, text: '身体变得透明，难以命中！' },
  '灼烧': { bonus_dmg_pct: 0.10, text: '烈焰灼烧造成额外伤害！' },
  '冰冻': { freeze_chance: 0.12, text: '寒气将你冻住，无法行动！' },
  '诅咒': { atk_debuff_pct: 0.08, text: '诅咒削弱了你的攻击力！' },
  '暗杀': { crit_bonus: 0.12, text: '从暗影中发起致命一击！' },
  '龙威': { def_debuff_pct: 0.12, text: '龙威震慑，防御下降！' },
  '混沌': { chaos_chance: 0.22, text: '混沌之力爆发！' },
  '神罚': { first_hit_crit: true, text: '神罚降临，第一击必暴击！' },
  '狂乱': { extra_attacks: 1, text: '陷入狂乱，连续攻击！' },
  '硬化': { def_bonus_pct: 0.20, text: '皮肤硬化，防御大幅提升！' },
  '再生': { heal_pct: 0.06, text: '伤口再生，恢复了生命！' },
  '猛毒': { poison_chance: 0.18, poison_dmg_pct: 0.05, text: '毒液侵蚀，持续掉血！' },
};

module.exports = {
  loadConfig,
  // 所有配置对象
  ITEMS, TITLES, MAOXIAN, MONSTERS, SHOP, SIGNIN, SHENMI, INITIAL,
  HEIMINGDAN, NONGCHANG, MATFARM, FRUITREE, DIAOYU, YUER, YUGAN,
  DIAOYU_RARE, DUANZAO, JINENG, FOOD, BOSS, LOLI, SYNTHESIS,
  EVENTS, PROFESSIONS, REGIONS, QUESTS, ANNOUNCEMENTS, GEMS,
  FISHING_AREAS, WEATHER_CFG, SEASON_CFG, RUINS_CFG, SETS_CFG,
  FISHING_AREA_DETAILS,
  // 常量
  MAX_LEVEL, TZ_OFFSET, PENDING_EXPIRE_MS,
  RATE_LIMITS, DAILY_LIMITS, MONSTER_SPECIALS,
  // 函数
  regionToFishingArea
};
