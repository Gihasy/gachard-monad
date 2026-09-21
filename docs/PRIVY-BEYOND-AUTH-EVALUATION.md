# Evaluasi Pivot Privy — Memenuhi Syarat Bounty "Beyond Authentication"

## Status: EVALUASI (belum implementasi, belum ada ADR)

*Dibuat: 21 September 2026*
*Deadline bounty: 14 Oktober 2026, 10:59 GMT+7 (23 hari lagi). Submission dibuka 2 Oktober.*
*Dokumen terkait: `docs/PRIVY-EVALUATION.md` (Opsi C, sudah live), `docs/PRIVY-INTEGRATION-SPEC.md`, ADR-028*

---

## Ringkasan Eksekutif

Tiga temuan dari verifikasi teknis membalik asumsi awal dokumen tugas ini:

1. **Kemampuan signing SUDAH ADA di v1.93.0.** `useSignMessage`, `useSignTypedData`, dan `useSendTransaction` semuanya diekspor oleh SDK yang sudah ter-pin. Ini kebalikan dari kasus `useExportWallet`. Tidak ada blocker Turbopack untuk membuat user menandatangani sesuatu dengan wallet Privy mereka sendiri.

2. **Native gas sponsorship TIDAK ADA di v1.93.0, tapi ADA jalur server-side yang bebas dari masalah bundler.** Parameter `sponsor: true` lahir 10,5 bulan setelah v1.93.0 dirilis. Namun parameter yang sama tersedia lewat REST API Privy dan `@privy-io/node`, yang berjalan di Node runtime dan karena itu tidak pernah menyentuh Turbopack. **Sudah dibuktikan pada 21 September 2026**, lihat gerbang 3 di Bagian 6.

3. **Perubahan smart contract TIDAK diperlukan.** Premis "kontrak berubah" di dokumen tugas tidak terbukti setelah membaca `GachardCard.sol`. Baik export maupun import dua arah bisa dijalankan dengan fungsi yang sudah ada dan sudah teruji 78/78.

**Rekomendasi:** lanjutkan pivot, tetapi dengan arsitektur hybrid (signing di client v1.93.0 + sponsorship di server) alih-alih upgrade SDK. Detail di Bagian 6.

---

## Teks Bounty Resmi (terverifikasi)

Disalin dari halaman bounty di dashboard Metropolis, 21 September 2026. Bounty berstatus **SELECTED** untuk proyek ini. Prize **$5.000 USD, hadiah tunggal**, berlaku untuk **semua track**.

> **About.** Your project must integrate Privy beyond authentication. Using Privy only for login/authentication will not qualify.
>
> **Judging criteria.** Demo must clearly show the functionality powered by Privy. Bonus points for meaningfully integrating multiple Privy features into the project.
>
> **Deliverables.** A project with a demo clearly showing Privy-powered functionality beyond login/authentication.

Empat hal yang perlu dibaca cermat dari halaman itu:

1. **Kriteria penilaian hanya dua butir, dan yang pertama adalah soal demo, bukan soal kode.** Deliverable pun dirumuskan sebagai "a project with a demo". Rekaman demo bukan pelengkap, ia adalah barang yang dinilai. Ini menguatkan alasan mengapa modal signing yang kasatmata (Bagian 2 langkah 2) diperlakukan wajib di dokumen ini.

2. **Tidak ada daftar fitur wajib.** Bagian "Suggested starting points" di halaman itu **kosong**. Privy tidak menunjuk fitur tertentu, jadi pilihan fitur sepenuhnya argumen kita sendiri, dan yang dinilai adalah apakah integrasinya "meaningful".

3. **Bonus-nya soal "meaningfully", bukan soal jumlah.** Menumpuk fitur tanpa alasan produk justru melemahkan. Inilah sebabnya langkah klaim di Bagian 2 diikat menjadi prasyarat import, bukan dibiarkan berdiri sebagai hiasan.

4. **Berlaku untuk semua track**, jadi tidak ada konflik dengan posisi Gachard di track Consumer Apps.

**Koreksi atas riset sebelumnya:** draf pertama dokumen ini menyebut bahwa Privy punya kategori hadiah terpisah untuk session signers, native gas sponsorship, dan x402. Itu keliru dan sudah dihapus dari Bagian 4 dan Bagian 6. Informasi itu berasal dari hasil pencarian publik tentang event Privy yang lain, bukan bounty ini. Bounty Metropolis adalah satu hadiah tunggal tanpa sub-kategori. Konsekuensinya: memilih session signer tidak memberi nilai tambah struktural apa pun, ia hanya berguna kalau memang jalan terbaik secara teknis.

---

## 1. Verifikasi Teknis Wajib

Semua klaim di bagian ini berasal dari inspeksi langsung, bukan asumsi. Metode disebutkan agar bisa diulang.

### 1.1 Apakah native gas sponsorship mendukung Monad Testnet?

**YA, secara eksplisit.**

Halaman `docs.privy.io/wallets/gas-and-asset-management/gas/overview` mendaftar chain yang didukung mode **App pays** secara nominatif, bukan klaim "chain-agnostic". Daftar mainnet memuat Monad, dan daftar testnet memuat **Monad Testnet** dengan nama.

Dua detail tambahan yang penting:

