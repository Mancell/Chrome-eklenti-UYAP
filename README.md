# UYAP Vatandaş Senkron

UYAP Vatandaş Portalı'ndaki **kendi** dava dosyalarınızı bir Chrome eklentisiyle
kendi panelinize aktarır: dava künyesi, taraflar, evrak ağacı ve belge
bağlantıları.

Şifreniz hiçbir yerde tutulmaz. Eklenti UYAP'a giriş yapmaz — **sizin açtığınız
oturumu** kullanır.

---

## Nasıl çalışır

```
┌──────────────────────────┐
│  Chrome Eklentisi (MV3)  │  UYAP sekmesinde, sizin oturumunuzda çalışır
│  · vatandas.uyap.gov.tr  │  Aynı köken → çerez otomatik gider
└────────────┬─────────────┘
             │  anon key + eklenti token'ı
             ▼
┌──────────────────────────┐
│   Supabase (PostgreSQL)  │  RLS + `security definer` RPC
│   · eklenti_senkron      │  Eklentinin tablolara doğrudan yazma yetkisi YOK
└────────────┬─────────────┘
             │  kullanıcının JWT'si (realtime)
             ▼
┌──────────────────────────┐
│   Panel (Vite + React)   │  Dosyalar, evrak ağacı, senkron durumu
└──────────────────────────┘
```

**Backend sunucusu yok.** Eklentinin kimliği `security definer` bir Postgres
fonksiyonunda çözülüyor; ayrı bir API katmanına gerek kalmıyor.

---

## Ne yapar

| | |
|---|---|
| **Dosyalarım** | Dava künyesi (esas no, birim, yargı türü, taraflar, açılış, durum, rolünüz) — **UYAP'taki sırayla** |
| **Evrak ağacı** | UYAP'ın hiyerarşisi birebir korunur: klasör → evrak → ekleri |
| **Belge** | Her evrak için "Görüntüle" ve "İndir" bağlantısı |
| **Senkron durumu** | Panelde canlı şerit: adım adım ilerleme, hata, son senkron zamanı |
| **Keşif modu** | UYAP uçları değişirse teşhis için ağ kaydı (çerez/şifre içermez) |

Evrak ağacı panelde şöyle görünür — klasörler kapalı başlar, tıklayınca açılır:

```
📂 Tüm Evraklar
  📂 2025/404 (Ceza Dava Dosyası)
    📂 Talimat Gelen Evrak (12)
      📄 Talimat Gelen Evrak 16/10/2025    Görüntüle ↗ · İndir ↓
      📄 Talimat Gelen Evrak 02/06/2025    Görüntüle ↗ · İndir ↓
        └ 📎 Ek 1                          Görüntüle ↗ · İndir ↓
        └ 📎 Ek 2
```

---

## Güvenlik modeli

- **UYAP şifreniz hiçbir yerde tutulmaz.** Eklenti oturum açmaz; sizin
  açtığınız oturumun çerezini aynı köken üzerinden kullanır.
- **Ham token veritabanında durmaz** — yalnız SHA-256 özeti. Sızsa bile geri
  çevrilemez; panelden iptal edilebilir.
- **RLS her tabloda açık.** Kullanıcı yalnız kendi satırlarını görür; testlerle
  iki ayrı kullanıcıyla doğrulanıyor.
- **`anon` rolünün hiçbir tabloda yetkisi yok.** Yazmanın tek yolu
  `eklenti_senkron` RPC'si.
- **Arka planda tarama yok.** `chrome.alarms` kullanılmıyor. Senkron yalnız siz
  UYAP'tayken çalışır; ayrıca "Şimdi Senkronla" ile elle tetiklenir.
- **Bot tespiti atlatma yok.** İstekler arası sabit 800 ms bekleme yalnız
  nezakettir.

---

## Kurulum

### 1. Veritabanı

```bash
supabase db push
```

Ya da SQL editöründe `supabase/migrations/*.sql` dosyalarını sırayla çalıştırın.

### 2. Panel

```bash
cd web && npm install && cp .env.example .env.local && npm run dev
```

`.env.local` içine Supabase adresinizi ve anon anahtarınızı yazın — adres
bilerek depoda tutulmuyor.

### 3. Eklenti

`chrome://extensions` → Geliştirici modu → **Paketlenmemiş yükle** →
`extension/` klasörü.

Sonra panelin **Kurulum** sayfasından token üretip eklentiye yapıştırın.
Sunucu adresi ve anon anahtar eklentiye gömülüdür (bunlar her kurulumda aynı,
kullanıcıya ait değil — bkz. `extension/ayarlar.js`).

---

## Kullanım

1. `vatandas.uyap.gov.tr`'ye kendi bilgilerinizle girin
2. **Dosyalarım** sayfasını açın
3. Senkron kendiliğinden başlar; dilerseniz eklenti popup'ından
   **Şimdi Senkronla** deyin
4. Panelde dosyalarınız, evrak ağacınız ve belge bağlantılarınız görünür

Belge bağlantıları UYAP'a gider; **UYAP oturumunuz açıkken** çalışırlar.

---

## UYAP entegrasyonu — öğrenilen davranışlar

