import assert from "node:assert/strict";

const windowState={};
globalThis.window={
  setTimeout,
  clearTimeout,
  dispatchEvent(){},
  ...windowState,
};
if(typeof globalThis.Event!=="function")globalThis.Event=class Event{constructor(type){this.type=type}};

class FakeCanvas{
  constructor(){this.width=0;this.height=0;}
  getContext(){return{fillStyle:"#fff",fillRect(){},drawImage(){}};}
  toBlob(callback){callback(new Blob([new Uint8Array(240_000)],{type:"image/jpeg"}));}
}
globalThis.document={createElement(name){assert.equal(name,"canvas");return new FakeCanvas();}};

let dimensions={width:4080,height:3072};
globalThis.createImageBitmap=async()=>({width:dimensions.width,height:dimensions.height,close(){}});

const requests=[];
globalThis.fetch=async(_url,options)=>{
  requests.push(options);
  return {
    ok:true,
    status:200,
    async json(){
      return {
        ok:true,
        result:{
          image:{width:Number(options.headers["x-ocr-width"]||dimensions.width),height:Number(options.headers["x-ocr-height"]||dimensions.height)},
          items:[{text:"TOTAL 12,50",score:95,poly:[[0,0],[10,0],[10,10],[0,10]]}],
          metrics:{detMs:0,recMs:120,totalMs:120,detectedBoxes:1,recognizedCount:1},
          runtime:"server-tesseract-7",
        },
      };
    },
  };
};

function jpegWithExifOrientation(orientation){
  // APP1 Exif little-endian mínimo con una única entrada IFD0 Orientation.
  return new Blob([new Uint8Array([
    0xff,0xd8,
    0xff,0xe1,0x00,0x22,
    0x45,0x78,0x69,0x66,0x00,0x00,
    0x49,0x49,0x2a,0x00,0x08,0x00,0x00,0x00,
    0x01,0x00,
    0x12,0x01,0x03,0x00,0x01,0x00,0x00,0x00,orientation,0x00,0x00,0x00,
    0x00,0x00,0x00,0x00,
    0xff,0xd9,
  ])],{type:"image/jpeg"});
}

await import(new URL(`../public/vendor/receipt-ocr-loader.mjs?test=${Date.now()}`,import.meta.url));
const engine=await window.__financialReceiptOCR.ReceiptOCR.create();

const highRes=new Blob([new Uint8Array(1_000_000)],{type:"image/jpeg"});
const highResult=(await engine.predict(highRes))[0];
const highRequest=requests.at(-1);
assert.equal(highRequest.headers["x-ocr-source-width"],"4080");
assert.equal(highRequest.headers["x-ocr-source-height"],"3072");
assert.equal(highRequest.headers["x-ocr-width"],"3400");
assert.equal(highRequest.headers["x-ocr-height"],"2560");
assert.equal(highRequest.headers["x-ocr-scaled"],"1");
assert.equal(highRequest.headers["x-ocr-orientation-flattened"],"0");
assert.notEqual(highRequest.body,highRes,"Una foto 4080x3072 no puede saltarse el escalado solo por pesar poco");
assert.equal(highResult.metrics.serverMs,120);
assert.equal(highResult.metrics.transportScaled,true);
assert.equal(highResult.metrics.orientationFlattened,false);
assert.equal(highResult.metrics.sourceWidth,4080);
assert.equal(highResult.metrics.transportWidth,3400);
assert.ok(Number.isFinite(highResult.metrics.prepareMs));
assert.ok(Number.isFinite(highResult.metrics.transportMs));
assert.ok(Number.isFinite(highResult.metrics.totalMs));
assert.equal(highResult.runtime,"server-tesseract-7");

const originalPixels=4080*3072;
const transportPixels=3400*2560;
assert.ok(transportPixels/originalPixels<0.70,"El límite de calidad debe seguir reduciendo al menos ~30% de píxeles frente al original");
assert.ok(transportPixels>2600*1958,"La entrada densa debe conservar más detalle que el antiguo límite de 2600px");

