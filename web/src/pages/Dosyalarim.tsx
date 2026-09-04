import { useState } from 'react';
import { useTablo, trTarih, indirmeBaglantisi, type Satir } from '../lib/veri';

/**
 * Evrakları UYAP'taki AĞAÇ SIRASINA dizer: her ana evraktan hemen sonra kendi
 * ekleri gelir. Düz liste, hangi ekin hangi evrağa ait olduğunu kaybediyordu.
 */
function evrakAgaci(satirlar: Satir[]): { satir: Satir; derinlik: number }[] {
  const sirala = (a: Satir, b: Satir) => (a.sira ?? 0) - (b.sira ?? 0);
  const kokler = satirlar.filter((e) => !e.ana_evrak_ref).sort(sirala);
  const cikti: { satir: Satir; derinlik: number }[] = [];
  for (const kok of kokler) {
    cikti.push({ satir: kok, derinlik: 0 });
    for (const ek of satirlar.filter((e) => e.ana_evrak_ref === kok.uyap_ref).sort(sirala)) {
      cikti.push({ satir: ek, derinlik: 1 });
    }
  }
  // Ana evrağı gelmemiş ekler (ör. sayfalama kesintisi) kaybolmasın.
  const gosterilen = new Set(cikti.map((x) => x.satir.id));
  for (const kalan of satirlar.filter((e) => !gosterilen.has(e.id)).sort(sirala)) {
    cikti.push({ satir: kalan, derinlik: 1 });
  }
  return cikti;
}

/** Dosya listesi + seçilen dosyanın safahatı ve evrakları. */
export default function Dosyalarim() {
  const dosyalar = useTablo('dosyalar', { alan: 'acilis_tarihi' });
  const safahat = useTablo('safahat', { alan: 'tarih' });
  const [secili, setSecili] = useState<string | null>(null);
  // Seçili dosyanın evrakları: tüm tabloyu çekip filtrelemek 1000 satır
  // limitine takılıyordu (4363 evrak var), bazı dosyalar boş görünüyordu.
  const evraklar = useTablo('evraklar', { alan: 'evrak_tarihi' },
    { alan: 'dosya_id', deger: secili });

  const dosya = dosyalar.satirlar.find((d) => d.id === secili);
  const suz = (r: any[]) => r.filter((x) => x.dosya_id === secili);

  if (dosyalar.yukleniyor) return <p className="alt">Yükleniyor…</p>;
  if (dosyalar.hata) return <p className="uyari">{dosyalar.hata}</p>;

  return (
    <>
      <h2>Dosyalarım</h2>
      <p className="alt">
        UYAP Vatandaş Portalı'nda taraf olduğunuz dosyalar. Satıra tıklayınca detay açılır.
      </p>

      {dosyalar.satirlar.length === 0 ? (
        <div className="bos">
          Henüz dosya yok. <b>Kurulum</b> adımlarını tamamlayıp eklentiden senkronu başlatın.
        </div>
      ) : (
        <div className="sarma">
          <table>
            <thead>
              <tr>
                <th>Dosya No</th><th>Birim</th><th>Yargı Türü</th>
                <th>Rolünüz</th><th>Taraflar</th><th>Açılış</th><th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {dosyalar.satirlar.map((d) => (
                <tr
                  key={d.id}
                  className="secilebilir"
                  onClick={() => setSecili(secili === d.id ? null : d.id)}
                  style={secili === d.id ? { background: '#f8f4f4' } : undefined}
                >
                  <td>{d.dosya_no ?? '—'}</td>
                  <td>{d.birim ?? '—'}</td>
                  <td>{d.yargi_turu ?? '—'}</td>
                  <td>{d.rol ?? '—'}</td>
                  <td>{d.taraflar ?? '—'}</td>
                  <td>{trTarih(d.acilis_tarihi)}</td>
                  <td className={d.durum === 'açık' ? 'yesil' : undefined}>
                    {!d.durum ? '—'
                      : String(d.durum).startsWith('kod:') ? `Durum kodu: ${String(d.durum).slice(4)}`
                      : d.durum}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dosya && (
        <div style={{ marginTop: 26 }}>
          <h3>{dosya.dosya_no} — {dosya.birim}</h3>
          <p className="alt">
            {suz(safahat.satirlar).length} işlem · {evraklar.satirlar.length} evrak
            {evraklar.satirlar[0]?.klasor ? ` · ${evraklar.satirlar[0].klasor}` : ''}
            {dosya.rol ? ` · Rolünüz: ${dosya.rol}` : ''}
          </p>

          <h4>Safahat</h4>
          {suz(safahat.satirlar).length === 0 ? (
            <p className="alt">Bu dosyada işlem kaydı görünmüyor (UYAP bu dosya için safahat vermiyor).</p>
          ) : (
            <div className="sarma">
              <table>
                <thead><tr><th>Tarih</th><th>İşlem</th><th>Açıklama</th></tr></thead>
                <tbody>
                  {suz(safahat.satirlar).map((s) => (
                    <tr key={s.id}>
                      <td>{trTarih(s.tarih)}</td><td>{s.islem ?? '—'}</td><td>{s.aciklama ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h4 style={{ marginTop: 20 }}>Evraklar</h4>
          {evraklar.satirlar.length === 0 ? (
            <p className="alt">Bu dosyada evrak bulunamadı.</p>
          ) : (
            <div className="sarma">
              <table>
                <thead><tr><th>Tarih</th><th>Evrak</th><th>Gönderen</th><th>Belge</th></tr></thead>
                <tbody>
                  {evrakAgaci(evraklar.satirlar).map(({ satir: e, derinlik }) => (
                    <tr key={e.id}>
                      <td>{trTarih(e.evrak_tarihi)}</td>
                      <td style={{ paddingLeft: 12 + derinlik * 22 }}>
                        {derinlik > 0 && <span style={{ color: '#a09a9a' }}>└ </span>}
                        {e.evrak_tipi ?? '—'}
                      </td>
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
        </div>
      )}
    </>
  );
}
