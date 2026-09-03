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

/** Popup kapalıysa sendMessage fırlatır; ilerleme bildirimi kritik değil. */
function bildir(msg) {
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
  const y = await fetch(`${cfg.supabaseUrl}/rest/v1/rpc/eklenti_senkron`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: cfg.supabaseAnon,
      Authorization: `Bearer ${cfg.supabaseAnon}`,
    },
    body: JSON.stringify({ p_token: cfg.token, p_veri: veri }),
  });
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

  const paket = { dosyalar, safahat: [], durusmalar: [], evraklar: [], tebligatlar: [] };
  let indirilen = 0;

  for (const [i, d] of dosyalar.entries()) {
    bildir({ tip: 'ilerleme', mesaj: `Dosya ${i + 1}/${dosyalar.length}: ${d.dosya_no ?? ''}` });

    for (const tip of ['safahat', 'durusmalar', 'evrak-listesi']) {
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
      const { base64 } = await sor(sekme.id, { tip: 'evrak-indir', evrakRef: e.uyap_ref });
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

  try {
    bildir({ tip: 'ilerleme', mesaj: 'e-Tebligat alınıyor…' });
    const { veri } = await sor(sekme.id, { tip: 'tebligatlar' });
    paket.tebligatlar = veri;
  } catch (e) {
    bildir({ tip: 'ilerleme', mesaj: `e-Tebligat atlandı: ${e.message}` });
  }

  bildir({ tip: 'ilerleme', mesaj: 'Panele yazılıyor…' });
  return await rpc(cfg, paket);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.tip === 'senkron-basla') {
    senkronCalistir()
      .then((sonuc) => bildir({ tip: 'bitti', sonuc }))
      .catch((e) => bildir({ tip: 'hata', mesaj: e.message }));
  }

  if (msg.tip === 'baglan') {
    // Boş senkron = token doğrulaması. Hiçbir şey yazmaz.
    ayarlar()
      .then((cfg) => rpc(cfg, {}))
      .then(() => bildir({ tip: 'baglandi' }))
      .catch((e) => bildir({ tip: 'hata', mesaj: e.message }));
  }
});
