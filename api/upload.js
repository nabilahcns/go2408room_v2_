import { isAdmin } from './_supabase.js';

const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY;

const BUCKET =
  'go2408room-files';


function clean(value) {
  return String(value ?? '').trim();
}


function safeFilename(filename) {

  const original =
    clean(filename) ||
    'file';

  const extension =
    original.includes('.')
      ? '.' +
        original
          .split('.')
          .pop()
          .toLowerCase()
          .replace(
            /[^a-z0-9]/g,
            ''
          )
      : '';

  const base =
    original
      .replace(
        /\.[^/.]+$/,
        ''
      )
      .replace(
        /[^a-zA-Z0-9_-]/g,
        '_'
      )
      .slice(0, 80);


  return (
    base ||
    'file'
  ) +
  extension;

}


function parseBody(req) {

  if (!req.body) {
    return {};
  }

  if (
    typeof req.body ===
    'object'
  ) {
    return req.body;
  }

  try {

    return JSON.parse(
      req.body
    );

  } catch {

    return {};

  }

}


/*
 * Supabase signed upload URL
 *
 * Endpoint:
 *
 * POST
 * /storage/v1/object/upload/sign/{bucket}/{path}
 *
 * Response biasanya berisi:
 *
 * {
 *   signedURL: "..."
 * }
 *
 * atau signedUrl.
 */

async function createSignedUploadUrl(
  path
) {

  const url =
    `${SUPABASE_URL}/storage/v1/object/upload/sign/${BUCKET}/${encodeURIComponent(path)}`;


  const response =
    await fetch(
      url,
      {
        method: 'POST',

        headers: {
          apikey:
            SUPABASE_SECRET_KEY,

          Authorization:
            `Bearer ${SUPABASE_SECRET_KEY}`,

          'Content-Type':
            'application/json'
        }
      }
    );


  const text =
    await response.text();


  let data = null;


  if (text) {

    try {

      data =
        JSON.parse(
          text
        );

    } catch {

      data =
        {
          raw:
            text
        };

    }

  }


  if (!response.ok) {

    throw new Error(
      data?.message ||
      data?.error ||
      data?.statusCode ||
      `Supabase upload gagal (${response.status}).`
    );

  }


  const signed =
    data?.signedURL ||
    data?.signedUrl ||
    data?.signed_url;


  if (!signed) {

    throw new Error(
      'Supabase tidak memberikan signed upload URL.'
    );

  }


  return (
    String(signed)
      .startsWith('http')
      ? signed
      : `${SUPABASE_URL}${signed}`
  );

}


export default async function handler(
  req,
  res
) {

  try {

    if (
      req.method !==
      'POST'
    ) {

      return res
        .status(405)
        .json({
          error:
            'Method not allowed'
        });

    }


    if (
      !SUPABASE_URL ||
      !SUPABASE_SECRET_KEY
    ) {

      return res
        .status(500)
        .json({
          error:
            'SUPABASE_URL atau SUPABASE_SECRET_KEY belum diatur di Vercel.'
        });

    }


    /*
     * Security:
     *
     * Default-nya hanya Admin.
     *
     * Customer bukti pembayaran
     * ditangani lewat
     * /api/payment-proof
     * agar customer tidak bisa
     * sembarang memilih path.
     */

    if (!isAdmin(req)) {

      return res
        .status(401)
        .json({
          error:
            'Unauthorized'
        });

    }


    const body =
      parseBody(req);


    const filename =
      clean(
        body.filename
      );


    if (!filename) {

      return res
        .status(400)
        .json({
          error:
            'Filename wajib diisi.'
        });

    }


    /*
     * Batasi file yang boleh
     * diupload Admin.
     *
     * Fokus utama website:
     * JPG / JPEG / PNG / WEBP / GIF.
     */

    const allowed =
      new Set([
        '.jpg',
        '.jpeg',
        '.png',
        '.webp',
        '.gif'
      ]);


    const safe =
      safeFilename(
        filename
      );


    const extension =
      safe.includes('.')
        ? '.' +
          safe
            .split('.')
            .pop()
            .toLowerCase()
        : '';


    if (
      !allowed.has(
        extension
      )
    ) {

      return res
        .status(400)
        .json({
          error:
            'Format file tidak didukung. Gunakan JPG, JPEG, PNG, WEBP, atau GIF.'
        });

    }


    /*
     * Path dipisahkan berdasarkan
     * jenis file supaya Storage
     * lebih rapi.
     */

    const folder =
      clean(
        body.folder
      ) || 'admin';


    const safeFolder =
      folder
        .replace(
          /[^a-zA-Z0-9/_-]/g,
          ''
        )
        .replace(
          /^\/+|\/+$/g,
          ''
        );


    const cleanFolder =
      safeFolder ||
      'admin';


    const path =
      `${cleanFolder}/${Date.now()}_${safe}`;


    const signedUrl =
      await createSignedUploadUrl(
        path
      );


    return res
      .status(200)
      .json({

        success: true,

        path,

        bucket:
          BUCKET,

        signedUrl

      });


  } catch (error) {

    console.error(
      'upload.js error:',
      error
    );


    return res
      .status(500)
      .json({
        error:
          error?.message ||
          'Upload file gagal.'
      });

  }

}
