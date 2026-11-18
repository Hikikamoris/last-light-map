(function () {
  "use strict";
  var prefix = "LLARTICLE1\n";
  var allowed = new Set(["P", "BR", "STRONG", "B", "EM", "I", "U", "S", "STRIKE", "H2", "H3", "BLOCKQUOTE", "UL", "OL", "LI", "A", "IMG", "HR", "TABLE", "TBODY", "TR", "TD", "TH", "VIDEO", "AUDIO", "DIV"]);
  var activeSave = null, draftField = null, selection = null;

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
      if (node.tagName === "A") {
        var href = safeUrl(node.getAttribute("href"));
        if (href) { element.href = href; element.target = "_blank"; element.rel = "noopener noreferrer"; }
      }
      if (["IMG", "VIDEO", "AUDIO"].includes(node.tagName)) {
        var src = safeUrl(node.getAttribute("src"));
        if (!src) return;
        element.src = src;
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
  }
  document.addEventListener("selectionchange", rememberSelection);
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
    if (value.length > 12000) note.textContent = "Приказ слишком большой. Сократите его до 12 000 символов вместе с оформлением.";
  }
  function openEditor(field, onSave, editing) {
    var dialog = document.getElementById("order-writing-dialog");
    if (!dialog) {
      dialog = document.createElement("dialog"); dialog.id = "order-writing-dialog"; document.body.appendChild(dialog);
    }
    if (dialog.open) return;
    draftField = field; activeSave = onSave; selection = null;
    var article = parse(field.value) || { title: "", html: plainHtml(field.value) };
    var tools = [["bold","Ж"],["italic","К"],["underline","Ч"],["strikeThrough","Зачеркнуть"],["h2","Заголовок"],["h3","Подзаголовок"],["p","Текст"],["blockquote","Цитата"],["insertUnorderedList","• Список"],["insertOrderedList","1. Список"],["link","Ссылка"],["image","Изображение / GIF"],["video","Видео"],["audio","Аудио"],["table","Таблица"],["divider","Разделитель"],["undo","↶"],["redo","↷"]];
    dialog.innerHTML = '<div class="order-writing-top"><h2>' + (editing ? "Редактировать приказ" : "Новый приказ") +
      '</h2><button type="button" data-order-preview>Предпросмотр</button><button type="button" data-order-close>Закрыть</button></div>' +
      '<div class="order-writing-tools" role="toolbar" aria-label="Оформление приказа">' +
      tools.map(function (tool) { return '<button type="button" data-order-tool="'+tool[0]+'">'+tool[1]+'</button>'; }).join("") +
      '</div><div class="order-writing-paper"><label class="order-title-label">Заголовок приказа<input id="order-writing-title" maxlength="160" placeholder="Название операции"></label>' +
      '<div id="order-writing-body" class="order-article-body" contenteditable="true" role="textbox" aria-label="Текст приказа" aria-multiline="true"></div>' +
      '<div id="order-writing-preview" hidden></div></div><div class="order-writing-bottom"><span id="order-writing-note" role="status">Черновик хранится 12 часов после последнего изменения.</span>' +
      '<button type="button" class="pr" data-order-submit>'+(editing?"Сохранить изменения":"Отправить приказ")+'</button></div>';
    var title = document.getElementById("order-writing-title"), body = document.getElementById("order-writing-body");
    title.value = article.title; body.innerHTML = article.html;
    dialog.oninput = saveDraft;
    body.addEventListener("paste", function (event) {
      event.preventDefault();
      var clipboard = event.clipboardData;
      var html = clipboard.getData("text/html");
      document.execCommand("insertHTML", false, html ? clean(html) : plainHtml(clipboard.getData("text/plain")));
      saveDraft();
    });
    dialog.onclose = function () { draftField = null; activeSave = null; selection = null; };
    dialog.oncancel = function (event) {
      if (dialog.querySelector("[data-order-submit]").disabled) event.preventDefault();
    };
    dialog.querySelector(".order-writing-tools").onmousedown = function (event) { if (event.target.closest("button")) event.preventDefault(); };
    dialog.onclick = async function (event) {
      var button = event.target.closest("button");
      if (!button) return;
      if (button.hasAttribute("data-order-close")) { dialog.close(); return; }
      if (button.hasAttribute("data-order-preview")) {
        var preview = document.getElementById("order-writing-preview"), paper = body.parentElement;
        preview.hidden = !preview.hidden;
        body.hidden = !preview.hidden; title.closest("label").hidden = !preview.hidden;
        dialog.querySelector(".order-writing-tools").hidden = !preview.hidden;
        preview.innerHTML = render(articleValue());
        button.textContent = preview.hidden ? "Предпросмотр" : "Вернуться к тексту";
        return;
      }
      var command = button.dataset.orderTool;
      if (command) {
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
        if (value.length > 12000) { toast("Сократите приказ до 12 000 символов вместе с оформлением.", "error"); return; }
        saveDraft();
        button.disabled = true; dialog.querySelector("[data-order-close]").disabled = true;
        try { await activeSave(value); dialog.close(); }
        catch (error) { authMessage(error); }
        finally { button.disabled = false; dialog.querySelector("[data-order-close]").disabled = false; }
      }
    };
    dialog.showModal(); title.focus();
  }
  function mount(card) {
    var field = document.getElementById("wt"), publish = document.getElementById("wp");
    if (!field || !publish || card.querySelector("[data-write-order]")) return;
    field.hidden = true; publish.hidden = true;
    var button = document.createElement("button");
    button.type = "button"; button.className = "pr"; button.dataset.writeOrder = "";
    button.textContent = field.value ? "Продолжить черновик приказа" : "Написать приказ";
    field.before(button);
    var upload = document.getElementById("wi");
    if (upload) upload.setAttribute("aria-label", "Обложка приказа");
    button.onclick = function () {
      openEditor(field, async function (value) {
        await window.LLAuth.createWallEntry(value, PIMG || "");
        window.LLWallDraft.clear("post", "main"); PIMG = null; field.value = "";
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
  window.LLArticles = { render: render, mount: mount, edit: edit, parse: parse };
}());

