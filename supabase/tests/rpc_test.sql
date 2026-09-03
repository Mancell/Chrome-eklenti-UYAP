-- ============================================================================
-- RPC testi.  Çalıştır:  supabase db reset && psql "$DB_URL" -f supabase/tests/rpc_test.sql
--
-- Kapsam: token üretimi (ham token saklanmıyor mu), geçersiz/iptal token reddi,
-- senkron yazımı, dosya_id bağlanması, İDEMPOTENCY (aynı uyap_ref iki kez →
-- tek satır) ve RLS izolasyonu (A'nın satırı B'ye görünmüyor).
--
-- Framework yok — plpgsql `assert`. Hata olursa psql sıfırdan farklı döner.
-- ============================================================================
\set ON_ERROR_STOP on

begin;

-- İki test kullanıcısı. auth.users'a doğrudan yazmak yalnız yerel testte olur.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'a@test.local', '', now(), now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'b@test.local', '', now(), now(), now())
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 1) Token üretimi — ham token DB'de DURMAMALI, yalnız SHA-256 hash'i.
-- ----------------------------------------------------------------------------
do $$
declare v_ham text; v_sayi int;
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
  v_ham := public.eklenti_token_uret('test-tarayici');
  assert length(v_ham) >= 40, 'token cok kisa';

  select count(*) into v_sayi from public.eklenti_tokenlari where token_hash = v_ham;
  assert v_sayi = 0, 'HAM TOKEN DB DE DURUYOR - sizinti';

  select count(*) into v_sayi from public.eklenti_tokenlari
   where token_hash = encode(extensions.digest(v_ham, 'sha256'), 'hex');
  assert v_sayi = 1, 'token hash i yazilmamis';

  perform set_config('app.test_token', v_ham, true);
  raise notice '1) token uretimi + hashleme tamam';
end $$;

-- ----------------------------------------------------------------------------
-- 2) Giriş yapmamış kullanıcı token üretemez.
-- ----------------------------------------------------------------------------
do $$
begin
  perform set_config('request.jwt.claims', '', true);
  begin
    perform public.eklenti_token_uret('olmamali');
    assert false, 'anon token uretebildi';
  exception when sqlstate 'P0001' then
    null;  -- beklenen: giris_gerekli
  end;
  raise notice '2) anon token uretemiyor';
end $$;

-- ----------------------------------------------------------------------------
-- 3) Geçersiz / boş token reddedilir.
-- ----------------------------------------------------------------------------
do $$
declare k text;
begin
  foreach k in array array['', '   ', 'uydurma-token'] loop
    begin
      perform public.eklenti_senkron(k, '{}'::jsonb);
      assert false, 'gecersiz token kabul edildi';
    exception when sqlstate 'P0001' then
      null;
    end;
  end loop;
  raise notice '3) gecersiz token reddi tamam';
end $$;

-- ----------------------------------------------------------------------------
-- 4) Senkron yazıyor + alt kayıtlar dosyaya bağlanıyor.
-- ----------------------------------------------------------------------------
do $$
declare v_ham text; v_sonuc jsonb; v_sayi int; v_dosya uuid;
begin
  v_ham := current_setting('app.test_token', true);
  v_sonuc := public.eklenti_senkron(v_ham, jsonb_build_object(
    'dosyalar', jsonb_build_array(
      jsonb_build_object('uyap_ref','D-1','dosya_no','2024/115','birim','Istanbul 3. Icra',
                         'yargi_turu','icra','acilis_tarihi','2024-03-01','durum','acik'),
      -- Aynı ref İKİ KEZ: UYAP listeleri tekrar edebiliyor, tek deyimde
      -- ON CONFLICT aynı satıra iki kez dokunamaz → distinct on çalışmalı.
      jsonb_build_object('uyap_ref','D-1','dosya_no','2024/115','birim','Istanbul 3. Icra')
    ),
    'safahat', jsonb_build_array(
      jsonb_build_object('uyap_ref','S-1','dosya_ref','D-1','tarih','2024-03-05','islem','Odeme emri')),
    'durusmalar', jsonb_build_array(
      jsonb_build_object('uyap_ref','R-1','dosya_ref','D-1','tarih','2024-06-10','saat','10:30','tur','durusma')),
    'evraklar', jsonb_build_array(
      jsonb_build_object('uyap_ref','E-1','dosya_ref','D-1','evrak_tipi','Odeme Emri',
                         'metin','ornek metin','evrak_tarihi','bozuk-tarih')),
    'tebligatlar', jsonb_build_array(
      jsonb_build_object('uyap_ref','T-1','dosya_ref','D-1','konu','Tebligat',
                         'teblig_tarihi','2024-04-01','sure_gun','7'))
  ));

  assert (v_sonuc->>'dosyalar')::int = 1, 'tekrarli dosya tekillesmedi: ' || v_sonuc::text;

  select id into v_dosya from public.dosyalar where uyap_ref = 'D-1';
  assert v_dosya is not null, 'dosya yazilmadi';

  select count(*) into v_sayi from public.safahat where dosya_id = v_dosya;
  assert v_sayi = 1, 'safahat dosyaya baglanmadi';
  select count(*) into v_sayi from public.durusmalar where dosya_id = v_dosya;
  assert v_sayi = 1, 'durusma dosyaya baglanmadi';
  select count(*) into v_sayi from public.evraklar where dosya_id = v_dosya;
  assert v_sayi = 1, 'evrak dosyaya baglanmadi';
  select count(*) into v_sayi from public.tebligatlar where dosya_id = v_dosya and sure_gun = 7;
  assert v_sayi = 1, 'tebligat/sure yazilmadi';

  -- Bozuk tarih satırı DÜŞÜRMEMELİ, NULL'a düşmeli.
  select count(*) into v_sayi from public.evraklar where uyap_ref = 'E-1' and evrak_tarihi is null;
  assert v_sayi = 1, 'bozuk tarih NULL a dusmedi';

  raise notice '4) senkron yazimi + dosya bagi + bozuk tarih toleransi tamam';
