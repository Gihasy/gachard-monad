# Technical Spec — Card Export & Import via Privy

## Status: SPEC SIAP DIBANGUN, semua prasyarat teknis lolos (belum ada kode)

*Dibuat: 21 September 2026*
*Keputusan: ADR-031. Evaluasi dan bukti: `docs/PRIVY-BEYOND-AUTH-EVALUATION.md`*
*Menggantikan scope: `docs/PRIVY-INTEGRATION-SPEC.md` (view-only, sudah live)*
*Deadline bounty: 14 Oktober 2026, 10:59 GMT+7*

---

## 0. Prasyarat yang Sudah Terpenuhi

Jangan mulai kalau salah satu dari ini belum benar. Semuanya sudah diverifikasi 21 September 2026.

| Prasyarat | Status |
|---|---|
| Fee Sponsorship aktif, Monad Testnet dipilih | Sudah |
| "Allow transactions from the client" **OFF** | Wajib, lihat 5.2 |
| `PRIVY_APP_SECRET` di `.env.local` | Sudah, lokal |
| `@privy-io/node` terpasang, build hijau | Sudah, branch `experiment/privy-server-auth` |
| `@privy-io/react-auth` tetap `1.93.0` | Jangan diubah |

---

## 1. Scope

### Yang dibangun

1. Export kartu Digital dari custodial wallet ke Privy wallet milik user.
2. Transaksi klaim yang ditandatangani wallet user dan **gasnya dibayar Privy**.
3. Import kartu kembali, ditandatangani dan dikirim wallet user sendiri.
4. Status `Exported` di `/collection` beserta penjagaan di fitur yang terdampak.
5. Rate limiting untuk melindungi saldo sponsorship.

### Yang TIDAK dibangun

- Export private key. Tidak tersedia di v1.93.0 (ADR-028), dan tidak berubah.
- Upgrade SDK client. Tidak diperlukan, lihat ADR-031.
- Perubahan smart contract. Tidak diperlukan.
- Export kartu `Vaulted`, `Real`, `Burned`, atau yang sedang `isListed`. Hanya `Digital` murni.
- Dukungan wallet eksternal selain Privy (MetaMask dan sejenisnya).

---

## 2. Alur Export

### 2.1 Langkah

```
User di /collection
  |
  v
[1] Pilih kartu -> "Export to my wallet"
  |
  v
[2] CLIENT: useSignTypedData (v1.93.0) -> modal Privy muncul
      Menandatangani intent: tokenId, to, userId, nonce, deadline
  |
  v
[3] POST /api/privy/export/prepare  { cardId, signature, nonce }
      Server: verifyTypedData -> cocokkan dengan users.privyWalletAddress
               cek nonce belum dipakai, cek status kartu
  |
  v
[4] SERVER: marketplaceTransfer(tokenId, custodialWallet, privyWallet)
      Ditandatangani admin wallet. Wajar: hanya pemegang kartu yang bisa memindahkan.
  |
  v
[5] SERVER: transaksi klaim DARI wallet Privy user, gas dibayar Privy
      @privy-io/node -> wallets().rpc(walletId, { sponsor: true })
      Mengembalikan transaction_id, BUKAN hash. Harus di-poll.
  |
  v
[6] cards.status = "Exported", simpan exportClaimTxId + exportClaimBlock
```

### 2.2 Kenapa tanda tangan diletakkan di langkah 2, bukan sesudah transfer

Dua alasan, dan yang pertama bukan soal bounty.

**Keamanan.** Tanda tangan membuktikan user benar-benar mengontrol alamat tujuan **sebelum** kartu dikirim ke sana. Transfer ERC-1155 tidak bisa dibatalkan. Kalau alamat tujuan salah atau tidak dikuasai user, kartunya hilang permanen.

**Demo.** Modal Privy muncul di momen yang bisa ditunjuk. Kriteria penilaian pertama bounty adalah soal demo, bukan kode.

### 2.3 Payload EIP-712

```ts
const domain = {
  name: "Gachard",
  version: "1",
  chainId: 10143,
  verifyingContract: CONTRACT_ADDRESS,
};

const types = {
  ExportIntent: [
    { name: "tokenId", type: "uint256" },
    { name: "to", type: "address" },
    { name: "userId", type: "string" },
    { name: "nonce", type: "string" },
    { name: "deadline", type: "uint256" },
  ],
};
```

