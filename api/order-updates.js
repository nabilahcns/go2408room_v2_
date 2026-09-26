import crypto from 'crypto';

const TABLE = 'order_updates';


function verifyToken(token) {

  try {

    if (!token) return false;

    const parts = token.split('.');

    if (parts.length !== 2) return false;

    const [encoded, signature] = parts;

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
          .from(encoded, 'base64url')
          .toString()
      );

    if (!data?.exp) return false;

    if (data.exp < Date.now()) {
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
    match ? match[1] : null
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
     * ============================
     * GET
     * ============================
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


      const queryRow =
        req.query?.row_number ??
        req.query?.rowNumber ??
        req.query?.row ??
        '';


      const rowNumber =
        Number(queryRow);


      let filter =
        '?select=id,row_number,customer_name,status,note,photo,updated_at';


      if (rowNumber) {

        filter +=
          `&row_number=eq.${encodeURIComponent(rowNumber)}`;

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
          updates:rows || []
        });

    }


    /*
     * ============================
     * METHOD CHECK
     * ============================
     */

    if (req.method !== 'POST') {

      return res
        .status(405)
        .json({
          error:'Method not allowed'
        });

    }


    /*
     * ============================
     * ADMIN CHECK
     * ============================
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
     * ============================
     * READ BODY
     * ============================
     */

    let body = req.body;


    if (typeof body === 'string') {

      try {

        body =
          JSON.parse(body);

      } catch {

        body = {};

      }

    }


    if (!body || typeof body !== 'object') {

      body = {};

    }


    /*
     * ============================
     * AMBIL ROW DARI SEMUA
     * KEMUNGKINAN FORMAT
     * ============================
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


    for (const value of possibleRows) {

      const n = Number(value);

      if (
        Number.isFinite(n) &&
        n > 0
      ) {

        rowNumber = n;

        break;

      }

    }


    /*
     * ============================
     * CUSTOMER NAME
     * ============================
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
     * ============================
     * STATUS
     * ============================
     */

    const status =
      String(
        body.status ||
        'Belum di CO'
      ).trim();


    /*
     * ============================
     * NOTE / PHOTO
     * ============================
     */

    const note =
      String(
        body.note || ''
      );


    const photo =
      String(
        body.photo || ''
      );


    /*
     * ============================
     * ALLOWED STATUS
     * ============================
     */

    const allowedStatuses = [

      'Belum di CO',

      'Sudah di CO',

      'Diproses',

      'Selesai'

    ];


    /*
     * ============================
     * VALIDASI ROW
     * ============================
     */

    if (!rowNumber) {

      return res
        .status(400)
        .json({

          error:
            'Nomor row Google Sheets tidak terbaca dari order yang dipilih.',

          received: {

            row_number:
              body.row_number ?? null,

            rowNumber:
              body.rowNumber ?? null,

            row:
              body.row ?? null,

            orderRowNumber:
              body.order?.rowNumber ?? null,

            orderRow:
              body.order?.row ?? null

          }

        });

    }


    /*
     * ============================
     * VALIDASI CUSTOMER
     * ============================
     */

    if (!customerName) {

      return res
        .status(400)
        .json({

          error:
            'Nama customer wajib diisi.'

        });

    }


    /*
     * ============================
     * VALIDASI STATUS
     * ============================
     */

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
     * ============================
     * DATA UNTUK SUPABASE
     * ============================
     */

    const row = {

      id:
        Number(body.id) ||
        Date.now(),

      row_number:
        rowNumber,

      customer_name:
        customerName,

      status:
        status,

      note:
        note,

      photo:
        photo,

      updated_at:
        new Date().toISOString()

    };


    /*
     * ============================
     * UPSERT
     * ============================
     *
     * row_number pada tabel sekarang
     * dibuat UNIQUE.
     */

    const data =
      await supabase(

        `${TABLE}?on_conflict=row_number`,

        {

          method:'POST',

          headers:{

            Prefer:
              'resolution=merge-duplicates,return=representation'

          },

          body:
            JSON.stringify(row)

        }

      );


    /*
     * ============================
     * RESPONSE
     * ============================
     */

    return res
      .status(200)
      .json({

        success:true,

        update:
          Array.isArray(data)
            ? data[0] || row
            : data || row

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
