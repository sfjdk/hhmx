// -- 好友页面 --
S._friendTab = S._friendTab || 'list';
async function pgFriends(){
  var r = await api('/api/friends');
  if(r.error) return toast(r.error,'error');
  S._onlinePlayers = r.online_players || [];
  var h = '<div class="card"><h2>👥 好友</h2>';
  h += '<div class="tabs">';
  h += '<button class="tab'+(S._friendTab==='list'?' active':'')+'" onclick="S._friendTab=\'list\';pgFriends()">👥 好友 ('+r.friends.length+')</button>';
  h += '<button class="tab'+(S._friendTab==='requests'?' active':'')+'" onclick="S._friendTab=\'requests\';pgFriends()">📨 请求 ('+r.requests.length+')</button>';
  h += '<button class="tab'+(S._friendTab==='add'?' active':'')+'" onclick="S._friendTab=\'add\';pgFriends()">➕ 添加</button>';
  h += '</div>';

  if(S._friendTab === 'list'){
    if(r.friends.length === 0) h += '<p style="color:var(--text-faint);text-align:center;padding:24px">还没有好友<br><small>在聊天中点名字添加，或在世界聊天输入 @ 提及</small></p>';
    else {
      r.friends.forEach(function(f){
        h += '<div class="item-card" style="display:flex;align-items:center;justify-content:space-between;margin:4px 0">';
        h += '<div><b>'+(f.online?'🟢 ':'⚫ ')+esc(f.username)+'</b> <small>Lv.'+f.level+'</small>';
        if(f.title)h+=' <span style="font-size:11px;color:var(--text-faint)">'+esc(f.title)+'</span>';
        h += '</div>';
        h += '<button class="btn btn-outline btn-sm" style="color:var(--red)" onclick="removeFriend(\''+f.id+'\',\''+escAttr(f.username)+'\')">删除</button>';
        h += '</div>';
      });
    }
  } else if(S._friendTab === 'requests'){
    if(r.requests.length === 0) h += '<p style="color:var(--text-faint);text-align:center;padding:24px">暂无好友请求</p>';
    else {
      r.requests.forEach(function(f){
        h += '<div class="item-card" style="display:flex;align-items:center;justify-content:space-between;margin:4px 0">';
        h += '<b>'+esc(f.username)+'</b> <small>Lv.'+f.level+'</small>';
        h += '<div style="display:flex;gap:6px">';
        h += '<button class="btn btn-green btn-sm" onclick="acceptFriend(\''+f.id+'\')">✅ 同意</button>';
        h += '<button class="btn btn-outline btn-sm" style="color:var(--red)" onclick="declineFriend(\''+f.id+'\')">❌ 拒绝</button>';
        h += '</div></div>';
      });
    }
  } else if(S._friendTab === 'add'){
    h += '<div style="display:flex;gap:8px;margin-top:8px">';
    h += '<input id="friend-add-input" placeholder="输入玩家名称" style="flex:1">';
    h += '<button class="btn btn-green" onclick="addFriendByInput()">👥 添加好友</button>';
    h += '</div>';
    h += '<p style="font-size:12px;color:var(--text-faint);margin-top:6px">也可以在聊天中点玩家名字直接添加</p>';
  }
  h += '</div>';
  _('content').innerHTML = h;
}
async function addFriendByInput(){
  var inp = document.getElementById('friend-add-input');
  if(!inp||!inp.value.trim()) return toast('请输入玩家名称','error');
  await addFriendByName(inp.value.trim());
  inp.value = '';
  await pgFriends();
}
async function acceptFriend(userId){
  var r = await api('/api/friends/accept',{userId:userId});
  if(r.error) return toast(r.error,'error');
  toast('🤝 已添加为好友','success');
  await pgFriends();
}
async function declineFriend(userId){
  var r = await api('/api/friends/decline',{userId:userId});
  if(r.error) return toast(r.error,'error');
  toast('已拒绝','info');
  await pgFriends();
}
async function removeFriend(userId,username){
  gameConfirm('确定删除好友 <b>'+esc(username)+'</b> 吗？', async function(){
    var r = await api('/api/friends/remove',{userId:userId});
    if(r.error) return toast(r.error,'error');
    toast('已删除 '+username,'info');
    await pgFriends();
  });
}
