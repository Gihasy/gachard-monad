import { getCollection } from "./mongodb";
import { generateCustodialWallet } from "./wallet";
import { encrypt } from "./crypto";
import { OAuth2Client } from "google-auth-library";

interface GoogleUserInfo {
  sub: string;
  email: string;
  name?: string;
}

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Verify Google OAuth ID token using google-auth-library.
 * Performs full cryptographic signature verification against Google's public keys.
 */
export async function verifyGoogleToken(token: string): Promise<GoogleUserInfo> {
  const ticket = await googleClient.verifyIdToken({
    idToken: token,
    audience: process.env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  if (!payload || !payload.sub || !payload.email) {
    throw new Error("Missing required fields in token");
  }

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
  };
}

/**
 * Get existing user or create new one with custodial wallet.
 * Private key is encrypted with AES-256-GCM before storage (ENCRYPTION_SECRET_KEY env var).
 */
export async function getOrCreateUser(googleUser: GoogleUserInfo) {
  const usersCollection = await getCollection("users");

  // Check if user exists
  const existingUser = await usersCollection.findOne({
    googleId: googleUser.sub,
  });
  if (existingUser) {
    return existingUser;
  }

  // Create new user with custodial wallet
  const wallet = generateCustodialWallet();
  const username = googleUser.email.split("@")[0];

  const userData = {
    email: googleUser.email,
    username,
    googleId: googleUser.sub,
    walletAddress: wallet.address,
    walletPrivateKey: encrypt(wallet.privateKey),
    createdAt: new Date().toISOString(),
  };

  const result = await usersCollection.insertOne(userData);
  return { ...userData, _id: result.insertedId };
}
