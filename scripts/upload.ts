#!/usr/bin/env bun
/**
 * Upload script for Cloudflare R2
 *
 * Uploads Electron app builds to R2 for auto-update.
 *
 * Usage:
 *   bun run scripts/upload.ts --electron [--latest] [--script]
 *
 * Options:
 *   --electron  Upload the Electron DMG/EXE builds
 *   --latest    Update the /electron/latest file
 *   --script    Upload install-app.sh script
 *
 * Environment variables (from .env):
 *   R2_ACCOUNT_ID           - Cloudflare account ID
 *   R2_ACCESS_KEY_ID        - R2 API token access key
 *   R2_SECRET_ACCESS_KEY    - R2 API token secret key
 *   R2_BUCKET_NAME          - R2 bucket name
 */

import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { createHash } from 'crypto';
import { readFileSync, existsSync, statSync, createReadStream } from 'fs';
import { join, basename } from 'path';

// Parse arguments
const args = process.argv.slice(2);
const uploadElectron = args.includes('--electron');
const updateLatest = args.includes('--latest');
const uploadScript = args.includes('--script');

if (!uploadElectron && !uploadScript) {
  console.log('Usage: bun run scripts/upload.ts --electron [--latest] [--script]');
  process.exit(1);
}

// Load environment variables
const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME;

if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
  console.error('Missing R2 credentials. Set these environment variables:');
  console.error('  R2_ACCOUNT_ID');
  console.error('  R2_ACCESS_KEY_ID');
  console.error('  R2_SECRET_ACCESS_KEY');
  console.error('  R2_BUCKET_NAME');
  process.exit(1);
}

// Initialize S3 client for R2 with retry configuration
const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
  maxAttempts: 10,
  requestHandler: {
    requestTimeout: 300000, // 5 minutes per request
    httpsAgent: {
      maxSockets: 50,
      keepAlive: true,
    },
  } as any,
});

// Paths
const rootDir = join(import.meta.dir, '..');
const electronDir = join(rootDir, 'apps', 'electron');
const releaseDir = join(electronDir, 'release');

// Read version from package.json
function getVersion(): string {
  const pkgPath = join(electronDir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  return pkg.version;
}

// Calculate SHA256 hash of a file
function calculateSha256(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

// Get file size in bytes
function getFileSize(filePath: string): number {
  return statSync(filePath).size;
}

// Upload a file to R2 using multipart upload for large files
async function uploadFile(localPath: string, remotePath: string, contentType?: string): Promise<void> {
  const fileName = basename(localPath);
  const fileSize = getFileSize(localPath);
  const fileSizeMB = (fileSize / 1024 / 1024).toFixed(2);

  console.log(`Uploading ${fileName} to ${remotePath} (${fileSizeMB} MB)...`);

  // Use multipart upload for files > 10MB
  if (fileSize > 10 * 1024 * 1024) {
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: bucketName,
        Key: remotePath,
        Body: createReadStream(localPath),
        ContentType: contentType || 'application/octet-stream',
      },
      // 10MB part size
      partSize: 10 * 1024 * 1024,
      // Max 4 concurrent uploads
      queueSize: 4,
      leavePartsOnError: false,
    });

    // Progress tracking
    let lastProgress = 0;
    upload.on('httpUploadProgress', (progress) => {
      if (progress.loaded && progress.total) {
        const percent = Math.round((progress.loaded / progress.total) * 100);
        if (percent >= lastProgress + 10) {
          console.log(`  ... ${percent}% uploaded`);
          lastProgress = percent;
        }
      }
    });

    await upload.done();
  } else {
    // Small files use simple upload
    const content = readFileSync(localPath);
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: remotePath,
        Body: content,
        ContentType: contentType || 'application/octet-stream',
      })
    );
  }

  console.log(`  ✓ Uploaded ${fileName} (${fileSizeMB} MB)`);
}

