import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { Role } from "../src/generated/prisma/enums.js";
import * as bcrypt from "bcrypt";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main(){
 const email=process.env.SEED_ADMIN_EMAIL || "admin@littlemahilam.local";
 const password=process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!";
 const passwordHash=await bcrypt.hash(password,12);
 await prisma.user.upsert({where:{email},update:{},create:{email,name:"Little Mahilam Super Admin",passwordHash,role:Role.SUPER_ADMIN}});
 const year=await prisma.academicYear.upsert({where:{name:"2026-2027"},update:{current:true},create:{name:"2026-2027",startDate:new Date("2026-06-01"),endDate:new Date("2027-04-30"),current:true}});
 const classes=["Play Group","Pre-KG","LKG","UKG","Grade 1","Grade 2","Grade 3"];
 for (let i=0;i<classes.length;i++){const name=classes[i];const code=name.toUpperCase().replace(/[^A-Z0-9]/g,'-');await prisma.classLevel.upsert({where:{code},update:{academicYearId:year.id},create:{name,code,displayOrder:i+1,academicYearId:year.id}});}
 for(let i=0;i<classes.length;i++){const name=classes[i];const slug=name.toLowerCase().replace(/\s+/g,'-');await prisma.program.upsert({where:{slug},update:{displayOrder:i+1},create:{name,slug,displayOrder:i+1,description:"Joyful, age-appropriate learning at Little Mahilam Preschool."}});}
 const existing=await prisma.announcement.findFirst({where:{title:"Admissions Open"}});
 if(!existing) await prisma.announcement.create({data:{title:"Admissions Open",content:"Admissions enquiry is now open for Little Mahilam Preschool.",type:"ADMISSION"}});
 console.log(`Seed complete. Login: ${email}`);
}
main().finally(()=>prisma.$disconnect());
