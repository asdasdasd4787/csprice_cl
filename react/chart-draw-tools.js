(() => {
  const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function clientToChartPoint(event, container, chart, series) {
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let time = null;
    let price = null;
    try {
      time = chart?.timeScale?.().coordinateToTime?.(x) ?? null;
      price = series?.coordinateToPrice?.(y) ?? null;
    } catch (_error) {
      time = null;
      price = null;
    }
    return { x, y, time, price };
  }

  function chartPointToPixel(point, chart, series) {
    let x = Number(point?.x);
    let y = Number(point?.y);
    if (point?.time != null && chart?.timeScale) {
      const tx = chart.timeScale().timeToCoordinate(point.time);
      if (tx != null && Number.isFinite(tx)) x = tx;
    }
    if (point?.price != null && series?.priceToCoordinate) {
      const ty = series.priceToCoordinate(point.price);
      if (ty != null && Number.isFinite(ty)) y = ty;
    }
    return { x, y };
  }

  function pixelToChartPoint(x, y, chart, series, fallback) {
    const next = {
      x,
      y,
      time: fallback?.time ?? null,
      price: fallback?.price ?? null,
    };
    try {
      const time = chart?.timeScale?.().coordinateToTime?.(x);
      if (time != null) next.time = time;
      const price = series?.coordinateToPrice?.(y);
      if (price != null && Number.isFinite(price)) next.price = price;
    } catch (_error) {
      /* keep fallback time/price */
    }
    return next;
  }

  function copyPoint(point) {
    if (!point) return null;
    return { x: point.x, y: point.y, time: point.time, price: point.price };
  }

  function snapshotDrawing(entry) {
    return {
      type: entry.type,
      p1: copyPoint(entry.p1),
      p2: copyPoint(entry.p2),
      p3: copyPoint(entry.p3),
      points: Array.isArray(entry.points) ? entry.points.map(copyPoint) : null,
      fontSize: entry.fontSize,
    };
  }

  function pixelSnapshot(entry, chart, series) {
    const px = (point) => (point ? chartPointToPixel(point, chart, series) : null);
    return {
      p1: px(entry.p1),
      p2: px(entry.p2),
      p3: px(entry.p3),
      points: Array.isArray(entry.points) ? entry.points.map(px) : null,
    };
  }

  function extendLineThrough(p1, p2, width, height) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
      return [p1, p2];
    }
    const scale = Math.max(width, height) * 4;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    return [
      { x: p1.x - ux * scale, y: p1.y - uy * scale },
      { x: p1.x + ux * scale, y: p1.y + uy * scale },
    ];
  }

  function formatMeasureLabel(p1, p2) {
    const priceDelta = Number(p2.price) - Number(p1.price);
    const pct = Number(p1.price) ? (priceDelta / Number(p1.price)) * 100 : 0;
    const sign = priceDelta >= 0 ? "+" : "";
    return `${sign}${priceDelta.toFixed(2)} (${sign}${pct.toFixed(2)}%)`;
  }

  function mountChartDrawTools(options) {
    const {
      wrap,
      container,
      getChart,
      getSeries,
      getTool,
    } = options;

    if (!wrap || !container) return null;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("tv-draw-overlay");
    svg.setAttribute("aria-hidden", "true");
    container.style.position = container.style.position || "relative";
    container.appendChild(svg);

    const textLayer = document.createElement("div");
    textLayer.className = "tv-draw-text-layer";
    container.appendChild(textLayer);

    const DEFAULT_TEXT_STYLE = {
      bold: false,
      italic: false,
      fontSize: 14,
      color: "#d1d4dc",
    };

    const drawings = [];
    let draft = null;
    let drawingId = 1;
    let textSession = null;
    let selectedId = null;
    let drag = null;

    function isTypingTarget(target) {
      const tag = String(target?.tagName || "").toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select" || !!target?.isContentEditable;
    }

    function findDrawing(id) {
      return drawings.find((entry) => entry.id === id) || null;
    }

    function sizeOverlay() {
      const width = Math.max(0, Math.floor(container.clientWidth));
      const height = Math.max(0, Math.floor(container.clientHeight));
      svg.setAttribute("width", String(width));
      svg.setAttribute("height", String(height));
      svg.style.width = `${width}px`;
      svg.style.height = `${height}px`;
      svg.style.left = "0";
      svg.style.top = "0";
      return { width, height };
    }

    function currentTool() {
      return String(getTool?.() || "cursor");
    }

    function toolUsesOverlay(tool) {
      return tool !== "cursor" && tool !== "clear";
    }

    function updateOverlayPointer() {
      const tool = currentTool();
      const overlayOn = toolUsesOverlay(tool) && !textSession;
      svg.style.pointerEvents = overlayOn ? "auto" : "none";
      svg.classList.toggle("is-active-tool", toolUsesOverlay(tool));
      svg.classList.toggle("is-text-tool", tool === "text");
      svg.classList.toggle("is-select-tool", tool === "cursor" && !textSession);
      if (tool !== "text" && textSession) closeTextSession(true);
      if (!overlayOn && draft) {
        draft = null;
        render();
      }
    }

    function addDrawing(entry) {
      drawings.push({ id: drawingId++, ...entry });
      render();
    }

    function endDrag() {
      if (!drag) return;
      drag = null;
      container.classList.remove("is-draw-dragging");
      window.removeEventListener("pointermove", onDragPointerMove);
      window.removeEventListener("pointerup", onDragPointerUp);
      window.removeEventListener("pointercancel", onDragPointerUp);
    }

    function deleteSelected() {
      if (selectedId == null) return false;
      const index = drawings.findIndex((entry) => entry.id === selectedId);
      if (index >= 0) drawings.splice(index, 1);
      selectedId = null;
      endDrag();
      render();
      return true;
    }

    function clearDrawings() {
      if (textSession) {
        closeTextSession(false);
        return;
      }
      if (deleteSelected()) return;
      drawings.length = 0;
      draft = null;
      selectedId = null;
      endDrag();
      render();
    }

    function applyTextStyle(el, style, withBorder) {
      const next = { ...DEFAULT_TEXT_STYLE, ...(style || {}) };
      el.style.fontWeight = next.bold ? "700" : "500";
      el.style.fontStyle = next.italic ? "italic" : "normal";
      el.style.fontSize = `${Number(next.fontSize) || 14}px`;
      el.style.color = next.color;
      el.style.caretColor = next.color || "#2962ff";
      if (withBorder) el.style.borderColor = "#2962ff";
    }

    function positionTextNode(el, point, chart, series) {
      const px = chartPointToPixel(point, chart, series);
      if (!px || !Number.isFinite(px.x) || !Number.isFinite(px.y)) {
        el.style.visibility = "hidden";
        return;
      }
      el.style.visibility = "visible";
      el.style.left = `${px.x}px`;
      el.style.top = `${px.y}px`;
    }

    function readEditorText(editor) {
      const raw = editor?.tagName === "TEXTAREA"
        ? String(editor.value || "")
        : String(editor?.innerText || "");
      return raw.replace(/\u00a0/g, " ").replace(/\s+$/g, "").trim();
    }

    function autosizeEditor(editor) {
      if (!editor) return;
      const cs = window.getComputedStyle(editor);
      if (!autosizeEditor.ctx) {
        autosizeEditor.ctx = document.createElement("canvas").getContext("2d");
      }
      const ctx = autosizeEditor.ctx;
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const lines = String(editor.value || editor.placeholder || "Add text").split("\n");
      let maxW = 0;
      lines.forEach((line) => {
        maxW = Math.max(maxW, ctx.measureText(line || " ").width);
      });
      editor.style.width = `${Math.max(76, Math.min(420, Math.ceil(maxW) + 18))}px`;
      editor.style.height = "auto";
      editor.style.height = `${Math.max(22, Math.min(240, editor.scrollHeight))}px`;
    }

    function closeTextSession(save) {
      if (!textSession) return;
      const { wrapEl, editor, point, style, onDocPointerDown } = textSession;
      const text = readEditorText(editor);
      if (onDocPointerDown) {
        document.removeEventListener("pointerdown", onDocPointerDown, true);
      }
      wrapEl.remove();
      textSession = null;
      container.classList.remove("is-text-editing");
      updateOverlayPointer();
      if (save && text) {
        addDrawing({
          type: "text",
          p1: point,
          text,
          bold: !!style.bold,
          italic: !!style.italic,
          fontSize: Number(style.fontSize) || 14,
          color: style.color || DEFAULT_TEXT_STYLE.color,
        });
        return;
      }
      render();
    }

    function syncTextToolbar(session) {
      const { toolbar, style } = session;
      toolbar.querySelector('[data-action="bold"]')?.classList.toggle("is-on", !!style.bold);
      toolbar.querySelector('[data-action="italic"]')?.classList.toggle("is-on", !!style.italic);
      const size = toolbar.querySelector('[data-action="size"]');
      if (size) size.value = String(style.fontSize || 14);
      const color = toolbar.querySelector('[data-action="color"]');
      if (color) color.value = style.color || DEFAULT_TEXT_STYLE.color;
    }

    function openTextSession(point, seed) {
      closeTextSession(true);
      const style = {
        ...DEFAULT_TEXT_STYLE,
        ...(seed || {}),
        fontSize: Number(seed?.fontSize) || DEFAULT_TEXT_STYLE.fontSize,
        color: seed?.color || DEFAULT_TEXT_STYLE.color,
      };

      const wrapEl = document.createElement("div");
      wrapEl.className = "tv-draw-text-session";

      const toolbar = document.createElement("div");
      toolbar.className = "tv-draw-text-toolbar";
      toolbar.innerHTML = [
        '<span class="tv-draw-text-tb-mark" title="Text"><i class="fa-solid fa-font"></i></span>',
        '<select class="tv-draw-text-tb-size" data-action="size" title="Font size">',
        '<option value="10">10</option><option value="12">12</option><option value="14">14</option>',
        '<option value="16">16</option><option value="18">18</option><option value="24">24</option>',
        '<option value="32">32</option></select>',
        '<label class="tv-draw-text-tb-color" title="Text color"><input type="color" data-action="color" value="#d1d4dc"></label>',
        '<button type="button" class="tv-draw-text-tb-btn" data-action="bold" title="Bold"><b>B</b></button>',
        '<button type="button" class="tv-draw-text-tb-btn" data-action="italic" title="Italic"><i>I</i></button>',
        '<button type="button" class="tv-draw-text-tb-btn tv-draw-text-tb-danger" data-action="delete" title="Remove"><i class="fa-regular fa-trash-can"></i></button>',
      ].join("");

      const editor = document.createElement("textarea");
      editor.className = "tv-draw-text-editor";
      editor.rows = 1;
      editor.spellcheck = false;
      editor.autocomplete = "off";
      editor.placeholder = "Add text";
      editor.setAttribute("aria-label", "Chart text");
      if (seed?.text) editor.value = seed.text;

      wrapEl.appendChild(toolbar);
      wrapEl.appendChild(editor);
      textLayer.appendChild(wrapEl);
      container.classList.add("is-text-editing");
      applyTextStyle(editor, style, true);
      autosizeEditor(editor);

      const bornAt = performance.now();
      const onDocPointerDown = (event) => {
        if (!textSession || textSession.wrapEl !== wrapEl) return;
        if (performance.now() - bornAt < 120) return;
        if (wrapEl.contains(event.target)) return;
        const liveChart = getChart?.();
        const liveSeries = getSeries?.();
        const onChart = !!(container.contains(event.target) || svg.contains(event.target));
        const nextPoint = onChart && liveChart && liveSeries
          ? clientToChartPoint(event, container, liveChart, liveSeries)
          : null;
        closeTextSession(true);
        if (nextPoint && currentTool() === "text") {
          event.preventDefault();
          event.stopPropagation();
          openTextSession(nextPoint);
        }
      };
      document.addEventListener("pointerdown", onDocPointerDown, true);

      textSession = { wrapEl, editor, toolbar, point, style, onDocPointerDown };
      syncTextToolbar(textSession);
      updateOverlayPointer();

      toolbar.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
        if (event.target.closest("button, select, input")) event.preventDefault();
      });
      wrapEl.addEventListener("pointerdown", (event) => event.stopPropagation());

      toolbar.addEventListener("click", (event) => {
        const btn = event.target.closest("button[data-action]");
        if (!btn || !textSession) return;
        event.preventDefault();
        event.stopPropagation();
        const action = btn.getAttribute("data-action");
        if (action === "delete") {
          closeTextSession(false);
          return;
        }
        if (action === "bold") textSession.style.bold = !textSession.style.bold;
        if (action === "italic") textSession.style.italic = !textSession.style.italic;
        applyTextStyle(editor, textSession.style, true);
        syncTextToolbar(textSession);
        editor.focus();
      });
      toolbar.querySelector('[data-action="size"]')?.addEventListener("change", (event) => {
        if (!textSession) return;
        textSession.style.fontSize = Number(event.target.value) || 14;
        applyTextStyle(editor, textSession.style, true);
        autosizeEditor(editor);
        editor.focus();
      });
      toolbar.querySelector('[data-action="color"]')?.addEventListener("input", (event) => {
        if (!textSession) return;
        textSession.style.color = event.target.value || DEFAULT_TEXT_STYLE.color;
        applyTextStyle(editor, textSession.style, true);
        editor.focus();
      });

      editor.addEventListener("input", () => autosizeEditor(editor));
      editor.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          closeTextSession(false);
          return;
        }
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          closeTextSession(true);
          return;
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
          event.preventDefault();
          textSession.style.bold = !textSession.style.bold;
          applyTextStyle(editor, textSession.style, true);
          syncTextToolbar(textSession);
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "i") {
          event.preventDefault();
          textSession.style.italic = !textSession.style.italic;
          applyTextStyle(editor, textSession.style, true);
          syncTextToolbar(textSession);
        }
      });

      const chart = getChart?.();
      const series = getSeries?.();
      if (chart && series) {
        positionTextNode(wrapEl, point, chart, series);
        const px = chartPointToPixel(point, chart, series);
        wrapEl.classList.toggle("is-toolbar-below", Number(px?.y) < 56);
      }
      window.requestAnimationFrame(() => {
        autosizeEditor(editor);
        editor.focus({ preventScroll: true });
        const len = editor.value.length;
        try { editor.setSelectionRange(len, len); } catch (_err) { /* ignore */ }
      });
    }

    function beginEditTextDrawing(entry) {
      const index = drawings.indexOf(entry);
      if (index >= 0) drawings.splice(index, 1);
      if (selectedId === entry.id) selectedId = null;
      endDrag();
      openTextSession(entry.p1, {
        text: entry.text,
        bold: entry.bold,
        italic: entry.italic,
        fontSize: entry.fontSize,
        color: entry.color,
      });
      render();
    }

    function renderTextNotes(chart, series) {
      Array.from(textLayer.querySelectorAll(".tv-draw-text-note")).forEach((node) => node.remove());
      if (!chart || !series) return;
      const selecting = currentTool() === "cursor";
      const editing = currentTool() === "text";
      drawings.forEach((entry) => {
        if (entry.type !== "text" || !entry.text) return;
        const note = document.createElement("div");
        note.className = "tv-draw-text-note";
        note.dataset.drawId = String(entry.id);
        note.textContent = entry.text;
        applyTextStyle(note, entry, false);
        if (selectedId === entry.id) note.classList.add("is-selected");
        if (editing) {
          note.classList.add("is-editable");
          note.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            event.stopPropagation();
            beginEditTextDrawing(entry);
          });
        } else if (selecting) {
          note.classList.add("is-selectable");
          if (selectedId === entry.id) {
            const handle = document.createElement("span");
            handle.className = "tv-draw-text-handle is-se";
            handle.dataset.handle = "se";
            handle.setAttribute("aria-hidden", "true");
            note.appendChild(handle);
          }
          note.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            event.stopPropagation();
            const resizeHandle = event.target.closest(".tv-draw-text-handle");
            beginDrag(event, entry, resizeHandle ? "resize" : "move", resizeHandle?.dataset.handle || "body");
          });
          note.addEventListener("dblclick", (event) => {
            event.preventDefault();
            event.stopPropagation();
            beginEditTextDrawing(entry);
          });
        }
        textLayer.appendChild(note);
        positionTextNode(note, entry.p1, chart, series);
      });
      if (textSession) {
        positionTextNode(textSession.wrapEl, textSession.point, chart, series);
        const px = chartPointToPixel(textSession.point, chart, series);
        textSession.wrapEl.classList.toggle("is-toolbar-below", Number(px?.y) < 52);
      }
    }

    function renderLine(parent, x1, y1, x2, y2, className) {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", String(x1));
      line.setAttribute("y1", String(y1));
      line.setAttribute("x2", String(x2));
      line.setAttribute("y2", String(y2));
      line.setAttribute("class", className || "tv-draw-shape");
      parent.appendChild(line);
      return line;
    }

    function renderText(parent, x, y, text, className) {
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", String(x + 6));
      label.setAttribute("y", String(y - 6));
      label.setAttribute("class", className || "tv-draw-label");
      label.textContent = text;
      parent.appendChild(label);
    }

    function drawingChrome(entry, chart, series, size) {
      const p1 = entry.p1 ? chartPointToPixel(entry.p1, chart, series) : null;
      const p2 = entry.p2 ? chartPointToPixel(entry.p2, chart, series) : null;
      const p3 = entry.p3 ? chartPointToPixel(entry.p3, chart, series) : null;
      const hits = [];
      const handles = [];
      const type = entry.type;

      if (type === "trendline" && p1 && p2) {
        hits.push({ kind: "line", x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
        handles.push({ name: "p1", x: p1.x, y: p1.y }, { name: "p2", x: p2.x, y: p2.y });
      } else if (type === "ray" && p1 && p2) {
        const [a, b] = extendLineThrough(p1, p2, size.width, size.height);
        hits.push({ kind: "line", x1: a.x, y1: a.y, x2: b.x, y2: b.y });
        handles.push({ name: "p1", x: p1.x, y: p1.y }, { name: "p2", x: p2.x, y: p2.y });
      } else if (type === "hline" && p1) {
        hits.push({ kind: "line", x1: 0, y1: p1.y, x2: size.width, y2: p1.y });
        handles.push({ name: "p1", x: clamp(p1.x, 8, size.width - 8), y: p1.y });
      } else if (type === "vline" && p1) {
        hits.push({ kind: "line", x1: p1.x, y1: 0, x2: p1.x, y2: size.height });
        handles.push({ name: "p1", x: p1.x, y: clamp(p1.y, 8, size.height - 8) });
      } else if ((type === "rect" || type === "measure") && p1 && p2) {
        const x = Math.min(p1.x, p2.x);
        const y = Math.min(p1.y, p2.y);
        hits.push({
          kind: "rect",
          x,
          y,
          w: Math.abs(p2.x - p1.x),
          h: Math.abs(p2.y - p1.y),
        });
        if (type === "measure") {
          hits.push({ kind: "line", x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
        }
        handles.push({ name: "p1", x: p1.x, y: p1.y }, { name: "p2", x: p2.x, y: p2.y });
      } else if (type === "fib" && p1 && p2) {
        const x1 = Math.min(p1.x, p2.x);
        const x2 = Math.max(p1.x, p2.x);
        const top = Math.min(p1.y, p2.y);
        const bottom = Math.max(p1.y, p2.y);
        FIB_LEVELS.forEach((level) => {
          const y = bottom - (bottom - top) * level;
          hits.push({ kind: "line", x1, y1: y, x2, y2: y });
        });
        handles.push({ name: "p1", x: p1.x, y: p1.y }, { name: "p2", x: p2.x, y: p2.y });
      } else if (type === "parallel" && p1 && p2 && p3) {
        const ox = p3.x - p1.x;
        const oy = p3.y - p1.y;
        hits.push({ kind: "line", x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
        hits.push({ kind: "line", x1: p1.x + ox, y1: p1.y + oy, x2: p2.x + ox, y2: p2.y + oy });
        handles.push(
          { name: "p1", x: p1.x, y: p1.y },
          { name: "p2", x: p2.x, y: p2.y },
          { name: "p3", x: p3.x, y: p3.y }
        );
      } else if (type === "brush" && Array.isArray(entry.points) && entry.points.length > 1) {
        const d = entry.points.map((point, index) => {
          const px = chartPointToPixel(point, chart, series);
          return `${index === 0 ? "M" : "L"} ${px.x} ${px.y}`;
        }).join(" ");
        hits.push({ kind: "path", d });
      }

      return { hits, handles };
    }

    function renderHits(parent, entry, chart, series, size) {
      const { hits, handles } = drawingChrome(entry, chart, series, size);
      hits.forEach((hit) => {
        let node = null;
        if (hit.kind === "line") {
          node = document.createElementNS("http://www.w3.org/2000/svg", "line");
          node.setAttribute("x1", String(hit.x1));
          node.setAttribute("y1", String(hit.y1));
          node.setAttribute("x2", String(hit.x2));
          node.setAttribute("y2", String(hit.y2));
          node.setAttribute("class", "tv-draw-hit");
        } else if (hit.kind === "rect") {
          node = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          node.setAttribute("x", String(hit.x));
          node.setAttribute("y", String(hit.y));
          node.setAttribute("width", String(Math.max(1, hit.w)));
          node.setAttribute("height", String(Math.max(1, hit.h)));
          node.setAttribute("class", "tv-draw-hit tv-draw-hit-area");
        } else if (hit.kind === "path") {
          node = document.createElementNS("http://www.w3.org/2000/svg", "path");
          node.setAttribute("d", hit.d);
          node.setAttribute("class", "tv-draw-hit");
        }
        if (!node) return;
        node.setAttribute("data-draw-id", String(entry.id));
        node.style.pointerEvents = hit.kind === "rect" ? "all" : "stroke";
        parent.appendChild(node);
      });
      if (selectedId !== entry.id) return;
      handles.forEach((handle) => {
        if (!Number.isFinite(handle.x) || !Number.isFinite(handle.y)) return;
        const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        dot.setAttribute("cx", String(handle.x));
        dot.setAttribute("cy", String(handle.y));
        dot.setAttribute("r", "5");
        dot.setAttribute("class", `tv-draw-handle is-${handle.name}`);
        dot.setAttribute("data-draw-id", String(entry.id));
        dot.setAttribute("data-handle", handle.name);
        dot.style.pointerEvents = "all";
        parent.appendChild(dot);
      });
    }

    function renderDrawing(parent, entry, chart, series, size, isDraft) {
      const selected = !isDraft && entry.id === selectedId;
      const className = `${isDraft ? "tv-draw-shape is-draft" : "tv-draw-shape"}${selected ? " is-selected" : ""}`;
      const p1 = chartPointToPixel(entry.p1, chart, series);
      const p2 = entry.p2 ? chartPointToPixel(entry.p2, chart, series) : null;
      const p3 = entry.p3 ? chartPointToPixel(entry.p3, chart, series) : null;

      if (entry.type === "trendline" && p2) {
        renderLine(parent, p1.x, p1.y, p2.x, p2.y, className);
      } else if (entry.type === "ray" && p2) {
        const [a, b] = extendLineThrough(p1, p2, size.width, size.height);
        renderLine(parent, a.x, a.y, b.x, b.y, className);
      } else if (entry.type === "hline") {
        renderLine(parent, 0, p1.y, size.width, p1.y, className);
      } else if (entry.type === "vline") {
        renderLine(parent, p1.x, 0, p1.x, size.height, className);
      } else if (entry.type === "rect" && p2) {
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        const x = Math.min(p1.x, p2.x);
        const y = Math.min(p1.y, p2.y);
        rect.setAttribute("x", String(x));
        rect.setAttribute("y", String(y));
        rect.setAttribute("width", String(Math.abs(p2.x - p1.x)));
        rect.setAttribute("height", String(Math.abs(p2.y - p1.y)));
        rect.setAttribute("class", `${className} tv-draw-rect`);
        parent.appendChild(rect);
      } else if (entry.type === "fib" && p2) {
        const top = Math.min(p1.y, p2.y);
        const bottom = Math.max(p1.y, p2.y);
        FIB_LEVELS.forEach((level) => {
          const y = bottom - (bottom - top) * level;
          renderLine(parent, Math.min(p1.x, p2.x), y, Math.max(p1.x, p2.x), y, className);
          renderText(parent, Math.max(p1.x, p2.x), y, `${(level * 100).toFixed(1)}%`, "tv-draw-label");
        });
      } else if (entry.type === "parallel" && p2 && p3) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const ox = p3.x - p1.x;
        const oy = p3.y - p1.y;
        renderLine(parent, p1.x, p1.y, p2.x, p2.y, className);
        renderLine(parent, p1.x + ox, p1.y + oy, p2.x + ox, p2.y + oy, className);
      } else if (entry.type === "measure" && p2) {
        const x = Math.min(p1.x, p2.x);
        const y = Math.min(p1.y, p2.y);
        const width = Math.abs(p2.x - p1.x);
        const height = Math.abs(p2.y - p1.y);
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", String(x));
        rect.setAttribute("y", String(y));
        rect.setAttribute("width", String(width));
        rect.setAttribute("height", String(height));
        rect.setAttribute("class", `${className} tv-draw-measure-box`);
        parent.appendChild(rect);
        renderLine(parent, p1.x, p1.y, p2.x, p2.y, className);
        renderText(parent, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2, formatMeasureLabel(entry.p1, entry.p2), "tv-draw-label tv-draw-measure-label");
      } else if (entry.type === "brush" && Array.isArray(entry.points) && entry.points.length > 1) {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        const d = entry.points.map((point, index) => {
          const px = chartPointToPixel(point, chart, series);
          return `${index === 0 ? "M" : "L"} ${px.x} ${px.y}`;
        }).join(" ");
        path.setAttribute("d", d);
        path.setAttribute("class", `${className} tv-draw-path`);
        parent.appendChild(path);
      }
    }

    function render() {
      const chart = getChart?.();
      const series = getSeries?.();
      const size = sizeOverlay();
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      if (!chart || !series || !size.width || !size.height) {
        renderTextNotes(null, null);
        return;
      }

      drawings.forEach((entry) => renderDrawing(svg, entry, chart, series, size, false));
      if (currentTool() === "cursor") {
        drawings.forEach((entry) => {
          if (entry.type === "text") return;
          renderHits(svg, entry, chart, series, size);
        });
      }
      if (draft) renderDrawing(svg, draft, chart, series, size, true);
      renderTextNotes(chart, series);
    }

    function beginDrag(event, entry, mode, handle) {
      const chart = getChart?.();
      const series = getSeries?.();
      if (!chart || !series) return;
      selectedId = entry.id;
      const start = clientToChartPoint(event, container, chart, series);
      drag = {
        id: entry.id,
        mode,
        handle: handle || "body",
        startPoint: start,
        origin: snapshotDrawing(entry),
        originPixels: pixelSnapshot(entry, chart, series),
        originWidth: 0,
        originHeight: 0,
        didMove: false,
      };
      if (entry.type === "text") {
        const note = textLayer.querySelector(`.tv-draw-text-note[data-draw-id="${entry.id}"]`);
        if (note) {
          drag.originWidth = note.offsetWidth;
          drag.originHeight = note.offsetHeight;
        }
      }
      container.classList.add("is-draw-dragging");
      window.addEventListener("pointermove", onDragPointerMove, { passive: false });
      window.addEventListener("pointerup", onDragPointerUp);
      window.addEventListener("pointercancel", onDragPointerUp);
      render();
    }

    function onDragPointerMove(event) {
      if (!drag) return;
      const entry = findDrawing(drag.id);
      if (!entry) return;
      const chart = getChart?.();
      const series = getSeries?.();
      if (!chart || !series) return;
      event.preventDefault();
      const now = clientToChartPoint(event, container, chart, series);
      const dx = now.x - drag.startPoint.x;
      const dy = now.y - drag.startPoint.y;
      if (drag.mode === "move" && !drag.didMove && Math.hypot(dx, dy) < 3) return;
      drag.didMove = true;

      if (drag.mode === "resize" && entry.type === "text") {
        const startSize = Number(drag.origin.fontSize) || 14;
        const startH = Math.max(8, drag.originHeight || 20);
        const scale = clamp((startH + dy) / startH, 0.35, 4);
        entry.fontSize = clamp(Math.round(startSize * scale), 10, 72);
        render();
        return;
      }

      if (drag.mode === "resize") {
        const originPx = drag.originPixels || {};
        if (entry.type === "hline" && originPx.p1) {
          entry.p1 = pixelToChartPoint(originPx.p1.x, now.y, chart, series, drag.origin.p1);
        } else if (entry.type === "vline" && originPx.p1) {
          entry.p1 = pixelToChartPoint(now.x, originPx.p1.y, chart, series, drag.origin.p1);
        } else if (drag.handle === "p1") {
          entry.p1 = pixelToChartPoint(now.x, now.y, chart, series, drag.origin.p1);
        } else if (drag.handle === "p2") {
          entry.p2 = pixelToChartPoint(now.x, now.y, chart, series, drag.origin.p2);
        } else if (drag.handle === "p3") {
          entry.p3 = pixelToChartPoint(now.x, now.y, chart, series, drag.origin.p3);
        }
        render();
        return;
      }

      const lockX = entry.type === "hline";
      const lockY = entry.type === "vline";
      const shift = (originPoint, originPx) => {
        if (!originPx) return originPoint || null;
        const x = lockX ? originPx.x : originPx.x + dx;
        const y = lockY ? originPx.y : originPx.y + dy;
        return pixelToChartPoint(x, y, chart, series, originPoint);
      };
      if (entry.p1) entry.p1 = shift(drag.origin.p1, drag.originPixels.p1);
      if (entry.p2) entry.p2 = shift(drag.origin.p2, drag.originPixels.p2);
      if (entry.p3) entry.p3 = shift(drag.origin.p3, drag.originPixels.p3);
      if (Array.isArray(entry.points) && Array.isArray(drag.originPixels.points)) {
        entry.points = drag.originPixels.points.map((px, index) => shift(drag.origin.points?.[index], px));
      }
      render();
    }

    function onDragPointerUp() {
      endDrag();
    }

    function finishDraft() {
      if (!draft) return;
      if (draft.type === "brush" && Array.isArray(draft.points) && draft.points.length > 1) {
        addDrawing({ type: "brush", points: draft.points.slice() });
      } else if (draft.p1 && draft.p2) {
        addDrawing({
          type: draft.type,
          p1: draft.p1,
          p2: draft.p2,
          p3: draft.p3 || null,
          text: draft.text || "",
        });
      } else if (draft.type === "hline" || draft.type === "vline") {
        addDrawing({ type: draft.type, p1: draft.p1 });
      } else if (draft.type === "text" && draft.text) {
        addDrawing({ type: "text", p1: draft.p1, text: draft.text });
      }
      draft = null;
      render();
    }

    function onPointerDown(event) {
      const tool = currentTool();
      if (tool === "cursor") {
        const handleEl = event.target.closest?.(".tv-draw-handle");
        const hitEl = event.target.closest?.(".tv-draw-hit");
        const node = handleEl || hitEl;
        if (!node) return;
        const entry = findDrawing(Number(node.getAttribute("data-draw-id")));
        if (!entry) return;
        event.preventDefault();
        event.stopPropagation();
        const handle = handleEl?.getAttribute("data-handle") || "";
        beginDrag(event, entry, handle ? "resize" : "move", handle || "body");
        return;
      }
      if (!toolUsesOverlay(tool)) return;
      event.preventDefault();
      event.stopPropagation();
      if (selectedId != null) selectedId = null;

      const chart = getChart?.();
      const series = getSeries?.();
      if (!chart || !series) return;

      const point = clientToChartPoint(event, container, chart, series);

      if (tool === "hline") {
        addDrawing({ type: "hline", p1: point });
        return;
      }
      if (tool === "vline") {
        addDrawing({ type: "vline", p1: point });
        return;
      }
      if (tool === "text") {
        openTextSession(point);
        return;
      }
      if (tool === "brush") {
        draft = { type: "brush", points: [point] };
        render();
        return;
      }

      if (!draft) {
        draft = { type: tool, p1: point, p2: null, p3: null };
        if (tool === "parallel") draft.step = 1;
        render();
        return;
      }

      if (draft.type === "parallel") {
        if (draft.step === 1) {
          draft.p2 = point;
          draft.step = 2;
        } else {
          draft.p3 = point;
          finishDraft();
        }
        render();
        return;
      }

      draft.p2 = point;
      finishDraft();
    }

    function onPointerMove(event) {
      const tool = currentTool();
      if (!draft) return;
      const chart = getChart?.();
      const series = getSeries?.();
      if (!chart || !series) return;
      const point = clientToChartPoint(event, container, chart, series);

      if (draft.type === "brush") {
        const last = draft.points[draft.points.length - 1];
        if (!last || Math.hypot(last.x - point.x, last.y - point.y) > 2) {
          draft.points.push(point);
        }
      } else if (draft.step === 2) {
        draft.p3 = point;
      } else {
        draft.p2 = point;
      }
      render();
    }

    function onPointerUp(event) {
      if (draft?.type === "brush") {
        finishDraft();
      }
    }

    function onKeyDown(event) {
      if (isTypingTarget(event.target)) return;
      if (textSession) {
        if (event.key === "Escape") {
          event.preventDefault();
          closeTextSession(false);
        }
        return;
      }
      if (event.key === "Escape") {
        if (draft || selectedId != null) {
          event.preventDefault();
          draft = null;
          selectedId = null;
          endDrag();
          render();
        }
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedId != null) {
        event.preventDefault();
        deleteSelected();
      }
    }

    function onContainerPointerDown(event) {
      if (drag || currentTool() !== "cursor" || textSession) return;
      if (event.target?.closest?.(".tv-draw-hit, .tv-draw-handle, .tv-draw-text-note, .tv-draw-text-session, .tv-draw-toolbar")) {
        return;
      }
      if (selectedId != null) {
        selectedId = null;
        render();
      }
    }

    svg.addEventListener("pointerdown", onPointerDown);
    svg.addEventListener("pointermove", onPointerMove);
    svg.addEventListener("pointerup", onPointerUp);
    window.addEventListener("keydown", onKeyDown);
    container.addEventListener("pointerdown", onContainerPointerDown, true);

    const resizeObserver = typeof ResizeObserver === "function"
      ? new ResizeObserver(() => render())
      : null;
    resizeObserver?.observe(container);

    const chart = getChart?.();
    if (chart?.timeScale?.().subscribeVisibleLogicalRangeChange) {
      chart.timeScale().subscribeVisibleLogicalRangeChange(render);
    }
    if (chart?.subscribeCrosshairMove) {
      chart.subscribeCrosshairMove(render);
    }

    sizeOverlay();
    updateOverlayPointer();
    render();

    return {
      render,
      clearDrawings,
      updateOverlayPointer,
      destroy() {
        closeTextSession(false);
        endDrag();
        svg.removeEventListener("pointerdown", onPointerDown);
        svg.removeEventListener("pointermove", onPointerMove);
        svg.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("keydown", onKeyDown);
        container.removeEventListener("pointerdown", onContainerPointerDown, true);
        resizeObserver?.disconnect();
        if (chart?.timeScale?.().unsubscribeVisibleLogicalRangeChange) {
          chart.timeScale().unsubscribeVisibleLogicalRangeChange(render);
        }
        if (chart?.unsubscribeCrosshairMove) {
          chart.unsubscribeCrosshairMove(render);
        }
        textLayer.remove();
        svg.remove();
      },
    };
  }

  const DRAW_TOOL_ICONS = {
    cursor: [
      { d: "M5 2.6l.15 12.1 3.05-3.25 2.35 5.15 1.85-.85-2.35-5.05 4.4-.1z", fill: "currentColor", strokeWidth: 0.9 },
    ],
    trendline: [{ d: "M4.5 13.5L13.5 4.5" }],
    ray: [
      { d: "M4.5 13.5L13.5 5.5" },
      { d: "M10.5 5.5h3v3", strokeWidth: 1.1 },
    ],
    hline: [{ d: "M3 9h12" }],
    vline: [{ d: "M9 3v12" }],
    fib: [
      { d: "M3 5.5h12" },
      { d: "M3 9h12" },
      { d: "M3 12.5h12" },
      { d: "M13.5 5.5v7", strokeWidth: 1.1 },
    ],
    rect: [{ d: "M4.5 4.5h9v9h-9z" }],
    parallel: [
      { d: "M4.5 12.5L12.5 4.5" },
      { d: "M6.5 14.5L14.5 6.5" },
    ],
    brush: [{ d: "M4.5 13.5c2-2.5 3.5-4 5.5-5.5 1.2-.9 2.4-1.2 3.2-.4.8.8.5 2-.4 3.2-1.5 2-3 3.5-5.5 5.5-.8.7-1.8 1-2.8.2z" }],
    text: [
      { d: "M5.5 4.5h7" },
      { d: "M9 4.5v9" },
    ],
    measure: [
      { d: "M4.5 5.5h9v7h-9z", strokeWidth: 1.1 },
      { d: "M4.5 9h9", strokeWidth: 1 },
      { d: "M9 5.5v7", strokeWidth: 1 },
    ],
    clear: [
      // Classic trash can: lid + handle + can + ribs
      { d: "M6.5 4.75h5" },
      { d: "M7.75 4.75V3.85h2.5v.9" },
      { d: "M5.25 6.15h7.5" },
      { d: "M6.15 6.15l.55 8.1h4.6l.55-8.1" },
      { d: "M8.1 8.1v4.2", strokeWidth: 1.2 },
      { d: "M9.9 8.1v4.2", strokeWidth: 1.2 },
    ],
  };

  Object.assign(window.CS2ChartDraw || (window.CS2ChartDraw = {}), {
    mount: mountChartDrawTools,
    icons: DRAW_TOOL_ICONS,
    tools: [
      {
        id: "cursor",
        word: "Cursor",
        label: "Cursor",
        hint: "Select a drawing to move, resize, or delete it. Click empty chart to pan.",
        fa: "fa-solid fa-arrow-pointer",
        paths: DRAW_TOOL_ICONS.cursor,
      },
      {
        id: "trendline",
        word: "Trendline",
        label: "Trendline",
        hint: "Click two points to draw a straight support or resistance line.",
        fa: "fa-solid fa-slash",
        paths: DRAW_TOOL_ICONS.trendline,
      },
      {
        id: "ray",
        word: "Ray",
        label: "Ray",
        hint: "Click two points to extend a line forward through future price action.",
        fa: "fa-solid fa-arrow-trend-up",
        paths: DRAW_TOOL_ICONS.ray,
      },
      {
        id: "hline",
        word: "Horizontal",
        label: "Horizontal",
        hint: "Click once to place a flat price level across the chart.",
        fa: "fa-solid fa-minus",
        paths: DRAW_TOOL_ICONS.hline,
      },
      {
        id: "vline",
        word: "Vertical",
        label: "Vertical",
        hint: "Click once to mark a date or time on the chart.",
        fa: "fa-solid fa-grip-lines-vertical",
        paths: DRAW_TOOL_ICONS.vline,
      },
      {
        id: "fib",
        word: "Fibonacci",
        label: "Fibonacci",
        hint: "Drag between a swing low and high to plot retracement levels.",
        fa: "fa-solid fa-layer-group",
        paths: DRAW_TOOL_ICONS.fib,
      },
      {
        id: "rect",
        word: "Rectangle",
        label: "Rectangle",
        hint: "Drag a box to highlight a price and time range.",
        fa: "fa-regular fa-square",
        paths: DRAW_TOOL_ICONS.rect,
      },
      {
        id: "parallel",
        word: "Channel",
        label: "Channel",
        hint: "Draw a base line, then a third point to set parallel channel width.",
        fa: "fa-solid fa-grip-lines",
        faMod: "tv-draw-tool-icon--channel",
        paths: DRAW_TOOL_ICONS.parallel,
      },
      {
        id: "brush",
        word: "Brush",
        label: "Brush",
        hint: "Freehand sketch notes or paths directly on the chart.",
        fa: "fa-solid fa-pen",
        paths: DRAW_TOOL_ICONS.brush,
      },
      {
        id: "text",
        word: "Text",
        label: "Text",
        hint: "Click the chart to type a note in place, like TradingView.",
        fa: "fa-solid fa-font",
        paths: DRAW_TOOL_ICONS.text,
      },
      {
        id: "measure",
        word: "Measure",
        label: "Measure",
        hint: "Drag between two points to see price change and percent move.",
        fa: "fa-solid fa-ruler-combined",
        paths: DRAW_TOOL_ICONS.measure,
      },
      {
        id: "clear",
        word: "Clear",
        label: "Clear",
        hint: "Remove the selected drawing, or every drawing if none is selected.",
        fa: "fa-regular fa-trash-can",
        paths: DRAW_TOOL_ICONS.clear,
      },
    ],
    toolGroups: [
      { tools: ["cursor"] },
      { tools: ["trendline", "ray", "hline", "vline"] },
      { tools: ["fib"] },
      { tools: ["rect", "parallel", "brush"] },
      { tools: ["text"] },
      { tools: ["measure"] },
      { tools: ["clear"], utility: true },
    ],
  });
})();
