import { isAdmin } from './_supabase.js';

const BRIDGE_URL =
  process.env.GOOGLE_SHEETS_BRIDGE_URL;

const BRIDGE_TOKEN =
  process.env.GOOGLE_SHEETS_BRIDGE_TOKEN;


/* =========================
   HELPERS
========================= */

function text(value){
  return String(value ?? '').trim();
}


function normalize(value){
  return text(value)
    .toLowerCase()
    .replace(/\s+/g, ' ');
}


function headerKey(value){
  return normalize(value)
    .replace(/[^a-z0-9]/g, '');
}


function valueFromColumn(row, key){
  const columns =
    row.columns || {};

  const raw =
    Array.isArray(row.raw)
      ? row.raw
      : [];

  const index =
    columns[key];

  if(
    index === undefined ||
    index === null
  ){
    return '';
  }

  return text(raw[index]);
}


function findHeaderValue(row, names){
  const headers =
    Array.isArray(row.headers)
      ? row.headers
      : [];

  const raw =
    Array.isArray(row.raw)
      ? row.raw
      : [];

  const wanted =
    names.map(headerKey);

  for(let i = 0; i < headers.length; i++){

    const key =
      headerKey(headers[i]);

    if(wanted.includes(key)){
      return text(raw[i]);
    }

  }

  return '';
}


/* =========================
   GOOGLE SHEETS BRIDGE
========================= */

async function fetchFromAppsScript(name = ''){

  if(!BRIDGE_URL){
    throw Error(
      'GOOGLE_SHEETS_BRIDGE_URL belum tersedia.'
    );
  }

  if(!BRIDGE_TOKEN){
    throw Error(
      'GOOGLE_SHEETS_BRIDGE_TOKEN belum tersedia.'
    );
  }


  const url =
    new URL(BRIDGE_URL);

  url.searchParams.set(
    'token',
    BRIDGE_TOKEN
  );


  if(name){
    url.searchParams.set(
      'name',
      name
    );
  }


  const response =
    await fetch(
      url.toString(),
      {
        cache:'no-store'
      }
    );


  const data =
    await response
      .json()
      .catch(
        () => null
      );


  if(!response.ok){
    throw Error(
      data?.error ||
      'Google Sheets bridge gagal.'
    );
  }


  if(!data?.success){
    throw Error(
      data?.error ||
      'Google Sheets tidak mengembalikan data.'
    );
  }


  return data;
}


/* =========================
   NORMALIZE ORDER
========================= */

function normalizeOrder(row){

  const payment =
    text(
      row.payment ||
      valueFromColumn(
        row,
        'payment'
      )
    );


  const explicitTotal =
    text(
      row.total ||
      valueFromColumn(
        row,
        'total'
      )
    );


  const harga =
    findHeaderValue(
      row,
      [
        'HARGA',
        'PRICE'
      ]
    );


  /*
    Untuk sheet lama:
    PAYMENT ada,
    TOTAL ada / tidak ada.

    Untuk sheet seperti HANDCARRY:
    hanya ada HARGA.

    Jadi total website akan memakai:
    TOTAL → PAYMENT → HARGA
  */

  const total =
    explicitTotal ||
    payment ||
    harga;


  return {

    name:
      text(
        row.name ||
        valueFromColumn(
          row,
          'name'
        )
      ),


    item:
      text(
        row.item ||
        valueFromColumn(
          row,
          'item'
        )
      ),


    country:
      text(
        row.country ||
        valueFromColumn(
          row,
          'country'
        )
      ),


    group:
      text(
        row.group ||
        valueFromColumn(
          row,
          'group'
        )
      ),


    code:
      text(
        row.code ||
        valueFromColumn(
          row,
          'code'
        )
      ),


    update:
      text(
        row.update ||
        valueFromColumn(
          row,
          'update'
        )
      ),


    payment,


    total,


    paymentDue:
      text(
        row.paymentDue ||
        valueFromColumn(
          row,
          'paymentDue'
        )
      ),


    detail:
      text(
        row.detail ||
        valueFromColumn(
          row,
          'detail'
        )
      ),


    /*
      ID unik per baris.
      Penting karena sekarang
      banyak sheet memiliki
      nomor row yang sama.
    */

    orderId:
      `${text(row.sheetName)}:${Number(row.rowNumber || 0)}`


  };

}


/* =========================
   HANDLER
========================= */

export default async function handler(
  req,
  res
){

  try{

    if(req.method !== 'GET'){
      return res
        .status(405)
        .json({
          success:false,
          error:'Method tidak diizinkan.'
        });
    }


    const admin =
      isAdmin(req);


    const name =
      text(
        req.query?.name
      );


    /*
      Customer WAJIB mencari
      berdasarkan nama.

      Hanya admin yang boleh
      meminta semua order.
    */

    if(!name && !admin){

      return res
        .status(400)
        .json({
          success:false,
          error:'Nama customer wajib diisi.'
        });

    }


    const data =
      await fetchFromAppsScript(
        name
      );


    const sourceOrders =
      Array.isArray(data.orders)
        ? data.orders
        : [];


    const orders =
      sourceOrders
        .map(
          normalizeOrder
        )
        .filter(
          order =>
            order.name ||
            order.item ||
            order.code
        );


    /*
      Untuk keamanan:
      customer tidak perlu melihat
      raw Google Sheets / struktur sheet.

      Admin boleh melihat semuanya
      karena dipakai untuk edit.
    */

    const resultOrders =
      admin
        ? sourceOrders
            .map(
              (row) => ({
                ...normalizeOrder(row),

                sheetName:
                  text(
                    row.sheetName
                  ),

                rowNumber:
                  Number(
                    row.rowNumber || 0
                  ),

                headerRow:
                  Number(
                    row.headerRow || 1
                  ),

                headers:
                  Array.isArray(
                    row.headers
                  )
                    ? row.headers
                    : [],

                columns:
                  row.columns || {},

                raw:
                  Array.isArray(
                    row.raw
                  )
                    ? row.raw
                    : []

              })
            )
            .filter(
              order =>
                order.name ||
                order.item ||
                order.code
            )

        : orders;


    return res
      .status(200)
      .json({

        success:true,

        spreadsheetName:
          text(
            data.spreadsheetName
          ),

        search:
          name,

        totalOrders:
          resultOrders.length,

        orders:
          resultOrders

      });


  }catch(error){

    console.error(
      'API ORDERS ERROR:',
      error
    );


    return res
      .status(500)
      .json({

        success:false,

        error:
          error?.message ||
          'Gagal mengambil data order.'

      });

  }

}
