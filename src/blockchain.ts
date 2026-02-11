import { SuiClient } from '@mysten/sui/client';
import { getSuiAddress } from './crypto.js';

export interface FileMetadata {
  fileId: Uint8Array | string;
  blobId: string;
  encrypted: boolean;
  expirationEpoch: number;
}

export async function findUserRegistry(
  client: SuiClient,
  packageId: string,
  userAddress: string,
): Promise<string | null> {
  try {
    let allEvents: any[] = [];
    let cursor: string | null | undefined = null;
    let hasNextPage = true;

    for (let i = 0; i < 5 && hasNextPage; i++) {
      const result = await client.queryEvents({
        query: { 
          MoveEventType: `${packageId}::registry::RegistryCreated` 
        },
        cursor,
        limit: 50,
      });

      allEvents = allEvents.concat(result.data);
      hasNextPage = result.hasNextPage;
      cursor = result.nextCursor;

      if (!hasNextPage) break;
    }

    for (const event of allEvents) {
      const parsedJson = event.parsedJson as any;
      if (parsedJson?.owner === userAddress) {
        return parsedJson.registry_id;
      }
    }

    return null;
  } catch (error) {
    console.error('[findUserRegistry] Error:', error);
    return null;
  }
}

export async function getUserFiles(
  client: SuiClient,
  registryId: string,
): Promise<FileMetadata[]> {
  try {
    const registry = await client.getObject({
      id: registryId,
      options: { showContent: true }
    });
    
    if (!registry.data?.content || registry.data.content.dataType !== 'moveObject') {
      return [];
    }
    
    const fields = registry.data.content.fields as any;
    const filesMap = fields?.files?.fields?.contents;
    
    if (!Array.isArray(filesMap)) {
      return [];
    }
    
    return filesMap.map((entry: any) => {
      const fileIdBytes = entry.fields.key;
      const metadata = entry.fields.value.fields;

      const blobIdBytes = metadata.blob_id;
      const blobId = Array.isArray(blobIdBytes) 
        ? String.fromCharCode(...blobIdBytes)
        : blobIdBytes;

    return {
        fileId: fileIdBytes,
        blobId,
        encrypted: metadata.encrypted,
        expirationEpoch: metadata.expiration_epoch,
      };
    });
  } catch (error) {
    console.error('[getUserFiles] Error:', error);
    return [];
  }
}
