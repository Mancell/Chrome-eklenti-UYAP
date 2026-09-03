// Panelin adresi ve genel (anon) anahtarı — EKLENTİYE GÖMÜLÜ.
//
// Neden kullanıcıya sorulmuyor: bu iki değer her kurulumda birebir aynı,
// kullanıcıya ait değil. Normal bir vatandaştan "sunucu adresi" ve "genel
// anahtar" istemek hem anlaşılmaz hem de yanlış yazıldığında anlamsız bir
// hata ("Sunucu 404") veriyordu. Kullanıcıya ait tek sır TOKEN; yalnız o
// sorulur (bkz. popup.html).
//
// Neden sır DEĞİL: `anon` anahtarı istemci kodunda taşınmak üzere tasarlanmış
// — panelin JS bundle'ında da açıkta duruyor. Kapıyı açar, veriye erişim
// vermez: her tabloda RLS var, `anon`'un hiçbir tabloda yetkisi yok ve token
// üretemez. Yazma yolu yalnız `eklenti_senkron` RPC'sinden geçer, kimlik de
// orada ham token'dan çözülür.
//
// GÖMÜLMEYECEK OLAN: `service_role` anahtarı. RLS'i baypas eder; eklentiye
// (ya da panele) konursa tüm kullanıcıların dosyaları açığa çıkar.
//
// Depo geleneği "adres sabit yazılmaz" (bkz. web/.env.example); bu dosya onun
// bilinçli istisnası: MV3'te build adımı ve ortam değişkeni yok, değer
// yayınlanan dosyanın içinde gitmek zorunda.
//
// Anahtar ileride döndürülürse eklentinin yeni sürümü yayınlanmalı.
export const SUNUCU = 'https://jzwsqvmyrbykcfeaanks.supabase.co';
export const GENEL_ANAHTAR =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6d3Nxdm15cmJ5a2NmZWFhbmtzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0MzU2NTMsImV4cCI6MjEwNDAxMTY1M30.eu9EIr9mmizHafdh1u_dMG75MF2KodujmdkHWwz7_y0';
