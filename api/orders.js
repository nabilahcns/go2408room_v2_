import crypto from 'crypto';


const BRIDGE_URL =
  process.env.GOOGLE_SHEETS_BRIDGE_URL || '';

const BRIDGE_TOKEN =
  process.env.GOOGLE_SHEETS_BRIDGE_TOKEN || '';

const SHEET_EDIT_URL =
  process.env.GOOGLE_SHEET_EDIT_URL || '';


/*
 * ============================
 * ADMIN AUTH
 * Tidak bergantung Supabase
 * ============================
 */

function verifyToken(token) {

  try {

    if (!token) {
      return false;
    }


    const parts =
      token.split('.');


    if (parts.length !== 2) {
      return false;
    }


    const [
      encoded,
      signature
    ] = parts;


    const expected =
      crypto
        .createHmac(
          'sha256',
          process.env.AUTH_SECRET
        )
        .update(encoded)
        .digest('base64url');


    if (signature !== expected) {
      return false;
    }


    const data =
      JSON.parse(
        Buffer
          .from(
            encoded,
            'base64url'
          )
          .toString()
      );


    if (
      !data?.exp ||
      data.exp < Date.now()
    ) {
      return false;
    }


    return (
      data.username ===
      process.env.ADMIN_USERNAME
    );


  } catch {

    return false;

  }

}


function isAdmin(req) {

  const cookies =
    req.headers.cookie || '';


  const match =
    cookies.match(
      /admin_session=([^;]+)/
    );


  return verifyToken(
    match
      ? match[1]
      : null
  );

}


/*
 * ============================
 * HELPERS
 * ============================
 */

function clean(value) {

  return String(
    value ?? ''
  ).trim();

}


function normalize(value) {

  return clean(value)
    .toLowerCase()
    .replace(/\s+/g, ' ');

}


function deriveCountry(order) {

  const sheet =
    normalize(
      order?.sheetName
    );


  const code =
    clean(
      order?.code
    ).toUpperCase();


  if (
    sheet.includes('china') ||
    code.startsWith('CH')
  ) {

    return 'CHINA';

  }


  if (
    sheet.includes('korea') ||
    code.startsWith('KR') ||
    code.startsWith('RI')
  ) {

    return 'KOREA';

  }


  if (
    sheet.includes('jepang') ||
    sheet.includes('japan') ||
    code.startsWith('JP')
  ) {

    return 'JEPANG';

  }


  if (
    sheet.includes('thailand') ||
    code.startsWith('TH')
  ) {

    return 'THAILAND';

  }


  if (
    sheet.includes('philip') ||
    sheet.includes('philiph') ||
    code.startsWith('PH')
  ) {

    return 'PHILIPPINES';

  }


  return 'LAINNYA';

}


/*
 * ============================
 * NORMALIZE ORDER
 * ============================
 */

function normalizeOrder(order) {

  const rowNumber =
    Number(
      order?.rowNumber ??
      order?.row_number ??
      order?.row ??
      0
    );


  const sheetName =
    clean(
      order?.sheetName ??
      order?.sheet_name ??
      ''
    );


  const columns =
    order?.columns &&
    typeof order.columns === 'object'
      ? order.columns
      : {};


  const headers =
    Array.isArray(
      order?.headers
    )
      ? order.headers
      : [];


  const raw =
    Array.isArray(
      order?.raw
    )
      ? order.raw
      : [];


  const result = {

    /*
     * Google Sheets identity
     */

    sheetName,

    sheet_name:sheetName,

    rowNumber,

    row_number:rowNumber,

    headerRow:
      Number(
        order?.headerRow ??
        order?.header_row ??
        1
      ),

    headers,

    columns,

    raw,


    /*
     * Order data
     */

    name:
      clean(
        order?.name
      ),

    item:
      clean(
        order?.item
      ),

    country:
      clean(
        order?.country
      ).toUpperCase(),

    group:
      clean(
        order?.group
      ),

    code:
      clean(
        order?.code
      ),

    update:
      clean(
        order?.update
      ),

    payment:
      clean(
        order?.payment
      ),

    total:
      clean(
        order?.total
      ),

    paymentDue:
      clean(
        order?.paymentDue
      ),

    detail:
      clean(
        order?.detail
      )

  };


  /*
   * Country kosong → derive dari
   * nama sheet / kode.
   */

  if (!result.country) {

    result.country =
      deriveCountry(
        result
      );

  }


  return result;

}


/*
 * ============================
 * GOOGLE SHEETS BRIDGE
 * ============================
 */

