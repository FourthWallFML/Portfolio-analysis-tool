import { DUMMY_ISINS } from '../services/googleSheets';
import {
  AssetMappingMap,
  BenchmarkConfig,
  ClientDeposit,
  ClientSummary,
  ComputedClientTranche,
  HistoryData,
  HorizonKey,
  TransactionRow,
  TwrHorizonSummary,
  TwrPoint,
  TwrSeriesResult,
} from '../types/portfolio';
import { getHistoricalPricesForTicker } from './ledger';
import { getVal, parseNum } from './parser';

export interface DownsampledSeries {
  dates: string[];
  indices: number[];
  values: number[];
}

/**
 * Downsamples a dense daily series to at most `maxPoints` while preserving
 * first/last points and min/max extrema per bucket for crisp 60fps Chart.js rendering.
 */
export function downsampleTwrSeries(
  dates: string[],
  values: number[],
  maxPoints = 320
): DownsampledSeries {
  const n = dates.length;
  if (n <= maxPoints || maxPoints < 4) {
    return {
      dates,
      values,
      indices: Array.from({ length: n }, (_, i) => i),
    };
  }

  const outDates: string[] = [dates[0]];
  const outValues: number[] = [values[0]];
  const outIndices: number[] = [0];

  const buckets = Math.floor((maxPoints - 2) / 2);
  const step = (n - 2) / buckets;

  for (let b = 0; b < buckets; b++) {
    const start = 1 + Math.floor(b * step);
    const end = Math.min(n - 1, 1 + Math.floor((b + 1) * step));
    if (start >= end) continue;

    let minIdx = start;
    let maxIdx = start;
    let minVal = values[start];
    let maxVal = values[start];

    for (let i = start + 1; i < end; i++) {
      const v = values[i];
      if (v < minVal) {
        minVal = v;
        minIdx = i;
      }
      if (v > maxVal) {
        maxVal = v;
        maxIdx = i;
      }
    }

    if (minIdx === maxIdx) {
      outIndices.push(minIdx);
      outDates.push(dates[minIdx]);
      outValues.push(values[minIdx]);
    } else if (minIdx < maxIdx) {
      outIndices.push(minIdx, maxIdx);
      outDates.push(dates[minIdx], dates[maxIdx]);
      outValues.push(values[minIdx], values[maxIdx]);
    } else {
      outIndices.push(maxIdx, minIdx);
      outDates.push(dates[maxIdx], dates[minIdx]);
      outValues.push(values[maxIdx], values[minIdx]);
    }
  }

  outIndices.push(n - 1);
  outDates.push(dates[n - 1]);
  outValues.push(values[n - 1]);

  return { dates: outDates, indices: outIndices, values: outValues };
}

/**
 * O(N * activeHoldings) pure TWR timeline builder.
 * Pre-resolves ticker series, FX series, and skips all history dates prior to the earliest transaction.
 */
