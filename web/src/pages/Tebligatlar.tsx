import { useTablo, trTarih, gunEkle, kalanGun } from '../lib/veri';
import { Not } from '../components';

/**
 * Tebligatlar. SON GÜN saklanmıyor, hesaplanıyor: teblig_tarihi + sure_gun.
 * Tek kaynak — süre değişirse son gün de değişir, senkronsuz kalmaz.
 */
export default function Tebligatlar() {
  const { satirlar, yukleniyor, hata } = useTablo('tebligatlar', { alan: 'teblig_tarihi' });

  if (yukleniyor) return <p className="alt">Yükleniyor…</p>;
  if (hata) return <p className="uyari">{hata}</p>;

  return (
    <>
      <h2>Tebligatlar</h2>
      <Not>
        <b>e-Tebligat (UETS) ayrı bir sistemdir</b> ve UYAP Vatandaş Portalı'ndan
        gelmez. Entegrasyonu ayrı bir aşamada eklenecektir.
      </Not>
      <p className="alt">Süresi dolmak üzere olanlar kırmızı, bir hafta içindekiler sarı.</p>

      {satirlar.length === 0 ? (
        <div className="bos">Tebligat yok. Eklentiden senkronu başlatınca burada belirir.</div>
      ) : (
        <div className="sarma">
          <table>
            <thead>
              <tr>
                <th>Konu</th><th>Gönderen</th><th>Tebliğ</th>
                <th>Süre</th><th>Son Gün</th><th>Kalan</th><th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {satirlar.map((t) => {
                const son = t.teblig_tarihi ? gunEkle(t.teblig_tarihi, t.sure_gun ?? 14) : null;
                const kalan = son ? kalanGun(son) : null;
                const sinif = kalan === null ? '' : kalan < 0 ? '' : kalan <= 2 ? 'kirmizi' : kalan <= 7 ? 'sari' : 'yesil';
                return (
                  <tr key={t.id}>
                    <td>{t.konu ?? '—'}</td>
                    <td>{t.gonderen ?? '—'}</td>
                    <td>{trTarih(t.teblig_tarihi)}</td>
                    <td>{t.sure_gun ?? 14} gün</td>
                    <td>{trTarih(son)}</td>
                    <td className={sinif}>
                      {kalan === null ? '—' : kalan < 0 ? `${-kalan} gün geçti` : `${kalan} gün`}
                    </td>
                    <td>{t.durum ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
