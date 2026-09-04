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

## vatandas.uyap.gov.tr — GERÇEK uçlar (keşif kaydı, 2026-09-04)

**Uçlar kökte DEĞİL.** Taban yol: `/main/jsp/vatandas/`

Kökte de `nosessionobject` dönüyor çünkü sunucuda `*.ajx` için catch-all
eşlemesi var — ilk sondam varlığı doğru ama **yolu eksik** ölçmüştü. Aşağıdakiler
portalın kendi isteklerinden alındı.

**Gövdeler `application/x-www-form-urlencoded`, JSON DEĞİL.**
**Yanıtlar karışık:** dosya listesi XML, taraf/evrak/safahat HTML parçası.

| Uç (`/main/jsp/vatandas/` +) | Gövde | Yanıt |
|---|---|---|
| `vatandas_dosyalari_sorgula.ajx` | `yargiTuru=0&yargiBirimi=&dosyaYil=&mahkeme=&dosyaSira=&baslangicTarihi=&bitisTarihi=&dosyaKapanisBaslangicTarihi=&dosyaKapanisBitisTarihi=&dosyaKapaliMi=true` | XML `<root><DVOList><liste><VatandasGenelDVO>` |
| `dosya_taraf_bilgileri_brd.ajx` | `dosyaId=…` | HTML `<table id='taraf_listesi_table'>` |
| `dosya_evrak_bilgileri_brd.ajx` | `dosyaId=…&pageNumber=N` | HTML + `var pageTotal` (SAYFALI) |
| `dosya_islem_turleri_sorgula_brd.ajx` | `dosyaId=…&kurumNo=` | XML `<HashMap><Entry>` |
| `vatandas_mahkemeleri_sorgula.ajx` | `yargiTuru=0&yargiBirimi=&dosyaKapaliMi=true` | XML `<BirimDVO>` |
| `dosya_safahat_bilgileri_brd.ajx` | `dosyaId=…` | (sondayla doğrulandı, kayıtta yok) |
| `/download_document_brd.uyap` (kökte) | `?evrakId=…&dosyaId=…` | evrak baytı |

### ⚠ `dosyaId` SAYI DEĞİL

Opak, şifrelenmiş base64 jetonu:

```
ww6iHinZvx+hluPRY61cpK6DPMoL1cdxtMuJe0icBTk7bUTGsiGyFxvOZAT9KWqW
```

`+` ve `/` içerdiği için **URL kaçışı şart** (`URLSearchParams`). İlk sürümdeki
`\d{2,}` deseni bunu hiç yakalamıyordu.

### Başlıklar `<thead>` içinde doğrudan `<th>`

`<tr>` sarmalayıcı yok: `<thead><th>Rol</th><th>Tipi</th>…`. Başlığı ilk
`<tr>`'de aramak veri satırını başlık sanıp düşürüyor.

### Hâlâ bilinmeyen

**Duruşma ucu.** Vatandaş portalında ayrı bir duruşma sorgusu görülmedi;
bilgi safahat içinde geliyor olabilir. İlk gerçek safahat yanıtında bakılacak.

**`VatandasGenelDVO` alan adları.** Kayıtta ilk 200 karakter vardı, yalnız
`birimId` ve `birimAdi` görülebildi. Kaydedicinin örnek sınırı 4000'e çıkarıldı;
bir sonraki kayıt tam listeyi verecek. Bu arada `alan()` birden çok aday deniyor
ve senkron sonucu UYAP'ın döndürdüğü alan adlarını popup'ta raporluyor.

## avukat.uyap.gov.tr — 9/9 uç DOĞRULANDI

Aynı sonda bu portalda da çalışıyor, hatta daha net: gerçek uç
`<root><error>nosessionobject</error></root>`, olmayan yol **HTML hata sayfası**
döndürüyor (vatandaştaki gibi boş değil).

**Senkronun ihtiyaç duyduğu 9 ucun 9'u da var.** Yani avukat portalında
bilinmeyen sıfır — vatandaşta takıldığımız dosya listesi ucu orada mevcut
(`avukat_dosya_sorgula_cbs_brd.ajx`).

Bağlanmadı çünkü e-imza erişimi ve test edecek oturum yok; kör uçuş olurdu.
E-imza geldiğinde: `UCLAR`'ı portale göre seçtir (`location.hostname`),
manifest'e host ekle, alan adlarını ilk gerçek oturumda keşifle kesinleştir.

Kaynak: Chrome Web Store'da yayınlanan "Av. Asistan — UYAP & e-Tebligat"
eklentisinin paket kodu (herkese dağıtılan JS) + yukarıdaki sonda. Yalnızca
**olgular** (URL ve alan adları) alındı, kod alınmadı.

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
