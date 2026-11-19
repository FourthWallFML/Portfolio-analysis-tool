import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  ChevronDown,
  ChevronUp,
  Download,
  GitBranch,
  LayoutGrid,
  Link2,
  Plus,
  RefreshCw,
  Settings,
  SlidersHorizontal,
  TrendingUp,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { AssetManagerTab } from './components/AssetManagerTab';
import { DashboardTab } from './components/DashboardTab';
import {
  BackendSettingsModal,
  ClosedPositionsModal,
  CorporateActionsModal,
  CsvUploadModal,
  EditAssetModal,
  ManageMappingsModal,
  ManualTxModal,
} from './components/Modals';
import { PositionsTab } from './components/PositionsTab';
import { TwrTab } from './components/TwrTab';
import {
  computePortfolioBreakdown,
  computePortfolioCosts,
  computeUnifiedLedger,
  formatOriginalPrice,
  getAssetCurrency,
  getAssetDisplayName,
  getAssetPriceInEur,
  getExactRawPriceForIsin,
  isRawTickerOrIsin,
} from './engine/ledger';
import { getVal, parseUploadedPortfolioFile } from './engine/parser';
import {
  computeClientSummaryList,
  computeClientTranches,
  computeTwrHorizonSummary,
  getActiveTwrTimeline,
  HORIZON_DEFS,
  trimHistoryToPortfolioRange,
} from './engine/twr';
import {
  idbClearAll,
  loadCachedHistoryBundle,
  saveCachedHistoryBundle,
} from './services/idbCache';
import {
  DUMMY_ISINS,
  fetchSheetMode,
  getGoogleScriptUrl,
  postDeleteClientEntry,
  postDeleteCsvBatch,
  postDeleteManualTransaction,
  postManualTransactionToSheet,
  postMappingToSheet,
  postSaveClientEntry,
  postSaveCsvBatch,
  postTagAndOverrideToSheet,
  setGoogleScriptUrl,
} from './services/googleSheets';
import {
  ActiveTab,
  AssetMappingMap,
  AssetTagsMap,
  BenchmarkConfig,
  ClientDeposit,
  CorporateAction,
  CsvBatch,
  EditingAssetForm,
  HistoryData,
  HorizonKey,
  Position,
  PositionOverridesMap,
  PositionSortCol,
  SheetFastOrFullPayload,
  TransactionRow,
  TwrPoint,
} from './types/portfolio';

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeSave(key: string, val: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    // ignore quota errors
  }
}

