import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

export type Satir = Record<string, any>;

/**
 * Bir tabloyu çeker ve realtime dinler — senkron sürerken panel kendiliğinden
 * dolsun diye. Beş sayfa da bunu kullanıyor; sayfa başına ayrı fetch yazılmıyor.
 */
export function useTablo(
  tablo: string,
  sirala?: { alan: string; artan?: boolean },
  // Filtre ŞART olabilir: PostgREST varsayılanı 1000 satır döndürüyor ve
  // 4363 evrakın çoğu panele hiç gelmiyordu. Dosya bazlı sorgu hem limiti
  // aşıyor hem gereksiz veri çekmiyor.
  filtre?: { alan: string; deger: string | null } | null,
) {
  const [satirlar, setSatirlar] = useState<Satir[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  // Yükleme ilerlemesi: bir dosyada 2000+ evrak olabiliyor, sayfalama sürerken
  // kullanıcı ne kadarının geldiğini görsün.
  const [toplam, setToplam] = useState<number | null>(null);

  useEffect(() => {
    let iptal = false;

    async function cek() {
      const SAYFA = 1000;          // PostgREST'in tek istekte döndürdüğü üst sınır
      const AZAMI_SAYFA = 20;      // 20 000 satır; sonsuz döngüye karşı emniyet
      const hepsi: Satir[] = [];
      setYukleniyor(true);

      for (let sayfa = 0; sayfa < AZAMI_SAYFA; sayfa++) {
        let s = supabase.from(tablo).select('*', sayfa === 0 ? { count: 'exact' } : {});
        if (filtre) {
          if (!filtre.deger) { setSatirlar([]); setToplam(0); setYukleniyor(false); return; }
          s = s.eq(filtre.alan, filtre.deger);
        }
        if (sirala) s = s.order(sirala.alan, { ascending: sirala.artan ?? false, nullsFirst: false });
        const { data, error, count } = await s.range(sayfa * SAYFA, sayfa * SAYFA + SAYFA - 1);
        if (iptal) return;
        if (error) { setHata(error.message); break; }
        if (sayfa === 0 && typeof count === 'number') setToplam(count);

        hepsi.push(...(data ?? []));
        setSatirlar([...hepsi]);            // gelen kadarını hemen göster
        if (!data || data.length < SAYFA) break;   // son sayfa
      }
      if (!iptal) setYukleniyor(false);
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
  }, [tablo, sirala?.alan, sirala?.artan, filtre?.alan, filtre?.deger]);

  return { satirlar, yukleniyor, hata, toplam };
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

/**
 * Evrak İNDİRME bağlantısı. UYAP'ta görüntüleme ve indirme aynı parametreleri
 * alır, yalnız uç adı değişir (view → download); indirme uçu belgeyi ek olarak
 * gönderiyor. Bağlantı eklentide kuruluyor, panel yalnız ucu değiştiriyor.
 */
export function indirmeBaglantisi(uyapLink: string | null | undefined): string | null {
  if (!uyapLink) return null;
  return uyapLink.includes('/view_document_brd.uyap')
    ? uyapLink.replace('/view_document_brd.uyap', '/download_document_brd.uyap')
    : uyapLink;
}
