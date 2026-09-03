// Evrak baytı → düz metin.
//
// UDF (UYAP Doküman Formatı) = ZIP; içindeki `content.xml`'in <content> CDATA'sı
// belgenin düz metni. ZIP'i AÇMAK İÇİN KÜTÜPHANE YOK: tarayıcının kendi
// `DecompressionStream('deflate-raw')`'ı yeterli (~60 satır zip dizini okuma).
//
// ponytail: PDF METNİ ÇIKARILMIYOR (bilinçli tavan). PDF metni içerik akışlarına
// gömülü; çıkarmak pdf.js gerektiriyor, pdf.js ise `new Worker()` istiyor —
// service worker'da yok. Doğru yükseltme yolu: offscreen document + vendor'lanmış
// pdf.js, `pdfMetin`'i orada çalıştırmak. O gelene kadar PDF evraklar künye +
// `uyap_link` ile kaydediliyor (kullanıcı belgeyi UYAP'ta açıyor), satır
// düşürülmüyor. Taranmış PDF'ler zaten OCR ister; o ayrı bir karar.

const u32 = (d, o) => d.getUint32(o, true);
const u16 = (d, o) => d.getUint16(o, true);

/** ZIP merkezi dizininden tek bir dosyayı çıkarır. Yoksa/bozuksa null. */
async function zipDosyaOku(bayt, aranan) {
  const d = new DataView(bayt.buffer, bayt.byteOffset, bayt.byteLength);

  // EOCD (0x06054b50) sondan aranır; yorum alanı en fazla 64 KB.
  let eocd = -1;
  for (let i = bayt.length - 22; i >= Math.max(0, bayt.length - 22 - 65535); i--) {
    if (u32(d, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;

  let p = u32(d, eocd + 16);              // merkezi dizin başlangıcı
  const adet = u16(d, eocd + 10);

  for (let i = 0; i < adet && p + 46 <= bayt.length; i++) {
    if (u32(d, p) !== 0x02014b50) return null;
    const yontem = u16(d, p + 10);
    const sikBoy = u32(d, p + 20);
    const adBoy  = u16(d, p + 28);
    const ekBoy  = u16(d, p + 30);
    const yorBoy = u16(d, p + 32);
    const yerel  = u32(d, p + 42);
    const ad = new TextDecoder().decode(bayt.subarray(p + 46, p + 46 + adBoy));

    if (ad === aranan || ad.endsWith('/' + aranan)) {
      // Yerel başlıktaki ad/ek uzunlukları merkezi dizindekinden FARKLI olabilir
      // (spec buna izin veriyor) — veri konumu için yerel başlık okunmalı.
      if (u32(d, yerel) !== 0x04034b50) return null;
      const veriBas = yerel + 30 + u16(d, yerel + 26) + u16(d, yerel + 28);
      const ham = bayt.subarray(veriBas, veriBas + sikBoy);
      if (yontem === 0) return ham;                    // saklanmış
      if (yontem !== 8) return null;                   // desteklenmeyen sıkıştırma
      const akis = new Blob([ham]).stream()
        .pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(akis).arrayBuffer());
    }
    p += 46 + adBoy + ekBoy + yorBoy;
  }
  return null;
}

/** UDF baytı → düz metin. */
async function udfMetin(bayt) {
  const xml = await zipDosyaOku(bayt, 'content.xml');
  if (!xml) return '';
  const metin = new TextDecoder('utf-8').decode(xml);

  // <content> CDATA — belgenin düz metni. DOMParser kullanılmıyor: UDF'in XML'i
  // bazen bildirilen kodlamayla uyuşmuyor ve parser tüm belgeyi reddediyor.
  const m = metin.match(/<content[^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/content>/);
  if (m) return m[1].trim();

  // CDATA yoksa etiketleri sıyır (bazı üreticiler düz metin gömüyor).
  return metin.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * PDF: bu turda metin çıkarılmıyor (yukarıdaki ponytail notu). Satır künye +
 * `uyap_link` ile kaydedilsin diye BOŞ döner — hata değil.
 */
async function pdfMetin(_bayt) {
  return '';
}

/**
 * Baytın türünü İMZASINDAN anlar (dosya adına/uzantıya güvenilmez — UYAP evrak
 * indirmesi çoğu zaman adsız gelir) ve metni döndürür.
 */
export async function evrakMetni(bayt) {
  try {
    if (!bayt || bayt.length < 4) return '';
    // "PK\x03\x04" → ZIP ailesi; UYAP bağlamında UDF.
    if (bayt[0] === 0x50 && bayt[1] === 0x4b && bayt[2] === 0x03 && bayt[3] === 0x04) {
      return await udfMetin(bayt);
    }
    // "%PDF"
    if (bayt[0] === 0x25 && bayt[1] === 0x50 && bayt[2] === 0x44 && bayt[3] === 0x46) {
      return await pdfMetin(bayt);
    }
    return '';   // TIFF/DOC/resim: bu turda metin çıkarılmıyor
  } catch {
    return '';   // sözleşme: asla fırlatma
  }
}
