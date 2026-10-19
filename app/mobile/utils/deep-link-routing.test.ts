import {
  parseTransactionDeepLink,
  resolveDeepLink,
} from './deep-link-routing';

describe('parseTransactionDeepLink', () => {
  it('parses the scheme form with no query params', () => {
    expect(parseTransactionDeepLink('quickex://transaction/12345')).toEqual({
      id: '12345',
      params: {},
    });
  });

  it('parses the scheme form with query params', () => {
    expect(
      parseTransactionDeepLink('quickex://transaction/12345?amount=100&asset=XLM'),
    ).toEqual({
      id: '12345',
      params: { amount: '100', asset: 'XLM' },
    });
  });

 it('parses the https form', () => {
    expect(parseTransactionDeepLink('https://quickex.to/transaction/12345')).toEqual({
      id: '12345',
      params: {},
    });
  });

  it('parses the www https form with query params', () => {
    expect(
      parseTransactionDeepLink('https://www.quickex.to/transaction/abc-123?status=Success'),
    ).toEqual({
      id: 'abc-123',
      params: { status: 'Success' },
    });
  });

  it('returns null for non-transaction links', () => {
    expect(parseTransactionDeepLink('https://quickex.to/pay/alice')).toBeNull();
    expect(parseTransactionDeepLink('not a url')).toBeNull();
  });
});

describe('resolveDeepLink transaction routing', () => {
  it('routes the scheme form to /transaction/[id]', () => {
    expect(resolveDeepLink('quickex://transaction/abc-123?status=Success')).toEqual({
      route: {
        pathname: '/transaction/[id]',
        params: { id: 'abc-123', status: 'Success' },
      },
    });
  });

  it('routes the https form to /transaction/[id]', () => {
    expect(resolveDeepLink('https://quickex.to/transaction/12345')).toEqual({
      route: {
        pathname: '/transaction/[id]',
        params: { id: '12345' },
      },
    });
  });

 it('routes the www https form to /transaction/[id]', () => {
    expect(resolveDeepLink('https://www.quickex.to/transaction/12345?status=Success')).toEqual({
      route: {
        pathname: '/transaction/[id]',
        params: { id: '12345', status: 'Success' },
      },
    });
  });
});
