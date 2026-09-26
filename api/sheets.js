import { isAdmin } from './_supabase.js';

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

function getBridgeConfig() {
  const url =
    clean(
      process.env.GOOGLE_SHEETS_BRIDGE_URL
    );

  const token =
    clean(
      process.env.GOOGLE_SHEETS_BRIDGE_TOKEN
    );

  if (!url || !token) {
    throw new Error(
      'Koneksi Google Sheets belum dikonfigurasi di server.'
    );
  }

  return {
    url,
    token
  };
}


/*
 * Memanggil Google Apps Script
 */
async function callAppsScript({
  method = 'GET',
  params = {},
  body = null
}) {

  const {
    url,
    token
  } = getBridgeConfig();


  const endpoint =
    new URL(url);


  /*
   * Token selalu dikirim dari backend.
   * Token tidak pernah ditaruh di frontend.
   */
  endpoint.searchParams.set(
    'token',
    token
  );


  for (
    const [key, value]
    of Object.entries(params)
  ) {

    if (
      value !== undefined &&
      value !== null &&
      value !== ''
    ) {

      endpoint.searchParams.set(
        key,
        String(value)
      );

    }

  }


  const options = {
    method,

    redirect: 'follow',

    headers: {
      Accept:
        'application/json'
    }
  };


  if (body !== null) {

    options.headers[
      'Content-Type'
    ] =
      'application/json';

    options.body =
      JSON.stringify(body);

  }


  const response =
    await fetch(
      endpoint.toString(),
      options
    );


  const text =
    await response.text();


  let data;


  try {

    data =
      text
        ? JSON.parse(text)
        : {};

  } catch {

    throw new Error(
      'Google Sheets memberikan respons yang tidak dapat dibaca.'
    );

  }


  if (!response.ok) {

    console.error(
      'Apps Script HTTP error:',
      response.status,
      data
    );

    throw new Error(
      'Koneksi ke Google Sheets gagal.'
    );

  }


  if (
    data?.success === false
  ) {

    console.error(
      'Apps Script returned error:',
      data
    );

    throw new Error(
      'Google Sheets menolak permintaan.'
    );

  }


  return data;

}


/*
 * GET
 *
 * Dipakai Admin untuk:
 * - test koneksi
 * - membaca data Google Sheets
 *
 * GET /api/sheets
 */
async function handleGet(
  req,
  res
) {

  const name =
    clean(
      req.query?.name
    );


  const data =
    await callAppsScript({
      method: 'GET',

      params:
        name
          ? {
              name
            }
          : {}
    });


  return res
    .status(200)
    .json({
      success: true,

      data
    });

}


/*
 * POST
 *
 * Dipakai Admin untuk mengedit
 * satu row di Google Sheets.
 *
 * Body:
 *
 * {
 *   rowNumber: 15,
 *   values: [...]
 * }
 */
async function handlePost(
  req,
  res
) {

  const body =
    parseBody(req);


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


  const sheetName =
    clean(
      body.sheetName
    ) ||
    'REKAPAN';


  if (
    !rowNumber ||
    rowNumber < 2
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
          'Data order tidak tersedia.'
      });

  }


  /*
   * Token dikirim sebagai body
   * ke Apps Script.
   *
   * callAppsScript tetap juga menambahkan
   * token sebagai query parameter.
   */
  const {
    token
  } =
    getBridgeConfig();


  const data =
    await callAppsScript({

      method: 'POST',

      body: {

        token,

        action:
          'updateRow',

        rowNumber,

        sheetName,

        values

      }

    });


  return res
    .status(200)
    .json({

      success: true,

      message:
        'Google Sheets berhasil diperbarui.',

      data

    });

}


export default async function handler(
  req,
  res
) {

  try {

    /*
     * Hanya Admin yang boleh
     * membaca seluruh data lewat
     * endpoint ini dan terutama
     * melakukan perubahan.
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

      return handleGet(
        req,
        res
      );

    }


    if (
      req.method === 'POST'
    ) {

      return handlePost(
        req,
        res
      );

    }


    return res
      .status(405)
      .json({
        error:
          'Method not allowed.'
      });


  } catch (error) {

    console.error(
      'sheets.js error:',
      error
    );


    return res
      .status(500)
      .json({
        error:
          error?.message ||
          'Koneksi ke Google Sheets sedang bermasalah.'
      });

  }

}
