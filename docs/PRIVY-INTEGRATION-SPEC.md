# Technical Spec — Integrasi Privy: "For Advanced Users" di Profile
## Status: IMPLEMENTED (deployed to production)

*Dibuat: 15 September 2026*
*Terakhir diupdate: 16 September 2026*
*Target: Submit review sebelum mulai kode*

---

## 1. Scope Fitur

### Apa yang dibangun

Di halaman `/profile`, tambah section baru **"For Advanced Users"** yang memberikan user OPSI untuk mengaktifkan akses teknis lanjutan via Privy, tanpa mengubah cara Gachard beroperasi.

**User flow (progressive disclosure):**

1. User buka `/profile` → lihat section "For Advanced Users" di bagian bawah halaman
2. User klik tombol "Set Up Advanced Access" → Privy popup muncul (Google login)
3. Section berubah: tampilkan checkmark "Advanced Access Enabled" + tombol "Show Technical Details ▾" (collapsed by default)
4. User klik "Show Technical Details" → expand untuk tampilkan address, explorer link, disconnect
5. Semua istilah teknis (wallet, network, blockchain, private key) HANYA terlihat setelah user secara eksplisit expand

**Apa yang TIDAK berubah:**

| Fitur | Tetap pakai custodial wallet? | Alasan |
|-------|------------------------------|--------|
| Pack purchase (mint) | ✅ Ya | Core flow stabil, jangan disentuh |
| Fulfill (entropy) | ✅ Ya | Baru selesai debug 5+ putaran |
| Print / Redeem | ✅ Ya | Tidak relevan dengan Privy |
| Marketplace | ✅ Ya | Tidak relevan dengan Privy |
| Dismantle | ✅ Ya | Tidak relevan dengan Privy |

### Kenapa ini bukan "surface-level demo"

Value proposition yang bisa disampaikan ke juri dengan jujur:

> "Gachard memberikan user pilihan secara bertahap (progressive disclosure): user biasa tidak pernah melihat istilah teknis — mereka buka pack dan koleksi kartu seperti app biasa. User yang MAU tahu lebih bisa klik 'Set Up Advanced Access' untuk membuat wallet self-custody ASLI (bukan simulasi/demo) via embedded wallet Privy, dengan address yang bisa diverifikasi langsung di block explorer Monad. Kedua pengalaman ini hidup berdampingan di satu app yang sama, tanpa mengorbankan filosofi hide-the-blockchain untuk mayoritas pengguna."

Ini memenuhi kriteria Privy bounty ("Privy digunakan di project") tanpa mengorbankan stabilitas core flow atau filosofi hide-the-blockchain.

**Catatan:** Fitur export private key (`useExportWallet`) tidak tersedia di `@privy-io/react-auth@1.93.0` (versi yang kompatibel dengan Turbopack Next.js 16). Wallet address tetap bisa dilihat dan diverifikasi via block explorer. Detail di MEMORY.md.

---

## 2. Technical Design

### 2.1 Privy SDK Setup

**Package:** `@privy-io/react-auth` (latest)
**Dependency tambahan:** `viem` (untuk chain definition Monad Testnet)

**Privy App ID:** Dapatkan dari https://dashboard.privy.io → buat app baru → copy App ID. Simpan di env var `NEXT_PUBLIC_PRIVY_APP_ID`.

**Monad Testnet chain config** (karena Monad Testnet belum ada di `viem/chains` bawaan):

```typescript
import { defineChain } from 'viem';

export const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  network: 'monad-testnet',
  nativeCurrency: { decimals: 18, name: 'MON', symbol: 'MON' },
  rpcUrls: {
    default: { http: ['https://testnet-rpc.monad.xyz'] },
  },
  blockExplorers: {
    default: { name: 'MonadVision', url: 'https://testnet.monadvision.com' },
  },
});
```

### 2.2 Auth Flow

**Privy TIDAK menggantikan Google OAuth Gachard.** Keduanya berjalan terpisah:

| Auth | Untuk apa | Siapa yang handle |
|------|-----------|-------------------|
| Google OAuth | Login ke Gachard, akses /collect, /profile, dll | Gachard session (`gachard_session` cookie) |
| Privy | Membuat embedded wallet saja | Privy SDK (terpisah dari Gachard auth) |

**Alasan memisah (bukan linked):**
- Lebih sederhana untuk diimplementasi — tidak perlu ubah auth flow Gachard yang sudah ada
- Privy bisa dipakai tanpa login ke Gachard dulu (kalau di masa depan mau expand)
- User yang hanya mau main Gachard (tidak peduli wallet) tidak pernah melihat Privy login

**Privy login method:** Google (sama dengan Gachard, jadi user pakai akun Google yang sama secara natural). Privy juga support email, SMS, dan wallet connect — tapi untuk scope ini, cukup Google.

### 2.3 Provider Setup

Wrap halaman `/profile` (atau bagian yang relevan) dengan `PrivyProvider`. TIDAK perlu wrap seluruh app — cukup halaman yang butuh Privy.

