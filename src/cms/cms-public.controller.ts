import { Body, Controller, Get, Header, Param, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { CmsService } from "./cms.service";
import { BlogQueryDto, EventQueryDto } from "./dto/cms.dto";
import { CreatePublicTestimonialDto } from "./dto/create-public-testimonial.dto";

/** Lets browsers and CDNs reuse public content briefly; the server also caches it in memory. */
const PUBLIC_CACHE = "public, max-age=60, stale-while-revalidate=300";

@ApiTags("cms-public")
@Controller("cms/public")
export class CmsPublicController {
  constructor(private s: CmsService) {}

  @Get("home")
  @Header("Cache-Control", PUBLIC_CACHE)
  async home() {
    return { success: true, data: await this.s.publicHome() };
  }

  @Get("banners")
  @Header("Cache-Control", PUBLIC_CACHE)
  async banners() {
    return { success: true, data: await this.s.publicBanners() };
  }

  @Get("announcements")
  @Header("Cache-Control", PUBLIC_CACHE)
  async announcements() {
    return { success: true, data: await this.s.publicAnnouncements() };
  }

  @Get("programs")
  @Header("Cache-Control", PUBLIC_CACHE)
  async programs() {
    return { success: true, data: await this.s.programs() };
  }

  @Get("programs/:slug")
  @Header("Cache-Control", PUBLIC_CACHE)
  async program(@Param("slug") slug: string) {
    return { success: true, data: await this.s.program(slug) };
  }

  @Get("facilities")
  @Header("Cache-Control", PUBLIC_CACHE)
  async facilities() {
    return { success: true, data: await this.s.facilities() };
  }

  @Get("activities")
  @Header("Cache-Control", PUBLIC_CACHE)
  async activities() {
    return { success: true, data: await this.s.activities() };
  }

  @Get("activities/:slug")
  @Header("Cache-Control", PUBLIC_CACHE)
  async activity(@Param("slug") slug: string) {
    return { success: true, data: await this.s.activity(slug) };
  }

  @Get("testimonials")
  @Header("Cache-Control", PUBLIC_CACHE)
  async testimonials() {
    return { success: true, data: await this.s.testimonials(true) };
  }

  @Post("testimonials")
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async submitTestimonial(@Body() dto: CreatePublicTestimonialDto) {
    return { success: true, message: "Thank you. Your review was submitted for approval.", data: await this.s.createPublicTestimonial(dto) };
  }

  @Get("events")
  @Header("Cache-Control", PUBLIC_CACHE)
  async events(@Query() query: EventQueryDto) {
    return { success: true, data: await this.s.events(true, query.when) };
  }

  @Get("events/:slug")
  @Header("Cache-Control", PUBLIC_CACHE)
  async event(@Param("slug") slug: string) {
    return { success: true, data: await this.s.event(slug) };
  }

  @Get("gallery")
  @Header("Cache-Control", PUBLIC_CACHE)
  async gallery() {
    return { success: true, data: await this.s.publicGallery() };
  }

  @Get("gallery/:slug")
  @Header("Cache-Control", PUBLIC_CACHE)
  async galleryAlbum(@Param("slug") slug: string) {
    return { success: true, data: await this.s.galleryAlbum(slug) };
  }

  @Get("blogs")
  @Header("Cache-Control", PUBLIC_CACHE)
  blogs(@Query() query: BlogQueryDto) {
    return this.s.publicBlogs(query);
  }

  @Get("blogs/:slug")
  @Header("Cache-Control", PUBLIC_CACHE)
  async blog(@Param("slug") slug: string) {
    return { success: true, data: await this.s.blog(slug) };
  }

  @Get("settings")
  @Header("Cache-Control", PUBLIC_CACHE)
  async settings() {
    return { success: true, data: await this.s.publicSettings() };
  }
}
