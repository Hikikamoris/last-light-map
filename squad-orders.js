(function () {
  "use strict";
  var selectedUid = "", watchedUid = "", stopOrders = null, rows = [], generation = 0, orderFilter = "all";
  var users = [], aliases = new Map(), directoryLoaded = false, directoryLoading = false, directoryOwner = "";
  var accountUid = LLAuthState.user && LLAuthState.user.uid || "";

  function stop() {
    if (stopOrders) stopOrders();
    stopOrders = null; watchedUid = ""; rows = []; generation++;
  }
  function watch(uid) {
    if (watchedUid === uid && stopOrders) return;
    stop(); watchedUid = uid;
    var version = generation;
    stopOrders = window.LLAuth.watchPlayerOrders(uid, function (entries) {
      if (version !== generation) return;
      rows = entries;
      if (location.hash === "#state" && sub === "Приказы") drawPlayerList();
      if (location.hash === "#admin" && at === "Вердикты") drawMasterList();
    }, function (error) {
      if (version !== generation) return;
      var box = document.getElementById("squad-order-list") || document.getElementById("master-order-list");
      if (box) box.textContent = error.message || "Не удалось загрузить приказы.";
    });
  }
  function renderText(text) { return window.LLArticles ? window.LLArticles.render(text) : '<div class="pt">'+esc(text || "")+'</div>'; }
  function card(entry, master) {
    var date = entry.createdAt && entry.createdAt.toDate ? entry.createdAt.toDate().toLocaleString("ru-RU") : "Только что";
    var verdict = entry.verdict ? '<div class="vd">'+renderText(entry.verdict)+'</div>' : "";
    var mine = LLAuthState.user && entry.authorUid === LLAuthState.user.uid;
    var actions = master || mine ? '<div class="order-actions"><button type="button" data-squad-order-edit="'+esc(entry.id)+'">Изменить приказ</button>'+
      '<button type="button" data-squad-order-delete="'+esc(entry.id)+'">Удалить приказ</button></div>' : "";
    if (master) actions += '<button type="button" class="pr" data-article-verdict="'+esc(entry.id)+'">'+(entry.verdict ? "Редактировать вердикт" : "Написать вердикт")+'</button>';
    return '<article class="card post squad-order"><div class="broadcast-head"><b>'+esc(entry.squadName || entry.authorName || "Отряд")+'</b>'+
      '<small>'+esc(date)+'</small><span class="st '+(entry.status==="Принято"?"ok":entry.status==="Отклонено"?"no":"")+'">'+esc(entry.status || "Ожидает вердикта")+'</span></div>'+
      (entry.imageUrl?'<img class="pim" src="'+esc(entry.imageUrl)+'" alt="">':"")+renderText(entry.text)+verdict+actions+'</article>';
  }
  function drawPlayerList() {
    var box = document.getElementById("squad-order-list"); if (!box) return;
    var filtered = rows.filter(function (entry) { return orderFilter === "all" || entry.status === orderFilter; });
    box.innerHTML = filtered.map(function (entry) { return card(entry, false); }).join("") || '<div class="card">Приказов с выбранным статусом пока нет.</div>';
  }
  function renderPlayer() {
    var box = document.getElementById("squad-orders"); if (!box || !LLAuthState.user) return;
    if (isMaster()) {
      box.innerHTML = '<div class="card"><p>Приказы игроков и ответы мастера находятся в разделе «Вердикты».</p><button type="button" class="pr">Открыть вердикты</button></div>';
      box.querySelector("button").onclick = function () { at = "Вердикты"; location.hash = "#admin"; };
      return;
    }
    box.innerHTML = '<div class="card order-composer"><h3>Приказы отряда</h3><p>Приказы и вердикты видны вам и мастерам.</p>'+
      '<textarea id="wt" hidden></textarea><button id="wp" hidden></button><div id="wall-draft-status"></div>'+
      '<label>Показать<select id="squad-order-filter"><option value="all">Все приказы</option><option>Ожидает вердикта</option><option>Принято</option><option>Отклонено</option></select></label></div>'+
      '<div id="squad-order-list"></div>';
    var field = document.getElementById("wt");
    window.LLWallDraft.bind(field, "post", "main", "wall-draft-status");
    window.LLArticles.mount(box.querySelector(".order-composer"));
    var filter = document.getElementById("squad-order-filter"); filter.value = orderFilter;
    filter.onchange = function () { orderFilter = filter.value; drawPlayerList(); };
    watch(LLAuthState.user.uid); drawPlayerList();
  }
  function groups() {
    var map = new Map();
    users.filter(function (user) { return user.role === "player"; }).forEach(function (user) {
      map.set(user.id, { uid: user.id, name: aliases.get(user.id) || user.displayName || user.email || user.id, email: user.email || "", squad: "Отряд не назначен" });
    });
    D.squads.forEach(function (squad) {
      if (!squad.ownerUid) return;
      var group = map.get(squad.ownerUid) || { uid: squad.ownerUid, name: squad.ownerUid, email: "" };
      group.squad = squad.n; map.set(squad.ownerUid, group);
    });
    window.LLAuth.wallEntries().filter(function (entry) { return entry.kind === "order"; }).forEach(function (entry) {
      if (!map.has(entry.authorUid)) map.set(entry.authorUid, { uid: entry.authorUid, name: entry.authorName || entry.authorUid, squad: entry.squadName || "Прежний отряд", email: "" });
    });
    return Array.from(map.values()).sort(function (a,b) { return a.name.localeCompare(b.name, "ru"); });
  }
  function loadDirectory() {
    if (directoryLoading || directoryLoaded) return;
    directoryLoading = true;
    var owner = LLAuthState.user && LLAuthState.user.uid;
    Promise.all([window.LLAuth.listUsers(), window.LLAuth.listMasterNotes().catch(function () { return []; })]).then(function (result) {
      if (!isMaster() || !LLAuthState.user || LLAuthState.user.uid !== owner) return;
      users = result[0]; aliases = new Map(result[1].map(function (note) { return [note.uid, note.alias]; }));
      directoryLoaded = true;
      if (location.hash === "#admin" && at === "Вердикты") renderMaster();
    }).catch(function (error) {
      var box = document.getElementById("master-order-directory-note"); if (box) box.textContent = error.message || "Не удалось загрузить игроков.";
    }).finally(function () { directoryLoading = false; });
  }
  function drawMasterList() {
    var box = document.getElementById("master-order-list"); if (!box) return;
    box.innerHTML = rows.map(function (entry) { return card(entry, true); }).join("") || '<div class="card">У этого игрока пока нет приказов.</div>';
  }
  function renderMaster() {
    var box = document.getElementById("cloud-verdicts"); if (!box || !isMaster()) return;
    var owner = LLAuthState.user.uid;
    if (directoryOwner !== owner) { directoryOwner=owner; directoryLoaded=false; users=[]; aliases.clear(); }
    loadDirectory();
    var players = groups();
    if (!players.some(function (group) { return group.uid === selectedUid; })) selectedUid = players.length ? players[0].uid : "";
    box.innerHTML = '<div class="master-orders"><aside class="order-player-list"><h3>Игроки и отряды</h3><p id="master-order-directory-note">'+(directoryLoaded?"":"Загружаю игроков…")+'</p>'+
      players.map(function (group) { return '<button type="button" data-orders-player="'+esc(group.uid)+'" class="'+(group.uid===selectedUid?"on":"")+'"><b>'+esc(group.name)+'</b><span>'+esc(group.squad)+'</span>'+
        (group.email?'<small>'+esc(group.email)+'</small>':"")+'</button>'; }).join("")+'</aside><section><div id="master-order-list"></div></section></div>';
    box.querySelectorAll("[data-orders-player]").forEach(function (button) {
      button.onclick=function(){selectedUid=button.dataset.ordersPlayer;renderMaster();};
    });
    if (selectedUid) { watch(selectedUid); drawMasterList(); }
    else { stop(); box.querySelector("#master-order-list").textContent="Игроков с отрядами пока нет."; }
  }
  document.addEventListener("click", async function (event) {
    var edit = event.target.closest("[data-squad-order-edit]"), remove = event.target.closest("[data-squad-order-delete]");
    if (!edit && !remove) return;
    var id = edit ? edit.dataset.squadOrderEdit : remove.dataset.squadOrderDelete;
    var entry = rows.find(function (order) { return order.id === id; }); if (!entry) return;
    if (edit) { window.LLArticles.edit(entry); return; }
    if (!confirm("Удалить этот приказ вместе с его вердиктом?")) return;
    remove.disabled = true;
    try { await window.LLAuth.deleteWallEntry(id, "order"); toast("Приказ удалён.", "ok"); }
    catch(error){authMessage(error)}
    finally{if(remove.isConnected)remove.disabled=false}
  });
  function refreshContext() {
    if (location.hash === "#state" && sub === "Приказы") { renderPlayer(); return; }
    if (location.hash === "#admin" && at === "Вердикты" && isMaster()) { renderMaster(); return; }
    stop();
  }
  var baseState = rState;
  rState = function () { baseState(); if(sub!=="Приказы" && location.hash==="#state")stop(); };
  window.addEventListener("hashchange",refreshContext);
  window.addEventListener("ll:auth-state",function(){
    var uid=LLAuthState.user&&LLAuthState.user.uid||"";
    if(uid!==accountUid){
      accountUid=uid;stop();users=[];directoryLoaded=false;directoryLoading=false;selectedUid="";
      if(uid)refreshContext();
    }
  });
  window.LLSquadOrders = { renderPlayer:renderPlayer, renderMaster:renderMaster, find:function(id){return rows.find(function(entry){return entry.id===id;});}, refresh:refreshContext };
  if (location.hash === "#state") rState();
  if (location.hash === "#admin" && at === "Вердикты") renderMaster();
}());

