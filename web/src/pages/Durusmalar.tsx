import { useState } from 'react';
import { useTablo, trTarih, bugun, gunEkle } from '../lib/veri';
import { Not } from '../components';

const SEKMELER = ['Yaklaşan', 'Geçmiş', 'Tümü'] as const;

export default function Durusmalar() {
  const { satirlar, yukleniyor, hata } = useTablo('durusmalar', { alan: 'tarih', artan: true });
  const [sekme, setSekme] = useState<(typeof SEKMELER)[number]>('Yaklaşan');

  if (yukleniyor) return <p className="alt">Yükleniyor…</p>;
  if (hata) return <p className="uyari">{hata}</p>;

  const suzulen = satirlar.filter((r) => {
    const t = String(r.tarih ?? '');
    if (sekme === 'Yaklaşan') return t >= bugun;
    if (sekme === 'Geçmiş') return t !== '' && t < bugun;
    return true;
  });

  // Bugün kırmızı, 3 gün içi sarı, ilerisi yeşil, geçmiş nötr.
  const renk = (t: string) =>
    !t ? '' : t === bugun ? 'kirmizi' : t < bugun ? '' : t <= gunEkle(bugun, 3) ? 'sari' : 'yesil';

  return (
    <>
      <h2>Duruşmalar</h2>
      <Not>
        <b>UYAP Vatandaş Portalı duruşma verisi sunmuyor.</b> Duruşma günleri
        avukat portalı entegrasyonuyla (e-imza ile giriş) gelecektir. Aşağıda
        elle eklenen kayıtları görürsünüz.
      </Not>
      <p className="alt">Bugünkü duruşma kırmızı, üç gün içindekiler sarı gösterilir.</p>

      <div style={{ marginBottom: 12 }}>
        {SEKMELER.map((s) => (
          <button
            key={s}
            className={`eylem ${sekme === s ? '' : 'ikincil'}`}
            style={{ marginRight: 6 }}
            onClick={() => setSekme(s)}
          >
            {s}
          </button>
        ))}
      </div>

      {suzulen.length === 0 ? (
        <div className="bos">Bu görünümde duruşma yok.</div>
      ) : (
        <div className="sarma">
          <table>
            <thead>
              <tr><th>Tarih</th><th>Saat</th><th>Salon</th><th>Tür</th><th>Durum</th></tr>
            </thead>
            <tbody>
              {suzulen.map((r) => (
                <tr key={r.id}>
                  <td className={renk(String(r.tarih ?? ''))}>{trTarih(r.tarih)}</td>
                  <td>{r.saat ?? '—'}</td>
                  <td>{r.salon ?? '—'}</td>
                  <td>{r.tur ?? '—'}</td>
                  <td>{r.durum ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
