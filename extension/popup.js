// Popup: ayarları saklar, senkronu başlatır, ilerlemeyi gösterir.
//
// Ayarlar `chrome.storage.local`'da — yalnız bu tarayıcıda. Token bir SIRDIR:
// başka hiçbir yere gönderilmez, yalnız senkronda Supabase RPC gövdesinde gider.

const $ = (id) => document.getElementById(id);
const durum = (metin, sinif = '') => {
  const d = $('durum');
  d.textContent = metin;
  d.className = sinif;
};

const ALANLAR = ['token', 'supabaseUrl', 'supabaseAnon'];

(async () => {
  const a = await chrome.storage.local.get([...ALANLAR, 'kesifAcik']);
  for (const k of ALANLAR) $(k).value = a[k] || '';
  $('kesifAcik').checked = Boolean(a.kesifAcik);
})();

$('kaydet').addEventListener('click', async () => {
  const deger = Object.fromEntries(ALANLAR.map((k) => [k, $(k).value.trim()]));
  if (ALANLAR.some((k) => !deger[k])) {
    return durum('Üç alanı da doldurun.', 'hata');
  }
  await chrome.storage.local.set(deger);
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

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.tip === 'ilerleme') durum(msg.mesaj);
  else if (msg.tip === 'baglandi') durum('Bağlandı. Artık senkronu başlatabilirsiniz.', 'ok');
  else if (msg.tip === 'bitti') {
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
});
