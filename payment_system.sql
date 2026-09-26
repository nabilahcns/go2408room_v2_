-- =========================================================
-- GO2408ROOM DATABASE
-- FINAL SETUP
-- =========================================================

-- =========================================================
-- 1. PAYMENT BATCH
-- =========================================================

create table if not exists payment_batches (
  id bigint primary key,
  service text,
  batch text,
  batch_name text,
  batch_photo text,
  qris text,
  customers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);


alter table payment_batches
  add column if not exists service text;

alter table payment_batches
  add column if not exists batch text;

alter table payment_batches
  add column if not exists batch_name text;

alter table payment_batches
  add column if not exists batch_photo text;

alter table payment_batches
  add column if not exists qris text;

alter table payment_batches
  add column if not exists customers jsonb;

alter table payment_batches
  add column if not exists created_at timestamptz;


update payment_batches
set
  batch =
    coalesce(
      nullif(batch, ''),
      batch_name
    ),

  batch_name =
    coalesce(
      nullif(batch_name, ''),
      batch
    ),

  customers =
    coalesce(
      customers,
      '[]'::jsonb
    ),

  created_at =
    coalesce(
      created_at,
      now()
    );


alter table payment_batches
  alter column customers
  set default '[]'::jsonb;


-- =========================================================
-- 2. PAYMENT SUBMISSIONS
-- =========================================================

create table if not exists payment_submissions (
  id bigint primary key,
  batch_id bigint,
  customer_index integer,
  customer_name text,
  proof_path text,
  status text default 'pending',
  note text default '',
  created_at timestamptz default now(),
  verified_at timestamptz
);


alter table payment_submissions
  add column if not exists batch_id bigint;

alter table payment_submissions
  add column if not exists customer_index integer;

alter table payment_submissions
  add column if not exists customer_name text;

alter table payment_submissions
  add column if not exists proof_path text;

alter table payment_submissions
  add column if not exists status text;

alter table payment_submissions
  add column if not exists note text;

alter table payment_submissions
  add column if not exists created_at timestamptz;

alter table payment_submissions
  add column if not exists verified_at timestamptz;


update payment_submissions
set
  status =
    coalesce(
      nullif(status, ''),
      'pending'
    ),

  note =
    coalesce(
      note,
      ''
    ),

  created_at =
    coalesce(
      created_at,
      now()
    );


-- =========================================================
-- 3. SITE CONTENT
-- =========================================================

create table if not exists site_content (
  id bigint primary key,
  service text default '',
  type text not null,
  title text default '',
  note text default '',
  url text default '',
  date text default '',
  venue text default '',
  photo text default '',
  data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);


alter table site_content
  add column if not exists service text;

alter table site_content
  add column if not exists type text;

alter table site_content
  add column if not exists title text;

alter table site_content
  add column if not exists note text;

alter table site_content
  add column if not exists url text;

alter table site_content
  add column if not exists date text;

alter table site_content
  add column if not exists venue text;

alter table site_content
  add column if not exists photo text;

alter table site_content
  add column if not exists data jsonb;

alter table site_content
  add column if not exists created_at timestamptz;


update site_content
set
  service =
    coalesce(
      service,
      ''
    ),

  title =
    coalesce(
      title,
      ''
    ),

  note =
    coalesce(
      note,
      ''
    ),

  url =
    coalesce(
      url,
      ''
    ),

  date =
    coalesce(
      date,
      ''
    ),

  venue =
    coalesce(
      venue,
      ''
    ),

  photo =
    coalesce(
      photo,
      ''
    ),

  data =
    coalesce(
      data,
      '{}'::jsonb
    ),

  created_at =
    coalesce(
      created_at,
      now()
    );


-- =========================================================
-- 4. ORDER UPDATES
-- =========================================================

create table if not exists order_updates (
  id bigint primary key,
  row_number integer,
  customer_name text,
  status text,
  note text default '',
  photo text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);


alter table order_updates
  add column if not exists row_number integer;

alter table order_updates
  add column if not exists customer_name text;

alter table order_updates
  add column if not exists status text;

alter table order_updates
  add column if not exists note text;

