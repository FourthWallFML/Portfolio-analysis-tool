import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { AssetMappingMap, TransactionRow } from '../types/portfolio';

export function parseNum(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  let s = String(val).trim().replace(/['" €£$]/g, '');
  if (s.includes('.') && s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

export function getVal(row: Record<string, unknown> | null | undefined, ...keys: string[]): string {
  if (!row) return '';
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
      return String(row[k]).trim();
    }
  }
  const lowerMap: Record<string, unknown> = {};
  for (const realKey in row) {
    const norm = realKey.toLowerCase().replace(/[\s_\-.\ufeff]+/g, '');
    lowerMap[norm] = row[realKey];
  }
  for (const k of keys) {
    const normK = k.toLowerCase().replace(/[\s_\-.\ufeff]+/g, '');
    if (
      lowerMap[normK] !== undefined &&
      lowerMap[normK] !== null &&
      String(lowerMap[normK]).trim() !== ''
    ) {
      return String(lowerMap[normK]).trim();
    }
  }
  return '';
}

export function buildGoogleTickerFromExchange(beurs: unknown, rawTicker: unknown): string {
  const t = String(rawTicker || '').trim().toUpperCase();
  if (!t || t === '-') return '';
  if (t.includes(':')) return t;
  const b = String(beurs || '').toLowerCase();
  if (b.includes('brussels')) return `EBR:${t}`;
  if (b.includes('amsterdam')) return `AMS:${t}`;
  if (b.includes('paris')) return `EPA:${t}`;
  if (b.includes('london')) return `LON:${t}`;
  if (b.includes('xetra') || b.includes('frankfurt')) return `ETR:${t}`;
  if (b.includes('nasdaq')) return `NASDAQ:${t}`;
  if (b.includes('nyse')) return `NYSE:${t}`;
  return t;
}

export function resolveBoleroAssetIsin(
  rawAssetName: string,
  assetMapping: AssetMappingMap
): { isin: string; displayName: string } {
  const clean = String(rawAssetName || '')
    .replace(/\s+\d{2}\.\d{2}\.\d{2}$/, '')
    .replace(/\([A-Z]{2}\)?$/i, '')
    .trim();
  const normClean = clean.toLowerCase().replace(/[^a-z0-9]/g, '');

  for (const isin in assetMapping) {
    const mName = String(assetMapping[isin]?.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (mName && normClean && (mName.includes(normClean) || normClean.includes(mName))) {
      return { isin, displayName: assetMapping[isin].name || clean };
    }
  }

  const slug = clean.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'UNKNOWN';
  return { isin: `BOLERO_${slug}`, displayName: clean || rawAssetName };
}

function excelSerialToIsoDate(val: unknown): string {
  if (typeof val === 'number' && val > 20000 && val < 100000) {
    const utcDays = Math.floor(val - 25569);
    const d = new Date(utcDays * 86400 * 1000);
    return `${d.toISOString().slice(0, 10)} 12:00:00`;
  }
  const s = String(val || '').trim();
  const m = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]} 12:00:00`;
  const iso = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]} 12:00:00`;
  return s ? `${s} 12:00:00` : `${new Date().toISOString().slice(0, 10)} 12:00:00`;
}

export function parseBoleroExcelWorkbook(
  workbook: XLSX.WorkBook,
  broker: string,
  assetMapping: AssetMappingMap
): TransactionRow[] {
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
  if (!matrix || matrix.length < 2) return [];

  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(20, matrix.length); i++) {
    const joined = (matrix[i] || []).map((c) => String(c || '').toLowerCase()).join('|');
    if (
      (joined.includes('omschrijving') || joined.includes('transactie')) &&
      (joined.includes('datum') || joined.includes('bedrag'))
    ) {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx === -1) return [];

  const headers = (matrix[headerRowIdx] || []).map((c) => String(c || '').trim().toLowerCase());
  const findCol = (...needles: string[]) =>
    headers.findIndex((h) => needles.some((n) => h.includes(n)));

  const dateCol = findCol('datum', 'date');
  const descCol = findCol('omschrijving', 'description', 'transactie');
  const qtyCol = findCol('aantal', 'stuks', 'quantity');
  const amtCol = findCol('bedrag', 'netto', 'amount', 'totaal');
  const rvCol = findCol('roerende', 'voorheffing', 'bronbelasting');
  const pnlCol = findCol('winst', 'meerwaarde', 'pnl', 'resultaat');

  const patRows: TransactionRow[] = [];

  for (let r = headerRowIdx + 1; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row || row.length === 0) continue;
    const desc = descCol >= 0 ? String(row[descCol] || '').trim() : '';
    if (!desc) continue;
    const descLow = desc.toLowerCase();
    const rawDate = dateCol >= 0 ? excelSerialToIsoDate(row[dateCol]) : excelSerialToIsoDate('');
    const qty = Math.abs(qtyCol >= 0 ? parseNum(row[qtyCol]) : 0);
    const amount = amtCol >= 0 ? parseNum(row[amtCol]) : 0;
    const rvTax = Math.abs(rvCol >= 0 ? parseNum(row[rvCol]) : 0);
    const realizedPnl = pnlCol >= 0 ? parseNum(row[pnlCol]) : 0;

    if (descLow.startsWith('overschrijving van klant') || descLow.startsWith('storting')) {
      patRows.push({
        Broker: broker,
        'Transaction Time (CET)': rawDate,
        'Transaction Category': 'deposits',
        'Transaction Type': 'Deposit',
        'Transfer Type': 'CASH_CREDIT',
        'Transaction Amount': Math.abs(amount),
        'Transaction Description': desc,
      });
      continue;
    }

    if (descLow.startsWith('overschrijving naar klant')) {
      patRows.push({
        Broker: broker,
        'Transaction Time (CET)': rawDate,
        'Transaction Category': 'withdrawals',
        'Transaction Type': 'Withdrawal',
        'Transfer Type': 'CASH_DEBIT',
        'Transaction Amount': -Math.abs(amount),
        'Transaction Description': desc,
      });
      continue;
    }

    if (descLow.startsWith('terugstorting')) {
      patRows.push({
        Broker: broker,
        'Transaction Time (CET)': rawDate,
        'Transaction Category': 'others',
        'Transaction Type': 'Compensation',
        'Transfer Type': 'CASH_CREDIT',
        'Transaction Amount': Math.abs(amount),
        'Transaction Description': desc,
      });
      continue;
    }

    if (descLow.startsWith('aankoop online ') || descLow.startsWith('verkoop online ')) {
      const isBuy = descLow.startsWith('aankoop online ');
      const rawAsset = desc.replace(/^(aankoop|verkoop)\s+online\s+/i, '').trim();
      const resolved = resolveBoleroAssetIsin(rawAsset, assetMapping);
      patRows.push({
        Broker: broker,
        'Transaction Time (CET)': rawDate,
        'Transaction Category': 'trades',
        'Transaction Type': isBuy ? 'Buy Trade' : 'Sell Trade',
        'Transfer Type': isBuy ? 'CASH_DEBIT' : 'CASH_CREDIT',
        'Asset Id': resolved.isin,
        'Asset Name': resolved.displayName,
        'Asset Currency': 'EUR',
        'Asset Quantity': qty,
        'Transaction Amount': isBuy ? -Math.abs(amount) : Math.abs(amount),
        'Profit And Loss Amount': isBuy ? 0 : realizedPnl,
        'Transaction Description': desc,
      });
      continue;
    }

    if (descLow.startsWith('uitbetaling dividenden')) {
      const rawAsset = desc.replace(/^uitbetaling\s+dividenden\s+(cp\s+)?/i, '').trim();
      const resolved = resolveBoleroAssetIsin(rawAsset, assetMapping);
      const netDiv = Math.abs(amount);
      const grossDiv = netDiv + rvTax;
      patRows.push({
        Broker: broker,
        'Transaction Time (CET)': rawDate,
        'Transaction Category': 'dividends',
        'Transaction Type': 'Dividend',
        'Transfer Type': 'CASH_CREDIT',
        'Asset Id': resolved.isin,
        'Asset Name': resolved.displayName,
        'Asset Currency': 'EUR',
        'Transaction Amount': grossDiv,
        'Transaction Description': desc,
      });
      if (rvTax > 0) {
        patRows.push({
          Broker: broker,
          'Transaction Time (CET)': rawDate,
          'Transaction Category': 'dividends',
          'Transaction Type': 'Dividend Withholding Tax',
          'Transfer Type': 'CASH_DEBIT',
          'Asset Id': resolved.isin,
          'Asset Name': resolved.displayName,
          'Asset Currency': 'EUR',
          'Transaction Amount': -rvTax,
          'Transaction Description': `Roerende voorheffing ${resolved.displayName}`,
        });
      }
    }
  }

  return patRows;
}

