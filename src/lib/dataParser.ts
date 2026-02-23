import * as XLSX from 'xlsx';

export interface ParsedRow {
  [key: string]: string | number | null;
}

export interface ParseResult {
  headers: string[];
  rows: ParsedRow[];
  totalRows: number;
}

export async function parseSpreadsheet(file: File): Promise<ParseResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json<any>(sheet, { defval: null });

  if (jsonData.length === 0) return { headers: [], rows: [], totalRows: 0 };

  const headers = Object.keys(jsonData[0]);
  return { headers, rows: jsonData, totalRows: jsonData.length };
}

// Column mapping presets for common CDR formats
export const CDR_COLUMN_MAP: Record<string, string[]> = {
  calling_number: ['calling_number', 'caller', 'a_party', 'calling_no', 'from_number', 'source_number', 'msisdn_a', 'calling party'],
  called_number: ['called_number', 'called', 'b_party', 'called_no', 'to_number', 'destination_number', 'msisdn_b', 'called party'],
  call_date: ['call_date', 'date', 'datetime', 'timestamp', 'call_time', 'start_time', 'call_start'],
  duration: ['duration', 'call_duration', 'duration_sec', 'dur', 'talk_time'],
  call_type: ['call_type', 'type', 'service_type', 'call_category'],
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
