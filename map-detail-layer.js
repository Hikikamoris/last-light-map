/* High-detail raster tiles share the existing map's coordinate system and seasonal styling. */
(function () {
  "use strict";
  var script = document.currentScript;
  var base = new URL("./assets/maps/detail/", script && script.src || document.baseURI);
  var version = script && new URL(script.src, document.baseURI).search || "";
  var attached = new WeakMap();
  var COLUMNS = 8, ROWS = 5, MIN_ZOOM = 2, CACHE_SIZE = 12, MAX_REQUESTS = 4;
  var TILE_CORE_WIDTH = 1280, TILE_CORE_HEIGHT = 1144;
  var PANE = "mapDetailTiles";

  function attach(map) {
    if (!map || !window.L) return null;
    if (attached.has(map)) return attached.get(map);
    var width = Number(window.W) || 1280, height = Number(window.H) || 715;
    var tileWidth = width / COLUMNS, tileHeight = height / ROWS;
    var gutterX = tileWidth / TILE_CORE_WIDTH, gutterY = tileHeight / TILE_CORE_HEIGHT;
    var records = new Map(), wanted = new Set(), queue = [], inflight = 0, clock = 0;
    var disposed = false, started = false;
    var pane = map.getPane(PANE) || map.createPane(PANE);
    pane.style.zIndex = "410";
    pane.style.pointerEvents = "none";
    var status = document.createElement("div");
    status.textContent = "Загрузка деталей…";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.className = "map-detail-status";
    status.style.cssText = "position:absolute;bottom:12px;left:50%;transform:translateX(-50%);z-index:1000;pointer-events:none;padding:7px 12px;border:1px solid #756536;border-radius:20px;background:#10130eeb;color:#ece8dc;font:14px system-ui,sans-serif;white-space:nowrap";
    status.hidden = true;
    map.getContainer().appendChild(status);

    function updateStatus() {
      var pending = false;
      wanted.forEach(function (id) { var record = records.get(id); if (record && (record.state === "queued" || record.state === "loading")) pending = true; });
      status.hidden = !pending || map.getZoom() < MIN_ZOOM;
    }

    function hide(record) {
      if (!record.overlay) return;
      map.removeLayer(record.overlay);
      record.overlay = null;
    }

    function show(record) {
      if (disposed || map.getZoom() < MIN_ZOOM || record.state !== "ready" || record.overlay || !wanted.has(record.id)) return;
      var overlay = window.L.imageOverlay(record.url, record.bounds, {
        pane: PANE, interactive: false, bubblingMouseEvents: false,
        opacity: 1, className: "map-detail-tile"
      });
      overlay.on("error", function () {
        if (record.overlay !== overlay) return;
        hide(record);
        record.state = "failed";
        record.retryAfter = Date.now() + 60000;
      });
      record.overlay = overlay;
      overlay.addTo(map);
    }

    function trimCache() {
      var idle = [];
      records.forEach(function (record) {
        if (wanted.has(record.id)) return;
        if (record.state === "ready") idle.push(record);
        else if (record.state !== "loading") records.delete(record.id);
      });
      idle.sort(function (a, b) { return b.used - a.used; });
      idle.slice(CACHE_SIZE).forEach(function (record) { hide(record); records.delete(record.id); });
    }

    function load(record) {
      var photo = new Image();
      record.state = "loading";
      record.photo = photo;
      inflight++;
      photo.decoding = "async";
      function finish(ok) {
        photo.onload = photo.onerror = null;
        inflight--;
        if (disposed) return;
        // A late response never re-adds an offscreen tile or overwrites a newer record.
        if (records.get(record.id) === record && record.photo === photo) {
          record.photo = null;
          record.state = ok ? "ready" : "failed";
          record.used = ++clock;
          if (ok) show(record);
          else record.retryAfter = Date.now() + 60000;
        }
        trimCache();
        pump();
      }
      photo.onload = function () { finish(photo.naturalWidth > 0 && photo.naturalHeight > 0); };
      photo.onerror = function () { finish(false); };
      photo.src = record.url;
    }

    function pump() {
      if (disposed) return;
      while (inflight < MAX_REQUESTS && queue.length) {
        var record = queue.shift();
        if (records.get(record.id) === record && wanted.has(record.id) && record.state === "queued") load(record);
      }
      updateStatus();
    }

    function refresh() {
      if (disposed || !started) return;
      var next = [], bounds;
      if (map.getZoom() >= MIN_ZOOM) {
        bounds = map.getBounds();
        var left = bounds.getWest(), right = bounds.getEast();
        var top = height - bounds.getNorth(), bottom = height - bounds.getSouth();
        if (right > 0 && left < width && bottom > 0 && top < height) {
          var firstColumn = Math.max(0, Math.floor(left / tileWidth));
          var lastColumn = Math.min(COLUMNS - 1, Math.ceil(right / tileWidth) - 1);
          var firstRow = Math.max(0, Math.floor(top / tileHeight));
          var lastRow = Math.min(ROWS - 1, Math.ceil(bottom / tileHeight) - 1);
          var cx = (left + right) / 2, cy = (top + bottom) / 2;
          for (var row = firstRow; row <= lastRow; row++) {
            for (var column = firstColumn; column <= lastColumn; column++) {
              var id = "r" + row + "c" + column;
              var record = records.get(id);
              if (!record) {
                record = {
                  id: id, state: "queued", used: 0, photo: null, overlay: null,
                  url: new URL(id + ".webp" + version, base).href,
                  // Shared edge pixels cover projection rounding between adjacent tiles at fractional zoom.
                  bounds: [
                    [Math.max(0, height - (row + 1) * tileHeight - gutterY), Math.max(0, column * tileWidth - gutterX)],
                    [Math.min(height, height - row * tileHeight + gutterY), Math.min(width, (column + 1) * tileWidth + gutterX)]
                  ]
                };
                records.set(id, record);
              }
              if (record.state === "failed" && Date.now() >= record.retryAfter) record.state = "queued";
              record.distance = Math.pow((column + .5) * tileWidth - cx, 2) + Math.pow((row + .5) * tileHeight - cy, 2);
              record.used = ++clock;
              next.push(record);
            }
          }
        }
      }
      wanted = new Set(next.map(function (record) { return record.id; }));
      records.forEach(function (record) { if (!wanted.has(record.id)) hide(record); });
      next.sort(function (a, b) { return a.distance - b.distance; });
      next.forEach(show);
      queue = next.filter(function (record) { return record.state === "queued"; });
      trimCache();
      pump();
    }

    function start() {
      if (disposed || started) return;
      started = true;
      map.on("moveend zoomend resize", refresh);
      refresh();
    }

    function destroy() {
      if (disposed) return;
      disposed = true;
      map.off("load", start);
      map.off("moveend zoomend resize", refresh);
      map.off("unload", destroy);
      records.forEach(hide);
      records.clear(); wanted.clear(); queue = [];
      status.remove();
      attached.delete(map);
    }

    var controller = { refresh: refresh, destroy: destroy };
    attached.set(map, controller);
    map.once("unload", destroy);
    map.whenReady(start);
    return controller;
  }

  window.LLMapDetail = { attach: attach };
}());