Verifikasi server memakai `ethers.verifyTypedData(domain, types, value, signature)`. Pakai `useSignTypedData`, bukan `useSignMessage`: isinya terbaca manusia di modal, dan `verifyingContract` mengikat tanda tangan ke chain dan kontrak yang benar.

`deadline` 10 menit. `nonce` disimpan di koleksi `privy_nonces` dengan unique index, sekali pakai.

### 2.4 Soal transaksi klaim di langkah 5

**Langkah ini tidak diperlukan secara teknis.** Kartu sudah jadi milik user setelah langkah 4.

Supaya tidak sekadar hiasan, klaim dijadikan **prasyarat import**: backend hanya menerima kembali kartu yang `exportClaimTxId`-nya sudah `confirmed`. Dengan begitu ia punya fungsi produk, bukan hanya fungsi demo.

**Isi transaksinya: self-transfer bernilai nol** dari wallet user ke alamatnya sendiri, persis seperti yang sudah terbukti jalan di gerbang 2.

Kandidat yang lebih bermakna, `recordVerification(tokenId, 0, false)`, **sudah diperiksa dan tidak bisa dipakai**: fungsi itu `onlyOwner` di `GachardCard.sol:176`, jadi panggilan dari wallet user akan revert. Ini diverifikasi 21 September 2026, bukan diasumsikan.

**Jangan mengubah kontrak agar `recordVerification` bisa dipanggil user.** Itu akan membatalkan seluruh argumen "nol perubahan smart contract" di ADR-031, dan menukar risiko nol dengan risiko redeploy hanya demi transaksi yang secara teknis memang tidak diperlukan.

Konsekuensi yang harus diterima: self-transfer bernilai nol tidak menulis state aplikasi apa pun. Buktinya adalah transaksinya sendiri, yaitu hash yang ditandatangani wallet user dan dibayar Privy, tercatat permanen di chain. Untuk tujuan klaim dan demo, itu cukup.

---

## 3. Alur Import

```
User di /collection (tab Exported)
  |
  v
[1] "Return to Gachard"
  |
  v
[2] SERVER: wallets().rpc(walletId, {
      method: "eth_sendTransaction", caip2: "eip155:10143", sponsor: true,
      params: { transaction: { to: CONTRACT, data: safeTransferFrom(...) } } })
  |
  v
[3] Poll transactions().get(transaction_id) sampai confirmed
  |
  v
[4] Verifikasi balanceOf(custodialWallet, tokenId) == 1
  |
  v
[5] cards.status = "Digital", kartu kembali aktif
```

**Kenapa backend tidak bisa melakukan ini sendiri:** kartu dipegang wallet user. Hanya pemiliknya yang bisa memindahkan. Ini bukan keterbatasan, ini buktinya. Demo sebaiknya menunjukkan bahwa admin console **tidak punya** tombol untuk menarik kartu kembali.

**Verifikasi pakai `balanceOf`, bukan pemindaian event.** Draf pertama spec ini meminta pemindaian `TransferSingle` yang di-anchor ke block klaim. Itu warisan dari desain lama, ketika backend harus mendeteksi transfer yang tidak ia mulai sendiri. Sekarang kita yang mengirim transfernya dan memegang hash-nya, jadi satu pembacaan `balanceOf(custodialWallet, tokenId)` lebih murah daripada paginasi log dan lebih kuat sebagai bukti daripada event yang cocok: kartu baru benar-benar kembali kalau custodial wallet memang memegangnya.

`exportClaimBlock` tetap disimpan sebagai provenance klaim, tapi tidak lagi menopang apa pun. Kalau transaksi import terkonfirmasi sementara `balanceOf` masih nol, status ditandai `unverified` dan tidak dinaikkan jadi Digital, karena yang menentukan adalah kondisi chain, bukan tanda terima transaksi.

---

## 4. Perubahan Data dan Kode

### 4.1 Skema

`cards`, field baru:

| Field | Tipe | Keterangan |
|---|---|---|
| `status` | string | Nilai baru: `"Exported"` |
| `privyWalletAddress` | string | Alamat tujuan saat export |
| `exportedAt` | ISO string | |
| `exportClaimTxId` | string | `transaction_id` dari Privy |
| `exportClaimTxHash` | string \| null | Terisi setelah polling |
| `exportClaimBlock` | number \| null | Titik jangkar untuk import |
| `importedAt` | ISO string \| null | |

