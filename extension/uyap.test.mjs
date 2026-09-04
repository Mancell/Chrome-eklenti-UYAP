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
    location: {
      href: 'https://vatandas.uyap.gov.tr/main/jsp/vatandas/index.jsp',
      origin: 'https://vatandas.uyap.gov.tr',
    },
    document: { getElementsByTagName: () => [] },
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
    '({ xmlAyristir, xmlSatirlar, ref, tarih, alan, UCLAR, eksikUc,' +
    '   dosyaListesiDomdan, satirdanDosyaId, basligiEsle, veriTablosu,' +
    '   tablodanSatirlar, htmlBelge, satirlara })', g);
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
  // Duruşma ucu vatandaş portalında hâlâ görülmedi; hata onu ADIYLA söylemeli.
  assert.equal(U.UCLAR.durusmalar, null, 'duruşma ucu hâlâ bilinmiyor');
  assert.match(U.eksikUc('durusmalar').message, /Duruşma listesi ucu henüz bilinmiyor/);
});

test('gerçek uçlar keşif kaydındaki YOLLARLA duruyor', () => {
  // Uçlar KÖKTE DEĞİL — /main/jsp/vatandas/ altında. Kökte de nosessionobject
  // dönüyor (catch-all eşlemesi) ve bu ilk ölçümü yanıltmıştı; regresyon olmasın.
  assert.equal(U.UCLAR.dosyaListesi.yol, '/main/jsp/vatandas/vatandas_dosyalari_sorgula.ajx');
  assert.equal(U.UCLAR.taraflar.yol, '/main/jsp/vatandas/dosya_taraf_bilgileri_brd.ajx');
  assert.equal(U.UCLAR.evrakListesi.yol, '/main/jsp/vatandas/dosya_evrak_bilgileri_brd.ajx');
  assert.equal(U.UCLAR.evrakIndir.yol, '/download_document_brd.uyap', 'evrak baytı portal geneli');
  assert.equal(U.UCLAR.evrakIndir.metod, 'GET');
});

test('dosya listesi XML, taraf/evrak HTML olarak işaretli', () => {
  assert.equal(U.UCLAR.dosyaListesi.bicim, 'xml');
  assert.equal(U.UCLAR.taraflar.bicim, 'html');
  assert.equal(U.UCLAR.evrakListesi.bicim, 'html');
});

test('OPAK dosyaId (base64) çekiliyor — gerçek UYAP biçimi', () => {
  // Gerçek dosyaId sayı değil, 64 karakterlik şifreli jeton. İlk sürümdeki
  // \d{2,} deseni bunu hiç yakalamıyordu.
  const jeton = 'ww6iHinZvx+hluPRY61cpK6DPMoL1cdxtMuJe0icBTk7bUTGsiGyFxvOZAT9KWqW';
  const m = html(`<table>
    <tr><th>Dosya No</th><th>Birim</th></tr>
    <tr><td><a href="/x.uyap?dosyaId=${jeton.replace(/\+/g, '%2B')}">2024/1</a></td><td>X</td></tr>
  </table>`);
  const r = sade(U.dosyaListesiDomdan(m));
  assert.equal(r[0].uyap_ref, jeton, 'URL kaçışı çözülüp jeton aynen alınmalı');
});

test('HTML dönen uçlar ham başlıklarla satırlara çevriliyor', () => {
  // dosya_taraf_bilgileri_brd.ajx gerçekte böyle dönüyor (HTML tablo parçası).
  const r = sade(U.tablodanSatirlar(html(`
    <table id='taraf_listesi_table'>
      <thead><th>Rol</th><th>Tipi</th><th>Adı</th></thead>
      <tr><td>Davacı</td><td>Gerçek Kişi</td><td>Ahmet Y.</td></tr>
      <tr><td>Davalı</td><td>Tüzel Kişi</td><td>X A.Ş.</td></tr>
    </table>`)));
  assert.equal(r.length, 2);
  assert.equal(r[0].Rol, 'Davacı');
  assert.equal(r[1]['Adı'], 'X A.Ş.');
});


// ---------------------------------------------------------------------------
// DOM yedek yolu — dosya listesi ucu bilinmediği sürece tek veri kaynağı.
// Kırılgan olduğu için (UYAP arayüzü değişirse çöker) davranışı kilitliyoruz.
// ---------------------------------------------------------------------------

const html = (m) => new DOMParser().parseFromString(m, 'text/html');

