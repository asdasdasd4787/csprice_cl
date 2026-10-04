(() => {
  function chartMedian(values) {
    const sorted = values
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((left, right) => left - right);
    if (!sorted.length) return 0;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function filterChartSeriesOutliers(points, referencePrice = 0) {
    if (!Array.isArray(points) || points.length < 4) {
      return Array.isArray(points) ? points : [];
    }

    const prices = points.map((point) => Number(point?.price || 0)).filter((price) => price > 0);
    if (prices.length < 4) {
      return points;
    }

    const median = chartMedian(prices);
    const reference = Number(referencePrice) > 0 ? Number(referencePrice) : median;
    const deviations = prices.map((price) => Math.abs(price - median));
    const mad = chartMedian(deviations) || Math.max(reference * 0.04, 0.01);
    const spread = Math.max(mad * 1.4826, reference * 0.035, 0.01);
    const lowFence = Math.max(0, median - spread * 4);
    const highFence = median + spread * 4;
    const maxRatio = 5;
    const minRatio = 0.12;

    return points.filter((point) => {
      const price = Number(point?.price || 0);
      if (!Number.isFinite(price) || price <= 0) {
        return false;
      }
      if (price < lowFence || price > highFence) {
        return false;
      }
      if (reference > 0 && (price / reference > maxRatio || price / reference < minRatio)) {
        return false;
      }
      return true;
    });
  }

  function computeChartPriceBounds(prices) {
    const cleaned = prices
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((left, right) => left - right);

    if (!cleaned.length) {
      return { min: 0, max: 1 };
    }

    if (cleaned.length === 1) {
      const value = cleaned[0];
      const pad = Math.max(value * 0.12, 0.01);
      return { min: Math.max(0, value - pad), max: value + pad };
    }

    const pick = (percentile) => {
      const index = Math.min(
        cleaned.length - 1,
        Math.max(0, Math.floor((cleaned.length - 1) * percentile))
      );
      return cleaned[index];
    };

    const low = pick(0.06);
    const high = pick(0.94);
    const range = Math.max(high - low, high * 0.02, 0.01);
    const pad = range * 0.1;

    return {
      min: Math.max(0, low - pad),
      max: high + pad,
    };
  }

  function prepareChartDisplaySeries(points, referencePrice = 0) {
    const normalized = Array.isArray(points) ? points : [];
    const filtered = filterChartSeriesOutliers(normalized, referencePrice);
    const display = filtered.length >= 2 ? filtered : normalized;
    const priceBounds = computeChartPriceBounds(display.map((point) => point.price));
    return { points: display, priceBounds };
  }

  function seriesPriceSpread(points) {
    const prices = (Array.isArray(points) ? points : [])
      .map((point) => Number(point?.price || 0))
      .filter((price) => Number.isFinite(price) && price > 0);
    if (prices.length < 2) {
      return 0;
    }
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return max > 0 ? (max - min) / max : 0;
  }

  function deriveProviderSeriesFromSteamShape(steamPoints, providerAnchorPrice) {
    const steam = Array.isArray(steamPoints) ? steamPoints : [];
    const anchor = Number(providerAnchorPrice);
    if (steam.length < 2 || !Number.isFinite(anchor) || anchor <= 0) {
      return [];
    }

    const lastSteamPrice = Number(steam[steam.length - 1]?.price || 0);
    const baseSteam = lastSteamPrice > 0 ? lastSteamPrice : Number(steam[0]?.price || 0);
    if (!Number.isFinite(baseSteam) || baseSteam <= 0) {
      return [];
    }

    const scale = anchor / baseSteam;
    return steam.map((point) => ({
      date: String(point?.date || ""),
      price: Number((Number(point.price) * scale).toFixed(2)),
      volume: Math.max(1, Number(point?.volume || 1) || 1),
    })).filter((point) => point.date && point.price > 0);
  }

  function seriesNeedsSteamShape(providerPoints, steamPoints) {
    const steam = Array.isArray(steamPoints) ? steamPoints : [];
    const provider = Array.isArray(providerPoints) ? providerPoints : [];
    if (steam.length < 8) {
      return false;
    }
    if (provider.length < 8) {
      return true;
    }

    const steamSpread = seriesPriceSpread(steam);
    const providerSpread = seriesPriceSpread(provider);
    if (steamSpread <= 0) {
      return false;
    }

    return providerSpread < steamSpread * 0.45;
  }

  Object.assign(window.CS2ChartSeries || (window.CS2ChartSeries = {}), {
    chartMedian,
    filterChartSeriesOutliers,
    computeChartPriceBounds,
    prepareChartDisplaySeries,
    seriesPriceSpread,
    deriveProviderSeriesFromSteamShape,
    seriesNeedsSteamShape,
  });
})();
