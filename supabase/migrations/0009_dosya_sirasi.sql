-- ============================================================================
-- Dava listesinde UYAP SIRASINI koru
--
-- UYAP dosyaları belirli bir sırayla döndürüyor (kendi mantığı: genelde en son
-- işlem göreni önce). Panel bu sırayı atıp `acilis_tarihi` ile yeniden
-- diziyordu — kullanıcının UYAP'ta gördüğü sıra ile panel farklı oluyordu.
--
-- Evraklarda aynı sorunu `evraklar.sira` ile çözmüştük; dosyalarda eksikti.
-- ============================================================================
alter table public.dosyalar add column if not exists sira integer;