// Una imagen normal que ya tiene suficiente densidad conserva el blob original.
dimensions={width:1600,height:1200};
const small=new Blob([new Uint8Array(500_000)],{type:"image/jpeg"});
const smallResult=(await engine.predict(small))[0];
const smallRequest=requests.at(-1);
assert.equal(smallRequest.headers["x-ocr-width"],"1600");
assert.equal(smallRequest.headers["x-ocr-height"],"1200");
assert.equal(smallRequest.headers["x-ocr-scaled"],"0");
assert.equal(smallRequest.headers["x-ocr-orientation-flattened"],"0");
assert.equal(smallRequest.body,small);
assert.equal(smallResult.metrics.transportScaled,false);
assert.equal(smallResult.metrics.orientationFlattened,false);

// Un JPEG que el navegador muestra girado por EXIF no puede viajar como bytes
// directos al servidor. Se rasteriza una vez para que Tesseract reciba la misma
// orientación visual que ve el usuario, incluso si por tamaño no hacía falta escalar.
dimensions={width:1200,height:1600};
const rotatedExif=jpegWithExifOrientation(6);
const rotatedResult=(await engine.predict(rotatedExif))[0];
const rotatedRequest=requests.at(-1);
assert.equal(rotatedRequest.headers["x-ocr-width"],"1200");
assert.equal(rotatedRequest.headers["x-ocr-height"],"1600");
assert.equal(rotatedRequest.headers["x-ocr-scaled"],"0");
assert.equal(rotatedRequest.headers["x-ocr-orientation-flattened"],"1");
assert.notEqual(rotatedRequest.body,rotatedExif,"un JPEG EXIF rotado debe aplanarse antes de OCR aunque no requiera escalado");
assert.equal(rotatedResult.metrics.orientationFlattened,true);

// EXIF Orientation=1 no justifica recomprimir una imagen válida.
dimensions={width:1200,height:1600};
const uprightExif=jpegWithExifOrientation(1);
await engine.predict(uprightExif);
const uprightRequest=requests.at(-1);
assert.equal(uprightRequest.headers["x-ocr-orientation-flattened"],"0");
assert.equal(uprightRequest.body,uprightExif);

// Capturas/tickets comprimidos con lado corto insuficiente se amplían de forma
// moderada antes de la MISMA inferencia Tesseract. No se supera 2x ni 3400px.
dimensions={width:520,height:1040};
const lowRes=new Blob([new Uint8Array(280_000)],{type:"image/jpeg"});
const lowResult=(await engine.predict(lowRes))[0];
const lowRequest=requests.at(-1);
assert.equal(lowRequest.headers["x-ocr-source-width"],"520");
assert.equal(lowRequest.headers["x-ocr-source-height"],"1040");
assert.equal(lowRequest.headers["x-ocr-width"],"1000");
assert.equal(lowRequest.headers["x-ocr-height"],"2000");
assert.equal(lowRequest.headers["x-ocr-scaled"],"1");
assert.notEqual(lowRequest.body,lowRes,"una captura de 520px de ancho necesita más densidad de caracteres para Tesseract");
assert.equal(lowResult.metrics.sourceWidth,520);
assert.equal(lowResult.metrics.transportWidth,1000);
assert.equal(lowResult.metrics.transportScaled,true);

// Una imagen extremadamente pequeña no puede crecer sin límite: 2x máximo.
dimensions={width:300,height:600};
const tiny=new Blob([new Uint8Array(150_000)],{type:"image/jpeg"});
await engine.predict(tiny);
const tinyRequest=requests.at(-1);
assert.equal(tinyRequest.headers["x-ocr-width"],"600");
assert.equal(tinyRequest.headers["x-ocr-height"],"1200");
assert.equal(tinyRequest.headers["x-ocr-scaled"],"1");

// Compatibilidad: sin createImageBitmap, las imágenes directas pequeñas siguen funcionando.
globalThis.createImageBitmap=undefined;
const fallback=new Blob([new Uint8Array(400_000)],{type:"image/jpeg"});
await engine.predict(fallback);
const fallbackRequest=requests.at(-1);
assert.equal(fallbackRequest.headers["x-ocr-scaled"],"0");
assert.equal(fallbackRequest.headers["x-ocr-orientation-flattened"],"0");
assert.equal(fallbackRequest.headers["x-ocr-width"],undefined);
assert.equal(fallbackRequest.body,fallback);

console.log("OCR loader dimension tests OK · 3400px high-res, low-res limitado, EXIF aplanado y fallback legacy protegidos");