import crypto from 'crypto';


const BRIDGE_URL =
  process.env.GOOGLE_SHEETS_BRIDGE_URL || '';

const BRIDGE_TOKEN =
  process.env.GOOGLE_SHEETS_BRIDGE_TOKEN || '';


/*
 * ============================
 * ADMIN AUTH
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


    if (
      signature !== expected
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
 * MAIN API
 * ============================
 */

export default async function handler(
  req,
  res
) {

  try {


    /*
     * Hanya POST
     */

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


    /*
     * Pastikan admin login
     */

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


    /*
     * Environment check
     */

    if (!BRIDGE_URL) {

      return res
        .status(500)
        .json({

          error:
            'GOOGLE_SHEETS_BRIDGE_URL belum diatur di Vercel.'

        });

    }


    if (!BRIDGE_TOKEN) {

      return res
        .status(500)
        .json({

          error:
            'GOOGLE_SHEETS_BRIDGE_TOKEN belum diatur di Vercel.'

        });

    }


    /*
     * Baca body
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
     * ============================
     * ROW NUMBER
     * ============================
     */

    const rowNumber =
      Number(
        body.rowNumber ??
        body.row_number ??
        body.row ??
        body.googleSheetRow ??
        0
      );


    /*
     * ============================
     * SHEET NAME
     * ============================
     */

    const sheetName =
      String(

        body.sheetName ||

        body.sheet_name ||

        'REKAPAN'

      ).trim();


    /*
     * ============================
     * VALUES
     * ============================
     */

    const values =
      Array.isArray(
        body.values
      )
        ? body.values
        : null;


    /*
     * ============================
     * VALIDATION
     * ============================
     */

    if (!rowNumber) {

      return res
        .status(400)
        .json({

          error:
            'rowNumber wajib diisi.'

        });

    }


    if (!values) {

      return res
        .status(400)
        .json({

          error:
            'values wajib berupa array.'

        });

    }


    if (!values.length) {

      return res
        .status(400)
        .json({

          error:
            'Data values kosong.'

        });

    }


    /*
     * ============================
     * KIRIM KE GOOGLE APPS SCRIPT
     * ============================
     */

    const payload = {

      token:
        BRIDGE_TOKEN,

      sheetName:
        sheetName,

      rowNumber:
        rowNumber,

      values:
        values.slice(
          0,
          10
        )

    };


    const response =
      await fetch(
        BRIDGE_URL,
        {

          method:
            'POST',

          headers:{

            'Content-Type':
              'application/json',

            Accept:
              'application/json'

          },

          body:
            JSON.stringify(
              payload
            )

        }
      );


    /*
     * Ambil response sebagai text
     * dulu karena Apps Script
     * kadang mengembalikan
     * response yang bukan JSON
     * secara langsung.
     */

    const raw =
      await response.text();


    let data;


    try {

      data =
        raw
          ? JSON.parse(raw)
          : {};

    } catch {

      return res
        .status(502)
        .json({

          error:
            'Google Apps Script mengembalikan response yang tidak valid.',

          bridgeStatus:
            response.status,

          bridgeResponse:
            raw.slice(
              0,
              500
            )

        });

    }


    /*
     * ============================
     * CEK ERROR DARI BRIDGE
     * ============================
     */

    if (
      !response.ok
    ) {

      return res
        .status(502)
        .json({

          error:
            data?.error ||
            `Google Sheets bridge gagal (${response.status}).`,

          bridge:
            data

        });

    }


    if (
      data?.ok === false ||
      data?.success === false
    ) {

      return res
        .status(502)
        .json({

          error:
            data?.error ||
            'Google Sheets bridge menolak request.',

          bridge:
            data

        });

    }


    /*
     * ============================
     * BERHASIL
     * ============================
     */

    return res
      .status(200)
      .json({

        success:true,

        rowNumber,

        sheetName,

        bridge:data

      });


  } catch (error) {


    console.error(
      'SHEETS API ERROR:',
      error
    );


    return res
      .status(500)
      .json({

        error:
          error.message ||
          'Gagal memperbarui Google Sheets.'

      });

  }

}