- Sponsorship ini berlaku untuk **embedded EOA**, bukan hanya smart account. Dokumentasi menyatakan sponsorship dilakukan "without creating a separate contract account". Artinya tidak perlu ERC-4337, tidak perlu bundler, tidak perlu deploy smart account per user.
- Mode **User pays** TIDAK mendukung Monad. Hanya Ethereum, Base, Tempo, Optimism, Arbitrum, Polygon dan testnet-nya. Untuk kasus Gachard ini tidak relevan karena kita memang mau app-pays, tapi perlu dicatat agar tidak salah pilih mode di dashboard.

**Konsekuensi operasional:** sponsorship diaktifkan lewat toggle "Sponsor gas fees" di Privy Dashboard, lalu memilih chain di bagian "Supported chains". Untuk mainnet dibutuhkan payment method tersimpan. Untuk testnet dokumentasi tidak menyebut syarat pembayaran, **tapi ini harus dikonfirmasi langsung di dashboard sebelum flow dirancang bergantung padanya.** Ini satu-satunya ketidakpastian yang tersisa di Bagian 1, dan biaya untuk mengeceknya nol.

### 1.2 Apakah signing tersedia di v1.93.0?

**YA. Ini temuan terpenting dokumen ini.**

Metode: `grep` atas file deklarasi TypeScript di `node_modules/@privy-io/react-auth/dist/dts/index.d.ts` pada instalasi yang sedang dipakai (versi terkonfirmasi 1.93.0).

Hook yang relevan dan terbukti ada:

| Hook | Ada di v1.93.0 | Kegunaan untuk pivot ini |
|---|---|---|
| `useSignMessage` | Ya | User tanda tangan pesan. Memunculkan modal Privy. |
| `useSignTypedData` | Ya | Tanda tangan EIP-712 terstruktur. |
| `useSendTransaction` | Ya | User kirim transaksi on-chain dari wallet Privy. |
| `useCreateWallet` | Ya | Sudah dipakai sekarang. |
| `useDelegatedActions` | Ya (dengan catatan, lihat 1.4) | Izin server bertindak atas nama user. |
| `useFundWallet` | Ya | Tidak diperlukan. |
| `useExportWallet` | **Tidak** | Sesuai ADR-028, tetap tidak tersedia. |

Signature persisnya di v1.93.0:

```ts
useSignMessage(): {
  signMessage: (message: string, uiOptions?: SignMessageModalUIOptions, address?: string) => Promise<string>
}

useSendTransaction(): {
  sendTransaction: (data: UnsignedTransactionRequest, uiOptions?: SendTransactionModalUIOptions,
                    fundWalletConfig?: FundWalletConfig, address?: string) => Promise<TransactionReceipt>
}
```

**Kesimpulan: kekhawatiran utama di dokumen tugas tidak terbukti.** Kasus `useExportWallet` tidak terulang untuk signing. Skenario "signing cuma ada di v2+/v3+" yang dijadikan syarat gugur di Bagian 6 tugas **tidak terjadi.**

### 1.3 Apakah `sponsor: true` tersedia di v1.93.0?

**TIDAK di sisi client. YA lewat server.**

Bukti bahwa tidak ada di client:

- `grep -i sponsor` atas seluruh file `.d.ts` v1.93.0 menghasilkan **satu** kecocokan: `sponsorshipInfo` di dalam `DEFAULT_BICONOMY_PAYMASTER_CONTEXT`. Itu konteks paymaster Biconomy untuk smart wallet ERC-4337, **bukan** native sponsorship Privy. Dua hal yang berbeda.
- Tipe `UnsignedTransactionRequest` di v1.93.0 hanya berisi `from, to, nonce, gasLimit, gasPrice, data, value` dan sejenisnya. Tidak ada field `sponsor`.
- Kronologi menutup kemungkinan: **v1.93.0 dirilis 7 November 2024**. Native gas sponsorship **diumumkan 24 September 2025**, sekitar 10,5 bulan setelahnya. Fitur itu tidak mungkin ada di sana.
- Bentuk API-nya pun sudah berbeda. Dokumentasi Privy sekarang menunjukkan `sendTransaction(input, {address, sponsor})` dengan options berbentuk objek, sementara v1.93.0 memakai argumen posisional. Dokumentasi yang beredar mendeskripsikan v2+/v3+, bukan versi kita.

Bukti bahwa ada di server:

- Dokumentasi Privy menyatakan `sponsor: true` didukung di "React SDK dan server-side SDK (REST API, Node, Rust)", dan secara eksplisit menyarankan SDK client lain "achieve sponsorship by relaying transactions through servers".
- Endpoint: `POST https://api.privy.io/v1/wallets/{wallet_id}/rpc`, basic auth dengan app-id dan app-secret, body memuat `method: "eth_sendTransaction"`, `caip2: "eip155:10143"`, dan `sponsor: true`.
- Paket server **berdiri sendiri dan tidak punya hubungan versi dengan `@privy-io/react-auth`**. Dependency-nya bersih untuk Node (`jose`, `@noble/curves`, `svix`, dan sejenisnya). Tidak ada `@headlessui/react`, tidak ada `react-aria`, tidak ada WalletConnect.
- **Paketnya `@privy-io/node@0.34.0`, bukan `@privy-io/server-auth`.** Draf pertama dokumen ini menyebut `server-auth@1.32.5`; npm memunculkan peringatan deprecated saat pemasangan, dengan arahan pindah ke `@privy-io/node`. Dikoreksi saat gerbang 3 dijalankan.

