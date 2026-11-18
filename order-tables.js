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
  }
  function sync() {
    if (!active || !active.dialog.open) return;
    if (active.panel.contains(document.activeElement)) return;
    var selection = window.getSelection(), node = selection.anchorNode;
    if (node && node.nodeType !== 1) node = node.parentElement;
    var cell = node && node.closest && node.closest("td,th");
    if (!cell || !active.body.contains(cell)) {
      if (!active.panel.contains(document.activeElement)) active.panel.hidden = true;
      return;
    }
    active.cell = cell; active.panel.hidden = false;
    active.panel.querySelector("[data-table-width]").value = cell.closest("table").dataset.tableWidth || 100;
    active.panel.querySelector("[data-row-height]").value = cell.parentElement.dataset.rowHeight || 40;
    active.panel.querySelector("[data-cell-width]").value = cell.dataset.cellWidth || 150;
  }
  document.addEventListener("selectionchange", sync);
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
      active = { dialog: dialog, body: body, panel: panel, cell: null, changed: changed };
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

