// Popup: token'ı saklar, senkronu başlatır, ilerlemeyi gösterir.
//
// Kullanıcıdan istenen TEK şey token. Sunucu adresi ve genel anahtar eklentiye
// gömülü (bkz. ayarlar.js) — her kurulumda aynı olan, kullanıcıya ait olmayan
// değerleri vatandaştan istemek anlamsızdı.
//
// Token `chrome.storage.local`'da — yalnız bu tarayıcıda. Bir SIRDIR: başka
// hiçbir yere gönderilmez, yalnız senkronda Supabase RPC gövdesinde gider.

const $ = (id) => document.getElementById(id);
const durum = (metin, sinif = '') => {
  const d = $('durum');
  d.textContent = metin;
  d.className = sinif;
};

(async () => {
  const a = await chrome.storage.local.get(['token', 'kesifAcik']);
  $('token').value = a.token || '';

  // Kutu, storage'daki niyete DEĞİL gerçekte kayıtlı olup olmadığına bakıyor:
  // ikisi ayrışırsa (tarayıcı yeniden başladı, kayıt düştü) kullanıcı "açık"
  // görüp hiçbir şey kaydedilmediğini anlamıyordu.
  $('kesifAcik').checked = await kesifKayitli();
  sayacYenile();

  // Popup kapalıyken gelen son durumu geri yükle: senkron arka planda sürerken
  // popup'ı tekrar açan kullanıcı boş ekran görmesin.
  const { sonDurum } = await chrome.storage.session.get('sonDurum');
  if (sonDurum) {
    gosterDurum(sonDurum);
  } else if (a.token) {
    // Token duruyor ama bu oturumda doğrulanmadı. "Bağlı" DEMİYORUZ: token
    // panelden iptal edilmiş olabilir, bunu ancak sunucuya sorunca biliriz.
    durum('Token kaydedildi. Sınamak için Bağlan’a basın.');
  } else {
    durum('Panelin Kurulum sayfasından token alıp buraya yapıştırın.');
  }
})();

$('kaydet').addEventListener('click', async () => {
  const token = $('token').value.trim();
  if (!token) return durum('Panelden aldığınız token’ı yapıştırın.', 'hata');
  await chrome.storage.local.set({ token });
  durum('Bağlanılıyor…');
  chrome.runtime.sendMessage({ tip: 'baglan' });
});

// ---------------------------------------------------------------------------
// Keşif modu
//
// kesif.js STATİK content_script DEĞİL: yalnız burada, keşif açıkken sayfaya
// kaydediliyor. Betiğin varlığı bayrağın kendisi — eski tasarımdaki
// "MAIN world'e bayrağı sor" el sıkışması (ve onun yarış koşulu) yok.
//
// Kayıtlı betik SADECE YENİ SAYFA YÜKLEMELERİNDE devreye girer; bu yüzden
// açtıktan sonra UYAP sekmesini yenilemek zorunlu ve kullanıcıya söylüyoruz.
// ---------------------------------------------------------------------------
const KESIF_ID = 'uyap-kesif';
const UYAP_ESLESME = 'https://vatandas.uyap.gov.tr/*';

async function kesifKayitli() {
  const kayitli = await chrome.scripting.getRegisteredContentScripts({ ids: [KESIF_ID] });
  return kayitli.length > 0;
}

$('kesifAcik').addEventListener('change', async (e) => {
  try {
    if (e.target.checked) {
      if (!(await kesifKayitli())) {
        await chrome.scripting.registerContentScripts([{
          id: KESIF_ID,
          matches: [UYAP_ESLESME],
          js: ['kesif.js'],
          world: 'MAIN',            // sayfanın KENDİ fetch/XHR'ını sarmalamak için
          runAt: 'document_start',  // ilk istekten önce yerleşmeli
          allFrames: true,          // UYAP iframe kullanıyor olabilir
          persistAcrossSessions: false,
        }]);
      }
      durum('Keşif modu açık. ŞİMDİ UYAP sekmesini yenileyin (F5), sonra gezinin.', 'ok');
    } else {
      if (await kesifKayitli()) {
        await chrome.scripting.unregisterContentScripts({ ids: [KESIF_ID] });
      }
      durum('Keşif modu kapalı.');
    }
    await chrome.storage.local.set({ kesifAcik: e.target.checked });
    sayacYenile();
  } catch (hata) {
    e.target.checked = !e.target.checked;   // gerçek durumu yansıt
    durum('Keşif modu değiştirilemedi: ' + hata.message, 'hata');
  }
});

/** Açık UYAP sekmesinden kayıt tamponunu ister. */
async function kesifAl() {
  const [sekme] = await chrome.tabs.query({ url: UYAP_ESLESME });
  if (!sekme) return { hata: 'Açık bir UYAP sekmesi yok.' };
  try {
    const yanit = await chrome.tabs.sendMessage(sekme.id, { tip: 'kesif-al' });
    if (!yanit?.kesif) {
      return { hata: 'Kaydedici sayfada yok — keşif modunu açıp sekmeyi YENİLEYİN (F5).' };
    }
    return { kesif: yanit.kesif };
  } catch {
    return { hata: 'UYAP sekmesine ulaşılamadı. Sayfayı yenileyip tekrar deneyin.' };
  }
}

