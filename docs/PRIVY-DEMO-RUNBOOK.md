# Runbook Rekaman Demo — Privy Beyond Authentication

## Status: SIAP DIPAKAI (tahap 7 dari `docs/PRIVY-BEYOND-AUTH-SPEC.md`)

*Dibuat: 22 September 2026*
*Deadline bounty: 14 Oktober 2026, 10:59 GMT+7*
*Keputusan: ADR-031*

---

## 0. Yang Dinilai, dan Kenapa Runbook Ini Ada

Kriteria penilaian pertama dari dua di halaman bounty adalah **"Demo must clearly show the functionality powered by Privy"**, dan deliverable-nya dirumuskan sebagai "a project with a demo". Rekaman ini bukan pelengkap submission, ia **barang yang dinilai**.

Karena itu dua momen di Bagian 4 diperlakukan sebagai inti rekaman, bukan detail.

---

## 1. Satu Hal yang Belum Pernah Terbukti

**Alur tanda tangan export belum pernah berhasil dijalankan di browser sungguhan.**

Semua lapisan lain sudah teruji: verifikasi tanda tangan, transfer, klaim sponsored, import, rekonsiliasi, dan seluruh guard. Semuanya lewat tes API dan transaksi nyata di Monad Testnet. Yang belum: modal tanda tangan Privy muncul di browser dan menghasilkan tanda tangan yang diterima server.

Percobaan pertama gagal karena alamat tujuan ternyata wallet eksternal, bukan embedded wallet Privy. Itu sudah diperbaiki (commit `51a82cc`), tapi **perbaikannya belum diverifikasi ulang dengan login Privy sungguhan.**

**Jangan mulai merekam sebelum Bagian 2 lolos.** Satu percobaan berhasil sudah cukup.

---

## 2. Pra-terbang, Jalankan Sekali Sebelum Merekam

Urutan ini sengaja: yang paling mungkin gagal didahulukan.

| # | Langkah | Lolos kalau |
|---|---|---|
| 1 | Buka `/profile`, masuk bagian "For Advanced Users" | Muncul alamat wallet |
| 2 | Cocokkan alamat itu di Privy Dashboard → Wallets | Alamatnya ada di daftar |
| 3 | Buka `/collection`, pilih satu kartu Digital | Tombol "Move to My Wallet" terlihat |
| 4 | Klik, lalu **selesaikan modal tanda tangan Privy** | Status berubah "Moving your card…" |
| 5 | Tunggu sampai selesai | Badge kartu jadi "In Your Wallet" |
| 6 | Klik "Return to Gachard" | Kartu kembali Digital |

**Langkah 2 adalah yang paling penting.** Kalau alamat di `/profile` tidak ada di daftar wallet Privy Dashboard, itu wallet eksternal, dan export akan ditolak server dengan pesan "That wallet is not one Gachard can return cards from". Perbaikannya: putuskan wallet eksternal di browser (atau pakai profil browser bersih), lalu login Privy ulang supaya embedded wallet terbentuk.

Kalau langkah 4 gagal, buka console browser. Sekarang tercetak `[privy] export failed:` dengan error asli dari Privy, bukan pesan generik.

---

## 3. Persiapan Panggung

**Akun.** Pakai akun yang sudah punya embedded wallet Privy dan minimal dua kartu Digital. Dua supaya kalau satu bermasalah di tengah rekaman, ada cadangan tanpa harus berhenti.

**Tab yang dibuka sebelum merekam**, supaya tidak ada waktu mati:

1. Aplikasi di `/collection`
2. MonadVision di halaman alamat wallet Privy user
3. Privy Dashboard, tab Fee Sponsorship
4. Admin console `/admin`

**Saldo sponsorship.** Cek di Privy Dashboard sebelum mulai. Setiap export memakai satu transaksi sponsored, setiap import satu lagi. Batas harian per user di aplikasi adalah 20 (ADR-031), jadi latihan berulang bisa menghabiskannya. Kalau kena, pesannya "Daily limit for sponsored transactions reached".

**Jangan pakai akun demo untuk rekaman final.** Akun demo tidak punya riwayat dan namanya muncul sebagai `@Demo29`, yang melemahkan kesan produk nyata.

---

## 4. Urutan Rekaman

### Bagian A, konteks (20 detik)

Tampilkan `/collection`. Tunjukkan kartu tampil normal: rarity, artwork, tombol Print dan List. **Tidak ada satu pun istilah blockchain di layar.** Ini premis ADR-002 dan layak ditunjukkan sebelum dibongkar.

Katakan: kartu ini disimpan platform atas nama user, dan sekarang user akan mengambilnya.

### Bagian B, export (40 detik)