// Upload JSON content to R2
async function uploadJson(remotePath: string, data: object): Promise<void> {
  const content = JSON.stringify(data, null, 2);

  console.log(`Uploading ${remotePath}...`);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: remotePath,
      Body: content,
      ContentType: 'application/json',
    })
  );

  console.log(`  ✓ Uploaded ${remotePath}`);
}

// Build platform manifest entry (must match shared/version/manifest.ts)
interface BinaryInfo {
  url: string;
  size: number;
  sha256: string;
}

interface VersionManifest {
  version: string;
  build_time: string;
  build_timestamp: number;
  binaries: Record<string, BinaryInfo>;
}

// Main upload logic
async function main() {
  const version = getVersion();
  console.log(`\n=== Uploading version ${version} to R2 ===\n`);

  if (uploadElectron) {
    // Find all built artifacts
    const artifacts: { file: string; platform: string; ext: string }[] = [];

    // macOS DMGs
    const macArmDmg = join(releaseDir, 'Agent-Operator-arm64.dmg');
    const macX64Dmg = join(releaseDir, 'Agent-Operator-x64.dmg');

    if (existsSync(macArmDmg)) {
      artifacts.push({ file: macArmDmg, platform: 'darwin-arm64', ext: 'dmg' });
    }
    if (existsSync(macX64Dmg)) {
      artifacts.push({ file: macX64Dmg, platform: 'darwin-x64', ext: 'dmg' });
    }

    // Windows EXEs
    const winX64Exe = join(releaseDir, 'Agent-Operator-x64.exe');
    const winArm64Exe = join(releaseDir, 'Agent-Operator-arm64.exe');

    if (existsSync(winX64Exe)) {
      artifacts.push({ file: winX64Exe, platform: 'win32-x64', ext: 'exe' });
    }
    if (existsSync(winArm64Exe)) {
      artifacts.push({ file: winArm64Exe, platform: 'win32-arm64', ext: 'exe' });
    }

    // Linux AppImages (electron-builder uses x86_64 naming)
    const linuxX64AppImage = join(releaseDir, 'Agent-Operator-x86_64.AppImage');
    if (existsSync(linuxX64AppImage)) {
      artifacts.push({ file: linuxX64AppImage, platform: 'linux-x64', ext: 'AppImage' });
    }

    if (artifacts.length === 0) {
      console.error('No artifacts found in release directory');
      console.error(`Expected files in: ${releaseDir}`);
      process.exit(1);
    }

    console.log(`Found ${artifacts.length} artifact(s) to upload\n`);

    // Build manifest
    const now = new Date();
    const manifest: VersionManifest = {
      version,
      build_time: now.toISOString(),
      build_timestamp: now.getTime(),
      binaries: {},
    };

    // Upload each artifact
    for (const artifact of artifacts) {
      const remotePath = `downloads/${version}/${basename(artifact.file)}`;
      await uploadFile(artifact.file, remotePath);

      // Add to manifest
      manifest.binaries[artifact.platform] = {
        url: `https://download.aicowork.chat/${remotePath}`,
        size: getFileSize(artifact.file),
        sha256: calculateSha256(artifact.file),
      };
    }

    // Upload manifest
    console.log('\nUploading manifest...');
    await uploadJson(`electron/${version}/manifest.json`, manifest);

    // Update latest pointer if requested
    if (updateLatest) {
      console.log('\nUpdating latest version pointer...');
      await uploadJson('electron/latest', { version });
    }

    console.log('\n=== Electron upload complete ===');
    console.log(`Version: ${version}`);
    console.log(`Platforms: ${Object.keys(manifest.binaries).join(', ')}`);
    if (updateLatest) {
      console.log('Latest pointer: updated');
    }
  }

  if (uploadScript) {
    const scriptPath = join(rootDir, 'scripts', 'install-app.sh');
    if (existsSync(scriptPath)) {
      await uploadFile(scriptPath, 'install-app.sh', 'text/x-shellscript');
    } else {
      console.error(`Script not found: ${scriptPath}`);
    }
  }

  console.log('\nDone!');
}

main().catch((error) => {
  console.error('Upload failed:', error);
  process.exit(1);
});
