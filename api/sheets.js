import { isAdmin } from './_supabase.js';
export default async function handler(req,res){
  if(!isAdmin(req)) return res.status(401).json({error:'Unauthorized. Silakan login sebagai admin.'});
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  try{
    let b=req.body; if(typeof b==='string') b=JSON.parse(b);
    const bridge=process.env.GOOGLE_SHEETS_BRIDGE_URL;
    const token=process.env.GOOGLE_SHEETS_BRIDGE_TOKEN;
    if(!bridge||!token) return res.status(501).json({error:'Editor Google Sheets belum diaktifkan. Gunakan tombol Buka Google Sheet atau isi GOOGLE_SHEETS_BRIDGE_URL dan GOOGLE_SHEETS_BRIDGE_TOKEN di Vercel.'});
    const payload={token,sheetName:b.sheetName||process.env.GOOGLE_SHEETS_SHEET_NAME||'REKAPAN',rowNumber:Number(b.rowNumber),values:Array.isArray(b.values)?b.values:[]};
    if(!payload.rowNumber||!payload.values.length) return res.status(400).json({error:'rowNumber dan values wajib.'});
    const r=await fetch(bridge,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||d.ok===false) return res.status(502).json({error:d.error||'Bridge Google Sheets gagal.'});
    return res.status(200).json({success:true});
  }catch(e){return res.status(500).json({error:e.message});}
}
