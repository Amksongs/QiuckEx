import { ContractChangeWebhookDispatcher } from './contract-change-webhook.dispatcher';

describe('ContractChangeWebhookDispatcher', () => {
  const originalFetch = global.fetch;
  const dispatcher = new ContractChangeWebhookDispatcher();

  const hooks = [
    { id: 'fast', webhookUrl: 'https://fast.example/hook', secret: 's1' },
    { id: 'slow', webhookUrl: 'https://slow.example/hook', secret: 's2' },
  ];

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
  });

  it('records an unresponsive endpoint as a timeout failure without hanging', async () => {
    global.fetch = jest.fn((url: string, init?: RequestInit) => {
      if (url.includes('fast')) {
        return Promise.resolve({ ok: true, status: 200 } as Response);
      }
      // Never resolves unless aborted, like a non-responding subscriber.
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new Error('This operation was aborted')),
        );
      });
    }) as unknown as typeof fetch;

    const pending = dispatcher.dispatch(hooks, { version: 1 });
    await jest.advanceTimersByTimeAsync(10_000);
    const results = await pending;

    expect(results).toHaveLength(2);
    expect(results.find((r) => r.webhookId === 'fast')).toMatchObject({
      success: true,
      httpStatus: 200,
    });
    expect(results.find((r) => r.webhookId === 'slow')).toMatchObject({
      success: false,
      error: 'Webhook delivery timed out after 10000ms',
    });
  });

  it('passes an abort signal to fetch', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as unknown as typeof fetch;

    await dispatcher.dispatch([hooks[0]], { version: 1 });

    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});
