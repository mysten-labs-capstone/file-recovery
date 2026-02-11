import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { sha256 } from '@noble/hashes/sha2.js';
import { mnemonicToEntropy, validateMnemonic } from '@scure/bip39';
import { wordlist as englishWordlist } from '@scure/bip39/wordlists/english.js';
import { webcrypto } from 'node:crypto';
const crypto = webcrypto as unknown as Crypto;

const SUI_DERIVATION_DOMAIN = 'infinity-storage-sui-identity-v1';
const KEY_LENGTH = 32;

export function deriveMasterKey(mnemonic: string): Uint8Array {
  if (!validateMnemonic(mnemonic, englishWordlist)) {
    throw new Error('Invalid recovery phrase');
  }
  
  const entropyBytes = mnemonicToEntropy(mnemonic, englishWordlist);
  const keyBytes = new Uint8Array(KEY_LENGTH);
  keyBytes.set(entropyBytes.slice(0, KEY_LENGTH));
  
  return keyBytes;
}

export function deriveSuiKeypair(masterKey: Uint8Array): Ed25519Keypair {
  const domainBytes = new TextEncoder().encode(SUI_DERIVATION_DOMAIN);
  const combined = new Uint8Array(masterKey.length + domainBytes.length);
  combined.set(masterKey);
  combined.set(domainBytes, masterKey.length);
  const seed = sha256(combined);
  return Ed25519Keypair.fromSecretKey(seed);
}

export function getSuiAddress(masterKey: Uint8Array): string {
  return deriveSuiKeypair(masterKey).toSuiAddress();
}

function hexToBytes(hex: string): Uint8Array {
  const cleaned = hex.replace(/^0x/, '');
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleaned.substr(i * 2, 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function deriveFileKey(
  masterKey: Uint8Array,
  fileId: Uint8Array,
): Promise<CryptoKey> {
  const masterKeyMaterial = await crypto.subtle.importKey(
    'raw',
    masterKey,
    'HKDF',
    false,
    ['deriveKey'],
  );
  
  const info = new TextEncoder().encode('file-encryption-v1');  
  const fileKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: fileId,
      info,
    },
    masterKeyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  
  return fileKey;
}

/**
 * Blob format: [fileId (32)][IV (12)][ciphertext + auth tag]
 */
export async function decryptBlob(
  encryptedData: Uint8Array,
  masterKey: Uint8Array,
): Promise<Uint8Array | null> {
  try {
    if (encryptedData.length < 60) {
      console.error('[decryptBlob] Data too small:', encryptedData.length);
      return null;
    }
    const fileId = encryptedData.slice(0, 32);
    const iv = encryptedData.slice(32, 44);
    const ciphertext = encryptedData.slice(44);
    
    const fileKey = await deriveFileKey(masterKey, fileId);
    
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      fileKey,
      ciphertext,
    );
    
    return new Uint8Array(plaintext);
  } catch (err) {
    console.error('[decryptBlob] Decryption failed:', err);
    return null;
  }
}
