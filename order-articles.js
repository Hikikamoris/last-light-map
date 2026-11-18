(function () {
  "use strict";
  var prefix = "LLARTICLE1\n";
  var allowed = new Set(["P", "BR", "STRONG", "B", "EM", "I", "U", "S", "STRIKE", "H2", "H3", "BLOCKQUOTE", "UL", "OL", "LI", "A", "IMG", "HR", "TABLE", "COLGROUP", "COL", "TBODY", "TR", "TD", "TH", "VIDEO", "AUDIO", "DIV"]);
  var activeSave = null, draftField = null, selection = null;
  var pendingUploads = 0, mediaCache = new Map(), mediaUser = null;

  function hydrateMedia(root) {
    root.querySelectorAll("[data-order-media]").forEach(function (element) {
      if (element.dataset.mediaLoading || element.getAttribute("src")) return;
      var api = window.LLAuth, id = element.dataset.orderMedia;
      if (!api || !/^[a-zA-Z0-9]{10,40}$/.test(id)) return;
      element.dataset.mediaLoading = "true";
      var uid = window.LLAuthState && window.LLAuthState.user && window.LLAuthState.user.uid;
      var key = uid + ":" + id;
      if (!mediaCache.has(key)) {
        mediaCache.set(key, api.readArticleMedia(id).then(function (blob) { return URL.createObjectURL(blob); }));
      }
      mediaCache.get(key).then(function (url) {
        if (element.isConnected && uid === mediaUser) element.src = url;
      }).catch(function () {
        mediaCache.delete(key);
        element.dataset.mediaLoading = "error";
        if (!element.isConnected || element.nextElementSibling && element.nextElementSibling.classList.contains("order-media-error")) return;
        var error = document.createElement("span");
        error.className = "order-media-error";
        error.textContent = "Вложение недоступно. ";
        var retry = document.createElement("button"); retry.type = "button"; retry.textContent = "Повторить";
        retry.onclick = function () { element.removeAttribute("data-media-loading"); error.remove(); hydrateMedia(element.parentElement); };
        error.appendChild(retry); element.after(error);
      });
    });
  }
  new MutationObserver(function () { hydrateMedia(document); }).observe(document.body, { childList: true, subtree: true });
  window.addEventListener("ll:auth-state", function () {
    var uid = window.LLAuthState && window.LLAuthState.user && window.LLAuthState.user.uid;
    if (uid !== mediaUser) {
      mediaCache.forEach(function (promise) { promise.then(function (url) { URL.revokeObjectURL(url); }).catch(function () {}); });
      mediaCache.clear(); mediaUser = uid;
      document.querySelectorAll("[data-order-media]").forEach(function (el) { el.removeAttribute("src"); el.removeAttribute("data-media-loading"); });
      document.querySelectorAll(".order-media-error").forEach(function (el) { el.remove(); });
    }
    hydrateMedia(document);
  });

  function safeUrl(value) {
    try {
      var url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
    } catch (error) { return ""; }
  }
  function clean(html) {
    var source = document.createElement("template"), result = document.createElement("div");
    source.innerHTML = String(html || "");
    function append(node, parent) {
      if (node.nodeType === 3) { parent.appendChild(document.createTextNode(node.textContent)); return; }
      if (node.nodeType !== 1 || ["SCRIPT", "STYLE", "IFRAME", "OBJECT"].includes(node.tagName)) return;
      if (!allowed.has(node.tagName)) { Array.from(node.childNodes).forEach(function (child) { append(child, parent); }); return; }
      var element = document.createElement(node.tagName.toLowerCase());
      if (["TD", "TH"].includes(node.tagName)) {
        if (/^#[0-9a-f]{6}$/i.test(node.dataset.cellColor || "")) {
          element.dataset.cellColor = node.dataset.cellColor; element.style.backgroundColor = node.dataset.cellColor;
        }
        ["colspan", "rowspan"].forEach(function (name) {
          var span = Math.max(1, Math.min(name === "colspan" ? 30 : 100, Number(node.getAttribute(name)) || 1));
          if (span > 1) element.setAttribute(name, Math.floor(span));
        });
      }
      if (node.tagName === "TABLE" && /^(\d+(\.\d+)?,){0,29}\d+(\.\d+)?$/.test(node.dataset.columnWidths || "")) {
        element.dataset.columnWidths = node.dataset.columnWidths;
      }
      [["TABLE", "tableWidth", 20, 100, "width", "%"], ["COL", "columnWidth", 0.1, 100, "width", "%"], ["TR", "rowHeight", 24, 400, "height", "px"],
        ["TD", "cellWidth", 40, 800, "width", "px"], ["TH", "cellWidth", 40, 800, "width", "px"]].forEach(function (dimension) {
        if (node.tagName !== dimension[0] || !node.dataset[dimension[1]]) return;
        var raw = Math.max(dimension[2], Math.min(dimension[3], Number(node.dataset[dimension[1]])));
        var value = dimension[0] === "COL" ? Math.round(raw * 1000) / 1000 : Math.round(raw);
        if (!Number.isFinite(value)) return;
        element.dataset[dimension[1]] = value;
        element.style[dimension[4]] = value + dimension[5];
      });
      if (node.tagName === "A") {
        var href = safeUrl(node.getAttribute("href"));
        if (href) { element.href = href; element.target = "_blank"; element.rel = "noopener noreferrer"; }
      }
      if (["IMG", "VIDEO", "AUDIO"].includes(node.tagName)) {
        var mediaId = node.getAttribute("data-order-media");
        var src = safeUrl(node.getAttribute("src"));
        if (mediaId && /^[a-zA-Z0-9]{10,40}$/.test(mediaId)) element.dataset.orderMedia = mediaId;
        else if (src) element.src = src;
        else return;
        if (node.tagName === "IMG") { element.alt = node.getAttribute("alt") || ""; element.loading = "lazy"; }
        else { element.controls = true; element.preload = "none"; }
      }
      Array.from(node.childNodes).forEach(function (child) { append(child, element); });
      parent.appendChild(element);
    }
    Array.from(source.content.childNodes).forEach(function (node) { append(node, result); });
    return result.innerHTML;
  }
  function parse(text) {
    if (!String(text || "").startsWith(prefix)) return null;
    try {
      var article = JSON.parse(text.slice(prefix.length));
      if (typeof article.title !== "string" || typeof article.html !== "string") return null;
      return { title: article.title.slice(0, 160), html: clean(article.html) };
    } catch (error) { return null; }
  }
  function plainHtml(text) {
    var node = document.createElement("p");
    node.textContent = text || "";
    return node.outerHTML;
  }
  function render(text) {
    var article = parse(text);
    if (!article) return '<div class="pt">' + esc(text || "") + '</div>';
    var node = document.createElement("article"), title = document.createElement("h2");
    node.className = "order-article";
    title.textContent = article.title;
    node.appendChild(title);
    var body = document.createElement("div");
    body.className = "order-article-body";
    body.innerHTML = article.html;
    var headings = Array.from(body.querySelectorAll("h2,h3"));
    if (headings.length) {
      var toc = document.createElement("details"), summary = document.createElement("summary"), list = document.createElement("ol");
      summary.textContent = "Оглавление"; toc.open = true; toc.appendChild(summary);
      headings.forEach(function (heading) {
        var item = document.createElement("li"), button = document.createElement("button");
        button.type = "button"; button.dataset.articleJump = String(headings.indexOf(heading));
        button.textContent = heading.textContent;
        if (heading.tagName === "H3") item.className = "order-toc-sub";
        item.appendChild(button); list.appendChild(item);
      });
      toc.appendChild(list); node.appendChild(toc);
    }
    node.appendChild(body);
    return node.outerHTML;
  }
  document.addEventListener("click", function (event) {
    var button = event.target.closest("[data-article-jump]");
    if (!button) return;
    var article = button.closest(".order-article");
    var heading = article.querySelectorAll(".order-article-body h2,.order-article-body h3")[Number(button.dataset.articleJump)];
    if (heading) heading.scrollIntoView({ block: "start", behavior: "smooth" });
  });
  function rememberSelection() {
    var current = window.getSelection(), body = document.getElementById("order-writing-body");
    if (body && current.rangeCount && body.contains(current.anchorNode) && body.contains(current.focusNode)) selection = current.getRangeAt(0).cloneRange();
    positionTools();
  }
  function positionTools() {
    var dialog = document.getElementById("order-writing-dialog"), body = document.getElementById("order-writing-body");
    if (!dialog || !dialog.open || !body) return;
    var toolbar = dialog.querySelector(".order-writing-tools"), plus = dialog.querySelector("[data-order-plus]");
    toolbar.hidden = true; plus.hidden = true;
    var current = window.getSelection();
    if (!current.rangeCount || !body.contains(current.anchorNode) || !body.contains(current.focusNode)) return;
    var range = current.getRangeAt(0), bounds = dialog.getBoundingClientRect();
    var rect = range.getBoundingClientRect();
    if (!current.isCollapsed && current.toString().trim()) {
      toolbar.hidden = false;
      toolbar.style.left = Math.max(bounds.left + 8, Math.min(rect.left, bounds.right - toolbar.offsetWidth - 8)) + "px";
      toolbar.style.top = Math.max(bounds.top + 55, rect.top - toolbar.offsetHeight - 8) + "px";
    } else if (current.isCollapsed) {
      var node = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
      var block = node.closest("p,div,li,h2,h3");
      if (!block || !body.contains(block) || block.textContent.trim() || block.querySelector("img,video,audio,table")) return;
      rect = block.getBoundingClientRect();
      plus.hidden = false;
      plus.style.left = Math.max(bounds.left + 8, rect.left - 36) + "px";
      plus.style.top = Math.max(bounds.top + 58, rect.top) + "px";
    }
  }
  document.addEventListener("selectionchange", rememberSelection);
  document.addEventListener("pointerdown", function (event) {
    var menu = document.querySelector("#order-writing-dialog .order-insert-menu");
    if (menu && !event.target.closest(".order-insert-menu,[data-order-plus]")) menu.hidden = true;
  }, true);
  function focusSelection() {
    var body = document.getElementById("order-writing-body");
    body.focus();
    if (selection && body.contains(selection.commonAncestorContainer)) {
      var current = window.getSelection(); current.removeAllRanges(); current.addRange(selection);
    }
  }
  function articleValue() {
    return prefix + JSON.stringify({
      title: document.getElementById("order-writing-title").value.trim(),
      html: clean(document.getElementById("order-writing-body").innerHTML)
    });
  }
  function saveDraft() {
    if (!draftField) return;
    var value = articleValue();
    var title = document.getElementById("order-writing-title").value.trim();
    var body = document.getElementById("order-writing-body");
    draftField.value = title || body.textContent.trim() || body.querySelector("img,video,audio") ? value : "";
    draftField.dispatchEvent(new Event("input", { bubbles: true }));
    var note = document.getElementById("order-writing-note");
    var status = draftField.dataset.wallDraftStatus && document.getElementById(draftField.dataset.wallDraftStatus);
    note.textContent = status ? status.textContent : "Черновик сохранён в этом браузере на 12 часов.";
    if (value.length > 24000) note.textContent = "Приказ слишком большой. Сократите его до 24 000 символов вместе с оформлением.";
  }
  function openEditor(field, onSave, editing, verdictMode) {
    var dialog = document.getElementById("order-writing-dialog");
    if (!dialog) {
      dialog = document.createElement("dialog"); dialog.id = "order-writing-dialog"; document.body.appendChild(dialog);
    }
    if (dialog.open) return;
    draftField = field; activeSave = onSave; selection = null;
    var article = parse(field.value) || { title: "", html: plainHtml(field.value) };
    var tools = [["bold","Ж"],["italic","К"],["underline","Ч"],["strikeThrough","S̶"],["h2","H₂"],["h3","H₃"],["p","Текст"],["blockquote","❝"],["link","Ссылка"]];
    var inserts = [["image","Фото"],["gif","GIF"],["video","Видео"],["audio","Аудио"],["table","Таблица"],["divider","Разделитель"],["insertUnorderedList","• Список"],["insertOrderedList","1. Список"]];
    dialog.innerHTML = '<div class="order-writing-top"><h2>' + (verdictMode ? "Вердикт мастера" : editing ? "Редактировать приказ" : "Новый приказ") +
      '</h2><button type="button" data-order-close>Закрыть</button></div>' +
      '<div class="order-writing-tools" hidden role="toolbar" aria-label="Оформление выделенного текста">' +
      tools.map(function (tool) { return '<button type="button" data-order-tool="'+tool[0]+'">'+tool[1]+'</button>'; }).join("") +
      '</div><button type="button" data-order-plus aria-label="Добавить блок" hidden>+</button><div class="order-insert-menu" hidden>' +
      inserts.map(function (tool) { return '<button type="button" data-order-tool="'+tool[0]+'">'+tool[1]+'</button>'; }).join("") +
      '</div><input type="file" id="order-media-picker" hidden><div class="order-writing-paper"><label class="order-title-label">Заголовок приказа<input id="order-writing-title" maxlength="160" placeholder="Название операции"></label>' +
      '<div id="order-writing-body" class="order-article-body" contenteditable="true" role="textbox" aria-label="Текст приказа" aria-multiline="true"></div>' +
      '</div><div class="order-writing-bottom"><span id="order-writing-note" role="status">Черновик хранится 12 часов после последнего изменения.</span>' +
      (verdictMode ? '<label>Решение<select id="verdict-decision"><option value="Принято">Принять</option><option value="Отклонено">Отклонить</option></select></label>' : "") +
      '<button type="button" class="pr" data-order-submit>'+(verdictMode?"Опубликовать вердикт":editing?"Сохранить изменения":"Отправить приказ")+'</button></div>';
    var title = document.getElementById("order-writing-title"), body = document.getElementById("order-writing-body");
    title.value = article.title || (verdictMode ? "Вердикт мастера" : ""); body.innerHTML = article.html || "<p><br></p>";
    dialog.oninput = saveDraft;
    dialog.onscroll = function () { dialog.querySelector(".order-insert-menu").hidden = true; positionTools(); };
    if (window.LLOrderTables) window.LLOrderTables.install(dialog, body, saveDraft);
    var picker = dialog.querySelector("#order-media-picker"), insertMenu = dialog.querySelector(".order-insert-menu");
    async function insertFiles(files) {
      var insertion = selection && selection.cloneRange();
      pendingUploads++;
      var submit = dialog.querySelector("[data-order-submit]"), close = dialog.querySelector("[data-order-close]");
      submit.disabled = close.disabled = true;
      document.getElementById("order-writing-note").textContent = "Загружаем вложение…";
      try {
        for (var file of Array.from(files)) {
          var media = await window.LLAuth.uploadArticleMedia(file, field.dataset.mediaViewer || "");
          if (insertion && body.contains(insertion.commonAncestorContainer)) selection = insertion;
          focusSelection();
          var tag = media.mime.startsWith("image/") ? "img" : media.mime.startsWith("video/") ? "video" : "audio";
          var element = document.createElement(tag);
          element.dataset.orderMedia = media.id;
          if (tag === "img") element.alt = media.name;
          else { element.controls = true; element.preload = "none"; }
          document.execCommand("insertHTML", false, element.outerHTML + "<p><br></p>");
          rememberSelection(); insertion = selection && selection.cloneRange();
          saveDraft(); hydrateMedia(body);
        }
      } catch (error) {
        var message = error.code === "permission-denied"
          ? "Firebase пока запрещает загрузку. Мастеру нужно опубликовать правила orderMedia."
          : error.message || "Не удалось загрузить файл.";
        toast(message, "error", 12000);
        document.getElementById("order-writing-note").textContent = message;
      } finally {
        pendingUploads--;
        submit.disabled = close.disabled = pendingUploads > 0;
        picker.value = "";
      }
    }
    picker.onchange = function () { if (picker.files.length) insertFiles(picker.files); };
    body.addEventListener("paste", function (event) {
      event.preventDefault();
      var clipboard = event.clipboardData;
      rememberSelection();
      if (clipboard.files.length) { insertFiles(clipboard.files); return; }
      var html = clipboard.getData("text/html");
      document.execCommand("insertHTML", false, html ? clean(html) : plainHtml(clipboard.getData("text/plain")));
      saveDraft();
    });
    dialog.onclose = function () { draftField = null; activeSave = null; selection = null; };
    dialog.oncancel = function (event) {
      if (!insertMenu.hidden) { insertMenu.hidden = true; event.preventDefault(); return; }
      if (dialog.querySelector("[data-order-submit]").disabled || pendingUploads) event.preventDefault();
    };
    dialog.querySelector(".order-writing-tools").onpointerdown = function (event) { if (event.target.closest("button")) event.preventDefault(); };
    insertMenu.onpointerdown = function (event) { if (event.target.closest("button")) event.preventDefault(); };
    dialog.querySelector("[data-order-plus]").onpointerdown = function (event) { event.preventDefault(); };
    dialog.onclick = async function (event) {
      var button = event.target.closest("button");
      if (!button) return;
      if (button.hasAttribute("data-order-plus")) {
        insertMenu.hidden = !insertMenu.hidden;
        var plusRect = button.getBoundingClientRect(), dialogRect = dialog.getBoundingClientRect();
        insertMenu.style.left = Math.max(dialogRect.left + 8, Math.min(plusRect.left, dialogRect.right - 300)) + "px";
        insertMenu.style.top = Math.min(plusRect.bottom + 6, window.innerHeight - 170) + "px";
        return;
      }
      if (button.hasAttribute("data-order-close")) { dialog.close(); return; }
      var command = button.dataset.orderTool;
      if (command) {
        insertMenu.hidden = true;
        if (["image", "gif", "audio", "video"].includes(command)) {
          if (pendingUploads) return;
          picker.accept = command === "image" ? "image/jpeg,image/png,image/webp" : command === "gif" ? "image/gif" : command + "/*";
          picker.click(); return;
        }
        focusSelection();
        if (["h2","h3","p","blockquote"].includes(command)) document.execCommand("formatBlock", false, command);
        else if (["link","image","audio","video"].includes(command)) {
          var url = window.prompt(command === "link" ? "Адрес ссылки" : "Прямая ссылка на файл в интернете (https://…)"); if (!url) return;
          url = safeUrl(url);
          if (!url) { toast("Укажите полный адрес http:// или https://.", "error"); return; }
          focusSelection();
          if (command === "link") document.execCommand("createLink", false, url);
          else {
            var tag = command === "image" ? "img" : command;
            var media = document.createElement(tag); media.src = url;
            if (tag !== "img") { media.controls = true; media.preload = "none"; }
            document.execCommand("insertHTML", false, media.outerHTML+"<p><br></p>");
          }
        } else if (command === "divider") document.execCommand("insertHTML", false, "<hr><p><br></p>");
        else if (command === "table") document.execCommand("insertHTML", false, "<table><tbody>"+Array(3).fill("<tr>"+Array(3).fill("<td>Текст</td>").join("")+"</tr>").join("")+"</tbody></table><p><br></p>");
        else document.execCommand(command, false, null);
        rememberSelection(); saveDraft(); return;
      }
      if (button.hasAttribute("data-order-submit")) {
        var value = articleValue();
        if (!title.value.trim() || (!body.textContent.trim() && !body.querySelector("img,video,audio"))) {
          toast("Укажите заголовок и содержание приказа.", "error"); return;
        }
        if (value.length > 24000) { toast("Сократите приказ до 24 000 символов вместе с оформлением.", "error"); return; }
        saveDraft();
        button.disabled = true; dialog.querySelector("[data-order-close]").disabled = true;
        try { await activeSave(value); dialog.close(); }
        catch (error) { authMessage(error); }
        finally { button.disabled = false; dialog.querySelector("[data-order-close]").disabled = false; }
      }
    };
    dialog.showModal(); title.focus(); hydrateMedia(body);
  }
  function mount(card) {
    var field = document.getElementById("wt"), publish = document.getElementById("wp");
    if (!field || !publish || card.querySelector("[data-write-order]")) return;
    field.hidden = true; publish.hidden = true;
    var button = document.createElement("button");
    button.type = "button"; button.className = "pr"; button.dataset.writeOrder = "";
    button.textContent = field.value ? "Продолжить черновик приказа" : "Написать приказ";
    field.before(button);
    button.onclick = function () {
      openEditor(field, async function (value) {
        await window.LLAuth.createWallEntry(value);
        window.LLWallDraft.clear("post", "main"); field.value = "";
        rWall(); toast("Приказ отправлен мастеру.", "ok");
      }, false);
    };
  }
  function edit(entry) {
    var field = document.createElement("textarea");
    window.LLWallDraft.bind(field, "order-edit", entry.id);
    if (!field.value) field.value = entry.text || "";
    openEditor(field, async function (value) {
      await window.LLAuth.updateWallEntry(entry.id, entry.kind, value);
      window.LLWallDraft.clear("order-edit", entry.id);
      renderCloudWall(); toast("Приказ обновлён.", "ok");
    }, true);
  }
  document.addEventListener("click", function (event) {
    var button = event.target.closest("[data-article-verdict]");
    if (!button || !window.isMaster || !isMaster()) return;
    var id = button.dataset.articleVerdict, field = document.createElement("textarea");
    var order = window.LLAuth.wallEntries().find(function (entry) { return entry.id === id && entry.kind === "order"; });
    field.dataset.mediaViewer = order && order.authorUid || "";
    window.LLWallDraft.bind(field, "verdict", id);
    openEditor(field, async function (value) {
      var decision = document.getElementById("verdict-decision").value;
      await window.LLAuth.decideOrder(id, decision, value);
      window.LLWallDraft.clear("verdict", id);
      if (typeof renderCloudVerdicts === "function") renderCloudVerdicts();
      renderCloudWall(); toast("Вердикт опубликован.", "ok");
    }, false, true);
  });
  window.LLArticles = { render: render, mount: mount, edit: edit, parse: parse };
}());

