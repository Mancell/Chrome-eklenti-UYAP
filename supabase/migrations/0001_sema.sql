-- ============================================================================
-- UYAP Vatandaş Senkron — şema
--
-- Kullanıcının UYAP Vatandaş Portalı'ndaki KENDİ dosyaları. Veriyi Chrome
-- eklentisi, kullanıcının KENDİ açık oturumundan çeker ve `eklenti_senkron`
-- RPC'siyle buraya yazar (bkz. 0002_rpc.sql). Eklentinin tablolara doğrudan
-- yazma yetkisi YOKTUR — tek yol o RPC.
--
-- Ortak desen (her tabloda):
--   kullanici_id → auth.users, on delete cascade
--   uyap_ref     → senkron idempotency anahtarı; (kullanici_id, uyap_ref) tekil
--   RLS açık, tek politika: kullanici_id = auth.uid()
--
-- `uyap_ref` NULL bırakılabilir (Postgres tekil indekste NULL'lar çakışmaz),
-- böylece elle eklenen kayıtlar senkronu engellemez.
--
-- KVKK: evrak metni üçüncü kişi verisi içerir (karşı taraf, tanık, bilirkişi).
-- Bu SQL yalnız teknik zemini kurar; aydınlatma ve veri işleme yükümlülüğü
-- ürünün kendi işidir.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ----------------------------------------------------------------------------
-- Dosyalar (dava künyesi) — diğer her tablo buna asılır.
-- ----------------------------------------------------------------------------
create table if not exists public.dosyalar (
  id            uuid primary key default gen_random_uuid(),
  kullanici_id  uuid not null default auth.uid()
                  references auth.users(id) on delete cascade,
  uyap_ref      text,
  dosya_no      text,
  birim         text,        -- mahkeme / icra dairesi adı
  yargi_turu    text,        -- hukuk | ceza | icra | idari ...
  dosya_turu    text,
  taraflar      text,
  acilis_tarihi date,
  durum         text,        -- açık | kapalı | derdest ...
  olusturuldu   timestamptz not null default now(),
  guncellendi   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Safahat (dosya hareketleri). UYAP satır başına kimlik vermeyebilir; eklenti
-- `uyap_ref`'i dosya_ref + tarih + işlemden türetir (bkz. extension/uyap.js).
-- ----------------------------------------------------------------------------
create table if not exists public.safahat (
  id            uuid primary key default gen_random_uuid(),
  kullanici_id  uuid not null default auth.uid()
                  references auth.users(id) on delete cascade,
  dosya_id      uuid references public.dosyalar(id) on delete cascade,
  uyap_ref      text,
  tarih         date,
  islem         text,
  aciklama      text,
  olusturuldu   timestamptz not null default now(),
  guncellendi   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Duruşmalar (fiziki + e-duruşma)
-- ----------------------------------------------------------------------------
create table if not exists public.durusmalar (
  id            uuid primary key default gen_random_uuid(),
  kullanici_id  uuid not null default auth.uid()
                  references auth.users(id) on delete cascade,
  dosya_id      uuid references public.dosyalar(id) on delete cascade,
  uyap_ref      text,
  tarih         date,
  saat          text,        -- "10:30"; UYAP biçimi değişken, metin olarak
  salon         text,
  tur           text,        -- durusma | e-durusma
  durum         text,
  olusturuldu   timestamptz not null default now(),
  guncellendi   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Evraklar — künye + ÇIKARILMIŞ DÜZ METİN. Orijinal PDF/UDF baytı SAKLANMAZ
-- (Storage açılmıyor); metin çıkarılamazsa `metin` boş kalır, `uyap_link` ile
-- kullanıcı belgeyi UYAP'ta açar.
-- ----------------------------------------------------------------------------
create table if not exists public.evraklar (
  id            uuid primary key default gen_random_uuid(),
  kullanici_id  uuid not null default auth.uid()
                  references auth.users(id) on delete cascade,
  dosya_id      uuid references public.dosyalar(id) on delete cascade,
  uyap_ref      text,
  evrak_tipi    text,
  evrak_tarihi  date,
  gonderen      text,
  metin         text,
  uyap_link     text,
  olusturuldu   timestamptz not null default now(),
  guncellendi   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Tebligatlar (e-Tebligat / UETS). Son gün = teblig_tarihi + sure_gun; ayrı
-- kolon tutulmuyor, panel hesaplıyor (tek kaynak).
-- ----------------------------------------------------------------------------
create table if not exists public.tebligatlar (
  id            uuid primary key default gen_random_uuid(),
  kullanici_id  uuid not null default auth.uid()
                  references auth.users(id) on delete cascade,
  dosya_id      uuid references public.dosyalar(id) on delete cascade,
  uyap_ref      text,
  konu          text,
  gonderen      text,
  teblig_tarihi date,
  sure_gun      integer not null default 14,
  durum         text,        -- okunmamış | okunmuş | arşivlenmiş
  olusturuldu   timestamptz not null default now(),
  guncellendi   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Eklenti token'ları
--
-- Eklenti Supabase'e giriş YAPMAZ; kimliğini bu token taşır. Panel (JWT'li
-- kullanıcı) üretir, ham token BİR KEZ gösterilir, burada yalnız SHA-256
-- HASH'i durur. Ham token sızsa bile DB'den geri üretilemez.
-- ----------------------------------------------------------------------------
create table if not exists public.eklenti_tokenlari (
  id            uuid primary key default gen_random_uuid(),
  kullanici_id  uuid not null default auth.uid()
                  references auth.users(id) on delete cascade,
  token_hash    text not null unique,   -- SHA-256 hex; ham token DEĞİL
  ad            text,                   -- cihaz/tarayıcı etiketi
  olusturuldu   timestamptz not null default now(),
  son_kullanim  timestamptz,
  iptal         boolean not null default false
);

-- ----------------------------------------------------------------------------
-- RLS — hepsi aynı desende. `auth.uid()` alt sorgu içinde: satır başına değil
-- sorgu başına bir kez değerlendirilir (Supabase performans önerisi).
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'dosyalar','safahat','durusmalar','evraklar','tebligatlar','eklenti_tokenlari'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "kendi kayitlarim" on public.%I', t);
    execute format(
      'create policy "kendi kayitlarim" on public.%I for all to authenticated
         using (kullanici_id = (select auth.uid()))
         with check (kullanici_id = (select auth.uid()))', t);
    execute format('revoke all on public.%I from anon', t);
    -- Supabase varsayılan yetkileri zaten `authenticated`'a izin veriyor; yine de
    -- AÇIK yazıyoruz: şema o varsayılana bağlı kalmasın (başka bir rolle
    -- migrate edilirse tablolar sessizce erişilemez olur). RLS satır filtresi
    -- ayrı katman — bu grant onu gevşetmiyor.
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- İndeksler
--
-- (kullanici_id, uyap_ref) TAM tekil indeks — kısmi DEĞİL: upsert'in
-- ON CONFLICT hedefi ancak tam bir tekil indeks olabilir.
-- ----------------------------------------------------------------------------
create unique index if not exists dosyalar_ref_tekil    on public.dosyalar    (kullanici_id, uyap_ref);
create unique index if not exists safahat_ref_tekil     on public.safahat     (kullanici_id, uyap_ref);
create unique index if not exists durusmalar_ref_tekil  on public.durusmalar  (kullanici_id, uyap_ref);
create unique index if not exists evraklar_ref_tekil    on public.evraklar    (kullanici_id, uyap_ref);
create unique index if not exists tebligatlar_ref_tekil on public.tebligatlar (kullanici_id, uyap_ref);

create index if not exists safahat_dosya      on public.safahat     (dosya_id, tarih desc);
create index if not exists durusmalar_tarih   on public.durusmalar  (kullanici_id, tarih);
create index if not exists evraklar_dosya     on public.evraklar    (dosya_id, evrak_tarihi desc);
create index if not exists tebligatlar_tarih  on public.tebligatlar (kullanici_id, teblig_tarihi desc);

-- ----------------------------------------------------------------------------
-- Realtime: senkron sürerken panel kendiliğinden dolsun.
-- `add table` aynı tablo için iki kez çalışırsa hata verir → guard.
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['dosyalar','durusmalar','evraklar','tebligatlar'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
