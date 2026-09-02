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
assert.notEqual(highRequest.body,highRes,"Una foto 4080x3072 no puede saltarse el escalado solo por pesar poco");
assert.equal(highResult.metrics.serverMs,120);
assert.equal(highResult.metrics.transportScaled,true);
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

// Una imagen que ya está dentro del límite dimensional y de bytes conserva el blob original.
dimensions={width:1600,height:1200};
const small=new Blob([new Uint8Array(500_000)],{type:"image/jpeg"});
const smallResult=(await engine.predict(small))[0];
const smallRequest=requests.at(-1);
assert.equal(smallRequest.headers["x-ocr-width"],"1600");
assert.equal(smallRequest.headers["x-ocr-height"],"1200");
assert.equal(smallRequest.headers["x-ocr-scaled"],"0");
assert.equal(smallRequest.body,small);
assert.equal(smallResult.metrics.transportScaled,false);

// Compatibilidad: sin createImageBitmap, las imágenes directas pequeñas siguen funcionando.
globalThis.createImageBitmap=undefined;
const fallback=new Blob([new Uint8Array(400_000)],{type:"image/jpeg"});
await engine.predict(fallback);
const fallbackRequest=requests.at(-1);
assert.equal(fallbackRequest.headers["x-ocr-scaled"],"0");
assert.equal(fallbackRequest.headers["x-ocr-width"],undefined);
assert.equal(fallbackRequest.body,fallback);

console.log("OCR loader dimension tests OK · Tesseract server adapter preserves 3400px transport, small direct and legacy browser fallback");
