import { ClientDeposit, CsvBatch, SheetFastOrFullPayload } from '../types/portfolio';

export const DEFAULT_GOOGLE_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbyxTN8cNGXmyHRPm4XuSejOqTRFydugjHE0QDeFJaLkuLKK3iBcEhVk2SsedyPGjdotHQ/exec';

export const DUMMY_ISINS = ['DE000A3E5DT0', 'DE000TUAG109'];

export function getGoogleScriptUrl(): string {
  try {
    const custom = localStorage.getItem('pat_google_script_url');
    if (custom && custom.trim().startsWith('https://')) {
      return custom.trim();
    }
  } catch {
    // ignore storage error
  }
  return DEFAULT_GOOGLE_SCRIPT_URL;
}

export function setGoogleScriptUrl(url: string): void {
  try {
    const trimmed = url.trim();
    if (!trimmed || trimmed === DEFAULT_GOOGLE_SCRIPT_URL) {
      localStorage.removeItem('pat_google_script_url');
    } else {
      localStorage.setItem('pat_google_script_url', trimmed);
    }
  } catch {
    // ignore
  }
}

export async function fetchSheetMode(mode: 'fast' | 'full'): Promise<SheetFastOrFullPayload> {
  const url = getGoogleScriptUrl();
  const res = await fetch(`${url}?mode=${mode}`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as SheetFastOrFullPayload;
}

export async function postMappingToSheet(payload: {
  isin: string;
  name: string;
  ticker: string;
  currency: string;
}): Promise<void> {
  const url = getGoogleScriptUrl();
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
}

export async function postTagAndOverrideToSheet(payload: {
  isin: string;
  tags: string;
  comment: string;
  overrideGak: string | number;
  overrideQty: string | number;
}): Promise<void> {
  const url = getGoogleScriptUrl();
  await fetch(url, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'saveTagAndOverride',
      ...payload,
    }),
  });
}

export async function postManualTransactionToSheet(payload: {
  id: string;
  date: string;
  type: string;
  isin: string;
  ticker: string;
  name: string;
  qty: number;
  price: number;
  currency: string;
  fee: number;
  broker: string;
  note: string;
}): Promise<void> {
  const url = getGoogleScriptUrl();
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action: 'saveManualTransaction',
      ...payload,
    }),
  });
}

export async function postDeleteManualTransaction(id: string): Promise<void> {
  const url = getGoogleScriptUrl();
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'deleteManualTransaction', id }),
  });
}

export async function postSaveCsvBatch(batch: CsvBatch): Promise<{ status: string; message?: string }> {
  const url = getGoogleScriptUrl();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'saveCsvBatch', batch }),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} bij ${batch.fileName}`);
  }
  return (await res.json()) as { status: string; message?: string };
}

export async function postDeleteCsvBatch(batch: CsvBatch): Promise<void> {
  const url = getGoogleScriptUrl();
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action: 'deleteCsvBatch',
      id: batch.id,
      fileName: batch.fileName,
      broker: batch.broker,
    }),
  });
}

export async function postSaveClientEntry(entry: ClientDeposit): Promise<void> {
  const url = getGoogleScriptUrl();
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'saveClientEntry', ...entry }),
  });
}

export async function postDeleteClientEntry(id: string): Promise<void> {
  const url = getGoogleScriptUrl();
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'deleteClientEntry', id }),
  });
}
