import { Controller, Post, Get, Body, UseGuards, Req } from '@nestjs/common';
import { Request } from 'express';
import { FeedbackService } from './feedback.service';
import { FeedbackDto } from './feedback.dto';
import { CustomThrottlerGuard } from '../auth/guards/custom-throttler.guard';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { RequireApiKey } from '../auth/decorators/require-api-key.decorator';
import { RequireScopes } from '../auth/decorators/require-scopes.decorator';

/**
 * Controller handling user feedback/report submissions.
 *
 * - POST /feedback : public endpoint for contributors to submit reports.
 * - GET  /feedback/admin : admin‑only endpoint (API key with the `admin` scope)
 *   to retrieve stored reports.
 */
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post()
  @UseGuards(CustomThrottlerGuard) // anti‑abuse rate limiting
  async submit(@Body() feedback: FeedbackDto, @Req() req: Request) {
    // The service will handle redaction of sensitive fields.
    const stored = await this.feedbackService.createFeedback(feedback, req.ip);
    return { message: 'Feedback submitted', id: stored.id };
  }

  @Get('admin')
  @UseGuards(ApiKeyGuard)
  @RequireApiKey() // ApiKeyGuard treats a missing key as public without this
  @RequireScopes('admin')
  async adminList() {
    return await this.feedbackService.listAll();
  }
}
