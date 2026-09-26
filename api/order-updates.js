import crypto from 'crypto';

const TABLE = 'order_updates';


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


async function supabase(
  path,
  options = {}
) {

  const base =
    process.env.SUPABASE_URL;

  const key =
    process.env.SUPABASE_SECRET_KEY;


  if (!base || !key) {

    throw new Error(
      'Supabase environment variable belum lengkap.'
    );

  }


  const response =
    await fetch(
      `${base}/rest/v1/${path}`,
      {
        ...options,

        headers: {

          apikey:key,

          Authorization:
            `Bearer ${key}`,

          'Content-Type':
            'application/json',

          ...(options.headers || {})

        }

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

    data = raw;

  }


  if (!response.ok) {

    throw new Error(
      data?.message ||
      data?.hint ||
      data?.details ||
      data?.error ||
      `Supabase request gagal (${response.status}).`
    );

  }


  return data;

}


export default async function handler(
  req,
  res
) {

  try {


    /*
     * ==========================
     * GET
     * ==========================
     */

    if (req.method === 'GET') {

      if (!isAdmin(req)) {

        return res
          .status(401)
          .json({
            error:
              'Unauthorized. Silakan login sebagai admin.'
          });

      }


      const requestedRow =
        Number(
          req.query?.row_number ??
          req.query?.rowNumber ??
          req.query?.row ??
          0
        );


      let filter =
        '?select=id,row_number,customer_name,status,note,photo,updated_at';


      if (requestedRow > 0) {

        filter +=
          `&row_number=eq.${encodeURIComponent(requestedRow)}`;

      }


      filter +=
        '&order=updated_at.desc';


      const rows =
        await supabase(
          `${TABLE}${filter}`,
          {
            method:'GET'
          }
        );


      return res
        .status(200)
        .json({
          success:true,
          updates:
            Array.isArray(rows)
              ? rows
              : []
        });

    }


    /*
     * ==========================
     * POST ONLY
     * ==========================
     */

    if (req.method !== 'POST') {

      return res
        .status(405)
        .json({
          error:
            'Method not allowed'
        });

    }


    /*
     * ==========================
     * ADMIN LOGIN
     * ==========================
     */

    if (!isAdmin(req)) {

      return res
        .status(401)
        .json({
          error:
            'Unauthorized. Silakan login sebagai admin.'
        });

    }


    /*
     * ==========================
     * BODY
     * ==========================
     */

    let body =
      req.body;


    if (
      typeof body === 'string'
    ) {

      try {

        body =
          JSON.parse(body);

      } catch {

        body = {};

      }

    }


    if (
      !body ||
      typeof body !== 'object'
    ) {

      body = {};

    }


    /*
     * ==========================
     * ROW NUMBER
     * ==========================
     */

    const possibleRows = [

      body.row_number,

      body.rowNumber,

      body.row,

      body.googleSheetRow,

      body.order?.row_number,

      body.order?.rowNumber,

      body.order?.row,

      body.order?.metadata?.rowNumber,

      body.order?.metadata?.row_number,

      body.metadata?.rowNumber,

      body.metadata?.row_number

    ];


    let rowNumber = 0;


    for (
      const value
      of possibleRows
    ) {

      const n =
        Number(value);


      if (
        Number.isFinite(n) &&
        n > 0
      ) {

        rowNumber = n;

        break;

      }

    }


    /*
     * ==========================
     * CUSTOMER NAME
     * ==========================
     */

    const customerName =
      String(

        body.customer_name ||

        body.customerName ||

        body.order?.name ||

        body.order?.customer_name ||

        ''

      ).trim();


    /*
     * ==========================
     * STATUS
     * ==========================
     */

    const status =
      String(
        body.status ||
        'Belum di CO'
      ).trim();


    const note =
      String(
        body.note || ''
      );


    const photo =
      String(
        body.photo || ''
      );


    const allowedStatuses = [

      'Belum di CO',

      'Sudah di CO',

      'Diproses',

      'Selesai'

    ];


    /*
     * ==========================
     * VALIDATION
     * ==========================
     */

    if (!rowNumber) {

      return res
        .status(400)
        .json({

          error:
            'Nomor row Google Sheets tidak terbaca.'

        });

    }


    if (!customerName) {

      return res
        .status(400)
        .json({

          error:
            'Nama customer wajib diisi.'

        });

    }


    if (
      !allowedStatuses.includes(
        status
      )
    ) {

      return res
        .status(400)
        .json({

          error:
            'Status website tidak valid.'

        });

    }


    /*
     * ==========================
     * DATA UPDATE
     * ==========================
     */

    const updateData = {

      status,

      note,

      photo,

      updated_at:
        new Date().toISOString()

    };


    /*
     * ==========================
     * CEK APAKAH SUDAH ADA
     * ==========================
     *
     * Tidak menggunakan ON CONFLICT.
     */

    const existing =
      await supabase(

        `${TABLE}?select=id,row_number,customer_name,status,note,photo,updated_at&row_number=eq.${encodeURIComponent(rowNumber)}&customer_name=eq.${encodeURIComponent(customerName)}`,

        {
          method:'GET'
        }

      );


    /*
     * ==========================
     * UPDATE DATA LAMA
     * ==========================
     */

    if (
      Array.isArray(existing) &&
      existing.length
    ) {

      const first =
        existing[0];


      const updated =
        await supabase(

          `${TABLE}?id=eq.${encodeURIComponent(first.id)}`,

          {
            method:'PATCH',

            headers:{
              Prefer:
                'return=representation'
            },

            body:
              JSON.stringify(
                updateData
              )

          }

        );


      return res
        .status(200)
        .json({

          success:true,

          action:'updated',

          update:
            Array.isArray(updated)
              ? updated[0] ||
                {
                  ...first,
                  ...updateData
                }
              :
                {
                  ...first,
                  ...updateData
                }

        });

    }


    /*
     * ==========================
     * INSERT DATA BARU
     * ==========================
     */

    const newRow = {

      id:
        Number(body.id) ||
        Date.now(),

      row_number:
        rowNumber,

      customer_name:
        customerName,

      status,

      note,

      photo,

      updated_at:
        new Date().toISOString()

    };


    const inserted =
      await supabase(
        TABLE,
        {
          method:'POST',

          headers:{
            Prefer:
              'return=representation'
          },

          body:
            JSON.stringify(
              newRow
            )

        }
      );


    return res
      .status(200)
      .json({

        success:true,

        action:'inserted',

        update:
          Array.isArray(inserted)
            ? inserted[0] ||
              newRow
            : inserted ||
              newRow

      });


  } catch (error) {


    console.error(
      'ORDER UPDATES API ERROR:',
      error
    );


    return res
      .status(500)
      .json({

        error:
          error.message ||
          'Gagal menyimpan perubahan order.'

      });

  }

}
