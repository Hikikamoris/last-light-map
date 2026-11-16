/* RP wall, master-only player aliases, and audience-restricted map markers. */
(function () {
  function encodeMarkerDesign(shapes) {
    if (!Array.isArray(shapes)) return "v1:";
    var allowed = { c: 1, s: 1, l: 1, t: 1, d: 1, x: 1 };
    return "v1:" + shapes.slice(0, 5).map(function (shape) {
      var type = allowed[shape.t] ? shape.t : "c";
      var x = Math.max(0, Math.min(35, Math.round((Number(shape.x) || 0) * 35 / 100)));
      var y = Math.max(0, Math.min(35, Math.round((Number(shape.y) || 0) * 35 / 100)));
      var size = Math.max(3, Math.min(18, Math.round(Number(shape.s) || 10)));
      var rotation = Math.max(0, Math.min(3, Math.round(Number(shape.r) || 0)));
      return type + x.toString(36) + y.toString(36) + size.toString(36) + rotation.toString(36);
    }).join("");
  }

  function decodeMarkerDesign(symbol) {
    symbol = String(symbol || "");
    if (symbol.indexOf("v1:") !== 0) return null;
    var body = symbol.slice(3), allowed = { c: 1, s: 1, l: 1, t: 1, d: 1, x: 1 };
    if (!body || body.length > 25 || body.length % 5) return null;
    var shapes = [];
    for (var i = 0; i < body.length; i += 5) {
      var part = body.slice(i, i + 5), type = part.charAt(0);
      var x = parseInt(part.charAt(1), 36), y = parseInt(part.charAt(2), 36);
      var size = parseInt(part.charAt(3), 36), rotation = parseInt(part.charAt(4), 36);
      if (!allowed[type] || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(size) || !Number.isFinite(rotation) || x > 35 || y > 35 || size < 3 || size > 18 || rotation > 3) return null;
      shapes.push({ t: type, x: Math.round(x * 100 / 35), y: Math.round(y * 100 / 35), s: size, r: rotation });
    }
    return shapes;
  }

  function normalizeStudioShape(shape) {
    if (!shape || typeof shape !== "object") return null;
    var type = String(shape.t || ""), allowed = { c: 1, s: 1, l: 1, t: 1, d: 1, x: 1, L: 1, p: 1, e: 1 };
    if (!allowed[type]) return null;
    function coord(value) { return Math.max(0, Math.min(100, Math.round(Number(value) || 0))); }
    var out = { t: type, s: Math.max(1, Math.min(18, Math.round(Number(shape.s) || 4))), fill: !!shape.fill };
    if (type === "p" || type === "e") {
      if (!Array.isArray(shape.points) || shape.points.length < 2) return null;
      out.points = shape.points.slice(0, 240).map(function (point) { return { x: coord(point.x), y: coord(point.y) }; });
      return out.points.length >= 2 ? out : null;
    }
    if (type === "L") {
      out.x1 = coord(shape.x1); out.y1 = coord(shape.y1); out.x2 = coord(shape.x2); out.y2 = coord(shape.y2);
      return out;
    }
    out.x = coord(shape.x); out.y = coord(shape.y);
    out.s = Math.max(3, Math.min(18, Math.round(Number(shape.s) || 10)));
    out.r = Math.max(0, Math.min(7, Math.round(Number(shape.r) || 0)));
    return out;
  }

  function parseStudioDesign(value) {
    try {
      var raw = typeof value === "string" ? JSON.parse(value) : value;
      if (!raw || raw.v !== 1 || !Array.isArray(raw.shapes) || raw.shapes.length > 20) return null;
      var shapes = raw.shapes.map(normalizeStudioShape);
      return shapes.every(Boolean) ? shapes : null;
    } catch (error) { return null; }
  }

  function serializeStudioDesign(shapes) {
    if (!Array.isArray(shapes) || shapes.length > 20) return "";
    var clean = shapes.map(normalizeStudioShape);
    if (!clean.every(Boolean)) return "";
    return JSON.stringify({ v: 1, shapes: clean });
  }

  function packStudioShapes(shapes) {
    if (!Array.isArray(shapes) || shapes.length > 20) return null;
    function c2(value) { return Math.max(0, Math.min(100, Math.round(Number(value) || 0))).toString(36).padStart(2, "0"); }
    function c1(value) { return Math.max(1, Math.min(18, Math.round(Number(value) || 4))).toString(36); }
    var paths = shapes.filter(function (shape) { return shape.t === "p" || shape.t === "e"; });
    var pathBudget = 80, output = "";
    shapes.forEach(function (shape) {
      if (shape.t === "p" || shape.t === "e") {
        var remainingPaths = paths.length;
        var maxPoints = Math.max(2, Math.floor(pathBudget / remainingPaths));
        var points = shape.points;
        if (points.length > maxPoints) {
          var reduced = [];
          for (var i = 0; i < maxPoints; i++) reduced.push(points[Math.round(i * (points.length - 1) / (maxPoints - 1))]);
          points = reduced;
        }
        pathBudget -= points.length; paths.shift();
        output += shape.t + c1(shape.s) + points.length.toString(36).padStart(2, "0") + points.map(function (point) { return c2(point.x) + c2(point.y); }).join("");
        return;
      }
      if (shape.t === "L") { output += "L" + c2(shape.x1) + c2(shape.y1) + c2(shape.x2) + c2(shape.y2) + c1(shape.s); return; }
      var flags = (shape.r || 0) + (shape.fill ? 8 : 0);
      output += shape.t + c2(shape.x) + c2(shape.y) + c1(shape.s) + flags.toString(36);
    });
    return output;
  }

  function unpackStudioShapes(source) {
    var output = [], i = 0;
    function read2() { var value = parseInt(source.slice(i, i + 2), 36); i += 2; return value; }
    function read1() { var value = parseInt(source.charAt(i), 36); i += 1; return value; }
    while (i < source.length && output.length <= 20) {
      var type = source.charAt(i++), item;
      if (type === "p" || type === "e") {
        var width = read1(), count = parseInt(source.slice(i, i + 2), 36); i += 2;
        if (!Number.isFinite(width) || !Number.isFinite(count) || count < 2 || count > 80 || i + count * 4 > source.length) return null;
        item = { t: type, s: width, fill: false, points: [] };
        for (var p = 0; p < count; p++) item.points.push({ x: read2(), y: read2() });
      } else if (type === "L") {
        item = { t: "L", x1: read2(), y1: read2(), x2: read2(), y2: read2(), s: read1(), fill: false };
      } else if ({ c: 1, s: 1, l: 1, t: 1, d: 1, x: 1 }[type]) {
        var x = read2(), y = read2(), size = read1(), flags = read1();
        if (!Number.isFinite(flags) || flags > 15) return null;
        item = { t: type, x: x, y: y, s: size, r: flags % 8, fill: flags >= 8 };
      } else return null;
      if (!Number.isFinite(item.s) || item.s < 1 || item.s > 18) return null;
      output.push(item);
    }
    return i === source.length && output.length <= 20 ? output : null;
  }

  function packMarkerDescription(description, design) {
    var shapes = parseStudioDesign(design);
    if (!shapes || !shapes.length) return String(description || "").slice(0, 1000);
    var packed = packStudioShapes(shapes);
    if (packed === null) throw new Error("В рисунке слишком много точек. Упростите несколько линий и попробуйте ещё раз.");
    var prefix = "LLD1:" + "00" + ":";
    var maxDescription = Math.max(0, Math.min(450, 1000 - prefix.length - packed.length));
    var text = String(description || "").trim().slice(0, maxDescription);
    if (window.TextEncoder) {
      var encoder = new TextEncoder(), byteLimit = Math.max(0, 1000 - packed.length - prefix.length);
      while (text && encoder.encode(text).length > byteLimit) text = Array.from(text).slice(0, -1).join("");
    }
    return "LLD1:" + text.length.toString(36).padStart(2, "0") + ":" + text + packed;
  }

  function unpackMarkerDescription(value) {
    var raw = String(value || "");
    if (raw.indexOf("LLD1:") !== 0 || raw.charAt(7) !== ":") return { description: raw, shapes: null };
    var length = parseInt(raw.slice(5, 7), 36);
    if (!Number.isFinite(length) || length < 0 || length > 1000 || 8 + length > raw.length) return { description: raw, shapes: null };
    var description = raw.slice(8, 8 + length), shapes = unpackStudioShapes(raw.slice(8 + length));
    return shapes ? { description: description, shapes: shapes } : { description: raw, shapes: null };
  }

  function studioSnapshot() {
    return JSON.stringify({ name: studioState.name, title: studioState.title, description: studioState.description, color: studioState.color, caption: studioState.caption, shapes: studioState.shapes });
  }

  function commitStudioHistory() {
    if (!studioHistoryBaseline) { studioHistoryBaseline = studioSnapshot(); return; }
    var current = studioSnapshot();
    if (current === studioHistoryBaseline) return;
    studioUndo.push(studioHistoryBaseline);
    if (studioUndo.length > 60) studioUndo.shift();
    studioRedo = [];
    studioHistoryBaseline = current;
  }

  function restoreStudioHistory(snapshot) {
    try {
      var restored = JSON.parse(snapshot), shapes = parseStudioDesign({ v: 1, shapes: restored.shapes });
      if (!shapes) return false;
      studioState.name = restored.name; studioState.title = restored.title; studioState.description = restored.description;
      studioState.color = validPrivateColor(restored.color); studioState.caption = restored.caption; studioState.shapes = shapes; studioState.selected = -1;
      studioHistoryBaseline = studioSnapshot(); studioTool = ""; renderMarkerStudio(); return true;
    } catch (error) { return false; }
  }

  function stepStudioHistory(direction) {
    commitStudioHistory();
    var source = direction === "undo" ? studioUndo : studioRedo;
    var destination = direction === "undo" ? studioRedo : studioUndo;
    if (!source.length) return;
    destination.push(studioSnapshot());
    restoreStudioHistory(source.pop());
  }

  function rotateStudioShape(shape, direction) {
    if (!shape || shape.t === "e") return;
    var radians = (direction < 0 ? -1 : 1) * Math.PI / 4;
    if (shape.t === "L") {
      var cx = (shape.x1 + shape.x2) / 2, cy = (shape.y1 + shape.y2) / 2;
      [["x1", "y1"], ["x2", "y2"]].forEach(function (keys) {
        var dx = shape[keys[0]] - cx, dy = shape[keys[1]] - cy;
        shape[keys[0]] = Math.max(0, Math.min(100, cx + dx * Math.cos(radians) - dy * Math.sin(radians)));
        shape[keys[1]] = Math.max(0, Math.min(100, cy + dx * Math.sin(radians) + dy * Math.cos(radians)));
      });
      return;
    }
    if (shape.t === "p") {
      var minX = 100, minY = 100, maxX = 0, maxY = 0;
      shape.points.forEach(function (point) { minX = Math.min(minX, point.x); minY = Math.min(minY, point.y); maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y); });
      var centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
      shape.points.forEach(function (point) {
        var dx = point.x - centerX, dy = point.y - centerY;
        point.x = Math.max(0, Math.min(100, centerX + dx * Math.cos(radians) - dy * Math.sin(radians)));
        point.y = Math.max(0, Math.min(100, centerY + dx * Math.sin(radians) + dy * Math.cos(radians)));
      });
      return;
    }
    shape.r = ((Number(shape.r) || 0) + (direction < 0 ? 7 : 1)) % 8;
  }

  function moveStudioShape(shape, dx, dy) {
    function shift(value) { return Math.max(3, Math.min(97, Math.round(value))); }
    if (shape.t === "p" || shape.t === "e") { shape.points.forEach(function (point) { point.x = shift(point.x + dx); point.y = shift(point.y + dy); }); return; }
    if (shape.t === "L") { shape.x1 = shift(shape.x1 + dx); shape.y1 = shift(shape.y1 + dy); shape.x2 = shift(shape.x2 + dx); shape.y2 = shift(shape.y2 + dy); return; }
    shape.x = shift(shape.x + dx); shape.y = shift(shape.y + dy);
  }

  function markerDesignSvg(symbol, size) {
    var shapes = decodeMarkerDesign(symbol);
    if (!shapes) return "";
    size = Math.max(12, Math.min(48, Number(size) || 17));
    return studioShapesSvgMarkup(shapes, "currentColor", size, -1);
  }

  function markerDesignShapesSvg(shapes, color, size) {
    if (!Array.isArray(shapes) || !shapes.length) return "";
    return studioShapesSvgMarkup(shapes, color || "currentColor", Math.max(12, Math.min(48, Number(size) || 17)), -1);
  }

  function studioShapeMarkup(shape, color, index, selected) {
    if (shape.t === "e") return "";
    var x = Math.round(Number(shape.x) || 0), y = Math.round(Number(shape.y) || 0), s = Math.max(1, Math.min(22, Number(shape.s) || 4));
    var angle = (Number(shape.r) || 0) * 45, width = shape.t === "p" || shape.t === "L" ? s : Math.max(1, s / 3);
    var attrs = (index >= 0 ? 'data-studio-shape="' + index + '" ' : "") + 'fill="' + (shape.fill && shape.t !== "p" && shape.t !== "L" ? color : "none") + '" stroke="' + color + '" stroke-width="' + (selected ? Math.max(width, 4) : width) + '" stroke-linecap="round" stroke-linejoin="round"';
    var transform = angle ? ' transform="rotate(' + angle + ' ' + x + ' ' + y + ')"' : "";
    if (shape.t === "c") return '<circle ' + attrs + ' cx="' + x + '" cy="' + y + '" r="' + s + '"></circle>';
    if (shape.t === "s") return '<rect ' + attrs + ' x="' + (x - s) + '" y="' + (y - s) + '" width="' + (s * 2) + '" height="' + (s * 2) + '" rx="2"' + transform + '></rect>';
    if (shape.t === "l") { var dx = Math.round(s * Math.cos(angle * Math.PI / 180)), dy = Math.round(s * Math.sin(angle * Math.PI / 180)); return '<line ' + attrs + ' x1="' + (x - dx) + '" y1="' + (y - dy) + '" x2="' + (x + dx) + '" y2="' + (y + dy) + '"></line>'; }
    if (shape.t === "L") { var cx = (Number(shape.x1) + Number(shape.x2)) / 2, cy = (Number(shape.y1) + Number(shape.y2)) / 2; return '<line ' + attrs + ' x1="' + Math.round(shape.x1) + '" y1="' + Math.round(shape.y1) + '" x2="' + Math.round(shape.x2) + '" y2="' + Math.round(shape.y2) + '"' + (angle ? ' transform="rotate(' + angle + ' ' + cx + ' ' + cy + ')"' : "") + '></line>'; }
    if (shape.t === "p") {
      var minX = 100, minY = 100, maxX = 0, maxY = 0;
      shape.points.forEach(function (point) { minX = Math.min(minX, point.x); minY = Math.min(minY, point.y); maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y); });
      var pathTransform = angle ? ' transform="rotate(' + angle + ' ' + ((minX + maxX) / 2) + ' ' + ((minY + maxY) / 2) + ')"' : "";
      return '<path ' + attrs + ' d="' + shape.points.map(function (point, i) { return (i ? "L" : "M") + Math.round(point.x) + " " + Math.round(point.y); }).join(" ") + '"' + pathTransform + '></path>';
    }
    if (shape.t === "t") return '<polygon ' + attrs + ' points="' + x + ',' + (y - s) + ' ' + (x + s) + ',' + (y + s) + ' ' + (x - s) + ',' + (y + s) + '"' + transform + '></polygon>';
    if (shape.t === "d") return '<polygon ' + attrs + ' points="' + x + ',' + (y - s) + ' ' + (x + s) + ',' + y + ' ' + x + ',' + (y + s) + ' ' + (x - s) + ',' + y + '"' + transform + '></polygon>';
    return '<path ' + attrs + ' d="M' + (x - s) + ' ' + y + 'H' + (x + s) + 'M' + x + ' ' + (y - s) + 'V' + (y + s) + '"' + transform + '></path>';
  }

  var studioMaskSequence = 0;
  function studioShapesMarkup(shapes, color, selected) {
    var output = "", solids = [], erasers = [], sequence = ++studioMaskSequence;
    function flush() {
      if (!solids.length) { erasers = []; return; }
      var content = solids.map(function (item) { return studioShapeMarkup(item.shape, color, item.index, item.index === selected); }).join("");
      if (erasers.length) {
        var id = "ll-erase-" + sequence + "-" + solids[0].index;
        var erasePaths = erasers.map(function (erase) {
          var d = erase.points.map(function (point, index) { return (index ? "L" : "M") + Math.round(point.x) + " " + Math.round(point.y); }).join(" ");
          return '<path d="' + d + '" fill="none" stroke="black" stroke-width="' + Math.max(1, Math.min(18, Number(erase.s) || 4)) + '" stroke-linecap="round" stroke-linejoin="round"></path>';
        }).join("");
        output += '<defs><mask id="' + id + '" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100" style="mask-type:luminance"><rect x="0" y="0" width="100" height="100" fill="white"></rect>' + erasePaths + '</mask></defs><g mask="url(#' + id + ')">' + content + '</g>';
      } else output += content;
      solids = []; erasers = [];
    }
    (shapes || []).forEach(function (shape, index) {
      if (shape.t === "e") { if (solids.length) erasers.push(shape); return; }
      if (erasers.length && solids.length) flush();
      solids.push({ shape: shape, index: index });
    });
    flush();
    return output;
  }

  function studioShapesSvgMarkup(shapes, color, size, selected) {
    size = Math.max(12, Math.min(460, Number(size) || 17));
    return '<svg viewBox="0 0 100 100" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + studioShapesMarkup(shapes, color, selected) + '</svg>';
  }
  function validPrivateColor(color) { return /^#[0-9a-f]{6}$/i.test(String(color || "")) ? String(color) : "#e2b94a"; }

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
  var PRIVATE_DESIGNS_KEY = "lastlight-private-marker-templates-v1";
  var privateForm = { title: "Личная метка", description: "", symbol: "post", design: "", color: "#e2b94a", caption: "", visibleTo: [], preset: "standard" };
  var privatePresets = [
    { id: "standard", name: "Стандарт", title: "Личная метка", description: "", symbol: encodeMarkerDesign([{ t: "d", x: 50, y: 48, s: 14 }, { t: "c", x: 50, y: 48, s: 4 }]), color: "#e2b94a", caption: "" },
    { id: "radio", name: "Радио", title: "Радиосвязь", description: "Радиопереговоры или сигнал связи.", symbol: encodeMarkerDesign([{ t: "c", x: 50, y: 50, s: 4 }, { t: "l", x: 50, y: 50, s: 14, r: 1 }, { t: "l", x: 50, y: 50, s: 14, r: 3 }]), color: "#4f9fe0", caption: "РАДИО" },
    { id: "shelter", name: "Укрытие", title: "Укрытие", description: "Безопасное место или временное убежище.", symbol: encodeMarkerDesign([{ t: "t", x: 50, y: 49, s: 15 }, { t: "l", x: 50, y: 59, s: 9 }]), color: "#4caf50", caption: "УКРЫТИЕ" },
    { id: "danger", name: "Опасность", title: "Опасность", description: "Место с угрозой или ограниченным доступом.", symbol: encodeMarkerDesign([{ t: "d", x: 50, y: 50, s: 16 }, { t: "x", x: 50, y: 50, s: 8 }]), color: "#e0261a", caption: "ОПАСНО" },
    { id: "resources", name: "Ресурсы", title: "Ресурсы", description: "Место с припасами или материалами.", symbol: encodeMarkerDesign([{ t: "s", x: 50, y: 50, s: 13 }, { t: "c", x: 50, y: 50, s: 5 }]), color: "#e2b94a", caption: "РЕСУРСЫ" },
    { id: "medical", name: "Медицина", title: "Медицина", description: "Медицинская помощь или запасы.", symbol: encodeMarkerDesign([{ t: "c", x: 50, y: 50, s: 14 }, { t: "x", x: 50, y: 50, s: 8 }]), color: "#4caf50", caption: "МЕД" }
  ];
  privatePresets.forEach(function (preset) { preset.design = serializeStudioDesign(decodeMarkerDesign(preset.symbol) || []); });
  privateForm.symbol = privatePresets[0].symbol;
  privateForm.design = privatePresets[0].design;
  var studioState = { id: "standard", name: "Стандарт", title: "Личная метка", description: "", symbol: privatePresets[0].symbol, color: privatePresets[0].color, caption: "", shapes: decodeMarkerDesign(privatePresets[0].symbol) || [], selected: -1 };
  var studioTool = "";
  var studioFill = false;
  var studioBrushSize = 4;
  var studioEraserSize = 8;
  var studioDrag = null;
  var studioUndo = [];
  var studioRedo = [];
  var studioHistoryBaseline = "";
  studioHistoryBaseline = studioSnapshot();
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
  var privateDesignStyle = document.createElement("style");
  privateDesignStyle.textContent = ".private-form-note{font-size:12px;line-height:1.5;color:var(--mu);margin:8px 0}.private-template-preview{display:flex;align-items:center;gap:10px;padding:8px;margin:8px 0;border:1px dashed var(--bd);border-radius:9px;background:#12140f}.private-template-preview .pin-wrap{flex:0 0 30px}.private-template-copy{min-width:0}.private-template-copy b,.private-template-copy small{display:block}.private-template-copy small{color:var(--mu);font-size:11px;margin-top:3px}.marker-studio{height:100%;overflow:auto;padding:20px;max-width:1250px;margin:0 auto}.marker-studio>p{color:var(--mu);max-width:760px;line-height:1.55}.marker-studio-grid{display:grid;grid-template-columns:minmax(280px,350px) minmax(360px,1fr);gap:14px;align-items:start}.marker-studio-controls,.marker-studio-work{min-width:0}.marker-studio-preset-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin:8px 0 14px}.marker-studio-preset{display:flex;align-items:center;gap:7px;min-width:0;text-align:left;padding:6px;min-height:48px}.marker-studio-preset.on{border-color:var(--gd);color:var(--gd)}.marker-studio-preset__icon{flex:0 0 30px;width:30px;height:30px;overflow:hidden}.marker-studio-preset__icon .pin-wrap{transform:scale(.88);transform-origin:left top}.marker-studio .fi{margin:8px 0}.marker-studio .fi input,.marker-studio .fi textarea{width:100%}.marker-studio-tools{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}.marker-studio-tools button.on{border-color:var(--gd);color:var(--gd);background:#242216}.marker-studio-canvas-wrap{width:min(100%,460px);aspect-ratio:1;margin:10px auto 14px;padding:12px;border:1px solid var(--bd);border-radius:14px;background:radial-gradient(circle at 50% 42%,#25261d,#11130f 70%);touch-action:none}.marker-studio-canvas{display:block;width:100%;height:100%;overflow:visible;touch-action:none}.marker-studio-canvas [data-studio-shape]{cursor:move}.marker-studio-selection{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.marker-studio-selection input[type=range]{width:110px}.marker-studio-selection>label{display:flex;align-items:center;gap:6px}.marker-studio-selection input[type=checkbox]{width:auto}.marker-studio-selection button:disabled{opacity:.45}.marker-studio-preview{display:flex;align-items:center;gap:12px;padding:10px;border-radius:10px;background:#12140f;border:1px dashed var(--bd)}.marker-studio-preview .pin-wrap{transform:scale(1.25);transform-origin:left center;flex:0 0 40px}.marker-studio-preview b,.marker-studio-preview small{display:block}.marker-studio-preview small{color:var(--mu);margin-top:3px}.marker-studio-saved{display:grid;gap:5px;margin:8px 0}.marker-studio-saved-row{display:flex;align-items:center;gap:6px}.marker-studio-saved-row>[data-studio-load]{flex:1;text-align:left}.marker-studio-note{font-size:11px;line-height:1.45;color:var(--mu);margin:8px 0}@media(max-width:780px){.marker-studio{padding:12px}.marker-studio-grid{grid-template-columns:1fr}.marker-studio-canvas-wrap{width:min(100%,360px)}}";
  document.head.appendChild(privateDesignStyle);

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
    var color = validPrivateColor(marker.color), packed = unpackMarkerDescription(marker.description);
    var custom = markerDesignShapesSvg(packed.shapes || parseStudioDesign(marker.design), color, 17) || markerDesignSvg(marker.symbol, 17);
    if (custom) {
      var caption = String(marker.caption || "").trim().slice(0, 48);
      return L.divIcon({ className: "", html: '<div class="pin-wrap"><div class="pin" style="--pin-color:' + color + '">' + custom + '</div>' + (caption ? '<span class="pin-caption">' + esc(caption) + '</span>' : "") + '</div>', iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -14] });
    }
    var p = { t: TYPES[marker.symbol] ? marker.symbol : "post", c: color, caption: marker.caption || "" };
    return markerIconForPoint(p, 17);
  }

  function privatePopup(marker) {
    var packed = unpackMarkerDescription(marker.description);
    var custom = markerDesignShapesSvg(packed.shapes || parseStudioDesign(marker.design), validPrivateColor(marker.color), 18) || markerDesignSvg(marker.symbol, 18);
    var glyph = custom || ico(TYPES[marker.symbol] ? marker.symbol : "post", 15);
    var html = '<div class="pp"><div class="ph2"><span class="li" style="color:' + validPrivateColor(marker.color) + '">' + glyph + '</span><div><b>' + esc(marker.title || "Личная метка") + '</b><small>Видно выбранным игрокам</small></div></div>' + (packed.description ? '<p>' + esc(packed.description) + "</p>" : "");
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

  function privateTemplates() { return privatePresets.concat(loadCustomMarkerTemplates()); }

  function loadCustomMarkerTemplates() {
    try {
      var saved = JSON.parse(localStorage.getItem(PRIVATE_DESIGNS_KEY) || "[]");
      if (!Array.isArray(saved)) return [];
      return saved.slice(0, 30).filter(function (item) {
        return item && /^custom-[a-z0-9-]{1,40}$/i.test(String(item.id || "")) && (parseStudioDesign(item.design) || decodeMarkerDesign(item.symbol)) && /^#[0-9a-f]{6}$/i.test(String(item.color || ""));
      }).map(function (item) {
        var shapes = parseStudioDesign(item.design) || decodeMarkerDesign(item.symbol) || [];
        return { id: String(item.id), name: String(item.name || "Свой шаблон").slice(0, 48), title: String(item.title || "Личная метка").slice(0, 100), description: String(item.description || "").slice(0, 1000), symbol: String(item.symbol || "post"), design: serializeStudioDesign(shapes), color: validPrivateColor(item.color), caption: String(item.caption || "").slice(0, 48) };
      });
    } catch (error) { return []; }
  }

  function applyPrivateTemplate(template) {
    if (!template) return;
    privateForm.preset = template.id;
    privateForm.title = template.title || template.name || "Личная метка";
    privateForm.description = template.description || "";
    privateForm.symbol = template.symbol || "post";
    privateForm.design = template.design || serializeStudioDesign(decodeMarkerDesign(template.symbol) || []);
    privateForm.color = validPrivateColor(template.color);
    privateForm.caption = template.caption || "";
  }

  function privateTemplatePreview(template) {
    var icon = privateIcon(template).options.html;
    return '<div class="private-template-preview"><span>' + icon + '</span><span class="private-template-copy"><b>' + esc(template.name) + '</b><small>' + esc(template.description || (template.caption ? "Подпись на карте: " + template.caption : "Без короткой подписи")) + '</small></span></div>';
  }

  function studioMarkup() {
    var templates = privatePresets.concat(loadCustomMarkerTemplates());
    var presetCards = templates.map(function (item) {
      return '<button type="button" class="marker-studio-preset ' + (studioState.id === item.id ? "on" : "") + '" data-studio-preset="' + esc(item.id) + '"><span class="marker-studio-preset__icon">' + privateIcon(item).options.html + '</span><span>' + esc(item.name) + '</span></button>';
    }).join("");
    var saved = loadCustomMarkerTemplates();
    var savedHtml = saved.length ? saved.map(function (item) { return '<div class="marker-studio-saved-row"><button type="button" data-studio-load="' + esc(item.id) + '">' + esc(item.name) + '</button><button type="button" data-studio-remove="' + esc(item.id) + '" aria-label="Удалить шаблон">×</button></div>'; }).join("") : '<div class="marker-studio-note">Сохранённые шаблоны появятся здесь.</div>';
    var selected = studioState.selected >= 0 ? studioState.shapes[studioState.selected] : null;
    var design = serializeStudioDesign(studioState.shapes);
    var legacy = encodeMarkerDesign(studioState.shapes);
    return '<div class="marker-studio"><div class="eb">МАСТЕРСКАЯ · LAST LIGHT</div><h1>Редактор значков</h1><p>Соберите значок из фигур или рисуйте мышью и пальцем. Кисть рисует, ластик стирает части рисунка, а выбранные фигуры можно поворачивать. Шаблоны сохраняются в этом браузере.</p><div class="marker-studio-grid"><div class="card marker-studio-controls"><h3>Готовые шаблоны</h3><div class="marker-studio-preset-grid">' + presetCards + '</div><label class="fi">Название шаблона<input data-studio-field="name" maxlength="48" value="' + esc(studioState.name) + '"></label><label class="fi">Заголовок метки<input data-studio-field="title" maxlength="100" value="' + esc(studioState.title) + '"></label><label class="fi">Цвет<input type="color" data-studio-field="color" value="' + esc(validPrivateColor(studioState.color)) + '"></label><label class="fi">Короткая надпись на карте<input data-studio-field="caption" maxlength="48" value="' + esc(studioState.caption) + '" placeholder="Например: РАДИО"></label><label class="fi">Описание<textarea data-studio-field="description" rows="3" maxlength="1000">' + esc(studioState.description) + '</textarea></label><div style="display:flex;gap:7px;flex-wrap:wrap"><button class="pr" type="button" data-studio-save>Сохранить шаблон</button><button type="button" data-studio-use>Сохранить и выбрать</button></div><div class="marker-studio-note">После выбора шаблона редактор карты откроется на личной метке, где можно указать получателей. Сам значок синхронизируется вместе с меткой.</div><h3 style="margin-top:18px">Мои шаблоны</h3><div class="marker-studio-saved">' + savedHtml + '</div></div><div class="card marker-studio-work"><h3>Рабочая область</h3><div class="marker-studio-tools"><button type="button" data-studio-tool="c" class="' + (studioTool === "c" ? "on" : "") + '">Круг</button><button type="button" data-studio-tool="s" class="' + (studioTool === "s" ? "on" : "") + '">Квадрат</button><button type="button" data-studio-tool="l" class="' + (studioTool === "l" ? "on" : "") + '">Палочка</button><button type="button" data-studio-tool="t" class="' + (studioTool === "t" ? "on" : "") + '">Треугольник</button><button type="button" data-studio-tool="d" class="' + (studioTool === "d" ? "on" : "") + '">Ромб</button><button type="button" data-studio-tool="x" class="' + (studioTool === "x" ? "on" : "") + '">Крест</button><button type="button" data-studio-tool="L" class="' + (studioTool === "L" ? "on" : "") + '">Прямая линия</button><button type="button" data-studio-tool="p" class="' + (studioTool === "p" ? "on" : "") + '">Кисть</button><button type="button" data-studio-tool="e" class="' + (studioTool === "e" ? "on" : "") + '">Ластик</button></div><div class="marker-studio-canvas-wrap"><svg id="marker-design-canvas" class="marker-studio-canvas" viewBox="0 0 100 100" role="img" aria-label="Поле сборки значка"></svg></div><div class="marker-studio-selection"><button type="button" data-studio-history="undo" ' + (!studioUndo.length ? "disabled" : "") + ' title="Отменить последнее изменение">↶ Назад</button><button type="button" data-studio-history="redo" ' + (!studioRedo.length ? "disabled" : "") + ' title="Повторить отменённое изменение">↷ Вперёд</button><span data-studio-selection style="flex:1">Выберите фигуру или инструмент.</span><button type="button" data-studio-rotate="-1" title="Повернуть против часовой стрелки">↶ Повернуть влево</button><button type="button" data-studio-rotate="1" title="Повернуть по часовой стрелке">↷ Повернуть вправо</button></div><div class="marker-studio-selection"><label>Кисть <input type="range" id="studio-brush-size" min="1" max="18" value="' + studioBrushSize + '" aria-label="Толщина кисти"></label><span data-studio-brush-value>' + studioBrushSize + '</span><label>Ластик <input type="range" id="studio-eraser-size" min="1" max="18" value="' + studioEraserSize + '" aria-label="Размер ластика"></label><span data-studio-eraser-value>' + studioEraserSize + '</span><label><input type="checkbox" data-studio-fill ' + (studioFill ? "checked" : "") + ' style="width:auto"> Заливка новых фигур</label></div><div class="marker-studio-selection"><label>Размер фигуры <input type="range" id="studio-shape-size" min="3" max="18" value="' + (selected ? selected.s : 10) + '" ' + (!selected ? "disabled" : "") + '></label><button type="button" data-studio-fill-selected ' + (!selected || selected.t === "p" || selected.t === "L" ? "disabled" : "") + '>' + (selected && selected.fill ? "Убрать заливку" : "Залить фигуру") + '</button><button type="button" data-studio-delete ' + (!selected ? "disabled" : "") + '>Удалить фигуру</button></div><div class="marker-studio-preview" style="margin-top:14px">' + privateIcon({ design: design, symbol: legacy, color: studioState.color, caption: studioState.caption }).options.html + '<span><b data-studio-preview-title>' + esc(studioState.title || "Личная метка") + '</b><small data-studio-preview-caption>' + esc(studioState.caption || "Без подписи на карте") + '</small></span></div></div></div></div>';
  }

  function renderStudioCanvas() {
    var svg = document.getElementById("marker-design-canvas");
    if (!svg) return;
    var color = validPrivateColor(studioState.color);
    var html = '<circle cx="50" cy="50" r="46" fill="#14150f" stroke="' + color + '" stroke-width="3"></circle>';
    html += studioShapesMarkup(studioState.shapes, color, studioState.selected);
    svg.innerHTML = html;
    var selection = document.querySelector("[data-studio-selection]"), slider = document.getElementById("studio-shape-size");
    var selected = studioState.selected >= 0 ? studioState.shapes[studioState.selected] : null;
    if (selection) selection.textContent = selected ? "Фигура " + (studioState.selected + 1) + " выбрана · перетащите её" : studioTool === "e" ? "Проведите ластиком по рисунку, чтобы стереть его части" : studioTool === "p" ? "Рисуйте по полю, удерживая кнопку мыши или касаясь экрана" : studioTool === "L" ? "Потяните по полю, чтобы провести прямую линию" : studioTool ? "Щёлкните или потяните по полю, чтобы добавить фигуру" : "Выберите фигуру или инструмент.";
    if (slider) { slider.disabled = !selected; if (selected) slider.value = selected.s; }
    var brush = document.getElementById("studio-brush-size"); if (brush) brush.value = studioBrushSize;
    var eraser = document.getElementById("studio-eraser-size"); if (eraser) eraser.value = studioEraserSize;
    var eraserValue = document.querySelector("[data-studio-eraser-value]"); if (eraserValue) eraserValue.textContent = studioEraserSize;
    var fill = document.querySelector("[data-studio-fill]"); if (fill) fill.checked = studioFill;
    var del = document.querySelector("[data-studio-delete]"); if (del) del.disabled = !selected;
    var fillSelected = document.querySelector("[data-studio-fill-selected]");
    if (fillSelected) { fillSelected.disabled = !selected || selected.t === "p" || selected.t === "L" || selected.t === "e"; fillSelected.textContent = selected && selected.fill ? "Убрать заливку" : "Залить фигуру"; }
    document.querySelectorAll("[data-studio-rotate]").forEach(function (button) { button.disabled = !selected || selected.t === "e"; });
    var undo = document.querySelector('[data-studio-history="undo"]'), redo = document.querySelector('[data-studio-history="redo"]');
    if (undo) undo.disabled = !studioUndo.length;
    if (redo) redo.disabled = !studioRedo.length;
    var preview = document.querySelector(".marker-studio-preview");
    if (preview) preview.innerHTML = privateIcon({ design: serializeStudioDesign(studioState.shapes), symbol: encodeMarkerDesign(studioState.shapes), color: color, caption: studioState.caption }).options.html + '<span><b data-studio-preview-title>' + esc(studioState.title || "Личная метка") + '</b><small data-studio-preview-caption>' + esc(studioState.caption || "Без подписи на карте") + '</small></span>';
  }

  function renderMarkerStudio() {
    var root = document.getElementById("marker-studio-app");
    if (!root || !isMasterNow()) return;
    root.innerHTML = studioMarkup();
    renderStudioCanvas();
  }

  function loadStudioTemplate(template) {
    var shapes = parseStudioDesign(template.design) || decodeMarkerDesign(template.symbol);
    if (!shapes) return;
    studioState = { id: template.id, name: template.name || "Свой шаблон", title: template.title || template.name || "Личная метка", description: template.description || "", symbol: template.symbol || "post", color: validPrivateColor(template.color), caption: template.caption || "", shapes: shapes, selected: -1 };
    studioTool = "";
    studioUndo = []; studioRedo = []; studioHistoryBaseline = studioSnapshot();
    renderMarkerStudio();
  }

  function saveStudioTemplate() {
    if (!studioState.shapes.length) { toast("Сначала добавьте на эмблему хотя бы одну фигуру.", "error"); return null; }
    var name = String(studioState.name || "").trim().slice(0, 48);
    if (!name) { toast("Введите название шаблона.", "error"); return null; }
    var design = serializeStudioDesign(studioState.shapes);
    if (!design) { toast("Не удалось сохранить рисунок. Удалите несколько фигур или точек и попробуйте снова.", "error"); return null; }
    var symbol = encodeMarkerDesign(studioState.shapes);
    if (symbol.length > 32 || !decodeMarkerDesign(symbol)) symbol = "post";
    var saved = loadCustomMarkerTemplates(), id = /^custom-/.test(studioState.id) ? studioState.id : "custom-" + Date.now().toString(36);
    var item = { id: id, name: name, title: String(studioState.title || name).trim().slice(0, 100) || name, description: String(studioState.description || "").trim().slice(0, 1000), symbol: symbol, design: design, color: validPrivateColor(studioState.color), caption: String(studioState.caption || "").trim().slice(0, 48) };
    saved = saved.filter(function (old) { return old.id !== id; }); saved.unshift(item); saved = saved.slice(0, 30);
    try { localStorage.setItem(PRIVATE_DESIGNS_KEY, JSON.stringify(saved)); }
    catch (error) { toast("Шаблон не сохранился. Проверьте, что в браузере разрешено хранилище сайта.", "error", 8000); return null; }
    studioState.id = id;
    studioHistoryBaseline = studioSnapshot();
    return item;
  }
  function studioPoint(event, svg) {
    var point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
    var local = point.matrixTransform(svg.getScreenCTM().inverse());
    return { x: Math.max(5, Math.min(95, local.x)), y: Math.max(5, Math.min(95, local.y)) };
  }

  function drawPrivateEditorForm() {
    var panel = document.getElementById("einsp");
    if (!panel || TOOL !== "priv") return;
    var oldForm = panel.querySelector("[data-private-editor-section]");
    if (oldForm) oldForm.remove();
    var templates = privateTemplates();
    if (!templates.some(function (item) { return item.id === privateForm.preset; })) applyPrivateTemplate(privatePresets[0]);
    var selected = templates.filter(function (item) { return item.id === privateForm.preset; })[0] || privatePresets[0];
    var options = templates.map(function (item) { return '<option value="' + esc(item.id) + '" ' + (item.id === privateForm.preset ? "selected" : "") + '>' + esc(item.name) + '</option>'; }).join("");
    var marks = privateMarkers.length ? privateMarkers.map(function (m) {
      return '<div class="private-marker-row"><span>' + esc(m.title || "Личная метка") + '<small style="display:block;color:var(--mu)">' + (m.visibleTo || []).length + ' получ.</small></span><button data-private-delete="' + esc(m.id) + '">Удалить</button></div>';
    }).join("") : '<div style="color:var(--mu)">Пока нет личных меток.</div>';
    panel.insertAdjacentHTML("beforeend", '<div data-private-editor-section><h3>Личная метка игрокам</h3><div class="private-form-note">Выберите оформление и игроков, которым оно будет видно. Затем щёлкните по карте, чтобы поставить метку.</div><label class="fi">Шаблон оформления<select data-private-template>' + options + '</select></label>' + privateTemplatePreview(selected) + '<a href="#marker-studio" style="font-size:12px;color:var(--gd)">Создать или изменить шаблон → Редактор значков</a><div style="margin-top:14px"><b>Кому показывать</b><div class="audience-list" data-player-picker="private">' + playerRowsHtml("private", privateForm.visibleTo) + '</div></div><h3>Ваши личные метки</h3><div>' + marks + '</div></div>');
  }

  window.renderMarkerStudio = renderMarkerStudio;

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
          var packedDescription = packMarkerDescription(privateForm.description, privateForm.design);
          authApi().createPrivateMarker({
            x: sn(point.lng), y: sn(H - point.lat), title: privateForm.title, description: packedDescription,
            symbol: privateForm.symbol || "post", color: privateForm.color, caption: privateForm.caption, visibleTo: recipients
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

  document.getElementById("marker-studio-app").addEventListener("click", function (event) {
    var button = event.target.closest && event.target.closest("button");
    if (!button) return;
    var presetId = button.getAttribute("data-studio-preset");
    if (presetId) {
      var preset = privatePresets.concat(loadCustomMarkerTemplates()).filter(function (item) { return item.id === presetId; })[0];
      if (preset) loadStudioTemplate(preset);
      return;
    }
    var tool = button.getAttribute("data-studio-tool");
    if (tool) { studioTool = studioTool === tool ? "" : tool; renderMarkerStudio(); return; }
    if (button.hasAttribute("data-studio-save")) {
      var saved = saveStudioTemplate();
      if (saved) { renderMarkerStudio(); toast("Шаблон сохранён в этом браузере.", "ok"); }
      return;
    }
    if (button.hasAttribute("data-studio-use")) {
      var chosen = saveStudioTemplate();
      if (!chosen) return;
      applyPrivateTemplate(chosen);
      toast("Шаблон сохранён. Выберите игроков, затем поставьте метку на карте.", "ok", 7000);
      location.hash = "#editor";
      setTimeout(function () { if (typeof setT === "function") setT("priv"); }, 180);
      return;
    }
    var loadId = button.getAttribute("data-studio-load");
    if (loadId) {
      var savedTemplate = loadCustomMarkerTemplates().filter(function (item) { return item.id === loadId; })[0];
      if (savedTemplate) loadStudioTemplate(savedTemplate);
      return;
    }
    var removeId = button.getAttribute("data-studio-remove");
    if (removeId) {
      var remaining = loadCustomMarkerTemplates().filter(function (item) { return item.id !== removeId; });
      try { localStorage.setItem(PRIVATE_DESIGNS_KEY, JSON.stringify(remaining)); }
      catch (error) { toast("Не удалось удалить шаблон из хранилища браузера.", "error"); return; }
      if (studioState.id === removeId) loadStudioTemplate(privatePresets[0]); else renderMarkerStudio();
      return;
    }
    var historyAction = button.getAttribute("data-studio-history");
    if (historyAction) { stepStudioHistory(historyAction); return; }
    var rotate = button.getAttribute("data-studio-rotate");
    if (rotate !== null && studioState.selected >= 0 && studioState.shapes[studioState.selected]) {
      rotateStudioShape(studioState.shapes[studioState.selected], Number(rotate));
      commitStudioHistory(); renderStudioCanvas(); return;
    }
    if (button.hasAttribute("data-studio-fill-selected") && studioState.selected >= 0 && studioState.shapes[studioState.selected]) {
      var selectedShape = studioState.shapes[studioState.selected];
      if (selectedShape.t !== "p" && selectedShape.t !== "L" && selectedShape.t !== "e") { selectedShape.fill = !selectedShape.fill; commitStudioHistory(); renderStudioCanvas(); }
      return;
    }
    if (button.hasAttribute("data-studio-delete") && studioState.selected >= 0) {
      studioState.shapes.splice(studioState.selected, 1); studioState.selected = -1; commitStudioHistory(); renderStudioCanvas();
    }
  });

  var markerStudioRoot = document.getElementById("marker-studio-app");
  markerStudioRoot.addEventListener("input", function (event) {
    var target = event.target;
    if (target.hasAttribute("data-studio-field")) {
      var field = target.getAttribute("data-studio-field");
      studioState[field] = field === "color" ? validPrivateColor(target.value) : target.value;
      if (field === "color") target.value = studioState.color;
      renderStudioCanvas();
    }
    if (target.id === "studio-shape-size" && studioState.selected >= 0 && studioState.shapes[studioState.selected]) {
      studioState.shapes[studioState.selected].s = Math.max(3, Math.min(18, Number(target.value) || 10));
      renderStudioCanvas();
    }
    if (target.id === "studio-brush-size") { studioBrushSize = Math.max(1, Math.min(18, Number(target.value) || 4)); var brushValue = document.querySelector("[data-studio-brush-value]"); if (brushValue) brushValue.textContent = studioBrushSize; }
    if (target.id === "studio-eraser-size") { studioEraserSize = Math.max(1, Math.min(18, Number(target.value) || 8)); var eraserValue = document.querySelector("[data-studio-eraser-value]"); if (eraserValue) eraserValue.textContent = studioEraserSize; }
  });
  markerStudioRoot.addEventListener("change", function (event) {
    var target = event.target;
    if (target.hasAttribute("data-studio-field") || target.id === "studio-shape-size") commitStudioHistory();
    if (target.hasAttribute("data-studio-fill")) studioFill = !!target.checked;
  });
  markerStudioRoot.addEventListener("pointerdown", function (event) {
    var svg = event.target.closest && event.target.closest("#marker-design-canvas");
    if (!svg) return;
    event.preventDefault();
    var point = studioPoint(event, svg), shapeElement = event.target.closest && event.target.closest("[data-studio-shape]");
    if (studioTool) {
      if (studioState.shapes.length >= 20) { toast("В одном значке можно разместить до двадцати фигур.", "error"); return; }
      var shape;
      if (studioTool === "p") shape = { t: "p", points: [point], s: studioBrushSize, fill: false };
      else if (studioTool === "e") shape = { t: "e", points: [point], s: studioEraserSize, fill: false };
      else if (studioTool === "L") shape = { t: "L", x1: point.x, y1: point.y, x2: point.x, y2: point.y, s: studioBrushSize, fill: false };
      else shape = { t: studioTool, x: point.x, y: point.y, s: 10, r: 0, fill: studioFill };
      studioState.shapes.push(shape);
      var newIndex = studioState.shapes.length - 1;
      studioState.selected = studioTool === "e" ? -1 : newIndex;
      studioDrag = { pointerId: event.pointerId, kind: studioTool === "p" ? "brush" : studioTool === "e" ? "erase" : studioTool === "L" ? "line" : "shape", index: newIndex, lastPoint: point };
      if (svg.setPointerCapture) svg.setPointerCapture(event.pointerId);
    } else if (shapeElement) {
      studioState.selected = Number(shapeElement.getAttribute("data-studio-shape"));
      studioDrag = { pointerId: event.pointerId, kind: "move", index: studioState.selected, lastPoint: point };
      if (svg.setPointerCapture) svg.setPointerCapture(event.pointerId);
    } else {
      studioState.selected = -1;
      studioDrag = null;
    }
    renderStudioCanvas();
  });
  markerStudioRoot.addEventListener("pointermove", function (event) {
    if (!studioDrag || event.pointerId !== studioDrag.pointerId) return;
    var svg = document.getElementById("marker-design-canvas"); if (!svg) return;
    var point = studioPoint(event, svg), shape = studioState.shapes[studioDrag.index];
    if (!shape) return;
    if (studioDrag.kind === "move") {
      moveStudioShape(shape, point.x - studioDrag.lastPoint.x, point.y - studioDrag.lastPoint.y);
      studioDrag.lastPoint = point;
    } else if (studioDrag.kind === "line") {
      shape.x2 = point.x; shape.y2 = point.y;
    } else if (studioDrag.kind === "brush" || studioDrag.kind === "erase") {
      var dx = point.x - studioDrag.lastPoint.x, dy = point.y - studioDrag.lastPoint.y;
      if (Math.sqrt(dx * dx + dy * dy) >= 1.2) { shape.points.push(point); studioDrag.lastPoint = point; }
    }
    renderStudioCanvas();
  });
  function finishStudioPointer(event) {
    if (!studioDrag || (event && event.pointerId !== studioDrag.pointerId)) return;
    var shape = studioState.shapes[studioDrag.index];
    if ((studioDrag.kind === "brush" || studioDrag.kind === "erase") && shape && shape.points.length === 1) shape.points.push({ x: shape.points[0].x, y: shape.points[0].y });
    if (studioDrag.kind === "erase") studioState.selected = -1;
    studioDrag = null;
    commitStudioHistory();
    renderStudioCanvas();
  }
  markerStudioRoot.addEventListener("pointerup", finishStudioPointer);
  markerStudioRoot.addEventListener("pointercancel", finishStudioPointer);
  document.addEventListener("keydown", function (event) {
    if (location.hash !== "#marker-studio" || !(event.ctrlKey || event.metaKey)) return;
    var tag = (event.target.tagName || "").toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || event.target.isContentEditable) return;
    var key = String(event.key || "").toLowerCase();
    if (key === "z") { event.preventDefault(); stepStudioHistory(event.shiftKey ? "redo" : "undo"); }
    else if (key === "y") { event.preventDefault(); stepStudioHistory("redo"); }
  });
  document.addEventListener("input", function (event) {
    var target = event.target;
    if (target.id === "pt-color") PT_COLOR = target.value;
    if (target.id === "pt-caption") PT_CAPTION = target.value;
  });
  document.addEventListener("change", function (event) {
    var target = event.target;
    if (target.id === "pt-color") PT_COLOR = target.value;
    if (target.id === "pt-caption") PT_CAPTION = target.value;
    if (target.matches("[data-private-template]")) {
      var selectedTemplate = privateTemplates().filter(function (item) { return item.id === target.value; })[0];
      if (selectedTemplate) { applyPrivateTemplate(selectedTemplate); drawPrivateEditorForm(); }
    }
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
    if (location.hash === "#marker-studio" && isMasterNow()) renderMarkerStudio();
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
  if (location.hash === "#marker-studio") setTimeout(renderMarkerStudio, 0);
}());
