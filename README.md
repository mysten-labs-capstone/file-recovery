# File Recovery CLI

Standalone tool to recover encrypted files from Walrus blockchain storage using only your 12-word recovery phrase.

## Supported File Types

All file types allowed by infinity-storage are supported:
- **Documents**: `.pdf`, `.txt`, `.json`
- **Images**: `.jpg`, `.png`, `.gif`, `.webp`
- **Videos**: `.mp4`, `.webm`
- **Audio**: `.mp3`, `.wav`
- **Archives**: `.zip`, `.tar`
- **Office**: `.docx`, `.xlsx`, `.pptx` (auto-detected from zip structure)

## Known Limitations

** Original filenames are NOT recoverable** because:
- Filenames are stored in the centralized database, not on the blockchain
- The smart contract only stores: `fileId`, `blobId`, `encrypted`, `expirationEpoch`
- Recovered files are named: `recovered-01.pdf`, `recovered-02.pptx`, etc.

## Setup

```bash
npm install
```

No `.env` file needed — all configuration values (package ID, RPC URL, Walrus gateway) are public and hardcoded as defaults. A `.env` file is only needed if you want to override them (e.g., pointing to mainnet).

## Usage

### Recover All Files

```bash
npm run recover <your twelve recovery phrases go here now in order please thank you>
```

### What Happens
**Saves to** `recovered/` with proper extensions!

## Output
Files are saved to `./recovered/` as:
- `recovered-01.pdf`
- `recovered-02.pptx`
- `recovered-03.jpg`
- etc.

Extensions are auto-detected from file content, not stored metadata.
