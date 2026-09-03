# Av. Asistan — UYAP Senkron (Chrome eklentisi)

Kullanıcının **kendi** UYAP Vatandaş Portalı oturumundaki dosyalarını,
**kendisi başlattığında** panele aktaran MV3 eklentisi. Build adımı yok —
klasör olduğu gibi yüklenir.

## Kırmızı çizgiler

- **Şifre okunmaz, tutulmaz, gönderilmez.** Eklenti UYAP'a giriş yapmaz;
  kullanıcının zaten açık oturumunu (aynı köken çerezi) kullanır.
- **Otomatik/arka plan tarama yok.** Alarm yok, sayfa açılınca çekme yok.
  Senkron yalnız popup'taki butonla başlar.
- **Bot tespiti atlatma yok.** `background.js`'teki sabit 800 ms yalnız nezaket
  içindir — UYAP'ı yormamak için, gizlenmek için değil.

## Kurulum (yerel test)

1. `chrome://extensions` → Geliştirici modu → **Paketlenmemiş yükle** → bu
   `extension/` klasörü.
2. Panelde **Kurulum** sayfasından token üretin.
3. Eklenti popup'ına token + Supabase adresi + anon key yazıp
   **Kaydet ve Bağlan**.
4. `vatandas.uyap.gov.tr`'ye girin, **Dosyalarım**'a gidin,
   **Senkronu başlat**.

`manifest.json` içindeki `host_permissions` varsayılan olarak `*.supabase.co`
kapsıyor. Kendi alan adınızı kullanıyorsanız oraya ekleyin.

## Dosyalar

| Dosya | İş |
|---|---|
| `uyap.js` | İçerik betiği (ISOLATED). UYAP'tan veri çeker. **`UCLAR` boş — bkz. `docs/uyap-uclari.md`** |
| `kesif.js` | MAIN world, varsayılan kapalı. `fetch`/`XHR` kaydedici; Faz 0 keşif aracı |
| `evrak.js` | Evrak baytı → düz metin. UDF (ZIP+CDATA) çalışıyor; PDF bu turda çıkarılmıyor |
| `background.js` | Orkestrasyon + tek `eklenti_senkron` RPC çağrısı |
| `popup.*` | Ayarlar, senkron, ilerleme, keşif modu |

## Test

```bash
node --test extension/evrak.test.mjs
```

Tarayıcı gerekmez, bağımlılık yok. Gerçek bir UDF (zip + deflate) üretip metni
geri çıkarır; bozuk baytta fırlatmadığını doğrular.

## Bilinen tavan

**PDF evrakların metni çıkarılmıyor.** pdf.js `new Worker()` istiyor, service
worker'da yok. Yükseltme yolu: offscreen document + vendor'lanmış pdf.js
(`evrak.js` içindeki `pdfMetin`'i oraya taşımak). O zamana kadar PDF evraklar
künye + `uyap_link` ile kaydediliyor — satır düşürülmüyor, kullanıcı belgeyi
UYAP'ta açıyor.
