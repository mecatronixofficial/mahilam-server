import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { AdminOnly } from "../common/decorators/auth.decorator";
import { NewsletterService } from "./newsletter.service";
import { SubscribeDto, SubscriberQueryDto, UpdateSubscriberDto } from "./dto/newsletter.dto";

const MESSAGES = {
  subscribed: "Thank you! You'll now receive school news and updates.",
  already: "You're already subscribed — thank you!",
} as const;

@ApiTags("newsletter")
@Controller("newsletter")
export class NewsletterController {
  constructor(private s: NewsletterService) {}

  @Post("subscribe")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async subscribe(@Body() dto: SubscribeDto) {
    const status = await this.s.subscribe(dto);
    return { success: true, message: MESSAGES[status], data: { status } };
  }

  @Get()
  @AdminOnly()
  list(@Query() query: SubscriberQueryDto) {
    return this.s.list(query);
  }

  @Patch(":id")
  @AdminOnly()
  async update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateSubscriberDto) {
    return { success: true, data: await this.s.update(id, dto) };
  }

  @Delete(":id")
  @AdminOnly()
  async remove(@Param("id", ParseUUIDPipe) id: string) {
    await this.s.remove(id);
    return { success: true };
  }
}
