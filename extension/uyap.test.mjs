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
    '   tablodanSatirlar, htmlBelge, satirlara, temizle, normalizeDurum, tarafMetni,' +
    '   jetonTemizle, yargiTuruDenBirim, evrakAgaci, titleAlanlari, dosyaAc, cagir, belgeUrl })', g);
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
  assert.equal(U.UCLAR.evrakIndir.yol, '/main/jsp/download_document_brd.uyap',
    'belge uçları /main/jsp/ altında — vatandas/ YOK');
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

// ---------------------------------------------------------------------------
// Mesaj sözleşmesi
//
// background.js ile uyap.js iki AYRI dosya ve aralarındaki sözleşme yalnız
// string eşleşmesi. `tebligatlar` mesajı tam bu yüzden aylarca sessizce
// "Bilinmeyen istek." üretti: gönderen vardı, karşılayan yoktu, hata da
// yutuluyordu. Statik kontrol ucuz ve bu sınıf hatayı tümden bitiriyor.
// ---------------------------------------------------------------------------
test('background’ın gönderdiği her mesajın uyap.js’te karşılığı var', () => {
  const uyap = fs.readFileSync(new URL('./uyap.js', import.meta.url), 'utf8');
  const bg = fs.readFileSync(new URL('./background.js', import.meta.url), 'utf8');

  const karsilanan = new Set([...uyap.matchAll(/case '([a-z-]+)':/g)].map((m) => m[1]));
  // Popup/arka plan arası bildirim tipleri içerik betiğine gitmiyor; onlar hariç.
  const BILDIRIM = new Set(['ilerleme', 'bitti', 'hata', 'baglan', 'baglandi',
                            'senkron-basla', 'sayfa-hazir']);
  const gonderilen = [...bg.matchAll(/\{ tip: '([a-z-]+)'/g)]
    .map((m) => m[1]).filter((t) => !BILDIRIM.has(t));

  const eksik = gonderilen.filter((t) => !karsilanan.has(t));
  assert.deepEqual(eksik, [], `uyap.js bu mesajları karşılamıyor: ${eksik.join(', ')}`);
});

test('bilinmeyen uçlar UCLAR’da null ve EKSIK_ADLAR’da adı var', () => {
  // Null bir uç çağrılırsa NET hata versin; "Bilinmeyen istek." değil.
  for (const [ad, uc] of Object.entries(U.UCLAR)) {
    if (uc === null) {
      assert.match(U.eksikUc(ad).message, /henüz bilinmiyor/,
        `${ad} için okunur hata yok`);
    }
  }
});


// ---------------------------------------------------------------------------
// Değer temizliği ve sınıflandırma — panele yazmadan önce.
// ---------------------------------------------------------------------------

test('temizle: nbsp ve çoklu boşluk sadeleşiyor', () => {
  assert.equal(U.temizle('İstanbul\u00a0\u00a03.  İcra'), 'İstanbul 3. İcra');
  assert.equal(U.temizle('  a  '), 'a');
});

test('temizle: UYAP boş göstergeleri null oluyor', () => {
  for (const bos of ['', '  ', '-', '—', 'null', 'NULL', 'undefined', null, undefined]) {
    assert.equal(U.temizle(bos), null, `${bos} null olmalı`);
  }
  // Gerçek veri null olmamalı.
  assert.equal(U.temizle('2024/115'), '2024/115');
});

test('normalizeDurum: UYAP büyük harfini panele indirger', () => {
  assert.equal(U.normalizeDurum('AÇIK'), 'açık');
  assert.equal(U.normalizeDurum('Açık'), 'açık');
  assert.equal(U.normalizeDurum('DERDEST'), 'açık', 'derdest = açık sayılıyor');
  assert.equal(U.normalizeDurum('KAPALI'), 'kapalı');
  assert.equal(U.normalizeDurum('-'), null);
  assert.equal(U.normalizeDurum('Bilinmeyen'), 'bilinmeyen', 'tanınmayan olduğu gibi');
});

test('tarafMetni: Rol + Ad birleşimi', () => {
  const s = [
    { Rol: 'Davacı', Tipi: 'Gerçek', 'Adı': 'Ahmet Y.' },
    { Rol: 'Davalı', Tipi: 'Tüzel', 'Adı': 'X A.Ş.' },
  ];
  assert.equal(U.tarafMetni(s), 'Davacı: Ahmet Y. · Davalı: X A.Ş.');
});

test('tarafMetni: 6’dan fazla taraf → +N kişi', () => {
  const cok = Array.from({ length: 9 }, (_, i) => ({ Rol: 'Davalı', 'Adı': `Kişi ${i + 1}` }));
  const m = U.tarafMetni(cok);
  assert.ok(m.endsWith('· +3 kişi'), m);
  assert.equal(m.split(' · ').length, 7, '6 taraf + 1 "+N" parçası');
});

test('tarafMetni: boş / eksik alanlar', () => {
  assert.equal(U.tarafMetni([]), null);
  assert.equal(U.tarafMetni([{ Rol: '-', 'Adı': 'null' }]), null, 'hepsi boş gösterge');
  assert.equal(U.tarafMetni([{ 'Adı': 'Yalnız Ad' }]), 'Yalnız Ad', 'rol yoksa ad yeter');
});

// ---------------------------------------------------------------------------
// Sınıflandırma bütünlüğü: veri çekicilerin ürettiği alanlar ŞEMA kolonlarıyla
// birebir olmalı. Fazla alan RPC'de sessizce düşer (veri kaybı fark edilmez),
// eksik alan panelde boş kolon. Bu test ikisini de yakalıyor.
// ---------------------------------------------------------------------------
test('dosya kaydının alanları şema kolonlarını karşılıyor', () => {
  // uyap.js'te dosyalar() ağ istiyor; onun ürettiği ŞEKLİ elle kuruyoruz —
  // ama alan adları koddaki nesne anahtarlarıyla aynı olmalı. Kaynak koddan
  // dosya kaydının anahtarlarını çıkarıyoruz.
  const src = fs.readFileSync(new URL('./uyap.js', import.meta.url), 'utf8');
  const blok = src.slice(src.indexOf('gorulen.add(uyap_ref);'), src.indexOf('_alanlar:'));
  // `uyap_ref,` shorthand olduğu için `:` opsiyonel.
  const anahtarlar = [...blok.matchAll(/^\s{6}(\w+)[,:]/gm)].map((m) => m[1])
    // `_` önekli alanlar (_dosyaId, _alanlar) geçici — background panele
    // yazmadan siler. Şema kolonu değiller.
    .filter((a) => !a.startsWith('_'));
  // 0001_sema.sql dosyalar kolonları (kullanici_id/olusturuldu/guncellendi hariç):
  const sema = ['uyap_ref', 'dosya_no', 'birim', 'yargi_turu', 'dosya_turu',
                'rol', 'taraflar', 'acilis_tarihi', 'durum'];
  for (const a of anahtarlar) {
    assert.ok(sema.includes(a), `dosya kaydında şemada olmayan alan: ${a}`);
  }
  for (const k of sema) {
    assert.ok(anahtarlar.includes(k), `dosya kaydında eksik şema kolonu: ${k}`);
  }
});


// ---------------------------------------------------------------------------
// uyap_ref ARTIK İÇERİKTEN türetiliyor. UYAP dosyaId'yi her sorguda farklı
// jeton olarak veriyor (gerçek veri: aynı dosya iki uyap_ref ile çift kayıt
// olmuştu). İçerik hash'i deterministik: aynı dosya her senkronda aynı ref.
// ---------------------------------------------------------------------------
test('normalizeDurum: UYAP sayı kodu', () => {
  assert.equal(U.normalizeDurum('0'), 'açık', '0 → açık (gözlemlenen)');
  assert.equal(U.normalizeDurum('29'), 'kod:29', 'tanınmayan kod ham korunuyor');
  assert.equal(U.normalizeDurum('AÇIK'), 'açık', 'metin hâlâ çalışıyor');
});

test('aynı dosya farklı jetonla → AYNI uyap_ref (çift kayıt önlenir)', () => {
  // ref(dosya_no, birim, acilis) — jeton hesaba katılmıyor.
  const a = U.ref('2026/522', 'İstanbul BAM 2. Ceza', '2026-03-13');
  const b = U.ref('2026/522', 'İstanbul BAM 2. Ceza', '2026-03-13');
  assert.equal(a, b, 'aynı dosya aynı ref üretmeli');
  const farkli = U.ref('2025/404', 'İstanbul 24. Ağır Ceza', '2025-12-19');
  assert.notEqual(a, farkli, 'farklı dosya farklı ref');
});


// ---------------------------------------------------------------------------
// Jeton tırnak temizliği — İÇERİĞİN ANAHTARI. UYAP jetonu XML'de tırnaklı
// veriyor ama alt-uç çağrılarında tırnaksız istiyor; tırnak kalırsa
// safahat/evrak/taraf boş dönüyordu (gerçek veride "0 safahat 0 evrak").
// ---------------------------------------------------------------------------
test('jetonTemizle: XML tırnağını soyuyor, base64 gövdesini bozmuyor', () => {
  assert.equal(U.jetonTemizle('"ww6iHinZvx+hluPRY/61c="'), 'ww6iHinZvx+hluPRY/61c=');
  assert.equal(U.jetonTemizle('ww6+/='), 'ww6+/=', 'tırnaksız zaten temiz');
  assert.equal(U.jetonTemizle('""'), null, 'sadece tırnak → null');
  assert.equal(U.jetonTemizle(null), null);
});

test('yargiTuruDenBirim: birim adından çıkarım (ad alanı gelmiyor)', () => {
  assert.equal(U.yargiTuruDenBirim('İstanbul 24. Ağır Ceza Mahkemesi'), 'ceza');
  assert.equal(U.yargiTuruDenBirim('Ankara 1. Asliye Hukuk Mahkemesi'), 'hukuk');
  assert.equal(U.yargiTuruDenBirim('İstanbul 3. İcra Müdürlüğü'), 'icra');
  assert.equal(U.yargiTuruDenBirim('Bölge İdare Mahkemesi'), 'idari');
  assert.equal(U.yargiTuruDenBirim('Belirsiz Birim'), null, 'tanınmayan → null, uydurmuyoruz');
  assert.equal(U.yargiTuruDenBirim(''), null);
});

// ---------------------------------------------------------------------------
// Evrak AĞACI — gerçek UYAP düğümü (keşif #4, birebir):
//   <li data-sid='ad tarih'><span class="file" title="<div>K: V</div>…"
//        evrak_id='"jeton"'>ad tarih</span>
//     <ul><li><span class="file" ana_evrak_id="…" evrak_id='"jeton"'>Ek 1</span></li>…</ul>
//   </li>
// evrak_id = görüntüleme/indirme JETONU. Ekler data-sid'siz, ana_evrak_id'li.
// ---------------------------------------------------------------------------
const T = '&lt;div&gt;Birim Evrak No: 5329&lt;/div&gt;&lt;div&gt;Evrakın Onaylandığı Tarih : 01/07/2026&lt;/div&gt;'
        + '&lt;div&gt;Gönderen Yer/Kişi: İstanbul 24. Ağır Ceza Mahkemesi&lt;/div&gt;&lt;div&gt;Türü: İstinafa Evrak Gönderme Üst Yazısı&lt;/div&gt;';
const EK = (n) => `<li><span class="file" ana_evrak_id="14273297528" evrak_id='"EKJETON${n}+/="'>Ek ${n}</span></li>`;
const EVRAK_AGACI = `<div id="browser" class="filetree">
  <li><span class="folder">İstanbul 24. Ağır Ceza Mahkemesi 2025/404</span><ul>
    <li class="closed"><span class="folder" style="color:red">Dosyaya Eklenen Son 20 Evrak</span><ul>
      <li data-sid='İstinafa Evrak Gönderme Üst Yazısı 01/07/2026'>
        <span class="file" data-html="true" title="${T}" evrak_id='"ANAJETON+/="'>İstinafa Evrak Gönderme Üst Yazısı 01/07/2026</span>
        <ul>${[1,2,3,4,5,6].map(EK).join('')}</ul>
      </li>
      <li data-sid='Taranmış Evraklar 25/06/2026'>
        <span class="file" title="&lt;div&gt;Birim Evrak No: 5330&lt;/div&gt;" evrak_id='"TARJETON"'>Taranmış Evraklar 25/06/2026</span>
        <ul>${EK(1)}</ul>
      </li>
    </ul></li>
  </ul></li></div>`;

test('evrakAgaci: ana evraklar + ekler, klasörler hariç', () => {
  const r = sade(U.evrakAgaci(U.htmlBelge(EVRAK_AGACI), 'DOSYA-1', 'DJETON'));
  // 2 ana + 6 ek + 1 ek = 9; klasör düğümleri (span.folder) sayılmaz.
  assert.equal(r.length, 9, `9 evrak bekleniyor, ${r.length} geldi`);
  assert.ok(!r.some((e) => (e.evrak_tipi || '').includes('Son 20 Evrak')), 'klasör evrak sayıldı');
});

test('evrakAgaci: ana evrak alanları title + data-sid’den', () => {
  const r = sade(U.evrakAgaci(U.htmlBelge(EVRAK_AGACI), 'DOSYA-1', 'DJETON'));
  const ana = r.find((e) => e.evrak_tipi === 'İstinafa Evrak Gönderme Üst Yazısı');
  assert.ok(ana, 'ana evrak bulunamadı');
  assert.equal(ana.evrak_tarihi, '2026-07-01');
  assert.equal(ana.gonderen, 'İstanbul 24. Ağır Ceza Mahkemesi');
  assert.equal(ana._evrakJeton, 'ANAJETON+/=', 'evrak_id tırnaksız jeton');
  assert.ok(ana.uyap_link.includes('evrakId=ANAJETON') && ana.uyap_link.includes('dosyaId=DJETON'),
    'link evrak JETONU + dosya JETONU ile: ' + ana.uyap_link);
  assert.equal(ana.uyap_ref.length, 8, 'uyap_ref 8 kar. içerik-hash, jeton değil');
});

test('evrakAgaci: ekler ana evrağın adını/tarihini miras alıyor', () => {
  const r = sade(U.evrakAgaci(U.htmlBelge(EVRAK_AGACI), 'DOSYA-1', 'DJETON'));
  const ek3 = r.find((e) => e.evrak_tipi === 'İstinafa Evrak Gönderme Üst Yazısı — Ek 3');
  assert.ok(ek3, 'Ek 3 yok: ' + r.map((e) => e.evrak_tipi).join(' | '));
  assert.equal(ek3.evrak_tarihi, '2026-07-01', 'tarih ana evraktan');
  assert.equal(ek3._evrakJeton, 'EKJETON3+/=');
});

test('evrakAgaci: tüm uyap_ref’ler birbirinden farklı (ekler çökmüyor)', () => {
  const r = U.evrakAgaci(U.htmlBelge(EVRAK_AGACI), 'DOSYA-1', 'DJETON');
  const refler = r.map((e) => e.uyap_ref);
  assert.equal(new Set(refler).size, refler.length, 'ref çakışması: ' + refler.join(','));
  // Aynı ağaç ikinci kez → aynı ref'ler (idempotent).
  const r2 = U.evrakAgaci(U.htmlBelge(EVRAK_AGACI), 'DOSYA-1', 'DJETON');
  assert.deepEqual(r2.map((e) => e.uyap_ref), refler);
});

test('titleAlanlari: HTML-encoded div’leri anahtar/değere çözüyor', () => {
  const d = U.titleAlanlari('&lt;div&gt;Birim Evrak No: 10570&lt;/div&gt;&lt;div&gt;Gönderen Yer/Kişi: X&lt;/div&gt;');
  assert.equal(d['Birim Evrak No'], '10570');
  assert.equal(d['Gönderen Yer/Kişi'], 'X');
});

// ---------------------------------------------------------------------------
// BÜYÜK HARF tagName — Chrome HTML DOM'u 'SPAN'/'LI' verir, xmldom küçük harf.
// 0.9.0 tam bu yüzden "test yeşil, tarayıcı 0 evrak" oldu. Sahte DOM gerçek
// Chrome davranışını taklit ediyor; bu sınıf hata bir daha geçemez.
// ---------------------------------------------------------------------------
function chromeDugum(tag, attrs = {}, children = [], text = '') {
  const n = {
    tagName: tag.toUpperCase(), nodeType: 1, parentNode: null,
    childNodes: children, textContent: text || children.map((c) => c.textContent).join(''),
    getAttribute: (a) => (a in attrs ? attrs[a] : null),
    getElementsByTagName(t) {
      const out = [];
      const gez = (el) => { for (const c of el.childNodes || []) { if (c.tagName === t.toUpperCase()) out.push(c); gez(c); } };
      gez(this); return out;
    },
  };
  for (const c of children) c.parentNode = n;
  return n;
}

test('evrakAgaci: Chrome gibi BÜYÜK HARF tagName ile de evrak buluyor', () => {
  const ek = chromeDugum('li', {}, [chromeDugum('span', { class: 'file', evrak_id: '"EKJ"', ana_evrak_id: '7' }, [], 'Ek 1')]);
  const ana = chromeDugum('li', { 'data-sid': 'Üst Yazı 01/07/2026' }, [
    chromeDugum('span', { class: 'file', evrak_id: '"ANAJ"', title: '&lt;div&gt;Birim Evrak No: 9&lt;/div&gt;' }, [], 'Üst Yazı 01/07/2026'),
    chromeDugum('ul', {}, [ek]),
  ]);
  const belge = chromeDugum('body', {}, [chromeDugum('ul', {}, [ana])]);
  const r = U.evrakAgaci(belge, 'D', 'J');
  assert.equal(r.length, 2, `BÜYÜK HARF DOM'da ${r.length} evrak — tagName karşılaştırması kırık`);
  assert.equal(r[1].evrak_tipi, 'Üst Yazı — Ek 1', 'ek, parentNode ile ana evrağı bulmalı');
});



// ---------------------------------------------------------------------------
// dosyaAc — dosyayı UYAP oturumunda AKTİF eder. UYAP'ın kendi akışı her dosya
// için önce bunu çağırıyor; atlanınca safahat `nosession`, evrak boş dönüyordu.
// Yanıt ayrıca dosyanın hangi sekmeleri desteklediğini söylüyor.
// ---------------------------------------------------------------------------
function izinleriAyristir(xml) {
  // dosyaAc'in ağ çağrısı dışındaki saf kısmı: xmlAyristir + <String> okuma.
  const belge = U.xmlAyristir(xml);
  const d = belge.getElementsByTagName('String')[0];
  const ham = U.temizle(d && d.textContent);
  return ham ? ham.split(',').map((x) => x.trim()).filter(Boolean) : [];
}

test('dosyaAc: HashMap yanıtından izin listesi çıkıyor', () => {
  const izin = izinleriAyristir(
    '<root><HashMap><Entry><BigDecimal>3</BigDecimal>' +
    '<String>evrak_bilgileri,evrak_gonderme,odeme,tahsilat_reddiyat_bilgileri,taraf_bilgileri</String>' +
    '</Entry></HashMap></root>');
  assert.deepEqual(izin, ['evrak_bilgileri', 'evrak_gonderme', 'odeme',
                          'tahsilat_reddiyat_bilgileri', 'taraf_bilgileri']);
  // Gerçek keşif: BU dosyada safahat YOK. Çağırmak nosession veriyordu.
  assert.ok(!izin.includes('safahat_bilgileri'), 'safahat desteklenmiyor olmalı');
});

test('dosyaAc: safahat destekleyen dosyada listede görünüyor', () => {
  const izin = izinleriAyristir(
    '<root><HashMap><Entry><String>evrak_bilgileri,safahat_bilgileri,taraf_bilgileri</String></Entry></HashMap></root>');
  assert.ok(izin.includes('safahat_bilgileri'));
});

test('dosyaAc: nosession okunur cümleye çevriliyor', () => {
  assert.throws(() => izinleriAyristir('<root><error>nosession</error></root>'), /UYAP hatası: nosession/);
});

test('dosyaAc: boş/şekilsiz yanıt boş dizi, çökme yok', () => {
  assert.deepEqual(izinleriAyristir('<root><HashMap></HashMap></root>'), []);
  assert.deepEqual(izinleriAyristir('<root><HashMap><Entry><String>  </String></Entry></HashMap></root>'), []);
});

// ---------------------------------------------------------------------------
// UYAP'a giden her mesaj JETON almalı — `dosyaRef` içerik hash'idir, UYAP onu
// TANIMAZ. Bu hata üç ayrı satırda sessizce yaşadı (taraflar, evrak-listesi,
// evrak-indir) ve hepsi "boş sonuç" olarak göründü. Statik kontrol kapatıyor.
// ---------------------------------------------------------------------------
test('UYAP çağrısı yapan mesajlar istek.jeton kullanıyor', () => {
  const src = fs.readFileSync(new URL('./uyap.js', import.meta.url), 'utf8');
  const govde = src.slice(src.indexOf('switch (istek.tip)'), src.indexOf('default:'));
  // Bu mesajlar UYAP'a HTTP çağrısı yapar; hepsi jeton almalı.
  for (const tip of ['safahat', 'evrak-listesi', 'taraflar', 'taraf-metni', 'dosya-ac', 'evrak-indir']) {
    const i = govde.indexOf(`case '${tip}'`);
    assert.ok(i >= 0, `${tip} mesajı yok`);
    const blok = govde.slice(i, i + 320);
    assert.ok(blok.includes('istek.jeton'),
      `${tip} istek.jeton kullanmıyor — UYAP içerik-hash'i tanımaz`);
  }
});

// ---------------------------------------------------------------------------
// GERÇEK UYAP HTML'i — parser'ın gerçek çıktıda çalıştığının ilk kanıtı.
//
// xmldom HTML5 parser DEĞİL: gerçek yanıttaki bozuk attribute'ta
// (`<ul id="" + anaDosyaBilgisi + "">` — JS string birleştirmesi HTML'e sızmış)
// patlıyor ve Chrome'un BÜYÜK HARF tagName davranışını taklit etmiyor. tagName
// hatası tam bu yüzden kaçmıştı. linkedom Chrome gibi davranır.
// ---------------------------------------------------------------------------
import { parseHTML } from 'linkedom';

test('evrakAgaci: GERÇEK UYAP evrak ağacını ayrıştırıyor', () => {
  const html = fs.readFileSync(new URL('./test-verisi/evrak-agaci.html', import.meta.url), 'utf8');
  const { document: belge } = parseHTML(`<html><body>${html}</body></html>`);

  // Chrome gibi: bozuk attribute çökertmemeli, tagName BÜYÜK HARF olmalı.
  assert.equal(belge.querySelector('li[data-sid]').tagName, 'LI');

  const r = U.evrakAgaci(belge, 'DOSYA-REF', 'DJETON');
  assert.ok(r.length >= 7, `gerçek ağaçtan ≥7 evrak bekleniyor, ${r.length} çıktı`);

  const ana = r.find((e) => e.evrak_tipi === 'İstinafa Evrak Gönderme Üst Yazısı');
  assert.ok(ana, 'ana evrak yok: ' + r.map((e) => e.evrak_tipi).join(' | '));
  assert.equal(ana.evrak_tarihi, '2026-07-01');
  assert.ok(ana._evrakJeton && !ana._evrakJeton.includes('"'), 'jeton tırnaksız olmalı');

  // Ekler ana evrağın adını miras alıyor.
  assert.ok(r.some((e) => e.evrak_tipi === 'İstinafa Evrak Gönderme Üst Yazısı — Ek 6'),
    'Ek 6 yok');

  // Tüm ref'ler benzersiz (ekler tek satıra çökmüyor).
  const refler = r.map((e) => e.uyap_ref);
  assert.equal(new Set(refler).size, refler.length, 'ref çakışması');
});

test('evrakListesi: İLK sayfa pageNumber GÖNDERMEZ', () => {
  // UYAP'ın kendi isteği yalnız `dosyaId=…`; pageNumber=1 gönderilince sunucu
  // boş liste dönüyordu — "0 evrak"ın kök nedeni.
  const src = fs.readFileSync(new URL('./uyap.js', import.meta.url), 'utf8');
  const f = src.slice(src.indexOf('async function evrakListesi'), src.indexOf('async function taraflar'));
  assert.match(f, /sayfa === 1\s*\?\s*\{\s*dosyaId:\s*jeton\s*\}/,
    'ilk sayfa gövdesi yalnız dosyaId olmalı');
});

// ---------------------------------------------------------------------------
// Belge URL'i — biçim kullanıcının PAYLAŞTIĞI ÇALIŞAN bağlantıdan alındı:
//   /main/jsp/view_document_brd.uyap?mimeType=Pdf&evrakId=…&dosyaId=…&yargiTuru=1
// Önceki hâli üç noktada yanlıştı (kök yol, mimeType yok, yargiTuru yok).
// ---------------------------------------------------------------------------
test('belgeUrl: gerçek çalışan URL biçimini üretiyor', () => {
  const url = U.belgeUrl('goruntule', 'hZBUzwMtgyH4xtFa+1tv0@', '@Eu3u0X7@9xef+dObQV', 'ceza');
  assert.ok(url.startsWith('https://vatandas.uyap.gov.tr/main/jsp/view_document_brd.uyap?'),
    'yol /main/jsp/ altında olmalı: ' + url);
  const q = new URL(url).searchParams;
  assert.equal(q.get('mimeType'), 'Pdf');
  assert.equal(q.get('evrakId'), 'hZBUzwMtgyH4xtFa+1tv0@', 'jeton bozulmadan geri okunmalı');
  assert.equal(q.get('dosyaId'), '@Eu3u0X7@9xef+dObQV');
  assert.equal(q.get('yargiTuru'), '1', 'ceza → 1 (doğrulanmış eşleme)');
  // Jetondaki özel karakterler kaçışlanmış olmalı (ham + / @ URL'i bozar).
  assert.ok(url.includes('%40') && url.includes('%2B'), 'kaçış yok: ' + url);
});

test('belgeUrl: bilinmeyen yargı türünde parametre GÖNDERİLMEZ', () => {
  // Yanlış kod yollamaktansa eksik yolla — sunucu varsayılanını kullanır.
  const url = U.belgeUrl('goruntule', 'JETON', 'DJETON', 'hukuk');
  assert.equal(new URL(url).searchParams.get('yargiTuru'), null);
  assert.equal(new URL(U.belgeUrl('goruntule', 'J', 'D', null)).searchParams.get('yargiTuru'), null);
});

test('belgeUrl: indirme aynı kurucuyu kullanıyor', () => {
  const url = U.belgeUrl('indir', 'JETON', 'DJETON', 'ceza');
  assert.ok(url.includes('/main/jsp/download_document_brd.uyap?'), url);
  assert.equal(new URL(url).searchParams.get('mimeType'), 'Pdf');
});

test('belgeUrl: jeton yoksa null (indirme denenmesin)', () => {
  assert.equal(U.belgeUrl('goruntule', null, 'D', 'ceza'), null);
});

test('gerçek ağaçtan üretilen uyap_link çalışan biçimde', () => {
  const html = fs.readFileSync(new URL('./test-verisi/evrak-agaci.html', import.meta.url), 'utf8');
  const { document: belge } = parseHTML(`<html><body>${html}</body></html>`);
  const r = U.evrakAgaci(belge, 'DOSYA-REF', '@Eu3u0X7@9xef', 'ceza');
  const ana = r.find((e) => e.evrak_tipi === 'İstinafa Evrak Gönderme Üst Yazısı');
  assert.ok(ana.uyap_link.includes('/main/jsp/view_document_brd.uyap?'), ana.uyap_link);
  const q = new URL(ana.uyap_link).searchParams;
  assert.equal(q.get('mimeType'), 'Pdf');
  assert.equal(q.get('yargiTuru'), '1');
  assert.ok(q.get('evrakId'), 'evrakId dolu olmalı');
});

// ---------------------------------------------------------------------------
// Zaman aşımı — timeout'suz bir fetch asılınca senkron hiç bitmiyor, RPC
// çağrılmıyor ve O ANA KADAR ÇEKİLEN VERİ DE KAYBOLUYOR. Evrak indirme tam
// bunu yaptı: dosyalar çekildi ama panele hiç yazılmadı. Statik kontrol.
// ---------------------------------------------------------------------------
test('UYAP fetch çağrılarının hepsi zaman aşımlı', () => {
  const src = fs.readFileSync(new URL('./uyap.js', import.meta.url), 'utf8');
  const ciplak = [...src.matchAll(/await fetch\(/g)];
  // Tek istisna: zamanAsimiyla sarmalayıcısının kendi içi.
  assert.equal(ciplak.length, 1, 'sarmalayıcı dışında çıplak fetch var');
  const sarmalayici = src.slice(src.indexOf('async function zamanAsimiyla'), src.indexOf('/** Ham metin döndürür'));
  assert.ok(sarmalayici.includes('await fetch('), 'tek fetch sarmalayıcıda olmalı');
  assert.ok(sarmalayici.includes('AbortSignal.timeout'), 'sarmalayıcıda timeout yok');
});

test('senkron liste turunda evrak İNDİRME yapmıyor', () => {
  // İndirme senkronu asıyordu; liste için gereksiz. Geri gelirse timeout şart.
  const bg = fs.readFileSync(new URL('./background.js', import.meta.url), 'utf8');
  assert.ok(!bg.includes("tip: 'evrak-indir'"), 'evrak indirme döngüsü geri gelmiş');
});

// ---------------------------------------------------------------------------
// Bildirim akışı — kullanıcı senkronun nerede olduğunu görebilmeli. Panel
// yazımı AĞ İSTEĞİ olduğu için kısıtlı, popup yerel olduğu için her adımda.
// ---------------------------------------------------------------------------
test('senkron döngüsü bildirimi TEK noktadan yapıyor', () => {
  // Eskiden her adımda `bildir` + `durumBildir` yan yana yazılıyordu; alt adım
  // eklerken biri unutuluyordu. Döngüde ikisi de doğrudan çağrılmamalı.
  const bg = fs.readFileSync(new URL('./background.js', import.meta.url), 'utf8');
  const bas = bg.indexOf('for (const [i, d] of dosyalar.entries())');
  const son = bg.indexOf('for (const d of dosyalar) delete d._dosyaId');
  assert.ok(bas > 0 && son > bas, 'senkron döngüsü bulunamadı');
  const dongu = bg.slice(bas, son);
  assert.ok(!/\bbildir\(\{/.test(dongu), 'döngüde çıplak bildir( var');
  assert.ok(!/\bdurumBildir\(cfg/.test(dongu), 'döngüde çıplak durumBildir( var');
  assert.ok(dongu.includes('await adim(cfg'), 'döngü adim() kullanmıyor');
});

test('alt adımlar kullanıcıya görünür mesaj üretiyor', () => {
  const bg = fs.readFileSync(new URL('./background.js', import.meta.url), 'utf8');
  for (const parca of ['dosya açılıyor', 'taraflar çekiliyor', 'çekiliyor…', 'bulundu']) {
    assert.ok(bg.includes(parca), `"${parca}" adım mesajı yok`);
  }
  // Sonuç sayısı bulunur bulunmaz yazılmalı (0 ise kullanıcı hemen görsün).
  assert.match(bg, /\$\{veri\.length\} \$\{adiTr\} bulundu/);
});

test('adim(): panel kısıtlı, bitti/hata muaf', () => {
  const bg = fs.readFileSync(new URL('./background.js', import.meta.url), 'utf8');
  const f = bg.slice(bg.indexOf('async function adim('), bg.indexOf('async function senkronCalistir'));
  assert.ok(f.includes('PANEL_ARALIK_MS'), 'panel kısıtlaması yok');
  assert.match(f, /const zorunlu = durum !== 'basladi'/, 'bitti/hata muafiyeti yok');
  // Popup her koşulda yazılmalı (kısıtlamadan ÖNCE).
  const popupSatir = f.indexOf('bildir({');
  const kisitSatir = f.indexOf('if (!zorunlu');
  assert.ok(popupSatir > 0 && popupSatir < kisitSatir, 'popup kısıtlamaya takılıyor');
});

// ---------------------------------------------------------------------------
// EVRAK İSKELETİ — UYAP'ın ağacı düz listeye çökmemeli. Bir davaya ait belge
// indirildiğinde hangi evrağın eki olduğu, hangi klasörde durduğu ve sırası
// korunmalı. Gerçek UYAP çıktısına karşı doğrulanıyor.
// ---------------------------------------------------------------------------
test('evrak iskeleti: ana/ek bağı, klasör ve sıra korunuyor', () => {
  const html = fs.readFileSync(new URL('./test-verisi/evrak-agaci.html', import.meta.url), 'utf8');
  const { document: belge } = parseHTML(`<html><body>${html}</body></html>`);
  const r = U.evrakAgaci(belge, 'D1', 'JETON', 'ceza');

  const kokler = r.filter((e) => !e.ana_evrak_ref);
  const ekler = r.filter((e) => e.ana_evrak_ref);
  assert.equal(kokler.length, 1, 'tek ana evrak bekleniyor');
  assert.equal(ekler.length, 6, '6 ek bekleniyor');

  // Ekler ANA EVRAĞA bağlı olmalı — bağ DOM hiyerarşisinden kuruluyor çünkü
  // `ana_evrak_id` niteliği yalnız eklerde var, ana evrakta YOK.
  assert.ok(ekler.every((e) => e.ana_evrak_ref === kokler[0].uyap_ref),
    'ekler ana evrağa bağlanmamış');

  // Klasör bilgisi (düz listede tamamen kayboluyordu).
  // Klasör artık TAM YOL (kökten yaprağa), yalnız en yakın klasör değil.
  assert.ok(kokler[0].klasor.endsWith('Dosyaya Eklenen Son 20 Evrak'), kokler[0].klasor);
  assert.ok(kokler[0].klasor.includes(' › '), 'yol ayracı yok: ' + kokler[0].klasor);

  // Sıra: UYAP'ın görünüm sırası, ana evrak ilk.
  assert.equal(kokler[0].sira, 1);
  assert.deepEqual(sade(ekler.map((e) => e.sira)), [2, 3, 4, 5, 6, 7]);

  // Hepsi aynı davaya bağlı — iskeletin kökü.
  assert.ok(r.every((e) => e.dosya_ref === 'D1'), 'dava bağı kopmuş');
});

test('evrak iskeleti: ana evrak kendi kendine bağlanmıyor', () => {
  const html = fs.readFileSync(new URL('./test-verisi/evrak-agaci.html', import.meta.url), 'utf8');
  const { document: belge } = parseHTML(`<html><body>${html}</body></html>`);
  const r = U.evrakAgaci(belge, 'D1', 'JETON', 'ceza');
  // Döngüsel bağ paneli sonsuz ağaca sokar.
  assert.ok(r.every((e) => e.ana_evrak_ref !== e.uyap_ref), 'kendine referans var');
});

// ---------------------------------------------------------------------------
// ÇOK SEVİYELİ klasör yolu — UYAP ağacı derin:
//   Dava › Tüm Evraklar › 2025/404 (Ceza Dava Dosyası) › Talimat Gelen Evrak (12)
// Yalnız en yakın klasörü almak "neye ait olduğu" bilgisini yarım bırakıyordu.
// ---------------------------------------------------------------------------
test('klasör YOLU kökten yaprağa tam çıkarılıyor', () => {
  const html = fs.readFileSync(new URL('./test-verisi/evrak-agaci-derin.html', import.meta.url), 'utf8');
  const { document: belge } = parseHTML(`<html><body>${html}</body></html>`);
  const r = U.evrakAgaci(belge, 'D1', 'JETON', 'ceza');

  const talimat = r.find((e) => e.evrak_tipi === 'Talimat Gelen Evrak' && !e.ana_evrak_ref);
  assert.ok(talimat, 'ana evrak yok');
  assert.equal(talimat.klasor,
    'İstanbul 24. Ağır Ceza Mahkemesi 2025/404 › Tüm Evraklar › 2025/404 (Ceza Dava Dosyası) › Talimat Gelen Evrak (12)',
    'klasör yolu eksik: ' + talimat.klasor);

  // Farklı gruptaki evrak KENDİ yolunu taşımalı (gruplar karışmasın).
  const muzekkere = r.find((e) => e.evrak_tipi === 'Müzekkere');
  assert.ok(muzekkere.klasor.endsWith('Müzekkere (3)'), muzekkere.klasor);
});

test('derin ağaçta ekler doğru ana evrağa bağlanıyor', () => {
  const html = fs.readFileSync(new URL('./test-verisi/evrak-agaci-derin.html', import.meta.url), 'utf8');
  const { document: belge } = parseHTML(`<html><body>${html}</body></html>`);
  const r = U.evrakAgaci(belge, 'D1', 'JETON', 'ceza');

  const ekler = r.filter((e) => e.ana_evrak_ref);
  assert.equal(ekler.length, 3, '3 ek bekleniyor');
  // Üçü de AYNI ana evrağa bağlı olmalı; komşu evrağa kaymamalı.
  assert.equal(new Set(ekler.map((e) => e.ana_evrak_ref)).size, 1, 'ekler farklı evraklara bağlanmış');

  // Bağlandıkları evrak, eklerin ÜSTÜNDEKİ düğüm olmalı (16/10 değil 02/06).
  const ana = r.find((e) => e.uyap_ref === ekler[0].ana_evrak_ref);
  assert.equal(ana.evrak_tarihi, '2025-06-02', 'ekler yanlış evrağa bağlandı: ' + ana.evrak_tarihi);
});
