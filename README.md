# Guacamole Load Tester (Playwright)

Script ini dirancang untuk melakukan *load testing* (uji beban) pada Apache Guacamole yang diakses secara publik (termasuk yang berada di balik Cloudflare Tunnel). Script ini menggunakan **Playwright** untuk mensimulasikan pengguna nyata (Virtual Users / VUs) secara headless.

## Fitur
1. **Isolated Session:** Setiap virtual user berjalan pada *context* terpisah (mirip Incognito Mode), sehingga session cookies/storage tidak saling bercampur.
2. **Ramp-Up Delay:** Mencegah lonjakan trafik login seketika (*login stampede*) yang dapat dideteksi Cloudflare sebagai DDoS.
3. **Simulasi Aktivitas:** Melakukan gerakan mouse acak dan input tombol 'Shift' berkala untuk menjaga koneksi tetap aktif dan memicu render grafis pada `guacd`.
4. **Auto Screenshot:** Jika terjadi error/kegagalan pada user tertentu, halaman web akan disimpan sebagai file gambar `vu-X-error.png` untuk memudahkan debugging.

---

## Cara Instalasi & Persiapan

### 1. Set Workspace (Rekomendasi)
Clone repo ini ke komputer atau laptop kalian:
```
git clone https://github.com/eprilian/guacamole-load-test
```

### 2. Install Dependensi
Buka terminal/PowerShell di direktori tersebut, lalu jalankan perintah berikut:

```powershell
# Install Node.js dependencies
npm install

# Install browser engine (hanya Chromium untuk efisiensi resource)
npx playwright install chromium
```

---

## Cara Menjalankan Load Test

### 1. Konfigurasi Parameter Uji
1. Salin file template **[config.example.json](file:///C:/Users/noname/.gemini/antigravity/scratch/guacamole-load-test/config.example.json)** menjadi `config.json`.
2. Buka file **`config.json`** dan sesuaikan parameternya:
```json
{
  "url": "https://guacamole.example.com/", // URL Guacamole Anda
  "username": "admin",                     // Username akun test
  "password": "password123",               // Password akun test
  "connectionName": "",                    // Nama koneksi spesifik (kosong = pilih koneksi pertama)
  "concurrentUsers": 5,                    // Jumlah user simulasi
  "rampUpDelay": 2,                        // Jeda masuk antar user (detik)
  "sessionDuration": 60,                   // Durasi tes per user (detik)
  "headless": true,                        // Jalankan di background (true/false)
  "loginOnly": false,                      // Hanya tes login (tanpa memicu RDP/SSH di server)
  "debug": false                           // Aktifkan debug logs (true/false)
}
```

### 2. Mulai Pengujian
Jalankan perintah ini di Terminal / PowerShell / CMD:
```bash
npm start
```
Atau:
```bash
node load-test.js
```


---

## Analisis & Troubleshooting

1. **Error Cloudflare Block / Captcha:**
   Jika Anda melihat error screenshot (`vu-X-error.png`) menampilkan halaman Cloudflare Challenge/Captcha, artinya Cloudflare WAF mendeteksi browser otomatis Anda. Anda perlu membuat **WAF Bypass Rule** di Cloudflare Dashboard untuk alamat IP asal mesin penguji Anda selama durasi pengujian.
   
2. **Kapasitas Server:**
   Selama pengujian berjalan, login ke server host Guacamole Anda dan pantau performa server dengan perintah seperti `htop` atau `top`. Perhatikan penggunaan CPU oleh proses `guacd` dan `java` (Tomcat).