const DOSYALARIM = `<html><body>
  <table id="yerlesim"><tr><td>menü</td></tr><tr><td>başlık</td></tr></table>
  <table id="veri">
    <tr><th>Dosya No</th><th>Birim</th><th>Yargı Türü</th><th>Açılış</th><th>Durum</th></tr>
    <tr>
      <td><a href="/dosya_goruntule.uyap?dosyaId=90210&amp;x=1">2024/115</a></td>
      <td>İstanbul 3. İcra Müdürlüğü</td><td>İcra</td><td>01.03.2024</td><td>Açık</td>
    </tr>
    <tr>
      <td><a href="/dosya_goruntule.uyap?dosyaId=90211">2024/116</a></td>
      <td>Ankara 1. Asliye Hukuk</td><td>Hukuk</td><td>15.04.2024</td><td>Derdest</td>
    </tr>
  </table>
</body></html>`;

test('DOM: Dosyalarım tablosu satırlara çevriliyor', () => {
  const r = sade(U.dosyaListesiDomdan(html(DOSYALARIM)));
  assert.equal(r.length, 2);
  assert.equal(r[0].dosya_no, '2024/115');
  assert.equal(r[0].birim, 'İstanbul 3. İcra Müdürlüğü');
  assert.equal(r[0].yargi_turu, 'İcra');
  assert.equal(r[0].durum, 'Açık');
  assert.equal(r[0].acilis_tarihi, '2024-03-01', 'TR tarih ISO’ya çevrilmeli');
});

test('DOM: dosyaId href’ten çekiliyor — alt uçların hepsi buna bağlı', () => {
  const r = sade(U.dosyaListesiDomdan(html(DOSYALARIM)));
  assert.equal(r[0].uyap_ref, '90210');
  assert.equal(r[1].uyap_ref, '90211');
  assert.equal(r[0]._idVar, true);
});

test('DOM: onclick biçimindeki dosyaId de yakalanıyor', () => {
  const m = html(`<table>
    <tr><th>Dosya No</th><th>Birim</th></tr>
    <tr><td><span onclick="dosyaAc({dosyaId: '77123'})">2024/9</span></td><td>Bursa 2. Sulh</td></tr>
  </table>`);
  const r = sade(U.dosyaListesiDomdan(m));
  assert.equal(r[0].uyap_ref, '77123');
});

test('DOM: id yoksa ref() deterministik — idempotency korunuyor', () => {
  const m = `<table>
    <tr><th>Dosya No</th><th>Birim</th></tr>
    <tr><td>2024/500</td><td>İzmir 4. İcra</td></tr>
  </table>`;
  const a = sade(U.dosyaListesiDomdan(html(m)));
  const b = sade(U.dosyaListesiDomdan(html(m)));
  assert.equal(a[0].uyap_ref, b[0].uyap_ref, 'aynı satır aynı ref üretmeli');
  assert.equal(a[0]._idVar, false, 'id yokluğu işaretlenmeli');
  assert.ok(a[0].uyap_ref, 'ref boş olmamalı');
});

test('DOM: en KALABALIK tablo seçiliyor, yerleşim tablosu değil', () => {
  // Yerleşim tablosu önce geliyor ve tanınan başlığı yok; veri tablosu seçilmeli.
  const r = sade(U.dosyaListesiDomdan(html(DOSYALARIM)));
  assert.equal(r.length, 2, 'yerleşim tablosu seçilseydi 0 satır olurdu');
});

test('DOM: başlık eşanlamlıları (Esas No / Mahkeme)', () => {
  const r = sade(U.dosyaListesiDomdan(html(`<table>
    <tr><th>Esas No</th><th>Mahkeme</th></tr>
    <tr><td>2023/77</td><td>Konya 1. Ağır Ceza</td></tr>
  </table>`)));
  assert.equal(r[0].dosya_no, '2023/77');
  assert.equal(r[0].birim, 'Konya 1. Ağır Ceza');
});

test('DOM: tablo yoksa / tanınmayan başlıksa çökmüyor, boş dönüyor', () => {
  assert.equal(U.dosyaListesiDomdan(html('<html><body><p>giriş yapın</p></body></html>')).length, 0);
  assert.equal(U.dosyaListesiDomdan(html('<table><tr><th>Renk</th></tr><tr><td>mavi</td></tr></table>')).length, 0);
});

test('DOM: tamamen boş satırlar atlanıyor', () => {
  const r = sade(U.dosyaListesiDomdan(html(`<table>
    <tr><th>Dosya No</th><th>Birim</th></tr>
    <tr><td></td><td></td></tr>
    <tr><td>2024/1</td><td>X Mahkemesi</td></tr>
  </table>`)));
  assert.equal(r.length, 1);
  assert.equal(r[0].dosya_no, '2024/1');
});

test('veri DOM’dan geldiğinde işaretleniyor — sessiz yedeklenme yok', () => {
  const r = sade(U.dosyaListesiDomdan(html(DOSYALARIM)));
  assert.equal(r[0]._domdan, true);
});
