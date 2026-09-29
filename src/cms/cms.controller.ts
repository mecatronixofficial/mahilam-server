import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AdminOnly, Auth } from "../common/decorators/auth.decorator";
import { CmsService } from "./cms.service";
import {
  ActivityDto,
  AnnouncementDto,
  BannerDto,
  BlogDto,
  BlogQueryDto,
  EventDto,
  EventQueryDto,
  FacilityDto,
  GalleryAlbumDto,
  GalleryItemDto,
  ProgramDto,
  SettingDto,
  TestimonialDto,
  UpdateActivityDto,
  UpdateAnnouncementDto,
  UpdateBannerDto,
  UpdateBlogDto,
  UpdateEventDto,
  UpdateFacilityDto,
  UpdateGalleryAlbumDto,
  UpdateGalleryItemDto,
  UpdateProgramDto,
  UpdateTestimonialDto,
} from "./dto/cms.dto";

const ok = <T>(data: T) => ({ success: true, data });
const done = () => ({ success: true });

/** CMS management. Any signed-in user can read; only admins can change content. */
@ApiTags("cms")
@Controller("cms")
@Auth()
export class CmsController {
  constructor(private s: CmsService) {}

  // Announcements
  @Get("announcements") async announcements() { return ok(await this.s.announcements()); }
  @Post("announcements") @AdminOnly() async createAnnouncement(@Body() dto: AnnouncementDto) { return ok(await this.s.createAnnouncement(dto)); }
  @Patch("announcements/:id") @AdminOnly() async updateAnnouncement(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateAnnouncementDto) { return ok(await this.s.updateAnnouncement(id, dto)); }
  @Delete("announcements/:id") @AdminOnly() async deleteAnnouncement(@Param("id", ParseUUIDPipe) id: string) { await this.s.deleteAnnouncement(id); return done(); }

  // Banners
  @Get("banners") async banners() { return ok(await this.s.banners()); }
  @Post("banners") @AdminOnly() async createBanner(@Body() dto: BannerDto) { return ok(await this.s.createBanner(dto)); }
  @Patch("banners/:id") @AdminOnly() async updateBanner(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateBannerDto) { return ok(await this.s.updateBanner(id, dto)); }
  @Delete("banners/:id") @AdminOnly() async deleteBanner(@Param("id", ParseUUIDPipe) id: string) { await this.s.deleteBanner(id); return done(); }

  // Blogs
  @Get("blogs") blogs(@Query() query: BlogQueryDto) { return this.s.blogs(query); }
  @Post("blogs") @AdminOnly() async createBlog(@Body() dto: BlogDto) { return ok(await this.s.createBlog(dto)); }
  @Patch("blogs/:id") @AdminOnly() async updateBlog(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateBlogDto) { return ok(await this.s.updateBlog(id, dto)); }
  @Delete("blogs/:id") @AdminOnly() async deleteBlog(@Param("id", ParseUUIDPipe) id: string) { await this.s.deleteBlog(id); return done(); }

  // Testimonials
  @Get("testimonials") async testimonials() { return ok(await this.s.testimonials()); }
  @Post("testimonials") @AdminOnly() async createTestimonial(@Body() dto: TestimonialDto) { return ok(await this.s.createTestimonial(dto)); }
  @Patch("testimonials/:id") @AdminOnly() async updateTestimonial(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateTestimonialDto) { return ok(await this.s.updateTestimonial(id, dto)); }
  @Delete("testimonials/:id") @AdminOnly() async deleteTestimonial(@Param("id", ParseUUIDPipe) id: string) { await this.s.deleteTestimonial(id); return done(); }

  // Events
  @Get("events") async events(@Query() query: EventQueryDto) { return ok(await this.s.events(false, query.when)); }
  @Post("events") @AdminOnly() async createEvent(@Body() dto: EventDto) { return ok(await this.s.createEvent(dto)); }
  @Patch("events/:id") @AdminOnly() async updateEvent(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateEventDto) { return ok(await this.s.updateEvent(id, dto)); }
  @Delete("events/:id") @AdminOnly() async deleteEvent(@Param("id", ParseUUIDPipe) id: string) { await this.s.deleteEvent(id); return done(); }

  // Gallery
  @Get("gallery") async gallery() { return ok(await this.s.galleryAlbums()); }
  @Post("gallery/albums") @AdminOnly() async createGalleryAlbum(@Body() dto: GalleryAlbumDto) { return ok(await this.s.createGalleryAlbum(dto)); }
  @Patch("gallery/albums/:id") @AdminOnly() async updateGalleryAlbum(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateGalleryAlbumDto) { return ok(await this.s.updateGalleryAlbum(id, dto)); }
  @Delete("gallery/albums/:id") @AdminOnly() async deleteGalleryAlbum(@Param("id", ParseUUIDPipe) id: string) { await this.s.deleteGalleryAlbum(id); return done(); }
  @Post("gallery/items") @AdminOnly() async createGalleryItem(@Body() dto: GalleryItemDto) { return ok(await this.s.createGalleryItem(dto)); }
  @Patch("gallery/items/:id") @AdminOnly() async updateGalleryItem(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateGalleryItemDto) { return ok(await this.s.updateGalleryItem(id, dto)); }
  @Delete("gallery/items/:id") @AdminOnly() async deleteGalleryItem(@Param("id", ParseUUIDPipe) id: string) { await this.s.deleteGalleryItem(id); return done(); }

  // Programs
  @Get("programs") async programs() { return ok(await this.s.allPrograms()); }
  @Post("programs") @AdminOnly() async createProgram(@Body() dto: ProgramDto) { return ok(await this.s.createProgram(dto)); }
  @Patch("programs/:id") @AdminOnly() async updateProgram(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateProgramDto) { return ok(await this.s.updateProgram(id, dto)); }
  @Delete("programs/:id") @AdminOnly() async deleteProgram(@Param("id", ParseUUIDPipe) id: string) { await this.s.deleteProgram(id); return done(); }

  // Facilities
  @Get("facilities") async facilities() { return ok(await this.s.allFacilities()); }
  @Post("facilities") @AdminOnly() async createFacility(@Body() dto: FacilityDto) { return ok(await this.s.createFacility(dto)); }
  @Patch("facilities/:id") @AdminOnly() async updateFacility(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateFacilityDto) { return ok(await this.s.updateFacility(id, dto)); }
  @Delete("facilities/:id") @AdminOnly() async deleteFacility(@Param("id", ParseUUIDPipe) id: string) { await this.s.deleteFacility(id); return done(); }

  // Activities
  @Get("activities") async activities() { return ok(await this.s.allActivities()); }
  @Post("activities") @AdminOnly() async createActivity(@Body() dto: ActivityDto) { return ok(await this.s.createActivity(dto)); }
  @Patch("activities/:id") @AdminOnly() async updateActivity(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateActivityDto) { return ok(await this.s.updateActivity(id, dto)); }
  @Delete("activities/:id") @AdminOnly() async deleteActivity(@Param("id", ParseUUIDPipe) id: string) { await this.s.deleteActivity(id); return done(); }

  // Settings
  @Get("settings") async settings() { return ok(await this.s.settings()); }
  @Post("settings") @AdminOnly() async saveSetting(@Body() dto: SettingDto) { return ok(await this.s.saveSetting(dto)); }
  @Delete("settings/:key") @AdminOnly() async deleteSetting(@Param("key") key: string) { await this.s.deleteSetting(key); return done(); }
}
