import { useState } from 'react';
import { useTablo, trTarih } from '../lib/veri';

export default function Evraklar() {
  const { satirlar, yukleniyor, hata } = useTablo('evraklar', { alan: 'evrak_tarihi' });
  const [ara, setAra] = useState('');

  if (yukleniyor) return <p className="alt">Yükleniyor…</p>;
  if (hata) return <p className="uyari">{hata}</p>;

  const q = ara.trim().toLocaleLowerCase('tr');
  const suzulen = !q
    ? satirlar
    : satirlar.filter((e) =>
        [e.evrak_tipi, e.gonderen, e.metin]
          .filter(Boolean)
          .some((v: string) => v.toLocaleLowerCase('tr').includes(q)),
      );

  return (
    <>
      <h2>Evraklar</h2>
      <p className="alt">
        Çıkarılmış düz metin içinde arayın. PDF evrakların metni bu sürümde
        çıkarılmıyor — “UYAP'ta aç” ile belgeye gidin.
      </p>

      <input
        value={ara}
        onChange={(e) => setAra(e.target.value)}
        placeholder="Evrak tipi, gönderen veya metin içinde ara…"
        style={{ width: 340, marginBottom: 12 }}
      />

      {suzulen.length === 0 ? (
        <div className="bos">{ara ? 'Eşleşen evrak yok.' : 'Evrak yok.'}</div>
      ) : (
        <div className="sarma">
          <table>
            <thead>
              <tr><th>Tarih</th><th>Tip</th><th>Gönderen</th><th>Metin</th></tr>
            </thead>
            <tbody>
              {suzulen.map((e) => (
                <tr key={e.id}>
                  <td>{trTarih(e.evrak_tarihi)}</td>
                  <td>{e.evrak_tipi ?? '—'}</td>
                  <td>{e.gonderen ?? '—'}</td>
                  <td>
                    {e.metin
                      ? e.metin.slice(0, 220) + (e.metin.length > 220 ? '…' : '')
                      : e.uyap_link
                        ? <a href={e.uyap_link} target="_blank" rel="noreferrer noopener">UYAP'ta aç ↗</a>
                        : 'metin çıkarılamadı'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
