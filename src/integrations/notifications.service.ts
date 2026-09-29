import { Injectable, Logger } from "@nestjs/common";

type EnquiryNotice = { enquiryNumber:string; parentName:string; studentName:string; phone:string; whatsapp?:string|null; email?:string|null; interestedClass:string; message?:string|null };

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  status() {
    return {
      resend: { configured: Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM && process.env.ADMIN_NOTIFICATION_EMAIL) },
      whatsapp: { configured: Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ADMIN_TO && process.env.WHATSAPP_TEMPLATE_NAME) },
    };
  }

  async sendNewEnquiry(enquiry:EnquiryNotice) {
    const tasks:Promise<void>[]=[];
    if (this.status().resend.configured) tasks.push(this.sendEmail(enquiry));
    if (this.status().whatsapp.configured) tasks.push(this.sendWhatsApp(enquiry));
    const results=await Promise.allSettled(tasks);
    results.forEach(result=>{if(result.status==='rejected')this.logger.error(`Notification failed: ${result.reason instanceof Error?result.reason.message:String(result.reason)}`)});
  }

  private async sendEmail(e:EnquiryNotice) {
    const html=`<h2>New admission enquiry</h2><p><strong>${this.escape(e.enquiryNumber)}</strong></p><p>Parent: ${this.escape(e.parentName)}<br>Student: ${this.escape(e.studentName)}<br>Class: ${this.escape(e.interestedClass)}<br>Phone: ${this.escape(e.phone)}${e.email?`<br>Email: ${this.escape(e.email)}`:''}</p>${e.message?`<p>${this.escape(e.message)}</p>`:''}`;
    const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.MAIL_FROM,to:[process.env.ADMIN_NOTIFICATION_EMAIL],reply_to:e.email||undefined,subject:`New enquiry ${e.enquiryNumber} – ${e.studentName}`,html})});
    if(!response.ok)throw new Error(`Resend returned ${response.status}: ${await response.text()}`);
  }

  private async sendWhatsApp(e:EnquiryNotice) {
    const response=await fetch(`https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION||'v23.0'}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,{method:'POST',signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:process.env.WHATSAPP_ADMIN_TO,type:'template',template:{name:process.env.WHATSAPP_TEMPLATE_NAME,language:{code:process.env.WHATSAPP_TEMPLATE_LANGUAGE||'en'},components:[{type:'body',parameters:[e.enquiryNumber,e.parentName,e.studentName,e.interestedClass,e.phone].map(text=>({type:'text',text}))}]}})});
    if(!response.ok)throw new Error(`WhatsApp returned ${response.status}: ${await response.text()}`);
  }

  private escape(value:string){return value.replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]!))}
}