alter table order_updates
  add column if not exists photo text;

alter table order_updates
  add column if not exists created_at timestamptz;

alter table order_updates
  add column if not exists updated_at timestamptz;


update order_updates
set
  note =
    coalesce(
      note,
      ''
    ),

  photo =
    coalesce(
      photo,
      ''
    ),

  created_at =
    coalesce(
      created_at,
      now()
    ),

  updated_at =
    coalesce(
      updated_at,
      now()
    );


-- =========================================================
-- 5. CONSTRAINTS
-- =========================================================

do $$
begin

  if not exists (
    select 1
    from pg_constraint
    where conname =
      'payment_submissions_status_check'
  ) then

    alter table payment_submissions
      add constraint
      payment_submissions_status_check
      check (
        status in (
          'pending',
          'approved',
          'rejected'
        )
      );

  end if;

end
$$;


do $$
begin

  if not exists (
    select 1
    from pg_constraint
    where conname =
      'order_updates_status_check'
  ) then

    alter table order_updates
      add constraint
      order_updates_status_check
      check (
        status in (
          'Belum di CO',
          'Sudah di CO',
          'Diproses',
          'Selesai'
        )
      );

  end if;

end
$$;


-- =========================================================
-- 6. INDEX
-- =========================================================

create index if not exists
idx_payment_batches_service
on payment_batches(service);


create index if not exists
idx_payment_batches_created_at
on payment_batches(created_at desc);


create index if not exists
idx_payment_submissions_batch
on payment_submissions(batch_id);


create index if not exists
idx_payment_submissions_status
on payment_submissions(status);


create index if not exists
idx_payment_submissions_created_at
on payment_submissions(created_at desc);


create index if not exists
idx_site_content_service
on site_content(service);


create index if not exists
idx_site_content_type
on site_content(type);


create index if not exists
idx_site_content_created_at
on site_content(created_at desc);


create index if not exists
idx_order_updates_row_number
on order_updates(row_number);


create index if not exists
idx_order_updates_customer_name
on order_updates(customer_name);


create index if not exists
idx_order_updates_updated_at
on order_updates(updated_at desc);


-- =========================================================
-- 7. ROW LEVEL SECURITY
-- =========================================================

alter table payment_batches
  enable row level security;

alter table payment_submissions
  enable row level security;

alter table site_content
  enable row level security;

alter table order_updates
  enable row level security;


-- =========================================================
-- 8. SERVICE ROLE
-- =========================================================

grant select, insert, update, delete
on table payment_batches
to service_role;


grant select, insert, update, delete
on table payment_submissions
to service_role;


grant select, insert, update, delete
on table site_content
to service_role;


grant select, insert, update, delete
on table order_updates
to service_role;


grant usage, select
on all sequences in schema public
to service_role;


-- =========================================================
-- 9. PUBLIC READ
-- =========================================================

drop policy if exists
"Customer can view payment batches"
on payment_batches;


create policy
"Customer can view payment batches"
on payment_batches
for select
to anon, authenticated
using (true);


drop policy if exists
"Customer can view site content"
on site_content;


create policy
"Customer can view site content"
on site_content
for select
to anon, authenticated
using (true);


drop policy if exists
"Customer can view order updates"
on order_updates;


create policy
"Customer can view order updates"
on order_updates
for select
to anon, authenticated
using (true);


-- =========================================================
-- 10. PAYMENT SUBMISSION
-- =========================================================

drop policy if exists
"Admin can manage payment submissions"
on payment_submissions;


create policy
"Admin can manage payment submissions"
on payment_submissions
for all
to service_role
using (true)
with check (true);


-- =========================================================
-- 11. STORAGE BUCKET
-- =========================================================
--
-- Bucket tetap PRIVATE.
-- Kalau bucket sudah ada, bagian ini tidak
-- akan membuat bucket kedua.
--

insert into storage.buckets (
  id,
  name,
  public
)
values (
  'go2408room-files',
  'go2408room-files',
  false
)
on conflict (id)
do update set
  public = false;


-- =========================================================
-- 12. REFRESH POSTGREST
-- =========================================================

notify pgrst, 'reload schema';
