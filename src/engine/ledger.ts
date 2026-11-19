import { DUMMY_ISINS } from '../services/googleSheets';
import {
  AssetMappingMap,
  ClosedPosition,
  CorporateAction,
  HistoryData,
  MergerClosedPosition,
  PortfolioBreakdown,
  PortfolioCosts,
  Position,
  PositionOverridesMap,
  TransactionRow,
  UnifiedLedgerResult,
} from '../types/portfolio';
import { getVal, parseNum } from './parser';

export function formatCurrency(val: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number.isFinite(val) ? val : 0);
}

export function formatSignedPct(val: number): string {
  if (!Number.isFinite(val) || Number.isNaN(val)) return '0,00%';
  const sign = val >= 0 ? '+' : '';
  return `${sign}${val.toFixed(2).replace('.', ',')}%`;
}

export function isRawTickerOrIsin(val: unknown, isin = '', ticker = ''): boolean {
  if (!val) return true;
  const v = String(val).trim();
  if (!v) return true;
  if (isin && v.toUpperCase() === String(isin).trim().toUpperCase()) return true;
  if (ticker && v.toUpperCase() === String(ticker).trim().toUpperCase()) return true;
  if (/^[A-Z0-9]{1,6}:[A-Z0-9.-]+$/i.test(v)) return true;
  if (/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/i.test(v)) return true;
  return false;
}

export function isEtfAsset(name: string): boolean {
  const etfKeywords = [
    'ishares',
    'vanguard',
    'vaneck',
    'xtrackers',
    'l&g',
    'etf',
    'msci',
    'ftse',
    'stoxx',
    'spdr',
  ];
  const n = String(name || '').toLowerCase();
  return etfKeywords.some((kw) => n.includes(kw));
}

export function getAssetDisplayName(
  posOrIsin: { isin: string; name?: string } | string,
  assetMapping: AssetMappingMap,
  corporateActions: CorporateAction[],
  transactions: TransactionRow[]
): string {
  const isObj = typeof posOrIsin === 'object' && posOrIsin !== null;
  const isin = isObj ? posOrIsin.isin : String(posOrIsin || '').trim();
  if (!isin) return '';

  const ticker = assetMapping[isin]?.ticker || '';
  const renameCa = [...corporateActions]
    .reverse()
    .find((ca) => ca.type === 'rename' && ca.isin === isin && ca.newName);
  if (renameCa?.newName) return renameCa.newName;

  const mergerCa = [...corporateActions]
    .reverse()
    .find((ca) => ca.type === 'merger' && ca.toIsin === isin && ca.toName);
  if (mergerCa?.toName && !isRawTickerOrIsin(mergerCa.toName, isin, ticker)) {
    return mergerCa.toName;
  }

  const mappedName = assetMapping[isin]?.name;
  if (mappedName && !isRawTickerOrIsin(mappedName, isin, ticker)) {
    return mappedName;
  }

  if (isObj && posOrIsin.name && !isRawTickerOrIsin(posOrIsin.name, isin, ticker)) {
    return posOrIsin.name;
  }

  const tx = transactions.find(
    (t) => getVal(t, 'Asset Id') === isin && getVal(t, 'Asset Name', 'Name')
  );
  if (tx) {
    const txName = getVal(tx, 'Asset Name', 'Name');
    if (txName && !isRawTickerOrIsin(txName, isin, ticker)) {
      return txName;
    }
  }

  return mappedName || (isObj ? posOrIsin.name : '') || isin;
}

export function getAssetCurrency(
  isin: string,
  assetMapping: AssetMappingMap,
  currencies: Record<string, string>,
  transactions: TransactionRow[]
): string {
  if (assetMapping[isin]?.currency) {
    return String(assetMapping[isin].currency).trim().toUpperCase();
  }
  const ticker = assetMapping[isin]?.ticker;
  if (ticker && currencies[ticker]) {
    return String(currencies[ticker]).trim().toUpperCase();
  }
  const tx = transactions.find(
    (t) => getVal(t, 'Asset Id') === isin && getVal(t, 'Asset Currency')
  );
  if (tx) {
    const c = getVal(tx, 'Asset Currency');
    if (c) return String(c).trim().toUpperCase();
  }
  if (
    ticker &&
    (ticker.startsWith('NASDAQ:') || ticker.startsWith('NYSE:') || ticker.endsWith('.US'))
  ) {
    return 'USD';
  }
  return 'EUR';
}

