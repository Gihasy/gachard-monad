# Runbook Rekaman Demo — Privy Beyond Authentication

## Status: SIAP DIPAKAI (tahap 7 dari `docs/PRIVY-BEYOND-AUTH-SPEC.md`)

*Dibuat: 22 September 2026. Diperbarui setelah pindah ke SDK v3 dan halaman `/wallet`.*
*Deadline bounty: 14 Oktober 2026, 10:59 GMT+7*
*Keputusan: ADR-031. **ADR-028 perlu diamandemen**, alasan pinning-nya sudah tidak berlaku.*

---

## 0. Yang Dinilai

Kriteria penilaian pertama dari dua di halaman bounty adalah **"Demo must clearly show the functionality powered by Privy"**, dan deliverable-nya dirumuskan sebagai "a project with a demo". Rekaman ini bukan pelengkap submission, ia **barang yang dinilai**.

Empat momen di Bagian 4 yang menopang seluruh argumen. Sisanya konteks.

---

## 1. Apa yang Sudah Terbukti, dan Apa yang Belum

**Sudah terbukti di browser sungguhan dengan login Privy asli:**

- Login Privy dan pembuatan wallet di v3
- Delegasi lewat `addSigners`
- Modal tanda tangan Privy, dan tanda tangannya diterima server
- Export: kartu berpindah ke wallet user (token 256)
- Klaim sponsored dari wallet user, gas dibayar Privy

**Belum pernah dijalankan sungguhan:**

- **Send ke alamat lain** (`/wallet`)
- **Reveal private key** (`/wallet`)
- **Withdraw access**, yaitu pencabutan delegasi

Ketiganya dipakai di rekaman. **Coba satu kali sebelum merekam.** Untuk Send, pakai alamat yang Anda kendalikan sendiri, karena kartunya benar-benar pergi dan tidak bisa ditarik kembali.

---

## 2. Pra-terbang

Urutan ini sengaja: yang paling mungkin gagal didahulukan.

| # | Langkah | Lolos kalau |
|---|---|---|
| 1 | Buka `/wallet` | Alamat wallet muncul, bukan tombol "Set up" |
| 2 | Cocokkan alamat itu di Privy Dashboard → Wallets | Alamatnya ada di daftar |
| 3 | Lihat kartu "Gachard access" | Berlabel **Allowed** |
| 4 | `/collection` → satu kartu Digital → **Move to My Wallet** | Modal Privy muncul, tanda tangan diterima |
| 5 | Kembali ke `/wallet` | Kartunya muncul di "Cards in this wallet" |
| 6 | **Return to Gachard** | Kartu kembali Digital di `/collection` |
| 7 | Ulangi export, lalu **Send** ke alamat milik Anda sendiri | Kartu berpindah, status jadi Released |
| 8 | **Reveal private key** | Modal Privy menampilkan kunci |

Langkah 7 dan 8 hanya untuk memastikan tidak ada kejutan. Kartu yang dipakai di langkah 7 hilang dari Gachard selamanya, jadi jangan pakai kartu yang Anda sayangi.

Kalau ada yang gagal, console mencetak `[privy] ...` dengan error aslinya.

---

## 3. Persiapan Panggung

**Akun.** Punya embedded wallet Privy, akses sudah **Allowed**, dan minimal tiga kartu Digital: satu untuk export/import, satu untuk Send, satu cadangan.

**Tab yang dibuka sebelum merekam:**

1. `/collection`
2. `/wallet`
3. MonadVision di halaman alamat wallet Privy
4. Privy Dashboard, tab Fee Sponsorship
5. Privy Dashboard, tab Wallets

**Saldo sponsorship.** Tiap export, import, dan send memakai satu transaksi sponsored. Batas harian per user 20 (ADR-031), jadi latihan berulang bisa menghabiskannya.

**Jangan pakai akun demo untuk rekaman final.** Namanya muncul sebagai `@Demo37` dan melemahkan kesan produk nyata.

---

## 4. Urutan Rekaman

### Bagian A, konteks (20 detik)

`/collection`. Kartu tampil normal: rarity, artwork, Print, List. **Tidak ada satu pun istilah blockchain.** Ini premis ADR-002, dan layak ditunjukkan sebelum dibongkar.

Katakan: kartu ini dipegang platform atas nama user, dan sekarang user akan mengambil alih.

### Bagian B, export (40 detik) — MOMEN 1

1. **Move to My Wallet**.
2. **Modal Privy muncul.** Beri jeda. Ini UI Privy asli, bukan komponen kita.
3. Tanda tangani. Tunjukkan isinya: tokenId, alamat tujuan, batas waktu.
4. MonadVision, refresh. Kartu ada di alamat wallet user.
5. Kembali ke `/collection`: badge **"In Your Wallet"**, tombol Print dan List **hilang**.

Poin 5 layak disebut: platform tidak lagi bisa mencetak atau menjualnya, karena tidak memegangnya.

### Bagian C, siapa yang membayar (20 detik) — MOMEN 2

1. Di MonadVision, tunjukkan **saldo MON wallet user: 0**.
2. Tahan beberapa detik.
3. Privy Dashboard → Fee Sponsorship. Transaksinya tercatat.

Kalimatnya: wallet ini mengirim transaksi on-chain yang sukses dan tidak pernah memegang satu wei pun. **Privy yang membayar.**

Bukti satu detik, lebih kuat daripada penjelasan apa pun.

### Bagian D, kendali ada di user (35 detik) — MOMEN 3

