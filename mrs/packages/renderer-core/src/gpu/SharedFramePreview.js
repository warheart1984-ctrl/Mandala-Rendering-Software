export const SHARED_FRAME_MAGIC = 0x58524653;
export const SHARED_FRAME_HEADER_BYTES = 32;

export function parseSharedFrame(buffer) {
  const view=new DataView(buffer);if(view.byteLength<SHARED_FRAME_HEADER_BYTES)throw new Error("shared frame header is incomplete");
  if(view.getUint32(0,true)!==SHARED_FRAME_MAGIC||view.getUint32(4,true)!==1)throw new Error("unsupported shared frame contract");
  const width=view.getUint32(8,true),height=view.getUint32(12,true),stride=view.getUint32(16,true),frameIndex=view.getUint32(20,true),activeSlot=view.getUint32(24,true),slotBytes=view.getUint32(28,true);
  if(!width||!height||stride!==width*4||slotBytes!==stride*height||activeSlot>1)throw new Error("invalid shared frame dimensions");
  const offset=SHARED_FRAME_HEADER_BYTES+activeSlot*slotBytes;if(offset+slotBytes>view.byteLength)throw new Error("shared frame slot is incomplete");
  return {width,height,stride,frameIndex,activeSlot,pixels:new Uint8ClampedArray(buffer,offset,slotBytes)};
}

export class SharedFramePreview {
  constructor(canvas,readFrame){this.canvas=canvas;this.context=canvas.getContext("2d");this.readFrame=readFrame;this.lastFrame=-1;this.running=false;}
  async present(){const frame=parseSharedFrame(await this.readFrame());if(frame.frameIndex===this.lastFrame)return false;this.canvas.width=frame.width;this.canvas.height=frame.height;this.context.putImageData(new ImageData(frame.pixels,frame.width,frame.height),0,0);this.lastFrame=frame.frameIndex;return true;}
  start(intervalMs=16){if(this.running)return;this.running=true;const tick=async()=>{if(!this.running)return;try{await this.present();this.lastError=null;}catch(error){this.lastError=error;}finally{setTimeout(tick,intervalMs);}};void tick();}
  stop(){this.running=false;}
}