**Ini poin arsitektural kunci.** Seluruh masalah pinning v1.93.0 adalah masalah **bundler client-side**. Paket server berjalan di Node runtime Next.js dan tidak pernah melewati Turbopack. Menambahkan `@privy-io/server-auth` **tidak membawa kembali risiko yang memaksa kita nge-pin di awal.**

### 1.4 Catatan: bug typing `useDelegatedActions` di v1.93.0

Jika jalur delegated/session signer dipakai, ada satu friksi konkret yang harus diketahui di awal:

- `index.d.ts` mendeklarasikan `interface UseDelegatedActionsInterface {}` — **kosong**. Tidak ada satu pun method di tipe itu.
- Tapi runtime punya implementasinya. `grep` atas bundle `esm/` dan `cjs/` menemukan `delegateWallet` (12 kemunculan) dan `revokeWallets` (2 kemunculan).

Jadi fungsinya jalan, tipenya bohong. Perlu module augmentation atau cast lokal. Bukan blocker, tapi ini persis jenis kejutan yang diminta ditemukan di awal, bukan di tengah implementasi.

### 1.5 Yang sudah dicek dan sengaja ditolak

- **Upgrade ke v3.44.0 (rilis 18 September 2026):** ini yang memberi `sponsor: true` di client. Tapi v3 adalah dua major version melewati kegagalan yang sudah terdokumentasi di ADR-028, dan sesi 15 September sudah membuktikan Webpack pun tidak menyelamatkan. Tidak diambil sebagai jalur utama.
- **Template resmi Monad `monad-developers/next-serwist-privy-smart-wallet`:** menarik karena sama-sama Next.js PWA, tapi memakai `@privy-io/react-auth ^2.14.2` di atas **Next 14 dan React 18**. Gachard di Next 16 dan React 19. Template ini tidak membuktikan kompatibilitas untuk stack kita.
- **Template `react-native-privy-pimlico-gas-sponsorship`:** memakai paymaster Pimlico dan ERC-4337, bukan native sponsorship Privy. Jalur ini lebih berat (smart account per user) dan secara naratif lebih lemah untuk bounty karena yang membayar gas adalah Pimlico, bukan Privy.

---

## 2. Redesain Flow Export

Pertanyaan kunci di dokumen tugas ("siapa yang menandatangani?") punya jawaban yang bersih: **dua pihak menandatangani dua hal yang berbeda, dan yang kedua adalah yang membuat ini lolos "beyond authentication".**

### Flow

1. **User memilih kartu di `/collection`** dan menekan "Export to my wallet". Prasyarat: user sudah punya Privy wallet. Bagian "For Advanced Users" yang sudah live sekarang menjadi prasyarat, bukan fitur akhir.

2. **User menandatangani intent, dengan wallet Privy mereka sendiri.** Ini terjadi **sebelum** transfer, bukan sesudah. `useSignMessage` atau `useSignTypedData` (EIP-712) dari v1.93.0, memunculkan modal Privy yang terlihat jelas. Isi pesan mengikat: tokenId, alamat tujuan, userId, nonce, timestamp.

   Menempatkan tanda tangan di depan memberi dua hal sekaligus. Secara keamanan, ini membuktikan user benar-benar mengontrol wallet tujuan **sebelum** aset dikirim ke sana, sehingga menutup skenario salah-alamat yang tidak bisa dibatalkan. Secara demo, modal Privy muncul di momen yang jelas dan bisa ditunjuk.

3. **Backend memverifikasi tanda tangan** (`ethers.verifyMessage` atau `verifyTypedData`), memeriksa bahwa alamat pemulih sama dengan alamat wallet Privy milik user tersebut di database, dan nonce belum pernah dipakai.

4. **Backend mengeksekusi transfer keluar.** Ini tetap ditandatangani admin wallet, dan itu wajar: kartu memang dipegang custodial wallet, jadi hanya admin yang bisa memindahkannya. Tidak ada cara lain dan tidak perlu disamarkan.

5. **Transaksi klaim yang disponsori Privy.** Setelah transfer mendarat, kartu ada di wallet Privy user. Langkah klaim adalah transaksi on-chain yang dikirim **dari wallet Privy user** dengan **gas dibayar Privy**, memanggil `recordVerification()` atau fungsi acknowledgment ringan. Dua jalur implementasi, lihat Bagian 6.

Yang membedakan ini dari desain lama: wallet Privy bukan lagi alamat tujuan pasif. Wallet itu **menandatangani** (langkah 2) dan **mengirim transaksi yang gasnya dibayar Privy** (langkah 5).

### Catatan jujur tentang langkah 5

Langkah klaim ini **tidak diperlukan secara teknis.** Kartu sudah jadi milik user setelah langkah 4. Langkah 5 ada untuk membuat kapabilitas Privy terlihat dan terpakai.

Itu boleh, asalkan kita jujur soal apa yang dilakukannya, dan asalkan ia benar-benar mengerjakan sesuatu. Cara membuatnya tidak dekoratif: jadikan langkah 5 sebagai syarat untuk bisa **import balik**. Backend hanya menerima kembali kartu yang pernah diklaim. Dengan begitu ada alasan produk yang nyata, bukan sekadar teater demo.

