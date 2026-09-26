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

  return text(
    raw[index]
  );

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
    names.map(
      headerKey
    );


  for(
    let i = 0;
    i < headers.length;
    i++
  ){

    const key =
      headerKey(
        headers[i]
      );


    if(
      wanted.includes(key)
    ){
      return text(
        raw[i]
      );
    }

  }


  return '';

}


/* =========================
   DETEKSI NEGARA
========================= */

function deriveCountry(row){

  /*
    Kalau Google Sheets
    sudah punya country,
    gunakan itu.
  */

  const existing =
    text(
      row.country
    );


  if(existing){
    return existing;
  }


  const sheet =
    normalize(
      row.sheetName
    );


  const code =
    text(
      row.code
    ).toUpperCase();


  /*
    Berdasarkan nama sheet
  */

  if(
    sheet.includes('korea')
  ){
    return 'KOREA';
  }


  if(
    sheet.includes('china')
  ){
    return 'CHINA';
  }


  if(
    sheet.includes('jepang')
  ){
    return 'JEPANG';
  }


  if(
    sheet.includes('japan')
  ){
    return 'JEPANG';
  }


  if(
    sheet.includes('thailand')
  ){
    return 'THAILAND';
  }


  if(
    sheet.includes('philiphina')
  ){
    return 'PHILIPPINES';
  }


  if(
    sheet.includes('philippines')
  ){
    return 'PHILIPPINES';
  }


  /*
    Berdasarkan kode order
  */

  if(
    code.startsWith('CH')
  ){
    return 'CHINA';
  }


  if(
    code.startsWith('KR')
  ){
    return 'KOREA';
  }


  if(
    code.startsWith('JP')
  ){
    return 'JEPANG';
  }


  if(
    code.startsWith('TH')
  ){
    return 'THAILAND';
  }


  if(
    code.startsWith('PH')
  ){
    return 'PHILIPPINES';
  }


  /*
    Kalau tidak terdeteksi
  */

  return 'LAINNYA';

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


  /*
    Beberapa sheet menggunakan
    HARGA, bukan PAYMENT / TOTAL.
  */

  const harga =
    findHeaderValue(
      row,
      [
        'HARGA',
        'PRICE'
      ]
    );


  /*
    Urutan:
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
      deriveCountry(
        row
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
      ID unik untuk setiap
      order berdasarkan sheet
      + nomor row.
    */

    orderId:
      `${text(row.sheetName)}:${Number(row.rowNumber || 0)}`

  };

}


/* =========================
   GOOGLE SHEETS BRIDGE
========================= */

async function fetchFromAppsScript(
  name = ''
){

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
    new URL(
      BRIDGE_URL
    );


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
        cache:
          'no-store'
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
   API HANDLER
========================= */

export default async function handler(
  req,
  res
){

  try{

    if(
      req.method !== 'GET'
    ){

      return res
        .status(405)
        .json({
          success:false,
          error:
            'Method tidak diizinkan.'
        });

    }


    const admin =
      isAdmin(
        req
      );


    const name =
      text(
        req.query?.name
      );


    /*
      Customer harus
      mencari berdasarkan nama.

      Admin boleh mengambil
      semua data.
    */

    if(
      !name &&
      !admin
    ){

      return res
        .status(400)
        .json({
          success:false,
          error:
            'Nama customer wajib diisi.'
        });

    }


    const data =
      await fetchFromAppsScript(
        name
      );


    const sourceOrders =
      Array.isArray(
        data.orders
      )
        ? data.orders
        : [];


    /*
      Admin membutuhkan
      informasi lengkap:
      sheet, row, headers,
      columns, raw.

      Customer hanya mendapatkan
      data order yang sudah
      dinormalisasi.
    */

    const orders =
      sourceOrders
        .map(
          row => {

            const order =
              normalizeOrder(
                row
              );


            if(admin){

              return {

                ...order,


                sheetName:
                  text(
                    row.sheetName
                  ),


                rowNumber:
                  Number(
                    row.rowNumber ||
                    0
                  ),


                headerRow:
                  Number(
                    row.headerRow ||
                    1
                  ),


                headers:
                  Array.isArray(
                    row.headers
                  )
                    ? row.headers
                    : [],


                columns:
                  row.columns ||
                  {},


                raw:
                  Array.isArray(
                    row.raw
                  )
                    ? row.raw
                    : []

              };

            }


            return order;

          }
        )
        .filter(
          order =>
            order.name ||
            order.item ||
            order.code
        );


    /*
      Rapikan hasil berdasarkan
      negara.

      Urutan negara:
      CHINA
      KOREA
      JEPANG
      THAILAND
      PHILIPPINES
      LAINNYA
    */

    const countryOrder = [
      'CHINA',
      'KOREA',
      'JEPANG',
      'THAILAND',
      'PHILIPPINES',
      'LAINNYA'
    ];


    orders.sort(
      (a,b) => {

        const countryA =
          countryOrder.indexOf(
            a.country
          );


        const countryB =
          countryOrder.indexOf(
            b.country
          );


        if(
          countryA !== countryB
        ){

          return (
            (countryA === -1
              ? 999
              : countryA)
            -
            (countryB === -1
              ? 999
              : countryB)
          );

        }


        /*
          Kalau negaranya sama,
          row yang lebih besar
          ditaruh lebih atas.
        */

        const rowA =
          Number(
            a.rowNumber ||
            String(
              a.orderId ||
              ''
            )
            .split(':')
            .pop() ||
            0
          );


        const rowB =
          Number(
            b.rowNumber ||
            String(
              b.orderId ||
              ''
            )
            .split(':')
            .pop() ||
            0
          );


        return rowB - rowA;

      }
    );


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
          orders.length,


        orders

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
