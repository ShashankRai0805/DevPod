import fs from 'fs/promises';
import path from 'path';
import { uploadToS3 } from './aws';

const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/workspace';

interface FileNode {
  name: string;
  type: 'file' | 'folder';
  children?: FileNode[];
}

export async function fetchDir(dirPath: string): Promise<FileNode[]> {
  const fullPath = path.join(WORKSPACE_DIR, dirPath);
  
  try {
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    return entries.map((entry): FileNode => ({
      name: entry.name,
      type: entry.isDirectory() ? 'folder' : 'file',
    })).sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'folder' ? -1 : 1;
    });
  } catch (err) {
    console.error(`Error reading dir ${dirPath}:`, err);
    return [];
  }
}

export async function fetchContent(filePath: string): Promise<string> {
  const fullPath = path.join(WORKSPACE_DIR, filePath);
  try {
    return await fs.readFile(fullPath, 'utf-8');
  } catch (err) {
    console.error(`Error reading file ${filePath}:`, err);
    throw err;
  }
}

// Simple debouncer for S3 upload
const uploadTimeouts = new Map<string, NodeJS.Timeout>();

export async function updateContent(filePath: string, content: string): Promise<void> {
  const fullPath = path.join(WORKSPACE_DIR, filePath);
  try {
    // Ensure parent directories exist
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
    
    // Debounce S3 upload (2 seconds)
    if (uploadTimeouts.has(filePath)) {
      clearTimeout(uploadTimeouts.get(filePath)!);
    }
    
    const timeout = setTimeout(() => {
      uploadToS3(fullPath, filePath);
      uploadTimeouts.delete(filePath);
    }, 2000);
    
    uploadTimeouts.set(filePath, timeout);

  } catch (err) {
    console.error(`Error writing file ${filePath}:`, err);
    throw err;
  }
}

export async function createFile(filePath: string): Promise<void> {
  const fullPath = path.join(WORKSPACE_DIR, filePath);
  try {
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    // create empty file
    await fs.writeFile(fullPath, '', 'utf-8');
    uploadToS3(fullPath, filePath);
  } catch (err) {
    console.error(`Error creating file ${filePath}:`, err);
    throw err;
  }
}

export async function createFolder(folderPath: string): Promise<void> {
  const fullPath = path.join(WORKSPACE_DIR, folderPath);
  try {
    await fs.mkdir(fullPath, { recursive: true });
    // S3 doesn't really have folders, but we can create a .keep file to force it to exist
    const keepFilePath = path.join(fullPath, '.keep');
    await fs.writeFile(keepFilePath, '', 'utf-8');
    uploadToS3(keepFilePath, path.join(folderPath, '.keep'));
  } catch (err) {
    console.error(`Error creating folder ${folderPath}:`, err);
    throw err;
  }
}
