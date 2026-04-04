import { supabase } from '@/integrations/supabase/client';

const STORAGE_URL = import.meta.env.VITE_SUPABASE_URL;
const STORAGE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * Upload a file to Storage with progress tracking via XMLHttpRequest.
 */
export async function uploadWithProgress(
  bucket: string,
  path: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const uploadUrl = `${STORAGE_URL.replace(/\/$/, '')}/storage/v1/object/${bucket}/${path}`;

  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path);
        resolve(publicUrl);
        return;
      }

      try {
        const err = JSON.parse(xhr.responseText);
        reject(new Error(err.message || err.error || `Upload failed (${xhr.status})`));
      } catch {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

    xhr.open('POST', uploadUrl, true);

    if (STORAGE_ANON_KEY) {
      xhr.setRequestHeader('apikey', STORAGE_ANON_KEY);
      xhr.setRequestHeader('Authorization', `Bearer ${token || STORAGE_ANON_KEY}`);
    } else if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    if (file.type) {
      xhr.setRequestHeader('Content-Type', file.type);
    }

    xhr.setRequestHeader('x-upsert', 'true');
    xhr.send(file);
  });
}

/** Format bytes to human-readable string */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
