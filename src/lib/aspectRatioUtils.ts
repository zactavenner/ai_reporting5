/**
 * Detects and categorizes the aspect ratio of an image or video file
 */
export async function detectAspectRatio(file: File): Promise<string> {
  return new Promise((resolve) => {
    if (file.type.startsWith('image/')) {
      const img = new Image();
      img.onload = () => {
        const ratio = img.width / img.height;
        resolve(categorizeRatio(ratio));
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => {
        resolve('1:1'); // Default on error
      };
      img.src = URL.createObjectURL(file);
    } else if (file.type.startsWith('video/')) {
      const video = document.createElement('video');
      video.onloadedmetadata = () => {
        const ratio = video.videoWidth / video.videoHeight;
        resolve(categorizeRatio(ratio));
        URL.revokeObjectURL(video.src);
      };
      video.onerror = () => {
        resolve('1:1'); // Default on error
      };
      video.src = URL.createObjectURL(file);
    } else {
      resolve('1:1'); // Default for non-media (copy)
    }
  });
}

/**
 * Categorizes a numeric aspect ratio into a standard format string
 */
export function categorizeRatio(ratio: number): string {
  if (ratio >= 1.7) return '16:9';     // Landscape (1.78 is exactly 16:9)
  if (ratio > 1.1 && ratio < 1.7) return '16:9'; // Wide landscape
  if (ratio >= 0.9 && ratio <= 1.1) return '1:1'; // Square
  if (ratio >= 0.7 && ratio < 0.9) return '4:5';  // Portrait feed format (0.8 is exactly 4:5)
  return '9:16';                        // Tall portrait (stories/reels format, 0.5625)
}

/**
 * Checks if the container aspect ratio is compatible with the content aspect ratio
 * for object-cover without significant cropping
 */
export function aspectsMatch(containerAspect: string, contentAspect: string): boolean {
  // Same aspect always matches
  if (containerAspect === contentAspect) return true;
  
  // Feed containers (4:5) work well with most portrait & square content
  if (containerAspect === '4:5') {
    return ['1:1', '4:5', '9:16'].includes(contentAspect);
  }
  
  // Stories containers (9:16) should cover-fill with any content
  // Real IG/FB stories always fill the frame, cropping as needed
  if (containerAspect === '9:16') {
    return true;
  }
  
  // Landscape containers (16:9) work well with landscape & square
  if (containerAspect === '16:9') {
    return ['16:9', '1:1'].includes(contentAspect);
  }
  
  // Square containers work with square and near-square content
  if (containerAspect === '1:1') {
    return ['1:1', '4:5'].includes(contentAspect);
  }
  
  return false;
}

/**
 * Returns appropriate CSS classes for displaying content in a container
 * based on aspect ratio compatibility
 */
export function getAspectFitClasses(containerAspect: string, contentAspect: string | undefined | null): {
  objectFit: 'object-cover' | 'object-contain';
  bgClass: string;
} {
  const aspect = contentAspect || '1:1';
  const shouldContain = !aspectsMatch(containerAspect, aspect);
  
  return {
    objectFit: shouldContain ? 'object-contain' : 'object-cover',
    bgClass: shouldContain ? 'bg-black' : 'bg-muted',
  };
}
