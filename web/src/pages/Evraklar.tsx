import { useState } from 'react';
import { useTablo, trTarih, indirmeBaglantisi } from '../lib/veri';

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
        Evraklarınız. <b>Görüntüle</b> belgeyi UYAP'ta açar, <b>İndir</b>
        bilgisayarınıza kaydeder — ikisi de UYAP oturumunuz açıkken çalışır.
        Bu sayfa en fazla 1000 evrak listeler; bir dosyanın <i>tüm</i> evrakları
        için <b>Dosyalarım</b>’dan o dosyaya tıklayın.
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
                    {e.uyap_link ? (
                      <>
                        <a href={e.uyap_link} target="_blank" rel="noreferrer noopener">Görüntüle ↗</a>
                        {' · '}
                        <a href={indirmeBaglantisi(e.uyap_link) ?? '#'}
                           target="_blank" rel="noreferrer noopener">İndir ↓</a>
                      </>
                    ) : '—'}
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
