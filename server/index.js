import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import pg from 'pg'
import crypto from 'node:crypto'
const {Pool}=pg
const app=express()
const pool=new Pool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||5432),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,ssl:process.env.DB_SSL==='true'?{rejectUnauthorized:false}:false})
const VALID=new Set(['joy','move','chill','blue','chaos','alone'])
app.use(cors()); app.use(express.json())
app.get('/api/health',async(_req,res)=>{try{await pool.query('select 1');res.json({ok:true})}catch{res.status(500).json({ok:false,error:'database unavailable'})}})
app.get('/api/vibes',async(_req,res)=>{try{
 await pool.query("delete from vibe_marks where updated_at < now() - interval '2 hours'")
 const {rows}=await pool.query("select vibe, cell_lng as lng, cell_lat as lat, count(*)::int as weight from vibe_marks where updated_at >= now() - interval '2 hours' group by vibe, cell_lng, cell_lat")
 res.json({total:rows.reduce((s,r)=>s+r.weight,0),cells:rows})
}catch{res.status(500).json({error:'database unavailable'})}})
app.put('/api/vibes/:deviceId',async(req,res)=>{try{
 const deviceId=String(req.params.deviceId||''); const {vibe,lng,lat}=req.body||{}
 if(deviceId.length<16||deviceId.length>128||!VALID.has(vibe)||!Number.isFinite(lng)||!Number.isFinite(lat)) return res.status(400).json({error:'invalid vibe submission'})
 const hashed=crypto.createHash('sha256').update(deviceId).digest('hex')
 await pool.query("insert into vibe_marks(device_id,vibe,cell_lng,cell_lat,updated_at) values($1,$2,$3,$4,now()) on conflict(device_id) do update set vibe=excluded.vibe,cell_lng=excluded.cell_lng,cell_lat=excluded.cell_lat,updated_at=now()",[hashed,vibe,lng,lat])
 res.json({ok:true})
}catch{res.status(500).json({error:'database unavailable'})}})
app.listen(Number(process.env.PORT||8787),()=>console.log('VibeMap API ready'))
