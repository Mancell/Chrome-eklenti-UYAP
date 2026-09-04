-- ============================================================================
-- İki RPC: token üretimi (panel) + senkron yazımı (eklenti)
--
-- Neden `security definer`: eklenti Supabase'e GİRMİŞ DEĞİL, JWT'si yok —
-- kimliğini ham token taşıyor. Token'ı kullanıcıya çözmek `eklenti_tokenlari`
-- tablosunu RLS dışında okumayı gerektiriyor. Bu yüzden eklentinin tek yetkisi
-- `eklenti_senkron`'u çağırmak; tablolara doğrudan erişimi yok.
--
-- Her iki fonksiyonda `set search_path` PİNLENMİŞ. Pinlenmezse `security
-- definer` bir fonksiyon, çağıranın search_path'ine konmuş sahte bir şema
-- üzerinden ele geçirilebilir. Bu satırlar güvenlik sınırıdır, süs değil.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Dönüştürme yardımcıları — UYAP'tan gelen alanlar serbest metin. Bozuk bir
-- tarih tüm senkron işlemini (tek transaction) düşürmemeli; NULL'a düşsün.
-- ----------------------------------------------------------------------------
create or replace function public._tarih(t text) returns date
language plpgsql stable as $$
begin
  return nullif(trim(t), '')::date;
exception when others then
  return null;   -- bozuk tarih senkronu düşürmez
end $$;

create or replace function public._sayi(t text, varsayilan int) returns int
language plpgsql immutable as $$
begin
  return coalesce(nullif(trim(t), '')::int, varsayilan);
exception when others then
  return varsayilan;
end $$;

-- ----------------------------------------------------------------------------
-- Panel çağırır (JWT şart). Ham token BİR KEZ döner, DB'de yalnız hash'i kalır.
-- ----------------------------------------------------------------------------
create or replace function public.eklenti_token_uret(ad text default null)
returns text
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  v_kullanici uuid := auth.uid();
  v_ham       text;
begin
  if v_kullanici is null then
    raise exception 'giris_gerekli' using hint = 'Token üretmek için giriş yapın.';
  end if;

  -- 32 bayt = 256 bit entropi. base64url: başlıkta/URL'de sorun çıkarmaz.
  v_ham := translate(encode(gen_random_bytes(32), 'base64'), '+/=', '-_');

  insert into public.eklenti_tokenlari (kullanici_id, token_hash, ad)
  values (v_kullanici, encode(digest(v_ham, 'sha256'), 'hex'), nullif(trim(ad), ''));

  return v_ham;   -- tek seferlik; bir daha üretilemez
end $$;

