/**
 * 统一冒险掉落装备数值 — 以锻造(direct_craft)为基准
 *   怪物掉落 = 锻造同级 × 0.90 × 稀有度系数
 *   宝箱掉落 = 锻造同级 × 0.95 × 稀有度系数
 *
 * 稀有度越高，掉落装备越强，鼓励挑战高稀有度怪物
 *
 * 用法: node scripts/unify_drops.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// ─── 稀有度对装备属性的加成系数 ───
const RARITY_BOOST = {
  1:     1.00,
  2:     1.06,
  3:     1.12,
  4:     1.18,
  5:     1.22,
  6:     1.26,
  7:     1.28,
  8:     1.30,
  999:   1.24,
  9999:  1.30,
  99999: 1.36
};

function rarityBoost(rarity) {
  if (RARITY_BOOST[rarity] !== undefined) return RARITY_BOOST[rarity];
  // fallback: log scale
  if (rarity >= 99999) return 1.36;
  if (rarity >= 9999) return 1.30;
  if (rarity >= 999) return 1.24;
  if (rarity >= 4) return 1.18;
  if (rarity >= 3) return 1.12;
  if (rarity >= 2) return 1.06;
  return 1.00;
}

// ─── 1. 锻造基准 ───
const duanzao = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/config/forge/duanzao.json'), 'utf8'));
const forgeBaseline = {};
for (const item of duanzao.direct_craft) {
  const type = item.type;
  if (!forgeBaseline[type]) forgeBaseline[type] = [];
  forgeBaseline[type].push({ level: item.min_level, stats: item.stats, name: item.name });
}
for (const t of Object.keys(forgeBaseline)) forgeBaseline[t].sort((a, b) => a.level - b.level);

// ─── 2. 插值获取锻造属性 ───
function getForgedStats(type, level) {
  const bl = forgeBaseline[type];
  if (!bl || bl.length === 0) return getForgedStats('weapon', level);
  let lo = bl[0], hi = bl[bl.length - 1];
  for (const p of bl) {
    if (p.level <= level) lo = p;
    if (p.level >= level) { hi = p; break; }
  }
  const keys = ['attack', 'defense', 'speed', 'attack_speed', 'dodge', 'hp'];
  const out = {};
  if (lo.level === hi.level) {
    if (level > lo.level) {
      // Lv100+ 外推：主属性用斜率，副属性保持最高点比例
      const p1 = bl[bl.length - 2], p2 = bl[bl.length - 1];
      const dLv = p2.level - p1.level;
      const extra = level - p2.level;
      // 各部位主属性: weapon=attack, armor=defense, helmet=hp, boots=speed, leggings=attack_speed, accessory=dodge
      const primaryMap = {weapon:'attack', armor:'defense', helmet:'hp', boots:'speed', leggings:'attack_speed', accessory:'dodge'};
      const primary = primaryMap[type] || 'attack';
      // 主属性外推
      const primSlope = (p2.stats[primary] - p1.stats[primary]) / dLv;
      const newPrimary = Math.round(p2.stats[primary] + primSlope * extra);
      // 副属性按主属性比例缩放
      const ratio = newPrimary / (p2.stats[primary] || 1);
      for (const k of keys) {
        out[k] = Math.round((p2.stats[k] || 0) * ratio);
      }
    } else {
      // 低于最低数据点，直接取最低值
      for (const k of keys) out[k] = lo.stats[k] || 0;
    }
  } else {
    const t = (level - lo.level) / (hi.level - lo.level);
    for (const k of keys) out[k] = Math.round((lo.stats[k] || 0) + ((hi.stats[k] || 0) - (lo.stats[k] || 0)) * t);
  }
  return out;
}

function scaleStats(stats, factor) {
  const out = {};
  for (const [k, v] of Object.entries(stats)) out[k] = Math.round(v * factor);
  return out;
}

// ─── 3. 等效等级 ───
const REGION_LV = {
  plains: 5, forest: 15, desert: 30, snow_mountain: 45,
  volcano: 60, golden_coast: 35, elven_deepwood: 50, royal_road: 45,
  mine: 10, abyss: 75, starfall_wastes: 80, time_rift: 90,
  dragon_domain: 105, chaos_abyss: 130, divine_border: 155,
  creation_ruins: 180, final_realm: 210
};

function monsterEquivLevel(monster) {
  // level_range 下限为准（更保守，避免低稀有度怪出高属性装）
  if (monster.level_range && Array.isArray(monster.level_range)) {
    return monster.level_range[0];
  }
  return REGION_LV[monster.region_id] || 20;
}

// ─── 4. 核心：根据等级+稀有度+部位生成属性 ───
function buildDropStats(type, equivLevel, rarity, baseMult) {
  const forged = getForgedStats(type, equivLevel);
  const rBoost = rarityBoost(rarity);
  return scaleStats(forged, baseMult * rBoost);
}

function rebuildWeaponDrops(weaponDrops, equivLevel, rarity, baseMult) {
  return weaponDrops.map(wdef => {
    const type = wdef.type || 'weapon';
    return { ...wdef, stats: buildDropStats(type, equivLevel, rarity, baseMult) };
  });
}

// ─── 5. monsters.json ───
// 注意: 稀有度加成由 dropAdventureWeapon() 的 rarity_variants.statMult 处理
//       这里只用基准 0.90，避免重复计算稀有度
console.log('=== monsters.json (锻造×0.90, 稀有度由 rarity_variants 处理) ===');
const mPath = path.join(ROOT, 'server/config/adventure/monsters.json');
const mData = JSON.parse(fs.readFileSync(mPath, 'utf8'));
let mc = 0;
for (const mon of mData.monsters) {
  if (mon.weapon_drops && mon.weapon_drops.length > 0) {
    const lv = monsterEquivLevel(mon);
    mon.weapon_drops = rebuildWeaponDrops(mon.weapon_drops, lv, 1, 0.95); // rarity=1 即不额外加成
    mc++;
    const w = mon.weapon_drops[0];
    const variantMax = w.rarity_variants ? Math.max(...Object.values(w.rarity_variants).map(v=>v.stat_mult||1)) : 1;
    console.log(`  r=${mon.rarity} ${mon.name} L~${lv}: ${w.name} att=${w.stats.attack} (variant最高×${variantMax} → ${Math.round(w.stats.attack*variantMax*1.12)})`);
  }
}
fs.writeFileSync(mPath, JSON.stringify(mData, null, 2) + '\n', 'utf8');
console.log(`  更新 ${mc} 只怪物\n`);

// ─── 6. maoxian.json ───
console.log('=== maoxian.json (宝箱×0.95×稀有度, 战斗×0.90×稀有度) ===');
const xPath = path.join(ROOT, 'server/config/adventure/maoxian.json');
const xData = JSON.parse(fs.readFileSync(xPath, 'utf8'));
let xc = 0;
for (const ev of xData.events) {
  if (ev.weapon_drops && ev.weapon_drops.length > 0) {
    // 推等级
    let lv = 15;
    if (ev.required_regions && Array.isArray(ev.required_regions)) {
      const ls = ev.required_regions.map(r => REGION_LV[r] || 20);
      if (ls.length) lv = Math.round(ls.reduce((a, b) => a + b, 0) / ls.length);
    }
    if (ev.min_level) lv = Math.max(lv, ev.min_level);
    // rarity 也会拉高等级期望，但有上限
    const r = ev.rarity || 1;
    if (r <= 8) lv = Math.max(lv, r * 8 + 5);

    const isTreasure = ev.type === 'treasure';
    const baseMult = isTreasure ? 1.00 : 0.95;

    ev.weapon_drops = rebuildWeaponDrops(ev.weapon_drops, lv, r, baseMult);
    xc++;
    const w = ev.weapon_drops[0];
    console.log(`  [${ev.type}] r=${r} ${ev.name} L~${lv}: ${w.name} att=${w.stats.attack}`);
  }
}
fs.writeFileSync(xPath, JSON.stringify(xData, null, 2) + '\n', 'utf8');
console.log(`  更新 ${xc} 个事件\n`);

// ─── 7. 验证 ───
console.log('=== 验证关键条目 ===');
const m2 = JSON.parse(fs.readFileSync(mPath, 'utf8'));
const checks = ['史莱姆','哥布林','盗贼','炎魔','远古龙','神龙','超脱之影','宝箱怪'];
for (const mon of m2.monsters) {
  if (checks.includes(mon.name) && mon.weapon_drops) {
    const w = mon.weapon_drops[0];
    console.log(`  ${mon.name}(r${mon.rarity}): ${w.name} att=${w.stats.attack} def=${w.stats.defense} hp=${w.stats.hp} (variants: ${Object.keys(w.rarity_variants||{}).join(',')})`);
  }
}

console.log('\n✅ 完成！公式: 锻造基准 × 类型系数(0.90怪/0.95箱) × 稀有度加成');