export function getHistoricalPricesForTicker(
  rawTicker: string | undefined,
  historyData: HistoryData,
  assetMapping: AssetMappingMap
): number[] | null {
  if (!historyData || !historyData.prices || !rawTicker) return null;
  const cleanTicker = String(rawTicker).trim();
  const hp = historyData.prices;

  if (hp[cleanTicker] && Array.isArray(hp[cleanTicker]) && hp[cleanTicker].length > 0) {
    return hp[cleanTicker];
  }

  const mappedEntry = Object.values(assetMapping || {}).find(
    (m) =>
      (m.apiTicker && m.apiTicker.toUpperCase() === cleanTicker.toUpperCase()) ||
      (m.googleTicker && m.googleTicker.toUpperCase() === cleanTicker.toUpperCase()) ||
      (m.ticker && m.ticker.toUpperCase() === cleanTicker.toUpperCase())
  );

  if (mappedEntry) {
    for (const alt of [mappedEntry.googleTicker, mappedEntry.apiTicker, mappedEntry.ticker]) {
      if (alt && hp[alt] && Array.isArray(hp[alt]) && hp[alt].length > 0) {
        return hp[alt];
      }
    }
  }

  for (const key in hp) {
    if (key.trim().toUpperCase() === cleanTicker.toUpperCase() && Array.isArray(hp[key])) {
      return hp[key];
    }
  }

  const baseSymbol = cleanTicker.includes(':')
    ? cleanTicker.split(':')[1].trim().toUpperCase()
    : cleanTicker.toUpperCase();

  for (const key in hp) {
    const keyBase = key.includes(':')
      ? key.split(':')[1].trim().toUpperCase()
      : key.trim().toUpperCase();
    if (keyBase === baseSymbol && Array.isArray(hp[key])) {
      return hp[key];
    }
  }

  return null;
}

export function getExactRawPriceForIsin(
  isin: string,
  latestPrices: Record<string, number>,
  assetMapping: AssetMappingMap,
  historyData: HistoryData
): number {
  if (latestPrices && latestPrices[isin] > 0) {
    return latestPrices[isin];
  }
  const m = assetMapping[isin] || ({} as Partial<AssetMappingMap[string]>);
  for (const key of [m.googleTicker, m.apiTicker, m.ticker]) {
    if (!key) continue;
    const exact = latestPrices[key] || latestPrices[key.toUpperCase()];
    if (exact > 0) return exact;
  }
  const hist = getHistoricalPricesForTicker(
    m.googleTicker || m.ticker || m.apiTicker,
    historyData,
    assetMapping
  );
  if (hist && hist.length > 0) {
    for (let i = hist.length - 1; i >= 0; i--) {
      if (hist[i] > 0) return hist[i];
    }
  }
  return 0;
}

export function getAssetPriceInEur(
  isin: string,
  positions: Position[],
  latestPrices: Record<string, number>,
  assetMapping: AssetMappingMap,
  currencies: Record<string, string>,
  rates: Record<string, number>,
  historyData: HistoryData,
  transactions: TransactionRow[]
): number {
  const rawPrice = getExactRawPriceForIsin(isin, latestPrices, assetMapping, historyData);
  if (rawPrice <= 0) {
    const pos = positions.find((p) => p.isin === isin);
    return pos ? pos.avgPrice : 0;
  }
  const ccy = getAssetCurrency(isin, assetMapping, currencies, transactions);
  if (ccy === 'EUR') return rawPrice;

  let fxRate = 1.0;
  if (rates && rates[ccy] !== undefined) {
    fxRate = rates[ccy];
  } else if (ccy === 'USD' && rates && rates.USDEUR !== undefined) {
    fxRate = rates.USDEUR;
  } else if (ccy === 'GBX') {
    const gbpRate = (rates && (rates.GBP || rates.GBPEUR)) || 1.17;
    fxRate = gbpRate / 100.0;
  } else if (ccy === 'GBP' && rates && rates.GBPEUR) {
    fxRate = rates.GBPEUR;
  } else if (ccy === 'CHF' && rates && rates.CHFEUR) {
    fxRate = rates.CHFEUR;
  } else if (ccy === 'CAD' && rates && rates.CADEUR) {
    fxRate = rates.CADEUR;
  }
  return rawPrice * fxRate;
}

