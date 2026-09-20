import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildHeaders, sanitizeError, loadConfig, parseScopes } from '../src/auth.js';

describe('Auth Layer', () => {
  it('1. buildHeaders produces Basic authorization header', () => {
    const headers = buildHeaders('user@example.com', 'my-secret-token');
    const expected = Buffer.from('user@example.com:my-secret-token').toString('base64');
    expect(headers.Authorization).toBe(`Basic ${expected}`);
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers.Accept).toBe('application/json');
  });

  it('2. token never appears in sanitized error messages', () => {
    const token = 'super-secret-token-123';
    const message = `Request to https://example.com failed with token super-secret-token-123 in header`;
    const sanitized = sanitizeError(message, token);
    expect(sanitized).not.toContain(token);
    expect(sanitized).toContain('[REDACTED]');
  });

  describe('loadConfig', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('3. throws when JIRA_API_TOKEN is missing', async () => {
      process.env.JIRA_INSTANCE = 'test';
      process.env.JIRA_USER_EMAIL = 'test@test.com';
      delete process.env.JIRA_API_TOKEN;
      await expect(loadConfig()).rejects.toThrow('JIRA_API_TOKEN');
    });

    it('4. throws when JIRA_INSTANCE is missing', async () => {
      process.env.JIRA_API_TOKEN = 'token';
      process.env.JIRA_USER_EMAIL = 'test@test.com';
      delete process.env.JIRA_INSTANCE;
      await expect(loadConfig()).rejects.toThrow('JIRA_INSTANCE');
    });

    it('5. throws when JIRA_USER_EMAIL is missing', async () => {
      process.env.JIRA_INSTANCE = 'test';
      process.env.JIRA_API_TOKEN = 'token';
      delete process.env.JIRA_USER_EMAIL;
      await expect(loadConfig()).rejects.toThrow('JIRA_USER_EMAIL');
    });

    it('loads config successfully with all required env vars including cloud ID', async () => {
      process.env.JIRA_INSTANCE = 'mycompany';
      process.env.JIRA_API_TOKEN = 'secret';
      process.env.JIRA_USER_EMAIL = 'user@example.com';
      process.env.JIRA_CLOUD_ID = 'abc-123';
      process.env.JIRA_SCOPES = 'read:jira-work,write:jira-work';

      const config = await loadConfig();
      expect(config.instance).toBe('mycompany');
      expect(config.cloudId).toBe('abc-123');
      expect(config.apiToken).toBe('secret');
      expect(config.userEmail).toBe('user@example.com');
      expect(config.scopes).toEqual(['read:jira-work', 'write:jira-work']);
    });
  });
});

describe('parseScopes', () => {
  it('returns read:jira-work for undefined', () => {
    expect(parseScopes(undefined)).toEqual(['read:jira-work']);
  });

  it('returns read:jira-work for empty string', () => {
    expect(parseScopes('')).toEqual(['read:jira-work']);
  });

  it('parses comma-separated valid scopes', () => {
    expect(parseScopes('read:jira-work,read:jira-user')).toEqual([
      'read:jira-work',
      'read:jira-user',
    ]);
  });

  it('trims whitespace', () => {
    expect(parseScopes(' read:jira-work , write:jira-work ')).toEqual([
      'read:jira-work',
      'write:jira-work',
    ]);
  });

  it('throws on unrecognised scopes rather than silently dropping them', () => {
    // Silently filtering used to leave an empty scope list, which registers zero
    // tools with no error — the server would start up completely inert.
    expect(() => parseScopes('read:jira-work,invalid,write:jira-work')).toThrow(
      /Unrecognised scope\(s\) in JIRA_SCOPES: invalid/,
    );
  });

  it('throws when every requested scope is unrecognised', () => {
    expect(() => parseScopes('bogus:one,bogus:two')).toThrow(/bogus:one, bogus:two/);
  });

  it('deduplicates repeated scopes', () => {
    expect(parseScopes('read:jira-work,read:jira-work')).toEqual(['read:jira-work']);
  });

  it('tolerates whitespace and trailing commas', () => {
    expect(parseScopes(' read:jira-work , write:jira-work ,')).toEqual([
      'read:jira-work',
      'write:jira-work',
    ]);
  });
});

describe('sanitizeError credential redaction', () => {
  const TOKEN = 'not-a-real-token-0000000000000000';
  const EMAIL = 'a@b.com';
  const B64 = Buffer.from(`${EMAIL}:${TOKEN}`).toString('base64');

  it('redacts the raw token', () => {
    expect(sanitizeError(`boom ${TOKEN}`, TOKEN, EMAIL)).not.toContain(TOKEN);
  });

  it('redacts the base64 credential that actually travels in the header', () => {
    // The token is sent as base64("email:token"). Redacting only the raw token
    // left a trivially reversible credential in any message echoing a header.
    const out = sanitizeError(`header Basic ${B64}`, TOKEN, EMAIL);
    expect(out).not.toContain(B64);
  });

  it('redacts a base64 blob of the token alone', () => {
    const tokenB64 = Buffer.from(TOKEN).toString('base64');
    expect(sanitizeError(`value ${tokenB64}`, TOKEN, EMAIL)).not.toContain(tokenB64);
  });

  it('redacts an unfamiliar Basic header as a catch-all', () => {
    const out = sanitizeError('Authorization: Basic c29tZU90aGVyQ3JlZGVudGlhbFZhbHVl', TOKEN, EMAIL);
    expect(out).toContain('Basic [REDACTED]');
    expect(out).not.toContain('c29tZU90aGVy');
  });

  it('leaves innocent text alone', () => {
    expect(sanitizeError('Not found — check the identifier', TOKEN, EMAIL)).toBe(
      'Not found — check the identifier',
    );
  });

  it('works without an email, as the old two-arg signature did', () => {
    expect(sanitizeError(`boom ${TOKEN}`, TOKEN)).not.toContain(TOKEN);
  });
});
