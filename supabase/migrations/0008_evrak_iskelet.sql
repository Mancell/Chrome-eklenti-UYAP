-- ============================================================================
-- Evrak AĞAÇ YAPISINI koru
--
-- UYAP evrakları düz liste değil, bir ağaç olarak veriyor:
--   Dava (2024/200)
--     └ Klasör ("Dosyaya Eklenen Son 20 Evrak")
--         └ Ana evrak ("İstinafa Evrak Gönderme Üst Yazısı")
--             ├ Ek 1 … Ek 6
--
-- Bu yapı düz listeye çökünce hangi ekin hangi evrağa ait olduğu yalnız
-- isimden ("… — Ek 3") anlaşılıyordu; sıralama ve klasör bilgisi tamamen
-- kayboluyordu. Bir davaya ait belge indirildiğinde iskeletin korunması şart.
-- ============================================================================

alter table public.evraklar
  -- Ana evrağın uyap_ref'i. NULL ise bu satır ana evraktır (kök düğüm).
  -- Kendi kendine referans: dosya silinince zaten cascade ile gidiyor.
  add column if not exists ana_evrak_ref text,
  -- UYAP ağacındaki klasör adı ("Dosyaya Eklenen Son 20 Evrak").
  add column if not exists klasor text,
  -- Ağaçtaki görünüm sırası; UYAP'ın verdiği sıra anlamlı (en yeni önce).
  add column if not exists sira integer;

-- Bir ana evrağın eklerini hızlı getirmek için.
create index if not exists evraklar_ana_evrak
  on public.evraklar (kullanici_id, ana_evrak_ref);
