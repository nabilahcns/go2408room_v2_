import { isAdmin, sb } from './_supabase.js';

const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY;

const BUCKET =
  'go2408room-files';


function clean(value) {
  return String(value ?? '').trim();
}


function decodePath(value) {
  const text = clean(value);

  if (!text) {
    return '';
  }

  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}


async function createSignedReadUrl(path) {

  if (
    !SUPABASE_URL ||
    !SUPABASE_SECRET_KEY
  ) {
    throw new Error(
      'Storage belum dikonfigurasi.'
    );
  }


  const endpoint =
    `${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${encodeURIComponent(path)}`;


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
        },

        body:
          JSON.stringify({
            expiresIn: 3600
          })
      }
    );


  const text =
    await response.text();


  let data = null;


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
      'Supabase signed URL error:',
      response.status,
      data
    );

    throw new Error(
      'File tidak dapat dibuka.'
    );
  }


  const signed =
    data?.signedURL ||
    data?.signedUrl ||
    data?.signed_url;


  if (!signed) {

    throw new Error(
      'URL file tidak tersedia.'
    );

  }


  return String(signed)
    .startsWith('http')
    ? signed
    : `${SUPABASE_URL}${signed}`;
}


async function pathIsUsedByPaymentProof(
  path
) {

  try {

    const escaped =
      encodeURIComponent(
        path
      );


    const rows =
      await sb(
        `payment_submissions?select=id&proof_path=eq.${escaped}&limit=1`,
        {
          method: 'GET'
        }
      );


    return Boolean(
      rows?.length
    );

  } catch {

    return false;

  }
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
          error:
            'Method not allowed.'
        });
    }


    const path =
      decodePath(
        req.query?.path
      );


    if (!path) {

      return res
        .status(400)
        .json({
          error:
            'File tidak ditemukan.'
        });

    }


    /*
     * Basic path security.
     */
    if (
      path.includes('..') ||
      path.startsWith('/') ||
      path.includes('\\')
    ) {

      return res
        .status(400)
        .json({
          error:
            'File tidak valid.'
        });

    }


    const admin =
      isAdmin(req);


    /*
     * Bukti pembayaran hanya boleh
     * dilihat Admin.
     *
     * Path payment-proof juga tidak
     * boleh dibuka customer hanya
     * karena mengetahui URL-nya.
     */

    if (
      path.startsWith(
        'payment-proof/'
      )
    ) {

      if (!admin) {

        return res
          .status(401)
          .json({
            error:
              'File tidak dapat diakses.'
          });

      }

    }


    /*
     * Supaya private storage tetap
     * aman tetapi foto batch/album
     * dapat ditampilkan customer,
     * file yang memang tersimpan
     * melalui data website boleh
     * dibuatkan signed URL.
     *
     * Tidak ada public bucket.
     */


    const signedUrl =
      await createSignedReadUrl(
        path
      );


    /*
     * Redirect langsung ke gambar/file.
     *
     * Ini yang membuat:
     *
     * <img src="/api/file?path=...">
     *
     * bekerja langsung.
     */

    res.setHeader(
      'Cache-Control',
      'private, max-age=300'
    );


    return res
      .redirect(
        302,
        signedUrl
      );


  } catch (error) {

    console.error(
      'file.js error:',
      error
    );


    return res
      .status(404)
      .json({
        error:
          'File sedang tidak tersedia.'
      });

  }

}
