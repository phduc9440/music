import { useMemo } from 'react';
import { renderMarkdown } from '../../utils/markdown';

/** Nội dung Markdown của bài diễn đàn, dựng thành thành phần React (không chèn HTML thô). */
export default function Markdown({ source }: { source: string }) {
  const blocks = useMemo(() => renderMarkdown(source), [source]);
  return <div className="fm-md">{blocks}</div>;
}
