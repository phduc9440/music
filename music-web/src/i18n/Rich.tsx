import { Fragment } from 'react';
import type { ReactNode } from 'react';

type TagName = 'strong' | 'code' | 'em';
const PATTERN = /<(strong|code|em)>([\s\S]*?)<\/\1>/g;

/**
 * Hiển thị chuỗi dịch có vài đoạn nhấn mạnh: "Gõ <code>abc</code> để xác nhận". Chỉ hỗ trợ ba thẻ strong, code, em (không
 * lồng nhau); phần còn lại luôn là chữ thường, không bao giờ được hiểu là HTML nên an toàn với dữ liệu người dùng.
 */
export default function Rich({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(PATTERN)) {
    const [whole, tag, inner] = match;
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const Tag = tag as TagName;
    nodes.push(<Tag key={index++}>{inner}</Tag>);
    last = match.index + whole.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return (
    <>
      {nodes.map((node, i) => (
        <Fragment key={i}>{node}</Fragment>
      ))}
    </>
  );
}
