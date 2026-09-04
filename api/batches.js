import { sb, isAdmin } from './_supabase.js';

function clean(value) {
  return String(value ?? '').trim();
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeCustomer(customer, index = 0) {
  return {
    index,

    name: clean(customer?.name),

    items: clean(
      customer?.items ??
      customer?.item ??
      customer?.order
    ),

    total: toNumber(
      customer?.total ??
      customer?.amount ??
      0
    ),

    paymentStatus:
      clean(
        customer?.paymentStatus
      ) || 'Belum Bayar'
  };
}

function normalizeBatch(row) {
  let customers = [];

  try {
    if (Array.isArray(row.customers)) {
      customers = row.customers;
    } else if (typeof row.customers === 'string') {
      customers = JSON.parse(row.customers);
    }
  } catch {
    customers = [];
  }

  return {
    id: row.id,

    service:
      clean(row.service),

    batch:
      clean(row.batch),

    batch_name:
      clean(
        row.batch_name ||
        row.batch
      ),

    batch_photo:
      clean(row.batch_photo),

    qris:
      clean(row.qris),

    customers:
      customers.map(
        (customer, index) =>
          normalizeCustomer(
            customer,
            index
          )
      ),

    created_at:
      row.created_at
  };
}

async function getBatches() {
  const rows =
    await sb(
      'payment_batches?select=*&order=created_at.desc',
      {
        method: 'GET'
      }
    );

  return (
    rows || []
  ).map(normalizeBatch);
}

function parseBody(req) {
  if (!req.body) {
    return {};
  }

  if (typeof req.body === 'object') {
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

export default async function handler(req, res) {
  try {

    /*
     * =========================
     * GET
     * Customer + Admin
     * =========================
     */
    if (req.method === 'GET') {

      const batches =
        await getBatches();

      return res
        .status(200)
        .json({
          batches
        });
    }


    /*
     * =========================
     * POST
     * ADMIN ONLY
     * =========================
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

      const batchName =
        clean(
          body.batch_name ||
          body.batch ||
          body.batchName
        );

      const batchPhoto =
        clean(
          body.batch_photo ||
          body.batchPhoto
        );

      const qris =
        clean(body.qris);

      if (!service) {
        return res
          .status(400)
          .json({
            error:
              'Service wajib diisi.'
          });
      }

      if (!batchName) {
        return res
          .status(400)
          .json({
            error:
              'Nama batch wajib diisi.'
          });
      }

      let customers =
        Array.isArray(
          body.customers
        )
          ? body.customers
          : [];

      customers =
        customers
          .map(
            (customer, index) =>
              normalizeCustomer(
                customer,
                index
              )
          )
          .filter(
            customer =>
              customer.name ||
              customer.items
          );

      if (!customers.length) {
        return res
          .status(400)
          .json({
            error:
              'Minimal harus ada 1 customer.'
          });
      }

      const payload = {
        id,

        service,

        batch:
          batchName,

        batch_name:
          batchName,

        batch_photo:
          batchPhoto || null,

        qris:
          qris || null,

        customers,

        created_at:
          new Date()
          .toISOString()
      };


      /*
       * Upsert digunakan supaya
       * batch dengan ID yang sama
       * dapat diperbarui.
       */
      const saved =
        await sb(
          'payment_batches?on_conflict=id',
          {
            method: 'POST',

            headers: {
              Prefer:
                'resolution=merge-duplicates'
            },

            body: JSON.stringify(
              payload
            )
          }
        );


      return res
        .status(200)
        .json({
          success: true,

          batch:
            Array.isArray(saved)
              ? normalizeBatch(
                  saved[0]
                )
              : normalizeBatch(
                  payload
                )
        });
    }


    /*
     * =========================
     * DELETE
     * ADMIN ONLY
     * =========================
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
              'ID batch tidak valid.'
          });
      }

      await sb(
        `payment_batches?id=eq.${encodeURIComponent(id)}`,
        {
          method: 'DELETE'
        }
      );


      /*
       * Hapus submission pembayaran
       * yang terkait batch.
       */
      try {

        await sb(
          `payment_submissions?batch_id=eq.${encodeURIComponent(id)}`,
          {
            method: 'DELETE'
          }
        );

      } catch (error) {

        console.warn(
          'payment_submissions cleanup failed:',
          error
        );

      }


      return res
        .status(200)
        .json({
          success: true
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
      'batches.js error:',
      error
    );

    return res
      .status(500)
      .json({
        error:
          error?.message ||
          'Gagal memproses payment batch.'
      });
  }
}