Koleksi baru `privy_nonces`: `{ nonce, userId, cardId, usedAt }`, unique index pada `nonce`.

### 4.2 Titik sentuh, terhitung

Reuse field `status` membuat sebagian besar penjagaan berlaku otomatis.

| File | Perubahan | Alasan |
|---|---|---|
| `app/api/dismantle/route.ts:46` | **tidak ada** | Sudah `status !== "Digital"` |
| `app/api/marketplace/listings/route.ts:36` | **tidak ada** | Sudah `status !== "Digital"` |
| `app/api/print/route.ts:41` | **tambah guard** | Hanya cek `"Burned"` |
| `app/api/redeem/route.ts:36` | tambah guard | Hanya cek `"Burned"`. Sudah terblokir oleh syarat `fulfillmentStatus === "Real"`, tapi pesannya menyesatkan |
| `app/api/cards/route.ts:10` | tambah cabang | `getDisplayStatus` perlu `"Exported"` |
| `lib/status-map.ts` | tambah entri | `CARD_STATUS_MAP` dan `TX_TYPE_MAP` |
| `app/api/scan/route.ts` | **perbaiki bug** | Kartu Exported ter-flag `warning` seolah palsu. Lihat catatan di bawah |
| `app/collection/page.tsx` | **tidak ada** | Tombol dan badge sepenuhnya di `CardItem` |
| `components/CardItem.tsx` | UI | Tombol Move/Return, modal, status |

**Temuan tahap 5, `scan` bukan sekadar "cek" melainkan bug:** kartu Exported menghasilkan `statusCode = 0` (Digital), sementara `card.status` adalah `"Exported"`, sehingga `statusMatch` gagal dan QR memberi flag **`warning`**. Artinya kartu yang sah akan terbaca seperti palsu saat dipindai. Sudah diperbaiki: `Exported` diperlakukan sebagai state yang sah dan statusnya ditampilkan sebagai "In Your Wallet".

**Keputusan PrivyProvider:** dipasang sebagai island di dalam modal transfer, bukan global di `layout.tsx`. Alasannya sama dengan ADR-028: SDK Privy tidak boleh ikut termuat di `/collect` dan halaman lain, dan crash Privy tidak boleh jadi crash global (pernah terjadi, commit `523e55f`). Diverifikasi setelah build: chunk Privy 1,8 MB tidak direferensikan oleh HTML `/collection`, jadi hanya diunduh saat modal dibuka.

**Celah yang ditemukan saat tahap 2:** SDK client v1.93.0 mengekspos `Wallet.address` tetapi **tidak** `Wallet.id`, padahal pengiriman sponsored dari server memerlukan wallet id. Jadi id harus diresolusi server-side lewat `wallets().list({ address })`, lalu disimpan sebagai `users.privyWalletId` agar tidak perlu diresolusi berulang. Integrasi yang sudah live juga menyimpan `privyUserId` sebagai string literal `"connected"`, bukan id Privy sungguhan, jadi field itu tidak bisa dipakai untuk apa pun.

File baru:

```
lib/privy-server.ts                      klien + polling + rate limit
lib/export-intent.ts                     domain, tipe, dan verifikasi EIP-712
app/api/privy/export/prepare/route.ts    verifikasi tanda tangan, transfer keluar
app/api/privy/export/claim/route.ts      transaksi klaim sponsored
app/api/privy/import/route.ts            transfer balik sponsored
app/api/privy/status/[cardId]/route.ts   polling untuk client
components/profile/ExportCardModal.tsx
```

### 4.3 Pola polling wajib

Ini bukan saran gaya. Mengabaikannya menghasilkan bug yang persis sama dengan `tokenId: null` di `4658e4e`.

```ts
const res = await wallets.rpc(walletId, { ... sponsor: true });
// res.data.hash === ""  <-- KOSONG. Jangan disimpan.
const txId = res.data.transaction_id;   // ini sumber kebenarannya

// poll terpisah, jangan di request yang sama
const t = await client.transactions().get(txId);
if (t.status === "confirmed") { /* baru pakai t.transaction_hash */ }
```