Bu bölüm, entegrasyonu kuran herkesin saatlerini kurtarır. Hepsi gerçek
trafikten ölçüldü; tahmin yok. Ayrıntı: [`docs/uyap-uclari.md`](docs/uyap-uclari.md)

| Davranış | Sonuç |
|---|---|
| Uçlar `/main/jsp/vatandas/` altında, **belge uçları `/main/jsp/`** altında | Yol farkı kolayca gözden kaçıyor |
| Gövdeler **form-urlencoded**, JSON değil | JSON gönderince boş yanıt |
| Yanıtlar **karışık**: dosya listesi XML, taraf/evrak HTML | Tek biçim varsaymak hata |
| `dosyaId` sayı değil, **her sorguda değişen şifreli jeton** | Kalıcı kimlik olarak kullanılamaz → `uyap_ref` içerikten türetiliyor |
| Jeton XML'de **tırnak içinde** gelir, çağrılarda tırnaksız gider | Tırnak kalırsa istekler boş döner |
| Evrak listesi **ilk sayfada `pageNumber` istemez** | Göndermek boş liste döndürüyor |
| Alt uçlardan önce **`dosya_islem_turleri`** çağrılmalı | Atlanırsa `nosession` |
| Aynı yanıt dosyanın **hangi sekmeleri desteklediğini** söyler | Desteklenmeyen sekme hiç çağrılmıyor |
| Evrak listesi tablo değil, **ağaç (treeview)** | `data-sid` + `span.file`; ekler `data-sid`'siz |
| Yanıt HTML'inde **bozuk attribute** var (`<ul id="" + anaDosyaBilgisi + "">`) | Katı XML ayrıştırıcılar patlar; Chrome tolere eder |
| `tagName` HTML DOM'da **BÜYÜK HARF** | Küçük harfle karşılaştırmak sessizce 0 sonuç verir |

Vatandaş portalında **duruşma ve tebligat verisi sunulmuyor** (UYAP'ın kendi
"işlem türleri" yanıtı da bunu doğruluyor). Panel bu sayfalarda boş tablo yerine
açıklama gösterir.

---

## Geliştirme

```bash
npm test          # 77 test · tarayıcı gerekmez
```

Testler gerçek UYAP çıktısına karşı koşar: `extension/test-verisi/` altındaki
fixture'lar gerçek yanıtlardan alınmıştır. HTML ayrıştırma testleri **linkedom**
kullanır — `xmldom` HTML5 parser'ı değildir ve Chrome'un davranışını taklit
etmez (bir hatayı tam bu yüzden kaçırmıştık).

Veritabanı testleri Docker gerektirmez:

```bash
createdb uyaptest
psql -d uyaptest -v ON_ERROR_STOP=1 -q \
  -f supabase/tests/_supabase_stub.sql \
  -f supabase/migrations/0001_sema.sql \
  -f supabase/migrations/0002_rpc.sql
psql -d uyaptest -f supabase/tests/rpc_test.sql
```

`_supabase_stub.sql` Supabase'in testte gereken parçalarını (auth şeması,
`auth.uid()`, roller, realtime publication) taklit eder — **üretimde
çalıştırılmaz**.

### Yapı

```
extension/          Chrome eklentisi (MV3, build adımı yok)
  uyap.js           UYAP uçları + XML/HTML ayrıştırma + evrak ağacı
  background.js     Senkron orkestrasyonu, ilerleme bildirimi
  kesif.js          Keşif modu (MAIN world, yalnız açıkken kaydedilir)
  evrak.js          UDF → düz metin (kütüphanesiz)
  test-verisi/      Gerçek UYAP yanıtlarından fixture'lar
supabase/
  migrations/       Şema + RPC (sıralı, tekrar çalıştırılabilir)
  tests/            RPC ve RLS testleri
web/                Panel (Vite + React + supabase-js)
docs/uyap-uclari.md Ölçülmüş uç haritası ve yöntem
```

---

## Bilinen kısıtlar

- **Evrak metni çıkarılmıyor.** UDF için altyapı var (`evrak.js`), PDF için
  offscreen document gerekiyor. Belgeler bağlantıyla açılıyor/indiriliyor.
- **Safahat** bu portalda çoğu dosyada sunulmuyor; UYAP'ın izin listesine göre
  atlanıyor.
- **e-Tebligat (UETS)** ayrı bir sistemdir (`ptt.etebligat.gov.tr`), kapsam
  dışı.
- **Avukat portalı** (`avukat.uyap.gov.tr`) desteklenmiyor. Uçları ölçüldü ve
  belgelendi; e-imza erişimi olduğunda eklenebilir.

---

## Hukuki not

Panele yazılan veriler üçüncü kişi bilgisi içerir (karşı taraf, tanık,
bilirkişi). Kullanıcı veri sorumlusudur; KVKK aydınlatma ve veri işleme
yükümlülüğü bu kodun kapsamı dışındadır.

UYAP'a erişim kullanıcının kendi oturumunda, kendi verisine, kendi başlattığı
bir işlemle yapılır. Otomatik erişimin kullanım şartlarıyla uyumu ayrıca
değerlendirilmelidir.
