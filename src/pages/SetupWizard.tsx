import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { HandWaving, Check } from '@phosphor-icons/react';

type Step = 'welcome' | 'name' | 'soul' | 'model' | 'preview' | 'complete';

const DEFAULT_SOUL = `# Soul Document

## Identity

I am an AI agent powered by ClawSync. My owner has set me up to help visitors,
answer questions, and connect people to the right resources.

## How I communicate

I keep things direct and clear. Short sentences when a short answer works.
Longer explanations when the topic needs it. I match the energy of whoever
I'm talking to.

## What I know

My knowledge comes from what my owner has configured. This includes:
- Their professional background and interests
- Projects they want to highlight
- Topics they're knowledgeable about

## What I won't do

- Share private information
- Make commitments on my owner's behalf
- Provide financial, legal, or medical advice
- Pretend to be human

## Personality

- Friendly but not overly enthusiastic
- Helpful without being pushy
- Technical when needed, accessible always
`;

const MODEL_OPTIONS = [
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic', description: 'Fast, capable, balanced' },
  { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', provider: 'anthropic', description: 'Most capable, best reasoning' },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', description: 'OpenAI flagship model' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', description: 'Fast and affordable' },
  { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash', provider: 'google', description: 'Fast and efficient Gemini model' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'google', description: 'Advanced reasoning, long context' },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', provider: 'google', description: 'Latest fast model (preview)' },
  { id: 'grok-3', name: 'Grok 3', provider: 'xai', description: 'xAI flagship model' },
  { id: 'grok-3-fast', name: 'Grok 3 Fast', provider: 'xai', description: 'Fast Grok variant' },
];

export function SetupWizard() {
  const navigate = useNavigate();
  const completeSetup = useMutation(api.setup.complete);

  const [step, setStep] = useState<Step>('welcome');
  const [agentName, setAgentName] = useState('My AI Agent');
  const [soulDocument, setSoulDocument] = useState(DEFAULT_SOUL);
  const [selectedModel, setSelectedModel] = useState(MODEL_OPTIONS[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleComplete = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      await completeSetup({
        name: agentName,
        soulDocument,
        model: selectedModel.id,
        modelProvider: selectedModel.provider,
      });

      setStep('complete');

      // Redirect to chat after a brief delay
      setTimeout(() => {
        navigate('/chat');
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed. Please try again.');
      setIsSubmitting(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 'welcome':
        return (
          <div className="step-content">
            <div className="step-icon"><HandWaving size={48} weight="regular" /></div>
            <h2>Welcome to ClawSync</h2>
            <p className="step-description">
              Let's set up your personal AI agent. This wizard will guide you through
              the initial configuration. You can always change these settings later
              in SyncBoard.
            </p>
            <div className="step-actions">
              <button className="btn btn-primary btn-lg" onClick={() => setStep('name')}>
                Get Started
              </button>
            </div>
          </div>
        );

      case 'name':
        return (
          <div className="step-content">
            <div className="step-number">1 of 3</div>
            <h2>Name Your Agent</h2>
            <p className="step-description">
              Give your agent a name. This will be displayed in the chat interface.
            </p>
            <div className="form-group">
              <label htmlFor="agentName">Agent Name</label>
              <input
                id="agentName"
                type="text"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="e.g., My AI Assistant, Helper Bot"
                autoFocus
              />
            </div>
            <div className="step-actions">
              <button className="btn btn-ghost" onClick={() => setStep('welcome')}>
                Back
              </button>
              <button
                className="btn btn-primary"
                onClick={() => setStep('soul')}
                disabled={!agentName.trim()}
              >
                Continue
              </button>
            </div>
          </div>
        );

      case 'soul':
        return (
          <div className="step-content step-content-wide">
            <div className="step-number">2 of 3</div>
            <h2>Define Your Agent's Personality</h2>
            <p className="step-description">
              The soul document defines your agent's identity, knowledge, and communication style.
              Edit the template below or keep the default.
            </p>
            <div className="form-group">
              <label htmlFor="soulDocument">Soul Document (Markdown)</label>
              <textarea
                id="soulDocument"
                value={soulDocument}
                onChange={(e) => setSoulDocument(e.target.value)}
                rows={15}
                className="soul-editor"
              />
            </div>
            <div className="step-actions">
              <button className="btn btn-ghost" onClick={() => setStep('name')}>
                Back
              </button>
              <button
                className="btn btn-primary"
                onClick={() => setStep('model')}
                disabled={!soulDocument.trim()}
              >
                Continue
              </button>
            </div>
          </div>
        );

      case 'model':
        return (
          <div className="step-content">
            <div className="step-number">3 of 3</div>
            <h2>Choose Your AI Model</h2>
            <p className="step-description">
              Select the AI model that will power your agent. Make sure you have the
              corresponding API key set in your Convex environment variables.
            </p>
            <div className="model-options">
              {MODEL_OPTIONS.map((model) => (
                <div
                  key={model.id}
                  className={`model-option ${selectedModel.id === model.id ? 'selected' : ''}`}
                  onClick={() => setSelectedModel(model)}
                >
                  <div className="model-header">
                    <span className="model-name">{model.name}</span>
                    <span className="model-provider">{model.provider}</span>
                  </div>
                  <p className="model-description">{model.description}</p>
                </div>
              ))}
            </div>
            <div className="env-reminder">
              <strong>Required:</strong> Set <code>{selectedModel.provider === 'google' ? 'GEMINI_API_KEY' : `${selectedModel.provider.toUpperCase()}_API_KEY`}</code> in
              your Convex environment variables.
            </div>
            <div className="step-actions">
              <button className="btn btn-ghost" onClick={() => setStep('soul')}>
                Back
              </button>
              <button className="btn btn-primary" onClick={() => setStep('preview')}>
                Preview
              </button>
            </div>
          </div>
        );

      case 'preview':
        return (
          <div className="step-content">
            <h2>Review Your Setup</h2>
            <p className="step-description">
              Here's a summary of your configuration. Click "Complete Setup" to finish.
            </p>
            <div className="preview-card">
              <div className="preview-row">
                <span className="preview-label">Agent Name</span>
                <span className="preview-value">{agentName}</span>
              </div>
              <div className="preview-row">
                <span className="preview-label">Model</span>
                <span className="preview-value">{selectedModel.name}</span>
              </div>
              <div className="preview-row">
                <span className="preview-label">Provider</span>
                <span className="preview-value">{selectedModel.provider}</span>
              </div>
              <div className="preview-row">
                <span className="preview-label">Soul Document</span>
                <span className="preview-value">{soulDocument.split('\n').length} lines</span>
              </div>
            </div>
            {error && <div className="error-message">{error}</div>}
            <div className="step-actions">
              <button className="btn btn-ghost" onClick={() => setStep('model')} disabled={isSubmitting}>
                Back
              </button>
              <button
                className="btn btn-primary"
                onClick={handleComplete}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Setting up...' : 'Complete Setup'}
              </button>
            </div>
          </div>
        );

      case 'complete':
        return (
          <div className="step-content">
            <div className="step-icon success"><Check size={48} weight="bold" /></div>
            <h2>Setup Complete!</h2>
            <p className="step-description">
              Your agent is ready. Redirecting you to the chat interface...
            </p>
          </div>
        );
    }
  };

  return (
    <div className="setup-wizard">
      <div className="setup-container">
        <div className="setup-header">
          <img src="/clawsync-logo.svg" alt="ClawSync" className="setup-logo" onError={(e) => { e.currentTarget.src = '/clawsync-logo.png'; }} />
          <span className="setup-badge">Setup Wizard</span>
        </div>
        {renderStep()}
      </div>

      <style>{`
        .setup-wizard {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-primary);
          padding: var(--space-4);
        }

        .setup-container {
          background: var(--bg-primary);
          border-radius: var(--radius-2xl);
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.1);
          padding: var(--space-8);
          max-width: 560px;
          width: 100%;
        }

        .setup-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: var(--space-8);
          padding-bottom: var(--space-4);
          border-bottom: 1px solid var(--border);
        }

        .setup-logo {
          height: 36px;
          width: auto;
        }

        .setup-badge {
          font-size: var(--text-xs);
          background: var(--bg-secondary);
          padding: var(--space-1) var(--space-3);
          border-radius: var(--radius-full);
          color: var(--text-secondary);
        }

        .step-content {
          text-align: center;
        }

        .step-content-wide {
          max-width: 100%;
        }

        .step-icon {
          margin-bottom: var(--space-4);
          color: var(--interactive);
        }

        .step-icon.success {
          color: var(--success);
          background: rgba(34, 197, 94, 0.1);
          width: 80px;
          height: 80px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto var(--space-4);
        }

        .step-number {
          font-size: var(--text-xs);
          color: var(--text-secondary);
          margin-bottom: var(--space-2);
        }

        .step-content h2 {
          font-size: var(--text-xl);
          margin-bottom: var(--space-3);
        }

        .step-description {
          color: var(--text-secondary);
          margin-bottom: var(--space-6);
          line-height: 1.6;
        }

        .form-group {
          text-align: left;
          margin-bottom: var(--space-6);
        }

        .form-group label {
          display: block;
          font-size: var(--text-sm);
          font-weight: 500;
          margin-bottom: var(--space-2);
        }

        .form-group input,
        .form-group textarea {
          width: 100%;
          padding: var(--space-3);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          font-size: var(--text-base);
          background: var(--bg-secondary);
        }

        .form-group input:focus,
        .form-group textarea:focus {
          outline: none;
          border-color: var(--interactive);
          box-shadow: 0 0 0 3px rgba(234, 91, 38, 0.1);
        }

        .soul-editor {
          font-family: monospace;
          font-size: var(--text-sm);
          resize: vertical;
          min-height: 300px;
        }

        .model-options {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
          margin-bottom: var(--space-6);
          text-align: left;
        }

        .model-option {
          padding: var(--space-4);
          border: 2px solid var(--border);
          border-radius: var(--radius-lg);
          cursor: pointer;
          transition: all 0.2s;
        }

        .model-option:hover {
          border-color: var(--interactive);
        }

        .model-option.selected {
          border-color: var(--interactive);
          background: rgba(234, 91, 38, 0.05);
        }

        .model-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--space-1);
        }

        .model-name {
          font-weight: 600;
        }

        .model-provider {
          font-size: var(--text-xs);
          color: var(--text-secondary);
          background: var(--bg-secondary);
          padding: var(--space-1) var(--space-2);
          border-radius: var(--radius-sm);
        }

        .model-description {
          font-size: var(--text-sm);
          color: var(--text-secondary);
          margin: 0;
        }

        .env-reminder {
          font-size: var(--text-sm);
          background: var(--bg-secondary);
          padding: var(--space-3);
          border-radius: var(--radius-md);
          margin-bottom: var(--space-6);
          text-align: left;
        }

        .env-reminder code {
          background: var(--bg-primary);
          padding: var(--space-1) var(--space-2);
          border-radius: var(--radius-sm);
          font-size: var(--text-xs);
        }

        .preview-card {
          background: var(--bg-secondary);
          border-radius: var(--radius-lg);
          padding: var(--space-4);
          margin-bottom: var(--space-6);
          text-align: left;
        }

        .preview-row {
          display: flex;
          justify-content: space-between;
          padding: var(--space-2) 0;
          border-bottom: 1px solid var(--border);
        }

        .preview-row:last-child {
          border-bottom: none;
        }

        .preview-label {
          color: var(--text-secondary);
          font-size: var(--text-sm);
        }

        .preview-value {
          font-weight: 500;
        }

        .error-message {
          background: rgba(239, 68, 68, 0.1);
          color: var(--error);
          padding: var(--space-3);
          border-radius: var(--radius-md);
          margin-bottom: var(--space-4);
          font-size: var(--text-sm);
        }

        .step-actions {
          display: flex;
          gap: var(--space-3);
          justify-content: center;
        }

        .btn-lg {
          padding: var(--space-3) var(--space-8);
          font-size: var(--text-lg);
        }
      `}</style>
    </div>
  );
}