```typescript
// components/PrivyWrapper.tsx (baru)
'use client';
import { PrivyProvider } from '@privy-io/react-auth';
import { monadTestnet } from '@/lib/monad-testnet';

export default function PrivyWrapper({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        defaultChain: monadTestnet,
        supportedChains: [monadTestnet],
        loginMethods: ['google', 'email'],
        embeddedWallets: {
          ethereum: { createOnLogin: 'users-without-wallets' },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
```

### 2.4 Database Schema (Users Collection)

Tambah field OPSIONAL di `users` collection — HANYA untuk tampilan, TIDAK dipakai sebagai wallet transaksi:

```typescript
// Field baru (opsional, tidak wajib ada untuk user existing)
{
  privyUserId?: string;        // Privy user ID (untuk re-connect)
  privyWalletAddress?: string; // Embedded wallet address (untuk display)
  privyConnectedAt?: string;   // Timestamp kapan pertama connect
}
```

**Tidak ada migrasi** — field ini hanya diisi saat user baru connect Privy. User existing yang tidak connect Privy tidak terpengaruh sama sekali.

### 2.5 Komponen Frontend Baru

**`components/profile/PrivyWalletSection.tsx`** (baru):

Komponen ini menggunakan progressive disclosure — istilah teknis hanya terlihat setelah user secara eksplisit meminta.

**State 1: Belum connect (default)**

```
┌─────────────────────────────────────────────────┐
│  For Advanced Users                             │
│                                                 │
│  Want full control over your cards' underlying  │
│  technology? Set up advanced access to manage   │
│  your data independently.                       │
│                                                 │
│  [Set Up Advanced Access]                       │
└─────────────────────────────────────────────────┘
```

- Tidak ada kata "wallet", "network", "blockchain", "private key"
- Judul "For Advanced Users" — sinyal bahwa ini bukan untuk semua orang
- Deskripsi ambigu tapi tidak menyesatkan — user yang tertarik akan klik

**State 2: Sudah connect, collapsed (default setelah connect)**

```
┌─────────────────────────────────────────────────┐
│  For Advanced Users                             │
│                                                 │
│  ✓ Advanced Access Enabled                      │
│                                                 │
│  [Show Technical Details ▾]                     │
└─────────────────────────────────────────────────┘
```

- Hanya checkmark + status — tidak ada detail teknis
- "Show Technical Details" = satu-satunya jalan masuk ke istilah teknis
- User yang tidak peduli bisa ignore sepenuhnya

**State 3: Sudah connect, expanded (setelah user klik "Show Technical Details")**

```
┌─────────────────────────────────────────────────┐
│  For Advanced Users                             │
│                                                 │
│  ✓ Advanced Access Enabled                      │
│                                                 │
│  [Hide Technical Details ▴]                     │
│  ─────────────────────────────────────          │
│  Address: 0x1234...5678                         │
│  Network: Monad Testnet                         │
│                                                 │
│  [View on Block Explorer]                       │
│                                                 │
│  [Disconnect Advanced Access]                   │
└─────────────────────────────────────────────────┘
```

- Semua istilah teknis HANYA terlihat di state ini
- "Disconnect Advanced Access" — konsisten dengan framing "advanced access", bukan "disconnect wallet"

**Teknis implementasi:**
- Menggunakan `usePrivy()` dan `useWallets()` dari Privy SDK
- State collapse/expand = React state lokal (`useState<boolean>(false)`)
- Hanya render di client (SSR-safe)
- Graceful failure: kalau Privy service down, section tidak render (halaman profile tetap berfungsi normal)
- Posisi di halaman profile: BAWAH (supplementary), setelah section utama lainnya

### 2.6 File yang Dibuat/Diubah

| File | Aksi | Keterangan |
|------|------|------------|
| `@privy-io/react-auth` | Install | npm dependency |
| `viem` | Install | npm dependency (chain definition) |
| `.env.local` | Tambah | `NEXT_PUBLIC_PRIVY_APP_ID` |
| `lib/monad-testnet.ts` | **Baru** | Chain definition Monad Testnet |
| `components/PrivyWrapper.tsx` | **Baru** | PrivyProvider wrapper |
| `components/profile/PrivyWalletSection.tsx` | **Baru** | UI section di profile |
| `app/profile/page.tsx` | **Ubah** | Tambah PrivyWalletSection |
| `app/api/user/privy/route.ts` | **Baru** | API endpoint simpan privyUserId/walletAddress |
| `lib/session.ts` | Tidak berubah | — |
| `lib/wallet.ts` | Tidak berubah | — |
| `lib/crypto.ts` | Tidak berubah | — |
| `lib/blockchain.ts` | Tidak berubah | — |
| `app/api/mint/route.ts` | Tidak berubah | — |
| `app/api/mint/fulfill/route.ts` | Tidak berubah | — |
| Smart contracts | Tidak berubah | — |

---

## 3. Batasan Eksplisit

### TIDAK termasuk scope ini

