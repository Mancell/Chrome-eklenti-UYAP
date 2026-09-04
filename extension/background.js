// Arka plan servis işçisi — senkron orkestrasyonu.
//
// AKIŞ: popup "senkron-basla" der → açık UYAP sekmesindeki içerik betiğinden
// (uyap.js, KULLANICININ KENDİ oturumu) veri toplanır → evrak baytları burada
// düz metne çevrilir → hepsi TEK `eklenti_senkron` RPC çağrısıyla yazılır.
//
// Tek çağrı bilinçli: RPC tarafında tek transaction → yarım senkron kalmıyor,
// ikinci kez çalıştırınca satır çoğalmıyor (uyap_ref upsert).
//
// KIRMIZI ÇİZGİ: bot tespitini atlatan insan-taklidi gecikme/desen YOK. Aşağıdaki
// bekleme SABİT ve küçük — UYAP'ı yormamak için, gizlenmek için değil. Senkron
// yalnız kullanıcı butona basınca çalışır: alarm yok, sayfa açılınca otomatik
// çekme yok, arka plan taraması yok.
import { evrakMetni } from './evrak.js';
import { SUNUCU, GENEL_ANAHTAR } from './ayarlar.js';

const NEZAKET_MS = 800;
// ponytail: evrak indirme tavanı. Kaldırmak yerine sayfalamak gerekirse
// "en yeni N" yerine "metni olmayanlar" mantığı panelden gelmeli.
const EVRAK_TAVANI = 50;

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

// ponytail: MV3 service worker'ı ~30 sn hareketsizlikte sonlandırıyor ve
// `setTimeout` boşta sayacını SIFIRLAMIYOR — NEZAKET_MS beklemeleri boyunca
// işçi ölüp senkron ortada kalıyordu (kullanıcıya "kesiliyor" gibi görünüyor,
// hiçbir hata da düşmüyor). Resmî "beni canlı tut" API'si yok; yaygın çözüm
// periyodik boş bir chrome.* çağrısıyla sayacı sıfırlamak. Yalnız iş sürerken
// çalışır. `chrome.alarms` kullanılmadı: yeni izin isterdi ve "arka planda
// tarama yok" çizgisini bulanıklaştırırdı.
// Tavan: Chrome bu davranışı değiştirirse doğru yol offscreen document.
let _kalp = null;
function kalbiBaslat() {
  if (_kalp) return;
  _kalp = setInterval(() => chrome.runtime.getPlatformInfo().catch(() => {}), 20000);
}
function kalbiDurdur() {
  if (_kalp) clearInterval(_kalp);
  _kalp = null;
}

/**
 * Durumu HEM canlı mesajla HEM storage'a yazar.
 *
 * MV3'te popup odağı kaybedince kapanıyor ve `sendMessage` alıcısız kalıyor —
 * senkron arka planda sürerken kullanıcı popup'ı tekrar açtığında boş ekran
 * görüyordu ("kesiliyor" izlenimi). `chrome.storage.session` popup kapalıyken
 * de duruyor, tarayıcı kapanınca gidiyor: tam bu iş için doğru yer.
 */
function bildir(msg) {
  chrome.storage.session.set({ sonDurum: msg }).catch(() => {});
  chrome.runtime.sendMessage(msg).catch(() => {});
}

// Kullanıcıdan istenen TEK şey token. Sunucu adresi ve genel anahtar eklentiye
// gömülü (bkz. ayarlar.js) — her kurulumda aynı, kullanıcıya ait değil.
async function ayarlar() {
  const { token } = await chrome.storage.local.get('token');
  if (!token) throw new Error('Önce panelden aldığınız token’ı kaydedin.');
  return { token, supabaseUrl: SUNUCU, supabaseAnon: GENEL_ANAHTAR };
}

// `tabs` izni YOK ve gerekmiyor: url'e göre sorgulamak için host izni yeterli
// (host_permissions'ta vatandas.uyap.gov.tr var). `tabs` eklemek kullanıcıya
// "göz atma geçmişinizi okur" uyarısı gösteriyordu — bedeli karşılığı yok.
async function uyapSekmesi() {
  const [aktif] = await chrome.tabs.query({
    url: 'https://vatandas.uyap.gov.tr/*', active: true, currentWindow: true,
  });
  if (aktif) return aktif;
  const [herhangi] = await chrome.tabs.query({ url: 'https://vatandas.uyap.gov.tr/*' });
  return herhangi || null;
}

function sor(tabId, istek) {
  return new Promise((coz, ret) => {
    chrome.tabs.sendMessage(tabId, istek, (yanit) => {
      if (chrome.runtime.lastError) return ret(new Error(chrome.runtime.lastError.message));
      if (yanit?.hata) return ret(new Error(yanit.hata));
      coz(yanit);
    });
  });
}

