/**
 * One Privy config for every place the SDK is mounted (ADR-028, ADR-031).
 *
 * Privy appears as three separate islands — the profile section, /wallet and
 * /wallet/move — each with its own provider so the SDK never loads on a
 * consumer surface. That meant this object was written out three times and
 * could drift; a chain or login method changed in one place and not the others
 * would be a real bug, not a cosmetic one.
 *
 * What is deliberately NOT here: an `appearance` block. The SDK's types accept
 * one (`theme`, `accentColor`, `logo`, `landingHeader`) and it looks like the
 * way to make Privy's dialogs match the Gachard palette. Against v3.44.0 and
 * this app id it changes nothing. Tested twice from a clean build: `theme` set
 * to the app background and then to the literal "dark" both left the modal
 * white, and `landingHeader` left the default "Log in or sign up" in place.
 * `loginMethods` set to ["email"] still rendered the Google button, which is
 * the part that matters — it is not that appearance alone is ignored, it is
 * that this object does not drive the modal at all. Privy renders it from the
 * app's Dashboard settings.
 *
 * So the fields below are the ones that govern SDK behaviour rather than the
 * dialogs. How Privy's own UI looks is changed at dashboard.privy.io, not
 * here, and adding an `appearance` block back would be config that silently
 * does nothing.
 */
import type { PrivyClientConfig } from "@privy-io/react-auth";
import { monadTestnet } from "./monad-testnet";

export const privyConfig: PrivyClientConfig = {
  defaultChain: monadTestnet,
  supportedChains: [monadTestnet],
  loginMethods: ["google", "email"],
  embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
};