/**
 * Canlı sayaç. Kaydedicinin sessizce çalışmadığını kullanıcı SAYFALARCA
 * gezindikten sonra değil, ANINDA görsün — eski sürümde bu sinyal yoktu.
 */
async function sayacYenile() {
  const el = $('kesifSayac');
  if (!$('kesifAcik').checked) { el.textContent = ''; return; }
  const { kesif, hata } = await kesifAl();
  if (hata) { el.textContent = hata; return; }
  const n = kesif.kayitlar.length;
  const k = kesif.kaynaklar.length;
  const a = (kesif.ajxIstekleri || []).length;
  el.textContent = n
    // Aranan şey `.ajx` ucu; sayacın asıl anlamlı kısmı o.
    ? `${n} istek kaydedildi — bunlardan ${a} tanesi .ajx (aradığımız bu).`
    : k
      ? `Henüz ajax yok, ${k} ağ girdisi görüldü — Dosyalarım sayfasına girin.`
      : 'Hiç ağ girdisi yok. Sekmeyi yenilediniz mi?';
}

function kesifJson(kesif) {
  return JSON.stringify(kesif, null, 2);
}

/**
 * Uç sağlığı — `nosessionobject` imzasını kullanır (bkz. docs/uyap-uclari.md).
 * Sessiz çökme yerine "hangi uç erişilebilir" raporu.
 */
$('ucSagligi').addEventListener('click', async () => {
  const [sekme] = await chrome.tabs.query({ url: UYAP_ESLESME });
  if (!sekme) return durum('Açık bir UYAP sekmesi yok.', 'hata');
  durum('Uçlar sınanıyor…');
  try {
    const { rapor, hata } = await chrome.tabs.sendMessage(sekme.id, { tip: 'uc-sagligi' });
    if (hata) return durum(hata, 'hata');
    durum(Object.entries(rapor).map(([k, v]) => `  ${k}: ${v}`).join('\n'));
  } catch {
    durum('UYAP sekmesine ulaşılamadı. Sayfayı yenileyip tekrar deneyin.', 'hata');
  }
});

$('kesifKopyala').addEventListener('click', async () => {
  const { kesif, hata } = await kesifAl();
  if (hata) return durum(hata, 'hata');
  if (!kesif.kayitlar.length && !kesif.kaynaklar.length) {
    return durum('Kayıt boş. Keşif modunu açıp UYAP sekmesini YENİLEYİN (F5), sonra gezinin.', 'hata');
  }
  await navigator.clipboard.writeText(kesifJson(kesif));
  durum(`Panoya kopyalandı: ${kesif.kayitlar.length} istek, ${kesif.kaynaklar.length} ağ girdisi.\nSohbete yapıştırabilirsiniz.`, 'ok');
});

$('kesifIndir').addEventListener('click', async () => {
  const { kesif, hata } = await kesifAl();
  if (hata) return durum(hata, 'hata');
  const url = URL.createObjectURL(new Blob([kesifJson(kesif)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `uyap-kesif-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  // HEMEN revoke etmek indirmeyi iptal edebiliyor (eski sürümdeki hata).
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  durum(`İndiriliyor: ${kesif.kayitlar.length} istek.`, 'ok');
});

/** Tek yerden render: hem canlı mesaj hem popup açılışındaki son durum. */
function gosterDurum(msg) {
  if (msg.tip === 'ilerleme') {
    durum(msg.mesaj);
  } else if (msg.tip === 'baglandi') {
    durum('Bağlandı. UYAP’ta Dosyalarım sayfasına girin — senkron kendiliğinden başlar.', 'ok');
  } else if (msg.tip === 'bitti') {
    const s = { ...(msg.sonuc || {}) };
    const yol = s._yol; delete s._yol;
    const alanlar = s._alanlar; delete s._alanlar;
    const atlanan = s._atlanan; delete s._atlanan;
    const doluluk = s._doluluk; delete s._doluluk;
    durum(
      'Senkron bitti.\n' +
        Object.entries(s).map(([k, v]) => `  ${k}: ${v}`).join('\n') +
        (yol ? `\n${yol}` : '') +
        (alanlar ? `\nUYAP alanları: ${alanlar}` : '') +
        (atlanan ? `\nAtlandı (ucu bilinmiyor): ${atlanan}` : '') +
        (doluluk ? `\nKünye doluluğu: ${doluluk}` : ''),
      'ok');
  } else if (msg.tip === 'hata') {
    durum('Hata: ' + msg.mesaj, 'hata');
  }
}

chrome.runtime.onMessage.addListener(gosterDurum);
