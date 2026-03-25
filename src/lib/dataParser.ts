import * as XLSX from 'xlsx';

export interface ParsedRow {
  [key: string]: string | number | null;
}

export interface ParseResult {
  headers: string[];
  rows: ParsedRow[];
  totalRows: number;
}

function parseWorkbookToResult(workbook: XLSX.WorkBook): ParseResult {
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return { headers: [], rows: [], totalRows: 0 };
  const jsonData = XLSX.utils.sheet_to_json<any>(sheet, { defval: null });
  if (jsonData.length === 0) return { headers: [], rows: [], totalRows: 0 };
  const headers = Object.keys(jsonData[0]);
  return { headers, rows: jsonData, totalRows: jsonData.length };
}

/** Try different header rows (for CDR/Excel with title rows like "BHARTI AIRTEL LIMITED" then "Target No", "B Party No" on row 6) */
function parseWorkbookFromRow(workbook: XLSX.WorkBook, startRow: number): ParseResult {
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return { headers: [], rows: [], totalRows: 0 };
  const jsonData = XLSX.utils.sheet_to_json<any>(sheet, { defval: null, range: startRow });
  if (jsonData.length === 0) return { headers: [], rows: [], totalRows: 0 };
  const headers = Object.keys(jsonData[0]);
  return { headers, rows: jsonData, totalRows: jsonData.length };
}

export async function parseSpreadsheet(file: File): Promise<ParseResult> {
  const name = (file.name || '').toLowerCase();
  const isCsv = name.endsWith('.csv');

  const tryAsCsv = async (): Promise<ParseResult> => {
    const text = await file.text();
    const trimmed = text.trimStart();
    const looksLikeHtml = /^\s*<(!DOCTYPE|html|head|body|script|style|meta|div|table\s)/i.test(trimmed) || trimmed.slice(0, 50).includes('<?xml');
    if (looksLikeHtml) {
      throw new Error('File content looks like HTML (e.g. an error page), not CSV. Check that the file link is valid and returns the actual file.');
    }
    const workbook = XLSX.read(text, { type: 'string', cellDates: true });
    return parseWorkbookToResult(workbook);
  };

  const tryAsBinary = async (): Promise<ParseResult> => {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    return parseWorkbookToResult(workbook);
  };

  // CSV by extension: always use text path to avoid "Invalid HTML: could not find <table>"
  if (isCsv) {
    return tryAsCsv();
  }

  try {
    return await tryAsBinary();
  } catch (err: any) {
    const msg = (err?.message || '').toString();
    // When XLSX mis-detects content as HTML (e.g. file starts with '<'), retry as plain text (CSV)
    if (msg.includes('Invalid HTML') || msg.includes('could not find')) {
      try {
        return await tryAsCsv();
      } catch {
        throw err;
      }
    }
    throw err;
  }
}

/** Parse and auto-detect header row (for CDR/Excel with title rows; e.g. "Target No", "B Party No" on row 6). */
export async function parseSpreadsheetBestHeaders(
  file: File,
  columnMap: Record<string, string[]>
): Promise<ParseResult> {
  const name = (file.name || '').toLowerCase();
  const isCsv = name.endsWith('.csv');
  let workbook: XLSX.WorkBook;
  if (isCsv) {
    const text = await file.text();
    workbook = XLSX.read(text, { type: 'string', cellDates: true });
  } else {
    const buffer = await file.arrayBuffer();
    workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  }
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return { headers: [], rows: [], totalRows: 0 };

  let best: ParseResult = { headers: [], rows: [], totalRows: 0 };
  let bestMapped = 0;
  for (let startRow = 0; startRow <= 15; startRow++) {
    const result = parseWorkbookFromRow(workbook, startRow);
    if (result.rows.length === 0) continue;
    const mapping = autoMapColumns(result.headers, columnMap);
    const mappedCount = Object.keys(mapping).length;
    if (mappedCount > bestMapped) {
      bestMapped = mappedCount;
      best = result;
    }
  }
  return best.headers.length > 0 ? best : parseWorkbookToResult(workbook);
}