export function buildPureTwrTimeline(
  transactions: TransactionRow[],
  historyData: HistoryData,
  assetMapping: AssetMappingMap,
  rates: Record<string, number>
): TwrPoint[] {
  const allDates = historyData.dates || [];
  if (allDates.length < 2 || !transactions || transactions.length === 0) return [];

  const txByDate: Record<string, Array<{ isin: string; deltaQty: number }>> = {};
  const divByDate: Record<string, number> = {};
  const involvedIsins = new Set<string>();
  let earliestTxDate = '';

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    const rawDate = getVal(tx, 'Transaction Time (CET)', 'Date', 'Time');
    const d = String(rawDate || '').split(' ')[0];
    if (!d) continue;

    const cat = getVal(tx, 'Transaction Category');
    const type = getVal(tx, 'Transaction Type');
    const trType = getVal(tx, 'Transfer Type').toUpperCase();
    const isin = getVal(tx, 'Asset Id', 'ISIN');
    const qty = Math.abs(parseNum(getVal(tx, 'Asset Quantity', 'Quantity')));
    const amt = parseNum(getVal(tx, 'Transaction Amount', 'Amount'));

    if (cat === 'dividends' || type.toLowerCase().includes('dividend')) {
      divByDate[d] = (divByDate[d] || 0) + Math.abs(amt);
      if (!earliestTxDate || d < earliestTxDate) earliestTxDate = d;
      continue;
    }

    if (cat === 'trades' && isin && !DUMMY_ISINS.includes(isin) && qty > 0) {
      if (!txByDate[d]) txByDate[d] = [];
      if (type === 'Buy Trade' && (trType === 'CASH_DEBIT' || trType === '')) {
        txByDate[d].push({ isin, deltaQty: qty });
        involvedIsins.add(isin);
        if (!earliestTxDate || d < earliestTxDate) earliestTxDate = d;
      } else if (type === 'Sell Trade' && (trType === 'CASH_CREDIT' || trType === '')) {
        txByDate[d].push({ isin, deltaQty: -qty });
        involvedIsins.add(isin);
        if (!earliestTxDate || d < earliestTxDate) earliestTxDate = d;
      }
    }
  }

  if (involvedIsins.size === 0 || !earliestTxDate) return [];

  // Pre-resolve price series and FX series ONCE per involved ISIN (eliminates O(days * holdings * tickers))
  interface ResolvedIsinSeries {
    series: number[] | null;
    ccy: string;
    fxSeries: number[] | null;
    fallbackFx: number;
  }

  const resolvedMap = new Map<string, ResolvedIsinSeries>();
  const hp = historyData.prices || {};

  involvedIsins.forEach((isin) => {
    const m = assetMapping[isin];
    if (!m) {
      resolvedMap.set(isin, { series: null, ccy: 'EUR', fxSeries: null, fallbackFx: 1.0 });
      return;
    }
    const series = getHistoricalPricesForTicker(
      m.googleTicker || m.ticker || m.apiTicker,
      historyData,
      assetMapping
    );
    const ccy = String(m.currency || 'EUR').toUpperCase();
    let fxSeries: number[] | null = null;
    let fallbackFx = 1.0;

    if (ccy !== 'EUR') {
      const fxTicker = ccy === 'GBX' ? 'CURRENCY:GBPEUR' : `CURRENCY:${ccy}EUR`;
      fxSeries = hp[fxTicker] || null;
      fallbackFx = (rates && (rates[ccy] || rates[`${ccy}EUR`])) || 1.0;
      if (ccy === 'GBX' && fallbackFx > 0.5) fallbackFx /= 100.0;
    }

    resolvedMap.set(isin, { series, ccy, fxSeries, fallbackFx });
  });

  const getHistPriceEurFast = (isin: string, idx: number): number => {
    const entry = resolvedMap.get(isin);
    if (!entry || !entry.series) return 0;
    const raw = entry.series[idx];
    if (!raw || raw <= 0) return 0;
    if (entry.ccy === 'EUR') return raw;
    let fx =
      entry.fxSeries && entry.fxSeries[idx] > 0 ? entry.fxSeries[idx] : entry.fallbackFx;
    if (entry.ccy === 'GBX' && fx > 0.5) fx /= 100.0;
    return raw * fx;
  };

  // Binary search to find the first history index >= earliestTxDate (skips thousands of pre-portfolio days)
  let startDateIdx = 0;
  {
    let lo = 0;
    let hi = allDates.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (allDates[mid] < earliestTxDate) lo = mid + 1;
      else hi = mid;
    }
    startDateIdx = Math.max(0, lo - 1);
  }

  const holdings = new Map<string, number>();
  const prevPriceEur = new Map<string, number>();
  const timeline: TwrPoint[] = [];

  const firstUsedDate = allDates[startDateIdx];
  Object.keys(txByDate)
    .sort()
    .forEach((d) => {
      if (d < firstUsedDate) {
        for (const t of txByDate[d]) {
          const nextQ = Math.max(0, (holdings.get(t.isin) || 0) + t.deltaQty);
          if (nextQ > 0.00001) holdings.set(t.isin, nextQ);
          else holdings.delete(t.isin);
        }
      }
    });

  for (let i = startDateIdx; i < allDates.length; i++) {
    const d = allDates[i];
    let startVal = 0;
    let endVal = 0;

    holdings.forEach((q, isin) => {
      const pTodayRaw = getHistPriceEurFast(isin, i);
      const pPrevStored = prevPriceEur.get(isin) || 0;
      const pToday = pTodayRaw || pPrevStored;
      const pPrev = pPrevStored || pToday;
      if (pPrev > 0 && pToday > 0) {
        startVal += q * pPrev;
        endVal += q * pToday;
      }
      if (pTodayRaw > 0) {
        prevPriceEur.set(isin, pTodayRaw);
      }
    });

    const divToday = divByDate[d] || 0;
    const dailyReturn = startVal >= 1 ? (endVal - startVal + divToday) / startVal : 0;

    const dayTxs = txByDate[d];
    if (dayTxs) {
      for (let k = 0; k < dayTxs.length; k++) {
        const t = dayTxs[k];
        const nextQ = Math.max(0, (holdings.get(t.isin) || 0) + t.deltaQty);
        if (nextQ > 0.00001) {
          holdings.set(t.isin, nextQ);
          if (!prevPriceEur.has(t.isin)) {
            const p = getHistPriceEurFast(t.isin, i);
            if (p > 0) prevPriceEur.set(t.isin, p);
          }
        } else {
          holdings.delete(t.isin);
        }
      }
    }

    if (holdings.size > 0 || startVal >= 1) {
      timeline.push({
        date: d,
        dailyReturn:
          Number.isFinite(dailyReturn) && dailyReturn > -0.5 && dailyReturn < 0.5
            ? dailyReturn
            : 0,
      });
    }
  }

  return timeline;
}

