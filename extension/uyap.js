// İçerik betiği (ISOLATED world) — vatandas.uyap.gov.tr sayfasında çalışır.
//
// Buradan yapılan fetch'ler AYNI KÖKEN olduğu için kullanıcının ZATEN AÇIK olan
// oturum çerezini taşır. Kullanıcı adı/şifre hiçbir yerde tutulmaz, okunmaz,
// gönderilmez — eklenti oturum açmaz, açık oturumu kullanır.
//
// UÇLAR ÖLÇÜLDÜ, tahmin değil: varlığı `nosessionobject` sondasıyla doğrulandı
// (oturumsuz POST'ta var olan uç `<root><error>nosessionobject</error></root>`,
// olmayan uç BOŞ gövde döndürüyor; HTTP kodu ikisinde de 200). Yöntem, olmayan
// uçların listesi ve avukat portalı karşılıkları: docs/uyap-uclari.md
//
// YANITLAR XML. Portal jQuery 2.1.3 + Metronic tabanlı JSP; JSON dönmüyor.
// Bu yüzden ayrıştırma katmanı DOMParser üzerinden.

const TABAN = 'https://vatandas.uyap.gov.tr';

const UCLAR = {
  // ⛔ TEK BİLİNMEYEN: `dosyaId` üreten giriş noktası. Oturum gerektirdiği için
  // oturumsuz sondayla bulunamadı; keşif modu bulacak. Denenip BULUNAMAYAN
  // isimler docs/uyap-uclari.md'de — aynılarını tekrar denemeyin.
  dosyaListesi: null,
  durusmalar: null,      // vatandaş karşılığı bilinmiyor
  evrakListesi: null,    // list_dosya_evraklar.ajx avukat'a özgü

  // ✔ Doğrulanmış
  safahat:     { yol: '/dosya_safahat_bilgileri_brd.ajx', metod: 'POST' },
  taraflar:    { yol: '/dosya_taraf_bilgileri_brd.ajx', metod: 'POST' },
  tahsilat:    { yol: '/dosya_tahsilat_reddiyat_bilgileri_brd.ajx', metod: 'POST' },
  evrakTipi:   { yol: '/get_evrak_mimeType_brd.ajx', metod: 'POST' },
  evrakIndir:  { yol: '/download_document_brd.uyap', metod: 'GET' },
};

const EKSIK_ADLAR = {
  dosyaListesi: 'Dosyalarım listesi',
  durusmalar: 'Duruşma listesi',
  evrakListesi: 'Evrak listesi',
};

/** Keşif bekleyen uç için NET hata — "keşif tamamlanmadı" gibi belirsiz değil. */
function eksikUc(ad) {
  return new Error(
    `${EKSIK_ADLAR[ad] ?? ad} ucu henüz bilinmiyor. ` +
    'Eklenti popup’ından "Keşif modu"nu açıp UYAP sekmesini yenileyin, ' +
    'Dosyalarım sayfasına girin, sonra "Kaydı kopyala" ile kaydı geliştiriciye iletin.',
  );
}

// ---------------------------------------------------------------------------
// XML katmanı
// ---------------------------------------------------------------------------

/** UYAP hata kodlarını kullanıcının anlayacağı cümleye çevirir. */
function hataMetni(kod) {
  if (kod === 'nosessionobject') {
    return 'UYAP oturumunuz düşmüş. Sayfayı yenileyip tekrar giriş yapın.';
  }
  return `UYAP hatası: ${kod}`;
}

/**
 * XML metnini Document'a çevirir; `<root><error>…</error></root>` gelirse
 * fırlatır. Boş gövde = uç yok (bkz. nosessionobject sondası).
 */
