import assert from "node:assert/strict";
import { ValidationPipe } from "@nestjs/common";
import { CmsService } from "../../dist/cms/cms.service.js";
import { PublicCacheService } from "../../dist/common/cache/public-cache.service.js";
import { AcademicsService } from "../../dist/academics/academics.service.js";
import { StaffService } from "../../dist/staff/staff.service.js";
import { BannerDto, ProgramDto } from "../../dist/cms/dto/cms.dto.js";
export async function verifyResourcePersistence({prisma,crm,fees,actor,studentId,year,level}) {
  const cms = new CmsService(prisma,new PublicCacheService());
  const specifications = [
    ["Banner",{title:"Integration banner",active:true},"publicBanners",{title:"Updated banner",active:false}],
    ["Announcement",{title:"Integration notice",content:"Integration content",active:true},"publicAnnouncements",{title:"Updated notice",active:false}],
    ["Program",{name:"Integration program",slug:"integration-program",active:true},"programs",{name:"Updated program",active:false}],
    ["Facility",{title:"Integration facility",active:true},"facilities",{title:"Updated facility",active:false}],
    ["Activity",{name:"Integration activity",slug:"integration-activity",active:true},"activities",{name:"Updated activity",active:false}],
    ["Testimonial",{parentName:"Integration family",testimonial:"An integration-only parent review",mobile:"9876543210",email:"parent@example.test",active:true},"testimonials",{testimonial:"Updated integration-only review",active:false}],
    ["Event",{title:"Integration event",slug:"integration-event",startDate:new Date(Date.now()+86400000).toISOString(),active:true},"events",{title:"Updated event",active:false}],
  ];
  for (const [resource,input,read,update] of specifications) {
    const row=await cms["create"+resource](input);
    const publicRows=await cms[read](...(["testimonials","events"].includes(read)?[true]:[]));
    assert.ok(publicRows.some(r=>r.id===row.id),resource+" publishes");
    if(resource==="Testimonial"){const publicRow=publicRows.find(r=>r.id===row.id);assert.equal(publicRow.mobile,undefined);assert.equal(publicRow.email,undefined);}
    await cms["update"+resource](row.id,update);
    assert.ok(!(await cms[read](...(["testimonials","events"].includes(read)?[true]:[]))).some(r=>r.id===row.id),resource+" unpublishes and clears cache");
    await cms["delete"+resource](row.id);
  }
  const album=await cms.createGalleryAlbum({title:"Integration album",slug:"integration-album",active:true});
  const item=await cms.createGalleryItem({albumId:album.id,imageUrl:"/integration-only.jpg",active:true});
  assert.ok((await cms.galleryAlbum(album.slug)).items.some(i=>i.id===item.id));
  await cms.updateGalleryItem(item.id,{active:false}); assert.equal((await cms.galleryAlbum(album.slug)).items.length,0);
  await cms.deleteGalleryItem(item.id); await cms.updateGalleryAlbum(album.id,{active:false});
  assert.ok(!(await cms.publicGallery()).some(a=>a.id===album.id)); await cms.deleteGalleryAlbum(album.id);
  const blog=await cms.createBlog({title:"Integration blog",slug:"integration-blog",content:"Integration-only content",status:"DRAFT"});
  await assert.rejects(()=>cms.blog(blog.slug),/not found/); await cms.updateBlog(blog.id,{status:"PUBLISHED"});
  assert.equal((await cms.blog(blog.slug)).id,blog.id); await cms.updateBlog(blog.id,{status:"DRAFT"});
  await assert.rejects(()=>cms.blog(blog.slug),/not found/); await cms.deleteBlog(blog.id);
  await cms.saveLearningPhoto("hero-main",{imageUrl:"/integration-only.jpg",active:true});
  assert.equal((await cms.learningPhotos()).length,1); await cms.deleteLearningPhoto("hero-main");
  await cms.saveSetting({key:"school.integration",value:"Integration school"}); await cms.saveSetting({key:"private.integration",value:"private"});
  assert.equal((await cms.publicSettings())["school.integration"],"Integration school");
  assert.equal((await cms.publicSettings())["private.integration"],undefined);
  await cms.deleteSetting("school.integration"); await cms.deleteSetting("private.integration");
  const pipe=new ValidationPipe({whitelist:true,transform:true,forbidNonWhitelisted:true});
  for(const [dto,value]of [[BannerDto,{title:"x"}],[ProgramDto,{name:"",slug:""}]]) await assert.rejects(()=>pipe.transform(value,{type:"body",metatype:dto}));
  const guardian=await crm.saveGuardian(null,{name:"Second Integration Guardian",relationship:"Parent",mobile:"9876543212",consent:true,communicationPreferences:["CALL"]},actor);
  await crm.linkGuardian(guardian.id,{studentId,primary:true},actor);
  assert.equal(await prisma.studentGuardian.count({where:{studentId,primary:true}}),1);
  await crm.saveGuardian(guardian.id,{communicationPreferences:["EMAIL"],email:"guardian@example.test"},actor);
  assert.deepEqual((await crm.guardian(guardian.id)).communicationPreferences,["EMAIL"]);
  await crm.linkGuardian(guardian.id,{studentId},actor,true); await crm.archiveGuardian(guardian.id,actor);
  assert.ok((await prisma.guardian.findUnique({where:{id:guardian.id}})).archivedAt);
  const academics=new AcademicsService(prisma);
  const next=await academics.createYear({name:"2027-2028",startDate:"2027-06-01",endDate:"2028-05-31",current:true});
  assert.equal(await prisma.academicYear.count({where:{current:true}}),1);
  await academics.updateYear(year.id,{current:true}); await academics.removeYear(next.id);
  const temporaryClass=await academics.createClass({name:"Integration class",code:"TEMP",academicYearId:year.id,capacity:3});
  const section=await academics.createSection({name:"TEMP",classLevelId:temporaryClass.id,capacity:2});
  await academics.updateSection(section.id,{capacity:4}); await academics.removeSection(section.id);
  await academics.updateClass(temporaryClass.id,{capacity:4}); await academics.removeClass(temporaryClass.id);
  assert.equal((await prisma.section.findUnique({where:{id:section.id}})).active,false);
  const type=await fees.createFeeType({name:"Integration activity"});
  const structure=await fees.createFeeStructure({feeTypeId:type.id,academicYear:year.name,className:level.name,frequency:"TERM",amount:125.50});
  await fees.updateFeeStructure(structure.id,{amount:150.25});
  await fees.assignStructure(structure.id); await fees.assignStructure(structure.id);
  assert.equal(await prisma.studentFee.count({where:{studentId,feeStructureId:structure.id}}),1);
  const assigned=await prisma.studentFee.findFirst({where:{studentId,feeStructureId:structure.id}});
  await assert.rejects(()=>fees.update(assigned.id,{discount:5},actor),/reason/i);
  await fees.update(assigned.id,{discount:5,adjustmentReason:"Integration concession"},actor);
  assert.equal((await fees.detail(assigned.id)).balance.toString(),"145.25");
  await assert.rejects(()=>fees.removeFeeStructure(structure.id),/retained/);
  await assert.rejects(()=>fees.removeFeeType(type.id),/retained/);
  const unusedType=await fees.createFeeType({name:"Unused integration type"});
  const unusedStructure=await fees.createFeeStructure({feeTypeId:unusedType.id,academicYear:year.name,className:level.name,frequency:"TERM",amount:1});
  await fees.removeFeeStructure(unusedStructure.id); await fees.removeFeeType(unusedType.id);
  const template=await crm.saveTemplate(null,{name:"Integration template",channel:"EMAIL",subject:"Welcome",body:"Integration message",active:true},actor);
  await crm.saveTemplate(template.id,{active:false},actor);
  assert.equal((await prisma.messageTemplate.findUnique({where:{id:template.id}})).active,false);
  await crm.saveSettings({requiredDocuments:["BIRTH_CERTIFICATE","CHILD_PHOTO"],numberPattern:"LM-{type}-{year}-{number}",followUpDefaultDays:3},actor);
  assert.equal((await crm.settings()).followUpDefaultDays,3);
  const staffService=new StaffService(prisma);
  const staff=await staffService.create({name:"Integration CMS editor",email:"editor-integration@example.test",password:"LocalIntegrationPassword!42",role:"CMS_EDITOR"},actor);
  const persisted=await prisma.user.findUnique({where:{id:staff.id}});
  assert.ok(persisted.passwordHash.startsWith("$2b$12$"));
  await staffService.update(staff.id,{name:"Updated CMS editor"},actor); await staffService.remove(staff.id,actor);
  assert.equal((await prisma.user.findUnique({where:{id:staff.id}})).active,false);
}
