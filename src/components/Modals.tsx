import { ChangeEvent, FormEvent, ReactNode, useMemo, useState } from 'react';
import { Trash2, Upload, X } from 'lucide-react';
import { formatCurrency } from '../engine/ledger';
import { parseNum } from '../engine/parser';
import { DEFAULT_GOOGLE_SCRIPT_URL } from '../services/googleSheets';
import {
  AssetMappingEntry,
  AssetMappingMap,
  ClosedPosition,
  CorporateAction,
  CsvBatch,
  EditingAssetForm,
  Position,
  TransactionRow,
} from '../types/portfolio';

const CURRENCY_OPTIONS = ['EUR', 'USD', 'GBP', 'GBX', 'CHF', 'CAD', 'SEK', 'NOK', 'DKK', 'JPY', 'AUD'];

interface ModalShellProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
}

function ModalShell({
  title,
  subtitle,
  onClose,
  children,
  footer,
  maxWidth = 'max-w-2xl',
}: ModalShellProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full ${maxWidth} max-h-[90vh] flex flex-col bg-[#0b142c] border border-[#1e3260] rounded-xl overflow-hidden shadow-2xl`}
      >
        <div className="px-5 py-4 border-b border-[#182649] flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-100">{title}</h3>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Sluiten"
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1">{children}</div>

        {footer && (
          <div className="px-5 py-3.5 border-t border-[#182649] bg-[#080e22] flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================================
   1. Edit Asset Modal (ISIN, Tickers, Currency, GAK/Qty override, Tags, Comment)
   ============================================================================ */
interface EditAssetModalProps {
  initialForm: EditingAssetForm;
  onClose: () => void;
  onSave: (form: EditingAssetForm) => void;
}

export function EditAssetModal({ initialForm, onClose, onSave }: EditAssetModalProps) {
  const [form, setForm] = useState<EditingAssetForm>(initialForm);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <ModalShell
      title="Asset Bewerken & Corrigeer GAK"
      subtitle={`ISIN: ${form.isin}`}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium bg-[#132247] hover:bg-[#182b59] text-slate-200 transition-colors"
          >
            Annuleren
          </button>
          <button
            type="submit"
            form="edit-asset-form"
            className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors"
          >
            Opslaan &amp; Syncen
          </button>
        </>
      }
    >
      <form id="edit-asset-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-slate-400 font-medium mb-1">Weergavenaam</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full bg-[#080e22] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-sky-400"
            />
          </div>

          <div>
            <label className="block text-slate-400 font-medium mb-1">ISIN Code</label>
            <input
              type="text"
              value={form.newIsin}
              onChange={(e) => setForm({ ...form, newIsin: e.target.value.toUpperCase() })}
              className="w-full bg-[#080e22] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100 font-mono uppercase focus:outline-none focus:border-sky-400"
            />
          </div>

          <div>
            <label className="block text-slate-400 font-medium mb-1">Google Finance Ticker</label>
            <input
              type="text"
              value={form.ticker}
              onChange={(e) => setForm({ ...form, ticker: e.target.value })}
              placeholder="bv. AMS:ASML of NASDAQ:NVDA"
              className="w-full bg-[#080e22] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-sky-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-slate-400 font-medium mb-1">API Ticker</label>
              <input
                type="text"
                value={form.apiTicker}
                onChange={(e) => setForm({ ...form, apiTicker: e.target.value })}
                placeholder="bv. ASML.AS"
                className="w-full bg-[#080e22] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-sky-400"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">Valuta</label>
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="w-full bg-[#080e22] border border-[#1e3260] rounded-lg px-2.5 py-2 text-slate-100 font-mono focus:outline-none focus:border-sky-400"
              >
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-[#182649] space-y-3">
          <div className="text-slate-300 font-semibold">
            Handmatige GAK / Aantal Correctie (optioneel — laat leeg voor automatische berekening)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 font-medium mb-1">
                Override GAK (EUR) · huidig: {formatCurrency(form.currentGak)}
              </label>
              <input
                type="number"
                step="any"
                value={form.overrideGak}
                onChange={(e) => setForm({ ...form, overrideGak: e.target.value })}
                placeholder="Leeg = automatisch"
                className="w-full bg-[#080e22] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100 font-mono tabular-nums focus:outline-none focus:border-emerald-400"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">
                Override Aantal · huidig: {form.currentQty.toFixed(4)}
              </label>
              <input
                type="number"
                step="any"
                value={form.overrideQty}
                onChange={(e) => setForm({ ...form, overrideQty: e.target.value })}
                placeholder="Leeg = automatisch"
                className="w-full bg-[#080e22] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100 font-mono tabular-nums focus:outline-none focus:border-emerald-400"
              />
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-[#182649] grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-slate-400 font-medium mb-1">
              Tags (gescheiden door komma)
            </label>
            <input
              type="text"
              value={form.tagsText}
              onChange={(e) => setForm({ ...form, tagsText: e.target.value })}
              placeholder="bv. Hangmat, Dividend, Groei"
              className="w-full bg-[#080e22] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-emerald-400"
            />
          </div>
          <div>
            <label className="block text-slate-400 font-medium mb-1">Notitie / Comment</label>
            <input
              type="text"
              value={form.comment}
              onChange={(e) => setForm({ ...form, comment: e.target.value })}
              placeholder="Korte toelichting..."
              className="w-full bg-[#080e22] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-emerald-400"
            />
          </div>
        </div>
      </form>
    </ModalShell>
  );
}

/* ============================================================================
   2. Manage Mappings Modal
   ============================================================================ */
interface ManageMappingsModalProps {
  entries: Array<[string, AssetMappingEntry]>;
  onSaveMapping: (isin: string, ticker: string, currency: string) => void;
  onClose: () => void;
}

export function ManageMappingsModal({
  entries,
  onSaveMapping,
  onClose,
}: ManageMappingsModalProps) {
  const [drafts, setDrafts] = useState<Record<string, { ticker: string; currency: string }>>(() => {
    const init: Record<string, { ticker: string; currency: string }> = {};
    entries.forEach(([isin, item]) => {
      init[isin] = {
        ticker: item.googleTicker || item.ticker || '',
        currency: item.currency || 'EUR',
      };
    });
    return init;
  });
  const [filter, setFilter] = useState('');

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return entries.filter(([isin, item]) => {
      if (!q) return true;
      return (
        isin.toLowerCase().includes(q) ||
        (item.name || '').toLowerCase().includes(q) ||
        (item.ticker || '').toLowerCase().includes(q)
      );
    });
  }, [entries, filter]);

  return (
    <ModalShell
      title="Asset Mappings Beheren"
      subtitle="Koppel ISIN-codes aan Google Finance tickers en valuta (synchroniseert direct met Google Sheet)."
      onClose={onClose}
      maxWidth="max-w-3xl"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg text-xs font-medium bg-[#132247] hover:bg-[#182b59] text-slate-200 transition-colors"
        >
          Sluiten
        </button>
      }
    >
      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter op naam, ISIN of ticker..."
        className="w-full bg-[#080e22] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-sky-400"
      />

      <div className="divide-y divide-[#182649] border border-[#182649] rounded-lg overflow-hidden">
        {visible.map(([isin, item]) => {
          const d = drafts[isin] || { ticker: item.ticker || '', currency: item.currency || 'EUR' };
          return (
            <div
              key={isin}
              className="p-3 bg-[#080e22] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
            >
              <div className="min-w-0">
                <div className="font-semibold text-slate-100 truncate">{item.name || isin}</div>
                <div className="text-[11px] font-mono text-slate-400">{isin}</div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="text"
                  value={d.ticker}
                  onChange={(e) =>
                    setDrafts({ ...drafts, [isin]: { ...d, ticker: e.target.value } })
                  }
                  placeholder="EPA:MC"
                  className="bg-[#132247] border border-[#1e3260] rounded-lg px-2.5 py-1.5 w-32 text-slate-100 font-mono focus:outline-none focus:border-emerald-400"
                />
                <select
                  value={d.currency}
                  onChange={(e) =>
                    setDrafts({ ...drafts, [isin]: { ...d, currency: e.target.value } })
                  }
                  className="bg-[#132247] border border-[#1e3260] rounded-lg px-2 py-1.5 text-slate-100 font-mono focus:outline-none focus:border-emerald-400"
                >
                  {CURRENCY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => onSaveMapping(isin, d.ticker, d.currency)}
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                >
                  Opslaan
                </button>
              </div>
            </div>
          );
        })}

        {visible.length === 0 && (
          <div className="p-6 text-center text-slate-400">Geen mappings gevonden.</div>
        )}
      </div>
    </ModalShell>
  );
}

/* ============================================================================
   3. Closed Positions Modal
   ============================================================================ */
interface ClosedPositionsModalProps {
  closedPositions: ClosedPosition[];
  totalRealizedPnL: number;
  onClose: () => void;
}

export function ClosedPositionsModal({
  closedPositions,
  totalRealizedPnL,
  onClose,
}: ClosedPositionsModalProps) {
  return (
    <ModalShell
      title="Gesloten Posities & Gerealiseerde Winst"
      subtitle={`Totaal gerealiseerd resultaat: ${
        totalRealizedPnL >= 0 ? '+' : ''
      }${formatCurrency(totalRealizedPnL)}`}
      onClose={onClose}
      maxWidth="max-w-3xl"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg text-xs font-medium bg-[#132247] hover:bg-[#182b59] text-slate-200 transition-colors"
        >
          Sluiten
        </button>
      }
    >
      <div className="border border-[#182649] rounded-lg overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-[#080e22] text-slate-400 border-b border-[#182649]">
              <th className="px-4 py-2.5 font-medium">Asset</th>
              <th className="px-4 py-2.5 text-right font-medium">Verkocht / Gesloten</th>
              <th className="px-4 py-2.5 text-right font-medium">Gerealiseerde P&amp;L</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#182649]">
            {closedPositions.map((cp) => (
              <tr key={cp.isin} className="hover:bg-[#132247]/30">
                <td className="px-4 py-3">
                  <div className="font-semibold text-slate-100">{cp.name}</div>
                  <div className="text-[11px] font-mono text-slate-400">{cp.isin}</div>
                  {cp.note && <div className="text-[11px] text-amber-300 mt-0.5">{cp.note}</div>}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-300">
                  {cp.soldQuantity.toFixed(4)}
                </td>
                <td
                  className={`px-4 py-3 text-right font-mono tabular-nums font-bold ${
                    cp.realizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {cp.realizedPnL >= 0 ? '+' : ''}
                  {formatCurrency(cp.realizedPnL)}
                </td>
              </tr>
            ))}
            {closedPositions.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-400">
                  Nog geen gesloten posities geregistreerd.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </ModalShell>
  );
}

/* ============================================================================
   4. Corporate Actions Modal
   ============================================================================ */
interface CorporateActionsModalProps {
  corporateActions: CorporateAction[];
  positions: Position[];
  knownAssets: Array<{ isin: string; name: string }>;
  describeAction: (ca: CorporateAction) => string;
  onAddAction: (ca: Omit<CorporateAction, 'id'>) => void;
  onRemoveAction: (index: number) => void;
  onClose: () => void;
}

export function CorporateActionsModal({
  corporateActions,
  positions,
  knownAssets,
  describeAction,
  onAddAction,
  onRemoveAction,
  onClose,
}: CorporateActionsModalProps) {
  const [type, setType] = useState<'merger' | 'split' | 'rename'>('merger');
  const [fromIsin, setFromIsin] = useState('');
  const [toIsin, setToIsin] = useState('');
  const [toName, setToName] = useState('');
  const [toTicker, setToTicker] = useState('');
  const [ratio, setRatio] = useState('1');
  const [cashBoot, setCashBoot] = useState('0');
  const [isin, setIsin] = useState('');
  const [mode, setMode] = useState<'divide' | 'multiply'>('divide');
  const [factor, setFactor] = useState('100');
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');

  const mergerPreview = useMemo(() => {
    if (type !== 'merger' || !fromIsin) return null;
    const numRatio = parseFloat(ratio) || 0;
    const numCash = parseFloat(cashBoot) || 0;
    if (numRatio <= 0) return null;
    const fromPos = positions.find((p) => p.isin === fromIsin);
    if (!fromPos || fromPos.quantity <= 0.0001) return null;

    const cleanToIsin = toIsin.trim().toUpperCase();
    const targetPos = positions.find((p) => p.isin === cleanToIsin);
    const newConvertedQty = fromPos.quantity * numRatio;
    const transferredCost = Math.max(0, fromPos.totalCost - numCash);
    const convertedGak = newConvertedQty > 0 ? transferredCost / newConvertedQty : 0;

    const existingTargetQty = targetPos ? targetPos.quantity : 0;
    const existingTargetCost = targetPos ? targetPos.totalCost : 0;
    const finalQty = existingTargetQty + newConvertedQty;
    const finalGak = finalQty > 0 ? (existingTargetCost + transferredCost) / finalQty : 0;

    return {
      fromName: fromPos.name,
      toName: toName.trim() || targetPos?.name || cleanToIsin || 'Doelaandeel',
      ratio: numRatio,
      oldQty: fromPos.quantity,
      oldGak: fromPos.avgPrice,
      newConvertedQty,
      convertedGak,
      existingTargetQty,
      existingTargetGak: targetPos ? targetPos.avgPrice : 0,
      finalQty,
      finalGak,
    };
  }, [type, fromIsin, toIsin, toName, ratio, cashBoot, positions]);

  const handleApply = () => {
    setError('');
    if (type === 'merger') {
      const cleanTo = toIsin.trim().toUpperCase();
      if (!fromIsin || !cleanTo) {
        setError('Selecteer een oud aandeel en vul een nieuw doel-ISIN in.');
        return;
      }
      if (fromIsin === cleanTo) {
        setError('Bron-ISIN en Doel-ISIN moeten verschillend zijn.');
        return;
      }
      onAddAction({
        type: 'merger',
        fromIsin,
        toIsin: cleanTo,
        toName: toName.trim(),
        toTicker: toTicker.trim(),
        ratio: parseFloat(ratio) || 1,
        cashBoot: parseFloat(cashBoot) || 0,
      });
      setFromIsin('');
      setToIsin('');
      setToName('');
      setToTicker('');
      setRatio('1');
      setCashBoot('0');
    } else if (type === 'split') {
      const f = parseFloat(factor);
      if (!isin || !f || f <= 0) {
        setError('Kies een aandeel en een geldige factor groter dan 0.');
        return;
      }
      onAddAction({ type: 'split', isin, mode, factor: f });
      setIsin('');
      setFactor('100');
    } else if (type === 'rename') {
      if (!isin || !newName.trim()) {
        setError('Kies een aandeel en vul een nieuwe naam in.');
        return;
      }
      onAddAction({ type: 'rename', isin, newName: newName.trim() });
      setIsin('');
      setNewName('');
    }
  };

  return (
    <ModalShell
      title="Corporate Actions"
      subtitle="Verwerk overnames, aandelensplitsingen of naamswijzigingen met behoud van GAK."
      onClose={onClose}
      maxWidth="max-w-3xl"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg text-xs font-medium bg-[#132247] hover:bg-[#182b59] text-slate-200 transition-colors"
        >
          Sluiten
        </button>
      }
    >
      <div className="bg-[#080e22] border border-[#1e3260] rounded-lg p-4 space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['merger', 'Overname / Wissel'],
              ['split', 'Splitsing / Reverse Split'],
              ['rename', 'Naamswijziging'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setType(key);
                setError('');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                type === key
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-[#132247] text-slate-300 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {type === 'merger' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 font-medium mb-1">Oud Aandeel (Bron)</label>
              <select
                value={fromIsin}
                onChange={(e) => setFromIsin(e.target.value)}
                className="w-full bg-[#132247] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100"
              >
                <option value="">-- Kies aandeel --</option>
                {knownAssets.map((a) => (
                  <option key={a.isin} value={a.isin}>
                    {a.name} ({a.isin})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">Nieuw Doel-ISIN *</label>
              <input
                type="text"
                value={toIsin}
                onChange={(e) => setToIsin(e.target.value.toUpperCase())}
                placeholder="bv. BE0003797140"
                className="w-full bg-[#132247] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100 font-mono uppercase"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">Nieuwe Naam (optioneel)</label>
              <input
                type="text"
                value={toName}
                onChange={(e) => setToName(e.target.value)}
                placeholder="bv. GBL"
                className="w-full bg-[#132247] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">Nieuwe Google Ticker</label>
              <input
                type="text"
                value={toTicker}
                onChange={(e) => setToTicker(e.target.value)}
                placeholder="bv. EBR:GBLB"
                className="w-full bg-[#132247] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">
                Conversieratio (1 oud = X nieuw)
              </label>
              <input
                type="number"
                step="any"
                value={ratio}
                onChange={(e) => setRatio(e.target.value)}
                className="w-full bg-[#132247] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">
                Ontvangen Cash-opleg (€)
              </label>
              <input
                type="number"
                step="any"
                value={cashBoot}
                onChange={(e) => setCashBoot(e.target.value)}
                className="w-full bg-[#132247] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100 font-mono"
              />
            </div>

            {mergerPreview && (
              <div className="sm:col-span-2 p-3 rounded-lg bg-[#132247]/60 border border-sky-500/30 space-y-1.5 text-[11px]">
                <div className="font-semibold text-sky-400 flex items-center justify-between">
                  <span>Voorvertoning GAK-berekening</span>
                  <span className="font-mono">Ratio 1 : {mergerPreview.ratio}</span>
                </div>
                <div className="text-slate-300">
                  Afsluiten {mergerPreview.fromName}:{' '}
                  <span className="font-mono tabular-nums">
                    {mergerPreview.oldQty.toFixed(4)} stuks @ {formatCurrency(mergerPreview.oldGak)}
                  </span>
                </div>
                <div className="text-slate-100 font-semibold pt-1 border-t border-[#1e3260] flex justify-between">
                  <span>Nieuwe positie ({mergerPreview.toName}):</span>
                  <span className="font-mono tabular-nums text-emerald-400">
                    {mergerPreview.finalQty.toFixed(4)} stuks · GAK {formatCurrency(mergerPreview.finalGak)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {type === 'split' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-400 font-medium mb-1">Aandeel</label>
              <select
                value={isin}
                onChange={(e) => setIsin(e.target.value)}
                className="w-full bg-[#132247] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100"
              >
                <option value="">-- Kies aandeel --</option>
                {knownAssets.map((a) => (
                  <option key={a.isin} value={a.isin}>
                    {a.name} ({a.isin})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">Bewerking</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as 'divide' | 'multiply')}
                className="w-full bg-[#132247] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100"
              >
                <option value="divide">Delen door (÷ Reverse Split)</option>
                <option value="multiply">Vermenigvuldigen met (× Split)</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">Factor</label>
              <input
                type="number"
                step="any"
                value={factor}
                onChange={(e) => setFactor(e.target.value)}
                className="w-full bg-[#132247] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100 font-mono"
              />
            </div>
          </div>
        )}

        {type === 'rename' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 font-medium mb-1">Aandeel</label>
              <select
                value={isin}
                onChange={(e) => setIsin(e.target.value)}
                className="w-full bg-[#132247] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100"
              >
                <option value="">-- Kies aandeel --</option>
                {knownAssets.map((a) => (
                  <option key={a.isin} value={a.isin}>
                    {a.name} ({a.isin})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">Nieuwe Weergavenaam</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="bv. Barrick Mining Corp"
                className="w-full bg-[#132247] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100"
              />
            </div>
          </div>
        )}

        {error && <p className="text-rose-400 text-xs">{error}</p>}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleApply}
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2 rounded-lg transition-colors"
          >
            + Corporate Action Toepassen
          </button>
        </div>
      </div>

      {/* Active Corporate Actions List */}
      <div className="space-y-2">
        <div className="font-semibold text-slate-300">
          Actieve Corporate Actions ({corporateActions.length})
        </div>
        {corporateActions.length === 0 ? (
          <div className="p-4 bg-[#080e22] rounded-lg border border-[#182649] text-slate-400 text-center">
            Nog geen handmatige corporate actions ingesteld.
          </div>
        ) : (
          <div className="divide-y divide-[#182649] border border-[#182649] rounded-lg overflow-hidden">
            {corporateActions.map((ca, idx) => (
              <div
                key={ca.id}
                className="p-3 bg-[#080e22] flex items-center justify-between gap-3"
              >
                <div className="text-slate-200">{describeAction(ca)}</div>
                <button
                  type="button"
                  onClick={() => onRemoveAction(idx)}
                  className="text-rose-400 hover:text-rose-300 font-medium px-2 py-1 rounded transition-colors shrink-0"
                >
                  Verwijder
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  );
}

/* ============================================================================
   5. CSV / Excel Upload Modal
   ============================================================================ */
interface CsvUploadModalProps {
  csvBatches: CsvBatch[];
  onUploadFile: (file: File, broker: string) => Promise<void>;
  onRemoveBatch: (index: number) => void;
  onPushBatchesToSheet: () => Promise<void>;
  onClose: () => void;
}

export function CsvUploadModal({
  csvBatches,
  onUploadFile,
  onRemoveBatch,
  onPushBatchesToSheet,
  onClose,
}: CsvUploadModalProps) {
  const [broker, setBroker] = useState('Bolero');
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      await onUploadFile(file, broker);
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  return (
    <ModalShell
      title="CSV / Excel Transacties Uploaden"
      subtitle="Ondersteunt BUX (.csv), Bolero (.xlsx / .csv) en generieke broker-overzichten."
      onClose={onClose}
      footer={
        <>
          {csvBatches.length > 0 && (
            <button
              type="button"
              onClick={onPushBatchesToSheet}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#132247] hover:bg-[#182b59] text-emerald-400 border border-emerald-500/30 transition-colors"
            >
              Push CSV&apos;s naar Sheet ({csvBatches.length})
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium bg-[#132247] hover:bg-[#182b59] text-slate-200 transition-colors"
          >
            Sluiten
          </button>
        </>
      }
    >
      <div className="bg-[#080e22] border border-[#1e3260] rounded-lg p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
          <div>
            <label className="block text-slate-400 font-medium mb-1">Broker Selecteren</label>
            <select
              value={broker}
              onChange={(e) => setBroker(e.target.value)}
              className="w-full bg-[#132247] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100 font-medium"
            >
              <option value="Bolero">Bolero</option>
              <option value="BUX">BUX</option>
              <option value="DEGIRO">DEGIRO</option>
              <option value="Overig">Overig</option>
            </select>
          </div>

          <div>
            <label className="flex items-center justify-center gap-2 w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2 rounded-lg cursor-pointer transition-colors">
              <Upload className="w-4 h-4" />
              <span>{isUploading ? 'Verwerken...' : 'Kies CSV of Excel Bestand'}</span>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
                disabled={isUploading}
              />
            </label>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="font-semibold text-slate-300">
          Actieve Geïmporteerde Bestanden ({csvBatches.length})
        </div>
        {csvBatches.length === 0 ? (
          <div className="p-4 bg-[#080e22] rounded-lg border border-[#182649] text-slate-400 text-center">
            Nog geen bestanden geladen.
          </div>
        ) : (
          <div className="divide-y divide-[#182649] border border-[#182649] rounded-lg overflow-hidden">
            {csvBatches.map((batch, idx) => (
              <div
                key={batch.id}
                className="p-3 bg-[#080e22] flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-slate-100 truncate">{batch.fileName}</div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    {batch.broker} · {batch.rows?.length || 0} regels · {batch.uploadedAt}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveBatch(idx)}
                  className="text-rose-400 hover:text-rose-300 p-1.5 rounded transition-colors shrink-0"
                  title="Verwijder batch"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  );
}

/* ============================================================================
   6. Manual Transaction Modal (+ Boeking)
   ============================================================================ */
interface ManualTxModalProps {
  assetMapping: AssetMappingMap;
  manualTransactions: TransactionRow[];
  onSaveManualTx: (payload: {
    tab: 'trade' | 'dividend' | 'cash';
    broker: string;
    date: string;
    tradeType: 'Buy Trade' | 'Sell Trade';
    isin: string;
    assetName: string;
    ticker: string;
    currency: string;
    quantity: number;
    totalEur: number;
    feeEur: number;
    taxEur: number;
    realizedPnlEur: number;
    cashType: 'deposits' | 'withdrawals' | 'interest' | 'fees';
    description: string;
    tagsText: string;
  }) => void;
  onRemoveManualTx: (manualId: string) => void;
  onClose: () => void;
}

export function ManualTxModal({
  assetMapping,
  manualTransactions,
  onSaveManualTx,
  onRemoveManualTx,
  onClose,
}: ManualTxModalProps) {
  const [tab, setTab] = useState<'trade' | 'dividend' | 'cash'>('trade');
  const [broker, setBroker] = useState('Bolero');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [tradeType, setTradeType] = useState<'Buy Trade' | 'Sell Trade'>('Buy Trade');
  const [isin, setIsin] = useState('');
  const [assetName, setAssetName] = useState('');
  const [ticker, setTicker] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [quantity, setQuantity] = useState('');
  const [totalEur, setTotalEur] = useState('');
  const [feeEur, setFeeEur] = useState('0');
  const [taxEur, setTaxEur] = useState('0');
  const [realizedPnlEur, setRealizedPnlEur] = useState('0');
  const [cashType, setCashType] = useState<'deposits' | 'withdrawals' | 'interest' | 'fees'>('deposits');
  const [description, setDescription] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [error, setError] = useState('');

  const handleIsinChange = (val: string) => {
    const upper = val.toUpperCase();
    setIsin(upper);
    const mapped = assetMapping[upper];
    if (mapped) {
      if (!assetName) setAssetName(mapped.name || '');
      if (!ticker) setTicker(mapped.googleTicker || mapped.ticker || '');
      if (mapped.currency) setCurrency(mapped.currency);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const numTotal = Math.abs(parseNum(totalEur));
    const numQty = Math.abs(parseNum(quantity));
    const cleanIsin = isin.trim().toUpperCase();

    if (tab === 'trade' && (!cleanIsin || numQty <= 0 || numTotal <= 0)) {
      setError('Vul een ISIN, aantal (> 0) en totaalbedrag in EUR (> 0) in.');
      return;
    }
    if (tab === 'dividend' && (!cleanIsin || numTotal <= 0)) {
      setError('Vul een ISIN en een dividendbedrag in EUR (> 0) in.');
      return;
    }
    if (tab === 'cash' && numTotal <= 0) {
      setError('Vul een geldig bedrag in EUR (> 0) in.');
      return;
    }

    onSaveManualTx({
      tab,
      broker,
      date,
      tradeType,
      isin: cleanIsin,
      assetName: assetName.trim(),
      ticker: ticker.trim(),
      currency: currency.trim().toUpperCase() || 'EUR',
      quantity: numQty,
      totalEur: numTotal,
      feeEur: Math.abs(parseNum(feeEur)),
      taxEur: Math.abs(parseNum(taxEur)),
      realizedPnlEur: parseNum(realizedPnlEur),
      cashType,
      description: description.trim(),
      tagsText: tagsText.trim(),
    });
  };

  return (
    <ModalShell
      title="Manuele Boeking Toevoegen"
      subtitle="Voeg een aan-/verkoop, dividend of kasboeking toe en synchroniseer direct met Google Sheet."
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium bg-[#132247] hover:bg-[#182b59] text-slate-200 transition-colors"
          >
            Annuleren
          </button>
          <button
            type="submit"
            form="manual-tx-form"
            className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors"
          >
            Boeking Opslaan
          </button>
        </>
      }
    >
      <form id="manual-tx-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 bg-[#080e22] p-1 rounded-lg border border-[#1e3260]">
            {(
              [
                ['trade', 'Trade'],
                ['dividend', 'Dividend'],
                ['cash', 'Cash / Storting'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setTab(k);
                  setError('');
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  tab === k ? 'bg-emerald-500 text-slate-950' : 'text-slate-300 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={broker}
              onChange={(e) => setBroker(e.target.value)}
              className="bg-[#080e22] border border-[#1e3260] rounded-lg px-2.5 py-1.5 text-slate-100"
            >
              <option value="Bolero">Bolero</option>
              <option value="BUX">BUX</option>
              <option value="Overig">Overig</option>
            </select>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-[#080e22] border border-[#1e3260] rounded-lg px-2.5 py-1.5 text-slate-100 font-mono"
            />
          </div>
        </div>

        <datalist id="knownIsinsList">
          {Object.entries(assetMapping).map(([k, v]) => (
            <option key={k} value={k}>
              {v.name}
            </option>
          ))}
        </datalist>

        {tab === 'trade' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#080e22] p-4 rounded-lg border border-[#1e3260]">
            <div>
              <label className="block text-slate-400 font-medium mb-1">Richting</label>
              <select
                value={tradeType}
                onChange={(e) => setTradeType(e.target.value as 'Buy Trade' | 'Sell Trade')}
                className="w-full bg-[#132247] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100 font-semibold"
              >
                <option value="Buy Trade">Aankoop (Buy)</option>
                <option value="Sell Trade">Verkoop (Sell)</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">ISIN Code *</label>
              <input
                type="text"
                list="knownIsinsList"
                value={isin}
                onChange={(e) => handleIsinChange(e.target.value)}
                placeholder="bv. NL0010273215"
                className="w-full bg-[#132247] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100 font-mono uppercase"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">Naam Stock / ETF</label>
              <input
                type="text"
                value={assetName}
                onChange={(e) => setAssetName(e.target.value)}
                placeholder="bv. ASML Holding"
                className="w-full bg-[#132247] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-400 font-medium mb-1">Google Ticker</label>
                <input
                  type="text"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value)}
                  placeholder="AMS:ASML"
                  className="w-full bg-[#132247] border border-[#1e3260] rounded-lg px-2.5 py-2 text-slate-100 font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 font-medium mb-1">Valuta</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full bg-[#132247] border border-[#1e3260] rounded-lg px-2 py-2 text-slate-100 font-mono"
                >
                  {CURRENCY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">Aantal Stuks *</label>
              <input
                type="number"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="bv. 10"
                className="w-full bg-[#132247] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">
                Totaalbedrag EUR (excl. kosten) *
              </label>
              <input
                type="number"
                step="any"
                value={totalEur}
                onChange={(e) => setTotalEur(e.target.value)}
                placeholder="bv. 1250.00"
                className="w-full bg-[#132247] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">Transactiekosten (EUR)</label>
              <input
                type="number"
                step="any"
                value={feeEur}
                onChange={(e) => setFeeEur(e.target.value)}
                className="w-full bg-[#132247] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">Beurstaks / TOB (EUR)</label>
              <input
                type="number"
                step="any"
                value={taxEur}
                onChange={(e) => setTaxEur(e.target.value)}
                className="w-full bg-[#132247] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100 font-mono"
              />
            </div>
            {tradeType === 'Sell Trade' && (
              <div className="sm:col-span-2">
                <label className="block text-slate-400 font-medium mb-1">
                  Gerealiseerde Winst / Verlies in EUR (optioneel)
                </label>
                <input
                  type="number"
                  step="any"
                  value={realizedPnlEur}
                  onChange={(e) => setRealizedPnlEur(e.target.value)}
                  className="w-full bg-[#132247] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100 font-mono"
                />
              </div>
            )}
          </div>
        )}

        {tab === 'dividend' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#080e22] p-4 rounded-lg border border-[#1e3260]">
            <div>
              <label className="block text-slate-400 font-medium mb-1">ISIN Code *</label>
              <input
                type="text"
                list="knownIsinsList"
                value={isin}
                onChange={(e) => handleIsinChange(e.target.value)}
                placeholder="bv. BE0003851681"
                className="w-full bg-[#132247] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100 font-mono uppercase"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">Naam Stock / ETF</label>
              <input
                type="text"
                value={assetName}
                onChange={(e) => setAssetName(e.target.value)}
                placeholder="bv. Aedifica"
                className="w-full bg-[#132247] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">Bruto Dividend (EUR) *</label>
              <input
                type="number"
                step="any"
                value={totalEur}
                onChange={(e) => setTotalEur(e.target.value)}
                placeholder="bv. 85.00"
                className="w-full bg-[#132247] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">
                Ingehouden Bronbelasting (EUR)
              </label>
              <input
                type="number"
                step="any"
                value={taxEur}
                onChange={(e) => setTaxEur(e.target.value)}
                placeholder="bv. 25.50"
                className="w-full bg-[#132247] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100 font-mono"
              />
            </div>
          </div>
        )}

        {tab === 'cash' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#080e22] p-4 rounded-lg border border-[#1e3260]">
            <div>
              <label className="block text-slate-400 font-medium mb-1">Type Kasboeking</label>
              <select
                value={cashType}
                onChange={(e) =>
                  setCashType(e.target.value as 'deposits' | 'withdrawals' | 'interest' | 'fees')
                }
                className="w-full bg-[#132247] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100 font-medium"
              >
                <option value="deposits">Storting (Deposit)</option>
                <option value="withdrawals">Afhaling (Withdrawal)</option>
                <option value="interest">Rente op cash (Interest)</option>
                <option value="fees">Broker- / Abonnementskost</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">Bedrag in EUR *</label>
              <input
                type="number"
                step="any"
                value={totalEur}
                onChange={(e) => setTotalEur(e.target.value)}
                placeholder="bv. 1000.00"
                className="w-full bg-[#132247] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100 font-mono"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-slate-400 font-medium mb-1">Omschrijving</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="bv. Maandelijkse storting Bolero"
                className="w-full bg-[#132247] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100"
              />
            </div>
          </div>
        )}

        <div>
          <label className="block text-slate-400 font-medium mb-1">Tags (optioneel)</label>
          <input
            type="text"
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="bv. DCA, Groei"
            className="w-full bg-[#080e22] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100 font-mono"
          />
        </div>

        {error && <p className="text-rose-400 text-xs">{error}</p>}

        {manualTransactions.length > 0 && (
          <div className="space-y-2 pt-3 border-t border-[#182649]">
            <div className="font-semibold text-slate-300">
              Recente Manuele Boekingen ({manualTransactions.length} regels)
            </div>
            <div className="max-h-40 overflow-y-auto divide-y divide-[#182649] border border-[#182649] rounded-lg">
              {manualTransactions.map((mtx, i) => {
                const amt = Number(mtx['Transaction Amount'] || 0);
                return (
                  <div
                    key={`${mtx._manualId || i}_${i}`}
                    className="p-2.5 bg-[#080e22] flex items-center justify-between gap-2 text-[11px]"
                  >
                    <div className="truncate text-slate-200">
                      <span className="font-mono text-slate-400 mr-2">
                        {String(mtx['Transaction Time (CET)'] || '').split(' ')[0]}
                      </span>
                      <span className="text-sky-400 font-semibold mr-2">{mtx.Broker}</span>
                      <span>{mtx['Asset Name'] || mtx['Transaction Description']}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`font-mono tabular-nums font-semibold ${
                          amt >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {formatCurrency(amt)}
                      </span>
                      {mtx._manualId && (
                        <button
                          type="button"
                          onClick={() => onRemoveManualTx(mtx._manualId!)}
                          className="text-rose-400 hover:text-white p-0.5"
                          title="Verwijder boeking"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </form>
    </ModalShell>
  );
}

/* ============================================================================
   7. Backend Settings & Local Cache Reset Modal
   ============================================================================ */
interface BackendSettingsModalProps {
  currentUrl: string;
  onSaveUrl: (url: string) => void;
  onConfirmReset: () => void;
  onClose: () => void;
}

export function BackendSettingsModal({
  currentUrl,
  onSaveUrl,
  onConfirmReset,
  onClose,
}: BackendSettingsModalProps) {
  const [url, setUrl] = useState(currentUrl);
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <ModalShell
      title="Google Apps Script Koppeling & Cache"
      subtitle="Beheer de verbonden Google Sheet Web App URL of reset de lokale browsercache."
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium bg-[#132247] hover:bg-[#182b59] text-slate-200 transition-colors"
          >
            Sluiten
          </button>
          <button
            type="button"
            onClick={() => onSaveUrl(url)}
            className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors"
          >
            URL Opslaan &amp; Syncen
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="block text-slate-400 font-medium mb-1">
            Google Apps Script Web App URL
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={DEFAULT_GOOGLE_SCRIPT_URL}
            className="w-full bg-[#080e22] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100 font-mono text-[11px] focus:outline-none focus:border-sky-400"
          />
          <p className="text-[11px] text-slate-400 mt-1">
            Standaard gekoppeld aan jouw gedeployde Google Apps Script backend.
          </p>
        </div>

        <div className="pt-4 border-t border-[#182649] space-y-2">
          <div className="font-semibold text-rose-400">Lokale Cache Resetten</div>
          <p className="text-slate-400">
            Wist lokaal opgeslagen transacties, mappings en koersen in deze browser en laadt opnieuw vanuit je Google Sheet.
          </p>
          {!confirmReset ? (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 transition-colors"
            >
              Lokale Data Wissen
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onConfirmReset}
                className="px-3.5 py-2 rounded-lg text-xs font-bold bg-rose-500 hover:bg-rose-400 text-white transition-colors"
              >
                Ja, wis lokale data
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="px-3 py-2 rounded-lg text-xs text-slate-300 hover:text-white"
              >
                Annuleren
              </button>
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
