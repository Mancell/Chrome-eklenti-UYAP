import { useState } from 'react';
import { useTablo, trTarih, indirmeBaglantisi, type Satir } from '../lib/veri';

/** Ağaç düğümü: klasör başlığı ya da evrak satırı. */
type Dugum =
  | { tip: 'klasor'; ad: string; derinlik: number; adet: number }
  | { tip: 'evrak'; satir: Satir; derinlik: number; ek: boolean };

/**
 * UYAP'ın ağacını birebir kurar. Yapı çok seviyeli:
 *   Tüm Evraklar › 2025/404 (Ceza Dava Dosyası) › Talimat Gelen Evrak (12)
 *     └ Talimat Gelen Evrak 02/06/2025
 *         └ Ek 1, Ek 2, Ek 3
 * Düz liste "neyin neye ait olduğunu" kaybediyordu; klasör yolu ve ana/ek bağı
 * burada tekrar ağaca dönüşüyor.
 */
function klasorAgaci(satirlar: Satir[]): Dugum[] {
  const sirala = (a: Satir, b: Satir) => (a.sira ?? 0) - (b.sira ?? 0);
  // Klasör yolu → o klasördeki KÖK evraklar (ekler ana evrağın altına gider).
  const gruplar = new Map<string, Satir[]>();
  for (const e of satirlar) {
    if (e.ana_evrak_ref) continue;                 // ek: ana evrağın altında
    const yol = String(e.klasor ?? '');
    if (!gruplar.has(yol)) gruplar.set(yol, []);
    gruplar.get(yol)!.push(e);
  }

  const cikti: Dugum[] = [];
  let oncekiParcalar: string[] = [];
  for (const [yol, evraklar] of gruplar) {
    // Kök klasör dava adının kendisi (üstte başlıkta zaten var) → atlanıyor.
    const parcalar = yol ? yol.split(' › ').slice(1) : [];
    // Yalnız DEĞİŞEN seviyeleri yaz: ortak üst klasörler tekrar edilmesin.
    parcalar.forEach((ad, i) => {
      if (oncekiParcalar[i] === ad) return;
      cikti.push({ tip: 'klasor', ad, derinlik: i, adet: i === parcalar.length - 1 ? evraklar.length : 0 });
    });
    oncekiParcalar = parcalar;

    const taban = parcalar.length;
    for (const ana of [...evraklar].sort(sirala)) {
      cikti.push({ tip: 'evrak', satir: ana, derinlik: taban, ek: false });
      const ekler = satirlar.filter((x) => x.ana_evrak_ref === ana.uyap_ref).sort(sirala);
      for (const ek of ekler) cikti.push({ tip: 'evrak', satir: ek, derinlik: taban + 1, ek: true });
    }
  }

  // Ana evrağı gelmemiş ekler (sayfalama kesintisi) kaybolmasın.
  const gosterilen = new Set(cikti.filter((d) => d.tip === 'evrak').map((d: any) => d.satir.id));
  for (const kalan of satirlar.filter((e) => !gosterilen.has(e.id)).sort(sirala)) {
    cikti.push({ tip: 'evrak', satir: kalan, derinlik: 1, ek: Boolean(kalan.ana_evrak_ref) });
  }
  return cikti;
}

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
                  {klasorAgaci(evraklar.satirlar).map((d, i) =>
                    d.tip === 'klasor' ? (
                      // Klasör başlığı: tüm satırı kaplar, evraklardan ayrışsın.
                      <tr key={`k${i}`}>
                        <td colSpan={4} style={{
                          paddingLeft: 12 + d.derinlik * 22,
                          background: '#faf8f8', fontWeight: 600, color: '#605d5d',
                        }}>
                          📂 {d.ad}{d.adet ? ` (${d.adet})` : ''}
                        </td>
                      </tr>
                    ) : (
                      <tr key={d.satir.id}>
                        <td>{trTarih(d.satir.evrak_tarihi)}</td>
                        <td style={{ paddingLeft: 12 + d.derinlik * 22 }}>
                          {d.ek ? '└ 📎 ' : '📄 '}
                          {d.satir.evrak_tipi ?? '—'}
                        </td>
                        <td>{d.satir.gonderen ?? '—'}</td>
                        <td>
                          {d.satir.uyap_link ? (
                            <>
                              <a href={d.satir.uyap_link} target="_blank" rel="noreferrer noopener">Görüntüle ↗</a>
                              {' · '}
                              <a href={indirmeBaglantisi(d.satir.uyap_link) ?? '#'}
                                 target="_blank" rel="noreferrer noopener">İndir ↓</a>
                            </>
                          ) : '—'}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
