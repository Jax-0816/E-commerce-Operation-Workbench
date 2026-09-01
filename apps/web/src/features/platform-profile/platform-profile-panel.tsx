import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import {
  PLATFORM_IDS,
  type PlatformId,
  type PlatformCapabilitiesResponse,
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
  const [capabilities, setCapabilities] = useState<PlatformCapabilitiesResponse>();
  const [capabilitiesLoading, setCapabilitiesLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const saveSequence = useRef(0);
  const currentIdentity = useRef({ platformId, productId });
  currentIdentity.current = { platformId, productId };

  useEffect(() => {
    saveSequence.current += 1;
    setSaving(false);
  }, [platformId, productId]);

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

  useEffect(() => {
    let active = true;
    setCapabilities(undefined);
    setCapabilitiesLoading(true);
    void api
      .getCapabilities(platformId)
      .then((loaded) => active && setCapabilities(loaded))
      .catch((caught) => active && setError(errorMessage(caught)))
      .finally(() => active && setCapabilitiesLoading(false));
    return () => {
      active = false;
    };
  }, [api, platformId]);

  const switchPlatform = (next: PlatformId): void => {
    const nextParameters = new URLSearchParams(searchParameters);
    nextParameters.set('platform', next);
    setSearchParameters(nextParameters);
  };
  const save = async (): Promise<void> => {
    const sequence = ++saveSequence.current;
    const identity = { platformId, productId };
    try {
      setError('');
      setSaving(true);
      const saved = await api.save(productId, platformId, {
        ...fields,
        ...(profile === undefined ? {} : { expectedUpdatedAt: profile.updatedAt }),
      });
      if (!isCurrentSave(sequence, identity, saveSequence.current, currentIdentity.current)) return;
      setProfile(saved);
      setFields(fieldsFromProfile(saved));
    } catch (caught) {
      if (isCurrentSave(sequence, identity, saveSequence.current, currentIdentity.current)) {
        setError(errorMessage(caught));
      }
    } finally {
      if (isCurrentSave(sequence, identity, saveSequence.current, currentIdentity.current)) {
        setSaving(false);
      }
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
      <CapabilitySummary loading={capabilitiesLoading} response={capabilities} />
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
          <button
            aria-label="保存平台档案"
            type="button"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? '正在保存…' : '保存平台档案'}
          </button>
        </form>
      ) : null}
    </section>
  );
}

function isCurrentSave(
  sequence: number,
  identity: { readonly platformId: PlatformId; readonly productId: string },
  currentSequence: number,
  currentIdentity: { readonly platformId: PlatformId; readonly productId: string },
): boolean {
  return (
    sequence === currentSequence &&
    identity.platformId === currentIdentity.platformId &&
    identity.productId === currentIdentity.productId
  );
}

const CAPABILITY_NAMES = {
  content: '内容',
  creative: '创意',
  pricing: '定价',
  promotion: '促销',
  fee_model: '费率模型',
} as const;

function CapabilitySummary({
  loading,
  response,
}: {
  readonly loading: boolean;
  readonly response: PlatformCapabilitiesResponse | undefined;
}): React.JSX.Element {
  if (loading) return <p>正在核对平台能力…</p>;
  if (!response) return <p role="status">平台能力状态暂时不可用。</p>;
  return (
    <section aria-label="平台能力" className="capability-summary">
      <h2>{response.displayName}能力边界</h2>
      <dl>
        {Object.entries(response.capabilities).map(([capability, state]) => (
          <div key={capability} data-available={state.available}>
            <dt>{CAPABILITY_NAMES[capability as keyof typeof CAPABILITY_NAMES]}</dt>
            <dd>
              <strong>{capabilityStatusLabel(state.status)}</strong>
              <span>{state.message}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function capabilityStatusLabel(
  status: PlatformCapabilitiesResponse['capabilities']['content']['status'],
): string {
  return {
    supported: '已支持',
    generic: '通用能力',
    requires_rule_pack: '待规则验证',
    incomplete: '不完整',
    unavailable: '不可用',
  }[status];
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