1. Klik **"Move to My Wallet"**.
2. **Modal Privy muncul.** Beri jeda di sini. Ini UI Privy asli, bukan komponen kita, dan ini bukti pertama.
3. Tanda tangani. Tunjukkan isi yang ditandatangani: tokenId, alamat tujuan, batas waktu.
4. Status berjalan: "Moving your card…" lalu "Finishing the handover…".
5. Pindah ke MonadVision, **refresh**. Kartu kini di alamat wallet user.
6. Kembali ke aplikasi. Badge kartu terbaca **"In Your Wallet"**, dan tombol Print serta List **hilang**.

Poin 6 layak disebutkan: platform tidak lagi bisa mencetak atau menjual kartu itu, karena platform tidak memegangnya.

### Bagian C, bukti pembayaran gas (20 detik) — MOMEN KUNCI

1. Di MonadVision, tunjukkan **saldo MON wallet user: 0**.
2. Tahan beberapa detik. Jangan buru-buru.
3. Buka Privy Dashboard → Fee Sponsorship. Transaksinya tercatat di sana.

Kalimat yang dipakai: wallet ini mengirim transaksi on-chain yang sukses, dan tidak pernah memegang satu wei pun. **Privy yang membayar.**

Ini bukti satu detik yang tidak bisa dibantah, dan lebih kuat daripada penjelasan apa pun.

### Bagian D, kepemilikan yang nyata (25 detik) — MOMEN KUNCI KEDUA

1. Buka **admin console**.
2. Telusuri kartu tersebut. Tunjukkan bahwa **tidak ada tombol untuk menariknya kembali.**
3. Katakan terus terang: ini bukan kelalaian UI. Backend Gachard secara teknis tidak punya kemampuan memindahkan kartu itu. Hanya pemiliknya yang bisa.

Kontras ini yang paling meyakinkan bahwa integrasinya melampaui autentikasi. Export saja masih bisa diperdebatkan sebagai transfer custodial biasa; ketidakmampuan mengambil kembali tidak bisa.

### Bagian E, import (30 detik)

1. Kembali ke `/collection`, klik **"Return to Gachard"**.
2. Transfer ini ditandatangani dan dikirim wallet user sendiri, gas dibayar Privy.
3. Kartu kembali ke status Digital, tombol Print dan List muncul lagi.
4. Cek ulang saldo MON: masih **0**.

---

## 5. Kalau Ada yang Gagal Saat Merekam

| Gejala | Kemungkinan | Tindakan saat itu juga |
|---|---|---|
| Modal Privy error generik | Alamat di profil bukan embedded wallet | Pakai kartu cadangan; perbaiki lewat Bagian 2 |
| "Daily limit reached" | Batas 20 sponsored per hari | Pakai akun lain, atau lanjut besok |
| Kartu tersangkut "Exported" | Update database hilang | `POST /api/admin/privy-reconcile`, kartu pulih dari kondisi chain |
| Status berputar lama | Polling belum menemukan konfirmasi | Refresh halaman; status diselesaikan ulang saat dibaca |
| "Network was busy" | Nonce admin basi | Ulangi; cache sudah di-reset otomatis |

Rekonsiliasi aman dijalankan kapan saja, termasuk di tengah rekaman: ia tidak pernah mengirim transaksi, hanya menyesuaikan database dengan kondisi chain.

---

## 6. Yang TIDAK Boleh Diklaim

Kejujuran di sini memperkuat, bukan melemahkan.

- **Jangan** bilang ini menggantikan model custodial. Ini jalur opsional. Alur utama tetap custodial, dan itu memang tesis produknya (ADR-002).
- **Jangan** bilang user bisa mengekspor private key. Tidak bisa, di v1.93.0 fiturnya tidak ada (ADR-028).
- **Jangan** bilang kartunya bisa dibawa ke MetaMask. Embedded wallet terikat pada app Privy ini.
- **Jangan** menyebut smart wallet. Sponsorship berjalan di atas EIP-7702 plus ERC-4337 di balik layar, tapi alamatnya tunggal dan tidak ada smart account terpisah yang kita kelola.
- **Jangan** mengklaim AI risk scoring aktif kecuali `MIMO_API_KEY` sudah diset di produksi. Per 22 September 2026 belum, dan dokumen submission sudah menyatakannya apa adanya.

---

## 7. Setelah Merekam

1. Bersihkan akun demo yang menumpuk di produksi kalau sempat dipakai latihan.
2. Pastikan kartu yang dipakai demo kembali berstatus Digital, bukan tertinggal di wallet.
3. ~~Perbarui `MONAD-SUBMISSION.md` dan README yang masih menyebut export sebagai roadmap.~~ **Selesai 22 September 2026.** Keduanya kini menyatakan export/import sebagai fitur live, dan tetap menyebut batasan yang masih berlaku (key export tidak tersedia di v1.93.0).

Dokumen yang meremehkan fitur sendiri sama merugikannya dengan dokumen yang melebih-lebihkan. Yang tersisa hanya memastikan klaimnya tetap cocok dengan yang terlihat di rekaman.
