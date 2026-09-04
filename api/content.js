import { sb, isAdmin } from './_supabase.js';

function clean(value) {
  return String(value ?? '').trim();
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseBody(req) {
  if (!req.body) {
    return {};
  }

  if (typeof req.body === 'object') {
    return req.body;
  }

  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

function normalizeItem(row) {
  return {
    id: row.id,

    service:
      clean(row.service),

    type:
      clean(row.type),

    title:
      clean(row.title),

    note:
      clean(row.note),

    url:
      clean(row.url),

    date:
      clean(row.date),

    venue:
      clean(row.venue),

    photo:
      clean(row.photo),

    data:
      row.data || {},

    created_at:
      row.created_at
  };
}

async function getContent(query = '') {
  return await sb(
    `site_content?select=*${query}`,
    {
      method: 'GET'
    }
  );
}

export default async function handler(req, res) {
  try {

    /*
     * =========================
     * GET
     * =========================
     *
     * Customer:
     * dapat melihat content.
     *
     * Admin:
     * dapat melihat semua content.
     */

    if (req.method === 'GET') {

      const type =
        clean(
          req.query?.type
        );

      const service =
        clean(
          req.query?.service
        );

      let query =
        '&order=created_at.desc';


      if (type) {
        query +=
          `&type=eq.${encodeURIComponent(type)}`;
      }


      if (service) {
        query +=
          `&service=eq.${encodeURIComponent(service)}`;
      }


      const rows =
        await getContent(query);


      return res
        .status(200)
        .json({
          items:
            (rows || [])
              .map(normalizeItem)
        });
    }


    /*
     * =========================
     * POST
     * =========================
     *
     * ADMIN ONLY
     *
     * Digunakan untuk:
     * - membuat data baru
     * - memperbarui data
     */

    if (req.method === 'POST') {

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


      const id =
        body.id
        ? toNumber(body.id)
        : Date.now();


      const service =
        clean(
          body.service
        );

      const type =
        clean(
          body.type
        );


      if (!type) {

        return res
          .status(400)
          .json({
            error:
              'Type content wajib diisi.'
          });

      }


      const payload = {

        id,

        service,

        type,

        title:
          clean(
            body.title
          ),

        note:
          clean(
            body.note
          ),

        url:
          clean(
            body.url
          ),

        date:
          clean(
            body.date
          ),

        venue:
          clean(
            body.venue
          ),

        photo:
          clean(
            body.photo
          ),

        data:
          body.data &&
          typeof body.data === 'object'
            ? body.data
            : {},

        created_at:
          body.created_at ||
          new Date()
            .toISOString()

      };


      /*
       * Upsert berdasarkan ID.
       *
       * Dengan begitu Admin dapat
       * menggunakan endpoint ini
       * untuk membuat maupun
       * memperbarui content.
       */

      const saved =
        await sb(
          'site_content?on_conflict=id',
          {
            method:'POST',

            headers:{
              Prefer:
                'resolution=merge-duplicates,return=representation'
            },

            body:
              JSON.stringify(
                payload
              )
          }
        );


      const item =
        Array.isArray(saved)
          ? saved[0]
          : saved;


      return res
        .status(200)
        .json({
          success:true,

          item:
            normalizeItem(
              item || payload
            )
        });
    }


    /*
     * =========================
     * PATCH
     * =========================
     *
     * ADMIN ONLY
     *
     * Bisa digunakan untuk edit
     * sebagian field saja.
     */

    if (req.method === 'PATCH') {

      if (!isAdmin(req)) {

        return res
          .status(401)
          .json({
            error:
              'Unauthorized'
          });

      }


      const id =
        toNumber(
          req.query?.id
        );


      if (!id) {

        return res
          .status(400)
          .json({
            error:
              'ID content tidak valid.'
          });

      }


      const body =
        parseBody(req);


      const payload = {};


      const fields = [
        'service',
        'type',
        'title',
        'note',
        'url',
        'date',
        'venue',
        'photo',
        'data'
      ];


      for (
        const field
        of fields
      ) {

        if (
          Object.prototype
            .hasOwnProperty
            .call(
              body,
              field
            )
        ) {

          if (
            field === 'data'
          ) {

            payload.data =
              body.data &&
              typeof body.data ===
                'object'

                ? body.data

                : {};

          } else {

            payload[field] =
              clean(
                body[field]
              );

          }

        }

      }


      if (
        !Object.keys(
          payload
        ).length
      ) {

        return res
          .status(400)
          .json({
            error:
              'Tidak ada perubahan yang dikirim.'
          });

      }


      const updated =
        await sb(
          `site_content?id=eq.${encodeURIComponent(id)}`,
          {
            method:'PATCH',

            headers:{
              Prefer:
                'return=representation'
            },

            body:
              JSON.stringify(
                payload
              )
          }
        );


      if (
        !updated ||
        !updated.length
      ) {

        return res
          .status(404)
          .json({
            error:
              'Content tidak ditemukan.'
          });

      }


      return res
        .status(200)
        .json({
          success:true,

          item:
            normalizeItem(
              updated[0]
            )
        });
    }


    /*
     * =========================
     * DELETE
     * =========================
     *
     * ADMIN ONLY
     */

    if (req.method === 'DELETE') {

      if (!isAdmin(req)) {

        return res
          .status(401)
          .json({
            error:
              'Unauthorized'
          });

      }


      const id =
        toNumber(
          req.query?.id
        );


      if (!id) {

        return res
          .status(400)
          .json({
            error:
              'ID content tidak valid.'
          });

      }


      await sb(
        `site_content?id=eq.${encodeURIComponent(id)}`,
        {
          method:'DELETE'
        }
      );


      return res
        .status(200)
        .json({
          success:true
        });
    }


    return res
      .status(405)
      .json({
        error:
          'Method not allowed'
      });

  } catch (error) {

    console.error(
      'content.js error:',
      error
    );

    return res
      .status(500)
      .json({
        error:
          error?.message ||
          'Gagal memproses content.'
      });
  }
}
