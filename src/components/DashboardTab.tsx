import { useEffect, useRef } from 'react';
import { Chart, DoughnutController, ArcElement, Tooltip } from 'chart.js';
import { ArrowUpRight, ChevronRight } from 'lucide-react';
import { formatCurrency } from '../engine/ledger';
import { PortfolioBreakdown, PortfolioCosts } from '../types/portfolio';

Chart.register(DoughnutController, ArcElement, Tooltip);

interface DashboardTabProps {
  totalPortfolioValue: number;
  cashBalance: number;
  totalProfitLoss: number;
  deposits: number;
  withdrawals: number;
  realizedPnL: number;
  unrealizedPnL: number;
  breakdown: PortfolioBreakdown;
  costs: PortfolioCosts;
  isLoading: boolean;
  onOpenClosedPositions: () => void;
  onGoToPositions: () => void;
}

export function DashboardTab({
  totalPortfolioValue,
  cashBalance,
  totalProfitLoss,
  deposits,
  withdrawals,
  realizedPnL,
  unrealizedPnL,
  breakdown,
  costs,
  isLoading,
  onOpenClosedPositions,
  onGoToPositions,
}: DashboardTabProps) {
  const allocCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const costCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const allocChartRef = useRef<Chart | null>(null);
  const costChartRef = useRef<Chart | null>(null);

  useEffect(() => {
    const canvas = allocCanvasRef.current;
    if (!canvas) return;
    if (allocChartRef.current) {
      allocChartRef.current.destroy();
      allocChartRef.current = null;
    }

    const total = breakdown.shares.value + breakdown.etfs.value + breakdown.cash.value;
    allocChartRef.current = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Aandelen', 'ETFs', 'Cash'],
        datasets: [
          {
            data: total > 0 ? [breakdown.shares.value, breakdown.etfs.value, breakdown.cash.value] : [1],
            backgroundColor: total > 0 ? ['#2563eb', '#38bdf8', '#93c5fd'] : ['#182649'],
            borderColor: '#0b142c',
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        cutout: '72%',
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: total > 0,
            callbacks: {
              label: (ctx) => `${ctx.label}: ${formatCurrency(Number(ctx.raw || 0))}`,
            },
          },
        },
      },
    });

    return () => {
      if (allocChartRef.current) {
        allocChartRef.current.destroy();
        allocChartRef.current = null;
      }
    };
  }, [breakdown]);

  useEffect(() => {
    const canvas = costCanvasRef.current;
    if (!canvas) return;
    if (costChartRef.current) {
      costChartRef.current.destroy();
      costChartRef.current = null;
    }

    const total = costs.taxes + costs.tradingFees + costs.subscriptionFees;
    costChartRef.current = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Taksen', 'Trading Fees', 'Abonnementen'],
        datasets: [
          {
            data: total > 0 ? [costs.taxes, costs.tradingFees, costs.subscriptionFees] : [1],
            backgroundColor: total > 0 ? ['#9f1239', '#e11d48', '#fb7185'] : ['#182649'],
            borderColor: '#0b142c',
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        cutout: '72%',
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: total > 0,
            callbacks: {
              label: (ctx) => `${ctx.label}: ${formatCurrency(Number(ctx.raw || 0))}`,
            },
          },
        },
      },
    });

    return () => {
      if (costChartRef.current) {
        costChartRef.current.destroy();
        costChartRef.current = null;
      }
    };
  }, [costs]);

  const totalReturnPct = deposits > 0 ? (totalProfitLoss / deposits) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Primary Portfolio Summary Surface */}
      <section className="bg-[#0b142c] rounded-xl border border-[#1b2b52] p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-[#182649]">
          <div className="flex flex-col justify-center">
            <span className="text-xs font-medium text-slate-400">Waarde Portefeuille</span>
            {isLoading && totalPortfolioValue === 0 ? (
              <div className="h-10 w-48 bg-[#132247] rounded-md animate-pulse mt-1.5" />
            ) : (
              <div className="text-3xl sm:text-4xl font-extrabold text-slate-50 font-mono tabular-nums tracking-tight mt-1">
                {formatCurrency(totalPortfolioValue)}
              </div>
            )}
            <span className="text-xs text-slate-400 mt-1.5 font-mono tabular-nums">
              Waarvan cash: {formatCurrency(cashBalance)}
            </span>
          </div>

          <div className="flex flex-col justify-center md:items-end">
            <span className="text-xs font-medium text-slate-400">Totale Winst / Verlies</span>
            {isLoading && totalPortfolioValue === 0 ? (
              <div className="h-10 w-44 bg-[#132247] rounded-md animate-pulse mt-1.5" />
            ) : (
              <div
                className={`text-3xl sm:text-4xl font-extrabold font-mono tabular-nums tracking-tight mt-1 ${
                  totalProfitLoss >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {totalProfitLoss >= 0 ? '+' : ''}
                {formatCurrency(totalProfitLoss)}
              </div>
            )}
            <span className="text-xs text-slate-400 mt-1.5">
              Gerealiseerd + Ongerealiseerd
              {deposits > 0 && (
                <span className="font-mono tabular-nums text-slate-300">
                  {' '}
                  · {totalReturnPct >= 0 ? '+' : ''}
                  {totalReturnPct.toFixed(2).replace('.', ',')}% op stortingen
                </span>
              )}
            </span>
          </div>
        </div>

        {/* 5-Column KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6 pt-6">
          <div>
            <span className="text-xs font-medium text-slate-400 block">Stortingen</span>
            <div className="text-lg font-bold text-slate-100 mt-1 font-mono tabular-nums">
              {formatCurrency(deposits)}
            </div>
          </div>

          <div>
            <span className="text-xs font-medium text-slate-400 block">Afhalingen</span>
            <div className="text-lg font-bold text-slate-100 mt-1 font-mono tabular-nums">
              {formatCurrency(withdrawals)}
            </div>
          </div>

          <div>
            <span className="text-xs font-medium text-slate-400 block">Cash Positie</span>
            <div className="text-lg font-bold text-sky-400 mt-1 font-mono tabular-nums">
              {formatCurrency(cashBalance)}
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenClosedPositions}
            className="text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded-lg -m-1 p-1 transition-colors"
          >
            <span className="text-xs font-medium text-slate-400 flex items-center gap-1 group-hover:text-sky-400 transition-colors">
              <span>Gerealiseerde Winst</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-sky-400" />
            </span>
            <div
              className={`text-lg font-bold mt-1 font-mono tabular-nums underline decoration-dotted underline-offset-4 ${
                realizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {realizedPnL >= 0 ? '+' : ''}
              {formatCurrency(realizedPnL)}
            </div>
          </button>

          <button
            type="button"
            onClick={onGoToPositions}
            className="text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded-lg -m-1 p-1 transition-colors"
          >
            <span className="text-xs font-medium text-slate-400 flex items-center gap-1 group-hover:text-sky-400 transition-colors">
              <span>Ongerealiseerde Winst</span>
              <ChevronRight className="w-3.5 h-3.5 text-sky-400" />
            </span>
            <div
              className={`text-lg font-bold mt-1 font-mono tabular-nums underline decoration-dotted underline-offset-4 ${
                unrealizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {unrealizedPnL >= 0 ? '+' : ''}
              {formatCurrency(unrealizedPnL)}
            </div>
          </button>
        </div>
      </section>

      {/* Two-Column Breakdown & Costs Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* Portefeuilleverdeling */}
        <section className="bg-[#0b142c] rounded-xl border border-[#1b2b52] p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-4 border-b border-[#182649] mb-5">
            <div>
              <h2 className="text-base font-bold text-slate-100">Portefeuilleverdeling</h2>
              <p className="text-xs text-slate-400 mt-0.5">Spreiding over aandelen, indexfondsen en cash</p>
            </div>
            <span className="text-xs text-sky-400 font-mono tabular-nums">
              {breakdown.shares.count + breakdown.etfs.count} posities
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-center flex-1">
            <div className="sm:col-span-5 relative flex items-center justify-center h-44">
              <canvas ref={allocCanvasRef} />
            </div>

            <div className="sm:col-span-7 divide-y divide-[#182649] text-xs">
              <div className="flex items-center justify-between py-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#2563eb] shrink-0" />
                  <span className="text-slate-200 font-medium">Aandelen</span>
                  <span className="text-slate-500 font-mono tabular-nums">({breakdown.shares.count})</span>
                </div>
                <div className="text-right font-mono tabular-nums">
                  <span className="font-semibold text-slate-100">{formatCurrency(breakdown.shares.value)}</span>
                  <span className="text-slate-400 ml-2">{breakdown.shares.pct.toFixed(1)}%</span>
                </div>
              </div>

              <div className="flex items-center justify-between py-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#38bdf8] shrink-0" />
                  <span className="text-slate-200 font-medium">Indexfondsen (ETFs)</span>
                  <span className="text-slate-500 font-mono tabular-nums">({breakdown.etfs.count})</span>
                </div>
                <div className="text-right font-mono tabular-nums">
                  <span className="font-semibold text-slate-100">{formatCurrency(breakdown.etfs.value)}</span>
                  <span className="text-slate-400 ml-2">{breakdown.etfs.pct.toFixed(1)}%</span>
                </div>
              </div>

              <div className="flex items-center justify-between py-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#93c5fd] shrink-0" />
                  <span className="text-slate-200 font-medium">Cash</span>
                </div>
                <div className="text-right font-mono tabular-nums">
                  <span className="font-semibold text-slate-100">{formatCurrency(breakdown.cash.value)}</span>
                  <span className="text-slate-400 ml-2">{breakdown.cash.pct.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Kosten & Belastingen */}
        <section className="bg-[#0b142c] rounded-xl border border-[#1b2b52] p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-4 border-b border-[#182649] mb-5">
            <div>
              <h2 className="text-base font-bold text-slate-100">Kosten &amp; Belastingen</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Netto kosten: <span className="font-mono tabular-nums text-slate-200 font-semibold">{formatCurrency(costs.netCosts)}</span>
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-rose-400">
              {costs.costPercentage.toFixed(2).replace('.', ',')}% van inleg
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-center flex-1">
            <div className="sm:col-span-5 relative flex items-center justify-center h-44">
              <canvas ref={costCanvasRef} />
            </div>

            <div className="sm:col-span-7 divide-y divide-[#182649] text-xs">
              <div className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#9f1239] shrink-0" />
                  <span className="text-slate-200 font-medium">Beurstaksen (TOB)</span>
                </div>
                <span className="font-mono tabular-nums font-semibold text-slate-100">
                  {formatCurrency(costs.taxes)}
                </span>
              </div>

              <div className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#e11d48] shrink-0" />
                  <span className="text-slate-200 font-medium">Trading Fees</span>
                </div>
                <span className="font-mono tabular-nums font-semibold text-slate-100">
                  {formatCurrency(costs.tradingFees)}
                </span>
              </div>

              <div className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#fb7185] shrink-0" />
                  <span className="text-slate-200 font-medium">Abonnementen &amp; Overig</span>
                </div>
                <span className="font-mono tabular-nums font-semibold text-slate-100">
                  {formatCurrency(costs.subscriptionFees)}
                </span>
              </div>

              <div className="flex items-center justify-between py-2.5 text-emerald-400">
                <span className="font-medium">Compensaties / Terugstortingen</span>
                <span className="font-mono tabular-nums font-bold">
                  -{formatCurrency(costs.compensations)}
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
