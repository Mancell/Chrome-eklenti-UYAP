import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

export type Satir = Record<string, any>;

/**
 * Bir tabloyu çeker ve realtime dinler — senkron sürerken panel kendiliğinden
 * dolsun diye. Beş sayfa da bunu kullanıyor; sayfa başına ayrı fetch yazılmıyor.
 */
export function useTablo(tablo: string, sirala?: { alan: string; artan?: boolean }) {
  const [satirlar, setSatirlar] = useState<Satir[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    let iptal = false;

    async function cek() {
      let s = supabase.from(tablo).select('*');
      if (sirala) s = s.order(sirala.alan, { ascending: sirala.artan ?? false, nullsFirst: false });
      const { data, error } = await s;
      if (iptal) return;
      if (error) setHata(error.message);
      else setSatirlar(data ?? []);
      setYukleniyor(false);
    }
    cek();

    const kanal = supabase
      .channel(`canli:${tablo}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: tablo }, cek)
      .subscribe();

    return () => {
      iptal = true;
      supabase.removeChannel(kanal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tablo, sirala?.alan, sirala?.artan]);

  return { satirlar, yukleniyor, hata };
}

export const bugun = new Date().toISOString().slice(0, 10);

export function gunEkle(iso: string, gun: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + gun);
  return d.toISOString().slice(0, 10);
}

export function trTarih(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, a, g] = iso.slice(0, 10).split('-');
  return g && a && y ? `${g}.${a}.${y}` : iso;
}

/** Son gün ile bugün arasındaki gün farkı. Negatif = geçmiş. */
export function kalanGun(sonGun: string): number {
  return Math.round(
    (Date.parse(sonGun + 'T00:00:00Z') - Date.parse(bugun + 'T00:00:00Z')) / 86400000,
  );
}

/** "az önce" / "2 dk önce" / "3 sa önce" / "12.03.2024" — insan-okur zaman. */
export function gecenSure(iso: string | null | undefined): string {
  if (!iso) return '';
  const fark = Date.now() - Date.parse(iso);
  if (isNaN(fark)) return '';
  const dk = Math.floor(fark / 60000);
  if (dk < 1) return 'az önce';
  if (dk < 60) return `${dk} dk önce`;
  const sa = Math.floor(dk / 60);
  if (sa < 24) return `${sa} sa önce`;
  return trTarih(iso);
}
