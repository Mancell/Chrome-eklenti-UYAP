// node --test extension/uyap.test.mjs
//
// uyap.js'in XML katmanını test eder. İki şey kritik:
//
// 1. `nosessionobject` — portalın "oturum yok" imzası. Bu, oturumsuz uç
//    keşfinin de dayanağı (bkz. docs/uyap-uclari.md). Okunur bir cümleye
//    çevrilmeli, ham kod kullanıcıya gösterilmemeli.
// 2. `xmlSatirlar` — UYAP'ın kesin şeması BİLİNMİYOR (dosya listesi ucu hâlâ
//    keşif bekliyor). Bu yüzden ayrıştırıcı GENEL: en kalabalık tekrarlanan
//    eleman kümesini satır kabul ediyor. Uç bulunduğunda ayrıştırma kodu
//    yeniden yazılmasın diye bu davranış kilitleniyor.
//
// uyap.js bir content script (ES modülü değil), o yüzden node:vm ile sahte bir
// sayfa ortamında çalıştırılıyor. DOMParser Node'da yok → @xmldom/xmldom.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';

const KAYNAK = fs.readFileSync(new URL('./uyap.js', import.meta.url), 'utf8');

// vm içinde üretilen nesneler o context'in Object.prototype'ını taşıyor; strict
// deepEqual prototip de karşılaştırdığı için "same structure but not
// reference-equal" diyor. JSON turu prototipi normalize ediyor.
const sade = (v) => JSON.parse(JSON.stringify(v));

/** uyap.js'i çalıştırır ve iç fonksiyonlarını döndürür. */
function yukle() {
  const g = {
    DOMParser, Date, JSON, String, Object, Array, Math, Map, Set, Promise,
    URLSearchParams, console, setTimeout, clearTimeout, encodeURIComponent, btoa,
    fetch: async () => { throw new Error('test ağa çıkmaz'); },
    location: { href: 'https://vatandas.uyap.gov.tr/main/jsp/vatandas/index.jsp' },
    window: { addEventListener() {}, removeEventListener() {}, postMessage() {} },
    chrome: {
      runtime: {
        onMessage: { addListener() {} },
        sendMessage: () => Promise.resolve(),
      },
    },
  };
  vm.createContext(g);
  vm.runInContext(KAYNAK, g);
  // Test edilecek iç fonksiyonları dışarı al.
  return vm.runInContext(
    '({ xmlAyristir, xmlSatirlar, ref, tarih, alan, UCLAR, eksikUc })', g);
}

const U = yukle();

test('nosessionobject okunur cümleye çevriliyor', () => {
  assert.throws(
    () => U.xmlAyristir('<root><error>nosessionobject</error></root>'),
    /oturumunuz düşmüş/i,
  );
  // Ham kod kullanıcıya sızmamalı.
  try { U.xmlAyristir('<root><error>nosessionobject</error></root>'); }
  catch (e) { assert.ok(!e.message.includes('nosessionobject'), 'ham kod sızdı'); }
});

test('bilinmeyen UYAP hata kodu da yine anlaşılır geliyor', () => {
  assert.throws(() => U.xmlAyristir('<root><error>baskaBirHata</error></root>'),
    /UYAP hatası: baskaBirHata/);
});

test('boş gövde = uç yok (sonda mantığı)', () => {
  // docs/uyap-uclari.md: olmayan uç BOŞ döner, var olan uç nosessionobject.
  for (const bos of ['', '   ', null, undefined]) {
    assert.throws(() => U.xmlAyristir(bos), /boş yanıt|yok olabilir/i);
  }
});

