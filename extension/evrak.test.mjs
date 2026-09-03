// node --test extension/evrak.test.mjs   · tarayıcı gerekmez · bağımlılık yok
//
// Gerçek bir UDF üretilip (zip + deflate) metni geri çıkarılıyor. Sözleşme
// kontrolü de burada: bozuk baytta FIRLATMAMALI, '' dönmeli — tek bozuk evrak
// 200 evraklık senkronu düşürmesin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

// Chrome API'si yok; evrak.js yalnız pdfMetin içinde dokunuyordu, o da artık
// dokunmuyor — yine de import güvenliği için tanımlıyoruz.
globalThis.chrome = { runtime: { getURL: (p) => p } };
const { evrakMetni } = await import('./evrak.js');

/** Tek dosyalık, deflate'li geçerli bir ZIP kurar (UDF de bu). */
function zipYap(ad, icerik) {
  const adB = Buffer.from(ad, 'utf8');
  const veri = Buffer.from(icerik, 'utf8');
  const sik = zlib.deflateRawSync(veri);
  const crc = zlib.crc32 ? zlib.crc32(veri) : crc32(veri);

  const yerel = Buffer.alloc(30);
  yerel.writeUInt32LE(0x04034b50, 0); yerel.writeUInt16LE(20, 4);
  yerel.writeUInt16LE(8, 8);          yerel.writeUInt32LE(crc, 14);
  yerel.writeUInt32LE(sik.length, 18); yerel.writeUInt32LE(veri.length, 22);
  yerel.writeUInt16LE(adB.length, 26);

  const merkez = Buffer.alloc(46);
  merkez.writeUInt32LE(0x02014b50, 0); merkez.writeUInt16LE(20, 6);
  merkez.writeUInt16LE(8, 10);         merkez.writeUInt32LE(crc, 16);
  merkez.writeUInt32LE(sik.length, 20); merkez.writeUInt32LE(veri.length, 24);
  merkez.writeUInt16LE(adB.length, 28);
  const yerelOfs = 0;
  merkez.writeUInt32LE(yerelOfs, 42);

  const merkezBas = yerel.length + adB.length + sik.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(merkez.length + adB.length, 12);
  eocd.writeUInt32LE(merkezBas, 16);

  return new Uint8Array(Buffer.concat([yerel, adB, sik, merkez, adB, eocd]));
}

function crc32(buf) {          // Node < 22 için
  let c, t = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  let crc = 0 ^ -1;
  for (const b of buf) crc = (crc >>> 8) ^ t[(crc ^ b) & 0xff];
  return (crc ^ -1) >>> 0;
}

const CONTENT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<template format-id="1.7"><content><![CDATA[T.C.
İSTANBUL 3. İCRA MÜDÜRLÜĞÜ
Dosya No: 2024/115 Esas

ÖDEME EMRİ]]></content><elements resolver="hvl-default"/></template>`;

test('UDF → düz metin (CDATA)', async () => {
  const metin = await evrakMetni(zipYap('content.xml', CONTENT_XML));
  assert.match(metin, /İSTANBUL 3\. İCRA MÜDÜRLÜĞÜ/);
  assert.match(metin, /2024\/115/);
  assert.ok(!metin.includes('<content>'), 'XML etiketi metne sızmış');
});

test('CDATA yoksa etiketler sıyrılır', async () => {
  const metin = await evrakMetni(zipYap('content.xml', '<template><content>Düz gövde</content></template>'));
  assert.equal(metin, 'Düz gövde');
});

test('content.xml içermeyen ZIP → boş, fırlatma yok', async () => {
  assert.equal(await evrakMetni(zipYap('baska.txt', 'merhaba')), '');
});

test('PDF → boş (bu turda çıkarılmıyor), fırlatma yok', async () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  assert.equal(await evrakMetni(pdf), '');
});

test('bozuk / kısa / boş bayt → boş, fırlatma yok', async () => {
  for (const kotu of [null, undefined, new Uint8Array(0), new Uint8Array([1, 2, 3]),
                      new Uint8Array([0x50, 0x4b, 0x03, 0x04, 9, 9, 9, 9])]) {
    assert.equal(await evrakMetni(kotu), '', `fırlattı veya metin döndü: ${kotu}`);
  }
});