async function fetchFromAppsScript(
  search = ''
) {

  if (!BRIDGE_URL) {

    throw new Error(
      'GOOGLE_SHEETS_BRIDGE_URL belum diatur di Vercel.'
    );

  }


  if (!BRIDGE_TOKEN) {

    throw new Error(
      'GOOGLE_SHEETS_BRIDGE_TOKEN belum diatur di Vercel.'
    );

  }


  const url =
    new URL(
      BRIDGE_URL
    );


  url.searchParams.set(
    'token',
    BRIDGE_TOKEN
  );


  if (search) {

    url.searchParams.set(
      'search',
      search
    );

  }


  const response =
    await fetch(
      url.toString(),
      {
        method:'GET',

        headers:{
          Accept:
            'application/json'
        }
      }
    );


  const raw =
    await response.text();


  let data;


  try {

    data =
      raw
        ? JSON.parse(raw)
        : {};

  } catch {

    throw new Error(
      'Google Sheets bridge mengembalikan data yang tidak valid.'
    );

  }


  if (!response.ok) {

    throw new Error(
      data?.error ||
      `Google Sheets bridge gagal (${response.status}).`
    );

  }


  if (
    data?.success === false ||
    data?.ok === false
  ) {

    throw new Error(
      data?.error ||
      'Google Sheets bridge menolak request.'
    );

  }


  return data;

}


/*
 * ============================
 * EXTRACT ORDERS
 * ============================
 */

function extractOrders(data) {

  if (
    Array.isArray(
      data?.orders
    )
  ) {

    return data.orders;

  }


  if (
    Array.isArray(
      data?.rows
    )
  ) {

    return data.rows;

  }


  if (
    Array.isArray(
      data?.data
    )
  ) {

    return data.data;

  }


  /*
   * Kalau bridge hanya mengirim
   * satu object order.
   */

  if (
    data &&
    typeof data === 'object' &&
    (
      data.name ||
      data.NAMA
    )
  ) {

    return [data];

  }


  return [];

}


/*
 * ============================
 * MAIN API
 * ============================
 */

export default async function handler(
  req,
  res
) {

  try {


    if (
      req.method !== 'GET'
    ) {

      return res
        .status(405)
        .json({
          error:
            'Method not allowed'
        });

    }


    /*
     * Ambil query nama.
     */

    const search =
      clean(
        req.query?.name
      );


    /*
     * Admin boleh melihat
     * semua data.
     *
     * Customer harus mencari
     * berdasarkan nama.
     */

    const admin =
      isAdmin(req);


    if (
      !admin &&
      !search
    ) {

      return res
        .status(400)
        .json({

          error:
            'Nama customer wajib diisi.'

        });

    }


    /*
     * Ambil dari Google Sheets.
     */

    const bridgeData =
      await fetchFromAppsScript(
        search
      );


    /*
     * Extract order.
     */

    let orders =
      extractOrders(
        bridgeData
      );


    /*
     * Normalize semua order.
     */

    orders =
      orders
        .map(
          normalizeOrder
        )
        .filter(
          order =>
            order.name ||
            order.item ||
            order.code
        );


    /*
     * Filter nama di sisi server.
     *
     * Ini membuat pencarian lebih
     * aman walaupun bridge
     * mengirim lebih banyak data.
     */

    if (search) {

      const q =
        normalize(search);


      orders =
        orders.filter(
          order =>
            normalize(
              order.name
            ).includes(q)
        );

    }


    /*
     * Urutkan berdasarkan nama sheet
     * lalu row.
     */

    orders.sort(
      (a,b)=>{

        const sheetCompare =
          String(
            a.sheetName
          ).localeCompare(
            String(
              b.sheetName
            )
          );


        if (
          sheetCompare !== 0
        ) {

          return sheetCompare;

        }


        return (
          Number(
            a.rowNumber
          ) -
          Number(
            b.rowNumber
          )
        );

      }
    );


    /*
     * Response.
     */

    return res
      .status(200)
      .json({

        success:true,

        spreadsheetName:
          bridgeData?.spreadsheetName ||
          bridgeData?.spreadsheet_name ||
          '',

        search,

        totalOrders:
          orders.length,

        /*
         * Kalau hanya satu order,
         * metadata langsung diisi.
         */

        sheetName:
          orders.length === 1
            ? orders[0].sheetName
            : '',

        headerRow:
          orders.length === 1
            ? orders[0].headerRow
            : 1,

        headers:
          orders.length === 1
            ? orders[0].headers
            : [],

        columns:
          orders.length === 1
            ? orders[0].columns
            : {},

        sheetEditUrl:
          SHEET_EDIT_URL,

        orders

      });


  } catch (error) {


    console.error(
      'ORDERS API ERROR:',
      error
    );


    return res
      .status(500)
      .json({

        error:
          error.message ||
          'Gagal membaca data order.'

      });

  }

}
