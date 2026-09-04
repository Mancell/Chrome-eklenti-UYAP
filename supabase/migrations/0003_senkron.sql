-- ============================================================================
-- Senkron görünürlüğü + çift kayıt temizliği
--
-- Kullanıcı senkronun çalışıp çalışmadığını GÖREMİYORDU: durum yalnız eklenti
-- popup'ındaydı, panelin haberi yoktu. Bu tablo eklentiden panele köprü:
-- eklenti her senkron olayını yazar, panel realtime okur.
--
-- TEK SATIR MANTIĞI: her kullanıcının bir "son senkron" satırı var
-- (kullanici_id unique). Geçmiş yığılmıyor — istenirse ayrı iş.
-- ============================================================================

create table if not exists public.senkron_gunlugu (
  kullanici_id  uuid primary key default auth.uid()
                  references auth.users(id) on delete cascade,
  durum         text not null,           -- basladi | bitti | hata
  mesaj         text,                    -- "4 dosya, 0 evrak" ya da hata metni
  dosya_sayisi  integer,
  baslangic     timestamptz not null default now(),
  guncellendi   timestamptz not null default now()
);

alter table public.senkron_gunlugu enable row level security;

drop policy if exists "kendi senkronum" on public.senkron_gunlugu;
create policy "kendi senkronum" on public.senkron_gunlugu
  for all to authenticated
  using (kullanici_id = (select auth.uid()))
  with check (kullanici_id = (select auth.uid()));

revoke all on public.senkron_gunlugu from anon;
grant select, insert, update, delete on public.senkron_gunlugu to authenticated;

-- Panel canlı görsün.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'senkron_gunlugu'
  ) then
    alter publication supabase_realtime add table public.senkron_gunlugu;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Çift kayıt temizliği (bir kerelik)
--
-- UYAP dosyaId'yi HER SORGUDA farklı şifreli jeton olarak veriyor, bu yüzden
-- aynı dosya iki uyap_ref ile yazılmış. 0004'te uyap_ref içerikten türetilecek;
-- burada mevcut çiftler temizleniyor. Her (dosya_no, birim) için en eski satır
-- kalıyor, alt kayıtlar (safahat/evrak) ona bağlıysa on delete cascade ile
-- gitmiyor çünkü set null — ama zaten alt kayıt yok (0 safahat/evrak).
-- ----------------------------------------------------------------------------
delete from public.dosyalar d
where d.id not in (
  select distinct on (kullanici_id, dosya_no, birim) id
  from public.dosyalar
  order by kullanici_id, dosya_no, birim, olusturuldu
);
