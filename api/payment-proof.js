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

function sortNewest(rows) {
  return [...(rows || [])].sort(
    (a, b) =>
      new Date(b.created_at || 0) -
      new Date(a.created_at || 0)
  );
}

async function getSubmissions(query = '') {
  return await sb(
    `payment_submissions?select=*${query}`,
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
     * Admin:
     * GET /api/payment-proof
     * -> semua submission
     *
     * Customer:
     * GET /api/payment-proof?batch_id=...&customer_index=...
     * -> hanya submission milik customer tersebut
     */

    if (req.method === 'GET') {

      const batchId =
        clean(
          req.query?.batch_id
        );

      const customerIndex =
        clean(
          req.query?.customer_index
        );


      /*
       * Admin dapat melihat
       * semua submission.
       */
      if (isAdmin(req)) {

        const rows =
          await getSubmissions(
            '&order=created_at.desc'
          );

        return res
          .status(200)
          .json({
            submissions:
              sortNewest(rows)
          });
      }


      /*
       * Customer wajib
       * menyertakan batch dan index.
       */
      if (
        !batchId ||
        customerIndex === ''
      ) {

        return res
          .status(400)
          .json({
            error:
              'batch_id dan customer_index wajib diisi.'
          });
      }


      const rows =
        await getSubmissions(
          `&batch_id=eq.${encodeURIComponent(batchId)}` +
          `&customer_index=eq.${encodeURIComponent(customerIndex)}` +
          `&order=created_at.desc`
        );


      return res
        .status(200)
        .json({
          submissions:
            sortNewest(rows)
        });
    }


    /*
     * =========================
     * POST
     * =========================
     *
     * Ada dua action:
     *
     * upload-url
     * submit
     */


    if (req.method === 'POST') {

      const body =
        parseBody(req);

      const action =
        clean(body.action);


      /*
       * -------------------------
       * 1. UPLOAD URL
       * -------------------------
       *
       * Customer tidak boleh
       * mengakses Supabase secret.
       *
       * Backend membuat signed
       * upload URL.
       */

      if (
        action ===
        'upload-url'
      ) {

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


        const safeName =
          filename
            .replace(
              /[^a-zA-Z0-9._-]/g,
              '_'
            );


        const path =
          `payment-proof/${Date.now()}_${safeName}`;


        const upload =
          await sb(
            `storage/v1/object/upload/sign/go2408room-files/${encodeURIComponent(path)}`,
            {
              method: 'POST'
            }
          );


        /*
         * Beberapa versi Supabase
         * mengembalikan signedURL,
         * sementara implementasi tertentu
         * mengembalikan signedUrl.
         */

        const signedUrl =
          upload?.signedURL ||
          upload?.signedUrl ||
          upload?.signed_url;


        if (!signedUrl) {

          throw new Error(
            'Supabase tidak mengembalikan signed upload URL.'
          );

        }


        return res
          .status(200)
          .json({
            path,

            signedUrl:
              signedUrl.startsWith('http')
                ? signedUrl
                : `${process.env.SUPABASE_URL}${signedUrl}`
          });
      }


      /*
       * -------------------------
       * 2. SUBMIT PROOF
       * -------------------------
       */

      if (
        action ===
        'submit'
      ) {

        const batchId =
          toNumber(
            body.batch_id
          );

        const customerIndex =
          toNumber(
            body.customer_index
          );

        const customerName =
          clean(
            body.customer_name
          );

        const proofPath =
          clean(
            body.proof_path
          );


        if (!batchId) {

          return res
            .status(400)
            .json({
              error:
                'batch_id tidak valid.'
            });

        }


        if (
          customerIndex < 0
        ) {

          return res
            .status(400)
            .json({
              error:
                'customer_index tidak valid.'
            });

        }


        if (!customerName) {

          return res
            .status(400)
            .json({
              error:
                'Nama customer wajib diisi.'
            });

        }


        if (!proofPath) {

          return res
            .status(400)
            .json({
              error:
                'Bukti pembayaran wajib diupload.'
            });

        }


        /*
         * Pastikan customer benar-benar
         * ada dalam batch tersebut.
         */
        const batches =
          await sb(
            `payment_batches?id=eq.${encodeURIComponent(batchId)}&select=id,customers,service,batch,batch_name`,
            {
              method:'GET'
            }
          );


        const batch =
          batches?.[0];


        if (!batch) {

          return res
            .status(404)
            .json({
              error:
                'Payment Batch tidak ditemukan.'
            });

        }


        let customers =
          batch.customers;


        if (
          typeof customers ===
          'string'
        ) {

          try {
            customers =
              JSON.parse(
                customers
              );
          } catch {
            customers = [];
          }

        }


        if (
          !Array.isArray(customers)
        ) {

          customers = [];

        }


        const customer =
          customers[
            customerIndex
          ];


        if (!customer) {

          return res
            .status(404)
            .json({
              error:
                'Customer tidak ditemukan dalam batch.'
            });

        }


        /*
         * Untuk keamanan tambahan,
         * nama yang dikirim customer
         * harus cocok dengan database.
         */
        if (
          clean(customer.name)
            .toLowerCase() !==
          customerName
            .toLowerCase()
        ) {

          return res
            .status(400)
            .json({
              error:
                'Nama customer tidak cocok dengan batch.'
            });

        }


        /*
         * Jangan membuat submission
         * baru bila masih ada
         * submission pending.
         *
         * Jadi customer tidak bisa
         * spam upload berkali-kali.
         */
        const existing =
          await sb(
            `payment_submissions?batch_id=eq.${encodeURIComponent(batchId)}` +
            `&customer_index=eq.${encodeURIComponent(customerIndex)}` +
            `&order=created_at.desc`,
            {
              method:'GET'
            }
          );


        const latest =
          existing?.[0];


        if (
          latest &&
          latest.status ===
          'pending'
        ) {

          return res
            .status(409)
            .json({
              error:
                'Bukti pembayaran sebelumnya masih menunggu verifikasi admin.',
              submission:
                latest
            });

        }


        /*
         * ID dibuat sendiri agar
         * tidak bergantung sequence.
         */
        const id =
          Date.now();


        const inserted =
          await sb(
            'payment_submissions',
            {
              method:'POST',

              headers:{
                Prefer:
                  'return=representation'
              },

              body:JSON.stringify({

                id,

                batch_id:
                  batchId,

                customer_index:
                  customerIndex,

                customer_name:
                  customerName,

                proof_path:
                  proofPath,

                status:
                  'pending',

                note:
                  '',

                created_at:
                  new Date()
                    .toISOString(),

                verified_at:
                  null

              })
            }
          );


        return res
          .status(200)
          .json({
            success:true,

            submission:
              Array.isArray(
                inserted
              )
                ? inserted[0]
                : inserted
          });
      }


      return res
        .status(400)
        .json({
          error:
            'Action tidak dikenal.'
        });
    }


    /*
     * =========================
     * PATCH
     * =========================
     *
     * Hanya ADMIN.
     *
     * status:
     * pending
     * approved
     * rejected
     */

    if (
      req.method ===
      'PATCH'
    ) {

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
        toNumber(
          body.id
        );

      const status =
        clean(
          body.status
        ).toLowerCase();

      const note =
        clean(
          body.note
        );


      if (!id) {

        return res
          .status(400)
          .json({
            error:
              'ID submission tidak valid.'
          });

      }


      if (
        ![
          'pending',
          'approved',
          'rejected'
        ].includes(status)
      ) {

        return res
          .status(400)
          .json({
            error:
              'Status pembayaran tidak valid.'
          });

      }


      const payload = {

        status,

        note,

        verified_at:
          status ===
          'pending'

            ? null

            : new Date()
                .toISOString()

      };


      const updated =
        await sb(
          `payment_submissions?id=eq.${encodeURIComponent(id)}`,
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
              'Submission pembayaran tidak ditemukan.'
          });

      }


      /*
       * Jika approved,
       * update status customer
       * di payment_batches juga.
       *
       * Jadi Admin/customer akan
       * mengetahui bahwa pembayaran
       * berhasil.
       */

      const submission =
        updated[0];


      try {

        const batchRows =
          await sb(
            `payment_batches?id=eq.${encodeURIComponent(submission.batch_id)}&select=*`,
            {
              method:'GET'
            }
          );


        const batch =
          batchRows?.[0];


        if (batch) {

          let customers =
            batch.customers;


          if (
            typeof customers ===
            'string'
          ) {

            try {

              customers =
                JSON.parse(
                  customers
                );

            } catch {

              customers = [];

            }

          }


          if (
            Array.isArray(
              customers
            ) &&
            customers[
              submission.customer_index
            ]
          ) {

            customers[
              submission.customer_index
            ].paymentStatus =
              status === 'approved'
                ? 'Pembayaran Berhasil'
                : status === 'rejected'
                  ? 'Pembayaran Ditolak'
                  : 'Menunggu Verifikasi';


            await sb(
              `payment_batches?id=eq.${encodeURIComponent(submission.batch_id)}`,
              {
                method:'PATCH',

                headers:{
                  Prefer:
                    'return=minimal'
                },

                body:
                  JSON.stringify({
                    customers
                  })
              }
            );

          }

        }

      } catch (error) {

        /*
         * Jangan membuat proses verifikasi
         * gagal hanya karena sinkronisasi
         * status batch.
         */
        console.warn(
          'Batch customer status sync failed:',
          error
        );

      }


      return res
        .status(200)
        .json({
          success:true,

          submission
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
      'payment-proof.js error:',
      error
    );

    return res
      .status(500)
      .json({
        error:
          error?.message ||
          'Gagal memproses pembayaran.'
      });
  }
}