Semua route Privy `maxDuration = 10` (Hobby plan, ADR-018). Polling dilakukan client, sama seperti pola fulfill.

---

## 5. Keamanan

### 5.1 Yang dicegah

| Serangan | Pencegahan |
|---|---|
| Export kartu milik orang lain | `getAuthenticatedUser` + cek `card.userId` |
| Export ke alamat yang tidak dikuasai user | Tanda tangan EIP-712 diverifikasi terhadap `users.privyWalletAddress` |
| Replay tanda tangan | Nonce sekali pakai + `deadline` |
| Menguras saldo sponsorship | Rate limit + `sponsor` hanya di server |
| Export kartu Vaulted/terkunci | Guard status, dan `_update()` memblokir Vaulted di level kontrak |

### 5.2 Sakelar dashboard

**"Allow transactions from the client" harus tetap OFF.**

`NEXT_PUBLIC_PRIVY_APP_ID` ter-inline ke bundle browser. Kalau sakelar itu menyala, penjaga saldo sponsorship Anda adalah nilai yang tercetak di source halaman. Verifikasi posisinya sebelum deploy, dan sekali lagi sesudahnya.

### 5.3 Rate limit

Pakai `checkRateLimit()` yang sudah ada (ADR-019). Setiap import adalah satu transaksi sponsored.

| Aksi | Batas | Status |
|---|---|---|
| `privy_export` | 5 per menit | Terpasang, tahap 2 |
| `privy_import` | 5 per menit | Tahap 4 |
| Sponsored per user per hari | 20 | Terpasang, `consumeSponsorshipBudget()` |

Angka per menit mengikuti `checkRateLimit()` yang sudah ada, yaitu 5, bukan 3 seperti draf pertama spec ini. Limiter itu terkunci di 5/menit untuk redeem (ADR-006/019), dan membuat limiter kedua hanya demi selisih dua percobaan jelas tidak sepadan. Batas harian ditambahkan sebagai `checkDailyLimit()` yang terpisah, karena di sana angkanya memang harus bisa diatur.

---

## 6. Testing

### 6.1 Wajib sebelum apa pun dibangun

1. ~~Cek `recordVerification()` apakah `onlyOwner`.~~ **Selesai 21 September 2026: ya, `onlyOwner` (`GachardCard.sol:176`).** Transaksi klaim memakai self-transfer bernilai nol. Lihat 2.4.
2. ~~Uji `safeTransferFrom` ke wallet yang sudah terdelegasi 7702.~~ **Selesai 21 September 2026 dengan transfer sungguhan, bukan `eth_call`. Lihat 6.1.1 di bawah.**

**Tidak ada prasyarat tersisa. Implementasi bisa dimulai.**

#### 6.1.1 Hasil uji transfer sungguhan

Token uji dicetak ke admin, dipindahkan ke wallet probe yang sudah terdelegasi, dikembalikan lewat transaksi sponsored, lalu dibakar. Tidak ada token yang tertinggal.

| Langkah | Hasil |
|---|---|
| Mint token uji ke admin | Sukses |
| **`safeTransferFrom` admin ke wallet terdelegasi 7702** | **DITERIMA**, gas 120.511, tx `0x021156c9...980a` |
| Import sponsored: `safeTransferFrom` probe ke admin | **Sukses**, block 64496430, tx `0x7aaff4ac...59ee` |
| Saldo MON wallet probe setelah import | **0.0** |
| Cleanup, burn token uji | Sukses, admin dan probe sama-sama nol |

Dua hal yang dibuktikan sekaligus. Pertama, ERC-1155 acceptance check memang lolos di transaksi nyata, bukan cuma di `eth_call`. Kedua, **seluruh mekanika alur import Bagian 3 sudah berjalan end-to-end sebelum satu baris kode aplikasi ditulis**: wallet user menandatangani transfer ERC-1155 miliknya sendiri, Privy membayar gasnya, dan kartu sampai kembali ke custodial wallet.

Respons pertama tetap mengembalikan `hash: ""`, dan hash asli baru muncul di polling kedua (`broadcasted` lalu `confirmed`). Pola polling di 4.3 terkonfirmasi wajib.

#### 6.1.2 Peringatan: "could not coalesce error" pada RPC Monad

