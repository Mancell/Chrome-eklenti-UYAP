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

// Content script portalın KENDİ üstünde çalışıyor; ayrı bir taban sabiti
// tutmak gereksiz ve portal eklenirken yanlış yerde kalır.
const TABAN = location.origin;

// Uçlar KÖKTE DEĞİL: gerçek yollar `/main/jsp/vatandas/` altında. Kökte de
// `nosessionobject` dönüyor (sunucuda *.ajx için catch-all eşlemesi var), o
// yüzden ilk sondam varlığı doğru ama YOLU eksik ölçmüştü. Buradakiler portalın
// kendi isteklerinden alındı (keşif kaydı, 2026-09-04).
//
// GÖVDELER form-urlencoded, JSON DEĞİL.
// YANITLAR karışık: dosya listesi XML, taraf/evrak HTML parçası.
const YOL = '/main/jsp/vatandas/';

const UCLAR = {
  dosyaListesi: { yol: YOL + 'vatandas_dosyalari_sorgula.ajx', bicim: 'xml' },
  taraflar:     { yol: YOL + 'dosya_taraf_bilgileri_brd.ajx', bicim: 'html' },
  evrakListesi: { yol: YOL + 'dosya_evrak_bilgileri_brd.ajx', bicim: 'html' },
  islemTurleri: { yol: YOL + 'dosya_islem_turleri_sorgula_brd.ajx', bicim: 'xml' },
  // Keşif kaydında yoktu (kullanıcı safahat sekmesini açmamış) ama sonda uç
  // olduğunu gösterdi. Biçimi taraf/evrak gibi HTML varsayılıyor; ilk gerçek
  // çağrıda yanılırsak `bicim` düzeltilecek.
  safahat:      { yol: YOL + 'dosya_safahat_bilgileri_brd.ajx', bicim: 'html' },
  // Evrak baytı — kökte, portal geneli (avukat portalıyla ortak).
  evrakIndir:   { yol: '/download_document_brd.uyap', bicim: 'bayt', metod: 'GET' },

  // ⛔ Vatandaş portalında ayrı bir duruşma ucu görülmedi. Duruşma bilgisi
  // safahat içinde geliyor olabilir; ilk gerçek safahat yanıtında bakılacak.
  durusmalar: null,
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

/** Ham metin döndürür. Biçim (xml/html) çağıran tarafından yorumlanıyor. */
async function cagir(ucAdi, govde) {
  const uc = UCLAR[ucAdi];
  if (!uc) throw eksikUc(ucAdi);
  const metod = uc.metod || 'POST';

  // GÖVDE FORM-URLENCODED. Portal JSON kabul etmiyor; `dosyaId` base64 olduğu
  // için `+` ve `/` içeriyor ve URLSearchParams ile doğru kaçışlanması şart.
  const govdeMetni = metod === 'POST' ? new URLSearchParams(govde || {}).toString() : undefined;

  const y = await fetch(TABAN + uc.yol, {
    method: metod,
    credentials: 'include',              // kullanıcının KENDİ oturumu
    headers: {
      // Portal jQuery ile konuşuyor; bu başlık olmadan isteği ajax saymayabilir.
      'X-Requested-With': 'XMLHttpRequest',
      ...(metod === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' } : {}),
    },
    body: govdeMetni,
  });
  if (!y.ok) throw new Error(`UYAP ${y.status} — oturumunuz düşmüş olabilir.`);
  return await y.text();
}

/** Ham yanıtı biçimine göre satırlara çevirir. */
function satirlara(ucAdi, metin) {
  const bicim = UCLAR[ucAdi]?.bicim;
  // Biçim yanlış tanımlanmış olabilir — İÇERİĞE de bak, tanıma göre değil.
  const xmlMi = /^\s*(<\?xml|<root[\s>])/i.test(metin);
  if (bicim === 'xml' || xmlMi) return xmlSatirlar(xmlAyristir(metin));
  return tablodanSatirlar(htmlBelge(metin));
}

/** HTML parçasını ayrıştırır (yanıtlar tam sayfa değil, parça olabiliyor). */
function htmlBelge(metin) {
  return new DOMParser().parseFromString(`<html><body>${metin}</body></html>`, 'text/html');
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

/**
 * UYAP değerini panele yazmadan önce temizler:
 * - &nbsp; (\u00a0) → normal boşluk, çoklu boşluk teke
 * - UYAP'ın boş göstergeleri ("-", "—", "null", "undefined", "") → null
 * Böylece panelde "—" yerine gerçekten boş, arama/filtre doğru çalışıyor.
 */
function temizle(deger) {
  if (deger == null) return null;
  const s = String(deger).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  const kucuk = s.toLocaleLowerCase('tr');
  if (kucuk === '-' || s === '—' || kucuk === 'null' || kucuk === 'undefined') return null;
  return s;
}

/**
 * Jeton tırnağını soyar. KRİTİK: UYAP dosya listesi XML'inde jetonu tırnak
 * içinde veriyor (`<dosyaId>"ww6..."</dosyaId>`) ama alt-uç çağrılarında
 * TIRNAKSIZ bekliyor. Tırnak kalırsa safahat/evrak/taraf boş dönüyor —
 * içeriğin gelmemesinin sebebi buydu.
 */
function jetonTemizle(deger) {
  const t = temizle(deger);
  if (!t) return null;
  const soyulmus = t.replace(/^"+|"+$/g, '');
  return soyulmus || null;   // sadece tırnaktan ibaretse null
}

/**
 * Yargı türünü BİRİM ADINDAN çıkarır — UYAP dosya listesinde yargiTuruAdi
 * gelmiyor, yalnız kodlar var. Birim adı gerçek kaynak; uydurmuyoruz.
 */
function yargiTuruDenBirim(birim) {
  const b = (birim || '').toLocaleLowerCase('tr');
  if (!b) return null;
  if (b.includes('ceza')) return 'ceza';
  if (b.includes('icra') || b.includes('i̇cra')) return 'icra';
  if (b.includes('idare') || b.includes('idari') || b.includes('vergi')) return 'idari';
  if (b.includes('hukuk') || b.includes('asliye') || b.includes('sulh') ||
      b.includes('aile') || b.includes('iş ') || b.includes('tüketici') ||
      b.includes('ticaret') || b.includes('kadastro')) return 'hukuk';
  return null;
}

/**
 * Dosya durumunu panelin beklediği küçük harfe indirger. UYAP "AÇIK"/"KAPALI"
 * gibi büyük harf veya karışık dönüyor; panel renklendirmesi (yeşil/nötr) buna
 * bakıyor. Tanınmayan değer olduğu gibi (temizlenmiş) geçer.
 */
function normalizeDurum(deger) {
  const t = temizle(deger);
  if (!t) return null;
  const k = t.toLocaleLowerCase('tr');
  if (k.includes('açık') || k.includes('acik') || k.includes('derdest')) return 'açık';
  if (k.includes('kapalı') || k.includes('kapali')) return 'kapalı';
  // UYAP durum'u SAYI KODU olarak veriyor ("0", "29"). Kesin eşleme UYAP'tan
  // netleşmedi; gözlemlenen "0" derdest/açık dosyalarda görüldü. Tanınmayan kod
  // OLDUĞU GİBİ dönüyor (veri kaybı yok); panel "Durum kodu: N" gösteriyor,
  // anlamı netleşince buraya tek satır eklenir.
  if (/^\d+$/.test(k)) return k === '0' ? 'açık' : `kod:${k}`;
  return k;
}

/** Satırdan ilk dolu alanı seçer — UYAP alan adları uçtan uca değişebiliyor. */
function alan(satir, ...adaylar) {
  for (const a of adaylar) {
    for (const k of Object.keys(satir)) {
      if (k.toLowerCase() === a.toLowerCase()) {
        const v = temizle(satir[k]);
        if (v) return v;
      }
    }
  }
  return null;
}


// ---------------------------------------------------------------------------
// Dosya listesi — DOM yedek yolu
//
// ponytail: KIRILGAN, bilinçli. Vatandaş portalında dosya listesi ucu henüz
// bilinmiyor (bkz. docs/uyap-uclari.md), ama Dosyalarım sayfası listeyi zaten
// bir tablo olarak çiziyor. Buradan okuyoruz.
//
// TAVAN: UYAP arayüzü değişince bu fonksiyon çöker. Bu yüzden kırılgan yüzey
// TEK FONKSİYONA hapsedildi — safahat, taraflar, tahsilat ve evrak indirme
// ölçülmüş uçlarda kalıyor.
//
// YÜKSELTME YOLU: keşif modu gerçek ucu bulup `UCLAR.dosyaListesi` doldurunca
// bu yol kendiliğinden devre dışı kalıyor; silinecek kod yok.
//
// KRİTİK PARÇA satırdaki `dosyaId`: o çıkarsa ölçülmüş uçların HEPSİ
// kullanılabilir hâle geliyor, çünkü hepsi `dosyaId` istiyor.
// ---------------------------------------------------------------------------

/** Türkçe başlık → kanonik alan. Birden çok yazım karşılanıyor. */
const BASLIK_ESLEME = [
  ['dosya_no', ['dosya no', 'dosyano', 'esas no', 'esasno', 'dosya numarası']],
  ['birim', ['birim', 'mahkeme', 'birim adı', 'yargı birimi', 'daire']],
  ['yargi_turu', ['yargı türü', 'yargi turu', 'yargı tipi']],
  ['dosya_turu', ['dosya türü', 'dosya turu', 'dava türü']],
  ['taraflar', ['taraflar', 'taraf', 'karşı taraf', 'davacı', 'davalı']],
  ['acilis_tarihi', ['açılış', 'açılış tarihi', 'acilis tarihi', 'tarih']],
  ['durum', ['durum', 'dosya durumu', 'aşama']],
];

function basligiEsle(metin) {
  const t = (metin || '').trim().toLocaleLowerCase('tr');
  if (!t) return null;
  for (const [alanAdi, adaylar] of BASLIK_ESLEME) {
    if (adaylar.some((a) => t === a || t.includes(a))) return alanAdi;
  }
  return null;
}

/**
 * Satırdaki link/onclick/attribute içinden dosyaId çeker.
 *
 * DİKKAT: dosyaId SAYI DEĞİL — opak, şifrelenmiş bir base64 jetonu
 * ("ww6iHinZvx+hluPRY61cpK6DPMoL1cdxtMuJe0icBTk7bUTGsiGyFxvOZAT9KWqW").
 * İlk sürümdeki `\d{2,}` deseni bu yüzden hiçbir şey yakalamıyordu.
 */
function satirdanDosyaId(satir) {
  const parcalar = [];
  for (const el of satir.getElementsByTagName('*')) {
    for (const ad of ['href', 'onclick', 'data-id', 'data-dosyaid', 'id', 'value']) {
      const d = el.getAttribute && el.getAttribute(ad);
      if (d) parcalar.push(d);
    }
  }
  for (const parca of parcalar) {
    // base64 gövdesi: harf/rakam/+//=/%  (URL kaçışlı hâli de olabilir)
    const m = /dosya[_-]?id["'\]\s]*[=:]\s*["']?([A-Za-z0-9+/%=_-]{2,})/i.exec(parca);
    if (m) {
      try { return decodeURIComponent(m[1].replace(/"/g, '')); }
      catch { return m[1].replace(/"/g, ''); }
    }
  }
  return null;
}

/** Sayfadaki EN KALABALIK tabloyu seçer — UYAP'ta yerleşim tabloları da var. */
function veriTablosu(belge) {
  let enIyi = null;
  for (const t of belge.getElementsByTagName('table')) {
    const n = t.getElementsByTagName('tr').length;
    if (n >= 1 && (!enIyi || n > enIyi.n)) enIyi = { t, n };
  }
  return enIyi && enIyi.t;
}

/**
 * Bir belgedeki veri tablosunu HAM başlık adlarıyla satırlara çevirir.
 *
 * Hem DOM yedek yolu hem de HTML dönen uçlar (taraflar, evraklar, safahat)
 * bunu kullanıyor — iki ayrı tablo ayrıştırıcısı tutmanın anlamı yok.
 */
function tablodanSatirlar(belge) {
  const tablo = veriTablosu(belge);
  if (!tablo) return [];

  const satirlar = [...tablo.getElementsByTagName('tr')];
  if (!satirlar.length) return [];

  // UYAP başlıkları <thead> içinde DOĞRUDAN <th> olarak veriyor, <tr>
  // sarmalayıcı olmadan (gerçek yanıt: <thead><th>Rol</th><th>Tipi</th>…).
  // Bu yüzden başlığı ilk <tr>'de aramak yanlış: veri satırı başlık sanılıp
  // düşüyordu. <th> nerede olursa olsun başlıktır.
  const thler = [...tablo.getElementsByTagName('th')].map((h) => (h.textContent || '').trim());
  let basliklar, veriSatirlari;
  if (thler.length) {
    basliklar = thler;
    // Başlık <tr>'si varsa içinde <td> olmadığı için kendiliğinden eleniyor.
    veriSatirlari = satirlar.filter((r) => r.getElementsByTagName('td').length);
  } else {
    basliklar = [...satirlar[0].getElementsByTagName('td')].map((h) => (h.textContent || '').trim());
    veriSatirlari = satirlar.slice(1);
  }

  const cikti = [];
  for (const satir of veriSatirlari) {
    const hucreler = [...satir.getElementsByTagName('td')];
    if (!hucreler.length) continue;
    const kayit = {};
    hucreler.forEach((h, i) => {
      const ad = basliklar[i] || `sutun${i}`;
      kayit[ad] = (h.textContent || '').trim().replace(/\s+/g, ' ');
    });
    if (!Object.values(kayit).some((v) => v)) continue;   // tamamen boş satır
    const id = satirdanDosyaId(satir);
    if (id) kayit._dosyaId = id;
    cikti.push(kayit);
  }
  return cikti;
}

/** DOM yedek yolu: ham başlıkları kanonik alanlara eşler. */
function dosyaListesiDomdan(belge = document) {
  return tablodanSatirlar(belge)
    .map((ham) => {
      const kayit = {};
      for (const [baslik, deger] of Object.entries(ham)) {
        if (baslik === '_dosyaId') continue;
        const alanAdi = basligiEsle(baslik);
        if (alanAdi) kayit[alanAdi] = deger;
      }
      if (!Object.keys(kayit).length) return null;   // tanınan başlık yok
      return {
        uyap_ref: ham._dosyaId || ref(...Object.values(kayit)),
        dosya_no: kayit.dosya_no ?? null,
        birim: kayit.birim ?? null,
        yargi_turu: kayit.yargi_turu ?? null,
        dosya_turu: kayit.dosya_turu ?? null,
        taraflar: kayit.taraflar ?? null,
        acilis_tarihi: tarih(kayit.acilis_tarihi),
        durum: kayit.durum ?? null,
        _domdan: true,
        _idVar: Boolean(ham._dosyaId),
      };
    })
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Veri çekiciler
// ---------------------------------------------------------------------------

/**
 * Dosya listesi. Gövde portalın kendi isteğinden alındı (keşif kaydı):
 * form-urlencoded, `dosyaKapaliMi` açık/kapalı dosyaları ayırıyor — ikisini de
 * çekip birleştiriyoruz, yoksa kapalı dosyalar hiç görünmüyor.
 *
 * Yanıt XML: <root><DVOList><liste><VatandasGenelDVO>…
 */
const DOSYA_SORGU = {
  yargiTuru: '0', yargiBirimi: '', dosyaYil: '', mahkeme: '', dosyaSira: '',
  baslangicTarihi: '', bitisTarihi: '',
  dosyaKapanisBaslangicTarihi: '', dosyaKapanisBitisTarihi: '',
};

async function dosyalar() {
  const hamSatirlar = [];
  for (const kapali of ['true', 'false']) {
    try {
      hamSatirlar.push(
        ...satirlara('dosyaListesi', await cagir('dosyaListesi', { ...DOSYA_SORGU, dosyaKapaliMi: kapali })),
      );
    } catch (e) {
      // Bir filtre patlarsa diğeri yine denensin; ikisi de patlarsa aşağıda
      // DOM yedeğine düşüyoruz.
      if (kapali === 'false' && !hamSatirlar.length) throw e;
    }
  }

  if (!hamSatirlar.length) {
    // Uç cevap verdi ama satır yok ya da şekli beklenmedik → sayfadaki tabloyu oku.
    const domdan = dosyaListesiDomdan();
    if (domdan.length) return domdan;
    return [];
  }

  const gorulen = new Set();
  const cikti = [];
  for (const s of hamSatirlar) {
    // esasNo İLK aday: UYAP dosya no'yu esasNo olarak veriyor (dosyaNo yok).
    const dosya_no = alan(s, 'esasNo', 'dosyaNo', 'dosyaNumarasi');
    const birim = alan(s, 'birimAdi', 'birim', 'mahkemeAdi');
    const acilis_tarihi = tarih(alan(s, 'dosyaAcilisTarihi', 'acilisTarihi', 'acilisTarih'));

    // KİMLİK = İÇERİK, jeton DEĞİL. UYAP dosyaId'yi her sorguda farklı şifreli
    // jeton olarak veriyor → idempotency anahtarı olamaz (çift kayıt oluyordu).
    const uyap_ref = ref(dosya_no, birim, acilis_tarihi);
    if (gorulen.has(uyap_ref)) continue;      // açık/kapalı sorguları çakışabilir
    gorulen.add(uyap_ref);

    // Opak jeton AYRI + TIRNAKSIZ: alt-uç çağrıları bunu istiyor, tırnak kalırsa
    // boş dönüyorlar. Panele YAZILMIYOR.
    const _dosyaId = jetonTemizle(alan(s, 'dosyaId', 'dosyaID', 'id'));

    cikti.push({
      uyap_ref,
      dosya_no,
      birim,
      yargi_turu: yargiTuruDenBirim(birim),   // birim adından, ad alanı gelmiyor
      dosya_turu: alan(s, 'dosyaTuruAdi', 'dosyaTuru', 'dosyaTurKod'),   // yalnız kod
      rol: alan(s, 'rol', 'tarafRolu'),        // kullanıcının bu dosyadaki rolü
      taraflar: alan(s, 'taraflar', 'tarafAdi', 'karsiTaraf'),
      acilis_tarihi,
      durum: normalizeDurum(alan(s, 'dosyaDurumu', 'durum', 'dosyaDurum')),
      _dosyaId,
      _alanlar: Object.keys(s),
    });
  }
  return cikti;
}

// jeton: UYAP çağrısı için (o oturumda geçerli). dosyaRef: dosyanın KALICI
// uyap_ref'i, RPC bunu dosya_id'ye çözecek. İkisi artık farklı değer.
async function safahat(jeton, dosyaRef) {
  return satirlara('safahat', await cagir('safahat', { dosyaId: jeton })).map((s) => ({
    uyap_ref: ref(dosyaRef, alan(s, 'Tarih', 'tarih'), alan(s, 'İşlem Türü', 'İşlem', 'islem')),
    dosya_ref: dosyaRef,
    tarih: tarih(alan(s, 'Tarih', 'tarih', 'islemTarihi')),
    islem: alan(s, 'İşlem Türü', 'İşlem', 'islem', 'İşlem Durumu'),
    aciklama: alan(s, 'Açıklama', 'aciklama', 'İşlem Yapan Birim'),
  }));
}

async function durusmalar(jeton) {
  if (!UCLAR.durusmalar) throw eksikUc('durusmalar');
  return satirlara('durusmalar', await cagir('durusmalar', { dosyaId: jeton }));
}

/**
 * Evrak listesi. Yanıt HTML ve SAYFALI: gövdesindeki `pageTotal` toplam sayfayı
 * veriyor. Tek sayfa çekmek 879 KB'lık gerçek yanıtta evrakların yarısını
 * kaçırıyordu.
 */
/**
 * Evrak listesi bir AĞAÇ (treeview), tablo DEĞİL. UYAP her evrakı şöyle veriyor:
 *   <li data-sid='İstinafa Evrak Gönderme Üst Yazısı 25/06/2026'>
 *     <span class="file" title="&lt;div&gt;Birim Evrak No: 10570&lt;/div&gt;
 *       &lt;div&gt;Evrakın Onaylandığı Tarih: 25/06/2026&lt;/div&gt;
 *       &lt;div&gt;Gönderen Yer/Kişi: …&lt;/div&gt;…">
 * Klasör düğümleri (span.folder, "Dosyaya Eklenen Son 20 Evrak") atlanır.
 */
function evrakAgaci(belge, dosyaRef, jeton) {
  // tagName HTML belgede BÜYÜK HARF ('SPAN'), XML/test ortamında küçük. Her
  // karşılaştırma toLowerCase() ile — "test yeşil, tarayıcı boş" hatası buradan
  // çıktı ve 0 evrak verdi.
  const adi = (el) => (el && el.tagName ? String(el.tagName).toLowerCase() : '');
  const fileMi = (sp) => (sp.getAttribute('class') || '').split(/\s+/).includes('file');
  const TARIH = /^(.*?)\s*(\d{2}\/\d{2}\/\d{4})\s*$/;

  const cikti = [];
  for (const li of belge.getElementsByTagName('li')) {
    // Yalnız DOĞRUDAN çocuğu span.file olan li (torunlar hayalet üretir).
    let fileSpan = null;
    for (const c of cocuklar(li)) if (adi(c) === 'span' && fileMi(c)) { fileSpan = c; break; }
    if (!fileSpan) continue;

    const detay = titleAlanlari(fileSpan.getAttribute('title') || '');
    // evrak_id = görüntüleme/indirme JETONU (tırnaklı gelir). Birim Evrak No değil.
    const evrakJeton = jetonTemizle(fileSpan.getAttribute('evrak_id'));
    const anaEvrakId = temizle(fileSpan.getAttribute('ana_evrak_id'));
    const spanMetni = temizle(fileSpan.textContent);

    const sid = temizle(li.getAttribute('data-sid'));   // ana evrakta "ad tarih"; ekte YOK
    let ad = null, tarihStr = null, ekMi = false;

    if (sid) {
      const m = TARIH.exec(sid);
      if (m) { ad = temizle(m[1]); tarihStr = m[2]; } else ad = sid;
    } else {
      // EK (Ek 1..N): data-sid yok, ana_evrak_id ile bağlı. Ana evrağın adını ve
      // tarihini üst li zincirinden miras al — eklerin de birer belge olduğu
      // (asıl PDF'ler) listeye yansısın.
      ekMi = true;
      let p = li.parentNode, anaSid = null;
      while (p) {
        if (adi(p) === 'li' && p.getAttribute) { anaSid = temizle(p.getAttribute('data-sid')); if (anaSid) break; }
        p = p.parentNode;
      }
      let anaAd = anaSid;
      if (anaSid) { const m = TARIH.exec(anaSid); if (m) { anaAd = temizle(m[1]); tarihStr = m[2]; } }
      ad = [anaAd, spanMetni].filter(Boolean).join(' — ') || null;
    }
    if (!ad) ad = spanMetni || temizle(detay['Türü']) || null;

    const evrakNo = temizle(detay['Birim Evrak No'] || detay['Evrak No']);
    const evrakTarihi = tarih(tarihStr) || tarih(detay['Evrakın Onaylandığı Tarih'])
      || tarih(detay['Sisteme Gönderildiği Tarih']);

    // Kimlik hep 8 karakter içerik-hash (dosya jetonu gibi jeton DEĞİL). Birim
    // Evrak No kararlı → dosyaRef ile birlikte hash'lenir (dosyalar arası çakışma
    // olmasın). Eklerde no yok → ana_evrak_id + "Ek N" yeter, çakışmaz.
    const uyap_ref = evrakNo
      ? ref(dosyaRef, 'evrakno', evrakNo)
      : ref(dosyaRef, anaEvrakId || '', ad || '', tarihStr || '', spanMetni || '');

    cikti.push({
      uyap_ref,
      dosya_ref: dosyaRef,
      _jeton: jeton,             // dosya jetonu (indirme sorgusu için)
      _evrakJeton: evrakJeton,   // evrak jetonu (indirme/görüntüleme). Panele YAZILMAZ.
      evrak_tipi: ad,
      evrak_tarihi: evrakTarihi,
      gonderen: temizle(detay['Gönderen Yer/Kişi'] || detay['Gönderen']),
      metin: null,               // PDF/UDF içeriği ayrı iş
      // Görüntüleme linki evrak JETONU + dosya JETONU ister (içerik-ref değil).
      uyap_link: evrakJeton
        ? `${TABAN}/view_document_brd.uyap?${new URLSearchParams({ evrakId: evrakJeton, dosyaId: jeton || '' })}`
        : null,
    });
  }
  return cikti;
}


/** title="<div>K: V</div><div>K2: V2</div>" → { K: V, K2: V2 }. HTML-decode'lu. */
function titleAlanlari(ham) {
  const cozulmus = ham
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  const alanlar = {};
  for (const m of cozulmus.matchAll(/<div[^>]*>([^:<]+):\s*([^<]*)<\/div>/g)) {
    alanlar[m[1].trim()] = m[2].trim();
  }
  return alanlar;
}

async function evrakListesi(jeton, dosyaRef) {
  const hepsi = [];
  const gorulen = new Set();
  let toplamSayfa = 1;

  for (let sayfa = 1; sayfa <= toplamSayfa && sayfa <= 20; sayfa++) {
    const metin = await cagir('evrakListesi', { dosyaId: jeton, pageNumber: String(sayfa) });
    if (sayfa === 1) {
      const m = /var\s+pageTotal\s*=\s*(\d+)/.exec(metin);
      if (m) toplamSayfa = Math.max(1, parseInt(m[1], 10));
    }
    for (const e of evrakAgaci(htmlBelge(metin), dosyaRef, jeton)) {
      if (gorulen.has(e.uyap_ref)) continue;   // sayfalar arası tekrar
      gorulen.add(e.uyap_ref);
      hepsi.push(e);
    }
  }
  return hepsi;
}

/**
 * Taraf satırlarını "Rol: Ad · Rol: Ad" tek satırına indirger. 6'dan fazlaysa
 * "+N kişi" ekler — künye kolonu şişmesin. Birleştirme mantığı TEK YERDE
 * (background da, ileride avukat portalı da bunu çağırsın).
 */
function tarafMetni(satirlar) {
  const parcalar = satirlar
    .map((t) => {
      const rol = temizle(t.Rol ?? t.rol);
      const ad = temizle(t['Adı'] ?? t.ad ?? t['Adı Soyadı'] ?? t.adSoyad);
      return [rol, ad].filter(Boolean).join(': ');
    })
    .filter(Boolean);
  if (!parcalar.length) return null;
  if (parcalar.length <= 6) return parcalar.join(' · ');
  return parcalar.slice(0, 6).join(' · ') + ` · +${parcalar.length - 6} kişi`;
}

async function taraflar(jeton) {
  return satirlara('taraflar', await cagir('taraflar', { dosyaId: jeton }));
}

/** Evrak baytı → base64. Metin ÇIKARILMAZ burada (background yapar). */
async function evrakIndir(evrakRef, jeton) {
  // URLSearchParams şart: jeton base64 olduğu için `+` ve `/` içeriyor.
  const q = new URLSearchParams({ evrakId: evrakRef, dosyaId: jeton ?? '' });
  const y = await fetch(`${TABAN}${UCLAR.evrakIndir.yol}?${q}`, {
    credentials: 'include',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
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
        case 'taraflar':      return yanitla({ veri: await taraflar(istek.dosyaRef) });
        case 'taraf-metni':   return yanitla({ metin: tarafMetni(await taraflar(istek.dosyaRef)) });
        case 'evrak-indir':   return yanitla({ base64: await evrakIndir(istek.evrakRef, istek.dosyaRef) });
        case 'uc-sagligi':    return yanitla({ rapor: await ucSagligi() });
        // Hangi uçlar biliniyor? Background bunu bir kez sorup bilinmeyenleri
        // HİÇ çağırmıyor — yoksa her dosya için patlayan bir istek + 800 ms
        // nezaket beklemesi boşa gidiyordu.
        case 'yetenekler':    return yanitla({
          veri: Object.fromEntries(Object.entries(UCLAR).map(([k, v]) => [k, Boolean(v)])),
        });
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
