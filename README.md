# UYAP Vatandaş Senkron

UYAP Vatandaş Portalı'ndaki **kendi** dava dosyalarınızı bir Chrome eklentisiyle
kendi panelinize aktarır: dosya künyesi, safahat, duruşmalar, evraklar,
e-tebligat.

```
Chrome Eklentisi (MV3, build yok)
        │  anon key + eklenti token'ı
        ▼
Supabase Postgres  ──  2 RPC (security definer) + RLS
        ▲
        │  kullanıcının JWT'si
Panel (Vite + React)
```

**Backend sunucusu yok.** Eklentinin kimliği `security definer` bir Postgres
fonksiyonunda çözülüyor; FastAPI/Railway/Docker katmanına gerek kalmıyor.
Eklentinin tablolara doğrudan yazma yetkisi yok — tek yol `eklenti_senkron`.

## Güvenlik modeli

- **UYAP şifreniz hiçbir yerde tutulmaz.** Eklenti UYAP'a giriş yapmaz;
  sizin açtığınız oturumun çerezini aynı köken üzerinden kullanır.
- **Ham token DB'de durmaz** — yalnız SHA-256 hash'i. Sızsa bile geri
  çevrilemez. Panelden iptal edilebilir.
- **RLS her tabloda açık**; kullanıcı yalnız kendi satırlarını görür
  (`rpc_test.sql` bunu iki kullanıcıyla doğruluyor).
- **Otomatik tarama yok**, **bot tespiti atlatma yok** (bkz.
  `extension/README.md`).

## Durum

| Parça | Durum |
|---|---|
| Şema + RLS + indeksler (`supabase/migrations/0001_sema.sql`) | ✅ test edildi |
| RPC'ler (`0002_rpc.sql`) | ✅ 7 test geçiyor |
| Panel (`web/`) | ✅ derleniyor, typecheck temiz |
| Eklenti iskeleti + UDF metin çıkarma | ✅ 5 test geçiyor |
| **UYAP uçları (`extension/uyap.js` → `UCLAR`)** | ⛔ **BOŞ — Faz 0 keşif bekliyor** |
| PDF evrak metni | ⏸ bilinçli tavan (bkz. `extension/README.md`) |

Keşif bitene kadar senkron veri **akıtmaz**; net bir hata verir. Uydurma
endpoint yazılmadı. Yapılışı: `docs/uyap-uclari.md`.

## Kurulum

### 1. Veritabanı

```bash
supabase db push
```

Ya da SQL editöründe sırayla `supabase/migrations/0001_sema.sql` ve
`0002_rpc.sql`.

### 2. Panel

```bash
cd web && npm install && cp .env.example .env.local && npm run dev
```

`.env.local`'e Supabase adresi ve anon key yazın — adres bilerek depoda tutulmaz.

### 3. Eklenti

`chrome://extensions` → Geliştirici modu → Paketlenmemiş yükle → `extension/`.
Sonrası panelin **Kurulum** sayfasındaki 5 adım — kullanıcıdan istenen tek şey
token; sunucu adresi ve genel anahtar `extension/ayarlar.js`'e gömülü.

## Testler

```bash
node --test extension/evrak.test.mjs
```

Veritabanı testleri Docker gerektirmez — düz bir Postgres yeter:

```bash
createdb uyaptest && psql -d uyaptest -v ON_ERROR_STOP=1 -q -f supabase/tests/_supabase_stub.sql -f supabase/migrations/0001_sema.sql -f supabase/migrations/0002_rpc.sql && psql -d uyaptest -f supabase/tests/rpc_test.sql
```

`_supabase_stub.sql` Supabase'in testte gereken parçalarını (auth şeması,
`auth.uid()`, roller, realtime publication) taklit eder — **üretimde
çalıştırılmaz**. Test kendini `rollback` ile temizler.

## Uçtan uca doğrulama

1. Panelde token üret → eklentiye yapıştır → **Kaydet ve Bağlan** (yeşil onay).
2. UYAP'a gir → Dosyalarım → **Senkronu başlat**.
3. Panelde satırların *canlı* belirmesini izle (realtime).
4. **Senkronu ikinci kez çalıştır — satır sayısı artmamalı** (idempotency).

## Hukuki not

Panele yazılan evrak metni üçüncü kişi verisi içerir (karşı taraf, tanık,
bilirkişi). Kullanıcı veri sorumlusudur; KVKK aydınlatma ve veri işleme
yükümlülüğü bu kodun kapsamı dışındadır. UYAP'a erişim kullanıcının kendi
oturumunda, kendi verisine, manuel tetiklemeyle yapılır — otomatik erişimin
kullanım şartlarıyla uyumu ayrıca değerlendirilmelidir.