Muncul tiga kali selama pengujian. **Transaksinya benar-benar berhasil setiap kali**; yang gagal hanya parsing respons di sisi client. Terbukti saat percobaan burn kedua menjawab `"Owner does not hold card"`, yaitu karena burn pertama yang "gagal" itu sebenarnya sudah mengeksekusi.

Ini berbahaya untuk logika retry. **Retry buta pada operasi tulis akan mengeksekusi transaksi dua kali.**

Sudah diperiksa: kode yang ada **aman**. `withRetry()` di `lib/blockchain.ts:59` hanya membungkus operasi baca; `mintCard`, `mintBatch`, dan operasi tulis lain tidak memakainya. Jadi ini bukan bug yang sudah ada, melainkan jebakan untuk kode baru.

Aturan untuk semua route Privy: **jangan pernah membungkus panggilan tulis dengan retry otomatis.** Kalau sebuah tulisan gagal dengan error yang tidak jelas, periksa state on-chain lebih dulu (`balanceOf`, atau `transactions().get()` untuk jalur sponsored) sebelum memutuskan mengulang.

### 6.2 Alur utama

| Tes | Harapan |
|---|---|
| Export kartu Digital | Modal Privy muncul, kartu pindah, status `Exported` |
| Saldo wallet user setelah klaim | Tetap 0 MON |
| Import balik | Kartu kembali `Digital`, bisa di-list lagi |
| Export kartu Vaulted | Ditolak |
| Export kartu `isListed` | Ditolak |
| Print kartu Exported | Ditolak, guard baru |
| Dismantle kartu Exported | Ditolak, sudah otomatis |
| Tanda tangan dari alamat lain | Ditolak |
| Replay nonce yang sama | Ditolak |

### 6.3 Kegagalan

| Skenario | Harapan |
|---|---|
| Transfer sukses, MongoDB gagal | Rekonsiliasi memperbaiki dari chain |
| Klaim timeout | `transaction_id` tersimpan, bisa di-poll ulang |
| Sponsorship habis | Pesan jelas, kartu tidak terjebak |
| Delegasi Privy berubah, transfer revert | Terdeteksi tes integrasi 6.1.2 |

---

## 7. Urutan Implementasi

Tiap tahap berdiri sendiri dan bisa dihentikan tanpa meninggalkan sistem setengah jadi.

| # | Tahap | Est. |
|---|---|---|
| 1 | Tes 6.1, plus `lib/privy-server.ts` dengan polling | 0,5 hari |
| 2 | Export: tanda tangan, verifikasi, transfer keluar | 1 hari |
| 3 | Klaim sponsored + polling | 0,5 hari |
| 4 | Import | 1 hari |
| 5 | UI `/collection` + guard + rate limit | 1 hari |
| 6 | Rekonsiliasi + tes kegagalan | 0,5 hari |
| 7 | Rekaman demo | 0,5 hari |

Total sekitar 5 hari kerja, belum termasuk buffer. Deadline 23 hari lagi, submission dibuka 2 Oktober.

**Titik berhenti aman:** setelah tahap 3, export sudah berfungsi penuh dan sudah memenuhi kriteria bounty sendirian (user menandatangani, Privy membayar gas). Import memperkuatnya, tapi kalau waktu menipis, berhenti di tahap 3 tetap menghasilkan submission yang utuh.

---

## 8. Yang Direkam untuk Demo

Kriteria penilaian pertama bounty adalah soal demo. Rekam dengan explorer di sebelah aplikasi.

1. Kartu di `/collection`, tampak normal, tanpa istilah blockchain.
2. "Export" ditekan, **modal Privy muncul**, user menandatangani.
3. MonadVision: kartu berpindah ke alamat user.
4. **Saldo wallet user: 0 MON.** Tahan beberapa detik. Ini inti buktinya.
5. Dashboard Privy, tab Fee Sponsorship: transaksi tercatat, Privy yang membayar.
6. Admin console: tunjukkan **tidak ada** tombol untuk menarik kartu kembali.
7. "Return to Gachard", modal Privy lagi, kartu kembali.

Nomor 4 dan 6 yang melakukan pekerjaan berat. Satu membuktikan Privy membayar, satu lagi membuktikan kepemilikannya nyata.

Yang **tidak** boleh diklaim: bahwa ini menggantikan model custodial. Tidak. Ini jalur opsional, dan kejujuran itu memperkuat cerita ADR-002.
