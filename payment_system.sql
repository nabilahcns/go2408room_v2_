-- GO2408ROOM FINAL
-- Jalankan seluruh script ini di Supabase SQL Editor.

create table if not exists payment_batches (
  id bigint primary key,
  service text not null,
  batch text,
  batch_name text,
  batch_photo text,
  qris text,
  customers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table payment_batches alter column batch_name drop not null;
alter table payment_batches enable row level security;
grant select, insert, update, delete on table payment_batches to service_role;
grant usage, select on all sequences in schema public to service_role;

create table if not exists payment_submissions (
  id bigint primary key,
  batch_id bigint not null,
  customer_index integer not null,
  customer_name text not null,
  proof_path text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  note text not null default '',
  created_at timestamptz not null default now(),
  verified_at timestamptz
);
alter table payment_submissions enable row level security;
grant select, insert, update, delete on table payment_submissions to service_role;
grant usage, select on all sequences in schema public to service_role;

create table if not exists site_content (
  id bigint primary key,
  service text not null default '',
  type text not null,
  title text not null default '',
  note text not null default '',
  url text not null default '',
  date text not null default '',
  venue text not null default '',
  photo text not null default '',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table site_content enable row level security;
grant select, insert, update, delete on table site_content to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Bucket private tetap digunakan. API membuat signed URL untuk membaca foto.