function xmlAyristir(metin) {
  if (!metin || !metin.trim()) {
    throw new Error('UYAP boş yanıt döndürdü — bu uç bu portalda yok olabilir.');
  }
  const belge = new DOMParser().parseFromString(metin, 'text/xml');
  // getElementsByTagName / childNodes bilinçli tercih: querySelector ve
  // `children` her XML DOM'unda yok (test ortamı dahil), bunlar her yerde var.
  if (belge.getElementsByTagName('parsererror')[0]) {
    throw new Error('UYAP yanıtı okunamadı (geçersiz XML).');
  }
  const hata = belge.getElementsByTagName('error')[0];
  if (hata) throw new Error(hataMetni((hata.textContent || '').trim()));
  return belge;
}

/**
 * XML'den satır listesi çıkarır — UYAP'ın kesin şeması bilinmediği için
 * GENEL çalışır: en kalabalık tekrarlanan eleman kümesini "satırlar" kabul
 * eder ve her satırın alt eleman adlarını alan adı yapar.
 *
 * Böylece dosya listesi ucu keşfedildiğinde ayrıştırma kodu yeniden yazılmak
 * zorunda kalmıyor; yalnız alan eşlemesi yazılıyor.
 */
/** Eleman tipindeki alt düğümler (nodeType 1). `children` her DOM'da yok. */
function cocuklar(el) {
  const c = [];
  for (const d of el.childNodes || []) if (d.nodeType === 1) c.push(d);
  return c;
}

function xmlSatirlar(belge) {
  const kok = belge.documentElement;
  if (!kok) return [];

  // Aynı etiket adına sahip kardeşleri grupla; en kalabalık grup satır kümesi.
  const gruplar = new Map();
  const gez = (el) => {
    const cs = cocuklar(el);
    const sayac = new Map();
    for (const c of cs) sayac.set(c.tagName, (sayac.get(c.tagName) || 0) + 1);
    for (const [ad, n] of sayac) {
      if (n > 1) {
        const mevcut = gruplar.get(ad);
        if (!mevcut || n > mevcut.n) gruplar.set(ad, { n, ebeveyn: el });
      }
    }
    for (const c of cs) gez(c);
  };
  gez(kok);

  let enIyi = null;
  for (const [ad, g] of gruplar) if (!enIyi || g.n > enIyi.g.n) enIyi = { ad, g };
  if (!enIyi) return [];

  return cocuklar(enIyi.g.ebeveyn)
    .filter((c) => c.tagName === enIyi.ad)
    .map((satir) => {
      const o = {};
      const alanlar = cocuklar(satir);
      if (!alanlar.length) return { deger: (satir.textContent || '').trim() };
      for (const a of alanlar) o[a.tagName] = (a.textContent || '').trim();
      for (const nit of satir.attributes || []) o[nit.name] = nit.value;
      return o;
    });
}

async function cagir(ucAdi, govde) {
  const uc = UCLAR[ucAdi];
  if (!uc) throw eksikUc(ucAdi);
  const y = await fetch(TABAN + uc.yol, {
    method: uc.metod,
    credentials: 'include',              // kullanıcının KENDİ oturumu
    headers: uc.metod === 'POST' ? { 'Content-Type': 'application/json' } : {},
    body: uc.metod === 'POST' ? JSON.stringify(govde || {}) : undefined,
  });
  if (!y.ok) throw new Error(`UYAP ${y.status} — oturumunuz düşmüş olabilir.`);
  return xmlSatirlar(xmlAyristir(await y.text()));
}

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

