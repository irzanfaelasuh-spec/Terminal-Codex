# Mulai CodEX AI dari HP Android

Panduan ini menggunakan browser GitHub di HP. Tidak perlu menulis ulang source code.

## A. Pasang proyek ke GitHub

1. Unduh ZIP CodEX AI lalu ekstrak seluruh isinya di aplikasi File Manager.
2. Buat repository baru di GitHub, misalnya `codex-ai-terminal`.
3. Buka repository tersebut dan pilih **Add file → Upload files**.
4. Unggah isi folder proyek ke root repository. Pastikan `package.json`, `index.html`, `src`, `public`, dan folder `.github/workflows` ikut terunggah. Jangan hanya mengunggah file ZIP.
5. Pastikan branch utama bernama `main`.

> GitHub Pages tidak bisa menjalankan ZIP mentah. File proyek harus diekstrak dan struktur foldernya dipertahankan.

## B. Aktifkan website

1. Di repository, buka **Settings → Pages**.
2. Pada **Build and deployment → Source**, pilih **GitHub Actions**.
3. Buka tab **Actions**.
4. Jalankan workflow **Deploy CodEX AI to GitHub Pages**, atau tunggu workflow berjalan setelah push ke branch `main`.
5. Setelah status workflow berhasil, buka URL GitHub Pages yang muncul di ringkasan deployment.

Jika folder `.github` tidak terlihat ketika memilih file di Android, aktifkan opsi tampilkan file tersembunyi pada File Manager atau unggah file workflow secara terpisah melalui GitHub.

## C. Hubungkan Gemini

1. Buka [Google AI Studio API Keys](https://aistudio.google.com/app/apikey).
2. Buat API key Gemini milik sendiri.
3. Buka CodEX AI → **Settings**.
4. Tempel API key di kolom Gemini API Key.
5. Simpan pengaturan dan buka Console.
6. Di halaman **Models**, tekan **Check / Refresh available models** jika ingin mengambil daftar model yang bisa dipakai oleh key tersebut.

API key disimpan di penyimpanan browser/perangkat, bukan di repository. Jangan masukkan key ke source code atau bagikan lewat screenshot. Siapa pun yang memakai profil browser yang sama berpotensi mengakses penyimpanan lokal tersebut. Jika key terlanjur terbuka, cabut dan buat key baru di AI Studio.

## D. Login dan nama akun

- Tanpa Firebase, pilih **Create Account** untuk membuat akun Local Mode. Akun hanya tersedia di browser/perangkat tempat akun dibuat.
- Untuk username yang unik lintas perangkat, buka **Config**, masukkan Firebase Web App config, aktifkan Email/Password Authentication, buat Firestore Database, lalu terapkan aturan di `firestore.rules`.
- Langkah Firebase terperinci tersedia di `FIREBASE_SETUP.md`.
- Username terdiri dari 3–20 karakter: huruf, angka, underscore, atau tanda hubung. Password minimal 6 karakter.

## E. Buat APK Android

APK tidak disertakan sebagai file siap pasang di ZIP sumber. GitHub Actions akan membangunnya:

1. Pastikan seluruh proyek sudah ada di GitHub.
2. Buka repository → **Actions**.
3. Pilih workflow **Build CodEX AI Android APK**.
4. Tekan **Run workflow**.
5. Setelah proses selesai, buka hasil run tersebut dan unduh artifact `codex-ai-android-debug-apk`.
6. Ekstrak artifact ZIP dan pasang `app-debug.apk` di Android.

APK yang dihasilkan adalah **debug APK untuk pengujian**, bukan APK release yang sudah ditandatangani untuk Play Store. Koneksi internet tetap dibutuhkan untuk Gemini dan Firebase.

## Catatan penting

- Usage adalah meter token lokal CodEX berdasarkan token yang dilaporkan oleh respons Gemini. Itu bukan dashboard kuota atau tagihan Google.
- Jeda 15–90 menit setelah meter lokal mencapai 100% hanya berlaku di CodEX pada browser/perangkat itu. Batas resmi Gemini tetap ditentukan Google.
- CodEX adalah terminal AI berbasis browser, bukan shell Android/Linux. Perintah seperti `pkg install`, `apt`, atau `ls` tidak menjalankan perintah sistem pada perangkat.
- Hasil kode dapat disalin, disimpan ke Files CodEX, atau diunduh sebagai file.
