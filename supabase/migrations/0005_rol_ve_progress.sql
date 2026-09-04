-- ============================================================================
-- rol kolonu + senkron progress + öksüz çift kayıt temizliği
--
-- - dosyalar.rol: kullanıcının o dosyadaki rolü (Sanık/Davacı/…). UYAP dosya
--   listesinde `rol` alanı geliyor; değerli bilgi, ayrı kolon.
-- - senkron_gunlugu.islenen/toplam: progress bar için. Panel çubuğu bunlardan
--   dolduruyor.
-- - Öksüz çift kayıt: uyap_ref jetondan içerik-hash'e geçince eski jetonlu
--   satırlar öksüz kaldı. En eski (dosya_no,birim) kalır.
-- ============================================================================

alter table public.dosyalar add column if not exists rol text;

alter table public.senkron_gunlugu
  add column if not exists islenen integer,
  add column if not exists toplam  integer;

-- Öksüz çift temizliği (0003 ile aynı mantık, ikinci dalga).
delete from public.dosyalar d
where d.id not in (
  select distinct on (kullanici_id, dosya_no, birim) id
  from public.dosyalar
  order by kullanici_id, dosya_no, birim, olusturuldu
);
