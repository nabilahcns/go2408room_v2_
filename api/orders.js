import { isAdmin, sb } from './_supabase.js';

const BRIDGE_URL =
  process.env.GOOGLE_SHEETS_BRIDGE_URL || '';

const BRIDGE_TOKEN =
  process.env.GOOGLE_SHEETS_BRIDGE_TOKEN || '';

const SHEET_EDIT_URL =
  process.env.GOOGLE_SHEET_EDIT_URL || '';


function clean(value) {
  return String(value ?? '').trim();
}


function normalize(value) {
  return clean(value)
    .toLowerCase()
    .replace(/\s+/g, ' ');
}


function deriveCountry(order) {

  const sheet =
    normalize(order.sheetName);

  const code =
    clean(order.code).toUpperCase();


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


function normalizeOrder(order) {

  const columns =
    order?.columns ||
    {};


  return {

    /*
     * IDENTITAS GOOGLE SHEETS
     * Ini yang paling penting untuk
     * proses Edit / Update.
     */

    sheetName:
      clean(order?.sheetName),

    rowNumber:
      Number(order?.rowNumber) || 0,

    headerRow:
      Number(order?.headerRow) || 1,

    headers:
      Array.isArray(order?.headers)
        ? order.headers
        : [],


    /*
     * MAPPING KOLOM
     */

    columns:columns,


    /*
     * RAW ROW
     * Dipakai saat menulis kembali
     * ke Google Sheets.
     */

    raw:
      Array.isArray(order?.raw)
        ? order.raw
        : [],


    /*
     * DATA ORDER
     */

    name:
      clean(order?.name),

    item:
      clean(order?.item),

    country:
      order?.country
        ? clean(order.country).toUpperCase()
        : deriveCountry(order),

    group:
      clean(order?.group),

    code:
      clean(order?.code),

    update:
      clean(order?.update),

    payment:
      clean(order?.payment),

    total:
      clean(order?.total),

    paymentDue:
      clean(order?.paymentDue),

    detail:
      clean(order?.detail)


  };

}


async function fetchFromAppsScript(search = '') {

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
    new URL(BRIDGE_URL);


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
        method:'GET'
      }
    );


  const raw =
    await response.text();


  let data = null;


  try {

    data =
      raw
        ? JSON.parse(raw)
        : null;

  } catch {

    throw new Error(
      'Google Sheets bridge mengembalikan data yang tidak valid.'
    );

  }


  if (!response.ok) {

    throw new Error(
      data?.error ||
      'Google Sheets bridge gagal diakses.'
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


async function getWebsiteStatuses() {

  try {

    const rows =
      await sb(
        'order_updates?select=id,row_number,customer_name,status,note,photo,updated_at&order=updated_at.desc',
        {
          method:'GET'
        }
      );


    return Array.isArray(rows)
      ? rows
      : [];


  } catch {

    return [];

  }

}


function attachStatuses(
  orders,
  updates
) {

  const statusMap =
    new Map();


  for (
    const update
    of updates
  ) {

    const row =
      Number(
        update?.row_number
      );


    if (
      !row ||
      !Number.isFinite(row)
    ) {
      continue;
    }


    /*
     * Ambil update terbaru
     * untuk row tersebut.
     */

    if (
      !statusMap.has(row)
    ) {

      statusMap.set(
        row,
        update
      );

    }

  }


  return orders.map(
    order => {

      const update =
        statusMap.get(
          Number(order.rowNumber)
        );


      return {

        ...order,

        status:
          update?.status ||
          'Belum di CO',

        statusNote:
          update?.note || '',

        statusPhoto:
          update?.photo || '',

        statusUpdatedAt:
          update?.updated_at || ''

      };

    }
  );

}


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
          error:'Method not allowed'
        });

    }


    /*
     * CUSTOMER
     *
     * Customer wajib mencari
     * berdasarkan nama.
     */

    const search =
      clean(
        req.query?.name
      );


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
     * Ambil semua order
     * dari Google Sheets bridge.
     */

    const bridgeData =
      await fetchFromAppsScript(
        search
      );


    let sourceOrders =
      [];


    /*
     * Bentuk response Apps Script
     * yang kita dukung:
     *
     * { orders:[...] }
     */

    if (
      Array.isArray(
        bridgeData?.orders
      )
    ) {

      sourceOrders =
        bridgeData.orders;

    }


    /*
     * Beberapa response lama
     * mungkin memakai rows.
     */

    else if (
      Array.isArray(
        bridgeData?.rows
      )
    ) {

      sourceOrders =
        bridgeData.rows;

    }


    /*
     * Kalau response hanya 1
     * object order.
     */

    else if (
      bridgeData &&
      typeof bridgeData === 'object' &&
      bridgeData.name
    ) {

      sourceOrders =
        [bridgeData];

    }


    /*
     * Normalize seluruh order.
     */

    let orders =
      sourceOrders
        .map(normalizeOrder)
        .filter(
          order =>
            order.name ||
            order.item ||
            order.code
        );


    /*
     * Filter nama sekali lagi
     * di server supaya aman
     * walaupun Apps Script
     * mengembalikan lebih banyak data.
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
     * Ambil status website.
     *
     * Untuk admin dan customer,
     * status akan digabungkan
     * berdasarkan row Google Sheets.
     */

    const updates =
      await getWebsiteStatuses();


    orders =
      attachStatuses(
        orders,
        updates
      );


    /*
     * RESPONSE
     */

    return res
      .status(200)
      .json({

        success:true,

        spreadsheetName:
          bridgeData?.spreadsheetName || '',

        search:
          search,

        totalOrders:
          orders.length,

        sheetName:
          orders.length === 1
            ? orders[0].sheetName
            : bridgeData?.sheetName || '',

        headerRow:
          orders.length === 1
            ? orders[0].headerRow
            : bridgeData?.headerRow || 1,

        headers:
          orders.length === 1
            ? orders[0].headers
            : bridgeData?.headers || [],

        columns:
          orders.length === 1
            ? orders[0].columns
            : bridgeData?.columns || {},

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