export function getActiveTwrTimeline(params: {
  forceTotal?: boolean;
  selectedBrokerFilter: string;
  selectedTagFilter: string;
  twrHistory: TwrPoint[];
  transactions: TransactionRow[];
  historyData: HistoryData;
  assetMapping: AssetMappingMap;
  rates: Record<string, number>;
}): TwrPoint[] {
  const {
    forceTotal = false,
    selectedBrokerFilter,
    selectedTagFilter,
    twrHistory,
    transactions,
    historyData,
    assetMapping,
    rates,
  } = params;

  const isFiltered =
    !forceTotal &&
    ((selectedBrokerFilter && selectedBrokerFilter !== 'ALL') ||
      (selectedTagFilter && selectedTagFilter !== 'ALL'));

  if (isFiltered || !twrHistory || twrHistory.length < 2) {
    return buildPureTwrTimeline(transactions, historyData, assetMapping, rates);
  }

  return twrHistory.map((pt) => ({
    date: pt.date,
    dailyReturn: Number(pt.dailyReturn) || 0,
  }));
}

export function getHorizonStartDate(horizonKey: HorizonKey, endDateStr: string): string {
  if (!endDateStr || horizonKey === 'MAX') return '1900-01-01';
  const end = new Date(`${endDateStr}T12:00:00Z`);
  const d = new Date(end.getTime());
  switch (horizonKey) {
    case '1W':
      d.setUTCDate(d.getUTCDate() - 7);
      break;
    case '1M':
      d.setUTCMonth(d.getUTCMonth() - 1);
      break;
    case '3M':
      d.setUTCMonth(d.getUTCMonth() - 3);
      break;
    case '6M':
      d.setUTCMonth(d.getUTCMonth() - 6);
      break;
    case 'YTD':
      return `${end.getUTCFullYear()}-01-01`;
    case '1Y':
      d.setUTCFullYear(d.getUTCFullYear() - 1);
      break;
    case '2Y':
      d.setUTCFullYear(d.getUTCFullYear() - 2);
      break;
    default:
      return '1900-01-01';
  }
  return d.toISOString().slice(0, 10);
}

export function computeTwrSeriesForHorizon(
  timeline: TwrPoint[],
  horizonKey: HorizonKey
): TwrSeriesResult {
  if (timeline.length < 2) {
    return { dates: [], values: [], totalReturnPct: 0, startDate: '', endDate: '' };
  }

  let startIdx = 0;
  if (horizonKey === '1D') {
    startIdx = Math.max(0, timeline.length - 2);
  } else {
    const endDate = timeline[timeline.length - 1].date;
    const startTarget = getHorizonStartDate(horizonKey, endDate);
    // Binary search for last index with date <= startTarget
    let lo = 0;
    let hi = timeline.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (timeline[mid].date <= startTarget) {
        startIdx = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
  }

  const len = timeline.length - startIdx;
  const dates = new Array<string>(len);
  const values = new Array<number>(len);
  dates[0] = timeline[startIdx].date;
  values[0] = 0;
  let factor = 1.0;

  for (let i = 1; i < len; i++) {
    const pt = timeline[startIdx + i];
    factor *= 1 + pt.dailyReturn;
    dates[i] = pt.date;
    values[i] = (factor - 1) * 100;
  }

  return {
    dates,
    values,
    totalReturnPct: (factor - 1) * 100,
    startDate: dates[0],
    endDate: dates[len - 1],
  };
}

export function buildDateIndexMap(dates: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < dates.length; i++) {
    map.set(dates[i], i);
  }
  return map;
}

