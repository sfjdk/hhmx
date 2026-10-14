// 补充高等级区域冒险事件
const fs = require('fs');
const x = JSON.parse(fs.readFileSync('server/config/adventure/maoxian.json','utf8'));

const newEvents = [
  // ── 苍茫荒原 (final_realm) Lv195+ ──
  { name:'星光裂隙', type:'choice', rarity:5, required_regions:['final_realm'],
    text:'荒原尽头，一道由纯粹星光构成的裂隙悬浮在半空，里面传出古老的低语...',
    choices:[
      {text:'✨ 踏入裂隙', desc:'进入星光世界', outcome:'combat', coins:[800,2000], exp:250, monster_name:'虚空行者', elite:true, elite_chance:0.6,
        drops:[{name:'星之碎片',count:[5,12]},{name:'神之碎屑',count:[3,8]}]},
      {text:'🔮 收集星光', desc:'安全获取能量', outcome:'treasure', coins:[500,1200], exp:180,
        drops:[{name:'星之碎片',count:[8,15]},{name:'虚空晶矿',count:[2,5]},{name:'神之碎片',count:[1,2],chance:0.15}]},
      {text:'📜 抄录符文', desc:'记录裂隙铭文', outcome:'treasure', coins:[0,0], exp:300,
        drops:[{name:'经验圣水',count:[1,2],chance:0.4},{name:'觉醒之石',count:[1,2],chance:0.1}]},
      {text:'🚶 远离裂隙', desc:'安全第一', outcome:'nothing', exp:10, text_result:'你谨慎地远离了那道不稳定的裂隙'}
    ]
  },
  { name:'荒原猎场', type:'combat', rarity:5, required_regions:['final_realm'],
    text:'大地震颤——一头巨兽从地底破土而出，咆哮震天！', coins:[1000,3000], exp:400, min_power:2000,
    drops:[{name:'大地核心',count:[3,8]},{name:'混沌原矿',count:[2,5]}],
    rare_drop_chance:0.3, rare_drops:[{name:'创世结晶',count:[1,3]},{name:'觉醒之石',count:[1,2]}],
    min_level:200, weapon_drops:[{name:'🦵荒原猎手护腿',type:'leggings',rarity:4,chance:0.04,
      special:{counter:0.06},stat_variance:0.12,
      special_pool:[['dmg_reduce',0.06],['defense',12],['hp',20]]}]
  },
  { name:'终焉祭坛', type:'choice', rarity:6, required_regions:['final_realm'],
    text:'一座由暗物质构筑的祭坛上，悬浮着一颗跳动的水晶心脏...',
    choices:[
      {text:'❤️ 触碰心脏', desc:'高风险高回报', outcome:'combat', coins:[1500,4000], exp:500, monster_name:'终焉守护者', elite:true, elite_chance:0.7,
        drops:[{name:'神之碎片',count:[5,15]},{name:'混沌核心',count:[2,5]}]},
      {text:'💎 采集水晶', desc:'小心剥离', outcome:'treasure', coins:[800,2000], exp:250,
        drops:[{name:'创世结晶',count:[2,5]},{name:'亮碎片',count:[2,5]},{name:'虚空晶矿',count:[2,5]}]},
      {text:'📖 研究祭坛', desc:'解读铭文', outcome:'treasure', coins:[0,0], exp:500,
        drops:[{name:'贤者之石',count:[2,4]},{name:'神匠之锤',count:[1,2],chance:0.2}]}
    ]
  },

  // ── 远古遗址 (creation_ruins) Lv170+ ──
  { name:'创世熔炉', type:'choice', rarity:5, required_regions:['creation_ruins'],
    text:'废墟深处，一座远古神匠的锻造熔炉仍在燃烧，炉中还有未完成的武器...',
    choices:[
      {text:'🔨 完成锻造', desc:'尝试打造神器', outcome:'combat', coins:[600,1500], exp:300, monster_name:'创世神罚之影', elite:true, elite_chance:0.5,
        drops:[{name:'锻造精魂',count:[5,10]},{name:'神之碎屑',count:[5,12]}]},
      {text:'📦 收集材料', desc:'炉边材料丰厚', outcome:'treasure', coins:[400,1000], exp:180,
        drops:[{name:'奥金矿',count:[5,10]},{name:'精炼金矿',count:[3,6]},{name:'附魔石',count:[5,10]}]},
      {text:'📜 抄录配方', desc:'炉壁刻有神匠秘方', outcome:'treasure', coins:[0,0], exp:350,
        drops:[{name:'锻造精魂',count:[3,8]},{name:'铁匠之魂',count:[2,4]},{name:'神匠之锤',count:[1,1],chance:0.15}]}
    ]
  },
  { name:'遗迹守卫', type:'combat', rarity:4, required_regions:['creation_ruins'],
    text:'石柱后转出一尊三头巨像，六只眼睛同时锁定了你！', coins:[500,1200], exp:250, min_power:800,
    drops:[{name:'古代金币',count:[5,12]},{name:'皇家碎片',count:[3,8]}],
    rare_drop_chance:0.25, rare_drops:[{name:'神之碎片',count:[2,5]},{name:'觉醒之石',count:[1,2]}],
    min_level:175, weapon_drops:[{name:'👢遗迹探索者之靴',type:'boots',rarity:4,chance:0.04,
      special:{speed:8},stat_variance:0.12,
      special_pool:[['dodge',6],['crit_rate',0.06],['exp_bonus',0.08]]}]
  },

  // ── 边陲地带 (divine_border) Lv145+ ──
  { name:'边境哨站', type:'choice', rarity:4, required_regions:['divine_border'],
    text:'废弃的边境哨站中，武器架上还有几件完好的装备...',
    choices:[
      {text:'⚔️ 取用装备', desc:'惊动守卫', outcome:'combat', coins:[400,1000], exp:200, monster_name:'圣殿骑士', elite:true, elite_chance:0.4,
        drops:[{name:'皇家碎片',count:[3,8]},{name:'骑士之魂',count:[2,5]}]},
      {text:'📦 搜索仓库', desc:'寻找物资', outcome:'treasure', coins:[300,800], exp:150,
        drops:[{name:'百炼钢',count:[2,5]},{name:'古代金币',count:[3,8]},{name:'附魔石',count:[3,6]}]},
      {text:'📖 翻阅日志', desc:'了解边境战况', outcome:'treasure', coins:[0,0], exp:250,
        drops:[{name:'锻造精魂',count:[3,6]},{name:'经验药水',count:[2,4],chance:0.5}]}
    ]
  },
  { name:'边境守护者', type:'combat', rarity:4, required_regions:['divine_border'],
    text:'边境防线传来号角声——圣殿骑士的英灵从石棺中苏醒！', coins:[350,900], exp:220, min_power:600,
    drops:[{name:'骑士之魂',count:[2,5]},{name:'天使之泪',count:[1,3]}],
    rare_drop_chance:0.2, rare_drops:[{name:'神之碎屑',count:[3,8]},{name:'觉醒之石',count:[1,2]}],
    min_level:150, weapon_drops:[{name:'💍边境骑士之戒',type:'accessory',rarity:4,chance:0.035,
      special:{dmg_reduce:0.06},stat_variance:0.12,
      special_pool:[['counter',0.05],['defense',10],['hp',18],['exp_bonus',0.08]]}]
  },

  // ── 起伏丘陵 (dragon_domain) Lv100+ ──
  { name:'龙巢废墟', type:'choice', rarity:4, required_regions:['dragon_domain'],
    text:'被遗弃的远古龙巢中，还有几颗未孵化的龙蛋在微微发光...',
    choices:[
      {text:'🥚 触碰龙蛋', desc:'唤醒守护者', outcome:'combat', coins:[500,1200], exp:280, monster_name:'远古龙', elite:true, elite_chance:0.5,
        drops:[{name:'龙之心',count:[2,5]},{name:'神龙碎片',count:[3,8]}]},
      {text:'💎 采集龙晶', desc:'巢壁上的结晶', outcome:'treasure', coins:[400,1000], exp:180,
        drops:[{name:'龙鳞碎片',count:[5,12]},{name:'古代金币',count:[3,8]},{name:'翡翠矿',count:[2,5]}]},
      {text:'🪺 悄悄离开', desc:'不打扰龙巢', outcome:'nothing', exp:15, text_result:'你轻手轻脚地退出了龙巢，心中默念还好没惊动什么...'}
    ]
  },
  { name:'龙巢狩猎', type:'combat', rarity:4, required_regions:['dragon_domain'],
    text:'一头半龙人猎手从高处跃下，手中龙牙矛直指你的心脏！', coins:[400,1000], exp:240, min_power:500,
    drops:[{name:'神龙碎片',count:[3,8]},{name:'龙鳞',count:[1,3],chance:0.2}],
    rare_drop_chance:0.2, rare_drops:[{name:'龙之心',count:[1,3]},{name:'奥金矿',count:[2,5]}],
    min_level:110, weapon_drops:[{name:'🛡️龙巢守护胸甲',type:'armor',rarity:4,chance:0.035,
      special:{dmg_reduce:0.06},stat_variance:0.12,
      special_pool:[['counter',0.05],['defense',10],['hp',18],['lifesteal',0.04]]}]
  },

  // ── 深邃谷地 (chaos_abyss) Lv120+ ──
  { name:'混沌泉眼', type:'choice', rarity:5, required_regions:['chaos_abyss'],
    text:'谷地中央，一口混沌能量涌动的泉眼散发出令人窒息的威压...',
    choices:[
      {text:'⚗️ 采集混沌液', desc:'极度危险', outcome:'combat', coins:[500,1500], exp:300, monster_name:'混沌之龙', elite:true, elite_chance:0.6,
        drops:[{name:'混沌之鳞',count:[5,15]},{name:'混沌原矿',count:[2,5]}]},
      {text:'🔮 吸收能量', desc:'用容器收集', outcome:'treasure', coins:[300,800], exp:200,
        drops:[{name:'混沌之鳞',count:[3,8]},{name:'虚空晶矿',count:[2,5]},{name:'星之碎片',count:[5,10]}]},
      {text:'🚫 封印泉眼', desc:'太危险了', outcome:'nothing', exp:30, text_result:'你用符文封印了泉眼，感觉到混沌能量在脚下翻涌...'}
    ]
  },
];

for (const ev of newEvents) { x.events.push(ev); }
fs.writeFileSync('server/config/adventure/maoxian.json', JSON.stringify(x, null, 2));
console.log('Added', newEvents.length, 'events');
newEvents.forEach(ev => console.log('  ['+ev.type+']', ev.name, '->', ev.required_regions.join(', ')));
