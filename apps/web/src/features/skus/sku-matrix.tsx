import { useEffect, useState } from 'react';

import type { SkuMatrixResponse, SkusApi } from './api.js';

export function SkuMatrix({
  api,
  productId,
}: {
  api: SkusApi;
  productId: string;
}): React.JSX.Element {
  const [matrix, setMatrix] = useState<SkuMatrixResponse>();
  const [configuration, setConfiguration] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setMatrix(undefined);
    setError('');
    void api
      .get(productId)
      .then(setMatrix)
      .catch((caught) => setError(errorMessage(caught)));
  }, [api, productId]);

  if (!matrix && !error) return <p>正在加载 SKU…</p>;
  if (!matrix) return <p role="alert">{error}</p>;

  const configure = async (): Promise<void> => {
    try {
      setError('');
      const dimensions = parseConfiguration(configuration);
      setMatrix(await api.configure(productId, dimensions));
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  const update = async (sku: SkuMatrixResponse['skus'][number]): Promise<void> => {
    try {
      setError('');
      setMatrix(await api.update(productId, sku.id, { ...sku, enabled: !sku.enabled }));
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  return (
    <section aria-label="SKU 矩阵">
      {error ? <p role="alert">{error}</p> : null}
      <label>
        规格配置（每行“维度=值1,值2”）
        <textarea
          aria-label="规格配置"
          value={configuration}
          onChange={(event) => setConfiguration(event.target.value)}
        />
      </label>
      <button aria-label="生成 SKU 矩阵" type="button" onClick={() => void configure()}>
        生成 SKU 矩阵
      </button>
      {matrix.dimensions.length === 0 ? (
        <p>请先配置规格维度。</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>组合</th>
              <th>启用</th>
              <th>内部编码</th>
            </tr>
          </thead>
          <tbody>
            {matrix.skus.map((sku) => (
              <tr key={sku.id}>
                <td>{combinationLabel(matrix, sku.valueIds)}</td>
                <td>
                  <input
                    aria-label={`启用 ${sku.signature}`}
                    type="checkbox"
                    checked={sku.enabled}
                    onChange={() => void update(sku)}
                  />
                </td>
                <td>{sku.internalCode ?? '未设置'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function parseConfiguration(input: string): readonly { name: string; values: readonly string[] }[] {
  const dimensions = input
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf('=');
      if (separator < 1) throw new Error('规格格式应为“维度=值1,值2”。');
      const name = line.slice(0, separator).trim();
      const values = line
        .slice(separator + 1)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      if (!name || values.length === 0) throw new Error('每个规格维度至少需要一个值。');
      return { name, values };
    });
  if (dimensions.length === 0) throw new Error('请至少配置一个规格维度。');
  return dimensions;
}

function combinationLabel(matrix: SkuMatrixResponse, valueIds: readonly string[]): string {
  const values = matrix.dimensions.flatMap((dimension) => dimension.values);
  return valueIds
    .map((id) => values.find((value) => value.id === id)?.label ?? '未知值')
    .join(' / ');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
