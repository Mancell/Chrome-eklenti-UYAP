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
  $('kesifAcik').checked = Boolean(a.kesifAcik);

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

$('senkron').addEventListener('click', () => {
  $('senkron').disabled = true;
  durum('Senkron başladı…');
  chrome.runtime.sendMessage({ tip: 'senkron-basla' });
});

$('kesifAcik').addEventListener('change', async (e) => {
  await chrome.storage.local.set({ kesifAcik: e.target.checked });
  durum(e.target.checked
    ? 'Keşif modu açık. Portalda gezinin, sonra kaydı indirin.'
    : 'Keşif modu kapalı.');
});

$('kesifIndir').addEventListener('click', async () => {
  const { __uyap_kesif = [] } = await chrome.storage.session.get('__uyap_kesif');
  if (!__uyap_kesif.length) return durum('Kayıt boş — keşif modunu açıp portalda gezinin.', 'hata');
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(__uyap_kesif, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `uyap-kesif-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  durum(`${__uyap_kesif.length} istek indirildi.`, 'ok');
});

/** Tek yerden render: hem canlı mesaj hem popup açılışındaki son durum. */
function gosterDurum(msg) {
  if (msg.tip === 'ilerleme') {
    durum(msg.mesaj);
    $('senkron').disabled = true;      // senkron sürüyor
  } else if (msg.tip === 'baglandi') {
    durum('Bağlandı. Artık senkronu başlatabilirsiniz.', 'ok');
  } else if (msg.tip === 'bitti') {
    const s = msg.sonuc || {};
    durum(
      'Senkron bitti.\n' +
        Object.entries(s).map(([k, v]) => `  ${k}: ${v}`).join('\n'),
      'ok');
    $('senkron').disabled = false;
  } else if (msg.tip === 'hata') {
    durum('Hata: ' + msg.mesaj, 'hata');
    $('senkron').disabled = false;
  }
}

chrome.runtime.onMessage.addListener(gosterDurum);
