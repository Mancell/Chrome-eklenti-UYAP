-- ============================================================================
-- senkron_durum RPC — progress alanları eklendi (islenen/toplam)
-- ============================================================================
create or replace function public.senkron_durum(
  p_token   text,
  p_durum   text,
  p_mesaj   text default null,
  p_sayi    integer default null,
  p_islenen integer default null,
  p_toplam  integer default null
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

  insert into public.senkron_gunlugu
    (kullanici_id, durum, mesaj, dosya_sayisi, islenen, toplam, baslangic, guncellendi)
  values (v_kullanici, p_durum, p_mesaj, p_sayi, p_islenen, p_toplam, now(), now())
  on conflict (kullanici_id) do update set
    durum = excluded.durum,
    mesaj = excluded.mesaj,
    dosya_sayisi = coalesce(excluded.dosya_sayisi, senkron_gunlugu.dosya_sayisi),
    islenen = excluded.islenen,
    toplam = coalesce(excluded.toplam, senkron_gunlugu.toplam),
    baslangic = case when excluded.durum = 'basladi' and senkron_gunlugu.durum <> 'basladi'
                     then now() else senkron_gunlugu.baslangic end,
    guncellendi = now();
end $$;

-- Eski 4-argümanlı imza duruyorsa kaldır (yeni imza farklı arity, çakışmaz ama
-- temizlik için).
drop function if exists public.senkron_durum(text, text, text, integer);

revoke execute on function public.senkron_durum(text, text, text, integer, integer, integer) from public;
grant execute on function public.senkron_durum(text, text, text, integer, integer, integer) to anon, authenticated;
