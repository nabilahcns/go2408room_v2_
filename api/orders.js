import { sb, isAdmin } from './_supabase.js';

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

function headerKey(value) {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"' && quoted && next === '"') {
      cell += '"';
      i++;
      continue;
    }

    if (ch === '"') {
      quoted = !quoted;
      continue;
    }

    if (ch === ',' && !quoted) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && next === '\n') {
        i++;
      }

      row.push(cell);
      cell = '';

      if (row.some(value => clean(value) !== '')) {
        rows.push(row);
      }

      row = [];
      continue;
    }

    cell += ch;
  }

  if (cell !== '' || row.length) {
    row.push(cell);

    if (row.some(value => clean(value) !== '')) {
      rows.push(row);
    }
  }

  return rows;
}

function findHeaderIndex(headers, patterns) {
  const keys = headers.map(headerKey);

  return keys.findIndex(key =>
    patterns.some(pattern => key === pattern || key.includes(pattern))
  );
}

function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 50); i++) {
    const keys = rows[i].map(headerKey);

    const hasName = keys.some(
      key =>
        key === 'nama' ||
        key.includes('nama customer') ||
        key === 'customer name' ||
        key === 'name'
    );

    const hasItem = keys.some(
      key =>
        key.includes('list barang') ||
        key === 'barang' ||
        key.includes('item') ||
        key.includes('jajanan')
    );

    if (hasName && hasItem) {
      return i;
    }
  }

  return 0;
}

function buildMapping(headers) {
  return {
    name: findHeaderIndex(headers, [
      'nama',
      'nama customer',
      'customer name',
      'name'
    ]),

    item: findHeaderIndex(headers, [
      'list barang',
      'barang',
      'item',
      'jajanan',
      'order'
    ]),

    country: findHeaderIndex(headers, [
      'negara',
      'country'
    ]),

    group: findHeaderIndex(headers, [
      'grup order',
      'group order',
      'grup',
      'group'
    ]),

    code: findHeaderIndex(headers, [
      'kode',
      'code'
    ]),

    payment: findHeaderIndex(headers, [
      'update payment ems ac tax',
      'update payment',
      'ems ac tax',
      'payment'
    ]),

    total: findHeaderIndex(headers, [
      'total payment due',
      'payment due',
      'total due'
    ]),

    detail: findHeaderIndex(headers, [
      'detail',
      'catatan',
      'notes',
      'note'
    ])
  };
}

function valueAt(row, index) {
  if (index < 0) {
    return '';
  }

  return clean(row[index]);
}

function parseSheet(rows) {
  const headerRowIndex = findHeaderRow(rows);
  const headers = rows[headerRowIndex] || [];
  const columns = buildMapping(headers);

  const dataRows = rows.slice(headerRowIndex + 1);

  const orders = dataRows
    .map((raw, offset) => {
      const rowNumber = headerRowIndex + offset + 2;

      return {
        rowNumber,
        raw,

        name: valueAt(raw, columns.name),

        item: valueAt(raw, columns.item),

        country: valueAt(raw, columns.country),

        group: valueAt(raw, columns.group),

        code: valueAt(raw, columns.code),

        update: valueAt(raw, columns.payment),

        payment: valueAt(raw, columns.payment),

        total: valueAt(raw, columns.total),

        paymentDue: valueAt(raw, columns.total),

        detail: valueAt(raw, columns.detail)
      };
    })
    .filter(order =>
      order.name ||
      order.item ||
      order.code
    );

  return {
    headerRowIndex,
    headers,
    columns,
    orders
  };
}

async function loadGoogleSheet() {
  const csvUrl =
    process.env.GOOGLE_SHEET_CSV_URL ||
    'https://docs.google.com/spreadsheets/d/1FTVHM7QCfFWOnMIbO56eEBOjpH3uSQBd/export?format=csv&gid=734773841';

  const response = await fetch(csvUrl, {
    headers: {
      'Cache-Control': 'no-cache'
    }
  });

  if (!response.ok) {
    throw new Error(
      'Google Sheets tidak bisa dibaca. Pastikan spreadsheet dapat diakses.'
    );
  }

  const text = await response.text();

  if (!text.trim()) {
    throw new Error(
      'Google Sheets mengembalikan data kosong.'
    );
  }

  return parseSheet(
    parseCsv(text)
  );
}

async function loadOrderUpdates() {
  try {
    const updates = await sb(
      'order_updates?select=*&order=updated_at.desc',
      {
        method: 'GET'
      }
    );

    return updates || [];
  } catch {
    return [];
  }
}

function mergeWebsiteStatus(orders, updates) {
  const updateMap = new Map();

  for (const update of updates) {
    const rowNumber =
      Number(update.row_number);

    if (!rowNumber) {
      continue;
    }

    if (!updateMap.has(rowNumber)) {
      updateMap.set(rowNumber, update);
    }
  }

  return orders.map(order => {
    const update =
      updateMap.get(
        Number(order.rowNumber)
      );

    return {
      ...order,

      status:
        update?.status || '',

      statusNote:
        update?.note || '',

      statusPhoto:
        update?.photo || '',

      statusUpdatedAt:
        update?.updated_at || ''
    };
  });
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res
        .status(405)
        .json({
          error: 'Method not allowed'
        });
    }

    const searchName =
      clean(req.query?.name);

    /*
     * Customer hanya boleh mencari berdasarkan nama.
     * Admin boleh meminta seluruh database.
     */
    if (!searchName && !isAdmin(req)) {
      return res
        .status(401)
        .json({
          error:
            'Silakan login sebagai admin untuk melihat seluruh database order.'
        });
    }

    const parsed =
      await loadGoogleSheet();

    let orders =
      parsed.orders;

    if (searchName) {
      const keyword =
        normalize(searchName);

      orders =
        orders.filter(order =>
          normalize(order.name)
            .includes(keyword)
        );
    }

    const updates =
      await loadOrderUpdates();

    orders =
      mergeWebsiteStatus(
        orders,
        updates
      );

    return res
      .status(200)
      .json({
        orders,

        headers:
          parsed.headers,

        headerRow:
          parsed.headerRowIndex + 1,

        columns:
          parsed.columns,

        sheetName:
          process.env.GOOGLE_SHEETS_SHEET_NAME ||
          'REKAPAN',

        sheetEditUrl:
          process.env.GOOGLE_SHEET_EDIT_URL ||
          'https://docs.google.com/spreadsheets/d/1FTVHM7QCfFWOnMIbO56eEBOjpH3uSQBd/edit?gid=734773841'
      });

  } catch (error) {

    console.error(
      'orders.js error:',
      error
    );

    return res
      .status(500)
      .json({
        error:
          error?.message ||
          'Gagal mengambil data order.'
      });
  }
}