/** Supabase RPC. Kimlik ham token'da (anon key yalnız kapıyı açar). */
export async function rpc(cfg, veri) {
  let y;
  try {
    y = await fetch(`${cfg.supabaseUrl}/rest/v1/rpc/eklenti_senkron`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: cfg.supabaseAnon,
        Authorization: `Bearer ${cfg.supabaseAnon}`,
      },
      body: JSON.stringify({ p_token: cfg.token, p_veri: veri }),
      // Zaman aşımı olmadan asılı bir istek kullanıcıyı sonsuza dek
      // "Bağlanılıyor…"da bırakıyordu — sessiz bekleme, hata bile değil.
      signal: AbortSignal.timeout(30000),
    });
  } catch (e) {
    throw new Error(
      e.name === 'TimeoutError' || e.name === 'AbortError'
        ? 'Sunucuya ulaşılamadı (30 sn). İnternetinizi ve eklenti izinlerini kontrol edin.'
        : `Sunucuya bağlanılamadı: ${e.message}`,
    );
  }
  const govde = await y.text();
  if (!y.ok) {
    let mesaj = `Sunucu ${y.status}`;
    try {
      const h = JSON.parse(govde);
      // RPC `raise exception ... using hint` → hint kullanıcıya okunur geliyor.
      mesaj = h.hint || h.message || mesaj;
    } catch { /* düz metin yanıt */ }
    throw new Error(mesaj);
  }
  return JSON.parse(govde || '{}');
}

async function senkronCalistir() {
  const cfg = await ayarlar();
  const sekme = await uyapSekmesi();
  if (!sekme) {
    throw new Error('Açık bir UYAP Vatandaş Portalı sekmesi yok. Önce vatandas.uyap.gov.tr’ye girin.');
  }

  bildir({ tip: 'ilerleme', mesaj: 'Dosya listesi alınıyor…' });
  const { veri: dosyalar } = await sor(sekme.id, { tip: 'dosyalar' });

  // Liste DOM'dan mı okundu, gerçek uçtan mı? Kullanıcı bilsin: sessiz
  // yedeklenme, sonradan sebebi bulunamayan hataların kaynağı olur.
  const domdan = dosyalar.some((d) => d._domdan);
  const idsiz = dosyalar.filter((d) => d._domdan && !d._idVar).length;
  // İlk gerçek çalıştırmada alan eşlemesini kesinleştirmek için: UYAP'ın
  // döndürdüğü alan adlarını popup'a taşıyoruz. Panele YAZILMIYOR.
  const alanlar = dosyalar[0]?._alanlar ?? null;
  for (const d of dosyalar) { delete d._domdan; delete d._idVar; delete d._alanlar; }

  const paket = { dosyalar, safahat: [], durusmalar: [], evraklar: [], tebligatlar: [] };
  let indirilen = 0;

  // Bilinmeyen uçları HİÇ çağırma. Eskiden `durusmalar` her dosya için
  // çağrılıp her seferinde patlıyor, üstüne 800 ms nezaket beklemesi
  // harcanıyordu — 50 dosyada 40 saniye ve 50 hata mesajı, sıfır veri.
  let yetenek = {};
  try { ({ veri: yetenek } = await sor(sekme.id, { tip: 'yetenekler' })); } catch { /* eski sürüm */ }
  const UC_ADI = { safahat: 'safahat', durusmalar: 'durusmalar', 'evrak-listesi': 'evrakListesi' };
  const cekilecek = ['safahat', 'durusmalar', 'evrak-listesi']
    .filter((t) => yetenek[UC_ADI[t]] !== false);
  const atlanan = ['safahat', 'durusmalar', 'evrak-listesi'].filter((t) => !cekilecek.includes(t));

  for (const [i, d] of dosyalar.entries()) {
    bildir({ tip: 'ilerleme', mesaj: `Dosya ${i + 1}/${dosyalar.length}: ${d.dosya_no ?? ''}` });

    // Taraflar ayrı bir uçtan geliyor; liste zaten veriyorsa boşuna isteme.
    if (!d.taraflar && yetenek.taraflar !== false) {
      try {
        const { veri } = await sor(sekme.id, { tip: 'taraflar', dosyaRef: d.uyap_ref });
        const metin = veri
          .map((t) => [t.Rol ?? t.rol, t['Adı'] ?? t.ad ?? t['Adı Soyadı']].filter(Boolean).join(': '))
          .filter(Boolean).join(' · ');
        if (metin) d.taraflar = metin;
      } catch { /* taraflar kritik değil, dosya yine yazılsın */ }
      await bekle(NEZAKET_MS);
    }

    for (const tip of cekilecek) {
      try {
        const { veri } = await sor(sekme.id, { tip, dosyaRef: d.uyap_ref });
        paket[tip === 'evrak-listesi' ? 'evraklar' : tip].push(...veri);
      } catch (e) {
        // Tek bir dosyanın safahatı alınamazsa TÜM senkron düşmesin.
        bildir({ tip: 'ilerleme', mesaj: `${d.dosya_no ?? ''} ${tip}: ${e.message}` });
      }
      await bekle(NEZAKET_MS);
    }
  }

  // Evrak baytları → düz metin. Tavana kadar; kalanlar künye + link olarak yazılır.
  for (const e of paket.evraklar) {
    if (indirilen >= EVRAK_TAVANI) break;
    try {
      const { base64 } = await sor(sekme.id, { tip: 'evrak-indir', evrakRef: e.uyap_ref, dosyaRef: e.dosya_ref });
      const ikili = atob(base64);
      const bayt = new Uint8Array(ikili.length);
      for (let i = 0; i < ikili.length; i++) bayt[i] = ikili.charCodeAt(i);
      e.metin = await evrakMetni(bayt);   // sözleşme: fırlatmaz, en kötü ''
      indirilen++;
      bildir({ tip: 'ilerleme', mesaj: `Evrak ${indirilen}/${Math.min(paket.evraklar.length, EVRAK_TAVANI)}` });
    } catch {
      // İndirilemeyen evrak künyesiyle yazılır; metin RPC'de eskisini silmez.
    }
    await bekle(NEZAKET_MS);
  }

  // e-Tebligat (UETS) BU PORTALDA YOK — ayrı bir sistem (ptt.etebligat.gov.tr)
  // ve kullanıcı ertelemeyi seçti. Eskiden burada karşılığı olmayan bir mesaj
  // gönderiliyor ve her senkronda "Bilinmeyen istek." hatası üretiliyordu.

  bildir({ tip: 'ilerleme', mesaj: 'Panele yazılıyor…' });
  const sonuc = await rpc(cfg, paket);
  if (atlanan.length) sonuc._atlanan = atlanan.join(', ');
  // `_yol` panele YAZILMIYOR; yalnız popup'ta gösteriliyor.
  sonuc._yol = domdan
    ? `liste sayfadan okundu (yedek yol)${idsiz ? ` — ${idsiz} satırda dosyaId yok, safahat/evrak çekilemedi` : ''}`
    : 'liste UYAP ucundan alındı';
  if (alanlar) sonuc._alanlar = alanlar.join(', ');
  return sonuc;
}