-- ----------------------------------------------------------------------------
-- Eklenti çağırır (JWT yok, kimlik ham token'da). Tüm batch TEK transaction:
-- ya hepsi yazılır ya hiçbiri — yarım senkron kalmaz.
--
-- p_veri şekli:
--   { "dosyalar":    [{uyap_ref, dosya_no, birim, yargi_turu, dosya_turu,
--                      taraflar, acilis_tarihi, durum}],
--     "safahat":     [{uyap_ref, dosya_ref, tarih, islem, aciklama}],
--     "durusmalar":  [{uyap_ref, dosya_ref, tarih, saat, salon, tur, durum}],
--     "evraklar":    [{uyap_ref, dosya_ref, evrak_tipi, evrak_tarihi, gonderen,
--                      metin, uyap_link}],
--     "tebligatlar": [{uyap_ref, dosya_ref, konu, gonderen, teblig_tarihi,
--                      sure_gun, durum}] }
--
-- Alt kayıtlar dosyaya `dosya_ref` (dosyanın uyap_ref'i) ile bağlanır —
-- eklenti uuid bilmez. Bağ kurulamazsa satır yine yazılır, `dosya_id` NULL
-- kalır (veri kaybetmemek, sessizce düşürmemek için).
--
-- `distinct on (uyap_ref)`: UYAP listeleri aynı kaydı iki kez döndürebilir;
-- ON CONFLICT tek deyimde aynı satıra iki kez dokunamaz (Postgres hata verir).
-- ----------------------------------------------------------------------------
create or replace function public.eklenti_senkron(p_token text, p_veri jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  v_kullanici uuid;
  v_sonuc     jsonb := '{}'::jsonb;
  v_n         int;
begin
  if coalesce(trim(p_token), '') = '' then
    raise exception 'gecersiz_token' using hint = 'Eklenti token''ı eksik.';
  end if;

  select kullanici_id into v_kullanici
    from public.eklenti_tokenlari
   where token_hash = encode(digest(p_token, 'sha256'), 'hex')
     and iptal = false;

  if v_kullanici is null then
    raise exception 'gecersiz_token' using hint = 'Eklenti token''ı geçersiz veya iptal edilmiş.';
  end if;

  update public.eklenti_tokenlari
     set son_kullanim = now()
   where token_hash = encode(digest(p_token, 'sha256'), 'hex');

  -- 1) Dosyalar ÖNCE: alt kayıtlar bunların uyap_ref'ine bağlanacak.
  insert into public.dosyalar
    (kullanici_id, uyap_ref, dosya_no, birim, yargi_turu, dosya_turu, taraflar, acilis_tarihi,
     durum, rol, sira, guncellendi)
  select distinct on (trim(x.uyap_ref))
         v_kullanici, trim(x.uyap_ref), x.dosya_no, x.birim, x.yargi_turu, x.dosya_turu,
         x.taraflar, public._tarih(x.acilis_tarihi), x.durum,
         -- `rol` kolonu 0005'te eklenmişti ama RPC'ye konmamıştı: kullanıcının
         -- dosyadaki rolü (Sanık/Davacı…) hiç yazılmıyordu.
         x.rol,
         -- UYAP'ın döndürdüğü SIRA. Panel bunu koruyor; açılış tarihine göre
         -- yeniden dizmek kullanıcının UYAP'ta gördüğü sırayı bozuyordu.
         public._sayi(x.sira, null::int), now()
    from jsonb_to_recordset(coalesce(p_veri->'dosyalar', '[]'::jsonb)) as x(
           uyap_ref text, dosya_no text, birim text, yargi_turu text,
           dosya_turu text, taraflar text, acilis_tarihi text, durum text,
           rol text, sira text)
   where nullif(trim(x.uyap_ref), '') is not null
   order by trim(x.uyap_ref)
  on conflict (kullanici_id, uyap_ref) do update set
    dosya_no = excluded.dosya_no, birim = excluded.birim,
    yargi_turu = excluded.yargi_turu, dosya_turu = excluded.dosya_turu,
    taraflar = excluded.taraflar, acilis_tarihi = excluded.acilis_tarihi,
    durum = excluded.durum, rol = excluded.rol, sira = excluded.sira, guncellendi = now();
  get diagnostics v_n = row_count;
  v_sonuc := v_sonuc || jsonb_build_object('dosyalar', v_n);

  -- 2) Safahat
  insert into public.safahat
    (kullanici_id, dosya_id, uyap_ref, tarih, islem, aciklama, guncellendi)
  select distinct on (trim(x.uyap_ref))
         v_kullanici, d.id, trim(x.uyap_ref), public._tarih(x.tarih), x.islem, x.aciklama, now()
    from jsonb_to_recordset(coalesce(p_veri->'safahat', '[]'::jsonb)) as x(
           uyap_ref text, dosya_ref text, tarih text, islem text, aciklama text)
    left join public.dosyalar d
      on d.kullanici_id = v_kullanici and d.uyap_ref = nullif(trim(x.dosya_ref), '')
   where nullif(trim(x.uyap_ref), '') is not null
   order by trim(x.uyap_ref)
  on conflict (kullanici_id, uyap_ref) do update set
    dosya_id = excluded.dosya_id, tarih = excluded.tarih,
    islem = excluded.islem, aciklama = excluded.aciklama, guncellendi = now();
  get diagnostics v_n = row_count;
  v_sonuc := v_sonuc || jsonb_build_object('safahat', v_n);

  -- 3) Duruşmalar
  insert into public.durusmalar
    (kullanici_id, dosya_id, uyap_ref, tarih, saat, salon, tur, durum, guncellendi)
  select distinct on (trim(x.uyap_ref))
         v_kullanici, d.id, trim(x.uyap_ref), public._tarih(x.tarih),
         x.saat, x.salon, x.tur, x.durum, now()
    from jsonb_to_recordset(coalesce(p_veri->'durusmalar', '[]'::jsonb)) as x(
           uyap_ref text, dosya_ref text, tarih text, saat text,
           salon text, tur text, durum text)
    left join public.dosyalar d
      on d.kullanici_id = v_kullanici and d.uyap_ref = nullif(trim(x.dosya_ref), '')
   where nullif(trim(x.uyap_ref), '') is not null
   order by trim(x.uyap_ref)
  on conflict (kullanici_id, uyap_ref) do update set
    dosya_id = excluded.dosya_id, tarih = excluded.tarih, saat = excluded.saat,
    salon = excluded.salon, tur = excluded.tur, durum = excluded.durum, guncellendi = now();
  get diagnostics v_n = row_count;
  v_sonuc := v_sonuc || jsonb_build_object('durusmalar', v_n);

  -- 4) Evraklar. `metin` boş gelebilir (tanınmayan biçim) — satır yine yazılır,
  --    kullanıcı `uyap_link` ile belgeyi UYAP'ta açar.
  insert into public.evraklar
    (kullanici_id, dosya_id, uyap_ref, evrak_tipi, evrak_tarihi, gonderen, metin, uyap_link,
     ana_evrak_ref, klasor, sira, guncellendi)
  select distinct on (trim(x.uyap_ref))
         v_kullanici, d.id, trim(x.uyap_ref), x.evrak_tipi, public._tarih(x.evrak_tarihi),
         x.gonderen, nullif(x.metin, ''), x.uyap_link,
         nullif(trim(x.ana_evrak_ref), ''), nullif(trim(x.klasor), ''), public._sayi(x.sira, null::int), now()
    from jsonb_to_recordset(coalesce(p_veri->'evraklar', '[]'::jsonb)) as x(
           uyap_ref text, dosya_ref text, evrak_tipi text, evrak_tarihi text,
           gonderen text, metin text, uyap_link text,
           ana_evrak_ref text, klasor text, sira text)
    left join public.dosyalar d
      on d.kullanici_id = v_kullanici and d.uyap_ref = nullif(trim(x.dosya_ref), '')
   where nullif(trim(x.uyap_ref), '') is not null
   order by trim(x.uyap_ref)
  on conflict (kullanici_id, uyap_ref) do update set
    dosya_id = excluded.dosya_id, evrak_tipi = excluded.evrak_tipi,
    evrak_tarihi = excluded.evrak_tarihi, gonderen = excluded.gonderen,
    -- Metin YALNIZ dolu gelirse üzerine yazılır: ikinci senkronda evrak baytı
    -- indirilemezse önceden çıkarılmış metin silinmesin.
    metin = coalesce(excluded.metin, evraklar.metin),
    uyap_link = excluded.uyap_link,
    ana_evrak_ref = excluded.ana_evrak_ref, klasor = excluded.klasor, sira = excluded.sira,
    guncellendi = now();
  get diagnostics v_n = row_count;
  v_sonuc := v_sonuc || jsonb_build_object('evraklar', v_n);

  -- 5) Tebligatlar
  insert into public.tebligatlar
    (kullanici_id, dosya_id, uyap_ref, konu, gonderen, teblig_tarihi, sure_gun, durum, guncellendi)
  select distinct on (trim(x.uyap_ref))
         v_kullanici, d.id, trim(x.uyap_ref), x.konu, x.gonderen,
         public._tarih(x.teblig_tarihi), public._sayi(x.sure_gun, 14), x.durum, now()
    from jsonb_to_recordset(coalesce(p_veri->'tebligatlar', '[]'::jsonb)) as x(
           uyap_ref text, dosya_ref text, konu text, gonderen text,
           teblig_tarihi text, sure_gun text, durum text)
    left join public.dosyalar d
      on d.kullanici_id = v_kullanici and d.uyap_ref = nullif(trim(x.dosya_ref), '')
   where nullif(trim(x.uyap_ref), '') is not null
   order by trim(x.uyap_ref)
  on conflict (kullanici_id, uyap_ref) do update set
    dosya_id = excluded.dosya_id, konu = excluded.konu, gonderen = excluded.gonderen,
    teblig_tarihi = excluded.teblig_tarihi, sure_gun = excluded.sure_gun,
    durum = excluded.durum, guncellendi = now();
  get diagnostics v_n = row_count;
  v_sonuc := v_sonuc || jsonb_build_object('tebligatlar', v_n);

  return v_sonuc;
end $$;

-- ----------------------------------------------------------------------------
-- Yetkiler. Postgres yeni fonksiyona EXECUTE'u PUBLIC'e verir; geri alınmazsa
-- `anon` de token üretebilirdi.
-- ----------------------------------------------------------------------------
revoke execute on function public.eklenti_token_uret(text) from public;
revoke execute on function public.eklenti_senkron(text, jsonb) from public;

grant execute on function public.eklenti_token_uret(text) to authenticated;
-- Eklenti anon key ile çağırır; gerçek kimlik ham token'da.
grant execute on function public.eklenti_senkron(text, jsonb) to anon, authenticated;
