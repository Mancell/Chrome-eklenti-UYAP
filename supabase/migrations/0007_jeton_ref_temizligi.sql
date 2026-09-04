-- ============================================================================
-- Jeton biçimli uyap_ref öksüzlerini sil (kalıcı tekilleştirme)
--
-- 0003/0005'teki "en eskiyi tut" temizliği, en eskiler JETON biçimli (66 kar.)
-- satırlar olduğu için yanlış tarafı tutuyordu; her senkron 8 karakterlik
-- içerik-ref yazınca çift geri geliyordu. Artık tüm ref'ler ref() → 8 hex.
-- Jeton biçimli olan her satır öksüzdür.
-- ============================================================================
delete from public.dosyalar where length(uyap_ref) > 16;
