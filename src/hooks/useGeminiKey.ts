import { useState, useCallback, useEffect } from 'react';
import { getStoredKeys, saveStoredKeys, type ApiKeyConfig } from './useApiRateLimiter';

const DEFAULT_GEMINI_KEY = 'AIzaSyCbOTwdc8c8YGYpl63BKSNPvU2Xd29t_4o';

/**
 * Simple hook for Gemini API key access WITHOUT rate limiting.
 * Use this for image and text generation which don't need rate limits.
 * For video (Veo 3), use useApiRateLimiter instead.
 */
export function useGeminiKey() {
  const [keys, setKeys] = useState<ApiKeyConfig[]>(() => {
    const stored = getStoredKeys('gemini');
    // If no keys are configured, seed with the default key
    if (!stored.some((k) => k.key.trim())) {
      const seeded: ApiKeyConfig[] = [
        { key: DEFAULT_GEMINI_KEY, label: 'Default Key', tier: 'free' },
        ...stored.slice(1),
      ];
      saveStoredKeys('gemini', seeded);
      return seeded;
    }
    return stored;
  });

  // Update keys when they change in storage
  useEffect(() => {
    const handleStorage = () => {
      setKeys(getStoredKeys('gemini'));
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Get first available API key
  const getApiKey = useCallback((): string | null => {
    const available = keys.find((k) => k.key.trim());
    return available?.key || DEFAULT_GEMINI_KEY;
  }, [keys]);

  // Check if any key is configured
  const hasApiKey = true;

  // Save keys
  const updateKeys = useCallback((newKeys: ApiKeyConfig[]) => {
    setKeys(newKeys);
    saveStoredKeys('gemini', newKeys);
  }, []);

  return {
    getApiKey,
    hasApiKey,
    keys,
    updateKeys,
  };
}