/** Deterministik ref — senkron idempotent kalsın. Kripto değil, kararlı. */
function ref(...parcalar) {
  const s = parcalar.map((p) => String(p ?? '').trim()).join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** "12.03.2024" / "2024-03-12" / "" → ISO ya da null. */
function tarih(d) {
  const s = String(d ?? '').trim();
  if (!s) return null;
  const tr = s.match(/^(\d{2})[./](\d{2})[./](\d{4})/);
  if (tr) return `${tr[3]}-${tr[2]}-${tr[1]}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? iso[0] : null;
}

/** Satırdan ilk dolu alanı seçer — UYAP alan adları uçtan uca değişebiliyor. */
function alan(satir, ...adaylar) {
  for (const a of adaylar) {
    for (const k of Object.keys(satir)) {
      if (k.toLowerCase() === a.toLowerCase() && String(satir[k]).trim()) return satir[k];
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Veri çekiciler
// ---------------------------------------------------------------------------

async function dosyalar() {
  if (!UCLAR.dosyaListesi) throw eksikUc('dosyaListesi');
  return (await cagir('dosyaListesi')).map((s) => ({
    uyap_ref: String(alan(s, 'dosyaId', 'dosyaNo', 'id') ?? ref(JSON.stringify(s))),
    dosya_no: alan(s, 'dosyaNo', 'esasNo'),
    birim: alan(s, 'birimAdi', 'birim', 'mahkeme'),
    yargi_turu: alan(s, 'yargiTuru', 'yargiTuruAdi'),
    dosya_turu: alan(s, 'dosyaTuru', 'dosyaTuruAdi'),
    taraflar: alan(s, 'taraflar', 'tarafAdi'),
    acilis_tarihi: tarih(alan(s, 'acilisTarihi', 'dosyaAcilisTarihi')),
    durum: alan(s, 'dosyaDurumu', 'durum'),
  }));
}

async function safahat(dosyaRef) {
  return (await cagir('safahat', { dosyaId: dosyaRef })).map((s) => ({
    uyap_ref: ref(dosyaRef, alan(s, 'tarih', 'islemTarihi'), alan(s, 'islem', 'aciklama')),
    dosya_ref: dosyaRef,
    tarih: tarih(alan(s, 'tarih', 'islemTarihi')),
    islem: alan(s, 'islem', 'islemTuru', 'aciklama'),
    aciklama: alan(s, 'aciklama', 'detay'),
  }));
}

async function durusmalar(dosyaRef) {
  if (!UCLAR.durusmalar) throw eksikUc('durusmalar');
  return (await cagir('durusmalar', { dosyaId: dosyaRef })).map((s) => ({
    uyap_ref: ref(dosyaRef, alan(s, 'tarih', 'durusmaTarihi'), alan(s, 'saat')),
    dosya_ref: dosyaRef,
    tarih: tarih(alan(s, 'tarih', 'durusmaTarihi')),
    saat: alan(s, 'saat', 'durusmaSaati'),
    salon: alan(s, 'salon', 'salonAdi'),
    tur: alan(s, 'tur', 'durusmaTuru'),
    durum: alan(s, 'durum'),
  }));
}

async function evrakListesi(dosyaRef) {
  if (!UCLAR.evrakListesi) throw eksikUc('evrakListesi');
  return (await cagir('evrakListesi', { dosyaId: dosyaRef })).map((s) => ({
    uyap_ref: String(alan(s, 'evrakId', 'id') ?? ref(dosyaRef, JSON.stringify(s))),
    dosya_ref: dosyaRef,
    evrak_tipi: alan(s, 'evrakTipi', 'turAdi', 'evrakTuru'),
    evrak_tarihi: tarih(alan(s, 'evrakTarihi', 'tarih')),
    gonderen: alan(s, 'gonderen', 'gonderenAdi'),
    uyap_link: `${TABAN}/view_document_brd.uyap?evrakId=${encodeURIComponent(alan(s, 'evrakId', 'id') ?? '')}&dosyaId=${encodeURIComponent(dosyaRef)}`,
  }));
}

/** Evrak baytı → base64. Metin ÇIKARILMAZ burada (background yapar). */
async function evrakIndir(evrakRef, dosyaRef) {
  const q = new URLSearchParams({ evrakId: evrakRef, dosyaId: dosyaRef ?? '' });
  const y = await fetch(`${TABAN}${UCLAR.evrakIndir.yol}?${q}`, { credentials: 'include' });
  if (!y.ok) throw new Error(`Evrak indirilemedi (UYAP ${y.status}).`);
  const bayt = new Uint8Array(await y.arrayBuffer());
  let ikili = '';
  for (let i = 0; i < bayt.length; i++) ikili += String.fromCharCode(bayt[i]);
  return btoa(ikili);
}

/**
 * Uç sağlık kontrolü — `nosessionobject` imzasını kullanır. Sessiz çökme yerine
 * "hangi uç erişilebilir" raporu; popup bunu gösteriyor.
 */
async function ucSagligi() {
  const rapor = {};
  for (const [ad, uc] of Object.entries(UCLAR)) {
    if (!uc) { rapor[ad] = 'bilinmiyor (keşif bekliyor)'; continue; }
    try {
      const y = await fetch(TABAN + uc.yol, {
        method: uc.metod,
        credentials: 'include',
        headers: uc.metod === 'POST' ? { 'Content-Type': 'application/json' } : {},
        body: uc.metod === 'POST' ? '{}' : undefined,
      });
      const metin = (await y.text()).trim();
      rapor[ad] = !metin ? 'uç yok'
        : metin.includes('nosessionobject') ? 'var, oturum yok'
        : 'var, yanıt verdi';
    } catch (e) {
      rapor[ad] = 'ulaşılamadı: ' + e.message;
    }
  }
  return rapor;
}

// ---------------------------------------------------------------------------
// Keşif hasadı — MAIN world'deki kesif.js tamponunu ister.
// ---------------------------------------------------------------------------
function kesifHasadi(zamanAsimiMs = 1500) {
  return new Promise((coz) => {
    const dinleyici = (e) => {
      if (e.source !== window || e.data?.__uyapKesif !== 'kayitlar') return;
      window.removeEventListener('message', dinleyici);
      clearTimeout(sayac);
      coz({ kayitlar: e.data.kayitlar, kaynaklar: e.data.kaynaklar, ajxIstekleri: e.data.ajxIstekleri });
    };
    window.addEventListener('message', dinleyici);
    // Zaman aşımı ŞART: keşif kapalıysa kesif.js sayfada yok, cevap hiç gelmez.
    const sayac = setTimeout(() => {
      window.removeEventListener('message', dinleyici);
      coz(null);
    }, zamanAsimiMs);
    window.postMessage({ __uyapKesif: 'ver' }, '*');
  });
}

// ---------------------------------------------------------------------------
// Arka planla iletişim
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((istek, _gonderen, yanitla) => {
  (async () => {
    try {
      switch (istek.tip) {
        case 'dosyalar':      return yanitla({ veri: await dosyalar() });
        case 'safahat':       return yanitla({ veri: await safahat(istek.dosyaRef) });
        case 'durusmalar':    return yanitla({ veri: await durusmalar(istek.dosyaRef) });
        case 'evrak-listesi': return yanitla({ veri: await evrakListesi(istek.dosyaRef) });
        case 'evrak-indir':   return yanitla({ base64: await evrakIndir(istek.evrakRef, istek.dosyaRef) });
        case 'uc-sagligi':    return yanitla({ rapor: await ucSagligi() });
        case 'kesif-al':      return yanitla({ kesif: await kesifHasadi() });
        default:              return yanitla({ hata: 'Bilinmeyen istek.' });
      }
    } catch (e) {
      yanitla({ hata: e.message });
    }
  })();
  return true;   // async yanıt
});

// Sayfa hazır → arka plana haber ver. Senkronu O başlatıyor (token varsa ve
// soğuma süresi geçtiyse). Kullanıcı buton aramıyor; otomatik ama YALNIZ
// kullanıcı UYAP'tayken — arka planda tarama yok, chrome.alarms yok.
chrome.runtime.sendMessage({ tip: 'sayfa-hazir', url: location.href }).catch(() => {});
