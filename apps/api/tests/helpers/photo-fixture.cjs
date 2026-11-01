const sharp=require('sharp');
module.exports=async function photoFixture({gps=true,date=true,offset=true,color="#9a9a9a"}={}){
 return sharp({create:{width:120,height:80,channels:3,background:color}}).jpeg().withExif({
  IFD0:{Make:'ReOwn fixture',Model:'Test camera'},
  IFD2:{...(date?{DateTimeOriginal:'2026:10:31 10:00:00'}:{}),...(offset?{OffsetTimeOriginal:'+07:00'}:{})},
  ...(gps?{IFD3:{GPSLatitudeRef:'N',GPSLatitude:'10/1 0/1 0/1',GPSLongitudeRef:'E',GPSLongitude:'106/1 0/1 0/1'}}:{}),
 }).toBuffer();
};
