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
}

export function ProductLibrary({ api }: { readonly api: ProductsApi }): React.JSX.Element {
  const [items, setItems] = useState<readonly ProductItem[] | undefined>();
  const [error, setError] = useState<string>();
  const [isNewFormOpen, setIsNewFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      {items !== undefined && items.length === 0 ? <p>还没有产品，先新建一个产品开始运营。</p> : null}
      {items !== undefined && items.length > 0 ? (
        <ul aria-label="产品列表">
          {items.map((product) => (
            <li key={product.id}>{product.name}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
