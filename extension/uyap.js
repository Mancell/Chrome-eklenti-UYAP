// İçerik betiği (ISOLATED world) — vatandas.uyap.gov.tr sayfasında çalışır.
//
// Buradan yapılan fetch'ler AYNI KÖKEN olduğu için kullanıcının ZATEN AÇIK olan
// oturum çerezini taşır. Kullanıcı adı/şifre HİÇBİR YERDE tutulmaz, okunmaz,
// gönderilmez — eklenti oturum açmaz, açık oturumu kullanır.
//
// ┌──────────────────────────────────────────────────────────────────────────┐
// │ FAZ 0 — KEŞİF GEREKİYOR                                                  │
// │ Aşağıdaki `UCLAR` boş: vatandaş portalının iç uçları herkese açık        │
// │ dokümante değil ve UYDURMA ENDPOINT YAZILMADI. Doldurmak için:           │
// │   1. Popup → "Keşif modu"nu aç.                                          │
// │   2. vatandas.uyap.gov.tr'ye gir; Dosyalarım → bir dosya → safahat →     │
// │      duruşmalar → bir evrak indir → e-tebligat.                          │
// │   3. Popup → "Keşif kaydını indir" (JSON).                               │
// │   4. Kaydı `docs/uyap-uclari.md`'ye işle, `UCLAR`'ı doldur.              │
// └──────────────────────────────────────────────────────────────────────────┘
//
// KIRMIZI ÇİZGİ: bot tespitini atlatmak için insan-taklidi gecikme/desen YOK.
// background.js'teki sabit 800 ms yalnız nezakettir.

const KESIF_HATASI =
  'UYAP uç keşfi tamamlanmadı. Popup’tan "Keşif modu"nu açıp portalda gezinin, ' +
  'kaydı indirip extension/uyap.js içindeki UCLAR’ı doldurun (bkz. docs/uyap-uclari.md).';

// Faz 0 çıktısı buraya. Her biri: { url, metod, govde(fn|null) }
const UCLAR = {
  dosyaListesi: null,
  safahat: null,
  durusmalar: null,
  evrakListesi: null,
  evrakIndir: null,
  tebligatlar: null,
};

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

/** UYAP satır başına kimlik vermezse ref'i içerikten türetiriz — senkron
 *  idempotent kalsın diye DETERMİNİSTİK olmalı. Kripto değil, sadece kararlı. */
