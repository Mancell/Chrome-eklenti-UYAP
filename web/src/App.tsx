import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { useTablo, gecenSure } from './lib/veri';
import Kurulum from './pages/Kurulum';
import Dosyalarim from './pages/Dosyalarim';
import Durusmalar from './pages/Durusmalar';
import Takvim from './pages/Takvim';
import Tebligatlar from './pages/Tebligatlar';
import Evraklar from './pages/Evraklar';

const SAYFALAR = {
  dosyalar: { ad: 'Dosyalarım', bilesen: Dosyalarim },
  durusmalar: { ad: 'Duruşmalar', bilesen: Durusmalar },
  takvim: { ad: 'Takvim', bilesen: Takvim },
  tebligatlar: { ad: 'Tebligatlar', bilesen: Tebligatlar },
  evraklar: { ad: 'Evraklar', bilesen: Evraklar },
  kurulum: { ad: 'Kurulum', bilesen: Kurulum },
} as const;
type Sayfa = keyof typeof SAYFALAR;

function Giris() {
  const [eposta, setEposta] = useState('');
  const [sifre, setSifre] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);

  async function gonder(kayit: boolean) {
    setMesgul(true); setHata(null);
    const { error } = kayit
      ? await supabase.auth.signUp({ email: eposta, password: sifre })
      : await supabase.auth.signInWithPassword({ email: eposta, password: sifre });
    if (error) setHata(cevir(error.message));
    setMesgul(false);
  }

  return (
    <div className="giris">
      <h1 style={{ fontSize: 16, margin: 0 }}>Av. Asistan — UYAP Paneli</h1>
      <input value={eposta} onChange={(e) => setEposta(e.target.value)}
             type="email" placeholder="E-posta" autoComplete="username" />
      <input value={sifre} onChange={(e) => setSifre(e.target.value)}
             type="password" placeholder="Şifre" autoComplete="current-password" />
      <button className="eylem" disabled={mesgul} onClick={() => gonder(false)}>Giriş yap</button>
      <button className="eylem ikincil" disabled={mesgul} onClick={() => gonder(true)}>Kayıt ol</button>
      {hata && <p className="uyari">{hata}</p>}
      <p className="alt" style={{ marginTop: 12, fontSize: 12 }}>
        Bu şifre <b>panelin</b> şifresidir — UYAP şifreniz değil. UYAP şifreniz
        hiçbir zaman burada veya eklentide tutulmaz.
      </p>
    </div>
  );
}

/** Supabase hata metinleri İngilizce; sık görülenleri Türkçeleştir. */
function cevir(m: string): string {
  const l = m.toLowerCase();
  if (l.includes('invalid login')) return 'E-posta veya şifre hatalı.';
  if (l.includes('already registered')) return 'Bu e-posta zaten kayıtlı — giriş yapın.';
  if (l.includes('password')) return 'Şifre en az 6 karakter olmalı.';
  if (l.includes('email')) return 'Geçerli bir e-posta girin.';
  return m;
}

/**
 * Üst senkron şeridi — kullanıcının "çalıştı mı, sürüyor mu, ne geldi"
 * sorularının cevabı. senkron_gunlugu realtime olduğu için canlı güncelleniyor.
 */
function SenkronSerit() {
  const { satirlar } = useTablo('senkron_gunlugu', { alan: 'guncellendi' });
  const son = satirlar[0];
  if (!son) {
    return (
      <div style={seritStil('#eef2f7', '#42566b')}>
        Henüz senkron yok. UYAP'a girip <b>Dosyalarım</b> sayfasını açın — veriler
        otomatik gelir.
      </div>
    );
  }
  if (son.durum === 'basladi') {
    return <div style={seritStil('#fff7e6', '#8a6100')}>⏳ Senkron sürüyor… {son.mesaj ?? ''}</div>;
  }
  if (son.durum === 'hata') {
    return <div style={seritStil('#fdecea', '#ae1800')}>⚠ Senkron hatası: {son.mesaj ?? ''}</div>;
  }
  return (
    <div style={seritStil('#eaf6ec', '#1a6b34')}>
      ✓ Son senkron {gecenSure(son.guncellendi)} · {son.mesaj ?? `${son.dosya_sayisi ?? 0} dosya`}
    </div>
  );
}

function seritStil(bg: string, renk: string): React.CSSProperties {
  return {
    background: bg, color: renk, padding: '8px 16px', fontSize: 13,
    borderBottom: '1px solid rgba(0,0,0,0.06)',
  };
}

export default function App() {
  const [oturum, setOturum] = useState<Session | null>(null);
  const [hazir, setHazir] = useState(false);
  const [sayfa, setSayfa] = useState<Sayfa>('dosyalar');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setOturum(data.session); setHazir(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setOturum(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!hazir) return null;
  if (!oturum) return <Giris />;

  const Bilesen = SAYFALAR[sayfa].bilesen;

  return (
    <div className="kabuk">
      <nav className="yan">
        <h1>Av. Asistan</h1>
        {(Object.keys(SAYFALAR) as Sayfa[]).map((k) => (
          <button key={k} className={sayfa === k ? 'etkin' : ''} onClick={() => setSayfa(k)}>
            {SAYFALAR[k].ad}
          </button>
        ))}
        <button style={{ marginTop: 20 }} onClick={() => supabase.auth.signOut()}>Çıkış</button>
      </nav>
      <main className="icerik">
        <SenkronSerit />
        <Bilesen />
      </main>
    </div>
  );
}