---

## 3. Redesain Flow Import

Di sini Privy menjadi aktor utama tanpa ambiguitas apa pun, karena kartu benar-benar dipegang wallet user dan **hanya user yang bisa memindahkannya.**

1. **User membuka "Return to Gachard"** dari daftar kartu yang sudah di-export.

2. **User menandatangani dan mengirim transfer balik dengan wallet Privy mereka sendiri.** `useSendTransaction` dari v1.93.0, memanggil `safeTransferFrom(privyWallet, custodialWallet, tokenId, 1, "0x")` di `GachardCard`. Backend **tidak bisa** melakukan ini, dan itu bukan kekurangan melainkan intinya: kepemilikan sungguhan berarti hanya pemiliknya yang bisa memindahkan.

   Ini menggantikan desain lama yang mendeteksi transfer masuk secara pasif. Perbedaannya bukan kosmetik. Di desain lama Privy adalah event listener. Di desain ini Privy adalah eksekutornya.

3. **Gas disponsori Privy.** Penting secara praktis, bukan hanya untuk bounty: wallet Privy user kosong, tidak punya MON. Tanpa sponsorship, user harus faucet dulu, dan seluruh premis ADR-002 ("user tidak perlu tahu soal gas") runtuh di titik ini. Sponsorship bukan pemanis, ia yang membuat flow import mungkin sama sekali.

4. **Backend mendeteksi kedatangan** lewat event `TransferSingle` yang di-anchor ke block number transaksi klaim, memakai pola yang sama persis dengan perbaikan `getFulfillTxHash` di commit `4658e4e`. Status di MongoDB kembali ke `Digital`, kartu muncul lagi di `/collection` dan bisa dipakai untuk marketplace, print, dismantle.

---

## 4. Pemetaan ke Kriteria Bounty

| Kriteria bounty | Dipenuhi oleh | Bagaimana terlihat jelas di demo |
|---|---|---|
| **Beyond authentication** | Flow import (Bagian 3) adalah buktinya yang paling tidak terbantahkan. Transfer balik ditandatangani dan dikirim wallet Privy user; secara teknis backend Gachard tidak punya kemampuan melakukannya. Ini mustahil diklasifikasikan sebagai "login". | Tunjukkan bahwa admin console **tidak punya** tombol untuk menarik kartu kembali. Satu-satunya jalan pulang adalah user menandatangani sendiri. Kontras ini lebih meyakinkan daripada narasi apa pun. |
| **Functionality jelas terlihat di demo** | Modal signing Privy muncul dua kali di momen yang berbeda dan bisa ditunjuk: saat export (tanda tangan intent) dan saat import (kirim transaksi). Keduanya UI Privy asli, bukan komponen kita. | Rekam alur penuh: kartu di `/collection`, modal Privy, alamat berubah di MonadVision, kartu hilang dari koleksi, "Return", modal Privy, kartu kembali. Tampilkan explorer berdampingan dengan aplikasi. |
| **Multiple Privy features (bonus)** | Tiga fitur, bukan dua. **(a)** Message/typed-data signing lewat `useSignMessage`. **(b)** Transaction signing lewat `useSendTransaction`. **(c)** Native gas sponsorship. Ditambah **(d)** session signers jika jalur server dipilih. Embedded wallet creation yang sudah live tetap terhitung sebagai fondasi, tapi berhenti diandalkan sebagai klaim utama. Kata kuncinya di halaman bounty adalah "meaningfully", jadi setiap fitur harus bisa dijelaskan alasan produknya, bukan sekadar dihitung. | Tunjukkan saldo MON wallet Privy user tetap **0** setelah transaksi berhasil. Ini bukti visual satu detik bahwa gas dibayar pihak lain, dan jauh lebih kuat daripada mengatakannya. Sandingkan dengan tab Fee Sponsorship di Privy Dashboard yang menunjukkan transaksi tercatat. |

Satu hal yang harus dihindari saat presentasi: jangan mengklaim ini menggantikan model custodial. Tidak. Ini jalur opsional untuk user yang menginginkannya, dan kejujuran itu justru memperkuat cerita ADR-002.

---

## 5. Dampak ke Arsitektur yang Sudah Stabil

### 5.1 Isolasi dari core flow

**Tetap terjaga, dengan satu pengecualian yang harus diakui.**

Yang tidak tersentuh: `mint`, `fulfill`, entropy, marketplace, print, redeem, dismantle. Tidak ada satu pun yang perlu diubah. Semua route baru berdiri sendiri.

Pengecualiannya: `/collection` sekarang harus bisa menampilkan kartu berstatus "Exported", dan setiap fitur yang mengasumsikan kartu Digital dipegang custodial wallet perlu mengecualikan status itu. Titik sentuhnya konkret dan bisa dihitung: listing marketplace, print request, dismantle, dan cart.

Ini lebih dari ADR-028 yang benar-benar nol sentuhan. Harus dicatat sebagai kenaikan scope yang nyata, bukan diklaim tetap isolated.

### 5.2 Perubahan smart contract

**Tidak diperlukan. Premis di dokumen tugas tidak terbukti.**

Hasil pembacaan `contracts/src/GachardCard.sol`:

