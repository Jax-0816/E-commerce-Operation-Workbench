import { useEffect, useState } from 'react';

export interface ProductItem {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProductsApi {
  list(): Promise<readonly ProductItem[]>;
  create(input: { name: string }): Promise<ProductItem | undefined>;
  archive(id: string): Promise<void>;
}

export function ProductLibrary({
  api,
  onSelect,
}: {
  readonly api: ProductsApi;
  readonly onSelect?: (product: ProductItem) => void;
}): React.JSX.Element {
  const [items, setItems] = useState<readonly ProductItem[] | undefined>();
  const [error, setError] = useState<string>();
  const [isNewFormOpen, setIsNewFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [archivingIds, setArchivingIds] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    void api
      .list()
      .then(setItems)
      .catch(() => setError('无法加载产品，请稍后重试。'));
  }, [api]);

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsSubmitting(true);
    setError(undefined);
    try {
      const product = await api.create({ name });
      if (product !== undefined) {
        setItems((current) => [...(current ?? []), product]);
        setName('');
        setIsNewFormOpen(false);
      }
    } catch {
      setError('无法新建产品，请检查名称后重试。');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function archive(product: ProductItem): Promise<void> {
    setArchivingIds((current) => new Set(current).add(product.id));
    setError(undefined);
    try {
      await api.archive(product.id);
      setItems((current) => current?.filter((item) => item.id !== product.id));
    } catch {
      setError('无法归档产品，请稍后重试。');
    } finally {
      setArchivingIds((current) => {
        const next = new Set(current);
        next.delete(product.id);
        return next;
      });
    }
  }

  return (
    <section aria-labelledby="products-heading" className="product-library">
      <div>
        <h1 id="products-heading">产品库</h1>
        <button type="button" onClick={() => setIsNewFormOpen(true)}>
          新建产品
        </button>
      </div>

      {isNewFormOpen ? (
        <form aria-label="新建产品" onSubmit={(event) => void submit(event)}>
          <label htmlFor="product-name">产品名称</label>
          <input
            id="product-name"
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
          <button disabled={isSubmitting} type="submit">
            {isSubmitting ? '正在创建…' : '创建产品'}
          </button>
        </form>
      ) : null}

      {error !== undefined ? <p role="alert">{error}</p> : null}
      {items === undefined && error === undefined ? <p>正在加载产品…</p> : null}
      {items !== undefined && items.length === 0 ? (
        <p>还没有产品，先新建一个产品开始运营。</p>
      ) : null}
      {items !== undefined && items.length > 0 ? (
        <ul aria-label="产品列表">
          {items.map((product) => (
            <li key={product.id}>
              <span>{product.name}</span>
              {onSelect ? (
                <button onClick={() => onSelect(product)} type="button">
                  管理事实
                </button>
              ) : null}
              <button
                aria-label={`归档 ${product.name}`}
                disabled={archivingIds.has(product.id)}
                onClick={() => void archive(product)}
                type="button"
              >
                {archivingIds.has(product.id) ? '正在归档…' : '归档'}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