**Bagian ini diganti total.** Versi lama menyuruh menunjukkan bahwa admin console tidak punya tombol untuk menarik kartu, dengan klaim "Gachard secara teknis tidak bisa memindahkannya". **Itu tidak lagi benar** sejak delegasi ada, dan delegasi justru yang membuat import bekerja.

Yang sekarang ditunjukkan, dan lebih kuat karena aktif, bukan pasif:

1. Buka `/wallet`. Tunjuk kartu **"Gachard access"** berlabel **Allowed**.
2. Katakan apa adanya: Gachard bisa memindahkan kartu di wallet ini **karena user memberi izin**, dan izin itu yang membuat kartu bisa pulang.
3. Klik **Withdraw access**. Labelnya berubah jadi **Not allowed**.
4. Katakan: sekarang Gachard tidak bisa menyentuhnya. Satu klik, oleh user, kapan saja.
5. Klik **Allow** lagi supaya Bagian E bisa jalan.

Mencabut akses di depan kamera membuktikan kendali itu nyata. "Tidak ada tombolnya" hanya membuktikan UI-nya belum dibuat.

### Bagian E, import (25 detik)

1. Di `/wallet`, **Return to Gachard**.
2. Transfer ini dikirim dari wallet user, gas dibayar Privy.
3. Kartu kembali Digital di `/collection`, Print dan List muncul lagi.
4. Saldo MON: masih **0**.

### Bagian F, keluar sepenuhnya (20 detik) — MOMEN 4

Ini yang menutup pertanyaan "benarkah ini milik user".

1. Di `/wallet`, tunjukkan kolom **Send** dengan peringatannya: sekali dikirim, Gachard tidak bisa membawanya kembali.
2. Tunjukkan **Reveal private key**. Buka modalnya. **Jangan tampilkan kuncinya di rekaman** — cukup perlihatkan bahwa fiturnya ada, lalu tutup.
3. Katakan: user bisa membawa wallet ini ke aplikasi lain dan meninggalkan Gachard sepenuhnya.

Kalau Anda merekam Send sungguhan, pakai alamat Anda sendiri dan sebutkan bahwa kartunya memang tidak kembali.

---

## 5. Kalau Ada yang Gagal Saat Merekam

| Gejala | Kemungkinan | Tindakan |
|---|---|---|
| `/wallet` menampilkan "Set up" | Sesi Privy hilang | Login ulang lewat tombol itu |
| "Allow Gachard to return cards…" | Delegasi belum aktif | Bagian D langkah 5, klik Allow |
| "Not configured on this deployment" | `NEXT_PUBLIC_PRIVY_SIGNER_ID` kosong | Tidak bisa diperbaiki saat rekaman, hentikan |
| "Daily limit reached" | 20 sponsored per hari | Akun lain, atau lanjut besok |
| Kartu tersangkut "In Your Wallet" | Update database hilang | `POST /api/admin/privy-reconcile` |
| Status berputar lama | Polling belum melihat konfirmasi | Refresh; status diselesaikan saat dibaca |
| "Network was busy" | Nonce admin basi | Ulangi, cache sudah di-reset |

Rekonsiliasi aman dijalankan kapan saja, termasuk di tengah rekaman: ia tidak pernah mengirim transaksi, hanya menyesuaikan database dengan kondisi chain.

---

## 6. Yang TIDAK Boleh Diklaim

Kejujuran di sini memperkuat, bukan melemahkan.

- **Jangan** bilang Gachard tidak bisa memindahkan kartu di wallet user. **Bisa**, karena user memberi izin. Yang benar: izinnya eksplisit, terlihat di UI, dan bisa dicabut sewaktu-waktu.
- **Jangan** bilang ini menggantikan model custodial. Ini jalur opsional; alur utama tetap custodial, dan itu memang tesis produknya (ADR-002).
- **Jangan** menyebut smart wallet. Sponsorship berjalan di atas EIP-7702 plus ERC-4337 di balik layar, tapi alamatnya tunggal dan tidak ada smart account terpisah yang kita kelola.
- **Jangan** menampilkan private key di rekaman. Tunjukkan fiturnya, bukan isinya.
- **Jangan** mengklaim AI risk scoring aktif kecuali `MIMO_API_KEY` sudah diset di produksi. Per 22 September 2026 belum, dan dokumen submission sudah menyatakannya apa adanya.

**Yang sekarang boleh diklaim dan sebelumnya tidak:** export private key **tersedia**. ADR-028 mencatatnya mustahil di v1.93.0; v3 membukanya.

---

## 7. Setelah Merekam

1. Bersihkan akun demo yang menumpuk di produksi kalau sempat dipakai latihan.
2. Pastikan kartu demo kembali berstatus Digital, kecuali yang sengaja di-Send.
3. Pastikan **Gachard access** kembali **Allowed** kalau Bagian D dicabut dan tidak dipulihkan.
4. ~~Perbarui `MONAD-SUBMISSION.md` dan README yang menyebut export sebagai roadmap.~~ **Selesai 22 September 2026.**
5. **Amandemen ADR-028.** Alasan pinning ke v1.93.0 sudah terbukti tidak berlaku: v3.44.0 build dan jalan di Turbopack, dan membuka `useSigners` serta `useExportWallet`. ADR itu sekarang mendeskripsikan kendala yang sudah tidak ada.
6. Perbarui `MONAD-SUBMISSION.md` sekali lagi: export private key kini tersedia, dan ada halaman `/wallet` tersendiri.

Poin 5 yang paling penting. ADR yang menyatakan sesuatu mustahil, padahal kode di repo membuktikan sebaliknya, lebih menyesatkan daripada tidak ada ADR sama sekali.
