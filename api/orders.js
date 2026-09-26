import { isAdmin } from './_supabase.js';


function clean(value) {
  return String(value ?? '').trim();
}


function normalize(value) {
  return clean(value)
    .toLowerCase()
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}


async function fetchFromAppsScript(
  name = ''
) {

  const bridgeUrl =
    clean(
      process.env.GOOGLE_SHEETS_BRIDGE_URL
    );

  const token =
    clean(
      process.env.GOOGLE_SHEETS_BRIDGE_TOKEN
    );


  if (
    !bridgeUrl ||
    !token
  ) {

    throw new Error(
      'Koneksi data order sedang tidak tersedia.'
    );

  }


  const url =
    new URL(
      bridgeUrl
    );


  url.searchParams.set(
    'token',
    token
  );


  if (name) {

    url.searchParams.set(
      'name',
      name
    );

  }


  const response =
    await fetch(
      url.toString(),
      {
        method:'GET',

        redirect:'follow',

        headers:{
          Accept:
            'application/json',

          'Cache-Control':
            'no-cache'
        },

        cache:
          'no-store'
      }
    );


  const text =
    await response.text();


  let data = null;


  try {

    data =
      text
        ? JSON.parse(text)
        : null;

  } catch {

    throw new Error(
      'Data Google Sheets tidak dapat dibaca.'
    );

  }


  if (
    !response.ok
  ) {

    throw new Error(
      'Data Google Sheets sedang tidak tersedia.'
    );

  }


  if (
    !data?.success
  ) {

    /*
     * Jangan bocorkan error teknis
     * Apps Script ke customer.
     */

    throw new Error(
      'Data order sedang tidak tersedia.'
    );

  }


  return data;

}


function normalizeOrder(
  row
) {

  return {

    rowNumber:
      Number(
        row.rowNumber || 0
      ),

    raw:
      Array.isArray(row.raw)
        ? row.raw
        : [],

    name:
      clean(row.name),

    item:
      clean(row.item),

    country:
      clean(row.country),

    group:
      clean(row.group),

    code:
      clean(row.code),

    update:
      clean(row.update),

    payment:
      clean(row.payment),

    total:
      clean(row.total),

    paymentDue:
      clean(row.paymentDue),

    detail:
      clean(row.detail),

    /*
     * Status website nanti datang
     * dari database order_updates.
     *
     * Untuk sementara default kosong.
     */
    status:
      clean(row.status),

    statusNote:
      clean(row.statusNote),

    statusPhoto:
      clean(row.statusPhoto),

    statusUpdatedAt:
      clean(row.statusUpdatedAt)

  };

}


