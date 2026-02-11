import fetch from 'node-fetch';

export async function downloadBlob(
  blobId: string,
  gatewayUrl: string,
): Promise<Uint8Array | null> {
  try {
    const url = `${gatewayUrl}/v1/blobs/${blobId}`;
    console.log(`  Downloading from: ${url}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`   HTTP ${response.status}: ${response.statusText}`);
      return null;
    }
    
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch (error) {
    console.error(`   Download failed:`, error);
    return null;
  }
}
