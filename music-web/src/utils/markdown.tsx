import type { ReactNode } from 'react';

/*
 * Hiển thị Markdown an toàn cho diễn đàn (mục 5.5). Không dùng dangerouslySetInnerHTML: văn bản được dựng thẳng thành
 * thành phần React nên mọi thẻ HTML người dùng gõ đều hiện nguyên chữ, không chạy được. Liên kết chỉ nhận http(s).
 * Hỗ trợ: tiêu đề (#), in đậm, in nghiêng, mã (`), khối mã (```), trích dẫn (>), danh sách (-, *, 1.), liên kết.
 */

const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\s][^*\n]*\*)|(\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    const start = m.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    const token = m[0];
    const key = `${keyPrefix}-${i++}`;
    if (m[1]) out.push(<code key={key}>{token.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else if (m[3]) out.push(<em key={key}>{token.slice(1, -1)}</em>);
    else {
      const close = token.indexOf('](');
      out.push(
        <a key={key} href={token.slice(close + 2, -1)} target="_blank" rel="noopener noreferrer nofollow ugc">
          {token.slice(1, close)}
        </a>,
      );
    }
    last = start + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Các dòng của một đoạn, nối bằng <br>. */
function lines(text: string[], key: string): ReactNode[] {
  return text.flatMap((line, idx) => {
    const inline = renderInline(line, `${key}-${idx}`);
    return idx === 0 ? inline : [<br key={`${key}-br${idx}`} />, ...inline];
  });
}

const BULLET = /^\s*[-*]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;

export function renderMarkdown(source: string): ReactNode[] {
  const rows = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let n = 0;
  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    const key = `b${n++}`;
    if (row.trim() === '') {
      i++;
    } else if (row.trim().startsWith('```')) {
      const code: string[] = [];
      i++;
      while (i < rows.length && !rows[i].trim().startsWith('```')) code.push(rows[i++]);
      i++; // dòng đóng ```
      blocks.push(
        <pre key={key}>
          <code>{code.join('\n')}</code>
        </pre>,
      );
    } else if (/^#{1,3}\s+/.test(row)) {
      // Tiêu đề trong bài chỉ cỡ h4 để không phá thứ bậc tiêu đề của trang
      blocks.push(<h4 key={key}>{renderInline(row.replace(/^#{1,3}\s+/, ''), key)}</h4>);
      i++;
    } else if (row.startsWith('>')) {
      const quote: string[] = [];
      while (i < rows.length && rows[i].startsWith('>')) quote.push(rows[i++].replace(/^>\s?/, ''));
      blocks.push(<blockquote key={key}>{lines(quote, key)}</blockquote>);
    } else if (BULLET.test(row) || ORDERED.test(row)) {
      const ordered = ORDERED.test(row) && !BULLET.test(row);
      const re = ordered ? ORDERED : BULLET;
      const items: ReactNode[] = [];
      while (i < rows.length && re.test(rows[i])) {
        const text = rows[i].replace(re, '$1');
        items.push(<li key={`${key}-${items.length}`}>{renderInline(text, `${key}-${items.length}`)}</li>);
        i++;
      }
      blocks.push(ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>);
    } else {
      const para: string[] = [];
      while (
        i < rows.length &&
        rows[i].trim() !== '' &&
        !rows[i].trim().startsWith('```') &&
        !/^#{1,3}\s+/.test(rows[i]) &&
        !rows[i].startsWith('>') &&
        !BULLET.test(rows[i]) &&
        !ORDERED.test(rows[i])
      )
        para.push(rows[i++]);
      blocks.push(<p key={key}>{lines(para, key)}</p>);
    }
  }
  return blocks;
}
