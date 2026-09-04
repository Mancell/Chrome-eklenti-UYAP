-- ============================================================================
-- senkron_durum RPC — eklenti senkron olayını yazar
--
-- Eklentinin auth'u yok (kimliği ham token'da), bu yüzden eklenti_senkron ile
-- aynı token→kullanıcı çözümü gerekiyor: security definer + search_path pinli.
-- Upsert: her kullanıcının tek "son senkron" satırı güncellenir.
-- ============================================================================
create or replace function public.senkron_durum(
  p_token text,
  p_durum text,
  p_mesaj text default null,
  p_sayi  integer default null
)
returns void
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  v_kullanici uuid;
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

  insert into public.senkron_gunlugu (kullanici_id, durum, mesaj, dosya_sayisi, baslangic, guncellendi)
  values (
    v_kullanici, p_durum, p_mesaj, p_sayi,
    -- 'basladi' başlangıcı yeniler; 'bitti'/'hata' mevcut başlangıcı korur.
    now(), now()
  )
  on conflict (kullanici_id) do update set
    durum = excluded.durum,
    mesaj = excluded.mesaj,
    dosya_sayisi = coalesce(excluded.dosya_sayisi, senkron_gunlugu.dosya_sayisi),
    baslangic = case when excluded.durum = 'basladi' then now() else senkron_gunlugu.baslangic end,
    guncellendi = now();
end $$;

revoke execute on function public.senkron_durum(text, text, text, integer) from public;
grant execute on function public.senkron_durum(text, text, text, integer) to anon, authenticated;
