
// ==================== 核心 ====================
var S={token:localStorage.getItem('hk'),user:null,stats:{},mode:'login',page:'dashboard'};
var socket;
function _(id){return document.getElementById(id)}
function toast(m,t){t=t||'info';var e=document.createElement('div');e.className='toast toast-'+t;e.textContent=m;_('toast-container').appendChild(e);setTimeout(function(){e.remove()},3000)}
function showQuestToasts(r){if(r&&r.quests_completed&&r.quests_completed.length>0){for(var i=0;i<r.quests_completed.length;i++){var q=r.quests_completed[i];setTimeout(function(q2){toast('📋 任务完成: '+q2.name+'！奖励: '+q2.rewards.join(', '),'success')},i*400,q)}}}
// -- 倒计时引擎 --
S._cdTimer=null;
function startCountdown(){
  if(S._cdTimer) return;
  S._cdTimer=setInterval(function(){
    var els=document.querySelectorAll('[data-deadline]');
    for(var i=0;i<els.length;i++){
      var el=els[i],dl=parseInt(el.getAttribute('data-deadline'),10),pre=el.getAttribute('data-prefix')||'';
      var remain=Math.max(0,dl-Date.now()/1000);
      var text;
      if(remain<60) text=Math.floor(remain)+'秒';
      else if(remain<3600) text=Math.floor(remain/60)+'分'+Math.floor(remain%60)+'秒';
      else text=Math.floor(remain/3600)+'时'+Math.floor((remain%3600)/60)+'分';
      el.textContent=pre+text;
    }
  },1000);
}
function stopCountdown(){if(S._cdTimer){clearInterval(S._cdTimer);S._cdTimer=null}}
function closeModal(id){var el=document.getElementById(id);if(el)el.remove();}
function showModal(html,id){
  if(id){var old=document.getElementById(id);if(old)old.remove();}
  _('content').insertAdjacentHTML('beforeend','<div class="modal-overlay" id="'+id+'">'+html+'</div>');
}
function gameConfirm(msg,cb){
  var id='gc'+Date.now();
  var h='<div class="modal" style="min-width:auto;max-width:450px"><h3 style="color:var(--sidebar-bg2);margin-bottom:12px">'+msg.replace(/\n/g,'<br>')+'</h3><div style="display:flex;gap:12px;justify-content:flex-end"><button class="btn btn-outline btn-sm" onclick="closeModal(\''+id+'\')">取消</button><button class="btn btn-primary btn-sm" id="'+id+'-ok">确认</button></div></div>';
  _('content').insertAdjacentHTML('beforeend','<div class="modal-overlay" id="'+id+'">'+h+'</div>');
  document.getElementById(id+'-ok').addEventListener('click',function(){document.getElementById(id).remove();cb(true)});
}
function fn(n){return (n||0).toLocaleString()}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function escAttr(s){return String(s||'').replace(/\\/g,'\\\\').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function weaponRarityStyle(r){
  var map={
    1:    {icon:'⬜',color:'color:#aaa'},
    2:    {icon:'🟩',color:'color:#4caf50'},
    3:    {icon:'🟦',color:'color:#2196f3;font-weight:bold'},
    4:    {icon:'🟪',color:'color:#9c27b0;font-weight:bold'},
    999:  {icon:'🟧',color:'color:#ff9800;font-weight:bold;font-size:1.05em'},
    9999: {icon:'🟥',color:'color:#f44336;font-weight:bold;font-size:1.1em;text-shadow:0 0 6px rgba(244,67,54,0.3)'},
    99999:{icon:'💎',color:'color:#e91e63;font-weight:bold;font-size:1.15em;text-shadow:0 0 8px rgba(233,30,99,0.4)'}
  };
  return map[r]||map[1];
}
function renderDropList(drops){
  if(!drops||!drops.length)return'';
  var parts=[];
  for(var i=0;i<drops.length;i++){
    var d=drops[i];
    if(typeof d==='string'){
      var m2 = d.match(/^(.+?)(x\d+)?$/);
      parts.push(m2 ? esc(m2[1]) + (m2[2]||'') : esc(d));
    }else{
      var r=d.rarity||1,rc=weaponRarityStyle(r);
      parts.push('<span style="'+rc.color+'">'+rc.icon+' '+esc(d.name)+'</span>x'+d.count);
    }
  }
  return ' 获得:'+parts.join('、');
}
function copyText(t){t=String(t||'');if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(function(){toast('已复制: '+t,'success')}).catch(function(){toast('复制失败','error')})}else{var ta=document.createElement('textarea');ta.value=t;ta.style.position='fixed';ta.style.left='-9999px';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');toast('已复制: '+t,'success')}catch(e){toast('复制失败','error')}document.body.removeChild(ta)}}
function api(p,b,m){
  var h={'Authorization':S.token,'Content-Type':'application/json;charset=utf-8'};
  var o={headers:h,cache:'no-store'};if(b){o.method=m||'POST';o.body=JSON.stringify(b)}
  var sep=p.indexOf('?')>=0?'&':'?';
  var url=p+sep+'_t='+Date.now();
  return fetch(url,o).then(function(r){
    if(!r.ok) return r.json().then(function(d){return d}).catch(function(){return {error:'服务器错误 ('+r.status+')'}});
    return r.json();
  }).catch(function(e){console.error('API请求失败: '+p,e);return {error:'网络错误，请检查服务器是否运行'}})
}
// 导航
const navGroups = [
  { title:'⚔️ 战斗成长', items:[
    ['dashboard','🏠 首页'],['adventure','⚔️ 冒险'],['boss','🐉 世界BOSS'],['skill','📚 技能']
  ]},
  { title:'🌾 采集生产', items:[
    ['farm','🌾 农场'],['food','🍳 烹饪'],['season','🌸 季节']
  ]},
  { title:'🔨 装备经济', items:[
    ['equipment','🔨 装备'],['fishtank','🐠 鱼缸'],['synthesis','⚗️ 合成'],['bag','🎒 背包'],
    ['shop','🛒 商城'],['market','🌍 市场']
  ]},
  { title:'👥 社交收集', items:[
    ['companions','👧 同伴'],['events','🎪 活动'],['handbook','📖 图鉴'],['friends','👥 好友'],['leaderboard','🏆 排行']
  ]},
  { title:'⚙️ 系统', items:[
    ['titles','🏅 称号'],['feedback','💬 反馈'],['settings','⚙️ 设置']
  ]}
];
(function(){
  var h='';
  for(var g=0;g<navGroups.length;g++){
    var grp=navGroups[g];
    h+='<div class="nav-group"><div class="nav-group-title" onclick="toggleNavGroup(this)">'+grp.title+'<span class="arrow">▼</span></div><div class="nav-group-items">';
    for(var i=0;i<grp.items.length;i++){
      var it=grp.items[i];
      h+='<a data-page="'+it[0]+'" onclick="go(\''+it[0]+'\')">'+it[1];
      if(it[0]==='companions') h+=' <span id="loli-badge" style="display:none;background:var(--purple);color:#fff;border-radius:50%;padding:0 5px;font-size:11px">!</span>';
      if(it[0]==='adventure') h+=' <span id="merchant-badge" style="display:none;background:var(--orange);color:#fff;border-radius:50%;padding:0 5px;font-size:11px">!</span>';
      h+='</a>';
    }
    h+='</div></div>';
  }
  _('nav').innerHTML=h;
})();
function toggleNavGroup(el){
  var items=el.nextElementSibling;
  items.classList.toggle('collapsed');
  var arrow=el.querySelector('.arrow');
  arrow.textContent=items.classList.contains('collapsed')?'▶':'▼';
}
function toggleSidebar(){var n=document.getElementById('nav');n.classList.toggle('open')}
function go(p){
  stopCountdown();
  if(mktSearchTimer){clearTimeout(mktSearchTimer);mktSearchTimer=null}
  if(S.page==='equipment'&&p!=='equipment'){S._equipTab='sets'}
  S.page=p;
  try{localStorage.setItem('hehe_last_page',p)}catch(e){}
  var as=document.querySelectorAll('#nav a');
  for(var i=0;i<as.length;i++) as[i].classList.remove('active');
  var a=document.querySelector('#nav a[data-page="'+p+'"]');
  if(a) a.classList.add('active');
  if(window.innerWidth<=768) document.getElementById('nav').classList.remove('open');
  try {
    if(p==='dashboard') pgDashboard();
    else if(p==='adventure') pgAdventure();
    else if(p==='fishing') pgAdventure();
    else if(p==='farm') pgFarm();
    else if(p==='season') pgSeason();
    else if(p==='shop') pgShop();
    else if(p==='market') pgMarket();
    else if(p==='equipment') pgEquipment();
    else if(p==='fishtank') pgFishTank();
    else if(p==='skill') pgSkill();
    else if(p==='food') pgFood();
    else if(p==='bag') pgBag();
    else if(p==='companions') pgLoli();
    else if(p==='boss') pgBoss();
    else if(p==='events') pgEvents();
    else if(p==='titles') pgTitles();
    else if(p==='synthesis') pgSynth();
    else if(p==='leaderboard') pgRank();
    else if(p==='friends') pgFriends();
    else if(p==='handbook') pgHandbook();
    else if(p==='dummy'){ S._equipTab='dummy'; pgEquipment(); }
    else if(p==='feedback') pgFeedback();
    else if(p==='settings') pgSettings();
    else if(p==='quests') pgQuests();
    else if(p==='train') pgTrain();
  } catch(e){_('content').innerHTML='<div class="card"><h2>出错了</h2><p>'+e.message+'</p></div>'}
}
// 认证
var loginMode='login';
	function toggleMode(){loginMode=loginMode==="login"?"register":"login";document.querySelector("#login-screen .btn").textContent=loginMode==="login"?"登录":"注册";document.querySelector("#login-screen .toggle span").textContent=loginMode==="login"?"立即注册":"返回登录";var em=_("login-email");if(em)em.style.display=loginMode==="register"?"block":"none";var vb=_("verify-box");if(vb)vb.style.display="none";}
async function doLogin(){
  var u=_('login-user').value.trim(),p=_('login-pass').value.trim();
  if(!u||!p) return toast('请填写完整','error');
  var body={username:u,password:p};
  if(loginMode==='register'){
    var em=_('login-email').value.trim();
    if(!em) return toast('请输入邮箱','error');
    body.email=em;
  }
  var r=await api('/api/'+(loginMode==='register'?'register':'login'),body);
  if(r.error) return toast(r.error,'error');
  S.token=r.token;S.user=r.user;localStorage.setItem('hk',S.token);
  if(r.need_verify){
    var lb=_('login-btn'); if(lb) lb.style.display='none';
    var vb=_('verify-box'); if(vb) vb.style.display='block';
    var vm=_('verify-msg'); if(vm) vm.innerHTML='📧 验证码已发送到 <b>'+esc(r.email||'你的邮箱')+'</b>，请查收邮件'; var ci=_('verify-code'); if(ci) ci.placeholder='输入邮件中的6位验证码';
    toast('📧 验证码已发送到你的邮箱','info');
  } else {
    initApp();
  }
}
async function doVerify(){
  var code=_('verify-code').value.trim();
  if(!code || code.length!==6) return toast('请输入6位验证码','error');
  var r=await api('/api/verify-email',{code:code});
  if(r.error) return toast(r.error,'error');
  toast('✅ 邮箱验证成功！','success');
  var vb=_('verify-box'); if(vb) vb.style.display='none';
  _('login-screen').querySelector('.btn').style.display='';
  initApp();
}
async function doResendCode(){
  var r=await api('/api/resend-code',{});
  if(r.error) return toast(r.error,'error');
  toast('📧 新验证码已发送','info');
}
function doLogout(){stopCountdown();if(mktSearchTimer){clearTimeout(mktSearchTimer);mktSearchTimer=null}if(S._refreshTimer){clearInterval(S._refreshTimer);S._refreshTimer=null}localStorage.removeItem('hk');S.token=null;S.user=null;S._chatInited=false;S._socketInited=false;S._chatSeen={};var el=_('chat-msgs');if(el)el.innerHTML='';if(socket){socket.disconnect();socket=null;}_('app').style.display='none';_('login-screen').style.display='flex';_('chat-widget').style.display='none'}
function pickAvatar(){
  var h='🎨 更换头像<hr style="margin:8px 0">';
  h+='<p style="font-size:13px">📁 上传图片：<input type="file" id="av-file" accept="image/*" style="font-size:13px" onchange="uploadAvatar()"></p>';
  h+='<p style="font-size:12px;color:var(--text-faint)">支持jpg/png/gif，上限3MB</p>';
  h+='<hr style="margin:8px 0"><p style="font-size:13px">😊 或输入emoji：<input id="av-input" placeholder="🐱" style="width:100px;padding:4px;font-size:18px;text-align:center"></p>';
  h+='<p style="font-size:12px;color:var(--text-faint)">输入"默认"恢复首字头像</p>';
  h+='<button class="btn btn-blue btn-sm" onclick="setEmojiAvatar()" style="margin-top:6px">保存</button>';
  gameConfirm(h,function(){});
}
function setEmojiAvatar(){var v=_('av-input')?(_('av-input').value.trim()||''):'';if(!v)return;if(v==='默认')v='';api('/api/settings/avatar',{avatar:v}).then(function(r){if(r.error)return toast(r.error,'error');toast(r.avatar?'头像已更新!':'已恢复默认头像','success');refresh().then(function(){pgDashboard()})})}
function uploadAvatar(){var f=_('av-file');if(!f||!f.files||!f.files[0])return;var file=f.files[0];if(file.size>3*1024*1024)return toast('图片不能超过3MB','error');var reader=new FileReader();reader.onload=function(e){var data=e.target.result;api('/api/settings/avatar',{image:data}).then(function(r){if(r.error)return toast(r.error,'error');toast('头像上传成功!','success');refresh().then(function(){pgDashboard()})})};reader.readAsDataURL(file)}
async function refresh(){
  var r=await api('/api/me');if(r.error||!r.user) return;
  S.user=r.user;S.stats=r.stats||{};S.signed=r.signed_today;S.pending_lolis=r.pending_lolis;S.pending_merchant=r.pending_merchant;
  S.expToNext=r.exp_to_next||0;S.invTotal=r.inv_total||0;
  S.rateAdv=r.rate_adventure||{};S.rateFish=r.rate_fishing||{};
  S.weather=r.weather||{};S.fishingAreas=r.fishing_areas||[];
  S.season=r.season||{};
  _('tc').textContent=fn(S.user.coins);
  _('tl').textContent='Lv.'+(S.user.level||1);
  _('tp').textContent=fn(S.stats.power||0);
  _('ts').textContent=(S.user.skill_points||0)+' SP';
  _('tu').textContent=S.user.username||'';
  var lb=_('loli-badge'); if(lb) lb.style.display=S.pending_lolis?'inline':'none';
  var mb=_('merchant-badge'); if(mb) mb.style.display=S.pending_merchant?'inline':'none';
  var wd=_('weather-display'); if(wd){var w=S.weather||{};var se=S.season||{};wd.textContent=(se.season_name||'')+' · '+(w.weather_icon||'')+(w.weather||'')+' · '+(w.time_icon||'')+(w.time_period||'');}
  // ❤️ HP 血条更新
  var hpData=r.hp||{}; var hpCur=hpData.current||0, hpMax=hpData.max||1;
  var hpPct=Math.min(100,Math.max(0,Math.round(hpCur/hpMax*100)));
  var hpBar=_('hp-bar'); if(hpBar){hpBar.style.width=hpPct+'%';hpBar.style.background=hpPct>60?'var(--hp-green)':(hpPct>30?'var(--hp-warn)':'var(--hp-danger)');}
  var hpText=_('hp-text'); if(hpText) hpText.textContent=hpPct+'%';
}
async function initApp(){
  _('login-screen').style.display='none';_('app').style.display='flex';_('chat-widget').style.display='';
  // 动态加载 socket.io（仅在登录后加载，不阻塞登录页渲染）
  if (typeof io === 'undefined') {
    await new Promise(function(resolve, reject){
      var s = document.createElement('script');
      s.src = '/socket.io/socket.io.js?v=' + (window.__SERVER_START || Date.now());
      s.onload = resolve;
      s.onerror = function(){ reject(new Error('socket.io.js 加载失败，请刷新页面重试')); };
      document.head.appendChild(s);
    });
  }
  // WebSocket 优先，失败自动降级为长轮询
  try {
    socket=io({transports:['websocket','polling'],upgrade:true,reconnection:true,reconnectionAttempts:Infinity,reconnectionDelay:1000,reconnectionDelayMax:30000,timeout:20000});
  } catch(e) {
    console.error('❌ Socket.IO 初始化失败:', e.message);
    toast('实时连接初始化失败，聊天/BOSS/市场不可用 — 请刷新重试','error');
    _('ol').style.color='var(--hp-danger)';
    socket = null;
  }
  // 防重复注册所有 socket 事件处理器
  if(!S._socketInited && socket){
    S._socketInited=true;
    socket.on('connect',function(){console.log('✅ Socket 已连接, id:',socket.id,'transport:',socket.io.engine.transport.name);_('ol').style.color='var(--hp-green)';socket.emit('user:login',{token:S.token,username:S.user.username})});
    socket.on('connect_error',function(e){console.warn('⚠️ Socket 传输层尝试中:',e.message,'type:',e.type);_('ol').style.color='var(--hp-danger)'});
    socket.on('disconnect',function(r){console.warn('⚠️ Socket 断开:',r);_('ol').style.color='var(--hp-warn)'});
    socket.on('reconnect',function(n){console.log('🔄 Socket 重连成功, 尝试次数:',n);_('ol').style.color='var(--hp-green)';socket.emit('user:login',{token:S.token,username:S.user.username});refresh().catch(function(){});});
    socket.on('reconnect_error',function(e){console.error('🔄 重连失败:',e.message)})
    socket.on('reconnect_failed',function(){console.error('🔄 重连已放弃（已达最大重试次数）');toast('实时连接已断开，请刷新页面恢复','error')});
    socket.on('players:online',function(d){_('ol').textContent=d.count;S.online=d.count});
    socket.on('boss:update',function(d){toast('⚔️ '+esc(d.attacker||'?')+' 对 '+esc(d.name)+' 造成 '+fn(d.damage)+' 伤害','info');if(S.page==='dashboard') loadBossCard();else if(S.page==='boss') pgBoss()});
    socket.on('boss:spawn',function(d){toast('🐉 世界BOSS「'+esc(d.name)+'」出现了！','warn');if(S.page==='dashboard') loadBossCard();else if(S.page==='boss') pgBoss()});
    socket.on('boss:killed',function(d){toast('🎉 世界BOSS「'+esc(d.boss)+'」被击杀了！('+d.participants+'人参战)','success');if(S.page==='dashboard') loadBossCard();else if(S.page==='boss') pgBoss()});
    // 市场实时更新（全服轻量 toast，不重绘页面）
    socket.on('market:update',function(d){
      var msg='';
      if(d.action==='list') msg='📦 '+esc(d.seller)+' 上架了 '+esc(d.item)+(d.price?' 💰'+fn(d.price):'')+(d.qty>1?' x'+d.qty:'');
      else if(d.action==='buy') msg='💰 '+esc(d.buyer)+' 购买了 '+esc(d.seller)+' 的 '+esc(d.item)+(d.total?' 💰'+fn(d.total):'')+(d.qty>1?' x'+d.qty:'');
      if(msg) toast(msg,'info');
    });
    // 世界聊天（防重复注册）
    if(!S._chatInited){
      S._chatInited=true;
      S._chatSeen={};
      socket.on('chat:message',function(m){addChatMsg(m)});
      socket.on('chat:history',function(msgs){for(var i=0;i<msgs.length;i++) addChatMsg(msgs[i])});
    }
  }
  if(socket) socket.emit('user:login',{token:S.token,username:S.user.username});
  await refresh();
  var savedPage2=(function(){try{return localStorage.getItem('hehe_last_page')}catch(e){return null}})();
  go(savedPage2||'dashboard');
  // 定时更新：使用轻量接口刷新顶栏数据（120秒一次）
  if (S._refreshTimer) clearInterval(S._refreshTimer);
  S._refreshTimer = setInterval(async function(){ await refresh(); },120000);
}
// 加载用户上传的头像图片
function loadAvatarImg(uid){
  var img = document.querySelector('#dashboard-avatar');
  if (!img || !uid) return;
  img.src = '/api/avatar/' + encodeURIComponent(uid) + '?_t=' + Date.now();
  img.onerror = function(){ img.style.display = 'none'; };
  img.onload = function(){ img.style.display = ''; };
}
// ==================== 首页 ====================
function pgDashboard(){
  var u=S.user||{},st=S.stats||{};
  var sp=st.special_attrs||{},spCN={crit_rate:'暴击率',crit_dmg:'暴伤',lifesteal:'吸血',dmg_reduce:'减伤',counter:'反击',extra_atk:'连击',exp_bonus:'经验加成',coin_bonus:'金币加成',fire_damage:'火焰伤害'};
  var spHTML='';
  for(var k in sp){if(sp[k])spHTML+='<span style="display:inline-block;margin:2px 4px;padding:2px 8px;border-radius:10px;background:var(--orange-bg);font-size:12px">✨'+(spCN[k]||k)+(k==='fire_damage'?' +'+sp[k]:' +'+(sp[k]*100).toFixed(0)+'%')+'</span>'}
  // 永久属性
  var ps=u.perm_stats||{};
  var psHTML='';
  if(Object.keys(ps).length>0){
    var psCN={hp:'❤️生命',attack:'🗡️攻击',defense:'🛡️防御',speed:'💨速度',attack_speed:'⚡攻速',dodge:'👻闪避',crit_rate:'暴击率',crit_dmg:'暴伤',lifesteal:'吸血'};
    for(var k in ps){if(ps[k])psHTML+='<span style="display:inline-block;margin:2px 4px;padding:2px 8px;border-radius:10px;background:#e8f8e8;font-size:12px">⬆'+(psCN[k]||k)+' +'+ps[k]+'</span>'}
  }
  // 称号
  var titleHTML='';
  if(u.titles&&u.titles.length>0){
    titleHTML='<p style="font-size:13px;margin-top:4px">🏆 称号: '+u.titles.slice(0,5).map(function(t){return esc(t)}).join(' · ')+(u.titles.length>5?' 等'+u.titles.length+'个':'')+'</p>';
  }
  // 同伴
  var loliHTML='';
  if(u.lolis&&u.lolis.length>0){
    var l1=u.lolis[0];
    loliHTML='<p style="font-size:13px">👧 '+esc(l1.name)+' Lv.'+(l1.level||1)+' ❤️'+(l1.exp||0)+'</p>';
  }
  // 职业
  var profHTML='';
  if(u.profession){
    profHTML='<p style="font-size:13px;color:var(--purple)" id="prof-badge">💼 '+esc(u.profession)+' Lv.'+(u.profession_level||1)+'</p>';
  }
  // 副职业
  var subProf=u.sub_professions||{};
  var subHTML='';
  if(subProf.chef||subProf.alchemist){
    var parts=[];
    if(subProf.chef) parts.push('🍳厨师 Lv.'+subProf.chef);
    if(subProf.alchemist) parts.push('🧪药师 Lv.'+subProf.alchemist);
    subHTML='<p style="font-size:13px;color:var(--orange-light)">🌟 '+parts.join(' | ')+'</p>';
    profHTML+=subHTML;
  }
  // Buffs
  var buffHTML='';
  if(u.food_buffs&&u.food_buffs.length>0){
    var buffNames={};
    for(var i=0;i<u.food_buffs.length;i++){var bf=u.food_buffs[i];buffNames[bf.name]=(buffNames[bf.name]||0)+1}
    var buffList=[];for(var bn in buffNames) buffList.push(bn+(buffNames[bn]>1?' x'+buffNames[bn]:''));
    buffHTML='<p style="font-size:12px;color:var(--orange)">🍖 Buff: '+buffList.join(', ')+'</p>';
  }
  if(u.poison_immune>0) buffHTML+='<p style="font-size:12px;color:var(--green)">🛡️ 解毒免疫: '+u.poison_immune+'次</p>';
  if(u.swift_potion>0) buffHTML+='<p style="font-size:12px;color:var(--blue)">⚡ 迅捷: '+u.swift_potion+'次</p>';
  if(u.phoenix_tear) buffHTML+='<p style="font-size:12px;color:var(--orange-light)">🔥 不死鸟之泪: 已激活</p>';
  // 每日任务概览
  var questHTML='';
  var dq=u.daily_quests||[];
  if(dq.length>0){
    var done=dq.filter(function(q){return q.claimed||q.completed}).length;
    questHTML='<p style="font-size:13px">📋 每日任务: '+done+'/'+dq.length+' 完成 <button class="btn btn-outline btn-sm" onclick="go(\'adventure\');setTimeout(function(){S.advTab=\'quests\';pgAdventure()},100)" style="padding:2px 8px;font-size:12px">查看</button></p>';
  }
  var forgeLv=u.forge_level||0;
  var signStreak=u.signin_streak||0;
  // 经验进度（使用后端精确数据）
  var expCur=u.exp||0,expNeed=S.expToNext||0;
  var expTotal=expCur+expNeed,expPct=expTotal>0?Math.min(100,Math.floor((expCur/expTotal)*100)):0;
  // 快捷状态
  var advUsed=(S.rateAdv||{}).used||0,advMax=(S.rateAdv||{}).max||10,advRemain=Math.max(0,advMax-advUsed);
  var fishUsed=(S.rateFish||{}).used||0,fishMax=(S.rateFish||{}).max||30,fishRemain=Math.max(0,fishMax-fishUsed);

  var h='';
  // === 第1行: 角色信息 + 战斗属性 ===
  h+='<div class="grid-2">';
  // 左侧: 角色信息
  // 头像：上传图片 > 自定义emoji > 首字
  var profBg={blacksmith:'var(--yellow)',fisherman:'var(--blue-light)',farmer:'var(--green)',chef:'var(--orange-light)',alchemist:'var(--purple)',miner:'var(--sidebar-nav)'};
  var avatarBg=profBg[u.profession]||'#607d8b';
  var hasImg=u.has_avatar_img;
  var avatarHTML='';
  if(hasImg){
    avatarHTML='<img src="" id="avatar-img" style="width:60px;height:60px;border-radius:50%;object-fit:cover;cursor:pointer;box-shadow:0 3px 8px rgba(0,0,0,0.2)" onclick="pickAvatar()" title="点击更换头像">';
  }else{
    var avatarText=u.avatar||(u.username||'?')[0];
    var avatarSize=u.avatar?'font-size:36px;line-height:58px':'font-size:26px;line-height:58px;font-weight:bold;color:#fff';
    avatarHTML='<div class="player-avatar" onclick="pickAvatar()" title="点击更换头像" style="width:60px;height:60px;border-radius:50%;background:'+avatarBg+';text-align:center;'+avatarSize+';cursor:pointer;flex-shrink:0;box-shadow:0 3px 8px rgba(0,0,0,0.2)">'+avatarText+'</div>';
  }
  h+='<div class="card"><div style="display:flex;align-items:center;gap:14px">'+avatarHTML+'<div><h2 style="margin:0">'+esc(u.equipped_title||'冒险者')+' '+esc(u.username||'?')+'</h2>';
  h+='<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px"><span class="badge badge-r2">Lv.'+(u.level||1)+'</span>';
  h+='<span class="badge" style="background:var(--orange);color:#fff">💰'+fn(u.coins)+'</span>';
  h+='<span class="badge" style="background:var(--blue);color:#fff">📖'+(u.skill_points||0)+'SP</span>';
  if(signStreak>0) h+='<span class="badge" style="background:var(--orange-light);color:#fff">📅连签'+signStreak+'天</span>';
  h+='</div>';
  // 经验进度条
  h+='<div style="margin:6px 0"><span style="font-size:13px">⭐ 经验: '+fn(expCur)+' / '+fn(expTotal)+' ('+expPct+'%)</span>';
  h+='<div class="progress-bar" style="height:8px;margin-top:2px"><div class="fill" style="width:'+expPct+'%;background:linear-gradient(90deg,var(--yellow),var(--yellow))"></div></div></div>';
  // 锻造进度条
  if(forgeLv>0){
    var feNeeded=Math.floor(100*Math.pow(forgeLv,1.3));
    var fePct=feNeeded>0?Math.min(100,Math.floor(((u.forge_exp||0)/feNeeded)*100)):0;
    h+='<div style="margin:4px 0"><span style="font-size:13px">🔨 锻造Lv.'+forgeLv+': '+fn(u.forge_exp||0)+' / '+fn(feNeeded)+'</span>';
    h+='<div class="progress-bar" style="height:6px;margin-top:2px"><div class="fill" style="width:'+fePct+'%;background:linear-gradient(90deg,var(--green),var(--green-light))"></div></div></div>';
  }
  // ❤️ HP血条
  var hpMaxSt=st.hp||100;
  var hpCur=u.current_hp!=null?u.current_hp:hpMaxSt;
  var hpPct2=Math.min(100,Math.max(0,Math.round(hpCur/hpMaxSt*100)));
  var hpColor=hpPct2>60?'var(--hp-green)':(hpPct2>30?'var(--hp-warn)':'var(--hp-danger)');
  h+='<div style="margin:6px 0"><span style="font-size:12px">❤️ HP: '+hpCur+'/'+hpMaxSt+'</span>';
  h+='<div class="progress-bar" style="height:8px;margin-top:2px;background:var(--sidebar-border)"><div class="fill" style="width:'+hpPct2+'%;background:'+hpColor+';border-radius:4px;transition:width .3s"></div></div></div>';
  h+=profHTML;
  h+=titleHTML;
  h+=loliHTML;
  h+=questHTML;
  if(psHTML) h+='<div style="margin-top:4px">'+psHTML+'</div>';
  if(buffHTML) h+=buffHTML;
  // 次数限制
  h+='<div style="margin-top:6px;font-size:12px;color:var(--text-faint)">⚔️冒险剩余: <b style="color:'+(advRemain>0?'var(--green)':'var(--red)')+'">'+advRemain+'/'+advMax+'</b> | 🎣钓鱼剩余: <b style="color:'+(fishRemain>0?'var(--green)':'var(--red)')+'">'+fishRemain+'/'+fishMax+'</b></div>';
  h+='</div></div></div>';
  // 右侧: 战斗属性
  h+='<div class="card"><h2>⚔️ 战斗属性</h2>';
  h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;font-size:14px">';
  h+='<div>⚡ <b>战力</b></div><div style="text-align:right;font-weight:bold;color:var(--orange)">'+fn(st.power||0)+'</div>';
  h+='<div>❤️ 生命</div><div style="text-align:right">'+(st.hp||100)+'</div>';
  h+='<div>🗡️ 攻击</div><div style="text-align:right">'+(st.attack||10)+'</div>';
  h+='<div>🛡️ 防御</div><div style="text-align:right">'+(st.defense||0)+'</div>';
  h+='<div>💨 速度</div><div style="text-align:right">'+(st.speed||0)+'</div>';
  h+='<div>⚡ 攻速</div><div style="text-align:right">'+(st.atk_speed||0)+'</div>';
  h+='<div>👻 闪避</div><div style="text-align:right">'+(st.dodge||0)+'</div>';
  h+='</div>';
  if(spHTML) h+='<div style="margin-top:8px">'+spHTML+'</div>';
  h+='</div></div>';

  // === 第2行: 装备 + 统计 + 快捷 ===
  h+='<div class="grid-2">';
  // 装备栏（异步加载名称）
  h+='<div class="card"><h2>🛡️ 装备</h2><div id="eq-display">加载中...</div>';
  h+='<button class="btn btn-outline btn-sm" style="margin-top:8px" onclick="go(\'equipment\')">🔨 管理装备</button></div>';
  // 统计 + 背包
  h+='<div class="card"><h2>📊 统计</h2>';
  h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 12px;font-size:13px">';
  h+='<div>⚔️ 冒险次数</div><div style="text-align:right">'+fn(u.adventure_count||0)+'</div>';
  h+='<div>💀 击杀怪物</div><div style="text-align:right">'+fn(u.total_monster_kills||0)+'</div>';
  h+='<div>🎣 钓鱼次数</div><div style="text-align:right">'+fn(u.total_fish_count||0)+'</div>';
  h+='<div>🌾 收割次数</div><div style="text-align:right">'+fn(u.total_harvest_count||0)+'</div>';
  if(u.boss_kills) h+='<div>🐉 BOSS击杀</div><div style="text-align:right">'+fn(u.boss_kills)+'</div>';
  if(u.deaths) h+='<div>💀 死亡次数</div><div style="text-align:right">'+fn(u.deaths)+'</div>';
  h+='<div>🎒 背包物品</div><div style="text-align:right">'+fn(S.invTotal||0)+'件</div>';
  h+='</div></div></div>';

  // === 第3行: 快捷 + BOSS ===
  h+='<div class="grid-2">';
  h+='<div class="card"><h2>⚡ 快捷操作</h2>';
  h+='<button class="btn btn-primary btn-sm" onclick="doSign()">'+(S.signed?'✅已签到':'📅签到')+'</button> ';
  h+='<button class="btn btn-green btn-sm" onclick="go(\'adventure\')">⚔️冒险</button> ';
  h+='<button class="btn btn-blue btn-sm" onclick="go(\'fishing\')">🎣钓鱼</button> ';
  h+='<button class="btn btn-orange btn-sm" onclick="go(\'farm\')">🌾收割</button> ';
  h+='<button class="btn btn-outline btn-sm" onclick="go(\'leaderboard\')">🏆排行</button>';
  if(S.pending_lolis) h+='<p style="margin-top:6px;color:var(--purple)">👧 有萝莉等待处理！<button class="btn btn-green btn-sm" onclick="go(\'companions\')">去处理</button></p>';
  h+='</div>';
  h+='<div id="boss-card"></div></div>';

  // === 服务器信息 ===
  h+='<div class="card"><h2>👥 服务器</h2><p>在线: '+(S.online||0)+' 人</p></div>';

  _('content').innerHTML=h;
  // 加载上传的头像图片
  if(u.has_avatar_img) setTimeout(function(){loadAvatarImg(u.id)},200);
  // 公告先插入到内容区最上方
  loadAnnouncements(true);
  loadProfessionBadge();
  loadBossCard();
  loadEquipDisplay();
  startCountdown();
}
async function loadEquipDisplay(){
  var el=document.getElementById('eq-display');
  if(!el) return;
  try {
    var r=await api('/api/forge');
    var weps=r.weapons||[];
    var idToName={}; for(var i=0;i<weps.length;i++){ idToName[weps[i].id]=weps[i].name; idToName[weps[i].name]=weps[i].name; }
    var eq=S.user.equipment||{};
    var slots={weapon:'⚔️',helmet:'🪖',armor:'🛡️',boots:'👢',leggings:'🦵',accessory:'💍'};
    var h='';
    for(var s in slots){
      var en=eq[s]||'',ename=idToName[en]||en||'';
      h+='<span style="display:inline-block;margin:2px 4px;padding:2px 8px;border-radius:6px;background:'+(en?'#fffef0':'#f5f5f5')+';font-size:12px;border:1px solid '+(en?'var(--gold)':'#ddd')+'">'+slots[s]+' '+(en?esc(ename):'空')+'</span>';
    }
    el.innerHTML=h;
  } catch(e){ el.innerHTML='<span style="color:var(--text-faint)">加载失败</span>'; }
}
async function loadProfessionBadge(){
  if(!S.user||!S.user.profession) return;
  var r=await api('/api/profession');
  if(r.current&&r.current.name){
    var el=document.getElementById('prof-badge');
    if(el) el.textContent='💼 '+r.current.icon+' '+r.current.name;
  }
}
async function loadAnnouncements(prepend){
  var r=await api('/api/announcements');
  var announcements=r.announcements||[];
  // 移除旧公告防止重复
  var old=document.getElementById('announcement-card');if(old) old.remove();
  if(announcements.length===0) return;
  var h='<div class="card" id="announcement-card" style="border-left:4px solid var(--orange);margin-bottom:12px"><h2>📢 更新公告</h2>';
  for(var i=0;i<announcements.length;i++){
    var a=announcements[i];
    h+='<div style="padding:10px 0;border-bottom:'+(i<announcements.length-1?'1px solid var(--border-light)':'')+'">';
    h+='<p><b>'+esc(a.title)+'</b> <span style="font-size:12px;color:var(--text-faint)">('+a.date+')</span></p>';
    h+='<p style="font-size:14px;white-space:pre-line">'+esc(a.content)+'</p>';
    if(a.version) h+='<span class="badge badge-r4">'+a.version+'</span>';
    h+='</div>';
  }
  h+='</div>';
  if(prepend) _('content').insertAdjacentHTML('afterbegin',h);
  else _('content').insertAdjacentHTML('beforeend',h);
}
async function loadBossCard(){
  var el=document.getElementById('boss-card');
  if(!el) return;
  try {
    var r=await api('/api/boss');
    var bosses=(r.bosses||[]).filter(function(b){return b.is_alive});
    if(bosses.length===0){
      var cdh2=r.respawn_cooldown_hours||20,da2=r.defeated_at||0;
      var cntdn2='';
      if(da2>0){
        var ra2=da2+cdh2*3600*1000;
        if(Date.now()<ra2) cntdn2='<br><span style="color:var(--orange);font-size:13px">⏰ 冷却剩余: <span data-deadline="'+Math.floor(ra2/1000)+'" data-prefix=""></span></span>';
      }
      el.innerHTML='<div class="card" style="border-left:4px solid var(--text-faint)"><h2>🐉 世界BOSS</h2><p style="color:var(--text-faint)">暂无活跃BOSS，等待刷新…'+cntdn2+'</p></div>';
      return;
    }
    var h='<div class="card" style="border-left:4px solid var(--red)"><h2>🐉 世界BOSS ('+bosses.length+'个活跃)</h2>';
    for(var i=0;i<bosses.length;i++){
      var b=bosses[i],pct=Math.max(0,Math.round(b.hp/b.max_hp*100));
      var barColor=pct>50?'var(--green)':pct>25?'var(--orange)':'var(--red)';
      h+='<div style="margin-bottom:10px;padding-bottom:8px;border-bottom:'+(i<bosses.length-1?'1px solid var(--sidebar-border)':'')+'">';
      h+='<p style="margin:0 0 2px"><b>'+esc(b.name)+'</b> '+rarityLabel(b.rarity)+' <span style="font-size:12px;color:var(--text-faint)">❤️ '+fn(b.hp)+' / '+fn(b.max_hp)+' ('+pct+'%)</span></p>';
      h+='<div class="progress-bar" style="height:10px;margin:4px 0"><div class="fill" style="width:'+pct+'%;background:'+barColor+'"></div></div>';
      h+='<button class="btn btn-primary btn-sm" onclick="atkBossHome(\''+b.id+'\')">⚔️ 攻击</button> ';
      // 攻击冷却
      var la=b.last_attacks||{},myLa=la[S.user.id]||0,cd=((r.config||{}).cooldown||45)*1000;
      var remain=Math.max(0,Math.ceil((cd-(Date.now()-myLa))/1000));
      if(remain>0) h+='<span style="font-size:12px;color:var(--red)">冷却 '+remain+'秒</span>';
      h+='</div>';
    }
    h+='<button class="btn btn-outline btn-sm" onclick="go(\'boss\')">详情</button></div>';
    el.innerHTML=h;
  } catch(e){}
}
async function doSign(){
  var r=await api('/api/signin',{});if(r.error) return toast(r.error,'error');
  var msg='签到+'+fn(r.coins)+'💰';
  if(r.gems && r.gems.length){
    var sc2={attack:'🗡️攻击',defense:'🛡️防御',speed:'💨速度',attack_speed:'⚡攻速',dodge:'👻闪避',hp:'❤️生命',crit_rate:'💥暴击率',crit_dmg:'💢暴伤',lifesteal:'🩸吸血',counter:'↩️反击',damage_reduce:'🛡️减伤',exp_bonus:'📖经验',gold_bonus:'💰金币'};
    for(var gi=0;gi<r.gems.length;gi++){
      var g=r.gems[gi]; msg+=', 💎'+esc(g.name)+' ('+(sc2[g.stat]||g.stat)+'+'+g.value+')';
    }
  }
  toast(msg,'success');await refresh();pgDashboard();
}
// ==================== 冒险 ====================
S.advTab=S.advTab||'adventure';
async function pgAdventure(){
  try {
  if(S.advTab==='quests'){ await pgQuests(); return; }
  var st=S.stats||{},rate=S.user.rate_limits||{},ar=rate.adventure||{};
  var used=ar.count||0,max=10,remain=Math.max(0,max-used); S.advMax=max;
  var now=new Date(),nh=new Date(now);nh.setHours(nh.getHours()+1,0,0,0);
  var resetDl=Math.floor(nh.getTime()/1000);
  // 区域信息
  var regions=await api('/api/regions');
  S.regions=regions;
  var curRegion=regions.current||'random';
  var curRegionName='随机区域';
  if(curRegion!=='random'){ var cr=(regions.regions||[]).find(function(r){return r.id===curRegion}); if(cr) curRegionName=cr.icon+' '+cr.name }
  var w=S.weather||{};
  var h='<div class="card"><h2>⚔️ 冒险 ('+max+'次/小时)</h2>';
  // 天气状态
  h+='<p style="font-size:12px;color:var(--text-faint);margin:4px 0">'+(w.weather_icon||'☀️')+(w.weather||'')+' '+(w.time_icon||'🌅')+(w.time_period||'');
  if(w.adventure_monster_bonus) h+=' <span style="color:var(--red-light)">怪物+'+(Math.round(w.adventure_monster_bonus*100))+'%</span>';
  if(w.adventure_drop) h+=' <span style="color:var(--green)">掉落'+(w.adventure_drop>0?'+':'')+(Math.round(w.adventure_drop*100))+'%</span>';
  h+='</p>';
  // 🎪 活动加成区域
  if(regions.bonus_regions&&regions.bonus_regions.length>0){
    h+='<p style="font-size:12px;color:var(--orange-light);margin:6px 0;background:rgba(255,152,0,.1);padding:6px 10px;border-radius:6px">🎪 <b>活动加成区域：</b>';
    for(var bri=0;bri<regions.bonus_regions.length;bri++){
      var br=regions.bonus_regions[bri];
      if(bri>0) h+=' | ';
      h+=br.name+'（掉+'+(br.drop_bonus*100)+'% 经+'+(br.exp_bonus*100)+'% 币+'+(br.coin_bonus*100)+'% 🎫'+(br.currency_rate*100)+'%）';
    }
    h+='</p>';
  }
  h+='<div class="tabs"><button class="tab'+(S.advTab==='adventure'?' active':'')+'" onclick="S.advTab=\'adventure\';pgAdventure()">⚔️冒险</button>';
  h+='<button class="tab'+(S.advTab==='quests'?' active':'')+'" onclick="S.advTab=\'quests\';pgAdventure()">📋每日任务</button>';
  h+='<button class="tab" onclick="pgAdvRuins()">🏚️ 废墟</button>';
  h+='</div>';
  h+='<p style="margin-top:8px"><b>🗺️ 区域：</b><select id="region-sel" onchange="setRegion(this.value)" style="width:200px;font-size:15px">';
  h+='<option value="random"'+(curRegion==='random'?' selected':'')+'>🎲 随机区域</option>';
  for(var i=0;i<(regions.regions||[]).length;i++){
    var rg=regions.regions[i];
    var rp=rg.recommended_power||0;
    var powerHint='';
    if(rp>0&&rg.unlocked){
      var ratio=(S.stats.power||0)/rp;
      var pc=ratio>=1.5?'var(--green)':ratio>=1?'var(--gold)':ratio>=0.5?'var(--orange-light)':'var(--hp-danger)';
      powerHint=' <span style="font-size:10px;color:'+pc+'">⚡'+fn(rp)+(ratio<1?' ⚠️':'')+'</span>';
    }
    var evtTag='';
    if(rg.event_bonus){
      var eb=rg.event_bonus;
      var ebParts=[];
      if(eb.drop_bonus) ebParts.push('掉落+'+(eb.drop_bonus*100)+'%');
      if(eb.exp_bonus) ebParts.push('经验+'+(eb.exp_bonus*100)+'%');
      if(eb.coin_bonus) ebParts.push('金币+'+(eb.coin_bonus*100)+'%');
      if(eb.currency_rate!=null) ebParts.push('🎫'+(eb.currency_rate*100)+'%');
      evtTag=' 🎪<span style="font-size:9px;color:var(--orange-light)">'+ebParts.join(' ')+'</span>';
    }
    h+='<option value="'+rg.id+'"'+(curRegion===rg.id?' selected':'')+(rg.unlocked?'': ' disabled')+'>'+rg.icon+' '+rg.name+(rg.unlocked?powerHint+evtTag:' (需Lv.'+rg.min_level+')')+'</option>';
  }
  h+='</select> <span style="color:var(--text-faint);font-size:13px">当前：'+curRegionName+'</span></p>';
  // 🏞️ 子区域选择
  var curSubRegion=regions.current_sub_region||'any';
  var curRegionData=(regions.regions||[]).find(function(r){return r.id===curRegion});
  if(curRegionData&&curRegionData.sub_regions&&curRegionData.sub_regions.length>0){
    h+='<p style="margin-top:4px"><b>🏞️ 子区域：</b><select id="sub-region-sel" onchange="setSubRegion(this.value)" style="width:200px;font-size:15px">';
    h+='<option value="any"'+(curSubRegion==='any'?' selected':'')+'>🌐 全区域</option>';
    for(var si=0;si<curRegionData.sub_regions.length;si++){
      var sr=curRegionData.sub_regions[si];
      var srp=sr.recommended_power||0;
      var srPowerHint='';
      if(srp>0&&sr.unlocked){
        var srRatio=(S.stats.power||0)/srp;
        var srPc=srRatio>=1.5?'var(--green)':srRatio>=1?'var(--gold)':srRatio>=0.5?'var(--orange-light)':'var(--hp-danger)';
        srPowerHint=' <span style="font-size:10px;color:'+srPc+'">⚡'+fn(srp)+(srRatio<1?' ⚠️':'')+'</span>';
      }
      h+='<option value="'+sr.id+'"'+(curSubRegion===sr.id?' selected':'')+(sr.unlocked?'': ' disabled')+'>'+sr.icon+' '+sr.name+(sr.unlocked?srPowerHint:' (需Lv.'+sr.min_level+')')+'</option>';
    }
    h+='</select>';
    // 显示当前子区域描述
    var curSrData=curRegionData.sub_regions.find(function(s){return s.id===curSubRegion});
    if(curSrData) h+=' <span style="color:var(--text-faint);font-size:12px">'+esc(curSrData.desc||'')+'</span>';
    h+='</p>';
  }
  // 冒险装备
  h+='<p><b>🎒 装备：</b><select id="adv-gear-sel" onchange="eqAdvGear(this.value)" style="width:200px;font-size:15px"><option value="">无装备</option></select> <span style="font-size:12px;color:var(--text-faint)" id="adv-gear-desc"></span></p>';
  // 🎣 钓鱼装备（水域由当前区域/子区域自动决定）
  h+='<details class=\"card\" style=\"padding:12px;margin:8px 0;font-size:14px\"><summary style=\"cursor:pointer;font-weight:bold;color:var(--blue-light)\">🎣 钓鱼装备</summary>';
  h+='<div class=\"grid-2\" style=\"gap:8px;margin-top:8px\">';
  h+='<div><b>🎣 鱼竿</b><br><select id=\"frd-adv\" onchange=\"eqRod(this.value)\" style=\"width:100%;font-size:13px\"></select></div>';
  h+='<div><b>🪱 鱼饵</b><br><select id=\"fbt-adv\" onchange=\"eqBait(this.value)\" style=\"width:100%;font-size:13px\"><option value=\"none\">不使用</option></select></div>';
  var fr2=S.user.rate_limits||{},fru=fr2.fishing||{},fused=fru.count||0,fmax=30,fremain=Math.max(0,fmax-fused);
  h+='<div><b>🎣 次数</b><br><span style=\"color:'+(fremain>0?'var(--green)':'var(--red)')+'\">'+fremain+'/'+fmax+'</span></div>';
  h+='<div></div>';
  h+='</div>';
  h+='<details style=\"margin-top:8px\"><summary style=\"cursor:pointer;color:var(--gold);font-size:13px\">🪱 合成鱼饵</summary><div style=\"padding:6px 8px;background:var(--bg-input);border-radius:6px;margin-top:4px\"><p style=\"font-size:12px;color:var(--text-faint);margin-bottom:4px\">点击材料选择2-4个，随机合成鱼饵</p><div id=\"bml-adv\" style=\"display:flex;flex-wrap:wrap;gap:4px\"></div><div style=\"margin-top:6px;display:flex;align-items:center;gap:8px\"><span style=\"font-size:13px\">合成</span><input id=\"sbc-adv\" type=\"number\" value=\"1\" min=\"1\" max=\"10\" style=\"width:60px;font-size:13px\"><span style=\"font-size:13px\">批</span><button class=\"btn btn-orange btn-sm\" onclick=\"synthBaitAdv()\" style=\"font-size:12px\">🪱合成</button></div></div></details>';
  h+='</details>';
  setTimeout(function(){loadFishingGearAdv().catch(function(){});loadBaitMatsAdv().catch(function(){});},100);
  // ❤️ HP血条
  var hpMaxA=st.hp||100;
  var hpCurA=S.user.current_hp!=null?S.user.current_hp:hpMaxA;
  var hpPctA=Math.min(100,Math.max(0,Math.round(hpCurA/hpMaxA*100)));
  var hpColorA=hpPctA>60?'var(--hp-green)':(hpPctA>30?'var(--hp-warn)':'var(--hp-danger)');
  h+='<div style="margin:4px 0;display:flex;align-items:center;gap:6px"><span style="font-size:12px">❤️</span><div style="flex:1;height:8px;background:var(--sidebar-border);border-radius:4px;overflow:hidden"><div style="width:'+hpPctA+'%;height:100%;background:'+hpColorA+';border-radius:4px;transition:width .3s"></div></div><span style="font-size:11px;color:var(--text-faint)">'+hpCurA+'/'+hpMaxA+'</span></div>';
  h+='<p style="color:'+(remain>0?'var(--green)':'var(--red)')+'" id="adv-remain">剩余:冒险'+remain+'/'+max+' | 🎣'+fremain+'/30 | 重置:<span data-deadline="'+resetDl+'" data-prefix=""></span></p><p>战力:'+fn(st.power||0)+' | 🗡️'+(st.attack||10)+' 🛡️'+(st.defense||0)+' 💨'+(st.speed||0)+' ⚡'+(st.atk_speed||0)+' 👻'+(st.dodge||0)+'</p><p><input id="ac" type="number" value="1" min="1" max="'+Math.max(max,fremain)+'" style="width:80px"> 次 <button class="btn btn-primary" onclick="doAdv()">⚔️出发</button> <button class="btn btn-blue" onclick="doAdvFish()">🎣钓鱼</button>';
  h+='</p><div id="adv-gear-dura" style="font-size:12px;color:var(--text-faint);margin-bottom:6px"></div><div id="ar"></div></div>';

  if(S.advLog&&S.advLog.length>0){
    h+='<div class="card"><h3>📋 最近冒险记录</h3>';
    for(var i=0;i<Math.min(S.advLog.length,10);i++){
      var x=S.advLog[i],bs=x.battle_summary||{};
      var wc=x.win?'var(--green)':(x.win===false?'var(--red)':'var(--text-faint)');
      h+='<div class="adv-result" style="padding:4px 8px;margin:2px 0;border-left:3px solid '+wc+';cursor:pointer;font-size:13px" onclick="toggleAdvDetail(\''+x._id+'\')">';
      var drops2=x.drops||[];
      if(x.type==='combat') h+=(x.win?'✅':'❌')+(x.isElite?'👹':'')+' vs '+esc(x.monster)+' Lv.'+x.monster_level+' 💰'+(x.coins||0)+(drops2.length?' 📦':'');
      else if(x.type==='loli'){
        h+='👧 '+esc(x.text);
        if(x.has_choice&&!x.auto&&typeof x.loli_index==='number'&&x.loli_index>=0){
          h+=' <button class="btn btn-green btn-sm" onclick="event.stopPropagation();handleLoli('+x.loli_index+',\'adopt\',\''+escAttr(x.loli_name)+'\')" style="padding:2px 8px;font-size:11px">🏠领养</button> <button class="btn btn-blue btn-sm" onclick="event.stopPropagation();handleLoli('+x.loli_index+',\'help\',\''+escAttr(x.loli_name)+'\')" style="padding:2px 8px;font-size:11px">❤️帮助</button>';
        } else if(x.auto) h+=' <span style="font-size:11px;color:var(--text-faint)">'+(x.auto==='adopt'?'🏠已自动领养':'❤️已自动帮助')+'</span>';
      }
      else if(x.type==='treasure'&&x.jackpot) h+='📦 🎰大爆! '+esc(x.text||'');
      else if(x.type==='weapon_drop'){
        var wr=x.rarity||1; var wrc=weaponRarityStyle(wr);
        h+='<span style="'+wrc.color+'">'+wrc.icon+' 🗡️'+esc(x.name)+'</span>';
        if(wr>1) h+=' <span class="badge badge-r'+Math.min(wr,9999)+'">'+(x.rarity_name||'')+'</span>';
      }
      else if(x.type==='system') h+='<span style="color:var(--orange-light)">⚠️</span> '+esc(x.text||'');
      else if(x.ruins_discovered) h+='🏚️ '+esc(x.text||'')+' <button class="btn btn-purple btn-sm" onclick="event.stopPropagation();pgAdvRuins()" style="padding:2px 8px;font-size:11px">🏚️ 探索</button>';
      else if(x.type==='choice'){
        if(x._choiceResolved) h+='🔀 已抉择 '+esc(x.text||'');
        else {
          h+='🔀 <b style="color:var(--purple)">抉择中</b> '+esc(x.text||'');
          var xchoices=x.choices||[];
          h+='<div style="margin:6px 0;display:flex;flex-wrap:wrap;gap:6px" id="choice-btns-'+x._id+'">';
          for(var cj=0;cj<xchoices.length;cj++){
            var xch=xchoices[cj];
            h+='<button class="btn btn-sm" style="background:var(--purple);color:#fff;padding:4px 10px;font-size:13px" onclick="event.stopPropagation();pickChoice('+xch.index+',\''+x._id+'\')">'+esc(xch.text)+'</button>';
          }
          h+='</div>';
        }
      }
      else h+=esc(x.text||'');
      h+='<div id="advd_'+x._id+'" style="display:'+(x._choiceResolved||(x.type==='loli'&&x.has_choice)||x.type!=='choice'?'none':'block')+';margin-top:3px;padding:4px 8px;background:var(--bg-warm);border-radius:3px">';
      if(x._choiceResolved&&x._choiceResultHTML) h+=x._choiceResultHTML;
      else if(x.type==='combat'&&bs.damage_dealt!=null) {
        h+='⚔️伤害:'+bs.damage_dealt+' 🛡️承伤:'+(bs.damage_taken||0)+' 🔄'+bs.turns+'回合 💥'+bs.crits+'暴击';
        var bd=bs.detail||{};
        var extra=[];
        if(bd.lifesteal>0) extra.push('吸血'+bd.lifesteal+'%');
        if(bd.counter>0) extra.push('反击'+bd.counter+'%');
        if(bd.fire_damage>0) extra.push('🔥火伤+'+bd.fire_damage);
        if(bd.player_dmg_reduce>0) extra.push('减伤'+bd.player_dmg_reduce+'%');
        if(extra.length) h+='<br>✨ '+extra.join(' | ');
      }
      else if(x.type==='loli') h+=''+(starDisplay(x.loli_rarity))+' 💰'+(x.coins||0)+' ⭐'+(x.exp||0);
      if(!x._choiceResolved&&drops2.length) h+='<br>📦 掉落: '+drops2.join('、');
      h+='</div></div>';
    }
    h+='</div>';
  }
  // 神秘商人 & 哥布林商人
  var m=await api('/api/merchant');
  if(m.count>0){
    h+='<div class="card merchant-section"><h2>🧙 商人 ('+m.count+'人)</h2>';
    // 神秘商人
    for(var i=0;i<(m.merchants||[]).length;i++){
      var mc=m.merchants[i];
      h+='<div class="card" style="border-left:4px solid var(--orange);margin:8px 0"><p><b>🧙 神秘商人</b>';
      var mcdl=Math.floor((mc.added_at||0)/1000)+300;
      h+=' <span style="font-size:12px;color:var(--text-faint)">⏰ <span data-deadline="'+mcdl+'" data-prefix=""></span>后离开</span></p>';
      h+='<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">';
      for(var j=0;j<(mc.items||[]).length;j++){var mi=mc.items[j];h+='<button class="btn btn-orange btn-sm" onclick="buyMerchant('+i+','+j+')">'+esc(mi.name)+' 💰'+(mi.price||'?')+'</button>'}
      h+='</div></div>';
    }
    // 哥布林商人
    for(var i=0;i<(m.goblin_merchants||[]).length;i++){
      var gc=m.goblin_merchants[i];
      h+='<div class="card" style="border-left:4px solid var(--green);margin:8px 0"><p><b>👺 哥布林商人</b> <span style="color:var(--green);font-size:13px">矿山特供</span>';
      var gcdl=Math.floor((gc.added_at||0)/1000)+300;
      h+=' <span style="font-size:12px;color:var(--text-faint)">⏰ <span data-deadline="'+gcdl+'" data-prefix=""></span>后离开</span></p>';
      h+='<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">';
      for(var j=0;j<(gc.items||[]).length;j++){var gi=gc.items[j];h+='<button class="btn btn-green btn-sm" onclick="buyGoblin('+i+','+j+')">'+esc(gi.name)+' 💰'+(gi.price||'?')+'</button>'}
      h+='</div></div>';
    }
    h+='</div>';
  }
  _('content').innerHTML=h;startCountdown(); loadAdvGear();
  } catch(e) { console.error('pgAdventure 错误:',e); _('content').innerHTML='<div class="card"><h2>⚔️ 冒险</h2><p style="color:var(--red)">页面出错: '+esc(e.message)+'</p><p style="font-size:12px;color:var(--text-faint)">请刷新页面重试</p></div>'; }
}
async function pgAdvRuins(){
  try {
    var r = await api('/api/ruins');
    if (r.current && S.advRuinsMode) { advRenderRuinsGame(r); return; }
    // 📊 按等级从高到低排序
    r.ruins_list = (r.ruins_list||[]).sort(function(a,b){ return (b.min_level||0)-(a.min_level||0); });

    if (!S._ruinsFilter) S._ruinsFilter = { lvl: 'all', ticket: 'all', procedural: 'all', hideLocked: false };

    var h = '<div class="card"><h2>🏚️ 废墟探险</h2><div class="tabs" style="margin-bottom:12px"><button class="tab" onclick="S.advTab=\'adventure\';pgAdventure()">⚔️冒险</button>';
    h += '<button class="tab" onclick="S.advTab=\'quests\';pgAdventure()">📋每日任务</button>';
    h += '<button class="tab active">🏚️废墟</button></div>';
    h += '<p style="font-size:14px;margin-bottom:12px">探索未知的废墟，寻找宝藏与秘密！使用探索券进入。</p>';

    // ── 过滤器 ──
    h += '<div style="margin-bottom:10px;display:flex;flex-wrap:wrap;gap:4px;align-items:center">';
    h += '<span style="font-size:13px;color:var(--text-muted);margin-right:4px">🏷️ 等级:</span>';
    var lvlOpts = [{v:'all',n:'全部'},{v:'1-20',n:'Lv.1-20'},{v:'20-50',n:'Lv.20-50'},{v:'50-100',n:'Lv.50-100'},{v:'100-150',n:'Lv.100-150'},{v:'150+',n:'Lv.150+'}];
    for (var li=0; li<lvlOpts.length; li++) {
      var lo = lvlOpts[li];
      h += '<button class="btn btn-sm '+(S._ruinsFilter.lvl===lo.v?'btn-purple':'btn-outline')+'" style="padding:2px 8px;font-size:11px" onclick="S._ruinsFilter.lvl=\''+lo.v+'\';pgAdvRuins()">'+lo.n+'</button>';
    }
    h += '</div>';
    h += '<div style="margin-bottom:10px;display:flex;flex-wrap:wrap;gap:6px;align-items:center">';
    h += '<span style="font-size:13px;color:var(--text-muted);margin-right:4px">📜 券:</span>';
    var tktOpts = [{v:'all',n:'全部'},{v:'has',n:'🎫 有券'},{v:'none',n:'📭 无券'}];
    for (var ti=0; ti<tktOpts.length; ti++) {
      var to = tktOpts[ti];
      h += '<button class="btn btn-sm '+(S._ruinsFilter.ticket===to.v?'btn-purple':'btn-outline')+'" style="padding:2px 8px;font-size:11px" onclick="S._ruinsFilter.ticket=\''+to.v+'\';pgAdvRuins()">'+to.n+'</button>';
    }
    var procOpts = [{v:'all',n:'全部布局'},{v:'proc',n:'🎲 随机布局'},{v:'fixed',n:'📐 固定布局'}];
    for (var pi=0; pi<procOpts.length; pi++) {
      var po = procOpts[pi];
      h += '<button class="btn btn-sm '+(S._ruinsFilter.procedural===po.v?'btn-purple':'btn-outline')+'" style="padding:2px 8px;font-size:11px" onclick="S._ruinsFilter.procedural=\''+po.v+'\';pgAdvRuins()">'+po.n+'</button>';
    }
    h += '<label style="font-size:12px;color:var(--text-muted);margin-left:8px;cursor:pointer"><input type="checkbox" '+(S._ruinsFilter.hideLocked?'checked':'')+' onchange="S._ruinsFilter.hideLocked=this.checked;pgAdvRuins()"> 🔒 隐藏未解锁</label>';
    h += '</div>';

    // ── 废墟列表 ──
    var genericTicket = r.generic_ticket || '废墟探索卷轴';
    var hasGeneric = S.user && S.user.inventory && S.user.inventory[genericTicket] || 0;
    h += '<div style="margin-bottom:8px;font-size:13px">📜 通用探索券：<b>' + esc(genericTicket) + '</b> ×' + hasGeneric + ' | 探索过的废墟：<b>' + Object.keys(r.ruins_explored||{}).length + '</b> 个</div>';
    h += '<div class="item-grid">';

    var shownCount = 0, hiddenCount = 0;
    for (var i = 0; i < (r.ruins_list || []).length; i++) {
      var ru = r.ruins_list[i];
      var locked = (S.user && S.user.level || 0) < ru.min_level;
      var ticketName = ru.ticket || '废墟探索卷轴';
      var hasSpecific = S.user && S.user.inventory && S.user.inventory[ticketName] || 0;
      var hasTicket = hasSpecific > 0 || hasGeneric > 0;
      var isProc = ru.procedural || ru.room_count === '5~10';
      var explored = (r.ruins_explored||{})[ru.id] || 0;

      // 应用过滤器
      var lvl = ru.min_level||0;
      var f = S._ruinsFilter;
      if (f.lvl==='1-20' && (lvl<1||lvl>20)) continue;
      if (f.lvl==='20-50' && (lvl<20||lvl>50)) continue;
      if (f.lvl==='50-100' && (lvl<50||lvl>100)) continue;
      if (f.lvl==='100-150' && (lvl<100||lvl>150)) continue;
      if (f.lvl==='150+' && lvl<150) continue;
      if (f.ticket==='has' && !hasTicket) continue;
      if (f.ticket==='none' && hasTicket) continue;
      if (f.procedural==='proc' && !isProc) continue;
      if (f.procedural==='fixed' && isProc) continue;
      if (f.hideLocked && locked) { hiddenCount++; continue; }

      shownCount++;
      var rarityClass = locked ? 'rarity-0' : (lvl>=150 ? 'rarity-9999' : lvl>=100 ? 'rarity-999' : lvl>=50 ? 'rarity-4' : lvl>=20 ? 'rarity-3' : 'rarity-2');
      h += '<div class="item-card '+rarityClass+'">';
      h += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><b>🏚️ ' + esc(ru.name) + '</b>';
      if (locked) h += '<span class="badge" style="background:#555">🔒 Lv.'+ru.min_level+'</span>';
      else if (explored>0) h += '<span class="badge" style="background:var(--blue)">👣 ×'+explored+'</span>';
      if (isProc) h += '<span class="badge" style="background:var(--purple)">🎲</span>';
      h += '</div>';
      h += '<small style="color:var(--text-faint)">' + esc(ru.desc || '') + '</small><br>';
      h += '<small>🏚️ ' + (typeof ru.room_count==='number'?ru.room_count+'个':ru.room_count) + '房间 | 🚶' + (ru.max_steps||10) + '步 | ⚠️ Lv.' + ru.min_level + '</small>';
      if (hasSpecific > 0) {
        h += '<br><span class="badge badge-r4">📜 ' + esc(ticketName) + ' ×' + hasSpecific + '</span>';
      } else if (hasGeneric > 0 && !locked) {
        h += '<br><span class="badge badge-r3">📜 通用券</span>';
      } else if (!hasTicket) {
        h += '<br><span class="badge" style="background:#555">📭 无券</span>';
      }
      if (!locked) {
        h += '<br><button class="btn btn-purple btn-sm" style="margin-top:6px" onclick="advEnterRuins(\''+ru.id+'\')" '+(hasTicket?'':'disabled')+'>🏚️ '+(hasTicket?'进入探索':'需要券')+'</button>';
      }
      h += '</div>';
    }
    if (shownCount === 0) {
      h += '<div class="item-card" style="text-align:center;padding:24px;grid-column:1/-1"><p style="font-size:16px">🔍 没有匹配过滤条件的废墟</p></div>';
    }
    h += '</div>';
    if (hiddenCount > 0) h += '<p style="font-size:12px;color:var(--text-faint)">🔒 过滤隐藏了 ' + hiddenCount + ' 个未解锁废墟</p>';
    h += '<p style="margin-top:8px;font-size:12px">探索券通过冒险中「废墟加成」子区域获得</p>';
    h += '</div>';

    if (r.current) {
      h += '<div class="card" style="margin-top:12px"><p style="color:var(--yellow)">⚠️ 你正在废墟探索中！</p>';
      h += '<button class="btn btn-purple btn-sm" onclick="S.advRuinsMode=true;pgAdvRuins()">🏚️ 继续探索</button></div>';
    }
    _('content').innerHTML = h; startCountdown();
  } catch(e) { console.error('pgAdvRuins 错误:',e); _('content').innerHTML='<div class="card"><h2>🏚️ 废墟探险</h2><p style="color:var(--red)">页面出错: '+esc(e.message)+'</p></div>'; }
}
async function buyGoblin(mi,ii){
  var r=await api('/api/merchant/buy',{merchantIndex:mi,itemIndex:ii,isGoblin:true});
  if(r.error) return toast(r.error,'error');
  var msg='购买 '+r.item+' 💰-'+r.price;
  if(r.gem){var sc2={attack:'🗡️攻击',defense:'🛡️防御',speed:'💨速度',attack_speed:'⚡攻速',dodge:'👻闪避',hp:'❤️生命',crit_rate:'💥暴击率',crit_dmg:'💢暴伤',lifesteal:'🩸吸血',counter:'↩️反击',damage_reduce:'🛡️减伤',exp_bonus:'📖经验',gold_bonus:'💰金币'};msg+=' 💎 '+esc(r.gem.name)+' ('+(sc2[r.gem.stat]||r.gem.stat)+'+'+r.gem.value+')'}
  toast(msg,'success');await refresh();
  if(S.page==='adventure'){S._merchantFresh=Date.now();renderMerchant();}
}
async function loadAdvGear(){
  var r=await api('/api/adventure/gear');if(r.error)return;
  var sel=_('adv-gear-sel'),desc=_('adv-gear-desc'),duraEl=_('adv-gear-dura');if(!sel)return;
  sel.innerHTML='<option value="">无装备</option>';
  for(var i=0;i<(r.gear||[]).length;i++){
    var g=r.gear[i],eq=g.name===r.equipped;
    var duraText='';
    if(eq) duraText=' ['+(r.durability||0)+'/'+(g.max_durability||100)+']';
    sel.innerHTML+='<option value="'+g.name+'"'+(eq?' selected':'')+(g.owned?'':' disabled')+'>'+g.name+duraText+(g.owned?'':' (未拥有)')+'</option>';
    if(eq&&desc)desc.textContent=(g.use||'')+' 🔧耐久 '+(r.durability||0)+'/'+(g.max_durability||100);
  }
  if(duraEl){
    if(r.equipped) duraEl.textContent='🔧 '+r.equipped+' 耐久 '+r.durability+'/100';
    else duraEl.textContent='';
  }
}
async function eqAdvGear(n){
  var r=await api('/api/adventure/equip-gear',{gearName:n||''});if(r.error)return toast(r.error,'error');
  toast(n?'装备 '+n:'已卸下装备','success');loadAdvGear();
}
async function setRegion(id){
  var r=await api('/api/adventure/set-region',{regionId:id});
  if(r.error) return toast(r.error,'error');
  toast('切换区域：'+(r.name||r.region),'success');
  pgAdventure();
}
async function setSubRegion(id){
  var r=await api('/api/adventure/set-sub-region',{subRegionId:id});
  if(r.error) return toast(r.error,'error');
  toast('切换子区域：'+(r.name||r.sub_region),'success');
  pgAdventure();
}

// ==================== 每日任务 ====================
async function pgQuests(){
  var r=await api('/api/quests');
  var h='<div class="card"><h2>📋 每日冒险任务</h2>';
  h+='<div class="tabs"><button class="tab" onclick="S.advTab=\'adventure\';pgAdventure()">⚔️冒险</button>';
  h+='<button class="tab active" onclick="S.advTab=\'quests\';pgAdventure()">📋每日任务</button>';
  h+='<button class="tab" onclick="pgAdvRuins()">🏚️ 废墟</button></div>';
  h+='<p style="font-size:14px;color:var(--text-faint)">每日0点刷新，每个人任务不同。完成任务获得丰厚奖励！</p>';
  var quests=r.quests||[];
  if(quests.length===0) h+='<p style="color:var(--text-faint);text-align:center;padding:20px">暂无任务</p>';
  else {
    var allClaimed=true;
    for(var i=0;i<quests.length;i++){
      var q=quests[i],pct=Math.min(100,Math.floor((q.progress||0)/q.target*100));
      var statusIcon=q.claimed?'✅':q.completed?'🎁':'⏳';
      var statusText=q.claimed?'已领取':q.completed?'可领取！':'进行中';
      var bg=q.completed&&!q.claimed?'var(--orange-bg)':'var(--bg-input)';
      var border=q.completed&&!q.claimed?'var(--orange)':'var(--border-light)';
      if(!q.claimed) allClaimed=false;
      h+='<div class="card" style="margin:8px 0;background:'+bg+';border-left:4px solid '+border+'">';
      h+='<p><b>'+statusIcon+' '+esc(q.name)+'</b> <span style="color:'+(q.completed?'var(--green)':'var(--text-faint)')+'">'+statusText+'</span></p>';
      h+='<p style="font-size:14px">'+esc(q.desc)+'</p>';
      h+='<div class="progress-bar" style="margin:4px 0"><div class="fill" style="width:'+pct+'%;background:'+(q.completed?'var(--green)':'var(--blue-light)')+'"></div></div>';
      h+='<p style="font-size:13px;color:var(--text-faint)">进度：'+(q.progress||0)+'/'+q.target+(q.completed?' ✅':'')+'</p>';
      h+='<p style="font-size:13px">奖励：';
      for(var j=0;j<(q.rewards||[]).length;j++){
        var rw=q.rewards[j];
        if(rw.type==='coins') h+='💰'+(rw.amount?rw.amount[0]+'~'+rw.amount[1]:'?')+' ';
        else if(rw.type==='exp') h+='⭐经验 ';
        else if(rw.type==='skill_point') h+='📖技能点 ';
        else if(rw.type==='item') h+='📦'+(rw.name||'物品')+(rw.chance<1?' ('+Math.round(rw.chance*100)+'%)':'')+' ';
      }
      h+='</p>';
      if(q.completed&&!q.claimed) h+='<button class="btn btn-green btn-sm" onclick="claimQuest(\''+q.id+'\')">🎁 领取奖励</button>';
      h+='</div>';
    }
    if(allClaimed) h+='<p style="text-align:center;color:var(--green);padding:10px">🎉 今日任务全部完成！明天再见~</p>';
  }
  h+='</div>';_('content').innerHTML=h;
}
async function claimQuest(id){
  var r=await api('/api/quests/claim',{questId:id});
  if(r.error) return toast(r.error,'error');
  toast('领取 '+r.quest+' 奖励: '+r.rewards.join(', '),'success');
  await refresh();pgQuests();
}
async function buyMerchant(mi,ii){var r=await api('/api/merchant/buy',{merchantIndex:mi,itemIndex:ii});if(r.error)return toast(r.error,'error');var msg='购买 '+r.item+' 💰-'+r.price;if(r.gem){var sc2={attack:'🗡️攻击',defense:'🛡️防御',speed:'💨速度',attack_speed:'⚡攻速',dodge:'👻闪避',hp:'❤️生命',crit_rate:'💥暴击率',crit_dmg:'💢暴伤',lifesteal:'🩸吸血',counter:'↩️反击',damage_reduce:'🛡️减伤',exp_bonus:'📖经验',gold_bonus:'💰金币'};msg+=' 💎 '+esc(r.gem.name)+' ('+(sc2[r.gem.stat]||r.gem.stat)+'+'+r.gem.value+')'}toast(msg,'success');await refresh();if(S.page==='adventure'){S._merchantFresh=Date.now();renderMerchant();}}
async function pickChoice(idx,resultId){
  var r=await api('/api/adventure/choose',{choiceIndex:idx});if(r.error)return toast(r.error,'error');
  var h='';
  if(r.type==='combat'){
    var b=r.battle||{};h+='<b>'+(b.win?'✅ 胜利':'❌ 战败')+'</b>'+(r.elite?' 👹精英':'')+' 💰+'+(r.coins||0)+' ⭐+'+(r.exp||0);
    if(r.drops)h+=' 📦+'+r.drops.join('、');
    var d=b.detail;
    if(d){
      h+='<details style="margin-top:6px;font-size:12px"><summary style="cursor:pointer;color:var(--purple);font-weight:bold">📊 战斗详情</summary>';
      h+='<div style="padding:6px 10px;background:var(--bg-card);border-radius:6px;border:1px solid var(--border-light);margin-top:4px;line-height:1.8">';
      h+='<span style="color:var(--text-faint)">── 玩家属性 ──</span><br>';
      h+='❤️HP:'+d.player_hp+' ⚔️ATK:'+d.player_atk+' 🛡️DEF:'+d.player_def+' 💨SPD:'+d.player_spd+' ⚡ASPD:'+d.player_aspd+'<br>';
      h+='<span style="color:var(--text-faint)">命中率</span> '+(100-Math.round(d.monster_dodge*100))+'% <span style="color:var(--text-faint)">暴击</span> '+Math.round(d.player_crit*100)+'%';
      if(d.player_extra>0) h+=' <span style="color:var(--purple)">额外攻击+'+d.player_extra+'次</span>';
      if(d.lifesteal>0) h+=' <span style="color:var(--red)">吸血'+d.lifesteal+'%</span>';
      if(d.counter>0) h+=' <span style="color:var(--orange)">反击'+d.counter+'%</span>';
      if(d.fire_damage>0) h+=' <span style="color:var(--red-light)">🔥火焰伤害+'+d.fire_damage+'</span>';
      h+='<br><span style="color:var(--text-faint)">── 怪物属性 ──</span><br>';
      h+='❤️HP:'+d.monster_hp+' ⚔️ATK:'+d.monster_atk+' 🛡️DEF:'+d.monster_def+' 💨SPD:'+d.monster_spd+' ⚡ASPD:'+d.monster_aspd+'<br>';
      h+='<span style="color:var(--text-faint)">命中率</span> '+(100-Math.round(d.player_dodge*100))+'% <span style="color:var(--text-faint)">暴击</span> '+Math.round(d.monster_crit*100)+'%';
      if(d.monster_extra>0) h+=' <span style="color:var(--red)">额外攻击+'+d.monster_extra+'次</span>';
      h+='<br><span style="color:var(--text-faint)">── 战斗结果 ──</span><br>';
      h+='造成 <b>'+b.damage_dealt+'</b> 伤害 | 受到 <b>'+b.damage_taken+'</b> 伤害 | 剩余 <b>'+b.hp_remaining+'</b>HP | <b>'+b.turns+'</b> 回合';
      if(b.crits>0) h+=' | 暴击 <b>'+b.crits+'</b> 次';
      if(b.dodges>0) h+=' | 闪避 <b>'+b.dodges+'</b> 次';
      h+='</div></details>';
    }
    if(b.log)h+='<div style="font-size:12px;margin-top:4px;color:#666;max-height:100px;overflow-y:auto">'+b.log.join('<br>')+'</div>';
  }else if(r.type==='treasure'){
    h+='<b>📦 宝箱</b> 💰+'+(r.coins||0)+' ⭐+'+(r.exp||0)+(r.jackpot?' 🎰大爆!':'');
    if(r.drops)h+=' 📦'+r.drops.join('、');
    }else if(r.type==='merchant'){
    h+='<b>🧙 商人</b> '+esc(r.text||'遇到了商人');
  }else if(r.ruins_discovered){
    h+='<b>🏚️ 发现废墟！</b> '+esc(r.text||'')+' ⭐+'+(r.exp||0);
    if(r.ruins_scroll) h+=' 📜废墟探索卷轴x'+r.ruins_scroll;
    h+=' <button class="btn btn-purple btn-sm" onclick="pgAdvRuins()" style="padding:2px 8px;font-size:12px">🏚️ 探索废墟</button>';
  }else{
    h+='<b>📌</b> '+esc(r.text||'')+' ⭐+'+(r.exp||0);
  }  if(r.gem)h+='<br>💎获得宝石: '+r.gem;
  // 更新 S.advLog 对应条目，避免 refresh 后回到未选择状态
  if(S.advLog){ for(var j=0;j<S.advLog.length;j++){ if(S.advLog[j]._id===resultId) { S.advLog[j]._choiceResolved=true; S.advLog[j]._choiceResultHTML=h; break; } } }
  // 在 advd_ 中显示结果（自动展开）
  var el=document.getElementById('advd_'+resultId);if(el){el.style.display='block';el.innerHTML=h;}
  // 隐藏选择按钮，显示结果
  var btnsDiv=document.getElementById('choice-btns-'+resultId);if(btnsDiv)btnsDiv.style.display='none';
  // 轻量更新：只刷新顶栏，不重绘页面
  await refresh();
}
// 🎣 冒险钓鱼
async function doAdv(){
  var c=parseInt(_('ac').value,10)||1;
  var r=await api('/api/adventure',{count:c});if(r.error) return toast(r.error,'error');
  showQuestToasts(r);
  // 🔧 冒险装备耐久提示
  if(r.gear_broken) toast('💔 '+r.gear_broken_name+' 已损坏，消耗1件！','error');
  // save to persistent log
  if(!S.advLog) S.advLog=[];
  for(var i=0;i<(r.results||[]).length;i++){var rx=r.results[i];rx._id='a'+Date.now()+'_'+i;S.advLog.unshift(rx)}
  if(S.advLog.length>50) S.advLog.length=50;
  // build result display
  var gearDura='';
  if(r.gear) gearDura=' 🔧'+r.gear.name+' '+r.gear.durability+'/100';
  var batchMode = r.count > 1 && (S.user||{}).batch_collapse;
  var h='<h3>📋 结果('+r.count+'次) '+(r.region?'📍'+r.region.name+' ':'')+'经验+'+fn(r.total_exp)+' 金币+'+fn(r.total_coins)+gearDura+renderDropList(r.total_drops)+'</h3>';
  if(batchMode) h+='<button class="btn btn-sm btn-outline" style="margin-bottom:4px" onclick="toggleBatchDetail(this)">📋 展开详情</button><div id="batch-detail" style="display:none;max-height:400px;overflow-y:auto">';
  for(var i=0;i<(r.results||[]).length;i++){
    var x=r.results[i],bs=x.battle_summary||{};
    var winCls=x.win?'var(--green)':(x.win===false?'var(--red)':'var(--text-faint)');
    h+='<div class="adv-result" style="padding:6px 10px;margin:2px 0;border-radius:4px;border-left:4px solid '+winCls+';cursor:pointer;background:var(--bg-input)" onclick="toggleAdvDetail(\''+x._id+'\')">';
    if(x.type==='combat'){
      var drops=x.drops||[];
      var wdrops=x.weapon_drops||[];
      var hasGear=wdrops.length>0;
      h+='<b>'+(x.win?'✅ 胜利':'❌ 战败')+(x.isElite?' 👹精英':'')+'</b> vs '+esc(x.monster)+' Lv.'+x.monster_level+' 💰+'+(x.coins||0)+' ⭐+'+(x.exp||0)+(x.isElite?' 🔥2倍奖励':'')+(hasGear?' 🗡️':'')+(drops.length?' 📦+'+drops.join('、'):'');
      h+='<div id="advd_'+x._id+'" style="display:none;margin-top:4px;padding:6px 10px;background:var(--bg-warm);border-radius:4px;font-size:13px">';
      if(bs.damage_dealt!=null) h+='⚔️ 造成伤害: '+bs.damage_dealt+' | 🛡️ 受到伤害: '+(bs.damage_taken||0)+'<br>';
      if(bs.turns) h+='🔄 回合: '+bs.turns+' | 💥 暴击: '+(bs.crits||0)+' | 👻 闪避: '+(bs.dodges||0)+'<br>';
      var bd=bs.detail||{}; var extras=[];
      if(bd.lifesteal>0) extras.push('💉吸血'+bd.lifesteal+'%');
      if(bd.counter>0) extras.push('🔄反击'+bd.counter+'%');
      if(bd.fire_damage>0) extras.push('🔥火伤+'+bd.fire_damage);
      if(bd.player_dmg_reduce>0) extras.push('🛡️减伤'+bd.player_dmg_reduce+'%');
      if(extras.length) h+='✨ '+extras.join(' | ')+'<br>';
      if(x.newbie_protection) h+='🛡️ 新手保护已触发<br>';
      if(drops.length) h+='📦 掉落: '+drops.join('、')+'<br>';
      if(wdrops.length){ h+='<div style="margin-top:4px">'; for(var wi=0;wi<wdrops.length;wi++){var wd=wdrops[wi];var wrc=weaponRarityStyle(wd.rarity||1);var sn={weapon:'⚔️',armor:'🛡️',helmet:'⛑️',boots:'👢',leggings:'🦿',accessory:'💍'};h+='<span style="'+wrc.color+';display:inline-block;margin:2px 4px;padding:2px 8px;background:var(--bg-input);border-radius:4px">'+wrc.icon+' <b>'+esc(wd.name)+'</b> '+(sn[wd.slot]||'')+'</span>';}h+='</div>';}
      h+='</div>';
    } else if(x.type==='loli'){
      h+='<b>👧 萝莉</b> '+esc(x.text);
      if(x.auto) h+=' <span style="font-size:12px">'+(x.auto==='adopt'?'🏠已自动领养':'❤️已自动帮助')+'</span>';
      else { var xloliIdx=typeof x.loli_index==='number'?x.loli_index:-1; if(xloliIdx>=0) h+=' <button class="btn btn-green btn-sm" onclick="event.stopPropagation();handleLoli('+xloliIdx+',\'adopt\',\''+escAttr(x.loli_name)+'\')">🏠领养</button> <button class="btn btn-blue btn-sm" onclick="event.stopPropagation();handleLoli('+xloliIdx+',\'help\',\''+escAttr(x.loli_name)+'\')">❤️帮助</button>'; else h+=' <span style="font-size:11px;color:var(--orange-light)">（同伴已满，无法操作）</span>'; }
      h+='<div id="advd_'+x._id+'" style="display:none;margin-top:4px;padding:6px 10px;background:var(--bg-warm);border-radius:4px;font-size:13px">';
      h+='稀有度: '+starDisplay(x.loli_rarity)+' | 💰+'+(x.coins||0)+' | ⭐+'+(x.exp||0);
      h+='</div>';
    } else if(x.type==='treasure'){
      var twdrops=x.weapon_drops||[];
      h+='<b>📦 宝箱</b> '+esc(x.text)+(x.jackpot?' 🎰<b style="color:var(--orange)">大爆!x'+x.jackpotMult+'</b>':'')+' 💰+'+(x.coins||0)+' ⭐+'+(x.exp||0)+(twdrops.length?' 🗡️':'');
      h+='<div id="advd_'+x._id+'" style="display:none;margin-top:4px;padding:6px 10px;background:var(--bg-warm);border-radius:4px;font-size:13px">';
      if(x.drops) h+='掉落: '+x.drops.join('、')+'<br>';
      if(twdrops.length){ for(var wi=0;wi<twdrops.length;wi++){var wd=twdrops[wi];var wrc=weaponRarityStyle(wd.rarity||1);var sn={weapon:'⚔️',armor:'🛡️',helmet:'⛑️',boots:'👢',leggings:'🦿',accessory:'💍'};h+='<span style="'+wrc.color+';display:inline-block;margin:2px 4px;padding:2px 8px;background:var(--bg-input);border-radius:4px">'+wrc.icon+' <b>'+esc(wd.name)+'</b> '+(sn[wd.slot]||'')+'</span>';}}
      h+='</div>';
    } else if(x.type==='merchant'){
      h+='<b>🧙 商人</b> '+esc(x.text)+' 💰+'+(x.coins||0)+' ⭐+'+(x.exp||0);
      h+='<div id="advd_'+x._id+'" style="display:none;margin-top:4px;padding:6px 10px;background:var(--bg-warm);border-radius:4px;font-size:13px"></div>';
    } else if(x.type==='choice'){
      h+='<b>🔀 抉择</b> '+esc(x.text)+'<div style="margin:6px 0;display:flex;flex-wrap:wrap;gap:6px" id="choice-btns-'+x._id+'">';
      var choices=x.choices||[];
      for(var ci=0;ci<choices.length;ci++){
        var ch=choices[ci];
        h+='<button class="btn btn-sm" style="background:var(--purple);color:#fff;padding:6px 12px;font-size:14px" onclick="event.stopPropagation();pickChoice('+ch.index+',\''+x._id+'\')">'+esc(ch.text)+'</button>';
      }
      h+='</div>';
      h+='<div id="advd_'+x._id+'" style="display:none;margin-top:4px;padding:6px 10px;background:var(--bg-warm);border-radius:4px;font-size:13px"></div>';
    } else if(x.type==='event_currency'){
      h+='<b>🎪 活动</b> '+esc(x.text);
      h+='<div id="advd_'+x._id+'" style="display:none;margin-top:4px;padding:6px 10px;background:var(--bg-warm);border-radius:4px;font-size:13px"></div>';
    } else if(x.type==='weapon_drop'){
      // 🗡️ 装备掉落 — 高稀有度加粗变色
      var r=x.rarity||1;
      var rc=weaponRarityStyle(r);
      var bold=r>=3?'font-weight:bold;':'';
      h+='<b style="'+rc.color+'">'+rc.icon+' '+esc(x.name)+'</b>';
      if(r>1) h+=' <span class="badge badge-r'+Math.min(r,9999)+'">'+esc(x.rarity_name||'')+'</span>';
      var slotNames={weapon:'⚔️武器',armor:'🛡️护甲',helmet:'⛑️头盔',boots:'👢鞋子',leggings:'🦿腿甲',accessory:'💍饰品'};
      h+=' <small style="color:var(--text-faint)">'+(slotNames[x.slot]||x.slot||'装备')+'</small>';
      h+='<div id="advd_'+x._id+'" style="display:none;margin-top:4px;padding:6px 10px;background:var(--bg-warm);border-radius:4px;font-size:13px">';
      if(x.stats){
        var st=x.stats;
        h+='⚔️攻'+st.attack+' 🛡️防'+st.defense+' 💨速'+st.speed+' ⚡攻速'+st.attack_speed+' 👻闪避'+st.dodge+' ❤️血'+st.hp;
      }
      if(x.special&&Object.keys(x.special).length){
        var spLabels={crit_rate:'暴击率',crit_dmg:'暴伤',lifesteal:'吸血',dmg_reduce:'减伤',counter:'反击',extra_atk:'额外攻击',fire_damage:'火伤',exp_bonus:'经验',coin_bonus:'金币',speed:'速度',dodge:'闪避',hp:'生命',defense:'防御',attack:'攻击'};
        var sps=[];
        for(var sk in x.special){
          var sv=x.special[sk];
          var sl=spLabels[sk]||sk;
          sps.push(sl+(sv>=1?'+'+sv:'+'+(sv*100).toFixed(1)+'%'));
        }
        h+='<br>✨ '+sps.join(' | ');
      }
      h+='</div>';
    } else if(x.type==='fishing'){
      if(x.skipped) h+='<b>🎣</b> <span style="color:var(--text-faint)">'+esc(x.text)+'</span>';
      else if(x.fail) h+='<b>🎣</b> <span style="color:var(--text-faint)">'+esc(x.text)+'</span>';
      else h+='<b>🎣</b> '+esc(x.text)+' 💰+'+(x.coins||0)+' ⭐+'+(x.exp||0);
      h+='<div id="advd_'+x._id+'" style="display:none;margin-top:4px;padding:6px 10px;background:var(--bg-warm);border-radius:4px;font-size:13px"></div>';
    } else if(x.ruins_discovered){
      h+='<b>🏚️ 发现废墟！</b> '+esc(x.text)+' ⭐+'+(x.exp||0);
      if(x.ruins_scroll && x.scroll_name) h+=' 📜'+esc(x.scroll_name)+'x'+x.ruins_scroll;
      else if(x.ruins_scroll) h+=' 📜x'+x.ruins_scroll;
      h+=' <button class="btn btn-purple btn-sm" onclick="event.stopPropagation();pgAdvRuins()" style="padding:2px 8px;font-size:12px">🏚️ 探索废墟</button>';
      h+='<div id="advd_'+x._id+'" style="display:none;margin-top:4px;padding:6px 10px;background:var(--bg-warm);border-radius:4px;font-size:13px"></div>';
    } else {
      h+='<b>📌</b> '+esc(x.text)+' 💰+'+(x.coins||0);
      h+='<div id="advd_'+x._id+'" style="display:none;margin-top:4px;padding:6px 10px;background:var(--bg-warm);border-radius:4px;font-size:13px"></div>';
    }
    h+='</div>';
  }
  if(batchMode) h+='</div>'; // close batch-detail
  _('ar').innerHTML=h;
  // 轻量数据更新：只刷新顶栏和S.user，不重绘页面（保护冒险结果展示）
  await refresh();
  // 更新剩余次数显示
  var rate2=S.user.rate_limits||{},ar2=rate2.adventure||{};
  var used2=ar2.count||0,remain2=Math.max(0,10-used2);
  var rEl=_('adv-remain');if(rEl){
    var dl=rEl.querySelector('[data-deadline]'),dlVal=dl?dl.getAttribute('data-deadline'):'';
    rEl.innerHTML='剩余:'+remain2+'/10 | 重置:<span data-deadline="'+dlVal+'" data-prefix=""></span>';
    rEl.style.color=remain2>0?'var(--green)':'var(--red)';
  }
  // 刷新冒险装备耐久显示
  loadAdvGear();
}
async function doAdvFish(){
  var c=parseInt(_('ac').value,10)||1;
  var r=await api('/api/adventure/fish-batch',{count:c});if(r.error)return toast(r.error,'error');
  showQuestToasts(r);
  var h='<h3>🎣 钓鱼结果 ('+r.count+'次) 经验+'+fn(r.total_exp||0)+' 💰+'+fn(r.total_coins||0)+'</h3>';
  for(var i=0;i<(r.results||[]).length;i++){
    var x=r.results[i];var id='fish_'+i;
    if(x.skipped) h+='<div style="padding:4px 8px;margin:2px 0;border-left:3px solid var(--text-faint);cursor:pointer;font-size:13px" onclick="toggleAdvDetail(\''+id+'\')">💔 '+esc(x.text)+'<div id="advd_'+id+'" style="display:none;margin-top:3px;padding:4px 8px;background:var(--bg-warm);border-radius:3px"></div></div>';
    else if(x.fail) h+='<div style="padding:4px 8px;margin:2px 0;border-left:3px solid var(--text-faint);cursor:pointer;font-size:13px" onclick="toggleAdvDetail(\''+id+'\')">💨 '+esc(x.text)+'<div id="advd_'+id+'" style="display:none;margin-top:3px;padding:4px 8px;background:var(--bg-warm);border-radius:3px"></div></div>';
    else h+='<div style="padding:4px 8px;margin:2px 0;border-left:3px solid var(--blue);cursor:pointer;font-size:13px" onclick="toggleAdvDetail(\''+id+'\')">🐟 '+esc(x.name||x.text)+' 💰'+(x.coins||0)+' ⭐'+(x.exp||0)+'<div id="advd_'+id+'" style="display:none;margin-top:3px;padding:4px 8px;background:var(--bg-warm);border-radius:3px"></div></div>';
  }
  _('ar').innerHTML=h;
  await refresh();
  var rate2=S.user.rate_limits||{},fr2=rate2.fishing||{},used2=fr2.count||0,remain2=Math.max(0,30-used2);
  var rEl=_('ac');if(rEl) rEl.max=Math.max((S.advMax||10),remain2);
  var rmEl=_('adv-remain');if(rmEl){var ar=S.user.rate_limits||{},ad=ar.adventure||{},au=ad.count||0,aru=Math.max(0,10-au);rmEl.innerHTML='剩余:冒险'+aru+'/10 | 🎣'+remain2+'/30 | 重置:<span data-deadline="'+Math.floor(new Date(new Date().setHours(new Date().getHours()+1,0,0,0))/1000)+'" data-prefix=""></span>';startCountdown()}
}
function toggleAdvDetail(id){
  var el=document.getElementById('advd_'+id);
  if(el) el.style.display=el.style.display==='none'?'block':'none';
}
function toggleBatchDetail(btn){
  var el=document.getElementById('batch-detail');
  if(!el) return;
  var show=el.style.display==='none';
  el.style.display=show?'block':'none';
  btn.textContent=show?'📋 收起详情':'📋 展开详情';
}
// ==================== 钓鱼 ====================
async function loadFishingGearAdv(){
  var g=await api('/api/fishing/gear');
  var rod=S.user.equipped_rod||'竹竿',bait=S.user.equipped_bait||'';
  var rodEl=_('frd-adv'),baitEl=_('fbt-adv');
  if(rodEl){rodEl.innerHTML='';for(var i=0;i<(g.rods||[]).length;i++){var r=g.rods[i];if(g.owned_rods&&g.owned_rods.indexOf(r.name)>=0) rodEl.innerHTML+='<option value="'+r.name+'"'+(r.name===rod?' selected':'')+'>'+(r.emoji||'🎣')+' '+esc(r.name)+'</option>'}}
  if(baitEl){baitEl.innerHTML='<option value="none"'+(bait==='无'||!bait?' selected':'')+'>不使用</option>';for(var i=0;i<(g.baits||[]).length;i++){var b=g.baits[i],bq=(g.bait_qty||{})[b.name]||0;if(g.owned_baits&&g.owned_baits.indexOf(b.name)>=0) baitEl.innerHTML+='<option value="'+b.name+'"'+(b.name===bait?' selected':'')+'>'+(b.emoji||'🪱')+' '+esc(b.name)+(bq?' x'+bq:'')+'</option>'}}
}
async function loadBaitMatsAdv(){
  var r=await api('/api/bag');var inv=r.inventory||{};
  var bm=['史莱姆粘液','骨片','蜘蛛丝','狼牙','蜂蜜','毒土豆','羊蛋子','蜂王浆','稻草','羽毛'];
  S.bm=[];for(var i=0;i<bm.length;i++){if(inv[bm[i]]) S.bm.push({name:bm[i],count:inv[bm[i]]})}
  S.bs=[];renderBMAdv();
}
function renderBMAdv(){
  var el=_('bml-adv');if(!el) return;var h='';
  for(var i=0;i<(S.bm||[]).length;i++){
    var m=S.bm[i],sel=(S.bs||[]).indexOf(m.name)>=0;
    h+='<span style="display:inline-block;padding:2px 8px;margin:1px;border-radius:3px;border:1px solid '+(sel?'var(--orange)':'var(--border-light)')+';background:'+(sel?'var(--orange-bg)':'var(--bg-input)')+';cursor:pointer;font-size:12px" onclick="toggleBMAdv(\''+m.name+'\')">'+esc(m.name)+' x'+m.count+(sel?' ✅':'')+'</span>';
  }
  el.innerHTML=h||'<span style="color:var(--text-faint);font-size:12px">无可用材料</span>';
}
function toggleBMAdv(n){if(!S.bs)S.bs=[];var i=S.bs.indexOf(n);if(i>=0)S.bs.splice(i,1);else if(S.bs.length<4)S.bs.push(n);else return toast('最多4个材料','error');renderBMAdv()}
async function synthBaitAdv(){var m=S.bs||[];if(m.length<2)return toast('至少选2个材料','error');var cnt=parseInt(_('sbc-adv').value,10)||1;var r=await api('/api/fishing/synth-bait',{materials:m,count:cnt});if(r.error)return toast(r.error,'error');toast('合成 '+cnt+' 批: '+r.summary,'success');await refresh();pgAdventure()}
async function setFishingArea(id){var r=await api('/api/fishing/set-area',{areaId:id});if(r.error)return toast(r.error,'error');toast('前往 '+r.icon+' '+r.name,'success');await refresh();pgAdventure()}
async function eqRod(n){await api('/api/fishing/equip-rod',{rodName:n});await refresh();pgAdventure()}
async function eqBait(n){await api('/api/fishing/equip-bait',{baitName:n==='none'?'none':n});await refresh();pgAdventure()}
// ==================== 农场 ====================
async function pgFarm(){
  var r=await api('/api/farm');if(r.error) return _('content').innerHTML='<div class="card"><h2>错误</h2></div>';
  var f=r.farms||{};



  var lb={plant:'🌱普通',animal:'🐄养殖',material:'💎材料',fruit:'🌳果树'};
  function rs(slots,cfg,type,max){
    var label=lb[type]||type,exp=expandBtn(type,max);
    var h='<h3>'+label+' '+exp+' ('+slots.length+'/'+max+')</h3><div class="item-grid">';
    for(var i=0;i<slots.length;i++){
      var s=slots[i];if(!s||!s.planted_at){h+='<div class="item-card" style="opacity:.4;cursor:pointer" onclick="doPlantIn(\''+type+'\')">🕳️ 空地 - 点击种植</div>';continue}
      var sd=cfg.find(function(c){return c.name===s.seed});if(!sd){h+='<div class="item-card">?</div>';continue}
      var el=Date.now()/1000-s.planted_at;
      // 累积型：按周期计算进度
      var isAcc=sd.accumulate;
      var growTime=sd.growth_time||1;
      var fullCycles=isAcc?Math.floor(el/growTime):0;
      var remain=isAcc?(growTime-(el%growTime)):Math.max(0,growTime-el);
      var pct=isAcc?Math.floor((el%growTime)/growTime*100):Math.min(100,el/growTime*100);
      var rdy=isAcc?fullCycles>0:el>=growTime;
      var totalCycles=(s.accumulated||0)+fullCycles;
      var cdl=Math.floor(Date.now()/1000+remain);
      var maxAcc=sd.max_accumulate||sd.max_cycles||0;
      h+='<div class="item-card '+(rdy?'rarity-3':'')+'" style="'+(isAcc&&totalCycles>0?'border-left:5px solid var(--orange);background:#fff8e1':'')+'"><b>'+esc(sd.name)+'</b>';
      if(isAcc&&totalCycles>0) h+=' <span class="badge" style="background:var(--orange);color:#fff">🔥x'+totalCycles+'</span>';
      h+='<br><small>'+esc(sd.harvest_product||'?')+(isAcc&&totalCycles>0?' ('+fn(parseRange2(sd.harvest_amount,[1,3])*totalCycles)+'预估)':'')+'</small>';
      h+='<div class="progress-bar"><div class="fill" style="width:'+pct+'%;'+(isAcc?'background:linear-gradient(90deg,var(--orange-light),var(--yellow))':'')+'"></div></div>';
      if(isAcc&&totalCycles>0){
        h+='<small>🌱周期'+totalCycles+(maxAcc>0?'/'+maxAcc:'(∞)')+' ⏳<span data-deadline="'+cdl+'" data-prefix=""></span></small>';
        h+='<br><button class="btn btn-orange btn-sm" style="margin-top:6px" onclick="event.stopPropagation();doHarvOne(\''+type+'\','+i+')">🔪收割(x'+totalCycles+')</button> ';
      } else if(rdy){
        h+='<small>✅可收 ⏳<span data-deadline="'+cdl+'" data-prefix=""></span></small>';
      } else {
        h+='<small>⏳<span data-deadline="'+cdl+'" data-prefix=""></span></small>';
      }
      h+='<button class="btn btn-outline btn-sm" style="margin-top:6px;color:var(--red);border-color:var(--red)" onclick="event.stopPropagation();doClearFarm(\''+type+'\','+i+')">🔪 铲除</button></div>';
    }
    for(var i=slots.length;i<max;i++) h+='<div class="item-card" style="opacity:.3;cursor:pointer" onclick="doPlantIn(\''+type+'\')">🕳️ 空地 - 点击种植</div>';
    return h+'</div>';
  }
  function parseRange2(v,def){if(Array.isArray(v))return Math.floor((v[0]+v[1])/2);if(typeof v==='number')return v;return def?Math.floor((def[0]+def[1])/2):1}
  var h='<div class="card"><h2>🌾 农场</h2>';
  // 🍂 季节提示
  var se = r.season || S.season || {};
  var bonusPct = Math.round((se.season_crops_bonus || 0) * 100);
  var seasonalCrops = r.seasonal_crops || [];
  var offCrops = r.off_season_crops || [];
  h += '<div style="padding:8px 12px;margin-bottom:8px;background:rgba(46,204,113,0.1);border-radius:6px;font-size:13px">';
  h += (se.season_icon||'') + ' <b>' + (se.season_name||'') + '</b>';
  if (bonusPct !== 0) h += ' | 生长' + (bonusPct>0?'+':'') + bonusPct + '%';
  if (seasonalCrops.length) h += ' | 🌱当季：' + seasonalCrops.join('、');
  if (offCrops.length) h += ' | <span style="color:var(--red)">🚫非当季：' + offCrops.join('、') + '</span>';
  h += '</div>';
  var arLabel=r.auto_replant?'✅ 自动补种: 开':'❌ 自动补种: 关';
  h+='<button class="btn btn-green btn-sm" onclick="doHarv(\'all\')">🔪收割全部</button> ';
  h+='<button class="btn btn-outline btn-sm" onclick="doPlant()">🌱种植</button> ';
  h+='<button class="btn btn-outline btn-sm" id="btnAutoReplant" style="'+(r.auto_replant?'border-color:var(--green);color:var(--green)':'border-color:var(--red);color:var(--red)')+'" onclick="toggleAutoReplant()">'+arLabel+'</button></div>';
  h+='<div class="card">';
  h+=rs(f.plants||[],(r.nongchang_config||{}).seeds||[],'plant',r.max_plots||3);
  h+=rs(f.animals||[],(r.nongchang_config||{}).animals||[],'animal',r.max_pens||2);
  h+=rs(f.material_plants||[],(r.matfarm_config||r.matform_config||{}).seeds||[],'material',r.max_material_plots||2);
  h+=rs(f.fruit_trees||[],(r.fruit_config||{}).trees||[],'fruit',r.max_fruit_trees||1);
  h+='</div>';_('content').innerHTML=h;startCountdown();
}
function expandBtn(type,cur){if(!S.user||S.user.profession!=="farmer")return "";return ' <button class="btn btn-outline btn-sm" style="font-size:10px;padding:2px 8px" onclick="expandFarm(\''+type+'\')" title="扩建">+</button>'}
async function expandFarm(type){
  if (!S.user || S.user.profession !== 'farmer') return toast('只有农夫职业才能扩建！','error');
  gameConfirm('确定扩建吗？<br><small style="color:var(--text-faint)">花费 💰500 金币 (每种类型价格可能不同)</small>',async function(){var r=await api('/api/farm/expand',{type:type});if(r.error)return toast(r.error,'error');toast('扩建成功！新上限:'+r.new_max+' 💰-'+r.cost,'success');await refresh();pgFarm()})}
async function doClearFarm(type,index){
  gameConfirm('确定铲除这个 <b>'+type+'</b> 格子的作物吗？<br><small style="color:var(--text-faint)">未成熟的作物会退还种子</small>',async function(){
    var r=await api('/api/farm/clear',{farmType:type,index:index});
    if(r.error) return toast(r.error,'error');
    toast('已铲除: '+r.removed,'success');
    await refresh();await pgFarm();
  });
}
async function toggleAutoReplant(){
  var r=await api('/api/farm/auto-replant',{enabled:!(S.user&&S.user.auto_replant)});
  if(r.error) return toast(r.error,'error');
  toast(r.auto_replant?'自动补种已开启':'自动补种已关闭','success');
  await refresh();await pgFarm();
}
async function doHarv(t){
  var r=await api('/api/farm/harvest',{farmType:t});if(r.error) return toast(r.error,'error');
  showQuestToasts(r);
  await refresh();await pgFarm();
  var totalCoins = r.total_coins || 0;
  var harvested = r.harvested || [];
  if (harvested.length === 0) { toast('没有可收割的作物','warning'); return; }
  // 合并同名产物
  var merged = {};
  for (var i = 0; i < harvested.length; i++) {
    var h = harvested[i];
    var key = h.product + (h.byproduct ? '_副产品' : '');
    if (!merged[key]) merged[key] = { product: h.product, count: 0, byproduct: !!h.byproduct, accumulated: h.accumulated || 0 };
    merged[key].count += h.count;
  }
  var items = Object.values(merged);
  var hm = '<div class="modal-overlay" id="im-harv"><div class="modal" style="max-width:460px">';
  hm += '<h2>🌾 收割完成！</h2>';
  hm += '<p style="margin:12px 0">💰 <b>+'+fn(totalCoins)+'</b> 金币 &nbsp; ⭐ <b>+'+fn(r.total_exp||0)+'</b> 经验</p>';
  hm += '<div style="max-height:300px;overflow-y:auto;margin:8px 0">';
  for (var j = 0; j < items.length; j++) {
    var it = items[j];
    var badge = it.accumulated > 1 ? ' <span style="color:var(--orange);font-size:12px">(🔥x'+it.accumulated+'周期)</span>' : '';
    var tag = it.byproduct ? ' <span style="color:var(--text-faint);font-size:11px">[副产物]</span>' : '';
    hm += '<div style="padding:6px 0;border-bottom:1px solid #eee;display:flex;justify-content:space-between"><span>📦 '+esc(it.product)+badge+tag+'</span><b>x'+fn(it.count)+'</b></div>';
  }
  hm += '</div>';
  hm += `<button class="btn btn-green" onclick="document.getElementById('im-harv').remove()">确定</button></div></div>`;
  _('content').insertAdjacentHTML('beforeend', hm);
}
async function doHarvOne(type,index){
  gameConfirm('确定收割这个累积作物吗？<br><small style="color:var(--orange)">将一次性收取所有累积产出</small>',async function(){
    var r=await api('/api/farm/harvest-one',{farmType:type,index:index});
    if(r.error) return toast(r.error,'error');
    await refresh();await pgFarm();
    var hd=r.harvested||{};
    var h='<div class="modal-overlay" id="im-harv1"><div class="modal" style="max-width:400px">';
    h+='<h2>🔪 收割完成</h2>';
    h+='<table class="table"><tr><td>产物</td><td><b>'+esc(hd.product||'?')+'</b> x'+fn(hd.count||0)+'</td></tr>';
    h+='<tr><td>周期</td><td>🔥x'+(hd.cycles||1)+'</td></tr>';
    h+='<tr><td>金币</td><td>💰+'+fn(r.coins||0)+'</td></tr>';
    h+='<tr><td>经验</td><td>⭐+'+fn(r.exp||0)+'</td></tr>';
    if (r.replanted !== undefined) h+='<tr><td>补种</td><td>'+(r.replanted?'✅已自动补种':'❌已移除(达最大周期)')+'</td></tr>';
    h+=`</table><button class="btn btn-green" onclick="document.getElementById('im-harv1').remove()">确定</button></div></div>`;
    _('content').insertAdjacentHTML('beforeend', h);
  });
}
function doPlantIn(type){doPlant(type||'plant')}
function doPlant(type){
  type=type||"plant";
  api('/api/farm').then(function(r){
    var seeds,title;
    if(type==='animal'){seeds=(r.nongchang_config||{}).animals||[];title='🐄 养殖'}
    else if(type==='material'){seeds=(r.matfarm_config||r.matform_config||{}).seeds||[];title='💎 材料种植'}
    else if(type==='fruit'){seeds=(r.fruit_config||{}).trees||[];title='🌳 果树种植'}
    else{seeds=(r.nongchang_config||{}).seeds||[];title='🌱 种植'}
    var offCrops=(type==='plant')?(r.off_season_crops||[]):[];
    var h='<div class="modal-overlay" id="pm"><div class="modal"><h2>'+title+'</h2>';
    if(offCrops.length)h+='<p style="color:var(--red);font-size:12px">🚫 非当季不可种植：'+offCrops.join('、')+'</p>';
    for(var i=0;i<seeds.length;i++){var s=seeds[i];
      var cycleInfo='',growStr=s.growth_time?Math.floor(s.growth_time/60)+'分':'?';
      if(s.accumulate){cycleInfo=' 🔄'+(s.max_cycles>0?'可累积x'+s.max_cycles:'无限累积');}
      else if(s.repeatable){cycleInfo=' 🔄可重复'+(s.max_cycles>0?' x'+s.max_cycles:'');}
      else{cycleInfo=' 🌱一次性';}

      var isFarmer=s.farmer_only&&(!S.user||S.user.profession!=='farmer');
      var isOffS=(type==='plant')&&offCrops.includes(s.name);
      var isLocked=isFarmer||isOffS;
      var reason=isFarmer?'仅农夫可用':(isOffS?'非当季作物':'');
var divStyle=isLocked?'opacity:0.4;cursor:not-allowed':'cursor:pointer';
var titleAttr=isLocked?' title="'+reason+'"':'';
var clickAttr=isLocked?'':' onclick="doPlantAct(\''+type+'\',\''+s.name+'\')"';
h+='<div style="padding:10px;border-bottom:1px solid var(--border-light);'+divStyle+'"'+titleAttr+clickAttr+'>'
+(isFarmer?'🔒':(isOffS?'🚫':'🌱'))+' '+esc(s.name)+' → '+esc(s.harvest_product||'?')
+' (💰'+(s.price||0)+' | ⏱'+growStr+cycleInfo+(isFarmer?' 🔒农夫专属':'')+(isOffS?' 🚫非当季':'')+')</div>';}
    h+='<button class="btn btn-outline btn-sm" style="margin-top:8px" onclick="document.getElementById(\'pm\').remove()">关闭</button></div></div>';
    _('content').insertAdjacentHTML('beforeend',h);
  });
}
async function doPlantAct(t,n){
  var el=document.getElementById('pm');if(el) el.remove();
  var r=await api('/api/farm/plant',{seedName:n,farmType:t});
  if(r.error) return toast(r.error,'error');
  toast('种植 '+n+' x'+r.planted+(r.total_cost>0?' (花费💰'+r.total_cost+')':''),'success');
  await refresh();await pgFarm();
}
// ==================== 商城 ====================
async function pgShop(){
  var r=await api('/api/shop');
  S.shopData={sys:r.shop||[],mat:r.material_shop||[]};
  var h='<div class="card"><h2>🛒 系统商城</h2><div class="item-grid">';
  var shopItems=r.shop||[];
  for(var i=0;i<shopItems.length;i++){var it=shopItems[i],sid='s'+i;h+='<div class="item-card rarity-2">'+ (it.emoji||'📦')+' <b>'+esc(it.name)+'</b> 💰'+it.price+'<br><input id="sq-'+sid+'" type="number" value="1" min="1" max="99" style="width:80px;min-width:80px;margin-top:4px" onclick="event.stopPropagation()"><button class="btn btn-green btn-sm" style="margin-left:4px" onclick="event.stopPropagation();buyShopN(\''+sid+'\')">购买</button></div>'}
  if(shopItems.length===0) h+='<p style="color:var(--text-faint);padding:20px;text-align:center">商城加载中~</p>';
  h+='</div></div><div class="card"><h2>🏪 材料商店</h2><div class="item-grid">';
  var matItems=r.material_shop||[];
  for(var i=0;i<matItems.length;i++){var it=matItems[i],sid='m'+i;h+='<div class="item-card">📦 <b>'+esc(it.name)+'</b> 💰'+it.price+' <small>库存:'+(it.stock||0)+'</small><br><input id="sq-'+sid+'" type="number" value="1" min="1" max="'+(it.stock||1)+'" style="width:80px;min-width:80px;margin-top:4px" onclick="event.stopPropagation()"><button class="btn btn-green btn-sm" style="margin-left:4px" onclick="event.stopPropagation();buyShopN(\''+sid+'\')">购买</button></div>'}
  if(matItems.length===0) h+='<p style="color:var(--text-faint);padding:20px;text-align:center">今日材料已刷新，请稍后再来~</p>';
  h+='</div></div>';_('content').innerHTML=h;
}
function buyShopN(id){var a=parseInt(_('sq-'+id)?.value,10)||1;var n,st;if(id[0]==='m'){var i=parseInt(id.slice(1),10);var mi=(S.shopData||{}).mat||[];n=(mi[i]||{}).name;st='material'}else{var i=parseInt(id.slice(1),10);var si=(S.shopData||{}).sys||[];n=(si[i]||{}).name;st='system'}if(!n)return;buyShop(n,a,st)}
async function buyShop(n,a,shopType){a=a||1;var r=await api('/api/shop/buy',{itemName:n,amount:a,shop_type:shopType||'system'});if(r.error) return toast(r.error,'error');var msg='购买 '+n+' x'+r.amount+' 💰'+r.total_cost;if(r.gems && r.gems.length){var sc2={attack:'🗡️攻击',defense:'🛡️防御',speed:'💨速度',attack_speed:'⚡攻速',dodge:'👻闪避',hp:'❤️生命',crit_rate:'💥暴击率',crit_dmg:'💢暴伤',lifesteal:'🩸吸血',counter:'↩️反击',damage_reduce:'🛡️减伤',exp_bonus:'📖经验',gold_bonus:'💰金币'};for(var gi=0;gi<r.gems.length;gi++){var g=r.gems[gi];msg+=', 💎'+esc(g.name)+' ('+(sc2[g.stat]||g.stat)+'+'+g.value+')'}}toast(msg,'success');await refresh();pgShop()}
// ==================== 全球市场 ====================
function rarityLabel(r){return r>=9999?'👑👑':r>=999?'👑':r>=4?'💎':r>=3?'🌟':r>=2?'⭐':''}function rarityColor(r){return r>=9999?'var(--red-light)':r>=999?'var(--yellow)':r>=4?'var(--purple)':r>=3?'var(--blue)':r>=2?'var(--green)':'var(--text-faint)'}var catCN={ore:'矿石',material:'材料',product:'产物',fish:'鱼',junk:'垃圾',shop:'商城',gem:'宝石',special:'特殊',consume:'消耗品',food:'🍽️食物',seed:'种子',animal:'幼崽',weapon:'武器',unknown:'其他'};
// 渲染武器属性摘要
function weaponShort(w){var s=w.stats||w;var p=[];if(s.attack)p.push('🗡'+s.attack);if(s.defense)p.push('🛡'+s.defense);if(s.speed)p.push('💨'+s.speed);if(s.attack_speed)p.push('⚡'+s.attack_speed);if(s.dodge)p.push('👻'+s.dodge);if(s.hp)p.push('❤'+s.hp);return p.join(' ')}
function weaponFull(w,h){
  var s=w.stats||w;
  h+='<div style="margin:8px 0;padding:10px;background:#1a120b;border-radius:6px;border:1px solid var(--text-dim)">';
  h+='<p><b>⚔️ '+esc(w.name)+'</b> '+(rarityLabel(w.rarity))+(w.weapon_level?' Lv.'+w.weapon_level:'')+'</p>';
  if(w.type) h+='<p>类型: '+esc(w.type)+'</p>';
  if(s.attack) h+='<p>🗡️攻击: <b>'+s.attack+'</b></p>';
  if(s.defense) h+='<p>🛡️防御: <b>'+s.defense+'</b></p>';
  if(s.speed) h+='<p>💨速度: <b>'+s.speed+'</b></p>';
  if(s.hp) h+='<p>❤️生命: <b>'+s.hp+'</b></p>';
  if(s.attack_speed) h+='<p>⚡攻速: <b>'+s.attack_speed+'</b></p>';
  if(s.dodge) h+='<p>👻闪避: <b>'+s.dodge+'</b></p>';
  if(w.special_attrs){h+='<p style="color:var(--orange-light)">✨';var spCN2={crit_rate:'暴击率',crit_dmg:'暴伤',lifesteal:'吸血',dmg_reduce:'减伤',counter:'反击',extra_atk:'连击',fire_damage:'火焰伤害'};for(var k in w.special_attrs){if(w.special_attrs[k])h+=' '+(spCN2[k]||k)+(k==='fire_damage'?' +'+w.special_attrs[k]:' +'+(w.special_attrs[k]*100).toFixed(0)+'%')}h+='</p>'}
  h+='</div>';return h;
}
// 详情弹窗（支持名字查询或直接传武器数据）
async function showItemDetail(name,weaponData){
  if(weaponData){var ws=weaponData.stats||weaponData;var d={name:weaponData.name||name,rarity:weaponData.rarity,is_weapon:true,weapon_type:weaponData.type,level:weaponData.weapon_level,attack:ws.attack,defense:ws.defense,speed:ws.speed,attack_speed:ws.attack_speed,dodge:ws.dodge,hp:ws.hp,specials:weaponData.special_attrs,crafter:weaponData.crafter};}
  else {var d=await api('/api/item-detail?name='+encodeURIComponent(name));if(d.error)return toast(d.error,'error')}
  var h='<div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:999;display:flex;align-items:center;justify-content:center"><div class="card" style="max-width:420px;max-height:80vh;overflow-y:auto;margin:20px">';
  h+='<h2>'+(d.emoji||'📦')+' '+esc(d.name)+' '+(rarityLabel(d.rarity))+'</h2>';
  h+='<p>📂分类: '+(catCN[d.category]||d.category||'其他')+' | ⭐稀有度: '+(d.rarity||0)+'</p>';
  if(d.source) h+='<p>📍来源: '+esc(d.source)+'</p>';
  if(d.use) h+='<p>🔧用途: '+esc(d.use)+'</p>';
  if(d.desc) h+='<p>📝 '+esc(d.desc)+'</p>';
  if(d.is_weapon) h=weaponFull(d,h);
  h+='<p><button class="btn btn-outline btn-sm" onclick="this.closest(\'div[style*=fixed]\').remove()">关闭</button></p>';
  h+='</div></div>';_('content').insertAdjacentHTML('beforeend',h);
}
async function pgMarket(){
  try {
  S.mktPage=S.mktPage||1;S.mktTab=S.mktTab||'listings';
  var pageSize=window.innerWidth<=768?2:15;
  // 并行加载所有数据，加快页面渲染
  var results=await Promise.all([api('/api/market'),api('/api/bag'),api('/api/forge'),api('/api/gems'),api('/api/market/bids')]);
  var r=results[0],b=results[1],f=results[2],g=results[3],bids=results[4];
  if(r.error){_('content').innerHTML='<div class="card"><h2>🌍 全球市场</h2><p style="color:var(--red)">加载失败: '+esc(r.error)+'</p></div>';return}
  S.mktBids=(bids&&bids.bids)||[];
  var inv=(b&&b.inventory)||{},items=[];
  try { for(var n in inv){if(/\*\d+$/.test(n))continue;items.push({name:n,count:inv[n],kind:'item'})} } catch(e){}
  var equipped={},eq=(S.user&&S.user.equipment)||{};
  for(var k in eq){if(eq[k])equipped[eq[k]]=true}
  var fw=f.weapons||[];
  for(var i=0;i<fw.length;i++){if(!equipped[fw[i].id]&&!equipped[fw[i].name])items.push({name:fw[i].name,count:1,kind:'weapon',weapon:fw[i]})}
  // 宝石上架
  var gems2=g.gems||[];for(var i=0;i<gems2.length;i++){items.push({name:gems2[i].name,count:1,kind:'gem',gem:gems2[i]})}
  S.mktItems=items;
  S.mktListings=r.market||[];
  S.mktSearch=S.mktSearch||'';
  S.mktCat=S.mktCat||'all';
  var h='<div class="card"><h2>🌍 全球市场</h2>';
  // 搜索 & 标签
  h+='<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">';
  h+='<input id="mkt-search" placeholder="🔍 搜索物品..." value="'+escAttr(S.mktSearch)+'" style="flex:1;min-width:120px" oninput="if(this.isComposing)return;mktSearchInput(this.value)" oncompositionstart="this.isComposing=true" oncompositionend="this.isComposing=false">';
  h+='<button class="tab'+(S.mktTab==='listings'?' active':'')+'" onclick="S.mktTab=\'listings\';S.mktPage=1;pgMarket()">📦 出售 ('+S.mktListings.length+')</button>';
  h+='<button class="tab'+(S.mktTab==='bids'?' active':'')+'" onclick="S.mktTab=\'bids\';S.mktPage=1;pgMarket()">📋 求购 ('+S.mktBids.length+')</button>';
  h+='</div>';

  if(S.mktTab==='bids'){
    var filteredBids=S.mktBids;
    if(S.mktSearch) filteredBids=filteredBids.filter(function(b){return b.item.indexOf(S.mktSearch)>=0});
    var total2=filteredBids.length,tp2=Math.max(1,Math.ceil(total2/pageSize));
    if(S.mktPage>tp2)S.mktPage=tp2;
    var start2=(S.mktPage-1)*pageSize,pageBids=filteredBids.slice(start2,start2+pageSize);
    if(tp2>1||S.mktSearch){h+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap">';
      h+='<button class="btn btn-outline btn-sm" onclick="S.mktPage=1;pgMarket()">⏮</button>';
      h+='<button class="btn btn-outline btn-sm" onclick="S.mktPage=Math.max(1,'+(S.mktPage-1)+');pgMarket()">◀</button>';
      h+='<span style="padding:4px 12px;font-weight:bold">'+S.mktPage+'/'+tp2+'</span>';
      h+='<button class="btn btn-outline btn-sm" onclick="S.mktPage=Math.min('+tp2+','+(S.mktPage+1)+');pgMarket()">▶</button>';
      h+='<button class="btn btn-outline btn-sm" onclick="S.mktPage='+tp2+';pgMarket()">⏭</button>';
      h+='<span style="color:var(--text-faint);font-size:13px">共'+total2+'条</span></div>';}
    if(total2>0){
      h+='<table class="table"><tr><th>求购者</th><th>物品</th><th>数量</th><th>单价</th><th>操作</th></tr>';
      for(var i=0;i<pageBids.length;i++){
        var bd=pageBids[i],isMine2=bd.buyer_id===S.user.id,have=inv[bd.item]||0;
        h+='<tr ><td>'+esc(bd.buyer)+'</td><td>📦 '+esc(bd.item)+'</td><td>x'+bd.qty+'</td><td>💰'+fn(bd.price)+'</td><td style="white-space:nowrap">';
        if(isMine2)h+='<button class="btn btn-outline btn-sm" onclick="cancelBid(\''+bd.id+'\')">取消</button>';
        else {
          var maxSell=Math.min(have,bd.qty);
          h+='<button class="btn btn-green btn-sm" onclick="fulfillBid(\''+bd.id+'\','+maxSell+')" '+(have<1?'disabled':'')+'>全部出售('+maxSell+'个)</button>';
        }
        h+='</td></tr>';
      }
      h+='</table>';
    }else h+='<p style="color:var(--text-faint);padding:20px;text-align:center">暂无求购</p>';
    // 发起求购
    h+='<p style="margin-top:14px"><input id="bid-name" placeholder="物品名称" style="width:180px"> ';
    h+='<input id="bid-q" type="number" value="1" min="1" max="99" style="width:70px" title="数量"> 个 @';
    h+='<input id="bid-p" type="number" placeholder="单价" min="1" style="width:90px"> 💰/个';
    h+=' <button class="btn btn-orange btn-sm" onclick="createBid()">发起求购</button>';
    h+='<br><small style="color:var(--text-faint)">求购需要预付全额金币，取消后退还</small></p>';
  }else{
    var filteredListings=S.mktListings;
    if(S.mktSearch) filteredListings=filteredListings.filter(function(l){return l.item.indexOf(S.mktSearch)>=0});
    // 分类过滤
    h+='<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">';
    var cats=[{id:'all',name:'📋 全部'},{id:'item',name:'🎒 物品'},{id:'weapon',name:'⚔️ 武器'},{id:'gem',name:'💎 宝石'}];
    for(var ci=0;ci<cats.length;ci++) h+='<button class="tab'+(S.mktCat===cats[ci].id?' active':'')+'" onclick="S.mktCat=\''+cats[ci].id+'\';S.mktPage=1;pgMarket()">'+cats[ci].name+'</button>';
    h+='</div>';
    if(S.mktCat!=='all') filteredListings=filteredListings.filter(function(l){return l.type===S.mktCat});
    var total=filteredListings.length,totalPages=Math.max(1,Math.ceil(total/pageSize));
    if(S.mktPage>totalPages) S.mktPage=totalPages;
    var start=(S.mktPage-1)*pageSize,pageItems=filteredListings.slice(start,start+pageSize);
    if(totalPages>1){
      h+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap">';
      h+='<button class="btn btn-outline btn-sm" onclick="S.mktPage=1;pgMarket()" '+(S.mktPage===1?'disabled':'')+'>⏮</button>';
      h+='<button class="btn btn-outline btn-sm" onclick="S.mktPage=Math.max(1,'+(S.mktPage-1)+');pgMarket()" '+(S.mktPage===1?'disabled':'')+'>◀</button>';
      h+='<span style="padding:4px 12px;font-weight:bold">'+S.mktPage+' / '+totalPages+'</span>';
      h+='<button class="btn btn-outline btn-sm" onclick="S.mktPage=Math.min('+totalPages+','+(S.mktPage+1)+');pgMarket()" '+(S.mktPage===totalPages?'disabled':'')+'>▶</button>';
      h+='<button class="btn btn-outline btn-sm" onclick="S.mktPage='+totalPages+';pgMarket()" '+(S.mktPage===totalPages?'disabled':'')+'>⏭</button>';
      h+='<span style="color:var(--text-faint);font-size:13px">共'+total+'件，每页'+pageSize+'件</span></div>';
    }
    if(total>0){
      h+='<table class="table"><tr><th>卖家</th><th>物品</th><th>属性</th><th>数量</th><th>单价</th><th>操作</th></tr>';
      for(var i=0;i<pageItems.length;i++){
        var l=pageItems[i],isMine=l.seller_id===S.user.id,isWpn=l.type==='weapon',isGem=l.type==='gem',w=l.weapon,q=(l.qty||1);
        h+='<tr style="cursor:pointer" onclick="showMktDetail(\''+esc(l.id)+'\','+i+')">';
        h+='<td>'+esc(l.seller)+'</td>';
        h+='<td>'+(isWpn?'⚔️ ':isGem?'💎 ':'')+esc(l.item)+(isWpn&&w?' '+(rarityLabel(w.rarity)):isGem?' '+(rarityLabel(l.gem?l.gem.rarity:1)):'')+'</td>';
        h+='<td style="font-size:12px;color:var(--text-faint)">'+(isWpn&&w?weaponShort(w):isGem&&l.gem?'💎'+(l.gem.stat||'')+'+'+l.gem.value:'—')+'</td>';
        h+='<td>'+(!isWpn&&!isGem?q:'1')+'</td>';
        h+='<td>💰'+fn(l.price)+'</td>';
        h+='<td style="white-space:nowrap">'+(isMine
          ?'<button class="btn btn-outline btn-sm" onclick="event.stopPropagation();unlistMkt(\''+l.id+'\')">下架</button>'
          :(!isWpn&&!isGem
            ?'<input id="mq-'+l.id+'" type="number" value="1" min="1" max="'+q+'" style="width:80px;min-width:80px;max-width:80px" onclick="event.stopPropagation()" title="购买数量"> <button class="btn btn-green btn-sm" onclick="event.stopPropagation();buyMkt(\''+l.id+'\')">购买</button>'
            :'<button class="btn btn-green btn-sm" onclick="event.stopPropagation();buyMkt(\''+l.id+'\')">购买</button>')
        )+'</td></tr>';
      }
      h+='</table><p style="font-size:13px;color:var(--text-faint)">💡 点击物品行查看市场详情 | 可输入数量分批购买</p>';
    }else h+='<p style="color:var(--text-faint);padding:20px;text-align:center">暂无商品</p>';
    // 最近交易记录
    h+='</div><div class="card"><h3>📜 最近交易</h3>';
    try {
      var th=await api('/api/market/history'),txs=th.history||[];
      if(txs.length===0) h+='<p style="color:var(--text-faint);font-size:14px">暂无交易记录</p>';
      else {
        h+='<div style="max-height:240px;overflow-y:auto"><table class="table" style="font-size:13px"><tr><th>时间</th><th>买家</th><th>卖家</th><th>物品</th><th>x量</th><th>💰总价</th></tr>';
        for(var i=0;i<Math.min(txs.length,20);i++){
          var tx=txs[i],ago=Math.floor((Date.now()-tx.time)/1000);
          var agoStr=ago<60?ago+'秒前':ago<3600?Math.floor(ago/60)+'分前':ago<86400?Math.floor(ago/3600)+'时前':Math.floor(ago/86400)+'天前';
          h+='<tr><td style="font-size:11px;color:var(--text-faint)">'+agoStr+'</td><td>'+esc(tx.buyer)+'</td><td>'+esc(tx.seller)+'</td><td>'+(tx.type==='weapon'?'⚔️':'')+esc(tx.item)+'</td><td>x'+tx.qty+'</td><td>💰'+fn(tx.total)+'</td></tr>';
        }
        h+='</table></div>';
      }
    }catch(e){ h+='<p style="color:var(--text-faint)">加载交易记录失败</p>'; }
    // 上架区域（搜索+下拉+手动输入）
    h+='<p style="margin-top:14px"><input id="mkt-sel-name" placeholder="输入物品名称筛选..." style="width:200px" oninput="filterMktItems()">';
    h+=' <select id="mkt-sel" style="width:260px" onchange="onMktSel()"><option value="">选择物品</option>';
    h+='</select> <input id="mkt-q" type="number" value="1" min="1" max="99" style="width:80px;min-width:80px" title="数量"> 个';
    h+='<div id="mkt-preview" style="margin-top:6px"></div>';
    h+=' <input id="mkt-p" type="number" placeholder="单价" min="1" style="width:90px"> 💰/个';
    h+=' <button class="btn btn-orange btn-sm" onclick="listMkt()">上架</button></p>';
    // 保存物品列表供筛选用
    S._mktAllItems=items;
    h+='</div>';
  }
  _('content').innerHTML=h;
	  
  // 渲染物品下拉列表（内联<script>在innerHTML中不会执行，需直接调用）
  if(S.mktTab==='listings') renderMktItems('');
  } catch(e) { console.error('pgMarket 错误:',e); _('content').innerHTML='<div class="card"><h2>🌍 全球市场</h2><p style="color:var(--red)">页面出错: '+esc(e.message)+'</p><p style="font-size:12px;color:var(--text-faint)">请刷新页面重试</p></div>'; }
}
// -- 市场搜索防抖，修复输入框失焦问题 --

var mktSearchTimer;
function mktSearchInput(val){
  S.mktSearch=val;S.mktPage=1;
  if(mktSearchTimer) clearTimeout(mktSearchTimer);
  mktSearchTimer=setTimeout(function(){
    var p=pgMarket();
    if(p&&p.then) p.then(function(){
      var el=document.getElementById('mkt-search');
      if(el){el.focus();el.setSelectionRange(val.length,val.length);}
    });
  },300);
}
function mktFilterDOM(){}

function renderMktItems(filter){
  var sel=document.getElementById('mkt-sel');
  if(!sel) return;
  var cur=sel.value;
  var items=S._mktAllItems||[];
  var f=filter?filter.toLowerCase():'';
  var opts=['<option value="">选择物品</option>'];
  for(var i=0;i<items.length;i++){
    var it=items[i];
    if(f && it.name.toLowerCase().indexOf(f)<0) continue;
    var pre=it.kind==='weapon'?'⚔️ ':it.kind==='gem'?'💎 ':'🎒 ';
    opts.push('<option value="'+i+'">'+pre+esc(it.name)+(it.count>1?' x'+it.count:'')+'</option>');
  }
  sel.innerHTML=opts.join('');
  if(cur) sel.value=cur;
}
function filterMktItems(){
  var inp=document.getElementById('mkt-sel-name');
  if(inp) renderMktItems(inp.value);
}
function showMktDetail(lid,pi){
  var all=S.mktListings||[],l=null;
  for(var i=0;i<all.length;i++){if(all[i].id===lid){l=all[i];break}}
  if(!l) return;
  var isWpn=l.type==='weapon',w=l.weapon,q=(l.qty||1);
  var h='<div class="modal-overlay"><div class="modal" style="max-width:480px">';
  h+='<h2>'+(isWpn?'⚔️ ':'📦 ')+esc(l.item)+'</h2>';
  h+='<table class="table"><tr><td>卖家</td><td><b>'+esc(l.seller)+'</b></td></tr>';
  h+='<tr><td>类型</td><td>'+(isWpn?'武器':'普通物品')+'</td></tr>';
  if(!isWpn) h+='<tr><td>库存</td><td>'+q+' 个</td></tr>';
  h+='<tr><td>单价</td><td>💰'+fn(l.price)+'</td></tr>';
  if(isWpn&&w){
    var wst=w.stats||w;
    h+='<tr><td>稀有度</td><td>'+(rarityLabel(w.rarity)||'⭐')+'</td></tr>';
    if(wst.attack) h+='<tr><td>🗡️攻击</td><td>'+wst.attack+'</td></tr>';
    if(wst.defense) h+='<tr><td>🛡️防御</td><td>'+wst.defense+'</td></tr>';
    if(wst.speed) h+='<tr><td>💨速度</td><td>'+wst.speed+'</td></tr>';
    if(wst.hp) h+='<tr><td>❤️生命</td><td>'+wst.hp+'</td></tr>';
    if(wst.attack_speed) h+='<tr><td>⚡攻速</td><td>'+wst.attack_speed+'</td></tr>';
    if(wst.dodge) h+='<tr><td>👻闪避</td><td>'+wst.dodge+'</td></tr>';
    if(w.weapon_level) h+='<tr><td>🔰武器等级</td><td>Lv.'+w.weapon_level+'</td></tr>';
    if(w.crafter) h+='<tr><td>🔨锻造者</td><td>'+esc(w.crafter)+'</td></tr>';
  }
  h+='<tr><td>上架时间</td><td>'+new Date(l.listed_at).toLocaleString()+'</td></tr></table>';
  h+='<div style="margin-top:14px;display:flex;gap:10px;align-items:center;justify-content:flex-end;flex-wrap:wrap">';
  if(l.seller_id!==S.user.id){
    if(!isWpn) h+='<span>购买</span><input id="mbq-'+l.id+'" type="number" value="1" min="1" max="'+q+'" style="width:80px;min-width:80px;max-width:80px"><span>个</span>';
    h+='<button class="btn btn-green" onclick="document.getElementById(\'im-mkt\').remove();buyMktD(\''+l.id+'\')">💰 购买'+(isWpn?' ('+fn(l.price)+')':'')+'</button>';
  }
  else h+='<button class="btn btn-outline" onclick="document.getElementById(\'im-mkt\').remove();unlistMkt(\''+l.id+'\')">📥 下架</button>';
  h+='<button class="btn btn-outline btn-sm" onclick="document.getElementById(\'im-mkt\').remove()">关闭</button></div></div></div>';
  var old=document.getElementById('im-mkt');if(old) old.remove();
  h='<div id="im-mkt">'+h+'</div>';
  _('content').insertAdjacentHTML('beforeend',h);
}
async function onMktSel(){
  var s=_('mkt-sel'),i=parseInt(s.value, 10),pv=_('mkt-preview');
  if(!pv) return;
  if(isNaN(i)||!S.mktItems||!S.mktItems[i]){pv.innerHTML='';return}
  var it=S.mktItems[i],qel=_('mkt-q');
  if(it.kind==='weapon'){if(qel){qel.value=1;qel.max=1;qel.disabled=true}S.mktSelWeapon=it.weapon}
  else {if(qel){qel.disabled=false;qel.max=it.count}S.mktSelWeapon=null}
  // 显示预览信息
  pv.innerHTML='<span style="color:var(--text-faint)">加载中...</span>';
  var info;
  if(it.weapon){
    var w=it.weapon,ws2=w.stats||w,sp=[];if(ws2.attack)sp.push('🗡'+ws2.attack);if(ws2.defense)sp.push('🛡'+ws2.defense);if(ws2.speed)sp.push('💨'+ws2.speed);if(ws2.attack_speed)sp.push('⚡'+ws2.attack_speed);if(ws2.dodge)sp.push('👻'+ws2.dodge);if(ws2.hp)sp.push('❤'+ws2.hp);
    info={name:w.name,rarity:w.rarity,category:'武器',is_weapon:true,weapon_type:w.type||w.weapon_type,stats:sp.join(' '),crafter:w.crafter};
  }else{
    info=await api('/api/item-detail?name='+encodeURIComponent(it.name));
    if(info.error){pv.innerHTML='<span style="color:var(--red)">'+info.error+'</span>';return}
  }
  var cn={ore:'矿石',material:'材料',fish:'鱼类',junk:'垃圾',consume:'消耗品',seed:'种子',animal:'动物',special:'特殊',gem:'宝石',bait:'鱼饵',rod:'鱼竿',weapon:'武器',unknown:'其他'};
  pv.innerHTML='<div style="padding:8px 12px;background:var(--bg-input);border-radius:6px;border:1px solid var(--border-light);font-size:14px"><b>'+(info.rarity?rarityLabel(info.rarity):'')+' '+esc(info.name)+'</b> | '+(cn[info.category]||info.category||'?');
  if(info.stats) pv.innerHTML+=' | '+info.stats;
  if(info.crafter) pv.innerHTML+=' | 🔨'+esc(info.crafter);
  pv.innerHTML+='</div>';
}
async function listMkt(){
  var s=_('mkt-sel'),i=parseInt(s.value, 10),p=parseInt(_('mkt-p').value, 10),q=parseInt(_('mkt-q').value, 10)||1;
  if(isNaN(i)||!S.mktItems||!S.mktItems[i])return toast('请选择物品','error');
  if(!p||p<1)return toast('输入单价','error');
  var it=S.mktItems[i];
  if(it.kind==='weapon'){var r=await api('/api/market/list',{itemName:it.name,price:p,type:'weapon'});if(r.error)return toast(r.error,'error');toast('上架武器 '+it.name+' 💰'+p,'success')}
  else if(it.kind==='gem'){var r2=await api('/api/market/list',{itemName:it.gem.id,price:p,type:'gem'});if(r2.error)return toast(r2.error,'error');toast('上架宝石 '+it.name+' 💰'+p,'success')}
  else {if(q>it.count)return toast('数量不足（最多'+it.count+'个）','error');var r=await api('/api/market/list',{itemName:it.name,price:p,qty:q});if(r.error)return toast(r.error,'error');toast('上架 '+it.name+' x'+r.listed+' 💰'+p+'/个','success')}
  var me=await api("/api/me");if(me.user){S.user=me.user;S.stats=me.stats||{};_("tc").textContent=fn(S.user.coins);_("tl").textContent="Lv."+(S.user.level||1);_("tp").textContent=fn(S.stats.power||0);_("ts").textContent=(S.user.skill_points||0)+" SP";}
  // 只刷新列表数据，不重绘表单
  var mk=await api('/api/market');if(!mk.error){S.mktListings=mk.market||[];if(S.page==='market') pgMarket();}
}
async function buyMkt(id){var qel=document.getElementById('mq-'+id);var q=qel?parseInt(qel.value, 10)||1:1;var r=await api('/api/market/buy',{listingId:id,buyQty:q});if(r.error)return toast(r.error,'error');toast(r.type==='weapon'?'获得武器 '+r.item+'！':r.type==='gem'?'获得宝石 '+r.item+'！':'购买 '+r.item+' x'+r.qty+' 💰-'+fn(r.total_price),'success');await pgMarket();}
async function buyMktD(id){var qel=document.getElementById('mbq-'+id);var q=qel?parseInt(qel.value, 10)||1:1;var r=await api('/api/market/buy',{listingId:id,buyQty:q});if(r.error)return toast(r.error,'error');toast(r.type==='weapon'?'获得武器 '+r.item+'！':r.type==='gem'?'获得宝石 '+r.item+'！':'购买 '+r.item+' x'+r.qty+' 💰-'+fn(r.total_price),'success');await pgMarket();}
async function unlistMkt(id){var r=await api('/api/market/unlist',{listingId:id});if(r.error)return toast(r.error,'error');toast('下架成功','success');await pgMarket();}
// 求购
async function createBid(){var n=_('bid-name').value.trim(),q=parseInt(_('bid-q').value,10)||1,p=parseInt(_('bid-p').value,10);if(!n)return toast('输入物品名','error');if(!p||p<1)return toast('输入单价','error');var r=await api('/api/market/bid',{itemName:n,price:p,qty:q});if(r.error)return toast(r.error,'error');toast('求购 '+n+' x'+q+' 💰'+fn(p)+'/个（已预付'+fn(p*q)+'）','success');await pgMarket();}
async function cancelBid(id){var r=await api('/api/market/bid-cancel',{bidId:id});if(r.error)return toast(r.error,'error');toast('取消求购，退还 💰'+fn(r.refund),'success');await pgMarket();}
async function fulfillBid(id,have){var q=prompt('出售数量（你有'+have+'个）',Math.min(have,1));if(!q)return;q=parseInt(q, 10);if(!q||q<1||q>have)return toast('数量无效','error');var r=await api('/api/market/fulfill-bid',{bidId:id,qty:q});if(r.error)return toast(r.error,'error');toast('出售 '+r.item+' x'+r.qty+' 💰+'+fn(r.earned),'success');await pgMarket();}
// ==================== 鱼缸 ====================
async function pgFishTank(){
  var r=await api('/api/fish-tank'),b=await api('/api/bag');
  var fish=r.fish||[],cap=r.capacity||5,inv=b.inventory||{};
  var fishNames=r.fish_names||[],junkNames=r.junk_names||[];
  var fishEmojis={小鲫鱼:'🐟',鲤鱼:'🐟',草鱼:'🐟',鳜鱼:'🐟',鲈鱼:'🐟',锦鲤:'🐠',金龙鱼:'🐉',河神戒指:'💍',吉米鱼:'🐟',小丑鱼:'🐡',发光鱿鱼:'🦑',河豚:'🐡',鲶鱼:'🐟',鳊鱼:'🐟',泥鳅:'🐍',鲟鱼:'🐟',虹鳟鱼:'🐠',鳕鱼:'🐟',比目鱼:'🐟',石斑鱼:'🐠',金枪鱼:'🐟',黑鲷鱼:'🐟',鳐鱼:'🦋',月神鱼:'🐠',龙鲤:'🐉',彩虹鳟鱼:'🐠',金鲤鱼:'🐠',月光水母:'🪼',龙鱼:'🐉',深海龙鲸:'🐋',深渊鳐:'🦋',虚空水母:'🪼',星辉鱼:'✨',水草:'🌿',树枝:'🪵',破鞋子:'👟',空罐头:'🥫',碗:'🥣',滚木:'🪵'};
  // 分离鱼和装饰物
  var realFish=fish.filter(function(f){return fishNames.indexOf(f.name)>=0});
  var junkItems=fish.filter(function(f){return junkNames.indexOf(f.name)>=0});
  // 最多显示10条鱼游泳
  // 随机选最多10条游泳
  var showFish=realFish.slice();for(var i=showFish.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=showFish[i];showFish[i]=showFish[j];showFish[j]=t}
  showFish=showFish.slice(0,10);
  var h='<div class="card"><h2>🐠 鱼缸 ('+r.used+'/'+cap+')</h2>';
  // 鱼缸动画区域
  h+='<div style="position:relative;width:100%;height:300px;background:linear-gradient(180deg,#1a6b8a 0%,#0d3b5c 40%,#0a2a3f 100%);border-radius:12px;overflow:hidden;border:4px solid #5c8a8a;box-shadow:inset 0 0 60px rgba(0,200,255,0.15)">';
  // 气泡
  h+='<div style="position:absolute;bottom:0;left:5%;width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,0.4);animation:bubble1 4s ease-in infinite"></div>';
  h+='<div style="position:absolute;bottom:10px;left:15%;width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.3);animation:bubble2 5s ease-in infinite 1s"></div>';
  h+='<div style="position:absolute;bottom:5px;left:25%;width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,0.35);animation:bubble3 3.5s ease-in infinite 0.5s"></div>';
  h+='<div style="position:absolute;bottom:0;left:45%;width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,0.3);animation:bubble1 4.5s ease-in infinite 2s"></div>';
  h+='<div style="position:absolute;bottom:8px;left:65%;width:9px;height:9px;border-radius:50%;background:rgba(255,255,255,0.4);animation:bubble2 3.8s ease-in infinite 0.8s"></div>';
  h+='<div style="position:absolute;bottom:3px;left:80%;width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,0.3);animation:bubble3 5.5s ease-in infinite 1.5s"></div>';
  h+='<div style="position:absolute;bottom:6px;left:92%;width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,0.35);animation:bubble1 4.2s ease-in infinite 2.5s"></div>';
  // 基础水草
  h+='<div style="position:absolute;bottom:0;left:10px;width:20px;height:100px;background:linear-gradient(0deg,#1a4a1a,#2d8a2d);border-radius:10px 10px 0 0;opacity:0.7;transform-origin:bottom;animation:sway1 3s ease-in-out infinite"></div>';
  h+='<div style="position:absolute;bottom:0;left:50px;width:15px;height:70px;background:linear-gradient(0deg,#1a5a1a,#3a9a3a);border-radius:8px 8px 0 0;opacity:0.6;transform-origin:bottom;animation:sway2 3.5s ease-in-out infinite 0.5s"></div>';
  h+='<div style="position:absolute;bottom:0;right:30px;width:18px;height:85px;background:linear-gradient(0deg,#1a4a1a,#2d8a2d);border-radius:10px 10px 0 0;opacity:0.65;transform-origin:bottom;animation:sway1 2.8s ease-in-out infinite 1s"></div>';
  h+='<div style="position:absolute;bottom:0;right:80px;width:12px;height:55px;background:linear-gradient(0deg,#1a5a1a,#3a9a3a);border-radius:6px 6px 0 0;opacity:0.55;transform-origin:bottom;animation:sway2 3.2s ease-in-out infinite"></div>';
  // 垃圾装饰物（水草额外显示）
  for(var i=0;i<junkItems.length;i++){
    var j=junkItems[i],je=fishEmojis[j.name]||'🗑️';
    var jl=10+i*30+(i%3)*25,jb=2+(i%2)*15;
    h+='<div style="position:absolute;bottom:'+jb+'px;left:'+jl+'px;font-size:18px;opacity:0.7" title="'+esc(j.name)+'">'+je+'</div>';
  }
  // 石头
  h+='<div style="position:absolute;bottom:-5px;left:40%;width:40px;height:25px;background:#3a5a5a;border-radius:50% 50% 0 0;opacity:0.6"></div>';
  h+='<div style="position:absolute;bottom:-3px;right:20%;width:30px;height:18px;background:#2a4a4a;border-radius:50% 50% 0 0;opacity:0.5"></div>';
  // 鱼（最多10条）
  var fishColors=['var(--yellow)','var(--red-light)','var(--blue-light)','var(--green-light)','var(--purple-light)','var(--yellow)','var(--orange-light)','#1abc9c','var(--pink)','#00bcd4','#ff5722','var(--sidebar-nav)'];
  for(var i=0;i<showFish.length;i++){
    var f=showFish[i],fc=fishColors[i%fishColors.length];
    var top=20+Math.random()*220,size=Math.min(42,18+(f.weight||100)/150);
    var dur=8+Math.random()*12,delay=Math.random()*5;
    var rarityLabel=f.rarity>=999?'👑':f.rarity>=4?'💎':f.rarity>=3?'⭐':'';
    var fishEmoji=fishEmojis[f.name]||(f.rarity>=999?'🐉':f.rarity>=4?'🐠':f.rarity>=3?'🐡':'🐟');
    h+='<div class="tank-fish" style="position:absolute;top:'+top+'px;left:-60px;font-size:'+size+'px;animation:swim'+((i%2)+1)+' '+dur+'s linear '+delay+'s infinite;color:'+fc+';filter:drop-shadow(0 2px 3px rgba(0,0,0,0.3))" title="'+esc(f.name)+' '+(f.weight||0).toFixed(0)+'g '+rarityLabel+'">'+fishEmoji+'</div>';
  }
  if(!fish.length) h+='<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:rgba(255,255,255,0.3);font-size:24px">🐠 鱼缸空空如也...</div>';
  else if(realFish.length>10) h+='<div style="position:absolute;top:8px;right:12px;color:rgba(255,255,255,0.4);font-size:11px">游10/'+realFish.length+'条</div>';
  h+='</div>';
  // 鱼缸中的物品列表
  h+='<div style="margin-top:12px"><h3>🐟 缸中物 ('+r.used+'/'+cap+')</h3>';
  if(fish.length){
    for(var i=0;i<fish.length;i++){
      var f=fish[i],w=(f.weight||0).toFixed(0);
      var fe2=fishEmojis[f.name]||(f.rarity>=999?'🐉':f.rarity>=4?'🐠':f.rarity>=3?'🐡':'🐟');
      h+='<div style="display:inline-flex;align-items:center;gap:8px;padding:6px 14px;margin:4px;border-radius:8px;background:#e8f8f8;border:1px solid #b8d8d8;font-size:14px">'+fe2+' '+esc(f.name)+(junkNames.indexOf(f.name)>=0?'':' <span style="color:var(--text-faint)">'+w+'g</span>')+' <button class="btn btn-outline btn-sm" style="padding:2px 8px;font-size:12px;color:var(--red)" onclick="removeTankFish('+i+')">取出</button></div>';
    }
  } else h+='<p style="color:var(--text-faint)">还没有鱼，去钓鱼然后把鱼/水草放入鱼缸吧~</p>';
  h+='</div>';
  // 背包中可放入的物品（鱼+垃圾）
  var bagItems=[];
  for(var k in inv){if(inv[k]&&(fishNames.indexOf(k)>=0||junkNames.indexOf(k)>=0)) bagItems.push({name:k,count:inv[k]})}
  if(bagItems.length&&fish.length<cap){
    h+='<details style="margin-top:8px"><summary style="cursor:pointer;color:var(--blue)">➕ 放入鱼缸 ('+bagItems.length+'种可选)</summary><div style="padding:8px">';
    for(var i=0;i<bagItems.length;i++){
      var bfe=fishEmojis[bagItems[i].name]||'🐟';
      h+='<button class="btn btn-outline btn-sm" style="margin:4px" onclick="addTankFish(\x27'+escAttr(bagItems[i].name)+'\x27)">'+bfe+' '+esc(bagItems[i].name)+' x'+bagItems[i].count+'</button>';
    }
    h+='</div></details>';
  }
  h+='</div>';
  _('content').innerHTML=h;
}
async function addTankFish(n){var r=await api('/api/fish-tank/add',{fishName:n});if(r.error)return toast(r.error,'error');toast('🐟 '+r.added+' ('+r.weight.toFixed(0)+'g) 放入鱼缸 ('+r.used+'/'+r.capacity+')','success');await refresh();pgFishTank()}
async function removeTankFish(i){var r=await api('/api/fish-tank/remove',{index:i});if(r.error)return toast(r.error,'error');toast('🐟 '+r.removed+' 已取出','success');await refresh();pgFishTank()}

// ==================== 装备 (锻造+套装+宝石) ====================
async function pgEquipment(_keepTab){
  var savedTab = _keepTab ? S._equipTab : null;
  var savedSub = _keepTab ? S._craftSubTab : null;
  if(!S._equipTab) S._equipTab = getSet('equipTab','sets');
  if(!S._craftSubTab) S._craftSubTab = getSet('craftSubTab','direct');
  var r = await api('/api/forge');
  if (r.error) return toast(r.error,'error');
  S.weps = (r.weapons || []).sort(function(a,b){
    var ta=(a.stats||a).attack+(a.stats||a).defense+(a.stats||a).speed+(a.stats||a).hp+(a.stats||a).dodge+(a.stats||a).attack_speed;
    var tb=(b.stats||b).attack+(b.stats||b).defense+(b.stats||b).speed+(b.stats||b).hp+(b.stats||b).dodge+(b.stats||b).attack_speed;
    return tb-ta;
  });
  if(r.equipment) S.user.equipment = r.equipment;
  var gemsR = await api('/api/gems');
  if(savedTab){ S._equipTab = savedTab; S._craftSubTab = savedSub; }

  var h = '<div class="card"><h2>🔨 装备</h2>';
  h += '<div class="tabs">';
  h += '<button class="tab'+(S._equipTab==='sets'?' active':'')+'" onclick="S._equipTab=\'sets\';putSet(\'equipTab\',\'sets\');pgEquipment()">📜 蓝图管理</button>';
  h += '<button class="tab'+(S._equipTab==='craft'?' active':'')+'" onclick="S._equipTab=\'craft\';putSet(\'equipTab\',\'craft\');pgEquipment()">⚒️ 武器锻造</button>';
  h += '<button class="tab'+(S._equipTab==='gems'?' active':'')+'" onclick="S._equipTab=\'gems\';putSet(\'equipTab\',\'gems\');pgEquipment()">💎 宝石镶嵌</button>';
  h += '<button class="tab'+(S._equipTab==='dummy'?' active':'')+'" onclick="S._equipTab=\'dummy\';putSet(\'equipTab\',\'dummy\');pgEquipment()">🎯 练功</button>';
  h += '</div>';

  if (S._equipTab === 'sets') {
    h += renderBlueprintTab();
  } else if (S._equipTab === 'craft') {
    h += renderCraftTab(r);
  } else if (S._equipTab === 'gems') {
    h += renderGemsTab(gemsR, r);
  } else if (S._equipTab === 'dummy') {
    h += renderDummyTab();
  }
  h += '</div>';
  _('content').innerHTML = h; startCountdown();
}

function renderBlueprintTab() {
  var h = '<div id="blueprintList">加载中...</div>';
  loadBlueprints();
  return h;
}
async function loadBlueprints() {
  try {
    var r = await api('/api/forge/blueprints');
    if (r.error) { _('blueprintList').innerHTML = '<p>加载失败: ' + esc(r.error) + '</p>'; return; }
    var sets = r.sets || [];
    var synth = r.synthesis || [];
    var learnedAll = r.learned || [];

    var h = '<p style="font-size:14px;margin-bottom:8px">📜 蓝图收集情况。多余的蓝图可上架全球市场出售。</p>';

    // 统计
    var totalLearned = 0, totalPieces = 0, dupCount = 0;
    for (var i = 0; i < sets.length; i++) {
      totalLearned += sets[i].totalLearned;
      totalPieces += sets[i].totalPieces;
      for (var j = 0; j < sets[i].pieces.length; j++) {
        if (sets[i].pieces[j].isDuplicate) dupCount++;
      }
    }
    h += '<div style="margin-bottom:8px;display:flex;gap:12px;flex-wrap:wrap">';
    h += '<span class="badge">📜 已学: ' + totalLearned + '/' + totalPieces + '</span>';
    if (dupCount > 0) h += '<span class="badge" style="background:var(--purple-bg);color:var(--purple)">📦 可出售重复: ' + dupCount + '个</span>';
    h += '</div>';

    // 套装分组
    S._bpFilter = S._bpFilter || 'all';
    h += '<div class="tabs" style="margin-bottom:8px">';
    h += '<button class="tab' + (S._bpFilter === 'all' ? ' active' : '') + '" onclick="S._bpFilter=\'all\';loadBlueprints()">📦全部</button>';
    h += '<button class="tab' + (S._bpFilter === 'learned' ? ' active' : '') + '" onclick="S._bpFilter=\'learned\';loadBlueprints()">✅已学</button>';
    h += '<button class="tab' + (S._bpFilter === 'unlearned' ? ' active' : '') + '" onclick="S._bpFilter=\'unlearned\';loadBlueprints()">❌未学</button>';
    h += '<button class="tab' + (S._bpFilter === 'duplicate' ? ' active' : '') + '" onclick="S._bpFilter=\'duplicate\';loadBlueprints()">📦可出售</button>';
    h += '</div>';

    var si = {weapon:'🗡️',helmet:'⛑️',armor:'🛡️',boots:'👢',leggings:'🦵',accessory:'💍'};

    h += '<div class="item-grid">';
    for (var si2 = 0; si2 < sets.length; si2++) {
      var set = sets[si2];
      var filteredPieces = set.pieces;
      if (S._bpFilter === 'learned') filteredPieces = set.pieces.filter(function(p) { return p.learned; });
      else if (S._bpFilter === 'unlearned') filteredPieces = set.pieces.filter(function(p) { return !p.learned; });
      else if (S._bpFilter === 'duplicate') filteredPieces = set.pieces.filter(function(p) { return p.isDuplicate; });

      if (filteredPieces.length === 0) continue;

      var setLearned = set.totalLearned === set.totalPieces;
      h += '<div class="item-card" style="' + (setLearned ? 'border-left:5px solid var(--green)' : '') + '">';
      h += '<b>' + esc(set.name) + '</b> <small> Lv.' + (set.min_level || 1) + '+</small>';
      h += ' <span style="font-size:11px;color:var(--text-faint)">' + set.totalLearned + '/' + set.totalPieces + '</span>';
      if (set.bonuses) {
        h += '<div style="font-size:11px;margin:2px 0">';
        if (set.bonuses['2']) h += '<span class="badge" style="font-size:10px">2件:' + esc(set.bonuses['2'].desc) + '</span> ';
        if (set.bonuses['4']) h += '<span class="badge" style="font-size:10px">4件:' + esc(set.bonuses['4'].desc) + '</span> ';
        if (set.bonuses['6']) h += '<span class="badge" style="font-size:10px">6件:' + esc(set.bonuses['6'].desc) + '</span> ';
        if (set.bonuses['3']) h += '<span class="badge" style="font-size:10px">3件:' + esc(set.bonuses['3'].desc) + '</span> ';
        h += '</div>';
      }
      // 部位紧凑显示
      h += '<div style="font-size:11px;color:var(--text-faint);display:flex;flex-wrap:wrap;gap:2px 6px;margin-top:4px">';
      for (var k = 0; k < filteredPieces.length; k++) {
        var p = filteredPieces[k];
        h += '<span style="white-space:nowrap">' + (si[p.slot] || '') + esc(p.name);
        if (p.learned) h += '✅';
        if (p.count > 0) {
          h += ' 📦x' + p.count;
          if (p.isDuplicate) h += ' <button class="btn btn-purple btn-sm" style="padding:0 4px;font-size:9px;line-height:1.2" onclick="event.stopPropagation();listBlueprintOnMarket(\'' + escAttr(p.bpName) + '\',' + p.count + ')">💲</button>';
        }
        if (!p.learned && p.count > 0) h += ' <button class="btn btn-green" style="padding:4px 10px;font-size:13px" onclick="event.stopPropagation();useBlueprint(\'' + escAttr(p.bpName) + '\')">📖 学习</button>';
        h += '</span>';
      }
      h += '</div>';
      h += '</div>';
    }
    h += '</div>';

    // 合成蓝图
    if (synth.length > 0 && (S._bpFilter === 'all' || S._bpFilter === 'unlearned')) {
      var unlearnedSynth = synth.filter(function(s) { return !s.learned; });
      if (S._bpFilter === 'unlearned') unlearnedSynth = synth.filter(function(s) { return !s.learned; });
      else if (S._bpFilter === 'duplicate') unlearnedSynth = synth.filter(function(s) { return s.isDuplicate; });
      else if (S._bpFilter === 'learned') unlearnedSynth = synth.filter(function(s) { return s.learned; });

      if (unlearnedSynth.length > 0) {
        h += '<div class="item-card" style="margin-top:8px"><b>⚗️ 合成配方蓝图</b>';
        for (var x = 0; x < unlearnedSynth.length; x++) {
          var sb = unlearnedSynth[x];
          h += '<div style="font-size:12px;padding:3px 0;border-top:1px solid var(--border-light);display:flex;align-items:center;gap:6px">';
          h += esc(sb.name) + ' (' + esc(sb.bpName) + ')';
          if (sb.learned) h += ' <span style="color:var(--green)">✓</span>';
          if (sb.count > 0) h += ' <span style="color:var(--purple);font-size:11px">📦x' + sb.count + '</span>';
          if (sb.isDuplicate) h += ' <button class="btn btn-purple btn-sm" style="padding:1px 5px;font-size:10px" onclick="listBlueprintOnMarket(\'' + escAttr(sb.bpName) + '\',' + sb.count + ')">💲上架</button>';
          if (!sb.learned && sb.count > 0) h += ' <button class="btn btn-green" style="padding:4px 10px;font-size:13px" onclick="useBlueprint(\'' + escAttr(sb.bpName) + '\')">📖 学习</button>';
          h += '</div>';
        }
        h += '</div>';
      }
    }

    _('blueprintList').innerHTML = h;
  } catch (e) { _('blueprintList').innerHTML = '<p>加载蓝图失败</p>'; }
}

async function useBlueprint(bpName) {
  var r = await api('/api/forge/learn-blueprint', { blueprintName: bpName });
  if (r.error) return toast(r.error, 'error');
  toast(r.msg, 'success');
  loadBlueprints();
}

async function listBlueprintOnMarket(bpName, count) {
  var price = prompt('输入「' + bpName + '」的单价（金币）:', '500');
  if (!price || isNaN(parseInt(price))) return;
  var qty = 1;
  if (count > 1) {
    var q = prompt('出售数量（拥有 ' + count + ' 个）:', '1');
    if (!q || isNaN(parseInt(q))) return;
    qty = Math.min(parseInt(q), count);
  }
  var r = await api('/api/market/list', { itemName: bpName, price: parseInt(price), qty: qty });
  if (r.error) return toast(r.error, 'error');
  toast('💲 ' + bpName + ' 已上架全球市场！单价 ' + fn(parseInt(price)) + ' ×' + qty, 'success');
  loadBlueprints();
}

// 渲染锻造等级与里程碑加成面板（可独立调用以局部刷新）
function renderForgeInfo(r) {
  var forgeLv = r.forge_level || 1;
  var forgeExp = r.forge_exp || 0;
  var milestones = r.forge_milestones || {};
  var statBonus = r.forge_stat_bonus || 0;
  var extraMat = r.forge_extra_material || 0;
  var msKeys = Object.keys(milestones).map(Number).sort(function(a,b){return a-b;});

  var feNeeded = Math.floor(100 * Math.pow(forgeLv, 1.3));
  var fePct = feNeeded > 0 ? Math.min(100, Math.floor((forgeExp / feNeeded) * 100)) : 0;

  var h = '<div class="card" id="forge-info-panel" style="margin-bottom:12px;padding:12px 16px">';
  h += '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">';
  h += '<span style="font-size:18px;font-weight:bold">🔨 锻造 Lv.' + forgeLv + '</span>';
  h += '<span style="font-size:13px;color:var(--text-faint)">经验: ' + fn(forgeExp) + ' / ' + fn(feNeeded) + ' (' + fePct + '%)</span>';
  if (statBonus > 0) h += '<span class="badge" style="background:var(--purple);color:#fff;font-size:12px">🔧 属性+' + (statBonus*100).toFixed(0) + '%</span>';
  if (extraMat > 0) h += '<span class="badge" style="background:var(--blue);color:#fff;font-size:12px">🧱 额外材料+1</span>';
  h += '</div>';
  h += '<div class="progress-bar" style="height:6px;margin-top:6px"><div class="fill" style="width:' + fePct + '%;background:linear-gradient(90deg,var(--green),var(--green-light))"></div></div>';

  var unlockedCount = 0;
  h += '<div style="margin-top:10px"><span style="font-size:13px;font-weight:bold;color:var(--text)">🏅 里程碑加成：</span>';
  for (var mi = 0; mi < msKeys.length; mi++) {
    var msLv = msKeys[mi];
    var ms = milestones[msLv];
    var unlocked = forgeLv >= msLv;
    if (unlocked) unlockedCount++;
  }
  h += '<span style="font-size:12px;color:var(--text-faint)"> 已解锁 ' + unlockedCount + '/' + msKeys.length + '</span></div>';
  h += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">';
  for (var mi = 0; mi < msKeys.length; mi++) {
    var msLv = msKeys[mi];
    var ms = milestones[msLv];
    var unlocked = forgeLv >= msLv;
    h += '<span class="badge" style="font-size:11px;' +
      (unlocked ? 'background:var(--green-bg);color:var(--green);border:1px solid var(--green)' :
                'background:var(--bg-hover);color:var(--text-faint);border:1px solid var(--border-muted)') +
      '">' + (unlocked ? '✅' : '🔒') + ' Lv.' + msLv + ': ' + esc(ms.desc || '') + '</span>';
  }
  h += '</div>';
  h += '</div>';
  return h;
}

function renderCraftTab(r) {
  var h = ''; S._craftSubTab = S._craftSubTab || 'direct';
  // 缓存锻造数据以供局部刷新
  S._forgeData = r;

  h += renderForgeInfo(r);

  h += '<div class="tabs" style="margin-bottom:8px">';
  h += '<button class="tab'+(S._craftSubTab==='direct'?' active':'')+'" onclick="S._craftSubTab=\'direct\';putSet(\'craftSubTab\',\'direct\');pgEquipment()">📋 配方制作</button>';
  h += '<button class="tab'+(S._craftSubTab==='weapons'?' active':'')+'" onclick="S._craftSubTab=\'weapons\';putSet(\'craftSubTab\',\'weapons\');pgEquipment()">⚔️ 武器库</button>';
  h += '</div>';

  if (S._craftSubTab === 'direct') {
    h += renderDirectCraft();
  } else if (S._craftSubTab === 'weapons') {
    h += renderWeaponList(r);
  }
  return h;
}

function renderDirectCraft(){
  var h = '<p style="font-size:14px;margin-bottom:8px">使用固定配方制作装备。随等级提升解锁更多配方。</p>';
  h += '<div id="directCraftList">加载中...</div>';
  loadDirectCraft();
  return h;
}
async function loadDirectCraft(){
  try {
    var r = await api('/api/forge/direct-craft-list');
    if(r.error){ _('directCraftList').innerHTML = '<p style="color:var(--text-faint)">加载失败: '+esc(r.error)+'</p>'; return; }
    var recipes = r.recipes || [];
    if(!recipes.length){ _('directCraftList').innerHTML = '<p style="color:var(--text-faint)">暂无配方</p>'; return; }
    // 分类筛选
    S._dcTypeFilter = S._dcTypeFilter || 'all';
    S._dcRarityFilter = S._dcRarityFilter || 'all';
    S._dcLevelFilter = S._dcLevelFilter || 'all';
    var types = {all:'📦全部',weapon:'🗡️武器',helmet:'⛑️头盔',armor:'🛡️护甲',boots:'👢靴子',leggings:'🦵护腿',accessory:'💍饰品'};
    var rarityFilters = {all:'⭐全部',1:'⬜区',2:'🟩强',3:'🟦强强',4:'🟪？强强？',999:'🟥？强强？！',9999:'💎？区？！'};
    var levelFilters = {all:'📊全部',20:'Lv1-20',50:'Lv20-50',100:'Lv50-100',170:'Lv100-170',999:'Lv170+'};
    var h = '<p>共 '+recipes.length+' 个配方</p>';
    h += '<div class="tabs" style="margin-bottom:4px">';
    for(var tk in types){
      h += '<button class="tab'+(S._dcTypeFilter===tk?' active':'')+'" onclick="S._dcTypeFilter=\''+tk+'\';loadDirectCraft()">'+types[tk]+'</button>';
    }
    h += '</div>';
    h += '<div class="tabs" style="margin-bottom:4px">';
    for(var rk2 in rarityFilters){
      h += '<button class="tab'+(S._dcRarityFilter===rk2?' active':'')+'" style="font-size:11px" onclick="S._dcRarityFilter=\''+rk2+'\';loadDirectCraft()">'+rarityFilters[rk2]+'</button>';
    }
    h += '</div>';
    h += '<div class="tabs" style="margin-bottom:8px">';
    for(var lk in levelFilters){
      h += '<button class="tab'+(S._dcLevelFilter===lk?' active':'')+'" style="font-size:11px" onclick="S._dcLevelFilter=\''+lk+'\';loadDirectCraft()">'+levelFilters[lk]+'</button>';
    }
    h += '</div>' +
      '<button class="btn btn-outline btn-sm" style="margin-bottom:8px" onclick="S._dcTypeFilter=\'all\';S._dcRarityFilter=\'all\';S._dcLevelFilter=\'all\';loadDirectCraft()">🔄 清除筛选</button>';
    // 筛选
    var filtered = recipes;
    if(S._dcTypeFilter !== 'all') filtered = filtered.filter(function(rc){ return (rc.type||'weapon') === S._dcTypeFilter; });
    if(S._dcRarityFilter !== 'all') filtered = filtered.filter(function(rc){ return rc.rarity === parseInt(S._dcRarityFilter); });
    if(S._dcLevelFilter !== 'all'){
      var lvCap = parseInt(S._dcLevelFilter);
      filtered = filtered.filter(function(rc){ return (rc.min_level||1) <= lvCap; });
    }
    // 数量
    var activeFilters = [];
    if(S._dcTypeFilter!=='all') activeFilters.push(types[S._dcTypeFilter]);
    if(S._dcRarityFilter!=='all') activeFilters.push(rarityFilters[S._dcRarityFilter]);
    if(S._dcLevelFilter!=='all') activeFilters.push(levelFilters[S._dcLevelFilter]);
    h += '<div style="font-size:12px;color:var(--text-faint);margin-bottom:4px">显示 '+filtered.length+'/'+recipes.length+' 个'+(activeFilters.length?' | 筛选: '+activeFilters.join(' + '):'')+'</div>';
    if(filtered.length===0){
      h += '<p style="color:var(--text-faint);text-align:center;padding:20px">该分类暂无配方</p>';
    } else {
      h += '<div class="item-grid">';
    var si2 = {weapon:'🗡️',helmet:'⛑️',armor:'🛡️',boots:'👢',leggings:'🦵',accessory:'💍'};
    for(var i=0;i<filtered.length;i++){
      var rc=filtered[i];
      h+='<div class="item-card rarity-'+(rc.rarity||1)+'" style="'+(rc.is_set?'border-left:4px solid var(--purple)':'')+'">';
      h+='<b>'+(si2[rc.type]||'⚔️')+' '+esc(rc.name)+'</b> <small>Lv.'+(rc.min_level||1)+'+</small>';
      if(rc.is_set) h+=' <span style="font-size:10px;color:var(--purple)">套装</span>';
      h+='<div style="font-size:12px">';
      var st2=rc.stats||{};
      if(st2.attack)h+='🗡️'+st2.attack+' '; if(st2.defense)h+='🛡️'+st2.defense+' ';
      if(st2.speed)h+='💨'+st2.speed+' '; if(st2.attack_speed)h+='⚡'+st2.attack_speed+' ';
      if(st2.dodge)h+='👻'+st2.dodge+' '; if(st2.hp)h+='❤️'+st2.hp+' ';
      h+='</div><div style="font-size:11px;color:var(--text-faint)">材料: ';
      var matParts=[]; for(var mn2 in (rc.materials||{})){matParts.push(mn2+' x'+rc.materials[mn2])}
      h+=matParts.join(', ')+'</div>';
      if(rc.is_set){
        h+='<button class="btn btn-purple btn-sm" style="margin-top:4px;padding:2px 8px;font-size:11px" onclick="craftSetPiece(\''+escAttr(rc.set_id)+'\',\''+escAttr(rc.type)+'\')">🔨 制作</button>';
      } else {
        h+='<button class="btn btn-green btn-sm" style="margin-top:4px;padding:2px 8px;font-size:11px" onclick="doDirectCraft(\''+escAttr(rc.name)+'\')">🔨 制作</button>';
      }
      h+='</div>';
    }
    h+='</div>';
    }
    _('directCraftList').innerHTML = h;
  } catch(e){ _('directCraftList').innerHTML = '<p style="color:var(--text-faint)">加载配方失败</p>'; }
}
async function doDirectCraft(craftName){
  var r = await api('/api/forge/direct-craft',{craftName:craftName});
  if(r.error) return toast(r.error,'error');
  var msg = '🔨 制作成功！获得 '+r.weapon.name+' ('+r.rarity_name+')';
  if(r.materials_saved) msg += ' | 🍀节省了'+r.materials_saved+'个材料';
  if(r.double_crafted) msg += ' | 🎉双倍制作！额外获得一件';
  toast(msg,'success');
  // 本地更新数据，不刷新界面
  S.user.coins = (S.user.coins||0) - (r.gold_cost||0);
  S.user.forge_level = r.forge_level;
  S.user.forge_exp = r.forge_exp || S.user.forge_exp;
  if(r.weapon){ S.weps = (S.weps||[]).concat([r.weapon]); }
  _('tc').textContent = fn(S.user.coins);
  // 刷新锻造信息面板
  if(S._forgeData){
    S._forgeData.forge_level = r.forge_level;
    S._forgeData.forge_exp = r.forge_exp !== undefined ? r.forge_exp : S._forgeData.forge_exp;
    var panel = _('forge-info-panel');
    if(panel){ var div=document.createElement('div'); div.innerHTML=renderForgeInfo(S._forgeData); var newPanel=div.firstChild; panel.parentNode.replaceChild(newPanel,panel); }
  }
}

// 同步锻造数据并刷新当前标签
async function refreshForgeOnly(){
  if(S.page === 'equipment'){
    await pgEquipment(true);
  }
}

function renderWeaponList(r){
  var h = '';
  var weapons = r.weapons || [];
  var eq = S.user.equipment || {};
  h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">';
  var slots2 = {weapon:'🗡️武器',helmet:'⛑️头盔',armor:'🛡️护甲',boots:'👢靴子',leggings:'🦵护腿',accessory:'💍饰品'};
  for (var sl in slots2) {
    var wid = eq[sl] || ''; var wname = '空';
    if (wid) { var wf = (weapons||[]).find(function(w){return w.id===wid}); if (wf) wname = wf.name; }
    h += '<span class="badge" style="font-size:12px;cursor:pointer" onclick="if(\''+(wid||'')+'\'){unequipS(\''+sl+'\')}">'+slots2[sl]+': '+esc(wname)+(wid?' ✕':'')+'</span>';
  }
  h += '</div>';
  if (weapons.length > 0) {
    // 类型筛选栏
    S._equipFilter = S._equipFilter || 'all';
    S._equipRarityFilter = S._equipRarityFilter || 'all';
    S._equipLevelFilter = S._equipLevelFilter || 'all';
    var filters = {all:'📦全部',weapon:'🗡️武器',helmet:'⛑️头盔',armor:'🛡️护甲',boots:'👢靴子',leggings:'🦵护腿',accessory:'💍饰品'};
    h += '<div class="tabs" style="margin-bottom:4px">';
    for(var fk in filters){
      h += '<button class="tab'+(S._equipFilter===fk?' active':'')+'" onclick="S._equipFilter=\''+fk+'\';pgEquipment()">'+filters[fk]+'</button>';
    }
    h += '</div>';
    // 稀有度筛选栏
    var rarityLevels = {all:'⭐全部',1:'⬜区',2:'🟩强',3:'🟦强强',4:'🟪？强强？',999:'🟥？强强？！',9999:'💎？区？！'};
    h += '<div class="tabs" style="margin-bottom:4px">';
    for(var rk in rarityLevels){
      h += '<button class="tab'+(S._equipRarityFilter===rk?' active':'')+'" style="font-size:11px" onclick="S._equipRarityFilter=\''+rk+'\';pgEquipment()">'+rarityLevels[rk]+'</button>';
    }
    h += '</div>';
    // 等级筛选栏
    var equipLevelFilters = {all:'📊全部',20:'Lv1-20',50:'Lv20-50',100:'Lv50-100',170:'Lv100-170',999:'Lv170+'};
    h += '<div class="tabs" style="margin-bottom:8px">';
    for(var elk in equipLevelFilters){
      h += '<button class="tab'+(S._equipLevelFilter===elk?' active':'')+'" style="font-size:11px" onclick="S._equipLevelFilter=\''+elk+'\';pgEquipment()">'+equipLevelFilters[elk]+'</button>';
    }
    h += '</div>' +
      '<button class="btn btn-outline btn-sm" style="margin-bottom:8px" onclick="S._equipFilter=\'all\';S._equipRarityFilter=\'all\';S._equipLevelFilter=\'all\';pgEquipment()">🔄 清除筛选</button>';
    // 按类型+稀有度+等级筛选
    var filtered = weapons;
    if(S._equipFilter !== 'all'){
      filtered = filtered.filter(function(w){ return (w.type||'weapon') === S._equipFilter; });
    }
    if(S._equipRarityFilter !== 'all'){
      filtered = filtered.filter(function(w){ return w.rarity === parseInt(S._equipRarityFilter); });
    }
    if(S._equipLevelFilter !== 'all'){
      var elvCap = parseInt(S._equipLevelFilter);
      filtered = filtered.filter(function(w){ return (w.level||w.weapon_level||1) <= elvCap; });
    }
    // 统计
    var activeEqFilters = [];
    if(S._equipFilter!=='all') activeEqFilters.push(filters[S._equipFilter]);
    if(S._equipRarityFilter!=='all') activeEqFilters.push(rarityLevels[S._equipRarityFilter]);
    if(S._equipLevelFilter!=='all') activeEqFilters.push(equipLevelFilters[S._equipLevelFilter]);
    h += '<div style="font-size:12px;color:var(--text-faint);margin-bottom:4px">显示 '+filtered.length+'/'+weapons.length+' 件'+(activeEqFilters.length?' | '+activeEqFilters.join(' + '):'')+'</div>';
    h += '<p><button class="btn btn-outline btn-sm" style="color:var(--red)" onclick="selectAllWeps()">全选未装备</button> ';
    h += '<button class="btn btn-red btn-sm" id="btnBatchDecompW" disabled onclick="batchDecompWeps()">🗑️ 批量分解(<span id="batchWepCount">0</span>)</button></p>';
    if(filtered.length === 0){
      h += '<p style="color:var(--text-faint);text-align:center;padding:20px">该分类暂无装备</p>';
    } else {
      h += '<div class="item-grid">';
    for (var i = 0; i < filtered.length; i++) {
      var w = filtered[i]; var isEq2 = Object.values(eq).indexOf(w.id) >= 0;
      h += '<div class="item-card rarity-'+(w.rarity||1)+'" style="'+(isEq2?'border:2px solid var(--yellow)':'')+'">';
      h += '<b>' + esc(w.name) + '</b> <small>' + (w.rarity_name||'') + '</small>';
      var st = w.stats||{};
      h += '<div style="font-size:12px">🗡️'+(st.attack||0)+' 🛡️'+(st.defense||0)+' 💨'+(st.speed||0)+' ⚡'+(st.attack_speed||0)+' 👻'+(st.dodge||0)+' ❤️'+(st.hp||0)+'</div>';
      var spAttrs = w.special_attrs || {};
      var spCN={crit_rate:'暴击',lifesteal:'吸血',crit_dmg:'暴伤',exp_bonus:'经验',coin_bonus:'金币',dmg_reduce:'减伤',counter:'反击',extra_atk:'连击',fire_damage:'火伤'};
      var spStr = [];
      for(var spk in spAttrs){spStr.push((spCN[spk]||spk)+':'+(spAttrs[spk]<1?(spAttrs[spk]*100).toFixed(1)+'%':spAttrs[spk]))}
      if(spStr.length) h+='<div style="font-size:11px;color:var(--orange)">✨'+spStr.join(' ')+'</div>';
      var socketCount = w.sockets ? w.sockets.length : 0;
      h+='<div style="font-size:11px;color:var(--text-faint)">💎'+socketCount+'/'+(w.max_sockets||3)+' | 🔨强化'+(w.strengthen_count||0)+'次</div>';
      h += '<div style="margin-top:4px">';
      var slotMatch = w.type||'weapon';
      if (!isEq2) {
        h += '<button class="btn btn-blue btn-sm" style="padding:2px 8px;font-size:11px" onclick="equipW(\''+w.id+'\',\''+escAttr(w.name)+'\',\''+slotMatch+'\')">装备</button> ';
      } else {
        h += '<button class="btn btn-outline btn-sm" style="padding:2px 8px;font-size:11px" onclick="unequipS(\''+slotMatch+'\')">卸下</button> ';
      }
      h += '<button class="btn btn-outline btn-sm" style="padding:2px 8px;font-size:11px" onclick="showStrengthen(\''+w.id+'\',\''+escAttr(w.name)+'\')">强化</button> ';
      if(w.is_event_limited && (w.evolve_stage||0) < 3) h += '<button class="btn btn-orange btn-sm" style="padding:2px 8px;font-size:11px" onclick="evolveWeapon(\''+w.id+'\')">⚡进化</button> ';
      h += '<button class="btn btn-outline btn-sm" style="padding:2px 8px;font-size:11px;color:var(--red)" onclick="decompW(\''+w.id+'\',\''+escAttr(w.name)+'\')">分解</button> ';
      h += '<button class="btn btn-purple btn-sm" style="padding:2px 8px;font-size:11px" onclick="showGemSocket(\''+w.id+'\',\''+escAttr(w.name)+'\')">💎</button>';
      if(!isEq2)h+=' <input type="checkbox" style="width:16px;height:16px;vertical-align:middle" onchange="toggleBatchWep(\''+w.id+'\')"' + ((S.batchWeps||[]).indexOf(w.id)>=0?' checked':'') + '>';
      h += '</div></div>';
    }
    h += '</div>';
    } // close if(filtered.length === 0)
  } else { h += '<p style="color:var(--text-faint)">暂无武器。使用"直接制作"或"配方锻造"来创建武器！</p>'; }
  return h;
}

function renderGemsTab(r, forgeR) {
  var statCN={attack:'🗡️攻击',defense:'🛡️防御',speed:'💨速度',attack_speed:'⚡攻速',dodge:'👻闪避',hp:'❤️生命',crit_rate:'💥暴击率',crit_dmg:'💢暴伤',lifesteal:'🩸吸血',counter:'↩️反击',damage_reduce:'🛡️减伤',exp_bonus:'📖经验',gold_bonus:'💰金币'};
  var h = '';
  var weapons = forgeR.weapons || [];
  var gems = (r.gems || []).sort(function(a,b){ return (b.value||0)-(a.value||0); });
  // 宝石过滤器状态
  if (!S._gemFilter) S._gemFilter = { stat: 'all', rarity: 0 };

  // ── 宝石背包 ──
  h += '<div class="card"><h3>💎 宝石背包 <small style="font-weight:normal;font-size:14px;color:var(--text-muted)">共 ' + gems.length + ' 颗</small></h3>';
  h += '<p style="font-size:14px;color:var(--text-muted);margin-bottom:8px">给武器镶嵌宝石提升属性。每把武器最多3个宝石孔。</p>';

  // 过滤器
  h += '<div style="margin-bottom:8px;display:flex;flex-wrap:wrap;gap:4px;align-items:center">';
  h += '<span style="font-size:13px;color:var(--text-muted);margin-right:4px">🏷️ 属性:</span>';
  var statFilters = [{v:'all',n:'全部'},{v:'attack',n:'🗡️攻击'},{v:'defense',n:'🛡️防御'},{v:'speed',n:'💨速度'},{v:'attack_speed',n:'⚡攻速'},{v:'dodge',n:'👻闪避'},{v:'hp',n:'❤️生命'},{v:'crit_rate',n:'💥暴击'},{v:'crit_dmg',n:'💢暴伤'},{v:'lifesteal',n:'🩸吸血'},{v:'counter',n:'↩️反击'}];
  for (var sf=0; sf<statFilters.length; sf++) {
    var sfv = statFilters[sf];
    h += '<button class="btn btn-sm '+(S._gemFilter.stat===sfv.v?'btn-purple':'btn-outline')+'" style="padding:2px 6px;font-size:11px" onclick="S._gemFilter.stat=\''+sfv.v+'\';pgEquipment()">'+sfv.n+'</button>';
  }
  h += '</div>';
  h += '<div style="margin-bottom:8px;display:flex;flex-wrap:wrap;gap:4px;align-items:center">';
  h += '<span style="font-size:13px;color:var(--text-muted);margin-right:4px">⭐ 稀有度:</span>';
  var rarityFilters = [{v:0,n:'全部'},{v:1,n:'⭐1'},{v:2,n:'⭐2'},{v:3,n:'⭐3'},{v:4,n:'⭐4'},{v:999,n:'👑5'},{v:9999,n:'👑👑6'}];
  for (var rf=0; rf<rarityFilters.length; rf++) {
    var rfv = rarityFilters[rf];
    h += '<button class="btn btn-sm '+(S._gemFilter.rarity===rfv.v?'btn-purple':'btn-outline')+'" style="padding:2px 6px;font-size:11px" onclick="S._gemFilter.rarity='+rfv.v+';pgEquipment()">'+rfv.n+'</button>';
  }
  h += '</div>';

  // 批量操作栏
  if (gems.length > 0) {
    h += '<div style="margin-bottom:8px;display:flex;flex-wrap:wrap;gap:6px;align-items:center">';
    h += '<button class="btn btn-red btn-sm" onclick="decomposeBatchGems()">🗑️ 分解所选</button>';
    h += '<button class="btn btn-outline btn-sm" style="color:var(--orange-light);border-color:var(--orange-light)" onclick="selectGemsBelowRarity()">📋 选择稀有度≤</button>';
    h += '<select id="gem-rarity-select" style="background:#2a2a2a;color:#ddd;border:1px solid #555;border-radius:4px;padding:3px 6px;font-size:13px">';
    for (var rv=1; rv<=6; rv++) {
      var rk = rv===5?999:rv===6?9999:rv;
      var rn = rv===5?'👑5':rv===6?'👑👑6':'⭐'+rv;
      h += '<option value="'+rk+'">'+rn+'</option>';
    }
    h += '</select>';
    h += '<button class="btn btn-outline btn-sm" onclick="selectAllGems()">✅ 全选</button>';
    h += '<button class="btn btn-outline btn-sm" onclick="deselectAllGems()">⬜ 取消全选</button>';
    h += '</div>';
  }

  // 应用过滤器
  var filteredGems = gems.filter(function(g){
    if (S._gemFilter.stat !== 'all' && g.stat !== S._gemFilter.stat) return false;
    if (S._gemFilter.rarity > 0 && g.rarity !== S._gemFilter.rarity) return false;
    return true;
  });

  if (filteredGems.length > 0) {
    h += '<div class="item-grid">';
    for (var i = 0; i < filteredGems.length; i++) {
      var g = filteredGems[i];
      var gr = g.rarity || 1;
      h += '<div class="item-card rarity-' + gr + '">';
      h += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><input type="checkbox" class="gem-check" value="'+g.id+'"><b>💎 ' + esc(g.name) + '</b>';
      h += '<span class="badge badge-r' + gr + '">'+(gr>=9999?'👑👑':gr>=999?'👑':'⭐')+gr + '</span></div>';
      h += '<div style="font-size:15px;font-weight:700;color:var(--purple)">' + (statCN[g.stat]||g.stat) + ' +' + (g.value||0) + '</div>';
      h += '<button class="btn btn-red btn-sm" style="margin-top:4px" onclick="decomposeGem(\''+g.id+'\')">🔨 分解</button>';
      h += '</div>';
    }
    h += '</div>';
  } else {
    h += '<div style="text-align:center;padding:28px;color:var(--text-faint)"><div style="font-size:40px;margin-bottom:8px">💎</div>'+(gems.length>0?'没有匹配过滤条件的宝石':'暂无宝石')+'<br><small>宝石可从冒险BOSS掉落或锻造合成获得</small></div>';
  }
  h += '</div>';

  // ── 武器镶嵌 ──
  h += '<div class="card"><h3>⚔️ 武器镶嵌</h3>';
  if (weapons.length > 0) {
    h += '<div class="item-grid">';
    for (var j = 0; j < weapons.length; j++) {
      var w2 = weapons[j];
      var sc = w2.sockets ? w2.sockets.length : 0;
      var ms = w2.max_sockets || 3;
      var filled = sc >= ms;
      h += '<div class="item-card rarity-' + (w2.rarity||1) + '">';
      h += '<b>' + esc(w2.name) + '</b>';
      h += '<div style="font-size:13px;color:var(--text-muted);margin:4px 0">💎 ' + sc + '/' + ms + ' 孔';
      if (sc > 0) {
        h += ' <span style="font-size:12px">(';
        var parts = [];
        for (var si = 0; si < w2.sockets.length; si++) {
          var sg = w2.sockets[si];
          parts.push((statCN[sg.stat]||sg.stat) + '+' + sg.value);
        }
        h += parts.join(', ') + ')</span>';
      }
      h += '</div>';
      h += '<button class="btn btn-purple btn-sm" style="margin-top:4px" onclick="showGemSocket(\''+w2.id+'\',\''+escAttr(w2.name)+'\')">' + (filled ? '🔍 查看宝石' : '🔧 镶嵌宝石') + '</button>';
      h += '</div>';
    }
    h += '</div>';
  } else {
    h += '<div style="text-align:center;padding:28px;color:var(--text-faint)"><div style="font-size:40px;margin-bottom:8px">⚔️</div>暂无武器<br><small>先去锻造一把武器吧！</small></div>';
  }
  h += '</div>';

  return h;
}

function renderDummyTab(){
  var st = S.stats || {};
  var h = '<p style="font-size:14px;margin-bottom:8px">测试你的战斗力！点击攻击看看能打多少伤害。</p>';
  h += '<div class="card" style="text-align:center;padding:20px">';
  h += '<div style="font-size:48px;margin:16px 0">🎯</div>';
  h += '<p><b>战力：</b>' + fn(st.power||0) + '</p>';
  h += '<p>🗡️攻击:' + (st.attack||0) + ' 🛡️防御:' + (st.defense||0) + ' 💨速度:' + (st.speed||0) + ' ⚡攻速:' + (st.atk_speed||0) + ' 👻闪避:' + (st.dodge||0) + '%</p>';
  h += '<p>💥暴击率:' + ((st.special_attrs&&st.special_attrs.crit_rate||0)*100).toFixed(1) + '% | 🩸吸血:' + ((st.special_attrs&&st.special_attrs.lifesteal||0)*100).toFixed(1) + '%</p>';
  h += '<button class="btn btn-primary" onclick="hitDummy()" style="margin:12px">⚔️ 攻击稻草人</button>';
  h += '<div id="dummy-result" style="font-size:18px;font-weight:bold;margin-top:12px;min-height:30px"></div>';
  h += '</div>';
  return h;
}
async function hitDummy(){
  var r = await api('/api/dummy/hit',{});
  if(r.error) return toast(r.error,'error');
  var el = _('dummy-result');
  if(el) el.innerHTML = '💥 造成 <b style="color:var(--red);font-size:24px">' + fn(r.damage) + '</b> 点伤害！' + (r.crit?' <span style="color:var(--yellow)">暴击!</span>':'') + (r.dodge?' <span style="color:var(--blue)">未命中</span>':'');
}

async function craftSetPiece(setId,slot){
  var r = await api('/api/forge/craft-set',{setId:setId,slot:slot});
  if(r.error) return toast(r.error,'error');
  toast(r.msg,'success');
  // 本地更新数据，不刷新界面
  if(r.weapon){ S.weps = (S.weps||[]).concat([r.weapon]); }
}
// Old forge stub for backward compat (keeps other pages working)
var _oldPgForge = async function(){ S._equipTab='craft'; return pgEquipment(); };
async function equipW(id,n,s){var r=await api('/api/forge/equip',{weaponId:id,weaponName:n,slot:s||'weapon'});if(r.error)return toast(r.error,'error');toast('装备成功','success');S.user.equipment=S.user.equipment||{};S.user.equipment[r.equipped.slot]=r.equipped.weaponId;refreshForgeOnly();}
async function unequipS(s){var r=await api('/api/forge/unequip',{slot:s});if(r.error)return toast(r.error,'error');toast('已卸下','success');S.user.equipment=S.user.equipment||{};S.user.equipment[s]='';refreshForgeOnly();}
function decompW(id,n){gameConfirm('确定分解 <b>'+esc(n)+'</b> ？<br><small style="color:var(--text-faint)">将返还锻造经验</small>',async function(){var r=await api('/api/forge/decompose',{weaponId:id,weaponName:n});if(r.error)return toast(r.error,'error');toast('分解 '+n+' → ⭐锻造经验+'+r.exp,'success');S.batchWeps=[];await refreshForgeOnly()})}
function toggleBatchWep(id){S.batchWeps=S.batchWeps||[];var i=S.batchWeps.indexOf(id);if(i>=0)S.batchWeps.splice(i,1);else S.batchWeps.push(id);_('batchWepCount').textContent=S.batchWeps.length;_('btnBatchDecompW').disabled=S.batchWeps.length===0}
function selectAllWeps(){S.batchWeps=[];var eq=S.user.equipment||{},eqIds=[];for(var s in eq){if(eq[s])eqIds.push(eq[s])}var weps=S.weps||[];for(var i=0;i<weps.length;i++){var w=weps[i];if(eqIds.indexOf(w.id)<0&&eqIds.indexOf(w.name)<0)S.batchWeps.push(w.id)}_('batchWepCount').textContent=S.batchWeps.length;_('btnBatchDecompW').disabled=S.batchWeps.length===0;pgEquipment()}
async function batchDecompWeps(){var ids=S.batchWeps||[];if(!ids.length)return toast('请先勾选要分解的武器','warning');gameConfirm('确定批量分解 <b>'+ids.length+'</b> 件武器？<br><small style="color:var(--red)">此操作不可撤销</small>',async function(){var r=await api('/api/forge/decompose-batch',{weaponIds:ids});if(r.error)return toast(r.error,'error');toast('已分解 '+r.count+' 件武器 → ⭐锻造经验+'+r.exp,'success');S.batchWeps=[];refreshForgeOnly()})}
async function showGemSocket(wid,wn){
  var statCN={attack:'🗡️攻击',defense:'🛡️防御',speed:'💨速度',attack_speed:'⚡攻速',dodge:'👻闪避',hp:'❤️生命',crit_rate:'💥暴击率',crit_dmg:'💢暴伤',lifesteal:'🩸吸血',counter:'↩️反击',damage_reduce:'🛡️减伤',exp_bonus:'📖经验',gold_bonus:'💰金币'};
  var gems=await api('/api/gems');
  var w=(S.weps||[]).find(function(w2){return w2.id===wid});
  if(!w) return toast('武器未找到','error');
  var wsGems=w.sockets||[],maxSockets=w.max_sockets||gems.max_sockets||3;
  var modalId='gem-socket-modal';

  var h='<div class="modal-overlay" id="'+modalId+'" onclick="if(event.target===this)document.getElementById(\''+modalId+'\').remove()">';
  h+='<div class="modal" style="max-width:560px;max-height:85vh;overflow-y:auto">';
  h+='<h2>💎 宝石镶嵌</h2>';
  h+='<p style="font-size:15px;color:var(--text-muted);margin-bottom:4px">武器: <b style="color:var(--text)">'+esc(wn)+'</b></p>';
  h+='<p style="font-size:14px;color:var(--text-muted);margin-bottom:12px">已镶嵌: <b style="color:var(--purple)">'+wsGems.length+'</b> / <b>'+maxSockets+'</b> 孔</p>';

  // 已镶嵌宝石
  if(wsGems.length>0){
    h+='<div style="margin-bottom:10px"><b style="font-size:15px;color:var(--text)">🔒 已镶嵌:</b></div>';
    for(var i=0;i<wsGems.length;i++){
      var sg=wsGems[i];
      var sr=sg.rarity||1;
      h+='<div class="item-card rarity-'+sr+'" style="display:flex;align-items:center;justify-content:space-between;margin:4px 0">';
      h+='<div><b>💎 '+esc(sg.name)+'</b> <span class="badge badge-r'+sr+'">⭐'+sr+'</span>';
      h+=' <span style="font-weight:600;color:var(--purple)">'+(statCN[sg.stat]||sg.stat)+' +'+sg.value+'</span></div>';
      h+='<button class="btn btn-outline btn-sm" style="color:var(--red);border-color:var(--red)" onclick="unsocketGem(\''+wid+'\','+i+')">取下</button>';
      h+='</div>';
    }
    h+='<button class="btn btn-outline btn-sm" style="color:var(--orange-light);border-color:var(--orange-light);margin-top:8px" onclick="unsocketGemAll(\''+wid+'\')">📦 一键卸下所有宝石</button>';
  }

  // 可用宝石选择
  var avail=gems.gems||[];
  var remaining=Math.max(0,maxSockets-wsGems.length);
  if(wsGems.length<maxSockets&&avail.length>0){
    h+='<h3 style="margin-top:18px">🔓 可用宝石 <small style="font-weight:normal;font-size:13px;color:var(--text-muted)">剩余 ' + remaining + ' 孔，勾选后批量镶嵌</small></h3>';
    h+='<div id="gemBatchSelect" style="max-height:260px;overflow-y:auto">';
    for(var i=0;i<avail.length;i++){
      var ag=avail[i];
      var ar=ag.rarity||1;
      h+='<label class="item-card rarity-'+ar+'" style="display:flex;align-items:center;gap:10px;margin:4px 0;cursor:pointer">';
      h+='<input type="checkbox" class="gem-checkbox" value="'+ag.id+'" onchange="updateGemSelectCount()" style="width:18px;height:18px;flex-shrink:0;accent-color:var(--purple)">';
      h+='<div style="flex:1"><b>💎 '+esc(ag.name)+'</b> <span class="badge badge-r'+ar+'">⭐'+ar+'</span>';
      h+=' <span style="font-weight:600;color:var(--purple)">'+(statCN[ag.stat]||ag.stat)+' +'+ag.value+'</span></div>';
      h+='</label>';
    }
    h+='</div>';
    h+='<div style="margin-top:12px;display:flex;align-items:center;gap:10px">';
    h+='<button class="btn btn-blue" onclick="socketGemBatch(\''+wid+'\')">🔨 批量镶嵌 (<span id="gemSelectCount">0</span>)</button>';
    h+='</div>';
  } else if(wsGems.length>=maxSockets){
    h+='<div style="text-align:center;padding:20px;color:var(--text-faint)"><span style="font-size:32px;display:block;margin-bottom:8px">✅</span>宝石孔已满</div>';
  } else {
    h+='<div style="text-align:center;padding:20px;color:var(--text-faint)"><span style="font-size:32px;display:block;margin-bottom:8px">📭</span>没有可用宝石<br><small>宝石可从冒险BOSS掉落或锻造合成获得</small></div>';
  }

  h+='<div style="margin-top:16px;text-align:right">';
  h+='<button class="btn btn-outline btn-sm" onclick="document.getElementById(\''+modalId+'\').remove()">关闭</button>';
  h+='</div>';
  h+='</div></div>';

  // 移除旧弹窗
  var old=document.getElementById(modalId);
  if(old) old.remove();
  document.body.insertAdjacentHTML('beforeend',h);
}
function closeGemModal(){var m=document.getElementById('gem-socket-modal');if(m)m.remove();}
async function socketGem(wid,gid){
  var r=await api('/api/gem/socket',{weaponId:wid,gemId:gid});
  if(r.error) return toast(r.error,'error');
  var scc={attack:'🗡️攻击',defense:'🛡️防御',speed:'💨速度',attack_speed:'⚡攻速',dodge:'👻闪避',hp:'❤️生命'};
  toast('镶嵌 '+r.gem+' → '+r.weapon+' ('+(scc[r.stat]||r.stat)+' +'+r.value+')','success');
  closeGemModal();refreshForgeOnly();
}
function updateGemSelectCount(){
  var checked=document.querySelectorAll('.gem-checkbox:checked').length;
  var el=_('gemSelectCount');
  if(el) el.textContent=checked;
}
async function socketGemBatch(wid){
  var checkboxes=document.querySelectorAll('.gem-checkbox:checked');
  var gemIds=[];
  for(var i=0;i<checkboxes.length;i++) gemIds.push(checkboxes[i].value);
  if(!gemIds.length) return toast('请先选择要镶嵌的宝石','error');
  var r=await api('/api/gem/socket-batch',{weaponId:wid,gemIds:gemIds});
  if(r.error) return toast(r.error,'error');
  toast('成功镶嵌 '+r.count+' 颗宝石到 '+r.weapon+'！','success');
  closeGemModal();refreshForgeOnly();
}
async function unsocketGem(wid,gi){
  var r=await api('/api/gem/unsocket',{weaponId:wid,gemIndex:gi});
  if(r.error) return toast(r.error,'error');
  toast('取下 '+r.gem+' 从 '+r.weapon,'success');
  closeGemModal();refreshForgeOnly();
}
async function unsocketGemAll(wid){
  gameConfirm('确定一键卸下该武器上的<b>所有宝石</b>吗？',async function(){
    var r=await api('/api/gem/unsocket-all',{weaponId:wid});
    if(r.error) return toast(r.error,'error');
    toast('成功卸下 '+r.count+' 颗宝石从 '+r.weapon,'success');
    closeGemModal();refreshForgeOnly();
  })
}
// -- 宝石分解 --
async function decomposeGem(gid){
  gameConfirm('确定分解这颗宝石吗？将返还锻造经验和金币。',async function(){
    var r=await api('/api/gem/decompose',{gemId:gid});
    if(r.error) return toast(r.error,'error');
    toast('🔨 分解了 '+r.decomposed+'！获得 💰'+r.coins+' ⚒️经验+'+r.exp+'（锻造 Lv.'+r.forge_level+'）','success');
    refreshForgeOnly();
  })
}
async function decomposeBatchGems(){
  var checks=document.querySelectorAll('.gem-check:checked');
  if(checks.length===0) return toast('请先勾选要分解的宝石','info');
  var ids=[];
  for(var i=0;i<checks.length;i++) ids.push(checks[i].value);
  gameConfirm('确定批量分解这 <b>'+ids.length+'</b> 颗宝石吗？',async function(){
    var r=await api('/api/gem/decompose-batch',{gemIds:ids});
    if(r.error) return toast(r.error,'error');
    toast('🔨 批量分解了 '+r.count+' 颗宝石！获得 💰'+r.coins+' ⚒️经验+'+r.exp+'（锻造 Lv.'+r.forge_level+'）','success');
    refreshForgeOnly();
  })
}
function selectGemsBelowRarity(){
  var sel=document.getElementById('gem-rarity-select');
  var maxRarity=parseInt(sel.value)||1;
  var checks=document.querySelectorAll('.gem-check');
  for(var i=0;i<checks.length;i++){
    var card=checks[i].closest('.item-card');
    if(card){
      // 从 class 解析稀有度
      var cls=card.className||'';
      var m=cls.match(/rarity-(\d+)/);
      var rarity=m?parseInt(m[1]):1;
      checks[i].checked=(rarity<=maxRarity);
    }
  }
  var cnt=document.querySelectorAll('.gem-check:checked').length;
  toast('已选择 '+cnt+' 颗宝石','info');
}
function selectAllGems(){
  var checks=document.querySelectorAll('.gem-check');
  for(var i=0;i<checks.length;i++) checks[i].checked=true;
  toast('已全选 '+checks.length+' 颗宝石','info');
}
function deselectAllGems(){
  var checks=document.querySelectorAll('.gem-check');
  for(var i=0;i<checks.length;i++) checks[i].checked=false;
  toast('已取消全选','info');
}
// -- 活动武器进化 --
var _evoCosts = [
  {stage:'I',cost:15,mats:'🔥火焰之心×3 + ⭐星之碎片×5',desc:'基础 → I 阶'},
  {stage:'II',cost:30,mats:'❄️寒冰核心×5 + 🌊深海珍珠×5 + 🪙古代金币×10',desc:'I → II 阶'},
  {stage:'III',cost:50,mats:'💎大地核心×3 + 🐉混沌之鳞×5 + ✨创世结晶×3',desc:'II → III 阶'}
];
async function evolveWeapon(wid){
  var w = (S.weps||[]).find(function(w2){return w2.id===wid});
  var stage = w ? (w.evolve_stage||0) : 0;
  if(stage >= 3) return toast('已达最高进化阶段','info');
  var c = _evoCosts[stage];
  var msg = '⚡ 进化活动武器 ('+c.desc+')<br><br>' +
    '<b>消耗:</b><br>' +
    '☀️ 夏日币 ×<b>'+c.cost+'</b><br>' +
    c.mats + '<br><br>' +
    '<small style=\"color:var(--yellow)\">全属性提升 | 稀有度+1级 | 成长倍率提升</small>';
  gameConfirm(msg, async function(){
    var r = await api('/api/forge/evolve',{weaponId:wid});
    if(r.error) return toast(r.error,'error');
    toast('⚡ '+r.name+' 进化成功！('+r.rarity_name+') 🗡️'+r.atk_before+'→'+r.atk_after+' (+'+r.mult+'%)','success');
    refreshForgeOnly();
  });
}

// -- 强化石强化弹窗 --
function showStrengthen(id,n){
  var w=(S.weps||[]).find(function(w2){return w2.id===id});
  if(!w) return toast('武器未找到','error');
  // 检查背包中的强化石
  var inv = S.user.inventory || {};
  var stoneNames = ['初级强化石','中级强化石','高级强化石','特级强化石','攻击强化石','防御强化石','幸运强化石','觉醒强化石','突破强化石','混沌强化石'];
  var availableStones = [];
  for(var i=0;i<stoneNames.length;i++){
    var sn=stoneNames[i], cnt=inv[sn]||0;
    if(cnt>0) availableStones.push({name:sn, count:cnt});
  }
  if(!availableStones.length) return toast('背包中没有强化石！强化石可通过合成、冒险、钓鱼获取','error');
  var curStr=w.strengthen_count||0;
  var protCnt = inv['强化保护符']||0;
  var h='<div style="padding:10px"><h3>🔨 强化石强化: '+esc(n)+'</h3>';
  h+='<p>当前强化: <b>+'+curStr+'</b> | 🪙金币: '+fn(S.user.coins||0)+' | 🛡️保护符: '+protCnt+'个</p>';
  h+='<div style="margin:8px 0"><b>选择强化石:</b></div>';
  for(var i=0;i<availableStones.length;i++){
    var st=availableStones[i];
    // 获取石头配置
    var cfg = getStoneConfig(st.name);
    var canUse = curStr < (cfg.maxStr||20);
    h+='<div class="item-card" style="padding:8px;margin:4px 0;'+(canUse?'cursor:pointer':'opacity:0.5')+'" onclick="'+(canUse?'doStrengthenStone(\''+id+'\',\''+st.name+'\')':'')+'">';
    h+='<b>💎 '+esc(st.name)+'</b> x'+st.count+' | '+(cfg.label||'成功率: <b style=\"color:'+(cfg.rate>=0.7?'var(--green)':cfg.rate>=0.5?'var(--yellow)':'var(--red)')+'\">'+(cfg.rate*100).toFixed(0)+'%</b>');
    h+=' | +~'+(cfg.maxStr||20);
    if(cfg.type==='normal'){
      h+='<br><small>🎯属性偏向 | ✨特殊'+(cfg.specChance||10)+'% | 💎每+5突破</small>';
    } else if(cfg.type==='offensive'||cfg.type==='defensive'){
      h+='<br><small>'+(cfg.label||'')+' | 成功率'+(cfg.rate*100).toFixed(0)+'%</small>';
    } else {
      h+='<br><small>'+(cfg.label||'')+' | 成功率'+(cfg.rate*100).toFixed(0)+'%</small>';
    }
    if(!canUse) h+=' <span style=\"color:var(--text-faint)\">(已达上限)</span>';
    h+='</div>';
  }
  if(protCnt>0) h+='<p style="font-size:12px;color:var(--text-faint);margin-top:4px">🛡️ 强化失败时自动消耗保护符防止降级（+5以上生效）</p>';
  h+='<button class="btn btn-outline btn-sm" style="margin-top:8px" onclick="pgEquipment()">返回</button></div>';
  _('content').innerHTML=h;
}
function getStoneConfig(name){
  var configs = {
    '初级强化石': {rate:0.90, minStr:0, maxStr:3, boost:0.20, rarity:1, specChance:11, focusCount:1, type:'normal', label:''},
    '中级强化石': {rate:0.75, minStr:0, maxStr:7, boost:0.22, rarity:2, specChance:17, focusCount:2, type:'normal', label:''},
    '高级强化石': {rate:0.60, minStr:0, maxStr:12, boost:0.25, rarity:3, specChance:23, focusCount:2, type:'normal', label:''},
    '特级强化石': {rate:0.40, minStr:0, maxStr:20, boost:0.30, rarity:4, specChance:29, focusCount:2, type:'normal', label:''},
    '攻击强化石': {rate:0.80, minStr:0, maxStr:10, boost:0.25, rarity:2, specChance:15, focusCount:2, type:'offensive', label:'⚔️专攻攻击/速度/攻速'},
    '防御强化石': {rate:0.80, minStr:0, maxStr:10, boost:0.25, rarity:2, specChance:15, focusCount:2, type:'defensive', label:'🛡️专攻防御/生命/闪避'},
    '幸运强化石': {rate:1.0, minStr:0, maxStr:5, boost:0.22, rarity:3, specChance:20, focusCount:2, type:'lucky', label:'🍀100%成功！'},
    '觉醒强化石': {rate:0.55, minStr:0, maxStr:10, boost:0.20, rarity:4, specChance:100, focusCount:2, type:'awakening', label:'✨必定获得特殊属性'},
    '突破强化石': {rate:0.50, minStr:0, maxStr:15, boost:0.15, rarity:4, specChance:25, focusCount:1, type:'breakthrough', label:'💎必定品质突破'},
    '混沌强化石': {rate:0.65, minStr:0, maxStr:20, boost:0.12, rarity:5, specChance:25, focusCount:2, type:'chaos', label:'🎲50%双倍/30%正常/20%削弱'}
  };
  return configs[name] || {rate:0.5, minStr:0, maxStr:20, boost:0.15, rarity:1, specChance:10, focusCount:1, type:'normal', label:''};
}
async function doStrengthenStone(wid, stoneName){
  var r = await api('/api/forge/strengthen-stone',{weaponId:wid, stoneName:stoneName});
  if(r.error) return toast(r.error,'error');
  toast(r.msg, r.success?'success':'warning');
  await refreshForgeOnly();
}
function adjSM(mn,d){
  if(d>0){
    var avail=0;for(var j=0;j<(S.fm||[]).length;j++){if((S.fm[j].name||S.fm[j])===mn){avail=S.fm[j].count||0;break}}
    var curCnt=0;for(var k=0;k<S.strSel.length;k++){if(S.strSel[k]===mn)curCnt++}
    if(curCnt>=avail) return toast('材料不足','error');
    if(S.strSel.length>=(S.strLimit||6)) return toast('最多选'+(S.strLimit||6)+'个材料','error');
    S.strSel.push(mn);
  } else {
    var idx=S.strSel.indexOf(mn);if(idx>=0)S.strSel.splice(idx,1);
  }
  _('strSelLabel').textContent=S.strSel.length>0?S.strSel.join(','):'无';
  _('strSelCount').textContent=S.strSel.length;
  var btn=document.getElementById('btnStrDo'); if(btn) btn.disabled=(S.strSel||[]).length<1;
  updateStrPreview();
  renderStrMatList();
}
function updateStrPreview(){
  var fm=S.fm||[],fi=S.fi||{},strCfg=S.strCfg||{},statMult=strCfg.stat_bonus_mult||0.85;
  var sel=S.strSel||[];if(!sel.length){var el=document.getElementById('strPreview');if(el)el.innerHTML='';return}
  var preview={};var cn2={attack:'攻击',defense:'防御',speed:'速度',attack_speed:'攻速',dodge:'闪避',hp:'生命'};
  for(var i=0;i<sel.length;i++){
    var mn=sel[i],info=fi[mn]||{};
    var val=(info.value||1)*statMult;
    if(info.universal){var stat=info.stat||'全能';
      for(var s2 in cn2){preview[s2]=(preview[s2]||0)+Math.max(1,Math.floor(val/6))}
    } else {var s=info.stat||'hp';preview[s]=(preview[s]||0)+Math.max(1,Math.floor(val))}
    if(info.bonus){for(var b2 in info.bonus){preview[b2]=(preview[b2]||0)+Math.max(1,Math.floor((info.bonus[b2]||0)*statMult))}}
  }
  var parts=[];for(var s in preview){if(preview[s]>0)parts.push((cn2[s]||s)+':<b style="color:var(--green)">+~'+Math.floor(preview[s])+'</b>')}
  var el=document.getElementById('strPreview');if(el)el.innerHTML='预计提升: '+parts.join(' | ');
}
function renderStrMatList(){
  var fm=S.fm||[],fi=S.fi||{},cn2={attack:'攻击',defense:'防御',speed:'速度',attack_speed:'攻速',dodge:'闪避',hp:'生命',universal:'全能'},spNames={crit_rate:'暴击率',crit_dmg:'暴伤',lifesteal:'吸血',dmg_reduce:'减伤',counter:'反击',extra_atk:'连击',exp_bonus:'经验加成',coin_bonus:'金币加成',fire_damage:'火焰伤害'};
  var availMap2={};for(var i=0;i<fm.length;i++){var am2=fm[i];availMap2[am2.name||am2]=am2.count||0}
  S.strSel=(S.strSel||[]).filter(function(x){return availMap2[x]>0});
  var selMap={};for(var j=0;j<S.strSel.length;j++){var sn=S.strSel[j];selMap[sn]=(selMap[sn]||0)+1}
  var h2='',limit=S.strLimit||6;
  for(var i=0;i<fm.length;i++){
    var m2=fm[i],mn=m2.name||m2,avail=m2.count||0,minfo=fi[mn]||{},stat=minfo.universal?'全能':(cn2[minfo.stat]||minfo.stat||'?');
    if(avail<=0&&!selMap[mn]) continue;
    var selCnt=selMap[mn]||0,total=S.strSel.length,canAdd=selCnt<avail&&total<limit;
    var xt='';if(minfo.bonus){for(var b2 in minfo.bonus){xt+=' <span style="font-size:10px;color:var(--green)">+'+(minfo.bonus[b2])+'</span>'}}if(minfo.all_mult){xt+=' <span style="font-size:10px;color:var(--purple)">⬆'+(minfo.all_mult*100)+'%</span>'}if(minfo.force_special){xt+=' <span style="font-size:10px;color:var(--orange)">🔥'+(spNames[minfo.force_special]||minfo.force_special)+'</span>'}
    h2+='<span style="padding:5px 10px;border-radius:5px;border:2px solid '+(selCnt>0?'var(--orange)':'var(--border-light)')+';background:'+(selCnt>0?'var(--orange-bg)':'var(--bg-input)')+';font-size:14px">'+esc(mn)+(avail>1?' x'+avail:'')+' <small>'+stat+'+'+(minfo.value||'?')+'</small>'+xt;
    if(selCnt>0){
      h2+=' <button onclick="adjSM(\''+mn+'\',-1)" style="display:inline-block;width:22px;height:22px;padding:0;line-height:20px;text-align:center;border:1px solid var(--red);border-radius:3px;background:var(--red-light);color:#fff;cursor:pointer;font-size:16px;font-weight:bold">−</button>';
      h2+=' <span style="font-weight:bold;color:var(--orange);min-width:16px;text-align:center">'+selCnt+'</span>';
      if(canAdd) h2+=' <button onclick="adjSM(\''+mn+'\',1)" style="display:inline-block;width:22px;height:22px;padding:0;line-height:20px;text-align:center;border:1px solid var(--green);border-radius:3px;background:var(--green-light);color:#fff;cursor:pointer;font-size:16px;font-weight:bold">+</button>';
    }
    if(selCnt===0){
      if(canAdd) h2+=' <button onclick="adjSM(\''+mn+'\',1)" style="display:inline-block;width:22px;height:22px;padding:0;line-height:20px;text-align:center;border:1px solid var(--green);border-radius:3px;background:var(--green-light);color:#fff;cursor:pointer;font-size:16px;font-weight:bold">+</button>';
      else h2+=' <span style="color:var(--text-faint);font-size:12px">'+(selCnt>=avail?'已用完':'已满')+'</span>';
    }
    h2+='</span>';
  }
  var el=document.getElementById('strMatList');if(el)el.innerHTML=h2;
}
// -- 自由锻造材料选择 --
S._craftMats = S._craftMats || [];
function toggleCraftMat(mn){
  var idx = S._craftMats.indexOf(mn);
  if(idx >= 0) { S._craftMats.splice(idx, 1); }
  else if(S._craftMats.length < 10) { S._craftMats.push(mn); }
  else { return toast('最多选10个材料','error'); }
  _('craftSelCount').textContent = S._craftMats.length;
  _('craftSelLabel').textContent = S._craftMats.length>0 ? S._craftMats.join(', ') : '无';
  var btn = document.getElementById('btnCraftDo'); if(btn) btn.disabled = S._craftMats.length < 2;
  // highlight selected mats
  var fm = S.fm || [];
  for(var i=0;i<fm.length;i++){
    var el = document.getElementById('cm-'+escAttr(fm[i].name));
    if(el) el.style.background = S._craftMats.indexOf(fm[i].name)>=0 ? 'var(--orange-bg)' : '';
  }
}
function clearCraftMats(){ S._craftMats=[]; _('craftSelCount').textContent='0'; _('craftSelLabel').textContent='无'; var btn=document.getElementById('btnCraftDo');if(btn)btn.disabled=true; }
async function doCraft(){
  var name = (_('craftName')||{}).value || '';
  if(!name.trim()) return toast('请输入武器名称','error');
  if(S._craftMats.length < 2) return toast('至少选择2个材料','error');
  S._lastCraftName = name;
  S._lastCraftType = (_('craftType')||{}).value || 'weapon';
  var r = await api('/api/forge/craft',{name:name,weaponType:S._lastCraftType,materials:S._craftMats.slice()});
  if(r.error) return toast(r.error,'error');
  toast('⚒️ 锻造成功！'+r.weapon.name+' ('+r.rarity_name+')','success');
  var fKeep = parseInt((typeof getSet!=='undefined'?getSet('forge_keep_name',0):0));
  if(!fKeep) S._lastCraftName = '';
  var fKeepMat = parseInt((typeof getSet!=='undefined'?getSet('forge_keep_mat',0):0));
  if(!fKeepMat) { S._craftMats = []; clearCraftMats(); }
  refreshForgeOnly();
}
async function doStrengthen(){
  var id=S.strWid,mats=(S.strSel||[]).slice();
  if(!id||mats.length<1) return toast('请选择材料和武器','error');
  // 检查材料是否还有库存（防止过期状态）
  var availMap={};for(var i=0;i<(S.fm||[]).length;i++){var am=S.fm[i];availMap[am.name||am]=am.count||0}
  var matCounts={};for(var j=0;j<mats.length;j++){matCounts[mats[j]]=(matCounts[mats[j]]||0)+1}
  for(var mn in matCounts){if((availMap[mn]||0)<matCounts[mn]) return toast('材料「'+mn+'」库存不足，请刷新','error')}
  var r=await api('/api/forge/strengthen',{weaponId:id,materials:mats});
  if(r.error) return toast(r.error,'error');
  toast(r.msg,'success');S.strSel=[];refreshForgeOnly();
}
// ==================== 技能 ====================
S.skillTab=S.skillTab||'skills';
async function pgSkill(){
  var r=await api('/api/skill');
  S.skillData=r;
  var h='<div class="card"><h2>📚 技能与职业 ('+(r.skill_points||0)+'SP)</h2>';
  h+='<div class="tabs"><button class="tab'+(S.skillTab==='skills'?' active':'')+'" onclick="S.skillTab=\'skills\';pgSkill()">📚 技能树</button>';
  h+='<button class="tab'+(S.skillTab==='profession'?' active':'')+'" onclick="S.skillTab=\'profession\';pgSkill()">💼 职业</button></div>';
  if(S.skillTab==='skills'){
    h+='<div class="item-grid">';
    for(var i=0;i<(r.skills||[]).length;i++){
      var s=r.skills[i],clv=(r.user_skills||{})[s.id]||0,noMax=['hp','attack','defense','speed','attack_speed'].indexOf(s.id)>=0;
      var max=noMax?'∞':50,atMax=!noMax&&clv>=50;
      var isPct=(s.effect_per_level||0)<1;
      var curEff=isPct?'+'+(clv*(s.effect_per_level||0)*100).toFixed(1)+'%':'+'+clv*(s.effect_per_level||0);
      var icon=s.icon||'📌';
      h+='<div class="item-card rarity-'+(s.max_bonus?3:2)+'">';
      h+='<b>'+icon+' '+esc(s.name)+'</b> Lv.'+clv+'/'+max;
      if(s.detail_desc) h+='<p class="skill-desc">'+esc(s.detail_desc)+'</p>';
      var pct=noMax?Math.min(100,clv/50*100):(clv/50*100);
      h+='<div class="progress-bar" style="margin:4px 0"><div class="fill" style="width:'+pct+'%;background:'+(noMax?'var(--green)':'var(--purple)')+'"></div></div>';
      h+='<div class="skill-effects"><div>📊 当前: <b>'+curEff+'</b> | 每级: '+(isPct?'+'+(s.effect_per_level*100).toFixed(1)+'%':'+'+s.effect_per_level)+(s.base?' | 基础: '+s.base:'')+'</div></div>';
      h+=atMax?'<br>✅已满':'<br><input id="sk'+s.id+'" type="number" value="1" min="1" max="999" style="width:80px;min-width:80px;font-size:14px"> <button class="btn btn-blue btn-sm" onclick="addSk(\''+s.id+'\')">升级</button>';
      h+='</div>';
    }
    h+='</div>';
  } else {
    h+=await renderProfession();
  }
  h+='</div>';_('content').innerHTML=h;
}
async function addSk(id){var el=_('sk'+id),pts=el?parseInt(el.value, 10)||1:1;var r=await api('/api/skill/add',{skillId:id,points:pts});if(r.error)return toast(r.error,'error');var skName=(S.skillData||{}).skills||[];var sn='';for(var i=0;i<skName.length;i++){if(skName[i].id===id){sn=skName[i].name;break}}toast((sn||id)+' Lv.'+r.new_level,'success');await refresh();pgSkill()}

// ==================== 职业系统 ====================
async function renderProfession(){
  var r=await api('/api/profession');
  S.profData=r;
  var h='<div class="card" style="border-left:4px solid var(--purple)"><h3>💼 主职业</h3>';
  // 当前主职业
  if(r.current){
    var c=r.current;
    var lv=c.level||1,ml=c.max_level||10;
    h+='<div style="padding:10px 14px;margin:8px 0;background:var(--bg-purple-pale);border-radius:8px;border:2px solid var(--purple)">';
    h+='<p><b>'+c.icon+' '+c.name+' Lv.'+lv+'/'+ml+'</b></p>';
    h+='<p style="font-size:14px;color:#666">'+c.description+'</p>';
    h+='<p style="font-size:13px;color:var(--purple)"><b>加成(Lv.'+lv+')：</b>'+c.bonus_desc+'</p>';
    h+='<div class="progress-bar" style="margin:6px 0"><div class="fill" style="width:'+(lv/ml*100)+'%;background:var(--purple)"></div></div>';
    if(c.can_level_up){
      h+='<div style="padding:8px 12px;margin:8px 0;background:var(--orange-bg);border-radius:6px;border:1px solid var(--orange)">';
      h+='<p><b>⬆ 升级到 Lv.'+(lv+1)+'</b></p><p>💰'+fn(c.level_up_cost)+'金币</p>';
      for(var i=0;i<(c.level_up_materials||[]).length;i++){
        var m=c.level_up_materials[i];
        h+='<p style="color:'+(m.have>=m.needed?'var(--green)':'var(--red)')+'">📦 '+esc(m.name)+' '+m.have+'/'+m.needed+'</p>';
      }
      h+='<button class="btn btn-purple btn-sm" onclick="profLevelUp()"'+(c.level_up_mats_ready===false?' disabled':'')+'>⬆ 升级</button></div>';
    } else if(lv>=ml){
      h+='<p style="color:var(--green)">🏆 已达最高等级！</p>';
    }
    if(r.respec_card_available){
      h+='<p style="margin-top:8px"><button class="btn btn-outline btn-sm" style="color:var(--red);border-color:var(--red)" onclick="profRespec()">🔄 使用转职卡重置</button>';
      h+=' <span style="font-size:12px;color:var(--text-faint)">清空等级，返还50%材料</span></p>';
    }
    if(c.unlocked_items&&c.unlocked_items.length>0){
      h+='<h4 style="margin-top:14px">🎁 已解锁专属物品</h4><div class="item-grid">';
      for(var i=0;i<c.unlocked_items.length;i++){
        var ui=c.unlocked_items[i];
        h+='<div class="item-card rarity-'+(ui.rarity||2)+'"><b>'+esc(ui.name)+'</b><br><small>'+esc(ui.desc)+'</small><br><small style="color:var(--text-faint)">解锁等级: Lv.'+ui.unlock_level+'</small></div>';
      }
      h+='</div>';
    }
    h+='<details style="margin-top:8px"><summary style="cursor:pointer;color:var(--purple)">📊 查看等级加成表</summary><div style="padding:8px;max-height:200px;overflow-y:auto">';
    for(var i=0;i<(c.level_bonuses||[]).length;i++){
      var lb=c.level_bonuses[i];
      h+='<p style="font-size:13px;padding:4px 0;border-bottom:1px solid var(--border-light)">Lv.'+lb.level+': '+(lb.bonus_desc||'')+(lb.level<=lv?' ✅':'')+'</p>';
    }
    h+='</div></details>';
    if(c.recipes&&c.recipes.length>0){
      var inv=S.user.inventory||{};
      h+='<h4 style="margin-top:14px">⚗️ 职业合成配方</h4><p style="font-size:12px;color:var(--text-faint)">随等级解锁</p><div class="item-grid">';
      for(var i=0;i<c.recipes.length;i++){
        var rc=c.recipes[i],gd=true,igs=[];
        for(var j=0;j<(rc.ingredients||[]).length;j++){
          var ig=rc.ingredients[j],hv=inv[ig.name]||0;
          if(hv<ig.count) gd=false;
          igs.push('<span style="color:'+(hv>=ig.count?'var(--green)':'var(--red)')+'">'+esc(ig.name)+' '+hv+'/'+ig.count+'</span>');
        }
        h+='<div class="item-card rarity-'+(rc.rarity||1)+'" style="'+(gd?'':'opacity:.5')+'" onclick="'+(gd?'profSynth(\''+escAttr(rc.name)+'\')':'toast(\'材料不足\',\'error\')')+'">📦 <b>'+esc(rc.name)+'</b> '+(gd?'✅可合成':'❌缺材料')+(rc.min_level?'<br><small style="color:var(--text-faint)">解锁 Lv.'+rc.min_level+'</small>':'')+'<br><small>需要:'+igs.join(', ')+'</small><br><small style="color:var(--orange)">'+esc(rc.desc||'')+'</small></div>';
      }
      h+='</div>';
    }
    h+='</div>';
  } else {
    h+='<p style="color:var(--text-faint);text-align:center;padding:20px">你还没有选择主职业，请从下方选择一个</p>';
  }
  // 主职业列表
  h+='<h4 style="margin-top:12px">📋 可选主职业</h4><div class="item-grid">';
  for(var i=0;i<(r.professions||[]).length;i++){
    var p=r.professions[i];
    if(p.type!=='main') continue;
    var isCur=r.current&&r.current.id===p.id;
    h+='<div class="item-card" style="border:'+(isCur?'2px solid var(--purple);background:var(--bg-purple-pale)':'')+'"><b>'+p.icon+' '+esc(p.name)+'</b>';
    h+='<br><small style="color:#666">'+esc(p.description)+'</small>';
    h+='<br><small style="color:var(--text-faint)">最高 Lv.'+(p.max_level||10)+'</small>';
    if(!isCur) h+='<br><button class="btn btn-purple btn-sm" style="margin-top:6px" onclick="selectProf(\''+p.id+'\')">选择</button>';
    else h+='<br><span style="color:var(--purple);font-weight:bold">✅ 当前职业 Lv.'+(r.current.level||1)+'</span>';
    h+='</div>';
  }
  h+='</div>';
  // 转职卡说明
  h+='<div style="margin:8px 0;padding:8px 12px;background:var(--bg-input);border-radius:6px;border:1px solid var(--border-light)">';
  h+='<p style="font-size:13px">💡 <b>转职卡</b>：在合成页面制作。主职业Lv>1时切换消耗1张，返还50%升级材料</p></div>';
  h+='</div>';

  // 📌 副职业区域（仅能修炼一个）
  var subs=r.sub_professions||{};
  h+='<div class="card" style="border-left:4px solid var(--orange-light);margin-top:12px">';
  h+='<h3>🌟 副职业（厨师/药师，仅能修炼一个）</h3>';
  h+='<p style="font-size:13px;color:var(--text-faint);margin-bottom:8px">副职业独立于主职业，加成始终生效。切换需消耗 10000 金币</p>';
  var subOrder=['chef','alchemist'];
  for(var si=0;si<subOrder.length;si++){
    var sid=subOrder[si],s=subs[sid]||{};
    var subLv=s.level||0,subMl=s.max_level||10;
    var isActive=subLv>0;
    var borderColor=isActive?'var(--orange-light)':'var(--border-light)';
    var bgColor=isActive?'var(--bg-yellow-pale)':'var(--bg-card)';
    h+='<div style="padding:10px 14px;margin:8px 0;background:'+bgColor+';border-radius:8px;border:1px solid '+borderColor+'">';
    h+='<p><b>'+s.icon+' '+s.name+' Lv.'+subLv+'/'+subMl+'</b>';
    if(isActive) h+=' <span style="font-size:13px;color:var(--orange-light)">✅ 修炼中 · '+s.bonus_desc+'</span>';
    else h+=' <span style="font-size:13px;color:var(--text-faint)">未修炼</span>';
    h+='</p>';
    if(isActive){
      h+='<div class="progress-bar" style="margin:6px 0"><div class="fill" style="width:'+(subLv/subMl*100)+'%;background:var(--orange-light)"></div></div>';
      if(s.can_level_up){
        h+='<div style="padding:8px 12px;background:var(--orange-bg);border-radius:6px;border:1px solid var(--orange)">';
        h+='<p><b>⬆ 升级到 Lv.'+(subLv+1)+'</b></p><p>💰'+fn(s.level_up_cost)+'金币</p>';
        for(var i=0;i<(s.level_up_materials||[]).length;i++){
          var m2=s.level_up_materials[i];
          h+='<p style="color:'+(m2.have>=m2.needed?'var(--green)':'var(--red)')+'">📦 '+esc(m2.name)+' '+m2.have+'/'+m2.needed+'</p>';
        }
        h+='<button class="btn btn-orange btn-sm" onclick="subProfLevelUp(\''+sid+'\')"'+(s.level_up_mats_ready===false?' disabled':'')+'>⬆ 升级</button></div>';
      } else if(subLv>=subMl){
        h+='<p style="color:var(--green)">🏆 已达最高等级！</p>';
      }
      // 已解锁物品
      if(s.items&&s.items.length>0){
        h+='<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px">';
        for(var i=0;i<s.items.length;i++){
          var si=s.items[i];
          h+='<span class="badge badge-r'+(si.rarity>4?999:Math.min(si.rarity,4))+'">'+esc(si.name)+'</span>';
        }
        h+='</div>';
      }
      // 📊 详情：等级加成表
      if(s.level_bonuses&&s.level_bonuses.length>0){
        h+='<details style="margin-top:8px"><summary style="cursor:pointer;color:var(--orange-light);font-size:13px">📊 查看等级加成表</summary><div style="padding:8px;max-height:200px;overflow-y:auto">';
        for(var i=0;i<s.level_bonuses.length;i++){
          var lb=s.level_bonuses[i];
          h+='<p style="font-size:13px;padding:4px 0;border-bottom:1px solid var(--border-light)">Lv.'+lb.level+': '+(lb.bonus_desc||'')+(lb.level<=subLv?' ✅':'')+'</p>';
        }
        h+='</div></details>';
      }
      // ⚗️ 副职业合成配方
      if(s.recipes&&s.recipes.length>0){
        h+='<h4 style="margin-top:12px;font-size:14px">⚗️ 专属合成配方</h4><div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">';
        for(var i=0;i<s.recipes.length;i++){
          var sr=s.recipes[i];
          h+='<span class="badge badge-r'+(sr.rarity>4?999:Math.min(sr.rarity,4))+'">'+esc(sr.name)+'</span>';
        }
        h+='</div>';
      }
    } else {
      // 未修炼：显示选择/切换按钮
      var isOtherActive=false;
      for(var j=0;j<subOrder.length;j++){if(j!==si&&(subs[subOrder[j]].level||0)>0)isOtherActive=true;}
      var btnLabel=isOtherActive?'🌟 激活（10000金）':'🌟 选择修炼';
      h+='<p style="margin-top:6px"><button class="btn btn-outline btn-sm" style="border-color:var(--orange-light);color:var(--orange-light)" onclick="switchSubProf(\''+sid+'\')">'+btnLabel+'</button></p>';
    }
    h+='</div>';
  }
  h+='</div>';
  return h;
}
async function selectProf(id){
  var r=await api('/api/profession/select',{professionId:id});
  if(r.error) return toast(r.error,'error');
  var msg='就职 '+r.profession+' Lv.1！';
  if(r.card_used) msg='🔥消耗转职卡！'+r.profession+' Lv.1'+(r.refunded&&r.refunded.length?' 返还:'+r.refunded.join(','):'');
  toast(msg,'success');
  await refresh();pgSkill();
}
async function profLevelUp(){
  var r=await api('/api/profession/levelup',{});
  if(r.error) return toast(r.error,'error');
  toast('升级成功！Lv.'+r.new_level+' | '+r.bonus_desc,'success');
  await refresh();pgSkill();
}
async function subProfLevelUp(sid){
  var r=await api('/api/sub-profession/levelup',{professionId:sid});
  if(r.error) return toast(r.error,'error');
  toast('副职业升级成功！Lv.'+r.new_level+' | '+r.bonus_desc,'success');
  await refresh();pgSkill();
}
async function switchSubProf(sid){
  var r=await api('/api/sub-profession/switch',{professionId:sid});
  if(r.error) return toast(r.error,'error');
  toast(r.level>0?'🌟 开始修炼 '+r.name+' Lv.'+r.level:'已切换副职业为 '+r.name,'success');
  await refresh();pgSkill();
}
async function profRespec(){
  gameConfirm('确定使用转职卡重置职业？<br><small style="color:var(--red)">清空职业等级，返还50%升级材料</small>',async function(){
    var r=await api('/api/profession/respec',{});
    if(r.error) return toast(r.error,'error');
    toast(r.msg+(r.refunded&&r.refunded.length?' 返还: '+r.refunded.join(', '):''),'success');
    await refresh();pgSkill();
  });
}
async function profSynth(name){
  var r=await api('/api/profession/synthesize',{recipeName:name});
  if(r.error) return toast(r.error,'error');
  toast('合成 '+r.synthesized+(r.count>1?' x'+r.count:'')+'！','success');
  await refresh();pgSkill();
}
// ==================== 图鉴 ====================
S.handbookTab = S.handbookTab || 'fish';
// ==================== 稻草人训练 ====================
S.dummyHP=S.dummyHP||5000;S.dummyAtk=S.dummyAtk||200;S.dummyDef=S.dummyDef||200;S.dummySpd=S.dummySpd||100;S.dummyAspd=S.dummyAspd||100;S.dummyRounds=S.dummyRounds||10;
async function testDummy(){
  S.dummyDef=parseInt(_('dm-def').value,10)||200;
  S.dummySpd=parseInt(_('dm-spd').value,10)||100;
  S.dummyAspd=parseInt(_('dm-aspd').value,10)||100;
  S.dummyRounds=parseInt(_('dm-r').value,10)||10;
  var r=await api('/api/train/dummy',{hp:99999,attack:0,defense:S.dummyDef,speed:S.dummySpd,atk_speed:S.dummyAspd,rounds:S.dummyRounds});
  if(r.error)return toast(r.error,'error');
  var p=r.player,res=r.result,d=r.dummy;
  var h='<div class="card" style="border-left:4px solid var(--orange-light)"><h3>📊 测试结果</h3>';
  h+='<p>👤 <b>你的属性</b>: 🗡️攻击'+p.attack+' | 💨速度'+p.speed+' | ⚡攻速'+p.atk_speed+' | 暴击率'+p.crit_rate+'% | 暴伤'+p.crit_dmg+'% | 连击'+p.extra_atk+'%'+(p.fire_damage>0?' | 🔥火焰伤害'+p.fire_damage:'')+'</p>';
  h+='<p>🎯 <b>假人属性</b>: 🛡️防御'+d.defense+' | 💨速度'+d.speed+' | ⚡攻速'+d.atk_speed+'</p>';
  h+='<hr><p>⚔️ '+res.rounds+'回合 | 👊 '+res.hits+'次攻击</p>';
  h+='<p>💥 <b>总伤害: '+fn(res.total_dmg)+'</b> | 均伤: '+fn(res.avg_dmg)+' | DPS: '+fn(res.dps)+'/回合</p>';
  h+='<p>💢 暴击: '+res.crits+'次 | ⚡连击触发: '+res.extra_hits+'次'+(res.fire_total>0?' | 🔥火焰总伤: '+fn(res.fire_total):'')+'</p></div>';
  _('dummy-result').innerHTML=h;
}
async function pgHandbook() {
  var h = '<div class="card"><h2>📖 图鉴</h2>';
  h += '<div class="tabs">';
  h += '<button class="tab' + (S.handbookTab === 'fish' ? ' active' : '') + '" onclick="S.handbookTab=\'fish\';pgHandbook()">🐟 鱼类图鉴</button>';
  h += '<button class="tab' + (S.handbookTab === 'items' ? ' active' : '') + '" onclick="S.handbookTab=\'items\';pgHandbook()">📦 物品图鉴</button>';
  h += '<button class="tab' + (S.handbookTab === 'monsters' ? ' active' : '') + '" onclick="S.handbookTab=\'monsters\';pgHandbook()">👹 怪物图鉴</button>';
  h += '<button class="tab' + (S.handbookTab === 'skills' ? ' active' : '') + '" onclick="S.handbookTab=\'skills\';pgHandbook()">📚 技能详解</button>';
  h += '<button class="tab' + (S.handbookTab === 'sets' ? ' active' : '') + '" onclick="S.handbookTab=\'sets\';pgHandbook()">📜 套装图鉴</button>';
  h += '</div>';

  // 物品图鉴搜索框（放在tab外面避免重建丢失焦点）
  if (S.handbookTab === 'items') {
    if (!S.handbookItems) { var r2 = await api('/api/handbook/items'); S.handbookItems = r2.items || []; S.handbookCategories = r2.categories || []; }
    h += '<div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">';
    h += '<input id="hb-search" placeholder="🔍 搜索物品名称/来源/用途..." value="' + esc(S.handbookSearch || '') + '" style="flex:1;min-width:200px" oninput="S.handbookSearch=this.value;renderItemList()">';
    h += '<select onchange="S.handbookCatFilter=this.value;renderItemList()" style="width:140px;min-width:120px">';
    h += '<option value="all"' + ((S.handbookCatFilter||'all')==='all'?' selected':'') + '>全部分类</option>';
    var cats = S.handbookCategories || [];
    var catCN2 = {ore:'矿石',material:'材料',product:'产物',fish:'鱼',junk:'垃圾',consume:'消耗品',food:'食物',seed:'种子',animal:'动物',special:'特殊',bait:'鱼饵',rod:'鱼竿',gem:'宝石',other:'其他'};
    for (var ci = 0; ci < cats.length; ci++) { var c2 = cats[ci]; h += '<option value="'+c2+'"'+((S.handbookCatFilter||'all')===c2?' selected':'')+'>'+(catCN2[c2]||c2)+'</option>'; }
    h += '</select></div>';
    h += '<div id="handbook-item-list">' + renderItemListHTML() + '</div>';
  } else if (S.handbookTab === 'fish') {
    h += await renderFishHandbook();
  } else if (S.handbookTab === 'monsters') {
    h += await renderMonsterHandbook();
  } else if (S.handbookTab === 'skills') {
    h += await renderSkillGuide();
  } else if (S.handbookTab === 'sets') {
    h += await renderSetsHandbook();
  }
  h += '</div>';
  _('content').innerHTML = h;
}

async function renderFishHandbook() {
  var r = await api('/api/handbook/fish');
  if (r.error) return '<p style="color:var(--red)">加载失败: ' + r.error + '</p>';
  var fc = r.fish_collection || {};
  var allFish = (r.fish || []).concat(r.junk || []);
  var rarityLabel = {1:'普通', 2:'稀有', 3:'珍贵', 4:'史诗', 999:'神话', 0:'垃圾'};
  var h = '<p style="margin-bottom:12px;color:var(--text-muted)">🐟 已发现: <b>' + (r.caught_species || 0) + '</b> / ' + (r.total_species || 0) + ' 种</p>';
  h += '<div class="item-grid">';
  for (var i = 0; i < allFish.length; i++) {
    var f = allFish[i];
    var caught = fc[f.name] !== undefined;
    var recordWeight = fc[f.name] || null;
    var isProf = f.source && f.source.indexOf('渔夫') >= 0;
    h += '<div class="item-card rarity-' + (f.rarity || 1) + (caught ? '' : ' undiscovered') + '">';
    h += '<b>' + (caught ? '✅ ' : '❓ ') + esc(f.name) + '</b>';
    if (isProf) h += ' <span class="badge" style="background:var(--purple);color:#fff;font-size:11px">🎣职业</span>';
    h += '<br><span class="badge badge-r' + (f.rarity || 1) + '">' + (rarityLabel[f.rarity] || '未知') + '</span>';
    if (f.rarity > 0) {
      h += '<br><small>🐟 标准体重: ' + (f.base_weight || '?') + 'g | 💰售价: ' + fn(f.sell_price || 0) + '</small>';
    }
    if (recordWeight) {
      h += '<br><small style="color:var(--purple)">🏆 最高记录: ' + recordWeight + 'g</small>';
    }
    if (f.text) {
      h += '<br><small style="color:var(--text-faint);font-style:italic">' + esc(f.text) + '</small>';
    }
    h += '</div>';
  }
  h += '</div>';
  return h;
}

function renderItemListHTML() {
  var search = (S.handbookSearch || '').toLowerCase();
  var catFilter = S.handbookCatFilter || 'all';
  var items = S.handbookItems || [];
  var catCN = {ore:'矿石', material:'材料', product:'产物', fish:'鱼', junk:'垃圾', consume:'消耗品', food:'食物', seed:'种子', animal:'动物', special:'特殊', bait:'鱼饵', rod:'鱼竿', gem:'宝石', adv_gear:'冒险装备', other:'其他'};
  var rarityLabel = {1:'普通', 2:'稀有', 3:'珍贵', 4:'史诗', 5:'传说', 999:'神话', 9999:'至臻', 0:'垃圾'};
  var filtered = [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (search && (it.name||'').toLowerCase().indexOf(search) === -1 && (it.desc||'').toLowerCase().indexOf(search) === -1 && (it.source||'').toLowerCase().indexOf(search) === -1 && (it.use||'').toLowerCase().indexOf(search) === -1) continue;
    if (catFilter !== 'all' && it.category !== catFilter) continue;
    filtered.push(it);
  }
  var h = '<p style="margin-bottom:8px;color:var(--text-muted)">📦 共 <b>' + filtered.length + '</b> 件物品' + (search || catFilter !== 'all' ? '（已筛选）' : '') + '</p>';
  h += '<div class="item-grid">';
  for (var i = 0; i < filtered.length; i++) {
    var it = filtered[i];
    h += '<div class="item-card rarity-' + (it.rarity || 1) + '">';
    h += '<b>📦 ' + esc(it.name) + '</b>';
    h += '<br><span class="badge badge-r' + (it.rarity || 1) + '">' + (rarityLabel[it.rarity] || '未知') + '</span>';
    if (it.category) h += ' <span style="font-size:12px;color:var(--text-faint)">' + (catCN[it.category] || it.category) + '</span>';
    if (it.source) h += '<br><small>📥 来源: ' + esc(it.source) + '</small>';
    if (it.use || it.desc) h += '<br><small>💡 ' + esc(it.use || it.desc || '') + '</small>';
    if (it.sell_price) h += '<br><small>💰 售价: ' + fn(it.sell_price) + '</small>';
    h += '</div>';
  }
  h += '</div>';
  return h;
}
function renderItemList() {
  var el = _('handbook-item-list');
  if (el) el.innerHTML = renderItemListHTML();
}

async function renderMonsterHandbook() {
  if (!S.handbookMonsters) {
    var r = await api('/api/handbook/monsters');
    if (r.error) return '<p style="color:var(--red)">加载失败: ' + r.error + '</p>';
    S.handbookMonsters = r.monsters || [];
  }
  var monsters = S.handbookMonsters;
  var h = '<p style="margin-bottom:12px;color:var(--text-muted)">👹 共 <b>' + monsters.length + '</b> 种怪物</p>';
  h += '<div class="item-grid">';
  for (var i = 0; i < monsters.length; i++) {
    var m = monsters[i];
    var regions = m.regions || [];
    var regionText = regions.length > 0 ? regions.map(function(r) { return (r.icon || '📍') + ' ' + r.name; }).join(', ') : '未知区域';
    h += '<div class="item-card" style="border-left:5px solid var(--red)">';
    h += '<b>👹 ' + esc(m.name) + '</b>';
    if (m.special) h += ' <span class="badge" style="background:var(--orange-bg);color:var(--orange-dark)">⚡' + esc(m.special) + '</span>';
    h += '<br><small>📍 ' + regionText + '</small>';
    h += '<br><small>❤️HP: ' + fn(m.base_hp || 0) + ' | 🗡️ATK: ' + fn(m.base_attack || 0) + ' | 🛡️DEF: ' + fn(m.base_defense || 0) + '</small>';
    h += '<br><small>💨SPD: ' + fn(m.base_speed || 0) + ' | ⚡攻速: ' + fn(m.base_atk_speed || 0) + ' | ⚔️最低战力: ' + fn(m.min_power || 0) + '</small>';
    if (m.drops && m.drops.length > 0) {
      h += '<br><small>📦 掉落: ' + m.drops.join(', ') + '</small>';
    }
    if (m.rare_drops && m.rare_drops.length > 0) {
      h += '<br><small>🌟 稀有掉落(' + ((m.rare_drop_chance || 0) * 100).toFixed(1) + '%): ' + m.rare_drops.join(', ') + '</small>';
    }
    h += '</div>';
  }
  h += '</div>';
  return h;
}

async function renderSkillGuide() {
  var r = await api('/api/skill');
  if (r.error) return '<p style="color:var(--red)">加载失败: ' + r.error + '</p>';
  var clv = r.user_skills || {};
  var skills = r.skills || [];
  var h = '<p style="margin-bottom:12px;color:var(--text-muted)">📚 共 <b>' + skills.length + '</b> 项技能 | 💡 基础属性类技能无等级上限</p>';
  h += '<div class="item-grid">';
  for (var i = 0; i < skills.length; i++) {
    var s = skills[i];
    var icon = s.icon || '📌';
    var detail = s.detail_desc || s.description || '';
    var lv = clv[s.id] || 0;
    var isUncapped = !s.max_bonus;
    var maxLv = isUncapped ? Infinity : 50;
    var atMax = !isUncapped && lv >= maxLv;
    var isPercent = (s.effect_per_level || 0) < 1;
    var currentEffect = isPercent ? '+' + (lv * (s.effect_per_level || 0) * 100).toFixed(1) + '%' : '+' + (lv * (s.effect_per_level || 0));
    var refLv = isUncapped ? 50 : maxLv;
    var maxEffectDisplay = isUncapped
      ? '无上限 (参考 Lv.50: ' + (isPercent ? '+' + (refLv * (s.effect_per_level || 0) * 100).toFixed(1) + '%' : '+' + (refLv * (s.effect_per_level || 0))) + ')'
      : (isPercent ? '+' + (maxLv * (s.effect_per_level || 0) * 100).toFixed(1) + '%' : '+' + (maxLv * (s.effect_per_level || 0)));
    if (s.base && isUncapped) maxEffectDisplay += ' | 基础: ' + s.base;

    h += '<div class="item-card rarity-' + (s.max_bonus ? 3 : 2) + '" style="' + (atMax ? 'opacity:.8' : '') + '">';
    h += '<b>' + icon + ' ' + esc(s.name) + '</b>';
    if (detail) h += '<p class="skill-desc">' + esc(detail) + '</p>';
    var pct = isUncapped ? Math.min(100, lv / 50 * 100) : (lv / maxLv * 100);
    h += '<div class="progress-bar" style="margin:6px 0"><div class="fill" style="width:' + pct + '%;background:' + (isUncapped ? 'var(--green)' : 'var(--purple)') + '"></div></div>';
    h += '<div class="skill-effects">';
    h += '<div>📊 Lv.' + lv + (isUncapped ? '' : '/' + maxLv) + ': <b>' + currentEffect + '</b></div>';
    h += '<div>🏆 满级效果: <b>' + maxEffectDisplay + '</b></div>';
    h += '</div>';
    h += '<small style="color:var(--text-faint)">每级: ' + ((s.effect_per_level || 0) < 1 ? '+' + (s.effect_per_level * 100).toFixed(1) + '%' : '+' + s.effect_per_level) + ' | 类型: ' + (isPercent ? '百分比' : '固定值') + '</small>';
    if (atMax) h += '<br><span style="color:var(--green)">✅ 已满级</span>';
    h += '</div>';
  }
  h += '</div>';
  return h;
}

// ==================== 烹饪 ====================
async function pgFood(){
  var r=await api('/api/food'),b=await api('/api/bag'),inv=b.inventory||{};
  function ok(rc){for(var i=0;i<(rc.ingredients||[]).length;i++){var ig=rc.ingredients[i];if((inv[ig.name]||0)<(ig.count||1)) return false}return true}
  var h='<div class="card"><h2>🍳 烹饪</h2><p>🥘 当前增益:'+(r.food_buffs||[]).length+'/'+r.max_buffs+'</p>';
  // 当前Buffs
  var buffs=r.food_buffs||[],statCN={attack:'🗡️攻击',defense:'🛡️防御',speed:'💨速度',attack_speed:'⚡攻速',dodge:'👻闪避',hp:'❤️生命'};
  if(buffs.length>0){h+='<div style="margin-bottom:12px">';for(var i=0;i<buffs.length;i++){var bf=buffs[i],rem=Math.max(0,Math.floor(((bf.ate_at||0)+bf.duration-(Date.now()/1000))/60));h+='<span class="badge badge-r3">'+esc(bf.name)+' +'+(bf.stat==='all'?'✨全属性':(statCN[bf.stat]||bf.stat))+' +'+bf.value+' ('+rem+'分)</span> '}h+='</div>'}
  // 食谱
  h+='<div class="item-grid">';
  S.fr=r.recipes||[];
  for(var i=0;i<S.fr.length;i++){
    var rc=S.fr[i],gd=ok(rc),igs=[];
    for(var j=0;j<(rc.ingredients||[]).length;j++){var ig=rc.ingredients[j],hv=inv[ig.name]||0;igs.push('<span style="color:'+(hv>=ig.count?'var(--green)':'var(--red)')+'">'+esc(ig.name)+' '+hv+'/'+ig.count+'</span>')}
    var profLabel=rc.from_profession?' <span style="font-size:11px;background:var(--orange-light);color:#fff;border-radius:3px;padding:1px 5px">🌟副职业</span>':'';
    var eff=rc.effect||{};
    var effText='';
    if(eff.stat) { var effStat=eff.stat==='all'?'✨全属性':(statCN[eff.stat]||eff.stat||'?'); effText='<br><small>效果:'+effStat+' +'+eff.value+' ('+Math.floor(eff.duration/60)+'分)</small>'; }
    else if(rc.desc) effText='<br><small>'+esc(rc.desc)+'</small>';
    h+='<div class="item-card rarity-'+(rc.rarity||1)+'" style="'+(gd?'':'opacity:.5')+'" onclick="'+(gd?'cookR('+i+')':'toast(\'缺材料\',\'error\')')+'">🍽️ <b>'+esc(rc.name)+'</b>'+profLabel+' '+(gd?'✅可制作':'❌缺材料')+'<br><small>食材:'+igs.join(',')+'</small>'+effText+'</div>';
  }
  h+='</div>';
  // 已有食物
  var invFoods=r.inv_foods||{},foodNames=Object.keys(invFoods);
  if(foodNames.length>0){
    h+='<h3 style="margin-top:16px">🍽️ 已烹饪的食物</h3><div class="item-grid">';
    for(var i=0;i<foodNames.length;i++){var fn2=foodNames[i];h+='<div class="item-card rarity-3"><b>🍽️ '+esc(fn2)+'</b> x'+invFoods[fn2]+'<br><button class="btn btn-green btn-sm" onclick="eatFood(\''+escAttr(fn2)+'\')">🍴食用</button></div>'}
    h+='</div>';
  }
  h+='</div>';_('content').innerHTML=h;
}
function cookR(i){var r=(S.fr||[])[i];if(r) doCook(r.name)}
async function doCook(n){var r=await api('/api/food/cook',{recipeName:n});if(r.error)return toast(r.error,'error');toast('烹饪 '+n+' x'+r.count,'success');await refresh();pgFood()}
async function eatFood(n){var r=await api('/api/food/eat',{foodName:n});if(r.error)return toast(r.error,'error');if(!r.buff)return toast('食用 '+n+' 成功！','success');var scn2={attack:'🗡️攻击',defense:'🛡️防御',speed:'💨速度',attack_speed:'⚡攻速',dodge:'👻闪避',hp:'❤️生命'};var s2=r.buff.stat==='all'?'✨全属性':(scn2[r.buff.stat]||r.buff.stat);toast('食用 '+n+'! +'+s2+' +'+r.buff.value+' ('+Math.floor(r.buff.duration/60)+'分)','success');await refresh();pgFood()}
// ==================== 背包 ====================
async function pgBag(){
  var r=await api('/api/bag'),inv=r.inventory||{},cats=r.categories||{},bl=r.sell_blacklist||{},sp=r.sell_prices||{};
  var catCN={ore:'⛏️矿石',material:'📦材料',product:'🌾产物',fish:'🐟鱼类',junk:'🗑️垃圾',consume:'🧪消耗品',food:'🍽️食物',seed:'🌱种子',animal:'🐄动物',special:'✨特殊',gem:'💎宝石',shop:'🛒商城',blueprint:'📜蓝图',other:'📦其他'};
  S.bcats=cats;S.btab=S.btab||'all';S.sellBl=bl;S.sellPrices=sp;
  // 构建当前标签的物品列表
  var list=[];
  if(S.btab==='all'){for(var n in inv) list.push([n,inv[n]]);list.sort(function(a,b){return a[0].localeCompare(b[0])})}
  else{var c=cats[S.btab]||{};for(var n in c) list.push([n,c[n]]);list.sort(function(a,b){return a[0].localeCompare(b[0])})}
  S.blist=list;
  // 计算可一键出售的总数（排除黑名单类别）
  var sellable=0;
  for(var i=0;i<list.length;i++){var it=list[i],cat=getItemCat(it[0]);if(!bl.includes(cat)) sellable+=it[1]}
  var h='<div class="card"><h2>🎒 背包 ('+fn(r.total)+'件)</h2>';
  h+='<div class="tabs"><button class="tab'+(S.btab==='all'?' active':'')+'" onclick="S.btab=\'all\';pgBag()">全部</button>';
  for(var cat in catCN){var cc=cats[cat];if(cc) h+='<button class="tab'+(S.btab===cat?' active':'')+'" onclick="S.btab=\''+cat+'\';pgBag()">'+(catCN[cat]||cat)+'<span class="tab-cnt">'+fn(Object.keys(cc).length)+'</span></button>'}
  h+='</div>';
  // 一键出售按钮
  if(sellable>0){
    if(S.btab==='all'){
      h+='<div style="margin-bottom:14px"><button class="btn btn-orange" onclick="sellAllConfirm()">💰 一键出售全部 ('+fn(sellable)+'件可售)</button><small style="color:var(--text-faint);margin-left:10px">黑名单保护类别不会被出售</small></div>';
    }else{
      h+='<div style="margin-bottom:14px"><button class="btn btn-orange" onclick="sellAllConfirm(\''+S.btab+'\')">💰 一键售出该分类 ('+fn(sellable)+'件)</button></div>';
    }
  };
  h+='<div class="item-grid">';
  for(var i=0;i<list.length;i++){var it=list[i],n=it[0],q=it[1];var isFish=n.indexOf('鱼')>=0||getItemCat(n)==='fish';var price=sp[n]||0;h+='<div class="item-card" onclick="itemDetail('+i+')"><b>'+esc(n)+'</b> x'+q+(isFish?' 🐟':'')+'<br><span style="font-size:11px;color:var(--yellow)">💰'+fn(price)+'/个</span></div>'}
  if(list.length===0) h+='<p style="color:var(--text-faint);text-align:center;padding:40px">背包是空的~</p>';
  h+='</div></div>';_('content').innerHTML=h;
}
function getItemCat(n){var cats=S.bcats||{};for(var c in cats){if(cats[c][n]) return c}return''}
async function sellAllConfirm(cat){
  cat=cat||'';
  // 先请求预览
  var preview=await api('/api/sell-all',cat?{category:cat,preview:true}:{preview:true});
  if(preview.error) return toast(preview.error,'error');
  if(!preview.items||preview.items.length===0) return toast('没有可出售的物品','error');
  var catCN2={ore:'矿石',material:'材料',product:'产物',fish:'鱼类',junk:'垃圾',consume:'消耗品',food:'食物',seed:'种子',animal:'动物',special:'特殊',gem:'宝石',shop:'商城',other:'其他'};
  // 构建预览列表
  var itemList='',totalCoins=preview.total_coins||0;
  for(var i=0;i<Math.min(preview.items.length,20);i++){
    var it=preview.items[i];
    itemList+='<tr><td>'+esc(it.name)+'</td><td>x'+it.count+'</td><td>💰'+fn(it.coins)+'</td><td style="font-size:12px;color:var(--text-faint)">'+(catCN2[it.category]||it.category||'')+'</td></tr>';
  }
  if(preview.items.length>20) itemList+='<tr><td colspan="4" style="color:var(--text-faint)">...还有 '+(preview.items.length-20)+' 种物品</td></tr>';
  var skipInfo=preview.skipped_count>0?'<p style="font-size:13px;color:var(--text-faint)">🔒 已跳过 '+preview.skipped_count+' 种受保护物品</p>':'';
  var title=cat?'一键出售【'+(catCN2[cat]||cat)+'】':'一键出售全部（非保护）';
  var msg=title+'<br><table class="table" style="font-size:14px;margin:8px 0"><tr><th>物品</th><th>数量</th><th>金币</th><th>类别</th></tr>'+itemList+'</table><p>📦 共 <b>'+preview.sold+'</b> 件 | 💰 预计获得 <b>'+fn(totalCoins)+'</b> 金币</p>'+skipInfo+'<br><small style="color:var(--red)">确认后不可撤销</small>';
  gameConfirm(msg,async function(){
    var r=await api('/api/sell-all',cat?{category:cat}:{});
    if(r.error) return toast(r.error,'error');
    toast('一键出售完成！卖出 '+r.sold+' 件 💰+'+fn(r.total_coins),'success');
    await refresh();pgBag();
  });
}
async function itemDetail(idx){
  var list=S.blist||[];var e=list[idx];if(!e) return;var n=e[0],max=e[1];S.dn=n;S.dmax=max;
  var info=await api('/api/item-detail?name='+encodeURIComponent(n));
  var cn={ore:'矿石',material:'材料',fish:'鱼类',junk:'垃圾',consume:'消耗品',seed:'种子',animal:'动物',special:'特殊',gem:'宝石',bait:'鱼饵',rod:'鱼竿',weapon:'武器',unknown:'其他'};
  var h='<div class="modal-overlay" id="im"><div class="modal"><h2>📦 '+esc(n)+' <button class="btn btn-outline btn-sm" style="font-size:12px" data-copy="'+esc(n)+'" onclick="event.stopPropagation();copyText(this.dataset.copy)">📋复制</button></h2><table class="table"><tr><td>数量</td><td><b>'+max+'</b></td></tr><tr><td>类别</td><td>'+(cn[info.category]||info.category||'?')+'</td></tr><tr><td>稀有度</td><td>⭐'+(info.rarity||0)+'</td></tr>';
  if(info.is_weapon){
    h+='<tr><td>武器类型</td><td>'+(info.weapon_type||'?')+'</td></tr>';
    if(info.attack) h+='<tr><td>🗡️攻击</td><td>'+info.attack+'</td></tr>';
    if(info.defense) h+='<tr><td>🛡️防御</td><td>'+info.defense+'</td></tr>';
    if(info.speed) h+='<tr><td>💨速度</td><td>'+info.speed+'</td></tr>';
    if(info.attack_speed) h+='<tr><td>⚡攻速</td><td>'+info.attack_speed+'</td></tr>';
    if(info.dodge) h+='<tr><td>👻闪避</td><td>'+info.dodge+'</td></tr>';
    if(info.hp) h+='<tr><td>❤️生命</td><td>'+info.hp+'</td></tr>';
    if(info.crafter) h+='<tr><td>🔨锻造者</td><td>'+esc(info.crafter)+'</td></tr>';
  }else{
    if(info.source) h+='<tr><td>来源</td><td>'+esc(info.source)+'</td></tr>';
    if(info.use||info.desc) h+='<tr><td>用途</td><td>'+esc(info.use||info.desc||'')+'</td></tr>';
  }
  h+='</table>';
  h+='<div style="margin-top:14px;padding:12px;background:var(--bg-input);border-radius:8px;border:1px solid var(--border-light)">';
  // 冒险装备：显示装备按钮（不消耗物品）
  if(info.category==='adv_gear'){
    h+='<div class="act-row"><span class="act-label">冒险装备</span>';
    h+='<button class="btn btn-green btn-sm" onclick="document.getElementById(\'im\').remove();eqAdvGear(\''+escAttr(n)+'\')">⚔️ 装备</button>';
    h+=' <button class="btn btn-outline btn-sm" onclick="document.getElementById(\'im\').remove();eqAdvGear(\'\')">卸下</button>';
    h+='<br><small style="color:var(--text-faint)">装备后不消耗物品，可在冒险页面切换</small></div>';
  }
  if(info.usable||info.category==='consume'||info.category==='food'||info.category==='special'||(n.includes('经验宝珠'))||n==='技能点书'||n==='锻造精魂'||n==='玩家改名卡'||n==='武器改名卡'||n==='改名卡'||n==='转职卡'||n==='经验药水'||n==='大经验药水'||n==='技能点药水'||n==='果树催熟剂'||info.category==='blueprint'||n.includes('图纸')){
    h+='<div class="act-row"><span class="act-label">使用</span><input id="iuq" type="number" value="1" min="1" max="'+max+'"><span>个</span><button class="btn btn-green btn-sm" onclick="useDN()">确认使用</button></div>';
  }
  h+='<div class="act-row"><span class="act-label">出售</span><input id="isq" type="number" value="'+max+'" min="1" max="'+max+'"><span>个</span><button class="btn btn-orange btn-sm" onclick="sellDN()">确认出售</button></div>';
  h+='<div class="act-row"><span class="act-label">丢弃</span><input id="idq" type="number" value="1" min="1" max="'+max+'"><span>个</span><button class="btn btn-outline btn-sm" onclick="dropDN()">确认丢弃</button></div>';
  h+='</div>';
  h+='<button class="btn btn-outline btn-sm" style="margin-top:10px" onclick="document.getElementById(\'im\').remove()">关闭</button></div></div>';
  _('content').insertAdjacentHTML('beforeend',h);
}
function useDN(){var q=parseInt(_('iuq').value,10)||1;document.getElementById('im')?.remove();if(S.dn.includes('图纸')){useBlueprint(S.dn);return}useIt(S.dn,q)}
function sellDN(){var q=parseInt(_('isq').value,10)||1;document.getElementById('im')?.remove();sellIt(S.dn,q)}
function dropDN(){var q=parseInt(_('idq').value,10)||1;gameConfirm('确定丢弃 <b>'+esc(S.dn)+'</b> x'+q+'？<br><small style="color:var(--red)">此操作不可撤销</small>',function(){document.getElementById('im')?.remove();dropIt(S.dn,q)})}
async function useIt(n,q){q=q||1;
  if(n==='玩家改名卡'||n==='改名卡'){
    var id3='rnself'+Date.now();
    var h2='<div class="modal-overlay" id="'+id3+'"><div class="modal" style="min-width:auto;max-width:360px"><h3>📛 修改玩家名字</h3>';
    h2+='<p style="font-size:14px;color:var(--text-faint)">当前名字: <b>'+esc(S.user.username||'')+'</b></p>';
    h2+='<input id="'+id3+'-n" placeholder="新名字（1-12字）" style="width:100%;margin-bottom:10px"><br>';
    h2+='<div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-outline btn-sm" onclick="document.getElementById(\''+id3+'\').remove()">取消</button><button class="btn btn-blue btn-sm" id="'+id3+'-ok">确认改名</button></div></div></div>';
    _('content').insertAdjacentHTML('beforeend',h2);
    document.getElementById(id3+'-ok').addEventListener('click',async function(){
      var nn=_(id3+'-n').value.trim();
      if(!nn||nn.length>12) return toast('名字1-12个字符','error');
      _(id3).remove();
      var r=await api('/api/rename-self',{newName:nn,cardName:n});
      if(r.error) return toast(r.error,'error');
      toast(r.old_name+' → '+r.new_name,'success');await refresh();pgBag();
    });
    return;
  }
  if(n==='武器改名卡'){
    api('/api/forge').then(function(fr){
      var weps=fr.weapons||[];
      if(weps.length===0) return toast('你没有武器可改名','error');
      var id4='rnwep'+Date.now();
      var h3='<div class="modal-overlay" id="'+id4+'"><div class="modal"><h3>🏷️ 武器改名</h3>';
      h3+='<p style="font-size:14px;color:var(--text-faint)">选择要改名的武器：</p>';
      for(var i=0;i<weps.length;i++){
        var w=weps[i];
        h3+='<div style="padding:10px;border-bottom:1px solid var(--border-light);cursor:pointer" onclick="renameWeaponPick(\''+w.id+'\',\''+escAttr(w.name)+'\',\''+id4+'\')">⚔️ '+esc(w.name)+' <span class="badge badge-r'+Math.min(w.rarity||1,4)+'">'+(w.rarity_name||'普通')+'</span></div>';
      }
      h3+='<button class="btn btn-outline btn-sm" style="margin-top:8px" onclick="document.getElementById(\''+id4+'\').remove()">取消</button></div></div>';
      _('content').insertAdjacentHTML('beforeend',h3);
    });
    return;
  }
  var r=await api('/api/use',{itemName:n,count:q});
  if(r.error){toast(r.error,'error');return}
  if(r.type==='loli_awaken_select'){
    var lolis=r.lolis||[];
    var idAw='awaken'+Date.now();
    var hAw='<div class="modal-overlay" id="'+idAw+'"><div class="modal"><h3>✨ 选择要觉醒的同伴</h3>';
    for(var j=0;j<lolis.length;j++){
      var ll=lolis[j];
      hAw+='<div style="padding:10px;border-bottom:1px solid var(--border-light);cursor:pointer" onclick="awakenLoli('+ll.index+',\''+escAttr(n)+'\',\''+idAw+'\','+q+')">'+esc(ll.name)+' <span class="badge badge-r'+(ll.rarity>=999?999:Math.min(ll.rarity,4))+'">⭐'+ll.rarity+'</span> Lv.'+ll.level+'</div>';
    }
    hAw+='<button class="btn btn-outline btn-sm" style="margin-top:8px" onclick="document.getElementById(\''+idAw+'\').remove()">取消</button></div></div>';
    _('content').insertAdjacentHTML('beforeend',hAw);
    return;
  }
  if(r.type==='loli_feed_select'){
    var lolis=r.lolis||[];
    var idFd='feedSel'+Date.now();
    var hFd='<div class="modal-overlay" id="'+idFd+'"><div class="modal"><h3>🍬 选择要喂养的同伴</h3>';
    for(var j=0;j<lolis.length;j++){
      var ll=lolis[j];
      hFd+='<div style="padding:10px;border-bottom:1px solid var(--border-light);cursor:pointer" onclick="feedLoliFromBag('+ll.index+',\''+escAttr(n)+'\',\''+idFd+'\','+q+')">'+esc(ll.name)+' <span class="badge badge-r'+(ll.rarity>=999?999:Math.min(ll.rarity,4))+'">⭐'+ll.rarity+'</span> Lv.'+ll.level+'</div>';
    }
    hFd+='<button class="btn btn-outline btn-sm" style="margin-top:8px" onclick="document.getElementById(\''+idFd+'\').remove()">取消</button></div></div>';
    _('content').insertAdjacentHTML('beforeend',hFd);
    return;
  }
  toast('使用 '+n+' x'+q,'success');await refresh();pgBag()}
async function renameWeaponPick(wid,wn,modalId){
  document.getElementById(modalId).remove();
  var id5='rnwep2'+Date.now();
  var h4='<div class="modal-overlay" id="'+id5+'"><div class="modal" style="min-width:auto;max-width:360px"><h3>🏷️ 武器改名</h3>';
  h4+='<p style="font-size:14px;color:var(--text-faint)">当前名字: <b>'+esc(wn)+'</b></p>';
  h4+='<input id="'+id5+'-n" placeholder="新名字（1-12字）" style="width:100%;margin-bottom:10px"><br>';
  h4+='<div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-outline btn-sm" onclick="document.getElementById(\''+id5+'\').remove()">取消</button><button class="btn btn-blue btn-sm" id="'+id5+'-ok">确认改名</button></div></div></div>';
  _('content').insertAdjacentHTML('beforeend',h4);
  document.getElementById(id5+'-ok').addEventListener('click',async function(){
    var nn=_(id5+'-n').value.trim();
    if(!nn||nn.length>12) return toast('名字1-12个字符','error');
    _(id5).remove();
    var rr=await api('/api/rename-weapon',{weaponId:wid,newName:nn,cardName:'武器改名卡'});
    if(rr.error) return toast(rr.error,'error');
    toast(rr.old_name+' → '+rr.new_name,'success');await refresh();pgBag();
  });
}
async function dropIt(n,q){q=q||1;var r=await api('/api/bag/drop',{itemName:n,amount:q});if(r.error)return toast(r.error,'error');toast('丢弃 '+n+' x'+r.dropped,'success');await refresh();pgBag()}
async function sellIt(n,a){var r=await api('/api/sell',{itemName:n,amount:a,skip_blacklist:true});if(r.error)return toast(r.error,'error');toast('出售 '+n+' x'+r.sold+' 💰+'+r.total_coins,'success');await refresh();pgBag()}
// ==================== 同伴 ====================
async function handleLoli(idx,action,name){
  var body={action:action};
  if(name) body.loliName=name; else body.loliIndex=idx;
  var r=await api('/api/loli/handle',body);
  if(r.error) return toast(r.error,'error');
  if(action==='adopt') toast('收养了 '+r.name+'！','success');
  else toast('帮助了 '+r.name+' 💰+'+fn(r.coins)+' ⭐+'+fn(r.exp),'success');
  // 轻量更新：只刷新顶栏，不重绘页面（保护冒险结果）
  await refresh();
  // 如果在同伴页面则刷新
  if(S.page==='companions') pgLoli();
}
async function pgLoli(){
  var r=await api('/api/loli'),p=await api('/api/pending-lolis'),h='';
  S.loliData=r; S.loliConfig=r.config||{};
  var pending=p.lolis||[],existing=r.lolis||[];
  // 待处理萝莉
  if(pending.length>0){
    h+='<div class="card"><h2>👧 待处理的萝莉 ('+pending.length+')</h2>';
    for(var i=0;i<pending.length;i++){
      var l=pending[i];
      h+='<div class="card" style="border-left:4px solid var(--purple);margin:8px 0">';
      h+='<p><b>'+esc(l.name)+'</b> ⭐'+l.rarity+'</p>';
      if(l.text) h+='<p style="color:var(--text-faint);font-size:14px">'+esc(l.text)+'</p>';
      // 剩余时间
      var loliDl=Math.floor((l.added_at||0)/1000)+300;
      h+='<p style="font-size:12px;color:var(--text-faint)">⏰ <span data-deadline="'+loliDl+'" data-prefix=""></span>后离开</p>';
      h+='<p style="font-size:13px;color:var(--text-faint)">🏠领养：可收养为同伴</p>';
      h+='<p style="font-size:13px;color:var(--text-faint)">❤️帮助：';
      if(l.help_coins) h+='💰'+l.help_coins[0]+'~'+l.help_coins[1]+' ';
      if(l.help_exp) h+='⭐+'+l.help_exp+' ';
      if(l.help_drops&&l.help_drops.length) h+='📦可能掉落物品';
      else h+='获得金币和经验';
      h+='</p>';
      h+='<p><button class="btn btn-green btn-sm" onclick="handleLoli('+i+',\'adopt\',\''+escAttr(l.name)+'\')">🏠领养</button> ';
      h+='<button class="btn btn-blue btn-sm" onclick="handleLoli('+i+',\'help\',\''+escAttr(l.name)+'\')">❤️帮助</button></p>';
      h+='</div>';
    }
    h+='</div>';
  }
  // 已收养同伴
  h+='<div class="card"><h2>👧 我的同伴 ('+existing.length+'/8)</h2>';
  if(existing.length===0) h+='<p style="color:var(--text-faint)">还没有同伴，去冒险探索吧！</p>';
  else {
    h+='<div class="item-grid">';
    for(var i=0;i<existing.length;i++){
      var l=existing[i],married=i===r.married?'💍':'',disp=l.dispatch&&l.dispatch.dispatched_at;
	      var today2=new Date().toISOString().slice(0,10);
	      var maxDisp=S.loliConfig&&S.loliConfig.max_dispatch_per_day||2;
	      var dispToday=l.daily_dispatch_date===today2?(l.daily_dispatch_count||0):0;
	      var dispLabel=disp?'🌍探索中':(dispToday>=maxDisp?'🏠今日已满':'🏠待命');
      var rl=l.rarity>=999?'👑':l.rarity>=4?'💎':l.rarity>=3?'🌟':l.rarity>=2?'⭐':'🍀';
      var rn=l.rarity>=999?'神话':l.rarity>=4?'史诗':l.rarity>=3?'精良':l.rarity>=2?'优秀':'普通';
      var bonus='',lv=l.level||1;
      var coinRates=S.loliConfig.base_coins_per_hour||{1:80,2:180,3:350,4:600,999:1200};
      var baseRate=coinRates[String(l.rarity)]||80;
      var coinMult=1.0+(lv-1)*0.05+(married?0.50:0);
      var coinsHr=Math.floor(baseRate*coinMult);
      bonus='💰'+coinsHr+'/h';
      if(married) bonus+=' 💍';
      h+='<div class="item-card" onclick="showLoliDetail('+i+')"><b>'+rl+' '+esc(l.name)+' '+married+'</b> <span style="font-size:12px;color:var(--text-faint)">'+rn+'</span><br><small>好感:'+fn(l.exp||0)+' Lv.'+lv+' '+dispLabel+'</small><br><small style="color:var(--green)">'+bonus+'</small></div>';
    }
    h+='</div>';
  }
  h+='</div>';_('content').innerHTML=h;startCountdown();
}
function showLoliDetail(idx){
  var r=S.loliData;if(!r||!r.lolis) return toast('数据加载中，请刷新','error');
  var l=r.lolis[idx];if(!l) return;
  var married=idx===r.married,disp=l.dispatch&&l.dispatch.dispatched_at;
  var elH=disp?Math.floor((Date.now()/1000-(l.dispatch.dispatched_at||0))/3600*10)/10:0;
  var rn2=l.rarity>=999?'神话':l.rarity>=4?'史诗':l.rarity>=3?'精良':l.rarity>=2?'优秀':'普通';
  var h='<div class="modal-overlay" id="im-loli"><div class="modal" style="max-width:440px">';
  h+='<h2>'+(l.rarity>=999?'👑':l.rarity>=4?'💎':l.rarity>=3?'🌟':l.rarity>=2?'⭐':'🍀')+' '+esc(l.name)+(married?' 💍':'')+'</h2>';
  h+='<table class="table"><tr><td>稀有度</td><td>'+(l.rarity>=999?'👑':l.rarity>=4?'💎':l.rarity>=3?'🌟':l.rarity>=2?'⭐':'🍀')+' '+rn2+'</td></tr><tr><td>等级</td><td>Lv.'+(l.level||1)+'</td></tr><tr><td>好感度</td><td>'+fn(l.favor||0)+'</td></tr>';
  if(l.base_bonus){
    var coinRates2=S.loliConfig.base_coins_per_hour||{1:80,2:180,3:350,4:600,999:1200};
    var baseCoinHr=coinRates2[String(l.rarity)]||80;
    var lvlCfg2=S.loliConfig.level_bonus_per_level||{};
    var lvlCoinBonus=Math.floor((l.level-1)*(lvlCfg2.coin||0.05)*100);
    var marriedCoin=married?Math.floor(baseCoinHr*0.5):0;
    var rarityMat={1:0,2:1,3:2,4:3,999:4}[l.rarity]||0;
    var lvlMat=Math.floor((l.level-1)*(lvlCfg2.drop||0.03));
    var marriedMat=married?2:0;
    var minMat=1+rarityMat+lvlMat+marriedMat;
    var maxMat=3+rarityMat+lvlMat+marriedMat;
    h+='<tr><td>派遣收益</td><td>💰'+baseCoinHr+'/h';
    if(marriedCoin) h+=' +💍'+marriedCoin+'/h';
    h+=' 📦'+minMat+'~'+maxMat+'个/h</td></tr>';
  }
  if(married){h+='<tr><td>💍结婚加成</td><td style="color:var(--pink)">金币+50% | 材料+30% | 等级上限+30</td></tr>';}
  h+='<tr><td>升级进度</td><td>'+fn(l.exp||0)+' / '+fn(Math.floor(100*Math.pow(l.level||1,1.5)))+' → Lv.'+((l.level||1)+1)+'</td></tr>';
  if(disp) h+='<tr><td>探索</td><td>🌍已派遣 '+elH+' 小时</td></tr>';
  var maxDisp2=S.loliConfig&&S.loliConfig.max_dispatch_per_day||2;
  var todayD3=new Date().toISOString().slice(0,10);
  var dispCnt2=l.daily_dispatch_date===todayD3?(l.daily_dispatch_count||0):0;
  h+='<tr><td>今日派遣</td><td>'+(disp?'探索中':dispCnt2+'/'+maxDisp2+'次')+'</td></tr>';
  h+='</table>';
  h+='<div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:8px">';
  if(!disp) {
    h+='<button class="btn btn-orange btn-sm" onclick="feedLoli('+idx+')">🍬喂养</button> ';
    var todayD4=new Date().toISOString().slice(0,10);
    var dc2=l.daily_dispatch_date===todayD4?(l.daily_dispatch_count||0):0;
    if(dc2<maxDisp2) h+='<button class="btn btn-blue btn-sm" onclick="dispatchLoli('+idx+')">🌍派遣探索 ('+dc2+'/'+maxDisp2+')</button>';
    else h+='<span style="color:var(--text-faint);font-size:12px">⏰今日已派遣'+maxDisp2+'次</span>';
  }
  var coinRate=S.loliConfig.base_coins_per_hour?.[String(l.rarity)]||30;
  if(married) coinRate=Math.floor(coinRate*1.5);
  var avgMat=Math.floor((minMat+maxMat)/2);
  if(disp) h+='<button class="btn btn-green btn-sm" onclick="recallLoli('+idx+')">📥召回 (预计💰'+fn(Math.floor(coinRate*elH))+' 📦~'+fn(avgMat*Math.floor(elH))+'个)</button>';
  if(!married) h+='<button class="btn btn-purple btn-sm" onclick="marryLoli('+idx+')">💍结婚</button>';
  else h+='<button class="btn btn-outline btn-sm" onclick="divorceLoli()">💔离婚</button>';
  h+='<button class="btn btn-outline btn-sm" onclick="renameLoli('+idx+')">✏️改名</button>';
  h+='<button class="btn btn-outline btn-sm" onclick="document.getElementById(\'im-loli\').remove()">关闭</button></div></div></div>';
  _('content').insertAdjacentHTML('beforeend',h);
}
// LOLI_COINS removed - unused
function feedLoli(idx){
  var l=S.loliData.lolis[idx];if(!l) return;
  var id='fl'+Date.now(),inv=S.user.inventory||{};
  var feedCfg=S.loliConfig.feed_items||{};
  var feedNames=Object.keys(feedCfg);
  S._feedIdx=idx;S._feedSel={};S._feedId=id;
  var maxLv=l.max_level||10,curLv=l.level||1;
  var nextExp=Math.floor(100*Math.pow(curLv,1.5));
  var h='<div class="modal-overlay" id="'+id+'"><div class="modal" style="min-width:auto;max-width:500px">';
  h+='<h2>🍬 喂养 '+esc(l.name)+'</h2>';
  h+='<p style="font-size:15px;color:var(--text-muted);margin-bottom:4px">❤️ 好感: <b>'+fn(l.exp||0)+'</b> / '+fn(nextExp)+' → Lv.'+(curLv+1)+' | 等级: <b>Lv.'+curLv+'</b> / '+maxLv+'</p>';
  h+='<div class="progress-bar" style="margin:4px 0 12px"><div class="fill" style="width:'+Math.min(100,Math.floor((l.exp||0)/nextExp*100))+'%;background:linear-gradient(90deg,var(--orange-light),var(--yellow))"></div></div>';
  if(feedNames.length===0){h+='<p style="color:var(--text-faint)">暂无可喂养道具</p>'}
  else {
    h+='<p style="font-size:13px;color:var(--text-faint);margin-bottom:6px">输入数量或点击 +/- 调整</p>';
    for(var i=0;i<feedNames.length;i++){
      var fn2=feedNames[i],fc=feedCfg[fn2],qty=inv[fn2]||0,sel=S._feedSel[fn2]||0;
      var canAdd=sel<qty,rowBg=sel>0?'var(--bg-yellow-pale)':'var(--bg-card)',rowBd=sel>0?'var(--orange)':'var(--border-light)';
      h+='<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;margin:6px 0;border-radius:10px;background:'+rowBg+';border:2px solid '+rowBd+'">';
      h+='<span style="flex:1;font-size:16px"><b>'+esc(fn2)+'</b><br><small style="color:var(--text-muted)">+'+fc.exp+'好感/个 · 库存: '+qty+'</small></span>';
      h+='<button class="btn btn-outline btn-sm" onclick="adjFeed(\''+fn2+'\',-10)" style="padding:6px 10px;font-size:14px;font-weight:bold;min-width:36px"'+(sel>=10?'':'disabled')+'>−10</button>';
      h+='<button class="btn btn-outline btn-sm" onclick="adjFeed(\''+fn2+'\',-1)" style="padding:6px 12px;font-size:18px;font-weight:bold;min-width:36px"'+(sel>0?'':'disabled')+'>−</button>';
      h+='<input id="fdq_'+fn2+'" type="number" value="'+sel+'" min="0" max="'+qty+'" style="width:90px;min-width:90px;text-align:center;font-size:18px;font-weight:bold;padding:8px 4px" onchange="adjFeedSet(\''+fn2+'\',this.value)" onclick="event.stopPropagation()">';
      h+='<button class="btn btn-green btn-sm" onclick="adjFeed(\''+fn2+'\',1)" style="padding:6px 12px;font-size:18px;font-weight:bold;min-width:36px"'+(canAdd?'':'disabled')+'>+</button>';
      h+='<button class="btn btn-green btn-sm" onclick="adjFeed(\''+fn2+'\',10)" style="padding:6px 10px;font-size:14px;font-weight:bold;min-width:36px"'+(sel+10<=qty?'':'disabled')+'>+10</button>';
      h+='</div>';
    }
    var totalExp=0,totalCnt=0;for(var k in S._feedSel){var sc=S._feedSel[k]||0;if(sc>0){totalCnt+=sc;totalExp+=sc*((feedCfg[k]||{}).exp||0)}}
    h+='<p id="feed-summary" style="margin-top:10px;font-size:18px;font-weight:bold;color:var(--sidebar-bg2);text-align:center">预计好感 <span style="color:var(--orange)">+'+totalExp+'</span>（'+totalCnt+'个道具）</p>';
  }
  h+='<div style="margin-top:14px;display:flex;gap:10px;justify-content:flex-end"><button class="btn btn-outline" onclick="document.getElementById(\''+id+'\').remove()">取消</button><button class="btn btn-orange" onclick="doFeedLoli()" style="font-size:18px;padding:10px 24px">🍬 确认喂养</button></div></div></div>';
  _('content').insertAdjacentHTML('beforeend',h);
}
function adjFeedSet(n,v){
  if(!S._feedSel) S._feedSel={};
  var inv=S.user.inventory||{},qty=inv[n]||0;
  var val=parseInt(v, 10)||0;
  val=Math.max(0,Math.min(val,qty));
  if(val<=0) delete S._feedSel[n];
  else S._feedSel[n]=val;
  // update all feed inputs to reflect current state
  var feedNames=Object.keys(S.loliConfig.feed_items||{});
  for(var i=0;i<feedNames.length;i++){
    var fn2=feedNames[i],el=document.getElementById('fdq_'+fn2);
    if(el) el.value=S._feedSel[fn2]||0;
  }
  updateFeedSummary();
}
function adjFeed(n,d){
  if(!S._feedSel) S._feedSel={};
  var inv=S.user.inventory||{},qty=inv[n]||0,cur=S._feedSel[n]||0;
  var nv=Math.max(0,Math.min(cur+d,qty));
  if(nv<=0) delete S._feedSel[n];
  else S._feedSel[n]=nv;
  // update single input and summary
  var el=document.getElementById('fdq_'+n);
  if(el) el.value=S._feedSel[n]||0;
  updateFeedSummary();
}
function updateFeedSummary(){
  var feedCfg=S.loliConfig.feed_items||{},totalExp=0,totalCnt=0;
  for(var k in S._feedSel){var sc=S._feedSel[k]||0;if(sc>0){totalCnt+=sc;totalExp+=sc*((feedCfg[k]||{}).exp||0)}}
  var se=document.getElementById('feed-summary');
  if(se) se.innerHTML='预计好感 +'+totalExp+' ('+totalCnt+'个道具)';
}
async function doFeedLoli(){
  var sel=S._feedSel||{},id=S._feedId,idx=S._feedIdx;
  var items=Object.keys(sel).filter(function(k){return sel[k]>0});
  if(items.length===0) return toast('请选择要喂养的道具','error');
  _(id).remove();
  for(var i=0;i<items.length;i++){
    var r=await api('/api/loli/feed',{itemName:items[i],amount:sel[items[i]],loliIndex:idx});
    if(r.error){toast(r.error,'error');break}
    else toast('🍬 '+items[i]+' x'+sel[items[i]]+' → 好感+'+r.fed*(S.loliConfig.feed_items?.[items[i]]?.exp||50)+' Lv.'+r.loli.level,'success');
  }
  await refresh();pgLoli();
}
async function dispatchLoli(idx){var r=await api('/api/loli/dispatch',{index:idx});if(r.error)return toast(r.error,'error');toast('派遣 '+r.dispatched+' 探索中~','success');await refresh();pgLoli()}
async function recallLoli(idx){var r=await api("/api/loli/recall",{index:idx});if(r.error)return toast(r.error,"error");var me=await api("/api/me");if(me&&me.user){S.user=me.user;S.stats=me.stats||{};S.pending_lolis=me.pending_lolis;S.pending_merchant=me.pending_merchant;_("tc").textContent=fn(S.user.coins);_("tl").textContent="Lv."+(S.user.level||1);_("tp").textContent=fn(S.stats.power||0);_("ts").textContent=(S.user.skill_points||0)+" SP";var lb=_("loli-badge");if(lb)lb.style.display=S.pending_lolis?"inline":"none";var mb=_("merchant-badge");if(mb)mb.style.display=S.pending_merchant?"inline":"none";}var h='<div class="modal-overlay" id="im-recall"><div class="modal" style="max-width:460px">';h+='<h2>📥 '+esc(r.recalled||'同伴')+' 探索归来</h2>';h+='<table class="table">';h+='<tr><td>探索时长</td><td>🌍 '+fn(r.hours||0)+' 小时'+(r.exceeded_max?' <span style="color:var(--text-faint)">(已达上限)</span>':'')+'</td></tr>';h+='<tr><td>金币收益</td><td>💰 +'+fn(r.coins||0)+'</td></tr>';if(r.coin_bonus_pct>0) h+='<tr><td>金币加成</td><td>+'+r.coin_bonus_pct+'%'+(r.married_bonus?' 💍':',')+'</td></tr>';if(r.overflow_coins>0) h+='<tr><td>溢出好感→金币</td><td style="color:var(--orange-light)">💰 +'+fn(r.overflow_coins)+'</td></tr>';h+='<tr><td>好感度</td><td>❤️ +'+fn(r.exp_gain||0)+(r.levels_gained>0?' <span style="color:var(--orange-light);font-weight:bold">⬆Lv.'+(r.level-(r.levels_gained||0))+' → Lv.'+r.level+'</span>':'')+(r.reached_cap?' <span style="color:var(--text-faint)">(已满级)</span>':'')+'</td></tr>';h+='<tr><td>同伴等级</td><td>⭐ Lv.'+(r.level||1)+' / '+fn(r.max_level||10)+'</td></tr>';h+='</table>';if(r.items&&r.items.length>0){h+='<h3 style="margin-top:12px">📦 收集到的材料</h3><div style="max-height:200px;overflow-y:auto">';for(var i=0;i<r.items.length;i++){var it=r.items[i];h+='<div style="padding:4px 0;border-bottom:1px solid #eee;display:flex;justify-content:space-between"><span>'+esc(it.name)+'</span><b>x'+fn(it.count)+'</b></div>'}h+='</div>'}else{h+='<p style="color:var(--text-faint);margin-top:8px">未获得材料</p>'}h+='<button class="btn btn-green" style="margin-top:12px" onclick="document.getElementById(\'im-recall\').remove();pgLoli()">确定</button></div></div>';_('content').insertAdjacentHTML('beforeend',h)}
async function marryLoli(idx){gameConfirm('确定与这位同伴结婚？<br><small style="color:var(--text-faint)">需要 💍婚戒（商城购买）</small>',async function(){var r=await api('/api/loli/marry',{index:idx});if(r.error)return toast(r.error,'error');toast('💍 结婚成功!','success');await refresh();pgLoli()})}
async function divorceLoli(){gameConfirm('确定要离婚吗？💔<br><small style="color:var(--orange-light)">💍 婚戒将返还到背包</small>',async function(){var r=await api('/api/loli/divorce',{});if(r.error)return toast(r.error,'error');toast('已离婚 💍婚戒已返还','success');await refresh();pgLoli()})}
async function awakenLoli(idx,itemName,modalId,q){
  document.getElementById(modalId).remove();
  var r=await api('/api/use',{itemName:itemName,target_index:idx,count:q});
  if(r.error) return toast(r.error,'error');
  toast('✨ '+itemName+' x'+q+' 使用成功','success');await refresh();pgBag();
}
async function feedLoliFromBag(idx,itemName,modalId,q){
  document.getElementById(modalId).remove();
  var r=await api('/api/use',{itemName:itemName,target_index:idx,count:q});
  if(r.error) return toast(r.error,'error');
  toast('🍬 '+itemName+' x'+q+' 喂养成功','success');await refresh();pgBag();
}
function renameLoli(idx){
  var l=S.loliData.lolis[idx];if(!l) return;
  var id2='rn'+Date.now();
  var h='<div class="modal-overlay" id="'+id2+'"><div class="modal" style="min-width:auto;max-width:360px"><h3>✏️ 改名: '+esc(l.name)+'</h3>';
  h+='<input id="'+id2+'-n" placeholder="新名字（1-12字）" value="'+esc(l.name)+'" style="width:100%;margin-bottom:10px"><br>';
  h+='<div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-outline btn-sm" onclick="document.getElementById(\''+id2+'\').remove()">取消</button><button class="btn btn-blue btn-sm" id="'+id2+'-ok">确认改名</button></div></div></div>';
  _('content').insertAdjacentHTML('beforeend',h);
  document.getElementById(id2+'-ok').addEventListener('click',async function(){
    var nn=_(id2+'-n').value.trim();
    if(!nn||nn.length>12) return toast('名字1-12个字符','error');
    _(id2).remove();var r=await api('/api/loli/rename',{index:idx,newName:nn});
    if(r.error) return toast(r.error,'error');
    toast(r.old_name+' → '+r.new_name,'success');await refresh();pgLoli();
  });
}
// ==================== 套装图鉴 ====================
async function renderSetsHandbook(){
  var r = await api('/api/forge/blueprints');
  var sets = r.sets || [];
  var learned = r.learned || [];
  if(!sets.length) return '<p style=\"color:var(--text-faint);text-align:center;padding:24px\">加载套装数据失败</p>';
  var h = '';
  var si = {weapon:'🗡️',helmet:'⛑️',armor:'🛡️',boots:'👢',leggings:'🦵',accessory:'💍'};
  var statCN = {attack:'🗡️',defense:'🛡️',speed:'💨',attack_speed:'⚡',dodge:'👻',hp:'❤️'};

  // Group by region/ruins
  var ruinSets = [], regionSets = [];
  sets.forEach(function(s){
    if(s.is_region_set) regionSets.push(s);
    else ruinSets.push(s);
  });
  ruinSets.sort(function(a,b){return a.min_level - b.min_level});
  regionSets.sort(function(a,b){return a.min_level - b.min_level});

  S._setsFilter = S._setsFilter || 'all';
  h += '<div class=\"tabs\" style=\"margin-bottom:8px\">';
  h += '<button class=\"tab'+(S._setsFilter==='all'?' active':'')+'\" onclick=\"S._setsFilter=\'all\';pgHandbook()\">📦 全部('+sets.length+')</button>';
  h += '<button class=\"tab'+(S._setsFilter==='ruins'?' active':'')+'\" onclick=\"S._setsFilter=\'ruins\';pgHandbook()\">🏚️ 遗迹套装('+ruinSets.length+')</button>';
  h += '<button class=\"tab'+(S._setsFilter==='region'?' active':'')+'\" onclick=\"S._setsFilter=\'region\';pgHandbook()\">🌍 区域套装('+regionSets.length+')</button>';
  h += '</div>';

  var display = S._setsFilter==='ruins'?ruinSets:(S._setsFilter==='region'?regionSets:sets);
  // Load user's inventory for blueprint counts
  var bpInv = {}; try { var meR = await api('/api/me'); if(meR.user&&meR.user.inventory){ for(var ik in meR.user.inventory){ if(ik.indexOf('图纸')>=0) bpInv[ik] = meR.user.inventory[ik]; } } } catch(e){}
  h += '<div class=\"item-grid\">';
  display.forEach(function(s){
    var allLearned = s.pieces && Object.keys(s.pieces).every(function(sl){return learned.includes(s.pieces[sl].name+'图纸')});
    var anyOwned = s.pieces && Object.keys(s.pieces).some(function(sl){return bpInv[s.pieces[sl].name+'图纸']});
    h += '<div class=\"item-card\" style=\"'+(allLearned?'border-left:5px solid var(--green)':(anyOwned?'border-left:5px solid var(--orange)':'opacity:0.6'))+'\">';
    h += '<b>'+(s.is_region_set?'🌍':'🏚️')+' '+esc(s.name)+'</b>';
    h += ' <small>Lv.'+(s.min_level||1)+'+</small>';
    h += ' '+(allLearned?'✅':(anyOwned?'📦':'🔒'));
    // Pieces with owned/learned status
    if(s.pieces){
      var slots = Object.keys(s.pieces);
      h += '<div style=\"font-size:11px;color:var(--text-faint);margin:4px 0\">';
      slots.forEach(function(sl){
        var p = s.pieces[sl];
        var bpName = p.name + '图纸';
        var isLearned = learned.includes(bpName);
        var owned = bpInv[bpName] || 0;
        h += '<span style=\"white-space:nowrap;margin-right:6px\">'+(si[sl]||'')+esc(p.name);
        if(isLearned) h += ' ✅';
        else if(owned) h += ' 📦x'+owned;
        else h += ' ❌';
        h += '</span>';
      });
      h += '</div>';
    }
    // Bonuses
    if(s.bonuses && Object.keys(s.bonuses).length > 0){
      h += '<div style=\"font-size:11px;margin-top:2px\">';
      Object.keys(s.bonuses).sort(function(a,b){return parseInt(a)-parseInt(b)}).forEach(function(k){
        h += '<span class=\"badge\" style=\"font-size:10px\">'+k+'件:'+s.bonuses[k].desc+'</span> ';
      });
      h += '</div>';
    }
    h += '</div>';
  });
  h += '</div>';
  return h;
}

// ==================== BOSS ====================
var bossState={};
function renderBossCard(b,config,minDmg){
  var pct=Math.max(0,Math.round(b.hp/b.max_hp*100));
  var barColor=pct>50?'var(--green)':pct>25?'var(--orange)':'var(--red)';
  var h='<div class="card" style="border-left:3px solid var(--red);margin-bottom:16px">';
  h+='<p style="font-size:14px;color:var(--text-faint)">'+esc(b.desc||'')+'</p>';
  h+='<h3>'+esc(b.name)+' '+rarityLabel(b.rarity)+' <small style="color:var(--text-faint)">Lv.'+(b.level||1)+'</small></h3>';
  h+='<div class="progress-bar" style="height:20px;margin:8px 0"><div class="fill" style="width:'+pct+'%;background:'+barColor+'"></div></div>';
  h+='<p style="font-size:16px">❤️ '+fn(Math.max(0,b.hp))+' / '+fn(b.max_hp)+' <b>('+pct+'%)</b></p>';
  // 属性
  h+='<p style="font-size:13px;color:var(--text-faint)">⚔️攻击:'+(b.attack||'?')+' 🛡️防御:'+(b.defense||'?')+' 💨速度:'+(b.speed||'?')+' ⚡攻速:'+(b.atk_speed||'?')+' | 最低等级:'+(b.min_level||1)+'</p>';
  // 攻击按钮
  h+='<p><button class="btn btn-primary" onclick="atkBoss(\''+b.id+'\')">⚔️ 攻击</button>';
  var la=b.last_attacks||{},myLa=la[S.user.id]||0,cd=((config||{}).cooldown||45)*1000;
  var remain=Math.max(0,Math.ceil((cd-(Date.now()-myLa))/1000));
  if(remain>0) h+=' <span style="color:var(--red)">冷却 '+Math.ceil(remain)+'秒</span>';
  h+='</p>';
  // 奖励信息
  var rewards=b.rewards||{};
  h+='<div class="card" style="border-left:3px solid var(--yellow);margin-top:12px"><h3>🎁 击杀奖励</h3>';
  h+='<p>门槛伤害: <b style="color:var(--red)">'+fn(minDmg)+'</b> | ';
  if(rewards.coins) h+='💰'+fn(rewards.coins)+'金币 ';
  if(rewards.exp) h+='⭐'+fn(rewards.exp)+'经验 ';
  if(rewards.items&&rewards.items.length) for(var i=0;i<rewards.items.length;i++) h+='📦'+rewards.items[i].name+'×'+(rewards.items[i].count||1)+' ';
  h+='<br><small style="color:var(--text-faint)">达标玩家均分奖励</small></p></div>';
  // 参与者列表
  var parts=b.participants||[];
  parts.sort(function(a,b){return b.damage-a.damage});
  h+='<div class="card" style="border-left:3px solid var(--blue);margin-top:8px"><h3>⚔️ 参战玩家 ('+parts.length+'人)</h3>';
  if(parts.length===0) h+='<p style="color:var(--text-faint)">暂无玩家参与</p>';
  else {
    h+='<div style="max-height:300px;overflow-y:auto"><table class="table"><thead><tr><th>排名</th><th>玩家</th><th>伤害</th><th>占比</th><th>达标</th></tr></thead><tbody>';
    var totalDmg=b.max_hp-b.hp;
    for(var i=0;i<parts.length;i++){
      var p=parts[i],dmgPct=totalDmg>0?Math.round(p.damage/totalDmg*100):0;
      var qualified=p.damage>=minDmg;
      h+='<tr><td>'+(i+1)+'</td><td>'+esc(p.username)+(p.id===S.user.id?' <b>(你)</b>':'')+'</td><td>'+fn(p.damage)+'</td><td>'+dmgPct+'%</td><td>'+(qualified?'✅达标':'❌差'+fn(minDmg-p.damage))+'</td></tr>';
    }
    h+='</tbody></table></div>';
  }
  h+='</div></div>';
  return h;
}
async function pgBoss(){
  var r=await api('/api/boss');
  bossState=r;
  var h='<div class="card"><h2>🐉 世界BOSS</h2>';
  var activeBosses=(r.bosses||[]).filter(function(b){return b.is_alive});
  var minDmg=(r.config||{}).min_damage||500;
  if(activeBosses.length>0){
    h+='<p style="color:var(--text-faint);margin-bottom:12px">当前 '+activeBosses.length+' 只BOSS活跃中，最多同时 '+(r.max_active||3)+' 只</p>';
    for(var i=0;i<activeBosses.length;i++){
      h+=renderBossCard(activeBosses[i],r.config,minDmg);
    }
  } else {
    h+='<p style="color:var(--text-faint);text-align:center;padding:20px">暂无活跃BOSS，等待刷新…<br><small>每5分钟有概率刷新</small>';
    var defeatedAt=r.defeated_at||0,cdHours=r.respawn_cooldown_hours||20;
    if(defeatedAt>0){
      var respawnAt=defeatedAt+cdHours*3600*1000;
      if(Date.now()<respawnAt) h+='<br><span style="color:var(--orange)">⏰ 冷却剩余: <span data-deadline="'+Math.floor(respawnAt/1000)+'" data-prefix=""></span></span>';
    }
    h+='</p>';
  }
  // 历史击杀（含掉落详情）
  if(r.recent_kills&&r.recent_kills.length){
    h+='<div class="card" style="border-left:3px solid var(--text-faint)"><h3>📜 最近击杀记录 ('+r.recent_kills.length+'条)</h3>';
    for(var i=0;i<Math.min(r.recent_kills.length,5);i++){
      var rk=r.recent_kills[i];
      var rarityStar=rarityLabel(rk.rarity);
      h+='<div style="padding:8px 0;border-bottom:'+(i<Math.min(r.recent_kills.length,5)-1?'1px solid var(--border-light)':'')+'">';
      h+='<p style="font-size:14px"><b>🐉 '+esc(rk.name)+'</b> '+rarityStar+' — '+rk.players+'人参战 ('+(rk.eligible||rk.players)+'人达标) — <span style="color:var(--text-faint)">'+rk.date+'</span></p>';
      if(rk.coins_each) h+='<p style="font-size:13px">💰 每人: '+fn(rk.coins_each)+'金币 ⭐ '+fn(rk.exp_each||0)+'经验</p>';
      if(rk.drops&&rk.drops.length) h+='<p style="font-size:13px">📦 掉落: '+rk.drops.map(function(d){return esc(d)}).join(', ')+'</p>';
      h+='</div>';
    }
    h+='</div>';
  }
  h+='</div>';
  _('content').innerHTML=h;startCountdown();
}
async function atkBoss(bossId){var r=await api('/api/boss/attack',{boss_id:bossId});if(r.error)return toast(r.error,'error');showQuestToasts(r);var msg='⚔️ 造成 '+fn(r.damage)+' 伤害!';if(r.global_drops&&r.global_drops.length){var sc2={attack:'🗡️攻击',defense:'🛡️防御',speed:'💨速度',attack_speed:'⚡攻速',dodge:'👻闪避',hp:'❤️生命',crit_rate:'💥暴击率',crit_dmg:'💢暴伤',lifesteal:'🩸吸血',counter:'↩️反击',damage_reduce:'🛡️减伤',exp_bonus:'📖经验',gold_bonus:'💰金币'};for(var di=0;di<r.global_drops.length;di++){var d=r.global_drops[di];if(d.stat)msg+=', 💎'+esc(d.name)+' ('+(sc2[d.stat]||d.stat)+'+'+d.value+')'}}msg+=(r.boss_counter>0?' 💥BOSS反击 '+r.boss_counter+' 点':'')+(r.boss_defense>0?' 🛡️BOSS防御减免 '+Math.round((1-1/(1+r.boss_defense/175))*100)+'%':'');toast(msg,'info');await refresh();if(r.killed){toast('🎉 BOSS被击杀了!','success')}pgBoss()}
async function atkBossHome(bossId){var r=await api('/api/boss/attack',{boss_id:bossId});if(r.error)return toast(r.error,'error');showQuestToasts(r);var msg='⚔️ 造成 '+fn(r.damage)+' 伤害!';if(r.global_drops&&r.global_drops.length){var sc2={attack:'🗡️攻击',defense:'🛡️防御',speed:'💨速度',attack_speed:'⚡攻速',dodge:'👻闪避',hp:'❤️生命',crit_rate:'💥暴击率',crit_dmg:'💢暴伤',lifesteal:'🩸吸血',counter:'↩️反击',damage_reduce:'🛡️减伤',exp_bonus:'📖经验',gold_bonus:'💰金币'};for(var di=0;di<r.global_drops.length;di++){var d=r.global_drops[di];if(d.stat)msg+=', 💎'+esc(d.name)+' ('+(sc2[d.stat]||d.stat)+'+'+d.value+')'}}msg+=(r.boss_counter>0?' 💥BOSS反击 '+r.boss_counter+' 点':'');toast(msg,'info');if(r.killed){toast('🎉 BOSS被击杀了!','success')}await refresh();loadBossCard()}
// ==================== 活动 ====================
async function pgEvents(){
  var r=await api('/api/events'),h='<div class="card"><h2>🎪 活动</h2>';
  // 旧活动代币清理提示
  if(r.legacy_converted&&r.legacy_converted.length>0){
    for(var li=0;li<r.legacy_converted.length;li++){
      var lc=r.legacy_converted[li];
      toast(" 旧活动代币「"+lc.currency+"」x"+lc.amount+" 已自动兑换为 💰"+fn(lc.coins),"info");
    }
  }
  if(r.event){
    h+='<p><b>'+esc(r.event.name)+'</b> ('+r.event.start+' ~ '+r.event.end+')</p>';
    h+='<p>'+r.currency_name+': <b>'+fn(r.balance)+'</b></p>';
    if(r.shop&&r.shop.length>0&&r.is_shop_open){
      h+='<h3>活动商店</h3><div class="item-grid">';
      for(var i=0;i<r.shop.length;i++){
        var it=r.shop[i],bought=(r.purchases||{})[it.name]||0,limited=it.limit>0&&bought>=it.limit;
        h+='<div class="item-card rarity-3"><b>'+ (it.emoji||'📦')+' '+esc(it.name)+'</b> 🎫'+it.price+'<br><small>'+esc(it.desc||'')+'</small>';
        if(it.limit>0) h+='<br><small style="color:var(--text-faint)">限购 '+it.limit+' 次 (已购 '+bought+' 次)</small>';
        if(limited) h+='<br><span style="color:var(--red)">已售罄</span>';
        else h+='<br><button class="btn btn-orange btn-sm" onclick="buyEvt('+i+')">购买</button>';
        h+='</div>';
      }
      h+='</div>';
    }
  }else h+='<p style="color:var(--text-faint)">暂无活动</p>';
  h+='</div>';_('content').innerHTML=h;
}
async function buyEvt(i){var r=await api('/api/events/buy',{shopIndex:i});if(r.error)return toast(r.error,'error');if(r.result&&r.result!==r.purchased)toast('🎁 '+r.purchased+' → 获得 '+r.result+'！','success');else toast('购买 '+r.purchased,'success');await refresh();pgEvents()}
// ==================== 称号 ====================
async function pgTitles(){var r=await api('/api/titles'),h='<div class="card"><h2>🏅 称号</h2><p>当前装备:<b>'+esc(r.equipped)+'</b></p><div class="item-grid">';var all=r.all_titles||{},ut=r.user_titles||[],shown={};for(var n in all){var c=all[n],owned=ut.indexOf(n)>=0,isEq=n===r.equipped;var st=c.stats||{};var sb=[];if(st.crit_rate)sb.push('暴击+'+Math.round(st.crit_rate*100)+'%');if(st.crit_dmg)sb.push('暴伤+'+Math.round(st.crit_dmg*100)+'%');if(st.lifesteal)sb.push('吸血+'+Math.round(st.lifesteal*100)+'%');if(st.dmg_reduce)sb.push('减伤+'+Math.round(st.dmg_reduce*100)+'%');if(st.counter)sb.push('反击+'+Math.round(st.counter*100)+'%');if(st.extra_atk)sb.push('连击+'+Math.round(st.extra_atk*100)+'%');shown[n]=true;h+='<div class="item-card" style="opacity:'+(owned?1:.4)+'">'+ (c.icon||'🏅')+' <b>'+esc(n)+'</b><br><small>'+esc(c.desc||'')+'</small>'+(sb.length?'<br><small style="color:var(--orange-light)">'+sb.join(' ')+'</small>':'')+(owned?(isEq?'<br><span style="color:var(--gold)">✅已装备</span>':'<br><button class="btn btn-outline btn-sm" onclick="eqTitle(\''+n+'\')">装备</button>'):'<br>🔒未解锁')+'</div>'}for(var i=0;i<ut.length;i++){var n=ut[i];if(shown[n])continue;var isEq=n===r.equipped;h+='<div class="item-card">🎖️ <b>'+esc(n)+'</b><br><small>活动限定称号</small>'+(isEq?'<br><span style="color:var(--gold)">✅已装备</span>':'<br><button class="btn btn-outline btn-sm" onclick="eqTitle(\''+n+'\')">装备</button>')+'</div>'}h+='</div></div>';_('content').innerHTML=h}
async function eqTitle(n){var r=await api('/api/title/equip',{title:n});if(r.error)return toast(r.error,'error');toast('装备称号:'+n,'success');await refresh();pgTitles()}
// ==================== 合成 ====================
async function pgSynth(){
  var r=await api('/api/synthesis'),b=await api('/api/bag'),inv=b.inventory||{};
  var allRecipes=(r.recipes||[]).concat(r.prof_recipes||[]);
  S.sr=allRecipes;
  // 构建分类标签
  S.synCat=S.synCat||'all';
  var cats=[{id:'all',name:'📋 全部'}];
  var globalCount=r.recipes?.length||0;
  if(globalCount>0) cats.push({id:'global',name:'🌍 全局 ('+globalCount+')'});
  var profGroups={};
  for(var i=0;i<(r.prof_recipes||[]).length;i++){
    var pf=r.prof_recipes[i].from_profession||'other';
    if(!profGroups[pf]) profGroups[pf]=0;
    profGroups[pf]++;
  }
  var profNames={farmer:'🌾农夫',blacksmith:'🔨铁匠',chef:'🍳厨师',fisherman:'🎣渔夫',miner:'⛏️矿工',alchemist:'🧪炼金'};
  for(var pid in profGroups){
    if(profGroups[pid]>0) cats.push({id:'prof_'+pid,name:(profNames[pid]||'💼'+pid)+' ('+profGroups[pid]+')'});
  }
  function can(rc){for(var i=0;i<(rc.ingredients||[]).length;i++){var ig=rc.ingredients[i];if((inv[ig.name]||0)<(ig.count||1))return false}return true}
  function matchCat(rc,catId){
    if(catId==='all') return true;
    if(catId==='global') return !rc.from_profession;
    if(catId.startsWith('prof_')){var pid=catId.slice(5);return rc.from_profession===pid}
    return true;
  }
  var h='<div class="card"><h2>⚗️ 合成</h2>';
  h+='<div class="tabs">';
  for(var ci=0;ci<cats.length;ci++) h+='<button class="tab'+(S.synCat===cats[ci].id?' active':'')+'" onclick="S.synCat=\''+cats[ci].id+'\';pgSynth()">'+cats[ci].name+'</button>';
  h+='</div><div class="item-grid">';
  var shown=0;
  for(var i=0;i<S.sr.length;i++){
    var rc=S.sr[i];
    if(!matchCat(rc,S.synCat)) continue;
    var gd=can(rc),igs=[];
    for(var j=0;j<(rc.ingredients||[]).length;j++){var ig=rc.ingredients[j],hv=inv[ig.name]||0;igs.push('<span style="color:'+(hv>=ig.count?'var(--green)':'var(--red)')+'">'+esc(ig.name)+' '+hv+'/'+ig.count+'</span>')}
    var profLabel=rc.from_profession?(rc.from_profession==='chef'||rc.from_profession==='alchemist'?' <span style="font-size:11px;background:var(--orange-light);color:#fff;border-radius:3px;padding:1px 5px">🌟副职业</span>':' <span style="font-size:11px;background:var(--purple);color:#fff;border-radius:3px;padding:1px 5px">💼职业</span>'):'';
    h+='<div class="item-card rarity-'+(rc.rarity||1)+'" style="'+(gd?'':'opacity:.5')+'" onclick="'+(gd?'synthR('+i+')':'toast(\'材料不足\',\'error\')')+'">'+ (rc.emoji||'⚗️')+' <b>'+esc(rc.name)+'</b>'+profLabel+' '+(gd?'✅可合成':'❌缺材料')+'<br><small>需要:'+igs.join(', ')+'</small><br><small>'+esc(rc.desc||'')+'</small></div>';
    shown++;
  }
  if(shown===0) h+='<p style="color:var(--text-faint);padding:20px;text-align:center">该分类下没有配方</p>';
  h+='</div></div>';_('content').innerHTML=h;
}
function synthR(i){var r=(S.sr||[])[i];if(r) synthDo(r.name)}
async function synthDo(n){var r=await api('/api/synthesis',{recipeName:n});if(r.error)return toast(r.error,'error');showQuestToasts(r);toast('合成 '+r.synthesized+(r.count>1?' x'+r.count:'')+'！','success');await refresh();pgSynth()}
function starDisplay(r){
  if(r>=9999) return '👑神话';
  if(r>=999) return '🌟传说';
  return '⭐'.repeat(r||1);
}
function rankAvatar(u){var init=(u.username||'?')[0];if(u.has_avatar_img)return '<span class="rank-av" data-avuid="'+u.id+'" style="display:inline-block;width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px;font-size:12px;color:#fff;vertical-align:middle;margin-right:4px;overflow:hidden;background:#607d8b">'+init+'</span>';if(u.avatar)return '<span style="margin-right:4px">'+u.avatar+'</span>';return '<span style="display:inline-block;width:24px;height:24px;border-radius:50%;background:#607d8b;text-align:center;line-height:24px;font-size:12px;color:#fff;vertical-align:middle;margin-right:4px">'+init+'</span>';}
var _rankAvatarsRunning=0;
async function loadRankAvatars(){var rid=++_rankAvatarsRunning;var els=document.querySelectorAll('.rank-av');var tasks=[];for(var i=0;i<els.length;i++){var el=els[i],uid=el.getAttribute('data-avuid');if(!uid)continue;(function(el,uid){var cached=getSet('av_'+uid,'');if(cached&&rid===_rankAvatarsRunning&&document.contains(el)){el.style.backgroundImage='url('+cached+')';el.style.backgroundSize='cover';el.style.backgroundPosition='center';el.textContent='';return}tasks.push((async function(el,uid){try{var r=await api('/api/avatar/'+uid);if(rid!==_rankAvatarsRunning)return;if(r&&r.image&&document.contains(el)){putSet('av_'+uid,r.image);el.style.backgroundImage='url('+r.image+')';el.style.backgroundSize='cover';el.style.backgroundPosition='center';el.textContent=''}}catch(e){}})(el,uid))})(el,uid)}await Promise.all(tasks)}
async function pgRank(){var r=await api('/api/leaderboard'),h='<div class="card"><h2>🏆 排行榜 ('+(r.total_players||0)+'人)</h2><div class="grid-2"><div><h3>⭐ 等级排行</h3><table class="table"><tr><th>#</th><th>玩家</th><th>职业</th><th>等级</th><th>状态</th></tr>';for(var i=0;i<(r.by_level||[]).length;i++){var u=r.by_level[i];h+='<tr><td>'+(i+1)+'</td><td>'+rankAvatar(u)+esc(u.username)+(u.title?' <span style="font-size:12px;color:var(--text-faint)">'+esc(u.title)+'</span>':'')+'</td><td style="font-size:13px">'+(u.profession?u.profession+(u.profession_level?' Lv.'+u.profession_level:''):'—')+'</td><td>Lv.'+u.level+'</td><td>'+(u.online?'🟢 在线':'⚫ 离线')+'</td></tr>'}h+='</table></div><div><h3>💰 财富排行</h3><table class="table"><tr><th>#</th><th>玩家</th><th>职业</th><th>金币</th><th>状态</th></tr>';for(var i=0;i<(r.by_coins||[]).length;i++){var v=r.by_coins[i];h+='<tr><td>'+(i+1)+'</td><td>'+rankAvatar(v)+esc(v.username)+'</td><td style="font-size:13px">'+(v.profession||'—')+'</td><td>💰'+fn(v.coins)+'</td><td>'+(v.online?'🟢 在线':'⚫ 离线')+'</td></tr>'}h+='</table></div></div></div>';_('content').innerHTML=h;setTimeout(loadRankAvatars,300)}
// -- 本地设置 --
function getSet(k,d){try{var v=localStorage.getItem('hehe_'+k);return v!==null?JSON.parse(v):d}catch(e){return d}}
function putSet(k,v){localStorage.setItem('hehe_'+k,JSON.stringify(v))}
// ==================== 设置 ====================
var allCats=['ore','material','product','fish','junk','shop','gem','special','consume','food','seed','animal'];
var catLabel={ore:'⛏️矿石',material:'📦材料',product:'🌾产物',fish:'🐟鱼类',junk:'🗑️垃圾',shop:'🛒商城',gem:'💎宝石',special:'✨特殊',consume:'🧪消耗品',food:'🍽️食物',seed:'🌱种子',animal:'🐄动物'};
async function pgSettings(){
  var b=await api('/api/bag');var bl=Array.isArray(b.sell_blacklist)?b.sell_blacklist:[];S.tmpBl=bl.slice();
  var u=S.user||{},al=u.auto_loli||'none';
  var h='<div class="card"><h2>⚙️ 设置</h2>';
  // 出售黑白名单
  h+='<div class="card"><h3>🛒 背包出售保护</h3><p style="font-size:14px;color:var(--text-faint)">勾选的类别在出售时受保护（单独出售无视此限制）</p>';
  h+='<div style="display:flex;flex-wrap:wrap;gap:8px;margin:8px 0">';
  for(var i=0;i<allCats.length;i++){
    var c=allCats[i],on=bl.indexOf(c)>=0;
    h+='<label style="display:inline-flex;align-items:center;gap:4px;padding:6px 12px;border-radius:6px;cursor:pointer;background:'+(on?'var(--orange-bg)':'var(--bg-hover)')+';border:2px solid '+(on?'var(--orange)':'var(--border-muted)')+';font-size:15px"><input type="checkbox" '+(on?'checked':'')+' onchange="toggleSellCat(\''+c+'\',this.checked)">'+(catLabel[c]||c)+'</label>';
  }
  h+='</div><p><button class="btn btn-green btn-sm" onclick="saveSellBl()">💾 保存类别保护</button></p></div>';
  // 物品级黑名单
  var ibl=await api('/api/settings/item-blacklist',{action:'list'});
  var itemBl=ibl.item_blacklist||[];
  h+='<div class="card"><h3>🔒 物品级保护（不会被一键出售）</h3>';
  h+='<p style="font-size:14px;color:var(--text-faint)">在此列表中的物品不会被一键出售，类别保护中的物品无需重复添加</p>';
  if(itemBl.length>0){
    h+='<div style="display:flex;flex-wrap:wrap;gap:6px;margin:8px 0;max-height:150px;overflow-y:auto">';
    for(var i=0;i<itemBl.length;i++){
      h+='<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:var(--orange-bg);border:1px solid var(--orange);border-radius:4px;font-size:14px">'+esc(itemBl[i])+' <button onclick="removeItemBl(\''+escAttr(itemBl[i])+'\')" style="color:var(--red);cursor:pointer;border:none;background:none;font-size:16px">&times;</button></span>';
    }
    h+='</div>';
    h+='<button class="btn btn-outline btn-sm" style="color:var(--red);border-color:var(--red)" onclick="clearItemBl()">🗑️ 清空物品黑名单</button>';
  } else h+='<p style="color:var(--text-faint);font-size:14px">暂无物品级保护</p>';
  h+='<div style="display:flex;gap:8px;margin-top:8px"><input id="item-bl-add" placeholder="输入物品名" style="flex:1;font-size:15px"><button class="btn btn-orange btn-sm" onclick="addItemBl()">➕ 添加物品</button></div>';
  h+='</div>';
  // 🔀 选择事件开关
  var ceEnabled=u.choice_events_enabled||false;
  var autoChoice=u.auto_choice_enabled||false;
  h+='<div class="card"><h3>🔀 冒险选择事件</h3>';
  h+='<p style="font-size:14px;color:var(--text-faint)">冒险中遇到分支选择时可自动随机抉择，无需手动点击</p>';
  h+='<label style="display:flex;align-items:center;gap:8px;padding:8px 12px;margin:6px 0;border-radius:6px;cursor:pointer;background:'+(ceEnabled?'var(--bg-purple-pale)':'var(--bg-hover)')+';border:2px solid '+(ceEnabled?'var(--purple)':'var(--border-muted)')+'"><input type="checkbox" '+(ceEnabled?'checked':'')+' onchange="toggleChoiceEvents(this.checked, S._autoChoice)"> 🔀 开启选择事件</label>';
  h+='<label style="display:flex;align-items:center;gap:8px;padding:8px 12px;margin:6px 0;border-radius:6px;cursor:pointer;background:'+(autoChoice?'var(--bg-green-pale)':'var(--bg-hover)')+';border:2px solid '+(autoChoice?'var(--green)':'var(--border-muted)')+'"><input type="checkbox" '+(autoChoice?'checked':'')+' onchange="toggleChoiceEvents(S._autoCE, this.checked)"> 🎲 自动随机选择（不中断冒险）</label>';
  h+='</div>';
  // 自动处理萝莉
  h+='<div class="card"><h3>👧 冒险遇到萝莉时</h3>';
  var opts=[['none','🔘 手动选择（默认）'],['help','❤️ 自动帮助'],['adopt','🏠 自动领养']];
  for(var i=0;i<opts.length;i++){
    h+='<label style="display:block;padding:8px 12px;margin:4px 0;border-radius:6px;cursor:pointer;background:'+(al===opts[i][0]?'var(--bg-purple-pale)':'var(--bg-hover)')+';border:2px solid '+(al===opts[i][0]?'var(--purple)':'var(--border-muted)')+'"><input type="radio" name="autoLoli" value="'+opts[i][0]+'" '+(al===opts[i][0]?'checked':'')+' onchange="saveAutoLoli(\''+opts[i][0]+'\')"> '+opts[i][1]+'</label>';
  }
  h+='<p style="font-size:13px;color:var(--text-faint);margin-top:8px">💡 注意：同伴已满8个时自动领养会失败；5分钟内未手动处理萝莉会自动消失</p></div>';
  // 自动使用血药
  var ah=u.auto_use_hp||'none';
  h+='<div class="card"><h3>🧪 血量不足时自动使用血药</h3>';
  h+='<p style="font-size:14px;color:var(--text-faint)">体力为0或不足时自动消耗背包中的血药恢复，支持批量操作中途自动续药</p>';
  var hpOpts=[['none','❌ 关闭（默认）'],['basic','🧪 简易的生命药水（15%）'],['small','💚 生命药剂（30%）'],['medium','💜 强力治疗药水（40%+）'],['big','❤️‍🔥 大生命药剂（60%）'],['any','📦 自动选择（大→治疗→小→简易）']];
  for(var i=0;i<hpOpts.length;i++){
    h+='<label style="display:block;padding:8px 12px;margin:4px 0;border-radius:6px;cursor:pointer;background:'+(ah===hpOpts[i][0]?'var(--bg-green-pale)':'var(--bg-hover)')+';border:2px solid '+(ah===hpOpts[i][0]?'#2e7d32':'var(--border-muted)')+'"><input type="radio" name="autoHp" value="'+hpOpts[i][0]+'" '+(ah===hpOpts[i][0]?'checked':'')+' onchange="saveAutoUseHp(\''+hpOpts[i][0]+'\')"> '+hpOpts[i][1]+'</label>';
  }
  h+='</div>';
  // ⚡ 批量冒险速览
  var batchCollapse = u.batch_collapse || false;
  h+='<div class="card"><h3>⚡ 批量冒险优化</h3>';
  h+='<label style="display:flex;align-items:center;gap:8px;padding:8px 12px;margin:6px 0;border-radius:6px;cursor:pointer;background:'+(batchCollapse?'var(--bg-green-pale)':'var(--bg-hover)')+';border:2px solid '+(batchCollapse?'var(--green)':'var(--border-muted)')+'"><input type="checkbox" '+(batchCollapse?'checked':'')+' onchange="saveOpt(\'batch_collapse\',this.checked)"> 📋 批量冒险仅显示汇总（不逐条展开）</label>';
  h+='</div>';
  // 🗑️ 自动分解低品装备
  var adRarity = u.auto_decompose_rarity || 0;
  h+='<div class="card"><h3>🗑️ 自动分解低品装备</h3>';
  h+='<p style="font-size:14px;color:var(--text-faint)">冒险掉落的装备稀有度低于设定值时自动分解为矿石</p>';
  h+='<select onchange="saveOpt(\'auto_decompose\',parseInt(this.value))" style="width:100%;padding:8px;font-size:15px;border-radius:6px;background:var(--bg-input);border:2px solid var(--border)">';
  var adOpts = [[0,'❌ 关闭'],[1,'⬜ 区及以下'],[2,'🟩 强及以下'],[3,'🟦 强强及以下'],[4,'🟪 ？强强？及以下']];
  for(var i=0;i<adOpts.length;i++) h+='<option value="'+adOpts[i][0]+'"'+(adRarity===adOpts[i][0]?' selected':'')+'>'+adOpts[i][1]+'</option>';
  h+='</select></div>';
  // 📦 自动出售多余材料
  var asMax = u.auto_sell_max || 0;
  h+='<div class="card"><h3>📦 自动出售多余材料</h3>';
  h+='<p style="font-size:14px;color:var(--text-faint)">冒险后自动卖出超过设定数量的材料（需有售价的物品）</p>';
  h+='<select onchange="saveOpt(\'auto_sell_max\',parseInt(this.value))" style="width:100%;padding:8px;font-size:15px;border-radius:6px;background:var(--bg-input);border:2px solid var(--border)">';
  var asOpts = [[0,'❌ 关闭'],[50,'保留50个'],[100,'保留100个'],[200,'保留200个'],[500,'保留500个']];
  for(var i=0;i<asOpts.length;i++) h+='<option value="'+asOpts[i][0]+'"'+(asMax===asOpts[i][0]?' selected':'')+'>'+asOpts[i][1]+'</option>';
  h+='</select></div>';
  h+='</div>';
  h+='</div>';_('content').innerHTML=h;
}
async function saveOpt(key, val){
  var body = {}; body[key] = val;
  var r = await api('/api/settings/optimize', body);
  if(r.error) return toast(r.error,'error');
  await refresh(); pgSettings();
}
function toggleSellCat(c,checked){
  if(!S.tmpBl) S.tmpBl=[];
  if(checked){ if(S.tmpBl.indexOf(c)<0) S.tmpBl.push(c); }
  else { S.tmpBl=S.tmpBl.filter(function(x){return x!==c}); }
}
async function saveSellBl(){
  var bl=S.tmpBl;if(!bl)return toast('请先勾选','error');
  var r=await api('/api/settings/sell-blacklist',{categories:bl});
  if(r.error)return toast(r.error,'error');
  toast('出售保护已保存 ('+bl.length+'个类别)','success');await refresh();
}
async function toggleChoiceEvents(enabled, autoChoice){
  var body = {};
  if(autoChoice !== undefined){
    // 切换自动选择
    body.enabled = S.user.choice_events_enabled !== false;
    body.auto_choice = autoChoice;
  } else {
    // 切换开关
    body.enabled = enabled;
    body.auto_choice = S.user.auto_choice_enabled || false;
  }
  var r = await api('/api/settings/choice-events', body);
  if(r.error) return toast(r.error,'error');
  await refresh(); pgSettings();
}
async function saveAutoLoli(v){
  var r=await api('/api/settings/auto-loli',{auto_loli:v});
  if(r.error)return toast(r.error,'error');
  var m={'none':'手动选择','help':'自动帮助','adopt':'自动领养'};
  toast('萝莉处理方式：'+m[v],'success');await refresh();
}
async function addItemBl(){
  var n=_('item-bl-add').value.trim();
  if(!n) return toast('请输入物品名','error');
  var r=await api('/api/settings/item-blacklist',{action:'add',itemName:n});
  if(r.error) return toast(r.error,'error');
  toast('已添加: '+n+' 到物品保护','success');
  _('item-bl-add').value='';pgSettings();
}
async function removeItemBl(n){
  var r=await api('/api/settings/item-blacklist',{action:'remove',itemName:n});
  if(r.error) return toast(r.error,'error');
  toast('已移除: '+n,'success');pgSettings();
}
async function clearItemBl(){
  gameConfirm('确定清空所有物品级保护？<br><small style="color:var(--red)">类别保护不受影响</small>',async function(){
    var r=await api('/api/settings/item-blacklist',{action:'clear'});
    if(r.error) return toast(r.error,'error');
    toast('物品黑名单已清空','success');pgSettings();
  });
}
async function saveAutoUseHp(v){
  var r=await api('/api/settings/auto-use-hp',{auto_use_hp:v});
  if(r.error)return toast(r.error,'error');
  var m={'none':'关闭','basic':'简易的生命药水（15%）','small':'生命药剂（30%）','medium':'强力治疗药水（40%+）','big':'大生命药剂（60%）','any':'自动选择（大→治疗→小→简易）'};
  toast('自动血药：'+m[v],'success');await refresh();
}
// ==================== 反馈页面 ====================
async function pgFeedback(){
  var h='';
  // 提交反馈卡片
  h+='<div class="card"><h2>📝 提交反馈</h2>';
  h+='<p style="color:var(--text-secondary);margin-bottom:12px">遇到问题或有建议？请告诉我们，我们会认真处理每一条反馈！</p>';
  h+='<textarea id="fb-text" placeholder="说点什么..." style="width:100%;height:100px;resize:vertical;font-size:16px;padding:10px;border-radius:8px;border:2px solid var(--border);background:var(--bg-input);font-family:inherit;margin:8px 0"></textarea>';
  h+='<div style="margin:12px 0;display:flex;align-items:center;gap:12px">';
  h+='<label class="btn btn-outline btn-sm" style="cursor:pointer">📷 上传截图<input type="file" id="fb-file" accept="image/*" onchange="previewFbImg()" style="display:none"></label>';
  h+='<span style="color:var(--text-secondary);font-size:13px">可选（最大500KB）</span>';
  h+='</div>';
  h+='<div id="fb-preview" style="margin:8px 0"></div>';
  h+='<button class="btn btn-blue" onclick="submitFeedback()">📤 提交反馈</button>';
  h+='</div>';
  // 反馈列表卡片
  h+='<div class="card"><h2>📋 反馈记录</h2><div id="fb-list">加载中...</div></div>';
  _('content').innerHTML=h;
  loadFeedbackList();
}
async function loadFeedbackList(){
  var r=await api('/api/feedback');
  var el=_('fb-list'); if(!el) return;
  if(r.error){ el.innerHTML='<p style="color:var(--red)">加载失败: '+r.error+'</p>'; return; }
  if(!r||!r.length){ el.innerHTML='<p style="color:var(--text-secondary)">暂无反馈记录</p>'; return; }
  var h='';
  for(var i=0;i<r.length;i++){
    var fb=r[i];
    var txt=(fb.text||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    h+='<div style="border-bottom:1px solid var(--border);padding:12px 0">';
    h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">';
    h+='<strong style="color:var(--gold)">'+esc(fb.username)+'</strong>';
    h+='<span style="color:var(--text-secondary);font-size:12px">'+new Date(fb.created_at).toLocaleString()+'</span>';
    h+='</div>';
    if(fb.text) h+='<p style="margin:6px 0;white-space:pre-wrap;word-break:break-word">'+txt+'</p>';
    if(fb.image) h+='<img src="'+fb.image+'" style="max-width:200px;max-height:150px;border-radius:8px;border:1px solid var(--border);margin-top:6px" loading="lazy">';
    h+='</div>';
  }
  el.innerHTML=h;
}
// ==================== 反馈栏 ====================
var fbImageData = null;
function previewFbImg(){
  var file = document.getElementById('fb-file').files[0];
  if(!file) return;
  if(file.size > 500 * 1024){ toast('图片不能超过500KB','error'); return; }
  var reader = new FileReader();
  reader.onload = function(e){
    fbImageData = e.target.result;
    _('fb-preview').innerHTML = '<div style="position:relative;display:inline-block"><img src="'+fbImageData+'" style="max-width:200px;max-height:150px;border-radius:8px;border:2px solid var(--border)"><button onclick="fbImageData=null;_(\'fb-preview\').innerHTML=\'\'" style="position:absolute;top:-8px;right:-8px;background:var(--red);color:#fff;border:none;border-radius:50%;width:22px;height:22px;cursor:pointer;font-size:14px;line-height:1">✕</button></div>';
  };
  reader.readAsDataURL(file);
}
async function submitFeedback(){
  var text = (_('fb-text')||{}).value || '';
  if(!text.trim() && !fbImageData) return toast('至少填写文字或上传图片','error');
  if(text.length > 1000) return toast('文字不能超过1000字','error');
  var r = await api('/api/feedback', { text: text, image: fbImageData || '' });
  if(r.error) return toast(r.error, 'error');
  toast('反馈提交成功！', 'success');
  _('fb-text').value = ''; fbImageData = null; _('fb-preview').innerHTML = '';
  loadFeedbackList();
}
// ==================== 世界聊天 ====================
function toggleChat(){
  _('chat-widget').classList.toggle('chat-minimized');
}
// @提及选择器
var _mentionList=[],_mentionIdx=-1;
function onChatInput(e){
  var inp=_('chat-input'),text=inp.value,cursor=inp.selectionStart;
  if(e.key==='@'){
    // 不拦截，让@正常输入，然后显示列表
    setTimeout(function(){
      S._mentionList=(S._onlinePlayers||[]).filter(function(p){return p!==(S.user||{}).username});
      S._mentionIdx=-1;showMentionDropdown();
    },50);
  }
  if(e.key==='Tab'&&S._mentionList.length>0){
    e.preventDefault();
    S._mentionIdx=Math.min(S._mentionList.length-1,S._mentionIdx>=0?S._mentionIdx:0);
    insertMention(S._mentionList[S._mentionIdx]);
    return;
  }
  if(e.key==='ArrowDown'&&S._mentionList.length>0){e.preventDefault();S._mentionIdx=Math.min(S._mentionList.length-1,S._mentionIdx+1);updateMentionHighlight();return;}
  if(e.key==='ArrowUp'&&S._mentionList.length>0){e.preventDefault();S._mentionIdx=Math.max(0,S._mentionIdx-1);updateMentionHighlight();return;}
  if(e.key==='Enter'){
    if(S._mentionList.length>0&&S._mentionIdx>=0){e.preventDefault();insertMention(S._mentionList[S._mentionIdx]);return;}
    closeMentionDropdown();
    sendChat();return;
  }
  if(e.key==='Escape'){closeMentionDropdown();return;}
  // 实时搜索@提及
  var atMatch=text.slice(0,cursor).match(/@([^\s@]*)$/);
  if(atMatch){
    var query=atMatch[1].toLowerCase();
    S._mentionList=(S._onlinePlayers||[]).filter(function(p){return p.toLowerCase().indexOf(query)>=0&&p!==(S.user||{}).username});
    S._mentionIdx=-1;showMentionDropdown();
  } else {closeMentionDropdown();}
}
function showMentionDropdown(){
  var dd=_('mention-dropdown');if(!dd){dd=document.createElement('div');dd.id='mention-dropdown';dd.style='position:absolute;background:var(--bg-card);border:2px solid var(--border);border-radius:6px;max-height:160px;overflow-y:auto;z-index:9999;font-size:14px;display:none;box-shadow:var(--shadow-md)';document.body.appendChild(dd);}
  if((S._mentionList||[]).length===0){dd.style.display='none';return;}
  dd.innerHTML='';S._mentionIdx=-1;
  (S._mentionList||[]).forEach(function(p,i){
    var row=document.createElement('div');
    row.style='padding:6px 12px;cursor:pointer;color:var(--text)';
    row.textContent='@'+p;
    row.onclick=function(){insertMention(p);};
    dd.appendChild(row);
  });
  var inp=_('chat-input');
  var rect=inp.getBoundingClientRect();
  dd.style.left=rect.left+'px';dd.style.top=(rect.top-dd.offsetHeight-4)+'px';dd.style.width=Math.max(200,rect.width)+'px';dd.style.display='block';
}
function updateMentionHighlight(){
  var dd=_('mention-dropdown');if(!dd) return;
  Array.from(dd.children).forEach(function(r,i){r.style.background=i===S._mentionIdx?'var(--bg-hover)':''});
}
function insertMention(name){
  var inp=_('chat-input'),text=inp.value,atIdx=text.lastIndexOf('@');
  if(atIdx>=0) inp.value=text.slice(0,atIdx)+'@'+name+' ';
  else inp.value=text+'@'+name+' ';
  closeMentionDropdown();inp.focus();
}
function closeMentionDropdown(){S._mentionList=[];S._mentionIdx=-1;var dd=_('mention-dropdown');if(dd)dd.style.display='none';}

// 聊天中点击名字：添加好友
function showFriendAction(username){
  var id='friend-popup';
  var old=document.getElementById(id);if(old)old.remove();
  var h='<div class=\"modal-overlay\" id=\"'+id+'\" onclick=\"if(event.target===this)this.remove()\">';
  h+='<div class=\"modal\" style=\"min-width:auto;max-width:340px;text-align:center\">';
  h+='<h3>👤 '+esc(username)+'</h3>';
  h+='<div style=\"display:flex;flex-direction:column;gap:8px;margin-top:12px\">';
  h+='<button class=\"btn btn-green\" onclick=\"addFriendByName(\''+escAttr(username)+'\');document.getElementById(\''+id+'\').remove()\">👥 添加好友</button>';
  h+='<button class=\"btn btn-outline btn-sm\" onclick=\"document.getElementById(\''+id+'\').remove()\">关闭</button>';
  h+='</div></div></div>';
  document.body.insertAdjacentHTML('beforeend',h);
}
async function addFriendByName(username){
  var r=await api('/api/friends/add',{username:username});
  if(r.error) return toast(r.error,'error');
  if(r.auto) toast('🤝 你们互相添加了好友！','success');
  else toast('📨 好友请求已发送给 '+r.username,'success');
}

function sendChat(){
  var inp=_('chat-input'),text=inp.value.trim();
  if(!text||!S.user) return;
  socket.emit('chat:message',{text:text,username:S.user.username});
  inp.value='';
}
function addChatMsg(m){
  var el=_('chat-msgs');if(!el) return;
  // 去重
  var key=m.user+'|'+m.text+'|'+m.time;
  if(!S._chatSeen) S._chatSeen={};
  if(S._chatSeen[key]) return;
  S._chatSeen[key]=true;
  var keys=Object.keys(S._chatSeen);
  if(keys.length>200){for(var i=0;i<100;i++) delete S._chatSeen[keys[i]]}
  // 消息列表
  var div=document.createElement('div');
  div.className='cm';
  var isMe=m.user===(S.user||{}).username;
  var nameHtml=isMe?'<span class="cu">'+esc(m.user)+'</span>':'<span class="cu chat-name" onclick="showFriendAction(\''+escAttr(m.user||'')+'\')" title="点击添加好友">'+esc(m.user||'?')+'</span>';
  // 高亮@提及
  var textHtml=esc(m.text||'').replace(/@(\S+)/g,'<b style=\"color:var(--yellow)\">@$1</b>');
  div.innerHTML='<span class="ct">'+esc(m.time||'')+'</span>'+nameHtml+': '+textHtml;
  el.appendChild(div);
  el.scrollTop=el.scrollHeight;
  while(el.children.length>50) el.firstChild.remove();
  // 标题栏显示最新消息
  var latest=_('chat-latest');
  if(latest) latest.textContent=esc(m.user||'?')+': '+esc(m.text||'').substring(0,30);
}
(async function(){
  if(S.token){
    var r=await api('/api/me');if(!r.error&&r.user){S.user=r.user;S.stats=r.stats||{};initApp();return}
    localStorage.removeItem('hk');S.token=null;
  }
  _('login-screen').style.display='flex';
})();

// 图鉴怪物模拟战斗
function simMonster(name, baseHp, baseAtk, baseDef, baseSpd, baseAspd) {
  var el = document.getElementById('sim-'+name);
  if (!el) return;
  if (el.dataset.loading) return;
  el.dataset.loading = '1';
  
  var lv = el.querySelector('input') ? parseInt(el.querySelector('input').value,10) : (S.user.level||50);
    // 阶梯缩放
  var tierScales = [1.0, 5.0, 10.0, 16.0, 24.0];
  var tierIdx = lv >= 90 ? 4 : lv >= 70 ? 3 : lv >= 50 ? 2 : lv >= 30 ? 1 : 0;
  var scale = tierScales[tierIdx];
  var mhp = Math.floor(baseHp * scale);
  var matk = Math.floor(baseAtk * scale);
  var mdef = Math.floor(baseDef * scale);
  var mspd = Math.floor(baseSpd * scale);
  var maspd = Math.floor(baseAspd * scale);
  
  var pHP = S.stats?.hp_max||S.user?.perm_stats?.hp||1000;
  var pAtk = S.stats?.attack||100;
  var pDef = S.stats?.defense||50;
  var pSpd = S.stats?.speed||30;
  var pAspd = S.stats?.atk_speed||20;
  var pDodge = S.stats?.dodge||0;
  var effAtk = Math.floor(pAtk + pSpd*0.3 + pAspd*0.4 + pDodge*0.5 + pHP*0.02);
  
  function dr(def, atk) { var r = atk>0 ? def/atk : 0; return r/(r+1.5); }
  function dodgeCh(p, m) { if(p<=0||m<=0)return 0; var r=p/m; return Math.min(Math.max((r-1)*0.25,0),0.40); }
  function ext(p, m) { if(p<=0||m<=0)return 0; var r=p/m; return Math.min(Math.max(Math.floor(r*2-1.5),0),3); }
  function crit(p, m) { if(p<=0||m<=0)return 0.05; var r=p/m; return Math.min(0.05+Math.max((r-1)*0.15,0),0.50); }
  function dmg(a, d) { return Math.max(1, Math.floor(a * (1 - dr(d, a)))); }
  
  var pd = dmg(effAtk, mdef), md = dmg(matk, pDef);
  var pk = Math.ceil(mhp/Math.max(1,pd)), pdie = Math.ceil(pHP/Math.max(1,md));
  var hpp=pHP, hpm=mhp, tu=0;
  while(hpp>0 && hpm>0 && tu<25) { tu++; hpm-=pd; if(hpm<=0) break; hpp-=md; }
  var win = hpm<=0 && hpp>0;
  
  var h = '<div style="padding:8px;background:var(--bg-card);border-radius:6px;border:1px solid var(--border-light);margin-top:4px;line-height:1.7">';
  h += '<div style="display:flex;gap:6px;align-items:center;margin-bottom:4px">';
  h += '<span style="font-size:13px">怪物Lv:</span> <input id="slvl-'+name+'" type="number" value="'+lv+'" min="1" max="200" style="width:70px;padding:2px 6px;font-size:13px">';
  h += '</div>';
  h += '<span style="color:var(--text-faint)">Lv.'+lv+'怪物 </span>❤️'+mhp+' ⚔️'+matk+' 🛡️'+mdef+' 💨'+mspd+' ⚡'+maspd+'<br>';
  h += '<span style="color:var(--text-faint)">你的属性 </span>❤️'+pHP+' ⚔️'+pAtk+' 🛡️'+pDef+' 💨'+pSpd+' ⚡'+pAspd+'<br>';
  h += '<span style="color:var(--text-faint)">有效攻击=</span>'+effAtk+' (攻'+Math.round(pAtk/effAtk*100)+'%+速'+Math.round(pSpd*0.3/effAtk*100)+'%+攻速'+Math.round(pAspd*0.4/effAtk*100)+'%)<br>';
  h += '<span style="color:var(--text-faint)">战斗 </span>';
  h += '闪避'+Math.round(dodgeCh(pSpd,mspd)*100)+'% 暴击'+Math.round(crit(pSpd,mspd)*100)+'%';
  var pe = ext(pAspd,maspd), me = ext(maspd,pAspd);
  if (pe>0) h+=' <span style="color:var(--purple)">额外攻击+'+pe+'</span>';
  if (me>0) h+=' <span style="color:var(--red)">| 怪额外攻击+'+me+'</span>';
  h += '<br><b>你打 '+pd+'/击 '+pk+'刀杀 | 怪打 '+md+'/击 '+pdie+'刀倒</b> ';
  h += (win ? '<span style="color:var(--green)">✅'+tu+'回合胜</span>' : '<span style="color:var(--red)">❌'+tu+'回合败</span>');
  h += '</div>';
  el.innerHTML = h;
  delete el.dataset.loading;
}

// 刷新神秘商人（不刷新整个冒险页面）
async function renderMerchant() {
  var el = document.querySelector('.merchant-section');
  if (!el) return;
  var m = await api('/api/merchant');
  if (!m || m.error) return;
  var h = '<div class="card merchant-section"><h2>🧙 商人 (' + (m.count||0) + '人)</h2>';
  // 神秘商人
  for (var i = 0; i < (m.merchants||[]).length; i++) {
    var mc = m.merchants[i];
    h += '<div class="card" style="border-left:4px solid var(--orange);margin:8px 0"><p><b>🧙 神秘商人</b>';
    var mcdl = Math.floor((mc.added_at||0)/1000) + 300;
    h += ' <span style="font-size:12px;color:var(--text-faint)">⏰ <span data-deadline="' + mcdl + '" data-prefix=""></span>后离开</span></p>';
    h += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">';
    for (var j = 0; j < (mc.items||[]).length; j++) {
      var mi = mc.items[j];
      h += '<button class="btn btn-orange btn-sm" onclick="buyMerchant(' + i + ',' + j + ')">' + esc(mi.name) + ' 💰' + (mi.price||'?') + '</button>';
    }
    h += '</div></div>';
  }
  // 哥布林商人
  for (var gi2 = 0; gi2 < (m.goblin_merchants||[]).length; gi2++) {
    var gc = m.goblin_merchants[gi2];
    h += '<div class="card" style="border-left:4px solid var(--green);margin:8px 0"><p><b>👺 哥布林商人</b> <span style="color:var(--green);font-size:13px">矿山特供</span>';
    var gcdl = Math.floor((gc.added_at||0)/1000) + 300;
    h += ' <span style="font-size:12px;color:var(--text-faint)">⏰ <span data-deadline="' + gcdl + '" data-prefix=""></span>后离开</span></p>';
    h += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">';
    for (var j2 = 0; j2 < (gc.items||[]).length; j2++) {
      var gi = gc.items[j2];
      h += '<button class="btn btn-green btn-sm" onclick="buyGoblin(' + gi2 + ',' + j2 + ')">' + esc(gi.name) + ' 💰' + (gi.price||'?') + '</button>';
    }
    h += '</div></div>';
  }
  h += '</div>';
  el.outerHTML = h;
  startCountdown();
}

// ==================== 季节节气页面 ====================
async function pgSeason() {
  var r = await api('/api/season');
  if (r.error) return _('content').innerHTML = '<div class="card"><h2>错误</h2></div>';
  var se = S.season || {};
  var solarTerm = r.current_solar_term;
  var cd = r.current_date || {};
  var h = '<div class="card"><h2>' + (se.season_icon || '') + ' 季节与节气</h2>';
  h += '<p style="color:var(--text-faint);font-size:13px">📅 游戏日历：第' + (cd.year||1) + '年 ' + cd.month + '月' + cd.day + '日</p>';
  h += '<div style="display:flex;gap:16px;flex-wrap:wrap;margin:12px 0">';
  h += '<div class="stat-box" style="background:linear-gradient(135deg,#1a1a2e,#16213e);color:#fff;padding:16px;border-radius:12px;flex:1;min-width:200px">';
  h += '<div style="font-size:28px;text-align:center">' + (se.season_icon || '') + '</div>';
  h += '<div style="font-size:20px;text-align:center;font-weight:bold;margin:4px 0">' + (se.season_name || '') + '</div>';
  h += '<div style="font-size:13px;text-align:center;color:var(--text-faint)">' + (se.season_desc || '') + '</div>';
  h += '<div style="margin-top:10px;text-align:center"><span class="badge" style="background:#2d3436">' + (se.season_weather_icon || '') + ' ' + (se.season_weather || '') + '</span></div>';
  h += '<div style="font-size:12px;color:var(--text-faint);text-align:center;margin-top:4px">' + (se.season_weather_desc || '') + '</div>';
  h += '<div style="margin-top:8px;font-size:12px;color:var(--text-faint);text-align:center">';
  var bonuses = [];
  if (se.season_crops_bonus) bonuses.push('🌾 作物+' + (Math.round(se.season_crops_bonus * 100)) + '%');
  if (se.season_fish_bonus) bonuses.push('🎣 钓鱼+' + (Math.round(se.season_fish_bonus * 100)) + '%');
  h += bonuses.join(' · ') || '无特殊加成';
  h += '</div></div>';

  if (solarTerm) {
    h += '<div class="stat-box" style="background:linear-gradient(135deg,#2c1810,#3d2317);color:#fff;padding:16px;border-radius:12px;flex:1;min-width:200px">';
    h += '<div style="font-size:28px;text-align:center">' + (solarTerm.icon || '') + '</div>';
    h += '<div style="font-size:20px;text-align:center;font-weight:bold;margin:4px 0">' + esc(solarTerm.name || '') + '</div>';
    h += '<div style="font-size:13px;text-align:center;color:var(--text-faint)">' + (solarTerm.desc || '') + '</div>';
    if (solarTerm.farm_bonus) {
      h += '<div style="margin-top:6px;font-size:12px;color:#f0c040;text-align:center">🌱' + (solarTerm.farm_bonus.desc || '') + '</div>';
    }
    if (solarTerm.activity) {
      var done = r.activity_done;
      h += '<div style="margin-top:12px;padding:10px;background:rgba(255,255,255,0.08);border-radius:8px">';
      h += '<div style="font-weight:bold;color:var(--yellow)">🎉 ' + esc(solarTerm.activity.title || '') + '</div>';
      h += '<div style="font-size:13px;color:#ccc;margin:4px 0">' + (solarTerm.activity.desc || '') + '</div>';
      if (!done) {
        h += '<button class="btn btn-orange" onclick="doSolarActivity()">\🙏 领取节气福利</button>';
      } else {
        h += '<span class="badge" style="background:var(--green)">✅ 今日已领取</span>';
      }
      h += '</div>';
    }
    h += '</div>';
  } else {
    h += '<div class="stat-box" style="background:linear-gradient(135deg,#1a1a2e,#16213e);color:#fff;padding:16px;border-radius:12px;flex:1;min-width:200px;text-align:center">';
    h += '<div style="font-size:24px;margin-bottom:8px">\📅</div><div>暂无节气活动</div></div>';
  }
  h += '</div></div>';

  h += '<div class="card"><h3>🌱本季适宜作物</h3><div style="display:flex;flex-wrap:wrap;gap:6px">';
  var crops = se.seasonal_crops || [];
  if (crops.length > 0) {
    for (var i = 0; i < crops.length; i++) h += '<span class="badge" style="background:var(--green);font-size:12px">' + esc(crops[i]) + '</span>';
  } else { h += '<span style="color:var(--text-faint);font-size:13px">无特别推荐</span>'; }
  h += '</div></div>';

  h += '<div class="card"><h3>\🐟 本季活跃鱼群</h3><div style="display:flex;flex-wrap:wrap;gap:6px">';
  var fish = se.seasonal_fish || [];
  if (fish.length > 0) {
    for (var i = 0; i < fish.length; i++) h += '<span class="badge" style="background:var(--blue-light);font-size:12px">' + esc(fish[i]) + '</span>';
  } else { h += '<span style="color:var(--text-faint);font-size:13px">无特别推荐</span>'; }
  h += '</div></div>';

  h += '<div class="card"><h3>\🏚️ 废墟探险</h3>';
  /* ruins stamina line removed */
  h += '<p style="font-size:12px;color:var(--text-faint)">已探索废墟：' + (Object.keys(r.ruins_explored || {}).length || 0) + '处</p>';
  h += '<button class="btn btn-purple btn-sm" onclick="pgAdvRuins()">\🏚️ 探索废墟</button></div>';

  h += '<div class="card"><h3>\📅 二十四节气</h3><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px">';
  var allTerms = r.all_terms || [];
  for (var i = 0; i < allTerms.length; i++) {
    var t = allTerms[i];
    var isActive = solarTerm && solarTerm.name === t.name;
    h += '<div class="stat-box" style="' + (isActive ? 'border:2px solid var(--yellow);background:#fff3e0;' : 'background:#2d2d2d;') + 'padding:8px;border-radius:8px;text-align:center">';
    h += '<div style="font-size:20px">' + (t.icon||'📅') + '</div>';
    h += '<div style="font-size:13px;' + (isActive ? 'color:var(--orange-light);font-weight:bold' : 'color:#ddd') + '">' + esc(t.name) + '</div>';
    h += '<div style="font-size:11px;color:var(--text-faint)">' + t.month + '月' + t.day + '日</div>';
    if (isActive) h += '<div style="font-size:10px;color:var(--orange-light)">⬅️ 当前</div>';
    h += '</div>';
  }
  h += '</div></div>';
  _('content').innerHTML = h;
}

async function doSolarActivity() {
  var r = await api('/api/season/activity', {});
  if (r.error) return toast(r.error, 'error');
  if (r.already_done) return toast('今日节气活动已领取', 'warning');
  var h = '<div class="modal-overlay" id="solar-reward"><div class="modal" style="max-width:450px">';
  h += '<h2>' + (r.icon || '') + ' ' + esc(r.name || '') + '</h2>';
  h += '<h3 style="color:var(--yellow)">🎉 ' + esc(r.activity || '') + '</h3>';
  h += '<div style="margin:12px 0">';
  for (var i = 0; i < (r.rewards || []).length; i++) {
    var rw = r.rewards[i];
    if (rw.type === 'coins') h += '<div style="padding:6px 0;border-bottom:1px solid #333">\💰 金币 <b>+' + fn(rw.amount) + '</b></div>';
    else if (rw.type === 'exp') h += '<div style="padding:6px 0;border-bottom:1px solid #333">⭐ 经验 <b>+' + fn(rw.amount) + '</b></div>';
    else if (rw.type === 'item') h += '<div style="padding:6px 0;border-bottom:1px solid #333">\📦 ' + esc(rw.name) + ' <b>x' + rw.count + '</b></div>';
    else if (rw.type === 'special_item') h += '<div style="padding:6px 0;border-bottom:1px solid #333;color:var(--yellow)">✨ 特殊物品：' + esc(rw.name) + '</div>';
    else if (rw.type === 'hp') h += '<div style="padding:6px 0;border-bottom:1px solid #333">❤️ 生命恢复 <b>+' + rw.amount + '</b></div>';
    else if (rw.type === 'skill_point') h += '<div style="padding:6px 0;border-bottom:1px solid #333">\📖 技能点 <b>+' + rw.amount + '</b></div>';
  }
  h += '</div>';
  h += '<button class="btn btn-green" onclick="document.getElementById(\'solar-reward\').remove();pgSeason()">领取完成</button></div></div>';
  _('content').insertAdjacentHTML('beforeend', h);
  await refresh();
}

// ==================== 冒险内嵌废墟探险 ====================
var _advRuinsRoomData = null;
var _advRuinsSearchResult = null;

function advRuinsLobby(r) {
  var h = '<div class="card" id="adv-ruins-panel"><h2>🏚️ 废墟探险</h2><div class="tabs" style="margin-bottom:12px"><button class="tab" onclick="S.advTab=\'adventure\';pgAdventure()">⚔️冒险</button>';
  h += '<button class="tab" onclick="S.advTab=\'quests\';pgAdventure()">📋每日任务</button>';
  h += '<button class="tab active">🏚️废墟</button></div>';
  h += '<p style="font-size:14px">探索未知的废墟，寻找宝藏与秘密！使用探索券进入。</p>';
  h += '<div class="item-grid">';
  var genericTicket = r.generic_ticket || '废墟探索卷轴';
  var shownCount = 0;
    for (var i = 0; i < (r.ruins_list || []).length; i++) {
      var ru = r.ruins_list[i];
      var locked = (S.user && S.user.level || 0) < ru.min_level;
      var ticketName = ru.ticket || '废墟探索卷轴';
      var hasSpecific = S.user && S.user.inventory && S.user.inventory[ticketName] || 0;
      var hasGeneric = S.user && S.user.inventory && S.user.inventory[genericTicket] || 0;
      var hasTicket = hasSpecific > 0 || hasGeneric > 0;
      if (!hasTicket || locked) continue;
      shownCount++;
      h += '<div class="item-card">';
      h += '<h3>' + esc(ru.name) + '</h3>';
      h += '<small>' + esc(ru.desc || '') + '</small><br>';
      h += '<small>🏚️ ' + (typeof ru.room_count === 'number' ? ru.room_count + '个' : ru.room_count) + '房间' + (ru.procedural ? ' <span style=\"color:var(--purple);font-size:11px\">🎲随机布局</span>' : '') + ' | 🚶最多' + (ru.max_steps || 10) + '步 | ⚠️ 需 Lv.' + ru.min_level + '</small>';
      if (hasSpecific > 0) {
        h += '<br><span class="badge badge-r4">📜 ' + esc(ticketName) + ' x' + hasSpecific + '</span>';
      } else if (hasGeneric > 0) {
        h += '<br><span class="badge badge-r3">📜 通用券 x' + hasGeneric + '</span>';
      }
      h += '<br><button class="btn btn-purple btn-sm" style="margin-top:6px" onclick="advEnterRuins(\'' + ru.id + '\')">🏚️ 进入探索</button>';
      h += '</div>';
    }
    if (shownCount === 0) {
      h += '<div class="item-card" style="text-align:center;padding:24px;grid-column:1/-1"><p style="font-size:16px">📜 暂无可用探索券</p><p style="font-size:13px">前往有「废墟」加成的子区域冒险可获得探索券</p></div>';
    }
  h += '</div>';
  h += '<p style="margin-top:8px;font-size:13px">📜 通用探索券：<b>' + esc(genericTicket) + '</b>（可进入任意废墟）</p>';
  h += '</div>';
  _('content').innerHTML = h; startCountdown();
}

async function advEnterRuins(id) {
  var r = await api('/api/ruins/enter', { ruinsId: id });
  if (r.error) return toast(r.error, 'error');
  toast('进入 ' + (r.ruins_name || '废墟') + '！', 'success');
  if (r.room) _advRuinsRoomData = r.room;
  S.advRuinsMode = true;
  S.user.ruins_current = { steps_taken: r.steps_taken || 1, max_steps: r.max_steps || 10, visited_rooms: [r.room ? r.room.id : ''] };
  await refresh();
  // Load full state from /api/ruins for the game UI
  var full = await api('/api/ruins');
  advRenderRuinsGame(full);
}

async function loadAdvRuinsPanel() {
  var r = await api('/api/ruins');
  if (r.error) return;
  if (r.current && S.advRuinsMode) {
    advRenderRuinsGame(r);
  } else if (!r.current) {
    S.advRuinsMode = false;
    advRuinsLobby(r);
  } else {
    advRuinsLobby(r);
  }
}

function advRenderRuinsGame(r) {
  // r can be from /api/ruins/enter (has .room) or /api/ruins (has .current_room)
  var roomData = r.current_room || r.room || _advRuinsRoomData;
  var stateData = r.current || S.user.ruins_current || {};
  if (!roomData) { S.advRuinsMode = false; pgAdvRuins(); return; }

  var h = '<div class="card" id="adv-ruins-game"><h2>🏚️ 废墟探险</h2>';
  h += '<div style="display:flex;gap:12px;margin:6px 0;flex-wrap:wrap">';
  h += '<span class="badge" style="background:var(--purple)" id="adv-ruins-steps-badge">🚶 ' + (stateData.steps_taken || 0) + '/' + (stateData.max_steps || 10) + '步</span>';
  h += '<span class="badge" style="background:#6c5ce7;color:#fff">🏚️ ' + (stateData.visited_count || 0) + '处已探索</span>';
  h += '<span class="badge" style="background:var(--red)" id="adv-ruins-hp-badge">❤️ ' + (S.user ? S.user.current_hp || 0 : 0) + '/' + ((S.stats || {}).hp || 1) + '</span>';
  h += '</div></div>';
  h += '<div class="card" id="adv-ruins-room" style="background:linear-gradient(135deg,var(--bg-card),var(--border-light));min-height:120px">';
  h += '<div id="adv-ruins-room-content"><p style="font-size:14px">加载中...</p></div></div>';
  h += '<div class="card" id="adv-ruins-actions"><div style="display:flex;flex-wrap:wrap;gap:8px">';
  h += '<button class="btn btn-primary btn-sm" onclick="advRuinsSearch()">🔍 搜索</button>';
  h += '<button class="btn btn-orange btn-sm" onclick="advRuinsFight()">⚔️ 战斗</button>';
  h += '<button class="btn btn-green btn-sm" onclick="advRuinsChest()">📦 开宝箱</button>';
  h += '<button class="btn btn-outline btn-sm" onclick="advRuinsRest()">💤 休息</button>';
  h += '<button class="btn btn-outline btn-sm" style="color:var(--red);border-color:var(--red)" onclick="advRuinsExit()">🚪 离开废墟</button>';
  h += '</div></div>';
  h += '<div class="card" id="adv-ruins-result" style="display:none"></div>';

  _('content').innerHTML = h; startCountdown();
  advLoadRuinsRoom();
}

async function advLoadRuinsRoom() {
  var el = document.getElementById('adv-ruins-room-content');
  if (!el) return;
  var r = await api('/api/ruins');
  if (r.error) return;
  if (!r.current) { S.advRuinsMode = false; pgAdvRuins(); return; }
  var room = r.current_room;
  if (!room) { el.innerHTML = '<p>房间数据加载中...</p>'; return; }
  _advRuinsRoomData = room;
  // 🗺️ 房间总览地图
  var overview = r.room_overview;
  var mapHTML = '';
  if (overview && overview.length > 0) {
    var visitedCnt = overview.filter(function(o){ return o.visited; }).length;
    var spawnedCnt = overview.filter(function(o){ return o.spawned; }).length;
    mapHTML += '<details style="margin-bottom:10px;font-size:13px" id="ruins-map-details"><summary style="cursor:pointer;font-weight:bold;color:var(--purple)">🗺️ 探索进度：' + visitedCnt + '/' + spawnedCnt + ' 房间</summary>';
    mapHTML += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px;padding:8px;background:var(--bg-card);border-radius:6px;border:1px solid var(--border-light)">';
    for (var oi = 0; oi < overview.length; oi++) {
      var o = overview[oi];
      if (!o.spawned) continue;
      var icon = o.is_current ? '📍' : (o.visited ? '✅' : '❓');
      var bg = o.is_current ? 'var(--purple)' : (o.visited ? 'var(--green-bg)' : '#f0f0f0');
      var fg = o.is_current ? '#fff' : (o.visited ? 'var(--green-dark)' : 'var(--text-faint)');
      var indicators = '';
      if (o.has_monster && !o.monster_defeated) indicators += '⚔️';
      if (o.has_chest && !o.chest_opened) indicators += '📦';
      if (o.is_exit) indicators += '🚪';
      mapHTML += '<span style="display:inline-block;padding:3px 8px;border-radius:4px;font-size:11px;background:' + bg + ';color:' + fg + '" title="' + esc(o.name) + '">' + icon + esc(o.name) + (indicators ? ' ' + indicators : '') + '</span>';
    }
    mapHTML += '</div></details>';
  }
  var h = mapHTML + '<div style="font-size:18px;font-weight:bold;margin-bottom:8px">📍 ' + esc(room.name || '未知区域') + '</div>';
  h += '<p style="font-size:14px;line-height:1.6">' + esc(room.desc || '') + '</p>';
  // 🎲 房间事件展示
  var roomEvents = r.current ? (r.current.room_events || []) : [];
  if (roomEvents.length > 0) {
    for (var ei = 0; ei < roomEvents.length; ei++) {
      var evt = roomEvents[ei];
      var evtBg = evt.type === 'wandering_monster' ? 'rgba(231,76,60,0.12)' :
                  evt.type === 'lucky' ? 'rgba(241,196,15,0.15)' :
                  evt.type === 'rich' ? 'rgba(46,204,113,0.12)' :
                  evt.type === 'merchant' ? 'rgba(142,68,173,0.12)' :
                  evt.type === 'cursed' ? 'rgba(192,57,43,0.12)' :
                  evt.type === 'treasure_hint' ? 'rgba(243,156,18,0.12)' :
                  'rgba(52,152,219,0.12)';
      h += '<div style="margin-top:6px;padding:6px 10px;background:' + evtBg + ';border-radius:6px;font-size:13px">';
      h += '<b>' + esc(evt.name) + '</b>：' + esc(evt.desc) + '</div>';
    }
  }
  var validExits = room.valid_exits || room.exits || [];
  var validExitsDesc = room.valid_exits_desc || room.exits_desc || [];
  if (validExits.length > 0) {
    h += '<div style="margin-top:12px;padding-top:8px;border-top:1px solid var(--border)">';
    h += '<div style="font-size:13px;color:var(--text-muted);margin-bottom:4px">🚪 出口：</div>';
    for (var i = 0; i < validExits.length; i++) {
      var ed = validExitsDesc[i] || ('出口' + (i + 1));
      h += '<button class="btn btn-sm ' + (room.is_exit ? 'btn-green' : 'btn-outline') + '" style="margin:2px" onclick="advRuinsMove(' + i + ')">' + esc(ed) + '</button> ';
    }
    h += '</div>';
  }
  // 怪物状态
  var hasEventMonster = roomEvents.some(function(e){ return e.type === 'wandering_monster' || e.type === 'elite_guardian' || e.type === 'treasure_goblin'; });
  var defeatedMonsters = r.current ? (r.current.defeated_monsters || []) : [];
  var monsterDefeated = room.monster && defeatedMonsters.indexOf(r.current.current_room) >= 0 && !hasEventMonster;
  if (room.monster) {
    if (monsterDefeated) {
      h += '<div style="margin-top:8px;padding:6px;background:rgba(46,204,113,0.1);border-radius:6px;font-size:12px;color:var(--green)">';
      h += '✅ 怪物已击败：<b>' + esc(room.monster.name || '') + '</b></div>';
    } else {
      h += '<div style="margin-top:8px;padding:6px;background:rgba(231,76,60,0.15);border-radius:6px;font-size:12px">';
      h += '⚔️ 这里有怪物出没：<b>' + esc(room.monster.name || '') + '</b> (稀有度' + (room.monster.rarity || 1) + ')</div>';
    }
  }
  // 更新战斗按钮状态
  var fightBtn = document.querySelector('#adv-ruins-actions .btn-orange');
  if (fightBtn) {
    if (!room.monster && !hasEventMonster) { fightBtn.disabled = true; fightBtn.textContent = '⚔️ 无怪物'; }
    else if (monsterDefeated && !hasEventMonster) { fightBtn.disabled = true; fightBtn.textContent = '✅ 已击败'; }
    else { fightBtn.disabled = false; fightBtn.textContent = '⚔️ 战斗'; }
  }
  // 更新搜索按钮状态（每个房间只能搜索一次）
  var searchBtn = document.querySelector('#adv-ruins-actions .btn-primary');
  if (searchBtn) {
    var exploredRooms = r.current ? (r.current.explored_rooms || []) : [];
    if (exploredRooms.indexOf(r.current.current_room) >= 0) {
      searchBtn.disabled = true; searchBtn.textContent = '✅ 已搜索';
    } else {
      searchBtn.disabled = false; searchBtn.textContent = '🔍 搜索';
    }
  }
  // 更新宝箱按钮状态
  var chestBtn = document.querySelector('#adv-ruins-actions .btn-green');
  if (chestBtn) {
    var openedChests = r.current ? (r.current.opened_chests || []) : [];
    if (!room.chest) { chestBtn.disabled = true; chestBtn.textContent = '📦 无宝箱'; }
    else if (openedChests.indexOf(r.current.current_room) >= 0) { chestBtn.disabled = true; chestBtn.textContent = '✅ 已开启'; }
    else { chestBtn.disabled = false; chestBtn.textContent = '📦 开宝箱'; }
  }
  if (room.chest) {
    var chestOpened = (r.current ? (r.current.opened_chests || []) : []).indexOf(r.current.current_room) >= 0;
    h += '<div style="margin-top:8px;padding:6px;background:rgba(243,156,18,0.15);border-radius:6px;font-size:12px">';
    h += (chestOpened ? '📦✅ 宝箱已开启：<b>' : '📦 发现宝箱：<b>') + esc(room.chest.name || '') + '</b></div>';
  }
  el.innerHTML = h;
}

function advRuinsUpdateBars(stepsTaken, maxSteps) {
  var sb = document.getElementById('adv-ruins-steps-badge');
  if (sb && stepsTaken != null) sb.textContent = '🚶 ' + stepsTaken + '/' + (maxSteps || 10) + '步';
  var hb = document.getElementById('adv-ruins-hp-badge');
  if (hb) hb.textContent = '❤️ ' + (S.user ? S.user.current_hp || 0 : 0) + '/' + ((S.stats || {}).hp || 1);
}

async function advRuinsMove(idx) {
  var r = await api('/api/ruins/move', { exitIndex: idx });
  if (r.error) return toast(r.error, 'error');
  if (r.success) {
    _advRuinsRoomData = r.room;
    var resEl = document.getElementById('adv-ruins-result');
    if (resEl) { resEl.style.display = 'none'; resEl.innerHTML = ''; }
    if (r.is_exit) {
      if (r.exit_msg) toast(r.exit_msg, r.auto_exit ? 'warning' : 'success');
      else toast('🏚️ 你离开了废墟！', 'success');
      _advRuinsRoomData = null;
      S.advRuinsMode = false;
      S.user.ruins_current = null;
      await refresh();
      pgAdvRuins();
      return;
    }
    if (r.is_new) {
      toast('进入了新区域：' + esc(r.room.name || ''), 'info');
      // 如果有房间事件，稍后显示（在advLoadRuinsRoom中渲染）
    }
    advRuinsUpdateBars(r.steps_taken, r.max_steps);
    advLoadRuinsRoom();
  }
}

async function advRuinsSearch() {
  var r = await api('/api/ruins/search',{});
  if (r.error) return toast(r.error, 'error');
  var el = document.getElementById('adv-ruins-result');
  if (!el) return;
  var h = '<h3>🔍 搜索结果</h3>';
  h += '<p style="font-size:12px;margin-bottom:8px">' + (r.room_desc || '') + '</p>';
  // 🎲 搜索惊喜事件
  if (r.search_event) {
    var se = r.search_event;
    var seBg = se.type === 'hidden_cache' ? 'rgba(46,204,113,0.15)' : se.type === 'secret_passage' ? 'rgba(52,152,219,0.15)' : 'rgba(231,76,60,0.15)';
    h += '<div style="padding:10px;background:' + seBg + ';border-radius:6px;margin:8px 0">';
    h += '<b>' + esc(se.name) + '</b>：' + esc(se.desc);
    if (se.item) h += '<br>📦 获得：<b>' + esc(se.item.name) + '</b> x' + se.item.count + (se.item.auto_added ? ' <span style="color:var(--green);font-size:11px">✅ 已自动拾取</span>' : '');
    if (se.damage) h += '<br>💥 受到 ' + se.damage + ' 点伤害';
    h += '</div>';
  }
  if (r.trap) {
    if (r.trap.dodged) {
      h += '<div style="padding:8px;background:rgba(46,204,113,0.15);border-radius:6px;margin:8px 0;color:var(--green-light)">✅ ' + esc(r.trap.dodge_desc || '') + '</div>';
    } else {
      h += '<div style="padding:8px;background:rgba(231,76,60,0.15);border-radius:6px;margin:8px 0;color:var(--red-light)">💥 ' + esc(r.trap.desc || '') + ' (受到 ' + r.trap.damage + ' 点伤害)</div>';
    }
  }
  // Extra finds from room events
  var allFinds = (r.finds || []).concat(r.extra_finds || []);
  if (allFinds.length > 0) {
    h += '<div style="margin:8px 0"><b>📦 发现物品：</b></div>';
    _advRuinsSearchResult = allFinds;
    for (var i = 0; i < allFinds.length; i++) {
      var f = allFinds[i];
      var isExtra = i >= (r.finds || []).length;
      var luckyTag = f.lucky ? ' ✨翻倍' : '';
      h += '<div style="padding:6px;margin:4px 0;background:rgba(255,255,255,0.05);border-radius:6px;display:flex;justify-content:space-between;align-items:center"><span>' + (isExtra ? '📦 ' : '') + '<b>' + esc(f.name || '') + '</b> x' + f.count + luckyTag + (f.tip ? '<br><small>' + esc(f.tip) + '</small>' : '') + (f.coins > 0 ? '<br><small style="color:var(--yellow)">💰+' + f.coins + '</small>' : '') + '</span><label style="display:flex;align-items:center;gap:4px"><input type="checkbox" class="adv-ruins-pick-cb" data-idx="' + i + '" checked> 拾取</label></div>';
    }
    h += '<button class="btn btn-green btn-sm" style="margin-top:8px" onclick="advRuinsPickup()">📦 确认拾取</button>';
  } else {
    h += '<p style="font-size:13px">什么都没找到...</p>';
  }
  // Room events reminder
  if (r.room_events && r.room_events.length > 0) {
    h += '<div style="margin-top:8px;font-size:12px;color:var(--text-muted)">';
    for (var ei = 0; ei < r.room_events.length; ei++) {
      h += '⚡ ' + esc(r.room_events[ei].name) + ' ';
    }
    h += '</div>';
  }
  el.style.display = 'block';
  el.innerHTML = h;
  await refresh();
  advRuinsUpdateBars();
}

async function advRuinsPickup() {
  var cbs = document.querySelectorAll('.adv-ruins-pick-cb');
  var items = [];
  for (var i = 0; i < cbs.length; i++) {
    if (cbs[i].checked) {
      var idx = parseInt(cbs[i].getAttribute('data-idx'));
      if (_advRuinsSearchResult && _advRuinsSearchResult[idx]) items.push(_advRuinsSearchResult[idx]);
    }
  }
  var r = await api('/api/ruins/pickup', { items: items });
  toast('拾取了 ' + r.picked + ' 种物品', 'success');
  _advRuinsSearchResult = null;
  var resEl = document.getElementById('adv-ruins-result');
  if (resEl) { resEl.style.display = 'none'; resEl.innerHTML = ''; }
  await refresh();
  // 刷新房间状态（搜索按钮应禁用，因为已搜索过）
  advRuinsUpdateBars();
  advLoadRuinsRoom();
}

async function advRuinsFight() {
  var r = await api('/api/ruins/fight',{});
  if (r.error) return toast(r.error, 'error');
  var el = document.getElementById('adv-ruins-result');
  if (!el) return;
  var h = '<h3>⚔️ 战斗结果</h3>';
  var isWandering = r.monster_data && r.monster_data.is_wandering;
  var isElite = r.monster_data && r.monster_data.is_elite;
  var isGoblin = r.monster_data && r.monster_data.is_goblin;
  var tagLabel = isGoblin ? '🏃【宝藏哥布林】' : (isElite ? '💀【精英守卫】' : (isWandering ? '👹【游荡怪物】' : ''));
  h += '<div style="padding:8px;margin:6px 0;background:rgba(231,76,60,0.1);border-radius:6px">' + tagLabel + '<b>👾' + esc((r.monster_data && r.monster_data.name) || '') + '</b> (稀有度' + ((r.monster_data && r.monster_data.rarity) || 1) + ')';
  if (r.monster_data && r.monster_data.special) h += ' <span class="badge" style="background:var(--purple)">' + r.monster_data.special + '</span>';
  h += '</div>';
  if (r.goblin_fled) {
    h += '<div style="padding:8px;background:rgba(241,196,15,0.15);border-radius:6px;color:var(--yellow);font-weight:bold;margin:6px 0">🏃💨 哥布林逃跑了！一溜烟消失在了黑暗中...</div>';
  } else if (r.win) {
    h += '<div style="padding:8px;background:rgba(46,204,113,0.15);border-radius:6px;color:var(--green-light);font-weight:bold;margin:6px 0">🎉 战斗胜利！</div>';
    if (r.phoenix_revived) h += '<div style="padding:4px 8px;background:rgba(255,100,50,0.15);border-radius:6px;color:var(--orange);font-size:12px;margin:4px 0">🪶 红泪石发动！死亡时复活并恢复满血！</div>';
    h += '<div style="font-size:13px;color:var(--text-faint)">💰 金币 +' + r.coins + ' | ⭐ 经验 +' + r.exp + '</div>';
    if (r.drops && r.drops.length > 0) {
      h += '<div style="margin-top:4px">📦 掉落：</div>';
      for (var i = 0; i < r.drops.length; i++) h += '<div style="font-size:13px">· ' + esc(r.drops[i].name) + ' x' + r.drops[i].count + '</div>';
    }
  } else {
    h += '<div style="padding:8px;background:rgba(231,76,60,0.15);border-radius:6px;color:var(--red-light);font-weight:bold;margin:6px 0">💀 战斗失败...</div>';
  }
  el.style.display = 'block';
  el.innerHTML = h;
  await refresh();
  // 刷新顶部状态栏和房间状态
  advRuinsUpdateBars();
  advLoadRuinsRoom();
}

async function advRuinsChest() {
  var r = await api('/api/ruins/chest',{});
  if (r.error) return toast(r.error, 'error');
  var el = document.getElementById('adv-ruins-result');
  if (!el) return;
  var h = '<h3>📦 开启宝箱</h3>';
  if (r.opened) {
    h += '<div style="padding:8px;background:rgba(46,204,113,0.15);border-radius:6px;color:var(--green-light);margin:6px 0">🔓 ' + (r.tip_success || '宝箱打开了！') + '</div>';
    if (r.loot) {
      h += '<div style="font-size:16px;font-weight:bold;color:var(--yellow);margin:8px 0">✨ 获得：' + esc(r.loot.name || '') + ' x' + r.loot.count + '</div>';
      if (r.loot.coins > 0) h += '<div style="color:var(--yellow)">💰 金币 +' + r.loot.coins + '</div>';
    }
  } else {
    h += '<div style="padding:8px;background:rgba(231,76,60,0.15);border-radius:6px;color:var(--red-light);margin:6px 0">🔒 ' + (r.tip_fail || '无法打开宝箱...') + '</div>';
    if (r.retry) h += '<div style="font-size:12px;color:var(--text-faint);margin-top:4px">💡 可以再次尝试开启</div>';
  }
  el.style.display = 'block';
  el.innerHTML = h;
  await refresh();
  // 刷新房间状态（更新宝箱标记等）
  advRuinsUpdateBars();
  advLoadRuinsRoom();
}

async function advRuinsRest() {
  var r = await api('/api/ruins/rest',{});
  if (r.error) return toast(r.error, 'error');
  toast('💤 休息恢复：❤️+' + (r.hp_restored || 0) + ' 生命值', 'success');
  await refresh();
  advRuinsUpdateBars(r.steps_taken, r.max_steps);
}

async function advRuinsExit() {
  gameConfirm('确定离开废墟吗？当前探索进度将丢失。<br><small>已探索过的房间不会保留</small>', async function() {
    var r = await api('/api/ruins/exit',{});
    if (r.error) return toast(r.error, 'error');
    toast('离开了废墟，探索时间：' + r.elapsed + '秒', 'info');
    _advRuinsRoomData = null;
    S.advRuinsMode = false;
    S.user.ruins_current = null;
    await refresh();
    pgAdvRuins();
  });
}