export function getBenchmarkReturnSeries(
  bm: BenchmarkConfig,
  targetDates: string[],
  historyData: HistoryData,
  assetMapping: AssetMappingMap,
  latestPrices: Record<string, number>,
  rates: Record<string, number>,
  precomputedDateToIdx?: Map<string, number>
): Array<number | null> | null {
  if (!targetDates || targetDates.length < 2) return null;
  const rawSeries = getHistoricalPricesForTicker(bm.ticker, historyData, assetMapping);
  const allDates = historyData.dates || [];
  if (!rawSeries || allDates.length === 0) return null;

  const dateToIdx = precomputedDateToIdx || buildDateIndexMap(allDates);
  const todayStr = new Date().toISOString().slice(0, 10);
  const bmKey = String(bm.ticker || '').trim().toUpperCase();
  const liveBmRaw = latestPrices[bmKey] || latestPrices[bm.ticker] || 0;
  const ccy = String(bm.currency || 'EUR').toUpperCase();
  const fxTicker = ccy === 'GBX' ? 'CURRENCY:GBPEUR' : `CURRENCY:${ccy}EUR`;
  const fxSeries = ccy !== 'EUR' && historyData.prices ? historyData.prices[fxTicker] : null;
  const fallbackFx = (rates && (rates[ccy] || rates[`${ccy}EUR`])) || 1.0;

  let basePrice: number | null = null;
  let lastPrice: number | null = null;
  let hasAny = false;
  const pctSeries = new Array<number | null>(targetDates.length);

  for (let i = 0; i < targetDates.length; i++) {
    const d = targetDates[i];
    const idx = dateToIdx.get(d);
    let p: number | null = null;
    if (d === todayStr && liveBmRaw > 0) {
      p = liveBmRaw;
    } else if (idx !== undefined && rawSeries[idx] > 0) {
      p = rawSeries[idx];
    }

    if (p !== null && ccy !== 'EUR') {
      let fx = idx !== undefined && fxSeries && fxSeries[idx] > 0 ? fxSeries[idx] : fallbackFx;
      if (ccy === 'GBX' && fx > 0.5) fx /= 100.0;
      p *= fx;
    }

    if (p !== null && p > 0) lastPrice = p;
    if (basePrice === null && lastPrice !== null) basePrice = lastPrice;

    if (basePrice && lastPrice) {
      pctSeries[i] = (lastPrice / basePrice - 1) * 100;
      hasAny = true;
    } else {
      pctSeries[i] = null;
    }
  }

  return hasAny ? pctSeries : null;
}

export const HORIZON_DEFS: Array<{ key: HorizonKey; label: string }> = [
  { key: '1D', label: '1D' },
  { key: '1W', label: '1W' },
  { key: '1M', label: '1M' },
  { key: '3M', label: '3M' },
  { key: '6M', label: '6M' },
  { key: 'YTD', label: 'YTD' },
  { key: '1Y', label: '1Y' },
  { key: '2Y', label: '2Y' },
  { key: 'MAX', label: 'MAX' },
];

export const BENCHMARK_PALETTE = ['#38bdf8', '#f59e0b', '#a855f7', '#ec4899'];

export function computeTwrHorizonSummary(
  timeline: TwrPoint[],
  benchmarkConfigs: BenchmarkConfig[],
  historyData: HistoryData,
  assetMapping: AssetMappingMap,
  latestPrices: Record<string, number>,
  rates: Record<string, number>
): TwrHorizonSummary {
  const activeBms = (benchmarkConfigs || []).filter((b) => b.enabled !== false && b.ticker);
  const dateToIdx = activeBms.length > 0 ? buildDateIndexMap(historyData.dates || []) : undefined;

  const bmRows = activeBms.map((bm, idx) => ({
    ticker: bm.ticker,
    label: bm.label || bm.ticker,
    color: bm.color || BENCHMARK_PALETTE[idx % BENCHMARK_PALETTE.length],
    values: {} as Record<string, number | null>,
  }));

  const horizons = HORIZON_DEFS.map((h) => {
    const res = computeTwrSeriesForHorizon(timeline, h.key);
    const portfolioPct = Number.isFinite(res.totalReturnPct) ? res.totalReturnPct : 0;

    if (activeBms.length > 0 && res.dates.length >= 2) {
      // Only need start and end dates for benchmark total return over each horizon
      bmRows.forEach((bmRow, idx) => {
        const series = getBenchmarkReturnSeries(
          activeBms[idx],
          res.dates,
          historyData,
          assetMapping,
          latestPrices,
          rates,
          dateToIdx
        );
        let lastVal: number | null = null;
        if (series) {
          for (let i = series.length - 1; i >= 0; i--) {
            const val = series[i];
            if (val !== null && Number.isFinite(val)) {
              lastVal = val;
              break;
            }
          }
        }
        bmRow.values[h.key] = lastVal;
      });
    } else {
      bmRows.forEach((bmRow) => {
        bmRow.values[h.key] = null;
      });
    }

    return { ...h, portfolioPct };
  });

  return { horizons, benchmarks: bmRows };
}

