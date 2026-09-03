// KEŞİF MODU — MAIN world, `document_start`.
//
// Bu betik YALNIZ keşif modu açıkken sayfaya kaydedilir
// (`chrome.scripting.registerContentScripts`, bkz. popup.js). Yani betiğin
// VARLIĞI bayrağın kendisi — içinde "açık mı?" diye soran bir kontrol yok.
//
// Neden böyle: önceki sürüm `document_start`'ta ISOLATED world'deki uyap.js'e
// "keşif açık mı?" diye postMessage atıyordu. uyap.js `document_idle`'da
// yükleniyor, yani soru sorulduğunda HENÜZ YOK. Cevap hiç gelmiyor, bayrak
// sonsuza dek false kalıyor, hiçbir şey kaydedilmiyordu. El sıkışmayı
// kaldırmak bu sınıf hatayı tümden yok ediyor.
//
// MAIN world şart: sayfanın KENDİ `fetch`/`XHR`'ını sarmalamak gerekiyor.
// ISOLATED world content script'i DOM'u paylaşır ama JS global'lerini
// paylaşmaz — oradan yapılan yama sayfanın isteklerini görmez.
//
// NE KAYDEDİLİR: URL, metod, istek gövdesi, yanıtın ŞEKLİ (alan adları + ilk
// birkaç örnek satır).
// NE KAYDEDİLMEZ: çerez, Authorization başlığı, yanıtın tamamı.
// NEREDE DURUR: yalnız bu sayfanın belleğinde. Kullanıcı "Kaydı kopyala"ya
// basmadıkça hiçbir yere çıkmaz, sekme kapanınca gider.

(() => {
  if (window.__uyapKesifKurulu) return;   // aynı sayfaya iki kez kurulmasın
  window.__uyapKesifKurulu = true;

  const SINIR = 200;   // kayıt tavanı; sayfa belleği şişmesin
  const ORNEK = 3;     // yanıttan saklanacak örnek satır sayısı

  const kayitlar = [];
  const kaynaklar = [];    // PerformanceObserver teşhisi
  // Aranan tek şey bir `.ajx` ucu (Dosyalarım listesi). Ayrı listede toplanıyor
  // ki 200 kaydın içinde kaybolmasın — bkz. docs/uyap-uclari.md
  const ajxIstekleri = [];

  /** Yanıttan yalnız ŞEKİL çıkarır — kişisel veriyi bütün hâlde saklamamak için. */
  function sekil(v, derinlik = 0) {
    if (v === null) return 'null';
    if (derinlik > 3) return '…';
    if (Array.isArray(v)) {
      return { tip: 'dizi', uzunluk: v.length, ornek: v.slice(0, ORNEK).map((x) => sekil(x, derinlik + 1)) };
    }
    if (typeof v === 'object') {
      const o = {};
      for (const k of Object.keys(v).slice(0, 40)) o[k] = sekil(v[k], derinlik + 1);
      return o;
    }
    const s = String(v);
    return s.length > 120 ? s.slice(0, 120) + '…' : s;
  }

  function isle(url, metod, govde, yanitMetni) {
    if (kayitlar.length >= SINIR) return;
    let yanit;
    try {
      yanit = sekil(JSON.parse(yanitMetni));
    } catch {
      yanit = { tip: 'metin', uzunluk: (yanitMetni || '').length, bas: (yanitMetni || '').slice(0, 200) };
    }
    const kayit = {
      zaman: new Date().toISOString(),
      url: String(url),
      metod: metod || 'GET',
      govde: typeof govde === 'string' ? govde.slice(0, 1000) : govde ? '[gövde metin değil]' : '',
      yanit,
    };
    kayitlar.push(kayit);
    if (/\.ajx(\?|$)/.test(String(url))) ajxIstekleri.push(kayit);
  }

  // --- fetch kancası -------------------------------------------------------
  const asilFetch = window.fetch;
  if (typeof asilFetch === 'function') {
    window.fetch = async function (girdi, ayar) {
      const yanit = await asilFetch.apply(this, arguments);
      try {
        const url = typeof girdi === 'string' ? girdi : girdi?.url;
        // Yanıtı KLONDAN okuyoruz; sayfanın kendi okuması bozulmasın.
        const metin = await yanit.clone().text();
        isle(url, ayar?.method || girdi?.method || 'GET', ayar?.body, metin);
      } catch { /* kayıt best-effort; sayfayı asla bozmaz */ }
      return yanit;
    };
  }

  // --- XHR kancası ---------------------------------------------------------
  // Prototip yamalanıyor: jQuery gibi kütüphaneler istek anında `new
  // XMLHttpRequest()` yapıp prototip metodlarını çağırdığı için bu yeterli.
  const XHR = window.XMLHttpRequest;
  if (XHR && XHR.prototype) {
    const asilAc = XHR.prototype.open;
    const asilYolla = XHR.prototype.send;
    XHR.prototype.open = function (metod, url) {
      this.__kesif = { metod, url };
      return asilAc.apply(this, arguments);
    };
    XHR.prototype.send = function (govde) {
      if (this.__kesif) {
        this.addEventListener('load', () => {
          try {
            // responseType 'json'/'blob' ise responseText erişimi fırlatır.
            let metin = '';
            try { metin = this.responseText || ''; }
            catch { metin = JSON.stringify(this.response ?? ''); }
            isle(this.__kesif.url, this.__kesif.metod, govde, metin);
          } catch { /* best-effort */ }
        });
      }
      return asilYolla.apply(this, arguments);
    };
  }

  // --- Teşhis: her ağ isteği, nasıl yapıldığına bakmadan ------------------
  // Kancalar 0 yakalayıp burada `.ajx` istekleri görünüyorsa kanca yerleşimi
  // yanlış. Burada da hiçbir şey yoksa UYAP tam sayfa form POST kullanıyor ve
  // ajax kaydı yerine DOM kazıma gerekiyor. Bu ikisini ayırt etmenin başka
  // yolu yok — sessiz bir kaydediciden "neden sessiz" sorusu çıkmıyor.
  try {
    new PerformanceObserver((liste) => {
      for (const g of liste.getEntries()) {
        if (kaynaklar.length >= SINIR * 2) return;
        kaynaklar.push({ ad: g.name, tip: g.initiatorType || g.entryType });
      }
    }).observe({ type: 'resource', buffered: true });
  } catch { /* PerformanceObserver yoksa teşhis olmadan devam */ }

  // Sayfa yüklemesinin kendisi (tam sayfa POST'lar burada görünür).
  try {
    for (const g of performance.getEntriesByType('navigation')) {
      kaynaklar.push({ ad: g.name, tip: 'navigation' });
    }
  } catch { /* yoksa geç */ }

  // --- Hasat: uyap.js (ISOLATED) 'ver' der, tamponu geri veririz ----------
  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    if (e.data?.__uyapKesif === 'ver') {
      window.postMessage(
        { __uyapKesif: 'kayitlar', kayitlar, kaynaklar, ajxIstekleri, sinir: SINIR },
        '*',
      );
    }
  });
})();
