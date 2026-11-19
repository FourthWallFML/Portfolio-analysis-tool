export type ActiveTab = 'dashboard' | 'twr' | 'posities' | 'clients';

export type HorizonKey = '1D' | '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '2Y' | 'MAX';

export type PositionSortCol =
  | 'name'
  | 'type'
  | 'quantity'
  | 'avgPrice'
  | 'rawPrice'
  | 'eurPrice'
  | 'value'
  | 'rendement';

export interface AssetMappingEntry {
  name: string;
  ticker: string;
  apiTicker?: string;
  googleTicker?: string;
  currency: string;
}

export type AssetMappingMap = Record<string, AssetMappingEntry>;

export interface AssetTagInfo {
  tags: string[];
  comment: string;
}

export type AssetTagsMap = Record<string, AssetTagInfo>;

export interface PositionOverride {
  avgPrice?: number | '';
  quantity?: number | '';
  comment?: string;
}

export type PositionOverridesMap = Record<string, PositionOverride>;

export interface TransactionRow {
  Broker?: string;
  _manualId?: string;
  _tags?: string[];
  'Transaction Time (CET)'?: string;
  'Transaction Category'?: string;
  'Transaction Type'?: string;
  'Transfer Type'?: string;
  'Asset Id'?: string;
  'Asset Name'?: string;
  'Asset Currency'?: string;
  'Asset Quantity'?: number | string;
  'Transaction Amount'?: number | string;
  'Profit And Loss Amount'?: number | string;
  'Transaction Description'?: string;
  [key: string]: unknown;
}

export interface CsvBatch {
  id: string;
  broker: string;
  fileName: string;
  uploadedAt: string;
  rows: TransactionRow[];
}

export interface CorporateAction {
  id: string;
  type: 'merger' | 'split' | 'rename';
  fromIsin?: string;
  toIsin?: string;
  toName?: string;
  toTicker?: string;
  ratio?: number;
  cashBoot?: number;
  isin?: string;
  mode?: 'divide' | 'multiply';
  factor?: number;
  newName?: string;
}

export interface Position {
  isin: string;
  name: string;
  quantity: number;
  totalCost: number;
  avgPrice: number;
  isEtf: boolean;
  caBadge: string;
  caNote: string;
  isManualOverride?: boolean;
  overrideComment?: string;
}

export interface ClosedPosition {
  isin: string;
  name: string;
  soldQuantity: number;
  realizedPnL: number;
  note: string;
}

export interface MergerClosedPosition {
  isin: string;
  name: string;
  closedQuantity: number;
  note: string;
}

export interface UnifiedLedgerResult {
  positions: Position[];
  mergerClosedPositions: MergerClosedPosition[];
  closedPositionsList: ClosedPosition[];
  deposits: number;
  withdrawals: number;
  realizedPnL: number;
  cashBalance: number;
}

export interface PortfolioBreakdown {
  shares: { value: number; count: number; pct: number };
  etfs: { value: number; count: number; pct: number };
  cash: { value: number; pct: number };
}

export interface PortfolioCosts {
  taxes: number;
  tradingFees: number;
  subscriptionFees: number;
  compensations: number;
  grossCosts: number;
  netCosts: number;
  costPercentage: number;
}

export interface HistoryData {
  dates: string[];
  tickers?: string[];
  prices: Record<string, number[]>;
}

export interface TwrPoint {
  date: string;
  dailyReturn: number;
}

export interface BenchmarkConfig {
  label: string;
  ticker: string;
  currency?: string;
  color?: string;
  enabled?: boolean;
}

export interface TwrSeriesResult {
  dates: string[];
  values: number[];
  totalReturnPct: number;
  startDate: string;
  endDate: string;
}

export interface TwrHorizonSummary {
  horizons: Array<{ key: HorizonKey; label: string; portfolioPct: number }>;
  benchmarks: Array<{
    ticker: string;
    label: string;
    color: string;
    values: Record<string, number | null>;
  }>;
}

export interface ClientDeposit {
  id: string;
  person: string;
  type: 'deposit' | 'withdrawal';
  date: string;
  amount: number;
  note: string;
}

export interface ComputedClientTranche extends ClientDeposit {
  returnPct: number;
  currentVal: number;
  pnlEur: number;
}

export interface ClientSummary {
  person: string;
  firstDate: string;
  depositsCount: number;
  totalInvested: number;
  currentValue: number;
  pnlEur: number;
  totalReturnPct: number;
  tranches: ComputedClientTranche[];
}

export interface SheetFastOrFullPayload {
  status: string;
  mode?: string;
  mapping?: Record<string, Partial<AssetMappingEntry>>;
  watchlist?: Array<Record<string, unknown>>;
  benchmarks?: BenchmarkConfig[];
  prices?: Record<string, number | string>;
  currencies?: Record<string, string>;
  rates?: Record<string, number>;
  history?: HistoryData;
  twrHistory?: TwrPoint[];
  clients?: Array<{
    id?: string;
    person?: string;
    type?: string;
    date?: string;
    amount?: number | string;
    note?: string;
  }>;
  tagsOverrides?: Array<{
    isin?: string;
    tags?: string;
    comment?: string;
    overrideGak?: number | string;
    overrideQty?: number | string;
  }>;
  manualTransactions?: Array<{
    id?: string;
    date?: string;
    type?: string;
    isin?: string;
    ticker?: string;
    name?: string;
    qty?: number | string;
    price?: number | string;
    currency?: string;
    fee?: number | string;
    realizedPnl?: number | string;
    broker?: string;
    note?: string;
  }>;
  csvBatches?: CsvBatch[];
}

export interface EditingAssetForm {
  isin: string;
  newIsin: string;
  name: string;
  ticker: string;
  apiTicker: string;
  currency: string;
  overrideGak: string | number;
  overrideQty: string | number;
  currentGak: number;
  currentQty: number;
  tagsText: string;
  comment: string;
}