export function computeClientTranches(
  clientDeposits: ClientDeposit[],
  totalTwrTimeline: TwrPoint[]
): ComputedClientTranche[] {
  if (!clientDeposits || clientDeposits.length === 0) return [];

  return [...clientDeposits]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((dep) => {
      let factor = 1.0;
      if (totalTwrTimeline.length > 0) {
        for (let i = 0; i < totalTwrTimeline.length; i++) {
          const pt = totalTwrTimeline[i];
          if (pt.date > dep.date && Number.isFinite(pt.dailyReturn)) {
            factor *= 1 + pt.dailyReturn;
          }
        }
      }
      const signedAmt = dep.type === 'withdrawal' ? -dep.amount : dep.amount;
      const returnPct = (factor - 1) * 100;
      const currentVal = signedAmt * factor;
      return {
        ...dep,
        returnPct: Number.isFinite(returnPct) ? returnPct : 0,
        currentVal: Number.isFinite(currentVal) ? currentVal : signedAmt,
        pnlEur: (Number.isFinite(currentVal) ? currentVal : signedAmt) - signedAmt,
      };
    });
}

export function computeClientSummaryList(tranches: ComputedClientTranche[]): ClientSummary[] {
  const map: Record<
    string,
    {
      person: string;
      firstDate: string;
      depositsCount: number;
      totalInvested: number;
      currentValue: number;
      tranches: ComputedClientTranche[];
    }
  > = {};

  tranches.forEach((tr) => {
    if (!map[tr.person]) {
      map[tr.person] = {
        person: tr.person,
        firstDate: tr.date,
        depositsCount: 0,
        totalInvested: 0,
        currentValue: 0,
        tranches: [],
      };
    }
    const signedAmt = tr.type === 'withdrawal' ? -tr.amount : tr.amount;
    map[tr.person].depositsCount += 1;
    map[tr.person].totalInvested += signedAmt;
    map[tr.person].currentValue += tr.currentVal;
    map[tr.person].tranches.push(tr);
    if (tr.date < map[tr.person].firstDate) {
      map[tr.person].firstDate = tr.date;
    }
  });

  return Object.values(map)
    .map((c) => {
      const pnlEur = c.currentValue - c.totalInvested;
      const totalReturnPct = c.totalInvested > 0 ? (pnlEur / c.totalInvested) * 100 : 0;
      return { ...c, pnlEur, totalReturnPct };
    })
    .sort((a, b) => b.currentValue - a.currentValue);
}

/**
 * Trims a multi-decade HistoryData payload to start shortly before the earliest transaction
 * so IndexedDB storage and parsing stay lightweight and fast.
 */
export function trimHistoryToPortfolioRange(
  historyData: HistoryData,
  earliestTxDate: string
): HistoryData {
  const dates = historyData.dates || [];
  if (dates.length < 400 || !earliestTxDate) return historyData;

  // Keep a 35-day buffer before earliest transaction for clean initial prices
  const cutoffDate = new Date(`${earliestTxDate}T12:00:00Z`);
  if (isNaN(cutoffDate.getTime())) return historyData;
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() - 35);
  const cutoffStr = cutoffDate.toISOString().slice(0, 10);

  let startIdx = 0;
  while (startIdx < dates.length && dates[startIdx] < cutoffStr) {
    startIdx++;
  }
  if (startIdx <= 10) return historyData;

  const trimmedPrices: Record<string, number[]> = {};
  for (const ticker in historyData.prices) {
    const arr = historyData.prices[ticker];
    if (Array.isArray(arr)) {
      trimmedPrices[ticker] = arr.slice(startIdx);
    }
  }

  return {
    dates: dates.slice(startIdx),
    tickers: historyData.tickers,
    prices: trimmedPrices,
  };
}
