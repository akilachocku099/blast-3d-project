import { useEffect, useState } from "react";

const cache = new Map<string, Float32Array>();

export function useBinary(path: string | null): Float32Array | null {
  const [data, setData] = useState<Float32Array | null>(
    path ? cache.get(path) ?? null : null
  );

  useEffect(() => {
    if (!path) return;
    if (cache.has(path)) {
      setData(cache.get(path)!);
      return;
    }
    let cancelled = false;
    fetch(path)
      .then((r) => r.arrayBuffer())
      .then((buf) => {
        if (cancelled) return;
        const arr = new Float32Array(buf);
        cache.set(path, arr);
        setData(arr);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return data;
}

export function useJSON<T>(path: string | null): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    fetch(path)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) setData(json);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);
  return data;
}
