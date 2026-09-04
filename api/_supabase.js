const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY;


function getAuthToken(req) {

  const cookies =
    req.headers.cookie || '';

  const match =
    cookies.match(
      /admin_session=([^;]+)/
    );

  return match
    ? decodeURIComponent(
        match[1]
      )
    : null;
}


function verifyAdmin(req) {

  const token =
    getAuthToken(req);

  if (!token) {
    return false;
  }

  /*
   * Verifikasi session dilakukan
   * melalui endpoint auth.
   *
   * Karena auth.js dan seluruh
   * API berada dalam project yang sama,
   * kita decode token session di sini.
   */

  try {

    const [
      encoded,
      signature
    ] =
      token.split('.');


    if (
      !encoded ||
      !signature
    ) {
      return false;
    }


    const crypto =
      require('crypto');


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
        Buffer.from(
          encoded,
          'base64url'
        ).toString()
      );


    if (
      !data ||
      !data.username
    ) {
      return false;
    }


    if (
      data.exp &&
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


/*
 * Supabase REST helper
 *
 * Contoh:
 *
 * await sb(
 *   'payment_batches?select=*'
 * )
 *
 * atau:
 *
 * await sb(
 *   'payment_batches',
 *   {
 *     method:'POST',
 *     body: JSON.stringify(data)
 *   }
 * )
 */

async function sb(
  endpoint,
  options = {}
) {

  if (
    !SUPABASE_URL ||
    !SUPABASE_SECRET_KEY
  ) {

    throw new Error(
      'SUPABASE_URL atau SUPABASE_SECRET_KEY belum diatur di Environment Variables.'
    );

  }


  const url =
    endpoint.startsWith('http')
      ? endpoint
      : `${SUPABASE_URL}/rest/v1/${endpoint}`;


  const headers = {

    apikey:
      SUPABASE_SECRET_KEY,

    Authorization:
      `Bearer ${SUPABASE_SECRET_KEY}`,

    'Content-Type':
      'application/json',

    ...(
      options.headers || {}
    )

  };


  const response =
    await fetch(
      url,
      {
        ...options,
        headers
      }
    );


  const text =
    await response.text();


  let data = null;


  if (text) {

    try {

      data =
        JSON.parse(text);

    } catch {

      data =
        text;

    }

  }


  if (!response.ok) {

    const message =
      typeof data === 'object'
        ? (
            data?.message ||
            data?.hint ||
            data?.details ||
            data?.error
          )
        : data;


    throw new Error(
      message ||
      `Supabase request gagal (${response.status}).`
    );

  }


  return data;

}


export {
  sb,
  verifyAdmin
};


/*
 * Beberapa file lama kita
 * menggunakan nama isAdmin().
 *
 * Kita export alias supaya
 * tidak perlu mengubah semua API
 * hanya karena nama function.
 */

export function isAdmin(req) {
  return verifyAdmin(req);
}
