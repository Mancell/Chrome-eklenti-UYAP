import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * `vite preview` bilinmeyen Host başlıklarını reddediyor (DNS rebinding
 * koruması). Railway'de servis kendi domaini altında çalıştığı için izin
 * verilmesi gerekiyor.
 *
 * Domain DEPOYA SABİT YAZILMIYOR: Railway `RAILWAY_PUBLIC_DOMAIN`'i kendisi
 * tanımlıyor, servis yeniden adlandırılırsa veya custom domain eklenirse
 * kod değişmiyor. `allowedHosts: true` de yapılmadı — o, korumayı tamamen
 * kapatmak olurdu.
 *
 * Custom domain / birden fazla domain için: ALLOWED_HOSTS=a.com,b.com
 */
const izinliler = [
  process.env.RAILWAY_PUBLIC_DOMAIN,
  ...(process.env.ALLOWED_HOSTS?.split(',') ?? []),
]
  .map((h) => h?.trim())
  .filter((h): h is string => Boolean(h));

export default defineConfig({
  plugins: [react()],
  preview: { allowedHosts: izinliler },
});
