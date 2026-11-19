import { FormEvent, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { formatCurrency, formatSignedPct } from '../engine/ledger';
import { ClientSummary, ComputedClientTranche } from '../types/portfolio';

interface AssetManagerTabProps {
  clientSummaryList: ClientSummary[];
  computedClientTranches: ComputedClientTranche[];
  onAddClientDeposit: (payload: {
    person: string;
    type: 'deposit' | 'withdrawal';
    date: string;
    amount: number;
    note: string;
  }) => void;
  onRemoveClientDeposit: (id: string) => void;
}

export function AssetManagerTab({
  clientSummaryList,
  computedClientTranches,
  onAddClientDeposit,
  onRemoveClientDeposit,
}: AssetManagerTabProps) {
  const [person, setPerson] = useState('');
  const [type, setType] = useState<'deposit' | 'withdrawal'>('deposit');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleanPerson = person.trim();
    const numAmount = Math.abs(parseFloat(amount));
    if (!cleanPerson || !date || isNaN(numAmount) || numAmount <= 0) {
      setFormError('Vul een geldige naam, datum en bedrag (> 0) in.');
      return;
    }
    setFormError('');
    onAddClientDeposit({
      person: cleanPerson,
      type,
      date,
      amount: numAmount,
      note: note.trim(),
    });
    setAmount('');
    setNote('');
  };

  return (
    <div className="space-y-6">
      {/* Add Client Entry Form */}
      <section className="bg-[#0b142c] rounded-xl border border-[#1b2b52] p-5 space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-100">
            Asset Manager — Personen &amp; Portefeuillerendement
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Elke storting groeit mee met het exacte dagelijkse TWR-rendement van de volledige portefeuille vanaf die stortingsdatum.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end text-xs">
          <div className="sm:col-span-2">
            <label className="block text-slate-400 font-medium mb-1">Persoon *</label>
            <input
              type="text"
              list="knownClientsList"
              value={person}
              onChange={(e) => setPerson(e.target.value)}
              placeholder="bv. Renée"
              className="w-full bg-[#080e22] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-emerald-400"
            />
            <datalist id="knownClientsList">
              {clientSummaryList.map((c) => (
                <option key={c.person} value={c.person} />
              ))}
            </datalist>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-slate-400 font-medium mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as 'deposit' | 'withdrawal')}
              className="w-full bg-[#080e22] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-emerald-400"
            >
              <option value="deposit">+ Storting</option>
              <option value="withdrawal">- Opname (FIFO)</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-slate-400 font-medium mb-1">Datum *</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-[#080e22] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-emerald-400"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-slate-400 font-medium mb-1">Bedrag (€) *</label>
            <input
              type="number"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="500"
              className="w-full bg-[#080e22] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100 font-mono tabular-nums focus:outline-none focus:border-emerald-400"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-slate-400 font-medium mb-1">Notitie</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="bv. Startinleg"
              className="w-full bg-[#080e22] border border-[#1e3260] rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-emerald-400"
            />
          </div>

          <div className="sm:col-span-2">
            <button
              type="submit"
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
            >
              Opslaan
            </button>
          </div>
        </form>

        {formError && <p className="text-xs text-rose-400">{formError}</p>}
      </section>

      {/* Per-Person Summary Cards */}
      {clientSummaryList.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {clientSummaryList.map((client) => (
            <article
              key={client.person}
              className="bg-[#0b142c] rounded-xl border border-[#1b2b52] p-5 space-y-4"
            >
              <div className="flex items-start justify-between border-b border-[#182649] pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-100">{client.person}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {client.depositsCount} boeking(en) · Eerste: {client.firstDate}
                  </p>
                </div>
                <span
                  className={`text-sm font-mono tabular-nums font-bold ${
                    client.totalReturnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {formatSignedPct(client.totalReturnPct)}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block">Totale Inleg</span>
                  <span className="font-mono tabular-nums font-semibold text-slate-100 mt-0.5 block">
                    {formatCurrency(client.totalInvested)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Huidige Waarde</span>
                  <span className="font-mono tabular-nums font-bold text-sky-400 mt-0.5 block">
                    {formatCurrency(client.currentValue)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Winst / Verlies</span>
                  <span
                    className={`font-mono tabular-nums font-semibold mt-0.5 block ${
                      client.pnlEur >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {client.pnlEur >= 0 ? '+' : ''}
                    {formatCurrency(client.pnlEur)}
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-[#182649] space-y-2">
                <span className="text-xs font-medium text-slate-400 block">
                  Opbouw per storting (Tranches)
                </span>
                <div className="divide-y divide-[#182649] text-xs">
                  {client.tranches.map((tr) => (
                    <div key={tr.id} className="py-2 flex items-center justify-between gap-2">
                      <div>
                        <span className="font-mono tabular-nums text-slate-200">{tr.date}</span>
                        <span className="text-slate-400 ml-1.5 font-mono tabular-nums">
                          ({tr.type === 'withdrawal' ? '-' : ''}
                          {formatCurrency(tr.amount)})
                        </span>
                        {tr.note && (
                          <span className="text-slate-500 block text-[11px]">{tr.note}</span>
                        )}
                      </div>
                      <div className="text-right font-mono tabular-nums">
                        <span className="font-semibold text-slate-100 block">
                          {formatCurrency(tr.currentVal)}
                        </span>
                        <span
                          className={`text-[11px] ${
                            tr.returnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {formatSignedPct(tr.returnPct)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Chronological Logbook */}
      <section className="bg-[#0b142c] rounded-xl border border-[#1b2b52] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#182649] flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-100">
            Alle Geregistreerde Stortingen per Persoon
          </h3>
          <span className="text-xs font-mono tabular-nums text-slate-400">
            {computedClientTranches.length} boekingen
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#080e22] text-slate-400 border-b border-[#182649] font-medium">
                <th className="px-4 py-3">Persoon</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Datum</th>
                <th className="px-4 py-3 text-right">Bedrag</th>
                <th className="px-4 py-3 text-right">Portefeuille TWR sinds datum</th>
                <th className="px-4 py-3 text-right">Huidige Waarde</th>
                <th className="px-4 py-3">Notitie</th>
                <th className="px-4 py-3 text-right">Actie</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#182649]">
              {computedClientTranches.map((dep) => (
                <tr key={dep.id} className="hover:bg-[#132247]/40 transition-colors">
                  <td className="px-4 py-3 font-semibold text-slate-100">{dep.person}</td>
                  <td className="px-4 py-3 text-slate-300">
                    {dep.type === 'withdrawal' ? 'Opname' : 'Storting'}
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums text-slate-300">{dep.date}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-200">
                    {dep.type === 'withdrawal' ? '-' : ''}
                    {formatCurrency(dep.amount)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-mono tabular-nums font-semibold ${
                      dep.returnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {formatSignedPct(dep.returnPct)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums font-bold text-sky-400">
                    {formatCurrency(dep.currentVal)}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{dep.note || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => onRemoveClientDeposit(dep.id)}
                      title="Verwijderen"
                      className="text-rose-400 hover:text-rose-300 p-1 rounded transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {computedClientTranches.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-slate-400">
                    Nog geen stortingen per persoon geregistreerd. Voeg er hierboven één toe.
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
