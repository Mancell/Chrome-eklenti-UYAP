import { createClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Adres/anahtar depoda tutulmuyor (bkz. .env.example). Eksikse SESSİZCE
// çalışmıyor gibi görünmesin — açık hata ver.
if (!URL || !ANON) {
  throw new Error(
    'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY tanımsız. web/.env.local dosyasını .env.example’a göre doldurun.',
  );
}

export const supabase = createClient(URL, ANON);

/** Panelden yeni eklenti token'ı üretir. Ham token BİR KEZ döner. */
export async function tokenUret(ad: string): Promise<string> {
  const { data, error } = await supabase.rpc('eklenti_token_uret', { ad });
  if (error) throw new Error(error.hint || error.message);
  return data as string;
}