const DEFAULT_RATES: Record<string, number> = {
  USDEUR: 0.92,
  USD: 0.92,
  EUR: 1.0,
  GBP: 1.17,
  GBX: 0.0117,
  CHF: 1.05,
  CAD: 0.68,
};

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [selectedBrokerFilter, setSelectedBrokerFilter] = useState<string>('ALL');
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>('ALL');
  const [twrHorizon, setTwrHorizon] = useState<HorizonKey>('MAX');
  const [sortCol, setSortCol] = useState<PositionSortCol>('value');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // Core persisted portfolio state
  const [assetMapping, setAssetMapping] = useState<AssetMappingMap>(() => {
    const m = readStorage<AssetMappingMap>('pat_mapping', {});
    DUMMY_ISINS.forEach((d) => delete m[d]);
    return m;
  });
  const [corporateActions, setCorporateActions] = useState<CorporateAction[]>(() =>
    readStorage<CorporateAction[]>('pat_corporate_actions', [])
  );
  const [latestPrices, setLatestPrices] = useState<Record<string, number>>(() =>
    readStorage<Record<string, number>>('pat_prices', {})
  );
  const [currencies, setCurrencies] = useState<Record<string, string>>(() =>
    readStorage<Record<string, string>>('pat_currencies', {})
  );
  const [rates, setRates] = useState<Record<string, number>>(() =>
    readStorage<Record<string, number>>('pat_rates', DEFAULT_RATES)
  );
  const [historyData, setHistoryData] = useState<HistoryData>({ dates: [], tickers: [], prices: {} });
  const [twrHistory, setTwrHistory] = useState<TwrPoint[]>(() =>
    readStorage<TwrPoint[]>('pat_twr_history', [])
  );
  const [benchmarkConfigs, setBenchmarkConfigs] = useState<BenchmarkConfig[]>(() =>
    readStorage<BenchmarkConfig[]>('pat_benchmarks', [])
  );
  const [csvBatches, setCsvBatches] = useState<CsvBatch[]>(() =>
    readStorage<CsvBatch[]>('pat_csv_batches', [])
  );
  const [manualTransactions, setManualTransactions] = useState<TransactionRow[]>(() =>
    readStorage<TransactionRow[]>('pat_manual_transactions', [])
  );
  const [clientDeposits, setClientDeposits] = useState<ClientDeposit[]>(() =>
    readStorage<ClientDeposit[]>('pat_client_deposits', [])
  );
  const [assetTagsMap, setAssetTagsMap] = useState<AssetTagsMap>(() =>
    readStorage<AssetTagsMap>('pat_asset_tags', {})
  );
  const [positionOverrides, setPositionOverrides] = useState<PositionOverridesMap>(() =>
    readStorage<PositionOverridesMap>('pat_position_overrides', {})
  );
  const [loadedFileName, setLoadedFileName] = useState<string>(
    () => localStorage.getItem('pat_filename') || ''
  );

  // UI state
  const [syncStatus, setSyncStatus] = useState<string>('Verbinden met Google Sheet...');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isFullSyncLoading, setIsFullSyncLoading] = useState<boolean>(false);
  const [historyCachedAt, setHistoryCachedAt] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<string>('');
  const [openToolsMenu, setOpenToolsMenu] = useState<boolean>(false);
  const [showUnmappedDetails, setShowUnmappedDetails] = useState<boolean>(false);
  const [inlineDrafts, setInlineDrafts] = useState<Record<string, { ticker: string; currency: string }>>({});
  const [bannerError, setBannerError] = useState<boolean>(false);

  // Modals
  const [editingAsset, setEditingAsset] = useState<EditingAssetForm | null>(null);
  const [showManageMappingsModal, setShowManageMappingsModal] = useState<boolean>(false);
  const [showClosedPositionsModal, setShowClosedPositionsModal] = useState<boolean>(false);
  const [showCorporateActionsModal, setShowCorporateActionsModal] = useState<boolean>(false);
  const [showCsvUploadModal, setShowCsvUploadModal] = useState<boolean>(false);
  const [showManualTxModal, setShowManualTxModal] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);

  const toolsMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target as Node)) {
        setOpenToolsMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Hydrate payload from Google Apps Script (?mode=fast or ?mode=full)
  const applySheetPayload = useCallback((data: SheetFastOrFullPayload) => {
    if (data.mapping) {
      setAssetMapping((prev) => {
        const next: AssetMappingMap = { ...prev };
        for (const isin in data.mapping) {
          if (DUMMY_ISINS.includes(isin)) continue;
          const inc = data.mapping[isin];
          if (!inc) continue;
          const incomingTicker = inc.ticker || '';
          const incomingApi = inc.apiTicker || incomingTicker;
          const incomingGf = inc.googleTicker || incomingTicker;
          const incomingName = inc.name || '';
          const incomingCcy = inc.currency || '';

          if (!next[isin]) {
            next[isin] = {
              name: incomingName,
              ticker: incomingTicker,
              apiTicker: incomingApi,
              googleTicker: incomingGf,
              currency: incomingCcy || 'EUR',
            };
          } else {
            const cur = { ...next[isin] };
            if (incomingTicker) cur.ticker = incomingTicker;
            if (incomingApi) cur.apiTicker = incomingApi;
            if (incomingGf) cur.googleTicker = incomingGf;
            if (
              incomingName &&
              !isRawTickerOrIsin(incomingName, isin, incomingTicker) &&
              isRawTickerOrIsin(cur.name, isin, cur.ticker)
            ) {
              cur.name = incomingName;
            }
            if (incomingCcy) cur.currency = incomingCcy;
            next[isin] = cur;
          }
        }
        safeSave('pat_mapping', next);
        return next;
      });
    }

    if (data.prices) {
      setLatestPrices((prev) => {
        const next = { ...prev };
        for (const key in data.prices) {
          const val = parseFloat(String(data.prices[key]));
          if (!isNaN(val) && val > 0) {
            next[key] = val;
          }
        }
        safeSave('pat_prices', next);
        return next;
      });
    }

    if (data.currencies) {
      setCurrencies(data.currencies);
      safeSave('pat_currencies', data.currencies);
    }

    if (data.rates) {
      setRates(data.rates);
      safeSave('pat_rates', data.rates);
    }

    if (data.history && data.history.dates && data.history.dates.length > 0) {
      // Find earliest transaction date from incoming or existing batches to trim pre-portfolio decades
      let earliestTx = '';
      const batchesToScan = Array.isArray(data.csvBatches) ? data.csvBatches : [];
      batchesToScan.forEach((b) => {
        (b.rows || []).forEach((r) => {
          const d = String(getVal(r, 'Transaction Time (CET)', 'Date', 'Datum') || '').slice(0, 10);
          if (/^\d{4}-\d{2}-\d{2}$/.test(d) && (!earliestTx || d < earliestTx)) {
            earliestTx = d;
          }
        });
      });

      const trimmed = trimHistoryToPortfolioRange(data.history, earliestTx);
      setHistoryData(trimmed);
      const savedAt = Date.now();
      setHistoryCachedAt(savedAt);
      const nextTwr = Array.isArray(data.twrHistory) ? data.twrHistory : [];
      saveCachedHistoryBundle({
        historyData: trimmed,
        twrHistory: nextTwr,
        savedAt,
      }).catch(() => {});
    }

    if (Array.isArray(data.clients)) {
      const cleaned: ClientDeposit[] = data.clients
        .map((c) => ({
          id: String(c.id || `cdep_${Math.random()}`),
          person: String(c.person || '').trim(),
          date: String(c.date || '').trim().slice(0, 10),
          type: (String(c.type || 'deposit').trim().toLowerCase() === 'withdrawal'
            ? 'withdrawal'
            : 'deposit') as 'deposit' | 'withdrawal',
          amount: Math.abs(parseFloat(String(c.amount || 0)) || 0),
          note: String(c.note || '').trim(),
        }))
        .filter((c) => c.person && c.date && c.amount > 0);
      setClientDeposits(cleaned);
      safeSave('pat_client_deposits', cleaned);
    }

    if (Array.isArray(data.csvBatches) && data.csvBatches.length > 0) {
      setCsvBatches(data.csvBatches);
      safeSave('pat_csv_batches', data.csvBatches);
      const latestBatch = data.csvBatches[data.csvBatches.length - 1];
      if (latestBatch?.fileName) {
        const label = `${latestBatch.fileName} (${latestBatch.broker})`;
        setLoadedFileName(label);
        try {
          localStorage.setItem('pat_filename', label);
        } catch {
          // ignore
        }
      }
    }

    if (Array.isArray(data.manualTransactions)) {
      const rebuiltManual: TransactionRow[] = [];
      data.manualTransactions.forEach((mtx) => {
        const id = String(mtx.id || `mtx_${Math.random()}`);
        const ts = `${mtx.date || ''} 12:00:00`;
        const type = String(mtx.type || 'BUY').toUpperCase();
        const isin = String(mtx.isin || '').toUpperCase();
        const name = String(mtx.name || isin).trim();
        const qty = Math.abs(parseFloat(String(mtx.qty || 0)) || 0);
        const price = Math.abs(parseFloat(String(mtx.price || 0)) || 0);
        const fee = Math.abs(parseFloat(String(mtx.fee || 0)) || 0);
        const broker = String(mtx.broker || 'Bolero').trim();
        const note = String(mtx.note || '').trim();

        if (type === 'DEPOSIT' || type === 'WITHDRAWAL') {
          const isOut = type === 'WITHDRAWAL';
          rebuiltManual.push({
            _manualId: id,
            Broker: broker,
            'Transaction Time (CET)': ts,
            'Transaction Category': isOut ? 'withdrawals' : 'deposits',
            'Transaction Type': isOut ? 'Withdrawal' : 'Deposit',
            'Transfer Type': isOut ? 'CASH_DEBIT' : 'CASH_CREDIT',
            'Transaction Amount': isOut ? -price : price,
            'Transaction Description': note || (isOut ? 'Afhaling' : 'Storting'),
          });
        } else if (type === 'DIVIDEND') {
          rebuiltManual.push({
            _manualId: id,
            Broker: broker,
            'Transaction Time (CET)': ts,
            'Transaction Category': 'dividends',
            'Transaction Type': 'Dividend',
            'Transfer Type': 'CASH_CREDIT',
            'Asset Id': isin,
            'Asset Name': name,
            'Asset Currency': mtx.currency || 'EUR',
            'Transaction Amount': price,
            'Transaction Description': note || `Dividend ${name}`,
          });
          if (fee > 0) {
            rebuiltManual.push({
              _manualId: id,
              Broker: broker,
              'Transaction Time (CET)': ts,
              'Transaction Category': 'dividends',
              'Transaction Type': 'Dividend Withholding Tax',
              'Transfer Type': 'CASH_DEBIT',
              'Asset Id': isin,
              'Asset Name': name,
              'Transaction Amount': -fee,
              'Transaction Description': `Bronbelasting ${name}`,
            });
          }
        } else {
          const isBuy = type !== 'SELL';
          const totalEur = qty * price;
          rebuiltManual.push({
            _manualId: id,
            Broker: broker,
            'Transaction Time (CET)': ts,
            'Transaction Category': 'trades',
            'Transaction Type': isBuy ? 'Buy Trade' : 'Sell Trade',
            'Transfer Type': isBuy ? 'CASH_DEBIT' : 'CASH_CREDIT',
            'Asset Id': isin,
            'Asset Name': name,
            'Asset Currency': mtx.currency || 'EUR',
            'Asset Quantity': qty,
            'Transaction Amount': isBuy ? -totalEur : totalEur,
            'Profit And Loss Amount': parseFloat(String(mtx.realizedPnl || 0)) || 0,
            'Transaction Description': note || `${isBuy ? 'Buy' : 'Sell'} Trade (${broker})`,
          });
          if (fee > 0) {
            rebuiltManual.push({
              _manualId: id,
              Broker: broker,
              'Transaction Time (CET)': ts,
              'Transaction Category': 'fees',
              'Transaction Type': 'Trading Fee',
              'Transfer Type': 'CASH_DEBIT',
              'Asset Id': isin,
              'Asset Name': name,
              'Transaction Amount': -fee,
              'Transaction Description': `Transactiekosten ${name}`,
            });
          }
        }
      });
      setManualTransactions(rebuiltManual);
      safeSave('pat_manual_transactions', rebuiltManual);
    }

    if (Array.isArray(data.benchmarks) && data.benchmarks.length > 0) {
      setBenchmarkConfigs(data.benchmarks);
      safeSave('pat_benchmarks', data.benchmarks);
    }

    if (Array.isArray(data.twrHistory) && data.twrHistory.length > 0) {
      setTwrHistory(data.twrHistory);
      safeSave('pat_twr_history', data.twrHistory);
    }

    if (Array.isArray(data.tagsOverrides) && data.tagsOverrides.length > 0) {
      const nextTags: AssetTagsMap = {};
      const nextOverrides: PositionOverridesMap = {};
      data.tagsOverrides.forEach((row) => {
        const isin = String(row.isin || '').trim().toUpperCase();
        if (!isin) return;
        const tags = String(row.tags || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const comment = String(row.comment || '').trim();
        if (tags.length > 0 || comment) {
          nextTags[isin] = { tags, comment };
        }
        const ovGak =
          row.overrideGak !== '' && row.overrideGak !== undefined
            ? parseFloat(String(row.overrideGak))
            : NaN;
        const ovQty =
          row.overrideQty !== '' && row.overrideQty !== undefined
            ? parseFloat(String(row.overrideQty))
            : NaN;
        if (!isNaN(ovGak) || !isNaN(ovQty)) {
          nextOverrides[isin] = {
            avgPrice: !isNaN(ovGak) ? ovGak : '',
            quantity: !isNaN(ovQty) ? ovQty : '',
            comment: comment || 'Gecorrigeerd (Sheet)',
          };
        }
      });
      setAssetTagsMap((prev) => {
        const merged = { ...prev, ...nextTags };
        safeSave('pat_asset_tags', merged);
        return merged;
      });
      setPositionOverrides((prev) => {
        const merged = { ...prev, ...nextOverrides };
        safeSave('pat_position_overrides', merged);
        return merged;
      });
    }
  }, []);

  const fetchFullHistoryFromSheet = useCallback(async () => {
    setIsFullSyncLoading(true);
    setSyncStatus('Historie & TWR ophalen uit Google Sheet...');
    try {
      const fullData = await fetchSheetMode('full');
      if (fullData.status === 'success') {
        applySheetPayload(fullData);
        setSyncStatus(`Gesynchroniseerd om ${new Date().toLocaleTimeString('nl-NL')}`);
      }
    } catch {
      setSyncStatus(`Live koersen actief (${new Date().toLocaleTimeString('nl-NL')})`);
    } finally {
      setIsFullSyncLoading(false);
    }
  }, [applySheetPayload]);

  const syncWithGoogleSheet = useCallback(
    async (forceFullHistory = false) => {
      setIsSyncing(true);
      setSyncStatus('Snelle sync...');
      try {
        const fastData = await fetchSheetMode('fast');
        if (fastData.status === 'success') {
          applySheetPayload(fastData);
        }
        setIsSyncing(false);

        // Check IndexedDB cache freshness (6 hours) before triggering slow 28s ?mode=full
        const cached = await loadCachedHistoryBundle();
        const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
        const hasFreshCache =
          !forceFullHistory &&
          cached &&
          cached.historyData?.dates?.length > 1 &&
          Date.now() - cached.savedAt < SIX_HOURS_MS;

        if (hasFreshCache) {
          setSyncStatus(`Live koersen actief (${new Date().toLocaleTimeString('nl-NL')})`);
          return;
        }

        // Background full history refresh
        setSyncStatus('Live koersen actief · Historie laden...');
        setTimeout(() => {
          fetchFullHistoryFromSheet();
        }, 300);
      } catch {
        setIsSyncing(false);
        setIsFullSyncLoading(false);
        setSyncStatus('Offline modus (lokale cache actief)');
      }
    },
    [applySheetPayload, fetchFullHistoryFromSheet]
  );

  // Instant hydration from IndexedDB + live fast sync on mount
  useEffect(() => {
    let active = true;
    loadCachedHistoryBundle().then((cached) => {
      if (!active || !cached) return;
      if (cached.historyData?.dates?.length > 0) {
        setHistoryData(cached.historyData);
        setHistoryCachedAt(cached.savedAt);
      }
      if (cached.twrHistory?.length > 0) {
        setTwrHistory(cached.twrHistory);
      }
    });
    syncWithGoogleSheet(false);
    return () => {
      active = false;
    };
  }, [syncWithGoogleSheet]);

  // Combine CSV batches + manual transactions and apply broker & tag filters
  const activeTransactions = useMemo<TransactionRow[]>(() => {
    let combined: TransactionRow[] = [];
    csvBatches.forEach((batch) => {
      (batch.rows || []).forEach((r) => {
        combined.push({ ...r, Broker: r.Broker || batch.broker || 'Overig' });
      });
    });
    manualTransactions.forEach((mtx) => {
      combined.push({ ...mtx, Broker: mtx.Broker || 'Overig' });
    });

    if (selectedBrokerFilter && selectedBrokerFilter !== 'ALL') {
      combined = combined.filter((t) => (t.Broker || 'Overig') === selectedBrokerFilter);
    }

    if (selectedTagFilter && selectedTagFilter !== 'ALL') {
      const targetTag = selectedTagFilter.toLowerCase();
      combined = combined.filter((t) => {
        const isin = getVal(t, 'Asset Id', 'ISIN');
        const assetTags = isin
          ? (assetTagsMap[isin]?.tags || []).map((x) => x.toLowerCase())
          : [];
        const txTags = Array.isArray(t._tags) ? t._tags.map((x) => x.toLowerCase()) : [];
        const brokerTag = String(t.Broker || '').toLowerCase();
        return assetTags.includes(targetTag) || txTags.includes(targetTag) || brokerTag === targetTag;
      });
    }

    return combined;
  }, [csvBatches, manualTransactions, selectedBrokerFilter, selectedTagFilter, assetTagsMap]);

  // Unified Ledger calculation
  const ledger = useMemo(
    () =>
      computeUnifiedLedger(activeTransactions, assetMapping, corporateActions, positionOverrides),
    [activeTransactions, assetMapping, corporateActions, positionOverrides]
  );

  const getDisplayName = useCallback(
    (posOrIsin: { isin: string; name?: string } | string) =>
      getAssetDisplayName(posOrIsin, assetMapping, corporateActions, activeTransactions),
    [assetMapping, corporateActions, activeTransactions]
  );

  const getCurrency = useCallback(
    (isin: string) => getAssetCurrency(isin, assetMapping, currencies, activeTransactions),
    [assetMapping, currencies, activeTransactions]
  );

  const getPriceEur = useCallback(
    (isin: string) =>
      getAssetPriceInEur(
        isin,
        ledger.positions,
        latestPrices,
        assetMapping,
        currencies,
        rates,
        historyData,
        activeTransactions
      ),
    [ledger.positions, latestPrices, assetMapping, currencies, rates, historyData, activeTransactions]
  );

  const getRawPrice = useCallback(
    (isin: string) => {
      const live = getExactRawPriceForIsin(isin, latestPrices, assetMapping, historyData);
      if (live > 0) return live;
      const pos = ledger.positions.find((p) => p.isin === isin);
      return pos ? pos.avgPrice : 0;
    },
    [latestPrices, assetMapping, historyData, ledger.positions]
  );

  const formatOrigPrice = useCallback(
    (isin: string) =>
      formatOriginalPrice(
        isin,
        ledger.positions,
        latestPrices,
        assetMapping,
        currencies,
        historyData,
        activeTransactions
      ),
    [ledger.positions, latestPrices, assetMapping, currencies, historyData, activeTransactions]
  );

  const hasPriceWarning = useCallback(
    (isin: string) => getExactRawPriceForIsin(isin, latestPrices, assetMapping, historyData) <= 0,
    [latestPrices, assetMapping, historyData]
  );

  // Dashboard aggregates
  const positionsValue = useMemo(
    () => ledger.positions.reduce((acc, pos) => acc + pos.quantity * getPriceEur(pos.isin), 0),
    [ledger.positions, getPriceEur]
  );

  const totalPortfolioValue = positionsValue + ledger.cashBalance;

  const unrealizedPnL = useMemo(
    () =>
      ledger.positions.reduce(
        (acc, pos) => acc + (pos.quantity * getPriceEur(pos.isin) - pos.quantity * pos.avgPrice),
        0
      ),
    [ledger.positions, getPriceEur]
  );

  const totalProfitLoss = ledger.realizedPnL + unrealizedPnL;

  const breakdown = useMemo(
    () => computePortfolioBreakdown(ledger.positions, ledger.cashBalance, getPriceEur),
    [ledger.positions, ledger.cashBalance, getPriceEur]
  );

  const costs = useMemo(
    () => computePortfolioCosts(activeTransactions, ledger.deposits),
    [activeTransactions, ledger.deposits]
  );

  // Lazy TWR timelines & benchmarks (only compute when TWR or Asset Manager tab is active)
  const needsTwrTimeline = activeTab === 'twr' || activeTab === 'clients';

  const activeTwrTimeline = useMemo(() => {
    if (activeTab !== 'twr') return [];
    return getActiveTwrTimeline({
      forceTotal: false,
      selectedBrokerFilter,
      selectedTagFilter,
      twrHistory,
      transactions: activeTransactions,
      historyData,
      assetMapping,
      rates,
    });
  }, [
    activeTab,
    selectedBrokerFilter,
    selectedTagFilter,
    twrHistory,
    activeTransactions,
    historyData,
    assetMapping,
    rates,
  ]);

  const totalTwrTimeline = useMemo(() => {
    if (!needsTwrTimeline) return [];
    if (
      activeTab === 'twr' &&
      selectedBrokerFilter === 'ALL' &&
      selectedTagFilter === 'ALL'
    ) {
      return activeTwrTimeline;
    }
    return getActiveTwrTimeline({
      forceTotal: true,
      selectedBrokerFilter,
      selectedTagFilter,
      twrHistory,
      transactions: activeTransactions,
      historyData,
      assetMapping,
      rates,
    });
  }, [
    needsTwrTimeline,
    activeTab,
    activeTwrTimeline,
    selectedBrokerFilter,
    selectedTagFilter,
    twrHistory,
    activeTransactions,
    historyData,
    assetMapping,
    rates,
  ]);

  const twrHorizonSummary = useMemo(() => {
    if (activeTab !== 'twr') {
      return {
        horizons: HORIZON_DEFS.map((h) => ({ ...h, portfolioPct: 0 })),
        benchmarks: [],
      };
    }
    return computeTwrHorizonSummary(
      activeTwrTimeline,
      benchmarkConfigs,
      historyData,
      assetMapping,
      latestPrices,
      rates
    );
  }, [
    activeTab,
    activeTwrTimeline,
    benchmarkConfigs,
    historyData,
    assetMapping,
    latestPrices,
    rates,
  ]);

  // Asset Manager / Client Tranches
  const computedClientTranches = useMemo(
    () => computeClientTranches(clientDeposits, totalTwrTimeline),
    [clientDeposits, totalTwrTimeline]
  );

  const clientSummaryList = useMemo(
    () => computeClientSummaryList(computedClientTranches),
    [computedClientTranches]
  );

  // Available tags
  const allAvailableTags = useMemo(() => {
    const tagSet = new Set<string>(['Bolero', 'BUX']);
    Object.values(assetTagsMap).forEach((entry) => {
      entry?.tags?.forEach((t) => {
        if (t) tagSet.add(t);
      });
    });
    manualTransactions.forEach((mtx) => {
      mtx._tags?.forEach((t) => {
        if (t) tagSet.add(t);
      });
    });
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
  }, [assetTagsMap, manualTransactions]);

  // Unmapped ISINs
  const unmappedIsins = useMemo(() => {
    if (activeTransactions.length === 0) return [];
    const activeSet = new Set<string>();
    activeTransactions.forEach((tx) => {
      const isin = getVal(tx, 'Asset Id', 'ISIN');
      if (isin && !DUMMY_ISINS.includes(isin)) activeSet.add(isin);
    });
    return Array.from(activeSet).filter((isin) => {
      const isMergedSource =
        corporateActions.some((ca) => ca.type === 'merger' && ca.fromIsin === isin) ||
        ledger.mergerClosedPositions.some((mc) => mc.isin === isin);
      if (isMergedSource) return false;
      return !assetMapping[isin] || !assetMapping[isin].ticker || assetMapping[isin].ticker.trim() === '';
    });
  }, [activeTransactions, corporateActions, ledger.mergerClosedPositions, assetMapping]);

  const activeAssetMappingEntries = useMemo(
    () =>
      Object.entries(assetMapping).filter(([isin]) => {
        if (DUMMY_ISINS.includes(isin)) return false;
        const isMergedSource =
          corporateActions.some((ca) => ca.type === 'merger' && ca.fromIsin === isin) ||
          ledger.mergerClosedPositions.some((mc) => mc.isin === isin);
        return !isMergedSource;
      }),
    [assetMapping, corporateActions, ledger.mergerClosedPositions]
  );

  const allKnownAssets = useMemo(() => {
    const map: Record<string, string> = {};
    ledger.positions.forEach((p) => {
      map[p.isin] = getDisplayName(p);
    });
    Object.keys(assetMapping).forEach((isin) => {
      if (!DUMMY_ISINS.includes(isin) && !map[isin]) {
        map[isin] = getDisplayName(isin);
      }
    });
    return Object.entries(map)
      .map(([isin, name]) => ({ isin, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [ledger.positions, assetMapping, getDisplayName]);

  // Handlers
  const handleSetSort = (col: PositionSortCol) => {
    if (sortCol === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(col);
      setSortAsc(col === 'name' || col === 'type');
    }
  };

  const handleSaveMapping = useCallback(
    (isin: string, rawTicker: string, rawCcy: string) => {
      const ticker = rawTicker.trim();
      const currency = (rawCcy || getCurrency(isin) || 'EUR').trim().toUpperCase();
      if (!ticker) {
        setToastMessage('Vul eerst een geldige ticker in (bv. LON:III of EPA:NATO).');
        return;
      }
      const name = getDisplayName(isin) || isin;
      setAssetMapping((prev) => {
        const next: AssetMappingMap = {
          ...prev,
          [isin]: {
            ...(prev[isin] || {}),
            name,
            ticker,
            googleTicker: ticker,
            currency,
          },
        };
        safeSave('pat_mapping', next);
        return next;
      });
      setCurrencies((prev) => {
        const next = { ...prev, [ticker]: currency };
        safeSave('pat_currencies', next);
        return next;
      });

      setSyncStatus(`Opslaan ${ticker}...`);
      postMappingToSheet({ isin, name, ticker, currency })
        .then(() => {
          setSyncStatus(`Opgeslagen: ${ticker} (${currency})`);
          setToastMessage(`Asset ${name} bijgewerkt: ticker '${ticker}', valuta '${currency}'.`);
          setTimeout(() => syncWithGoogleSheet(), 2500);
        })
        .catch(() => {
          setSyncStatus('Fout bij opslaan mapping');
        });
    },
    [getCurrency, getDisplayName, syncWithGoogleSheet]
  );

  const handleOpenEditAsset = (isin: string) => {
    const pos = ledger.positions.find((p) => p.isin === isin);
    const mapping = assetMapping[isin] || { name: '', ticker: '', currency: 'EUR' };
    const ov = positionOverrides[isin] || {};
    const tagInfo = assetTagsMap[isin];
    setEditingAsset({
      isin,
      newIsin: isin,
      name: getDisplayName(pos || isin),
      ticker: mapping.googleTicker || mapping.ticker || '',
      apiTicker: mapping.apiTicker || '',
      currency: getCurrency(isin),
      overrideGak: ov.avgPrice !== undefined && ov.avgPrice !== '' ? ov.avgPrice : '',
      overrideQty: ov.quantity !== undefined && ov.quantity !== '' ? ov.quantity : '',
      currentGak: pos ? pos.avgPrice : 0,
      currentQty: pos ? pos.quantity : 0,
      tagsText: Array.isArray(tagInfo?.tags) ? tagInfo.tags.join(', ') : '',
      comment: tagInfo?.comment || '',
    });
  };

  const handleSaveEditedAsset = (form: EditingAssetForm) => {
    const oldIsin = form.isin.trim();
    const targetIsin = (form.newIsin || oldIsin).trim().toUpperCase();
    if (!oldIsin || !targetIsin) return;

    const cleanName = form.name.trim();
    const cleanGfTicker = form.ticker.trim();
    const cleanApiTicker = form.apiTicker.trim();
    const cleanCurrency = (form.currency || 'EUR').trim().toUpperCase();
    const parsedTags = form.tagsText
      .split(',')
      .map((s) => s.trim().replace(/^#/, ''))
      .filter(Boolean);
    const cleanComment = form.comment.trim();
    const rawOvGak = form.overrideGak;
    const rawOvQty = form.overrideQty;

    // Tags & comment
    setAssetTagsMap((prev) => {
      const next = { ...prev };
      if (parsedTags.length > 0 || cleanComment) {
        next[targetIsin] = { tags: Array.from(new Set(parsedTags)), comment: cleanComment };
      } else {
        delete next[targetIsin];
      }
      if (oldIsin !== targetIsin) delete next[oldIsin];
      safeSave('pat_asset_tags', next);
      return next;
    });

    // Overrides
    setPositionOverrides((prev) => {
      const next = { ...prev };
      const numGak = rawOvGak !== '' ? parseFloat(String(rawOvGak)) : NaN;
      const numQty = rawOvQty !== '' ? parseFloat(String(rawOvQty)) : NaN;
      if (!isNaN(numGak) || !isNaN(numQty)) {
        next[targetIsin] = {
          avgPrice: !isNaN(numGak) ? numGak : '',
          quantity: !isNaN(numQty) ? numQty : '',
          comment: cleanComment || 'Handmatige correctie',
        };
      } else {
        delete next[targetIsin];
      }
      if (oldIsin !== targetIsin) delete next[oldIsin];
      safeSave('pat_position_overrides', next);
      return next;
    });

    // Asset mapping
    setAssetMapping((prev) => {
      const next = { ...prev };
      const existingOld = next[oldIsin] || { name: '', ticker: '', currency: 'EUR' };
      const existingTarget = next[targetIsin] || { name: '', ticker: '', currency: 'EUR' };
      next[targetIsin] = {
        name: cleanName || existingTarget.name || existingOld.name || targetIsin,
        ticker: cleanGfTicker || existingTarget.ticker || existingOld.ticker || '',
        googleTicker: cleanGfTicker || existingTarget.googleTicker || existingOld.googleTicker || '',
        apiTicker: cleanApiTicker || existingTarget.apiTicker || existingOld.apiTicker || '',
        currency: cleanCurrency,
      };
      if (oldIsin !== targetIsin) {
        delete next[oldIsin];
      }
      safeSave('pat_mapping', next);
      return next;
    });

    if (oldIsin !== targetIsin) {
      setCsvBatches((prev) => {
        const next = prev.map((b) => ({
          ...b,
          rows: (b.rows || []).map((r) =>
            String(r['Asset Id'] || '').trim() === oldIsin
              ? { ...r, 'Asset Id': targetIsin, ...(cleanName ? { 'Asset Name': cleanName } : {}) }
              : r
          ),
        }));
        safeSave('pat_csv_batches', next);
        return next;
      });
      setManualTransactions((prev) => {
        const next = prev.map((m) =>
          String(m['Asset Id'] || '').trim() === oldIsin
            ? { ...m, 'Asset Id': targetIsin, ...(cleanName ? { 'Asset Name': cleanName } : {}) }
            : m
        );
        safeSave('pat_manual_transactions', next);
        return next;
      });
    }

    postMappingToSheet({
      isin: targetIsin,
      name: cleanName || targetIsin,
      ticker: cleanGfTicker,
      currency: cleanCurrency,
    }).catch(() => {});

    postTagAndOverrideToSheet({
      isin: targetIsin,
      tags: parsedTags.join(', '),
      comment: cleanComment,
      overrideGak: rawOvGak,
      overrideQty: rawOvQty,
    }).catch(() => {});

    setEditingAsset(null);
    setToastMessage(`Asset ${cleanName || targetIsin} bijgewerkt en gesynchroniseerd met Google Sheet.`);
  };

  const handleAddCorporateAction = (ca: Omit<CorporateAction, 'id'>) => {
    const entry: CorporateAction = { id: `ca_${Date.now()}`, ...ca };
    if (entry.type === 'merger' && entry.toIsin) {
      setAssetMapping((prev) => {
        const next = { ...prev };
        const existing = next[entry.toIsin!];
        next[entry.toIsin!] = {
          name: entry.toName || existing?.name || entry.toIsin!,
          ticker: entry.toTicker || existing?.ticker || '',
          googleTicker: entry.toTicker || existing?.googleTicker || '',
          currency: existing?.currency || getCurrency(entry.fromIsin || ''),
        };
        safeSave('pat_mapping', next);
        return next;
      });
      if (entry.toTicker) {
        postMappingToSheet({
          isin: entry.toIsin,
          name: entry.toName || entry.toIsin,
          ticker: entry.toTicker,
          currency: getCurrency(entry.fromIsin || ''),
        }).catch(() => {});
      }
    } else if (entry.type === 'rename' && entry.isin && entry.newName) {
      setAssetMapping((prev) => {
        const next = {
          ...prev,
          [entry.isin!]: {
            ...(prev[entry.isin!] || { ticker: '', currency: getCurrency(entry.isin!) }),
            name: entry.newName!,
          },
        };
        safeSave('pat_mapping', next);
        return next;
      });
    }

    setCorporateActions((prev) => {
      const next = [...prev, entry];
      safeSave('pat_corporate_actions', next);
      return next;
    });
    setToastMessage('Corporate Action toegepast en posities & GAK herberekend.');
  };

  const handleRemoveCorporateAction = (index: number) => {
    setCorporateActions((prev) => {
      const next = prev.filter((_, i) => i !== index);
      safeSave('pat_corporate_actions', next);
      return next;
    });
  };

  const describeCorporateAction = (ca: CorporateAction): string => {
    if (ca.type === 'merger' && ca.fromIsin && ca.toIsin) {
      const fromName = getDisplayName(ca.fromIsin);
      const toName = ca.toName || getDisplayName(ca.toIsin);
      const cashTxt = ca.cashBoot && ca.cashBoot > 0 ? ` (- €${ca.cashBoot.toFixed(2)} cash)` : '';
      return `${fromName} (${ca.fromIsin}) → ${toName} (${ca.toIsin}) · Ratio 1 : ${ca.ratio}${cashTxt}`;
    }
    if (ca.type === 'split' && ca.isin) {
      const name = getDisplayName(ca.isin);
      const op = ca.mode === 'divide' ? '÷' : '×';
      return `${name} (${ca.isin}) · Aantal ${op} ${ca.factor}`;
    }
    if (ca.type === 'rename' && ca.isin) {
      return `${ca.isin} → Hernoemd naar "${ca.newName}"`;
    }
    return '';
  };

  const handleUploadFile = async (file: File, broker: string) => {
    const { rows, discoveredMappings } = await parseUploadedPortfolioFile(
      file,
      broker,
      assetMapping,
      rates
    );

    if (!rows || rows.length === 0) {
      setToastMessage('Geen geldige transactieregels gevonden in het bestand.');
      return;
    }

    if (Object.keys(discoveredMappings).length > 0) {
      setAssetMapping((prev) => {
        const next = { ...prev, ...discoveredMappings };
        safeSave('pat_mapping', next);
        return next;
      });
    }

    const batchObj: CsvBatch = {
      id: `batch_${Date.now()}`,
      broker,
      fileName: file.name,
      uploadedAt: new Date().toISOString().slice(0, 10),
      rows,
    };

    setCsvBatches((prev) => {
      const idx = prev.findIndex((b) => b.fileName === file.name && b.broker === broker);
      const next = idx !== -1 ? prev.map((b, i) => (i === idx ? batchObj : b)) : [...prev, batchObj];
      safeSave('pat_csv_batches', next);
      return next;
    });

    const label = `${file.name} (${broker})`;
    setLoadedFileName(label);
    try {
      localStorage.setItem('pat_filename', label);
    } catch {
      // ignore
    }
    setShowCsvUploadModal(false);
    setToastMessage(`${rows.length} boekingen geladen voor ${broker} (${file.name}).`);
  };

  const handleRemoveCsvBatch = (index: number) => {
    const removed = csvBatches[index];
    setCsvBatches((prev) => {
      const next = prev.filter((_, i) => i !== index);
      safeSave('pat_csv_batches', next);
      return next;
    });
    if (removed) {
      postDeleteCsvBatch(removed).catch(() => {});
    }
  };

  const handlePushCsvBatchesToSheet = async () => {
    if (csvBatches.length === 0) {
      setToastMessage('Geen lokale CSV-bestanden om naar Google Sheet te pushen.');
      return;
    }
    let successCount = 0;
    let totalRows = 0;
    try {
      for (let i = 0; i < csvBatches.length; i++) {
        const batch = csvBatches[i];
        setSyncStatus(`CSV pushen (${i + 1}/${csvBatches.length}): ${batch.fileName}...`);
        const json = await postSaveCsvBatch(batch);
        if (json.status !== 'success') {
          throw new Error(json.message || 'Onbekende backend-fout');
        }
        successCount += 1;
        totalRows += (batch.rows || []).length;
      }
      setSyncStatus(`CSV's gepusht om ${new Date().toLocaleTimeString('nl-NL')}`);
      setToastMessage(
        `${successCount} bestand(en) (${totalRows} regels) succesvol naar Google Sheet gepusht.`
      );
    } catch (err) {
      setSyncStatus('Fout bij CSV-push');
      setToastMessage(`CSV-push mislukt: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleSaveManualTx = (payload: {
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
  }) => {
    const batchId = `manual_${Date.now()}`;
    const timestamp = `${payload.date} 12:00:00`;
    const parsedTags = payload.tagsText
      .split(',')
      .map((s) => s.trim().replace(/^#/, ''))
      .filter(Boolean);
    const name = payload.assetName || payload.isin;
    const newRows: TransactionRow[] = [];

    if (payload.tab === 'trade') {
      const isBuy = payload.tradeType === 'Buy Trade';
      newRows.push({
        _manualId: batchId,
        _tags: parsedTags,
        Broker: payload.broker,
        'Transaction Time (CET)': timestamp,
        'Transaction Category': 'trades',
        'Transaction Type': payload.tradeType,
        'Transfer Type': isBuy ? 'CASH_DEBIT' : 'CASH_CREDIT',
        'Asset Id': payload.isin,
        'Asset Name': name,
        'Asset Currency': payload.currency,
        'Asset Quantity': payload.quantity,
        'Transaction Amount': isBuy ? -payload.totalEur : payload.totalEur,
        'Profit And Loss Amount': isBuy ? 0 : payload.realizedPnlEur,
        'Transaction Description': payload.description || `${payload.tradeType} (${payload.broker})`,
      });
      if (payload.feeEur > 0) {
        newRows.push({
          _manualId: batchId,
          Broker: payload.broker,
          'Transaction Time (CET)': timestamp,
          'Transaction Category': 'fees',
          'Transaction Type': 'Trading Fee',
          'Transfer Type': 'CASH_DEBIT',
          'Asset Id': payload.isin,
          'Asset Name': name,
          'Transaction Amount': -payload.feeEur,
          'Transaction Description': `Transactiekosten ${name}`,
        });
      }
      if (payload.taxEur > 0) {
        newRows.push({
          _manualId: batchId,
          Broker: payload.broker,
          'Transaction Time (CET)': timestamp,
          'Transaction Category': 'tax',
          'Transaction Type': 'Transaction Tax',
          'Transfer Type': 'CASH_DEBIT',
          'Asset Id': payload.isin,
          'Asset Name': name,
          'Transaction Amount': -payload.taxEur,
          'Transaction Description': `Beurstaks (TOB) ${name}`,
        });
      }
      if (payload.isin && !assetMapping[payload.isin]) {
        setAssetMapping((prev) => {
          const next: AssetMappingMap = {
            ...prev,
            [payload.isin]: {
              name,
              ticker: payload.ticker,
              googleTicker: payload.ticker,
              currency: payload.currency,
            },
          };
          safeSave('pat_mapping', next);
          return next;
        });
        if (payload.ticker) {
          postMappingToSheet({
            isin: payload.isin,
            name,
            ticker: payload.ticker,
            currency: payload.currency,
          }).catch(() => {});
        }
      }
    } else if (payload.tab === 'dividend') {
      newRows.push({
        _manualId: batchId,
        _tags: parsedTags,
        Broker: payload.broker,
        'Transaction Time (CET)': timestamp,
        'Transaction Category': 'dividends',
        'Transaction Type': 'Dividend',
        'Transfer Type': 'CASH_CREDIT',
        'Asset Id': payload.isin,
        'Asset Name': name,
        'Asset Currency': payload.currency,
        'Transaction Amount': payload.totalEur,
        'Transaction Description': payload.description || `Dividend ${name} (${payload.broker})`,
      });
      if (payload.taxEur > 0) {
        newRows.push({
          _manualId: batchId,
          Broker: payload.broker,
          'Transaction Time (CET)': timestamp,
          'Transaction Category': 'dividends',
          'Transaction Type': 'Dividend Withholding Tax',
          'Transfer Type': 'CASH_DEBIT',
          'Asset Id': payload.isin,
          'Asset Name': name,
          'Asset Currency': payload.currency,
          'Transaction Amount': -payload.taxEur,
          'Transaction Description': `Bronbelasting dividend ${name}`,
        });
      }
    } else {
      const isOutflow = payload.cashType === 'withdrawals' || payload.cashType === 'fees';
      newRows.push({
        _manualId: batchId,
        _tags: parsedTags,
        Broker: payload.broker,
        'Transaction Time (CET)': timestamp,
        'Transaction Category': payload.cashType,
        'Transaction Type': payload.cashType,
        'Transfer Type': isOutflow ? 'CASH_DEBIT' : 'CASH_CREDIT',
        'Transaction Amount': isOutflow ? -payload.totalEur : payload.totalEur,
        'Transaction Description': payload.description || `Manuele kasboeking (${payload.broker})`,
      });
    }

    setManualTransactions((prev) => {
      const next = [...prev, ...newRows];
      safeSave('pat_manual_transactions', next);
      return next;
    });

    const syncType =
      payload.tab === 'trade'
        ? payload.tradeType === 'Sell Trade'
          ? 'SELL'
          : 'BUY'
        : payload.tab === 'dividend'
          ? 'DIVIDEND'
          : payload.cashType === 'withdrawals'
            ? 'WITHDRAWAL'
            : 'DEPOSIT';

    const syncQty = payload.tab === 'trade' ? payload.quantity : 1;
    const syncPrice =
      payload.tab === 'trade' && syncQty > 0 ? payload.totalEur / syncQty : payload.totalEur;

    postManualTransactionToSheet({
      id: batchId,
      date: payload.date,
      type: syncType,
      isin: payload.isin,
      ticker: payload.ticker,
      name,
      qty: syncQty,
      price: syncPrice,
      currency: payload.currency,
      fee: payload.feeEur + payload.taxEur,
      broker: payload.broker,
      note: payload.description,
    }).catch(() => {});

    setShowManualTxModal(false);
    setToastMessage(`Manuele boeking toegevoegd onder ${payload.broker} en gesynchroniseerd.`);
  };

  const handleRemoveManualTx = (manualId: string) => {
    setManualTransactions((prev) => {
      const next = prev.filter((t) => t._manualId !== manualId);
      safeSave('pat_manual_transactions', next);
      return next;
    });
    postDeleteManualTransaction(manualId).catch(() => {});
  };

  const handleAddClientDeposit = (payload: {
    person: string;
    type: 'deposit' | 'withdrawal';
    date: string;
    amount: number;
    note: string;
  }) => {
    const entry: ClientDeposit = {
      id: `cdep_${Date.now()}`,
      ...payload,
    };
    setClientDeposits((prev) => {
      const next = [...prev, entry];
      safeSave('pat_client_deposits', next);
      return next;
    });
    postSaveClientEntry(entry).catch(() => {});
    setToastMessage(`Boeking voor ${entry.person} opgeslagen en gesynchroniseerd met Google Sheet.`);
  };

  const handleRemoveClientDeposit = (id: string) => {
    setClientDeposits((prev) => {
      const next = prev.filter((d) => d.id !== id);
      safeSave('pat_client_deposits', next);
      return next;
    });
    postDeleteClientEntry(id).catch(() => {});
  };

  const handleExportBackup = () => {
    const data = {
      transactions: activeTransactions,
      mapping: assetMapping,
      corporateActions,
      prices: latestPrices,
      currencies,
      rates,
      history: historyData,
      benchmarks: benchmarkConfigs,
      filename: loadedFileName,
      csvBatches,
      manualTransactions,
      clientDeposits,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pat_portfolio_backup.json';
    a.click();
    URL.revokeObjectURL(url);
    setToastMessage('Backup (pat_portfolio_backup.json) gedownload.');
  };

  const handleConfirmReset = () => {
    localStorage.clear();
    idbClearAll().catch(() => {});
    setCsvBatches([]);
    setManualTransactions([]);
    setAssetMapping({});
    setCorporateActions([]);
    setPositionOverrides({});
    setAssetTagsMap({});
    setClientDeposits([]);
    setLatestPrices({});
    setCurrencies({});
    setHistoryData({ dates: [], tickers: [], prices: {} });
    setHistoryCachedAt(null);
    setTwrHistory([]);
    setLoadedFileName('');
    setShowSettingsModal(false);
    setToastMessage('Lokale cache gewist. Herladen vanuit Google Sheet...');
    setTimeout(() => syncWithGoogleSheet(true), 200);
  };

  const handleSaveScriptUrl = (url: string) => {
    setGoogleScriptUrl(url);
    setShowSettingsModal(false);
    setToastMessage('Google Apps Script URL opgeslagen. Synchroniseren...');
    setTimeout(() => syncWithGoogleSheet(true), 150);
  };

  return (
    <div className="min-h-screen bg-[#070d1e] text-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-5">
        {/* Header with Banner + Filter & Action Bar */}
        <header className="bg-[#0b142c] rounded-xl border border-[#1b2b52]">
          <div className="relative w-full h-16 sm:h-24 overflow-hidden rounded-t-xl border-b border-[#182649] bg-gradient-to-r from-[#070d1e] via-[#0e1c3f] to-[#070d1e]">
            {!bannerError && (
              <img
                src="./banner.jpg"
                alt="Key Analysis - Portfolio Insights"
                referrerPolicy="no-referrer"
                onError={() => setBannerError(true)}
                className="w-full h-full object-cover object-center opacity-90"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-[#070d1e]/85 via-[#070d1e]/35 to-[#070d1e]/85 flex flex-col sm:flex-row items-start sm:items-end justify-between px-4 py-2.5 sm:px-5 sm:py-3 gap-1">
              <div className="flex items-center gap-3 text-xs">
                <span className="font-bold text-slate-50 tracking-tight text-sm sm:text-base whitespace-nowrap">
                  Key Analysis
                </span>
                <span aria-hidden="true" className="text-slate-500">
                  ·
                </span>
                <span className="text-emerald-400 font-medium truncate max-w-[260px] sm:max-w-md">
                  {syncStatus}
                </span>
              </div>
              {loadedFileName && (
                <span className="text-[11px] text-slate-300 font-mono truncate max-w-[220px] sm:max-w-sm">
                  Actief: {loadedFileName}
                </span>
              )}
            </div>
          </div>

          {/* Filter & Action Toolbar */}
          <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedBrokerFilter}
                onChange={(e) => setSelectedBrokerFilter(e.target.value)}
                aria-label="Filter op broker"
                className="bg-[#080e22] border border-[#1e3260] text-slate-200 text-xs font-medium rounded-lg px-3 py-1.5 focus:outline-none focus:border-sky-400"
              >
                <option value="ALL">Alle Brokers</option>
                <option value="Bolero">Bolero</option>
                <option value="BUX">BUX</option>
              </select>

              <select
                value={selectedTagFilter}
                onChange={(e) => setSelectedTagFilter(e.target.value)}
                aria-label="Filter op tag"
                className="bg-[#080e22] border border-[#1e3260] text-slate-200 text-xs font-medium rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-400"
              >
                <option value="ALL">Alle Tags</option>
                {allAvailableTags.map((tag) => (
                  <option key={tag} value={tag}>
                    #{tag}
                  </option>
                ))}
              </select>

              {selectedTagFilter !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setSelectedTagFilter('ALL')}
                  className="inline-flex items-center gap-1 text-xs font-mono text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 transition-colors"
                >
                  <span>#{selectedTagFilter}</span>
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 relative" ref={toolsMenuRef}>
              <button
                type="button"
                onClick={() => setShowManualTxModal(true)}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-3.5 py-1.5 rounded-lg text-xs transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Boeking</span>
              </button>

              <button
                type="button"
                onClick={() => syncWithGoogleSheet(false)}
                disabled={isSyncing}
                title="Synchroniseer koersen & data met Google Sheet"
                className="bg-[#132247] hover:bg-[#182b59] text-sky-400 border border-[#1e3260] p-1.5 rounded-lg transition-colors disabled:opacity-60"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              </button>

              <button
                type="button"
                onClick={() => setOpenToolsMenu((v) => !v)}
                className="bg-[#132247] hover:bg-[#182b59] text-slate-200 border border-[#1e3260] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Settings className="w-3.5 h-3.5 text-slate-300" />
                <span>Beheer</span>
              </button>

              {openToolsMenu && (
                <div className="absolute right-0 top-10 w-56 bg-[#0b142c] border border-[#1e3260] rounded-xl shadow-2xl py-1.5 z-40 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCsvUploadModal(true);
                      setOpenToolsMenu(false);
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-[#132247] text-slate-200 flex items-center justify-between"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Upload className="w-3.5 h-3.5 text-slate-400" />
                      CSV / Excel Uploaden
                    </span>
                    <span className="text-emerald-400 font-mono text-[11px]">
                      {csvBatches.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      syncWithGoogleSheet(true);
                      setOpenToolsMenu(false);
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-[#132247] text-sky-400 flex items-center gap-2"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Volledige Sync (incl. Historie)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      handlePushCsvBatchesToSheet();
                      setOpenToolsMenu(false);
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-[#132247] text-emerald-400 flex items-center justify-between"
                  >
                    <span>Push CSV&apos;s naar Sheet</span>
                    <span className="font-mono text-[11px]">{csvBatches.length}</span>
                  </button>

                  <div className="border-t border-[#182649] my-1" />

                  <button
                    type="button"
                    onClick={() => {
                      setShowManageMappingsModal(true);
                      setOpenToolsMenu(false);
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-[#132247] text-slate-200 flex items-center gap-2"
                  >
                    <Link2 className="w-3.5 h-3.5 text-slate-400" />
                    <span>Asset Mappings</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowCorporateActionsModal(true);
                      setOpenToolsMenu(false);
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-[#132247] text-slate-200 flex items-center gap-2"
                  >
                    <GitBranch className="w-3.5 h-3.5 text-slate-400" />
                    <span>Corporate Actions</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      handleExportBackup();
                      setOpenToolsMenu(false);
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-[#132247] text-slate-200 flex items-center gap-2"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-400" />
                    <span>Backup Downloaden</span>
                  </button>

                  <div className="border-t border-[#182649] my-1" />

                  <button
                    type="button"
                    onClick={() => {
                      setShowSettingsModal(true);
                      setOpenToolsMenu(false);
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-[#132247] text-slate-300 flex items-center gap-2"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
                    <span>Sheet URL &amp; Reset</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Inline Notification Banner */}
        {toastMessage && (
          <div className="px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium flex items-center justify-between gap-3">
            <span>{toastMessage}</span>
            <button
              type="button"
              onClick={() => setToastMessage('')}
              aria-label="Melding sluiten"
              className="text-slate-300 hover:text-white p-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Primary Tab Navigation */}
        <nav className="flex items-center gap-1 overflow-x-auto border-b border-[#182649] no-scrollbar">
          {(
            [
              { key: 'dashboard' as const, label: 'Dashboard', icon: LayoutGrid },
              { key: 'twr' as const, label: 'TWR View', icon: TrendingUp },
              {
                key: 'posities' as const,
                label: 'Posities',
                count: ledger.positions.length,
                icon: BarChart3,
              },
              {
                key: 'clients' as const,
                label: 'Asset Manager',
                count: clientDeposits.length,
                icon: Users,
              },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveTab(item.key)}
                className={`px-4 py-2.5 text-xs font-semibold transition-colors inline-flex items-center gap-2 border-b-2 whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'border-emerald-400 text-emerald-400 bg-[#0b142c]'
                    : 'border-transparent text-slate-400 hover:text-slate-100 hover:bg-[#0b142c]/60'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
                {'count' in item && item.count !== undefined && (
                  <span className="font-mono tabular-nums text-[11px] text-slate-400">
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Unmapped ISINs Warning Banner */}
        {unmappedIsins.length > 0 && (
          <section className="bg-rose-950/30 border border-rose-500/30 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-slate-200">
                <strong className="text-rose-400 font-semibold">
                  {unmappedIsins.length} asset(s)
                </strong>{' '}
                hebben nog geen Google Finance ticker gekoppeld voor live koersen.
              </p>
              <button
                type="button"
                onClick={() => setShowUnmappedDetails((v) => !v)}
                className="text-xs font-medium text-rose-300 hover:text-white inline-flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <span>{showUnmappedDetails ? 'Verberg' : 'Koppelen'}</span>
                {showUnmappedDetails ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {showUnmappedDetails && (
              <div className="pt-3 border-t border-rose-500/20 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {unmappedIsins.map((isin) => {
                  const draft = inlineDrafts[isin] || {
                    ticker: '',
                    currency: getCurrency(isin) || 'EUR',
                  };
                  return (
                    <div
                      key={isin}
                      className="p-3 bg-[#080e22] rounded-lg border border-[#1e3260] flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-100 truncate">
                          {getDisplayName(isin)}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">{isin}</div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <input
                          type="text"
                          value={draft.ticker}
                          onChange={(e) =>
                            setInlineDrafts({
                              ...inlineDrafts,
                              [isin]: { ...draft, ticker: e.target.value },
                            })
                          }
                          placeholder="EPA:MC"
                          className="text-xs bg-[#132247] border border-[#1e3260] rounded-lg px-2 py-1.5 w-28 text-slate-100 font-mono focus:outline-none focus:border-emerald-400"
                        />
                        <input
                          type="text"
                          value={draft.currency}
                          onChange={(e) =>
                            setInlineDrafts({
                              ...inlineDrafts,
                              [isin]: { ...draft, currency: e.target.value.toUpperCase() },
                            })
                          }
                          placeholder="EUR"
                          className="text-xs bg-[#132247] border border-[#1e3260] rounded-lg px-1.5 py-1.5 w-14 text-slate-100 font-mono uppercase text-center focus:outline-none focus:border-emerald-400"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveMapping(isin, draft.ticker, draft.currency)}
                          className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-2.5 py-1.5 rounded-lg text-xs transition-colors"
                        >
                          Opslaan
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Active Tab Viewport */}
        <main>
          {activeTab === 'dashboard' && (
            <DashboardTab
              totalPortfolioValue={totalPortfolioValue}
              cashBalance={ledger.cashBalance}
              totalProfitLoss={totalProfitLoss}
              deposits={ledger.deposits}
              withdrawals={ledger.withdrawals}
              realizedPnL={ledger.realizedPnL}
              unrealizedPnL={unrealizedPnL}
              breakdown={breakdown}
              costs={costs}
              isLoading={isSyncing}
              onOpenClosedPositions={() => setShowClosedPositionsModal(true)}
              onGoToPositions={() => setActiveTab('posities')}
            />
          )}

          {activeTab === 'twr' && (
            <TwrTab
              timeline={activeTwrTimeline}
              twrHorizon={twrHorizon}
              onSelectHorizon={setTwrHorizon}
              twrHorizonSummary={twrHorizonSummary}
              benchmarkConfigs={benchmarkConfigs}
              historyData={historyData}
              assetMapping={assetMapping}
              latestPrices={latestPrices}
              rates={rates}
              isFullSyncLoading={isFullSyncLoading}
              historyCachedAt={historyCachedAt}
              onForceRefreshHistory={fetchFullHistoryFromSheet}
            />
          )}

          {activeTab === 'posities' && (
            <PositionsTab
              positions={ledger.positions}
              assetMapping={assetMapping}
              assetTagsMap={assetTagsMap}
              sortCol={sortCol}
              sortAsc={sortAsc}
              onSetSort={handleSetSort}
              getDisplayName={(pos: Position) => getDisplayName(pos)}
              getCurrency={getCurrency}
              getPriceEur={getPriceEur}
              getRawPrice={getRawPrice}
              formatOrigPrice={formatOrigPrice}
              hasPriceWarning={hasPriceWarning}
              onEditAsset={handleOpenEditAsset}
              onSelectTagFilter={setSelectedTagFilter}
              onOpenCorporateActions={() => setShowCorporateActionsModal(true)}
              onOpenManageMappings={() => setShowManageMappingsModal(true)}
              onOpenClosedPositions={() => setShowClosedPositionsModal(true)}
              corporateActionsCount={corporateActions.length}
              closedPositionsCount={ledger.closedPositionsList.length}
            />
          )}

          {activeTab === 'clients' && (
            <AssetManagerTab
              clientSummaryList={clientSummaryList}
              computedClientTranches={computedClientTranches}
              onAddClientDeposit={handleAddClientDeposit}
              onRemoveClientDeposit={handleRemoveClientDeposit}
            />
          )}
        </main>
      </div>

      {/* Modals */}
      {editingAsset && (
        <EditAssetModal
          initialForm={editingAsset}
          onClose={() => setEditingAsset(null)}
          onSave={handleSaveEditedAsset}
        />
      )}

      {showManageMappingsModal && (
        <ManageMappingsModal
          entries={activeAssetMappingEntries}
          onSaveMapping={handleSaveMapping}
          onClose={() => setShowManageMappingsModal(false)}
        />
      )}

      {showClosedPositionsModal && (
        <ClosedPositionsModal
          closedPositions={ledger.closedPositionsList}
          totalRealizedPnL={ledger.realizedPnL}
          onClose={() => setShowClosedPositionsModal(false)}
        />
      )}

      {showCorporateActionsModal && (
        <CorporateActionsModal
          corporateActions={corporateActions}
          positions={ledger.positions}
          knownAssets={allKnownAssets}
          describeAction={describeCorporateAction}
          onAddAction={handleAddCorporateAction}
          onRemoveAction={handleRemoveCorporateAction}
          onClose={() => setShowCorporateActionsModal(false)}
        />
      )}

      {showCsvUploadModal && (
        <CsvUploadModal
          csvBatches={csvBatches}
          onUploadFile={handleUploadFile}
          onRemoveBatch={handleRemoveCsvBatch}
          onPushBatchesToSheet={handlePushCsvBatchesToSheet}
          onClose={() => setShowCsvUploadModal(false)}
        />
      )}

      {showManualTxModal && (
        <ManualTxModal
          assetMapping={assetMapping}
          manualTransactions={manualTransactions}
          onSaveManualTx={handleSaveManualTx}
          onRemoveManualTx={handleRemoveManualTx}
          onClose={() => setShowManualTxModal(false)}
        />
      )}

      {showSettingsModal && (
        <BackendSettingsModal
          currentUrl={getGoogleScriptUrl()}
          onSaveUrl={handleSaveScriptUrl}
          onConfirmReset={handleConfirmReset}
          onClose={() => setShowSettingsModal(false)}
        />
      )}
    </div>
  );
}
