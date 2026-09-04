import { useState } from 'react';
import { useTablo, gunEkle, bugun } from '../lib/veri';
import { Not } from '../components';

/**
 * Aylık takvim — AYRI TABLO YOK. Duruşmalar ve tebligat son günleri (teblig +
 * süre) tek görünümde birleşiyor; iki kaynak da zaten tarihli.
 */
const GUNLER = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

export default function Takvim() {
  const durusmalar = useTablo('durusmalar', { alan: 'tarih', artan: true });
  const tebligatlar = useTablo('tebligatlar', { alan: 'teblig_tarihi' });
  const [ay, setAy] = useState(() => bugun.slice(0, 7));   // YYYY-MM

  const [yil, aySayi] = ay.split('-').map(Number);
  const ilk = new Date(Date.UTC(yil, aySayi - 1, 1));
  const gunSayisi = new Date(Date.UTC(yil, aySayi, 0)).getUTCDate();
  // getUTCDay: 0=Pazar. Izgara Pazartesi başlıyor.
  const bosluk = (ilk.getUTCDay() + 6) % 7;

  const olaylar: Record<string, { metin: string; sinif: string }[]> = {};
  const ekle = (tarih: string | null, metin: string, sinif: string) => {
    if (!tarih) return;
    (olaylar[tarih.slice(0, 10)] ??= []).push({ metin, sinif });
  };

  for (const d of durusmalar.satirlar) {
    ekle(d.tarih, `⚖ ${d.saat ?? ''} duruşma`.trim(), 'kirmizi');
  }
  for (const t of tebligatlar.satirlar) {
    if (t.teblig_tarihi) ekle(gunEkle(t.teblig_tarihi, t.sure_gun ?? 14), `✉ süre sonu`, 'sari');
  }

  const aySar = (fark: number) => {
    const d = new Date(Date.UTC(yil, aySayi - 1 + fark, 1));
    setAy(d.toISOString().slice(0, 7));
  };

  const hucreler = [
    ...Array.from({ length: bosluk }, () => null),
    ...Array.from({ length: gunSayisi }, (_, i) => i + 1),
  ];

  return (
    <>
      <h2>Takvim</h2>
      <Not>
        Takvim, duruşma ve tebligat tarihlerini gösterir. Bu iki veri UYAP
        Vatandaş Portalı'nda sunulmadığından takvim şimdilik yalnız elle eklenen
        kayıtlarla dolar; avukat portalı entegrasyonuyla otomatik dolacaktır.
      </Not>
      <p className="alt">Duruşmalar ve tebligat süre sonları bir arada.</p>

      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="eylem ikincil" onClick={() => aySar(-1)}>‹</button>
        <b>{ay}</b>
        <button className="eylem ikincil" onClick={() => aySar(1)}>›</button>
      </div>

      <div className="takvim">
        {GUNLER.map((g) => <div key={g} className="basliksatir">{g}</div>)}
        {hucreler.map((g, i) =>
          g === null ? (
            <div key={`b${i}`} className="disay" />
          ) : (
            (() => {
              const iso = `${ay}-${String(g).padStart(2, '0')}`;
              return (
                <div key={iso} style={iso === bugun ? { outline: '2px solid var(--vurgu)' } : undefined}>
                  <div className="gunno">{g}</div>
                  {(olaylar[iso] ?? []).map((o, k) => (
                    <span key={k} className={`olay ${o.sinif}`}>{o.metin}</span>
                  ))}
                </div>
              );
            })()
          ),
        )}
      </div>
    </>
  );
}
