// KEŞİF MODU — MAIN world. Varsayılan KAPALI.
//
// Neden var: vatandas.uyap.gov.tr'nin iç uçları herkese açık dokümante değil.
// Uydurma endpoint yazmak yerine, kullanıcı portalda normal gezinirken hangi
// isteğin hangi veriyi döndürdüğünü KAYDEDİYORUZ. Kayıt popup'tan JSON olarak
// indirilir, `docs/uyap-uclari.md`'ye işlenir, `uyap.js`'teki UCLAR doldurulur.
//
// NE KAYDEDİLİR: URL, metod, istek gövdesi, yanıtın ŞEKLİ (alan adları + ilk
// birkaç örnek satır).
// NE KAYDEDİLMEZ: çerez, Authorization başlığı, yanıtın tamamı. Kayıt yalnız
// `chrome.storage.session`'da (tarayıcı kapanınca gider), hiçbir sunucuya gitmez.
//
// MAIN world şart: sayfanın kendi `fetch`/`XHR`'ını sarmalamak gerekiyor;
// ISOLATED world'de sayfanın global'lerine erişilemiyor.

(() => {
  const ANAHTAR = '__uyap_kesif';
  const SINIR = 200;                 // kayıt sayısı tavanı; storage şişmesin
  const ORNEK = 3;                   // yanıttan saklanacak örnek satır sayısı

  let acik = false;
  window.addEventListener('message', (e) => {
    if (e.source === window && e.data?.__uyapKesif === 'ac') acik = true;
    if (e.source === window && e.data?.__uyapKesif === 'kapat') acik = false;
  });
  window.postMessage({ __uyapKesif: 'durumSor' }, '*');

  /** Yanıttan yalnız ŞEKİL çıkarır — kişisel veriyi bütün hâlde saklamamak için. */
  function sekil(v, derinlik = 0) {
    if (v === null || derinlik > 3) return v === null ? 'null' : '…';
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

  function kaydet(kayit) {
    // Content script (ISOLATED) storage'a yazar; MAIN world'de chrome.* yok.
    window.postMessage({ __uyapKesif: 'kayit', kayit }, '*');
  }

  async function isle(url, metod, govde, yanitMetni) {
    if (!acik) return;
    let sek = null;
    try { sek = sekil(JSON.parse(yanitMetni)); }
    catch { sek = { tip: 'metin', uzunluk: yanitMetni.length, bas: yanitMetni.slice(0, 200) }; }
    kaydet({ zaman: new Date().toISOString(), url, metod, govde: (govde || '').slice(0, 1000), yanit: sek });
  }

  const asilFetch = window.fetch;
  window.fetch = async function (girdi, ayar) {
    const yanit = await asilFetch.apply(this, arguments);
    if (acik) {
      const url = typeof girdi === 'string' ? girdi : girdi?.url;
      try {
        // Yanıtı KLONDAN okuyoruz; sayfanın kendi okuması bozulmasın.
        isle(url, ayar?.method || 'GET', ayar?.body, await yanit.clone().text());
      } catch { /* kayıt best-effort */ }
    }
    return yanit;
  };

  const asilAc = XMLHttpRequest.prototype.open;
  const asilYolla = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (metod, url) {
    this.__kesif = { metod, url };
    return asilAc.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (govde) {
    if (acik && this.__kesif) {
      this.addEventListener('load', () => {
        try { isle(this.__kesif.url, this.__kesif.metod, govde, this.responseText || ''); }
        catch { /* best-effort */ }
      });
    }
    return asilYolla.apply(this, arguments);
  };

  window.__uyapKesifSinir = SINIR;
  window.__uyapKesifAnahtar = ANAHTAR;
})();
