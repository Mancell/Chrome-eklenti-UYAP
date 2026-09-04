/**
 * Bir sayfanın neden boş olduğunu açıklayan bilgi şeridi.
 *
 * Vatandaş portalında duruşma/tebligat verisi HİÇ sunulmuyor (UYAP'ın kendi
 * "işlem türleri" listesi bunu doğruluyor: evrak, safahat, taraf, tahsilat var;
 * duruşma/tebligat yok). Boş bir tablo kullanıcıya "senkron çalışmadı" gibi
 * görünür; bu şerit gerçek sebebi söylüyor.
 */
export function Not({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: '#fdf6e3',
        border: '1px solid #e8dcc0',
        borderRadius: 8,
        padding: '12px 16px',
        margin: '0 0 18px',
        fontSize: 13,
        color: '#6b5d3f',
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}
