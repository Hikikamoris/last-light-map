(function () {
  "use strict";
  var active = null;

  function model(table) {
    var records = [], grid = [];
    Array.from(table.rows).forEach(function (row, r) {
      grid[r] = grid[r] || [];
      var c = 0;
      Array.from(row.cells).forEach(function (cell) {
        while (grid[r][c]) c++;
        var item = { cell: cell, r: r, c: c, rows: Math.max(1, cell.rowSpan), cols: Math.max(1, cell.colSpan) };
        records.push(item);
        for (var y = r; y < r + item.rows; y++) {
          grid[y] = grid[y] || [];
          for (var x = c; x < c + item.cols; x++) grid[y][x] = item;
        }
        c += item.cols;
      });
    });
    return { records: records, rows: grid.length, cols: Math.max(0, ...grid.map(function (row) { return row.length; })), grid: grid };
  }
  function blank(r, c) {
    var cell = document.createElement("td"); cell.innerHTML = "<br>";
    return { cell: cell, r: r, c: c, rows: 1, cols: 1 };
  }
  function rebuild(table, data) {
    var occupied = [];
    data.records.forEach(function (item) {
      for (var y = item.r; y < item.r + item.rows; y++) {
        occupied[y] = occupied[y] || [];
        for (var x = item.c; x < item.c + item.cols; x++) occupied[y][x] = true;
      }
    });
    for (var r = 0; r < data.rows; r++) {
      for (var c = 0; c < data.cols; c++) {
        if (!occupied[r] || !occupied[r][c]) data.records.push(blank(r, c));
      }
    }
    var heights = Array.from(table.rows).map(function (row) { return row.dataset.rowHeight; });
    var body = document.createElement("tbody");
    for (var y = 0; y < data.rows; y++) {
      var row = document.createElement("tr");
      if (heights[y]) { row.dataset.rowHeight = heights[y]; row.style.height = heights[y] + "px"; }
      data.records.filter(function (item) { return item.r === y; }).sort(function (a, b) { return a.c - b.c; }).forEach(function (item) {
        item.cell.rowSpan = item.rows; item.cell.colSpan = item.cols;
        row.appendChild(item.cell);
      });
      body.appendChild(row);
    }
    table.replaceChildren(body);
    applyWidths(table, widths(table, data.cols));
  }
  function widths(table, columns) {
    var values = String(table.dataset.columnWidths || "").split(",").map(Number);
    if (values.length !== columns || values.some(function (value) { return !Number.isFinite(value) || value <= 0; })) return Array(columns).fill(100 / columns);
    var total = values.reduce(function (sum, value) { return sum + value; }, 0);
    return values.map(function (value) { return value * 100 / total; });
  }
  function applyWidths(table, values) {
    table.dataset.columnWidths = values.map(function (value) { return value.toFixed(3); }).join(",");
    var group = document.createElement("colgroup");
    values.forEach(function (value) {
      var col = document.createElement("col"); col.dataset.columnWidth = value.toFixed(3); col.style.width = value + "%"; group.appendChild(col);
    });
    var previous = table.querySelector("colgroup"); if (previous) previous.remove();
    table.prepend(group);
    table.querySelectorAll("td,th").forEach(function (cell) { cell.removeAttribute("data-cell-width"); cell.style.removeProperty("width"); });
  }
  function focusCell(cell) {
    var range = document.createRange();
    range.selectNodeContents(cell); range.collapse(true);
    var selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    cell.closest("[contenteditable]").focus();
    active.cell = cell;
  }
  function modify(command) {
    var cell = active.cell, table = cell && cell.closest("table");
    if (!table || !active.body.contains(table)) return;
    var data = model(table), item = data.records.find(function (record) { return record.cell === cell; });
    if (!item) return;
    if (command === "delete-table") {
      var paragraph = document.createElement("p"); paragraph.innerHTML = "<br>";
      table.replaceWith(paragraph); active.cell = null; active.panel.hidden = true; active.changed(); return;
    }
    if (command === "split") {
      item.rows = item.cols = 1;
    } else if (command === "merge-right" || command === "merge-down") {
      var neighbor = command === "merge-right" ? data.grid[item.r][item.c + item.cols] : data.grid[item.r + item.rows] && data.grid[item.r + item.rows][item.c];
      if (!neighbor) { toast("У этой ячейки нет соседа в выбранном направлении.", "error"); return; }
      var bottom = Math.max(item.r + item.rows, neighbor.r + neighbor.rows);
      var right = Math.max(item.c + item.cols, neighbor.c + neighbor.cols);
      var merging = data.records.filter(function (record) { return record.r < bottom && record.r + record.rows > item.r && record.c < right && record.c + record.cols > item.c; });
      if (merging.some(function (record) { return record.r < item.r || record.c < item.c || record.r + record.rows > bottom || record.c + record.cols > right; })) {
        toast("Сначала разделите соседние объединённые ячейки.", "error"); return;
      }
      merging.sort(function (a, b) { return a.r - b.r || a.c - b.c; }).forEach(function (record) {
        if (record === item) return;
        var paragraph = document.createElement("div");
        while (record.cell.firstChild) paragraph.appendChild(record.cell.firstChild);
        item.cell.appendChild(paragraph);
      });
      data.records = data.records.filter(function (record) { return record === item || !merging.includes(record); });
      item.rows = bottom - item.r; item.cols = right - item.c;
    } else {
      var rowOperation = command.startsWith("row-"), deletion = command.endsWith("delete");
      var axis = rowOperation ? "r" : "c", span = rowOperation ? "rows" : "cols";
      var line = item[axis] + (command.endsWith("after") ? item[span] : 0);
      if (!deletion && data[span] >= (rowOperation ? 100 : 30)) { toast("Достигнут максимальный размер таблицы.", "error"); return; }
      if (deletion && data[span] <= 1) { modify("delete-table"); return; }
      data.records = data.records.filter(function (record) {
        if (deletion) {
          if (record[axis] === line && record[span] === 1) return false;
          if (record[axis] <= line && record[axis] + record[span] > line) record[span]--;
          else if (record[axis] > line) record[axis]--;
        } else {
          if (record[axis] >= line) record[axis]++;
          else if (record[axis] + record[span] > line) record[span]++;
        }
        return true;
      });
      data[span] += deletion ? -1 : 1;
    }
    rebuild(table, data);
    focusCell(table.contains(cell) ? cell : table.rows[Math.min(item.r, table.rows.length - 1)].cells[0]);
    active.changed();
    positionEdges();
  }
  function edgeButton(text, title, left, top, width, height, action) {
    var button = document.createElement("button"); button.type = "button";
    button.textContent = text; button.title = title; button.setAttribute("aria-label", title);
    button.style.cssText = "left:"+left+"px;top:"+top+"px;width:"+width+"px;height:"+height+"px";
    button.onpointerdown = function (event) { event.preventDefault(); };
    button.onclick = action; active.edges.appendChild(button);
    return button;
  }
  function axisMenu(axis, index, button) {
    var table = active.cell.closest("table"), data = model(table);
    var target = axis === "row" ? data.grid[index][0] : data.grid[0][index];
    focusCell(target.cell);
    var menu = active.menu;
    menu.innerHTML = '<label>Цвет '+(axis === "row" ? 'строки' : 'столбца')+' <input type="color" value="#292b20"></label>'+
      '<button type="button" data-edge-action="add">Добавить '+(axis === "row"?'строку':'столбец')+'</button>'+
      '<button type="button" data-edge-action="previous">Переместить '+(axis === "row"?'выше':'влево')+'</button>'+
      '<button type="button" data-edge-action="next">Переместить '+(axis === "row"?'ниже':'вправо')+'</button>'+
      '<button type="button" data-edge-action="delete">Удалить '+(axis === "row"?'строку':'столбец')+'</button>';
    var rect = button.getBoundingClientRect();
    menu.style.left = Math.max(8,Math.min(rect.left,window.innerWidth-230))+"px";
    menu.style.top = Math.max(70,Math.min(rect.bottom+5,window.innerHeight-250))+"px";
    menu.hidden = false;
    menu.onpointerdown = function (event) { if (event.target.closest("button")) event.preventDefault(); };
    menu.querySelector("input").oninput = function (event) {
      var color = event.target.value;
      data.records.filter(function (item) { return axis === "row" ? item.r <= index && item.r+item.rows>index : item.c<=index && item.c+item.cols>index; }).forEach(function (item) {
        item.cell.dataset.cellColor = color; item.cell.style.backgroundColor = color;
      });
      active.changed();
    };
    menu.onclick = function (event) {
      var chosen = event.target.closest("[data-edge-action]"); if (!chosen) return;
      var action = chosen.dataset.edgeAction;
      if (action === "add" || action === "delete") { modify(axis+"-"+(action==="add"?"after":"delete")); menu.hidden=true; return; }
      var targetIndex = index + (action === "previous" ? -1 : 1), size = axis === "row" ? data.rows : data.cols;
      if (targetIndex<0||targetIndex>=size) return;
      if (data.records.some(function (item) { return axis === "row" ? item.rows>1 : item.cols>1; })) { toast("Перед перемещением разделите объединённые ячейки.", "error"); return; }
      var key = axis === "row" ? "r" : "c";
      data.records.forEach(function (item) { if(item[key]===index)item[key]=targetIndex;else if(item[key]===targetIndex)item[key]=index; });
      if (axis === "col") {
        var values = widths(table,data.cols), previous = values[index]; values[index]=values[targetIndex]; values[targetIndex]=previous;
        table.dataset.columnWidths=values.join(",");
      }
      rebuild(table,data); focusCell(target.cell); menu.hidden=true; active.changed(); positionEdges();
    };
  }
  function positionEdges() {
    if (!active || !active.dialog.open || !active.cell || !active.body.contains(active.cell)) return;
    var table = active.cell.closest("table"), rect=table.getBoundingClientRect(), bounds=active.dialog.getBoundingClientRect();
    if (rect.bottom < bounds.top+60 || rect.top > bounds.bottom) { active.edges.hidden=true; return; }
    var data=model(table), values=widths(table,data.cols);
    active.edges.hidden=false;
    active.edges.style.cssText="left:"+rect.left+"px;top:"+rect.top+"px;width:"+rect.width+"px;height:"+rect.height+"px";
    active.edges.replaceChildren();
    edgeButton("+","Добавить столбец справа",rect.width+3,0,24,rect.height,function(){
      focusCell(data.grid[0][data.cols-1].cell); modify("col-after");
    });
    edgeButton("+","Добавить строку снизу",0,rect.height+3,rect.width,24,function(){
      focusCell(data.grid[data.rows-1][0].cell); modify("row-after");
    });
    edgeButton("Ячейки","Объединение и размеры",Math.max(0,rect.width-108),-55,108,25,function(){active.panel.hidden=!active.panel.hidden;});
    var offset=0;
    values.forEach(function(value,index){
      var left=offset*rect.width/100, width=value*rect.width/100;
      edgeButton("⋮","Меню столбца "+(index+1),left+width/2-10,-27,20,23,function(event){axisMenu("col",index,event.currentTarget);});
      if(index>0) {
        var handle=edgeButton("","Изменить ширину столбца",left-4,0,8,rect.height,function(){});
        handle.className="table-column-resize";
        handle.onpointerdown=function(event){
          event.preventDefault(); handle.setPointerCapture(event.pointerId);
          var start=event.clientX, initial=values.slice(), total=initial[index-1]+initial[index];
          handle.onpointermove=function(move){
            var delta=(move.clientX-start)*100/rect.width, min=Math.min(total/3,30*100/rect.width);
            values[index-1]=Math.max(min,Math.min(total-min,initial[index-1]+delta));
            values[index]=total-values[index-1]; applyWidths(table,values);
            handle.style.left=(left+(values[index-1]-initial[index-1])*rect.width/100-4)+"px";
          };
          handle.onpointerup=function(){
            handle.onpointermove=null;handle.onpointerup=null;active.changed();positionEdges();
          };
          handle.onpointercancel=function(){applyWidths(table,initial);handle.onpointermove=null;positionEdges();};
        };
      }
      offset+=value;
    });
    var item=data.records.find(function(item){return item.cell===active.cell;});
    if(item) {
      var x=values.slice(0,item.c).reduce(function(sum,value){return sum+value;},0)*rect.width/100;
      edgeButton("+","Вставить столбец перед выбранным",x-10,-51,22,22,function(){modify("col-before");});
    }
    Array.from(table.rows).forEach(function(row,index){
      var rowRect=row.getBoundingClientRect();
      edgeButton("⋮","Меню строки "+(index+1),-25,rowRect.top-rect.top+rowRect.height/2-10,20,22,function(event){axisMenu("row",index,event.currentTarget);});
    });
  }
  function sync() {
    if (!active || !active.dialog.open) return;
    if (active.panel.contains(document.activeElement)) return;
    var selection = window.getSelection(), node = selection.anchorNode;
    if (node && node.nodeType !== 1) node = node.parentElement;
    var cell = node && node.closest && node.closest("td,th");
    if (!cell || !active.body.contains(cell)) {
      if (!active.panel.contains(document.activeElement) && !active.menu.contains(document.activeElement)) {
        active.body.querySelectorAll(".table-cell-selected").forEach(function (element) { element.classList.remove("table-cell-selected"); });
        active.cell=null; active.panel.hidden = true; active.edges.hidden=true; active.menu.hidden=true;
      }
      return;
    }
    active.body.querySelectorAll(".table-cell-selected").forEach(function (element) { element.classList.remove("table-cell-selected"); });
    cell.classList.add("table-cell-selected");
    active.cell = cell;
    active.panel.querySelector("[data-table-width]").value = cell.closest("table").dataset.tableWidth || 100;
    active.panel.querySelector("[data-row-height]").value = cell.parentElement.dataset.rowHeight || 40;
    active.panel.querySelector("[data-cell-width]").value = cell.dataset.cellWidth || 150;
    positionEdges();
  }
  document.addEventListener("selectionchange", sync);
  document.addEventListener("scroll",function(){positionEdges();},true);
  window.addEventListener("resize",positionEdges);
  document.addEventListener("pointerdown",function(event){
    if(active&&!event.target.closest(".table-axis-menu,.table-edge-layer"))active.menu.hidden=true;
  },true);
  window.LLOrderTables = {
    install: function (dialog, body, changed) {
      var panel = document.createElement("div");
      panel.className = "order-table-tools"; panel.hidden = true; panel.contentEditable = "false";
      var actions = [["row-before","Строка ↑"],["row-after","Строка ↓"],["col-before","Столбец ←"],["col-after","Столбец →"],["row-delete","Удалить строку"],["col-delete","Удалить столбец"],["merge-right","Объединить →"],["merge-down","Объединить ↓"],["split","Разделить"],["delete-table","Удалить таблицу"]];
      panel.innerHTML = '<div>' + actions.map(function (action) { return '<button type="button" data-table-action="'+action[0]+'">'+action[1]+'</button>'; }).join("") +
        '</div><div><label>Ширина таблицы, % <input type="number" data-table-width min="20" max="100" value="100"></label>'+
        '<label>Ширина ячейки, px <input type="number" data-cell-width min="40" max="800" value="150"></label>'+
        '<label>Высота строки, px <input type="number" data-row-height min="24" max="400" value="40"></label></div>';
      dialog.querySelector(".order-writing-top").after(panel);
      var edges=document.createElement("div"),menu=document.createElement("div");
      edges.className="table-edge-layer";edges.hidden=true;
      menu.className="table-axis-menu";menu.hidden=true;
      dialog.append(edges,menu);
      active = { dialog: dialog, body: body, panel: panel, edges:edges, menu:menu, cell: null, changed: changed };
      panel.onpointerdown = function (event) { if (event.target.closest("button")) event.preventDefault(); };
      panel.onclick = function (event) { var button = event.target.closest("[data-table-action]"); if (button) modify(button.dataset.tableAction); };
      panel.onchange = function (event) {
        var input = event.target, cell = active.cell;
        if (!cell || !body.contains(cell)) return;
        var value = Number(input.value);
        if (!Number.isFinite(value)) return;
        value = Math.round(Math.max(Number(input.min), Math.min(Number(input.max), value)));
        input.value = value;
        if (input.hasAttribute("data-table-width")) { cell.closest("table").dataset.tableWidth = value; cell.closest("table").style.width = value + "%"; }
        if (input.hasAttribute("data-cell-width")) { cell.dataset.cellWidth = value; cell.style.width = value + "px"; }
        if (input.hasAttribute("data-row-height")) { cell.parentElement.dataset.rowHeight = value; cell.parentElement.style.height = value + "px"; }
        changed();
      };
    }
  };
}());

