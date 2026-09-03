# Av. Asistan — UYAP Senkron (Chrome eklentisi)

Kullanıcının **kendi** UYAP Vatandaş Portalı oturumundaki dosyalarını,
**kendisi başlattığında** panele aktaran MV3 eklentisi. Build adımı yok —
klasör olduğu gibi yüklenir.

## Kırmızı çizgiler

- **Şifre okunmaz, tutulmaz, gönderilmez.** Eklenti UYAP'a giriş yapmaz;
  kullanıcının zaten açık oturumunu (aynı köken çerezi) kullanır.
- **Arka plan taraması yok.** `chrome.alarms` yok. Senkron yalnız kullanıcı
  UYAP sayfasındayken, o sayfa açıkken çalışır ve 5 dakika soğuma uygular.
  Kullanıcı açısından otomatik, ama tarayıcı UYAP'ta değilken hiçbir şey olmaz.
- **Bot tespiti atlatma yok.** `background.js`'teki sabit 800 ms yalnız nezaket
  içindir — UYAP'ı yormamak için, gizlenmek için değil.

## Kurulum (yerel test)

1. `chrome://extensions` → Geliştirici modu → **Paketlenmemiş yükle** → bu
   `extension/` klasörü.
2. Panelde **Kurulum** sayfasından token üretin.
3. Eklenti popup'ına **yalnız token**'ı yapıştırıp **Bağlan**.
4. `vatandas.uyap.gov.tr`'ye girin, **Dosyalarım**'a gidin. Senkron
   **kendiliğinden** başlar — basılacak buton yok.

Sunucu adresi ve genel anahtar kullanıcıya sorulmuyor: `ayarlar.js`'e gömülü.
Başka bir Supabase projesine bağlanacaksanız oradaki iki sabiti ve
`manifest.json`'daki `host_permissions` adresini değiştirin.

## Dosyalar

| Dosya | İş |
|---|---|
| `uyap.js` | İçerik betiği (ISOLATED). UYAP'tan veri çeker + XML ayrıştırma. Altı uç **ölçüldü**; dosya listesi ucu hâlâ bilinmiyor — bkz. `docs/uyap-uclari.md` |
| `kesif.js` | MAIN world `fetch`/`XHR` kaydedici. **Statik değil**: yalnız keşif açıkken `chrome.scripting` ile kaydediliyor — betiğin varlığı bayrağın kendisi |
| `evrak.js` | Evrak baytı → düz metin. UDF (ZIP+CDATA) çalışıyor; PDF bu turda çıkarılmıyor |
| `background.js` | Orkestrasyon + tek `eklenti_senkron` RPC çağrısı |
| `ayarlar.js` | Panel adresi + genel anahtar (gömülü, public değerler). `service_role` ASLA buraya konmaz |
| `popup.*` | Token girişi, senkron, ilerleme, keşif modu |

## Test

```bash
npm test
```

Tarayıcı gerekmez. Tek test bağımlılığı `@xmldom/xmldom` (Node'da `DOMParser`
yok); eklentinin kendisi bağımlılıksız.

- `evrak.test.mjs` — gerçek bir UDF (zip + deflate) üretip metni geri çıkarır;
  bozuk baytta fırlatmadığını doğrular.
- `kesif.test.mjs` — `node:vm` içinde sahte bir sayfa kurup kaydedicinin
  isteği gerçekten yakaladığını doğrular. Bu bileşen iki kez SESSİZCE çöktü
  (MAIN/ISOLATED el sıkışma yarışı); test tam o şeyi ölçüyor.
- `uyap.test.mjs` — XML katmanı: `nosessionobject` okunur cümleye çevriliyor
  mu, genel satır ayrıştırıcı çalışıyor mu, ölçülmüş uçlar yerinde mi.

## Bilinen tavan

**PDF evrakların metni çıkarılmıyor.** pdf.js `new Worker()` istiyor, service
worker'da yok. Yükseltme yolu: offscreen document + vendor'lanmış pdf.js
(`evrak.js` içindeki `pdfMetin`'i oraya taşımak). O zamana kadar PDF evraklar
künye + `uyap_link` ile kaydediliyor — satır düşürülmüyor, kullanıcı belgeyi
UYAP'ta açıyor.