async function loadWebsiteStatuses(
  orders
) {

  try {

    /*
     * Status website disimpan terpisah
     * dari Google Sheets.
     *
     * Kita coba ambil endpoint status
     * untuk setiap row.
     *
     * Kalau endpoint belum tersedia,
     * order tetap bisa ditampilkan.
     */

    const result =
      await Promise.all(
        orders.map(
          async order => {

            try {

              const response =
                await fetch(
                  `/api/order-updates?row_number=${encodeURIComponent(
                    order.rowNumber
                  )}`,
                  {
                    method:'GET',
                    cache:'no-store'
                  }
                );


              if (
                !response.ok
              ) {

                return order;

              }


              const data =
                await response.json();


              const latest =
                data
                  ?.items
                  ?.[0];


              if (!latest) {

                return order;

              }


              return {

                ...order,

                status:
                  clean(
                    latest.status
                  ),

                statusNote:
                  clean(
                    latest.note
                  ),

                statusPhoto:
                  clean(
                    latest.photo
                  ),

                statusUpdatedAt:
                  clean(
                    latest.updated_at
                  )

              };

            } catch {

              return order;

            }

          }
        )
      );


    return result;

  } catch {

    return orders;

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


    const searchName =
      clean(
        req.query?.name
      );


    /*
     * CUSTOMER
     *
     * Customer wajib mencari
     * berdasarkan nama.
     *
     * Customer tidak boleh meminta
     * seluruh database.
     */

    if (
      !searchName &&
      !isAdmin(req)
    ) {

      return res
        .status(401)
        .json({
          error:
            'Masukkan nama customer terlebih dahulu.'
        });

    }


    /*
     * ADMIN:
     * boleh mengambil seluruh data.
     *
     * CUSTOMER:
     * hanya data nama yang dicari.
     */

    const sheetData =
      await fetchFromAppsScript(
        searchName
      );


    let orders =
      Array.isArray(
        sheetData.rows
      )
        ? sheetData.rows.map(
            normalizeOrder
          )
        : [];


    /*
     * Double check pencarian
     * di backend.
     */

    if (searchName) {

      const keyword =
        normalize(
          searchName
        );


      orders =
        orders.filter(
          order =>
            normalize(
              order.name
            ).includes(
              keyword
            )
        );

    }


    /*
     * Ambil status website
     * dari database terpisah.
     */

    orders =
      await attachStatuses(
        orders
      );


    return res
      .status(200)
      .json({

        success:true,

        orders,

        headers:
          sheetData.headers || [],

        headerRow:
          sheetData.headerRow || 1,

        columns:
          sheetData.columns || {},

        sheetName:
          sheetData.sheetName ||
          'REKAPAN',

        sheetEditUrl:
          process.env.GOOGLE_SHEET_EDIT_URL ||
          ''

      });


  } catch (error) {

    console.error(
      'orders.js error:',
      error
    );


    /*
     * Jangan berikan error teknis
     * ke customer.
     *
     * Admin tetap mendapat pesan
     * yang cukup jelas tanpa
     * membocorkan credential.
     */

    return res
      .status(500)
      .json({
        error:
          'Data order sedang tidak tersedia. Silakan coba lagi beberapa saat lagi.'
      });

  }

}


/*
 * =========================================================
 * ATTACH STATUS
 * =========================================================
 *
 * Versi yang aman dan tidak bergantung
 * pada browser localStorage.
 */

async function attachStatuses(
  orders
) {

  /*
   * Endpoint order-updates membaca
   * database Supabase.
   *
   * Karena orders.js dipanggil
   * server-side, kita tidak dapat
   * mengandalkan browser session.
   *
   * Maka untuk sementara status
   * dikosongkan jika database status
   * tidak bisa diakses.
   */

  try {

    const base =
      process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'http://localhost:3000';


    const response =
      await fetch(
        `${base}/api/order-updates`,
        {
          method:'GET',

          headers:{
            Cookie:
              ''
          },

          cache:'no-store'
        }
      );


    /*
     * Endpoint order-updates versi kita
     * membutuhkan admin untuk seluruh data.
     *
     * Karena request ini berasal dari
     * server-side dan belum membawa
     * session Admin, kita tidak memaksa
     * mengambil seluruh status.
     */

    if (
      !response.ok
    ) {

      return orders;

    }


    const data =
      await response.json();


    const updates =
      Array.isArray(
        data.items
      )
        ? data.items
        : [];


    const latestMap =
      new Map();


    for (
      const update
      of updates
    ) {

      const row =
        Number(
          update.row_number
        );


      if (!row) {
        continue;
      }


      if (
        !latestMap.has(row)
      ) {

        latestMap.set(
          row,
          update
        );

      }

    }


    return orders.map(
      order => {

        const update =
          latestMap.get(
            Number(
              order.rowNumber
            )
          );


        if (!update) {
          return order;
        }


        return {

          ...order,

          status:
            clean(
              update.status
            ),

          statusNote:
            clean(
              update.note
            ),

          statusPhoto:
            clean(
              update.photo
            ),

          statusUpdatedAt:
            clean(
              update.updated_at
            )

        };

      }
    );

  } catch {

    return orders;

  }

}
