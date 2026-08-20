import { google } from 'googleapis';

export interface SyncResult {
  added: number;
  updated: number;
  removed: number;
  sourceRows: number;
}

export interface GoogleSheetReadResult {
  range: string;
  values: unknown[][];
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function isGoogleSheetsConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SHEETS_SOURCE_ID?.trim() &&
      process.env.GOOGLE_SHEETS_SOURCE_RANGE?.trim() &&
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() &&
      process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim(),
  );
}

/**
 * Reads the master source using the spreadsheets.readonly scope only.
 * The application does not expose any write operation against the source.
 */
export async function readGoogleSheet(): Promise<GoogleSheetReadResult> {
  const spreadsheetId = required('GOOGLE_SHEETS_SOURCE_ID');
  const range = required('GOOGLE_SHEETS_SOURCE_RANGE');
  const email = required('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  const key = required('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY').replace(/\\n/g, '\n');

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: email,
      private_key: key,
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    majorDimension: 'ROWS',
  });

  return {
    range: response.data.range || range,
    values: response.data.values || [],
  };
}

/**
 * First safe sync stage: validates access and reads the source without
 * changing the source or importing anything into persistent storage yet.
 */
export async function syncGoogleSheets(): Promise<SyncResult> {
  const source = await readGoogleSheet();

  return {
    added: 0,
    updated: 0,
    removed: 0,
    sourceRows: source.values.length,
  };
}
