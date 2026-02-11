import { SuiClient } from '@mysten/sui/client';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { deriveMasterKey, getSuiAddress, bytesToHex } from './crypto.js';
import { findUserRegistry, getUserFiles } from './blockchain.js';
import { downloadBlob } from './walrus.js';
import { decryptBlob } from './crypto.js';

function detectExtension(data: Uint8Array): string {
  if (data.length < 12) return '.bin';

  if (data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46) return '.pdf';

  if (data[0] === 0x50 && data[1] === 0x4B && data[2] === 0x03 && data[3] === 0x04) {
    const scanSize = Math.min(20000, data.length);
    const textSlice = new TextDecoder('ascii', { fatal: false }).decode(data.slice(0, scanSize));
    if (textSlice.includes('ppt/'))          return '.pptx';
    if (textSlice.includes('word/'))         return '.docx';
    if (textSlice.includes('xl/'))           return '.xlsx';
    return '.zip';
  }

  // images! 
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47 &&
      data[4] === 0x0D && data[5] === 0x0A && data[6] === 0x1A && data[7] === 0x0A) return '.png';
  if (data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF) return '.jpg';
  if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46 &&
      data[3] === 0x38 && (data[4] === 0x37 || data[4] === 0x39) && data[5] === 0x61) return '.gif';
  if (data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46 &&
      data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50) return '.webp';

  // video!
  if (data.length >= 12 && data[4] === 0x66 && data[5] === 0x74 && data[6] === 0x79 && data[7] === 0x70) {
    const brand = String.fromCharCode(data[8], data[9], data[10], data[11]);
    if (brand.startsWith('M4V') || brand.startsWith('m4v')) return '.m4v';
    if (brand.startsWith('qt')) return '.mov';
    return '.mp4';
  }
  if (data[0] === 0x1A && data[1] === 0x45 && data[2] === 0xDF && data[3] === 0xA3) {
    const scanSize = Math.min(100, data.length);
    const textSlice = new TextDecoder('ascii', { fatal: false }).decode(data.slice(0, scanSize));
    if (textSlice.includes('webm')) return '.webm';
    if (textSlice.includes('matroska')) return '.mkv';
    return '.webm'; // default to webm for EBML files
  }
  
  // audio
  if ((data[0] === 0x49 && data[1] === 0x44 && data[2] === 0x33) || // ID3
      (data[0] === 0xFF && (data[1] & 0xE0) === 0xE0)) return '.mp3'; // MPEG sync
  if (data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46 &&
      data[8] === 0x57 && data[9] === 0x41 && data[10] === 0x56 && data[11] === 0x45) return '.wav';
  if (data.length > 262 && 
      data[257] === 0x75 && data[258] === 0x73 && data[259] === 0x74 && 
      data[260] === 0x61 && data[261] === 0x72) return '.tar';
  
      if ((data[0] === 0x7B || data[0] === 0x5B)) {
    try {
      const sample = new TextDecoder('utf-8').decode(data.slice(0, Math.min(1024, data.length)));
      JSON.parse(sample);
      return '.json';
    } catch {
      // Not valid JSON, uuhhhh we'll leave this for temp...
    }
  }
  const sample = data.slice(0, Math.min(512, data.length));
  const isText = sample.every(b => 
    (b >= 0x20 && b <= 0x7E) || 
    b === 0x0A || b === 0x0D || b === 0x09 || 
    b >= 0x80 
  );
  if (isText) return '.txt';
  return '.bin';
}

const PACKAGE_ID = '0xa10d19a3ee48d91932ca18fe9291c839a2afbd8c9ffe9425611475ef36216178';
const RPC_URL = 'https://fullnode.testnet.sui.io:443';
const WALRUS_GATEWAY = 'https://aggregator.walrus-testnet.walrus.space';
const OUTPUT_DIR = './recovered'; // user's files will be stored here!

async function main() {
  const args = process.argv.slice(2);
  const recoveryPhrase = args.join(' ');

  if (!recoveryPhrase || args.length !== 12) {
    console.error(' Usage: npm run recover <your twelve recovery phrases go here now in order please thank you>');
    process.exit(1);
  }

  console.log('\n File Recovery Tool');
  console.log('━'.repeat(80));
  console.log(` Package ID: ${PACKAGE_ID}`);
  console.log(` RPC URL: ${RPC_URL}`);
  console.log(` Walrus Gateway: ${WALRUS_GATEWAY}\n`);

  try {
    console.log(' Deriving keys from recovery phrases provided...');
    const masterKey = deriveMasterKey(recoveryPhrase);
    const userAddress = getSuiAddress(masterKey);

    const client = new SuiClient({ url: RPC_URL });
    console.log(' Searching for FileRegistry on blockchain...');
    const registryId = await findUserRegistry(client, PACKAGE_ID, userAddress);
    
    if (!registryId) {
      console.log('\n No FileRegistry found for this recovery phrase');
      console.log('   - The blockchain-registry sync hasn\'t completed yet, please wait a moment');
      process.exit(0);
    }

    console.log(`  Found registry tied to your account\n`);
    console.log('  Fetching file list from registry...');
    const files = await getUserFiles(client, registryId);
    
    if (files.length === 0) {
      console.log('   No files registered yet\n');
      process.exit(0);
    }

    console.log(`  Found ${files.length} file(s) tied to your SUI address.\n`);

    if (!existsSync(OUTPUT_DIR)) {
      mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    console.log(' Downloading and decrypting files...\n');
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileIdHex = Array.isArray(file.fileId)
        ? bytesToHex(new Uint8Array(file.fileId))
        : file.fileId;

      console.log(`[${i + 1}/${files.length}] Processing file:`);
      console.log(`   Blob ID: ${file.blobId}`);

      const encryptedData = await downloadBlob(file.blobId, WALRUS_GATEWAY);
      if (!encryptedData) {
        console.log(`    Download failed\n`);
        failCount++;
        continue;
      }
      
      console.log(`    Downloaded ${encryptedData.length} bytes`);

      if (file.encrypted) {
        console.log(`   Decrypting...`);
        const decryptedData = await decryptBlob(encryptedData, masterKey);
        
        if (!decryptedData) {
          console.log(`    Decryption failed\n`);
          failCount++;
          continue;
        }
        
        const ext = detectExtension(decryptedData);
        const filename = `recovered-${String(i + 1).padStart(2, '0')}${ext}`;
        const filepath = join(OUTPUT_DIR, filename);
        writeFileSync(filepath, decryptedData);
        console.log(`    Successfully decrypted and saved: ${filename} (${(decryptedData.length / 1024).toFixed(1)} KB)`);
        successCount++;
      } else {
        const ext = detectExtension(encryptedData);
        const filename = `recovered-${String(i + 1).padStart(2, '0')}${ext}`;
        const filepath = join(OUTPUT_DIR, filename);
        writeFileSync(filepath, encryptedData);
        console.log(`    Successfully Saved: ${filename} (${(encryptedData.length / 1024).toFixed(1)} KB)`);
        successCount++;
      }
      console.log('');
    }

    console.log('━'.repeat(80));
    console.log(`\n Recovery complete!`);
    console.log(`    Success: ${successCount} file(s)`);
    if (failCount > 0) {
      console.log(`    Failed: ${failCount} file(s)`);
    }
    console.log(`    Files saved to: ${OUTPUT_DIR}/\n`);

  } catch (error: any) {
    console.error('\n Error:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);