test('satır listesi: en kalabalık tekrarlanan eleman kümesi seçiliyor', () => {
  // UYAP şeması bilinmediği için sarmalayıcı katman sayısı değişebilir.
  const belge = U.xmlAyristir(`<root>
    <ustBilgi><sayfa>1</sayfa></ustBilgi>
    <liste>
      <dosya><dosyaId>111</dosyaId><dosyaNo>2024/115</dosyaNo><birimAdi>İstanbul 3. İcra</birimAdi></dosya>
      <dosya><dosyaId>222</dosyaId><dosyaNo>2024/116</dosyaNo><birimAdi>Ankara 1. Asliye</birimAdi></dosya>
      <dosya><dosyaId>333</dosyaId><dosyaNo>2024/117</dosyaNo><birimAdi>Bursa 2. Sulh</birimAdi></dosya>
    </liste>
  </root>`);
  const satirlar = sade(U.xmlSatirlar(belge));
  assert.equal(satirlar.length, 3);
  assert.deepEqual(satirlar[0], { dosyaId: '111', dosyaNo: '2024/115', birimAdi: 'İstanbul 3. İcra' });
});

test('XML nitelikleri de alan oluyor', () => {
  const belge = U.xmlAyristir(
    '<root><s id="1"><ad>a</ad></s><s id="2"><ad>b</ad></s></root>');
  const satirlar = sade(U.xmlSatirlar(belge));
  assert.equal(satirlar[0].id, '1');
  assert.equal(satirlar[0].ad, 'a');
});

test('tek satır / tekrarsız XML çökertmiyor', () => {
  assert.equal(U.xmlSatirlar(U.xmlAyristir('<root><tek><a>1</a></tek></root>')).length, 0);
});

test('alan() farklı UYAP alan adlarını yakalıyor', () => {
  // Aynı veri uçtan uca farklı adlarla geliyor; ilk dolu olan seçilmeli.
  assert.equal(U.alan({ dosyaNo: '2024/1' }, 'dosyaNo', 'esasNo'), '2024/1');
  assert.equal(U.alan({ esasNo: '2024/2' }, 'dosyaNo', 'esasNo'), '2024/2');
  assert.equal(U.alan({ DOSYANO: '2024/3' }, 'dosyaNo'), '2024/3', 'büyük/küçük harf');
  assert.equal(U.alan({ dosyaNo: '   ' }, 'dosyaNo', 'esasNo'), null, 'boşluk dolu sayılmamalı');
});

test('tarih TR ve ISO biçimlerini normalize ediyor', () => {
  assert.equal(U.tarih('12.03.2024'), '2024-03-12');
  assert.equal(U.tarih('12/03/2024'), '2024-03-12');
  assert.equal(U.tarih('2024-03-12T10:00'), '2024-03-12');
  assert.equal(U.tarih(''), null);
  assert.equal(U.tarih('bozuk'), null);
});

test('ref deterministik — idempotent senkronun dayanağı', () => {
  assert.equal(U.ref('D-1', '2024-03-05', 'Ödeme emri'), U.ref('D-1', '2024-03-05', 'Ödeme emri'));
  assert.notEqual(U.ref('D-1', 'a'), U.ref('D-1', 'b'));
  assert.equal(U.ref('D-1', null), U.ref('D-1', ''), 'null ve boş aynı sayılmalı');
});

test('bilinmeyen uç NET hata veriyor, belirsiz değil', () => {
  // "keşif tamamlanmadı" gibi genel bir cümle kullanıcıya hiçbir şey anlatmıyordu.
  assert.equal(U.UCLAR.dosyaListesi, null, 'dosya listesi ucu hâlâ bilinmiyor olmalı');
  assert.match(U.eksikUc('dosyaListesi').message, /Dosyalarım listesi ucu henüz bilinmiyor/);
  assert.match(U.eksikUc('durusmalar').message, /Duruşma listesi/);
});

test('doğrulanmış uçlar yerinde duruyor', () => {
  // docs/uyap-uclari.md'de ölçülen uçlar; yanlışlıkla silinmesin.
  assert.equal(U.UCLAR.safahat.yol, '/dosya_safahat_bilgileri_brd.ajx');
  assert.equal(U.UCLAR.taraflar.yol, '/dosya_taraf_bilgileri_brd.ajx');
  assert.equal(U.UCLAR.evrakIndir.yol, '/download_document_brd.uyap');
  assert.equal(U.UCLAR.evrakIndir.metod, 'GET');
});
