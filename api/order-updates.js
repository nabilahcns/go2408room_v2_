import crypto from 'crypto';

const TABLE = 'order_updates';


/* =========================================
   CEK LOGIN ADMIN
========================================= */

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

    const encoded =
      parts[0];

    const signature =
      parts[1];

    const expected =
      crypto
        .createHmac(
          'sha256',
          process.env.AUTH_SECRET
        )
        .update(encoded)
        .digest('base64url');

    if (
      signature !==
      expected
    ) {
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
      data.exp <
      Date.now()
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


/* =========================================
   SUPABASE HELPER
========================================= */

async function supabase(
  path,
  options = {}
) {

  const base =
    process.env.SUPABASE_URL;

  const key =
    process.env.SUPABASE_SECRET_KEY;


  if (
    !base ||
    !key
  ) {

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

          apikey:
            key,

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


  let data =
    null;


  try {

    data =
      raw
        ? JSON.parse(raw)
        : null;

  } catch {

    data =
      raw;

  }


  if (
    !response.ok
  ) {

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


/* =========================================
   API HANDLER
========================================= */

export default async function handler(
  req,
  res
) {

  try {


    /* =====================================
       ADMIN ONLY
    ===================================== */

    if (
      !isAdmin(req)
    ) {

      return res
        .status(401)
        .json({

          error:
            'Unauthorized. Silakan login sebagai admin.'

        });

    }


    /* =====================================
       GET
    ===================================== */

    if (
      req.method === 'GET'
    ) {

      const rowNumber =
        Number(

          req.query?.row_number ??

          req.query?.rowNumber ??

          req.query?.row ??

          0

        );


      let query =
        `${TABLE}?select=id,row_number,customer_name,status,note,photo,updated_at&order=updated_at.desc`;


      if (
        rowNumber > 0
      ) {

        query =
          `${TABLE}?select=id,row_number,customer_name,status,note,photo,updated_at` +

          `&row_number=eq.${encodeURIComponent(rowNumber)}` +

          `&order=updated_at.desc`;

      }


      const rows =
        await supabase(
          query,
          {
            method:
              'GET'
          }
        );


      return res
        .status(200)
        .json({

          success:
            true,

          updates:
            rows || []

        });

    }


    /* =====================================
       POST
    ===================================== */

    if (
      req.method !== 'POST'
    ) {

      return res
        .status(405)
        .json({

          error:
            'Method not allowed'

        });

    }


    /* =====================================
       BACA BODY
    ===================================== */

    let body =
      req.body;


    if (
      typeof body ===
      'string'
    ) {

      try {

        body =
          JSON.parse(
            body
          );

      } catch {

        body =
          {};

      }

    }


    if (
      !body ||
      typeof body !==
      'object'
    ) {

      body =
        {};

    }


    /* =====================================
       ROW NUMBER
       
       Terima SEMUA format:
       row_number
       rowNumber
       row
    ===================================== */

    let rowNumber =
      Number(

        body?.row_number ??

        body?.rowNumber ??

        body?.row ??

        body?.order?.row_number ??

        body?.order?.rowNumber ??

        body?.order?.row ??

        0

      );


    /* =====================================
       CUSTOMER NAME
    ===================================== */

    let customerName =
      String(

        body?.customer_name ??

        body?.customerName ??

        body?.name ??

        body?.order?.customer_name ??

        body?.order?.customerName ??

        body?.order?.name ??

        ''

      ).trim();


    /* =====================================
       STATUS
    ===================================== */

    const status =
      String(

        body?.status ??

        'Belum di CO'

      ).trim();


    /* =====================================
       NOTE
    ===================================== */

    const note =
      String(

        body?.note ??

        ''

      );


    /* =====================================
       PHOTO
    ===================================== */

    const photo =
      String(

        body?.photo ??

        ''

      );


    /* =====================================
       VALID STATUS
    ===================================== */

    const allowedStatuses = [

      'Belum di CO',

      'Sudah di CO',

      'Diproses',

      'Selesai'

    ];


    /* =====================================
       VALIDASI ROW
    ===================================== */

    if (
      !rowNumber ||
      rowNumber < 1
    ) {

      return res
        .status(400)
        .json({

          error:
            'Row customer tidak ditemukan.',

          received:
            {

              row_number:
                body?.row_number ?? null,

              rowNumber:
                body?.rowNumber ?? null,

              row:
                body?.row ?? null

            }

        });

    }


    /* =====================================
       VALIDASI NAMA
    ===================================== */

    if (
      !customerName
    ) {

      return res
        .status(400)
        .json({

          error:
            'Nama customer tidak ditemukan.'

        });

    }


    /* =====================================
       VALIDASI STATUS
    ===================================== */

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


    /* =====================================
       CEK DATA EXISTING
    ===================================== */

    const existing =
      await supabase(

        `${TABLE}?select=id,row_number,customer_name,status,note,photo,updated_at` +

        `&row_number=eq.${encodeURIComponent(rowNumber)}` +

        `&limit=1`,

        {

          method:
            'GET'

        }

      );


    const now =
      new Date()
        .toISOString();


    const rowData = {

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
        now

    };


    /* =====================================
       KALAU SUDAH ADA
       → UPDATE
    ===================================== */

    if (
      Array.isArray(existing) &&
      existing.length > 0
    ) {

      const existingId =
        existing[0].id;


      const updated =
        await supabase(

          `${TABLE}?id=eq.${encodeURIComponent(existingId)}`,

          {

            method:
              'PATCH',

            headers: {

              Prefer:
                'return=representation'

            },

            body:
              JSON.stringify(
                rowData
              )

          }

        );


      return res
        .status(200)
        .json({

          success:
            true,

          action:
            'updated',

          rowNumber:
            rowNumber,

          update:
            Array.isArray(updated)

              ? updated[0] ||
                rowData

              : updated ||
                rowData

        });

    }


    /* =====================================
       KALAU BELUM ADA
       → INSERT
    ===================================== */

    const newRow = {

      id:
        Number(
          body?.id
        ) ||
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
        now

    };


    const inserted =
      await supabase(

        TABLE,

        {

          method:
            'POST',

          headers: {

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

        success:
          true,

        action:
          'created',

        rowNumber:
          rowNumber,

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
