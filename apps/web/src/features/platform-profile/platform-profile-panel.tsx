import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import {
  PLATFORM_IDS,
  type PlatformId,
  type PlatformProfileResponse,
  type PlatformProfilesApi,
  type SavePlatformProfileInput,
} from './api.js';

const PLATFORM_NAMES: Record<PlatformId, string> = {
  pinduoduo: '拼多多',
  taobao: '淘宝',
  douyin: '抖音',
};

export function PlatformProfilePanel({
  api,
  productId,
}: {
  readonly api: PlatformProfilesApi;
  readonly productId: string;
}): React.JSX.Element {
  const [searchParameters, setSearchParameters] = useSearchParams();
  const platformId = platformFromSearch(searchParameters.get('platform'));
  const [profile, setProfile] = useState<PlatformProfileResponse>();
  const [fields, setFields] = useState<SavePlatformProfileInput>(emptyFields);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void api
      .get(productId, platformId)
      .then((loaded) => {
        if (!active) return;
        setProfile(loaded);
        setFields(loaded === undefined ? emptyFields() : fieldsFromProfile(loaded));
      })
      .catch((caught) => active && setError(errorMessage(caught)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [api, platformId, productId]);

  const switchPlatform = (next: PlatformId): void => {
    const nextParameters = new URLSearchParams(searchParameters);
    nextParameters.set('platform', next);
    setSearchParameters(nextParameters);
  };
  const save = async (): Promise<void> => {
    try {
      setError('');
      const saved = await api.save(productId, platformId, {
        ...fields,
        ...(profile === undefined ? {} : { expectedUpdatedAt: profile.updatedAt }),
      });
      setProfile(saved);
      setFields(fieldsFromProfile(saved));
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  return (
    <section aria-label="平台档案">
      <label>
        当前平台
        <select
          aria-label="当前平台"
          value={platformId}
          onChange={(event) => switchPlatform(event.target.value as PlatformId)}
        >
          {PLATFORM_IDS.map((id) => (
            <option key={id} value={id}>
              {PLATFORM_NAMES[id]}
            </option>
          ))}
        </select>
      </label>
      {loading ? <p>正在加载平台档案…</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {!loading ? (
        <form onSubmit={(event) => event.preventDefault()}>
          <Field
            label="类目编码"
            value={fields.categoryCode}
            onChange={(categoryCode) => setFields({ ...fields, categoryCode })}
          />
          <Field
            label="类目名称"
            value={fields.categoryName}
            onChange={(categoryName) => setFields({ ...fields, categoryName })}
          />
          <Field
            label="平台标题"
            value={fields.title}
            onChange={(title) => setFields({ ...fields, title })}
          />
          <button aria-label="保存平台档案" type="button" onClick={() => void save()}>
            保存平台档案
          </button>
        </form>
      ) : null}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: string | null;
  readonly onChange: (value: string | null) => void;
}) {
  return (
    <label>
      {label}
      <input
        aria-label={label}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value.trim() ? event.target.value : null)}
      />
    </label>
  );
}

function platformFromSearch(value: string | null): PlatformId {
  return PLATFORM_IDS.includes(value as PlatformId) ? (value as PlatformId) : 'pinduoduo';
}

function emptyFields(): SavePlatformProfileInput {
  return {
    categoryCode: null,
    categoryName: null,
    externalProductId: null,
    title: null,
    description: null,
    metadata: {},
  };
}

function fieldsFromProfile(profile: PlatformProfileResponse): SavePlatformProfileInput {
  return {
    categoryCode: profile.categoryCode,
    categoryName: profile.categoryName,
    externalProductId: profile.externalProductId,
    title: profile.title,
    description: profile.description,
    metadata: profile.metadata,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
