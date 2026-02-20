/**
 * Feishu Media Handling
 *
 * Upload images, files, and audio to Feishu.
 * Download media from Feishu messages.
 * Adapted from LobsterAI feishuMedia.ts.
 */

import { Readable } from 'stream';
import { existsSync, statSync, createReadStream } from 'fs';
import { extname, basename } from 'path';

// ============================================================
// Types
// ============================================================

export type FeishuFileType = 'opus' | 'mp4' | 'pdf' | 'doc' | 'xls' | 'ppt' | 'stream';

export interface FeishuImageUploadResult {
  success: boolean;
  imageKey?: string;
  error?: string;
}

export interface FeishuFileUploadResult {
  success: boolean;
  fileKey?: string;
  error?: string;
}

// ============================================================
// Constants
// ============================================================

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.ico', '.tiff'];
const AUDIO_EXTENSIONS = ['.opus', '.ogg', '.mp3', '.wav', '.m4a', '.aac', '.amr'];
const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30MB Feishu limit

// ============================================================
// Upload Functions
// ============================================================

/**
 * Upload image to Feishu
 * @param client - Feishu Lark REST client
 * @param image - Buffer or file path
 * @param imageType - 'message' for chat images, 'avatar' for profile pictures
 */
export async function uploadImageToFeishu(
  client: any,
  image: Buffer | string,
  imageType: 'message' | 'avatar' = 'message'
): Promise<FeishuImageUploadResult> {
  try {
    // Validate file size
    if (typeof image === 'string') {
      const stats = statSync(image);
      if (stats.size > MAX_FILE_SIZE) {
        return {
          success: false,
          error: `Image too large: ${(stats.size / 1024 / 1024).toFixed(1)}MB (limit 30MB)`,
        };
      }
    } else if (image.length > MAX_FILE_SIZE) {
      return {
        success: false,
        error: `Image too large: ${(image.length / 1024 / 1024).toFixed(1)}MB (limit 30MB)`,
      };
    }

    const imageStream =
      typeof image === 'string' ? createReadStream(image) : Readable.from(image);

    const response = await client.im.image.create({
      data: { image_type: imageType, image: imageStream as any },
    });

    const r = response as any;
    if (r.code !== undefined && r.code !== 0) {
      return { success: false, error: `Feishu error: ${r.msg || `code ${r.code}`}` };
    }

    const imageKey = r.image_key ?? r.data?.image_key;
    if (!imageKey) return { success: false, error: 'No image_key returned' };

    return { success: true, imageKey };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Upload file to Feishu
 * @param client - Feishu Lark REST client
 * @param file - Buffer or file path
 * @param fileName - Display file name
 * @param fileType - Feishu file type classification
 */
export async function uploadFileToFeishu(
  client: any,
  file: Buffer | string,
  fileName: string,
  fileType: FeishuFileType
): Promise<FeishuFileUploadResult> {
  try {
    if (typeof file === 'string') {
      const stats = statSync(file);
      if (stats.size > MAX_FILE_SIZE) {
        return {
          success: false,
          error: `File too large: ${(stats.size / 1024 / 1024).toFixed(1)}MB (limit 30MB)`,
        };
      }
    } else if (file.length > MAX_FILE_SIZE) {
      return {
        success: false,
        error: `Buffer too large: ${(file.length / 1024 / 1024).toFixed(1)}MB (limit 30MB)`,
      };
    }

    const fileStream =
      typeof file === 'string' ? createReadStream(file) : Readable.from(file);

    const response = await client.im.file.create({
      data: { file_type: fileType, file_name: fileName, file: fileStream as any },
    });

    const r = response as any;
    if (r.code !== undefined && r.code !== 0) {
      return { success: false, error: `Feishu error: ${r.msg || `code ${r.code}`}` };
    }

    const fileKey = r.file_key ?? r.data?.file_key;
    if (!fileKey) return { success: false, error: 'No file_key returned' };

    return { success: true, fileKey };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================
// Utility Functions
// ============================================================

/**
 * Detect Feishu file type from file extension
 */
export function detectFeishuFileType(fileName: string): FeishuFileType {
  const ext = extname(fileName).toLowerCase();
  switch (ext) {
    case '.opus':
    case '.ogg':
      return 'opus';
    case '.mp4':
    case '.mov':
    case '.avi':
      return 'mp4';
    case '.pdf':
      return 'pdf';
    case '.doc':
    case '.docx':
      return 'doc';
    case '.xls':
    case '.xlsx':
      return 'xls';
    case '.ppt':
    case '.pptx':
      return 'ppt';
    default:
      return 'stream';
  }
}

/**
 * Check if file path points to an image
 */
export function isImagePath(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
}

/**
 * Check if file path points to an audio file
 */
export function isAudioPath(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return AUDIO_EXTENSIONS.includes(ext);
}

/**
 * Resolve file path (handle file:// protocol and ~ home directory)
 */
export function resolveMediaPath(rawPath: string): string {
  let resolved = rawPath;

  // Handle file:// protocol
  if (resolved.startsWith('file:///')) {
    resolved = decodeURIComponent(resolved.replace('file://', ''));
  }

  // Handle ~ home directory
  if (resolved.startsWith('~')) {
    resolved = resolved.replace('~', process.env.HOME || '');
  }

  return resolved;
}