// Column mapping presets for common CDR formats
// Aliases are matched against headers normalized: toLowerCase, then [^a-z0-9_] -> '_'
// So "BHARTI AIRTEL LIMITED" -> "bharti_airtel_limited", "_EMPTY_2" -> "_empty_2"
export const CDR_COLUMN_MAP: Record<string, string[]> = {
  calling_number: ['calling_number', 'caller', 'a_party', 'calling_no', 'from_number', 'source_number', 'msisdn_a', 'calling_party', 'target_a_party_number', 'target_no', 'target_number', 'msisdn', 'bharti_airtel_limited', 'subscriber_number', 'subscriber_msisdn', 'subscriber', 'party_a', 'owner_number'],
  called_number: ['called_number', 'called', 'b_party', 'called_no', 'to_number', 'destination_number', 'msisdn_b', 'called_party', 'b_party_number', 'b_party_no', '_empty_2', '_empty_1', 'other_party', 'party_b', 'contact_number'],
  call_date: ['call_date', 'date', 'datetime', 'timestamp', 'call_time', 'start_time', 'call_start'],
  duration: ['duration', 'call_duration', 'duration_sec', 'dur', 'talk_time'],
  call_type: ['call_type', 'type', 'service_type', 'call_category', 'toc'],
  imei: ['imei', 'imei_number', 'device_id'],
  imsi: ['imsi', 'imsi_number'],
  cell_id: ['cell_id', 'cell', 'cgi', 'lac_ci', 'tower_id', 'site_id'],
  location: ['location', 'address', 'site_name', 'tower_location', 'cell_location'],
  lat: ['lat', 'latitude'],
  lng: ['lng', 'longitude', 'long'],
  operator: ['operator', 'network', 'provider', 'carrier'],
};

export const IPDR_COLUMN_MAP: Record<string, string[]> = {
  ip_address: ['ip_address', 'source_ip', 'ip', 'src_ip', 'nat_ip'],
  source_port: ['source_port', 'src_port', 'port'],
  destination_ip: ['destination_ip', 'dest_ip', 'dst_ip'],
  destination_port: ['destination_port', 'dest_port', 'dst_port'],
  protocol: ['protocol', 'proto'],
  timestamp: ['timestamp', 'date', 'datetime', 'time'],
  bytes_transferred: ['bytes_transferred', 'bytes', 'data_volume', 'volume'],
  duration: ['duration', 'session_duration'],
  cell_id: ['cell_id', 'cgi'],
  location: ['location', 'site_name'],
  imei: ['imei'],
  msisdn: ['msisdn', 'phone', 'mobile_number'],
};

export const SDR_COLUMN_MAP: Record<string, string[]> = {
  phone_number: ['phone_number', 'msisdn', 'mobile', 'number'],
  subscriber_name: ['subscriber_name', 'name', 'customer_name'],
  address: ['address', 'addr', 'residential_address'],
  activation_date: ['activation_date', 'activation', 'start_date'],
  operator: ['operator', 'network', 'provider'],
  plan_type: ['plan_type', 'plan', 'tariff'],
  id_proof_type: ['id_proof_type', 'id_type', 'document_type'],
  id_proof_number: ['id_proof_number', 'id_number', 'document_number'],
};

export const TOWER_COLUMN_MAP: Record<string, string[]> = {
  cell_id: ['cell_id', 'cgi', 'tower_id', 'site_id'],
  imei: ['imei'],
  imsi: ['imsi'],
  msisdn: ['msisdn', 'mobile', 'phone_number'],
  timestamp: ['timestamp', 'date', 'datetime'],
  location: ['location', 'site_name', 'address'],
  lat: ['lat', 'latitude'],
  lng: ['lng', 'longitude'],
  duration: ['duration'],
};

export function autoMapColumns(
  headers: string[],
  columnMap: Record<string, string[]>
): Record<string, string> {
  const mapping: Record<string, string> = {};
  const lowerHeaders = headers.map(h => h.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_'));

  for (const [dbCol, aliases] of Object.entries(columnMap)) {
    for (const alias of aliases) {
      const idx = lowerHeaders.indexOf(alias);
      if (idx !== -1) {
        mapping[dbCol] = headers[idx];
        break;
      }
    }
  }
  return mapping;
}

export function mapRowToRecord(
  row: ParsedRow,
  mapping: Record<string, string>
): Record<string, any> {
  const record: Record<string, any> = {};
  for (const [dbCol, fileCol] of Object.entries(mapping)) {
    const rawValue = row[fileCol];
    let value: any = rawValue;
    if (rawValue !== null && typeof rawValue === 'object' && 'toISOString' in (rawValue as any)) {
      value = (rawValue as any).toISOString();
    }
    record[dbCol] = value ?? null;
  }
  return record;
}