- **Transfer keluar** sudah bisa lewat `marketplaceTransfer(tokenId, from, to)` di baris 161. Fungsi ini `onlyOwner` dan tidak membatasi `to` harus alamat internal. Satu-satunya syarat adalah `cardStatus == Digital`. Wallet Privy eksternal memenuhi syarat itu.
- **Transfer masuk** sudah bisa lewat `safeTransferFrom` bawaan ERC-1155. Override `_update()` di baris 205 hanya memblokir kartu `Vaulted`. Kartu `Digital` yang dipegang user bisa dipindahkan olehnya sendiri tanpa halangan.
- **Bookkeeping `lastOwner` sudah benar.** Baris 218 sampai 221 ("H-2 fix") memperbarui `lastOwner` pada transfer ERC-1155 standar, bukan hanya pada `marketplaceTransfer`. Jadi transfer yang diinisiasi user tidak merusak state yang dipakai `redeem`.

Artinya: **tidak ada redeploy, tidak ada verifikasi ulang Sourcify, 78/78 test tetap valid, tidak ada risiko migrasi alamat kontrak seperti insiden 14 September.** Ini menghapus sumber risiko terbesar yang diantisipasi dokumen tugas.

Satu keputusan desain yang tersisa: status "Exported" disimpan di MongoDB saja atau ditambahkan ke enum `CardStatus` on-chain. **Rekomendasi: MongoDB saja.** Presedennya sudah ada dan sudah diterima, yaitu status "Burned" di ADR-026 yang juga hanya hidup di MongoDB. Menambah enum berarti redeploy, dan redeploy berarti seluruh paragraf di atas batal.

Konsekuensi yang harus diterima: sumber kebenaran "kartu ini sedang di luar" adalah MongoDB. Cara memverifikasinya on-chain adalah `balanceOf(custodialWallet, tokenId) == 0`, sama persis dengan pola burn di ADR-026. Ini harus ditulis di ADR baru agar tidak jadi jebakan bagi fitur di masa depan.

### 5.3 Estimasi risiko dan effort

| Area | Risiko | Catatan |
|---|---|---|
| Smart contract | **Nol** | Tidak ada perubahan. Ini hasil verifikasi, bukan harapan. |
| `@privy-io/server-auth` di Node runtime | **Rendah** | Dependency bersih, tidak lewat Turbopack. Tetap harus dibuktikan dengan satu build nyata sebelum apa pun dibangun di atasnya. |
| Client tetap v1.93.0 | **Rendah** | Tidak ada perubahan versi, jadi tidak ada risiko baru. Berbeda kalau memilih jalur upgrade, yang justru kita hindari. |
| Gas sponsorship di testnet | **Sedang** | Satu-satunya ketidakpastian tersisa dari Bagian 1. Harus dikonfirmasi di dashboard di hari pertama. |
| Konsistensi state export/import | **Sedang** | Transfer bisa mendarat sementara update MongoDB gagal. Rekonsiliasi wajib, tapi polanya sudah ada dan sudah terbukti di `4658e4e`. |
| `/collection` dan fitur turunannya | **Sedang** | Satu-satunya tempat yang benar-benar menyentuh permukaan yang sudah stabil. |
| Bug typing `useDelegatedActions` | **Rendah** | Hanya kalau jalur session signer dipakai. Sudah diketahui di muka. |
| Biaya dan penyalahgunaan sponsorship | **Sedang**, dan **Tinggi** kalau jalur client yang dipakai | Lihat 5.4. Tidak ada di draf pertama dokumen ini. |

Effort kasar, dengan asumsi verifikasi hari pertama lolos: satu hari untuk verifikasi dashboard dan proof-of-concept sponsorship terisolasi, dua sampai tiga hari untuk export dan import end-to-end, satu hari untuk rekonsiliasi dan penyesuaian `/collection`, satu hari untuk pengujian dan rekaman demo. Belum termasuk buffer untuk kejutan, yang pada proyek ini secara historis selalu terpakai.

### 5.4 Cakupan sponsorship, biaya, dan penyalahgunaan

Bagian ini tidak ada di draf pertama dan seharusnya ada sejak awal. Pertanyaannya sederhana: kalau Privy membayar gas, **apa batasnya?**

#### Privy tidak membatasi per kontrak

Cakupan sponsorship di sisi Privy adalah **per-app dan per-chain, dengan opt-in per transaksi**. Sponsorship menyala kalau ada flag `sponsor: true` pada request, di chain yang diaktifkan di dashboard, untuk wallet milik app kita.

Yang **tidak** disediakan Privy: pembatasan berdasarkan alamat kontrak tujuan. Privy tidak tahu apa itu `GachardCard` dan tidak akan menolak transaksi hanya karena tujuannya kontrak lain. Kalau flag itu ada, Privy membayar.

Jadi jawaban atas "apakah sponsorship hanya berlaku untuk ekosistem Gachard" adalah **ya, tapi bukan karena Privy yang membatasinya.** Yang membatasi adalah backend kita, karena hanya backend kita yang menentukan transaksi mana yang dikirim dengan flag itu.

#### Ini alasan kedua memilih jalur server

Konsekuensinya lebih tajam daripada sekadar soal biaya, dan memperkuat rekomendasi di Bagian 6 lewat jalan yang sama sekali berbeda dari argumen Turbopack:

