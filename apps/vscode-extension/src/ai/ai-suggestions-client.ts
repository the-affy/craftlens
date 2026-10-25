import * as vscode from 'vscode';
import { Finding, Suggestion, ProjectContext } from '@craftlens/core';

export type AiProvider = 'openai' | 'anthropic' | 'gemini' | 'ollama';

export interface AiConfiguration {
  enabled: boolean;
  provider: AiProvider;
  model: string;
  endpointUrl?: string;
  consentGranted: boolean;
}

export class AiSuggestionsManager {
  private static readonly SECRET_KEY_PREFIX = 'craftlens.aiApiKey.';

  constructor(
    private secrets: vscode.SecretStorage,
    private globalState: vscode.Memento
  ) {}

  public getConfiguration(): AiConfiguration {
    return (
      this.globalState.get<AiConfiguration>('craftlens.aiConfig') || {
        enabled: false,
        provider: 'openai',
        model: 'gpt-4o',
        consentGranted: false,
      }
    );
  }

  public async setConfiguration(config: Partial<AiConfiguration>): Promise<void> {
    const current = this.getConfiguration();
    const updated = { ...current, ...config };
    await this.globalState.update('craftlens.aiConfig', updated);
  }

  public async storeApiKey(provider: AiProvider, apiKey: string): Promise<void> {
    await this.secrets.store(`${AiSuggestionsManager.SECRET_KEY_PREFIX}${provider}`, apiKey);
  }

  public async getApiKey(provider: AiProvider): Promise<string | undefined> {
    return await this.secrets.get(`${AiSuggestionsManager.SECRET_KEY_PREFIX}${provider}`);
  }

  public async deleteApiKey(provider: AiProvider): Promise<void> {
    await this.secrets.delete(`${AiSuggestionsManager.SECRET_KEY_PREFIX}${provider}`);
  }

  public getPrivacyDisclosure(): string {
    return [
      '**CraftLens AI Privacy Disclosure (BYOK)**',
      '',
      'When "Send code to AI" is enabled, CraftLens sends only the minimum context required to generate fixes:',
      '• The specific finding title and rule ID',
      '• The relative file path and offending line range',
      '• The immediate offending code snippet (lines X-Y)',
      '• Detected project metadata (framework and CSS strategy)',
      '',
      '**CraftLens NEVER transmits your entire repository, file tree, or unrelated files.**',
      'Your API keys are stored securely using VS Code SecretStorage and never saved in plaintext configuration files.',
    ].join('\n');
  }

  /**
   * Generates AI-enhanced fix suggestions if enabled and user has given explicit consent.
   * Gracefully falls back to local deterministic suggestions if offline or not configured.
   */
  public async getAiEnhancedSuggestions(
    finding: Finding,
    snippet: string,
    projectContext?: ProjectContext
  ): Promise<Suggestion[] | undefined> {
    const config = this.getConfiguration();
    if (!config.enabled || !config.consentGranted) {
      return undefined;
    }

    const apiKey = await this.getApiKey(config.provider);
    if (!apiKey && config.provider !== 'ollama') {
      return undefined;
    }

    const payload = {
      finding: {
        ruleId: finding.ruleId,
        title: finding.title || finding.problemTitle,
        whatIsWrong: finding.whatIsWrong || finding.message,
        whyItMatters: finding.whyItMatters,
        filePath: finding.filePath,
        startLine: finding.startLine,
        endLine: finding.endLine,
      },
      codeSnippet: snippet,
      projectContext: {
        framework: projectContext?.framework,
        cssStrategy: projectContext?.cssStrategy,
        componentSystem: projectContext?.componentSystem,
      },
    };

    try {
      if (config.provider === 'openai') {
        return await this.callOpenAi(apiKey || '', config.model, payload);
      } else if (config.provider === 'anthropic') {
        return await this.callAnthropic(apiKey || '', config.model, payload);
      } else if (config.provider === 'gemini') {
        return await this.callGemini(apiKey || '', config.model, payload);
      } else if (config.provider === 'ollama') {
        return await this.callOllama(config.endpointUrl || 'http://localhost:11434', config.model, payload);
      }
    } catch (err) {
      console.warn('AI suggestions request failed, falling back to local engine:', err);
    }

    return undefined;
  }

  private async callOpenAi(apiKey: string, model: string, payload: any): Promise<Suggestion[] | undefined> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are an expert design-systems and software-quality engineer. Respond strictly with a JSON array of up to 3 suggestions: [{"id":"s1","title":"...","explanation":"...","type":"autofix"|"replace"|"insert"|"refactor"|"manual","actionLabel":"Apply"|"Replace"|"Insert"|"Open suggestion"|"Copy fix","confidence":0.9,"patch":"..."}]. No markdown wrap, only raw JSON array.',
          },
          {
            role: 'user',
            content: JSON.stringify(payload),
          },
        ],
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return undefined;
    const data: any = await res.json();
    const content = data?.choices?.[0]?.message?.content?.trim();
    if (content) {
      const parsed = JSON.parse(content.replace(/^```json/, '').replace(/```$/, '').trim());
      if (Array.isArray(parsed)) return parsed.slice(0, 3);
    }
    return undefined;
  }

  private async callAnthropic(apiKey: string, model: string, payload: any): Promise<Suggestion[] | undefined> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        system: 'Respond strictly with a JSON array of up to 3 suggested fixes. No markdown wrap, raw JSON only.',
        messages: [{ role: 'user', content: JSON.stringify(payload) }],
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return undefined;
    const data: any = await res.json();
    const content = data?.content?.[0]?.text?.trim();
    if (content) {
      const parsed = JSON.parse(content.replace(/^```json/, '').replace(/```$/, '').trim());
      if (Array.isArray(parsed)) return parsed.slice(0, 3);
    }
    return undefined;
  }

  private async callGemini(apiKey: string, model: string, payload: any): Promise<Suggestion[] | undefined> {
    const m = model || 'gemini-1.5-flash';
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Generate up to 3 fix suggestions as JSON array: ${JSON.stringify(payload)}` }] }],
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return undefined;
    const data: any = await res.json();
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (content) {
      const parsed = JSON.parse(content.replace(/^```json/, '').replace(/```$/, '').trim());
      if (Array.isArray(parsed)) return parsed.slice(0, 3);
    }
    return undefined;
  }

  private async callOllama(endpointUrl: string, model: string, payload: any): Promise<Suggestion[] | undefined> {
    const res = await fetch(`${endpointUrl.replace(/\/$/, '')}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || 'llama3',
        prompt: `Respond strictly with JSON array of up to 3 suggestions for: ${JSON.stringify(payload)}`,
        stream: false,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return undefined;
    const data: any = await res.json();
    const content = data?.response?.trim();
    if (content) {
      const parsed = JSON.parse(content.replace(/^```json/, '').replace(/```$/, '').trim());
      if (Array.isArray(parsed)) return parsed.slice(0, 3);
    }
    return undefined;
  }
}
