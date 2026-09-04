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


function decodePath(value) {

  const text =
    clean(value);

  if (!text) {
    return '';
  }

  try {

    return decodeURIComponent(
      text
    );

  } catch {

    return text;

  }

}


/*
 * Membuat signed URL untuk
 * file private di Supabase Storage.
 *
 * Signed URL hanya berlaku
 * sementara sehingga file
 * tidak menjadi public.
 */

async function createSignedReadUrl(
  path
) {

  const endpoint =
    `${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${encodeURIComponent(path)}`;

  const response =
    await fetch(
      endpoint,
      {
        method:'POST',

        headers:{
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


  if (text) {

    try {

      data =
        JSON.parse(
          text
        );

    } catch {

      data =
        {
          raw:text
        };

    }

  }


  if (!response.ok) {

    throw new Error(
      data?.message ||
      data?.error ||
      `Supabase gagal membuat signed URL (${response.status}).`
    );

  }


  const signed =
    data?.signedURL ||
    data?.signedUrl ||
    data?.signed_url;


  if (!signed) {

    throw new Error(
      'Supabase tidak mengembalikan signed URL.'
    );

  }


  /*
   * Jika Supabase mengembalikan
   * relative path, tambahkan
   * domain Supabase.
   */

  if (
    String(signed)
      .startsWith('http')
  ) {

    return signed;

  }


  return (
    `${SUPABASE_URL}${signed}`
  );

}


export default async function handler(
  req,
  res
) {

  try {

    if (
      req.method !==
      'GET'
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
            'SUPABASE_URL atau SUPABASE_SECRET_KEY belum diatur.'
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
            'Path file wajib diisi.'
        });

    }


    /*
     * =========================
     * SECURITY
     * =========================
     *
     * Path tertentu hanya boleh
     * diakses Admin.
     *
     * Payment proof tetap boleh
     * dilihat Admin dan submission
     * terkait melalui sistem website.
     */


    const isAdminUser =
      isAdmin(req);


    /*
     * Hindari akses ke path
     * yang mencoba keluar folder.
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
            'Path file tidak valid.'
        });

    }


    /*
     * Folder admin hanya boleh
     * diakses Admin.
     */

    if (
      path.startsWith(
        'admin/'
      ) &&
      !isAdminUser
    ) {

      return res
        .status(401)
        .json({
          error:
            'Unauthorized'
        });

    }


    /*
     * Payment proof:
     *
     * Untuk MVP, customer dapat
     * melihat hasil submission miliknya
     * melalui endpoint payment-proof.
     *
     * File proof jangan dibuat public
     * hanya karena path diketahui.
     *
     * Karena halaman Admin membutuhkan
     * akses langsung ke bukti,
     * maka payment-proof hanya dapat
     * dibuka melalui Admin.
     */

    if (
      path.startsWith(
        'payment-proof/'
      ) &&
      !isAdminUser
    ) {

      return res
        .status(401)
        .json({
          error:
            'Bukti pembayaran hanya dapat dilihat oleh Admin.'
        });

    }


    const signedUrl =
      await createSignedReadUrl(
        path
      );


    /*
     * Kita mengembalikan URL
     * dalam JSON supaya frontend
     * bisa memakai URL tersebut
     * untuk <img>, <a>, dll.
     */

    return res
      .status(200)
      .json({

        success:true,

        path,

        expiresIn:
          3600,

        signedUrl

      });


  } catch (error) {

    console.error(
      'file.js error:',
      error
    );


    return res
      .status(500)
      .json({
        error:
          error?.message ||
          'Gagal mengambil file.'
      });

  }

}
