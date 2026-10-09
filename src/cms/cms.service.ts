import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { PublicCacheService } from "../common/cache/public-cache.service.js";
import { Prisma } from "../generated/prisma/client.js";
import { BlogStatus } from "../generated/prisma/enums.js";
import { withDates } from "../common/utils/dates.js";
import { contains, pageArgs, paginated } from "../common/utils/pagination.js";
import type {
  ActivityDto,
  AnnouncementDto,
  BannerDto,
  BlogDto,
  BlogQueryDto,
  EventDto,
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
} from "./dto/cms.dto.js";
import type { CreatePublicTestimonialDto } from "./dto/create-public-testimonial.dto.js";

/** Setting keys with these prefixes are safe to expose on the public website. */
const PUBLIC_SETTING_PREFIXES = ["school.", "site.", "social.", "public."];

/** Public testimonials never expose the parent's phone number or email. */
const PUBLIC_TESTIMONIAL = { id: true, parentName: true, location: true, subject: true, studentReference: true, photo: true, rating: true, testimonial: true, featured: true, displayOrder: true } satisfies Prisma.TestimonialSelect;

/** Blog lists omit the (potentially large) body. */
const BLOG_SUMMARY = { id: true, title: true, slug: true, excerpt: true, coverImage: true, author: true, category: true, tags: true, publishedAt: true } satisfies Prisma.BlogPostSelect;

const byOrder = { displayOrder: "asc" } as const;

@Injectable()
export class CmsService {
  constructor(
    private prisma: PrismaService,
    private cache: PublicCacheService,
  ) {}

  // ---- Public website (cached) ----

  publicHome() {
    return this.cache.get("home", async () => {
      const [banners, announcements, programs, testimonials, events] = await Promise.all([
        this.publicBanners(),
        this.publicAnnouncements(5),
        this.programs(),
        this.testimonials(true),
        this.events(true),
      ]);
      return { banners, announcements, programs, testimonials, events };
    });
  }

  publicBanners() {
    return this.cache.get("banners", () => this.prisma.banner.findMany({ where: { active: true }, orderBy: byOrder }));
  }

  /** Active announcements within their start/end window. */
  publicAnnouncements(take?: number) {
    return this.cache.get(`announcements:${take ?? "all"}`, () => {
      const now = new Date();
      return this.prisma.announcement.findMany({
        where: { active: true, AND: [{ OR: [{ startDate: null }, { startDate: { lte: now } }] }, { OR: [{ endDate: null }, { endDate: { gte: now } }] }] },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        take,
      });
    });
  }

  programs() {
    return this.cache.get("programs", () => this.prisma.program.findMany({ where: { active: true }, orderBy: byOrder }));
  }

  program(slug: string) {
    return this.cache.get(`program:${slug}`, () => this.prisma.program.findFirst({ where: { slug, active: true } })).then(orNotFound("Program"));
  }

  facilities() {
    return this.cache.get("facilities", () => this.prisma.facility.findMany({ where: { active: true }, orderBy: byOrder }));
  }

  activities() {
    return this.cache.get("activities", () => this.prisma.activity.findMany({ where: { active: true }, orderBy: byOrder }));
  }

  activity(slug: string) {
    return this.cache.get(`activity:${slug}`, () => this.prisma.activity.findFirst({ where: { slug, active: true } })).then(orNotFound("Activity"));
  }

  testimonials(publicOnly = false) {
    if (!publicOnly) return this.prisma.testimonial.findMany({ orderBy: [{ featured: "desc" }, byOrder] });
    return this.cache.get("testimonials", () => this.prisma.testimonial.findMany({ where: { active: true }, select: PUBLIC_TESTIMONIAL, orderBy: [{ featured: "desc" }, byOrder] }));
  }

  events(publicOnly = false, when?: "upcoming" | "past") {
    const today = startOfToday();
    const window = when === "upcoming" ? { OR: [{ startDate: { gte: today } }, { endDate: { gte: today } }] } : when === "past" ? { startDate: { lt: today }, OR: [{ endDate: null }, { endDate: { lt: today } }] } : {};
    const orderBy = { startDate: when === "past" ? "desc" : "asc" } as const;
    if (!publicOnly) return this.prisma.schoolEvent.findMany({ where: window, orderBy });
    return this.cache.get(`events:${when ?? "all"}`, () => this.prisma.schoolEvent.findMany({ where: { active: true, ...window }, orderBy }));
  }

  event(slug: string) {
    return this.cache.get(`event:${slug}`, () => this.prisma.schoolEvent.findFirst({ where: { slug, active: true } })).then(orNotFound("Event"));
  }

