import { google } from 'googleapis';
import { isAdmin } from './_supabase.js';

const SPREADSHEET_ID =
  process.env.GOOGLE_SHEET_ID ||
  '1FTVHM7QCfFWOnMIbO56eEBOjpH3uSQBd';

const DEFAULT_SHEET =
  process.env.GOOGLE_SHEETS_SHEET_NAME ||
  'REKAPAN';

function clean(value) {
  return String(value ?? '').trim();
}

function parseBody(req) {
  if (!req.body) {
    return {};
  }

  if (typeof req.body === 'object') {
    return req.body;
  }

  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

/*
 * Google service account credentials
 *
 * GOOGLE_PRIVATE_KEY biasanya disimpan di Vercel
 * dengan format:
 *
 * -----BEGIN PRIVATE KEY-----\nAAAA...\n-----END PRIVATE KEY-----\n
 *
 * sehingga perlu diubah kembali menjadi line break.
 */
function getGoogleAuth() {
  const clientEmail =
    clean(
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
    );

  const privateKey =
    clean(
      process.env.GOOGLE_PRIVATE_KEY
    ).replace(/\\n/g, '\n');

  if (
    !clientEmail ||
    !privateKey
  ) {
    throw new Error(
      'Koneksi Google Sheets belum dikonfigurasi.'
    );
  }

  return new google.auth.GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey
    },

    scopes: [
      'https://www.googleapis.com/auth/spreadsheets'
    ]
  });
}

async function getSheetsClient() {
  const auth =
    getGoogleAuth();

  return google.sheets({
    version: 'v4',
    auth
  });
}

function columnLetter(number) {
  let result = '';
  let n = Number(number);

  while (n > 0) {
    const remainder =
      (n - 1) % 26;

    result =
      String.fromCharCode(
        65 + remainder
      ) + result;

    n =
      Math.floor(
        (n - 1) / 26
      );
  }

  return result || 'A';
}

/*
 * POST
 *
 * Admin:
 * update satu row Google Sheets
 *
 * Body:
 * {
 *   sheetName: "REKAPAN",
 *   rowNumber: 25,
 *   values: [...]
 * }
 */
async function updateRow(req, res) {
  const body =
    parseBody(req);

  const sheetName =
    clean(
      body.sheetName
    ) || DEFAULT_SHEET;

  const rowNumber =
    Number(
      body.rowNumber
    );

  const values =
    Array.isArray(
      body.values
    )
      ? body.values
      : null;

  if (
    !rowNumber ||
    rowNumber < 1
  ) {
    return res
      .status(400)
      .json({
        error:
          'Nomor row Google Sheets tidak valid.'
      });
  }

  if (
    !values ||
    !values.length
  ) {
    return res
      .status(400)
      .json({
        error:
          'Data row tidak tersedia.'
      });
  }

  /*
   * Batasi jumlah kolom.
   * Spreadsheet kamu saat ini punya
   * sampai sekitar 27 kolom pada REKAPAN.
   */
  if (values.length > 100) {
    return res
      .status(400)
      .json({
        error:
          'Jumlah kolom terlalu banyak.'
      });
  }

  const sheets =
    await getSheetsClient();

  const lastColumn =
    columnLetter(
      values.length
    );

  const range =
    `'${sheetName.replace(/'/g, "''")}'!A${rowNumber}:${lastColumn}${rowNumber}`;

  const response =
    await sheets.spreadsheets.values.update({

      spreadsheetId:
        SPREADSHEET_ID,

      range,

      valueInputOption:
        'USER_ENTERED',

      requestBody: {
        majorDimension:
          'ROWS',

        values: [
          values
        ]
      }

    });

  return res
    .status(200)
    .json({

      success: true,

      updatedCells:
        response
          ?.data
          ?.updatedCells || 0,

      range

    });
}

/*
 * GET
 *
 * Admin test koneksi.
 */
async function testConnection(
  req,
  res
) {
  const sheets =
    await getSheetsClient();

  const response =
    await sheets.spreadsheets.get({
      spreadsheetId:
        SPREADSHEET_ID,

      fields:
        'spreadsheetId,properties.title,sheets.properties'
    });

  const spreadsheet =
    response.data;

  return res
    .status(200)
    .json({

      success: true,

      spreadsheetId:
        spreadsheet.spreadsheetId,

      title:
        spreadsheet.properties?.title,

      sheets:
        (
          spreadsheet.sheets || []
        ).map(
          sheet => ({
            id:
              sheet.properties?.sheetId,

            title:
              sheet.properties?.title
          })
        )

    });
}

export default async function handler(
  req,
  res
) {
  try {

    /*
     * Semua endpoint sheets
     * hanya boleh digunakan Admin.
     *
     * Customer tidak boleh memiliki
     * akses tulis ke Google Sheets.
     */

    if (!isAdmin(req)) {
      return res
        .status(401)
        .json({
          error:
            'Unauthorized'
        });
    }

    if (
      req.method === 'GET'
    ) {
      return testConnection(
        req,
        res
      );
    }

    if (
      req.method === 'POST'
    ) {
      return updateRow(
        req,
        res
      );
    }

    return res
      .status(405)
      .json({
        error:
          'Method not allowed'
      });

  } catch (error) {

    console.error(
      'Google Sheets API error:',
      error
    );

    return res
      .status(500)
      .json({
        error:
          error?.message ||
          'Koneksi ke Google Sheets gagal.'
      });
  }
}
