// node --test extension/kesif.test.mjs   · tarayıcı gerekmez · bağımlılık yok
//
// Bu bileşen İKİ KEZ sessizce çöktü (MAIN/ISOLATED el sıkışma yarışı: kaydedici
// hiç kaydetmiyordu, hiçbir hata da vermiyordu). Test tam o şeyi ölçüyor:
// sayfa bir istek attığında kayıt tampona düşüyor mu, ve 'ver' mesajı onu geri
// veriyor mu.
//
// kesif.js bir IIFE (MAIN world content script'i ES modülü olamaz), o yüzden
// `node:vm` içinde sahte bir `window` ile çalıştırıyoruz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const KAYNAK = fs.readFileSync(new URL('./kesif.js', import.meta.url), 'utf8');

/**
 * kesif.js'i sahte bir sayfa ortamında kurar.
 *
 * Gerçek MAIN world content script'inde `window` GLOBAL'in kendisidir; sahte
 * ortamda da öyle kuruyoruz (`window === sandbox`), yoksa `window.fetch = ...`
 * ataması bizim tuttuğumuz nesneyi değiştirmez ve test gerçeği ölçmez.
 */
function sahteSayfa({ fetchYanit = '{"data":[{"dosyaId":1,"dosyaNo":"2024/1"}]}' } = {}) {
  const dinleyiciler = [];
  const postalananlar = [];
  let icWindow;                 // vm içindeki window; aşağıda dolduruluyor

  const g = {
    Date, JSON, String, Object, Array, Math, console, Promise,
    PerformanceObserver: function () { this.observe = () => {}; },
    performance: { getEntriesByType: () => [] },
    setTimeout,
    addEventListener: (tip, fn) => { if (tip === 'message') dinleyiciler.push(fn); },
    postMessage: (veri) => {
      postalananlar.push(veri);
      // Gerçek tarayıcı gibi: postMessage kendi dinleyicilerine de ulaşır.
      // `source` vm'in İÇİNDEKİ window olmalı: kesif.js `e.source !== window`
      // ile yabancı iframe mesajlarını eliyor ve vm sandbox'ı proxy'lediği için
      // dışarıdaki nesne o karşılaştırmayı geçmez.
      for (const fn of dinleyiciler) fn({ source: icWindow, data: veri });
    },
    // Sayfanın "gerçek" fetch'i — kesif.js bunu sarmalayacak.
    fetch: async () => ({ clone: () => ({ text: async () => fetchYanit }) }),
    XMLHttpRequest: function () {},
  };
  g.XMLHttpRequest.prototype = { open() {}, send() {}, addEventListener() {} };
  g.window = g;              // window === global
  g.globalThis = g;

  vm.createContext(g);
  icWindow = vm.runInContext('globalThis', g);
  vm.runInContext(KAYNAK, g);
  return { window: g, postalananlar, dinleyiciler, kaynak: g };
}

/** 'ver' postalayıp gelen kayıt listesini döndürür. */
function hasatEt(sayfa) {
  const oncekiSayi = sayfa.postalananlar.length;
  sayfa.window.postMessage({ __uyapKesif: 'ver' });
  return sayfa.postalananlar
    .slice(oncekiSayi)
    .find((m) => m?.__uyapKesif === 'kayitlar');
}

test('sayfanın fetch çağrısı kaydediliyor', async () => {
  const sayfa = sahteSayfa();

  // Sayfa kendi işini yapıyor — kesif.js araya girmiş olmalı.
  await sayfa.window.fetch('/main/vatandas/dosya_sorgula.ajx', {
    method: 'POST',
    body: 'sayfa=1',
  });

  const hasat = hasatEt(sayfa);
  assert.ok(hasat, "'ver' mesajına cevap gelmedi");
  assert.equal(hasat.kayitlar.length, 1, 'istek kaydedilmedi — kaydedici sessiz');

  const k = hasat.kayitlar[0];
  assert.equal(k.url, '/main/vatandas/dosya_sorgula.ajx');
  assert.equal(k.metod, 'POST');
  assert.equal(k.govde, 'sayfa=1');
});

test('yanıtın ŞEKLİ çıkarılıyor, tamamı değil', async () => {
  const sayfa = sahteSayfa();
  await sayfa.window.fetch('/liste.ajx');
  const k = hasatEt(sayfa).kayitlar[0];

  // Alan adları görünmeli (uçları doldurmak için bunlara ihtiyacım var)…
  assert.equal(k.yanit.data.tip, 'dizi');
  assert.deepEqual(Object.keys(k.yanit.data.ornek[0]), ['dosyaId', 'dosyaNo']);
  // …ama uzun değerler kırpılmalı.
  const uzun = sahteSayfa({ fetchYanit: JSON.stringify({ ad: 'x'.repeat(500) }) });
  await uzun.window.fetch('/x');
  assert.ok(hasatEt(uzun).kayitlar[0].yanit.ad.endsWith('…'), 'uzun değer kırpılmadı');
});

test('sayfanın kendi fetch yanıtı bozulmuyor', async () => {
  const sayfa = sahteSayfa();
  const yanit = await sayfa.window.fetch('/x');
  // Sayfa yanıtı hâlâ okuyabilmeli: klon okuduk, orijinali tüketmedik.
  assert.equal(await yanit.clone().text(), '{"data":[{"dosyaId":1,"dosyaNo":"2024/1"}]}');
});

test('JSON olmayan yanıt kaydı düşürmüyor', async () => {
  const sayfa = sahteSayfa({ fetchYanit: '<html>oturum doldu</html>' });
  await sayfa.window.fetch('/x');
  const k = hasatEt(sayfa).kayitlar[0];
  assert.equal(k.yanit.tip, 'metin');
  assert.match(k.yanit.bas, /oturum doldu/);
});

test('aynı sayfaya iki kez kurulmuyor', async () => {
  const sayfa = sahteSayfa();
  const ilkFetch = sayfa.window.fetch;
  vm.runInContext(KAYNAK, sayfa.kaynak);   // ikinci kez, AYNI sayfaya
  assert.equal(sayfa.window.fetch, ilkFetch, 'fetch iki kez sarmalandı');
});

test('tavan aşılmıyor', async () => {
  const sayfa = sahteSayfa();
  for (let i = 0; i < 205; i++) await sayfa.window.fetch('/x' + i);
  assert.equal(hasatEt(sayfa).kayitlar.length, 200, 'tavan tutmadı');
});
