import { isAdmin } from './_supabase.js';


const BRIDGE_URL =
  process.env.GOOGLE_SHEETS_BRIDGE_URL;

const BRIDGE_TOKEN =
  process.env.GOOGLE_SHEETS_BRIDGE_TOKEN;


/* =========================
   HELPERS
========================= */

function text(value){

  return String(
    value ?? ''
  ).trim();

}


function normalize(value){

  return text(value)
    .toLowerCase()
    .replace(/\s+/g, ' ');

}


function headerKey(value){

  return normalize(value)
    .replace(
      /[^a-z0-9]/g,
      ''
    );

}


function valueFromColumn(
  row,
  key
){

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


function findHeaderValue(
  row,
  names
){

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
    Kalau data dari Google Sheets
    sudah memiliki country,
    gunakan data tersebut.
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


  /*
    Bersihkan kode order.

    Contoh:

    HCChina268
    HC-China-268
    HC China 268

    semuanya akan dibaca.
  */

  const code =
    text(
      row.code
    )
    .toUpperCase()
    .replace(
      /[^A-Z0-9]/g,
      ''
    );


  /*
    =========================
    BERDASARKAN NAMA SHEET
    =========================
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
    sheet.includes('jepang') ||
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
    sheet.includes('philiphina') ||
    sheet.includes('philippines')
  ){

    return 'PHILIPPINES';

  }


  /*
    =========================
    BERDASARKAN KODE
    =========================
  */


  /*
    HANDCARRY CHINA

    Contoh:

    HCChina268
    HCChina274
    HCChina296
  */

  if(
    code.startsWith('HCCHINA')
  ){

    return 'CHINA';

  }


  /*
    HANDCARRY KOREA
  */

  if(
    code.startsWith('HCKOREA')
  ){

    return 'KOREA';

  }


  /*
    HANDCARRY JAPAN
  */

  if(
    code.startsWith('HCJAPAN')
  ){

    return 'JEPANG';

  }


  /*
    HANDCARRY THAILAND
  */

  if(
    code.startsWith('HCTHAILAND')
  ){

    return 'THAILAND';

  }


  /*
    HANDCARRY PHILIPPINES
  */

  if(
    code.startsWith('HCPHILIPPINES')
  ){

    return 'PHILIPPINES';

  }


  /*
    KODE CHINA
  */

  if(
    code.startsWith('CH')
  ){

    return 'CHINA';

  }


  /*
    KODE KOREA
  */

  if(
    code.startsWith('KR')
  ){

    return 'KOREA';

  }


  /*
    KODE JEPANG
  */

  if(
    code.startsWith('JP')
  ){

    return 'JEPANG';

  }


  /*
    KODE THAILAND
  */

  if(
    code.startsWith('TH')
  ){

    return 'THAILAND';

  }


  /*
    KODE PHILIPPINES
  */

  if(
    code.startsWith('PH')
  ){

    return 'PHILIPPINES';

  }


  /*
    Negara tidak diketahui
  */

  return 'LAINNYA';

}


/* =========================
   NORMALIZE ORDER
========================= */

function normalizeOrder(row){

  /*
    Ambil PAYMENT
  */

  const payment =
    text(
      row.payment ||
      valueFromColumn(
        row,
        'payment'
      )
    );


  /*
    Ambil TOTAL
  */

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
    HARGA / PRICE.
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
    Urutan nilai total:

    TOTAL
    ↓
    PAYMENT
    ↓
    HARGA
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
      ID unik setiap order.

      Contoh:

      JAJAN CHINA:1264

      HANDCARRY:188
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


  /*
    Token hanya dikirim
    dari server Vercel ke
    Apps Script.
  */

  url.searchParams.set(
    'token',
    BRIDGE_TOKEN
  );


  /*
    Kalau ada nama customer,
    kirim ke Apps Script.
  */

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

    /*
      Hanya GET
    */

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


    /*
      Cek apakah user adalah admin
    */

    const admin =
      isAdmin(
        req
      );


    /*
      Ambil nama dari URL

      Contoh:

      /api/orders?name=Monica
    */

    const name =
      text(
        req.query?.name
      );


    /*
      Customer wajib menggunakan
      pencarian nama.

      Admin boleh mengambil
      seluruh data.
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


    /*
      Ambil data dari Google Sheets.
    */

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
      Ubah setiap row Google Sheets
      menjadi format yang dipahami
      website.
    */

    const orders =
      sourceOrders
        .map(
          row => {

            const order =
              normalizeOrder(
                row
              );


            /*
              Admin membutuhkan
              informasi lengkap untuk
              proses edit.
            */

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


            /*
              Customer hanya perlu
              data order biasa.
            */

            return order;

          }
        )
        .filter(
          order =>
            order.name ||
            order.item ||
            order.code
        );


    /* =========================
       URUTAN NEGARA
    ========================= */

    const countryOrder = [

      'CHINA',

      'KOREA',

      'JEPANG',

      'THAILAND',

      'PHILIPPINES',

      'LAINNYA'

    ];


    /*
      Urutkan:

      1. Negara
      2. Row terbaru di atas
    */

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


        /*
          Negara berbeda
        */

        if(
          countryA !== countryB
        ){

          const sortA =
            countryA === -1
              ? 999
              : countryA;


          const sortB =
            countryB === -1
              ? 999
              : countryB;


          return (
            sortA -
            sortB
          );

        }


        /*
          Negara sama.

          Row lebih besar =
          data yang lebih bawah
          di Google Sheets.

          Kita letakkan lebih atas.
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


        return (
          rowB -
          rowA
        );

      }
    );


    /*
      =========================
      RESPONSE
      =========================
    */

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
