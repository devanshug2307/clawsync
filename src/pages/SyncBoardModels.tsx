import { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { SyncBoardLayout } from '../components/syncboard/SyncBoardLayout';

const PROVIDERS = [
  { id: 'google', name: 'Google (Gemini)', models: ['gemini-3-flash-preview', 'gemini-3-pro-preview', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'] },
  { id: 'anthropic', name: 'Anthropic', models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-5-sonnet-20241022'] },
  { id: 'openai', name: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'] },
  { id: 'openrouter', name: 'OpenRouter', models: ['anthropic/claude-3.5-sonnet', 'openai/gpt-4o', 'google/gemini-2.5-pro', 'meta-llama/llama-3.1-70b-instruct'] },
  { id: 'opencode-zen', name: 'OpenCode Zen', models: ['claude-sonnet', 'gpt-4o'] },
];

export function SyncBoardModels() {
  const config = useQuery(api.agentConfig.get);
  const updateConfig = useMutation(api.agentConfig.update);

  const [provider, setProvider] = useState('anthropic');
  const [model, setModel] = useState('claude-sonnet-4-20250514');
  const [fallbackProvider, setFallbackProvider] = useState('');
  const [fallbackModel, setFallbackModel] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (config) {
      setProvider(config.modelProvider || 'anthropic');
      setModel(config.model || 'claude-sonnet-4-20250514');
      setFallbackProvider(config.fallbackProvider || '');
      setFallbackModel(config.fallbackModel || '');
    }
  }, [config]);

  const selectedProvider = PROVIDERS.find((p) => p.id === provider);
  const fallbackProviderObj = PROVIDERS.find((p) => p.id === fallbackProvider);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateConfig({
        modelProvider: provider,
        model,
        fallbackProvider: fallbackProvider || undefined,
        fallbackModel: fallbackModel || undefined,
      });
    } catch (error) {
      console.error('Save error:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SyncBoardLayout title="Model Configuration">
      <div className="models-config">
        <p className="description">
          Configure which AI model powers your agent. Model changes take effect on the next message.
        </p>

        <section className="config-section">
          <h3>Primary Model</h3>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="provider">Provider</label>
              <select
                id="provider"
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value);
                  const newProvider = PROVIDERS.find((p) => p.id === e.target.value);
                  if (newProvider) setModel(newProvider.models[0]);
                }}
                className="input"
              >
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="model">Model</label>
              <select
                id="model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="input"
              >
                {selectedProvider?.models.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="config-section">
          <h3>Fallback Model (Optional)</h3>
          <p className="hint">Used when the primary model fails or is unavailable.</p>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="fallback-provider">Provider</label>
              <select
                id="fallback-provider"
                value={fallbackProvider}
                onChange={(e) => {
                  setFallbackProvider(e.target.value);
                  const newProvider = PROVIDERS.find((p) => p.id === e.target.value);
                  if (newProvider) setFallbackModel(newProvider.models[0]);
                }}
                className="input"
              >
                <option value="">None</option>
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="fallback-model">Model</label>
              <select
                id="fallback-model"
                value={fallbackModel}
                onChange={(e) => setFallbackModel(e.target.value)}
                className="input"
                disabled={!fallbackProvider}
              >
                <option value="">None</option>
                {fallbackProviderObj?.models.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <div className="form-actions">
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>

      <style>{`
        .models-config {
          max-width: 600px;
        }

        .description {
          color: var(--text-secondary);
          margin-bottom: var(--space-6);
        }

        .config-section {
          margin-bottom: var(--space-8);
          padding: var(--space-4);
          background-color: var(--bg-secondary);
          border-radius: var(--radius-xl);
        }

        .config-section h3 {
          margin-bottom: var(--space-4);
        }

        .hint {
          font-size: var(--text-sm);
          color: var(--text-secondary);
          margin-bottom: var(--space-4);
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--space-4);
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }

        .form-group label {
          font-weight: 500;
          font-size: var(--text-sm);
        }

        .form-actions {
          margin-top: var(--space-4);
        }
      `}</style>
    </SyncBoardLayout>
  );
}
