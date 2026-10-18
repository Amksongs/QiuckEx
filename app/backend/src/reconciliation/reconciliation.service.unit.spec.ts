import { ReconciliationService } from './reconciliation.service';
import { PaymentDbStatus } from './types/reconciliation.types';

describe('ReconciliationService payment totals', () => {
  const makePayment = (overrides: Partial<{
    stellar_tx_hash: string;
    amount: string;
  }> = {}) => ({
    id: 'payment-1',
    stellar_tx_hash: 'tx-1',
    status: PaymentDbStatus.Paid,
    amount: '10.0000000',
    asset: 'XLM',
    from_address: 'GFROM',
    to_address: 'GTO',
    memo: null,
    created_at: '2026-10-18T12:00:00.000Z',
    updated_at: '2026-10-18T12:00:00.000Z',
    ...overrides,
  });

  function createService(
    payments: ReturnType<typeof makePayment>[],
    operationsByHash: Record<string, Array<Record<string, unknown>>>,
    missingOnChainHashes: string[] = [],
  ) {
    const supabase = {
      fetchPaidPayments: jest.fn().mockResolvedValue(payments),
      fetchPendingEscrows: jest.fn().mockResolvedValue([]),
      fetchPendingPayments: jest.fn().mockResolvedValue([]),
    };
    const metrics = {
      recordError: jest.fn(),
      recordExternalCall: jest.fn(),
      setReconciliationDriftActive: jest.fn(),
    };
    const sentry = { captureMessage: jest.fn() };
    const service = new ReconciliationService(
      { network: 'testnet' } as never,
      supabase as never,
      metrics as never,
      sentry as never,
    );
    Object.defineProperty(service, 'server', {
      value: {
        operations: () => ({
          forTransaction: (hash: string) => ({
            call: jest.fn(async () => {
              if (missingOnChainHashes.includes(hash)) {
                throw Object.assign(new Error('Not Found'), {
                  response: { status: 404 },
                });
              }
              return { records: operationsByHash[hash] ?? [] };
            }),
          }),
        }),
      },
    });

    return { service, metrics, sentry };
  }

  const successfulPaymentOperation = (amount: string) => ({
    type: 'payment',
    amount,
    transaction_successful: true,
  });

  it('reports a clean comparison from confirmed Horizon payment operations', async () => {
    const { service, metrics, sentry } = createService(
      [makePayment()],
      { 'tx-1': [successfulPaymentOperation('10.0000000')] },
    );

    const report = await service.runReconciliation(10);

    expect(report.totalsComparison?.payments).toEqual({
      expectedCount: 1,
      observedCount: 1,
      countDiscrepancy: 0,
      expectedTotalAmount: '100000000',
      observedTotalAmount: '100000000',
      amountDiscrepancy: '0',
      exceedsThreshold: false,
    });
    expect(report.alert).toBeUndefined();
    expect(metrics.setReconciliationDriftActive).toHaveBeenCalledWith(false);
    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('alerts when Horizon reports a divergent confirmed payment amount', async () => {
    const { service, metrics, sentry } = createService(
      [makePayment()],
      { 'tx-1': [successfulPaymentOperation('9.5000000')] },
    );

    const report = await service.runReconciliation(10);

    expect(report.totalsComparison?.payments).toEqual({
      expectedCount: 1,
      observedCount: 1,
      countDiscrepancy: 0,
      expectedTotalAmount: '100000000',
      observedTotalAmount: '95000000',
      amountDiscrepancy: '5000000',
      exceedsThreshold: true,
    });
    expect(report.alert?.severity).toBe('critical');
    expect(metrics.setReconciliationDriftActive).toHaveBeenCalledWith(true);
    expect(sentry.captureMessage).toHaveBeenCalledWith(
      'Critical payment discrepancy detected',
      'error',
      expect.objectContaining({
        expectedTotalAmount: '100000000',
        observedTotalAmount: '95000000',
      }),
    );
  });

  it('counts a DB-paid transaction missing from Horizon as drift', async () => {
    const { service, metrics } = createService([makePayment()], {}, ['tx-1']);

    const report = await service.runReconciliation(10);

    expect(report.totalsComparison?.payments).toEqual({
      expectedCount: 1,
      observedCount: 0,
      countDiscrepancy: 1,
      expectedTotalAmount: '100000000',
      observedTotalAmount: '0',
      amountDiscrepancy: '100000000',
      exceedsThreshold: true,
    });
    expect(report.alert?.severity).toBe('critical');
    expect(metrics.setReconciliationDriftActive).toHaveBeenCalledWith(true);
  });
});