export function formatOriginalPrice(
  isin: string,
  positions: Position[],
  latestPrices: Record<string, number>,
  assetMapping: AssetMappingMap,
  currencies: Record<string, string>,
  historyData: HistoryData,
  transactions: TransactionRow[]
): string {
  const live = getExactRawPriceForIsin(isin, latestPrices, assetMapping, historyData);
  const pos = positions.find((p) => p.isin === isin);
  const rawPrice = live > 0 ? live : pos ? pos.avgPrice : 0;
  const ccy = getAssetCurrency(isin, assetMapping, currencies, transactions);

  const symbols: Record<string, string> = {
    USD: '$',
    GBP: '£',
    GBX: 'p',
    EUR: '€',
    CHF: 'CHF',
    CAD: 'CA$',
    SEK: 'kr',
    NOK: 'kr',
    DKK: 'kr',
    JPY: '¥',
    AUD: 'A$',
  };
  const sym = symbols[ccy] || ccy;
  if (ccy === 'EUR') return `€ ${rawPrice.toFixed(2)}`;
  return `${sym} ${rawPrice.toFixed(2)} ${ccy}`;
}

export function computeUnifiedLedger(
  transactions: TransactionRow[],
  assetMapping: AssetMappingMap,
  corporateActions: CorporateAction[],
  positionOverrides: PositionOverridesMap
): UnifiedLedgerResult {
  const posMap: Record<string, Position> = {};
  const pendingCaDebits: Array<{
    fromIsin: string;
    fromName: string;
    closedQty: number;
    closedGak: number;
    remainingCost: number;
    date: string;
  }> = [];
  const closedByMerger: MergerClosedPosition[] = [];
  const closedMap: Record<string, ClosedPosition> = {};

  let deposits = 0;
  let withdrawals = 0;
  let realizedPnL = 0;
  let cash = 0;

  const sortedTx = [...transactions].sort((a, b) => {
    const ta = getVal(a, 'Transaction Time (CET)', 'Date', 'Time');
    const tb = getVal(b, 'Transaction Time (CET)', 'Date', 'Time');
    return ta.localeCompare(tb);
  });

  const runningQty: Record<string, number> = {};
  const caDirections: Record<number, 'DEBIT' | 'CREDIT' | 'CASH' | 'NONE'> = {};

  sortedTx.forEach((tx, idx) => {
    const category = getVal(tx, 'Transaction Category');
    const type = getVal(tx, 'Transaction Type');
    const transferType = getVal(tx, 'Transfer Type').toUpperCase();
    const desc = getVal(tx, 'Transaction Description').toUpperCase();
    const isin = getVal(tx, 'Asset Id', 'ISIN');
    const rawQty = parseNum(getVal(tx, 'Asset Quantity', 'Quantity'));
    const qty = Math.abs(rawQty);

    if (!isin || DUMMY_ISINS.includes(isin)) return;

    if (category === 'trades') {
      if (type === 'Buy Trade' && (transferType === 'CASH_DEBIT' || transferType === '')) {
        runningQty[isin] = (runningQty[isin] || 0) + qty;
      } else if (type === 'Sell Trade' && (transferType === 'CASH_CREDIT' || transferType === '')) {
        runningQty[isin] = Math.max(0, (runningQty[isin] || 0) - qty);
      }
    } else if (category === 'corporate_actions') {
      if (transferType.includes('CASH')) {
        caDirections[idx] = 'CASH';
      } else if (qty === 0) {
        caDirections[idx] = 'NONE';
      } else if (
        rawQty < 0 ||
        ['DEBIT', 'OUT', 'SELL', 'REMOVE', 'WITHDRAW'].some((k) => transferType.includes(k)) ||
        ['DEBIT', 'OUT', 'REMOVAL', 'EXCHANGE FROM'].some((k) => desc.includes(k))
      ) {
        caDirections[idx] = 'DEBIT';
        runningQty[isin] = Math.max(0, (runningQty[isin] || 0) - qty);
      } else if (
        ['CREDIT', 'IN', 'BUY', 'ADD', 'DEPOSIT'].some((k) => transferType.includes(k)) ||
        ['CREDIT', 'ADDITION', 'EXCHANGE TO'].some((k) => desc.includes(k))
      ) {
        caDirections[idx] = 'CREDIT';
        runningQty[isin] = (runningQty[isin] || 0) + qty;
      } else if ((runningQty[isin] || 0) > 0.0001) {
        caDirections[idx] = 'DEBIT';
        runningQty[isin] = Math.max(0, (runningQty[isin] || 0) - qty);
      } else {
        caDirections[idx] = 'CREDIT';
        runningQty[isin] = (runningQty[isin] || 0) + qty;
      }
    }
  });

  const prioMap: Record<string, number> = { DEBIT: 1, CASH: 2, CREDIT: 3, NONE: 4 };
  const indexedTx = sortedTx.map((tx, idx) => ({ tx, idx }));
  indexedTx.sort((a, b) => {
    const ta = getVal(a.tx, 'Transaction Time (CET)', 'Date', 'Time');
    const tb = getVal(b.tx, 'Transaction Time (CET)', 'Date', 'Time');
    const bucketA = ta.slice(0, 16);
    const bucketB = tb.slice(0, 16);
    if (bucketA !== bucketB) return bucketA.localeCompare(bucketB);
    const catA = getVal(a.tx, 'Transaction Category');
    const catB = getVal(b.tx, 'Transaction Category');
    const pA = catA === 'trades' ? 0 : prioMap[caDirections[a.idx]] || 3;
    const pB = catB === 'trades' ? 0 : prioMap[caDirections[b.idx]] || 3;
    if (pA !== pB) return pA - pB;
    return ta.localeCompare(tb);
  });

  indexedTx.forEach(({ tx, idx }) => {
    const category = getVal(tx, 'Transaction Category');
    const type = getVal(tx, 'Transaction Type');
    const transferType = getVal(tx, 'Transfer Type').toUpperCase();
    const isin = getVal(tx, 'Asset Id', 'ISIN');
    const name = getVal(tx, 'Asset Name', 'Name');
    const rawQty = parseNum(getVal(tx, 'Asset Quantity', 'Quantity'));
    const qty = Math.abs(rawQty);
    const rawAmt = parseNum(getVal(tx, 'Transaction Amount', 'Amount'));
    const eurAmount = Math.abs(rawAmt);
    const txTime = getVal(tx, 'Transaction Time (CET)', 'Date', 'Time');
    const txDate = txTime.split(' ')[0];

    if (category === 'deposits') {
      deposits += eurAmount;
      cash += rawAmt;
      return;
    }
    if (category === 'withdrawals') {
      withdrawals += eurAmount;
      cash -= eurAmount;
      return;
    }
    if (category === 'fees' || category === 'tax') {
      cash -= eurAmount;
      return;
    }
    if (category === 'dividends' && (transferType === 'CASH_CREDIT' || transferType === 'CASH_DEBIT')) {
      cash += rawAmt;
      return;
    }
    if (category === 'interest' || category === 'others') {
      cash += rawAmt;
      return;
    }

    if (!isin || DUMMY_ISINS.includes(isin)) return;

    const resolvedName = getAssetDisplayName(
      { isin, name },
      assetMapping,
      corporateActions,
      transactions
    );

    if (category === 'trades') {
      if (!posMap[isin]) {
        posMap[isin] = {
          isin,
          name: resolvedName,
          quantity: 0,
          totalCost: 0,
          avgPrice: 0,
          isEtf: isEtfAsset(resolvedName),
          caBadge: '',
          caNote: '',
        };
      }
      if (type === 'Buy Trade' && (transferType === 'CASH_DEBIT' || transferType === '')) {
        posMap[isin].quantity += qty;
        posMap[isin].totalCost += eurAmount;
        if (transferType === 'CASH_DEBIT') cash += rawAmt;
      } else if (type === 'Sell Trade' && (transferType === 'CASH_CREDIT' || transferType === '')) {
        const avg = posMap[isin].quantity > 0 ? posMap[isin].totalCost / posMap[isin].quantity : 0;
        const explicitPnl = parseNum(getVal(tx, 'Profit And Loss Amount'));
        const tradePnl = explicitPnl !== 0 ? explicitPnl : eurAmount - qty * avg;
        realizedPnL += tradePnl;

        if (!closedMap[isin]) {
          closedMap[isin] = {
            isin,
            name: resolvedName,
            soldQuantity: 0,
            realizedPnL: 0,
            note: '',
          };
        }
        closedMap[isin].soldQuantity += qty;
        closedMap[isin].realizedPnL += tradePnl;

        posMap[isin].quantity = Math.max(0, posMap[isin].quantity - qty);
        posMap[isin].totalCost = Math.max(0, posMap[isin].totalCost - qty * avg);
        if (transferType === 'CASH_CREDIT') cash += rawAmt;
      }

      if (posMap[isin].quantity > 0.000001) {
        posMap[isin].avgPrice = posMap[isin].totalCost / posMap[isin].quantity;
      } else {
        posMap[isin].quantity = 0;
        posMap[isin].avgPrice = 0;
        posMap[isin].totalCost = 0;
      }
    } else if (category === 'corporate_actions') {
      if (!posMap[isin]) {
        posMap[isin] = {
          isin,
          name: resolvedName,
          quantity: 0,
          totalCost: 0,
          avgPrice: 0,
          isEtf: isEtfAsset(resolvedName),
          caBadge: '',
          caNote: '',
        };
      }
      const dir = caDirections[idx];
      if (dir === 'DEBIT' && qty > 0) {
        const currentGak =
          posMap[isin].quantity > 0 ? posMap[isin].totalCost / posMap[isin].quantity : 0;
        const closedQty = Math.min(posMap[isin].quantity, qty);
        const removedCost = Math.min(posMap[isin].totalCost, closedQty * currentGak);
        posMap[isin].quantity = Math.max(0, posMap[isin].quantity - qty);
        posMap[isin].totalCost = Math.max(0, posMap[isin].totalCost - removedCost);
        posMap[isin].avgPrice =
          posMap[isin].quantity > 0.000001 ? posMap[isin].totalCost / posMap[isin].quantity : 0;

        pendingCaDebits.push({
          fromIsin: isin,
          fromName: resolvedName,
          closedQty,
          closedGak: currentGak,
          remainingCost: removedCost,
          date: txDate,
        });
      } else if (dir === 'CREDIT' && qty > 0) {
        let inheritedCost = 0;
        let sourceDebit: (typeof pendingCaDebits)[number] | null = null;

        const matchingRule = corporateActions.find(
          (ca) => ca.type === 'merger' && ca.toIsin === isin
        );
        if (matchingRule) {
          const dIdx = pendingCaDebits.findIndex(
            (d) => d.fromIsin === matchingRule.fromIsin && d.remainingCost > 0
          );
          if (dIdx !== -1) {
            sourceDebit = pendingCaDebits.splice(dIdx, 1)[0];
          }
        }
        if (!sourceDebit && pendingCaDebits.length > 0) {
          sourceDebit = pendingCaDebits.shift() || null;
        }
        if (sourceDebit) {
          inheritedCost = sourceDebit.remainingCost;
          if (sourceDebit.fromIsin !== isin) {
            closedByMerger.push({
              isin: sourceDebit.fromIsin,
              name: sourceDebit.fromName,
              closedQuantity: sourceDebit.closedQty,
              note: `Overname / Wissel → ${resolvedName} (GAK ${formatCurrency(sourceDebit.closedGak)})`,
            });
          }
        }

        const convertedGak = qty > 0 ? inheritedCost / qty : 0;
        const hadExistingShares = posMap[isin].quantity > 0.0001;
        posMap[isin].quantity += qty;
        posMap[isin].totalCost += inheritedCost;
        posMap[isin].avgPrice =
          posMap[isin].quantity > 0.000001 ? posMap[isin].totalCost / posMap[isin].quantity : 0;
        posMap[isin].caBadge = sourceDebit && sourceDebit.fromIsin !== isin ? 'Overname' : 'CA';
        posMap[isin].caNote =
          sourceDebit && sourceDebit.fromIsin !== isin
            ? `Conversie ${sourceDebit.fromName}: geconverteerde GAK ${formatCurrency(convertedGak)}${
                hadExistingShares ? ' samengevoegd met bestaande positie' : ''
              }`
            : `Corporate Action (${type || 'CSV'}): GAK aangepast naar ${formatCurrency(
                posMap[isin].avgPrice
              )}`;
      } else if (dir === 'CASH') {
        if (transferType === 'CASH_CREDIT' || transferType === 'CASH_DEBIT') cash += rawAmt;
        if (rawAmt > 0 && pendingCaDebits.length > 0) {
          pendingCaDebits[0].remainingCost = Math.max(0, pendingCaDebits[0].remainingCost - rawAmt);
        }
      }
    }
  });

  // Apply manual Corporate Actions
  corporateActions.forEach((ca) => {
    if (ca.type === 'rename' && ca.isin && ca.newName) {
      if (posMap[ca.isin]) {
        posMap[ca.isin].name = ca.newName;
        posMap[ca.isin].caBadge = 'Naam';
        posMap[ca.isin].caNote = `Hernoemd naar ${ca.newName}`;
      }
    } else if (ca.type === 'split' && ca.isin && ca.factor && ca.factor > 0) {
      const isin = ca.isin;
      const factor = Number(ca.factor);
      if (posMap[isin] && posMap[isin].quantity > 0.0001) {
        if (ca.mode === 'divide') {
          posMap[isin].quantity = posMap[isin].quantity / factor;
          posMap[isin].caBadge = `÷${factor}`;
          posMap[isin].caNote = `Reverse Split: aantal gedeeld door ${factor} met behoud van totale aankoopwaarde`;
        } else {
          posMap[isin].quantity = posMap[isin].quantity * factor;
          posMap[isin].caBadge = `×${factor}`;
          posMap[isin].caNote = `Aandelensplitsing: aantal vermenigvuldigd met ${factor} met behoud van totale aankoopwaarde`;
        }
        posMap[isin].avgPrice = posMap[isin].totalCost / posMap[isin].quantity;
      }
    } else if (ca.type === 'merger' && ca.fromIsin && ca.toIsin) {
      const fromIsin = ca.fromIsin;
      const toIsin = ca.toIsin;
      const ratio = Number(ca.ratio) || 1;
      const cashBoot = Number(ca.cashBoot) || 0;
      if (posMap[fromIsin] && posMap[fromIsin].quantity > 0.0001) {
        const oldQty = posMap[fromIsin].quantity;
        const oldGak = posMap[fromIsin].avgPrice;
        const oldCost = posMap[fromIsin].totalCost;
        const fromName = getAssetDisplayName(
          posMap[fromIsin],
          assetMapping,
          corporateActions,
          transactions
        );
        const newQty = oldQty * ratio;
        const transferredCost = Math.max(0, oldCost - cashBoot);
        const convertedGak = newQty > 0 ? transferredCost / newQty : 0;

        posMap[fromIsin].quantity = 0;
        posMap[fromIsin].totalCost = 0;
        posMap[fromIsin].avgPrice = 0;

        const targetName =
          ca.toName || getAssetDisplayName(toIsin, assetMapping, corporateActions, transactions);
        closedByMerger.push({
          isin: fromIsin,
          name: fromName,
          closedQuantity: oldQty,
          note: `Overname / Wissel → ${targetName} (afgesloten aan GAK ${formatCurrency(oldGak)})`,
        });

        if (!posMap[toIsin]) {
          posMap[toIsin] = {
            isin: toIsin,
            name: targetName,
            quantity: 0,
            totalCost: 0,
            avgPrice: 0,
            isEtf: isEtfAsset(targetName),
            caBadge: '',
            caNote: '',
          };
        }
        const hadExistingShares = posMap[toIsin].quantity > 0.0001;
        posMap[toIsin].quantity += newQty;
        posMap[toIsin].totalCost += transferredCost;
        posMap[toIsin].avgPrice =
          posMap[toIsin].quantity > 0.000001
            ? posMap[toIsin].totalCost / posMap[toIsin].quantity
            : 0;
        posMap[toIsin].caBadge = 'Overname';
        posMap[toIsin].caNote = `Conversie ${fromName} (1:${ratio}): geconverteerde GAK ${formatCurrency(
          convertedGak
        )}${hadExistingShares ? ' samengevoegd met bestaande positie' : ''}`;
      }
    }
  });

  // Apply manual position overrides (GAK / Qty)
  Object.keys(positionOverrides || {}).forEach((isin) => {
    const ov = positionOverrides[isin];
    if (!ov) return;
    if (!posMap[isin]) {
      const displayName = getAssetDisplayName(isin, assetMapping, corporateActions, transactions);
      posMap[isin] = {
        isin,
        name: displayName,
        quantity: 0,
        totalCost: 0,
        avgPrice: 0,
        isEtf: isEtfAsset(displayName),
        caBadge: '',
        caNote: '',
      };
    }
    if (ov.quantity !== '' && ov.quantity !== undefined && !isNaN(Number(ov.quantity))) {
      posMap[isin].quantity = Number(ov.quantity);
    }
    if (ov.avgPrice !== '' && ov.avgPrice !== undefined && !isNaN(Number(ov.avgPrice))) {
      posMap[isin].avgPrice = Number(ov.avgPrice);
    }
    posMap[isin].totalCost = posMap[isin].quantity * posMap[isin].avgPrice;
    posMap[isin].isManualOverride = true;
    posMap[isin].overrideComment = ov.comment || 'Handmatige correctie';
  });

  Object.keys(posMap).forEach((isin) => {
    posMap[isin].name = getAssetDisplayName(
      posMap[isin],
      assetMapping,
      corporateActions,
      transactions
    );
  });

  closedByMerger.forEach((mc) => {
    if (!closedMap[mc.isin]) {
      closedMap[mc.isin] = {
        isin: mc.isin,
        name: mc.name,
        soldQuantity: mc.closedQuantity,
        realizedPnL: 0,
        note: mc.note,
      };
    } else {
      closedMap[mc.isin].soldQuantity += mc.closedQuantity;
      closedMap[mc.isin].note = mc.note;
    }
  });

  return {
    positions: Object.values(posMap).filter((p) => p.quantity > 0.0001),
    mergerClosedPositions: closedByMerger,
    closedPositionsList: Object.values(closedMap),
    deposits,
    withdrawals,
    realizedPnL,
    cashBalance: Math.max(0, cash),
  };
}

