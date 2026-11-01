require("reflect-metadata");
require("dotenv").config({quiet:true});
const {PrismaService}=require("../dist/prisma/prisma.service");
const {ProductStorageService}=require("../dist/storage/product-storage.service");
const prisma=new PrismaService(), storage=new ProductStorageService();
(async()=>{try{
  const rows=await prisma.productImage.findMany({where:{NOT:{objectKey:{startsWith:"r2:"}}},select:{id:true,objectKey:true}});
  console.log(`Local photos awaiting R2 migration: ${rows.length}`);
  if(!process.argv.includes("--apply")){console.log("Dry run only. Add --apply after configuring R2 to copy photos and update database references.");return;}
  let migrated=0;
  for(const row of rows){
    const bytes=await storage.read(row.objectKey);
    const key=await storage.put(row.id,bytes);
    const result=await prisma.productImage.updateMany({where:{id:row.id,objectKey:row.objectKey},data:{objectKey:key}});
    migrated+=result.count;
  }
  console.log(`Photos migrated to R2: ${migrated}. Original local files retained.`);
}catch{console.error("Image migration failed. Check R2 configuration, database connectivity and local image availability; no local originals were deleted.");process.exitCode=1;}
finally{storage.onModuleDestroy();await prisma.$disconnect();}})();
