import { useEffect, useMemo, useRef } from 'react';
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Legend,
  Tooltip,
} from 'chart.js';
import { RefreshCw } from 'lucide-react';
import { formatSignedPct } from '../engine/ledger';
import {
  BENCHMARK_PALETTE,
  buildDateIndexMap,
  computeTwrSeriesForHorizon,
  downsampleTwrSeries,
  getBenchmarkReturnSeries,
} from '../engine/twr';
import {
  AssetMappingMap,
  BenchmarkConfig,
  HistoryData,
  HorizonKey,
  TwrHorizonSummary,
  TwrPoint,
} from '../types/portfolio';

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Legend,
  Tooltip
);

interface TwrTabProps {
  timeline: TwrPoint[];
  twrHorizon: HorizonKey;
  onSelectHorizon: (horizon: HorizonKey) => void;
  twrHorizonSummary: TwrHorizonSummary;
  benchmarkConfigs: BenchmarkConfig[];
  historyData: HistoryData;
  assetMapping: AssetMappingMap;
  latestPrices: Record<string, number>;
  rates: Record<string, number>;
  isFullSyncLoading: boolean;
  historyCachedAt: number | null;
  onForceRefreshHistory: () => void;
}

export function TwrTab({
  timeline,
  twrHorizon,
  onSelectHorizon,
  twrHorizonSummary,
  benchmarkConfigs,
  historyData,
  assetMapping,
  latestPrices,
  rates,
  isFullSyncLoading,
  historyCachedAt,
  onForceRefreshHistory,
}: TwrTabProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);

  const dateToIdx = useMemo(
    () => buildDateIndexMap(historyData.dates || []),
    [historyData.dates]
  );

  const activeSeries = useMemo(
    () => computeTwrSeriesForHorizon(timeline, twrHorizon),
    [timeline, twrHorizon]
  );

  const chartPayload = useMemo(() => {
    if (activeSeries.dates.length < 2) {
      return null;
    }

    const sampled = downsampleTwrSeries(activeSeries.dates, activeSeries.values, 320);

    const datasets: Array<{
      label: string;
      data: Array<number | null>;
      borderColor: string;
      backgroundColor?: string;
      borderWidth: number;
      borderDash?: number[];
      pointRadius: number;
      pointHoverRadius: number;
      fill: boolean;
      tension: number;
    }> = [
      {
        label: 'Mijn Portefeuille (TWR %)',
        data: sampled.values,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.12)',
        borderWidth: 2.2,
        pointRadius: sampled.dates.length <= 8 ? 3 : 0,
        pointHoverRadius: 4,
        fill: true,
        tension: 0.12,
      },
    ];

    const activeBms = (benchmarkConfigs || []).filter((b) => b.enabled !== false && b.ticker);
    activeBms.forEach((bm, idx) => {
      const bmSeries = getBenchmarkReturnSeries(
        bm,
        sampled.dates,
        historyData,
        assetMapping,
        latestPrices,
        rates,
        dateToIdx
      );
      if (bmSeries) {
        datasets.push({
          label: bm.label || bm.ticker,
          data: bmSeries,
          borderColor: bm.color || BENCHMARK_PALETTE[idx % BENCHMARK_PALETTE.length],
          borderWidth: 1.8,
          borderDash: [4, 3],
          pointRadius: sampled.dates.length <= 8 ? 2 : 0,
          pointHoverRadius: 3,
          fill: false,
          tension: 0.12,
        });
      }
    });

    return { labels: sampled.dates, datasets };
  }, [activeSeries, benchmarkConfigs, historyData, assetMapping, latestPrices, rates, dateToIdx]);

  // Update Chart.js in-place (zero canvas teardown/recreation when switching horizons)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !chartPayload) {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
      return;
    }

    if (chartRef.current) {
      chartRef.current.data.labels = chartPayload.labels;
      chartRef.current.data.datasets = chartPayload.datasets;
      chartRef.current.update('none');
      return;
    }

    chartRef.current = new Chart(canvas, {
      type: 'line',
      data: {
        labels: chartPayload.labels,
        datasets: chartPayload.datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        normalized: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            labels: {
              color: '#cbd5e1',
              font: { size: 11, family: 'Plus Jakarta Sans, sans-serif' },
              usePointStyle: true,
              boxWidth: 8,
            },
          },
          tooltip: {
            backgroundColor: '#0b142c',
            borderColor: '#1e3260',
            borderWidth: 1,
            titleColor: '#f8fafc',
            bodyColor: '#e2e8f0',
            callbacks: {
              label: (ctx) => {
                const y = ctx.parsed.y;
                return `${ctx.dataset.label}: ${
                  y !== null && Number.isFinite(y)
                    ? `${y >= 0 ? '+' : ''}${y.toFixed(2).replace('.', ',')}%`
                    : '—'
                }`;
              },
            },
          },
        },
        scales: {
          x: {
            ticks: {
              color: '#94a3b8',
              maxTicksLimit: 8,
              font: { size: 10, family: 'JetBrains Mono, monospace' },
            },
            grid: { color: '#182649' },
          },
          y: {
            ticks: {
              color: '#94a3b8',
              callback: (v) => `${v}%`,
              font: { size: 10, family: 'JetBrains Mono, monospace' },
            },
            grid: { color: '#182649' },
          },
        },
      },
    });
  }, [chartPayload]);

  // Destroy chart strictly on unmount
  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, []);

  const cacheLabel = historyCachedAt
    ? `Historie gecacht om ${new Date(historyCachedAt).toLocaleTimeString('nl-NL', {
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : null;

  return (
    <div className="space-y-6">
      {/* 1. Horizon KPI Strip */}
      <section className="bg-[#0b142c] rounded-xl border border-[#1b2b52] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-100">Portefeuille TWR per Horizon</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Selecteer een periode om de grafiek direct op die horizon te zetten.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            {activeSeries.startDate && (
              <span className="font-mono tabular-nums text-slate-400">
                {activeSeries.startDate} → {activeSeries.endDate}
              </span>
            )}
            {cacheLabel && (
              <span className="hidden sm:inline text-slate-500">· {cacheLabel}</span>
            )}
            <button
              type="button"
              onClick={onForceRefreshHistory}
              disabled={isFullSyncLoading}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#132247] hover:bg-[#182b59] text-sky-400 border border-[#1e3260] font-medium transition-colors disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFullSyncLoading ? 'animate-spin' : ''}`} />
              <span>{isFullSyncLoading ? 'Historie laden...' : 'Historie verversen'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
          {twrHorizonSummary.horizons.map((h) => {
            const isSelected = twrHorizon === h.key;
            return (
              <button
                key={h.key}
                type="button"
                onClick={() => onSelectHorizon(h.key)}
                className={`p-3 rounded-lg border text-left transition-colors flex flex-col justify-between ${
                  isSelected
                    ? 'bg-[#132247] border-emerald-500 ring-1 ring-emerald-500/40'
                    : 'bg-[#080e22] border-[#1e3260] hover:border-sky-400/60'
                }`}
              >
                <span className="text-[11px] font-semibold text-slate-400">{h.label}</span>
                <span
                  className={`text-sm font-bold font-mono tabular-nums mt-1 ${
                    h.portfolioPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {formatSignedPct(h.portfolioPct)}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. TWR Line Chart */}
      <section className="bg-[#0b142c] rounded-xl border border-[#1b2b52] p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#182649]">
          <div>
            <h3 className="text-base font-bold text-slate-100">
              TWR Grafiek — Portefeuille vs. Benchmarks
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Cumulatief Time-Weighted Return (%) in EUR, genormaliseerd op 0% bij start van de periode.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1 bg-[#080e22] p-1 rounded-lg border border-[#1e3260]">
            {twrHorizonSummary.horizons.map((h) => (
              <button
                key={`btn_${h.key}`}
                type="button"
                onClick={() => onSelectHorizon(h.key)}
                className={`px-2.5 py-1 rounded-md text-xs font-mono transition-colors whitespace-nowrap shrink-0 ${
                  twrHorizon === h.key
                    ? 'bg-emerald-500 text-slate-950 font-bold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {h.label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative h-72 sm:h-80 w-full">
          {!chartPayload ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 text-sm">
              {isFullSyncLoading ? (
                <>
                  <div className="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mb-3" />
                  <p>Historische koersen worden eenmalig uit Google Sheet geladen en lokaal gecacht...</p>
                </>
              ) : (
                <p>Nog onvoldoende historische datapunten voor de gekozen periode.</p>
              )}
            </div>
          ) : (
            <canvas ref={canvasRef} />
          )}
        </div>
      </section>

      {/* 3. Rendement & Alpha Matrix */}
      <section className="bg-[#0b142c] rounded-xl border border-[#1b2b52] overflow-hidden">
        <div className="p-5 border-b border-[#182649]">
          <h3 className="text-base font-bold text-slate-100">
            Rendement &amp; Alpha Matrix (Portefeuille vs. Benchmarks)
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Onder elk benchmark-rendement staat het verschil in procentpunten (pp) van jouw portefeuille.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-right border-collapse">
            <thead>
              <tr className="bg-[#080e22] text-slate-400 border-b border-[#182649]">
                <th className="text-left px-4 py-3 font-semibold sticky left-0 bg-[#080e22]">
                  Portefeuille / Benchmark
                </th>
                {twrHorizonSummary.horizons.map((h) => (
                  <th
                    key={`th_${h.key}`}
                    onClick={() => onSelectHorizon(h.key)}
                    className={`px-3 py-3 font-mono font-semibold cursor-pointer hover:text-white transition-colors ${
                      twrHorizon === h.key ? 'text-emerald-400' : ''
                    }`}
                  >
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#182649] font-mono tabular-nums">
              <tr className="bg-[#132247]/40">
                <td className="text-left px-4 py-3 font-sans font-bold text-slate-100 sticky left-0 bg-[#0f1c3d] whitespace-nowrap">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500 mr-2 align-middle" />
                  Mijn Portefeuille (TWR)
                </td>
                {twrHorizonSummary.horizons.map((h) => (
                  <td
                    key={`port_${h.key}`}
                    className={`px-3 py-3 font-bold whitespace-nowrap ${
                      h.portfolioPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {formatSignedPct(h.portfolioPct)}
                  </td>
                ))}
              </tr>

              {twrHorizonSummary.benchmarks.map((bm) => (
                <tr key={bm.ticker} className="hover:bg-[#132247]/25 transition-colors">
                  <td className="text-left px-4 py-3 font-sans sticky left-0 bg-[#0b142c] whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: bm.color }}
                      />
                      <span className="font-semibold text-slate-200">{bm.label}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 pl-4.5">Delta (Port − BM)</div>
                  </td>
                  {twrHorizonSummary.horizons.map((h) => {
                    const bmVal = bm.values[h.key];
                    const hasVal = bmVal !== null && bmVal !== undefined;
                    const delta = hasVal ? h.portfolioPct - bmVal : 0;
                    return (
                      <td key={`${bm.ticker}_${h.key}`} className="px-3 py-3 whitespace-nowrap">
                        {hasVal ? (
                          <div>
                            <div
                              className={`font-semibold ${
                                bmVal >= 0 ? 'text-slate-200' : 'text-slate-400'
                              }`}
                            >
                              {formatSignedPct(bmVal)}
                            </div>
                            <div
                              className={`text-[11px] ${
                                delta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {delta >= 0 ? '+' : ''}
                              {delta.toFixed(2).replace('.', ',')} pp
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}

              {twrHorizonSummary.benchmarks.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-center font-sans text-slate-400">
                    Geen actieve benchmarks gevonden in de Google Sheet tabbladen Benchmarks / Historie.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
