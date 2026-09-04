import crypto from 'crypto';


function createSignature(encoded) {

  return crypto
    .createHmac(
      'sha256',
      process.env.AUTH_SECRET
    )
    .update(encoded)
    .digest('base64url');

}


function makeToken(username) {

  const payload = {

    username,

    exp:
      Date.now() +
      24 * 60 * 60 * 1000

  };


  const encoded =
    Buffer
      .from(
        JSON.stringify(payload)
      )
      .toString(
        'base64url'
      );


  const signature =
    createSignature(
      encoded
    );


  return (
    encoded +
    '.' +
    signature
  );

}


function verifyToken(token) {

  try {

    if (!token) {
      return false;
    }


    const parts =
      token.split('.');


    if (
      parts.length !== 2
    ) {
      return false;
    }


    const [
      encoded,
      signature
    ] = parts;


    const expected =
      createSignature(
        encoded
      );


    /*
     * timingSafeEqual harus
     * membandingkan buffer dengan
     * panjang yang sama.
     */
    const givenBuffer =
      Buffer.from(
        signature
      );

    const expectedBuffer =
      Buffer.from(
        expected
      );


    if (
      givenBuffer.length !==
      expectedBuffer.length
    ) {
      return false;
    }


    if (
      !crypto.timingSafeEqual(
        givenBuffer,
        expectedBuffer
      )
    ) {
      return false;
    }


    const decoded =
      Buffer
        .from(
          encoded,
          'base64url'
        )
        .toString(
          'utf8'
        );


    const data =
      JSON.parse(
        decoded
      );


    if (
      !data ||
      !data.username
    ) {
      return false;
    }


    if (
      !data.exp ||
      Number(data.exp) <
      Date.now()
    ) {
      return false;
    }


    if (
      data.username !==
      process.env.ADMIN_USERNAME
    ) {
      return false;
    }


    return true;

  } catch {

    return false;

  }

}


function getCookieToken(req) {

  const cookies =
    req.headers.cookie || '';


  const match =
    cookies.match(
      /(?:^|;\s*)admin_session=([^;]+)/
    );


  if (!match) {
    return null;
  }


  try {

    return decodeURIComponent(
      match[1]
    );

  } catch {

    return match[1];

  }

}


export default function handler(
  req,
  res
) {

  /*
   * =========================
   * GET
   * =========================
   *
   * Dipakai website untuk
   * mengecek apakah Admin
   * masih login.
   */

  if (
    req.method ===
    'GET'
  ) {

    const token =
      getCookieToken(
        req
      );


    if (
      verifyToken(
        token
      )
    ) {

      return res
        .status(200)
        .json({
          authenticated: true
        });

    }


    return res
      .status(401)
      .json({
        authenticated: false
      });

  }


  /*
   * =========================
   * POST
   * =========================
   *
   * Login Admin.
   */

  if (
    req.method ===
    'POST'
  ) {

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

        body = {};

      }

    }


    const username =
      String(
        body?.username ??
        ''
      ).trim();


    const password =
      String(
        body?.password ??
        ''
      );


    /*
     * Pastikan environment
     * sudah tersedia.
     */

    if (
      !process.env.ADMIN_USERNAME ||
      !process.env.ADMIN_PASSWORD ||
      !process.env.AUTH_SECRET
    ) {

      return res
        .status(500)
        .json({
          error:
            'Environment Admin belum lengkap. Periksa ADMIN_USERNAME, ADMIN_PASSWORD, dan AUTH_SECRET di Vercel.'
        });

    }


    /*
     * Cek credential.
     */

    if (
      username !==
      process.env.ADMIN_USERNAME ||
      password !==
      process.env.ADMIN_PASSWORD
    ) {

      return res
        .status(401)
        .json({
          error:
            'Username atau password salah.'
        });

    }


    const token =
      makeToken(
        username
      );


    /*
     * HttpOnly:
     * JavaScript browser tidak
     * bisa membaca cookie.
     *
     * Secure:
     * hanya dikirim lewat HTTPS.
     *
     * SameSite=Lax:
     * mengurangi risiko CSRF
     * pada penggunaan normal.
     */

    res.setHeader(
      'Set-Cookie',
      [
        `admin_session=${encodeURIComponent(token)}`,
        'HttpOnly',
        'Secure',
        'SameSite=Lax',
        'Path=/',
        'Max-Age=86400'
      ].join('; ')
    );


    return res
      .status(200)
      .json({
        authenticated: true
      });

  }


  /*
   * =========================
   * DELETE
   * =========================
   *
   * Logout.
   */

  if (
    req.method ===
    'DELETE'
  ) {

    res.setHeader(
      'Set-Cookie',
      [
        'admin_session=',
        'HttpOnly',
        'Secure',
        'SameSite=Lax',
        'Path=/',
        'Max-Age=0'
      ].join('; ')
    );


    return res
      .status(200)
      .json({
        loggedOut: true
      });

  }


  return res
    .status(405)
    .json({
      error:
        'Method not allowed'
    });

}