// Otomatik senkron soğuması. Kullanıcı UYAP içinde sayfa değiştirdikçe
// `sayfa-hazir` tekrar geliyor; her seferinde baştan senkron etmek UYAP'ı
// gereksiz yorar. `storage.session` tarayıcı kapanınca sıfırlanıyor.
const SOGUMA_MS = 5 * 60 * 1000;
let _suruyor = false;

async function otomatikSenkron() {
  if (_suruyor) return;
  const { token } = await chrome.storage.local.get('token');
  if (!token) return;                       // henüz bağlanmamış; sessiz geç
  const { sonSenkron = 0 } = await chrome.storage.session.get('sonSenkron');
  if (Date.now() - sonSenkron < SOGUMA_MS) return;

  _suruyor = true;
  await chrome.storage.session.set({ sonSenkron: Date.now() });
  kalbiBaslat();
  try {
    bildir({ tip: 'bitti', sonuc: await senkronCalistir() });
  } catch (e) {
    bildir({ tip: 'hata', mesaj: e.message });
  } finally {
    kalbiDurdur();
    _suruyor = false;
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  // Kullanıcı UYAP sayfasını açtı → senkron KENDİLİĞİNDEN başlıyor. Buton yok.
  // chrome.alarms da yok: yalnız kullanıcı UYAP'tayken çalışıyor, arka planda
  // tarama yapılmıyor — savunulabilir olan bu.
  if (msg.tip === 'sayfa-hazir') otomatikSenkron();

  if (msg.tip === 'senkron-basla') {
    kalbiBaslat();
    senkronCalistir()
      .then((sonuc) => bildir({ tip: 'bitti', sonuc }))
      .catch((e) => bildir({ tip: 'hata', mesaj: e.message }))
      .finally(kalbiDurdur);
  }

  if (msg.tip === 'baglan') {
    // Boş senkron = token doğrulaması. Hiçbir şey yazmaz.
    kalbiBaslat();
    ayarlar()
      .then((cfg) => rpc(cfg, {}))
      .then(() => bildir({ tip: 'baglandi' }))
      .catch((e) => bildir({ tip: 'hata', mesaj: e.message }))
      .finally(kalbiDurdur);
  }
});