export function normalizeBrokerCsvRow(
  row: Record<string, unknown>,
  broker: string,
  assetMapping: AssetMappingMap,
  rates: Record<string, number>
): { rows: TransactionRow[]; discoveredMappings: AssetMappingMap } {
  const discoveredMappings: AssetMappingMap = {};

  if (row['Transaction Category'] !== undefined) {
    return {
      rows: [{ ...(row as TransactionRow), Broker: broker }],
      discoveredMappings,
    };
  }

  if (row['Categorie'] !== undefined && row['Netto Cash Bedrag'] !== undefined) {
    const outRows: TransactionRow[] = [];
    const catRaw = String(row['Categorie'] || '').trim().toLowerCase();
    const rawDate = getVal(row, 'Datum', 'Boekingsdatum', 'Date');
    const timestamp = excelSerialToIsoDate(rawDate);
    const isin = getVal(row, 'ISIN', 'Asset Id').toUpperCase();
    const cleanName = getVal(row, 'Omschrijving / Effect', 'Effect', 'Product', 'Omschrijving');
    const beurs = getVal(row, 'Beurs', 'Exchange');
    const rawTicker = getVal(row, 'Ticker');
    const ccy = (getVal(row, 'Munt', 'Valuta', 'Currency') || 'EUR').toUpperCase();
    const qty = Math.abs(parseNum(getVal(row, 'Aantal', 'Quantity', 'Stuks')));
    const unitPrice = Math.abs(parseNum(getVal(row, 'Koers', 'Prijs', 'Price')));
    const netCashEur = parseNum(getVal(row, 'Netto Cash Bedrag', 'Netto Bedrag'));
    const feeOrig = Math.abs(parseNum(getVal(row, 'Makelaarsloon', 'Kosten', 'Fee')));
    const rvOrTaxOrig = Math.abs(parseNum(getVal(row, 'Beurstaks / RV', 'Taks', 'RV', 'TOB')));
    const desc = getVal(row, 'Omschrijving / Effect', 'Omschrijving') || catRaw;

    let toEurRate = 1.0;
    if (ccy !== 'EUR') {
      toEurRate = rates[ccy] || rates[`${ccy}EUR`] || 1.0;
      if (ccy === 'GBX' && toEurRate > 0.5) toEurRate /= 100.0;
    }

    if (isin) {
      const gfTicker = buildGoogleTickerFromExchange(beurs, rawTicker);
      if (!assetMapping[isin]) {
        discoveredMappings[isin] = {
          name: cleanName || isin,
          ticker: gfTicker,
          googleTicker: gfTicker,
          currency: ccy,
        };
      } else if (gfTicker && !assetMapping[isin].ticker) {
        discoveredMappings[isin] = {
          ...assetMapping[isin],
          ticker: gfTicker,
          googleTicker: gfTicker,
        };
      }
    }

    if (catRaw === 'storting') {
      outRows.push({
        Broker: broker,
        'Transaction Time (CET)': timestamp,
        'Transaction Category': 'deposits',
        'Transaction Type': 'Deposit',
        'Transfer Type': 'CASH_CREDIT',
        'Transaction Amount': Math.abs(netCashEur),
        'Transaction Description': desc,
      });
    } else if (catRaw === 'geldopname') {
      outRows.push({
        Broker: broker,
        'Transaction Time (CET)': timestamp,
        'Transaction Category': 'withdrawals',
        'Transaction Type': 'Withdrawal',
        'Transfer Type': 'CASH_DEBIT',
        'Transaction Amount': -Math.abs(netCashEur),
        'Transaction Description': desc,
      });
    } else if (catRaw === 'terugstorting') {
      outRows.push({
        Broker: broker,
        'Transaction Time (CET)': timestamp,
        'Transaction Category': 'others',
        'Transaction Type': 'Compensation',
        'Transfer Type': 'CASH_CREDIT',
        'Transaction Amount': Math.abs(netCashEur),
        'Transaction Description': desc,
      });
    } else if (catRaw === 'dividend') {
      const netDivEur = Math.abs(netCashEur);
      const rvEur = Math.round(rvOrTaxOrig * toEurRate * 100) / 100;
      const grossDivEur = Math.round((netDivEur + rvEur) * 100) / 100;
      outRows.push({
        Broker: broker,
        'Transaction Time (CET)': timestamp,
        'Transaction Category': 'dividends',
        'Transaction Type': 'Dividend',
        'Transfer Type': 'CASH_CREDIT',
        'Asset Id': isin,
        'Asset Name': cleanName,
        'Asset Currency': ccy,
        'Transaction Amount': grossDivEur,
        'Transaction Description': desc,
      });
      if (rvEur > 0) {
        outRows.push({
          Broker: broker,
          'Transaction Time (CET)': timestamp,
          'Transaction Category': 'dividends',
          'Transaction Type': 'Dividend Withholding Tax',
          'Transfer Type': 'CASH_DEBIT',
          'Asset Id': isin,
          'Asset Name': cleanName,
          'Asset Currency': ccy,
          'Transaction Amount': -rvEur,
          'Transaction Description': `Roerende voorheffing ${cleanName}`,
        });
      }
    } else if (catRaw === 'aankoop' || catRaw === 'verkoop') {
      const isBuy = catRaw === 'aankoop';
      const netAbsEur = Math.abs(netCashEur);
      const feeEur = Math.round(feeOrig * toEurRate * 100) / 100;
      const tobEur = Math.round(rvOrTaxOrig * toEurRate * 100) / 100;
      outRows.push({
        Broker: broker,
        'Transaction Time (CET)': timestamp,
        'Transaction Category': 'trades',
        'Transaction Type': isBuy ? 'Buy Trade' : 'Sell Trade',
        'Transfer Type': isBuy ? 'CASH_DEBIT' : 'CASH_CREDIT',
        'Asset Id': isin,
        'Asset Name': cleanName,
        'Asset Currency': ccy,
        'Asset Quantity': qty,
        'Transaction Amount': isBuy ? -netAbsEur : netAbsEur,
        'Profit And Loss Amount': 0,
        'Transaction Description': desc,
      });
      if (feeEur > 0) {
        outRows.push({
          Broker: broker,
          'Transaction Time (CET)': timestamp,
          'Transaction Category': 'fees',
          'Transaction Type': 'Trading Fee',
          'Transfer Type': 'CASH_DEBIT',
          'Asset Id': isin,
          'Asset Name': cleanName,
          'Transaction Amount': -feeEur,
          'Transaction Description': `Makelaarsloon ${cleanName}`,
        });
      }
      if (tobEur > 0) {
        outRows.push({
          Broker: broker,
          'Transaction Time (CET)': timestamp,
          'Transaction Category': 'tax',
          'Transaction Type': 'Transaction Tax',
          'Transfer Type': 'CASH_DEBIT',
          'Asset Id': isin,
          'Asset Name': cleanName,
          'Transaction Amount': -tobEur,
          'Transaction Description': `Beurstaks (TOB) ${cleanName}`,
        });
      }
    } else if (catRaw === 'effectentransfer') {
      const transferValEur = Math.round(qty * unitPrice * toEurRate * 100) / 100;
      outRows.push({
        Broker: broker,
        'Transaction Time (CET)': timestamp,
        'Transaction Category': 'trades',
        'Transaction Type': 'Buy Trade',
        'Transfer Type': '',
        'Asset Id': isin,
        'Asset Name': cleanName,
        'Asset Currency': ccy,
        'Asset Quantity': qty,
        'Transaction Amount': -transferValEur,
        'Profit And Loss Amount': 0,
        'Transaction Description': desc,
      });
    }

    return { rows: outRows, discoveredMappings };
  }

  // Fallback generic broker CSV
  const dateVal = getVal(row, 'Datum', 'Date', 'Transaction Time (CET)', 'Boekingsdatum');
  const timeVal = getVal(row, 'Tijd', 'Time') || '12:00:00';
  const isin = getVal(row, 'ISIN', 'Asset Id').toUpperCase();
  const name = getVal(row, 'Product', 'Omschrijving', 'Effect', 'Asset Name', 'Name');
  const qty = parseNum(getVal(row, 'Aantal', 'Quantity', 'Stuks'));
  const totalEur = parseNum(
    getVal(row, 'Totaal', 'Total', 'Bedrag', 'Netto bedrag', 'Transaction Amount')
  );
  const desc = getVal(row, 'Omschrijving', 'Description', 'Type') || '';
  const descLow = desc.toLowerCase();

  let category = 'trades';
  let txType = qty >= 0 ? 'Buy Trade' : 'Sell Trade';
  let transferType = totalEur <= 0 ? 'CASH_DEBIT' : 'CASH_CREDIT';

  if (descLow.includes('dividend')) {
    category = 'dividends';
    txType = totalEur < 0 ? 'Dividend Tax' : 'Dividend';
    transferType = totalEur < 0 ? 'CASH_DEBIT' : 'CASH_CREDIT';
  } else if (
    descLow.includes('storting') ||
    descLow.includes('deposit') ||
    descLow.includes('ideal')
  ) {
    category = 'deposits';
    txType = 'Deposit';
    transferType = 'CASH_CREDIT';
  } else if (
    descLow.includes('opname') ||
    descLow.includes('withdrawal') ||
    descLow.includes('terugstorting')
  ) {
    category = 'withdrawals';
    txType = 'Withdrawal';
    transferType = 'CASH_DEBIT';
  } else if (
    descLow.includes('transactiekosten') ||
    descLow.includes('fee') ||
    descLow.includes('aansluitingskosten')
  ) {
    category = 'fees';
    txType = 'Trading Fee';
    transferType = 'CASH_DEBIT';
  } else if (
    descLow.includes('taks') ||
    descLow.includes('tob') ||
    descLow.includes('belasting')
  ) {
    category = 'tax';
    txType = 'Transaction Tax';
    transferType = 'CASH_DEBIT';
  }

  return {
    rows: [
      {
        Broker: broker,
        'Transaction Time (CET)': `${dateVal} ${timeVal}`.trim(),
        'Transaction Category': category,
        'Transaction Type': txType,
        'Transfer Type': transferType,
        'Asset Id': isin,
        'Asset Name': name,
        'Asset Currency': getVal(row, 'Valuta', 'Currency') || 'EUR',
        'Asset Quantity': Math.abs(qty),
        'Transaction Amount': totalEur,
        'Transaction Description': desc,
      },
    ],
    discoveredMappings,
  };
}

export async function parseUploadedPortfolioFile(
  file: File,
  broker: string,
  assetMapping: AssetMappingMap,
  rates: Record<string, number>
): Promise<{ rows: TransactionRow[]; discoveredMappings: AssetMappingMap }> {
  const isExcel = /\.(xlsx|xls)$/i.test(file.name);

  if (isExcel) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
    const rows = parseBoleroExcelWorkbook(workbook, broker, assetMapping);
    return { rows, discoveredMappings: {} };
  }

  const rawText = (await file.text()).replace(/^\ufeff/, '');
  const firstLine = rawText.split(/\r\n|\n|\r/)[0] || '';
  const delimiter = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';

  const parsed = Papa.parse<Record<string, unknown>>(rawText, {
    header: true,
    delimiter,
    skipEmptyLines: 'greedy',
  });

  const rows: TransactionRow[] = [];
  const discoveredMappings: AssetMappingMap = {};

  (parsed.data || [])
    .filter((r) => Object.keys(r).length > 1)
    .forEach((r) => {
      const normalized = normalizeBrokerCsvRow(r, broker, assetMapping, rates);
      rows.push(...normalized.rows);
      Object.assign(discoveredMappings, normalized.discoveredMappings);
    });

  return { rows, discoveredMappings };
}
