import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { ApiKeysService } from '../api-keys/api-keys.service';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { CustomThrottlerGuard } from '../auth/guards/custom-throttler.guard';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';

/**
 * GET /feedback/admin must never be reachable without an admin-scoped API key.
 */
describe('FeedbackController admin route', () => {
  let app: INestApplication;

  const mockFeedbackService = {
    listAll: jest.fn().mockResolvedValue([{ id: 'f1' }]),
    createFeedback: jest.fn(),
  };

  const mockApiKeysService = {
    validateKey: jest.fn(),
    isOverQuota: jest.fn().mockReturnValue(false),
  };

  function validKeyWith(scopes: string[]): void {
    mockApiKeysService.validateKey.mockResolvedValue({
      record: {
        id: 'api-key-id',
        name: 'test key',
        scopes,
        request_count: 0,
        monthly_quota: 1000,
        organization_id: null,
      },
      hasScope: (scope: string) => scopes.includes(scope),
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [FeedbackController],
      providers: [
        { provide: FeedbackService, useValue: mockFeedbackService },
        { provide: ApiKeysService, useValue: mockApiKeysService },
      ],
    })
      .overrideGuard(CustomThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiKeysService.isOverQuota.mockReturnValue(false);
    mockApiKeysService.validateKey.mockReset();
  });

  it('declares ApiKeyGuard, a required key and the admin scope', () => {
    const handler = FeedbackController.prototype.adminList;

    expect(Reflect.getMetadata('__guards__', handler)).toContain(ApiKeyGuard);
    expect(Reflect.getMetadata('requireApiKey', handler)).toBe(true);
    expect(Reflect.getMetadata('requiredScopes', handler)).toEqual(['admin']);
  });

  it('rejects an anonymous request with 401', async () => {
    const res = await request(app.getHttpServer()).get('/feedback/admin');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('MISSING_API_KEY');
    expect(mockFeedbackService.listAll).not.toHaveBeenCalled();
  });

  it('rejects an invalid API key with 401', async () => {
    mockApiKeysService.validateKey.mockResolvedValue(null);

    const res = await request(app.getHttpServer())
      .get('/feedback/admin')
      .set('x-api-key', 'bogus');

    expect(res.status).toBe(401);
    expect(mockFeedbackService.listAll).not.toHaveBeenCalled();
  });

  it('rejects a key without the admin scope with 403', async () => {
    validKeyWith(['transactions:read']);

    const res = await request(app.getHttpServer())
      .get('/feedback/admin')
      .set('x-api-key', 'member-key');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('INSUFFICIENT_SCOPE');
    expect(mockFeedbackService.listAll).not.toHaveBeenCalled();
  });

  it('returns feedback for an admin-scoped key', async () => {
    validKeyWith(['admin']);

    const res = await request(app.getHttpServer())
      .get('/feedback/admin')
      .set('x-api-key', 'admin-key');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'f1' }]);
  });
});