- **Jalur server (rekomendasi):** transaksi sponsored disusun dan dikirim backend. User tidak pernah memegang flag `sponsor`. Mereka tidak bisa meminta sponsorship untuk transaksi sembarangan karena tidak punya cara menyusunnya. Permukaan serangannya adalah endpoint kita sendiri, yang memang sudah kita kendalikan.
- **Jalur client (v3, `sendTransaction(..., {sponsor: true})`):** flag itu berada di kode yang berjalan di browser user, dan kode browser bisa dimodifikasi. Siapa pun yang mau repot bisa mengirim transaksi apa pun, ke kontrak apa pun, dengan gas dibayar saldo sponsorship kita.

Dengan kata lain, upgrade ke v3 bukan hanya berisiko secara bundler, ia juga memindahkan kontrol pengeluaran ke tempat yang tidak bisa kita percayai.

#### Sakelar yang menegakkan ini ada di dashboard

Ditemukan 21 September 2026 saat menyiapkan gerbang 1. Di halaman Fee Sponsorship ada opsi **"Allow transactions from the client"**, dengan keterangan:

> Enable this to allow gas-sponsored transactions from the client-side application without requiring the app secret. When disabled, transactions can only be sponsored from the server with the app secret.

**Posisi yang benar untuk Gachard: MATI.**

Ini bukan preferensi, melainkan konsekuensi langsung dari sifat App ID. `NEXT_PUBLIC_PRIVY_APP_ID` memakai prefix `NEXT_PUBLIC_`, jadi nilainya ter-inline ke bundle JavaScript dan bisa dibaca siapa pun yang membuka DevTools di halaman produksi. App ID bukan rahasia dan tidak pernah dirancang sebagai rahasia.

Kalau sakelar itu dinyalakan, satu-satunya penjaga saldo sponsorship adalah sesuatu yang tercetak terbuka di halaman. Dengan posisi mati, penjaganya adalah App Secret yang hanya hidup di server.

Jadi risiko "Tinggi" di tabel 5.3 bukan hipotesis arsitektural, melainkan satu klik di dashboard. Sakelar ini adalah penegak teknis dari seluruh argumen di 5.4, dan posisinya harus dicatat di ADR-031 supaya tidak diubah orang lain di kemudian hari tanpa membaca alasannya.

Konsekuensi yang harus diterima: gerbang 2 dan seluruh implementasi sponsorship **wajib** punya App Secret. Tidak ada jalan pintas lewat client, dan itu memang tujuannya.

#### Wallet-nya memang tidak bisa dipakai di luar Gachard

Embedded wallet terikat pada app ID kita, dan di v1.93.0 tidak ada export private key (ADR-028). User tidak bisa membawanya ke MetaMask atau dApp lain. Hari ini, satu-satunya cara wallet itu bertransaksi adalah lewat Gachard.

Kalau suatu saat wallet itu bisa dipakai di tempat lain, prinsip tagihannya tetap sama: **yang membayar adalah app yang mengirim transaksi dengan `sponsor: true`.** App lain memakai saldo mereka sendiri. User yang mengirim langsung ke RPC tanpa lewat Privy membayar sendiri dengan MON miliknya.

#### Kontrol pengeluaran adalah tanggung jawab kita

Privy hanya menyediakan batas pengeluaran global. Kontrol yang lebih halus, per wallet, per user, atau per rentang waktu, harus dibangun aplikasi sebelum memanggil API Privy.

Untuk Gachard ini bukan soal teoretis. **Setiap import adalah satu transaksi sponsored**, dan tidak ada yang mencegah satu user melakukan export lalu import berulang-ulang sampai saldo habis. Polanya sudah ada di proyek ini dan tinggal dipakai ulang: rate-limiting berbasis MongoDB seperti ADR-019 untuk redeem.

Untuk demo hackathon, batas global di dashboard sudah cukup dan tidak perlu dibesar-besarkan. Untuk sesuatu yang dibuka ke publik, tidak cukup. Ini harus masuk ADR-031 sebagai syarat, bukan sebagai catatan kaki.

---

## 6. Rekomendasi Akhir

**Lanjutkan pivot.** Syarat gugur yang ditetapkan di dokumen tugas ("kalau signing tidak tersedia di SDK yang kompatibel") **tidak terpenuhi**, karena signing tersedia. Fallback "sign a message saja" tidak perlu diambil sebagai rencana utama, meski tetap berguna sebagai jaring pengaman.

Alasan utamanya bukan bounty. Alasannya adalah bahwa flow export/import ini akhirnya memberi arti nyata pada bagian "For Advanced Users" yang sekarang hanya menampilkan alamat, dan menutup lingkaran yang sudah dijanjikan Roadmap di README.

### Arsitektur yang direkomendasikan: hybrid, bukan upgrade

| Lapisan | Teknologi | Alasan |
|---|---|---|
| Signing oleh user | `@privy-io/react-auth` **v1.93.0, tidak diubah** | Sudah punya `useSignMessage`, `useSignTypedData`, `useSendTransaction`. Nol risiko bundler. |
| Gas sponsorship | `@privy-io/node@0.34.0` + `wallets().rpc()` dengan `sponsor: true` | Node runtime, tidak lewat Turbopack. Satu-satunya cara mendapat sponsorship tanpa menyentuh v3. Sudah dibuktikan build, typecheck, dan runtime (gerbang 3). **Bukan `@privy-io/server-auth`, paket itu sudah deprecated.** |
| Smart contract | **Tidak diubah** | `marketplaceTransfer` dan `safeTransferFrom` sudah cukup. |
| Status "Exported" | MongoDB | Preseden ADR-026. |