export function computePortfolioBreakdown(
  positions: Position[],
  cashBalance: number,
  getPriceEur: (isin: string) => number
): PortfolioBreakdown {
  let sharesVal = 0;
  let sharesCount = 0;
  let etfsVal = 0;
  let etfsCount = 0;

  positions.forEach((pos) => {
    const val = pos.quantity * getPriceEur(pos.isin);
    if (pos.isEtf) {
      etfsVal += val;
      etfsCount += 1;
    } else {
      sharesVal += val;
      sharesCount += 1;
    }
  });

  const totalVal = sharesVal + etfsVal + cashBalance || 1;
  return {
    shares: { value: sharesVal, count: sharesCount, pct: (sharesVal / totalVal) * 100 },
    etfs: { value: etfsVal, count: etfsCount, pct: (etfsVal / totalVal) * 100 },
    cash: { value: cashBalance, pct: (cashBalance / totalVal) * 100 },
  };
}

export function computePortfolioCosts(
  transactions: TransactionRow[],
  totalDeposits: number
): PortfolioCosts {
  let taxes = 0;
  let tradingFees = 0;
  let subscriptionFees = 0;
  let compensations = 0;

  transactions.forEach((tx) => {
    const cat = getVal(tx, 'Transaction Category');
    const type = getVal(tx, 'Transaction Type');
    const isin = getVal(tx, 'Asset Id');
    const amt = Math.abs(parseNum(getVal(tx, 'Transaction Amount')));
    if (cat === 'tax') taxes += amt;
    if (cat === 'fees') {
      if (type === 'Trading Fee') tradingFees += amt;
      else subscriptionFees += amt;
    }
    if (cat === 'others') compensations += amt;
    if (cat === 'corporate_actions' && isin === 'DE000A3E5DT0') {
      compensations += amt;
    }
  });

  const grossCosts = taxes + tradingFees + subscriptionFees;
  const netCosts = Math.max(0, grossCosts - compensations);
  const costPercentage = totalDeposits > 0 ? (netCosts / totalDeposits) * 100 : 0;

  return {
    taxes,
    tradingFees,
    subscriptionFees,
    compensations,
    grossCosts,
    netCosts,
    costPercentage,
  };
}
