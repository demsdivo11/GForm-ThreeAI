# GForm-ThreeAI
Ekstensi Chrome/Chromium yang membantu menyalin struktur pertanyaan Google Form dan meminta saran jawaban berbasis AI (Google AI Studio & OpenAI). Cocok saat ingin mempelajari kembali soal atau mendapatkan inspirasi jawaban secepat mungkin.

## Fitur
- Scrape daftar pertanyaan & opsi dari Google Form aktif hanya dengan satu klik.
- Memilih model AI (Google `text-bison-001`, `gemini-1.0`, OpenAI `gpt-4o-mini`, `gpt-3.5-turbo`).  
- Menyimpan API key per penyedia secara aman di `chrome.storage.local`.
- Copy hasil ke clipboard dan analisis ulang kapan saja.

## Persyaratan
- Chrome / Edge / Brave berbasis Chromium versi 115+.  
- API key aktif untuk Google AI Studio dan/atau OpenAI (opsional, bisa pakai preset placeholder tapi tetap disarankan pakai key pribadi).  
- Akun Google Forms yang bisa diakses di browser tersebut.

## Cara Instalasi
1. **Unduh kode sumber**  
   ```sh
   git clone https://github.com/username/GForm-ThreeAI.git
   cd GForm-ThreeAI
   ```
   Atau download ZIP dari GitHub lalu ekstrak.
2. **Buka halaman ekstensi**  
   Masukkan `chrome://extensions` (atau `edge://extensions`) pada address bar dan aktifkan **Developer mode** (pojok kanan atas).
3. **Load unpacked**  
   Klik tombol `Load unpacked` lalu pilih folder `GForm-ThreeAI` hasil clone/ekstrak.
4. **Pin ekstensi** (opsional)  
   Klik ikon puzzle lalu pin "GForm Solver With ThreeAI" supaya gampang diakses.

## Cara Pakai
1. Buka halaman Google Form yang ingin dianalisis (pastikan sudah termuat penuh).
2. Klik ikon ekstensi "GForm Solver". Popup akan muncul.
3. Pilih model AI (opsional) dan pastikan API key terisi benar. Centang **Simpan key** kalau mau disimpan di perangkat ini.
4. Tekan **Scrape** untuk mengambil pertanyaan. Hasil JSON akan tampil di panel hasil.
5. Tekan **AI Solve** untuk mengirim pertanyaan ke model AI. Status proses terlihat di bagian bawah.
6. Gunakan tombol **Copy** untuk menyalin rekomendasi jawaban dan tempel di catatan Anda.
7. **Clear** menghapus hasil dan status sebelumnya.

## Konfigurasi API Key
- Field API key otomatis terisi placeholder. Ganti dengan key pribadi Anda agar tidak rate-limited.
- Pengaturan disimpan lokal per provider (`aistudio` atau `openai`) saat opsi **Simpan key** dicentang.
- Untuk Google AI Studio: buat key melalui [https://makersuite.google.com/app/apikey](https://makersuite.google.com/app/apikey).  
- Untuk OpenAI: buat key di [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys) kemudian pilih model `gpt-4o-mini`/`gpt-3.5-turbo` di dropdown.
- Bila kuota OpenAI habis, aplikasi otomatis coba fallback ke Google model default jika key tersedia.

## Pengembangan & Kontribusi
1. Edit file HTML/CSS/JS sesuai kebutuhan (lihat `popup.*`, `content.js`, `background.js`).  
2. Setelah perubahan, reload ekstensi dari halaman `chrome://extensions` lalu tekan tombol **Reload**.  
3. Pastikan tidak ada error di `chrome://extensions` bagian `Errors` atau di DevTools (`Ctrl+Shift+I` pada popup).  
4. Ajukan pull request atau laporkan bug jika menemukan masalah.

## Troubleshooting
- **Popup bilang tidak menemukan Google Form** - pastikan tab aktif benar-benar berisi form (`docs.google.com/forms/...`) dan bukan editor.
- **API error 401/403** - periksa apakah API key valid dan punya akses ke model yang dipilih.
- **Quota exceeded / 429** - ganti provider, gunakan key lain, atau tunggu pemulihan kuota. Aplikasi akan mencoba fallback otomatis ke Google `text-bison-001` bila OpenAI gagal.
- **Ekstensi tidak muncul** - cek apakah Developer mode tetap aktif, folder belum dipindah, dan tidak ada error di halaman ekstensi.

## Terima Kasih
- `demsdivo11` dan semua kontributor yang membantu menghidupkan kembali proyek ini.