Jalur server untuk sponsorship menuntut wallet user punya session signer, yang berarti user memberi izin sekali lewat `useDelegatedActions` (ada di v1.93.0, dengan catatan typing di 1.4). Ini menambah satu fitur Privy lagi ke daftar bonus, tapi jangan dipakai hanya demi menambah hitungan: ia dipilih karena memang satu-satunya cara mendapat sponsorship tanpa menyentuh v3, dan alasan itulah yang dibawa ke demo.

Ada alasan kedua yang berdiri sendiri, dan menurut saya sama kuatnya: **flag `sponsor` tidak boleh berada di kode yang dijalankan browser user.** Kalau flag itu ada di client, saldo sponsorship kita bisa dipakai untuk transaksi apa pun ke kontrak mana pun oleh siapa pun yang mau memodifikasi kode halaman. Jalur server menutup itu secara struktural. Uraiannya di 5.4.

Artinya rekomendasi ini tetap berdiri seandainya masalah Turbopack besok hilang sekalipun.

Kompromi yang harus disadari: kalau transaksi klaim dieksekusi server, user tidak melihat modal. Karena itu **modal signing di langkah export (Bagian 2 langkah 2) menjadi wajib, bukan opsional**, itulah yang memberi bukti visual bahwa Privy bekerja. Kombinasinya: user menandatangani secara kasatmata di client, server mengeksekusi dengan gas yang dibayar Privy.

### Gerbang keputusan hari pertama

Sebelum satu baris kode fitur ditulis, tiga hal ini harus dijawab dengan percobaan nyata, bukan dokumentasi. Urutannya sengaja: yang paling murah dan paling mungkin gagal didahulukan.

| # | Gerbang | Status | Tanggal |
|---|---|---|---|
| 1 | Fee Sponsorship aktif untuk Monad Testnet di dashboard | **TERBLOKIR**, perlu tindakan user | 21 Sep 2026 |
| 2 | Satu transaksi sponsored lewat REST API | **TERBLOKIR**, bergantung pada gerbang 1 | 21 Sep 2026 |
| 3 | SDK server tidak merusak build | **LOLOS** | 21 Sep 2026 |

#### Gerbang 1, terblokir: perlu login dashboard

**Aktifkan Fee Sponsorship di Privy Dashboard, pilih Monad Testnet.** Apakah testnet bisa diaktifkan tanpa payment method? Ini pertanyaan terbuka terakhir dari Bagian 1.

Hanya bisa dikerjakan pemilik akun Privy. Sekalian saat membuka dashboard, **buat App Secret** dan simpan sebagai `PRIVY_APP_SECRET` di `.env.local`. Sekarang yang ada hanya `NEXT_PUBLIC_PRIVY_APP_ID`, dan tanpa secret gerbang 2 tidak bisa dijalankan sama sekali.

#### Gerbang 2, terblokir: menunggu gerbang 1

**Kirim satu transaksi sponsored dari wallet uji lewat REST API.** Kalau berhasil, saldo wallet tetap nol dan transaksi tetap masuk. Ini membuktikan atau menggugurkan seluruh Bagian 3 sekaligus.

Bentuk panggilannya sudah terverifikasi dari typing SDK (lihat gerbang 3), jadi yang tersisa murni soal kredensial dan konfigurasi dashboard.

#### Gerbang 3, LOLOS

Dijalankan di branch `experiment/privy-server-auth`, dengan `frontend/package.json` dan `package-lock.json` dicadangkan lebih dulu. `main` tidak disentuh.

Urutan dan hasilnya:

1. **Build baseline sebelum apa pun dipasang: sukses.** Tanpa ini, kegagalan apa pun tidak bisa diatribusikan.
2. **`npm install @privy-io/server-auth`: sukses**, 19 paket, 34 detik. Build setelahnya sukses.
3. **Temuan yang mengubah rekomendasi:** npm memunculkan peringatan `npm warn deprecated @privy-io/server-auth@1.32.5: This package is deprecated. If you are looking for the latest features and support, use @privy-io/node instead.` Paket yang direkomendasikan Bagian 6 draf sebelumnya sudah tidak dipelihara.
4. **Ganti ke `@privy-io/node@0.34.0`: sukses.** Dependency-nya bahkan lebih bersih dari `server-auth` (tidak ada `@solana/web3.js`, `redaxios`, atau `node-fetch-native`). Tetap nol dependency React.
5. **`sponsor` terkonfirmasi sebagai tipe, bukan sekadar klaim dokumentasi.** Di `resources/wallets/wallets.d.ts` terdapat `method: 'eth_sendTransaction'`, `caip2`, dan `sponsor?: boolean` (baris 877, 876, 890), plus `sponsor_options`. Ini bukti lebih kuat daripada halaman dokumentasi mana pun di Bagian 1.
6. **`tsc --noEmit`: bersih**, setelah satu koreksi API. Bentuknya `client.wallets().rpc(...)`, bukan `client.wallets.rpc(...)`. `wallets` adalah fungsi, bukan properti. Catat ini untuk spec.
7. **Build dengan SDK benar-benar di-import oleh sebuah route: sukses**, 10,6 detik, route muncul di tabel sebagai `ƒ /api/privy-probe`.
8. **Uji runtime: `{"ok":true}`.** `npm run start`, lalu `curl` ke route probe. `PrivyClient` terkonstruksi dan `wallets().rpc` adalah fungsi di Node runtime Next.js.

