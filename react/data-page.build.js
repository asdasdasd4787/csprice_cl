(() => {
  (() => {
    const { useEffect, useRef, useState } = React;
    const { Layout, mountPage } = window.CS2React;
    const RANGE_OPTIONS = [
      { id: "30D", label: "30D", days: 30 },
      { id: "90D", label: "90D", days: 90 },
      { id: "180D", label: "180D", days: 180 },
      { id: "1Y", label: "1Y", days: 365 },
      { id: "ALL", label: "All", days: Infinity }
    ];
    function formatCurrency(value, currency = "USD") {
      const amount = Number(value || 0);
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency || "USD",
        maximumFractionDigits: 2
      }).format(amount);
    }
    function formatCompactDate(value) {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "";
      return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    }
    function formatLongDate(value) {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "Not synced yet";
      return date.toLocaleString();
    }
    function filterSeriesByRange(series, rangeId) {
      if (!Array.isArray(series) || !series.length) return [];
      const range = RANGE_OPTIONS.find((option) => option.id === rangeId) || RANGE_OPTIONS[RANGE_OPTIONS.length - 1];
      if (!Number.isFinite(range.days)) {
        return series;
      }
      const endDate = new Date(series[series.length - 1]?.time || Date.now());
      if (Number.isNaN(endDate.getTime())) {
        return series.slice(-Math.max(2, range.days));
      }
      const cutoff = new Date(endDate);
      cutoff.setUTCDate(cutoff.getUTCDate() - range.days);
      return series.filter((point) => {
        const pointDate = new Date(point?.time || "");
        return !Number.isNaN(pointDate.getTime()) && pointDate >= cutoff;
      });
    }
    function DataPage() {
      const [summary, setSummary] = useState(null);
      const [series, setSeries] = useState([]);
      const [range, setRange] = useState("ALL");
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState("");
      const chartRef = useRef(null);
      const chartApiRef = useRef(null);
      const seriesApiRef = useRef(null);
      const tooltipRef = useRef(null);
      const visibleSeries = filterSeriesByRange(series, range);
      useEffect(() => {
        let alive = true;
        fetch("get_market_cap.php", {
          cache: "no-store",
          headers: { Accept: "application/json" }
        }).then((response) => {
          if (!response.ok) {
            throw new Error(`Market cap request failed (${response.status})`);
          }
          return response.json();
        }).then((payload) => {
          if (!alive) return;
          if (!payload?.success) {
            throw new Error(payload?.error || "Market cap is unavailable.");
          }
          setSummary(payload.summary || null);
          setSeries(Array.isArray(payload.series) ? payload.series : []);
          setLoading(false);
        }).catch((requestError) => {
          if (!alive) return;
          setError(requestError?.message || "Market cap is unavailable.");
          setLoading(false);
        });
        return () => {
          alive = false;
        };
      }, []);
      useEffect(() => {
        const container = chartRef.current;
        if (!container || !window.LightweightCharts || !visibleSeries.length) {
          return void 0;
        }
        container.innerHTML = "";
        const chart = window.LightweightCharts.createChart(container, {
          layout: {
            background: { color: "transparent" },
            textColor: "#90a3c3",
            fontFamily: "Segoe UI, sans-serif"
          },
          autoSize: true,
          height: 520,
          rightPriceScale: {
            borderColor: "rgba(112, 140, 184, 0.16)"
          },
          timeScale: {
            borderColor: "rgba(112, 140, 184, 0.16)",
            timeVisible: false
          },
          grid: {
            vertLines: { color: "rgba(112, 140, 184, 0.08)" },
            horzLines: { color: "rgba(112, 140, 184, 0.08)" }
          },
          crosshair: {
            mode: window.LightweightCharts.CrosshairMode.Normal
          },
          handleScroll: {
            mouseWheel: true,
            pressedMouseMove: true,
            horzTouchDrag: true,
            vertTouchDrag: false
          },
          handleScale: {
            axisPressedMouseMove: true,
            mouseWheel: true,
            pinch: true
          }
        });
        const areaSeries = chart.addAreaSeries({
          lineColor: "#4f8dff",
          topColor: "rgba(79, 141, 255, 0.28)",
          bottomColor: "rgba(79, 141, 255, 0.04)",
          lineWidth: 3,
          priceLineColor: "#79c5ff",
          lastValueVisible: true,
          crosshairMarkerRadius: 5,
          crosshairMarkerBorderColor: "#ffffff",
          crosshairMarkerBackgroundColor: "#4f8dff",
          priceFormat: {
            type: "custom",
            formatter: (value) => formatCurrency(value, summary?.currency || "USD")
          }
        });
        areaSeries.setData(
          visibleSeries.map((point) => ({
            time: point.time,
            value: Number(point.value || 0)
          }))
        );
        chart.timeScale().fitContent();
        const tooltip = tooltipRef.current;
        chart.subscribeCrosshairMove((param) => {
          if (!tooltip || !param?.point || !param?.time || !param.seriesData?.size) {
            if (tooltip) tooltip.style.opacity = "0";
            return;
          }
          const dataPoint = param.seriesData.get(areaSeries);
          if (!dataPoint || typeof dataPoint.value !== "number") {
            tooltip.style.opacity = "0";
            return;
          }
          tooltip.innerHTML = `
          <strong>${formatCurrency(dataPoint.value, summary?.currency || "USD")}</strong>
          <span>${formatCompactDate(param.time)}</span>
        `;
          tooltip.style.opacity = "1";
          tooltip.style.left = `${Math.min(container.clientWidth - 170, Math.max(12, param.point.x + 16))}px`;
          tooltip.style.top = `${Math.max(12, param.point.y + 16)}px`;
        });
        chartApiRef.current = chart;
        seriesApiRef.current = areaSeries;
        return () => {
          if (tooltipRef.current) {
            tooltipRef.current.style.opacity = "0";
          }
          chart.remove();
          chartApiRef.current = null;
          seriesApiRef.current = null;
        };
      }, [visibleSeries, summary?.currency]);
      return /* @__PURE__ */ React.createElement(Layout, null, /* @__PURE__ */ React.createElement("main", { className: "data-page" }, /* @__PURE__ */ React.createElement("section", { className: "data-chart-card" }, /* @__PURE__ */ React.createElement("div", { className: "data-chart-head" }, /* @__PURE__ */ React.createElement("div", { className: "data-chart-copy" }, /* @__PURE__ */ React.createElement("span", { className: "data-kicker" }, "DATA"), /* @__PURE__ */ React.createElement("h1", null, "Steam market cap"), /* @__PURE__ */ React.createElement("p", null, "One clean market-wide view powered from the latest synced Steam catalog snapshot.")), /* @__PURE__ */ React.createElement("div", { className: "data-chart-metrics" }, /* @__PURE__ */ React.createElement("strong", null, loading ? "Loading..." : formatCurrency(summary?.market_cap, summary?.currency)), /* @__PURE__ */ React.createElement("span", null, loading ? "Reading Steam cache..." : summary?.label || "Steam market cap estimate"), /* @__PURE__ */ React.createElement("span", null, loading ? "" : `Updated ${formatLongDate(summary?.updated_at)}`))), /* @__PURE__ */ React.createElement("div", { className: "data-chart-toolbar" }, /* @__PURE__ */ React.createElement("div", { className: "data-range-group" }, RANGE_OPTIONS.map((option) => /* @__PURE__ */ React.createElement(
        "button",
        {
          key: option.id,
          type: "button",
          className: `data-range-btn ${range === option.id ? "active" : ""}`,
          onClick: () => setRange(option.id)
        },
        option.label
      )))), error ? /* @__PURE__ */ React.createElement("div", { className: "data-error" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-circle-info" }), " ", error) : /* @__PURE__ */ React.createElement("div", { className: "data-chart-shell" }, loading && /* @__PURE__ */ React.createElement("div", { className: "data-chart-loading" }, /* @__PURE__ */ React.createElement("div", { className: "tv-spinner" }), /* @__PURE__ */ React.createElement("span", null, "Loading Steam market cap...")), !loading && !visibleSeries.length && /* @__PURE__ */ React.createElement("div", { className: "data-chart-loading empty" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-chart-line" }), /* @__PURE__ */ React.createElement("span", null, "No market-cap history is available yet.")), /* @__PURE__ */ React.createElement("div", { ref: chartRef, className: "data-chart-canvas" }), /* @__PURE__ */ React.createElement("div", { ref: tooltipRef, className: "data-chart-tooltip" })))));
    }
    mountPage(/* @__PURE__ */ React.createElement(DataPage, null));
  })();
})();
