import { useEffect, useState } from 'react';

import type {
  CompetitorImportPreviewResponse,
  CompetitorListItemResponse,
  CompetitorsApi,
} from './api.js';

const example = 'name\turl\tprice\tsales\treviews\tsku\tselling_points\n';

export function CompetitorImportPanel({
  api,
  productId,
}: {
  readonly api: CompetitorsApi;
  readonly productId: string;
}): React.JSX.Element {
  const [content, setContent] = useState(example);
  const [preview, setPreview] = useState<CompetitorImportPreviewResponse | null>(null);
  const [items, setItems] = useState<readonly CompetitorListItemResponse[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = () => api.list(productId).then(setItems);
  useEffect(() => {
    void reload().catch(() => setMessage('读取竞品失败'));
  }, [api, productId]);

  const run = async (operation: () => Promise<CompetitorImportPreviewResponse>) => {
    setBusy(true);
    setMessage('');
    try {
      const result = await operation();
      setPreview(result);
      setMessage(result.valid ? `预览通过：${result.rows.length} 条` : '预览发现需修正字段');
    } catch {
      setMessage('预览失败，请检查文件或表头');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="竞品快照" className="competitor-workspace">
      <div className="competitor-import-card">
        <header>
          <div>
            <p className="eyebrow">PREVIEW → VALIDATE → CONFIRM</p>
            <h2>导入竞品快照</h2>
          </div>
          <span className="status-muted">不抓取网页</span>
        </header>
        <p>支持粘贴表格、CSV 和 XLSX。“10万+”等平台展示值会保留原文，标准化值单独记录。</p>
        <label>
          粘贴表格（Tab 分隔）
          <textarea
            aria-label="竞品粘贴数据"
            onChange={(event) => setContent(event.target.value)}
            rows={7}
            value={content}
          />
        </label>
        <div className="button-row">
          <button
            disabled={busy || !content.trim()}
            onClick={() =>
              void run(() =>
                api.previewText(productId, {
                  format: 'paste',
                  sourceName: '粘贴导入',
                  content,
                }),
              )
            }
            type="button"
          >
            预览粘贴数据
          </button>
          <label className="file-button">
            选择 CSV / XLSX
            <input
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              aria-label="选择竞品文件"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void run(() => api.previewFile(productId, file));
              }}
              type="file"
            />
          </label>
        </div>
        {message ? <p role="status">{message}</p> : null}
        {preview ? (
          <div aria-label="竞品导入预览">
            {preview.issues.length ? (
              <ul>
                {preview.issues.map((issue) => (
                  <li key={`${issue.rowNumber}-${issue.field}`}>
                    第 {issue.rowNumber} 行：{issue.field} {issue.code}
                  </li>
                ))}
              </ul>
            ) : null}
            <SnapshotTable
              items={preview.rows.map((row) => ({
                id: String(row.rowNumber),
                name: row.name,
                snapshot: row,
              }))}
            />
            <button
              disabled={busy || !preview.valid || preview.rows.length === 0}
              onClick={() => {
                setBusy(true);
                void api
                  .confirm(productId, preview)
                  .then(() => reload())
                  .then(() => {
                    setPreview(null);
                    setMessage('导入已确认，快照已锁定');
                  })
                  .catch(() => setMessage('确认导入失败'))
                  .finally(() => setBusy(false));
              }}
              type="button"
            >
              确认导入
            </button>
          </div>
        ) : null}
      </div>
      <div className="competitor-ledger">
        <h2>已导入竞品</h2>
        {items.length ? (
          <SnapshotTable
            items={items.map(({ competitor, latestSnapshot }) => ({
              id: competitor.id,
              name: competitor.name,
              snapshot: latestSnapshot,
            }))}
          />
        ) : (
          <p>暂无竞品快照。</p>
        )}
      </div>
    </section>
  );
}

function SnapshotTable({
  items,
}: {
  readonly items: readonly {
    id: string;
    name: string;
    snapshot: {
      readonly displayedPriceText: string | null;
      readonly displayedSalesText: string | null;
      readonly displayedReviewText: string | null;
      readonly sellingPoints: readonly string[];
    };
  }[];
}): React.JSX.Element {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>竞品</th>
            <th>展示价</th>
            <th>展示销量</th>
            <th>展示评价</th>
            <th>卖点</th>
          </tr>
        </thead>
        <tbody>
          {items.map(({ id, name, snapshot }) => (
            <tr key={id}>
              <td>{name}</td>
              <td>{snapshot.displayedPriceText ?? '—'}</td>
              <td>{snapshot.displayedSalesText ?? '—'}</td>
              <td>{snapshot.displayedReviewText ?? '—'}</td>
              <td>{snapshot.sellingPoints.join('、') || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