**Kesimpulan gerbang 3: hipotesis inti Bagian 1.3 terbukti.** SDK server Privy masuk ke proyek ini tanpa menyentuh masalah bundler yang memaksa pinning v1.93.0. Build, typecheck, dan runtime semuanya hijau.

Dua catatan metodologis, karena keduanya nyaris meloloskan kesimpulan yang salah:

- Percobaan pertama menaruh probe di `app/api/_privy-probe`. App Router memperlakukan folder berawalan garis bawah sebagai **private folder** dan tidak merutekannya, jadi importnya tidak pernah ikut di-bundle. Build hijau saat itu tidak membuktikan apa pun. Diulang dengan nama tanpa garis bawah.
- Percobaan runtime pertama dijawab `{"error":"Authentication required"}` oleh middleware, bukan oleh handler. Probe dipindah ke bawah `/api/health`, satu-satunya prefix publik di `middleware.ts` baris 16.

Probe sudah dihapus setelah selesai. Yang tersisa di branch hanya perubahan `package.json` dan `package-lock.json`.

Kalau gerbang 1 dan 2 juga lolos, lanjutkan penuh dan tulis spec teknis.

### Fallback kalau gerbang 1 atau 2 gagal

Kalau sponsorship ternyata tidak bisa dipakai di Monad Testnet, pivot **tidak batal**, hanya kehilangan satu fitur.

Export dan import tetap bisa dibangun dengan signing saja, karena signing sudah terbukti tersedia. Yang hilang adalah klaim sponsorship, dan wallet user butuh sedikit MON dari faucet untuk transfer balik. Secara kriteria bounty, "user menandatangani transaksi transfer ERC-1155 dari wallet mereka sendiri" tetap jelas-jelas beyond authentication. Yang berkurang hanya poin bonus multiple features, dari tiga fitur menjadi dua.

Fallback paling minimal yang disebut di dokumen tugas, yaitu sign-a-message tanpa transfer sungguhan, **hanya diambil kalau gerbang 3 gagal** atau kalau ada kejutan besar di `/collection`. Itu lolos secara harfiah tapi lemah secara demo, dan sebaiknya diperlakukan sebagai jaring pengaman, bukan target.

---

## Yang Harus Dilakukan Sebelum Dokumen Ini Jadi Spec

1. ~~Baca ulang teks bounty resmi dari dashboard hackathon dan lampirkan di sini.~~ **Selesai 21 September 2026**, lihat bagian "Teks Bounty Resmi" di atas.
2. Jalankan tiga gerbang keputusan di atas dan catat hasilnya. Ini sekarang jadi item terbuka pertama, dan harus tuntas sebelum 2 Oktober agar sisa waktu dipakai membangun, bukan memverifikasi.
3. Tulis ADR-031 setelah gerbang lolos, mencakup: status "Exported" hanya di MongoDB dan konsekuensinya, pembagian tugas signing antara client dan server, keputusan tidak mengubah smart contract, serta **batas pengeluaran sponsorship per user dan alasan flag `sponsor` tidak pernah ditaruh di client** (5.4).
4. Perbarui ADR-028 dengan penunjuk ke ADR-031, karena scope Privy berubah dari view-only menjadi transaksional.

---

## Sumber

Teks bounty disalin dari halaman "Tracks & Bounties > Privy!" di dashboard Metropolis (perlu login), dibaca 21 September 2026.

Verifikasi lokal dilakukan atas `node_modules/@privy-io/react-auth` versi 1.93.0 dan `contracts/src/GachardCard.sol` pada commit `4a27e97`.

- [Gas sponsorship overview, Privy Docs](https://docs.privy.io/wallets/gas-and-asset-management/gas/overview)
- [Setting up gas sponsorship, Privy Docs](https://docs.privy.io/wallets/gas-and-asset-management/gas/setup)
- [Custom gas sponsorship rate limits, Privy Docs](https://docs.privy.io/recipes/gas-sponsorship-rate-limits)
- [Send an Ethereum transaction, Privy Docs](https://docs.privy.io/wallets/using-wallets/ethereum/send-a-transaction)
- [eth_sendTransaction REST API, Privy Docs](https://docs.privy.io/api-reference/wallets/ethereum/eth-send-transaction)
- [Enabling users or servers to execute transactions, Privy Docs](https://docs.privy.io/recipes/wallets/user-and-server-signers)
- [Introducing Privy's native gas sponsorship](https://privy.io/blog/introducing-privy-native-gas-sponsorship)
- [Introducing Delegated Actions](https://privy.io/blog/delegated-actions-launch)
- [monad-developers/next-serwist-privy-smart-wallet](https://github.com/monad-developers/next-serwist-privy-smart-wallet)
- [monad-developers/react-native-privy-pimlico-gas-sponsorship-template](https://github.com/monad-developers/react-native-privy-pimlico-gas-sponsorship-template)
- [Metropolis, a Monad hackathon](https://monad.xyz/developers/hackathons/metropolis)