  publicGallery() {
    return this.cache.get("gallery", () =>
      this.prisma.galleryAlbum.findMany({ where: { active: true }, include: { items: { where: { active: true }, orderBy: byOrder } }, orderBy: { title: "asc" } }),
    );
  }

  galleryAlbum(slug: string) {
    return this.cache
      .get(`gallery:${slug}`, () => this.prisma.galleryAlbum.findFirst({ where: { slug, active: true }, include: { items: { where: { active: true }, orderBy: byOrder } } }))
      .then(orNotFound("Album"));
  }

  publicBlogs(query: BlogQueryDto) {
    const search = contains(query.search);
    const where: Prisma.BlogPostWhereInput = {
      status: BlogStatus.PUBLISHED,
      OR: [{ publishedAt: null }, { publishedAt: { lte: new Date() } }],
      category: query.category ? { equals: query.category, mode: "insensitive" } : undefined,
      tags: query.tag ? { has: query.tag } : undefined,
      ...(search ? { AND: [{ OR: [{ title: search }, { excerpt: search }] }] } : {}),
    };
    const load = () =>
      paginated(query, this.prisma.blogPost.findMany({ where, select: BLOG_SUMMARY, orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }], ...pageArgs(query) }), () =>
        this.prisma.blogPost.count({ where }),
      );
    // Free-text searches are too varied to be worth caching.
    return search ? load() : this.cache.get(`blogs:${query.category ?? ""}:${query.tag ?? ""}:${query.page ?? ""}:${query.limit ?? ""}`, load);
  }

  blog(slug: string) {
    return this.cache.get(`blog:${slug}`, () => this.prisma.blogPost.findFirst({ where: { slug, status: BlogStatus.PUBLISHED } })).then(orNotFound("Post"));
  }

  publicSettings() {
    return this.cache.get("settings", async () => {
      const rows = await this.prisma.siteSetting.findMany({ where: { OR: PUBLIC_SETTING_PREFIXES.map((prefix) => ({ key: { startsWith: prefix } })) }, select: { key: true, value: true } });
      return Object.fromEntries(rows.map((row) => [row.key, row.value]));
    });
  }

  createPublicTestimonial(dto: CreatePublicTestimonialDto) {
    // Held for approval: not shown until an admin activates it, so the cache is unaffected.
    return this.prisma.testimonial.create({ data: { ...dto, active: false, featured: false }, select: { id: true } });
  }

  // ---- Admin reads (uncached, include inactive rows) ----

  announcements() {
    return this.prisma.announcement.findMany({ orderBy: [{ priority: "desc" }, { createdAt: "desc" }] });
  }

  banners() {
    return this.prisma.banner.findMany({ orderBy: byOrder });
  }

  blogs(query: BlogQueryDto) {
    const search = contains(query.search);
    const where: Prisma.BlogPostWhereInput = search ? { OR: [{ title: search }, { slug: search }, { category: search }] } : {};
    return paginated(query, this.prisma.blogPost.findMany({ where, orderBy: { createdAt: "desc" }, ...pageArgs(query) }), () => this.prisma.blogPost.count({ where }));
  }

  galleryAlbums() {
    return this.prisma.galleryAlbum.findMany({ include: { items: { orderBy: byOrder } }, orderBy: { title: "asc" } });
  }

  allPrograms() {
    return this.prisma.program.findMany({ orderBy: byOrder });
  }

  allFacilities() {
    return this.prisma.facility.findMany({ orderBy: byOrder });
  }

  allActivities() {
    return this.prisma.activity.findMany({ orderBy: byOrder });
  }

  settings() {
    return this.prisma.siteSetting.findMany({ orderBy: { key: "asc" } });
  }

  // ---- Admin writes (each clears the public cache) ----

  createAnnouncement(dto: AnnouncementDto) {
    return this.write(this.prisma.announcement.create({ data: withDates(dto, ["startDate", "endDate"]) }));
  }
  updateAnnouncement(id: string, dto: UpdateAnnouncementDto) {
    return this.write(this.prisma.announcement.update({ where: { id }, data: withDates(dto, ["startDate", "endDate"]) }));
  }
  deleteAnnouncement(id: string) {
    return this.write(this.prisma.announcement.delete({ where: { id }, select: { id: true } }));
  }

  createBanner(dto: BannerDto) {
    return this.write(this.prisma.banner.create({ data: dto }));
  }
  updateBanner(id: string, dto: UpdateBannerDto) {
    return this.write(this.prisma.banner.update({ where: { id }, data: dto }));
  }
  deleteBanner(id: string) {
    return this.write(this.prisma.banner.delete({ where: { id }, select: { id: true } }));
  }

  createBlog(dto: BlogDto) {
    const data = withDates({ ...dto, tags: dto.tags ?? [] }, ["publishedAt"]);
    if (dto.status === BlogStatus.PUBLISHED && !data.publishedAt) data.publishedAt = new Date();
    return this.write(this.prisma.blogPost.create({ data }));
  }
  async updateBlog(id: string, dto: UpdateBlogDto) {
    const data = withDates(dto, ["publishedAt"]);
    if (dto.tags === null) data.tags = [];
    // Publishing a post that was never published stamps it with the current time.
    if (dto.status === BlogStatus.PUBLISHED && !data.publishedAt) {
      const current = await this.prisma.blogPost.findUniqueOrThrow({ where: { id }, select: { publishedAt: true } });
      data.publishedAt = current.publishedAt ?? new Date();
    }
    return this.write(this.prisma.blogPost.update({ where: { id }, data }));
  }
  deleteBlog(id: string) {
    return this.write(this.prisma.blogPost.delete({ where: { id }, select: { id: true } }));
  }

  createTestimonial(dto: TestimonialDto) {
    return this.write(this.prisma.testimonial.create({ data: dto }));
  }
  updateTestimonial(id: string, dto: UpdateTestimonialDto) {
    return this.write(this.prisma.testimonial.update({ where: { id }, data: dto }));
  }
  deleteTestimonial(id: string) {
    return this.write(this.prisma.testimonial.delete({ where: { id }, select: { id: true } }));
  }

  createEvent(dto: EventDto) {
    return this.write(this.prisma.schoolEvent.create({ data: withDates(dto, ["startDate", "endDate"]) }));
  }
  updateEvent(id: string, dto: UpdateEventDto) {
    return this.write(this.prisma.schoolEvent.update({ where: { id }, data: withDates(dto, ["startDate", "endDate"]) }));
  }
  deleteEvent(id: string) {
    return this.write(this.prisma.schoolEvent.delete({ where: { id }, select: { id: true } }));
  }

  createGalleryAlbum(dto: GalleryAlbumDto) {
    return this.write(this.prisma.galleryAlbum.create({ data: dto }));
  }
  updateGalleryAlbum(id: string, dto: UpdateGalleryAlbumDto) {
    return this.write(this.prisma.galleryAlbum.update({ where: { id }, data: dto }));
  }
  deleteGalleryAlbum(id: string) {
    return this.write(this.prisma.galleryAlbum.delete({ where: { id }, select: { id: true } }));
  }

  createGalleryItem(dto: GalleryItemDto) {
    return this.write(this.prisma.galleryItem.create({ data: dto }));
  }
  updateGalleryItem(id: string, dto: UpdateGalleryItemDto) {
    return this.write(this.prisma.galleryItem.update({ where: { id }, data: dto }));
  }
  deleteGalleryItem(id: string) {
    return this.write(this.prisma.galleryItem.delete({ where: { id }, select: { id: true } }));
  }

  createProgram(dto: ProgramDto) {
    return this.write(this.prisma.program.create({ data: dto }));
  }
  updateProgram(id: string, dto: UpdateProgramDto) {
    return this.write(this.prisma.program.update({ where: { id }, data: dto }));
  }
  deleteProgram(id: string) {
    return this.write(this.prisma.program.delete({ where: { id }, select: { id: true } }));
  }

  createFacility(dto: FacilityDto) {
    return this.write(this.prisma.facility.create({ data: dto }));
  }
  updateFacility(id: string, dto: UpdateFacilityDto) {
    return this.write(this.prisma.facility.update({ where: { id }, data: dto }));
  }
  deleteFacility(id: string) {
    return this.write(this.prisma.facility.delete({ where: { id }, select: { id: true } }));
  }

  createActivity(dto: ActivityDto) {
    return this.write(this.prisma.activity.create({ data: dto }));
  }
  updateActivity(id: string, dto: UpdateActivityDto) {
    return this.write(this.prisma.activity.update({ where: { id }, data: dto }));
  }
  deleteActivity(id: string) {
    return this.write(this.prisma.activity.delete({ where: { id }, select: { id: true } }));
  }

  saveSetting(dto: SettingDto) {
    const value = dto.value as Prisma.InputJsonValue;
    return this.write(this.prisma.siteSetting.upsert({ where: { key: dto.key }, update: { value }, create: { key: dto.key, value } }));
  }
  deleteSetting(key: string) {
    return this.write(this.prisma.siteSetting.delete({ where: { key }, select: { key: true } }));
  }

  private async write<T>(operation: Promise<T>) {
    const result = await operation;
    this.cache.clear();
    return result;
  }
}

function orNotFound(label: string) {
  return <T>(row: T | null): T => {
    if (!row) throw new NotFoundException(`${label} not found`);
    return row;
  };
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}