function ref(...parcalar) {
  const s = parcalar.map((p) => String(p ?? '').trim()).join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** "12.03.2024" / "2024-03-12" / "" → ISO ya da null. RPC de bozuk tarihe
 *  dayanıklı; burada temizlemek yalnız veriyi düzgün tutmak için. */
function tarih(d) {
  const s = String(d ?? '').trim();
  if (!s) return null;
  const tr = s.match(/^(\d{2})[./](\d{2})[./](\d{4})/);
  if (tr) return `${tr[3]}-${tr[2]}-${tr[1]}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? iso[0] : null;
}

async function json(uc, ...arg) {
  if (!uc) throw new Error(KESIF_HATASI);
  const y = await fetch(uc.url, {
    method: uc.metod || 'GET',
    credentials: 'include',            // kullanıcının KENDİ oturumu
    headers: uc.metod === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {},
    body: uc.govde ? uc.govde(...arg) : undefined,
  });
  if (!y.ok) throw new Error(`UYAP ${y.status} — oturumunuz düşmüş olabilir, sayfayı yenileyip tekrar girin.`);
  return y.json();
}

// ---------------------------------------------------------------------------
// Veri çekiciler — Faz 0'dan sonra gövdeleri dolar.
// Her biri RPC'nin beklediği şekilde NORMALİZE edilmiş dizi döndürür.
// ---------------------------------------------------------------------------

/** → [{ uyap_ref, dosya_no, birim, yargi_turu, dosya_turu, taraflar, acilis_tarihi, durum }] */
async function dosyalar() {
  const veri = await json(UCLAR.dosyaListesi);
  // ÖRNEK (keşiften sonra alan adları gerçek yanıta göre düzeltilecek):
  // return veri.data.map((k) => ({
  //   uyap_ref: String(k.dosyaId), dosya_no: k.dosyaNo, birim: k.birimAdi,
  //   yargi_turu: k.yargiTuru, dosya_turu: k.dosyaTuru, taraflar: k.taraflar,
  //   acilis_tarihi: tarih(k.acilisTarihi), durum: k.dosyaDurumu,
  // }));
  void veri;
  throw new Error(KESIF_HATASI);
}

/** → [{ uyap_ref, dosya_ref, tarih, islem, aciklama }] */
async function safahat(dosyaRef) {
  const veri = await json(UCLAR.safahat, dosyaRef);
  // UYAP safahat satırları genelde ID'siz → ref içerikten türetilir.
  // return veri.data.map((k) => ({
  //   uyap_ref: ref(dosyaRef, k.tarih, k.islem), dosya_ref: dosyaRef,
  //   tarih: tarih(k.tarih), islem: k.islem, aciklama: k.aciklama,
  // }));
  void veri; void ref;
  throw new Error(KESIF_HATASI);
}

/** → [{ uyap_ref, dosya_ref, tarih, saat, salon, tur, durum }] */
async function durusmalar(dosyaRef) {
  const veri = await json(UCLAR.durusmalar, dosyaRef);
  void veri;
  throw new Error(KESIF_HATASI);
}

/** → [{ uyap_ref, dosya_ref, evrak_tipi, evrak_tarihi, gonderen, uyap_link }] */
async function evrakListesi(dosyaRef) {
  const veri = await json(UCLAR.evrakListesi, dosyaRef);
  void veri;
  throw new Error(KESIF_HATASI);
}

/** Tek evrakın baytı → base64. Metin ÇIKARILMAZ burada (background yapar). */
async function evrakIndir(evrakRef) {
  if (!UCLAR.evrakIndir) throw new Error(KESIF_HATASI);
  const uc = UCLAR.evrakIndir;
  const y = await fetch(uc.url, {
    method: uc.metod || 'GET',
    credentials: 'include',
    body: uc.govde ? uc.govde(evrakRef) : undefined,
  });
  if (!y.ok) throw new Error(`Evrak indirilemedi (UYAP ${y.status}).`);
  const bayt = new Uint8Array(await y.arrayBuffer());
  let ikili = '';
  for (let i = 0; i < bayt.length; i++) ikili += String.fromCharCode(bayt[i]);
  return btoa(ikili);
}

/** → [{ uyap_ref, dosya_ref, konu, gonderen, teblig_tarihi, sure_gun, durum }] */
async function tebligatlar() {
  const veri = await json(UCLAR.tebligatlar);
  void veri;
  throw new Error(KESIF_HATASI);
}

// ---------------------------------------------------------------------------
// Keşif hasadı
//
// MAIN world'deki kesif.js `chrome.*` göremiyor; kayıtları postMessage ile
// veriyor. ESKİ TASARIM buradan MAIN world'e "keşif açık mı?" diye cevap
// veriyordu — ama kesif.js `document_start`'ta soruyor, bu betik
// `document_idle`'da yüklüyor: soru cevapsız kalıyor ve HİÇBİR ŞEY
// KAYDEDİLMİYORDU. Artık bayrak yok: kesif.js yalnız keşif açıkken sayfaya
// kaydediliyor (popup.js → chrome.scripting), varlığı bayrağın kendisi.
// ---------------------------------------------------------------------------

/** MAIN world'den kayıt tamponunu ister. kesif.js kurulu değilse null döner. */
function kesifHasadi(zamanAsimiMs = 1500) {
  return new Promise((coz) => {
    const dinleyici = (e) => {
      if (e.source !== window || e.data?.__uyapKesif !== 'kayitlar') return;
      window.removeEventListener('message', dinleyici);
      clearTimeout(sayac);
      coz({ kayitlar: e.data.kayitlar, kaynaklar: e.data.kaynaklar, sinir: e.data.sinir });
    };
    window.addEventListener('message', dinleyici);
    // Zaman aşımı ŞART: keşif modu kapalıysa kesif.js sayfada yok ve cevap
    // asla gelmez — popup sonsuza dek beklemesin.
    const sayac = setTimeout(() => {
      window.removeEventListener('message', dinleyici);
      coz(null);
    }, zamanAsimiMs);
    window.postMessage({ __uyapKesif: 'ver' }, '*');
  });
}

// ---------------------------------------------------------------------------
// Arka plandan gelen istekler
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((istek, _gonderen, yanitla) => {
  (async () => {
    try {
      switch (istek.tip) {
        case 'dosyalar':      return yanitla({ veri: await dosyalar() });
        case 'safahat':       return yanitla({ veri: await safahat(istek.dosyaRef) });
        case 'durusmalar':    return yanitla({ veri: await durusmalar(istek.dosyaRef) });
        case 'evrak-listesi': return yanitla({ veri: await evrakListesi(istek.dosyaRef) });
        case 'evrak-indir':   return yanitla({ base64: await evrakIndir(istek.evrakRef) });
        case 'tebligatlar':   return yanitla({ veri: await tebligatlar() });
        case 'kesif-al':      return yanitla({ kesif: await kesifHasadi() });
        default:              return yanitla({ hata: 'Bilinmeyen istek.' });
      }
    } catch (e) {
      yanitla({ hata: e.message });
    }
  })();
  return true;   // async yanıt
});
