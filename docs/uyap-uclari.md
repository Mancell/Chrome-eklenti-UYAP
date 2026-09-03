# UYAP Vatandaş Portalı uçları — Faz 0 keşif çıktısı

**Durum: BOŞ. Keşif yapılmadı.**

`vatandas.uyap.gov.tr`'nin iç uçları herkese açık dokümante değil. Bu dosya
doldurulana kadar `extension/uyap.js` içindeki `UCLAR` boş kalır ve senkron
"UYAP uç keşfi tamamlanmadı" hatası verir. **Uydurma endpoint yazılmadı** —
yanlış bir URL sessizce boş veri döndürüp senkronu "çalışıyor" gibi gösterir.

## Keşif nasıl yapılır

1. Eklentiyi yükleyin (bkz. `extension/README.md`).
2. Popup → **Sorun giderme** → *Keşif modu açık*.
3. `vatandas.uyap.gov.tr`'ye kendi bilgilerinizle girin ve sırayla gezinin:
   - Dosyalarım (liste)
   - Bir dosyaya girin (safahat)
   - Duruşma günleri
   - Bir evrakı görüntüleyin/indirin
   - e-Tebligat kutusu
4. Popup → **Keşif kaydını indir** → JSON.
5. Aşağıdaki tabloyu doldurun, sonra `extension/uyap.js`'teki `UCLAR`'ı ve ilgili
   `map` gövdelerini yazın.

Kayıtta çerez, şifre veya `Authorization` başlığı **yoktur**; yanıtlardan yalnız
alan adları ve ilk 3 örnek satır saklanır, tarayıcı kapanınca silinir.

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