| Item | Alasan |
|------|--------|
| Bayar/mint pakai Privy wallet | Core flow tetap custodial |
| Migrasi kartu dari custodial ke Privy | Terlalu kompleks, bukan fitur kritis |
| Ubah smart contract | Tidak ada kebutuhan |
| Ubah `lib/wallet.ts` | Custodial wallet logic tidak berubah |
| Ubah `lib/crypto.ts` | Encryption logic tidak berubah |
| Ubah `lib/blockchain.ts` | Transaction signing tidak berubah |
| Ubah mint/fulfill/print/redeem endpoints | Core flow tidak tersentuh |
| User migration | Tidak ada — field Privy opsional |
| Privy as sole auth (ganti Google OAuth) | Terlalu berisiko |

### Guardrails implementasi

1. **PrivyProvider HANYA wrap komponen yang butuh** — tidak wrap seluruh app, supaya halaman lain tidak terpengaruh kalau Privy bermasalah
2. **API endpoint terpisah** (`/api/user/privy`) — tidak ada logic Privy di endpoint existing
3. **Field Privy di DB bersifat opsional** — `findOne` dengan field yang tidak ada = null, tidak error
4. **Tidak ada dependency Privy di `lib/blockchain.ts`** — signing transaksi tetap pakai admin wallet

---

## 4. Testing Plan

### Test manual

| # | Test | Expected result |
|---|------|-----------------|
| 1 | Buka `/profile` tanpa login | Section "For Advanced Users" tidak render (atau redirect ke login) |
| 2 | Buka `/profile` dengan login | Section "For Advanced Users" muncul di bagian bawah halaman |
| 3 | Verifikasi: tidak ada kata "wallet", "blockchain", "network" di tampilan awal section | ✅ Clean — hanya "For Advanced Users" + "Set Up Advanced Access" |
| 4 | Klik "Set Up Advanced Access" | Privy popup muncul, user login dengan Google |
| 5 | Setelah connect — verifikasi state collapsed | Checkmark "Advanced Access Enabled" + tombol "Show Technical Details ▾". Tidak ada address/network terlihat |
| 6 | Klik "Show Technical Details ▾" | Expand: address, network, explorer link, disconnect terlihat |
| 7 | Klik "Hide Technical Details ▴" | Collapse kembali ke state checkmark saja |
| 8 | Klik "View on Block Explorer" | Buka MonadVision dengan address yang benar |
| 9 | Klik "Disconnect Advanced Access" | Section kembali ke state "belum connect" |
| 10 | Refresh halaman | State connect/disconnect persist (berdasarkan Privy session). State collapse/expand reset ke collapsed |
| 11 | Buka `/collect` setelah connect Privy | Pack purchase tetap berfungsi normal (custodial wallet) |
| 12 | Buka `/collection` setelah connect Privy | Kartu tetap muncul normal (tidak terpengaruh) |

### Graceful failure tests

| # | Test | Expected result |
|---|------|-----------------|
| 13 | `NEXT_PUBLIC_PRIVY_APP_ID` tidak diset | Section "For Advanced Users" tidak render, halaman profile tetap berfungsi |
| 14 | Privy service down | Section tidak render atau tampilkan pesan "Advanced access is temporarily unavailable. Try again later." |
| 15 | Network error saat connect | Error message di section, tidak crash halaman |

---

## 5. Estimasi Waktu

| Task | Estimasi |
|------|----------|
| Setup Privy dashboard (App ID, config) | 30 menit |
| Install dependencies + env config | 15 menit |
| `lib/monad-testnet.ts` + `PrivyWrapper.tsx` | 30 menit |
| `components/profile/PrivyWalletSection.tsx` | 1-2 jam |
| API endpoint `/api/user/privy` | 30 menit |
| Integrasi di `/profile/page.tsx` | 30 menit |
| Testing manual (13 test cases) | 1 jam |
| **Total** | **~4-5 jam (0.5-0.75 hari)** |

Ini estimasi untuk developer yang belum pernah pakai Privy SDK. Kalau sudah familiar, bisa lebih cepat.

---

## 6. Keputusan Desain (Resolved)

| # | Pertanyaan | Keputusan | Alasan |
|---|-----------|-----------|--------|
| 1 | Privy App ID | **Buat baru** di https://dashboard.privy.io | Project baru, tidak reuse dari project lain |
| 2 | Nama section di UI | **"For Advanced Users"** | Menghindari kata "wallet" di judul. Konsisten dengan hide-the-blockchain philosophy |
| 3 | Posisi di /profile | **Di BAWAH (supplementary)** | Bukan fitur utama — user yang tidak peduli tidak perlu melihatnya |
| 4 | Badge/label penjelasan | **YA — progressive disclosure** | Semua istilah teknis disembunyikan di balik "Show Technical Details". User awam tidak pernah melihat "wallet", "network", "blockchain" kecuali mereka sengaja expand |
| 5 | Export flow | **Tidak tersedia** di v1.93.0 (`useExportWallet` baru ada di v2+). Wallet address tetap bisa dilihat dan diverifikasi via block explorer. | Pin ke v1.93.0 karena dependency tree v2+/v3+ tidak kompatibel dengan Turbopack Next.js 16 |

---

*Spec ini siap untuk review. Setelah di-approve, masuk fase implementasi.*
