/* RP wall, master-only player aliases, and audience-restricted map markers. */
(function () {
  var masterUsers = [];
  var masterAliases = Object.create(null);
  var masterDirectoryReady = false;
  var masterDirectoryBusy = false;
  var masterDirectoryUpdatedAt = 0;
  var privateMarkers = [];
  var wallChannel = "all";
  var privateMapLayer = L.layerGroup().addTo(map);
  var privateEditorLayer = null;
  var privateEditorCaptureBound = false;
  var privateForm = { title: "Личная метка", description: "", symbol: "post", color: "#e2b94a", caption: "", visibleTo: [] };
  var baseWall = rWall;
  var baseRenderCloudWall = renderCloudWall;
  var baseDrawMap = drawMap;
  var baseDrawLeg = drawLeg;
  var baseInsp = insp;
  var baseSetT = setT;
  var baseInitEd = initEd;

  var style = document.createElement("style");
  style.textContent = ".master-player-row{display:grid;grid-template-columns:minmax(180px,1fr) minmax(180px,280px) auto;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid var(--bd)}.audience-list{max-height:220px;overflow:auto;border:1px solid var(--bd);border-radius:9px;padding:6px 10px;margin:8px 0}.audience-list label{display:flex;gap:8px;align-items:center;padding:6px 2px;color:var(--tx);cursor:pointer}.audience-list input{width:auto}.broadcast-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.broadcast-channel{border:1px solid #756536;color:var(--gd);padding:2px 8px;border-radius:999px;font-size:11px;text-transform:uppercase;letter-spacing:.05em}.pin-caption{border:1px solid #0007}.private-marker-delete{margin-top:8px}.private-form-note{font-size:12px;line-height:1.5;color:var(--mu);margin:8px 0}.private-marker-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 0;border-bottom:1px solid var(--bd)}@media(max-width:700px){.master-player-row{grid-template-columns:1fr;gap:5px}}";
  document.head.appendChild(style);

  function authApi() { return window.LLAuth || null; }
  function isMasterNow() { return typeof isMaster === "function" && isMaster(); }
  function isActivePlayerNow() { return typeof isActivePlayer === "function" && isActivePlayer(); }
  function prettyPlayer(u) {
    var name = masterAliases[u.id] || u.displayName || "Игрок";
    var email = u.email ? " · " + u.email : "";
    return esc(name) + (email ? '<small style="display:block;color:var(--mu)">' + esc(email) + "</small>" : "");
  }

  function playerRowsHtml(picker, selected) {
    var players = masterUsers.filter(function (u) { return u.role === "player"; });
    if (!masterDirectoryReady && !masterDirectoryBusy) return '<div style="color:var(--mu)">Загружаю аккаунты…</div>';
    if (!players.length) return '<div style="color:var(--mu)">Аккаунтов игроков пока нет.</div>';
    if (picker === "private" && privateForm.visibleTo.length) selected = privateForm.visibleTo;
    selected = selected || [];
    return players.map(function (u) {
      return '<label><input type="checkbox" data-player-recipient="' + picker + '" value="' + esc(u.id) + '" ' + (selected.indexOf(u.id) >= 0 ? "checked" : "") + '><span>' + prettyPlayer(u) + (u.status === "active" ? '<small style="display:block;color:var(--mu)">Одобрен</small>' : '<small style="display:block;color:var(--mu)">Ожидает одобрения</small>') + "</span></label>";
    }).join("");
  }

  function populatePlayerPickers() {
    document.querySelectorAll("[data-player-picker]").forEach(function (box) {
      box.innerHTML = playerRowsHtml(box.getAttribute("data-player-picker"), []);
    });
  }

  function renderMasterPlayers() {
    var box = document.getElementById("master-players");
    if (!box || !isMasterNow()) return;
    var players = masterUsers.filter(function (u) { return u.role === "player"; });
    box.innerHTML = players.length ? players.map(function (u) {
      return '<div class="master-player-row"><span><b>' + esc(u.displayName || "Игрок") + '</b><small style="display:block;color:var(--mu)">' + esc(u.email || u.id) + " · " + esc(u.status || "visitor") + '</small></span><input data-master-alias="' + esc(u.id) + '" maxlength="80" value="' + esc(masterAliases[u.id] || "") + '" placeholder="Например: игрок Серых Белок"><button class="pr" data-master-alias-save="' + esc(u.id) + '">Сохранить имя</button></div>';
    }).join("") : "Игроки пока не вошли через Google.";
  }

  function loadMasterDirectory(force) {
    var api = authApi();
    if (!isMasterNow() || !api || !api.listUsers || !api.listMasterNotes) return Promise.resolve();
    if (masterDirectoryBusy) return Promise.resolve();
    if (!force && masterDirectoryReady && Date.now() - masterDirectoryUpdatedAt < 30000) {
      populatePlayerPickers(); renderMasterPlayers();
      return Promise.resolve();
    }
    masterDirectoryBusy = true;
    return Promise.all([api.listUsers(), api.listMasterNotes()]).then(function (result) {
      masterUsers = result[0].filter(function (u) { return u.role === "player"; });
      masterAliases = Object.create(null);
      result[1].forEach(function (note) { if (note.uid && note.alias) masterAliases[note.uid] = note.alias; });
      masterDirectoryReady = true;
      masterDirectoryUpdatedAt = Date.now();
      populatePlayerPickers(); renderMasterPlayers();
      if (typeof EM !== "undefined" && EM && TOOL === "priv") drawPrivateEditorForm();
    }).catch(function (error) {
      var playersBox = document.getElementById("master-players");
      if (playersBox) playersBox.textContent = error.message || "Не удалось загрузить список аккаунтов.";
      document.querySelectorAll("[data-player-picker]").forEach(function (box) { box.textContent = error.message || "Не удалось загрузить игроков."; });
    }).finally(function () { masterDirectoryBusy = false; });
  }

  function renderChannelFilter() {
    var statusFilter = document.getElementById("wf");
    if (!statusFilter) return;
    var current = document.getElementById("wall-channel-filter");
    if (!current) {
      statusFilter.insertAdjacentHTML("afterend", '<label class="fi" style="margin-top:8px">Канал стены<select id="wall-channel-filter"></select></label>');
      current = document.getElementById("wall-channel-filter");
    }
    var values = ["Радиопереговоры", "События", "Слухи", "Объявления"];
    var entries = authApi() && authApi().wallEntries ? authApi().wallEntries() : [];
    entries.forEach(function (entry) { if (entry.kind === "broadcast" && entry.channel && values.indexOf(entry.channel) < 0) values.push(entry.channel); });
    current.innerHTML = '<option value="all">Все каналы</option>' + values.map(function (channel) { return '<option value="' + esc(channel) + '">' + esc(channel) + '</option>'; }).join("");
    current.value = wallChannel;
    current.onchange = function () { wallChannel = current.value; renderWall(); };
  }

  function privateIcon(marker) {
    var p = { t: TYPES[marker.symbol] ? marker.symbol : "post", c: marker.color || "#e2b94a", caption: marker.caption || "" };
    return markerIconForPoint(p, 17);
  }

  function privatePopup(marker) {
    var html = '<div class="pp"><div class="ph2"><span class="li">' + ico(TYPES[marker.symbol] ? marker.symbol : "post", 15) + '</span><div><b>' + esc(marker.title || "Личная метка") + '</b><small>Видно выбранным игрокам</small></div></div>' + (marker.description ? '<p>' + esc(marker.description) + "</p>" : "");
    if (isMasterNow()) html += '<small style="color:var(--mu)">Получателей: ' + (marker.visibleTo || []).length + '</small><br><button class="private-marker-delete" data-private-delete="' + esc(marker.id) + '">Удалить метку</button>';
    return html + "</div>";
  }

  function drawPrivateMarkers() {
    privateMapLayer.clearLayers();
    if (typeof EM !== "undefined" && EM && privateEditorLayer) privateEditorLayer.clearLayers();
    privateMarkers.forEach(function (marker) {
      if (!Number.isFinite(Number(marker.x)) || !Number.isFinite(Number(marker.y))) return;
      var mainMarker = L.marker([H - Number(marker.y), Number(marker.x)], { icon: privateIcon(marker) }).addTo(privateMapLayer);
      mainMarker.bindPopup(privatePopup(marker));
      mainMarker.on("click", function (e) { L.DomEvent.stopPropagation(e); });
      if (typeof EM !== "undefined" && EM && privateEditorLayer) {
        var editorMarker = L.marker(toLL([Number(marker.x), Number(marker.y)]), { icon: privateIcon(marker) }).addTo(privateEditorLayer);
        editorMarker.bindPopup(privatePopup(marker));
        editorMarker.on("click", function (e) { L.DomEvent.stopPropagation(e); });
      }
    });
  }

  function renderPrivateLegend() {
    if (!document.getElementById("leg")) return;
    var leg = document.getElementById("leg");
    var old = leg.querySelector("[data-private-legend]");
    if (old) old.remove();
    if (!isMasterNow() && !(window.LLAuthState && window.LLAuthState.user)) return;
    leg.insertAdjacentHTML("beforeend", '<div data-private-legend><div class="eb" style="margin:12px 0 6px">Личные метки</div><label class="lg"><input type="checkbox" data-private-layer ' + (map.hasLayer(privateMapLayer) ? "checked" : "") + ' style="width:auto"><span class="li">' + ico("eye", 15) + '</span>Метки для меня</label></div>');
  }

  function drawPrivateEditorForm() {
    var panel = document.getElementById("einsp");
    if (!panel || TOOL !== "priv") return;
    var oldForm = panel.querySelector("[data-private-editor-section]");
    if (oldForm) oldForm.remove();
    var symbols = Object.keys(TYPES).map(function (key) {
      return '<option value="' + key + '" ' + (privateForm.symbol === key ? "selected" : "") + '>' + esc(TYPES[key][1]) + "</option>";
    }).join("");
    var marks = privateMarkers.length ? privateMarkers.map(function (m) {
      return '<div class="private-marker-row"><span>' + esc(m.title || "Личная метка") + '<small style="display:block;color:var(--mu)">' + (m.visibleTo || []).length + ' получ.</small></span><button data-private-delete="' + esc(m.id) + '">Удалить</button></div>';
    }).join("") : '<div style="color:var(--mu)">Пока нет личных меток.</div>';
    panel.insertAdjacentHTML("beforeend", '<div data-private-editor-section><h3>Личная метка</h3><div class="private-form-note">Она появится только у выбранных аккаунтов и у мастеров. Нажмите по карте, чтобы сохранить метку сразу.</div><label class="fi">Заголовок<input data-private-field="title" maxlength="100" value="' + esc(privateForm.title) + '"></label><label class="fi">Значок<select data-private-field="symbol">' + symbols + '</select></label><label class="fi">Цвет<input type="color" data-private-field="color" value="' + esc(privateForm.color) + '"></label><label class="fi">Короткая подпись на карте<input data-private-field="caption" maxlength="48" value="' + esc(privateForm.caption) + '" placeholder="Необязательно"></label><label class="fi">Описание<textarea data-private-field="description" rows="2" maxlength="1000">' + esc(privateForm.description) + '</textarea></label><b>Кому показывать</b><div class="audience-list" data-player-picker="private">' + playerRowsHtml("private", privateForm.visibleTo) + '</div><h3>Ваши личные метки</h3><div>' + marks + '</div></div>');
  }

  function renderMasterWallComposer() {
    if (!isMasterNow()) return;
    var form = document.getElementById("wt");
    if (!form) return;
    var card = form.closest(".card");
    if (!card) return;
    card.setAttribute("data-broadcast-composer", "true");
    card.innerHTML = '<h3>Новая запись на Стену</h3><p style="color:var(--mu);margin:4px 0 10px">Выберите канал, автора и аудиторию. Игроки смогут отвечать в комментариях под записью.</p><div class="grid"><label class="fi">Канал<select id="broadcast-channel"><option>Радиопереговоры</option><option>События</option><option>Слухи</option><option>Объявления</option><option value="custom">Другое</option></select></label><label class="fi">От чьего лица<input id="broadcast-sender" maxlength="80" value="Диспетчер" placeholder="Например: Радио 7, очевидец"></label></div><label class="fi" id="broadcast-custom-channel-wrap" style="display:none">Название канала<input id="broadcast-custom-channel" maxlength="40" placeholder="Например: Связь отряда"></label><label class="fi">Кто увидит<select id="broadcast-audience"><option value="all">Все игроки</option><option value="selected">Только выбранные аккаунты</option></select></label><div id="broadcast-target-wrap" style="display:none"><b>Выберите игроков</b><div class="audience-list" data-player-picker="broadcast">Загружаю аккаунты…</div></div><textarea id="broadcast-text" rows="4" maxlength="12000" style="width:100%;margin:8px 0" placeholder="Текст радиопереговоров, события или объявления…"></textarea><button class="pr" data-broadcast-publish>Опубликовать запись</button><label class="fi" style="margin-top:14px">Показать<select id="wf"><option value="all">Все записи</option><option value="Ожидает вердикта">Ожидают вердикта</option><option value="Принято">Принятые</option><option value="Отклонено">Отклонённые</option><option value="Событие">События и радиопереговоры</option></select></label>';
    var filter = document.getElementById("wf");
    if (filter) { filter.value = wf; filter.onchange = function () { wf = this.value; renderWall(); }; }
    renderChannelFilter();
    loadMasterDirectory(false);
  }

  function renderWall() {
    var box = document.getElementById("cloud-wall");
    if (!box) return;
    if (!window.LLAuthState || !window.LLAuthState.configured) { box.textContent = "Общие записи стены появятся после подключения Firebase."; return; }
    var entries = authApi() && authApi().wallEntries ? authApi().wallEntries() : [];
    var channelFilter = document.getElementById("wall-channel-filter");
    if (channelFilter) {
      var selectedChannel = wallChannel;
      var values = ["Радиопереговоры", "События", "Слухи", "Объявления"];
      entries.forEach(function (entry) { if (entry.kind === "broadcast" && entry.channel && values.indexOf(entry.channel) < 0) values.push(entry.channel); });
      channelFilter.innerHTML = '<option value="all">Все каналы</option>' + values.map(function (channel) { return '<option value="' + esc(channel) + '">' + esc(channel) + '</option>'; }).join("");
      channelFilter.value = selectedChannel;
    }
    if (wf !== "all") entries = entries.filter(function (p) { return p.status === wf; });
    if (wallChannel !== "all") entries = entries.filter(function (p) { return p.kind === "broadcast" && (p.channel || "События") === wallChannel; });
    if (!entries.length) { box.innerHTML = '<div class="card" style="color:var(--mu)">Пока нет общих публикаций.</div>'; return; }
    box.innerHTML = entries.map(function (p) {
      var status = p.status || "Опубликовано";
      var broadcast = p.kind === "broadcast";
      var name = broadcast ? (p.senderName || "Мастер проекта") : (p.authorName || p.squadName || "Игрок");
      var created = p.createdAt && p.createdAt.toDate ? p.createdAt.toDate().toLocaleString("ru-RU") : "только что";
      var statusClass = status === "Принято" || status === "Событие" ? "ok" : status === "Отклонено" ? "no" : "";
      var audience = broadcast ? (isMasterNow() && p.audience === "selected" ? '<span class="st">Для выбранных</span>' : "") : "";
      var html = '<div class="card post"><div class="broadcast-head"><b>' + esc(name) + '</b>' + (broadcast ? '<span class="broadcast-channel">' + esc(p.channel || "События") + "</span>" : "") + '<span style="color:var(--mu)">' + esc(created) + '</span><span class="sp"></span>' + audience + '<span class="st ' + statusClass + '">' + esc(status) + "</span></div>" + (p.imageUrl ? '<img class="pim" src="' + esc(p.imageUrl) + '" alt="">' : "") + '<div class="pt">' + esc(p.text || "") + "</div>";
      if ((broadcast || p.kind === "post") && (isActivePlayerNow() || isMasterNow())) {
        html += '<div class="rx">' + (!broadcast ? '<button data-cloud-react="like" data-post="' + esc(p.id) + '">Нравится</button>' : "") + '<button data-cloud-comments="' + esc(p.id) + '" data-collection="' + (broadcast ? "broadcasts" : "posts") + '" style="color:var(--mu)">Ответить / комментарии</button></div><div id="comments-' + esc(p.id) + '"></div>';
      }
      if (isMasterNow() && p.kind === "order" && status === "Ожидает вердикта") html += '<div style="margin-top:10px"><button class="pr" data-cloud-order="Принято" data-post="' + esc(p.id) + '">Принять</button> <button data-cloud-order="Отклонено" data-post="' + esc(p.id) + '">Отклонить</button></div>';
      if (p.verdict) html += '<div class="vd"><b>Вердикт мастера</b><br>' + esc(p.verdict) + '</div>';
      return html + "</div>";
    }).join("");
  }

  rWall = function () { baseWall(); renderMasterWallComposer(); renderChannelFilter(); renderWall(); };
  renderCloudWall = renderWall;
  drawMap = function () { baseDrawMap(); drawPrivateMarkers(); };
  drawLeg = function () { baseDrawLeg(); renderPrivateLegend(); };
  insp = function () {
    baseInsp();
    if (typeof EM === "undefined" || !EM) return;
    if (SELO && SELO.k === "pts") {
      var panel = document.getElementById("einsp");
      if (panel) panel.insertAdjacentHTML("beforeend", '<label class="fi">Цвет значка<input data-ip="c" type="color" value="' + esc(/^#[0-9a-f]{6}$/i.test(String(SO().c || "")) ? SO().c : "#e2b94a") + '"></label><label class="fi">Короткая подпись на карте<input data-ip="caption" maxlength="48" value="' + esc(SO().caption || "") + '" placeholder="Необязательно"></label>');
    }
    if (TOOL === "pt") {
      var panel2 = document.getElementById("einsp");
      if (panel2) panel2.insertAdjacentHTML("beforeend", '<label class="fi">Цвет значка<input id="pt-color" type="color" value="' + esc(PT_COLOR) + '"></label><label class="fi">Короткая подпись на карте<input id="pt-caption" maxlength="48" value="' + esc(PT_CAPTION) + '" placeholder="Необязательно"></label><div class="private-form-note">Можно выбрать любой значок из набора Last Light и добавить короткую подпись.</div>');
    }
    if (TOOL === "priv") drawPrivateEditorForm();
  };
  setT = function (tool) { baseSetT(tool); if (tool === "priv") loadMasterDirectory(false); };
  initEd = function () {
    baseInitEd();
    if (!privateEditorLayer) privateEditorLayer = L.layerGroup().addTo(EM);
    if (!privateEditorCaptureBound) {
      privateEditorCaptureBound = true;
      EM.getContainer().addEventListener("click", function (event) {
        if (TOOL !== "priv") return;
        if (event.target.closest && event.target.closest(".leaflet-control,.leaflet-marker-icon,#emod,#ehint,#est,button,a,input,textarea,select")) return;
        event.preventDefault(); event.stopImmediatePropagation();
        try {
          var point = typeof EM.mouseEventToLatLng === "function" ? EM.mouseEventToLatLng(event) : EM.containerPointToLatLng(EM.mouseEventToContainerPoint(event));
          var recipients = privateForm.visibleTo.slice();
          if (!recipients.length) { toast("Сначала выберите хотя бы одного игрока справа.", "error"); return; }
          authApi().createPrivateMarker({
            x: sn(point.lng), y: sn(H - point.lat), title: privateForm.title, description: privateForm.description,
            symbol: privateForm.symbol, color: privateForm.color, caption: privateForm.caption, visibleTo: recipients
          }).then(function () { toast("Личная метка сохранена и видна только выбранным игрокам.", "ok"); })
            .catch(function (error) { toast(error.message || "Не удалось сохранить личную метку.", "error", 9000); });
        } catch (error) { toast(error.message || "Не удалось определить место на карте.", "error"); }
      }, true);
    }
    drawPrivateMarkers();
  };

  document.getElementById("wall").addEventListener("change", function (event) {
    if (event.target.id === "broadcast-audience") {
      var wrap = document.getElementById("broadcast-target-wrap");
      if (wrap) wrap.style.display = event.target.value === "selected" ? "block" : "none";
    }
    if (event.target.id === "broadcast-channel") {
      var custom = document.getElementById("broadcast-custom-channel-wrap");
      if (custom) custom.style.display = event.target.value === "custom" ? "block" : "none";
    }
  });
  document.getElementById("wall").addEventListener("click", function (event) {
    var button = event.target.closest && event.target.closest("[data-broadcast-publish]");
    if (!button) return;
    var selected = Array.from(document.querySelectorAll('[data-player-recipient="broadcast"]:checked')).map(function (input) { return input.value; });
    var audience = document.getElementById("broadcast-audience").value;
    authApi().createBroadcast({
      channel: document.getElementById("broadcast-channel").value === "custom" ? document.getElementById("broadcast-custom-channel").value : document.getElementById("broadcast-channel").value,
      senderName: document.getElementById("broadcast-sender").value,
      audience: audience,
      visibleTo: audience === "selected" ? selected : [],
      text: document.getElementById("broadcast-text").value
    }).then(function () { rWall(); toast("Запись опубликована.", "ok"); })
      .catch(function (error) { toast(error.message || "Не удалось опубликовать запись.", "error", 9000); });
  });

  function refreshBroadcastComments(id, target) {
    authApi().listComments(id, "broadcasts").then(function (rows) {
      if (!target.isConnected) return;
      target.innerHTML = rows.map(function (comment) {
        return '<div class="row"><span><b>' + esc(comment.displayName || "Игрок") + '</b> ' + esc(comment.text || "") + "</span></div>";
      }).join("") + '<input id="comment-input-' + esc(id) + '" placeholder="Ответить…" style="width:calc(100% - 110px);margin-top:8px"><button data-cloud-comment-send="' + esc(id) + '" data-collection="broadcasts">Отправить</button>';
    }).catch(function (error) { if (target.isConnected) target.textContent = error.message || "Не удалось загрузить ответы."; });
  }
  document.getElementById("wall").addEventListener("click", function (event) {
    var commentButton = event.target.closest && event.target.closest('[data-cloud-comments][data-collection="broadcasts"]');
    var sendButton = event.target.closest && event.target.closest('[data-cloud-comment-send][data-collection="broadcasts"]');
    if (!commentButton && !sendButton) return;
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    if (commentButton) {
      var id = commentButton.getAttribute("data-cloud-comments"), target = document.getElementById("comments-" + id);
      if (!target) return;
      if (target.innerHTML) { target.innerHTML = ""; return; }
      target.innerHTML = '<div style="color:var(--mu);padding:8px">Загружаю ответы…</div>';
      refreshBroadcastComments(id, target);
      return;
    }
    var sendId = sendButton.getAttribute("data-cloud-comment-send"), input = document.getElementById("comment-input-" + sendId), commentTarget = document.getElementById("comments-" + sendId);
    authApi().addComment(sendId, input ? input.value : "", "broadcasts").then(function () { refreshBroadcastComments(sendId, commentTarget); }).catch(function (error) { toast(error.message || "Не удалось отправить ответ.", "error"); });
  }, true);

  document.getElementById("adm").addEventListener("click", function (event) {
    var saveButton = event.target.closest && event.target.closest("[data-master-alias-save]");
    if (!saveButton) return;
    var uid = saveButton.getAttribute("data-master-alias-save"), input = document.querySelector('[data-master-alias="' + CSS.escape(uid) + '"]');
    if (!input) return;
    authApi().saveMasterNote(uid, input.value).then(function () {
      masterAliases[uid] = input.value.trim();
      masterDirectoryUpdatedAt = Date.now();
      toast("Мастерское имя сохранено. Игрок его не увидит.", "ok");
      renderMasterPlayers(); populatePlayerPickers(); if (TOOL === "priv") drawPrivateEditorForm();
    }).catch(function (error) { toast(error.message || "Не удалось сохранить имя.", "error"); });
  });

  document.getElementById("adm").addEventListener("click", function (event) {
    var button = event.target.closest && event.target.closest("[data-at]");
    if (button && button.getAttribute("data-at") === "Игроки") setTimeout(function () { loadMasterDirectory(false); }, 0);
  });

  document.addEventListener("input", function (event) {
    var target = event.target;
    if (target.id === "pt-color") PT_COLOR = target.value;
    if (target.id === "pt-caption") PT_CAPTION = target.value;
    if (target.hasAttribute("data-private-field")) privateForm[target.getAttribute("data-private-field")] = target.value;
  });
  document.addEventListener("change", function (event) {
    var target = event.target;
    if (target.id === "pt-color") PT_COLOR = target.value;
    if (target.id === "pt-caption") PT_CAPTION = target.value;
    if (target.hasAttribute("data-private-field")) privateForm[target.getAttribute("data-private-field")] = target.value;
    if (target.matches("[data-player-recipient=private]")) {
      privateForm.visibleTo = Array.from(document.querySelectorAll('[data-player-recipient="private"]:checked')).map(function (input) { return input.value; });
    }
    if (target.matches("[data-player-recipient=broadcast]")) {
      target.checked = target.checked;
    }
  });

  document.addEventListener("click", function (event) {
    var button = event.target.closest && event.target.closest("[data-private-delete]");
    if (!button || !isMasterNow()) return;
    event.preventDefault(); event.stopPropagation();
    var id = button.getAttribute("data-private-delete");
    if (!confirm("Удалить эту личную метку у всех выбранных игроков?")) return;
    authApi().deletePrivateMarker(id).then(function () { toast("Личная метка удалена.", "ok"); }).catch(function (error) { toast(error.message || "Не удалось удалить метку.", "error"); });
  });

  document.getElementById("leg").addEventListener("change", function (event) {
    if (!event.target.matches("[data-private-layer]")) return;
    if (event.target.checked) privateMapLayer.addTo(map); else map.removeLayer(privateMapLayer);
  });
  window.addEventListener("ll:private-markers", function (event) { privateMarkers = event.detail || []; drawPrivateMarkers(); if (TOOL === "priv") drawPrivateEditorForm(); });
  window.addEventListener("ll:wall-data", renderWall);
  window.addEventListener("ll:auth-state", function () {
    if (isMasterNow()) loadMasterDirectory(false);
    renderPrivateLegend();
    var composer = document.querySelector('[data-broadcast-composer="true"]');
    if (location.hash === "#wall" && isMasterNow() && !composer) renderMasterWallComposer();
    else if (location.hash === "#wall" && !isMasterNow() && composer) { baseWall(); renderChannelFilter(); renderWall(); }
  });
  window.addEventListener("hashchange", function () {
    if (location.hash === "#wall" && isMasterNow()) setTimeout(renderMasterWallComposer, 0);
    if (location.hash === "#editor" && isMasterNow()) setTimeout(drawPrivateMarkers, 60);
  });

  drawMap();
  drawLeg();
}());
