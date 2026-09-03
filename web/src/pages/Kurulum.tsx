import { useEffect, useState } from 'react';
import { supabase, tokenUret } from '../supabase';
import { trTarih } from '../lib/veri';

/**
 * Kurulum — kullanıcının tarif ettiği 5 adım.
 *
 * Ham token BİR KEZ görünür: sunucuda yalnız SHA-256 hash'i duruyor, geri
 * üretilemez. Bu yüzden ekranda kalıcı saklamıyoruz, uyarıyı da gizlemiyoruz.
 */
const MAGAZA_URL = 'https://chromewebstore.google.com/';   // yayınlanınca gerçek adresle değişir

export default function Kurulum() {
  const [tokenlar, setTokenlar] = useState<any[]>([]);
  const [yeni, setYeni] = useState<string | null>(null);
  const [ad, setAd] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);

  async function listele() {
    const { data, error } = await supabase
      .from('eklenti_tokenlari')
      .select('id, ad, olusturuldu, son_kullanim, iptal')
      .order('olusturuldu', { ascending: false });
    if (error) setHata(error.message);
    else setTokenlar(data ?? []);
  }
  useEffect(() => { listele(); }, []);

  async function uret() {
    setMesgul(true); setHata(null);
    try {
      setYeni(await tokenUret(ad || 'Chrome'));
      setAd('');
      await listele();
    } catch (e: any) {
      setHata(e.message);
    } finally {
      setMesgul(false);
    }
  }

  async function iptalEt(id: string) {
    if (!confirm('Bu token iptal edilsin mi? Bağlı eklenti artık senkron yapamaz.')) return;
    const { error } = await supabase.from('eklenti_tokenlari').update({ iptal: true }).eq('id', id);
    if (error) setHata(error.message);
    await listele();
  }

  return (
    <>
      <h2>Kurulum</h2>
      <p className="alt">Beş adımda eklentiyi panelinize bağlayın.</p>

      <div className="adim">
        <div className="no">1</div>
        <div>
          <h3>Eklenti token'ı oluşturun</h3>
          <p>
            Bu token, tarayıcı eklentisinin hesabınıza güvenli bağlanmasını sağlar.
            <b> Bir kez gösterilir.</b>
          </p>
          <input
            value={ad}
            onChange={(e) => setAd(e.target.value)}
            placeholder="Cihaz adı (örn. Ofis bilgisayarı)"
            style={{ marginRight: 8, width: 220 }}
          />
          <button className="eylem" onClick={uret} disabled={mesgul}>
            {mesgul ? 'Üretiliyor…' : 'Token oluştur'}
          </button>

          {yeni && (
            <>
              <div className="jeton">{yeni}</div>
              <button className="eylem ikincil" onClick={() => navigator.clipboard.writeText(yeni)}>
                Kopyala
              </button>
              <p className="uyari" style={{ marginTop: 8 }}>
                Bu token bir daha gösterilmeyecek. Kopyalayıp 3. adımda eklentiye yapıştırın.
              </p>
            </>
          )}
        </div>
      </div>

      <div className="adim">
        <div className="no">2</div>
        <div>
          <h3>Chrome eklentisini yükleyin</h3>
          <p>Av. Asistan UYAP &amp; e-Tebligat eklentisini Chrome Web Store'dan ekleyin.</p>
          <a href={MAGAZA_URL} target="_blank" rel="noreferrer noopener">Chrome Web Store'dan ekle ↗</a>
        </div>
      </div>

      <div className="adim">
        <div className="no">3</div>
        <div>
          <h3>Token'ı eklentiye yapıştırın</h3>
          <p>
            Tarayıcının sağ üstündeki Av. Asistan simgesine tıklayın; açılan kutuya 1. adımdaki
            token'ı yapıştırıp <b>Bağlan</b>'a basın. Başka bir şey girmeniz gerekmez.
          </p>
        </div>
      </div>

      <div className="adim">
        <div className="no">4</div>
        <div>
          <h3>UYAP'a girin</h3>
          <p>
            Kullanıcı adı ve şifrenizle{' '}
            <a href="https://vatandas.uyap.gov.tr/main/vatandas/giris.jsp" target="_blank" rel="noreferrer noopener">
              vatandas.uyap.gov.tr
            </a>{' '}
            adresine girip <b>Dosyalarım</b> sayfasına gidin. Şifreniz eklentide veya panelde
            <b> tutulmaz</b>; eklenti yalnızca sizin açtığınız oturumu kullanır.
          </p>
        </div>
      </div>

      <div className="adim">
        <div className="no">5</div>
        <div>
          <h3>Senkronu başlatın</h3>
          <p>
            Eklenti popup'ında <b>Senkronu başlat</b>'a basın. Dosyalarınız, safahat,
            duruşmalar, evraklar ve tebligatlar bu panele akar — senkron sürerken sayfalar
            kendiliğinden dolar.
          </p>
        </div>
      </div>

      <h3 style={{ marginTop: 26 }}>Token'larınız</h3>
      {hata && <p className="uyari">{hata}</p>}
      <div className="sarma">
        <table>
          <thead>
            <tr><th>Ad</th><th>Oluşturuldu</th><th>Son kullanım</th><th>Durum</th><th /></tr>
          </thead>
          <tbody>
            {tokenlar.length === 0 && (
              <tr><td colSpan={5} style={{ color: 'var(--soluk)' }}>Henüz token yok.</td></tr>
            )}
            {tokenlar.map((t) => (
              <tr key={t.id}>
                <td>{t.ad ?? '—'}</td>
                <td>{trTarih(t.olusturuldu)}</td>
                <td>{t.son_kullanim ? trTarih(t.son_kullanim) : 'hiç'}</td>
                <td className={t.iptal ? 'kirmizi' : 'yesil'}>{t.iptal ? 'iptal' : 'etkin'}</td>
                <td>
                  {!t.iptal && (
                    <button className="eylem ikincil" onClick={() => iptalEt(t.id)}>İptal et</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
