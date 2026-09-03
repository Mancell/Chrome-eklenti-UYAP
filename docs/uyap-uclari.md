# UYAP uçları — ölçülmüş bulgular

Bu dosya **tahmin içermez.** Her satır ya portalın kendi JavaScript'inden ya da
kimlik doğrulaması gerektirmeyen bir sondadan çıkarıldı. Yöntem aşağıda.

## Yöntem: `nosessionobject` sondası

`vatandas.uyap.gov.tr` üzerinde bir ucun VAR olup olmadığı **giriş yapmadan**
anlaşılabiliyor. Oturumsuz POST atınca:

| Yanıt gövdesi | Anlamı |
|---|---|
| `<root><error>nosessionobject</error></root>` | **Uç var**, yalnız oturum yok |
| boş (0 bayt) | **Uç yok** |

HTTP kodu ikisinde de `200` — koda bakmak yanıltıcı, **gövdeye** bakmak gerekiyor.
Uydurma bir yolla (`/olmayan-uc-kontrol_brd.ajx` → boş) kontrol edildi.

```bash
curl -s -X POST -H "Content-Type: application/json" -d '{}' \
  https://vatandas.uyap.gov.tr/dosya_safahat_bilgileri_brd.ajx
# <root><error>nosessionobject</error></root>   → var
```

## Portal teknolojisi

- jQuery 2.1.3 + Metronic teması, JSP sunucu tarafı.
- İstekler `$.ajax` → **XMLHttpRequest**. Bu yüzden `extension/kesif.js`'in XHR
  kancası doğru araç.
- **Yanıtlar XML** (`<root>…</root>`), JSON DEĞİL. Bu, `uyap.js`'in ayrıştırma
  katmanını belirliyor.
- Uygulama kabuğu `/main/jsp/vatandas/index.jsp` → **302**, yani sayfa
  modülleri oturumsuz okunamıyor. Genel katman (`/theme/js/application/`,
  `/theme/js/uyapCore/`) ise herkese açık.

## vatandas.uyap.gov.tr — VAR olan uçlar

Taban: `https://vatandas.uyap.gov.tr`

| Uç | Metod | İş |
|---|---|---|
| `/dosya_safahat_bilgileri_brd.ajx` | POST | safahat (dosya hareketleri) |
| `/dosya_taraf_bilgileri_brd.ajx` | POST | taraflar |
| `/dosya_tahsilat_reddiyat_bilgileri_brd.ajx` | POST | tahsilat / reddiyat |
| `/get_evrak_mimeType_brd.ajx` | POST | evrakın MIME tipi |
| `/download_document_brd.uyap` | GET | evrak baytı |
| `/view_document_brd.uyap` | GET | evrak görüntüleme |

## vatandas.uyap.gov.tr — OLMAYAN uçlar

Bunlar **avukat portalına özgü**; vatandaşta boş gövde dönüyor:

`avukat_dosya_sorgula_cbs_brd.ajx`, `avukat_durusma_sorgula_brd.ajx`,
`avukat_safahat_sorgula_brd.ajx`, `list_dosya_evraklar.ajx`,
`dosyaAyrintiBilgileri_brd.ajx`, `getDocViewerParameters.ajx`,
`search_phrase.ajx`, `search_phrase_detayli.ajx`,
`getDosyaAramaParameters.ajx`, `mts_tebligat_safahat_list_brd.ajx`,
`kisiIletisimBilgileriSorgula.ajx`, `get_kullanici_tum_bildirimleri.ajx`

Denenip bulunamayan dosya-listesi adayları: `dosya_sorgula_brd.ajx`,
`vatandas_dosya_sorgula_brd.ajx`, `vatandas_dosya_sorgula_cbs_brd.ajx`,
`dosya_sorgula_cbs_brd.ajx`, `durusma_sorgula_brd.ajx`,
`vatandas_durusma_sorgula_brd.ajx`, `safahat_sorgula_brd.ajx`

## ⛔ Kalan tek bilinmeyen: Dosyalarım listesi ucu

`dosyaId` üreten giriş noktası. Gerisi ona bağlanıyor, o yüzden **tek blokaj bu.**

Bulmanın yolu (oturum gerekiyor, oturumsuz okunamadı):

1. Eklenti popup → *Sorun giderme* → **Keşif modu açık**
2. **UYAP sekmesini F5 ile yenile** (dinamik betik yalnız yeni yüklemede girer)
3. UYAP'a gir → **Dosyalarım**
4. Popup → **Kaydı kopyala** → `ajxIstekleri` listesindeki uç aranan şeydir

Duruşma listesi ucu da aynı şekilde bulunacak (vatandaş karşılığı bilinmiyor).

## Referans: avukat.uyap.gov.tr uçları

Kullanıcı vatandaş portalında kalmayı seçti; bu liste ileride avukat portalı
istenirse hazır olsun diye duruyor. Kaynak: Chrome Web Store'da yayınlanan
"Av. Asistan — UYAP & e-Tebligat" eklentisinin paket kodu (herkese dağıtılan
JS). Yalnızca **olgular** (URL ve alan adları) alındı, kod alınmadı.

| Uç | Gövde |
|---|---|
| `POST /avukat_dosya_sorgula_cbs_brd.ajx` | filtre objesi |
| `POST /search_phrase_detayli.ajx` | detaylı arama filtresi |
| `POST /avukat_durusma_sorgula_brd.ajx` | filtre objesi |
| `POST /avukat_safahat_sorgula_brd.ajx` | filtre objesi |
| `POST /dosya_safahat_bilgileri_brd.ajx` | dosya bazlı safahat |
| `POST /list_dosya_evraklar.ajx` | `{dosyaId, pageNumber}` |
| `POST /dosyaAyrintiBilgileri_brd.ajx` | dosya detay |
| `POST /dosya_taraf_bilgileri_brd.ajx` | taraflar |
| `POST /getDocViewerParameters.ajx` | görüntüleyici parametreleri |
| `POST /get_evrak_mimeType_brd.ajx` | MIME tipi |
| `GET /download_document_brd.uyap` | evrak baytı (arraybuffer) |
| `GET /view_document_brd.uyap` | `?evrakId=…&dosyaId=…` |
| `POST /mts_tebligat_safahat_list_brd.ajx` | MTS tebligat safahatı |
| `POST /get_kullanici_tum_bildirimleri.ajx` | `{baslangicTarihi, bitisTarihi}` |
| `POST /yargiBirimleriSorgula_brd.ajx` | yargı birimi listesi |
| `POST /avukatKisiselBilgileriSorgula.ajx` | avukat bilgileri |

**e-Tebligat (UETS) UYAP'ta değil**: `ptt.etebligat.gov.tr` +
`api.etebligat.gov.tr`, ayrı content script ve ayrı host izni gerektiriyor.

Not: o eklentinin kodunda `vatandas` **hiç geçmiyor** — vatandaş portalını
desteklemiyor. "Çalışan ürün nasıl yapıyor" sorusunun cevabı: başka portalda.

## `uyap_ref` seçme kuralı

Senkronun idempotent olması buna bağlı: aynı kayıt her senkronda **aynı** ref'i
üretmeli, farklı kayıtlar **farklı**.

- Yanıtta kalıcı bir kimlik varsa (`dosyaId` vb.) onu kullanın.
- Yoksa `uyap.js`'teki `ref(...)` ile içerikten türetin
  (örn. `ref(dosyaRef, tarih, islem)`). Ekrandaki sıra numarası gibi
  **değişebilecek** alanları ref'e KOYMAYIN — her senkronda satır çoğalır.
