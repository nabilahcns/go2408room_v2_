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


function parseBody(req) {

  if (!req.body) {
    return {};
  }

  if (
    typeof req.body === 'object'
  ) {
    return req.body;
  }

  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}


function safeFilename(filename) {

  const original =
    clean(filename) || 'file';


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
  ) + extension;

}


function getFolder(value) {

  const folder =
    clean(value)
      .toLowerCase();


  const allowed = {
    batch: 'batch',
    album: 'album',
    status: 'status',
    admin: 'admin'
  };


  return (
    allowed[folder] ||
    'admin'
  );

}


async function createSignedUploadUrl(
  path
) {

  const endpoint =
    `${SUPABASE_URL}/storage/v1/object/upload/sign/${BUCKET}/${encodeURIComponent(path)}`;


  const response =
    await fetch(
      endpoint,
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


  let data = {};


  try {

    data =
      text
        ? JSON.parse(text)
        : {};

  } catch {

    data = {};

  }


  if (!response.ok) {

    console.error(
      'Supabase upload error:',
      response.status,
      data
    );


    throw new Error(
      'Penyimpanan file sedang bermasalah.'
    );

  }


  const signed =
    data?.signedURL ||
    data?.signedUrl ||
    data?.signed_url;


  if (!signed) {

    throw new Error(
      'URL upload tidak tersedia.'
    );

  }


  return String(signed)
    .startsWith('http')
    ? signed
    : `${SUPABASE_URL}${signed}`;

}


export default async function handler(
  req,
  res
) {

  try {

    if (
      req.method !== 'POST'
    ) {

      return res
        .status(405)
        .json({
          error:
            'Method not allowed.'
        });

    }


    /*
     * Upload melalui endpoint ini
     * hanya untuk Admin.
     *
     * Customer menggunakan:
     * /api/payment-proof
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
      !SUPABASE_URL ||
      !SUPABASE_SECRET_KEY
    ) {

      console.error(
        'Supabase storage environment belum lengkap.'
      );


      return res
        .status(500)
        .json({
          error:
            'Fitur upload sedang tidak tersedia.'
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
            'Nama file wajib diisi.'
        });

    }


    const safe =
      safeFilename(
        filename
      );


    /*
     * Hanya gambar yang dibutuhkan
     * website yang diperbolehkan.
     */

    const extension =
      safe.includes('.')
        ? '.' +
          safe
            .split('.')
            .pop()
            .toLowerCase()
        : '';


    const allowedExtensions =
      new Set([
        '.jpg',
        '.jpeg',
        '.png',
        '.webp',
        '.gif'
      ]);


    if (
      !allowedExtensions.has(
        extension
      )
    ) {

      return res
        .status(400)
        .json({
          error:
            'Format foto belum didukung. Gunakan JPG, JPEG, PNG, WEBP, atau GIF.'
        });

    }


    /*
     * Folder bisa dikirim dari Admin.
     *
     * Contoh:
     *
     * folder=batch
     * folder=album
     * folder=status
     */

    const folder =
      getFolder(
        body.folder
      );


    const path =
      `${folder}/${Date.now()}_${safe}`;


    const signedUrl =
      await createSignedUploadUrl(
        path
      );


    return res
      .status(200)
      .json({

        success: true,

        bucket:
          BUCKET,

        path,

        folder,

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
          'Foto belum berhasil disiapkan untuk upload. Silakan coba lagi.'
      });

  }

}
