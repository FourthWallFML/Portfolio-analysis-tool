import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  GitBranch,
  History,
  Link2,
  Pencil,
  Search,
} from 'lucide-react';
import { formatCurrency, formatSignedPct } from '../engine/ledger';
import {
  AssetMappingMap,
  AssetTagsMap,
  Position,
  PositionSortCol,
} from '../types/portfolio';

interface PositionsTabProps {
  positions: Position[];
  assetMapping: AssetMappingMap;
  assetTagsMap: AssetTagsMap;
  sortCol: PositionSortCol;
  sortAsc: boolean;
  onSetSort: (col: PositionSortCol) => void;
  getDisplayName: (pos: Position) => string;
  getCurrency: (isin: string) => string;
  getPriceEur: (isin: string) => number;
  getRawPrice: (isin: string) => number;
  formatOrigPrice: (isin: string) => string;
  hasPriceWarning: (isin: string) => boolean;
  onEditAsset: (isin: string) => void;
  onSelectTagFilter: (tag: string) => void;
  onOpenCorporateActions: () => void;
  onOpenManageMappings: () => void;
  onOpenClosedPositions: () => void;
  corporateActionsCount: number;
  closedPositionsCount: number;
}

export function PositionsTab({
  positions,
  assetMapping,
  assetTagsMap,
  sortCol,
  sortAsc,
  onSetSort,
  getDisplayName,
  getCurrency,
  getPriceEur,
  getRawPrice,
  formatOrigPrice,
  hasPriceWarning,
  onEditAsset,
  onSelectTagFilter,
  onOpenCorporateActions,
  onOpenManageMappings,
  onOpenClosedPositions,
  corporateActionsCount,
  closedPositionsCount,
}: PositionsTabProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredAndSorted = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = positions.filter((pos) => {
      if (!q) return true;
      const name = getDisplayName(pos).toLowerCase();
      const ticker = (assetMapping[pos.isin]?.ticker || '').toLowerCase();
      const tags = (assetTagsMap[pos.isin]?.tags || []).join(' ').toLowerCase();
      return (
        name.includes(q) ||
        pos.isin.toLowerCase().includes(q) ||
        ticker.includes(q) ||
        tags.includes(q)
      );
    });

    list.sort((a, b) => {
      let va = 0;
      let vb = 0;
      switch (sortCol) {
        case 'name': {
          const sa = getDisplayName(a).toLowerCase();
          const sb = getDisplayName(b).toLowerCase();
          return sortAsc ? sa.localeCompare(sb) : sb.localeCompare(sa);
        }
        case 'type': {
          const sa = a.isEtf ? 'ETF' : 'Aandeel';
          const sb = b.isEtf ? 'ETF' : 'Aandeel';
          return sortAsc ? sa.localeCompare(sb) : sb.localeCompare(sa);
        }
        case 'quantity':
          va = a.quantity;
          vb = b.quantity;
          break;
        case 'avgPrice':
          va = a.avgPrice;
          vb = b.avgPrice;
          break;
        case 'rawPrice':
          va = getRawPrice(a.isin);
          vb = getRawPrice(b.isin);
          break;
        case 'eurPrice':
          va = getPriceEur(a.isin);
          vb = getPriceEur(b.isin);
          break;
        case 'value':
          va = a.quantity * getPriceEur(a.isin);
          vb = b.quantity * getPriceEur(b.isin);
          break;
        case 'rendement':
          va = a.quantity * getPriceEur(a.isin) - a.quantity * a.avgPrice;
          vb = b.quantity * getPriceEur(b.isin) - b.quantity * b.avgPrice;
          break;
      }
      return sortAsc ? va - vb : vb - va;
    });

    return list;
  }, [
    positions,
    searchQuery,
    sortCol,
    sortAsc,
    getDisplayName,
    assetMapping,
    assetTagsMap,
    getRawPrice,
    getPriceEur,
  ]);

  const totalOpenValue = useMemo(
    () => filteredAndSorted.reduce((sum, p) => sum + p.quantity * getPriceEur(p.isin), 0),
    [filteredAndSorted, getPriceEur]
  );

  const totalOpenPnl = useMemo(
    () =>
      filteredAndSorted.reduce(
        (sum, p) => sum + (p.quantity * getPriceEur(p.isin) - p.quantity * p.avgPrice),
        0
      ),
    [filteredAndSorted, getPriceEur]
  );

  const renderSortIcon = (col: PositionSortCol) => {
    if (sortCol !== col) return null;
    return sortAsc ? (
      <ArrowUp className="w-3.5 h-3.5 text-emerald-400" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-emerald-400" />
    );
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="bg-[#0b142c] rounded-xl border border-[#1b2b52] p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Zoek op naam, ISIN, ticker of tag..."
            className="w-full bg-[#080e22] border border-[#1e3260] rounded-lg pl-9 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenManageMappings}
            className="px-3 py-2 rounded-lg text-xs font-medium bg-[#132247] hover:bg-[#182b59] text-slate-200 border border-[#1e3260] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Link2 className="w-3.5 h-3.5 text-sky-400" />
            <span>Mappings</span>
          </button>

          <button
            type="button"
            onClick={onOpenCorporateActions}
            className="px-3 py-2 rounded-lg text-xs font-medium bg-[#132247] hover:bg-[#182b59] text-slate-200 border border-[#1e3260] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <GitBranch className="w-3.5 h-3.5 text-amber-400" />
            <span>Corporate Actions ({corporateActionsCount})</span>
          </button>

          <button
            type="button"
            onClick={onOpenClosedPositions}
            className="px-3 py-2 rounded-lg text-xs font-medium bg-[#132247] hover:bg-[#182b59] text-slate-200 border border-[#1e3260] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <History className="w-3.5 h-3.5 text-emerald-400" />
            <span>Gesloten ({closedPositionsCount})</span>
          </button>
        </div>
      </div>

      {/* Positions Data Table */}
      <section className="bg-[#0b142c] rounded-xl border border-[#1b2b52] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#182649] flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="text-slate-300 font-medium">
            Openstaande Posities{' '}
            <span className="text-slate-500 font-mono tabular-nums">
              · {filteredAndSorted.length} van {positions.length}
            </span>
          </div>
          <div className="flex items-center gap-4 font-mono tabular-nums">
            <span className="text-slate-400">
              Waarde: <strong className="text-slate-100">{formatCurrency(totalOpenValue)}</strong>
            </span>
            <span className="text-slate-400">
              Resultaat:{' '}
              <strong className={totalOpenPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                {totalOpenPnl >= 0 ? '+' : ''}
                {formatCurrency(totalOpenPnl)}
              </strong>
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#080e22] text-slate-400 border-b border-[#182649] text-xs font-medium">
                <th
                  onClick={() => onSetSort('name')}
                  className="px-4 py-3 cursor-pointer hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Asset</span>
                    {renderSortIcon('name')}
                  </div>
                </th>
                <th
                  onClick={() => onSetSort('type')}
                  className="px-4 py-3 cursor-pointer hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Type</span>
                    {renderSortIcon('type')}
                  </div>
                </th>
                <th
                  onClick={() => onSetSort('quantity')}
                  className="px-4 py-3 text-right cursor-pointer hover:text-white transition-colors"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Aantal</span>
                    {renderSortIcon('quantity')}
                  </div>
                </th>
                <th
                  onClick={() => onSetSort('avgPrice')}
                  className="px-4 py-3 text-right cursor-pointer hover:text-white transition-colors"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>GAK (EUR)</span>
                    {renderSortIcon('avgPrice')}
                  </div>
                </th>
                <th
                  onClick={() => onSetSort('rawPrice')}
                  className="px-4 py-3 text-right cursor-pointer hover:text-white transition-colors"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Koers (Orig.)</span>
                    {renderSortIcon('rawPrice')}
                  </div>
                </th>
                <th
                  onClick={() => onSetSort('eurPrice')}
                  className="px-4 py-3 text-right cursor-pointer hover:text-white transition-colors"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Koers (EUR)</span>
                    {renderSortIcon('eurPrice')}
                  </div>
                </th>
                <th
                  onClick={() => onSetSort('value')}
                  className="px-4 py-3 text-right cursor-pointer hover:text-white transition-colors"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Waarde</span>
                    {renderSortIcon('value')}
                  </div>
                </th>
                <th
                  onClick={() => onSetSort('rendement')}
                  className="px-4 py-3 text-right cursor-pointer hover:text-white transition-colors"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Rendement</span>
                    {renderSortIcon('rendement')}
                  </div>
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#182649] text-xs">
              {filteredAndSorted.map((pos) => {
                const priceEur = getPriceEur(pos.isin);
                const valueEur = pos.quantity * priceEur;
                const costEur = pos.quantity * pos.avgPrice;
                const pnlEur = valueEur - costEur;
                const pnlPct = costEur > 0 ? (pnlEur / costEur) * 100 : 0;
                const currency = getCurrency(pos.isin);
                const tags = assetTagsMap[pos.isin]?.tags || [];
                const comment = assetTagsMap[pos.isin]?.comment || '';
                const warning = hasPriceWarning(pos.isin);

                return (
                  <tr key={pos.isin} className="hover:bg-[#132247]/40 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-100">{getDisplayName(pos)}</span>
                        <button
                          type="button"
                          onClick={() => onEditAsset(pos.isin)}
                          title="GAK, Aantal, Tags & Ticker aanpassen"
                          className="text-slate-500 hover:text-sky-400 p-1 rounded transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="text-[11px] text-slate-400 font-mono mt-0.5 flex flex-wrap items-center gap-x-1.5">
                        <span>{pos.isin}</span>
                        <span aria-hidden="true">·</span>
                        <span>{assetMapping[pos.isin]?.ticker || 'Geen ticker'}</span>
                        {currency !== 'EUR' && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-sky-400">{currency}</span>
                          </>
                        )}
                        {pos.caBadge && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-amber-300" title={pos.caNote}>
                              {pos.caBadge}
                            </span>
                          </>
                        )}
                        {pos.isManualOverride && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-violet-300" title={pos.overrideComment}>
                              Gecorrigeerd
                            </span>
                          </>
                        )}
                      </div>

                      {(tags.length > 0 || comment) && (
                        <div className="flex items-center gap-2 flex-wrap mt-1">
                          {tags.map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => onSelectTagFilter(tag)}
                              className="text-[11px] font-mono text-emerald-400 hover:text-emerald-300 hover:underline transition-colors"
                            >
                              #{tag}
                            </button>
                          ))}
                          {comment && (
                            <span className="text-[11px] text-slate-400 truncate max-w-[240px]" title={comment}>
                              — {comment}
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                      {pos.isEtf ? 'ETF' : 'Aandeel'}
                    </td>

                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                      {pos.quantity.toFixed(4)}
                    </td>

                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                      {formatCurrency(pos.avgPrice)}
                    </td>

                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                      {formatOrigPrice(pos.isin)}
                    </td>

                    <td className="px-4 py-3 text-right font-mono tabular-nums whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        {warning && (
                          <span
                            title="Geen live koers gevonden in Google Sheet; GAK gebruikt als fallback"
                            className="inline-flex items-center gap-1 text-amber-400 text-[11px]"
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>{priceEur === 0 ? '0' : 'GAK'}</span>
                          </span>
                        )}
                        <span className="text-emerald-400 font-semibold">
                          {formatCurrency(priceEur)}
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-3 text-right font-mono tabular-nums font-bold text-slate-100 whitespace-nowrap">
                      {formatCurrency(valueEur)}
                    </td>

                    <td className="px-4 py-3 text-right font-mono tabular-nums whitespace-nowrap">
                      <div className={`font-bold ${pnlEur >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {pnlEur >= 0 ? '+' : ''}
                        {formatCurrency(pnlEur)}
                      </div>
                      <div className="text-[11px] text-slate-400">{formatSignedPct(pnlPct)}</div>
                    </td>
                  </tr>
                );
              })}

              {filteredAndSorted.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                    {positions.length === 0
                      ? 'Geen openstaande posities gevonden. Synchroniseer met Google Sheet of upload een broker-bestand.'
                      : 'Geen posities gevonden voor je huidige zoekopdracht.'}
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
