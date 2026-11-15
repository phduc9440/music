import { useEffect, useState } from 'react';
import { composerApi } from '../../services';

let cache: string[] | null = null;

/**
 * Gợi ý tên nhạc sĩ cho ô "Tác giả" (gắn bằng thuộc tính list của input). Chọn đúng tên thì bản nhạc tự liên kết với
 * trang nhạc sĩ; vẫn gõ tên khác tùy ý được.
 */
export default function ComposerDatalist({ id }: { id: string }) {
  const [names, setNames] = useState<string[]>(cache ?? []);

  useEffect(() => {
    if (cache) return;
    let cancelled = false;
    composerApi
      .list({ limit: 100 })
      .then((res) => {
        cache = res.data.result.map((c) => c.name).sort((a, b) => a.localeCompare(b, 'vi'));
        if (!cancelled) setNames(cache);
      })
      .catch(() => undefined); // không có gợi ý thì vẫn gõ tay được
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <datalist id={id}>
      {names.map((n) => (
        <option key={n} value={n} />
      ))}
    </datalist>
  );
}