end $$;

-- ----------------------------------------------------------------------------
-- 5) İdempotency — aynı veri ikinci kez, satır sayısı ARTMAMALI.
-- ----------------------------------------------------------------------------
do $$
declare v_ham text; v_once int; v_sonra int;
begin
  v_ham := current_setting('app.test_token', true);
  select count(*) into v_once from public.dosyalar;

  perform public.eklenti_senkron(v_ham, jsonb_build_object(
    'dosyalar', jsonb_build_array(
      jsonb_build_object('uyap_ref','D-1','dosya_no','2024/115','durum','kapali')),
    'evraklar', jsonb_build_array(
      -- Metin BOŞ geliyor: ikinci senkronda evrak indirilememiş olabilir.
      -- Önceden çıkarılmış metin SİLİNMEMELİ.
      jsonb_build_object('uyap_ref','E-1','dosya_ref','D-1','evrak_tipi','Odeme Emri'))
  ));

  select count(*) into v_sonra from public.dosyalar;
  assert v_once = v_sonra, format('idempotency bozuk: %s -> %s', v_once, v_sonra);

  assert (select durum from public.dosyalar where uyap_ref = 'D-1') = 'kapali',
         'guncelleme uygulanmadi';
  assert (select metin from public.evraklar where uyap_ref = 'E-1') = 'ornek metin',
         'bos metin, mevcut metnin uzerine yazdi';

  raise notice '5) idempotency + metin korumasi tamam';
end $$;

-- ----------------------------------------------------------------------------
-- 6) İptal edilmiş token çalışmaz.
-- ----------------------------------------------------------------------------
do $$
declare v_ham text;
begin
  v_ham := current_setting('app.test_token', true);
  update public.eklenti_tokenlari set iptal = true
   where token_hash = encode(extensions.digest(v_ham, 'sha256'), 'hex');
  begin
    perform public.eklenti_senkron(v_ham, '{}'::jsonb);
    assert false, 'iptal edilmis token calisti';
  exception when sqlstate 'P0001' then
    null;
  end;
  update public.eklenti_tokenlari set iptal = false
   where token_hash = encode(extensions.digest(v_ham, 'sha256'), 'hex');
  raise notice '6) iptal edilmis token reddi tamam';
end $$;

-- ----------------------------------------------------------------------------
-- 7) RLS — B kullanıcısı A'nın dosyalarını GÖRMEMELİ.
-- ----------------------------------------------------------------------------
set local role authenticated;

do $$
declare v_sayi int;
begin
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
  select count(*) into v_sayi from public.dosyalar;
  assert v_sayi = 0, format('SIZINTI: B, A nin %s dosyasini goruyor', v_sayi);

  select count(*) into v_sayi from public.eklenti_tokenlari;
  assert v_sayi = 0, 'SIZINTI: B, A nin tokenini goruyor';

  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
  select count(*) into v_sayi from public.dosyalar;
  assert v_sayi = 1, format('A kendi dosyasini goremiyor: %s', v_sayi);

  raise notice '7) RLS izolasyonu tamam';
end $$;

reset role;

rollback;   -- test verisi kalmasın

\echo 'TUM RPC TESTLERI GECTI'
