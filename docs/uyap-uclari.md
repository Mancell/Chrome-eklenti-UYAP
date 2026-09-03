# UYAP Vatandaş Portalı uçları — Faz 0 keşif çıktısı

**Durum: BOŞ. Keşif yapılmadı.**

`vatandas.uyap.gov.tr`'nin iç uçları herkese açık dokümante değil. Bu dosya
doldurulana kadar `extension/uyap.js` içindeki `UCLAR` boş kalır ve senkron
"UYAP uç keşfi tamamlanmadı" hatası verir. **Uydurma endpoint yazılmadı** —
yanlış bir URL sessizce boş veri döndürüp senkronu "çalışıyor" gibi gösterir.

## Keşif nasıl yapılır

1. Eklentiyi yükleyin (bkz. `extension/README.md`).
2. Popup → **Sorun giderme** → *Keşif modu açık*.
3. **UYAP sekmesini yenileyin (F5).** Bu adım ZORUNLU: kaydedici
   `chrome.scripting` ile dinamik kaydediliyor ve dinamik betikler yalnız YENİ
   sayfa yüklemelerinde devreye girer. Yenilemezseniz hiçbir şey kaydedilmez.
4. `vatandas.uyap.gov.tr`'ye kendi bilgilerinizle girin ve sırayla gezinin:
   - Dosyalarım (liste)
   - Bir dosyaya girin (safahat)
   - Duruşma günleri
   - Bir evrakı görüntüleyin/indirin
   - e-Tebligat kutusu
5. Gezinirken popup'taki **sayacın arttığını doğrulayın**. Artmıyorsa kayıt da
   yoktur — sayfalarca gezinmeye devam etmeyin, sayaç ne diyorsa onu okuyun.
6. Popup → **Kaydı kopyala** → JSON panoya gider (dosya indirme yarışına
   girmeden doğrudan yapıştırılabilir).
7. Aşağıdaki tabloyu doldurun, sonra `extension/uyap.js`'teki `UCLAR`'ı ve ilgili
   `map` gövdelerini yazın.

Kayıtta çerez, şifre veya `Authorization` başlığı **yoktur**; yanıtlardan yalnız
alan adları ve ilk 3 örnek satır saklanır, sayfanın belleğinde durur, sekme
kapanınca silinir.

## Sayaç boş çıkarsa — hangi sorun olduğunu ayırt etme

Kayıt iki liste döndürür: `kayitlar` (yakalanan ajax) ve `kaynaklar`
(PerformanceObserver'ın gördüğü TÜM ağ girdileri). Boş çıkınca:

| `kayitlar` | `kaynaklar` | Anlamı |
|---|---|---|
| 0 | 0 | Kaydedici sayfada değil → sekme yenilenmedi |
| 0 | `.ajx` istekleri var | Kanca yerleşimi yanlış → `kesif.js` düzeltilmeli |
| 0 | yalnız `navigation` | **UYAP ajax kullanmıyor**, tam sayfa form POST → ajax kaydı yerine DOM kazıma gerekir |

Üçüncü satır mimariyi değiştirir; `kaynaklar` tam bu ayrımı yapmak için var.

## Doldurulacak

| Veri | URL | Metod | İstek gövdesi | Yanıttaki alanlar |
|---|---|---|---|---|
| Dosya listesi | | | | `uyap_ref` ← ?, `dosya_no` ← ?, `birim` ← ?, `yargi_turu` ← ?, `taraflar` ← ?, `acilis_tarihi` ← ?, `durum` ← ? |
| Safahat | | | | `tarih` ← ?, `islem` ← ?, `aciklama` ← ? |
| Duruşmalar | | | | `tarih` ← ?, `saat` ← ?, `salon` ← ?, `tur` ← ? |
| Evrak listesi | | | | `uyap_ref` ← ?, `evrak_tipi` ← ?, `evrak_tarihi` ← ?, `gonderen` ← ?, `uyap_link` ← ? |
| Evrak indirme | | | | (ikili yanıt — UDF veya PDF) |
| e-Tebligat | | | | `konu` ← ?, `gonderen` ← ?, `teblig_tarihi` ← ?, `sure_gun` ← ? |

## `uyap_ref` seçme kuralı

Senkronun idempotent olması buna bağlı: aynı kayıt her senkronda **aynı** ref'i
üretmeli, farklı kayıtlar **farklı**.

- Yanıtta kalıcı bir kimlik varsa (`dosyaId` vb.) onu kullanın.
- Yoksa `uyap.js`'teki `ref(...)` ile içerikten türetin
  (örn. `ref(dosyaRef, tarih, islem)`). Ekrandaki sıra numarası gibi
  **değişebilecek** alanları ref'e KOYMAYIN — her senkronda satır çoğalır.
